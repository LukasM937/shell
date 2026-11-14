.pragma library

// Draws the village onto a canvas context that only needs fillStyle, globalAlpha and fillRect. The ground and everything
// that stands still goes on one layer that is painted when something changes, people, animals and effects on another one
// that is painted every frame. It has no QML dependencies so scripts/village-render.js can draw it into a PNG.
//
// init() must be called once with the vart.js library, which a pragma library script cannot import in node.

var A = null;
var TILE = 8;

function init(art) {
    A = art;
}

// ---- ground -----------------------------------------------------------------------------------------------------

var SNOW = "#eef4f8";
var SNOW_SHADE = "#d4e0ea";

function grassTones(season) {
    switch (season) {
    case "spring":
        return ["#7ec25e", "#76ba56", "#88cb68", "#5fa347"];
    case "autumn":
        return ["#9ca94a", "#919e43", "#a9b352", "#7a8538"];
    case "winter":
        return ["#8fa57a", "#869b72", "#9aaf86", "#728862"];
    }
    return ["#78b65a", "#6fae52", "#82bf62", "#5c9a47"];
}

function paintTile(ctx, w, x, y, env) {
    var t = w.terrain[y * w.cols + x];
    var h = A.hash(x, y, 1);
    var px = x * TILE, py = y * TILE;
    var season = env.season;
    var snow = env.snow || 0;
    var cover = Math.max(0, Math.min(1, (snow - h * 0.5) / 0.5));
    var g, i, col;

    if (t === 0 || t === 1) {
        var deep = t === 0;
        if (env.ice && !deep)
            col = h < 0.5 ? "#c4e0ec" : "#b8d8e6";
        else
            col = deep ? (h < 0.5 ? "#2c6f9e" : "#2a6a98") : (h < 0.5 ? "#4b9bc9" : "#4795c2");
        ctx.fillStyle = col;
        ctx.fillRect(px, py, TILE, TILE);
        // a lighter ripple row inside the water, and foam where it meets the land
        if (!env.ice && h < 0.3) {
            ctx.fillStyle = deep ? "#3a7fae" : "#66b0d8";
            ctx.fillRect(px + 1 + Math.floor(h * 20), py + 2 + Math.floor(h * 17) % 5, 3, 1);
        }
        var nbs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
        for (i = 0; i < 4; i++) {
            var nx = x + nbs[i][0], ny = y + nbs[i][1];
            if (nx < 0 || ny < 0 || nx >= w.cols || ny >= w.rows)
                continue;
            var nt = w.terrain[ny * w.cols + nx];
            if (nt !== 0 && nt !== 1) {
                ctx.fillStyle = env.ice ? "#e4f2f8" : "#d8eef7";
                if (i === 0)
                    ctx.fillRect(px, py, TILE, 1);
                else if (i === 1)
                    ctx.fillRect(px + TILE - 1, py, 1, TILE);
                else if (i === 2)
                    ctx.fillRect(px, py + TILE - 1, TILE, 1);
                else
                    ctx.fillRect(px, py, 1, TILE);
            } else if (nt === 0 && !deep) {
                ctx.fillStyle = "#3d86b6";
                if (i === 0)
                    ctx.fillRect(px, py, TILE, 1);
                else if (i === 1)
                    ctx.fillRect(px + TILE - 1, py, 1, TILE);
                else if (i === 2)
                    ctx.fillRect(px, py + TILE - 1, TILE, 1);
                else
                    ctx.fillRect(px, py, 1, TILE);
            }
        }
        return;
    }

    if (t === 2) {
        col = h < 0.5 ? "#e3cf94" : "#ddc98c";
        if (cover > 0.5)
            col = SNOW;
        ctx.fillStyle = col;
        ctx.fillRect(px, py, TILE, TILE);
        if (cover <= 0.5 && h > 0.7) {
            ctx.fillStyle = "#cdb877";
            ctx.fillRect(px + 2 + Math.floor(h * 10) % 4, py + 3 + Math.floor(h * 31) % 3, 2, 1);
        }
        return;
    }

    if (t === 4) {
        col = h < 0.33 ? "#8d9096" : h < 0.66 ? "#868991" : "#92959c";
        ctx.fillStyle = cover > 0.4 ? SNOW_SHADE : col;
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = cover > 0.4 ? SNOW : "#767a82";
        ctx.fillRect(px + Math.floor(h * 50) % 5, py + 5, 3, 1);
        // a lit lip where the hill starts and a dark face where it drops
        var above = y > 0 ? w.terrain[(y - 1) * w.cols + x] : 4, below = y < w.rows - 1 ? w.terrain[(y + 1) * w.cols + x] : 4;
        if (above !== 4) {
            ctx.fillStyle = cover > 0.4 ? SNOW : "#a9adb4";
            ctx.fillRect(px, py, TILE, 2);
        }
        if (below !== 4) {
            ctx.fillStyle = cover > 0.4 ? "#bccad6" : "#62666e";
            ctx.fillRect(px, py + 4, TILE, 4);
            ctx.fillStyle = cover > 0.4 ? "#a8b8c6" : "#50545c";
            ctx.fillRect(px + 1, py + 6, 2, 2);
            ctx.fillRect(px + 5, py + 5, 2, 3);
        }
        return;
    }

    if (t === 5) {
        // field: soil rows with a crop that follows the season
        ctx.fillStyle = "#7b5a3b";
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = "#6a4c31";
        ctx.fillRect(px, py + 1, TILE, 1);
        ctx.fillRect(px, py + 4, TILE, 1);
        ctx.fillRect(px, py + 7, TILE, 1);
        var crop = env.crop || 0;
        if (crop > 0 && cover < 0.6) {
            var cc = crop === 1 ? "#8fc45a" : crop === 2 ? "#5fae3e" : crop === 3 ? "#e6c35a" : "#b89a52";
            var hh = crop === 1 ? 1 : crop === 2 ? 2 : crop === 3 ? 3 : 1;
            ctx.fillStyle = cc;
            for (var rowY = 1; rowY < TILE; rowY += 3)
                for (var cx = 0; cx < TILE; cx += 2)
                    ctx.fillRect(px + cx, py + rowY - hh + 1, 1, hh);
        }
        if (cover > 0.3) {
            ctx.fillStyle = SNOW;
            ctx.fillRect(px, py, TILE, 2);
            ctx.fillRect(px, py + 3, TILE, 1);
            ctx.fillRect(px, py + 6, TILE, 1);
        }
        return;
    }

    if (t === 6) {
        ctx.fillStyle = cover > 0.5 ? "#d9d4c8" : h < 0.5 ? "#c4a066" : "#bf9b62";
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = cover > 0.5 ? "#c8c2b4" : "#b08c55";
        ctx.fillRect(px + Math.floor(h * 40) % 6, py + Math.floor(h * 90) % 6, 2, 1);
        ctx.fillRect(px + Math.floor(h * 70) % 6, py + 1 + Math.floor(h * 130) % 5, 1, 1);
        return;
    }

    if (t === 7) {
        ctx.fillStyle = cover > 0.5 ? "#dedad2" : "#a8a39a";
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = cover > 0.5 ? "#c4beb2" : "#948f86";
        ctx.fillRect(px, py + 3, TILE, 1);
        ctx.fillRect(px, py + 7, TILE, 1);
        ctx.fillRect(px + (y % 2 === 0 ? 3 : 6), py, 1, 4);
        ctx.fillRect(px + (y % 2 === 0 ? 6 : 2), py + 4, 1, 4);
        return;
    }

    // grass
    g = grassTones(season);
    // broad patches of a lighter or darker green, not a tile by tile checker
    var patch = A.hash(Math.floor(x / 3), Math.floor(y / 3), 21) * 0.6 + h * 0.4;
    col = patch < 0.38 ? g[1] : patch < 0.7 ? g[0] : g[2];
    if (cover > 0) {
        col = A.mix(col, cover > 0.6 ? SNOW : "#cfdde6", Math.min(1, cover * 1.1));
    }
    ctx.fillStyle = col;
    ctx.fillRect(px, py, TILE, TILE);
    var d = w.decor[y * w.cols + x];
    if (d === 1 && cover < 0.7) {
        ctx.fillStyle = g[3];
        ctx.fillRect(px + 2 + Math.floor(h * 20) % 3, py + 4, 1, 2);
        ctx.fillRect(px + 3 + Math.floor(h * 20) % 3, py + 5, 1, 1);
        ctx.fillRect(px + 5, py + 2, 1, 2);
    } else if (d >= 2 && d <= 4 && cover < 0.4 && (season === "spring" || season === "summer")) {
        ctx.fillStyle = d === 2 ? "#f2d95c" : d === 3 ? "#f0f0f6" : "#e88ab0";
        ctx.fillRect(px + 2 + Math.floor(h * 33) % 4, py + 3 + Math.floor(h * 57) % 3, 1, 1);
        ctx.fillRect(px + 5, py + 6, 1, 1);
    } else if (d === 5) {
        ctx.fillStyle = cover > 0.4 ? SNOW_SHADE : "#9a9a96";
        ctx.fillRect(px + 3, py + 5, 2, 1);
    } else if (season === "autumn" && h > 0.8) {
        ctx.fillStyle = h > 0.9 ? "#d27d20" : "#b5501c";
        ctx.fillRect(px + 2 + Math.floor(h * 41) % 4, py + 2 + Math.floor(h * 77) % 4, 1, 1);
    }
}

// Everything at ground level: terrain, roads and fields
function paintGround(ctx, w, env) {
    for (var y = 0; y < w.rows; y++)
        for (var x = 0; x < w.cols; x++)
            paintTile(ctx, w, x, y, env);
}

// ---- things that stand still --------------------------------------------------------------------------------------

// Sprite and where its top left corner goes, for a building
function placeBuilding(w, b, lib) {
    var spr = A.buildingSprite(lib, b.type, b.v);
    return {
        spr: spr,
        x: b.x * TILE + Math.floor(b.fw * TILE / 2 - spr.w / 2),
        y: (b.y + b.fh) * TILE - spr.h
    };
}

// A site: foundation, then the building rising behind scaffolding poles. progress 0..1
function drawSite(ctx, w, b, lib) {
    var p = placeBuilding(w, b, lib);
    var bx = b.x * TILE, by = b.y * TILE;
    var fwpx = b.fw * TILE, fhpx = b.fh * TILE;
    var prog = b.progress;
    // trampled ground
    ctx.fillStyle = "#9a7a4e";
    ctx.fillRect(bx, by + Math.floor(fhpx * 0.35), fwpx, Math.ceil(fhpx * 0.65));
    ctx.fillStyle = "#8a6a42";
    ctx.fillRect(bx + 1, by + fhpx - 2, fwpx - 2, 1);
    if (prog < 0.12) {
        // stakes and a stone outline
        ctx.fillStyle = "#6b4a2c";
        ctx.fillRect(bx, by + fhpx - 6, 1, 5);
        ctx.fillRect(bx + fwpx - 1, by + fhpx - 6, 1, 5);
        ctx.fillStyle = "#a7abb2";
        for (var i = 1; i < fwpx - 1; i += 3)
            ctx.fillRect(bx + i, by + fhpx - 2, 2, 1);
        return;
    }
    var shown = Math.min(1, (prog - 0.12) / 0.88);
    var cut = Math.ceil(p.spr.h * (1 - shown));
    A.blit(ctx, p.spr, p.x, p.y, cut);
    // scaffolding up to the working height
    var topY = p.y + cut - 3;
    ctx.fillStyle = "#c89a5e";
    var left = p.x - 1, right = p.x + p.spr.w;
    if (shown < 0.96) {
        ctx.fillRect(left, topY, 2, p.y + p.spr.h - topY - 1);
        ctx.fillRect(right - 1, topY, 2, p.y + p.spr.h - topY - 1);
        ctx.fillStyle = "#8a5f38";
        for (var yy = p.y + p.spr.h - 6; yy > topY; yy -= 6)
            ctx.fillRect(left, yy, p.spr.w + 2, 1);
        ctx.fillRect(left, topY, p.spr.w + 2, 1);
    }
}

function drawBuilding(ctx, w, b, lib) {
    if (b.type === "field")
        return;
    if (b.progress < 1) {
        drawSite(ctx, w, b, lib);
        return;
    }
    var p = placeBuilding(w, b, lib);
    A.blit(ctx, p.spr, p.x, p.y);
}

// Trees, rocks and buildings in the order their feet are in, so nearer things cover farther ones. Returns the list of
// rectangles (x, y, w, h, baseline) that cover people walking behind them, for coverAt().
function paintObjects(ctx, w, lib, env) {
    var list = [];
    var i;
    for (i = 0; i < w.trees.length; i++) {
        var t = w.trees[i];
        list.push({
            y: (t.y + 1) * TILE,
            x: t.x,
            kind: 0,
            ref: t
        });
    }
    for (i = 0; i < w.rocks.length; i++)
        list.push({
            y: (w.rocks[i].y + 1) * TILE,
            x: w.rocks[i].x,
            kind: 1,
            ref: w.rocks[i]
        });
    for (i = 0; i < w.buildings.length; i++) {
        var b = w.buildings[i];
        if (b.type === "field")
            continue;
        list.push({
            y: (b.y + b.fh) * TILE,
            x: b.x,
            kind: 2,
            ref: b
        });
    }
    list.sort(function (a, b2) {
        return a.y - b2.y || a.x - b2.x;
    });
    var covers = [];
    for (i = 0; i < list.length; i++) {
        var o = list[i];
        if (o.kind === 0) {
            var tr = o.ref;
            var spr = tr.size < 0 ? lib.tree.sapling[0] : lib.tree[tr.kind][tr.size] || lib.tree[tr.kind][0];
            var sx = tr.x * TILE + 4 - spr.ax, sy = (tr.y + 1) * TILE - 1 - spr.ay;
            A.blit(ctx, spr, sx, sy);
            covers.push([sx, sy, spr.w, spr.h, (tr.y + 1) * TILE]);
        } else if (o.kind === 1) {
            var r = o.ref;
            var rs = lib.rock[r.kind][r.v % lib.rock[r.kind].length];
            var rx = r.x * TILE + 4 - rs.ax, ry = (r.y + 1) * TILE - 1 - rs.ay;
            A.blit(ctx, rs, rx, ry);
        } else {
            var bb = o.ref;
            drawBuilding(ctx, w, bb, lib);
            var pl = placeBuilding(w, bb, lib);
            covers.push([pl.x, pl.y, pl.spr.w, pl.spr.h, (bb.y + bb.fh) * TILE]);
        }
    }
    return covers;
}

// ---- people -----------------------------------------------------------------------------------------------------------------

var TOOL_JOBS = {
    chop: 1,
    mine: 1,
    build: 1,
    farm: 1,
    fish: 1
};

var CASUAL = ["#a65a8a", "#5a8aa6", "#8aa65a", "#b0884a", "#7a6aa6", "#c0624a", "#4a9a8a", "#9a9a5a"];

// A work shirt for people with a profession, their own colour for the rest
function clothes(p, w) {
    if (p.age === "child")
        return A.CLOTHES.child;
    var job = "";
    if (p.job === "build")
        return A.CLOTHES.builder;
    if (p.work) {
        for (var i = 0; i < w.buildings.length; i++)
            if (w.buildings[i].id === p.work) {
                job = JOBFOR[w.buildings[i].type] || "";
                break;
            }
    }
    if (job)
        return A.CLOTHES[JOBNAME[job]] || CASUAL[p.id % CASUAL.length];
    return CASUAL[p.id % CASUAL.length];
}

var JOBNAME = {
    chop: "woodcutter",
    mine: "miner",
    build: "builder",
    farm: "farmer",
    fish: "fisher",
    trade: "merchant",
    craft: "baker",
    play: "bard",
    pray: "priest",
    rule: "merchant",
    guard: "guard",
    study: "mage",
    herd: "shepherd"
};

var JOBFOR = {
    market: "trade",
    bakery: "craft",
    smithy: "craft",
    windmill: "craft",
    tavern: "play",
    church: "pray",
    townhall: "rule",
    tower: "guard",
    library: "study",
    magetower: "study",
    barn: "herd"
};

// Feet at the world pixel (x, y). The figure is 5 wide and 9 tall: a child 4 by 7
function drawPerson(ctx, w, p, t) {
    var px = Math.round(p.x * TILE), py = Math.round(p.y * TILE);
    var child = p.age === "child";
    var skin = A.SKIN[p.skin % 4];
    var hair = p.age === "elder" ? "#d8d8d8" : A.HAIR[p.hair % 6];
    var shirt = clothes(p, w);
    var pants = p.tone === 0 ? "#4a3d34" : p.tone === 1 ? "#5a5f75" : "#6a5440";
    var moving = p.st === "walk";
    var f = Math.floor(p.ph) % 4;
    var hop = 0;
    if (p.job === "party" && p.st === "work")
        hop = Math.floor(t * 4 + p.id) % 2;
    var bob = moving && (f === 1 || f === 3) ? 1 : 0;
    var x = px - 2, y = py - (child ? 7 : 9) - hop;

    // shadow
    ctx.fillStyle = "rgba(20,30,10,0.28)";
    ctx.fillRect(px - 2, py - 1, 5, 1);

    if (child) {
        ctx.fillStyle = pants;
        ctx.fillRect(x + 1, y + 5 + (moving && f < 2 ? 0 : 0), 1, 2);
        ctx.fillRect(x + 2, y + 5 + (moving && f >= 2 ? 0 : 0) - (moving && f === 1 ? 1 : 0), 1, 2 - (moving && f === 1 ? 1 : 0));
        ctx.fillStyle = shirt;
        ctx.fillRect(x, y + 3, 4, 2);
        ctx.fillStyle = skin;
        ctx.fillRect(x + 1, y + 1, 2, 2);
        ctx.fillStyle = hair;
        ctx.fillRect(x + 1, y, 2, 1);
        return;
    }

    y += bob;
    // legs
    ctx.fillStyle = pants;
    var lift = moving ? (f === 1 ? 1 : 0) : 0, lift2 = moving ? (f === 3 ? 1 : 0) : 0;
    ctx.fillRect(x + 1, y + 7, 1, 2 - lift);
    ctx.fillRect(x + 3, y + 7, 1, 2 - lift2);
    // torso and arms
    ctx.fillStyle = shirt;
    ctx.fillRect(x + 1, y + 4, 3, 3);
    ctx.fillStyle = A.shade(shirt, 0.8);
    ctx.fillRect(x + 3, y + 5, 1, 2);
    // head
    ctx.fillStyle = skin;
    ctx.fillRect(x + 1, y + 2, 3, 2);
    ctx.fillStyle = hair;
    ctx.fillRect(x + 1, y, 3, 2);
    if (p.dir === 1) {
        ctx.fillRect(x + 1, y + 2, 3, 1);
    } else if (p.dir === 0) {
        ctx.fillStyle = "#2b2118";
        ctx.fillRect(x + 1, y + 2, 1, 1);
        ctx.fillRect(x + 3, y + 2, 1, 1);
    } else {
        ctx.fillStyle = "#2b2118";
        ctx.fillRect(x + (p.dir === 3 ? 3 : 1), y + 2, 1, 1);
    }
    // arms swing when walking, tools when working
    var swing = moving ? (f === 0 || f === 2 ? 0 : 1) : 0;
    ctx.fillStyle = skin;
    var work = p.st === "work";
    var act = p.act;
    var phase = Math.floor(p.ph) % 2;
    if (work && TOOL_JOBS[act]) {
        // one arm up with a tool in it
        var up = phase === 0 ? 1 : 3;
        ctx.fillRect(x + 4, y + 4 - (phase === 0 ? 2 : 0), 1, 2);
        ctx.fillRect(x, y + 5, 1, 2);
        if (act === "chop") {
            ctx.fillStyle = "#6b4a2c";
            ctx.fillRect(x + 5, y + 2 - (phase === 0 ? 2 : 0) + (phase === 0 ? 0 : 3), 1, 4);
            ctx.fillStyle = "#c0c4cc";
            ctx.fillRect(x + 5, y + 2 - (phase === 0 ? 2 : 0) + (phase === 0 ? 0 : 3), 2, 1);
        } else if (act === "build") {
            ctx.fillStyle = "#6b4a2c";
            ctx.fillRect(x + 5, y + (phase === 0 ? 0 : 3), 1, 3);
            ctx.fillStyle = "#8a8a8a";
            ctx.fillRect(x + 5, y + (phase === 0 ? 0 : 3), 2, 1);
        } else if (act === "mine") {
            ctx.fillStyle = "#6b4a2c";
            ctx.fillRect(x + 5, y + 1 + (phase === 0 ? 0 : 3), 1, 4);
            ctx.fillStyle = "#9aa0a8";
            ctx.fillRect(x + 4, y + (phase === 0 ? 0 : 3), 3, 1);
        } else if (act === "farm") {
            ctx.fillStyle = "#6b4a2c";
            ctx.fillRect(x + 5, y + 3 + (phase === 0 ? 0 : 1), 1, 5);
            ctx.fillStyle = "#9aa0a8";
            ctx.fillRect(x + 5, y + 8, 2, 1);
        } else if (act === "fish") {
            ctx.fillStyle = "#6b4a2c";
            ctx.fillRect(x + 5, y + 1, 1, 4);
            ctx.fillRect(x + 6, y, 3, 1);
            ctx.fillStyle = "#e8e8f0";
            ctx.fillRect(x + 9, y + 1, 1, 5 + phase);
            ctx.fillStyle = "#d9553f";
            ctx.fillRect(x + 9, y + 6 + phase, 1, 1);
        }
        void up;
    } else {
        ctx.fillRect(x, y + 4 + swing, 1, 2);
        ctx.fillRect(x + 4, y + 4 + (1 - swing), 1, 2);
    }
    // what is being carried
    if (p.carry === "wood") {
        ctx.fillStyle = "#8a5f38";
        ctx.fillRect(x - 1, y + 2, 7, 2);
        ctx.fillStyle = "#d8b070";
        ctx.fillRect(x + 5, y + 2, 1, 2);
    } else if (p.carry === "stone") {
        ctx.fillStyle = "#8d9096";
        ctx.fillRect(x, y + 2, 4, 3);
        ctx.fillStyle = "#b4b8c0";
        ctx.fillRect(x + 1, y + 2, 2, 1);
    } else if (p.carry === "food") {
        ctx.fillStyle = "#b8814a";
        ctx.fillRect(x, y + 3, 4, 3);
        ctx.fillStyle = "#e0bc5a";
        ctx.fillRect(x + 1, y + 2, 2, 1);
    }
}

// ---- things that move without being simulated -----------------------------------------------------------------------------

// Chimney smoke as a function of time: four puffs per chimney rising, thinning and leaning with the wind
function drawSmoke(ctx, w, lib, env, t) {
    var wind = (env.wind || 0.3) * 6;
    for (var i = 0; i < w.buildings.length; i++) {
        var b = w.buildings[i];
        if (b.progress < 1)
            continue;
        var spr = A.buildingSprite(lib, b.type, b.v);
        if (!spr.chimney)
            continue;
        // lit when someone is at home or working, always in the cold
        var cold = (env.tempC || 10) < 8;
        var on = b.busy > 0 || (b.residents.length > 0 && (env.night || cold)) || b.type === "smithy" || (b.type === "bakery" && env.hour > 4 && env.hour < 11);
        if (!on)
            continue;
        var pl = placeBuilding(w, b, lib);
        var cx = pl.x + spr.chimney.x, cy = pl.y + spr.chimney.y;
        var strong = b.type === "smithy" || b.type === "bakery";
        for (var k = 0; k < 4; k++) {
            var life = ((t * 0.5 + k * 0.25 + b.id * 0.13) % 1);
            var rise = life * (strong ? 18 : 13);
            ctx.fillStyle = "rgba(" + (strong ? "90,88,92" : "200,200,206") + "," + (0.5 * (1 - life)).toFixed(2) + ")";
            var sz = life < 0.4 ? 2 : 3;
            ctx.fillRect(Math.round(cx - 1 + life * wind + Math.sin(t * 1.3 + k + b.id) * 0.8), Math.round(cy - 2 - rise), sz, sz);
        }
    }
}

function drawFire(ctx, x, y, t, big) {
    // logs, then flames that flicker through three heights
    ctx.fillStyle = "#4a3320";
    ctx.fillRect(x - 3, y - 1, 7, 2);
    ctx.fillStyle = "#6b4a2c";
    ctx.fillRect(x - 2, y - 2, 5, 1);
    var f1 = Math.floor(t * 9) % 3, f2 = Math.floor(t * 7 + 1) % 3;
    ctx.fillStyle = "#e8602a";
    ctx.fillRect(x - 2, y - 4 - f1, 5, 2 + f1);
    ctx.fillStyle = "#ffa93a";
    ctx.fillRect(x - 1, y - 6 - f2, 3, 3 + f2);
    ctx.fillStyle = "#ffe08a";
    ctx.fillRect(x, y - 5 - f1, 1, 3);
    if (big) {
        ctx.fillStyle = "rgba(255,150,60,0.18)";
        ctx.fillRect(x - 7, y - 8, 15, 11);
    }
}

function drawSails(ctx, w, lib, t, env) {
    for (var i = 0; i < w.buildings.length; i++) {
        var b = w.buildings[i];
        if (b.type !== "windmill" || b.progress < 1)
            continue;
        var pl = placeBuilding(w, b, lib);
        var hub = pl.spr.hub;
        var cx = pl.x + hub.x, cy = pl.y + hub.y;
        var speed = 0.25 + (env.wind || 0.3) * 1.6;
        var a0 = t * speed + b.id;
        for (var k = 0; k < 4; k++) {
            var a = a0 + k * Math.PI / 2;
            var dx = Math.cos(a), dy = Math.sin(a);
            ctx.fillStyle = "#6b4a2c";
            for (var s = 1; s <= 9; s++)
                ctx.fillRect(Math.round(cx + dx * s), Math.round(cy + dy * s), 1, 1);
            ctx.fillStyle = "#efe6d2";
            for (var q = 4; q <= 9; q++) {
                var ox = Math.round(cx + dx * q - dy * 1), oy = Math.round(cy + dy * q + dx * 1);
                ctx.fillRect(ox, oy, 1, 1);
                ctx.fillRect(Math.round(cx + dx * q - dy * 2), Math.round(cy + dy * q + dx * 2), 1, 1);
            }
        }
        ctx.fillStyle = "#3a2a20";
        ctx.fillRect(Math.round(cx) - 1, Math.round(cy) - 1, 2, 2);
    }
}

// Light sparkling on the water: a few tiles at a time
function drawSparkles(ctx, w, t, env) {
    if (env.ice)
        return;
    var lit = env.daylight > 0.3;
    for (var i = 0; i < 70; i++) {
        var slot = Math.floor(t * 0.7 + i * 0.37);
        var x = Math.floor(A.hash(i, slot, 8) * w.cols), y = Math.floor(A.hash(slot, i, 9) * w.rows);
        var tt = w.terrain[y * w.cols + x];
        if (tt !== 0 && tt !== 1)
            continue;
        var phase = (t * 0.7 + i * 0.37) % 1;
        if (phase > 0.6)
            continue;
        ctx.fillStyle = lit ? "rgba(255,255,255,0.75)" : "rgba(200,220,255,0.35)";
        ctx.fillRect(x * TILE + 1 + Math.floor(A.hash(slot, i, 10) * 5), y * TILE + 1 + Math.floor(A.hash(i, slot, 11) * 5), 1, 1);
    }
}

// Everything that moves. covers are the rectangles of the things people can walk behind (from paintObjects)
function drawDynamic(ctx, w, lib, env, t, covers) {
    var i;
    drawSparkles(ctx, w, t, env);
    // the fire at the heart of the village
    drawFire(ctx, w.centre.x * TILE + 4, w.centre.y * TILE + 6, t, env.night);
    drawSails(ctx, w, lib, t, env);
    drawPiles(ctx, w, lib, env);
    drawBoats(ctx, w, lib, env, t);
    drawCarts(ctx, w, lib, env, t);
    drawAnimals(ctx, w, env, t, covers);
    var order = w.people.slice().sort(function (a, b) {
        return a.y - b.y;
    });
    for (i = 0; i < order.length; i++) {
        var p = order[i];
        if (p.inside)
            continue;
        if (covered(covers, p.x * TILE, p.y * TILE))
            continue;
        drawPerson(ctx, w, p, t);
    }
    drawForge(ctx, w, lib, env, t);
    drawSmoke(ctx, w, lib, env, t);
    drawSky(ctx, w, env, t);
    drawMusic(ctx, w, lib, env, t);
    drawPigeons(ctx, w, env);
}

// Whether a point is hidden behind something taller than itself that stands in front of it
function covered(covers, x, y) {
    for (var i = 0; i < covers.length; i++) {
        var c = covers[i];
        if (x >= c[0] + 1 && x < c[0] + c[2] - 1 && y - 8 < c[1] + c[3] - 1 && y - 3 >= c[1] && y < c[4] - 1)
            return true;
    }
    return false;
}

// ---- weather and the time of day --------------------------------------------------------------------------------------------

// Rain, snow, mist and clouds over the world
function drawWeather(ctx, w, env, t) {
    var W = w.cols * TILE, H = w.rows * TILE;
    var i;
    if (env.precip > 0) {
        var n = Math.round(90 + 420 * env.precip);
        if (env.snowing) {
            ctx.fillStyle = "rgba(255,255,255,0.85)";
            for (i = 0; i < n; i++) {
                var sx = (A.hash(i, 1, 1) * W + Math.sin(t * 0.8 + i) * 4 + t * 6 * (env.wind || 0.3)) % W;
                var sy = (A.hash(i, 2, 2) * H + t * (14 + A.hash(i, 3, 3) * 10)) % H;
                ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
                if (i % 5 === 0)
                    ctx.fillRect(Math.round(sx) + 1, Math.round(sy), 1, 1);
            }
        } else {
            ctx.fillStyle = "rgba(200,222,255,0.7)";
            var slant = 2 + (env.wind || 0.3) * 6;
            for (i = 0; i < n; i++) {
                var rx = (A.hash(i, 4, 4) * W + t * slant * 12) % W;
                var ry = (A.hash(i, 5, 5) * H + t * (110 + A.hash(i, 6, 6) * 40)) % H;
                ctx.fillRect(Math.round(rx), Math.round(ry), 1, 3);
            }
        }
    }
    if (env.clouds > 0.2) {
        // soft cloud shadows drifting over the ground
        var count = Math.round(2 + env.clouds * 5);
        for (i = 0; i < count; i++) {
            var cw = 60 + A.hash(i, 7, 7) * 90, ch = 24 + A.hash(i, 8, 8) * 30;
            var cx = (A.hash(i, 9, 9) * (W + cw) + t * (2 + (env.wind || 0.3) * 6)) % (W + cw) - cw;
            var cy = A.hash(i, 10, 10) * H;
            ctx.fillStyle = "rgba(20,30,50," + (0.07 * env.clouds).toFixed(3) + ")";
            ctx.fillRect(Math.round(cx), Math.round(cy), Math.round(cw), Math.round(ch));
            ctx.fillRect(Math.round(cx + 6), Math.round(cy - 4), Math.round(cw - 12), Math.round(ch + 8));
            ctx.fillRect(Math.round(cx + 14), Math.round(cy - 7), Math.round(cw - 28), Math.round(ch + 14));
        }
    }
    if (env.fog > 0) {
        ctx.fillStyle = "rgba(225,232,238,0.32)";
        ctx.fillRect(0, 0, W, H);
    }
}

// The colour laid over everything for the hour: warm at the edges of the day, deep blue at night, and a grey in bad weather.
// Returns [r, g, b, a]
function ambient(env) {
    var d = env.daylight;
    if (d === undefined)
        d = 1;
    var r = 255, g = 255, b = 255, a = 0;
    if (d < 0.97) {
        // dawn and dusk lean orange, then blue as the light goes
        var warm = Math.max(0, 1 - Math.abs(d - 0.5) * 2.4);
        var night = 1 - d;
        r = 255 * warm + 18 * (1 - warm);
        g = 150 * warm + 30 * (1 - warm);
        b = 90 * warm + 80 * (1 - warm);
        a = Math.min(0.62, night * 0.7 + warm * 0.08);
    }
    // a grey over a day that is not clear
    var wa = env.thunder ? 0.26 : env.fog ? 0.1 : env.precip > 0.5 ? 0.17 : env.precip > 0 ? 0.1 : env.clouds > 0.6 ? 0.07 : 0;
    if (wa > 0) {
        var total = a + wa;
        r = (r * a + 44 * wa) / total;
        g = (g * a + 54 * wa) / total;
        b = (b * a + 72 * wa) / total;
        a = Math.min(0.7, 1 - (1 - a) * (1 - wa));
    }
    return [Math.round(r), Math.round(g), Math.round(b), a];
}

// Lit windows, the fire, lamps: drawn after the dark layer so they glow
function drawLights(ctx, w, lib, env, t) {
    var dark = 1 - env.daylight;
    if (dark < 0.12)
        return;
    var i, k;
    for (i = 0; i < w.buildings.length; i++) {
        var b = w.buildings[i];
        if (b.progress < 1)
            continue;
        var spr = A.buildingSprite(lib, b.type, b.v);
        var pl = placeBuilding(w, b, lib);
        var on = b.residents.length > 0 || b.busy > 0 || b.type === "tavern" || b.type === "church" || b.type === "magetower" || b.type === "lighthouse";
        if (!on)
            continue;
        for (k = 0; k < spr.windows.length; k++) {
            var win = spr.windows[k];
            ctx.fillStyle = "rgba(255,170,70," + (0.16 * dark).toFixed(3) + ")";
            ctx.fillRect(pl.x + win.x - 2, pl.y + win.y - 2, win.w + 4, win.h + 4);
            ctx.fillStyle = "rgba(255,214,120," + Math.min(1, dark * 1.4).toFixed(3) + ")";
            ctx.fillRect(pl.x + win.x, pl.y + win.y, win.w, win.h);
        }
        if (b.type === "lighthouse" && spr.beacon) {
            ctx.fillStyle = "rgba(255,240,170," + (0.3 * dark).toFixed(2) + ")";
            ctx.fillRect(pl.x + spr.beacon.x - 5, pl.y + spr.beacon.y - 3, 11, 7);
            ctx.fillStyle = "rgba(255,250,200,0.95)";
            ctx.fillRect(pl.x + spr.beacon.x - 1, pl.y + spr.beacon.y - 1, 3, 3);
        }
        if (b.type === "magetower" && spr.crystal) {
            var gl = 0.4 + 0.6 * (w.sig.gpu || 0.1);
            ctx.fillStyle = "rgba(120,200,255," + (0.22 * gl).toFixed(2) + ")";
            ctx.fillRect(pl.x + spr.crystal.x - 5, pl.y + spr.crystal.y - 4, 11, 9);
            ctx.fillStyle = "rgba(190,235,255," + gl.toFixed(2) + ")";
            ctx.fillRect(pl.x + spr.crystal.x - 1, pl.y + spr.crystal.y - 1, 3, 3);
        }
    }
    // the fire's pool of light
    ctx.fillStyle = "rgba(255,150,50," + (0.1 * dark).toFixed(3) + ")";
    var fx = w.centre.x * TILE + 4, fy = w.centre.y * TILE + 4;
    ctx.fillRect(fx - 20, fy - 12, 41, 25);
    ctx.fillRect(fx - 13, fy - 17, 27, 35);
}

// ---- animals --------------------------------------------------------------------------------------------------------------

function openTile(w, x, y) {
    if (x < 0 || y < 0 || x >= w.cols || y >= w.rows)
        return false;
    var i = y * w.cols + x;
    var t = w.terrain[i];
    return w.occ[i] === 0 && t !== 0 && t !== 1 && t !== 4;
}

// A smooth roaming about an anchor, as a function of time, so animals need no state of their own. It stays put where the
// ground is not open. Returns [x, y, facing] in pixels
function roam(w, ax, ay, rx, ry, seed, t) {
    var a = t * 0.11 + seed * 2.3, b = t * 0.09 + seed * 1.7;
    var x = ax + (Math.sin(a) + 0.5 * Math.sin(t * 0.27 + seed * 1.1)) * rx / 1.5;
    var y = ay + (Math.cos(b) + 0.5 * Math.sin(t * 0.21 + seed)) * ry / 1.5;
    if (!openTile(w, Math.floor(x), Math.floor(y))) {
        x = ax;
        y = ay;
    }
    return [Math.round(x * TILE), Math.round(y * TILE), Math.cos(a) >= 0 ? 1 : -1];
}

function drawSheep(ctx, x, y, f) {
    ctx.fillStyle = "rgba(20,30,10,0.25)";
    ctx.fillRect(x - 3, y - 1, 6, 1);
    ctx.fillStyle = "#f0eee8";
    ctx.fillRect(x - 3, y - 4, 5, 3);
    ctx.fillStyle = "#cfcbc2";
    ctx.fillRect(x - 3, y - 2, 5, 1);
    ctx.fillStyle = "#4a4038";
    ctx.fillRect(f > 0 ? x + 2 : x - 4, y - 4, 2, 2);
    ctx.fillRect(x - 2, y - 1, 1, 1);
    ctx.fillRect(x + 1, y - 1, 1, 1);
}

function drawChicken(ctx, x, y, f, peck) {
    ctx.fillStyle = "#f4f0e4";
    ctx.fillRect(x - 1, y - 3, 3, 2);
    ctx.fillStyle = "#d9553f";
    ctx.fillRect(f > 0 ? x + 2 : x - 2, y - 4 + peck, 1, 1);
    ctx.fillStyle = "#e8a030";
    ctx.fillRect(x, y - 1, 1, 1);
}

function drawDog(ctx, x, y, f) {
    ctx.fillStyle = "#8a5a38";
    ctx.fillRect(x - 2, y - 3, 4, 2);
    ctx.fillRect(f > 0 ? x + 2 : x - 3, y - 4, 2, 2);
    ctx.fillRect(f > 0 ? x - 3 : x + 2, y - 4, 1, 1);
    ctx.fillStyle = "#5a3a22";
    ctx.fillRect(x - 2, y - 1, 1, 1);
    ctx.fillRect(x + 1, y - 1, 1, 1);
}

function drawAnimals(ctx, w, env, t, covers) {
    if (env.night && env.daylight < 0.1)
        return;
    var i, k, b;
    var renown = w.stats.renown;
    var kept = 0;
    for (i = 0; i < w.buildings.length; i++) {
        b = w.buildings[i];
        if (b.progress < 1)
            continue;
        if (b.type === "barn") {
            var sheep = 2 + Math.min(3, Math.floor(renown / 200));
            for (k = 0; k < sheep; k++) {
                var s = roam(w, b.x + b.fw / 2, b.y + b.fh + 1.4, 4, 1.6, b.id + k * 3.1, t);
                drawSheep(ctx, s[0], s[1], s[2]);
            }
        } else if ((b.type === "house" || b.type === "hut" || b.type === "farmhouse" || b.type === "longhouse") && kept < 9 && (b.id + b.v) % 2 === 0) {
            kept++;
            var c = roam(w, b.x + b.fw / 2 + 1, b.y + b.fh + 0.6, 2.2, 0.8, b.id * 1.3, t);
            drawChicken(ctx, c[0], c[1], c[2], Math.floor(t * 2 + b.id) % 3 === 0 ? 1 : 0);
        }
    }
    var dogs = Math.min(4, Math.floor(w.people.length / 14));
    for (i = 0; i < dogs; i++) {
        var d = roam(w, w.centre.x + (i - 1) * 3, w.centre.y + 2, 8, 3, 11 + i * 5.7, t);
        if (!covered(covers, d[0], d[1]))
            drawDog(ctx, d[0], d[1], d[2]);
    }
}

// ---- boats, carts and the traffic of the network --------------------------------------------------------------------------

function drawBoats(ctx, w, lib, env, t) {
    var net = w.sig.net || 0;
    for (var i = 0; i < w.buildings.length; i++) {
        var b = w.buildings[i];
        if (b.type !== "dock" || b.progress < 1 || !b.sail || env.daylight < 0.15)
            continue;
        var r = b.sail;
        // the fisher's boat: out, about, and back, over a hundred seconds
        var phase = (t + b.id * 7) % 100;
        var u = phase < 8 ? phase / 8 : phase < 70 ? 1 : phase < 78 ? 1 - (phase - 70) / 8 : 0;
        if (u > 0) {
            var dist = 1.5 + (r.len - 2) * 0.8 * u;
            var bob = Math.round(Math.sin(t * 1.2 + b.id));
            var bx = (r.x + r.dx * dist) * TILE + 4 - 8, by = (r.y + r.dy * dist) * TILE + 2 + bob;
            if (r.dx < 0)
                A.blitFlipped(ctx, lib.prop.boat, bx, by);
            else
                A.blit(ctx, lib.prop.boat, bx, by);
        }
        // a trading ship comes the more the network is used
        if (net > 0.12 && r.len >= 6) {
            var period = 260 - 200 * net;
            var q = ((t + b.id * 31) % period) / period;
            var v = q < 0.3 ? q / 0.3 : q < 0.6 ? 1 : q < 0.9 ? 1 - (q - 0.6) / 0.3 : 0;
            if (v > 0) {
                var far = r.len + 2;
                var d2 = far - (far - 3) * v;
                var sx = (r.x + r.dx * d2) * TILE + 4, sy = (r.y + r.dy * d2) * TILE + 4;
                drawShip(ctx, sx, sy, Math.round(Math.sin(t * 0.9 + b.id)), r.dx < 0);
            }
        }
    }
}

function drawShip(ctx, x, y, bob, flip) {
    var f = flip ? -1 : 1;
    ctx.fillStyle = "#5a3b22";
    ctx.fillRect(x - 9, y + bob, 18, 3);
    ctx.fillStyle = "#7a5230";
    ctx.fillRect(x - 8 + (flip ? 0 : 0), y + bob - 1, 16, 1);
    ctx.fillStyle = "#3a2a1a";
    ctx.fillRect(x - 6, y + bob + 3, 12, 1);
    ctx.fillStyle = "#6b4a2c";
    ctx.fillRect(x, y + bob - 12, 1, 12);
    ctx.fillStyle = "#efe6d2";
    ctx.fillRect(x + 1, y + bob - 11, 5 * f > 0 ? 5 : 5, 7);
    ctx.fillRect(x - 5, y + bob - 9, 4, 5);
    ctx.fillStyle = "#c0453a";
    ctx.fillRect(x, y + bob - 14, 3, 2);
}

function drawCarts(ctx, w, lib, env, t) {
    var net = w.sig.net || 0;
    var route = w.route;
    if (net < 0.18 || !route || route.length < 6 || env.night)
        return;
    var count = 1 + Math.floor(net * 3);
    for (var i = 0; i < count; i++) {
        var phase = (t * 0.012 * (0.6 + net) + i / count) % 1;
        var u = phase < 0.5 ? phase * 2 : 2 - phase * 2;
        var k = Math.min(route.length - 1, Math.floor(u * (route.length - 1)));
        var p = route[k];
        var x = p.x * TILE + 4 - 8, y = (p.y + 1) * TILE - 11;
        if (phase < 0.5)
            A.blit(ctx, lib.prop.cart, x, y);
        else
            A.blitFlipped(ctx, lib.prop.cart, x, y);
    }
}

// ---- the sky: gulls, butterflies, fireflies, thunder -----------------------------------------------------------------------

function drawSky(ctx, w, env, t) {
    var i;
    var W = w.cols * TILE, H = w.rows * TILE;
    var storm = env.precip > 0.5;
    if (env.daylight > 0.3 && !storm && w.seaCentre && w.seaCentre.y > 0) {
        ctx.fillStyle = "#f4f6f8";
        for (i = 0; i < 4; i++) {
            var gx = w.seaCentre.x * TILE + Math.cos(t * 0.07 + i * 1.9) * W * 0.22;
            var gy = w.seaCentre.y * TILE + Math.sin(t * 0.05 + i * 1.3) * H * 0.1;
            var flap = Math.floor(t * 5 + i) % 2;
            ctx.fillRect(Math.round(gx) - 2, Math.round(gy) - 1 + flap, 2, 1);
            ctx.fillRect(Math.round(gx) + 1, Math.round(gy) - 1 + flap, 2, 1);
            ctx.fillRect(Math.round(gx), Math.round(gy), 1, 1);
        }
    }
    if ((env.season === "spring" || env.season === "summer") && env.daylight > 0.6 && env.precip === 0 && (env.wind || 0) < 0.7) {
        var cols = ["#f4d03a", "#f08ab0", "#fafafa", "#8ac0f0"];
        for (i = 0; i < 7; i++) {
            var bx = w.centre.x * TILE + Math.sin(t * 0.17 + i * 2.7) * 90 + Math.sin(t * 0.7 + i) * 6;
            var by = w.centre.y * TILE + Math.cos(t * 0.13 + i * 1.9) * 50 + Math.cos(t * 0.9 + i) * 4;
            var open = Math.floor(t * 6 + i) % 2;
            ctx.fillStyle = cols[i % cols.length];
            ctx.fillRect(Math.round(bx), Math.round(by), open ? 3 : 1, 1);
        }
    }
    if ((env.season === "summer" || env.season === "autumn") && env.daylight < 0.25 && env.precip === 0) {
        for (i = 0; i < 18; i++) {
            var glow = Math.sin(t * 1.6 + i * 3.1);
            if (glow < 0.15)
                continue;
            var fx = w.centre.x * TILE + (A.hash(i, 3, 3) - 0.5) * W * 0.8 + Math.sin(t * 0.3 + i) * 5;
            var fy = w.centre.y * TILE + (A.hash(i, 4, 4) - 0.5) * H * 0.7 + Math.cos(t * 0.27 + i) * 4;
            ctx.fillStyle = "rgba(220,255,120," + glow.toFixed(2) + ")";
            ctx.fillRect(Math.round(fx), Math.round(fy), 1, 1);
            ctx.fillStyle = "rgba(220,255,120," + (glow * 0.25).toFixed(2) + ")";
            ctx.fillRect(Math.round(fx) - 1, Math.round(fy) - 1, 3, 3);
        }
    }
    if (env.thunder) {
        // a flash and sometimes a bolt, a few times a minute
        var slot = Math.floor(t * 2.5);
        var frac = t * 2.5 - slot;
        if (A.hash(slot, 77, 7) < 0.14 && frac < 0.3) {
            ctx.fillStyle = "rgba(235,240,255," + (0.4 * (1 - frac / 0.3)).toFixed(2) + ")";
            ctx.fillRect(0, 0, W, H);
            if (frac < 0.18) {
                ctx.fillStyle = "#ffffff";
                var x = Math.round(A.hash(slot, 78, 7) * W);
                for (var y = 0; y < H * 0.55; y += 5) {
                    ctx.fillRect(x, y, 2, 5);
                    x += Math.round((A.hash(slot, y, 79) - 0.5) * 8);
                }
            }
        }
    }
}

// ---- storehouse yards, the forge, the mage's tower and music ----------------------------------------------------------------

// What is in store lies about the storehouses: logs, cut stone, hay, and crates for the memory in use
function drawPiles(ctx, w, lib, env) {
    var st = w.stock;
    var pop = w.people.length;
    var logs = Math.min(3, Math.floor(st.wood / 60));
    var stones = Math.min(3, Math.floor(st.stone / 50));
    var hay = Math.min(2, Math.floor(st.food / (pop * 1.2 + 1)));
    var crates = Math.round((w.sig.mem || 0) * 5);
    var seen = 0;
    for (var i = 0; i < w.buildings.length; i++) {
        var b = w.buildings[i];
        if (b.type !== "storehouse" || b.progress < 1)
            continue;
        var base = (b.y + b.fh) * TILE - 1;
        var left = b.x * TILE - 2, right = (b.x + b.fw) * TILE + 2;
        var k;
        // the first storehouse takes the wood and the crates, the next ones the stone and the hay
        if (seen % 2 === 0) {
            for (k = 0; k < logs; k++)
                A.blit(ctx, lib.prop.logs, left - 10 - k * 4, base - 6 - (k % 2) * 3);
            for (k = 0; k < crates; k++)
                A.blit(ctx, lib.prop.crate, right + 1 + (k % 3) * 7, base - 6 - Math.floor(k / 3) * 6);
        } else {
            for (k = 0; k < stones; k++)
                A.blit(ctx, lib.prop.stones, left - 10 - k * 4, base - 6 - (k % 2) * 3);
            for (k = 0; k < hay; k++)
                A.blit(ctx, lib.prop.hay, right + 1 + k * 9, base - 7);
        }
        seen++;
    }
}

// The forge glows while the smith works, and throws sparks the harder the processor works
function drawForge(ctx, w, lib, env, t) {
    var cpu = w.sig.cpu || 0;
    for (var i = 0; i < w.buildings.length; i++) {
        var b = w.buildings[i];
        if (b.progress < 1)
            continue;
        if (b.type === "smithy" && b.busy > 0) {
            var pl = placeBuilding(w, b, lib);
            var fx = pl.x + 4, fy = pl.y + pl.spr.h - 6;
            ctx.fillStyle = "rgba(255,120,40," + (0.5 + 0.3 * Math.sin(t * 9)).toFixed(2) + ")";
            ctx.fillRect(fx, fy, 3, 3);
            if (cpu > 0.1) {
                var n = 2 + Math.floor(cpu * 5);
                for (var k = 0; k < n; k++) {
                    var life = (t * 2.2 + k * 0.37 + b.id) % 1;
                    ctx.fillStyle = life < 0.5 ? "#ffd060" : "#ff8a30";
                    ctx.fillRect(Math.round(fx + 1 + (A.hash(k, Math.floor(t * 2.2 + b.id), 5) - 0.5) * 14 * life), Math.round(fy - life * 9 + life * life * 12), 1, 1);
                }
            }
        }
        if (b.type === "magetower") {
            var gpu = w.sig.gpu || 0;
            if (gpu > 0.2) {
                var pm = placeBuilding(w, b, lib);
                var spr = pm.spr;
                var cx = pm.x + (spr.crystal ? spr.crystal.x : 9), cy = pm.y + (spr.crystal ? spr.crystal.y : 6);
                // arcs of light jump from the crystal, more of them and longer the harder the graphics card works
                var slot = Math.floor(t * 7);
                var arcs = 1 + Math.floor(gpu * 4);
                for (var a = 0; a < arcs; a++) {
                    var ang = A.hash(slot, a, 12) * Math.PI * 2;
                    var len = 4 + Math.floor(gpu * 8);
                    var x = cx, y = cy;
                    ctx.fillStyle = "rgba(170,225,255,0.9)";
                    for (var s = 0; s < len; s++) {
                        x += Math.cos(ang + (A.hash(slot, a * 9 + s, 13) - 0.5) * 1.4);
                        y += Math.sin(ang + (A.hash(slot, a * 9 + s, 14) - 0.5) * 1.4);
                        ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
                    }
                }
            }
        }
    }
}

// Notes rise from the tavern and the square while something is playing
function drawMusic(ctx, w, lib, env, t) {
    if (!w.sig.audio || env.night)
        return;
    var spots = [{
            x: w.centre.x * TILE + 4,
            y: w.centre.y * TILE - 2
        }];
    for (var i = 0; i < w.buildings.length; i++)
        if (w.buildings[i].type === "tavern" && w.buildings[i].progress >= 1)
            spots.push({
                x: w.buildings[i].door.x * TILE + 4,
                y: w.buildings[i].door.y * TILE - 6
            });
    var hues = ["#f4d03a", "#f08ab0", "#8ac0f0", "#9ae08a"];
    for (var s = 0; s < spots.length; s++)
        for (var k = 0; k < 4; k++) {
            var life = (t * 0.45 + k * 0.25 + s * 0.13) % 1;
            var x = Math.round(spots[s].x + Math.sin(life * 6 + k * 2) * 4 + (k - 1.5) * 4);
            var y = Math.round(spots[s].y - life * 20);
            ctx.fillStyle = "rgba(" + (k % 2 ? "250,240,200" : "255,210,230") + "," + (1 - life).toFixed(2) + ")";
            ctx.fillRect(x, y + 2, 2, 2);
            ctx.fillRect(x + 1, y - 1, 1, 3);
            ctx.fillStyle = hues[k];
            ctx.fillRect(x, y + 2, 1, 1);
        }
}

// A pigeon for every notification: in from the edge, a rest at the town hall, away on the other side
function drawPigeons(ctx, w, env) {
    var W = w.cols * TILE;
    var hall = null;
    for (var i = 0; i < w.buildings.length; i++)
        if (w.buildings[i].type === "townhall" && w.buildings[i].progress >= 1)
            hall = w.buildings[i];
    var tx = (hall ? hall.door.x : w.centre.x) * TILE + 4, ty = (hall ? hall.door.y : w.centre.y + 1) * TILE - 1;
    for (var k = 0; k < w.fx.length; k++) {
        var f = w.fx[k];
        var age = (w.time - f.t0) / 1000;
        var x, y, perch = false;
        var sx = f.side ? W + 6 : -6;
        if (age < 8) {
            var u = age / 8;
            x = sx + (tx - sx) * u;
            y = ty - 40 * (1 - u) * (1 - u) - Math.sin(u * 3) * 4;
        } else if (age < 14) {
            x = tx + (k % 2 ? 6 : -6);
            y = ty;
            perch = true;
        } else {
            var o = (age - 14) / 6;
            x = tx + (f.side ? -1 : 1) * (W * 0.6) * o;
            y = ty - 50 * o;
        }
        x = Math.round(x);
        y = Math.round(y);
        ctx.fillStyle = "#c6cad6";
        ctx.fillRect(x - 1, y - 2, 3, 2);
        ctx.fillStyle = "#8a90a4";
        ctx.fillRect(x + 2, y - 3, 1, 1);
        if (!perch) {
            var flap = Math.floor(age * 8) % 2;
            ctx.fillStyle = "#e6e8f0";
            ctx.fillRect(x - 2, y - 3 - flap, 2, 1);
            ctx.fillRect(x + 1, y - 3 - flap, 2, 1);
        } else {
            ctx.fillStyle = "#e6e8f0";
            ctx.fillRect(x, y - 3, 1, 1);
        }
    }
}
