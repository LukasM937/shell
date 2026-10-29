pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import Quickshell
import Caelestia.Config
import Caelestia.Services
import qs.components
import qs.components.controls
import qs.services

// The session menu as a card of the lock screen: log out, shut down, hibernate and restart
StyledRect {
    id: root

    readonly property real fontScale: {
        const diff = width / 391 - 1; // 391 is the width at 1080 height screen
        return 1 + Math.pow(Math.abs(diff), 0.8) * Math.sign(diff);
    }

    implicitHeight: layout.implicitHeight + Tokens.padding.large * 2
    radius: Tokens.rounding.extraLarge
    color: Colours.tPalette.m3surfaceContainer

    RowLayout {
        id: layout

        anchors.fill: parent
        anchors.margins: Tokens.padding.large
        spacing: Tokens.spacing.large

        SessionButton {
            icon: Config.session.icons.logout
            command: Config.session.commands.logout
        }

        SessionButton {
            icon: Config.session.icons.shutdown
            command: Config.session.commands.shutdown
        }

        SessionButton {
            icon: Config.session.icons.hibernate
            command: Config.session.commands.hibernate
        }

        SessionButton {
            icon: Config.session.icons.reboot
            command: Config.session.commands.reboot
        }
    }

    component SessionButton: IconButton {
        id: button

        required property list<string> command

        function exec(): void {
            if (!SessionManager.exec(command))
                Quickshell.execDetached(command);
        }

        Layout.fillWidth: true
        Layout.preferredHeight: Math.min(width, Tokens.sizes.session.button)

        inactiveColour: Colours.tPalette.m3surfaceContainerHigh
        inactiveOnColour: Colours.palette.m3onSurface
        radius: pressed ? Tokens.rounding.medium : Tokens.rounding.largeIncreased
        font: Tokens.font.icon.builders.large.scale(root.fontScale * 1.3).build()
        onClicked: exec()
    }
}
