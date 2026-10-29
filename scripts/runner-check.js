#!/usr/bin/env node
// Checks that the lock screen runner (modules/lock/runner.js) never builds a map that cannot be survived.
//
// For every seed it looks for a sequence of inputs (jump, duck, step back and forth; no fire, which only ever helps)
// that gets through the whole run, using the game's own physics. If there is none, the map has a place where
// nobody gets through. --hold makes it harder to pass: the inputs may only change every N frames, so a map that
// needs frame-perfect timing fails while one a person can play passes.
//
//   node scripts/runner-check.js [--seeds 20] [--seconds 70] [--width 140] [--world both] [--distance 0]
//                                [--fps 60] [--hold 1] [--budget 3000000] [--starts 0] [--margin 24]
//
// --distance starts the run that far in, so --distance 3000 checks the hardest gaps from the first second.
// --width is the world width in art pixels, and --fps the frame rate the physics is stepped at. Proving that
// a map is a dead end means trying every state, so --budget caps the states tried per map; the report then says
// how far the search got.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const args = {};
process.argv.slice(2).forEach((a, i, all) => a.startsWith("--") && (args[a.slice(2)] = all[i + 1]));

// --src checks another copy of the game, for trying out changes
const source = fs.readFileSync(args.src ?? path.join(__dirname, "../modules/lock/runner.js"), "utf8").replace(/^\.pragma library$/m, "");
const R = vm.runInNewContext(`${source}\n({ create, start, scroll, run, touching, hitbox, support, key })`);

const opt = {
    seeds: +(args.seeds ?? 20),
    seconds: +(args.seconds ?? 70),
    width: +(args.width ?? 140),
    world: args.world ?? "both",
    distance: +(args.distance ?? 0),
    fps: +(args.fps ?? 60),
    hold: +(args.hold ?? 1),
    budget: +(args.budget ?? 3e6),
    starts: +(args.starts ?? 0),
    margin: +(args.margin ?? 24)
};

// The world does not depend on what the runner does (fire is left out), so it is computed once per map
function worldFrames(world, seed, frames) {
    const w = R.create(world, opt.width);
    R.start(w, seed);
    w.distance = opt.distance;
    const out = [];
    for (let f = 0; f < frames; f++) {
        R.scroll(w, 1 / opt.fps);
        out.push(w.obstacles.map(o => Object.assign({}, o)));
    }
    return out;
}

// What the runner can do: do nothing first, since that is what mostly works, then everything else
function moves(s) {
    const dirs = s.world === "penguin" ? [0, -1, 1] : [0, -1];
    const out = [];
    for (const jump of s.grounded ? [false, true] : [false])
        for (const duck of [false, true])
            for (const dir of dirs)
                out.push({ dir, duck, jump });
    return out;
}

// Runs one move for `hold` frames from frame f. Returns the state after it, or null if the runner hit something
function play(s, m, f, frames) {
    const c = Object.assign({}, s);
    c.left = m.dir < 0;
    c.right = m.dir > 0;
    c.ducking = m.duck;
    if (m.jump)
        R.key(c, "up", true, 1);
    for (let i = 0; i < opt.hold && f + i < frames.length; i++) {
        c.obstacles = frames[f + i];
        R.run(c, 1 / opt.fps);
        if (R.touching(c).some(o => o.kind !== "gem"))
            return null;
    }
    return c;
}

function bucket(s) {
    return `${Math.round(s.x)}|${Math.round(s.y)}|${Math.round(s.vy / 8)}|${s.ducking ? 1 : 0}|${s.grounded ? 1 : 0}`;
}

function describe(obstacles) {
    return obstacles.map(o => `${o.kind}@${o.x.toFixed(0)}+${o.w}(${o.lo}-${o.hi})`).join(" ");
}

// Depth first with a memory of states that led nowhere. It starts at frame `from`, with the runner standing at x
function search(world, seed, from = 0, x = 10) {
    const frames = worldFrames(world, seed, Math.round(opt.seconds * opt.fps) + from);
    const first = R.create(world, opt.width);
    R.start(first, seed);
    first.distance = opt.distance;
    if (from > 0) {
        Object.assign(first, { x, y: 0, vy: 0, grounded: true, obstacles: frames[from - 1] });
        // On the ground, or on the platform it happens to be over
        first.y = R.support(first, R.hitbox(first), 100);
        // Only fair starts: nothing touching, and the next thing at least --margin away (about half a second)
        const hb = R.hitbox(first);
        const ahead = Math.min(...first.obstacles.filter(o => o.kind !== "gem" && o.x + o.w - 1 > hb.left && !(o.kind === "platform" && o.hi <= first.y)).map(o => o.x - hb.right));
        if (R.touching(first).length || ahead < opt.margin)
            return { ok: true, visited: 0, skipped: true };
    }

    const dead = new Set();
    const stack = [{ s: first, f: from, moves: moves(first), i: 0, key: "" }];
    let furthest = from;
    let visited = 0;
    while (stack.length) {
        const top = stack[stack.length - 1];
        furthest = Math.max(furthest, top.f);
        if (top.f >= frames.length)
            return { ok: true, visited };
        if (top.i >= top.moves.length) {
            dead.add(top.key);
            stack.pop();
            continue;
        }
        const c = play(top.s, top.moves[top.i++], top.f, frames);
        if (!c)
            continue;
        const f = top.f + opt.hold;
        const key = `${f}|${bucket(c)}`;
        if (dead.has(key))
            continue;
        if (++visited > opt.budget)
            break;
        stack.push({ s: c, f, moves: f >= frames.length ? [] : moves(c), i: 0, key });
        if (f >= frames.length)
            return { ok: true, visited };
    }
    return { ok: false, seconds: furthest / opt.fps, obstacles: describe(frames[Math.min(furthest, frames.length - 1)]), visited, exhausted: visited <= opt.budget };
}

let failures = 0;
const worlds = opt.world === "both" ? ["penguin", "dragon"] : [opt.world];
for (const world of worlds) {
    let bad = 0;
    const t0 = Date.now();
    let runs = 0;
    for (let i = 1; i <= opt.seeds; i++) {
        const seed = i * 7919;
        // The run from the start, then runs from random moments with the runner standing somewhere
        const starts = [[0, 10]];
        for (let j = 0; j < opt.starts; j++)
            starts.push([60 + Math.floor(Math.random() * 60 * 40), 2 + Math.floor(Math.random() * (opt.width * 0.6 - 2))]);
        for (const [from, x] of starts) {
            const r = search(world, seed, from, x);
            runs += r.skipped ? 0 : 1;
            if (!r.ok) {
                bad++;
                console.log(`${world} seed ${seed}${from ? ` from ${(from / opt.fps).toFixed(1)} s at x ${x}` : ""}: ${r.exhausted ? "DEAD END" : "no way found within the budget"} at ${(r.seconds - from / opt.fps).toFixed(2)} s later. Obstacles then: ${r.obstacles}`);
            }
        }
    }
    failures += bad;
    console.log(`${world}: ${runs - bad}/${runs} runs survivable for ${opt.seconds} s from distance ${opt.distance}, inputs every ${opt.hold} frame(s) at ${opt.fps} fps (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
process.exit(failures ? 1 : 0);
