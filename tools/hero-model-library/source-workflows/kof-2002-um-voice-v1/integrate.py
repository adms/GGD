#!/usr/bin/env python3
"""Register the verified local KOF 2002 UM voice extraction as an audio source."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


REPO = Path(__file__).resolve().parents[4]
DOWNLOADS = REPO / "materials/hero-model-library/download-sources.json"
SOURCE_ID = "steam-kof2002um-voice-dat-222440-build-8463197"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def source_record(workspace: Path) -> dict:
    local_root = workspace / "GGD-Asset-Library/extracted/kof-2002-um-voice-v1"
    manifest_path = local_root / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    if manifest.get("schema") != "ggd-kof2002um-voice-dat-extraction@1":
        raise ValueError("unexpected extraction manifest")
    if manifest.get("fileCount") != 2687 or manifest.get("identityStatus") != "language-speaker-event-pending-confirmation":
        raise ValueError("extraction scope or review status changed")
    source_path = Path(manifest["sourcePath"])
    if not source_path.is_file() or source_path.stat().st_size != manifest["sourceBytes"] or sha256(source_path) != manifest["sourceSha256"]:
        raise ValueError("mounted source container no longer matches extraction manifest")
    for row in manifest["files"]:
        local = local_root / row["path"]
        if not local.is_file() or local.stat().st_size != row["riffBytes"] or sha256(local) != row["sha256"]:
            raise ValueError("extracted RIFF changed: " + row["path"])
    return {
        "id": SOURCE_ID,
        "target": "KOF 2002 UM／voice.dat 全容器語音記錄",
        "heroIds": [],
        "ownerEntryIds": [],
        "url": "https://store.steampowered.com/app/222440/",
        "uploader": "User-owned local Steam install exposed through read-only SMB",
        "format": "length-prefixed RIFF/WAVE",
        "accessStatus": "local-installed-game",
        "acquisitionStatus": "downloaded-verified",
        "readiness": "audio-intake-pending-listening-review",
        "purchaseDecision": "no-purchase-user-owned-install",
        "defaultEligible": False,
        "resourceRole": "audio-supplement",
        "localPath": "GGD-Asset-Library/extracted/kof-2002-um-voice-v1",
        "sourceGame": "THE KING OF FIGHTERS 2002 UNLIMITED MATCH",
        "platform": "Windows (Steam)",
        "appId": "222440",
        "buildId": "8463197",
        "selectionClass": "canonical-game",
        "discoveryChannel": "local-readonly-smb",
        "assetKinds": ["audio", "voice"],
        "publicationStatus": "local-verified-s3-pending",
        "files": [],
        "backendIntegration": {"required": True, "state": "pending-listening-and-character-mapping", "selectionVerified": False},
        "audioFileIndex": {"reportPath": "manifest.json", "reportSha256": sha256(manifest_path)},
        "primaryAudioFormats": [".wav"],
        "audioCategory": "voice-source-label-unreviewed",
        "audioAcquisition": {
            "sourceContainer": "Data/game/voice.dat",
            "sourceBytes": manifest["sourceBytes"],
            "sourceSha256": manifest["sourceSha256"],
            "riffWavCount": manifest["fileCount"],
            "extractedBytes": manifest["totalExtractedBytes"],
        },
        "verification": "voice.dat was parsed to its exact end as 2,687 length-prefixed RIFF/WAVE records; every extracted RIFF has a SHA-256 and audio metadata. Language, speaker, dialogue/SFX classification, and gameplay event remain pending listening review.",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, default=REPO.parent)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    expected = source_record(args.workspace.resolve())
    document = json.loads(DOWNLOADS.read_text())
    matches = [row for row in document.get("publicSources", []) if row.get("id") == SOURCE_ID]
    if args.check:
        if len(matches) != 1:
            raise SystemExit("central KOF 2002 UM voice source is missing or stale")
        current = dict(matches[0])
        backup = current.pop("backup", None)
        if backup:
            if not all(backup.get(key) is True for key in ("readbackVerified", "fullReadbackVerified", "s3ReadbackVerified")):
                raise SystemExit("central KOF 2002 UM backup is not fully verified")
            current["publicationStatus"] = "local-verified-s3-pending"
        if current != expected:
            raise SystemExit("central KOF 2002 UM voice source is missing or stale")
        print(json.dumps({"sourceId": SOURCE_ID, "status": "current", "fileCount": 2687}))
        return
    if len(matches) > 1:
        raise ValueError("duplicate central source id")
    if matches:
        preserved = {key: matches[0][key] for key in ("backup",) if key in matches[0]}
        matches[0].clear()
        matches[0].update(expected)
        matches[0].update(preserved)
        if preserved.get("backup"):
            matches[0]["publicationStatus"] = "s3-readback-verified"
    else:
        document.setdefault("publicSources", []).append(expected)
    DOWNLOADS.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"sourceId": SOURCE_ID, "status": "registered-local-s3-pending", "fileCount": 2687}))


if __name__ == "__main__":
    main()
