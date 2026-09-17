#!/usr/bin/env python3
"""Freeze the complete JUMP FORCE Gon audio set as reviewable runtime candidates.

The native directory labels are authoritative only for the character family and
the broad ActVoice/EvnVoice source class.  This workflow never invents a per-clip
speaker, language, transcript, or gameplay event binding.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
from pathlib import Path


REPO = Path(__file__).resolve().parents[4]
LIBRARY = REPO / "materials/hero-model-library"
VOICE_INDEX = LIBRARY / "voice-index.json"
VOICE_FILES = LIBRARY / "voice-files.jsonl.gz"
IDENTITY = LIBRARY / "priority-evidence/jump-force-full-roster-v1/audio-identity-bindings.json"
OWNER = LIBRARY / "review/asset-review-portal-v1/owner-decisions.json"
OUT = LIBRARY / "priority-evidence/jump-force-gon-audio-v1"
FILES_OUT = OUT / "files.jsonl.gz"
RECEIPT_OUT = OUT / "receipt.json"
RUNTIME_OUT = OUT / "runtime-candidate-registration.json"

HERO_ID = "godie-ucrl"
NATIVE_ID = "chr0300"
GROUPS = {
    "parallel-ps-jumpforce-local-next32:jumpforce-gon": {
        "candidateId": "jumpforce:public:parallel-ps-jumpforce-local-next32:jumpforce-gon",
        "sourceClass": "ActVoice",
        "candidateClass": "character-action-voice-unclassified",
        "expectedFiles": 225,
    },
    "steam-jump-force-streaming-audio-816020-build-8523149:chr0300": {
        "candidateId": "jumpforce:steam:chr0300",
        "sourceClass": "EvnVoice",
        "candidateClass": "character-event-voice-unclassified",
        "expectedFiles": 25,
    },
}


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def load_source_rows() -> list[dict]:
    workspace = Path(read_json(VOICE_INDEX)["localWorkspace"])
    rows = []
    with gzip.open(VOICE_FILES, "rt", encoding="utf-8") as stream:
        for line in stream:
            row = json.loads(line)
            group_id = row.get("groupId")
            if group_id not in GROUPS:
                continue
            source = GROUPS[group_id]
            rows.append({
                "candidateId": f"jumpforce-gon:{source['sourceClass'].lower()}:{Path(row['path']).stem}",
                "heroId": HERO_ID,
                "nativeCharacterId": NATIVE_ID,
                "groupId": group_id,
                "sourceClass": source["sourceClass"],
                "candidateClass": source["candidateClass"],
                "sourcePath": row["path"],
                "absolutePath": row.get("absolutePath") or str(workspace / row["path"]),
                "archiveMember": row.get("archiveMember"),
                "backupId": row.get("backupId"),
                "bytes": row["bytes"],
                "sha256": row["sha256"],
                "seconds": row.get("seconds"),
                "sampleRate": row.get("sampleRate"),
                "channels": row.get("channels"),
                "sourceBank": row.get("sourceBank"),
                "sourceBankSha256": row.get("sourceBankSha256"),
                "localSizeVerifiedByCentralIndex": row.get("localSizeVerified") is True,
                "ownerGroupDecision": "approve",
                "speakerReview": "pending-per-clip",
                "languageReview": "pending-per-clip",
                "transcriptReview": "pending-per-clip",
                "eventBindingReview": "pending-per-clip",
                "runtimeSelectable": False,
                "productionDeployed": False,
            })
    rows.sort(key=lambda row: (row["groupId"], row["sourcePath"]))
    ids = [row["candidateId"] for row in rows]
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate Gon audio candidate id")
    return rows


def validate_authorities(rows: list[dict]) -> tuple[dict, dict]:
    voice_index = read_json(VOICE_INDEX)
    identity = read_json(IDENTITY)
    owner = read_json(OWNER)
    binding = next((row for row in identity.get("bindings", []) if row.get("nativeCharacterId") == NATIVE_ID), None)
    if not binding or binding.get("heroIds") != [HERO_ID] or set(binding.get("sourceGroups", [])) != set(GROUPS):
        raise ValueError("Gon identity binding authority is missing or changed")
    if binding.get("relationship") != "verified-character-family-source-association":
        raise ValueError("Gon source relationship is not verified")

    decisions = {row.get("candidateId"): row for row in owner.get("decisions", [])}
    for source in GROUPS.values():
        decision = decisions.get(source["candidateId"])
        if not decision or decision.get("decision") != "approve":
            raise ValueError(f"owner group approval missing: {source['candidateId']}")
        if decision.get("approvedBindings") != [] or decision.get("runtimeBindingAuthorized") is not False:
            raise ValueError(f"group approval overclaims runtime authority: {source['candidateId']}")

    counts: dict[str, int] = {}
    for row in rows:
        counts[row["groupId"]] = counts.get(row["groupId"], 0) + 1
    for group_id, source in GROUPS.items():
        if counts.get(group_id) != source["expectedFiles"]:
            raise ValueError(f"unexpected file count for {group_id}: {counts.get(group_id, 0)}")
    if len(rows) != 250:
        raise ValueError(f"expected 250 Gon audio candidates, got {len(rows)}")
    return voice_index, binding


def verify_local(rows: list[dict]) -> dict:
    checked = 0
    checked_bytes = 0
    for row in rows:
        value = row.get("absolutePath")
        if not value:
            raise ValueError(f"candidate has no absolute path: {row['candidateId']}")
        path = Path(value)
        if not path.is_file():
            raise ValueError(f"candidate is unavailable locally: {path}")
        if path.stat().st_size != row["bytes"] or sha256_file(path) != row["sha256"]:
            raise ValueError(f"candidate bytes changed: {path}")
        checked += 1
        checked_bytes += row["bytes"]
    return {"verified": True, "files": checked, "bytes": checked_bytes, "sha256Recomputed": checked}


def build(*, verify_local_files: bool) -> tuple[bytes, dict, dict]:
    rows = load_source_rows()
    voice_index, binding = validate_authorities(rows)
    manifest = "".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n" for row in rows).encode()
    compressed = gzip.compress(manifest, mtime=0)
    totals = {
        "files": len(rows),
        "bytes": sum(row["bytes"] for row in rows),
        "durationSeconds": round(sum(float(row.get("seconds") or 0) for row in rows), 6),
        "actVoiceFiles": sum(row["sourceClass"] == "ActVoice" for row in rows),
        "eventVoiceFiles": sum(row["sourceClass"] == "EvnVoice" for row in rows),
        "perClipSpeakerApproved": 0,
        "perClipLanguageApproved": 0,
        "perClipEventBindingsApproved": 0,
        "runtimeBindingsCreated": 0,
        "productionDeployments": 0,
    }
    receipt = {
        "schema": "ggd.jump-force-gon-audio-candidates@1",
        "asOfDate": "2026-09-17",
        "heroId": HERO_ID,
        "nativeCharacterId": NATIVE_ID,
        "sourceGame": "JUMP FORCE",
        "sourceGroups": list(GROUPS),
        "inputs": {
            "voiceIndex": {"gitPath": VOICE_INDEX.relative_to(REPO).as_posix(), "sha256": sha256_file(VOICE_INDEX)},
            "voiceFiles": {"gitPath": VOICE_FILES.relative_to(REPO).as_posix(), "sha256": sha256_file(VOICE_FILES)},
            "identityBindings": {"gitPath": IDENTITY.relative_to(REPO).as_posix(), "sha256": sha256_file(IDENTITY)},
            "ownerGroupDecisions": {"gitPath": OWNER.relative_to(REPO).as_posix(), "sha256": sha256_file(OWNER)},
            "centralManifestDeclaredSha256": voice_index.get("sourceFileManifestSha256"),
        },
        "identityEvidence": binding["relationship"],
        "ownerApprovalScope": "group-sample-classification-only",
        "filesManifest": {"gitPath": FILES_OUT.relative_to(REPO).as_posix(), "sha256": sha256_bytes(compressed)},
        "summary": totals,
        "localVerification": verify_local(rows) if verify_local_files else {"verified": False, "reason": "not-requested"},
        "stageBoundary": {
            "sourceFilesDecodedAndIndexed": True,
            "characterFamilyLinked": True,
            "ownerGroupSampleApproved": True,
            "perClipListeningReview": "pending",
            "speakerLanguageTranscriptReview": "pending",
            "eventAndSkillBinding": "pending",
            "runtimeSelectable": False,
            "productionDeployed": False,
        },
    }
    runtime = {
        "schema": "ggd.jump-force-gon-runtime-candidate-registration@1",
        "heroId": HERO_ID,
        "nativeCharacterId": NATIVE_ID,
        "sourceGame": "JUMP FORCE",
        "candidateManifest": receipt["filesManifest"],
        "candidateGroups": [
            {
                "groupId": group_id,
                "sourceClass": source["sourceClass"],
                "candidateClass": source["candidateClass"],
                "files": source["expectedFiles"],
                "ownerGroupDecision": "approve",
                "runtimeBindingState": "blocked-pending-per-clip-event-review",
            }
            for group_id, source in GROUPS.items()
        ],
        "activeBindings": [],
        "runtimeBindingAuthorized": False,
        "runtimeSelectable": False,
        "productionDeployed": False,
        "blockers": [
            "owner approval covers group classification only",
            "per-clip speaker and language are not reviewed",
            "no clip has an approved GGD event or skill target",
        ],
    }
    return compressed, receipt, runtime


def canonical(value: dict) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--check", action="store_true")
    parser.add_argument("--verify-local", action="store_true", help="recompute every local source SHA-256")
    args = parser.parse_args()
    compressed, receipt, runtime = build(verify_local_files=args.verify_local)
    if args.write:
        OUT.mkdir(parents=True, exist_ok=True)
        FILES_OUT.write_bytes(compressed)
        RECEIPT_OUT.write_text(canonical(receipt), encoding="utf-8")
        RUNTIME_OUT.write_text(canonical(runtime), encoding="utf-8")
    else:
        if FILES_OUT.read_bytes() != compressed:
            raise SystemExit(f"stale candidate manifest: {FILES_OUT}")
        recorded = read_json(RECEIPT_OUT)
        # Local verification is a machine receipt.  Portable check regenerates
        # every source-derived field while preserving a prior verified result.
        if recorded.get("localVerification", {}).get("verified") is True and not args.verify_local:
            receipt["localVerification"] = recorded["localVerification"]
        if RECEIPT_OUT.read_text(encoding="utf-8") != canonical(receipt):
            raise SystemExit(f"stale receipt: {RECEIPT_OUT}")
        if RUNTIME_OUT.read_text(encoding="utf-8") != canonical(runtime):
            raise SystemExit(f"stale runtime candidate registration: {RUNTIME_OUT}")
    print(json.dumps({**receipt["summary"], "localVerified": receipt["localVerification"]["verified"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
