"""生成 Noteon 的图标资源（应用图标 / 托盘 / 拖拽图标）。"""
from __future__ import annotations

import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")
os.makedirs(ASSETS, exist_ok=True)

S = 4  # 超采样倍数


def lin_gradient(size, c1, c2, diagonal=False):
    w, h = size
    base = Image.new("RGB", (w, h), c1)
    d = ImageDraw.Draw(base)
    if diagonal:
        for i in range(w + h):
            t = i / max(1, (w + h - 1))
            col = tuple(int(c1[k] + (c2[k] - c1[k]) * t) for k in range(3))
            d.line([(i, 0), (0, i)], fill=col, width=2)
    else:
        for y in range(h):
            t = y / max(1, h - 1)
            col = tuple(int(c1[k] + (c2[k] - c1[k]) * t) for k in range(3))
            d.line([(0, y), (w, y)], fill=col)
    return base


def rounded_mask(size, radius):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255)
    return m


def make_app_icon(px=512):
    size = (px * S, px * S)
    bg = lin_gradient(size, (44, 62, 104), (10, 15, 27), diagonal=True)
    glow = Image.new("RGB", size, (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([-size[0] * 0.15, -size[1] * 0.25, size[0] * 0.75, size[1] * 0.55], fill=(58, 104, 190))
    glow = glow.filter(ImageFilter.GaussianBlur(px * S * 0.12))
    bg = Image.blend(bg, glow, 0.45)

    # 便签主体（旋转）
    note_w, note_h = int(size[0] * 0.46), int(size[1] * 0.56)
    note = Image.new("RGBA", (note_w, note_h), (0, 0, 0, 0))
    nd = ImageDraw.Draw(note)
    r = int(note_w * 0.11)
    nd.rounded_rectangle([0, 0, note_w - 1, note_h - 1], radius=r, fill=(247, 250, 255, 255))
    # 折角
    fold = int(note_w * 0.24)
    nd.polygon([(note_w - fold, 0), (note_w, 0), (note_w, fold)], fill=(214, 226, 244, 255))
    # 条纹
    lx = int(note_w * 0.16)
    lw = int(note_w * 0.68)
    ly = int(note_h * 0.34)
    for i, frac in enumerate((0.62, 0.44, 0.72)):
        y = ly + i * int(note_h * 0.11)
        nd.rounded_rectangle([lx, y, lx + int(lw * frac), y + int(note_h * 0.026)], radius=int(note_h * 0.013),
                             fill=(110, 168, 254, 255) if i != 2 else (233, 178, 60, 255))
    angle = -7
    note = note.rotate(angle, expand=True, resample=Image.BICUBIC)
    sh = Image.new("RGBA", size, (0, 0, 0, 0))
    posx = (size[0] - note.width) // 2 + int(size[0] * 0.005)
    posy = (size[1] - note.height) // 2 - int(size[1] * 0.01)
    dark = Image.new("RGBA", note.size, (0, 0, 0, 0))
    dark.putalpha(note.getchannel("A").point(lambda v: int(v * 0.42)))
    dark = dark.filter(ImageFilter.GaussianBlur(px * S * 0.035))
    sh.alpha_composite(dark, (posx + int(px * S * 0.02), posy + int(px * S * 0.045)))
    sh.alpha_composite(note, (posx, posy))

    canvas = bg.convert("RGBA")
    canvas.alpha_composite(sh)

    # 小圆点装饰
    dot_r = int(size[0] * 0.038)
    dot = Image.new("RGBA", (dot_r * 2, dot_r * 2), (0, 0, 0, 0))
    ImageDraw.Draw(dot).ellipse([0, 0, dot_r * 2 - 1, dot_r * 2 - 1], fill=(167, 128, 255, 255))
    canvas.alpha_composite(dot, (int(size[0] * 0.70), int(size[1] * 0.72)))

    mask = rounded_mask(size, int(px * S * 0.235))
    canvas.putalpha(mask)
    return canvas.resize((px, px), Image.LANCZOS)


def make_tray(px=32):
    """16-32px 下可读的简化版。"""
    size = (px * 8, px * 8)
    bg = lin_gradient(size, (52, 78, 128), (13, 19, 33), diagonal=True)
    canvas = bg.convert("RGBA")
    d = ImageDraw.Draw(canvas)
    # 便签
    w, h = int(size[0] * 0.54), int(size[1] * 0.62)
    x, y = (size[0] - w) // 2, (size[1] - h) // 2
    d.rounded_rectangle([x, y, x + w, y + h], radius=int(w * 0.16), fill=(247, 250, 255, 255))
    f = int(w * 0.26)
    d.polygon([(x + w - f, y), (x + w, y), (x + w, y + f)], fill=(206, 220, 240, 255))
    lw = int(w * 0.58)
    for i in range(2):
        yy = y + int(h * (0.42 + i * 0.2))
        d.rounded_rectangle([x + int(w * 0.2), yy, x + int(w * 0.2) + int(lw * (1 - i * 0.3)), yy + max(2, int(h * 0.055))],
                            radius=3, fill=(110, 168, 254, 255))
    mask = rounded_mask(size, int(px * 8 * 0.24))
    canvas.putalpha(mask)
    return canvas.resize((px, px), Image.LANCZOS)


def make_drag(px=32):
    size = (px * 8, px * 8)
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(canvas)
    w, h = int(size[0] * 0.56), int(size[1] * 0.7)
    x, y = (size[0] - w) // 2, (size[1] - h) // 2
    d.rounded_rectangle([x, y, x + w, y + h], radius=int(w * 0.14), fill=(247, 250, 255, 255),
                        outline=(110, 168, 254, 255), width=max(2, int(px * 8 * 0.02)))
    f = int(w * 0.3)
    d.polygon([(x + w - f, y), (x + w, y), (x + w, y + f)], fill=(200, 218, 242, 255))
    for i in range(3):
        yy = y + int(h * (0.44 + i * 0.15))
        d.rounded_rectangle([x + int(w * 0.2), yy, x + int(w * 0.2) + int(w * 0.5), yy + max(2, int(h * 0.045))],
                            radius=3, fill=(110, 168, 254, 255))
    return canvas.resize((px, px), Image.LANCZOS)


if __name__ == "__main__":
    make_app_icon(512).save(os.path.join(ASSETS, "icon.png"))
    make_app_icon(256).save(os.path.join(ASSETS, "icon-256.png"))
    make_tray(32).save(os.path.join(ASSETS, "tray.png"))
    make_drag(32).save(os.path.join(ASSETS, "drag.png"))
    print("assets written:", os.listdir(ASSETS))
