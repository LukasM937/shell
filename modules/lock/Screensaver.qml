pragma ComponentBehavior: Bound

import QtQuick
import Caelestia.Config
import qs.components
import qs.services

// The world of EcoWorld as flat coloured cells, cover-fitted on the screen, with the newest event drifting along the bottom.
// The canvas is only cols x rows cells of CELL pixels, as in the prototype, so its animal sizes carry over unchanged, and is
// scaled up without smoothing. That keeps the 15 fps repaint cheap on any screen size. Biome colours are natural colours,
// not the shell's scheme colours, so the world looks the same whatever the wallpaper.
Item {
    id: root

    required property var eco

    // Colours are looked up by cell code: the terrain type (3 and 5 are replaced by the shaded codes), forest with berries,
    // then the grass and desert shades. Shading is in LEVELS steps, a smooth field then merges into long runs per row
    readonly property int cell: 8
    readonly property int levels: 16
    readonly property int berries: 8
    readonly property int grass: 9
    readonly property int desert: 9 + levels
    readonly property var colours: buildColours()
    readonly property var sheepColours: buildSheepColours()

    readonly property var world: eco.world
    readonly property int cols: world?.cols ?? 0
    readonly property int rows: world?.rows ?? 0
    // Screen pixels per cell
    readonly property real size: cols > 0 ? Math.max(width / cols, height / rows) : 0
    readonly property string lastEvent: {
        const list = eco.events ?? [];
        return list.length > 0 ? list[list.length - 1].text : "";
    }

    // The tick on screen, and where the event line is on its way across (0 to 1)
    property int painted: -1
    property real drift

    function buildColours(): var {
        const out = ["#1d4e89", "#2f7fc1", "#e3d39a", "", "#2e7a3d", "", "#3a3330", "#ff7a2a", "#2e7a3d"];
        for (let i = 0; i < levels; i++)
            out.push(`rgb(${Math.round(190 - i / (levels - 1) * 80)},180,80)`);
        for (let i = 0; i < levels; i++) {
            const k = i / (levels - 1);
            out.push(`rgb(${Math.round(150 + k * 51)},${Math.round(90 + k * 53)},${Math.round(44 + k * 30)})`);
        }
        return out;
    }

    // Eight shades from white to the hardiest sheep, as in the prototype
    function buildSheepColours(): var {
        const out = [];
        for (let i = 0; i < 8; i++)
            out.push(`rgb(255,${Math.round(255 - i / 7 * 90)},${Math.round(255 - i / 7 * 170)})`);
        return out;
    }

    function fillRun(ctx: var, code: int, row: int, from: int, to: int): void {
        ctx.fillStyle = colours[code];
        ctx.fillRect(from * cell, row * cell, (to - from) * cell, cell);
        if (code !== berries)
            return;
        // A red dot in each cell, nudged by position so the grove does not look like a grid
        ctx.fillStyle = "#d6334a";
        for (let i = from; i < to; i++)
            ctx.fillRect(i * cell + 2 + (i * 5 + row * 3) % 4, row * cell + 2 + (i * 3 + row * 7) % 4, 2, 2);
    }

    // Squares of size px centred on each animal (in cells), px being odd
    function squares(ctx: var, list: var, px: int): void {
        const o = (px - 1) / 2;
        for (let i = 0; i < list.length; i++)
            ctx.fillRect(Math.round(list[i].x * cell - o), Math.round(list[i].y * cell - o), px, px);
    }

    function paint(ctx: var): void {
        const w = world;
        if (!w)
            return;
        const type = w.type;
        const bio = w.bio;
        const fert = w.fert;
        const cols = w.cols;
        // Read once: this loop runs for every cell, 15 times a second
        const maxLevel = levels - 1;
        const grassBase = grass;
        const desertBase = desert;
        const berryCode = berries;

        // Every cell is drawn, so there is nothing to clear
        for (let j = 0; j < w.rows; j++) {
            let start = 0;
            let code = -1;
            for (let i = 0; i <= cols; i++) {
                let next = -1;
                if (i < cols) {
                    const p = j * cols + i;
                    const t = type[p];
                    if (t === 3)
                        next = grassBase + Math.max(0, Math.min(maxLevel, Math.round(bio[p] * maxLevel)));
                    else if (t === 5)
                        next = desertBase + Math.max(0, Math.min(maxLevel, Math.round(fert[p] * 2 * maxLevel)));
                    else
                        next = t === 4 && bio[p] > 0.4 ? berryCode : t;
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

        const animals = w.animals;
        ctx.fillStyle = "#9fe8ff";
        squares(ctx, animals.fish, 3);

        // Hardier sheep are pinker
        const sheep = animals.sheep;
        let shade = -1;
        for (let i = 0; i < sheep.length; i++) {
            const s = Math.max(0, Math.min(7, Math.round(sheep[i].h * 7)));
            if (s !== shade) {
                shade = s;
                ctx.fillStyle = sheepColours[s];
            }
            ctx.fillRect(Math.round(sheep[i].x * cell - 2), Math.round(sheep[i].y * cell - 2), 5, 5);
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

    clip: true

    onVisibleChanged: {
        if (visible)
            canvas.requestPaint();
    }
    onWorldChanged: {
        painted = -1;
        canvas.requestPaint();
    }

    Canvas {
        id: canvas

        // Scaled from the corner, then centred, so the grid covers the screen and the edges are cropped
        x: (root.width - root.cols * root.size) / 2
        y: (root.height - root.rows * root.size) / 2
        width: root.cols * root.cell
        height: root.rows * root.cell
        scale: root.size / root.cell
        transformOrigin: Item.TopLeft
        smooth: false

        onPaint: root.paint(getContext("2d"))
        onWidthChanged: requestPaint()
        onHeightChanged: requestPaint()
    }

    // The world is a plain object stepped by EcoWorld's timer, so nothing signals a new tick: look for one twice per
    // step and paint only then
    Timer {
        interval: 33
        running: root.visible && root.eco.running && !!root.world && !StayActive.screenAsleep
        repeat: true
        onTriggered: {
            if (root.world.tick === root.painted)
                return;
            root.painted = root.world.tick;
            // Moves the event line a few pixels a minute, so no pixel stays lit for hours
            root.drift = (Date.now() % 300000) / 300000;
            canvas.requestPaint();
        }
    }

    StyledRect {
        id: eventLine

        x: Math.round(-width + root.drift * (root.width + width))
        y: root.height - height - Tokens.padding.large * 2
        implicitWidth: logText.implicitWidth + Tokens.padding.medium * 2
        implicitHeight: logText.implicitHeight + Tokens.padding.small * 2

        visible: GlobalConfig.lock.screensaver.eventLog && root.lastEvent !== ""
        color: Qt.alpha(Colours.palette.m3surface, 0.6)
        radius: Tokens.rounding.medium
        opacity: 0.75

        StyledText {
            id: logText

            anchors.centerIn: parent
            text: root.lastEvent
            color: Colours.palette.m3onSurface
            font: Tokens.font.body.small
        }
    }
}
