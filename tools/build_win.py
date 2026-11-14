"""打包 Windows 便携版：dist/Noteon/ + dist/Noteon-win64.zip"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNTIME = os.path.join(ROOT, "runtime", "electron")
DIST = os.path.join(ROOT, "dist")
OUT = os.path.join(DIST, "Noteon")
RCE = os.path.join(ROOT, "tools", "rcedit-x64.exe")
if not os.path.exists(RCE):
    RCE = os.path.join(RUNTIME, "rcedit-x64.exe")
ICON_PNG = os.path.join(ROOT, "assets", "icon.png")
ICON_ICO = os.path.join(ROOT, "assets", "icon.ico")
ZIP = os.path.join(DIST, "Noteon-win64.zip")

APP_ITEMS = ["main", "renderer", "plugins", "assets", "docs"]


def make_ico():
    from PIL import Image

    img = Image.open(ICON_PNG)
    img.save(ICON_ICO, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print("icon:", ICON_ICO)


def build():
    if not os.path.isdir(RUNTIME):
        sys.exit("缺少 runtime/electron，无法打包")
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(DIST, exist_ok=True)

    print("copy runtime ->", OUT)
    shutil.copytree(
        RUNTIME,
        OUT,
        ignore=shutil.ignore_patterns("rcedit-x64.exe", "default_app.asar"),
    )

    exe = os.path.join(OUT, "Noteon.exe")
    os.replace(os.path.join(OUT, "electron.exe"), exe)

    app_dir = os.path.join(OUT, "resources", "app")
    os.makedirs(app_dir, exist_ok=True)
    for name in APP_ITEMS:
        src = os.path.join(ROOT, name)
        dst = os.path.join(app_dir, name)
        if os.path.isdir(src):
            shutil.copytree(src, dst)
    for name in ["package.json", "README.md"]:
        shutil.copy2(os.path.join(ROOT, name), os.path.join(app_dir, name))

    # 不把开发/测试数据带进包
    for junk in ["data", "out"]:
        p = os.path.join(app_dir, junk)
        if os.path.isdir(p):
            shutil.rmtree(p)

    make_ico()
    if not os.path.exists(RCE):
        print("缺少 rcedit，跳过图标/版本信息")
    else:
        print("rcedit ->", exe)
        subprocess.run(
        [
            RCE, exe,
            "--set-icon", ICON_ICO,
            "--set-file-version", "0.1.0",
            "--set-product-version", "0.1.0",
            "--set-version-string", "FileDescription", "Noteon 桌面便签",
            "--set-version-string", "ProductName", "Noteon",
            "--set-version-string", "CompanyName", "SGorgeous",
            "--set-version-string", "OriginalFilename", "Noteon.exe",
        ],
            check=True,
        )

    print("zip ->", ZIP)
    if os.path.exists(ZIP):
        os.remove(ZIP)
    with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for base, dirs, files in os.walk(OUT):
            dirs[:] = [d for d in dirs if d not in {"data"}]
            for f in files:
                full = os.path.join(base, f)
                rel = os.path.relpath(full, DIST)
                zf.write(full, rel)

    total = sum(os.path.getsize(os.path.join(b, f)) for b, _, fs in os.walk(OUT) for f in fs)
    print("folder:", round(total / 1024 / 1024, 1), "MB")
    print("zip:   ", round(os.path.getsize(ZIP) / 1024 / 1024, 1), "MB")
    print("exe:   ", exe)


if __name__ == "__main__":
    build()
