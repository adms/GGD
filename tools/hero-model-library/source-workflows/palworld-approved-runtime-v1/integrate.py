#!/usr/bin/env python3
"""Freeze owner-approved Palworld cries and verify the already-live motion mappings.

This workflow deliberately keeps two facts separate:

* the six model ``clipMap`` states are already reachable through the three Hero
  Forge model options, so those eighteen semantic motion rows can be marked as
  locally runtime-selectable after their bytes and mappings are checked;
* GGD has no per-Hero-Forge-character combat-cry router.  The eighteen approved
  cry files are therefore copied into Git as accepted products with their
  approved event labels, but remain runtime-unbound.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
REVIEW = ROOT / "materials/hero-model-library/palworld/review/palworld-av-review.json"
OWNER = ROOT / "materials/hero-model-library/review/asset-review-portal-v1/owner-decisions.json"
PORTAL_QUEUE = ROOT / "materials/hero-model-library/review/asset-review-portal-v1/review-queue.json"
OPTIONS = ROOT / "packages/shared/src/content/heroForge/communityAcquired.ts"
OUTPUT = ROOT / "materials/hero-model-library/priority-evidence/palworld-approved-runtime-v1"
MANIFEST = OUTPUT / "approved-components.json"
RECEIPT = OUTPUT / "receipt.json"


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def evidence(path: Path, *, git: bool = True) -> dict:
    row = {"bytes": path.stat().st_size, "sha256": sha256(path)}
    row["gitPath" if git else "absolutePath"] = (
        path.relative_to(ROOT).as_posix() if git else str(path.resolve())
    )
    return row


def glb_animation_names(path: Path) -> set[str]:
    raw = path.read_bytes()
    magic, version, length = struct.unpack_from("<III", raw, 0)
    if magic != 0x46546C67 or version != 2 or length != len(raw):
        raise ValueError(f"invalid GLB: {path}")
    json_length, json_type = struct.unpack_from("<II", raw, 12)
    if json_type != 0x4E4F534A:
        raise ValueError(f"missing GLB JSON chunk: {path}")
    doc = json.loads(raw[20 : 20 + json_length].rstrip(b" \0"))
    return {row.get("name", "") for row in doc.get("animations", [])}


def media_extension(path: Path) -> str:
    head = path.read_bytes()[:12]
    if head.startswith(b"RIFF") and head[8:12] == b"WAVE":
        return ".wav"
    if head.startswith(b"ID3") or (len(head) >= 2 and head[0] == 0xFF and head[1] & 0xE0 == 0xE0):
        return ".mp3"
    raise ValueError(f"unsupported approved audio container: {path}")


def expected_products() -> tuple[dict, dict, list[tuple[Path, Path]]]:
    review = read_json(REVIEW)
    owner = read_json(OWNER)
    portal_queue = read_json(PORTAL_QUEUE)
    if review.get("schema") != "ggd.palworld-av-review@1":
        raise ValueError("unexpected Palworld review schema")
    if owner.get("schema") != "ggd.asset-review-decisions@1":
        raise ValueError("unexpected owner-decision schema")
    if owner.get("reviewer") != "owner" or not owner.get("reviewedAt"):
        raise ValueError("owner approval evidence is incomplete")
    if owner.get("sourceFingerprint") != portal_queue.get("sourceFingerprint"):
        raise ValueError("owner approval receipt does not match the current portal queue")

    decisions = {
        row["candidateId"].removeprefix("palworld:"): row
        for row in owner.get("decisions", [])
        if row.get("candidateId", "").startswith("palworld:")
    }
    expected_ids = {
        row["candidateId"] for row in review["audioCandidates"] + review["motionCandidates"]
    }
    if set(decisions) != expected_ids:
        raise ValueError("owner receipt does not cover exactly the 36 Palworld candidates")
    if any(row.get("decision") != "approve" for row in decisions.values()):
        raise ValueError("not every Palworld candidate is owner-approved")

    option_source = OPTIONS.read_text(encoding="utf-8")
    audio_rows = []
    motion_rows = []
    copies: list[tuple[Path, Path]] = []
    generic_binding_count = 0
    skill_overlay_count = 0

    for source in review["audioCandidates"]:
        decision = decisions[source["candidateId"]]
        if decision.get("approvedBindings") != source["suggestedGenericEvents"]:
            raise ValueError(f"approved cry binding drift: {source['candidateId']}")
        original = Path(source["file"]["path"])
        if not original.is_file() or original.stat().st_size != source["file"]["bytes"] or sha256(original) != source["file"]["sha256"]:
            raise ValueError(f"approved cry source changed: {source['candidateId']}")
        extension = media_extension(original)
        target = OUTPUT / "audio" / source["characterId"] / (
            f"{source['sourceLabel'].lower()}-{source['file']['sha256'][:12]}{extension}"
        )
        copies.append((original, target))
        audio_rows.append({
            "candidateId": source["candidateId"],
            "heroId": source["heroId"],
            "characterId": source["characterId"],
            "sourceLabel": source["sourceLabel"],
            "category": "nonverbal-creature-cry",
            "language": "not-applicable-nonverbal",
            "speakerVerified": False,
            "eventMeaningConfidence": "owner-approved-source-emotion-label; no original Wwise event map",
            "approvedBindings": decision["approvedBindings"],
            "ownerApproved": True,
            "source": evidence(original, git=False),
            "gitProduct": {
                "gitPath": target.relative_to(ROOT).as_posix(),
                "bytes": original.stat().st_size,
                "sha256": sha256(original),
                "container": extension[1:],
            },
            "runtimeBindingCreated": False,
            "runtimeSelectable": False,
            "runtimeBlocker": "No per-Hero-Forge-character combat-cry event router exists in the current runtime.",
        })

    for source in review["motionCandidates"]:
        decision = decisions[source["candidateId"]]
        allowed = source["suggestedSkillSlots"] or ["generic-" + source["semanticState"]]
        if decision.get("approvedBindings") != allowed:
            raise ValueError(f"approved motion binding drift: {source['candidateId']}")
        model_doc_path = ROOT / source["modelDocument"]["path"]
        model_doc = read_json(model_doc_path)
        if model_doc["id"] != source["modelKey"]:
            raise ValueError(f"model key drift: {source['candidateId']}")
        if model_doc["clipMap"].get(source["semanticState"]) != source["nativeClip"]:
            raise ValueError(f"clipMap drift: {source['candidateId']}")
        glb_path = ROOT / "content" / model_doc["glbPath"]
        if source["nativeClip"] not in glb_animation_names(glb_path):
            raise ValueError(f"native clip absent from GLB: {source['candidateId']}")
        if f'"{source["heroId"]}":' not in option_source or source["modelKey"] not in option_source:
            raise ValueError(f"Hero Forge dropdown option missing: {source['candidateId']}")
        generic = all(binding.startswith("generic-") for binding in allowed)
        generic_binding_count += int(generic)
        skill_overlay_count += int(not generic)
        motion_rows.append({
            "candidateId": source["candidateId"],
            "heroId": source["heroId"],
            "characterId": source["characterId"],
            "semanticState": source["semanticState"],
            "nativeClip": source["nativeClip"],
            "modelKey": source["modelKey"],
            "approvedBindings": decision["approvedBindings"],
            "ownerApproved": True,
            "modelDocument": evidence(model_doc_path),
            "modelGlb": evidence(glb_path),
            "activeInModelClipMap": True,
            "localHeroForgeDropdownRegistered": True,
            "runtimeSelectable": True,
            "runtimeBindingChanged": False,
            "approvedBindingReachable": generic,
            "bindingNote": (
                "The approved generic semantic binding is active through model@1.clipMap."
                if generic else
                "The semantic clip is active through model@1.clipMap; the approved per-skill overlay still needs a skill-to-motion router."
            ),
        })

    manifest = {
        "schema": "ggd.palworld-approved-components@1",
        "sourceReview": evidence(REVIEW),
        "sourcePortalQueue": evidence(PORTAL_QUEUE),
        "ownerDecisionReceipt": evidence(OWNER),
        "summary": {
            "characters": 3,
            "ownerApprovedCandidates": 36,
            "motionSemanticStatesRuntimeSelectable": 18,
            "approvedGenericMotionBindingsReachable": generic_binding_count,
            "approvedPerSkillMotionOverlaysPendingRouter": skill_overlay_count,
            "approvedCryProductsInGit": 18,
            "approvedCryRuntimeBindings": 0,
            "backendDropdownRegisteredHeroes": 3,
            "standaloneOriginalVfx": 0,
            "skillSpecificOriginalSfx": 0,
            "productionDeploymentVerifiedHeroes": 0,
        },
        "motions": motion_rows,
        "cries": audio_rows,
    }
    receipt = {
        "schema": "ggd.palworld-approved-runtime-integration-receipt@1",
        "status": "three-local-hero-forge-dropdowns-and-18-motion-states-verified; 18-approved-cries-git-preserved-runtime-unbound",
        "summary": manifest["summary"],
        "states": {
            "ownerApprovalApplied": True,
            "localHeroForgeAuthoringComplete": True,
            "backendDropdownRegistered": True,
            "modelMotionRuntimeSelectable": True,
            "approvedCryProductsGitPreserved": True,
            "approvedCryRuntimeBindingCreated": False,
            "sourceFaithfulAudiovisualComplete": False,
            "productionDeploymentVerified": False,
        },
        "manifest": {
            "gitPath": MANIFEST.relative_to(ROOT).as_posix(),
            "sha256": hashlib.sha256((json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode()).hexdigest(),
        },
        "remaining": [
            "Implement and validate a per-Hero-Forge-character combat-cry event router before enabling the 18 cry bindings.",
            "Implement the four approved per-skill motion overlays without changing the already-active generic clipMap states.",
            "Acquire and convert original standalone Palworld skill VFX and skill-specific SFX.",
            "Verify Main merge, service content version, backend switching, and production playback after deployment.",
        ],
    }
    return manifest, receipt, copies


def encoded(value: dict) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    manifest, receipt, copies = expected_products()
    products = {MANIFEST: encoded(manifest), RECEIPT: encoded(receipt)}
    if args.check:
        for source, target in copies:
            if not target.is_file() or target.read_bytes() != source.read_bytes():
                raise ValueError(f"approved Git audio product missing or changed: {target}")
        for path, value in products.items():
            if path.read_text(encoding="utf-8") != value:
                raise ValueError(f"stale generated Palworld integration product: {path}")
    else:
        for source, target in copies:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
        OUTPUT.mkdir(parents=True, exist_ok=True)
        for path, value in products.items():
            path.write_text(value, encoding="utf-8")
    print(json.dumps(receipt["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
