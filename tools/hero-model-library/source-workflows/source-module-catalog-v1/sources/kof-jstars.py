#!/usr/bin/env python3
"""Build the KOF and J-Stars source-module catalog fragment from receipts."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


SCHEMA = "ggd.source-module-catalog-fragment@1"
OUTPUT = Path("materials/hero-model-library/source-module-catalog-v1/kof-jstars.json")
KOF_INVENTORY = Path(
    "materials/hero-model-library/source-inventories/kof-3d-sources-v1/inventory.json"
)
KOF_XIV_SOURCE = Path(
    "materials/hero-model-library/source-inventories/kof-xiv-priority-v1/source-manifest.json"
)
KOF_XIV_PROBE = Path(
    "materials/hero-model-library/source-inventories/kof-xiv-native-container-probe-v2/receipt.json"
)
KOF_XIV_AUDIO = Path(
    "materials/hero-model-library/source-inventories/kof-xiv-priority-v1/audio-file-index.json"
)
KOF_LOCAL_RECEIPT = Path(
    "materials/hero-model-library/source-inventories/kof-local-pipeline-v1/receipt.json"
)
KOF_XV_AUDIO = Path(
    "materials/hero-model-library/priority-evidence/kof-xv-ash-audio-review-v1/receipt.json"
)
KOF_XV_MAI_SFM = Path(
    "materials/hero-model-library/source-inventories/kof-xv-sfm-material-route-v1/receipt.json"
)
JSTARS_PLAN = Path(
    "materials/hero-model-library/source-inventories/jstars-owner-archive-v1/plan.json"
)
JSTARS_EXTRACT = Path(
    "materials/hero-model-library/source-inventories/jstars-owner-archive-extract-v1/receipt.json"
)
JSTARS_PIPELINE = Path(
    "materials/hero-model-library/priority-evidence/jstars-conversion-runtime-v1/pipeline-receipt.json"
)
JSTARS_PRIORITY_SOURCE = Path(
    "materials/hero-model-library/priority-evidence/jstars-priority-six-v1/source-receipt.json"
)
JSTARS_PRIORITY_PIPELINE = Path(
    "materials/hero-model-library/priority-evidence/jstars-priority-six-v1/pipeline-receipt.json"
)


def load(repo: Path, path: Path) -> dict[str, Any]:
    return json.loads((repo / path).read_text(encoding="utf-8"))


def module(stage: str, count: int | None, note: str) -> dict[str, Any]:
    return {"stage": stage, "count": count, "note": note}


def audio_counts(audio_index: dict[str, Any]) -> dict[str, dict[str, int]]:
    counts: dict[str, dict[str, int]] = {}
    for item in audio_index["files"]:
        native_id = item["nativeCharacterId"]
        row = counts.setdefault(native_id, {"sfx": 0, "voice": 0})
        path = item["path"]
        if "/Sound/se/" in path:
            row["sfx"] += 1
        elif "/Sound/voice/" in path:
            row["voice"] += 1
    return counts


def kof_xiv_group(repo: Path, inventory: dict[str, Any]) -> dict[str, Any]:
    source = load(repo, KOF_XIV_SOURCE)
    probe = load(repo, KOF_XIV_PROBE)
    audio = load(repo, KOF_XIV_AUDIO)
    local_receipt = load(repo, KOF_LOCAL_RECEIPT)
    probed = {row["nativeCharacterId"]: row for row in probe["characters"]}
    indexed = {
        row["nativeDirectoryId"]: row
        for row in inventory["kofXiv"]["wadPathIndex"]["nativeDirectories"]
    }
    texture_files = inventory["kofXiv"]["textureCandidates"]["files"]
    textures: dict[str, int] = {}
    for item in texture_files:
        native_id = item["nativeCharacterId"]
        textures[native_id] = textures.get(native_id, 0) + 1
    decoded_audio = audio_counts(audio)
    candidates = []
    for row in sorted(source["characters"], key=lambda item: item["nativeCharacterId"]):
        native_id = row["nativeCharacterId"]
        path_counts = indexed[native_id]["assetKindCounts"]
        probe_row = probed[native_id]
        candidates.append(
            {
                "character": row["nameZh"],
                "id": native_id,
                "work": "THE KING OF FIGHTERS XIV",
                "model": module(
                    "native-containers-acquired-format-blocked",
                    path_counts["modelContainer"],
                    "已取得原生模型容器；Assimp reader 接受 0，幾何與權重尚未解碼。",
                ),
                "texture": module(
                    "decoded-review-candidates-not-material-bound",
                    textures.get(native_id, 0),
                    "256px 1P COL PNG 已確定性轉換；材質槽位與模型視覺驗收仍受原生模型 converter 阻擋。",
                ),
                "skeleton": module(
                    "name-table-indexed-hierarchy-not-decoded",
                    probe_row["readOnlyParsedTables"]["omir"]["parsedNameCount"],
                    "數量是 OMIR 骨架名稱，不代表 hierarchy、bind pose 或 skin weight 已解碼。",
                ),
                "motion": module(
                    "native-labels-indexed-transforms-not-decoded",
                    probe_row["readOnlyParsedTables"]["otra"]["nativeClipLabelCandidateCount"],
                    "數量是 OTRA 動作標籤候選，不是可播放 clip；transform、時間與事件皆未解碼。",
                ),
                "vfx": module(
                    "native-containers-indexed-unbound",
                    path_counts["vfxContainerOrDependency"],
                    "原生特效容器／依賴已取得；runtime blend、timing、attachment 與技能綁定皆為 0。",
                ),
                "sfx": module(
                    "decoded-unclassified-pending-listening",
                    decoded_audio[native_id]["sfx"],
                    "來自角色 Sound/se 目錄；檔案可解碼，但事件與技能綁定未審。",
                ),
                "voice": module(
                    "decoded-unclassified-pending-listening",
                    decoded_audio[native_id]["voice"],
                    "來自角色 Sound/voice 目錄；語言、說話者與事件仍待逐段聽審。",
                ),
                "registration": module(
                    "not-registered",
                    0,
                    "KOF XIV runtime selectable model、motion binding 與 VFX binding 均為 0。",
                ),
                "deployment": module(
                    "not-deployed",
                    0,
                    "沒有正式部署證據。",
                ),
                "evidence": [
                    str(KOF_XIV_SOURCE),
                    str(KOF_XIV_PROBE),
                    str(KOF_XIV_AUDIO),
                    str(KOF_LOCAL_RECEIPT),
                    str(KOF_INVENTORY),
                ],
            }
        )
    return {
        "sourceId": inventory["kofXiv"]["selectedExtraction"]["sourceId"],
        "title": "THE KING OF FIGHTERS XIV",
        "platform": "Windows (Steam)",
        "version": "local-v126",
        "status": (
            "source-acquired-conversion-blocked"
            if local_receipt["summary"]["nativeFormatReaderAcceptedFiles"] == 0
            else "source-acquired-reader-accepted-validation-pending"
        ),
        "evidencePaths": [
            str(KOF_INVENTORY),
            str(KOF_XIV_SOURCE),
            str(KOF_XIV_PROBE),
            str(KOF_XIV_AUDIO),
            str(KOF_LOCAL_RECEIPT),
        ],
        "summary": (
            "MAI／IOR／KYO 共 1,088 個檔案逐檔 SHA-256 通過；原生格式 reader 接受 0，"
            "runtime selectable models、motion bindings、VFX bindings 與 production deployments 全為 0。"
        ),
        "candidates": candidates,
    }


def kof_xv_group(repo: Path, inventory: dict[str, Any]) -> dict[str, Any]:
    xv = inventory["kofXv"]
    ash_audio = load(repo, KOF_XV_AUDIO)
    mai_sfm = load(repo, KOF_XV_MAI_SFM)
    components = xv["universalAtlasStaticComponents"]["components"]
    probes = {row["character"]: row for row in xv["materialMappingProbes"]}
    ash = {
        "character": "Ash Crimson",
        "id": "ASH",
        "work": "THE KING OF FIGHTERS XV",
        "model": module(
            "converted-structural-pass-static-component",
            len(components),
            "兩個 universal-atlas GLB 結構檢查通過；仍缺最終視覺重繪、英雄綁定與後台切換。",
        ),
        "texture": module(
            "embedded-structural-pass-visual-review-pending",
            sum(item["textureCount"] for item in components),
            "兩個靜態 GLB 各含 12 張 256px 貼圖；數量合計 24，最終視覺重繪仍待完成。",
        ),
        "skeleton": module(
            "structural-pass-static-rig",
            components[0]["jointCount"],
            "兩個靜態 GLB 各為 258 joints；這不是兩套已綁定英雄 runtime skeleton。",
        ),
        "motion": module(
            "missing-native-gameplay-motion",
            0,
            "兩個靜態元件皆有 0 個原生遊戲動作 clip。",
        ),
        "vfx": module("unknown", None, "現有證據沒有可歸屬且可綁定的 Ash VFX 候選數。"),
        "sfx": module("unclassified-audio-pending-listening", None, "86 段音訊尚未逐段區分語音與音效。"),
        "voice": module(
            "review-converted-identity-unconfirmed",
            ash_audio["summary"]["convertedReviewMp3Files"],
            "86 個 MP3 僅供本機聽審；逐段語言、說話者與事件確認皆為 0。",
        ),
        "registration": module("not-registered", 0, "backend selectable assets 為 0。"),
        "deployment": module("not-deployed", 0, "production deployments 為 0。"),
        "evidence": [str(KOF_INVENTORY), str(KOF_XV_AUDIO)],
    }

    def raw_candidate(character: str, native_id: str, sfm: bool = False) -> dict[str, Any]:
        probe = probes[character]
        evidence = [str(KOF_INVENTORY)]
        motion_stage = "unknown"
        motion_count: int | None = None
        motion_note = "沒有可驗證的原生 gameplay motion 候選數。"
        model_note = (
            f"原始 FBX 已取得並驗 SHA；拒絕的 Assimp GLB 有 "
            f"{probe['rejectedAssimpGlb']['externalImageUriCount']} 個外部貼圖 URI，"
            "缺權威材質槽位對應，不能算可上架 GLB。"
        )
        if sfm:
            evidence.append(str(KOF_XV_MAI_SFM))
            motion_stage = "static-pose-only-not-gameplay"
            motion_count = mai_sfm["animation"]["sourceStaticPoseActions"]
            motion_note = "SFM body/head 各一個靜態 pose action；原生 gameplay clips 為 0。"
            model_note += " SFM head/body 來源已擷取，但已稽核 reader 仍不接受。"
        return {
            "character": character,
            "id": native_id,
            "work": "THE KING OF FIGHTERS XV",
            "model": module("source-fbx-acquired-conversion-rejected", 1, model_note),
            "texture": module(
                "source-textures-decoded-mapping-blocked",
                probe["suppliedTextures"]["decodedCount"],
                "來源 TGA 已解碼並驗 SHA；缺權威材質槽位 mapping，不能視為已綁定貼圖。",
            ),
            "skeleton": module(
                "source-rig-indexed-conversion-rejected",
                probe["nativeFbx"]["sourceBoneCounts"][0],
                "數量是原始 FBX bone count；拒絕的轉換產物不能作為 runtime skeleton。",
            ),
            "motion": module(motion_stage, motion_count, motion_note),
            "vfx": module("unknown", None, "現有證據沒有可歸屬且可綁定的 VFX 候選數。"),
            "sfx": module("source-reserve-unreviewed", None, "音訊 reserve 有索引線索，未有逐段分類數。"),
            "voice": module("source-reserve-unreviewed", None, "語言、說話者與事件尚未逐段確認。"),
            "registration": module("not-registered", 0, "沒有後台可選模型證據。"),
            "deployment": module("not-deployed", 0, "沒有正式部署證據。"),
            "evidence": evidence,
        }

    return {
        "sourceId": "kof-xv-local-candidates-20260914",
        "title": "THE KING OF FIGHTERS XV",
        "platform": "PC community ports / author rips; installed Steam game not found",
        "version": None,
        "status": "mixed-static-candidates-and-blocked-sources",
        "evidencePaths": [str(KOF_INVENTORY), str(KOF_XV_AUDIO), str(KOF_XV_MAI_SFM)],
        "summary": (
            "Ash 有兩個結構通過但尚未視覺驗收的靜態 GLB；Mai／Iori 原始 FBX 仍卡在材質槽位。"
            "後台可選模型與正式部署均為 0。"
        ),
        "candidates": [
            ash,
            raw_candidate("Iori Yagami", "IOR", False),
            raw_candidate("Mai Shiranui", "MAI", True),
        ],
    }


def kof_maximum_impact_group(inventory: dict[str, Any]) -> dict[str, Any]:
    titles = inventory["kofMaximumImpact"]["seriesEntries"]
    return {
        "sourceId": "kof-maximum-impact-local-inventory-20260914",
        "title": "KOF Maximum Impact series",
        "platform": "PlayStation 2 / Taito Type X2",
        "version": None,
        "status": "not-found-in-local-inventory",
        "evidencePaths": [str(KOF_INVENTORY)],
        "summary": (
            "Maximum Impact、Maximum Impact 2、Regulation A 只有來源與工具線索；"
            "本機沒有 ISO、遊戲目錄、逐檔 SHA、模型或其他可轉換模組。"
        ),
        "candidates": [
            {
                "character": None,
                "id": None,
                "work": row["title"],
                "model": module("source-not-found", 0, "沒有本機 payload；工具線索不是模型候選。"),
                "texture": module("source-not-found", 0, "沒有本機 payload。"),
                "skeleton": module("source-not-found", 0, "沒有本機 payload。"),
                "motion": module("source-not-found", 0, "沒有本機 payload。"),
                "vfx": module("source-not-found", 0, "沒有本機 payload。"),
                "sfx": module("source-not-found", 0, "沒有本機 payload。"),
                "voice": module("source-not-found", 0, "沒有本機 payload。"),
                "registration": module("not-registered", 0, "沒有候選可註冊。"),
                "deployment": module("not-deployed", 0, "沒有正式部署證據。"),
                "evidence": [str(KOF_INVENTORY)],
            }
            for row in titles
        ],
    }


def kof_2002_group(inventory: dict[str, Any]) -> dict[str, Any]:
    record = inventory["kof2002UnlimitedMatch"]
    source = record["registeredSources"][0]
    count = record["voiceExtraction"]["riffWavFiles"]
    return {
        "sourceId": source["sourceId"],
        "title": "THE KING OF FIGHTERS 2002 UNLIMITED MATCH",
        "platform": source["platform"],
        "version": "Steam build 8463197",
        "status": "voice-extracted-pending-listening-review",
        "evidencePaths": [str(KOF_INVENTORY)],
        "summary": f"voice.dat 已抽出 {count} 個 RIFF/WAV；角色、語言與事件尚未映射。",
        "candidates": [
            {
                "character": None,
                "id": "voice.dat-unmapped-pool",
                "work": "THE KING OF FIGHTERS 2002 UNLIMITED MATCH",
                "model": module("out-of-scope", 0, "此來源只登記 voice.dat。"),
                "texture": module("out-of-scope", 0, "此來源只登記 voice.dat。"),
                "skeleton": module("out-of-scope", 0, "此來源只登記 voice.dat。"),
                "motion": module("out-of-scope", 0, "此來源只登記 voice.dat。"),
                "vfx": module("out-of-scope", 0, "此來源只登記 voice.dat。"),
                "sfx": module("unclassified-audio", None, "尚未逐段區分音效與語音。"),
                "voice": module(
                    "extracted-unmapped-pending-listening",
                    count,
                    "數量是容器抽出的 RIFF/WAV，不代表已歸屬角色或可綁定事件。",
                ),
                "registration": module("not-registered", 0, "尚未完成角色／事件映射。"),
                "deployment": module("not-deployed", 0, "沒有正式部署證據。"),
                "evidence": [str(KOF_INVENTORY)],
            }
        ],
    }


def jstars_group(repo: Path) -> dict[str, Any]:
    plan = load(repo, JSTARS_PLAN)
    extract = load(repo, JSTARS_EXTRACT)
    pipeline = load(repo, JSTARS_PIPELINE)
    priority_source = load(repo, JSTARS_PRIORITY_SOURCE)
    priority_pipeline = load(repo, JSTARS_PRIORITY_PIPELINE)
    priority_by_rank = {row["priority"]: row for row in priority_source["characters"]}
    archive_inventoried = extract.get("status") == "inventoried-read-only"
    candidates = []
    for row in plan["characters"]:
        has_sample = row["nativeId"] is not None
        sample_stage = ("native-container-sample-indexed" if has_sample else
                        "owner-cpk-inventoried-native-id-unmapped" if archive_inventoried else
                        "planned-source-missing")
        sample_note = (
            "另有原生 PAK/STPK 對照樣本與 native token；$CH0 尚未解碼，不能算已轉換。"
            if has_sample
            else "owner archive 與 CPK 已盤點，但該角色 native ID 尚未建立可審查對照；不以名單順序猜測。"
            if archive_inventoried
            else "owner archive 尚未在本機可見；沒有可驗證的角色模組數。"
        )
        role = "可操作" if row["role"] == "playable" else "支援"
        candidate = {
                "character": row["nameZhTW"],
                "id": row["nativeId"],
                "work": row["workZhTW"],
                "model": module(sample_stage, None, f"{sample_note} 模型、貼圖、骨架皆未準備成 runtime candidate。"),
                "texture": module(sample_stage, None, f"{sample_note} 沒有已轉換並完成材質映射的貼圖候選數。"),
                "skeleton": module(sample_stage, None, f"{sample_note} 沒有已解碼 hierarchy、bind pose 與 skin weight 的骨架。"),
                "motion": module(sample_stage, None, f"{role}角色候選；{sample_note} 沒有已映射六態動作。"),
                "vfx": module(sample_stage, None, f"{sample_note} 沒有已審核技能事件綁定。"),
                "sfx": module(sample_stage, None, f"{sample_note} 沒有逐段播放審查或 runtime 綁定。"),
                "voice": module(sample_stage, None, f"{sample_note} 沒有逐段說話者、語言與事件審核。"),
                "registration": module("not-registered", 0, "此 owner-archive pipeline registered models 為 0。"),
                "deployment": module("not-deployed", 0, "production deployment 未驗證。"),
                "evidence": [str(JSTARS_PLAN), str(JSTARS_EXTRACT), str(JSTARS_PIPELINE)],
            }
        priority_rank = row.get("priorityRank")
        if priority_rank is not None:
            candidate.update({
                "ggdHeroIds": row.get("ggdHeroIds", []),
                "priorityRank": priority_rank,
                "intendedDefaultSource": row.get("intendedDefaultSource"),
                "intendedDefaultModules": row.get("intendedDefaultModules", []),
                "pipelineStatus": row.get("pipelineStatus"),
            })
            source_row = priority_by_rank[priority_rank]
            for kind in ("model", "motion", "vfx", "sfx", "voice"):
                source_module = source_row["modules"][kind]
                candidate[kind] = module(
                    source_module["status"],
                    1 if source_module.get("candidateContainerFound") else 0,
                    source_module["reason"],
                )
            candidate["registration"] = module(
                "not-registered",
                0,
                "第一優先六名 pipeline receipt 的 registeredOptions 為 0；獨立後台選項尚未建立。",
            )
            candidate["deployment"] = module(
                "not-deployed",
                0,
                "第一優先六名 pipeline receipt 明列 productionDeploymentVerified=false。",
            )
            candidate["evidence"].extend([str(JSTARS_PRIORITY_SOURCE), str(JSTARS_PRIORITY_PIPELINE)])
        candidates.append(candidate)
    return {
        "sourceId": plan["sourceId"],
        "title": plan["sourceGame"],
        "platform": plan["platformRequested"],
        "version": plan.get("platformVersion"),
        "status": pipeline["status"],
        "evidencePaths": [
            str(JSTARS_PLAN), str(JSTARS_EXTRACT), str(JSTARS_PIPELINE),
            str(JSTARS_PRIORITY_SOURCE), str(JSTARS_PRIORITY_PIPELINE),
        ],
        "summary": (
            f"名單含 {plan['rosterCounts']['playable']} 名可操作角色與 "
            f"{plan['rosterCounts']['support']} 名支援角色；owner archive 狀態為 {extract['status']}。"
            "owner 指定六名已排入 model/motion/vfx/sfx/voice 優先轉換與預設來源計畫；"
            f"第一優先來源查核確認原生 ID {priority_source['summary']['nativeIdsConfirmed']} 名、"
            f"runtime-ready 模組 {priority_source['summary']['runtimeReadyModules']}；"
            f"獨立選項註冊 {priority_pipeline['counts']['registeredOptions']}、"
            f"已套用預設 {priority_pipeline['counts']['automaticDefaultsApplied']}、正式部署 0。"
        ),
        "candidates": candidates,
    }


def build(repo: Path) -> dict[str, Any]:
    inventory = load(repo, KOF_INVENTORY)
    return {
        "schema": SCHEMA,
        "sourceGroups": [
            kof_xiv_group(repo, inventory),
            kof_xv_group(repo, inventory),
            kof_maximum_impact_group(inventory),
            kof_2002_group(inventory),
            jstars_group(repo),
        ],
    }


def validate(fragment: dict[str, Any]) -> None:
    if fragment.get("schema") != SCHEMA:
        raise ValueError("unexpected schema")
    modules = (
        "model",
        "texture",
        "skeleton",
        "motion",
        "vfx",
        "sfx",
        "voice",
        "registration",
        "deployment",
    )
    group_keys = ("sourceId", "title", "platform", "version", "status", "evidencePaths", "summary", "candidates")
    candidate_keys = ("character", "id", "work", *modules, "evidence")
    for group in fragment.get("sourceGroups", []):
        missing = [key for key in group_keys if key not in group]
        if missing:
            raise ValueError(f"source group missing keys: {missing}")
        for candidate in group["candidates"]:
            missing = [key for key in candidate_keys if key not in candidate]
            if missing:
                raise ValueError(f"candidate missing keys: {missing}")
            for name in modules:
                value = candidate[name]
                if set(value) != {"stage", "count", "note"}:
                    raise ValueError(f"invalid module value for {name}: {value}")
                if value["count"] is not None and not isinstance(value["count"], int):
                    raise ValueError(f"invalid count for {name}: {value['count']}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    repo = args.repo.resolve()
    fragment = build(repo)
    validate(fragment)
    rendered = json.dumps(fragment, ensure_ascii=False, indent=2) + "\n"
    output = args.output if args.output.is_absolute() else repo / args.output
    if args.check:
        if not output.exists() or output.read_text(encoding="utf-8") != rendered:
            raise SystemExit(f"out of date: {output}")
        return 0
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(rendered, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
