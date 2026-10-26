pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import Caelestia.Config
import Caelestia.I18n
import qs.components.controls
import qs.utils
import qs.modules.nexus.common

ColumnLayout {
    id: root

    readonly property real minScale: 0.5
    readonly property real maxScale: 2

    readonly property list<MenuItem> positionItems: [
        MenuItem {
            text: Tr.trCtx("Top left", "desktop clock position")
            value: "top-left"
        },
        MenuItem {
            text: Tr.trCtx("Top centre", "desktop clock position")
            value: "top-center"
        },
        MenuItem {
            text: Tr.trCtx("Top right", "desktop clock position")
            value: "top-right"
        },
        MenuItem {
            text: Tr.trCtx("Middle left", "desktop clock position")
            value: "middle-left"
        },
        MenuItem {
            text: Tr.trCtx("Centre", "desktop clock position")
            value: "middle-center"
        },
        MenuItem {
            text: Tr.trCtx("Middle right", "desktop clock position")
            value: "middle-right"
        },
        MenuItem {
            text: Tr.trCtx("Bottom left", "desktop clock position")
            value: "bottom-left"
        },
        MenuItem {
            text: Tr.trCtx("Bottom centre", "desktop clock position")
            value: "bottom-center"
        },
        MenuItem {
            text: Tr.trCtx("Bottom right", "desktop clock position")
            value: "bottom-right"
        }
    ]

    Layout.topMargin: Tokens.spacing.largeIncreased - ((parent as ColumnLayout).spacing ?? 0)
    spacing: Tokens.spacing.extraSmall / 2

    SectionHeader {
        first: true
        text: Tr.tr("Desktop clock")
    }

    ToggleRow {
        first: true
        last: !Config.background.desktopClock.enabled
        text: Tr.tr("Desktop clock")
        checked: Config.background.desktopClock.enabled
        onToggled: GlobalConfig.background.desktopClock.enabled = checked
    }

    SelectRow {
        visible: Config.background.desktopClock.enabled
        label: Tr.tr("Position")
        menuItems: root.positionItems
        active: root.positionItems.find(i => i.value === Config.background.desktopClock.position) ?? root.positionItems[8]
        onSelected: item => GlobalConfig.background.desktopClock.position = item.value
    }

    SliderRow {
        visible: Config.background.desktopClock.enabled
        icon: "format_size"
        label: Tr.tr("Size")
        valueLabel: `${Config.background.desktopClock.scale.toFixed(2)}×`
        value: (Config.background.desktopClock.scale - root.minScale) / (root.maxScale - root.minScale)
        onMoved: v => GlobalConfig.background.desktopClock.scale = Math.round((root.minScale + v * (root.maxScale - root.minScale)) * 20) / 20
    }

    ToggleRow {
        visible: Config.background.desktopClock.enabled
        text: Tr.tr("Background")
        checked: Config.background.desktopClock.background.enabled
        onToggled: GlobalConfig.background.desktopClock.background.enabled = checked
    }

    ToggleRow {
        visible: Config.background.desktopClock.enabled
        last: true
        text: Tr.tr("Shadow")
        checked: Config.background.desktopClock.shadow.enabled
        onToggled: GlobalConfig.background.desktopClock.shadow.enabled = checked
    }
}
