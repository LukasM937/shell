pragma ComponentBehavior: Bound

import "ecodraw.js" as Draw
import QtQuick
import qs.services

// The world of EcoWorld as flat coloured cells, cover-fitted on the item. The canvas is only cols x rows cells of CELL pixels,
// as in the prototype, so its animal sizes carry over unchanged, and is scaled up without smoothing. That keeps the 15 fps
// repaint cheap on any screen size. Used by the screensaver over the lock screen and by the desktop wallpaper.
Item {
    id: root

    required property var eco

    readonly property var world: eco.world
    readonly property int cols: world?.cols ?? 0
    readonly property int rows: world?.rows ?? 0
    // Screen pixels per cell
    readonly property real size: cols > 0 ? Math.max(width / cols, height / rows) : 0

    // The tick on screen
    property int painted: -1

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
        width: root.cols * Draw.CELL
        height: root.rows * Draw.CELL
        scale: root.size / Draw.CELL
        transformOrigin: Item.TopLeft
        smooth: false

        onPaint: Draw.paint(getContext("2d"), root.world)
        onWidthChanged: requestPaint()
        onHeightChanged: requestPaint()
    }

    // The world is a plain object stepped by EcoWorld's timer, so nothing signals a new tick: look for one twice per step and
    // paint only then
    Timer {
        interval: 33
        running: root.visible && root.eco.running && !!root.world && !StayActive.screenAsleep
        repeat: true
        onTriggered: {
            if (root.world.tick === root.painted)
                return;
            root.painted = root.world.tick;
            canvas.requestPaint();
        }
    }
}
