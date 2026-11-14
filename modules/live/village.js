.pragma library

// Simulation of the village wallpaper: a small settlement that grows with what the computer does and lives in the real
// weather, season and time of day. It has no QML dependencies so scripts/village-check.js can run it headless; the
// wallpaper owner (services/Village.qml) feeds it readings and draws it with modules/live/vdraw.js.
//
// The map is a grid of tiles, 8 virtual pixels each. All randomness goes through world.rng so a seeded world is
// repeatable. Times are seconds of the real clock; the world follows the clock it is given, it has none of its own.

var TILE = 8;
var COLS = 80;
var ROWS = 45;

// Terrain codes
var T = {
    DEEP: 0,
    SHALLOW: 1,
    SAND: 2,
    GRASS: 3,
    ROCK: 4,
    FIELD: 5,
    ROAD: 6,
    PLAZA: 7
};

// Occupancy: what stands on a tile and stops people walking through it
var O = {
    FREE: 0,
    BUILDING: 1,
    TREE: 2,
    ROCK: 3,
    FENCE: 4
};

// ---- random numbers and noise -----------------------------------------------------------------------------------

function mulberry(state) {
    var a = state >>> 0;
    var f = function () {
        a = (a + 0x6d2b79f5) | 0;
        var t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.state = function () {
        return a;
    };
    return f;
}

function hash(x, y, z) {
    var h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul((z | 0) + 1, 2147483647)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t) {
    return t * t * (3 - 2 * t);
}

function vnoise(x, y, s) {
    var xi = Math.floor(x), yi = Math.floor(y);
    var fx = smooth(x - xi), fy = smooth(y - yi);
    var a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

function fbm(x, y, s, oct) {
    var v = 0, amp = 0.5, f = 1, norm = 0;
    for (var i = 0; i < oct; i++) {
        v += vnoise(x * f, y * f, s + i * 17) * amp;
        norm += amp;
        amp *= 0.5;
        f *= 2;
    }
    return v / norm;
}

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

function num(v) {
    return typeof v === "number" && isFinite(v);
}

// ---- buildings --------------------------------------------------------------------------------------------------

// fw, fh: footprint in tiles. cost: wood, stone. time: seconds of one builder's work at a normal pace. beds: people
// who live there. jobs: people who work there. at: where it wants to stand ("centre", "edge", "shore", "rock", "forest").
// unlock: renown needed. max(w) how many the village wants at this point.
var BUILD = {
    tent: {
        fw: 2,
        fh: 1,
        cost: {},
        time: 20,
        beds: 2,
        jobs: 0,
        at: "centre",
        unlock: 0
    },
    hut: {
        fw: 2,
        fh: 2,
        cost: {
            wood: 8
        },
        time: 90,
        beds: 3,
        jobs: 0,
        at: "centre",
        unlock: 0.5
    },
    woodhut: {
        fw: 2,
        fh: 2,
        cost: {
            wood: 6
        },
        time: 80,
        beds: 0,
        jobs: 2,
        job: "chop",
        at: "forest",
        unlock: 1.5
    },
    field: {
        fw: 4,
        fh: 3,
        cost: {
            wood: 3
        },
        time: 60,
        beds: 0,
        jobs: 2,
        job: "farm",
        at: "edge",
        unlock: 3
    },
    well: {
        fw: 1,
        fh: 1,
        cost: {
            stone: 5
        },
        time: 70,
        beds: 0,
        jobs: 0,
        at: "centre",
        unlock: 6
    },
    house: {
        fw: 2,
        fh: 2,
        cost: {
            wood: 10,
            stone: 4
        },
        time: 140,
        beds: 4,
        jobs: 0,
        at: "centre",
        unlock: 8
    },
    storehouse: {
        fw: 2,
        fh: 2,
        cost: {
            wood: 12
        },
        time: 110,
        beds: 0,
        jobs: 1,
        job: "store",
        at: "centre",
        unlock: 10
    },
    quarry: {
        fw: 2,
        fh: 2,
        cost: {
            wood: 10
        },
        time: 100,
        beds: 0,
        jobs: 2,
        job: "mine",
        at: "rock",
        unlock: 14
    },
    farmhouse: {
        fw: 2,
        fh: 2,
        cost: {
            wood: 14,
            stone: 4
        },
        time: 130,
        beds: 4,
        jobs: 0,
        at: "edge",
        unlock: 22
    },
    longhouse: {
        fw: 3,
        fh: 2,
        cost: {
            wood: 18,
            stone: 8
        },
        time: 180,
        beds: 6,
        jobs: 0,
        at: "centre",
        unlock: 30
    },
    market: {
        fw: 4,
        fh: 2,
        cost: {
            wood: 20,
            stone: 10
        },
        time: 200,
        beds: 0,
        jobs: 2,
        job: "trade",
        at: "centre",
        unlock: 40
    },
    windmill: {
        fw: 2,
        fh: 3,
        cost: {
            wood: 24,
            stone: 12
        },
        time: 240,
        beds: 0,
        jobs: 1,
        job: "craft",
        at: "edge",
        unlock: 55
    },
    bakery: {
        fw: 2,
        fh: 2,
        cost: {
            wood: 14,
            stone: 8
        },
        time: 150,
        beds: 0,
        jobs: 1,
        job: "craft",
        at: "centre",
        unlock: 62
    },
    tavern: {
        fw: 3,
        fh: 3,
        cost: {
            wood: 30,
            stone: 15
        },
        time: 260,
        beds: 0,
        jobs: 2,
        job: "play",
        at: "centre",
        unlock: 72
    },
    smithy: {
        fw: 2,
        fh: 2,
        cost: {
            wood: 12,
            stone: 14
        },
        time: 170,
        beds: 0,
        jobs: 1,
        job: "craft",
        at: "centre",
        unlock: 85
    },
    barn: {
        fw: 3,
        fh: 2,
        cost: {
            wood: 24
        },
        time: 200,
        beds: 0,
        jobs: 1,
        job: "herd",
        at: "edge",
        unlock: 95
    },
    dock: {
        fw: 2,
        fh: 1,
        cost: {
            wood: 16
        },
        time: 150,
        beds: 0,
        jobs: 2,
        job: "fish",
        at: "shore",
        unlock: 105
    },
    church: {
        fw: 3,
        fh: 4,
        cost: {
            wood: 30,
            stone: 40
        },
        time: 360,
        beds: 0,
        jobs: 1,
        job: "pray",
        at: "centre",
        unlock: 150
    },
    townhall: {
        fw: 4,
        fh: 3,
        cost: {
            wood: 40,
            stone: 60
        },
        time: 420,
        beds: 0,
        jobs: 1,
        job: "rule",
        at: "centre",
        unlock: 220
    },
    tower: {
        fw: 2,
        fh: 2,
        cost: {
            stone: 40
        },
        time: 300,
        beds: 0,
        jobs: 1,
        job: "guard",
        at: "edge",
        unlock: 260
    },
    library: {
        fw: 3,
        fh: 3,
        cost: {
            wood: 40,
            stone: 50
        },
        time: 380,
        beds: 0,
        jobs: 1,
        job: "study",
        at: "centre",
        unlock: 320
    },
    manor: {
        fw: 3,
        fh: 3,
        cost: {
            wood: 50,
            stone: 40
        },
        time: 400,
        beds: 6,
        jobs: 0,
        at: "centre",
        unlock: 380
    },
    lighthouse: {
        fw: 1,
        fh: 3,
        cost: {
            stone: 50
        },
        time: 340,
        beds: 0,
        jobs: 0,
        at: "shore",
        unlock: 430
    },
    magetower: {
        fw: 2,
        fh: 2,
        cost: {
            stone: 60,
            wood: 20
        },
        time: 420,
        beds: 0,
        jobs: 1,
        job: "study",
        at: "edge",
        unlock: 480
    }
};

// ---- the map ----------------------------------------------------------------------------------------------------

function idx(w, x, y) {
    return y * w.cols + x;
}

function inside(w, x, y) {
    return x >= 0 && y >= 0 && x < w.cols && y < w.rows;
}

function isWater(t) {
    return t === T.DEEP || t === T.SHALLOW;
}

// Tiles from the map edge the sea lies on, as a fraction of the map size, shaped by noise
function seaDepth(w, x, y) {
    var s = w.sea;
    var d;
    if (s === 0)
        d = x;
    else if (s === 1)
        d = w.cols - 1 - x;
    else if (s === 2)
        d = (w.rows - 1 - y) * 1.7;
    else
        d = y * 1.7;
    var along = s < 2 ? y : x;
    var n = fbm(along / 9, d / 9, w.seed + 5, 3);
    return d - (6 + n * 9);
}

function generate(w) {
    var cols = w.cols, rows = w.rows, seed = w.seed;
    var terrain = new Uint8Array(cols * rows);
    var elev = new Float32Array(cols * rows);
    var forest = new Float32Array(cols * rows);

    // The hills sit on the side away from the sea
    var hillX = w.sea === 0 ? 0.78 : w.sea === 1 ? 0.22 : 0.5 + (hash(seed, 3, 3) - 0.5) * 0.5;
    var hillY = w.sea === 2 ? 0.2 : w.sea === 3 ? 0.8 : 0.3 + hash(seed, 4, 4) * 0.4;

    for (var y = 0; y < rows; y++)
        for (var x = 0; x < cols; x++) {
            var i = y * cols + x;
            var e = fbm(x / 14, y / 14, seed + 11, 4);
            var dx = (x / cols - hillX) * 1.4, dy = (y / rows - hillY) * 1.6;
            elev[i] = e * 0.6 + Math.max(0, 0.72 - Math.sqrt(dx * dx + dy * dy)) * 0.9;
            forest[i] = fbm(x / 13, y / 13, seed + 31, 3);
            var sd = seaDepth(w, x, y);
            var t = T.GRASS;
            if (sd < -2.4)
                t = T.DEEP;
            else if (sd < 0)
                t = T.SHALLOW;
            else if (sd < 1.8)
                t = T.SAND;
            else if (elev[i] > 0.66)
                t = T.ROCK;
            terrain[i] = t;
        }

    // A river from the hills to the sea, one or two tiles wide and shallow, so people can wade through it
    var rx = Math.round(hillX * cols), ry = Math.round(hillY * rows);
    var rng = w.rng;
    var tx = w.sea === 0 ? -1 : w.sea === 1 ? 1 : 0, ty = w.sea === 2 ? 1 : w.sea === 3 ? -1 : 0;
    for (var step = 0; step < 600; step++) {
        if (!inside(w, rx, ry) || seaDepth(w, rx, ry) < 0.5)
            break;
        var ri = ry * cols + rx;
        terrain[ri] = T.SHALLOW;
        var side = tx !== 0 ? [0, 1] : [1, 0];
        var wid = hash(rx, ry, seed + 77) < 0.55;
        if (wid && inside(w, rx + side[0], ry + side[1]) && terrain[ri + side[1] * cols + side[0]] !== T.DEEP)
            terrain[ri + side[1] * cols + side[0]] = T.SHALLOW;
        // towards the sea, wandering across
        var wob = Math.sin(step * 0.23 + seed) * 1.1 + (rng() - 0.5) * 1.6;
        var mx, my;
        if (tx !== 0) {
            mx = rng() < 0.7 ? tx : 0;
            my = Math.round(wob);
            if (mx === 0 && my === 0)
                mx = tx;
        } else {
            my = rng() < 0.7 ? ty : 0;
            mx = Math.round(wob);
            if (mx === 0 && my === 0)
                my = ty;
        }
        rx += mx;
        ry += my;
    }
    // sandy banks
    for (var yy = 0; yy < rows; yy++)
        for (var xx = 0; xx < cols; xx++) {
            var j = yy * cols + xx;
            if (terrain[j] !== T.GRASS && terrain[j] !== T.ROCK)
                continue;
            var near = false;
            for (var k = 0; k < 4 && !near; k++) {
                var nx = xx + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = yy + (k === 2 ? 1 : k === 3 ? -1 : 0);
                if (inside(w, nx, ny) && terrain[ny * cols + nx] === T.SHALLOW && hash(xx, yy, seed + 9) < 0.55)
                    near = true;
            }
            if (near)
                terrain[j] = T.SAND;
        }

    w.terrain = terrain;
    w.elev = elev;
    w.forest = forest;
}

// ---- world ------------------------------------------------------------------------------------------------------

function create(opts) {
    var o = opts || {};
    var seed = num(o.seed) ? o.seed >>> 0 : 1;
    var cols = num(o.cols) ? o.cols : COLS;
    var rows = num(o.rows) ? o.rows : ROWS;
    var w = {
        cols: cols,
        rows: rows,
        seed: seed,
        rng: mulberry(seed ^ 0x9e3779b9),
        sea: 0,
        tick: 0,
        time: num(o.now) ? o.now : 0,
        terrain: null,
        elev: null,
        forest: null,
        occ: new Uint8Array(cols * rows),
        doors: new Uint8Array(cols * rows),
        wear: new Float32Array(cols * rows),
        decor: new Uint8Array(cols * rows),
        trees: [],
        rocks: [],
        buildings: [],
        people: [],
        animals: [],
        nextId: 1,
        centre: {
            x: 0,
            y: 0
        },
        gate: {
            x: 0,
            y: 0
        },
        stock: {
            wood: 0,
            stone: 0,
            food: 0,
            goods: 0
        },
        stats: {
            renown: 0,
            seconds: 0,
            founded: num(o.now) ? o.now : 0,
            cpuWork: 0,
            netBytes: 0,
            gpuWork: 0,
            lastArrival: 0
        },
        env: {},
        sig: {},
        events: [],
        noSpot: {},
        fx: [],
        dirty: true,
        treeTarget: 0
    };
    w.sea = Math.floor(hash(seed, 1, 1) * 4);
    generate(w);
    if (usable(o.saved, cols, rows) && o.saved.seed === seed) {
        w.sea = o.saved.sea;
        restore(w, o.saved);
    } else {
        populate(w);
        found(w);
    }
    // The light and the season are there from the first frame, before anything has been stepped
    w.sig.now = w.time;
    updateEnv(w, 0);
    return w;
}

// ---- trees, rocks, ground decoration and the place to settle ----------------------------------------------------------

function windowGrass(w, cx, cy, hw, hh) {
    var good = 0, total = 0;
    for (var y = cy - hh; y <= cy + hh; y++)
        for (var x = cx - hw; x <= cx + hw; x++) {
            total++;
            if (inside(w, x, y) && w.terrain[idx(w, x, y)] === T.GRASS)
                good++;
        }
    return good / total;
}

function waterDistance(w, cx, cy, max) {
    for (var r = 1; r <= max; r++)
        for (var y = cy - r; y <= cy + r; y++)
            for (var x = cx - r; x <= cx + r; x++) {
                if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r || !inside(w, x, y))
                    continue;
                if (isWater(w.terrain[idx(w, x, y)]))
                    return r;
            }
    return max + 1;
}

function average(field, w, cx, cy, r) {
    var sum = 0, n = 0;
    for (var y = cy - r; y <= cy + r; y += 2)
        for (var x = cx - r; x <= cx + r; x += 2)
            if (inside(w, x, y)) {
                sum += field[idx(w, x, y)];
                n++;
            }
    return n ? sum / n : 0;
}

// A flat meadow near water, with woods and hills within reach, towards the middle of the map
function chooseCentre(w) {
    var best = null, bestScore = -1;
    for (var y = Math.floor(w.rows * 0.3); y < Math.floor(w.rows * 0.72); y++)
        for (var x = Math.floor(w.cols * 0.28); x < Math.floor(w.cols * 0.72); x++) {
            var flat = windowGrass(w, x, y, 6, 4);
            if (flat < 0.9)
                continue;
            var wd = waterDistance(w, x, y, 18);
            var woods = clamp((average(w.forest, w, x, y, 20) - 0.42) / 0.14, 0, 1);
            var hills = terrainNear(w, x, y, 22, function (t) {
                return t === T.ROCK;
            }) > 12 ? 1 : 0;
            var score = woods * 1.4 + hills * 0.8 + flat * 2 + (wd >= 6 && wd <= 15 ? 1.2 : wd < 6 ? 0.3 : 0.4) - Math.abs(x - w.cols / 2) * 0.012 - Math.abs(y - w.rows / 2) * 0.02 - w.forest[idx(w, x, y)] * 0.6 + hash(x, y, w.seed + 41) * 0.5;
            if (score > bestScore) {
                bestScore = score;
                best = {
                    x: x,
                    y: y
                };
            }
        }
    return best || {
        x: Math.floor(w.cols / 2),
        y: Math.floor(w.rows / 2)
    };
}

// The map edge tile the road to the outside world starts at, away from the sea
function chooseGate(w) {
    var x = w.sea === 0 ? w.cols - 1 : w.sea === 1 ? 0 : w.centre.x;
    var y = w.sea === 2 ? 0 : w.sea === 3 ? w.rows - 1 : w.centre.y;
    for (var d = 0; d < 40; d++)
        for (var s = -1; s <= 1; s += 2) {
            var gx = w.sea < 2 ? x : clamp(x + d * s, 0, w.cols - 1);
            var gy = w.sea < 2 ? clamp(y + d * s, 0, w.rows - 1) : y;
            var t = w.terrain[idx(w, gx, gy)];
            if (t === T.GRASS || t === T.SAND)
                return {
                    x: gx,
                    y: gy
                };
        }
    return {
        x: x,
        y: y
    };
}

function addTree(w, x, y, kind, size) {
    var i = idx(w, x, y);
    if (w.occ[i] !== O.FREE || w.terrain[i] !== T.GRASS)
        return null;
    w.compDirty = true;
    var t = {
        x: x,
        y: y,
        kind: kind,
        size: size,
        age: 0,
        v: Math.floor(hash(x, y, 3) * 4)
    };
    w.trees.push(t);
    w.occ[i] = O.TREE;
    return t;
}

function populate(w) {
    w.centre = chooseCentre(w);
    w.gate = chooseGate(w);
    var seed = w.seed;
    var rng = w.rng;
    for (var y = 0; y < w.rows; y++)
        for (var x = 0; x < w.cols; x++) {
            var i = idx(w, x, y);
            var t = w.terrain[i];
            var dc = Math.abs(x - w.centre.x), dr = Math.abs(y - w.centre.y);
            var clearing = (dc / 11) * (dc / 11) + (dr / 6.5) * (dr / 6.5) <= 1;
            if (t === T.GRASS && !clearing) {
                var f = w.forest[i];
                var p = clamp((f - 0.52) / 0.24, 0, 1);
                p = p * p * (3 - 2 * p) * 0.72 + 0.012;
                // groves close to the village, so the wood does not have to come from the far edge of the map
                var ring = (dc / 22) * (dc / 22) + (dr / 12) * (dr / 12);
                if (ring < 1 && f > 0.42)
                    p = Math.max(p, 0.22);
                if (rng() < p) {
                    var cold = w.elev[i] > 0.5;
                    var r = rng();
                    var kind = cold || r < 0.34 ? "pine" : r < 0.5 ? "birch" : "oak";
                    var sr = rng();
                    addTree(w, x, y, kind, sr < 0.2 ? 0 : sr < 0.8 ? 1 : 2);
                    continue;
                }
            }
            if (t === T.ROCK && rng() < 0.15) {
                w.rocks.push({
                    x: x,
                    y: y,
                    kind: rng() < 0.16 ? "ore" : "stone",
                    amount: 5 + Math.floor(rng() * 6),
                    v: Math.floor(rng() * 2)
                });
                w.occ[i] = O.ROCK;
                continue;
            }
            if (t === T.GRASS && !clearing && rng() < 0.012) {
                w.rocks.push({
                    x: x,
                    y: y,
                    kind: "stone",
                    amount: 3 + Math.floor(rng() * 4),
                    v: Math.floor(rng() * 2)
                });
                w.occ[i] = O.ROCK;
                continue;
            }
            if (t === T.GRASS) {
                var h = hash(x, y, seed + 7);
                w.decor[i] = h < 0.16 ? 1 : h < 0.2 ? 2 : h < 0.235 ? 3 : h < 0.26 ? 4 : h < 0.275 ? 5 : 0;
            }
        }
}

// Roads and plazas are ground, not objects
function setGround(w, x, y, t) {
    if (!inside(w, x, y))
        return;
    var i = idx(w, x, y);
    if (w.terrain[i] === T.GRASS || w.terrain[i] === T.SAND || w.terrain[i] === T.ROAD)
        w.terrain[i] = t;
    w.decor[i] = 0;
}

// ---- placing buildings ------------------------------------------------------------------------------------------------

// Takes down trees and rocks standing on a footprint; the wood of the trees is returned
function clearArea(w, x0, y0, fw, fh) {
    var wood = 0;
    w.compDirty = true;
    var keep = [];
    for (var i = 0; i < w.trees.length; i++) {
        var t = w.trees[i];
        if (t.x >= x0 && t.x < x0 + fw && t.y >= y0 && t.y < y0 + fh) {
            w.occ[idx(w, t.x, t.y)] = O.FREE;
            wood += 1 + t.size;
        } else
            keep.push(t);
    }
    w.trees = keep;
    var keepRocks = [];
    for (var j = 0; j < w.rocks.length; j++) {
        var r = w.rocks[j];
        if (r.x >= x0 && r.x < x0 + fw && r.y >= y0 && r.y < y0 + fh)
            w.occ[idx(w, r.x, r.y)] = O.FREE;
        else
            keepRocks.push(r);
    }
    w.rocks = keepRocks;
    return wood;
}

// Whether a footprint can be built on: land that is not water or rock, nothing standing on it other than trees and rocks
// that may be cleared
function footprintFree(w, x0, y0, fw, fh, margin) {
    var m = margin || 0;
    for (var y = y0 - m; y < y0 + fh + m; y++)
        for (var x = x0 - m; x < x0 + fw + m; x++) {
            if (!inside(w, x, y))
                return false;
            var i = idx(w, x, y);
            var t = w.terrain[i];
            var inner = x >= x0 && x < x0 + fw && y >= y0 && y < y0 + fh;
            if (inner) {
                if (t !== T.GRASS && t !== T.SAND)
                    return false;
                if (w.occ[i] === O.BUILDING || w.occ[i] === O.FENCE || w.doors[i])
                    return false;
            } else if (w.occ[i] === O.BUILDING || (isWater(t) && m > 1)) {
                return false;
            }
        }
    return true;
}

function newBuilding(w, type, x, y, complete) {
    var d = BUILD[type];
    w.compDirty = true;
    clearArea(w, x, y, d.fw, d.fh);
    var b = {
        id: w.nextId++,
        type: type,
        x: x,
        y: y,
        fw: d.fw,
        fh: d.fh,
        progress: complete ? 1 : 0,
        v: Math.floor(w.rng() * 5),
        level: 1,
        workers: [],
        residents: [],
        door: {
            x: x + Math.floor(d.fw / 2),
            y: y + d.fh
        },
        stock: 0,
        busy: 0,
        lit: false
    };
    w.buildings.push(b);
    if (inside(w, b.door.x, b.door.y))
        w.doors[idx(w, b.door.x, b.door.y)] = 1;
    if (type === "field") {
        for (var j = 0; j < d.fh; j++)
            for (var i = 0; i < d.fw; i++)
                if (complete)
                    setGround(w, x + i, y + j, T.FIELD);
        b.door = {
            x: x + Math.floor(d.fw / 2),
            y: y + d.fh
        };
    } else {
        for (var jj = 0; jj < d.fh; jj++)
            for (var ii = 0; ii < d.fw; ii++)
                w.occ[idx(w, x + ii, y + jj)] = O.BUILDING;
    }
    return b;
}

// ---- paths ------------------------------------------------------------------------------------------------------------

// What it costs to step onto a tile; Infinity if it cannot be entered. The goal and the start are always allowed
function stepCost(w, i, goal) {
    var t = w.terrain[i];
    if (i !== goal && w.occ[i] !== O.FREE)
        return Infinity;
    if (t === T.DEEP)
        return Infinity;
    if (t === T.SHALLOW)
        return 4;
    if (t === T.ROCK)
        return 3;
    if (t === T.ROAD || t === T.PLAZA)
        return 0.62;
    if (t === T.SAND)
        return 1.1;
    return 1;
}

// Labels every walkable tile with the region it belongs to. A target in another region is out of reach, which is told in
// an instant instead of by searching the whole map for it. Recomputed when something that blocks has changed.
function labelRegions(w) {
    var n = w.cols * w.rows;
    var comp = w.comp;
    if (!comp || comp.length !== n) {
        comp = w.comp = new Int32Array(n);
        w.compSize = [0];
    }
    comp.fill(0);
    var sizes = [0];
    var stack = [];
    var label = 0;
    for (var s0 = 0; s0 < n; s0++) {
        if (comp[s0] !== 0 || stepCost(w, s0, -1) === Infinity)
            continue;
        label++;
        var size = 0;
        stack.length = 0;
        stack.push(s0);
        comp[s0] = label;
        while (stack.length) {
            var cur = stack.pop();
            size++;
            var cx = cur % w.cols, cy = (cur - cx) / w.cols;
            for (var d = 0; d < 4; d++) {
                var nx = cx + DX8[d], ny = cy + DY8[d];
                if (nx < 0 || ny < 0 || nx >= w.cols || ny >= w.rows)
                    continue;
                var ni = ny * w.cols + nx;
                if (comp[ni] === 0 && stepCost(w, ni, -1) !== Infinity) {
                    comp[ni] = label;
                    stack.push(ni);
                }
            }
        }
        sizes.push(size);
    }
    w.compSize = sizes;
    w.compDirty = false;
}

function regionOf(w, x, y) {
    if (w.compDirty !== false || !w.comp)
        labelRegions(w);
    return inside(w, x, y) ? w.comp[idx(w, x, y)] : 0;
}

// A* over the tiles, eight ways, never cutting a corner. Returns the tiles from the first step to the goal, or null when
// there is no way (or the search gave up after maxNodes)
function findPath(w, sx, sy, gx, gy, maxNodes) {
    if (!inside(w, sx, sy) || !inside(w, gx, gy))
        return null;
    var cols = w.cols, n = cols * w.rows;
    var a = w.astar;
    if (!a || a.n !== n) {
        a = w.astar = {
            n: n,
            g: new Float32Array(n),
            from: new Int32Array(n),
            mark: new Uint32Array(n),
            run: 0,
            heap: [],
            f: new Float32Array(n)
        };
    }
    var run = ++a.run;
    a.calls = (a.calls || 0) + 1;
    var start = sy * cols + sx, goal = gy * cols + gx;
    if (start === goal)
        return [];
    var g = a.g, from = a.from, mark = a.mark, f = a.f;
    var heap = a.heap;
    heap.length = 0;
    var limit = maxNodes || 6000;
    var push = function (i) {
        heap.push(i);
        var c = heap.length - 1;
        while (c > 0) {
            var par = (c - 1) >> 1;
            if (f[heap[par]] <= f[heap[c]])
                break;
            var tmp = heap[par];
            heap[par] = heap[c];
            heap[c] = tmp;
            c = par;
        }
    };
    var pop = function () {
        var top = heap[0];
        var last = heap.pop();
        if (heap.length > 0) {
            heap[0] = last;
            var c = 0, len = heap.length;
            for (;;) {
                var l = c * 2 + 1, r = l + 1, m = c;
                if (l < len && f[heap[l]] < f[heap[m]])
                    m = l;
                if (r < len && f[heap[r]] < f[heap[m]])
                    m = r;
                if (m === c)
                    break;
                var tmp2 = heap[m];
                heap[m] = heap[c];
                heap[c] = tmp2;
                c = m;
            }
        }
        return top;
    };
    mark[start] = run;
    g[start] = 0;
    from[start] = -1;
    f[start] = 0;
    push(start);
    var closed = {};
    var expanded = 0;
    while (heap.length > 0 && expanded < limit) {
        var cur = pop();
        if (closed[cur])
            continue;
        closed[cur] = 1;
        expanded++;
        if (cur === goal)
            break;
        var cx = cur % cols, cy = (cur - cx) / cols;
        for (var d = 0; d < 8; d++) {
            var dx = DX8[d], dy = DY8[d];
            var nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= cols || ny >= w.rows)
                continue;
            var ni = ny * cols + nx;
            var c1 = stepCost(w, ni, goal);
            if (c1 === Infinity)
                continue;
            if (dx !== 0 && dy !== 0) {
                // no cutting past the corner of something solid
                if (stepCost(w, cy * cols + nx, goal) === Infinity || stepCost(w, ny * cols + cx, goal) === Infinity)
                    continue;
            }
            var ng = g[cur] + c1 * (dx !== 0 && dy !== 0 ? 1.4142 : 1);
            if (mark[ni] === run && ng >= g[ni])
                continue;
            mark[ni] = run;
            g[ni] = ng;
            from[ni] = cur;
            var hx = Math.abs(nx - gx), hy = Math.abs(ny - gy);
            f[ni] = ng + (hx + hy - 0.5858 * Math.min(hx, hy)) * 0.95;
            push(ni);
        }
    }
    a.expanded = (a.expanded || 0) + expanded;
    if (mark[goal] !== run || !closed[goal]) {
        a.failed = (a.failed || 0) + 1;
        return null;
    }
    var path = [];
    for (var c2 = goal; c2 !== start && c2 >= 0; c2 = from[c2])
        path.push({
            x: c2 % cols,
            y: Math.floor(c2 / cols)
        });
    path.reverse();
    return path;
}

var DX8 = [1, -1, 0, 0, 1, 1, -1, -1];
var DY8 = [0, 0, 1, -1, 1, -1, 1, -1];

// The nearest tile around a footprint that people can stand on, preferring the side that faces the viewer
function standingTile(w, x0, y0, fw, fh, fromX, fromY) {
    var best = null, bestD = Infinity;
    var home = regionOf(w, Math.floor(fromX), Math.floor(fromY));
    for (var y = y0 - 1; y <= y0 + fh; y++)
        for (var x = x0 - 1; x <= x0 + fw; x++) {
            if (x >= x0 && x < x0 + fw && y >= y0 && y < y0 + fh)
                continue;
            if (!inside(w, x, y))
                continue;
            var i = idx(w, x, y);
            if (w.occ[i] !== O.FREE || w.terrain[i] === T.DEEP || w.comp[i] !== home || home === 0)
                continue;
            var d = Math.abs(x - fromX) + Math.abs(y - fromY) + (y > y0 + fh - 1 ? -1.5 : 0);
            if (d < bestD) {
                bestD = d;
                best = {
                    x: x,
                    y: y
                };
            }
        }
    return best;
}

// ---- time, season and weather ------------------------------------------------------------------------------------------

function seasonOf(month) {
    return month === 11 || month <= 1 ? "winter" : month <= 4 ? "spring" : month <= 7 ? "summer" : "autumn";
}

// Mean temperature by month, in Celsius, for when no weather reading is there
var MONTH_TEMP = [1.5, 2, 5.5, 9.5, 14, 17, 19.5, 19, 15, 10.5, 5.5, 2.5];

function dayOfYear(d) {
    var start = new Date(d.getFullYear(), 0, 0);
    return Math.floor((d - start) / 86400000);
}

function smoothstep(a, b, x) {
    var t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
}

// Weather codes as the shell reads them from Open-Meteo, mapped to what the village shows
function weatherKind(code) {
    if (!num(code))
        return "clear";
    if (code <= 1)
        return "clear";
    if (code === 2)
        return "partly";
    if (code === 3)
        return "overcast";
    if (code === 45 || code === 48)
        return "fog";
    if (code >= 51 && code <= 57)
        return "drizzle";
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82))
        return "rain";
    if ((code >= 71 && code <= 77) || code === 85 || code === 86)
        return "snow";
    if (code >= 95)
        return "thunder";
    return "clear";
}

// With no reading, a calm made up sky that changes slowly with the date, so the village is never frozen in one weather
function pseudoWeather(w, now, season, month) {
    var slot = Math.floor(now / 5400000);
    var r = hash(slot, w.seed, 61);
    var cold = MONTH_TEMP[month] < 2;
    var kind = r < 0.5 ? "clear" : r < 0.72 ? "partly" : r < 0.88 ? "overcast" : r < 0.95 ? (cold ? "snow" : "rain") : "fog";
    return {
        kind: kind,
        code: null,
        tempC: MONTH_TEMP[month] + (hash(slot, w.seed, 62) - 0.5) * 6,
        wind: 0.15 + hash(slot, w.seed, 63) * 0.4,
        guessed: true
    };
}

function updateEnv(w, dt) {
    var s = w.sig;
    var now = num(s.now) ? s.now : w.time;
    var d = new Date(now);
    var month = d.getMonth();
    var hour = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
    var season = seasonOf(month);
    var env = w.env;
    var doy = dayOfYear(d);

    var wx = s.weather;
    var kind, tempC, wind;
    if (wx && num(wx.code)) {
        kind = weatherKind(wx.code);
        tempC = num(wx.tempC) ? wx.tempC : MONTH_TEMP[month];
        wind = num(wx.wind) ? clamp(wx.wind / 40, 0, 1) : 0.3;
    } else {
        var pw = pseudoWeather(w, now, season, month);
        kind = pw.kind;
        tempC = pw.tempC;
        wind = pw.wind;
    }

    // Sunrise and sunset: the weather's own, else by the date for a mid latitude
    var dayLen = 12 + 4.3 * Math.sin(2 * Math.PI * (doy - 80) / 365);
    var rise = 13 - dayLen / 2, set = 13 + dayLen / 2;
    if (wx && num(wx.sunrise) && num(wx.sunset)) {
        var sr = new Date(wx.sunrise), ss = new Date(wx.sunset);
        rise = sr.getHours() + sr.getMinutes() / 60;
        set = ss.getHours() + ss.getMinutes() / 60;
    }
    var daylight = smoothstep(rise - 0.7, rise + 0.5, hour) * (1 - smoothstep(set - 0.5, set + 0.7, hour));

    env.now = now;
    env.hour = hour;
    env.month = month;
    env.season = season;
    env.rise = rise;
    env.set = set;
    env.daylight = daylight;
    env.night = daylight < 0.22;
    env.kind = kind;
    env.tempC = tempC;
    env.wind = wind;
    env.precip = kind === "rain" ? 0.8 : kind === "drizzle" ? 0.35 : kind === "snow" ? 0.7 : kind === "thunder" ? 1 : 0;
    env.snowing = kind === "snow" || (kind !== "clear" && env.precip > 0 && tempC < 0.5);
    env.raining = env.precip > 0 && !env.snowing;
    env.thunder = kind === "thunder";
    env.clouds = kind === "overcast" || env.precip > 0 || kind === "fog" ? 1 : kind === "partly" ? 0.5 : 0.12;
    env.fog = kind === "fog" ? 1 : 0;
    env.crop = month === 3 ? 1 : month === 4 || month === 5 ? 2 : month === 6 || month === 7 ? 3 : month === 8 ? 4 : 0;
    // food from the fields over the year, 1 at the harvest
    env.yield = [0.55, 0.55, 0.6, 0.7, 0.85, 0.95, 1.0, 1.05, 1.3, 1.1, 0.75, 0.6][month];

    // snow settles while it snows and in the frost, and melts when it is warm
    var target = env.snowing ? 1 : tempC < 0.5 && season === "winter" ? 0.75 : 0;
    var cover = num(env.snowCover) ? env.snowCover : 0;
    if (cover < target)
        cover = Math.min(target, cover + dt / (env.snowing ? 2400 : 7200));
    else if (cover > target)
        cover = Math.max(target, cover - dt * (0.4 + Math.max(0, tempC)) / 7200);
    env.snowCover = cover;
    env.ice = tempC < -1.5 && season === "winter";
}

// ---- readings and what they do ------------------------------------------------------------------------------------------

// The computer's state as the village feels it. Every field may be missing; it then counts as quiet
//   cpu, gpu, mem, disk: 0 to 1; netDown, netUp: bytes per second; cpuTemp, gpuTemp: Celsius
//   weather: { code, tempC, wind (km/h), sunrise, sunset (ms) }; audio: something is playing; now: ms
function setSignals(w, s) {
    var x = s || {};
    var sig = w.sig;
    var k = 0.15;
    var ease = function (old, next, dflt) {
        var v = num(next) ? clamp(next, 0, 1) : dflt;
        return num(old) ? old + (v - old) * k : v;
    };
    sig.cpu = ease(sig.cpu, x.cpu, 0.02);
    sig.gpu = ease(sig.gpu, x.gpu, 0);
    sig.mem = ease(sig.mem, x.mem, 0.3);
    sig.disk = ease(sig.disk, x.disk, 0.3);
    var bytes = (num(x.netDown) ? x.netDown : 0) + (num(x.netUp) ? x.netUp : 0);
    // 10 KB/s is nothing, 10 MB/s is everything, on a log scale
    sig.net = ease(sig.net, clamp(Math.log(1 + bytes / 10000) / Math.log(1001), 0, 1), 0);
    sig.cpuTemp = num(x.cpuTemp) ? x.cpuTemp : sig.cpuTemp;
    sig.gpuTemp = num(x.gpuTemp) ? x.gpuTemp : sig.gpuTemp;
    sig.audio = !!x.audio;
    sig.weather = x.weather || null;
    sig.now = num(x.now) ? x.now : sig.now;
    var fresh = num(x.notifs) ? Math.min(3, Math.max(0, Math.floor(x.notifs))) : 0;
    for (var i = 0; i < fresh && w.fx.length < 4; i++)
        w.fx.push({
            kind: "pigeon",
            t0: w.time,
            side: w.fx.length % 2
        });
}

// How fast people work and walk, from the processor
function rates(w) {
    var c = num(w.sig.cpu) ? w.sig.cpu : 0.02;
    return {
        work: 0.7 + 1.1 * c,
        walk: 0.9 + 0.4 * c
    };
}

// Renown per hour: a quiet computer still grows a village, a busy one grows it much faster
function renownPerHour(w) {
    var s = w.sig;
    return 4 + 14 * (s.cpu || 0) + 8 * (s.net || 0) + 10 * (s.gpu || 0);
}

// ---- people -----------------------------------------------------------------------------------------------------

var PEOPLE_MAX = 90;

// How many people the village's renown can carry: a few at first, then a growing town
function popTarget(w) {
    var P = w.stats.renown;
    return Math.min(PEOPLE_MAX, Math.round(4 + 3.2 * Math.sqrt(Math.max(0, P)) + P / 40));
}

function addPerson(w, x, y, age) {
    var rng = w.rng;
    var p = {
        id: w.nextId++,
        x: x + 0.5,
        y: y + 0.5,
        age: age || "adult",
        grow: 0,
        skin: Math.floor(rng() * 4),
        hair: Math.floor(rng() * 6),
        tone: Math.floor(rng() * 3),
        home: 0,
        work: 0,
        job: "",
        st: "idle",
        path: null,
        pi: 0,
        then: "",
        t: 0,
        act: "",
        target: 0,
        carry: "",
        qty: 0,
        dir: 0,
        ph: rng() * 6,
        inside: false,
        lazy: rng(),
        wait: 0
    };
    if (p.hair === 4)
        p.age = p.age === "adult" && rng() < 0.12 ? "elder" : p.age;
    w.people.push(p);
    return p;
}

function building(w, id) {
    for (var i = 0; i < w.buildings.length; i++)
        if (w.buildings[i].id === id)
            return w.buildings[i];
    return null;
}

function personById(w, id) {
    for (var i = 0; i < w.people.length; i++)
        if (w.people[i].id === id)
            return w.people[i];
    return null;
}

function bedsFree(w) {
    var n = 0;
    for (var i = 0; i < w.buildings.length; i++) {
        var b = w.buildings[i];
        if (b.progress >= 1 && BUILD[b.type].beds > 0)
            n += BUILD[b.type].beds - b.residents.length;
    }
    return n;
}

function bedsTotal(w, withTents) {
    var n = 0;
    for (var i = 0; i < w.buildings.length; i++) {
        var b = w.buildings[i];
        if (b.progress >= 1 && (withTents || b.type !== "tent"))
            n += BUILD[b.type].beds;
    }
    return n;
}

function assignHome(w, p) {
    var best = null, bestKey = Infinity;
    for (var i = 0; i < w.buildings.length; i++) {
        var b = w.buildings[i];
        var d = BUILD[b.type];
        if (b.progress < 1 || d.beds <= b.residents.length)
            continue;
        // tents last, and the nearer to the middle the better
        var key = (b.type === "tent" ? 100 : 0) + Math.abs(b.x - w.centre.x) + Math.abs(b.y - w.centre.y);
        if (key < bestKey) {
            bestKey = key;
            best = b;
        }
    }
    if (best) {
        best.residents.push(p.id);
        p.home = best.id;
    }
}

// ---- walking ------------------------------------------------------------------------------------------------------------

function tileOf(p) {
    return {
        x: Math.floor(p.x),
        y: Math.floor(p.y)
    };
}

// Starts walking to a tile; then is the action to take on arrival. Returns false when there is no way
function goTo(w, p, tx, ty, then) {
    var from = tileOf(p);
    if (from.x === tx && from.y === ty) {
        p.path = [];
        p.pi = 0;
        p.st = "walk";
        p.then = then;
        return true;
    }
    var rg = regionOf(w, tx, ty);
    if (rg === 0 || rg !== regionOf(w, from.x, from.y)) {
        p.path = null;
        return false;
    }
    var path = findPath(w, from.x, from.y, tx, ty, 5000);
    if (!path) {
        p.path = null;
        return false;
    }
    p.path = path;
    p.pi = 0;
    p.st = "walk";
    p.then = then;
    return true;
}

function walk(w, p, dt, speed) {
    var path = p.path;
    if (!path || p.pi >= path.length) {
        arrive(w, p);
        return;
    }
    var next = path[p.pi];
    var tx = next.x + 0.5, ty = next.y + 0.5;
    var dx = tx - p.x, dy = ty - p.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var i = next.y * w.cols + next.x;
    var step = 1.45 * speed * dt * (w.terrain[i] === T.ROAD || w.terrain[i] === T.PLAZA ? 1.2 : w.terrain[i] === T.SHALLOW ? 0.55 : 1);
    p.ph += dt * 7;
    if (Math.abs(dx) > Math.abs(dy) * 1.2)
        p.dir = dx > 0 ? 3 : 2;
    else if (dy !== 0)
        p.dir = dy > 0 ? 0 : 1;
    if (dist <= step) {
        p.x = tx;
        p.y = ty;
        p.pi++;
        // feet wear the ground into a path
        var wi = i;
        var errand = p.job === "haul" || p.job === "build" || p.job === "chop" || p.job === "mine" || p.job === "farm";
        if (errand && (w.terrain[wi] === T.GRASS || w.terrain[wi] === T.SAND)) {
            w.wear[wi] += 1;
            if (w.wear[wi] > 60 && w.occ[wi] === O.FREE && w.decor[wi] < 6) {
                w.terrain[wi] = T.ROAD;
                w.decor[wi] = 0;
                w.dirty = true;
            }
        }
        if (p.pi >= path.length)
            arrive(w, p);
    } else {
        p.x += dx / dist * step;
        p.y += dy / dist * step;
    }
}

function release(w, p) {
    // gives back what the person had claimed
    if (p.act === "chop" || p.act === "mine") {
        var list = p.act === "chop" ? w.trees : w.rocks;
        for (var i = 0; i < list.length; i++)
            if (list[i].claim === p.id)
                list[i].claim = 0;
    }
    if (p.act === "build") {
        var b = building(w, p.target);
        if (b)
            b.builders = Math.max(0, (b.builders || 0) - 1);
    }
    if (p.act === "farm") {
        var f = building(w, p.target);
        if (f)
            f.tenders = Math.max(0, (f.tenders || 0) - 1);
    }
    p.act = "";
    p.target = 0;
    p.job = "";
}

function idleFor(p, secs) {
    p.st = "idle";
    p.wait = secs;
    p.path = null;
}

function enter(w, p) {
    p.inside = true;
    p.st = "inside";
    p.then = "";
}

function emerge(w, p, b) {
    var d = b ? b.door : {
        x: w.centre.x,
        y: w.centre.y
    };
    p.inside = false;
    p.x = d.x + 0.5;
    p.y = d.y + 0.5;
    p.st = "idle";
    p.wait = 0;
}

// The nearest place wood and stone are stored: a storehouse, else the middle of the village
function storageDoor(w, p) {
    var best = null, bd = Infinity;
    for (var i = 0; i < w.buildings.length; i++) {
        var b = w.buildings[i];
        if (b.type !== "storehouse" || b.progress < 1)
            continue;
        var d = Math.abs(b.door.x - p.x) + Math.abs(b.door.y - p.y);
        if (d < bd) {
            bd = d;
            best = b;
        }
    }
    return best ? best.door : {
        x: w.centre.x,
        y: w.centre.y + 1
    };
}

// Food counts in days of food for one person
function foodCapacity(w) {
    var n = 24 + w.people.length * 4;
    for (var i = 0; i < w.buildings.length; i++)
        if (w.buildings[i].progress >= 1 && (w.buildings[i].type === "storehouse" || w.buildings[i].type === "barn"))
            n += 12;
    return n;
}

function capacity(w) {
    var n = 120;
    for (var i = 0; i < w.buildings.length; i++)
        if (w.buildings[i].progress >= 1 && (w.buildings[i].type === "storehouse" || w.buildings[i].type === "barn"))
            n += 90;
    return n;
}

function event(w, id, extra) {
    var e = {
        id: id,
        tick: w.tick
    };
    if (extra)
        for (var k in extra)
            e[k] = extra[k];
    w.events.push(e);
    if (w.events.length > 60)
        w.events.shift();
}

// What happens when a walk ends
function arrive(w, p) {
    var then = p.then;
    p.path = null;
    p.then = "";
    switch (then) {
    case "home": {
        var home = building(w, p.home);
        if (home)
            enter(w, p);
        else
            idleFor(p, 2);
        break;
    }
    case "chop":
    case "mine":
        p.st = "work";
        p.act = then;
        p.t = then === "chop" ? 7 + w.rng() * 3 : 9 + w.rng() * 4;
        break;
    case "build": {
        var site = building(w, p.target);
        if (site && site.progress < 1) {
            p.st = "work";
            p.act = "build";
            p.t = 25 + w.rng() * 20;
        } else
            release(w, p), idleFor(p, 1);
        break;
    }
    case "farm":
        p.st = "work";
        p.act = "farm";
        p.t = 12 + w.rng() * 6;
        break;
    case "fish":
        p.st = "work";
        p.act = "fish";
        p.t = 16 + w.rng() * 8;
        break;
    case "drop":
        w.stock[p.carry] = Math.min(p.carry === "food" ? foodCapacity(w) : capacity(w), (w.stock[p.carry] || 0) + p.qty);
        p.carry = "";
        p.qty = 0;
        idleFor(p, 0.5 + w.rng());
        break;
    case "post":
        p.st = "work";
        p.act = "post";
        p.t = 14 + w.rng() * 16;
        break;
    case "stand":
        p.st = "work";
        p.act = "stand";
        p.t = p.job === "stroll" ? 3 + w.rng() * 9 : 6 + w.rng() * 14;
        break;
    default:
        idleFor(p, 1 + w.rng() * 2);
    }
}

// ---- finishing work -----------------------------------------------------------------------------------------------

function finishWork(w, p) {
    var act = p.act;
    var i;
    if (act === "chop") {
        for (i = 0; i < w.trees.length; i++)
            if (w.trees[i].claim === p.id) {
                var t = w.trees[i];
                w.trees.splice(i, 1);
                w.occ[idx(w, t.x, t.y)] = O.FREE;
                w.dirty = true;
                w.compDirty = true;
                p.carry = "wood";
                p.qty = 1 + t.size + (t.kind === "pine" ? 0 : 1);
                // a cut tree is replanted where it stood most of the time
                if (w.rng() < 0.85 && !nearBuilding(w, t.x, t.y, 1))
                    addTree(w, t.x, t.y, t.kind, -1);
                else
                    w.decor[idx(w, t.x, t.y)] = 6;
                break;
            }
        p.act = "";
        p.job = "haul";
        var door = storageDoor(w, p);
        if (!p.carry || !goTo(w, p, door.x, door.y, "drop"))
            p.carry = "", p.qty = 0, idleFor(p, 1);
        return;
    }
    if (act === "mine") {
        for (i = 0; i < w.rocks.length; i++)
            if (w.rocks[i].claim === p.id) {
                var r = w.rocks[i];
                p.carry = "stone";
                p.qty = r.kind === "ore" ? 3 : 2;
                r.amount--;
                r.claim = 0;
                if (r.amount <= 0) {
                    w.rocks.splice(i, 1);
                    w.occ[idx(w, r.x, r.y)] = O.FREE;
                    w.dirty = true;
                    w.compDirty = true;
                }
                break;
            }
        p.act = "";
        p.job = "haul";
        var d2 = storageDoor(w, p);
        if (!p.carry || !goTo(w, p, d2.x, d2.y, "drop"))
            p.carry = "", p.qty = 0, idleFor(p, 1);
        return;
    }
    if (act === "farm") {
        var field = building(w, p.target);
        if (field)
            field.tenders = Math.max(0, (field.tenders || 0) - 1);
        p.act = "";
        p.job = "haul";
        p.carry = "food";
        p.qty = 0.006 * w.env.yield * (w.env.snowCover > 0.5 ? 0.6 : 1);
        var d3 = storageDoor(w, p);
        if (!goTo(w, p, d3.x, d3.y, "drop"))
            p.carry = "", p.qty = 0, idleFor(p, 1);
        return;
    }
    if (act === "fish") {
        w.stock.food = Math.min(foodCapacity(w), w.stock.food + 0.004);
        p.act = "";
        p.job = "";
        idleFor(p, 1);
        return;
    }
    if (act === "build") {
        // a work session ends; the site keeps its progress
        var b = building(w, p.target);
        release(w, p);
        if (b && b.progress < 1 && !w.env.night && w.rng() < 0.75) {
            // goes on at the same site
            p.act = "build";
            p.target = b.id;
            b.builders = (b.builders || 0) + 1;
            p.st = "work";
            p.t = 25 + w.rng() * 20;
            return;
        }
        idleFor(p, 1 + w.rng() * 2);
        return;
    }
    release(w, p);
    idleFor(p, 1 + w.rng() * 3);
}

// ---- deciding what to do ------------------------------------------------------------------------------------------------

function goHome(w, p) {
    var home = building(w, p.home);
    if (!home) {
        assignHome(w, p);
        home = building(w, p.home);
    }
    release(w, p);
    if (home && goTo(w, p, home.door.x, home.door.y, "home"))
        return;
    // no bed: stands about the fire
    var t = standingTile(w, w.centre.x, w.centre.y, 1, 1, p.x, p.y);
    if (t && goTo(w, p, t.x, t.y, "stand"))
        return;
    idleFor(p, 5);
}

function countWhere(list, fn) {
    var n = 0;
    for (var i = 0; i < list.length; i++)
        if (fn(list[i]))
            n++;
    return n;
}

function nearest(w, p, list, ok, maxd) {
    var best = null, bd = maxd || 40;
    for (var i = 0; i < list.length; i++) {
        var o = list[i];
        if (!ok(o))
            continue;
        var d = Math.abs(o.x - p.x) + Math.abs(o.y - p.y);
        if (d < bd) {
            bd = d;
            best = o;
        }
    }
    return best;
}

function targets(w) {
    return {
        wood: Math.min(300, 60 + w.stats.renown / 2),
        stone: Math.min(200, 30 + w.stats.renown / 3),
        food: w.people.length * 2.5 + 3
    };
}

function randomTileNear(w, cx, cy, r, tries) {
    for (var i = 0; i < (tries || 12); i++) {
        var x = Math.round(cx + (w.rng() * 2 - 1) * r), y = Math.round(cy + (w.rng() * 2 - 1) * r);
        if (!inside(w, x, y))
            continue;
        var k = idx(w, x, y);
        if (w.occ[k] === O.FREE && w.terrain[k] !== T.DEEP && w.terrain[k] !== T.SHALLOW && w.terrain[k] !== T.ROCK)
            return {
                x: x,
                y: y
            };
    }
    return null;
}

function pickLabour(w, p) {
    var tg = targets(w);
    unstick(w, p);
    var st = w.stock;
    var sites = [];
    var i;
    for (i = 0; i < w.buildings.length; i++) {
        var b = w.buildings[i];
        if (b.progress < 1 && (b.builders || 0) < 3)
            sites.push(b);
    }
    var fields = [];
    for (i = 0; i < w.buildings.length; i++) {
        var f = w.buildings[i];
        if (f.type === "field" && f.progress >= 1 && (f.tenders || 0) < 2)
            fields.push(f);
    }
    var docks = [];
    for (i = 0; i < w.buildings.length; i++)
        if (w.buildings[i].type === "dock" && w.buildings[i].progress >= 1)
            docks.push(w.buildings[i]);
    var weights = {
        build: sites.length ? 2.2 : 0,
        chop: Math.max(0, (tg.wood - st.wood) / tg.wood) * (w.trees.length > 8 ? 1 : 0),
        mine: Math.max(0, (tg.stone - st.stone) / tg.stone) * (w.rocks.length > 0 ? 0.9 : 0),
        farm: fields.length ? Math.max(0, (tg.food - st.food) / tg.food) * 1.2 : 0,
        fish: Math.max(0, (tg.food - st.food) / tg.food) * 0.7
    };
    // children of the village's first days build and chop too; nobody stands about while there is something to do
    var total = 0, k;
    for (k in weights)
        total += weights[k];
    var r = w.rng() * total;
    var pick = "";
    for (k in weights) {
        r -= weights[k];
        if (r <= 0 && weights[k] > 0) {
            pick = k;
            break;
        }
    }
    release(w, p);
    var tile;
    if (pick === "build") {
        var site = nearest(w, p, sites, function () {
            return true;
        }, 200);
        if (site) {
            tile = standingTile(w, site.x, site.y, site.fw, site.fh, p.x, p.y);
            if (tile && goTo(w, p, tile.x, tile.y, "build")) {
                p.act = "build";
                p.target = site.id;
                p.job = "build";
                site.builders = (site.builders || 0) + 1;
                return;
            }
        }
    } else if (pick === "chop") {
        var tree = nearest(w, p, w.trees, function (t) {
            return !t.claim && t.size >= 0;
        }, 90);
        if (tree) {
            tile = standingTile(w, tree.x, tree.y, 1, 1, p.x, p.y);
            if (tile && goTo(w, p, tile.x, tile.y, "chop")) {
                tree.claim = p.id;
                p.act = "chop";
                p.job = "chop";
                return;
            }
        }
    } else if (pick === "mine") {
        var rock = nearest(w, p, w.rocks, function (o) {
            return !o.claim;
        }, 90);
        if (rock) {
            tile = standingTile(w, rock.x, rock.y, 1, 1, p.x, p.y);
            if (tile && goTo(w, p, tile.x, tile.y, "mine")) {
                rock.claim = p.id;
                p.act = "mine";
                p.job = "mine";
                return;
            }
        }
    } else if (pick === "farm") {
        var field = nearest(w, p, fields, function () {
            return true;
        }, 200);
        if (field) {
            var fx = field.x + Math.floor(w.rng() * field.fw), fy = field.y + Math.floor(w.rng() * field.fh);
            if (goTo(w, p, fx, fy, "farm")) {
                field.tenders = (field.tenders || 0) + 1;
                p.act = "farm";
                p.target = field.id;
                p.job = "farm";
                return;
            }
        }
    } else if (pick === "fish") {
        var spot = null;
        if (docks.length) {
            var dock = docks[Math.floor(w.rng() * docks.length)];
            spot = {
                x: dock.door.x,
                y: dock.door.y - 1
            };
        } else {
            spot = shoreSpot(w, p);
        }
        if (spot && goTo(w, p, spot.x, spot.y, "fish")) {
            p.act = "fish";
            p.job = "fish";
            return;
        }
    }
    // nothing is needed: an errand somewhere in the village
    var spot = errandSpot(w, p);
    if (spot && goTo(w, p, spot.x, spot.y, "stand")) {
        p.job = "stroll";
        return;
    }
    idleFor(p, 3);
}

// Somewhere to go for no better reason than that people do: a neighbour's door, the market, the well, the shore
function errandSpot(w, p) {
    var r = w.rng();
    var doors = [];
    for (var i = 0; i < w.buildings.length; i++) {
        var b = w.buildings[i];
        if (b.progress >= 1 && b.type !== "field" && b.type !== "tent")
            doors.push(b);
    }
    if (r < 0.14) {
        var home = building(w, p.home);
        if (home)
            return randomTileNear(w, home.door.x, home.door.y, 2.5);
    }
    if (r < 0.62 && doors.length) {
        var d = doors[Math.floor(w.rng() * doors.length)];
        return randomTileNear(w, d.door.x, d.door.y, 2.5);
    }
    if (r < 0.8)
        return randomTileNear(w, w.centre.x + (w.rng() - 0.5) * 20, w.centre.y + (w.rng() - 0.5) * 12, 6);
    if (r < 0.9)
        return shoreSpot(w, p);
    return randomTileNear(w, p.x, p.y, 10);
}

// A sand tile by the water not far from the middle
function shoreSpot(w, p) {
    var best = null, bd = Infinity;
    for (var n = 0; n < 40; n++) {
        var x = Math.round(w.centre.x + (w.rng() * 2 - 1) * 26), y = Math.round(w.centre.y + (w.rng() * 2 - 1) * 15);
        if (!inside(w, x, y))
            continue;
        var i = idx(w, x, y);
        if (w.terrain[i] !== T.SAND || w.occ[i] !== O.FREE)
            continue;
        var wet = false;
        for (var d = 0; d < 4; d++) {
            var nx = x + DX8[d], ny = y + DY8[d];
            if (inside(w, nx, ny) && isWater(w.terrain[idx(w, nx, ny)]))
                wet = true;
        }
        if (!wet)
            continue;
        var dd = Math.abs(x - p.x) + Math.abs(y - p.y);
        if (dd < bd) {
            bd = dd;
            best = {
                x: x,
                y: y
            };
        }
    }
    return best;
}

// A post near the door of a building where its worker stands and works
function workPost(w, p, b) {
    var kind = BUILD[b.type].job;
    var cx = b.door.x, cy = b.door.y;
    if ((kind === "pray" || kind === "rule" || kind === "play") && w.rng() < 0.5) {
        cx = w.centre.x;
        cy = w.centre.y;
    }
    if (kind === "guard") {
        // patrols a ring around the middle
        var a = w.rng() * Math.PI * 2;
        cx = Math.round(w.centre.x + Math.cos(a) * 13);
        cy = Math.round(w.centre.y + Math.sin(a) * 7);
    }
    return randomTileNear(w, cx, cy, kind === "guard" ? 2 : 2.5, 14);
}

// Someone shut in by a new building is set down in the village square
function unstick(w, p) {
    var rg = regionOf(w, Math.floor(p.x), Math.floor(p.y));
    var mainRegion = regionOf(w, w.centre.x, w.centre.y + 1);
    if (rg !== mainRegion && mainRegion !== 0) {
        var t = standingTile(w, w.centre.x, w.centre.y, 1, 1, w.centre.x, w.centre.y + 1);
        if (t) {
            p.x = t.x + 0.5;
            p.y = t.y + 0.5;
            p.path = null;
        }
    }
}

function think(w, p) {
    var env = w.env;
    if (p.st === "inside") {
        if (!env.night && env.daylight > 0.3 + p.lazy * 0.25)
            emerge(w, p, building(w, p.home));
        return;
    }
    var nightOwl = p.work && BUILD[(building(w, p.work) || {
            type: "hut"
        }).type].job === "guard";
    if (env.night && !nightOwl) {
        goHome(w, p);
        return;
    }
    if (p.age === "child") {
        var play = w.rng() < 0.5 ? errandSpot(w, p) : randomTileNear(w, p.x, p.y, 5);
        if (play && goTo(w, p, play.x, play.y, "stand"))
            return;
        idleFor(p, 3);
        return;
    }
    // the evening: some go to the tavern or the square
    var evening = env.hour > env.set - 0.5 && env.hour < env.set + 2.5;
    if (evening && w.rng() < 0.4 && !nightOwl) {
        var tavern = null;
        for (var i = 0; i < w.buildings.length; i++)
            if (w.buildings[i].type === "tavern" && w.buildings[i].progress >= 1)
                tavern = w.buildings[i];
        var tx = tavern ? tavern.door.x : w.centre.x, ty = tavern ? tavern.door.y : w.centre.y;
        var meet = randomTileNear(w, tx, ty, 3);
        if (meet && goTo(w, p, meet.x, meet.y, "stand")) {
            p.job = "social";
            return;
        }
    }
    // a festival draws everyone who is not busy building
    if (w.sig.audio && !env.night && p.job !== "build" && w.rng() < 0.35) {
        var party = randomTileNear(w, w.centre.x, w.centre.y, 3.5);
        if (party && goTo(w, p, party.x, party.y, "stand")) {
            p.job = "party";
            return;
        }
    }
    if (p.work) {
        var wb = building(w, p.work);
        if (wb && wb.progress >= 1) {
            release(w, p);
            var post = workPost(w, p, wb);
            if (post && goTo(w, p, post.x, post.y, "post")) {
                p.job = BUILD[wb.type].job;
                return;
            }
            idleFor(p, 4);
            return;
        }
        p.work = 0;
    }
    pickLabour(w, p);
}

// ---- finishing a building -------------------------------------------------------------------------------------------------

function layRoad(w, fromX, fromY, toX, toY) {
    var path = findPath(w, fromX, fromY, toX, toY, 4000);
    if (!path)
        return false;
    for (var i = 0; i < path.length; i++) {
        var k = idx(w, path[i].x, path[i].y);
        if (w.terrain[k] === T.GRASS || w.terrain[k] === T.SAND)
            setGround(w, path[i].x, path[i].y, T.ROAD);
    }
    w.dirty = true;
    return true;
}

function paveFront(w, b, tilesWide, tilesDeep) {
    var x0 = b.x + Math.floor(b.fw / 2) - Math.floor(tilesWide / 2);
    for (var y = b.y + b.fh; y < b.y + b.fh + tilesDeep; y++)
        for (var x = x0; x < x0 + tilesWide; x++)
            if (inside(w, x, y) && w.occ[idx(w, x, y)] === O.FREE)
                setGround(w, x, y, T.PLAZA);
}

// The line a dock's boat sails along: from the water beside it as far as the water goes
function sailRoute(w, b) {
    var best = null;
    var sides = [[-1, 0], [1, 0], [0, 1], [0, -1]];
    for (var s = 0; s < 4; s++) {
        var dx = sides[s][0], dy = sides[s][1];
        var sx = dx < 0 ? b.x - 1 : dx > 0 ? b.x + b.fw : b.x + Math.floor(b.fw / 2);
        var sy = dy < 0 ? b.y - 1 : dy > 0 ? b.y + b.fh : b.y + Math.floor(b.fh / 2);
        var n = 0;
        while (n < 14 && inside(w, sx + dx * n, sy + dy * n) && isWater(w.terrain[idx(w, sx + dx * n, sy + dy * n)]))
            n++;
        if (n >= 3 && (!best || n > best.len))
            best = {
                x: sx,
                y: sy,
                dx: dx,
                dy: dy,
                len: n
            };
    }
    b.sail = best;
}

// The middle of the sea, where the gulls fly, and the road in from the gate that carts follow
function landmarks(w) {
    var sx = 0, sy = 0, n = 0;
    for (var y = 0; y < w.rows; y += 2)
        for (var x = 0; x < w.cols; x += 2)
            if (w.terrain[idx(w, x, y)] === T.DEEP) {
                sx += x;
                sy += y;
                n++;
            }
    w.seaCentre = n ? {
        x: sx / n,
        y: sy / n
    } : {
        x: 0,
        y: 0
    };
    w.route = findPath(w, w.gate.x, w.gate.y, w.centre.x, w.centre.y + 1, 6000) || [];
    for (var i = 0; i < w.buildings.length; i++)
        if (w.buildings[i].type === "dock")
            sailRoute(w, w.buildings[i]);
}

function completeBuilding(w, b) {
    b.progress = 1;
    if (b.type === "dock")
        sailRoute(w, b);
    var d = BUILD[b.type];
    if (b.type === "field") {
        for (var j = 0; j < d.fh; j++)
            for (var i = 0; i < d.fw; i++)
                setGround(w, b.x + i, b.y + j, T.FIELD);
    }
    if (b.type === "market" || b.type === "townhall" || b.type === "church" || b.type === "tavern")
        paveFront(w, b, b.type === "market" ? 6 : b.fw + 1, 1);
    if (b.type === "well")
        paveFront(w, b, 3, 1);
    layRoad(w, b.door.x, b.door.y, w.centre.x, w.centre.y + 1);
    w.dirty = true;
    event(w, "built", {
        type: b.type
    });
    // everyone who was building here is done
    for (var k = 0; k < w.people.length; k++) {
        var p = w.people[k];
        if (p.act === "build" && p.target === b.id) {
            release(w, p);
            idleFor(p, 1 + w.rng() * 2);
        }
    }
    // tents come down once there are real beds for everyone
    if (b.type !== "tent" && bedsTotal(w, false) >= w.people.length + 2)
        removeTents(w);
}

function removeTents(w) {
    w.compDirty = true;
    for (var i = w.buildings.length - 1; i >= 0; i--) {
        var b = w.buildings[i];
        if (b.type !== "tent")
            continue;
        for (var jj = 0; jj < b.fh; jj++)
            for (var ii = 0; ii < b.fw; ii++)
                w.occ[idx(w, b.x + ii, b.y + jj)] = O.FREE;
        for (var r = 0; r < b.residents.length; r++) {
            var p = personById(w, b.residents[r]);
            if (p) {
                p.home = 0;
                assignHome(w, p);
                if (p.inside) {
                    var nh = building(w, p.home);
                    emerge(w, p, nh || b);
                    p.st = "idle";
                    p.inside = false;
                }
            }
        }
        w.doors[idx(w, b.door.x, b.door.y)] = 0;
        w.buildings.splice(i, 1);
        w.dirty = true;
    }
}

// ---- the planner ------------------------------------------------------------------------------------------------------------

function countOf(w, type, builtOnly) {
    var n = 0;
    for (var i = 0; i < w.buildings.length; i++)
        if (w.buildings[i].type === type && (!builtOnly || w.buildings[i].progress >= 1))
            n++;
    return n;
}

function inPlaza(w, x0, y0, fw, fh) {
    var c = w.centre;
    return x0 < c.x + 4 && x0 + fw > c.x - 3 && y0 < c.y + 2 && y0 + fh > c.y - 1;
}

function treesNear(w, cx, cy, r) {
    var n = 0;
    for (var i = 0; i < w.trees.length; i++)
        if (Math.abs(w.trees[i].x - cx) <= r && Math.abs(w.trees[i].y - cy) <= r)
            n++;
    return n;
}

function buildingsNear(w, cx, cy, r) {
    var n = 0;
    for (var i = 0; i < w.buildings.length; i++)
        if (Math.abs(w.buildings[i].x - cx) <= r && Math.abs(w.buildings[i].y - cy) <= r)
            n++;
    return n;
}

function terrainNear(w, cx, cy, r, pred) {
    var n = 0;
    for (var y = cy - r; y <= cy + r; y++)
        for (var x = cx - r; x <= cx + r; x++)
            if (inside(w, x, y) && pred(w.terrain[idx(w, x, y)]))
                n++;
    return n;
}

function touchesWater(w, x0, y0, fw, fh) {
    for (var y = y0 - 1; y <= y0 + fh; y++)
        for (var x = x0 - 1; x <= x0 + fw; x++) {
            if (x >= x0 && x < x0 + fw && y >= y0 && y < y0 + fh)
                continue;
            if (inside(w, x, y) && isWater(w.terrain[idx(w, x, y)]))
                return true;
        }
    return false;
}

// Where a building of a type should go; null when nothing fits
function findSpot(w, type) {
    var d = BUILD[type];
    var c = w.centre;
    var tight = type === "house" || type === "hut" || type === "longhouse" || type === "well" || type === "tent";
    var cands = [];
    for (var y = Math.max(2, c.y - 20); y < Math.min(w.rows - 2, c.y + 20); y++)
        for (var x = Math.max(2, c.x - 34); x < Math.min(w.cols - 2, c.x + 34); x++) {
            if (inPlaza(w, x, y, d.fw, d.fh))
                continue;
            if (!footprintFree(w, x, y, d.fw, d.fh, tight ? 0 : 1))
                continue;
            var doorX = x + Math.floor(d.fw / 2), doorY = y + d.fh;
            if (!inside(w, doorX, doorY))
                continue;
            var di = idx(w, doorX, doorY);
            var dt = w.terrain[di];
            if (w.occ[di] !== O.FREE && w.occ[di] !== O.TREE || isWater(dt) || dt === T.ROCK)
                continue;
            var dist = Math.sqrt(Math.pow(x + d.fw / 2 - c.x, 2) + Math.pow((y + d.fh / 2 - c.y) * 1.7, 2));
            var score = 0;
            switch (d.at) {
            case "centre":
                score = -Math.abs(dist - 8) * 0.5 + Math.min(6, buildingsNear(w, x, y, 5)) * 0.35;
                break;
            case "edge":
                score = -Math.abs(dist - 16) * 0.3 + terrainNear(w, x + 1, y + 1, 4, function (t) {
                    return t === T.GRASS;
                }) * 0.05 - treesNear(w, x, y, 3) * 0.12;
                if (type === "field" && terrainNear(w, x + 2, y + 1, 8, isWater) > 0)
                    score += 1.2;
                break;
            case "forest":
                score = treesNear(w, x, y, 5) * 0.22 - Math.abs(dist - 13) * 0.2;
                if (treesNear(w, x, y, 5) < 4)
                    continue;
                break;
            case "rock":
                if (terrainNear(w, x, y, 4, function (t) {
                    return t === T.ROCK;
                }) < 3)
                    continue;
                score = -dist * 0.15;
                break;
            case "shore":
                if (!touchesWater(w, x, y, d.fw, d.fh) || dist > 34)
                    continue;
                score = -dist * 0.2;
                break;
            }
            // an old forest is not cleared for a house if there is open ground
            score -= treesNear(w, x, y, 1) * 0.5;
            score += w.rng() * 0.7;
            cands.push({
                x: x,
                y: y,
                score: score,
                door: {
                    x: doorX,
                    y: doorY
                }
            });
        }
    cands.sort(function (a, b) {
        return b.score - a.score;
    });
    for (var i = 0; i < Math.min(cands.length, 10); i++) {
        var cd = cands[i];
        if (!keepsAccess(w, cd.x, cd.y, d.fw, d.fh, cd.door.x, cd.door.y))
            continue;
        var path = findPath(w, cd.door.x, cd.door.y, c.x, c.y + 1, 3000);
        if (path && path.length < 80)
            return cd;
    }
    return null;
}

// Whether the village stays in one piece with a footprint put down: the middle, the new door and every door that could be
// reached before must still be reachable
function keepsAccess(w, x0, y0, fw, fh, doorX, doorY) {
    var main = regionOf(w, w.centre.x, w.centre.y + 1);
    if (main === 0)
        return false;
    var open = [];
    var i;
    for (i = 0; i < w.buildings.length; i++) {
        var b = w.buildings[i];
        if (b.type !== "field" && w.comp[idx(w, b.door.x, b.door.y)] === main)
            open.push(b);
    }
    var kept = [];
    var j, k;
    for (j = 0; j < fh; j++)
        for (k = 0; k < fw; k++) {
            var t = idx(w, x0 + k, y0 + j);
            kept.push(w.occ[t]);
            w.occ[t] = O.BUILDING;
        }
    labelRegions(w);
    var ok = w.comp[idx(w, w.centre.x, w.centre.y + 1)] === main && w.comp[idx(w, doorX, doorY)] === main;
    for (i = 0; ok && i < open.length; i++)
        if (w.comp[idx(w, open[i].door.x, open[i].door.y)] !== w.comp[idx(w, w.centre.x, w.centre.y + 1)])
            ok = false;
    var n = 0;
    for (j = 0; j < fh; j++)
        for (k = 0; k < fw; k++)
            w.occ[idx(w, x0 + k, y0 + j)] = kept[n++];
    w.compDirty = true;
    return ok;
}

function affordable(w, type) {
    var cost = BUILD[type].cost;
    for (var k in cost)
        if ((w.stock[k] || 0) < cost[k])
            return false;
    return true;
}

// How many of a type the village wants now
function desired(w, type) {
    var P = w.stats.renown, pop = w.people.length;
    switch (type) {
    case "woodhut":
        return Math.min(4, 1 + Math.floor(P / 110));
    case "field":
        return Math.min(8, Math.max(1, Math.ceil(pop / 12)), Math.floor(P / 15) + 1);
    case "well":
        return P < 150 ? 1 : 2;
    case "storehouse":
        return Math.min(6, 1 + Math.floor((w.sig.disk || 0.3) * 4) + Math.floor(P / 180));
    case "quarry":
        return P < 200 ? 1 : 2;
    case "farmhouse":
        return Math.min(4, Math.floor(P / 60));
    case "market":
    case "bakery":
    case "tavern":
    case "smithy":
    case "church":
    case "townhall":
    case "library":
    case "lighthouse":
        return 1;
    case "windmill":
        return countOf(w, "field", true) >= 2 ? 1 : 0;
    case "barn":
        return Math.min(3, 1 + Math.floor(P / 220));
    case "dock":
        return P < 400 ? 1 : 2;
    case "tower":
        return P < 600 ? 1 : 2;
    case "manor":
        return Math.min(2, Math.floor(P / 380));
    case "magetower":
        return w.stats.gpuWork > 900 || P > 900 ? 1 : 0;
    }
    return 0;
}

// Civic and work buildings in the order the village wants them
var ORDER = ["woodhut", "field", "well", "storehouse", "quarry", "market", "bakery", "windmill", "tavern", "smithy", "barn", "dock", "church", "townhall", "tower", "library", "farmhouse", "lighthouse", "manor", "magetower"];

function housingType(w) {
    var P = w.stats.renown;
    var homes = countOf(w, "house") + countOf(w, "longhouse") + countOf(w, "hut");
    if (P >= 380 && countOf(w, "manor") < desired(w, "manor") && affordable(w, "manor"))
        return "manor";
    if (P >= 30 && homes % 3 === 2 && affordable(w, "longhouse"))
        return "longhouse";
    if (P >= 8 && affordable(w, "house"))
        return "house";
    if (P >= 0.5 && affordable(w, "hut"))
        return "hut";
    return null;
}

function sitesOpen(w) {
    var n = 0;
    for (var i = 0; i < w.buildings.length; i++)
        if (w.buildings[i].progress < 1)
            n++;
    return n;
}

function bedsPlanned(w) {
    var n = 0;
    for (var i = 0; i < w.buildings.length; i++)
        n += BUILD[w.buildings[i].type].beds;
    return n;
}

function place(w, type) {
    var spot = findSpot(w, type);
    if (!spot) {
        w.noSpot[type] = w.time + 240000;
        return false;
    }
    var d = BUILD[type];
    // the cost is set aside now, the builders then only need the time
    for (var k in d.cost)
        w.stock[k] -= d.cost[k];
    var wood = clearArea(w, spot.x, spot.y, d.fw, d.fh);
    w.stock.wood = Math.min(capacity(w), w.stock.wood + Math.floor(wood / 2));
    newBuilding(w, type, spot.x, spot.y, false);
    w.dirty = true;
    event(w, "plan", {
        type: type
    });
    return true;
}

function plan(w) {
    var P = w.stats.renown, pop = w.people.length;
    var maxSites = Math.min(4, 1 + Math.floor(pop / 9));
    if (sitesOpen(w) >= maxSites)
        return;
    var open = function (type) {
        return !(w.noSpot[type] && w.noSpot[type] > w.time);
    };
    // beds first
    if (bedsPlanned(w) < Math.max(pop, popTarget(w)) + 2 && open("house")) {
        var h = housingType(w);
        if (h && open(h) && place(w, h))
            return;
        if (!h && bedsPlanned(w) < pop)
            return;
    }
    for (var i = 0; i < ORDER.length; i++) {
        var type = ORDER[i];
        var d = BUILD[type];
        if (P < d.unlock || !open(type))
            continue;
        if (countOf(w, type) >= desired(w, type))
            continue;
        if (!affordable(w, type)) {
            // saves up for it rather than spending on something less important
            return;
        }
        if (place(w, type))
            return;
    }
}

// ---- jobs in the buildings ----------------------------------------------------------------------------------------------

var WORKPLACE = {
    trade: 1,
    craft: 1,
    play: 1,
    pray: 1,
    rule: 1,
    guard: 1,
    study: 1,
    herd: 1
};

function assignWork(w) {
    var i, j;
    // drop jobs whose building is gone
    for (i = 0; i < w.people.length; i++) {
        var p = w.people[i];
        if (p.work && !building(w, p.work))
            p.work = 0;
    }
    for (i = 0; i < w.buildings.length; i++) {
        var b = w.buildings[i];
        var d = BUILD[b.type];
        if (b.progress < 1 || !WORKPLACE[d.job])
            continue;
        b.workers = b.workers.filter(function (id) {
            var q = personById(w, id);
            return q && q.work === b.id;
        });
        while (b.workers.length < d.jobs) {
            var pick = null;
            for (j = 0; j < w.people.length; j++) {
                var q = w.people[j];
                if (q.age === "adult" && !q.work && q.st !== "inside") {
                    pick = q;
                    break;
                }
            }
            if (!pick)
                break;
            pick.work = b.id;
            b.workers.push(pick.id);
        }
    }
}

// ---- growth --------------------------------------------------------------------------------------------------------------

function nearBuilding(w, x, y, r) {
    return buildingsNear(w, x, y, r) > 0;
}

function growTrees(w, dt) {
    var i;
    for (i = 0; i < w.trees.length; i++) {
        var t = w.trees[i];
        t.age += dt;
        if (t.size === -1 && t.age > 1200) {
            t.size = 0;
            t.age = 0;
        } else if (t.size === 0 && t.age > 10000) {
            t.size = 1;
            t.age = 0;
        }
    }
    // saplings where the forest was cut, near the trees that are left
    if (w.trees.length < w.treeTarget && w.trees.length > 0 && w.rng() < 0.6) {
        var parent = w.trees[Math.floor(w.rng() * w.trees.length)];
        var x = parent.x + Math.round((w.rng() * 2 - 1) * 3), y = parent.y + Math.round((w.rng() * 2 - 1) * 3);
        if (inside(w, x, y) && !nearBuilding(w, x, y, 2) && !inPlaza(w, x, y, 1, 1) && w.terrain[idx(w, x, y)] === T.GRASS && w.occ[idx(w, x, y)] === O.FREE) {
            var s = addTree(w, x, y, parent.kind, -1);
            if (s)
                w.dirty = true;
        }
    }
}

function immigrate(w) {
    var pop = w.people.length;
    if (pop >= popTarget(w) || bedsFree(w) < 1 || w.stock.food < pop * 0.8 + 1)
        return;
    if (w.time - w.stats.lastArrival < 70000)
        return;
    w.stats.lastArrival = w.time;
    var n = 1 + (w.rng() < 0.4 ? 1 : 0);
    for (var i = 0; i < n && w.people.length < PEOPLE_MAX; i++) {
        var p = addPerson(w, w.gate.x, w.gate.y, "adult");
        assignHome(w, p);
        goTo(w, p, w.centre.x, w.centre.y + 1, "stand");
    }
    if (w.rng() < 0.3 && bedsFree(w) > 0) {
        var kid = addPerson(w, w.gate.x, w.gate.y, "child");
        assignHome(w, kid);
        goTo(w, kid, w.centre.x, w.centre.y + 1, "stand");
    }
    event(w, "arrive", {
        count: n
    });
}

function births(w) {
    var adults = countWhere(w.people, function (p) {
        return p.age !== "child";
    });
    if (adults < 2 || w.people.length >= popTarget(w) + 2 || bedsFree(w) < 1 || w.stock.food < w.people.length * 1.5 + 1)
        return;
    if (w.rng() > 0.04)
        return;
    var kid = addPerson(w, w.centre.x, w.centre.y, "child");
    assignHome(w, kid);
    var home = building(w, kid.home);
    if (home) {
        kid.x = home.door.x + 0.5;
        kid.y = home.door.y + 0.5;
        enter(w, kid);
    }
    event(w, "birth");
}

function growUp(w, dt) {
    for (var i = 0; i < w.people.length; i++) {
        var p = w.people[i];
        if (p.age === "child") {
            p.grow += dt;
            if (p.grow > 2700) {
                p.age = "adult";
                p.grow = 0;
            }
        }
    }
}

// ---- the world's clock --------------------------------------------------------------------------------------------------

function economy(w, dt) {
    var s = w.stock;
    var pop = w.people.length;
    var i;
    s.food = Math.max(0, s.food - pop / 86400 * dt);
    // fires burn more wood the colder it is
    var cold = clamp((10 - w.env.tempC) / 15, 0, 1.5);
    s.wood = Math.max(0, s.wood - pop * 0.0004 * (1 + cold) * dt);
    for (i = 0; i < w.buildings.length; i++) {
        var b = w.buildings[i];
        b.busy = 0;
    }
    for (i = 0; i < w.people.length; i++) {
        var p = w.people[i];
        if (p.st === "work" && p.act === "post" && p.work) {
            var wb = building(w, p.work);
            if (wb) {
                wb.busy++;
                if (wb.type === "bakery" || wb.type === "windmill")
                    s.food += 0.00002 * dt * w.env.yield;
                if (wb.type === "barn")
                    s.food += 0.000015 * dt;
            }
        }
    }
    var cap = capacity(w);
    s.wood = Math.min(cap, s.wood);
    s.stone = Math.min(cap, s.stone);
    s.food = Math.min(foodCapacity(w), s.food);
    w.hungry = s.food < pop * 0.05 && pop > 0;
    var sig = w.sig;
    w.stats.cpuWork += (sig.cpu || 0) * dt;
    w.stats.gpuWork += (sig.gpu || 0) * dt;
    w.stats.seconds += dt;
    w.stats.renown += renownPerHour(w) / 3600 * dt;
}

// Founds the settlement: three tents about a fire, four people walking in from the road
function found(w) {
    var c = w.centre;
    w.stock.wood = 14;
    w.stock.food = 24;
    w.stats.renown = 0.6;
    var spots = [[-6, -2], [4, -2], [-3, 3], [3, 3]];
    var n = 0;
    for (var i = 0; i < spots.length && n < 3; i++) {
        var x = c.x + spots[i][0], y = c.y + spots[i][1];
        if (footprintFree(w, x, y, 2, 1, 0)) {
            newBuilding(w, "tent", x, y, true);
            n++;
        }
    }
    layRoad(w, w.gate.x, w.gate.y, c.x, c.y + 1);
    landmarks(w);
    for (var k = 0; k < 4; k++) {
        var p = addPerson(w, w.gate.x, w.gate.y, "adult");
        assignHome(w, p);
        goTo(w, p, c.x + (k % 2 ? 1 : -1), c.y + 1, "stand");
        p.wait = 0;
    }
    w.treeTarget = Math.round(w.trees.length * 0.9);
    event(w, "founded");
}

function step(w, dt) {
    w.tick++;
    w.time += dt * 1000;
    // a pigeon stays for twenty seconds
    while (w.fx.length && w.time - w.fx[0].t0 > 20000)
        w.fx.shift();
    if (w.env.now === undefined || !w.sig.now)
        w.sig.now = w.sig.now || w.time;
    updateEnv(w, dt);
    var r = rates(w);
    w.acc = (w.acc || 0) + dt;
    w.acc5 = (w.acc5 || 0) + dt;
    w.acc10 = (w.acc10 || 0) + dt;
    if (w.acc >= 1) {
        economy(w, w.acc);
        growUp(w, w.acc);
        w.acc = 0;
    }
    if (w.acc5 >= 5) {
        plan(w);
        growTrees(w, w.acc5);
        w.acc5 = 0;
        w.wearAt = (w.wearAt || 0) + 1;
        if (w.wearAt >= 12) {
            // tracks that are not walked grow over again
            w.wearAt = 0;
            for (var wi = 0; wi < w.wear.length; wi++)
                if (w.wear[wi] > 0)
                    w.wear[wi] *= 0.93;
        }
    }
    if (w.acc10 >= 10) {
        assignWork(w);
        immigrate(w);
        births(w);
        w.acc10 = 0;
    }
    for (var i = 0; i < w.people.length; i++) {
        var p = w.people[i];
        if (p.st === "walk")
            walk(w, p, dt, r.walk);
        else if (p.st === "work") {
            p.t -= dt * r.work;
            p.ph += dt * 6;
            if (p.act === "build") {
                var site = building(w, p.target);
                if (site && site.progress < 1) {
                    var before = Math.floor(site.progress * 24);
                    site.progress = Math.min(1, site.progress + dt * r.work / BUILD[site.type].time);
                    if (Math.floor(site.progress * 24) !== before)
                        w.dirty = true;
                    if (site.progress >= 1) {
                        completeBuilding(w, site);
                        continue;
                    }
                }
            }
            if (p.t <= 0)
                finishWork(w, p);
        } else if (p.st === "inside") {
            w.thinkAt = (w.thinkAt || 0);
            if (((w.tick + p.id) % 20) === 0)
                think(w, p);
        } else {
            p.wait -= dt;
            if (p.wait <= 0)
                think(w, p);
        }
    }
}

// ---- save and restore ---------------------------------------------------------------------------------------------------

var KINDS = ["oak", "pine", "birch"];

function snapshot(w) {
    var terrain = "", decor = "";
    for (var i = 0; i < w.terrain.length; i++) {
        terrain += w.terrain[i];
        decor += w.decor[i];
    }
    return {
        v: 1,
        seed: w.seed,
        cols: w.cols,
        rows: w.rows,
        rng: w.rng.state(),
        time: w.time,
        nextId: w.nextId,
        sea: w.sea,
        centre: w.centre,
        gate: w.gate,
        stats: w.stats,
        stock: w.stock,
        snow: w.env.snowCover || 0,
        treeTarget: w.treeTarget,
        terrain: terrain,
        decor: decor,
        trees: w.trees.map(function (t) {
            return [t.x, t.y, KINDS.indexOf(t.kind), t.size, Math.round(t.age), t.v];
        }),
        rocks: w.rocks.map(function (r) {
            return [r.x, r.y, r.kind === "ore" ? 1 : 0, r.amount, r.v];
        }),
        buildings: w.buildings.map(function (b) {
            return {
                id: b.id,
                type: b.type,
                x: b.x,
                y: b.y,
                progress: b.progress,
                v: b.v,
                residents: b.residents,
                workers: b.workers
            };
        }),
        people: w.people.map(function (p) {
            return {
                id: p.id,
                x: p.x,
                y: p.y,
                age: p.age,
                grow: p.grow,
                skin: p.skin,
                hair: p.hair,
                tone: p.tone,
                home: p.home,
                work: p.work,
                lazy: p.lazy,
                inside: p.inside
            };
        })
    };
}

function usable(s, cols, rows) {
    return !!s && s.v === 1 && s.cols === cols && s.rows === rows && typeof s.terrain === "string" && s.terrain.length === cols * rows && typeof s.decor === "string" && s.decor.length === cols * rows && Array.isArray(s.trees) && Array.isArray(s.buildings) && Array.isArray(s.people) && num(s.seed);
}

function restore(w, s) {
    var i;
    for (i = 0; i < w.terrain.length; i++) {
        w.terrain[i] = s.terrain.charCodeAt(i) - 48;
        w.decor[i] = s.decor.charCodeAt(i) - 48;
    }
    w.occ.fill(0);
    w.doors.fill(0);
    w.compDirty = true;
    w.trees = [];
    w.rocks = [];
    for (i = 0; i < s.trees.length; i++) {
        var t = s.trees[i];
        if (!inside(w, t[0], t[1]) || w.occ[idx(w, t[0], t[1])] !== O.FREE)
            continue;
        w.trees.push({
            x: t[0],
            y: t[1],
            kind: KINDS[t[2]] || "oak",
            size: t[3],
            age: t[4],
            v: t[5]
        });
        w.occ[idx(w, t[0], t[1])] = O.TREE;
    }
    for (i = 0; i < s.rocks.length; i++) {
        var r = s.rocks[i];
        if (!inside(w, r[0], r[1]) || w.occ[idx(w, r[0], r[1])] !== O.FREE)
            continue;
        w.rocks.push({
            x: r[0],
            y: r[1],
            kind: r[2] ? "ore" : "stone",
            amount: r[3],
            v: r[4]
        });
        w.occ[idx(w, r[0], r[1])] = O.ROCK;
    }
    w.buildings = [];
    for (i = 0; i < s.buildings.length; i++) {
        var sb = s.buildings[i];
        var d = BUILD[sb.type];
        if (!d)
            continue;
        var b = {
            id: sb.id,
            type: sb.type,
            x: sb.x,
            y: sb.y,
            fw: d.fw,
            fh: d.fh,
            progress: sb.progress,
            v: sb.v,
            level: 1,
            workers: sb.workers || [],
            residents: sb.residents || [],
            door: {
                x: sb.x + Math.floor(d.fw / 2),
                y: sb.y + d.fh
            },
            stock: 0,
            busy: 0,
            lit: false
        };
        w.buildings.push(b);
        if (inside(w, b.door.x, b.door.y))
            w.doors[idx(w, b.door.x, b.door.y)] = 1;
        if (sb.type !== "field")
            for (var jj = 0; jj < d.fh; jj++)
                for (var ii = 0; ii < d.fw; ii++)
                    if (inside(w, sb.x + ii, sb.y + jj))
                        w.occ[idx(w, sb.x + ii, sb.y + jj)] = O.BUILDING;
    }
    w.people = [];
    for (i = 0; i < s.people.length; i++) {
        var sp = s.people[i];
        var p = addPerson(w, 0, 0, sp.age);
        p.id = sp.id;
        p.x = sp.x;
        p.y = sp.y;
        p.grow = sp.grow || 0;
        p.skin = sp.skin;
        p.hair = sp.hair;
        p.tone = sp.tone;
        p.home = sp.home;
        p.work = sp.work;
        p.lazy = sp.lazy;
        p.inside = !!sp.inside;
        p.st = p.inside ? "inside" : "idle";
    }
    w.nextId = Math.max(s.nextId, w.nextId);
    w.centre = s.centre;
    w.gate = s.gate;
    w.stats = Object.assign({
        renown: 0,
        seconds: 0,
        founded: 0,
        cpuWork: 0,
        netBytes: 0,
        gpuWork: 0,
        lastArrival: 0
    }, s.stats);
    w.stock = Object.assign({
        wood: 0,
        stone: 0,
        food: 0,
        goods: 0
    }, s.stock);
    w.env.snowCover = s.snow || 0;
    w.treeTarget = s.treeTarget || Math.round(w.trees.length);
    w.time = s.time || w.time;
    w.rng = mulberry(s.rng);
    landmarks(w);
}

function census(w) {
    var by = {};
    var sites = 0;
    for (var i = 0; i < w.buildings.length; i++) {
        var b = w.buildings[i];
        if (b.progress < 1)
            sites++;
        else
            by[b.type] = (by[b.type] || 0) + 1;
    }
    return {
        people: w.people.length,
        children: countWhere(w.people, function (p) {
            return p.age === "child";
        }),
        buildings: by,
        sites: sites,
        renown: w.stats.renown,
        stock: w.stock,
        beds: bedsTotal(w, true),
        trees: w.trees.length,
        rocks: w.rocks.length
    };
}

function drainEvents(w) {
    var out = w.events;
    w.events = [];
    return out;
}
