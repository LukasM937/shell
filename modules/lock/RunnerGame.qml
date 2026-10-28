pragma ComponentBehavior: Bound

import QtQuick
import Caelestia.Config
import Caelestia.I18n
import qs.components
import qs.services

// A small endless runner for the empty notification dock: a penguin on ice or a dragon in a cave.
// ↑ jumps, ↓ ducks (or dives mid-air), ← → step back and forth. Before a run, ← → pick the character.
// It only ever gets the arrow keys, which the password field ignores.
Item {
    id: root

    required property var lock

    // Everything is drawn on a grid of art pixels this many screen pixels wide
    readonly property int px: Math.max(2, Math.floor(height / 64))
    readonly property real worldWidth: width / px
    readonly property real groundY: height / px - 7

    property string phase: "idle" // idle, running or over
    property real overTime
    property real distance
    readonly property int score: Math.floor(distance / 10)

    // Runner: x is its left edge, y its height above the ground
    property real runnerX: 10
    property real runnerY
    property real velocity
    property bool ducking
    property int stepDir
    property bool leftHeld
    property bool rightHeld
    property real time

    // Obstacles: { kind, x, y (top edge), w, h }
    property var obstacles: []
    property real nextGap
    property real seed

    readonly property real speed: 62 // art pixels per second, the same all run
    readonly property real gravity: 430
    readonly property real jumpVelocity: 150
    readonly property real stepSpeed: 40

    readonly property var sprites: ({
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
            snowman: ["...HHH...", "...HHH...", "..HHHHH..", "...SSS...", "..SKSKS..", "..SSOSS..", "...SSS...", "..SSSSS..", ".SSSKSSS.", "SSSSSSSSS", "SSSSKSSSS", "SSSSSSSSS", ".SSSSSSS.", "..SSSSS.."]
        })

    // Best score and character live on the session lock, so they last from one lock to the next
    readonly property var session: lock.lock
    readonly property string world: session.runnerCharacter === 0 ? "penguin" : "dragon"

    // Arrow keys from the password field. Returns whether the key was used
    function handleKey(event: var, pressed: bool): bool {
        const key = event.key;
        if (![Qt.Key_Up, Qt.Key_Down, Qt.Key_Left, Qt.Key_Right].includes(key))
            return false;
        if (event.isAutoRepeat)
            return true;

        if (key === Qt.Key_Left)
            leftHeld = pressed;
        else if (key === Qt.Key_Right)
            rightHeld = pressed;
        stepDir = (rightHeld ? 1 : 0) - (leftHeld ? 1 : 0);

        if (phase !== "running") {
            if (pressed && (key === Qt.Key_Left || key === Qt.Key_Right)) {
                session.runnerCharacter = 1 - session.runnerCharacter;
                obstacles = [];
            } else if (pressed && key === Qt.Key_Up && (phase === "idle" || time - overTime > 0.5)) {
                // The short pause after a crash keeps a panicked jump from restarting right away
                start();
            }
        } else if (key === Qt.Key_Down) {
            ducking = pressed;
        } else if (key === Qt.Key_Up && pressed && runnerY === 0) {
            velocity = jumpVelocity;
            runnerY = 0.01;
        }
        canvas.requestPaint();
        return true;
    }

    // mulberry32, seeded per run so every run gets its own map
    function random(): real {
        seed = (seed + 0x6D2B79F5) >>> 0;
        let t = seed;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    function start(): void {
        seed = Date.now() >>> 0;
        obstacles = [];
        distance = 0;
        nextGap = worldWidth * 0.6;
        runnerX = 10;
        runnerY = 0.01; // Starts with a hop
        velocity = jumpVelocity;
        ducking = false;
        phase = "running";
    }

    function spriteSize(): var {
        const s = sprites[world];
        const rows = ducking && runnerY === 0 ? s.duck : s.run[0];
        return {
            w: rows[0].length,
            h: rows.length
        };
    }

    // Spawns the next obstacle or pattern. Gaps leave time to land and react, and shrink as the run goes on
    function spawn(): void {
        const difficulty = Math.min(1, distance / 3000);
        const x = worldWidth + 2;
        const roll = random();
        const ice = world === "penguin";

        if (roll < 0.12 + 0.2 * difficulty) {
            // A ledge to duck under: jumping hits it too
            const w = 12 + Math.floor(random() * 9);
            obstacles.push({
                kind: "ledge",
                x,
                y: groundY - 30,
                w,
                h: 19
            });
        } else if (roll < 0.22 + 0.32 * difficulty) {
            obstacles.push({
                kind: "flyer",
                x,
                y: groundY - 15,
                w: 9,
                h: 4
            });
        } else if (roll < 0.32 + 0.38 * difficulty) {
            // Two low ones in a row
            const h = 5 + Math.floor(random() * 3);
            obstacles.push({
                kind: ice ? "block" : "rock",
                x,
                y: groundY - h,
                w: 7,
                h
            }, {
                kind: ice ? "block" : "rock",
                x: x + 8,
                y: groundY - h - 1,
                w: 8,
                h: h + 1
            });
        } else if (roll < 0.55) {
            if (ice) {
                obstacles.push({
                    kind: "snowman",
                    x,
                    y: groundY - 14,
                    w: 9,
                    h: 14
                });
            } else {
                const h = 12 + Math.floor(random() * 4);
                obstacles.push({
                    kind: "pillar",
                    x,
                    y: groundY - h,
                    w: 5,
                    h
                });
            }
        } else {
            const w = 6 + 2 * Math.floor(random() * 3);
            const h = 6 + 2 * Math.floor(random() * 3);
            obstacles.push({
                kind: ice ? "block" : "rock",
                x,
                y: groundY - h,
                w,
                h
            });
        }

        const minGap = 52 - 12 * difficulty;
        const maxGap = 110 - 40 * difficulty;
        nextGap = minGap + random() * (maxGap - minGap) + obstacles[obstacles.length - 1].w;
    }

    function step(dt: real): void {
        dt = Math.min(dt, 0.05);
        time += dt;
        if (phase !== "running")
            return;

        distance += speed * dt;
        runnerX = Math.max(2, Math.min(worldWidth * 0.6, runnerX + stepDir * stepSpeed * dt));

        if (runnerY > 0 || velocity > 0) {
            velocity -= gravity * (ducking ? 3 : 1) * dt;
            runnerY = Math.max(0, runnerY + velocity * dt);
            if (runnerY === 0)
                velocity = 0;
        }

        for (const o of obstacles)
            o.x -= speed * dt;
        obstacles = obstacles.filter(o => o.x + o.w > -4);

        nextGap -= speed * dt;
        if (nextGap <= 0)
            spawn();

        // Forgiving hitbox, a little inside the sprite and clear of the tail
        const size = spriteSize();
        const left = runnerX + Math.round(size.w / 4);
        const right = runnerX + size.w - 3;
        const bottom = groundY - runnerY;
        const top = bottom - size.h + 2;
        for (const o of obstacles) {
            if (right > o.x + 1 && left < o.x + o.w - 1 && bottom > o.y + 1 && top < o.y + o.h) {
                session.runnerBest = Math.max(session.runnerBest, score);
                overTime = time;
                phase = "over";
                break;
            }
        }
    }

    function drawSprite(ctx: var, rows: var, x: real, y: real, colours: var): void {
        const bx = Math.round(x);
        const by = Math.round(y);
        for (let r = 0; r < rows.length; r++) {
            const row = rows[r];
            let start = 0;
            while (start < row.length) {
                const ch = row[start];
                let end = start + 1;
                while (end < row.length && row[end] === ch)
                    end++;
                if (ch !== ".") {
                    ctx.fillStyle = colours[ch];
                    ctx.fillRect((bx + start) * px, (by + r) * px, (end - start) * px, px);
                }
                start = end;
            }
        }
    }

    function rect(ctx: var, colour: var, x: real, y: real, w: real, h: real): void {
        ctx.fillStyle = colour;
        ctx.fillRect(Math.round(x) * px, Math.round(y) * px, Math.round(w) * px, Math.round(h) * px);
    }

    // A filled box with a one pixel outline, optionally with the top corners cut off
    function box(ctx: var, fill: var, edge: var, x: real, y: real, w: real, h: real, round: bool): void {
        rect(ctx, fill, x + 1, y + 1, w - 2, h - 2);
        rect(ctx, edge, round ? x + 1 : x, y, round ? w - 2 : w, 1);
        rect(ctx, edge, x, y + 1, 1, h - 1);
        rect(ctx, edge, x + w - 1, y + 1, 1, h - 1);
        rect(ctx, edge, x + 1, y + h - 1, w - 2, 1);
    }

    function paint(ctx: var): void {
        const pal = Colours.palette;
        const ice = world === "penguin";
        const colours = {
            B: pal.m3primary,
            W: pal.m3onSurface,
            K: pal.m3surface,
            O: "#f0a25a",
            G: pal.m3tertiary,
            Y: pal.m3onSurface,
            R: pal.m3primary,
            F: "#f07a5a",
            S: ice ? pal.m3onSurface : pal.m3secondary,
            H: pal.m3outline
        };
        const edge = ice ? pal.m3primary : pal.m3outline;
        const solid = Qt.alpha(edge, 0.3);

        ctx.clearRect(0, 0, width, height);

        // Drifting snow or embers, behind everything
        for (let i = 0; i < 14; i++) {
            const fx = ((i * 37.3 + 13) % worldWidth - time * (ice ? 6 : 10) * (1 + i % 3) + worldWidth * 10) % worldWidth;
            const fy = ((i * 23.9) % groundY + time * (ice ? 7 : -9) * (1 + i % 2) + groundY * 10) % groundY;
            ctx.globalAlpha = 0.25 + (i % 3) * 0.1;
            rect(ctx, ice ? pal.m3onSurface : "#f07a5a", fx, fy, 1, 1);
        }
        ctx.globalAlpha = 1;

        // Ground, with pebbles scrolling past
        rect(ctx, pal.m3outlineVariant, 0, groundY, worldWidth + 1, 1);
        for (let i = 0; i < 18; i++) {
            const gx = ((i * 41.7) % (worldWidth + 20) - distance + (worldWidth + 20) * 1000) % (worldWidth + 20) - 10;
            rect(ctx, pal.m3outlineVariant, gx, groundY + 2 + (i * 7) % 4, 1 + i % 3, 1);
        }

        for (const o of obstacles) {
            if (o.kind === "block") {
                box(ctx, solid, edge, o.x, o.y, o.w, o.h, false);
                rect(ctx, pal.m3onSurface, o.x + 1, o.y + 1, 2, 1);
            } else if (o.kind === "rock") {
                box(ctx, solid, edge, o.x, o.y, o.w, o.h, true);
                rect(ctx, edge, o.x + 2, o.y + 2, 2, 1);
            } else if (o.kind === "pillar") {
                box(ctx, solid, edge, o.x, o.y + 2, o.w, o.h - 2, false);
                const flicker = Math.floor(time * 8) % 2;
                rect(ctx, "#f07a5a", o.x + 1, o.y + flicker, o.w - 2, 2);
                rect(ctx, "#f0a25a", o.x + 2, o.y - 1 + flicker, 1, 1);
            } else if (o.kind === "ledge") {
                box(ctx, solid, edge, o.x, o.y, o.w, 5, false);
                // Icicles or stalactites down to just above a ducking head
                for (let s = 0; s < o.w - 1; s += 3) {
                    const len = o.h - 5 - (s / 3) % 3;
                    for (let d = 0; d < len; d++)
                        rect(ctx, d < len - 2 ? edge : solid, o.x + s + (d > len / 2 ? 1 : 0), o.y + 5 + d, d > len / 2 ? 1 : 2, 1);
                }
            } else if (o.kind === "flyer") {
                drawSprite(ctx, sprites.flyer[Math.floor(time * 6) % 2], o.x, o.y, Object.assign({}, colours, {
                    O: ice ? "#f0a25a" : "#f07a5a"
                }));
            } else if (o.kind === "snowman") {
                drawSprite(ctx, sprites.snowman, o.x, o.y, colours);
            }
        }

        const s = sprites[world];
        let rows = s.run[Math.floor(time * 10) % 2];
        if (phase === "idle")
            rows = s.run[0];
        else if (ducking && runnerY === 0)
            rows = s.duck;
        else if (runnerY > 0)
            rows = s.jump;
        ctx.globalAlpha = phase === "over" && time - overTime < 2 && Math.floor(time * 4) % 2 ? 0.4 : 1;
        drawSprite(ctx, rows, runnerX, groundY - runnerY - rows.length, colours);
        ctx.globalAlpha = 1;
    }

    Component.onCompleted: lock.runnerGame = root
    Component.onDestruction: {
        if (lock.runnerGame === root)
            lock.runnerGame = null;
    }

    onWorldChanged: canvas.requestPaint()
    onWidthChanged: canvas.requestPaint()
    onHeightChanged: canvas.requestPaint()

    Canvas {
        id: canvas

        anchors.fill: parent
        onPaint: root.paint(getContext("2d"))
    }

    FrameAnimation {
        // Stops a little after a crash, so a lock screen left alone doesn't keep redrawing
        running: root.visible && !root.lock.unlocking && (root.phase === "running" || (root.phase === "over" && root.time - root.overTime < 2))
        onTriggered: {
            root.step(frameTime);
            canvas.requestPaint();
        }
    }

    StyledText {
        anchors.top: parent.top
        anchors.right: parent.right
        visible: root.phase !== "idle"
        text: {
            const pad = n => String(n).padStart(5, "0");
            // TRANSLATORS: lock screen game score, %1 = best score, %2 = current score
            return root.session.runnerBest > 0 ? Tr.tr("HI %1  %2").arg(pad(root.session.runnerBest)).arg(pad(root.score)) : pad(root.score);
        }
        color: Colours.palette.m3outline
        font: Tokens.font.mono.builders.small.weight(Font.Medium).build()
    }

    StyledText {
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.topMargin: root.height * 0.2
        visible: root.phase !== "running"
        horizontalAlignment: Text.AlignHCenter
        wrapMode: Text.WordWrap
        text: {
            const run = root.phase === "over" ? Tr.tr("Ouch! ↑ to run again") : Tr.tr("↑ to run");
            const other = root.world === "penguin" ? Tr.tr("← → for the dragon") : Tr.tr("← → for the penguin");
            return `${run}\n${other}`;
        }
        color: Colours.palette.m3outline
        font: Tokens.font.mono.builders.small.weight(Font.Medium).build()
    }
}
