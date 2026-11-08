# Lock screen idle chain and ecosystem screensaver

Date: 2026-11-07. Status: design for approval.

## Intent

When the computer sits idle the shell should do something worth glancing at before it goes dark and sleeps. Today the
idle timeouts lock the screen, switch the display off and suspend, all counted from the last input. This adds a
screensaver between lock and display off: a small living world, drawn as pixel tiles, whose geography and weather come
from the machine's surroundings (Wi-Fi networks, Bluetooth devices, home network, ping, traffic) and whose animal
populations live, eat, hunt and starve on it, changing the land as they go.

The machine is normally doing very little while this runs, so the world must be interesting on its own. The system
signals only seed and nudge it; the ecology provides the story. It must also be cheap, because the point of idle is to
use nothing.

## Goals

- A three-stage idle chain with relative timers (defaults 10 min, 2 min, 60 min) ending in display off and, when nothing
  important is running, sleep.
- A pixel-tile screensaver shown over the lock screen, with six species (sheep, fish, birds, sharks, wolves, hawks) on
  procedurally generated, living terrain (water, sand, grass, forest, desert, fire and ash).
- The land and the animals affect each other; the world must stay interesting for hours without any input.
- The world responds to the machine's surroundings: Wi-Fi networks shape the geography, Bluetooth devices create
  springs, traffic is rain, ping trouble is lightning, CPU heat is drought, devices on the home network plant groves.
- The world is kept between sessions, one per network the machine is connected to, so old overgrazing leaves scars.
- A new settings page for lock screen and screensaver settings, including the idle chain.

## Non-goals

- Interaction. The screensaver is watched, not played. Any input leaves it.
- Matching upstream (see CLAUDE.md).
- A time-of-day or season cycle, upload traffic as wind, a "while you were away" summary on the lock screen, other
  render styles (soft map, night contour). These were discussed and left for later.
- Per-device traffic from the home network (needs the router) and active network scanning.

## Anti-goals (what would make this a failure even if it technically works)

- It uses noticeable CPU or GPU on an idle machine, or stops the machine from ever sleeping.
- The world dies out or turns into one flat biome after an hour and stays that way.
- A screensaver start, wake or display-off path that leaves the session unlocked, or the lock screen stuck dark.
- Anything that reveals secrets: the lock screen must still need the password after the screensaver. Any input only
  brings back the lock UI.
- Burn-in: nothing static on screen for hours.

## The idle chain

Stages, with defaults:

| Stage | Trigger | Default |
|---|---|---|
| Lock | no input for **x** minutes | 10 |
| Screensaver | **y** minutes without input while locked | 2 |
| Display off | **z** minutes after the screensaver started | 60 |
| Sleep | when the display went off and no major task is running | immediately |

Decisions from the conversation:

- y and z are measured from the previous stage, not from the last input before it. With the defaults the screensaver
  starts 12 minutes after the last input and the display turns off 72 minutes after that.
- The relation y << x << z holds for the defaults. It is not enforced; the settings page shows the resulting timeline.
- The screensaver only exists while the session is locked. A manual lock (Super+L, IPC, lock before sleep) starts the
  y timer too.
- Input during the screensaver brings back the lock UI (password prompt) and restarts the y timer. Input while the
  display is off turns it on and returns to the lock UI, again restarting y.
- Sleep is held back while a major background task runs, then happens once it ends. The shell already has this idea
  (`StayActive`, `RuntimeState.inhibitIdle`, `stopsWork()` in `daemons/IdleMonitors.qml`, audio and charging
  inhibitors); the chain reuses it.

Calls I made (change them if wrong):

- "Major task" means any of: audio playing, an idle inhibitor or keep awake, Stay Active, or sustained load. Sustained load
  is average CPU of at least 25% or network traffic of at least 500 KB/s over the last 5 minutes. Both thresholds are
  settings. The screensaver itself must stay well below the CPU threshold.
- Sleep has a toggle but no extra delay after display off. While a major task blocks it, the display stays off and the
  condition is re-checked once a minute.
- The existing `general.idle.timeouts` list stays for users' own extra actions, but its default (lock at 180 s, dpms off
  at 300 s, suspend at 600 s) is replaced by an empty list. The chain takes over those jobs.
- Setting x to 0 turns automatic locking off, which also means no screensaver and no automatic display off or sleep
  from the chain.

Implementation notes (traps I know of):

- `IdleMonitor` timeouts count from the last input, so stages y and z cannot just be `x + y`: a lock caused by a manual
  Super+L would break them. Use one short monitor (about 1 s) as an "input happened" edge and run the relative timers on
  top of it, restarting them on every edge and on every stage change.
- `StayActive.screenAsleep` and the existing dpms handling in `handleIdleAction` must stay correct when the chain
  turns the display off and on.

## The world

The behavioural reference is `2026-11-07-screensaver-ecosystem-prototype.html` in this folder: a single page, open it in
a browser. Its rules, constants and the balance found in headless runs (60,000 steps at three rain levels: no invalid
values, boom and bust cycles, species coming back through respawn) are the starting point. Port it, do not redesign
it. The balance is a first pass and has not been watched for hours; the low-rain case ends about half desert with few
sheep, which is intended. The prototype's sliders for rain, lightning and springs are the interfaces the real signals
feed.

### Look

Style A, pixel tiles: a grid of flat-coloured cells, one cell is a square block of screen pixels, species drawn as small
squares (sheep and fish and birds small, predators larger). Grass colour follows how much grass is left, desert colour
follows soil fertility (worn soil is darker), springs are small cyan marks. Biome colours are natural colours, not the
shell's scheme colours. The grid is 45 rows tall and as many columns as the screen's aspect needs.

### Species and what they eat

| Species | Lives | Food | Natural enemies |
|---|---|---|---|
| Fish | water | plankton, which regrows in water | sharks; also wolves at the shore, hawks |
| Sheep | land, wade to drink | grass; forest a little; desert scrub if hardy | wolves; sharks when wading |
| Birds | air | berries that trees bear (shown as red dots on forest); worms living in soil that is not desert; fish in the shallows (drops guano after) | hawks |
| Sharks | water | fish; sheep in shallows | none |
| Wolves | land | sheep; fish at the shore when hungry | none |
| Hawks | air | birds; fish in the shallows, occasionally | none |

Food sets population: animals with enough food breed, hungry ones starve. Predators breed and starve too, with a small
cap. An extinct species is respawned: after about 300 steps a few members arrive from the map edge, and the event is
logged.

### Land rules (all from the prototype, all individually switchable there)

Overgrazing turns bare grass to desert (after about 60 steps bare) and lowers fertility. Unattended grass spreads onto sand
and grows into forest. Rested desert near water recovers. Sheep in forest thin it, and old trees fall and leave a clearing of young grass (new, so the land does not end as one forest). Dung raises fertility and seeds bare
neighbours. Erosion wears bare desert down. Water level follows rain, so lakes shrink in drought and shores flood in
rain. Lightning ignites forest and lush grass; fire burns, leaves ash, then regrows. Sheep inherit hardiness and the
herd adapts to desert. Trees bear berries, which regrow with rain and fertility. Worms live in grass and forest soil, regrow with moisture and fertility, and are gone when the soil turns to desert or burns; they return when grass does. Mercy rains start when desert passes 55% and end under 40%, so the world cannot stay a desert.

Berries and worms are not in the prototype (it has forest fruit only, which becomes the berries). Their constants are new and must be tuned until the bird populations pass the same checks as the other species.

### Signals to the world

| Signal | Source | Effect |
|---|---|---|
| Visible Wi-Fi networks | `Nmcli.networks` | geography: the connected network's name seeds the terrain; each visible network raises an island or hill at a position derived from its BSSID, height from signal strength; new ones rise slowly, vanished ones erode |
| Bluetooth devices | BlueZ via Quickshell | springs (up to 8): connected devices and devices BlueZ currently reports in range; no active scanning |
| Ping | `ping` to the gateway and one configurable host, every 30 s | lightning rate from loss and timeouts over the last 10 pings, with a small baseline |
| Traffic | `NetworkUsage` | rain: idle gives the balanced baseline of the prototype (0.8), heavy download raises it towards 1.5 |
| CPU temperature | `Cpu` service | heat: above about 70 °C rain falls, below 0.8 the land dries |
| Home network devices | `ip neigh show`, read every 60 s, nothing scanned | groves: each reachable neighbour plants a forest patch at a position derived from its address; patches are not removed when the device leaves |

The prototype implements rain, lightning and springs as plain numbers; the rest (island terrain, groves, real
sources, smoothing) is new. Signals must be smoothed so a short spike does not flip the world, and a missing or
failing source must fall back to the idle baseline rather than to zero.

### Persistence

The world is saved to a file in the shell's state directory (soil fertility, terrain wear, plus the seed) every few minutes
while running and when it stops. One file per connected network, keyed by a hash of its name (never store the name),
keeping the five most recently used. Without a network the world is saved under a "none" key. "Reset world" in
settings deletes the current one. Populations and animal positions need not be saved; the species start fresh each
time, which keeps the format small. This also means a fresh start has no population memory, so evolved hardiness
resets (fine).

### Speed and cost

- The sandbox's step rate of 15 steps per second corresponds to 1x. At 1x an hour of screensaver is about 54,000 steps,
  roughly the length of the headless test runs, so a full boom and bust history fits in an hour.
- Drawing at 15 fps is enough. Stop drawing and stepping entirely while the display is off, the session is suspended or
  the screensaver is hidden.
- The prototype costs about 0.35 ms per step in V8 (Node) on a laptop. QML's JavaScript engine is slower, so budget a
  few percent of one core at 1x and measure on the real machine. Cap the speed setting at 4x. If the budget is
  missed, the simulation moves to C++ in `plugin/`, behind the same interface.

## Settings page

A new page "Lock screen & screensaver" in the Nexus settings, category Appearance, next to "Wallpaper & style". It
needs its own icon, description and registry entries like the other pages. Sections:

1. **Idle chain:** lock after (min, 0 = never), screensaver after lock (min, 0 = never), display off after screensaver
   (min, 0 = never), sleep when the display is off (toggle), busy thresholds for CPU and network, and a one-line
   resulting timeline ("Locks at 10 min, screensaver at 12 min, display off at 72 min"). Inhibit when audio or charging
   toggles from the existing idle config belong here too.
2. **Lock screen:** the existing options that have no UI today: lock screen enabled, background (blurred wallpaper or
   blurred screen contents), recolour logo, hide notifications, session controls, fingerprint and face unlock with their
   try counts. A row that opens "Wallpaper & style" for everything about wallpapers.
3. **Screensaver:** enabled, speed (1x to 4x), show event log, which signals feed the world (Wi-Fi, Bluetooth, ping with
   the host, home network devices off by default, CPU heat), reset world, and a preview button that starts the
   screensaver now. The same start and stop is also available over IPC for testing without waiting twelve minutes.

Calls I made: "wallpaper settings" are not moved; the wallpaper options stay where they are and the new page links to
them. The page title and category can change.

## Where it goes in the code (my calls, the builder may adjust)

- Idle chain: new config properties under `general.idle` (C++ `generalconfig.hpp`) and a new daemon (or an extension of
  `daemons/IdleMonitors.qml`) for the relative timers.
- Screensaver config: a new `ScreensaverConfig` node beside `LockConfig` in `plugin/src/Caelestia/Config`, or new
  properties in `LockConfig`.
- Simulation: a plain JavaScript library `modules/lock/ecosystem.js` with `create`, `step` and `draw`-free state, like
  `runner.js`, with the signal values passed in. A view `modules/lock/Screensaver.qml` draws it on a Canvas. It lives in the lock
  scope so one world is shared by all screens: it is generated at the aspect of the largest screen and every screen shows
  it cover-fitted. The lock surface fades the lock content out when the screensaver starts and back in on input.
- Signals: a small singleton service gathering and smoothing the six sources.
- Settings page: `modules/nexus/pages/` plus entries in `PageRegistry.qml` and `PageCompRegistry.qml`.
- Strings go through `Tr.tr()`; colours for the overlay (event log) come from `Colours.palette`; sizes from `Tokens`.

## Testing

- `scripts/ecosystem-check.js`, in the style of `runner-check.js`: loads `ecosystem.js`, runs it for tens of thousands
  of steps at rain 0.2, 0.8 and 1.4 and with the signals failing, and fails when a value turns invalid, when a species is
  absent for longer than the respawn delay plus margin, when desert stays above 85% for long, or when the world
  has no water or no land. Add it to the list of checks in `CLAUDE.md`.
- The other repository checks from `CLAUDE.md` (QML conventions, translations, `qmlformat`, `clang-format` for C++).
- This was designed on a Mac that cannot run the shell. The chain, the lock integration and the visuals can only be
  tested on the Arch machine. The pull request must say what was and was not run, and the preview button and IPC exist so
  the test does not need a twelve-minute wait.

## Left to the builder

Exact grid size, colours, species sprite shapes, how the signals are smoothed, the file format of the saved world,
how the Bluetooth API is read, the placement of the config properties, the page icon, and the order of work (the
simulation and its check first, the idle chain second, the settings page third is a sensible split into separate
commits).
