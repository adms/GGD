#!/usr/bin/env python3
"""Build a reproducible KOF XIV/JUMP FORCE container coverage inventory."""
from __future__ import annotations

import argparse
import collections
import gzip
import hashlib
import json
import re
from pathlib import Path


JUMP_ID_RE = re.compile(r"(?<![A-Za-z0-9])(chr\d{4})(?![A-Za-z0-9])", re.IGNORECASE)
KOF_ROW_RE = re.compile(r"^\s*([0-9a-fA-F]{16})\s+(\d+)\s+(.+?)\s*$")
KOF_ID_RE = re.compile(r"^Chara/([^/]+)/", re.IGNORECASE)
KOF_KIND_SUFFIXES = {
    "modelContainer": {".obac", ".omir", ".osec"},
    "animationContainer": {".otra", ".ocam", ".cact", ".cast", ".catk", ".cdmg", ".cseq"},
    "texture": {".dds", ".png"},
    "vfxContainerOrDependency": {".eff", ".obac", ".onc", ".leff", ".ceff"},
    "audioOrMetadata": {".ogg", ".sbnk", ".slst", ".sgrp"},
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def compact_counts(counter: collections.Counter[str]) -> dict[str, int]:
    return {key: counter[key] for key in sorted(counter) if counter[key]}


def kof_asset_kind_counts(suffixes: collections.Counter[str]) -> dict[str, int]:
    return {
        kind: sum(count for suffix, count in suffixes.items() if suffix in accepted)
        for kind, accepted in KOF_KIND_SUFFIXES.items()
    }


def build_jump(path: Path, authority_path: Path, mounted_root: Path, identity_path: Path | None = None) -> dict[str, object]:
    authority = json.loads(authority_path.read_text(encoding="utf-8"))
    if authority.get("schema") != "ggd-encrypted-unreal-pak-index@1":
        raise ValueError("unexpected JUMP FORCE authority schema")
    relations = 0
    selected = 0
    tokens: dict[str, collections.Counter[str]] = collections.defaultdict(collections.Counter)
    selected_tokens: dict[str, collections.Counter[str]] = collections.defaultdict(collections.Counter)
    containers = collections.Counter()
    with gzip.open(path, "rt", encoding="utf-8") as stream:
        for line in stream:
            row = json.loads(line)
            relations += 1
            source_kind = row.get("sourceKind", "other")
            containers[row["container"]] += 1
            ids = sorted({token.lower() for token in JUMP_ID_RE.findall(row["path"])})
            for native_id in ids:
                tokens[native_id][source_kind] += 1
                if row.get("selectedByPatchOrder") is True:
                    selected_tokens[native_id][source_kind] += 1
            if row.get("selectedByPatchOrder") is True:
                selected += 1
    if relations != authority["relationCount"] or selected != authority["uniquePathCount"]:
        raise ValueError("JUMP FORCE path index does not match its authority")
    authority_containers = {row["name"]: row for row in authority["containers"]}
    if compact_counts(containers) != {name: authority_containers[name]["entryCount"] for name in sorted(authority_containers)}:
        raise ValueError("JUMP FORCE per-container relation counts changed")
    identities = {
        row["nativeCharacterId"].removeprefix("chr"): {
            "name": row["name"],
            "heroIds": row.get("heroIds", []),
            "existingGroupId": None,
        }
        for row in authority.get("characters", [])
    }
    if identity_path is not None:
        identity_data = json.loads(identity_path.read_text(encoding="utf-8"))
        if identity_data.get("schema") == "ggd.jumpforce.native-character-map.v1":
            identities.update(identity_data["characters"])
        elif identity_data.get("schema") == "ggd.jumpforce.identity-map@1":
            identities.update({
                row["nativeCharacterIdToken"].removeprefix("chr"): {
                    "name": row["characterName"],
                    "heroIds": row.get("heroIds", []),
                    "existingGroupId": (row.get("existingAudioGroupIds") or [None])[0],
                    "existingAudioGroupIds": row.get("existingAudioGroupIds", []),
                    "identityState": row["identityState"],
                    "identityConfidence": row["identityConfidence"],
                    "identityScope": row.get("identityScope"),
                    "identityEvidence": row.get("identityEvidence", {}),
                    "assetClassCandidates": row.get("assetClassCandidates", {}),
                    "unresolvedReason": row.get("unresolvedReason"),
                }
                for row in identity_data["tokens"]
            })
        else:
            raise ValueError("unexpected JUMP FORCE identity map schema")
    character_tokens = []
    for native_id in sorted(tokens):
        kinds = tokens[native_id]
        selected_kinds = selected_tokens[native_id]
        identity = identities.get(native_id.removeprefix("chr"))
        row = {
            "nativeCharacterIdToken": native_id,
            "identityState": identity.get("identityState", "existing-source-group-crosswalk") if identity else "path-token-only-unmapped",
            "identityConfidence": identity.get("identityConfidence", "high") if identity else "unresolved",
            "characterName": identity["name"] if identity else None,
            "heroIds": identity.get("heroIds", []) if identity else [],
            "existingAudioGroupId": identity.get("existingGroupId") if identity else None,
            "existingAudioGroupIds": identity.get("existingAudioGroupIds", []) if identity else [],
            "identityScope": identity.get("identityScope") if identity else None,
            "identityEvidence": identity.get("identityEvidence", {}) if identity else {},
            "assetClassCandidates": identity.get("assetClassCandidates", {}) if identity else {},
            "unresolvedReason": identity.get("unresolvedReason") if identity else "No accepted identity evidence was supplied for this path token.",
            "relationCount": sum(kinds.values()),
            "selectedPathRelationCount": sum(selected_kinds.values()),
            "sourceKindRelationCounts": compact_counts(kinds),
            "sourceKindSelectedCounts": compact_counts(selected_kinds),
            "acquisition": "container-sha-recorded; container-payload-not-present-on-this-mac",
            "extraction": "path-index-only",
            "conversion": "not-started",
            "readiness": "reserve-index-only-not-runtime-selectable",
        }
        character_tokens.append(row)
    return {
        "sourceId": authority["sourceId"],
        "sourceGame": "JUMP FORCE",
        "platform": "Windows (Steam)",
        "appId": 816020,
        "buildId": 8523149,
        "index": {"absolutePath": str(path.resolve()), "bytes": path.stat().st_size, "sha256": sha256(path)},
        "authority": {"gitPath": "materials/hero-model-library/source-inventories/jump-force-steam-pak-index.json", "sha256": sha256(authority_path)},
        "mountedSourceRoot": str(mounted_root),
        "mountedNow": mounted_root.is_dir(),
        "payloadReadThisRun": False,
        "containerCount": authority["containerCount"],
        "containerBytes": sum(row["bytes"] for row in authority["containers"]),
        "relationCount": relations,
        "selectedPathCount": selected,
        "sourceKindRelationCounts": authority["sourceKindRelationCounts"],
        "sourceKindSelectedPathCounts": authority["sourceKindSelectedPathCounts"],
        "inferredNativeCharacterIdTokens": len(character_tokens),
        "knownIdentityCrosswalks": sum(row["identityConfidence"] == "high" for row in character_tokens),
        "unmappedNativeCharacterIdTokens": sum(row["identityConfidence"] == "unresolved" for row in character_tokens),
        "characterPathTokens": character_tokens,
        "containers": authority["containers"],
        "identityCaveat": "chrNNNN tokens include playable characters, forms, avatars, NPCs and other internal groups; a token is not a confirmed character identity.",
        "readiness": "six encrypted PAKs indexed; selected payload extraction and conversion are separate workflows",
    }


def build_kof(listing_path: Path, extraction_manifest_path: Path, mounted_wad: Path) -> dict[str, object]:
    extraction = json.loads(extraction_manifest_path.read_text(encoding="utf-8"))
    if extraction.get("schema") != "ggd-kofxiv-priority-extraction@1":
        raise ValueError("unexpected KOF XIV extraction manifest schema")
    entries = 0
    total_bytes = 0
    suffixes = collections.Counter()
    characters: dict[str, dict[str, object]] = {}
    for line in listing_path.read_text(encoding="utf-8", errors="replace").splitlines():
        match = KOF_ROW_RE.match(line)
        if not match:
            continue
        size = int(match.group(2))
        source_path = match.group(3)
        entries += 1
        total_bytes += size
        suffix = Path(source_path).suffix.lower() or "<none>"
        suffixes[suffix] += 1
        id_match = KOF_ID_RE.match(source_path)
        if not id_match:
            continue
        native_id = id_match.group(1)
        row = characters.setdefault(native_id, {
            "nativeCharacterIdToken": native_id,
            "fileCount": 0,
            "listedBytes": 0,
            "suffixCounts": collections.Counter(),
        })
        row["fileCount"] += 1
        row["listedBytes"] += size
        row["suffixCounts"][suffix] += 1
    if entries != extraction["wadIndex"]["totalEntries"]:
        raise ValueError("KOF XIV WAD listing entry count changed")
    acquired = {row["nativeCharacterId"]: row for row in extraction["characters"]}
    character_rows = []
    for native_id in sorted(characters):
        row = characters[native_id]
        acquired_row = acquired.get(native_id)
        row["assetKindCounts"] = kof_asset_kind_counts(row["suffixCounts"])
        row["suffixCounts"] = compact_counts(row["suffixCounts"])
        if acquired_row:
            row.update({
                "characterNameZh": acquired_row["nameZh"],
                "originalName": acquired_row["originalName"],
                "heroIds": acquired_row["heroIds"],
                "selectedExtractionAssetKindCounts": acquired_row.get("assetKindCounts", {}),
                "identityState": "native-character-directory-exact",
                "acquisition": "selected-files-extracted-and-sha256-verified",
                "extraction": "selected-character-directory-extracted",
                "conversion": "native-containers-blocked; selected textures decoded separately",
                "readiness": "acquired-source-not-runtime-selectable",
            })
        else:
            row.update({
                "characterNameZh": None,
                "originalName": None,
                "heroIds": [],
                "identityState": "native-directory-token-unmapped",
                "acquisition": "wad-listing-only",
                "extraction": "not-extracted",
                "conversion": "not-started",
                "readiness": "reserve-index-only-not-runtime-selectable",
            })
        character_rows.append(row)
    return {
        "sourceId": extraction["sourceId"],
        "sourceGame": "THE KING OF FIGHTERS XIV",
        "platform": "Windows (Steam)",
        "installedReleaseMarker": extraction["installedReleaseMarker"],
        "listing": {"absolutePath": str(listing_path.resolve()), "bytes": listing_path.stat().st_size, "sha256": sha256(listing_path)},
        "extractionManifest": {"absolutePath": str(extraction_manifest_path.resolve()), "bytes": extraction_manifest_path.stat().st_size, "sha256": sha256(extraction_manifest_path)},
        "mountedSource": str(mounted_wad),
        "mountedNow": mounted_wad.is_file(),
        "payloadReadThisRun": False,
        "sourceContainer": extraction["source"],
        "entryCount": entries,
        "listedUncompressedBytes": total_bytes,
        "nativeDirectoryTokens": len(character_rows),
        "assetKindCounts": kof_asset_kind_counts(suffixes),
        "suffixCounts": compact_counts(suffixes),
        "characters": character_rows,
        "selectedAcquiredCharacters": sorted(acquired),
        "readiness": "WAD listing complete; only MAI/IOR/KYO selected payloads are acquired and verified",
    }


def render_markdown(inventory: dict[str, object]) -> str:
    jump = inventory["jumpForce"]
    kof = inventory["kofXiv"]
    lines = [
        "# KOF XIV / JUMP FORCE 容器覆蓋與轉換缺口",
        "",
        "> 本頁由 `build_inventory.py` 產生。路徑索引、已抽出實檔、已轉換候選、後台可選及正式部署是不同狀態。",
        "",
        "## 本批增量結論",
        "",
        f"- JUMP FORCE：6 個 PAK 的固定索引共 {jump['relationCount']:,} 筆關係、{jump['selectedPathCount']:,} 個目前路徑；從完整路徑發現 {jump['inferredNativeCharacterIdTokens']} 個 `chrNNNN` token，其中 {jump['knownIdentityCrosswalks']} 個已有現行來源群對應、{jump['unmappedNativeCharacterIdTokens']} 個維持待確認。",
        f"- KOF XIV：完整 WAD listing 共 {kof['entryCount']:,} 筆，含 {kof['nativeDirectoryTokens']} 個 `Chara/<ID>` 目錄 token；只有 MAI、IOR、KYO 的選定 payload 已抽出並逐檔驗證。",
        "- 本次 `/Volumes/common` 未掛載，沒有重新讀取 Steam 容器 payload；固定索引與既有抽出檔仍可重建盤點。",
        "- 音訊只列來源與數量，不做說話者或技能事件自動綁定。",
        "",
        "## JUMP FORCE 路徑種類",
        "",
        "| 種類 | 容器關係 | 目前路徑 |",
        "|---|---:|---:|",
    ]
    for key, value in jump["sourceKindRelationCounts"].items():
        lines.append(f"| `{key}` | {value:,} | {jump['sourceKindSelectedPathCounts'].get(key, 0):,} |")
    lines += [
        "",
        "完整 224 個路徑 token 與逐種類計數在 `inventory.json → jumpForce.characterPathTokens`。身份只接受明名中央來源路徑或固定 authority；其餘維持待確認。",
        "",
        "## KOF XIV 目錄 token",
        "",
        "| ID | 身份 | 檔案 | 模型容器 | 動作容器 | 貼圖 | VFX/依賴 | 音訊/中繼 | 取得狀態 |",
        "|---|---|---:|---:|---:|---:|---:|---:|---:|---|",
    ]
    for row in kof["characters"]:
        counts = row["assetKindCounts"]
        name = row["characterNameZh"] or "待確認"
        lines.append(
            f"| `{row['nativeCharacterIdToken']}` | {name} | {row['fileCount']:,} | {counts['modelContainer']:,} | "
            f"{counts['animationContainer']:,} | {counts['texture']:,} | {counts['vfxContainerOrDependency']:,} | "
            f"{counts['audioOrMetadata']:,} | {row['acquisition']} |"
        )
    lines += [
        "",
        "## 狀態與下一步",
        "",
        "| 來源 | acquisition | extraction | conversion | readiness |",
        "|---|---|---|---|---|",
        "| JUMP FORCE 六 PAK | 容器 SHA 與索引已固定 | 達伊等已選範圍另案抽出；本批未讀 payload | 路徑 token 未轉換 | 索引儲備，不可選 |",
        "| KOF XIV MAI/IOR/KYO | 選定實檔已逐檔 SHA 驗證 | 已抽出 | 模型/骨架/動作容器仍缺 reader；貼圖另案處理 | 來源候選，不可選 |",
        "| KOF XIV 其餘 ID | 只有 WAD listing | 未抽出 | 未開始 | 索引儲備，不可選 |",
        "",
        "重建：",
        "",
        "```bash",
        "python3 tools/hero-model-library/source-workflows/kof-jump-container-coverage-v1/build_inventory.py --workspace ..",
        "python3 tools/hero-model-library/source-workflows/kof-jump-container-coverage-v1/build_inventory.py --workspace .. --check",
        "```",
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    repo = args.repo.resolve()
    workspace = args.workspace.resolve()
    inventory = {
        "schema": "ggd.kof-jump-container-coverage@1",
        "asOfDate": "2026-09-14",
        "scope": "fixed local indexes and already-acquired files; no network acquisition",
        "jumpForce": build_jump(
            workspace / "GGD-Asset-Library/intake/windows-readonly-20260913/jump-force-pak-index-v1/full-path-index.jsonl.gz",
            repo / "materials/hero-model-library/source-inventories/jump-force-steam-pak-index.json",
            Path("/Volumes/common/JUMP FORCE"),
            repo / "materials/hero-model-library/source-inventories/kof-jump-container-coverage-v1/identity-map.json",
        ),
        "kofXiv": build_kof(
            workspace / "GGD-Asset-Library/intake/windows-readonly-20260913/kof-xiv-wad-inspection-v1/quickbms-list.log",
            workspace / "GGD-Asset-Library/intake/windows-readonly-20260913/kof-xiv-priority-mai-ior-kyo-v1/source-manifest.json",
            Path("/Volumes/common/THE KING OF FIGHTERS XIV/assets.wad"),
        ),
        "automaticAudioBindings": 0,
        "runtimeSelectableAssetsAdded": 0,
        "productionDeploymentVerified": False,
    }
    out_dir = repo / "materials/hero-model-library/source-inventories/kof-jump-container-coverage-v1"
    out_dir.mkdir(parents=True, exist_ok=True)
    encoded_json = json.dumps(inventory, ensure_ascii=False, indent=2) + "\n"
    encoded_md = render_markdown(inventory)
    paths = {out_dir / "inventory.json": encoded_json, out_dir / "README.md": encoded_md}
    if args.check:
        for path, expected in paths.items():
            if not path.is_file() or path.read_text(encoding="utf-8") != expected:
                raise SystemExit(f"stale generated file: {path}")
    else:
        for path, expected in paths.items():
            path.write_text(expected, encoding="utf-8")
    print(json.dumps({
        "jumpNativeIdTokens": inventory["jumpForce"]["inferredNativeCharacterIdTokens"],
        "kofNativeDirectoryTokens": inventory["kofXiv"]["nativeDirectoryTokens"],
        "runtimeSelectableAssetsAdded": 0,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
