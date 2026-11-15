import QtQuick
import Caelestia.Services
import qs.services
import "cat.js" as Cat

// The cat that lives in the dashboard: a pixel room 64 pixels high and as wide as the card, scaled up without smoothing
Item {
    id: root

    property bool hovered
    // Pointer position in this item's own coordinates, only read while hovered
    property real pointerX: -1
    // Virtual pixels across, so the room fills the card whatever its shape
    readonly property int gridWidth: Math.max(Cat.H, Math.ceil(width / Math.max(1, height) * Cat.H))
    property var cat: Cat.create(Date.now() % 100000 + 1, gridWidth)
    property real last

    function pet(): void {
        Cat.pet(cat);
        canvas.requestPaint();
    }

    function env(): var {
        const hour = Time.hours;
        return {
            night: hour < 7 || hour >= 22,
            hover: hovered,
            pointer: hovered ? pointerX / canvas.scale : -1,
            busy: Cpu.percentage
        };
    }

    onGridWidthChanged: {
        cat.w = gridWidth;
        cat.rug = gridWidth / 2;
        cat.x = Math.max(Cat.MARGIN, Math.min(gridWidth - Cat.MARGIN, cat.x));
        canvas.requestPaint();
    }

    ServiceRef {
        service: Cpu
    }

    Canvas {
        id: canvas

        width: root.gridWidth
        height: Cat.H
        scale: root.height / Cat.H
        transformOrigin: Item.TopLeft
        smooth: false

        onPaint: Cat.draw(getContext("2d"), root.cat, root.env())
    }

    // Only runs while the dashboard is open
    Timer {
        interval: 40
        repeat: true
        running: root.visible && root.width > 0
        onRunningChanged: root.last = Date.now()
        onTriggered: {
            const now = Date.now();
            Cat.step(root.cat, (now - root.last) / 1000, root.env());
            root.last = now;
            canvas.requestPaint();
        }
    }
}
