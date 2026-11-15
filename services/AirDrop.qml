pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io
import Caelestia.Config

// Receiving AirDrop from iPhones and Macs for a few minutes at a time, with owly (the AWDL radio and receiver, from the AUR).
// On a Wi-Fi card that cannot share, owly takes the whole card while it runs, so the connection is down for as long as
// AirDrop is on. That is why it is a toggle that turns itself off after the ten minutes Apple's own "Everyone for 10
// minutes" lasts, and why switching it on from the menu asks for a second click. Only "Everyone" mode can be met: Contacts
// Only needs an identity signed by Apple.
Singleton {
    id: root

    readonly property string dir: `${Quickshell.env("HOME")}/Downloads/AirDrop`
    readonly property int minutes: 10
    property bool installed
    property bool checked
    // Asked once on the first click, the second click within a few seconds switches it on
    property bool armed
    property bool wanted
    property int left // seconds until it switches itself off
    property string error
    readonly property bool active: wanted && radio.running
    readonly property string state: !checked ? "unknown" : !installed ? "missing" : active ? "on" : wanted ? "starting" : armed ? "armed" : "off"
    property var seen: []
    property string lastLine

    function refresh(): void {
        if (!checkProc.running)
            checkProc.running = true;
    }

    // From the menu: install when missing, ask once, then start; on again stops it
    function toggle(): void {
        if (state === "on" || state === "starting")
            stop();
        else if (state === "missing")
            install();
        else if (state === "armed")
            start();
        else if (state === "off") {
            armed = true;
            armTimer.restart();
        }
    }

    function start(): void {
        if (!installed || wanted)
            return;
        armed = false;
        error = "";
        lastLine = "";
        left = minutes * 60;
        seen = [];
        wanted = true;
        Quickshell.execDetached(["mkdir", "-p", dir]);
        listProc.baseline = true;
        listProc.running = true;
        radio.running = true;
        receiveTimer.restart();
    }

    function stop(): void {
        if (!wanted && !radio.running && !receive.running)
            return;
        wanted = false;
        armed = false;
        receiveTimer.stop();
        receive.running = false;
        radio.running = false;
        listProc.baseline = false;
        listProc.running = true;
        // The radio gives the card back when it exits; if the connection does not come back on its own, ask for it
        recoverTimer.restart();
    }

    function install(): void {
        Quickshell.execDetached([...GlobalConfig.general.apps.terminal, "sh", "-c", `
            echo 'AirDrop receiving needs owly (AUR). It runs as your user and takes over the Wi-Fi card while it is on.'
            if command -v yay >/dev/null; then yay -S owly
            elif command -v paru >/dev/null; then paru -S owly
            else echo 'No AUR helper found, install owly by hand.'; fi
            echo; owly doctor
            echo; read -rp 'Press Enter to close ' _`]);
    }

    function notify(title: string, body: string): void {
        Quickshell.execDetached(["notify-send", "-a", "AirDrop", "-i", "send-to", title, body]);
    }

    Component.onCompleted: refresh()
    onActiveChanged: {
        if (active)
            countdown.restart();
        else
            countdown.stop();
    }

    Timer {
        id: armTimer

        interval: 6000
        onTriggered: root.armed = false
    }

    // The radio needs a moment to bring awdl0 up before the receiver can listen on it
    Timer {
        id: receiveTimer

        interval: 4000
        onTriggered: if (root.wanted)
            receive.running = true
    }

    Timer {
        id: countdown

        interval: 1000
        repeat: true
        onTriggered: {
            root.left--;
            if (root.left <= 0) {
                root.stop();
                root.notify("AirDrop is off", "Wi-Fi is coming back");
            } else if (root.left % 3 === 0 && !listProc.running) {
                listProc.running = true;
            }
        }
    }

    Timer {
        id: recoverTimer

        interval: 8000
        onTriggered: recoverProc.running = true
    }

    Process {
        id: checkProc

        command: ["sh", "-c", "command -v owly >/dev/null"]
        onExited: code => {
            root.installed = code === 0;
            root.checked = true;
        }
    }

    // `owly radio up` has to stay running for the radio to stay up
    Process {
        id: radio

        command: ["owly", "radio", "up"]
        stderr: SplitParser {
            onRead: line => root.lastLine = line
        }
        onExited: code => {
            if (root.wanted) {
                root.error = root.lastLine || `owly radio up stopped (${code})`;
                root.stop();
                root.notify("AirDrop stopped", root.error);
            }
        }
    }

    Process {
        id: receive

        command: ["owly", "receive", "--dir", root.dir]
        stderr: SplitParser {
            onRead: line => root.lastLine = line
        }
        onExited: code => {
            if (root.wanted && code !== 0) {
                root.error = root.lastLine || `owly receive stopped (${code})`;
                root.stop();
                root.notify("AirDrop stopped", root.error);
            }
        }
    }

    // New files in the folder are what tells that something arrived, owly has no documented way to say it
    Process {
        id: listProc

        property bool baseline

        command: ["ls", "-1A", root.dir]
        stdout: StdioCollector {
            onStreamFinished: {
                const names = text.split("\n").filter(n => n && !n.endsWith(".part"));
                if (!listProc.baseline) {
                    const fresh = names.filter(n => !root.seen.includes(n));
                    if (fresh.length > 0)
                        root.notify(fresh.length === 1 ? "AirDrop received" : "AirDrop received " + fresh.length + " files", fresh.join(", "));
                }
                root.seen = names;
                listProc.baseline = false;
            }
        }
    }

    Process {
        id: recoverProc

        command: ["sh", "-c", `
            nmcli -t -f TYPE,STATE device | grep -q '^wifi:connected' && exit 0
            dev=$(nmcli -t -f DEVICE,TYPE device | awk -F: '$2 == "wifi" { print $1; exit }')
            [ -n "$dev" ] && nmcli device connect "$dev"`]
    }

    IpcHandler {
        function get(): string {
            return root.state;
        }

        function on(): void {
            root.start();
        }

        function off(): void {
            root.stop();
        }

        function toggle(): void {
            if (root.wanted)
                root.stop();
            else
                root.start();
        }

        target: "airdrop"
    }
}
