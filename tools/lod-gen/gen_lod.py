#!/usr/bin/env python3
"""
gen_lod — generate `<name>-mid.glb` / `<name>-small.glb` LOD tiers (task #115).

    python3 tools/lod-gen/gen_lod.py            # match-relevant corpus, both tiers
    python3 tools/lod-gen/gen_lod.py --dry-run  # report only, write nothing
    python3 tools/lod-gen/gen_lod.py content/assets/models/hex/tower_blue.glb
    pnpm lod:build                              # ⭐ manifest-only re-measure (⛔ never decimates)
    pnpm lod:check                              # ⭐ freshness gate, byte-for-byte, writes nothing

⭐⭐ THREE MODES, and the middle one exists because the other two are unusable as a gate
(GH#979, 2026-09-05).

| mode | what it touches | cost |
|---|---|---|
| (default) | re-decimates and **overwrites every** `-mid`/`-small` .glb, then the manifest | minutes |
| `--manifest-only` | ⭐ **read-only over the .glb** — statSize + `Glb.triangles()` on the files ALREADY named by the manifest, then rewrites `_lod.json` | ~1 s |
| `--dry-run` | writes nothing at all — ⛔ including the manifest, and its sizes are ESTIMATES | minutes |

⚠️ ⭐ **Why `--manifest-only` had to exist**: Codex `35b231ef3` re-emitted 69 shipped .glb
(a material-metadata repair — `tools/vfx-asset-safety/repair_material_metadata.py`).
16 manifest rows went stale on `bytes`. ⛔ The only way to refresh them was a full run,
which would have **overwritten the 6 repaired tier files** with fresh decimations of the
repaired bases — i.e. the fix would have silently undone part of the commit it was fixing.
⭐ And the repair is provably geometry-preserving: re-measuring every row gives
**16 byte deltas and 0 triangle deltas**, so the tier files on disk are still honest
decimations of their bases. That is what makes a pure re-measure the CORRECT repair here,
⛔ not merely the cheap one.

⚠️ ⭐ **What `--manifest-only` cannot see** (say it out loud, ⛔ do not let the green mislead):
it proves `bytes`/`triangles` match the bytes on disk. It ⛔ **cannot** prove a `-mid.glb`
is a decimation of *today's* base — swap a base for a different MODEL and the re-measure
is happily green. That class needs the full run.

WHAT A TIER ACTUALLY CUTS, and why all three levers are needed.

Measured over the shipping corpus (163 .glb, 36.53 MB) the bytes split:
  images 12.15 MB · vertex attrs 9.00 MB · animation 7.20 MB · indices 1.13 MB
A geometry-only LOD — which is what "decimate the models" sounds like — can
therefore only ever reach 28% of the payload. So each tier pulls three levers:

  1. GEOMETRY  QEM half-edge collapse (see decimate.py) to a target triangle
               ratio. Seam- and boundary-preserving, so it is safe on skinned
               characters; the price is that seam-heavy w3x imports under-reduce.
  2. TEXTURES  integer box-downscale of every embedded PNG, floored at 64px so a
               tier never destroys a face. WebP is passed through untouched (no
               stdlib decoder; the only webp in the corpus is the login dragon,
               which is not in a match).
  3. ANIMATION `small` only, and only for models whose model@1 doc declares a
               clipMap: keep the clips the runtime can actually reach and drop
               the rest. KayKit characters ship 16 clips and the game plays 6.
               Never applied to a model without a doc — an arena prop's groups
               are played by name we do not own.

The whole buffer is REPACKED, not patched: after a collapse the accessor counts
move, interleaved views would need surgery, and orphaned bytes would still ship.
"""

from __future__ import annotations

# ⭐⭐ 戶籍（GH#979）—— `merge-io.mjs` / `reconcile.mjs` 的 `staticWrites()` 會收割這一行。
#   ⛔ 在此之前 `_lod.json` **沒有任何擁有者**：genguard 說「沒有產生器擁有者」、
#   隔離區不鎖它、`package.json` 沒有 `lod:*`（而這個檔頭在說「下一次 `pnpm lod:gen`」）
#   ⇒ 69 顆 .glb 被換掉而唯一叫出來的是一支 vitest（`modelLod.shipped.test.ts`）。
# ggd:writes content/assets/models/_lod.json

import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import glb as glb_mod  # noqa: E402
import png as png_mod  # noqa: E402
from decimate import decimate  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
MODELS_DIR = os.path.join(ROOT, "content", "assets", "models")
MANIFEST_PATH = os.path.join(MODELS_DIR, "_lod.json")

ARRAY_BUFFER = 34962
ELEMENT_ARRAY_BUFFER = 34963

# Tier knobs. `tris` is the QEM target ratio, `tex` the texture downscale
# divisor, `strip_anim` the doc-gated clip cull.
TIERS = {
    "mid": {"tris": 0.55, "tex": 2, "min_edge": 128, "strip_anim": False},
    "small": {"tris": 0.28, "tex": 4, "min_edge": 64, "strip_anim": True},
}


# A model this small has nothing left to decimate: a tier file would add a
# request and a manifest row to save nothing, and would be a LIE in the #115
# manifest ("this is the cheap version" when it is the same thing).
#
# This floor exists because of #226. The four champion stand-ins became
# generated ~168-triangle / ~51 KB box-men (tools/voxel-gen), and their tier
# rows were deliberately removed from _lod.json. Without a floor here, the next
# `pnpm lod:gen` would see role == "champion" in report.json, pull them back in
# and silently re-create fake tiers — undoing a deliberate decision with no
# review. A model below EITHER bound legitimately ships ONE tier.
LOD_FLOOR_TRIS = 1500
LOD_FLOOR_BYTES = 64 * 1024


# --------------------------------------------------------------------- corpus
def match_corpus() -> list[str]:
    """
    The models a MATCH can put on screen — champions, arena decor, the guardian
    objectives and the intermission market. Deliberately NOT the whole tree: 74
    of the 163 .glb are unreferenced w3x effect remnants (audit #61), and
    decimating those would be pure churn.

    Models under LOD_FLOOR_TRIS / LOD_FLOOR_BYTES are skipped — see the note on
    those constants; that is the correct state, not missing work.
    """
    report_path = os.path.join(MODELS_DIR, "..", "model-budget", "report.json")
    paths: set[str] = set()
    try:
        report = json.load(open(report_path))
        for model in report.get("models", []):
            if model.get("role") in ("champion", "arena-decor", "hero-prop", "intermission-prop"):
                rel = model["path"]
                if not rel.startswith("assets/models/"):
                    continue
                if (
                    model.get("triangles", 0) < LOD_FLOOR_TRIS
                    and model.get("fileBytes", 0) < LOD_FLOOR_BYTES
                ):
                    continue  # below the LOD floor — one tier is correct
                paths.add(os.path.join(ROOT, "content", rel))
    except (OSError, ValueError):
        pass
    # The guardians are live combat objectives that the budget report misfiles as
    # role="unused" (its own defect, logged in #61) — include them explicitly so
    # a report bug cannot silently drop three of the five arena centrepieces.
    guardians = os.path.join(MODELS_DIR, "guardians")
    if os.path.isdir(guardians):
        for name in os.listdir(guardians):
            if name.endswith(".glb"):
                paths.add(os.path.join(guardians, name))
    return sorted(p for p in paths if os.path.isfile(p) and not is_tier_file(p))


TIER_SUFFIX = re.compile(r"-(mid|small)\.glb$")


def is_tier_file(path: str) -> bool:
    return bool(TIER_SUFFIX.search(path))


def doc_clipmaps() -> dict[str, set[str]]:
    """glbPath → every clip name any model@1 doc / override can ask for."""
    wanted: dict[str, set[str]] = {}

    def absorb(glb_path: str, clip_map) -> None:
        if not glb_path or not isinstance(clip_map, dict):
            return
        wanted.setdefault(glb_path, set()).update(
            str(v).lower() for v in clip_map.values() if isinstance(v, str)
        )

    docs_dir = os.path.join(ROOT, "content", "models")
    for name in sorted(os.listdir(docs_dir)):
        if not name.endswith(".json") or name.startswith("_"):
            continue
        try:
            doc = json.load(open(os.path.join(docs_dir, name)))
        except ValueError:
            continue
        absorb(doc.get("glbPath", ""), doc.get("clipMap"))

    overrides_path = os.path.join(docs_dir, "_standin-overrides.json")
    if os.path.isfile(overrides_path):
        try:
            data = json.load(open(overrides_path))
            entries = data.get("overrides", data) if isinstance(data, dict) else {}
            values = entries.values() if isinstance(entries, dict) else entries
            for entry in values:
                if isinstance(entry, dict):
                    absorb(entry.get("glbPath", ""), entry.get("clipMap"))
        except (ValueError, AttributeError):
            pass
    return wanted


# ------------------------------------------------------------------- repacker
def build_tier(source: glb_mod.Glb, tier: str, keep_clips: set[str] | None):
    """Return (gltf, bin) for one tier. Pure — never touches disk."""
    knobs = TIERS[tier]
    src = source.gltf
    out = json.loads(json.dumps(src))  # deep copy of the node/material graph
    builder = glb_mod.BufferBuilder()
    accessors: list[dict] = []

    stats = {"tris_before": 0, "tris_after": 0, "tex_before": 0, "tex_after": 0, "clips_dropped": 0}

    # --- 1. animations (cull first so their accessors are simply not packed) --
    if knobs["strip_anim"] and keep_clips:
        kept = []
        for anim in out.get("animations", []):
            name = str(anim.get("name", "")).lower()
            if name in keep_clips or any(name.endswith("-" + c) or c in name for c in keep_clips):
                kept.append(anim)
            else:
                stats["clips_dropped"] += 1
        out["animations"] = kept

    # --- 2. meshes ----------------------------------------------------------
    packed_verbatim: dict[int, int] = {}

    def pack_verbatim(acc_index: int, target: int | None) -> int:
        if acc_index in packed_verbatim:
            return packed_verbatim[acc_index]
        acc = src["accessors"][acc_index]
        values = source.accessor_values(acc_index)
        new = glb_mod.pack_accessor(
            builder,
            accessors,
            values,
            acc["componentType"],
            acc["type"],
            target,
            with_bounds="min" in acc,
        )
        if acc.get("normalized"):
            accessors[new]["normalized"] = True
        if "name" in acc:
            accessors[new]["name"] = acc["name"]
        packed_verbatim[acc_index] = new
        return new

    for mesh in out.get("meshes", []):
        for prim in mesh["primitives"]:
            attrs = prim["attributes"]
            idx_values = source.accessor_values(prim["indices"])
            pos_index = attrs.get("POSITION")
            stats["tris_before"] += len(idx_values) // 3

            if pos_index is None:
                prim["indices"] = pack_verbatim(prim["indices"], ELEMENT_ARRAY_BUFFER)
                prim["attributes"] = {
                    k: pack_verbatim(v, ARRAY_BUFFER) for k, v in attrs.items()
                }
                stats["tris_after"] += len(idx_values) // 3
                continue

            positions = source.accessor_values(pos_index)
            uv_index = attrs.get("TEXCOORD_0")
            uvs = source.accessor_values(uv_index) if uv_index is not None else None
            new_indices = decimate(positions, idx_values, knobs["tris"], uvs)
            stats["tris_after"] += len(new_indices) // 3

            # compact: only vertices still referenced survive into the buffer
            used = sorted(set(new_indices))
            compact = {old: i for i, old in enumerate(used)}
            final_indices = [compact[v] for v in new_indices]
            # 16-bit indices whenever they fit — halves the index payload and is
            # what every exporter does; 5125 only when a primitive really needs it
            comp = 5123 if (len(used) - 1) <= 0xFFFF else 5125
            prim["indices"] = glb_mod.pack_accessor(
                builder, accessors, final_indices, comp, "SCALAR", ELEMENT_ARRAY_BUFFER
            )

            new_attrs = {}
            for name, acc_index in attrs.items():
                acc = src["accessors"][acc_index]
                n = glb_mod.NUM_COMPONENTS[acc["type"]]
                values = source.accessor_values(acc_index)
                gathered: list = []
                for old in used:
                    gathered.extend(values[old * n : old * n + n])
                new = glb_mod.pack_accessor(
                    builder,
                    accessors,
                    gathered,
                    acc["componentType"],
                    acc["type"],
                    ARRAY_BUFFER,
                    with_bounds=(name == "POSITION"),
                )
                if acc.get("normalized"):
                    accessors[new]["normalized"] = True
                new_attrs[name] = new
            prim["attributes"] = new_attrs


    # --- 3. remaining accessors (animation samplers, inverse bind matrices) ---
    for anim in out.get("animations", []):
        for sampler in anim["samplers"]:
            sampler["input"] = pack_verbatim(sampler["input"], None)
            sampler["output"] = pack_verbatim(sampler["output"], None)
    for skin in out.get("skins", []):
        if "inverseBindMatrices" in skin:
            skin["inverseBindMatrices"] = pack_verbatim(skin["inverseBindMatrices"], None)

    # --- 4. images -----------------------------------------------------------
    for image in out.get("images", []):
        if "bufferView" not in image:
            continue
        raw = source.view_bytes(image["bufferView"])
        stats["tex_before"] += len(raw)
        payload = raw
        if image.get("mimeType") == "image/png":
            decoded = png_mod.decode(raw)
            if decoded is not None:
                factor = knobs["tex"]
                while factor > 1 and (
                    decoded.width // factor < knobs["min_edge"]
                    or decoded.height // factor < knobs["min_edge"]
                ):
                    factor //= 2
                if factor > 1:
                    candidate = png_mod.encode(png_mod.downscale(decoded, factor))
                    # a downscale that does not shrink the FILE is not a saving,
                    # it is just a blurrier texture — keep the original
                    if len(candidate) < len(raw):
                        payload = candidate
        stats["tex_after"] += len(payload)
        image["bufferView"] = builder.add_view(payload)

    out["accessors"] = accessors
    out["bufferViews"] = builder.views
    data = builder.data()
    out["buffers"] = [{"byteLength": len(data)}] if data else []
    return out, data, stats


# ------------------------------------------------------------- manifest bytes
# ⭐ ONE renderer for both modes. ⛔ Two `json.dump` call sites would drift, and a
#   byte-for-byte `--check` against a *differently formatted* writer is a gate that
#   is red for a reason nobody can act on.
def render_manifest(models: dict) -> str:
    # ⛔ 沒有 `generatedAt`（GH#395，判例 GH#389）。
    #
    # 這份 manifest 是**進版控的產物**，而且客戶端每一場都真的抓它
    # （`/content/assets/models/_lod.json`）。一格時鐘在這裡買不到任何東西：
    #   · 沒有人讀它 —— `render/modelLod.ts` 只讀 `tiers` 與 `models`;
    #   · 它讓「這份 manifest 有沒有過期」永遠不可能做成**逐位元組**的閘，
    #     而這支產生器的預設模式要跑幾分鐘 ⇒ 逐位元組是唯一負擔得起的檢查;
    #   · 每重跑一次就髒一次，稀釋 `git status` 這個訊號（2026-08-02 那次
    #     「未追蹤來源被烘進產物」的生產事故，靠的就是這個訊號被人看見）。
    # ⭐ 身分由**內容**給：`models` 逐檔帶著 bytes/tris，那才是可以比對的東西。
    manifest = {
        "schema": "lod@1",
        "generatedBy": "tools/lod-gen/gen_lod.py",
        "tiers": ["mid", "small"],
        "models": dict(sorted(models.items())),
    }
    # ⭐⭐ `ensure_ascii=False` —— ⛔ 這**不是**風格選擇，它是這條閘能不能成立的前提。
    #   量到的（GH#979，2026-09-05）:出貨的 `_lod.json` 裡 `quarantineNote` 帶著**字面的**
    #   `→`（GH#36 的判決是**手工**加進那一列的），⛔ 而 `json.dump` 預設會把它寫成
    #   `→` ⇒ ⭐ 一次「零資料變更」的重生成就會動 **36 行**，
    #   而一條每次都紅 36 行的逐位元組閘，下一個人的正確反應是**放寬它**。
    return json.dumps(manifest, indent=2, ensure_ascii=False) + "\n"


def load_manifest_models() -> dict:
    if not os.path.isfile(MANIFEST_PATH):
        return {}
    try:
        return json.load(open(MANIFEST_PATH)).get("models", {})
    except ValueError:
        return {}


def measure(rel: str) -> tuple[int, int]:
    """(bytes, triangles) of a content-relative .glb. ⭐ Opens it "rb" — read-only."""
    path = os.path.join(ROOT, "content", rel)
    return os.path.getsize(path), glb_mod.read(path).triangles()


def remeasure(models: dict) -> tuple[dict, list[str], list[str]]:
    """
    ⭐ Refresh `bytes`/`triangles` on every path the manifest ALREADY names.

    ⛔ Never decimates, never writes a .glb, never adds or drops a row — the row set
    is an editorial decision (see the LOD_FLOOR_* note: #226 deliberately removed rows
    and a regeneration that "helpfully" re-adds them undoes that with no review).

    Returns (models, changed, missing). ⚠️ `missing` is fail-loud, ⛔ not "drop the row":
    a vanished .glb is exactly the hazard `modelLod.ts` warns about (404 only on LOW/MEDIUM,
    swallowed by `loadUncached`, so only phones see it) — silently deleting the row would
    make that disappear from the manifest AND from the guard that reads the manifest.
    """
    out: dict = {}
    changed: list[str] = []
    missing: list[str] = []
    for rel, entry in models.items():
        e = dict(entry)  # ⭐ keep `quarantine` / `quarantineNote` — ⛔ this tool does not own them
        try:
            b, t = measure(rel)
        except OSError:
            missing.append(rel)
            out[rel] = e
            continue
        if e.get("bytes") != b or e.get("triangles") != t:
            changed.append(f"{rel}: {e.get('bytes')}B/{e.get('triangles')}tris → {b}B/{t}tris")
        e["bytes"], e["triangles"] = b, t
        for tier in ("mid", "small"):
            te = e.get(tier)
            if not isinstance(te, dict) or "path" not in te:
                continue
            te = dict(te)
            try:
                tb, tt = measure(te["path"])
            except OSError:
                missing.append(te["path"])
                e[tier] = te
                continue
            if te.get("bytes") != tb or te.get("triangles") != tt:
                changed.append(f"{te['path']}: {te.get('bytes')}B/{te.get('triangles')}tris → {tb}B/{tt}tris")
            te["bytes"], te["triangles"] = tb, tt
            e[tier] = te
        out[rel] = e
    return out, changed, missing


def manifest_only(check: bool) -> int:
    models = load_manifest_models()
    if not models:
        print("⛔ _lod.json 讀回空的 —— ⛔ 不要把「沒有 row」當成「沒有漂移」。", file=sys.stderr)
        return 2
    fresh, changed, missing = remeasure(models)
    if missing:
        print(f"⛔ manifest 指到 {len(missing)} 個不存在的檔（⛔ 我不會偷偷刪掉那幾列）:", file=sys.stderr)
        for m in missing:
            print(f"   · {m}", file=sys.stderr)
        return 2
    rendered = render_manifest(fresh)
    on_disk = open(MANIFEST_PATH, encoding="utf-8").read() if os.path.isfile(MANIFEST_PATH) else ""
    if check:
        if rendered == on_disk:
            print(f"✓ _lod.json 與磁碟上的 {len(models)} 顆模型一致（逐位元組）")
            return 0
        print(f"⛔ _lod.json 過期了 —— {len(changed)} 格與磁碟上的位元組對不上:", file=sys.stderr)
        for c in changed[:40]:
            print(f"   · {c}", file=sys.stderr)
        if len(changed) > 40:
            print(f"   … 另外 {len(changed) - 40} 格", file=sys.stderr)
        print("   ⇒ 跑 `pnpm lod:build`（⭐ 它只重量測，⛔ 不會重新 decimate 任何一顆 .glb）", file=sys.stderr)
        return 1
    with open(MANIFEST_PATH, "w") as fh:
        fh.write(rendered)
    print(f"✓ _lod.json 重量測完成:{len(models)} 顆模型,{len(changed)} 格更新")
    for c in changed:
        print(f"   · {c}")
    return 0


# ----------------------------------------------------------------------- main
def main() -> int:
    parser = argparse.ArgumentParser(description="Generate model LOD tiers (task #115)")
    parser.add_argument("paths", nargs="*", help="glb files (default: the match corpus)")
    parser.add_argument("--tier", choices=sorted(TIERS), action="append")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--quiet", action="store_true")
    parser.add_argument(
        "--manifest-only",
        action="store_true",
        help="⭐ re-measure bytes/triangles from the .glb already on disk; ⛔ never decimates",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="with --manifest-only: byte-for-byte freshness gate, writes nothing, exit 1 on drift",
    )
    args = parser.parse_args()

    if args.check and not args.manifest_only:
        # ⛔ fail-loud：一個被安靜忽略的 `--check` 會讓「閘」變成一次**完整的重新 decimate**。
        parser.error("--check 只在 --manifest-only 底下有意義（⛔ 完整模式沒有唯讀的比對法）")
    if args.manifest_only:
        if args.paths or args.tier or args.dry_run:
            parser.error("--manifest-only 不吃 paths / --tier / --dry-run（它重量測 manifest 上的每一列）")
        return manifest_only(args.check)

    tiers = args.tier or ["mid", "small"]
    sources = [os.path.abspath(p) for p in args.paths] or match_corpus()
    clipmaps = doc_clipmaps()

    manifest_models: dict[str, dict] = {}
    if os.path.isfile(MANIFEST_PATH):
        try:
            manifest_models = json.load(open(MANIFEST_PATH)).get("models", {})
        except ValueError:
            manifest_models = {}

    totals = {t: {"base": 0, "tier": 0, "tris_before": 0, "tris_after": 0} for t in tiers}
    for source_path in sources:
        rel = os.path.relpath(source_path, os.path.join(ROOT, "content")).replace(os.sep, "/")
        try:
            source = glb_mod.read(source_path)
        except (OSError, ValueError) as exc:
            print(f"  SKIP {rel}: {exc}", file=sys.stderr)
            continue
        base_bytes = os.path.getsize(source_path)
        keep = clipmaps.get(rel)
        entry = dict(manifest_models.get(rel, {}))
        entry["bytes"] = base_bytes
        entry["triangles"] = source.triangles()

        for tier in tiers:
            gltf, data, stats = build_tier(source, tier, keep)
            out_path = source_path[: -len(".glb")] + f"-{tier}.glb"
            out_rel = rel[: -len(".glb")] + f"-{tier}.glb"
            if args.dry_run:
                size = len(json.dumps(gltf, separators=(",", ":")).encode()) + len(data) + 28
            else:
                size = glb_mod.write(out_path, gltf, data)
            entry[tier] = {
                "path": out_rel,
                "bytes": size,
                "triangles": stats["tris_after"],
            }
            totals[tier]["base"] += base_bytes
            totals[tier]["tier"] += size
            totals[tier]["tris_before"] += stats["tris_before"]
            totals[tier]["tris_after"] += stats["tris_after"]
            if not args.quiet:
                print(
                    f"  {tier:5} {rel[14:]:44} "
                    f"{base_bytes/1024:8.1f}K → {size/1024:8.1f}K "
                    f"({100*size/base_bytes:5.1f}%)  tris {stats['tris_before']:6d}"
                    f" → {stats['tris_after']:6d}"
                    + (f"  -{stats['clips_dropped']} clips" if stats["clips_dropped"] else "")
                )
        manifest_models[rel] = entry

    if not args.dry_run:
        # ⭐ 同一支 renderer 服務兩個模式 —— 見 `render_manifest()` 的檔頭
        #   （⛔ 第二個 `json.dump` 呼叫點 = `--check` 會因為排版差異而紅，
        #    而那種紅沒有人修得動）。
        with open(MANIFEST_PATH, "w") as fh:
            fh.write(render_manifest(manifest_models))

    print(f"\n{len(sources)} models")
    for tier in tiers:
        t = totals[tier]
        if not t["base"]:
            continue
        print(
            f"  {tier:5}: {t['base']/1e6:6.2f} MB → {t['tier']/1e6:6.2f} MB "
            f"({100*t['tier']/t['base']:5.1f}%)   "
            f"tris {t['tris_before']:7d} → {t['tris_after']:7d} "
            f"({100*t['tris_after']/max(1,t['tris_before']):5.1f}%)"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
