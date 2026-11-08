#!/usr/bin/env node
// Checks the idle chain state machine (daemons/idlechain.js) without a shell.
//
// Every check steps a chain one second at a time, the way the daemon's timer does, and compares the actions with the
// times the design promises: lock, screensaver, display off and sleep after the minutes the settings say.
//
//   node scripts/idlechain-check.js [--src path/to/idlechain.js] [--only name]

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const args = {};
process.argv.slice(2).forEach((a, i, all) => a.startsWith("--") && (args[a.slice(2)] = all[i + 1]));

const source = fs.readFileSync(args.src ?? path.join(__dirname, "../daemons/idlechain.js"), "utf8").replace(/^\.pragma library$/m, "");
const lib = vm.runInNewContext(`(function () {\n${source}\nreturn { create, update, timeline };\n})`)();
// Arrays and objects made inside the vm have other prototypes, which deepStrictEqual would reject
const plain = v => JSON.parse(JSON.stringify(v));
const C = {
    create: lib.create,
    update: (chain, now, input) => plain(lib.update(chain, now, input)),
    timeline: cfg => plain(lib.timeline(cfg))
};

let failures = 0;
function check(name, fn) {
    if (args.only && !name.includes(args.only))
        return;
    try {
        fn();
        console.log(`PASS ${name}`);
    } catch (e) {
        failures++;
        console.log(`FAIL ${name}: ${e.message}`);
    }
}

const SEC = 1000;
const MIN = 60 * SEC;
const DEFAULTS = {
    lockAfter: 10,
    screensaverAfter: 2,
    displayOffAfter: 60,
    sleepWhenDisplayOff: true
};

// One session: the lock state follows the chain's own lock action, as the daemon does by locking the screen
function session(cfg = {}, start = 0) {
    const s = {
        chain: C.create(start),
        cfg: Object.assign({}, DEFAULTS, cfg),
        locked: false,
        now: start,
        events: [],
        // Moves time forward by `ms` in one call and records what came back
        jump(ms, over = {}) {
            s.now += ms;
            const input = Object.assign({ cfg: s.cfg, locked: s.locked, activity: false, paused: false, busy: false }, over);
            const actions = C.update(s.chain, s.now, input);
            if (actions.includes("lock"))
                s.locked = true;
            actions.forEach(a => s.events.push({ t: s.now, action: a }));
            return actions;
        },
        // One call per second until `until`; `over` may be an object or a function of the time
        run(until, over = {}) {
            while (s.now < until)
                s.jump(SEC, typeof over === "function" ? over(s.now + SEC) : over);
        },
        times(action) {
            return s.events.filter(e => e.action === action).map(e => e.t);
        }
    };
    return s;
}

check("defaults follow 10, 2, 60", () => {
    const s = session();
    s.run(720 * SEC + 3600 * SEC + 5 * SEC);
    assert.deepStrictEqual(s.times("lock"), [600 * SEC]);
    assert.deepStrictEqual(s.times("screensaver"), [720 * SEC]);
    assert.deepStrictEqual(s.times("displayOff"), [(720 + 3600) * SEC]);
    const sleep = s.times("sleep");
    assert.strictEqual(sleep.length, 1, "sleep once");
    assert.ok(sleep[0] - (720 + 3600) * SEC <= SEC, "sleep in the same or next call");
    assert.strictEqual(s.chain.stage, "displayOff");
});

check("a manual lock starts the y timer", () => {
    const s = session({ lockAfter: 0 });
    s.run(99 * SEC);
    s.locked = true;
    s.run(100 * SEC + 200 * SEC);
    assert.deepStrictEqual(s.times("lock"), [], "an external lock is not an action");
    assert.deepStrictEqual(s.times("screensaver"), [220 * SEC]);
});

check("input delays the screensaver", () => {
    const s = session();
    s.run(700 * SEC, t => ({ activity: t === 700 * SEC }));
    assert.deepStrictEqual(s.times("lock"), [600 * SEC]);
    assert.deepStrictEqual(s.times("screensaver"), [], "not started before the input");
    s.run(700 * SEC + 200 * SEC);
    assert.deepStrictEqual(s.times("screensaver"), [(700 + 120) * SEC]);
});

check("wake returns to the lock UI", () => {
    const s = session();
    s.run(721 * SEC);
    assert.strictEqual(s.chain.stage, "screensaver");
    assert.deepStrictEqual(s.jump(SEC, { activity: true }), ["wake"]);
    assert.strictEqual(s.chain.stage, "locked");
    const wokeAt = s.now;
    s.run(wokeAt + 300 * SEC);
    assert.deepStrictEqual(s.times("screensaver"), [720 * SEC, wokeAt + 120 * SEC]);
});

check("input turns the display back on", () => {
    const s = session();
    s.run((720 + 3600 + 1) * SEC);
    assert.strictEqual(s.chain.stage, "displayOff");
    assert.deepStrictEqual(s.jump(SEC, { activity: true }), ["wake"]);
    assert.strictEqual(s.chain.stage, "locked");
    s.run(s.now + 119 * SEC);
    assert.strictEqual(s.chain.stage, "locked");
    assert.deepStrictEqual(s.jump(SEC), ["screensaver"]);
});

check("zero disables", () => {
    const off = session({ screensaverAfter: 0 });
    off.run(4 * 3600 * SEC);
    assert.deepStrictEqual(off.times("lock"), [600 * SEC]);
    assert.deepStrictEqual(off.times("screensaver"), [], "no screensaver");
    assert.deepStrictEqual(off.times("displayOff"), [], "no display off without a screensaver");

    const manual = session({ lockAfter: 0 });
    manual.run(2 * 3600 * SEC);
    assert.deepStrictEqual(manual.events, [], "no automatic lock");
    manual.locked = true;
    manual.run(manual.now + (2 + 60) * 60 * SEC + 10 * SEC);
    assert.strictEqual(manual.times("screensaver").length, 1);
    assert.strictEqual(manual.times("displayOff").length, 1);
    assert.strictEqual(manual.times("sleep").length, 1);

    const stay = session({ displayOffAfter: 0 });
    stay.run(4 * 3600 * SEC);
    assert.strictEqual(stay.chain.stage, "screensaver", "the screensaver stays up");
});

check("busy delays sleep", () => {
    const s = session();
    s.run((720 + 3600 + 600) * SEC, { busy: true });
    assert.strictEqual(s.chain.stage, "displayOff");
    assert.deepStrictEqual(s.times("sleep"), [], "no sleep while busy");
    assert.deepStrictEqual(s.jump(SEC, { busy: false }), ["sleep"]);
    assert.deepStrictEqual(s.jump(SEC), [], "sleep once per entry");

    const never = session({ sleepWhenDisplayOff: false });
    never.run((720 + 3600) * SEC + 3600 * SEC);
    assert.strictEqual(never.chain.stage, "displayOff");
    assert.deepStrictEqual(never.times("sleep"), []);
});

check("paused freezes the chain", () => {
    const s = session();
    s.run(3600 * SEC, { paused: true });
    assert.deepStrictEqual(s.events, [], "nothing while paused");
    const pausedUntil = s.now;
    s.run(pausedUntil + 599 * SEC);
    assert.deepStrictEqual(s.events, [], "ten minutes of quiet after the pause");
    assert.deepStrictEqual(s.jump(SEC), ["lock"]);
});

check("paused holds a running screensaver", () => {
    const s = session();
    s.run(721 * SEC);
    s.run(721 * SEC + 7200 * SEC, { paused: true });
    assert.strictEqual(s.chain.stage, "screensaver");
    const pausedUntil = s.now;
    s.run(pausedUntil + 3599 * SEC);
    assert.strictEqual(s.chain.stage, "screensaver");
    assert.deepStrictEqual(s.jump(SEC), ["displayOff"]);
});

check("input while paused still wakes", () => {
    const s = session();
    s.run(721 * SEC);
    assert.strictEqual(s.chain.stage, "screensaver");
    s.run(s.now + 60 * SEC, { paused: true });
    assert.strictEqual(s.chain.stage, "screensaver", "a pause alone does not wake");
    assert.deepStrictEqual(s.jump(SEC, { paused: true, activity: true }), ["wake"]);
    assert.strictEqual(s.chain.stage, "locked");
    assert.deepStrictEqual(s.jump(SEC, { paused: true }), [], "still frozen");

    const d = session();
    d.run((720 + 3600 + 1) * SEC);
    assert.strictEqual(d.chain.stage, "displayOff");
    assert.deepStrictEqual(d.jump(SEC, { paused: true }), [], "no sleep while paused");
    assert.deepStrictEqual(d.jump(SEC, { paused: true, activity: true }), ["wake"]);
    assert.strictEqual(d.chain.stage, "locked");
});

check("a time jump gives one stage", () => {
    const s = session();
    assert.deepStrictEqual(s.jump(8 * 3600 * SEC), ["lock"]);
    s.run(s.now + 119 * SEC);
    assert.deepStrictEqual(s.events.map(e => e.action), ["lock"]);
    assert.deepStrictEqual(s.jump(SEC), ["screensaver"]);
    assert.deepStrictEqual(s.jump(8 * 3600 * SEC), ["displayOff"], "one stage even after hours");
    assert.deepStrictEqual(s.jump(SEC), ["sleep"]);
});

check("external lock and unlock", () => {
    const s = session();
    s.run(30 * SEC);
    s.locked = true;
    assert.deepStrictEqual(s.jump(SEC), [], "no action for a lock the chain did not make");
    assert.strictEqual(s.chain.stage, "locked");
    s.locked = false;
    assert.deepStrictEqual(s.jump(SEC), []);
    assert.strictEqual(s.chain.stage, "active");
    // The idle time counts from the unlock, not from the start
    s.run(s.now + 599 * SEC);
    assert.deepStrictEqual(s.events, []);
    assert.deepStrictEqual(s.jump(SEC), ["lock"]);

    // Unlocking from the screensaver or a dark screen has to bring the screen back
    const t = session();
    t.run(721 * SEC);
    t.locked = false;
    assert.deepStrictEqual(t.jump(SEC), ["wake"]);
    assert.strictEqual(t.chain.stage, "active");
});

check("timeline", () => {
    assert.deepStrictEqual(C.timeline(DEFAULTS), { lockAt: 10, screensaverAt: 12, displayOffAt: 72 });
    assert.deepStrictEqual(C.timeline(Object.assign({}, DEFAULTS, { screensaverAfter: 0 })), { lockAt: 10, screensaverAt: null, displayOffAt: null });
    assert.deepStrictEqual(C.timeline(Object.assign({}, DEFAULTS, { lockAfter: 0 })), { lockAt: null, screensaverAt: null, displayOffAt: null });
    assert.deepStrictEqual(C.timeline(Object.assign({}, DEFAULTS, { displayOffAfter: 0 })), { lockAt: 10, screensaverAt: 12, displayOffAt: null });
});

if (failures) {
    console.log(`${failures} check(s) failed`);
    process.exit(1);
}
console.log("all checks passed");
