# SDDM theme

A login screen for SDDM in the look of the lock screen: the blurred wallpaper, a rounded panel with the two-tone clock,
profile picture and password pill whose characters pop in as shapes, plus a session picker and suspend / restart /
shut down buttons. The colours are those of your current scheme and follow it when it changes.

![Preview](../extras/sddm-theme/preview.png)

## Requirements

- SDDM 0.21 or newer (Qt 6), with Qt 6.7+ for the variable font axes
- `ttf-material-symbols-variable`, installed system-wide, for the icons. Without it the icons are plain glyphs
- `qt6-imageformats`, if your wallpapers are WebP
- `python3`, and `sudo` once for the install

## Install

```sh
extras/sddm-theme/install.sh
```

This copies the theme to `/usr/share/sddm/themes/caelestia`, selects it in `/etc/sddm.conf.d/caelestia.conf`, and sets up
a systemd user path unit that runs `sync.py` whenever the scheme or wallpaper changes. Preview it without logging out:

```sh
sddm-greeter-qt6 --test-mode --theme /usr/share/sddm/themes/caelestia
```

If `/etc/sddm.conf` sets `Current=` itself it wins over the drop-in; remove that line. `install.sh --uninstall` removes
everything again.

## What is kept in sync

SDDM runs the greeter as its own user, which cannot read your home directory, so `sync.py` copies what the greeter needs
into the theme folder. `install.sh` makes exactly these files writable for you, so no root is needed afterwards:

| File | Content |
| --- | --- |
| `theme.conf.user` | the colours of `~/.local/state/caelestia/scheme.json`, and the panel opacity of `shell.json` (`appearance.transparency`) |
| `background` | the current wallpaper. Video wallpapers are skipped and the panel sits on the surface colour |
| `faces/<user>` | your profile picture, `~/.face` |

Options go in `~/.config/caelestia/sddm-theme.json` and are written to `theme.conf.user` by the next sync. Any key of
`theme.conf` works:

```json
{ "twelveHour": "true", "background": "" }
```

## Differences to the lock screen

- The M3 shapes of the shell (`qt6-m3shapes`) are not available to the greeter. The profile picture is a rounded square
  instead of the clam shell, and the password characters morph between a few simple shapes.
- The strings are English only.
- Other users get SDDM's own picture, or a person icon.

## Tested

Headless with Qt 6.12 and software OpenGL, with mocked `sddm`, `userModel`, `sessionModel` and `keyboard` objects: idle,
typing, showing the password, a failed login, Caps Lock, the login in flight, the session list, switching users, the
power buttons, 12 hour clock, a scheme read from the installed `theme.conf.user`, and 1280x720 to 2560x1440. Not tested in a
running SDDM.
