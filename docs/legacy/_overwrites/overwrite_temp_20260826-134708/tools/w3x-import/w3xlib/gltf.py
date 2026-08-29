"""MDX → glTF 2.0 (.glb) exporter.

Coordinate/scale conversion is BAKED into the data (no root-transform tricks,
since viewers must apply joint transforms, not mesh-node transforms, to skins):

  MDX is Z-up right-handed;   glTF is Y-up right-handed.
  positions/pivots/translations:  (x, y, z) -> s * (x, z, -y)
  rotation quaternions:           (qx,qy,qz,qw) -> (qx, qz, -qy, qw)
  scale tracks:                   (sx,sy,sz) -> (sx, sz, sy)

Skeleton mapping: MDX animates nodes around their PIVOT —
  G(b) = G(parent) * T(pivot) * T(tr) * R(q) * S(s) * T(-pivot)
Substituting H(b) = G(b) * T(pivot_b) gives a plain glTF TRS hierarchy with
  node.translation = pivot_b - pivot_parent (+ tr)   and   IBM_b = T(-pivot_b).

Animation: KGTR/KGRT/KGSC keys inside each sequence interval become one glTF
animation per sequence. Linear/step keys are emitted verbatim; Hermite/Bezier
keys are resampled at 30 fps to LINEAR. Global-sequence tracks are left static
(noted in the result). Rotation interpolation between samples is nlerp.
"""

from __future__ import annotations

import io
import json
import math
import struct
from dataclasses import dataclass, field

from .mdx import MDXModel, Track

FPS = 30.0


@dataclass
class ConvertResult:
    glb: bytes
    notes: list[str] = field(default_factory=list)
    height: float = 0.0  # converted (post-scale) model height in glTF units
    anim_names: list[str] = field(default_factory=list)
    team_color_materials: list[str] = field(default_factory=list)
    dropped_glow_materials: list[str] = field(default_factory=list)
    lit_glow_materials: list[str] = field(default_factory=list)
    dropped_effect_geosets: list = field(default_factory=list)
    attach_points: dict = field(default_factory=dict)


def _v(p, s):  # position/translation basis change
    return (p[0] * s, p[2] * s, -p[1] * s)


def _q(q):  # quaternion basis change
    return (q[0], q[2], -q[1], q[3])


def _s3(v):  # scale-track basis change
    return (v[0], v[2], v[1])


def _norm_q(q):
    m = math.sqrt(sum(c * c for c in q)) or 1.0
    return tuple(c / m for c in q)


# --- effect-geoset guard (task #17) -----------------------------------------
# WC3 particle/emitter effects (giant beams, ground rings, glow billboards) are
# sometimes authored as ordinary GEOS geosets. Baked as solid geometry they
# inflate the model bbox and — worse — when the biggest such geoset is picked as
# the "body" for hero-height normalization, the whole character is mis-scaled
# (e.g. Nanoha rendered ~10u tall + a 14.5u invisible team-glow beam). These
# knobs decide when a glow geoset is a STRAY EFFECT that must be dropped.
EFFECT_TOP_MARGIN = 0.35    # top clears body-top by >35% of body height
EFFECT_BEAM_HFRAC = 0.9     # spans ~the whole body height (a beam/pillar) ...
EFFECT_BEAM_MAXVERTS = 48   # ... while being just a few verts
EFFECT_WIDE_XZ = 1.8        # reaches >1.8x the body's own footprint (a ring)
EFFECT_DETACH_FRAC = 0.05   # floats entirely above the body top


def _layer_rid(model, layer) -> int:
    tid = layer.texture_id
    return (model.textures[tid].replaceable_id
            if 0 <= tid < len(model.textures) else 0)


#: ⭐ GH#767 —— replaceableId-2（隊伍發光）的**兩種政策**。
#:
#: `"drop"`  出貨至今的行為：`baseColorFactor [0,0,0,0]` ⇒ 那一片幾何**必不可見**。
#:           ⚠️ 它對**角色**是對的（隊伍發光在角色身上是肩膀/腳下的色塊，
#:           GGD 沒有隊伍色可以套，畫成白光會變成一團不屬於那個角色的亮斑）。
#: `"lit"`   ⭐ 對**純特效模型**才對：ReviveHuman / Awaken 這一族的**主體本身**
#:           就是一片 rid-2 的加法發光柱（`Textures` 之外的美術在
#:           `ReplaceableTextures\TeamGlow\TeamGlow00.blp`，**MPQ 裡真的有**，
#:           32×32、形狀住 RGB、alpha 平坦 255 ⇒ 正是 GH#649 那個
#:           「亮在黑底上、沒有 alpha 可以 key」的家族）。
#:           ⇒ 用**同一條** luma-key 路徑把它變成 emissive 加法發光。
#:
#: ⚠️ 為什麼**不是**全域改成 `"lit"`：量到 51 份地圖模型帶 rid-2 材質，其中
#: **49 份是角色**（heroSaber / goku / cloud …）。全域打開＝替 49 個角色加上
#: 一團沒有人裁決過的白光。⇒ 政策由**呼叫端**選：`import_w3x.py`（地圖角色）維持
#: `"drop"`，`convert_stock_model.py`（表格裡每一列都是 `Abilities\Spells\…`
#: 的**特效**模型）用 `"lit"`。
#: ⭐ 可反駁：哪天 `STOCK_MODELS` 收進一具真的角色模型，這個分界線就不成立 ——
#: 到時候要改成逐列的旗標，⛔ 不是繼續假設「stock ⇒ 特效」。
TEAM_GLOW_POLICIES = ("drop", "lit")


def _material_effect_kind(model, mid: int, team_glow: str = "drop") -> str:
    """Classify how material `mid` renders (mirrors gltf_material()'s branches):
      ""            solid body/skin or team-colour → keep
      "team_glow"   replaceableId-2 billboard → rendered INVISIBLE in-game, so
                    dropping its geometry is a visual no-op (safe to prune)
      "additive"    emissive glow quad (additive real-texture, no opaque base)
                    → VISIBLE, so only drop it when it clearly leaves the body

    ⭐ `team_glow="lit"` ⇒ rid-2 也是真的會發光的加法幾何 ⇒ 回報 `"additive"`，
    這樣它就吃**比較保守**的那條剔除規則（只有明顯離開身體才剔），⛔ 不會再被
    「隊伍發光反正看不見，寬的就剔掉」那一條順手砍掉。
    """
    layers = model.materials[mid].layers if 0 <= mid < len(model.materials) else []
    if not layers:
        return ""
    real = [l for l in layers if _layer_rid(model, l) == 0]
    rids = {_layer_rid(model, l) for l in layers}
    has_opaque_base = any(l.filter_mode == 0 for l in layers)
    if not real:
        if 1 in rids:
            return ""              # team-COLOUR body region → solid, keep
        if 2 not in rids:
            return ""
        return "additive" if team_glow == "lit" else "team_glow"
    disp = next((l for l in real if l.filter_mode == 0), real[0])
    return "additive" if (disp.filter_mode >= 3 and not has_opaque_base) else ""


def _material_is_effect(model, mid: int) -> bool:
    return bool(_material_effect_kind(model, mid))


def _geoset_bbox(geoset, scale: float):
    mins = [1e30] * 3
    maxs = [-1e30] * 3
    for vtx in geoset.vertices:
        p = _v(vtx, scale)
        for k in range(3):
            if p[k] < mins[k]:
                mins[k] = p[k]
            if p[k] > maxs[k]:
                maxs[k] = p[k]
    return mins, maxs


def classify_geosets(model, scale: float = 1.0, team_glow: str = "drop"):
    """Split a model's geosets into character BODY vs stray EFFECT geometry.

    Returns ``(info, (body_min, body_max))`` where ``info[i]`` is a dict with
    keys ``index, verts, effect_material, drop, reason, mins, maxs`` and the
    body bbox is the union of the *non-effect* geosets — the silhouette the
    importer normalizes to ~1.7u.

    A geoset is DROPPED only when it is BOTH an effect material AND a clear
    geometric outlier: it towers above the body, spans the body like a thin
    beam, floats detached above it, or reaches far outside its footprint. This
    is deliberately conservative — in-silhouette glow details (held energy
    blades, eye glows, the ground ring under the feet) and every opaque or
    team-colour body part are KEPT. Pure measurement; no side effects.
    """
    geos = []
    for i, g in enumerate(model.geosets):
        mins, maxs = _geoset_bbox(g, scale) if g.vertices else ([0.0] * 3, [0.0] * 3)
        kind = _material_effect_kind(model, g.material_id, team_glow)
        geos.append({
            "index": i,
            "verts": len(g.vertices),
            "effect_kind": kind,
            "effect_material": bool(kind),
            "material": g.material_id,
            "mins": mins,
            "maxs": maxs,
        })
    body_src = [x for x in geos if x["verts"] and not x["effect_material"]] \
        or [x for x in geos if x["verts"]]
    if body_src:
        bmin = [min(x["mins"][k] for x in body_src) for k in range(3)]
        bmax = [max(x["maxs"][k] for x in body_src) for k in range(3)]
    else:
        bmin, bmax = [0.0] * 3, [0.0] * 3
    body_h = bmax[1] - bmin[1]
    body_top = bmax[1]
    body_xz = max(abs(bmin[0]), abs(bmax[0]), abs(bmin[2]), abs(bmax[2]))
    for x in geos:
        reasons = []
        if x["effect_material"] and x["verts"] and body_h > 1e-6:
            gtop, gbot = x["maxs"][1], x["mins"][1]
            gh = gtop - gbot
            gxz = max(abs(x["mins"][0]), abs(x["maxs"][0]),
                      abs(x["mins"][2]), abs(x["maxs"][2]))
            towers = gtop > body_top + EFFECT_TOP_MARGIN * body_h
            beam = (gh > EFFECT_BEAM_HFRAC * body_h
                    and x["verts"] <= EFFECT_BEAM_MAXVERTS
                    and gtop > body_top)           # a pillar that pokes out
            detached = (gbot >= body_top - EFFECT_DETACH_FRAC * body_h
                        and gtop > body_top)
            wide = gxz > EFFECT_WIDE_XZ * max(body_xz, 1e-6)
            if towers:
                reasons.append(f"top {gtop:.2f} >> body_top {body_top:.2f}")
            if beam:
                reasons.append(f"beam h {gh:.2f}~body {body_h:.2f} ({x['verts']}v)")
            if detached:
                reasons.append("floats above body")
            # A VISIBLE additive glow is only dropped when it clearly leaves the
            # body upward (tower/beam/detached) — an in-silhouette glow (fire
            # ring, energy blade, eye glow) stays. A team-glow billboard renders
            # invisible anyway, so a wide ground ring may also be pruned.
            if x["effect_kind"] == "team_glow" and wide:
                reasons.append(f"reaches |xz| {gxz:.2f} >> body {body_xz:.2f}")
        x["drop"] = bool(reasons)
        x["reason"] = "; ".join(reasons)
    return geos, (bmin, bmax)


def _sample_track(track: Track, start: int, end: int, is_quat: bool):
    """Keys (frame,value) within [start,end], resampled if hermite/bezier.
    Returns [] if the track has nothing inside the interval."""
    keys = [(f, v) for f, v in track.keys if start <= f <= end]
    if not keys:
        return []
    keys.sort(key=lambda kv: kv[0])
    dedup = []
    for f, v in keys:
        if dedup and dedup[-1][0] == f:
            dedup[-1] = (f, v)
        else:
            dedup.append((f, v))
    keys = dedup
    if track.interp >= 2 and len(keys) > 1:  # resample hermite/bezier @30fps
        out = []
        step = 1000.0 / FPS
        t = float(keys[0][0])
        # stop half a step short of the final key: a resampled time landing
        # (near-)on the final key would collapse into a duplicate sampler
        # input once times are quantized to float32 seconds
        while t < keys[-1][0] - step * 0.5:
            out.append((t, _eval_linear(keys, t, is_quat)))
            t += step
        out.append((float(keys[-1][0]), keys[-1][1]))
        keys = out
    # pad so the pose holds across the whole sequence
    if keys[0][0] > start:
        keys.insert(0, (float(start), keys[0][1]))
    if keys[-1][0] < end:
        keys.append((float(end), keys[-1][1]))
    return keys


def _hold_value(track: Track, at: int):
    """Track value when a sequence has no keys of its own: WC3 holds the
    nearest key at/before the sequence start (else the first key after)."""
    prev = None
    for f, v in sorted(track.keys, key=lambda kv: kv[0]):
        if f <= at:
            prev = v
        else:
            return prev if prev is not None else v
    return prev


def _quantize_times(keys, start: int):
    """(frame_ms, value) → (sec_float32, value), strictly increasing.

    Sampler input times are stored as float32 seconds; two distinct
    millisecond frames can collapse onto the same float32 value, and glTF
    forbids duplicate sampler inputs (Babylon divides by the key delta →
    NaN poses / snapping). Keep the LAST value for a collapsed time."""
    out: list[tuple[float, object]] = []
    for f, v in keys:
        sec = struct.unpack("<f", struct.pack("<f", (f - start) / 1000.0))[0]
        if out and sec <= out[-1][0]:
            out[-1] = (out[-1][0], v)
        else:
            out.append((sec, v))
    return out


def _eval_linear(keys, t, is_quat):
    if t <= keys[0][0]:
        return keys[0][1]
    if t >= keys[-1][0]:
        return keys[-1][1]
    for i in range(1, len(keys)):
        if keys[i][0] >= t:
            f0, v0 = keys[i - 1]
            f1, v1 = keys[i]
            u = (t - f0) / (f1 - f0) if f1 > f0 else 0.0
            if is_quat:
                d = sum(a * b for a, b in zip(v0, v1))
                sgn = 1.0 if d >= 0 else -1.0
                v = tuple(a + (sgn * b - a) * u for a, b in zip(v0, v1))
                return _norm_q(v)
            return tuple(a + (b - a) * u for a, b in zip(v0, v1))
    return keys[-1][1]


class _Buf:
    def __init__(self):
        self.data = bytearray()
        self.views = []
        self.accessors = []

    def add(self, blob: bytes, target: int | None, accessor: dict) -> int:
        while len(self.data) % 4:
            self.data.append(0)
        view = {"buffer": 0, "byteOffset": len(self.data), "byteLength": len(blob)}
        if target:
            view["target"] = target
        self.data += blob
        self.views.append(view)
        accessor["bufferView"] = len(self.views) - 1
        self.accessors.append(accessor)
        return len(self.accessors) - 1

    def add_blob(self, blob: bytes) -> int:
        """Raw bufferView (images)."""
        while len(self.data) % 4:
            self.data.append(0)
        self.views.append(
            {"buffer": 0, "byteOffset": len(self.data), "byteLength": len(blob)}
        )
        self.data += blob
        return len(self.views) - 1


NEUTRAL_TEAM = [0.55, 0.55, 0.60, 1.0]  # untinted team-color base


def convert(model: MDXModel, textures_png: dict[int, bytes], scale: float,
            model_name: str, tex_alpha: dict[int, str] | None = None,
            team_glow: str = "drop") -> ConvertResult:
    """textures_png: MDX texture index -> PNG bytes (placeholders included).
    tex_alpha:  MDX texture index -> 'opaque'|'mask'|'blend' (from the decoded
    image's alpha channel), used to choose glTF alphaMode MASK vs BLEND.
    team_glow:  see TEAM_GLOW_POLICIES — "drop" (角色) or "lit" (純特效模型)."""
    if team_glow not in TEAM_GLOW_POLICIES:
        raise ValueError(f"team_glow must be one of {TEAM_GLOW_POLICIES}: {team_glow!r}")
    tex_alpha = tex_alpha or {}
    used_ext: set[str] = set()
    res = ConvertResult(glb=b"")
    buf = _Buf()
    gltf: dict = {
        "asset": {"version": "2.0", "generator": "ggd-w3x-import"},
        "scenes": [{"nodes": []}],
        "scene": 0,
        "nodes": [],
        "meshes": [],
    }

    # ---- nodes / skeleton ---------------------------------------------------
    obj_ids = sorted(model.nodes.keys())
    node_index: dict[int, int] = {}
    for oid in obj_ids:
        node_index[oid] = len(gltf["nodes"])
        gltf["nodes"].append({"name": model.nodes[oid].name or f"node{oid}"})
    children: dict[int, list[int]] = {}
    roots: list[int] = []
    for oid in obj_ids:
        nd = model.nodes[oid]
        piv = _v(nd.pivot, scale)
        if nd.parent_id in node_index:
            pp = _v(model.nodes[nd.parent_id].pivot, scale)
            children.setdefault(nd.parent_id, []).append(node_index[oid])
        else:
            pp = (0.0, 0.0, 0.0)
            roots.append(node_index[oid])
        gltf["nodes"][node_index[oid]]["translation"] = [
            piv[0] - pp[0], piv[1] - pp[1], piv[2] - pp[2],
        ]
    for oid, kids in children.items():
        gltf["nodes"][node_index[oid]]["children"] = kids
    if roots:
        # single armature root so viewers find a common skeleton root
        gltf["nodes"].append({"name": "Armature", "children": roots})
        gltf["scenes"][0]["nodes"].append(len(gltf["nodes"]) - 1)

    # ---- materials / textures ----------------------------------------------
    gltf["materials"] = []
    gltf["textures"] = []
    gltf["images"] = []
    gltf["samplers"] = [{"wrapS": 10497, "wrapT": 10497}]
    tex_to_gltf: dict[int, int] = {}

    def gltf_texture(tex_id: int) -> int:
        if tex_id in tex_to_gltf:
            return tex_to_gltf[tex_id]
        png = textures_png.get(tex_id)
        if png is None:
            png = _gray_png()
        view = buf.add_blob(png)
        gltf["images"].append({"bufferView": view, "mimeType": "image/png"})
        gltf["textures"].append(
            {"source": len(gltf["images"]) - 1, "sampler": 0}
        )
        tex_to_gltf[tex_id] = len(gltf["textures"]) - 1
        return tex_to_gltf[tex_id]

    luma_to_gltf: dict[int, int] = {}

    def gltf_texture_luma(tex_id: int) -> int:
        """Additive-glow art with no alpha channel gets one derived from its
        own luminance (alpha := max(R,G,B)): black background -> transparent,
        bright glow -> visible. This approximates WC3 additive blending in
        plain glTF BLEND — the scene has no bloom/GlowLayer, so the previous
        policy (baseColorFactor [0,0,0,0], "drop the quad") left 28 shipped
        effect .glbs drawing ZERO pixels (GH#649). Cached separately from
        gltf_texture: other materials may still want the original image."""
        if tex_id in luma_to_gltf:
            return luma_to_gltf[tex_id]
        from PIL import Image, ImageChops  # local: PIL already required by blp.py
        png = textures_png.get(tex_id)
        if png is not None:
            img = Image.open(io.BytesIO(png)).convert("RGBA")
        else:
            # texture genuinely unresolvable -> soft gray placeholder so the
            # geometry is at least visible (never zero pixels again)
            img = Image.new("RGBA", (8, 8), (150, 150, 150, 255))
        r, g, b, _a = img.split()
        img.putalpha(ImageChops.lighter(ImageChops.lighter(r, g), b))
        out = io.BytesIO()
        img.save(out, "PNG")
        view = buf.add_blob(out.getvalue())
        gltf["images"].append({"bufferView": view, "mimeType": "image/png"})
        gltf["textures"].append(
            {"source": len(gltf["images"]) - 1, "sampler": 0}
        )
        luma_to_gltf[tex_id] = len(gltf["textures"]) - 1
        return luma_to_gltf[tex_id]

    mat_index: dict[int, int] = {}

    def _rid(l) -> int:
        return (model.textures[l.texture_id].replaceable_id
                if 0 <= l.texture_id < len(model.textures) else 0)

    def gltf_material(mid: int) -> int:
        if mid in mat_index:
            return mat_index[mid]
        layers = model.materials[mid].layers if mid < len(model.materials) else []
        real = [l for l in layers if _rid(l) == 0]
        repl = [l for l in layers if _rid(l) in (1, 2)]
        # a fm0 layer anywhere is a solid base: overlays composite over it, so
        # the material as a whole is opaque (fixes weapons/armour that carry a
        # team-colour base + a blended detail layer rendering see-through).
        has_opaque_base = any(l.filter_mode == 0 for l in layers)
        pbr = {"metallicFactor": 0.0, "roughnessFactor": 1.0}
        mat: dict = {"name": f"mat{mid}", "pbrMetallicRoughness": pbr,
                     "doubleSided": bool(any(
                         l.shading_flags & 0x10 or l.filter_mode >= 2
                         for l in layers))}

        def set_mask():
            mat["alphaMode"] = "MASK"
            mat["alphaCutoff"] = 0.5

        if real:
            # display the "detail" layer: an opaque (fm0) real layer wins as the
            # solid base, else the first real layer.
            disp = next((l for l in real if l.filter_mode == 0), real[0])
            fm = disp.filter_mode
            hint = tex_alpha.get(disp.texture_id, "opaque")
            if fm >= 3 and not has_opaque_base:
                # glow GEOMETRY (energy blade / orb): emissive so it reads as
                # light, never an opaque black quad.
                if hint == "opaque":
                    # solid bright-on-black glow: no alpha channel to key on.
                    # Derive one from luminance instead of dropping the quad —
                    # the drop policy made 28 shipped effect .glbs (beam
                    # cannons, novas, auras) draw zero pixels (GH#649).
                    tix = gltf_texture_luma(disp.texture_id)
                    res.notes.append(
                        f"mat{mid}: additive glow w/o alpha → luma-keyed")
                else:
                    tix = gltf_texture(disp.texture_id)
                mat["emissiveTexture"] = {"index": tix}
                mat["emissiveFactor"] = [1.0, 1.0, 1.0]
                mat["extensions"] = {"KHR_materials_emissive_strength":
                                     {"emissiveStrength": 2.0}}
                used_ext.add("KHR_materials_emissive_strength")
                mat["alphaMode"] = "BLEND"
                pbr["baseColorTexture"] = {"index": tix}
            else:
                pbr["baseColorTexture"] = {"index": gltf_texture(disp.texture_id)}
                if has_opaque_base:
                    pass  # OPAQUE (glTF default)
                elif fm == 1:
                    if hint == "blend":
                        mat["alphaMode"] = "BLEND"
                    else:
                        set_mask()
                elif fm == 2:
                    if hint == "mask":
                        set_mask()
                    else:
                        mat["alphaMode"] = "BLEND"
                elif fm == 0 and hint == "mask":
                    set_mask()  # fm0 texture with genuine 1-bit cut-out
        elif any(_rid(l) == 1 for l in repl):
            # TEAM COLOUR body region → neutral opaque tint the CLIENT recolours
            # (flagged in teamTintMaterials). Opaque = no see-through gray ghost.
            mat["name"] = f"TeamColor{mid}"
            res.team_color_materials.append(mat["name"])
            pbr["baseColorFactor"] = list(NEUTRAL_TEAM)
            mat["alphaMode"] = "OPAQUE"
        elif repl:
            # TEAM GLOW (replaceableId 2): coloured additive billboard.
            glow = next((l for l in repl if _rid(l) == 2
                         and l.texture_id in textures_png), None)
            if team_glow == "lit" and glow is not None:
                # ⭐ GH#767 —— 這一片**不是**一塊沒有美術的色塊：rid-2 的美術
                # 就是 `ReplaceableTextures\TeamGlow\TeamGlow00.blp`，而它是
                # 「亮在黑底上、alpha 平坦 255」⇒ 逐位元就是 GH#649 那一族。
                # ⇒ 走**同一條** luma-key 路徑（alpha := max(R,G,B)），⛔ 不要
                # 再發明第二種處理方式。
                tix = gltf_texture_luma(glow.texture_id)
                mat["name"] = f"TeamGlow{mid}"
                res.lit_glow_materials.append(mat["name"])
                mat["emissiveTexture"] = {"index": tix}
                mat["emissiveFactor"] = [1.0, 1.0, 1.0]
                mat["extensions"] = {"KHR_materials_emissive_strength":
                                     {"emissiveStrength": 2.0}}
                used_ext.add("KHR_materials_emissive_strength")
                mat["alphaMode"] = "BLEND"
                pbr["baseColorTexture"] = {"index": tix}
                res.notes.append(
                    f"mat{mid}: team glow (rid2) → luma-keyed VISIBLE (GH#767)")
            else:
                # we cannot tint it — drop it (fully transparent) so there is
                # no gray blob.
                mat["name"] = f"TeamGlow{mid}"
                res.dropped_glow_materials.append(mat["name"])
                pbr["baseColorFactor"] = [0, 0, 0, 0]
                mat["alphaMode"] = "BLEND"
        else:
            pbr["baseColorFactor"] = [0.5, 0.5, 0.5, 1.0]
        gltf["materials"].append(mat)
        mat_index[mid] = len(gltf["materials"]) - 1
        return mat_index[mid]

    # ---- skin ---------------------------------------------------------------
    skin_index = None
    if obj_ids:
        ibms = b""
        for oid in obj_ids:
            piv = _v(model.nodes[oid].pivot, scale)
            ibm = [
                1, 0, 0, 0,
                0, 1, 0, 0,
                0, 0, 1, 0,
                -piv[0], -piv[1], -piv[2], 1,
            ]
            ibms += struct.pack("<16f", *ibm)
        acc = buf.add(ibms, None, {
            "componentType": 5126, "count": len(obj_ids), "type": "MAT4",
        })
        gltf["skins"] = [{
            "joints": [node_index[o] for o in obj_ids],
            "inverseBindMatrices": acc,
        }]
        skin_index = 0

    # ---- geosets → mesh primitives -----------------------------------------
    # Effect/particle geosets (giant beams, ground rings, glow billboards a WC3
    # particle emitter drove) are DROPPED from the baked body mesh — they belong
    # in the VFX channel, and baking them as solid geometry both inflates the
    # bbox and (when the biggest is mistaken for the body) wrecks hero-height
    # normalization. The body "height" is the union of the KEPT body geosets,
    # not a single max-vertex geoset. See classify_geosets().
    geo_info, (body_min, body_max) = classify_geosets(model, scale)
    prims = []
    for gi, g in enumerate(model.geosets):
        if geo_info[gi]["drop"]:
            res.dropped_effect_geosets.append({
                "geoset": gi, "verts": geo_info[gi]["verts"],
                "material": g.material_id, "reason": geo_info[gi]["reason"],
            })
            continue
        n = len(g.vertices)
        pos = bytearray()
        nrm = bytearray()
        uv = bytearray()
        mins = [1e30] * 3
        maxs = [-1e30] * 3
        for i in range(n):
            p = _v(g.vertices[i], scale)
            for k in range(3):
                mins[k] = min(mins[k], p[k])
                maxs[k] = max(maxs[k], p[k])
            pos += struct.pack("<3f", *p)
            nv = _v(g.normals[i], 1.0) if i < len(g.normals) else (0, 1, 0)
            ln = math.sqrt(sum(c * c for c in nv)) or 1.0
            nrm += struct.pack("<3f", nv[0] / ln, nv[1] / ln, nv[2] / ln)
            u, vv = g.uvs[i] if i < len(g.uvs) else (0.0, 0.0)
            uv += struct.pack("<2f", u, vv)
        attrs = {}
        attrs["POSITION"] = buf.add(bytes(pos), 34962, {
            "componentType": 5126, "count": n, "type": "VEC3",
            "min": [round(v, 6) for v in mins], "max": [round(v, 6) for v in maxs],
        })
        attrs["NORMAL"] = buf.add(bytes(nrm), 34962, {
            "componentType": 5126, "count": n, "type": "VEC3",
        })
        attrs["TEXCOORD_0"] = buf.add(bytes(uv), 34962, {
            "componentType": 5126, "count": n, "type": "VEC2",
        })
        if skin_index is not None:
            joints = bytearray()
            weights = bytearray()
            for i in range(n):
                gi = g.vertex_groups[i] if i < len(g.vertex_groups) else 0
                grp = (
                    g.matrix_groups[gi]
                    if 0 <= gi < len(g.matrix_groups)
                    else []
                )
                js = [obj_ids.index(b) for b in grp[:4] if b in node_index] or [0]
                w = 1.0 / len(js)
                jw = js + [0] * (4 - len(js))
                ws = [w] * len(js) + [0.0] * (4 - len(js))
                joints += struct.pack("<4H", *jw)
                weights += struct.pack("<4f", *ws)
            attrs["JOINTS_0"] = buf.add(bytes(joints), 34962, {
                "componentType": 5123, "count": n, "type": "VEC4",
            })
            attrs["WEIGHTS_0"] = buf.add(bytes(weights), 34962, {
                "componentType": 5126, "count": n, "type": "VEC4",
            })
        idx = struct.pack("<%dH" % len(g.faces), *g.faces)
        indices = buf.add(idx, 34963, {
            "componentType": 5123, "count": len(g.faces), "type": "SCALAR",
        })
        prims.append({
            "attributes": attrs,
            "indices": indices,
            "material": gltf_material(g.material_id),
        })
    if prims:
        gltf["meshes"].append({"name": model.name or model_name, "primitives": prims})
        mesh_node = {"name": "mesh", "mesh": 0}
        if skin_index is not None:
            mesh_node["skin"] = 0
        gltf["nodes"].append(mesh_node)
        gltf["scenes"][0]["nodes"].append(len(gltf["nodes"]) - 1)

    # ---- animations ---------------------------------------------------------
    gltf["animations"] = []
    used_names: set[str] = set()
    for seq in model.sequences:
        name = seq.name
        while name in used_names:
            name += "_"
        used_names.add(name)
        channels = []
        samplers = []
        for oid in obj_ids:
            nd = model.nodes[oid]
            base_t = gltf["nodes"][node_index[oid]]["translation"]
            for track, path, is_quat in (
                (nd.translation, "translation", False),
                (nd.rotation, "rotation", True),
                (nd.scaling, "scale", False),
            ):
                if track is None:
                    continue
                if track.global_seq >= 0:
                    continue  # global sequences stay static
                keys = _sample_track(track, seq.start, seq.end, is_quat)
                interp = track.interp
                if not keys:
                    if not track.keys:
                        continue
                    # keys exist only OUTSIDE this sequence: emit a 1-key
                    # hold so the bone is pinned to ITS pose for this clip —
                    # otherwise it keeps whatever pose the previously played
                    # clip left (stale cross-clip poses read as spasming
                    # when states switch quickly)
                    hv = _hold_value(track, seq.start)
                    if hv is None:
                        continue
                    keys = [(seq.start, hv)]
                    interp = 0  # STEP
                qkeys = _quantize_times(keys, seq.start)
                times = b""
                vals = b""
                out_type = "VEC4" if is_quat else "VEC3"
                for sec, v in qkeys:
                    times += struct.pack("<f", sec)
                    if path == "translation":
                        c = _v(v, scale)
                        vals += struct.pack(
                            "<3f", base_t[0] + c[0], base_t[1] + c[1], base_t[2] + c[2]
                        )
                    elif path == "rotation":
                        q = _norm_q(_q(v))
                        vals += struct.pack("<4f", *q)
                    else:
                        vals += struct.pack("<3f", *_s3(v))
                t_acc = buf.add(times, None, {
                    "componentType": 5126, "count": len(qkeys), "type": "SCALAR",
                    "min": [round(qkeys[0][0], 6)],
                    "max": [round(qkeys[-1][0], 6)],
                })
                v_acc = buf.add(vals, None, {
                    "componentType": 5126, "count": len(qkeys), "type": out_type,
                })
                samplers.append({
                    "input": t_acc, "output": v_acc,
                    "interpolation": "STEP" if interp == 0 else "LINEAR",
                })
                channels.append({
                    "sampler": len(samplers) - 1,
                    "target": {"node": node_index[oid], "path": path},
                })
        if not channels and obj_ids:
            # sequence with no keys inside its interval: emit a static clip so
            # the logical animation still exists for clipMap consumers
            oid = obj_ids[0]
            base_t = gltf["nodes"][node_index[oid]]["translation"]
            dur = max(0.001, (seq.end - seq.start) / 1000.0)
            t_acc = buf.add(struct.pack("<2f", 0.0, dur), None, {
                "componentType": 5126, "count": 2, "type": "SCALAR",
                "min": [0.0], "max": [round(dur, 6)],
            })
            v_acc = buf.add(struct.pack("<6f", *base_t, *base_t), None, {
                "componentType": 5126, "count": 2, "type": "VEC3",
            })
            samplers.append({"input": t_acc, "output": v_acc,
                             "interpolation": "STEP"})
            channels.append({"sampler": 0,
                             "target": {"node": node_index[oid],
                                        "path": "translation"}})
        if channels:
            gltf["animations"].append(
                {"name": name, "channels": channels, "samplers": samplers}
            )
            res.anim_names.append(name)
    if not gltf["animations"]:
        del gltf["animations"]

    # ---- attach points ------------------------------------------------------
    for oid in obj_ids:
        nd = model.nodes[oid]
        if nd.kind == "attachment":
            piv = _v(nd.pivot, scale)
            key = nd.name.replace(" Ref", "").replace(" ref", "").strip()
            if key:
                res.attach_points[key] = {
                    "x": round(piv[0], 4), "y": round(piv[1], 4),
                    "z": round(piv[2], 4),
                }

    # ---- assemble GLB -------------------------------------------------------
    if used_ext:
        gltf["extensionsUsed"] = sorted(used_ext)
    gltf["buffers"] = [{"byteLength": len(buf.data)}]
    gltf["bufferViews"] = buf.views
    gltf["accessors"] = buf.accessors
    if model.skipped_chunks:
        skipped = sorted(set(model.skipped_chunks))
        res.notes.append("skipped MDX chunks: " + ",".join(skipped))
    if res.dropped_effect_geosets:
        res.notes.append(
            "dropped stray effect geosets: "
            + ", ".join(f"#{d['geoset']}({d['verts']}v)"
                        for d in res.dropped_effect_geosets)
        )
    # body height = union bbox of the KEPT (non-effect) geosets
    res.height = (body_max[1] - body_min[1]) if prims else 0.0
    res.glb = _pack_glb(gltf, bytes(buf.data))
    return res


def _pack_glb(gltf: dict, bin_data: bytes) -> bytes:
    js = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    js += b" " * ((4 - len(js) % 4) % 4)
    bin_data += b"\x00" * ((4 - len(bin_data) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(bin_data)
    out = struct.pack("<III", 0x46546C67, 2, total)
    out += struct.pack("<II", len(js), 0x4E4F534A) + js
    out += struct.pack("<II", len(bin_data), 0x004E4942) + bin_data
    return out


_GRAY_PNG_CACHE: bytes | None = None


def _gray_png() -> bytes:
    global _GRAY_PNG_CACHE
    if _GRAY_PNG_CACHE is None:
        import io
        from PIL import Image

        img = Image.new("RGB", (8, 8), (128, 128, 128))
        b = io.BytesIO()
        img.save(b, "PNG")
        _GRAY_PNG_CACHE = b.getvalue()
    return _GRAY_PNG_CACHE
