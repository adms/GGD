#!/usr/bin/env python3
"""Generate the owner-approved Palworld runtime bindings and their receipts.

This workflow deliberately keeps two facts separate:

* the six model ``clipMap`` states are already reachable through the three Hero
  Forge model options, so those eighteen semantic motion rows can be marked as
  locally runtime-selectable after their bytes and mappings are checked;
* the eighteen approved cry files are copied into the public content tree and a
  manifest-driven champion/category router is generated for the existing
  contextual-voice runtime;
* the four approved per-skill motion overlays generate the only ability-id to
  animation-state table consumed by the client.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
import subprocess
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
REVIEW = ROOT / "materials/hero-model-library/palworld/review/palworld-av-review.json"
OWNER = ROOT / "materials/hero-model-library/review/asset-review-portal-v1/owner-decisions.json"
PORTAL_QUEUE = ROOT / "materials/hero-model-library/review/asset-review-portal-v1/review-queue.json"
OPTIONS = ROOT / "packages/shared/src/content/heroForge/communityAcquired.ts"
OUTPUT = ROOT / "materials/hero-model-library/priority-evidence/palworld-approved-runtime-v1"
MANIFEST = OUTPUT / "approved-components.json"
RECEIPT = OUTPUT / "receipt.json"
RUNTIME_BINDINGS = OUTPUT / "runtime-bindings.json"
MOTION_TS = ROOT / "apps/client/src/render/generated/palworldApprovedMotion.generated.ts"
RUNTIME_AUDIO = ROOT / "content/assets/audio/voices/palworld"
S3_SPLIT = ROOT / "materials/asset-library/pr1152-s3-split.json"


# These are adapters from the exact owner-approved abstract event labels to the
# categories already emitted by the GGD client.  One approved source remains one
# binding even when several runtime events reach it.
RUNTIME_CATEGORIES = {
    "spawn-or-idle": ["hum"],
    "victory": ["victory"],
    "generic-attack-or-cast": [
        "attack-light", "attack-heavy", "crit",
        "skill-name.q", "skill-name.w", "skill-name.e", "skill-name.r", "skill-name.ex",
    ],
    "low-health-or-retreat": ["retreat"],
    "hurt": ["hurt", "hurt-heavy"],
    "death": ["defeat"],
}


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


def runtime_audio_payload(source: Path, extension: str) -> tuple[str, bytes]:
    """Return the checked runtime format without changing the preserved source.

    Runtime audio is MP3-only.  The Cattiva sources are WAV, so reproduce the
    same 128 kbps / 44.1 kHz conversion used by the content audio gate while
    keeping the original WAV as preparation evidence in the S3 split.
    """
    if extension == ".mp3":
        return extension, source.read_bytes()
    if extension != ".wav":
        raise ValueError(f"unsupported runtime audio conversion: {source}")
    with tempfile.TemporaryDirectory(prefix="ggd-palworld-audio-") as temp_dir:
        output = Path(temp_dir) / "runtime.mp3"
        subprocess.run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-i", str(source), "-codec:a", "libmp3lame", "-b:a", "128k",
            "-ar", "44100", str(output),
        ], check=True)
        return ".mp3", output.read_bytes()


def product_is_current(target: Path, payload: bytes) -> bool:
    if target.is_file():
        return target.read_bytes() == payload
    if not S3_SPLIT.is_file():
        return False
    relative = target.relative_to(ROOT).as_posix()
    split = read_json(S3_SPLIT)
    entry = next((row for row in split.get("files", []) if row["repoPath"] == relative), None)
    return bool(
        entry
        and entry["bytes"] == len(payload)
        and entry["sha256"] == hashlib.sha256(payload).hexdigest()
    )


def motion_typescript(overlays: list[dict]) -> str:
    rows = ",\n".join(
        f'  {json.dumps(row["abilityId"])}: {json.dumps(row["semanticState"])}'
        for row in sorted(overlays, key=lambda row: row["abilityId"])
    )
    return f'''// GENERATED by tools/hero-model-library/source-workflows/palworld-approved-runtime-v1/integrate.py.
// Source: owner-approved Palworld components. Do not hand-edit.

export type ApprovedSkillMotionPulse = "attack" | "cast";

export const PALWORLD_APPROVED_SKILL_MOTION: Readonly<Record<string, ApprovedSkillMotionPulse>> = Object.freeze({{
{rows}
}});

export function resolvePalworldApprovedSkillMotion(
  abilityId: string | null | undefined,
): ApprovedSkillMotionPulse | null {{
  if (!abilityId) return null;
  return PALWORLD_APPROVED_SKILL_MOTION[abilityId] ?? null;
}}
'''


def expected_products() -> tuple[dict, dict, dict, list[tuple[Path, bytes]], str]:
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
    copies: list[tuple[Path, bytes]] = []
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
        original_payload = original.read_bytes()
        target = OUTPUT / "audio" / source["characterId"] / (
            f"{source['sourceLabel'].lower()}-{source['file']['sha256'][:12]}{extension}"
        )
        copies.append((target, original_payload))
        runtime_extension, runtime_payload = runtime_audio_payload(original, extension)
        runtime_target = RUNTIME_AUDIO / source["characterId"] / (
            f"{source['sourceLabel'].lower()}-{source['file']['sha256'][:12]}{runtime_extension}"
        )
        copies.append((runtime_target, runtime_payload))
        approved_binding = decision["approvedBindings"]
        if len(approved_binding) != 1 or approved_binding[0] not in RUNTIME_CATEGORIES:
            raise ValueError(f"unsupported approved cry event: {source['candidateId']}")
        audio_rows.append({
            "candidateId": source["candidateId"],
            "heroId": source["heroId"],
            "characterId": source["characterId"],
            "sourceLabel": source["sourceLabel"],
            "category": "nonverbal-creature-cry",
            "language": "not-applicable-nonverbal",
            "speakerVerified": False,
            "eventMeaningConfidence": "owner-approved-source-emotion-label; no original Wwise event map",
            "approvedBindings": approved_binding,
            "runtimeCategories": RUNTIME_CATEGORIES[approved_binding[0]],
            "ownerApproved": True,
            "source": evidence(original, git=False),
            "gitProduct": {
                "gitPath": target.relative_to(ROOT).as_posix(),
                "bytes": original.stat().st_size,
                "sha256": sha256(original),
                "container": extension[1:],
            },
            "runtimeProduct": {
                "gitPath": runtime_target.relative_to(ROOT).as_posix(),
                "bytes": len(runtime_payload),
                "sha256": hashlib.sha256(runtime_payload).hexdigest(),
                "container": runtime_extension[1:],
            },
            "runtimeBindingCreated": True,
            "runtimeSelectable": True,
            "runtimeRouter": "champion-voice-pack/contextualVoice",
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
            "runtimeBindingChanged": not generic,
            "approvedBindingReachable": True,
            "bindingNote": (
                "The approved generic semantic binding is active through model@1.clipMap."
                if generic else
                "The approved ability-id overlay is generated into the client skill-to-motion router."
            ),
        })

    overlays = []
    for row in motion_rows:
        if all(binding.startswith("generic-") for binding in row["approvedBindings"]):
            continue
        if len(row["approvedBindings"]) != 1 or row["semanticState"] not in {"attack", "cast"}:
            raise ValueError(f"unsupported approved skill overlay: {row['candidateId']}")
        overlays.append({
            "candidateId": row["candidateId"],
            "heroId": row["heroId"],
            "abilityId": row["approvedBindings"][0],
            "semanticState": row["semanticState"],
            "nativeClip": row["nativeClip"],
            "modelKey": row["modelKey"],
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
            "approvedPerSkillMotionOverlaysPendingRouter": 0,
            "approvedPerSkillMotionOverlaysRuntimeBound": skill_overlay_count,
            "approvedCryProductsInGit": 18,
            "approvedCryRuntimeBindings": len(audio_rows),
            "backendDropdownRegisteredHeroes": 3,
            "standaloneOriginalVfx": 0,
            "skillSpecificOriginalSfx": 0,
            "productionDeploymentVerifiedHeroes": 0,
        },
        "motions": motion_rows,
        "cries": audio_rows,
    }
    manifest_bytes = encoded(manifest).encode()
    runtime_bindings = {
        "schema": "ggd.palworld-approved-runtime-bindings@1",
        "sourceApprovedComponents": {
            "gitPath": MANIFEST.relative_to(ROOT).as_posix(),
            "bytes": len(manifest_bytes),
            "sha256": hashlib.sha256(manifest_bytes).hexdigest(),
        },
        "ownerDecisionReceipt": evidence(OWNER),
        "summary": {
            "characters": 3,
            "approvedCrySourceBindings": len(audio_rows),
            "runtimeVoiceCategoryRoutes": sum(len(row["runtimeCategories"]) for row in audio_rows),
            "approvedSkillMotionOverlays": len(overlays),
        },
        "cries": [{
            "candidateId": row["candidateId"],
            "heroId": row["heroId"],
            "characterId": row["characterId"],
            "sourceLabel": row["sourceLabel"],
            "approvedBinding": row["approvedBindings"][0],
            "runtimeCategories": row["runtimeCategories"],
            "clip": {
                "path": row["runtimeProduct"]["gitPath"].removeprefix("content/"),
                "bytes": row["runtimeProduct"]["bytes"],
                "sha256": row["runtimeProduct"]["sha256"],
                "language": "zxx",
                "text": row["sourceLabel"],
            },
        } for row in audio_rows],
        "motionOverlays": overlays,
    }
    receipt = {
        "schema": "ggd.palworld-approved-runtime-integration-receipt@1",
        "status": "three-local-hero-forge-dropdowns; 18-motion-states-and-18-approved-cries-runtime-bound",
        "summary": manifest["summary"],
        "states": {
            "ownerApprovalApplied": True,
            "localHeroForgeAuthoringComplete": True,
            "backendDropdownRegistered": True,
            "modelMotionRuntimeSelectable": True,
            "approvedCryProductsGitPreserved": True,
            "approvedCryRuntimeBindingCreated": True,
            "approvedPerSkillMotionOverlayCreated": True,
            "sourceFaithfulAudiovisualComplete": False,
            "productionDeploymentVerified": False,
        },
        "manifest": {
            "gitPath": MANIFEST.relative_to(ROOT).as_posix(),
            "sha256": hashlib.sha256(manifest_bytes).hexdigest(),
        },
        "runtimeBindings": {
            "gitPath": RUNTIME_BINDINGS.relative_to(ROOT).as_posix(),
            "sha256": hashlib.sha256((json.dumps(runtime_bindings, ensure_ascii=False, indent=2) + "\n").encode()).hexdigest(),
        },
        "remaining": [
            "Acquire and convert original standalone Palworld skill VFX and skill-specific SFX.",
            "Verify Main merge, service content version, backend switching, and production playback after deployment.",
        ],
    }
    return manifest, receipt, runtime_bindings, copies, motion_typescript(overlays)


def encoded(value: dict) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    manifest, receipt, runtime_bindings, copies, motion_ts = expected_products()
    products = {
        MANIFEST: encoded(manifest),
        RECEIPT: encoded(receipt),
        RUNTIME_BINDINGS: encoded(runtime_bindings),
        MOTION_TS: motion_ts,
    }
    if args.check:
        for target, payload in copies:
            if not product_is_current(target, payload):
                raise ValueError(f"approved Git audio product missing or changed: {target}")
        for path, value in products.items():
            if path.read_text(encoding="utf-8") != value:
                raise ValueError(f"stale generated Palworld integration product: {path}")
    else:
        for target, payload in copies:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(payload)
        OUTPUT.mkdir(parents=True, exist_ok=True)
        for path, value in products.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(value, encoding="utf-8")
    print(json.dumps(receipt["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
