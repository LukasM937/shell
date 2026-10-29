#!/usr/bin/env python3
"""Copies what the login screen needs from the Caelestia shell into the SDDM theme.

SDDM runs the greeter as its own user, which cannot read your home directory, so everything is copied into the theme
folder, into files install.sh made writable for you:

  theme.conf.user   the colours of the current scheme, the panel opacity of the shell and the style of the depth clock
  background        the current wallpaper
  fonts/time|day|date   the fonts of the depth clock, found with fontconfig
  mascot            the gif of the session menu (paths.sessionGif), shown instead of a profile picture
  faces/<user>      your profile picture (~/.face), if you have one

Options of the theme itself (twelveHour, background, avatar) can be set in ~/.config/caelestia/sddm-theme.json, for
example { "twelveHour": "true", "avatar": "mascot" }, where avatar is auto (the picture if there is one), mascot or
face. "mascot" can also name another image or gif. Run it by hand or let the systemd path unit do it whenever the scheme
or wallpaper changes.
"""

import argparse
import getpass
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

HOME = Path.home()
STATE = Path(os.environ.get("XDG_STATE_HOME") or HOME / ".local/state") / "caelestia"
CONFIG = Path(os.environ.get("XDG_CONFIG_HOME") or HOME / ".config") / "caelestia"

# Where an installed shell can be, for root:/ paths
SHELL_DIRS = [
    Path(os.environ["CAELESTIA_SHELL_DIR"]) if os.environ.get("CAELESTIA_SHELL_DIR") else None,
    Path(os.environ.get("XDG_CONFIG_HOME") or HOME / ".config") / "quickshell/caelestia",
    Path("/etc/xdg/quickshell/caelestia"),
    Path("/usr/share/quickshell/caelestia"),
    Path(__file__).resolve().parents[2],
]

# CSS-like font weight to the fontconfig scale
FC_WEIGHTS = [(800, 205), (700, 200), (600, 180), (500, 100), (400, 80), (0, 50)]

# Video wallpapers cannot be a background image
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".avif", ".jxl"}


def read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return {}


def colours() -> dict[str, str]:
    scheme = read_json(STATE / "scheme.json")
    return {name: f"#{value.lstrip('#')}" for name, value in scheme.get("colours", {}).items() if not name.startswith("term")}


def panel_opacity() -> str:
    transparency = read_json(CONFIG / "shell.json").get("appearance", {}).get("transparency", {})
    return str(transparency.get("base", 0.85)) if transparency.get("enabled") else "1"


def write_conf(theme: Path, options: dict[str, str]) -> None:
    lines = ["# Written by sync.py, edit ~/.config/caelestia/sddm-theme.json instead", "[General]"]
    lines += [f'{key}="{value}"' for key, value in options.items()]
    (theme / "theme.conf.user").write_text("\n".join(lines) + "\n")


def copy_wallpaper(theme: Path) -> bool:
    try:
        wallpaper = Path((STATE / "wallpaper/path.txt").read_text().strip())
    except OSError:
        return False
    if wallpaper.suffix.lower() not in IMAGE_SUFFIXES or not wallpaper.is_file():
        return False
    shutil.copyfile(wallpaper, theme / "background")
    return True


def fc_weight(weight: int) -> int:
    return next(fc for css, fc in FC_WEIGHTS if weight >= css)


def find_font(family: str, weight: int) -> Path | None:
    """The font file of a family, or None when fontconfig only has a substitute."""
    try:
        out = subprocess.run(["fc-match", "-f", "%{file}\n%{family}\n", f"{family}:weight={fc_weight(weight)}"], capture_output=True, text=True, timeout=15, check=True).stdout.splitlines()
    except (OSError, subprocess.SubprocessError):
        return None
    if len(out) < 2:
        return None
    squash = lambda name: name.replace(" ", "").lower()
    if squash(family) not in [squash(name) for name in out[1].split(",")]:
        return None
    return Path(out[0])


def copy_font(theme: Path, role: str, family: str | None, weight: int) -> str:
    """Copies the font of a role into the theme and returns its theme.conf path, or an empty string."""
    target = theme / "fonts" / role
    found = find_font(family, weight) if family else None
    if not found:
        target.unlink(missing_ok=True)
        return ""
    shutil.copyfile(found, target)
    return f"fonts/{role}"


def clock_options(theme: Path) -> dict[str, str]:
    """Style of the depth clock (extras/depth-clock), which the lock screen follows too. Nothing without its layout."""
    layout = read_json(STATE / "depth-clock/layout.json")
    time, day, date = (layout.get(key) or {} for key in ("time", "day", "date"))
    if layout.get("enabled") is not True or not time.get("font"):
        for role in ("time", "day", "date"):
            (theme / "fonts" / role).unlink(missing_ok=True)
        return {}

    axes = time.get("axes") or {}
    options = {
        "clockStyle": "desktop",
        "timeFont": copy_font(theme, "time", time["font"], time.get("weight", 800)),
        "timeWeight": time.get("weight", 800),
        "timeRound": axes.get("ROND", 100),
        "timeWidth": axes.get("wdth", 100),
        "timeStyle": time.get("style", "solid"),
        "timeStroke": time.get("stroke", 0.004),
        "timeSize": time.get("size", 0.3),
        "timeColour": f"#{time.get('colour', 'ffffff')}",
        "dayFont": copy_font(theme, "day", day.get("font"), 400),
        "daySize": day.get("size", 0.05),
        "daySpacing": day.get("spacing", 0),
        "dayColour": f"#{day.get('colour', 'ffffff')}",
        "dateFont": copy_font(theme, "date", date.get("font"), date.get("weight", 500)),
        "dateWeight": date.get("weight", 500),
        "dateSize": date.get("size", 0.025),
        "dateColour": f"#{date.get('colour', 'ffffff')}",
        "dateHumanEra": str(bool(date.get("humanEra"))).lower(),
    }
    return {key: str(value) for key, value in options.items()}


def resolve(reference: str) -> Path | None:
    """A path as the shell reads it: root:/ is the shell's own folder, ~ is home."""
    reference = os.path.expandvars(reference.strip()).replace("~", str(HOME))
    if reference.startswith("root:/"):
        relative = reference.removeprefix("root:/")
        return next((dir / relative for dir in SHELL_DIRS if dir and (dir / relative).is_file()), None)
    path = Path(reference.removeprefix("file://"))
    return path if path.is_file() else None


def copy_mascot(theme: Path, avatar: str, other: str) -> bool:
    """The gif of the session menu, as set in paths.sessionGif (or another file), shown instead of a profile picture."""
    reference = other or read_json(CONFIG / "shell.json").get("paths", {}).get("sessionGif", "root:/assets/kurukuru.gif")
    source = resolve(reference) if avatar != "face" and reference else None
    if not source:
        (theme / "mascot").unlink(missing_ok=True)
        return False
    shutil.copyfile(source, theme / "mascot")
    return True


def copy_face(theme: Path, choice: str) -> None:
    target = theme / "faces" / getpass.getuser()
    face = HOME / ".face"
    if choice != "mascot" and face.is_file():
        shutil.copyfile(face, target)
    else:
        target.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--theme", type=Path, default=Path("/usr/share/sddm/themes/caelestia"), help="the installed theme")
    theme = parser.parse_args().theme

    if not os.access(theme / "theme.conf.user", os.W_OK):
        print(f"{theme}/theme.conf.user is not writable, run install.sh first", file=sys.stderr)
        return 1

    user = {key: str(value) for key, value in read_json(CONFIG / "sddm-theme.json").items()}
    avatar = user.pop("avatar", "auto")
    config = read_json(CONFIG / "shell.json")

    options = colours()
    options["panelOpacity"] = panel_opacity()
    options["background"] = "background" if copy_wallpaper(theme) else ""
    options["mascot"] = "mascot" if copy_mascot(theme, avatar, user.pop("mascot", "")) else ""
    options["mascotSpeed"] = str(config.get("general", {}).get("sessionGifSpeed", 0.7))
    options.update(clock_options(theme))
    options.update(user)
    write_conf(theme, options)
    copy_face(theme, avatar)
    return 0


if __name__ == "__main__":
    sys.exit(main())
