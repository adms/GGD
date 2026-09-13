#!/usr/bin/env python3
"""Generate the Sonic formal-decimation paragraph in the four-day report."""
from __future__ import annotations

import argparse
import json
from pathlib import Path


REPO = Path(__file__).resolve().parents[4]
REPORT = REPO / "materials/hero-model-library/近四日新增模型動作特效清單.md"
DOWNLOADS = REPO / "materials/hero-model-library/download-sources.json"
KOF_INDEX = REPO / "materials/hero-model-library/source-inventories/kof-3d-sources-v1/inventory.json"
START = "- Sonic c00 "
END = "\n- SSBU c00 第二批黑底修復版："


def render() -> str:
    data = json.loads(DOWNLOADS.read_text())
    source = next(row for row in data["publicSources"] if row.get("id") == "gitlab-ssbu-models")
    candidate = next(row for row in source["componentCandidates"] if row.get("id") == "ssbu-sonic-c00-static-skinned-v2")
    receipt = candidate["s3BackupEvidence"]["gitPath"]
    sonic = (
        f"- Sonic c00 正式減面版：舊 8,980 面黑底修復版完整保留；新 `{candidate['sha256'][:8]}…` "
        f"為 **{candidate['triangles']:,}** 面、{candidate['drawPrimitives']} draw、{candidate['jointCount']} joints、"
        f"{candidate['textureCount']} 張最大 256px 貼圖。固定 material-weighted 流程保留眼睛、皮膚與材質分配，"
        "兩次建置 byte-identical，Khronos 0 error／0 warning、GGD budget、alpha audit 及前／後／斜三視圖 A/B 驗收通過；"
        "各視圖變化像素為 0.85%～1.41%。已通過 8,000 面正式採用幾何目標，但來源動作仍為 0，且沒有對應 GGD 英雄定義，"
        "所以維持待設計獨立元件，後台選項與部署都是 0。Full S3 轉換階段 28 檔已完整 GET 與逐 member SHA 驗證："
        f"`{candidate['s3Uri']}`；Git 收據：`{receipt}`。"
    )
    ultimate = next(row for row in data["publicSources"] if row.get("id") == "parallel-ns-ultimate14")
    motion = next(row for row in ultimate["componentCandidates"] if row.get("id") == "ssbu-sonic-c00-ultimate14-motion-v1")
    motion_line = (
        f"- Sonic c00 Ultimate14 原生動作元件：兩次獨立匯入與匯出後的 GLB 均為 `{motion['sha256'][:8]}…`，"
        f"{motion['triangles']:,} 面、{motion['drawPrimitives']} draw、{motion['jointCount']} joints、{motion['textureCount']} 張最大 256px 貼圖，"
        f"保留 {motion['nativeAnimationCount']} 段社群 MOD 原生 Transform 動作。Khronos 0/0、GGD hard errors 0，30 張 Babylon WebGL 抽樣已驗收；"
        "5 draw 與每段 345 channels 超過 3/300 警戒值，繼續列為效能審查項。目前缺 idle、run、hurt、death 及 GGD 語意映射，"
        "沒有 Sonic 英雄 ID，所以是已驗收獨立元件，後台選項與部署仍為 0。"
        f"S3 轉換階段 {motion['s3Uri']}已完整讀回驗證。"
    )
    if not KOF_INDEX.is_file():
        return sonic + "\n" + motion_line
    kof = json.loads(KOF_INDEX.read_text())
    xiv = kof["kofXiv"]
    ash = kof["kofXv"]["newBudgetCandidates"]
    left, right = ash["candidates"]
    s3 = ash["s3BackupReceipt"]
    kof_line = (
        f"- KOF 3D 來源批次：KOF XIV WAD 清單有 {xiv['wadPathIndex']['listedFiles']:,} 檔／"
        f"{xiv['wadPathIndex']['listedBytes']:,} payload bytes／{xiv['wadPathIndex']['nativeDirectoryCount']} 個原生目錄；"
        f"MAI、IOR、KYO 已抽取並逐檔 SHA 驗證 {xiv['selectedExtraction']['verification']['checkedFiles']:,} 檔／"
        f"{xiv['selectedExtraction']['verification']['checkedBytes']:,} bytes，但專有模型、動作與 VFX 轉換器仍未驗證。"
        f"KOF XV Ash 左／右髮候選已轉為 {left['metrics']['triangles']:,}／{right['metrics']['triangles']:,} 面、"
        f"{left['metrics']['maxSkinJoints']} joints、{left['metrics']['imageCount']} 張最大 {left['metrics']['maxTextureDimension']}px 貼圖；"
        f"兩者仍為 {left['metrics']['drawCalls']} draw、0 gameplay clips，且未做視覺 A/B，所以狀態維持轉換候選，"
        f"未進 runtime Git、未設預設或後台選項。Maximum Impact 系列實檔仍為 0；KOF 2002 UM 分開列為 2D。"
        f"Ash 六檔轉換階段已做完整 S3 GET／逐 member SHA：`{s3['s3Uri']}`。"
    )
    return sonic + "\n" + motion_line + "\n" + kof_line


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    original = REPORT.read_text()
    start = original.index(START)
    end = original.index(END, start)
    expected = original[:start] + render() + original[end:]
    old = "Mario 另有一個加入 5 段 Ultimate14 特殊動作的獨立衍生元件，舊 c00 v1 與新 v2 也都保留"
    new = "Mario 另有加入 5 段 Ultimate14 特殊動作的獨立衍生元件；Sonic 另有 10 段 Ultimate14 原生 Transform 動作的已驗收獨立元件，舊 c00 v1 與新 v2 也都保留"
    require_count = expected.count(old)
    if require_count != 1 and new not in expected:
        raise ValueError(f"Unexpected Ultimate14 overview paragraph count: {require_count}")
    expected = expected.replace(old, new)
    if args.write:
        REPORT.write_text(expected)
    elif original != expected:
        raise ValueError("Four-day report Sonic paragraph is stale; run with --write")
    print(json.dumps({"report": str(REPORT.relative_to(REPO)), "sonicCandidate": "ssbu-sonic-c00-static-skinned-v2", "written": args.write}, ensure_ascii=False))


if __name__ == "__main__":
    main()
