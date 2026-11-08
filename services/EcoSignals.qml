pragma Singleton

import "../modules/lock/ecosignals.js" as Mapping
import QtQuick
import Quickshell
import Quickshell.Bluetooth
import Quickshell.Io
import Caelestia.Config
import Caelestia.Services
import qs.services

// Readings from the system for the lock screen ecosystem (modules/lock/EcoWorld.qml), and whether the computer is busy
// for the idle chain. A source that is switched off, missing or failing gives the idle baseline, never zero.
Singleton {
    id: root

    // Whether the last five minutes were busy, so the idle chain holds the screensaver back during a long build or download.
    // Cpu.percentage is a fraction, the traffic is bytes per second and a KB here is 1000 bytes
    readonly property bool busy: cpuAverage * 100 >= GlobalConfig.general.idle.busyCpuPercent || netAverage / 1000 >= GlobalConfig.general.idle.busyNetworkKBs
    // Set by EcoWorld while the screensaver runs. The pings and the neighbour list only run then, so nothing goes out
    // on the network otherwise
    property bool active

    readonly property var inputs: ({
            rain: root.rainLevel,
            lightning: GlobalConfig.lock.screensaver.ping ? root.lightningLevel : Mapping.LIGHTNING_BASE,
            springs: GlobalConfig.lock.screensaver.bluetooth ? Math.round(root.springLevel) : 0,
            groves: GlobalConfig.lock.screensaver.neighbours ? Mapping.groves(root.neighbours) : [],
            islands: GlobalConfig.lock.screensaver.wifi ? Mapping.islands(Nmcli.networks.map(n => ({
                        bssid: n.bssid,
                        strength: n.strength
                    }))) : [],
            ssid: GlobalConfig.lock.screensaver.wifi ? (Nmcli.active?.ssid ?? "") : ""
        })

    // Each level only ever holds a finite number, so inputs never carries undefined or NaN
    property real rainLevel: Mapping.RAIN_BASE
    property real lightningLevel: Mapping.LIGHTNING_BASE
    property real springLevel: 0
    property var pings: []
    property var neighbours: []
    property string gateway

    // A 5 minute window of 10 s samples
    property var cpuSamples: []
    property var netSamples: []
    property real cpuAverage
    property real netAverage

    function finite(v: var): bool {
        return typeof v === "number" && isFinite(v);
    }

    function smoothed(prev: real, next: var, base: real): real {
        const v = Mapping.smooth(prev, next);
        return finite(v) ? v : base;
    }

    function average(list: var): real {
        return list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0;
    }

    // Only names and addresses reach the command line, so a config value cannot pass an option to ping
    function validHost(host: string): bool {
        return /^[A-Za-z0-9.:-]+$/.test(host) && !host.startsWith("-");
    }

    function sample(): void {
        const cpu = finite(Cpu.percentage) ? Cpu.percentage : 0;
        const down = finite(NetworkUsage.downloadSpeed) ? NetworkUsage.downloadSpeed : 0;
        const up = finite(NetworkUsage.uploadSpeed) ? NetworkUsage.uploadSpeed : 0;
        cpuSamples = [...cpuSamples, cpu].slice(-30);
        netSamples = [...netSamples, down + up].slice(-30);
        cpuAverage = average(cpuSamples);
        netAverage = average(netSamples);

        rainLevel = smoothed(rainLevel, Mapping.rain(down, GlobalConfig.lock.screensaver.heat ? Cpu.temperature : undefined), Mapping.RAIN_BASE);
        const connected = (Bluetooth.devices?.values ?? []).filter(d => d?.connected).length;
        springLevel = smoothed(springLevel, Mapping.springCount(connected), 0);
    }

    function addPing(ok: bool): void {
        pings = [...pings, ok].slice(-Mapping.PING_WINDOW);
        lightningLevel = smoothed(lightningLevel, Mapping.lightning(pings), Mapping.LIGHTNING_BASE);
    }

    // ping exits 1 when no reply came and 2 when it could not try (no raw socket, unknown host, no route). Only a missing
    // reply is loss; an error would otherwise hold the lightning at its maximum for good
    function pingExited(exitCode: int): void {
        if (exitCode === 0)
            addPing(true);
        else if (exitCode === 1)
            addPing(false);
    }

    function pingRound(): void {
        if (!routeProc.running)
            routeProc.running = true;
        const host = GlobalConfig.lock.screensaver.pingHost;
        if (validHost(host) && !hostPing.running) {
            hostPing.command = ["ping", "-c1", "-W2", host];
            hostPing.running = true;
        }
    }

    function pingGateway(): void {
        if (validHost(gateway) && !gatewayPing.running) {
            gatewayPing.command = ["ping", "-c1", "-W2", gateway];
            gatewayPing.running = true;
        }
    }

    // ip -j neigh gives [{dst, dev, lladdr, state: ["REACHABLE"]}]; old iproute2 without -j prints text and lands in catch
    function parseNeighbours(text: string): var {
        try {
            const list = JSON.parse(text);
            if (!Array.isArray(list))
                return [];
            return list.filter(n => n && typeof n.lladdr === "string" && !(n.state ?? []).some(s => s === "FAILED" || s === "INCOMPLETE")).map(n => n.lladdr);
        } catch (e) {
            return [];
        }
    }

    // A fresh start, so pings and neighbours from an earlier screensaver, maybe on another network, do not shape this one
    onActiveChanged: {
        if (active) {
            pings = [];
            lightningLevel = Mapping.LIGHTNING_BASE;
            neighbours = [];
        }
    }

    // Cpu and NetworkUsage only tick while something holds a reference, and busy needs them all the time; they read
    // /proc about once a second (dashboard.resourceUpdateInterval)
    ServiceRef {
        service: Cpu
    }

    ServiceRef {
        service: NetworkUsage
    }

    Timer {
        interval: 10000
        running: true
        repeat: true
        onTriggered: root.sample()
    }

    Timer {
        interval: 30000
        running: root.active && GlobalConfig.lock.screensaver.ping
        repeat: true
        triggeredOnStart: true
        onTriggered: root.pingRound()
    }

    Timer {
        interval: 60000
        running: root.active && GlobalConfig.lock.screensaver.neighbours
        repeat: true
        triggeredOnStart: true
        onTriggered: {
            if (!neighProc.running)
                neighProc.running = true;
        }
    }

    // ip route without -6 lists IPv4 only, whose gateway ping needs no interface scope
    Process {
        id: routeProc

        command: ["ip", "route", "show", "default"]
        stdout: StdioCollector {
            onStreamFinished: {
                root.gateway = text.match(/^default via (\S+)/m)?.[1] ?? "";
                root.pingGateway();
            }
        }
    }

    // A ping that cannot start (not installed) never exits and so adds no reading
    Process {
        id: gatewayPing

        onExited: exitCode => root.pingExited(exitCode)
    }

    Process {
        id: hostPing

        onExited: exitCode => root.pingExited(exitCode)
    }

    Process {
        id: neighProc

        command: ["ip", "-j", "neigh", "show"]
        stdout: StdioCollector {
            onStreamFinished: root.neighbours = root.parseNeighbours(text)
        }
    }
}
