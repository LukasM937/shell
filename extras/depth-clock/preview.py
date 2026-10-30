#!/usr/bin/env python3
"""Render a still mock-up of the depth clock from layout.json (for checking layouts without the shell)."""

import json
import sys
from datetime import datetime
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate import OUT, load_font, screen_size, visible_crop  # noqa: E402


def rgb(h: str, a: int = 255) -> tuple[int, int, int, int]:
    return (*(int(h[i : i + 2], 16) for i in (0, 2, 4)), a)


def main() -> None:
    lay = json.loads((OUT / "layout.json").read_text())
    sw, sh = screen_size()
    now = datetime.now().replace(hour=21, minute=47, second=38)

    img = Image.open(lay["wallpaper"])
    img.seek(0)
    img = img.convert("RGBA")
    img.thumbnail((3840, 3840))

    def to_screen(im: Image.Image) -> Image.Image:
        x, y, w, h = visible_crop(*im.size, sw, sh)
        return im.crop((round(x), round(y), round(x + w), round(y + h))).resize((sw, sh), Image.LANCZOS)

    canvas = to_screen(img)
    behind = Image.new("RGBA", (sw, sh))
    front = Image.new("RGBA", (sw, sh))

    t = lay["time"]
    tf = load_font(t["font"], t["size"] * sh, {"wght": t["weight"], **t["axes"]})
    outline = t.get("style") == "outline"
    ImageDraw.Draw(behind).text(
        (t["cx"] * sw, t["baseline"] * sh), now.strftime("%H:%M"), font=tf, anchor="ms",
        fill=(0, 0, 0, 0) if outline else rgb(t["colour"]),
        stroke_width=round(t.get("stroke", 0) * sh / 2) if outline else 0, stroke_fill=rgb(t["colour"]),
    )

    d = lay["day"]
    df = load_font(d["font"], d["size"] * sh)
    text = now.strftime("%A").upper()
    sp = d["spacing"] * d["size"] * sh
    width = sum(df.getlength(c) for c in text) + sp * (len(text) - 1)
    x = d["cx"] * sw - width / 2
    for c in text:
        ImageDraw.Draw(behind).text((x, d["baseline"] * sh), c, font=df, anchor="ls", fill=rgb(d["colour"]))
        x += df.getlength(c) + sp

    canvas.alpha_composite(behind)
    if lay["foreground"]:
        canvas.alpha_composite(to_screen(Image.open(lay["foreground"]).convert("RGBA")))

    dt = lay["date"]
    year = now.year + (10000 if dt["humanEra"] else 0)
    datef = load_font(dt["font"], dt["size"] * sh, {"wght": dt["weight"]})
    date_text = f"- {now:%B} {now.day}, {year} -".upper()
    ImageDraw.Draw(front).text((dt["cx"] * sw, dt["baseline"] * sh), date_text, font=datef, anchor="ms", fill=rgb(dt["colour"]))

    b = lay["binary"]
    if b["enabled"]:
        digits = f"{now:%H%M%S}" if b["seconds"] else f"{now:%H%M}"
        dot, gap = b["dot"] * sh, b["dot"] * sh * 0.55
        cols = len(digits)
        total = cols * dot + (cols - 1) * gap + (cols // 2 - 1) * gap * 2
        x = b["cx"] * sw - total / 2
        draw = ImageDraw.Draw(front)
        for i, ch in enumerate(digits):
            v = int(ch)
            for bit in range(4):
                y = b["top"] * sh + (3 - bit) * (dot + gap)
                on = v >> bit & 1
                draw.ellipse((x, y, x + dot, y + dot), fill=rgb(b["colour"], 255 if on else 45))
            x += dot + gap + (gap * 2 if i % 2 == 1 else 0)

    canvas.alpha_composite(front)
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else OUT / "preview.png"
    canvas.convert("RGB").save(out)
    print(out)


if __name__ == "__main__":
    main()
