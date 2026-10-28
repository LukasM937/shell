pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io
import Caelestia
import Caelestia.I18n
import qs.services
import qs.utils

// Online wallpapers, colour info for the local ones, and changing the wallpaper daily or by time of day
Singleton {
    id: root

    // Wallpaper drawer state
    property bool online
    property string query
    property string colour // "" for all, or one of colours
    property bool fitTheme

    readonly property list<string> colours: ["dark", "red", "orange", "yellow", "green", "teal", "blue", "purple", "pink"]

    // Online results
    property list<var> results: []
    property int page: 1
    property bool lastPage
    property int hidden
    property string classifier: "off" // on, off (no model) or broken (model can't run, so nothing passes)
    property string provider: "wallhaven"
    property string error
    readonly property bool searching: searchProc.running
    readonly property list<var> shownResults: fitTheme ? results.filter(r => r.fit >= 0.4).sort((a, b) => b.fit - a.fit) : results

    // Local wallpaper path -> { lum, bucket, fit }
    property var local: ({})

    // Contents of ~/.config/caelestia/wallpaper-discover.json, shared with the script
    property var settings: ({})
    readonly property string auto: settings.auto ?? "off"

    readonly property list<string> script: [settings.python || "python3", "-I", Quickshell.shellPath("assets/wallpaper-discover.py"), "--dir", Paths.wallsdir]

    function setSetting(key: string, value: var): void {
        const s = Object.assign({}, settings);
        s[key] = value;
        settings = s;
        settingsFile.setText(JSON.stringify(s, null, 4) + "\n");
    }

    function cycleAuto(): void {
        const modes = ["off", "daily", "timeOfDay"];
        setSetting("auto", modes[(modes.indexOf(auto) + 1) % modes.length]);
        autoTimer.restart();
        rotate();
    }

    function search(more: bool): void {
        if (more && (searchProc.running || lastPage))
            return;
        if (searchProc.running) {
            searchProc.stale = true; // Search again once the old one is done
            return;
        }
        page = more ? page + 1 : 1;
        searchProc.more = more;
        searchProc.command = [...script, "search", "--query", query, "--colour", colour, "--page", String(page)];
        searchProc.running = true;
    }

    function analyseLocal(): void {
        localProc.running = true;
    }

    // Local wallpapers matching the colour filter, best fitting first if asked
    function filterLocal(walls: list<var>): list<var> {
        let out = colour ? walls.filter(w => local[w.path]?.bucket === colour) : walls;
        if (fitTheme)
            out = out.filter(w => (local[w.path]?.fit ?? 0) >= 0.4).sort((a, b) => local[b.path].fit - local[a.path].fit);
        return out;
    }

    function fetch(result: var): void {
        Toaster.toast(Tr.tr("Downloading wallpaper"), Tr.tr("From %1").arg(result.provider), "downloading");
        const proc = fetchComp.createObject(root, {
            command: [...script, "fetch", result.provider, result.id]
        });
        proc.running = true;
    }

    function rotate(): void {
        if (rotateProc.running || auto === "off")
            return;
        rotateProc.command = [...script, auto === "daily" ? "daily" : "slot"];
        rotateProc.running = true;
    }

    function parse(text: string): var {
        try {
            return JSON.parse(text);
        } catch (e) {
            return {
                ok: false,
                error: text.trim() || String(e)
            };
        }
    }

    onOnlineChanged: {
        if (online && results.length === 0)
            search(false);
    }
    onQueryChanged: {
        if (online)
            searchTimer.restart();
    }
    onColourChanged: {
        if (online)
            search(false);
    }

    Timer {
        id: searchTimer

        interval: 700
        onTriggered: root.search(false)
    }

    Timer {
        id: autoTimer

        running: root.auto !== "off"
        repeat: true
        triggeredOnStart: true
        interval: 5 * 60 * 1000
        onTriggered: root.rotate()
    }

    Process {
        id: searchProc

        property bool more
        property bool stale

        onExited: {
            if (stale) {
                stale = false;
                root.search(false);
            }
        }

        stdout: StdioCollector {
            onStreamFinished: {
                if (searchProc.stale)
                    return;
                const data = root.parse(text);
                root.error = data.ok ? "" : data.error;
                if (!data.ok)
                    return;
                const fresh = data.results.map(r => Object.assign(r, {
                        online: true
                    }));
                root.results = searchProc.more ? [...root.results, ...fresh] : fresh;
                root.lastPage = data.results.length === 0;
                root.hidden = (searchProc.more ? root.hidden : 0) + data.hidden;
                root.classifier = data.classifier;
                root.provider = data.provider;
            }
        }
    }

    Process {
        id: localProc

        stdout: StdioCollector {
            onStreamFinished: {
                const data = root.parse(text);
                if (data.ok)
                    root.local = data.wallpapers;
            }
        }

        command: [...root.script, "colours"]
    }

    Process {
        id: rotateProc

        stdout: StdioCollector {
            onStreamFinished: {
                const data = root.parse(text);
                if (!data.ok) {
                    console.warn("WallpaperDiscover: could not change the wallpaper:", data.error);
                } else if (data.new) {
                    Wallpapers.setWallpaper(data.path);
                    Toaster.toast(Tr.tr("Today's wallpaper"), Tr.tr("A new wallpaper from %1").arg(root.provider), "wallpaper");
                } else if (data.changed) {
                    Wallpapers.setWallpaper(data.path);
                }
            }
        }
    }

    Component {
        id: fetchComp

        Process {
            id: proc

            stdout: StdioCollector {
                onStreamFinished: {
                    const data = root.parse(text);
                    if (data.ok)
                        Wallpapers.setWallpaper(data.path);
                    else
                        Toaster.toast(Tr.tr("Couldn't get the wallpaper"), data.error, "error", Toast.Error);
                    proc.destroy();
                }
            }
        }
    }

    FileView {
        id: settingsFile

        path: `${Paths.config}/wallpaper-discover.json`
        watchChanges: true
        printErrors: false
        onFileChanged: reload()
        onLoaded: {
            const data = root.parse(text());
            root.settings = data.ok === false ? {} : data;
        }
        onLoadFailed: root.settings = {}
    }
}
