#!/usr/bin/env node
// Checks the lock screen ecosystem simulation (modules/lock/ecosystem.js) without a shell.
//
// It runs worlds for tens of thousands of steps and fails when a value turns invalid, when a world has no water or no
// land, when the land dies out under constant lightning or stays a desert, or when a signal does not do what it says.
//
//   node scripts/ecosystem-check.js [--salt 0] [--src path/to/ecosystem.js] [--only name]
//
// --salt moves every random seed (the world seeds and the generator behind them), so a different run catches checks
// that only pass for a lucky seed. --only runs just the checks whose name contains the text, as the whole run is slow.
//
// It also covers modules/lock/ecosignals.js, which turns system readings into the inputs of a world.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const args = {};
process.argv.slice(2).forEach((a, i, all) => a.startsWith("--") && (args[a.slice(2)] = all[i + 1]));
const salt = +(args.salt ?? 0);

const source = fs.readFileSync(args.src ?? path.join(__dirname, "../modules/lock/ecosystem.js"), "utf8").replace(/^\.pragma library$/m, "");
// Wrapped in a function that takes Math as an argument: globals of a vm context are slow to reach, and without this the
// check takes minutes and reports a step cost several times what the shell sees
const signalSource = fs.readFileSync(path.join(__dirname, "../modules/lock/ecosignals.js"), "utf8").replace(/^\.pragma library$/m, "");
const S = vm.runInNewContext(`(function (Math) {\n${signalSource}\nreturn { rain, lightning, springCount, islands, groves, hashString, seedFor, worldKey, smooth, pruneWorlds };\n})`)(Math);
const E = vm.runInNewContext(`(function (Math) {\n${source}\nreturn { T, SPECIES, create, setSignals, step, snapshot, census, drainEvents };\n})`)(Math);

function mulberry32(a) {
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

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

const near = (a, b, tolerance = 1e-9) => Math.abs(a - b) <= tolerance;

// A world with its own generator, so every check is repeatable
function make(over = {}) {
    const opts = Object.assign({ cols: 107, seed: 1 }, over);
    opts.seed += salt;
    opts.rng = opts.rng ?? mulberry32(opts.seed);
    return E.create(opts);
}

function run(world, steps) {
    for (let i = 0; i < steps; i++)
        E.step(world);
}

// These checks are about the land or put their own animals in, so nothing else may eat, breed or arrive
function landOnly(world) {
    for (const k of E.SPECIES)
        world.animals[k].length = 0;
    world.rules.respawn = false;
    return world;
}

const T = E.T;
const living = t => t === T.GRASS || t === T.FOREST;
const centre = w => Math.floor(w.rows / 2) * w.cols + Math.floor(w.cols / 2);
const cellOf = (w, x, y) => Math.floor(y) * w.cols + Math.floor(x);
const typeKey = w => JSON.stringify(Array.from(w.type));

// Animals are plain records, so a check can put one exactly where it needs it. x and y are cell coordinates.
function put(world, species, x, y, over = {}) {
    const a = Object.assign({ x, y, vx: 0, vy: 0, e: 1, th: 0, h: 0.1, g: 0, dead: false }, over);
    world.animals[species].push(a);
    return a;
}

// The first cell of the given type whose neighbours within reach cells are of that type too, and that passes test
function interior(world, type, test = () => true, reach = 1) {
    for (let y = reach; y < world.rows - reach; y++)
        for (let x = reach; x < world.cols - reach; x++) {
            let all = true;
            for (let dy = -reach; dy <= reach; dy++)
                for (let dx = -reach; dx <= reach; dx++)
                    all = all && world.type[cellOf(world, x + dx, y + dy)] === type;
            if (all && test(cellOf(world, x, y)))
                return { x, y, p: cellOf(world, x, y) };
        }
    throw new Error(`no interior cell of type ${type}`);
}

const events = (world, id) => E.drainEvents(world).filter(e => e.id === id);

check("same seed and rng give the same world", () => {
    const a = make();
    const b = make();
    run(a, 2000);
    run(b, 2000);
    assert(JSON.stringify(E.snapshot(a)) === JSON.stringify(E.snapshot(b)), "snapshots differ");
    assert(typeKey(a) === typeKey(b), "terrain types differ");
});

check("every grid has water and land", () => {
    for (let seed = 1; seed <= 40; seed++) {
        for (const cols of [20, 80, 107, 144, 200]) {
            const w = E.create({ cols, seed: seed + salt, rng: mulberry32(seed + salt) });
            const cells = w.cols * w.rows;
            const land = E.census(w).land / cells;
            assert(land >= 0.15 && land <= 0.9, `seed ${seed}, ${cols} columns: land is ${(land * 100).toFixed(1)}%`);
            let water = 0;
            for (let p = 0; p < cells; p++)
                if (w.type[p] <= T.SHALLOW)
                    water++;
            assert(water >= 0.1 * cells, `seed ${seed}, ${cols} columns: water is ${((water / cells) * 100).toFixed(1)}%`);
        }
    }
});

check("bumps raise terrain", () => {
    const plain = make();
    const bumped = make({ bumps: [{ x: 0.5, y: 0.5, height: 0.3, radius: 0.2 }] });
    assert(plain.seed === bumped.seed, "the two worlds ended on different seeds, the comparison means nothing");
    const c = centre(plain);
    const before = E.snapshot(plain).elev[c];
    const after = E.snapshot(bumped).elev[c];
    assert(after > before, `centre elevation ${after} is not above ${before}`);
});

check("saved fertility round trips", () => {
    const w = make();
    run(w, 300);
    const saved = E.snapshot(w);
    const loaded = make({ seed: w.seed - salt, saved });
    // The arrays hold 32 bit floats, so the saved numbers come back as the nearest float
    for (let p = 0; p < saved.fert.length; p++) {
        assert(loaded.fert[p] === Math.fround(saved.fert[p]), `fert differs at cell ${p}`);
        assert(loaded.elev[p] === Math.fround(saved.elev[p]), `elev differs at cell ${p}`);
    }
    assert(JSON.stringify(E.snapshot(loaded)) === JSON.stringify(saved), "a second snapshot differs from the first");

    const ignored = make({ saved: { fert: [1, 2], elev: [1] } });
    const fresh = make();
    assert(JSON.stringify(E.snapshot(ignored)) === JSON.stringify(E.snapshot(fresh)), "a malformed save changed the world");
});

const CAPS = { sheep: 200, fish: 160, bird: 100, shark: 4, wolf: 4, hawk: 4 };

check("values stay valid", () => {
    const notes = [];
    for (const rain of [0.2, 0.8, 1.4]) {
        const w = make();
        E.setSignals(w, { rain });
        const audit = at => {
            for (let p = 0; p < w.type.length; p++) {
                assert(w.type[p] <= T.FIRE, `rain ${rain}, step ${at}: type ${w.type[p]} at cell ${p}`);
                for (const name of ["bio", "fert", "worm", "plank"])
                    assert(Number.isFinite(w[name][p]), `rain ${rain}, step ${at}: ${name} is ${w[name][p]} at cell ${p}`);
            }
            for (const k of E.SPECIES) {
                assert(w.animals[k].length <= CAPS[k], `rain ${rain}, step ${at}: ${w.animals[k].length} ${k}, cap ${CAPS[k]}`);
                for (const a of w.animals[k])
                    for (const field of ["x", "y", "vx", "vy", "e", "th", "h", "g"])
                        assert(Number.isFinite(a[field]), `rain ${rain}, step ${at}: a ${k} has ${field} ${a[field]}`);
            }
        };
        // The longest run of steps in which a species has no member, and how often birds sit at their cap
        const absent = { sheep: 0, fish: 0, bird: 0, shark: 0, wolf: 0, hawk: 0 };
        const longest = Object.assign({}, absent);
        let capped = 0;
        for (let i = 1; i <= 30000; i++) {
            E.step(w);
            for (const k of E.SPECIES) {
                absent[k] = w.animals[k].length ? 0 : absent[k] + 1;
                longest[k] = Math.max(longest[k], absent[k]);
            }
            capped += w.animals.bird.length >= CAPS.bird;
            if (i % 500 === 0)
                audit(i);
        }
        audit(30000);
        for (const k of E.SPECIES)
            assert(longest[k] <= 500, `rain ${rain}: no ${k} for ${longest[k]} steps in a row`);
        notes.push(`rain ${rain}: birds at cap ${((capped / 30000) * 100).toFixed(0)}%`);
    }
    return notes.join(", ");
});

check("birds live on berries and worms", () => {
    // Food sets the birds, not the cap: in three worlds they must leave it half the time at rain 0.8, and the worms
    // under the soil must be a real part of the diet
    const notes = [];
    for (const seed of [1, 2, 3]) {
        const w = make({ seed });
        E.setSignals(w, { rain: 0.8 });
        let capped = 0;
        for (let i = 0; i < 20000; i++) {
            E.step(w);
            capped += w.animals.bird.length >= CAPS.bird;
        }
        const share = w.eaten.worms / (w.eaten.worms + w.eaten.berries);
        assert(capped / 20000 < 0.5, `seed ${seed}: the birds sat at their cap in ${((capped / 20000) * 100).toFixed(0)}% of the steps`);
        assert(share >= 0.2, `seed ${seed}: worms were ${(share * 100).toFixed(0)}% of what the birds ate`);
        notes.push(`seed ${seed}: cap ${((capped / 20000) * 100).toFixed(0)}%, worms ${(share * 100).toFixed(0)}%`);
    }
    return notes.join(", ");
});

check("worms live only in living soil", () => {
    const w = landOnly(make());
    E.setSignals(w, { rain: 0.8 });
    const audit = at => {
        for (let p = 0; p < w.type.length; p++)
            assert(living(w.type[p]) || w.worm[p] === 0, `step ${at}: worm ${w.worm[p]} on type ${w.type[p]} at cell ${p}`);
    };
    for (let i = 1; i <= 20000; i++) {
        E.step(w);
        if (i % 250 === 0)
            audit(i);
    }
    audit(20000);
    let sum = 0;
    let n = 0;
    for (let p = 0; p < w.type.length; p++)
        if (living(w.type[p])) {
            sum += w.worm[p];
            n++;
        }
    assert(n > 0, "no grass or forest left");
    assert(sum / n > 0.05, `mean worm on living soil is ${(sum / n).toFixed(3)}`);
    return `mean worm ${(sum / n).toFixed(2)}`;
});

check("trees bear berries", () => {
    const w = landOnly(make());
    E.setSignals(w, { rain: 0.8 });
    const forest = () => {
        let sum = 0;
        let n = 0;
        for (let p = 0; p < w.type.length; p++)
            if (w.type[p] === T.FOREST) {
                assert(w.bio[p] <= 1, `berries ${w.bio[p]} above 1 at cell ${p}`);
                sum += w.bio[p];
                n++;
            }
        return { n, mean: n ? sum / n : 0 };
    };
    assert(forest().n > 0, "this world has no forest");
    for (let i = 1; i <= 2000; i++) {
        E.step(w);
        if (i % 100 === 0)
            forest();
    }
    const f = forest();
    assert(f.n > 0, "the forest is gone");
    assert(f.mean > 0.3, `mean berries ${f.mean.toFixed(3)}`);
    return `mean berries ${f.mean.toFixed(2)}`;
});

check("no lightning means no fire", () => {
    const w = make();
    const burnt = new Set();
    for (let p = 0; p < w.type.length; p++)
        if (w.type[p] === T.ASH || w.type[p] === T.FIRE)
            burnt.add(p);
    E.setSignals(w, { lightning: 0 });
    for (let i = 1; i <= 5000; i++) {
        E.step(w);
        if (i % 50 === 0)
            for (let p = 0; p < w.type.length; p++)
                assert(w.type[p] < T.ASH || burnt.has(p), `step ${i}: cell ${p} is ${w.type[p] === T.ASH ? "ash" : "burning"}`);
    }
    assert(!E.drainEvents(w).some(e => e.id === "lightning"), "a lightning event was reported");
});

check("constant lightning leaves a living land", () => {
    const w = make();
    E.setSignals(w, { lightning: 1 });
    assert(w.signals.lightning === 0.55, `lightning is ${w.signals.lightning}, not clamped to 0.55`);
    let strikes = 0;
    for (let i = 1; i <= 20000; i++) {
        E.step(w);
        if (i % 50 === 0)
            strikes += E.drainEvents(w).filter(e => e.id === "lightning").length;
    }
    const c = E.census(w);
    assert(strikes > 0, "lightning never reported a fire");
    assert(c.grass + c.forest >= 0.1, `grass and forest are ${((c.grass + c.forest) * 100).toFixed(1)}% of the land`);
    return `grass and forest ${((c.grass + c.forest) * 100).toFixed(0)}%, ${strikes} reports`;
});

check("a drought is capped", () => {
    const w = make();
    E.setSignals(w, { rain: 0.1 });
    let peak = 0;
    let peakLate = 0;
    let on = false;
    for (let i = 1; i <= 20000; i++) {
        E.step(w);
        if (i % 10 === 0) {
            const d = E.census(w).desert;
            peak = Math.max(peak, d);
            if (i > 2000)
                peakLate = Math.max(peakLate, d);
        }
        if (i % 50 === 0)
            on = E.drainEvents(w).some(e => e.id === "monsoon_on") || on;
    }
    assert(peakLate <= 0.85, `desert reached ${(peakLate * 100).toFixed(1)}% after step 2000`);
    assert(peak <= 0.55 || on, `desert passed 55% (${(peak * 100).toFixed(1)}%) but no monsoon_on event came`);
    return `desert peak ${(peak * 100).toFixed(0)}%, monsoon ${on ? "came" : "not needed"}`;
});

check("mercy rains start and end", () => {
    // Without animals a drought alone rarely gets that far, so the land is turned to desert by hand
    const w = landOnly(make());
    let n = 0;
    for (let p = 0; p < w.type.length; p++)
        if (living(w.type[p]) && n++ % 10 < 7)
            w.type[p] = T.DESERT;
    E.setSignals(w, { rain: 0.1 });
    const seen = [];
    for (let i = 1; i <= 2000; i++) {
        E.step(w);
        if (i % 50 === 0)
            seen.push(...E.drainEvents(w).map(e => e.id));
    }
    assert(seen.includes("monsoon_on"), "no monsoon_on event");
    assert(seen.includes("monsoon_off"), "no monsoon_off event");
    assert(seen.indexOf("monsoon_on") < seen.indexOf("monsoon_off"), "the rains ended before they began");
});

check("islands rise gradually and sink again", () => {
    const w = make({ rules: { erosion: false, tide: false } });
    const bump = { x: 0.5, y: 0.5, height: 0.3, radius: 0.2 };
    const c = centre(w);
    const level = () => w.elev[c] + w.lift[c];
    const start = level();
    E.setSignals(w, { islands: [bump] });
    run(w, 200);
    const early = level() - start;
    assert(early > 0 && early < bump.height, `after 200 steps the centre has risen by ${early}`);
    run(w, 4800);
    const risen = level() - start;
    assert(near(risen, bump.height, 0.1 * bump.height), `after 5000 steps the centre has risen by ${risen}, not about ${bump.height}`);
    // The saved terrain must not carry the island, or a loaded world counts it twice
    assert(near(E.snapshot(w).elev[c], start, 5e-4), "the snapshot holds the lift");
    E.setSignals(w, { islands: [] });
    run(w, 5000);
    const back = level() - start;
    assert(near(back, 0, 0.1 * bump.height), `after the island vanished the centre is still ${back} above the start`);
});

check("springs follow the signal", () => {
    const w = make();
    E.setSignals(w, { springs: 12 });
    assert(w.springs.length === 8, `12 requested, ${w.springs.length} active`);
    E.setSignals(w, { springs: 5 });
    assert(w.springs.length === 5, `5 requested, ${w.springs.length} active`);
    E.setSignals(w, { springs: 0 });
    assert(w.springs.length === 0, `0 requested, ${w.springs.length} active`);
});

check("groves become forest on land", () => {
    // Search for a world whose middle is water, so that the grove has to move to the shore
    let w;
    for (let seed = 1; seed < 200; seed++) {
        w = make({ seed });
        const c = centre(w);
        if (w.type[c] <= T.SHALLOW)
            break;
        w = null;
    }
    assert(w, "no seed with water in the middle");
    const before = Array.from(w.type);
    const gx = 0.5 * w.cols;
    const gy = 0.5 * w.rows;
    const dist = p => Math.hypot((p % w.cols) + 0.5 - gx, Math.floor(p / w.cols) + 0.5 - gy);
    let best = Infinity;
    for (let p = 0; p < before.length; p++)
        if (before[p] >= T.SAND)
            best = Math.min(best, dist(p));
    E.setSignals(w, { groves: [{ x: 0.5, y: 0.5 }] });
    let forest = false;
    for (let p = 0; p < before.length; p++) {
        const nearest = before[p] >= T.SAND && near(dist(p), best);
        assert(nearest || before[p] === w.type[p], `cell ${p} changed from ${before[p]} to ${w.type[p]}, away from the grove`);
        forest = forest || (nearest && w.type[p] === T.FOREST && w.fert[p] >= Math.fround(0.9));
    }
    assert(forest, "the nearest land cell is not forest with raised fertility");
});

check("berries regrow", () => {
    const w = landOnly(make());
    E.setSignals(w, { rain: 0.8 });
    for (let p = 0; p < w.type.length; p++)
        if (w.type[p] === T.FOREST)
            w.bio[p] = 0.1;
    run(w, 1500);
    let sum = 0;
    let n = 0;
    for (let p = 0; p < w.type.length; p++)
        if (w.type[p] === T.FOREST) {
            sum += w.bio[p];
            n++;
        }
    assert(n > 0, "the forest is gone");
    assert(sum / n > 0.3, `mean berries ${(sum / n).toFixed(3)} after 1500 steps from 0.1`);
    return `mean berries ${(sum / n).toFixed(2)}`;
});

check("worms regrow after desert recovers", () => {
    // No lightning: a fire takes the worms with it (worms live only in living soil), and a land with no herds grows lush
    // enough for one to sweep most of it, so whether this passed came down to when the last fire was
    const w = landOnly(make());
    E.setSignals(w, { rain: 0.8, lightning: 0 });
    const wasted = [];
    for (let p = 0; p < w.type.length; p++)
        if (w.type[p] === T.GRASS && w.moist[p] > 0.5) {
            w.type[p] = T.DESERT;
            wasted.push(p);
        }
    assert(wasted.length > 20, `only ${wasted.length} moist grass cells to turn to desert`);
    E.step(w);
    assert(wasted.every(p => w.type[p] !== T.DESERT || w.worm[p] === 0), "worms survived in desert");
    // Worms are slow on purpose, so the soil needs a few thousand steps after it turns to grass
    run(w, 10000);
    const back = wasted.filter(p => living(w.type[p]));
    assert(back.length > 0, "no desert recovered");
    const mean = back.reduce((sum, p) => sum + w.worm[p], 0) / back.length;
    assert(mean > 0.1, `mean worm ${mean.toFixed(3)} on ${back.length} recovered cells`);
    return `${back.length} of ${wasted.length} cells back, mean worm ${mean.toFixed(2)}`;
});

check("a hungry shark eats a sheep wading in the shallows", () => {
    for (const cross of [true, false]) {
        const w = landOnly(make());
        w.rules.cross = cross;
        const c = interior(w, T.SHALLOW);
        put(w, "shark", c.x + 0.5, c.y + 0.5, { e: 0.5 });
        put(w, "sheep", c.x + 0.5, c.y + 0.5);
        run(w, 5);
        if (cross) {
            assert(w.animals.sheep.length === 0, "the sheep is still alive");
            assert(events(w, "shark_sheep").length === 1, "no shark_sheep event");
        } else {
            assert(w.animals.sheep.length === 1, "the shark ate a sheep with cross habitat hunting off");
            assert(events(w, "shark_sheep").length === 0, "a shark_sheep event with the rule off");
        }
    }
});

check("a hungry wolf snatches a fish at the shore", () => {
    for (const cross of [true, false]) {
        const w = landOnly(make());
        w.rules.cross = cross;
        let c = null;
        for (let p = 0; p < w.type.length && !c; p++) {
            const x = p % w.cols;
            const y = Math.floor(p / w.cols);
            if (w.type[p] === T.SAND && x + 1 < w.cols && w.type[p + 1] === T.SHALLOW)
                c = { x, y };
        }
        assert(c, "no sand cell with shallow water to its east");
        put(w, "wolf", c.x + 0.5, c.y + 0.5, { e: 0.5 });
        put(w, "fish", c.x + 1.5, c.y + 0.5);
        run(w, 5);
        if (cross) {
            assert(w.animals.fish.length === 0, "the fish is still there");
            assert(events(w, "wolf_fish").length === 1, "no wolf_fish event");
        } else {
            assert(w.animals.fish.length === 1, "the wolf took a fish with cross habitat hunting off");
            assert(events(w, "wolf_fish").length === 0, "a wolf_fish event with the rule off");
        }
    }
});

check("hawks sometimes take fish", () => {
    for (const cross of [true, false]) {
        const w = landOnly(make());
        w.rules.cross = cross;
        const c = interior(w, T.SHALLOW);
        const hawk = put(w, "hawk", 0, 0);
        for (let i = 0; i < 600; i++) {
            Object.assign(hawk, { x: c.x + 0.5, y: c.y + 0.5, vx: 0, vy: 0, e: 1 });
            w.animals.fish.length = 0;
            put(w, "fish", c.x + 1.2, c.y + 0.5);
            E.step(w);
        }
        const taken = events(w, "hawk_fish").length;
        assert(cross ? taken > 0 : taken === 0, `${taken} hawk_fish events with cross habitat hunting ${cross ? "on" : "off"}`);
    }
});

check("food sets population", () => {
    for (const pop of [true, false]) {
        const grass = landOnly(make());
        grass.rules.pop = pop;
        const g = interior(grass, T.GRASS, p => grass.bio[p] > 0.5, 0);
        put(grass, "sheep", g.x + 0.5, g.y + 0.5, { e: 2 });
        E.step(grass);
        assert(grass.animals.sheep.length === (pop ? 2 : 1), `${grass.animals.sheep.length} sheep after a fed sheep, pop ${pop}`);

        // Sand has nothing to eat, and a sheep moves less than half a cell in one step
        const sand = landOnly(make());
        sand.rules.pop = pop;
        const s = interior(sand, T.SAND, undefined, 0);
        put(sand, "sheep", s.x + 0.5, s.y + 0.5, { e: 0 });
        E.step(sand);
        assert(sand.animals.sheep.length === (pop ? 0 : 1), `${sand.animals.sheep.length} sheep after a starving sheep, pop ${pop}`);
    }
});

check("extinct species return", () => {
    const w = make();
    w.animals.sheep.length = 0;
    const seen = [];
    for (let i = 1; i <= 301; i++) {
        E.step(w);
        seen.push(...E.drainEvents(w));
        if (i === 300)
            assert(w.animals.sheep.length === 0, "sheep came back before 301 steps");
    }
    assert(w.animals.sheep.length > 0, "no sheep after 301 steps");
    assert(seen.some(e => e.id === "extinct" && e.species === "sheep"), "no extinct event for sheep");
    assert(seen.some(e => e.id === "arrive" && e.species === "sheep"), "no arrive event for sheep");

    const closed = make();
    closed.rules.respawn = false;
    closed.animals.sheep.length = 0;
    run(closed, 1000);
    assert(closed.animals.sheep.length === 0, "sheep arrived with respawn off");
});

check("hardiness stays in range", () => {
    const w = make();
    const fixed = make({ rules: { evolve: false } });
    let lo = 1;
    let hi = 0;
    let most = 0;
    for (let i = 1; i <= 20000; i++) {
        E.step(w);
        E.step(fixed);
        if (i % 50)
            continue;
        most = Math.max(most, fixed.animals.sheep.length);
        for (const s of w.animals.sheep) {
            assert(s.h >= 0 && s.h <= 1, `step ${i}: hardiness ${s.h}`);
            lo = Math.min(lo, s.h);
            hi = Math.max(hi, s.h);
        }
        for (const s of fixed.animals.sheep)
            assert(s.h === 0.1, `step ${i}: hardiness ${s.h} with evolve off`);
    }
    assert(most > 24, "the sheep never bred, so the lamb check proved nothing");
    assert(hi > lo, "hardiness never moved with evolve on");
    return `hardiness ${lo.toFixed(2)} to ${hi.toFixed(2)}`;
});

check("birds eat berries and worms", () => {
    const eat = (type, prepare) => {
        const w = landOnly(make({ rules: { tide: false } }));
        const c = interior(w, type, undefined, 0);
        prepare(w, c.p);
        const bird = put(w, "bird", c.x + 0.5, c.y + 0.5, { e: 0.5 });
        E.step(w);
        return { w, p: c.p, bird };
    };
    let r = eat(T.FOREST, (w, p) => {
        w.bio[p] = 1;
        w.worm[p] = 0;
    });
    assert(r.w.bio[r.p] < 1 && r.bird.e > 0.5, `berries ${r.w.bio[r.p]}, energy ${r.bird.e} over a forest cell`);
    r = eat(T.GRASS, (w, p) => {
        w.worm[p] = 1;
    });
    assert(r.w.worm[r.p] < 1 && r.bird.e > 0.5, `worms ${r.w.worm[r.p]}, energy ${r.bird.e} over a grass cell`);
    r = eat(T.GRASS, (w, p) => {
        w.type[p] = T.DESERT;
        w.bio[p] = 0.7;
    });
    assert(near(r.w.bio[r.p], Math.fround(0.7)) && r.w.worm[r.p] === 0 && r.bird.e < 0.5, `a desert cell changed: bio ${r.w.bio[r.p]}, energy ${r.bird.e}`);

    // A hungry bird steers towards food, and only towards food: the same set up with the food missing gives no push
    const steer = (type, prepare) => {
        const w = landOnly(make({ rules: { tide: false } }));
        const cx = Math.floor(w.cols / 2);
        const cy = Math.floor(w.rows / 2);
        for (let y = cy - 20; y <= cy + 20; y++)
            for (let x = cx - 20; x <= cx + 20; x++)
                if (y >= 0 && y < w.rows) {
                    const p = cellOf(w, x, y);
                    w.type[p] = T.DESERT;
                    w.bio[p] = 0;
                    w.worm[p] = 0;
                }
        const target = cellOf(w, cx + 10, cy);
        w.type[target] = type;
        prepare(w, target);
        const bird = put(w, "bird", cx + 0.5, cy + 0.5, { e: 0.5 });
        E.step(w);
        return bird.vx;
    };
    assert(steer(T.FOREST, (w, p) => (w.bio[p] = 0.5)) >= 0.02, "no steering towards berries");
    assert(steer(T.GRASS, (w, p) => (w.worm[p] = 0.5)) >= 0.02, "no steering towards worms on grass");
    assert(steer(T.FOREST, (w, p) => (w.worm[p] = 0.5)) >= 0.02, "no steering towards worms in forest");
    assert(steer(T.FOREST, (w, p) => (w.bio[p] = 0.2)) <= 0.0301, "steering towards too few berries");
    assert(steer(T.GRASS, (w, p) => (w.worm[p] = 0.2)) <= 0.0301, "steering towards too few worms");
});

check("guano grows the coast", () => {
    for (const guano of [true, false]) {
        const w = landOnly(make({ rules: { spread: false } }));
        w.rules.guano = guano;
        let c = null;
        for (let p = 0; p < w.type.length && !c; p++)
            if (w.type[p] === T.SAND && w.moist[p] > 0.3)
                c = { x: p % w.cols, y: Math.floor(p / w.cols), p };
        assert(c, "no moist sand");
        const bird = put(w, "bird", c.x + 0.5, c.y + 0.5, { g: 1 });
        E.step(w);
        const logged = events(w, "guano").length;
        if (guano) {
            assert(w.type[c.p] === T.GRASS, `the sand cell is type ${w.type[c.p]}`);
            assert(logged === 1 && bird.g === 0, `${logged} guano events, g ${bird.g}`);
        } else
            assert(w.type[c.p] === T.SAND && logged === 0, "guano changed the land with the rule off");
    }
});

check("at default signals no biome takes over", () => {
    // An hour at 1x, the spec's mark for a world that has gone flat. The first samples are left out as the land
    // settles from its generated start
    const out = [];
    for (const springs of [0, 3])
        for (const seed of [11, 12, 13]) {
            const w = make({ seed });
            E.setSignals(w, { rain: 0.8, lightning: 0.05, springs });
            const forest = [];
            for (let i = 1; i <= 54000; i++) {
                E.step(w);
                if (i % 6000 !== 0 || i <= 12000)
                    continue;
                const c = E.census(w);
                const at = `seed ${seed}, springs ${springs}, step ${i}`;
                assert(c.forest <= 0.85, `${at}: forest is ${(c.forest * 100).toFixed(1)}% of the land`);
                assert(c.grass >= 0.08, `${at}: grass is ${(c.grass * 100).toFixed(1)}% of the land`);
                forest.push(c.forest);
            }
            const mean = forest.reduce((a, b) => a + b, 0) / forest.length;
            assert(mean < 0.75, `seed ${seed}, springs ${springs}: forest averages ${(mean * 100).toFixed(1)}% of the land`);
            out.push(`${seed}/${springs} ${(mean * 100).toFixed(0)}%`);
        }
    return `mean forest ${out.join(", ")}`;
});

// That a clock jump does not replay the missed steps is EcoWorld.tick()'s doing: it runs a fixed few steps a tick
check("a step advances the tick by exactly one", () => {
    const w = make();
    const before = w.tick;
    E.step(w);
    assert(w.tick === before + 1, `tick went from ${before} to ${w.tick} in one step`);
});

check("step is cheap", () => {
    const w = make();
    const t0 = process.hrtime.bigint();
    run(w, 3000);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 3000;
    assert(ms < 5, `${ms.toFixed(3)} ms per step`);
    return `${ms.toFixed(3)} ms per step`;
});

// --- Signal mapping (modules/lock/ecosignals.js) ---

// Every function reads a system value that may be missing, so each of these counts as "no reading"
const NO_READING = [undefined, null, NaN, "text", {}, [], true];

check("signals: rain follows traffic and heat", () => {
    const cases = [[0, 40, 0.8], [50000, 40, 0.8], [1e7, 40, 1.5], [1e9, 40, 1.5], [0, 70, 0.8], [0, 85, 0.2], [0, 100, 0.2], [0, 77.5, 0.5], [1e7, 85, 0.9]];
    for (const [down, temp, want] of cases)
        assert(near(S.rain(down, temp), want), `rain(${down}, ${temp}) is ${S.rain(down, temp)}, not ${want}`);
    let prev = S.rain(50000, 40);
    for (let d = 100000; d <= 1e7; d *= 2) {
        const r = S.rain(d, 40);
        assert(r > prev, `rain did not rise from ${prev} at ${d} B/s`);
        prev = r;
    }
    const mid = S.rain(Math.sqrt(50000 * 1e7), 40);
    assert(near(mid, 1.15), `rain is not logarithmic, the geometric middle gives ${mid}`);
    for (const t of [-40, 20, 70, 80, 150])
        assert(S.rain(0, t) >= 0.1 && S.rain(1e7, t) <= 1.5, `rain left [0.1, 1.5] at ${t} C`);
});

check("signals: rain without a reading is the baseline", () => {
    for (const bad of NO_READING) {
        assert(near(S.rain(bad, 40), 0.8), `rain(${bad}, 40) is ${S.rain(bad, 40)}`);
        assert(near(S.rain(0, bad), 0.8), `rain(0, ${bad}) is ${S.rain(0, bad)}`);
    }
    assert(near(S.rain(NaN, undefined), 0.8), "rain(NaN, undefined) is not 0.8");
    assert(near(S.rain(), 0.8), "rain() is not 0.8");
    assert(near(S.rain(-5, 40), 0.8), "a negative download is not the baseline");
    assert(near(S.rain(Infinity, 40), 1.5), "an infinite download is not the maximum");
});

check("signals: lightning counts failed pings", () => {
    const ping = (n, failed) => Array.from({ length: n }, (_, i) => i >= failed);
    assert(near(S.lightning([]), 0.05), "an empty list is not 0.05");
    assert(near(S.lightning(ping(10, 10)), 0.55), "ten failures are not 0.55");
    assert(near(S.lightning(ping(10, 5)), 0.3), "five of ten are not 0.3");
    assert(near(S.lightning(ping(10, 0)), 0.05), "no failures are not 0.05");
    assert(near(S.lightning(ping(4, 2)), 0.3), "two of four are not 0.3");
    // Twenty entries: only the last ten count, so the old failures do not
    assert(near(S.lightning([...ping(10, 10), ...ping(10, 0)]), 0.05), "old failures counted");
    assert(near(S.lightning([...ping(10, 0), ...ping(10, 10)]), 0.55), "recent failures missed");
    assert(near(S.lightning([...ping(15, 0), ...ping(5, 5)]), 0.05 + 0.5 * 0.5), "the last ten were not counted from the end");
});

check("signals: lightning without a reading is the baseline", () => {
    for (const bad of NO_READING.filter(v => !Array.isArray(v)))
        assert(near(S.lightning(bad), 0.05), `lightning(${bad}) is ${S.lightning(bad)}`);
    assert(near(S.lightning([null, undefined, NaN]), 0.05), "entries that are not booleans counted as failures");
    assert(near(S.lightning([false, undefined, true, false]), 0.05 + 0.5 * 2 / 3), "entries without a reading were not skipped");
});

check("signals: springCount", () => {
    const cases = [[12, 8], [8, 8], [5, 5], [0, 0], [-3, 0], [2.9, 2], [Infinity, 8]];
    for (const [n, want] of cases)
        assert(S.springCount(n) === want, `springCount(${n}) is ${S.springCount(n)}, not ${want}`);
    for (const bad of NO_READING)
        assert(S.springCount(bad) === 0, `springCount(${bad}) is ${S.springCount(bad)}`);
    assert(S.springCount() === 0, "springCount() is not 0");
});

check("signals: islands", () => {
    const aps = Array.from({ length: 20 }, (_, i) => ({ bssid: `aa:bb:cc:dd:ee:${i.toString(16).padStart(2, "0")}`, strength: i * 5 }));
    const out = S.islands([{ strength: 90 }, { bssid: "", strength: 90 }, { bssid: null, strength: 90 }, ...aps]);
    assert(out.length === 12, `${out.length} islands from 20 access points`);
    assert(near(out[0].height, 0.12 + 0.18 * 0.95) && near(out[11].height, 0.12 + 0.18 * 0.4), "the strongest 12 were not kept in order");
    for (const o of out)
        assert(o.x >= 0 && o.x < 1 && o.y >= 0 && o.y < 1 && near(o.radius, 0.08) && Number.isFinite(o.height), `bad island ${JSON.stringify(o)}`);
    assert(S.islands([{ bssid: "x", strength: 90 }])[0].height > S.islands([{ bssid: "x", strength: 20 }])[0].height, "a stronger signal is not taller");
    assert(near(S.islands([{ bssid: "x", strength: 100 }])[0].height, 0.3) && near(S.islands([{ bssid: "x", strength: 0 }])[0].height, 0.12), "height range is wrong");
    const a = S.islands([{ bssid: "x", strength: 50 }])[0], b = S.islands([{ bssid: "x", strength: 50 }])[0];
    assert(a.x === b.x && a.y === b.y, "the same bssid moved");
    const other = S.islands([{ bssid: "y", strength: 50 }])[0];
    assert(other.x !== a.x || other.y !== a.y, "two bssids share a position");
    assert(near(S.islands([{ bssid: "x", strength: 400 }])[0].height, 0.3), "a strength over 100 is not clamped");
});

check("signals: islands without a reading", () => {
    for (const bad of NO_READING)
        assert(S.islands(bad).length === 0, `islands(${bad}) is not empty`);
    assert(S.islands().length === 0, "islands() is not empty");
    const out = S.islands([null, undefined, 5, "aa", { bssid: 5 }, { bssid: "x", strength: NaN }, { bssid: "y" }]);
    assert(out.length === 2 && out.every(o => near(o.height, 0.12)), `entries without a reading gave ${JSON.stringify(out)}`);
});

check("signals: island and grove positions use independent draws", () => {
    // If x and y came from the same hash, they would lie on a line
    const pts = S.groves(Array.from({ length: 24 }, (_, i) => `02:00:00:00:00:${i.toString(16).padStart(2, "0")}`));
    const n = pts.length, mx = pts.reduce((s, p) => s + p.x, 0) / n, my = pts.reduce((s, p) => s + p.y, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (const p of pts) {
        sxy += (p.x - mx) * (p.y - my);
        sxx += (p.x - mx) ** 2;
        syy += (p.y - my) ** 2;
    }
    const r = sxy / Math.sqrt(sxx * syy);
    assert(Math.abs(r) < 0.5, `x and y correlate (r = ${r.toFixed(2)})`);
    assert(pts.every(p => p.x !== p.y), "x equals y");
    const spread = (v) => Math.max(...v) - Math.min(...v);
    assert(spread(pts.map(p => p.x)) > 0.5 && spread(pts.map(p => p.y)) > 0.5, "positions are bunched up");
});

check("signals: groves", () => {
    assert(S.groves(["a", "a", "b"]).length === 2, "duplicates were not removed");
    assert(S.groves(["AA:BB", "aa:bb"]).length === 1, "the case of a mac made a second grove");
    const many = Array.from({ length: 40 }, (_, i) => `m${i}`);
    const out = S.groves(many);
    assert(out.length === 24, `${out.length} groves from 40 macs`);
    assert(out.every(g => g.x >= 0 && g.x < 1 && g.y >= 0 && g.y < 1), "a grove is outside [0, 1)");
    assert(JSON.stringify(S.groves(many)) === JSON.stringify(out), "groves are not repeatable");
    assert(JSON.stringify(S.groves(["b", "a"])) === JSON.stringify(S.groves(["a", "b"]).reverse()), "a position depends on the order");
});

check("signals: groves without a reading", () => {
    for (const bad of NO_READING)
        assert(S.groves(bad).length === 0, `groves(${bad}) is not empty`);
    assert(S.groves().length === 0, "groves() is not empty");
    assert(S.groves([null, undefined, 5, "", "a"]).length === 1, "entries without a reading were not skipped");
});

check("signals: hashString and seeds", () => {
    assert(S.hashString("home") === S.hashString("home"), "hashString is not repeatable");
    assert(S.hashString("home") !== S.hashString("hom3"), "hashString ignores a character");
    for (const s of ["", "a", "home", "ünï", "x".repeat(500)]) {
        const h = S.hashString(s);
        assert(Number.isInteger(h) && h >= 0 && h <= 0xffffffff, `hashString(${s.slice(0, 8)}) is ${h}`);
    }
    for (const bad of NO_READING.filter(v => typeof v !== "string"))
        assert(S.hashString(bad) === S.hashString(""), `hashString(${bad}) is not the hash of the empty string`);
    assert(S.seedFor("") === S.seedFor(undefined), "an empty ssid and none differ");
    assert(S.seedFor(null) === S.seedFor("none") && S.seedFor(NaN) === S.seedFor("none"), "no ssid is not the none seed");
    assert(S.seedFor("home") === S.hashString("home") && S.seedFor("home") !== S.seedFor("work"), "seedFor does not follow the ssid");
    // Random-looking: a few hundred names should not collide or sit in one half of the range
    const hs = Array.from({ length: 500 }, (_, i) => S.hashString(`net${i}`));
    assert(new Set(hs).size === 500, "hash collisions among 500 names");
    const high = hs.filter(h => h >= 2 ** 31).length;
    assert(high > 200 && high < 300, `${high} of 500 hashes in the upper half`);
});

check("signals: worldKey", () => {
    const k = S.worldKey("home");
    assert(/^[0-9a-f]{8}$/.test(k), `worldKey is ${k}`);
    assert(!k.includes("home"), "the key contains the name");
    assert(k === S.worldKey("home") && k !== S.worldKey("work"), "worldKey does not follow the ssid");
    assert(parseInt(k, 16) === S.seedFor("home"), "worldKey is not the hex of the seed");
    for (const bad of NO_READING.filter(v => typeof v !== "string").concat(""))
        assert(/^[0-9a-f]{8}$/.test(S.worldKey(bad)) && S.worldKey(bad) === S.worldKey(undefined), `worldKey(${bad}) is ${S.worldKey(bad)}`);
    // Low hashes still give 8 characters
    for (let i = 0; i < 2000; i++)
        assert(S.worldKey(`n${i}`).length === 8, `worldKey of n${i} is ${S.worldKey(`n${i}`)}`);
});

check("signals: smooth", () => {
    assert(S.smooth(undefined, 5) === 5, "smooth(undefined, 5) is not 5");
    for (const bad of NO_READING.filter(v => typeof v !== "number" || isNaN(v)))
        assert(S.smooth(bad, 5) === 5, `smooth(${bad}, 5) is ${S.smooth(bad, 5)}`);
    assert(S.smooth(Infinity, 5) === 5, "an infinite previous value was kept");
    assert(near(S.smooth(10, 0), 8), "smooth(10, 0) is not 8");
    assert(near(S.smooth(10, 0, 0.5), 5) && near(S.smooth(10, 0, 1), 0) && near(S.smooth(10, 0, 0), 10), "alpha is not applied");
    assert(near(S.smooth(10, 0, undefined), 8) && near(S.smooth(10, 0, NaN), 8), "a missing alpha is not 0.2");
    assert(near(S.smooth(10, undefined), 10) && near(S.smooth(10, NaN), 10), "a missing reading moved the value");
    assert(!Number.isFinite(S.smooth(undefined, undefined)), "no value at all gave a number");
});

check("signals: pruneWorlds", () => {
    const worlds = {};
    for (let i = 0; i < 7; i++)
        worlds["w" + i] = { last: 100 + (i * 3) % 7, name: "w" + i };
    const before = JSON.stringify(worlds);
    const kept = S.pruneWorlds(worlds);
    const keys = Object.keys(kept).sort();
    const newest = Object.keys(worlds).sort((a, b) => worlds[b].last - worlds[a].last).slice(0, 5).sort();
    assert(keys.length === 5 && JSON.stringify(keys) === JSON.stringify(newest), `kept ${keys} instead of ${newest}`);
    assert(kept.w0 === worlds.w0 || !kept.w0, "a kept world was copied");
    assert(JSON.stringify(worlds) === before && kept !== worlds, "the argument was changed");
    assert(Object.keys(S.pruneWorlds(worlds, 2)).length === 2, "max 2 kept another count");
    assert(Object.keys(S.pruneWorlds(worlds, 0)).length === 0, "max 0 kept a world");
    assert(Object.keys(S.pruneWorlds({ a: { last: 1 }, b: { last: 2 } })).length === 2, "fewer than max were dropped");
    assert(Object.keys(S.pruneWorlds(worlds, NaN)).length === 5 && Object.keys(S.pruneWorlds(worlds, undefined)).length === 5, "a missing max is not 5");
    const odd = S.pruneWorlds({ a: { last: 5 }, b: null, c: { last: NaN }, d: { last: 9 } }, 2);
    assert(Object.keys(odd).sort().join() === "a,d", `entries without a time outranked real ones: ${Object.keys(odd)}`);
    for (const bad of NO_READING)
        assert(Object.keys(S.pruneWorlds(bad)).length === 0, `pruneWorlds(${bad}) is not empty`);
});

// A mistyped --only would otherwise run nothing and look like a pass
if (!ran) {
    console.log(`FAIL no check matches --only ${args.only}`);
    process.exit(1);
}
process.exit(failures ? 1 : 0);
