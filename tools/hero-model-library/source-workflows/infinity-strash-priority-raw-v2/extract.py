#!/usr/bin/env python3
"""Extract and inventory priority Infinity Strash assets from an authorized local PAK."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


SCHEMA = "ggd-infinity-strash-priority-raw-extraction@1"
SOURCE_ID = "steam-infinity-strash-priority-original-assets-build-local-20240328"
IDENTITIES = {
    "PN010": {"nameZh": "小呆／達伊", "originalName": "Dai", "identityState": "confirmed-native-id"},
    "EN801": {"nameZh": "巴恩大魔王", "originalName": "Vearn", "identityState": "confirmed-native-id-form-pending-visual-review"},
    "EN653": {"nameZh": "密斯特巴恩", "originalName": "MystVearn", "identityState": "confirmed-separate-character-do-not-merge-with-vearn"},
}
IDENTITY_PATTERN = re.compile(
    r"(?<![A-Za-z0-9])(" + "|".join(re.escape(identity) for identity in IDENTITIES) + r")(?![A-Za-z0-9])",
    re.IGNORECASE,
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def select(paths: list[str]) -> list[str]:
    return sorted({path for path in paths if IDENTITY_PATTERN.search(path)})


def classify(path: str) -> str:
    lower = path.lower()
    if "/wwiseaudio/" in lower:
        return "audio-event-or-audio-package"
    if "/animations/" in lower or "/animinplace/" in lower or "/cinematics/" in lower:
        return "animation-or-cinematic"
    if "/vfx/" in lower or "effect" in lower:
        return "vfx"
    if Path(path).suffix.lower() == ".ubulk" or "/materials/" in lower:
        return "texture-or-material"
    if "/chara/" in lower:
        return "character-model-or-configuration"
    return "related-package"


def identity_for(path: str) -> str:
    matches = {match.upper() for match in IDENTITY_PATTERN.findall(path)}
    return next(iter(matches)) if len(matches) == 1 else "multiple-or-unresolved"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pak", type=Path, required=True)
    parser.add_argument("--repak", type=Path, required=True)
    parser.add_argument("--extractor", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    pak, repak, extractor, output = (value.resolve() for value in (args.pak, args.repak, args.extractor, args.output))
    if output.exists():
        raise ValueError("output must be new so the extraction stage remains immutable")
    for executable in (repak, extractor):
        if not executable.is_file():
            raise ValueError(f"missing executable: {executable}")
    output.mkdir(parents=True)
    listing = subprocess.run([str(repak), "list", str(pak)], check=True, capture_output=True, text=True).stdout.splitlines()
    chosen = select(listing)
    if not chosen:
        raise ValueError("selection matched no files")
    manifest_path = output / "selected-paths.txt"
    manifest_path.write_text("\n".join(chosen) + "\n", encoding="utf-8")
    raw_root = output / "raw"
    command = [str(extractor), str(pak), str(manifest_path), str(raw_root)]
    progress_lines = []
    process = subprocess.Popen(command, stdout=subprocess.PIPE, text=True)
    assert process.stdout is not None
    for line in process.stdout:
        line = line.rstrip("\n")
        progress_lines.append(line)
        print(line, flush=True)
    if process.wait() != 0:
        raise subprocess.CalledProcessError(process.returncode, command)

    files = []
    for path in sorted(raw_root.rglob("*")):
        if not path.is_file():
            continue
        relative = path.relative_to(raw_root).as_posix()
        files.append({
            "path": relative,
            "absolutePath": str(path),
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
            "identityId": identity_for(relative),
            "category": classify(relative),
        })
    if [row["path"] for row in files] != chosen:
        raise ValueError("extracted path set differs from the selected PAK index entries")
    summary = {
        "schema": SCHEMA,
        "sourceId": SOURCE_ID,
        "sourceWork": "Infinity Strash 勇者鬥惡龍 達伊的大冒險",
        "sourcePlatform": "Windows Steam installation via user-authorized read-only SMB share",
        "sourceAccess": "read-only",
        "sourcePak": {"path": str(pak), "bytes": pak.stat().st_size, "sha256": sha256(pak)},
        "tools": {
            "repak": {"path": str(repak), "sha256": sha256(repak)},
            "prefixExtractor": {"path": str(extractor), "sha256": sha256(extractor)},
        },
        "selection": {"nativeIdTokens": list(IDENTITIES), "pakEntries": len(listing), "selectedEntries": len(chosen)},
        "identities": IDENTITIES,
        "files": files,
        "countsByIdentity": dict(sorted(Counter(row["identityId"] for row in files).items())),
        "countsByCategory": dict(sorted(Counter(row["category"] for row in files).items())),
        "totalBytes": sum(row["bytes"] for row in files),
        "extractionCommand": command,
        "extractorOutput": "\n".join(progress_lines),
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "states": {
            "acquired": True,
            "pakIndexRead": True,
            "rawSelectedPackagesExtracted": True,
            "modelConverted": False,
            "visuallyAccepted": False,
            "heroRegistered": False,
            "backendSelectable": False,
            "deployed": False,
        },
        "gaps": [
            "EN801 is confirmed as Vearn, but this record does not decide whether its body is the pre- or post-transformation form.",
            "EN653 is MystVearn and remains a separate identity; it is never counted as Vearn merely because the names are related.",
            "Wwise event packages do not by themselves prove the corresponding numeric Media packages or decoded speech clips.",
            "Raw Unreal packages still require the game-specific UE4.26 exporter, conversion, dependency review and visual acceptance.",
        ],
    }
    (output / "extraction-index.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(output), "selectedEntries": len(chosen), "totalBytes": summary["totalBytes"], "countsByIdentity": summary["countsByIdentity"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
