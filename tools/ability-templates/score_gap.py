#!/usr/bin/env python3
"""score_gap.py — 對照 JASS 行為模板 vs GGD content 實作, 給每技能 0~10 實作落差分
(10=實作完美)。基準分=該行為模板在 GGD 詞彙的可表達度; 逐列再依實況加減:
配送機制有無對應 (dash/投射/hooks/auras)、傷害有無落地、音效/特效有無接上。

⭐ 這一支現在只**算**, ⛔ 不讀也不寫 CSV —— 唯一的入口是 `pnpm templates:build`
(`tools/ability-templates/gen.py`)。⛔ 讀產物再寫回產物的那一版有一個沉默的洞:
它的輸入是**上一次**的產物, 所以 classify 那一段沒重跑的話它是在替過期的列打分。
"""

BASE = {  # 模板 → (基準分, 主要缺口)
 "單體斬擊": (9, ""), "瞬發點爆": (8, "拉人/暈附帶未表"), "原地震波": (8, ""),
 "直線分段掃擊": (7, "分段判定以單投射近似"), "行進波動": (6, "終點爆發/逐步判定未表"),
 "攻擊觸發": (7, "proc 細節近似"), "受擊反應": (7, "累積轉化未表"),
 "週期領域": (5, "週期傷害(DoT)無詞彙"), "變身強化": (6, "技能組互換/逐階時長未表"),
 "引導通魔": (5, "引導中斷語意無"), "跳躍落地": (5, "拋物線+落地爆無詞彙"),
 "衝鋒推撞": (5, "沿途判定+推撞無詞彙"), "瞬移突斬": (5, "瞬移語意以dash近似"),
 "鎖定連段": (4, "連段折算為單發"), "召喚代理": (4, "召喚物無詞彙; dummy投放可改寫"),
 "拉扯投擲": (3, "敵方強制位移無詞彙"), "汲取吸附": (4, "吸取以heal近似半邊"),
 "布陣環繞": (3, "陣列布置無詞彙"), "距離博弈": (3, "距離分支無詞彙"),
 "成長蓄能": (4, "永久累積無詞彙"), "死亡機制": (2, "死亡hook無"),
 "生命操作": (3, "互換/代價無詞彙"), "剝奪變化": (2, "變形/剝奪無詞彙"),
 "資源運營": (2, "經濟操作無詞彙"), "全場規則": (1, "全場改寫不可表"),
 "隊伍協同": (2, "全隊作用無詞彙"), "結界領域": (2, "領域規則無詞彙"),
 "純演出/物件資料": (7, "實效在物件資料, 依基底對應"),
 "物件資料技能(無觸發)": (7, "依WC3基底家族對應"),
}
GOOD_BASE = ("閃避", "致命一擊", "重擊", "屬性加成", "復原", "戰爭踐踏", "糾纏根鬚", "沉默")


def score(rows):
    """就地補上 `實作落差分` / `落差說明` 兩欄 (CSV 的第 41、42 欄)。"""
    for r in rows:
        t = r["JASS行為模板"]
        base, gap = BASE.get(t, (5, ""))
        score = base
        notes = [gap] if gap else []
        has_dmg = bool(r["傷害perRank"])
        has_dash = "dash" in (r.get("判定依據", "") + r.get("分類", ""))
        is_dash_cat = r["分類"] in ("衝刺型", "跳斬型")
        has_proj = bool(r["投射物"])
        has_passive = r["分類"].startswith("被動") or r["分類"] in ("光環型",)
        # 配送機制對應加分
        if t in ("跳躍落地", "衝鋒推撞", "瞬移突斬") and is_dash_cat:
            score += 2; notes.append("dash已對應+2")
        if t in ("行進波動", "直線分段掃擊") and has_proj:
            score += 1; notes.append("投射已對應+1")
        if t in ("攻擊觸發", "受擊反應") and has_passive:
            score += 1; notes.append("hooks已對應+1")
        if t == "週期領域" and r["分類"] == "光環型":
            score += 1; notes.append("aura已對應+1")
        # 傷害軸: JASS 有傷害呼叫但 content 無傷害效果
        if r.get("JASS傷害呼叫") and not has_dmg and t not in ("純演出/物件資料",):
            score -= 3; notes.append("JASS有傷害但content未落地-3")
        # 音效/特效軸
        if r.get("WC3音效") and not r.get("GGD音效"):
            score -= 1; notes.append("WC3音效未接-1")
        if not r.get("GGD特效"):
            score -= 1; notes.append("無特效-1")
        # 無觸發技能: 基底家族對應良好者上調
        if t == "物件資料技能(無觸發)":
            if any(g in r.get("WC3基底", "") for g in GOOD_BASE):
                score += 2; notes.append("基底家族對應佳+2")
            elif not has_dmg and r["分類"] in ("其他",):
                score -= 3; notes.append("內容空殼-3")
        score = max(0, min(10, score))
        r["實作落差分"] = str(score)
        r["落差說明"] = "; ".join(n for n in notes if n)
    return rows


if __name__ == "__main__":  # pragma: no cover —— 單獨跑會洗掉別的欄, 一律走 gen.py
    from gen import main

    raise SystemExit(main())
