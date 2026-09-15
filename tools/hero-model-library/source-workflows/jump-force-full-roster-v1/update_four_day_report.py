#!/usr/bin/env python3
"""Generate the JUMP FORCE full-roster block in the fixed recent-assets report."""
from __future__ import annotations

import argparse
import collections
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
PLAN = ROOT / "materials/hero-model-library/source-inventories/jump-force-full-roster-v1/plan.json"
UNENCRYPTED_AUDIT = ROOT / "materials/hero-model-library/source-inventories/jumpforce-unencrypted-readonly-audit-v1/receipt.json"
LOOSE_AUDIO_BATCH = ROOT / "materials/hero-model-library/priority-evidence/jump-force-full-roster-v1/loose-streaming-audio-batch.json"
AUDIO_BINDINGS = ROOT / "materials/hero-model-library/priority-evidence/jump-force-full-roster-v1/audio-identity-bindings.json"
REPORT = ROOT / "materials/hero-model-library/近四日新增模型動作特效清單.md"
START = "<!-- generated:jump-force-full-roster-v1:start -->"
END = "<!-- generated:jump-force-full-roster-v1:end -->"
BOUNDARY = "<!-- generated:jumpforce-assets-v2:start -->"
PRIMARY_CLASSES = ("model", "texture", "skeleton", "motion", "vfx", "audio")
LABELS = {
    "model": "模型",
    "texture": "貼圖",
    "skeleton": "骨架",
    "motion": "動作 dependency roots",
    "vfx": "VFX／技能設定",
    "audio": "音效／語音",
}


def load_plan(path: Path = PLAN) -> dict:
    plan = json.loads(path.read_text(encoding="utf-8"))
    summary = plan.get("summary", {})
    if (
        plan.get("schema") != "ggd.jumpforce-full-roster-plan@1"
        or summary.get("characters") != 63
        or plan.get("scope", {}).get("batchCount") != 9
        or summary.get("selectedMemberRelations") != 86238
        or summary.get("paksMirroredThisRun") != 6
        or summary.get("payloadFilesExtractedThisRun") != 0
        or summary.get("convertedModelsThisRun") != 0
        or summary.get("backendOptionsAdded") != 0
        or summary.get("productionDeployments") != 0
    ):
        raise ValueError("JUMP FORCE full-roster plan is absent, stale or overclaims readiness")
    if len(plan.get("characters", [])) != 63:
        raise ValueError("JUMP FORCE full-roster character list is incomplete")
    return plan


def load_unencrypted_audit(path: Path = UNENCRYPTED_AUDIT) -> dict:
    audit = json.loads(path.read_text(encoding="utf-8"))
    audio = audit.get("frozenStreamingAudio", {})
    if (
        audit.get("schema") != "ggd.jumpforce-unencrypted-readonly-audit@1"
        or audit.get("fullMirror", {}).get("fullRawGame", {}).get("fileCount") != 3466
        or audit.get("fullMirror", {}).get("pakAuthority", {}).get("summary", {}).get("verifiedContainers") != 6
        or audio.get("decodedWavFiles") != 4034
        or audio.get("sourceCopyIntegrity", {}).get("allByteIdentical") is not True
        or audit.get("minimalCompletePilotAssessment", {}).get("result") != "no eligible pilot"
    ):
        raise ValueError("JUMP FORCE unencrypted audit is absent, stale or overclaims readiness")
    return audit


def load_loose_audio_batch(path: Path = LOOSE_AUDIO_BATCH) -> dict:
    receipt = json.loads(path.read_text(encoding="utf-8"))
    summary = receipt.get("summary", {})
    if (
        receipt.get("schema") != "ggd.jumpforce-loose-streaming-audio-batch@1"
        or summary.get("decodedWavFilesVerified") != 4034
        or summary.get("nativeCharacterGroups") != 37
        or summary.get("highConfidenceCharacterGroups") != 32
        or summary.get("characterGroupsLinkedToExistingHeroes") != 8
        or summary.get("distinctExistingHeroIdsLinked") != 12
        or summary.get("runtimeAudioBindingsCreated") != 0
        or receipt.get("stages", {}).get("runtimeSelectable") is not False
    ):
        raise ValueError("JUMP FORCE loose Streaming audio receipt is absent, stale or overclaims readiness")
    return receipt


def load_audio_bindings(path: Path = AUDIO_BINDINGS) -> dict:
    receipt = json.loads(path.read_text(encoding="utf-8"))
    summary = receipt.get("summary", {})
    if (
        receipt.get("schema") != "ggd.jumpforce-audio-identity-bindings@1"
        or summary.get("nativeCharacterGroupsBound") != 12
        or summary.get("distinctHeroIds") != 17
        or summary.get("publicPackageGroupsBound") != 12
        or summary.get("steamLooseGroupsBound") != 8
        or summary.get("publicPackageAudioFilesLinked") != 2724
        or summary.get("steamLooseAudioFilesLinked") != 427
        or summary.get("runtimeBindingsCreated") != 0
    ):
        raise ValueError("JUMP FORCE audio identity binding receipt is absent, stale or overclaims readiness")
    return receipt


def block(plan: dict, audit: dict | None = None, loose_audio: dict | None = None, audio_bindings: dict | None = None) -> str:
    audit = audit or load_unencrypted_audit()
    loose_audio = loose_audio or load_loose_audio_batch()
    audio_bindings = audio_bindings or load_audio_bindings()
    summary = plan["summary"]
    audio_summary = loose_audio["summary"]
    binding_summary = audio_bindings["summary"]
    mirror = plan["localMirrorTarget"]
    s3_status = mirror["s3Status"]
    if s3_status == "pending":
        s3_note = "尚未有 `backup_intake.py` 的完整讀回 receipt，不能算作 S3 已備份"
    elif s3_status == "s3-readback-verified":
        s3_note = "完整 archive 已讀回且逐成員 SHA-256 已驗證；仍不代表已抽取或上架"
    else:
        raise ValueError("JUMP FORCE full-roster plan has an unrecognized S3 status")
    lines = [
        START,
        "",
        "### JUMP FORCE 63 角色批次抽取／轉換計畫",
        "",
        f"現有完整 path index 已產生 **{summary['characters']} 個高信度 `chr####` 角色 family**，分 **{plan['scope']['batchCount']} 批**，共 **{summary['selectedMemberRelations']:,} 筆** patch-winner member 關係。這份數字包含六類主素材與 {summary['assetClasses']['metadata']['memberRelations']:,} 筆角色設定 member；不需要再掃描 LV99 的 Steam 目錄。",
        "",
        f"本機 mirror 已固定在 `{mirror['rawGameRoot']}`：**{mirror['fileCount']:,} 檔／{mirror['bytes']:,} bytes**，六顆 authority PAK 的檔名、bytes 與 SHA-256 已 **{mirror['verifiedPakCount']}/6** 逐檔通過。完整索引與收據見 `{mirror['evidenceGitPath']}`；S3 狀態為 `{s3_status}`（{s3_note}）。後續抽取不再需要 LV99 分享。",
        "",
        f"另外的未加密唯讀稽核已核對 Streaming {audit['frozenStreamingAudio']['sourceCopyIntegrity']['sourceAwbCount']} 個 AWB 與凍結副本完全相同，現有解碼 WAV {audit['frozenStreamingAudio']['decodedWavFiles']:,} 段；逐段說話者、語言、事件皆未審，因此不能綁英雄或技能。`chr0430` 達伊原始擷取與 VFX 套件仍完整保留；目前 v6 候選已通過面數、draw、貼圖與三視圖技術驗證，但仍缺動作綁定與 owner 視覺核准。",
        "",
        f"本輪已用可續跑查核器對現有 **{audio_summary['decodedWavFilesVerified']:,} WAV／{audio_summary['decodedWavBytesVerified']:,} bytes** 完成逐檔 SHA-256 與 WAV header 驗證（bank 標籤：語音 {audio_summary['decodedVoiceLabelFiles']:,}、音效 {audio_summary['decodedSoundEffectFiles']:,}、音樂 {audio_summary['decodedMusicFiles']:,}）；{audio_summary['nativeCharacterGroups']} 個原生角色群中 {audio_summary['highConfidenceCharacterGroups']} 組有高信度身份，其中 {audio_summary['characterGroupsLinkedToExistingHeroes']} 組／{binding_summary['steamLooseAudioFilesLinked']:,} 檔連到 {audio_summary['distinctExistingHeroIdsLinked']} 個既有 GGD hero ID；同時對已保存公開原包完成總計 {binding_summary['publicPackageGroupsBound']} 組／{binding_summary['publicPackageAudioFilesLinked']:,} 檔／{binding_summary['distinctHeroIds']} 個 hero ID 的角色家族來源關係。這是來源登記；逐段聽審、事件／技能與 runtime 綁定仍為 0。",
        "",
        "| 主素材類別 | 有候選角色 | 套件 | member 關係 | 狀態 |",
        "|---|---:|---:|---:|---|",
    ]
    readiness = plan.get("batchOneReadiness")
    if readiness is not None:
        table_start = lines.index("| 主素材類別 | 有候選角色 | 套件 | member 關係 | 狀態 |")
        lines[table_start:table_start] = [
            f"第一批（Goku、Vegeta、Trunks、Frieza、Piccolo、Cell、Luffy）已重跑**六顆 PAK live SHA**與 **{readiness['plannedMemberRelations']:,} 筆** patch-winner member 前置檢查；收據 `{readiness['gitPath']}`。AES key 狀態為 `{readiness['keyState']}`，因此 extraction 是 `{readiness['extraction']}`。這是只讀就緒證據，**不是**已抽取／已轉換／已註冊／可切換。",
            "",
        ]
    for key in PRIMARY_CLASSES:
        row = summary["assetClasses"][key]
        lines.append(
            f"| {LABELS[key]} | {row['charactersWithCandidates']} | {row['packages']:,} | {row['memberRelations']:,} | path-indexed／planned，未抽取 |"
        )
    lines.extend([
        "",
        "| 批次 | 高信度原生 ID／角色 family |",
        "|---:|---|",
    ])
    batches: dict[int, list[str]] = collections.defaultdict(list)
    for row in plan["characters"]:
        batches[row["batch"]].append(f"`{row['nativeCharacterId']}` {row['characterName']}")
    for batch, characters in sorted(batches.items()):
        lines.append(f"| {batch} | {'、'.join(characters)} |")
    lines.extend([
        "",
        f"進度收據：`mirrorPak={summary['paksMirroredThisRun']}/6`、`pakExtracted={summary['payloadFilesExtractedThisRun']}`、`convertedModel={summary['convertedModelsThisRun']}`、`convertedMotion={summary['convertedMotionsThisRun']}`、`convertedVfx={summary['convertedVfxThisRun']}`、`pakDecodedAudio={summary['decodedAudioThisRun']}`、`looseAudioVerified={audio_summary['decodedWavFilesVerified']}`、`sourceHeroGroups={binding_summary['nativeCharacterGroupsBound']}`、`runtimeAudio={audio_summary['runtimeAudioBindingsCreated']}`、`backend={summary['backendOptionsAdded']}`、`deployed={summary['productionDeployments']}`。PAK 現階段是 `verified-local/path-indexed/planned`；鏡像完成不得計為已抽取、已轉換、已驗收、已註冊、可切換或已部署。",
        "",
        END,
        "",
    ])
    return "\n".join(lines)


def expected_report(current: str, generated: str) -> str:
    if START in current or END in current:
        if current.count(START) != 1 or current.count(END) != 1:
            raise ValueError("JUMP FORCE full-roster report markers are ambiguous")
        begin = current.index(START)
        finish = current.index(END, begin) + len(END)
        return current[:begin] + generated.rstrip() + current[finish:]
    if current.count(BOUNDARY) != 1:
        raise ValueError("JUMP FORCE report insertion boundary is missing or ambiguous")
    return current.replace(BOUNDARY, generated + BOUNDARY)


def update(report_path: Path = REPORT, *, write: bool) -> None:
    current = report_path.read_text(encoding="utf-8")
    expected = expected_report(current, block(load_plan(), load_unencrypted_audit(), load_loose_audio_batch(), load_audio_bindings()))
    if write:
        report_path.write_text(expected, encoding="utf-8")
    elif current != expected:
        raise ValueError("JUMP FORCE full-roster report block is stale")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--check", action="store_true")
    args = parser.parse_args()
    update(write=args.write)
    print("JUMP FORCE full-roster report block is current")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
