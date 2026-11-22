pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import Quickshell
import Caelestia.Config
import Caelestia.I18n
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
    // A 4K panel is about 1.5 times as dense as the 1440p that the sizes were drawn for
    readonly property int suggested: Math.max(100, Math.round(screen.height / 1440 * 4) * 25)

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

    SectionHeader {
        first: true
        text: Tr.tr("Interface size")
    }

    StepperRow {
        first: true
        last: true
        label: Tr.tr("Scale of this screen")
        // TRANSLATORS: %1 = screen name, %2 = resolution such as 3840×2160, %3 = suggested percentage
        subtext: Tr.tr("%1, %2×%3 pixels. Suggested: %4%").arg(root.screen.name).arg(root.screen.width).arg(root.screen.height).arg(root.suggested)
        value: Math.round(root.current * 100)
        from: root.minPercent
        to: root.maxPercent
        stepSize: 5
        onMoved: v => root.apply(v)
    }
}
