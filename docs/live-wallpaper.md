# Live wallpapers

Two wallpapers that move: a **village** that grows with what the computer does, and the **ecosystem** of the lock screen's
screensaver. Both are drawn as pixel art, 640x360 virtual pixels scaled up without smoothing, so a 4K screen costs no more
than a small one.

## Choosing one

- In the wallpaper switcher (`>wallpaper` in the launcher): two wallpapers in the folder `Live` are the village and the
  ecosystem. Their pictures show the world as it is.
- In the settings, Wallpaper & style, Live wallpaper.
- `caelestia shell liveWallpaper set village`, `ecosystem` or `off`; `caelestia shell liveWallpaper get` tells which one runs.

Choosing any other wallpaper switches the world off; "off" goes back to the last still wallpaper.

A live wallpaper is an ordinary wallpaper to the rest of the shell. The shell keeps a still of it in
`<wallpaper folder>/Live/Village.png` and `Ecosystem.png` (drawn with Pillow, which the `caelestia` CLI needs anyway) and
knows a wallpaper is live from that path alone. The colour scheme, the lock screen and the pickers therefore take what they
need from the still, which is renewed every 20 minutes while a world runs. Delete the folder and it comes back on the next
start. The stills are 1280x720, smaller than most screens, so `caelestia wallpaper -r` skips them unless the screen is small.

## The village

A camp of three tents and four people founds a village in a place that has water, hills and woods. It is the same village for
the same user: the land comes from a seed of the user name, the village from what happens to it. It is saved in
`$XDG_STATE_HOME/caelestia/village.json` every five minutes and when it stops, and picks up where it was; while the wallpaper is
not the village, the screen is asleep or the shell is not running, nothing happens to it.

**Renown** is the village's growth. It rises with the hour, faster the busier the computer is:

    renown per hour = 4 + 14 x CPU load + 8 x network traffic + 10 x GPU load

(traffic on a log scale, 10 KB/s to 10 MB/s, so both a download and a stream show). A quiet computer still grows a village,
a busy one grows it about three times as fast. Everything the village builds waits for its renown, and the number of
people follows it, so it takes days of use, not minutes, to get a town:

| Renown | What the village gets |
| --- | --- |
| 1 | huts, a woodcutters' hut |
| 3 to 14 | fields, a well, houses, a storehouse, a quarry |
| 22 to 60 | farmhouses, long houses, a market, a windmill, a bakery |
| 70 to 105 | a tavern, a smithy, barns, a dock |
| 150 to 260 | a church, a town hall, a watchtower |
| 320 to 480 | a library, a manor, a lighthouse, a mage's tower (after the graphics card has done a lot of work) |

For an ordinary computer (CPU about 20%, some traffic) renown is about 10 an hour: a market after four hours, the church on
the second day. People walk, work and sleep by the real clock: they chop, mine, fish, farm, build, carry and visit each other by
day, gather at the tavern in the evening and are asleep in their houses at night. Where they walk often, the grass wears into
a road.

### What the computer does to it

| Reading | In the village |
| --- | --- |
| CPU load | people work and walk faster (up to twice), forge sparks, more smoke; also renown |
| GPU load | the crystal on the mage's tower crackles with arcs of light, the harder the more of them; also renown |
| Memory in use | crates in the storehouse yards |
| Disk in use | more storehouses, so a fuller disk gets a bigger granary |
| Network traffic | trading ships at the dock and carts on the road from the gate, the more traffic the more of them; also renown |
| Something playing | notes rise from the tavern and the square, people gather and dance |
| A notification | a pigeon flies in from the edge of the map, rests at the town hall and leaves |
| Stock of wood, stone, food | logs, cut stone and hay about the storehouses |

### What the world does to it

| In the world | In the village |
| --- | --- |
| Time of day | light and dark, by the weather's own sunrise and sunset or by the date; windows and the fire glow at night |
| Season | foliage, blossom, autumn colours, crops that grow, ripen and are harvested, bare trees in winter |
| Weather | rain, snow, drizzle, fog, thunder with flashes; the day greys; wind turns the windmill and bends the smoke |
| Frost | snow settles on the ground and the roofs and melts in a thaw; in winter the water freezes below -1.5 degrees |
| Cold | the fires burn more wood, so the woodcutters are busier |

The weather comes from the shell's own weather service (Open-Meteo). Without a reading the village makes up a calm sky from
the date, so it is never frozen in one weather.

### Settings and IPC

The Live wallpaper settings have the speed (how many times faster than the clock the village lives, 1 for real time), the
frame rate and a button that founds a new village.

```sh
caelestia shell village census      # people, buildings, stock, renown, the hour as the village has it
caelestia shell village skip 24     # lets the village live 24 hours quickly, to watch it grow
caelestia shell village reset       # forgets the village and founds a new one
```

## The ecosystem

The world of the screensaver on the desktop. It takes the same readings as the screensaver (Wi-Fi networks raise islands,
connected Bluetooth devices become springs, traffic is rain, CPU heat dries the land), except the ones that go out on the
network: the pings and the list of neighbours are only taken while the screensaver runs, so a wallpaper that is up all day
sends nothing. See [the screensaver's design](superpowers/specs/2026-11-07-screensaver-ecosystem-design.md).

## Cost

The village steps ten times a second (a step takes well under a millisecond) and paints at the set frame rate: the ground is
painted again only when something on it changes, people and effects every frame, which takes about a millisecond of script. The
world is paused while the screen is asleep.

The depth clock, which is made for one wallpaper, is not shown over a live wallpaper.

## Without the shell

`scripts/village-render.js` draws the village into a PNG and `scripts/village-check.js` checks it, both with Node:

```sh
node scripts/village-render.js scene out.png --age 30 --hour 19 --date 2026-12-20 --weather 73 --temp -3
node scripts/village-render.js sheet sprites.png
node scripts/village-check.js
```
