#!/usr/bin/env python3
"""Extract WC3 MDX particle emitters (PRE2/RIBB/EVTS) into extended vfx docs.

Reads tools/w3x-import/out/GoDieEX22s/raw/*.mdx (the map's models), emits:

  content/vfx/godie-<modelstem>-p<i>.json   one extended vfx@1 per PRE2
  content/vfx/godie-<modelstem>-r<i>.json   one ribbon@1 per RIBB
  content/config/ambient-vfx.json           hero modelKey -> ambient vfx ids
  content/assets/textures/particles/wc3/    map-archive particle textures (PNG)
  tools/w3x-import/out/GoDieEX22s/PARTICLES.md  summary + substitutions + EVTS
  tools/w3x-import/out/GoDieEX22s/vfx-provenance.json  per-doc generated-hash
                                            + tool fingerprint (see below)

Scale: uses the SAME per-model factor the glb exporter baked into the mesh
(models_report.json `scale_factor`: heroes are normalized to 1.7 units tall,
everything else uses DEFAULT_SCALE = 1/36). All WC3-unit quantities (width,
speed, gravity, segment scaling, ribbon heights) are multiplied by it.

Deliberately standalone: imports only w3xlib.particles (new module), never
mdx.py / gltf.py / models.py (owned by the animation agent).

Usage:  python3 extract_particles.py [--dry-run] [--density=1.0] [--out-dir=DIR]

  --out-dir=DIR  write vfx/ + config/ + PARTICLES.md + vfx-provenance.json
                 under DIR instead of content/. Use this to stage a
                 regeneration for review without overwriting the 228 shipped
                 docs someone else may be binding. The hand-tune classification
                 still reads the SHIPPED docs + the SHIPPED side-car (see
                 emit_doc), so a staged tree previews what an in-place run does
                 rather than being a second, unguarded code path.
  --density=F    extraction-time particle-count multiplier (burst emitters).
                 1.0 = faithful to the MDX. Leave it at 1.0 unless you have a
                 stated reason; runtime quality reduction belongs in
                 apps/client/src/render/vfx/emitterBudget.ts, not in content.
  --raw-ribbons  emit ribbon@1 docs at their raw MDX widths/lifespans instead of
                 through the #37 刀光殘影 budget (ribbon_trail_budget()). The
                 budget is ON by default because that is what ships.
  --overwrite-tuned
                 rewrite EVERY doc, discarding the provenance classification —
                 i.e. emit exactly what this tool computes today. OFF by
                 default. This is also what the drift guard runs, because a
                 staged tree that honours "keep" cannot detect the thing it is
                 looking for.
  --unknown-provenance=keep|overwrite
                 what to do with a doc that has no side-car entry, where
                 "stale" and "hand-tuned" are genuinely undecidable. Default
                 `keep` (never silently revert an unexplained edit); the drift
                 guard makes every keep loud, so keeping cannot rot quietly.
  --replace-ambient
                 let config/ambient-vfx.json be fully replaced, dropping any
                 hand-added binding and any non-generated key (`arenaFire`).
                 OFF by default — see write_ambient_config().

2026-07-24: `emission_disc_radius` changed meaning (2x smaller, and it now
honours `Length`); `burstCount` stopped carrying a hidden 0.3 haircut.
2026-08-02: content/vfx was regenerated in place against those fixes, so the
shipped docs and this file agree again. Three things now keep them that way:
  · test/particles_checks.py re-derives the radius from the binaries on every
    run and FAILS (not warns) on drift;
  · test/shippedVfxIsCurrent.test.ts diffs every shipped doc against a fresh
    extraction FIELD BY FIELD, and names the field and the old->new value;
  · vfx-provenance.json records what this tool generated last time, so
    "stale" is a fact rather than the guess `tuned = shipped != fresh` used to
    make (that guess resolved every case to "keep" and pinned the bug for nine
    days — see the provenance block above classify_doc).
"""

from __future__ import annotations

import hashlib
import json
import math
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
# LUMA-KEY: the blend modes WC3 renders WITHOUT reading alpha (GH#665)
# ---------------------------------------------------------------------------
#
# WC3's Additive (ONE, ONE) and Modulate (DST_COLOR, ZERO) never sample the
# alpha channel, so authoring alpha 0 on such an emitter costs the original map
# NOTHING — the shape is entirely in RGB x texture. GGD's renderer is not so
# forgiving: Babylon's particle path multiplies by vColor.a and RibbonTrail's
# `premultiplied` fade scales RGB by it, so a faithful 0 transcribes into a
# permanently blank effect. Measured on the shipped corpus: 2 PRE2 emitters
# (HolyAwakening p0/p1, modulate) and 3 RIBB (DeathWave r0..r2, additive) —
# 5 of the 8 docs vfxDocsBirthVisibility.test.ts flagged as unable to draw a
# single pixel in any scene.
#
# This is the SAME defect family, and the same remedy, as the 28 zero-pixel
# effect .glbs (GH#649): w3xlib/gltf.py's `gltf_texture_luma` derives an alpha
# channel from luminance (`alpha := max(R,G,B)`) when an additive glow material
# has no usable alpha, instead of dropping the quad. Keeping the two rules
# literally the same sentence is deliberate — the alternative is two policies
# that drift.
#
# Deliberately NARROW: it fires only when the emitter carries no alpha
# information at all (every stop exactly 0). A partial fade (0 -> 200 -> 0,
# e.g. HolyAwakening p2) is real authoring and is left alone.
ALPHA_BLIND_BLENDS = ("additive", "modulate")


def luma_key_alpha(rgb) -> float:
    """`alpha := max(R,G,B)` — see ALPHA_BLIND_BLENDS. Black stays invisible."""
    return clamp01(max(rgb))


# ---------------------------------------------------------------------------
# What `modulate` ACTUALLY composites downstream (GH#709) — read before you
# "optimise away" a modulate emitter for looking like a no-op.
# ---------------------------------------------------------------------------
#
# blendModeFor("modulate") -> ParticleSystem.BLENDMODE_MULTIPLY, which is TWO
# stages, not one:
#   1. particles.fragment `#ifdef BLENDMULTIPLYMODE` (pushed by
#      thinParticleSystem ONLY for BLENDMODE_MULTIPLY):
#          src.rgb = (tex.rgb * col.rgb) * a + 1 * (1 - a),   a = tex.a * col.a
#   2. engine.setAlphaMode(4) = ALPHA_MULTIPLY = (DST_COLOR, ZERO):
#          out = src.rgb * dst.rgb
#   => out = dst * [ 1 - a*(1 - tex.rgb*col.rgb) ]      delta = a*(1 - tex.rgb*col.rgb)
#
# CONSEQUENCE, and the reason this block exists: a WHITE doc colour is NOT the
# identity. delta collapses to 0 only when the TEXTURE is white too. Measured on
# the shipped substitute sprites (palette+tRNS PNGs), tex.rgb / tex.a ~= 1.36,
# so the seven shipped all-white modulate docs sit at delta 0.17-0.19 — a real,
# visible ~19% darkening, NOT "identical to the background".
#
# GH#709's premise ("modulate stacked all-white => per-pixel identity", also in
# extract_stock_vfx.py's WHITE_RGB_MIN and PRE2_temp_20260826-0000.md 2.2) came
# from reading MULTIPLY as (DST_COLOR, ONE_MINUS_SRC_ALPHA) and assuming
# tex.rgb == tex.a. Both premises are false; see the citations above.
#
# The LUMA-KEY above is what keeps modulate emitters OUT of the true identity
# case (all-zero alpha => a = 0 => delta = 0 => the frame buffer never moves).
# The shipping-state counterpart of that rule is criterion (5) in
# packages/shared/src/content/vfxDocsBirthVisibility.test.ts, which derives the
# verdict from the texture's real pixels — never from a hard-coded list.


# ---------------------------------------------------------------------------
# PRE2 geometry: the ONE reading of `width`/`length` this repo is allowed to have
# ---------------------------------------------------------------------------

# vfx@1 `emitter.radius` is `z.number().positive()` (content/schema/vfx.ts) — the
# only hard requirement is > 0. This is the smallest value that survives r3()
# rounding, and it matches the floor the TS sibling uses (w3xEmitter.ts). The
# previous 0.05 floor was ~50x larger than any real need and, once the 2x bug
# below is corrected, would have silently swallowed the correction on every
# small emitter.
MIN_EMITTER_RADIUS = 0.001


def _r3_js(x: float) -> float:
    """`Math.round(v * 1000) / 1000` — JS semantics, not Python's.

    Python's round() is banker's rounding (round-half-to-EVEN); JavaScript's
    Math.round is round-half-UP. On a .0005 boundary they disagree by 0.001,
    which is exactly the whole third decimal this file emits. Real cases, caught
    by test/emitter_radius_crosscheck.py the first time the two languages were
    ever run on the same bytes: godie-herorider-p0 (1.135 vs 1.136) and
    godie-netherstrike-p3 (2.083 vs 2.084).

    The radius is a CONTRACT with w3xEmitter.ts, so it rounds the way that file
    rounds. NOTE for whoever comes next: the generic r3()/r4() above still use
    Python rounding, so other extracted fields can still differ from the TS path
    by one unit in the last place. Nothing depends on those matching today.
    """
    v = math.floor(x * 1000 + 0.5) / 1000 if x >= 0 else -(math.floor(-x * 1000 + 0.5) / 1000)
    return 0.0 if v == 0 else v


def emission_disc_radius(width: float, length: float, scale: float) -> float:
    """PRE2 `Width` x `Length` emission rectangle -> the vfx@1 disc that bounds it.

    THIS FUNCTION IS THE WHOLE POINT. Read before changing it.

    A PRE2 emitter spawns particles on a RECTANGLE of `Width` x `Length`,
    CENTRED on the emitter node — i.e. the spawn offset is uniform over
    [-Width/2, +Width/2] x [-Length/2, +Length/2]. Both fields are FULL side
    lengths, not radii and not half-extents.

    That was WRONG here until 2026-07-24: this file used `radius = width*scale`,
    which is 2x too large, and dropped `length` on the floor entirely.

    PROOF, from the map's own binaries (not from any other source file) —
    tools/w3x-import/out/GoDieEX22s/raw/1hswd_01.mdx, emitter `Particle_2`
    (a blade-glint emitter parented to bone_b11):

        GEOS vertex bounds  x[-14.28, 67.67]  (an 81.95-unit sword, blade +X)
        PIVT[14] (emitter)  x = 40.40         (mid-blade)
        PRE2 fields         Width = 3.30, Length = 50.00

      full-extent reading  -> a 50.0 strip centred at 40.40 = x[15.40, 65.40],
                              which lands exactly on the blade, just inside the
                              guard (~x=10) and just inside the tip (x=67.67).
      half-extent reading  -> a 100.0 strip = x[-9.60, 90.40], which overshoots
                              the tip by 22.7 units into thin air and runs back
                              through the crossguard onto the grip. It is also
                              LONGER (100.0) THAN THE ENTIRE MODEL (81.95), so
                              it exceeds the model's own authored MODL extent.

    Corpus-wide over all 73 map models with PRE2 (228 emitters, 127 with a
    positive width/length and a positive authored MODL bbox):
        full-extent reading: 0 emitters spray outside their model's own bbox
        half-extent reading: 2 do  (1hswd_01 Particle_2, HeroRaichuS3 UNNAMED)
    A reading that makes emitters escape their own authored bounds is the wrong
    reading. See test/particles_checks.py, which re-derives all of this from the
    binary on every run so the number cannot drift back.

    vfx@1 has point/sphere/cone only — no box emitter — so the rectangle becomes
    the disc that BOUNDS it: radius = max(Width, Length) / 2. Using `width`
    alone (as this file did) silently discards the long axis: the sword above
    would emit from a 1.65-unit dot instead of along its 25-unit blade.

    MUST STAY NUMERICALLY IDENTICAL to `w3xEmitterToVfxDoc` in
    apps/client/src/render/vfx/w3xEmitter.ts (search `halfExtent`), which is the
    runtime path for the same MDX data. Two pipelines, one reading; if you edit
    one, edit both — particles_checks.py greps the TS for this formula and fails
    if they diverge.
    """
    half_extent = (max(float(width), float(length)) / 2.0) * scale
    return _r3_js(max(MIN_EMITTER_RADIUS, half_extent))


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
    def __init__(self, dry_run: bool, tex_out: str = WC3_TEX_OUT):
        self.dry_run = dry_run
        # Where copied map textures land. `--out-dir` redirects this too: a
        # staged run must not reach back into content/ and write there, or the
        # staging is not staging (and no test could run the extractor safely).
        self.tex_out = tex_out
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
                dst = os.path.join(self.tex_out, s + ".png")
                if not self.dry_run:
                    os.makedirs(self.tex_out, exist_ok=True)
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


def build_p2_doc(doc_id, em, model, scale, tex: TextureResolver, is_hero, notes,
                 density: float = 1.0):
    life = max(0.05, float(em.lifespan))
    blend = P2_BLEND.get(em.filter_mode, "alpha")
    # An emitter whose blend mode never samples alpha may carry alpha 0 on every
    # segment and still be fully visible in WC3 — the shape is in RGB. Key the
    # alpha off luminance instead of shipping a blank effect (GH#665).
    alpha_blind = (blend in ALPHA_BLIND_BLENDS and max(em.segment_alpha) == 0)
    # colors: 3 segment stops at t=0 / mid / 1 (PRE2 `time` = mid-stop position)
    mid_t = em.time if 0.0 < em.time < 1.0 else 0.5
    stops = []
    for i, t in enumerate((0.0, round(mid_t, 3), 1.0)):
        r, g, b = (clamp01(c) for c in em.segment_color[i])
        a = (luma_key_alpha((r, g, b)) if alpha_blind
             else clamp01(em.segment_alpha[i] / 255.0))
        stops.append([t, [r3(r), r3(g), r3(b), r3(a)]])
    if alpha_blind:
        notes.append(f"{doc_id}: {blend} emitter with segmentAlpha 0/0/0 — "
                     "alpha luma-keyed from RGB (GH#665)")
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
            # W x L emission rectangle -> bounding disc. See emission_disc_radius.
            "radius": emission_disc_radius(em.width, em.length, scale),
            "angleDeg": r3(min(180.0, max(1.0, em.latitude))),
        },
    }
    if em.width != em.length and max(em.width, em.length) > 0:
        # Recorded, not hidden: a long thin strip (a blade glint, a wall of
        # flame) becomes a circle, which is the closest vfx@1 can get. The TS
        # sibling emits the same note; PARTICLES.md is where a human sees it.
        notes.append(f"{doc_id}: rectangular {r3(em.width)}x{r3(em.length)} "
                     f"emission plane approximated by its bounding disc "
                     f"r={doc['emitter']['radius']} (vfx@1 has no box emitter)")
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
        # `squirt` fires the whole emission rate in ONE instant instead of
        # per-second, so the faithful burst size is exactly `rate`.
        # This used to be `rate * 0.3` — a hardcoded 70% performance haircut
        # baked into extracted CONTENT, where nothing can see it or undo it.
        # Budget is not fidelity: the runtime already reduces particle counts
        # deliberately and reversibly in apps/client/src/render/vfx/
        # emitterBudget.ts (per-quality-tier rateScale + burstCount scaling).
        # Applying a second, invisible 0.3 here double-charged every burst.
        # `density` stays a CALLER knob (--density) so a deliberate extraction
        # haircut is still possible, but it is stated at the call site and
        # defaults to 1.0 = faithful.
        doc["burstCount"] = max(1, int(round(max(rate, 1.0) * density)))
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
    doc["blendMode"] = blend

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


# ---------------------------------------------------------------------------
# ribbon@1: the #37 刀光殘影 budget, re-derived so a rerun REPRODUCES it
# ---------------------------------------------------------------------------

# Task #37 turned weapon trails from lingering light pollution into blade
# afterimages. Part of that landed in the renderer (apps/client/src/vfx/
# ribbonMath.ts) and part of it landed as edits to the 54 extracted ribbon@1
# docs — and the content half was never written back here. Until 2026-08-02 the
# only thing protecting it was a `tuned = shipped != fresh` test in main()
# (now replaced by classify_doc, see the provenance block). That test cannot
# tell a hand-tune from a stale doc: both differ. With nothing else in the file
# it was, in effect, protecting rot.
#
# So the transform itself is re-derived here. It is not a guess: applied to a
# fresh extraction it reproduces all 54 shipped ribbon docs EXACTLY — whole
# document equality, not just the three fields it touches (54/54, 0 misses;
# widths 108/108 fields). test/particles_checks.py re-runs that comparison.
#
# WHAT IT DOES, and the two independent things it is NOT:
#   * it is not the runtime clamp. RibbonTrail already applies
#     clampRibbonLifespanSec / clampRibbonHalfWidth, which are a flat
#     min(0.2, max(0.06, L)) and min(0.7, w). Those would leave a 0.35 s doc at
#     0.20 s and a 0.585 width untouched; the shipped docs are 0.15 s / 0.497.
#   * it is not a fidelity correction. It is a deliberate art call, which is why
#     `--raw-ribbons` turns it off rather than it being unconditional.
#
# CAUTION on the exponent: the width rule is a clean 0.85 with a 0.7 ceiling,
# but the lifespan rule is a CURVE FIT over the 7 distinct authored lifespans
# above the fade budget that this corpus happens to contain (0.35/0.4/0.5/0.6/
# 0.7/1.0/2.0 -> 0.15/0.15/0.16/0.16/0.17/0.18/0.20). It reproduces every one of
# them at 2 dp. A lifespan outside that set is an extrapolation — what is
# guaranteed for any input is only the property #37 actually contracted for:
# monotone, and never above RIBBON_FADE_BUDGET_SEC. Both are asserted below.
RIBBON_WIDTH_TRIM = 0.85          # blade arc, not a band
RIBBON_WIDTH_CEIL = 0.7           # == RIBBON_MAX_HALF_WIDTH in ribbonMath.ts
RIBBON_FADE_BUDGET_SEC = 0.25     # == RIBBON_FADE_BUDGET_SEC in ribbonMath.ts
RIBBON_LIFE_BASE_SEC = 0.15       # image of the shortest budgeted lifespan
RIBBON_LIFE_REF_SEC = 0.35        # the authored lifespan that maps to the base
RIBBON_LIFE_EXP = 0.165           # compression exponent (see CAUTION above)


def ribbon_trail_budget(width_above: float, width_below: float,
                        lifespan_sec: float) -> tuple[float, float, float]:
    """(#37) Raw MDX ribbon geometry -> the 刀光殘影 budget. See the block above."""
    def w(x: float) -> float:
        return r3(min(RIBBON_WIDTH_TRIM * x, RIBBON_WIDTH_CEIL))

    if lifespan_sec <= RIBBON_FADE_BUDGET_SEC:
        life = r3(lifespan_sec)  # already inside the budget: left alone
    else:
        ratio = lifespan_sec / RIBBON_LIFE_REF_SEC
        life = r3(round(RIBBON_LIFE_BASE_SEC * ratio ** RIBBON_LIFE_EXP, 2))
    assert life <= RIBBON_FADE_BUDGET_SEC, (lifespan_sec, life)
    return w(width_above), w(width_below), life


def build_ribbon_doc(doc_id, rb, model, scale, tex: TextureResolver, notes,
                     trail_budget: bool = True):
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
    # RIBB HeightAbove/HeightBelow are already HALF-extents (distance from the
    # node up / down), unlike PRE2 Width/Length which are full side lengths.
    # That is why there is no /2 here and MUST NOT BE ONE: copying the
    # emission_disc_radius fix onto this path would invent a new 2x-too-small
    # bug. See emission_disc_radius() for the reading that does need it.
    raw_above, raw_below = rb.height_above, rb.height_below
    # A ribbon whose whole expression lives in its KRHA/KRHB tracks reads as
    # ZERO-SIZED from the fixed block alone (SD2 r0: 0/0 static, 24/36 animated).
    # Same shape as the KP2E emissionRate fallback above — take the track peak
    # rather than shipping a band with no area (GH#665).
    if raw_above <= 0 and raw_below <= 0:
        ka, kb = rb.tracks.get("KRHA"), rb.tracks.get("KRHB")
        peak_a = ka.max_value if ka is not None else 0.0
        peak_b = kb.max_value if kb is not None else 0.0
        if max(peak_a, peak_b) > 0:
            raw_above, raw_below = peak_a, peak_b
            notes.append(f"{doc_id}: static heightAbove/Below 0/0, used "
                         f"KRHA/KRHB peak {r3(peak_a)}/{r3(peak_b)}")
    above = r3(max(0.0, raw_above * scale))
    below = r3(max(0.0, raw_below * scale))
    life = r3(max(0.05, rb.lifespan))
    if trail_budget:
        above, below, life = ribbon_trail_budget(above, below, life)
    rgb = (clamp01(rb.color[0]), clamp01(rb.color[1]), clamp01(rb.color[2]))
    # Additive/modulate ribbons never sample alpha in WC3, so alpha 0 is free
    # there and fatal here (RibbonTrail's premultiplied fade scales RGB by it).
    # Luma-key it, exactly as gltf.py does for alpha-less additive glow (GH#665).
    if rb.alpha <= 0 and blend in ALPHA_BLIND_BLENDS:
        alpha = luma_key_alpha(rgb)
        notes.append(f"{doc_id}: {blend} ribbon with alpha 0 — alpha "
                     "luma-keyed from RGB (GH#665)")
    else:
        alpha = clamp01(rb.alpha)
    doc = {
        "id": doc_id,
        "schema": "ribbon@1",
        "texture": path,
        "widthAbove": above,
        "widthBelow": below,
        "lifespanSec": life,
        "color": [r3(rgb[0]), r3(rgb[1]), r3(rgb[2]), r3(alpha)],
        "blendMode": blend,
    }
    parent = model.node_name(rb.parent_id) if rb.parent_id >= 0 else None
    if parent:
        doc["anchorBone"] = parent
    return doc


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------


def write_ambient_config(path: str, prior_path: str, derived: dict,
                         replace: bool, dry_run: bool):
    """Write config/ambient-vfx.json WITHOUT eating what this tool did not author.

    `content/config/ambient-vfx.json` is not an extraction artifact. It is a
    CONFIG doc: `apps/admin` edits it, `zConfigAmbientVfxDoc` validates it, and
    `ContentDb.arenaFire()` reads a whole `arenaFire` block out of it that has
    nothing to do with MDX at all. It also carries three weapon-trail bindings
    (mfls / heromusashimiyamoto / sesshomaru) that this extractor CANNOT derive
    — their RIBB visibility tracks sit at 0.03-0.24, far under the 0.5 ambient
    threshold — so they were added by hand and the models they dress are three
    whitelisted champions.

    A plain `json.dump` over the file therefore silently deletes an admin-facing
    config block and three champions' swing trails, and the deletion LOOKS FINE:
    `resolveArenaFire` falls back to DEFAULT_ARENA_FIRE, whose values are equal
    to the shipped ones. Nothing on screen says anything (failure form 2).

    So: derived bindings win where they overlap, everything else survives, and
    what survived is PRINTED rather than assumed. `--replace-ambient` is the
    stated way to take the extractor's word as final.

    `prior_path` is the SHIPPED config, which is not always the write target:
    under `--out-dir` the staging tree is empty, and merging against an empty
    tree would stage a preview that quietly disagrees with what an in-place run
    actually does — the same trap `--out-dir` used to spring on the ribbon
    guard.

    -> (doc, preserved_keys, preserved_binding_keys)
    """
    prior: dict = {}
    if os.path.isfile(prior_path):
        try:
            prior = json.load(open(prior_path))
        except (OSError, ValueError):
            prior = {}
    doc = dict(derived)
    kept_keys: list[str] = []
    kept_bindings: list[str] = []
    kept_entries: list[str] = []
    if prior and not replace:
        for k, v in prior.items():
            if k not in doc:
                doc[k] = v
                kept_keys.append(k)
        # ⭐ GH#667, three separate ways this merge used to lose bytes:
        #
        #  1. It merged at MODEL-KEY granularity, so a hand-added entry inside a
        #     key the extractor DOES derive was dropped without a word. Measured:
        #     `imported.heroshana` shipped [p0,p1,p2,r0] and a rerun staged
        #     [p0,p1,p2] — 閃 (Shana)'s ribbon trail, gone, while the banner
        #     below still said "preserved". Merging per `vfx` id fixes it, and
        #     the prior entry object wins so a hand-added `whileToggle`/`note`
        #     on a derived binding survives too (GH#546 herosaber carries one).
        #  2. It rebuilt the map derived-first, so every rerun reshuffled the
        #     whole file. Prior order is kept and only genuinely new derived
        #     keys are appended — a rerun is now byte-idempotent.
        #  3. See the ensure_ascii note at the dump below.
        merged: dict = {}
        prior_binds = prior.get("bindings") or {}
        for model_key, binds in prior_binds.items():
            fresh = derived["bindings"].get(model_key)
            if fresh is None:
                merged[model_key] = binds
                kept_bindings.append(model_key)
                continue
            have = {b.get("vfx") for b in binds}
            extra = [b for b in fresh if b.get("vfx") not in have]
            merged[model_key] = list(binds) + extra
            kept_entries.extend(f"{model_key} -> {b.get('vfx')}"
                                for b in binds
                                if b.get("vfx") not in
                                {c.get("vfx") for c in fresh})
        for model_key, binds in derived["bindings"].items():
            if model_key not in merged:
                merged[model_key] = binds
        doc["bindings"] = merged
    if not dry_run:
        with open(path, "w", encoding="utf-8") as f:
            # ⛔ NOT the default ensure_ascii=True. The shipped file carries
            # multi-paragraph Chinese `note` fields (GH#546); escaping them to
            # \uXXXX rewrites every one of those lines on every run, makes the
            # file unreadable to the person who is supposed to edit it, and
            # buries the real diff under noise.
            json.dump(doc, f, indent=2, ensure_ascii=False)
            f.write("\n")
        # ⭐ The banner this function feeds used to be printed unconditionally.
        # Read the bytes back and say so if they disagree with what we are
        # about to claim — a "preserved" line that does not match the file is
        # worse than no line at all (it is what hid #667 for two weeks).
        try:
            with open(path, encoding="utf-8") as f:
                if json.load(f) != doc:
                    print("⛔ ambient-vfx.json: what was written does NOT match "
                          "what this run reports below", file=sys.stderr)
        except (OSError, ValueError) as ex:
            print(f"⛔ ambient-vfx.json unreadable after write: {ex}",
                  file=sys.stderr)
    return doc, kept_keys, kept_bindings, kept_entries


# ---------------------------------------------------------------------------
# provenance: what made each shipped doc, so "stale" stops being a guess
# ---------------------------------------------------------------------------
#
# The rule this replaces was `tuned = shipped != fresh` — and that predicate
# cannot answer the question it is asked. A doc differs from a fresh extraction
# for two OPPOSITE reasons:
#
#     someone hand-edited it        -> must be KEPT (do not silently revert)
#     the extractor was corrected   -> must be OVERWRITTEN (it is rot)
#
# Reading only the two documents, those are indistinguishable, so the old guard
# resolved every case to "keep". That is why 2026-07-24's radius fix sat in the
# tool for nine days while the data stayed wrong: the protection meant for #37
# was, in practice, pinning the bug.
#
# The missing bit of information is a third document: what the tool produced
# LAST time. With it, both questions become facts:
#
#     sha256(shipped) == recorded  -> the file is untouched since generation.
#                                     It differs from fresh only because the
#                                     TOOL changed => STALE => overwrite.
#     sha256(shipped) != recorded  -> the bytes on disk are not the bytes the
#                                     tool wrote => HAND-TUNED => keep + name.
#
# So this side-car records, per doc, the hash of the bytes THE TOOL GENERATED —
# never the bytes that ended up on disk. Recording the on-disk bytes of a kept
# hand-tune would make it match its own record on the next run, i.e. it would
# be reclassified as stale and reverted on the run after that.
#
# `toolFingerprint` is a digest of the extractor's own sources. It is what lets
# the TS guard (test/shippedVfxIsCurrent.test.ts) say "the tool changed and the
# corpus was not regenerated" in an environment with no python3 — a cheap
# second layer, never the primary one, because a source digest is failure
# form 6 (scanning source text) if you let it stand alone.
PROVENANCE_PATH = os.path.join(OUT, "vfx-provenance.json")
PROVENANCE_SCHEMA = "vfx-provenance@1"
# Both files feed the numbers in every doc: this one decides the fields,
# w3xlib/particles.py decodes the PRE2/RIBB structs they are computed from.
# Keep this list in sync with test/shippedVfxIsCurrent.test.ts (TOOL_SOURCES).
TOOL_SOURCE_FILES = ("extract_particles.py", os.path.join("w3xlib", "particles.py"))


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def tool_fingerprint() -> str:
    """Digest of the extractor sources, in a fixed order. 16 hex chars is
    plenty to notice an edit and short enough to read in a failure message."""
    h = hashlib.sha256()
    for rel in TOOL_SOURCE_FILES:
        with open(os.path.join(HERE, rel), "rb") as f:
            h.update(f.read())
    return h.hexdigest()[:16]


def doc_text(doc: dict) -> str:
    """The EXACT bytes a doc is written as. Hashing anything else would let the
    hash and the file disagree — the one thing this side-car must never do."""
    return json.dumps(doc, indent=2) + "\n"


def load_provenance(path: str) -> dict:
    try:
        with open(path) as f:
            data = json.load(f)
    except (OSError, ValueError):
        return {}
    if data.get("schema") != PROVENANCE_SCHEMA:
        return {}
    return data.get("docs") or {}


# Classification outcomes. `reason` is what gets printed, so a run says WHY it
# touched (or refused to touch) each file rather than reporting a bare count.
def classify_doc(shipped_path: str, fresh: str, recorded: str | None,
                 unknown_policy: str) -> tuple[bool, str]:
    """-> (write_it, reason)."""
    if not os.path.isfile(shipped_path):
        return True, "new"
    try:
        with open(shipped_path) as f:
            on_disk = f.read()
    except OSError:
        return True, "unreadable"
    if on_disk == fresh:
        return True, "reproduced"
    if recorded is None:
        # Predates the side-car, or was added by hand. Not decidable from data,
        # so it is a DECISION and therefore a flag, not a constant
        # (--unknown-provenance). Default `keep` never silently reverts an edit
        # nobody can explain; the drift guard makes every keep loud, so the
        # pair cannot rot the way `tuned = differs` did on its own.
        if unknown_policy == "overwrite":
            return True, "unknown-provenance-overwritten"
        return False, "unknown-provenance"
    if sha256_text(on_disk) == recorded:
        return True, "stale"          # untouched since generation; tool moved
    return False, "hand-tuned"        # bytes on disk are not the tool's bytes


# ---------------------------------------------------------------------------
# GH#667: keys this extractor does not derive, but the shipped doc owns
# ---------------------------------------------------------------------------
#
# `ambient` is derived as `is_hero and not anim_driven and visible_ratio >= 0.5`,
# and `is_hero` is read out of `content/champions/**` — a directory that moves
# for reasons that have NOTHING to do with this extractor. When 鋼彈 (godie-hlgr)
# was retired into `content/_legacy/champions/`, `imported.gumdam` stopped being
# a champion modelKey, so a rerun stopped emitting `ambient` for its docs. The
# side-car legitimately says "these bytes are mine" (they were), so classify_doc
# says STALE and the key is overwritten away — silently, and with the run still
# printing a cheerful "preserved" banner about the CONFIG file.
#
# The cost is not cosmetic: `isSwingTrailDoc()` (apps/client/src/vfx/
# swingTrailMath.ts) recognises a blade afterimage by
# `ambient === true && mode === "continuous" && anchorBone !== undefined`.
# Drop the key and 鋼彈's swing trail disappears at runtime while every gate
# stays green.
#
# So the whitelist below is carried over per key from the shipped doc when a
# rerun would otherwise drop it. It is deliberately TINY, and it is the same
# one `test/shippedVfxIsCurrent.test.ts` already excludes from drift
# (HAND_OWNED_KEYS) — that guard learned to TOLERATE the difference; this makes
# the extractor stop CREATING it. Before adding a second entry, ask whether the
# extractor could derive it instead.
#
# ⚠️ Only the "shipped has it, tool no longer produces it" direction is carried.
# The tool starting to produce a key it did not before is real news and lands.
HAND_OWNED_DOC_KEYS = ("ambient",)


def carry_hand_owned(shipped_path: str, doc: dict) -> list[str]:
    """Copy whitelisted keys the shipped doc has and `doc` lacks. -> key names."""
    try:
        with open(shipped_path) as f:
            prior = json.load(f)
    except (OSError, ValueError):
        return []
    carried = []
    for k in HAND_OWNED_DOC_KEYS:
        if k in prior and k not in doc:
            doc[k] = prior[k]
            carried.append(k)
    return carried


def emit_doc(doc_id: str, doc: dict, out_path: str,
             recorded: dict, unknown_policy: str, overwrite_tuned: bool,
             out_root: str, dry_run: bool,
             fresh_hashes: dict, classified: dict,
             drop_hand_owned: bool = False,
             carried_log: dict | None = None) -> None:
    """Write one extracted doc, honouring the provenance classification.

    `fresh_hashes` gets the hash of the bytes this tool WRITES — never the
    on-disk bytes of a doc it decided to keep (see the provenance block: that
    would make a hand-tune match its own record and get reverted two runs
    later). Carrying a HAND_OWNED_DOC_KEY happens BEFORE the hash is taken,
    because the carry is part of generation and is idempotent: a second run
    produces the same bytes, so the doc classifies `reproduced` rather than
    flapping between stale and hand-tuned.
    """
    shipped_path = os.path.join(VFX_DIR, doc_id + ".json")
    if not drop_hand_owned:
        carried = carry_hand_owned(shipped_path, doc)
        if carried and carried_log is not None:
            carried_log[doc_id] = carried
    text = doc_text(doc)
    fresh_hashes[doc_id] = sha256_text(text)
    write, reason = classify_doc(shipped_path, text, recorded.get(doc_id),
                                 unknown_policy)
    if overwrite_tuned:
        write, reason = True, ("forced" if not write else reason)
    classified.setdefault(reason, []).append(doc_id)
    if dry_run:
        return
    if write:
        with open(out_path, "w") as f:
            f.write(text)
    elif out_root:
        # Staging must PREVIEW what an in-place run leaves on disk, so a kept
        # doc is staged as the kept file. Otherwise `--out-dir` would show a
        # tree that no real run ever produces.
        if os.path.isfile(shipped_path):
            shutil.copyfile(shipped_path, out_path)


def _arg(name: str, default: str) -> str:
    for a in sys.argv[1:]:
        if a.startswith(name + "="):
            return a[len(name) + 1:]
    return default


def main() -> int:
    dry_run = "--dry-run" in sys.argv
    # `--density=` is the extraction-time particle-count knob. 1.0 = faithful.
    # It exists so a haircut is a stated decision, not a magic constant inside
    # build_p2_doc (see the burstCount comment there).
    density = float(_arg("--density", "1.0"))
    # `--out-dir=` stages a full regeneration OUTSIDE content/vfx. That matters
    # because content/vfx/** is owned by the ability-binding lane: a corrected
    # extractor must be diffable against the shipped docs without overwriting
    # 228 files under someone else's feet.
    out_root = _arg("--out-dir", "")
    trail_budget = "--raw-ribbons" not in sys.argv
    overwrite_tuned = "--overwrite-tuned" in sys.argv
    # GH#667. Default OFF = carry the key over, because the failure it prevents
    # is silent (a swing trail that stops existing) while the failure it can
    # cause is loud (the drift guard names the doc and the field). The flag is
    # the stated way to say "the extractor's word is final", exactly like
    # `--replace-ambient` next door. ⛔ Do not fold it into --overwrite-tuned:
    # that one is about WHOSE BYTES win for a whole doc; this one is about a
    # key the extractor cannot derive at all.
    drop_hand_owned = "--drop-hand-owned" in sys.argv
    unknown_policy = _arg("--unknown-provenance", "keep")
    if unknown_policy not in ("keep", "overwrite"):
        print(f"--unknown-provenance must be keep|overwrite, got "
              f"{unknown_policy!r}", file=sys.stderr)
        return 2
    vfx_dir = os.path.join(out_root, "vfx") if out_root else VFX_DIR
    config_dir = os.path.join(out_root, "config") if out_root else CONFIG_DIR
    particles_md = os.path.join(out_root, "PARTICLES.md") if out_root else PARTICLES_MD
    prov_out = (os.path.join(out_root, "vfx-provenance.json") if out_root
                else PROVENANCE_PATH)
    # ALWAYS read the SHIPPED side-car, even when staging. Under --out-dir the
    # staging tree has no history, so reading it there would classify every doc
    # as new — which is exactly the bug `--out-dir` had before 2026-08-02: the
    # review path was the one path with the safety net switched off.
    recorded_hashes = load_provenance(PROVENANCE_PATH)
    fingerprint = tool_fingerprint()
    fresh_hashes: dict[str, str] = {}
    classified: dict[str, list[str]] = {}
    carried_keys: dict[str, list[str]] = {}
    if out_root and not dry_run:
        os.makedirs(vfx_dir, exist_ok=True)
        os.makedirs(config_dir, exist_ok=True)

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

    tex = TextureResolver(
        dry_run,
        os.path.join(out_root, "assets", "textures", "particles", "wc3")
        if out_root else WC3_TEX_OUT)
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
            doc, ambient = build_p2_doc(doc_id, em, m, scale, tex, is_hero, notes,
                                        density)
            out_path = os.path.join(vfx_dir, doc_id + ".json")
            # Same provenance rule as the ribbons below. It applies to PRE2 docs
            # too because "hand-tuned" was never a ribbon-only possibility —
            # before this, a hand-edited emitter doc was overwritten without a
            # word, which is the mirror-image failure of pinning a stale one.
            emit_doc(doc_id, doc, out_path, recorded_hashes,
                     unknown_policy, overwrite_tuned, out_root, dry_run,
                     fresh_hashes, classified, drop_hand_owned, carried_keys)
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
            doc = build_ribbon_doc(doc_id, rb, m, scale, tex, notes,
                                   trail_budget)
            out_path = os.path.join(vfx_dir, doc_id + ".json")
            # DO NOT SILENTLY REVERT #37 (see ribbon_trail_budget above), and
            # DO NOT PIN ROT EITHER — see the provenance block above classify_doc
            # for why "differs from a fresh extraction" could never do both.
            # `--overwrite-tuned` is the deliberate escape hatch.
            emit_doc(doc_id, doc, out_path, recorded_hashes,
                     unknown_policy, overwrite_tuned, out_root, dry_run,
                     fresh_hashes, classified, drop_hand_owned, carried_keys)
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
    ambient_doc, kept_cfg_keys, kept_cfg_bindings, kept_cfg_entries = write_ambient_config(
        os.path.join(config_dir, "ambient-vfx.json"),
        os.path.join(CONFIG_DIR, "ambient-vfx.json"), ambient_doc,
        "--replace-ambient" in sys.argv, dry_run)

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
    md.append("- `Width` x `Length` are the FULL sides of the emission "
              "rectangle (particles spawn over +/- half of each about the "
              "node), so `emitter.radius` = max(Width, Length) / 2 * scale — "
              "the disc that bounds that rectangle. Proven against the binary "
              "in extract_particles.emission_disc_radius(); identical to "
              "w3xEmitterToVfxDoc() in apps/client/src/render/vfx/w3xEmitter.ts")
    md.append(f"- burst `burstCount` = emissionRate * density (density="
              f"{density}); 1.0 is faithful. Runtime particle budget lives in "
              "render/vfx/emitterBudget.ts and is NOT baked in here")
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
        with open(particles_md, "w") as f:
            f.write("\n".join(md))

    # ---- provenance side-car ---------------------------------------------
    # Written LAST and only on a full, non-dry run, so it can never claim to
    # describe docs this run did not actually produce.
    if not dry_run:
        with open(prov_out, "w") as f:
            json.dump({
                "schema": PROVENANCE_SCHEMA,
                "generatedBy": "tools/w3x-import/extract_particles.py",
                "toolFingerprint": fingerprint,
                "options": {"density": density, "trailBudget": trail_budget},
                "docs": {k: fresh_hashes[k] for k in sorted(fresh_hashes)},
            }, f, indent=2)
            f.write("\n")

    print(f"models with particles: {len(per_model)}/{len(files)}")
    print(f"docs: {n_docs} ({n_p2} vfx + {n_rb} ribbon) -> content/vfx/")
    print(f"ambient bindings: {len(bindings)} hero models")
    print(f"textures: {len(tex.copied)} copied from map, "
          f"{len(tex.substitutions)} substituted")
    print("ribbon trail budget (#37): "
          + ("ON" if trail_budget else "OFF (--raw-ribbons)"))
    print(f"tool fingerprint: {fingerprint} -> {prov_out}")
    # One line per outcome, so a run states what it decided about every doc
    # instead of reporting a bare count of files touched.
    for reason in ("new", "reproduced", "stale", "unknown-provenance",
                   "unknown-provenance-overwritten", "hand-tuned", "forced",
                   "unreadable"):
        ids = classified.get(reason, [])
        if not ids:
            continue
        print(f"  {reason}: {len(ids)}")
    for reason, blurb in (
        ("hand-tuned",
         "on-disk bytes are NOT the bytes this tool wrote -> KEPT. Reconcile "
         "them (fold the edit into the extractor, the way ribbon_trail_budget() "
         "holds #37) — do not ignore the list. --overwrite-tuned discards them."),
        ("unknown-provenance",
         "no side-car entry, so 'stale' vs 'hand-tuned' is not decidable -> "
         "KEPT (--unknown-provenance=overwrite to rewrite them)."),
    ):
        ids = classified.get(reason, [])
        if not ids:
            continue
        print(f"KEPT {len(ids)} doc(s) — {reason}: {blurb}")
        for d in ids:
            print(f"  - {d}")
    if carried_keys:
        print(f"carried hand-owned doc key(s) on {len(carried_keys)} doc(s) "
              "(GH#667, --drop-hand-owned to let the extractor's word be final):")
        for d in sorted(carried_keys):
            print(f"  - {d}: {', '.join(carried_keys[d])}")
    if kept_cfg_keys or kept_cfg_bindings or kept_cfg_entries:
        print("ambient-vfx.json: preserved non-extracted content "
              "(--replace-ambient to drop it):")
        for k in kept_cfg_keys:
            print(f"  - top-level key `{k}` (admin-editable config, not MDX)")
        for k in kept_cfg_bindings:
            print(f"  - hand-added binding `{k}`")
        for k in kept_cfg_entries:
            print(f"  - hand-added entry inside a DERIVED binding: {k}")
    print(f"summary: {particles_md}")
    if dry_run:
        print("(dry run: nothing written)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
