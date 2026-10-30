import QtQuick

// The session to start (Hyprland, ...) as a chip. The list it opens is SessionMenu
Rectangle {
    id: root

    required property var names
    required property int current
    property bool open

    signal toggled

    implicitWidth: row.implicitWidth + Theme.paddingLarge * 2
    implicitHeight: 56
    radius: open ? Theme.roundingMedium : Theme.roundingLargeIncreased
    color: open ? Theme.m3secondaryContainer : Theme.m3surfaceContainerHigh

    Behavior on radius {
        NumberAnimation {
            duration: 350
            easing.type: Easing.BezierSpline
            easing.bezierCurve: Theme.fastSpatial
        }
    }
    Behavior on color {
        ColorAnimation {
            duration: 200
        }
    }

    Row {
        id: row

        anchors.centerIn: parent
        spacing: Theme.spacingSmall

        Icon {
            anchors.verticalCenter: parent.verticalCenter
            name: "desktop_windows"
            fallback: "▣"
            size: 24
            color: root.open ? Theme.m3onSecondaryContainer : Theme.m3onSurface
        }

        Text {
            anchors.verticalCenter: parent.verticalCenter
            text: root.names[root.current] ?? "Session"
            color: root.open ? Theme.m3onSecondaryContainer : Theme.m3onSurface
            renderType: Text.NativeRendering
            font.family: Theme.sans
            font.pointSize: 12
            font.variableAxes: ({
                    "wght": 500,
                    "ROND": 25,
                    "opsz": 12
                })
        }

        Icon {
            anchors.verticalCenter: parent.verticalCenter
            name: "expand_more"
            fallback: "▾"
            size: 20
            color: root.open ? Theme.m3onSecondaryContainer : Theme.m3onSurfaceVariant
            rotation: root.open ? 180 : 0

            Behavior on rotation {
                NumberAnimation {
                    duration: 200
                }
            }
        }
    }

    Rectangle {
        anchors.fill: parent
        radius: parent.radius
        color: Theme.m3onSurface
        opacity: mouse.pressed ? 0.12 : mouse.containsMouse ? 0.08 : 0
    }

    MouseArea {
        id: mouse

        anchors.fill: parent
        enabled: root.names.length > 1
        hoverEnabled: true
        cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
        onClicked: root.toggled()
    }
}
