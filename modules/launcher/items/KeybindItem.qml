pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Widgets
import Caelestia.Config
import Caelestia.I18n
import qs.components
import qs.services
import qs.utils

Item {
    id: root

    required property var modelData
    required property var list

    readonly property bool isApp: (modelData?.appClass ?? "").length > 0
    readonly property list<string> keys: modelData?.keys ?? []

    // Symbols for keys whose names are long or cryptic
    function keyText(key: string): string {
        const names = {
            SUPER: "Super",
            CTRL: "Ctrl",
            ALT: "Alt",
            SHIFT: "Shift",
            Comma: ",",
            Period: ".",
            Minus: "−",
            Equal: "=",
            Plus: "+",
            Slash: "/",
            slash: "/",
            Backslash: "\\",
            Grave: "`",
            Left: "←",
            Right: "→",
            Up: "↑",
            Down: "↓",
            arrows: "←↑→↓",
            Escape: "Esc",
            Return: "Enter",
            Delete: "Del",
            XF86AudioPlay: "Play",
            XF86AudioPause: "Pause",
            XF86AudioStop: "Stop",
            XF86AudioNext: "Next",
            XF86AudioPrev: "Previous",
            XF86AudioMute: "Mute",
            XF86AudioMicMute: "Mic mute",
            XF86AudioRaiseVolume: "Volume +",
            XF86AudioLowerVolume: "Volume −",
            XF86MonBrightnessUp: "Brightness +",
            XF86MonBrightnessDown: "Brightness −"
        };
        return names[key] ?? key;
    }

    function comboText(combo: string): string {
        return combo.split(" + ").map(keyText).join(" ");
    }

    function sectionIcon(section: string): string {
        const s = section.toLowerCase();
        const icons = [["workspace", "workspaces"], ["window", "select_window"], ["media", "music_note"], ["volume", "volume_up"], ["brightness", "brightness_6"], ["app", "apps"], ["clipboard", "content_paste"], ["utilit", "build"]];
        return icons.find(([match]) => s.includes(match))?.[1] ?? "keyboard";
    }

    implicitHeight: Tokens.sizes.launcher.itemHeight

    anchors.left: parent?.left
    anchors.right: parent?.right

    StateLayer {
        radius: Tokens.rounding.large
        onClicked: root.modelData?.onClicked(root.list)
    }

    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: Tokens.padding.medium
        anchors.rightMargin: Tokens.padding.medium
        anchors.margins: Tokens.padding.small
        spacing: Tokens.spacing.medium

        Item {
            Layout.alignment: Qt.AlignVCenter
            implicitWidth: Tokens.font.icon.large.pointSize * 1.8
            implicitHeight: implicitWidth

            IconImage {
                anchors.centerIn: parent
                visible: root.isApp
                asynchronous: true
                source: root.isApp ? Icons.getAppIcon(root.modelData.appClass, "image-missing") : ""
                implicitSize: parent.width
            }

            MaterialIcon {
                anchors.centerIn: parent
                visible: !root.isApp
                text: root.sectionIcon(root.modelData?.section ?? "")
                color: Colours.palette.m3onSurfaceVariant
                fontStyle: Tokens.font.icon.builders.large.scale(1.3).build()
            }
        }

        ColumnLayout {
            Layout.alignment: Qt.AlignVCenter
            Layout.fillWidth: true
            spacing: 0

            StyledText {
                Layout.fillWidth: true
                text: root.modelData?.name ?? ""
                font: Tokens.font.body.medium
                elide: Text.ElideRight
            }

            StyledText {
                Layout.fillWidth: true
                // TRANSLATORS: %1 = keybind section, %2 = other key combinations for the same action
                text: root.keys.length > 1 ? Tr.tr("%1 · also %2").arg(root.modelData.section).arg(root.keys.slice(1).map(root.comboText).join(", ")) : (root.modelData?.section ?? "")
                font: Tokens.font.body.small
                color: root.isApp ? Colours.palette.m3primary : Colours.palette.m3outline
                elide: Text.ElideRight
            }
        }

        Row {
            Layout.alignment: Qt.AlignVCenter
            spacing: Tokens.spacing.extraSmall

            Repeater {
                model: root.keys[0]?.split(" + ") ?? []

                StyledRect {
                    id: chip

                    required property string modelData

                    implicitWidth: Math.max(implicitHeight, chipText.implicitWidth + Tokens.padding.small * 2)
                    implicitHeight: chipText.implicitHeight + Tokens.padding.extraSmall * 2
                    radius: Tokens.rounding.small
                    color: root.isApp ? Colours.palette.m3primaryContainer : Colours.tPalette.m3surfaceContainerHighest

                    StyledText {
                        id: chipText

                        anchors.centerIn: parent
                        text: root.keyText(chip.modelData)
                        color: root.isApp ? Colours.palette.m3onPrimaryContainer : Colours.palette.m3onSurface
                        font: Tokens.font.label.medium
                    }
                }
            }
        }
    }
}
