#!/usr/bin/env python3
"""Upsert the generated Dai PN010 VFX review-candidate status."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
REPORT = ROOT / "materials/hero-model-library/近四日新增模型動作特效清單.md"
AUTHORITY = ROOT / "materials/hero-model-library/priority-evidence/infinity-strash-dai-vfx-components-v1/review-candidates-v1/review-candidates.json"
START = "<!-- generated:infinity-strash-dai-vfx-review-candidates-v1:start -->"
END = "<!-- generated:infinity-strash-dai-vfx-review-candidates-v1:end -->"
INSERT_BEFORE = "<!-- generated:asset-review-portal:start -->"


def block() -> str:
    data = json.loads(AUTHORITY.read_text(encoding="utf-8"))
    summary = data["summary"]
    if data.get("schema") != "ggd.infinity-strash-dai-vfx-review-candidates@1":
        raise ValueError("Unexpected Dai review candidate authority")
    if summary.get("ownerApproved") != 0 or summary.get("approvedBindings") != 0 or summary.get("runtimeMutations") != 0:
        raise ValueError("Dai review candidate authority overclaims an approval or runtime mutation")
    return f"""{START}

### 達伊 PN010：靜態／程序化 VFX 視覺候選

既有 18 張合格來源貼圖與 8 顆 StaticMesh 支援元件已組成 {summary['reviewCandidatesBuilt']} 組可重現的審查候選；每組固定輸出 t=0.0／0.5／1.0，共 {summary['fixedPreviewFrames']} 張視圖。六個來源根與全部 26 個支援元件都有明確候選關係，另以 `unused-assets.json` 保留它們目前仍未綁 runtime 的狀態。

這些畫面是安全的作者工具程序化預覽，不是原作 Niagara 時序還原，也沒有推測技能事件或骨架掛點。owner 核准 0、`approvedBindings` 0、runtime mutation 0、正式站部署 0；後續統一審查頁應讀取 `priority-evidence/infinity-strash-dai-vfx-components-v1/review-candidates-v1/review-candidates.json`，不得由畫面自動建立技能綁定。

- 固定接觸表：`apps/client/public/infinity-strash-dai-vfx-review-candidates.png`
- 獨立審查頁：`apps/client/public/infinity-strash-dai-vfx-review-candidates.html`

{END}"""


def render(current: str) -> str:
    generated = block()
    if START in current or END in current:
        if current.count(START) != 1 or current.count(END) != 1:
            raise ValueError("Dai review candidate marker is incomplete or duplicated")
        before, tail = current.split(START, 1)
        _, after = tail.split(END, 1)
        return before + generated + after
    if current.count(INSERT_BEFORE) != 1:
        raise ValueError("Four-day report insertion anchor is absent or ambiguous")
    return current.replace(INSERT_BEFORE, generated + "\n\n" + INSERT_BEFORE)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    current = REPORT.read_text(encoding="utf-8")
    expected = render(current)
    if args.write:
        REPORT.write_text(expected, encoding="utf-8")
        print("Updated Dai PN010 VFX review candidate block")
    elif current != expected:
        raise SystemExit("Four-day Dai PN010 VFX review candidate block is stale; run --write")
    else:
        print("Dai PN010 VFX review candidate block is current")


if __name__ == "__main__":
    main()
