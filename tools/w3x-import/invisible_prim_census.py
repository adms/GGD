#!/usr/bin/env python3
"""Task #233 (B3) — census + cull-safety audit for INVISIBLE shipped primitives.

WHAT THESE ARE
--------------
166 primitives across 76 shipped .glb files carry a material whose
``baseColorFactor[3] == 0``. They are invisible in normal rendering, but they
still cost a draw call and a vertex buffer, and any *per-mesh* effect that
reads geometry rather than material alpha lights them up as solid polygons
(Babylon's ``mesh.renderOverlay`` / OutlineRenderer takes its colour+alpha from
the mesh, not from ``material.alpha`` — that was the visible bug).

They are NOT leftovers from Warcraft III. The converter creates them, in two
deliberate branches of ``w3xlib/gltf.py``:

  * ``TeamGlow*``            — replaceableId-2 team-colour billboards. gltf.py:
                               "coloured additive billboard we cannot tint -
                               drop it (fully transparent) so there is no gray
                               blob."                       (44 of the 166)
  * additive glow w/o alpha  — filter_mode >= 3 glow geometry whose texture has
                               no alpha channel. gltf.py: "solid bright-on-black
                               glow: no alpha to key on -> drop the quad rather
                               than paint a black slab."   (122 of the 166)

Both are SOFT deletes: the geometry survives, only its alpha goes to zero. This
tool exists to answer whether they can be turned into HARD deletes.

THE ANSWER IS "NOT BLANKET-SAFE" — see docs/invisible-primitive-audit.md.
Of the 124 primitives whose source MDX could be located and whose geoset could
be identified, 67 (54%) sit on a geoset that WC3 animates VISIBLE via a
GEOA/KGAO alpha track — in sequences the game actually plays (Stand / Walk /
Attack / Spell / Birth / Death). Culling those is not a cleanup, it is deleting
content that a later converter fix (#59) is supposed to restore. Examples:
``N00B`` (小叮噹) has 9 such primitives visible only during Attack/Spell;
``negi`` and ``pika`` hide their whole attack flash the same way.

So the cull is a POLICY, not a behaviour: ``invisible_prim_policy.json`` holds
the switch, it defaults to ``cull: "off"``, and ``"safe"`` still refuses to
touch anything with a visibility animation or without MDX proof.

⭐ GH#770 —— 上面那 44 個 ``TeamGlow*`` 面**不必**走這條事後刪除的路了。
同一份政策檔多了一格 ``characterTeamGlow``（``keep`` / ``cull``，出貨值 ``cull``；
⚠️ ⛔ **沒有 ``lit``** —— 它在角色那條路上會靜默退化成 ``keep``，成因與反駁條件
逐條寫在 ``w3xlib.gltf.CHARACTER_TEAM_GLOW_EXCLUDED``）：那是**轉檔器**的旋鈕，
它讓那一片幾何**一開始就不要被造出來**
（``w3xlib.gltf.resolve_team_glow``）。⚠️ 兩格**不是同一件事** ——
``cull`` 管「已經烘好的檔要不要動」，``characterTeamGlow`` 管「下一次烘的時候
要不要造」。⇒ 旋鈕翻了而產線還沒重跑的那段期間，這支 CLI 會印一行
``PENDING RE-BAKE`` 說出落差（⛔ 不會靜默）。

Usage
-----
    python3 invisible_prim_census.py                     # census + verdict
    python3 invisible_prim_census.py --json out.json     # machine-readable
    python3 invisible_prim_census.py --apply             # honour the policy

``--apply`` is a no-op while the policy says ``cull: "off"``. It NEVER edits a
.glb unless the policy explicitly enables culling; it rewrites files in place
using strip_geoset_prims.strip() (full mark-and-sweep of orphaned accessors /
materials / textures / images, BIN rebuilt).

Tests: invisible_prim_census_test.py (stdlib unittest, no deps).
"""

from __future__ import annotations

import argparse
import collections
import json
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)

POLICY_PATH = os.path.join(HERE, "invisible_prim_policy.json")

# Corpora scanned by the CLI. data/blizzard-overlay is the LOCAL-ONLY Blizzard
# model overlay (#10/#177); it is gitignored, so it is scanned when present and
# silently skipped otherwise.
GLB_ROOTS = [
    os.path.join(REPO, "content", "assets", "models"),
    os.path.join(REPO, "data", "blizzard-overlay", "models"),
]

REASON_TEAM_GLOW = "teamGlow"
REASON_ADDITIVE_GLOW = "additiveGlowNoAlpha"

# ⭐ GH#770 —— `characterTeamGlow` 的合法值、回退值與**判準**只有**一個住處**
# (`w3xlib.gltf`),這裡**引用**它。⛔ 不要在這裡抄一份字串或自己寫一次比對:
# 那會變成第二個住處,而兩份漂掉的時候沒有任何東西會紅(第〇·四守則)。
# ⚠️ 2026-08-29:被排除的值(`lit`)要回一句**指名原因**的訊息,⛔ 不是
# 「must be one of (…)」—— 後者會讓下一個人以為自己打錯字。
from w3xlib.gltf import (                                          # noqa: E402
    DEFAULT_CHARACTER_TEAM_GLOW,
    validate_character_team_glow,
)

DEFAULT_POLICY = {
    "schema": "invisible-prim-policy@1",
    "cull": "off",                              # off | safe | all
    "characterTeamGlow": DEFAULT_CHARACTER_TEAM_GLOW,   # keep | cull
    "reasons": {REASON_TEAM_GLOW: True, REASON_ADDITIVE_GLOW: True},
    "skipGeosetsWithVisibilityAnimation": True,
    "visibleAlphaThreshold": 0.01,
    "cullWithoutMdxProof": False,
}


def load_policy(path: str | None = None) -> dict:
    """Read the policy file over DEFAULT_POLICY. Missing file == defaults."""
    pol = json.loads(json.dumps(DEFAULT_POLICY))  # deep copy
    path = path or POLICY_PATH
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            raw = json.load(fh)
        for key, val in raw.items():
            if key.startswith("_"):
                continue                        # "_doc" style commentary
            if key == "reasons" and isinstance(val, dict):
                pol["reasons"].update(val)
            else:
                pol[key] = val
    if pol["cull"] not in ("off", "safe", "all"):
        raise ValueError(f"policy.cull must be off|safe|all, got {pol['cull']!r}")
    validate_character_team_glow(pol["characterTeamGlow"],
                                 "policy.characterTeamGlow")
    return pol


# ---------------------------------------------------------------------------
# census — pure functions over a parsed glTF dict
# ---------------------------------------------------------------------------

def is_invisible_material(mat: dict) -> bool:
    """True when this glTF material renders nothing (baseColorFactor alpha 0)."""
    bcf = mat.get("pbrMetallicRoughness", {}).get("baseColorFactor")
    return bool(bcf) and len(bcf) >= 4 and bcf[3] == 0


def drop_reason(mat: dict) -> str:
    """Which gltf.py branch produced this transparent material."""
    return (REASON_TEAM_GLOW
            if mat.get("name", "").lower().startswith("teamglow")
            else REASON_ADDITIVE_GLOW)


def invisible_prims(gltf: dict) -> list[dict]:
    """Every primitive whose material is fully transparent.

    ``prim`` is the index within the flattened primitive list, which is the
    order strip_geoset_prims.strip() indexes by and the order the converter
    emitted kept geosets in.
    """
    mats = gltf.get("materials", [])
    out: list[dict] = []
    idx = 0
    for mesh in gltf.get("meshes", []):
        for prim in mesh.get("primitives", []):
            mi = prim.get("material")
            if mi is not None and 0 <= mi < len(mats) and is_invisible_material(mats[mi]):
                out.append({
                    "prim": idx,
                    "material": mi,
                    "name": mats[mi].get("name", ""),
                    "reason": drop_reason(mats[mi]),
                })
            idx += 1
    return out


# ---------------------------------------------------------------------------
# MDX side — does WC3 ever show this geoset?
# ---------------------------------------------------------------------------

def geoset_visibility(mdx_bytes: bytes, threshold: float = 0.01) -> dict[int, dict]:
    """MDX geoset index -> {"has_track", "ever_visible", "visible_in", "peak"}.

    Reads GEOA/KGAO, the per-geoset visibility alpha track glTF cannot express
    and the importer therefore skips entirely (#59). A geoset with no track is
    simply always-on in WC3, which is the same thing the glb ships.
    """
    import geoset_alpha_report as gar

    ch = gar.chunks(mdx_bytes)
    if "GEOA" not in ch:
        return {}
    seqs = gar.parse_seqs(mdx_bytes, *ch["SEQS"][0]) if "SEQS" in ch else []
    out: dict[int, dict] = {}
    for anim in gar.parse_geoa(mdx_bytes, *ch["GEOA"][0]):
        track = anim["tracks"].get("KGAO")
        if not track or not track["keys"]:
            continue
        visible_in = []
        for seq in seqs:
            frames = [seq["start"], seq["end"], (seq["start"] + seq["end"]) // 2]
            frames += [f for f, _ in track["keys"] if seq["start"] <= f <= seq["end"]]
            if max(gar.alpha_at(track, f) for f in frames) > threshold:
                visible_in.append(seq["name"])
        out[anim["geoset"]] = {
            "has_track": True,
            "ever_visible": bool(visible_in),
            "visible_in": visible_in,
            "peak": round(max(v for _, v in track["keys"]), 3),
        }
    return out


def map_prims_to_geosets(prim_vertex_counts: list[int], model) -> dict[int, int]:
    """Shipped primitive index -> source MDX geoset index.

    The converter emits kept geosets in order, so the shipped primitives are an
    in-order subsequence of ``classify_geosets``' keep list (post-conversion
    strips like strip_teamglow.py removed further prims). Matching on vertex
    count makes the mapping self-checking: an ambiguous prim maps to nothing
    rather than to the wrong geoset.
    """
    from w3xlib.gltf import classify_geosets

    geo_info, _ = classify_geosets(model, 1.0)
    kept = [i for i in range(len(model.geosets)) if not geo_info[i]["drop"]]
    kept_counts = [len(model.geosets[i].vertices) for i in kept]
    if prim_vertex_counts == kept_counts:
        return {i: kept[i] for i in range(len(kept))}
    mapping: dict[int, int] = {}
    gi = 0
    for pi, n in enumerate(prim_vertex_counts):
        while gi < len(kept) and kept_counts[gi] != n:
            gi += 1
        if gi < len(kept):
            mapping[pi] = kept[gi]
            gi += 1
    return mapping


# ---------------------------------------------------------------------------
# the decision point
# ---------------------------------------------------------------------------

def cull_decisions(prims: list[dict], prim_to_geoset: dict[int, int],
                   visibility: dict[int, dict], policy: dict) -> dict[int, str]:
    """Primitive index -> reason string, for the primitives the POLICY culls.

    Every ``return``/``continue`` below is a policy branch, not a hard-coded
    behaviour. The load-bearing one is the visibility-animation guard.
    """
    if policy["cull"] == "off":
        return {}
    drop: dict[int, str] = {}
    for entry in prims:
        if not policy["reasons"].get(entry["reason"], False):
            continue                            # this drop-reason is opted out
        gidx = prim_to_geoset.get(entry["prim"])
        vis = visibility.get(gidx) if gidx is not None else None
        if policy["cull"] != "all":
            if gidx is None and not policy["cullWithoutMdxProof"]:
                continue                        # no proof of invisibility
            # THE GUARD — WC3 animates this geoset visible, so the transparent
            # material is a conversion defect (#59), not a dead placeholder.
            # Culling it would make the loss permanent. Keep it.
            if policy["skipGeosetsWithVisibilityAnimation"] and vis and vis["ever_visible"]:
                continue
        drop[entry["prim"]] = (
            f"invisible {entry['reason']} primitive "
            f"({entry['name']}) — baseColorFactor alpha 0"
        )
    return drop


# ---------------------------------------------------------------------------
# CLI plumbing
# ---------------------------------------------------------------------------

def read_glb_json(path: str) -> dict | None:
    with open(path, "rb") as fh:
        data = fh.read()
    off = 12
    while off < len(data) - 8:
        clen, ctype = struct.unpack_from("<II", data, off)
        off += 8
        if ctype == 0x4E4F534A:
            return json.loads(data[off:off + clen].decode("utf-8"))
        off += clen
    return None


def prim_vertex_counts(gltf: dict) -> list[int]:
    acc = gltf.get("accessors", [])
    return [acc[p["attributes"]["POSITION"]]["count"]
            for m in gltf.get("meshes", []) for p in m["primitives"]]


def iter_glbs(roots: list[str]):
    for root in roots:
        if not os.path.isdir(root):
            continue
        for dirpath, _dirs, files in os.walk(root):
            for fn in sorted(files):
                if fn.endswith(".glb"):
                    yield os.path.join(dirpath, fn)


def _mdx_index() -> dict[str, str]:
    """glb stem -> raw .mdx path, for the map-imported half of the corpus."""
    import geoset_alpha_report as gar
    raw = os.path.join(HERE, "out", "GoDieEX22s", "raw")
    out: dict[str, str] = {}
    if os.path.isdir(raw):
        for fn in os.listdir(raw):
            if fn.lower().endswith(".mdx"):
                out[gar.slug(os.path.splitext(fn)[0])] = os.path.join(raw, fn)
    return out


class BlizzardMdxResolver:
    """data/blizzard-overlay/models/<RAWCODE>.glb -> its stock MDX bytes.

    Those glbs were converted from the retail MPQs, whose .mdx files are not
    kept in the repo — without this the whole Blizzard half (65 of the 166
    primitives, and EVERY affected hero body) would audit as "no MDX proof"
    and be conservatively kept for the wrong reason. The unit's own `model`
    field wins; units that never override it fall back to their base rawcode's
    UnitUI.slk `file` column.

    Inert when the retail archives are not next to the repo: `available` is
    False and every lookup returns None.
    """

    ARCHIVES = ["war3.mpq", "War3x.mpq", "War3Patch.mpq"]

    def __init__(self, root: str = REPO):
        self._archives = []
        self._model_path: dict[str, str] = {}
        self.available = False
        paths = [os.path.join(root, n) for n in self.ARCHIVES]
        if not all(os.path.exists(p) for p in paths):
            return
        try:
            from w3xlib.mpq import W3XArchive
            from stock_unit_data import parse_slk
        except Exception:
            return
        stock: dict[str, str] = {}
        for path in paths:
            arc = W3XArchive(path)
            try:
                raw = arc.read_file("Units\\UnitUI.slk")
            except Exception:
                raw = None
            finally:
                arc.close()
            if raw:
                for code, row in parse_slk(raw).items():
                    if row.get("file"):
                        stock[code] = row["file"]
        for path in paths:
            self._archives.append(W3XArchive(path))
        parsed = os.path.join(HERE, "out", "GoDieEX22s", "parsed")
        objs: dict[str, dict] = {}
        for name in ("heroes.json", "units.json"):
            fp = os.path.join(parsed, name)
            if not os.path.exists(fp):
                continue
            with open(fp, encoding="utf-8") as fh:
                doc = json.load(fh)
            for val in (doc.values() if isinstance(doc, dict) else doc):
                if isinstance(val, dict) and val.get("id"):
                    objs[val["id"]] = val
        for code in set(list(objs) + list(stock)):
            obj = objs.get(code) or {}
            path = obj.get("model") or stock.get(obj.get("base", "")) or stock.get(code)
            if path:
                self._model_path[code] = path
        self.available = True

    def mdx(self, rawcode: str) -> bytes | None:
        path = self._model_path.get(rawcode)
        if not path:
            return None
        base = path[:-4] if path.lower().endswith((".mdl", ".mdx")) else path
        for cand in (base + ".mdx", base + ".mdl", path):
            for arc in reversed(self._archives):   # later archives patch earlier
                try:
                    raw = arc.read_file(cand)
                except Exception:
                    raw = None
                if raw:
                    return raw
        return None

    def close(self) -> None:
        for arc in self._archives:
            try:
                arc.close()
            except Exception:
                pass


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", help="write the full census here")
    ap.add_argument("--policy", help="policy file (default: invisible_prim_policy.json)")
    ap.add_argument("--apply", action="store_true",
                    help="honour policy.cull and rewrite .glb files in place")
    args = ap.parse_args()

    policy = load_policy(args.policy)
    mdx_by_stem = _mdx_index()
    blizzard = BlizzardMdxResolver()
    from w3xlib.mdx import parse_mdx

    files_scanned = 0
    rows: list[dict] = []
    tally = collections.Counter()

    for path in iter_glbs(GLB_ROOTS):
        gltf = read_glb_json(path)
        if gltf is None:
            continue
        files_scanned += 1
        prims = invisible_prims(gltf)
        if not prims:
            continue
        stem = os.path.basename(path)[:-4]
        base_stem = stem[:-4] if stem.endswith("-mid") else (
            stem[:-6] if stem.endswith("-small") else stem)
        mdx_path = mdx_by_stem.get(base_stem)
        data = None
        if mdx_path:
            data = open(mdx_path, "rb").read()
        elif "blizzard-overlay" in path:
            data = blizzard.mdx(base_stem)
        visibility: dict[int, dict] = {}
        mapping: dict[int, int] = {}
        if data:
            visibility = geoset_visibility(data, policy["visibleAlphaThreshold"])
            mapping = map_prims_to_geosets(prim_vertex_counts(gltf), parse_mdx(data))
        drop = cull_decisions(prims, mapping, visibility, policy)
        for entry in prims:
            gidx = mapping.get(entry["prim"])
            vis = visibility.get(gidx) if gidx is not None else None
            if gidx is None:
                verdict = "unmapped (no MDX proof)"
            elif vis and vis["ever_visible"]:
                verdict = "KEEP — WC3 animates it visible"
            elif vis:
                verdict = "safe — KGAO alpha 0 in every sequence"
            else:
                verdict = "safe — no visibility track"
            tally[verdict] += 1
            tally[f"reason:{entry['reason']}"] += 1
            rows.append({
                "file": os.path.relpath(path, REPO), "prim": entry["prim"],
                "geoset": gidx, "material": entry["name"],
                "reason": entry["reason"], "verdict": verdict,
                "visibleIn": (vis or {}).get("visible_in", []),
                "wouldCull": entry["prim"] in drop,
            })
        if args.apply and drop:
            from strip_geoset_prims import read_glb, write_glb, strip
            g, binary = read_glb(path)
            g, new_bin, removed = strip(g, binary, drop)
            write_glb(path, g, new_bin)
            print(f"== {path}: removed {len(removed)} invisible prim(s)")

    blizzard.close()
    print(f"policy               : cull={policy['cull']} "
          f"characterTeamGlow={policy['characterTeamGlow']} "
          f"blizzardMdx={'yes' if blizzard.available else 'NO (retail MPQs absent)'} "
          f"guard={policy['skipGeosetsWithVisibilityAnimation']} "
          f"noProof={policy['cullWithoutMdxProof']}")
    print(f"glb files scanned    : {files_scanned}")
    print(f"files with invisibles: {len({r['file'] for r in rows})}")
    print(f"invisible primitives : {len(rows)}")
    print()
    for key in sorted(tally):
        print(f"  {key:38s} {tally[key]}")
    would = sum(1 for r in rows if r["wouldCull"])
    print(f"\nwould cull under this policy: {would}")

    # ⭐ GH#770 —— **fail-loud**。`characterTeamGlow` 是 **build 時**的旋鈕:
    # 它只在**下一次重跑 import 產線**時生效。⇒ 旋鈕翻了而產線沒跑的那段期間,
    # 出貨的 .glb 仍然帶著那些面,而**每一條既有的閘都是綠的** ——
    # 那正是「fail-open 沒錯,靜默才是缺陷」的形狀,所以這裡要有人說話。
    stale = ([r for r in rows if r["reason"] == REASON_TEAM_GLOW]
             if policy["characterTeamGlow"] != "keep" else [])
    pending = {"characterTeamGlow": policy["characterTeamGlow"],
               "shippedTeamGlowPrims": len(stale),
               "models": sorted({r["file"] for r in stale})}
    if stale:
        print(f"\n⚠️  PENDING RE-BAKE — characterTeamGlow={policy['characterTeamGlow']} "
              f"但出貨樹還有 {len(stale)} 個 TeamGlow* 面 / {len(pending['models'])} "
              "份模型。⛔ 這個旋鈕不會自己追上已經烘好的 .glb ——\n"
              "    要它們消失,得重跑**產生那幾顆 glb 的那條轉檔路**\n"
              "    (content/assets/models/imported/ 那半 = tools/w3x-import/import_w3x.py;\n"
              "     data/blizzard-overlay/models/ 那半是本機專屬的暴雪覆蓋層,#10/#177)。")
        for f in pending["models"]:
            print(f"      · {f}")

    if args.json:
        with open(args.json, "w", encoding="utf-8") as fh:
            json.dump({"policy": policy, "pendingRebake": pending, "rows": rows},
                      fh, indent=1, ensure_ascii=False)
        print(f"wrote {args.json}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
