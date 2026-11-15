.pragma library

// The dashboard cat: a pixel cat in a room that is 64 virtual pixels high and as wide as its card. It sleeps on its rug at night, and by day walks,
// sits, washes, bats a ball of yarn about, comes to the pointer and purrs when it is stroked. It has no QML dependencies,
// draws with fillRect only, and all of its randomness goes through c.s, so scripts/cat-render.js can draw it into a PNG and
// scripts/cat-check.js can run it for days.

// The room is H high and w wide (at least H, set by the card's shape). The cat reaches 19 pixels behind its feet (the
// tail) and 17 in front, so MARGIN keeps it inside the room
var H = 64;
var FLOOR = 52;
var MARGIN = 20;

var OUT = "#16161e";
var FUR = "#a9b1d6";
var LIGHT = "#c0caf5";
var SHADE = "#737aa2";
var STRIPE = "#565f89";
var PINK = "#f7768e";
var EYE = "#1a1b26";
var RUG_A = "#3d59a1";
var RUG_B = "#2a3a6e";
var RUG_RIM = "#7aa2f7";
var YARN = "#e0af68";
var YARN_DARK = "#b9894a";
var ZED = "#7dcfff";

function create(seed, w) {
    w = Math.max(H, Math.round(w || H));
    return {
        w: w,
        rug: w / 2,
        s: (seed | 0) || 1,
        t: 0,
        x: w / 2,
        dir: 1,
        act: "sit",
        actT: 0,
        actDur: 3,
        tx: w / 2,
        phase: 0,
        moving: false,
        blink: 2,
        blinkT: 0,
        bats: 0,
        batCool: 0,
        batT: 0,
        purr: 0,
        look: 0,
        hoverT: 0,
        ball: { x: w / 2 + 10, h: 0, vx: 0, vh: 0 },
        zs: [],
        hearts: [],
        zT: 0
    };
}

function rnd(c) {
    c.s = (Math.imul(c.s, 1664525) + 1013904223) >>> 0;
    return c.s / 4294967296;
}

function enter(c, act, dur) {
    c.act = act;
    c.actT = 0;
    c.actDur = dur;
    c.bats = 0;
    c.batT = 0;
}

function walkTo(c, x) {
    c.tx = Math.max(MARGIN, Math.min(c.w - MARGIN, x));
}

function choose(c, env) {
    var r = rnd(c);
    if (env.hover) {
        enter(c, "follow", 1e9);
    } else if (env.night) {
        if (r < 0.65)
            enter(c, "goSleep", 1e9);
        else if (r < 0.8)
            enter(c, "wash", 4 + rnd(c) * 3);
        else if (r < 0.9)
            enter(c, "sit", 3 + rnd(c) * 4);
        else {
            walkTo(c, MARGIN + rnd(c) * (c.w - 2 * MARGIN));
            enter(c, "walk", 1e9);
        }
    } else if (env.busy > 0.7 && r < 0.3) {
        enter(c, "zoom", 1e9);
        c.laps = 3;
        walkTo(c, c.x < c.rug ? c.w : 0);
    } else if (r < 0.3) {
        walkTo(c, MARGIN + rnd(c) * (c.w - 2 * MARGIN));
        enter(c, "walk", 1e9);
    } else if (r < 0.5) {
        enter(c, "sit", 3 + rnd(c) * 5);
    } else if (r < 0.65) {
        enter(c, "wash", 4 + rnd(c) * 3);
    } else if (r < 0.9) {
        enter(c, "play", 9 + rnd(c) * 6);
    } else {
        enter(c, "goSleep", 1e9);
    }
}

// Strokes the cat: it purrs for a while and hearts rise
function pet(c) {
    if (c.act === "sleep")
        enter(c, "wake", 1.5);
    else if (c.act !== "wake") {
        if (c.act !== "happy")
            enter(c, "happy", 3.5);
        else
            c.actDur = c.actT + 3.5;
        c.hearts.push({ x: c.x + (rnd(c) - 0.5) * 8, y: FLOOR - 26, a: 0 });
    }
}

function moveToward(c, dt, speed) {
    var d = c.tx - c.x;
    var step = speed * dt;
    c.moving = Math.abs(d) > 0.4;
    if (!c.moving)
        return true;
    c.dir = d > 0 ? 1 : -1;
    c.x += Math.abs(d) <= step ? d : c.dir * step;
    c.phase += step * 0.9;
    return Math.abs(c.tx - c.x) < 0.4;
}

function stepBall(c, dt) {
    var b = c.ball;
    b.x += b.vx * dt;
    if (b.x < 8 || b.x > c.w - 8) {
        b.x = Math.max(8, Math.min(c.w - 8, b.x));
        b.vx = -b.vx * 0.7;
    }
    if (b.h > 0 || b.vh > 0) {
        b.vh -= 40 * dt;
        b.h += b.vh * dt;
        if (b.h <= 0) {
            b.h = 0;
            b.vh = Math.abs(b.vh) > 4 ? -b.vh * 0.45 : 0;
        }
    } else
        b.vx *= Math.pow(0.35, dt);
    if (Math.abs(b.vx) < 0.3 && b.h === 0)
        b.vx = 0;
}

// env: { night, hover, pointer (x in virtual pixels or -1), busy (0..1 load) }
function step(c, dt, env) {
    dt = Math.min(dt, 0.1);
    c.t += dt;
    c.actT += dt;
    c.blink -= dt;
    if (c.blink < 0) {
        c.blinkT = 0.13;
        c.blink = 2 + rnd(c) * 4;
    }
    c.blinkT = Math.max(0, c.blinkT - dt);
    c.batCool = Math.max(0, c.batCool - dt);
    c.moving = false;
    c.hoverT = env.hover ? c.hoverT + dt : 0;
    stepBall(c, dt);

    var done = c.actT >= c.actDur;
    switch (c.act) {
    case "sleep":
        if (done || (env.hover && c.hoverT > 1.5))
            enter(c, "wake", 1.5);
        break;
    case "wake":
        if (done)
            choose(c, env);
        break;
    case "goSleep":
        c.tx = c.rug;
        if (moveToward(c, dt, 8))
            enter(c, "sleep", env.night ? 60 + rnd(c) * 60 : 15 + rnd(c) * 20);
        break;
    case "walk":
        if (moveToward(c, dt, 9))
            choose(c, env);
        break;
    case "zoom":
        if (moveToward(c, dt, 26)) {
            if (--c.laps <= 0)
                enter(c, "sit", 2);
            else
                walkTo(c, c.tx > c.rug ? 0 : c.w);
        }
        break;
    case "sit":
    case "wash":
        if (env.hover)
            enter(c, "follow", 1e9);
        else if (done)
            choose(c, env);
        break;
    case "happy":
        if (done)
            enter(c, "sit", 3);
        break;
    case "follow":
        if (!env.hover) {
            choose(c, env);
            break;
        }
        walkTo(c, env.pointer);
        if (Math.abs(c.tx - c.x) > 6)
            moveToward(c, dt, 13);
        else if (env.pointer >= 0)
            c.dir = env.pointer >= c.x ? 1 : -1;
        break;
    case "play":
        if (env.hover) {
            enter(c, "follow", 1e9);
            break;
        }
        if (done || c.bats >= 4) {
            choose(c, env);
            break;
        }
        if (c.batT > 0) {
            c.batT -= dt;
            if (c.batT <= 0) {
                c.ball.vx = c.dir * (18 + rnd(c) * 12);
                c.ball.vh = 9 + rnd(c) * 7;
                c.batCool = 0.7;
                c.bats++;
            }
        } else {
            var dir = c.ball.x >= c.x ? 1 : -1;
            c.tx = Math.max(MARGIN, Math.min(c.w - MARGIN, c.ball.x - dir * 10));
            if (Math.abs(c.tx - c.x) > 1.5 || c.ball.vx !== 0)
                moveToward(c, dt, 14);
            else
                c.dir = dir;
            if (Math.abs(c.ball.x - c.x) < 14 && c.ball.vx === 0 && c.batCool <= 0 && !c.moving)
                c.batT = 0.4;
        }
        break;
    }

    // The head follows the pointer when the cat sits still
    c.look = env.hover && !c.moving && env.pointer >= 0 ? (Math.abs(env.pointer - c.x) < 4 ? 0 : env.pointer > c.x ? 1 : -1) * c.dir : 0;

    c.zT -= dt;
    if (c.act === "sleep" && c.zT <= 0) {
        c.zs.push({ x: c.x + 8 * c.dir, y: FLOOR - 16, a: 0 });
        c.zT = 1.6;
    }
    var live = [];
    c.zs.forEach(function (z) {
        z.a += dt;
        z.y -= dt * 4;
        z.x += dt * 1.5;
        if (z.a < 3)
            live.push(z);
    });
    c.zs = live;
    live = [];
    c.hearts.forEach(function (h) {
        h.a += dt;
        h.y -= dt * 7;
        if (h.a < 2)
            live.push(h);
    });
    c.hearts = live;
    if (c.act === "happy" && Math.floor(c.actT * 2.5) !== Math.floor((c.actT - dt) * 2.5))
        c.hearts.push({ x: c.x + (rnd(c) - 0.5) * 10, y: FLOOR - 24, a: 0 });
}

// ---- drawing ----------------------------------------------------------------------------------------------------

function rr(out, x, y, w, h) {
    out.push([x + 1, y, w - 2, 1], [x, y + 1, w, h - 2], [x + 1, y + h - 1, w - 2, 1]);
}

function tail(fur, x, y, t, rise, amp, speed) {
    for (var i = 0; i < 8; i++)
        fur.push([Math.round(x - i * 0.9), Math.round(y - rise * i + Math.sin(t * speed + i * 0.6) * i * amp), 2, 2]);
}

// The head faces the viewer; open eyes look to one side with look in -1..1
function head(p, x, y, eyes, look) {
    rr(p.fur, x, y, 10, 9);
    p.fur.push([x + 1, y - 2, 2, 2], [x + 7, y - 2, 2, 2]);
    p.det.push([x + 2, y - 1, 1, 1, PINK], [x + 7, y - 1, 1, 1, PINK]);
    p.det.push([x + 4, y, 1, 2, STRIPE], [x + 5, y, 1, 2, STRIPE]);
    if (eyes === "open") {
        p.det.push([x + 2 + look, y + 3, 1, 2, EYE], [x + 7 + look, y + 3, 1, 2, EYE]);
    } else if (eyes === "wide") {
        p.det.push([x + 2 + look, y + 3, 2, 3, EYE], [x + 6 + look, y + 3, 2, 3, EYE]);
    } else if (eyes === "happy") {
        p.det.push([x + 1, y + 4, 1, 1, EYE], [x + 2, y + 3, 1, 1, EYE], [x + 3, y + 4, 1, 1, EYE]);
        p.det.push([x + 6, y + 4, 1, 1, EYE], [x + 7, y + 3, 1, 1, EYE], [x + 8, y + 4, 1, 1, EYE]);
    } else {
        p.det.push([x + 1, y + 4, 3, 1, EYE], [x + 6, y + 4, 3, 1, EYE]);
    }
    p.det.push([x + 4, y + 5, 2, 1, PINK]);
}

function pose(c, env) {
    var p = { fur: [], det: [], dy: 0 };
    var t = c.t;
    var blink = c.blinkT > 0;
    var eyes = blink ? "closed" : "open";
    var act = c.act;
    var i;
    if (act === "sleep") {
        var breath = Math.sin(t * 1.6) > 0 ? 1 : 0;
        p.dy = -3;
        rr(p.fur, -12, -9 - breath, 24, 9 + breath);
        p.det.push([-10, -9 - breath, 20, 1, LIGHT]);
        p.det.push([-6, -9 - breath, 1, 3, STRIPE], [-2, -9 - breath, 1, 3, STRIPE], [2, -9 - breath, 1, 3, STRIPE]);
        head(p, 8, -11, "closed", 0);
        p.fur.push([-12, -3, 22, 3]);
        p.det.push([-12, -1, 22, 1, SHADE]);
    } else if (act === "wake") {
        var k = Math.min(1, c.actT / c.actDur);
        // front down, rear up, then up on all fours
        var lift = k < 0.75 ? 1 : 0;
        rr(p.fur, -11, -14 + (lift ? 0 : 5), 10, 9 - (lift ? 0 : 5) + 1);
        rr(p.fur, -4, lift ? -9 : -12, 12, lift ? 5 : 8);
        p.fur.push([-10, -6, 2, 6], [-7, -6, 2, 6]);
        p.fur.push([lift ? 5 : 1, lift ? -3 : -4, lift ? 9 : 2, lift ? 2 : 4]);
        head(p, lift ? 8 : 6, lift ? -9 : -19, lift ? "closed" : eyes, 0);
        tail(p.fur, -11, lift ? -13 : -11, t, 1.2, 0.12, 3);
    } else if (act === "sit" || act === "wash" || act === "happy" || (act === "follow" && !c.moving)) {
        var happy = act === "happy";
        var wash = act === "wash";
        var bobY = happy ? (Math.sin(t * 9) > 0.5 ? -1 : 0) : 0;
        rr(p.fur, -6, -17 + bobY, 9, 17 - bobY);
        rr(p.fur, -10, -8, 8, 8);
        p.fur.push([2, -9, 2, 9]);
        p.det.push([-6, -17 + bobY, 7, 1, LIGHT], [-4, -8, 1, 3, STRIPE], [-8, -4, 1, 3, STRIPE]);
        head(p, -4, -27 + (wash ? 2 : 0) + bobY, happy ? "happy" : eyes, c.look);
        if (wash) {
            var lick = Math.floor(t * 4) % 2;
            p.fur.push([3, -23 + lick, 2, 7]);
            p.det.push([3, -23 + lick, 2, 1, LIGHT]);
        }
        tail(p.fur, -9, -2, t, happy ? 1.4 : -0.1, happy ? 0.5 : 0.18, happy ? 9 : 2.2);
    } else if (act === "play" && c.batT > 0) {
        // crouched, rear wiggling, one paw out
        p.fur.push([-10, -3, 2, 3], [-7, -3, 2, 3]);
        rr(p.fur, -11, -10 + (Math.sin(t * 30) > 0 ? 1 : 0), 17, 7);
        p.fur.push([6, -3, 7, 3]);
        head(p, 6, -14, "wide", 1);
        tail(p.fur, -11, -9, t, 0.5, 0.35, 12);
        p.det.push([-9, -10, 12, 1, LIGHT]);
    } else {
        // standing and walking
        var moving = c.moving;
        var fast = act === "zoom";
        var bob = moving && Math.sin(c.phase * 2) > 0 ? 1 : 0;
        for (i = 0; i < 4; i++) {
            var lx = [-9, -6, 2, 5][i];
            var up = moving ? Math.max(0, Math.sin(c.phase + i * Math.PI / 2 * 1.3)) : 0;
            p.fur.push([lx + (up > 0.3 ? (i < 2 ? -1 : 1) : 0), -5, 2, 5 - Math.round(up * 2)]);
        }
        rr(p.fur, -10, -12 + bob, 18, 8);
        p.det.push([-9, -12 + bob, 15, 1, LIGHT], [-6, -12 + bob, 1, 3, STRIPE], [-3, -12 + bob, 1, 3, STRIPE], [0, -12 + bob, 1, 3, STRIPE]);
        p.det.push([-9, -5 + bob, 16, 1, SHADE]);
        head(p, 6, -19 + bob, fast ? "wide" : eyes, c.look);
        tail(p.fur, -10, -11 + bob, t, moving ? 0.9 : 1.0, moving ? 0.1 : 0.25, moving ? 8 : 2.5);
    }
    return p;
}

var HEART = ["0110110", "1111111", "0111110", "0011100", "0001000"];
var Z = ["111", "010", "111"];

function pixels(ctx, pattern, x, y, col) {
    ctx.fillStyle = col;
    for (var j = 0; j < pattern.length; j++)
        for (var i = 0; i < pattern[j].length; i++)
            if (pattern[j][i] === "1")
                ctx.fillRect(Math.round(x) + i, Math.round(y) + j, 1, 1);
}

// A window with the sky of the hour, 14 wide, its left edge at x
function drawWindow(ctx, x, night) {
    ctx.fillStyle = "#414868";
    ctx.fillRect(x, 5, 14, 14);
    ctx.fillStyle = night ? "#10121c" : "#7aa2f7";
    ctx.fillRect(x + 1, 6, 12, 12);
    ctx.fillStyle = night ? "#c0caf5" : "#e0af68";
    if (night) {
        ctx.fillRect(x + 6, 8, 3, 3);
        ctx.fillStyle = "#10121c";
        ctx.fillRect(x + 7, 8, 2, 2);
        ctx.fillStyle = "#c0caf5";
        ctx.fillRect(x + 3, 14, 1, 1);
        ctx.fillRect(x + 10, 15, 1, 1);
        ctx.fillRect(x + 4, 9, 1, 1);
    } else {
        ctx.fillRect(x + 5, 8, 4, 4);
        ctx.fillStyle = "#b9c8f5";
        ctx.fillRect(x + 2, 14, 5, 2);
        ctx.fillRect(x + 9, 11, 3, 2);
    }
    ctx.fillStyle = "#414868";
    ctx.fillRect(x + 6, 6, 1, 12);
    ctx.fillRect(x + 1, 12, 12, 1);
}

function drawRoom(ctx, c, env) {
    var night = env.night;
    var w = c.w;
    ctx.fillStyle = night ? "#1f2335" : "#2a3050";
    ctx.fillRect(0, 0, w, H);
    var n = w <= 80 ? 1 : Math.max(2, Math.round(w / 70));
    for (var i = 0; i < n; i++)
        drawWindow(ctx, Math.round(n === 1 ? w - 20 : (i + 0.5) * w / n - 7), night);
    // floor
    ctx.fillStyle = "#24283b";
    ctx.fillRect(0, FLOOR, w, H - FLOOR);
    ctx.fillStyle = "#1a1b26";
    ctx.fillRect(0, FLOOR, w, 1);
    ctx.fillRect(0, FLOOR + 5, w, 1);
    // rug
    ctx.fillStyle = RUG_B;
    ctx.fillRect(c.rug - 14, FLOOR - 1, 28, 4);
    ctx.fillStyle = RUG_A;
    ctx.fillRect(c.rug - 14, FLOOR - 1, 28, 2);
    ctx.fillStyle = RUG_RIM;
    ctx.fillRect(c.rug - 12, FLOOR - 1, 5, 1);
    ctx.fillRect(c.rug + 7, FLOOR - 1, 5, 1);
}

function drawBall(ctx, c) {
    var b = c.ball;
    var x = Math.round(b.x) - 3;
    var y = FLOOR + 1 - 6 - Math.round(b.h);
    ctx.fillStyle = OUT;
    ctx.fillRect(x, y + 1, 6, 4);
    ctx.fillRect(x + 1, y, 4, 6);
    ctx.fillStyle = YARN;
    ctx.fillRect(x + 1, y + 1, 4, 4);
    ctx.fillStyle = YARN_DARK;
    ctx.fillRect(x + 1, y + 2, 4, 1);
    ctx.fillRect(x + 2, y + 1, 1, 4);
    ctx.fillStyle = "#f2d49b";
    ctx.fillRect(x + 1, y + 1, 1, 1);
}

// Draws the room and the cat onto ctx, which needs fillStyle and fillRect
function draw(ctx, c, env) {
    var p = pose(c, env);
    var cx = Math.round(c.x);
    var cy = FLOOR + 1 + p.dy;
    var d = c.dir;
    var place = function (r) {
        return d > 0 ? [cx + r[0], cy + r[1], r[2], r[3]] : [cx - r[0] - r[2], cy + r[1], r[2], r[3]];
    };
    drawRoom(ctx, c, env);
    drawBall(ctx, c);
    // shadow
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = OUT;
    ctx.fillRect(cx - 11, FLOOR + 1, 22, 2);
    ctx.globalAlpha = 1;
    var f;
    ctx.fillStyle = OUT;
    p.fur.forEach(function (r) {
        f = place(r);
        ctx.fillRect(f[0] - 1, f[1] - 1, f[2] + 2, f[3] + 2);
    });
    ctx.fillStyle = FUR;
    p.fur.forEach(function (r) {
        f = place(r);
        ctx.fillRect(f[0], f[1], f[2], f[3]);
    });
    p.det.forEach(function (r) {
        f = place(r);
        ctx.fillStyle = r[4];
        ctx.fillRect(f[0], f[1], f[2], f[3]);
    });
    c.zs.forEach(function (z) {
        ctx.globalAlpha = Math.max(0, Math.min(1, 3 - z.a));
        pixels(ctx, Z, z.x, z.y, ZED);
    });
    c.hearts.forEach(function (h) {
        ctx.globalAlpha = Math.max(0, Math.min(1, 2 - h.a));
        pixels(ctx, HEART, h.x, h.y, PINK);
    });
    ctx.globalAlpha = 1;
}
