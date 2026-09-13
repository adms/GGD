#!/usr/bin/env python3
"""Generate the Sonic formal-decimation paragraph in the four-day report."""
from __future__ import annotations

import argparse
import json
from pathlib import Path


REPO = Path(__file__).resolve().parents[4]
REPORT = REPO / "materials/hero-model-library/近四日新增模型動作特效清單.md"
DOWNLOADS = REPO / "materials/hero-model-library/download-sources.json"
START = "- Sonic c00 "
END = "\n- SSBU c00 第二批黑底修復版："


def render() -> str:
    data = json.loads(DOWNLOADS.read_text())
    source = next(row for row in data["publicSources"] if row.get("id") == "gitlab-ssbu-models")
    candidate = next(row for row in source["componentCandidates"] if row.get("id") == "ssbu-sonic-c00-static-skinned-v2")
    receipt = candidate["s3BackupEvidence"]["gitPath"]
    return (
        f"- Sonic c00 正式減面版：舊 8,980 面黑底修復版完整保留；新 `{candidate['sha256'][:8]}…` "
        f"為 **{candidate['triangles']:,}** 面、{candidate['drawPrimitives']} draw、{candidate['jointCount']} joints、"
        f"{candidate['textureCount']} 張最大 256px 貼圖。固定 material-weighted 流程保留眼睛、皮膚與材質分配，"
        "兩次建置 byte-identical，Khronos 0 error／0 warning、GGD budget、alpha audit 及前／後／斜三視圖 A/B 驗收通過；"
        "各視圖變化像素為 0.85%～1.41%。已通過 8,000 面正式採用幾何目標，但來源動作仍為 0，且沒有對應 GGD 英雄定義，"
        "所以維持待設計獨立元件，後台選項與部署都是 0。Full S3 轉換階段 28 檔已完整 GET 與逐 member SHA 驗證："
        f"`{candidate['s3Uri']}`；Git 收據：`{receipt}`。"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    original = REPORT.read_text()
    start = original.index(START)
    end = original.index(END, start)
    expected = original[:start] + render() + original[end:]
    if args.write:
        REPORT.write_text(expected)
    elif original != expected:
        raise ValueError("Four-day report Sonic paragraph is stale; run with --write")
    print(json.dumps({"report": str(REPORT.relative_to(REPO)), "sonicCandidate": "ssbu-sonic-c00-static-skinned-v2", "written": args.write}, ensure_ascii=False))


if __name__ == "__main__":
    main()
