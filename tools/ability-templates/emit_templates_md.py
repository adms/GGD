#!/usr/bin/env python3
"""emit_templates_md.py — 從 ability-templates.csv 產出 docs/ability-templates.md
(30 類 JASS 行為模板的介紹說明 + 各類技能清單, 依技能編號排序)。
重生成: python3 tools/ability-templates/emit_templates_md.py"""
import csv, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
rows = list(csv.DictReader(open(ROOT / "docs/ability-templates.csv", encoding="utf-8-sig")))

# 類別 → (一句定義, 機制特徵, 範本, 移植備註)
DESC = {
 "行進波動": ("傷害點沿直線逐步推進的波動, 可帶終點爆發。", "週期計時器 + PolarProjection 步進 + 每步 AoE; 傷害區在動、施法者不動。", "莉娜 04-03 龍破斬 (45u/tick、AoE 200、終點 450 爆發)", "GGD 以 spawnProjectile(wave) 近似; 終點爆發與逐步判定尚無詞彙。"),
 "直線分段掃擊": ("單幀內沿直線鋪滿 N 段 AoE 的瞬間掃擊。", "instant 迴圈 N 段 × 步長, 每段 AoE, 命中去重。", "Saber 20-03 約束與勝利之劍 (6×200u、AoE 400); 妙蛙 90-04 陽光烈焰 (10×100u、AoE 280)", "GGD 以 skillshot 投射近似; 整線同時命中的特性已接近。"),
 "跳躍落地": ("施法者拋物線跳向目標點, 落地釋放 AoE。", "SetUnitPosition + FlyHeight 逐 tick, 落地 AoE (+暈/連段)。", "蒼月潮 Jump (41步、落地 AoE 330); 胖虎 40-04 地獄搖滾 (跳+演唱會連段)", "GGD 有 dash 但無拋物線與落地爆; 跳斬需 dash+damage 組合近似。"),
 "衝鋒推撞": ("施法者(或目標)沿線步進, 沿途 AoE/推撞。", "步進迴圈 + 每步 AoE + SetUnitPosition 推移敵人。", "蒼月潮 MoonKnock (3×200u、AoE 300、群體推撞)", "GGD dash 可表位移; 沿途判定與推撞無詞彙, 現多以 dash+damage 近似。"),
 "瞬移突斬": ("瞬間位移到目標身邊或依指令閃現, 常伴斬擊。", "SetUnitPositionLoc 瞬移 (無行進過程) + 單體/AoE 傷害; 或限時指令轉瞬移。", "戰鬥涅吉 82-02 縮地 (0.5×lvl 秒視窗, 每指令閃現 200u)", "GGD dash mode=toPoint 最接近; 指令瞬移窗無對應。"),
 "瞬發點爆": ("在目標點/目標身上瞬間爆一個 AoE。", "instant, 單次 GetUnitsInRange + 傷害(可帶拉人/暈)。", "妙蛙 90-03 藤鞭 (AoE 480 + 拉到腳下)", "GGD damage+radius 直接對應; 拉人位移無詞彙。"),
 "原地震波": ("以施法者為中心的瞬間 AoE。", "instant, 圓心=施法者。", "劍心 47-04 天翔龍閃 (r200 吸拉 + EX 18 向劍氣環)", "GGD castType self/ground + radius 對應良好。"),
 "單體斬擊": ("無幾何、鎖定單體的直接傷害。", "UnitDamageTarget 單發, 常附條件加成。", "菲特 23-04 雷焰聖劍 (EX 條件 2300 終結)", "GGD targeted damage 直接對應。"),
 "召喚代理": ("生成單位替施法者做事 — dummy 代放技能或真召喚物。", "CreateNUnits + UnitAddAbility + IssueOrder / 計時壽命。", "菲特 23-01 電離光槍 (dummy 學 stampede 沿線彈幕)", "GGD 無召喚詞彙; dummy-cast 投放類可改寫為對應投射/AoE, 真召喚物需新機制。"),
 "變身強化": ("限時改變自身型態/數值/技能組。", "morph 或屬性改寫 + sleep 還原; 可交換子技能。", "戰鬥涅吉 82-04 闇之魔法 (15s 暗化+兵裝互換)", "GGD applyBuff 近似數值面; 技能組互換無詞彙。"),
 "攻擊觸發": ("普攻命中時機率/條件觸發的效果。", "EVENT_UNIT_ATTACKED / 傷害鏈路由, proc 判定。", "蒼月潮 Beast Spear (條件 9999 處決)", "GGD passive.hooks onBasicAttack/onDamageDealt 對應。"),
 "受擊反應": ("被打時觸發的反擊/格擋/吸收。", "EVENT_UNIT_DAMAGED + 條件 + 反傷/護盾/閃現。", "Saber Avalon (受擊反擊 30×lvl+5×rank×STR); 涅吉 太陰道 (7s 吸收→神像砸落)", "GGD passive.hooks onDamageTaken 對應; 累積轉化無詞彙。"),
 "週期領域": ("持續期間週期作用於周圍 (傷害/治療/點射)。", "periodic timer + 圓形範圍作用。", "貞子 66-04 靈壓震撼 (光環緩速+immolation)", "GGD auras 可表修飾; 週期傷害 (DoT) 無詞彙。"),
 "鎖定連段": ("鎖住目標後播放腳本化多段打擊。", "Pause + 逐段傷害/特效 + 計數器。", "Saber EX 20-002 (7 連斬 + 1800 終結)", "GGD 無連段詞彙; 以總傷 applyBuff/damage 折算。"),
 "引導通魔": ("持續引導期間分段生效, 中斷即停。", "SPELL_CHANNEL/CAST + sleep 迴圈。", "天地志狼 龍破斬引導 (DragonChannel)", "GGD castTimeSec 僅表前搖; 引導無詞彙。"),
 "拉扯投擲": ("把目標抓起/鉤來/拋飛的強制位移。", "SetUnitPosition 逐 tick 拖曳 + 落點傷害。", "監獄兔 抓取拋摔; 環形吸引", "GGD 無敵方位移詞彙, 以 root+damage 近似。"),
 "剝奪變化": ("把目標變形或剝奪其資源/等級。", "hex dummy-cast / SetHeroLevel 直改。", "等級剝奪 (直接扣目標英雄等級)", "無對應詞彙; 以 applyStatus 近似變形, 等級操作不可表。"),
 "生命操作": ("以生命為代價或直接操作生命值。", "SetUnitState 直改 HP / 互換 / 延遲自傷。", "生命互換; 施法生命代價", "restore 可表回滿; 互換/代價無詞彙。"),
 "死亡機制": ("死亡時觸發的重生/暴走/假死。", "DEATH event + revive/變身。", "熊貓 89-03 憤怒的胸毛 (死亡機率復活+爆炸)", "GGD 無死亡 hook; 現以 onDamageTaken 近似或略。"),
 "距離博弈": ("依施法距離/位置決定不同招式結果。", "DistanceBetweenPoints 分支。", "小傑 06-0x 猜猜拳 (遠=布/中=剪刀/近=石頭)", "無詞彙; 現拆為多技能近似。"),
 "全場規則": ("改寫全場狀態 — 回溯/處決/環境。", "全圖枚舉 + 直接 Kill/狀態重設。", "全圖處決 (勝利技); 全場狀態回溯", "不可表; 標記為特殊勝負手。"),
 "隊伍協同": ("作用於全隊的集結/契約連結。", "全隊枚舉 + 傳送/連結 buff。", "全隊集結", "無詞彙; 單體近似或略。"),
 "成長蓄能": ("擊殺成長或蓄力疊加的累積系統。", "KILL event / 施放計數 + udg 累積。", "擊殺成長 (吃人頭永久加屬性)", "GGD 無 onKill 內容使用; hooks onKill 存在可接。"),
 "資源運營": ("以金錢/道具為核心的運營技能。", "資源增減 + 週期生息 / 抽獎。", "學姊 理財 (週期按持有金生息)", "不可表; 經濟系統外掛。"),
 "布陣環繞": ("在場上布置衛星/陣列/自爆物。", "多 dummy 定點生成 + 幾何陣列。", "環繞衛星; 直線布陣", "無詞彙; 以 spawnVfx+damage 近似。"),
 "結界領域": ("張開持續領域, 域內特殊規則。", "區域標記 + 週期判定域內單位。", "結界獵殺場", "無詞彙。"),
 "汲取吸附": ("掛上吸取環節, 週期把目標的血/魔轉給自己。", "buff 檢查迴圈 + heal 施法者。", "妙蛙種子 90-00 寄生種子 (0.95s×5 每次+50HP)", "GGD 無吸取詞彙; heal 近似半邊。"),
 "純演出/物件資料": ("觸發只做音效/文字/鏡頭, 實效全在物件編輯器。", "PlaySound/TextTag/CameraShake only。", "胖虎 40-02 爆熱神音 (純配音)", "行為以 WC3基底 欄判讀; GGD 依物件資料移植。"),
 "物件資料技能(無觸發)": ("完全沒有 JASS 觸發的技能 — 行為由 WC3 物件資料(基底技能+資料欄)全權定義。", "無觸發器; 看 WC3基底/資料欄。", "多數 xx-00 被動與標準 WC3 技能", "GGD 依基底家族對應 (閃避/致命一擊/重擊/光環…)。"),
}

def no_key(name):
    m = re.match(r"^(\d{2})-(\d{2,3})(?!\d)", name)
    return (0, int(m.group(1)), len(m.group(2)), int(m.group(2))) if m else (1, 999, 9, 999)

from collections import defaultdict
groups = defaultdict(list)
for r in rows:
    groups[r["JASS行為模板"]].append(r)
order = sorted(groups, key=lambda k: (-len(groups[k]), k))
# 無觸發大宗放最後
order = [k for k in order if k != "物件資料技能(無觸發)"] + ["物件資料技能(無觸發)"]

L = []
L.append("# GGD 技能行為模板總覽\n")
L.append("> 產生器: `tools/ability-templates/emit_templates_md.py` · 資料源: `docs/ability-templates.csv` (JASS 三軸稽核 + 12 代理細讀 90 英雄觸發器群, 309 筆行為記錄)\n")
L.append(f"> {len(rows)} 個獨立技能 · {len(order)} 類行為模板 · 分類依 owner 指示「全部看過再決定」由下而上聚類定案\n")
L.append("\n## 分類總表\n")
L.append("| 行為模板 | 技能數 | 一句定義 |")
L.append("|---|---|---|")
for k in order:
    L.append(f"| [{k}](#{k.replace('/','').replace('(','').replace(')','')}) | {len(groups[k])} | {DESC.get(k,('',))[0]} |")
for k in order:
    d = DESC.get(k, ("", "", "", ""))
    L.append(f"\n## {k}\n")
    L.append(f"**定義**: {d[0]}  ")
    L.append(f"**機制特徵**: {d[1]}  ")
    L.append(f"**範本**: {d[2]}  ")
    L.append(f"**移植備註**: {d[3]}\n")
    skl = sorted(groups[k], key=lambda r: no_key(r["技能名"]))
    if k == "物件資料技能(無觸發)":
        L.append("| 技能 | 英雄 | WC3基底 | 傷害perRank | 特殊機制 |")
        L.append("|---|---|---|---|---|")
        for r in skl:
            L.append(f"| {r['技能名']} | {r['英雄'][:40]} | {r['WC3基底']} | {r['傷害perRank']} | {r['特殊機制']} |")
    else:
        L.append("| 技能 | 英雄 | 行為幾何 | 行為時序 | 位移語意 | 證據 |")
        L.append("|---|---|---|---|---|---|")
        for r in skl:
            L.append(f"| {r['技能名']} | {r['英雄'][:40]} | {r['行為幾何'][:60]} | {r['行為時序'][:40]} | {r['位移語意'][:40]} | {r['行為證據'][:40]} |")

out = ROOT / "docs/ability-templates.md"
out.write_text("\n".join(L) + "\n", encoding="utf-8")
print(f"wrote {out.relative_to(ROOT)}: {len(order)} 類 / {len(rows)} 技能")
