.pragma library

// Game logic of the lock screen runner. It has no QML dependencies so scripts/runner-check.js can run it headless.
// Units are art pixels (the QML side scales them), x to the right and y up from the ground.
// A runner is a penguin on ice or a dragon in a cave. The dragon breathes fire.

var SPEED = 62; // world scroll, the same all run
var GRAVITY = 430;
var JUMP = 150;
var STEP_SPEED = 40;
var DIVE = 3; // gravity multiplier while down is held in the air
var FIRE_SPEED = 130;
var FIRE_COOLDOWN = 0.6;
var FLAME = {
    w: 9,
    h: 5
};
var STEP_UP = 2; // how far below a platform's top the feet may be and still get up

var SPRITES = {
    penguin: {
        run: [["....BBBBB....", "...BBBBBBB...", "..BBBBBBWKB..", "..BBBBBWWWBOO", "..BBBBWWWWBO.", ".BBBBWWWWWB..", "BBBBWWWWWWWB.", "B.BBWWWWWWWB.", "..BBWWWWWWWB.", "..BBWWWWWWWB.", "..BBWWWWWWB..", "...BBWWWWBB..", "....BBBBBB...", "....O....O...", "...OO...OO..."], ["....BBBBB....", "...BBBBBBB...", "..BBBBBBWKB..", "..BBBBBWWWBOO", "..BBBBWWWWBO.", ".BBBBWWWWWB..", "BBBBWWWWWWWB.", "B.BBWWWWWWWB.", "..BBWWWWWWWB.", "..BBWWWWWWWB.", "..BBWWWWWWB..", "...BBWWWWBB..", "....BBBBBB...", ".....O.O.....", "....OO.OO...."]],
        jump: ["....BBBBB....", "...BBBBBBB...", "..BBBBBBWKB..", "..BBBBBWWWBOO", "B.BBBBWWWWBO.", "BBBBBWWWWWB..", ".BBBWWWWWWWB.", "..BBWWWWWWWB.", "..BBWWWWWWWB.", "..BBWWWWWWWB.", "..BBWWWWWWB..", "...BBWWWWBB..", "....BBBBBB...", ".....OO.O....", "............."],
        duck: ["...........BBBB..", ".........BBBBWKB.", "...BBBBBBBBBWWWBO", ".BBBBBBBBBBBWWBOO", "BBWWWWWWWWWWWWWB.", ".BWWWWWWWWWWWWB..", "..BBBBBBBBBBBB...", "OO..............."]
    },
    dragon: {
        run: [["...............R.R..", "....R.........GGGG..", "....RR.......GGKGGG.", ".....RR......GGGGGGG", ".....RRR....GGGGG...", "......RRR..GGGG.....", "R.....RRRRGGGG......", "RR..R.GGGGGGGG......", ".RGGGGGGYYYYGG......", "..GG.GGGYYYYGG......", "......GGGYYYGG......", "......GGG..GG.......", ".......G....G.......", "......GG...GG......."], ["...............R.R..", "..............GGGG..", ".............GGKGGG.", ".............GGGGGGG", "............GGGGG...", "...........GGGG.....", "R...R.R.R.GGGG......", "RR..GGGGGGGGGG......", ".RGGGRRRRRYYGG......", "..GG.GRRRRYYGG......", "......GGRRRYGG......", ".......GG.GG........", ".......G..G.........", "......GG.GG........."]],
        jump: ["...............R.R..", "..R...........GGGG..", "..RR.........GGKGGG.", "...RR........GGGGGGG", "...RRR......GGGGG...", "....RRRR...GGGG.....", "R....RRRRRGGGG......", "RR..R.GGGGGGGG......", ".RGGGGGGYYYYGG......", "..GG.GGGYYYYGG......", "......GGGYYYGG......", "......GGGGGG........", "....................", "...................."],
        duck: ["....................R.R.", "...................GGGG.", "..R.R.R.R.R.......GGKGGG", "R.GGGGGGGGGGGGGGGGGGGGGG", "RRGGGGGRRRRRRYYYYGGG....", ".RGGGGGGRRRRYYYYGG......", "....GGGGGGGGGGGGG.......", ".....GG.......GG........", "....GG.......GG........."]
    },
    flyer: [["S......S.", ".S....S..", "OSSSSSS..", "..SSSS..."], [".........", "OSSSSSS..", ".S.SS.S..", "S......S."]],
    snowman: ["...HHH...", "...HHH...", "..HHHHH..", "...SSS...", "..SKSKS..", "..SSOSS..", "...SSS...", "..SSSSS..", ".SSSKSSS.", "SSSSSSSSS", "SSSSKSSSS", "SSSSSSSSS", ".SSSSSSS.", "..SSSSS.."],
    gem: ["..G..", ".GGG.", "GGGGG", ".GGG.", "..G.."],
    flame: [[".....FF..", "..RRFFOO.", "RRFFOOYYY", "..RRFFOO.", ".....FF.."], ["......F..", "...RFFOO.", "RRRFOOYYY", "...RFFOO.", "......F.."]]
};

// Standing and ducking size per runner, taken from the sprites
var SIZES = {};
for (const name of ["penguin", "dragon"]) {
    const dims = rows => ({
            w: rows[0].length,
            h: rows.length
        });
    SIZES[name] = {
        stand: dims(SPRITES[name].run[0]),
        duck: dims(SPRITES[name].duck)
    };
}

function create(world, worldWidth) {
    return {
        world,
        worldWidth,
        phase: "idle", // idle, running or over
        time: 0,
        overTime: 0,
        distance: 0,
        bonus: 0,
        seed: 1,
        nextGap: 0,
        x: 10, // left edge of the sprite
        y: 0, // height of the feet
        vy: 0,
        grounded: true,
        ducking: false,
        left: false,
        right: false,
        cooldown: 0,
        obstacles: [], // { kind, x, w, lo, hi }, lo and hi being the bottom and top height
        flames: [], // { x, y }, y being the bottom
        puffs: [] // { x, y, t }, where something burnt up
    };
}

function score(s) {
    return Math.floor(s.distance / 10) + s.bonus;
}

function difficulty(s) {
    return Math.min(1, s.distance / 3000);
}

// mulberry32, seeded per run so every run gets its own map
function random(s) {
    s.seed = (s.seed + 0x6D2B79F5) >>> 0;
    let t = s.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function start(s, seed) {
    s.seed = seed >>> 0;
    s.obstacles = [];
    s.flames = [];
    s.puffs = [];
    s.distance = 0;
    s.bonus = 0;
    s.nextGap = s.worldWidth * 0.6;
    s.x = 10;
    s.y = 0;
    s.vy = JUMP; // Starts with a hop
    s.grounded = false;
    s.cooldown = 0;
    s.phase = "running";
}

function setWorld(s, world) {
    s.world = world;
    s.obstacles = [];
    s.flames = [];
    s.puffs = [];
    s.ducking = false;
}

// The runner's body, a little inside the sprite and clear of the tail
function hitbox(s) {
    const d = SIZES[s.world][s.ducking && s.grounded ? "duck" : "stand"];
    return {
        left: s.x + Math.round(d.w / 4),
        right: s.x + d.w - 3,
        feet: s.y,
        head: s.y + d.h - 2
    };
}

// Arrow keys: "up", "down", "left", "right". Returns whether the game used the key
function key(s, name, pressed, seed) {
    if (name === "left")
        s.left = pressed;
    else if (name === "right")
        s.right = pressed;
    else if (name === "down")
        s.ducking = pressed;
    else if (name !== "up")
        return false;

    if (s.phase !== "running") {
        if (pressed && (name === "left" || name === "right")) {
            setWorld(s, s.world === "penguin" ? "dragon" : "penguin");
        } else if (pressed && name === "up" && (s.phase === "idle" || s.time - s.overTime > 0.5)) {
            // The short pause after a crash keeps a panicked jump from restarting right away
            start(s, seed);
        }
    } else if (name === "up" && pressed && s.grounded) {
        s.vy = JUMP;
        s.grounded = false;
    }
    return true;
}

// Highest platform top the feet can stand on, or land on when coming down from height `from`
function support(s, hb, from) {
    let h = 0;
    for (const o of s.obstacles) {
        if (o.kind === "platform" && o.hi > h && o.hi <= from + STEP_UP && hb.right > o.x + 1 && hb.left < o.x + o.w - 1)
            h = o.hi;
    }
    return h;
}

function push(s, kind, x, w, lo, hi) {
    const o = {
        kind,
        x,
        w,
        lo,
        hi
    };
    s.obstacles.push(o);
    return o;
}

// A raised section to jump onto: one step, or stairs. Each step up is well within a jump, which reaches about 26
function ridge(s, x) {
    const kind = random(s);
    const gem = (px, w, top) => push(s, "gem", px + Math.floor(w / 2) - 2, 5, top + 20, top + 25);
    if (kind < 0.5) {
        const h = [8, 12, 16][Math.floor(random(s) * 3)];
        const w = 26 + Math.floor(random(s) * 15);
        push(s, "platform", x, w, 0, h);
        if (h >= 12)
            gem(x, w, h);
        return w;
    }

    const h1 = random(s) < 0.5 ? 8 : 10;
    const h2 = h1 + (random(s) < 0.5 ? 8 : 10);
    const w1 = 18 + Math.floor(random(s) * 5);
    const w2 = 24 + Math.floor(random(s) * 9);
    push(s, "platform", x, w1, 0, h1);
    push(s, "platform", x + w1, w2, 0, h2);
    gem(x + w1, w2, h2);
    return w1 + w2;
}

// Spawns the next obstacle or pattern. Gaps leave time to land and react, and shrink as the run goes on
function spawn(s) {
    const d = difficulty(s);
    const x = s.worldWidth + 2;
    const ice = s.world === "penguin";
    const block = ice ? "block" : "rock";
    const weights = [["ledge", 0.12 + 0.2 * d], ["flyer", 0.1 + 0.1 * d], ["ridge", s.distance > 250 ? 0.16 : 0], ["double", 0.1 + 0.06 * d], ["tall", 0.2], ["single", 0.3]];
    let roll = random(s) * weights.reduce((sum, w) => sum + w[1], 0);
    let pattern = "single";
    for (const w of weights) {
        pattern = w[0];
        roll -= w[1];
        if (roll < 0)
            break;
    }

    let width = 0;
    let settle = 0; // extra room to land and get ready afterwards
    if (pattern === "ledge") {
        // A ledge to duck under: jumping hits it too
        width = 12 + Math.floor(random(s) * 9);
        push(s, "ledge", x, width, 11, 30);
    } else if (pattern === "flyer") {
        width = 9;
        push(s, "flyer", x, width, 11, 15);
    } else if (pattern === "ridge") {
        width = ridge(s, x);
        settle = 10;
    } else if (pattern === "double") {
        // Two low ones in a row
        const h = 5 + Math.floor(random(s) * 3);
        push(s, block, x, 7, 0, h);
        push(s, block, x + 8, 8, 0, h + 1);
        width = 16;
    } else if (pattern === "tall") {
        if (ice) {
            width = 9;
            push(s, "snowman", x, width, 0, 14);
        } else {
            width = 5;
            push(s, "pillar", x, width, 0, 12 + Math.floor(random(s) * 4));
        }
    } else {
        width = 6 + 2 * Math.floor(random(s) * 3);
        push(s, block, x, width, 0, 6 + 2 * Math.floor(random(s) * 3));
    }

    const minGap = 52 - 12 * d;
    const maxGap = 110 - 40 * d;
    s.nextGap = minGap + random(s) * (maxGap - minGap) + width + settle;
}

function breathe(s) {
    const d = SIZES.dragon[s.ducking && s.grounded ? "duck" : "stand"];
    s.flames.push({
        x: s.x + d.w - 2,
        y: s.y + d.h - 7
    });
    s.cooldown = FIRE_COOLDOWN;
}

// Fire burns up bats and rocks. Lava, ledges and platforms put it out
function burn(s) {
    for (const f of s.flames) {
        for (const o of s.obstacles) {
            if (o.kind === "gem" || o.dead || f.x + FLAME.w <= o.x || f.x >= o.x + o.w || f.y + FLAME.h < o.lo - 1 || f.y > o.hi + 1)
                continue;
            f.dead = true;
            if (o.kind === "flyer" || o.kind === "rock") {
                o.dead = true;
                s.bonus += 5;
                s.puffs.push({
                    x: o.x + o.w / 2,
                    y: (o.lo + o.hi) / 2,
                    t: 0
                });
            }
            break;
        }
    }
    s.obstacles = s.obstacles.filter(o => !o.dead);
    s.flames = s.flames.filter(f => !f.dead && f.x < s.worldWidth + 8);
}

// The world scrolls past, whatever the runner does
function scroll(s, dt) {
    s.distance += SPEED * dt;
    for (const o of s.obstacles)
        o.x -= SPEED * dt;
    s.obstacles = s.obstacles.filter(o => o.x + o.w > -4);

    s.nextGap -= SPEED * dt;
    if (s.nextGap <= 0)
        spawn(s);
}

// The runner moves with the keys, gravity and platforms to stand on or land on
function run(s, dt) {
    const dir = (s.right && s.world === "penguin" ? 1 : 0) - (s.left ? 1 : 0);
    s.x = Math.max(2, Math.min(s.worldWidth * 0.6, s.x + dir * STEP_SPEED * dt));

    const floor = support(s, hitbox(s), s.y);
    if (s.vy > 0 || s.y > floor) {
        s.vy -= GRAVITY * (s.ducking ? DIVE : 1) * dt;
        s.y += s.vy * dt;
    }
    if (s.vy <= 0 && s.y <= floor) {
        s.y = floor;
        s.vy = 0;
    }
    s.grounded = s.y <= floor;
}

// What the runner is inside of: gems to pick up, anything else is a crash
function touching(s) {
    const hb = hitbox(s);
    return s.obstacles.filter(o => hb.right > o.x + 1 && hb.left < o.x + o.w - 1 && hb.feet < o.hi - (o.kind === "platform" ? STEP_UP : 1) && hb.head > o.lo);
}

function step(s, dt) {
    dt = Math.min(dt, 0.05);
    s.time += dt;
    for (const p of s.puffs) {
        p.t += dt;
        if (s.phase === "running")
            p.x -= SPEED * dt;
    }
    s.puffs = s.puffs.filter(p => p.t < 0.35);
    if (s.phase !== "running")
        return;

    s.cooldown = Math.max(0, s.cooldown - dt);
    scroll(s, dt);
    run(s, dt);

    if (s.right && s.cooldown === 0 && s.world === "dragon")
        breathe(s);
    for (const f of s.flames)
        f.x += FIRE_SPEED * dt;
    burn(s);

    for (const o of touching(s)) {
        if (o.kind === "gem") {
            o.dead = true;
            s.bonus += 10;
        } else {
            s.phase = "over";
            s.overTime = s.time;
            s.flames = [];
            break;
        }
    }
    s.obstacles = s.obstacles.filter(o => !o.dead);
}
