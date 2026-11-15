import QtQuick
import Caelestia.Config
import qs.components
import qs.components.filedialog

// The cat has the whole card. Nothing picks a face any more, facePicker stays only because the dashboard passes it
Item {
    id: root

    required property ScreenState screenState
    required property FileDialog facePicker

    anchors.fill: parent

    ClipRect {
        anchors.fill: parent
        radius: Tokens.rounding.medium

        CatView {
            id: cat

            anchors.fill: parent
            hovered: mouse.containsMouse
            pointerX: mouse.mouseX
        }

        MouseArea {
            id: mouse

            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: cat.pet()
        }
    }
}
