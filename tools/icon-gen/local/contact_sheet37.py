#!/usr/bin/env python3
"""37 名社群英雄的接觸表（GH#1129 HITL）—— 一頁掃完 259 張。

⭐ 為什麼要它：CLAUDE.md 的 HITL 分層裡,Tier 2 的工具就是「**一頁網頁／一張圖**,
逐格看」。⛔ 259 張逐張開是把成本轉嫁給 owner。

⚠️ ⭐ 字型是硬需求,⛔ 不是美觀：第一版用 PIL 預設點陣字,
**中文名全部變成方框** ⇒ 那張表**看不出哪一列是誰**,等於沒有做。
"""
from __future__ import annotations

import json
import pathlib
import sys

from PIL import Image, ImageDraw, ImageFont

BASE = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "docs/_reports/community-hero-icons-20260909")
SUBJ_FILE = pathlib.Path(__file__).resolve().parent / "data" / "community37-subjects.json"
SLOTS = ["PASSIVE", "Q", "W", "E", "R", "EX"]
CELL, PAD, NAME, HEAD = 72, 3, 150, 20
CJK = ["/System/Library/Fonts/Hiragino Sans GB.ttc",
       "/System/Library/Fonts/STHeiti Medium.ttc",
       "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"]


def _font(size: int) -> ImageFont.FreeTypeFont:
    for p in CJK:
        if pathlib.Path(p).exists():
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                continue
    raise SystemExit("⛔ 找不到中文字型 —— 沒有它這張表看不出哪一列是誰")


def main() -> int:
    subj = json.loads(SUBJ_FILE.read_text(encoding="utf-8"))["heroes"]
    items = sorted(subj.items())
    half = (len(items) + 1) // 2
    blocks = [items[:half], items[half:]]
    bw = NAME + 7 * (CELL + PAD) + PAD
    sheet = Image.new("RGB", (bw * 2 + 14, HEAD + half * (CELL + PAD) + PAD), (22, 22, 26))
    d = ImageDraw.Draw(sheet)
    f_head, f_name = _font(12), _font(13)
    missing = 0
    for b, block in enumerate(blocks):
        ox = b * (bw + 14)
        for c, t in enumerate(["英雄"] + SLOTS):
            d.text((ox + NAME + PAD + c * (CELL + PAD) + 2, 4), t, font=f_head, fill=(180, 180, 195))
        for r, (idx, e) in enumerate(block):
            y = HEAD + PAD + r * (CELL + PAD)
            d.text((ox + 4, y + CELL // 2 - 8), f'{idx} {e["name"]}'[:12], font=f_name, fill=(228, 228, 238))
            hid = f"community-review-{idx}-20260907"
            cells = [BASE / "champions" / f"{hid}.webp"] + [
                BASE / "abilities" / f"{hid}.{s.lower()}.webp" for s in SLOTS]
            for c, p in enumerate(cells):
                x = ox + NAME + PAD + c * (CELL + PAD)
                if p.exists():
                    sheet.paste(Image.open(p).convert("RGB").resize((CELL, CELL), Image.LANCZOS), (x, y))
                else:
                    missing += 1
                    d.rectangle([x, y, x + CELL, y + CELL], outline=(210, 60, 60))
    out = BASE / "contact-sheet.png"
    sheet.save(out, "PNG", optimize=True)
    print(f"✓ {out} · {sheet.size[0]}×{sheet.size[1]} · {out.stat().st_size/1e6:.2f} MB"
          + (f" · ⛔ 缺 {missing} 格" if missing else " · 0 缺格"))
    return 1 if missing else 0
if __name__ == "__main__":
    sys.exit(main())
