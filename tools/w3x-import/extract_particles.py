#!/usr/bin/env python3
"""Extract WC3 MDX particle emitters (PRE2/RIBB/EVTS) into extended vfx docs.

Reads tools/w3x-import/out/GoDieEX22s/raw/*.mdx (the map's models), emits:

  content/vfx/godie-<modelstem>-p<i>.json   one extended vfx@1 per PRE2
  content/vfx/godie-<modelstem>-r<i>.json   one ribbon@1 per RIBB
  content/config/ambient-vfx.json           hero modelKey -> ambient vfx ids
  content/assets/textures/particles/wc3/    map-archive particle textures (PNG)
  tools/w3x-import/out/GoDieEX22s/PARTICLES.md  summary + substitutions + EVTS

Scale: uses the SAME per-model factor the glb exporter baked into the mesh
(models_report.json `scale_factor`: heroes are normalized to 1.7 units tall,
everything else uses DEFAULT_SCALE = 1/36). All WC3-unit quantities (width,
speed, gravity, segment scaling, ribbon heights) are multiplied by it.

Deliberately standalone: imports only w3xlib.particles (new module), never
mdx.py / gltf.py / models.py (owned by the animation agent).

Usage:  python3 extract_particles.py [--dry-run]
"""

from __future__ import annotations

import json
import os
import re
import shutil
import sys
import zlib
from collections import OrderedDict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from w3xlib.particles import parse_particles  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(HERE, "out", "GoDieEX22s")
RAW_DIR = os.path.join(OUT, "raw")
MAP_TEX_DIR = os.path.join(OUT, "textures")
REPORT_PATH = os.path.join(OUT, "models_report.json")
CONTENT = os.path.join(REPO, "content")
VFX_DIR = os.path.join(CONTENT, "vfx")
CONFIG_DIR = os.path.join(CONTENT, "config")
KENNEY_DIR = os.path.join(CONTENT, "assets", "textures", "particles")
WC3_TEX_OUT = os.path.join(KENNEY_DIR, "wc3")
PARTICLES_MD = os.path.join(OUT, "PARTICLES.md")

DEFAULT_SCALE = 1.0 / 36.0  # models.py DEFAULT_SCALE (kept in sync by value)

# PRE2 filterMode -> blendMode enum (0 blend,1 additive,2 modulate,3 mod2x,4 alphaKey)
P2_BLEND = {0: "alpha", 1: "additive", 2: "modulate", 3: "modulate", 4: "alphaKey"}
# material-layer filterMode -> blendMode (0 none,1 transparent,2 blend,3 additive,
# 4 addAlpha,5 modulate,6 modulate2x)
MAT_BLEND = {0: "alpha", 1: "alphaKey", 2: "alpha", 3: "additive", 4: "additive",
             5: "modulate", 6: "modulate"}


def slug(name: str) -> str:  # same rule as models.slug (copied, not imported)
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s or "model"


def r3(x: float) -> float:
    v = round(float(x), 3)
    return 0.0 if v == 0 else v


def r4(x: float) -> float:
    v = round(float(x), 4)
    return 0.0 if v == 0 else v


def clamp01(x: float) -> float:
    return min(1.0, max(0.0, float(x)))


# ---------------------------------------------------------------------------
# texture resolution
# ---------------------------------------------------------------------------

# keyword -> candidate CC0 sprites (Kenney particle pack, no *_rotated variants)
KENNEY_RULES: list[tuple[tuple[str, ...], list[str]]] = [
    (("flame", "fire", "lava", "ember", "burn", "torch"),
     ["flame_01", "flame_02", "flame_03", "flame_04", "flame_05", "flame_06",
      "fire_01", "fire_02"]),
    (("flare", "sun"), ["flare_01"]),
    (("cloud", "smoke", "fog", "mist", "dust", "breath", "gas"),
     ["smoke_01", "smoke_02", "smoke_03", "smoke_04", "smoke_05", "smoke_06",
      "smoke_07", "smoke_08", "smoke_09", "smoke_10"]),
    (("lightning", "bolt", "elec", "spark", "thunder", "zap"),
     ["spark_01", "spark_02", "spark_03", "spark_04", "spark_05", "spark_06",
      "spark_07"]),
    (("glow", "light", "halo", "gloom", "moon", "shine"),
     ["light_01", "light_02", "light_03"]),
    (("star",), ["star_01", "star_04", "star_05", "star_06", "star_07", "star_08",
                 "star_09"]),
    (("ring", "circle", "shockwave", "wave", "ripple"),
     ["circle_01", "circle_02", "circle_03", "circle_04", "circle_05"]),
    (("magic", "rune", "sigil", "holy", "divine", "enchant"),
     ["magic_01", "magic_02", "magic_03", "magic_04", "magic_05"]),
    (("slash", "claw", "blade"), ["slash_01", "slash_02", "slash_03", "slash_04"]),
    (("twirl", "swirl", "tornado", "wind", "vortex"),
     ["twirl_01", "twirl_02", "twirl_03"]),
    (("ribbon", "trace", "trail", "blur", "streak"),
     ["trace_01", "trace_02", "trace_03", "trace_05", "trace_06"]),
    (("rock", "stone", "earth", "dirt", "rubble"), ["dirt_01", "dirt_02", "dirt_03"]),
    (("frost", "ice", "snow", "crystal"), ["star_06", "star_09"]),
    (("water", "aqua", "splash", "bubble"), ["circle_02", "circle_03"]),
    (("blood", "gut", "gore"), ["dirt_02", "smoke_04"]),
    (("scorch", "crater"), ["scorch_01", "scorch_02", "scorch_03"]),
]
KENNEY_DEFAULT = ["light_01", "light_02", "star_05"]


def kenney_substitute(basename: str) -> str:
    """Pick the closest CC0 sprite for a Blizzard stock texture name.

    Deterministic: crc32 of the name picks among a rule's candidates."""
    low = basename.lower()
    for keys, candidates in KENNEY_RULES:
        if any(k in low for k in keys):
            pick = candidates[zlib.crc32(low.encode()) % len(candidates)]
            return pick
    return KENNEY_DEFAULT[zlib.crc32(low.encode()) % len(KENNEY_DEFAULT)]


class TextureResolver:
    def __init__(self, dry_run: bool):
        self.dry_run = dry_run
        self.map_pngs = {
            f[:-4]: os.path.join(MAP_TEX_DIR, f)
            for f in (os.listdir(MAP_TEX_DIR) if os.path.isdir(MAP_TEX_DIR) else [])
            if f.endswith(".png")
        }
        self.copied: dict[str, str] = {}  # slug -> doc path
        self.substitutions: dict[str, str] = OrderedDict()  # wc3 path -> sprite
        self.sub_count: dict[str, int] = {}

    def resolve(self, wc3_path: str, replaceable_id: int = 0) -> tuple[str, bool]:
        """-> (doc texture path under assets/, from_map_archive)."""
        if replaceable_id or not wc3_path:
            name = {1: "ReplaceableTextures\\TeamColor",
                    2: "ReplaceableTextures\\TeamGlow"}.get(
                        replaceable_id, f"Replaceable#{replaceable_id}")
            sprite = "circle_05" if replaceable_id == 1 else "light_02"
            self._record_sub(name, sprite)
            return f"assets/textures/particles/{sprite}.png", False
        base = wc3_path.replace("/", "\\").rsplit("\\", 1)[-1]
        stem = base[:-4] if base.lower().endswith((".blp", ".tga")) else base
        s = slug(stem)
        if s in self.map_pngs:  # texture shipped inside the map archive
            if s not in self.copied:
                dst = os.path.join(WC3_TEX_OUT, s + ".png")
                if not self.dry_run:
                    os.makedirs(WC3_TEX_OUT, exist_ok=True)
                    if not os.path.exists(dst):
                        shutil.copyfile(self.map_pngs[s], dst)
                self.copied[s] = f"assets/textures/particles/wc3/{s}.png"
            return self.copied[s], True
        sprite = kenney_substitute(stem)  # Blizzard stock texture: substitute
        self._record_sub(wc3_path, sprite)
        return f"assets/textures/particles/{sprite}.png", False

    def _record_sub(self, wc3_path: str, sprite: str) -> None:
        self.substitutions.setdefault(wc3_path, sprite)
        self.sub_count[wc3_path] = self.sub_count.get(wc3_path, 0) + 1


# ---------------------------------------------------------------------------
# doc builders
# ---------------------------------------------------------------------------


def visible_ratio(track) -> float:
    """Time-weighted fraction of the model timeline a visibility track is on.

    WC3 visibility is piecewise-constant from the keys and defaults to VISIBLE
    before the first key (a lone `(deathFrame, 0)` key means "on until death").
    1.0 if there is no track at all."""
    if track is None or not track.keys:
        return 1.0
    keys = sorted(track.keys)
    end = max(keys[-1][0], 1)
    visible = 0.0
    prev_frame, prev_val = 0, 1.0  # default visible before first key
    for frame, val in keys:
        if frame > prev_frame and prev_val > 0:
            visible += frame - prev_frame
        prev_frame, prev_val = frame, val
    return visible / end


def build_p2_doc(doc_id, em, model, scale, tex: TextureResolver, is_hero, notes):
    life = max(0.05, float(em.lifespan))
    # colors: 3 segment stops at t=0 / mid / 1 (PRE2 `time` = mid-stop position)
    mid_t = em.time if 0.0 < em.time < 1.0 else 0.5
    stops = []
    for i, t in enumerate((0.0, round(mid_t, 3), 1.0)):
        r, g, b = (clamp01(c) for c in em.segment_color[i])
        a = clamp01(em.segment_alpha[i] / 255.0)
        stops.append([t, [r3(r), r3(g), r3(b), r3(a)]])
    sizes = [max(0.0, s * scale) for s in em.segment_scaling]

    # speed: WC3 `variation` is a fraction of speed; negative speed (inward
    # shockwaves) is folded to magnitude (contract requires min/max >= 0)
    var = abs(em.variation)
    lo = abs(em.speed) * max(0.0, 1.0 - var) * scale
    hi = abs(em.speed) * (1.0 + var) * scale

    doc: dict = {
        "id": doc_id,
        "schema": "vfx@1",
        "emitter": {
            "shape": "cone",
            "radius": r3(max(0.05, em.width * scale)),
            "angleDeg": r3(min(180.0, max(1.0, em.latitude))),
        },
    }
    rate = float(em.emission_rate)
    if rate < 0:  # rare authoring quirk (e.g. gumdam): fold to magnitude
        notes.append(f"{doc_id}: negative emissionRate {rate} folded to abs")
        rate = abs(rate)
    anim_driven = False
    if rate <= 0 and em.emission_track is not None:
        rate = em.emission_track.max_value
        anim_driven = True
        notes.append(f"{doc_id}: emissionRate 0, used KP2E peak {r3(rate)}")
    if em.squirt:
        doc["mode"] = "burst"
        doc["burstCount"] = max(1, int(round(max(rate, 1.0) * 0.3)))
    else:
        doc["mode"] = "continuous"
        if rate <= 0:
            rate = 10.0
            notes.append(f"{doc_id}: no usable emissionRate, fallback rate 10")
        doc["rate"] = r3(rate)
    doc["lifetimeSec"] = {"min": r3(life), "max": r3(life)}
    doc["size"] = {"start": r3(max(0.01, sizes[0])), "end": r3(sizes[2])}
    doc["color"] = {"start": stops[0][1], "end": stops[2][1]}
    doc["colorStops"] = stops
    doc["sizeStops"] = [[0, r3(max(0.01, sizes[0]))], [round(mid_t, 3), r3(sizes[1])],
                        [1, r3(sizes[2])]]
    doc["blendMode"] = P2_BLEND.get(em.filter_mode, "alpha")

    ptex = model.texture_for(em.texture_id)
    path, from_map = tex.resolve(ptex.path if ptex else "",
                                 em.replaceable_id or (ptex.replaceable_id if ptex else 0))
    doc["texture"] = path
    if em.rows > 1 or em.cols > 1:
        if from_map:  # real sheet texture available -> keep the flipbook
            doc["spriteSheet"] = {"rows": int(em.rows), "cols": int(em.cols),
                                  "cycleSec": r3(life), "randomStartCell": True}
        else:  # substituted single-frame sprite: slicing it would be garbage
            notes.append(f"{doc_id}: dropped {em.rows}x{em.cols} spriteSheet "
                         "(substituted single-frame texture)")
    if em.head_or_tail >= 1:
        doc["stretched"] = True
        doc["tailLength"] = r3(em.tail_length if em.tail_length > 0 else 1.0)
    if hi > 0:
        doc["speed"] = {"min": r4(lo), "max": r4(hi)}
    if em.gravity:
        doc["gravityY"] = r3(-em.gravity * scale)
    parent = model.node_name(em.parent_id) if em.parent_id >= 0 else None
    if parent:
        doc["anchorBone"] = parent
    # ambient: hero-model emitter that is not animation-gated (KP2V mostly off
    # means an attack/spell puff, not an always-on glow)
    ambient = is_hero and not anim_driven and visible_ratio(em.visibility_track) >= 0.5
    if ambient:
        doc["ambient"] = True
    return doc, ambient


def build_ribbon_doc(doc_id, rb, model, scale, tex: TextureResolver, notes):
    blend = "additive"
    tex_path, layer_fm = "", None
    if 0 <= rb.material_id < len(model.materials):
        for layer in model.materials[rb.material_id]:
            ptex = model.texture_for(layer.texture_id)
            if ptex is not None:
                layer_fm = layer.filter_mode
                tex_path, rid = ptex.path, ptex.replaceable_id
                break
        else:
            rid = 0
    else:
        rid = 0
        notes.append(f"{doc_id}: materialId {rb.material_id} unresolved")
    if layer_fm is not None:
        blend = MAT_BLEND.get(layer_fm, "alpha")
    path, _ = tex.resolve(tex_path, rid if not tex_path else 0)
    doc = {
        "id": doc_id,
        "schema": "ribbon@1",
        "texture": path,
        "widthAbove": r3(max(0.0, rb.height_above * scale)),
        "widthBelow": r3(max(0.0, rb.height_below * scale)),
        "lifespanSec": r3(max(0.05, rb.lifespan)),
        "color": [r3(clamp01(rb.color[0])), r3(clamp01(rb.color[1])),
                  r3(clamp01(rb.color[2])), r3(clamp01(rb.alpha))],
        "blendMode": blend,
    }
    parent = model.node_name(rb.parent_id) if rb.parent_id >= 0 else None
    if parent:
        doc["anchorBone"] = parent
    return doc


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------


def main() -> int:
    dry_run = "--dry-run" in sys.argv

    scale_by_source: dict[str, float] = {}
    hero_kind: dict[str, str] = {}
    if os.path.isfile(REPORT_PATH):
        for e in json.load(open(REPORT_PATH)):
            src = e.get("source", "").lower()
            if src and e.get("scale_factor"):
                scale_by_source[src] = float(e["scale_factor"])
            if src:
                hero_kind[src] = e.get("kind", "")

    champ_model_slugs: set[str] = set()
    champ_dir = os.path.join(CONTENT, "champions")
    for f in os.listdir(champ_dir):  # READ-ONLY cross-check
        if not f.endswith(".json") or f == "_index.json":
            continue
        mk = json.load(open(os.path.join(champ_dir, f))).get("modelKey", "")
        if mk.startswith("imported."):
            champ_model_slugs.add(mk[len("imported."):])

    tex = TextureResolver(dry_run)
    files = sorted(f for f in os.listdir(RAW_DIR) if f.lower().endswith(".mdx"))
    per_model: list[dict] = []
    bindings: dict[str, list[dict]] = {}
    notes: list[str] = []
    n_p2 = n_rb = n_docs = 0
    written: list[str] = []

    for fname in files:
        stem = slug(fname[:-4])
        try:
            m = parse_particles(open(os.path.join(RAW_DIR, fname), "rb").read())
        except Exception as ex:  # noqa: BLE001
            notes.append(f"{fname}: parse failed: {ex}")
            continue
        if not (m.emitters2 or m.ribbons or m.events):
            continue
        scale = scale_by_source.get(fname.lower(), DEFAULT_SCALE)
        is_hero = stem in champ_model_slugs
        model_key = f"imported.{stem}"
        row = {"model": fname, "stem": stem, "hero": is_hero, "scale": scale,
               "emitters": [], "events": []}

        for i, em in enumerate(m.emitters2):
            doc_id = f"godie-{stem}-p{i}"
            doc, ambient = build_p2_doc(doc_id, em, m, scale, tex, is_hero, notes)
            out_path = os.path.join(VFX_DIR, doc_id + ".json")
            if not dry_run:
                with open(out_path, "w") as f:
                    json.dump(doc, f, indent=2)
                    f.write("\n")
            written.append(out_path)
            n_p2 += 1
            n_docs += 1
            if ambient:
                bindings.setdefault(model_key, []).append({"vfx": doc_id})
            row["emitters"].append({
                "id": doc_id, "kind": "pre2", "name": em.name,
                "blend": doc["blendMode"], "texture": doc.get("texture", ""),
                "ambient": ambient, "anchor": doc.get("anchorBone", ""),
                "gated": visible_ratio(em.visibility_track) < 0.5,
            })

        for i, rb in enumerate(m.ribbons):
            doc_id = f"godie-{stem}-r{i}"
            doc = build_ribbon_doc(doc_id, rb, m, scale, tex, notes)
            out_path = os.path.join(VFX_DIR, doc_id + ".json")
            if not dry_run:
                with open(out_path, "w") as f:
                    json.dump(doc, f, indent=2)
                    f.write("\n")
            written.append(out_path)
            n_rb += 1
            n_docs += 1
            ambient_rb = is_hero and visible_ratio(rb.visibility_track) >= 0.5
            if ambient_rb:
                bindings.setdefault(model_key, []).append({"vfx": doc_id})
            row["emitters"].append({
                "id": doc_id, "kind": "ribbon", "name": rb.name,
                "blend": doc["blendMode"], "texture": doc.get("texture", ""),
                "ambient": ambient_rb, "anchor": doc.get("anchorBone", ""),
                "gated": visible_ratio(rb.visibility_track) < 0.5,
            })

        for ev in m.events:
            row["events"].append({"name": ev.name.strip(), "times": ev.times})
        per_model.append(row)

    # ---- ambient bindings config -----------------------------------------
    ambient_doc = {
        "id": "ambient-vfx",
        # config collection discriminates on `schema`; "config@1" belongs to
        # config.match — ambient bindings carry their own tag (schema/config.ts)
        "schema": "config.ambient-vfx@1",
        "bindings": {k: bindings[k] for k in sorted(bindings)},
    }
    if not dry_run:
        with open(os.path.join(CONFIG_DIR, "ambient-vfx.json"), "w") as f:
            json.dump(ambient_doc, f, indent=2)
            f.write("\n")

    # ---- PARTICLES.md ----------------------------------------------------
    md = ["# WC3 particle extraction — GoDieEX22s", ""]
    md.append(f"- models scanned: {len(files)}; models with emitters/events: "
              f"{len(per_model)}")
    md.append(f"- vfx@1 docs (PRE2): {n_p2}; ribbon@1 docs (RIBB): {n_rb}; "
              f"total docs: {n_docs}")
    md.append(f"- hero models with ambient bindings: {len(bindings)} "
              "(content/config/ambient-vfx.json)")
    md.append(f"- map-archive textures copied to "
              f"content/assets/textures/particles/wc3/: {len(tex.copied)}")
    md.append(f"- Blizzard stock textures substituted with CC0 sprites: "
              f"{len(tex.substitutions)}")
    md.append("- scale: per-model `scale_factor` from models_report.json "
              "(heroes normalized to 1.7 world units tall; props 1/36); "
              "applied to width/speed/gravity/segmentScaling/ribbon heights")
    md.append("- latitude found stored in DEGREES in this map's v800 files "
              "(values 0..180) — used as angleDeg directly, clamped [1,180]")
    md.append("- WC3 `variation` treated as a fraction of speed; negative "
              "speeds (inward shockwaves) folded to magnitude")
    md.append("")

    md.append("## Per-model emitters")
    md.append("")
    md.append("| model | hero | doc | kind | src name | blend | ambient | "
              "anim-gated | anchorBone | texture |")
    md.append("|---|---|---|---|---|---|---|---|---|---|")
    for row in per_model:
        for e in row["emitters"]:
            md.append(
                f"| {row['model']} | {'Y' if row['hero'] else ''} | {e['id']} | "
                f"{e['kind']} | {e['name']} | {e['blend']} | "
                f"{'Y' if e['ambient'] else ''} | {'Y' if e['gated'] else ''} | "
                f"{e['anchor']} | {e['texture']} |")
    md.append("")

    md.append("## Texture substitutions (Blizzard stock -> CC0 Kenney sprite)")
    md.append("")
    md.append("| WC3 texture | substitute | uses |")
    md.append("|---|---|---|")
    for path, sprite in sorted(tex.substitutions.items()):
        md.append(f"| {path} | {sprite}.png | {tex.sub_count.get(path, 1)} |")
    md.append("")

    md.append("## EVTS inventory (spawn/splat/uber/sound markers per model)")
    md.append("")
    md.append("Names are SPN (spawn model), SPL (ground splat), UBR (uber "
              "splat), SND (sound) + a 4-char id; times are track keys in "
              "milliseconds on the model timeline (death markers land inside "
              "the Death sequence). For later death/impact-effect wiring.")
    md.append("")
    md.append("| model | event | times (ms) |")
    md.append("|---|---|---|")
    for row in per_model:
        for ev in row["events"]:
            times = ", ".join(str(t) for t in ev["times"][:6])
            md.append(f"| {row['model']} | {ev['name']} | {times} |")
    md.append("")

    if notes:
        md.append("## Extraction notes")
        md.append("")
        for n in notes:
            md.append(f"- {n}")
        md.append("")

    if not dry_run:
        with open(PARTICLES_MD, "w") as f:
            f.write("\n".join(md))

    print(f"models with particles: {len(per_model)}/{len(files)}")
    print(f"docs: {n_docs} ({n_p2} vfx + {n_rb} ribbon) -> content/vfx/")
    print(f"ambient bindings: {len(bindings)} hero models")
    print(f"textures: {len(tex.copied)} copied from map, "
          f"{len(tex.substitutions)} substituted")
    print(f"summary: {PARTICLES_MD}")
    if dry_run:
        print("(dry run: nothing written)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
