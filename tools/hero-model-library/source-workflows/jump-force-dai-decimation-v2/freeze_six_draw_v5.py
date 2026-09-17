#!/usr/bin/env python3
"""Freeze the checked JUMP FORCE Dai V5 material-faithful candidate in Git.

This is deliberately a source-stage freeze only.  It publishes the immutable
model and its validation evidence for cataloguing, but it never registers a
hero option: the extracted JUMP candidate has no accepted motion set.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path


CANDIDATE_ID = "jump-force-native-dai-chr0430-material-faithful-six-draw-v5"
SHA256 = "53606bca3df424e867d1d2bc63e105db255a061dd792228154476b625d044482"
BYTES = 3010392
EVIDENCE = (
    "conversion.json", "validation.json", "guard.json", "atlas-plan.json",
    "merge-receipt.json", "front.png", "back.png", "isometric.png",
    "proof.json", "run.json",
)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def pin(path: Path, repo: Path) -> dict:
    return {"gitPath": path.relative_to(repo).as_posix(), "bytes": path.stat().st_size,
            "sha256": digest(path)}


def copy_immutable(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and target.read_bytes() != source.read_bytes():
        raise ValueError(f"refusing to overwrite immutable Git artifact: {target}")
    if not target.exists():
        shutil.copyfile(source, target)


def prepare(repo: Path, asset_root: Path) -> tuple[dict[Path, bytes], dict]:
    stage = asset_root / "conversions/jump-force-dai-six-draw-v5b"
    candidate = stage / "run-a/dai-chr0430-six-draw.glb"
    rebuild = stage / "run-b/dai-chr0430-six-draw.glb"
    conversion = json.loads((stage / "conversion.json").read_text())
    validation = json.loads((repo / "materials/hero-model-library/priority-evidence/jump-force-dai-six-draw-v5/validation.json").read_text())
    guard = json.loads((repo / "materials/hero-model-library/priority-evidence/jump-force-dai-six-draw-v5/guard.json").read_text())
    if conversion.get("candidateId") != CANDIDATE_ID:
        raise ValueError("unexpected V5 conversion identity")
    if (candidate.stat().st_size, digest(candidate)) != (BYTES, SHA256) or candidate.read_bytes() != rebuild.read_bytes():
        raise ValueError("V5 candidate or deterministic rebuild differs")
    if validation.get("candidateId") != CANDIDATE_ID or validation.get("candidate", {}).get("sha256") != SHA256:
        raise ValueError("V5 validation candidate pin mismatch")
    if validation.get("metrics") != {"triangles": 7930, "drawPrimitives": 6, "maxTextureEdge": 256, "skins": 1, "joints": 159, "animations": 0}:
        raise ValueError("V5 metrics differ")
    if validation.get("khronos", {}).get("errors") != 0 or validation.get("policy", {}).get("adoption", {}).get("status") != "eligible":
        raise ValueError("V5 failed Khronos or current policy")
    if not validation.get("webgl", {}).get("complete") or validation["webgl"].get("views") != 3:
        raise ValueError("V5 three-view WebGL receipt incomplete")
    if not validation.get("preservation", {}).get("perMaterialAtlasTiles") == 15:
        raise ValueError("V5 per-material atlas evidence missing")
    if guard.get("results", [{}])[0].get("adoption", {}).get("status") != "eligible":
        raise ValueError("V5 guard is not eligible")

    evidence_root = repo / "materials/hero-model-library/priority-evidence/jump-force-dai-six-draw-v5"
    git_model = repo / f"content/assets/models/community/{SHA256}.glb"
    source_evidence = {
        "conversion.json": stage / "conversion.json",
        "validation.json": evidence_root / "validation.json",
        "guard.json": evidence_root / "guard.json",
        "atlas-plan.json": stage / "atlas/atlas-plan.json",
        "merge-receipt.json": stage / "run-a/merge-receipt.json",
        "front.png": stage / "render/front.png", "back.png": stage / "render/back.png",
        "isometric.png": stage / "render/isometric.png", "proof.json": stage / "render/proof.json",
        "run.json": stage / "render/run.json",
    }
    outputs = {git_model: candidate.read_bytes()}
    for name, path in source_evidence.items():
        outputs[evidence_root / name] = path.read_bytes()
    receipt = {
        "schema": "ggd.jump-force-dai-v5-freeze@1", "candidateId": CANDIDATE_ID,
        "sourceId": "steam-jump-force-priority-original-assets-build-8523149",
        "nativeCharacterId": "chr0430", "heroIds": ["godie-nbbc", "godie-n01c"],
        "gitModel": {"gitPath": git_model.relative_to(repo).as_posix(), "bytes": BYTES, "sha256": SHA256},
        "conversionStage": str(stage.resolve()), "deterministicRebuild": True,
        "metrics": validation["metrics"],
        "acceptedFor": "Git catalogued source model component only",
        "notAcceptedFor": ["hero option registration", "backend selection", "runtime switching", "production deployment"],
        "reason": "No native or owner-reviewed borrowed motion set is bound to this JUMP FORCE model.",
        "evidence": [],
    }
    # Add pins only after the evidence bytes have been written or matched.
    outputs[evidence_root / "freeze-receipt.json"] = (json.dumps(receipt, ensure_ascii=False, indent=2) + "\n").encode()
    return outputs, receipt


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--asset-root", type=Path, required=True)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.write == args.check:
        raise ValueError("choose exactly one of --write or --check")
    repo, asset_root = args.repo.resolve(), args.asset_root.resolve()
    outputs, receipt = prepare(repo, asset_root)
    for target, data in outputs.items():
        if args.check:
            if not target.is_file() or target.read_bytes() != data:
                raise ValueError(f"stale V5 frozen output: {target}")
        else:
            if target.name.endswith('.glb'):
                # Models are immutable; evidence is generator-owned and can refresh.
                source = asset_root / "conversions/jump-force-dai-six-draw-v5b/run-a/dai-chr0430-six-draw.glb"
                copy_immutable(source, target)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
    print(json.dumps({"candidateId": CANDIDATE_ID, "sha256": SHA256, "written": args.write}, ensure_ascii=False))


if __name__ == "__main__":
    main()
