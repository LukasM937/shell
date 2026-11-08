.pragma library

// Simulation of the lock screen ecosystem screensaver: a grid of land and water that grows, burns, wears down and
// recovers. It has no QML dependencies so scripts/ecosystem-check.js can run it headless. The rules and constants are
// those of docs/superpowers/specs/2026-11-07-screensaver-ecosystem-prototype.html; do not tune them here without
// running the check. All randomness goes through world.rng so a seeded generator gives a repeatable world.
// This file holds the terrain and land rules. The animals come in a later change, so the animal lists stay empty.

var T = {
    DEEP: 0,
    SHALLOW: 1,
    SAND: 2,
    GRASS: 3,
    FOREST: 4,
    DESERT: 5,
    ASH: 6,
    FIRE: 7
};

var SPECIES = ["sheep", "fish", "bird", "shark", "wolf", "hawk"];

var RULES = ["overgraze", "spread", "recover", "browse", "dung", "erosion", "tide", "fire", "pop", "migrate", "fear", "cross", "guano", "evolve", "respawn", "providence"];

var NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
var MAX_SPRINGS = 8;
var SPRING_RANGE = 7; // cells a spring wets around itself
var WATER_RANGE = 14; // cells from the nearest water at which the land is dry
var MAX_LIGHTNING = 0.55;
var LIFT_STEP = 0.0002; // per step, so a 0.3 island takes 1500 steps, 100 s at 1x
var WORM_GROWTH = 0.003; // a little faster than berries, worms come back when grass does
var MAX_EVENTS = 100;
var MIN_WATER = 0.1;
var MIN_LAND = 0.15;

function nearOffsets() {
    var out = [];
    for (var dy = -WATER_RANGE; dy <= WATER_RANGE; dy++)
        for (var dx = -WATER_RANGE; dx <= WATER_RANGE; dx++) {
            var d = Math.hypot(dx, dy);
            if (d < WATER_RANGE)
                out.push({
                    dx: dx,
                    dy: dy,
                    d: d
                });
        }
    out.sort(function (a, b) {
        return a.d - b.d;
    });
    return out;
}

// Offsets within WATER_RANGE, nearest first, so the search for water stops at the first hit
var NEAR = nearOffsets();

function hash(x, y, z) {
    var h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t) {
    return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function vn(x, y, s) {
    var xi = Math.floor(x), yi = Math.floor(y);
    var fx = smooth(x - xi), fy = smooth(y - yi);
    return lerp(lerp(hash(xi, yi, s), hash(xi + 1, yi, s), fx), lerp(hash(xi, yi + 1, s), hash(xi + 1, yi + 1, s), fx), fy);
}

function fbm(x, y, s) {
    return vn(x, y, s) * 0.6 + vn(x * 2.1, y * 2.1, s) * 0.28 + vn(x * 4.3, y * 4.3, s) * 0.12;
}

function clamped(v, lo, hi, old) {
    return typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : old;
}

function validBump(b) {
    return b && isFinite(b.x) && isFinite(b.y) && isFinite(b.height) && isFinite(b.radius);
}

// Adds hills to a cols x rows field. x and y are fractions of the width and height, radius a fraction of the height
function addBumps(field, cols, rows, bumps) {
    for (var n = 0; n < bumps.length; n++) {
        var b = bumps[n];
        if (!validBump(b))
            continue;
        var cx = b.x * cols, cy = b.y * rows, r = b.radius * rows;
        for (var j = Math.max(0, Math.floor(cy - r)); j <= Math.min(rows - 1, Math.ceil(cy + r)); j++)
            for (var i = Math.max(0, Math.floor(cx - r)); i <= Math.min(cols - 1, Math.ceil(cx + r)); i++) {
                var d = Math.hypot(i + 0.5 - cx, j + 0.5 - cy);
                if (d < r)
                    field[j * cols + i] += b.height * smooth(1 - d / r);
            }
    }
}

function countTypes(w) {
    w.count.fill(0);
    for (var p = 0; p < w.type.length; p++)
        w.count[w.type[p]]++;
    return w.type.length - w.count[T.DEEP] - w.count[T.SHALLOW];
}

function emit(w, id, cooldown) {
    if ((w.cool[id] || 0) > w.tick)
        return;
    w.cool[id] = w.tick + cooldown;
    w.events.push({
        tick: w.tick,
        id: id
    });
    if (w.events.length > MAX_EVENTS)
        w.events.shift();
}

function randomLand(w) {
    for (var n = 0; n < 400; n++) {
        var x = w.rng() * w.cols, y = w.rng() * w.rows;
        var t = w.type[(y | 0) * w.cols + (x | 0)];
        if (t >= T.SAND && t <= T.ASH)
            return {
                x: x,
                y: y
            };
    }
    return null;
}

// Moisture is the distance to water, plus the active springs
function calcMoist(w) {
    var cols = w.cols, rows = w.rows;
    w.moist.set(w.moistW);
    for (var s = 0; s < w.springs.length; s++) {
        var sp = w.springs[s];
        for (var j = Math.max(0, Math.floor(sp.y - SPRING_RANGE)); j <= Math.min(rows - 1, Math.ceil(sp.y + SPRING_RANGE)); j++)
            for (var i = Math.max(0, Math.floor(sp.x - SPRING_RANGE)); i <= Math.min(cols - 1, Math.ceil(sp.x + SPRING_RANGE)); i++) {
                var d = Math.hypot(i - sp.x, j - sp.y);
                if (d < SPRING_RANGE)
                    w.moist[j * cols + i] = Math.max(w.moist[j * cols + i], 1 - d / SPRING_RANGE);
            }
    }
}

// Terrain from the noise, or from saved elevation. Which seed was used decides how the land is covered, not the height
function generate(w, saved, bumps) {
    var cols = w.cols, rows = w.rows, seed = w.seed;
    if (!saved)
        for (var j = 0; j < rows; j++)
            for (var i = 0; i < cols; i++)
                w.elev[j * cols + i] = (fbm(i * 0.07, j * 0.07, seed) - 0.2) * 1.6;
    else
        w.elev.set(saved.elev);
    if (!saved && bumps)
        addBumps(w.elev, cols, rows, bumps);
    for (j = 0; j < rows; j++)
        for (i = 0; i < cols; i++) {
            var p = j * cols + i, h = w.elev[p], m = fbm(i * 0.09 + 40, j * 0.09, seed + 1);
            var t = h < 0.3 ? T.DEEP : h < 0.4 ? T.SHALLOW : h < 0.45 ? T.SAND : (m > 0.52 ? T.FOREST : T.GRASS);
            w.type[p] = t;
            w.bio[p] = 0.7;
            w.fert[p] = saved ? saved.fert[p] : 0.6 + 0.4 * vn(i * 0.2, j * 0.2, seed + 2);
            w.worm[p] = t === T.GRASS || t === T.FOREST ? 0.6 : 0;
            w.age[p] = w.rest[p] = w.stress[p] = w.burn[p] = 0;
        }
}

function create(opts) {
    var cols = opts.cols, rows = opts.rows || 45, n = cols * rows;
    var saved = opts.saved && opts.saved.fert && opts.saved.elev && opts.saved.fert.length === n && opts.saved.elev.length === n ? opts.saved : null;
    var rules = {};
    for (var r = 0; r < RULES.length; r++)
        rules[RULES[r]] = opts.rules && opts.rules[RULES[r]] !== undefined ? !!opts.rules[RULES[r]] : true;

    var w = {
        cols: cols,
        rows: rows,
        seed: opts.seed,
        tick: 0,
        rng: opts.rng || Math.random,
        rules: rules,
        signals: {
            rain: 0.8,
            lightning: 0.05,
            springs: 3
        },
        type: new Uint8Array(n),
        // elev is without the lift of the islands, lift is what they add on top of it right now
        elev: new Float32Array(n),
        lift: new Float32Array(n),
        liftTarget: new Float32Array(n),
        // grass left on grass cells, berries on forest cells
        bio: new Float32Array(n),
        fert: new Float32Array(n),
        worm: new Float32Array(n),
        age: new Int32Array(n),
        rest: new Int32Array(n),
        stress: new Int32Array(n),
        burn: new Int32Array(n),
        moistW: new Float32Array(n),
        moist: new Float32Array(n),
        count: new Int32Array(8),
        animals: {},
        springs: [],
        candidates: [],
        events: [],
        cool: {},
        level: 0.4,
        monsoon: false,
        lifting: false,
        islandKey: "[]",
        groves: {}
    };
    for (var k = 0; k < SPECIES.length; k++)
        w.animals[SPECIES[k]] = [];

    // A seed that gives a world with hardly any water or land is not worth watching: take the next one
    for (var tries = 0; ; tries++) {
        generate(w, saved, opts.bumps);
        var land = countTypes(w);
        if (saved || tries >= 1000 || (n - land >= MIN_WATER * n && land >= MIN_LAND * n))
            break;
        w.seed++;
    }

    for (var j = 0; j < rows; j++)
        for (var i = 0; i < cols; i++) {
            var d = WATER_RANGE;
            for (var o = 0; o < NEAR.length; o++) {
                var x = i + NEAR[o].dx, y = j + NEAR[o].dy;
                if (x >= 0 && y >= 0 && x < cols && y < rows && w.type[y * cols + x] <= T.SHALLOW) {
                    d = NEAR[o].d;
                    break;
                }
            }
            w.moistW[j * cols + i] = Math.max(0, 1 - d / WATER_RANGE);
        }

    for (var s = 0; s < MAX_SPRINGS; s++) {
        var spring = randomLand(w);
        if (spring)
            w.candidates.push(spring);
    }
    w.springs = w.candidates.slice(0, w.signals.springs);
    calcMoist(w);
    return w;
}

function plantGrove(w, gx, gy) {
    var best = -1, bd = Infinity;
    for (var p = 0; p < w.type.length; p++) {
        var t = w.type[p];
        if (t < T.SAND || t > T.ASH)
            continue;
        var d = Math.hypot((p % w.cols) + 0.5 - gx * w.cols, Math.floor(p / w.cols) + 0.5 - gy * w.rows);
        if (d < bd) {
            bd = d;
            best = p;
        }
    }
    if (best < 0)
        return;
    w.type[best] = T.FOREST;
    w.age[best] = 0;
    w.fert[best] = Math.max(w.fert[best], 0.9);
    w.bio[best] = Math.max(w.bio[best], 0.5);
}

function setSignals(w, s) {
    var sig = w.signals;
    sig.rain = clamped(s.rain, 0, 1.5, sig.rain);
    sig.lightning = clamped(s.lightning, 0, MAX_LIGHTNING, sig.lightning);

    var springs = Math.floor(clamped(s.springs, 0, MAX_SPRINGS, sig.springs));
    if (springs !== sig.springs) {
        sig.springs = springs;
        w.springs = w.candidates.slice(0, springs);
        calcMoist(w);
    }

    if (s.islands) {
        var key = JSON.stringify(s.islands);
        if (key !== w.islandKey) {
            w.islandKey = key;
            w.liftTarget.fill(0);
            addBumps(w.liftTarget, w.cols, w.rows, s.islands);
            w.lifting = true;
        }
    }

    // A grove is planted once. Callers pass the same list again and again, and a fire or the herds may have taken it since
    for (var n = 0; s.groves && n < s.groves.length; n++) {
        var g = s.groves[n];
        if (!g || !isFinite(g.x) || !isFinite(g.y) || w.groves[g.x + "," + g.y])
            continue;
        w.groves[g.x + "," + g.y] = true;
        plantGrove(w, g.x, g.y);
    }
}

function rainNow(w) {
    return w.monsoon ? Math.max(w.signals.rain, 1.0) : w.signals.rain;
}

// Moves the lift of every cell towards its target, slowly, so a new island rises over a minute or two
function easeLift(w) {
    var moved = false;
    for (var p = 0; p < w.lift.length; p++) {
        var d = w.liftTarget[p] - w.lift[p];
        if (d === 0)
            continue;
        w.lift[p] = Math.abs(d) <= LIFT_STEP ? w.liftTarget[p] : w.lift[p] + (d > 0 ? LIFT_STEP : -LIFT_STEP);
        moved = true;
    }
    w.lifting = moved;
}

function cells(w, rain) {
    var cols = w.cols, rows = w.rows, type = w.type, elev = w.elev, lift = w.lift, bio = w.bio, fert = w.fert, age = w.age;
    var worm = w.worm, rest = w.rest, stress = w.stress, burn = w.burn, moist = w.moist, F = w.rules, rng = w.rng, level = w.level;
    for (var j = 0; j < rows; j++)
        for (var i = 0; i < cols; i++) {
            var p = j * cols + i, t = type[p], e = elev[p] + lift[p];
            if (t <= T.SHALLOW) {
                if (F.tide) {
                    // Islands lift the sea floor too, and a floor that sank back is deep again
                    if (t === T.DEEP && e > 0.308)
                        type[p] = T.SHALLOW;
                    else if (t === T.SHALLOW && e > level + 0.008) {
                        type[p] = T.SAND;
                        age[p] = 0;
                    } else if (t === T.SHALLOW && e < 0.292)
                        type[p] = T.DEEP;
                }
                continue;
            }
            if (F.tide && e < level - 0.008) {
                type[p] = T.SHALLOW;
                continue;
            }
            var nb = NEIGHBOURS[(rng() * 4) | 0], a = i + nb[0], b = j + nb[1];
            var q = a >= 0 && b >= 0 && a < cols && b < rows ? b * cols + a : -1;
            if (t === T.GRASS) {
                // grass that stays bare for a while dies; one bite to the ground is not enough
                if (bio[p] < 0.02) {
                    if (++stress[p] > 60 && F.overgraze) {
                        type[p] = T.DESERT;
                        rest[p] = 0;
                        stress[p] = 0;
                        fert[p] = Math.max(0.1, fert[p] - 0.4);
                        continue;
                    }
                } else if (stress[p] > 0)
                    stress[p]--;
                bio[p] = Math.min(1, bio[p] + 0.0035 * rain * (0.2 + moist[p]) * (0.4 + fert[p]));
                if (rain < 0.4)
                    bio[p] -= 0.004 * (1 - moist[p]) * (0.4 - rain) / 0.4;
                worm[p] = Math.min(1, worm[p] + WORM_GROWTH * rain * (0.2 + moist[p]) * (0.4 + fert[p]));
                age[p]++;
                if (fert[p] < 1.2)
                    fert[p] += 0.00005;
                if (bio[p] < 0.001)
                    bio[p] = 0.001;
                if (F.spread && q >= 0 && bio[p] > 0.8 && age[p] > 150) {
                    if (type[q] === T.FOREST) {
                        if (rng() < 0.0015) {
                            type[p] = T.FOREST;
                            age[p] = 0;
                        }
                    } else if (type[q] === T.SAND && moist[q] > 0.3 && rng() < 0.02) {
                        type[q] = T.GRASS;
                        bio[q] = 0.3;
                        age[q] = 0;
                    }
                }
            } else if (t === T.FOREST) {
                age[p]++;
                bio[p] = Math.min(1, bio[p] + 0.0007 * rain * (0.4 + fert[p]));
                worm[p] = Math.min(1, worm[p] + WORM_GROWTH * rain * (0.2 + moist[p]) * (0.4 + fert[p]));
                if (F.spread && q >= 0 && age[p] > 150 && type[q] === T.GRASS && bio[q] > 0.6 && rng() < 0.002) {
                    type[q] = T.FOREST;
                    age[q] = 0;
                }
            } else if (t === T.DESERT) {
                rest[p]++;
                fert[p] = Math.min(0.5, fert[p] + 0.00003);
                if (F.erosion)
                    elev[p] -= 0.00002 * rain;
                if (F.recover && rest[p] > 500 && moist[p] > 0.25 && rain > 0.3 && fert[p] > 0.2 && rng() < 0.01) {
                    type[p] = T.GRASS;
                    bio[p] = 0.15;
                    age[p] = 0;
                }
            } else if (t === T.ASH) {
                if (--burn[p] <= 0) {
                    type[p] = T.GRASS;
                    bio[p] = 0.1;
                    age[p] = 0;
                }
            } else if (t === T.FIRE) {
                for (var n = 0; n < NEIGHBOURS.length; n++) {
                    var x = i + NEIGHBOURS[n][0], y = j + NEIGHBOURS[n][1];
                    if (x < 0 || y < 0 || x >= cols || y >= rows)
                        continue;
                    var o = y * cols + x;
                    if ((type[o] === T.FOREST || (type[o] === T.GRASS && bio[o] > 0.35)) && rng() < 0.12) {
                        type[o] = T.FIRE;
                        burn[o] = 6;
                    }
                }
                if (--burn[p] <= 0) {
                    type[p] = T.ASH;
                    burn[p] = 150;
                }
            } else if (t === T.SAND && F.spread && q >= 0 && type[q] === T.GRASS && bio[q] > 0.9 && moist[p] > 0.4 && rng() < 0.0015) {
                type[p] = T.GRASS;
                bio[p] = 0.2;
                age[p] = 0;
            }
        }

    if (F.fire && w.signals.lightning > 0 && rng() < w.signals.lightning * 0.06) {
        var fx = (rng() * cols) | 0, fy = (rng() * rows) | 0, fp = fy * cols + fx;
        if ((type[fp] === T.FOREST || (type[fp] === T.GRASS && bio[fp] > 0.4)) && rng() < 0.5) {
            type[fp] = T.FIRE;
            burn[fp] = 6;
            emit(w, "lightning", 400);
        }
    }

    // Worms live in the soil of grass and forest, so they go with whatever the cell turned into this step
    for (var c = 0; c < type.length; c++)
        if (type[c] !== T.GRASS && type[c] !== T.FOREST)
            worm[c] = 0;
}

function step(w) {
    w.tick++;
    var rain = rainNow(w);
    w.level = 0.4 + 0.03 * (rain - 0.8) / 0.8;
    if (w.lifting)
        easeLift(w);
    cells(w, rain);

    // Mercy rains: a world that is mostly desert gets monsoon rain until it has recovered
    if (w.tick % 50 === 0) {
        var land = countTypes(w);
        var desert = land ? w.count[T.DESERT] / land : 0;
        if (w.rules.providence && !w.monsoon && desert > 0.55) {
            w.monsoon = true;
            emit(w, "monsoon_on", 0);
        } else if (w.monsoon && (desert < 0.4 || !w.rules.providence)) {
            w.monsoon = false;
            emit(w, "monsoon_off", 0);
        }
        if (desert > 0.3)
            emit(w, "desert30", 1500);
    }
}

function snapshot(w) {
    return {
        seed: w.seed,
        fert: Array.from(w.fert, function (v) {
            return +v.toFixed(2);
        }),
        elev: Array.from(w.elev, function (v) {
            return +v.toFixed(3);
        })
    };
}

function census(w) {
    var land = countTypes(w), c = w.count;
    var share = function (n) {
        return land ? n / land : 0;
    };
    var counts = {};
    for (var k = 0; k < SPECIES.length; k++) {
        var list = w.animals[SPECIES[k]], alive = 0;
        for (var n = 0; n < list.length; n++)
            if (!list[n].dead)
                alive++;
        counts[SPECIES[k]] = alive;
    }
    return {
        land: land,
        grass: share(c[T.GRASS]),
        forest: share(c[T.FOREST]),
        desert: share(c[T.DESERT]),
        ash: share(c[T.ASH] + c[T.FIRE]),
        sand: share(c[T.SAND]),
        counts: counts,
        monsoon: w.monsoon
    };
}

function drainEvents(w) {
    var out = w.events;
    w.events = [];
    return out;
}
