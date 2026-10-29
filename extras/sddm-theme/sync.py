#!/usr/bin/env python3
"""Copies what the login screen needs from the Caelestia shell into the SDDM theme.

SDDM runs the greeter as its own user, which cannot read your home directory, so everything is copied into the theme
folder, into files install.sh made writable for you:

  theme.conf.user   the colours of the current scheme, and the panel opacity of the shell
  background        the current wallpaper
  faces/<user>      your profile picture (~/.face)

Options of the theme itself (twelveHour, background) can be set in ~/.config/caelestia/sddm-theme.json, for example
{ "twelveHour": "true" }. Run it by hand or let the systemd path unit do it whenever the scheme or wallpaper changes.
"""

import argparse
import getpass
import json
import os
import shutil
import sys
from pathlib import Path

HOME = Path.home()
STATE = Path(os.environ.get("XDG_STATE_HOME") or HOME / ".local/state") / "caelestia"
CONFIG = Path(os.environ.get("XDG_CONFIG_HOME") or HOME / ".config") / "caelestia"

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


def copy_face(theme: Path) -> None:
    face = HOME / ".face"
    if face.is_file():
        shutil.copyfile(face, theme / "faces" / getpass.getuser())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--theme", type=Path, default=Path("/usr/share/sddm/themes/caelestia"), help="the installed theme")
    theme = parser.parse_args().theme

    if not os.access(theme / "theme.conf.user", os.W_OK):
        print(f"{theme}/theme.conf.user is not writable, run install.sh first", file=sys.stderr)
        return 1

    options = colours()
    options["panelOpacity"] = panel_opacity()
    options["background"] = "background" if copy_wallpaper(theme) else ""
    options.update({key: str(value) for key, value in read_json(CONFIG / "sddm-theme.json").items()})
    write_conf(theme, options)
    copy_face(theme)
    return 0


if __name__ == "__main__":
    sys.exit(main())
