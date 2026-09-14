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
    rejected = dai["rejectedV1Candidate"]
    return "\n".join([
        START,
        "",
        "### JUMP FORCE 已取得來源補充查核",
        "",
        f"JUMP FORCE 公開音訊目錄已核對為 **{s['publicPackages']} 個原包**，其中 {s['publicCharacterPackages']} 個是角色標籤包，`_Common Sounds` 是共用音效包；本機 {s['publicPackagesLiveShaVerified']}/{s['publicPackages']} 原包重新 SHA-256 通過。中央逐檔索引共 {s['publicAudioFiles']:,} 檔／約 {s['publicAudioDurationSeconds'] / 3600:.2f} 小時。Steam App 816020 build 8523149 另保留 {s['steamAwbBanks']} 個原生 AWB，已解碼 {s['steamDecodedAudioFiles']:,} 個 WAV。",
        "",
        f"原生 bank ID 與公開角色群可直接核對 {s['nativeToPublicCharacterMappings']} 組；另有 {s['unresolvedNativeCharacterGroups']} 個原生 ID 未確認。聽審佇列只收錄 {s['listeningReviewGroups']} 個可核對角色群，排除共用 bank 與未確認 ID；逐段說話者、語言、對白、音效／技能事件及 runtime 綁定完成數都是 0。",
        "",
        f"達伊 `chr0430` 的完整抽出樹已獨立保留 **{dai['frozenTreeFiles']:,} files／{dai['frozenTreeBytes']:,} bytes**，包含 native packages {dai['nativePackages']:,}、model components {dai['modelComponents']}、textures {dai['texturePng']}；原始 review GLB 為 **{dai['originalReviewGlb']['bytes']:,} bytes**，SHA-256 `{dai['originalReviewGlb']['sha256']}`。v1 與 v2 均為獨立候選，沒有覆蓋原始素材。v1 為 **{rejected['triangles']:,} 面／{rejected['maxTextureEdge']}px**；舊收據的人工 `accepted` 已被 owner 於 {rejected['reviewedAt']} 明確拒絕，原因是臉部貼圖與眼睛不正常。v1 不再算有效視覺驗收；其轉換階段 S3 備份仍保留並已讀回驗證：`{rejected['s3Backup']['s3Uri']}`。",
        "",
        f"v2 正式可重建候選為 **{decimation['after']['triangles']:,} 面／{decimation['after']['maxTextureEdge']}px**，run-a／run-b SHA 相同，骨架、蒙皮及材質／貼圖槽保留，Khronos {decimation['khronosErrors']} error、有限值通過，眼部透明層修復的技術檢查通過。owner 已授權所有資源可登記／發布，但 v2 新畫面的視覺品質仍待 owner 審查。候選仍有 **{decimation['after']['drawPrimitives']} draw > hard limit {decimation['drawCallLimit']}**，原生 animations 為 {decimation['after']['animations']}；狀態為已轉換、待 owner 視覺審查、draw call 與六態動作阻塞，**未註冊、不可切換、未部署**。v2 S3 狀態為 `{decimation['s3Backup']['state']}`。其他 JUMP 角色維持兩類：公開音訊實檔依 58 包與中央 SHA 清單記錄；Asta／Kenshiro 等遊戲 PAK 角色目前只有路徑索引，沒有把 metadata 當成已抽出實檔。",
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
