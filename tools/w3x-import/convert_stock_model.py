#!/usr/bin/env python3
"""GH#691 — convert a BLIZZARD-STOCK effect model out of the retail MPQs into a
shipped `.glb`.

The map-embedded models already have a pipeline (`import_w3x.py` →
`w3xlib.models.convert_all` over `out/GoDieEX22s/raw/`).  The **stock** ones do
not: `extract_stock_vfx.py` only lifts PRE2 *emitter parameters* into
`content/vfx/fx.w3x.stock.*.json`, and it never touches geometry.  But the
locust census (`tools/locust-census/census.json`) measured that most of the 135
distinct dummy models are stock — so "the dummy is invisible in GGD" is, for
that whole family, one missing conversion step and not 135 content problems.

    python3 tools/w3x-import/convert_stock_model.py monsoonbolttarget
    python3 tools/w3x-import/convert_stock_model.py --list
    python3 tools/w3x-import/convert_stock_model.py monsoonbolttarget --dry-run
    python3 tools/w3x-import/convert_stock_model.py --inventory       # GH#753 盤點

⭐ GH#753 —— 這個入口以前對 **RIBB（緞帶發射器）完全失明**（`grep -ic ribb`
= 0），所以一顆帶 8 條緞帶的模型轉進來之後，轉檔紀錄**看起來是完整的**而少了
一整族 emitter。現在每一次轉檔都附 `ribbons`（陷阱②的同一條判準：看峰值），
而 `--inventory` 是唯讀的盤點表（PRE2 條數 × RIBB 條數 × 畫不畫得出像素），
供 `extract_particles.py` 的 `ribbon@1` 出口按「擋住幾支」排序。

⭐ Why a table and not one invocation per model (第零守則⑨): every stock model
needs the identical four steps (locate in the MPQ chain → drop the .mdx into a
scratch raw dir → `convert_all(only=…)` → verify + install).  The only thing
that differs is the archive path, so the differing part is a table row.

⚠️ Verification is NOT optional and NOT "did it write a file".  Two converter
traps are already on record in `docs/_reports/locust_scan/mdl-params.md`:

  ① LUMA-KEY family — a texture whose *shape* lives in the alpha channel.
     `gltf.py`'s `fm >= 3` (additive) branch luma-keys those today, but a model
     whose geoset textures are alpha-shaped still deserves the measurement
     before we trust the output, so this script reports, per texture, whether
     the shape is in RGB or in alpha.
  ② segment-alpha born at 0 (WarStomp / ReviveHuman family) — a reader that
     only looks at the BIRTH value calls the emitter invisible for its whole
     life.  Visibility here is judged on the **peak**, never on the birth value.

So the gate is `visible_prims(new) >= 1` measured off the emitted glTF exactly
the way `modelFxStagingContract` ⑥ measures it, and an existing shipped file is
never overwritten unless the rebuild is at least as good (visible prims and
animation count) as the copy in **git HEAD** (same reasoning as
`reconvert_zero_pixel.py`: this script installs over its own baseline).

Writes:  content/assets/models/imported/<slug>.glb
         tools/w3x-import/out/stock/convert-<slug>.json   (measurement record)
"""

from __future__ import annotations

import argparse
import json
import math
import os
import statistics
import struct
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# ⭐ GH#769: `--check` reads JSON and stats files. Nothing else. But this import
# block drags in Pillow (w3xlib.blp), and on a machine where Pillow is missing —
# or installed for the WRONG ARCH, which is what a universal2 python3 spawned
# from node hits here — the whole script refuses to start. A reconciliation gate
# that cannot run in the environment that runs the gates is not a gate, so the
# conversion imports are allowed to fail and are re-raised at the moment a
# conversion actually needs them (⛔ never silently: main() names the cause).
_CONVERT_IMPORT_ERROR: Exception | None = None
try:
    from w3xlib.blp import decode_blp  # noqa: E402
    from w3xlib.mdx import parse_mdx  # noqa: E402
    from w3xlib.models import STOCK_MPQS, STOCK_MPQ_DIR, convert_all, slug  # noqa: E402
    from w3xlib.mpq import W3XArchive  # noqa: E402
except Exception as _e:  # pragma: no cover - environment-dependent
    _CONVERT_IMPORT_ERROR = _e

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
SHIP = os.path.join(ROOT, "content", "assets", "models", "imported")
OUT = os.path.join(HERE, "out", "stock")

# slug → in-archive path.  The census reports `.mdl`; the archives carry `.mdx`,
# so both spellings are tried.  Rows are added as each Phase-6 batch lands.
STOCK_MODELS: dict[str, str] = {
    # ── GH#423 千年練成樹精（70-04）—— ⭐ 這一顆是**召喚物的身體**，⛔ 不是特效。
    # 路徑取自 `OBJECTS.json` 的 `n00Q.model`（⛔ 不是票文寫的
    # `Doodads\Cinematic\Roots\Roots.mdl` —— 那個路徑在四份 MPQ 裡**都不存在**）。
    # ⚠️ 而 `n00Q`（一般）與 `n01M`（EX）**共用同一顆模型**，差別只在數值。
    "roots": "Abilities\\Spells\\NightElf\\EntangleMine\\Roots.mdl",
    # ── GH#838 三招驗收批 —— 12 顆 JASS 逐行點名、GGD 零 key 的 stock 特效 ──
    # 路徑逐字取自 docs/_reports/vfx-editor-jass3_temp_20260828-0042.md 的
    # AddSpecialEffect* 原文（⛔ 不是猜的）。超究（血濺/鳳凰彈/鏡像殘影/中立爆炸）、
    # 龍破斬拖尾（HCancelDeath/VolcanoDeath/FlameStrikeTarget）、
    # 理想鄉EX（DarkPortal/Stampede/SteamTank/NEDeathSmall/AIviTarget）。
    "humanbloodpeasant": "Objects\\Spawnmodels\\Human\\HumanBlood\\HumanBloodPeasant.mdl",
    "phoenixmissile": "Abilities\\Weapons\\PhoenixMissile\\Phoenix_Missile.mdl",
    "mirrorimagecaster": "Abilities\\Spells\\Orc\\MirrorImage\\MirrorImageCaster.mdl",
    "neutralbuildingexplosion":
        "Objects\\Spawnmodels\\Other\\NeutralBuildingExplosion\\NeutralBuildingExplosion.mdl",
    "steamtankimpact": "Abilities\\Weapons\\SteamTank\\SteamTankImpact.mdl",
    "stampedemissiledeath": "Abilities\\Spells\\Other\\Stampede\\StampedeMissileDeath.mdl",
    "darkportaltarget": "Abilities\\Spells\\Demon\\DarkPortal\\DarkPortalTarget.mdl",
    "nedeathsmall": "Objects\\Spawnmodels\\NightElf\\NEDeathSmall\\NEDeathSmall.mdl",
    "hcanceldeath": "Objects\\Spawnmodels\\Human\\HCancelDeath\\HCancelDeath.mdl",
    "volcanodeath": "Abilities\\Spells\\Other\\Volcano\\VolcanoDeath.mdl",
    "flamestriketarget": "Abilities\\Spells\\Human\\FlameStrike\\FlameStrikeTarget.mdl",
    "aivitarget": "Abilities\\Spells\\Items\\AIvi\\AIviTarget.mdl",
    # GH#691 · locust visual batch 1 — 17 JASS spawn sites across 5 dummies
    # (o00E/o00G/o02M/n00N/h00Q), the top non-invisible rawcode in the census.
    "monsoonbolttarget":
        "Abilities\\Spells\\Other\\Monsoon\\MonsoonBoltTarget.mdl",
    # already shipped by the 09-04 pilot (M4 lane) — kept so the path that
    # produced them is reproducible instead of living in a scratchpad.
    # ⚠️ GH#702 —— 這一列的路徑在 2026-08-26 之前是
    #    `Objects\\Spawnmodels\\Human\\HumanBloodExplosion\\ReviveHuman.mdl`,而那條路徑
    #    **在四個 MPQ 裡都不存在** ⇒ 這一列跑起來是 `nothing extracted`。
    #    這一列的存在理由逐字是「kept so the path that produced them is reproducible」——
    #    ⇒ 它從寫下的那天起就不可重現(第三守則:一句被散文守著的宣稱活過了保存期限)。
    #    真值取自 OBJECTS.json.units.h007.model,與 war3map.j 的 dummy 完全一致。
    "revivehuman": "Abilities\\Spells\\Human\\ReviveHuman\\ReviveHuman.mdl",
    # ⚠️ GH#753 —— 這一列的路徑在 2026-08-29 之前是
    #    `Abilities\\Spells\\Other\\Doom\\FlameStrike1.mdl`,而**四個 MPQ 裡都沒有它**
    #    ⇒ 這一列跑起來永遠是 `not-in-mpq`。⭐ 與上面 GH#702 那一列**完全同型**
    #    （第三守則:一句被散文守著的路徑活過了它的保存期限,而沒有任何東西變紅 ——
    #    `--check` 只從「紀錄」走向「.glb」,⛔ 走不回來,所以一列**沒有紀錄**的
    #    死路由結構上量不到）。真值 2026-08-29 逐個 MPQ 探測到:War3x.mpq。
    "flamestrike1": "Abilities\\Spells\\Human\\FlameStrike\\FlameStrike1.mdl",
    # GH#753 —— 緞帶最重的那一支。⛔ 在此之前它只活在 `extract_stock_vfx.py` 的
    #    普查工作單裡（PRE2 那條路),而這張表看不到它 ⇒ `--inventory` 數不到它的
    #    RIBB。owner 的 MDL 掃描逐字稱它「七支裡最重（PRE2×6 + RIBB×8）」,
    #    2026-08-29 直接解 MDX 複驗:PRE2×6 / RIBB×8,八條 KRVS 都是 1.0→0.0（畫得出來）。
    "markofchaostarget":
        "Abilities\\Spells\\Human\\MarkOfChaos\\MarkOfChaosTarget.mdl",
    # GH#688 Phase 6 · TORNADO lane — the census's single largest suggestion
    # family: 9 dummies (e00Y/e013/e016/h01S/h027/o01H/o01P/u00A/u00Z) all wear
    # this one stock model, tinted per-skill at spawn time.
    "tornadoelemental": "Abilities\\Spells\\Other\\Tornado\\TornadoElemental.mdl",
    # GH#688 Phase 6 · QUAD lane — TomeOfRetrainingCaster family: 4 dummies in
    # the census (h00N/h025/h02I/o00R) wear this flash; the two shipped landing
    # spots are godie-hvsh (48-00 via Riderspell, 48-04 via RidermovelineDam +
    # EX-mode Initate Crazy).  h00N (Gundam) and o00R (英雄之笛 item) have no
    # shipped owner — see the QUAD report's no-landing table.
    "tomeofretrainingcaster":
        "Abilities\\Spells\\Items\\TomeOfRetraining\\TomeOfRetrainingCaster.mdl",
    # GH#688 Phase 6 · PENTA lane — ForgottenOneTent (聖杯黑泥 family): census
    # rows u02S/u02V/u02W/u02X all belong to E00Q (黑化Saber, legacy) in the
    # w3x, but the shipped GGD-original champion godie-zombiex (聖杯黑泥醬
    # 喪標麥可) IS this family's identity — bindings live there, veto via the
    # #669 review page.
    "forgottenonetent": "Units\\Creeps\\ForgottenOne\\ForgottenOneTent.mdl",
    # GH#688 Phase 6 · PENTA lane — ThunderClapCaster geoset half (the PRE2
    # emitter half already ships as content/vfx/fx.w3x.stock.thunderclapcaster
    # .p00.json).  Only shipped visible landing spot: o006 雷切 via LightCutRun
    # (A0IJ = 45-03 千鳥, godie-edem.e).  mdl-params.md warns the overhead
    # lightning planes live in geoset/material animation — measured honestly in
    # the conversion record.
    "thunderclapcaster":
        "Abilities\\Spells\\Human\\ThunderClap\\ThunderClapCaster.mdl",
    # GH#702 · APPLY lane (光束砲家族按真相重建) — the two dummies the beam
    # family needs and GGD has never had.  Both measured off war3map.j, not
    # guessed:
    #   h008「特效三號」FragDriller  — the SECOND LAYER the three classics all
    #     share (j:31909 龜派氣功 · j:32327 約束勝利之劍 · j:32630 ExcaliburMAX),
    #     always `SetUnitScalePercent(350+15×lvl)` + `SetUnitTimeScalePercent(15)`
    #     + immediate KillUnit ⇒ a slow-motion shell.  usca 2.0 × 3.65 = 7.3 ⇒
    #     it is the DOMINANT visible mass in docs/_reference/w3x-shots/saber/,
    #     ⛔ not the ReviveHuman core (0.2 × 2.65 = 0.53).
    #   h01P「野戰電子砲」Awaken — the WHOLE of 59-04 野戰型陽電子砲 (j:47757).
    #     ⚠️ It is a ground rune circle, ⛔ not a beam: docs/_reference/w3x-shots
    #     /eva01/ shows a magenta circle + rising ring and zero beams.
    "fragdriller": "Abilities\\Weapons\\FragDriller\\FragDriller.mdl",
    #   e003「特效」RedDragonMissile — 08-03 龍鬥氣砲咒文 的**唯一**視覺
    #     (j:28838 `i=1..10 × 150u` 沿施法方向,⭐ 全地圖唯一真的「沿線 N 具」)。
    #     ⛔ 在此之前它穿的是家族預設 `imported.netherstrike`,而那一份的五個
    #     primitive 全帶 baseColorFactor [0,0,0,0] ⇒ 08-03 從第一天起零像素。
    "reddragonmissile":
        "Abilities\\Weapons\\RedDragonBreath\\RedDragonMissile.mdl",
    "awaken": "Abilities\\Spells\\Other\\Awaken\\Awaken.mdl",
}


def read_stock(path: str) -> tuple[str, bytes] | None:
    """(archive name, bytes) for a stock asset, honouring StormLib order."""
    for cand in (path, path[:-4] + ".mdx" if path.lower().endswith(".mdl") else path):
        for name in STOCK_MPQS:
            full = os.path.join(STOCK_MPQ_DIR, name)
            if not os.path.exists(full):
                continue
            arc = W3XArchive(full)
            try:
                if arc.has_file(cand):
                    b = arc.read_file(cand)
                    if b:
                        return name, b
            except Exception:
                pass
            finally:
                arc.close()
    return None


def texture_shape_report(raw: bytes) -> list[dict]:
    """Trap ①: say, per texture, whether the SHAPE lives in RGB or in alpha.

    A texture whose RGB is flat white and whose alpha carries the silhouette is
    the `CartoonCloud` / `Dust5A` family — additive-blending its RGB paints
    solid white blocks, and dropping alpha paints the same block.
    """
    model = parse_mdx(raw)
    rows: list[dict] = []
    for tex in model.textures:
        if tex.replaceable_id or not tex.path:
            continue
        got = read_stock(tex.path)
        if got is None:
            rows.append({"texture": tex.path, "verdict": "NOT-FOUND"})
            continue
        img = decode_blp(got[1]).convert("RGBA")
        px = list(img.getdata())
        lum = [0.299 * r + 0.587 * g + 0.114 * b for r, g, b, _ in px]
        alpha = [a for *_, a in px]
        lstd, astd = statistics.pstdev(lum), statistics.pstdev(alpha)
        rows.append({
            "texture": tex.path,
            "size": list(img.size),
            "lumMean": round(statistics.mean(lum), 1),
            "lumStd": round(lstd, 1),
            "alphaMean": round(statistics.mean(alpha), 1),
            "alphaStd": round(astd, 1),
            # shape lives in alpha iff RGB is (near) flat AND alpha varies
            "verdict": "LUMA-KEY-NEEDED" if lstd < 1.0 and astd > 1.0
                       else "shape-in-rgb",
        })
    return rows


def emitter_alpha_report(raw: bytes) -> list[dict]:
    """Trap ②: report BOTH the birth alpha and the PEAK, so nobody concludes
    "invisible" from the birth value of a [0, 200, 0] segment track."""
    from w3xlib.particles import parse_particles
    out = []
    for e in parse_particles(raw).emitters2:
        seg = list(e.segment_alpha)
        out.append({"emitter": e.name, "segmentAlpha": seg,
                    "birth": seg[0], "peak": max(seg),
                    "verdict": "visible-at-peak" if max(seg) > 0 else "never-visible"})
    return out


def ribbon_report(raw: bytes) -> list[dict]:
    """GH#753 —— **RIBB（緞帶）那一半**，與 `emitter_alpha_report` 同一個形狀。

    ⚠️ 在此之前這支腳本 `grep -ic ribb` = **0**：解析器那一半早就在
    （`w3xlib.particles._parse_ribb`；`content/vfx/` 底下 56 份出貨 `ribbon@1`
    文件就是它的產物），⛔ 缺的只是**這個轉換入口從來沒問過它**。於是一顆帶
    8 條緞帶的 stock 模型（`MarkOfChaosTarget`）轉進來以後，轉檔紀錄上一個字
    都沒提到那 8 條 —— #699 的 Non-goals 說「RIBB 另票」，而那張票直到 #753
    才存在。

    ⭐ 判準沿用陷阱②：**看峰值，⛔ 不看出生值**。緞帶「畫不出像素」有**三種
    互相獨立**的死法，三種各自回答（⛔ 不要只答一種就說它可見）：

      · `alphaPeak == 0` —— KRAL 動軌（有的話）或固定塊的 alpha
      · `visibilityPeak == 0` —— KRVS 把整條緞帶關掉
      · `width == 0`（heightAbove + heightBelow）—— ⭐ PRE2 **沒有**的第三種：
        一條零寬的緞帶是一條**零面積**的帶子，alpha 再高也畫不出東西。

    ⛔ 這裡不出 `ribbon@1` 文件（那是 `extract_particles.py` 的出口，#753 Scope ②）
    —— 這一層負責的是**讓轉換入口看得見它們**，並且把「哪幾條值得出」量出來。
    """
    from w3xlib.particles import parse_particles
    out = []
    for rb in parse_particles(raw).ribbons:
        def peak(tag: str, fallback: float) -> tuple[float, float, bool]:
            tr = rb.tracks.get(tag)
            keys = [v for _, v in tr.keys] if tr is not None and tr.keys else []
            if not keys:
                return fallback, fallback, False
            return keys[0], max(keys), True

        birth_a, peak_a, animated_a = peak("KRAL", float(rb.alpha))
        _, peak_v, animated_v = peak("KRVS", 1.0)
        width = float(rb.height_above) + float(rb.height_below)
        reasons = []
        if peak_a <= 0:
            reasons.append("alpha 峰值 0")
        if peak_v <= 0:
            reasons.append("KRVS 可見度峰值 0")
        if width <= 0:
            reasons.append("寬度 0（heightAbove+heightBelow）")
        out.append({
            "ribbon": rb.name,
            "alphaBirth": round(birth_a, 4), "alphaPeak": round(peak_a, 4),
            "alphaAnimated": animated_a,
            "visibilityPeak": round(peak_v, 4), "visibilityAnimated": animated_v,
            "width": round(width, 4),
            "lifespanSec": round(float(rb.lifespan), 4),
            "emissionRate": rb.emission_rate,
            "textureSlot": rb.texture_slot, "materialId": rb.material_id,
            "rows": rb.rows, "cols": rb.cols,
            "trackTags": sorted(rb.tracks.keys()),
            **({"parseNote": rb.parse_note} if rb.parse_note else {}),
            "verdict": "visible-at-peak" if not reasons else "never-visible: " + " / ".join(reasons),
        })
    return out


def emitter_inventory(names: list[str]) -> int:
    """`--inventory` —— #753 Scope ① 的**盤點表**：每一顆 stock 模型有幾條
    PRE2、幾條 RIBB，以及每一條緞帶畫不畫得出像素。

    ⭐ 唯讀：⛔ 一個位元組都不寫（同 GH#769 的立場 —— 一份「沒發生過的事實」
    寫進紀錄，比沒有紀錄更糟）。它也**不做幾何轉換**，所以盤點 20 列只要幾秒，
    ⛔ 不必為了數一數緞帶而跑一次 `convert_all`。

    ⭐ 判準是「按擋住幾支排序」（第〇·五守則）：先數出每一顆模型各有幾條
    RIBB，再決定 `extract_particles.py` 的 `ribbon@1` 出口先接哪一顆 ——
    ⛔ 不是逐顆硬寫。
    """
    from w3xlib.particles import parse_particles
    rows: list[dict] = []
    for name in names:
        got = read_stock(STOCK_MODELS[name])
        if got is None:
            rows.append({"name": name, "verdict": "not-in-mpq",
                         "path": STOCK_MODELS[name]})
            continue
        archive, raw = got
        m = parse_particles(raw)
        ribbons = ribbon_report(raw)
        rows.append({
            "name": name, "archive": archive, "mdxBytes": len(raw),
            "path": STOCK_MODELS[name],
            "pre2Count": len(m.emitters2), "ribbCount": len(m.ribbons),
            "ribbVisible": sum(1 for r in ribbons if r["verdict"] == "visible-at-peak"),
            "emitterAlpha": emitter_alpha_report(raw),
            "ribbons": ribbons,
            **({"parseNotes": m.notes} if m.notes else {}),
        })
    print(json.dumps(rows, ensure_ascii=False, indent=1))
    print(f"\n{'模型':24} {'PRE2':>5} {'RIBB':>5} {'RIBB 畫得出來':>13}")
    for r in rows:
        if r.get("verdict") == "not-in-mpq":
            print(f"{r['name']:24} {'—':>5} {'—':>5} {'not-in-mpq':>13}")
            continue
        print(f"{r['name']:24} {r['pre2Count']:>5} {r['ribbCount']:>5} "
              f"{r['ribbVisible']:>13}")
    missing = [r["name"] for r in rows if r.get("verdict") == "not-in-mpq"]
    if missing:
        print(f"\n⛔ 讀不到（零售 MPQ 不在 W3X_STOCK_MPQ_DIR）：{missing}",
              file=sys.stderr)
    return 1 if missing else 0


def gltf_json_bytes(b: bytes) -> dict:
    off = 12
    while off + 8 <= len(b):
        ln, ty = struct.unpack_from("<II", b, off)
        off += 8
        if ty == 0x4E4F534A:
            return json.loads(b[off:off + ln].decode("utf8"))
        off += ln
    return {}


def lit_materials(g: dict) -> set[int]:
    """Mirror of modelFxStagingContract ⑥'s litMaterials()."""
    lit = set()
    for i, m in enumerate(g.get("materials", [])):
        pbr = m.get("pbrMetallicRoughness", {})
        if "baseColorTexture" in pbr or "baseColorFactor" not in pbr:
            lit.add(i)
        elif (pbr["baseColorFactor"][3] if len(pbr["baseColorFactor"]) > 3
              else 1) > 0:
            lit.add(i)
    return lit


def visible_prims(g: dict) -> tuple[int, int]:
    """Mirror of modelFxStagingContract ⑥'s visiblePrimitives()."""
    lit = lit_materials(g)
    vis = tot = 0
    for mesh in g.get("meshes", []):
        for p in mesh.get("primitives", []):
            tot += 1
            if "material" not in p or p["material"] in lit:
                vis += 1
    return vis, tot


# ── ⭐ GH#767 —— 「幾何基準」要**只算畫得出來的幾何** ─────────────────────────
# ⚠️ `visible_prims()` 問的是一個**名詞**（這份模型有沒有任何一片畫得出來），
# 而缺陷住在**關係**：被拿來當長軸／縮放基準的那一片**自己**是不是看得見。
# 實測（2026-08-26，出貨的 `revivehuman.glb`）：含隱形面片的包圍盒是
# 10.751 × 16.757 × 10.751（長軸 y），⛔ 而 y 那一格 53% 由一片
# `baseColorFactor [0,0,0,0]` 的面片貢獻；只算可見幾何是 7.817 × 5.127 × 7.817
# —— **y 從最長變成最短**。⇒ `fxLongAxis:"y"` 與 `scaleAxis` 都在拉一個看不見的東西。
def _node_matrix(node: dict) -> list[list[float]]:
    if "matrix" in node:
        m = node["matrix"]
        return [m[0:4], m[4:8], m[8:12], m[12:16]]
    tx, ty, tz = node.get("translation", [0, 0, 0])
    x, y, z, w = node.get("rotation", [0, 0, 0, 1])
    sx, sy, sz = node.get("scale", [1, 1, 1])
    rot = [
        [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w)],
        [2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w)],
        [2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)],
    ]
    sc = (sx, sy, sz)
    cols = [[rot[i][k] * sc[i] for k in range(3)] + [0.0] for i in range(3)]
    cols.append([tx, ty, tz, 1.0])
    return cols


def _mat_mul(a, b):
    return [[sum(a[k][r] * b[c][k] for k in range(4)) for r in range(4)]
            for c in range(4)]


def _mat_apply(m, p):
    return [sum(m[k][r] * p[k] for k in range(3)) + m[3][r] for r in range(3)]


_IDENT4 = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]


def extents(g: dict, visible_only: bool) -> list[float] | None:
    """rest-pose bbox 邊長 [x, y, z]（accessor 的 min/max，⛔ 不解頂點）。"""
    lit = lit_materials(g)
    nodes, meshes, accs = (g.get("nodes", []), g.get("meshes", []),
                           g.get("accessors", []))
    lo, hi = [math.inf] * 3, [-math.inf] * 3

    def visit(idx: int, parent):
        node = nodes[idx]
        mat = _mat_mul(parent, _node_matrix(node))
        if "mesh" in node:
            for prim in meshes[node["mesh"]].get("primitives", []):
                if visible_only and "material" in prim and prim["material"] not in lit:
                    continue
                ai = prim.get("attributes", {}).get("POSITION")
                if ai is None:
                    continue
                acc = accs[ai]
                if "min" not in acc or "max" not in acc:
                    continue
                mn, mx = acc["min"], acc["max"]
                for corner in range(8):
                    pt = [mx[k] if (corner >> k) & 1 else mn[k] for k in range(3)]
                    world = _mat_apply(mat, pt)
                    for k in range(3):
                        lo[k] = min(lo[k], world[k])
                        hi[k] = max(hi[k], world[k])
        for child in node.get("children", []):
            visit(child, mat)

    scenes = g.get("scenes", [])
    roots = scenes[g.get("scene", 0)]["nodes"] if scenes else range(len(nodes))
    for r in roots:
        visit(r, _IDENT4)
    if math.isinf(lo[0]):
        return None
    return [round(hi[k] - lo[k], 4) for k in range(3)]


def geometry_basis(g: dict) -> dict:
    """含隱形 vs 只算可見 —— 兩份包圍盒與各自的長軸，外加**關係**那一欄。"""
    full = extents(g, False)
    vis = extents(g, True)
    row: dict = {"fullExtents": full, "visibleExtents": vis}
    if full:
        row["fullLongAxis"] = "xyz"[max(range(3), key=lambda k: full[k])]
    if vis:
        k = max(range(3), key=lambda i: vis[i])
        row["visibleLongAxis"] = "xyz"[k]
        # ⭐ 這一格就是關係：含隱形的長軸，有多少是可見幾何撐出來的。
        fk = "xyz".index(row["fullLongAxis"])
        row["longAxisVisibleFrac"] = (
            round(vis[fk] / full[fk], 4) if full[fk] > 1e-9 else 0.0)
        row["basisAgrees"] = row["visibleLongAxis"] == row["fullLongAxis"]
    return row


#: 含隱形的長軸,至少要有這麼多比例是**可見**幾何撐出來的,否則這一份 .glb 的
#: 「長軸／縮放基準」是在描述一個看不見的東西 ⇒ 拒絕安裝。
#: ⚠️ 這是**關係**不是名詞:一份 3/4 可見的模型照樣可以中這一條(出貨的
#: `revivehuman.glb` 就是 —— 4 片有 3 片畫得出來,而長軸那一格只有 31% 是可見的)。
LONG_AXIS_VISIBLE_MIN = 0.5


def head_bytes(path: str) -> bytes | None:
    rel = os.path.relpath(path, ROOT)
    r = subprocess.run(["git", "show", f"HEAD:{rel}"], cwd=ROOT,
                       capture_output=True)
    return r.stdout if r.returncode == 0 else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("names", nargs="*", help="slug(s) from the table")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--check", action="store_true",
                    help="對帳:每一筆轉檔紀錄都要對得上磁碟上的 .glb（GH#769）")
    ap.add_argument("--inventory", action="store_true",
                    help="盤點 PRE2/RIBB 條數（唯讀,不轉檔,不寫任何檔）—— GH#753")
    args = ap.parse_args()

    if args.check:
        return check_records()

    if _CONVERT_IMPORT_ERROR is not None:
        print(f"⛔ 轉檔用的相依載不起來（{_CONVERT_IMPORT_ERROR}）。"
              "⭐ `--check` 不需要它們，其餘子指令需要 —— 裝一份與這個直譯器"
              "同架構的 Pillow 再跑一次。", file=sys.stderr)
        return 2

    if args.list or (not args.names and not args.inventory):
        for k, v in STOCK_MODELS.items():
            print(f"{k:24} {v}")
        return 0

    unknown = [n for n in args.names if n not in STOCK_MODELS]
    if unknown:
        print(f"unknown slug(s): {unknown}; see --list", file=sys.stderr)
        return 2

    # GH#753 —— ⭐ 唯讀盤點，⛔ 不落到底下那條會寫檔的轉換路徑。
    # 沒點名 slug 就盤點整張表（`--inventory` 的預設分母是「全部」）。
    if args.inventory:
        return emitter_inventory(list(args.names) or list(STOCK_MODELS))

    tmp = tempfile.mkdtemp(prefix="ggd-stock-convert-")
    raw_dir = os.path.join(tmp, "raw")
    glb_dir = os.path.join(tmp, "glb")
    tex_dir = os.path.join(tmp, "tex")
    os.makedirs(raw_dir, exist_ok=True)

    rows: list[dict] = []
    wanted: set[str] = set()
    for name in args.names:
        got = read_stock(STOCK_MODELS[name])
        if got is None:
            rows.append({"name": name, "verdict": "not-in-mpq",
                         "path": STOCK_MODELS[name]})
            continue
        archive, raw = got
        with open(os.path.join(raw_dir, name + ".mdx"), "wb") as f:
            f.write(raw)
        wanted.add(name)
        rows.append({"name": name, "archive": archive, "mdxBytes": len(raw),
                     "path": STOCK_MODELS[name],
                     "textures": texture_shape_report(raw),
                     "emitterAlpha": emitter_alpha_report(raw),
                     # GH#753 —— 緞帶那一半。⛔ 在此之前這個入口對 RIBB 完全
                     # 失明（`grep -ic ribb` = 0）,轉檔紀錄因此**看起來完整**
                     # 而少了一整族 emitter。
                     "ribbons": ribbon_report(raw)})

    if not wanted:
        print("nothing extracted", file=sys.stderr)
        return 1

    # ⭐ GH#767 —— 這張表**每一列**都是 `Abilities\\Spells\\…` 一族的
    #    **特效**模型（⛔ 沒有一列是可玩角色）⇒ replaceableId-2 的隊伍發光
    #    在這裡是**主體本身**，⛔ 不是角色肩膀上的色塊 ⇒ 政策 `"lit"`。
    #    地圖角色那條路（`import_w3x.py`）維持 `"drop"`，⛔ 沒有動到。
    report = convert_all(raw_dir, glb_dir, tex_dir, only=wanted,
                         team_glow="lit")
    by_name = {e.get("name"): e for e in report if e.get("name")}

    installed, failed = [], []
    for row in rows:
        name = row["name"]
        if name not in wanted:
            failed.append(name)
            continue
        entry = by_name.get(name)
        new_p = os.path.join(glb_dir, name + ".glb")
        if entry is None or entry.get("status") != "ok" or not os.path.exists(new_p):
            row["verdict"] = "convert-failed"
            row["error"] = (entry or {}).get("error", "no output")
            failed.append(name)
            continue
        g = gltf_json(new_p)
        nv, nt = visible_prims(g)
        anims = [a.get("name") for a in g.get("animations", [])]
        row.update({
            "glbSize": entry.get("glb_size"),
            "rawHeight": entry.get("raw_height"),
            "scaleFactor": entry.get("scale_factor"),
            "height": entry.get("height"),
            "visiblePrims": f"{nv}/{nt}",
            "animations": anims,
            "clipMap": entry.get("clip_map"),
            "missingTextures": entry.get("missing_textures", []),
            "droppedGlowMaterials": entry.get("dropped_glow_materials"),
            "litGlowMaterials": entry.get("lit_glow_materials"),
            **geometry_basis(g),
        })
        # ⭐ 關係型閘：被當成長軸的那一軸，必須真的由**畫得出來的**幾何撐出來。
        #    ⛔ 「有幾片畫得出來」不夠 —— 那是名詞。
        frac = row.get("longAxisVisibleFrac")
        if frac is not None and frac < LONG_AXIS_VISIBLE_MIN:
            row["verdict"] = (
                f"長軸 {row['fullLongAxis']} 只有 {frac:.0%} 由可見幾何撐出來"
                f"（< {LONG_AXIS_VISIBLE_MIN:.0%}）—— REFUSING to install")
            failed.append(name)
            continue
        if nv < 1:
            row["verdict"] = "zero-pixel — REFUSING to install"
            failed.append(name)
            continue
        ship_p = os.path.join(SHIP, name + ".glb")
        hb = head_bytes(ship_p)
        if hb is not None:
            og = gltf_json_bytes(hb)
            ov, ot = visible_prims(og)
            oa = [a.get("name") for a in og.get("animations", [])]
            row["baseline@HEAD"] = f"{ov}/{ot} visible prims, {len(oa)} anims"
            if nv < ov or len(anims) < len(oa):
                row["verdict"] = "regression vs HEAD — REFUSING to install"
                failed.append(name)
                continue
        row["verdict"] = "ok"
        if not args.dry_run:
            os.makedirs(SHIP, exist_ok=True)
            with open(ship_p, "wb") as f:
                f.write(open(new_p, "rb").read())
            row["installed"] = os.path.relpath(ship_p, ROOT)
        installed.append(name)

    # ⛔⛔ GH#769 —— `--dry-run` **一個位元組都不寫**。
    #
    # 在此之前這個迴圈是無條件的:一次 dry-run 照樣把 `convert-<slug>.json` 寫出去,
    # 而那份紀錄的 `verdict` 是 **"ok"**。⇒ 紀錄上寫著「這顆模型已經用政策 X 轉過」,
    # 而**磁碟上的 .glb 一個位元組都沒變**。下一輪(或下一條 lane)讀到的是一個
    # **沒發生過的事實**,而它與真的發生過的長得幾乎一模一樣 —— 差別只有
    # `installed` 這個鍵**不在**,也就是一個**缺席**。
    # ⚠️ 更糟的是它會**覆蓋**一份真的紀錄:真跑過的 `installed` 會被 dry-run 洗掉。
    # ⭐ 要留痕就留在 stdout(下面那行 json.dumps 本來就印全文)。
    if not args.dry_run:
        os.makedirs(OUT, exist_ok=True)
        for row in rows:
            with open(os.path.join(OUT, f"convert-{row['name']}.json"), "w",
                      encoding="utf-8") as f:
                json.dump(row, f, ensure_ascii=False, indent=1)
    print(json.dumps(rows, ensure_ascii=False, indent=1))
    if args.dry_run:
        print(f"\n(dry-run) would-install={installed} failed={failed}"
              f"  —— ⛔ nothing copied AND no record written to "
              f"{os.path.relpath(OUT, ROOT)}/ (GH#769); the JSON above is the "
              f"whole trace.")
    else:
        print(f"\ninstalled={installed} failed={failed}")
    return 1 if failed else 0


def check_records() -> int:
    """`--check` —— 每一筆轉檔紀錄都要對得上一顆**磁碟上真的存在**的 .glb（GH#769）。

    ⭐ 這是**兩個名詞的關係**:缺陷不在紀錄、也不在 .glb,而在兩者對不上 ——
    分別檢查每一半都會是綠的(紀錄格式正確、.glb 也是好的)。

    ⚠️ 刻意**不比 mtime**:`git checkout` 會把工作樹每一個檔的 mtime 重設成簽出當下,
    所以一條 mtime 相等的斷言在乾淨簽出的樹上必定紅 —— 那會是一條被放寬或被關掉的閘,
    而被關掉的閘等於沒有閘。⭐ 能查的關係是「紀錄宣稱安裝了 ⇒ 那個檔真的在」。
    """
    import glob as _glob
    bad: list[str] = []
    recs = sorted(_glob.glob(os.path.join(OUT, "convert-*.json")))
    for p in recs:
        rel = os.path.relpath(p, ROOT)
        try:
            row = json.load(open(p, encoding="utf-8"))
        except Exception as e:
            bad.append(f"{rel}: 讀不了（{e}）")
            continue
        name = row.get("name") or os.path.basename(p)[len("convert-"):-len(".json")]
        inst = row.get("installed")
        if inst is None:
            if row.get("verdict") == "ok":
                bad.append(
                    f"{rel}: verdict=ok 卻**沒有 `installed`** —— 這是一筆 dry-run "
                    f"留下的幽靈紀錄（GH#769）。重跑 `convert_stock_model.py {name}`"
                    f"（⛔ 不加 --dry-run），或刪掉這一筆。")
            continue
        if not os.path.exists(os.path.join(ROOT, inst)):
            bad.append(f"{rel}: 宣稱裝了 {inst},而**那個檔不在磁碟上**。")
    for b in bad:
        print(f"✗ {b}", file=sys.stderr)
    print(f"{'✗' if bad else '✓'} 轉檔紀錄 {len(recs)} 筆,對不上 {len(bad)} 筆")
    return 1 if bad else 0


def gltf_json(path: str) -> dict:
    return gltf_json_bytes(open(path, "rb").read())


if __name__ == "__main__":
    raise SystemExit(main())
