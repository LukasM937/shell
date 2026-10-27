pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import Quickshell
import Caelestia.Config
import Caelestia.I18n
import Caelestia.Services
import qs.components
import qs.components.controls
import qs.components.effects
import qs.services
import qs.utils
import qs.modules.nexus

// Opened from the bar logo: system info, updates, settings and session actions
ColumnLayout {
    id: root

    required property PopoutState popouts

    function run(command: list<string>): void {
        root.popouts.hasCurrent = false;
        if (!SessionManager.exec(command))
            Quickshell.execDetached(command);
    }

    width: Tokens.sizes.bar.batteryWidth
    spacing: Tokens.spacing.small

    Component.onCompleted: SystemUpdates.refresh(false)

    RowLayout {
        Layout.fillWidth: true
        Layout.bottomMargin: Tokens.spacing.small
        spacing: Tokens.spacing.large

        Loader {
            Layout.alignment: Qt.AlignVCenter
            sourceComponent: SysInfo.isDefaultLogo ? caelestiaLogo : distroIcon
        }

        ColumnLayout {
            Layout.fillWidth: true
            spacing: 0

            StyledText {
                Layout.fillWidth: true
                text: SysInfo.osPrettyName || SysInfo.osName
                font: Tokens.font.title.small
                elide: Text.ElideRight
            }

            StyledText {
                Layout.fillWidth: true
                // TRANSLATORS: %1 = hostname, %2 = uptime, e.g. "archlinux · up 3 hours, 12 mins"
                text: Tr.tr("%1 · up %2").arg(SysInfo.hostname).arg(SysInfo.uptimeShort)
                color: Colours.palette.m3onSurfaceVariant
                font: Tokens.font.body.small
                elide: Text.ElideRight
            }

            StyledText {
                Layout.fillWidth: true
                text: SysInfo.kernel
                color: Colours.palette.m3onSurfaceVariant
                font: Tokens.font.body.small
                elide: Text.ElideRight
            }
        }
    }

    ActionRow {
        icon: SystemUpdates.count > 0 ? "system_update_alt" : "verified"
        text: {
            if (SystemUpdates.checking)
                return Tr.tr("Checking for updates...");
            if (SystemUpdates.count < 0)
                return Tr.tr("Update system");
            if (SystemUpdates.count === 0)
                return Tr.tr("System is up to date");
            if (SystemUpdates.aur > 0)
                // TRANSLATORS: %1 = all pending updates, %2 = how many of them are from the AUR
                return Tr.tr("Update system (%1, %2 AUR)").arg(SystemUpdates.count).arg(SystemUpdates.aur);
            return Tr.tr("Update system (%1)").arg(SystemUpdates.count);
        }
        highlighted: SystemUpdates.count > 0
        onClicked: {
            root.popouts.hasCurrent = false;
            SystemUpdates.update();
        }
    }

    ActionRow {
        icon: "settings"
        text: Tr.tr("Settings")
        onClicked: {
            root.popouts.hasCurrent = false;
            WindowFactory.create();
        }
    }

    StyledRect {
        Layout.fillWidth: true
        Layout.topMargin: Tokens.spacing.small
        Layout.bottomMargin: Tokens.spacing.small
        implicitHeight: 1
        color: Colours.palette.m3outlineVariant
    }

    ActionRow {
        icon: "lock"
        text: Tr.tr("Lock")
        onClicked: root.run(["caelestia", "shell", "lock", "lock"])
    }

    ActionRow {
        icon: "bedtime"
        text: Tr.tr("Suspend")
        onClicked: root.run(["systemctl", "suspend"])
    }

    ActionRow {
        icon: Config.session.icons.logout
        text: Tr.tr("Log out")
        onClicked: root.run(Config.session.commands.logout)
    }

    ActionRow {
        icon: Config.session.icons.reboot
        text: Tr.tr("Restart")
        onClicked: root.run(Config.session.commands.reboot)
    }

    ActionRow {
        icon: Config.session.icons.shutdown
        text: Tr.tr("Shut down")
        onClicked: root.run(Config.session.commands.shutdown)
    }

    Component {
        id: caelestiaLogo

        Logo {
            implicitWidth: Tokens.font.icon.extraLarge.pointSize * 1.6
            implicitHeight: Tokens.font.icon.extraLarge.pointSize * 1.6
        }
    }

    Component {
        id: distroIcon

        ColouredIcon {
            source: SysInfo.osLogo
            implicitSize: Tokens.font.icon.extraLarge.pointSize * 1.6
            colour: Colours.palette.m3tertiary
        }
    }

    component ActionRow: StyledRect {
        id: row

        property alias icon: rowIcon.text
        property alias text: rowLabel.text
        property bool highlighted

        signal clicked

        Layout.fillWidth: true
        implicitHeight: rowLayout.implicitHeight + Tokens.padding.medium * 2

        radius: Tokens.rounding.medium
        color: highlighted ? Colours.palette.m3tertiaryContainer : "transparent"

        StateLayer {
            color: row.highlighted ? Colours.palette.m3onTertiaryContainer : Colours.palette.m3onSurface
            onClicked: row.clicked()
        }

        RowLayout {
            id: rowLayout

            anchors.fill: parent
            anchors.margins: Tokens.padding.medium
            spacing: Tokens.spacing.medium

            MaterialIcon {
                id: rowIcon

                Layout.alignment: Qt.AlignVCenter
                color: row.highlighted ? Colours.palette.m3onTertiaryContainer : Colours.palette.m3onSurfaceVariant
            }

            StyledText {
                id: rowLabel

                Layout.alignment: Qt.AlignVCenter
                Layout.fillWidth: true
                color: row.highlighted ? Colours.palette.m3onTertiaryContainer : Colours.palette.m3onSurface
                elide: Text.ElideRight
            }
        }
    }
}
