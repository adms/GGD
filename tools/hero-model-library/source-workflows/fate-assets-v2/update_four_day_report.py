#!/usr/bin/env python3
"""Synchronize generated Fate status in the four-day report and library entrypoint."""
from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
INVENTORY = ROOT / "materials/hero-model-library/source-inventories/fate-assets-v2/inventory.json"
REPORT = ROOT / "materials/hero-model-library/近四日新增模型動作特效清單.md"
ASSET_README = ROOT / "materials/asset-library/README.md"
START = "<!-- generated:fate-assets-v2:start -->"
END = "<!-- generated:fate-assets-v2:end -->"
BOUNDARY = "## 七、所有模型下拉選項與未使用素材"


def block() -> str:
    data = json.loads(INVENTORY.read_text())
    s = data["summary"]
    metrics = [row["currentPolicy"]["metrics"] for row in data["minecraftCommunity"]["servants"]]
    triangle_range = f"{min(row['triangles'] for row in metrics)}–{max(row['triangles'] for row in metrics)}"
    draw_range = f"{min(row['drawCalls'] for row in metrics)}–{max(row['drawCalls'] for row in metrics)}"
    texture_range = f"{min(row['maxTextureEdge'] for row in metrics)}–{max(row['maxTextureEdge'] for row in metrics)}"
    channel_range = f"{min(row['channelsPerFrame'] for row in metrics)}–{max(row['channelsPerFrame'] for row in metrics)}"
    policy = data["minecraftCommunity"]["servants"][0]["currentPolicy"]["formalAdoption"]
    return "\n".join([
        START,
        "",
        "### Fate 平台分流與 14 名英靈現行驗收",
        "",
        f"Flemmli97 公開的 Fate/Unlimited Block Works 是 Minecraft Java 1.21.1 社群素材，不是 Fate/unlimited codes PSP 原作擷取。本批逐角重讀 {s['rawModelFilesVerified']} 模型／{s['rawTextureFilesVerified']} 貼圖／{s['rawAnimationFilesVerified']} 動作來源檔與 {s['standardizedGlbsVerified']} 顆標準化 GLB，SHA-256 全數符合；{s['hardPolicyPass']}/{s['minecraftServants']} 顆通過現行 hard policy，每顆 {triangle_range} 面、{draw_range} draw、{texture_range}px 內嵌貼圖、{channel_range} 通道，不需觸發 {policy['decimateWhenTrianglesAbove']:,} 面以上減面流程。",
        "",
        f"動作來源共 {s['sourceClips']} 段，已轉 {s['convertedNativeClips']}，其餘 {s['retainedNoDurationClips']} 段缺來源時長；14 名都以 GLB 內既有來源片段補齊六態映射，缺精確事件名稱者標為 `same-source-semantic-fallback`，不冒稱原生事件語意。",
        "",
        f"本批新增 {s['gitRuntimeComponents']} 顆 Git 成品、{s['eventMapComplete']} 組六態映射；已有定義的 {s['runtimeSelectable']} 名建立 {s['backendHeroOptions']} 個後台候選，全部 `automaticEligible=false`，不搶既有預設。其餘 {s['unmappedServants']} 名進待設計索引。上游授權仍照 ARR 記錄，專案候選註冊核准另列，不混寫。",
        "",
        f"FUC PSP 仍只有 {s['pspInventoryRows']} 筆 Windows 遠端檔名／大小盤點，payload 讀取 {s['pspPayloadBytesRead']} bytes、解包 {s['pspPayloadsExtracted']}；PS2 另行保存 {s['ps2AudioFiles']} 個公開音訊檔，不冒稱 PSP 原生資產。",
        "",
        f"本機 FUC 補充來源已逐檔重驗 {s['fucSourceFilesShaVerified']} 檔／{s['fucSourceBytesShaVerified']} bytes：平台未核社群 MOD 有 {s['fucStandardGlbCandidates']} 顆標準 GLB、{s['fucSkeletonCandidates']} 個骨架候選與 {s['fucCommunityMotionEntries']} 個 MOD 動作項；PSP 平台已核來源只有 {s['fucPspReplacementTextures']} 張 PPSSPP 替換貼圖。原作 PSP FPK/GMO、原生動作與 VFX 仍為 0；另有平台未核角色音訊 {s['fucUnknownPlatformCharacterAudio']} 檔及音樂 {s['fucMusicFiles']} 檔，未經聽審不綁定。",
        "",
        END,
        "",
    ])


def synchronize_legacy_report_text(text: str, data: dict) -> str:
    """Replace the three historical Fate summaries that predate registration."""
    s = data["summary"]
    lines = text.splitlines()
    for index, line in enumerate(lines):
        if line.startswith("- FateUBW Minecraft 14 名英靈："):
            lines[index] = (
                f"- FateUBW Minecraft 14 名英靈：來源共 {s['sourceClips']} 段，{s['convertedNativeClips']} 段已轉換，"
                f"另有 {s['retainedNoDurationClips']} 筆來源未提供 `animation_length`，原始姿勢／公式驅動\u884d生候選仍獨立保留並標 "
                f"`nativeDurationClaim=false`。現有 {s['gitRuntimeComponents']}/14 顆 Git 成品與六態映射；"
                f"{s['runtimeSelectable']} 名已有英雄定義並建立 {s['backendHeroOptions']} 個非預設後台候選，"
                f"其餘 {s['unmappedServants']} 名為 Git 成品待建立英雄；正式站部署 {s['productionDeployed']}。"
            )
        elif line.startswith("| FateUBW 14 名來源動作 |"):
            lines[index] = (
                f"| FateUBW 14 名來源動作 | {s['sourceClips']} 來源＝{s['convertedNativeClips']} 已轉換＋"
                f"{s['retainedNoDurationClips']} 無原生時長 | Minecraft 公開素材庫來源動作；六態缺精確同名片段時用同來源語意備援 | "
                f"{s['gitRuntimeComponents']}/14 GLB 已進 Git；{s['runtimeSelectable']} 名／{s['backendHeroOptions']} 個後台候選已註冊，"
                f"{s['unmappedServants']} 名待建立英雄，部署 {s['productionDeployed']} |"
            )
        elif line.startswith("| FateUBW 無時長\u884d生候選 |"):
            lines[index] = (
                f"| FateUBW 無時長\u884d生候選 | {s['retainedNoDurationClips']} 段 | 3 段 `derived-static-pose-hold`＋2 段 "
                "`derived-procedural-formula-loop` | 獨立\u884d生儲備保留，`nativeDurationClaim=false`；"
                "後台六態候選只使用 GLB 內已有來源片段，不把這 5 段冒稱原生時長 |"
            )
    return "\n".join(lines) + ("\n" if text.endswith("\n") else "")


def asset_readme_paragraph(data: dict) -> str:
    s = data["summary"]
    return (
        f"Fate／Unlimited Block Works 作者素材庫保留 {s['minecraftServants']} 名英靈："
        f"{s['gitRuntimeComponents']} 顆模型與 {s['convertedNativeClips']} 段已轉換來源動作已成為 Git 成品，"
        f"{s['retainedNoDurationClips']} 筆無原生時長來源另作\u884d生儲備並標 `nativeDurationClaim=false`。"
        f"已對 {s['runtimeSelectable']} 名現有英雄註冊 {s['backendHeroOptions']} 個 `automaticEligible=false` 後台候選；"
        f"其餘 {s['unmappedServants']} 名進已取得模型待設計索引。上游權利仍按 ARR 記錄，"
        f"正式站部署 {s['productionDeployed']}。逐角實檔、SHA、S3 位置及驗收證據由 "
        "[已取得模型待設計英雄.json](../hero-model-library/已取得模型待設計英雄.json) 與中央 `current-resources.json` 查詢。"
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    data = json.loads(INVENTORY.read_text())
    text = synchronize_legacy_report_text(REPORT.read_text(), data)
    generated = block()
    if START in text or END in text:
        if text.count(START) != 1 or text.count(END) != 1:
            raise ValueError("Fate report markers are ambiguous")
        begin, finish = text.index(START), text.index(END) + len(END)
        expected = text[:begin] + generated.rstrip() + text[finish:]
    else:
        if text.count(BOUNDARY) != 1:
            raise ValueError("four-day report insertion boundary is missing or ambiguous")
        expected = text.replace(BOUNDARY, generated + BOUNDARY)
    if args.check:
        if REPORT.read_text() != expected:
            raise ValueError("Fate report block is stale")
    else:
        REPORT.write_text(expected)
    readme = ASSET_README.read_text()
    lines = readme.splitlines()
    matches = [i for i,line in enumerate(lines) if line.startswith("Fate／Unlimited Block Works 作者素材庫")]
    if len(matches) != 1:
        raise ValueError("asset-library Fate summary is missing or ambiguous")
    lines[matches[0]] = asset_readme_paragraph(data)
    expected_readme = "\n".join(lines) + ("\n" if readme.endswith("\n") else "")
    if args.check:
        if readme != expected_readme:
            raise ValueError("asset-library Fate summary is stale")
    else:
        ASSET_README.write_text(expected_readme)
    print("Fate four-day report block is current")


if __name__ == "__main__":
    main()
