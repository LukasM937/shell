# Depth clock

A large desktop clock that sits *behind* the scenery of the wallpaper, iOS lock screen style, with
an optional parallax effect that moves the scenery with the cursor.

The shell side (`modules/background/DepthClock.qml`, `ParallaxEffect.qml`) only displays a layout.
The heavy lifting is done once per wallpaper by `generate.py`:

1. estimates depth with [Depth Anything V2 Small](https://huggingface.co/onnx-community/depth-anything-v2-small)
   (ONNX, CPU, Apache-2.0) and cuts out the nearest layer,
2. searches for a clock position where the foreground covers part of the digits while the
   top half and the day name stay clear,
3. picks a scheme colour with enough contrast, and adds a soft backdrop behind the date
   when the scenery there is busy,
4. writes `$XDG_STATE_HOME/caelestia/depth-clock/layout.json`, plus the cutout and a screen-space
   depth map for the parallax shader.

A systemd path unit reruns it when the wallpaper, the colour scheme or the settings change
(a few seconds on CPU). Until the layout matches the current wallpaper the clock stays hidden.

## Install

```sh
extras/depth-clock/install.sh
```

No root needed. It installs into `$XDG_DATA_HOME/caelestia/depth-clock` (venv with numpy,
onnxruntime and pillow; ~100 MB model, checksum pinned), compiles the shader with `qsb`
(qt6-shadertools) and enables `caelestia-depth-clock.path`.

## Settings

Nexus → Wallpaper & style → Depth clock, or `$XDG_CONFIG_HOME/caelestia/depth-clock.json`.
Unset keys use the defaults at the top of `generate.py`.

| Key | Default | |
| --- | --- | --- |
| `enabled` | `true` | |
| `time.fonts` | `["Anurati Pro", "Michroma", "Google Sans Flex"]` | first installed font that has digits |
| `time.style` | `"outline"` | or `"solid"` |
| `time.stroke` | `0.0045` | outline width, fraction of screen height |
| `day.fonts` | `["Anurati", "Michroma"]` | |
| `colour` | `"auto"` | a scheme key (`"primary"`) or hex (`"#ff9e64"`) |
| `palette` | `"single"` | `"auto"`: each element picks its own colour |
| `backdrop` | `{ "enabled": true, "opacity": 0.5 }` | |
| `parallax` | `{ "enabled": true, "strength": 0.015 }` | |
| `occlusion` | `0.3` | target share of the digits hidden by the foreground |

`preview.py [out.png]` renders a still mock-up of the current layout without the shell.
