.pragma library

// State machine of the idle chain: lock, screensaver, display off, sleep. It has no QML dependencies so
// scripts/idlechain-check.js can run it headless; the daemon calls update() once a second and carries out the actions.
// Times are milliseconds, the settings are minutes.
//
// y and z count from the previous stage, not from the last input, so a manual lock still gets its full screensaver delay.
// The stages from "locked" onward run whenever the session is locked, whatever lockAfter says: 0 only turns off the
// automatic lock.

var MINUTE = 60000;

function create(now) {
    return {
        stage: "active", // active | locked | screensaver | displayOff
        lastActivity: now,
        stageSince: now,
        sleepSent: false
    };
}

function enter(chain, stage, now) {
    chain.stage = stage;
    chain.stageSince = now;
    chain.sleepSent = false;
}

// Minutes since the last input at which each stage starts, null for a disabled stage and everything after it
function timeline(cfg) {
    var lockAt = cfg.lockAfter > 0 ? cfg.lockAfter : null;
    var screensaverAt = lockAt !== null && cfg.screensaverAfter > 0 ? lockAt + cfg.screensaverAfter : null;
    var displayOffAt = screensaverAt !== null && cfg.displayOffAfter > 0 ? screensaverAt + cfg.displayOffAfter : null;
    return {
        lockAt: lockAt,
        screensaverAt: screensaverAt,
        displayOffAt: displayOffAt
    };
}

// Returns the actions to carry out: "lock", "screensaver", "displayOff", "sleep" or "wake". At most one stage change
// per call, so a long gap (resume from suspend) steps through the stages one call at a time and each stage gets its
// own delay.
function update(chain, now, input) {
    var cfg = input.cfg;
    var actions = [];

    if (input.activity)
        chain.lastActivity = now;

    // The lock screen is the source of truth: a lock or unlock from outside moves the chain without an action
    if (input.locked && chain.stage === "active") {
        enter(chain, "locked", now);
    } else if (!input.locked && chain.stage !== "active") {
        var dark = chain.stage === "screensaver" || chain.stage === "displayOff";
        enter(chain, "active", now);
        chain.lastActivity = now;
        // An unlock does not come with input on the screen that is off, and the screensaver has to go
        return dark ? ["wake"] : actions;
    }

    // Counts as activity, so nothing runs out while paused and the full delay starts again afterwards
    if (input.paused) {
        chain.lastActivity = now;
        chain.stageSince = now;
        return actions;
    }

    if (chain.stage === "active") {
        if (cfg.lockAfter > 0 && now - chain.lastActivity >= cfg.lockAfter * MINUTE) {
            enter(chain, "locked", now);
            actions.push("lock");
        }
    } else if (chain.stage === "locked") {
        // Input also restarts the delay: it counts from the later of the lock and the last input
        var since = Math.max(chain.stageSince, chain.lastActivity);
        if (cfg.screensaverAfter > 0 && now - since >= cfg.screensaverAfter * MINUTE) {
            enter(chain, "screensaver", now);
            actions.push("screensaver");
        }
    } else if (chain.stage === "screensaver") {
        if (input.activity) {
            enter(chain, "locked", now);
            actions.push("wake");
        } else if (cfg.displayOffAfter > 0 && now - chain.stageSince >= cfg.displayOffAfter * MINUTE) {
            enter(chain, "displayOff", now);
            actions.push("displayOff");
        }
    } else if (chain.stage === "displayOff") {
        if (input.activity) {
            enter(chain, "locked", now);
            actions.push("wake");
        } else if (cfg.sleepWhenDisplayOff && !input.busy && !chain.sleepSent) {
            // Not sent while a task is running; the display stays off and this is asked again on every call
            chain.sleepSent = true;
            actions.push("sleep");
        }
    }

    return actions;
}
