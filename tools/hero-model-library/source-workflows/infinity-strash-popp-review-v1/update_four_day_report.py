#!/usr/bin/env python3
"""Render the current Popp five-gap ledger into the fixed four-day report."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
REPORT = ROOT / "materials/hero-model-library/近四日新增模型動作特效清單.md"
LEDGER = ROOT / "materials/hero-model-library/infinity-strash/popp-integration-gaps.json"
START = "<!-- generated:popp-five-gap-closure:start -->"
END = "<!-- generated:popp-five-gap-closure:end -->"
LEGACY_START = "波普原有 5 個缺口已關閉 1 個，現在剩 4 個："
LEGACY_END = "\n\n巴恩與巴蘭仍分開識別。"


def read_ledger() -> dict:
    payload = json.loads(LEDGER.read_text(encoding="utf-8"))
    if payload.get("schema") != "ggd.popp-integration-gap-ledger@1":
        raise ValueError("Popp gap ledger is absent or has the wrong schema")
    summary = payload.get("summary", {})
    if (summary.get("defined"), summary.get("closed"), summary.get("remaining")) != (5, 1, 4):
        raise ValueError("Popp gap ledger does not preserve the verified 1 closed / 4 remaining boundary")
    if summary.get("runtimeBindingsAddedByThisWorkflow") != 7:
        raise ValueError("Popp gap ledger must pin the seven approved VFX candidate relationships")
    if (
        summary.get("eventAudioGameFormatFiles") != 35
        or summary.get("eventAudioCandidateRelationshipsConverted") != 36
        or summary.get("eventAudioNativeEventRows") != 8
        or summary.get("eventAudioRuntimeBlockers") != 36
    ):
        raise ValueError("Popp gap ledger must pin the approved audio conversion boundary")
    return payload


def render(payload: dict) -> str:
    summary = payload["summary"]
    lines = [
        START,
        "",
        f"波普五類整合缺口的固定契約目前為 **已關閉 {summary['closed']}／剩餘 {summary['remaining']}**。"
        "五個 ID、關閉條件與審查規則由 `tools/hero-model-library/source-workflows/"
        "infinity-strash-popp-review-v1/gap-definitions.json` 定義；本表由即時證據重建。",
        "",
        "| ID | 類別 | 狀態 | 關閉條件摘要 | 下一道閘 |",
        "| --- | --- | --- | --- | --- |",
    ]
    for row in payload["gaps"]:
        state = "**已關閉**" if row["closed"] else "剩餘"
        criteria = "；".join(row["closureCriteria"])
        lines.append(
            f"| `{row['id']}` | {row['nameZh']} | {state}／`{row['status']}` | "
            f"{criteria} | {row['ownerReviewPolicy']} |"
        )
    lines.extend([
        "",
        f"審查與技術狀態：GGD VFX 候選 {summary['ggdVfxCandidates']} 個，視覺核准 "
        f"{summary['vfxVisuallyAccepted']}；其中 {summary['vfxBindingProposals']} 個已依來源名稱整理成 Q/W/R 審查提案，"
        f"另 {summary['vfxReserveCandidates']} 個保留未配對。事件音訊候選 {summary['eventAudioCandidates']} 個，逐項聽審 "
        f"{summary['eventAudioReviewed']}。本流程已將核准清單中的 {summary['runtimeBindingsAddedByThisWorkflow']} 個 VFX 候選關係綁到 Q/W/R；"
        "精確原生 Niagara 時序與 root-specific mesh layer 仍明列缺口。",
        f"音訊技術收尾已由 manifest 流程產生 {summary['eventAudioGameFormatFiles']} 份不同 MP3，保留 "
        f"{summary['eventAudioCandidateRelationshipsConverted']} 筆候選關係並整理成 {summary['eventAudioNativeEventRows']} 個原生事件。"
        f"由於核准收據沒有指定唯一 GGD 技能／狀態目標，{summary['eventAudioRuntimeBlockers']} 筆仍逐項阻擋 runtime 綁定；正式站部署為 0。",
        "Kagayaki 維持 `modelSelectionMode=manual` 的單一作用中選擇，Magikaru、Mahouno 仍是獨立後台候選；"
        "此狀態只證明功能分支資料，正式站部署尚未驗證。",
        "",
        "- 權威狀態：`materials/hero-model-library/infinity-strash/popp-integration-gaps.json`",
        "- 模型／武器／死亡頁：`apps/client/public/popp-integration-review.html`",
        "- 音訊逐項播放頁：`apps/client/public/asset-review-portal.html`（篩選「波普音訊」）",
        "- 音訊轉換收據：`materials/hero-model-library/priority-evidence/infinity-strash-popp-approved-audio-v1/receipt.json`",
        "- VFX 播放頁：`apps/client/public/asset-review.html`",
        "",
        END,
    ])
    return "\n".join(lines)


def expected(original: str, block: str) -> str:
    if START in original or END in original:
        if original.count(START) != 1 or original.count(END) != 1:
            raise ValueError("Popp generated report markers are malformed")
        left, rest = original.split(START, 1)
        _, right = rest.split(END, 1)
        return left + block + right
    if original.count(LEGACY_START) != 1 or original.count(LEGACY_END) != 1:
        raise ValueError("Legacy Popp five-gap paragraph is absent or ambiguous")
    left, rest = original.split(LEGACY_START, 1)
    _, right = rest.split(LEGACY_END, 1)
    return left + block + LEGACY_END + right


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    original = REPORT.read_text(encoding="utf-8")
    target = expected(original, render(read_ledger()))
    if args.write:
        REPORT.write_text(target, encoding="utf-8")
    elif original != target:
        raise SystemExit("Popp five-gap report section is stale; run with --write")
    print(json.dumps({"report": REPORT.relative_to(ROOT).as_posix(), "written": args.write}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
