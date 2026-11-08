# Idle chain and ecosystem screensaver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A lock → screensaver → display off → sleep idle chain, a pixel-tile ecosystem screensaver shown over the lock screen, and a "Lock screen & screensaver" settings page.

**Architecture:** Two pure JavaScript libraries hold all logic and are tested headless in Node, in the style of `modules/lock/runner.js` and `scripts/runner-check.js`: the world simulation (`ecosystem.js`, with `ecosignals.js` for turning system readings into world inputs) and the idle state machine (`idlechain.js`). Thin QML wires them to the shell: a signals service, a world owner in the lock scope, a Canvas view on each lock surface, and a daemon that drives the chain. New config goes in C++ config nodes.

**Tech Stack:** QML (Quickshell), plain JavaScript libraries (`.pragma library`), C++ config nodes in `plugin/`, Node for the checks.

**Spec:** `docs/superpowers/specs/2026-11-07-screensaver-ecosystem-design.md`. The behavioural reference for every simulation rule and constant is `docs/superpowers/specs/2026-11-07-screensaver-ecosystem-prototype.html`: port its functions `reset`, `calcMoist`, `cells`, `animals`, `lifecycle`, `census` and `step` and its constants as they are; do not re-tune. The one exception is bird food: berries and worms are new (the prototype's forest fruit becomes the berries). Their constants are set in Tasks 1 and 2 and tuned until the checks there pass.

## Global Constraints

- Defaults: lock after **10** min, screensaver **2** min after lock, display off **60** min after the screensaver started, sleep when the display is off and nothing important is running. 0 disables a stage.
- Busy means audio playing, idle inhibitor or keep awake, Stay Active, or **25%** average CPU or **500 KB/s** network traffic over the last **5** minutes. Both thresholds are settings.
- Simulation: **15** steps per second is 1x; speed setting 1x to **4x**; draw at 15 fps; grid **45** rows, columns from the screen aspect; at most **8** springs; mercy rains start above **55%** desert and end under **40%**; an extinct species returns after about **300** steps.
- Signals: ping every **30** s, `ip neigh` every **60** s, no active scanning, no stored network names (keys are hashes), keep the **5** most recently used worlds, home network devices off by default.
- Pixel style A with natural biome colours; the lock UI overlay uses `Colours.palette`, sizes use `Tokens`.
- User-visible strings go through `Tr.tr()` / `Tr.trCtx()`, never `qsTr()`. Match surrounding code. No trailing whitespace.
- Commit titles are `type(scope): change` with a scope from `.github/scopes.txt`; end commit messages with the attribution line the session specifies.
- This was planned on a Mac that cannot build the plugin or run the shell. C++ and QML tasks can only be linted here; Task 10 lists what to run on the Arch machine, and the pull request must say what was not run.
- Run before each commit that touches the files: `python3 scripts/qml-lint-conventions.py`, `python3 scripts/trs-check.py`, `qmlformat <file.qml> | diff -u <file.qml> -`, `clang-format --dry-run --Werror <file>`, and the new Node checks.

## Review Focus

- Manual lock while automatic locking is off (x = 0): the screensaver, display off and sleep still follow, since they apply whenever the session is locked. Tested in Task 4.
- A time jump (suspend and resume): one stage per update, no burst of stages and no replay of thousands of simulation steps. Tested in Tasks 4 and 2.
- A failing or missing signal source (no Wi-Fi, no Bluetooth adapter, offline so every ping fails): the world gets the idle baseline, never zero, NaN or constant lightning above the cap. Tested in Tasks 1 and 3.
- Unusual screen aspect ratios (portrait, 32:9, tiny): the world always has water and land. Tested in Task 1.
- A corrupt or mismatched saved world (different grid size, wrong lengths, bad JSON): ignored, a fresh world starts. Tested in Tasks 1 and 3.

## File structure

Create: `modules/lock/ecosystem.js` (world simulation), `modules/lock/ecosignals.js` (readings to inputs, hashing, world keys), `daemons/idlechain.js` (state machine), `scripts/ecosystem-check.js`, `scripts/idlechain-check.js`, `services/EcoSignals.qml`, `modules/lock/EcoWorld.qml`, `modules/lock/Screensaver.qml`, `daemons/IdleChain.qml`, `modules/nexus/pages/LockAndScreensaver.qml`.
Modify: `plugin/src/Caelestia/Config/generalconfig.hpp`, `lockconfig.hpp`, `modules/lock/Lock.qml`, `modules/lock/LockSurface.qml`, `shell.qml`, `modules/nexus/PageRegistry.qml`, `PageCompRegistry.qml`, `CLAUDE.md`.

---

### Task 1: World simulation, land and signals

**Files:** Create `modules/lock/ecosystem.js`, `scripts/ecosystem-check.js`. Modify `CLAUDE.md` (add `node scripts/ecosystem-check.js` to the checks list, one line like the others).

**Interfaces:**
- Produces, in `ecosystem.js` (starts with `.pragma library`, no QML imports, plain `var`/`function`):
  - `T = {DEEP: 0, SHALLOW: 1, SAND: 2, GRASS: 3, FOREST: 4, DESERT: 5, ASH: 6, FIRE: 7}`, `SPECIES = ["sheep", "fish", "bird", "shark", "wolf", "hawk"]`.
  - `create(opts: {cols: int, rows?: int = 45, seed: int, rng?: () => number, rules?: object, saved?: {fert: number[], elev: number[]}, bumps?: {x: number, y: number, height: number, radius: number}[]}): World`. `x` and `y` of bumps are fractions of the width and height, `radius` a fraction of the height. `rules` has one boolean per prototype rule (overgraze, spread, recover, browse, dung, erosion, tide, fire, pop, migrate, fear, cross, guano, evolve, respawn, providence), all default true. If the seed gives less than 10% water or 15% land, retry with `seed + 1` until it does. `saved` is ignored unless both arrays have `cols * rows` entries.
  - World fields the view reads: `cols`, `rows`, `seed` (the one finally used), `tick`, `type: Uint8Array`, `bio: Float32Array`, `fert: Float32Array`, `worm: Float32Array` (0 to 1 per cell; only grass and forest soil hold worms, regrowing like grass with moisture and fertility, and a cell that becomes desert, ash, fire or water drops to 0), with `bio` on forest cells meaning berries (0 to 1, regrowing with rain and fertility), `animals: {sheep: A[], fish: A[], bird: A[], shark: A[], wolf: A[], hawk: A[]}` with `A = {x: number, y: number, vx: number, vy: number, e: number, th: number, h: number, g: number, dead: boolean}` in cell units, `springs: {x: number, y: number}[]` (the active ones).
  - `setSignals(world, s: {rain?: number, lightning?: number, springs?: int, groves?: {x: number, y: number}[], islands?: bump[]})`: rain 0 to 1.5 (default 0.8), lightning 0 to 1 (default 0.05, values above 0.55 are clamped), springs 0 to 8, groves as fractions, each planted on the nearest land cell as forest with raised fertility, islands as the same bump shape as `create`'s `bumps`. Islands are an uplift that eases in and out: each cell's lift moves toward its target by at most 0.0002 per step, so a new network raises land over about 100 s at 1x and a vanished one lets it sink again. `snapshot` stores `elev` without the lift, so a loaded world does not count an old island twice.
  - `step(world)`, `snapshot(world): {seed: int, fert: number[], elev: number[]}`, `census(world): {land: int, grass: number, forest: number, desert: number, ash: number, sand: number, counts: {sheep: int, fish: int, bird: int, shark: int, wolf: int, hawk: int}, monsoon: boolean}` (the fractions are of land cells), `drainEvents(world): {tick: int, id: string, species?: string}[]` returning and clearing the events. Event ids: `lightning`, `desert30`, `monsoon_on`, `monsoon_off`.
  - Animals are added in Task 2; here `animals` holds empty arrays and `step` runs land rules only.

- [ ] **Step 1: Write `scripts/ecosystem-check.js`.** Same loader as `runner-check.js` (read the file, strip the `.pragma library` line, `vm.runInNewContext`), a tiny `check(name, fn)` that prints PASS/FAIL and sets the exit code, and a seeded `mulberry32(seed)` for the `rng` option. Checks, with these assertions:
  - `same seed and rng give the same world`: two `create` calls with `mulberry32(1)`, 2000 steps each, `JSON.stringify(snapshot(a)) === JSON.stringify(snapshot(b))`.
  - `every grid has water and land`: for seed 1..40 and cols in `[20, 80, 107, 144, 200]`, `census` gives `land / (cols * rows)` between 0.15 and 0.9 and at least 10% of cells have `type <= 1`.
  - `bumps raise terrain`: `snapshot` of a world with a bump at `{x: 0.5, y: 0.5, height: 0.3, radius: 0.2}` has a higher centre `elev` than the same seed without it.
  - `saved fertility round trips`: `create({saved: snapshot(w)})` gives equal `fert` and `elev`; `saved: {fert: [1, 2], elev: [1]}` is ignored (no throw, normal world).
  - `values stay valid`: for rain 0.1, 0.8 and 1.4, 20000 steps; every `bio`, `fert` and `worm` is finite, every `type <= 7`.
  - `worms live only in living soil`: after 20000 steps every cell whose type is not grass or forest has `worm === 0`, and at rain 0.8 the mean `worm` over grass and forest cells is above 0.2.
  - `trees bear berries`: at rain 0.8 the mean `bio` of forest cells is above 0.3 after 2000 steps and never above 1.
  - `no lightning means no fire`: `lightning: 0`, 5000 steps, no `ash` or fire cell appears that was not there at creation.
  - `constant lightning leaves a living land`: `lightning: 1` (clamped), 20000 steps, `grass + forest >= 0.10`.
  - `a drought is capped`: rain 0.1, 20000 steps, after step 2000 `desert` never exceeds 0.85, and a `monsoon_on` event appears once desert passed 0.55.
  - `islands rise gradually and sink again`: after `setSignals({islands: [bump]})` the centre of the bump has risen after 200 steps but by less than the bump's height, is within 10% of it after 5000, and is back within 10% of the start after `setSignals({islands: []})` and a further 5000 steps (with `erosion` and `tide` off to isolate the lift).
  - `springs follow the signal`: `setSignals({springs: 12})` gives `world.springs.length === 8`; `{springs: 0}` gives 0.
  - `groves become forest on land`: a grove at `{x: 0.5, y: 0.5}` leaves the nearest land cell to it as forest.
  - `step is cheap`: average over 3000 steps on 107 columns is below 5 ms (print the number).
- [ ] **Step 2: Run it and confirm it fails.** `node scripts/ecosystem-check.js` fails because `ecosystem.js` does not exist.
- [ ] **Step 3: Implement the land half of `ecosystem.js`.** Port from the prototype: terrain noise (`hash`, `vn`, `fbm`), type thresholds, moisture from distance to water plus springs, `cells()` with the stress counter for overgrazing, fertility, tide and erosion, fire and ash, mercy rains from `census` every 50 steps. Replace the DOM flags with `rules`, the sliders with `setSignals` values, and every `log(...)` with an event pushed to `world.events`. All randomness goes through `world.rng`.
- [ ] **Step 4: Run the check and confirm it passes**, then run `node scripts/ecosystem-check.js` again with a different `mulberry32` seed set to catch flakiness.
- [ ] **Step 5: Commit.** `feat(lock): ecosystem simulation, terrain and land rules`, files: `modules/lock/ecosystem.js scripts/ecosystem-check.js CLAUDE.md`.

### Task 2: World simulation, animals

**Files:** Modify `modules/lock/ecosystem.js`, `scripts/ecosystem-check.js`.

**Interfaces:**
- Consumes: Task 1's `create`, `step`, `census`, `drainEvents`, the animal record `A`.
- Produces: `step` now also runs the animals; new event ids `extinct` and `arrive` (with `species`), `shark_sheep`, `wolf_fish`, `hawk_fish`, `guano`. Caps per species: sheep 200, fish 160, birds 100, predators 4 each. Starting counts: sheep 24, fish 40, birds 18, sharks 2, wolves 3, hawks 2.

- [ ] **Step 1: Add checks** (setup: create a world, then edit `world.animals` directly, as `A` is public):
  - `a hungry shark eats a sheep wading in the shallows`: clear all animals, put a shark `{e: 0.5}` and a sheep on the same shallow cell; within 5 steps `animals.sheep.length === 0` and `drainEvents` has `shark_sheep`.
  - `a hungry wolf snatches a fish at the shore`: wolf `{e: 0.5}` on a land cell next to a shallow cell holding a fish; within 5 steps the fish is gone and `wolf_fish` was logged. With `rules.cross = false` it is not.
  - `hawks sometimes take fish`: a hawk `{e: 1}` kept over a shallow cell with a fish within 1.6 cells (reset each step), 600 steps: at least one `hawk_fish`.
  - `food sets population`: a sheep with `e: 2` on grass gives two sheep after one step; one with `e: 0` is gone; with `rules.pop = false` neither happens.
  - `extinct species return`: empty `animals.sheep`; after 301 steps there is at least one sheep and the events contain `extinct` and `arrive` for `sheep`; with `rules.respawn = false` it is still empty after 1000 steps.
  - `hardiness stays in range`: over 20000 steps with default rules every sheep's `h` is within [0, 1]; with `rules.evolve = false` every lamb has `h === 0.1`.
  - `birds eat berries and worms`: a bird `{e: 0.5}` over a forest cell with `bio: 1` lowers that `bio` and raises its `e` within a step; over a grass cell with `worm: 1` it lowers `worm` and raises `e`; over a desert cell nothing changes. Birds with `e < 1.2` steer towards forest with `bio > 0.3` or grass or forest with `worm > 0.3` when one is within 16 cells.
  - `guano grows the coast`: a bird with `g: 1` over a sand cell with moisture above 0.3 turns it to grass and logs `guano`.
  - `values stay valid`: rain 0.2, 0.8, 1.4, 30000 steps; every animal field finite, counts at or under the caps; with all rules on no species stays absent for longer than 500 consecutive steps.
  - `a time jump does not replay`: calling `step` once changes `tick` by exactly 1.
  - `step is cheap` from Task 1 now includes animals: below 5 ms average.
- [ ] **Step 2: Run and confirm the new checks fail.**
- [ ] **Step 3: Implement the animals in `ecosystem.js`.** Port `animals()`, `lifecycle()`, `move()`, `find()`, `nearest()`, `flock()`, `flee()`, thirst and springs as drinking places, hardiness, guano and respawn with their tuned constants. Sheep and the three predators use the same energy and breeding model as the prototype; do not change constants. Birds eat berries (forest `bio`) and worms (`worm` on grass and forest) with the prototype's fruit eating rate and gain; if bird numbers pin at the cap or collapse in the `values stay valid` check, tune the worm and berry regrowth constants, not the bird's. `create` places the starting animals.
- [ ] **Step 4: Run the whole check and confirm it passes.**
- [ ] **Step 5: Commit.** `feat(lock): ecosystem animals, hunting and respawn`.

### Task 3: Signal mapping library

**Files:** Create `modules/lock/ecosignals.js` (`.pragma library`). Modify `scripts/ecosystem-check.js` (the same file also loads this library).

**Interfaces:** Produces, all pure and tolerant of `undefined`, `null` and `NaN` input (they mean "no reading" and give the baseline):
- `rain(downloadBytesPerSec: number, cpuTempC: number): number`: 0.8 when the download is at or below 50 000 B/s and the temperature at or below 70; rises logarithmically to 1.5 at 10 000 000 B/s; falls linearly by 0.6 between 70 and 85 °C; clamped to [0.1, 1.5].
- `lightning(pings: boolean[]): number`: `0.05 + 0.5 * failedFraction` over the last 10 entries; empty gives 0.05; maximum 0.55.
- `springCount(connectedDevices: int): int` (0 to 8).
- `islands(aps: {bssid: string, strength: number}[]): {x: number, y: number, height: number, radius: number}[]`: position from `hashString(bssid)` as fractions in [0, 1), `height = 0.12 + 0.18 * strength / 100`, `radius = 0.08`, strongest 12, entries without a bssid skipped.
- `groves(macs: string[]): {x: number, y: number}[]`: de-duplicated, at most 24, positions from the hash.
- `hashString(s: string): int` (unsigned 32 bit), `seedFor(ssid: string): int` (`hashString(ssid || "none")`), `worldKey(ssid: string): string` (8 hex characters of that hash), `smooth(prev: number, next: number, alpha: number = 0.2): number` (returns `next` when `prev` is not a finite number), `pruneWorlds(worlds: {[key: string]: {last: number}}, max: number = 5)` returning a new object with the `max` entries having the highest `last`.

- [ ] **Step 1: Add checks:** `rain(0, 40) === 0.8`, `rain(50000, 40) === 0.8`, `rain(1e7, 40) === 1.5`, `rain(0, 85) === 0.2`, `rain(0, 100) === 0.2`, `rain(NaN, undefined) === 0.8`; `lightning([]) === 0.05`, ten failures `=== 0.55`, five of ten `=== 0.3`, twenty entries counted from the end only; `springCount(12) === 8`, `springCount(NaN) === 0`; `islands` skips a missing `bssid`, keeps 12 of 20, positions in [0, 1), a stronger signal is taller; `groves(["a", "a", "b"]).length === 2`; `seedFor("") === seedFor(undefined)`; `worldKey("home")` is 8 hex characters and never contains the name; `smooth(undefined, 5) === 5`; `pruneWorlds` of 7 entries keeps the 5 newest.
- [ ] **Step 2: Run and confirm failure.** **Step 3: Implement.** **Step 4: Run and confirm all pass.**
- [ ] **Step 5: Commit.** `feat(lock): map system readings to ecosystem inputs`.

### Task 4: Idle chain state machine

**Files:** Create `daemons/idlechain.js` (`.pragma library`), `scripts/idlechain-check.js` (same loader and `check()` style). Modify `CLAUDE.md` (add the check).

**Interfaces:** Produces:
- `create(now: number): Chain` (times in milliseconds).
- `update(chain: Chain, now: number, input: {cfg: {lockAfter: number, screensaverAfter: number, displayOffAfter: number, sleepWhenDisplayOff: boolean}, locked: boolean, activity: boolean, paused: boolean, busy: boolean}): string[]`: cfg values in minutes; `activity` is true while the user has had input within the last second; `paused` freezes the timers (counted as activity); `busy` only blocks sleep. Returns actions in `"lock" | "screensaver" | "displayOff" | "sleep" | "wake"`, at most one stage change per call. `chain.stage` is `"active" | "locked" | "screensaver" | "displayOff"`.
- `timeline(cfg): {lockAt: number | null, screensaverAt: number | null, displayOffAt: number | null}`: cumulative minutes from the last input (10, 12, 72 for the defaults), null for a disabled stage and everything after it.
Rules: `active` locks at `lockAfter` minutes without activity (0 never). An external lock (`locked` becomes true while `active`) enters `locked` without an action. An external unlock returns to `active`. In `locked` the screensaver starts after `screensaverAfter` minutes since the later of the lock moment and the last activity. In `screensaver` activity gives `wake` and `locked`; after `displayOffAfter` minutes since the screensaver started it gives `displayOff`. In `displayOff` activity gives `wake` and `locked`; otherwise `sleep` is emitted once per entry when `sleepWhenDisplayOff` and not `busy`, re-evaluated on every call while busy. Stages `locked` onward run whatever `lockAfter` is.

- [ ] **Step 1: Write the checks** (simulate with `now` advancing one second per call, `locked` mirroring the chain's own lock action):
  - `defaults follow 10, 2, 60`: no activity from t = 0 gives `lock` at 600 s, `screensaver` at 720 s, `displayOff` at 720 + 3600 s, then `sleep` in the same or next call.
  - `a manual lock starts the y timer`: `locked: true` at t = 100 s gives `screensaver` at 220 s.
  - `input delays the screensaver`: activity at t = 700 s after the lock moves it to 700 + 120 s.
  - `wake returns to the lock UI`: activity during `screensaver` gives `wake`; with no further activity `screensaver` returns 120 s later.
  - `input turns the display back on`: activity during `displayOff` gives `wake` and the next stage is `locked`.
  - `zero disables`: `screensaverAfter = 0` never starts it; `lockAfter = 0` never locks by itself, but a manual lock still reaches screensaver, display off and sleep (`lockAfter = 0`).
  - `busy delays sleep`: `busy: true` from the display-off moment gives no `sleep`; one call with `busy: false` gives it; `sleepWhenDisplayOff: false` never gives it.
  - `paused freezes the chain`: one hour paused, then unpaused, gives no action for 10 more minutes.
  - `a time jump gives one stage`: from `active`, `now += 8 hours` in one call returns exactly `["lock"]`; the next call returns `["screensaver"]` only after the 120 s counted from that call.
  - `timeline` gives `{lockAt: 10, screensaverAt: 12, displayOffAt: 72}` for the defaults and `{lockAt: 10, screensaverAt: null, displayOffAt: null}` when `screensaverAfter` is 0.
- [ ] **Step 2: Run and confirm failure.** **Step 3: Implement `idlechain.js`.** **Step 4: Run and confirm all pass.**
- [ ] **Step 5: Commit.** `feat(daemons): idle chain state machine`.

### Task 5: Configuration

**Files:** Modify `plugin/src/Caelestia/Config/generalconfig.hpp`, `plugin/src/Caelestia/Config/lockconfig.hpp`. No compile is possible on the Mac, so the check is formatting here and the build on the Arch machine.

**Interfaces:** Produces, readable from QML as `GlobalConfig.general.idle.*` and `GlobalConfig.lock.screensaver.*`:
- In `GeneralIdle` (next to `lockBeforeSleep`, same macro style): `CONFIG_PROPERTY(int, lockAfter, 10)`, `screensaverAfter` 2, `displayOffAfter` 60, `bool sleepWhenDisplayOff` true, `int busyCpuPercent` 25, `int busyNetworkKBs` 500. The default of `timeouts` becomes an empty list (the chain replaces its three entries; user entries keep working).
- New `class LockScreensaver : public settings::ObjectNode` in `lockconfig.hpp` with `CONFIG_GLOBAL_PROPERTY`: `bool enabled` true, `int speed` 1, `bool eventLog` true, `bool wifi` true, `bool bluetooth` true, `bool ping` true, `QString pingHost` `u"1.1.1.1"_s`, `bool neighbours` false, `bool heat` true; and in `LockConfig` `CONFIG_GLOBAL_SUBOBJECT(LockScreensaver, screensaver)`.

- [ ] **Step 1: Edit both headers.** Follow the neighbouring declarations; an empty default for the list uses the same `DEFAULT_ARG({})` form as other list defaults in this directory (find one with `grep -rn "DEFAULT_ARG({})"`; if there is none, check how `CONFIG_LIST` handles an empty initialiser in `settings/`).
- [ ] **Step 2: Run `clang-format --dry-run --Werror` on both files.** Expected: no output.
- [ ] **Step 3: Commit.** `feat(config): idle chain timings and screensaver settings`.
- Arch check, listed in Task 10: the plugin builds, the shell starts without config errors, and `GlobalConfig.general.idle.timeouts.values.length` is 0.

### Task 6: Signals service and world owner

**Files:** Create `services/EcoSignals.qml`, `modules/lock/EcoWorld.qml`. QML only; lint and format are the checks here.

**Interfaces:**
- Consumes: `ecosignals.js` (Task 3), `ecosystem.js` (Tasks 1 and 2), the config of Task 5, `Nmcli.networks` / `Nmcli.active` (`ssid`, `bssid`, `strength`), `Bluetooth.devices` (`Quickshell.Bluetooth`, count the `connected` ones; if the type exposes a signal-strength property use it to include devices in range, otherwise connected only), `Cpu.percentage` and `Cpu.temperature`, `NetworkUsage.downloadSpeed` and `uploadSpeed`, `Paths.state`.
- Produces, `EcoSignals` (`pragma Singleton`): `readonly property bool busy` (rolling 5-minute averages sampled every 10 s from CPU and from network upload plus download, against the two configured thresholds; sampled whether or not the screensaver runs, since it only reads values the shell already has), `property bool active` (set by `EcoWorld`; the ping, `ip route` and `ip -j neigh` Processes and their Timers run only while true), and `readonly property var inputs` giving `{rain, lightning, springs, groves, islands, ssid}` built with the Task 3 functions, each source smoothed with `smooth` and falling back to the baseline when its toggle is off or the read fails. Gateway from `ip route show default`; pings every 30 s to the gateway and `pingHost` (`ping -c1 -W2`); neighbours every 60 s, skipping `FAILED` and `INCOMPLETE` entries.
- Produces, `EcoWorld` (`pragma Singleton`, so the settings page can reach it): `property bool running` (also sets `EcoSignals.active`), `property var world`, `property var events` (last 8 as `{tick, text}`), `property int cols`, `signal previewRequested()`, `function preview(): void` (emits the signal), `function reset(): void` (deletes the current world's saved entry and creates a fresh world if running). Starting (when `running` becomes true) creates the world with `cols = round(45 * aspect of the largest screen)`, seeded by `seedFor(ssid)`, `bumps` from the current `islands`, and loaded from the entry `worldKey(ssid)` in `${Paths.state}/screensaver-worlds.json` (a `FileView`; unreadable, bad JSON or a size mismatch means a fresh world), keeps at most 5 entries via `pruneWorlds`, and saves every 5 minutes and when it stops. A `Timer` at 15 steps per second runs `GlobalConfig.lock.screensaver.speed` steps per tick (never more than 4) while `running` and `!StayActive.screenAsleep`, never catching up after a pause. Each tick feeds `EcoSignals.inputs` to `setSignals`. Event ids become `Tr.tr` strings with `// TRANSLATORS:` comments, for example "Lightning sets the land on fire".

- [ ] **Step 1: Write `EcoSignals.qml`** following the QML object order in `CLAUDE.md` and the style of `services/VPN.qml` for `Process` usage.
- [ ] **Step 2: Write `EcoWorld.qml`.**
- [ ] **Step 3: Lint and format both files.** `python3 scripts/qml-lint-conventions.py`, `python3 scripts/trs-check.py`, `qmlformat` diff for each; no output means done.
- [ ] **Step 4: Commit.** `feat(services): ecosystem signals and world owner`.

### Task 7: Screensaver view and lock integration

**Files:** Create `modules/lock/Screensaver.qml`. Modify `modules/lock/Lock.qml`, `modules/lock/LockSurface.qml`.

**Interfaces:**
- Consumes: `EcoWorld` (Task 6), `world` fields from Task 1.
- Produces: on the `WlSessionLock` in `Lock.qml`, `property bool screensaverActive` (next to `runnerBest`), a `Binding` of `EcoWorld.running` to it, a `Connections` on `EcoWorld` whose `onPreviewRequested` locks the session and sets `screensaverActive` (the settings page's preview button), and a second `IpcHandler` with target `"screensaver"` and functions `start(): bool` (locks the session if needed, then sets `screensaverActive`; returns false when disabled in `GlobalConfig.lock.screensaver.enabled`), `stop(): void`, `isActive(): bool`. `Screensaver.qml`: `required property var eco`; a Canvas repainted at 15 fps while visible that draws each cell as a square block of `max(width / cols, height / rows)` pixels, cover-fitted and centred, using the prototype's colours (grass by `bio`, desert by `fert`, springs, species as small and large squares, hardy sheep tinted, berries as red dots on forest cells whose `bio` is above 0.4); with `Config`'s event log on, a dim line of the last event drifting slowly across the bottom (never static for hours).
- In `LockSurface.qml`: the screensaver is a sibling of `lockContent` filling the surface, above `background`; while `lock.screensaverActive`, `lockContent` fades out (`Anim`, `Tokens.anim.durations.small`) and `Screensaver` fades in, and the reverse on wake. No input handling here: the idle chain wakes it (Task 8).

- [ ] **Step 1: Write `Screensaver.qml`.** **Step 2: Edit `Lock.qml` and `LockSurface.qml`.**
- [ ] **Step 3: Lint and format** all three files (commands in Global Constraints).
- [ ] **Step 4: Commit.** `feat(lock): ecosystem screensaver over the lock screen`.

### Task 8: Idle chain daemon

**Files:** Create `daemons/IdleChain.qml`. Modify `shell.qml` (add `IdleChain { lock: lock }` after `IdleMonitors`).

**Interfaces:** Consumes `idlechain.js` (Task 4), `EcoSignals.busy`, `Players.list`, `StayActive.enabled` / `setDpms(on: bool)` / `screenAsleep`, `RuntimeState.inhibitIdle`, `SessionManager.suspend()`, the config of Task 5 and the `lock` scope (`lock.lock.locked`, `lock.lock.screensaverActive`).

- [ ] **Step 1: Write `IdleChain.qml`** (`required property Lock lock`). A 1 s `Timer` calls `update` with `activity` taken from an `IdleMonitor { timeout: 1 }` (`!isIdle`, which already counts an inhibiting app as activity), `locked` from `lock.lock.locked`, `paused` when audio plays and `inhibitWhenAudio`, or on AC and `inhibitWhenCharging`, and `busy` as `StayActive.enabled || RuntimeState.inhibitIdle || hasPlayer || EcoSignals.busy`. Actions: `lock` sets `lock.lock.locked = true`; `screensaver` sets `lock.lock.screensaverActive = true`; `displayOff` sets `StayActive.screenAsleep = true`, `lock.lock.screensaverActive = false` and calls `StayActive.setDpms(false)`; `wake` sets `screenAsleep = false`, calls `setDpms(true)` and sets `screensaverActive = false`; `sleep` calls `SessionManager.suspend()`. When the session unlocks, `screensaverActive` is cleared.
- [ ] **Step 2: Lint and format.** **Step 3: Commit.** `feat(daemons): drive lock, screensaver, display off and sleep from one chain`.

### Task 9: Settings page

**Files:** Create `modules/nexus/pages/LockAndScreensaver.qml`. Modify `modules/nexus/PageRegistry.qml` and `modules/nexus/PageCompRegistry.qml` (insert the same entry at index 1, right after "Wallpaper & style", in both lists, which are matched by position).

**Interfaces:** Page `PageBase`, `title: Tr.tr("Lock screen & screensaver")`, registry entry with an icon such as `lock_clock`, description "Idle chain, lock screen, screensaver", category `appearance`. Rows from `qs.modules.nexus.common` (`SectionHeader`, `StepperRow`, `ToggleRow`, `SelectRow`, `TextFieldRow`, `InfoRow`, `NavRow`; see `NotificationsPage.qml` for the pattern), bound to `GlobalConfig`:
1. **Idle chain:** steppers for the three timings (minutes, 0 = never) and `sleepWhenDisplayOff`, `busyCpuPercent`, `busyNetworkKBs`, the existing `idle.inhibitWhenAudio` and `inhibitWhenCharging` toggles, and an `InfoRow` showing the `timeline` result ("Locks at 10 min, screensaver at 12 min, display off at 72 min", fewer parts when stages are off).
2. **Lock screen:** `lock.enabled`, background (blurred wallpaper or blurred screen, from `lock.useWallpaper`), `recolourLogo`, `hideNotifs`, `enableSessionControls`, `enableFprint` with `maxFprintTries`, `enableHowdy` with `maxHowdyTries`, and a `NavRow` that sets `nState.currentPageIdx = 0` (Wallpaper & style).
3. **Screensaver:** `enabled`, speed 1 to 4, `eventLog`, the signal toggles with the ping host, a "Reset world" button calling `EcoWorld.reset()`, and "Lock and preview", which calls `EcoWorld.preview()` (it locks the session first; the password is needed to return).

- [ ] **Step 1: Check page indices.** `grep -rn "currentPageIdx\s*=" modules` and `openSubPage(` to confirm no code relies on a fixed top-level page number that the insert would shift; fix any that do.
- [ ] **Step 2: Write the page and add both registry entries.**
- [ ] **Step 3: Lint and format** the page and both registries.
- [ ] **Step 4: Commit.** `feat(nexus): lock screen and screensaver settings page`.

### Task 10: Verification on the Arch machine

Not code. Run on the Arch machine, tick off and put the result in the pull request; anything not run goes under "not tested".

- [ ] The plugin builds and the shell starts without config errors; `timeouts` is empty.
- [ ] Settings: the page opens, values persist across a shell reload, the timeline line updates.
- [ ] Run the three timings as 1, 1 and 2 minutes: lock, screensaver, display off, then sleep with nothing running; input at each stage returns to the lock UI with the display on.
- [ ] Sleep is held back with audio playing and with a long download; it follows once they stop.
- [ ] "Lock and preview" and `qs ipc call screensaver start` work; a manual lock with lock-after set to 0 still reaches the screensaver.
- [ ] Disconnect Wi-Fi, disable Bluetooth, go offline: the world keeps running on baselines.
- [ ] Suspend and resume during the screensaver: no burst of stages, display comes back on input.
- [ ] Leave it for an hour: CPU use of the shell is a few percent at most at 1x (measure), the world is not one flat biome, and a restart loads the saved scars.
- [ ] Run all repository checks listed in `CLAUDE.md`.
