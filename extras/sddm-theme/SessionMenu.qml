import QtQuick

// The list of sessions, above everything else, opening upwards from the chip. A click anywhere else closes it
Item {
    id: root

    required property var names
    required property int current
    required property Item anchorItem
    property bool open

    readonly property real listWidth: {
        let w = 0;
        for (let i = 0; i < measure.count; i++)
            w = Math.max(w, measure.itemAt(i)?.implicitWidth ?? 0);
        return w + Theme.paddingMedium * 2 + Theme.paddingSmall * 2;
    }

    signal picked(int index)
    signal dismissed

    function place(): void {
        const p = anchorItem.mapToItem(root, 0, 0);
        menu.x = p.x;
        menu.y = p.y - menu.height - Theme.spacingSmall;
    }

    onOpenChanged: {
        if (open)
            place();
    }

    MouseArea {
        anchors.fill: parent
        enabled: root.open
        onClicked: root.dismissed()
    }

    Repeater {
        id: measure

        model: root.names

        delegate: Text {
            required property string modelData

            visible: false
            text: modelData
            font.family: Theme.sans
            font.pointSize: 12
        }
    }

    Rectangle {
        id: menu

        width: Math.max(root.anchorItem.width, root.listWidth)
        height: column.implicitHeight + Theme.paddingSmall * 2
        radius: Theme.roundingLarge
        color: Theme.m3surfaceContainerHigh
        visible: opacity > 0
        opacity: root.open ? 1 : 0
        scale: root.open ? 1 : 0.9
        transformOrigin: Item.BottomLeft

        Behavior on opacity {
            NumberAnimation {
                duration: 200
            }
        }
        Behavior on scale {
            NumberAnimation {
                duration: 350
                easing.type: Easing.BezierSpline
                easing.bezierCurve: Theme.fastSpatial
            }
        }

        Column {
            id: column

            anchors.centerIn: parent
            spacing: 2

            Repeater {
                model: root.names

                delegate: Rectangle {
                    id: entry

                    required property int index
                    required property string modelData

                    width: menu.width - Theme.paddingSmall * 2
                    height: 44
                    radius: Theme.roundingMedium
                    color: index === root.current ? Theme.m3secondaryContainer : "transparent"

                    Rectangle {
                        anchors.fill: parent
                        radius: parent.radius
                        color: Theme.m3onSurface
                        opacity: entryMouse.containsMouse ? 0.08 : 0
                    }

                    Text {
                        anchors.left: parent.left
                        anchors.leftMargin: Theme.paddingMedium
                        anchors.verticalCenter: parent.verticalCenter
                        text: entry.modelData
                        color: entry.index === root.current ? Theme.m3onSecondaryContainer : Theme.m3onSurface
                        renderType: Text.NativeRendering
                        font.family: Theme.sans
                        font.pointSize: 12
                    }

                    MouseArea {
                        id: entryMouse

                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: root.picked(entry.index)
                    }
                }
            }
        }
    }
}
