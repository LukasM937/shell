.pragma library

// Pixel art of the village, drawn in code. A sprite is a small grid of colours that is merged into a list of rectangles
// once, so the canvas only ever needs fillRect. It has no QML dependencies so scripts/village-check.js and
// scripts/village-render.js can run it headless. Colours are '#rrggbb' strings; null is transparent.
//
// Sizes are in virtual pixels, 8 to a map tile. Buildings stand on their footprint (tiles) and may reach above it.

var TILE = 8;
var OUT = "#2b2118";

// ---- colours ----------------------------------------------------------------------------------------------------

function parse(c) {
    return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}

function toHex(r, g, b) {
    var h = function (v) {
        var n = Math.max(0, Math.min(255, Math.round(v)));
        return (n < 16 ? "0" : "") + n.toString(16);
    };
    return "#" + h(r) + h(g) + h(b);
}

function mix(a, b, t) {
    var p = parse(a), q = parse(b);
    return toHex(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t);
}

// f below 1 darkens towards a warm black, above 1 lightens towards white
function shade(c, f) {
    return f < 1 ? mix(c, "#1a1410", 1 - f) : mix(c, "#ffffff", f - 1);
}

// Three tones from one colour: base, light, dark
function tones(c) {
    return [c, shade(c, 1.18), shade(c, 0.74)];
}

var WALL = {
    wood: tones("#b8814a"),
    pale: tones("#e4d4b0"),
    stone: tones("#a39f98"),
    dark: tones("#7a5a3c"),
    white: tones("#efe6d2")
};

var ROOF = {
    red: tones("#b84c3b"),
    brown: tones("#82533a"),
    slate: tones("#5a6f94"),
    thatch: tones("#d0aa5e"),
    green: tones("#58a08a"),
    ochre: tones("#c7863c"),
    plum: tones("#8a4f7a")
};

var SKIN = ["#f2c9a5", "#e0a97c", "#b57f58", "#7d5236"];
var HAIR = ["#3b2a1a", "#6e4a2a", "#c8a03a", "#b04a2a", "#d8d8d8", "#20201e"];
var CLOTHES = {
    farmer: "#5d9a4a",
    woodcutter: "#b4413a",
    miner: "#7a7f88",
    builder: "#e0902f",
    merchant: "#7a4fb0",
    baker: "#f1ece0",
    fisher: "#3f7fb4",
    guard: "#4a5f9a",
    priest: "#efe8d6",
    mage: "#3a4fb5",
    bard: "#c24a7a",
    smith: "#6a5a52",
    shepherd: "#8a7a4a",
    child: "#e0b83a",
    villager: "#a65a8a"
};

// ---- pixel grids ------------------------------------------------------------------------------------------------

function make(w, h) {
    var p = [];
    for (var i = 0; i < w * h; i++)
        p.push(null);
    return {
        w: w,
        h: h,
        p: p
    };
}

function put(s, x, y, c) {
    if (x >= 0 && y >= 0 && x < s.w && y < s.h)
        s.p[y * s.w + x] = c;
}

function get(s, x, y) {
    return x >= 0 && y >= 0 && x < s.w && y < s.h ? s.p[y * s.w + x] : null;
}

function rect(s, x, y, w, h, c) {
    for (var j = 0; j < h; j++)
        for (var i = 0; i < w; i++)
            put(s, x + i, y + j, c);
}

function hline(s, x, y, w, c) {
    rect(s, x, y, w, 1, c);
}

function vline(s, x, y, h, c) {
    rect(s, x, y, 1, h, c);
}

function ellipse(s, cx, cy, rx, ry, c) {
    for (var j = Math.floor(cy - ry); j <= Math.ceil(cy + ry); j++)
        for (var i = Math.floor(cx - rx); i <= Math.ceil(cx + rx); i++) {
            var dx = (i - cx) / (rx + 0.4), dy = (j - cy) / (ry + 0.4);
            if (dx * dx + dy * dy <= 1)
                put(s, i, j, c);
        }
}

// Paints c on cells that hold a colour, through fn(x, y, old) -> colour or null to keep it
function paint(s, fn) {
    for (var j = 0; j < s.h; j++)
        for (var i = 0; i < s.w; i++) {
            var old = s.p[j * s.w + i];
            if (old) {
                var n = fn(i, j, old);
                if (n)
                    s.p[j * s.w + i] = n;
            }
        }
}

// A one pixel rim around the shape, in a darker version of the colour it touches, so shapes keep their edge on any ground.
// The sprite must be one pixel larger than the shape on every side.
function rim(s, f) {
    var add = [];
    for (var j = 0; j < s.h; j++)
        for (var i = 0; i < s.w; i++) {
            if (s.p[j * s.w + i])
                continue;
            var n = get(s, i, j + 1) || get(s, i - 1, j) || get(s, i + 1, j) || get(s, i, j - 1);
            if (n)
                add.push([i, j, shade(n, f)]);
        }
    for (var k = 0; k < add.length; k++)
        put(s, add[k][0], add[k][1], add[k][2]);
}

function copy(dst, src, x, y) {
    for (var j = 0; j < src.h; j++)
        for (var i = 0; i < src.w; i++) {
            var c = src.p[j * src.w + i];
            if (c)
                put(dst, x + i, y + j, c);
        }
}

// Cheap, repeatable noise for texture: the same cell always gives the same value in 0..1
function hash(x, y, z) {
    var h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul((z | 0) + 1, 2147483647)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// While a library for a snowy winter is built, every sprite gets a cap of snow on its upward edges
var snowMode = false;

// Merges the grid into rectangles, sorted by colour so a canvas changes its fill style as seldom as it can
function toSprite(s, extra) {
    if (snowMode && !(extra && extra.noSnow))
        snowCap(s, 2);
    var rects = [];
    var open = {};
    for (var j = 0; j < s.h; j++) {
        var next = {};
        var i = 0;
        while (i < s.w) {
            var c = s.p[j * s.w + i];
            if (!c) {
                i++;
                continue;
            }
            var k = i;
            while (k < s.w && s.p[j * s.w + k] === c)
                k++;
            var key = i + "," + (k - i) + "," + c;
            var r = open[key];
            if (r) {
                r.h++;
                next[key] = r;
            } else {
                r = {
                    x: i,
                    y: j,
                    w: k - i,
                    h: 1,
                    c: c
                };
                rects.push(r);
                next[key] = r;
            }
            i = k;
        }
        open = next;
    }
    rects.sort(function (a, b) {
        return a.c < b.c ? -1 : a.c > b.c ? 1 : 0;
    });
    var out = {
        w: s.w,
        h: s.h,
        r: rects
    };
    if (extra)
        for (var key2 in extra)
            out[key2] = extra[key2];
    return out;
}

// Draws a sprite with its top left corner at x, y. Rows above cut (from the sprite's top) are left out, which is how a
// building rises while it is built
function blit(ctx, spr, x, y, cut) {
    var last = "";
    var from = cut || 0;
    for (var i = 0; i < spr.r.length; i++) {
        var r = spr.r[i];
        var top = r.y, h = r.h;
        if (top + h <= from)
            continue;
        if (top < from) {
            h -= from - top;
            top = from;
        }
        if (r.c !== last) {
            ctx.fillStyle = r.c;
            last = r.c;
        }
        ctx.fillRect(x + r.x, y + top, r.w, h);
    }
}

// The same, mirrored, for things that move to the left
function blitFlipped(ctx, spr, x, y) {
    var last = "";
    for (var i = 0; i < spr.r.length; i++) {
        var r = spr.r[i];
        if (r.c !== last) {
            ctx.fillStyle = r.c;
            last = r.c;
        }
        ctx.fillRect(x + spr.w - r.x - r.w, y + r.y, r.w, r.h);
    }
}

// ---- buildings --------------------------------------------------------------------------------------------------

// A cottage seen from the front. w and h are the sprite's size without the chimney's headroom; the walls take the lower part
//   wall, roof: tones() arrays; style: "gable" (triangle front) or "band" (long house, roof seen from the side)
//   door: x of the door's left edge, or -1 for none; windows: x positions of 3 px windows; chimney: x or null
function cottage(o) {
    var w = o.w;
    var head = o.chimney !== undefined && o.chimney !== null && o.style === "band" ? 3 : 0;
    var h = o.h + head;
    var s = make(w, h);
    var wall = o.wall, roof = o.roof;
    var roofH = o.roofH;
    var top = head;
    var wallTop = top + roofH - 1;
    var over = 1;
    var seed = o.seed || 0;

    // walls
    var wl = over, wr = w - over;
    rect(s, wl, wallTop, wr - wl, h - wallTop, wall[0]);
    if (o.timber) {
        // beams in dark wood over plaster
        for (var i = wl; i < wr; i += 6)
            vline(s, i, wallTop, h - wallTop, WALL.dark[0]);
        vline(s, wr - 1, wallTop, h - wallTop, WALL.dark[0]);
        hline(s, wl, wallTop + 3, wr - wl, WALL.dark[0]);
    } else if (wall === WALL.wood || wall === WALL.dark) {
        // boards
        for (var xx = wl + 3; xx < wr - 1; xx += 4)
            vline(s, xx, wallTop + 2, h - wallTop - 4, wall[2]);
    } else {
        for (var sx = wl + 1; sx < wr - 1; sx++)
            for (var sy = wallTop + 2; sy < h - 3; sy++)
                if (hash(sx, sy, seed + 3) < 0.08)
                    put(s, sx, sy, hash(sy, sx, 9) < 0.5 ? wall[1] : wall[2]);
    }
    vline(s, wl, wallTop, h - wallTop, wall[1]);
    vline(s, wr - 1, wallTop, h - wallTop, o.timber ? WALL.dark[0] : wall[2]);
    // stone foundation
    hline(s, wl, h - 2, wr - wl, WALL.stone[0]);
    hline(s, wl, h - 1, wr - wl, WALL.stone[2]);

    // roof, with shingles in a checker of two shades
    var alt = mix(roof[0], roof[2], 0.3);
    if (o.style === "band") {
        for (var r = 0; r < roofH; r++) {
            var inset = r < 2 ? 2 - r : 0;
            for (var x = inset; x < w - inset; x++)
                put(s, x, top + r, (x + r) % 2 === 0 ? roof[0] : alt);
            put(s, inset, top + r, roof[1]);
            put(s, w - inset - 1, top + r, roof[2]);
        }
        hline(s, 2, top, w - 4, roof[1]);
        hline(s, 0, top + roofH - 1, w, roof[2]);
    } else {
        for (var r2 = 0; r2 < roofH; r2++) {
            var half = Math.min(Math.floor(w / 2), 1 + r2 * 2 + (r2 === roofH - 1 ? 1 : 0));
            var left = Math.floor(w / 2) - half, width = half * 2 + (w % 2);
            for (var x2 = left; x2 < left + width; x2++)
                put(s, x2, top + r2, (x2 + r2) % 2 === 0 ? roof[0] : alt);
            put(s, left, top + r2, roof[1]);
            put(s, left + width - 1, top + r2, roof[2]);
        }
        hline(s, Math.floor(w / 2) - 1, top, 2 + (w % 2), roof[1]);
        hline(s, 0, top + roofH - 1, w, roof[2]);
    }
    // the eaves throw a shadow on the wall
    hline(s, wl, wallTop + 1, wr - wl, shade(wall[0], 0.78));

    // chimney, over the roof so it stands out of it
    var chimney = null;
    if (o.chimney !== undefined && o.chimney !== null) {
        var cx = o.chimney;
        var cy = 0;
        if (o.style === "gable") {
            var d = Math.abs(cx + 1 - Math.floor(w / 2));
            cy = Math.max(0, Math.ceil((d - 1) / 2) - 3);
        }
        var bodyH = o.style === "gable" ? 5 : 5;
        rect(s, cx, cy + 1, 3, bodyH, "#8a4a3a");
        vline(s, cx + 2, cy + 1, bodyH, "#6a382c");
        hline(s, cx, cy + 3, 3, "#a85a48");
        hline(s, cx - 1, cy, 5, WALL.stone[1]);
        hline(s, cx - 1, cy + 1, 1, WALL.stone[2]);
        hline(s, cx + 3, cy + 1, 1, WALL.stone[2]);
        chimney = {
            x: cx + 1,
            y: cy
        };
    }

    // door
    var doorW = 3, doorH = Math.min(6, h - wallTop - 3);
    var dx = o.door === undefined ? Math.floor((w - doorW) / 2) : o.door;
    var door = null;
    if (dx >= 0) {
        rect(s, dx, h - 2 - doorH, doorW, doorH, "#5a3b22");
        vline(s, dx, h - 2 - doorH, doorH, "#6a4a30");
        put(s, dx + doorW - 1, h - 2 - Math.floor(doorH / 2), "#e0c060");
        hline(s, dx - 1, h - 3 - doorH, doorW + 2, shade(wall[2], 0.8));
        door = {
            x: dx + 1,
            y: h - 1
        };
    }
    // windows
    var windows = [];
    var wy = wallTop + 4;
    var winList = o.windows || [];
    for (var k = 0; k < winList.length; k++) {
        var wx = winList[k];
        rect(s, wx - 1, wy - 1, 5, 5, shade(wall[2], 0.7));
        rect(s, wx, wy, 3, 3, "#8fd0e6");
        put(s, wx, wy, "#d6f0f8");
        put(s, wx + 2, wy + 2, "#6ab0cc");
        vline(s, wx + 1, wy, 3, "#6a4a30");
        windows.push({
            x: wx,
            y: wy,
            w: 3,
            h: 3
        });
    }
    rim(s, 0.45);
    return toSprite(s, {
        door: door,
        windows: windows,
        chimney: chimney
    });
}

// Sprites are one pixel wider than they look on each side, for the rim: this adds the room
function padded(w, h, draw) {
    var s = make(w + 2, h + 2);
    var inner = draw();
    copy(s, inner, 1, 1);
    return s;
}

function snowCap(s, depth) {
    // whitens the top rows of every upward facing edge: used on roofs in winter
    for (var j = 0; j < s.h; j++)
        for (var i = 0; i < s.w; i++) {
            var c = s.p[j * s.w + i];
            if (!c)
                continue;
            var above = get(s, i, j - 1);
            if (!above || (j > 0 && above === null)) {
                put(s, i, j, "#f4f8fb");
                for (var d = 1; d < depth; d++)
                    if (get(s, i, j + d) && hash(i, j + d, 5) < 0.7)
                        put(s, i, j + d, d === 1 ? "#e3edf4" : "#f4f8fb");
            }
        }
}

// ---- the building types -----------------------------------------------------------------------------------------

// footprint: tiles wide and deep; door: tile offset (inside the footprint) a villager steps to, y one tile below
var TYPES = {};

function defType(id, fw, fh, build) {
    TYPES[id] = {
        id: id,
        fw: fw,
        fh: fh,
        build: build
    };
}

function mk(draw, w, h) {
    var s = make(w, h);
    draw(s);
    return s;
}

defType("tent", 2, 1, function (o) {
    var s = make(18, 12);
    var cloth = o.cloth || "#e6d8b8";
    var stripe = o.stripe || "#c0503c";
    for (var r = 0; r < 9; r++) {
        var half = 1 + r;
        hline(s, 8 - half, 1 + r, half * 2, r % 3 === 2 ? stripe : cloth);
        put(s, 8 - half, 1 + r, shade(cloth, 0.8));
        put(s, 8 + half - 1, 1 + r, shade(cloth, 0.62));
    }
    // opening
    for (var r2 = 0; r2 < 6; r2++)
        hline(s, 8 - Math.floor(r2 / 2) - 1, 4 + r2, Math.floor(r2 / 2) * 2 + 2, "#3a2a20");
    hline(s, 7, 10, 2, "#3a2a20");
    vline(s, 8, 0, 2, "#6a4a2c");
    put(s, 9, 0, "#c0503c");
    put(s, 10, 1, "#c0503c");
    rim(s, 0.5);
    return toSprite(s, {
        door: {
            x: 8,
            y: 11
        },
        windows: [],
        chimney: null
    });
});

defType("hut", 2, 2, function (o) {
    return cottage({
        w: 20,
        h: 19,
        roofH: 8,
        wall: WALL.wood,
        roof: o.roof || ROOF.thatch,
        door: 8,
        windows: [3, 14],
        chimney: o.chimney === false ? null : 13,
        style: "gable",
        seed: o.seed
    });
});

defType("house", 2, 2, function (o) {
    return cottage({
        w: 20,
        h: 20,
        roofH: 8,
        wall: o.wall || WALL.pale,
        roof: o.roof || ROOF.red,
        door: 8,
        windows: [3, 14],
        chimney: 13,
        style: "gable",
        timber: o.timber,
        seed: o.seed
    });
});

defType("longhouse", 3, 2, function (o) {
    return cottage({
        w: 28,
        h: 20,
        roofH: 8,
        wall: o.wall || WALL.wood,
        roof: o.roof || ROOF.brown,
        door: 12,
        windows: [4, 8, 17, 21],
        chimney: 20,
        style: "band",
        timber: o.timber,
        seed: o.seed
    });
});

defType("manor", 3, 3, function (o) {
    var h = cottage({
        w: 28,
        h: 28,
        roofH: 10,
        wall: o.wall || WALL.pale,
        roof: o.roof || ROOF.slate,
        door: 12,
        windows: [4, 10, 17, 22],
        chimney: 20,
        style: "band",
        timber: true,
        seed: o.seed
    });
    return h;
});

function farmBarn(o) {
    var w = 28, h = 22;
    var s = make(w, h);
    var wall = WALL.dark, roof = o.roof || ROOF.red;
    // barn: wide gable
    rect(s, 2, 8, 24, 14, "#a8483a");
    for (var i = 2; i < 26; i += 4)
        vline(s, i, 8, 14, "#8c3a2e");
    for (var r = 0; r < 8; r++) {
        var half = Math.min(14, 4 + r * 2);
        hline(s, 14 - half, r, half * 2, r % 2 === 0 ? roof[0] : mix(roof[0], roof[2], 0.4));
        put(s, 14 - half, r, roof[1]);
        put(s, 14 + half - 1, r, roof[2]);
    }
    hline(s, 12, 0, 4, roof[1]);
    // big door with cross beams
    rect(s, 10, 12, 8, 9, "#d8c9a0");
    vline(s, 14, 12, 9, "#7a5a3c");
    for (var d = 0; d < 4; d++) {
        put(s, 10 + d * 2, 12 + d * 2, "#7a5a3c");
        put(s, 17 - d * 2, 12 + d * 2, "#7a5a3c");
    }
    rect(s, 9, 12, 1, 9, "#7a5a3c");
    rect(s, 18, 12, 1, 9, "#7a5a3c");
    hline(s, 9, 11, 10, "#7a5a3c");
    hline(s, 2, 20, 24, WALL.stone[0]);
    hline(s, 2, 21, 24, WALL.stone[2]);
    rim(s, 0.45);
    return toSprite(s, {
        door: {
            x: 14,
            y: 21
        },
        windows: [],
        chimney: null
    });
}

defType("barn", 3, 2, farmBarn);

defType("farmhouse", 2, 2, function (o) {
    return cottage({
        w: 20,
        h: 20,
        roofH: 8,
        wall: WALL.white,
        roof: ROOF.ochre,
        door: 8,
        windows: [3, 14],
        chimney: 13,
        style: "gable",
        timber: true,
        seed: o.seed
    });
});

defType("well", 1, 1, function (o) {
    var s = make(12, 14);
    rect(s, 2, 8, 8, 5, WALL.stone[0]);
    hline(s, 2, 8, 8, WALL.stone[1]);
    hline(s, 2, 12, 8, WALL.stone[2]);
    for (var i = 3; i < 9; i += 2)
        put(s, i, 10, WALL.stone[2]);
    rect(s, 4, 9, 4, 2, "#2d6e98");
    vline(s, 2, 2, 7, "#6b4a2c");
    vline(s, 9, 2, 7, "#6b4a2c");
    for (var r = 0; r < 3; r++)
        hline(s, 1 + r, 1 - 0 + r * 0 + (r === 0 ? 0 : 0), 10 - r * 2, ROOF.red[r % 2]);
    hline(s, 1, 2, 10, ROOF.red[2]);
    vline(s, 6, 3, 4, "#c8b890");
    rect(s, 5, 6, 2, 2, "#8a6a3c");
    rim(s, 0.5);
    return toSprite(s, {
        door: {
            x: 6,
            y: 13
        },
        windows: [],
        chimney: null
    });
});

defType("market", 4, 2, function (o) {
    var s = make(36, 20);
    var cols = ["#d9553f", "#f0e4c8"];
    for (var st = 0; st < 3; st++) {
        var x0 = 1 + st * 11;
        // awning
        for (var r = 0; r < 5; r++)
            for (var i = 0; i < 10; i++)
                put(s, x0 + i, 2 + r, (i + (r > 3 ? 1 : 0)) % 2 === 0 ? cols[st % 2] : cols[(st + 1) % 2]);
        hline(s, x0, 7, 10, shade(cols[st % 2], 0.7));
        // poles, counter and wares
        vline(s, x0, 7, 9, "#6b4a2c");
        vline(s, x0 + 9, 7, 9, "#6b4a2c");
        rect(s, x0 + 1, 12, 8, 4, "#b8814a");
        hline(s, x0 + 1, 12, 8, "#d8a066");
        var ware = ["#d9553f", "#e8c63a", "#7ab648", "#e69a3a", "#c98a5a"];
        for (var k = 0; k < 4; k++)
            rect(s, x0 + 2 + k * 2, 10, 2, 2, ware[(k + st * 2) % ware.length]);
    }
    rim(s, 0.5);
    return toSprite(s, {
        door: {
            x: 17,
            y: 19
        },
        windows: [],
        chimney: null
    });
});

defType("tavern", 3, 3, function (o) {
    var s = cottage({
        w: 28,
        h: 28,
        roofH: 10,
        wall: WALL.wood,
        roof: ROOF.brown,
        door: 12,
        windows: [4, 8, 17, 22],
        chimney: 21,
        style: "band",
        timber: true,
        seed: o.seed
    });
    return s;
});

defType("church", 3, 4, function (o) {
    var s = make(30, 40);
    var wall = WALL.stone, roof = ROOF.slate;
    // tower
    rect(s, 10, 12, 10, 26, wall[0]);
    for (var y = 14; y < 38; y += 3)
        hline(s, 10, y, 10, wall[2]);
    vline(s, 10, 12, 26, wall[1]);
    vline(s, 19, 12, 26, wall[2]);
    for (var r = 0; r < 9; r++)
        hline(s, 15 - Math.min(6, 1 + r), 3 + r, Math.min(6, 1 + r) * 2, r % 2 === 0 ? roof[0] : roof[2]);
    vline(s, 15, 0, 4, "#e8d27a");
    hline(s, 14, 1, 3, "#e8d27a");
    // belfry opening
    rect(s, 13, 14, 4, 5, "#2a2a30");
    put(s, 14, 16, "#e8d27a");
    // nave
    rect(s, 2, 26, 26, 12, WALL.pale[0]);
    hline(s, 2, 26, 26, WALL.pale[1]);
    for (var r2 = 0; r2 < 7; r2++)
        hline(s, 2 + Math.min(r2, 2), 22 + r2, 26 - Math.min(r2, 2) * 2, r2 % 2 === 0 ? roof[0] : mix(roof[0], roof[2], 0.4));
    hline(s, 2, 36, 26, WALL.stone[0]);
    hline(s, 2, 37, 26, WALL.stone[2]);
    // windows and door
    rect(s, 12, 30, 6, 8, "#5a3b22");
    rect(s, 13, 31, 4, 7, "#3a2a20");
    for (var wxx = 0; wxx < 2; wxx++) {
        rect(s, 5 + wxx * 17, 29, 3, 5, "#6aa0d8");
        put(s, 6 + wxx * 17, 31, "#e8d27a");
    }
    rim(s, 0.45);
    return toSprite(s, {
        door: {
            x: 15,
            y: 39
        },
        windows: [
            {
                x: 5,
                y: 29,
                w: 3,
                h: 5
            },
            {
                x: 22,
                y: 29,
                w: 3,
                h: 5
            },
            {
                x: 14,
                y: 16,
                w: 2,
                h: 3
            }
        ],
        chimney: null
    });
});

defType("smithy", 2, 2, function (o) {
    var s = cottage({
        w: 20,
        h: 20,
        roofH: 8,
        wall: WALL.stone,
        roof: ROOF.slate,
        door: 3,
        windows: [],
        chimney: 13,
        style: "gable",
        seed: o.seed
    });
    return s;
});

defType("bakery", 2, 2, function (o) {
    return cottage({
        w: 20,
        h: 20,
        roofH: 8,
        wall: WALL.white,
        roof: ROOF.plum,
        door: 3,
        windows: [12],
        chimney: 13,
        style: "gable",
        timber: true,
        seed: o.seed
    });
});

defType("windmill", 2, 3, function (o) {
    var s = make(20, 30);
    // tapered stone body
    for (var y = 8; y < 29; y++) {
        var t = (y - 8) / 20;
        var half = Math.round(4 + t * 3);
        hline(s, 10 - half, y, half * 2, y % 3 === 0 ? WALL.pale[2] : WALL.pale[0]);
        put(s, 10 - half, y, WALL.pale[1]);
        put(s, 10 + half - 1, y, WALL.pale[2]);
    }
    for (var r = 0; r < 5; r++)
        hline(s, 10 - (2 + r), 4 + r, (2 + r) * 2, r % 2 === 0 ? ROOF.brown[0] : ROOF.brown[2]);
    hline(s, 8, 3, 4, ROOF.brown[1]);
    rect(s, 8, 23, 4, 6, "#5a3b22");
    rect(s, 9, 14, 2, 3, "#8fd0e6");
    rim(s, 0.45);
    return toSprite(s, {
        door: {
            x: 10,
            y: 29
        },
        windows: [
            {
                x: 9,
                y: 14,
                w: 2,
                h: 3
            }
        ],
        chimney: null,
        hub: {
            x: 10,
            y: 8
        }
    });
});

defType("tower", 2, 2, function (o) {
    var s = make(18, 36);
    rect(s, 3, 10, 12, 25, WALL.stone[0]);
    for (var y = 12; y < 35; y += 3)
        hline(s, 3, y, 12, WALL.stone[2]);
    vline(s, 3, 10, 25, WALL.stone[1]);
    vline(s, 14, 10, 25, WALL.stone[2]);
    for (var i = 2; i < 16; i += 3)
        rect(s, i, 7, 2, 3, WALL.stone[0]);
    hline(s, 2, 9, 14, WALL.stone[1]);
    rect(s, 8, 29, 3, 6, "#5a3b22");
    rect(s, 8, 16, 2, 4, "#2a2a30");
    vline(s, 9, 0, 8, "#6b4a2c");
    rect(s, 10, 1, 5, 3, "#4a5f9a");
    rim(s, 0.45);
    return toSprite(s, {
        door: {
            x: 9,
            y: 35
        },
        windows: [
            {
                x: 8,
                y: 16,
                w: 2,
                h: 4
            }
        ],
        chimney: null
    });
});

defType("magetower", 2, 2, function (o) {
    var s = make(18, 44);
    // slim tower with a pointed hat, a glowing crystal on top
    rect(s, 5, 16, 8, 27, "#6a6aa8");
    for (var y = 18; y < 43; y += 3)
        hline(s, 5, y, 8, "#55558c");
    vline(s, 5, 16, 27, "#8888c8");
    vline(s, 12, 16, 27, "#4a4a7a");
    for (var r = 0; r < 13; r++)
        hline(s, 9 - Math.min(6, 1 + Math.floor(r * 0.6) + 0), 6 + r, Math.min(7, 1 + Math.floor(r * 0.6)) * 2, r % 2 === 0 ? "#3a3a9a" : "#2c2c78");
    hline(s, 2, 18, 14, "#3a3a9a");
    rect(s, 8, 36, 3, 7, "#4a3a2a");
    rect(s, 8, 24, 2, 4, "#ffe08a");
    rect(s, 7, 4, 4, 4, "#9ad8ff");
    put(s, 8, 5, "#ffffff");
    rim(s, 0.45);
    return toSprite(s, {
        door: {
            x: 9,
            y: 43
        },
        windows: [
            {
                x: 8,
                y: 24,
                w: 2,
                h: 4
            }
        ],
        chimney: null,
        crystal: {
            x: 9,
            y: 6
        }
    });
});

defType("townhall", 4, 3, function (o) {
    var s = make(38, 34);
    var wall = WALL.pale, roof = ROOF.red;
    rect(s, 2, 12, 34, 20, wall[0]);
    for (var i = 2; i < 36; i += 6)
        vline(s, i, 12, 20, WALL.dark[0]);
    hline(s, 2, 22, 34, WALL.dark[0]);
    for (var r = 0; r < 9; r++) {
        var inset = r < 3 ? 3 - r : 0;
        hline(s, 1 + inset, 8 + r - 0 - 0 + 0 - 0 - 0 + 0, 36 - inset * 2, r % 3 === 0 ? roof[1] : r % 3 === 1 ? roof[0] : roof[2]);
    }
    // clock gable
    for (var g = 0; g < 8; g++)
        hline(s, 19 - Math.min(5, 1 + g), g + 1, Math.min(5, 1 + g) * 2, g % 2 === 0 ? roof[0] : roof[2]);
    rect(s, 16, 8, 6, 6, "#efe6d2");
    put(s, 19, 9, "#2b2118");
    put(s, 19, 10, "#2b2118");
    put(s, 20, 11, "#2b2118");
    rect(s, 16, 25, 6, 7, "#5a3b22");
    for (var wxx = 0; wxx < 4; wxx++)
        if (wxx !== 1 && wxx !== 2) {
            rect(s, 4 + wxx * 9 - (wxx > 1 ? 0 : 0), 24, 3, 4, "#8fd0e6");
            rect(s, 4 + wxx * 9 - (wxx > 1 ? 0 : 0), 16, 3, 4, "#8fd0e6");
        }
    rect(s, 12, 16, 3, 4, "#8fd0e6");
    rect(s, 23, 16, 3, 4, "#8fd0e6");
    hline(s, 2, 31, 34, WALL.stone[0]);
    rim(s, 0.45);
    return toSprite(s, {
        door: {
            x: 19,
            y: 33
        },
        windows: [
            {
                x: 4,
                y: 24,
                w: 3,
                h: 4
            },
            {
                x: 31,
                y: 24,
                w: 3,
                h: 4
            },
            {
                x: 12,
                y: 16,
                w: 3,
                h: 4
            },
            {
                x: 23,
                y: 16,
                w: 3,
                h: 4
            }
        ],
        chimney: null
    });
});

defType("library", 3, 3, function (o) {
    return cottage({
        w: 28,
        h: 26,
        roofH: 9,
        wall: WALL.stone,
        roof: ROOF.green,
        door: 12,
        windows: [4, 9, 17, 22],
        chimney: null,
        style: "band",
        seed: o.seed
    });
});

defType("lighthouse", 1, 3, function (o) {
    var s = make(12, 34);
    for (var y = 8; y < 33; y++) {
        var half = Math.round(3 + (y - 8) / 25 * 2);
        for (var i = 6 - half; i < 6 + half; i++)
            put(s, i, y, Math.floor((y - 8) / 4) % 2 === 0 ? "#e8e4da" : "#c0453a");
        put(s, 6 - half, y, "#ffffff");
        put(s, 6 + half - 1, y, "#9a9a9a");
    }
    rect(s, 2, 6, 8, 2, "#4a4a52");
    rect(s, 3, 3, 6, 3, "#ffe9a0");
    for (var r = 0; r < 3; r++)
        hline(s, 6 - 1 - r, r, 2 + r * 2, "#4a4a52");
    rect(s, 5, 27, 2, 5, "#5a3b22");
    rim(s, 0.45);
    return toSprite(s, {
        door: {
            x: 6,
            y: 33
        },
        windows: [],
        chimney: null,
        beacon: {
            x: 6,
            y: 4
        }
    });
});

defType("dock", 2, 1, function (o) {
    var s = make(18, 8);
    rect(s, 0, 2, 18, 4, "#a8794a");
    for (var i = 0; i < 18; i += 3)
        vline(s, i, 2, 4, "#8a5f38");
    hline(s, 0, 2, 18, "#c99a62");
    for (var p = 1; p < 18; p += 8) {
        vline(s, p, 0, 8, "#5a3b22");
    }
    rim(s, 0.5);
    return toSprite(s, {
        door: {
            x: 2,
            y: 7
        },
        windows: [],
        chimney: null
    });
});

defType("woodhut", 2, 2, function (o) {
    return cottage({
        w: 20,
        h: 19,
        roofH: 8,
        wall: WALL.dark,
        roof: ROOF.brown,
        door: 3,
        windows: [12],
        chimney: null,
        style: "gable",
        seed: o.seed
    });
});

defType("quarry", 2, 2, function (o) {
    var s = make(18, 14);
    // a lean-to over a heap of cut stone
    rect(s, 1, 5, 2, 8, "#6b4a2c");
    rect(s, 14, 5, 2, 8, "#6b4a2c");
    for (var r = 0; r < 4; r++)
        hline(s, 0, r, 18, r % 2 === 0 ? ROOF.brown[0] : ROOF.brown[2]);
    rect(s, 4, 8, 4, 4, WALL.stone[0]);
    rect(s, 8, 9, 5, 3, WALL.stone[1]);
    rect(s, 6, 6, 3, 2, WALL.stone[2]);
    hline(s, 4, 12, 9, WALL.stone[2]);
    rim(s, 0.5);
    return toSprite(s, {
        door: {
            x: 9,
            y: 13
        },
        windows: [],
        chimney: null
    });
});

defType("storehouse", 2, 2, function (o) {
    return cottage({
        w: 20,
        h: 19,
        roofH: 7,
        wall: WALL.dark,
        roof: ROOF.ochre,
        door: 7,
        windows: [],
        chimney: null,
        style: "band",
        timber: true,
        seed: o.seed
    });
});

// Everything that can be built, and what people think of it, in one place: footprint, size of the sprite
function footprint(id) {
    var t = TYPES[id];
    return t ? [t.fw, t.fh] : [1, 1];
}

// ---- nature -----------------------------------------------------------------------------------------------------

// Foliage by season: dark, mid, light, and an accent that spring and autumn add
function foliage(season) {
    switch (season) {
    case "spring":
        return ["#3a8a48", "#58a85a", "#86c870", "#f2c6da"];
    case "autumn":
        return ["#a8501c", "#d27d20", "#e8b13c", "#c0402a"];
    case "winter":
        return ["#4a3a2c", "#5a4838", "#6a5848", "#f4f8fb"];
    }
    return ["#2e6b3a", "#3f8a45", "#63a85a", "#8fcf6a"];
}

// kinds: oak (broad), pine, birch, sapling, bush. size 0 young, 1 grown, 2 old
function tree(kind, season, size, snowy, seed) {
    var f = foliage(season);
    var bare = season === "winter" && kind !== "pine";
    var w, h, s;
    if (kind === "sapling") {
        s = make(9, 11);
        vline(s, 4, 6, 4, "#6b4a2c");
        if (bare) {
            put(s, 3, 5, "#5a4838");
            put(s, 5, 4, "#5a4838");
        } else {
            ellipse(s, 4, 4, 2.2, 2.2, f[1]);
            put(s, 3, 3, f[2]);
            put(s, 4, 3, f[2]);
        }
        rim(s, 0.55);
        return toSprite(s, {
            ax: 4,
            ay: 10
        });
    }
    if (kind === "bush") {
        s = make(10, 8);
        ellipse(s, 5, 4, 3.6, 2.6, f[0]);
        ellipse(s, 4, 3, 2.6, 1.8, f[1]);
        put(s, 3, 2, f[2]);
        put(s, 4, 2, f[2]);
        if (season !== "winter")
            for (var b = 0; b < 4; b++)
                put(s, 2 + Math.floor(hash(b, seed || 1, 9) * 6), 2 + Math.floor(hash(b, seed || 1, 5) * 4), "#d6334a");
        else
            hline(s, 2, 2, 6, "#f4f8fb");
        rim(s, 0.55);
        return toSprite(s, {
            ax: 5,
            ay: 7
        });
    }
    if (kind === "pine") {
        w = size === 0 ? 9 : 13;
        h = size === 0 ? 13 : size === 1 ? 19 : 22;
        s = make(w, h);
        var cx = Math.floor(w / 2);
        var tiers = size === 0 ? 3 : 4;
        var tierH = Math.floor((h - 5) / tiers) + 2;
        vline(s, cx, h - 5, 4, "#5a3b22");
        var pineCols = season === "winter" ? ["#1f5a3a", "#2c7447", "#3d8f58"] : ["#1f5a3a", "#2c7447", "#3d8f58"];
        for (var t = tiers - 1; t >= 0; t--) {
            var top = 1 + Math.floor(t * (h - 6) / tiers);
            var width = 1 + Math.floor((t + 1) * (w - 1) / (tiers * 2));
            for (var r = 0; r < tierH; r++) {
                var half = Math.min(Math.floor(w / 2), Math.floor(width / 2) + Math.floor(r * 0.9));
                var yy = top + r;
                var colr = r % 2 === 0 ? pineCols[1] : pineCols[0];
                hline(s, cx - half, yy, half * 2 + 1, colr);
                put(s, cx - half, yy, pineCols[0]);
                put(s, cx - half + 1, yy, pineCols[2]);
            }
        }
        if (snowy || season === "winter")
            snowCap(s, 2);
        rim(s, 0.5);
        return toSprite(s, {
            ax: cx,
            ay: h - 1
        });
    }
    if (kind === "birch") {
        w = 11;
        h = size === 0 ? 13 : 17;
        s = make(w, h);
        vline(s, 5, h - 8, 7, "#e8e4da");
        for (var m = 0; m < 3; m++)
            put(s, 5, h - 7 + m * 2, "#3a3a3a");
        if (!bare) {
            var bl = season === "autumn" ? ["#d8a830", "#ecc850"] : ["#8cc650", "#b4e070"];
            ellipse(s, 5, 5, 4.2, 4.6, bl[0]);
            ellipse(s, 4, 4, 2.8, 3, bl[1]);
            for (var bd = 0; bd < 5; bd++)
                put(s, 3 + Math.floor(hash(bd, seed || 2, 31) * 6), 3 + Math.floor(hash(bd, seed || 2, 32) * 5), "#5a9a3a");
        } else {
            vline(s, 4, 3, 5, "#6a5a4a");
            vline(s, 6, 4, 4, "#6a5a4a");
            vline(s, 5, 1, 7, "#6a5a4a");
        }
        if (snowy || season === "winter")
            snowCap(s, 2);
        rim(s, 0.55);
        return toSprite(s, {
            ax: 5,
            ay: h - 1
        });
    }
    // oak
    w = size === 0 ? 11 : size === 1 ? 15 : 17;
    h = size === 0 ? 14 : size === 1 ? 19 : 21;
    s = make(w, h);
    var mid = Math.floor(w / 2);
    var trunkH = size === 0 ? 5 : 7;
    rect(s, mid - 1, h - trunkH - 1, size === 2 ? 3 : 2, trunkH, "#6b4a2c");
    vline(s, mid - 1, h - trunkH - 1, trunkH, "#8a6038");
    hline(s, mid - 2, h - 2, 5, "#553a22");
    if (bare) {
        // bare branches
        vline(s, mid, 2, h - trunkH - 2, "#5a4838");
        for (var br = 0; br < 4; br++) {
            put(s, mid - 1 - br, 4 + br, "#5a4838");
            put(s, mid + 1 + br, 5 + br, "#5a4838");
            put(s, mid - 2 - br, 3 + br * 2, "#5a4838");
        }
        if (snowy)
            for (var sb = 0; sb < 5; sb++)
                put(s, mid - 4 + sb * 2, 4 + (sb % 3), "#f4f8fb");
    } else {
        var rad = size === 0 ? 4.6 : size === 1 ? 6.2 : 7.4;
        var cy = Math.floor(rad) + 1;
        ellipse(s, mid, cy + 1, rad, rad * 0.92, f[0]);
        ellipse(s, mid - 1, cy, rad - 1.2, rad * 0.86 - 1, f[1]);
        ellipse(s, mid - 2, cy - 1, rad * 0.52, rad * 0.46, f[2]);
        // leaf texture: dither on the shaded side, highlights on the lit one
        for (var q = 0; q < Math.floor(rad * rad * 0.5); q++) {
            var px = Math.floor(hash(q, seed || 3, 11) * w), py = Math.floor(hash(q, seed || 3, 12) * (cy * 2));
            var cur = get(s, px, py);
            if (cur === f[1] && px > mid)
                put(s, px, py, f[0]);
            else if (cur === f[1] && px < mid)
                put(s, px, py, f[2]);
            else if (cur === f[0] && hash(px, py, 4) < 0.35)
                put(s, px, py, mix(f[0], "#000000", 0.2));
        }
        if (season === "spring" || season === "autumn")
            for (var a = 0; a < Math.floor(rad * 1.5); a++) {
                var ax2 = Math.floor(hash(a, seed || 3, 21) * w), ay2 = Math.floor(hash(a, seed || 3, 22) * cy * 2);
                if (get(s, ax2, ay2))
                    put(s, ax2, ay2, f[3]);
            }
        if (snowy)
            snowCap(s, 2);
    }
    rim(s, 0.5);
    return toSprite(s, {
        ax: mid,
        ay: h - 1
    });
}

function rock(kind, snowy, seed) {
    var s = make(kind === "ore" ? 11 : 12, 9);
    ellipse(s, 5, 5, 4.6, 3, "#8d9096");
    ellipse(s, 4, 4, 3.2, 2, "#a7abb2");
    hline(s, 2, 7, 8, "#6a6e76");
    put(s, 8, 6, "#6a6e76");
    if (kind === "ore") {
        put(s, 3, 4, "#e8c040");
        put(s, 5, 3, "#e8c040");
        put(s, 6, 5, "#e8c040");
        put(s, 4, 6, "#c0a030");
    }
    if (snowy)
        snowCap(s, 2);
    rim(s, 0.5);
    return toSprite(s, {
        ax: 5,
        ay: 8
    });
}

// ---- small things -----------------------------------------------------------------------------------------------

function prop(id) {
    var s, i;
    switch (id) {
    case "crate":
        s = make(7, 7);
        rect(s, 0, 0, 7, 7, "#b8814a");
        rect(s, 1, 1, 5, 5, "#cf9a60");
        hline(s, 1, 3, 5, "#8a5f38");
        vline(s, 3, 1, 5, "#8a5f38");
        break;
    case "barrel":
        s = make(6, 8);
        ellipse(s, 2.5, 4, 2.4, 3.6, "#9a6a3a");
        hline(s, 0, 2, 6, "#4a4038");
        hline(s, 0, 5, 6, "#4a4038");
        put(s, 1, 3, "#c08a50");
        break;
    case "hay":
        s = make(10, 8);
        ellipse(s, 5, 4.4, 4.4, 3.2, "#e0bc5a");
        for (i = 0; i < 6; i++)
            put(s, 2 + i, 2 + (i % 3) * 2, "#c49a38");
        hline(s, 2, 6, 6, "#b08830");
        break;
    case "logs":
        s = make(10, 7);
        for (i = 0; i < 3; i++) {
            rect(s, 1, 4 - i * 2 + 2, 8, 2, i % 2 === 0 ? "#8a5f38" : "#a06f40");
            put(s, 1, 4 - i * 2 + 2, "#d8b070");
            put(s, 8, 4 - i * 2 + 2, "#d8b070");
        }
        break;
    case "stones":
        s = make(10, 7);
        rect(s, 1, 3, 4, 3, "#8d9096");
        rect(s, 4, 2, 4, 4, "#a7abb2");
        rect(s, 6, 4, 3, 2, "#767a82");
        break;
    case "lamp":
        s = make(5, 12);
        vline(s, 2, 3, 9, "#3a3028");
        rect(s, 1, 0, 3, 3, "#3a3028");
        rect(s, 2, 1, 1, 1, "#ffe08a");
        break;
    case "sign":
        s = make(8, 11);
        vline(s, 3, 3, 8, "#6b4a2c");
        rect(s, 0, 0, 7, 4, "#cf9a60");
        hline(s, 1, 1, 5, "#6b4a2c");
        break;
    case "boat":
        s = make(16, 8);
        for (i = 0; i < 4; i++)
            hline(s, i, 3 + i, 16 - i * 2, i === 0 ? "#a8794a" : "#8a5f38");
        hline(s, 1, 3, 14, "#c99a62");
        vline(s, 8, 0, 4, "#6b4a2c");
        rect(s, 9, 0, 4, 3, "#efe6d2");
        break;
    case "cart":
        s = make(16, 11);
        rect(s, 3, 4, 9, 4, "#b8814a");
        hline(s, 3, 4, 9, "#d8a066");
        rect(s, 4, 2, 7, 2, "#e0bc5a");
        rect(s, 4, 8, 3, 3, "#4a4038");
        rect(s, 9, 8, 3, 3, "#4a4038");
        put(s, 5, 9, "#8a8a8a");
        put(s, 10, 9, "#8a8a8a");
        // horse
        rect(s, 12, 3, 4, 3, "#8a5a38");
        rect(s, 14, 1, 2, 3, "#8a5a38");
        vline(s, 12, 6, 3, "#6a4228");
        vline(s, 15, 6, 3, "#6a4228");
        break;
    case "flower":
        s = make(3, 3);
        put(s, 1, 0, "#f2d95c");
        put(s, 0, 1, "#f2d95c");
        put(s, 2, 1, "#f2d95c");
        put(s, 1, 1, "#e8a030");
        put(s, 1, 2, "#5a9a40");
        break;
    default:
        s = make(1, 1);
    }
    if (id !== "flower" && id !== "lamp" && id !== "sign")
        rim(s, 0.5);
    return toSprite(s, {
        ax: Math.floor(s.w / 2),
        ay: s.h - 1
    });
}

// ---- animals and people are drawn straight from rectangles, see vdraw.js ------------------------------------------

// ---- the library ------------------------------------------------------------------------------------------------

// Every sprite the scene needs for a season, built once and reused. snowy swaps in snow capped versions
function library(season, snowy) {
    snowMode = !!snowy;
    var lib = {
        season: season,
        snowy: snowy,
        building: {},
        tree: {},
        prop: {},
        rock: {}
    };
    var variants = [{
            roof: ROOF.red,
            wall: WALL.pale
        }, {
            roof: ROOF.brown,
            wall: WALL.wood
        }, {
            roof: ROOF.slate,
            wall: WALL.white
        }, {
            roof: ROOF.ochre,
            wall: WALL.pale
        }, {
            roof: ROOF.thatch,
            wall: WALL.wood
        }];
    for (var id in TYPES) {
        var t = TYPES[id];
        lib.building[id] = [];
        var many = id === "house" || id === "hut" || id === "longhouse";
        for (var v = 0; v < (many ? variants.length : 1); v++) {
            var o = many ? {
                roof: variants[v].roof,
                wall: variants[v].wall,
                seed: v + 1,
                timber: v % 2 === 1
            } : {
                seed: 1
            };
            lib.building[id].push(t.build(o));
        }
    }
    var kinds = ["oak", "pine", "birch"];
    for (var k = 0; k < kinds.length; k++) {
        lib.tree[kinds[k]] = [];
        for (var z = 0; z < 3; z++)
            lib.tree[kinds[k]].push(tree(kinds[k], season, z, snowy, 5 + z * 7 + k));
    }
    lib.tree.sapling = [tree("sapling", season, 0, snowy, 1)];
    lib.tree.bush = [tree("bush", season, 0, snowy, 2), tree("bush", season, 0, snowy, 9)];
    lib.rock.stone = [rock("stone", snowy, 1), rock("stone", snowy, 2)];
    lib.rock.ore = [rock("ore", snowy, 1)];
    var props = ["crate", "barrel", "hay", "logs", "stones", "lamp", "sign", "boat", "cart", "flower"];
    for (var p = 0; p < props.length; p++)
        lib.prop[props[p]] = prop(props[p]);
    snowMode = false;
    return lib;
}

// Variant of a building for one map position, so neighbouring houses differ
function buildingSprite(lib, id, variant) {
    var list = lib.building[id] || lib.building.hut;
    return list[Math.abs(variant | 0) % list.length];
}
