pragma Singleton

import "../modules/live/village.js" as Sim
import QtQuick
import Quickshell
import Quickshell.Io
import qs.services
import qs.utils

// Owns the village of the live wallpaper: creates or loads the world, steps it ten times a second with the readings of
// VillageSignals and keeps it in $XDG_STATE_HOME/caelestia/village.json. A singleton so the wallpaper on every screen draws the
// same village and the settings page and the IPC target can reset it. The world stays in memory after a stop and picks up
// where it was; nothing happens while the wallpaper is not the village, the screen is asleep or the shell is not running.
Singleton {
    id: root

    // Set by LiveWallpaper while the village is the wallpaper
    property bool wanted
    // How much faster than the clock the village lives, from the settings
    property real speed: 1
    property var world: null
    // Seconds of village time still to be run quickly, and how many have been
    property real skipLeft
    property real skipped
    readonly property bool running: wanted && !StayActive.screenAsleep
    // What the state file held when it was read; null when there was none or it did not fit
    property var saved: null
    property bool fileReady
    property real lastTick: Date.now()

    // The same village for the same user, so a reset gives the same land again
    function seed(): int {
        const name = Quickshell.env("USER") || "village";
        let h = 2166136261;
        for (let i = 0; i < name.length; i++)
            h = Math.imul(h ^ name.charCodeAt(i), 16777619);
        return (h >>> 0) % 100000 + 1;
    }

    function newWorld(fromSave: bool): void {
        world = Sim.create({
            seed: seed(),
            saved: fromSave ? saved : null,
            now: Date.now()
        });
    }

    function start(): void {
        if (!fileReady || world)
            return;
        newWorld(true);
    }

    function reset(): void {
        saved = null;
        newWorld(false);
        save();
    }

    // Lets the village live hours at once, for watching it grow: one second of village time per step
    function skip(hours: real): void {
        if (world && hours > 0)
            skipLeft += hours * 3600;
    }

    function census(): string {
        if (!world)
            return "{}";
        const c = Sim.census(world);
        c.hour = world.env.hour;
        c.season = world.env.season;
        c.weather = world.env.kind;
        c.snow = world.env.snowCover;
        c.hungry = !!world.hungry;
        return JSON.stringify(c);
    }

    function save(): void {
        if (!world || !fileReady)
            return;
        saved = Sim.snapshot(world);
        file.setText(JSON.stringify(saved));
    }

    // One tick of at most a second of village time, however long the shell or the computer slept
    function tick(): void {
        if (!world)
            return;
        const now = Date.now();
        const dt = Math.max(0.02, Math.min(1, (now - lastTick) / 1000));
        lastTick = now;
        const s = Object.assign({}, VillageSignals.readings);
        s.now = now + skipped * 1000;
        s.notifs = VillageSignals.takeNotifications();
        Sim.setSignals(world, s);
        if (skipLeft > 0) {
            // Quick time: up to 150 steps a tick, each a second, with the clock moving along
            const n = Math.min(150, Math.ceil(skipLeft));
            for (let i = 0; i < n; i++) {
                s.now = now + (skipped + i) * 1000;
                s.notifs = 0;
                Sim.setSignals(world, s);
                Sim.step(world, 1);
            }
            skipLeft -= n;
            skipped += n;
            if (skipLeft <= 0)
                skipped = 0;
            return;
        }
        const total = dt * Math.max(0.1, speed);
        const parts = Math.max(1, Math.ceil(total / 0.5));
        for (let i = 0; i < parts; i++)
            Sim.step(world, total / parts);
    }

    onWantedChanged: {
        if (wanted)
            start();
        else
            save();
    }
    onFileReadyChanged: {
        if (fileReady && wanted)
            start();
    }

    Binding {
        target: VillageSignals
        property: "active"
        value: root.wanted
    }

    // About ten steps a second, which is what the art is drawn at
    Timer {
        interval: 100
        running: root.running && !!root.world
        repeat: true
        onTriggered: root.tick()
    }

    Timer {
        interval: 300000
        running: root.wanted && !!root.world
        repeat: true
        onTriggered: root.save()
    }

    IpcHandler {
        function census(): string {
            return root.census();
        }

        function skip(hours: real): void {
            root.skip(hours);
        }

        function reset(): void {
            root.reset();
        }

        target: "village"
    }

    FileView {
        id: file

        path: `${Paths.state}/village.json`
        printErrors: false
        onLoaded: {
            try {
                const data = JSON.parse(text());
                root.saved = data && typeof data === "object" ? data : null;
            } catch (e) {
                root.saved = null;
            }
            root.fileReady = true;
        }
        onLoadFailed: {
            root.saved = null;
            root.fileReady = true;
        }
    }
}
