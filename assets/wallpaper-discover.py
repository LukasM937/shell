#!/usr/bin/env python3
"""Finds wallpapers online and picks the ones that suit the colour scheme. Every command prints JSON.

  search [--query Q] [--colour C] [--page N]   results with vetted local thumbnails
  fetch PROVIDER ID                            downloads a search result into <wallpaper dir>/Discover
  colours                                      colour, brightness and scheme fit of the local wallpapers
  daily [--force]                              today's discovered wallpaper, downloaded on the first call of the day
  slot                                         a local wallpaper for the current time of day, and whether the slot changed

Only safe-for-work results are requested: wallhaven's SFW purity and general category (no people or
anime), or Unsplash's strict content filter, minus a list of suggestive tags. When onnxruntime and the
NSFW model (~/.local/share/caelestia/wallpaper-discover/nsfw.onnx) are available, every thumbnail and
download is also classified locally, and anything the model can't check is dropped.

Settings are read from ~/.config/caelestia/wallpaper-discover.json.
"""

import argparse
import colorsys
import datetime
import hashlib
import io
import json
import math
import os
import random
import sys
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image

HOME = Path.home()
CONFIG = Path(os.environ.get("XDG_CONFIG_HOME") or HOME / ".config") / "caelestia"
CACHE = Path(os.environ.get("XDG_CACHE_HOME") or HOME / ".cache") / "caelestia/wallpaper-discover"
STATE = Path(os.environ.get("XDG_STATE_HOME") or HOME / ".local/state") / "caelestia"
DATA = Path(os.environ.get("XDG_DATA_HOME") or HOME / ".local/share") / "caelestia/wallpaper-discover"

DEFAULTS = {
    "provider": "wallhaven",  # or "unsplash", which needs unsplashKey
    "unsplashKey": "",
    "minResolution": "1920x1080",
    "excludeTags": [
        "women", "model", "bikini", "lingerie", "swimwear", "underwear",
        "cleavage", "nude", "sexy", "boobs", "thighs", "butt",
    ],
    "nsfwThreshold": 0.15,
    "auto": "off",  # what the shell changes the wallpaper by: "off", "daily" or "timeOfDay"
    "dailyQuery": "",
    "slotHours": [6, 11, 17, 21],  # morning, day, evening, night
    "python": "",  # interpreter the shell runs this with, e.g. one with onnxruntime
}

# Colour filter names, with the closest colour each provider can search for
COLOURS = {
    "dark": ("000000", "black"),
    "red": ("cc0000", "red"),
    "orange": ("ff6600", "orange"),
    "yellow": ("ffcc33", "yellow"),
    "green": ("77cc33", "green"),
    "teal": ("66cccc", "teal"),
    "blue": ("0066cc", "blue"),
    "purple": ("663399", "purple"),
    "pink": ("ea4c88", "magenta"),
}
# Daily picks rotate through these unless dailyQuery is set, and skip text-only images
THEMES = ["landscape", "mountains", "forest", "space", "city", "ocean", "nature", "night"]
DAILY_EXCLUDE = ["text", "typography", "logo", "meme", "quote"]
HUES = [(15, "red"), (40, "orange"), (70, "yellow"), (160, "green"), (200, "teal"), (250, "blue"), (290, "purple"), (345, "pink"), (360, "red")]
IMAGE_TYPES = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}
USER_AGENT = "caelestia-shell wallpaper-discover"


def settings():
    s = dict(DEFAULTS)
    try:
        s.update(json.loads((CONFIG / "wallpaper-discover.json").read_text()))
    except (OSError, ValueError):
        pass
    return s


def read_json(path, default):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return default


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data))
    tmp.replace(path)


def get(url, headers=None, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return res.read()


# --- Image analysis ---------------------------------------------------------------------------------


def scheme():
    """The current scheme's mode and the colours wallpapers should sit well with"""
    data = read_json(STATE / "scheme.json", {})
    c = data.get("colours", {})
    names = ["background", "surfaceContainer", "surfaceContainerHighest", "primary", "secondary", "tertiary", "outline"]
    palette = [tuple(int(c[n][i : i + 2], 16) for i in (0, 2, 4)) for n in names if len(c.get(n, "")) == 6]
    return data.get("mode", "dark"), palette


def analyse(img):
    """Brightness, detail, main colour bucket and the five most common colours with their share"""
    small = img.convert("RGB").resize((64, 64))
    pixels = list(getattr(small, "get_flattened_data", small.getdata)())
    lum = sum(0.2126 * r + 0.7152 * g + 0.0722 * b for r, g, b in pixels) / len(pixels) / 255

    buckets, colourful = {}, 0
    for r, g, b in pixels:
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        if s > 0.25 and v > 0.2:
            colourful += 1
            name = next(n for limit, n in HUES if h * 360 < limit)
            buckets[name] = buckets.get(name, 0) + s * v
    if colourful < len(pixels) * 0.15:
        bucket = "dark" if lum < 0.4 else "light"
    else:
        bucket = max(buckets, key=buckets.get)

    # Entropy of the grey levels: flat graphics and text score low, photos high
    hist = small.convert("L").histogram()
    detail = -sum(n / len(pixels) * math.log2(n / len(pixels)) for n in hist if n) / 8

    quant = small.quantize(5)
    pal = quant.getpalette()
    counts = sorted(quant.getcolors(), reverse=True)
    colours = [["%02x%02x%02x" % tuple(pal[i * 3 : i * 3 + 3]), n / len(pixels)] for n, i in counts]
    return {"lum": round(lum, 3), "detail": round(detail, 3), "bucket": bucket, "colours": colours}


def fit(info, mode, palette):
    """0-1, how well a wallpaper suits the scheme: dark (or light) enough and close to its colours"""
    tone = max(0.0, min(1.0, 1 - info["lum"] * 1.6 if mode == "dark" else info["lum"] * 1.4))
    if not palette:
        return round(tone, 3)
    dist = 0.0
    for hexc, share in info["colours"]:
        rgb = tuple(int(hexc[i : i + 2], 16) for i in (0, 2, 4))
        dist += share * min(sum((a - b) ** 2 for a, b in zip(rgb, p)) ** 0.5 for p in palette) / 441
    close = max(0.0, 1 - dist * 2.5)
    return round(0.6 * tone + 0.4 * close, 3)


# --- NSFW check -------------------------------------------------------------------------------------


class Classifier:
    """Local NSFW classifier (a ViT exported to ONNX, labels normal/nsfw), if installed"""

    def __init__(self, threshold):
        self.threshold = threshold
        self.session = None
        self.status = "off"  # no model: only the providers' own filters apply
        model = DATA / "nsfw.onnx"
        if not model.exists():
            return
        try:
            import numpy as np
            import onnxruntime as ort

            self.np = np
            self.session = ort.InferenceSession(str(model), providers=["CPUExecutionProvider"])
            self.input = self.session.get_inputs()[0].name
            self.status = "on"
        except Exception:
            self.status = "broken"  # a model is set up but can't run: fail closed

    def safe(self, images):
        """Whether each image is safe; unknown counts as unsafe once a model is set up"""
        if self.status == "off":
            return [True] * len(images)
        if self.status != "on":
            return [False] * len(images)
        out = []
        for img in images:
            try:
                x = self.np.asarray(img.convert("RGB").resize((224, 224), Image.BILINEAR), dtype=self.np.float32)
                x = ((x / 255 - 0.5) / 0.5).transpose(2, 0, 1)[None]
                logits = self.session.run(None, {self.input: x})[0][0]
                e = self.np.exp(logits - logits.max())
                out.append(float(e[1] / e.sum()) < self.threshold)
            except Exception:
                out.append(False)
        return out


# --- Providers --------------------------------------------------------------------------------------


def wallhaven(s, query, colour, page, sorting=None, seed=None, exclude=()):
    q = " ".join([query] + [f"-{t}" for t in [*s["excludeTags"], *exclude]]).strip()
    params = {
        "q": q,
        "categories": "100",  # general only: no anime, no people
        "purity": "100",  # safe for work only
        "atleast": s["minResolution"],
        "ratios": "16x9,16x10,21x9",
        "sorting": sorting or ("relevance" if query else "toplist"),
        "topRange": "1y",
        "page": str(page),
    }
    if colour in COLOURS:
        params["colors"] = COLOURS[colour][0]
    if seed:
        params["seed"] = seed
    data = json.loads(get("https://wallhaven.cc/api/v1/search?" + urllib.parse.urlencode(params)))
    return [
        {
            "provider": "wallhaven",
            "id": w["id"],
            "thumbUrl": w["thumbs"]["small"],
            "url": w["path"],
            "source": w["url"],
            "author": "",
            "size": w["resolution"],
        }
        for w in data.get("data", [])
        if w.get("purity") == "sfw" and w.get("category") == "general"
    ]


def unsplash(s, query, colour, page):
    if not s["unsplashKey"]:
        raise RuntimeError("Unsplash needs an access key (unsplashKey)")
    auth = {"Authorization": f"Client-ID {s['unsplashKey']}", "Accept-Version": "v1"}
    params = {"orientation": "landscape", "content_filter": "high", "per_page": "24"}
    if query or colour:
        params.update(query=query or colour, page=str(page))
        if colour in COLOURS:
            params["color"] = COLOURS[colour][1]
        photos = json.loads(get("https://api.unsplash.com/search/photos?" + urllib.parse.urlencode(params), auth))["results"]
    else:
        params["count"] = params.pop("per_page")
        photos = json.loads(get("https://api.unsplash.com/photos/random?" + urllib.parse.urlencode(params), auth))
    return [
        {
            "provider": "unsplash",
            "id": p["id"],
            "thumbUrl": p["urls"]["small"],
            "url": p["urls"]["full"],
            "source": p["links"]["html"],
            "author": p["user"]["name"],
            "size": f"{p['width']}x{p['height']}",
            "ping": p["links"]["download_location"],
        }
        for p in photos
    ]


def find(s, query="", colour="", page=1, **kw):
    """Search results with thumbnails downloaded, checked and scored"""
    if s["provider"] == "unsplash":
        results = unsplash(s, query, colour, page)
    else:
        results = wallhaven(s, query, colour, page, **kw)

    thumbs = CACHE / "thumbs"
    thumbs.mkdir(parents=True, exist_ok=True)

    def load(r):
        path = thumbs / f"{r['provider']}-{r['id']}.jpg"
        try:
            if not path.exists():
                data = get(r["thumbUrl"])
                Image.open(io.BytesIO(data)).verify()
                path.write_bytes(data)
            return r, path, Image.open(path)
        except Exception:
            return r, path, None

    with ThreadPoolExecutor(8) as pool:
        loaded = [x for x in pool.map(load, results) if x[2] is not None]

    classifier = Classifier(s["nsfwThreshold"])
    safe = classifier.safe([img for _, _, img in loaded])
    mode, palette = scheme()
    out, hidden = [], 0
    for (r, path, img), ok in zip(loaded, safe):
        if not ok:
            hidden += 1
            path.unlink(missing_ok=True)  # never show it, not even from the cache
            continue
        info = analyse(img)
        r.update(path=str(path), lum=info["lum"], detail=info["detail"], bucket=info["bucket"], fit=fit(info, mode, palette))
        write_json(CACHE / "results" / f"{r['provider']}-{r['id']}.json", r)
        out.append(r)
    return out, hidden, classifier.status


def download(s, provider, rid, walldir):
    """Downloads a search result, checks the full image and returns where it was saved"""
    r = read_json(CACHE / "results" / f"{provider}-{rid}.json", None)
    if not r:
        raise RuntimeError("Unknown result, search again")
    host = urllib.parse.urlparse(r["url"]).hostname or ""
    if host not in ("w.wallhaven.cc", "images.unsplash.com"):
        raise RuntimeError(f"Refusing to download from {host}")

    data = get(r["url"], timeout=60)
    img = Image.open(io.BytesIO(data))
    img.load()
    if not Classifier(s["nsfwThreshold"]).safe([img])[0]:
        raise RuntimeError("The image did not pass the content check")
    if provider == "unsplash" and r.get("ping"):
        try:  # Unsplash asks apps to report downloads
            get(r["ping"], {"Authorization": f"Client-ID {s['unsplashKey']}"})
        except Exception:
            pass

    ext = {"JPEG": ".jpg", "PNG": ".png", "WEBP": ".webp"}.get(img.format, ".jpg")
    dest = Path(walldir) / "Discover" / f"{provider}-{rid}{ext}"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return dest


# --- Local wallpapers -------------------------------------------------------------------------------


def local(walldir):
    """Analysis of every local image wallpaper, cached by path and modification time"""
    cache_file = CACHE / "colours.json"
    cache = read_json(cache_file, {})
    out, changed = {}, False
    for path in sorted(Path(walldir).rglob("*")):
        if path.suffix.lower() not in IMAGE_TYPES or not path.is_file():
            continue
        key, mtime = str(path), path.stat().st_mtime
        entry = cache.get(key)
        if not entry or entry.get("mtime") != mtime:
            try:
                with Image.open(path) as img:
                    img.draft("RGB", (256, 256))
                    entry = analyse(img) | {"mtime": mtime}
            except Exception:
                continue
            changed = True
        out[key] = entry
    if changed or len(out) != len(cache):
        write_json(cache_file, out)
    return out


def slot_now(s, now):
    hours = s["slotHours"]
    names = ["morning", "day", "evening", "night"]
    current = "night"
    for name, start in zip(names, hours):
        if now.hour >= start:
            current = name
    return current


def pick_slot(s, walldir, now):
    """A wallpaper for the time of day: the darkest quarter at night, the brightest during the day"""
    walls = local(walldir)
    if not walls:
        raise RuntimeError("No wallpapers to rotate through")
    ordered = sorted(walls, key=lambda p: walls[p]["lum"])
    slot = slot_now(s, now)
    band = {"night": 0, "evening": 1, "morning": 2, "day": 3}[slot]
    n = len(ordered)
    group = ordered[band * n // 4 : max((band + 1) * n // 4, band * n // 4 + 1)] or ordered
    path = random.Random(f"{now.date()}-{slot}").choice(group)

    # Remember the slot, so the wallpaper only changes when a new one starts
    state_file = STATE / "wallpaper-discover.json"
    state = read_json(state_file, {})
    key = f"{now.date()}-{slot}"
    if state.get("slot") != key:
        write_json(state_file, state | {"slot": key})
    return slot, path, state.get("slot") != key


def daily(s, walldir, force):
    """Today's wallpaper from the provider: safe, dark (or light) enough and close to the scheme"""
    state_file = STATE / "wallpaper-discover.json"
    state = read_json(state_file, {})
    today = str(datetime.date.today())
    if not force and state.get("date") == today and Path(state.get("path", "")).exists():
        return Path(state["path"]), False

    seed = hashlib.sha1(today.encode()).hexdigest()[:6]
    query = s["dailyQuery"] or THEMES[datetime.date.today().toordinal() % len(THEMES)]
    kw = {} if s["provider"] == "unsplash" else {"sorting": "random", "seed": seed, "exclude": DAILY_EXCLUDE}
    results, _, _ = find(s, query, "", 1, **kw)
    mode = scheme()[0]
    fitting = [r for r in results if r["detail"] > 0.6 and (r["lum"] < 0.45 if mode == "dark" else r["lum"] > 0.45)]
    for r in sorted(fitting or results, key=lambda r: r["fit"], reverse=True)[:5]:
        try:
            path = download(s, r["provider"], r["id"], walldir)
        except Exception:
            continue
        write_json(state_file, state | {"date": today, "path": str(path)})
        return path, True
    raise RuntimeError("Found no suitable wallpaper today")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dir", default=str(HOME / "Pictures/Wallpapers"), help="the wallpaper folder")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("search")
    p.add_argument("--query", default="")
    p.add_argument("--colour", default="")
    p.add_argument("--page", type=int, default=1)
    p = sub.add_parser("fetch")
    p.add_argument("provider")
    p.add_argument("id")
    sub.add_parser("colours")
    p = sub.add_parser("daily")
    p.add_argument("--force", action="store_true")
    sub.add_parser("slot")
    args = parser.parse_args()

    s = settings()
    try:
        if args.cmd == "search":
            results, hidden, status = find(s, args.query.strip(), args.colour, args.page)
            out = {"results": results, "hidden": hidden, "classifier": status, "provider": s["provider"]}
        elif args.cmd == "fetch":
            out = {"path": str(download(s, args.provider, args.id, args.dir))}
        elif args.cmd == "colours":
            mode, palette = scheme()
            out = {
                "wallpapers": {
                    p: {"lum": e["lum"], "bucket": e["bucket"], "fit": fit(e, mode, palette)} for p, e in local(args.dir).items()
                }
            }
        elif args.cmd == "daily":
            path, new = daily(s, args.dir, args.force)
            out = {"path": str(path), "new": new}
        else:
            slot, path, changed = pick_slot(s, args.dir, datetime.datetime.now())
            out = {"slot": slot, "path": path, "changed": changed}
        print(json.dumps({"ok": True} | out))
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
