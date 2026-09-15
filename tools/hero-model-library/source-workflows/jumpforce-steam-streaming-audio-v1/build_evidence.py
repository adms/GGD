#!/usr/bin/env python3
"""Freeze compact Git evidence for the verified JUMP FORCE audio delivery."""

import argparse
import hashlib
import json
from pathlib import Path


SOURCE_ID = "steam-jump-force-streaming-audio-816020-build-8523149"
REPO = Path(__file__).resolve().parents[4]


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    workspace, output = args.workspace.resolve(), args.output.resolve()
    if not output.is_relative_to(REPO):
        raise ValueError("Evidence output must remain inside this Git checkout")
    base = REPO / "materials/hero-model-library"
    downloads = json.loads((base / "download-sources.json").read_text())
    public_files = json.loads((base / "public-source-files.json").read_text())
    voice = json.loads((base / "voice-index.json").read_text())
    sources = [row for collection in ("publicSources", "paidSources") for row in downloads.get(collection, []) if row["id"] == SOURCE_ID]
    backups = [row for row in public_files["sources"] if row["id"] == SOURCE_ID]
    groups = [row for row in voice["groups"] if row["sourceId"] == SOURCE_ID]
    if len(sources) != 1 or len(backups) != 1 or len(groups) != 41:
        raise ValueError("Central JUMP FORCE source, backup or group inventory is incomplete")
    source, backup = sources[0], backups[0]
    required = ("readbackVerified", "fullGetVerified", "allMemberSha256Verified")
    if any(source["backup"].get(key) is not True for key in required):
        raise ValueError("Source backup lacks full S3 verification")
    if any(backup.get(key) is not True for key in required):
        raise ValueError("Public source file record lacks full S3 verification")
    for key in ("s3Uri", "bytes", "sha256"):
        if source["backup"][key] != backup[key]:
            raise ValueError("Central backup records disagree: " + key)
    archive = (workspace / backup["localArchive"]).resolve()
    receipt = (workspace / backup["receiptPath"]).resolve()
    local_root = (workspace / source["localPath"]).resolve()
    if not all(path.is_relative_to(workspace) and path.is_file() for path in (archive, receipt, local_root / "audio-file-index.json")):
        raise ValueError("Local source evidence is missing")
    if archive.stat().st_size != backup["bytes"] or sha256(archive) != backup["sha256"]:
        raise ValueError("Local frozen archive no longer matches S3 identity")
    if sha256(receipt) != backup["receiptSha256"]:
        raise ValueError("S3 readback receipt changed")
    audio_index = json.loads((local_root / "audio-file-index.json").read_text())
    if sha256(local_root / "audio-file-index.json") != source["audioFileIndex"]["reportSha256"]:
        raise ValueError("Local audio index changed")
    categories = {
        key: sum(group["categoryCounts"].get(key, 0) for group in groups)
        for key in ("voice-source-label-unreviewed", "sound-effect", "music")
    }
    if sum(group["fileCount"] for group in groups) != 4034 or categories != {
        "voice-source-label-unreviewed": 1794,
        "sound-effect": 2170,
        "music": 70,
    }:
        raise ValueError("Central voice group counts differ from the frozen extraction")
    evidence = {
        "schema": "ggd.jumpforce.streaming-audio-central-evidence.v1",
        "sourceId": SOURCE_ID,
        "steam": {"appId": source["appId"], "buildId": source["buildId"], "platform": source["platform"]},
        "localRoot": str(local_root),
        "audioFileIndex": source["audioFileIndex"],
        "decoder": source["decoder"],
        "extraction": audio_index["summary"],
        "centralVoiceGroups": len(groups),
        "centralVoiceFiles": sum(group["fileCount"] for group in groups),
        "centralCategoryCounts": categories,
        "s3": {
            "uri": backup["s3Uri"],
            "bytes": backup["bytes"],
            "sha256": backup["sha256"],
            "archiveMembers": len(backup["files"]),
            "readbackVerified": True,
            "fullGetVerified": True,
            "allMemberSha256Verified": True,
            "receiptPath": str(receipt),
            "receiptSha256": backup["receiptSha256"],
        },
        "classification": {
            "speakerVerifiedFiles": 0,
            "languageReviewedFiles": 0,
            "unresolvedNativeCharacterIds": ["chr0440", "chr0490", "chr0500", "chr0510", "chr7000"],
            "note": "EvnVoice, ActSE, BGM and SE are native bank labels. Per-clip speaker, language, transcript, event and GGD skill bindings remain pending.",
        },
        "runtime": {"backendSelectable": False, "deployed": False},
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"output": str(output), "sha256": sha256(output), "files": evidence["centralVoiceFiles"], "s3Verified": True}, ensure_ascii=False))


if __name__ == "__main__":
    main()
