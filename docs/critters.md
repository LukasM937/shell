# The dashboard cat as a desktop critter

The cat of the dashboard (the gif of `paths.mediaGif`) can jump out of the dashboard and roam your desktop: it walks along
the tops of your windows, hops and leaps from one to the next, hides behind windows in front of it and rides one when you drag it. It comes from
[desktop-critters](https://github.com/LukasM937/desktop-critters), a physics simulation of pets that lives in a world made of your real
windows. A decision model (Ollama) chooses what the cat does, both on the desktop and whether it leaves or returns to the dashboard.
Nothing is ever clicked or moved: the cat is drawn in a click-through window over your windows and only reads where they are.

## Set up

`critterd` needs two additions (the frame stream, `place` and `park`), which are in
[`extras/critters/desktop-critters-frame-stream.patch`](../extras/critters/desktop-critters-frame-stream.patch), a commit for the `main`
of desktop-critters (as of `b4ad94a`). Apply it there, and it is best merged into that repository:

```sh
git clone git@github.com:LukasM937/desktop-critters ~/desktop-critters
cd ~/desktop-critters
git am ~/path/to/shell/extras/critters/desktop-critters-frame-stream.patch
cargo build --release -p critterd
```

Then `~/.config/caelestia/critters.json`, which is read again whenever it changes. The shell starts `critterd` and restarts it if it stops:

```json
{ "enabled": true, "brain": "ollama" }
```

| Key | Default | Meaning |
| --- | --- | --- |
| `enabled` | `false` | everything below is off until this is `true` |
| `daemon` | `"managed"` | `"external"`: you run `critterd --stream` yourself, the shell only connects (its default sockets) |
| `repo` | `"~/desktop-critters"` | where the checkout is |
| `binary` | `""` | path of `critterd`, default `<repo>/target/release/critterd` |
| `brain` | `"wander"` | `"wander"`: strolls to random places, no model needed. `"ollama"`: the decision model (`ollama pull clef-flash`) |
| `model`, `ollamaUrl` | `"clef-flash"`, `"http://localhost:11434"` | for `"ollama"` |
| `thinkEvery` | `4` | seconds between decisions of the cat on the desktop |
| `dwell`, `askEvery` | `8`, `25` | seconds the dashboard is open before the cat is asked, and between questions |
| `jumpChance`, `homeChance` | `0.35`, `0.5` | without a model: the chance, per question, that it jumps out or comes back |
| `size` | `1` | how big the cat is drawn, in times the critter's body (76x48 px) |

## What it does

- **At home** the cat sits in the media card of the dashboard as always. While the dashboard is open it is asked now and then
  (`dwell`, `askEvery`) whether it stays or jumps out. The model is shown the two options with the time of day and whether
  music is playing, and answers with probabilities, which are sampled. A model that is not there, or answers nonsense,
  means the dice.
- **Out** it is thrown from where its picture sat, away from the nearer side of the screen, shrinks to its size on the way and falls onto the floor in
  front of your windows, from where it walks, hops and leaps like any critter (`critterd`'s brain). Its place in the dashboard stays empty.
- **Back**: whenever the dashboard is open it is asked, a few seconds after it opens and then every `askEvery` seconds,
  whether it keeps roaming or returns. If it returns, it leaps to its place in an arc, grows to its old size and `critterd` parks it.
  Close the dashboard meanwhile and it simply stays out.

On a window in front of it, a cat is cut off where the window covers it. Pose, direction, landing squash and the 45 degrees on a wall come from the
simulation. Idle it drums as in the dashboard, walking and running play the gif faster.

## How it is built

`critterd --stream` serves the simulation's frames as JSON lines on a Unix socket (Hyprland has no overlay of its own in that repo yet) and takes
`place` and `park` over its control socket. `services/Critters.qml` starts it, reads the frames and decides, `modules/critters/` draws the
cat in one window per screen (only the one it is on is mapped, in the top layer, below fullscreen windows), and `assets/critters/bongocat.toml` gives
the critter the body of the picture. The dashboard's cat is `modules/dashboard/dash/Media.qml`, which reports its place.

## Tested

Against a real `critterd` (scripted two-monitor desktop) with the shell's `Critters.qml` and `CatSprite.qml` under Qt 6.12 and stand-ins for
Quickshell's types: connecting, parking, the throw and landing, walking, the leap back, being cut by a window, the poses, the decision by dice and by a stand-in for
Ollama's `/v1/systemone`, and the fallback when it is gone. Not tested: a real Hyprland and Quickshell (layer-shell window, click-through,
the dashboard's coordinates), the real `clef-flash` model, several monitors, a window dragged under the cat.
