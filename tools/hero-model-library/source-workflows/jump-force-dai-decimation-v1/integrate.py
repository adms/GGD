#!/usr/bin/env python3
"""Record the blocked JUMP FORCE Dai decimation without promoting it."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
BASE = ROOT / "materials/hero-model-library"
EVIDENCE = BASE / "priority-evidence/jump-force-dai-decimation-v1"
DOWNLOADS = BASE / "download-sources.json"
SOURCE_ID = "steam-jump-force-priority-original-assets-build-8523149"
CANDIDATE_ID = "jump-force-native-dai-chr0430-decimated-256-v1"
EVIDENCE_NAMES = (
    "conversion.json", "validation.json", "draw-call-audit.json",
    "visual-comparison.json", "ab-contact-sheet.png", "worst-difference-overview.png",
    "s3-backup-receipt.json",
)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def pin(path: Path) -> dict:
    return {"gitPath": path.relative_to(ROOT).as_posix(), "bytes": path.stat().st_size, "sha256": sha(path)}


def build(current: dict) -> dict:
    conversion = json.loads((EVIDENCE / "conversion.json").read_text())
    validation = json.loads((EVIDENCE / "validation.json").read_text())
    draw = json.loads((EVIDENCE / "draw-call-audit.json").read_text())
    visual = json.loads((EVIDENCE / "visual-comparison.json").read_text())
    backup = json.loads((EVIDENCE / "s3-backup-receipt.json").read_text())
    if conversion.get("candidateId") != CANDIDATE_ID or conversion.get("sourceId") != SOURCE_ID:
        raise ValueError("unexpected conversion identity")
    if validation.get("candidateId") != CANDIDATE_ID or validation.get("candidate", {}).get("sha256") != conversion["output"]["sha256"]:
        raise ValueError("validation candidate pin mismatch")
    if draw.get("candidate", {}).get("sha256") != conversion["output"]["sha256"] or visual.get("candidate", {}).get("sha256") != conversion["output"]["sha256"]:
        raise ValueError("draw/visual candidate pin mismatch")
    if not conversion.get("byteIdenticalRebuild") or not validation.get("deterministicRebuild", {}).get("byteIdentical"):
        raise ValueError("deterministic rebuild evidence failed")
    if validation.get("khronos", {}).get("errors") != 0 or not validation.get("finiteFloatAccessors", {}).get("passed"):
        raise ValueError("structural validation failed")
    if validation.get("currentPolicy") != {
        "geometryAdoptionPassed": True,
        "textureEdgePassed": True,
        "drawCallPassed": False,
        "errors": ["繪製網格 20 超過英雄模型上限 6。"],
        "warnings": [],
    }:
        raise ValueError("unexpected current-policy result")
    if not visual.get("litPixelContractPassed") or visual.get("humanReview", {}).get("result") != "accepted":
        raise ValueError("visual evidence not accepted")
    if draw.get("decision", {}).get("safeCurrentAutomationCanReachSix") is not False:
        raise ValueError("draw-call audit must retain the hard blocker")
    if (backup.get("schema") != "ggd-intake-backup-receipt@1"
            or backup.get("profile") != "vibe-coding"
            or backup.get("region") != "ap-east-2"
            or "assumed-role/vibe-coding-s3-role/" not in backup.get("callerArn", "")
            or not backup.get("fullGetVerified")
            or not backup.get("allMemberSha256Verified")
            or not backup.get("localUnchanged")):
        raise ValueError("conversion-stage S3 backup receipt is absent or invalid")

    result = json.loads(json.dumps(current))
    matches = [row for row in result["publicSources"] if row.get("id") == SOURCE_ID]
    if len(matches) != 1:
        raise ValueError("JUMP FORCE Dai source record missing or ambiguous")
    source = matches[0]
    candidate = {
        "candidateId": CANDIDATE_ID,
        "sourceId": SOURCE_ID,
        "name": "小呆／達伊",
        "character": "小呆／達伊 / Dai",
        "originalName": "Dai",
        "nativeCharacterId": "chr0430",
        "heroIds": conversion["heroIds"],
        "sourceGame": "JUMP FORCE",
        "platform": "Windows (Steam); converted offline on macOS",
        "selectionClass": "canonical-game",
        "assetKinds": ["model", "texture", "skeleton"],
        "derivedFromCandidateId": "jump-force-native-dai-chr0430-review-v4",
        "absolutePath": conversion["output"]["absolutePath"],
        "bytes": conversion["output"]["bytes"],
        "sha256": conversion["output"]["sha256"],
        "sourceAbsolutePath": conversion["input"]["absolutePath"],
        "sourceBytes": conversion["input"]["bytes"],
        "sourceSha256": conversion["input"]["sha256"],
        "metrics": validation["metrics"]["after"],
        "converted": True,
        "structuralValidationPassed": True,
        "geometryAdoptionPassed": True,
        "textureEdgePassed": True,
        "visualValidationPassed": True,
        "litPixelContractMaxPct": visual["metric"]["litPixelContractMaxPct"],
        "maxLitClassificationXorPct": visual["maxLitClassificationXorPctAtLuma128"],
        "drawCallLimitPassed": False,
        "ggdHardPolicyPassed": False,
        "nativeAnimationCount": 0,
        "sixStateMotionComplete": False,
        "defaultEligible": False,
        "backendSelectable": False,
        "runtimeDropdownRegistered": False,
        "runtimeSelectable": False,
        "deployed": False,
        "readiness": "geometry-and-texture-validated; draw-call-hard-blocked; no-six-state-motion",
        "s3Backup": {
            "s3Uri": backup["s3Uri"],
            "manifestUri": backup["manifestUri"],
            "archiveSha256": backup["archiveSha256"],
            "archiveBytes": backup["archiveBytes"],
            "fileCount": backup["fileCount"],
            "fullGetVerified": True,
            "allMemberSha256Verified": True,
            "localUnchanged": True,
            "receipt": pin(EVIDENCE / "s3-backup-receipt.json"),
        },
        "evidence": {name: pin(EVIDENCE / name) for name in EVIDENCE_NAMES},
        "limitations": [
            "20 draw primitives exceed the current champion hard limit of 6; exact material semantics only collapse to 11 groups.",
            "The current single-channel atlas supports only 2 of 20 primitives; 16 carry secondary PBR textures, one MASK lens tiles outside [0,1], and one has no base texture.",
            "Khronos reports 0 errors, 24 IMAGE_FEATURES_UNSUPPORTED warnings from retained PNG metadata, and 10 informational unused tangent/object findings.",
            "No native animation clips are present; no GGD six-state action set is registered.",
            "Source-game parent shader parity and production runtime selection remain unverified.",
        ],
    }
    candidates = [row for row in source.get("modelCandidates", []) if row.get("candidateId") != CANDIDATE_ID]
    source["modelCandidates"] = candidates + [candidate]
    source["readiness"] = "complete-body-source-textures-webgl-accepted; formal-decimation-geometry-texture-validated-draw-motion-blocked"
    source["assetKindStates"]["model-package"] = "formal-decimation-7947-tri-256px-validated-draw20-motion0-blocked"
    source["gitEvidence"] = [row for row in source.get("gitEvidence", []) if row.get("gitPath") not in {pin(EVIDENCE / name)["gitPath"] for name in EVIDENCE_NAMES}]
    source["gitEvidence"].extend(pin(EVIDENCE / name) for name in EVIDENCE_NAMES)
    sentence = " Formal decimation candidate f8f3f1c… reduces 59,768 to 7,947 triangles and 2048px to 256px with rig/material semantics and fixed-view visual acceptance, but remains unused because 20 draw primitives exceed the hard limit 6 and it has zero motion clips."
    if sentence.strip() not in source.get("verification", ""):
        source["verification"] = source.get("verification", "").rstrip() + sentence
    additions = [
        "The formal 7,947-triangle candidate remains local-only and unused: 20 draw primitives exceed the current hard limit of 6.",
        "No safe current atlas operation can reduce 20 primitives to 6 without a source-specific multi-channel atlas and skinned-node merge; exact material states have a lower bound of 11.",
    ]
    source["limitations"] = list(dict.fromkeys([*source.get("limitations", []), *additions]))
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    expected = json.dumps(build(json.loads(DOWNLOADS.read_text())), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if DOWNLOADS.read_text() != expected:
            raise ValueError("download-sources.json is stale")
    else:
        DOWNLOADS.write_text(expected)
    print(json.dumps({"check": args.check, "sourceId": SOURCE_ID, "candidateId": CANDIDATE_ID}, ensure_ascii=False))


if __name__ == "__main__":
    main()
