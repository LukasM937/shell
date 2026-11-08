pragma ComponentBehavior: Bound

import "idlechain.js" as Chain
import QtQuick
import Quickshell
import Quickshell.Wayland
import Quickshell.Services.UPower
import Caelestia.Config
import Caelestia.Services
import Caelestia.State
import qs.services
import qs.modules.lock

// Lock, screensaver, display off and sleep as one chain (daemons/idlechain.js). It is not part of IdleMonitors because
// an IdleMonitor timeout counts from the last input, while the stages here count from the previous stage: a manual lock
// still gets its full screensaver delay. So this runs relative timers on top of one short monitor instead.
// The chain only ever turns the display off itself, and every way out of it (input, unlock, resume) goes through
// apply("wake") so the screen is never left dark. The one exception is a shell that restarts while the display is off:
// it starts by lighting the display, since the flag that it was the chain is gone.
Scope {
    id: root

    required property Lock lock
    readonly property bool hasPlayer: Players.list.some(p => p.isPlaying)
    readonly property bool isCharging: !UPower.onBattery
    // On a machine without a battery inhibitWhenCharging keeps this true for good (same as IdleMonitors); it is off by default
    readonly property bool paused: (GlobalConfig.general.idle.inhibitWhenAudio && hasPlayer) || (GlobalConfig.general.idle.inhibitWhenCharging && isCharging)
    readonly property bool busy: StayActive.enabled || RuntimeState.inhibitIdle || hasPlayer || EcoSignals.busy
    // A tick this much later than the last one means the computer slept or the clock jumped, not that a second went by
    readonly property int resumeGapMs: 5000
    property var chain: Chain.create(Date.now())
    property real lastTick: Date.now()
    // The display is off because of this chain, as opposed to the dpms timeouts of IdleMonitors
    property bool asleep
    // Input since the last tick. The monitor only stays active for a second after input, which a tick can miss
    property bool inputSeen
    // A screensaver the chain did not start has seen a tick without input since it appeared
    property bool strayQuiet

    function apply(action: string): void {
        switch (action) {
        case "lock":
            lock.lock.locked = true;
            break;
        case "screensaver":
            // Without the screensaver the chain goes on to turn the display off on its own timer
            if (GlobalConfig.lock.screensaver.enabled)
                lock.lock.screensaverActive = true;
            break;
        case "displayOff":
            lock.lock.screensaverActive = false;
            asleep = true;
            StayActive.screenAsleep = true;
            StayActive.setDpms(false);
            break;
        case "wake":
            asleep = false;
            StayActive.setDpms(true);
            StayActive.screenAsleep = false;
            lock.lock.screensaverActive = false;
            break;
        case "sleep":
            SessionManager.suspend();
            break;
        }
    }

    // The clock jumped over a suspend, so the chain starts over: the lock screen gets its delays again
    function restart(): void {
        apply("wake");
        chain = Chain.create(Date.now());
    }

    function tick(): void {
        // Past-due timers fire before logind's resume signal arrives, and a stage change on the old clock would turn the
        // display off or suspend again as the lid opens. This also covers a clock that jumps without a resume
        const now = Date.now();
        const gap = now - lastTick;
        lastTick = now;
        if (gap > resumeGapMs || gap < 0) {
            inputSeen = false;
            restart();
            return;
        }

        const activity = !monitor.isIdle || inputSeen;
        inputSeen = false;

        // The IPC target and the settings preview start the screensaver without the chain, so the chain would never
        // end it. Their start usually comes with input, so only input after a quiet tick counts. The chain starts its
        // own screensaver in update() below, after this check, and from then on its stage is "screensaver".
        const stray = lock.lock.screensaverActive && chain.stage !== "screensaver";
        if (!stray) {
            strayQuiet = false;
        } else if (!activity) {
            strayQuiet = true;
        } else if (strayQuiet) {
            lock.lock.screensaverActive = false;
            strayQuiet = false;
        }

        Chain.update(chain, now, {
            cfg: {
                lockAfter: GlobalConfig.general.idle.lockAfter,
                screensaverAfter: GlobalConfig.general.idle.screensaverAfter,
                displayOffAfter: GlobalConfig.general.idle.displayOffAfter,
                sleepWhenDisplayOff: GlobalConfig.general.idle.sleepWhenDisplayOff
            },
            locked: lock.lock.locked,
            activity,
            paused,
            busy
        }).forEach(a => apply(a));

        // Whatever happened above, the display is only ever off in the displayOff stage
        if (asleep && chain.stage !== "displayOff")
            apply("wake");
    }

    // A restarted shell does not know the display was off, and input would not wake it, so it lights it once.
    // Turning on a display that is already on does nothing
    Component.onCompleted: StayActive.setDpms(true)

    Connections {
        function onLockedChanged(): void {
            // Lock.qml clears the screensaver on unlock; a dark screen has to be woken here, since unlocking
            // from outside (loginctl, IPC) is not input on it
            if (!root.lock.lock.locked && root.asleep)
                root.apply("wake");
        }

        target: root.lock.lock
    }

    Connections {
        function onResumed(): void {
            // Backup for tick(), which normally notices the gap first
            root.restart();
        }

        target: SessionManager
    }

    Timer {
        interval: 1000
        repeat: true
        running: true
        onTriggered: root.tick()
    }

    // An inhibiting app counts as activity because respectInhibitors stays on
    IdleMonitor {
        id: monitor

        timeout: 1
        onIsIdleChanged: {
            if (!isIdle)
                root.inputSeen = true;
        }
    }
}
