# Keybind overview

A searchable list of your Hyprland keybinds inside the launcher. When the focused app has its own entry (Alacritty,
Firefox, VS Code, Thunar), its shortcuts come first, then the window binds, then the rest.

## Opening it

Nothing is bound by default. Pick one of these.

**1. Bind the global shortcut.** The shell registers `caelestia:keybinds`. Pressing it opens the launcher in keybind mode;
pressing it again closes the launcher.

```lua
-- hyprland.lua
hl.bind("SUPER + slash", hl.dsp.global("caelestia:keybinds"))
```

```ini
# hyprlang
bind = SUPER, slash, global, caelestia:keybinds
```

**2. Type it in the launcher.** Open the launcher and type `>keys ` (the `>` is `launcher.actionPrefix`). The "Keybinds" entry
in the action list (`>`) does the same.

**3. From a terminal or script.** `hyprctl dispatch 'hl.dsp.global("caelestia:keybinds")'` on a Lua config,
`hyprctl dispatch global caelestia:keybinds` on hyprlang.

### Picking a combination

Check the overview before binding, since search matches key names too: type `slash`, or the combination you have in mind.
In the Caelestia dotfiles `SUPER + SHIFT + M` is **Mute** (`kbVolumeMute`), `SUPER + M` is the music workspace and
`SUPER + K` shows all panels. No `kb*` variable there uses `slash` or `F1`, so those are likely free.

## Using it

- Type to filter. The search covers the action, its section and the key names.
- Each row shows the action, its section and the first key combination. Other combinations for the same action are
  listed under the label ("also ...").
- Enter or a click just closes the launcher. Rows are information only.

## Where the list comes from

| Config | Source |
| --- | --- |
| Hyprland Lua (`hyprland.lua`) | `assets/dump-keybinds.lua` runs your config against a stand-in `hl` API and prints the binds as JSON. Nothing is applied, run or written. |
| Hyprlang | `hyprctl binds -j`. Labels are the bind descriptions, or the dispatcher and its argument. |

The Lua route needs the `lua` binary on `PATH`. Without it the Hyprland part of the list is empty.

How the Lua dump labels things:

- A global shortcut gets the description Hyprland reports for it (`hyprctl globalshortcuts`).
- A bind that reads a `kb*` variable from `variables.lua` is named after it (`kbVolumeMute` becomes "Mute"). A few
  names are overridden in the script.
- Everything else takes the nearest short comment above it as its section, and the dispatcher as its label.
- Loops such as `SUPER + 0-9` or `SUPER + arrows` become one row. Binds that do the same thing are merged.

Run it by hand to see what it finds:

```sh
lua assets/dump-keybinds.lua [path to hypr config dir] | jq .
```

## App shortcuts

Built-in apps are in `assets/app-shortcuts.json`. Add your own, or extend and relabel a built-in one, in
`~/.config/caelestia/app-shortcuts.json`. An entry with the same `name` as a built-in one replaces its fields. Its `binds`
are put in front of the built-in shortcuts it doesn't relabel (matched by `label`).

```json
[
    {
        "name": "Kitty",
        "classes": ["kitty"],
        "binds": [
            { "label": "New tab", "keys": ["CTRL + SHIFT + T"] },
            { "label": "Next tab", "keys": ["CTRL + SHIFT + Right"] }
        ]
    }
]
```

- `classes` are matched against the focused window's class, case-insensitively.
- `keys` are written like Hyprland binds: `MOD + MOD + Key`. A range like `ALT + 1-8` is fine.
- The file is read each time the overview opens, so changes apply without a restart.
