#!/usr/bin/env bash
# Sets up the depth clock generator for the current user (no root needed):
# copies it to $XDG_DATA_HOME/caelestia/depth-clock, creates a venv, downloads the depth model,
# compiles the parallax shader and enables the systemd user units that rerun it on changes.
set -euo pipefail

src=$(dirname "$(readlink -f "$0")")
dest=${XDG_DATA_HOME:-$HOME/.local/share}/caelestia/depth-clock
cfg=${XDG_CONFIG_HOME:-$HOME/.config}
model_url=https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/4472b7362082ad9968fee890ca0f1e5aca36b93d/onnx/model.onnx
model_sha=afb6a5c28f3b6bf1618c6e43f02073ef9dfdc70e937502d51603e57b0a1df10c
qsb=$(command -v qsb6 || command -v qsb || echo /usr/lib/qt6/bin/qsb)

mkdir -p "$dest/models"
cp "$src"/{generate.py,preview.py,parallax.frag,requirements.txt} "$dest/"

[[ -x $dest/venv/bin/python ]] || python3 -m venv "$dest/venv"
"$dest/venv/bin/pip" install -q -r "$dest/requirements.txt"

model=$dest/models/depth-anything-v2-small.onnx
if ! echo "$model_sha  $model" | sha256sum -c --status 2>/dev/null; then
    echo "Downloading Depth Anything V2 Small (Apache-2.0, ~100 MB)..."
    curl -fL --progress-bar -o "$model.part" "$model_url"
    echo "$model_sha  $model.part" | sha256sum -c --status || { echo "Checksum mismatch" >&2; exit 1; }
    mv "$model.part" "$model"
fi

"$qsb" --glsl "100 es,120,150" --hlsl 50 --msl 12 -o "$dest/parallax.frag.qsb" "$dest/parallax.frag"

mkdir -p "$cfg/caelestia"
[[ -f $cfg/caelestia/depth-clock.json ]] || echo '{ "enabled": true }' > "$cfg/caelestia/depth-clock.json"

mkdir -p "$cfg/systemd/user"
cp "$src"/systemd/caelestia-depth-clock.{path,service} "$cfg/systemd/user/"
systemctl --user daemon-reload
systemctl --user enable --now caelestia-depth-clock.path
systemctl --user start caelestia-depth-clock.service
echo "Done. Settings: Nexus > Wallpaper & style > Depth clock, or $cfg/caelestia/depth-clock.json"
