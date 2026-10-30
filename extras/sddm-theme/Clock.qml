import QtQuick

// Hours in the primary colour, minutes in the secondary one, in a narrow variable font
Item {
    id: root

    required property date now
    required property real ui

    readonly property string hourStr: String(Theme.twelveHour ? now.getHours() % 12 || 12 : now.getHours()).padStart(2, "0")
    readonly property string minuteStr: Qt.formatTime(now, "mm")
    readonly property real hourSize: 224 * ui
    readonly property real minuteSize: (Theme.twelveHour ? 3.8 : 7) * 32 * ui

    function topOffset(metrics: TextMetrics): real {
        return metrics.tightBoundingRect.y - metrics.boundingRect.y;
    }

    implicitWidth: hours.implicitWidth + minutes.implicitWidth + Theme.spacingSmall
    implicitHeight: hourMetrics.tightBoundingRect.height

    Text {
        id: hours

        y: -root.topOffset(hourMetrics)
        text: root.hourStr
        color: Theme.m3primary
        renderType: Text.NativeRendering
        font.family: Theme.sans
        font.pointSize: root.hourSize
        font.variableAxes: ({
                "wght": 500,
                "wdth": 30,
                "ROND": 25,
                "opsz": Math.min(144, root.hourSize)
            })

        TextMetrics {
            id: hourMetrics

            text: hours.text
            font: hours.font
        }
    }

    Text {
        id: minutes

        anchors.right: parent.right
        y: -root.topOffset(minuteMetrics)
        text: root.minuteStr
        color: Theme.m3secondary
        renderType: Text.NativeRendering
        font.family: Theme.sans
        font.pointSize: root.minuteSize
        font.variableAxes: ({
                "wght": 500,
                "wdth": 30,
                "ROND": 25,
                "opsz": Math.min(144, root.minuteSize)
            })

        TextMetrics {
            id: minuteMetrics

            text: minutes.text
            font: minutes.font
        }
    }

    Rectangle {
        anchors.left: minutes.left
        anchors.leftMargin: minuteMetrics.tightBoundingRect.x
        y: hourMetrics.tightBoundingRect.height - height

        visible: Theme.twelveHour
        color: Theme.m3surfaceContainerHigh
        radius: Theme.roundingLarge
        implicitWidth: minuteMetrics.tightBoundingRect.width
        implicitHeight: amPmMetrics.tightBoundingRect.height + Theme.paddingLarge * 2

        TextMetrics {
            id: amPmMetrics

            text: amPm.text
            font: amPm.font
        }

        Text {
            id: amPm

            anchors.centerIn: parent
            // Centre the glyphs rather than the line
            anchors.verticalCenterOffset: amPmMetrics.boundingRect.height / 2 - root.topOffset(amPmMetrics) - amPmMetrics.tightBoundingRect.height / 2
            text: Qt.formatTime(root.now, "AP").toUpperCase()
            color: Theme.m3onSurface
            renderType: Text.NativeRendering
            font.family: Theme.sans
            font.pointSize: 2 * 24 * root.ui
            font.variableAxes: ({
                    "wght": 500,
                    "wdth": 30,
                    "ROND": 25
                })
        }
    }
}
