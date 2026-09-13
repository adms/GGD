#!/usr/bin/env python3
"""Insert the generated pending-review portal status into the four-day report."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
REPORT = ROOT / "materials/hero-model-library/近四日新增模型動作特效清單.md"
QUEUE = ROOT / "materials/hero-model-library/review/asset-review-portal-v1/review-queue.json"
START = "<!-- generated:asset-review-portal:start -->"
END = "<!-- generated:asset-review-portal:end -->"
INSERT_BEFORE = "\n## 八、限制與自動化工具"


def render() -> str:
    queue = json.loads(QUEUE.read_text(encoding="utf-8"))
    if queue.get("schema") != "ggd.asset-review-portal@1":
        raise ValueError("asset review portal queue is missing or stale")
    summary = queue["summary"]
    if summary["approvedDecisionCount"] != 0 or summary["runtimeBindingsChanged"] != 0:
        raise ValueError("pending review portal must not claim approval or runtime binding")
    return (
        f"{START}\n\n"
        "### 尚未核准素材的統一逐項審查入口\n\n"
        "已把既有待審資料接到同一個生成頁："
        f"音訊 {summary['audioCandidateCount']} 項（波普事件配對 {summary['poppEventAudioCandidateCount']}、"
        f"帕魯非語言叫聲 {summary['palworldCreatureCryCandidateCount']}、"
        f"JUMP FORCE 群組固定抽樣 {summary['jumpForceGroupSampleCount']}），"
        f"動作 {summary['motionCandidateCount']} 項（帕魯原生語意 {summary['palworldMotionCandidateCount']}、"
        f"借用或死亡替代 {summary['borrowedOrDeathSubstitutionCandidateCount']}），"
        f"另保留 {summary['blockedMotionLeadCount']} 個尚不可播放的動作線索。"
        f"目前 pending {summary['pendingDecisionCount']}、核准 {summary['approvedDecisionCount']}、"
        f"runtime 新增綁定 {summary['runtimeBindingsChanged']}。"
        "每段可播音訊都重新核對本機絕對路徑、bytes 與 SHA-256；"
        "每個動作候選保留來源模型、目標角色、語意、骨架／播放證據及缺口。"
        "JUMP FORCE 的抽樣核准只可確認群組分類，不能當成說話者、語言或技能事件核准。"
        "已有 owner 決定與 runtime 收據的死亡替代演出不會重新排入 pending；"
        "任何新候選仍不得列為原生 Death 或自動綁定。\n\n"
        "- 生成佇列：`materials/hero-model-library/review/asset-review-portal-v1/review-queue.json`\n"
        "- 審查頁：`apps/client/public/asset-review-portal.html`\n"
        "- 重建／唯讀媒體服務：`tools/hero-model-library/source-workflows/asset-review-portal-v1/`\n\n"
        f"{END}"
    )


def expected(original: str) -> str:
    block = render()
    if START in original or END in original:
        if original.count(START) != 1 or original.count(END) != 1:
            raise ValueError("generated asset review markers are malformed")
        left, rest = original.split(START, 1)
        _, right = rest.split(END, 1)
        return left + block + right
    if original.count(INSERT_BEFORE) != 1:
        raise ValueError("four-day report insertion boundary is missing or ambiguous")
    return original.replace(INSERT_BEFORE, "\n\n" + block + INSERT_BEFORE)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    original = REPORT.read_text(encoding="utf-8")
    target = expected(original)
    if args.write:
        REPORT.write_text(target, encoding="utf-8")
    elif original != target:
        raise SystemExit("four-day asset review section is stale; run with --write")
    print(json.dumps({"report": REPORT.relative_to(ROOT).as_posix(), "written": args.write}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
