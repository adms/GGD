#!/usr/bin/env python3
"""Insert the generated Fate platform-separated snapshot in the four-day report."""
from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
INVENTORY = ROOT / "materials/hero-model-library/source-inventories/fate-assets-v2/inventory.json"
REPORT = ROOT / "materials/hero-model-library/近四日新增模型動作特效清單.md"
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
        f"動作來源共 {s['sourceClips']} 段，已轉 {s['convertedNativeClips']}，其餘 {s['retainedNoDurationClips']} 段缺來源時長；只保留原名與語意審查候選，未自動綁定。Heracles 是唯一有精確 `run`／`death` 原名的角色，`idle` 仍是無原生時長的程序化衍生候選。",
        "",
        f"本批不新增 runtime 選項：再散布／商用授權核准 {s['rightsApproved']}，事件映射完成 {s['eventMapComplete']}，後台可切換 {s['runtimeSelectable']}。14 顆的共同缺口是 ARR 權利核准、Minecraft 原引擎動作 parity、六態／事件審核與後台整合；其中 {s['unmappedServants']} 名尚無 GGD 英雄定義。",
        "",
        f"FUC PSP 仍只有 {s['pspInventoryRows']} 筆 Windows 遠端檔名／大小盤點，payload 讀取 {s['pspPayloadBytesRead']} bytes、解包 {s['pspPayloadsExtracted']}；PS2 另行保存 {s['ps2AudioFiles']} 個公開音訊檔，不冒稱 PSP 原生資產。",
        "",
        END,
        "",
    ])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    text = REPORT.read_text()
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
        if text != expected:
            raise ValueError("Fate report block is stale")
    else:
        REPORT.write_text(expected)
    print("Fate four-day report block is current")


if __name__ == "__main__":
    main()
