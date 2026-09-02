#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""⭐【owner 2026-08-21】屬性額外傷害 → AP 百分比的**換算計畫產生器**。

owner 2026-08-21（逐字）：

> 「檢查所有技能 原本有屬性額外傷害的部分**都換成 AP**，
>  **乘數幾倍屬性 變成 1/4 百分比**，例如**原本 力量*4 => AP *100%**
>  但取**百分比整數**例如 10/20/30/40/50/60/70/80/90/100/110/120/130/140%…」

```bash
pnpm apconv:plan          # 重生成計畫（docs/ + docs/_data/）
pnpm apconv:plan -- --check   # 唯讀：產物過期就回非零
```

⛔ **這一支只讀 `content/`，一個位元組都不寫。** 真正改 JSON 的是 stage 2 的
`apconv:build` / `apconv:check`（規格寫在產出的計畫文件裡，⛔ 還沒接上）。

── 為什麼「屬性」＝ 描述裡的 `力量/敏捷/智慧 × N`，⛔ 不是 JSON 的 `ratios` ──
`ratios[{stat:"ap"|"ad"}]` 兩條都是**最終戰鬥屬性**，⛔ 不是 owner 說的「屬性」。
引擎自己的表（`sim/stats/attributes.ts::ATTR_STAT_SOURCE`）只認三個屬性
（str/agi/int），而 `ad` 與 `ap` 都在那張表的**右邊**（被屬性餵養的下游）。
⇒ 「原本有屬性額外傷害」的唯一可查來源是**卡面說明**裡的 `力量*3` 這種字樣，
   而它今天與 JSON 的 `ratios` **毫無關係**（本檔產出的對照表就是證據）。

⚠️ 掃描前**一定要先剝掉 `「…」`**（第〇·六守則②：那是角色對白不是效果）。

⚠️ 刻意**沒有產生日期**（同 `caps:export` / `spec:build` / `lowdmg:build`）：
任何隨時鐘變動的欄位都會讓 `--check` 的逐位元組比對永遠不相等，於是它只能被
放寬成模糊比對 —— 而一條被放寬的閘等於沒有閘（GH#389 · #426）。
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
import statistics as stats
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

OUT_MD = "docs/技能AP換算計畫.md"
OUT_JSON = "docs/_data/ap-conversion-plan.json"
OUT_CSV = "docs/_data/ap-conversion-plan.csv"

LEVELS = (30, 50, 99)

# ── 換算開關 ────────────────────────────────────────────────────────────────
# ⛔⛔ **一個字面值都不寫在這裡。** owner 2026-08-22（#544）：
#   「別忘了現在所有技能力敏智屬性額外傷害都換算成AP, 公式你應該知道，
#     **若無記得請寫在JSON, script**」
#
# ⚠️ 這一段在 2026-08-22 之前是**四個寫死的常數**，而 `apply.py` 讀的是
#   `knobs.json` ⇒ 同一個 0.25 有**兩個住處**（第〇·四守則），中間沒有任何守衛：
#   把 `knobs.json` 的 `apPerAttrPoint` 改成 0.3，`apconv:build` 會照 0.3 換算，
#   而 `apconv:plan` 產出的計畫文件仍然印「屬性乘數 × 25%」—— 兩支都 EXIT 0，
#   owner 讀到的那份對照表變成一份**看起來完全正常的謊話**。
# ⇒ 現在唯一的住處是 `tools/ap-conversion/knobs.json`（`$formula` 那一格連
#   公式的文字說明都住在裡面），這一支只是把它讀進來。
KNOBS_PATH = "tools/ap-conversion/knobs.json"

with open(os.path.join(ROOT, KNOBS_PATH), encoding="utf-8") as _f:
    KNOBS = json.load(_f)

#: ⭐ owner 的「1/4」：一點屬性 = 這麼多 AP 百分比。
AP_PER_ATTR_POINT = KNOBS["apPerAttrPoint"]
#: ⭐ owner 的「取百分比整數 10/20/30…」：百分比的粒度。
STEP_PCT = KNOBS["stepPct"]
#: 取整方向。"halfUp"（出貨預設）/ "ceil" / "nearestEven"。
ROUNDING = KNOBS["rounding"]
#: 換算後的下限 —— ⛔ 不讓任何一條宣稱被取整成 0（那就是第一·五守則的空宣稱）。
MIN_PCT = KNOBS["minPct"]


def round_pct(raw: float, rounding: str = ROUNDING, step: int = STEP_PCT) -> int:
    """把 `raw`（百分點）收到 `step` 的倍數。

    ⭐ 出貨規則是 **halfUp（四捨五入，.5 一律進位）**：
      · 整數乘數 × 25 永遠落在 25 的倍數上 ⇒ 奇數乘數的尾數必為 25 或 75，
        兩者在 10 的刻度上都剛好是 .5 ⇒ **每一個奇數乘數都 +5**，偶數乘數不動。
        於是 1→30 · 2→50 · 3→80 · 4→100 · 5→130 · 6→150 · 7→180 · 9→230 · 10→250，
        **單調且對稱**。
      · ⛔ 不選 nearestEven：它會把 25→20 而 75→80（同樣的「.5」走兩個方向），
        那是 owner 一定會問「為什麼」的鋸齒。
      · ⛔ 不選 ceil：對整數乘數與 halfUp 逐位元相同（所以今天看不出差別），
        但對未來的非整數乘數會**系統性灌水**（1.7 → ceil 50 / halfUp 40）。
    """
    q = raw / step
    if rounding == "ceil":
        n = -((-q) // 1)
    elif rounding == "nearestEven":
        n = round(q)
    else:
        n = (q + 0.5) // 1
    return max(MIN_PCT, int(n) * step)


# ── 讀出貨檔（⛔ 一個字面值都不抄） ─────────────────────────────────────────
def J(rel: str):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
        return json.load(f)


ENV = J("content/config/combat-env.json")["multipliers"]
BASE_BONUS = J("content/config/base-bonus.json")["bonus"]
PER_LEVEL = J("content/config/per-level-bonus.json")["perLevel"]
STAT_CAPS = J("content/config/stat-caps.json")["caps"]
DAMAGE_TIERS = J("content/config/damage-tiers.json")["damage"]
RETIRED = set(J("content/config/roster.json")["retiredChampions"])

#: `ATTR_STAT_SOURCE`（`sim/stats/attributes.ts`）的 python 鏡射 —— 只需要這四條。
ATTR_SRC = {
    "ap": ("int", "intToAbilityPower", "add"),
    "ad": ("str", "strToAttackDamage", "add"),
    "as": ("agi", "agiToAttackSpeed", "scaleBase"),
    "maxHealth": ("str", "strToMaxHealth", "add"),
}
#: `STAT_ENV_CHAIN`（`sim/combatEnv.ts`）的同四條。
ENV_CHAIN = {"ap": ["abilityPower"], "ad": ["attackDamage"], "as": ["attackSpeed"], "maxHealth": ["maxHealth"]}

NORM = J("content/config/stat-normalization.json")


def normalize_card(champ: dict) -> dict:
    """把一張英雄卡過一次**屬性正規化**（`resolveChampionStats` 的 python 鏡射）。

    ⚠️⚠️ **這一步在 2026-08-21 之前是缺的，而缺了它這份文件的錨點表就是錯的。**
    英雄卡上的 `growth.*` 是**裝飾**：註冊時 `registries.ts` 會用
    `config.stat-normalization@1` 把它整排蓋掉（出身五級距 × referenceLevel 99 反解）。
    ⇒ 直接讀卡上的數字＝量了一份**玩家永遠不會遇到**的狀態（失敗形態⑤：
      被測的不是出貨的那個）。

    🔴 實測差多少：`intToAbilityPower` 從 6.5 調到 10 之後，AP 的級距目標沒有跟著動，
      於是 **22/49 位的 `growth.ap` 被反解成負數再夾成 0** —— 卡上仍然寫著 0.21。
      少了這一步，L99 中位 AP 會被報成 354.6，而出貨管線給的是 **333.6**。

    ⛔ 只鏡射 `ATTR_SRC` 認得的那四條（ap / ad / as / maxHealth）—— 這份文件量的
      就是這四條。其餘（armor / maxMana / 回血回魔…）的三圍來源不在 `ATTR_SRC` 裡，
      硬解會解出一個**錯的**成長，⇒ 那幾條照原樣留著（它們與這份文件無關）。
    """
    if NORM.get("mode") != "normalized":
        return champ
    out = json.loads(json.dumps(champ))
    base = dict(out.get("baseStats") or {})
    growth = dict(out.get("growth") or {})
    origin = out.get("origin")
    for key in NORM.get("appliesTo", []):
        if key not in ATTR_SRC:
            continue
        band = (NORM.get("byOrigin", {}).get(key) or {}).get(origin)
        if band is None:
            continue
        ladder = NORM.get("bands", {}).get(key)
        scale = (NORM.get("scaleByOrigin", {}).get(key) or {}).get(origin)
        if scale:
            ladder = (NORM.get("bandsByScale", {}).get(key) or {}).get(scale) or ladder
        target = (ladder or {}).get(band)
        if not isinstance(target, (int, float)):
            continue
        probe_card = dict(out)
        probe_card["baseStats"] = base
        if NORM.get("channel", {}).get(key) == "growth":
            # ⭐ 解**斜率**不用減法 —— 攻速是 `scaleBase`（乘法），減法會少扣一個
            #   倍率而且不會報錯（逐字同 `statNormalization.ts` 那一段的理由）。
            ref = NORM.get("referenceLevel", 99)

            def probe(g: float) -> float:
                probe_card["growth"] = {**growth, key: g}
                return stat_base(probe_card, key, ref)

            g0 = probe(0.0)
            slope = probe(1.0) - g0
            if slope == 0:
                continue
            needed = (target - g0) / slope
            growth[key] = needed if NORM.get("allowNegativeGrowth") else max(0.0, needed)
        else:
            probe_card["growth"] = growth
            attr_part = stat_base(probe_card, key, 1) - (base.get(key) or 0)
            base[key] = target - attr_part
    out["baseStats"] = base
    out["growth"] = growth
    return out


def generator_owned() -> set[str]:
    """`tools/skill-remake/batch1.py` 的 `HERO` —— ⛔ 不抄名單，直接讀那個字面值。

    ⚠️ 這正是 `stamp_provenance.py` / `export_xlsx.py` / `abilityProvenance.test.ts`
       三個既有讀者用的同一招（見 batch1.py 檔頭③），所以加/減一位英雄不會漏。
    """
    src = open(os.path.join(ROOT, "tools/skill-remake/batch1.py"), encoding="utf-8").read()
    blk = src.split("\nHERO = {", 1)[1].split("\n}", 1)[0]
    ids = set(re.findall(r'"(godie-[0-9a-z]+)"', blk))
    if len(ids) < 10:
        raise SystemExit("batch1.py 的 HERO 讀出 <10 位 —— 讀取器壞了，⛔ 不是英雄變少")
    return ids


def population() -> list[str]:
    """平衡量測母體 = starterChampions − retired − 變身態（`testkit/balancePopulation.ts`）。"""
    go = open(os.path.join(ROOT, "apps/platform/internal/curation/starter.go"), encoding="utf-8").read()
    blk = go.split("starterChampions = []string{", 1)[1].split("}", 1)[0]
    starter = re.findall(r'"([^"]+)"', blk)
    alternates = set()
    for name in sorted(os.listdir(os.path.join(ROOT, "content/champions"))):
        if not name.endswith(".json") or name.startswith("_"):
            continue
        doc = J("content/champions/" + name)
        if (doc.get("transform") or {}).get("role") == "alternate" and doc.get("id"):
            alternates.add(doc["id"])
    if not alternates:
        raise SystemExit("content/champions 讀出 0 個變身態 —— 讀取器壞了")
    ids = sorted({i for i in starter if i not in RETIRED and i not in alternates})
    if not ids:
        raise SystemExit("母體算出 0 位 —— 讀取器壞了")
    return ids


# ── 屬性宣稱的抽取器 ────────────────────────────────────────────────────────
ATTR_ZH = {"力量": "str", "敏捷": "agi", "智慧": "int", "智力": "int"}
_A = "力量|敏捷|智慧|智力"
#: `力量*3` / `[敏捷]*5` / `(智慧*7)` / `敏捷係數*5` / `力量傷害*9`
P_ATTR_MUL = re.compile(rf"[\[（(]?\s*({_A})\s*[\]）)]?\s*(?:係數|傷害)?\s*[*×]\s*([0-9]+(?:\.[0-9]+)?)")
#: `技能等級*敏捷*7` 的前綴形、`3*力量`
P_MUL_ATTR = re.compile(rf"([0-9]+(?:\.[0-9]+)?)\s*[*×]\s*[\[（(]?\s*({_A})\s*[\]）)]?")
#: `3倍敏捷傷害`
P_TIMES = re.compile(rf"([0-9]+(?:\.[0-9]+)?)\s*倍\s*[\[（(]?\s*({_A})\s*[\]）)]?")


def mechanics_text(desc: str) -> str:
    """⛔ 剝掉整段 `「…」` —— 那是角色對白，不是效果（第〇·六守則②）。

    ⚠️ 剝的是**整段**（含跨行、含行中），⛔ 不是「行首是「的那幾行」——
       後者漏掉「造成 X 傷害「台詞」再造成 Y」這種寫法。
    """
    return re.sub(r"「[^」]*」", "", desc or "", flags=re.S)


def claims(desc: str) -> list[tuple[str, float]]:
    """描述裡的**屬性乘數**宣稱，去重、保序。"""
    text = mechanics_text(desc)
    out: list[tuple[str, float]] = []

    def add(attr_zh: str, coeff: str) -> None:
        item = (ATTR_ZH[attr_zh], float(coeff))
        if item not in out:
            out.append(item)

    for a, c in P_ATTR_MUL.findall(text):
        add(a, c)
    for c, a in P_MUL_ATTR.findall(text):
        add(a, c)
    for c, a in P_TIMES.findall(text):
        add(a, c)
    return out


#: 酬載分類 —— ⛔ 只有 `damage` 那一類是 owner 這則裁決直接管到的。
PAYLOAD_PAT = (
    ("heal", re.compile(r"回復生命|治療|回復.*生命力")),
    ("shield", re.compile(r"護盾|傷害減免")),
    ("damage", re.compile(r"傷害|威力")),
)


def payload_of(desc: str, attr_zh: str, coeff: float) -> str:
    """這一條宣稱掛在什麼酬載上（看它所在的那一句）。"""
    text = mechanics_text(desc)
    zh = [k for k, v in ATTR_ZH.items() if v == attr_zh]
    for sentence in re.split(r"[。\n]", text):
        if not any(z in sentence for z in zh):
            continue
        if not re.search(rf"[*×]\s*{coeff:g}|{coeff:g}\s*[*×]|{coeff:g}\s*倍", sentence):
            continue
        for name, pat in PAYLOAD_PAT:
            if pat.search(sentence):
                return name
    return "unknown"


# ── 屬性管線（`championStatBase` + `finalizeStat` 的 python 鏡射） ───────────
def stat_base(champ: dict, stat: str, level: int, env: dict | None = None) -> float:
    e = env or ENV
    authored = (champ["baseStats"].get(stat) or 0) + (champ.get("growth", {}).get(stat) or 0) * (max(1, level) - 1)
    src = ATTR_SRC.get(stat)
    attrs = champ.get("attributes")
    if src is None or attrs is None:
        return authored
    attr, key, mode = src
    value = attrs.get(attr, 0) + attrs.get(attr + "Growth", 0) * (max(1, level) - 1)
    factor = e.get(key, 0) or 0
    return authored + factor * value if mode == "add" else authored * (1 + factor * value)


def stat_final(champ: dict, stat: str, level: int, env: dict | None = None) -> float:
    e = env or ENV
    out = stat_base(champ, stat, level, e)
    for link in ENV_CHAIN.get(stat, []):
        out *= e.get(link, 1.0)
    out += BASE_BONUS.get(stat, 0)
    row = PER_LEVEL.get(stat)
    if row and row.get("appliesTo") == "all":
        out += row["amount"] * (max(1, level) - 1)
    cap = STAT_CAPS.get(stat)
    if cap:
        ceiling = cap["base"]
        for link in ENV_CHAIN.get(stat, []):
            ceiling *= e.get(link, 1.0)
        out = min(out, ceiling)
    return out


def attr_value(champ: dict, attr: str, level: int) -> float:
    a = champ.get("attributes") or {}
    return a.get(attr, 0) + a.get(attr + "Growth", 0) * (max(1, level) - 1)


# ── 技能語料 ────────────────────────────────────────────────────────────────
DMG_KINDS = {"damage", "damageArea", "damageLine", "dot"}


def damage_amounts(doc: dict) -> list[tuple[str, dict, float]]:
    """[(kind, amount 物件, 這一發打幾次)]，含 template 那一族。"""
    out: list[tuple[str, dict, float]] = []

    def walk(node, kind=None):
        if isinstance(node, dict):
            k = node.get("kind", kind)
            if k in DMG_KINDS:
                mult = 1.0
                if k == "dot":
                    interval = node.get("intervalSec") or 1.0
                    duration = node.get("durationSec") or 0.0
                    mult = max(1.0, round(duration / interval)) if interval > 0 else 1.0
                for key in ("amount", "amountPerTick"):
                    a = node.get(key)
                    if isinstance(a, dict):
                        out.append((k, a, mult))
            for key, v in node.items():
                if key in ("amount", "amountPerTick"):
                    continue
                walk(v, k)
        elif isinstance(node, list):
            for v in node:
                walk(v, kind)

    walk(doc.get("effects", []))
    params = (doc.get("template") or {}).get("params") or {}
    if isinstance(params.get("damage"), dict):
        out.append(("template", params["damage"], 1.0))
    return out


def resolve(amount: dict, champ: dict, level: int, rank: int) -> float:
    v = amount.get("flat") or 0.0
    per = amount.get("perRank")
    if isinstance(per, list) and per and isinstance(per[0], (int, float)):
        v += per[min(rank, len(per)) - 1]
    for r in amount.get("ratios") or []:
        v += stat_final(champ, r["stat"], level) * r["coeff"]
    for r in amount.get("attrRatios") or []:
        v += attr_value(champ, r["attr"], level) * r["coeff"]
    return v


def load_abilities() -> dict[str, dict]:
    out = {}
    d = os.path.join(ROOT, "content/abilities")
    for name in sorted(os.listdir(d)):
        if not name.endswith(".json") or name.startswith("_"):
            continue
        doc = J("content/abilities/" + name)
        out[doc["id"]] = doc
    return out


SLOTS = ("Q", "W", "E", "R")


def convert_doc(doc: dict, targets: list[dict]) -> dict:
    """回傳這一份技能**換算後**的副本 —— ⛔ 純函式，不寫檔。

    ⭐ 出貨模式是 **replace（取代）**，因為 owner 的原話是「**換成** AP」，而且
       這 58 支今天帶著的 `ap×0.6` / `ad×0.5` 與卡面上的 `力量*3` **毫無關係**
       （對照表就是證據）—— 疊加等於把一個捏造的係數留在正確的係數旁邊。
    ⚠️ `flat` / `perRank` **不動**：卡面的「630 + 力量*1」裡，換算的只有後半。
    ⚠️ `damageType` **不動**：減傷走的是 `damageType`（護甲 vs 魔抗），
       把物理改成魔法是一個 owner 沒有要求的平衡變更。⇒ 物理技能換算後會出現
       「physical 卻吃 ap」，那需要放寬 `abilityScaling.test.ts` 的 fx-16。

    ⛔⛔ **只取 `stacking == "base"` 的那一條，⛔ 不加總。**
    一支技能上的第 2、3 條宣稱幾乎一定是**條件加成**（「點選三刀流持續期間，
    可增加威力(力量*3)」「30級之後可增加(敏捷係數*10)」），⛔ 不是同一發上的
    第二個係數。把它們加起來就是把**互斥的三個世界**疊成一發 ——
    07-03「列、在、前」會從 50% 變成 430%，⚠️ 而每一個零件看起來都是對的
    （＝ 第一·五守則說的那種「組合才是空的」故障，只是方向相反）。
    """
    base = [t for t in targets if t["stacking"] == "base"]
    coeff = base[0]["apCoeff"] if base else 0.0
    out = json.loads(json.dumps(doc))
    amounts = damage_amounts(out)
    if not amounts or coeff <= 0:
        return out
    # 掛在**第一個**傷害酬載上（卡面主傷害那一發）。
    _, amount, _m = amounts[0]
    # ⭐⭐ 這一支**只擁有一格**：那筆「無條件的 ap 主係數」。
    #
    # ⛔⛔ 在此之前它寫的是 `amount["ratios"] = [{...}]` —— **整條取代** ⇒
    #   任何**別人**寫進去的 ratio（帶 `when` 的條件式係數：GH#936 的碎片增幅、
    #   GH#944 的變身增幅）在下一次 `skills:sync` **靜默消失**。
    #   ⚠️ ⭐ 而它連紅都不會 —— 內容變回舊值，守衛才紅，
    #   ⇒ 讀起來像「守衛壞了」，⛔ 不是「內容被吃掉了」（2026-09-02 量到，四條守衛同時紅）。
    #
    # ⭐ 判準（第〇·四守則）：**一個只覆寫其中幾格的正規化器，
    #   ⛔ 不可以丟掉它沒有產生的那幾格。**
    prev = amount.get("ratios") if isinstance(amount.get("ratios"), list) else []
    # ⭐ 帶 `when` 的是**條件式**係數 ⇒ 別人的，留著。
    kept = [r for r in prev if isinstance(r, dict) and r.get("when") is not None]
    # ⭐ 而我這一筆若原本就有非 `stat`/`coeff` 的欄位（將來加的），也一併帶過去。
    mine = next(
        (dict(r) for r in prev
         if isinstance(r, dict) and r.get("stat") == "ap" and r.get("when") is None),
        {},
    )
    mine.update({"stat": "ap", "coeff": round(coeff, 2)})
    amount["ratios"] = [mine, *kept]
    amount.pop("attrRatios", None)
    for _k, a, _mm in amounts[1:]:
        a.pop("attrRatios", None)
    return out


#: ⭐ 2026-08-21 同日落地的**第二層**（`config.ap-damage-scaling@1`，owner：
#  「技能傷害都套用公式 (1+AP*1%)⋯=> 預設 0.5%」）。⛔ 少了它，這份文件量到的
#  技能 DPS 會**低估 2〜2.7 倍** —— 而那正好是「技能追不追得上普攻」這個問題的答案。
#  ⚠️ 它只吃 `scope` 涵蓋的封包（出貨 `ability`），所以普攻那一側不動。
try:
    AP_DMG = J("content/config/ap-damage-scaling.json")
except FileNotFoundError:  # 這一層還沒落地的樹（例如舊 tag）
    AP_DMG = {"rate": 0.0, "scope": "ability"}


def ap_damage_mult(champ: dict, level: int) -> float:
    """技能封包的 AP 乘數 = `1 + 最終法強 × rate`。⛔ 不含普攻（`scope`）。"""
    rate = AP_DMG.get("rate", 0.0) or 0.0
    if rate <= 0 or AP_DMG.get("scope") not in ("ability", "all"):
        return 1.0
    return 1.0 + stat_final(champ, "ap", level) * rate


def hero_skill_dps(champ: dict, abilities: dict, level: int) -> float:
    """Σ over QWER of（滿級傷害 ÷ **實際**冷卻）。

    ⚠️ 實際冷卻 = 卡面 × `combat-env.cooldown`（出貨 0.2）—— ⛔ 卡面秒不是實際秒。
    ⚠️ 冷卻 0 的技能給一個 0.5 秒的節流地板，⛔ 不是除以零。
    """
    total = 0.0
    for slot in SLOTS:
        ref = (champ.get("abilities") or {}).get(slot)
        if not ref:
            continue
        doc = abilities.get(ref.get("id"), ref)
        rank = doc.get("maxRank") or 1
        dmg = sum(resolve(a, champ, level, rank) * m for _, a, m in damage_amounts(doc))
        if dmg <= 0:
            continue
        cds = doc.get("cooldown") or [0]
        cd = max((cds[min(rank, len(cds)) - 1] if cds else 0) * ENV.get("cooldown", 1.0), 0.5)
        total += dmg / cd
    return total * ap_damage_mult(champ, level)


def auto_dps(champ: dict, level: int) -> float:
    """普攻 DPS = 最終 AD × 最終攻速（BAT=1s，⛔ 不含暴擊與裝備）。"""
    return stat_final(champ, "ad", level) * stat_final(champ, "as", level)


# ── 產出 ────────────────────────────────────────────────────────────────────
def build() -> tuple[dict, str, str]:
    gen = generator_owned()
    pop = population()
    shipped = load_abilities()
    #: ⭐ **「換算前」的語料從凍結表重建，⛔ 不是磁碟上的現況。**
    #  `apconv:build` 跑過之後，磁碟上的 `力量*3` 已經變成 `80% [AP]`、`ratios` 也換了
    #  ⇒ 直接讀磁碟的話這份計畫會變成「0 支 / 0 條」，而那看起來跟「本來就沒有」
    #  一模一樣（第二守則失敗形態②：產生器吃掉了自己的輸入）。
    #  ⚠️ 沒有凍結表的技能照樣走磁碟 —— 新加的一支帶著 `力量*N` 會出現在計畫裡，
    #  那正是「該重跑 `pnpm apconv:freeze` 了」的訊號。
    frozen = {}
    frozen_path = os.path.join(ROOT, "tools/ap-conversion/claims.json")
    if os.path.exists(frozen_path):
        with open(frozen_path, encoding="utf-8") as f:
            frozen = json.load(f)
    abilities = {}
    for aid, doc in shipped.items():
        entry = frozen.get(aid)
        if entry is None:
            abilities[aid] = doc
            continue
        pre = json.loads(json.dumps(doc))
        pre["description"] = entry["description"]
        for i, (_k, a, _m) in enumerate(damage_amounts(pre)):
            before = entry["amounts"][i] if i < len(entry["amounts"]) else {}
            for key in ("ratios", "attrRatios"):
                a.pop(key, None)
                if before.get(key) is not None:
                    a[key] = json.loads(json.dumps(before[key]))
        abilities[aid] = pre
    champs = {i: normalize_card(J(f"content/champions/{i}.json")) for i in pop}
    #: ⭐ **全部**的卡（含變身態與下架）—— 語料是 420 支，所以每一支都要找得到主人。
    #: ⛔ 只用母體那 49 張，變身態的技能會算不出 LV30/50/99（＝一整欄「—」）。
    all_champs: dict[str, dict] = {}
    for name in sorted(os.listdir(os.path.join(ROOT, "content/champions"))):
        if name.endswith(".json") and not name.startswith("_"):
            doc = J("content/champions/" + name)
            if doc.get("id"):
                # ⛔ 每一張卡都要過正規化 —— 逐支換算表的 LV30/50/99 欄讀的是它。
                all_champs[doc["id"]] = normalize_card(doc)
    owner_of = {}
    for cid, champ in all_champs.items():
        for slot in SLOTS:
            ref = (champ.get("abilities") or {}).get(slot)
            if ref:
                owner_of[ref["id"]] = cid
        for key in ("passiveAbility", "exAbility"):
            if champ.get(key):
                owner_of[champ[key]] = cid

    rows = []
    for aid, doc in abilities.items():
        cs = claims(doc.get("description", ""))
        if not cs:
            continue
        cid = aid.rpartition(".")[0]
        champ = all_champs.get(owner_of.get(aid, cid))
        current = []
        for _, a, _m in damage_amounts(doc):
            for r in a.get("ratios") or []:
                current.append({"stat": r["stat"], "coeff": r["coeff"]})
            for r in a.get("attrRatios") or []:
                current.append({"stat": "attr:" + r["attr"], "coeff": r["coeff"]})
        dtypes = sorted(set(re.findall(r'"damageType":\s*"(\w+)"', json.dumps(doc, ensure_ascii=False))))
        n_slots = len(damage_amounts(doc))
        for nth, (attr, coeff) in enumerate(cs):
            raw = coeff * AP_PER_ATTR_POINT * 100
            pct = round_pct(raw)
            row = {
                "abilityId": aid,
                "abilityName": doc.get("name", ""),
                "championId": owner_of.get(aid, cid),
                "inPopulation": owner_of.get(aid) is not None,
                "owner": "generator" if cid in gen else "json",
                "generatorFile": f"tools/skill-remake/heroes/{cid}.py" if cid in gen else None,
                "attr": attr,
                "coeff": coeff,
                # ⭐ 第 2 條以後 = **條件加成**（「三刀流期間」「30級之後」），
                #    ⛔ 不是同一發上的第二個係數。stage 2 要逐條掛到自己的
                #    effect / condition 上，⛔ 不可以加總。
                "stacking": "base" if nth == 0 else "conditional",
                "claimIndex": nth,
                "damageSlots": n_slots,
                "payload": payload_of(doc.get("description", ""), attr, coeff),
                "damageTypes": dtypes,
                "rawPct": round(raw, 2),
                "apPct": pct,
                "apCoeff": round(pct / 100, 2),
                "currentRatios": current,
                "currentHasAd": any(r["stat"] == "ad" for r in current),
                "currentHasAp": any(r["stat"] == "ap" for r in current),
                "currentHasNone": not current,
            }
            for lv in LEVELS:
                if champ is None:
                    row[f"attrDamageLv{lv}"] = None
                    row[f"apDamageLv{lv}"] = None
                    row[f"deltaLv{lv}"] = None
                    continue
                old = attr_value(champ, attr, lv) * coeff
                new = stat_final(champ, "ap", lv) * (pct / 100)
                row[f"attrDamageLv{lv}"] = round(old, 1)
                row[f"apDamageLv{lv}"] = round(new, 1)
                row[f"deltaLv{lv}"] = round(new - old, 1)
            rows.append(row)
    rows.sort(key=lambda r: (r["abilityId"], r["attr"], r["coeff"]))

    # ── 全域錨點 ────────────────────────────────────────────────────────────
    anchors = []
    for lv in LEVELS:
        sk = [hero_skill_dps(c, shipped, lv) for c in champs.values()]
        au = [auto_dps(c, lv) for c in champs.values()]
        ratios = [s / a for s, a in zip(sk, au) if a > 0]
        anchors.append({
            "level": lv,
            "medianAp": round(stats.median(stat_final(c, "ap", lv) for c in champs.values()), 1),
            "medianAd": round(stats.median(stat_final(c, "ad", lv) for c in champs.values()), 1),
            "medianAs": round(stats.median(stat_final(c, "as", lv) for c in champs.values()), 3),
            "medianSkillDps": round(stats.median(sk), 1),
            "medianAutoDps": round(stats.median(au), 1),
            "medianRatio": round(stats.median(ratios), 2),
            "meanRatio": round(stats.mean(ratios), 2),
        })

    # ── intToAbilityPower 6.5 → 10 的假想 ──────────────────────────────────
    # ⚠️ 這一段**暫時改寫全域 `ENV`** 再改回來：`resolve()` 一路吃全域的那一份，
    #    而 what-if 的重點正是「同一批技能在另一個 env 下算出什麼」。⛔ 不可以只換
    #    `stat_final` 的 env 參數 —— 那會讓技能傷害仍然停在舊 AP 上（失敗形態④：
    #    斷言方向跟缺陷無關）。
    by_ability: dict[str, list[dict]] = {}
    for r in rows:
        by_ability.setdefault(r["abilityId"], []).append(r)
    #: 「換算後」＝**出貨現況**（`apconv:build` 真的寫出去的那一份），⛔ 不是這裡再算
    #  一次的模擬 —— 模擬只證明「我算得出這個數字」，出貨現況證明「玩家會拿到它」。
    #  ⚠️ 凍結表以外的技能（＝ 還沒換算的新技能）才走 `convert_doc` 的模擬。
    converted = dict(shipped)
    for aid, targets in by_ability.items():
        if aid not in frozen:
            converted[aid] = convert_doc(abilities[aid], targets)

    saved_int_to_ap = ENV["intToAbilityPower"]
    #: ⭐ 兩個候選 = **2026-08-21 之前的出貨值** 與 **現在的出貨值**。
    #  ⚠️ 6.5 是**歷史紀錄**（provenance），⛔ 不是一個住在這裡的平衡數字 ——
    #  它的作用是讓「這個旋鈕到底推得動什麼」有一條可比的基線。
    PREVIOUS_INT_TO_AP = 6.5
    what_if = []
    for k in sorted({PREVIOUS_INT_TO_AP, saved_int_to_ap}):
        for label, corpus in (("換算前", abilities), ("換算後", converted)):
            ENV["intToAbilityPower"] = k
            # ⛔⛔ 換 env 之後**必須重跑正規化** —— `growth.ap` 是從「L99 要打中出身
            #   級距」反解出來的，換一個 `intToAbilityPower` 就是換一個反解結果。
            #   少了這一行，四個象限裡的法強欄會完全不動，而那看起來像「這個旋鈕沒用」
            #   —— 一個由量測方法造出來的假結論（失敗形態④）。
            champs = {i: normalize_card(J(f"content/champions/{i}.json")) for i in pop}
            per_level = {}
            for lv in LEVELS:
                sk = [hero_skill_dps(c, corpus, lv) for c in champs.values()]
                au = [auto_dps(c, lv) for c in champs.values()]
                r = [s / a for s, a in zip(sk, au) if a > 0]
                per_level[lv] = {
                    "medianAp": round(stats.median(stat_final(c, "ap", lv) for c in champs.values()), 1),
                    "medianSkillDps": round(stats.median(sk), 1),
                    "medianAutoDps": round(stats.median(au), 1),
                    "medianRatio": round(stats.median(r), 2),
                    "meanRatio": round(stats.mean(r), 2),
                }
            what_if.append({
                "intToAbilityPower": k,
                "corpus": label,
                "byLevel": per_level,
                # ⭐ 「這個旋鈕被正規化吃掉多少」的直接證據：反解出負成長被夾成 0 的人數。
                "growthApZeroed": sum(1 for c in champs.values() if (c.get("growth") or {}).get("ap", 0) <= 0),
                "population": len(champs),
            })
    ENV["intToAbilityPower"] = saved_int_to_ap
    champs = {i: normalize_card(J(f"content/champions/{i}.json")) for i in pop}

    # ── 爆掉分析：換算後單發總傷害 vs 五級距天花板 / LV30 中位血條 ──────────
    hp30 = stats.median(stat_final(c, "maxHealth", 30) for c in champs.values())
    biggest = DAMAGE_TIERS[max(DAMAGE_TIERS, key=lambda k: DAMAGE_TIERS[k])]
    blowups = []
    for aid, targets in by_ability.items():
        champ = all_champs.get(owner_of.get(aid, aid.rpartition(".")[0]))
        if champ is None:
            continue
        doc, new_doc = abilities[aid], converted[aid]
        rank = doc.get("maxRank") or 1
        before = sum(resolve(a, champ, 30, rank) * m for _, a, m in damage_amounts(doc))
        after = sum(resolve(a, champ, 30, rank) * m for _, a, m in damage_amounts(new_doc))
        if after <= before:
            continue
        blowups.append({
            "abilityId": aid,
            "abilityName": doc.get("name", ""),
            "apPct": next((t["apPct"] for t in targets if t["stacking"] == "base"), 0),
            "conditionalPct": [t["apPct"] for t in targets if t["stacking"] == "conditional"],
            "beforeLv30": round(before, 1),
            "afterLv30": round(after, 1),
            "growth": round(after / before, 2) if before > 0 else None,
            "overBiggestTier": after > biggest,
            "pctOfMedianHp30": round(after / hp30 * 100, 1),
        })
    blowups.sort(key=lambda b: -b["afterLv30"])

    # ── 鏡像對：同一支技能掛兩位英雄，⛔ 兩份都要改 ─────────────────────────
    mirrors: dict[str, list[str]] = {}
    for aid in by_ability:
        mirrors.setdefault(abilities[aid].get("name", aid), []).append(aid)
    mirror_pairs = {k: sorted(v) for k, v in mirrors.items() if len(v) > 1}

    plan = {
        "blowups": blowups,
        "mirrorPairs": mirror_pairs,
        "medianEngineHpLv30": round(hp30, 1),
        "biggestDamageTier": biggest,
        "provenance": {
            "population": "apps/platform/internal/curation/starter.go 的 starterChampions"
                          " − content/config/roster.json 的 retiredChampions"
                          ' − 變身態（英雄卡的 transform.role === "alternate"）',
            "populationSize": len(pop),
            "abilityCorpus": "content/abilities/*.json（全部，含變身態）",
            "abilityCorpusSize": len(abilities),
            "generatorOwnedHeroes": sorted(gen),
        },
        "rule": {
            "apPerAttrPoint": AP_PER_ATTR_POINT,
            "stepPct": STEP_PCT,
            "rounding": ROUNDING,
            "minPct": MIN_PCT,
            "formula": "apPct = max(minPct, roundHalfUp(coeff × apPerAttrPoint × 100 / stepPct) × stepPct)",
        },
        "anchors": anchors,
        "whatIfIntToAp": what_if,
        "rows": rows,
    }
    return plan, render_md(plan), render_csv(rows)


CSV_COLS = [
    "abilityId", "abilityName", "championId", "owner", "generatorFile", "attr", "coeff",
    "payload", "rawPct", "apPct", "apCoeff", "currentHasAd", "currentHasAp", "currentHasNone",
    "attrDamageLv30", "apDamageLv30", "deltaLv30",
    "attrDamageLv50", "apDamageLv50", "deltaLv50",
    "attrDamageLv99", "apDamageLv99", "deltaLv99",
]


def render_csv(rows: list[dict]) -> str:
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=CSV_COLS, extrasaction="ignore", lineterminator="\n")
    w.writeheader()
    for r in rows:
        w.writerow(r)
    return buf.getvalue()


def render_md(plan: dict) -> str:
    p, rule, rows = plan["provenance"], plan["rule"], plan["rows"]
    gen_rows = [r for r in rows if r["owner"] == "generator"]
    json_rows = [r for r in rows if r["owner"] == "json"]
    abilities = sorted({r["abilityId"] for r in rows})
    L: list[str] = []
    A = L.append
    A("# 技能屬性傷害 → AP 百分比 換算計畫（owner 2026-08-21）")
    A("")
    A("> ⚙️ **這一份是產生出來的，⛔ 不要手改。**")
    A(">")
    A("> ```bash")
    A("> pnpm apconv:plan            # 重生成")
    A("> pnpm apconv:plan -- --check # 唯讀：過期就回非零")
    A("> ```")
    A(">")
    A("> owner 2026-08-21（逐字）：")
    A("> 「檢查所有技能 原本有屬性額外傷害的部分**都換成 AP**，"
      "**乘數幾倍屬性 變成 1/4 百分比**，例如**原本 力量*4 => AP *100%** "
      "但取**百分比整數**例如 10/20/30/40/50/60/70/80/90/100/110/120/130/140%…」")
    A("")
    A("---")
    A("")
    A("## ⭐ 換算規則（一條公式，⛔ 沒有逐支手挑）")
    A("")
    A("```")
    A(f"AP 百分比 = max({rule['minPct']}%, 四捨五入到 {rule['stepPct']}% ( 屬性乘數 × {rule['apPerAttrPoint']:.0%} ))")
    A("```")
    A("")
    A("**取整方向 = 四捨五入（half-up，.5 一律進位）。** 三個候選裡選它的理由：")
    A("")
    A("| 方向 | 力量×1 (25%) | 力量×3 (75%) | 力量×5 (125%) | 為什麼不選 |")
    A("|---|---:|---:|---:|---|")
    A("| **四捨五入**（出貨） | **30%** | **80%** | **130%** | — |")
    A("| 就近偶數 | 20% | 80% | 120% | 同樣的「.5」走**兩個方向**，鋸齒 |")
    A("| 無條件進位 | 30% | 80% | 130% | 對整數乘數與四捨五入**逐位元相同**，"
      "但對未來的非整數乘數會系統性灌水（×1.7 → 50% vs 40%） |")
    A("")
    A("⭐ 整數乘數 × 25 永遠落在 25 的倍數上 ⇒ **奇數乘數一律 +5，偶數乘數不動**：")
    A("")
    seen = {}
    for r in rows:
        seen.setdefault(r["coeff"], r["apPct"])
    A("| 屬性乘數 | " + " | ".join(f"×{c:g}" for c in sorted(seen)) + " |")
    A("|---|" + "---:|" * len(seen))
    A("| **AP 百分比** | " + " | ".join(f"**{seen[c]}%**" for c in sorted(seen)) + " |")
    A("")
    A("---")
    A("")
    A("## 母體與語料")
    A("")
    A(f"- 平衡量測母體：**{p['populationSize']} 位**（{p['population']}）")
    A(f"- 技能語料：**{p['abilityCorpusSize']} 支**（{p['abilityCorpus']}）")
    A(f"- 命中「屬性額外傷害」的技能：**{len(abilities)} 支** / **{len(rows)} 條**宣稱")
    A(f"- 產生器擁有：**{len({r['abilityId'] for r in gen_rows})} 支**"
      f"（{len(p['generatorOwnedHeroes'])} 位英雄的 `.py`）；直接編 JSON："
      f"**{len({r['abilityId'] for r in json_rows})} 支**")
    A("")
    A("---")
    A("")
    A("## ⭐ 三個錨點（量到的，⛔ 不是估的）")
    A("")
    A("| 錨點 | 中位 AP | 中位 AD | 中位攻速 | 中位技能 DPS | 中位普攻 DPS | 技能÷普攻（中位） | 技能÷普攻（平均） |")
    A("|---|---:|---:|---:|---:|---:|---:|---:|")
    for a in plan["anchors"]:
        A(f"| **LV{a['level']}** | {a['medianAp']} | {a['medianAd']} | {a['medianAs']} | "
          f"{a['medianSkillDps']} | {a['medianAutoDps']} | **{a['medianRatio']}×** | {a['meanRatio']}× |")
    A("")
    A("> 模型：普攻 DPS = 最終 AD × 最終攻速（BAT 1 秒、⛔ 不含暴擊與裝備）；")
    A("> 技能 DPS = Σ(QWER) 滿級傷害 ÷ **實際**冷卻（＝卡面 × `combat-env.cooldown`）。")
    A("")
    A(f"## ⭐ `intToAbilityPower` {min(x['intToAbilityPower'] for x in plan['whatIfIntToAp'])}"
      f" ↔ {max(x['intToAbilityPower'] for x in plan['whatIfIntToAp'])} × 換算前後（四個象限）")
    A("")
    A("| int→AP | 語料 | 錨點 | 中位法強 | 中位技能 DPS | 中位普攻 DPS | 技能÷普攻（中位） | 技能÷普攻（平均） |")
    A("|---:|---|---|---:|---:|---:|---:|---:|")
    for w in plan["whatIfIntToAp"]:
        for lv in LEVELS:
            b = w["byLevel"][lv]
            A(f"| **{w['intToAbilityPower']}** | {w['corpus']} | LV{lv} | {b['medianAp']} | {b['medianSkillDps']} | "
              f"{b['medianAutoDps']} | **{b['medianRatio']}×** | {b['meanRatio']}× |")
    A("")
    A("⚠️ ⭐ **這張表少了一層就會得到相反的結論** —— `config.ap-damage-scaling@1`"
      f"（技能傷害 **×(1 + 法強 × {AP_DMG.get('rate', 0)})**，owner 2026-08-21 同日落地）"
      "已經算進上面每一格。⛔ 少了它，技能 DPS 會低估 2〜2.7 倍。")
    A("⭐ 它也解釋了 owner 為什麼**當天推翻自己**：16:51「int→AP 6.5 => 10」，"
      "17:19「維持 6.5 => **調整到 4**」—— AP 從**加法項**變成**乘法項**之後，"
      "同一個法強值強得多，這一格的意義從「技能夠不夠強」變成「**前期**有多強」。")
    A("")
    A("### ⭐ LV99 的結構落差 —— 為什麼它需要**乘法**那一層")
    A("")
    a30, a99 = plan["anchors"][0], plan["anchors"][-1]
    auto_growth = a99["medianAutoDps"] / a30["medianAutoDps"]
    skill_growth = a99["medianSkillDps"] / a30["medianSkillDps"]
    A("| 從 LV30 到 LV99 | 成長 | 為什麼 |")
    A("|---|---:|---|")
    A(f"| 普攻 DPS | **{auto_growth:.2f}×** | AD **與**攻速**兩條**都在長，而且是**相乘**的 |")
    A(f"| 技能 DPS | **{skill_growth:.2f}×** | 傷害主體是 `flat`／`perRank`（**與等級無關的常數**），"
      "只有係數那一小塊會長 |")
    A(f"| 中位法強 | {a99['medianAp'] / a30['medianAp']:.2f}× | "
      "`intToAbilityPower × 智慧` 是**常數項**（智慧成長已歸 0），只有 `growth.ap` 在長 |")
    A("")
    w = plan["whatIfIntToAp"]
    q0 = next(x for x in w if x["corpus"] == "換算前" and x["intToAbilityPower"] == min(
        y["intToAbilityPower"] for y in w))
    q1 = next(x for x in w if x["corpus"] == "換算後" and x["intToAbilityPower"] == max(
        y["intToAbilityPower"] for y in w))
    A(f"⚠️ 普攻與技能的成長差是 **{auto_growth / skill_growth:.1f} 倍**，"
      "而 AP 百分比換算與 `intToAbilityPower` **都是加法項** ——"
      f"兩個一起上，LV99 只從 **{q0['byLevel'][99]['medianRatio']}×** 動到 "
      f"**{q1['byLevel'][99]['medianRatio']}×**。")
    A("⭐ 真正把 LV99 拉起來的是**乘法**那一層（`config.ap-damage-scaling@1`）："
      f"法強 {a99['medianAp']} × {AP_DMG.get('rate', 0)} ⇒ 技能傷害 "
      f"**×{1 + a99['medianAp'] * (AP_DMG.get('rate', 0) or 0):.2f}**，"
      f"而普攻**一點都不吃**它（`scope: {AP_DMG.get('scope')}`）。")
    A(f"⇒ 出貨三個錨點：LV30 **{plan['anchors'][0]['medianRatio']}×** · "
      f"LV50 **{plan['anchors'][1]['medianRatio']}×** · "
      f"LV99 **{plan['anchors'][2]['medianRatio']}×**。")
    A("")
    A("### 🔴🔴 而且 `intToAbilityPower` 在 **LV99 完全沒有作用** —— 它被**屬性正規化吃掉了**")
    A("")
    A(f"上表 LV99 那一欄的中位法強，在 int→AP **{q0['intToAbilityPower']}** 與 "
      f"**{q1['intToAbilityPower']}** 之下是**同一個數字**"
      f"（{q0['byLevel'][99]['medianAp']} vs {q1['byLevel'][99]['medianAp']}）。⛔ 那不是巧合：")
    A("")
    A("- `config.stat-normalization@1` 把 `ap` 的**終值**釘在出身級距上，"
      f"而 `referenceLevel` 就是 **{NORM.get('referenceLevel')}**；")
    A("- 於是 `growth.ap` 是**反解**出來的：`intToAbilityPower` 一調高，"
      "L1 的法強就變高，反解出的每級成長就等量變低 ⇒ **L99 逐位元回到同一個目標值**。")
    A(f"- 實測：int→AP 從 {q0['intToAbilityPower']} 調到 {q1['intToAbilityPower']} 之後，"
      f"`growth.ap` 被夾成 **0** 的從 **{q0['growthApZeroed']}/{q0['population']} 位** 變成 "
      f"**{q1['growthApZeroed']}/{q1['population']} 位**"
      "（反解出負數，被 `allowNegativeGrowth: false` 夾住）。")
    A("")
    A("⇒ ⭐ **這個旋鈕真正推得動的是 LV1〜LV50 那一段**（LV30 中位法強 "
      f"{q0['byLevel'][30]['medianAp']} → {q1['byLevel'][30]['medianAp']}，"
      f"LV50 {q0['byLevel'][50]['medianAp']} → {q1['byLevel'][50]['medianAp']}），"
      "而那正好是 owner 說的「60 級以下技能更強」那一段。")
    A("⚠️ 這與 `intToMagicResist` 0.6→0 是**同一個形狀**"
      "（`combat-env.json` 那一段逐字記著：43/57 位的智慧貢獻被正規化整個抵銷）。")
    A("⛔ 要讓 LV99 也動，要動的是**級距表本身**（`bands.ap`），⛔ 不是這個係數 ——"
      " 而那是 owner 的平衡決定。")
    A("")
    A("⭐ 要再動 LV99，動得了的是這三格（⛔ 不是 AP 百分比 —— 它是加法項）：")
    A("")
    A("| 旋鈕 | 住在哪 | 它會做什麼 |")
    A("|---|---|---|")
    A("| **`bands.ap`（法強五級距）** | `content/config/stat-normalization.json` | "
      "⭐ **真正的那一格** —— L99 的法強終值就是這張表，`intToAbilityPower` 只在它下面分配 |")
    A("| `growth.ap`（每級法強成長） | ⚠️ 英雄卡上有，但**註冊時會被正規化蓋掉** | "
      "⛔ 改卡沒有用；它是上面那一格反解出來的結果 |")
    A("| **`ap-damage-scaling.rate`** | `content/config/ap-damage-scaling.json` | "
      "⭐ **唯一的乘法旋鈕** —— 它與等級無關，但它乘的是**法強**，而法強會長 |")
    A("| `per-level-bonus.ap` | `content/config/per-level-bonus.json` | 全域每級 +N 法強（今天是 +1） |")
    A("")
    A("⚠️ ⭐ **這一條不是這則裁決的一部分，是它順帶暴露出來的。**"
      "⛔ 我沒有動這兩格 —— 它們是 owner 的平衡決定，這裡只把量到的數字放上來。")
    A("")
    A("---")
    A("")
    A("## ⭐ `ad` 那一族怎麼辦 —— **⛔ 不換**")
    A("")
    A("owner 只說「**屬性**額外傷害」換 AP。所以先回答：`ad` 是屬性嗎？**不是。**")
    A("")
    A("| 證據 | 內容 |")
    A("|---|---|")
    A("| **引擎自己的表** | `sim/stats/attributes.ts::ATTR_STAT_SOURCE` 只認三個屬性"
      "（str/agi/int）。`ad` 與 `ap` **都在那張表的右邊** —— 兩者同樣是被屬性餵養的"
      "**下游戰鬥屬性**（`ad = baseStats.ad + growth.ad×(等級−1) + strToAttackDamage×力量`） |")
    A("| **owner 的例子** | 「原本 **力量*4** => AP *100%」—— 例子是**屬性點**。"
      "「一點屬性 = 0.25 AP」這個換算率只在屬性點與 AP 之間有意義，`ad` 沒有這個對應 |")
    A("| **出貨守衛** | `abilityScaling.test.ts` 的 **fx-16**："
      "`damageType === \"physical\"` ⇒ 係數的 stat **必須是 `ad`**。"
      "把物理技能的 AD 成長整批換成 AP，那條測試會紅，而它邀請的「修法」正是刪掉這個模型 |")
    A("")
    A("⇒ **`ad` 成長本身一條都不動。** 會被這次換算碰到的 `ad`，"
      "只有那些**卡面寫著 `力量*N` 而 JSON 卻捏了一個 `ad×0.5`** 的技能 ——")
    A("那不是「AD 成長」，那是**第一·五守則的空宣稱**（卡片說 A，引擎做 B）。")
    A("")
    A("---")
    A("")
    A("## ⚠️ 換算後會不會爆掉")
    A("")
    A(f"對照兩條線：**五級距最大格 = {plan['biggestDamageTier']:,}**、"
      f"**LV30 中位引擎最終血量 = {plan['medianEngineHpLv30']:,.0f}**。")
    A("")
    over = [b for b in plan["blowups"] if b["overBiggestTier"]]
    A(f"- 換算後單發總傷害**超過五級距最大格**的：**{len(over)} 支**")
    A(f"- 其中一發打掉 LV30 中位血條 **≥50%** 的：**{len([b for b in plan['blowups'] if b['pctOfMedianHp30'] >= 50])} 支**")
    A("")
    A("| 技能 | 名稱 | 基礎 AP% | 條件加成 | LV30 換算前 | LV30 換算後 | 倍率 | 佔 LV30 中位血條 |")
    A("|---|---|---:|---|---:|---:|---:|---:|")
    for b in plan["blowups"][:20]:
        flag = " 🔴" if b["overBiggestTier"] else ""
        cond = "＋" + "／".join(f"{p}%" for p in b["conditionalPct"]) if b["conditionalPct"] else "—"
        A(f"| `{b['abilityId']}` | {b['abilityName']} | {b['apPct']}% | {cond} | {b['beforeLv30']:,.0f} | "
          f"**{b['afterLv30']:,.0f}**{flag} | {b['growth']}× | {b['pctOfMedianHp30']}% |")
    A("")
    A("⚠️ **「條件加成」那一欄沒有算進換算後的數字** —— 它們是互斥的世界"
      "（「點選三刀流持續期間」「30 級之後」），⛔ 不是同一發上的第二個係數。")
    A("")
    A("> 🔴 = 單發已經超過五級距最大格。⛔ **這不代表要把係數調小** ——")
    A("> owner 2026-08-21 已經裁決「技能必須打得贏普攻」，而且明說"
      "「還有**魔抗、生命倍率**可以平衡」。⇒ 這一欄是**給他看的清單**，"
      "不是自動夾限的理由。")
    A("")
    A("---")
    A("")
    A("## ⚠️ 鏡像對 —— 同一支技能掛兩位英雄，⛔ 兩份都要改")
    A("")
    A("同編號技能掛兩位英雄＝**兩份獨立 JSON**。只改一邊，"
      "`abilityMirror` 那一類守衛會判「兩份副本互相矛盾」。")
    A("")
    A("| 技能名 | 兩份 |")
    A("|---|---|")
    for name, ids in sorted(plan["mirrorPairs"].items()):
        A(f"| {name} | " + " · ".join(f"`{i}`" for i in ids) + " |")
    A("")
    A("---")
    A("")
    A("## 🔧 stage 2 執行規格（⛔ 這一輪唯讀，還沒動 `content/`）")
    A("")
    A("### ① 誰改哪一份")
    A("")
    gen_ids = sorted({r["abilityId"] for r in gen_rows})
    A(f"- **產生器擁有（改 `.py`，⛔ 不可以改 JSON）：{len(gen_ids)} 支**")
    for aid in gen_ids:
        f = next(r["generatorFile"] for r in gen_rows if r["abilityId"] == aid)
        A(f"  - `{aid}` → `{f}`")
    A(f"- **直接編 JSON：{len({r['abilityId'] for r in json_rows})} 支**（其餘全部）")
    A("")
    A("⚠️ ⛔ **直接改那 90 份產生器 JSON 會在下一次 `pnpm skills:sync` 靜默消失**"
      "（GH#319），而 `skillRemakeJsonFresh.test.ts` 會先紅。")
    A("⭐ 上面兩支的**變身態鏡像**（`godie-e010.q` / `godie-e00x.e`）**不是**產生器擁有的 ——")
    A("同一支技能因此要走**兩條不同的路**：本體改 `.py`，變身態改 JSON。")
    A("")
    A("### ② npm script（⭐ owner：「全部都要用 script 推導生成 JSON」）")
    A("")
    A("```jsonc")
    A('  "apconv:plan":       "python3 tools/ap-conversion/gen.py",           // ✅ 已接上')
    A('  "apconv:plan:check": "python3 tools/ap-conversion/gen.py --check",   // ✅ 已接上')
    A('  "apconv:build":      "python3 tools/ap-conversion/apply.py",         // ⏳ stage 2')
    A('  "apconv:check":      "python3 tools/ap-conversion/apply.py --check"  // ⏳ stage 2')
    A("```")
    A("")
    A("接進**兩個**聚合指令（⚠️ 兩個都要，否則 `skillsSyncCoversGenerators` 看不到）：")
    A("")
    A("| script | `skills:sync` 的位置 | `skills:check` | 為什麼是這個位置 |")
    A("|---|---|---|---|")
    A("| `apconv:plan` ✅ | `statcaps:build` **之後**、`content:build` **之前** | "
      "`apconv:plan:check` ✅ | 它讀 `damage-tiers` / `stat-caps`，"
      "所以要等那兩支寫完；⛔ 它只寫 `docs/`，不碰 `content/` |")
    A("| `apconv:build` ⏳ | `skillremake:json` **之後**、`tiers:apply` **之前** | "
      "`apconv:check` ⏳ | 產生器先把 90 份重生成，換算才蓋得到它們；"
      "級距要看到**換算後**的數字，所以它必須排在 `tiers:apply` 前面 |")
    A("")
    A("⚠️ **`pnpm skills:sync` 會寫 `bundle.json`，同一時間只能有一條工作流跑它。**")
    A("")
    A("### ③ 六個決策點 = 六格後台開關（⛔ 我沒有替 owner 挑，但**預設值是我的建議**）")
    A("")
    A("新檔 `content/config/ap-conversion.json`（`config.ap-conversion@1`）＋ Zod `DEFAULT_*`"
      " ＋ admin `SHIPPED_*`（**三個住處，缺一個 drift 測試就紅**）：")
    A("")
    A("| 欄位 | 出貨預設 | 其他值 | 一鍵 rollback 的意思 |")
    A("|---|---|---|---|")
    A("| `apPerAttrPoint` | **0.25** | 任意 | owner 的「1/4」。改它 = 整批重算 |")
    A("| `stepPct` | **10** | 5 / 25 | 百分比粒度 |")
    A("| `rounding` | **`halfUp`** | `ceil` / `nearestEven` | 取整方向 |")
    A("| `mode` | **`replace`** | `add` | `replace` = 換掉那條捏造的係數（owner 說「換成」）；"
      "`add` = 疊在上面 |")
    A("| `physical` | **`keepDamageType`** | `retypeToMagic` / `skip` | "
      "`keepDamageType` = 物理技能保持物理、只把成長換成 AP（⛔ 不動減傷）；"
      "`skip` = 物理技能整批不換（＝ 最保守的 rollback） |")
    A("| `enabled` | **`true`** | `false` | 整批關掉，回到今天的行為 |")
    A("")
    A("⚠️ **`physical: keepDamageType` 會讓 fx-16 紅**"
      "（`abilityScaling.test.ts`：physical ⇒ 係數必須是 `ad`）。")
    A("⭐ 正解是**放寬那一條規則**，⛔ 不是改 `damageType`：減傷走 `damageType`"
      "（護甲 vs 魔抗），改它是一個 owner 沒有要求的平衡變更。")
    A("放寬的方式＝ fx-16 從 `content/config/ap-conversion.json` 讀這份名單"
      "（**推導**，⛔ 不是在測試裡寫一張豁免表）。")
    A("")
    A("### ④ 卡面說明怎麼跟著動")
    A("")
    A("⛔ **不可以寫死機制數字**（`abilityProse.test.ts` 會紅）—— 說明用佔位符。")
    A("⇒ `力量*3` 這種字樣要被換成「造成 `{{dmg}}` + **80% 法強**的傷害」這種寫法，")
    A("而那個 80% 必須由**同一支 script** 從換算表填進去，⛔ 不是手打。")
    A("")
    A("---")
    A("")
    A("## 逐支換算表")
    A("")
    A("> `基礎/條件` —— **條件**那幾條是「三刀流期間」「30 級之後」這種**互斥的加成**，")
    A("> stage 2 要各自掛到自己的 effect / 條件葉上，⛔ **不可以加總**。")
    A("> `傷害槽` = 這支技能有幾個傷害酬載（stage 2 的 join 目標數）。")
    A("")
    A("| 技能 | 名稱 | 歸誰 | 現在吃什麼 | 宣稱 | 基礎/條件 | 傷害槽 | 換算 | LV30 | LV50 | LV99 |")
    A("|---|---|---|---|---|---|---:|---:|---:|---:|---:|")
    for r in rows:
        cur = "、".join(f"{c['stat']}×{c['coeff']:g}" for c in r["currentRatios"]) or "⛔ 無"
        own = "**產生器**" if r["owner"] == "generator" else "JSON"
        stack = "基礎" if r["stacking"] == "base" else "**條件**"
        d30, d50, d99 = r["deltaLv30"], r["deltaLv50"], r["deltaLv99"]
        fmt = lambda o, n, d: ("—" if d is None else f"{o:g}→{n:g} ({d:+g})")
        pay = "" if r["payload"] == "damage" else f" ⚠️{r['payload']}"
        A(f"| `{r['abilityId']}` | {r['abilityName']}{pay} | {own} | {cur} | "
          f"{r['attr']}×{r['coeff']:g} | {stack} | {r['damageSlots']} | **{r['apPct']}%** | "
          f"{fmt(r['attrDamageLv30'], r['apDamageLv30'], d30)} | "
          f"{fmt(r['attrDamageLv50'], r['apDamageLv50'], d50)} | "
          f"{fmt(r['attrDamageLv99'], r['apDamageLv99'], d99)} |")
    A("")
    A("⚠️ **`attrDamage` 那一欄在 LV30/50/99 完全不動**（例：`godie-e00s.q` 是 51 / 51 / 51）")
    A("—— 那就是 owner 說的「三圍成長已歸 0」：**今天的屬性傷害對等級零反應**。")
    A("⭐ 換成 AP 之後它才會隨等級長（51 → 170.5 / 198.5 / 266.9）。"
      "**這是這次換算最大的實質收穫，⛔ 不只是換一個欄位名。**")
    A("")
    return "\n".join(L) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="唯讀：產物過期就回非零")
    args = ap.parse_args()
    plan, md, csv_text = build()
    payload = {
        OUT_MD: md,
        OUT_JSON: json.dumps(plan, ensure_ascii=False, indent=2) + "\n",
        OUT_CSV: csv_text,
    }
    stale = []
    for rel, text in payload.items():
        path = os.path.join(ROOT, rel)
        old = open(path, encoding="utf-8").read() if os.path.exists(path) else None
        if old != text:
            stale.append(rel)
        if not args.check:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8") as f:
                f.write(text)
    n_rows = len(plan["rows"])
    n_ab = len({r["abilityId"] for r in plan["rows"]})
    if args.check:
        if stale:
            print("⛔ 過期：" + "、".join(stale) + "\n→ 跑 `pnpm apconv:plan` 然後 git add", file=sys.stderr)
            return 1
        print(f"✅ AP 換算計畫是最新的（{n_ab} 支 / {n_rows} 條）")
        return 0
    print(f"AP 換算計畫：{n_ab} 支技能 / {n_rows} 條屬性宣稱 → {OUT_MD}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
