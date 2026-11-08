.pragma library

// Simulation of the lock screen ecosystem screensaver: a grid of land and water that grows, burns, wears down and
// recovers. It has no QML dependencies so scripts/ecosystem-check.js can run it headless. The rules and constants are
// those of docs/superpowers/specs/2026-11-07-screensaver-ecosystem-prototype.html, except the worms and the berry
// growth, which are new; do not tune anything here without running the check. All randomness goes through world.rng so a seeded generator gives a repeatable world.

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
// New, not from the prototype (its fruit grew at 0.0007): berries and worms are far slower than the grass. With anything
// faster the birds sit at their cap whatever the rain does and the hawks cannot hold them back. The check holds the
// birds under half the steps at their cap at rain 0.8 and worms at a fifth or more of what they eat.
var WORM_GROWTH = 0.00004;
var BERRY_GROWTH = 0.0001;
var MAX_EVENTS = 100;
var MIN_WATER = 0.1;
var MIN_LAND = 0.15;
var RESPAWN_AFTER = 300; // steps a species stays extinct before a few members arrive again
var BERRY_BITE = 0.03; // most berries a bird takes from one cell and step
var WORM_BITE = 0.03; // and most worms, on top of the berries
var BITE_GAIN = 1.2;

// Where each species may stand. Water is 0 and 1, land 2 to 6 (fire, 7, is not), air is anywhere on the map.
var KINDS = {
    sheep: {
        ok: function (t) {
            return t >= 1 && t <= 6;
        },
        speed: 0.14,
        cap: 200,
        start: 24,
        arrive: 6
    },
    fish: {
        ok: function (t) {
            return t === 0 || t === 1;
        },
        speed: 0.3,
        cap: 160,
        start: 40,
        arrive: 12
    },
    bird: {
        ok: function (t) {
            return t >= 0;
        },
        speed: 0.34,
        cap: 100,
        start: 18,
        arrive: 8
    },
    shark: {
        ok: function (t) {
            return t === 0 || t === 1;
        },
        speed: 0.38,
        cap: 4,
        start: 2,
        arrive: 1
    },
    wolf: {
        ok: function (t) {
            return t >= 2 && t <= 6;
        },
        speed: 0.26,
        cap: 4,
        start: 3,
        arrive: 1
    },
    hawk: {
        ok: function (t) {
            return t >= 0;
        },
        speed: 0.44,
        cap: 4,
        start: 2,
        arrive: 1
    }
};

var DIRS = [];
for (var di = 0; di < 8; di++)
    DIRS.push([Math.cos(di * Math.PI / 4), Math.sin(di * Math.PI / 4)]);

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

function emit(w, id, cooldown, species) {
    if ((w.cool[id] || 0) > w.tick)
        return;
    w.cool[id] = w.tick + cooldown;
    var event = {
        tick: w.tick,
        id: id
    };
    if (species)
        event.species = species;
    w.events.push(event);
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
            w.plank[p] = 0.7;
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
        // plankton, what the fish eat; only water cells use it
        plank: new Float32Array(n),
        age: new Int32Array(n),
        rest: new Int32Array(n),
        stress: new Int32Array(n),
        burn: new Int32Array(n),
        moistW: new Float32Array(n),
        moist: new Float32Array(n),
        count: new Int32Array(8),
        animals: {},
        // steps each species has been extinct, and whether its extinction was reported
        // what the birds have eaten so far, in bio and worm units
        eaten: {
            berries: 0,
            worms: 0
        },
        ext: {},
        gone: {},
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
    for (var k = 0; k < SPECIES.length; k++) {
        w.animals[SPECIES[k]] = [];
        w.ext[SPECIES[k]] = 0;
        w.gone[SPECIES[k]] = false;
    }

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
    for (k = 0; k < SPECIES.length; k++)
        addAnimals(w, SPECIES[k], KINDS[SPECIES[k]].start, false);
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
    var worm = w.worm, plank = w.plank, rest = w.rest, stress = w.stress, burn = w.burn, moist = w.moist, F = w.rules, rng = w.rng, level = w.level;
    for (var j = 0; j < rows; j++)
        for (var i = 0; i < cols; i++) {
            var p = j * cols + i, t = type[p], e = elev[p] + lift[p];
            if (t <= T.SHALLOW) {
                plank[p] = Math.min(1, plank[p] + 0.0006 * (0.3 + (t ? 0.5 : 0)));
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
                plank[p] = 0.3;
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
                bio[p] = Math.min(1, bio[p] + BERRY_GROWTH * rain * (0.4 + fert[p]));
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

function typeAt(w, x, y) {
    return x < 0 || y < 0 || x >= w.cols || y >= w.rows ? -1 : w.type[(y | 0) * w.cols + (x | 0)];
}

function cellAt(w, x, y) {
    return (y | 0) * w.cols + (x | 0);
}

function newAnimal() {
    return {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        e: 1,
        th: 0,
        h: 0.1,
        g: 0,
        dead: false
    };
}

function place(w, k, a) {
    for (var n = 0; n < 400; n++) {
        a.x = w.rng() * w.cols;
        a.y = w.rng() * w.rows;
        if (KINDS[k].ok(typeAt(w, a.x, a.y)))
            return true;
    }
    return false;
}

// Arrivals come in from the edge of the map; the first animals of a world are scattered over it
function makeAnimal(w, k, edge) {
    var a = newAnimal();
    for (var n = 0; edge && n < 200; n++) {
        var side = w.rng() < 0.5;
        a.x = side ? (w.rng() < 0.5 ? 0.5 : w.cols - 0.5) : w.rng() * w.cols;
        a.y = side ? w.rng() * w.rows : (w.rng() < 0.5 ? 0.5 : w.rows - 0.5);
        if (KINDS[k].ok(typeAt(w, a.x, a.y)))
            return a;
    }
    return place(w, k, a) ? a : null;
}

function addAnimals(w, k, n, edge) {
    for (var i = 0; i < n; i++) {
        var a = makeAnimal(w, k, edge);
        if (!a)
            continue;
        if (k === "sheep")
            a.h = w.rules.evolve ? w.rng() * 0.2 : 0.1;
        w.animals[k].push(a);
    }
}

function wander(w) {
    return (w.rng() - 0.5) * 0.06;
}

// First direction, from a random starting one, in which some distance in radii satisfies test
function find(w, a, radii, test) {
    var o = (w.rng() * 8) | 0;
    for (var r = 0; r < radii.length; r++)
        for (var k = 0; k < 8; k++) {
            var d = DIRS[(k + o) & 7];
            if (test(a.x + d[0] * radii[r], a.y + d[1] * radii[r]))
                return d;
        }
    return null;
}

function nearest(a, list, maxd, filter) {
    var best = null, bd = maxd;
    for (var n = 0; n < list.length; n++) {
        var o = list[n];
        if (o.dead || (filter && !filter(o)))
            continue;
        var d = Math.hypot(o.x - a.x, o.y - a.y);
        if (d < bd) {
            bd = d;
            best = o;
        }
    }
    return best ? {
        o: best,
        d: bd
    } : null;
}

// Springs are drinking places for sheep as well as water
function springAt(w, x, y) {
    for (var s = 0; s < w.springs.length; s++)
        if (Math.hypot(x - w.springs[s].x, y - w.springs[s].y) < 1.6)
            return true;
    return false;
}

function move(w, k, a, dx, dy) {
    var K = KINDS[k];
    a.vx = a.vx * 0.85 + dx;
    a.vy = a.vy * 0.85 + dy;
    var sp = Math.hypot(a.vx, a.vy);
    if (sp > K.speed) {
        a.vx *= K.speed / sp;
        a.vy *= K.speed / sp;
    }
    if (!K.ok(typeAt(w, a.x, a.y))) {
        // stranded by a shore moving or a fire
        for (var r = 1; r <= 3; r++)
            for (var n = 0; n < 8; n++)
                if (K.ok(typeAt(w, a.x + DIRS[n][0] * r, a.y + DIRS[n][1] * r))) {
                    a.x += DIRS[n][0] * 0.4;
                    a.y += DIRS[n][1] * 0.4;
                    return;
                }
        if (!place(w, k, a))
            a.dead = true;
        return;
    }
    var nx = a.x + a.vx, ny = a.y + a.vy;
    if (K.ok(typeAt(w, nx, ny))) {
        a.x = nx;
        a.y = ny;
    } else if (K.ok(typeAt(w, nx, a.y))) {
        a.x = nx;
        a.vy = -a.vy * 0.5;
    } else if (K.ok(typeAt(w, a.x, ny))) {
        a.y = ny;
        a.vx = -a.vx * 0.5;
    } else {
        a.vx = -a.vx * 0.6;
        a.vy = -a.vy * 0.6;
    }
}

// The steering helpers add to v, the push an animal gets this step
function pull(v, d, weight) {
    v.x += d[0] * weight;
    v.y += d[1] * weight;
}

// Loosely follows a few of its own kind and keeps clear of the ones right next to it
function flock(w, a, list, v) {
    for (var n = 0; n < 5; n++) {
        var o = list[(w.rng() * list.length) | 0];
        if (!o || o === a)
            continue;
        var ox = o.x - a.x, oy = o.y - a.y, d = Math.hypot(ox, oy) || 1;
        if (d < 14) {
            var s = d < 2 ? -0.02 : 0.004;
            v.x += ox / d * s;
            v.y += oy / d * s;
        }
    }
}

function flee(a, list, range, weight, v) {
    for (var n = 0; n < list.length; n++) {
        var ox = list[n].x - a.x, oy = list[n].y - a.y, d = Math.hypot(ox, oy);
        if (d < range && d > 0) {
            v.x -= ox / d * weight;
            v.y -= oy / d * weight;
        }
    }
}

function chase(a, target, weight, v) {
    var d = target.d || 1e-6;
    v.x += (target.o.x - a.x) / d * weight;
    v.y += (target.o.y - a.y) / d * weight;
}

function fireNear(w, x, y, r) {
    for (var dy = -r; dy <= r; dy++)
        for (var dx = -r; dx <= r; dx++) {
            var a = x + dx, b = y + dy;
            if (a >= 0 && b >= 0 && a < w.cols && b < w.rows && w.type[b * w.cols + a] === T.FIRE)
                return [dx, dy];
        }
    return null;
}

function animals(w) {
    var A = w.animals, F = w.rules, rng = w.rng, cols = w.cols, rows = w.rows;
    var type = w.type, bio = w.bio, fert = w.fert, worm = w.worm, plank = w.plank, age = w.age, moist = w.moist;
    var sheep = A.sheep, fish = A.fish, bird = A.bird, shark = A.shark, wolf = A.wolf, hawk = A.hawk;
    var v = {
        x: 0,
        y: 0
    };
    var isWater = function (x, y) {
        var t = typeAt(w, x, y);
        return t === T.SHALLOW || springAt(w, x, y);
    };
    var isLand = function (x, y) {
        return typeAt(w, x, y) >= T.SAND;
    };
    var isGoodGrass = function (x, y) {
        return typeAt(w, x, y) === T.GRASS && bio[cellAt(w, x, y)] > 0.45;
    };
    var isPlankton = function (x, y) {
        var t = typeAt(w, x, y);
        return t >= 0 && t <= T.SHALLOW && plank[cellAt(w, x, y)] > 0.35;
    };
    // Berries on trees, worms in the soil under grass and trees
    var isBirdFood = function (x, y) {
        var t = typeAt(w, x, y);
        if (t !== T.GRASS && t !== T.FOREST)
            return false;
        var p = cellAt(w, x, y);
        return (t === T.FOREST && bio[p] > 0.3) || worm[p] > 0.3;
    };
    var inShallows = function (o) {
        return typeAt(w, o.x, o.y) === T.SHALLOW;
    };

    for (var n = 0; n < sheep.length; n++) {
        var s = sheep[n], t = typeAt(w, s.x, s.y), p = cellAt(w, s.x, s.y), d = null, weight = 0;
        v.x = wander(w);
        v.y = wander(w);
        s.th += 0.0012;
        if (t === T.SHALLOW || springAt(w, s.x, s.y))
            s.th = 0;
        if (s.th > 1) {
            d = find(w, s, [3, 6, 10, 16, 24, 34], isWater);
            weight = 0.06;
        }
        if (!d && t === T.SHALLOW) {
            d = find(w, s, [2], isLand);
            weight = 0.15;
        }
        if (!d && (s.e < 1 || bio[p] < 0.2)) {
            d = find(w, s, F.migrate ? [2, 5, 9, 16] : [2, 5, 9], isGoodGrass);
            weight = 0.05;
        }
        if (d)
            pull(v, d, weight);
        if (F.fear)
            flee(s, wolf, 7, 0.08, v);
        var f = fireNear(w, s.x | 0, s.y | 0, 6);
        if (f) {
            var m = Math.hypot(f[0], f[1]) || 1;
            v.x -= f[0] / m * 0.2;
            v.y -= f[1] / m * 0.2;
        }
        flock(w, s, sheep, v);
        move(w, "sheep", s, v.x, v.y);
        var t2 = typeAt(w, s.x, s.y), p2 = cellAt(w, s.x, s.y);
        if (t2 === T.GRASS) {
            var eat = Math.min(bio[p2], 0.05);
            bio[p2] -= eat;
            s.e += eat * 0.8 * (1 - 0.6 * s.h);
            age[p2] = 0;
        } else if (t2 === T.FOREST && F.browse) {
            s.e += 0.004;
            age[p2] = 0;
            if (rng() < 0.0012) {
                type[p2] = T.GRASS;
                bio[p2] = 0.3;
                age[p2] = 0;
            }
        } else if (t2 === T.DESERT)
            s.e += 0.010 * s.h;
        else if (t2 === T.FIRE)
            s.dead = true;
        if (F.dung && s.e > 1 && t2 >= T.SAND && t2 <= T.DESERT && rng() < 0.02) {
            fert[p2] = Math.min(1.5, fert[p2] + 0.05);
            var r = NEIGHBOURS[(rng() * 4) | 0], a = (s.x | 0) + r[0], b = (s.y | 0) + r[1];
            if (a >= 0 && b >= 0 && a < cols && b < rows) {
                var q = b * cols + a;
                if ((type[q] === T.SAND || type[q] === T.DESERT) && moist[q] > 0.2 && rng() < 0.5) {
                    type[q] = T.GRASS;
                    bio[q] = 0.2;
                    age[q] = 0;
                }
            }
        }
        s.e -= 0.008 + (s.th > 1.6 ? 0.004 : 0);
    }

    for (n = 0; n < fish.length; n++) {
        var fi = fish[n];
        v.x = wander(w);
        v.y = wander(w);
        if (fi.e < 1.2) {
            d = find(w, fi, [3, 6, 10], isPlankton);
            if (d)
                pull(v, d, 0.05);
        }
        flee(fi, shark, 8, 0.2, v);
        flock(w, fi, fish, v);
        move(w, "fish", fi, v.x, v.y);
        t2 = typeAt(w, fi.x, fi.y);
        if (t2 >= 0 && t2 <= T.SHALLOW) {
            var cell = cellAt(w, fi.x, fi.y), bite = Math.min(plank[cell], 0.04);
            plank[cell] -= bite;
            fi.e += bite;
        }
        fi.e -= 0.006;
    }

    for (n = 0; n < bird.length; n++) {
        var bi = bird[n];
        v.x = wander(w);
        v.y = wander(w);
        if (bi.e < 1.2) {
            d = find(w, bi, [3, 6, 10, 16], isBirdFood);
            if (d)
                pull(v, d, 0.05);
        }
        if (F.fear)
            flee(bi, hawk, 8, 0.2, v);
        flock(w, bi, bird, v);
        move(w, "bird", bi, v.x, v.y);
        t2 = typeAt(w, bi.x, bi.y);
        p2 = cellAt(w, bi.x, bi.y);
        var got = 0;
        if (t2 === T.FOREST) {
            got = Math.min(bio[p2], BERRY_BITE);
            bio[p2] -= got;
            w.eaten.berries += got;
        }
        if (t2 === T.GRASS || t2 === T.FOREST) {
            var wormBite = Math.min(worm[p2], WORM_BITE);
            worm[p2] -= wormBite;
            w.eaten.worms += wormBite;
            got += wormBite;
        }
        bi.e += got * BITE_GAIN;
        if (F.guano && bi.e < 1 && t2 === T.SHALLOW) {
            var prey = nearest(bi, fish, 1.5);
            if (prey && rng() < 0.05) {
                prey.o.dead = true;
                bi.e += 0.6;
                bi.g = 1;
            }
        }
        if (F.guano && bi.g && t2 >= T.SAND && t2 <= T.FOREST) {
            bi.g = 0;
            fert[p2] = Math.min(1.5, fert[p2] + 0.3);
            if (t2 === T.SAND && moist[p2] > 0.3) {
                type[p2] = T.GRASS;
                bio[p2] = 0.2;
                age[p2] = 0;
            } else if (t2 === T.GRASS || t2 === T.FOREST)
                bio[p2] = Math.min(1, bio[p2] + 0.2);
            emit(w, "guano", 600);
        }
        bi.e -= 0.008;
    }

    for (n = 0; n < shark.length; n++) {
        var sh = shark[n], target = null, isSheep = false;
        v.x = wander(w);
        v.y = wander(w);
        if (sh.e < 1.4) {
            target = nearest(sh, fish, 22);
            if (!target && F.cross) {
                target = nearest(sh, sheep, 22, inShallows);
                isSheep = !!target;
            }
        }
        if (target) {
            chase(sh, target, 0.14, v);
            if (target.d < 1.4) {
                target.o.dead = true;
                sh.e += isSheep ? 1 : 0.5;
                if (isSheep)
                    emit(w, "shark_sheep", 300);
            }
        }
        move(w, "shark", sh, v.x, v.y);
        sh.e -= 0.004;
    }

    for (n = 0; n < wolf.length; n++) {
        var wo = wolf[n], isFish = false;
        target = null;
        v.x = wander(w);
        v.y = wander(w);
        if (wo.e < 1.4)
            target = nearest(wo, sheep, 28);
        if (!target && F.cross && wo.e < 0.8) {
            target = nearest(wo, fish, 5, inShallows);
            isFish = !!target;
        }
        if (target) {
            chase(wo, target, 0.1, v);
            if (target.d < 1.4) {
                target.o.dead = true;
                wo.e += isFish ? 0.5 : 1;
                if (isFish)
                    emit(w, "wolf_fish", 300);
            }
        }
        move(w, "wolf", wo, v.x, v.y);
        wo.e -= 0.004;
    }

    for (n = 0; n < hawk.length; n++) {
        var ha = hawk[n];
        target = null;
        v.x = wander(w);
        v.y = wander(w);
        if (ha.e < 1.4)
            target = nearest(ha, bird, 30);
        if (target) {
            chase(ha, target, 0.16, v);
            if (target.d < 1.4) {
                target.o.dead = true;
                ha.e += 0.7;
            }
        }
        if (F.cross && ha.e < 1.2 && typeAt(w, ha.x, ha.y) === T.SHALLOW) {
            prey = nearest(ha, fish, 1.6);
            if (prey && rng() < 0.04) {
                prey.o.dead = true;
                ha.e += 0.5;
                emit(w, "hawk_fish", 300);
            }
        }
        move(w, "hawk", ha, v.x, v.y);
        ha.e -= 0.004;
    }
}

// Removes the dead and the starved, lets the well fed breed, and brings back a species that has died out
function lifecycle(w) {
    var F = w.rules;
    for (var i = 0; i < SPECIES.length; i++) {
        var k = SPECIES[i], K = KINDS[k], list = w.animals[k], born = [], breedE = K.cap > 10 ? 1.5 : 2;
        for (var n = list.length - 1; n >= 0; n--) {
            var a = list[n];
            if (a.dead || (F.pop && a.e <= 0)) {
                list.splice(n, 1);
                continue;
            }
            if (!F.pop) {
                a.e = Math.min(1.2, Math.max(a.e, 0.5));
                continue;
            }
            if (a.e > breedE && list.length + born.length < K.cap) {
                a.e = K.cap > 10 ? 0.8 : 1;
                var c = newAnimal();
                c.x = a.x;
                c.y = a.y;
                c.e = a.e;
                c.h = F.evolve ? Math.min(1, Math.max(0, a.h + (w.rng() - 0.5) * 0.12)) : 0.1;
                born.push(c);
            }
        }
        for (n = 0; n < born.length; n++)
            list.push(born[n]);
        if (list.length === 0) {
            if (!w.gone[k]) {
                w.gone[k] = true;
                emit(w, "extinct", 0, k);
            }
            if (F.respawn && ++w.ext[k] > RESPAWN_AFTER) {
                addAnimals(w, k, K.arrive, true);
                if (list.length > 0) {
                    w.ext[k] = 0;
                    w.gone[k] = false;
                    emit(w, "arrive", 0, k);
                }
            }
        } else {
            w.ext[k] = 0;
            w.gone[k] = false;
        }
    }
}

function step(w) {
    w.tick++;
    var rain = rainNow(w);
    w.level = 0.4 + 0.03 * (rain - 0.8) / 0.8;
    if (w.lifting)
        easeLift(w);
    cells(w, rain);
    animals(w);
    lifecycle(w);

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
