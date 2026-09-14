#!/usr/bin/env python3
"""Inject the generated Palworld VFX/SFX source boundary into the four-day report."""
from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
REPORT = ROOT / "materials/hero-model-library/近四日新增模型動作特效清單.md"
INVENTORY = ROOT / "materials/hero-model-library/source-inventories/palworld-vfx-sfx-v1/inventory.json"
PRESERVED_AUDIT = ROOT / "materials/hero-model-library/source-inventories/palworld-vfx-sfx-v1/preserved-source-audit.json"
BEGIN = "<!-- generated:palworld-vfx-sfx-v1:start -->"
END = "<!-- generated:palworld-vfx-sfx-v1:end -->"


def render():
    data = json.loads(INVENTORY.read_text())
    summary = data["summary"]
    audit = json.loads(PRESERVED_AUDIT.read_text())
    a = audit["summary"]
    return "\n".join([
        BEGIN,
        "### 帕魯原作技能 VFX／SFX 第二輪來源查核",
        "",
        f"Palworld Windows 本體 App {data['source']['steamAppId']}、Build {data['source']['buildId']} 已在來源機建檔；本輪 common 分享未掛載，PAK／IoStore package 清單與 payload 讀取仍為 0。",
        "",
        f"三名共固定 {summary['distinctSourceSkills']} 個去重來源技能、{summary['sourceSkillMotionCandidates']} 段模型內技能動作候選與 {summary['genericCryCandidates']} 段一般叫聲。已逐檔驗證 {a['modelCandidateFilesVerified']} 個模型候選容器（{a['modelCandidateBytesVerified']} bytes）、{a['sourceAssetFilesHashed']} 個保存素材檔（{a['sourceAssetBytesHashed']} bytes）；{a['glbLikeContainersParsed']} 個 GLB／viewer-model 容器結構可讀。技能族動作中 {summary['nativeNameStemSkillMotionCandidates']} 段有原生名稱詞幹關係、{summary['translatedAliasSkillMotionCandidates']} 段只有翻譯別名關係，全部仍待播放審查。",
        "",
        f"三顆目前審查用 component 都有既有政策收據：{a['currentReviewComponentsPolicyClean']} 顆無警告、{a['currentReviewComponentsPolicyWarningOnly']} 顆只有警告、硬阻擋 {a['currentReviewComponentsPolicyHardBlocked']}。警告是枯星龍單段 435 通道，高於動態警戒 {audit['currentReviewComponentPolicy']['dynamicLimits']['channels']['warn']}、低於硬上限 {audit['currentReviewComponentPolicy']['dynamicLimits']['channels']['limit']}；沒有把警告改寫成無條件合格。",
        "",
        f"獨立原作 VFX {summary['acquiredStandaloneVfx']}、技能專屬 SFX {summary['acquiredSkillSpecificSfx']}、轉換 VFX {summary['convertedVfx']}、核准音訊 {summary['approvedAudio']}、runtime 新增綁定 {summary['runtimeBindingsAdded']}、正式部署 {summary['productionDeployed']}。模型貼圖、發光材質、Ring 動作名稱不能代替特效資產，一般叫聲也不能代替技能音效。",
        "",
        "已新增唯讀 Windows 容器 probe 與解包目錄／package-list 掃描器；後續取得清單時會按 JetDragon、WorldTreeDragon、PinkCat 及精確技能代碼產生 UE/Wwise 待審候選，不會嘗試金鑰或繞過容器權限。",
        END,
    ])


def update(text, block):
    if BEGIN in text:
        start = text.index(BEGIN)
        end = text.index(END, start) + len(END)
        return text[:start] + block + text[end:]
    marker = "### 4. 已完成元件、仍不能冒稱完整英雄選項"
    if marker not in text:
        raise ValueError("four-day report insertion marker missing")
    return text.replace(marker, block + "\n\n" + marker, 1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    expected = update(REPORT.read_text(), render())
    if args.check:
        if REPORT.read_text() != expected:
            raise ValueError("four-day report Palworld VFX/SFX block is stale")
    else:
        REPORT.write_text(expected)
    print("Palworld VFX/SFX four-day report block is current")


if __name__ == "__main__":
    main()
