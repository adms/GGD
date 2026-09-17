#!/usr/bin/env python3
"""Maintain the generated Terry path-index paragraph in the four-day report."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


REPO = Path(__file__).resolve().parents[4]
INVENTORY = REPO / "materials/hero-model-library/source-inventories/kof-xiv-terry-path-index-v1/inventory.json"
REPORT = REPO / "materials/hero-model-library/近四日新增模型動作特效清單.md"
START = "<!-- generated:kof-xiv-terry-path-index-v1:start -->"
END = "<!-- generated:kof-xiv-terry-path-index-v1:end -->"


def render() -> str:
    data = json.loads(INVENTORY.read_text(encoding="utf-8"))
    summary = data["summary"]
    counts = summary["assetKindCounts"]
    return "\n".join([
        START,
        "### KOF XIV Terry（TRY）下一角色批次",
        "",
        f"已從固定 WAD listing 建立 `Chara/TRY/` {summary['pathIndexedFiles']:,} 筆／{summary['pathIndexedBytes']:,} listed bytes 的可重現索引。分類為完整身體容器 1、帽子配件容器 1、骨架／蒙皮中繼 {counts['skeleton']}、原生動作容器 {counts['animation']}、角色貼圖 {counts['texture']}、VFX 記錄／網格／貼圖 {counts['vfx']}、語音路徑 {counts['voice']}、音效路徑 {counts['sound-effect']}、音訊中繼 {counts['audio-metadata']}。",
        "",
        "目前本機沒有掛載 `assets.wad`，因此本批 payload 讀取 0、逐檔 payload SHA-256 0、解包 0、轉換 0、聽審／視覺驗收 0、runtime 綁定 0、後台選項 0、部署 0。逐列 `indexEvidenceSha256` 只固定 offset、listed bytes 與路徑，不能當成檔案雜湊。Terry 身份以 `TRY.obac`、`v_006_try_` 與既有 `ssbu-dolly` 記錄交叉核對，仍待重新掛載後抽出完整身體做視覺確認。",
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
        raise ValueError("refresh KOF XIV Terry four-day report block")
    print(json.dumps({"report": str(REPORT.relative_to(REPO)), "written": args.write}, ensure_ascii=False))


if __name__ == "__main__":
    main()
