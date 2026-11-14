# Live wallpapers: a village that grows with the computer

What the user asked for, in their words: a live background village that grows depending on the PC's stats and the environment,
with little pixel people, and the ecosystem of the screensaver and the village as wallpapers and background. How it works is in
[docs/live-wallpaper.md](../../live-wallpaper.md); this is why it is the way it is.

## A live wallpaper is a wallpaper

The shell, the CLI and the pickers all think in image paths: the colour scheme is made from the wallpaper's picture, the lock
screen blurs it, the greeter copies it, the switcher lists the files in the folder. Teaching each of them a second kind of
wallpaper would touch half the shell. Instead a live wallpaper has a still, `<wallpaper folder>/Live/Village.png`, and the shell
knows it is live from that path alone (`LiveWallpaper.kind`). Everything else keeps working on an image, and the still is also
the picker's thumbnail, showing the village as it is.

The stills are drawn without a window. The drawing code needs only `fillRect`, so `vposter.js` draws it onto a small raster in
plain script and hands the pixels, as base64 over a pipe, to Pillow, which the CLI needs anyway. No PNG encoder, no GPU, no
window to grab. Canvas to canvas `drawImage`, `grabToImage` of a hidden item and a data URL round trip were all tried first and
were unreliable or heavy.

## Art in code, as rectangles

There are no image assets. `vart.js` builds houses, trees and props from pixel grids with palettes, merges each grid once into a
list of rectangles and draws that with `fillRect`. The same list serves the canvas, the raster for stills and the Node
renderer, so the art can be looked at without a shell. A season rebuilds the library (about 20 ms).

The map is 80x45 tiles of 8 virtual pixels. It is scaled cover-fit with no smoothing; the ground and everything that stands
still is on one canvas that is painted only when the world says it changed (a tree cut, a site's progress, a road worn), people and
effects on another that is painted every frame, then the dark of the hour as a rectangle, then the lights, so windows glow
above the dark. Smoke, fire, rain, gulls, fireflies, boats and carts are plain functions of time, so the world needs no state
for them and a save stays small (about 30 KB).

A person behind a house is not drawn rather than drawn on top of it: the covers of the things that can hide someone come from
the ground paint, and a person on one, above its feet line, is skipped.

## Growth is renown, paced by the computer

A village that is a function of uptime alone would be done in a day, one that follows the load alone would be erratic. Renown
is a slow sum (4 an hour, plus the CPU, network and GPU load), and everything waits for it: buildings by an unlock level, the
population by a target that grows as the square root. Resources and building time still matter, so the village can be seen
working: the planner sets the cost aside when it places a site, builders walk to it and raise it row by row behind scaffolding,
woodcutters replant where they cut. The computer's other readings do not change what is built but what is seen, so the
village says something about the machine at a glance (smoke for the CPU, crackling for the graphics card, ships for traffic).

Food is counted in days for one person, so stock and storage scale with the people; at first it was per second and the first
night starved a village that had slept through it.

## One world per kind, shared by the screens

`Village` and `EcoWorld` are singletons that step a plain JS object; each screen's `VillageView` or `EcoView` draws it. A world that
is not the wallpaper is not stepped and costs nothing. The ecosystem also runs for the screensaver; the singleton has one flag
for each and runs while either is set, and only the screensaver turns on the pings and neighbour scan, so a wallpaper up
all day sends nothing.

## What was left alone

- Settings live in the shell's state files, not the C++ configuration, to leave the plugin alone: a speed and a frame rate do
  not warrant a config node.
- The map size is fixed (80x45), so a save stays valid when the screens change; other aspect ratios crop.
- The depth clock belongs to one wallpaper and is not shown over a live one.
- No sound.
- The ecosystem does not get a village's kind of persistence beyond what EcoWorld saves per network.

## Checks

`scripts/village-check.js`: sound worlds for a day under quiet, ordinary and heavy loads, buildings that do not overlap and can
all be walked to, growth that follows the load, an economy that survives two days, the clock's seasons and light, snow and thaw,
hostile readings, saves that restore, a step cheap enough to run all day, art and simulation that agree about every building,
and full frames in every season and weather. The first run found buildings that were walled in by later ones, which is what the
door reservation and the access check in the planner are for.
