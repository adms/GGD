#!/usr/bin/env python3
"""Build owner-approved Popp audio assets without inventing GGD skill bindings."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import tempfile
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
QUEUE = ROOT / "materials/hero-model-library/review/asset-review-portal-v1/review-queue.json"
DECISIONS = ROOT / "materials/hero-model-library/review/asset-review-portal-v1/owner-decisions.json"
OUTPUT_ROOT = ROOT / "content/assets/audio/original/strash/popp"
EVIDENCE_ROOT = ROOT / "materials/hero-model-library/priority-evidence/infinity-strash-popp-approved-audio-v1"
SOURCE_ID = "steam-infinity-strash-popp-priority-audio-build-local-20240328"
SCHEMA = "ggd.infinity-strash-popp-approved-audio@1"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def dump(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def ffprobe(path: Path) -> dict:
    completed = subprocess.run(
        [
            "ffprobe", "-v", "error", "-select_streams", "a:0",
            "-show_entries", "stream=codec_name,channels,sample_rate,duration",
            "-of", "json", str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    streams = json.loads(completed.stdout).get("streams", [])
    if len(streams) != 1:
        raise ValueError(f"expected one audio stream: {path}")
    return streams[0]


def transcode(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
            "-i", str(source), "-map_metadata", "-1", "-vn", "-ac", "1", "-ar", "48000",
            "-codec:a", "libmp3lame", "-b:a", "96k", "-write_xing", "0", str(target),
        ],
        check=True,
    )


def selected_rows() -> tuple[list[dict], dict]:
    queue = load(QUEUE)
    decisions_doc = load(DECISIONS)
    if queue.get("schema") != "ggd.asset-review-portal@1":
        raise ValueError("unexpected review queue schema")
    if decisions_doc.get("schema") != "ggd.asset-review-decisions@1":
        raise ValueError("unexpected owner decisions schema")
    if decisions_doc.get("runtimeMutationAllowed") is not False:
        raise ValueError("owner decision boundary changed; this workflow expects no runtime mutation authority")
    candidates = [
        row for row in queue.get("audioCandidates", [])
        if row.get("sourceKind") == "popp-event-audio" and row.get("sourceId") == SOURCE_ID
    ]
    decisions = {
        row["candidateId"]: row for row in decisions_doc.get("decisions", [])
        if str(row.get("candidateId", "")).startswith("popp:")
    }
    if len(candidates) != 36 or len(decisions) != 36:
        raise ValueError("expected exactly 36 Popp candidates and decisions")
    result = []
    for row in candidates:
        decision = decisions.get(row["candidateId"])
        if not decision or decision.get("decision") != "approve":
            raise ValueError("candidate is not owner-approved: " + row["candidateId"])
        if decision.get("runtimeBindingAuthorized") is not False:
            raise ValueError("candidate unexpectedly authorizes runtime binding: " + row["candidateId"])
        approved = decision.get("approvedBindings")
        if approved != row.get("eventCandidates") or len(approved) != 1:
            raise ValueError("approved binding is not the single listed native event: " + row["candidateId"])
        if row.get("sourceLabel") != approved[0]:
            raise ValueError("source label and approved native event differ: " + row["candidateId"])
        if row.get("heroId") != "b2-popp" or row.get("nativeCharacterId") != "PN020":
            raise ValueError("candidate identity escaped the Popp/PN020 scope")
        if row.get("category") not in (["voice"], ["sound-effect"]):
            raise ValueError("candidate category is not uniquely classified")
        if len(row.get("language", [])) != 1:
            raise ValueError("candidate language label is not singular")
        source = Path(row["file"]["absolutePath"])
        if not source.is_file() or source.stat().st_size != row["file"]["bytes"] or sha256(source) != row["file"]["sha256"]:
            raise ValueError("source WAV is missing or changed: " + str(source))
        result.append((row, decision, source))
    return result, decisions_doc


def build_into(runtime_root: Path, evidence_root: Path) -> dict:
    rows, decisions_doc = selected_rows()
    output_by_source: dict[str, dict] = {}
    candidate_records = []
    event_groups: dict[str, list[dict]] = defaultdict(list)
    blockers = []
    for row, decision, source in rows:
        source_sha = row["file"]["sha256"]
        category = row["category"][0]
        language = row["language"][0]
        relative_dir = "sfx/nonlocalized" if category == "sound-effect" else f"voice/{language.lower()}"
        relative = Path(relative_dir) / f"{source_sha}.mp3"
        output = runtime_root / relative
        existing = output_by_source.get(source_sha)
        if existing is None:
            transcode(source, output)
            probe = ffprobe(output)
            if probe.get("codec_name") != "mp3" or int(probe.get("channels", 0)) != 1 or int(probe.get("sample_rate", 0)) != 48000:
                raise ValueError("transcoded output failed the MP3/mono/48k gate: " + str(output))
            existing = {
                "relativePath": relative.as_posix(),
                "bytes": output.stat().st_size,
                "sha256": sha256(output),
                "codec": "mp3",
                "channels": 1,
                "sampleRate": 48000,
                "durationSeconds": float(probe["duration"]),
            }
            output_by_source[source_sha] = existing
        record = {
            "candidateId": row["candidateId"],
            "sourceId": SOURCE_ID,
            "heroId": "b2-popp",
            "nativeCharacterId": "PN020",
            "category": category,
            "reportedLanguage": language,
            "languageConfidence": row["languageConfidence"],
            "speakerConfidence": row["speakerConfidence"],
            "eventMeaningConfidence": row["eventMeaningConfidence"],
            "nativeEvent": decision["approvedBindings"][0],
            "source": {
                "absolutePath": str(source),
                "bytes": source.stat().st_size,
                "sha256": source_sha,
                "durationSeconds": row["sourceEvidence"]["durationSeconds"],
                "sampleRate": row["sourceEvidence"]["sampleRate"],
                "channels": row["sourceEvidence"]["channels"],
            },
            "runtimeCandidate": {
                "gitPath": "content/assets/audio/original/strash/popp/" + existing["relativePath"],
                **{key: existing[key] for key in ("bytes", "sha256", "codec", "channels", "sampleRate", "durationSeconds")},
            },
            "ownerDecision": "approve",
            "ownerApprovedNativeEvent": True,
            "ggdRuntimeTarget": None,
            "runtimeBindingAuthorized": False,
            "runtimeSelectable": False,
            "productionDeployed": False,
        }
        candidate_records.append(record)
        event_groups[record["nativeEvent"]].append(record)
        blockers.append({
            "candidateId": row["candidateId"],
            "sourceSha256": source_sha,
            "nativeEvent": record["nativeEvent"],
            "runtimeCandidateGitPath": record["runtimeCandidate"]["gitPath"],
            "blocker": "approved-only-for-native-event; no-owner-approved-unique-ggd-runtime-target",
            "requiredEvidence": [
                "owner-approved GGD ability/state target for this candidate",
                "verified speaker and per-clip language when used as character voice",
                "runtime playback and regression receipt",
            ],
        })

    event_table = {
        "schema": "ggd.infinity-strash-popp-native-event-audio-table@1",
        "sourceId": SOURCE_ID,
        "heroId": "b2-popp",
        "nativeCharacterId": "PN020",
        "runtimeConsumerRegistered": False,
        "runtimeBindingAuthorized": False,
        "productionDeployed": False,
        "events": [
            {
                "nativeEvent": native_event,
                "candidateIds": [row["candidateId"] for row in records],
                "category": sorted({row["category"] for row in records}),
                "reportedLanguages": sorted({row["reportedLanguage"] for row in records}),
                "runtimeCandidateFiles": sorted({row["runtimeCandidate"]["gitPath"] for row in records}),
                "ggdRuntimeTarget": None,
                "blocker": "no owner-approved unique GGD runtime target",
            }
            for native_event, records in sorted(event_groups.items())
        ],
    }
    counts = Counter(row["category"] for row in candidate_records)
    languages = Counter(row["reportedLanguage"] for row in candidate_records)
    manifest = {
        "schema": SCHEMA,
        "sourceId": SOURCE_ID,
        "heroId": "b2-popp",
        "nativeCharacterId": "PN020",
        "approvalAuthority": {
            "gitPath": DECISIONS.relative_to(ROOT).as_posix(),
            "sha256": sha256(DECISIONS),
            "reviewer": decisions_doc["reviewer"],
            "reviewedAt": decisions_doc["reviewedAt"],
            "runtimeMutationAllowed": False,
        },
        "reviewQueue": {"gitPath": QUEUE.relative_to(ROOT).as_posix(), "sha256": sha256(QUEUE)},
        "conversion": {
            "tool": "ffmpeg",
            "codec": "libmp3lame",
            "bitrate": "96k",
            "channels": 1,
            "sampleRate": 48000,
            "metadataRemoved": True,
            "xingHeader": False,
        },
        "summary": {
            "reviewCandidates": len(candidate_records),
            "ownerApproved": len(candidate_records),
            "sourceWavFiles": len({row["source"]["absolutePath"] for row in candidate_records}),
            "uniqueSourcePayloads": len(output_by_source),
            "gameAudioFiles": len(output_by_source),
            "gameAudioCandidateRelationships": len(candidate_records),
            "nativeEventRows": len(event_groups),
            "soundEffectCandidates": counts["sound-effect"],
            "voiceCandidates": counts["voice"],
            "reportedJapaneseCandidates": languages["Japanese"],
            "reportedEnglishCandidates": languages["English_US"],
            "reportedNonlocalizedCandidates": languages["nonlocalized"],
            "runtimeBindings": 0,
            "runtimeConsumers": 0,
            "candidateBlockers": len(blockers),
            "productionDeployed": 0,
        },
        "assets": sorted(output_by_source.values(), key=lambda row: row["relativePath"]),
        "candidates": candidate_records,
        "states": {
            "sourceAcquired": True,
            "decodedWavVerified": True,
            "ownerListeningApproved": True,
            "gameFormatConverted": True,
            "nativeEventTableBuilt": True,
            "ggdRuntimeTargetsVerified": False,
            "runtimeRegistered": False,
            "runtimeSelectable": False,
            "productionDeployed": False,
        },
    }
    dump(runtime_root / "MANIFEST.json", manifest)
    dump(evidence_root / "runtime-event-table.json", event_table)
    dump(evidence_root / "candidate-blockers.json", {
        "schema": "ggd.infinity-strash-popp-audio-blockers@1",
        "sourceId": SOURCE_ID,
        "summary": {"candidates": len(blockers), "runtimeBindable": 0, "blocked": len(blockers)},
        "blockers": blockers,
    })
    receipt_files = []
    for path in sorted(runtime_root.rglob("*")) + sorted(evidence_root.rglob("*")):
        if path.is_file() and path.name != "receipt.json":
            if path.is_relative_to(runtime_root):
                git_path = "content/assets/audio/original/strash/popp/" + path.relative_to(runtime_root).as_posix()
            else:
                git_path = (
                    "materials/hero-model-library/priority-evidence/"
                    "infinity-strash-popp-approved-audio-v1/" + path.relative_to(evidence_root).as_posix()
                )
            receipt_files.append({
                "gitPath": git_path,
                "bytes": path.stat().st_size,
                "sha256": sha256(path),
            })
    receipt = {
        "schema": "ggd.infinity-strash-popp-approved-audio-receipt@1",
        "sourceId": SOURCE_ID,
        "manifest": {
            "gitPath": "content/assets/audio/original/strash/popp/MANIFEST.json",
            "bytes": (runtime_root / "MANIFEST.json").stat().st_size,
            "sha256": sha256(runtime_root / "MANIFEST.json"),
        },
        "eventTable": {
            "gitPath": "materials/hero-model-library/priority-evidence/infinity-strash-popp-approved-audio-v1/runtime-event-table.json",
            "sha256": sha256(evidence_root / "runtime-event-table.json"),
        },
        "blockers": {
            "gitPath": "materials/hero-model-library/priority-evidence/infinity-strash-popp-approved-audio-v1/candidate-blockers.json",
            "sha256": sha256(evidence_root / "candidate-blockers.json"),
        },
        "summary": manifest["summary"],
        "files": receipt_files,
        "allSourceBytesVerified": True,
        "allOutputsProbed": True,
        "runtimeMutationPerformed": False,
        "productionDeploymentVerified": False,
    }
    dump(evidence_root / "receipt.json", receipt)
    return receipt


def compare_tree(expected: Path, actual: Path) -> list[str]:
    expected_files = {p.relative_to(expected).as_posix(): sha256(p) for p in expected.rglob("*") if p.is_file()}
    actual_files = {p.relative_to(actual).as_posix(): sha256(p) for p in actual.rglob("*") if p.is_file()}
    return sorted(set(expected_files) ^ set(actual_files) | {key for key in expected_files.keys() & actual_files.keys() if expected_files[key] != actual_files[key]})


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.check:
        with tempfile.TemporaryDirectory(prefix="popp-approved-audio-") as name:
            temp = Path(name)
            build_into(temp / "runtime", temp / "evidence")
            stale = compare_tree(temp / "runtime", OUTPUT_ROOT) + compare_tree(temp / "evidence", EVIDENCE_ROOT)
            if stale:
                raise SystemExit("Popp approved audio outputs are stale: " + ", ".join(stale))
    else:
        OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
        EVIDENCE_ROOT.mkdir(parents=True, exist_ok=True)
        receipt = build_into(OUTPUT_ROOT, EVIDENCE_ROOT)
        print(json.dumps(receipt["summary"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
