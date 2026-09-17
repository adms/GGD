#!/usr/bin/env python3
"""Pin all 14 FateUBW components and generate manual-only runtime options for mapped heroes."""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
BASE = ROOT / "materials/hero-model-library"
INVENTORY = BASE / "source-inventories/fate-assets-v2/inventory.json"
PLAN = Path(__file__).with_name("runtime-option-plan.json")
INPUTS = BASE / "priority-runtime-inputs.json"
MANIFEST = BASE / "priority-evidence/fateubw-community/runtime-components-v1/manifest.json"
REQUIRED = ("idle", "run", "attack", "cast", "hurt", "death")
PREFIX = "fateubw-"


def read(path: Path):
    return json.loads(path.read_text())


def sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def encode(value) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


def model_document(body_sha: str, clip_map: dict[str, str]) -> dict:
    payload = {
        "schema": "model@1",
        "glbPath": f"assets/models/community/{body_sha}.glb",
        "scale": 1,
        "collisionRadius": 0.6,
        "clipMap": clip_map,
        "yawOffsetDeg": 0,
    }
    identity = hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()[:48]
    return {"id": f"community.body.{identity}", **payload}


def put(path: Path, content: bytes, check: bool, replace: bool = False):
    if check:
        if not path.is_file() or path.read_bytes() != content:
            raise ValueError(f"generated Fate runtime payload is stale: {path}")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.read_bytes() != content and not replace:
        raise ValueError(f"refusing to overwrite different content: {path}")
    path.write_bytes(content)


def build(check: bool = False) -> dict:
    inventory, plan, inputs = read(INVENTORY), read(PLAN), read(INPUTS)
    rows = {row["characterId"]: row for row in inventory["minecraftCommunity"]["servants"]}
    configs = {row["characterId"]: row for row in plan["characters"]}
    if set(rows) != set(configs) or len(rows) != 14:
        raise ValueError("Fate runtime plan must cover exactly the 14 inventoried servants")
    if inventory["summary"]["hardPolicyPass"] != 14:
        raise ValueError("all 14 Fate models must pass the current hard policy")

    components, generated_entries = [], []
    for character_id in sorted(rows):
        row, config = rows[character_id], configs[character_id]
        source = Path(row["standardizedModelWithNativeMotion"]["absolutePath"])
        expected_sha = row["standardizedModelWithNativeMotion"]["sha256"]
        if not source.is_file() or sha(source) != expected_sha:
            raise ValueError(f"Fate source GLB drift: {character_id}")
        clip_map = config["clipMap"]
        if tuple(clip_map) != REQUIRED:
            raise ValueError(f"six-state key order/coverage drift: {character_id}")
        unknown = sorted(set(clip_map.values()) - set(row["convertedClipNames"]))
        if unknown:
            raise ValueError(f"clip map names absent from GLB inventory: {character_id}: {unknown}")

        doc = model_document(expected_sha, clip_map)
        doc_bytes = encode(doc)
        local_root = source.parent
        put(local_root / "model.json", doc_bytes, check, replace=True)
        git_glb = ROOT / "content" / doc["glbPath"]
        git_doc = ROOT / "content/models" / f"{doc['id']}.json"
        put(git_glb, source.read_bytes(), check)
        put(git_doc, doc_bytes, check)
        common = {
            "candidateId": f"{PREFIX}{character_id}-native-fallback-v1",
            "name": row["authorLabel"],
            "label": f"{row['authorLabel']}｜FateUBW 社群模型＋來源動作",
            "localRuntimeRoot": str(local_root),
            "sha256": expected_sha,
            "documentSha256": hashlib.sha256(doc_bytes).hexdigest(),
            "nativeAnimationCount": row["convertedNativeClipCount"],
            "proceduralAnimationCount": 0,
            "automaticEligible": False,
            "source": {
                "kind": "exact",
                "tier": "original",
                "selectionClass": "community-mod",
                "library": "Fate/Unlimited Block Works",
                "character": row["authorLabel"],
                "work": config["work"],
                "reference": plan["sourceUrl"],
                "sourceGame": "Fate/Unlimited Block Works",
                "sourcePlatform": "Minecraft Java 1.21.1"
            },
            "limitations": [
                "Six runtime states map to existing same-source clips; semantic fallbacks are not native event labels.",
                "Where death reuses hurt/impact, runtime may apply the owner-approved hurt plus fade presentation.",
                "Project owner approved registration on 2026-09-15; upstream repository remains recorded as ARR.",
                "Candidate-only registration preserves existing manual and automatic defaults."
            ],
            "validation": "14-of-14 current-hard-policy-pass; source-and-git-sha256-equal; clip-names-in-glb-inventory"
        }
        for hero_id in row["heroIds"]:
            generated_entries.append({**common, "heroId": hero_id})
        components.append({
            "characterId": character_id,
            "authorLabel": row["authorLabel"],
            "heroIds": row["heroIds"],
            "sourceId": inventory["minecraftCommunity"]["sourceId"],
            "upstreamLicense": inventory["minecraftCommunity"]["license"],
            "projectApproval": plan["projectApproval"],
            "modelKey": doc["id"],
            "clipMap": clip_map,
            "motionSemantics": plan["semanticPolicy"],
            "nativeAnimationCount": row["convertedNativeClipCount"],
            "glb": {"gitPath": git_glb.relative_to(ROOT).as_posix(), "bytes": source.stat().st_size, "sha256": expected_sha},
            "modelDocument": {"gitPath": git_doc.relative_to(ROOT).as_posix(), "bytes": len(doc_bytes), "sha256": hashlib.sha256(doc_bytes).hexdigest()},
            "runtimeCandidate": bool(row["heroIds"]),
            "defaultEligible": False,
            "productionDeploymentVerified": False
        })

    retained = [row for row in inputs["entries"] if not row.get("candidateId", "").startswith(PREFIX)]
    output_inputs = {**inputs, "entries": retained + generated_entries}
    put(INPUTS, encode(output_inputs), check, replace=True)
    manifest = {
        "schema": "ggd.fateubw-runtime-components@1",
        "sourceId": inventory["minecraftCommunity"]["sourceId"],
        "sourceGame": inventory["minecraftCommunity"]["sourceGame"],
        "platform": inventory["minecraftCommunity"]["platform"],
        "upstreamLicense": inventory["minecraftCommunity"]["license"],
        "projectApproval": plan["projectApproval"],
        "semanticPolicy": plan["semanticPolicy"],
        "summary": {
            "componentsPinnedToGit": len(components),
            "mappedCharacters": sum(bool(row["heroIds"]) for row in components),
            "mappedHeroIds": sum(len(row["heroIds"]) for row in components),
            "unmappedCharacters": sum(not row["heroIds"] for row in components),
            "hardPolicyPass": 14,
            "nativeClipsRetained": sum(row["nativeAnimationCount"] for row in components),
            "sixStateMapsComplete": len(components),
            "defaultEligible": 0,
            "productionDeployed": 0
        },
        "components": components,
        "registrationCommands": [
            ["node", "--import", "tsx", "tools/hero-model-library/register-one-source-option.mts", row["heroId"], f"runtime:{row['candidateId']}"]
            for row in generated_entries
        ]
    }
    put(MANIFEST, encode(manifest), check, replace=True)
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    result = build(args.check)
    print(json.dumps(result["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
