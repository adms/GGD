#!/usr/bin/env python3
"""球體附掛 (WC3 `Asph` sphere attachment) FULL CENSUS — one re-runnable truth.

WHY THIS EXISTS
---------------
Three previous investigations reported 14 / 17 / 18 / 20 sphere-attachment rows
and none of them reconciled. They disagreed because "a row" was never defined
and because the one shipped enumerator silently drops rows. This script fixes
both: it states its scope, emits every near-miss it rejected, and prints the
counts under EACH plausible definition so any future number can be matched to a
rule instead of to a guess.

THE DEFECT THAT CAUSED THE SPREAD
---------------------------------
`w3xlib/models.py::load_sphere_attachments()` keys its result by the BODY MDX
FILENAME, derived like this (models.py:338-340):

    body = str(hero.get("model") or "")
    if not body.lower().endswith(".mdl"):
        continue

19 of the map's 127 heroes have `model: null` in OBJECTS.json — meaning "keep
the base unit's model", i.e. a stock Blizzard body. `continue` throws those
heroes away BEFORE their spheres are ever looked at. One of them, `U00B`
(清蒸 飛鼠先生), carries TWO sphere abilities, including `Magical_Sword.mdx`
(571 tri / 362 vert, FrostMorne.blp) hung on `left,hand` — a real weapon that
has never appeared in any census. That single guard is the whole difference
between this script's 22 (hero, ability) pairs and the loader's 20.

TWO MORE FIELDS NOBODY READ
---------------------------
1. `atac` — "Art - Target Attachment COUNT". INVOCATION_PARAMS.json carries
   `atat` and `ataN` but NOT `atac`, so every previous count treated a declared
   attach point as a worn attachment. Read straight from `war3map.w3a`, TWO
   rows (`A0FQ` on 黑化Saber and on 清蒸飛鼠先生) have `atac = 0`: the sphere
   names `BanishTarget.mdl` on `weapon` and then hangs it ZERO times. Those are
   no-ops in the original map, and counting them as attachments is wrong.
   `atac` is not a column of the retail `Units\\AbilityData.slk` (only
   `AbilityMetaData.slk` declares the field), so a value here is always the map
   author's own choice; where it is absent the engine default applies and this
   script says so rather than inventing one.
2. Material FILTER MODE of the attachment's own geosets — see the never-bake
   block below. It is what separates 孫悟空's head from 索隆's aura, and it
   moved `AWING.MDX` (球體(翅膀), 8 triangles, additive-only) out of
   "bakeable weapon" and into "must stay a render-time effect".

SCOPE (stated, not implied)
---------------------------
A row is one (hero, ability) pair where ALL of the following hold:
  * the ability's `base` is `Asph` (checked transitively; on this map the
    transitive closure equals the direct set — 76 abilities either way);
  * the ability sits on the hero's PERMANENT ability list (`abilities`), not
    the learnable `hero_abilities` list — a permanent sphere is worn, a
    learnable one would be a cast;
  * INVOCATION_PARAMS.json resolves both an `atat` art model AND at least one
    `targetAttachN` for it.
Everything rejected by those three clauses is still written out, under
`rejected`, with the clause that rejected it.

Outputs `out/emitters/SPHERE_ATTACHMENTS.json`.

Usage:
    python3 tools/w3x-import/sphere_attachment_census.py            # write + print
    python3 tools/w3x-import/sphere_attachment_census.py --print    # print only
"""

from __future__ import annotations

import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))

OBJECTS = os.path.join(HERE, "out", "GoDieEX22s-src", "OBJECTS.json")
PARAMS = os.path.join(HERE, "out", "invocation-params", "INVOCATION_PARAMS.json")
EMITTERS = os.path.join(HERE, "out", "emitters", "EMITTERS.json")
RAW_DIR = os.path.join(HERE, "out", "GoDieEX22s", "raw")
# the raw ability object-data table. INVOCATION_PARAMS.json carries `atat` and
# `ataN` but NOT `atac` (Art - Target Attachment COUNT), so `count` has to come
# from here or it is a guess.
W3A = os.path.join(HERE, "out", "GoDieEX22s-src", "raw", "war3map.w3a")
OUT = os.path.join(HERE, "out", "emitters", "SPHERE_ATTACHMENTS.json")

CHAMPION_DIR = os.path.join(REPO, "content", "champions")
MODEL_DIR = os.path.join(REPO, "content", "models")
CONTENT_ASSETS = os.path.join(REPO, "content", "assets")
IMPORTED_GLB = os.path.join(CONTENT_ASSETS, "models", "imported")
OVERLAY_DIR = os.path.join(REPO, "data", "blizzard-overlay")

SPHERE_BASE = "Asph"

# A stand-in body: the four generic KayKit/blocky characters that dozens of
# champions share. Matches apps/client/src/render/views/blizzardOverlay.ts:57
# (STOCK_CHAMPION_GLB_PREFIX) — the ONLY glbPath prefix that module will
# substitute an overlay model for.
STOCK_CHAMPION_GLB_PREFIX = "assets/models/champions/"

# --- 常亮光效: the MEASURED never-bake test ---------------------------------
# Tasks #17 / #59 / #73 spent three passes REMOVING always-on effect meshes from
# champion glbs. Baking one back in is a regression, not a fix — so "is this an
# always-on glow?" must be decided by measurement, not by recognising a filename.
#
# The discriminator is the WC3 material FILTER MODE of the layers each triangle
# is drawn with. A body part is drawn opaque or alpha-tested; a glow is drawn
# additively, because additive is what makes it read as light. Measured over the
# six map-custom attachments in scope:
#
#   AWING.mdx                  0 opaque /    8 additive-only tris  -> glow
#   poweraura.MDX              0 opaque / 1088 additive-only tris  -> glow
#   HeroFateZemberForm.mdx   385 opaque /   58 additive-only tris  -> weapon + trim
#   1hswd_01.mdx             312 opaque /   16 additive-only tris  -> sword + trim
#   Magical_Sword.mdx        571 opaque /    0 additive-only tris  -> sword
#   Gokuhead.mdx             332 opaque /    0 additive-only tris  -> head
#
# A model with ZERO non-additive triangles is a light source with no body. That
# is the rule; the separation above is total, with no threshold to tune.
ADDITIVE_FILTER_MODES = {3, 4}  # 3 = Additive, 4 = AddAlpha

# Cross-check only. If the measurement above ever stops agreeing with this list,
# `auraListDisagreement` appears in the output — the measurement is authoritative
# and the disagreement is the bug report.
KNOWN_AURA_BASENAMES = {"poweraura.mdx", "awing.mdx"}


def load(path: str):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def is_stock_blizzard_path(p: str) -> bool:
    """A stock Blizzard art path vs a map-imported file.

    Blizzard paths are directory paths inside the retail MPQs
    (`Abilities\\Spells\\...`, `units\\orc\\...`, `Doodads\\...`). Map-imported
    files are bare filenames, or sit under `war3mapImported\\`.
    """
    q = p.replace("/", "\\")
    if q.lower().startswith("war3mapimported\\"):
        return False
    return "\\" in q


def basename(p: str) -> str:
    return p.replace("/", "\\").rsplit("\\", 1)[-1]


def raw_index(raw_dir: str) -> dict:
    """lowercased candidate name -> real filename actually present in raw/.

    The importer flattens `a\\b\\c.mdx` to `a__b__c.mdx`, so a stock-looking
    path can still be present. Every lookup below goes through a REAL
    os.listdir, never a guess.
    """
    idx = {}
    if not os.path.isdir(raw_dir):
        return idx
    for f in os.listdir(raw_dir):
        idx[f.lower()] = f
    return idx


def find_raw(idx: dict, art_path: str):
    """The raw/ filename for an art path, or None. Tries, in order:
    flattened full path, bare basename, basename with .mdx forced."""
    q = art_path.replace("/", "\\")
    base = basename(q)
    stem = base.rsplit(".", 1)[0]
    for cand in (q.replace("\\", "__"), base, stem + ".mdx", stem + ".MDX",
                 "war3mapImported__" + stem + ".mdx"):
        hit = idx.get(cand.lower())
        if hit:
            return hit
    return None


def slugify(name: str) -> str:
    import re
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s or "model"


def load_atac(path: str) -> dict:
    """abilityId -> atac (Art - Target Attachment Count) as the map really set it.

    `atac` is NOT a column of the retail `Units\\AbilityData.slk` — only
    `Units\\AbilityMetaData.slk` declares the field — so a value here means the
    MAP author set it, and its absence means the engine default applies. That
    distinction matters: `A0FQ` sets atac EXPLICITLY TO 0, i.e. the sphere
    declares BanishTarget.mdl and then hangs it zero times.
    """
    if not os.path.exists(path):
        return {}
    sys.path.insert(0, HERE)
    from w3xlib.objdata import parse_object_file, all_entries  # noqa: E402
    parsed = parse_object_file(open(path, "rb").read(), True)
    out = {}
    for e in all_entries(parsed):
        v = e.get("atac")
        if v is not None:
            out[e.obj_id] = int(v)
    return out


def measure_mdx(path: str) -> dict:
    """Parse a raw .mdx and measure what decides bakeable-vs-glow.

    `additiveOnlyTris` counts triangles whose material has NO non-additive
    layer — i.e. geometry that only ever adds light. `opaqueTris` is the rest.
    Also returns the model-space bounding extent, because an attachment far
    larger than the body part it hangs on is the #17 failure shape.
    """
    sys.path.insert(0, HERE)
    from w3xlib.mdx import parse_mdx  # noqa: E402
    m = parse_mdx(open(path, "rb").read())
    opaque = additive = 0
    lo = [float("inf")] * 3
    hi = [float("-inf")] * 3
    layers_seen = []
    for g in m.geosets:
        tris = len(g.faces) // 3
        mat = m.materials[g.material_id] if g.material_id < len(m.materials) else None
        modes = [int(l.filter_mode) for l in (mat.layers if mat else [])]
        if modes and all(mo in ADDITIVE_FILTER_MODES for mo in modes):
            additive += tris
        else:
            opaque += tris
        layers_seen.append({"tris": tris, "filterModes": modes})
        for v in g.vertices:
            for i in range(3):
                lo[i] = min(lo[i], v[i])
                hi[i] = max(hi[i], v[i])
    extent = ([round(hi[i] - lo[i], 2) for i in range(3)]
              if hi[0] > float("-inf") else None)
    return {
        "tris": opaque + additive,
        "verts": sum(len(g.vertices) for g in m.geosets),
        "geosets": len(m.geosets),
        "opaqueTris": opaque,
        "additiveOnlyTris": additive,
        "isAdditiveOnly": (opaque == 0 and additive > 0),
        "extent": extent,
        "geosetLayers": layers_seen,
        "textures": [str(t.path) for t in m.textures],
    }


def build_champion_index() -> dict:
    """championId -> {modelKey, name, glbPath, bodySource, ...}, read from the
    SHIPPED content docs — the body the game actually loads, not the w3x one."""
    out = {}
    if not os.path.isdir(CHAMPION_DIR):
        return out
    overlay_manifest = {}
    mf = os.path.join(OVERLAY_DIR, "MANIFEST.json")
    if os.path.exists(mf):
        overlay_manifest = (load(mf) or {}).get("units") or {}
    for f in sorted(os.listdir(CHAMPION_DIR)):
        if not f.endswith(".json") or f.startswith("_"):
            continue
        doc = load(os.path.join(CHAMPION_DIR, f))
        cid = doc.get("id")
        mk = doc.get("modelKey")
        md_path = os.path.join(MODEL_DIR, f"{mk}.json")
        glb = None
        if os.path.exists(md_path):
            glb = (load(md_path) or {}).get("glbPath")
        out[cid] = {
            "championId": cid,
            "championName": doc.get("name"),
            "modelKey": mk,
            "glbPath": glb,
            "modelDocExists": os.path.exists(md_path),
        }
    out["__overlay__"] = overlay_manifest
    return out


def body_source(champ: dict | None, hero_id: str, overlay_units: dict) -> tuple:
    """(bodySource, evidence). One of content | overlay | standin | missing."""
    if champ is None:
        return "missing", "no content/champions doc for this hero id"
    glb = champ.get("glbPath")
    if not glb:
        return "missing", f"modelKey {champ.get('modelKey')!r} has no model doc / glbPath"
    if glb.startswith(STOCK_CHAMPION_GLB_PREFIX):
        # a shared blocky stand-in; the overlay MAY swap in the real WC3 body
        if hero_id in overlay_units:
            ov = os.path.join(OVERLAY_DIR, "models", f"{hero_id}.glb")
            if os.path.exists(ov):
                return "overlay", (
                    f"stand-in {glb}; blizzardOverlay.ts substitutes "
                    f"data/blizzard-overlay/models/{hero_id}.glb (gitignored, "
                    f".gitignore:34 `/data/**`)"
                )
            return "overlay", (
                f"stand-in {glb}; MANIFEST lists {hero_id} but the glb is not staged here"
            )
        return "standin", f"shared blocky stand-in {glb}, no overlay entry for {hero_id}"
    disk = os.path.join(CONTENT_ASSETS, glb.replace("assets/", "", 1))
    if os.path.exists(disk):
        return "content", f"{glb} exists in-repo"
    return "missing", f"{glb} declared by the model doc but NOT on disk"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--print", dest="print_only", action="store_true")
    args = ap.parse_args()

    objects = load(OBJECTS)
    params = load(PARAMS)
    emitters_doc = load(EMITTERS)
    abilities = objects.get("abilities") or {}
    heroes = objects.get("heroes") or {}
    units = objects.get("units") or {}

    emit = {r["file"].lower(): r for r in emitters_doc.get("models") or []}
    atac_map = load_atac(W3A)
    raw = raw_index(RAW_DIR)
    champs = build_champion_index()
    overlay_units = champs.pop("__overlay__", {})

    # --- which abilities are spheres (transitive, then compared to direct) ---
    def root_base(aid: str) -> str:
        seen, cur = set(), aid
        while cur in abilities and cur not in seen:
            seen.add(cur)
            b = abilities[cur].get("base")
            if b is None or b == cur:
                return cur
            cur = b
        return cur

    direct = {a for a, v in abilities.items() if v.get("base") == SPHERE_BASE}
    transitive = {a for a in abilities if root_base(a) == SPHERE_BASE}
    sphere_ids = transitive

    # --- art table from INVOCATION_PARAMS (the `atat` field the w3u whitelist drops)
    art = {}
    for rec in params.get("abilities") or []:
        aid = str(rec.get("abilityId"))
        target = ((rec.get("objectArt") or {}).get("target") or {})
        per_level = target.get("perLevel") or {}
        mdx = per_level.get("0") or next(iter(per_level.values()), None)
        pts = rec.get("objectAttachPoints") or {}
        # every targetAttachN, in index order — WC3 hangs one copy at EACH
        ordered = [pts[k] for k in sorted(pts, key=lambda k: (len(k), k))
                   if k.startswith("targetAttach") and pts[k]]
        art[aid] = {
            "model": mdx,
            "attachPoints": ordered,
            "attachKeys": sorted(pts),
            "perLevelModels": per_level,
            "name": rec.get("name"),
        }

    rows, rejected = [], []

    for hid, hero in sorted(heroes.items()):
        perm = hero.get("abilities") or []
        learn = hero.get("hero_abilities") or []
        cid = "godie-" + hid.lower()
        champ = champs.get(cid)
        src, why = body_source(champ, hid, overlay_units)

        for aid in learn:
            if aid in sphere_ids:
                rejected.append({"heroId": hid, "abilityId": aid,
                                 "clause": "learnable-not-permanent"})

        for aid in perm:
            if aid not in sphere_ids:
                continue
            spec = art.get(aid)
            if not spec or not spec.get("model"):
                rejected.append({"heroId": hid, "abilityId": aid,
                                 "clause": "no-atat-art-model",
                                 "attachKeys": (spec or {}).get("attachKeys")})
                continue
            if not spec["attachPoints"]:
                rejected.append({"heroId": hid, "abilityId": aid,
                                 "clause": "no-targetAttach",
                                 "attachModel": spec["model"]})
                continue

            art_path = spec["model"]
            base = basename(art_path)
            rawname = find_raw(raw, art_path)
            em = emit.get((rawname or base).lower()) or {}
            geo = em.get("geometry") or {}
            tris = geo.get("triangles")
            verts = geo.get("vertices")
            vpt = round(verts / tris, 3) if tris else None
            glb_stem = slugify((rawname or base).rsplit(".", 1)[0])
            glb_here = os.path.join(IMPORTED_GLB, glb_stem + ".glb")

            measured = None
            if rawname:
                try:
                    measured = measure_mdx(os.path.join(RAW_DIR, rawname))
                except Exception as exc:  # a parse failure must not be silent
                    measured = {"parseError": str(exc)}

            row = {
                "champId": cid,
                "championName": (champ or {}).get("championName"),
                "heroId": hid,
                "heroProperName": hero.get("proper_name"),
                "abilityId": aid,
                "abilityName": spec.get("name"),
                # the map author's own words for this sphere — the strongest
                # available statement of intent. 球體(悟空超3) says "alternate
                # form"; (令狐沖劍) says "this character's sword";
                # 球體(武裝霸王) says "Armament Haki", i.e. an aura.
                "authorLabel": ((abilities.get(aid) or {}).get("name")
                                or (abilities.get(aid) or {}).get("editor_suffix")),
                "bodyModelKey": (champ or {}).get("modelKey"),
                "bodySource": src,
                "bodySourceWhy": why,
                "bodyGlbPath": (champ or {}).get("glbPath"),
                "w3xBodyModel": hero.get("model"),
                "attachModel": art_path,
                "attachPoint": spec["attachPoints"][0],
                "attachPointsAll": spec["attachPoints"],
                # MEASURED from war3map.w3a when the author set it; otherwise the
                # engine default applies and we fall back to the declared points.
                "count": (atac_map[aid] if aid in atac_map
                          else len(spec["attachPoints"])),
                "atac": atac_map.get(aid),
                "countSource": ("w3a atac (author-set)" if aid in atac_map
                                else "fallback: number of declared ataN "
                                     "(atac absent -> engine default, not read)"),
                "mdxInRepo": rawname is not None,
                "mdxRepoPath": (os.path.relpath(os.path.join(RAW_DIR, rawname), REPO)
                                if rawname else None),
                "attachGlbInRepo": os.path.exists(glb_here),
                "attachGlbPath": (os.path.relpath(glb_here, REPO)
                                  if os.path.exists(glb_here) else None),
                "isBlizzardStockPath": is_stock_blizzard_path(art_path),
                "tris": tris,
                "verts": verts,
                "vertsPerTri": vpt,
                "measured": measured,
                "assetClass": em.get("assetClass"),
                "textures": [t.get("basename") for t in (em.get("textures") or [])],
                "emitters": {
                    "particleEmitter2": len(em.get("emitters") or []),
                    "ribbon": len(em.get("ribbons") or []),
                    "particleEmitterV1": (em.get("particleEmitterV1") or {}).get("emitters", 0),
                    "chunkPRE2": (em.get("chunks") or {}).get("PRE2", 0),
                    "chunkRIBB": (em.get("chunks") or {}).get("RIBB", 0),
                },
            }
            rows.append(row)

    # --- second pass: classification needs to see sibling rows -------------
    # An alternate FORM is a second sphere hung on the SAME attach point of the
    # SAME body — 孫悟空 (A0MI) and 超級賽亞人 (A0MJ) both sit on goku.mdx/origin.
    by_body_point = {}
    for r in rows:
        key = (str(r["w3xBodyModel"]).lower(), r["bodyModelKey"], r["attachPoint"])
        by_body_point.setdefault(key, []).append(r)

    aura_disagreement = []

    for r in rows:
        art_path = r["attachModel"]
        base = basename(art_path).lower()
        key = (str(r["w3xBodyModel"]).lower(), r["bodyModelKey"], r["attachPoint"])
        siblings = by_body_point[key]
        meas = r.get("measured") or {}
        additive_only = bool(meas.get("isAdditiveOnly"))

        # the measurement and the human list must agree; if they don't, say so
        if r["mdxInRepo"] and "parseError" not in meas:
            if additive_only != (base in KNOWN_AURA_BASENAMES):
                aura_disagreement.append({
                    "attachModel": art_path, "measuredAdditiveOnly": additive_only,
                    "onKnownAuraList": base in KNOWN_AURA_BASENAMES,
                    "opaqueTris": meas.get("opaqueTris"),
                    "additiveOnlyTris": meas.get("additiveOnlyTris"),
                })

        if r["atac"] == 0:
            r["category"] = "disabled-by-author"
            r["decision"] = "NO-OP"
            r["why"] = (
                f"war3map.w3a sets `atac` (Art - Target Attachment Count) to 0 on "
                f"{r['abilityId']}. The sphere names {basename(art_path)} and "
                f"attach point {r['attachPoint']!r} and then hangs it ZERO times — "
                f"nothing is worn in the original map either. Any census that "
                f"counted this as a visible attachment counted a no-op."
            )
        elif additive_only:
            r["category"] = "never-bake-aura"
            r["decision"] = "DO-NOT-BAKE"
            r["why"] = (
                f"MEASURED always-on glow: {meas['additiveOnlyTris']} of "
                f"{meas['tris']} triangles are drawn with additive-only materials "
                f"(filter modes "
                f"{sorted({m for g in meas['geosetLayers'] for m in g['filterModes']})}) "
                f"and ZERO are opaque or alpha-tested, over textures "
                f"{meas['textures']}. Model-space extent {meas['extent']}. This is "
                f"the always-on effect class tasks #17/#59/#73 spent three passes "
                f"REMOVING from champion glbs — baking it back is a regression."
            )
        elif r["isBlizzardStockPath"]:
            r["category"] = "blizzard-vfx"
            r["decision"] = "OUT-OF-SCOPE"
            r["why"] = ("stock Blizzard art path — ambient/effect art owned by the VFX "
                        "channel (#9 / #183 / #230), not a missing body part. Its mdx is "
                        "not in raw/ so it could not bake here anyway."
                        if not r["mdxInRepo"] else
                        "stock Blizzard art path — belongs to the VFX channel (#9/#183/#230).")
        elif len(siblings) > 1 and r is not min(siblings, key=lambda x: x["abilityId"]):
            r["category"] = "alt-form"
            r["decision"] = "DEFER-TO-TRANSFORM"
            other = min(siblings, key=lambda x: x["abilityId"])
            r["why"] = (f"second sphere on the same body+attach point as "
                        f"{other['abilityId']} ({basename(other['attachModel'])}). Baking "
                        f"both gives this champion two overlapping parts — this is an "
                        f"alternate FORM and belongs to #119/#249.")
        elif not r["mdxInRepo"]:
            r["category"] = "real-part"
            r["decision"] = "BLOCKED-NO-MDX"
            r["why"] = "map-custom body/weapon part, but its .mdx is not in raw/"
        elif r["bodySource"] == "content":
            r["category"] = "real-part"
            r["decision"] = "BAKEABLE-NOW"
            r["why"] = (f"map-custom part: {meas.get('opaqueTris')} opaque/alpha-tested "
                        f"triangles (+{meas.get('additiveOnlyTris')} additive trim) over "
                        f"{meas.get('textures')}, extent {meas.get('extent')}. mdx present "
                        f"at {r['mdxRepoPath']}, body glb committed at {r['bodyGlbPath']}.")
        else:
            r["category"] = "real-part"
            r["decision"] = "BLOCKED-" + r["bodySource"].upper()
            r["why"] = (f"map-custom part ({r['tris']} tri) and the mdx IS in raw/, but the "
                        f"body the game loads is {r['bodySource']}: {r['bodySourceWhy']}. "
                        f"There is no committed body glb to bake into.")

    # the one row already shipped is marked from the real file, not from a claim
    for r in rows:
        if r["abilityId"] == "A0MI" and r["decision"] == "BAKEABLE-NOW":
            r["decision"] = "ALREADY-SHIPPED"
            r["why"] = ("baked by tools/w3x-import/merge_sphere_attachments.py (#267) and "
                        "guarded by packages/shared/src/content/modelHeadGeometry.test.ts"
                        ":302 (268v/332tri primitive riding `Head`).")

    # --- spheres on non-hero UNITS (dummies / clones) — scope evidence -----
    unit_rows = []
    for uid, u in sorted(units.items()):
        hit = [a for a in (u.get("abilities") or []) if a in sphere_ids]
        for aid in hit:
            spec = art.get(aid) or {}
            unit_rows.append({
                "unitId": uid, "unitName": u.get("name"), "unitModel": u.get("model"),
                "abilityId": aid, "attachModel": spec.get("model"),
                "attachPoints": spec.get("attachPoints"),
            })

    # --- the models.py comparison: what does the SHIPPED loader see? -------
    sys.path.insert(0, HERE)
    from w3xlib import models as M  # noqa: E402
    shipped = M.load_sphere_attachments(OBJECTS, PARAMS)
    shipped_pairs = {(r["hero"], r["ability"]) for v in shipped.values() for r in v}
    census_pairs = {(r["heroId"], r["abilityId"]) for r in rows}
    missed = sorted(census_pairs - shipped_pairs)
    extra = sorted(shipped_pairs - census_pairs)

    # Where every one of the 76 sphere abilities went. Without this an empty
    # `rejected` list reads as "nothing was checked" instead of "checked, none".
    perm_ids, learn_ids, unit_ids = set(), set(), set()
    for h in heroes.values():
        perm_ids |= set(h.get("abilities") or []) & sphere_ids
        learn_ids |= set(h.get("hero_abilities") or []) & sphere_ids
    for u in units.values():
        unit_ids |= set(u.get("abilities") or []) & sphere_ids
    scope_audit = {
        "sphereAbilitiesTotal": len(sphere_ids),
        "onHeroPermanentLists": len(perm_ids),
        "onHeroLearnableLists": len(learn_ids),
        "onNonHeroUnitLists": len(unit_ids),
        "referencedByNothing": len(sphere_ids - perm_ids - learn_ids - unit_ids),
        "inScopeWithArtAndAttach": len({r["abilityId"] for r in rows}),
        "inScopeRejected": len(rejected),
        "note": ("onHeroPermanentLists counts DISTINCT abilities; `rows` counts "
                 "(hero, ability) PAIRS, which is larger because A0FR is worn by "
                 "three different heroes and A0FQ by two."),
    }

    # Every previously-reported number, reproduced from THIS dataset by naming
    # the rule that yields it. None of the four was wrong arithmetic; each one
    # answered a different, unstated question.
    def nbase(p):
        return basename(p).lower()

    reconciliation = {
        "14": {
            "rule": "rows with a NON-ZERO attachment whose body glb is committed "
                    "in content/ (bodySource == 'content' and count > 0)",
            "value": sum(1 for r in rows
                         if r["count"] > 0 and r["bodySource"] == "content"),
        },
        "17": {
            "rule": "distinct w3x BODY mdx files carrying at least one sphere "
                    "(also equals distinct champions once the atac==0 no-ops are "
                    "dropped, and distinct attach models once they are dropped)",
            "value": len({str(r["w3xBodyModel"]).lower() for r in rows}),
        },
        "18": {
            "rule": "distinct CHAMPIONS carrying a sphere (also equals the number "
                    "of distinct attach MODELS)",
            "value": len({r["champId"] for r in rows}),
        },
        "20": {
            "rule": "rows models.py::load_sphere_attachments returns — i.e. this "
                    "census minus the two heroes it drops for `model: null` "
                    "(also, coincidentally, rows with count > 0)",
            "value": len(shipped_pairs),
        },
        "22": {
            "rule": "THIS CENSUS: (hero, ability) pairs with base==Asph on a "
                    "permanent ability list, with art and an attach point",
            "value": len(rows),
        },
    }

    counts = {
        "sphereAbilitiesDirectBaseAsph": len(direct),
        "sphereAbilitiesTransitiveRootAsph": len(transitive),
        "heroAbilityPairs": len(rows),
        "attachmentInstances": sum(r["count"] for r in rows),
        "distinctChampions": len({r["champId"] for r in rows}),
        "distinctW3xBodies": len({str(r["w3xBodyModel"]).lower() for r in rows}),
        "distinctAttachModels": len({basename(r["attachModel"]).lower() for r in rows}),
        "rowsShippedLoaderSees": len(shipped_pairs),
        "rowsShippedLoaderMisses": len(missed),
        "byDecision": {},
        "byCategory": {},
        "byBodySource": {},
    }
    for r in rows:
        for field, bucket in (("decision", "byDecision"), ("category", "byCategory"),
                              ("bodySource", "byBodySource")):
            counts[bucket][r[field]] = counts[bucket].get(r[field], 0) + 1

    doc = {
        "schema": "sphere-attachment-census@1",
        "generatedBy": "tools/w3x-import/sphere_attachment_census.py",
        "sources": {
            "objects": os.path.relpath(OBJECTS, REPO),
            "invocationParams": os.path.relpath(PARAMS, REPO),
            "emitters": os.path.relpath(EMITTERS, REPO),
            "rawMdxDir": os.path.relpath(RAW_DIR, REPO),
            "championDocs": os.path.relpath(CHAMPION_DIR, REPO),
            "overlayStore": os.path.relpath(OVERLAY_DIR, REPO) + " (gitignored)",
        },
        "scope": (
            "one row per (hero, ability) where base==Asph AND the ability is on the "
            "hero's PERMANENT `abilities` list AND INVOCATION_PARAMS resolves both an "
            "`atat` art model and >=1 targetAttachN. `count` = number of attach points "
            "the ability declares (WC3 hangs one copy at each)."
        ),
        "counts": counts,
        "scopeAudit": scope_audit,
        "disputedNumberReconciliation": reconciliation,
        "shippedLoaderDelta": {
            "loader": "tools/w3x-import/w3xlib/models.py::load_sphere_attachments",
            "missedPairs": missed,
            "unexpectedPairs": extra,
            "rootCause": (
                "models.py:338-340 skips every hero whose OBJECTS.json `model` is not a "
                "*.mdl string. 19 of 127 heroes have model:null (inherit the base unit's "
                "stock Blizzard body) and are dropped before their spheres are read."
            ),
        },
        "auraListDisagreement": aura_disagreement,
        "rows": rows,
        "rejected": rejected,
        "spheresOnNonHeroUnits": unit_rows,
    }

    if not args.print_only:
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        with open(OUT, "w", encoding="utf-8") as fh:
            json.dump(doc, fh, ensure_ascii=False, indent=1)
            fh.write("\n")

    # ---------------- console report --------------------------------------
    print("=" * 100)
    print("球體附掛 (Asph) CENSUS")
    print("=" * 100)
    for k, v in counts.items():
        if isinstance(v, dict):
            print(f"  {k}:")
            for kk, vv in sorted(v.items()):
                print(f"      {kk:24s} {vv}")
        else:
            print(f"  {k:36s} {v}")
    print()
    print("  scope audit (where all %d sphere abilities went):" % len(sphere_ids))
    for k, v in scope_audit.items():
        if k != "note":
            print(f"      {k:26s} {v}")
    print()
    print(f"  shipped loader misses {len(missed)}: {missed}")
    print(f"  aura measurement vs known-aura list: "
          f"{'AGREE' if not aura_disagreement else aura_disagreement}")
    print()
    print("  every previously-reported number, reproduced with its rule:")
    for n, spec in sorted(reconciliation.items(), key=lambda kv: int(kv[0])):
        ok = "OK " if spec["value"] == int(n) else "!! "
        print(f"      {ok}{n} = {spec['value']}: {spec['rule']}")
    print()
    order = {"ALREADY-SHIPPED": 0, "BAKEABLE-NOW": 1, "BLOCKED-STANDIN": 2,
             "BLOCKED-OVERLAY": 3, "BLOCKED-MISSING": 3, "BLOCKED-NO-MDX": 4,
             "DEFER-TO-TRANSFORM": 5, "DO-NOT-BAKE": 6, "OUT-OF-SCOPE": 7}
    for r in sorted(rows, key=lambda x: (order.get(x["decision"], 9), x["champId"])):
        print(f"[{r['decision']:18s}] {r['champId']:12s} {str(r['heroProperName'] or ''):10s} "
              f"{r['abilityId']} body={r['bodyModelKey']}({r['bodySource']}) "
              f"<- {basename(r['attachModel'])} @ {'+'.join(r['attachPointsAll'])} "
              f"x{r['count']} mdx={'Y' if r['mdxInRepo'] else 'N'} "
              f"tris={r['tris']} v/t={r['vertsPerTri']}")
    print()
    if not args.print_only:
        print(f"wrote {os.path.relpath(OUT, REPO)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
