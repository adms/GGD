#!/usr/bin/env python3
"""Freeze the two accepted Trainer decimations into Git and the source catalog."""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
from pathlib import Path


CONFIG = {
    "male-c00": {
        "componentId": "ssbu-ptrainer-male-c00-formal-decimated-v1",
        "oldComponentId": "ssbu-ptrainer-male-c00-static-skinned-v1",
        "nameZh": "寶可夢訓練家（男）", "originalName": "Pokémon Trainer (Male)", "variant": "c00",
        "nativeId": "fighter/ptrainer/model/ptrainer/c00", "sha256": "07182532a0fd1cb2f023673ed7204838859fa0c4c59745558eccc5eb029bee91",
        "bytes": 1178320, "triangles": 7896, "drawPrimitives": 5, "joints": 44, "textures": 4,
    },
    "female-c01": {
        "componentId": "ssbu-ptrainer-female-c01-formal-decimated-v1",
        "oldComponentId": "ssbu-ptrainer-female-c01-static-skinned-v1",
        "nameZh": "寶可夢訓練家（女）", "originalName": "Pokémon Trainer (Female)", "variant": "c01",
        "nativeId": "fighter/ptrainer/model/ptrainer/c01", "sha256": "73dc16fe5d0fe5c971ceeb54ec83a9ffa6b71bc9452185c1079b67c0c1c7273a",
        "bytes": 1221592, "triangles": 7892, "drawPrimitives": 6, "joints": 72, "textures": 5,
    },
}
EVIDENCE_ROOT = Path("materials/hero-model-library/priority-evidence/ssbu-ptrainer-formal-decimation-v1")


def require(value: bool, message: str) -> None:
    if not value:
        raise ValueError(message)


def sha(path: Path | bytes) -> str:
    raw = path.read_bytes() if isinstance(path, Path) else path
    return hashlib.sha256(raw).hexdigest()


def encode(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


def pin(path: Path, key: str = "absolutePath") -> dict:
    return {key: str(path.resolve()) if key == "absolutePath" else str(path), "bytes": path.stat().st_size, "sha256": sha(path)}


def ref(path: Path, data: bytes) -> dict:
    return {"gitPath": path.as_posix(), "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def build(repo: Path, asset_root: Path) -> dict[Path, bytes]:
    stage_root = asset_root / "conversions/ssbu-ptrainer-formal-decimation-v1"
    downloads_path = repo / "materials/hero-model-library/download-sources.json"
    downloads = json.loads(downloads_path.read_text())
    source = next(row for row in downloads["publicSources"] if row["id"] == "gitlab-ssbu-models")
    component_rows = source.setdefault("componentCandidates", [])
    attempts = source.setdefault("conversionAttempts", [])
    writes: dict[Path, bytes] = {}
    delivered = []
    for variant, cfg in CONFIG.items():
        stage = stage_root / variant; candidate = stage / "candidate.glb"; rebuild = stage / "candidate-rebuild.glb"
        require(candidate.is_file() and candidate.stat().st_size == cfg["bytes"] and sha(candidate) == cfg["sha256"], f"candidate changed: {variant}")
        require(candidate.read_bytes() == rebuild.read_bytes(), f"rebuild differs: {variant}")
        validation = json.loads((stage / "final-validation.json").read_text())
        visual = json.loads((stage / "visual-comparison.json").read_text())
        require(validation["formalAdoptionGeometryEligible"] and validation["motion"]["native"] == 0, f"validation differs: {variant}")
        require(visual["underFivePercentContract"] and visual["humanReview"]["result"] == "accepted", f"visual acceptance missing: {variant}")
        evidence = EVIDENCE_ROOT / variant
        fixed = {
            "decimation.json": (stage / "decimation.json").read_bytes(),
            "conversion.json": (stage / "conversion.json").read_bytes(),
            "validation.json": (stage / "raw-validation.json").read_bytes(),
            "preservation.json": (stage / "final-validation.json").read_bytes(),
            "visual-comparison.json": (stage / "visual-comparison.json").read_bytes(),
            "visual-ab-contact-sheet.png": (stage / "visual-ab-contact-sheet.png").read_bytes(),
            "worst-difference-overview.png": (stage / "worst-difference-overview.png").read_bytes(),
        }
        limitations = [
            "The fixed Worldblender source and this candidate contain zero actions; idle, run, attack, cast, hurt and death remain missing.",
            "The model is an accepted independent component and formal-geometry candidate, not a complete hero or a runtime dropdown option.",
            "No model@1 or semantic clip map is created; the existing manual default remains unchanged.",
            "The new decimation stage has not been uploaded to S3; the already verified source-conversion backup remains recorded separately.",
            "Main merge and production deployment are not verified.",
        ]
        old = next(row for row in component_rows if row.get("id") == cfg["oldComponentId"])
        source_backup = {
            "componentId": cfg["oldComponentId"], "s3Uri": old.get("s3Uri"),
            "backupReceiptPath": old.get("backupReceiptPath"), "status": old.get("backupStatus"),
            "scope": "source conversion only; does not include this new decimation stage",
        }
        acceptance = {
            "schema": "ggd-worldblender-c00-component-acceptance@1",
            "components": [{"id": cfg["componentId"], "sha256": cfg["sha256"], "accepted": True,
                "scope": "independent-static-skinned-model-component", "heroBound": False,
                "runtimeSelectable": False, "deploymentVerified": False, "nativeAnimationCount": 0}],
            "limitationsAccepted": limitations,
        }
        conversion_receipt = json.loads((stage / "conversion.json").read_text())
        source_rebuild = {
            "schema": "ggd-worldblender-c00-source-rebuild@1", "componentId": cfg["componentId"],
            "input": validation["source"], "first": validation["candidate"],
            "second": {**validation["candidate"], "localPath": validation["candidate"]["localPath"].replace("candidate.glb", "candidate-rebuild.glb")},
            "byteIdenticalRebuild": True, "bothValidationsPassed": True,
            "outputSha256": cfg["sha256"],
            "toolAndParameters": {
                "tool": conversion_receipt["tool"],
                "parameters": conversion_receipt["parameters"],
            },
        }
        fixed["acceptance.json"] = encode(acceptance)
        fixed["source-rebuild.json"] = encode(source_rebuild)
        refs = {name: ref(evidence / name, data) for name, data in fixed.items()}
        git_model = Path(f"content/assets/models/community/{cfg['sha256']}.glb")
        delivery = {
            "schema": "ggd-ssbu-ptrainer-formal-decimation-delivery@1", "componentId": cfg["componentId"],
            "character": {"heroId": "acquired-pokemon-trainer", "nameZh": cfg["nameZh"], "originalName": cfg["originalName"], "nativeId": cfg["nativeId"], "variant": cfg["variant"]},
            "sourceId": "gitlab-ssbu-models", "sourceGame": "Super Smash Bros. Ultimate", "platform": "Nintendo Switch",
            "input": validation["source"], "output": {"gitPath": git_model.as_posix(), "bytes": cfg["bytes"], "sha256": cfg["sha256"]},
            "metrics": {"trianglesBefore": 10698 if variant == "male-c00" else 11086, "trianglesAfter": cfg["triangles"], "drawPrimitives": cfg["drawPrimitives"], "jointCount": cfg["joints"], "textureCount": cfg["textures"], "nativeAnimationCount": 0},
            "validation": {"khronosErrors": 0, "khronosWarnings": 0, "ggdHardErrors": 0, "byteIdenticalRebuild": True,
                "visualViews": ["front", "back", "isometric"], "maxChangedPixelPct": visual["maxChangedPixelPctAtChannelDeltaGt10"], "maxLitXorPct": visual["maxLitClassificationXorPctAtLuma128"]},
            "status": {"converted": True, "structurallyValidated": True, "visuallyAcceptedIndependentComponent": True,
                "formalAdoptionGeometryEligible": True, "sixStateComplete": False, "heroBound": False,
                "runtimeSelectable": False, "deployed": False},
            "s3": {"newStage": "pending-not-uploaded", "sourceConversionBackup": source_backup}, "limitations": limitations,
        }
        fixed["delivery.json"] = encode(delivery); refs["delivery.json"] = ref(evidence / "delivery.json", fixed["delivery.json"])
        candidate_row = copy.deepcopy(old)
        # The old component's S3, normalization and validation receipts describe
        # the source conversion.  They must not be inherited by this new derived
        # asset; sourceConversionBackup below keeps that provenance explicitly.
        for stale_key in (
            "backupLocations", "backupReceiptSha256", "s3ArchiveMember", "s3Use",
            "sourceArtifact", "materialNormalization", "normalizationEvidence",
            "sourceFidelityEvidence", "webglProofEvidence",
        ):
            candidate_row.pop(stale_key, None)
        candidate_row.update({
            "id": cfg["componentId"], "conversionCandidateId": cfg["componentId"],
            "label": f"{cfg['nameZh']} SSBU c{cfg['variant'][-2:]} 正式減面候選",
            "nameZh": cfg["nameZh"], "originalName": cfg["originalName"], "nativeId": cfg["nativeId"], "variant": cfg["variant"],
            "absolutePath": str(candidate), "path": str(candidate), "bytes": cfg["bytes"], "sha256": cfg["sha256"],
            "gitPath": git_model.as_posix(), "triangles": cfg["triangles"], "drawPrimitives": cfg["drawPrimitives"],
            "jointCount": cfg["joints"], "textureCount": cfg["textures"], "nativeAnimationCount": 0, "proceduralAnimationCount": 0,
            "componentReady": True, "converted": True, "structuralValidationPassed": True, "visualValidationPassed": True,
            "formalHeroAdoptionEligible": True, "runtimeReady": False, "runtimeSelectable": False,
            "runtimeDropdownRegistered": False, "defaultEligible": False, "automaticEligible": False, "fullHeroModel": False,
            "heroIds": [], "relatedHeroIds": [], "identityIds": ["ssbu-ptrainer"],
            "readiness": "accepted-independent-static-skinned-formal-decimation-actions-missing",
            "auditEvidence": f"{cfg['nameZh']} reduced to {cfg['triangles']} triangles; byte-identical rebuild, Khronos 0/0, GGD hard policy, rig/material/texture preservation and three-view Babylon A/B passed. Native actions remain 0.",
            "limitations": limitations, "deliveryEvidence": refs["delivery.json"], "acceptanceEvidence": refs["acceptance.json"],
            "validationEvidence": refs["validation.json"], "sourceFidelityEvidence": refs["preservation.json"],
            "visualEvidence": refs["visual-comparison.json"], "sourceRebuildEvidence": refs["source-rebuild.json"],
            "backupStatus": "new-decimation-stage-pending-s3", "s3BackupStatus": "pending-not-uploaded",
            "s3Uri": None, "s3ManifestUri": None, "backupReceiptPath": None,
            "sourceConversionBackup": source_backup,
        })
        previous = [row for row in component_rows if row.get("id") == cfg["componentId"]]
        if previous: previous[0].clear(); previous[0].update(candidate_row)
        else: component_rows.append(candidate_row)
        attempt = {"id": cfg["componentId"], "componentId": cfg["componentId"], "status": candidate_row["readiness"],
            "localPath": str(stage), "outputPath": str(candidate), "outputSha256": cfg["sha256"],
            "nativeAnimationCount": 0, "runtimeReady": False, "runtimeSelectable": False,
            "backupStatus": "pending-not-uploaded", "formalHeroAdoptionEligible": True}
        old_attempt = [row for row in attempts if row.get("id") == cfg["componentId"]]
        if old_attempt: old_attempt[0].clear(); old_attempt[0].update(attempt)
        else: attempts.append(attempt)
        writes[repo / git_model] = candidate.read_bytes()
        for name, data in fixed.items(): writes[repo / evidence / name] = data
        delivered.append({"componentId": cfg["componentId"], "sha256": cfg["sha256"], "triangles": cfg["triangles"], "runtimeSelectable": False})
    writes[downloads_path] = encode(downloads)
    writes[repo / EVIDENCE_ROOT / "batch.json"] = encode({
        "schema": "ggd-ssbu-ptrainer-formal-decimation-batch@1", "candidates": delivered,
        "summary": {"converted": 2, "formalGeometryEligible": 2, "nativeMotionCount": 0, "runtimeDropdownRegistered": 0, "s3NewStageUploaded": 0, "productionDeployed": 0},
    })
    return writes


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--asset-root", type=Path, required=True)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args(); repo, asset_root = args.repo.resolve(), args.asset_root.resolve()
    writes = build(repo, asset_root)
    if args.write:
        for path, data in writes.items(): path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(data)
    else:
        for path, data in writes.items(): require(path.is_file() and path.read_bytes() == data, f"stale output: {path}")
    print(json.dumps({"files": len(writes), "components": 2, "written": args.write}, ensure_ascii=False))


if __name__ == "__main__":
    main()
