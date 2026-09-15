#!/usr/bin/env python3
"""Rebuild and register Ryu's <8k six-state procedural model option."""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import struct
import subprocess
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
WORKFLOW = Path(__file__).resolve().parent
SOURCE_ID = "gitlab-ssbu-models"
SOURCE_COMPONENT_ID = "ssbu-ryu-c00-procedural-six-state-v1"
COMPONENT_ID = "ssbu-ryu-c00-procedural-six-state-decimated-v1"
SOURCE_SHA = "97898b3e9211bfb829a1e23ecb28bcd09bb72354e594959eb11e484e379316cf"
SOURCE_BYTES = 1_069_196
OUTPUT_SHA = "c932402930880da55b3f79c1bdc47b955e9a3f048e46a74800bd39f5d9698b8c"
OUTPUT_BYTES = 748_828
MODEL_ID = "community.body.02b6e37dfb4f8a061e3244a48707a55a43c91d95c83f99c7"
OLD_MODEL_ID = "community.body.6329b227d1e34b92b8ab9c5e21760b7d00d811296154efc9"
CLIP_MAP = {name: f"GGD_procedural_{name}" for name in ("idle", "run", "attack", "cast", "hurt", "death")}
DEFAULT_SOURCE = ROOT.parent / "GGD-Asset-Library/conversions/ssbu-ryu-c00-procedural-six-state-v1/body.glb"
DEFAULT_LOCAL_ROOT = ROOT.parent / "GGD-Asset-Library/conversions/ssbu-ryu-c00-procedural-six-state-decimation-v1"
DOWNLOADS = ROOT / "materials/hero-model-library/download-sources.json"
RECEIPT = ROOT / "materials/hero-model-library/priority-evidence/ssbu-ryu-procedural-decimation-v1/registration.json"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def encoded(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


def pin(path: Path) -> dict:
    data = path.read_bytes()
    return {"absolutePath": str(path.resolve()), "bytes": len(data), "sha256": digest(data)}


def inspect_glb(path: Path) -> dict:
    raw = path.read_bytes()
    require(raw[:4] == b"glTF" and struct.unpack_from("<I", raw, 4)[0] == 2, "not GLB 2.0")
    json_size, json_type = struct.unpack_from("<II", raw, 12)
    require(json_type == 0x4E4F534A, "missing GLB JSON chunk")
    doc = json.loads(raw[20:20 + json_size].decode().rstrip(" \0"))
    primitives = [primitive for mesh in doc.get("meshes", []) for primitive in mesh.get("primitives", [])]
    triangles = sum(doc["accessors"][row["indices"]]["count"] // 3 for row in primitives)
    clips = [{"name": animation.get("name"), "channels": len(animation.get("channels", []))}
             for animation in doc.get("animations", [])]
    textures = []
    binary_offset = 20 + json_size
    binary_size, binary_type = struct.unpack_from("<II", raw, binary_offset)
    require(binary_type == 0x004E4942, "missing GLB BIN chunk")
    binary = raw[binary_offset + 8:binary_offset + 8 + binary_size]
    for image in doc.get("images", []):
        view = doc["bufferViews"][image["bufferView"]]
        start = view.get("byteOffset", 0)
        data = binary[start:start + view["byteLength"]]
        require(data[:8] == b"\x89PNG\r\n\x1a\n", "embedded image is not PNG")
        textures.append(struct.unpack(">II", data[16:24]))
    return {
        "triangles": triangles,
        "drawPrimitives": len(primitives),
        "skinCount": len(doc.get("skins", [])),
        "jointCount": len(doc.get("skins", [{}])[0].get("joints", [])),
        "textures": textures,
        "clips": clips,
    }


def upsert(rows: list[dict], value: dict) -> None:
    matches = [row for row in rows if row.get("id") == value["id"]]
    require(len(matches) <= 1, f"duplicate id: {value['id']}")
    if matches:
        rows[rows.index(matches[0])] = value
    else:
        rows.append(value)


def build_candidate(source: Path) -> tuple[bytes, dict]:
    require((WORKFLOW / "node_modules").is_dir(), "run npm ci in the workflow directory first")
    with tempfile.TemporaryDirectory(prefix="ggd-ryu-decimation-") as temporary:
        first, second = Path(temporary) / "first.glb", Path(temporary) / "second.glb"
        reports = []
        for output in (first, second):
            completed = subprocess.run(
                ["node", str(WORKFLOW / "decimate.mjs"), str(source), str(output), "7900", "0.02"],
                cwd=WORKFLOW, check=True, capture_output=True, text=True,
            )
            reports.append(json.loads(completed.stdout))
        first_bytes, second_bytes = first.read_bytes(), second.read_bytes()
        require(first_bytes == second_bytes, "Ryu decimation is not byte-identical across two builds")
        require(len(first_bytes) == OUTPUT_BYTES and digest(first_bytes) == OUTPUT_SHA, "Ryu output bytes changed")
        require(reports[0] == reports[1], "Ryu decimation reports differ")
        return first_bytes, reports[0]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--local-root", type=Path, default=DEFAULT_LOCAL_ROOT)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--check", action="store_true")
    args = parser.parse_args()

    source = args.source.resolve()
    source_pin = pin(source)
    require((source_pin["bytes"], source_pin["sha256"]) == (SOURCE_BYTES, SOURCE_SHA), "Ryu source bytes changed")
    output_bytes, decimation = build_candidate(source)
    with tempfile.NamedTemporaryFile(prefix="ggd-ryu-inspect-", suffix=".glb") as temp:
        Path(temp.name).write_bytes(output_bytes)
        metrics = inspect_glb(Path(temp.name))
    require((metrics["triangles"], metrics["drawPrimitives"], metrics["skinCount"], metrics["jointCount"]) == (7894, 5, 1, 154), "Ryu metrics changed")
    require(metrics["textures"] == [(256, 256)] * 5, "Ryu textures exceed 256px or changed")
    require(metrics["clips"] == [{"name": name, "channels": 12} for name in CLIP_MAP.values()], "Ryu clip contract changed")

    git_glb = ROOT / f"content/assets/models/community/{OUTPUT_SHA}.glb"
    new_doc = {
        "id": MODEL_ID, "schema": "model@1", "glbPath": f"assets/models/community/{OUTPUT_SHA}.glb",
        "scale": 1, "collisionRadius": 0.6, "clipMap": CLIP_MAP, "yawOffsetDeg": 0, "heroBody": True,
    }
    new_doc_bytes = encoded(new_doc)
    old_doc_path = ROOT / f"content/models/{OLD_MODEL_ID}.json"
    old_doc = json.loads(old_doc_path.read_text())
    require(old_doc.get("glbPath") == f"assets/models/community/{SOURCE_SHA}.glb", "old Ryu source document changed")
    old_doc["heroBody"] = False
    old_doc_bytes = encoded(old_doc)

    downloads = json.loads(DOWNLOADS.read_text())
    sources = [row for row in downloads.get("publicSources", []) if row.get("id") == SOURCE_ID]
    require(len(sources) == 1, "expected one SSBU source")
    components = sources[0].setdefault("componentCandidates", [])
    old = next((row for row in components if row.get("id") == SOURCE_COMPONENT_ID), None)
    require(old is not None and old.get("sha256") == SOURCE_SHA, "missing original animated Ryu source record")
    old.update({
        "componentReady": False, "runtimeReady": False, "runtimeSelectable": False,
        "runtimeDropdownRegistered": False, "defaultEligible": False, "automaticEligible": False,
        "heroIds": [], "relatedHeroIds": [], "formalHeroAdoptionEligible": False,
        "requiresDecimation": True, "supersededByComponentId": COMPONENT_ID,
        "readiness": "acquired-validated-high-poly-source-retained-not-runtime-selectable",
    })
    receipt_doc = {
        "schema": "ggd.ssbu-ryu-procedural-decimation-registration@1",
        "componentId": COMPONENT_ID,
        "sourceComponentId": SOURCE_COMPONENT_ID,
        "source": {**source_pin, "triangles": 14621, "retained": True, "runtimeSelectable": False,
                   "s3Uri": old.get("s3Uri"), "s3ArchiveMember": old.get("s3ArchiveMember")},
        "candidate": {"gitPath": git_glb.relative_to(ROOT).as_posix(), "bytes": OUTPUT_BYTES,
                      "sha256": OUTPUT_SHA, **metrics},
        "rebuild": {"runs": 2, "byteIdentical": True, "parameters": decimation,
                    "dependencyLock": {"gitPath": (WORKFLOW / "package-lock.json").relative_to(ROOT).as_posix(),
                                       "sha256": digest((WORKFLOW / "package-lock.json").read_bytes())},
                    "worker": {"gitPath": (WORKFLOW / "decimate.mjs").relative_to(ROOT).as_posix(),
                               "sha256": digest((WORKFLOW / "decimate.mjs").read_bytes())}},
        "registration": {"heroId": "acquired-ryu", "modelKey": MODEL_ID, "default": False,
                         "runtimeSelectable": True, "activeDefaultPreserved": "imported.herokyo",
                         "modelDocument": {"gitPath": f"content/models/{MODEL_ID}.json",
                                           "bytes": len(new_doc_bytes), "sha256": digest(new_doc_bytes)}},
        "validation": {"singleModelIntakeExpected": "clean", "khronosErrors": 0, "khronosWarnings": 0,
                       "animationProvenance": "ggd-procedural-fallback-not-native-or-retargeted",
                       "formalAdoptionTrianglePolicyPassed": True},
        "deploymentVerified": False,
    }
    receipt_bytes = encoded(receipt_doc)
    candidate = {
        "id": COMPONENT_ID, "conversionCandidateId": COMPONENT_ID, "revisionOfComponentId": SOURCE_COMPONENT_ID,
        "sourceComponentId": SOURCE_COMPONENT_ID, "sourceId": SOURCE_ID, "sourceIds": [SOURCE_ID],
        "sourceClass": "original-game-extraction-community-repackage", "selectionClass": "canonical-game",
        "modelSourceCategory": "canonical-game", "animationSourceCategory": "ggd-procedural-fallback",
        "nameZh": "隆／Ryu", "originalName": "Ryu", "workZh": "任天堂明星大亂鬥 特別版（原作：Street Fighter）",
        "sourceGame": "Super Smash Bros. Ultimate", "sourceGameReleasedAt": "2018-12-07",
        "platform": "Nintendo Switch", "nativeId": "fighter/ryu/body/c00", "variant": "c00",
        "resourceRole": "complete-hero-body-with-procedural-six-state-motion",
        "assetKinds": ["model", "skeleton", "texture", "animation"],
        "absolutePath": str((args.local_root / "body.glb").resolve()), "path": str((args.local_root / "body.glb").resolve()),
        "bytes": OUTPUT_BYTES, "sha256": OUTPUT_SHA, "gitPath": git_glb.relative_to(ROOT).as_posix(),
        "componentReady": True, "converted": True, "structuralValidationPassed": True,
        "visualValidationPassed": True, "runtimeReady": True, "runtimeSelectable": True,
        "defaultEligible": False, "automaticEligible": False, "fullHeroModel": True,
        "runtimeDropdownRegistered": True, "heroIds": ["acquired-ryu"], "relatedHeroIds": ["acquired-ryu"],
        "identityIds": ["ssbu-ryu"], "nativeAnimationCount": 0, "proceduralAnimationCount": 6,
        "animationProvenance": "ggd-procedural-fallback-not-native-or-retargeted",
        "animationNames": list(CLIP_MAP.values()), "triangles": 7894, "drawPrimitives": 5,
        "skinCount": 1, "jointCount": 154, "textureCount": 5, "sixStateFallbackComplete": True,
        "completeGameplayActionSet": False, "modelKey": MODEL_ID,
        "readiness": "registered-non-default-procedural-six-state-option-current-policy-pass",
        "limitations": ["Six motions are GGD procedural fallback, not native SSBU or Street Fighter actions.",
                        "Five draw primitives exceed the warning threshold of three but stay within the hard limit.",
                        "Formal deployment has not been verified."],
        "registrationEvidence": {"gitPath": RECEIPT.relative_to(ROOT).as_posix(),
                                 "bytes": len(receipt_bytes), "sha256": digest(receipt_bytes)},
    }
    upsert(components, candidate)
    upsert(sources[0].setdefault("conversionAttempts", []), {
        "id": COMPONENT_ID, "status": candidate["readiness"], "sourceSha256": SOURCE_SHA,
        "outputSha256": OUTPUT_SHA, "componentId": COMPONENT_ID, "runtimeSelectable": True,
        "targetTriangles": 7900, "triangles": 7894, "errorBound": 0.02,
    })
    downloads_bytes = encoded(downloads)

    source_ts = ROOT / "packages/shared/src/content/heroForge/communityAcquired.ts"
    source_text = source_ts.read_text()
    old_line = f'  "acquired-ryu": ["imported.herokyo", "{OLD_MODEL_ID}"],'
    new_line = f'  "acquired-ryu": ["imported.herokyo", "{MODEL_ID}"],'
    require(source_text.count(old_line) + source_text.count(new_line) == 1, "Ryu acquired option mapping is ambiguous")
    desired_source = source_text.replace(old_line, new_line)

    writes = {
        args.local_root / "body.glb": output_bytes,
        args.local_root / "body-rebuild.glb": output_bytes,
        git_glb: output_bytes,
        ROOT / f"content/models/{MODEL_ID}.json": new_doc_bytes,
        old_doc_path: old_doc_bytes,
        DOWNLOADS: downloads_bytes,
        RECEIPT: receipt_bytes,
        source_ts: desired_source.encode(),
    }
    for path, data in writes.items():
        if args.write:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        else:
            require(path.is_file() and path.read_bytes() == data, f"stale Ryu integration: {path}")
    print(json.dumps({"componentId": COMPONENT_ID, "modelKey": MODEL_ID, "triangles": 7894,
                      "clips": 6, "sourceRetained": True, "runtimeSelectable": True,
                      "isDefault": False, "written": args.write}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
