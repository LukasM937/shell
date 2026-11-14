pragma Singleton

import "../lock/ecodraw.js" as EcoDraw
import "../lock/ecosystem.js" as Eco
import "vart.js" as Art
import "vdraw.js" as Draw
import "village.js" as Sim
import "vposter.js" as Poster
import QtQuick
import Quickshell
import Quickshell.Io
import qs.services
import qs.utils
import qs.modules.lock

// The live wallpapers: a village that grows with the computer and the ecosystem of the lock screen's screensaver, as the
// desktop background. A live wallpaper is an ordinary wallpaper to everything else: a still of it lies in the wallpaper folder
// (Live/Village.png), so the pickers list it, the colour scheme and the lock screen take their colours from it, and the shell
// knows it is live from the path alone. Choosing another wallpaper switches the world off.
Singleton {
    id: root

    // The stills' file names, by kind
    readonly property var files: ({
            village: "Village.png",
            ecosystem: "Ecosystem.png"
        })
    readonly property string dir: `${Paths.wallsdir}/Live`
    readonly property string kind: kindOf(Wallpapers.current)
    readonly property bool active: kind !== ""

    // How much faster than the clock the village lives (1 is real time), and its frame rate. Kept in
    // $XDG_STATE_HOME/caelestia/live-wallpaper.json with the last still wallpaper, which is where "off" goes back to
    property real speed: 1
    property int fps: 10
    property string lastStill
    property bool settingsReady

    // Stills waiting to be drawn, one at a time, and the ones that are there
    property var queue: []
    property string drawing
    property var posterExists: ({})
    // A kind the user chose before its still was there: set as the wallpaper when it has been drawn
    property string pendingChoice

    function posterPath(id: string): string {
        return `${dir}/${files[id]}`;
    }

    // Which live wallpaper a path is, or an empty string. Compared by folder and name, because the CLI stores the real path
    function kindOf(path: string): string {
        const m = (path ?? "").match(/\/Live\/(\w+\.png)$/);
        if (!m)
            return "";
        for (const id in files)
            if (files[id] === m[1])
                return id;
        return "";
    }

    function choose(id: string): void {
        if (!files[id])
            return;
        // The still has to be there for the colour scheme to be made from it
        if (posterExists[id]) {
            Wallpapers.setWallpaper(posterPath(id));
        } else {
            pendingChoice = id;
            requestPoster(id);
        }
    }

    function off(): void {
        if (active && lastStill)
            Wallpapers.setWallpaper(lastStill);
        else if (active)
            Wallpapers.setRandom();
    }

    function requestPoster(id: string): void {
        if (!queue.includes(id) && drawing !== id)
            queue = [...queue, id];
        next();
    }

    function next(): void {
        if (drawing || queue.length === 0 || writer.running)
            return;
        const id = queue[0];
        queue = queue.slice(1);
        drawing = id;
        try {
            const raster = render(id);
            writer.width = raster.width;
            writer.height = raster.height;
            writer.target = posterPath(id);
            writer.payload = Poster.base64(raster.data);
            writer.running = true;
        } catch (e) {
            console.warn("live wallpaper: could not draw", id, e);
            drawing = "";
        }
    }

    // The still of a kind from the world that is running, or from a short lived one when it is not
    function render(id: string): var {
        if (id === "village") {
            let w = Village.world;
            if (!w) {
                w = Sim.create({
                    seed: Village.seed(),
                    saved: Village.saved,
                    now: Date.now()
                });
                Sim.setSignals(w, {
                    now: Date.now()
                });
                Sim.step(w, 0.1);
            }
            return Poster.village(Art, Draw, w, Date.now() / 1000 % 100000);
        }
        let ew = EcoWorld.world;
        if (!ew) {
            ew = Eco.create({
                cols: 80,
                seed: 7
            });
            for (let i = 0; i < 300; i++)
                Eco.step(ew);
        }
        return Poster.ecosystem(EcoDraw, ew);
    }

    function saveSettings(): void {
        if (!settingsReady)
            return;
        settingsFile.setText(JSON.stringify({
            speed: speed,
            fps: fps,
            lastStill: lastStill
        }));
    }

    onSpeedChanged: saveSettings()
    onFpsChanged: saveSettings()

    // A still wallpaper is what "off" goes back to
    Connections {
        function onActualCurrentChanged(): void {
            const path = Wallpapers.actualCurrent;
            if (path && !root.kindOf(path) && path !== root.lastStill) {
                root.lastStill = path;
                root.saveSettings();
            }
        }

        target: Wallpapers
    }

    Binding {
        target: Village
        property: "wanted"
        value: root.kind === "village"
    }

    Binding {
        target: Village
        property: "speed"
        value: root.speed
    }

    Binding {
        target: EcoWorld
        property: "wallpaper"
        value: root.kind === "ecosystem"
    }

    // The stills the pickers show are made once the village has been read, so that they show the village that is there
    Connections {
        function onFileReadyChanged(): void {
            if (Village.fileReady) {
                root.requestPoster("village");
                root.requestPoster("ecosystem");
            }
        }

        target: Village
    }

    // A running wallpaper keeps its still up to date: the lock screen and the pickers show it
    Timer {
        interval: 1200000
        running: root.active
        repeat: true
        onTriggered: root.requestPoster(root.kind)
    }

    // Turns the pixels into a PNG with Pillow, which the CLI needs anyway, through a temporary file so a reader never sees half
    // of it. The zoom is 2: the world is a tile map of 8 pixel tiles, and a still is a wallpaper
    Process {
        id: writer

        property string payload
        property string target
        property int width
        property int height

        command: ["sh", "-c", `set -e; mkdir -p "$(dirname "$4")"; base64 -d | python3 -c 'import sys;from PIL import Image;w,h,z=int(sys.argv[1]),int(sys.argv[2]),int(sys.argv[3]);im=Image.frombytes("RGBA",(w,h),sys.stdin.buffer.read());im.resize((w*z,h*z),Image.NEAREST).convert("RGB").save(sys.argv[4])' "$1" "$2" "$3" "$4.tmp.png"; mv "$4.tmp.png" "$4"`, "sh", `${width}`, `${height}`, "2", target]
        stdinEnabled: true
        onStarted: {
            write(payload);
            stdinEnabled = false;
        }
        onExited: code => {
            const id = root.drawing;
            root.drawing = "";
            payload = "";
            stdinEnabled = true;
            if (code === 0 && id) {
                const next = Object.assign({}, root.posterExists);
                next[id] = true;
                root.posterExists = next;
                if (root.pendingChoice === id) {
                    root.pendingChoice = "";
                    Wallpapers.setWallpaper(root.posterPath(id));
                }
            } else if (code !== 0) {
                console.warn("live wallpaper: the still of", id, "could not be written, is python3 with Pillow there?");
            }
            root.next();
        }
    }

    FileView {
        id: settingsFile

        path: `${Paths.state}/live-wallpaper.json`
        printErrors: false
        onLoaded: {
            try {
                const data = JSON.parse(text());
                if (typeof data.speed === "number" && data.speed > 0)
                    root.speed = Math.min(60, data.speed);
                if (typeof data.fps === "number" && data.fps >= 1)
                    root.fps = Math.min(30, Math.round(data.fps));
                if (typeof data.lastStill === "string")
                    root.lastStill = data.lastStill;
            } catch (e) {}
            root.settingsReady = true;
        }
        onLoadFailed: root.settingsReady = true
    }

    IpcHandler {
        function get(): string {
            return root.kind;
        }

        function set(kind: string): void {
            if (kind === "" || kind === "off" || kind === "none")
                root.off();
            else
                root.choose(kind);
        }

        function refresh(): void {
            root.requestPoster("village");
            root.requestPoster("ecosystem");
        }

        target: "liveWallpaper"
    }
}
