pragma Singleton
pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import Quickshell.Io
import qs.services
import qs.utils

// The cat of the dashboard, roaming the desktop. The simulation is desktop-critters (critterd): it knows
// where the windows are, walks, climbs and leaps between them, and chooses what to do with a decision model.
// This service starts it, reads its frames from a socket (modules/critters draws them) and decides when the
// cat jumps out of the dashboard and back in. Off until ~/.config/caelestia/critters.json says so; see docs/critters.md.
Singleton {
    id: root

    readonly property var defaults: ({
            enabled: false,
            // "managed": the shell runs critterd; "external": it is running already, on its default sockets
            daemon: "managed",
            repo: "~/desktop-critters",
            // Default: target/release/critterd in the repo
            binary: "",
            // "wander" strolls to random places; "ollama" lets the model choose, for the desktop and for the dashboard
            brain: "wander",
            model: "clef-flash",
            ollamaUrl: "http://localhost:11434",
            thinkEvery: 4,
            // Seconds the dashboard is open before the cat is asked, and between questions
            dwell: 8,
            askEvery: 25,
            // Without the model: the chance, per question, that the cat jumps out of the dashboard or back in
            jumpChance: 0.35,
            homeChance: 0.5,
            // The picture is drawn this many times the size of the critter's body
            size: 1
        })
    property var loaded: ({})
    readonly property var conf: Object.assign({}, defaults, loaded)
    readonly property bool enabled: conf.enabled === true
    readonly property bool ollama: conf.brain === "ollama"
    readonly property bool connected: frames.connected && control.connected

    readonly property string runtime: Quickshell.env("XDG_RUNTIME_DIR") || "/tmp"
    readonly property bool managed: conf.daemon === "managed"
    readonly property string framesPath: managed ? `${runtime}/caelestia-critters-frames.sock` : `${runtime}/desktop-critters-frames.sock`
    readonly property string controlPath: managed ? `${runtime}/caelestia-critters.sock` : `${runtime}/desktop-critters.sock`
    readonly property string species: "bongocat"

    // Where the cat is: in the dashboard, or out on the desktop
    property bool home: true
    // The dashboard's picture of it, while the dashboard is open, and where that is on the desktop
    property Item homeSlot
    property var homeWindow
    // The sprite of the latest frame (body, pose, the windows in front of it), null while it is parked
    property var cat: null

    // The jump out grows the picture from the dashboard's size to the critter's, the jump back shrinks it
    property real introFrom: 1
    property real introProgress: 1
    property bool returning
    property real returnProgress
    property var returnFrom: ({
            x: 0,
            y: 0,
            w: 76,
            h: 48
        })
    property var returnTo: ({
            x: 0,
            y: 0,
            scale: 1
        })

    // What the overlay draws: the frame's sprite, or the leap back into the dashboard
    readonly property var shown: {
        if (!enabled)
            return null;
        if (returning) {
            const p = returnProgress, f = returnFrom, to = returnTo;
            return {
                body: {
                    x: f.x + (to.x - f.w / 2 - f.x) * p,
                    y: f.y + (to.y - f.h - f.y) * p - Math.sin(Math.PI * p) * 140,
                    w: f.w,
                    h: f.h
                },
                pose: {
                    kind: "jump",
                    facing: to.x > f.x ? 1 : -1,
                    phase: 0,
                    squash: -0.15 * Math.sin(Math.PI * p),
                    tilt: 0
                },
                occluders: []
            };
        }
        return cat;
    }
    readonly property real spriteScale: returning ? 1 + (returnTo.scale - 1) * returnProgress : introFrom + (1 - introFrom) * introProgress

    property real slotAge
    property real sinceAsk
    property bool asking
    property bool daemonResting
    // The question to the model that is under way, and the time it is given
    property var pending

    function attachHome(item: Item, window: var): void {
        homeSlot = item;
        homeWindow = window;
        slotAge = 0;
        sinceAsk = Math.max(0, conf.askEvery - conf.dwell);
    }

    function detachHome(item: Item): void {
        if (homeSlot !== item)
            return;
        homeSlot = null;
        homeWindow = null;
        // The cat keeps standing where it was, out on the desktop
        returnAnim.stop();
        returning = false;
    }

    // Where the dashboard's picture stands on the desktop (feet, desktop px) and how much bigger it is drawn than the critter
    function slot(): var {
        if (!homeSlot || !homeWindow)
            return null;
        const p = homeSlot.mapToItem(null, homeSlot.width / 2, homeSlot.height * 0.92);
        return {
            x: homeWindow.screen.x + p.x,
            y: homeWindow.screen.y + p.y,
            scale: homeSlot.paintedWidth / Math.max(1, (cat?.body.w ?? 76) * conf.size)
        };
    }

    function send(request: var): bool {
        if (!control.connected)
            return false;
        control.write(JSON.stringify(request) + "\n");
        control.flush();
        return true;
    }

    function onFrame(line: string): void {
        // At home the critter is parked and its frames are empty, so there is nothing to read
        if (home && !returning) {
            cat = null;
            return;
        }
        let message;
        try {
            message = JSON.parse(line);
        } catch (e) {
            return;
        }
        cat = message.frame.critters.find(c => c.species === species) ?? null;
    }

    // Out of the dashboard: a throw from where the picture sits, away from the nearer side of the screen
    function jumpOut(): void {
        const at = slot();
        if (!at || !home || returning)
            return;
        const screen = homeWindow.screen;
        const toRight = at.x < screen.x + screen.width / 2;
        introFrom = at.scale;
        introProgress = 0;
        if (!send({
            place: {
                feet: {
                    x: at.x,
                    y: at.y
                },
                velocity: {
                    x: (toRight ? 1 : -1) * (150 + Math.random() * 150),
                    y: -(200 + Math.random() * 150)
                }
            }
        }))
            return;
        home = false;
        introAnim.restart();
    }

    // Back into the dashboard: the critter keeps standing where it is while the picture jumps; then it is parked
    function jumpHome(): void {
        const at = slot();
        if (home || returning || !cat || !at)
            return;
        returnFrom = {
            x: cat.body.x,
            y: cat.body.y,
            w: cat.body.w,
            h: cat.body.h
        };
        returnTo = at;
        returnProgress = 0;
        returning = true;
        returnAnim.restart();
    }

    // Asks the decision model, or rolls the dice without one, which of the options the cat takes
    function decide(options: var, state: var, fallback: string, done: var): void {
        const keep = fallback;
        const finish = key => {
            asking = false;
            done(options.some(o => o.key === key) ? key : keep);
        };
        asking = true;
        if (!ollama) {
            finish(keep);
            return;
        }
        const criteria = {};
        for (const o of options)
            criteria[o.key] = o.text;
        const request = new XMLHttpRequest();
        pending = request;
        request.onreadystatechange = () => {
            if (request.readyState !== XMLHttpRequest.DONE)
                return;
            modelTimeout.stop();
            let key = keep;
            try {
                if (request.status === 200)
                    key = sample(JSON.parse(request.responseText).answers.next.probabilities, 1) ?? keep;
            } catch (e) {
                console.warn("Critters: unreadable answer of the model:", e);
            }
            finish(key);
        };
        request.open("POST", `${conf.ollamaUrl.replace(/\/$/, "")}/v1/systemone`);
        request.setRequestHeader("Content-Type", "application/json");
        request.send(JSON.stringify({
            model: conf.model,
            state,
            questions: {
                next: {
                    type: "choice",
                    instructions: "You are a small cat that lives in a desktop dashboard. Which option would it most plausibly do next?",
                    criteria
                }
            }
        }));
        modelTimeout.restart();
    }

    // Temperature sampling over the model's probabilities, like the brain of critterd does for the desktop
    function sample(probabilities: var, temperature: real): var {
        const keys = Object.keys(probabilities ?? {});
        if (!keys.length)
            return null;
        const weights = keys.map(k => Math.pow(Math.max(1e-12, probabilities[k]), 1 / temperature));
        let x = Math.random() * weights.reduce((a, b) => a + b, 0);
        for (let i = 0; i < keys.length; i++) {
            x -= weights[i];
            if (x < 0)
                return keys[i];
        }
        return keys[keys.length - 1];
    }

    function context(): var {
        const hour = new Date().getHours();
        return {
            self: "a small cat that lives in the media card of a desktop dashboard and drums along with the music",
            music: Players.active?.isPlaying ? "music is playing" : "nothing is playing",
            time_of_day: hour < 6 ? "night" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"
        };
    }

    // Time to ask: at home it may leave, out on the desktop it may come back while the dashboard is open
    function ask(): void {
        sinceAsk = 0;
        if (home) {
            decide([
                {
                    key: "stay",
                    text: "Stay in the dashboard and keep drumming along."
                },
                {
                    key: "jump_out",
                    text: "Jump out of the dashboard and roam around the desktop for a while."
                }
            ], context(), Math.random() < conf.jumpChance ? "jump_out" : "stay", key => {
                if (key === "jump_out")
                    jumpOut();
            });
        } else {
            decide([
                {
                    key: "roam",
                    text: "Keep roaming around the desktop."
                },
                {
                    key: "go_home",
                    text: "Jump back into the dashboard, where it is warm, and drum along."
                }
            ], context(), Math.random() < conf.homeChance ? "go_home" : "roam", key => {
                if (key === "go_home")
                    jumpHome();
            });
        }
    }

    FileView {
        path: `${Paths.config}/critters.json`
        watchChanges: true
        printErrors: false
        onFileChanged: reload()
        onLoaded: {
            try {
                root.loaded = JSON.parse(text());
            } catch (e) {
                console.warn("Critters: critters.json is not valid JSON:", e);
                root.loaded = {};
            }
        }
        onLoadFailed: root.loaded = {}
    }

    Process {
        id: daemon

        running: root.enabled && root.managed && !root.daemonResting
        workingDirectory: Paths.absolutePath(root.conf.repo)
        command: [root.conf.binary ? Paths.absolutePath(root.conf.binary) : `${Paths.absolutePath(root.conf.repo)}/target/release/critterd`, "--source", "hyprland", "--headless", "--brain", root.conf.brain, "--model", root.conf.model, "--ollama-url", root.conf.ollamaUrl, "--think-every", String(root.conf.thinkEvery), "--species", Quickshell.shellPath("assets/critters/bongocat.toml"), "--stream", root.framesPath, "--stream-hz", "60", "--socket", root.controlPath]
        onExited: code => {
            if (root.enabled && root.managed) {
                console.warn(`Critters: critterd exited (${code}), starting it again in 10 s`);
                root.daemonResting = true;
                restart.start();
            }
        }
    }

    Timer {
        id: restart

        interval: 10000
        onTriggered: root.daemonResting = false
    }

    Timer {
        id: modelTimeout

        interval: 8000
        onTriggered: root.pending?.abort()
    }

    Socket {
        id: frames

        path: root.framesPath
        connected: root.enabled
        onConnectedChanged: {
            if (!connected)
                root.cat = null;
        }
        parser: SplitParser {
            onRead: line => root.onFrame(line)
        }
    }

    Socket {
        id: control

        path: root.controlPath
        connected: root.enabled
        parser: SplitParser {
            onRead: () => {}
        }
    }

    // Neither socket exists until critterd is up, so keep trying
    Timer {
        running: root.enabled && (!frames.connected || !control.connected)
        interval: 2000
        repeat: true
        onTriggered: {
            if (!frames.connected) {
                frames.connected = false;
                frames.connected = true;
            }
            if (!control.connected) {
                control.connected = false;
                control.connected = true;
            }
        }
    }

    // At home the critter is parked, whatever critterd was left doing or whenever it was started. Said again and
    // again, as the socket may not be ready the first time and critterd may restart
    Timer {
        running: root.enabled && root.home && root.connected
        interval: 2000
        triggeredOnStart: true
        repeat: true
        onTriggered: root.send("park")
    }

    // While the dashboard is open, once a second: has the cat made up its mind?
    Timer {
        running: root.enabled && root.homeSlot && root.connected
        interval: 1000
        repeat: true
        onTriggered: {
            root.slotAge++;
            root.sinceAsk++;
            if (root.asking || root.returning || root.sinceAsk < root.conf.askEvery)
                return;
            // Out on the desktop it is first asked a few seconds after the dashboard opens, not after the dwell
            if (root.home ? root.slotAge >= root.conf.dwell : root.slotAge >= 3)
                root.ask();
        }
    }

    NumberAnimation {
        id: introAnim

        target: root
        property: "introProgress"
        from: 0
        to: 1
        duration: 450
        easing.type: Easing.OutBack
    }

    NumberAnimation {
        id: returnAnim

        target: root
        property: "returnProgress"
        from: 0
        to: 1
        duration: 700
        easing.type: Easing.InOutQuad
        onFinished: {
            root.returning = false;
            root.send("park");
            root.home = true;
        }
    }
}
