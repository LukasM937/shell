import QtQuick
import QtQuick.Shapes

// Text drawn either filled or as stroked glyph outlines (Shape + PathText). Sized and
// baseline-aligned like a plain Text, so it can be positioned the same way.
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
