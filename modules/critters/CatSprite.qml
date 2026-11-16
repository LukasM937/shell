pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Effects
import Caelestia.Config
import qs.services
import qs.utils

// The dashboard's cat gif, where the critter is and as it stands, walks, jumps or sleeps. `sprite` is the critter of
// a frame of desktop-critters: its body rect (the feet are the bottom centre), pose and the windows in front of it
Item {
    id: root

    required property var sprite
    // Top left of the screen on the desktop, which is where the frames' coordinates start
    required property point origin
    // 1, or bigger while the picture is still on its way out of (or into) the dashboard
    required property real spriteScale

    readonly property var body: sprite.body
    readonly property var pose: sprite.pose
    readonly property var occluders: sprite.occluders ?? []
    readonly property real pad: Math.max(body.w, body.h)
    // The art looks to the left, a critter facing right is the picture flipped
    readonly property real flip: -pose.facing * (1 + pose.squash)
    readonly property real bob: Math.abs(Math.sin(pose.phase * Math.PI * 2)) * (pose.kind === "run" ? 5 : pose.kind === "walk" ? 3 : 0)

    function playbackSpeed(kind: string): real {
        switch (kind) {
        case "run":
            return 2.8;
        case "walk":
            return 1.6;
        case "rest":
            return 0.25;
        case "idle":
            return 1;
        default:
            return 0.6;
        }
    }

    x: body.x - origin.x
    y: body.y - origin.y
    width: body.w
    height: body.h
    onSpriteChanged: mask.requestPaint()

    Item {
        id: holder

        anchors.fill: parent
        scale: root.spriteScale
        transformOrigin: Item.Bottom

        Item {
            id: art

            x: -root.pad
            y: -root.pad
            width: root.body.w + root.pad * 2
            height: root.body.h + root.pad * 2

            // Behind a window, the part of the cat inside it is not painted
            layer.enabled: root.occluders.length > 0
            layer.effect: MultiEffect {
                maskEnabled: true
                maskSource: mask
            }

            AnimatedImage {
                id: image

                anchors.horizontalCenter: parent.horizontalCenter
                anchors.bottom: parent.bottom
                anchors.bottomMargin: root.pad - root.bob
                width: root.body.w * Critters.conf.size
                height: width * implicitHeight / Math.max(1, implicitWidth)
                source: Paths.absolutePath(Config.paths.mediaGif)
                asynchronous: true
                fillMode: AnimatedImage.PreserveAspectFit
                // Pixel art stays crisp when it is blown up
                smooth: implicitWidth >= width
                playing: root.visible
                speed: root.playbackSpeed(root.pose.kind)
                rotation: root.pose.tilt * 180 / Math.PI
                transformOrigin: Item.Bottom
                transform: Scale {
                    origin.x: image.width / 2
                    xScale: root.flip
                    yScale: 1 - root.pose.squash
                }
            }
        }

        // Everything except the windows in front of the cat, in the coordinates of `art`
        Canvas {
            id: mask

            x: art.x
            y: art.y
            width: art.width
            height: art.height
            visible: false
            layer.enabled: true
            onPaint: {
                const ctx = getContext("2d");
                ctx.fillStyle = "white";
                ctx.fillRect(0, 0, width, height);
                for (const o of root.occluders)
                    ctx.clearRect(o.x - (root.body.x - root.pad), o.y - (root.body.y - root.pad), o.w, o.h);
            }
        }
    }
}
