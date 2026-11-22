pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Hyprland
import Quickshell.Io
import Caelestia.Config
import Caelestia.I18n
import qs.utils
import qs.modules.nexus.common

ColumnLayout {
    id: root

    required property ShellScreen screen

    // Percent steps, the spin box works in whole numbers
    readonly property int minPercent: 50
    readonly property int maxPercent: 250
    // Fixed pixel values that are not relative to the screen: ratios and the share of the screen's height
    readonly property var screenRelative: ["heightMult", "ratio"]
    // The font scale stands for the whole setting, all four scales are always written together
    readonly property real current: Config.forScreen(screen.name).appearance.font.scale
    // A 4K panel is about 1.5 times as dense as the 1440p that the sizes were drawn for, steps of 25 give whole pixels
    readonly property int suggested: Math.max(100, Math.round((monitor?.height ?? screen.height) / 1440 * 4) * 25)

    readonly property HyprlandMonitor monitor: Hyprland.monitorFor(screen)
    readonly property real displayScale: monitor?.scale ?? 1
    // Hyprland reads this back at startup (see the loader in hypr-user.lua), one `["name"] = scale` per screen
    property var stored
    readonly property string scaleFile: `${Paths.config}/hypr-scale.lua`

    // Sets the compositor's scale of this screen, which every app follows (terminal, browser, Steam, ...), and keeps it for
    // the next start. Unlike the interface size below, this also makes the pixels of the apps bigger.
    function applyDisplay(percent: int): void {
        const s = percent / 100;
        Quickshell.execDetached(["hyprctl", "eval", `hl.monitor({ output = "${screen.name}", mode = "preferred", position = "auto", scale = ${s} })`]);

        // The write is asynchronous, so the next call must not read the file again before it has landed
        if (!stored) {
            stored = {};
            const entry = /\["([^"]+)"\]\s*=\s*([0-9.]+)/g;
            const old = scaleStore.text() ?? "";
            let m;
            while ((m = entry.exec(old)) !== null)
                stored[m[1]] = m[2];
        }
        const scales = stored;
        scales[screen.name] = s;
        scaleStore.setText(`return {\n${Object.keys(scales).sort().map(n => `    ["${n}"] = ${scales[n]},`).join("\n")}\n}\n`);
        refreshMonitor.restart();
    }

    // Scales every size of this screen: rounding, spacing, padding and fonts through their scale, the fixed widths and
    // heights (bar, drawers, lock screen, ...) from the global values. Written to the screen's own files, so other
    // screens keep their size. 100% removes the overrides again.
    function apply(percent: int): void {
        const s = percent / 100;
        const reset = percent === 100;
        const appearance = Config.forScreen(screen.name).appearance;
        for (const group of ["rounding", "spacing", "padding", "font"]) {
            if (reset)
                appearance[group].resetOption("scale");
            else
                appearance[group].scale = s;
        }

        const own = TokenConfig.forScreen(screen.name).sizes;
        const base = TokenConfig.sizes;
        for (const group in base) {
            const values = base[group];
            if (values === null || typeof values !== "object")
                continue;
            for (const key in values) {
                if (typeof values[key] !== "number" || screenRelative.includes(key))
                    continue;
                if (reset)
                    own[group].resetOption(key);
                else
                    own[group][key] = Math.round(values[key] * s);
            }
        }
    }

    Layout.topMargin: Tokens.spacing.largeIncreased - ((parent as ColumnLayout).spacing ?? 0)
    spacing: Tokens.spacing.extraSmall / 2

    FileView {
        id: scaleStore

        path: root.scaleFile
        blockLoading: true
        printErrors: false
    }

    Timer {
        id: refreshMonitor

        interval: 600
        onTriggered: Hyprland.refreshMonitors()
    }

    SectionHeader {
        first: true
        text: Tr.tr("Scale")
    }

    StepperRow {
        first: true
        label: Tr.tr("Display scale")
        // TRANSLATORS: %1 = screen name, %2×%3 = the screen's size in scaled pixels, %4 = suggested percentage
        subtext: Tr.tr("All apps, including terminal, browser and Steam. %1, %2×%3, suggested %4%").arg(root.screen.name).arg(root.screen.width).arg(root.screen.height).arg(root.suggested)
        value: Math.round(root.displayScale * 100)
        from: 100
        to: 300
        stepSize: 25
        onMoved: v => root.applyDisplay(v)
    }

    StepperRow {
        last: true
        label: Tr.tr("Interface size")
        subtext: Tr.tr("Only the shell, on top of the display scale")
        value: Math.round(root.current * 100)
        from: root.minPercent
        to: root.maxPercent
        stepSize: 5
        onMoved: v => root.apply(v)
    }
}
