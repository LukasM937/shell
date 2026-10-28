pragma ComponentBehavior: Bound

import QtQuick
import Caelestia
import Caelestia.Config
import qs.components
import qs.modules.sidebar as Sidebar

// Notification history in the top right corner. It shares the sidebar's expanded groups and gives way to it
Item {
    id: root

    required property ScreenState screenState
    required property Sidebar.Wrapper sidebar
    required property real maxHeight

    readonly property bool shouldBeActive: screenState.notifCenter && !screenState.sidebar && !(screenState.session && Config.session.enabled)
    readonly property real padding: Tokens.padding.large
    readonly property real clampedPadding: CUtils.clamp(padding - Config.border.thickness, 0, padding)
    property real offsetScale: shouldBeActive ? 0 : 1

    visible: offsetScale < 1
    anchors.topMargin: (-implicitHeight - 5) * offsetScale
    implicitWidth: Tokens.sizes.notifs.width
    implicitHeight: content.implicitHeight + padding + clampedPadding
    opacity: 1 - offsetScale

    Behavior on offsetScale {
        Anim {}
    }

    Connections {
        function onSidebarChanged(): void {
            if (root.screenState.sidebar)
                root.screenState.notifCenter = false;
        }

        target: root.screenState
    }

    Loader {
        id: content

        anchors.top: parent.top
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.topMargin: root.clampedPadding
        anchors.leftMargin: root.padding
        anchors.rightMargin: root.clampedPadding

        active: root.shouldBeActive || root.visible

        sourceComponent: Content {
            maxHeight: root.maxHeight - root.padding - root.clampedPadding
            props: root.sidebar.props
            screenState: root.screenState
        }
    }
}
