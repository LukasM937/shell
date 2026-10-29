pragma Singleton

import ".."
import QtQuick
import Quickshell
import Quickshell.Io
import Caelestia.Config
import Caelestia.I18n
import qs.services
import qs.utils

// Hyprland keybinds, with the focused app's own shortcuts and the window binds first
Searcher {
    id: root

    property list<var> hyprBinds: []
    property list<var> builtinApps: []
    property list<var> userApps: []

    // The user's apps replace built-in ones with the same name, keeping built-in shortcuts they don't relabel
    readonly property list<var> apps: {
        const user = userApps.map(u => {
            const base = builtinApps.find(b => b.name === u.name);
            const binds = u.binds ?? [];
            return Object.assign({}, base, u, {
                binds: [...binds, ...(base?.binds ?? []).filter(b => !binds.some(ub => ub.label === b.label))]
            });
        });
        return [...user, ...builtinApps.filter(b => !userApps.some(u => u.name === b.name))];
    }

    readonly property string focusedClass: Hypr.activeToplevel?.lastIpcObject.class ?? ""
    readonly property var focusedApp: {
        const cls = focusedClass.toLowerCase();
        return cls ? apps.find(a => (a.classes ?? []).some(c => c.toLowerCase() === cls)) ?? null : null;
    }

    function transformSearch(search: string): string {
        return search.slice(`${GlobalConfig.launcher.actionPrefix}keys `.length);
    }

    function selector(item: var): string {
        return item.search;
    }

    function reload(): void {
        dump.running = true;
        userFile.reload();
    }

    function parseApps(text: string): list<var> {
        try {
            const apps = JSON.parse(text);
            return Array.isArray(apps) ? apps.filter(a => a?.name && Array.isArray(a.binds)) : [];
        } catch (e) {
            console.warn("Keybinds: invalid app shortcuts:", e);
            return [];
        }
    }

    // Fallback for hyprlang configs, where hyprctl knows what each bind does
    function fromHyprctl(binds: list<var>): list<var> {
        const mods = [[64, "SUPER"], [4, "CTRL"], [1, "SHIFT"], [8, "ALT"]];
        return binds.filter(b => !b.submap).map(b => ({
                    label: b.description || `${b.dispatcher} ${b.arg}`.trim(),
                    section: Tr.trCtx("Hyprland", "keybind section"),
                    keys: [[...mods.filter(([m]) => b.modmask & m).map(([, name]) => name), b.key].join(" + ")]
                }));
    }

    list: binds.instances

    Variants {
        id: binds

        model: {
            const app = root.focusedApp;
            const own = app ? app.binds.map(b => Object.assign({
                    section: app.name,
                    appClass: root.focusedClass
                }, b)) : [];
            const isWindow = b => b.section.toLowerCase().startsWith("window");
            return [...own, ...root.hyprBinds.filter(isWindow), ...root.hyprBinds.filter(b => !isWindow(b))];
        }

        Keybind {}
    }

    Process {
        id: dump

        command: Hypr.usingLua ? ["lua", `${Quickshell.shellDir}/assets/dump-keybinds.lua`] : ["hyprctl", "binds", "-j"]
        stdout: StdioCollector {
            onStreamFinished: {
                try {
                    const data = JSON.parse(text);
                    if (!Hypr.usingLua) {
                        root.hyprBinds = root.fromHyprctl(data);
                        return;
                    }
                    if (!data.ok)
                        console.warn("Keybinds: Hyprland config failed partway:", data.error);
                    // Empty Lua tables come out as objects
                    root.hyprBinds = (Array.isArray(data.binds) ? data.binds : []).map(b => Object.assign({}, b, {
                            keys: Array.isArray(b.keys) ? b.keys : []
                        }));
                } catch (e) {
                    console.warn("Keybinds: could not read the keybinds:", e);
                }
            }
        }
    }

    FileView {
        path: `${Quickshell.shellDir}/assets/app-shortcuts.json`
        onLoaded: root.builtinApps = root.parseApps(text())
    }

    FileView {
        id: userFile

        printErrors: false
        path: `${Paths.config}/app-shortcuts.json`
        onLoaded: root.userApps = root.parseApps(text())
        onLoadFailed: root.userApps = []
    }

    component Keybind: QtObject {
        required property var modelData
        readonly property string name: modelData.label ?? ""
        readonly property string section: modelData.section ?? ""
        readonly property list<string> keys: modelData.keys ?? []
        readonly property string appClass: modelData.appClass ?? ""
        readonly property string search: `${name} ${section} ${keys.join(" ")}`

        function onClicked(list: AppList): void {
            list.screenState.launcher = false;
        }
    }
}
