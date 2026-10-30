pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import Quickshell
import Caelestia.Components
import Caelestia.Config
import Caelestia.I18n
import qs.components
import qs.components.controls
import qs.services

StyledRect {
    id: root

    required property ScreenState screenState

    // The mode just picked, shown until the AirPods confirm it
    property string pendingMode
    readonly property string shownMode: pendingMode || (LibrePods.mode?.text ?? "")
    readonly property list<var> batteries: [
        {
            label: Tr.trCtx("Left", "AirPods battery"),
            battery: LibrePods.left
        },
        {
            label: Tr.trCtx("Right", "AirPods battery"),
            battery: LibrePods.right
        },
        {
            label: Tr.trCtx("Case", "AirPods battery"),
            battery: LibrePods.caseBattery
        }
    ].filter(b => b.battery.present && b.battery.level >= 0)

    // LibrePods names the listening modes in English
    function modeName(mode: string): string {
        if (mode === "Off")
            return Tr.trCtx("Noise control off", "AirPods listening mode");
        if (mode === "Noise Cancellation")
            return Tr.trCtx("Noise cancellation", "AirPods listening mode");
        if (mode === "Transparency")
            return Tr.trCtx("Transparency", "AirPods listening mode");
        if (mode === "Adaptive")
            return Tr.trCtx("Adaptive", "AirPods listening mode");
        return mode;
    }

    function modeIcon(mode: string): string {
        if (mode === "Off")
            return "noise_control_off";
        if (mode === "Noise Cancellation")
            return "noise_control_on";
        if (mode === "Transparency")
            return "hearing";
        if (mode === "Adaptive")
            return "auto_awesome";
        return "graphic_eq";
    }

    function batteryIcon(battery: var): string {
        if (battery.charging)
            return "battery_charging_full";
        if (battery.level >= 95)
            return "battery_full";
        return `battery_${Math.max(0, Math.round(battery.level / 100 * 6))}_bar`;
    }

    implicitHeight: layout.implicitHeight + Tokens.padding.extraLargeIncreased

    radius: Tokens.rounding.large
    color: Colours.tPalette.m3surfaceContainer

    Connections {
        // The old mode is unchecked a moment before the new one is checked
        function onModeChanged(): void {
            if (LibrePods.mode)
                root.pendingMode = "";
        }

        target: LibrePods
    }

    Timer {
        id: pendingTimeout

        interval: 3000
        onTriggered: root.pendingMode = ""
    }

    ColumnLayout {
        id: layout

        anchors.fill: parent
        anchors.margins: Tokens.padding.large
        spacing: Tokens.spacing.medium

        RowLayout {
            Layout.fillWidth: true
            spacing: Tokens.spacing.medium

            StyledRect {
                implicitWidth: implicitHeight
                implicitHeight: icon.implicitHeight + Tokens.padding.large

                radius: Tokens.rounding.full
                color: Colours.palette.m3secondaryContainer

                MaterialIcon {
                    id: icon

                    anchors.centerIn: parent
                    text: "earbuds"
                    color: Colours.palette.m3onSecondaryContainer
                    fontStyle: Tokens.font.icon.large
                }
            }

            ColumnLayout {
                Layout.fillWidth: true
                spacing: 0

                StyledText {
                    Layout.fillWidth: true
                    text: LibrePods.name
                    font: Tokens.font.body.medium
                    elide: Text.ElideRight
                }

                StyledText {
                    Layout.fillWidth: true
                    text: root.shownMode ? root.modeName(root.shownMode) : Tr.trCtx("Connected", "AirPods")
                    color: Colours.palette.m3onSurfaceVariant
                    font: Tokens.font.body.small
                    elide: Text.ElideRight
                }
            }

            IconButton {
                visible: LibrePods.openWindow !== null
                type: IconButton.Text
                icon: "open_in_new"
                onClicked: {
                    root.screenState.utilities = false;
                    LibrePods.openWindow?.triggered();
                }
            }
        }

        RowLayout {
            Layout.fillWidth: true
            visible: root.batteries.length > 0
            spacing: Tokens.spacing.small

            Repeater {
                model: root.batteries

                StyledRect {
                    id: chip

                    required property var modelData

                    Layout.fillWidth: true
                    implicitHeight: chipLayout.implicitHeight + Tokens.padding.small * 2

                    radius: Tokens.rounding.full
                    color: Colours.layer(Colours.palette.m3surfaceContainerHighest, 2)

                    RowLayout {
                        id: chipLayout

                        anchors.centerIn: parent
                        spacing: Tokens.spacing.extraSmall

                        MaterialIcon {
                            text: root.batteryIcon(chip.modelData.battery)
                            color: chip.modelData.battery.charging ? Colours.palette.m3primary : chip.modelData.battery.level <= 15 ? Colours.palette.m3error : Colours.palette.m3onSurfaceVariant
                            fontStyle: Tokens.font.icon.small
                        }

                        StyledText {
                            // TRANSLATORS: %1 = Left, Right or Case, %2 = the battery level
                            text: Tr.trCtx("%1 %2%", "AirPods battery").arg(chip.modelData.label).arg(chip.modelData.battery.level)
                            font: Tokens.font.body.small
                        }
                    }
                }
            }
        }

        RowLayout {
            Layout.fillWidth: true
            spacing: Tokens.spacing.small

            ButtonRow {
                Layout.fillWidth: true
                spacing: Tokens.spacing.small

                Repeater {
                    model: LibrePods.modes

                    Toggle {
                        required property QsMenuEntry modelData

                        icon: root.modeIcon(modelData.text)
                        checked: modelData.text === root.shownMode
                        onClicked: {
                            // A mode stays picked when clicked again
                            internalChecked = checked;
                            root.pendingMode = modelData.text;
                            pendingTimeout.restart();
                            modelData.triggered();
                        }
                    }
                }
            }

            Toggle {
                visible: LibrePods.conversationAwareness !== null
                fillWidth: false
                icon: "record_voice_over"
                checked: LibrePods.conversationAwareness?.checkState === Qt.Checked
                disabled: !(LibrePods.conversationAwareness?.enabled ?? false)
                onClicked: LibrePods.conversationAwareness?.triggered()
            }
        }
    }

    component Toggle: IconButton {
        inactiveColour: Colours.layer(Colours.palette.m3surfaceContainerHighest, 2)
        fillWidth: true
        isToggle: true
        isRound: true
        shapeMorph: true
    }
}
