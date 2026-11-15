import QtQuick
import Caelestia.Services
import qs.services
import "cat.js" as Cat

// The cat that lives in the dashboard: a pixel room drawn at 64x64 pixels and scaled up without smoothing
Item {
    id: root

    property bool hovered
    // Pointer position in this item's own coordinates, only read while hovered
    property real pointerX: -1
    property var cat: Cat.create(Date.now() % 100000 + 1)
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

    ServiceRef {
        service: Cpu
    }

    Canvas {
        id: canvas

        width: Cat.W
        height: Cat.H
        scale: Math.min(root.width, root.height) / Cat.W
        x: (root.width - width * scale) / 2
        y: (root.height - height * scale) / 2
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
