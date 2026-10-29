pragma Singleton

import QtQuick

// Colours, sizes and fonts of the Caelestia shell. The colours come from theme.conf(.user)
QtObject {
    id: root

    property FontLoader sansLoader: FontLoader {
        source: Qt.resolvedUrl("fonts/GoogleSansFlex.ttf")
    }

    readonly property string sans: sansLoader.name || "Google Sans Flex"
    readonly property string icons: "Material Symbols Rounded"
    readonly property bool hasIcons: Qt.fontFamilies().indexOf(icons) >= 0

    readonly property color m3primary: option("primary", "#9ccbfb")
    readonly property color m3onPrimary: option("onPrimary", "#003354")
    readonly property color m3primaryContainer: option("primaryContainer", "#00497a")
    readonly property color m3onPrimaryContainer: option("onPrimaryContainer", "#cfe5ff")
    readonly property color m3secondary: option("secondary", "#b9c8da")
    readonly property color m3onSecondary: option("onSecondary", "#233240")
    readonly property color m3secondaryContainer: option("secondaryContainer", "#3a4857")
    readonly property color m3onSecondaryContainer: option("onSecondaryContainer", "#d5e4f7")
    readonly property color m3tertiary: option("tertiary", "#d3bfe6")
    readonly property color m3surface: option("surface", "#101418")
    readonly property color m3onSurface: option("onSurface", "#e0e2e8")
    readonly property color m3onSurfaceVariant: option("onSurfaceVariant", "#c1c7ce")
    readonly property color m3surfaceContainer: option("surfaceContainer", "#1c2024")
    readonly property color m3surfaceContainerHigh: option("surfaceContainerHigh", "#262a2f")
    readonly property color m3surfaceContainerHighest: option("surfaceContainerHighest", "#31353a")
    readonly property color m3outline: option("outline", "#8b9198")
    readonly property color m3outlineVariant: option("outlineVariant", "#41484d")
    readonly property color m3error: option("error", "#ffb4ab")
    readonly property color m3onError: option("onError", "#690005")
    readonly property color m3errorContainer: option("errorContainer", "#93000a")
    readonly property color m3onErrorContainer: option("onErrorContainer", "#ffdad6")
    readonly property color m3shadow: option("shadow", "#000000")

    readonly property real panelOpacity: Number(option("panelOpacity", "1"))
    readonly property bool twelveHour: option("twelveHour", "false") === "true"
    readonly property string background: option("background", "")

    // Tokens
    readonly property int roundingMedium: 12
    readonly property int roundingLarge: 16
    readonly property int roundingLargeIncreased: 20
    readonly property int roundingExtraLarge: 28
    readonly property int roundingFull: 1000
    readonly property int paddingExtraSmall: 4
    readonly property int paddingSmall: 8
    readonly property int paddingMedium: 12
    readonly property int paddingLarge: 16
    readonly property int paddingExtraLarge: 28
    readonly property int spacingSmall: 8
    readonly property int spacingMedium: 12
    readonly property int spacingLarge: 16

    // The shell's expressive curves, as Easing.BezierSpline control points
    readonly property var fastSpatial: [0.42, 1.67, 0.21, 0.9, 1, 1]
    readonly property var defaultEffects: [0.34, 0.8, 0.34, 1, 1, 1]
    readonly property var standard: [0.2, 0, 0, 1, 1, 1]

    // theme.conf values come as strings, and are missing when the file has no such key
    function option(key: string, fallback: string): string {
        const value = typeof config === "undefined" ? undefined : config[key];
        return value === undefined || value === "" ? fallback : String(value);
    }
}
