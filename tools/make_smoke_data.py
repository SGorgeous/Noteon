"""生成冒烟测试用的示例数据（图片 / 文本 / 本地网页 / 文件夹）。"""
from __future__ import annotations

import os
import random
import shutil
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "out", "smoke-data")
os.makedirs(OUT, exist_ok=True)

W, H = 900, 1200


def vgrad(size, stops):
    base = Image.new("RGB", size)
    d = ImageDraw.Draw(base)
    for y in range(size[1]):
        t = y / (size[1] - 1)
        for i in range(len(stops) - 1):
            a, b = stops[i], stops[i + 1]
            if a[0] <= t <= b[0]:
                k = (t - a[0]) / max(1e-6, b[0] - a[0])
                col = tuple(int(a[1][j] + (b[1][j] - a[1][j]) * k) for j in range(3))
                d.line([(0, y), (size[0], y)], fill=col)
                break
    return base


def make_ref(path, warm=True):
    random.seed(7 if warm else 11)
    if warm:
        stops = [(0.0, (36, 26, 62)), (0.35, (92, 58, 108)), (0.6, (214, 112, 96)), (0.78, (247, 170, 108)), (1.0, (58, 44, 76))]
        sun = (255, 214, 150)
    else:
        stops = [(0.0, (8, 20, 36)), (0.4, (18, 58, 76)), (0.68, (28, 108, 110)), (0.85, (92, 170, 150)), (1.0, (10, 24, 34))]
        sun = (214, 250, 236)
    img = vgrad((W, H), stops)

    glow = Image.new("RGB", (W, H), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    cx, cy, r = W * 0.62, H * 0.42, 260
    gd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=sun)
    glow = glow.filter(ImageFilter.GaussianBlur(90))
    img = Image.blend(img, glow, 0.55)

    d = ImageDraw.Draw(img)
    # 太阳
    d.ellipse([cx - 70, cy - 70, cx + 70, cy + 70], fill=sun)
    # 星点
    for _ in range(90):
        x, y = random.uniform(0, W), random.uniform(0, H * 0.45)
        a = random.randint(30, 120)
        d.ellipse([x, y, x + 2, y + 2], fill=(255, 255, 255, a) if warm else (200, 255, 240, a))
    # 远山
    for layer, (base_y, color, alpha) in enumerate([
        (H * 0.58, (40, 28, 54), 255),
        (H * 0.63, (28, 20, 40), 255),
        (H * 0.69, (18, 14, 28), 255),
    ]):
        pts = [(0, H)]
        x = 0
        while x <= W:
            y = base_y + random.uniform(-40, 40) + (layer * 10)
            pts.append((x, y))
            x += random.uniform(90, 170)
        pts.append((W, H))
        d.polygon(pts, fill=color)
    # 水面
    d.rectangle([0, H * 0.7, W, H], fill=(22, 18, 34) if warm else (8, 20, 30))
    for i in range(26):
        y = H * 0.71 + i * (H * 0.28 / 26)
        w = random.uniform(60, 360)
        x = random.uniform(0, W - w)
        d.rounded_rectangle([x, y, x + w, y + 2], radius=2, fill=(sun[0], sun[1], sun[2], 90))
    # 前景剪影
    d.polygon([(0, H), (0, H * 0.86), (120, H * 0.8), (240, H * 0.9), (330, H * 0.84), (330, H)], fill=(10, 8, 16))
    # 颗粒
    noise = Image.effect_noise((W, H), 14).convert("L")
    img = Image.composite(Image.new("RGB", (W, H), (255, 255, 255)), img, noise.point(lambda v: int(max(0, (v - 170)) * 0.25)))
    img.save(path, quality=92)


def make_page(path):
    html = """<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>色彩与构图 · 参考页</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: "Segoe UI", "Microsoft YaHei UI", sans-serif; background:#0b0f15; color:#e8eef7; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 46px 34px 60px; }
  .kicker { font-size: 11px; letter-spacing: 3px; color:#6ea8fe; text-transform: uppercase; }
  h1 { font-size: 34px; margin: 12px 0 10px; letter-spacing: -0.5px; }
  .sub { color:#8b98ab; font-size: 13px; line-height: 1.8; max-width: 560px; }
  .grid { display:grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin: 30px 0; }
  .sw { aspect-ratio: 1; border-radius: 10px; }
  .row { display:grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 18px; }
  .card { border:1px solid rgba(255,255,255,.08); background: linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.01)); border-radius: 12px; padding: 16px; }
  .card b { font-size: 12px; display:block; margin-bottom: 6px; }
  .card p { margin:0; font-size: 11.5px; line-height: 1.75; color:#8b98ab; }
  .bar { height: 8px; border-radius: 99px; background: linear-gradient(90deg, #f0b429, #e8638f, #a780ff, #6ea8fe, #3ddc97); margin-top: 14px; }
  .note { font-family: Consolas, monospace; font-size: 11px; color:#8b98ab; margin-top: 26px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,.08); }
</style></head>
<body><div class="wrap">
  <div class="kicker">Noteon · local page</div>
  <h1>色彩与构图</h1>
  <div class="sub">这是一张本地 HTML 卡片示例。它证明卡片容器可以承载真正网页：排版、字体、渐变、网格，全都能用。</div>
  <div class="grid">
    <div class="sw" style="background:#f0b429"></div>
    <div class="sw" style="background:#e8638f"></div>
    <div class="sw" style="background:#a780ff"></div>
    <div class="sw" style="background:#6ea8fe"></div>
    <div class="sw" style="background:#3ddc97"></div>
  </div>
  <div class="bar"></div>
  <div class="row">
    <div class="card"><b>三分法</b><p>把主体放在交点附近，画面会更稳。卡片里的图片打开网格叠加，就能直接比对。</p></div>
    <div class="card"><b>并排对比</b><p>图片卡片支持分割线对比：左边当前图，右边下一张，缩放与拖动同步。</p></div>
  </div>
  <div class="note">file:// preview · rendered inside Noteon</div>
</div></body></html>"""
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)


def make_texts(out):
    sample = """Noteon / 文本卡片
==============================

这是本地文本文件预览与编辑的示例。
文本卡片会读取磁盘上的原始文件，修改后自动写回。

功能
----
1. 拖入 txt / md / 代码文件即可打开
2. Ctrl+S 立即保存（默认也会自动保存）
3. 自动换行可切换，字号可调
4. 打开的文件路径保存在卡片里，下次启动会恢复

代码片段
--------
function hello(name) {
  return `hello, ${name}`;
}

配色与排版
----------
背景： semi-transparent + blur
字体： Segoe UI / Microsoft YaHei UI
代码： Cascadia Code / Consolas

—— 你可以直接在这张卡片里改字，然后看文件变化。
"""
    with open(os.path.join(out, "sample.txt"), "w", encoding="utf-8") as f:
        f.write(sample)

    md = """# 参考图清单

- [x] 黄昏山谷（暖）
- [x] 夜潮（冷）
- [ ] 加一张人物速写
- [ ] 导出色板

## 色板

| 名称 | Hex |
| --- | --- |
| 琥珀 | `#F0B429` |
| 胭脂 | `#E8638F` |
| 暮蓝 | `#6EA8FE` |

> 图片卡片可以同时放多张，用分割线对比，滚轮缩放。
"""
    with open(os.path.join(out, "notes.md"), "w", encoding="utf-8") as f:
        f.write(md)


def main():
    make_ref(os.path.join(OUT, "ref-a.png"), warm=True)
    make_ref(os.path.join(OUT, "ref-b.png"), warm=False)
    make_page(os.path.join(OUT, "page.html"))
    make_texts(OUT)

    folder = os.path.join(OUT, "folder")
    os.makedirs(folder, exist_ok=True)
    shutil.copy(os.path.join(OUT, "ref-a.png"), os.path.join(folder, "参考图-01.png"))
    shutil.copy(os.path.join(OUT, "ref-b.png"), os.path.join(folder, "参考图-02.png"))
    shutil.copy(os.path.join(OUT, "notes.md"), os.path.join(folder, "笔记.md"))
    with open(os.path.join(folder, "图纸说明.txt"), "w", encoding="utf-8") as f:
        f.write("这是文件夹映射卡片的示例目录。\n拖文件进来会复制到此处。\n")
    os.makedirs(os.path.join(folder, "子文件夹"), exist_ok=True)
    print("smoke data written to", OUT)


if __name__ == "__main__":
    main()
