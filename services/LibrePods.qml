pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Bluetooth
import Quickshell.Services.SystemTray

// AirPods through LibrePods (github.com/kavishdevar/librepods), which speaks Apple's protocol over Bluetooth. Its
// tray item carries everything: the tooltip has the battery levels ("L: 80%⚡ R: 75% C: -") and the menu the
// listening modes and conversation awareness, so a stock LibrePods is all that's needed
Singleton {
    id: root

    readonly property SystemTrayItem tray: SystemTray.items.values.find(i => i.id === "librepods") ?? null
    // LibrePods keeps the last state after the AirPods disconnect, so Bluetooth tells whether they're connected
    readonly property BluetoothDevice device: findDevice(Bluetooth.devices.values)
    readonly property bool available: tray !== null && device !== null
    readonly property string name: device?.name || "AirPods"

    readonly property var left: battery("L", tray?.tooltipDescription ?? "")
    readonly property var right: battery("R", tray?.tooltipDescription ?? "")
    readonly property var caseBattery: battery("C", tray?.tooltipDescription ?? "")

    // Entries lose their button type when LibrePods updates them (only their check state is sent), so the known
    // labels count too
    readonly property list<QsMenuEntry> entries: menu.children.values
    readonly property list<QsMenuEntry> modes: entries.filter(e => e.buttonType === QsMenuButtonType.RadioButton || ["Off", "Noise Cancellation", "Transparency", "Adaptive"].includes(e.text))
    readonly property QsMenuEntry mode: modes.find(e => e.checkState === Qt.Checked) ?? null
    readonly property QsMenuEntry conversationAwareness: entries.find(e => e.buttonType === QsMenuButtonType.CheckBox || e.text === "Conversation Detection") ?? null
    readonly property QsMenuEntry openWindow: entries.find(e => e.text === "Open Window") ?? null

    // The AirPods by name, or else the only connected headphones (renamed AirPods)
    function findDevice(devices: list<BluetoothDevice>): BluetoothDevice {
        const connected = devices.filter(d => d.connected);
        const named = connected.find(d => /airpods/i.test(`${d.name} ${d.deviceName}`));
        if (named)
            return named;
        const headphones = connected.filter(d => d.icon.startsWith("audio-head"));
        return headphones.length === 1 ? headphones[0] : null;
    }

    // One bud or the case from the tooltip: level is -1 when unknown, present is false when it isn't there
    function battery(label: string, tooltip: string): var {
        const match = tooltip.match(new RegExp(`\\b${label}: (-|\\?|(\\d+)%)(⚡)?`));
        return {
            present: !!match && match[1] !== "-",
            level: match?.[2] ? parseInt(match[2], 10) : -1,
            charging: !!match?.[3]
        };
    }

    QsMenuOpener {
        id: menu

        menu: root.tray?.menu ?? null // qmllint disable incompatible-type
    }
}
