#!/usr/bin/env node
// Checks the dashboard cat (modules/dashboard/dash/cat.js): it stays inside its room, never produces a bad number, does
// every thing it is meant to do over a day, sleeps at night, reacts to the pointer and a stroke, and draws inside its canvas.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "modules", "dashboard", "dash", "cat.js"), "utf8").replace(/^\.pragma library$/m, "");
const cat = {};
vm.runInNewContext(source, Object.assign(cat, { Math }));

let failed = 0;
function check(name, ok, detail = "") {
    console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
    if (!ok)
        failed++;
}

// A canvas that only records where it was asked to paint
function probe() {
    const p = { minX: 1e9, minY: 1e9, maxX: -1e9, maxY: -1e9, set fillStyle(_) {}, globalAlpha: 1 };
    p.fillRect = (x, y, w, h) => {
        if (w <= 0 || h <= 0)
            return;
        p.minX = Math.min(p.minX, x);
        p.minY = Math.min(p.minY, y);
        p.maxX = Math.max(p.maxX, x + w);
        p.maxY = Math.max(p.maxY, y + h);
    };
    return p;
}

function run(seconds, envAt, c = cat.create(11), onStep = () => {}) {
    const seen = {};
    for (let t = 0; t < seconds; t += 0.05) {
        cat.step(c, 0.05, envAt(t));
        seen[c.act] = (seen[c.act] ?? 0) + 0.05;
        onStep(c, t);
    }
    return { c, seen };
}

const day = () => ({ night: false, hover: false, pointer: -1, busy: 0.2 });
const night = () => ({ night: true, hover: false, pointer: -1, busy: 0 });

// A day: everything it does happens, and it stays in the room
{
    let bad = null;
    let wide = 0;
    const { c, seen } = run(3600, day, cat.create(3), (c, t) => {
        for (const v of [c.x, c.phase, c.ball.x, c.ball.h, c.look])
            if (!Number.isFinite(v))
                bad = bad ?? `not finite at ${t}`;
        if (c.x < cat.LEFT - 0.01 || c.x > cat.RIGHT + 0.01)
            bad = bad ?? `x ${c.x} at ${t}`;
        if (c.ball.x < 8 - 0.01 || c.ball.x > cat.W - 8 + 0.01)
            bad = bad ?? `ball ${c.ball.x} at ${t}`;
        if (c.zs.length > 8 || c.hearts.length > 30)
            wide++;
    });
    check("stays in the room, numbers stay finite", !bad, bad ?? "");
    check("keeps its particles bounded", wide === 0);
    for (const a of ["walk", "sit", "wash", "play", "sleep", "wake"])
        check(`does ${a} in an hour of day`, (seen[a] ?? 0) > 0);
    check("the ball is played with (it moved)", c.ball.x !== 42 || seen.play > 0);
}

// Night: mostly asleep
{
    const { seen } = run(1800, night, cat.create(5));
    const total = Object.values(seen).reduce((a, b) => a + b, 0);
    check("sleeps most of the night", (seen.sleep ?? 0) / total > 0.6, `${Math.round(100 * (seen.sleep ?? 0) / total)}%`);
}

// Day: awake most of the time
{
    const { seen } = run(1800, day, cat.create(9));
    const total = Object.values(seen).reduce((a, b) => a + b, 0);
    check("is mostly awake by day", (seen.sleep ?? 0) / total < 0.4, `${Math.round(100 * (seen.sleep ?? 0) / total)}% asleep`);
}

// The pointer: it comes over and watches; leaving lets it go on
{
    const c = cat.create(2);
    c.x = cat.LEFT;
    run(0.5, day, c);
    run(8, () => ({ night: false, hover: true, pointer: 44, busy: 0 }), c);
    check("comes to the pointer", Math.abs(c.x - 44) < 7, `x ${c.x.toFixed(1)}`);
    check("faces the pointer", c.dir === 1);
    run(0.5, day, c);
    check("goes on after the pointer leaves", c.act !== "follow");
}

// A sleeping cat is woken by a stroke, and a stroked cat purrs with hearts
{
    const c = cat.create(4);
    cat.enter(c, "sleep", 999);
    cat.pet(c);
    check("a stroke wakes a sleeping cat", c.act === "wake");
    run(2, day, c);
    cat.pet(c);
    check("a stroke makes it purr", c.act === "happy");
    const before = c.hearts.length;
    run(1.5, () => day(), c);
    check("hearts rise while it purrs", c.hearts.length > before || c.hearts.length > 0);
    run(8, day, c);
    check("the purring ends", c.act !== "happy");
}

// A busy computer: zoomies
{
    const { seen } = run(1800, () => ({ night: false, hover: false, pointer: -1, busy: 1 }), cat.create(6));
    check("races about when the computer is busy", (seen.zoom ?? 0) > 0);
}

// Every pose draws inside the canvas, from either side
{
    let outside = null;
    for (const dir of [1, -1])
        for (const x of [cat.LEFT, cat.RUG, cat.RIGHT])
            for (const act of ["sleep", "wake", "sit", "wash", "happy", "walk", "zoom", "play", "follow"]) {
                const c = cat.create(1);
                c.x = x;
                c.dir = dir;
                cat.enter(c, act, 999);
                c.batT = act === "play" ? 0.3 : 0;
                c.laps = 2;
                run(1.7, () => day(), c, (c2) => {
                    c2.x = x;
                    c2.dir = dir;
                    c2.act = act === "wake" ? c2.act : act;
                });
                const p = probe();
                cat.draw(p, c, day());
                if (p.minX < 0 || p.minY < 0 || p.maxX > cat.W || p.maxY > cat.H)
                    outside = outside ?? `${act} at ${x} facing ${dir}: ${p.minX},${p.minY} to ${p.maxX},${p.maxY}`;
            }
    check("every pose draws inside the room", !outside, outside ?? "");
}

console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
