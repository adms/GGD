#!/usr/bin/env python3
"""Build deterministic, unbound Dai PN010 VFX review candidates.

The source workflow has already admitted 18 textures and eight static meshes as
independent support components.  This step composes those byte-pinned assets
into review-only, authored visual recipes.  It intentionally does not recover
Niagara timing, select a skill event, choose a skeleton socket, or mutate
runtime content.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import io
import json
import math
import random
import struct
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFont, ImageOps


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
SOURCE = REPO / "materials/hero-model-library/priority-evidence/infinity-strash-dai-vfx-components-v1/candidates.json"
POLICY = REPO / "materials/hero-model-library/priority-evidence/infinity-strash-dai-vfx-components-v1/policy-check.json"
OUTPUT = REPO / "materials/hero-model-library/priority-evidence/infinity-strash-dai-vfx-components-v1/review-candidates-v1"
OWNER_DECISIONS = REPO / "materials/hero-model-library/review/asset-review-portal-v1/owner-decisions.json"
OWNER_APPROVAL = OUTPUT / "owner-approval.json"
PUBLIC = REPO / "apps/client/public"
PUBLIC_PREVIEWS = PUBLIC / "infinity-strash-dai-vfx-review-previews-v1"
PUBLIC_PAGE = PUBLIC / "infinity-strash-dai-vfx-review-candidates.html"
PUBLIC_SHEET = PUBLIC / "infinity-strash-dai-vfx-review-candidates.png"

SCHEMA = "ggd.infinity-strash-dai-vfx-review-candidates@1"
FRAME_TIMES = (0.0, 0.5, 1.0)
CANVAS_SIZE = (480, 270)

# These are authored preview choices, not recovered source semantics.  Keeping
# them explicit makes visual changes reviewable and reproducible.
PROFILES = {
    "NPS_Skl01_Flash_00": {
        "profile": "radial-flash-preview",
        "colours": ((110, 202, 255), (235, 250, 255)),
        "layout": "radial",
    },
    "NPS_PN010_Special02_Flash_00": {
        "profile": "disk-flash-preview",
        "colours": ((80, 158, 255), (255, 244, 188)),
        "layout": "radial",
    },
    "NPS_PN010_Special03_Slash_00": {
        "profile": "slash-arc-preview",
        "colours": ((65, 157, 255), (220, 247, 255)),
        "layout": "arc",
    },
    "NPS_PN010_Special03_EnergyThunderA": {
        "profile": "thunder-billboard-preview",
        "colours": ((118, 154, 255), (248, 250, 255)),
        "layout": "vertical",
    },
    "NPS_PN010_Special03_Jump_00": {
        "profile": "ground-burst-preview",
        "colours": ((86, 179, 255), (245, 252, 255)),
        "layout": "ground",
    },
    "NPS_PN010_Special03_Shuchusen_00": {
        "profile": "speedline-preview",
        "colours": ((85, 169, 255), (236, 251, 255)),
        "layout": "horizontal",
    },
}


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def evidence(path: Path) -> dict:
    return {
        "gitPath": path.relative_to(REPO).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def encode_json(value: dict) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def verify_pin(item: dict) -> Path:
    path = REPO / item["gitPath"]
    if not path.is_file() or path.stat().st_size != item.get("bytes", path.stat().st_size) or sha256(path) != item["sha256"]:
        raise ValueError(f"Pinned Git asset drifted: {item['gitPath']}")
    return path


def build_owner_approval(source: dict, manifest: dict) -> dict:
    """Project the fixed portal receipt onto Dai's source-specific index.

    ``review-candidates.json`` stays the immutable pre-decision input used by
    the portal fingerprint.  This overlay records the later owner decision
    without turning visual acceptance into a runtime or skill binding.
    """
    receipt = read_json(OWNER_DECISIONS)
    if receipt.get("schema") != "ggd.asset-review-decisions@1":
        raise ValueError("Unexpected asset-review owner decision schema")
    if receipt.get("reviewer") != "owner" or not receipt.get("reviewedAt"):
        raise ValueError("Dai VFX owner approval lacks reviewer evidence")
    if receipt.get("runtimeMutationAllowed") is not False:
        raise ValueError("Owner approval receipt must remain runtime inert")
    decisions = receipt.get("decisions")
    if not isinstance(decisions, list):
        raise ValueError("Owner approval decisions are absent")
    by_id = {row.get("candidateId"): row for row in decisions}
    if len(by_id) != len(decisions):
        raise ValueError("Owner approval decisions contain duplicate candidate IDs")

    support = []
    for kind, rows in (("texture", source["textureComponents"]), ("mesh", source["meshComponents"])):
        for row in rows:
            if kind == "texture" and not row.get("componentEligible"):
                continue
            component_id = row["componentId"]
            candidate_id = f"dai-vfx-{kind}:{component_id}"
            decision = by_id.get(candidate_id)
            if (not decision
                    or decision.get("decision") != "approve"
                    or decision.get("approvedBindings") != []
                    or decision.get("runtimeBindingAuthorized") is not False):
                raise ValueError(f"Dai support component lacks fixed visual-only approval: {candidate_id}")
            support.append({
                "candidateId": candidate_id,
                "componentId": component_id,
                "kind": kind,
                "ownerDecision": "approve",
                "approvalScope": "support-component-visual-review-only",
                "visuallyApproved": True,
                "approvedBindings": [],
                "runtimeMutationAllowed": False,
                "runtimeState": "unbound-reserve",
            })

    composites = []
    for row in manifest["candidates"]:
        candidate_id = "dai-vfx-composite:" + row["candidateId"]
        decision = by_id.get(candidate_id)
        if (not decision
                or decision.get("decision") != "approve"
                or decision.get("approvedBindings") != []
                or decision.get("runtimeBindingAuthorized") is not False):
            raise ValueError(f"Dai composite lacks fixed visual-only approval: {candidate_id}")
        composites.append({
            "candidateId": candidate_id,
            "reviewCandidateId": row["candidateId"],
            "nativePackageStem": row["nativePackageStem"],
            "ownerDecision": "approve",
            "approvalScope": "composite-visual-review-only",
            "visuallyApproved": True,
            "approvedBindings": [],
            "runtimeMutationAllowed": False,
            "runtimeBindingCreated": False,
            "runtimeSelectable": False,
            "productionDeployed": False,
        })

    if len(support) != 26 or len(composites) != 6:
        raise ValueError("Expected 26 approved Dai support components and six approved composites")
    return {
        "schema": "ggd.infinity-strash-dai-vfx-owner-approval@1",
        "sourceId": source["sourceId"],
        "sourceFingerprint": receipt["sourceFingerprint"],
        "reviewer": receipt["reviewer"],
        "reviewedAt": receipt["reviewedAt"],
        "inputs": {
            "components": evidence(SOURCE),
            "preDecisionCandidates": evidence(OUTPUT / "review-candidates.json"),
            "ownerDecisionReceipt": evidence(OWNER_DECISIONS),
        },
        "summary": {
            "ownerVisualApprovedTextureComponents": 18,
            "ownerVisualApprovedMeshComponents": 8,
            "ownerVisualApprovedSupportComponents": 26,
            "ownerVisualApprovedCompositeCandidates": 6,
            "ownerVisualApprovedItems": 32,
            "approvedBindings": 0,
            "runtimeMutations": 0,
            "productionDeployed": 0,
        },
        "boundary": {
            "visualApprovalDoesNotAuthorizeSkillOrRuntimeBinding": True,
            "niagaraTimingRecovered": False,
            "skillEventsAssigned": False,
            "skeletonAttachmentsAssigned": False,
            "originalEffectParityClaimed": False,
            "runtimeMutationAllowed": False,
        },
        "approvedBindings": [],
        "supportComponents": support,
        "composites": composites,
    }


def glb_triangles(path: Path) -> list[tuple[tuple[float, float, float], ...]]:
    raw = path.read_bytes()
    if len(raw) < 28 or raw[:4] != b"glTF" or struct.unpack_from("<I", raw, 4)[0] != 2:
        raise ValueError(f"Invalid GLB: {path}")
    json_length, json_type = struct.unpack_from("<II", raw, 12)
    if json_type != 0x4E4F534A:
        raise ValueError(f"GLB JSON chunk missing: {path}")
    doc = json.loads(raw[20 : 20 + json_length].decode("utf-8").rstrip(" \x00"))
    binary_at = 20 + json_length
    binary_length, binary_type = struct.unpack_from("<II", raw, binary_at)
    if binary_type != 0x004E4942:
        raise ValueError(f"GLB BIN chunk missing: {path}")
    blob = raw[binary_at + 8 : binary_at + 8 + binary_length]

    def values(index: int) -> list:
        accessor = doc["accessors"][index]
        view = doc["bufferViews"][accessor["bufferView"]]
        code, scalar = {5121: ("B", 1), 5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4)}[accessor["componentType"]]
        width = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[accessor["type"]]
        offset = int(view.get("byteOffset", 0)) + int(accessor.get("byteOffset", 0))
        stride = int(view.get("byteStride", width * scalar))
        fmt = "<" + code * width
        result = []
        for row in range(int(accessor["count"])):
            item = struct.unpack_from(fmt, blob, offset + row * stride)
            result.append(item[0] if width == 1 else item)
        return result

    output = []
    for mesh in doc.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            position_id = primitive.get("attributes", {}).get("POSITION")
            if not isinstance(position_id, int):
                continue
            positions = values(position_id)
            index_id = primitive.get("indices")
            indices = values(index_id) if isinstance(index_id, int) else list(range(len(positions)))
            if int(primitive.get("mode", 4)) != 4:
                continue
            for at in range(0, len(indices) - 2, 3):
                ids = [int(indices[at + offset]) for offset in range(3)]
                if all(0 <= index < len(positions) for index in ids):
                    output.append(tuple(tuple(float(x) for x in positions[index][:3]) for index in ids))
    return output


def mask_from_texture(path: Path) -> Image.Image:
    with Image.open(path) as opened:
        opened.load()
        rgba = opened.convert("RGBA")
    rgb = rgba.convert("RGB").split()
    light = ImageChops.lighter(rgb[0], ImageChops.lighter(rgb[1], rgb[2]))
    alpha = rgba.getchannel("A")
    if alpha.getextrema() != (255, 255):
        light = ImageChops.multiply(light, alpha)
    light = ImageEnhance.Contrast(light).enhance(1.15)
    return light


def texture_review_role(row: dict) -> str:
    reference = row["reference"].lower()
    if "/gradient/" in reference:
        return "preview-opacity-modulator"
    if "/color/" in reference:
        return "preview-colour-modulator"
    return "preview-visible-billboard"


def colourized(mask: Image.Image, colour: tuple[int, int, int], opacity: float) -> Image.Image:
    alpha = mask.point(lambda value: max(0, min(255, round(value * opacity))))
    layer = Image.new("RGBA", mask.size, colour + (0,))
    layer.putalpha(alpha)
    return layer


def contain_mask(mask: Image.Image, max_edge: int) -> Image.Image:
    scale = min(max_edge / max(1, mask.width), max_edge / max(1, mask.height))
    size = (max(1, round(mask.width * scale)), max(1, round(mask.height * scale)))
    return mask.resize(size, Image.Resampling.LANCZOS)


def additive(base: Image.Image, layer: Image.Image, position: tuple[int, int]) -> None:
    placed = Image.new("RGBA", base.size, (0, 0, 0, 0))
    placed.alpha_composite(layer, position)
    rgb = ImageChops.add(base.convert("RGB"), placed.convert("RGB"), scale=1.0, offset=0)
    base.paste(rgb.convert("RGBA"))


def texture_transform(index: int, count: int, layout: str, phase: float, seed: int) -> tuple[float, float, float, float]:
    rng = random.Random(seed + index * 101)
    progress = 0.16 + 0.84 * phase
    angle = rng.uniform(-22, 22)
    if layout == "arc":
        angle += -56 + (112 * index / max(1, count - 1))
        x = 0.50 + math.cos(math.radians(angle)) * 0.11
        y = 0.52 + math.sin(math.radians(angle)) * 0.08
    elif layout == "vertical":
        x, y = 0.50 + rng.uniform(-0.08, 0.08), 0.18 + 0.54 * (index / max(1, count - 1))
    elif layout == "ground":
        x, y = 0.50 + rng.uniform(-0.18, 0.18), 0.70 + rng.uniform(-0.06, 0.06)
    elif layout == "horizontal":
        x, y = 0.18 + 0.64 * (index / max(1, count - 1)), 0.50 + rng.uniform(-0.18, 0.18)
        angle += rng.choice((-90, 0, 90))
    else:
        radians = 2 * math.pi * index / max(1, count)
        x, y = 0.50 + math.cos(radians) * 0.12, 0.50 + math.sin(radians) * 0.10
    scale = (0.28 + rng.uniform(0.0, 0.18)) * (0.72 + 0.45 * progress)
    opacity = max(0.12, math.sin(progress * math.pi) * 0.7 + 0.18)
    return x, y, angle, scale * opacity


def draw_meshes(canvas: Image.Image, mesh_rows: list[dict], colour: tuple[int, int, int], phase: float) -> None:
    if not mesh_rows:
        return
    overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for mesh_index, row in enumerate(mesh_rows):
        triangles = glb_triangles(verify_pin(row))
        if not triangles:
            continue
        points = [point for triangle in triangles for point in triangle]
        spans = [max(p[a] for p in points) - min(p[a] for p in points) for a in range(3)]
        axes = sorted(range(3), key=lambda axis: spans[axis], reverse=True)[:2]
        min_x, max_x = min(p[axes[0]] for p in points), max(p[axes[0]] for p in points)
        min_y, max_y = min(p[axes[1]] for p in points), max(p[axes[1]] for p in points)
        diameter = 98 + 34 * phase
        scale = min(diameter / max(max_x - min_x, 1e-8), diameter / max(max_y - min_y, 1e-8))
        offset_x = CANVAS_SIZE[0] * 0.5 + (mesh_index - (len(mesh_rows) - 1) / 2) * 24
        offset_y = CANVAS_SIZE[1] * 0.53
        project = lambda p: (
            offset_x + (p[axes[0]] - (min_x + max_x) / 2) * scale,
            offset_y - (p[axes[1]] - (min_y + max_y) / 2) * scale,
        )
        step = max(1, math.ceil(len(triangles) / 480))
        alpha = round(70 + 100 * math.sin((0.15 + phase * 0.75) * math.pi))
        for triangle in triangles[::step]:
            polygon = [project(point) for point in triangle]
            draw.line([polygon[0], polygon[1], polygon[2], polygon[0]], fill=colour + (alpha,), width=1)
    canvas.alpha_composite(overlay)


def render_frame(candidate: dict, texture_by_id: dict, mesh_by_id: dict, phase: float) -> Image.Image:
    width, height = CANVAS_SIZE
    canvas = Image.new("RGBA", CANVAS_SIZE, (4, 10, 20, 255))
    glow = Image.new("L", CANVAS_SIZE, 0)
    ImageDraw.Draw(glow).ellipse((width * 0.22, height * 0.06, width * 0.78, height * 0.94), fill=44)
    glow_layer = Image.new("RGBA", CANVAS_SIZE, tuple(candidate["previewProfile"]["colours"][0]) + (0,))
    glow_layer.putalpha(glow)
    canvas.alpha_composite(glow_layer)
    texture_uses = candidate["sourceComponents"]["textureUses"]
    texture_ids = [row["componentId"] for row in texture_uses if row["role"] == "preview-visible-billboard"]
    profile = candidate["previewProfile"]
    seed = int(hashlib.sha256(candidate["candidateId"].encode()).hexdigest()[:8], 16)
    for index, component_id in enumerate(texture_ids):
        row = texture_by_id[component_id]
        mask = mask_from_texture(verify_pin(row))
        x, y, angle, magnitude = texture_transform(index, len(texture_ids), profile["layout"], phase, seed)
        max_edge = max(42, round(150 * magnitude))
        fitted = contain_mask(mask, max_edge)
        layer = colourized(fitted, tuple(profile["colours"][index % 2]), min(1.0, 0.32 + magnitude))
        layer = layer.rotate(angle + phase * (18 if index % 2 else -13), resample=Image.Resampling.BICUBIC, expand=True)
        left = round(x * width - layer.width / 2)
        top = round(y * height - layer.height / 2)
        additive(canvas, layer, (left, top))
    mesh_rows = [mesh_by_id[item] for item in candidate["sourceComponents"]["meshIds"]]
    draw_meshes(canvas, mesh_rows, tuple(profile["colours"][1]), phase)
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((0, 0, width, 29), fill=(2, 7, 14, 210))
    draw.text((10, 8), f"{candidate['nativePackageStem']}  t={phase:.1f}", fill=(226, 239, 255, 255), font=ImageFont.load_default())
    draw.text((10, height - 20), "AUTHORED PREVIEW · PENDING · UNBOUND", fill=(255, 190, 112, 255), font=ImageFont.load_default())
    return canvas.convert("RGB")


def make_contact_sheet(candidates: list[dict]) -> bytes:
    card_width, card_height = 500, 310
    sheet = Image.new("RGB", (card_width * 3, 74 + card_height * len(candidates)), "#070d15")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    draw.text((18, 15), "Infinity Strash Dai PN010 · authored VFX review candidates", fill="white", font=font)
    draw.text((18, 39), "Three deterministic time slices; no Niagara timing, skill event, socket, approval, runtime or deployment claim.", fill="#ffbd73", font=font)
    for row_index, candidate in enumerate(candidates):
        top = 74 + row_index * card_height
        for frame_index, frame in enumerate(candidate["previewEvidence"]):
            with Image.open(REPO / frame["gitPath"]) as opened:
                preview = ImageOps.contain(opened.convert("RGB"), (470, 264))
            sheet.paste(preview, (frame_index * card_width + 15, top + 4))
        draw.text((15, top + 278), candidate["candidateId"], fill="#d9ecff", font=font)
        draw.text((15, top + 295), candidate["previewProfile"]["profile"] + " · ownerDecision=pending", fill="#8fb2d2", font=font)
    output = io.BytesIO()
    sheet.save(output, "PNG", optimize=True)
    return output.getvalue()


def make_page(manifest: dict) -> str:
    cards = []
    for candidate in manifest["candidates"]:
        images = "".join(
            f'<figure><img src="infinity-strash-dai-vfx-review-previews-v1/{html.escape(Path(frame["gitPath"]).name)}" alt="{html.escape(candidate["candidateId"])} t={frame["time"]}"><figcaption>t={frame["time"]:.1f}</figcaption></figure>'
            for frame in candidate["previewEvidence"]
        )
        cards.append(
            f'<article><h2>{html.escape(candidate["nativePackageStem"])}</h2><p><code>{html.escape(candidate["candidateId"])}</code> · {html.escape(candidate["previewProfile"]["profile"])} · <b>pending</b></p>'
            f'<div class="frames">{images}</div><p>來源元件：{len(candidate["sourceComponents"]["textureIds"])} 貼圖／{len(candidate["sourceComponents"]["meshIds"])} mesh。技能事件、Niagara 時序、骨架掛點均未指定。</p></article>'
        )
    payload = html.escape(json.dumps({"schema": manifest["schema"], "candidateIds": [row["candidateId"] for row in manifest["candidates"]]}, ensure_ascii=False))
    return f'''<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>達伊 PN010 VFX 視覺候選</title><style>body{{margin:0;background:#070c13;color:#e9f1fb;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}}main{{max-width:1480px;margin:auto;padding:28px}}.warn{{padding:16px;border:1px solid #bd8053;background:#39291f;border-radius:12px}}article{{margin:24px 0;padding:18px;background:#111b28;border:1px solid #293b50;border-radius:12px}}.frames{{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}}figure{{margin:0}}img{{width:100%;border-radius:7px;border:1px solid #36516c}}figcaption{{color:#9bb2c9}}code{{color:#98d6ff}}@media(max-width:800px){{.frames{{grid-template-columns:1fr}}}}</style></head><body><main><h1>達伊 PN010：VFX 視覺重建候選</h1><p class="warn"><b>六項全部待審、未綁定。</b>畫面是以已驗證的 18 張貼圖與 8 顆 mesh 所作的安全程序化預覽；它不代表原作 Niagara 時序、技能事件、骨架掛點、完整特效或正式站內容。</p>{''.join(cards)}<script type="application/json" id="candidate-index">{payload}</script></main></body></html>'''


def build(write: bool) -> dict:
    source = read_json(SOURCE)
    policy = read_json(POLICY)
    if source.get("schema") != "ggd.infinity-strash-dai-vfx-component-candidates@1":
        raise ValueError("Unexpected Dai VFX component schema")
    if policy.get("summary") != {"texturesChecked": 18, "texturesHardPass": 18, "meshesChecked": 8, "meshesHardPass": 8, "meshesBlocked": 0}:
        raise ValueError("Dai VFX component policy receipt is absent or no longer all-pass")
    textures = [row for row in source["textureComponents"] if row.get("componentEligible")]
    meshes = source["meshComponents"]
    texture_by_id = {row["componentId"]: {**row, "sha256": sha256(REPO / row["gitPath"]), "bytes": (REPO / row["gitPath"]).stat().st_size} for row in textures}
    mesh_by_id = {row["componentId"]: {**row, "sha256": sha256(REPO / row["gitPath"]), "bytes": (REPO / row["gitPath"]).stat().st_size} for row in meshes}
    if len(texture_by_id) != 18 or len(mesh_by_id) != 8:
        raise ValueError("Expected exactly 18 texture and eight mesh support components")

    expected_files: dict[Path, bytes] = {}
    candidates = []
    for source_root in source["roots"]:
        stem = source_root["nativePackageStem"]
        if stem not in PROFILES:
            raise ValueError(f"No explicit review profile for {stem}")
        candidate_id = "dai-pn010-review-" + hashlib.sha256(source_root["reference"].encode()).hexdigest()[:12]
        profile = PROFILES[stem]
        candidate = {
            "candidateId": candidate_id,
            "heroIds": source["character"]["heroIds"],
            "nativeCharacterId": "PN010",
            "nativePackageStem": stem,
            "sourceRoot": {
                "candidateId": source_root["candidateId"],
                "reference": source_root["reference"],
                "sourceFiles": source_root["sourceFiles"],
                "observedRendererCounts": source_root["metrics"],
            },
            "sourceComponents": {
                "textureIds": source_root["linkedComponents"]["textureIds"],
                "textureUses": [
                    {"componentId": item, "role": texture_review_role(texture_by_id[item])}
                    for item in source_root["linkedComponents"]["textureIds"]
                ],
                "meshIds": source_root["linkedComponents"]["meshIds"],
                "meshUses": [
                    {"componentId": item, "role": "preview-wireframe-geometry-reference"}
                    for item in source_root["linkedComponents"]["meshIds"]
                ],
            },
            "previewProfile": {
                "kind": "authored-static-procedural-preview",
                "profile": profile["profile"],
                "layout": profile["layout"],
                "colours": [list(colour) for colour in profile["colours"]],
                "durationSeconds": 1.0,
                "fixedTimes": list(FRAME_TIMES),
                "selectionBasis": "explicit profile keyed by native package stem; not recovered Niagara semantics or skill mapping",
            },
            "previewEvidence": [],
            "ownerDecision": "pending",
            "approvedBindings": [],
            "states": {
                "supportComponentsVerified": True,
                "staticProceduralPreviewBuilt": True,
                "niagaraTimingRecovered": False,
                "skillEventIdentified": False,
                "skeletonAttachmentIdentified": False,
                "originalEffectParityClaimed": False,
                "visuallyApproved": False,
                "runtimeBindingCreated": False,
                "runtimeSelectable": False,
                "productionDeployed": False,
            },
        }
        for phase in FRAME_TIMES:
            name = f"{candidate_id}-t{round(phase * 10):02d}.png"
            path = PUBLIC_PREVIEWS / name
            output = io.BytesIO()
            render_frame(candidate, texture_by_id, mesh_by_id, phase).save(output, "PNG", optimize=True)
            expected_files[path] = output.getvalue()
            if write:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(output.getvalue())
            elif not path.is_file() or path.read_bytes() != output.getvalue():
                raise ValueError(f"Review preview drifted: {path.relative_to(REPO)}")
            candidate["previewEvidence"].append({"time": phase, **evidence(path)})
        candidates.append(candidate)

    used_textures = {item for row in candidates for item in row["sourceComponents"]["textureIds"]}
    used_meshes = {item for row in candidates for item in row["sourceComponents"]["meshIds"]}
    if used_textures != set(texture_by_id) or used_meshes != set(mesh_by_id):
        raise ValueError("Review recipes do not cover every admitted Dai support component")

    manifest = {
        "schema": SCHEMA,
        "sourceId": source["sourceId"],
        "heroIds": source["character"]["heroIds"],
        "inputs": {"components": evidence(SOURCE), "policy": evidence(POLICY)},
        "summary": {
            "sourceRoots": 6,
            "reviewCandidatesBuilt": len(candidates),
            "fixedPreviewFrames": len(candidates) * len(FRAME_TIMES),
            "textureComponentsCovered": len(used_textures),
            "meshComponentsCovered": len(used_meshes),
            "ownerApproved": 0,
            "approvedBindings": 0,
            "runtimeMutations": 0,
            "productionDeployed": 0,
        },
        "boundary": {
            "candidateKind": "authored-static-procedural-visual-review",
            "niagaraTimingRecovered": False,
            "skillEventsAssigned": False,
            "skeletonAttachmentsAssigned": False,
            "originalEffectParityClaimed": False,
            "runtimeMutationAllowed": False,
            "audioBindingAllowed": False,
        },
        "approvedBindings": [],
        "candidates": candidates,
        "review": {
            "page": "apps/client/public/infinity-strash-dai-vfx-review-candidates.html",
            "contactSheet": "apps/client/public/infinity-strash-dai-vfx-review-candidates.png",
            "decisionDefault": "pending",
            "laterPortalAuthority": "materials/hero-model-library/priority-evidence/infinity-strash-dai-vfx-components-v1/review-candidates-v1/review-candidates.json",
        },
    }

    if write:
        OUTPUT.mkdir(parents=True, exist_ok=True)
        manifest_path = OUTPUT / "review-candidates.json"
        manifest_path.write_bytes(encode_json(manifest))
        # Rebuild after writing the manifest so its input evidence pins the
        # exact pre-decision bytes on disk.
        owner_approval = build_owner_approval(source, manifest)
        OWNER_APPROVAL.write_bytes(encode_json(owner_approval))
        PUBLIC_SHEET.write_bytes(make_contact_sheet(candidates))
        PUBLIC_PAGE.write_text(make_page(manifest), encoding="utf-8")
        unused = {
            "schema": "ggd.infinity-strash-dai-vfx-unbound-components@1",
            "sourceId": source["sourceId"],
            "summary": {"unboundTextureComponents": 18, "unboundMeshComponents": 8, "previewRecipeReferences": sum(len(row["sourceComponents"]["textureIds"]) + len(row["sourceComponents"]["meshIds"]) for row in candidates), "runtimeBindings": 0},
            "components": [
                {"componentId": item, "kind": "texture", "gitPath": texture_by_id[item]["gitPath"], "sha256": texture_by_id[item]["sha256"], "usedByReviewCandidates": [row["candidateId"] for row in candidates if item in row["sourceComponents"]["textureIds"]], "runtimeState": "unbound-reserve"}
                for item in sorted(texture_by_id)
            ] + [
                {"componentId": item, "kind": "mesh", "gitPath": mesh_by_id[item]["gitPath"], "sha256": mesh_by_id[item]["sha256"], "usedByReviewCandidates": [row["candidateId"] for row in candidates if item in row["sourceComponents"]["meshIds"]], "runtimeState": "unbound-reserve"}
                for item in sorted(mesh_by_id)
            ],
        }
        (OUTPUT / "unused-assets.json").write_bytes(encode_json(unused))
        readme = [
            "# 達伊 PN010 VFX 視覺重建候選 v1",
            "",
            "本批把既有 18 張合格貼圖與 8 顆 mesh 支援元件組成六個可重現的靜態／程序化視覺候選。每個候選固定輸出 t=0.0、0.5、1.0 三個畫面，供後續統一審查頁產生器收錄。",
            "",
            "- `review-candidates.json` 保留審查前 `pending` 快照，維持固定審查收據的來源指紋。",
            "- `owner-approval.json` 是目前來源專屬核准索引：18 張貼圖、8 顆 mesh 與 6 個 composite 共 32 項均為 owner visual approve。",
            "- 視覺核准不授權技能或 runtime 綁定；`approvedBindings` 是空陣列，`runtimeMutationAllowed` 為 false。",
            "- 這些畫面不是 Niagara 播放時序還原，也沒有指定技能事件、骨架掛點或音訊。",
            "- 沒有寫入 `content/vfx`、英雄設定或 runtime 綁定；正式站部署為 0。",
            "- 審查前候選：`review-candidates.json`；目前核准索引：`owner-approval.json`；未綁定元件：`unused-assets.json`。",
            "- 獨立審查頁：`apps/client/public/infinity-strash-dai-vfx-review-candidates.html`。",
            "",
            "## 重建與檢查",
            "",
            "```sh",
            "bash scripts/python-pillow.sh tools/hero-model-library/source-workflows/infinity-strash-dai-vfx-components-v1/build_review_candidates.py",
            "bash scripts/python-pillow.sh tools/hero-model-library/source-workflows/infinity-strash-dai-vfx-components-v1/build_review_candidates.py --check",
            "python3 -m unittest tools/hero-model-library/source-workflows/infinity-strash-dai-vfx-components-v1/test_review_candidates.py",
            "```",
            "",
        ]
        (OUTPUT / "README.md").write_text("\n".join(readme), encoding="utf-8")
        receipt = {
            "schema": "ggd.infinity-strash-dai-vfx-review-candidate-receipt@1",
            "manifest": evidence(manifest_path),
            "ownerApproval": evidence(OWNER_APPROVAL),
            "unusedAssets": evidence(OUTPUT / "unused-assets.json"),
            "document": evidence(OUTPUT / "README.md"),
            "reviewPage": evidence(PUBLIC_PAGE),
            "contactSheet": evidence(PUBLIC_SHEET),
            "previewFiles": [evidence(path) for path in sorted(PUBLIC_PREVIEWS.glob("*.png"))],
            "summary": manifest["summary"],
            "ownerApprovalSummary": owner_approval["summary"],
            "allGeneratedBytesVerified": True,
            "runtimeMutationAllowed": False,
        }
        (OUTPUT / "receipt.json").write_bytes(encode_json(receipt))
    else:
        manifest_path = OUTPUT / "review-candidates.json"
        if not manifest_path.is_file() or manifest_path.read_bytes() != encode_json(manifest):
            raise ValueError("Review candidate manifest is stale")
        # The candidate manifest intentionally remains the pre-decision portal
        # input.  Its bytes are part of the fixed 331-item review fingerprint,
        # so current owner state is checked through a separate overlay.
        owner_approval = build_owner_approval(source, manifest)
        if not OWNER_APPROVAL.is_file() or OWNER_APPROVAL.read_bytes() != encode_json(owner_approval):
            raise ValueError("Dai VFX owner approval overlay is stale")
        expected_set = set(expected_files)
        actual_set = set(PUBLIC_PREVIEWS.glob("*.png"))
        if actual_set != expected_set:
            raise ValueError("Review preview file set drifted")
        expected_sheet = make_contact_sheet(candidates)
        if not PUBLIC_SHEET.is_file() or PUBLIC_SHEET.read_bytes() != expected_sheet:
            raise ValueError("Review contact sheet is stale")
        expected_page = make_page(manifest).encode("utf-8")
        if not PUBLIC_PAGE.is_file() or PUBLIC_PAGE.read_bytes() != expected_page:
            raise ValueError("Review page is stale")
    return {**manifest, "ownerApproval": owner_approval}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    result = build(write=not args.check)
    print(
        "Dai PN010 VFX review candidates: "
        f"{result['summary']['reviewCandidatesBuilt']} built, "
        f"{result['summary']['fixedPreviewFrames']} fixed frames, "
        f"{result['ownerApproval']['summary']['ownerVisualApprovedItems']} owner visually approved, 0 bound"
    )


if __name__ == "__main__":
    main()
