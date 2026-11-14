.pragma library

// Draws an ecosystem world (modules/lock/ecosystem.js) as flat coloured cells on a canvas context that needs only fillStyle
// and fillRect, so the lock screen's screensaver, the desktop wallpaper and the wallpaper's poster (modules/live/vposter.js)
// all draw it the same way. The colours are natural colours, not the shell's scheme colours.

var CELL = 8;
var LEVELS = 16;
var BERRIES = 8;
var GRASS = 9;
var DESERT = 9 + LEVELS;

// Colours are looked up by cell code: the terrain type (3 and 5 are replaced by the shaded codes), forest with berries, then
// the grass and desert shades. Shading is in LEVELS steps, a smooth field then merges into long runs per row
function buildColours() {
    var out = ["#1d4e89", "#2f7fc1", "#e3d39a", "", "#2e7a3d", "", "#3a3330", "#ff7a2a", "#2e7a3d"];
    for (var i = 0; i < LEVELS; i++)
        out.push("rgb(" + Math.round(190 - i / (LEVELS - 1) * 80) + ",180,80)");
    for (var j = 0; j < LEVELS; j++) {
        var k = j / (LEVELS - 1);
        out.push("rgb(" + Math.round(150 + k * 51) + "," + Math.round(90 + k * 53) + "," + Math.round(44 + k * 30) + ")");
    }
    return out;
}

// Eight shades from white to the hardiest sheep
function buildSheepColours() {
    var out = [];
    for (var i = 0; i < 8; i++)
        out.push("rgb(255," + Math.round(255 - i / 7 * 90) + "," + Math.round(255 - i / 7 * 170) + ")");
    return out;
}

var COLOURS = buildColours();
var SHEEP = buildSheepColours();

function fillRun(ctx, code, row, from, to) {
    ctx.fillStyle = COLOURS[code];
    ctx.fillRect(from * CELL, row * CELL, (to - from) * CELL, CELL);
    if (code !== BERRIES)
        return;
    // A red dot in each cell, nudged by position so the grove does not look like a grid
    ctx.fillStyle = "#d6334a";
    for (var i = from; i < to; i++)
        ctx.fillRect(i * CELL + 2 + (i * 5 + row * 3) % 4, row * CELL + 2 + (i * 3 + row * 7) % 4, 2, 2);
}

// Squares of size px centred on each animal (in cells), px being odd
function squares(ctx, list, px) {
    var o = (px - 1) / 2;
    for (var i = 0; i < list.length; i++)
        ctx.fillRect(Math.round(list[i].x * CELL - o), Math.round(list[i].y * CELL - o), px, px);
}

// Paints the whole world; every cell is drawn, so there is nothing to clear
function paint(ctx, w) {
    if (!w)
        return;
    var type = w.type;
    var bio = w.bio;
    var fert = w.fert;
    var cols = w.cols;
    var maxLevel = LEVELS - 1;
    for (var j = 0; j < w.rows; j++) {
        var start = 0;
        var code = -1;
        for (var i = 0; i <= cols; i++) {
            var next = -1;
            if (i < cols) {
                var p = j * cols + i;
                var t = type[p];
                if (t === 3)
                    next = GRASS + Math.max(0, Math.min(maxLevel, Math.round(bio[p] * maxLevel)));
                else if (t === 5)
                    next = DESERT + Math.max(0, Math.min(maxLevel, Math.round(fert[p] * 2 * maxLevel)));
                else
                    next = t === 4 && bio[p] > 0.4 ? BERRIES : t;
            }
            if (next !== code) {
                if (code >= 0)
                    fillRun(ctx, code, j, start, i);
                start = i;
                code = next;
            }
        }
    }

    // Springs, a white centre in a cyan square
    ctx.fillStyle = "#7fe7ff";
    squares(ctx, w.springs, 7);
    ctx.fillStyle = "#ffffff";
    squares(ctx, w.springs, 3);

    var animals = w.animals;
    ctx.fillStyle = "#9fe8ff";
    squares(ctx, animals.fish, 3);

    // Hardier sheep are pinker
    var sheep = animals.sheep;
    var shade = -1;
    for (var s = 0; s < sheep.length; s++) {
        var sh = Math.max(0, Math.min(7, Math.round(sheep[s].h * 7)));
        if (sh !== shade) {
            shade = sh;
            ctx.fillStyle = SHEEP[sh];
        }
        ctx.fillRect(Math.round(sheep[s].x * CELL - 2), Math.round(sheep[s].y * CELL - 2), 5, 5);
    }

    ctx.fillStyle = "#d0b3ff";
    squares(ctx, animals.bird, 3);
    ctx.fillStyle = "#ff6b6b";
    squares(ctx, animals.shark, 7);
    ctx.fillStyle = "#ff3b3b";
    squares(ctx, animals.wolf, 7);
    ctx.fillStyle = "#ffc15c";
    squares(ctx, animals.hawk, 7);
}
