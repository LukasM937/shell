# Working in this fork

Personal fork of caelestia-dots/shell. Compatibility with upstream is not a goal.

## CI is off

All workflows in `.github/workflows` run on `workflow_dispatch` only, except `release.yml` (tags). The old checks failed
for infrastructure reasons: the job container `ghcr.io/${{ github.repository_owner }}/shell-arch-env` has capital letters
in the owner (`LukasM937`), which Docker rejects, and the image was never built in this fork. Turning CI back on means
lowercasing that reference and running `update-image.yml` once.

## Checks to run before pushing

These are what CI used to enforce. Run them locally instead.

```sh
python3 scripts/qml-lint-conventions.py   # property/child ordering in QML objects
python3 scripts/trs-check.py              # translation helper misuse
qmlformat <file.qml> | diff -u <file.qml> -   # no output means formatted
clang-format --dry-run --Werror <file>    # C++ only, needs clang-format 20+
node scripts/runner-check.js              # lock screen game: no map may be unwinnable, run after touching modules/lock/runner.js
node scripts/ecosystem-check.js           # lock screen ecosystem: no invalid values, land survives, run after touching modules/lock/ecosystem.js
node scripts/idlechain-check.js           # idle chain: lock, screensaver, display off and sleep times, run after touching daemons/idlechain.js
node scripts/village-check.js             # village wallpaper: sound villages, growth, saves, art, run after touching modules/live/*.js
```

`node scripts/village-render.js scene out.png --age 30 --hour 19` draws the village into a PNG, `sheet` the pixel art; look at
the result after touching modules/live/vart.js or vdraw.js, the check cannot tell a pretty house from an ugly one.

`qmlformat` without a Qt install: `python3 -m venv v && v/bin/pip install PySide6-Essentials`, then use
`v/lib/python*/site-packages/PySide6/qmlformat`. Version 6.12 matches the repo's formatting exactly.

## Code rules

- Match the surrounding code: naming, comment density, idiom. Comments say why, not what.
- No trailing whitespace, one space around operators.
- QML object order: `id`, properties, signals, functions, bindings, child objects, components.
- User-visible strings go through `Tr.tr()` / `Tr.trCtx()` from `Caelestia.I18n`, with a `// TRANSLATORS:` comment when
  the meaning is not obvious. Never `qsTr()`.
- Colours come from `Colours.palette` / `Colours.tPalette`, sizes from `Tokens`. Cards on the dashboard and lock screen use
  `Tokens.rounding.medium` and `Colours.tPalette.m3surfaceContainer`.

## Commits and PRs

- Commit title: `type(scope): change`, with the scope from `.github/scopes.txt` (for example `fix(lock): ...`).
  The most important change goes in the title, the rest in the body.
- One topic per PR. The description says what changed, how it was tested and what was not tested.
- Test in the running shell before opening a PR. Say so when something could only be checked in code.
