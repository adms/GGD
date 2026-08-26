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
import os
import statistics
import struct
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from w3xlib.blp import decode_blp  # noqa: E402
from w3xlib.mdx import parse_mdx  # noqa: E402
from w3xlib.models import STOCK_MPQS, STOCK_MPQ_DIR, convert_all, slug  # noqa: E402
from w3xlib.mpq import W3XArchive  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
SHIP = os.path.join(ROOT, "content", "assets", "models", "imported")
OUT = os.path.join(HERE, "out", "stock")

# slug → in-archive path.  The census reports `.mdl`; the archives carry `.mdx`,
# so both spellings are tried.  Rows are added as each Phase-6 batch lands.
STOCK_MODELS: dict[str, str] = {
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
    "flamestrike1": "Abilities\\Spells\\Other\\Doom\\FlameStrike1.mdl",
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


def gltf_json_bytes(b: bytes) -> dict:
    off = 12
    while off + 8 <= len(b):
        ln, ty = struct.unpack_from("<II", b, off)
        off += 8
        if ty == 0x4E4F534A:
            return json.loads(b[off:off + ln].decode("utf8"))
        off += ln
    return {}


def visible_prims(g: dict) -> tuple[int, int]:
    """Mirror of modelFxStagingContract ⑥'s visiblePrimitives()."""
    lit = set()
    for i, m in enumerate(g.get("materials", [])):
        pbr = m.get("pbrMetallicRoughness", {})
        if "baseColorTexture" in pbr or "baseColorFactor" not in pbr:
            lit.add(i)
        elif (pbr["baseColorFactor"][3] if len(pbr["baseColorFactor"]) > 3
              else 1) > 0:
            lit.add(i)
    vis = tot = 0
    for mesh in g.get("meshes", []):
        for p in mesh.get("primitives", []):
            tot += 1
            if "material" not in p or p["material"] in lit:
                vis += 1
    return vis, tot


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
    args = ap.parse_args()

    if args.list or not args.names:
        for k, v in STOCK_MODELS.items():
            print(f"{k:24} {v}")
        return 0

    unknown = [n for n in args.names if n not in STOCK_MODELS]
    if unknown:
        print(f"unknown slug(s): {unknown}; see --list", file=sys.stderr)
        return 2

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
                     "emitterAlpha": emitter_alpha_report(raw)})

    if not wanted:
        print("nothing extracted", file=sys.stderr)
        return 1

    report = convert_all(raw_dir, glb_dir, tex_dir, only=wanted)
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
        })
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

    os.makedirs(OUT, exist_ok=True)
    for row in rows:
        with open(os.path.join(OUT, f"convert-{row['name']}.json"), "w",
                  encoding="utf-8") as f:
            json.dump(row, f, ensure_ascii=False, indent=1)
    print(json.dumps(rows, ensure_ascii=False, indent=1))
    print(f"\ninstalled={installed} failed={failed}"
          + ("  (dry-run: nothing copied)" if args.dry_run else ""))
    return 1 if failed else 0


def gltf_json(path: str) -> dict:
    return gltf_json_bytes(open(path, "rb").read())


if __name__ == "__main__":
    raise SystemExit(main())
