#!/usr/bin/env python3
"""Build the reproducible inventory for Gintoki, Gon and Killua priority work.

This scanner does not infer missing J-Stars IDs and does not turn fallback
assets into J-Stars assets.  It records exact local files, hashes and stage
boundaries so a later owner archive can resume extraction without redoing the
already verified fallbacks.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
WORKSPACE = REPO.parent
ASSET_ROOT = WORKSPACE / "GGD-Asset-Library"
OUTPUT = REPO / "materials/hero-model-library/source-inventories/jstars-priority-gintoki-gon-killua-v1"
REFERENCE = HERE / "source-reference.json"
VALIDATION = OUTPUT / "model-validation.json"
OWNER_RECEIPT = REPO / "materials/hero-model-library/source-inventories/jstars-owner-archive-extract-v1/receipt.json"
CPK_INVENTORY = REPO / "materials/hero-model-library/source-inventories/jstars-owner-archive-extract-v1/cpk-inventory.json"
JSTARS_ANALYSIS = REPO / "materials/hero-model-library/source-inventories/jstars-stpk-research-v1/analysis.json"
JUMP_IDENTITY = REPO / "materials/hero-model-library/source-inventories/kof-jump-container-coverage-v1/identity-map.json"


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected JSON object: {path}")
    return value


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def file_record(path: Path, root: Path | None = None) -> dict[str, Any]:
    return {
        "path": path.relative_to(root).as_posix() if root else str(path.resolve()),
        "absolutePath": str(path.resolve()),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def list_files(root: Path, suffixes: tuple[str, ...] | None = None) -> list[dict[str, Any]]:
    if not root.is_dir():
        return []
    files = []
    for path in sorted((item for item in root.rglob("*") if item.is_file()), key=lambda p: p.as_posix().casefold()):
        if suffixes and path.suffix.casefold() not in suffixes:
            continue
        files.append(file_record(path, root))
    return files


def file_index(files: list[dict[str, Any]]) -> dict[str, Any]:
    encoded = "".join(
        json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"
        for row in files
    ).encode("utf-8")
    return {
        "files": len(files),
        "bytes": sum(int(row["bytes"]) for row in files),
        "sha256": hashlib.sha256(encoded).hexdigest(),
    }


def exact_archive_candidates(reference: dict[str, Any]) -> list[dict[str, Any]]:
    name = reference["ownerArchiveFileName"]
    candidates = [
        ASSET_ROOT / "intake/owner-jstars-victory-vs-plus-20260917" / name,
        Path.home() / "Downloads" / name,
        Path.home() / "Desktop" / name,
        Path.home() / name,
    ]
    return [file_record(path) for path in candidates if path.is_file()]


def jstars_killua_source() -> dict[str, Any]:
    analysis = read_json(JSTARS_ANALYSIS)
    killua = next(row for row in analysis["characters"] if row.get("nativeCharacterId") == "018")
    root = Path(analysis["conversionOutput"]) / "killua"
    files = list_files(root)
    by_suffix: dict[str, int] = {}
    for row in files:
        suffix = Path(row["path"]).suffix.casefold() or "no-extension"
        by_suffix[suffix] = by_suffix.get(suffix, 0) + 1
    owner_cpk = read_json(CPK_INVENTORY)
    owner_row = next(row for row in owner_cpk["priorityCharacters"] if row.get("slug") == "killua")
    return {
        "sourceId": analysis["sourceId"],
        "nativeCharacterId": "018",
        "identityStatus": killua["identityStatus"],
        "conversionRoot": str(root.resolve()),
        "files": files,
        "fileTypeCounts": dict(sorted(by_suffix.items())),
        "ownerDiscCpkEvidence": {
            "receipt": str(CPK_INVENTORY.relative_to(REPO)),
            "memberCount": owner_row["memberCount"],
            "memberEvidence": owner_row.get("memberEvidence"),
            "moduleCounts": owner_row["moduleCounts"],
            "fullMemberManifest": owner_cpk["fullMemberManifest"],
        },
        "stage": {
            "sourceObserved": True,
            "extracted": True,
            "converted": False,
            "validated": False,
            "registered": False,
            "deployed": False,
        },
        "blockers": [
            "$CH0 decoding is not validated for the compressed PAK source",
            "PS3 SRD/SRDI/SRDV geometry, texture and skin conversion is not validated",
            "owner-disc motion/VFX/SFX/voice containers are hashed but not decoded, event-mapped or owner-reviewed",
        ],
    }


def owner_disc_priority_sources(slugs: set[str]) -> dict[str, Any]:
    owner_cpk = read_json(CPK_INVENTORY)
    return {
        str(row["slug"]): {
            "nativeId": row["nativeId"],
            "identityStatus": row["identityStatus"],
            "memberCount": row["memberCount"],
            "moduleCounts": row["moduleCounts"],
            "memberEvidence": row.get("memberEvidence"),
            "runtimeReady": False,
            "conversionStatus": row["conversionStatus"],
        }
        for row in owner_cpk["priorityCharacters"]
        if row.get("slug") in slugs
    }


def jump_audio(slug: str, native_id: str) -> dict[str, Any]:
    package_root = ASSET_ROOT / "intake/public-models-20260910/parallel-ps-jumpforce-audio-remaining" / f"JForce_{'Gon' if slug == 'gon' else 'Killua'}" / "extracted"
    package_files = list_files(package_root, (".ogg",))
    decoded_root = ASSET_ROOT / "extracted/jumpforce-steam-streaming-audio-v1/decoded" / f"13{native_id[3:]}_{native_id}_EvnVoice"
    decoded_files = list_files(decoded_root, (".wav",))
    kinds: dict[str, int] = {}
    for row in package_files:
        kind = "sfx" if "ActSE/" in row["path"] else "voice-candidate"
        kinds[kind] = kinds.get(kind, 0) + 1
    return {
        "sourceGame": "JUMP FORCE",
        "nativeCharacterId": native_id,
        "packageRoot": str(package_root.resolve()),
        "decodedEventVoiceRoot": str(decoded_root.resolve()),
        "packageFileIndex": file_index(package_files),
        "decodedEventVoiceFileIndex": file_index(decoded_files),
        "counts": {"packageOgg": len(package_files), "decodedEventVoiceWav": len(decoded_files), **kinds},
        "stage": "decoded-and-hashed-pending-per-file-listening-review",
        "runtimeBound": False,
        "ownerApproved": False,
    }


def jump_identity_token(native_id: str) -> dict[str, Any]:
    data = read_json(JUMP_IDENTITY)
    return next(row for row in data["tokens"] if row.get("nativeCharacterIdToken") == native_id)


def character_rows(reference: dict[str, Any], validation: dict[str, Any]) -> list[dict[str, Any]]:
    validated = {row["id"]: row for row in validation["models"]}
    rows: list[dict[str, Any]] = []
    for target in reference["characters"]:
        slug = target["slug"]
        if slug == "gintoki":
            model = validated["gintoki-current-300-exact"]
            modules = {
                "model": {"status": "existing-registered-fallback", "source": "300英雄", "evidence": model},
                "skeleton": {"status": "existing-validated-fallback", "jointCounts": model["metrics"]["joints"]},
                "motion": {"status": "existing-native-fallback", "clipCount": model["metrics"]["clipCount"], "clipNames": model["metrics"]["clipNames"], "stateMap": model["stateMap"]},
                "vfx": {"status": "jstars-source-not-observed"},
                "sfx": {"status": "jstars-source-not-observed"},
                "voice": {"status": "jstars-source-not-observed"},
            }
        elif slug == "gon":
            model = validated["gon-thunderstore-static"]
            token = jump_identity_token("chr0300")
            audio = jump_audio("gon", "chr0300")
            modules = {
                "model": {"status": "community-static-fallback-converted-unregistered", "source": "Thunderstore community mod", "evidence": model},
                "skeleton": {"status": "community-fallback-validated", "jointCounts": model["metrics"]["joints"]},
                "motion": {"status": "missing", "reason": "fallback GLB has zero clips and no J-Stars motion container is observed"},
                "vfx": {"status": "jump-force-path-indexed-not-extracted", "candidate": token["assetClassCandidates"]["vfx"]},
                "sfx": {"status": "no-character-sfx-in-decoded-package"},
                "voice": {"status": "jump-force-decoded-pending-owner-review", "audio": audio},
            }
        else:
            model = validated["killua-current-300-exact"]
            token = jump_identity_token("chr0310")
            audio = jump_audio("killua", "chr0310")
            modules = {
                "model": {"status": "jstars-source-extracted-conversion-blocked; existing-300-fallback-registered", "source": "J-Stars sample plus 300英雄 fallback", "evidence": model},
                "skeleton": {"status": "existing-300-fallback-validated; jstars-skin-conversion-blocked", "jointCounts": model["metrics"]["joints"]},
                "motion": {"status": "existing-native-fallback", "clipCount": model["metrics"]["clipCount"], "clipNames": model["metrics"]["clipNames"], "stateMap": model["stateMap"]},
                "vfx": {"status": "jstars-embedded-member-and-jump-force-path-indexed-unvalidated", "candidate": token["assetClassCandidates"]["vfx"]},
                "sfx": {"status": "jump-force-decoded-pending-owner-review", "audio": audio},
                "voice": {"status": "jump-force-decoded-pending-owner-review", "audio": audio},
            }
        rows.append({
            **target,
            "jstarsPriorityStatus": "blocked-owner-archive-or-converter",
            "modules": modules,
            "jstarsRuntimeRegistered": False,
            "jstarsDefaultApplied": False,
            "productionDeploymentVerified": False,
        })
    return rows


def markdown(inventory: dict[str, Any]) -> str:
    rows = [
        "# J-Stars 優先角色：坂田銀時、小傑、奇犽",
        "",
        "> 由 `build_inventory.py` 生成；請不要只手改本檔。",
        "",
        f"- J-Stars owner archive：`{inventory['source']['ownerArchiveStatus']}`",
        f"- J-Stars 已轉換人物：{inventory['summary']['jstarsConverted']} / 3",
        f"- 已驗證可複用模型：{inventory['summary']['validatedFallbackModels']} / 3",
        f"- JUMP FORCE 已解碼但待聽審音訊：{inventory['summary']['jumpForceAudioFiles']} 檔",
        "",
        "| 角色 | J-Stars 模型 | 現有模型／骨架／動作 | VFX | SFX／語音 | J-Stars 註冊 |",
        "|---|---|---|---|---|---|",
    ]
    for character in inventory["characters"]:
        modules = character["modules"]
        rows.append(
            f"| {character['nameZhTW']} | {modules['model']['status']} | "
            f"{modules['skeleton']['status']}；{modules['motion']['status']} | {modules['vfx']['status']} | "
            f"{modules['sfx']['status']}；{modules['voice']['status']} | 否 |"
        )
    rows += [
        "",
        "## 精確缺口",
        "",
        "1. 六名 partial STPK 身分探測已將本表三名確證為銀時 `028`、小傑 `017`、奇犍 `018`。",
        "2. 三名已從 owner 原盤逐檔雜湊模型、動作、VFX、SFX 與語音容器候選；`$CH0` 完整解碼與 PS3 SRD 幾何／貼圖／蒙皮轉換尚未驗證。",
        "3. 小傑／奇犽 JUMP FORCE 音訊已解碼與逐檔雜湊，但未逐段聽審，不得直接綁定技能事件。",
        "4. 現有 300／社群候選可供遊戲使用或後續整合，但不是 J-Stars 轉換成果。",
        "",
        "## 重建",
        "",
        "```bash",
        "node --import tsx tools/hero-model-library/source-workflows/jstars-priority-gintoki-gon-killua-v1/validate_models.mts",
        "python3 tools/hero-model-library/source-workflows/jstars-priority-gintoki-gon-killua-v1/build_inventory.py",
        "python3 -m unittest tools/hero-model-library/source-workflows/jstars-priority-gintoki-gon-killua-v1/test_inventory.py",
        "```",
        "",
    ]
    return "\n".join(rows)


def build() -> dict[str, Any]:
    reference = read_json(REFERENCE)
    validation = read_json(VALIDATION)
    owner = read_json(OWNER_RECEIPT)
    exact = exact_archive_candidates(reference)
    if owner.get("status") == "blocked-archive-not-found" and exact:
        owner_status = "new-owner-archive-found-requires-extraction-rerun"
    elif exact:
        owner_status = "owner-archive-found"
    else:
        owner_status = "blocked-owner-archive-not-found"
    characters = character_rows(reference, validation)
    audio_count = 0
    for character in characters:
        seen: set[str] = set()
        for module in ("sfx", "voice"):
            audio = character["modules"][module].get("audio")
            if not isinstance(audio, dict) or audio.get("nativeCharacterId") in seen:
                continue
            seen.add(audio["nativeCharacterId"])
            audio_count += audio["counts"]["packageOgg"] + audio["counts"]["decodedEventVoiceWav"]
    return {
        "schema": "ggd.jstars-priority-three-inventory@1",
        "workflowId": reference["workflowId"],
        "fullAudit": {
            "status": "local-preserved-s3-readback-pending",
            "bytes": 599291,
            "sha256": "6e8f7f0062bb1b0755dad36bdb5f3a609b706d60e7b89abbd72f0c58bb07702a",
            "localPath": "../GGD-Asset-Library/conversions/pr1284-preparation-final-v1/payload/materials/hero-model-library/source-inventories/jstars-priority-gintoki-gon-killua-v1/inventory.json",
            "gitManifest": "materials/hero-model-library/pr1284-preparation-s3.json",
            "archiveMember": "materials/hero-model-library/source-inventories/jstars-priority-gintoki-gon-killua-v1/inventory.json",
            "archiveStatus": "pending-manifest-publication-and-readback",
            "restoreRequiredForInventoryBuild": False,
        },
        "source": {
            "sourceGame": reference["sourceGame"],
            "ownerArchiveStatus": owner_status,
            "exactOwnerArchiveCandidates": exact,
            "previousReceiptStatus": owner.get("status"),
            "ownerDiscPriorityCharacters": owner_disc_priority_sources({"gintoki", "gon", "killua"}),
            "jstarsKillua018": jstars_killua_source(),
        },
        "characters": characters,
        "summary": {
            "priorityCharacters": 3,
            "jstarsConverted": 0,
            "validatedFallbackModels": validation["summary"]["khronosZeroError"],
            "existingRegisteredFallbacks": validation["summary"]["registeredExistingOptions"],
            "jumpForceAudioFiles": audio_count,
            "jstarsRuntimeRegistered": 0,
            "jstarsDefaultsApplied": 0,
            "productionDeploymentsVerified": 0,
        },
        "policies": reference["policies"],
        "rerun": [
            "node --import tsx tools/hero-model-library/source-workflows/jstars-priority-gintoki-gon-killua-v1/validate_models.mts",
            "python3 tools/hero-model-library/source-workflows/jstars-priority-gintoki-gon-killua-v1/build_inventory.py",
            "python3 -m unittest tools/hero-model-library/source-workflows/jstars-priority-gintoki-gon-killua-v1/test_inventory.py",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    inventory = build()
    encoded = (json.dumps(inventory, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode()
    rendered = markdown(inventory).encode()
    targets = {OUTPUT / "inventory.json": encoded, OUTPUT / "README.md": rendered}
    if args.check:
        stale = [str(path) for path, data in targets.items() if not path.is_file() or path.read_bytes() != data]
        if stale:
            raise SystemExit("stale generated inventory: " + ", ".join(stale))
    else:
        OUTPUT.mkdir(parents=True, exist_ok=True)
        for path, data in targets.items():
            if not path.is_file() or path.read_bytes() != data:
                path.write_bytes(data)
    print(json.dumps(inventory["summary"], ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
