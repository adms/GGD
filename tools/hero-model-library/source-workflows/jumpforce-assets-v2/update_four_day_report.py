#!/usr/bin/env python3
"""Insert the generated JUMP FORCE readiness snapshot into the four-day report."""
from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
INVENTORY = ROOT / "materials/hero-model-library/source-inventories/jumpforce-assets-v2/inventory.json"
REPORT = ROOT / "materials/hero-model-library/近四日新增模型動作特效清單.md"
START = "<!-- generated:jumpforce-assets-v2:start -->"
END = "<!-- generated:jumpforce-assets-v2:end -->"
BOUNDARY = "## 七、所有模型下拉選項與未使用素材"


def block() -> str:
    data = json.loads(INVENTORY.read_text())
    s, dai = data["summary"], data["dai"]
    decimation = dai["formalDecimationCandidate"]
    return "\n".join([
        START,
        "",
        "### JUMP FORCE 已取得來源補充查核",
        "",
        f"JUMP FORCE 公開音訊目錄已核對為 **{s['publicPackages']} 個原包**，其中 {s['publicCharacterPackages']} 個是角色標籤包，`_Common Sounds` 是共用音效包；本機 {s['publicPackagesLiveShaVerified']}/{s['publicPackages']} 原包重新 SHA-256 通過。中央逐檔索引共 {s['publicAudioFiles']:,} 檔／約 {s['publicAudioDurationSeconds'] / 3600:.2f} 小時。Steam App 816020 build 8523149 另保留 {s['steamAwbBanks']} 個原生 AWB，已解碼 {s['steamDecodedAudioFiles']:,} 個 WAV。",
        "",
        f"原生 bank ID 與公開角色群可直接核對 {s['nativeToPublicCharacterMappings']} 組；另有 {s['unresolvedNativeCharacterGroups']} 個原生 ID 未確認。聽審佇列只收錄 {s['listeningReviewGroups']} 個可核對角色群，排除共用 bank 與未確認 ID；逐段說話者、語言、對白、音效／技能事件及 runtime 綁定完成數都是 0。",
        "",
        f"達伊 `chr0430` 已有 {dai['nativePackages']:,} 個抽出套件、{dai['modelComponents']} 個蒙皮模型元件、{dai['texturePng']} 張 PNG 與 {dai['joints']} joints。review-v4 原件為 {decimation['before']['triangles']:,} 面／{decimation['before']['drawPrimitives']} draw／{decimation['before']['maxTextureEdge']}px；正式可重建候選已降至 **{decimation['after']['triangles']:,} 面／{decimation['after']['maxTextureEdge']}px**，骨架、蒙皮、材質配置保留，Khronos 0 error、有限值通過、固定鏡頭亮像素 XOR 最高 {decimation['visualMaxLitXorPct']:.6f}%（門檻 5%）。但仍為 **{decimation['after']['drawPrimitives']} draw > hard limit {decimation['drawCallLimit']}**；現有安全 atlas 只適用 {decimation['atlasEligiblePrimitives']}/20 primitives，精確材質語意至少 {decimation['exactSemanticMaterialGroups']} 組，且原生 clips 為 0。狀態是「已轉換、幾何／貼圖／視覺已驗收；draw call 與六態動作阻塞」，未進 Git runtime、未註冊、不可切換、未部署。轉換階段 {decimation['s3Backup']['fileCount']} 檔已完整 S3 GET 與逐檔 SHA-256 驗證：`{decimation['s3Backup']['s3Uri']}`。共享卷本批未掛載；Asta／Kenshiro 僅有 PAK 路徑索引，沒有把 metadata 當成本批抽出實檔。",
        "",
        END,
        "",
    ])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    text = REPORT.read_text()
    generated = block()
    if START in text or END in text:
        if text.count(START) != 1 or text.count(END) != 1:
            raise ValueError("JUMP FORCE generated markers are ambiguous")
        begin = text.index(START)
        finish = text.index(END, begin) + len(END)
        expected = text[:begin] + generated.rstrip() + text[finish:]
    else:
        if text.count(BOUNDARY) != 1:
            raise ValueError("four-day insertion boundary is missing or ambiguous")
        expected = text.replace(BOUNDARY, generated + BOUNDARY)
    if args.check:
        if text != expected:
            raise ValueError("JUMP FORCE four-day report block is stale")
    else:
        REPORT.write_text(expected)
    print("JUMP FORCE four-day report block is current")


if __name__ == "__main__":
    main()
