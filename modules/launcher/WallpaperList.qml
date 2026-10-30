pragma ComponentBehavior: Bound

import "items"
import QtQuick
import Quickshell
import Caelestia.Config
import Caelestia.I18n
import qs.components
import qs.components.controls
import qs.services

PathView {
    id: root

    required property SearchBar search
    required property var screenState
    required property var panels
    required property var content

    readonly property int itemWidth: Tokens.sizes.launcher.wallpaperWidth * 0.8 + Tokens.padding.medium * 2

    // Coverflow: the front cover is flat, the others are turned away and overlap
    readonly property real frontGap: itemWidth * 0.85
    readonly property real sideSpacing: itemWidth * 0.5
    readonly property real headerHeight: header.implicitHeight + Tokens.spacing.small

    readonly property int numItems: {
        const screen = (QsWindow.window as QsWindow)?.screen;
        if (!screen)
            return 0;

        // Screen width - 4x outer rounding - 2x max side thickness (cause centered)
        const barMargins = Math.max(Config.border.thickness, panels.bar.implicitWidth);
        let outerMargins = 0;
        if (panels.popouts.hasCurrent && panels.popouts.currentCenter + panels.popouts.nonAnimHeight / 2 > screen.height - content.implicitHeight - Config.border.thickness * 2)
            outerMargins = panels.popouts.nonAnimWidth;
        if ((screenState.utilities || screenState.sidebar) && panels.utilities.implicitWidth > outerMargins)
            outerMargins = panels.utilities.implicitWidth;
        const maxWidth = screen.width - Config.border.rounding * 4 - (barMargins + outerMargins) * 2;

        if (maxWidth <= 0)
            return 0;

        let maxItemsOnScreen = 1;
        while (widthFor(maxItemsOnScreen + 2) <= maxWidth)
            maxItemsOnScreen += 2;
        const visible = Math.min(maxItemsOnScreen, Config.launcher.maxWallpapers, scriptModel.values.length);

        if (visible === 2)
            return 1;
        if (visible > 1 && visible % 2 === 0)
            return visible - 1;
        return visible;
    }

    function widthFor(items: int): real {
        if (items <= 1)
            return itemWidth;
        return (frontGap + Math.max(0, (items - 1) / 2 - 1) * sideSpacing) * 2 + itemWidth * 0.7;
    }

    model: ScriptModel {
        id: scriptModel

        readonly property string search: root.search.text.split(" ").slice(1).join(" ")

        values: WallpaperDiscover.online ? WallpaperDiscover.shownResults : WallpaperDiscover.filterLocal(Wallpapers.query(search))
        onValuesChanged: {
            // Keep the place when more results are appended
            if (WallpaperDiscover.online) {
                if (WallpaperDiscover.page === 1)
                    root.currentIndex = 0;
                return;
            }
            const current = values.findIndex(w => w.path === Wallpapers.actualCurrent);
            root.currentIndex = search || current < 0 ? 0 : current;
        }
    }

    Component.onCompleted: {
        currentIndex = Math.max(0, Wallpapers.list.findIndex(w => w.path === Wallpapers.actualCurrent));
        WallpaperDiscover.analyseLocal();
    }
    Component.onDestruction: {
        Wallpapers.stopPreview();
        WallpaperDiscover.online = false;
    }

    onCurrentItemChanged: {
        const item = currentItem as WallpaperItem;
        if (!item)
            return;
        if (item.modelData.online)
            Wallpapers.stopPreview();
        else
            Wallpapers.preview(item.modelData.path);
    }

    onCurrentIndexChanged: {
        if (WallpaperDiscover.online && currentIndex >= count - 4)
            WallpaperDiscover.search(true);
    }

    implicitWidth: Math.max(widthFor(Math.min(numItems, count)), header.implicitWidth)
    pathItemCount: numItems
    cacheItemCount: 4

    snapMode: PathView.SnapToItem
    preferredHighlightBegin: 0.5
    preferredHighlightEnd: 0.5
    highlightRangeMode: PathView.StrictlyEnforceRange

    delegate: WallpaperItem {
        screenState: root.screenState
    }

    path: Path {
        id: path

        readonly property real centreX: root.width / 2
        readonly property real centreY: root.headerHeight + (root.height - root.headerHeight) / 2
        readonly property real step: 1 / Math.max(root.pathItemCount, 3)
        readonly property real sideLength: Math.max(0, (root.pathItemCount - 1) / 2 - 1) * root.sideSpacing

        startX: centreX - root.frontGap - sideLength
        startY: centreY

        PathAttribute {
            name: "z"
            value: 0
        }
        PathAttribute {
            name: "angle"
            value: 55
        }
        PathLine {
            x: path.centreX - root.frontGap
            y: path.centreY
        }
        PathPercent {
            value: 0.5 - path.step
        }
        PathAttribute {
            name: "z"
            value: 0.9
        }
        PathAttribute {
            name: "angle"
            value: 55
        }
        PathLine {
            x: path.centreX
            y: path.centreY
        }
        PathPercent {
            value: 0.5
        }
        PathAttribute {
            name: "z"
            value: 1
        }
        PathAttribute {
            name: "angle"
            value: 0
        }
        PathLine {
            x: path.centreX + root.frontGap
            y: path.centreY
        }
        PathPercent {
            value: 0.5 + path.step
        }
        PathAttribute {
            name: "z"
            value: 0.9
        }
        PathAttribute {
            name: "angle"
            value: -55
        }
        PathLine {
            x: path.centreX + root.frontGap + path.sideLength
            y: path.centreY
        }
        PathPercent {
            value: 1
        }
        PathAttribute {
            name: "z"
            value: 0
        }
        PathAttribute {
            name: "angle"
            value: -55
        }
    }

    CustomMouseArea {
        function onWheel(event: WheelEvent): void {
            if (event.angleDelta.y > 0)
                root.decrementCurrentIndex();
            else if (event.angleDelta.y < 0)
                root.incrementCurrentIndex();
        }

        anchors.fill: parent
    }

    Row {
        id: header

        anchors.top: parent.top
        anchors.horizontalCenter: parent.horizontalCenter
        z: 2
        spacing: Tokens.spacing.large

        Row {
            anchors.verticalCenter: parent.verticalCenter
            spacing: Tokens.spacing.extraSmall

            IconTextButton {
                type: IconTextButton.Tonal
                icon: "folder"
                text: Tr.tr("Local")
                internalChecked: !WallpaperDiscover.online
                onClicked: WallpaperDiscover.online = false
            }

            IconTextButton {
                type: IconTextButton.Tonal
                icon: WallpaperDiscover.classifier === "on" ? "verified_user" : "travel_explore"
                text: Tr.tr("Discover")
                internalChecked: WallpaperDiscover.online
                onClicked: WallpaperDiscover.online = true
            }
        }

        Row {
            anchors.verticalCenter: parent.verticalCenter
            spacing: Tokens.spacing.extraSmall

            Repeater {
                model: ["", ...WallpaperDiscover.colours]

                StyledRect {
                    id: dot

                    required property string modelData
                    readonly property bool selected: WallpaperDiscover.colour === modelData

                    // Roughly what each filter matches, so fixed rather than from the scheme
                    readonly property var swatches: ({
                            dark: "#1b1d2b",
                            red: "#e05561",
                            orange: "#ef8e3b",
                            yellow: "#e8c45a",
                            green: "#76c25b",
                            teal: "#4fb8b0",
                            blue: "#4f86de",
                            purple: "#8d68d8",
                            pink: "#de68a8"
                        })

                    anchors.verticalCenter: parent.verticalCenter
                    implicitWidth: Tokens.font.icon.large.pointSize * 1.4
                    implicitHeight: implicitWidth
                    radius: Tokens.rounding.full
                    color: swatches[modelData] ?? "transparent"
                    border.width: selected ? 2 : 1
                    border.color: selected ? Colours.palette.m3primary : Colours.palette.m3outlineVariant

                    MaterialIcon {
                        anchors.centerIn: parent
                        visible: !dot.modelData || dot.selected
                        text: dot.modelData ? "check" : "palette"
                        color: dot.modelData ? "white" : Colours.palette.m3onSurfaceVariant
                        fontStyle: Tokens.font.icon.small
                    }

                    StateLayer {
                        radius: Tokens.rounding.full
                        onClicked: WallpaperDiscover.colour = dot.modelData
                    }
                }
            }
        }

        IconTextButton {
            anchors.verticalCenter: parent.verticalCenter
            type: IconTextButton.Tonal
            icon: "auto_awesome"
            text: Tr.tr("Fits theme")
            internalChecked: WallpaperDiscover.fitTheme
            onClicked: WallpaperDiscover.fitTheme = !WallpaperDiscover.fitTheme
        }

        IconTextButton {
            anchors.verticalCenter: parent.verticalCenter
            type: IconTextButton.Tonal
            icon: WallpaperDiscover.auto === "daily" ? "today" : WallpaperDiscover.auto === "timeOfDay" ? "schedule" : "sync_disabled"
            text: WallpaperDiscover.auto === "daily" ? Tr.tr("Daily") : WallpaperDiscover.auto === "timeOfDay" ? Tr.tr("Time of day") : Tr.tr("Fixed")
            internalChecked: WallpaperDiscover.auto !== "off"
            onClicked: WallpaperDiscover.cycleAuto()
        }
    }

    Binding {
        target: WallpaperDiscover
        property: "query"
        value: scriptModel.search
    }
}
