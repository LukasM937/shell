pragma ComponentBehavior: Bound

import QtQuick
import Caelestia.Config
import qs.components
import qs.services

// The world of EcoWorld over the lock screen, with the newest event drifting along the bottom
Item {
    id: root

    required property var eco

    readonly property string lastEvent: {
        const list = eco.events ?? [];
        return list.length > 0 ? list[list.length - 1].text : "";
    }

    // Where the event line is on its way across (0 to 1). It slides across once every five minutes (about 7 px/s on a 1920 px
    // screen), so no pixel stays lit for hours
    property real drift

    EcoView {
        anchors.fill: parent
        eco: root.eco
    }

    Timer {
        interval: 100
        running: root.visible && root.eco.running && !!root.eco.world && !StayActive.screenAsleep
        repeat: true
        onTriggered: root.drift = (Date.now() % 300000) / 300000
    }

    StyledRect {
        id: eventLine

        x: Math.round(-width + root.drift * (root.width + width))
        y: root.height - height - Tokens.padding.large * 2
        implicitWidth: logText.implicitWidth + Tokens.padding.medium * 2
        implicitHeight: logText.implicitHeight + Tokens.padding.small * 2

        visible: GlobalConfig.lock.screensaver.eventLog && root.lastEvent !== ""
        color: Qt.alpha(Colours.palette.m3surface, 0.6)
        radius: Tokens.rounding.medium
        opacity: 0.75

        StyledText {
            id: logText

            anchors.centerIn: parent
            text: root.lastEvent
            color: Colours.palette.m3onSurface
            font: Tokens.font.body.small
        }
    }
}
