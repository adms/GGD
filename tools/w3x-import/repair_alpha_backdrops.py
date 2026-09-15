#!/usr/bin/env python3
"""Repair shipped GLBs whose transparent atlas is bound to an OPAQUE material.

The importer now applies this rule in ``w3xlib/gltf.py``.  This migration keeps
the already-shipped geometry, animation, buffers and images byte-for-byte and
changes only the glTF material ``alphaMode``.  It exists because a full map
re-import also changes unrelated legacy geometry; a texture-safety repair must
not smuggle those changes into the same patch.

Usage:
  python3 tools/w3x-import/repair_alpha_backdrops.py --check
  python3 tools/w3x-import/repair_alpha_backdrops.py --write
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import struct
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
# This is a shipped-asset invariant, not an importer-folder invariant. Models
# in champions/, props/, effects/ and their LOD variants can carry the same
# embedded transparent atlas and are loaded by the exact same renderer.
MODEL_DIR = ROOT / "content" / "assets" / "models"
SOURCE_INDEX = ROOT / "materials" / "hero-model-library" / "download-sources.json"
JUMP_V6_CONVERSION = ROOT / "materials/hero-model-library/priority-evidence/jump-force-dai-six-draw-v6/conversion.json"
ALPHA_BACKGROUND_MAX = 5
MIN_BACKGROUND_SHARE = 0.02


def chunks(data: bytes) -> tuple[dict, bytes]:
    if len(data) < 20 or struct.unpack_from("<II", data, 0) != (0x46546C67, 2):
        raise ValueError("not GLB v2")
    offset, doc, binary = 12, None, None
    while offset + 8 <= len(data):
        size, kind = struct.unpack_from("<II", data, offset)
        body = data[offset + 8:offset + 8 + size]
        if kind == 0x4E4F534A:
            doc = json.loads(body.rstrip(b" \0"))
        elif kind == 0x004E4942:
            binary = body
        offset = (offset + 8 + size + 3) & ~3
    if doc is None or binary is None:
        raise ValueError("missing JSON/BIN chunk")
    return doc, binary


def png_for(doc: dict, binary: bytes, texture_index: int) -> Image.Image | None:
    textures = doc.get("textures", [])
    if not 0 <= texture_index < len(textures):
        return None
    image_index = textures[texture_index].get("source")
    images = doc.get("images", [])
    if not isinstance(image_index, int) or not 0 <= image_index < len(images):
        return None
    view_index = images[image_index].get("bufferView")
    views = doc.get("bufferViews", [])
    if not isinstance(view_index, int) or not 0 <= view_index < len(views):
        return None
    view = views[view_index]
    start = view.get("byteOffset", 0)
    raw = binary[start:start + view["byteLength"]]
    return Image.open(io.BytesIO(raw)).convert("RGBA")


def repairs(doc: dict, binary: bytes) -> list[str]:
    changed: list[str] = []
    cache: dict[int, Image.Image | None] = {}
    for index, material in enumerate(doc.get("materials", [])):
        if material.get("alphaMode", "OPAQUE") != "OPAQUE":
            continue
        texture_index = (material.get("pbrMetallicRoughness", {})
                         .get("baseColorTexture", {}).get("index"))
        if not isinstance(texture_index, int):
            continue
        image = cache.setdefault(texture_index, png_for(doc, binary, texture_index))
        if image is None:
            continue
        histogram = image.getchannel("A").histogram()
        pixels = image.width * image.height
        background = sum(histogram[:ALPHA_BACKGROUND_MAX + 1]) / pixels
        if background < MIN_BACKGROUND_SHARE:
            continue
        material["alphaMode"] = "BLEND"
        material.pop("alphaCutoff", None)
        changed.append(
            f"mat{index}:{material.get('name', '?')} transparent={background * 100:.2f}%"
        )
    return changed


def encode(doc: dict, binary: bytes) -> bytes:
    raw_json = json.dumps(doc, separators=(",", ":"), ensure_ascii=False).encode("utf8")
    raw_json += b" " * ((-len(raw_json)) % 4)
    binary += b"\0" * ((-len(binary)) % 4)
    total = 12 + 8 + len(raw_json) + 8 + len(binary)
    return (struct.pack("<III", 0x46546C67, 2, total)
            + struct.pack("<II", len(raw_json), 0x4E4F534A) + raw_json
            + struct.pack("<II", len(binary), 0x004E4942) + binary)


def documented_predecessors() -> dict[Path, dict]:
    """Return old content-addressed GLBs that have a checked successor.

    An older content blob is deliberately retained for lineage.  It is not a
    deployable model once its source record names a newer normalized blob.  We
    skip it only after verifying both input and successor digests; a stale or
    partial record continues through the normal transparent-atlas failure.
    """
    if not SOURCE_INDEX.is_file():
        return {}
    try:
        index = json.loads(SOURCE_INDEX.read_text())
    except (OSError, json.JSONDecodeError):
        return {}
    archived: dict[Path, dict] = {}
    for section in ("publicSources", "paidSources"):
        for source in index.get(section, []):
            for candidate in source.get("componentCandidates", []):
                normalization = candidate.get("materialNormalization") or {}
                predecessor = candidate.get("sourceArtifact") or {}
                old_rel = predecessor.get("gitPathAtIngest")
                old_sha = predecessor.get("sha256")
                new_rel = candidate.get("gitPath")
                new_sha = candidate.get("sha256")
                if (normalization.get("schema") != "ggd-transparent-component-material-normalization@1"
                        or not all(isinstance(value, str) for value in (old_rel, old_sha, new_rel, new_sha))
                        or old_rel == new_rel):
                    continue
                old_path = ROOT / old_rel
                new_path = ROOT / new_rel
                if not old_path.is_file() or not new_path.is_file():
                    continue
                if hashlib.sha256(old_path.read_bytes()).hexdigest() != old_sha:
                    continue
                if hashlib.sha256(new_path.read_bytes()).hexdigest() != new_sha:
                    continue
                archived[old_path.resolve()] = {
                    "candidateId": candidate.get("id"),
                    "successor": new_rel,
                    "successorSha256": new_sha,
                }
    # JUMP FORCE Dai is not a reusable static-component source record: it has
    # no accepted motion set and therefore belongs in its own source workflow.
    # The v6 receipt nevertheless supplies the same digest-checked predecessor
    # contract used above, including the retained v3 and v5 artifacts.
    if JUMP_V6_CONVERSION.is_file():
        try:
            conversion = json.loads(JUMP_V6_CONVERSION.read_text())
            output = conversion.get("output", {})
            if conversion.get("schema") == "ggd.jump-force-dai-alpha-normalization@1":
                new_path = ROOT / output.get("gitPath", "")
                if (new_path.is_file() and isinstance(output.get("sha256"), str)
                        and hashlib.sha256(new_path.read_bytes()).hexdigest() == output["sha256"]):
                    for predecessor in conversion.get("retainedPredecessors", []):
                        old_rel, old_sha = predecessor.get("gitPathAtIngest"), predecessor.get("sha256")
                        if not isinstance(old_rel, str) or not isinstance(old_sha, str):
                            continue
                        old_path = ROOT / old_rel
                        if old_path.is_file() and hashlib.sha256(old_path.read_bytes()).hexdigest() == old_sha:
                            archived[old_path.resolve()] = {
                                "candidateId": conversion.get("candidateId"),
                                "successor": output["gitPath"],
                                "successorSha256": output["sha256"],
                            }
        except (OSError, json.JSONDecodeError, TypeError):
            pass
    return archived


def tracked_model_paths() -> list[Path]:
    """The release gate evaluates only files committed to the repository.

    Other workflows often have conversion output under content/assets before it
    is registered.  Such untracked WIP must not make an unrelated branch fail,
    while a newly staged/committed file is still checked deterministically.
    """
    import subprocess
    result = subprocess.run(
        ["git", "ls-files", "-z", "content/assets/models"], cwd=ROOT,
        check=True, capture_output=True,
    )
    return [ROOT / item.decode() for item in result.stdout.split(b"\0")
            if item and item.decode().lower().endswith(".glb")]


def main() -> int:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--write", action="store_true")
    parser.add_argument("--all-local", action="store_true",
                        help="also inspect untracked local conversion work-in-progress")
    args = parser.parse_args()
    bad = 0
    frozen = 0
    archived = 0
    predecessors = documented_predecessors()
    paths = MODEL_DIR.rglob("*.glb") if args.all_local else tracked_model_paths()
    for path in sorted(paths):
        if path.resolve() in predecessors:
            row = predecessors[path.resolve()]
            archived += 1
            print(f"ARCHIVED: {path.relative_to(MODEL_DIR)} -> {row['successor']} ({row['candidateId']})")
            continue
        data = path.read_bytes()
        doc, binary = chunks(data)
        changed = repairs(doc, binary)
        if not changed:
            continue
        bad += len(changed)
        print(f"{path.relative_to(MODEL_DIR)}: " + "; ".join(changed))
        # ⛔⛔ **凍結版本一個位元組都不可以改。** `ModelVersions.freeze()` 把來源位元組
        #   逐位元組複製到 `…/versions/<binarySha256>.glb` —— ⭐ **檔名就是它的內容雜湊**，
        #   而 `apps/content-api/src/modelVersions.ts:129` 的 `verify()` 拿
        #   `sha256Bytes(bytes) !== version.binarySha256` 比對它。
        #   ⇒ 在這裡就地改寫 = 檔名與內容對不上 = **那位英雄的模型版本驗證當場失效**，
        #     ⚠️ 而且 `--write` 會回 0，看起來完全成功（fail-open 沒錯，靜默才是缺陷）。
        # ⭐ 正解是**重新註冊**（修好來源 → 走 register 產生一份新雜湊的凍結副本），
        #   ⛔ 不是原地修。所以這裡只指名它，⛔ 不動它。
        if "/versions/" in path.as_posix():
            frozen += 1
            print(f"    ⛔ 凍結版本,⛔ **不原地修** —— 修好來源之後**重新註冊**（見 modelVersions.ts:129）")
            continue
        if args.write:
            path.write_bytes(encode(doc, binary))
    if frozen:
        print(f"⚠️ 其中 {frozen} 份是凍結版本 ⇒ ⛔ 沒有被修,要走重新註冊")
    if args.check and bad:
        print(f"FAIL: {bad} OPAQUE transparent-atlas material(s)")
        return 1
    print(f"{'repaired' if args.write else 'checked'}: {bad}; archived-predecessors: {archived}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
