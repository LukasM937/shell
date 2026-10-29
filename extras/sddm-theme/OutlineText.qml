import QtQuick
import QtQuick.Shapes

// Text drawn either filled or as stroked glyph outlines. Sized and baseline-aligned like a plain Text
Item {
    id: root

    property alias text: label.text
    property alias font: label.font
    property color colour: "white"
    property bool outline
    property real strokeWidth: 2

    implicitWidth: label.implicitWidth
    implicitHeight: label.implicitHeight
    baselineOffset: label.baselineOffset

    Text {
        id: label

        color: root.outline ? "transparent" : root.colour
        renderType: Text.NativeRendering
    }

    TextMetrics {
        id: metrics

        font: label.font
        text: label.text
    }

    // PathText starts at the ink's top edge rather than the line's top
    Shape {
        visible: root.outline
        y: label.baselineOffset + metrics.tightBoundingRect.y
        preferredRendererType: Shape.CurveRenderer

        ShapePath {
            strokeColor: root.colour
            strokeWidth: root.strokeWidth
            fillColor: "transparent"
            joinStyle: ShapePath.RoundJoin

            PathText {
                text: label.text
                font: label.font
            }
        }
    }
}
