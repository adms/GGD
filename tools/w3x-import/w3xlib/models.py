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
import os
import re

from .blp import decode_blp
from .gltf import convert
from .mdx import parse_mdx
from .mpq import W3XArchive

DEFAULT_SCALE = 1.0 / 36.0
HERO_TARGET_HEIGHT = 1.7

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


def _merge_attachment(parent, sub, node) -> None:
    """Bake a separate attachment sub-model into `parent` at the attachment
    node's transform: sub geosets are translated to the node's (model-space)
    pivot and rigidly bound to the node so they follow its animation."""
    tex_off = len(parent.textures)
    parent.textures += list(sub.textures)
    mat_off = len(parent.materials)
    for m in sub.materials:
        for l in m.layers:
            if l.texture_id >= 0:
                l.texture_id += tex_off
        parent.materials.append(m)
    ox, oy, oz = node.pivot
    for g in sub.geosets:
        g.vertices = [(vx + ox, vy + oy, vz + oz) for vx, vy, vz in g.vertices]
        g.material_id += mat_off
        g.vertex_groups = [0] * len(g.vertices)
        g.matrix_groups = [[node.object_id]]  # rigid child of the attach node
        parent.geosets.append(g)


def bake_attachments(model, raw_dir: str, entry: dict) -> tuple[list, list]:
    """Bake every ATCH node that references a recoverable separate model.
    Records baked/skipped in the model report entry. Most WC3 hero models
    keep weapons/orbs inside their own geosets (nothing to bake here)."""
    baked, skipped = [], []
    for nd in model.nodes.values():
        if nd.kind != "attachment" or not nd.attachment_path:
            continue
        sub = _load_sub_mdx(raw_dir, nd.attachment_path)
        if sub is None:
            skipped.append(nd.attachment_path)
            continue
        _merge_attachment(model, sub, nd)
        baked.append({"node": nd.name, "path": nd.attachment_path,
                      "geosets": len(sub.geosets)})
    if baked:
        entry["attachments_baked"] = baked
    if skipped:
        entry["attachments_skipped"] = skipped
    return baked, skipped


def convert_all(raw_dir: str, glb_dir: str, tex_dir: str) -> list[dict]:
    try:
        return _convert_all(raw_dir, glb_dir, tex_dir)
    finally:
        close_stock_archives()


def _convert_all(raw_dir: str, glb_dir: str, tex_dir: str) -> list[dict]:
    os.makedirs(glb_dir, exist_ok=True)
    os.makedirs(tex_dir, exist_ok=True)
    report = []
    files = sorted(
        f for f in os.listdir(raw_dir) if f.lower().endswith(".mdx")
    )
    for fname in files:
        entry = {"source": fname}
        try:
            model = parse_mdx(open(os.path.join(raw_dir, fname), "rb").read())
            kind = classify(model)
            entry["kind"] = kind
            entry["sequences"] = [s.name for s in model.sequences]

            # bake any separate attachment models (weapons/orbs referenced by
            # ATCH nodes) BEFORE texture collection so their textures load too.
            bake_attachments(model, raw_dir, entry)

            textures_png: dict[int, bytes] = {}
            tex_alpha: dict[int, str] = {}
            missing = []
            for i, tex in enumerate(model.textures):
                if tex.replaceable_id:
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

            res = convert(model, textures_png, scale, fname, tex_alpha)
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
