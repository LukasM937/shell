import QtQuick

// A Material Symbols icon. Without the font it falls back to a plain glyph
Text {
    id: root

    required property string name
    property string fallback
    property real size: 24
    property bool filled

    text: Theme.hasIcons ? name : fallback
    color: Theme.m3onSurface
    renderType: Text.NativeRendering

    font.family: Theme.hasIcons ? Theme.icons : Theme.sans
    font.pixelSize: size
    font.variableAxes: Theme.hasIcons ? ({
            "FILL": filled ? 1 : 0,
            "opsz": Math.max(20, Math.min(48, size))
        }) : ({})
}
