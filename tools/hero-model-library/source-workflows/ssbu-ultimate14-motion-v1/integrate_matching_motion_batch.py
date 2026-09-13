#!/usr/bin/env python3
"""Freeze validated Chrom/Lucina Ultimate14 motion components into Git."""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path


REPO = Path(__file__).resolve().parents[4]
ASSETS = REPO.parent / "GGD-Asset-Library"
DOWNLOADS = REPO / "materials/hero-model-library/download-sources.json"
EVIDENCE = REPO / "materials/hero-model-library/priority-evidence/ssbu-ultimate14-chrom-lucina-motion-v1"
CONFIG = {
    "chrom": {"nameZh": "庫洛姆", "originalName": "Chrom", "clips": 9},
    "lucina": {"nameZh": "露琪娜", "originalName": "Lucina", "clips": 13},
}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def pin(path: Path) -> dict:
    return {"gitPath": str(path.relative_to(REPO)), "bytes": path.stat().st_size, "sha256": sha(path)}


def copy(source: Path, target: Path) -> dict:
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
    return pin(target)


def candidate(fighter: str) -> dict:
    config = CONFIG[fighter]
    local = ASSETS / f"conversions/ssbu-{fighter}-ultimate14-motion-v1"
    first = local / "optimized-v3-01"
    second = local / "optimized-v3-02"
    validation = json.loads((first / "motion-validation.json").read_text())
    validation2 = json.loads((second / "motion-validation.json").read_text())
    run = json.loads((local / "webgl-v1/run.json").read_text())
    proof = json.loads((local / "webgl-v1/proof.json").read_text())
    expected_images = config["clips"] * 3
    if validation["ggdInspection"]["budget"]["errors"] or validation2["ggdInspection"]["budget"]["errors"]:
        raise ValueError(f"{fighter} hard policy failed")
    if validation["glb"]["sha256"] != validation2["glb"]["sha256"] or (first / "body.glb").read_bytes() != (second / "body.glb").read_bytes():
        raise ValueError(f"{fighter} final GLB rebuild differs")
    if not run["complete"] or run["errorExists"] or run["images"] != expected_images or len(proof["samples"]) != expected_images:
        raise ValueError(f"{fighter} WebGL sampling incomplete")

    digest = validation["glb"]["sha256"]
    glb = copy(first / "body.glb", REPO / f"content/assets/models/community/{digest}.glb")
    root = EVIDENCE / fighter
    backup_path = ASSETS / f"backups/ssbu-{fighter}-ultimate14-motion-v1/latest-receipt.json"
    backup = json.loads(backup_path.read_text())
    if (backup.get("schema") != "ggd-intake-backup-receipt@1"
            or not all(backup.get(key) is True for key in ("fullGetVerified", "allMemberSha256Verified", "localUnchanged"))
            or backup.get("source") != str(local.resolve())
            or not backup.get("s3Uri", "").startswith(
                f"s3://ggd-390630837668-ap-east-2-an/legacy/conversion-stages/ssbu-{fighter}-ultimate14-motion-v1/"
            )):
        raise ValueError(f"{fighter} S3 conversion-stage backup is absent or invalid")
    backup_pin = copy(backup_path, root / "s3-backup-receipt.json")
    validation_pin = copy(first / "motion-validation.json", root / "validation.json")
    webgl_pin = copy(local / "webgl-v1/proof.json", root / "webgl-proof.json")
    run_pin = copy(local / "webgl-v1/run.json", root / "webgl-run.json")
    contact_pin = copy(local / "webgl-v1/contact-sheet.jpg", root / "contact-sheet.jpg")
    optimization_pin = copy(first / "optimization.json", root / "optimization.json")
    second_validation_pin = copy(second / "motion-validation.json", root / "rebuild-validation.json")
    rebuild = {
        "schema": "ggd-ssbu-ultimate14-matching-motion-rebuild@1",
        "componentId": f"ssbu-{fighter}-c00-ultimate14-motion-v1",
        "first": {"local": validation["glb"], "validation": validation_pin},
        "second": {"local": validation2["glb"], "validation": second_validation_pin},
        "finalGlbByteIdenticalRebuild": True,
        "outputSha256": digest,
        "toolPins": [
            {"gitPath": str(path.relative_to(REPO)), "sha256": sha(path)}
            for path in (
                REPO / "tools/hero-model-library/source-workflows/ssbu-ultimate14-motion-v1/import_nuanmb_actions.py",
                REPO / "tools/hero-model-library/source-workflows/ssbu-ultimate14-motion-v1/run_matching_motion_batch.py",
                REPO / "tools/hero-model-library/source-workflows/ssbu-ultimate14-motion-v1/optimize_matching_motion_component.py",
                REPO / "tools/hero-model-library/source-workflows/ssbu-ultimate14-motion-v1/validate_matching_motion_component.mts",
                REPO / "tools/hero-model-library/source-workflows/ssbu-ultimate14-motion-v1/render_motion_glb.py",
            )
        ],
    }
    (root / "source-rebuild.json").write_text(json.dumps(rebuild, ensure_ascii=False, indent=2) + "\n")
    rebuild_pin = pin(root / "source-rebuild.json")
    visual = {
        "schema": "ggd-ssbu-ultimate14-matching-motion-visual@1",
        "componentId": rebuild["componentId"],
        "webglSamples": expected_images,
        "contactSheet": contact_pin,
        "review": "All start/middle/end frames loaded with connected textured geometry and no black frame or missing body. Native root orientation varies by clip; semantic gameplay mapping and user action approval remain pending.",
        "visualPlaybackSampled": True,
        "fullGameplayVisualAcceptance": False,
    }
    (root / "visual-review.json").write_text(json.dumps(visual, ensure_ascii=False, indent=2) + "\n")
    visual_pin = pin(root / "visual-review.json")
    acceptance = {
        "schema": "ggd-animated-component-acceptance@1",
        "components": [{
            "id": rebuild["componentId"], "sha256": digest,
            "accepted": True, "scope": "independent-skinned-model-motion-component",
            "completeGameplayActionSet": False,
            "note": "Accepted as a structurally valid, WebGL-sampled independent component only; no semantic action binding, dropdown or deployment.",
        }],
    }
    (root / "acceptance.json").write_text(json.dumps(acceptance, ensure_ascii=False, indent=2) + "\n")
    acceptance_pin = pin(root / "acceptance.json")
    delivery = {
        "schema": "ggd-ssbu-ultimate14-matching-motion-delivery@1",
        "componentId": rebuild["componentId"], "fighterId": fighter,
        "model": glb, "validation": validation_pin, "optimization": optimization_pin,
        "webgl": {"proof": webgl_pin, "run": run_pin, "contactSheet": contact_pin},
        "sourceRebuild": rebuild_pin,
        "s3Backup": backup_pin,
        "s3BackupStatus": "full-get-and-all-member-sha256-verified",
        "runtimeSelectable": False, "deployed": False,
    }
    (root / "delivery.json").write_text(json.dumps(delivery, ensure_ascii=False, indent=2) + "\n")
    delivery_pin = pin(root / "delivery.json")
    inspect = validation["ggdInspection"]
    names = [row["name"] for row in inspect["clips"]]
    return {
        "id": rebuild["componentId"],
        "sourceId": "parallel-ns-ultimate14", "sourceIds": ["gitlab-ssbu-models", "parallel-ns-ultimate14"],
        "sourceClass": "community-mod", "selectionClass": "community-mod",
        "nameZh": config["nameZh"], "originalName": config["originalName"],
        "workZh": "任天堂明星大亂鬥 特別版（Ultimate14 社群 MOD）",
        "sourceGame": "Super Smash Bros. Ultimate", "sourceGameReleasedAt": "2018-12-07", "platform": "Nintendo Switch MOD",
        "nativeId": f"fighter/{fighter}/body/c00 + fighter/{fighter}/motion/body/c00", "variant": "c00",
        "resourceRole": "independent-skinned-model-motion-component",
        "assetKinds": ["model-component", "skeleton", "texture", "animation"],
        "absolutePath": str((first / "body.glb").resolve()), "path": str((first / "body.glb").resolve()),
        "bytes": glb["bytes"], "sha256": digest, "gitPath": glb["gitPath"],
        "componentReady": True, "converted": True, "structuralValidationPassed": True, "visualValidationPassed": True,
        "runtimeReady": False, "runtimeSelectable": False, "defaultEligible": False, "automaticEligible": False,
        "fullHeroModel": False, "runtimeDropdownRegistered": False, "heroIds": [], "relatedHeroIds": [],
        "identityIds": [f"ssbu-{fighter}"],
        "nativeAnimationCount": config["clips"], "proceduralAnimationCount": 0,
        "animationProvenance": "community-mod-native-not-original-game", "animationNames": names,
        "animationChannelCountPerClip": inspect["clips"][0]["channels"],
        "triangles": inspect["triangles"], "drawPrimitives": inspect["drawPrimitives"], "skinCount": inspect["skinCount"],
        "jointCount": inspect["jointCount"], "textureCount": inspect["textureCount"],
        "sourceAnimationCount": config["clips"], "unconvertedAnimationCount": 0,
        "readiness": f"accepted-independent-native-motion-{config['clips']}-clips-incomplete-action-set",
        "auditEvidence": f"Matching {fighter} rig plus {config['clips']} pinned Ultimate14 Transform motions; byte-identical dual final GLB, Khronos 0/0, GGD hard errors 0 and {expected_images} WebGL samples completed.",
        "limitations": validation["limitations"] + [
            "Draw primitives and per-clip animation channels exceed warning thresholds and still require runtime load review.",
            "WebGL sampling found connected textured geometry; native root orientation varies and semantic action selection is unreviewed.",
        ],
        "deliveryEvidence": delivery_pin, "acceptanceEvidence": acceptance_pin,
        "validationEvidence": validation_pin, "visualEvidence": visual_pin,
        "webglProofEvidence": webgl_pin, "sourceRebuildEvidence": rebuild_pin,
        "s3Uri": backup["s3Uri"], "s3ManifestUri": backup["manifestUri"],
        "s3BackupEvidence": backup_pin,
        "backupStatus": "full-get-and-all-member-sha256-verified",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    rows = [candidate(fighter) for fighter in CONFIG]
    data = json.loads(DOWNLOADS.read_text())
    source = next(row for row in data["publicSources"] if row["id"] == "parallel-ns-ultimate14")
    ids = {row["id"] for row in rows}
    source["componentCandidates"] = [row for row in source.get("componentCandidates", []) if row.get("id") not in ids] + rows
    encoded = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    if args.apply:
        DOWNLOADS.write_text(encoded)
    elif DOWNLOADS.read_text() != encoded:
        raise SystemExit("Matching-motion integration is stale; run with --apply")
    print(json.dumps({"components": [{"id": row["id"], "sha256": row["sha256"], "clips": row["nativeAnimationCount"]} for row in rows], "applied": args.apply}, ensure_ascii=False))


if __name__ == "__main__":
    main()
