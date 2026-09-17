#!/usr/bin/env python3
"""Register the validated Astralym 58-motion candidate as a non-default option."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[4]
WORKSPACE = ROOT.parent
LOCAL_RELATIVE = Path("GGD-Asset-Library/conversions/palworld-astralym-full58-decimation-v1/final/astralym-full58-256-decimated.glb")
LOCAL = WORKSPACE / LOCAL_RELATIVE
SHA256 = "d45146e882628fe8bbf635727ad272ff8f82238cf36b4d5f481dbbf0d9b45874"
BYTES = 17_043_436
MODEL_KEY = "community.body.d45146e882628fe8bbf635727ad272ff8f82238cf36b4d5f"
GIT_GLB = ROOT / f"content/assets/models/community/{SHA256}.glb"
MODEL_DOC = ROOT / f"content/models/{MODEL_KEY}.json"
FORGE = ROOT / "packages/shared/src/content/heroForge/communityAcquired.ts"
SUPPLEMENTAL = ROOT / "materials/hero-model-library/design-backlog/sources-supplemental.json"
EVIDENCE = ROOT / "materials/hero-model-library/priority-evidence/palworld-astralym-full58-decimation-v1"
VALIDATION = EVIDENCE / "validation.json"
GENERATION = EVIDENCE / "generation.json"
RECEIPT = EVIDENCE / "registration.json"
S3_RECEIPT = EVIDENCE / "s3-backup-receipt.json"
S3_MANIFEST = EVIDENCE / "s3-backup-manifest.json"
CLIP_MAP = {"idle": "Idle", "run": "Walk", "attack": "FarSkill_Action", "cast": "HaloBeam_Loop", "hurt": "Damage", "death": "Damage"}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def pin(path: Path) -> dict:
    return {"gitPath": path.relative_to(ROOT).as_posix(), "bytes": path.stat().st_size, "sha256": sha(path)}


def model_document() -> str:
    value = {
        "id": MODEL_KEY,
        "schema": "model@1",
        "glbPath": f"assets/models/community/{SHA256}.glb",
        "scale": 1,
        "collisionRadius": 0.6,
        "clipMap": CLIP_MAP,
        "yawOffsetDeg": 0,
        "heroBody": True,
    }
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def resolve_local_candidate(workspace: Path | None = None) -> Path:
    """Resolve the retained conversion without tying checks to one checkout parent.

    Normal workspace checkouts keep ``GGD-Asset-Library`` beside the Git repo.
    Isolated worktrees do not, so read-only reproduction may fall back to the
    already pinned absolute path.  Write mode can pass ``--workspace`` and
    still verifies the exact bytes before copying anything into Git.
    """
    local = (workspace or WORKSPACE) / LOCAL_RELATIVE
    if workspace is not None or not RECEIPT.is_file():
        return local
    pinned = json.loads(RECEIPT.read_text()).get("localCandidate", {}).get("path")
    return Path(pinned) if pinned else local


def candidate(local: Path) -> dict:
    validation = json.loads(VALIDATION.read_text())
    backup = json.loads(S3_RECEIPT.read_text())
    backup_manifest = json.loads(S3_MANIFEST.read_text())
    if validation.get("schema") != "ggd-palworld-astralym-full58-validation@1":
        raise ValueError("unexpected validation schema")
    if validation["candidate"]["sha256"] != SHA256 or validation["candidate"]["bytes"] != BYTES:
        raise ValueError("validation does not pin the current candidate")
    if validation["budget"]["errors"] or validation["khronos"]["errors"] or validation["khronos"]["truncated"]:
        raise ValueError("candidate validation is not green")
    if validation["visual"]["humanReview"]["result"] != "accepted":
        raise ValueError("visual A/B is not accepted")
    if backup.get("schema") != "ggd-intake-backup-receipt@1" or any(
        backup.get(key) is not True for key in ("fullGetVerified", "allMemberSha256Verified", "localUnchanged")
    ):
        raise ValueError("conversion-stage S3 backup is not fully verified")
    if backup_manifest.get("schema") != "ggd-intake-backup-manifest@1" or backup_manifest["s3Uri"] != backup["s3Uri"]:
        raise ValueError("conversion-stage S3 manifest does not match receipt")
    if backup_manifest["archiveSha256"] != backup["archiveSha256"] or backup_manifest["archiveBytes"] != backup["archiveBytes"]:
        raise ValueError("conversion-stage archive pin differs")
    archived_candidate = next(item for item in backup_manifest["files"] if item["path"] == "final/astralym-full58-256-decimated.glb")
    if archived_candidate["sha256"] != SHA256 or archived_candidate["bytes"] != BYTES:
        raise ValueError("conversion-stage archive does not contain the final candidate")
    return {
        "id": "opgg-palworld-astralym-2026081102.full58-256-decimated-v1",
        "candidateId": "opgg-palworld-astralym-2026081102.full58-256-decimated-v1",
        "label": "枯星龍／7,896面／256px／完整58動作",
        "character": "枯星龍",
        "library": "public-community",
        "path": str(local),
        "bytes": BYTES,
        "sha256": SHA256,
        "format": "glb",
        "readiness": "validated-registered-non-default-hero-forge-option-production-unverified",
        "existsLocal": True,
        "resourceRole": "character-body",
        "sourceId": "opgg-palworld-astralym-2026081102",
        "sourceUrl": "https://op.gg/zh-tw/palworld/pals/astralym",
        "sourceWork": "幻獸帕魯／Palworld",
        "heroIds": ["acquired-astralym"],
        "relatedHeroIds": ["acquired-astralym"],
        "defaultEligible": False,
        "automaticEligible": False,
        "componentReady": True,
        "runtimeSelectable": True,
        "runtimeDropdownRegistered": True,
        "runtimeModelKey": MODEL_KEY,
        "modelDocumentGitPath": MODEL_DOC.relative_to(ROOT).as_posix(),
        "gitPath": GIT_GLB.relative_to(ROOT).as_posix(),
        "triangles": 7896,
        "drawPrimitives": 3,
        "boneCount": 145,
        "textureCount": 9,
        "maxTextureEdge": 256,
        "nativeAnimationCount": 57,
        "animationClipCount": 58,
        "uniqueAnimationContentCount": 58,
        "staticPoseClipCount": 1,
        "animationScope": "complete-source-animation-library",
        "animationNames": [row["name"] for row in validation["measured"]["clips"]],
        "proceduralAnimationCount": 0,
        "retargetedAnimationCount": 0,
        "sourceSamplePreservationVerified": True,
        "selectedClips": CLIP_MAP,
        "fallbacks": [{
            "state": "death", "clip": "Damage",
            "reason": "No native Death clip; owner-authorized Damage plus ascend/fade presentation, not a generated animation.",
        }],
        "backupArchiveId": "conversion-palworld-astralym-materials-20260911",
        "s3ArchiveUri": "s3://ggd-390630837668-ap-east-2-an/legacy/character-models/palworld-astralym-materials-20260911/f3a1f8634533270c7167812853a17a9f6bb93103fae15393c05f2e63a86d1dd1.tar.gz",
        "s3ArchiveMember": "palworld-astralym-materials-20260911/astralym-material-bound.glb",
        "conversionStageBackupStatus": "full-download-and-all-member-sha256-verified",
        "conversionStageBackup": {
            "s3Uri": backup["s3Uri"],
            "manifestUri": backup["manifestUri"],
            "archiveSha256": backup["archiveSha256"],
            "archiveBytes": backup["archiveBytes"],
            "fileCount": backup["fileCount"],
            "fullGetVerified": True,
            "allMemberSha256Verified": True,
            "localUnchanged": True,
            "receipt": pin(S3_RECEIPT),
            "manifest": pin(S3_MANIFEST),
            "candidateArchiveMember": "final/astralym-full58-256-decimated.glb",
        },
        "validationEvidence": pin(VALIDATION),
        "generationEvidence": pin(GENERATION),
        "visualEvidence": pin(EVIDENCE / "visual-comparison.json"),
        "limitations": [
            "58 clips are preserved, but HaloCutter_Loop_Ring is a fixed pose; 57 clips contain changing samples.",
            "Each clip has 435 channels: above the live 300 warning and below the 500 hard limit.",
            "No native Death clip is claimed; Damage plus ascend/fade remains a declared fallback.",
            "Representative five-clip, three-view A/B passed the 5% contract; low-poly faceting remains visible.",
            "Original Palworld standalone VFX, skill-specific SFX and production deployment remain unverified.",
            "The conversion stage is archived in S3 legacy with full download and every member SHA-256 verified; this does not prove production deployment.",
        ],
        "ggdValidationEvidence": VALIDATION.relative_to(ROOT).as_posix(),
    }


def update_forge(value: str) -> str:
    pattern = re.compile(r'^(\s*"acquired-astralym":\s*\[)([^\]]*)(\],?\s*)$', re.MULTILINE)
    match = pattern.search(value)
    if not match:
        raise ValueError("acquired-astralym option row missing")
    options = re.findall(r'"([^"]+)"', match.group(2))
    if MODEL_KEY not in options:
        options.append(MODEL_KEY)
    replacement = match.group(1) + ", ".join(json.dumps(item) for item in options) + match.group(3)
    return value[:match.start()] + replacement + value[match.end():]


def build(write: bool, workspace: Path | None = None) -> dict:
    local = resolve_local_candidate(workspace)
    local_generation = Path(str(local) + ".generation.json")
    if not local.is_file() or local.stat().st_size != BYTES or sha(local) != SHA256:
        raise ValueError("local candidate is missing or changed")
    if not local_generation.is_file():
        raise ValueError("local generation receipt is missing")
    if write:
        EVIDENCE.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(local_generation, GENERATION)
    elif not GENERATION.is_file() or sha(GENERATION) != sha(local_generation):
        raise ValueError("Git generation receipt is missing or changed")
    row = candidate(local)
    supplemental = json.loads(SUPPLEMENTAL.read_text())
    identity = next(item for item in supplemental["characters"] if item["id"] == "community:palworld-astralym")
    models = [item for item in identity["modelCandidates"] if item["id"] != row["id"]]
    source_index = next(index for index, item in enumerate(models) if item["id"] == "opgg-palworld-astralym-2026081102.full58")
    models.insert(source_index + 1, row)
    identity["modelCandidates"] = models
    supplemental_value = json.dumps(supplemental, ensure_ascii=False, indent=2) + "\n"
    forge_value = update_forge(FORGE.read_text())
    model_value = model_document()
    if write:
        GIT_GLB.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(local, GIT_GLB)
        MODEL_DOC.write_text(model_value)
        FORGE.write_text(forge_value)
        SUPPLEMENTAL.write_text(supplemental_value)
    else:
        if not GIT_GLB.is_file() or GIT_GLB.stat().st_size != BYTES or sha(GIT_GLB) != SHA256:
            raise ValueError("Git candidate missing or changed")
        if MODEL_DOC.read_text() != model_value or FORGE.read_text() != forge_value or SUPPLEMENTAL.read_text() != supplemental_value:
            raise ValueError("Astralym registration is stale")
    receipt = {
        "schema": "ggd-palworld-astralym-full58-registration@1",
        "heroId": "acquired-astralym",
        "modelKey": MODEL_KEY,
        "isDefault": False,
        "modelDocument": {"gitPath": MODEL_DOC.relative_to(ROOT).as_posix(), "bytes": len(model_value.encode()), "sha256": hashlib.sha256(model_value.encode()).hexdigest()},
        "modelGlb": {"gitPath": GIT_GLB.relative_to(ROOT).as_posix(), "bytes": BYTES, "sha256": SHA256},
        "localCandidate": {"path": str(local), "bytes": BYTES, "sha256": SHA256},
        "measured": {"triangles": 7896, "drawPrimitives": 3, "maxTextureEdge": 256, "maxClipChannels": 435, "clipCount": 58},
        "semanticMap": CLIP_MAP,
        "nativeMotionLibraryPreserved": True,
        "defaultsChanged": 0,
        "productionDeploymentVerified": False,
        "conversionStageBackupStatus": row["conversionStageBackupStatus"],
        "conversionStageBackup": row["conversionStageBackup"],
        "validationEvidence": row["validationEvidence"],
        "generationEvidence": row["generationEvidence"],
        "visualEvidence": row["visualEvidence"],
    }
    encoded = json.dumps(receipt, ensure_ascii=False, indent=2) + "\n"
    if write:
        RECEIPT.write_text(encoded)
    elif RECEIPT.read_text() != encoded:
        raise ValueError("registration receipt is stale")
    return receipt


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--workspace", type=Path, help="ABxVFX_EDIT workspace containing GGD-Asset-Library")
    args = parser.parse_args()
    receipt = build(args.write, args.workspace)
    print(json.dumps({"modelKey": receipt["modelKey"], "modelGlb": receipt["modelGlb"], "isDefault": False}, ensure_ascii=False))


if __name__ == "__main__":
    main()
