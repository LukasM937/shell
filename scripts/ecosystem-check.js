#!/usr/bin/env node
// Checks the lock screen ecosystem simulation (modules/lock/ecosystem.js) without a shell.
//
// It runs worlds for tens of thousands of steps and fails when a value turns invalid, when a world has no water or no
// land, when the land dies out under constant lightning or stays a desert, or when a signal does not do what it says.
//
//   node scripts/ecosystem-check.js [--salt 0] [--src path/to/ecosystem.js]
//
// --salt moves every random seed (the world seeds and the generator behind them), so a different run catches checks
// that only pass for a lucky seed.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const args = {};
process.argv.slice(2).forEach((a, i, all) => a.startsWith("--") && (args[a.slice(2)] = all[i + 1]));
const salt = +(args.salt ?? 0);

const source = fs.readFileSync(args.src ?? path.join(__dirname, "../modules/lock/ecosystem.js"), "utf8").replace(/^\.pragma library$/m, "");
// Wrapped in a function that takes Math as an argument: globals of a vm context are slow to reach, and without this the
// check takes minutes and reports a step cost several times what the shell sees
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
function check(name, fn) {
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

// No animals yet or later: these checks are about the land, so nothing may eat, breed or arrive
function landOnly(world) {
    for (const k of E.SPECIES)
        world.animals[k].length = 0;
    world.rules.respawn = false;
    return world;
}

const T = E.T;
const living = t => t === T.GRASS || t === T.FOREST;
const centre = w => Math.floor(w.rows / 2) * w.cols + Math.floor(w.cols / 2);
const typeKey = w => JSON.stringify(Array.from(w.type));

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

check("values stay valid", () => {
    for (const rain of [0.1, 0.8, 1.4]) {
        const w = make();
        E.setSignals(w, { rain });
        const audit = at => {
            for (let p = 0; p < w.type.length; p++) {
                assert(w.type[p] <= T.FIRE, `rain ${rain}, step ${at}: type ${w.type[p]} at cell ${p}`);
                for (const name of ["bio", "fert", "worm"])
                    assert(Number.isFinite(w[name][p]), `rain ${rain}, step ${at}: ${name} is ${w[name][p]} at cell ${p}`);
            }
        };
        for (let i = 1; i <= 20000; i++) {
            E.step(w);
            if (i % 500 === 0)
                audit(i);
        }
        audit(20000);
    }
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
    assert(sum / n > 0.2, `mean worm on living soil is ${(sum / n).toFixed(3)}`);
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

check("step is cheap", () => {
    const w = make();
    const t0 = process.hrtime.bigint();
    run(w, 3000);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 3000;
    assert(ms < 5, `${ms.toFixed(3)} ms per step`);
    return `${ms.toFixed(3)} ms per step`;
});

process.exit(failures ? 1 : 0);
