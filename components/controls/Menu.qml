pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import Quickshell
import Caelestia
import Caelestia.Config
import qs.components
import qs.components.containers
import qs.components.effects
import qs.services
import qs.modules.drawers

MouseArea {
    id: root

    enum Side {
        Top,
        Bottom,
        Left,
        Right
    }

    required property Item attachTo
    property int attachSideX: Menu.Right
    property int attachSideY: Menu.Bottom
    property int thisSideX: Menu.Right
    property int thisSideY: Menu.Top
    property real marginX
    property real marginY

    property list<MenuItem> items
    property MenuItem active: items[0] ?? null
    property bool expanded
    // Space kept between the menu and the window edges
    readonly property real edgeMargin: Tokens.padding.medium

    signal itemSelected(item: MenuItem)

    function mirrored(side: int): int {
        return side === Menu.Top ? Menu.Bottom : side === Menu.Bottom ? Menu.Top : side;
    }

    // Menu y for the given sides, in the parent's coordinates
    function placeY(attachSide: int, thisSide: int, margin: real, menuHeight: real): real {
        let off = attachSide === Menu.Top ? 0 : root.attachTo.height;
        if (thisSide === Menu.Bottom)
            off -= menuHeight;
        return root.attachTo.mapToItem(root.parent, 0, off).y + margin;
    }

    // How far a menu at y would stick out of the parent (window), edge margin included
    function overflowY(y: real, menuHeight: real): real {
        return Math.max(0, root.edgeMargin - y) + Math.max(0, y + menuHeight - (root.parent.height - root.edgeMargin));
    }

    parent: {
        const win = QsWindow.window;
        const contentWin = win as ContentWindow; // If inside the drawer content window, put it inside the interaction wrapper so hover works
        return contentWin ? contentWin.interactionWrapper : (win as QsWindow).contentItem;
    }
    anchors.fill: parent

    enabled: expanded
    hoverEnabled: expanded
    cursorShape: expanded ? Qt.ArrowCursor : undefined
    onClicked: expanded = false
    onExpandedChanged: {
        if (expanded)
            menu.flipped = menu.shouldFlip();
    }

    opacity: expanded ? 1 : 0
    layer.enabled: opacity < 1

    Behavior on opacity {
        Anim {
            type: Anim.DefaultEffects
        }
    }

    TransformWatcher {
        id: watcher

        a: root.parent
        b: root.attachTo
    }

    Elevation {
        id: menu

        readonly property int pad: Tokens.padding.extraSmall
        // Set when opening: the configured side, or the other one if it would be cut off there
        property bool flipped
        readonly property int effectiveThisSideY: flipped ? root.mirrored(root.thisSideY) : root.thisSideY

        function shouldFlip(): bool {
            const overflow = root.overflowY(root.placeY(root.attachSideY, root.thisSideY, root.marginY, height), height);
            if (overflow <= 0)
                return false;
            const flippedY = root.placeY(root.mirrored(root.attachSideY), root.mirrored(root.thisSideY), -root.marginY, height);
            return root.overflowY(flippedY, height) < overflow;
        }

        x: {
            CUtils.dependency(watcher.transform); // mapToItem is not reactive so this forces updates
            const item = root.attachTo;
            let off = root.attachSideX === Menu.Left ? 0 : item.width;
            if (root.thisSideX === Menu.Right)
                off -= width;
            const x = item.mapToItem(root.parent, off, 0).x + root.marginX;
            return Math.max(root.edgeMargin, Math.min(x, root.parent.width - width - root.edgeMargin));
        }
        y: {
            CUtils.dependency(watcher.transform); // mapToItem is not reactive so this forces updates
            const y = flipped ? root.placeY(root.mirrored(root.attachSideY), root.mirrored(root.thisSideY), -root.marginY, height) : root.placeY(root.attachSideY, root.thisSideY, root.marginY, height);
            // Too tall for either side: stay inside the window (the height is capped to fit)
            return Math.max(root.edgeMargin, Math.min(y, root.parent.height - height - root.edgeMargin));
        }

        radius: Tokens.rounding.large
        level: 2

        implicitWidth: Math.max(200, column.implicitWidth + pad * 2)
        implicitHeight: Math.min(column.implicitHeight + pad * 2, Math.max(0, root.parent.height - root.edgeMargin * 2))

        transform: Scale {
            yScale: root.expanded ? 1 : 0.1
            origin.y: menu.effectiveThisSideY === Menu.Bottom ? menu.height : 0

            Behavior on yScale {
                Anim {}
            }
        }

        MouseArea {
            anchors.fill: parent
            hoverEnabled: true
            onWheel: e => e.accepted = true
        }

        StyledRect {
            anchors.fill: parent
            radius: parent.radius
            color: Colours.palette.m3surfaceContainerLow

            // Scrolls when the menu is taller than the window allows
            StyledFlickable {
                id: flickable

                anchors.fill: parent
                anchors.margins: menu.pad
                contentHeight: column.implicitHeight
                interactive: contentHeight > height
                boundsBehavior: Flickable.StopAtBounds
                clip: interactive

                ColumnLayout {
                    id: column

                    width: flickable.width
                    spacing: 0

                    Repeater {
                        id: repeater

                        model: root.items

                        StyledRect {
                            id: item

                            required property int index
                            required property MenuItem modelData
                            readonly property bool active: modelData === root?.active

                            Layout.fillWidth: true
                            implicitWidth: menuOptionRow.implicitWidth + Tokens.padding.medium * 2
                            implicitHeight: menuOptionRow.implicitHeight + Tokens.padding.medium * 2

                            radius: active ? Tokens.rounding.medium : Tokens.rounding.extraSmall
                            topLeftRadius: index === 0 ? Tokens.rounding.medium : radius
                            topRightRadius: index === 0 ? Tokens.rounding.medium : radius
                            bottomLeftRadius: index === repeater?.count - 1 ? Tokens.rounding.medium : radius
                            bottomRightRadius: index === repeater?.count - 1 ? Tokens.rounding.medium : radius

                            color: Qt.alpha(Colours.palette.m3tertiaryContainer, active ? 1 : 0)

                            Behavior on radius {
                                Anim {}
                            }

                            StateLayer {
                                topLeftRadius: parent.topLeftRadius
                                topRightRadius: parent.topRightRadius
                                bottomLeftRadius: parent.bottomLeftRadius
                                bottomRightRadius: parent.bottomRightRadius

                                color: item.active ? Colours.palette.m3onTertiaryContainer : Colours.palette.m3onSurface
                                disabled: !root.expanded
                                onClicked: {
                                    root.itemSelected(item.modelData);
                                    root.active = item.modelData;
                                    item.modelData.clicked();
                                    root.expanded = false;
                                }
                            }

                            RowLayout {
                                id: menuOptionRow

                                anchors.fill: parent
                                anchors.margins: Tokens.padding.medium
                                spacing: Tokens.spacing.small

                                MaterialIcon {
                                    Layout.alignment: Qt.AlignVCenter
                                    text: item.modelData?.icon ?? ""
                                    color: item.active ? Colours.palette.m3onTertiaryContainer : Colours.palette.m3onSurfaceVariant
                                }

                                StyledText {
                                    Layout.alignment: Qt.AlignVCenter
                                    Layout.fillWidth: true
                                    text: item.modelData?.text ?? ""
                                    color: item.active ? Colours.palette.m3onTertiaryContainer : Colours.palette.m3onSurface
                                }

                                Loader {
                                    asynchronous: true
                                    Layout.alignment: Qt.AlignVCenter
                                    active: item.modelData?.trailingIcon.length > 0
                                    visible: active

                                    sourceComponent: MaterialIcon {
                                        text: item.modelData.trailingIcon
                                        color: item.active ? Colours.palette.m3onTertiaryContainer : Colours.palette.m3onSurfaceVariant
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
