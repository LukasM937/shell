import QtQuick

// A square icon button. Its corners round off while it is pressed, like the session buttons of the shell
Rectangle {
    id: root

    required property string icon
    property string fallback
    property real size: 56
    property color iconColour: Theme.m3onSurface
    property color baseColour: Theme.m3surfaceContainerHigh
    property alias hovered: mouse.containsMouse
    property alias pressed: mouse.pressed
    property alias iconItem: iconItem

    signal clicked

    implicitWidth: size
    implicitHeight: size
    radius: pressed ? Theme.roundingMedium : Theme.roundingLargeIncreased
    color: baseColour

    Behavior on radius {
        NumberAnimation {
            duration: 350
            easing.type: Easing.BezierSpline
            easing.bezierCurve: Theme.fastSpatial
        }
    }

    Rectangle {
        anchors.fill: parent
        radius: parent.radius
        color: root.iconColour
        opacity: root.pressed ? 0.12 : root.hovered ? 0.08 : 0

        Behavior on opacity {
            NumberAnimation {
                duration: 150
            }
        }
    }

    Icon {
        id: iconItem

        anchors.centerIn: parent
        name: root.icon
        fallback: root.fallback
        size: root.size * 0.45
        color: root.iconColour
    }

    MouseArea {
        id: mouse

        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: root.clicked()
    }
}
