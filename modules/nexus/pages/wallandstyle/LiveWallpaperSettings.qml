pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import Caelestia.Config
import Caelestia.I18n
import qs.components.controls
import qs.services
import qs.modules.live
import qs.modules.nexus.common

ColumnLayout {
    id: root

    // Ordered like LiveWallpaper's kinds, with the still wallpaper first
    readonly property list<MenuItem> kindItems: [
        MenuItem {
            text: Tr.trCtx("Still image", "live wallpaper")
            icon: "image"
            value: ""
        },
        MenuItem {
            text: Tr.trCtx("Village", "live wallpaper")
            icon: "holiday_village"
            value: "village"
        },
        MenuItem {
            text: Tr.trCtx("Ecosystem", "live wallpaper")
            icon: "nature"
            value: "ecosystem"
        }
    ]

    Layout.topMargin: Tokens.spacing.largeIncreased - ((parent as ColumnLayout).spacing ?? 0)
    spacing: Tokens.spacing.extraSmall / 2

    SectionHeader {
        first: true
        text: Tr.tr("Live wallpaper")
    }

    SelectRow {
        label: Tr.tr("Wallpaper")
        subtext: Tr.tr("A village that grows with the computer, or the ecosystem of the screensaver, as the background")
        menuItems: root.kindItems
        active: root.kindItems.find(i => i.value === LiveWallpaper.kind) ?? root.kindItems[0]
        onSelected: item => item.value ? LiveWallpaper.choose(item.value) : LiveWallpaper.off()
    }

    StepperRow {
        visible: LiveWallpaper.kind === "village"
        label: Tr.tr("Village speed")
        subtext: Tr.tr("How many times faster than the clock the village lives, 1 for real time")
        value: LiveWallpaper.speed
        from: 1
        to: 30
        stepSize: 1
        onMoved: v => LiveWallpaper.speed = Math.round(v)
    }

    StepperRow {
        visible: LiveWallpaper.active
        label: Tr.tr("Frame rate")
        subtext: Tr.tr("Frames drawn per second, fewer is lighter on the computer")
        value: LiveWallpaper.fps
        from: 5
        to: 30
        stepSize: 5
        onMoved: v => LiveWallpaper.fps = Math.round(v)
    }

    RowButton {
        visible: LiveWallpaper.kind === "village"
        icon: "restart_alt"
        text: Tr.tr("Start the village over")
        subtext: Tr.tr("Forgets the village and founds a new one")
        onClicked: Village.reset()
    }
}
