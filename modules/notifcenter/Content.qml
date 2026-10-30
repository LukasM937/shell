pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import Caelestia.Config
import Caelestia.I18n
import Caelestia.State
import qs.components
import qs.components.containers
import qs.components.controls
import qs.services
import qs.modules.sidebar as Sidebar

ColumnLayout {
    id: root

    required property Sidebar.Props props
    required property ScreenState screenState
    required property real maxHeight

    readonly property int notifCount: Notifs.notClosed.length

    spacing: 0

    // Popups still showing when it opens move into the list, as with the sidebar
    Component.onCompleted: Notifs.list.forEach(n => n.popup = false)

    RowLayout {
        id: header

        Layout.fillWidth: true
        spacing: Tokens.spacing.extraSmall

        StyledText {
            Layout.fillWidth: true
            Layout.leftMargin: Tokens.padding.small
            text: root.notifCount > 0 ? Tr.trN("%n notification", "%n notifications", root.notifCount) : Tr.tr("Notifications")
            color: Colours.palette.m3outline
            font: Tokens.font.label.large
            elide: Text.ElideRight
        }

        IconButton {
            type: IconButton.Text
            isToggle: true
            checked: PersistentState.doNotDisturb
            icon: checked ? "notifications_off" : "notifications_active"
            onClicked: PersistentState.doNotDisturb = !PersistentState.doNotDisturb
        }

        IconButton {
            type: IconButton.Text
            icon: "clear_all"
            disabled: root.notifCount === 0
            onClicked: clearTimer.start()
        }
    }

    ClipRect {
        Layout.fillWidth: true
        Layout.topMargin: root.notifCount > 0 ? Tokens.spacing.small : 0
        Layout.preferredHeight: Math.min(notifList.implicitHeight, root.maxHeight - header.implicitHeight - Tokens.spacing.small)

        radius: Tokens.rounding.large

        StyledFlickable {
            id: view

            anchors.fill: parent

            flickableDirection: Flickable.VerticalFlick
            contentWidth: width
            contentHeight: notifList.implicitHeight

            StyledScrollBar.vertical: StyledScrollBar {
                flickable: view
            }

            Sidebar.NotifDockList {
                id: notifList

                props: root.props
                screenState: root.screenState
                container: view
                // Keep every group loaded: unloaded ones have estimated heights, which made scrolling jump back
                cacheBuffer: 100000
            }
        }

        Behavior on Layout.preferredHeight {
            Anim {}
        }
    }

    RowLayout {
        Layout.alignment: Qt.AlignHCenter
        Layout.topMargin: root.notifCount > 0 ? 0 : Tokens.padding.small
        Layout.bottomMargin: root.notifCount > 0 ? 0 : Tokens.padding.small
        Layout.preferredHeight: root.notifCount > 0 ? 0 : implicitHeight

        spacing: Tokens.spacing.small
        opacity: root.notifCount > 0 ? 0 : 1

        MaterialIcon {
            text: "done_all"
            color: Colours.palette.m3outlineVariant
            fontStyle: Tokens.font.icon.large
        }

        StyledText {
            text: Tr.tr("All up to date!")
            color: Colours.palette.m3outlineVariant
            font: Tokens.font.body.medium
        }

        Behavior on opacity {
            Anim {
                type: Anim.DefaultEffects
            }
        }

        Behavior on Layout.preferredHeight {
            Anim {}
        }
    }

    // Clears one app at a time, so each group animates out
    Timer {
        id: clearTimer

        repeat: true
        triggeredOnStart: true
        interval: Math.max(15, Math.min(80, 69.8 - 12.3 * Math.log(Notifs.notClosed.length)))
        onTriggered: {
            const first = Notifs.notClosed[0];
            if (!first) {
                stop();
                return;
            }

            for (const n of Notifs.notClosed.filter(n => n.appName === first.appName))
                n.close();
        }
    }
}
