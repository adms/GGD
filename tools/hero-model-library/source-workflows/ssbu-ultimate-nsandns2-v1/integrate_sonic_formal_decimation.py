#!/usr/bin/env python3
"""Freeze and register the accepted SSBU Sonic c00 formal decimation."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


COMPONENT_ID = "ssbu-sonic-c00-static-skinned-v2"
OUTPUT_SHA = "5961f6366ccf8d3ce9f6859bc9aa70a8a0f0be15518b54d42d436f8e77aacfd3"
EVIDENCE_ROOT = Path("materials/hero-model-library/priority-evidence/ssbu-sonic-c00-formal-decimation-v1")
EXPECTED_S3_PREFIX = "s3://ggd-390630837668-ap-east-2-an/legacy/conversion-stages/ssbu-sonic-c00-formal-decimation-v1/"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def encode(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


def pin(path: Path) -> dict:
    return {"absolutePath": str(path.resolve()), "bytes": path.stat().st_size, "sha256": sha(path)}


def ref(path: Path, data: bytes) -> dict:
    return {"gitPath": path.as_posix(), "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def require(value: bool, message: str) -> None:
    if not value:
        raise ValueError(message)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--asset-root", type=Path, required=True)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    repo, asset_root = args.repo.resolve(), args.asset_root.resolve()
    stage = asset_root / "conversions/ssbu-sonic-c00-formal-decimation-v1"
    output = stage / "candidate.glb"
    rebuild = stage / "candidate-rebuild.glb"
    require(sha(output) == OUTPUT_SHA and output.read_bytes() == rebuild.read_bytes(), "Accepted Sonic build changed")
    validation = json.loads((stage / "validation.json").read_text())
    visual = json.loads((stage / "visual-comparison.json").read_text())
    acceptance = json.loads((stage / "acceptance.json").read_text())
    alpha = json.loads((stage / "alpha-audit.json").read_text())
    inspect = validation["ggdInspection"]
    require(validation["khronosIssues"]["numErrors"] == validation["khronosIssues"]["numWarnings"] == 0,
            "Khronos validation is not clean")
    require(inspect["budget"]["errors"] == [], "GGD hard budget failed")
    require((inspect["triangles"], inspect["drawPrimitives"], inspect["skinCount"], inspect["joints"], inspect["textureCount"], inspect["clipCount"]) ==
            (7900, 5, 1, [115], 5, 0), "Sonic metrics changed")
    require(acceptance["accepted"] and visual["manualReview"] == "accepted-independent-static-skinned-component",
            "Visual acceptance missing")
    require(alpha["passed"] and alpha["opaqueTransparentBlockers"] == 0, "Alpha audit failed")

    backup_path = asset_root / "backups/ssbu-sonic-c00-formal-decimation-v1/latest-receipt.json"
    backup = json.loads(backup_path.read_text())
    require(backup["schema"] == "ggd-intake-backup-receipt@1", "Backup receipt schema changed")
    require(Path(backup["source"]).resolve() == stage.resolve(), "Backup source differs from stage")
    require(backup["s3Uri"].startswith(EXPECTED_S3_PREFIX), "Backup destination differs from authorized prefix")
    require(backup["fullGetVerified"] and backup["allMemberSha256Verified"] and backup["localUnchanged"],
            "Full S3 readback verification is missing")

    evidence = repo / EVIDENCE_ROOT
    git_model = repo / f"content/assets/models/community/{OUTPUT_SHA}.glb"
    source_render = stage / "render-source-v2"
    candidate_render = stage / "render-candidate-v2"
    evidence_files = {
        "conversion.json": (stage / "conversion.json").read_bytes(),
        "decimation.json": (stage / "decimation.json").read_bytes(),
        "validation.json": (stage / "validation.json").read_bytes(),
        "alpha-audit.json": (stage / "alpha-audit.json").read_bytes(),
        "reproducibility-detail.json": (stage / "reproducibility.json").read_bytes(),
        "acceptance-detail.json": (stage / "acceptance.json").read_bytes(),
        "visual-comparison.json": (stage / "visual-comparison.json").read_bytes(),
        "visual-ab-contact-sheet.png": (stage / "visual-ab-contact-sheet.png").read_bytes(),
        "source-front.png": (source_render / "front.png").read_bytes(),
        "source-back.png": (source_render / "back.png").read_bytes(),
        "source-isometric.png": (source_render / "isometric.png").read_bytes(),
        "candidate-front.png": (candidate_render / "front.png").read_bytes(),
        "candidate-back.png": (candidate_render / "back.png").read_bytes(),
        "candidate-isometric.png": (candidate_render / "isometric.png").read_bytes(),
        "s3-backup-receipt.json": backup_path.read_bytes(),
    }
    limitations = [
        "The source and candidate contain zero actions; idle, run, attack, cast, hurt and death remain missing.",
        "No GGD hero definition currently matches this exact Sonic identity, so no hero or backend dropdown binding was invented.",
        "Runtime switching and production deployment were not performed.",
        "Original-game shader parity remains limited to the source-connected Blender materials.",
    ]
    evidence_files["acceptance.json"] = encode({
        "schema": "ggd-worldblender-c00-component-acceptance@1",
        "components": [{"id": COMPONENT_ID, "sha256": OUTPUT_SHA, "accepted": True,
                        "scope": "independent-static-skinned-model-component",
                        "heroBound": False, "runtimeSelectable": False, "deploymentVerified": False}],
    })
    evidence_files["source-rebuild.json"] = encode({
        "schema": "ggd-worldblender-c00-source-rebuild@1", "componentId": COMPONENT_ID,
        "sourceSha256": json.loads((stage / "conversion.json").read_text())["input"]["sha256"],
        "outputSha256": OUTPUT_SHA, "firstBuild": pin(output), "secondBuild": pin(rebuild),
        "byteIdenticalRebuild": True, "bothStructuralValidationsPassed": True,
        "bothValidationsPassed": True,
    })
    delivery = {
        "schema": "ggd-ssbu-sonic-formal-decimation-delivery@1",
        "componentId": COMPONENT_ID,
        "label": "索尼克 SSBU Ultimate c00 正式減面版",
        "sourceId": "gitlab-ssbu-models",
        "character": {"nameZh": "索尼克", "originalName": "Sonic", "nativeId": "fighter/sonic/model/body/c00", "variant": "c00"},
        "input": pin(Path(json.loads((stage / "conversion.json").read_text())["input"]["path"])),
        "output": pin(output),
        "rebuild": pin(rebuild),
        "metrics": {"trianglesBefore": 8980, "trianglesAfter": 7900, "drawPrimitives": 5,
                    "skinCount": 1, "jointCount": 115, "textureCount": 5,
                    "nativeAnimationCount": 0, "proceduralAnimationCount": 0},
        "validation": {"khronosErrors": 0, "khronosWarnings": 0, "budgetErrors": 0,
                       "alphaBlockers": 0, "byteIdenticalRebuild": True,
                       "reviewedViews": ["front", "back", "isometric"],
                       "maximumChangedPixelPct": acceptance["maximumChangedPixelPct"]},
        "status": {"converted": True, "structurallyValidated": True,
                   "visuallyAcceptedIndependentComponent": True, "heroBound": False,
                   "runtimeSelectable": False, "deployed": False},
        "s3Backup": {"s3Uri": backup["s3Uri"], "manifestUri": backup["manifestUri"],
                     "archiveSha256": backup["archiveSha256"], "archiveBytes": backup["archiveBytes"],
                     "fileCount": backup["fileCount"], "fullGetVerified": True,
                     "allMemberSha256Verified": True, "localUnchanged": True},
        "limitations": limitations,
    }
    evidence_files["delivery.json"] = encode(delivery)
    refs = {name: ref(EVIDENCE_ROOT / name, data) for name, data in evidence_files.items()}
    candidate = {
        "id": COMPONENT_ID, "label": "索尼克 SSBU Ultimate c00 正式減面版",
        "conversionCandidateId": COMPONENT_ID, "sourceId": "gitlab-ssbu-models",
        "sourceClass": "original-game-extraction-community-repackage", "selectionClass": "canonical-game",
        "nameZh": "索尼克", "originalName": "Sonic", "workZh": "任天堂明星大亂鬥 特別版",
        "sourceGame": "Super Smash Bros. Ultimate", "sourceGameReleasedAt": "2018-12-07",
        "platform": "Nintendo Switch", "nativeId": "fighter/sonic/model/body/c00", "variant": "c00",
        "resourceRole": "independent-static-skinned-model-component",
        "assetKinds": ["model-component", "skeleton", "texture"],
        "absolutePath": str(output), "path": str(output), "bytes": output.stat().st_size, "sha256": OUTPUT_SHA,
        "gitPath": git_model.relative_to(repo).as_posix(), "componentReady": True, "converted": True,
        "structuralValidationPassed": True, "visualValidationPassed": True,
        "runtimeReady": False, "runtimeSelectable": False, "defaultEligible": False, "automaticEligible": False,
        "fullHeroModel": False, "runtimeDropdownRegistered": False, "heroIds": [], "relatedHeroIds": [],
        "identityIds": ["ssbu-sonic"], "nativeAnimationCount": 0, "proceduralAnimationCount": 0,
        "triangles": 7900, "drawPrimitives": 5, "skinCount": 1, "jointCount": 115, "textureCount": 5,
        "readiness": "accepted-independent-static-skinned-component-actions-missing",
        "auditEvidence": "Sonic c00 was reduced from 8,980 to 7,900 triangles; the byte-identical rebuild, Khronos, GGD budget, alpha audit and fixed-camera A/B review passed.",
        "limitations": limitations, "s3BackupStatus": "uploaded-and-readback-verified",
        "s3Uri": backup["s3Uri"], "s3ManifestUri": backup["manifestUri"],
        "deliveryEvidence": refs["delivery.json"], "validationEvidence": refs["validation.json"],
        "acceptanceEvidence": refs["acceptance.json"], "visualEvidence": refs["visual-comparison.json"],
        "sourceRebuildEvidence": refs["source-rebuild.json"], "alphaAuditEvidence": refs["alpha-audit.json"],
        "s3BackupEvidence": refs["s3-backup-receipt.json"],
    }
    evidence_files["candidate.json"] = encode(candidate)

    downloads_path = repo / "materials/hero-model-library/download-sources.json"
    downloads = json.loads(downloads_path.read_text())
    source_row = next(row for row in downloads["publicSources"] if row.get("id") == "gitlab-ssbu-models")
    candidates = source_row.setdefault("componentCandidates", [])
    matched = [row for row in candidates if row.get("id") == COMPONENT_ID]
    require(len(matched) <= 1, "Duplicate Sonic v2 candidate")
    if matched:
        matched[0].clear(); matched[0].update(candidate)
    else:
        candidates.append(candidate)
    attempt = {"id": "ssbu-sonic-c00-formal-decimation-v1", "componentId": COMPONENT_ID,
               "status": candidate["readiness"], "localPath": str(stage), "outputPath": str(output),
               "outputSha256": OUTPUT_SHA, "nativeAnimationCount": 0, "runtimeReady": False,
               "runtimeSelectable": False, "backupStatus": "s3-conversion-stage-full-readback-verified",
               "s3Uri": backup["s3Uri"], "backupReceiptGitPath": refs["s3-backup-receipt.json"]["gitPath"],
               "fullGetVerified": True, "allMemberSha256Verified": True}
    attempts = source_row.setdefault("conversionAttempts", [])
    old_attempt = [row for row in attempts if row.get("id") == attempt["id"]]
    if old_attempt:
        old_attempt[0].clear(); old_attempt[0].update(attempt)
    else:
        attempts.append(attempt)

    supplemental_path = repo / "materials/hero-model-library/design-backlog/sources-supplemental.json"
    supplemental = json.loads(supplemental_path.read_text())
    identity = next(row for row in supplemental["characters"] if row.get("id") == "community:ssbu-sonic-c00-standardized-v1")
    supplemental_candidate = {
        "id": COMPONENT_ID, "label": candidate["label"], "library": "community",
        "sourceId": "gitlab-ssbu-models", "path": str(output), "gitPath": candidate["gitPath"],
        "bytes": candidate["bytes"], "sha256": OUTPUT_SHA, "format": "glTF Binary",
        "readiness": candidate["readiness"], "converted": True, "componentReady": True,
        "resourceRole": candidate["resourceRole"], "nativeAnimationCount": 0,
        "proceduralAnimationCount": 0, "runtimeSelectable": False, "defaultEligible": False,
        "validationEvidence": candidate["validationEvidence"], "visualEvidence": candidate["visualEvidence"],
        "s3BackupEvidence": candidate["s3BackupEvidence"], "alphaAuditEvidence": candidate["alphaAuditEvidence"],
        "s3Uri": candidate["s3Uri"], "limitations": limitations,
    }
    model_candidates = identity.setdefault("modelCandidates", [])
    old = [row for row in model_candidates if row.get("id") == COMPONENT_ID]
    if old:
        old[0].clear(); old[0].update(supplemental_candidate)
    else:
        model_candidates.append(supplemental_candidate)
    identity["evidence"] = list(dict.fromkeys([*identity.get("evidence", []), candidate["auditEvidence"]]))

    writes = {downloads_path: encode(downloads), supplemental_path: encode(supplemental),
              git_model: output.read_bytes(), **{evidence / name: data for name, data in evidence_files.items()}}
    if args.write:
        for path, data in writes.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
    else:
        for path, data in writes.items():
            require(path.is_file() and path.read_bytes() == data, "Stale frozen output: " + str(path))
    print(json.dumps({"componentId": COMPONENT_ID, "sha256": OUTPUT_SHA, "triangles": 7900,
                      "files": len(writes), "runtimeSelectable": False, "written": args.write}, ensure_ascii=False))


if __name__ == "__main__":
    main()
