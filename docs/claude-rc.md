# Claude Remote Control at boot

`extras/claude-rc` starts `claude remote-control` (also `claude rc`) when the machine boots, so its Claude Code sessions
can be used from claude.ai/code and the Claude app. It is a systemd user service that restarts itself, for Athena or any
other machine.

## Install

```sh
claude auth login          # once, as the user the service runs as
cd ~ && claude             # once in the folder the sessions work in, to trust it, then exit
extras/claude-rc/install.sh
journalctl --user -u claude-rc -f
```

The service needs `loginctl enable-linger`, which `install.sh` runs (with `sudo` if your user may not), so that it starts at
boot and not only when you log in. `install.sh --uninstall` removes it again.

## Settings

`~/.config/claude-rc/env`, read by the service:

| Variable | Meaning | Default |
| --- | --- | --- |
| `CLAUDE_RC_NAME` | name shown in the app | the hostname |
| `CLAUDE_RC_DIR` | folder the sessions work in | your home |
| `CLAUDE_RC_ARGS` | more options for `claude remote-control`, such as `--permission-mode acceptEdits` or `--spawn worktree` | none |
| `CLAUDE_RC_INHIBIT` | `1` keeps the machine from suspending while it runs, `0` does not | `1` |

Restart after a change: `systemctl --user restart claude-rc`. If `claude` was installed through nvm or something else outside
`~/.local/bin`, `~/.npm-global/bin`, `/usr/local/bin` and `/usr/bin`, set `PATH` in that file as well.

## Things to know

- **Sleep.** A suspended machine drops the session. By default the script holds a `sleep` inhibitor lock (`systemd-inhibit`),
  so `systemctl suspend` is refused for as long as it runs, including the shell's idle timeout. The screen still locks and turns
  off. Set `CLAUDE_RC_INHIBIT=0` if the machine should sleep instead.
- **Who gets in.** Whoever is signed in to your Claude account can start sessions that run commands on this machine. The
  permission mode is the default one, so file edits and commands still ask you in the app; `bypassPermissions` should
  not go in `CLAUDE_RC_ARGS` on a machine you care about.
- **It does not retry what waiting cannot fix.** Not installed, not logged in, or a missing folder stops the service with
  exit code 78. Fix it and `systemctl --user restart claude-rc`. Anything else, such as no network right after boot, is retried
  every 30 seconds.

## Tested

The script was run with a stand-in `claude` and `systemd-inhibit` (arguments, folder, name, the three exit-78 cases, no
inhibitor) and the installer against a scratch home. Not on a real machine, and the unit file was not checked by a running systemd.
