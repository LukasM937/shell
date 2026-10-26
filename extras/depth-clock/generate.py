#!/usr/bin/env python3
"""Depth-effect desktop clock: layout generator.

For the current wallpaper this
  1. estimates depth (Depth Anything V2 Small, ONNX, CPU) and cuts out the nearest layer,
  2. places a big clock where the foreground hides ~`occlusion` of its digits while their
     top half and the day name above stay clear (searched in screen space, after the
     wallpaper's crop-to-fill),
  3. picks scheme colours with enough contrast against what is behind each element.

Output (read by modules/background/DepthClock.qml):
  ~/.local/state/caelestia/depth-clock/layout.json   positions as screen fractions
  ~/.local/state/caelestia/depth-clock/fg-<key>.png  foreground cutout, same aspect as the wallpaper
Settings: ~/.config/caelestia/depth-clock.json
"""

import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
HOME = Path.home()
STATE = Path(os.environ.get("XDG_STATE_HOME", HOME / ".local/state")) / "caelestia"
CONFIG = Path(os.environ.get("XDG_CONFIG_HOME", HOME / ".config")) / "caelestia"
OUT = STATE / "depth-clock"
MODEL = HERE / "models/depth-anything-v2-small.onnx"

MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

DEFAULTS = {
    "enabled": True,
    "time": {
        "fonts": ["Anurati Pro", "Michroma", "Google Sans Flex"], "style": "outline", "stroke": 0.0045,
        "weight": 800, "roundness": 100, "width": 100, "size": 0.30, "maxWidth": 0.75,
    },
    "day": {"fonts": ["Anurati", "Michroma"], "size": 0.055, "spacing": 0.45},
    "date": {"font": "Quicksand", "weight": 500, "size": 0.026, "humanEra": True},
    "binary": {"enabled": True, "seconds": True, "dot": 0.016},
    "occlusion": 0.3,
    "minContrast": 4.5,
    # "single": every element in the time's colour; "auto": each element picks its own
    "palette": "single",
    # Clock colour: "auto" (first scheme colour with enough contrast), a scheme key like "primary", or a hex "#ff9e64"
    "colour": "auto",
    # Soft blurred plate behind date and binary clock when the scenery there is too busy
    "backdrop": {"enabled": True, "opacity": 0.5},
    "parallax": {"enabled": True, "strength": 0.015},
}

# Colour preference per element (scheme keys); later ones are fallbacks for contrast
PREFERENCE = {
    "time": ["primary", "tertiary", "secondary", "onSurface", "sky", "lavender", "base", "crust"],
    "day": ["onSurface", "secondary", "primary", "tertiary", "base", "crust"],
    "date": ["onSurface", "secondary", "primary", "base", "crust"],
    "binary": ["secondary", "primary", "tertiary", "onSurface", "base", "crust"],
}


# ---------- helpers ----------


def merged(defaults: dict, user: dict) -> dict:
    out = dict(defaults)
    for k, v in user.items():
        out[k] = merged(defaults[k], v) if isinstance(v, dict) and isinstance(defaults.get(k), dict) else v
    return out


def font_file(family: str) -> tuple[str, bool]:
    """Font file for a family, and whether fontconfig actually has that family."""
    res = subprocess.run(["fc-match", "-f", "%{file}|%{family}", family], capture_output=True, text=True).stdout
    path, _, fams = res.partition("|")
    return path, family.lower() in (f.strip().lower() for f in fams.split(","))


def has_glyphs(family: str, text: str) -> bool:
    """Whether the installed family itself covers every character (no fallback font)."""
    path, exact = font_file(family)
    if not exact:
        return False
    charset = subprocess.run(["fc-query", "-f", "%{charset}", path], capture_output=True, text=True).stdout.split()
    ranges = []
    for part in charset:
        a, _, b = part.partition("-")
        ranges.append((int(a, 16), int(b or a, 16)))
    return all(any(a <= ord(c) <= b for a, b in ranges) for c in set(text) if c != " ")


def load_font(family: str, px: float, axes: dict[str, float] | None = None) -> ImageFont.FreeTypeFont:
    font = ImageFont.truetype(font_file(family)[0], max(1, round(px)))
    if axes:
        try:
            names = [a["name"].decode() if isinstance(a["name"], bytes) else a["name"] for a in font.get_variation_axes()]
            tags = {"Optical Size": "opsz", "Width": "wdth", "Weight": "wght", "Grade": "GRAD", "Roundness": "ROND", "Slant": "slnt"}
            current = [a["default"] for a in font.get_variation_axes()]
            for i, n in enumerate(names):
                if tags.get(n) in axes:
                    current[i] = axes[tags[n]]
            font.set_variation_by_axes(current)
        except OSError:
            pass  # not a variable font
    return font


def screen_size() -> tuple[int, int]:
    try:
        mons = json.loads(subprocess.run(["hyprctl", "monitors", "-j"], capture_output=True, text=True).stdout)
        m = next((m for m in mons if m.get("focused")), mons[0])
        w, h = m["width"] / m["scale"], m["height"] / m["scale"]
        return (int(h), int(w)) if m["transform"] % 2 else (int(w), int(h))
    except Exception:
        return 1920, 1080


def luminance(rgb: np.ndarray) -> np.ndarray:
    c = rgb / 255.0
    c = np.where(c <= 0.03928, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return c @ np.array([0.2126, 0.7152, 0.0722])


def hex_lum(h: str) -> float:
    return float(luminance(np.array([int(h[i : i + 2], 16) for i in (0, 2, 4)], dtype=float)))


def contrast(a: float, b: float) -> float:
    return (max(a, b) + 0.05) / (min(a, b) + 0.05)


# ---------- depth / foreground ----------


def depth_map(img: Image.Image, long_side: int = 1036) -> np.ndarray:
    """Relative inverse depth (bigger = nearer), 0..1, at the image's size."""
    session = ort.InferenceSession(str(MODEL), providers=["CPUExecutionProvider"])
    w, h = img.size
    s = long_side / max(w, h)
    tw, th = max(14, round(w * s / 14) * 14), max(14, round(h * s / 14) * 14)
    x = np.asarray(img.resize((tw, th), Image.BICUBIC), dtype=np.float32) / 255
    x = ((x - MEAN) / STD).transpose(2, 0, 1)[None]
    d = session.run(None, {session.get_inputs()[0].name: x})[0][0]
    d = (d - d.min()) / (d.max() - d.min() + 1e-6)
    return np.asarray(Image.fromarray(d.astype(np.float32)).resize((w, h), Image.BICUBIC))


def otsu(values: np.ndarray) -> float:
    hist, edges = np.histogram(values, bins=256, range=(0, 1))
    p = hist / max(hist.sum(), 1)
    omega, mu = np.cumsum(p), np.cumsum(p * np.arange(256))
    sigma = (mu[-1] * omega - mu) ** 2 / (omega * (1 - omega) + 1e-9)
    return float(edges[int(np.argmax(sigma))])


# ---------- layout ----------


def visible_crop(iw: int, ih: int, sw: int, sh: int) -> tuple[float, float, float, float]:
    """Part of the image shown by crop-to-fill (PreserveAspectCrop), centred."""
    s = max(sw / iw, sh / ih)
    cw, ch = sw / s, sh / s
    return (iw - cw) / 2, (ih - ch) / 2, cw, ch


def rect_mean(a: np.ndarray, x0: float, y0: float, x1: float, y1: float) -> float:
    """Mean of a over a rect given in fractions (clipped); 1.0 if the rect leaves the screen."""
    h, w = a.shape[:2]
    if x0 < 0 or y0 < 0 or x1 > 1 or y1 > 1:
        return 1.0
    sub = a[int(y0 * h) : max(int(y0 * h) + 1, int(y1 * h)), int(x0 * w) : max(int(x0 * w) + 1, int(x1 * w))]
    return float(sub.mean())


def worst_contrast(colour: str, pixels: np.ndarray) -> float:
    """Contrast against the brighter or darker tenth of the pixels, whichever is closer to the colour."""
    if pixels.size == 0:
        return 21.0
    lums = np.sort(luminance(pixels.reshape(-1, 3).astype(float)))
    n, l = len(lums), hex_lum(colour)
    return min(contrast(l, lums.mean()), contrast(l, lums[n - 1 - n // 10] if l > lums.mean() else lums[n // 10]))


def pick_colour(keys: list[str], colours: dict, pixels: np.ndarray, minimum: float, avoid: set[str]) -> str:
    """First preferred colour with enough worst-case contrast, else the best one."""
    if pixels.size == 0:
        return colours.get(keys[0], "ffffff")
    lums = np.sort(luminance(pixels.reshape(-1, 3).astype(float)))
    n = len(lums)
    mean, dark, bright = lums.mean(), lums[n // 10], lums[n - 1 - n // 10]
    scored = []
    for k in keys:
        if k not in colours:
            continue
        l = hex_lum(colours[k])
        worst = min(contrast(l, mean), contrast(l, bright if l > mean else dark))
        scored.append((worst, k))
    # Prefer text that is lighter than a dark background (or darker than a light one):
    # dark text on a dark scene only because of a few bright spots looks wrong
    dark_bg = mean < 0.35  # only clearly bright areas get dark text; the drop shadow helps mid-tones
    def polarity_ok(k: str) -> bool:
        return (hex_lum(colours[k]) > mean) == dark_bg
    for worst, k in scored:
        if worst >= minimum and polarity_ok(k) and colours[k] not in avoid:
            return colours[k]
    for worst, k in scored:  # relaxed: right polarity, WCAG large-text contrast (3:1) against the average
        if polarity_ok(k) and contrast(hex_lum(colours[k]), mean) >= 3 and colours[k] not in avoid:
            return colours[k]
    for worst, k in scored:
        if worst >= minimum and colours[k] not in avoid:
            return colours[k]
    return colours[max(scored)[1]]


def main() -> None:
    cfg_path = CONFIG / "depth-clock.json"
    cfg = merged(DEFAULTS, json.loads(cfg_path.read_text()) if cfg_path.exists() else {})
    OUT.mkdir(parents=True, exist_ok=True)
    layout_path = OUT / "layout.json"

    if not cfg["enabled"]:
        layout_path.write_text(json.dumps({"enabled": False}) + "\n")
        return

    wallpaper = (STATE / "wallpaper/path.txt").read_text().strip()
    colours = json.loads((STATE / "scheme.json").read_text())["colours"]
    sw, sh = screen_size()

    img = Image.open(wallpaper)
    img.seek(0)
    img = img.convert("RGB")
    img.thumbnail((3840, 3840))
    iw, ih = img.size

    # Depth is cached per wallpaper file
    wkey = hashlib.sha1(f"{wallpaper}:{os.path.getmtime(wallpaper)}:{iw}x{ih}".encode()).hexdigest()[:12]
    depth_cache = OUT / f"depth-{wkey}.npy"
    if depth_cache.exists():
        depth = np.load(depth_cache)
    else:
        depth = depth_map(img)
        for old in OUT.glob("depth-*.npy"):
            old.unlink()
        np.save(depth_cache, depth.astype(np.float16))
    depth = depth.astype(np.float32)

    # Visible part of the wallpaper, as seen on screen
    cx0, cy0, cw, ch = visible_crop(iw, ih, sw, sh)
    box = (round(cx0), round(cy0), round(cx0 + cw), round(cy0 + ch))
    gw = 240
    gh = round(gw * sh / sw)
    vis_depth = np.asarray(Image.fromarray(depth).crop(box).resize((gw, gh), Image.BILINEAR))
    vis_rgb = np.asarray(img.crop(box).resize((gw, gh), Image.BILINEAR))

    threshold = otsu(vis_depth)
    mask = (vis_depth > threshold).astype(np.float32)
    share = float(mask.mean())

    # ---- measure text with the real fonts (sizes in screen px) ----
    t = cfg["time"]
    # First listed font that really has digits (free Anurati, e.g., has letters only)
    fonts = t.get("fonts") or [t.get("font", "Google Sans Flex")]
    time_font = next((f for f in fonts if has_glyphs(f, "0123456789:")), fonts[-1])
    time_axes = {"wght": t["weight"], "ROND": t["roundness"], "wdth": t["width"], "opsz": 144}
    time_size = t["size"]
    tf = load_font(time_font, time_size * sh, time_axes)
    x0, y0, x1, y1 = tf.getbbox("88:88", anchor="ls")
    if (x1 - x0) / sw > t["maxWidth"]:  # wide fonts: shrink to fit
        time_size *= t["maxWidth"] / ((x1 - x0) / sw)
        tf = load_font(time_font, time_size * sh, time_axes)
        x0, y0, x1, y1 = tf.getbbox("88:88", anchor="ls")
    time_px = time_size * sh
    time_w, time_up = (x1 - x0) / sw, -y0 / sh  # ink width, height above the baseline
    # Horizontal extent of each digit, as fractions of the ink width (the colon is skipped)
    adv = [tf.getlength(c) for c in "88:88"]
    starts = np.cumsum([0, *adv[:-1]]) / sum(adv)
    digit_slots = [(starts[i], starts[i] + adv[i] / sum(adv)) for i in (0, 1, 3, 4)]

    d = cfg["day"]
    day_font = next((f for f in d["fonts"] if has_glyphs(f, "ADEFHIMNORSTUWY")), d["fonts"][-1])
    day_px = d["size"] * sh
    df = load_font(day_font, day_px)
    day_text = "WEDNESDAY"
    day_w = (sum(df.getlength(c) for c in day_text) + d["spacing"] * day_px * (len(day_text) - 1)) / sw
    day_up = -df.getbbox("W", anchor="ls")[1] / sh
    day_gap = 0.35 * day_px / sh

    dt = cfg["date"]
    date_px = dt["size"] * sh
    date_gap = 1.9 * date_px / sh  # time baseline -> date baseline
    b = cfg["binary"]
    dot = b["dot"]
    bin_gap = 0.9 * date_px / sh

    # ---- placement search ----
    target = cfg["occlusion"]
    use_fg = 0.04 < share < 0.85
    best = None
    for cx in np.linspace(0.22, 0.78, 15):
        for base in np.linspace(0.18, 0.82, 33):
            tx0, tx1 = cx - time_w / 2, cx + time_w / 2
            ty0 = base - time_up
            day_base = ty0 - day_gap
            dy0 = day_base - day_up
            bottom = base + date_gap + bin_gap + 4.6 * dot
            if dy0 < 0.05 or bottom > 0.95 or tx0 < 0.05 or tx1 > 0.95:
                continue
            occ = rect_mean(mask, tx0, ty0, tx1, base)
            top = rect_mean(mask, tx0, ty0, tx1, ty0 + 0.5 * (base - ty0))
            dayocc = rect_mean(mask, cx - day_w / 2, dy0, cx + day_w / 2, day_base)
            score = -0.4 * abs(cx - 0.5) - 0.2 * abs(base - 0.45)
            if use_fg:
                # Prefer an uneven silhouette edge across the digits (peaks, slopes) over a flat cut
                h, w = mask.shape
                cols = mask[int(ty0 * h) : int(base * h), int(tx0 * w) : int(tx1 * w)].mean(axis=0)
                score += -2 * abs(occ - target) - 4 * top - 3 * dayocc + 2.5 * float(cols.std())
                # Every digit must stay readable: no digit more than about half hidden
                worst_digit = max(rect_mean(mask, tx0 + a * time_w, ty0, tx0 + b * time_w, base) for a, b in digit_slots)
                score -= 8 * max(0.0, worst_digit - 0.45)
            if best is None or score > best[0]:
                best = (score, cx, base, occ)

    if best is None:  # nothing fits (huge sizes): centre it
        best = (0, 0.5, 0.45, 0.0)
    _, cx, base, occ = best
    if use_fg and occ < 0.08:
        use_fg = False  # no spot where the scenery overlaps the clock nicely
    if not use_fg:
        cx, base = 0.5, max(0.3, min(0.55, 0.42))

    # ---- colours ----
    def region(x0: float, y0: float, x1: float, y1: float, background_only: bool) -> np.ndarray:
        ys, xs = slice(int(max(y0, 0) * gh), int(min(y1, 1) * gh) + 1), slice(int(max(x0, 0) * gw), int(min(x1, 1) * gw) + 1)
        px = vis_rgb[ys, xs]
        if background_only and use_fg:
            px = px[mask[ys, xs] < 0.5]
        return px.reshape(-1, 3)

    minc = cfg["minContrast"]
    ty0 = base - time_up
    day_base = ty0 - day_gap
    date_base = base + date_gap
    bin_top = date_base + bin_gap
    c_time = pick_colour(PREFERENCE["time"], colours, region(cx - time_w / 2, ty0, cx + time_w / 2, base, True), minc, set())
    front_px = region(cx - 0.15, date_base - 1.2 * date_px / sh, cx + 0.15, bin_top + 4.6 * dot, False)
    want = cfg["colour"]
    if want != "auto":
        c_time = want.lstrip("#").lower() if want.startswith("#") else colours.get(want, c_time)
    if cfg["palette"] == "single":
        c_day = c_date = c_bin = c_time
    else:
        c_day = pick_colour(PREFERENCE["day"], colours, region(cx - day_w / 2, day_base - day_up, cx + day_w / 2, day_base, True), minc, {c_time})
        c_date = pick_colour(PREFERENCE["date"], colours, region(cx - 0.15, date_base - 1.2 * date_px / sh, cx + 0.15, date_base, False), minc, set())
        c_bin = pick_colour(PREFERENCE["binary"], colours, region(cx - 0.1, bin_top, cx + 0.1, bin_top + 4.6 * dot, False), minc, set())

    # Date and binary sit in front of the scenery; if it is busy there, put a soft plate behind them
    bd = cfg["backdrop"]
    front_contrast = min(worst_contrast(c_date, front_px), worst_contrast(c_bin, front_px))
    backdrop_colour = colours.get("surface", "000000") if hex_lum(c_date) > 0.18 else colours.get("onSurface", "ffffff")
    backdrop = bd["opacity"] if bd["enabled"] and front_contrast < minc else 0

    # ---- foreground cutout at wallpaper resolution ----
    fg_name = ""
    for old in [*OUT.glob("fg-*.png"), *OUT.glob("depth-screen-*.png")]:
        old.unlink()
    if use_fg:
        full = (depth > threshold).astype(np.uint8) * 255
        m = Image.fromarray(full).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
        cut = img.copy()
        cut.putalpha(m)
        fg_key = hashlib.sha1(f"{wkey}:{threshold:.3f}".encode()).hexdigest()[:12]
        fg_name = f"fg-{fg_key}.png"
        cut.save(OUT / fg_name, optimize=False, compress_level=3)

    # ---- screen-space depth for the parallax shader ----
    # Near edges grown a little (max filter) so objects carry their own depth past their outline
    pw = 960
    ph = round(pw * sh / sw)
    screen_depth = Image.fromarray((np.clip(depth, 0, 1) * 255).astype(np.uint8)).crop(box).resize((pw, ph), Image.BILINEAR)
    screen_depth = screen_depth.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(1.5))
    depth_name = f"depth-screen-{hashlib.sha1(f'{wkey}:{sw}x{sh}'.encode()).hexdigest()[:12]}.png"
    screen_depth.save(OUT / depth_name)

    # The clock's plane stays still: typical depth of the scenery right behind the digits
    h, w = vis_depth.shape
    behind = vis_depth[int((base - time_up) * h) : int(base * h), int((cx - time_w / 2) * w) : int((cx + time_w / 2) * w)]
    behind = behind[behind <= threshold] if use_fg else behind
    focus = float(np.median(behind)) if behind.size else 0.0

    layout = {
        "enabled": True,
        "wallpaper": wallpaper,
        "foreground": str(OUT / fg_name) if fg_name else "",
        "time": {
            "font": time_font, "cx": cx, "baseline": base, "size": time_size,
            "style": t["style"], "stroke": t["stroke"],
            "weight": t["weight"], "axes": {"ROND": t["roundness"], "wdth": t["width"], "opsz": 144},
            "colour": c_time,
        },
        "day": {
            "font": day_font, "cx": cx, "baseline": day_base, "size": d["size"],
            "spacing": d["spacing"], "colour": c_day,
        },
        "date": {
            "font": dt["font"], "cx": cx, "baseline": date_base, "size": dt["size"],
            "weight": dt["weight"], "humanEra": dt["humanEra"], "colour": c_date,
        },
        "binary": {
            "enabled": b["enabled"], "seconds": b["seconds"], "cx": cx, "top": bin_top,
            "dot": dot, "colour": c_bin,
        },
        "backdrop": {"colour": backdrop_colour, "opacity": backdrop},
        "parallax": {
            "enabled": cfg["parallax"]["enabled"], "strength": cfg["parallax"]["strength"],
            "depthMap": str(OUT / depth_name), "focus": round(focus, 4),
        },
        "_info": {
            "screen": [sw, sh], "foregroundShare": round(share, 3), "occlusion": round(occ, 3),
            "depthThreshold": round(threshold, 3), "frontContrast": round(front_contrast, 2),
        },
    }
    tmp = layout_path.with_suffix(".tmp")
    tmp.write_text(json.dumps(layout, indent=4) + "\n")
    tmp.replace(layout_path)
    print(json.dumps(layout["_info"]), f"time #{c_time} day #{c_day} date #{c_date} binary #{c_bin}", file=sys.stderr)


if __name__ == "__main__":
    main()
