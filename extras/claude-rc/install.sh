#!/usr/bin/env bash
# Starts Claude Code Remote Control when this machine boots, as a systemd user service. No root needed, except maybe for
# `loginctl enable-linger`, which lets the user's services run without anyone logged in.
# Usage: install.sh [--uninstall]
set -euo pipefail

src=$(dirname "$(readlink -f "$0")")
bin=${XDG_BIN_HOME:-$HOME/.local/bin}
units=${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user
config=${XDG_CONFIG_HOME:-$HOME/.config}/claude-rc

if [[ ${1:-} == --uninstall ]]; then
    systemctl --user disable --now claude-rc.service 2> /dev/null || true
    rm -f "$units/claude-rc.service" "$bin/claude-rc"
    systemctl --user daemon-reload
    echo "Removed. $config/env is left in place."
    exit 0
fi

mkdir -p "$bin" "$units" "$config"
install -m 755 "$src/claude-rc" "$bin/claude-rc"
sed "s#@SCRIPT@#$bin/claude-rc#" "$src/systemd/claude-rc.service" > "$units/claude-rc.service"
[[ -e $config/env ]] || cat > "$config/env" << 'ENV'
# CLAUDE_RC_NAME=Athena
# CLAUDE_RC_DIR=/home/me/projects
# CLAUDE_RC_ARGS=--permission-mode acceptEdits
# CLAUDE_RC_INHIBIT=1
ENV

loginctl enable-linger "$USER" 2> /dev/null || sudo loginctl enable-linger "$USER"
systemctl --user daemon-reload
systemctl --user enable --now claude-rc.service

echo "Started. Follow it with: journalctl --user -u claude-rc -f"
echo "If it stops with 'not logged in': claude auth login. If it asks to trust the folder: run claude once in it."
