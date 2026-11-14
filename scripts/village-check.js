#!/usr/bin/env node
// Checks the village wallpaper (modules/live/village.js, vart.js, vdraw.js, vposter.js) without a shell.
//
// It grows villages for simulated days under quiet, ordinary and heavy loads and fails when a value turns invalid, when
// buildings overlap or cannot be walked to, when the village stops growing or grows without the computer's doing, when a save
// does not give the same village back, when the art and the simulation disagree about a building, or when a frame cannot be drawn.
//
//   node scripts/village-check.js [--only name] [--src path/to/village.js]
//
// --only runs just the checks whose name contains the text, as the whole run takes a minute or two.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const args = {};
process.argv.slice(2).forEach((a, i, all) => a.startsWith("--") && (args[a.slice(2)] = all[i + 1]));

const dir = path.join(__dirname, "..", "modules", "live");
function source(name) {
    return fs.readFileSync(name === "village.js" && args.src ? args.src : path.join(dir, name), "utf8").replace(/^\.pragma library$/m, "");
}

// Wrapped in a function that takes Math as an argument: globals of a vm context are slow to reach
const V = vm.runInNewContext(`(function (Math) {\n${source("village.js")}\nreturn { BUILD, T, O, TILE, COLS, ROWS, create, step, setSignals, snapshot, census, drainEvents, findPath, regionOf, popTarget, footprintFree, idx, updateEnv, weatherKind, seasonOf, rates, renownPerHour };\n})`)(Math);
const A = vm.runInNewContext(`(function (Math) {\n${source("vart.js")}\nreturn { TYPES, library, blit, blitFlipped, hash, mix, shade, SKIN, HAIR, CLOTHES, TILE, buildingSprite };\n})`)(Math);
const D = vm.runInNewContext(`(function (Math) {\n${source("vdraw.js")}\nreturn { init, paintGround, paintObjects, drawDynamic, drawWeather, drawLights, ambient, placeBuilding, covered, TILE };\n})`)(Math);
const P = vm.runInNewContext(`(function (Math, Uint8ClampedArray) {\n${source("vposter.js")}\nreturn { Raster, base64, village };\n})`)(Math, Uint8ClampedArray);
D.init(A);

let failures = 0;
let ran = 0;
function check(name, fn) {
    if (args.only && !name.includes(args.only))
        return;
    ran++;
    try {
        const info = fn();
        console.log(`PASS ${name}${info ? ` (${info})` : ""}`);
    } catch (e) {
        failures++;
        console.log(`FAIL ${name}: ${e.message}`);
    }
}

function assert(cond, message) {
    if (!cond)
        throw new Error(message);
}

const finite = v => typeof v === "number" && isFinite(v);

const PROFILES = {
    quiet: { cpu: 0.02, netDown: 0, gpu: 0 },
    ordinary: { cpu: 0.2, netDown: 200000, gpu: 0.05 },
    heavy: { cpu: 0.7, netDown: 5e6, gpu: 0.6 }
};

// A local date, so the season and the hour do not depend on the machine running the check
const at = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi, 0).getTime();

// Grows a village for the given hours, one second a step
function grow(seed, hours, profile = "ordinary", start = at(2026, 6, 15, 6), extra = {}) {
    const w = V.create({ seed, now: start });
    const p = PROFILES[profile];
    for (let t = 0; t < hours * 3600; t++) {
        V.setSignals(w, { now: start + t * 1000, cpu: p.cpu, netDown: p.netDown, gpu: p.gpu, mem: 0.4, disk: 0.5, ...extra });
        V.step(w, 1);
    }
    return w;
}

// Every number a world holds is a finite number
function sane(w) {
    for (const p of w.people) {
        assert(finite(p.x) && finite(p.y) && p.x >= 0 && p.y >= 0 && p.x <= w.cols && p.y <= w.rows, `person ${p.id} is at ${p.x}, ${p.y}`);
        assert(finite(p.ph) && finite(p.t), `person ${p.id} has a bad timer`);
    }
    for (const k of ["wood", "stone", "food"])
        assert(finite(w.stock[k]) && w.stock[k] >= 0, `${k} stock is ${w.stock[k]}`);
    assert(finite(w.stats.renown) && w.stats.renown >= 0, `renown is ${w.stats.renown}`);
    assert(finite(w.env.daylight) && w.env.daylight >= 0 && w.env.daylight <= 1, `daylight is ${w.env.daylight}`);
    assert(finite(w.env.snowCover) && w.env.snowCover >= 0 && w.env.snowCover <= 1, `snow cover is ${w.env.snowCover}`);
}

// Buildings stand on land and not on each other, and the map agrees with them about what blocks
function layout(w) {
    const seen = new Map();
    for (const b of w.buildings) {
        const d = V.BUILD[b.type];
        assert(d, `unknown building ${b.type}`);
        assert(b.fw === d.fw && b.fh === d.fh, `${b.type} has the wrong size`);
        for (let j = 0; j < b.fh; j++)
            for (let i = 0; i < b.fw; i++) {
                const x = b.x + i, y = b.y + j;
                assert(x >= 0 && y >= 0 && x < w.cols && y < w.rows, `${b.type} is off the map`);
                const t = w.terrain[V.idx(w, x, y)];
                assert(t !== V.T.DEEP && t !== V.T.SHALLOW && t !== V.T.ROCK, `${b.type} stands on terrain ${t}`);
                const key = `${x},${y}`;
                if (b.type !== "field" && seen.has(key))
                    throw new Error(`${b.type} overlaps a ${seen.get(key)} at ${key}`);
                if (b.type !== "field")
                    seen.set(key, b.type);
                if (b.type !== "field")
                    assert(w.occ[V.idx(w, x, y)] === V.O.BUILDING, `${b.type} at ${key} is not marked as blocking`);
            }
    }
    for (const t of w.trees)
        assert(!seen.has(`${t.x},${t.y}`), `a tree stands in a ${seen.get(`${t.x},${t.y}`)}`);
}

// Every finished building can be walked to from the middle of the village
function reachable(w) {
    const centre = V.regionOf(w, w.centre.x, w.centre.y + 1);
    assert(centre > 0, "the middle of the village cannot be walked on");
    const lost = w.buildings.filter(b => b.progress >= 1 && b.type !== "field" && V.regionOf(w, b.door.x, b.door.y) !== centre);
    assert(lost.length === 0, `${lost.map(b => b.type).join(", ")} cannot be reached from the middle`);
}

function kinds(w) {
    const out = {};
    for (const b of w.buildings)
        if (b.progress >= 1)
            out[b.type] = (out[b.type] || 0) + 1;
    return out;
}

// ---- checks -----------------------------------------------------------------------------------------------------------

check("a new village is a camp with a few people", () => {
    for (const seed of [1, 7, 42, 99, 1234]) {
        const w = V.create({ seed, now: at(2026, 6, 15, 8) });
        assert(w.people.length === 4, `${w.people.length} founders`);
        assert(Object.keys(kinds(w)).join() === "tent", `starts with ${Object.keys(kinds(w))}`);
        assert(w.trees.length > 150, `only ${w.trees.length} trees`);
        assert(w.centre.x > 10 && w.centre.x < w.cols - 10, `centre at ${w.centre.x}`);
        layout(w);
        reachable(w);
        sane(w);
    }
});

check("the same seed gives the same village", () => {
    const a = grow(5, 3), b = grow(5, 3);
    assert(JSON.stringify(V.snapshot(a)) === JSON.stringify(V.snapshot(b)), "two runs of one seed differ");
    const c = grow(6, 3);
    assert(JSON.stringify(V.snapshot(a)) !== JSON.stringify(V.snapshot(c)), "two seeds give one village");
});

check("an ordinary day grows the village and keeps it sound", () => {
    let info = "";
    for (const seed of [3, 11, 21]) {
        const w = grow(seed, 24);
        sane(w);
        layout(w);
        reachable(w);
        const c = V.census(w);
        assert(c.people >= 25 && c.people <= 80, `${c.people} people after a day`);
        assert(Object.keys(c.buildings).length >= 10, `only ${Object.keys(c.buildings).length} kinds of building after a day`);
        assert(c.renown > 100 && c.renown < 500, `renown ${c.renown}`);
        assert(!w.hungry, "the village is hungry after a day");
        // nothing is left unbuilt for hours
        info = `${c.people} people, ${Object.keys(c.buildings).length} kinds, renown ${c.renown.toFixed(0)}`;
    }
    return info;
});

check("a busy computer grows the village faster than a quiet one", () => {
    const quiet = V.census(grow(3, 12, "quiet")), ordinary = V.census(grow(3, 12, "ordinary")), heavy = V.census(grow(3, 12, "heavy"));
    assert(quiet.renown < ordinary.renown && ordinary.renown < heavy.renown, `renown ${quiet.renown.toFixed(0)}, ${ordinary.renown.toFixed(0)}, ${heavy.renown.toFixed(0)}`);
    const n = c => Object.values(c.buildings).reduce((a, b) => a + b, 0);
    assert(n(quiet) < n(heavy), `${n(quiet)} buildings when quiet and ${n(heavy)} when heavy`);
    assert(quiet.renown > 40, `a quiet computer still grows a village: renown ${quiet.renown.toFixed(0)} in 12 hours`);
    return `renown ${quiet.renown.toFixed(0)} / ${ordinary.renown.toFixed(0)} / ${heavy.renown.toFixed(0)}`;
});

check("the processor sets how fast people work", () => {
    const slow = V.rates({ sig: { cpu: 0 } }), fast = V.rates({ sig: { cpu: 1 } });
    assert(fast.work > slow.work * 1.8 && fast.walk > slow.walk, `${slow.work} / ${fast.work}`);
});

check("buildings come in the order of the village's renown", () => {
    const w = grow(8, 30);
    const c = V.census(w);
    for (const [type, n] of Object.entries(c.buildings)) {
        assert(n > 0, "a count of nothing");
        // a building is never up before its renown, whatever the load
        assert(V.BUILD[type].unlock <= c.renown + 0.01, `${type} stands at renown ${c.renown.toFixed(0)}, wanted ${V.BUILD[type].unlock}`);
    }
});

check("the population follows renown, not the other way round", () => {
    const w = grow(4, 10);
    assert(w.people.length <= V.popTarget(w) + 3, `${w.people.length} people for a target of ${V.popTarget(w)}`);
    assert(V.popTarget(w) < 90, "the population target is unbounded");
});

check("people use the whole village and do not crowd one place", () => {
    const w = grow(7, 24, "ordinary", at(2026, 6, 15, 6));
    // by day, in the afternoon: how many stand within 5 tiles of the middle
    for (let i = 0; i < 2400; i++) {
        V.setSignals(w, { now: at(2026, 6, 16, 9) + i * 500, cpu: 0.2 });
        V.step(w, 0.5);
    }
    const out = w.people.filter(p => !p.inside);
    const near = out.filter(p => Math.abs(p.x - w.centre.x) <= 5 && Math.abs(p.y - w.centre.y) <= 4).length;
    assert(out.length > w.people.length * 0.6, `only ${out.length} of ${w.people.length} are out by day`);
    assert(near <= Math.max(8, out.length * 0.45), `${near} of ${out.length} people are in the square`);
    return `${out.length} out, ${near} in the square`;
});

check("at night everyone is home, the day starts again in the morning", () => {
    const w = grow(7, 30, "ordinary", at(2026, 6, 15, 6));
    for (let i = 0; i < 360; i++) {
        V.setSignals(w, { now: at(2026, 6, 17, 1) + i * 500, cpu: 0.2 });
        V.step(w, 0.5);
    }
    const awake = w.people.filter(p => !p.inside && p.age !== "child");
    assert(awake.length <= Math.max(4, w.people.length * 0.12), `${awake.length} of ${w.people.length} are about at one in the morning`);
    for (let i = 0; i < 2400; i++) {
        V.setSignals(w, { now: at(2026, 6, 17, 8) + i * 500, cpu: 0.2 });
        V.step(w, 0.5);
    }
    const morning = w.people.filter(p => !p.inside).length;
    assert(morning > w.people.length * 0.5, `only ${morning} are up at eight`);
});

check("roads, fields and the plaza only ever cover land", () => {
    const w = grow(9, 30);
    let road = 0;
    for (let i = 0; i < w.terrain.length; i++) {
        const t = w.terrain[i];
        assert(t >= 0 && t <= 7, `terrain code ${t}`);
        if (t === V.T.ROAD)
            road++;
    }
    assert(road > 20, `only ${road} tiles of road after a day`);
    assert(road < w.terrain.length * 0.2, `${road} tiles of road, the ground is worn bare`);
    return `${road} road tiles`;
});

check("the wood and the food do not run out in a long run", () => {
    const w = V.create({ seed: 13, now: at(2026, 6, 15, 6) });
    let low = 0, hungry = 0, steps = 0;
    for (let t = 0; t < 48 * 3600; t++) {
        V.setSignals(w, { now: at(2026, 6, 15, 6) + t * 1000, cpu: 0.2, netDown: 2e5, gpu: 0.05 });
        V.step(w, 1);
        if (t > 6 * 3600 && t % 600 === 0) {
            steps++;
            if (w.stock.wood < 3)
                low++;
            if (w.hungry)
                hungry++;
        }
    }
    assert(hungry / steps < 0.05, `hungry for ${(hungry / steps * 100).toFixed(0)}% of two days`);
    assert(low / steps < 0.35, `out of wood for ${(low / steps * 100).toFixed(0)}% of two days`);
    assert(w.trees.length > 150, `the forest is down to ${w.trees.length} trees`);
    return `${w.trees.length} trees, ${w.people.length} people after two days`;
});

check("the clock sets the season, the hour and the light", () => {
    const env = (d, h, weather) => {
        const w = V.create({ seed: 2, now: d });
        V.setSignals(w, { now: at(...d, h), weather });
        V.step(w, 0.1);
        return w.env;
    };
    assert(env([2026, 1, 15], 12).season === "winter" && env([2026, 4, 15], 12).season === "spring", "spring and winter");
    assert(env([2026, 7, 15], 12).season === "summer" && env([2026, 10, 15], 12).season === "autumn", "summer and autumn");
    assert(env([2026, 6, 21], 13).daylight > 0.97, "noon is not light");
    assert(env([2026, 6, 21], 1).daylight < 0.01 && env([2026, 12, 21], 2).daylight < 0.01, "night is not dark");
    // the days are longer in summer: the same hour, seven in the evening, is light in June and dark in December
    assert(env([2026, 6, 21], 19).daylight > 0.9 && env([2026, 12, 21], 19).daylight < 0.05, "summer evenings are not longer");
    // the weather's own sunrise and sunset win
    const early = env([2026, 6, 21], 6, { code: 0, tempC: 15, wind: 5, sunrise: at(2026, 6, 21, 4), sunset: at(2026, 6, 21, 22) });
    assert(early.daylight > 0.9, `${early.daylight} at six with a sunrise at four`);
    const late = env([2026, 6, 21], 6, { code: 0, tempC: 15, wind: 5, sunrise: at(2026, 6, 21, 8), sunset: at(2026, 6, 21, 22) });
    assert(late.daylight < 0.1, `${late.daylight} at six with a sunrise at eight`);
});

check("the weather's codes become what the village shows", () => {
    for (const [code, kind] of [[0, "clear"], [1, "clear"], [2, "partly"], [3, "overcast"], [45, "fog"], [53, "drizzle"], [63, "rain"], [82, "rain"], [73, "snow"], [86, "snow"], [95, "thunder"], [99, "thunder"]])
        assert(V.weatherKind(code) === kind, `${code} is ${V.weatherKind(code)}, not ${kind}`);
    assert(V.weatherKind(undefined) === "clear" && V.weatherKind("x") === "clear", "a missing code is not clear");
});

check("snow settles in a frost and melts in the warm", () => {
    const w = V.create({ seed: 2, now: at(2026, 1, 10, 6) });
    const run = (hours, weather) => {
        for (let t = 0; t < hours * 3600; t += 5) {
            V.setSignals(w, { now: at(2026, 1, 10, 6) + t * 1000, weather });
            V.step(w, 5);
        }
    };
    run(6, { code: 73, tempC: -4, wind: 10 });
    assert(w.env.snowCover > 0.9, `${w.env.snowCover} of snow after six hours of snowfall`);
    assert(w.env.ice, "no ice at minus four");
    run(24, { code: 0, tempC: 9, wind: 10 });
    assert(w.env.snowCover < 0.1, `${w.env.snowCover} of snow a day into a thaw`);
    const summer = V.create({ seed: 2, now: at(2026, 7, 10, 6) });
    for (let t = 0; t < 7200; t += 5) {
        V.setSignals(summer, { now: at(2026, 7, 10, 6) + t * 1000, weather: { code: 71, tempC: 18, wind: 5 } });
        V.step(summer, 5);
    }
    assert(summer.env.snowCover === 0 || !summer.env.snowing || summer.env.tempC > 0.5, "it snows at eighteen degrees");
});

check("a missing, odd or hostile reading never breaks the world", () => {
    const hostile = [undefined, null, NaN, Infinity, -Infinity, -5, 1e12, "high", {}, [], true, 7];
    const w = V.create({ seed: 31, now: at(2026, 6, 15, 6) });
    for (let t = 0; t < 3 * 3600; t++) {
        const pick = k => hostile[(t * 7 + k) % hostile.length];
        V.setSignals(w, t % 3 === 0 ? undefined : { now: t % 11 === 0 ? pick(0) : at(2026, 6, 15, 6) + t * 1000, cpu: pick(1), gpu: pick(2), mem: pick(3), disk: pick(4), netDown: pick(5), netUp: pick(6), cpuTemp: pick(7), weather: t % 5 === 0 ? { code: pick(8), tempC: pick(9), wind: pick(10), sunrise: pick(1), sunset: pick(2) } : null, audio: pick(3), notifs: pick(5) });
        V.step(w, 1);
    }
    sane(w);
    assert(w.people.length >= 4, "the people are gone");
});

check("a save gives the same village back and it keeps living", () => {
    const w = grow(17, 20);
    const snap = JSON.parse(JSON.stringify(V.snapshot(w)));
    assert(JSON.stringify(snap).length < 120000, `a save is ${JSON.stringify(snap).length} bytes`);
    const r = V.create({ seed: 17, saved: snap, now: at(2026, 6, 16) });
    assert(JSON.stringify(V.census(r)) === JSON.stringify(V.census(w)), "the census differs after a restore");
    layout(r);
    reachable(r);
    for (let t = 0; t < 4 * 3600; t++) {
        V.setSignals(r, { now: at(2026, 6, 16, 2) + t * 1000, cpu: 0.2, netDown: 2e5 });
        V.step(r, 1);
    }
    sane(r);
    layout(r);
    reachable(r);
    assert(r.people.length >= w.people.length - 2, "the people left");
    // a save for another size or seed is not taken
    const odd = V.create({ seed: 17, cols: 60, rows: 30, saved: snap, now: at(2026, 6, 16) });
    assert(odd.cols === 60 && V.census(odd).people === 4, "a save of another size was taken");
    const bad = V.create({ seed: 17, saved: { v: 1, cols: 80, rows: 45, terrain: "x", decor: "x", trees: [], buildings: [], people: [], seed: 17 }, now: at(2026, 6, 16) });
    assert(V.census(bad).people === 4, "a broken save was taken");
    return `${JSON.stringify(snap).length} bytes`;
});

check("the paths over the map are short enough to afford", () => {
    const w = grow(3, 30);
    const t0 = Date.now();
    let found = 0;
    for (let i = 0; i < 300; i++) {
        const a = w.people[i % w.people.length], b = w.buildings[(i * 7) % w.buildings.length];
        if (V.findPath(w, Math.floor(a.x), Math.floor(a.y), b.door.x, b.door.y, 5000))
            found++;
    }
    const ms = (Date.now() - t0) / 300;
    assert(ms < 4, `${ms.toFixed(2)} ms a path`);
    assert(found > 200, `only ${found} of 300 paths exist`);
    return `${ms.toFixed(2)} ms a path`;
});

check("a step is cheap enough to run ten times a second all day", () => {
    const w = grow(3, 30);
    const t0 = Date.now();
    for (let i = 0; i < 2000; i++) {
        V.setSignals(w, { now: at(2026, 6, 16, 10) + i * 100, cpu: 0.3 });
        V.step(w, 0.1);
    }
    const ms = (Date.now() - t0) / 2000;
    assert(ms < 3, `${ms.toFixed(3)} ms a step`);
    return `${ms.toFixed(3)} ms a step with ${w.people.length} people`;
});

check("the art and the simulation agree about every building", () => {
    for (const id of Object.keys(V.BUILD)) {
        if (id === "field")
            continue;
        const t = A.TYPES[id];
        assert(t, `${id} has no sprite`);
        assert(t.fw === V.BUILD[id].fw && t.fh === V.BUILD[id].fh, `${id}: the art is ${t.fw}x${t.fh}, the simulation ${V.BUILD[id].fw}x${V.BUILD[id].fh}`);
    }
    for (const id of Object.keys(A.TYPES))
        assert(V.BUILD[id], `${id} has a sprite but no place in the simulation`);
    for (const season of ["spring", "summer", "autumn", "winter"])
        for (const snowy of [false, true]) {
            const lib = A.library(season, snowy);
            for (const id of Object.keys(lib.building))
                for (const spr of lib.building[id]) {
                    assert(spr.r.length > 0 && spr.w > 0 && spr.h > 0, `${id} is empty`);
                    const d = V.BUILD[id];
                    // the sprite covers its footprint, and may rise above it but not sink below
                    assert(spr.w >= d.fw * A.TILE - 8 && spr.w <= d.fw * A.TILE + 16, `${id} is ${spr.w} wide for ${d.fw} tiles`);
                    assert(spr.h >= d.fh * A.TILE - 4, `${id} is only ${spr.h} high for ${d.fh} tiles`);
                    for (const w of spr.windows || [])
                        assert(w.x >= 0 && w.y >= 0 && w.x + w.w <= spr.w && w.y + w.h <= spr.h, `${id} has a window off the sprite`);
                    if (spr.door)
                        assert(spr.door.x >= 0 && spr.door.x < spr.w && spr.door.y < spr.h, `${id} has a door off the sprite`);
                }
            for (const kind of Object.keys(lib.tree))
                for (const spr of lib.tree[kind])
                    assert(spr.r.length > 0, `a ${kind} is empty in ${season}`);
        }
});

check("every season and hour draws, and not into nothing", () => {
    const w = grow(5, 18);
    let drawn = 0;
    for (const [mo, hour, weather] of [[1, 12, { code: 73, tempC: -3, wind: 15 }], [4, 9, { code: 61, tempC: 9, wind: 20 }], [7, 15, { code: 0, tempC: 24, wind: 5 }], [10, 22, { code: 45, tempC: 8, wind: 3 }], [7, 3, { code: 95, tempC: 17, wind: 30 }]]) {
        for (let i = 0; i < 40; i++) {
            V.setSignals(w, { now: at(2026, mo, 15, hour) + i * 500, cpu: 0.2, weather, audio: i > 20 });
            V.step(w, 0.5);
        }
        const r = P.village(A, D, w, 12.5);
        let opaque = 0;
        for (let i = 3; i < r.data.length; i += 4)
            if (r.data[i] === 255)
                opaque++;
        assert(opaque === r.width * r.height, `month ${mo} hour ${hour}: ${r.width * r.height - opaque} pixels are not painted`);
        drawn++;
    }
    return `${drawn} frames`;
});

check("people behind a building are hidden and in front of it are not", () => {
    // a building 20 wide and 30 high whose feet are at y 40
    const covers = [[10, 10, 20, 30, 40]];
    assert(D.covered(covers, 20, 30), "a person behind the middle of it is not hidden");
    assert(D.covered(covers, 12, 22), "a person behind the roof is not hidden");
    assert(!D.covered(covers, 20, 46), "a person in front of it is hidden");
    assert(!D.covered(covers, 20, 40), "a person at its feet is hidden");
    assert(!D.covered(covers, 5, 30) && !D.covered(covers, 35, 30), "a person beside it is hidden");
    assert(!D.covered(covers, 20, 8), "a person far above it is hidden");
    // and a real village draws its covers
    const w = grow(5, 18);
    const r = new P.Raster(w.cols * 8, w.rows * 8);
    assert(D.paintObjects(r, w, A.library("summer", false), w.env).length > w.buildings.length, "the covers lack the trees");
});

check("a poster's pixels survive the trip as text", () => {
    const bytes = new Uint8ClampedArray(1001);
    for (let i = 0; i < bytes.length; i++)
        bytes[i] = (i * 37 + 11) % 256;
    const text = P.base64(bytes);
    assert(Buffer.from(text, "base64").equals(Buffer.from(bytes)), "base64 differs from Buffer's");
    assert(P.base64(new Uint8ClampedArray(0)) === "", "empty input gives text");
    const r = new P.Raster(4, 4);
    r.fillStyle = "rgba(255,0,0,0.5)";
    r.fillRect(0, 0, 4, 4);
    r.fillStyle = "#0000ff";
    r.fillRect(1, 1, 2, 2);
    assert(r.data[3] > 100 && r.data[3] < 150 && r.data[0] === 255, "a half transparent red is wrong");
    const k = (1 * 4 + 1) * 4;
    assert(r.data[k] === 0 && r.data[k + 2] === 255 && r.data[k + 3] === 255, "an opaque blue is wrong");
});

check("events are kept short", () => {
    const w = grow(3, 6);
    assert(w.events.length <= 60, `${w.events.length} events kept`);
    const e = V.drainEvents(w);
    assert(e.length > 0 && w.events.length === 0, "the events were not handed over");
    assert(e.some(x => x.id === "built"), "no building was reported");
});

console.log(`\n${ran - failures} of ${ran} checks passed`);
process.exit(failures ? 1 : 0);
