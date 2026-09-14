#!/usr/bin/env python3
"""Build the deterministic 63-character extraction and conversion plan."""
from __future__ import annotations

import argparse
import collections
import gzip
import json
import sys
from pathlib import Path

from common import (
    AS_OF_DATE,
    ASSET_CLASSES,
    SOURCE_ID,
    character_matches,
    classify_uasset,
    load_json,
    package_stem,
    sha256,
    write_json,
    write_jsonl_gz,
)


PLAN_GIT_ROOT = "materials/hero-model-library/source-inventories/jump-force-full-roster-v1"


def read_selected_relations(path: Path) -> list[dict]:
    rows = []
    with gzip.open(path, "rt", encoding="utf-8") as stream:
        for line in stream:
            if not line.strip():
                continue
            row = json.loads(line)
            if row.get("selectedByPatchOrder") is True:
                rows.append(row)
    return rows


def build(identity_path: Path, authority_path: Path, path_index: Path, batch_size: int, repo: Path | None = None) -> tuple[dict, list[dict]]:
    repo = (repo or Path(__file__).resolve().parents[4]).resolve()

    def repo_path(path: Path) -> str:
        try:
            return str(path.resolve().relative_to(repo))
        except ValueError:
            return str(path.resolve())
    identity = load_json(identity_path)
    authority = load_json(authority_path)
    if identity.get("sourceId") != SOURCE_ID or authority.get("sourceId") != SOURCE_ID:
        raise ValueError("JUMP FORCE source identity mismatch")
    if len(authority.get("containers", [])) != 6:
        raise ValueError("JUMP FORCE authority must pin exactly six PAK files")
    if identity.get("inputs", {}).get("pakPathIndex", {}).get("sha256") != sha256(path_index):
        raise ValueError("full path index differs from identity-map authority")
    if identity.get("inputs", {}).get("pakAuthority", {}).get("sha256") != sha256(authority_path):
        raise ValueError("PAK authority differs from identity-map authority")
    high = sorted(
        (row for row in identity.get("tokens", []) if row.get("identityConfidence") == "high"),
        key=lambda row: row["nativeCharacterIdToken"],
    )
    if len(high) != 63:
        raise ValueError(f"expected 63 high-confidence identities, got {len(high)}")

    selected = read_selected_relations(path_index)
    by_stem: dict[str, list[dict]] = collections.defaultdict(list)
    for row in selected:
        by_stem[package_stem(row["path"])].append(row)

    detail_rows: list[dict] = []
    characters = []
    for position, identity_row in enumerate(high):
        token = identity_row["nativeCharacterIdToken"]
        batch = position // batch_size + 1
        packages_by_class: dict[str, dict[str, dict]] = {name: {} for name in ASSET_CLASSES}
        for relation in selected:
            path = relation["path"]
            source_kind = relation.get("sourceKind", "other")
            if not path.casefold().endswith(".uasset") or not character_matches(path, token, source_kind):
                continue
            asset_class = classify_uasset(path, source_kind)
            if asset_class is None:
                continue
            stem = package_stem(path)
            members = sorted(by_stem[stem], key=lambda row: (row["path"], row["containerOrder"]))
            packages_by_class[asset_class][stem] = {
                "packageStem": stem,
                "uassetPath": path,
                "members": [member["path"] for member in members],
            }
            for member in members:
                detail_rows.append({
                    "batch": batch,
                    "nativeCharacterId": token,
                    "characterName": identity_row["characterName"],
                    "assetClass": asset_class,
                    "packageStem": stem,
                    "path": member["path"],
                    "container": member["container"],
                    "containerOrder": member["containerOrder"],
                    "containerSha256": member["containerSha256"],
                    "selectedByPatchOrder": True,
                    "extractionState": "planned-not-extracted",
                })
        class_summaries = {}
        for asset_class in ASSET_CLASSES:
            packages = packages_by_class[asset_class]
            members = sum(len(row["members"]) for row in packages.values())
            state = "path-indexed-extraction-planned" if packages else "not-identified-in-current-path-index"
            note = None
            if asset_class == "motion" and packages:
                note = "AnimBP and *_anim packages are dependency roots; native AnimSequence clips require post-extraction dependency closure."
            class_summaries[asset_class] = {
                "packageCount": len(packages),
                "memberCount": members,
                "state": state,
                "note": note,
            }
        characters.append({
            "batch": batch,
            "nativeCharacterId": token,
            "characterName": identity_row["characterName"],
            "identityState": identity_row["identityState"],
            "identityConfidence": "high",
            "identityScope": identity_row["identityScope"],
            "heroIds": identity_row.get("heroIds", []),
            "assetClasses": class_summaries,
            "stages": {
                "sourceIdentity": "verified-high-confidence-character-family",
                "pakMirror": "required-not-part-of-git-plan",
                "extraction": "planned-not-extracted",
                "dependencyClosure": "not-started",
                "conversion": "not-started",
                "validation": "not-started",
                "registration": "not-started",
                "runtimeSelectable": False,
                "productionDeployed": False,
            },
            "conversionPlan": [
                "extract selected current-version package members by container and native ID",
                "resolve package dependency closure without guessing identity",
                "export skeletal meshes, skeletons, textures and native animation clips with UE Viewer for UE 4.19",
                "decode audio containers while preserving original files and unverified event labels",
                "convert model and textures through the JUMP-specific UV/material workflow",
                "apply GGD policy checks; models above 10,000 triangles must be reduced to at most 8,000",
                "create visual/audio/motion review evidence before any runtime binding",
            ],
        })

    detail_rows.sort(key=lambda row: (row["batch"], row["nativeCharacterId"], ASSET_CLASSES.index(row["assetClass"]), row["path"]))
    class_totals = {
        asset_class: {
            "packages": sum(row["assetClasses"][asset_class]["packageCount"] for row in characters),
            "memberRelations": sum(row["assetClasses"][asset_class]["memberCount"] for row in characters),
            "charactersWithCandidates": sum(row["assetClasses"][asset_class]["packageCount"] > 0 for row in characters),
        }
        for asset_class in ASSET_CLASSES
    }
    duplicate_identity_names = sorted(
        name for name, count in collections.Counter(row["characterName"] for row in characters).items() if count > 1
    )
    workflow_tools = [
        "tools/hero-model-library/source-workflows/jump-force-full-roster-v1/common.py",
        "tools/hero-model-library/source-workflows/jump-force-full-roster-v1/build_plan.py",
        "tools/hero-model-library/source-workflows/jump-force-full-roster-v1/prepare_mirror.py",
        "tools/hero-model-library/source-workflows/jump-force-full-roster-v1/extract_batch.py",
        "tools/hero-model-library/source-workflows/jump-force-full-roster-v1/query.py",
    ]
    conversion_references = [
        "tools/hero-model-library/source-workflows/jump-force-steam-dai-v1/compose_glb.py",
        "tools/hero-model-library/source-workflows/jump-force-steam-dai-v1/convert_blender.py",
        "tools/hero-model-library/source-workflows/jump-force-steam-dai-v1/validate_glb.py",
        "tools/hero-model-library/source-workflows/jump-force-dai-decimation-v2/blender_decimate.py",
        "tools/hero-model-library/source-workflows/jump-force-dai-decimation-v2/make_eye_layers.py",
        "tools/hero-model-library/source-workflows/jump-force-dai-decimation-v2/validate_candidate.py",
    ]
    for path in workflow_tools + conversion_references:
        if not (repo / path).is_file():
            raise FileNotFoundError(f"missing workflow dependency: {path}")
    plan = {
        "schema": "ggd.jumpforce-full-roster-plan@1",
        "asOfDate": AS_OF_DATE,
        "sourceId": SOURCE_ID,
        "scope": {
            "highConfidenceNativeCharacterIds": 63,
            "batchSize": batch_size,
            "batchCount": (63 + batch_size - 1) // batch_size,
            "fullSteamLibraryRescanRequired": False,
            "fullGameDirectoryRescanRequired": False,
            "requiredUserPayload": "JUMP_FORCE/Content/Paks only; six authority-pinned PAK files",
            "identityScope": "character-family; exact costume/form may remain unresolved",
        },
        "localMirrorTarget": {
            "rawGameRoot": "/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-Asset-Library/intake/windows-readonly-20260915/jump-force-steam-full-build-8523149/raw-game",
            "paksRoot": "/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-Asset-Library/intake/windows-readonly-20260915/jump-force-steam-full-build-8523149/raw-game/JUMP_FORCE/Content/Paks",
            "completionReceipt": "/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-Asset-Library/intake/windows-readonly-20260915/jump-force-steam-full-build-8523149/mirror-complete.json",
            "stateAtPlanGeneration": "copy-in-progress; completion receipt absent; no payload completeness claim",
        },
        "inputs": {
            "identityMap": {"gitPath": repo_path(identity_path), "bytes": identity_path.stat().st_size, "sha256": sha256(identity_path)},
            "pakAuthority": {"gitPath": repo_path(authority_path), "bytes": authority_path.stat().st_size, "sha256": sha256(authority_path)},
            "fullPathIndex": {"absolutePath": str(path_index.resolve()), "bytes": path_index.stat().st_size, "sha256": sha256(path_index)},
        },
        "pakContainers": [
            {key: row[key] for key in ("name", "order", "bytes", "sha256")}
            for row in sorted(authority["containers"], key=lambda row: row["order"])
        ],
        "workflowTools": [
            {"gitPath": path, "sha256": sha256(repo / path)} for path in workflow_tools
        ],
        "conversionReferences": [
            {"gitPath": path, "sha256": sha256(repo / path)} for path in conversion_references
        ],
        "summary": {
            "characters": len(characters),
            "highConfidenceIdentities": len(characters),
            "duplicateCharacterFamilyNames": duplicate_identity_names,
            "selectedMemberRelations": len(detail_rows),
            "assetClasses": class_totals,
            "paksMirroredThisRun": 0,
            "payloadFilesExtractedThisRun": 0,
            "convertedModelsThisRun": 0,
            "convertedMotionsThisRun": 0,
            "convertedVfxThisRun": 0,
            "decodedAudioThisRun": 0,
            "runtimeBindingsAdded": 0,
            "backendOptionsAdded": 0,
            "productionDeployments": 0,
        },
        "securityAndRights": {
            "usesOnlyOwnedOrAuthorizedInstallation": True,
            "aesKeyStored": False,
            "aesKeyDiscoveryImplemented": False,
            "authenticationBypassImplemented": False,
            "runnerRequiresAuthorizedKeyEnvironment": "UNREAL_PAK_AES_KEY",
        },
        "states": {
            "source": "path-indexed-and-container-sha-authority-pinned",
            "mirror": "not-created-by-this-plan",
            "extraction": "planned-not-extracted",
            "conversion": "not-started",
            "validation": "not-started",
            "registration": "not-started",
            "runtimeSelectable": False,
            "productionDeployed": False,
        },
        "characters": characters,
    }
    return plan, detail_rows


def render_markdown(plan: dict, detail_path: Path) -> str:
    summary = plan["summary"]
    lines = [
        "# JUMP FORCE 全角色批次抽取／轉換計畫",
        "",
        "這份計畫只使用已固定的完整 PAK path index 與 63 個高信度原生角色 ID。LV99 不必再提供整個 Steam 目錄；只需把 `JUMP_FORCE/Content/Paks` 的六顆 authority-pinned PAK 一次鏡像到本機素材庫。",
        "",
        f"- 高信度原生 ID：{summary['characters']} 個，分 {plan['scope']['batchCount']} 批。",
        f"- 選定檔案關係：{summary['selectedMemberRelations']:,} 筆；逐檔計畫在 `{detail_path.name}`。",
        "- 目前狀態：只有抽取與轉換計畫；本批沒有讀 PAK payload、沒有轉換、沒有後台選項、沒有部署。",
        "- 身份範圍：已確認角色 family；服裝、形態、NPC 身份仍須在抽取後逐件核對。",
        "- 動作範圍：目前定位的是 `AnimBP`／`*_anim` 依賴入口；不能把它們直接算成已取得原生動作剪輯。",
        "",
        "## 六類素材計畫",
        "",
        "| 類別 | 有候選角色 | 套件 | 檔案關係 | 現況 |",
        "|---|---:|---:|---:|---|",
    ]
    labels = {"model": "模型", "texture": "貼圖", "skeleton": "骨架", "motion": "動作入口", "vfx": "特效／技能設定", "audio": "音效／語音", "metadata": "角色設定"}
    for key in ASSET_CLASSES:
        row = summary["assetClasses"][key]
        lines.append(f"| {labels[key]} | {row['charactersWithCandidates']} | {row['packages']:,} | {row['memberRelations']:,} | path-indexed，未抽取 |")
    lines.extend([
        "",
        "## 批次",
        "",
        "| 批次 | 原生 ID／角色 |",
        "|---:|---|",
    ])
    by_batch: dict[int, list[str]] = collections.defaultdict(list)
    for row in plan["characters"]:
        by_batch[row["batch"]].append(f"`{row['nativeCharacterId']}` {row['characterName']}")
    for batch, names in sorted(by_batch.items()):
        lines.append(f"| {batch} | {'、'.join(names)} |")
    lines.extend([
        "",
        "## 執行順序",
        "",
        "1. `prepare_mirror.py` 對六顆 PAK 逐檔驗證大小與 SHA-256；需要時複製到素材庫，再讀回驗證。",
        "2. `extract_batch.py` 只抽取 plan 指定的目前版本檔案，可用 `--batch` 或 `--native-id` 分批。",
        "3. 抽取後先解析依賴 closure，才建立 UE Viewer／Blender／音訊轉換工作；每一階段另外保存逐檔 SHA 與收據。",
        "4. 模型、動作、特效與音訊都須通過個別審查才可註冊；此 plan 不自動建立後台選項。",
        "",
        "完整命令、AES 權限界線及重跑方式見 `tools/hero-model-library/source-workflows/jump-force-full-roster-v1/README.md`。",
        "",
    ])
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--workspace", type=Path, default=Path.cwd().parent)
    parser.add_argument("--path-index", type=Path)
    parser.add_argument("--batch-size", type=int, default=7)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.batch_size < 1:
        raise ValueError("--batch-size must be positive")
    repo = args.repo.resolve()
    workspace = args.workspace.resolve()
    output = repo / PLAN_GIT_ROOT
    identity = repo / "materials/hero-model-library/source-inventories/kof-jump-container-coverage-v1/identity-map.json"
    authority = repo / "materials/hero-model-library/source-inventories/jump-force-steam-pak-index.json"
    path_index = (args.path_index or (workspace / "GGD-Asset-Library/intake/windows-readonly-20260913/jump-force-pak-index-v1/full-path-index.jsonl.gz")).resolve()
    plan, details = build(identity, authority, path_index, args.batch_size, repo)
    plan_path = output / "plan.json"
    detail_path = output / "selected-paths.jsonl.gz"
    document_path = output / "README.md"
    entry_path = output / "current-resource-entry.json"

    if args.check:
        expected_plan = json.dumps(plan, ensure_ascii=False, indent=2) + "\n"
        if plan_path.read_text(encoding="utf-8") != expected_plan:
            raise ValueError(f"refresh generated plan: {plan_path}")
        temporary = detail_path.with_suffix(".check.gz")
        write_jsonl_gz(temporary, details)
        try:
            if temporary.read_bytes() != detail_path.read_bytes():
                raise ValueError(f"refresh generated detail index: {detail_path}")
        finally:
            temporary.unlink(missing_ok=True)
        expected_document = render_markdown(plan, detail_path)
        if document_path.read_text(encoding="utf-8") != expected_document:
            raise ValueError(f"refresh generated document: {document_path}")
        print("JUMP FORCE full-roster plan is current")
        return 0

    write_json(plan_path, plan)
    write_jsonl_gz(detail_path, details)
    document_path.parent.mkdir(parents=True, exist_ok=True)
    document_path.write_text(render_markdown(plan, detail_path), encoding="utf-8")
    entry = {
        "schema": "ggd.jumpforce-full-roster-current-resource@1",
        "sourceId": SOURCE_ID,
        "status": "63-high-confidence-character-families-path-indexed; one-time PAK mirror pending; extraction/conversion/validation/registration/deployment pending",
        "planGitPath": str(plan_path.relative_to(repo)),
        "planSha256": sha256(plan_path),
        "detailIndexGitPath": str(detail_path.relative_to(repo)),
        "detailIndexSha256": sha256(detail_path),
        "documentGitPath": str(document_path.relative_to(repo)),
        "documentSha256": sha256(document_path),
        "summary": plan["summary"],
        "runtimeSelectable": False,
        "productionDeploymentVerified": False,
    }
    write_json(entry_path, entry)
    print(f"Planned JUMP FORCE characters: {len(plan['characters'])}; member relations: {len(details)}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
