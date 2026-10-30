pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io
import Caelestia.Config

// Pending package updates, checked on demand and cached for a while
Singleton {
    id: root

    property int repo: -1 // -1 = unknown
    property int aur: -1 // -1 = unknown or no AUR helper
    readonly property int count: repo < 0 ? -1 : repo + Math.max(aur, 0)
    readonly property bool checking: checkProc.running
    property real lastCheck

    // Checks again unless the last result is less than half an hour old
    function refresh(force: bool): void {
        if (checkProc.running || (!force && root.repo >= 0 && Date.now() - root.lastCheck < 30 * 60 * 1000))
            return;
        checkProc.running = true;
    }

    // Runs the upgrade in a terminal. Detached, so restarting the shell can't interrupt it
    function update(): void {
        Quickshell.execDetached([...GlobalConfig.general.apps.terminal, "sh", "-c", `
            if command -v yay >/dev/null; then yay -Syu
            elif command -v paru >/dev/null; then paru -Syu
            else sudo pacman -Syu; fi
            echo; read -rp 'Press Enter to close ' _`]);
        root.repo = root.aur = -1; // Stale now, check again next time
    }

    Process {
        id: checkProc

        // checkupdates (pacman-contrib) syncs a temporary copy of the databases, pacman -Qu only knows the last sync
        command: ["sh", "-c", `
            if command -v checkupdates >/dev/null; then repo=$(checkupdates 2>/dev/null | wc -l)
            else repo=$(pacman -Qu 2>/dev/null | wc -l); fi
            if command -v yay >/dev/null; then aur=$(yay -Qua 2>/dev/null | wc -l)
            elif command -v paru >/dev/null; then aur=$(paru -Qua 2>/dev/null | wc -l)
            else aur=-1; fi
            echo "$repo $aur"`]
        stdout: StdioCollector {
            onStreamFinished: {
                const [repo, aur] = text.trim().split(" ").map(n => parseInt(n, 10));
                root.repo = isNaN(repo) ? -1 : repo;
                root.aur = isNaN(aur) ? -1 : aur;
                root.lastCheck = Date.now();
            }
        }
    }
}
