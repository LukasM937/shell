pragma ComponentBehavior: Bound

import "runner.js" as Runner
import QtQuick
import Caelestia.Config
import Caelestia.I18n
import qs.components
import qs.services

// A small endless runner for the empty notification dock: a penguin on ice or a dragon in a cave.
// ↑ jumps, ↓ ducks (or dives mid-air), ← steps back, → steps forward (the dragon breathes fire instead).
// Raised sections can be jumped onto. Before a run, ← → pick the character.
// It only ever gets the arrow keys, which the password field ignores. The rules are in runner.js.
Item {
    id: root

    required property var lock

    // Everything is drawn on a grid of art pixels this many screen pixels wide
    readonly property int px: Math.max(2, Math.floor(height / 64))
    readonly property real worldWidth: width / px
    readonly property real groundY: height / px - 7

    // Best score and character live on the session lock, so they last from one lock to the next
    readonly property var session: lock.lock

    // The game itself is a plain object owned by runner.js. These mirror what the text and the animation depend on
    property var game
    property string phase: "idle"
    property string world: "penguin"
    property int score
    property bool animating

    // Arrow keys from the password field. Returns whether the key was used
    function handleKey(event: var, pressed: bool): bool {
        const name = keyName(event.key);
        if (!name)
            return false;
        if (event.isAutoRepeat)
            return true;

        Runner.key(game, name, pressed, Date.now());
        sync();
        canvas.requestPaint();
        return true;
    }

    function keyName(key: int): string {
        switch (key) {
        case Qt.Key_Up:
            return "up";
        case Qt.Key_Down:
            return "down";
        case Qt.Key_Left:
            return "left";
        case Qt.Key_Right:
            return "right";
        default:
            return "";
        }
    }

    function sync(): void {
        if (game.phase === "over" && phase !== "over")
            session.runnerBest = Math.max(session.runnerBest, Runner.score(game));
        phase = game.phase;
        world = game.world;
        score = Runner.score(game);
        session.runnerCharacter = world === "penguin" ? 0 : 1;
        // Stops a little after a crash, so a lock screen left alone doesn't keep redrawing
        animating = phase === "running" || (phase === "over" && game.time - game.overTime < 2);
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
        const ice = game.world === "penguin";
        const time = game.time;
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
            const gx = ((i * 41.7) % (worldWidth + 20) - game.distance + (worldWidth + 20) * 1000) % (worldWidth + 20) - 10;
            rect(ctx, pal.m3outlineVariant, gx, groundY + 2 + (i * 7) % 4, 1 + i % 3, 1);
        }

        for (const o of game.obstacles) {
            const y = groundY - o.hi;
            const h = o.hi - o.lo;
            if (o.kind === "block") {
                box(ctx, solid, edge, o.x, y, o.w, h, false);
                rect(ctx, pal.m3onSurface, o.x + 1, y + 1, 2, 1);
            } else if (o.kind === "rock") {
                box(ctx, solid, edge, o.x, y, o.w, h, true);
                rect(ctx, edge, o.x + 2, y + 2, 2, 1);
            } else if (o.kind === "pillar") {
                box(ctx, solid, edge, o.x, y + 2, o.w, h - 2, false);
                const flicker = Math.floor(time * 8) % 2;
                rect(ctx, "#f07a5a", o.x + 1, y + flicker, o.w - 2, 2);
                rect(ctx, "#f0a25a", o.x + 2, y - 1 + flicker, 1, 1);
            } else if (o.kind === "platform") {
                // Down to the ground, with a cap of snow or stone and a few cracks
                box(ctx, solid, edge, o.x, y, o.w, h + 1, false);
                rect(ctx, ice ? pal.m3onSurface : pal.m3secondary, o.x + 1, y + 1, o.w - 2, 1);
                for (let c = 5; c < o.w - 3; c += 7)
                    rect(ctx, edge, o.x + c, y + 3 + (c % 3), 1, Math.max(1, Math.min(4, h - 6)));
            } else if (o.kind === "ledge") {
                box(ctx, solid, edge, o.x, y, o.w, 5, false);
                // Icicles or stalactites down to just above a ducking head
                for (let s = 0; s < o.w - 1; s += 3) {
                    const len = h - 5 - (s / 3) % 3;
                    for (let d = 0; d < len; d++)
                        rect(ctx, d < len - 2 ? edge : solid, o.x + s + (d > len / 2 ? 1 : 0), y + 5 + d, d > len / 2 ? 1 : 2, 1);
                }
            } else if (o.kind === "flyer") {
                drawSprite(ctx, Runner.SPRITES.flyer[Math.floor(time * 6) % 2], o.x, y, Object.assign({}, colours, {
                    O: ice ? "#f0a25a" : "#f07a5a"
                }));
            } else if (o.kind === "snowman") {
                drawSprite(ctx, Runner.SPRITES.snowman, o.x, y, colours);
            } else if (o.kind === "gem") {
                drawSprite(ctx, Runner.SPRITES.gem, o.x, y + Math.round(Math.sin(time * 5)), {
                    G: ice ? pal.m3tertiary : "#f0c25a"
                });
            }
        }

        const sprites = Runner.SPRITES[game.world];
        let rows = sprites.run[Math.floor(time * 10) % 2];
        if (phase === "idle")
            rows = sprites.run[0];
        else if (game.ducking && game.grounded)
            rows = sprites.duck;
        else if (!game.grounded)
            rows = sprites.jump;
        ctx.globalAlpha = phase === "over" && time - game.overTime < 2 && Math.floor(time * 4) % 2 ? 0.4 : 1;
        drawSprite(ctx, rows, game.x, groundY - game.y - rows.length, colours);
        ctx.globalAlpha = 1;

        // Fire, with a flickering tail, and the puffs where something burnt up
        const flame = Runner.SPRITES.flame[Math.floor(time * 20) % 2];
        for (const f of game.flames)
            drawSprite(ctx, flame, f.x, groundY - f.y - Runner.FLAME.h, {
                R: "#d4503a",
                F: "#f07a5a",
                O: "#f0a25a",
                Y: "#ffe08a"
            });
        for (const p of game.puffs) {
            const spread = 1 + p.t * 14;
            ctx.globalAlpha = 1 - p.t / 0.35;
            for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1.4], [0, 1.4], [-1.4, 0], [1.4, 0]])
                rect(ctx, "#f0a25a", p.x + dx * spread, groundY - p.y + dy * spread, 1, 1);
        }
        ctx.globalAlpha = 1;
    }

    Component.onCompleted: {
        game = Runner.create(session.runnerCharacter === 0 ? "penguin" : "dragon", worldWidth);
        sync();
        lock.runnerGame = root;
    }
    Component.onDestruction: {
        if (lock.runnerGame === root)
            lock.runnerGame = null;
    }

    onWidthChanged: {
        if (game)
            game.worldWidth = worldWidth;
        canvas.requestPaint();
    }
    onHeightChanged: canvas.requestPaint()

    Canvas {
        id: canvas

        anchors.fill: parent
        onPaint: {
            if (root.game)
                root.paint(getContext("2d"));
        }
    }

    FrameAnimation {
        running: root.visible && !root.lock.unlocking && root.animating
        onTriggered: {
            Runner.step(root.game, frameTime);
            root.sync();
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
            const fire = Tr.tr("→ breathes fire");
            return root.world === "dragon" ? `${run}\n${other}\n${fire}` : `${run}\n${other}`;
        }
        color: Colours.palette.m3outline
        font: Tokens.font.mono.builders.small.weight(Font.Medium).build()
    }
}
