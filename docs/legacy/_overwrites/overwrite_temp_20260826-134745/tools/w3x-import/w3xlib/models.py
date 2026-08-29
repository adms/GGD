"""Stage 4 — convert every recovered .mdx to .glb + classify hero/prop.

Scale policy: the glb geometry is baked so a hero's body stands ~1.7 glTF
units tall (other models: uniform 1/36); the per-unit Scaling Value ('usca')
is then applied by the model doc's `scale` (see drafts.model_scale) so the map
author's size intent is preserved without touching the collision radius.
Materials: BLP alpha + WC3 filter mode drive glTF alphaMode; team-colour
(replaceableId 1) → neutral opaque + teamTint, team glow (replaceableId 2) →
dropped, additive glow → emissive (see gltf.gltf_material).
Attachments: separate models referenced by ATCH nodes are baked into the
parent at the attach-node transform. Particle emitters (PREM/PRE2/RIBB) and
GEOA per-sequence visibility are skipped — geometry/bones/animations only.
"""

from __future__ import annotations

import io
import json
import os
import re

from .blp import decode_blp
from .gltf import convert
from .mdx import Geoset, Layer, Material, parse_mdx
from .mpq import W3XArchive

DEFAULT_SCALE = 1.0 / 36.0
HERO_TARGET_HEIGHT = 1.7

#: ⭐ GH#767 —— replaceableId 2（隊伍發光）真正的美術。WC3 逐隊有 00…27 共 28 張,
#: GGD 沒有隊伍色可以套 ⇒ 取**第一張**當中性發光貼圖（形狀三張都一樣,差別只在色相）。
TEAM_GLOW_STOCK_TEXTURE = "ReplaceableTextures\\TeamGlow\\TeamGlow00.blp"


# Retail archives, searched only for texture paths the map archive does not
# carry (stock Blizzard art: Textures\Flame4.blp, ReplaceableTextures\... ).
# StormLib load order: patch archives win over the base ones.
STOCK_MPQS = ["War3Patch.mpq", "War3xLocal.mpq", "War3x.mpq", "war3.mpq"]
# repo root (w3xlib/ -> tools/w3x-import/ -> tools/ -> repo); override with
# W3X_STOCK_MPQ_DIR. Absent archives simply disable the fallback.
STOCK_MPQ_DIR = os.environ.get(
    "W3X_STOCK_MPQ_DIR",
    os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "..")),
)


def slug(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s or "model"


def classify(model) -> str:
    seqs = [s.name.lower() for s in model.sequences]
    has = lambda k: any(k in s for s in seqs)
    if has("walk") and has("attack") and has("death") and model.nodes:
        return "hero"
    if model.sequences and model.nodes:
        return "animated-prop"
    return "prop"


def pick_clip(seq_names: list[str], *patterns: str) -> str | None:
    """Best sequence for a logical state: first pattern that matches wins;
    prefer the plain variant (shortest name) among matches."""
    for pat in patterns:
        matches = [s for s in seq_names if re.search(pat, s, re.I)]
        if matches:
            return sorted(matches, key=len)[0]
    return None


def build_clip_map(anim_names: list[str]) -> dict | None:
    if not anim_names:
        return None
    idle = pick_clip(anim_names, r"^stand(?: - \d+)?$", r"^stand", r".")
    run = pick_clip(anim_names, r"^walk", r"walk", r"^stand")
    attack = pick_clip(anim_names, r"^attack(?: - \d+)?$", r"attack", r"^stand")
    cast = pick_clip(
        anim_names, r"spell", r"stand channel", r"^attack", r"^stand"
    )
    hurt = pick_clip(anim_names, r"stand hit", r"hit", r"^stand")
    death = pick_clip(anim_names, r"^death", r"death", r"decay", r"^stand")
    clip = {
        "idle": idle, "run": run, "attack": attack,
        "cast": cast, "hurt": hurt, "death": death,
    }
    if any(v is None for v in clip.values()):
        return None
    return clip


def _alpha_hint(img) -> str:
    """Classify a decoded texture's alpha so the exporter can pick glTF
    alphaMode: 'opaque' (no usable alpha), 'mask' (1-bit-ish cut-out) or
    'blend' (smooth gradient)."""
    if "A" not in img.getbands():
        return "opaque"
    a = img.getchannel("A")
    lo, _hi = a.getextrema()
    if lo >= 250:
        return "opaque"
    hist = a.histogram()
    total = sum(hist) or 1
    edges = sum(hist[:16]) + sum(hist[240:])
    return "mask" if edges / total >= 0.95 else "blend"


def _encode(img) -> tuple[bytes, str]:
    hint = _alpha_hint(img)
    b = io.BytesIO()
    img.save(b, "PNG")
    return b.getvalue(), hint


_STOCK_ARCHIVES: list[W3XArchive] | None = None
_STOCK_TEX_CACHE: dict[str, tuple[bytes, str] | None] = {}


def _stock_archives() -> list[W3XArchive]:
    """Retail MPQs, opened once and kept open (opening war3.mpq costs ~0.4s,
    and a full import asks for hundreds of textures)."""
    global _STOCK_ARCHIVES
    if _STOCK_ARCHIVES is None:
        _STOCK_ARCHIVES = []
        for name in STOCK_MPQS:
            full = os.path.join(STOCK_MPQ_DIR, name)
            if not os.path.exists(full):
                continue
            try:
                _STOCK_ARCHIVES.append(W3XArchive(full))
            except Exception:
                pass  # unreadable archive → just one fewer place to look
    return _STOCK_ARCHIVES


def close_stock_archives() -> None:
    global _STOCK_ARCHIVES
    for arc in _STOCK_ARCHIVES or []:
        try:
            arc.close()
        except Exception:
            pass
    _STOCK_ARCHIVES = None
    _STOCK_TEX_CACHE.clear()


def _stock_texture_png(path: str):
    """(png_bytes, alpha_hint) for a STOCK Blizzard BLP path, or None.
    No-op when the retail archives are not present at STOCK_MPQ_DIR."""
    key = path.lower()
    if key in _STOCK_TEX_CACHE:
        return _STOCK_TEX_CACHE[key]
    out = None
    for arc in _stock_archives():
        try:
            if not arc.has_file(path):
                continue
            blp = arc.read_file(path)
            if blp:
                out = _encode(decode_blp(blp))
        except Exception:
            out = None
        break  # first archive that claims the path decides (StormLib order)
    _STOCK_TEX_CACHE[key] = out
    return out


def _find_texture_png(raw_dir: str, path: str):
    """Return (png_bytes, alpha_hint) for a BLP texture path, or None.
    Looks in the extracted map archive first, then falls back to the retail
    MPQs — most effect materials (flames, glows, clouds) skin themselves with
    stock Blizzard art that the map never carries."""
    base = path.replace("/", "\\").rsplit("\\", 1)[-1]
    for cand in (path.replace("\\", "__"), base,
                 "war3mapImported__" + base):
        full = os.path.join(raw_dir, cand)
        if os.path.exists(full):
            try:
                return _encode(decode_blp(open(full, "rb").read()))
            except Exception:
                return None
    return _stock_texture_png(path)


def _load_sub_mdx(raw_dir: str, path: str):
    """Resolve a referenced attachment-model path to a recovered MDX."""
    base = path.replace("/", "\\").rsplit("\\", 1)[-1]
    stem = base.rsplit(".", 1)[0]
    for cand in (path.replace("\\", "__"), base, stem + ".mdx",
                 "war3mapImported__" + stem + ".mdx"):
        full = os.path.join(raw_dir, cand)
        if os.path.exists(full) and full.lower().endswith(".mdx"):
            try:
                return parse_mdx(open(full, "rb").read())
            except Exception:
                return None
    return None


def _merge_attachment(parent, sub, node, bind_node=None, offset=None) -> None:
    """Bake a separate attachment sub-model into `parent`.

    Placement: sub geosets are translated by `offset` (default: the attach
    node's model-space pivot — where WC3 hangs the attached model).
    Skinning: the baked geometry is rigidly bound to `bind_node` (default: the
    attach node itself), so it follows that joint's animation.

    Textures are de-duplicated by (path, replaceableId): a sub-model that skins
    itself with a texture the parent already carries reuses the parent's slot
    instead of shipping the PNG twice.
    """
    bind = bind_node if bind_node is not None else node
    # texture merge with de-dup against what the parent already has
    key = lambda t: (str(t.path).lower(), int(t.replaceable_id or 0))
    have = {key(t): i for i, t in enumerate(parent.textures)}
    tex_map: dict[int, int] = {}
    for i, t in enumerate(sub.textures):
        k = key(t)
        if k in have:
            tex_map[i] = have[k]
        else:
            tex_map[i] = len(parent.textures)
            have[k] = tex_map[i]
            parent.textures.append(t)
    mat_off = len(parent.materials)
    for m in sub.materials:
        for l in m.layers:
            if l.texture_id in tex_map:
                l.texture_id = tex_map[l.texture_id]
        parent.materials.append(m)
    ox, oy, oz = offset if offset is not None else node.pivot
    for g in sub.geosets:
        g.vertices = [(vx + ox, vy + oy, vz + oz) for vx, vy, vz in g.vertices]
        g.material_id += mat_off
        g.vertex_groups = [0] * len(g.vertices)
        g.matrix_groups = [[bind.object_id]]  # rigid child of the bind joint
        parent.geosets.append(g)


# --- object-data ("sphere") attachments — task #267 -------------------------
# This map hangs PERMANENT body parts on its heroes with WC3 "Sphere" (`Asph`)
# abilities, not with MDX `ATCH` Path fields: the ability's objectArt target
# (`atat`) names a separate .mdx and `objectAttachPoints.targetAttach0` names
# the attach point. 孫悟空's head is such a part — it lives in Gokuhead.mdx and
# was structurally invisible to bake_attachments(), which only ever looked at
# the body's own ATCH nodes. Across all 129 recovered mdx there are ZERO ATCH
# nodes carrying a Path, so that branch had never fired on this map even once
# (models_report: attachments_baked/attachments_skipped are both empty) — which
# is exactly why task #73 could sweep "un-merged sphere/orb geometry" and find
# nothing to merge.
#
# The table is DERIVED, not hand-written: OBJECTS.json gives every hero's
# permanent ability list + its body model, and the ability's base id must be
# `Asph`; INVOCATION_PARAMS.json (task #50) keeps the `atat` art field the
# importer's w3u whitelist drops (task #56).
SPHERE_BASE = "Asph"

# Attach points whose sub-model is authored in the PARENT's model space rather
# than local to the attach point. WC3's `origin` attach point sits at the model
# origin, so an author who exports a head at its real body-space height simply
# hangs it there — the identity transform IS the correct placement.
MODEL_SPACE_ATTACH = {"origin"}

# Bind-joint overrides, per (body mdx, attach point). Placement still comes from
# the attach point; only the joint the baked geometry rides is overridden.
#   goku.mdx/origin → `Head`: the body's own 37-vertex face skin (face.blp) is
#   weighted to `Head`, so a skull rigidly bound to `Origin Ref` would tear away
#   from its own face during Walk/Spell/Death. Riding `Head` keeps face + skull
#   one piece. WC3 got away with origin-binding because it re-renders the orb
#   every frame at the unit's position; a skinned glTF has no such escape hatch.
ATTACH_BIND_OVERRIDE = {
    ("goku.mdx", "origin"): "Head",
}

# WHICH derived rows actually get baked. The table above is a CENSUS — every
# body/ability pair it finds is written to the model report as
# `attachments_available` so nothing is silently dropped again — but only the
# rows listed here become geometry, because "the map hangs a model here" does
# NOT imply "this model is part of the body":
#   • stock Blizzard art paths (Immolation, LightningShield, LargeBuildingFire…)
#     are ambient VFX; they belong to the VFX channel (task #9/#183), and their
#     .mdx is not even in raw/ so they cannot bake anyway.
#   • `poweraura.MDX` on 索隆 is a 1088-tri glow — exactly the always-on effect
#     mesh tasks #17/#59/#73 spent three passes REMOVING.
#   • a second sphere on the SAME attach point is an alternate FORM
#     (Goku3head = 超級賽亞人), which belongs to the transform system (#119/#249),
#     not to the base body — baking both would give 孫悟空 two heads.
# Each entry pins the sub-model's vertex/triangle count, so the bake refuses to
# run against a different mesh than the one that was eyeballed on screen.
SPHERE_BAKE_ALLOW: dict[tuple[str, str], dict] = {
    ("goku.mdx", "A0MI"): {
        "verts": 268, "tris": 332,
        "why": "孫悟空's actual head (Gokuhead.mdx, face.blp). The body mdx has "
               "NO skull — 0 of body256's 817 vertices are weighted to `Head`, "
               "only a 37-vertex face skin is. Owner-reported (#267).",
    },
}


def _attach_tokens(name: str) -> frozenset:
    return frozenset(t for t in re.split(r"[^a-z0-9]+", (name or "").lower())
                     if t and t != "ref")


def _find_attach_node(model, attach: str):
    """Resolve a WC3 attach-point string ("right,hand") to a model node
    ("hand right Ref"), comparing token SETS so word order does not matter."""
    want = _attach_tokens(attach)
    if not want:
        return None
    for nd in model.nodes.values():
        if nd.kind == "attachment" and _attach_tokens(nd.name) == want:
            return nd
    return None


def load_sphere_attachments(objects_path: str, params_path: str) -> dict:
    """Body mdx filename (lowercased) -> [{model, attach, ability, hero}].

    Only PERMANENT attachments count: the ability must be based on `Asph` AND
    sit on the hero's always-on ability list (`abilities`), not the learnable
    hero-ability list. Returns {} if either dataset is missing.
    """
    try:
        with open(objects_path, encoding="utf-8") as fh:
            objects = json.load(fh)
        with open(params_path, encoding="utf-8") as fh:
            params = json.load(fh)
    except (OSError, ValueError):
        return {}
    abilities = objects.get("abilities") or {}
    heroes = objects.get("heroes") or {}
    art: dict[str, dict] = {}
    for rec in params.get("abilities") or []:
        target = ((rec.get("objectArt") or {}).get("target") or {})
        per_level = target.get("perLevel") or {}
        mdx = per_level.get("0") or next(iter(per_level.values()), None)
        attach = (rec.get("objectAttachPoints") or {}).get("targetAttach0")
        if mdx and attach:
            art[str(rec.get("abilityId"))] = {"model": mdx, "attach": attach}
    out: dict[str, list] = {}
    for hid, hero in heroes.items():
        body = str(hero.get("model") or "")
        if not body.lower().endswith(".mdl"):
            continue
        body_mdx = body.rsplit("\\", 1)[-1].rsplit("/", 1)[-1][:-4].lower() + ".mdx"
        for aid in hero.get("abilities") or []:
            if (abilities.get(aid) or {}).get("base") != SPHERE_BASE:
                continue
            spec = art.get(aid)
            if not spec:
                continue
            row = {"model": spec["model"], "attach": spec["attach"],
                   "ability": aid, "hero": hid}
            bucket = out.setdefault(body_mdx, [])
            if row not in bucket:
                bucket.append(row)
    return out


def bake_attachments(model, raw_dir: str, entry: dict,
                     sphere_table: dict | None = None,
                     source: str = "") -> tuple[list, list]:
    """Bake every separate model this body permanently wears.

    Two sources, same baking path:
      1. MDX `ATCH` nodes that carry a Path (the classic WC3 convention).
      2. Object-data `Asph` sphere abilities (`sphere_table`) — how THIS map
         attaches 孫悟空's head and the map-made hand weapons (task #267).
    """
    baked, skipped = [], []
    stem = source.lower()
    jobs = [(nd.attachment_path, nd, None) for nd in model.nodes.values()
            if nd.kind == "attachment" and nd.attachment_path]
    census = []
    for spec in (sphere_table or {}).get(stem, []):
        allow = SPHERE_BAKE_ALLOW.get((stem, spec["ability"]))
        census.append({**spec, "baked": bool(allow)})
        if not allow:
            continue
        node = _find_attach_node(model, spec["attach"])
        if node is None:
            skipped.append(f"{spec['model']} @ {spec['attach']} (no such attach node)")
            continue
        offset = ((0.0, 0.0, 0.0)
                  if _attach_tokens(spec["attach"]) & MODEL_SPACE_ATTACH else None)
        bind_name = ATTACH_BIND_OVERRIDE.get((stem, spec["attach"].lower()))
        bind = next((n for n in model.nodes.values() if n.name == bind_name), None) \
            if bind_name else None
        jobs.append((spec["model"], node, (bind, offset, spec, allow)))
    if census:
        entry["attachments_available"] = census
    for path, node, extra in jobs:
        sub = _load_sub_mdx(raw_dir, path)
        if sub is None:
            skipped.append(path)
            continue
        bind, offset, spec, allow = extra or (None, None, None, None)
        if allow:  # self-checking: refuse a mesh that is not the vetted one
            verts = sum(len(g.vertices) for g in sub.geosets)
            tris = sum(len(g.faces) // 3 for g in sub.geosets)
            if (verts, tris) != (allow["verts"], allow["tris"]):
                skipped.append(
                    f"{path}: {verts}v/{tris}tri != vetted "
                    f"{allow['verts']}v/{allow['tris']}tri"
                )
                continue
        before = len(model.geosets)
        _merge_attachment(model, sub, node, bind_node=bind, offset=offset)
        rec = {"node": node.name, "path": path,
               "geosets": len(model.geosets) - before,
               "verts": sum(len(g.vertices) for g in sub.geosets)}
        if spec:
            rec["ability"] = spec["ability"]
            rec["source"] = "objectdata-sphere"
            rec["bind"] = (bind or node).name
        baked.append(rec)
    if baked:
        entry["attachments_baked"] = baked
    if skipped:
        entry["attachments_skipped"] = skipped
    return baked, skipped


def bake_emitter_quads(model, raw_bytes: bytes) -> list[dict]:
    """Give a geometry-less MDX (pure particle-emitter effect model) SOME
    visible mesh: one geoset of three orthogonal quads per PRE2 emitter, at
    the emitter's pivot, sized from its particle scaling, textured with the
    emitter's own texture through an additive (fm 3) layer — which the
    exporter luma-keys, so black backgrounds vanish and the glow shows.

    Why: the .glb pipeline exports meshes only; a WC3 effect that is nothing
    but emitters (BlackHole, DivineRing, LasercannonfinalRED …) converted to
    an EMPTY .glb — 13 shipped effect models drew zero pixels while abilities
    pointed at them (GH#649). A static glow sprite per emitter is a knowingly
    crude stand-in, but it is visible, keeps the emitter layout (DivineRing's
    20 emitters still draw a ring), and follows the emitter's parent bone.

    Mutates `model` (geosets + materials). Returns a summary for the report;
    [] when the model already has geometry or has no usable emitters.
    """
    if any(g.vertices for g in model.geosets):
        return []
    try:
        from .particles import parse_particles
        pm = parse_particles(raw_bytes)
    except Exception:
        return []
    baked: list[dict] = []
    # ONE geoset (= one draw call) per distinct texture: an MDX geoset carries
    # per-vertex matrix-group indices, so quads bound to different parent
    # bones can still share a geoset (DivineRing: 20 emitters → 2 draws).
    by_tex: dict[int, Geoset] = {}
    for em in pm.emitters2[:24]:
        if em.replaceable_id:
            continue  # team colour/glow billboard — same policy as gltf.py
        size = max([*em.segment_scaling, em.width, em.length, 0.0])
        if size <= 0:
            continue
        h = max(15.0, min(size, 300.0)) / 2.0
        tid = em.texture_id if 0 <= em.texture_id < len(model.textures) else -1
        geo = by_tex.get(tid)
        if geo is None:
            mat_id = len(model.materials)
            model.materials.append(Material(layers=[
                Layer(filter_mode=3, shading_flags=0x10,
                      texture_id=(tid if tid >= 0 else 0), alpha=1.0),
            ]))
            geo = Geoset(vertices=[], normals=[], uvs=[], faces=[],
                         vertex_groups=[], matrix_groups=[],
                         material_id=mat_id)
            by_tex[tid] = geo
            model.geosets.append(geo)
        grp = len(geo.matrix_groups)
        geo.matrix_groups.append(
            [em.parent_id] if em.parent_id in model.nodes else [])
        px, py, pz = em.pivot
        quads = (
            (((-h, -h, 0), (h, -h, 0), (h, h, 0), (-h, h, 0)), (0, 0, 1)),
            (((-h, 0, -h), (h, 0, -h), (h, 0, h), (-h, 0, h)), (0, 1, 0)),
            (((0, -h, -h), (0, h, -h), (0, h, h), (0, -h, h)), (1, 0, 0)),
        )
        for corners, n in quads:
            base = len(geo.vertices)
            for cx, cy, cz in corners:
                geo.vertices.append((px + cx, py + cy, pz + cz))
                geo.normals.append(n)
                geo.vertex_groups.append(grp)
            geo.uvs += [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]
            geo.faces += [base, base + 1, base + 2, base, base + 2, base + 3]
        baked.append({"emitter": em.name, "texture": tid,
                      "half_size": round(h, 1),
                      "pivot": [round(p, 1) for p in em.pivot]})
    return baked


def default_sphere_table(raw_dir: str) -> dict:
    """Locate the two object-data datasets next to `raw_dir` and build the
    permanent-sphere-attachment table (task #267). Missing files → {}."""
    map_dir = os.path.dirname(os.path.abspath(raw_dir))
    out_dir = os.path.dirname(map_dir)
    objects = os.path.join(map_dir + "-src", "OBJECTS.json")
    params = os.path.join(out_dir, "invocation-params", "INVOCATION_PARAMS.json")
    return load_sphere_attachments(objects, params)


def convert_all(raw_dir: str, glb_dir: str, tex_dir: str,
                sphere_table: dict | None = None,
                only: set[str] | None = None,
                team_glow: str = "drop") -> list[dict]:
    """`only`: restrict to the .mdx files whose slug is in the set (targeted
    re-conversion, e.g. GH#649's 26 zero-pixel effect models); None = all.
    `team_glow`: "drop" (角色，出貨至今的行為) / "lit" (純特效模型，GH#767) ——
    見 `w3xlib.gltf.TEAM_GLOW_POLICIES`。"""
    if sphere_table is None:
        sphere_table = default_sphere_table(raw_dir)
    try:
        return _convert_all(raw_dir, glb_dir, tex_dir, sphere_table, only,
                            team_glow)
    finally:
        close_stock_archives()


def _convert_all(raw_dir: str, glb_dir: str, tex_dir: str,
                 sphere_table: dict | None = None,
                 only: set[str] | None = None,
                 team_glow: str = "drop") -> list[dict]:
    os.makedirs(glb_dir, exist_ok=True)
    os.makedirs(tex_dir, exist_ok=True)
    report = []
    files = sorted(
        f for f in os.listdir(raw_dir) if f.lower().endswith(".mdx")
        and (only is None or slug(f[:-4]) in only)
    )
    for fname in files:
        entry = {"source": fname}
        try:
            raw_bytes = open(os.path.join(raw_dir, fname), "rb").read()
            model = parse_mdx(raw_bytes)
            kind = classify(model)
            entry["kind"] = kind
            entry["sequences"] = [s.name for s in model.sequences]

            # bake any separate attachment models (weapons/orbs referenced by
            # ATCH nodes, or by object-data `Asph` spheres) BEFORE texture
            # collection so their textures load too.
            bake_attachments(model, raw_dir, entry,
                             sphere_table=sphere_table, source=fname)

            # geometry-less emitter-only effects: bake placeholder glow quads
            # so the .glb is never a zero-pixel empty shell (GH#649)
            equads = bake_emitter_quads(model, raw_bytes)
            if equads:
                entry["emitter_quads"] = equads

            textures_png: dict[int, bytes] = {}
            tex_alpha: dict[int, str] = {}
            missing = []
            for i, tex in enumerate(model.textures):
                if tex.replaceable_id:
                    # ⭐ GH#767 —— rid-2（隊伍發光）在 `"lit"` 政策下**有真的美術**：
                    #   `ReplaceableTextures\TeamGlow\TeamGlow00.blp`（war3.mpq，
                    #   32×32、形狀住 RGB、alpha 平坦 255）。解出來交給 exporter
                    #   走 luma-key；解不到就退回原本的 drop（fail-open，⛔ 但
                    #   下面 `missing` 會把它喊出來）。
                    if tex.replaceable_id == 2 and team_glow == "lit":
                        got = _find_texture_png(raw_dir, TEAM_GLOW_STOCK_TEXTURE)
                        if got is not None:
                            textures_png[i], tex_alpha[i] = got
                        else:
                            missing.append(TEAM_GLOW_STOCK_TEXTURE)
                    continue  # team color/glow → handled in exporter
                if not tex.path:
                    continue
                got = _find_texture_png(raw_dir, tex.path)
                if got is not None:
                    png, hint = got
                    textures_png[i] = png
                    tex_alpha[i] = hint
                    tex_out = os.path.join(
                        tex_dir, slug(tex.path.rsplit("\\", 1)[-1][:-4]) + ".png"
                    )
                    if not os.path.exists(tex_out):
                        with open(tex_out, "wb") as f:
                            f.write(png)
                else:
                    missing.append(tex.path)
            if missing:
                entry["missing_textures"] = missing

            # two-pass scale: measure at 1.0, then rescale heroes to 1.7 tall
            probe = convert(model, {}, 1.0, fname)
            raw_h = probe.height
            entry["raw_height"] = round(raw_h, 2)
            if kind == "hero" and 10 < raw_h < 500:
                scale = HERO_TARGET_HEIGHT / raw_h
            else:
                scale = DEFAULT_SCALE
            entry["scale_factor"] = round(scale, 5)

            res = convert(model, textures_png, scale, fname, tex_alpha,
                          team_glow=team_glow)
            name = slug(fname[:-4])
            entry["name"] = name
            out = os.path.join(glb_dir, name + ".glb")
            with open(out, "wb") as f:
                f.write(res.glb)
            entry["glb"] = os.path.basename(out)
            entry["glb_size"] = len(res.glb)
            entry["height"] = round(res.height, 3)
            entry["anim_names"] = res.anim_names
            entry["team_color_materials"] = res.team_color_materials
            entry["dropped_glow_materials"] = res.dropped_glow_materials
            entry["lit_glow_materials"] = res.lit_glow_materials
            entry["attach_points"] = res.attach_points
            entry["notes"] = res.notes
            clip = build_clip_map(res.anim_names)
            if clip:
                entry["clip_map"] = clip
            entry["status"] = "ok"
        except Exception as exc:  # keep going; report the failure
            entry["status"] = "error"
            entry["error"] = str(exc)
        report.append(entry)
    return report
