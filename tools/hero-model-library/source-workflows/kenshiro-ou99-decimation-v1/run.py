#!/usr/bin/env python3
"""Rebuild, validate, render and register the OU99 Kenshiro candidate."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import struct
import subprocess
from pathlib import Path


REPO = Path(__file__).resolve().parents[4]
WORKFLOW = Path(__file__).resolve().parent
SOURCE = REPO / "content/assets/models/ou99/ou99_464696.glb"
SOURCE_DOC = REPO / "content/models/ou99.464696.json"
STAGE = REPO.parent / "GGD-Asset-Library/conversions/kenshiro-ou99-decimation-v1"
CANDIDATE = STAGE / "body.glb"
CONTENT_CANDIDATE = REPO / "content/assets/models/ou99/ou99_464696_standard_v1.glb"
CONTENT_DOC = REPO / "content/models/ou99.464696-standard-v1.json"
EVIDENCE = WORKFLOW / "evidence"
BLENDER = Path("/Applications/Blender.app/Contents/MacOS/Blender")
POLICY_PATH = REPO / "packages/shared/src/content/modelUpload/adoptionPolicy.json"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def glb(path: Path) -> tuple[dict, bytes]:
    raw = path.read_bytes()
    magic, version, length = struct.unpack_from("<III", raw)
    if magic != 0x46546C67 or version != 2 or length != len(raw):
        raise ValueError(f"invalid GLB: {path}")
    json_length, chunk_type = struct.unpack_from("<II", raw, 12)
    if chunk_type != 0x4E4F534A:
        raise ValueError("invalid GLB JSON chunk")
    document = json.loads(raw[20:20 + json_length].decode("utf-8"))
    cursor = 20 + json_length
    binary = b""
    if cursor < len(raw):
        binary_length, binary_type = struct.unpack_from("<II", raw, cursor)
        if binary_type != 0x004E4942:
            raise ValueError("invalid GLB binary chunk")
        binary = raw[cursor + 8:cursor + 8 + binary_length]
    return document, binary


def accessor_bytes(document: dict, binary: bytes, accessor_index: int) -> bytes:
    accessor = document["accessors"][accessor_index]
    view = document["bufferViews"][accessor["bufferView"]]
    component_bytes = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}[accessor["componentType"]]
    component_count = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT2": 4, "MAT3": 9, "MAT4": 16}[accessor["type"]]
    element_bytes = component_bytes * component_count
    stride = view.get("byteStride", element_bytes)
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    return b"".join(binary[start + index * stride:start + index * stride + element_bytes] for index in range(accessor["count"]))


def animation_sampler_digest(path: Path) -> str:
    document, binary = glb(path)
    digest = hashlib.sha256()
    for animation in document.get("animations", []):
        digest.update((animation.get("name") or "").encode())
        for sampler in animation.get("samplers", []):
            digest.update(accessor_bytes(document, binary, sampler["input"]))
            digest.update(accessor_bytes(document, binary, sampler["output"]))
    return digest.hexdigest()


def metrics(path: Path) -> dict:
    document, _ = glb(path)
    primitives = [primitive for mesh in document.get("meshes", []) for primitive in mesh.get("primitives", [])]
    triangles = sum(document["accessors"][primitive["indices"]]["count"] // 3 for primitive in primitives)
    images = document.get("images", [])
    return {
        "path": str(path), "bytes": path.stat().st_size, "sha256": sha256(path),
        "triangles": triangles, "primitives": len(primitives), "skins": len(document.get("skins", [])),
        "animations": len(document.get("animations", [])), "animationNames": [animation.get("name") for animation in document.get("animations", [])],
        "images": len(images), "materials": len(document.get("materials", [])), "nodes": len(document.get("nodes", [])),
    }


def run(command: list[str]) -> None:
    subprocess.run(command, cwd=REPO, check=True)


def geometry_vendor() -> Path:
    candidates = [
        REPO / "tools/model-budget/.optvendor/node_modules",
        REPO.parent / "GGD-hero-model-options/tools/model-budget/.optvendor/node_modules",
    ]
    for candidate in candidates:
        if (candidate / "@gltf-transform/core").exists() and (candidate / "meshoptimizer").exists():
            return candidate.resolve()
    raise ValueError("geometry vendor missing; run: bash tools/model-budget/optimize/bootstrap-geometry.sh")


def decimate(target: int) -> None:
    runner = STAGE / "geometry-worker"
    runner.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(REPO / "tools/model-budget/optimize/decimate.mjs", runner / "decimate.mjs")
    modules = runner / "node_modules"
    if modules.is_symlink() and modules.resolve() != geometry_vendor():
        modules.unlink()
    if not modules.exists():
        os.symlink(geometry_vendor(), modules, target_is_directory=True)
    run(["node", str(runner / "decimate.mjs"), str(SOURCE), str(CANDIDATE), str(target), "0.02"])


def build(write: bool) -> dict:
    if not SOURCE.is_file() or sha256(SOURCE) != "8210480e325b095dd4c85cb104ca2f9feb198752dd68c3c522862d95e167b85f":
        raise ValueError("OU99 464696 source is missing or changed")
    source_doc = json.loads(SOURCE_DOC.read_text())
    policy = json.loads(POLICY_PATH.read_text())["hero"]
    trigger = int(policy["decimateWhenTrianglesAbove"])
    target_max = int(policy["decimatedTargetTrianglesMax"])
    if write:
        STAGE.mkdir(parents=True, exist_ok=True)
        decimate(target_max - 100)
        CONTENT_CANDIDATE.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(CANDIDATE, CONTENT_CANDIDATE)
        candidate_doc = {
            **source_doc,
            "id": "ou99.464696-standard-v1",
            "glbPath": "assets/models/ou99/ou99_464696_standard_v1.glb",
        }
        CONTENT_DOC.write_text(json.dumps(candidate_doc, ensure_ascii=False, indent=2) + "\n")
    source_metrics, candidate_metrics = metrics(SOURCE), metrics(CONTENT_CANDIDATE)
    if source_metrics["triangles"] != 21733 or source_metrics["triangles"] <= trigger or candidate_metrics["triangles"] > target_max:
        raise ValueError("Kenshiro triangle contract failed")
    if source_metrics["animations"] != 62 or candidate_metrics["animations"] != 62:
        raise ValueError("Kenshiro native animation count changed")
    if source_metrics["animationNames"] != candidate_metrics["animationNames"]:
        raise ValueError("Kenshiro native animation names changed")
    source_sampler_digest = animation_sampler_digest(SOURCE)
    candidate_sampler_digest = animation_sampler_digest(CONTENT_CANDIDATE)
    if source_sampler_digest != candidate_sampler_digest:
        raise ValueError("Kenshiro native animation sampler arrays changed")
    if any(candidate_metrics[key] != source_metrics[key] for key in ("primitives", "skins", "images", "materials", "nodes")):
        raise ValueError("Kenshiro retained structure changed")
    if json.loads(CONTENT_DOC.read_text()).get("clipMap") != source_doc.get("clipMap"):
        raise ValueError("Kenshiro six-state clip map changed")
    run(["python3", "tools/w3x-import/model_intake.py", "--check", str(CONTENT_CANDIDATE)])
    if write:
        EVIDENCE.mkdir(parents=True, exist_ok=True)
        renderer = REPO / "tools/hero-model-library/source-workflows/approved-derivatives-v1/render_static_glb.py"
        for model, destination in ((SOURCE, EVIDENCE / "source-render"), (CONTENT_CANDIDATE, EVIDENCE / "candidate-render")):
            if destination.exists() and not (destination / "run.json").is_file():
                shutil.rmtree(destination)
            if not destination.exists():
                run(["python3", str(renderer), str(model), str(destination), "--repo", str(REPO)])
            preparation = STAGE / "render-preparation" / destination.name
            preparation.mkdir(parents=True, exist_ok=True)
            for intermediate_name in ("bundle.js", "chrome.log"):
                intermediate = destination / intermediate_name
                if intermediate.is_file():
                    shutil.copy2(intermediate, preparation / intermediate_name)
                    intermediate.unlink()
        run(["python3", str(WORKFLOW / "compare_visuals.py")])
        run(["node", "--import", "tsx", str(WORKFLOW / "register.mts"), str(REPO), "--apply"])
    else:
        run(["node", "--import", "tsx", str(WORKFLOW / "register.mts"), str(REPO), "--plan"])
    champion = json.loads((REPO / "content/champions/godie-umal.json").read_text())
    versions = [item for item in champion.get("modelVersions", []) if item.get("sourceModelKey") == "ou99.464696-standard-v1"]
    if write and (len(versions) != 1 or champion.get("modelKey") == versions[0]["modelKey"] or versions[0].get("automaticEligible") is not False):
        raise ValueError("Kenshiro non-default dropdown registration failed")
    receipt = {
        "schema": "ggd.kenshiro-ou99-decimation-integration@1",
        "policy": {
            "authority": str(POLICY_PATH.relative_to(REPO)), "authoritySha256": sha256(POLICY_PATH),
            "triggerTrianglesAbove": trigger, "targetTrianglesMax": target_max,
        },
        "source": source_metrics,
        "candidate": candidate_metrics,
        "preservation": {"nativeAnimations": 62, "sixStateClipMap": source_doc["clipMap"], "primitiveCount": 4, "skinCount": 1},
        "validation": {
            "modelIntake": "passed", "structureAndAnimationNames": "passed",
            "nativeSamplerArrays": "byte-identical", "sourceSamplerDigest": source_sampler_digest,
            "candidateSamplerDigest": candidate_sampler_digest,
        },
        "visualEvidence": {
            "sourceFront": "evidence/source-render/front.png", "candidateFront": "evidence/candidate-render/front.png",
            "sourceThreeViewProof": "evidence/source-render/proof.json", "candidateThreeViewProof": "evidence/candidate-render/proof.json",
            "comparison": "evidence/visual-comparison.json", "contactSheet": "evidence/ab-contact-sheet.png",
            "technicalRenderComplete": (EVIDENCE / "source-render/front.png").is_file() and (EVIDENCE / "candidate-render/front.png").is_file(),
            "litPixelContractPassed": json.loads((EVIDENCE / "visual-comparison.json").read_text())["litPixelContractPassed"],
            "technicalInspectionPassed": json.loads((EVIDENCE / "visual-comparison.json").read_text())["technicalInspection"]["result"] == "passed",
        },
        "registration": {
            "heroId": "godie-umal", "runtimeDropdownRegistered": len(versions) == 1,
            "candidateModelKey": versions[0]["modelKey"] if versions else None,
            "activeModelKey": champion.get("modelKey"), "nonDefault": bool(versions and champion.get("modelKey") != versions[0]["modelKey"]),
        },
        "productionDeploymentVerified": False,
    }
    if write:
        (EVIDENCE / "receipt.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
    elif not (EVIDENCE / "receipt.json").is_file() or json.loads((EVIDENCE / "receipt.json").read_text()) != receipt:
        raise ValueError("stale Kenshiro evidence receipt")
    return receipt


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--write", action="store_true")
    group.add_argument("--check", action="store_true")
    arguments = parser.parse_args()
    print(json.dumps(build(arguments.write), ensure_ascii=False))
