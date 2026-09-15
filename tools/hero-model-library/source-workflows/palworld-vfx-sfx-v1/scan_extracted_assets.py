#!/usr/bin/env python3
"""Read-only scan of an extracted Palworld tree or package-list text.

The scanner never opens PAK/IoStore containers or discovers encryption keys.  It
classifies files already exposed by an owner-provided extraction/listing, hashes
matched real files, and keeps weak filename matches pending for manual review.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
from pathlib import Path


HERE = Path(__file__).resolve().parent
CONFIG = json.loads((HERE / "source-config.json").read_text())
AUDIO_EXTENSIONS = {".wem", ".bnk", ".wav", ".ogg", ".mp3", ".flac"}
UE_EXTENSIONS = {".uasset", ".uexp", ".ubulk", ".umap"}
VFX_MARKERS = ("/effect/", "/effects/", "/vfx/", "/fx/", "/niagara/", "niagara", "particle")
AUDIO_MARKERS = ("/wwiseaudio/", "/sound/", "/audio/", "/se/", "/sfx/")


def sha256(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def iter_rows(root: Path | None, package_list: Path | None):
    if root:
        for base, dirs, files in os.walk(root):
            dirs.sort()
            files.sort()
            for name in files:
                path = Path(base) / name
                yield path.relative_to(root).as_posix(), path
    if package_list:
        for raw in package_list.read_text(errors="replace").splitlines():
            match = re.search(r"(?:Pal/|Engine/)[^\s\"']+", raw.replace("\\", "/"))
            if match:
                yield match.group(0).rstrip(",)]}"), None


def classify(relative: str, path: Path | None):
    lower = "/" + relative.lower()
    suffix = Path(relative).suffix.lower()
    character_hits = []
    exact_skill_hits = []
    for character in CONFIG["characters"]:
        tokens = [character["nativeId"], *character["packageTokens"]]
        if any(token.lower() in lower for token in tokens):
            character_hits.append(character["id"])
        for skill in character.get("skills", []):
            if skill["code"].lower() in lower:
                exact_skill_hits.append(skill["code"])
    if not character_hits and not exact_skill_hits:
        return None
    if suffix in AUDIO_EXTENSIONS or any(marker in lower for marker in AUDIO_MARKERS):
        kind = "audio-candidate"
    elif any(marker in lower for marker in VFX_MARKERS):
        kind = "vfx-candidate"
    elif suffix in UE_EXTENSIONS:
        kind = "unreal-dependency-candidate"
    else:
        return None
    row = {
        "relativePath": relative,
        "kind": kind,
        "characterIds": sorted(set(character_hits)),
        "exactSkillCodeMatches": sorted(set(exact_skill_hits)),
        "relationshipConfidence": "exact-skill-code-path" if exact_skill_hits else "character-token-path-only",
        "ownerReviewStatus": "pending",
        "runtimeBinding": False,
    }
    if path and path.is_file():
        row.update(bytes=path.stat().st_size, sha256=sha256(path), absolutePath=str(path.resolve()))
    else:
        row.update(bytes=None, sha256=None, absolutePath=None)
    return row


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, help="Already extracted Palworld asset root")
    parser.add_argument("--package-list", type=Path, help="Owner-provided Unreal package list")
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if not args.root and not args.package_list:
        parser.error("provide --root and/or --package-list")
    if args.root and not args.root.is_dir():
        parser.error(f"missing root: {args.root}")
    if args.package_list and not args.package_list.is_file():
        parser.error(f"missing package list: {args.package_list}")

    config = json.loads((HERE / "source-config.json").read_text())
    settings = json.loads((HERE.parents[3] / "materials/hero-model-library/palworld/character-settings.json").read_text())
    by_name = {row["nameEn"]: row for row in config["characters"]}
    for form in settings["forms"]:
        character = by_name.get(form["character"])
        if character is None:
            continue
        for skill in form["activeSkills"]:
            if not any(row.get("code") == skill["code"] for row in character.setdefault("skills", [])):
                character["skills"].append({"code": skill["code"], "name": skill["name"]})
    global CONFIG
    CONFIG = config

    seen = set()
    rows = []
    for relative, path in iter_rows(args.root, args.package_list):
        key = relative.lower()
        if key in seen:
            continue
        seen.add(key)
        row = classify(relative, path)
        if row:
            rows.append(row)
    rows.sort(key=lambda row: (row["kind"], row["relativePath"].lower()))
    result = {
        "schema": "ggd.palworld-vfx-sfx-extracted-scan@1",
        "sourceId": config["sourceId"],
        "inputs": {
            "root": str(args.root.resolve()) if args.root else None,
            "packageList": str(args.package_list.resolve()) if args.package_list else None,
            "packageListSha256": sha256(args.package_list) if args.package_list else None,
        },
        "summary": {
            "enumeratedPaths": len(seen),
            "matchedFiles": len(rows),
            "vfxCandidates": sum(row["kind"] == "vfx-candidate" for row in rows),
            "audioCandidates": sum(row["kind"] == "audio-candidate" for row in rows),
            "dependencyCandidates": sum(row["kind"] == "unreal-dependency-candidate" for row in rows),
            "approvedForRuntimeBinding": 0,
        },
        "candidates": rows,
        "limits": [
            "A path match is a review candidate, not proof of a rendered effect or audible skill event.",
            "Numeric Wwise media requires event-bank mapping and listening review before a skill binding.",
            "The scanner does not decrypt or extract Unreal containers.",
        ],
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(result["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
