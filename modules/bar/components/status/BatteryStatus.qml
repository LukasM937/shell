import QtQuick
import Quickshell.Services.UPower
import Caelestia.State
import qs.components
import qs.services
import qs.utils

MaterialIcon {
    id: root

    required property color colour
    // Without a battery, the slot is a keep awake toggle instead
    readonly property bool desktop: !UPower.displayDevice.isLaptopBattery

    animate: true
    text: desktop ? "coffee" : Icons.getBatteryIcon(UPower.displayDevice.percentage, [UPowerDeviceState.Charging, UPowerDeviceState.FullyCharged, UPowerDeviceState.PendingCharge].includes(UPower.displayDevice.state))
    color: {
        if (desktop)
            return RuntimeState.inhibitIdle ? Colours.palette.m3primary : colour;
        return !UPower.onBattery || UPower.displayDevice.percentage > 0.2 ? colour : Colours.palette.m3error;
    }
    fill: !desktop || RuntimeState.inhibitIdle ? 1 : 0

    MouseArea {
        anchors.fill: parent
        enabled: root.desktop
        cursorShape: Qt.PointingHandCursor
        onClicked: RuntimeState.inhibitIdle = !RuntimeState.inhibitIdle
    }
}
