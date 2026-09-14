#!/usr/bin/env python3
"""Generate the cross-generation Nintendo Smash source readiness index.

This is an aggregation and verification boundary, not an extractor.  It reads
the existing, generation-specific authoritative inventories and records exactly
which source bytes are available locally.  A Windows file name, a remote share,
or an NSP/ZIP catalogue row does not become an extracted asset here.

The workspace is intentionally explicit: source materials live next to a GGD
checkout and must not be guessed from an isolated worktree's parent directory.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path


REPO = Path(__file__).resolve().parents[4]
OUTPUT_DIR = REPO / "materials/hero-model-library/source-inventories/smash-cross-generation-readiness-v1"
OUTPUT_JSON = OUTPUT_DIR / "inventory.json"
OUTPUT_MD = OUTPUT_DIR / "README.md"
LEGACY = REPO / "materials/hero-model-library/source-inventories/smash-legacy-sources-v1/inventory.json"
ULTIMATE = REPO / "materials/hero-model-library/source-inventories/ssbu-ultimate-local-roster-v1/inventory.json"
RECONCILIATION = REPO / "materials/hero-model-library/priority-evidence/ssbu-ultimate-nsandns2-20260914/reconciliation.json"
DOWNLOAD_SOURCES = REPO / "materials/hero-model-library/download-sources.json"
CONVERTER = REPO / "tools/hero-model-library/source-workflows/ssbu-models-v1/convert_blend_component.py"
SAMUS_BLENDER522_BLOCKER = REPO / "materials/hero-model-library/priority-evidence/ssbu-samus-blender522-macos-blocker-v1/receipt.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def pin(path: Path, *, git_path: bool = True) -> dict:
    if not path.is_file():
        raise FileNotFoundError(path)
    result = {"bytes": path.stat().st_size, "sha256": sha256(path)}
    result["gitPath" if git_path else "absolutePath"] = str(path.relative_to(REPO)) if git_path else str(path)
    return result


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def blender_tool(path: Path) -> dict:
    result = {
        "absolutePath": str(path),
        "exists": path.is_file(),
        "readiness": "available-for-controlled-rebuild" if path.is_file() else "not-present",
    }
    if not path.is_file():
        return result
    version = subprocess.run([str(path), "--version"], check=True, text=True, capture_output=True).stdout.splitlines()
    result["versionFirstLine"] = next((line.strip() for line in version if line.strip().startswith("Blender ")), None)
    return result


def build(workspace: Path, blender: Path) -> dict:
    library = workspace / "GGD-Asset-Library"
    legacy = read(LEGACY)
    ultimate = read(ULTIMATE)
    reconciliation = read(RECONCILIATION)
    samus_blocker = read(SAMUS_BLENDER522_BLOCKER)
    if legacy.get("schema") != "ggd.smash-legacy-source-inventory@1":
        raise ValueError("unexpected legacy Smash inventory schema")
    if ultimate.get("schema") != "ggd-ssbu-ultimate-local-roster@1":
        raise ValueError("unexpected Ultimate local roster schema")
    if reconciliation.get("schema") != "ggd-ssbu-ultimate-nsandns2-compact-evidence@1":
        raise ValueError("unexpected Ultimate reconciliation schema")
    if samus_blocker.get("schema") != "ggd-ssbu-macos-blender522-blocker@1":
        raise ValueError("unexpected Samus macOS Blender blocker schema")
    if samus_blocker.get("status") != "blocked-tool-init-crash" or samus_blocker.get("converted"):
        raise ValueError("Samus Blender blocker must remain an unconverted tool-init failure")

    ls = legacy["nintendo64"]
    melee = legacy["melee"]
    brawl = legacy["brawl"]
    us = ultimate["summary"]
    stages = reconciliation["sourceStageCounts"]
    expected_catalog_sha = reconciliation["sourceCatalog"]["sha256"]
    actual_catalog_sha = sha256(DOWNLOAD_SOURCES)
    addon_zip = library / "dependencies/smash-ultimate-blender-3.0.4/smash-ultimate-blender-3_0_4.zip"
    addon_root = library / "dependencies/smash-ultimate-blender-3.0.4/extracted/smash-ultimate-blender"
    failed_probe_root = library / "conversions/smash-cross-generation-readiness-v1/mario-c00-repro-build"

    generations = [
        {
            "generation": "Nintendo 64",
            "sourceGame": "Super Smash Bros.",
            "platform": "Nintendo 64",
            "sourceIds": [ls["sourceId"]],
            "sourceFilesRegistered": ls["inventoryRows"],
            "sourcePayloadsReadableNow": ls["payloadFilesRead"],
            "sourcePayloadBytesRead": 0,
            "modelsReadyForConversion": 0,
            "motionsReadyForConversion": 0,
            "vfxReadyForConversion": 0,
            "audioSourceFilesVerified": 0,
            "convertedCandidates": ls["convertedFiles"],
            "backendSelectable": 0,
            "status": "metadata-only",
            "blocker": "Four Windows ROM archive rows have filenames and sizes only; ContentRead=False and no payload SHA-256 exists.",
        },
        {
            "generation": "GameCube",
            "sourceGame": "Super Smash Bros. Melee",
            "platform": "GameCube",
            "sourceIds": melee["sourceIds"],
            "sourceFilesRegistered": melee["memberFiles"],
            "sourcePayloadsReadableNow": melee["memberFiles"],
            "sourcePayloadBytesRead": None,
            "modelsReadyForConversion": melee["modelFiles"],
            "motionsReadyForConversion": melee["nativeMotionFiles"],
            "vfxReadyForConversion": melee["vfxFiles"],
            "audioSourceFilesVerified": melee["wavFiles"],
            "convertedCandidates": melee["convertedFiles"],
            "backendSelectable": melee["backendBindingsVerified"],
            "status": "audio-only-source-bytes-verified",
            "blocker": "The indexed Melee material contains verified WAV and archive members, but no model, texture, skeleton, native-motion, or VFX source bytes.",
        },
        {
            "generation": "Wii",
            "sourceGame": "Super Smash Bros. Brawl",
            "platform": "Wii",
            "sourceIds": brawl["sourceIds"],
            "sourceFilesRegistered": brawl["memberFiles"],
            "sourcePayloadsReadableNow": brawl["memberFiles"],
            "sourcePayloadBytesRead": None,
            "modelsReadyForConversion": brawl["modelFiles"],
            "motionsReadyForConversion": brawl["nativeMotionFiles"],
            "vfxReadyForConversion": brawl["vfxFiles"],
            "audioSourceFilesVerified": brawl["wavFiles"],
            "convertedCandidates": brawl["convertedFiles"],
            "backendSelectable": brawl["backendBindingsVerified"],
            "status": "audio-only-source-bytes-verified",
            "blocker": "The indexed Brawl material contains verified WAV and archive members, but no model, texture, skeleton, native-motion, or VFX source bytes.",
        },
        {
            "generation": "Nintendo Switch community sources",
            "sourceGame": "Super Smash Bros. Ultimate / Ultimate14 MOD",
            "platform": "Nintendo Switch",
            "sourceIds": ["gitlab-ssbu-models", "parallel-ns-ultimate14"],
            "sourceFilesRegistered": us["worldblenderManifestFiles"] + stages["ultimate14CommunityMod"]["verifiedExtractedFiles"],
            "sourcePayloadsReadableNow": us["worldblenderLocalSizeMatched"] + stages["ultimate14CommunityMod"]["verifiedExtractedFiles"],
            "sourcePayloadBytesRead": us["worldblenderManifestBytes"] + reconciliation["localSourceVerification"]["bytes"],
            "modelsReadyForConversion": us["primaryBodyOrAvatarCandidateCount"],
            "motionsReadyForConversion": us["ultimate14UniqueTransformPayloadCount"],
            "vfxReadyForConversion": us["ultimate14EffectFiles"],
            "audioSourceFilesVerified": us["ultimate14DecodedWavFiles"],
            "convertedCandidates": us["acceptedStaticComponentCount"] + us["acceptedMotionComponentCount"],
            "backendSelectable": us["runtimeSelectableCount"],
            "status": "community-model-and-motion-source-present",
            "blocker": "Worldblender is a community-exported model snapshot and Ultimate14 is a MOD patch. Neither establishes an extracted Nintendo base-game payload or a complete original moveset.",
        },
        {
            "generation": "Nintendo Switch game containers",
            "sourceGame": "Super Smash Bros. Ultimate",
            "platform": "Nintendo Switch / NSandNS2",
            "sourceIds": ["windows-game-library-20260912"],
            "sourceFilesRegistered": stages["nsandns2GameContainers"]["inventoryOnlyContainerFiles"],
            "sourcePayloadsReadableNow": 0,
            "sourcePayloadBytesRead": stages["nsandns2GameContainers"]["payloadBytesRead"],
            "modelsReadyForConversion": stages["nsandns2GameContainers"]["modelFilesIdentified"],
            "motionsReadyForConversion": stages["nsandns2GameContainers"]["motionFilesIdentified"],
            "vfxReadyForConversion": 0,
            "audioSourceFilesVerified": 0,
            "convertedCandidates": stages["nsandns2GameContainers"]["convertedFiles"],
            "backendSelectable": stages["nsandns2GameContainers"]["backendSelectableModels"],
            "status": "metadata-only-share-unmounted",
            "blocker": "Three NSandNS2 container metadata rows exist, but this run read 0 payload bytes. Header, member table, title/update/DLC composition, extraction and conversion remain unverified.",
        },
    ]

    model_source = library / "intake/public-models-20260910/gitlab-ssbu-models/source-repository/fighter/mario/model/body/c00/mario-c00.blend"
    probe = {
        "candidateId": "ssbu-mario-c00-static-skinned-v2-repro-probe-20260915",
        "source": {"absolutePath": str(model_source), "exists": model_source.is_file(), "sha256": sha256(model_source) if model_source.is_file() else None},
        "outputRoot": str(failed_probe_root),
        "attempted": True,
        "outcome": "blocked-tool-crash",
        "tool": {"absolutePath": str(blender), "version": blender_tool(blender).get("versionFirstLine")},
        "failure": "Blender background conversion exited from SIGSEGV before emitting a GLB or a conversion receipt. The partial local output root is retained for diagnosis and is not a candidate.",
        "runtimeSelectable": False,
    }
    tooling = {
        "controlledConverter": pin(CONVERTER),
        "smashUltimateBlenderAddon": {
            "archive": pin(addon_zip, git_path=False),
            "extractedRoot": str(addon_root),
            "extractedRootPresent": addon_root.is_dir(),
            "purpose": "Blender importer support for local community SMUB assets; do not execute embedded source scripts.",
        },
        "blender": blender_tool(blender),
        "reproducibilityProbe": probe,
        "samusMacosBlender522Blocker": {
            "evidence": pin(SAMUS_BLENDER522_BLOCKER),
            "candidateId": samus_blocker["candidateId"],
            "source": samus_blocker["source"],
            "status": samus_blocker["status"],
            "converted": samus_blocker["converted"],
            "componentReady": samus_blocker["componentReady"],
            "runtimeSelectable": samus_blocker["runtimeSelectable"],
            "failure": samus_blocker["attempt"]["failure"],
        },
    }
    return {
        "schema": "ggd.smash-cross-generation-readiness@1",
        "scope": "Nintendo 64, GameCube, Wii and Nintendo Switch source readiness. Counts stay source-stage-specific and do not represent the official roster.",
        "sourceRegistration": {
            "catalogGitPath": str(DOWNLOAD_SOURCES.relative_to(REPO)),
            "registeredSourceIds": sorted({source_id for row in generations for source_id in row["sourceIds"]}),
            "centralInventory": "materials/hero-model-library/source-inventories/smash-cross-generation-readiness-v1/inventory.json",
        },
        "inputs": {"legacy": pin(LEGACY), "ultimate": pin(ULTIMATE), "ultimateReconciliation": pin(RECONCILIATION), "downloadSources": pin(DOWNLOAD_SOURCES), "samusMacosBlender522Blocker": pin(SAMUS_BLENDER522_BLOCKER)},
        "inputConsistency": {
            "ultimateReconciliationPinnedDownloadSourcesSha256": expected_catalog_sha,
            "currentDownloadSourcesSha256": actual_catalog_sha,
            "ultimateReconciliationMatchesCurrentCatalog": expected_catalog_sha == actual_catalog_sha,
            "status": "current" if expected_catalog_sha == actual_catalog_sha else "stale-upstream-reconciliation-rebuild-required",
            "effect": "The cross-generation counts retain the current checked-in reconciliation values, but its source-catalog pin must be rebuilt before treating that reconciliation as a fresh full-pipeline check.",
        },
        "workspace": {"absolutePath": str(workspace), "assetLibrary": str(library), "assetLibraryPresent": library.is_dir()},
        "generations": generations,
        "tooling": tooling,
        "summary": {
            "generationRows": len(generations),
            "metadataOnlyGenerationRows": sum(row["status"].startswith("metadata-only") for row in generations),
            "verifiedLegacyAudioFiles": melee["wavFiles"] + brawl["wavFiles"],
            "switchCommunityModelCandidates": us["primaryBodyOrAvatarCandidateCount"],
            "switchCommunityMotionPayloads": us["ultimate14UniqueTransformPayloadCount"],
            "switchAcceptedIndependentComponents": us["acceptedStaticComponentCount"] + us["acceptedMotionComponentCount"],
            "readableOriginalGamePayloads": legacy["verification"]["currentReadableOriginalGamePayloads"],
            "newConvertedCandidatesThisAudit": 0,
            "macosBlenderToolInitBlockers": 1,
            "backendSelectableThisAudit": 0,
            "productionDeploymentVerified": False,
        },
        "truthBoundary": [
            "The GameCube and Wii counts are locally verified audio source members, not full game extractions.",
            "The Switch model and motion counts are community-source candidates. They are not Nintendo base-game payloads.",
            "NSandNS2 containers are inventory metadata only until their local bytes, headers and member table are actually read.",
            "The Mario controlled rebuild probe crashed before a GLB existed; it neither adds a component nor changes any approval, dropdown or deployment state.",
            "Samus c00 has a source-pinned macOS Blender 5.2.1 Metal/GPU initialization crash receipt. It is a tool blocker, not a converted model, a component, a dropdown option or a deployment.",
        ],
    }


def render_markdown(data: dict) -> str:
    summary = data["summary"]
    lines = [
        "# 任天堂明星大亂鬥跨世代來源就緒度",
        "",
        "此檔由 `build_inventory.py` 生成。它把 N64、GameCube、Wii、Switch 的本機可讀來源與僅有檔案名稱的來源分開；不可將 ROM／NSP 檔名或舊掃描資料說成已擷取。",
        "",
        f"- 本次可讀的原作遊戲 payload：**{summary['readableOriginalGamePayloads']}**。",
        f"- 已逐檔驗證的 Melee＋Brawl WAV：**{summary['verifiedLegacyAudioFiles']:,}**；兩者都是音訊來源，沒有相應模型、骨架、原生動作或 VFX 原檔。",
        f"- Switch 社群來源：**{summary['switchCommunityModelCandidates']:,}** 個 Worldblender body／avatar 候選、**{summary['switchCommunityMotionPayloads']}** 個 Ultimate14 motion payload；已有 **{summary['switchAcceptedIndependentComponents']}** 個獨立元件，後台可切換仍為 0。",
        f"- 本次新增轉換候選：**{summary['newConvertedCandidatesThisAudit']}**；正式站部署驗證：**否**。",
        f"- macOS Blender 工具初始化阻塞收據：**{summary['macosBlenderToolInitBlockers']}**；不計入轉換候選或可切換模型。",
        f"- Ultimate reconciliation 的 `download-sources.json` pin：**{'一致' if data['inputConsistency']['ultimateReconciliationMatchesCurrentCatalog'] else '已過期，需重建'}**。",
        "",
        "| 世代／來源層 | 已登記來源檔 | 現在可讀 payload | 模型候選 | 動作候選 | VFX | 已驗證音訊 | 已轉換元件 | 後台可選 | 狀態 |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|---|",
    ]
    for row in data["generations"]:
        lines.append(
            f"| {row['generation']} | {row['sourceFilesRegistered']:,} | {row['sourcePayloadsReadableNow']:,} | {row['modelsReadyForConversion']:,} | {row['motionsReadyForConversion']:,} | {row['vfxReadyForConversion']:,} | {row['audioSourceFilesVerified']:,} | {row['convertedCandidates']:,} | {row['backendSelectable']:,} | {row['status']} |"
        )
    probe = data["tooling"]["reproducibilityProbe"]
    samus = data["tooling"]["samusMacosBlender522Blocker"]
    lines += [
        "",
        "## 工具與受控轉換探針",
        "",
        f"- 轉換器：`{data['tooling']['controlledConverter']['gitPath']}`（SHA-256 `{data['tooling']['controlledConverter']['sha256']}`）。",
        f"- Blender：`{data['tooling']['blender']['absolutePath']}`；{data['tooling']['blender']['versionFirstLine'] or '未偵測到版本'}。",
        f"- Mario c00 真實重建探針：{probe['outcome']}。{probe['failure']}",
        f"- Samus c00 macOS Blender 5.2.1 收據：{samus['status']}；`{samus['evidence']['gitPath']}`。{samus['failure']}",
        "",
        "## 限制與下一步",
        "",
    ]
    if not data["inputConsistency"]["ultimateReconciliationMatchesCurrentCatalog"]:
        lines.append(f"- {data['inputConsistency']['effect']}")
    lines.extend(f"- {entry}" for entry in data["truthBoundary"])
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, required=True, help="ABxVFX_EDIT workspace containing GGD-Asset-Library")
    parser.add_argument("--blender", type=Path, default=Path("/Applications/Blender.app/Contents/MacOS/Blender"))
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    data = build(args.workspace.resolve(), args.blender.resolve())
    payload = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    markdown = render_markdown(data)
    if args.write:
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        OUTPUT_JSON.write_text(payload, encoding="utf-8")
        OUTPUT_MD.write_text(markdown, encoding="utf-8")
    elif not OUTPUT_JSON.is_file() or OUTPUT_JSON.read_text(encoding="utf-8") != payload or not OUTPUT_MD.is_file() or OUTPUT_MD.read_text(encoding="utf-8") != markdown:
        raise SystemExit("cross-generation Smash inventory is stale; rerun with --write")
    print(json.dumps({"output": str(OUTPUT_JSON.relative_to(REPO)), "summary": data["summary"], "written": args.write}, ensure_ascii=False))


if __name__ == "__main__":
    main()
