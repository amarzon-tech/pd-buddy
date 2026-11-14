#!/usr/bin/env python3
"""PD Buddy app icon: #1E63D6 field, open loop, PD. No alpha. Derived from the CRRT Rx icon script."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageChops
import math

BLUE = (30, 99, 214)          # #1E63D6
BLUE_DEEP = (19, 72, 168)     # #1348A8
BLUE_NAVY = (14, 50, 122)     # #0E327A
BLUE_MID = (61, 122, 232)     # #3D7AE8
WHITE = (255, 255, 255)

SERIF = "/usr/share/fonts/truetype/sand-box/custom/Source Serif Pro/SourceSerifPro-Bold.ttf"
SERIF_IT = "/usr/share/fonts/truetype/sand-box/custom/Source Serif Pro/SourceSerifPro-It.ttf"
# Prefer semibold italic if we can simulate; use Bold for the R weight
SERIF_BLACK = "/usr/share/fonts/truetype/sand-box/custom/Source Serif Pro/SourceSerifPro-Black.ttf"

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def make_base(size):
    im = Image.new("RGB", (size, size), BLUE)
    px = im.load()
    for y in range(size):
        for x in range(size):
            # soft diagonal gradient
            t = (x * 0.45 + y * 0.55) / (size - 1)
            # slight radial brightening toward center
            cx = (x + 0.5) / size - 0.5
            cy = (y + 0.5) / size - 0.46
            r = math.sqrt(cx * cx + cy * cy)
            radial = max(0.0, 1.0 - r / 0.85)
            c1 = lerp(BLUE_MID, BLUE, t * 0.7)
            c2 = lerp(c1, BLUE_DEEP, t * 0.55)
            # lift the center a little
            c = lerp(c2, lerp(BLUE_MID, WHITE, 0.12), radial * 0.22)
            px[x, y] = c
    return im

def draw_circuit(draw, size, width, color, offset=0):
    """Open loop suggesting a CRRT circuit, not a closed letter."""
    cx = size / 2 + offset
    cy = size / 2 + size * 0.02
    rx = size * 0.34
    ry = size * 0.34
    # two arcs leaving a gap at 1 o'clock and 7 o'clock, like inflow/outflow
    bbox = [cx - rx, cy - ry, cx + rx, cy + ry]
    # Pillow arc angles: 0 is 3 o'clock, CCW? actually 0 is 3 o'clock going clockwise? 
    # In PIL, 0 is 3 o'clock, increasing is clockwise... wait, it's counterclockwise from 3 o'clock in older docs
    # We'll draw a nearly-full ellipse stroke via many short lines for consistent caps.
    pts_top = []
    pts_bot = []
    # top path: 200 deg to 20 deg traveling the long way? Let's do:
    # upper: from 140° to 40° (passing 270/north? )
    # Standard math: 0 at east, CCW. PIL: 0 at east, and angles increase clockwise.
    def pt(deg):
        rad = math.radians(deg)
        # PIL clockwise from east
        return (cx + rx * math.cos(rad), cy + ry * math.sin(rad))

    # upper circuit 200° (SW) through 270° (north is 270 in PIL? 
    # PIL: 0=east, 90=south, 180=west, 270=north if clockwise.
    # Yes.
    # Upper arc: 200 (WNW-ish) to 340 (NE) going through 270 (north)
    # Lower arc: 20 (ESE) to 160 (WSW) going through 90 (south)
    def polyline(start, end, steps=80):
        pts = []
        for i in range(steps + 1):
            a = start + (end - start) * (i / steps)
            pts.append(pt(a))
        return pts

    for pts in (polyline(200, 340), polyline(20, 160)):
        draw.line(pts, fill=color, width=width, joint="curve")
        # round caps
        r = width / 2
        for p in (pts[0], pts[-1]):
            draw.ellipse([p[0]-r, p[1]-r, p[0]+r, p[1]+r], fill=color)

def render_rx(size):
    """Draw a classic prescription Rx in white, slightly italic."""
    # Render at high res then we'll composite
    # Use italic "R" and a custom x/cross on the leg
    font_r = ImageFont.truetype(SERIF_BLACK if Path(SERIF_BLACK).exists() else SERIF, int(size * 0.52))
    # We'll compose on a transparent layer then flatten
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    text = "PD"
    # Measure
    bbox = d.textbbox((0, 0), text, font=font_r)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    # Center, with a slight visual lift
    x = (size - tw) / 2 - bbox[0] - size * 0.01
    y = (size - th) / 2 - bbox[1] - size * 0.045

    # Soft shadow
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.text((x, y + size * 0.012), text, font=font_r, fill=(10, 30, 80, 80))
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=size * 0.012))
    layer = Image.alpha_composite(layer, shadow)
    d = ImageDraw.Draw(layer)
    d.text((x, y), text, font=font_r, fill=WHITE + (255,))
    return layer

def make_icon(size):
    base = make_base(size).convert("RGBA")
    # circuit on a separate layer for slight blur/softness
    circ = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    cd = ImageDraw.Draw(circ)
    w = max(2, int(size * 0.038))
    # faint wider halo
    draw_circuit(cd, size, int(w * 1.7), (255, 255, 255, 40))
    circ = circ.filter(ImageFilter.GaussianBlur(radius=max(1, size * 0.006)))
    cd = ImageDraw.Draw(circ)
    draw_circuit(cd, size, w, (232, 240, 255, 200))
    base = Image.alpha_composite(base, circ)
    rx = render_rx(size)
    base = Image.alpha_composite(base, rx)
    out = base.convert("RGB")  # flatten, no alpha
    return out

def rounded_preview(im, radius_frac=0.2237):
    """iOS-like squircle approximation for human preview only."""
    size = im.size[0]
    r = int(size * radius_frac)
    mask = Image.new("L", (size, size), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([0, 0, size-1, size-1], radius=r, fill=255)
    # composite onto mid-gray so edges are visible
    bg = Image.new("RGB", (size, size), (245, 247, 250))
    bg.paste(im, (0, 0), mask)
    return bg


def main():
    icon = make_icon(1024)
    out = Path(__file__).resolve().parent.parent / "icons"
    out.mkdir(exist_ok=True)
    for s, name in [(512, "icon-512.png"), (192, "icon-192.png"), (180, "apple-touch-icon.png"), (32, "favicon.png")]:
        icon.resize((s, s), Image.Resampling.LANCZOS).save(out / name, "PNG", optimize=True)
    svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="PD Buddy">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0.7" y2="1"><stop offset="0" stop-color="#3D7AE8"/><stop offset="0.55" stop-color="#1E63D6"/><stop offset="1" stop-color="#1348A8"/></linearGradient></defs>
  <rect width="512" height="512" fill="url(#g)"/>
  <path d="M118 330c18 70 92 118 178 118 70 0 128-32 158-82" fill="none" stroke="#E8F0FF" stroke-width="20" stroke-linecap="round" opacity="0.85"/>
  <path d="M394 182C376 112 302 64 216 64c-70 0-128 32-158 82" fill="none" stroke="#E8F0FF" stroke-width="20" stroke-linecap="round" opacity="0.85"/>
  <text x="256" y="320" text-anchor="middle" font-family="Source Serif Pro, Times New Roman, serif" font-weight="900" font-size="210" fill="#fff">PD</text>
</svg>
"""
    (out / "icon.svg").write_text(svg)
    print("wrote icons")

if __name__ == "__main__":
    main()
