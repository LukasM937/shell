pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import qs.services

// Stay active: the screen turns off, the computer keeps running. While it is on, the idle timeouts that would sleep,
// power off or log out are held back (daemons/IdleMonitors.qml); locking and the screen timeout still happen.
// It also turns on by itself when the TV goes to standby, and off again when the TV comes back
Singleton {
    id: root

    readonly property alias enabled: props.enabled
    readonly property alias enabledSince: props.enabledSince
    // Turned on because the TV went away rather than by hand
    readonly property alias automatic: props.automatic
    // Set by the idle timeouts while they have the screen asleep. A TV may then go to standby for lack of signal, which
    // isn't the user turning it off, so the computer may still sleep
    property bool screenAsleep

    function enable(): void {
        if (!props.enabled)
            props.enabledSince = new Date();
        props.enabled = true;
        props.automatic = false;
        screenOff();
    }

    function disable(): void {
        props.enabled = false;
        props.automatic = false;
        props.screenOffRequested = false;
    }

    // The screen goes off once input has settled for a moment, so the click or key press that asked for it doesn't
    // wake it straight away. Any input turns it back on
    function screenOff(): void {
        props.screenOffRequested = true;
    }

    function setDpms(on: bool): void {
        Hypr.dispatch(Hypr.usingLua ? `hl.dsp.dpms({ action = "${on ? "enable" : "disable"}" })` : `dpms ${on ? "on" : "off"}`);
    }

    function tvOff(): void {
        if (props.tvAway || screenAsleep)
            return;
        props.tvAway = true;
        if (!props.enabled) {
            props.enabledSince = new Date();
            props.enabled = true;
            props.automatic = true;
        }
        screenOff();
    }

    function tvOn(): void {
        if (!props.tvAway)
            return;
        props.tvAway = false;
        props.screenOffRequested = false;
        if (props.automatic)
            disable();
        // Also wakes a screen the idle timeout turned off, so the TV doesn't come back to no signal
        setDpms(true);
    }

    PersistentProperties {
        id: props

        property bool enabled
        property date enabledSince
        property bool automatic
        property bool tvAway
        property bool screenOffRequested

        reloadableId: "stayActive"
    }

    IdleMonitor {
        id: offMonitor

        enabled: props.screenOffRequested
        timeout: 1
        respectInhibitors: false
        onIsIdleChanged: {
            // Turning the monitor off ends its idle state too, which isn't input
            if (!props.screenOffRequested)
                return;
            root.setDpms(!isIdle);
            if (!isIdle)
                props.screenOffRequested = false;
        }
    }

    // HDMI-CEC tells when the TV goes to standby or comes back. That needs a CEC device (a USB adapter or a graphics
    // card that passes CEC through, see /dev/cec*) and cec-ctl from v4l-utils; without one this checks again each minute
    Process {
        id: cec

        running: true
        command: ["sh", "-c", "for d in /dev/cec*; do [ -c \"$d\" ] && exec stdbuf -oL cec-ctl -d \"$d\" --playback --osd-name Caelestia --monitor; done; exit 1"]
        stdout: SplitParser {
            onRead: line => {
                const msg = line.match(/Received from TV to .*?\):\s*([A-Z_]+)/)?.[1];
                if (msg === "STANDBY")
                    root.tvOff();
                else if (["SET_STREAM_PATH", "ROUTING_CHANGE", "REQUEST_ACTIVE_SOURCE", "USER_CONTROL_PRESSED"].includes(msg))
                    root.tvOn();
            }
        }
        onExited: cecRetry.start()
    }

    Timer {
        id: cecRetry

        interval: 60000
        onTriggered: cec.running = true
    }

    // A TV that drops the HDMI connection in standby takes its screen away. Connections can bounce, so this waits a moment
    Connections {
        function onScreensChanged(): void {
            hotplug.restart();
        }

        target: Quickshell
    }

    Timer {
        id: hotplug

        interval: 2000
        onTriggered: {
            // Without screens Qt keeps a nameless placeholder and Hyprland a fallback output
            if (Quickshell.screens.some(s => s.name && !s.name.startsWith("FALLBACK") && !s.name.startsWith("HEADLESS")))
                root.tvOn();
            else
                root.tvOff();
        }
    }

    IpcHandler {
        function isEnabled(): bool {
            return props.enabled;
        }

        function enable(): void {
            root.enable();
        }

        function disable(): void {
            root.disable();
        }

        function toggle(): void {
            if (props.enabled)
                root.disable();
            else
                root.enable();
        }

        function screenOff(): void {
            root.screenOff();
        }

        target: "stayActive"
    }
}
