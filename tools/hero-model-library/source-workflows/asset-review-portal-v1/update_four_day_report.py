#!/usr/bin/env python3
"""Insert the generated owner-review portal status into the rolling asset report."""

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

LEGACY_OWNER_DECISION_OVERLAYS = {
    "原作獨立技能 VFX 0、技能專用 SFX 0；不可把技能設定中的程序化演出寫成已取得的原作特效。":
        "原作獨立技能 VFX 0、技能專用 SFX 0；18 個叫聲與 18 個動作語意候選已由 owner 核准，runtime 事件綁定仍為 0；不可把技能設定中的程序化演出寫成已取得的原作特效。",
    "剩餘／`pending-user-listening-review` | 每個採用檔案的語言、說話者、事件語意及 SHA-256 已核實；所有採用配對均有 owner 逐項播放決策；只將核准配對寫入 runtime，並通過音訊與事件檢查 | 36 個事件音訊候選必須逐項播放審查；沒有 owner 決策不得綁定。":
        "剩餘／`owner-approved-pending-runtime-binding` | 每個採用檔案的語言、說話者、事件語意及 SHA-256 已核實；所有採用配對均有 owner 逐項播放決策；只將核准配對寫入 runtime，並通過音訊與事件檢查 | 36 個事件音訊候選已由 owner 核准；runtime 綁定與事件回歸仍未完成。",
    "可用但未核准的材料：GGD VFX 候選 12 個，視覺核准 0；其中 7 個已依來源名稱整理成 Q/W/R 審查提案，另 5 個保留未配對。事件音訊候選 36 個，逐項聽審 0。本流程新增 runtime 綁定 0。":
        "可用且 owner 已核准的材料：GGD VFX 候選 12 個，視覺核准 12；其中 7 個已依來源名稱整理成 Q/W/R 審查提案，另 5 個保留未配對。事件音訊候選 36 個，逐項聽審核准 36。本流程新增 runtime 綁定仍為 0，尚不可據此稱為已上架。",
    "本批審查佇列有 18 個叫聲候選、18 個動作語意候選，核准 0、runtime 新增綁定 0。":
        "本批審查佇列有 18 個叫聲候選、18 個動作語意候選，owner 核准 36/36、runtime 新增綁定 0。",
    "| 帕魯三名審查佇列 | 18 個語意候選 | 原生動作候選 | 使用者核准 0，未新增事件綁定 |":
        "| 帕魯三名審查佇列 | 18 個語意候選 | 原生動作候選 | owner 核准 18/18；未新增事件綁定 |",
    "事件 reference 41、事件 pair 41/41；音訊聽審候選 36、核准 0。":
        "事件 reference 41、事件 pair 41/41；音訊聽審候選 36、owner 核准 36/36、runtime 綁定 0。",
    "- 波普事件音訊 36 個：核准 0，runtime 綁定 0。":
        "- 波普事件音訊 36 個：owner 核准 36/36，runtime 綁定 0。",
    "- 帕魯叫聲 18 個：核准 0；只有情緒標籤，不能據此推定語言、說話者或技能事件。":
        "- 帕魯叫聲 18 個：owner 核准 18/18；只有情緒標籤，核准不會補足語言、說話者或技能事件證據。",
    "| 帕魯完整動作庫候選 | 空渦龍 29＋枯星龍 58＋搗蛋貓 33，共 120 條 | 原生（枯星龍其中 1 條為固定姿勢） | 已註冊非預設模型選項；技能事件綁定待審查 |":
        "| 帕魯完整動作庫候選 | 空渦龍 29＋枯星龍 58＋搗蛋貓 33，共 120 條 | 原生（枯星龍其中 1 條為固定姿勢） | 已註冊非預設模型選項；18 個播放候選已由 owner 核准，技能事件綁定待技術完成 |",
    "owner 核准 0、`approvedBindings` 0、runtime mutation 0、正式站部署 0；":
        "owner 視覺核准 6/6、`approvedBindings` 0、runtime mutation 0、正式站部署 0；",
    "既有內容與自動測試可先完成；未核准的音訊、借用動作或 VFX 不得藉由整體戰鬥驗證繞過逐項審查。":
        "既有內容與自動測試可先完成；owner 核准不會取代音訊、動作或 VFX 的技術 gate、runtime 綁定與整體戰鬥驗證。",
}


def render() -> str:
    queue = json.loads(QUEUE.read_text(encoding="utf-8"))
    if queue.get("schema") != "ggd.asset-review-portal@1":
        raise ValueError("asset review portal queue is missing or stale")
    summary = queue["summary"]
    total = summary["audioCandidateCount"] + summary["motionCandidateCount"] + summary["visualCandidateCount"]
    if (summary["pendingDecisionCount"] != 0
            or summary["approvedDecisionCount"] != total
            or summary["approvedPendingTechnicalCount"] != total
            or summary["runtimeSelectableCandidateCount"] != 0
            or summary["runtimeBindingsChanged"] != 0
            or summary["productionDeployedAssets"] != 0):
        raise ValueError("owner-approved review portal status is stale or overclaims runtime/deployment")
    return (
        f"{START}\n\n"
        "### Owner 已核准素材的統一逐項審查入口\n\n"
        "Owner 已於 2026-09-15 核准審查中心全部資源。固定決策收據依 candidate ID 與來源指紋套用："
        f"音訊 {summary['audioCandidateCount']} 項（波普事件配對 {summary['poppEventAudioCandidateCount']}、"
        f"帕魯非語言叫聲 {summary['palworldCreatureCryCandidateCount']}、"
        f"JUMP FORCE 群組固定抽樣 {summary['jumpForceGroupSampleCount']}），"
        f"動作 {summary['motionCandidateCount']} 項（帕魯原生語意 {summary['palworldMotionCandidateCount']}、"
        f"借用或死亡替代 {summary['borrowedOrDeathSubstitutionCandidateCount']}），"
        f"視覺素材 {summary['visualCandidateCount']} 項（KOF XIV 轉換貼圖 {summary['kofXivTextureCandidateCount']}、"
        f"原生 EFF 群組 {summary['kofXivEffGroupCandidateCount']}、達伊貼圖元件 {summary['daiVfxTextureComponentCount']}、"
        f"達伊 mesh 元件 {summary['daiVfxMeshComponentCount']}、波普 GGD VFX 候選 {summary['poppVfxCandidateCount']}、"
        f"達伊靜態程序化組合候選 {summary['daiVfxCompositeCandidateCount']}），"
        f"另保留 {summary['blockedMotionLeadCount']} 個尚不可播放的動作線索。"
        f"目前 pending {summary['pendingDecisionCount']}、核准 {summary['approvedDecisionCount']}、"
        f"已核准待技術整合 {summary['approvedPendingTechnicalCount']}、可切換 {summary['runtimeSelectableCandidateCount']}、"
        f"runtime 新增綁定 {summary['runtimeBindingsChanged']}、正式站部署 {summary['productionDeployedAssets']}。"
        "每段可播音訊都重新核對本機絕對路徑、bytes 與 SHA-256；"
        "每個動作候選保留來源模型、目標角色、語意、骨架／播放證據及缺口。"
        "JUMP FORCE 的抽樣核准只可確認群組分類，不能當成說話者、語言或技能事件核准。"
        "視覺項目的 ownerDecision 已改為 approve，但核准不授權技能或 runtime 綁定；"
        "各項須通過其格式、效能、動畫、角色／事件綁定與 runtime gate 後才可切換，"
        "目前不能列為已上架或已部署。\n\n"
        "- 生成佇列：`materials/hero-model-library/review/asset-review-portal-v1/review-queue.json`\n"
        "- Owner 決策收據：`materials/hero-model-library/review/asset-review-portal-v1/owner-decisions.json`\n"
        "- 審查頁：`apps/client/public/asset-review-portal.html`\n"
        "- 重建／唯讀媒體服務：`tools/hero-model-library/source-workflows/asset-review-portal-v1/`\n\n"
        f"{END}"
    )


def expected(original: str) -> str:
    # Source workflows own their own readiness wording.  This report adds the
    # portal's SHA-pinned owner decision as a separate generated section;
    # rewriting source sections here made the final report depend on script
    # order and could misstate a source authority as a runtime decision.
    # Keep the former replacements as a named historical compatibility map
    # for traceability, but never apply them during a rebuild.
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
