pragma Singleton

import QtQuick
import Quickshell
import Caelestia.Services
import qs.services

// Readings for the village (modules/live/village.js): how busy the computer is, what the weather is, whether music plays and
// whether a notification came. A source that is missing or failing counts as quiet. Cpu, Memory and the others only tick
// while something holds a reference to them, so they are only held while the village runs.
Singleton {
    id: root

    // Set by services/Village.qml while the village runs
    property bool active

    // The readings as the world takes them, renewed every two seconds
    property var readings: ({})
    // Notifications since the world last took the readings
    property int fresh
    property int lastCount: -1

    // A usage as a fraction, whichever of 0 to 1 and 0 to 100 a source reports
    function fraction(v: var): real {
        if (typeof v !== "number" || !isFinite(v))
            return 0;
        return Math.max(0, Math.min(1, v > 1.5 ? v / 100 : v));
    }

    function reading(v: var): var {
        return typeof v === "number" && isFinite(v) ? v : undefined;
    }

    function timeOf(text: var): var {
        const t = new Date(text).getTime();
        return isFinite(t) ? t : undefined;
    }

    function weather(): var {
        const cc = Weather.cc;
        if (!cc)
            return null;
        return {
            code: cc.weatherCode,
            tempC: cc.tempC,
            wind: cc.windSpeed,
            sunrise: timeOf(cc.sunrise),
            sunset: timeOf(cc.sunset)
        };
    }

    function sample(): void {
        const count = Notifs.list.length;
        if (lastCount >= 0 && count > lastCount)
            fresh += count - lastCount;
        lastCount = count;
        readings = {
            now: Date.now(),
            cpu: fraction(Cpu.percentage),
            gpu: fraction(Gpu.percentage),
            mem: fraction(Memory.percentage),
            disk: fraction(Storage.percentage),
            netDown: reading(NetworkUsage.downloadSpeed),
            netUp: reading(NetworkUsage.uploadSpeed),
            cpuTemp: reading(Cpu.temperature),
            gpuTemp: reading(Gpu.temperature),
            weather: weather(),
            audio: Players.list.some(p => p.isPlaying)
        };
    }

    // The notifications are handed over once, so a world that looks every tenth of a second counts each of them once
    function takeNotifications(): int {
        const n = fresh;
        fresh = 0;
        return n;
    }

    ServiceRef {
        service: root.active ? Cpu : null
    }

    ServiceRef {
        service: root.active ? Gpu : null
    }

    ServiceRef {
        service: root.active ? Memory : null
    }

    ServiceRef {
        service: root.active ? Storage : null
    }

    ServiceRef {
        service: root.active ? NetworkUsage : null
    }

    Timer {
        interval: 2000
        running: root.active
        repeat: true
        triggeredOnStart: true
        onTriggered: root.sample()
    }
}
