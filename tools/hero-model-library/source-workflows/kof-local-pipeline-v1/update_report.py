#!/usr/bin/env python3
"""Update the generated KOF pipeline block in the rolling asset report."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


REPO = Path(__file__).resolve().parents[4]
FRAGMENT = REPO / "materials/hero-model-library/source-inventories/kof-local-pipeline-v1/report-fragment.json"
REPORT = REPO / "materials/hero-model-library/近四日新增模型動作特效清單.md"
START = "<!-- generated:kof-local-pipeline-v1:start -->"
END = "<!-- generated:kof-local-pipeline-v1:end -->"


def render() -> str:
    data = json.loads(FRAGMENT.read_text(encoding="utf-8"))
    summary = data["summary"]
    return "\n".join([
        START,
        "### KOF 本機自動化管線",
        "",
        f"MAI／IOR／KYO 現有 payload 已重驗 {summary['verifiedPayloadFiles']:,} 檔，音訊已完整解碼 {summary['decodedAudioFiles']} 檔；已產生 {summary['baseTextureCandidates']} 張本體貼圖與 {summary['vfxTextureCandidates']} 張 VFX 貼圖候選。Owner 已核准 {summary['ownerApprovedVfxTextureCandidates']} 張 VFX 貼圖與 {summary['ownerApprovedNativeEffectGroups']} 個 EFF 群組作為審查輸入。",
        "",
        "OBAC／OMIR／OSEC／OTRA 仍無經稽核 reader，所以 KOF XIV runtime 模型 0、原生動作綁定 0、runtime VFX 綁定 0、後台可選模型 0、正式部署 0。TRY 目前只有 375 筆 WAD 路徑索引，payload 為 0。這些狀態由 `kof-local-pipeline-v1` 逐階段輸入／輸出 SHA-256 收據生成，不讀取 LV99。",
        END,
        "",
    ])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    original = REPORT.read_text(encoding="utf-8")
    block = render()
    if START in original:
        start = original.index(START)
        end = original.index(END, start) + len(END)
        expected = original[:start].rstrip("\n") + "\n\n" + block.rstrip("\n") + "\n\n" + original[end:].lstrip("\n")
    else:
        anchor = "\n## 三、動作"
        position = original.index(anchor)
        expected = original[:position].rstrip("\n") + "\n\n" + block.rstrip("\n") + "\n\n" + original[position:].lstrip("\n")
    if args.write:
        REPORT.write_text(expected, encoding="utf-8")
    elif original != expected:
        raise SystemExit("KOF local pipeline report block is stale")
    print(json.dumps({"report": str(REPORT.relative_to(REPO)), "written": args.write}, ensure_ascii=False))


if __name__ == "__main__":
    main()
