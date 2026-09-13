#!/usr/bin/env python3
"""Audit the exact owner-approved LoL seven battle subset and emit a receipt."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
BASE = ROOT / "materials/hero-model-library/lol-project-seven"
DECISIONS = BASE / "listening-review-decisions.json"
QUEUE = BASE / "listening-review-queue.json"
REGISTRATION = BASE / "runtime-registration.json"
LOCAL_VERIFICATION = BASE / "local-file-verification/index.json"
ORIGINALS = ROOT / "content/assets/audio/voices/lines/COMBAT_ORIGINALS.json"
MANIFEST = ROOT / "content/assets/audio/voices/champions/MANIFEST.json"
VOICE_INDEX = ROOT / "materials/hero-model-library/voice-index.json"
VOICE_FILES = ROOT / "materials/hero-model-library/voice-files.jsonl.gz"
OUTPUT = BASE / "runtime-audit.json"
EXPECTED_HEROES = {
    "lol-karthus": 52,
    "lol-leesin": 64,
    "lol-lux": 48,
    "lol-missfortune": 21,
    "lol-warwick": 59,
    "lol-xerath": 26,
    "lol-yasuo": 41,
}


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def pin(path: Path) -> dict:
    return {
        "path": path.relative_to(ROOT).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def git_blob_sha(path: str) -> str:
    result = subprocess.run(
        ["git", "show", f":{path}"], cwd=ROOT, capture_output=True, check=True
    )
    return hashlib.sha256(result.stdout).hexdigest()


def probe(path: Path) -> tuple[dict, float]:
    result = subprocess.run(
        [
            "ffprobe", "-v", "error", "-select_streams", "a:0",
            "-show_entries", "stream=codec_name,sample_rate,channels:format=duration",
            "-of", "json", str(path),
        ],
        capture_output=True,
        check=True,
        text=True,
    )
    streams = json.loads(result.stdout).get("streams", [])
    if len(streams) != 1:
        raise ValueError(f"Expected one audio stream: {path}")
    stream = streams[0]
    actual = {
        "codec": stream.get("codec_name"),
        "sampleRate": int(stream.get("sample_rate", 0)),
        "channels": int(stream.get("channels", 0)),
    }
    if actual != {"codec": "mp3", "sampleRate": 44100, "channels": 1}:
        raise ValueError(f"Runtime audio contract drift: {path}: {actual}")
    duration = float(json.loads(result.stdout).get("format", {}).get("duration", -1))
    if duration <= 0:
        raise ValueError(f"Runtime audio duration is unavailable: {path}")
    return actual, duration


def create(asset_workspace: Path) -> dict:
    decisions = read_json(DECISIONS)
    queue = read_json(QUEUE)
    registration = read_json(REGISTRATION)
    local = read_json(LOCAL_VERIFICATION)
    originals = read_json(ORIGINALS)
    manifest = read_json(MANIFEST)
    voice_index = read_json(VOICE_INDEX)
    records = registration["records"]

    approved_keys = {
        key for key, row in decisions["decisions"].items()
        if row.get("runtimeApproved") is True
    }
    registered_keys = {row["reviewKey"] for row in records}
    if approved_keys != registered_keys or len(records) != 311:
        raise ValueError("Runtime registration differs from the exact approved key set")
    if queue["summary"]["battleReviewCandidates"] != 311:
        raise ValueError("Battle review scope drift")

    counts = Counter()
    targets = Counter()
    category_counts: dict[str, Counter] = defaultdict(Counter)
    runtime_bytes = 0
    audio_contract = None
    for row in records:
        source = (asset_workspace / row["sourcePath"]).resolve()
        if not source.is_relative_to(asset_workspace) or not source.is_file():
            raise ValueError(f"Missing approved source WAV: {source}")
        if source.stat().st_size != row["sourceBytes"] or sha256(source) != row["sourceSha256"]:
            raise ValueError(f"Approved source WAV drift: {source}")

        runtime = ROOT / row["runtimePath"]
        if runtime.stat().st_size != row["runtimeBytes"] or sha256(runtime) != row["runtimeSha256"]:
            raise ValueError(f"Runtime MP3 drift: {runtime}")
        if git_blob_sha(row["runtimePath"]) != row["runtimeSha256"]:
            raise ValueError(f"Runtime MP3 Git blob drift: {row['runtimePath']}")
        current_contract, runtime_duration = probe(runtime)
        if audio_contract is None:
            audio_contract = current_contract
        elif current_contract != audio_contract:
            raise ValueError(f"Inconsistent runtime audio contract: {runtime}")

        original = originals["champions"][row["runtimeHeroId"]][row["runtimeTakeKey"]]
        if (
            original.get("reviewKey") != row["reviewKey"]
            or original.get("src") != row["sourcePath"]
            or original.get("sha256") != row["sourceSha256"]
            or original.get("assignedBy") != "owner-listening-review"
        ):
            raise ValueError(f"Runtime authority drift: {row['reviewKey']}")

        expected_path = f"assets/audio/voices/lines/{row['runtimeHeroId']}/{row['runtimeTakeKey']}.mp3"
        clips = manifest["champions"][row["runtimeHeroId"]]["lines"][row["runtimeCategory"]]
        matches = [clip for clip in clips if clip.get("clip") == expected_path]
        if len(matches) != 1:
            raise ValueError(f"Manifest path drift: {row['reviewKey']}")
        clip = matches[0]
        if clip.get("hash") != row["runtimeSha256"] or clip.get("lang") != "ja":
            raise ValueError(f"Manifest metadata drift: {row['reviewKey']}")
        if abs(float(clip.get("durationSec", -1)) - runtime_duration) > 0.000001:
            raise ValueError(f"Manifest duration drift: {row['reviewKey']}")

        counts[row["runtimeHeroId"]] += 1
        targets[row["candidateRuntimeTarget"]] += 1
        category_counts[row["runtimeHeroId"]][row["candidateRuntimeTarget"]] += 1
        runtime_bytes += row["runtimeBytes"]

    if dict(sorted(counts.items())) != EXPECTED_HEROES:
        raise ValueError(f"Per-hero approved counts drift: {dict(counts)}")
    review = voice_index["listeningReview"]
    if review["runtimeApproved"] != 311 or review["runtimeRegistered"] != 311:
        raise ValueError("Central voice index registration count drift")
    if review["decisionsPath"] != DECISIONS.relative_to(ROOT).as_posix():
        raise ValueError("Central voice index approval authority drift")
    if voice_index["sourceFileManifestSha256"] != sha256(VOICE_FILES):
        raise ValueError("Central voice-files manifest hash drift")
    if local["summary"].get("byteAndSha256VerifiedFiles") != 4927:
        raise ValueError("Seven-character full-source verification is incomplete")
    if local["summary"].get("listeningReviewApprovedFiles") != 311:
        raise ValueError("Local verification receipt omits the approved subset")

    per_hero = []
    for hero, count in sorted(counts.items()):
        per_hero.append({
            "heroId": hero,
            "approvedSourceWavs": count,
            "runtimeMp3s": count,
            "runtimeGitBlobs": count,
            "manifestRows": count,
            "byNativeTarget": dict(sorted(category_counts[hero].items())),
        })
    return {
        "schema": "ggd-lol-seven-approved-runtime-audit@1",
        "sourceId": registration["sourceId"],
        "scope": {
            "heroes": list(EXPECTED_HEROES),
            "authority": "Only runtimeApproved=true rows in listening-review-decisions.json.",
            "unapprovedMappingsAdded": 0,
        },
        "inputs": {
            "decisions": pin(DECISIONS),
            "queue": pin(QUEUE),
            "runtimeRegistration": pin(REGISTRATION),
            "runtimeAuthority": pin(ORIGINALS),
            "runtimeManifest": pin(MANIFEST),
            "centralVoiceIndex": pin(VOICE_INDEX),
            "centralVoiceFiles": pin(VOICE_FILES),
            "localSourceVerification": pin(LOCAL_VERIFICATION),
        },
        "summary": {
            "approvedSourceWavsVerified": len(records),
            "runtimeMp3sVerified": len(records),
            "runtimeGitBlobsVerified": len(records),
            "runtimeManifestRowsVerified": len(records),
            "runtimeBytes": runtime_bytes,
            "fullSevenSourceWavsVerified": local["summary"]["byteAndSha256VerifiedFiles"],
            "pendingOtherEventBoundWavs": queue["summary"]["pendingReviews"],
            "productionDeployed": False,
            "byNativeTarget": dict(sorted(targets.items())),
        },
        "runtimeAudioContract": audio_contract,
        "perHero": per_hero,
        "checks": {
            "approvedKeySetEqualsRegistrationKeySet": True,
            "sourceWavBytesAndSha256": True,
            "runtimeMp3BytesAndSha256": True,
            "runtimeMp3GitIndexBytes": True,
            "runtimeAudioProbe": True,
            "runtimeAuthorityBinding": True,
            "runtimeManifestBinding": True,
            "centralVoiceIndexBinding": True,
            "fullSourceReceiptBinding": True,
        },
        "status": {
            "acquired": True,
            "converted": True,
            "ownerReviewed": True,
            "runtimeRegistered": True,
            "branchSelectable": True,
            "productionDeployed": False,
        },
        "boundaries": [
            "The 311 records are the complete fixed battle-review subset, not all 4,927 source WAVs.",
            "The remaining 443 event-bound WAVs are pending and are not mapped by implication.",
            "No transcript is asserted by this receipt.",
            "Git and branch runtime verification does not prove Main merge or production deployment.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--asset-workspace", type=Path, required=True)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    result = create(args.asset_workspace.resolve())
    rendered = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.write:
        OUTPUT.write_text(rendered, encoding="utf-8")
    elif not OUTPUT.is_file() or OUTPUT.read_text(encoding="utf-8") != rendered:
        raise ValueError("runtime-audit.json is stale; rerun with --write")
    print(json.dumps(result["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
