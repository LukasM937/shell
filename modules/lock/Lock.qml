pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import Caelestia.Config
import qs.components.misc
import qs.modules.lock

Scope {
    property alias lock: lock

    WlSessionLock {
        id: lock

        // For the game in the empty notification dock, kept between locks
        property int runnerBest
        property int runnerCharacter
        // Whether the ecosystem covers the lock screen. Set by the idle chain, the screensaver IPC target and the preview
        property bool screensaverActive

        signal unlock

        onLockedChanged: {
            if (!locked)
                screensaverActive = false;
        }

        LockSurface {
            lock: lock
            pam: pam
        }
    }

    Pam {
        id: pam

        lock: lock
    }

    Binding {
        target: EcoWorld
        property: "screensaver"
        value: lock.screensaverActive
    }

    Connections {
        function onPreviewRequested(): void {
            lock.locked = true;
            lock.screensaverActive = true;
        }

        target: EcoWorld
    }

    Loader {
        asynchronous: true
        active: true
        onLoaded: active = false

        // Force a load of a screencopy so the one in the lock works
        // My guess is the ICC backend loads async on first request, which if the lock is
        // the first request it fails to capture (because it's async and the compositor
        // refuses capture when locked)
        sourceComponent: ScreencopyView {
            captureSource: Quickshell.screens[0]
        }
    }

    // qmllint disable unresolved-type
    CustomShortcut {
        // qmllint enable unresolved-type
        name: "lock"
        description: "Lock the current session"
        onPressed: lock.locked = true
    }

    // qmllint disable unresolved-type
    CustomShortcut {
        // qmllint enable unresolved-type
        name: "unlock"
        description: "Unlock the current session"
        onPressed: lock.unlock()
    }

    IpcHandler {
        function lock(): void {
            lock.locked = true;
        }

        function unlock(): void {
            lock.unlock();
        }

        function isLocked(): bool {
            return lock.locked;
        }

        target: "lock"
    }

    IpcHandler {
        function start(): bool {
            if (!GlobalConfig.lock.screensaver.enabled)
                return false;
            lock.locked = true;
            lock.screensaverActive = true;
            return true;
        }

        function stop(): void {
            lock.screensaverActive = false;
        }

        function isActive(): bool {
            return lock.screensaverActive;
        }

        target: "screensaver"
    }
}
