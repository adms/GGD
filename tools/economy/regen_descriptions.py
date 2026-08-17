#!/usr/bin/env python3
"""Task #108 — rewrite each item's 效能 block from the stats it actually grants.

    python3 tools/economy/regen_descriptions.py --check    # diff only, no writes
    python3 tools/economy/regen_descriptions.py            # apply

RUN THIS AFTER rescale_items.py. It reads the modifiers on disk, so running it
first bakes the pre-rescale numbers back into the text.

THE PROBLEM IT SOLVES. An imported item's description hard-codes the magnitudes
the w3x author wrote — 武聖手鐲 says 「15%機率造成2倍傷害」. The task #82 AEP
rescale moves magnitudes and never touched the text, so 65 of the 102 rescaled
items advertised a number they do not grant. The modifiers are the oracle
(the item's behaviour is what the sim reads), so the text is what moves.

WHAT IS REWRITTEN, AND WHAT IS NOT. Only the stat lines inside the 效能 block:

    神器            <- kept: category header
    效能
    敏捷+20         <- REPLACED by the GGD stats it actually grants
    30%機率造成2.5倍傷害 <- REPLACED
    攻擊力+55        <- REPLACED
    50%格擋100點傷害   <- kept: describes an ability, not a modifier
                    <- kept
    解說            <- kept
    這把精良的重刀...    <- kept verbatim. The flavour is the item.

A line is a stat line only if it matches one of the map's own stat spellings
(surveyed off the corpus: 攻擊力/裝甲/生命/魔力/攻擊速度/每秒回復生命/魔力回復
速度/移動速度, plus the 「N%機率造成M倍傷害」 crit form) or an attribute line
(敏捷/力量/智慧/全能力), which the importer expands into several GGD stats and
so cannot survive as written. Everything else is prose about an unported active
or aura and is left exactly where it is — those mechanics still exist even
though `item@1` has nowhere to put them yet.

⭐ 2026-08-18 —— **屬性與運算子的清單不再手抄在這裡**（CLAUDE.md 第〇·五守則）。

這一支是全 repo 最危險的一支手抄清單，因為它**改寫的是出貨道具的文案**：
表上沒有的東西不會報錯，它只是**不出現在描述裡**。稽核當天量到的三筆真實後果：

  · `evasion`（幻之匕首・仙后座）、`spellVamp`（至尊魔戒・落魂的嗜血劍）、
    `maxHitPctMaxHp`（謎之紙片）—— 道具真的給了，而文案**一個字都不會提**
  · `capRaise as 10`（無盡連刃）被折進 flat 加總 → 印出 **「攻擊速度+1000%」**
  · `manaRegen` 被標成比例 → 每秒回魔 +13 印出 **「魔力回復速度+1300%」**

後兩者比第一者更糟：一句**帶著數字的假話**，而它跟正確的長得一模一樣。

現在「有哪些屬性 / 有哪些運算子」一律由 `tools/engine-vocab/engine_vocab.py`
從出貨的 `Stat` / `ModOp` 推導；這裡只留三樣**人才決定得了**的東西 ——
原圖的用字（`WC3_LABEL`）、單位（`UNIT`）、出現順序（`EMIT_ORDER`）。
前兩樣**缺一條就 raise**，第三樣缺了只會少一次排序意見（⛔ 不會少一行文案）。
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools" / "engine-vocab"))

import engine_vocab as V  # noqa: E402  — python 端唯一的引擎詞彙來源

ITEMS = ROOT / "content" / "items"

# The block header is 「效能」, written with or without a colon (狂暴軒轅劍 uses
# 「效能：」), and the block ends at the blank line before the prose section —
# which is 「解說」 on most items and 「歷史」 on the two 製作書 chains.
EFFECT_HEADER = "效能"
SECTION_HEADERS = ("解說", "歷史")


def _is_effect_header(line: str) -> bool:
    return line.strip().rstrip("：:") == EFFECT_HEADER

# ── 屬性的用字 ───────────────────────────────────────────────────────────────
#
# ⛔ 2026-08-18 之前這裡是一份**手抄的 13 條**清單，而這一支會**改寫出貨道具的文案**
# —— 所以落在 13 條之外的 modifier（出貨道具上真的有：`evasion` / `spellVamp` /
# `maxHitPctMaxHp`）會被**靜默地從描述裡刪掉**：道具給了，文案不講。
#
# 現在只覆蓋「原圖有自己說法」的那幾條，其餘自動落到 `baseBonus.ts::STAT_LABEL_ZH`
# （`Record<Stat,…>`，TypeScript 逼它完整），所以**不可能有一條屬性沒有名字**。
WC3_LABEL = {
    "armor": "裝甲",              # 原圖寫「裝甲」不是「護甲」
    "maxHealth": "生命",
    "maxMana": "魔力",
    "healthRegen": "每秒回復生命",
    "manaRegen": "魔力回復速度",
    "as": "攻擊速度",
    "ms": "移動速度",
    # `STAT_LABEL_ZH` 的「單發傷害上限（最大生命比例）」是**面板**用的說明式名字，
    # 放進一行「⋯+20%」的效能文案裡太長。⚠️ 只是短一點的別名，不是第二個定義。
    "maxHitPctMaxHp": "單發傷害上限",
}
LABELS = V.label_table(WC3_LABEL, what="道具效能文案的屬性用字")

# 一條 **flat** modifier 該印成什麼單位。⛔ 每一條屬性都要有答案，缺一條就 raise。
#
# ⚠️ `rate` = 值本身是 0..1 的比例（吸血 0.2 → 「+20%」）。
# ⚠️ 舊版把 `manaRegen` 與 `as` 也標成比例，於是「每秒回魔 +13」被印成
#    **「魔力回復速度+1300%」** —— 一句帶著數字的假話，而且它看起來跟正確的一模一樣。
#    這兩條在 GGD 是**絕對量**（點/秒、次/秒），所以它們在這裡是 `amount`。
UNIT = {
    "critDamage": "multiple",  # 1.75 基礎上的**增量**，讀作「倍」
    **{s: "rate" for s in (
        "critChance", "cdr", "lifesteal", "evasion", "spellVamp",
        "outputDamagePct", "outputHealingPct", "outputShieldPct",
        "maxHitPctMaxHp", "unavoidablePct", "cooldownDrainRate",
    )},
    **{s: "amount" for s in (
        "maxHealth", "healthRegen", "maxMana", "manaRegen",
        "ad", "ap", "armor", "mr", "as", "ms", "range",
    )},
}
_unclassified = [s for s in V.stats() if s not in UNIT]
if _unclassified:
    sys.exit("⛔ regen_descriptions.py 的 UNIT 少了 %d 條屬性：%s\n"
             "   → 一條沒有單位的屬性會被印成一個沒有單位的數字（＝一句假話）。"
             % (len(_unclassified), "、".join(_unclassified)))

# ── 不是「加成」的那幾條屬性 ─────────────────────────────────────────────────
#
# ⛔ 這幾條**不可以印成 `+N%`**，因為它們在引擎裡不是一份加成，而是一個**閾值**
# 或一個**對別人那一格的折扣**。印成加成的話語意會**整個相反**：
#
#   · `maxHitPctMaxHp` 0.2 = 「我單次最多只吃 20% 最大生命」（`0` = 沒有上限）。
#     印成「單發傷害上限+20%」讀起來是「我可以被打掉更多」—— 一句意思**反過來**
#     的話，而且它跟正確的長得一模一樣（`sim/combat/damage.ts` 的 clamp）。
#   · `unavoidablePct` 是**對方迴避率**的折扣（`p × (1 - value)`），⛔ 不是我的
#     第三種命中率。「無法被迴避+100%」不是一句中文。
#   · `cooldownDrainRate` 0.5 = **×1.5**（`0` = ×1）。owner 的卡面就寫 ×1.5，
#     而 `STAT_LABEL_ZH` 的名字已經帶了「加成」二字 → 「冷卻流逝速度加成+50%」
#     是把同一件事講了兩次。
#
# ⚠️ `{num}` 一律是 `value × 100`（三條都是 0..1 的比例），`{mult}` 是 `1 + value`。
STAT_PHRASE = {
    "maxHitPctMaxHp": "單發傷害上限＝最大生命{num}%",
    "unavoidablePct": "無視敵方迴避{num}%",
    "cooldownDrainRate": "冷卻流逝速度×{mult}",
}
_phrase_unknown = sorted(s for s in STAT_PHRASE if s not in set(V.stats()))
if _phrase_unknown:
    sys.exit("⛔ STAT_PHRASE 有引擎不認得的屬性：%s" % "、".join(_phrase_unknown))

# 每一個 `ModOp` 印成什麼。⛔ 缺一個就 raise（`V.require_ops`）。
#
# ⚠️ 舊版把「不是 pctAdd/pctMult 的一律當成 flat 加總」，於是
# `capRaise as 10`（解鎖攻速上限到 10）被折進攻速的 flat 桶，印出
# **「攻擊速度+1000%」**。⛔ 一個沒被想過的運算子不可以被折進加總。
#   None = 走上面的 UNIT（一般加減）
OP_FORM = {
    "flat": None,
    "pctAdd": None,
    "pctMult": None,
    "override": "{label}固定為{num}",
    "capRaise": "{label}上限解鎖至{num}",
    "capRaisePct": "{label}上限解鎖+{num}%",
    "percentOf": "{label}+{extra}的{num}%",
}
V.require_ops(OP_FORM, "道具效能文案的 modifier 呈現")

RESOURCE_LABEL = {"hp": "目前生命", "mp": "目前魔力"}

# 出現的順序。⛔ 這**不是**清單 —— 沒被點名的屬性照 `Stat` 的宣告順序接在後面，
# 所以引擎多一條屬性時這裡只會少一次排序意見，⛔ 不會少一行文案。
EMIT_ORDER = ["ad", "ap", "armor", "mr", "maxHealth", "maxMana",
              "healthRegen", "manaRegen", "as", "ms", "lifesteal", "cdr", "range"]
EMIT_ORDER += [s for s in V.stats() if s not in EMIT_ORDER]

# ── 出貨文案的**舊用字** ─────────────────────────────────────────────────────
#
# ⛔ 擁有權（`is_owned`）不是「好看」的問題，它決定一行字是**被取代**還是**被留下**。
# 認不得一個舊用字的後果不是「少改一行」，而是**多一行**：作者寫的
# 「魔抗+40%」被留下，產生器再寫一行「魔法抗性+66.7」貼在它旁邊 ——
# 同一個區塊裡兩行指著同一條屬性，講兩個不同的數字（祕銀鎖子甲，2026-08-18 量到）。
# 全 repo 掃過一遍是 **22 件**。
#
# ⚠️ 判準是「**產生器自己寫得出這一行嗎**」，⛔ 不是「這一行看起來像不像屬性」：
#   · `[標籤] ⋯` 開頭的一律**不屬於**產生器（那是技能/靈氣的散文，`startswith`
#     天然擋掉）—— 「[腐蝕] 周圍敵方單位防禦 -30%」講的是**敵人**那一格。
#   · 值指到哪一條屬性只給下面的重複偵測用；擁有權只看鍵。
OWNED_ALIASES = {
    "防禦": "armor", "總防禦": "armor", "護甲": "armor",
    "總攻擊": "ad", "攻擊": "ad",
    "AP": "ap", "總AP": "ap", "總 AP": "ap", "總 AP 額外": "ap", "法強": "ap",
    "MP": "maxMana", "最大魔力": "maxMana", "總魔力": "maxMana",
    "HP": "maxHealth", "最大生命": "maxHealth", "總生命": "maxHealth",
    "魔抗": "mr", "魔防": "mr", "魔法防禦": "mr",
    "每秒生命回復": "healthRegen", "每秒回血": "healthRegen", "生命回復 /秒": "healthRegen",
    "每秒魔力回復速度": "manaRegen", "每秒魔力回復": "manaRegen",
    "每秒回魔": "manaRegen", "魔力回復 /秒": "manaRegen",
    "普攻吸血": "lifesteal", "全能吸血": "lifesteal",
    "攻擊速度 /秒": "as", "總攻擊速度": "as",
    "總移動速度": "ms",
    "閃避": "evasion",
    "力敏智": None, "全能力": None,            # 三圍一起給 —— 被展開成好幾條 GGD 屬性
    "敏捷": None, "力量": None, "智慧": None, "智力": None,
    "生命最大": "maxHealth", "魔力最大": "maxMana", "生命上限": "maxHealth",
    "範圍裝甲": "armor", "範圍每秒回復生命": "healthRegen",
}
_alias_unknown = sorted({s for s in OWNED_ALIASES.values()
                         if s is not None and s not in set(V.stats())})
if _alias_unknown:
    sys.exit("⛔ OWNED_ALIASES 指到引擎不認得的屬性：%s" % "、".join(_alias_unknown))

# Lines the generator OWNS: anything it could have written itself, plus the
# WC3 attribute lines that no longer survive as attributes.
OWNED_LABELS = set(LABELS.values()) | set(OWNED_ALIASES)
STAT_LINE = re.compile(r"^([一-鿿]{2,10})\s*([+-])\s*([\d.]+)\s*([%％]?)$")
# 標籤含括號時（`單發傷害上限（最大生命比例）`）上面那條字元類別對不上，而**對不上
# 就等於不擁有**，於是下一次執行會把同一行再寫一次。所以擁有權改成「已知標籤 + 數字尾」。
# ⚠️ **全形 `％` 也要收** —— 妖物碎殺牙寫的是「吸血+15％」，只差一個字元寬度，
# 而代價是整整一行重複（產生器再寫一次半形的「吸血+15%」）。
OWNED_TAIL = re.compile(r"^\s*[+-]\s*[\d.]+\s*[%％倍]?$")

# Stat lines the map writes as a phrase rather than as `label ± number`. Each
# maps onto a GGD modifier the generator emits, so leaving them behind would
# put a contradiction two lines apart — 月牙魔杖 would read 「減少魔法傷害50%」
# above 「魔法抗性+200」. The trailing parenthetical on 吸血 is the WC3 (法球)
# orb / (結界) aura tag, which does not survive as a mechanic either.
PHRASE_LINES = [
    re.compile(r"^[\d.]+%機率造成[\d.]+倍傷害$"),          # crit
    re.compile(r"^減少魔法傷害[\d.]+%$"),                   # magic resist
    re.compile(r"^吸血[\d.]+%\s*[（(].*[）)]$"),            # lifesteal
    # 「力量、敏捷+15」 — one ability granting several attributes at once.
    re.compile(r"^(?:力量|敏捷|智慧|智力)(?:、(?:力量|敏捷|智慧|智力))+\s*[+-][\d.]+$"),
    # ⭐ 產生器自己寫得出來的**片語**形式（`OP_FORM` 的四種）。少了它們，
    #   下一次執行會把同一句再寫一次 —— 擁有權缺一格 = 一行重複，而且會累積。
    re.compile(r"^[^+]{1,16}上限解鎖至[\d.]+$"),
    re.compile(r"^[^+]{1,16}上限解鎖\+[\d.]+%$"),
    re.compile(r"^[^+]{1,16}固定為[\d.]+$"),
    re.compile(r"^[^+]{1,16}\+[^+]{1,10}的[\d.]+%$"),
    # 作者手寫的 `percentOf`：「AP+ (目前MP的 5%)」（光魔杖）。⛔ 尾巴不是數字，
    # 所以 `OWNED_TAIL` 對不上；不收的話它會與產生器的
    # 「法術強度+目前魔力的5%」並排。全 repo 只有這一種寫法（掃過）。
    re.compile(r"^(?:[A-Za-z]{2,3}|[一-鿿]{2,8})\s*\+\s*[（(][^）)]{1,20}[）)]$"),
    # ⭐ 帶職業限定閘的那一行（`攻擊距離+4（近戰）`），見 `stat_lines`。
    re.compile(r"^[^+]{1,16}[+-][\d.]+%?（[^）]{1,20}）$"),
    # ⭐ `STAT_PHRASE` 的三種（閾值／折扣／倍率），⛔ 它們永遠沒有 `+`。
    re.compile(r"^單發傷害上限＝最大生命[\d.]+%$"),
    re.compile(r"^無視敵方迴避[\d.]+%$"),
    re.compile(r"^冷卻流逝速度×[\d.]+$"),
]


def fmt(value: float) -> str:
    """Trim a float to the shortest exact decimal: 3.0 -> '3', 2.198 -> '2.198'."""
    text = f"{value:.3f}".rstrip("0").rstrip(".")
    return text or "0"


def _signed(label: str, value: float, unit: str) -> str:
    sign = "+" if value > 0 else "-"
    if unit == "rate":
        return f"{label}{sign}{fmt(abs(value) * 100)}%"
    if unit == "multiple":
        return f"{label}{sign}{fmt(abs(value))}倍"
    return f"{label}{sign}{fmt(abs(value))}"


def _plain_line(stat: str, value: float, is_pct: bool) -> str:
    """一條無條件加成印成什麼 —— `STAT_PHRASE` 優先，其餘走 `UNIT`。"""
    form = STAT_PHRASE.get(stat)
    if form is None:
        return _signed(LABELS[stat], value, "rate" if is_pct else UNIT[stat])
    if is_pct:
        # 「單發傷害上限」乘一個百分比沒有意義（它是閾值不是加成）。⛔ 不要猜。
        raise V.VocabError(
            f"`{stat}` 是閾值型屬性，不可以用 pctAdd/pctMult —— 改那份內容 JSON")
    return form.format(num=fmt(value * 100), mult=fmt(1 + value))


def _gated_line(m: dict, gate: str) -> str:
    """帶職業限定閘的那一行 —— 「攻擊距離+4（近戰）」。

    括號裡的字與 `sim/content/requirement.ts::requirementShortLabel` 同源，
    所以商店卡片、三選一、codex 與這份文案不可能對同一個閘講出兩種話。
    """
    op, stat, value = m["op"], m["stat"], m["value"]
    form = OP_FORM[op]
    if form is not None:
        num = fmt(value * 100) if op in ("capRaisePct", "percentOf") else fmt(value)
        body = form.format(label=LABELS[stat], num=num, extra=_source_label(m))
    else:
        body = _plain_line(stat, value, op in ("pctAdd", "pctMult"))
    return f"{body}（{gate}）"


def _source_label(m: dict) -> str:
    """`percentOf` 的來源：一條屬性（`from`）或一項當下的資源（`fromResource`）。"""
    if m.get("from") in LABELS:
        return LABELS[m["from"]]
    res = m.get("fromResource")
    return RESOURCE_LABEL.get(res, res) if res else "來源"


def stat_lines(modifiers: list) -> list[str]:
    """出貨 modifier → 效能區塊的行。⛔ **一條 modifier 都不可以被靜默丟掉。**"""
    by_stat: dict[str, float] = {}
    percent: dict[str, float] = {}
    phrases: list[tuple[str, str]] = []  # (stat, 那一行) —— 折不進加總的運算子
    for m in modifiers or []:
        stat, op = m.get("stat"), m.get("op")
        if stat not in LABELS:
            raise V.VocabError(
                f"道具的 modifier 用了引擎不認得的屬性 `{stat}` —— 改那份內容 JSON")
        if op not in OP_FORM:
            raise V.VocabError(
                f"道具的 modifier 用了引擎不認得的運算子 `{op}` —— 改那份內容 JSON")
        # ⛔ **帶 `requires` 的一律自己一行。** 它是一條**有條件**的加成，而加總是
        # 無條件的：貫雷槍的 `range +4（近戰）` 與 `range +2（遠程）` 折起來就是
        # 「攻擊距離+6」—— 一個**沒有任何一位英雄拿得到**的數字，而且它會被插在
        # 作者自己寫對的那句話正上方（2026-08-18 量到，godie-i01g）。
        gate = V.requirement_short_label(m.get("requires"))
        if gate:
            phrases.append((stat, _gated_line(m, gate)))
            continue
        form = OP_FORM[op]
        if form is not None:
            # ⛔ 解鎖上限／覆寫／衍生屬性**不是加成**，折進加總會印出假的數字。
            num = fmt(m["value"] * 100) if op in ("capRaisePct", "percentOf") else fmt(m["value"])
            phrases.append((stat, form.format(label=LABELS[stat], num=num,
                                              extra=_source_label(m))))
        elif op in ("pctAdd", "pctMult"):
            percent[stat] = percent.get(stat, 0.0) + m["value"]
        else:
            by_stat[stat] = by_stat.get(stat, 0.0) + m["value"]

    # 暴擊的兩條併成原圖的說法「N%機率造成M倍傷害」，所以它們不再各自出一行。
    crit_line = None
    chance = by_stat.get("critChance")
    if chance:
        # `critDamage` is a DELTA on the 1.75 champion base, and the tooltip
        # form states the absolute multiple — the same convention the source
        # descriptions use, so this line reads like the ones it replaces.
        multiplier = 1.75 + by_stat.pop("critDamage", 0.0)
        crit_line = f"{fmt(by_stat.pop('critChance') * 100)}%機率造成{fmt(multiplier)}倍傷害"

    out = []
    for stat in EMIT_ORDER:
        # A stat can arrive flat AND as a percentage (as/manaRegen do); each
        # gets its own line so neither is silently folded into the other.
        for source, is_pct in ((by_stat, False), (percent, True)):
            value = source.get(stat)
            if not value:
                continue
            out.append(_plain_line(stat, value, is_pct))
        out += [line for s, line in phrases if s == stat]
    if crit_line:
        out.append(crit_line)
    return out


# ── 重複偵測：同一個區塊不可以有兩行指向同一條屬性 ────────────────────────────
#
# ⚠️ 這是 `OWNED_ALIASES` 的**另一半**，而且它擋的是別的東西：別名管的是
# 「作者寫的那一行是不是我的」，這裡管的是「留下來的散文有沒有已經講過這條屬性」。
# 兩行指著同一條屬性、講兩個不同的數字，是玩家**唯一看得到**的症狀 ——
# 而卡片上沒有任何東西告訴他哪一行是真的。
#
# ⛔ 它**只回報，不刪行**：留下來的那一行可能在講**敵人**那一格
#（「[腐蝕] 周圍敵方單位防禦 -30%」）或一個技能的內部效果，而這一支分不出來。
# 猜錯的代價是刪掉一句真的機制描述，比多印一行還糟。
_STAT_BY_LABEL = {lbl: stat for stat, lbl in LABELS.items()}
_STAT_BY_LABEL.update({k: v for k, v in OWNED_ALIASES.items() if v is not None})
# 長的先比 —— 「攻擊距離」要贏過「攻擊」。
_CLAIM_LABELS = sorted(_STAT_BY_LABEL, key=len, reverse=True)
_CLAIM_TAIL = re.compile(r"^\s*[+-]\s*[\d.]")


def claimed_stats(line: str) -> set:
    """這一行**看起來**在宣稱哪幾條屬性（`標籤 ± 數字` 的每一處）。

    ⚠️ 長標籤先比，而且**已經被長標籤吃掉的字不再重比** —— 否則
    「技能吸血+30%」裡的「吸血」會被算成第二條 `lifesteal`，於是一行字自己跟
    自己打架（`spellVamp` 與 `lifesteal` 是兩條不同的屬性）。
    """
    found, taken = set(), []
    for lbl in _CLAIM_LABELS:
        start = 0
        while True:
            i = line.find(lbl, start)
            if i < 0:
                break
            j = i + len(lbl)
            if not any(a <= i and j <= b for a, b in taken) and _CLAIM_TAIL.match(line[j:]):
                found.add(_STAT_BY_LABEL[lbl])
                taken.append((i, j))
                break
            start = i + 1
    return found


def is_owned(line: str) -> bool:
    if any(p.match(line) for p in PHRASE_LINES):
        return True
    m = STAT_LINE.match(line)
    if m and m.group(1) in OWNED_LABELS:
        return True
    # 括號、空白、「倍」結尾的標籤，上面那條字元類別對不上 —— 直接比已知標籤。
    return any(line.startswith(lbl) and OWNED_TAIL.match(line[len(lbl):])
               for lbl in OWNED_LABELS)


def rewrite(description: str, modifiers: list) -> str | None:
    """New description, or None when there is nothing to rewrite.

    AN ITEM WITH NO MODIFIERS IS LEFT ALONE — its stat lines are not a lie this
    can correct, because there is nothing to correct them to. Callers that know
    better pass someone else's modifiers: a 製作書 recipe book grants nothing
    itself and its 效能 block describes the item it COMBINES INTO, so it is
    regenerated from that item (see `recipe_target`).
    """
    if not modifiers:
        return None
    lines = description.split("\n")
    header = next((i for i, l in enumerate(lines) if _is_effect_header(l)), None)
    if header is None:
        return None

    # The block ends at the blank line or the next section header.
    end = len(lines)
    for i in range(header + 1, len(lines)):
        if not lines[i].strip() or lines[i].strip() in SECTION_HEADERS:
            end = i
            break

    block = lines[header + 1:end]
    owned = [i for i, l in enumerate(block) if is_owned(l.strip())]
    generated = stat_lines(modifiers)
    if not owned and not generated:
        return None

    # Substitute at the first owned line so the surrounding prose keeps its
    # position; if the block had no stat lines at all, the stats lead it.
    anchor = owned[0] if owned else 0
    kept = [(i, l) for i, l in enumerate(block) if i not in owned]
    new_block: list[str] = []
    for i, l in kept:
        if i > anchor and generated:
            new_block.extend(generated)
            generated = []
        new_block.append(l)
    if generated:
        insert = anchor if not owned else len(new_block)
        new_block[insert:insert] = generated

    if new_block == block:
        return None
    return "\n".join(lines[:header + 1] + new_block + lines[end:])


def block_conflicts(description: str) -> list[tuple[str, str, str]]:
    """效能區塊裡**兩行指著同一條屬性**的每一組（stat, 甲行, 乙行）。

    對**改寫後**的文字跑，所以它問的是玩家真的會看到什麼。見 `claimed_stats`
    的檔頭：⛔ 只回報，不刪行。
    """
    lines = description.split("\n")
    header = next((i for i, l in enumerate(lines) if _is_effect_header(l)), None)
    if header is None:
        return []
    end = len(lines)
    for i in range(header + 1, len(lines)):
        if not lines[i].strip() or lines[i].strip() in SECTION_HEADERS:
            end = i
            break
    seen: dict[str, tuple[str, bool]] = {}
    out = []
    for line in lines[header + 1:end]:
        text = line.strip()
        mine = is_owned(text)
        for stat in sorted(claimed_stats(text)):
            if stat not in seen:
                seen[stat] = (text, mine)
                continue
            prev, prev_mine = seen[stat]
            # ⛔ 兩行**都是**產生器寫的 = 刻意的（flat 與 % 各一行、閘的每一邊
            #    各一行）。⭐ 病灶是「我寫的一行 + 留下來的散文」那一種組合。
            if mine and prev_mine:
                continue
            out.append((stat, prev, text))
    return out


RECIPE_SUFFIX = "製作書"


def recipe_target(name: str, by_name: dict) -> list | None:
    """The modifiers a 製作書's 效能 block is actually describing.

    The book is a no-op excluded from both shop and draft (starter.go S3), and
    its text is about the item it combines into — 斬龍刀製作書 quotes 斬龍刀's
    numbers. Resolved by name, which is unambiguous for 54 of the 55 books; the
    odd one out is reported rather than guessed at.
    """
    hits = by_name.get(name.replace(RECIPE_SUFFIX, ""), [])
    return hits[0] if len(hits) == 1 else None


def run(apply: bool) -> int:
    changed, skipped, unchanged, conflicts = [], [], 0, []
    docs = []
    for path in sorted(ITEMS.glob("*.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        doc.setdefault("id", path.stem)
        docs.append((path, doc))
    by_name: dict[str, list] = {}
    for _, doc in docs:
        by_name.setdefault(doc.get("name"), []).append(doc.get("modifiers") or [])

    for path, doc in docs:
        description = doc.get("description")
        if not description:
            continue
        name = doc.get("name") or ""
        modifiers = doc.get("modifiers") or []
        if RECIPE_SUFFIX in name and not modifiers:
            modifiers = recipe_target(name, by_name) or []
            if not modifiers:
                skipped.append((doc.get("id"), name,
                                "recipe book whose target item could not be resolved "
                                "by name — its 效能 block is left as authored"))
                continue
        new = rewrite(description, modifiers)
        for stat, a, b in block_conflicts(new if new is not None else description):
            conflicts.append((doc.get("id"), doc.get("name"), stat, a, b))
        if new is None:
            has_stats = any(is_owned(l.strip()) for l in description.split("\n"))
            has_header = any(_is_effect_header(l) for l in description.split("\n"))
            if has_stats and not has_header:
                skipped.append((doc.get("id"), doc.get("name"),
                                "has stat lines but no 效能 header to anchor them"))
            else:
                unchanged += 1
            continue
        changed.append((doc.get("id"), doc.get("name"), description, new))
        if apply:
            doc["description"] = new
            path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n",
                            encoding="utf-8")

    print("descriptions rewritten: %d   left alone: %d   %s"
          % (len(changed), unchanged, "APPLIED" if apply else "DRY RUN"))
    for iid, name, old, new in changed:
        print("\n  %s  %s" % (iid, name or ""))
        for line in ("  - " + old.replace("\n", "\n  - ")).split("\n"):
            print("  " + line)
        for line in ("  + " + new.replace("\n", "\n  + ")).split("\n"):
            print("  " + line)
    if skipped:
        print("\nSKIPPED (%d):" % len(skipped))
        for iid, name, why in skipped:
            print("  %-14s %-20s %s" % (iid, (name or "")[:18], why))
    if conflicts:
        print("\n同一區塊兩行指向同一條屬性 (%d) —— ⛔ 沒有刪任何一行，這是給人看的："
              % len(conflicts))
        for iid, name, stat, a, b in conflicts:
            print("  %-22s %-18s %-14s %s  ⟂  %s"
                  % (iid, (name or "")[:16], stat, a, b))
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report only, write nothing")
    a = ap.parse_args()
    sys.exit(run(apply=not a.check))
