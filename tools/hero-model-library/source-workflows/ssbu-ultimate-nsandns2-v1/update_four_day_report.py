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
SSBU_ROSTER = REPO / "materials/hero-model-library/source-inventories/ssbu-ultimate-local-roster-v1/inventory.json"
START = "- Sonic c00 "
END = "\n- SSBU c00 第二批黑底修復版："


def render() -> str:
    data = json.loads(DOWNLOADS.read_text())
    roster = json.loads(SSBU_ROSTER.read_text())
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
    matching_lines = []
    for fighter, name in (("chrom", "Chrom"), ("lucina", "Lucina")):
        row = next(
            item for item in ultimate["componentCandidates"]
            if item.get("id") == f"ssbu-{fighter}-c00-ultimate14-motion-v1"
        )
        samples = row["nativeAnimationCount"] * 3
        matching_lines.append(
            f"- {name} c00 Ultimate14 同骨架動作元件：`{row['sha256'][:8]}…`，"
            f"{row['triangles']:,} 面、{row['drawPrimitives']} draw、{row['jointCount']} joints、"
            f"{row['textureCount']} 張最大 256px 貼圖、{row['nativeAnimationCount']} 段社群 MOD 原生 Transform 動作。"
            f"兩次最終 GLB byte-identical，Khronos 0/0、GGD hard errors 0，Babylon WebGL {samples} 張 start/mid/end 抽樣完成；"
            f"{row['drawPrimitives']} draw 與每段 {row['animationChannelCountPerClip']} channels 超過 3/300 警戒值。"
            "原生 root 方向會隨片段變化，動作語意與六態映射仍待審；它是已驗收獨立元件，尚未建立英雄 ID、後台選項或部署。"
            f"完整轉換階段已上傳 `{row['s3Uri']}`，完整 GET、archive SHA 與逐 member SHA 驗證通過。"
        )
    roster_summary = roster["summary"]
    roster_line = (
        f"- SSBU 完整本機來源清冊：Worldblender 固定快照共 {roster_summary['worldblenderManifestFiles']:,} 檔／"
        f"{roster_summary['worldblenderManifestBytes']:,} bytes，逐路徑存在與檔案大小核對 {roster_summary['worldblenderLocalSizeMatched']:,}/"
        f"{roster_summary['worldblenderManifestFiles']:,}；fighter 頂層 ID {roster_summary['fighterTopLevelDirectoryCount']}，"
        f"排除 `common`、`element` 後是 {roster_summary['fighterOrFormIdCount']} 個本機 fighter／形態 ID，其中 "
        f"{roster_summary['fighterOrFormWithBodyCandidateCount']} 個有 body／Trainer avatar 候選，合計 "
        f"{roster_summary['primaryBodyOrAvatarCandidateCount']} 個主要 body／avatar costume 候選。這個 92 包含 `koopag` 等形態，"
        "不是任天堂官方可選角色總數。現有已驗收靜態獨立元件 "
        f"{roster_summary['acceptedStaticComponentCount']}、含動作獨立元件 {roster_summary['acceptedMotionComponentCount']}；"
        "本批新增的 Chrom／Lucina 尚未註冊或部署。"
    )
    if not KOF_INDEX.is_file():
        return sonic + "\n" + motion_line + "\n" + "\n".join(matching_lines) + "\n" + roster_line
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
    return sonic + "\n" + motion_line + "\n" + "\n".join(matching_lines) + "\n" + roster_line + "\n" + kof_line


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
    if old in expected:
        expected = expected.replace(old, new)
    roster = json.loads(SSBU_ROSTER.read_text())
    summary = roster["summary"]
    new_overview = (
        f"| SSBU | 先前 16 名已確認只是 Ultimate14 MOD 含 NUANMB 的 fighter IDs；Worldblender 實際有 "
        f"{summary['fighterOrFormIdCount']} 個本機 fighter／形態 ID、{summary['primaryBodyOrAvatarCandidateCount']} 個主要 body／avatar 候選；"
        f"已驗收靜態元件 {summary['acceptedStaticComponentCount']}、含動作元件 {summary['acceptedMotionComponentCount']} | "
        "NSandNS2 目前只有容器清單，payload 讀取 0；新 Chrom／Lucina 尚待動作語意審查與後台註冊，部署 0 |"
    )
    lines = expected.splitlines()
    overview_indexes = [index for index, line in enumerate(lines) if line.startswith("| SSBU |")]
    if len(overview_indexes) != 1:
        raise ValueError(f"Unexpected SSBU overview row count: {len(overview_indexes)}")
    lines[overview_indexes[0]] = new_overview
    expected = "\n".join(lines) + ("\n" if expected.endswith("\n") else "")
    roster_paragraph = (
        "Ultimate14 現有證據為：1 個 23,576,561-byte `Ultimate14.7z`、1,071 個已解包檔、112,082,424 bytes、SHA mismatch 0；"
        f"{summary['ultimate14MotionAliasCount']} 條 NUANMB alias 中有 411 條 transform motion paths、"
        f"{summary['ultimate14UniqueTransformPayloadCount']} 個唯一 transform payload，另有 24 條 model metadata paths。"
        f"完整 Worldblender 固定快照為 {summary['worldblenderManifestFiles']:,} 檔／{summary['worldblenderManifestBytes']:,} bytes；"
        f"{summary['fighterTopLevelDirectoryCount']} 個 fighter 頂層 ID 中，排除共享／輔助的 `common`、`element` 後有 "
        f"{summary['fighterOrFormIdCount']} 個 fighter／形態 ID，其中 {summary['fighterOrFormWithBodyCandidateCount']} 個有常規 body 或 Trainer avatar，"
        f"合計 {summary['primaryBodyOrAvatarCandidateCount']} 個主要 body／avatar costume 候選。這個本機來源 ID 數包含 `koopag` 等形態，"
        "不能當成任天堂官方可選角色數。"
        f"現有已驗收靜態獨立元件 {summary['acceptedStaticComponentCount']}，含動作獨立元件 {summary['acceptedMotionComponentCount']}："
        "Mario 5 段、Sonic 10 段，以及本批 Chrom 9 段、Lucina 13 段 Ultimate14 社群 MOD 原生 Transform 動作。"
        "Chrom／Lucina 已通過結構 hard policy 與 WebGL 抽樣，但仍欠動作語意／六態審查；全部新增元件的後台選項與部署仍為 0。"
    )
    lines = expected.splitlines()
    roster_indexes = [index for index, line in enumerate(lines) if line.startswith("Ultimate14 現有證據為：")]
    if len(roster_indexes) != 1:
        raise ValueError(f"Unexpected SSBU roster paragraph count: {len(roster_indexes)}")
    lines[roster_indexes[0]] = roster_paragraph
    expected = "\n".join(lines) + ("\n" if expected.endswith("\n") else "")
    if args.write:
        REPORT.write_text(expected)
    elif original != expected:
        raise ValueError("Four-day report Sonic paragraph is stale; run with --write")
    print(json.dumps({"report": str(REPORT.relative_to(REPO)), "sonicCandidate": "ssbu-sonic-c00-static-skinned-v2", "written": args.write}, ensure_ascii=False))


if __name__ == "__main__":
    main()
