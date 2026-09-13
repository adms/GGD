#!/usr/bin/env python3
"""Build the complete 300 Heroes/MBA model, motion and VFX reserve index.

The source trees are read only.  Per-file SHA-256 values come from the already
read-back-verified 20260908 backup manifest.  The generator also stats every
indexed local file and freshly rehashes source-declared character bodies.
"""
from __future__ import annotations

import argparse
import collections
import gzip
import hashlib
import json
import os
import sqlite3
from pathlib import Path
from typing import Any, Iterable

REPO = Path(__file__).resolve().parents[4]
WORKSPACE = REPO.parent
MATERIALS = REPO / "materials/hero-model-library"
OUT = MATERIALS / "priority-evidence/300-mba-unused-assets-v1"
SNAPSHOT = "20260908T075704221576Z"
GROUPS = ("300heroes-raw", "300heroes-models", "magical-battle-arena")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text())


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def stable_gzip(payload: bytes) -> bytes:
    return gzip.compress(payload, compresslevel=9, mtime=0)


def encode_jsonl(rows: Iterable[dict[str, Any]]) -> bytes:
    return stable_gzip(b"".join(
        (json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
        for row in rows
    ))


def rel_to_workspace(path: str | Path) -> str:
    return str(Path(path).resolve().relative_to(WORKSPACE.resolve()))


def load_backup_manifest(asset_root: Path) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    backup = asset_root / "backups" / SNAPSHOT
    manifest = read_json(backup / "manifest-path-correction-20260908.json")
    receipt = read_json(backup / "receipt.json")
    integrity = read_json(backup / "archive-integrity.json")
    if receipt["status"] != "published_and_read_back_verified":
        raise ValueError("The source backup was not read-back verified")
    if not receipt["local_sources_preserved"] or receipt["deletions"] != 0:
        raise ValueError("The source backup does not prove local preservation")
    by_group = {row["id"]: row for row in manifest["groups"]}
    files: dict[str, dict[str, Any]] = {}
    group_receipts = []
    for group_id in GROUPS:
        group = by_group[group_id]
        index_path = backup / group["files_index"]
        index_sha = sha256(index_path)
        if index_sha != group["files_index_sha256"]:
            raise ValueError(f"Changed backup file index: {group_id}")
        if integrity["groups"][group_id]["status"] != "passed":
            raise ValueError(f"Backup archive integrity is not passed: {group_id}")
        rows = 0
        with index_path.open() as stream:
            for line in stream:
                row = json.loads(line)
                previous = files.get(row["path"])
                if previous and (previous["bytes"], previous["sha256"]) != (row["bytes"], row["sha256"]):
                    raise ValueError(f"Conflicting backup manifests for {row['path']}")
                files[row["path"]] = {**row, "backupGroup": group_id}
                rows += 1
        if rows != group["file_count"]:
            raise ValueError(f"Backup file count changed: {group_id}")
        group_receipts.append({
            "id": group_id,
            "fileCount": rows,
            "sourceBytes": group["source_bytes"],
            "filesIndexLocalPath": str(index_path),
            "filesIndexSha256": index_sha,
            "archiveIntegrity": "passed",
        })
    return files, {
        "snapshot": SNAPSHOT,
        "correctedS3Prefix": manifest["backup_uri"],
        "scope": manifest["scope"],
        "allowAutomaticConsumption": manifest["allow_automatic_consumption"],
        "readBackVerified": True,
        "localSourcesPreserved": True,
        "groups": group_receipts,
        "receiptLocalPath": str(backup / "receipt.json"),
        "receiptSha256": sha256(backup / "receipt.json"),
        "pathCorrectionLocalPath": str(backup / "manifest-path-correction-20260908.json"),
        "pathCorrectionSha256": sha256(backup / "manifest-path-correction-20260908.json"),
    }


def source_metadata(source_root: Path, asset_root: Path) -> dict[str, dict[str, Any]]:
    roster = read_json(asset_root / "outputs/game-asset-library-20260907/300heroes-roster.json")
    mba = read_json(source_root / "magical-battle-arena/library-summary.json")
    return {
        "300heroes": {
            "sourceId": "300heroes-official-client-20260902",
            "sourceName": "300英雄官方用戶端",
            "sourceVersion": "v202609021",
            "platform": "Windows PC",
            "selectionClass": "300heroes",
            "sourceUrls": roster["sources"],
            "scope": roster["scope"],
            "checkedOn": roster["checked_on"],
            "clientSha256": roster["client_sha256"],
        },
        "mba": {
            "sourceId": "magical-battle-arena-complete-form-1.60-plus",
            "sourceName": "Magical Battle Arena Complete Form",
            "sourceVersion": mba["version"],
            "platform": "Windows PC",
            "selectionClass": "mba",
            "sourceUrls": [mba["source"], mba["patch_source"]],
            "scope": mba["status"],
            "checkedOn": mba["updated_at"],
            "versionLimit": mba["version_limit"],
        },
    }


def build() -> tuple[dict[str, Any], bytes, bytes, str]:
    asset_root = WORKSPACE / "GGD-Asset-Library"
    source_root = WORKSPACE / "outputs/game-asset-library-20260907"
    registry_root = WORKSPACE / "outputs/asset-library-registry-20260907"
    backup_files, backup = load_backup_manifest(asset_root)
    metadata = source_metadata(source_root, asset_root)
    current = read_json(REPO / "materials/asset-library/current-resources.json")
    backlog = read_json(MATERIALS / "已取得模型待設計英雄.json")
    characters_raw = read_json(registry_root / "characters.json")

    runtime_asset_ids = {
        row["sourceAssetId"]
        for row in current["models"]
        if row.get("runtimeDropdownRegistered") is True
        and str(row.get("sourceAssetId", "")).startswith(("300heroes:", "mba:"))
    }
    group_by_source: dict[str, dict[str, Any]] = {}
    for group in backlog["characters"]:
        ids = [source_id for source_id in group.get("sourceIds", []) if source_id.startswith(("300heroes:", "mba:"))]
        if not ids:
            continue
        compact = {key: group.get(key) for key in (
            "id", "name", "work", "sourceIds", "mappedHeroIds", "identityHeroIds",
            "proxyUseHeroIds", "designStatus",
        )}
        for source_id in ids:
            group_by_source[source_id] = compact

    connection = sqlite3.connect(f"file:{registry_root / 'catalog.sqlite'}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    links: dict[str, set[str]] = collections.defaultdict(set)
    for row in connection.execute(
        "select l.asset_id,l.character_id from links l join assets a on a.id=l.asset_id "
        "where a.library in ('300heroes','mba') and a.kind in ('model','animation','vfx')"
    ):
        links[row["asset_id"]].add(row["character_id"])

    path_characters: dict[str, set[str]] = collections.defaultdict(set)
    missing_declared_paths = []
    official_body_paths: set[str] = set()
    character_definitions = []
    for row in characters_raw:
        if row["library"] not in ("300heroes", "mba"):
            continue
        declared = []
        for key in ("base_model", "glb"):
            if not row.get(key):
                continue
            rel = rel_to_workspace(row[key])
            declared.append({"kind": key, "path": str(Path(row[key])), "workspaceRelativePath": rel, "existsLocal": Path(row[key]).is_file()})
            if Path(row[key]).is_file():
                path_characters[rel].add(row["id"])
                official_body_paths.add(rel)
            else:
                missing_declared_paths.append({"sourceCharacterId": row["id"], "kind": key, "absolutePath": str(Path(row[key])), "workspaceRelativePath": rel})
        character_definitions.append({
            "sourceCharacterId": row["id"],
            "library": row["library"],
            "name": row["name"],
            "work": row["origin"],
            "declaredBodies": declared,
        })

    physical: dict[str, dict[str, Any]] = {}
    clips: list[dict[str, Any]] = []
    registry_assets = connection.execute(
        "select id,library,kind,tags,format,name,path,exists_local,readiness,data "
        "from assets where library in ('300heroes','mba') and kind in ('model','animation','vfx')"
    )
    registry_asset_counts: collections.Counter[tuple[str, str]] = collections.Counter()
    for asset in registry_assets:
        data = json.loads(asset["data"])
        rel = rel_to_workspace(asset["path"])
        registry_asset_counts[(asset["library"], asset["kind"])] += 1
        row = physical.setdefault(rel, {
            "library": asset["library"],
            "absolutePath": str(Path(asset["path"])),
            "workspaceRelativePath": rel,
            "name": Path(asset["path"]).name,
            "formats": set(),
            "assetKinds": set(),
            "tags": set(),
            "assetIds": set(),
            "linkedSourceCharacterIds": set(),
            "readinessValues": set(),
            "nativeSourceRecords": [],
        })
        row["formats"].add(asset["format"])
        row["assetKinds"].add(asset["kind"])
        row["tags"].update(filter(None, asset["tags"].split("|")))
        row["assetIds"].add(asset["id"])
        row["linkedSourceCharacterIds"].update(links[asset["id"]])
        row["linkedSourceCharacterIds"].update(path_characters.get(rel, set()))
        row["readinessValues"].add(asset["readiness"])
        if data.get("source_record"):
            row["nativeSourceRecords"].append(data["source_record"])
        if asset["kind"] == "animation":
            clips.append({
                "assetId": asset["id"],
                "library": asset["library"],
                "absolutePath": str(Path(asset["path"])),
                "workspaceRelativePath": rel,
                "format": asset["format"],
                "clipName": asset["name"],
                "locator": data.get("locator", ""),
                "clip": data.get("clip"),
                "linkedSourceCharacterIds": sorted(links[asset["id"]] | path_characters.get(rel, set())),
                "runtimeSourceUsed": asset["id"] in runtime_asset_ids,
                "conversionStatus": "converted-clip-candidate-unvalidated-for-ggd" if asset["format"] == "glb" else "native-motion-source-unconverted",
            })
    connection.close()

    # The historic registry only categorized 11 shader .fx files as VFX.  The
    # native VFX parser found all effect configs; merge those exact files here.
    native_vfx_path = source_root / "300heroes/indexes/vfx-native.jsonl"
    native_vfx_count = 0
    with native_vfx_path.open() as stream:
        for line in stream:
            item = json.loads(line)
            absolute = source_root / "300heroes/raw" / item["path"]
            rel = rel_to_workspace(absolute)
            row = physical.setdefault(rel, {
                "library": "300heroes",
                "absolutePath": str(absolute),
                "workspaceRelativePath": rel,
                "name": absolute.name,
                "formats": set(),
                "assetKinds": set(),
                "tags": set(),
                "assetIds": set(),
                "linkedSourceCharacterIds": set(),
                "readinessValues": set(),
                "nativeSourceRecords": [],
            })
            row["formats"].add(item["extension"].lstrip(".").lower())
            row["assetKinds"].add("vfx")
            row["tags"].add("vfx")
            row["readinessValues"].add("native")
            row["nativeSourceRecords"].append(item)
            native_vfx_count += 1

    body_hashes = {}
    for rel in sorted(official_body_paths):
        path = WORKSPACE / rel
        body_hashes[rel] = sha256(path)

    output_rows = []
    path_to_sha = {}
    live_bytes = 0
    roles: collections.Counter[tuple[str, str]] = collections.Counter()
    status_counts: collections.Counter[tuple[str, str]] = collections.Counter()
    for rel, row in sorted(physical.items()):
        evidence = backup_files.get(rel)
        if evidence is None:
            raise ValueError(f"No verified per-file SHA for {rel}")
        path = Path(row["absolutePath"])
        stat = path.stat() if path.is_file() else None
        if stat is None or stat.st_size != evidence["bytes"]:
            raise ValueError(f"Missing or size-changed local source: {path}")
        if rel in body_hashes and body_hashes[rel] != evidence["sha256"]:
            raise ValueError(f"Official body SHA changed: {path}")
        runtime_used = bool(row["assetIds"] & runtime_asset_ids)
        source_ids = sorted(row["linkedSourceCharacterIds"])
        mapped_ids = sorted({hero for source_id in source_ids for hero in (group_by_source.get(source_id) or {}).get("mappedHeroIds", [])})
        if "vfx" in row["assetKinds"] or "vfx" in row["tags"] or "/effect/" in rel.lower():
            role = "vfx-source-or-effect-component"
        elif source_ids and "model" in row["assetKinds"]:
            role = "character-linked-model-or-animation-container"
        elif "model" in row["assetKinds"]:
            role = "unlinked-model-prop-or-environment-candidate"
        elif source_ids:
            role = "character-linked-motion-source"
        else:
            role = "unlinked-motion-reserve"
        formats = sorted(row["formats"])
        if runtime_used:
            usage = "runtime-source-used"
        elif source_ids and mapped_ids:
            usage = "unused-mapped-character-reserve"
        elif source_ids:
            usage = "unused-unmapped-character-reserve"
        else:
            usage = "unused-unlinked-reserve"
        if "glb" in formats:
            conversion = "converted-candidate-unvalidated-for-ggd"
        else:
            conversion = "native-source-unconverted"
        item = {
            "sourceId": metadata[row["library"]]["sourceId"],
            "library": row["library"],
            "sourceVersion": metadata[row["library"]]["sourceVersion"],
            "platform": metadata[row["library"]]["platform"],
            "selectionClass": metadata[row["library"]]["selectionClass"],
            "sourceUrls": metadata[row["library"]]["sourceUrls"],
            "absolutePath": row["absolutePath"],
            "workspaceRelativePath": rel,
            "name": row["name"],
            "bytes": evidence["bytes"],
            "sha256": evidence["sha256"],
            "sha256Evidence": f"read-back-verified backup snapshot {SNAPSHOT} per-file manifest",
            "freshLiveSha256Verified": rel in body_hashes,
            "existsLocal": True,
            "liveSizeMatches": True,
            "backupGroup": evidence["backupGroup"],
            "s3BackupPrefix": backup["correctedS3Prefix"] + evidence["backupGroup"] + "/",
            "s3ArchiveMember": rel,
            "gitIndexPath": "materials/hero-model-library/priority-evidence/300-mba-unused-assets-v1/files.jsonl.gz",
            "assetKinds": sorted(row["assetKinds"]),
            "formats": formats,
            "tags": sorted(row["tags"]),
            "assetIds": sorted(row["assetIds"]),
            "linkedSourceCharacterIds": source_ids,
            "mappedGgdHeroIds": mapped_ids,
            "resourceRole": role,
            "usageStatus": usage,
            "conversionStatus": conversion,
            "defaultEligible": False,
            "runtimeSelectable": False,
            "productionDeploymentVerified": False,
            "readinessValues": sorted(row["readinessValues"]),
            "nativeSourceRecords": list({
                json.dumps(record, ensure_ascii=False, sort_keys=True): record
                for record in row["nativeSourceRecords"]
            }.values()),
            "validationEvidence": {
                "backupSnapshot": SNAPSHOT,
                "backupReadBackVerified": True,
                "localFileStatVerified": True,
                "freshLiveSha256Verified": rel in body_hashes,
            },
            "missingItems": [] if runtime_used else [
                "ggd-standardization-or-final-acceptance",
                "runtime-option-registration",
                "production-deployment-verification",
            ],
        }
        output_rows.append(item)
        path_to_sha[rel] = evidence
        live_bytes += evidence["bytes"]
        roles[(row["library"], role)] += 1
        status_counts[(row["library"], usage)] += 1

    for clip in clips:
        evidence = path_to_sha[clip["workspaceRelativePath"]]
        clip["bytes"] = evidence["bytes"]
        clip["sha256"] = evidence["sha256"]
        clip["sha256Evidence"] = f"read-back-verified backup snapshot {SNAPSHOT} per-file manifest"
        clip["mappedGgdHeroIds"] = sorted({hero for source_id in clip["linkedSourceCharacterIds"] for hero in (group_by_source.get(source_id) or {}).get("mappedHeroIds", [])})
        clip["usageStatus"] = "runtime-source-used" if clip.pop("runtimeSourceUsed") else "unused-motion-reserve"
        clip["runtimeSelectable"] = False
        clip["productionDeploymentVerified"] = False
    clips.sort(key=lambda row: (row["library"], row["workspaceRelativePath"], row["assetId"]))

    by_source_counts: dict[str, collections.Counter[str]] = collections.defaultdict(collections.Counter)
    by_source_bytes: dict[str, set[str]] = collections.defaultdict(set)
    for row in output_rows:
        for source_id in row["linkedSourceCharacterIds"]:
            by_source_counts[source_id]["physicalFiles"] += 1
            by_source_counts[source_id]["unusedFiles"] += row["usageStatus"].startswith("unused-")
            for kind in row["assetKinds"]:
                by_source_counts[source_id][kind] += 1
            by_source_bytes[source_id].add(row["workspaceRelativePath"])
    characters = []
    definitions_by_id = {row["sourceCharacterId"]: row for row in character_definitions}
    for source_id, group in sorted(group_by_source.items()):
        definition = definitions_by_id.get(source_id, {})
        counts = dict(sorted(by_source_counts[source_id].items()))
        characters.append({
            "sourceCharacterId": source_id,
            "name": definition.get("name", group["name"]),
            "work": definition.get("work", group["work"]),
            "sourceVersion": metadata["300heroes" if source_id.startswith("300heroes:") else "mba"]["sourceVersion"],
            "groupId": group["id"],
            "groupName": group["name"],
            "designStatus": group["designStatus"],
            "mappedHeroIds": group["mappedHeroIds"],
            "identityHeroIds": group["identityHeroIds"],
            "proxyUseHeroIds": group["proxyUseHeroIds"],
            "assetCounts": counts,
            "indexedBytes": sum(path_to_sha[p]["bytes"] for p in by_source_bytes[source_id]),
            "declaredBodies": definition.get("declaredBodies", []),
            "runtimeDropdownCoverage": "separate model option registry; this source inventory does not claim every variant is selectable",
        })

    files_gz = encode_jsonl(output_rows)
    clips_gz = encode_jsonl(clips)
    summary = {
        "physicalFiles": len(output_rows),
        "physicalBytes": live_bytes,
        "unusedPhysicalFiles": sum(row["usageStatus"].startswith("unused-") for row in output_rows),
        "runtimeSourceUsedPhysicalFiles": sum(row["usageStatus"] == "runtime-source-used" for row in output_rows),
        "animationClipRecords": len(clips),
        "freshLiveSha256VerifiedCharacterBodies": len(body_hashes),
        "native300VfxRecords": native_vfx_count,
        "sourceCharactersIndexed": len(characters),
        "missingDeclaredBodyPaths": len(missing_declared_paths),
        "registryAssetRecords": {
            library: {kind: registry_asset_counts[(library, kind)] for kind in ("model", "animation", "vfx")}
            for library in ("300heroes", "mba")
        },
        "usageByLibrary": {
            library: {status: count for (lib, status), count in sorted(status_counts.items()) if lib == library}
            for library in ("300heroes", "mba")
        },
        "rolesByLibrary": {
            library: {role: count for (lib, role), count in sorted(roles.items()) if lib == library}
            for library in ("300heroes", "mba")
        },
    }
    index = {
        "schema": "ggd.300-mba-unused-assets-index@1",
        "snapshot": SNAPSHOT,
        "scope": ["model", "animation", "vfx", "prop-and-environment-model-candidates"],
        "sources": metadata,
        "summary": summary,
        "files": {
            "gitPath": str((OUT / "files.jsonl.gz").relative_to(REPO)),
            "sha256": hashlib.sha256(files_gz).hexdigest(),
            "encoding": "gzip-jsonl",
            "recordCount": len(output_rows),
        },
        "animationClips": {
            "gitPath": str((OUT / "animation-clips.jsonl.gz").relative_to(REPO)),
            "sha256": hashlib.sha256(clips_gz).hexdigest(),
            "encoding": "gzip-jsonl",
            "recordCount": len(clips),
        },
        "characters": characters,
        "missingDeclaredBodyPaths": missing_declared_paths,
        "backupEvidence": backup,
        "inputFingerprints": [
            {"path": str(registry_root / "catalog.sqlite"), "bytes": (registry_root / "catalog.sqlite").stat().st_size, "sha256": sha256(registry_root / "catalog.sqlite")},
            {"path": str(registry_root / "characters.json"), "bytes": (registry_root / "characters.json").stat().st_size, "sha256": sha256(registry_root / "characters.json")},
            {"path": str(native_vfx_path), "bytes": native_vfx_path.stat().st_size, "sha256": sha256(native_vfx_path)},
            {"gitPath": "materials/hero-model-library/已取得模型待設計英雄.json", "bytes": (MATERIALS / "已取得模型待設計英雄.json").stat().st_size, "sha256": sha256(MATERIALS / "已取得模型待設計英雄.json")},
            {
                "gitPath": "materials/asset-library/current-resources.json",
                "scope": "runtime sourceAssetId/runtimeDropdownRegistered projection only; avoids a circular digest through this index",
                "projectionSha256": hashlib.sha256(json.dumps(sorted(
                    (row.get("sourceAssetId"), row.get("runtimeDropdownRegistered"))
                    for row in current["models"]
                ), separators=(",", ":")).encode()).hexdigest(),
            },
        ],
        "statusSemantics": {
            "runtime-source-used": "該精確來源 asset ID 已被目前 Git 成品使用；仍不表示此列原始檔可直接在後台切換。",
            "unused-mapped-character-reserve": "已連到 GGD 英雄身分，但該精確檔未被 runtime 成品引用。",
            "unused-unmapped-character-reserve": "已連到原生角色，但沒有可確認的 GGD 英雄綁定。",
            "unused-unlinked-reserve": "尚未建立原生角色關係；保留為道具、環境、特效或動作候選。",
        },
        "boundaries": [
            "原生 .x/.model/.mtn/.ini/.efc/.fx 不是 GGD 成品，需轉換、效能與視覺驗收。",
            "GLB 只列為已轉換候選；未通過本批 GGD 驗收，也不等於後台可切換。",
            "S3 僅是 backup_only，不是正式程式自動取用入口。",
            "300 名冊是下載官方用戶端的當期表，不是歷來刪除角色全集。",
            "MBA 本機只取得 Complete Form 1.60+；1.70 內容尚未取得。",
        ],
        "newDownloads": False,
        "paymentPerformed": False,
        "conversionPerformed": False,
        "runtimeRegistrationPerformed": False,
        "productionDeploymentVerified": False,
    }
    md = render_markdown(index)
    return index, files_gz, clips_gz, md


def render_markdown(index: dict[str, Any]) -> str:
    summary = index["summary"]
    usage = summary["usageByLibrary"]
    lines = [
        "# 300英雄與魔法少女武鬥祭 MBA 未使用素材中央索引",
        "",
        f"固定快照：`{index['snapshot']}`。本頁由 `build_index.py` 產生；數字來自受驗證備份清單、本機實檔 stat、資產 registry 與中央角色設計索引。",
        "",
        "## 範圍與證據",
        "",
        f"- 已建索 `{summary['physicalFiles']:,}` 個不同實體檔，共 `{summary['physicalBytes']:,}` bytes；其中 `{summary['unusedPhysicalFiles']:,}` 個精確檔尚未被目前 runtime 成品引用。",
        f"- 動作邏輯紀錄 `{summary['animationClipRecords']:,}` 筆；300 原生 VFX 紀錄 `{summary['native300VfxRecords']:,}` 筆。",
        f"- 中央角色來源 ID `{summary['sourceCharactersIndexed']:,}` 筆。重新 SHA-256 核對 `{summary['freshLiveSha256VerifiedCharacterBodies']:,}` 個已存在的來源宣告角色 body。",
        f"- 備份快照已讀回驗證；逐檔 SHA 來自 `{index['snapshot']}` 清單，本批另對每個索引檔做存在與 bytes 核對。",
        "",
        "## 來源與使用狀態",
        "",
        "| 來源 | 版本 | 已直接使用實體檔 | 未使用已對應角色 | 未使用未對應角色 | 未連結儲備 |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for library in ("300heroes", "mba"):
        row = usage[library]
        lines.append(
            f"| {index['sources'][library]['sourceName']} | {index['sources'][library]['sourceVersion']} | "
            f"{row.get('runtime-source-used', 0):,} | {row.get('unused-mapped-character-reserve', 0):,} | "
            f"{row.get('unused-unmapped-character-reserve', 0):,} | {row.get('unused-unlinked-reserve', 0):,} |"
        )
    lines += [
        "",
        "## 目前缺口",
        "",
        f"- 來源定義宣告但本機不存在的 body 路徑 `{summary['missingDeclaredBodyPaths']}` 個；精確路徑可查 `index.json → missingDeclaredBodyPaths`。這些不等於整個角色沒有其他形態或替代容器。",
        "- MBA `1.70` 未取得；本批不從網路重複下載或購買。",
        "- 原生特效設定、原生動作與道具候選仍需 GGD 轉換、視覺及播放驗收後，才能登記成後台獨立選項。",
        "",
        "## 查詢",
        "",
        "```sh",
        "python3 tools/hero-model-library/source-workflows/300-mba-unused-assets-v1/query.py 300heroes:135",
        "python3 tools/hero-model-library/source-workflows/300-mba-unused-assets-v1/query.py --library mba --kind vfx --unused-only --limit 20",
        "```",
        "",
        "`files.jsonl.gz` 是逐實體檔索引；`animation-clips.jsonl.gz` 另保留同一容器內的每個動作邏輯紀錄。S3 位置只是備份證據，不是正式 runtime 取用入口。",
        "",
    ]
    return "\n".join(lines)


def write_or_check(path: Path, payload: bytes, check: bool) -> None:
    if check:
        if not path.is_file() or path.read_bytes() != payload:
            raise ValueError(f"Refresh generated output: {path}")
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(payload)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    index, files_gz, clips_gz, markdown = build()
    write_or_check(OUT / "files.jsonl.gz", files_gz, args.check)
    write_or_check(OUT / "animation-clips.jsonl.gz", clips_gz, args.check)
    write_or_check(OUT / "index.json", (json.dumps(index, ensure_ascii=False, indent=2) + "\n").encode(), args.check)
    write_or_check(OUT / "index.md", markdown.encode(), args.check)
    print(json.dumps(index["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
