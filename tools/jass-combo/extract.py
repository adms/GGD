#!/usr/bin/env python3
"""#541 —— 「連段→收尾」29 個 JASS 函式 → 出貨共用表 + 對照文件。

    python3 tools/jass-combo/extract.py            # 產生
    python3 tools/jass-combo/extract.py --check    # 逐位元組比對,過期回非零

產物（兩份,⛔ 都不可以手改）：
    content/config/combo-strikes.json     出貨共用表（`config.combo-strikes@1`）
    docs/_reference/jass-combo-29.md      29 列對照表（要貼進 GH issue 給 owner）

⚠️ **⛔ 這裡沒有產生時間戳。** 任何隨時鐘變動的欄位都會讓 `--check` 永遠不相等,
於是閘只能被放寬成模糊比對 —— 而一條被放寬的閘等於沒有閘（同 `caps:export`）。

🔢 第〇·四守則：這份 JSON 是**共用表**。技能 JSON 之後只引用 `key`,
⛔ 不可以把 `steps` 抄一份進去 —— 抄進去的那一份必然過期,而且沒有任何東西會紅。
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from scan import scan  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
JASS = ROOT / "tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j"
OBJECTS = ROOT / "tools/w3x-import/out/GoDieEX22s-src/OBJECTS.json"
PROVENANCE = ROOT / "content/assets/vfx/w3x-ability-provenance.json"
OUT_JSON = ROOT / "content/config/combo-strikes.json"
OUT_MD = ROOT / "docs/_reference/jass-combo-29.md"

SCHEMA = "config.combo-strikes@1"

# ─────────────────────────────────────────────────────────────────────────────
# 人工 join 表。
#
# ⚠️ **為什麼這一半不能是正則**：JASS 用三種完全不同的方式把觸發器綁到英雄身上 ——
#   ① 自己的 Conditions 直接 `GetSpellAbilityId() == 'XXXX'`（掃描器抓得到,⛔ 不列在這裡）
#   ② **父觸發器** `EnableTrigger` 一個週期性/計時器觸發器（本體完全沒有技能 id）
#   ③ **全域變數 / 單位型別**（`udg_saber`、`GetUnitTypeId(...) == 'U034'`）
# ②③ 只有讀完整條鏈才知道,所以它們逐筆寫在這裡,而且每一筆都帶**行號**可以被反駁。
#
# ⛔ `abilityIds` 不寫在這裡 —— 它由 `ownerRawcodes` 經 w3x-ability-provenance.json
# 反查得到。手抄一份就是第二個住處。
RESOLUTION: dict[str, dict] = {
    # ── ② 父觸發器 EnableTrigger ────────────────────────────────────────────
    "Trig_Romove_Actions": {
        "ownerKind": "ability",
        "ownerRawcodes": ["A06P"],
        "resolvedVia": "parent-trigger:Trig_Roaction_Actions@28990 於 29039 行 EnableTrigger(gg_trg_Romove)；傷害公式 28995 行讀 A06P 等級，28984 行要求 GetUnitTypeId(udg_RoMaster)=='U01U'（索隆）",
    },
    "Trig_Toro_Rotation_Actions": {
        "ownerKind": "ability",
        "ownerRawcodes": ["A000"],
        "resolvedVia": "parent-trigger:Trig_Toro_Actions@33349 於 33366 行 EnableTrigger；Trig_Toro_Func006C@33329 要求 GetSpellAbilityId()=='A000'，本體用 udg_FF7_CloudUnit 綁克勞德",
    },
    "Trig_Luf_Axe_Effect_Actions": {
        "ownerKind": "ability",
        "ownerRawcodes": ["A0IS"],
        "resolvedVia": "parent-trigger:Trig_Luf_Axe_Actions@36256 於 36282 行 EnableTrigger；Trig_Luf_Axe_Func001C@36243 要求 GetSpellAbilityId()=='A0IS'",
    },
    "Trig_LightCutRun_Actions": {
        "ownerKind": "ability",
        "ownerRawcodes": ["A0IJ"],
        "resolvedVia": "parent-trigger:Trig_LightCut_Actions@41794 於 41823 行 EnableTrigger；Trig_LightCut_Conditions@41778 要求 GetSpellAbilityId()=='A0IJ'",
    },
    "Trig_Nine_Lives_Hits_Actions": {
        "ownerKind": "ability",
        "ownerRawcodes": ["A0U5"],
        "resolvedVia": "parent-trigger:Trig_Nine_Lives_EX_Actions@52057 於 52080 行 EnableTrigger；Trig_Nine_Lives_EX_Conditions@52051 要求 GetSpellAbilityId()=='A0U5'",
    },
    # ── ③ 全域變數 / 單位型別 ───────────────────────────────────────────────
    "Trig_ExcaliburMAX_Actions": {
        "ownerKind": "ability",
        "ownerRawcodes": ["A0CT"],
        "resolvedVia": "global:udg_saber（31991 行由 Trig_Open_Skill_of_Saber_Actions 在 GetUnitTypeId=='E002' 時設定）+ udg_IsAvalonReady（32383 行由 Trig_avalonReady_Actions 設 true，其 Conditions@32375 要求 GetSpellAbilityId()=='A0CT'）⇒ 這是傷害事件觸發，⛔ 沒有自己的 GetSpellAbilityId",
    },
    "Trig_XHunter_Actions": {
        "ownerKind": "ability",
        "ownerRawcodes": ["A08Y"],
        "resolvedVia": "unit-type:Trig_XHunter_Conditions@27155 要求 GetUnitTypeId(GetAttacker())=='U034'（職業獵人 傑 富力士）；這是猜猜拳普攻被動的另一半，主體 Trig_XHunterStone 的 Conditions 直接指名 A08Y。石頭/剪刀/布 三支的傷害分別讀 A020 / A08W / A08X 的等級",
    },
    "Trig_MoriyaShadow_Actions": {
        "ownerKind": "ability",
        "ownerRawcodes": ["A07W"],
        "resolvedVia": "unit-type:Trig_MoriyaShadow_Conditions@47217 要求 GetUnitTypeId(GetAttacker())=='U00B'（飛鼠先生）；本體 47240 行讀 A07W（75-02 幻影鬥氣）等級算傷害",
    },
    "Trig_Bleach_Strike_Actions": {
        "ownerKind": "ability",
        "ownerRawcodes": ["A0LK"],
        "resolvedVia": "buff:Trig_Bleach_Strike_Conditions@37459 要求 UnitHasBuffBJ(GetAttacker(),'B02E') 且攻擊者 == udg_BleachUnit；本體讀 A0LK（79-02 斬擊）等級算傷害",
    },
    "Trig_Spell_Mark_Actions": {
        "ownerKind": "ability",
        "ownerRawcodes": ["A08Y"],
        "resolvedVia": "sub-ability:掃到的 A04W（06-00x 布緩速）在 provenance 裡沒有自己的 id —— 它是猜猜拳「布」分支在 27291 行 UnitAddAbilityBJ 給 dummy 單位的子技能 ⇒ 歸屬 A08Y（06-00 猜猜拳）",
    },
    # ── 補不完的六個（每一筆都是**能被反駁的理由**，⛔ 不是「還沒收」）──────────
    "Trig_TowerSP_Actions": {
        "ownerKind": "map-mechanic",
        "ownerRawcodes": [],
        "resolvedVia": "none",
        "unresolvedReason": "地圖防禦塔機制，⛔ 不是英雄技能：InitTrig_TowerSP@13153 把它直接註冊在 ~20 座具名塔單位（gg_unit_uzg1_0146 …）的 EVENT_UNIT_DAMAGED 上，傷害由 udg_AttackTowerUnit 發出、隨 udg_TowerCounter 疊加。整條鏈上沒有任何 GetSpellAbilityId，也沒有任何英雄綁定 ⇒ GGD 沒有對應的 ability。",
    },
    "Trig_FireLord_Actions": {
        "ownerKind": "item",
        "ownerRawcodes": ["I06I"],
        "resolvedVia": "item:Trig_FireLord_Func014C@25003 要求 UnitHasItemOfTypeBJ(GetAttacker(),'I06I')",
        "unresolvedReason": "它是**道具**「炎神弩」（I06I ⇒ content/items/godie-i06i.json）的普攻觸發，⛔ 不是英雄技能 ⇒ 沒有 ability id。⭐ 它有 GGD 對應物，只是住在 items 不是 abilities。",
    },
    "Trig_LokDeathEye_Actions": {
        "ownerKind": "unit",
        "ownerRawcodes": ["A0QR"],
        "resolvedVia": "conditions:GetSpellAbilityId()=='A0QR'（CP-00 死神之眼），技能表掛在單位 n012「路克」身上",
        "unresolvedReason": "A0QR 在 provenance 裡沒有 id，因為它的持有者是**非英雄單位** n012「路克」（OBJECTS.json units），而 GGD 的 71 位英雄名單裡沒有 godie-n012 ⇒ 沒有可以指的 ability id。⭐ 反駁法：哪天 content/champions/ 出現 godie-n012，這一筆就要改成 ability。",
    },
    "Trig_Stumble_Actions": {
        "ownerKind": "unit",
        "ownerRawcodes": ["AHtb"],
        "resolvedVia": "conditions:GetSpellAbilityId()=='AHtb'（CP-摔技），技能表掛在英雄 U01F「黑化張飛」身上",
        "unresolvedReason": "AHtb 的持有者是英雄 U01F「萬夫莫敵 黑化張飛」，而 GGD 目前 71 位英雄裡**沒有** godie-u01f ⇒ 沒有可以指的 ability id。⭐ 反駁法：這位英雄被移植進 content/champions/ 的那一天，這一筆就要改成 ability。",
    },
    "Trig_DragonTigerReady_Actions": {
        "ownerKind": "map-mechanic",
        "ownerRawcodes": ["A0J2"],
        "resolvedVia": "conditions:GetSpellAbilityId()=='A0J2'（00-00 龍虎亂舞）",
        "unresolvedReason": "⛔ 它不屬於任何英雄：A0J2 只在 13868 / 13976 兩行被 UnitAddAbilityBJ 加給**遊戲結束時的終結者**（Trig_GameOver_Red/Green_Actions），tooltip 標籤是 [亂鬥]、編號寫成 00-00（＝無英雄）⇒ 它是**地圖模式的終局演出技**，不是技能表上的技能。",
    },
    "Trig_Near_To_Death_Actions": {
        "ownerKind": "orphan",
        "ownerRawcodes": ["A0AC"],
        "resolvedVia": "conditions:GetSpellAbilityId()=='A0AC'（Near to Death）",
        "unresolvedReason": "原作裡的**孤兒技能**：A0AC 在 OBJECTS.json 的 461 個單位 + 127 位英雄的技能表裡**一個都沒有**，war3map.j 裡也沒有任何 UnitAddAbility 授予它（全檔只出現在自己的 Conditions 那一行），而且 tooltip 還是未翻譯的英文（base=AHbn）⇒ 它是從別的地圖抄進來、**沒有接完**的殘留 ⇒ 沒有英雄可以歸屬。",
    },
}

SHAPE_NOTE = {
    "loop": "loop：等待與傷害寫在迴圈裡。⭐ 間隔就是動畫節奏的來源",
    "per-step": "per-step：wait→傷害 反覆 {n} 次。⭐ 間隔就是動畫節奏的來源",
    "tail": "tail：先跑完 {k} 段等待，收尾才給傷害（龍虎亂舞那種）。⭐ 間隔就是動畫節奏的來源",
}

TOP_NOTE = (
    "「連段→收尾」的 29 個 JASS 函式（GH#541，owner 2026-08-22：「開票記得要寫是哪 29 個技能喔」）。"
    "判準是 owner 逐字給的：函式裡**同時**有 `TriggerSleepAction|PolledWait` **且**有 "
    "`UnitDamageTarget|UnitDamagePoint|UnitDamageArea`；三種形狀都算 —— "
    "per-step 5 個、loop 9 個、tail 15 個。"
    "⭐ **間隔就是動畫節奏的來源**，所以 `steps` 是從 war3map.j **逐字抄**的，"
    "⛔ 沒有四捨五入、⛔ 沒有統一成 0.12。"
    "🔢 第〇·四守則：這份是**共用表** —— 技能 JSON 只引用 `key`，"
    "⛔ 不可以把 `steps` 抄一份進技能文件（抄進去的那一份必然過期，而且不會有任何東西紅）。"
    "⛔ 這份是 `python3 tools/jass-combo/extract.py` 產生的，不可以手改；"
    "`--check` 會逐位元組比對，過期就非零離開。"
)

STEP_SPLIT_NOTE = (
    "`steps` = 這個函式裡**除了最後一段以外**的所有等待（照原始碼出現順序），"
    "`finisherDelaySec` = **最後一段**等待。兩者接起來逐字等於 JASS 裡的等待序列。"
    "⚠️ 它是**機械切分**，⛔ 不是語意判斷 —— 傷害落在哪一段之間要看 `seq`"
    "（`W<秒>` 是等待、`D` 是一次傷害呼叫，照原始碼順序）。"
)


def key_of(func: str) -> str:
    stem = func
    if stem.startswith("Trig_"):
        stem = stem[len("Trig_") :]
    if stem.endswith("_Actions"):
        stem = stem[: -len("_Actions")]
    return stem.replace("_", "-").lower()


def build() -> tuple[str, str]:
    jass = JASS.read_text(encoding="utf-8", errors="replace")
    objects = json.loads(OBJECTS.read_text(encoding="utf-8"))
    prov = json.loads(PROVENANCE.read_text(encoding="utf-8"))["abilities"]

    rc_to_ids: dict[str, list[str]] = {}
    for aid, entry in prov.items():
        for rc in entry.get("rawcodes", []):
            rc_to_ids.setdefault(rc, []).append(aid)

    w3x_names = {rc: e.get("name") for rc, e in objects["abilities"].items()}
    w3x_names.update({rc: e.get("name") for rc, e in objects["items"].items()})

    families = []
    seen_keys: set[str] = set()
    for fam in scan(jass):
        res = RESOLUTION.get(fam.func, {})
        owner_rcs = res.get("ownerRawcodes")
        if owner_rcs is None:
            owner_rcs = list(fam.rawcodes)
        ability_ids = sorted({aid for rc in owner_rcs for aid in rc_to_ids.get(rc, [])})
        key = key_of(fam.func)
        assert key not in seen_keys, f"family key 撞名：{key}"
        seen_keys.add(key)

        note = SHAPE_NOTE[fam.shape].format(n=fam.n_damage, k=len(fam.waits))
        # ⭐ `steps` 的語意是「**離施法那一刻**的秒數偏移」（見 comboStrikes 的 schema
        #    與 `sim/effects/comboStrikes.ts::comboStrikeOffsets`），⛔ **不是**逐段間隔。
        # ⛔ 2026-08-22 之前這裡填的是原始 wait 序列（逐段間隔）—— sim 會把它當成
        #    絕對偏移讀，遇到非遞增就把那一段推到「前一段 +1 tick」⇒ **節奏被靜靜抹平**，
        #    而段數守恆所以看起來完全正常。
        def _cumulative(gaps: list[float]) -> list[float]:
            out, t = [], 0.0
            for g in gaps:
                out.append(round(t, 4))
                t += g
            return out

        # ⭐ 迴圈形：刀數在 `exitwhen i > N` 裡，⛔ **不等於**字面 sleep 的數量 ——
        #    那些多半在迴圈**外面**（克勞德 01-04：迴圈跑 7 次，而迴圈裡的等待是
        #    運算式 `1.00 - i*0.50`，六個字面 sleep 全在迴圈外）。
        if fam.shape == "loop" and fam.loop_count:
            if fam.loop_gaps:
                # ⭐ N 圈 = N 發，而**最後一圈就是收尾**（克勞德 01-04 的 JASS 逐字：
                #    `if ( not ( udg_SupI >= 7 ) )` —— 第 7 發多帶一個 STR 項）。
                #    ⇒ 攤到 `comboStrikes` 的形狀是 `steps`（前 N−1 發的絕對偏移）
                #    ＋ `finisherDelaySec`（最後一發距離前一發的間隔）。
                # ⛔ 把 N 個偏移全放進 steps 再另外給 finisherDelaySec = N+1 發，
                #    而卡面寫的是 N —— 那就是第一·五守則要防的那種多出來的一刀。
                offsets = _cumulative(fam.loop_gaps)
                steps = offsets[:-1]
                # ⭐ 收尾**不是**「第 N 刀貼著第 N−1 刀」—— 01-04 的 JASS 裡,
                #    真傷害(UnitDamageTarget×2, war3map.j:33915/33921)在第 7 刀的
                #    視覺之後還要:①睡完那一圈自己的兩個運算式 sleep(`loop_gaps[-1]`)
                #    ②再吃**傷害前的字面等待** 0.2+0.6+0.4+0.2(蓄力停頓,`seq` 裡
                #    第一個 D 之前的 W 全部)。⇒ 收尾 = 三段接起來。
                # ⛔ 2026-08-25 之前只有第一段 ⇒ 決勝的蓄力戲劇性整段蒸發(GH#704)。
                # ⚠️ 可反駁的假設:loop 形的字面等待住在**收尾分支**(跑一次),
                #    ⛔ 不是每圈都跑 —— 今天唯一的 loop-expr 族(superff7)逐字如此
                #    (那幾個 W 在 `if SupI≥7` 裡)。第二族出現時要回來驗這一格。
                pre_dmg = 0.0
                for tok in fam.seq:
                    if tok == "D":
                        break
                    if tok.startswith("W"):
                        pre_dmg += float(tok[1:])
                finisher = (
                    round((offsets[-1] - offsets[-2]) + fam.loop_gaps[-1] + pre_dmg, 4)
                    if len(offsets) >= 2
                    else 0.0
                )
                rhythm = "loop-expr"
            else:
                steps = None
                finisher = fam.waits[-1]
                rhythm = "loop-count-only"
        else:
            steps = _cumulative(fam.waits[:-1])
            finisher = fam.waits[-1]
            rhythm = "literal-waits"
        entry = {
            "key": key,
            "jassFunc": fam.func,
            "jassLine": fam.line,
            "shape": fam.shape,
            "rhythm": rhythm,
            **({"steps": steps} if steps is not None else {"strikes": fam.loop_count}),
            **(
                {}
                if steps is not None
                else {
                    "rhythmUnknownWhy": (
                        "迴圈跑 %d 次（`exitwhen > %d`），但迴圈**內**的等待不是字面值也解不成線性式 ⇒ "
                        "⛔ 拿迴圈外那幾個字面 sleep 冒充節奏就是說謊。"
                        "⭐ 要反駁它：把那個運算式解出來（`scan.py::loop_gap_series` 今天只解 `a - i*b`）。"
                    )
                    % (fam.loop_count, fam.loop_count)
                }
            ),
            "finisherDelaySec": finisher,
            "seq": fam.seq,
            "damageCalls": fam.n_damage,
            "rawcodes": fam.rawcodes,
            "ownerKind": res.get("ownerKind", "ability"),
            "ownerRawcodes": owner_rcs,
            "w3xNames": [w3x_names.get(rc) or rc for rc in owner_rcs],
            "abilityIds": ability_ids,
            "resolvedVia": res.get("resolvedVia", "conditions:GetSpellAbilityId"),
            "gates": fam.gates,
            "note": note,
        }
        reason = res.get("unresolvedReason")
        if not ability_ids and not reason:
            # ⭐ 這一格以前是 `assert`,而它的前提是「provenance 裡查不到 = 我漏寫了一筆
            # RESOLUTION」。⛔ 那個前提在 2026-08-27 破了:普查一旦真的跟著內容重跑
            # (#777),**下架一位英雄**就會讓他的連段家族查不到 id —— 而那不是漏寫,
            # 是事實。舊行為是整支產生器 AssertionError ⇒ 一次英雄下架就擋死 build。
            #
            # ⚠️ 契約沒有變鬆:每一筆仍然要帶一句**能被反駁**的話。差別只在它現在是
            # **推導**的(指名 rawcode 與它在原作的名字),⛔ 不是每退休一位英雄就要
            # 有人回來手寫一列 —— 一張要靠人記得維護的表,就是下一次的過期快照。
            named = "、".join(f"`{rc}`（{w3x_names.get(rc) or '原作無名'}）" for rc in owner_rcs) or "（掃不到 rawcode）"
            reason = (
                f"{named} 在 w3x-ability-provenance.json 裡對不到**任何活著的** GGD 技能 ⇒ "
                "這條連段的持有者已經不在 content/abilities/(英雄下架或改編號)。"
                "⭐ 要反駁它:讓那支技能重新出貨,或在 RESOLUTION 裡指定 ownerRawcodes。"
            )
        if reason:
            entry["unresolvedReason"] = reason
        assert bool(ability_ids) != bool(reason), (
            f"{fam.func}：有 abilityIds 就不該有 unresolvedReason"
        )
        families.append(entry)

    doc = {
        "id": "combo-strikes",
        "schema": SCHEMA,
        "note": TOP_NOTE,
        "stepSplit": STEP_SPLIT_NOTE,
        "source": {
            "jass": "tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j",
            "objects": "tools/w3x-import/out/GoDieEX22s-src/OBJECTS.json",
            "provenance": "content/assets/vfx/w3x-ability-provenance.json",
            "generator": "tools/jass-combo/extract.py",
        },
        "families": families,
    }
    return json.dumps(doc, ensure_ascii=False, indent=2) + "\n", render_md(families)


def render_md(families: list[dict]) -> str:
    by_shape: dict[str, int] = {}
    for f in families:
        by_shape[f["shape"]] = by_shape.get(f["shape"], 0) + 1
    resolved = sum(1 for f in families if f["abilityIds"])

    lines: list[str] = []
    lines.append("# 「連段→收尾」29 個 JASS 函式 —— 完整對照表（GH#541）")
    lines.append("")
    lines.append("> ⛔ **這份是 `python3 tools/jass-combo/extract.py` 產生的，不可以手改。**")
    lines.append("> 紅了跑那一行然後 `git add`。`--check` 逐位元組比對。")
    lines.append("")
    lines.append("owner 2026-08-22 逐字判準（⛔ 不要改）：函式裡**同時**有 "
                 "`TriggerSleepAction|PolledWait` **且**有 "
                 "`UnitDamageTarget|UnitDamagePoint|UnitDamageArea`。")
    lines.append("")
    lines.append(
        f"| 總數 | per-step | loop | tail | 串到 GGD ability id |\n|---:|---:|---:|---:|---:|\n"
        f"| **{len(families)}** | {by_shape.get('per-step', 0)} | {by_shape.get('loop', 0)} | "
        f"{by_shape.get('tail', 0)} | **{resolved} / {len(families)}** |"
    )
    lines.append("")
    lines.append("⭐ **間隔就是動畫節奏的來源** —— `間隔序列` 是從 `war3map.j` 逐字抄的，"
                 "⛔ 沒有四捨五入、⛔ 沒有統一成 0.12。")
    lines.append("`W<秒>` = 一次等待、`D` = 一次傷害呼叫，照原始碼順序。")
    lines.append("")
    lines.append("## 29 列")
    lines.append("")
    lines.append("| # | JASS 函式 | 行號 | rawcode | GGD abilityId | 技能名（w3x） | 形狀 | 間隔序列 | 傷害次數 | gate |")
    lines.append("|---:|---|---:|---|---|---|---|---|---:|---|")
    for i, f in enumerate(sorted(families, key=lambda x: x["jassLine"]), 1):
        rc = "、".join(f["ownerRawcodes"]) or "—"
        ids = "<br>".join(f["abilityIds"]) or "⛔ —"
        names = "<br>".join(str(n) for n in f["w3xNames"]) or "—"
        seq = " ".join(f["seq"])
        gates = "、".join(f["gates"]) or "—"
        lines.append(
            f"| {i} | `{f['jassFunc']}` | {f['jassLine']} | {rc} | {ids} | {names} | "
            f"{f['shape']} | `{seq}` | {f['damageCalls']} | {gates} |"
        )
    lines.append("")
    lines.append("## ⛔ 補不完的那幾個 —— 每一筆都是一個能被反駁的理由")
    lines.append("")
    unresolved = [f for f in sorted(families, key=lambda x: x["jassLine"]) if not f["abilityIds"]]
    if not unresolved:
        lines.append("（沒有）")
    for f in unresolved:
        lines.append(f"### `{f['jassFunc']}`（{f['jassLine']} 行，{f['ownerKind']}）")
        lines.append("")
        lines.append(f["unresolvedReason"])
        lines.append("")
    lines.append("## 怎麼解析出來的")
    lines.append("")
    lines.append("| JASS 函式 | 解析路徑 |")
    lines.append("|---|---|")
    for f in sorted(families, key=lambda x: x["jassLine"]):
        lines.append(f"| `{f['jassFunc']}` | {f['resolvedVia']} |")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="唯讀：過期就回非零")
    args = ap.parse_args()

    want_json, want_md = build()
    targets = [(OUT_JSON, want_json), (OUT_MD, want_md)]

    if args.check:
        stale = []
        for path, want in targets:
            have = path.read_text(encoding="utf-8") if path.exists() else None
            if have != want:
                stale.append(path)
        if stale:
            for p in stale:
                print(f"STALE: {p.relative_to(ROOT)}", file=sys.stderr)
            print("⇒ 跑 `python3 tools/jass-combo/extract.py` 然後 git add", file=sys.stderr)
            return 1
        print(f"OK: {len(targets)} 份產物與 war3map.j 一致")
        return 0

    for path, want in targets:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(want, encoding="utf-8")
        print(f"wrote {path.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
