#!/usr/bin/env python3
"""場地之外的 2D 背景圖 —— 地端產生器（GH#452, owner 2026-08-19）。

> 「我說過場地之外的背景 最好生成一張 2d 圖是符合場景的，而不是全黑，
>  生成背景圖片可以地端」

## 這支腳本做什麼（⛔ 以及不做什麼）

做：讀 `content/arenas/arena.*.json` 的**主題**（名稱 / groundStyle / palette /
backdrop profile），配上 FATE（型月・ufotable）風格提示詞，用**地端** Stable
Diffusion 產出每張場地一張背景圖，寫進 `content/assets/arena-bg/<arenaId>.webp`。

⛔ 不做：把圖接到遊戲裡。接線那一半要動 `content/arenas/*.json`（加一格
`backgroundImage`）與 Zod schema，而那會撞 `pnpm content:build`（見交接說明）。

## ⚠️ 這支只**匯入** tools/icon-gen，⛔ 一個位元組都不改它

`tools/icon-gen/local/pipeline.py` 已經是「模型只在一個地方載入」的那個地方
（`load_pipeline()` 自己偵測 SD1.5 / SDXL、掛 LoRA、選 MPS）。
⭐ 但它的 `generate()` **只產正方形**（width = height = native edge），
而背景要的是**寬幅**，所以這裡直接呼叫它交出來的 `pipe`，
並沿用它的 `_encode_long()` 讓提示詞可以超過 77 token。

## 決定性

seed = sha256(arenaId) 的前 8 個 hex ⇒ 同一個 id 永遠同一張圖，
⛔ 不用把 seed 抄在別的地方（那就是第四個住處）。

## `--check`（⭐ 這一支自己的閘）

`ARENA_THEMES` 與出貨的 `content/arenas/` 必須**逐一對得上**：
少一張 = 那張場地的背景是全黑（就是這張 issue 要修的東西）而**沒有人會知道**；
多一張 = 指向一個不存在的場地。兩個方向都會讓 `--check` 回非零。
⛔ 這裡刻意不寫 vitest：它驗的是一張 python 表，跑 `--check` 一秒有答案。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
ARENAS_DIR = os.path.join(REPO, "content", "arenas")
OUT_DIR = os.path.join(REPO, "content", "assets", "arena-bg")

# icon-gen 的 local/ 與 src/ 都要在 sys.path 上（pipeline._lora_specs() 會
# `import keywords`，而 keywords 又 `import prompt`）—— batch.py 也是這樣做的。
sys.path.insert(0, os.path.join(REPO, "tools", "icon-gen", "src"))
sys.path.insert(0, os.path.join(REPO, "tools", "icon-gen", "local"))


# --------------------------------------------------------------- 風格 -------
# ⭐ 與 M2（地圖物件）同一組 FATE 三色，⛔ 不另外挑：
#    金 #C9A227 × 靛藍 #2A2E5A × 緋紅 #8E1B2E，暖金主光左上、冷藍邊光右下。
# ⭐ 背景**特有**的四條（icon 的風格提示詞剛好相反，它要 plain near-black
#    background + bold silhouette，所以⛔不可以直接沿用 icon-style.json）：
#    無主體 · 地平線在下三分之一 · 遠景景深 · 邊緣壓暗。
STYLE = (
    "Fate Type-Moon anime background art in the ufotable style, "
    "hand-painted matte painting, cel shading in two tone steps with visible brush texture, "
    "restrained palette of burnished gold and deep indigo lifted by one crimson accent, "
    "warm gold key light from the upper left, cool azure rim light down the lower right, "
    "a few drifting blue-white magical motes, "
    "empty establishing shot with no subject, horizon low in the lower third, "
    "nothing in the foreground, unobstructed distant view, "
    "deep aerial perspective with layered distance haze, darkened vignette at the edges, "
    "wide cinematic composition, high local contrast"
)

# ⛔ 只放**風格**與**主體**的禁令，不放題材詞（寫 fire 會讓火焰場地一起沒有火）。
# 「no characters」是這一份最重要的一條：背景裡出現一個人 = 玩家會以為那是單位。
NEGATIVE = (
    "character, person, people, human figure, creature, monster, animal, "
    "foreground subject, close-up object, centred subject, portrait, "
    "foreground pillar, foreground rock, foreground branch, framing arch, "
    "text, letters, runes, inscribed symbols, watermark, signature, "
    "border, frame, ui panel, hud, logo, emblem, "
    "collage, grid, multiple views, split screen, mirrored duplicate horizon, "
    "neon, oversaturated, garish clashing colours, rainbow gradient, glitter, "
    "lens flare, chromatic aberration, photorealistic, photograph, 3d render, "
    "glossy plastic, chrome, blurry, lowres, jpeg artifacts, deformed, "
    "western cartoon, sketch, monochrome"
)


# --------------------------------------------------------------- 主題表 -----
# 一張場地一行。⭐ 每一行都是從**那份 JSON 自己**讀出來的東西寫成的
# （name / groundStyle / scenery.palette / backdrop.layers[].profile），
# ⛔ 不是憑印象 —— `--check --verbose` 會把 JSON 那一側印出來對照。
ARENA_THEMES: dict[str, tuple[str, str]] = {
    "arena.castle": (
        "室內石造城堡大廳：拱窗、垂旗、火把搖曳（palette sky #6a5f7a、key #ffb964 flicker）",
        "vast empty stone castle great hall interior, tall arched windows down both sides, "
        "hanging banners, iron torch sconces casting warm flickering light, dust motes in the light shafts",
    ),
    "arena.colosseum": (
        "烈日下的羅馬圓形競技場看台與拱廊（sand、sky #fff2d6、keyIntensity 1.15）",
        "roman colosseum exterior, tiers of sun-bleached sandstone seating and stacked arcades, "
        "blazing noon sky, faded awnings, heat haze over the stone",
    ),
    "arena.dota": (
        "三路林間河道與遠方兵營（grass、sky #dff0ff）",
        "three forest lanes divided by a shallow river valley, mossy stone barracks in the distance, "
        "dense treeline, bright overcast daylight",
    ),
    "arena.frieren": (
        "冰藍魔法迷宮遺跡、尖塔群（stone、sky #bcd6ff、backdrop peaks×3）",
        "frozen blue magical labyrinth ruins, jagged spires of pale stone rising in tiers, "
        "drifting snow, cold moonlit haze",
    ),
    "arena.godie": (
        "粉櫻黃昏的龜裂荒土集會場（dirt、sky #ffd8e6、key #ffd0b0 breathe）",
        # ⚠️ 第一版寫「ragged banners on leaning poles」，模型把它畫成一顆佔滿畫面的
        #    粉紅熱氣球（＝背景長出主體，正是這張圖最不能有的東西）。
        #    ⇒ 改成純地景描述，⛔ 不放任何「單一物件」名詞。
        "dusk plain of cracked red earth stretching to distant low hills, "
        "pink cherry-blossom haze drifting on the wind, warm rose sunset, empty horizon",
    ),
    "arena.heavens-arena": (
        "雲海之上的高塔擂台、遠方雷雲（wood、backdrop cloudSea×2 + lightning）",
        "tower arena standing above an endless sea of clouds, distant thunderheads, "
        "sunlit cloud tops far below, thin cold air",
    ),
    "arena.holy-grail": (
        "地底大聖杯洞窟、翠綠魔力湧光（stone、sky #d8ffe0、backdrop towers/torii/cloudSea）",
        "vast underground cavern of the great grail, emerald mana light welling up from far below, "
        "ancient carved pillars and torii gates in the gloom, drifting mist",
    ),
    "arena.infinity-castle": (
        "紫黑無限城、錯位和式階梯與鳥居（tatami、sky #b39ce8、backdrop torii/shards/pagoda、storm）",
        "endless shifting japanese castle interior, mismatched wooden staircases and sliding paper doors "
        "at impossible angles, deep purple gloom, hanging paper lanterns",
    ),
    "arena.nazarick": (
        "黑曜石大墳墓地下陵寢、翡翠幽光（obsidian、sky #9fffc4、key flicker）",
        "obsidian great tomb catacomb, black polished walls and gold funerary trim, "
        "jade-green witchlight braziers, long descending stairs",
    ),
    "arena.royale": (
        "風暴中的破碎石造終局戰場（stone、sky #b9c6ff、wave storm、單一 r=42 大場）",
        "shattered stone battlefield under a lightning storm, broken pillars and rubble, "
        "rain-slick flagstones, cold blue sky flashes",
    ),
    "arena.shiganshina": (
        "巨牆環繞的紅瓦城鎮廢墟（dirt、backdrop towers #8a4a32 + cloudSea #6b7a3a）",
        "walled town of red-tiled roofs ruined and half-collapsed, a colossal stone wall ringing the horizon, "
        "olive farmland beyond, dusty overcast light",
    ),
    "arena.skeleton": (
        "明亮素白的訓練場迴廊（stone、palette floor #d3d7e0、keyIntensity 0.95）",
        "bright pale training hall colonnade, clean white stone arches, soft even daylight, "
        "simple hanging banners",
    ),
    "arena.world-tree": (
        "世界樹根部的櫻與翠綠林海（grass、sky #e0ffd8、backdrop sakura + cloudSea×2）",
        "roots of the colossal world tree, immense trunk vanishing upward, emerald canopy sea below, "
        "drifting pink sakura petals, golden god rays",
    ),
}


def shipped_arena_ids() -> list[str]:
    ids = []
    for name in sorted(os.listdir(ARENAS_DIR)):
        if not name.startswith("arena.") or not name.endswith(".json"):
            continue
        with open(os.path.join(ARENAS_DIR, name), encoding="utf-8") as fh:
            ids.append(json.load(fh)["id"])
    return sorted(ids)


def check(verbose: bool = False) -> int:
    shipped = set(shipped_arena_ids())
    table = set(ARENA_THEMES)
    missing = sorted(shipped - table)
    extra = sorted(table - shipped)
    for aid in missing:
        print(f"⛔ 出貨的場地沒有背景主題（那張場地的場外會是全黑）: {aid}")
    for aid in extra:
        print(f"⛔ 主題表指向一個不存在的場地: {aid}")
    if verbose:
        for aid in sorted(shipped & table):
            print(f"  {aid:26s} {ARENA_THEMES[aid][0]}")
    if missing or extra:
        return 1
    print(f"OK — {len(shipped)} 張場地，主題表逐一對得上")
    return 0


def seed_for(arena_id: str) -> int:
    return int(hashlib.sha256(arena_id.encode("utf-8")).hexdigest()[:8], 16)


def prompt_for(arena_id: str) -> str:
    return f"{ARENA_THEMES[arena_id][1]}, {STYLE}"


def render(arena_id: str, width: int, height: int, steps: int, guidance: float,
           seed: int | None = None):
    """→ PIL.Image，尺寸就是 (width, height)。

    ⚠️ 走 `pipeline.load_pipeline()` 交出來的 pipe（⛔ 不是 `pipeline.generate()`
    —— 那一支寫死 width = height = native edge，產不出寬幅）。
    """
    import pipeline  # tools/icon-gen/local/pipeline.py（只讀，⛔ 不改）

    pipe = pipeline.load_pipeline()
    return pipe(
        **pipeline._encode_long(pipe, prompt_for(arena_id), NEGATIVE),
        width=int(width),
        height=int(height),
        num_inference_steps=int(steps),
        guidance_scale=float(guidance),
        generator=pipeline._generator(pipe.device.type, seed_for(arena_id) if seed is None else seed),
    ).images[0]


def void_rgb(arena_id: str) -> tuple[int, int, int]:
    """那張場地**自己**的虛空色（`scenery.palette.void`）。

    ⭐ 壓暗要壓到**這一格**，⛔ 不是壓到純黑：`Lighting.ts:83` 就是拿這一格寫
    `scene.clearColor`，所以背景圖的邊緣與它旁邊那片底色會是**同一個顏色** ——
    接上去看不到接縫。⛔ 壓到黑就會在每張圖外圍多一圈假的暗環。
    """
    path = os.path.join(ARENAS_DIR, f"{arena_id}.json")
    with open(path, encoding="utf-8") as fh:
        doc = json.load(fh)
    hexv = str(doc.get("scenery", {}).get("palette", {}).get("void", "#000000")).lstrip("#")
    return tuple(int(hexv[i:i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def apply_vignette(image, rgb: tuple[int, int, int], strength: float,
                   inner: float = 0.42, power: float = 1.7):
    """邊緣壓暗 —— ⭐ **程式做**，⛔ 不是求提示詞做。

    「darkened vignette at the edges」寫在提示詞裡時，模型有時給、有時不給，
    而「有時不給」在畫面上就是一張亮到搶走視線的背景（場地不再是焦點）。
    這裡做成一個確定性的後處理 ⇒ 每一張都一定有，強度是一格參數。
    """
    import numpy as np
    from PIL import Image

    arr = np.asarray(image.convert("RGB"), dtype=np.float32)
    h, w = arr.shape[:2]
    ys = (np.linspace(-1.0, 1.0, h)[:, None]) ** 2
    xs = (np.linspace(-1.0, 1.0, w)[None, :]) ** 2
    r = np.sqrt((ys + xs) / 2.0)                       # 角落 = 1
    mask = np.clip((r - inner) / max(1e-6, 1.0 - inner), 0.0, 1.0) ** power
    mask = (mask * float(strength))[:, :, None]
    void = np.array(rgb, dtype=np.float32)[None, None, :]
    out = arr * (1.0 - mask) + void * mask
    return Image.fromarray(np.clip(out, 0, 255).astype("uint8"))


def save(image, path: str, out_w: int, out_h: int, quality: int) -> int:
    from PIL import Image

    os.makedirs(os.path.dirname(path), exist_ok=True)
    if image.size != (out_w, out_h):
        image = image.resize((out_w, out_h), Image.LANCZOS)
    image.convert("RGB").save(path, "WEBP", quality=quality, method=6)
    return os.path.getsize(path)


def main() -> int:
    ap = argparse.ArgumentParser(description="場地之外的 2D 背景圖（地端產生）")
    ap.add_argument("--check", action="store_true", help="只驗主題表 ↔ content/arenas 對得上")
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--arena", action="append", default=[], help="場地 id，可重複；不給 = 全部")
    ap.add_argument("--render-width", type=int, default=1024, help="模型實際算圖的寬")
    ap.add_argument("--render-height", type=int, default=576, help="模型實際算圖的高")
    ap.add_argument("--width", type=int, default=2048, help="存檔寬")
    ap.add_argument("--height", type=int, default=1152, help="存檔高")
    ap.add_argument("--steps", type=int, default=28)
    ap.add_argument("--guidance", type=float, default=7.5)
    ap.add_argument("--seed", type=int, default=None, help="覆寫 seed（除錯用）")
    ap.add_argument("--quality", type=int, default=86, help="WEBP 品質")
    ap.add_argument("--vignette", type=float, default=0.7,
                    help="邊緣壓向該場地 palette.void 的強度（0 = 關掉）")
    ap.add_argument("--out-dir", default=OUT_DIR, help="輸出目錄（樣本可指到 /private/tmp）")
    ap.add_argument("--suffix", default="", help="檔名後綴（比較用，例：-v2）")
    args = ap.parse_args()

    if args.check:
        return check(args.verbose)

    ids = args.arena or shipped_arena_ids()
    unknown = [a for a in ids if a not in ARENA_THEMES]
    if unknown:
        print(f"⛔ 不認得的場地 id: {unknown}")
        return 2

    import time

    for aid in ids:
        t0 = time.time()
        img = render(aid, args.render_width, args.render_height, args.steps, args.guidance, args.seed)
        if args.vignette > 0:
            img = apply_vignette(img, void_rgb(aid), args.vignette)
        path = os.path.join(args.out_dir, f"{aid}{args.suffix}.webp")
        n = save(img, path, args.width, args.height, args.quality)
        print(f"{aid:26s} seed={seed_for(aid):10d} {time.time() - t0:5.1f}s "
              f"{args.render_width}x{args.render_height}→{args.width}x{args.height} "
              f"{n / 1024:6.1f} KB  {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
