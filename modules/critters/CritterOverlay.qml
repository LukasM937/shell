pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import Quickshell.Wayland
import qs.components.containers
import qs.services

// The roaming cat: a transparent, click-through window over the windows on each screen, mapped only on the one the cat is on
Variants {
    model: Critters.enabled ? Screens.screens : []

    StyledWindow {
        id: win

        required property ShellScreen modelData
        readonly property var cat: Critters.shown
        readonly property real centre: cat ? cat.body.x + cat.body.w / 2 : -1

        screen: modelData
        name: "critters"
        WlrLayershell.exclusionMode: ExclusionMode.Ignore
        WlrLayershell.layer: WlrLayer.Top
        // A window that is mapped again lands on top of the drawers, which the cat leaves the dashboard over
        visible: cat !== null && centre >= screen.x && centre < screen.x + screen.width
        mask: Region {}

        anchors.top: true
        anchors.bottom: true
        anchors.left: true
        anchors.right: true

        Loader {
            active: win.cat !== null
            sourceComponent: CatSprite {
                sprite: win.cat
                origin: Qt.point(win.screen.x, win.screen.y)
                spriteScale: Critters.spriteScale
            }
        }
    }
}
