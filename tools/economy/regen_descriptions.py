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

# Lines the generator OWNS: anything it could have written itself, plus the
# WC3 attribute lines that no longer survive as attributes.
OWNED_LABELS = set(LABELS.values()) | {
    "敏捷", "力量", "智慧", "智力", "全能力",
    "生命最大", "魔力最大", "生命上限", "範圍裝甲", "範圍每秒回復生命",
}
STAT_LINE = re.compile(r"^([一-鿿]{2,10})\s*([+-])\s*([\d.]+)\s*(%?)$")
# 標籤含括號時（`單發傷害上限（最大生命比例）`）上面那條字元類別對不上，而**對不上
# 就等於不擁有**，於是下一次執行會把同一行再寫一次。所以擁有權改成「已知標籤 + 數字尾」。
OWNED_TAIL = re.compile(r"^\s*[+-]\s*[\d.]+\s*[%倍]?$")

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
            out.append(_signed(LABELS[stat], value, "rate" if is_pct else UNIT[stat]))
        out += [line for s, line in phrases if s == stat]
    if crit_line:
        out.append(crit_line)
    return out


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
    changed, skipped, unchanged = [], [], 0
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
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report only, write nothing")
    a = ap.parse_args()
    sys.exit(run(apply=not a.check))
