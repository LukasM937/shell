pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import Quickshell.Io
import Caelestia.Config
import Caelestia.I18n
import qs.components.controls
import qs.utils
import qs.modules.nexus.common

// Settings for the depth clock. They live in the generator's own config file
// ($XDG_CONFIG_HOME/caelestia/depth-clock.json), which it watches and regenerates the layout from.
// Hidden while that file doesn't exist, i.e. the generator isn't set up.
ColumnLayout {
    id: root

    readonly property real maxStrength: 0.04
    property var conf: ({})

    readonly property list<MenuItem> styleItems: [
        MenuItem {
            text: Tr.trCtx("Outline", "clock style")
            value: "outline"
        },
        MenuItem {
            text: Tr.trCtx("Solid", "clock style")
            value: "solid"
        }
    ]

    readonly property list<MenuItem> colourItems: [
        MenuItem {
            text: Tr.trCtx("Automatic", "clock colour")
            value: "auto"
        },
        MenuItem {
            text: Tr.trCtx("Primary", "clock colour")
            value: "primary"
        },
        MenuItem {
            text: Tr.trCtx("Secondary", "clock colour")
            value: "secondary"
        },
        MenuItem {
            text: Tr.trCtx("Tertiary", "clock colour")
            value: "tertiary"
        }
    ]

    function get(path: string, fallback: var): var {
        let o = conf;
        for (const k of path.split("."))
            o = o?.[k];
        return o ?? fallback;
    }

    function set(path: string, value: var): void {
        const c = JSON.parse(JSON.stringify(conf));
        const keys = path.split(".");
        let o = c;
        for (const k of keys.slice(0, -1)) {
            if (typeof o[k] !== "object" || o[k] === null)
                o[k] = {};
            o = o[k];
        }
        o[keys[keys.length - 1]] = value;
        conf = c;
        saveTimer.restart();
    }

    Layout.topMargin: Tokens.spacing.largeIncreased - ((parent as ColumnLayout).spacing ?? 0)
    visible: file.loaded
    spacing: Tokens.spacing.extraSmall / 2

    SectionHeader {
        first: true
        text: Tr.tr("Depth clock")
    }

    ToggleRow {
        first: true
        text: Tr.tr("Depth clock")
        subtext: Tr.tr("Time placed behind the scenery of the wallpaper")
        checked: root.get("enabled", true)
        onToggled: root.set("enabled", checked)
    }

    ToggleRow {
        text: Tr.tr("Parallax")
        subtext: Tr.tr("Scenery shifts with the cursor")
        enabled: root.get("enabled", true)
        checked: root.get("parallax.enabled", true)
        onToggled: root.set("parallax.enabled", checked)
    }

    SliderRow {
        icon: "3d_rotation"
        label: Tr.tr("Parallax strength")
        valueLabel: Strings.percentOne(value)
        value: root.get("parallax.strength", 0.015) / root.maxStrength
        enabled: root.get("enabled", true) && root.get("parallax.enabled", true)
        onMoved: v => root.set("parallax.strength", Math.round(v * root.maxStrength * 1000) / 1000)
    }

    SelectRow {
        label: Tr.tr("Time style")
        menuItems: root.styleItems
        active: root.styleItems.find(i => i.value === root.get("time.style", "outline")) ?? root.styleItems[0]
        enabled: root.get("enabled", true)
        onSelected: item => root.set("time.style", item.value)
    }

    SelectRow {
        label: Tr.tr("Colour")
        subtext: Tr.tr("Automatic picks a scheme colour that stands out from the wallpaper")
        menuItems: root.colourItems
        active: root.colourItems.find(i => i.value === root.get("colour", "auto")) ?? root.colourItems[0]
        enabled: root.get("enabled", true)
        onSelected: item => root.set("colour", item.value)
    }

    ToggleRow {
        last: true
        text: Tr.tr("Readability backdrop")
        subtext: Tr.tr("Soft plate behind the date when the scenery there is busy")
        enabled: root.get("enabled", true)
        checked: root.get("backdrop.enabled", true)
        onToggled: root.set("backdrop.enabled", checked)
    }

    // Each write makes the generator rerun, so batch slider drags
    Timer {
        id: saveTimer

        interval: 600
        onTriggered: file.setText(JSON.stringify(root.conf, null, 4) + "\n")
    }

    FileView {
        id: file

        path: `${Paths.config}/depth-clock.json`
        watchChanges: true
        printErrors: false
        onFileChanged: reload()
        onLoaded: {
            try {
                root.conf = JSON.parse(text());
            } catch (e) {
                root.conf = {};
            }
        }
    }
}
