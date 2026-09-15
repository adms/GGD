#!/usr/bin/env python3
"""Register exact JUMP FORCE character-family audio source relationships.

This only adds source-level hero relationships.  It deliberately does not
approve a speaker, language, line, event, skill, runtime binding, or backend
selection.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


REPO = Path(__file__).resolve().parents[4]
CHARACTER_MAP = REPO / "tools/hero-model-library/source-workflows/jumpforce-steam-streaming-audio-v1/character-map.json"
BINDING_AUTHORITY = REPO / "tools/hero-model-library/source-workflows/jump-force-full-roster-v1/audio-hero-bindings.json"
DOWNLOADS = REPO / "materials/hero-model-library/download-sources.json"
OUT = REPO / "materials/hero-model-library/priority-evidence/jump-force-full-roster-v1/audio-identity-bindings.json"
STEAM_SOURCE_ID = "steam-jump-force-streaming-audio-816020-build-8523149"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_champions(repo: Path) -> dict[str, dict]:
    result: dict[str, dict] = {}
    for path in sorted((repo / "content/champions").glob("*.json")):
        row = json.loads(path.read_text(encoding="utf-8"))
        hero_id = row.get("id")
        if hero_id:
            if hero_id in result:
                raise ValueError(f"duplicate champion id: {hero_id}")
            result[hero_id] = {"name": row.get("name"), "gitPath": path.relative_to(repo).as_posix(), "sha256": sha256(path)}
    return result


def locate_source(sources: list[dict], source_id: str) -> dict:
    matches = [row for row in sources if row.get("id") == source_id]
    if len(matches) != 1:
        raise ValueError(f"expected one JUMP FORCE source {source_id}, got {len(matches)}")
    return matches[0]


def locate_group(source: dict, group_id: str) -> dict:
    matches = [row for row in source.get("audioGroups", []) if row.get("id") == group_id]
    if len(matches) != 1:
        raise ValueError(f"expected one audio group {source['id']}:{group_id}, got {len(matches)}")
    return matches[0]


def build(repo: Path = REPO) -> tuple[dict, dict]:
    character_map_path = repo / CHARACTER_MAP.relative_to(REPO)
    binding_authority_path = repo / BINDING_AUTHORITY.relative_to(REPO)
    downloads_path = repo / DOWNLOADS.relative_to(REPO)
    character_map = json.loads(character_map_path.read_text(encoding="utf-8"))
    binding_authority = json.loads(binding_authority_path.read_text(encoding="utf-8"))
    if binding_authority.get("schema") != "ggd.jumpforce-explicit-audio-hero-bindings@1":
        raise ValueError("unexpected JUMP FORCE audio binding authority")
    downloads = json.loads(downloads_path.read_text(encoding="utf-8"))
    champions = load_champions(repo)
    sources = downloads.get("publicSources", [])
    steam = locate_source(sources, STEAM_SOURCE_ID)
    bindings = []

    steam_groups_bound = 0
    for mapping in binding_authority.get("bindings", []):
        native_id = mapping["nativeCharacterId"]
        native_suffix = native_id.removeprefix("chr")
        hero_ids = mapping["heroIds"]
        if len(hero_ids) != len(set(hero_ids)):
            raise ValueError(f"duplicate hero id in chr{native_suffix}")
        hero_rows = []
        for hero_id in hero_ids:
            if hero_id not in champions:
                raise ValueError(f"unknown hero id {hero_id} for chr{native_suffix}")
            hero_rows.append({"heroId": hero_id, **champions[hero_id]})

        source_id, group_id = mapping["sourceGroupId"].split(":", 1)
        public_source = locate_source(sources, source_id)
        public_group = locate_group(public_source, group_id)
        public_file_count = public_group.get("fileCount")
        if not isinstance(public_file_count, int) or public_file_count <= 0:
            raise ValueError(f"public audio group lacks a positive file count: {mapping['sourceGroupId']}")
        expected_name = mapping["characterName"]
        labels = [public_group.get("characterName") or public_group.get("name") or ""]
        steam_group = None
        loose_mapping = character_map.get("characters", {}).get(native_suffix)
        if loose_mapping is not None:
            if loose_mapping.get("existingGroupId") != mapping["sourceGroupId"] or loose_mapping.get("heroIds") != hero_ids:
                raise ValueError(f"loose Streaming character map differs from binding authority for {native_id}")
            steam_group = locate_group(steam, native_id)
            if not isinstance(steam_group.get("fileCount"), int) or steam_group["fileCount"] <= 0:
                raise ValueError(f"Steam loose audio group lacks a positive file count: {native_id}")
            labels.append(steam_group.get("characterName") or steam_group.get("name") or "")
            steam_groups_bound += 1
        for label in labels:
            if expected_name.casefold() not in label.casefold():
                raise ValueError(f"character label mismatch for {native_id}: {label!r}")

        public_group["heroIds"] = list(hero_ids)
        affected_sources = [public_source]
        source_groups = [mapping["sourceGroupId"]]
        if steam_group is not None:
            steam_group["heroIds"] = list(hero_ids)
            affected_sources.append(steam)
            source_groups.append(f"{STEAM_SOURCE_ID}:{native_id}")
        for source in affected_sources:
            backend = source.setdefault("backendIntegration", {})
            backend["heroIds"] = sorted(set(backend.get("heroIds", [])) | set(hero_ids))

        bindings.append({
            "nativeCharacterId": native_id,
            "characterName": mapping["characterName"],
            "heroIds": list(hero_ids),
            "heroes": hero_rows,
            "sourceGroups": source_groups,
            "publicPackageFiles": public_file_count,
            "steamLooseFiles": steam_group["fileCount"] if steam_group is not None else 0,
            "relationship": "verified-character-family-source-association",
            "clipSpeakerApproved": False,
            "clipLanguageApproved": False,
            "eventBindingApproved": False,
            "runtimeBindingCreated": False,
        })

    receipt = {
        "schema": "ggd.jumpforce-audio-identity-bindings@1",
        "asOfDate": "2026-09-15",
        "sourceId": "jump-force-full-roster-v1",
        "inputs": {
            "characterMap": {
                "gitPath": character_map_path.relative_to(repo).as_posix(),
                "sha256": sha256(character_map_path),
            },
            "bindingAuthority": {
                "gitPath": binding_authority_path.relative_to(repo).as_posix(),
                "sha256": sha256(binding_authority_path),
            },
            "championDefinitions": sorted({hero["gitPath"]: {"gitPath": hero["gitPath"], "sha256": hero["sha256"]} for row in bindings for hero in row["heroes"]}.values(), key=lambda row: row["gitPath"]),
        },
        "summary": {
            "nativeCharacterGroupsBound": len(bindings),
            "distinctHeroIds": len({hero_id for row in bindings for hero_id in row["heroIds"]}),
            "publicPackageGroupsBound": len(bindings),
            "steamLooseGroupsBound": steam_groups_bound,
            "sourceGroupRelationshipsUpdated": sum(len(row["sourceGroups"]) for row in bindings),
            "publicPackageAudioFilesLinked": sum(row["publicPackageFiles"] for row in bindings),
            "steamLooseAudioFilesLinked": sum(row["steamLooseFiles"] for row in bindings),
            "speakerApprovedClips": 0,
            "eventBindingsCreated": 0,
            "runtimeBindingsCreated": 0,
            "backendOptionsAdded": 0,
            "productionDeployments": 0,
        },
        "bindings": bindings,
        "stageBoundary": {
            "sourceCharacterFamilyAssociation": "completed-for-listed-bindings",
            "clipListeningReview": "pending",
            "speakerAndLanguageVerification": "pending",
            "eventAndSkillBinding": "not-started",
            "runtimeSelectable": False,
            "productionDeployed": False,
        },
    }
    return downloads, receipt


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--check", action="store_true")
    args = parser.parse_args()
    downloads, receipt = build()
    expected_downloads = json.dumps(downloads, ensure_ascii=False, indent=2) + "\n"
    expected_receipt = json.dumps(receipt, ensure_ascii=False, indent=2) + "\n"
    if args.write:
        DOWNLOADS.write_text(expected_downloads, encoding="utf-8")
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(expected_receipt, encoding="utf-8")
    else:
        if DOWNLOADS.read_text(encoding="utf-8") != expected_downloads:
            raise SystemExit(f"stale JUMP FORCE audio source bindings: {DOWNLOADS}")
        if not OUT.is_file() or OUT.read_text(encoding="utf-8") != expected_receipt:
            raise SystemExit(f"stale JUMP FORCE binding receipt: {OUT}")
    print(json.dumps(receipt["summary"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
