#!/usr/bin/env python3
"""Upsert the generated KOF conversion paragraph in the four-day report."""
from __future__ import annotations

import argparse
import json
from pathlib import Path


REPO = Path(__file__).resolve().parents[4]
REPORT = REPO / "materials/hero-model-library/近四日新增模型動作特效清單.md"
INDEX = REPO / "materials/hero-model-library/source-inventories/kof-3d-sources-v1/inventory.json"
NATIVE_PREFLIGHT = REPO / "materials/hero-model-library/source-inventories/kof-xiv-native-container-probe-v2/receipt.json"
ASH_AUDIO_RECEIPT = REPO / "materials/hero-model-library/priority-evidence/kof-xv-ash-audio-review-v1/receipt.json"
START = "- KOF 3D 來源批次："
ANCHOR = "\n- SSBU c00 第二批黑底修復版："


def render() -> str:
    data = json.loads(INDEX.read_text(encoding="utf-8"))
    preflight = json.loads(NATIVE_PREFLIGHT.read_text(encoding="utf-8"))
    ash_audio = json.loads(ASH_AUDIO_RECEIPT.read_text(encoding="utf-8"))
    xiv = data["kofXiv"]
    left, right = data["kofXv"]["newBudgetCandidates"]["candidates"]
    universal = data["kofXv"]["universalAtlasStaticComponents"]["components"]
    textures = xiv["textureCandidates"]["summary"]
    backup = xiv["textureCandidates"]["backup"]
    summary = preflight["summary"]
    if (preflight.get("schema") != "ggd.kof-xiv-native-container-probe@2"
            or summary.get("completeModelPilots") != 0
            or summary.get("nativeClipLabelCandidates") != 338):
        raise ValueError("KOF XIV native preflight is stale or overclaims conversion")
    return (
        f"- KOF 3D 來源批次：KOF XIV MAI、IOR、KYO 已抽取並逐檔 SHA 驗證 "
        f"{xiv['selectedExtraction']['verification']['checkedFiles']:,} 檔／{xiv['selectedExtraction']['verification']['checkedBytes']:,} bytes；"
        "18 個代表 OBAC／OMIR／OSEC／OTRA 容器已固定檔頭、bytes、SHA，Assimp 6.0 實讀 0/18；Blender 5.2.1 background probe 在列舉 importer 前即崩潰，"
        "所以模型、骨架、原生動作與 VFX 仍是已解包／轉換阻塞。"
        f"新增只讀前導解析已把 MAI／IOR／KYO 的 {summary['verifiedSourceFiles']} 個核心容器再次逐檔對 manifest 驗證，"
        f"只安全保留骨架名稱及 {summary['nativeClipLabelCandidates']} 個 OTRA 動作標籤；"
        "OBAC 幾何／權重／bind 與 OTRA transform／時序仍未解碼，完整模型 pilot 仍為 0。"
        f"已額外解碼 {textures['files']} 張 1P COL DDS 為最大 {textures['maxEdge']}px PNG（{textures['bytes']:,} bytes），"
        f"完整 S3 GET／逐 member SHA 通過：`{backup['s3Uri']}`；"
        "但尚未材質綁定與視覺驗收。KOF XV Ash 左／右髮候選為 "
        f"{left['metrics']['triangles']:,}／{right['metrics']['triangles']:,} 面、{left['metrics']['maxSkinJoints']} joints、"
        f"最大 {left['metrics']['maxTextureDimension']}px；現行 hard policy 實跑均因 {left['metrics']['drawCalls']} draw "
        "超過 6 而失敗，且 0 原生 gameplay clips，仍作完整歷史候選保存。"
        f"同來源的 universal-atlas 左／右髮靜態元件已進 Git，為 {universal[0]['triangles']:,}／{universal[1]['triangles']:,} 面、"
        f"各 {universal[0]['drawPrimitives']} draw、{universal[0]['jointCount']} joints、12 張 256px 貼圖；"
        "GGD hard errors 與 Khronos errors 均為 0，但最終 Blender rerender、英雄綁定、動作、後台選項與部署仍未完成。"
        f"另有 Ash {ash_audio['summary']['convertedReviewMp3Files']} 段 Float32 WAV 已轉為本機 MP3 聽審候選，"
        "每段均已完整解碼與固定來源／輸出 SHA-256；逐段語言、說話者、類別與事件仍為待確認，"
        f"runtime 綁定 {ash_audio['summary']['runtimeBindingsCreated']}、後台選項 {ash_audio['summary']['backendSelectableAssets']}、"
        f"正式部署 {ash_audio['summary']['productionDeployments']}。"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    original = REPORT.read_text(encoding="utf-8")
    line = render()
    if START in original:
        start = original.index(START)
        end = original.find("\n- ", start + len(START))
        end = len(original) if end < 0 else end
        expected = original[:start] + line + original[end:]
    else:
        anchor = original.index(ANCHOR)
        expected = original[:anchor] + "\n" + line + original[anchor:]
    if args.write:
        REPORT.write_text(expected, encoding="utf-8")
    elif original != expected:
        raise SystemExit("four-day report KOF paragraph is stale; run with --write")
    print(json.dumps({"report": str(REPORT.relative_to(REPO)), "written": args.write}, ensure_ascii=False))


if __name__ == "__main__":
    main()
