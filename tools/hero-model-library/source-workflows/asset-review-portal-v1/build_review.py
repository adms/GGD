#!/usr/bin/env python3
"""Build one owner-facing queue for pending audio, motion and visual review."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[4]
LIBRARY = ROOT / "materials/hero-model-library"
POPP = LIBRARY / "priority-evidence/infinity-strash-popp-vfx-events-v1/event-audio-review-queue.json"
PALWORLD = LIBRARY / "palworld/review/palworld-av-review.json"
BORROWED = LIBRARY / "motion-review/borrowed-motion-review.json"
JUMPFORCE = LIBRARY / "source-inventories/jumpforce-assets-v2/listening-review-groups.json"
KOF_EFFECTS = LIBRARY / "source-inventories/kof-jump-container-coverage-v1/effect-mapping.json"
DAI_VFX = LIBRARY / "priority-evidence/infinity-strash-dai-vfx-components-v1/candidates.json"
DAI_VFX_REVIEW = LIBRARY / "priority-evidence/infinity-strash-dai-vfx-components-v1/review-candidates-v1/review-candidates.json"
POPP_VFX = LIBRARY / "priority-evidence/infinity-strash-popp-vfx-events-v1/runtime-candidates-v1/manifest.json"
POPP_VFX_RECIPES = LIBRARY / "priority-evidence/infinity-strash-popp-vfx-events-v1/vfx-reconstruction-candidates.json"
OUTPUT_DIR = LIBRARY / "review/asset-review-portal-v1"
OUTPUT_JSON = OUTPUT_DIR / "review-queue.json"
OUTPUT_SCHEMA = OUTPUT_DIR / "review-decision.schema.json"
OWNER_DECISIONS = OUTPUT_DIR / "owner-decisions.json"
OUTPUT_HTML = ROOT / "apps/client/public/asset-review-portal.html"
AUDIO_SUFFIXES = {".wav", ".ogg", ".mp3", ".flac", ".m4a"}


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def git_evidence(path: Path) -> dict[str, Any]:
    return {
        "gitPath": path.relative_to(ROOT).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def local_file(path: Path, expected: dict[str, Any] | None = None) -> dict[str, Any]:
    if not path.is_absolute() or not path.is_file():
        raise ValueError(f"review media is not an existing absolute file: {path}")
    record = {"absolutePath": str(path), "bytes": path.stat().st_size, "sha256": sha256(path)}
    if expected:
        expected_bytes = expected.get("bytes", record["bytes"])
        expected_sha = expected.get("sha256", record["sha256"])
        if record["bytes"] != expected_bytes or record["sha256"] != expected_sha:
            raise ValueError(f"review media changed: {path}")
    return record


def git_file(path: Path, expected: dict[str, Any] | None = None) -> dict[str, Any]:
    record = local_file(path, expected)
    record["gitPath"] = path.relative_to(ROOT).as_posix()
    return record


def preview_file(candidate_id: str, index: int, record: dict[str, Any]) -> dict[str, Any]:
    return {"mediaId": f"{candidate_id}:preview-{index + 1}", **record}


def apply_owner_decisions(contract: dict[str, Any], receipt: dict[str, Any]) -> None:
    """Apply a fingerprint-pinned owner receipt without changing runtime state."""
    if receipt.get("schema") != "ggd.asset-review-decisions@1":
        raise ValueError("unexpected asset-review owner-decision schema")
    if receipt.get("sourceFingerprint") != contract["sourceFingerprint"]:
        raise ValueError("asset-review owner-decision fingerprint is stale")
    if receipt.get("reviewer") != "owner" or not receipt.get("reviewedAt"):
        raise ValueError("asset-review owner-decision reviewer evidence is incomplete")
    if receipt.get("runtimeMutationAllowed") is not False:
        raise ValueError("owner approval receipt must not authorize unchecked runtime mutation")

    rows = contract["audioCandidates"] + contract["motionCandidates"] + contract["visualCandidates"]
    by_id = {row["candidateId"]: row for row in rows}
    decisions = receipt.get("decisions")
    if not isinstance(decisions, list) or len(decisions) != len(rows):
        raise ValueError("asset-review owner-decision receipt does not cover the full queue")
    decision_by_id = {row.get("candidateId"): row for row in decisions}
    if len(decision_by_id) != len(decisions) or set(decision_by_id) != set(by_id):
        raise ValueError("asset-review owner-decision candidate set is incomplete or duplicated")

    needs_binding = {"event-binding-proposal", "generic-event-suggestion", "motion-event-suggestion"}
    counts = {"pending": 0, "approve": 0, "reject": 0}
    for candidate_id, decision in decision_by_id.items():
        candidate = by_id[candidate_id]
        value = decision.get("decision")
        if value not in counts:
            raise ValueError(f"invalid owner decision for {candidate_id}: {value}")
        approved_bindings = decision.get("approvedBindings")
        if not isinstance(approved_bindings, list) or len(approved_bindings) != len(set(approved_bindings)):
            raise ValueError(f"invalid approvedBindings for {candidate_id}")
        if any(binding not in candidate.get("eventCandidates", []) for binding in approved_bindings):
            raise ValueError(f"owner decision names an unavailable binding for {candidate_id}")
        if value == "approve" and candidate["approvalScope"] in needs_binding and not approved_bindings:
            raise ValueError(f"approved binding proposal has no selected binding: {candidate_id}")
        if (value != "approve" or candidate["approvalScope"] not in needs_binding) and approved_bindings:
            raise ValueError(f"owner decision carries bindings outside its approval scope: {candidate_id}")
        if decision.get("runtimeBindingAuthorized") is not False:
            raise ValueError(f"owner decision overclaims runtime authority: {candidate_id}")
        if not isinstance(decision.get("note"), str):
            raise ValueError(f"owner decision note is missing: {candidate_id}")
        candidate["decision"] = value
        candidate["approvedBindings"] = approved_bindings
        candidate["ownerApprovalStatus"] = (
            "approved-awaiting-technical-integration" if value == "approve" else value
        )
        if "ownerDecision" in candidate:
            candidate["ownerDecision"] = value
        counts[value] += 1

    summary = contract["summary"]
    summary["pendingDecisionCount"] = counts["pending"]
    summary["approvedDecisionCount"] = counts["approve"]
    summary["rejectedDecisionCount"] = counts["reject"]
    summary["runtimeSelectableCandidateCount"] = sum(bool(row["runtimeSelectable"]) for row in rows)
    summary["approvedPendingTechnicalCount"] = sum(
        row["decision"] == "approve" and not row["runtimeSelectable"] for row in rows
    )
    contract["ownerDecisionReceipt"] = git_evidence(OWNER_DECISIONS)


def first_group_sample(directory: Path) -> Path:
    if not directory.is_absolute() or not directory.is_dir():
        raise ValueError(f"JUMP FORCE review group is unavailable: {directory}")
    candidates = sorted(
        (path for path in directory.rglob("*") if path.is_file() and path.suffix.lower() in AUDIO_SUFFIXES),
        key=lambda path: path.relative_to(directory).as_posix(),
    )
    if not candidates:
        raise ValueError(f"JUMP FORCE review group has no playable audio: {directory}")
    return candidates[0]


def popp_candidates(document: dict[str, Any]) -> list[dict[str, Any]]:
    if document.get("schema") != "ggd.popp-event-audio-review-queue@1":
        raise ValueError("unexpected Popp review schema")
    if document.get("automaticBindingAllowed") is not False or document.get("runtimeSelectable") is not False:
        raise ValueError("Popp queue overclaims runtime authority")
    rows = []
    for source in document["candidates"]:
        if source.get("reviewDecision") is not None or source.get("runtimeSelectable") is not False:
            raise ValueError(f"Popp candidate is not pending and unbound: {source.get('candidateId')}")
        file = local_file(Path(source["audio"]["absolutePath"]), source["audio"])
        rows.append({
            "candidateId": "popp:" + source["candidateId"],
            "sourceKind": "popp-event-audio",
            "sourceId": "steam-infinity-strash-popp-priority-audio-build-local-20240328",
            "heroId": document["heroId"],
            "characterNameZh": "何布／波普",
            "workZh": "Infinity Strash 勇者鬥惡龍 達伊的大冒險",
            "nativeCharacterId": "PN020",
            "category": source["sourceCategory"],
            "language": source["reportedLocales"],
            "languageConfidence": "source-locale-label-only",
            "speakerConfidence": "unverified",
            "eventMeaningConfidence": "unverified",
            "sourceLabel": source["sourceEventReference"],
            "eventCandidates": [source["sourceEventReference"]],
            "approvalScope": "event-binding-proposal",
            "file": file,
            "sourceEvidence": {
                "eventReference": source["sourceEventReference"],
                "resolvedEventPaths": source["resolvedEventPaths"],
                "mediaRef": source["mediaRef"],
                "durationSeconds": source["audio"]["durationSeconds"],
                "sampleRate": source["audio"]["sampleRate"],
                "channels": source["audio"]["channels"],
            },
            "gaps": ["speaker-unverified", "language-not-listening-verified", "event-meaning-unverified"],
            "decision": "pending",
            "runtimeSelectable": False,
            "runtimeBindingChanged": False,
        })
    return rows


def palworld_candidates(document: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    if document.get("schema") != "ggd.palworld-av-review@1":
        raise ValueError("unexpected Palworld review schema")
    if document["summary"].get("approvedCandidateCount") != 0 or document["summary"].get("runtimeSelectableCandidateCount") != 0:
        raise ValueError("Palworld queue overclaims approval or runtime authority")
    characters = {row["characterId"]: row for row in document["characters"]}
    audio = []
    for source in document["audioCandidates"]:
        character = characters[source["characterId"]]
        expected = {"bytes": source["file"]["bytes"], "sha256": source["file"]["sha256"]}
        file = local_file(Path(source["file"]["path"]), expected)
        audio.append({
            "candidateId": "palworld:" + source["candidateId"],
            "sourceKind": "palworld-creature-cry",
            "sourceId": "palworld-gamevault-public-character-media",
            "sourceUrl": source["sourceUrl"],
            "heroId": source["heroId"],
            "characterNameZh": character["nameZh"],
            "workZh": "幻獸帕魯／Palworld",
            "nativeCharacterId": character["nativeCharacterCode"],
            "category": [source["category"]],
            "language": [source["language"]],
            "languageConfidence": "not-applicable-nonverbal",
            "speakerConfidence": "unverified-character-attribution",
            "eventMeaningConfidence": "source-emotion-label-only",
            "sourceLabel": source["sourceLabel"],
            "eventCandidates": source["suggestedGenericEvents"],
            "approvalScope": "generic-event-suggestion",
            "file": file,
            "sourceEvidence": {"labelProvenance": source["sourceLabelProvenance"]},
            "gaps": ["no-original-wwise-event-map", "no-skill-specific-binding", "speaker-unverified"],
            "decision": "pending",
            "runtimeSelectable": False,
            "runtimeBindingChanged": False,
        })
    motions = []
    for source in document["motionCandidates"]:
        character = characters[source["characterId"]]
        event_candidates = source["suggestedSkillSlots"] or ["generic-" + source["semanticState"]]
        motions.append({
            "candidateId": "palworld:" + source["candidateId"],
            "sourceKind": "palworld-native-motion-semantic",
            "sourceId": "palworld-converted-source-component",
            "heroId": source["heroId"],
            "characterNameZh": character["nameZh"],
            "workZh": "幻獸帕魯／Palworld",
            "nativeCharacterId": character["nativeCharacterCode"],
            "motionKind": "native",
            "semanticState": source["semanticState"],
            "nativeClip": source["nativeClip"],
            "nativeClipDurationSeconds": source["nativeClipDurationSeconds"],
            "modelKey": source["modelKey"],
            "modelDocument": source["modelDocument"],
            "modelGlb": source["modelGlb"],
            "eventCandidates": event_candidates,
            "eventMeaningConfidence": "semantic-state-only-no-original-skill-event-map",
            "approvalScope": "motion-event-suggestion",
            "presentation": {"mode": "native-clip"},
            "gaps": ["skill-event-map-unavailable", "source-vfx-unavailable", "skill-sfx-unavailable"],
            "decision": "pending",
            "runtimeSelectable": False,
            "runtimeBindingChanged": False,
        })
    return audio, motions


def jumpforce_candidates(document: dict[str, Any]) -> list[dict[str, Any]]:
    if document.get("schema") != "ggd.jumpforce-audio-listening-review-groups@1":
        raise ValueError("unexpected JUMP FORCE review schema")
    if document["counts"].get("approvedForRuntimeBinding") != 0:
        raise ValueError("JUMP FORCE queue overclaims runtime approval")
    rows = []
    for source in document["groups"]:
        directory = Path(source["absolutePath"])
        sample = first_group_sample(directory)
        rows.append({
            "candidateId": "jumpforce:" + source["reviewId"],
            "sourceKind": "jumpforce-group-identity-sample",
            "sourceId": source["sourceId"],
            "heroId": None,
            "characterNameZh": source["characterGroupLabel"],
            "workZh": "JUMP FORCE／JUMP 大亂鬥",
            "nativeCharacterId": source.get("nativeCharacterId"),
            "category": sorted(source["categoryCounts"]),
            "language": ["unverified"],
            "languageConfidence": "unreviewed",
            "speakerConfidence": "group-identity-only",
            "eventMeaningConfidence": "none",
            "sourceLabel": sample.relative_to(directory).as_posix(),
            "eventCandidates": [],
            "approvalScope": "group-sample-classification-only",
            "file": local_file(sample),
            "sourceEvidence": {
                "groupId": source["groupId"],
                "groupAbsolutePath": str(directory),
                "groupFileCount": source["fileCount"],
                "categoryCounts": source["categoryCounts"],
                "identityEvidence": source["identityEvidence"],
                "identityVerifiedAtGroupLevel": source["identityVerifiedAtGroupLevel"],
                "sampleSelection": "lexicographically-first-playable-file; sample approval has no event-binding authority",
            },
            "gaps": ["per-file-speaker-unreviewed", "language-unreviewed", "event-binding-unreviewed", "group-not-expanded-to-event-pairs"],
            "decision": "pending",
            "runtimeSelectable": False,
            "runtimeBindingChanged": False,
        })
    return rows


def borrowed_candidates(document: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    if document.get("schema") != "ggd.borrowed-motion-review@1":
        raise ValueError("unexpected borrowed-motion review schema")
    resolved = document.get("resolvedCandidates", [])
    if document["summary"].get("pendingDecisionCount") != len(document["candidates"]):
        raise ValueError("borrowed-motion pending count disagrees with queue")
    if document["summary"].get("resolvedCandidateCount", 0) != len(resolved):
        raise ValueError("borrowed-motion resolved count disagrees with receipts")
    if document["summary"].get("runtimeBindingsChanged") != sum(bool(row.get("runtimeBindingChanged")) for row in resolved):
        raise ValueError("borrowed-motion runtime binding count disagrees with receipts")
    candidates = []
    for source in document["candidates"]:
        if source["review"].get("decision") is not None or source["review"].get("runtimeBindingChanged") is not False:
            raise ValueError(f"borrowed candidate is not pending and unbound: {source['id']}")
        candidates.append({
            "candidateId": "borrowed:" + source["id"],
            "sourceKind": "borrowed-or-death-substitution-motion",
            "sourceId": source["source"]["modelKey"],
            "heroId": source["target"]["heroId"],
            "characterNameZh": source["target"]["heroNameZh"],
            "workZh": source["target"]["workZh"],
            "nativeCharacterId": source["source"].get("nativeCharacterId"),
            "motionKind": source["motionKind"],
            "semanticState": "death" if source["deathSubstitutionMode"] != "none" else source["clip"]["state"],
            "nativeClip": source["clip"]["embeddedName"],
            "modelKey": source["target"]["modelKey"],
            "modelDocument": source["target"]["modelDocumentEvidence"],
            "eventCandidates": ["death"] if source["deathSubstitutionMode"] != "none" else [source["clip"]["state"]],
            "eventMeaningConfidence": "explicit-substitution-candidate",
            "approvalScope": "motion-event-suggestion",
            "presentation": source["presentation"],
            "skeletonCompatibility": source["skeletonCompatibility"],
            "validationEvidence": source["validationEvidence"],
            "gaps": source["blockers"],
            "decision": "pending",
            "runtimeSelectable": False,
            "runtimeBindingChanged": False,
        })
    blocked = []
    for source in document["blockedLeads"]:
        blocked.append({
            "candidateId": "borrowed-blocked:" + source["id"],
            "sourceKind": "blocked-motion-lead",
            "motionKind": source["motionKind"],
            "sourceCharacter": source["sourceHero"],
            "sourceModel": source["sourceModel"],
            "targetCharacter": source["targetHero"],
            "targetModel": source["targetModel"],
            "clips": source["clips"],
            "skeletonCompatibility": source["skeletonCompatibility"],
            "validationEvidence": source["validationEvidence"],
            "gaps": source["blockers"],
            "decisionAvailable": False,
            "runtimeSelectable": False,
        })
    return candidates, blocked


def candidate_slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def pending_visual(
    *,
    candidate_id: str,
    source_kind: str,
    source_id: str,
    character_name_zh: str,
    native_character_id: str,
    asset_kind: str,
    source_label: str,
    approval_scope: str,
    previews: list[dict[str, Any]],
    source_evidence: dict[str, Any],
    gaps: list[str],
    hero_id: str | None = None,
    work_zh: str,
) -> dict[str, Any]:
    if not previews:
        raise ValueError(f"visual candidate has no preview: {candidate_id}")
    return {
        "candidateId": candidate_id,
        "sourceKind": source_kind,
        "sourceId": source_id,
        "heroId": hero_id,
        "characterNameZh": character_name_zh,
        "workZh": work_zh,
        "nativeCharacterId": native_character_id,
        "assetKind": asset_kind,
        "sourceLabel": source_label,
        "eventCandidates": [],
        "approvalScope": approval_scope,
        "previewFiles": [preview_file(candidate_id, index, row) for index, row in enumerate(previews)],
        "sourceEvidence": source_evidence,
        "gaps": gaps,
        "decision": "pending",
        "ownerDecision": "pending",
        "runtimeSelectable": False,
        "runtimeBindingChanged": False,
        "runtimeMutationAllowed": False,
    }


def kof_visual_candidates(document: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    if document.get("schema") != "ggd.kof-xiv-eff-reference-mapping@1":
        raise ValueError("unexpected KOF XIV EFF mapping schema")
    summary = document["summary"]
    if (summary.get("sourceNativeEffectGroups") != 71
            or summary.get("ggdRuntimeVfxCandidates") != 0
            or summary.get("skillBindingsCreated") != 0
            or document["policy"].get("materialBlendTimingAttachmentValidated") is not False):
        raise ValueError("KOF XIV EFF mapping is stale or overclaims runtime readiness")
    manifest_record = document["textureConversionManifest"]
    manifest_path = Path(manifest_record["absolutePath"])
    manifest_evidence = local_file(manifest_path, manifest_record)
    manifest = read_json(manifest_path)
    if (manifest.get("summary", {}).get("convertedPngFiles") != 55
            or manifest.get("summary", {}).get("overTextureLimit") != 0
            or manifest.get("runtimeVfxDocuments") != 0
            or manifest.get("backendSelectable") is not False):
        raise ValueError("KOF XIV texture conversion manifest is stale or overclaims readiness")

    texture_rows = []
    texture_by_identity: dict[tuple[str, str], dict[str, Any]] = {}
    for source in manifest["files"]:
        native_id = source["nativeCharacterId"]
        source_label = Path(source["outputAbsolutePath"]).stem
        candidate_id = f"kofxiv-texture:{native_id.lower()}:{candidate_slug(source_label)}"
        image = local_file(Path(source["outputAbsolutePath"]), {
            "bytes": source["outputBytes"], "sha256": source["outputSha256"],
        })
        texture_by_identity[(native_id, source_label.lower())] = image
        texture_rows.append(pending_visual(
            candidate_id=candidate_id,
            source_kind="kofxiv-converted-effect-texture",
            source_id=document["sourceId"],
            hero_id=(source.get("heroIds") or [None])[0],
            character_name_zh=source["characterNameZh"],
            native_character_id=native_id,
            work_zh="THE KING OF FIGHTERS XIV",
            asset_kind="texture",
            source_label=source_label,
            approval_scope="texture-component-visual-review-only",
            previews=[image],
            source_evidence={
                "sourceDds": {
                    "absolutePath": source["sourceAbsolutePath"],
                    "bytes": source["sourceBytes"],
                    "sha256": source["sourceSha256"],
                    "format": source["sourceFormat"],
                },
                "outputFormat": source["outputFormat"],
                "conversionManifest": manifest_evidence,
                "readiness": source["readiness"],
            },
            gaps=["native-blend-mode-unverified", "native-timing-unverified", "skill-event-binding-unreviewed"],
        ))

    group_rows = []
    for native_id, character in document["characters"].items():
        sheet_path = LIBRARY / f"source-inventories/kof-jump-container-coverage-v1/effect-contact-sheets/{native_id}.png"
        sheet = git_file(sheet_path)
        for source in character["effectGroups"]:
            previews = []
            converted_names = []
            for reference in source["references"]:
                if reference["kind"] != "converted-effect-texture":
                    continue
                key = (native_id, reference["basename"].lower())
                image = texture_by_identity.get(key)
                if image is None:
                    raise ValueError(f"KOF group references unknown converted texture: {key}")
                if image["sha256"] not in {row["sha256"] for row in previews}:
                    previews.append(image)
                converted_names.append(reference["basename"])
            if not previews:
                previews = [sheet]
            dependency_counts: dict[str, int] = {}
            for reference in source["references"]:
                dependency_counts[reference["kind"]] = dependency_counts.get(reference["kind"], 0) + 1
            group_rows.append(pending_visual(
                candidate_id="kofxiv-eff:" + source["candidateId"].removeprefix("kofxiv-"),
                source_kind="kofxiv-native-eff-group",
                source_id=document["sourceId"],
                hero_id=(source.get("heroIds") or [None])[0],
                character_name_zh=source["characterNameZh"],
                native_character_id=native_id,
                work_zh="THE KING OF FIGHTERS XIV",
                asset_kind="native-effect-group",
                source_label=source["nativeEffectFile"],
                approval_scope="source-effect-group-reference-review-only",
                previews=previews,
                source_evidence={
                    "effectSource": source["effectSource"],
                    "convertedTextureNames": sorted(set(converted_names)),
                    "dependencyCounts": dependency_counts,
                    "componentLabels": source["componentLabels"],
                    "materialEvidence": source["materialEvidence"],
                    "blendEvidence": source["blendEvidence"],
                    "timingEvidence": source["timingEvidence"],
                    "attachmentEvidence": source["attachmentEvidence"],
                },
                gaps=["proprietary-eff-runtime-decoder-missing", "blend-timing-attachment-unverified", "skill-event-binding-unreviewed"],
            ))
    return texture_rows, group_rows


def dai_visual_candidates(document: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    if document.get("schema") != "ggd.infinity-strash-dai-vfx-component-candidates@1":
        raise ValueError("unexpected Dai VFX component schema")
    if (document["summary"].get("textureComponents") != 18
            or document["summary"].get("meshComponentsConverted") != 8
            or document["summary"].get("skillBindingsCreated") != 0):
        raise ValueError("Dai VFX component inventory is stale or overclaims runtime readiness")
    eligible_textures = [row for row in document["textureComponents"] if row.get("componentEligible")]
    if len(eligible_textures) != 18:
        raise ValueError("Dai VFX eligible texture count changed")
    texture_rows = []
    for source in eligible_textures:
        output = git_file(ROOT / source["gitPath"], source["output"])
        texture_rows.append(pending_visual(
            candidate_id="dai-vfx-texture:" + source["componentId"],
            source_kind="infinity-strash-dai-vfx-texture-component",
            source_id=document["sourceId"],
            hero_id=(document["character"].get("heroIds") or [None])[0],
            character_name_zh=document["character"]["nameZh"],
            native_character_id=document["character"]["nativeId"],
            work_zh="Infinity Strash 勇者鬥惡龍 達伊的大冒險",
            asset_kind="vfx-support-texture",
            source_label=source["reference"],
            approval_scope="support-component-visual-review-only",
            previews=[output],
            source_evidence={
                "componentId": source["componentId"],
                "classification": source["classification"],
                "source": source["source"],
                "output": output,
                "metrics": source["metrics"],
            },
            gaps=["niagara-timing-unrecovered", "material-dynamic-parameters-unrecovered", "skill-event-binding-unreviewed"],
        ))
    sheet = git_file(ROOT / "apps/client/public/infinity-strash-dai-vfx-components.png")
    mesh_rows = []
    for source in document["meshComponents"]:
        asset = git_file(ROOT / source["gitPath"], source["converted"])
        mesh_rows.append(pending_visual(
            candidate_id="dai-vfx-mesh:" + source["componentId"],
            source_kind="infinity-strash-dai-vfx-mesh-component",
            source_id=document["sourceId"],
            hero_id=(document["character"].get("heroIds") or [None])[0],
            character_name_zh=document["character"]["nameZh"],
            native_character_id=document["character"]["nativeId"],
            work_zh="Infinity Strash 勇者鬥惡龍 達伊的大冒險",
            asset_kind="vfx-support-mesh",
            source_label=source["reference"],
            approval_scope="support-component-visual-review-only",
            previews=[sheet],
            source_evidence={
                "componentId": source["componentId"],
                "source": source["source"],
                "converted": asset,
                "metrics": source["metrics"],
                "policyRole": source["policyRole"],
                "contactSheetContainsIndividualWireframe": True,
            },
            gaps=["niagara-timing-unrecovered", "material-dynamic-parameters-unrecovered", "skill-event-binding-unreviewed"],
        ))
    if len(mesh_rows) != 8:
        raise ValueError("Dai VFX mesh count changed")
    return texture_rows, mesh_rows


def dai_composite_visual_candidates(document: dict[str, Any]) -> list[dict[str, Any]]:
    if document.get("schema") != "ggd.infinity-strash-dai-vfx-review-candidates@1":
        raise ValueError("unexpected Dai VFX composite-review schema")
    summary = document.get("summary", {})
    boundary = document.get("boundary", {})
    if (summary.get("reviewCandidatesBuilt") != 6
            or summary.get("fixedPreviewFrames") != 18
            or summary.get("ownerApproved") != 0
            or summary.get("approvedBindings") != 0
            or summary.get("runtimeMutations") != 0
            or boundary.get("runtimeMutationAllowed") is not False
            or boundary.get("skillEventsAssigned") is not False
            or document.get("approvedBindings") != []):
        raise ValueError("Dai VFX composite-review inventory is stale or overclaims approval/runtime authority")
    rows = []
    for source in document["candidates"]:
        states = source.get("states", {})
        if (source.get("ownerDecision") != "pending"
                or source.get("approvedBindings") != []
                or states.get("visuallyApproved") is not False
                or states.get("runtimeBindingCreated") is not False
                or states.get("runtimeSelectable") is not False
                or states.get("productionDeployed") is not False):
            raise ValueError(f"Dai composite candidate is not pending and runtime inert: {source.get('candidateId')}")
        if [preview["time"] for preview in source["previewEvidence"]] != [0.0, 0.5, 1.0]:
            raise ValueError(f"Dai composite candidate does not have the fixed three-frame review set: {source['candidateId']}")
        previews = [git_file(ROOT / preview["gitPath"], preview) for preview in source["previewEvidence"]]
        row = pending_visual(
            candidate_id="dai-vfx-composite:" + source["candidateId"],
            source_kind="infinity-strash-dai-vfx-composite-review",
            source_id=document["sourceId"],
            hero_id=(source.get("heroIds") or [None])[0],
            character_name_zh="小呆／達伊",
            native_character_id=source["nativeCharacterId"],
            work_zh="Infinity Strash 勇者鬥惡龍 達伊的大冒險",
            asset_kind="authored-static-procedural-visual-composite",
            source_label=source["nativePackageStem"],
            approval_scope="composite-visual-review-only",
            previews=previews,
            source_evidence={
                "sourceCandidateId": source["candidateId"],
                "heroIds": source["heroIds"],
                "sourceRoot": source["sourceRoot"],
                "sourceComponents": source["sourceComponents"],
                "previewProfile": source["previewProfile"],
                "previewTimes": [preview["time"] for preview in source["previewEvidence"]],
                "states": states,
            },
            gaps=[
                "niagara-timing-unrecovered",
                "skill-event-binding-unreviewed",
                "skeleton-attachment-unreviewed",
                "original-effect-parity-unverified",
            ],
        )
        row["approvedBindings"] = []
        rows.append(row)
    if len(rows) != 6:
        raise ValueError("Dai VFX composite-review candidate count changed")
    return rows


def popp_visual_candidates(runtime: dict[str, Any], recipes: dict[str, Any]) -> list[dict[str, Any]]:
    if runtime.get("schema") != "ggd.infinity-strash-popp-vfx-runtime-candidates@1":
        raise ValueError("unexpected Popp VFX runtime-candidate schema")
    if (runtime["summary"].get("ggdVfxDocumentsBuilt") != 12
            or runtime["summary"].get("identityExcludedRoots") != 2
            or runtime["summary"].get("visuallyAccepted") != 0
            or runtime["summary"].get("skillBindingsCreated") != 0):
        raise ValueError("Popp VFX candidate inventory is stale or overclaims acceptance/binding")
    recipe_by_id = {row["candidateId"]: row for row in recipes["recipes"]}
    rows = []
    for source in runtime["candidates"]:
        recipe = recipe_by_id[source["candidateId"]]
        preview_path = POPP_VFX_RECIPES.parent / recipe["preview"]["path"]
        preview = git_file(preview_path, recipe["preview"])
        runtime_texture = git_file(ROOT / source["runtimeTexture"]["gitPath"], source["runtimeTexture"])
        vfx_document = git_file(ROOT / source["vfxDocument"]["gitPath"], source["vfxDocument"])
        rows.append(pending_visual(
            candidate_id="popp-vfx:" + source["candidateId"],
            source_kind="infinity-strash-popp-vfx-runtime-candidate",
            source_id=runtime["sourceId"],
            hero_id=runtime["heroId"],
            character_name_zh="何布／波普",
            native_character_id="PN020",
            work_zh="Infinity Strash 勇者鬥惡龍 達伊的大冒險",
            asset_kind="ggd-vfx-reconstruction-candidate",
            source_label=source["rootReference"],
            approval_scope="vfx-visual-acceptance-only",
            previews=[preview],
            source_evidence={
                "candidateId": source["candidateId"],
                "family": source["family"],
                "phase": source["phase"],
                "sourceTexture": source["sourceTexture"],
                "runtimeTexture": runtime_texture,
                "vfxDocument": vfx_document,
                "states": source["states"],
                "staticPreviewCounts": recipe["counts"],
            },
            gaps=["niagara-timing-unrecovered", "mesh-layers-unreconstructed", "skill-event-binding-unreviewed"],
        ))
    return rows


def build_contract() -> dict[str, Any]:
    source_paths = [POPP, PALWORLD, BORROWED, JUMPFORCE, KOF_EFFECTS, DAI_VFX, POPP_VFX, POPP_VFX_RECIPES, DAI_VFX_REVIEW]
    popp = read_json(POPP)
    palworld = read_json(PALWORLD)
    borrowed = read_json(BORROWED)
    jumpforce = read_json(JUMPFORCE)
    kof_effects = read_json(KOF_EFFECTS)
    dai_vfx = read_json(DAI_VFX)
    popp_vfx = read_json(POPP_VFX)
    popp_vfx_recipes = read_json(POPP_VFX_RECIPES)
    dai_vfx_review = read_json(DAI_VFX_REVIEW)
    pal_audio, pal_motion = palworld_candidates(palworld)
    borrowed_motion, blocked = borrowed_candidates(borrowed)
    kof_textures, kof_groups = kof_visual_candidates(kof_effects)
    dai_textures, dai_meshes = dai_visual_candidates(dai_vfx)
    popp_visual = popp_visual_candidates(popp_vfx, popp_vfx_recipes)
    dai_composite_visual = dai_composite_visual_candidates(dai_vfx_review)
    audio = popp_candidates(popp) + pal_audio + jumpforce_candidates(jumpforce)
    motions = pal_motion + borrowed_motion
    # Append new sources so the original 325 review rows retain their content and order.
    visuals = kof_textures + kof_groups + dai_textures + dai_meshes + popp_visual + dai_composite_visual
    candidate_ids = [row["candidateId"] for row in audio + motions + visuals]
    if len(candidate_ids) != len(set(candidate_ids)):
        raise ValueError("duplicate review candidate id")
    if any(row["decision"] != "pending" or row["runtimeSelectable"] or row["runtimeBindingChanged"] for row in audio + motions + visuals):
        raise ValueError("generated queue must remain pending and runtime inert")
    if any(row["ownerDecision"] != "pending" or row["runtimeMutationAllowed"] is not False for row in visuals):
        raise ValueError("visual review candidates must remain owner-pending and runtime inert")
    source_inputs = [git_evidence(path) for path in source_paths]
    fingerprint = hashlib.sha256(canonical_json({
        "inputs": source_inputs,
        "audio": [(row["candidateId"], row["file"]["sha256"]) for row in audio],
        "motion": [(row["candidateId"], row["modelKey"], row["nativeClip"]) for row in motions],
        "visual": [(row["candidateId"], [item["sha256"] for item in row["previewFiles"]]) for row in visuals],
        "blocked": [row["candidateId"] for row in blocked],
    }).encode()).hexdigest()
    contract = {
        "schema": "ggd.asset-review-portal@1",
        "sourceFingerprint": fingerprint,
        "sourceInputs": source_inputs,
        "policy": {
            "ownerApprovalRequiredBeforeRuntimeBinding": True,
            "defaultDecision": "pending",
            "currentOwnerDecision": "approve",
            "runtimeMutationAllowed": False,
            "ownerApprovalDoesNotBypassTechnicalGates": True,
            "jumpForceGroupSampleApprovalDoesNotAuthorizeEventBinding": True,
            "borrowedAndDeathSubstitutionMotionsRequirePerCandidateApproval": True,
            "visualApprovalDoesNotAuthorizeSkillOrRuntimeBinding": True,
            "resolvedReceiptCandidatesAreNotRequeued": True,
        },
        "summary": {
            "audioCandidateCount": len(audio),
            "poppEventAudioCandidateCount": len(popp["candidates"]),
            "palworldCreatureCryCandidateCount": len(pal_audio),
            "jumpForceGroupSampleCount": len(jumpforce["groups"]),
            "motionCandidateCount": len(motions),
            "palworldMotionCandidateCount": len(pal_motion),
            "borrowedOrDeathSubstitutionCandidateCount": len(borrowed_motion),
            "blockedMotionLeadCount": len(blocked),
            "visualCandidateCount": len(visuals),
            "kofXivTextureCandidateCount": len(kof_textures),
            "kofXivEffGroupCandidateCount": len(kof_groups),
            "daiVfxTextureComponentCount": len(dai_textures),
            "daiVfxMeshComponentCount": len(dai_meshes),
            "poppVfxCandidateCount": len(popp_visual),
            "daiVfxCompositeCandidateCount": len(dai_composite_visual),
            "visualPreviewFileCount": sum(len(row["previewFiles"]) for row in visuals),
            "pendingDecisionCount": len(audio) + len(motions) + len(visuals),
            "approvedDecisionCount": 0,
            "rejectedDecisionCount": 0,
            "runtimeBindingsChanged": 0,
            "productionDeployedAssets": 0,
        },
        "audioCandidates": audio,
        "motionCandidates": motions,
        "visualCandidates": visuals,
        "blockedMotionLeads": blocked,
    }
    if not OWNER_DECISIONS.is_file():
        raise ValueError("asset-review owner-decision receipt is missing")
    apply_owner_decisions(contract, read_json(OWNER_DECISIONS))
    return contract


def decision_schema(contract: dict[str, Any]) -> dict[str, Any]:
    ids = [row["candidateId"] for row in contract["audioCandidates"] + contract["motionCandidates"] + contract["visualCandidates"]]
    visual_ids = [row["candidateId"] for row in contract["visualCandidates"]]
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "https://ggd.local/schema/asset-review-decisions-v1.json",
        "title": "GGD asset review decisions",
        "type": "object",
        "additionalProperties": False,
        "required": ["schema", "sourceFingerprint", "reviewer", "reviewedAt", "runtimeMutationAllowed", "decisions"],
        "properties": {
            "schema": {"const": "ggd.asset-review-decisions@1"},
            "sourceFingerprint": {"const": contract["sourceFingerprint"]},
            "reviewer": {"type": "string", "minLength": 1},
            "reviewedAt": {"type": "string", "format": "date-time"},
            "runtimeMutationAllowed": {"const": False},
            "decisions": {
                "type": "array", "minItems": len(ids), "maxItems": len(ids),
                "items": {
                    "type": "object", "additionalProperties": False,
                    "required": ["candidateId", "decision", "approvedBindings", "note", "runtimeBindingAuthorized"],
                    "properties": {
                        "candidateId": {"enum": ids},
                        "decision": {"enum": ["pending", "approve", "reject"]},
                        "approvedBindings": {"type": "array", "items": {"type": "string"}, "uniqueItems": True},
                        "note": {"type": "string"},
                        "runtimeBindingAuthorized": {"const": False},
                    },
                    "allOf": [{
                        "if": {"properties": {"candidateId": {"enum": visual_ids}}, "required": ["candidateId"]},
                        "then": {"properties": {"approvedBindings": {"maxItems": 0}}},
                    }],
                },
            },
        },
    }


def safe_inline_json(value: Any) -> str:
    return canonical_json(value).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")


def build_html(contract: dict[str, Any]) -> str:
    data = safe_inline_json(contract)
    fingerprint = html.escape(contract["sourceFingerprint"])
    return f'''<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>GGD 素材逐項審查中心</title>
<style>
:root{{--bg:#071019;--card:#111d2a;--line:#294158;--fg:#eef6ff;--dim:#a9b8c6;--accent:#66d9ef;--warn:#ffc66d;--ok:#8bd49c;--bad:#ff8b8b}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--fg);font:14px/1.55 -apple-system,BlinkMacSystemFont,"Noto Sans TC",sans-serif}}header{{position:sticky;top:0;z-index:6;padding:12px 18px;background:#08131ef2;border-bottom:1px solid var(--line)}}main{{max-width:1440px;margin:auto;padding:18px}}h1{{font-size:20px;margin:0}}h2{{margin:28px 0 8px}}.dim{{color:var(--dim)}}.warn{{border:1px solid #8d692e;background:#2c2414;padding:10px 12px;border-radius:8px;color:#ffe2a6}}.toolbar{{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}}input,select,textarea,button,.button-link{{border:1px solid var(--line);background:#182a3b;color:var(--fg);padding:7px 9px;border-radius:7px}}input[type=search]{{min-width:300px}}button,.button-link{{cursor:pointer;text-decoration:none}}button:hover,.button-link:hover{{border-color:var(--accent)}}.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:12px}}.card{{border:1px solid var(--line);border-radius:10px;background:var(--card);padding:12px;min-width:0}}.card.approve{{border-color:var(--ok)}}.card.reject{{border-color:var(--bad)}}.card.pending{{border-color:#6f7f91}}audio{{width:100%}}code{{font-size:11px;word-break:break-all}}.tags{{display:flex;gap:5px;flex-wrap:wrap}}.tag{{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:2px 7px}}dl{{display:grid;grid-template-columns:105px 1fr;gap:3px 8px}}dt{{color:var(--dim)}}dd{{margin:0;min-width:0;word-break:break-word}}textarea{{width:100%;min-height:55px}}.buttons{{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}}.viewer{{position:relative;height:430px;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:#05080c}}iframe{{width:100%;height:100%;border:0}}.viewer-status{{position:absolute;inset:0;z-index:2;display:flex;align-items:center;justify-content:center;text-align:center;padding:20px;background:#071019e8;color:var(--dim)}}.viewer-status.error{{color:var(--bad);background:#210d10ee}}.viewer-status[hidden]{{display:none}}.visual-gallery{{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:6px;margin:8px 0}}.visual-gallery a{{display:block;background:#071019;border:1px solid var(--line);border-radius:7px;padding:4px}}.visual-gallery img{{display:block;width:100%;height:180px;object-fit:contain}}details{{margin-top:8px}}li{{margin:4px 0}}.hidden{{display:none!important}}.count{{font-variant-numeric:tabular-nums}}
</style></head><body><header><h1>GGD 素材逐項審查中心</h1><div class="dim">資料指紋 <code>{fingerprint}</code> · owner 決策由固定收據載入 · 核准不會跳過技術 gate 或自動修改 runtime</div></header>
<main><div class="warn">owner 已於 2026-09-15 核准本頁全部素材。KOF EFF、達伊支援元件、達伊六組靜態程序化組合預覽與波普靜態重建圖的核准只記錄視覺裁決；JUMP FORCE 抽樣核准只確認群組分類。全部項目仍須分別通過轉換、格式、效能、角色／事件綁定與 runtime 驗收，通過後才可切換；目前未證實正式站部署。</div>
<div class="toolbar"><input id="search" type="search" placeholder="搜尋角色、來源、事件、SHA"><select id="kind"><option value="">全部來源</option><option value="popp-event-audio">波普音訊</option><option value="palworld-creature-cry">帕魯叫聲</option><option value="palworld-native-motion-semantic">帕魯動作</option><option value="jumpforce-group-identity-sample">JUMP FORCE</option><option value="borrowed-or-death-substitution-motion">借用／死亡替代</option><option value="kofxiv-converted-effect-texture">KOF XIV 特效貼圖</option><option value="kofxiv-native-eff-group">KOF XIV EFF 群組</option><option value="infinity-strash-dai-vfx-texture-component">達伊特效貼圖</option><option value="infinity-strash-dai-vfx-mesh-component">達伊特效 mesh</option><option value="infinity-strash-dai-vfx-composite-review">達伊組合預覽</option><option value="infinity-strash-popp-vfx-runtime-candidate">波普 VFX 候選</option></select><select id="status"><option value="">全部裁決</option><option value="pending">pending</option><option value="approve">approve</option><option value="reject">reject</option></select><span id="visible" class="dim count"></span></div>
<h2>一、音效／語音 <span id="audioCount" class="dim count"></span></h2><div id="audio" class="grid"></div>
<h2>二、原生／借用／死亡替代動作 <span id="motionCount" class="dim count"></span></h2><div id="motion" class="grid"></div>
<h2>三、特效貼圖／EFF／支援元件 <span id="visualCount" class="dim count"></span></h2><div id="visual" class="grid"></div>
<h2>四、尚不可播放的動作線索</h2><div id="blocked" class="grid"></div>
<h2>五、匯出逐項裁決</h2><p id="decisionStatus" class="dim"></p><div class="toolbar"><input id="reviewer" value="owner" placeholder="審查者"><button id="export">下載 asset-review-decisions.json</button><button id="clear">清除本機草稿</button></div></main>
<script id="contract" type="application/json">{data}</script><script>
const D=JSON.parse(document.getElementById('contract').textContent);const storageKey='ggd.asset-review-portal:'+D.sourceFingerprint;let draft=JSON.parse(localStorage.getItem(storageKey)||'{{"decisions":{{}}}}');draft.decisions??={{}};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}}[c]));const all=[...D.audioCandidates,...D.motionCandidates,...D.visualCandidates];
const byId=Object.fromEntries(all.map(c=>[c.candidateId,c]));const state=id=>draft.decisions[id]??{{decision:byId[id]?.decision||'pending',approvedBindings:byId[id]?.approvedBindings||[],note:''}};function persist(){{localStorage.setItem(storageKey,JSON.stringify(draft));applyFilters();renderStatus()}}
function controls(c){{const s=state(c.candidateId),bindings=c.eventCandidates||[];return `<div class="buttons"><select data-decision="${{esc(c.candidateId)}}"><option value="pending" ${{s.decision==='pending'?'selected':''}}>pending</option><option value="approve" ${{s.decision==='approve'?'selected':''}}>approve</option><option value="reject" ${{s.decision==='reject'?'selected':''}}>reject</option></select></div><div class="buttons">${{bindings.map(b=>`<label><input type="checkbox" data-binding="${{esc(c.candidateId)}}" value="${{esc(b)}}" ${{s.approvedBindings.includes(b)?'checked':''}}> ${{esc(b)}}</label>`).join('')||'<span class="dim">沒有事件綁定候選</span>'}}</div><textarea data-note="${{esc(c.candidateId)}}" placeholder="此項備註">${{esc(s.note)}}</textarea>`}}
function evidence(c){{return `<dl><dt>來源</dt><dd>${{esc(c.sourceId)}}</dd><dt>作品／角色</dt><dd>${{esc(c.workZh)}} · ${{esc(c.characterNameZh)}} · ${{esc(c.heroId||'尚未對應 hero ID')}}</dd><dt>原生 ID</dt><dd>${{esc(c.nativeCharacterId||'待確認')}}</dd>${{c.file?`<dt>本機</dt><dd><code>${{esc(c.file.absolutePath)}}</code></dd><dt>SHA-256</dt><dd><code>${{esc(c.file.sha256)}}</code></dd>`:''}}</dl><details><summary>缺口與來源細節</summary><ul>${{(c.gaps||[]).map(x=>`<li>${{esc(x)}}</li>`).join('')}}</ul><pre><code>${{esc(JSON.stringify(c.sourceEvidence||c.validationEvidence||{{}},null,2))}}</code></pre></details>`}}
const audio=document.getElementById('audio');for(const c of D.audioCandidates){{const card=document.createElement('article');card.className='card '+state(c.candidateId).decision;card.dataset.candidate=c.candidateId;card.dataset.kind=c.sourceKind;card.dataset.search=JSON.stringify(c).toLowerCase();card.innerHTML=`<h3>${{esc(c.characterNameZh)}} · ${{esc(c.sourceLabel)}}</h3><div class="tags"><span class="tag">${{esc(c.sourceKind)}}</span><span class="tag">語言 ${{esc(c.languageConfidence)}}</span><span class="tag">說話者 ${{esc(c.speakerConfidence)}}</span><span class="tag">事件 ${{esc(c.eventMeaningConfidence)}}</span></div><audio controls preload="none" src="http://127.0.0.1:8767/media/${{encodeURIComponent(c.candidateId)}}"></audio>${{evidence(c)}}${{controls(c)}}`;audio.append(card)}}
function audition(c){{return `/champion-model-audition.html?hud=0&cam=combat&live=1&model=${{encodeURIComponent(c.modelKey)}}&champion=${{encodeURIComponent(c.heroId)}}&clip=${{encodeURIComponent(c.semanticState)}}`;}}
const motion=document.getElementById('motion');for(const c of D.motionCandidates){{const card=document.createElement('article');card.className='card '+state(c.candidateId).decision;card.dataset.candidate=c.candidateId;card.dataset.kind=c.sourceKind;card.dataset.search=JSON.stringify(c).toLowerCase();const url=audition(c);card.innerHTML=`<h3>${{esc(c.characterNameZh)}} · ${{esc(c.semanticState)}} → <code>${{esc(c.nativeClip)}}</code></h3><div class="tags"><span class="tag">${{esc(c.motionKind)}}</span><span class="tag">${{esc(c.presentation.mode)}}</span><span class="tag">事件 ${{esc(c.eventMeaningConfidence)}}</span></div><div class="viewer"><iframe loading="lazy" title="${{esc(c.characterNameZh)}} ${{esc(c.semanticState)}}"></iframe><div class="viewer-status">載入模型與動作中…</div></div><div class="buttons"><button data-play>重新播放</button>${{c.presentation.mode==='hurt-ascend-fade'?'<button data-rise>播放受傷＋升天淡出</button>':''}}<a class="button-link" href="${{url}}" target="_blank" rel="noopener">全頁查看</a></div>${{evidence(c)}}${{controls(c)}}`;const frame=card.querySelector('iframe'),viewer=card.querySelector('.viewer'),status=card.querySelector('.viewer-status');let generation=0,animation=null;const load=async(reload=false)=>{{const mine=++generation;animation?.cancel();status.hidden=false;status.classList.remove('error');status.textContent='載入模型與動作中…';if(reload||frame.getAttribute('src')!==url)frame.src=url;for(let i=0;i<450;i++){{if(mine!==generation)return false;try{{const child=frame.contentWindow;if(child?.__settled===true){{const p=child.__probe?.()||{{}};if(p.error||!(Number(p.triangles)>0))throw new Error(p.error||'畫面上沒有可見三角形');status.hidden=true;return true}}}}catch(e){{if(String(e).includes('cross-origin')){{status.textContent='請從 Vite 的 127.0.0.1:5173 開啟此頁，以檢查畫面。';status.classList.add('error');return false}}if(i>5){{status.textContent='載入失敗：'+e;status.classList.add('error');return false}}}}await new Promise(r=>setTimeout(r,100))}}status.textContent='載入逾時；請重新播放或全頁查看。';status.classList.add('error');return false}};card.querySelector('[data-play]').onclick=()=>void load(true);const rise=card.querySelector('[data-rise]');if(rise)rise.onclick=async()=>{{if(!await load(true))return;animation=viewer.animate([{{opacity:1,transform:'translateY(0)',offset:0}},{{opacity:1,transform:'translateY(0)',offset:c.presentation.fadeStartRatio}},{{opacity:.08,transform:`translateY(${{c.presentation.translateYPixels}}px)`,offset:1}}],{{duration:c.presentation.durationMs,easing:'ease-in',fill:'forwards'}})}};motion.append(card);void load(false)}}
const visual=document.getElementById('visual');for(const c of D.visualCandidates){{const card=document.createElement('article');card.className='card '+state(c.candidateId).decision;card.dataset.candidate=c.candidateId;card.dataset.kind=c.sourceKind;card.dataset.search=JSON.stringify(c).toLowerCase();const gallery=c.previewFiles.map((p,i)=>`<a href="http://127.0.0.1:8767/media/${{encodeURIComponent(p.mediaId)}}" target="_blank" rel="noopener"><img loading="lazy" src="http://127.0.0.1:8767/media/${{encodeURIComponent(p.mediaId)}}" alt="${{esc(c.sourceLabel)}} 預覽 ${{i+1}}"></a>`).join('');card.innerHTML=`<h3>${{esc(c.characterNameZh)}} · <code>${{esc(c.sourceLabel)}}</code></h3><div class="tags"><span class="tag">${{esc(c.sourceKind)}}</span><span class="tag">${{esc(c.assetKind)}}</span><span class="tag">ownerDecision=${{esc(c.ownerDecision)}}</span><span class="tag">僅視覺裁決</span></div><div class="visual-gallery">${{gallery}}</div>${{evidence(c)}}${{controls(c)}}`;visual.append(card)}}
const blocked=document.getElementById('blocked');for(const c of D.blockedMotionLeads){{const card=document.createElement('article');card.className='card';card.dataset.search=JSON.stringify(c).toLowerCase();card.innerHTML=`<h3>${{esc(c.targetCharacter)}} ← ${{esc(c.sourceCharacter)}}</h3><div class="tags"><span class="tag">${{esc(c.motionKind)}}</span><span class="tag">不可裁決</span></div><p>${{esc(c.clips.join('、'))}}</p><ul>${{c.gaps.map(x=>`<li>${{esc(x)}}</li>`).join('')}}</ul>`;blocked.append(card)}}
document.addEventListener('change',e=>{{const d=e.target.closest('[data-decision]');if(d){{const id=d.dataset.decision,s=state(id);s.decision=d.value;draft.decisions[id]=s;persist()}}const b=e.target.closest('[data-binding]');if(b){{const id=b.dataset.binding,s=state(id);s.approvedBindings=[...document.querySelectorAll(`[data-binding="${{CSS.escape(id)}}"]:checked`)].map(x=>x.value);draft.decisions[id]=s;persist()}}}});document.addEventListener('input',e=>{{const n=e.target.closest('[data-note]');if(n){{const id=n.dataset.note,s=state(id);s.note=n.value;draft.decisions[id]=s;persist()}}if(e.target.id==='search')applyFilters()}});
function applyFilters(){{const q=document.getElementById('search').value.toLowerCase(),kind=document.getElementById('kind').value,status=document.getElementById('status').value;let visible=0;for(const card of document.querySelectorAll('[data-candidate]')){{const id=card.dataset.candidate,ok=(!q||card.dataset.search.includes(q))&&(!kind||card.dataset.kind===kind)&&(!status||state(id).decision===status);card.classList.toggle('hidden',!ok);card.classList.remove('pending','approve','reject');card.classList.add(state(id).decision);if(ok)visible++}}document.getElementById('visible').textContent=`顯示 ${{visible}}/${{all.length}}`;document.getElementById('audioCount').textContent=`(${{D.audioCandidates.length}})`;document.getElementById('motionCount').textContent=`(${{D.motionCandidates.length}})`;document.getElementById('visualCount').textContent=`(${{D.visualCandidates.length}})`}}
function renderStatus(){{const counts={{pending:0,approve:0,reject:0}};for(const c of all)counts[state(c.candidateId).decision]++;document.getElementById('decisionStatus').textContent=`pending ${{counts.pending}} · approve ${{counts.approve}} · reject ${{counts.reject}}；所有匯出列的 runtimeBindingAuthorized 都固定為 false。`}}
document.getElementById('kind').onchange=applyFilters;document.getElementById('status').onchange=applyFilters;document.getElementById('export').onclick=()=>{{const needsBinding=c=>['event-binding-proposal','generic-event-suggestion','motion-event-suggestion'].includes(c.approvalScope);const decisions=all.map(c=>{{const s=state(c.candidateId);return {{candidateId:c.candidateId,decision:s.decision,approvedBindings:s.decision==='approve'&&needsBinding(c)?s.approvedBindings:[],note:s.note||'',runtimeBindingAuthorized:false}}}});const bad=decisions.find(d=>d.decision==='approve'&&!d.approvedBindings.length&&needsBinding(all.find(c=>c.candidateId===d.candidateId)));if(bad)return alert('核准候選必須選擇事件／動作綁定：'+bad.candidateId);const receipt={{schema:'ggd.asset-review-decisions@1',sourceFingerprint:D.sourceFingerprint,reviewer:document.getElementById('reviewer').value.trim()||'owner',reviewedAt:new Date().toISOString(),runtimeMutationAllowed:false,decisions}};const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(receipt,null,2)+'\\n'],{{type:'application/json'}}));a.download='asset-review-decisions.json';a.click();URL.revokeObjectURL(a.href)}};document.getElementById('clear').onclick=()=>{{localStorage.removeItem(storageKey);location.reload()}};applyFilters();renderStatus();window.__assetReviewPortal={{contract:D,getDraft:()=>JSON.parse(JSON.stringify(draft))}};
</script></body></html>'''


def products() -> dict[Path, str]:
    contract = build_contract()
    return {
        OUTPUT_JSON: json.dumps(contract, ensure_ascii=False, indent=2) + "\n",
        OUTPUT_SCHEMA: json.dumps(decision_schema(contract), ensure_ascii=False, indent=2) + "\n",
        OUTPUT_HTML: build_html(contract),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    generated = products()
    if args.check:
        stale = [path.relative_to(ROOT).as_posix() for path, value in generated.items() if not path.is_file() or path.read_text(encoding="utf-8") != value]
        if stale:
            raise SystemExit("stale generated review files: " + ", ".join(stale))
    else:
        for path, value in generated.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(value, encoding="utf-8")
    contract = json.loads(generated[OUTPUT_JSON])
    print(json.dumps(contract["summary"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
