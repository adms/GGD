#!/usr/bin/env python3
"""Freeze a compact Git receipt for the selected mounted JUMP FORCE/KOF scan."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from pathlib import Path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scan-dir", type=Path, required=True)
    parser.add_argument("--hash-manifest", type=Path, required=True)
    parser.add_argument("--kof-voice-manifest", type=Path, required=True)
    parser.add_argument("--kof-voice-s3-receipt", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    scan_dir = args.scan_dir.resolve()
    receipt = json.loads((scan_dir / "scan-receipt.json").read_text())
    with (scan_dir / "game-file-summaries.csv").open(encoding="utf-8-sig", newline="") as handle:
        games = {row["AppId"]: row for row in csv.DictReader(handle)}
    hashes = json.loads(args.hash_manifest.read_text())
    by_path = {row["path"]: row for row in hashes["files"]}
    voice = json.loads(args.kof_voice_manifest.read_text())
    s3 = json.loads(args.kof_voice_s3_receipt.read_text())
    if voice["sourceSha256"] != by_path[voice["sourcePath"]]["sha256"]:
        raise ValueError("KOF 2002 UM voice source hash mismatch")
    if not all(s3.get(key) is True for key in ("readbackVerified", "fullGetVerified", "allArchiveMembersSha256Verified")):
        raise ValueError("KOF 2002 UM S3 readback is incomplete")

    def summary(app_id: str) -> dict:
        row = games[app_id]
        return {
            "appId": app_id,
            "buildId": row["BuildId"],
            "title": row["Title"],
            "mountedPath": row["FullPath"],
            "fileCount": int(row["FileCount"]),
            "logicalFileBytes": int(row["TotalBytes"]),
            "assetContainerCandidateCount": int(row["AssetContainerCandidateCount"]),
            "engineHints": [value for value in row["EngineHints"].split("; ") if value],
            "inventoryStatus": row["InventoryStatus"],
        }

    jump = summary("816020")
    jump_paks = [row for path, row in by_path.items() if "/JUMP FORCE/" in path and path.endswith(".pak")]
    jump.update({
        "coreContainers": sorted(jump_paks, key=lambda row: row["path"]),
        "unrealPackageIndex": {
            "tool": "repak_cli 0.1.8",
            "pakVersion": "V4",
            "status": "blocked-encrypted-index-no-authorized-aes-key",
            "packageListProduced": False,
        },
        "accessibleCriwareAudio": {"awbFileCount": 43, "status": "available-for-separate-audio-extraction"},
        "extractionStatus": "audio-partial-existing-workflow; encrypted-pak-not-extracted",
    })
    kof2002 = summary("222440")
    kof2002.update({
        "voiceContainer": by_path[voice["sourcePath"]],
        "voiceExtraction": {
            "fileCount": voice["fileCount"],
            "bytes": voice["totalExtractedBytes"],
            "manifestPath": str(args.kof_voice_manifest.resolve()),
            "manifestSha256": sha256(args.kof_voice_manifest),
            "language": "pending-confirmation",
            "speaker": "pending-confirmation",
            "event": "pending-confirmation",
        },
        "s3Backup": {
            "s3Uri": s3["s3Uri"],
            "bytes": s3["bytes"],
            "sha256": s3["sha256"],
            "fileCount": s3["fileCount"],
            "fullGetVerified": True,
            "allArchiveMembersSha256Verified": True,
        },
        "integrationStatus": "central-source-and-voice-index-registered; character-binding-pending",
    })
    kof14 = summary("571260")
    wad_path = next(path for path in by_path if path.endswith("/THE KING OF FIGHTERS XIV/assets.wad"))
    kof14.update({
        "coreContainer": by_path[wad_path],
        "containerMagic": "AGAR",
        "containerStatus": "container-hashed; extraction-tool-validation-pending",
        "extractionStatus": "not-extracted",
    })
    output = {
        "schema": "ggd-mounted-priority-game-container-receipt@1",
        "generatedAt": receipt["generatedAt"],
        "readOnlySource": True,
        "scan": {
            "selectedInstallDirectories": receipt["selectedInstallDirectories"],
            "gameRecordCount": receipt["gameRecordCount"],
            "filesEnumerated": receipt["filesEnumerated"],
            "logicalFileBytes": receipt["logicalFileBytes"],
            "assetContainerCandidateCount": receipt["assetContainerCandidateCount"],
            "scanErrorCount": receipt["scanErrorCount"],
            "payloadBytesRead": receipt["payloadBytesRead"],
            "sourceFiles": [
                {"path": str(path.resolve()), "bytes": path.stat().st_size, "sha256": sha256(path)}
                for path in sorted(scan_dir.iterdir()) if path.is_file()
            ],
        },
        "games": [jump, kof2002, kof14],
        "statusSemantics": {
            "doesNotMean": ["all-payloads-extracted", "models-converted", "characters-mapped", "accepted", "switchable", "deployed"]
        },
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"games": 3, "coreHashes": len(by_path), "kofVoiceFiles": voice["fileCount"], "output": str(args.output)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
