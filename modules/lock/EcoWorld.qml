pragma Singleton

import "ecosystem.js" as Eco
import "ecosignals.js" as Mapping
import QtQuick
import Quickshell
import Quickshell.Io
import Caelestia.Config
import Caelestia.I18n
import qs.services
import qs.utils

// Owns the lock screen ecosystem: creates the world when the screensaver starts, steps it, feeds it EcoSignals and keeps
// its soil and terrain in $XDG_STATE_HOME/caelestia/screensaver-worlds.json, one entry per network. A singleton so the
// settings page can reset or preview it. The world stays after a stop, still and unchanged, so the screen can fade out.
Singleton {
    id: root

    property bool running
    property var world: null
    // The last few, as {tick, text}
    property var events: []
    property int cols: 80

    // What the state file held when it was read, updated on every save, so a save never drops another network's world
    property var saved: ({})
    property bool fileReady
    property bool pendingStart
    // The saved entry of the running world
    property string key

    signal previewRequested

    function preview(): void {
        previewRequested();
    }

    function reset(): void {
        const k = world ? key : Mapping.worldKey(EcoSignals.inputs.ssid);
        const next = Object.assign({}, saved);
        delete next[k];
        saved = next;
        if (fileReady)
            file.setText(JSON.stringify(saved));
        if (running)
            newWorld(false);
    }

    // The widest screen decides, so the world covers every screen without stretching
    function screenCols(): int {
        const aspect = Quickshell.screens.reduce((a, s) => s.height > 0 ? Math.max(a, s.width / s.height) : a, 0) || 16 / 9;
        return Math.max(20, Math.min(200, Math.round(45 * aspect)));
    }

    function usable(entry: var, n: int): bool {
        const nums = list => Array.isArray(list) && list.length === n && list.every(v => typeof v === "number" && isFinite(v));
        return !!entry && typeof entry.seed === "number" && isFinite(entry.seed) && nums(entry.fert) && nums(entry.elev);
    }

    function newWorld(load: bool): void {
        const input = EcoSignals.inputs;
        const c = screenCols();
        const entry = load ? saved[Mapping.worldKey(input.ssid)] : null;
        const ok = usable(entry, c * 45);
        key = Mapping.worldKey(input.ssid);
        cols = c;
        events = [];
        world = Eco.create({
            cols: c,
            seed: ok ? entry.seed : Mapping.seedFor(input.ssid),
            saved: ok ? entry : undefined,
            bumps: input.islands
        });
    }

    function start(): void {
        if (!fileReady) {
            pendingStart = true;
            return;
        }
        pendingStart = false;
        newWorld(true);
    }

    function save(): void {
        if (!world || !fileReady)
            return;
        const snap = Eco.snapshot(world);
        const next = Object.assign({}, saved);
        // The seed the world really used, which can be past seedFor() when that one gave hardly any land or water
        next[key] = {
            last: Date.now(),
            seed: snap.seed,
            fert: snap.fert,
            elev: snap.elev
        };
        saved = Mapping.pruneWorlds(next, 5);
        file.setText(JSON.stringify(saved));
    }

    // One tick does at most this many steps, however long the screen slept, so the world never races to catch up
    function tick(): void {
        if (!world)
            return;
        Eco.setSignals(world, EcoSignals.inputs);
        const steps = Math.min(4, Math.max(1, Math.floor(GlobalConfig.lock.screensaver.speed)));
        for (let i = 0; i < steps; i++)
            Eco.step(world);
        const fresh = Eco.drainEvents(world).map(e => ({
                    tick: e.tick,
                    text: eventText(e)
                })).filter(e => e.text);
        if (fresh.length > 0)
            events = [...events, ...fresh].slice(-8);
    }

    function speciesName(id: string): string {
        switch (id) {
        case "sheep":
            // TRANSLATORS: an animal species of the screensaver, plural, used for %1 in its event messages
            return Tr.tr("Sheep");
        case "fish":
            // TRANSLATORS: an animal species of the screensaver, plural, used for %1 in its event messages
            return Tr.tr("Fish");
        case "bird":
            // TRANSLATORS: an animal species of the screensaver, plural, used for %1 in its event messages
            return Tr.tr("Birds");
        case "shark":
            // TRANSLATORS: an animal species of the screensaver, plural, used for %1 in its event messages
            return Tr.tr("Sharks");
        case "wolf":
            // TRANSLATORS: an animal species of the screensaver, plural, used for %1 in its event messages
            return Tr.tr("Wolves");
        case "hawk":
            // TRANSLATORS: an animal species of the screensaver, plural, used for %1 in its event messages
            return Tr.tr("Hawks");
        }
        return "";
    }

    function eventText(e: var): string {
        switch (e.id) {
        case "lightning":
            // TRANSLATORS: screensaver event, a lightning strike starts a wildfire
            return Tr.tr("Lightning sets the land on fire");
        case "desert30":
            // TRANSLATORS: screensaver event, more than 30% of the land has turned to desert
            return Tr.tr("A third of the land has turned to desert");
        case "monsoon_on":
            // TRANSLATORS: screensaver event, heavy rains start because the land is mostly desert
            return Tr.tr("Monsoon rains sweep over the desert");
        case "monsoon_off":
            // TRANSLATORS: screensaver event, the heavy rains stop because the land has recovered
            return Tr.tr("The monsoon ends, the land has recovered");
        case "extinct":
            // TRANSLATORS: screensaver event, %1 = a species name in the plural, such as Sheep or Wolves
            return Tr.tr("%1 have died out").arg(speciesName(e.species ?? ""));
        case "arrive":
            // TRANSLATORS: screensaver event, %1 = a species name in the plural; after dying out, a few come back from the map edge
            return Tr.tr("%1 arrive from beyond the hills").arg(speciesName(e.species ?? ""));
        case "shark_sheep":
            // TRANSLATORS: screensaver event, a shark catches a sheep that waded into shallow water
            return Tr.tr("A shark takes a wading sheep");
        case "wolf_fish":
            // TRANSLATORS: screensaver event, a hungry wolf catches a fish at the shore
            return Tr.tr("A hungry wolf catches a fish at the shore");
        case "hawk_fish":
            // TRANSLATORS: screensaver event, a hawk catches a fish in shallow water
            return Tr.tr("A hawk snatches a fish from the shallows");
        case "guano":
            // TRANSLATORS: screensaver event, droppings of a bird that ate fish make the soil fertile
            return Tr.tr("Bird droppings feed the soil");
        }
        return "";
    }

    onRunningChanged: {
        if (running)
            start();
        else {
            pendingStart = false;
            save();
        }
    }

    Binding {
        target: EcoSignals
        property: "active"
        value: root.running
    }

    // About 15 per second, the speed at which the prototype was balanced
    Timer {
        interval: 66
        running: root.running && !!root.world && !StayActive.screenAsleep
        repeat: true
        onTriggered: root.tick()
    }

    Timer {
        interval: 300000
        running: root.running && !!root.world
        repeat: true
        onTriggered: root.save()
    }

    FileView {
        id: file

        path: `${Paths.state}/screensaver-worlds.json`
        printErrors: false
        onLoaded: {
            try {
                const data = JSON.parse(text());
                root.saved = data && typeof data === "object" && !Array.isArray(data) ? data : {};
            } catch (e) {
                root.saved = {};
            }
            root.fileReady = true;
            if (root.pendingStart && root.running)
                root.start();
        }
        onLoadFailed: {
            root.saved = {};
            root.fileReady = true;
            if (root.pendingStart && root.running)
                root.start();
        }
    }
}
