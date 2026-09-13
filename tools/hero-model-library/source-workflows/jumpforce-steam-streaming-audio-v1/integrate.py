#!/usr/bin/env python3
"""Register one verified local JUMP FORCE Streaming audio extraction."""

import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path


SOURCE_ID = "steam-jump-force-streaming-audio-816020-build-8523149"
REPO = Path(__file__).resolve().parents[4]
DOWNLOADS = REPO / "materials/hero-model-library/download-sources.json"


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def classify_group(row):
    native_id = row.get("nativeCharacterId")
    if native_id:
        return native_id
    bank = Path(row["sourceBank"]).stem
    return {
        "900000_ResidentBGM": "resident-bgm",
        "910000_ResidentSE": "resident-se",
        "910001_BattleResSE": "battle-res-se",
        "910003_EventSE": "event-se",
    }[bank]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument(
        "--local-root",
        default="GGD-Asset-Library/extracted/jumpforce-steam-streaming-audio-v1",
    )
    args = parser.parse_args()
    workspace = args.workspace.resolve()
    local_root = (workspace / args.local_root).resolve()
    if not local_root.is_relative_to(workspace) or not local_root.is_dir():
        raise ValueError("The verified extraction must be inside the workspace")
    index_path = local_root / "audio-file-index.json"
    summary_path = local_root / "source-summary.json"
    index = json.loads(index_path.read_text())
    summary = json.loads(summary_path.read_text())
    if index.get("sourceId") != SOURCE_ID or summary.get("sourceId") != SOURCE_ID:
        raise ValueError("Unexpected source delivery")
    if index["summary"]["decodedFiles"] != 4034 or index["summary"]["originalAwbFiles"] != 43:
        raise ValueError("Expected the complete observed 43-bank / 4,034-stream delivery")
    if sha256(index_path) != summary["audioFileIndex"]["sha256"]:
        raise ValueError("Audio index changed after the source summary was frozen")
    for row in index["files"]:
        path = (local_root / row["path"]).resolve()
        if not path.is_relative_to(local_root) or not path.is_file():
            raise ValueError("Missing decoded file: " + row["path"])
        if path.stat().st_size != row["bytes"] or sha256(path) != row["sha256"]:
            raise ValueError("Decoded file changed: " + row["path"])
    originals = []
    for path in sorted((local_root / "original").glob("*.awb")):
        originals.append({
            "path": path.relative_to(local_root).as_posix(),
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
        })
    if len(originals) != 43 or sum(row["bytes"] for row in originals) != index["summary"]["originalAwbBytes"]:
        raise ValueError("Original AWB inventory is incomplete")

    rows_by_group = defaultdict(list)
    for row in index["files"]:
        rows_by_group[classify_group(row)].append(row)
    common_names = {
        "resident-bgm": "Resident BGM／常駐音樂",
        "resident-se": "Resident SE／常駐音效",
        "battle-res-se": "Battle Resident SE／戰鬥共用音效",
        "event-se": "Event SE／事件音效",
    }
    groups = []
    for group_id in sorted(rows_by_group):
        rows = rows_by_group[group_id]
        banks = sorted({row["sourceBank"] for row in rows})
        names = {row.get("nativeCharacterName") for row in rows if row.get("nativeCharacterName")}
        related = sorted({row.get("relatedExistingGroupId") for row in rows if row.get("relatedExistingGroupId")})
        native = group_id.startswith("chr")
        display_name = next(iter(names)) if len(names) == 1 else common_names.get(group_id, f"原生角色 ID {group_id}")
        categories = Counter(row["sourceCategory"] for row in rows)
        groups.append({
            "id": group_id,
            "label": display_name,
            "name": display_name,
            "characterName": display_name if native else None,
            "nativeCharacterId": group_id if native else None,
            "heroIds": [],
            "pathPrefixes": ["decoded/" + Path(bank).stem + "/" for bank in banks],
            "sourceGame": "JUMP FORCE",
            "sourcePlatform": "Windows (Steam)",
            "sourceFolder": "JUMP_FORCE/Content/Sound/Streaming",
            "sourceId": SOURCE_ID,
            "sourcePage": "https://store.steampowered.com/app/816020/",
            "author": "Spike Chunsoft / Bandai Namco Entertainment",
            "fileCount": len(rows),
            "durationSeconds": sum(row["durationSeconds"] for row in rows),
            "sourceCategoryCounts": dict(sorted(categories.items())),
            "relatedExistingGroupIds": related,
            "speakerReviewed": False,
            "languageReviewed": False,
            "transcriptReviewed": False,
            "synthesisReady": False,
            "note": "Native bank and chrNNNN labels only. Individual EventVoice streams may contain other speakers; language, dialogue, event and skill binding remain unreviewed.",
        })

    source = {
        "id": SOURCE_ID,
        "target": "JUMP FORCE Steam 原遊戲 Streaming 音訊（43 AWB／4,034 WAV）",
        "heroIds": [],
        "ownerEntryIds": [],
        "url": "https://store.steampowered.com/app/816020/",
        "uploader": "User-owned local Steam install exposed through read-only SMB",
        "format": "AFS2/AWB with CRI HCA; decoded PCM WAV",
        "accessStatus": "local-installed-game",
        "acquisitionStatus": "downloaded-verified",
        "readiness": "audio-decoded-pending-listening-review",
        "purchaseDecision": "no-purchase-user-owned-install",
        "defaultEligible": False,
        "resourceRole": "audio-supplement",
        "localPath": local_root.relative_to(workspace).as_posix(),
        "sourceGame": "JUMP FORCE",
        "platform": "Windows (Steam)",
        "appId": "816020",
        "buildId": "8523149",
        "selectionClass": "canonical-game",
        "discoveryChannel": "local-readonly-smb",
        "assetKinds": ["audio", "voice", "sound-effect", "music"],
        "publicationStatus": "local-only-awaiting-s3-upload",
        "files": originals,
        "backendIntegration": {
            "required": True,
            "state": "pending-listening-and-character-mapping",
            "selectionVerified": False,
        },
        "audioFileIndex": {
            "reportPath": "audio-file-index.json",
            "reportSha256": sha256(index_path),
        },
        "primaryAudioFormats": [".wav"],
        "audioGroups": groups,
        "audioAcquisition": index["summary"],
        "decoder": index["decoder"],
        "verification": "All 43 directly mounted AFS2/AWB banks were copied and SHA-256 verified. vgmstream r2117 decoded all 4,034 CRI HCA subsongs; every WAV has RIFF framing, sample metadata and SHA-256. Bank labels are not per-clip listening proof.",
        "limitations": [
            "The six encrypted Unreal PAK indexes remain unavailable without an authorized AES key; this source covers only the unencrypted Streaming directory.",
            "EvnVoice is a source label, not proof that every stream is single-speaker dialogue.",
            "Five native character IDs remain unresolved: chr0440, chr0490, chr0500, chr0510 and chr7000.",
            "No clip is language-, speaker-, transcript-, event- or GGD skill-binding verified.",
            "Registration in the audio catalog is not a backend character option or production deployment.",
        ],
    }
    downloads = json.loads(DOWNLOADS.read_text())
    matches = [row for collection in ("publicSources", "paidSources") for row in downloads.get(collection, []) if row["id"] == SOURCE_ID]
    if matches:
        if len(matches) != 1:
            raise ValueError("Source ID is duplicated across central collections")
        existing = matches[0]
        mutable_after_backup = {"publicationStatus", "pendingBackup", "backup", "verification"}
        existing_core = {key: value for key, value in existing.items() if key not in mutable_after_backup}
        source_core = {key: value for key, value in source.items() if key not in mutable_after_backup}
        if existing_core != source_core or not existing.get("verification", "").startswith(source["verification"]):
            raise ValueError("Existing source entry differs; do not overwrite another workflow")
        print(json.dumps({"sourceId": SOURCE_ID, "status": "already-integrated", "publicationStatus": existing["publicationStatus"]}, ensure_ascii=False))
        return
    downloads["publicSources"].append(source)
    DOWNLOADS.write_text(json.dumps(downloads, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({
        "sourceId": SOURCE_ID,
        "groups": len(groups),
        "files": len(index["files"]),
        "bytes": index["summary"]["decodedBytes"],
        "audioFileIndexSha256": sha256(index_path),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
