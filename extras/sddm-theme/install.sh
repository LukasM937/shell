#!/usr/bin/env bash
# Installs the Caelestia SDDM theme and keeps it in sync with the shell. Needs sudo for /usr/share/sddm and /etc/sddm.conf.d.
# Usage: install.sh [--uninstall]
set -euo pipefail

src=$(dirname "$(readlink -f "$0")")
repo=$(readlink -f "$src/../..")
theme=${SDDM_THEMES_DIR:-/usr/share/sddm/themes}/caelestia
data=${XDG_DATA_HOME:-$HOME/.local/share}/caelestia/sddm-theme
units=${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user
conf=${SDDM_CONF_DIR:-/etc/sddm.conf.d}/caelestia.conf
me=$(id -un)

if [[ ${1:-} == --uninstall ]]; then
    systemctl --user disable --now caelestia-sddm.path 2>/dev/null || true
    rm -f "$units"/caelestia-sddm.{path,service}
    rm -rf "$data"
    sudo rm -rf "$theme" "$conf"
    systemctl --user daemon-reload
    echo "Removed. SDDM falls back to its default theme."
    exit 0
fi

sudo install -d -m 755 "$theme"
sudo install -m 644 "$src"/*.qml "$src"/{qmldir,metadata.desktop,theme.conf} "$theme/"
[[ -f $src/preview.png ]] && sudo install -m 644 "$src/preview.png" "$theme/"
# What sync.py updates without root: the greeter only reads these, but you own them. The font of the theme stays
# in fonts/ next to the ones of the depth clock
sudo install -d -m 755 -o "$me" "$theme/faces" "$theme/fonts"
sudo install -m 644 "$repo/assets/google-sans-flex/GoogleSansFlex-VariableFont_GRAD,ROND,opsz,slnt,wdth,wght.ttf" "$theme/fonts/GoogleSansFlex.ttf"

for file in theme.conf.user background; do
    [[ -e $theme/$file ]] || sudo install -m 644 -o "$me" /dev/null "$theme/$file"
done
# The picture until sync.py finds the one of your session menu
[[ -e $theme/mascot ]] || sudo install -m 644 -o "$me" "$repo/assets/kurukuru.gif" "$theme/mascot"

sudo install -d -m 755 "$(dirname "$conf")"
printf '[Theme]\nCurrent=caelestia\n' | sudo tee "$conf" >/dev/null
if grep -qs '^Current=' /etc/sddm.conf; then
    echo "Note: /etc/sddm.conf sets a theme too and wins over $conf. Remove its Current= line." >&2
fi

mkdir -p "$data" "$units"
cp "$src/sync.py" "$data/"
cp "$src"/systemd/caelestia-sddm.path "$units/"
sed "s#@SYNC@#$data/sync.py#; s#@SHELL@#$repo#" "$src/systemd/caelestia-sddm.service" > "$units/caelestia-sddm.service"
systemctl --user daemon-reload
systemctl --user enable --now caelestia-sddm.path
CAELESTIA_SHELL_DIR=$repo python3 "$data/sync.py" --theme "$theme"

echo "Done. Preview without logging out: sddm-greeter-qt6 --test-mode --theme $theme"
