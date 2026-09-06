#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""⭐【owner 2026-08-21】屬性額外傷害 → AP 百分比的**落地器**（stage 2）。

owner 2026-08-21（逐字）：

> 「檢查所有技能 原本有屬性額外傷害的部分**都換成 AP**，
>  **乘數幾倍屬性 變成 1/4 百分比**，例如**原本 力量*4 => AP *100%**
>  但取**百分比整數**例如 10/20/30/40/50/60/70/80/90/100/110/120/130/140%…」

> 「請記得**全部都要用 script 推導生成 JSON** 喔」

```bash
pnpm apconv:build     # 把換算寫進 content/abilities/*.json
pnpm apconv:check     # 唯讀，逐位元組比對；過期或被手改就非零離開
pnpm apconv:freeze    # ⛔ 一次性：從**換算前**的卡面凍結輸入表（見下）
```

⚠️ 計畫與逐支對照表是**另一支**（`pnpm apconv:plan`，只讀不寫）。這一支只做事。

── ⭐ 為什麼需要一張「凍結輸入表」（⛔ 不是多此一舉）─────────────────────────
這支產生器的**輸入**是卡面上的 `力量*3`，而它的**輸出**把那串字換成 `80% [AP]`
—— ⇒ 跑完一次之後，輸入就**不存在了**，`--check` 沒有東西可以重算。
（同一個形狀：一支會吃掉自己來源的產生器，第二次跑就變成 no-op，而 no-op 看起來
 跟「一切正常」一模一樣 —— 第二守則的失敗形態②。）

⇒ `tools/ap-conversion/claims.json` 是**換算前**那一刻的快照：
每一支的原始 `description`、抽出來的屬性宣稱、以及每一格傷害酬載**原本**的
`ratios` / `attrRatios`。它進版控，之後每一次 build／check 都從它重算。

⭐ 附帶好處：`enabled: false` 是一個**真的 rollback** —— 從快照把原文與原係數
寫回去，⛔ 不是「這次不做」。

── 誰改哪一份 ────────────────────────────────────────────────────────────
`content/abilities/` 有 90 份是 `tools/skill-remake/heroes/*.py` 產生的。
⛔ 直接改那 90 份的 JSON 會在下一次 `pnpm skills:sync` 靜默消失。
⇒ 產生器擁有的那幾支，這支**只驗不寫**（`.py` 沒跟上就紅並指名那個檔）。

── 換算開關 ──────────────────────────────────────────────────────────────
`tools/ap-conversion/knobs.json`。⚠️ 它**刻意不住在 `content/config/`**：
這幾格是**建置期**輸入（改了要重跑這支才生效），做成後台的即時開關就是
第一·五守則說的那種「說了但不會發生」——後台存得下去、卡面照樣印、場上零反應。
⇒ 改法是**改這個檔 + 跑 `pnpm apconv:build`**，rollback 同一條路。
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen  # noqa: E402  —— 抽取器、取整規則、換算函式全部共用同一份

ROOT = gen.ROOT
KNOBS_PATH = "tools/ap-conversion/knobs.json"
CLAIMS_PATH = "tools/ap-conversion/claims.json"
EXEMPTIONS_PATH = "tools/ap-conversion/exemptions.json"
MANIFEST_PATH = "docs/_data/ap-conversion-applied.json"

#: 稽核掃哪幾個集合。⛔ `_legacy/` 不進來（那是退休區），⛔ `config/` 不進來
#: （那裡提到 `attrRatios` 的是**規則的散文**，不是內容宣稱）。
AUDIT_DIRS = (
    "content/abilities",
    "content/champions",
    "content/items",
    "content/augments",
    "content/ability-templates",
)

#: ⭐ 卡面上「這一項是法強百分比」的**唯一**寫法。出貨內容早就在用
#: （77-02 雷鳴劍「10% [AP]傷害」、77-01「50% [AD]」），⛔ 不要另發明一種。
AP_TAG = "[AP]"
#: `abilityScaling.test.ts` 的 fx-16 與這一支讀**同一個**字樣。⛔ 不要抄第二份正則。
# ⭐ 2026-09-06：prose:build 把卡面的「600% [AP]」換成「{{ap}}% [AP]」（owner「接上公式顯示」）—— 佔位符也是宣稱
#    （與 packages/shared/src/content/abilityScaling.test.ts 的 AP_CLAIM_RE 同一個字樣）。
AP_CLAIM_RE = re.compile(r"(?:[0-9]+(?:\.[0-9]+)?|\{\{ap[0-9]*\}\})%\s*\[AP\]")


def rel(p: str) -> str:
    return os.path.join(ROOT, p)


def load_knobs() -> dict:
    with open(rel(KNOBS_PATH), encoding="utf-8") as f:
        k = json.load(f)
    for key in ("apPerAttrPoint", "stepPct", "rounding", "minPct", "mode", "physical", "enabled"):
        if key not in k:
            raise SystemExit(f"knobs.json 少了 `{key}` —— ⛔ 不要幫它猜一個預設值")
    return k


def pct_for(coeff: float, k: dict) -> int:
    """屬性乘數 → AP 百分比。⭐ 與 `gen.round_pct` 是**同一個**函式，⛔ 不抄第二份。"""
    saved = gen.MIN_PCT
    gen.MIN_PCT = k["minPct"]
    try:
        return gen.round_pct(coeff * k["apPerAttrPoint"] * 100, k["rounding"], k["stepPct"])
    finally:
        gen.MIN_PCT = saved


# ── 卡面說明的改寫 ──────────────────────────────────────────────────────────
def _spans(text: str) -> list[tuple[int, int, str, float]]:
    """一段**非台詞**文字裡所有的屬性宣稱 → [(start, end, attr, coeff)]，去重疊、依位置。"""
    hits: list[tuple[int, int, str, float]] = []
    for pat, order in ((gen.P_ATTR_MUL, "ac"), (gen.P_MUL_ATTR, "ca"), (gen.P_TIMES, "ca")):
        for m in pat.finditer(text):
            a, c = (m.group(1), m.group(2)) if order == "ac" else (m.group(2), m.group(1))
            hits.append((m.start(), m.end(), gen.ATTR_ZH[a], float(c)))
    hits.sort(key=lambda h: (h[0], -(h[1] - h[0])))
    out: list[tuple[int, int, str, float]] = []
    for h in hits:
        if out and h[0] < out[-1][1]:
            continue  # 重疊 ⇒ 保留較長／較早的那一個
        out.append(h)
    return out


def _replacement(matched: str, pct: int) -> str:
    """把 `(敏捷*5` 換成 `(130% [AP]`、`[力量]*3` 換成 `80% [AP]`。

    ⭐ 判準只有一條：**開頭那個括號有沒有在這一段裡被關掉**。
      · `(敏捷*5`  —— `)` 在後面（`(敏捷*5)`）⇒ 那個 `(` 是**外面那一層**，保留。
      · `[力量]*3` —— `]` 就在裡面 ⇒ 那個 `[` 是**標記本身**的括號，一起換掉。
    ⛔ 不要用「開頭是不是括號」判斷，那會把 `[力量]*3` 變成 `[80% [AP]`。
    """
    pairs = {"[": "]", "（": "）", "(": ")"}
    head = ""
    if matched[:1] in pairs and pairs[matched[:1]] not in matched:
        head = matched[:1]
        matched = matched[1:]
    # ⚠️ 抽取器的 `\s*` 會把宣稱前面那個空白一起吃掉（25-002「百烈拳 力量傷害*6」）
    #    —— 不還回去的話卡面會變成「百烈拳150% [AP]」，兩個詞黏在一起。
    lead = matched[: len(matched) - len(matched.lstrip())]
    return f"{head}{lead}{pct}% {AP_TAG}"


_CLAIM_OR_PH = re.compile(r"(?:[0-9]+(?:\.[0-9]+)?|\{\{ap[0-9]*\}\})%\s*\[AP\]")

def _same_modulo_placeholders(rewritten: str, current: str) -> bool:
    """現況與換算後的說明是不是**同一句話**：非宣稱的字逐字相同，而每一個 `N% [AP]` 在現況裡
    要嘛是同一個 N、要嘛是 prose:build 換上的佔位符 `{{ap}}`／`{{apk}}`（載入時印出係數）。
    ⚠️ 逐處判，⛔ 不是「全部都得是佔位符」—— 一張卡面可以第 1 處已綁佔位符、第 2 處還是對不上的字面值
    （09-04 龜派氣功：50% 綁上了、80% 對不到任何一條 ratio），兩個正規化器不可以為了它互相打回去。"""
    a = _CLAIM_OR_PH.split(rewritten)
    b = _CLAIM_OR_PH.split(current)
    if a != b:
        return False
    ca = _CLAIM_OR_PH.findall(rewritten)
    cb = _CLAIM_OR_PH.findall(current)
    if len(ca) != len(cb):
        return False
    for x, y in zip(ca, cb):
        if x != y and not y.startswith("{{"):
            return False
    return True

def rewrite_description(desc: str, k: dict) -> str:
    """把說明裡每一條屬性宣稱換成 AP 百分比。⛔ `「…」`（角色對白）一個字都不動。"""
    out: list[str] = []
    for chunk in re.split(r"(「[^」]*」)", desc or "", flags=re.S):
        if chunk.startswith("「"):
            out.append(chunk)
            continue
        spans = _spans(chunk)
        for start, end, _attr, coeff in reversed(spans):
            chunk = chunk[:start] + _replacement(chunk[start:end], pct_for(coeff, k)) + chunk[end:]
        out.append(chunk)
    return "".join(out)


# ── 技能 JSON 的改寫 ────────────────────────────────────────────────────────
def apply_doc(doc: dict, entry: dict, k: dict) -> dict:
    """回傳這一份技能換算後的副本。⛔ 純函式。

    ⭐ 出貨模式 `replace`：owner 的原話是「**換成** AP」，而且這 58 支今天帶著的
      `ap×0.6` / `ad×0.5` 與卡面上的 `力量*3` **毫無關係**（`apconv:plan` 的對照表
      就是證據）—— 疊加等於把一個捏造的係數留在正確的係數旁邊。
    ⚠️ `flat` / `perRank` **不動**：卡面「630 + 力量*1」換算的只有後半。
    ⚠️ `damageType` **不動**（`physical: keepDamageType`）：減傷走 `damageType`
      （護甲 vs 魔抗），改它是一個 owner 沒有要求的平衡變更。
    ⛔⛔ **只有第 1 條（`base`）進係數，⛔ 不加總。** 第 2 條以後是**互斥的條件加成**
      （「三刀流期間」「30 級之後」）—— 加起來會讓 07-03「列、在、前」從 50% 變 430%，
      而每一個零件看起來都是對的。
    """
    out = json.loads(json.dumps(doc))
    amounts = gen.damage_amounts(out)

    # ⭐⭐ **先回到換算前，再換算** —— 這一步是 `--check` 能存在的唯一理由。
    #
    # ⚠️ 這支產生器會**吃掉自己的輸入**：卡面的 `力量*3` 被換成 `80% [AP]` 之後
    #   就不存在了，磁碟上的 `ratios` 也已經被上一次 build 改過。⇒ 若直接拿磁碟
    #   現況當輸入，第二次跑就是 no-op —— 而 no-op 看起來跟「一切正常」一模一樣
    #   （第二守則失敗形態②），`--check` 會對**任何**手改都保持綠燈。
    # ⇒ 每一次都從 `claims.json` 的快照把說明與係數**倒回換算前**，再重算一次。
    #   於是 build 冪等、check 真的在比對、而 `enabled: false` 就是把這一步做完
    #   然後停手 ⇒ 一個指令回到 2026-08-21 之前，⛔ 不是「這次不做」。
    out["description"] = entry["description"]
    for i, (_kind, amount, _m) in enumerate(amounts):
        before = entry["amounts"][i] if i < len(entry["amounts"]) else {}
        # ⭐⭐ 倒回之前先把**帶條件的 ratio** 撈出來 —— ⛔ 它們不屬於這條換算鏈。
        #
        # ⛔⛔ 在此之前這個迴圈把 `ratios` **整條**倒回 `claims.json` 的換算前快照，
        #   ⇒ 任何**別人**寫進去的條件式係數（帶 `when` 的：GH#936 的碎片增幅、
        #     GH#944 的變身增幅）在下一次 `skills:sync` **靜默消失**。
        #   ⚠️ ⭐ 2026-09-02 量到的代價：四條剛寫好的守衛在 sync 之後同時紅，
        #     而它讀起來像「守衛壞了」，⛔ 不是「內容被吃掉了」。
        #
        # ⭐ 為什麼是「保留」而不是「把它們也寫進 claims.json」：
        #   後者會讓同一個事實有**第二個住處**（第〇·四守則）——
        #   而 `claims.json` 的語意是「**w3x 原文的宣稱**」，
        #   ⛔ 一條 GGD 自己設計的條件式增幅不屬於那裡。
        #
        # ⚠️ ⭐ 冪等仍然成立：保留的是**輸入本來就有**的那幾筆，
        #   第二次跑會保留同樣的幾筆 ⇒ `--check` 照樣在比對真的東西。
        conditional = {
            key: [
                r for r in (amount.get(key) or [])
                if isinstance(r, dict) and r.get("when") is not None
            ]
            for key in ("ratios", "attrRatios")
        }
        for key in ("ratios", "attrRatios"):
            amount.pop(key, None)
            if before.get(key) is not None:
                amount[key] = json.loads(json.dumps(before[key]))
            if conditional[key]:
                amount[key] = (amount.get(key) or []) + conditional[key]

    if not k["enabled"]:
        return out

    _rewritten = rewrite_description(entry["description"], k)

    # ⭐ 2026-09-06：prose:build 已把卡面的「80% [AP]」換成佔位符「{{ap}}% [AP]」（owner「接上公式顯示」）。

    #    佔位符與算出來的百分比是**同一句話**（載入時由 config.ap-coefficient@1 印出係數）⇒ 現況若只差在

    #    「第 k 個 N% [AP]」對「{{ap}}／{{apk}}」，就保留現況，⛔ 不把佔位符打回字面值。

    _cur = doc.get("description")

    if isinstance(_cur, str) and _same_modulo_placeholders(_rewritten, _cur):

        out["description"] = _cur

    else:

        out["description"] = _rewritten

    base = [c for c in entry["claims"] if c["stacking"] == "base"]
    if not base or not amounts:
        return out
    coeff = round(pct_for(base[0]["coeff"], k) / 100, 2)
    if coeff <= 0:
        return out

    # ⭐ 掛在哪一格：**優先掛在「那一格本來就只是屬性項」的酬載上**（01-04 超究武神
    #   霸斬就是這個形狀 —— 第 1 格是 630 的七連斬、第 2 格是一個純 `attrRatios`
    #   的 `力量*1`）。⛔ 一律掛第 0 格的話，第 2 格被拔掉 `attrRatios` 之後會變成
    #   一個 `amountPerTick: {}` 的**空效果**：它還在效果樹上、還會結算、還會發特效，
    #   而傷害是 0 —— 第一·五守則說的那種「每個零件都對、組合是空的」。
    index = next(
        (
            i
            for i, (_k, a, _m) in enumerate(amounts)
            if a.get("attrRatios") and not a.get("flat") and not a.get("perRank") and not a.get("ratios")
        ),
        0,
    )
    _kind, amount, _m = amounts[index]
    is_physical = _damage_type_of(out, index) == "physical"
    if is_physical and k["physical"] == "skip":
        return out  # 最保守的 rollback：物理技能整批不換
    if is_physical and k["physical"] == "retypeToMagic":
        _retype(out, index)

    ratio = {"stat": "ap", "coeff": coeff}
    # ⭐⭐ 這一支**只擁有一格**：那筆「**無條件**的 ap 主係數」。
    #
    # ⛔⛔ 在此之前 `mode="replace"`（＝出貨值）寫的是 `amount["ratios"] = [ratio]`
    #   —— **整條取代** ⇒ 任何**別人**寫進去的條件式 ratio（帶 `when` 的：
    #   GH#936 的碎片增幅、GH#944 的變身增幅）在下一次 `skills:sync` **靜默消失**。
    #   ⚠️ ⭐ 而 `mode="add"` 那一條也一樣漏：它的 `kept` 只留 `stat != "ap"`
    #   ⇒ 一筆**帶條件的 ap** ratio 照樣被當成「我的」丟掉。
    #
    # ⭐ 2026-09-02 量到的代價：四條剛寫好的守衛在 `skills:sync` 之後同時紅，
    #   ⚠️ 而它讀起來像「守衛壞了」，⛔ 不是「內容被吃掉了」——
    #   ⭐ 那正是 CLAUDE.md 的「改產物等於沒改」，只是**方向相反**：
    #     這一次改的是**手編檔**，而一支正規化器把它吃了。
    #
    # ⭐ 判準（第〇·四守則）：**一個只覆寫其中幾格的正規化器，
    #   ⛔ 不可以丟掉它沒有產生的那幾格。**
    conditional = [
        r for r in (amount.get("ratios") or [])
        if isinstance(r, dict) and r.get("when") is not None
    ]
    if k["mode"] == "add":
        kept = [
            r for r in (amount.get("ratios") or [])
            if r.get("stat") != "ap" and r.get("when") is None
        ]
        amount["ratios"] = kept + [ratio] + conditional
    else:
        amount["ratios"] = [ratio] + conditional
    amount.pop("attrRatios", None)
    # ⚠️ 其餘酬載上的 `attrRatios` 也要走 —— 它們是同一條被取代的宣稱的一部分。
    for i, (_k2, a, _m2) in enumerate(amounts):
        if i == index:
            continue
        a.pop("attrRatios", None)
    # ⛔ 後置條件：換算不可以留下一個**空的** amount（＝一個會結算、會發特效、
    #   傷害是 0 的效果）。fail-loud，⛔ 不靜靜寫出去。
    for i, (_k3, a, _m3) in enumerate(gen.damage_amounts(out)):
        if not a:
            raise SystemExit(
                f"{out.get('id')} 第 {i} 格酬載換算後是空的 —— 掛點挑錯了。"
                "⛔ 不要手改那份 JSON，去修 apply.py 的 `index` 規則。"
            )
    return out


def _damage_type_of(doc: dict, index: int) -> str | None:
    """第 `index` 格傷害酬載所屬效果的 `damageType`。⛔ 不掃整份字串（那會抓到別的效果）。"""
    found: list[str | None] = []

    def walk(node, dtype=None):
        if isinstance(node, dict):
            d = node.get("damageType", dtype)
            if node.get("kind") in gen.DMG_KINDS:
                for key in ("amount", "amountPerTick"):
                    if isinstance(node.get(key), dict):
                        found.append(d)
            for key, v in node.items():
                if key in ("amount", "amountPerTick"):
                    continue
                walk(v, d)
        elif isinstance(node, list):
            for v in node:
                walk(v, dtype)

    walk(doc.get("effects", []))
    return found[index] if index < len(found) else None


def _retype(doc: dict, index: int) -> None:
    """把第 `index` 格傷害酬載所屬效果的 `damageType` 改成 magic（`physical: retypeToMagic`）。"""
    seen = [0]

    def walk(node):
        if isinstance(node, dict):
            if node.get("kind") in gen.DMG_KINDS:
                for key in ("amount", "amountPerTick"):
                    if isinstance(node.get(key), dict):
                        if seen[0] == index and "damageType" in node:
                            node["damageType"] = "magic"
                        seen[0] += 1
            for key, v in node.items():
                if key in ("amount", "amountPerTick"):
                    continue
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(doc.get("effects", []))


# ── 凍結（一次性） ──────────────────────────────────────────────────────────
def freeze() -> None:
    """從**換算前**的內容樹凍結輸入表。⛔ 換算之後再跑會凍出一張空表。"""
    abilities = gen.load_abilities()
    table: dict[str, dict] = {}
    for aid, doc in sorted(abilities.items()):
        cs = gen.claims(doc.get("description", ""))
        if not cs:
            continue
        amounts = []
        for _kind, a, _m in gen.damage_amounts(doc):
            amounts.append({
                "ratios": a.get("ratios"),
                "attrRatios": a.get("attrRatios"),
            })
        table[aid] = {
            "description": doc.get("description", ""),
            "claims": [
                {"attr": attr, "coeff": coeff, "stacking": "base" if i == 0 else "conditional"}
                for i, (attr, coeff) in enumerate(cs)
            ],
            "amounts": amounts,
        }
    if len(table) < 20:
        raise SystemExit(
            f"只凍到 {len(table)} 支 —— 內容樹看起來已經換算過了。"
            "⛔ 這是一次性動作，⛔ 不要在換算之後重跑（那會把輸入表清空）。"
        )
    with open(rel(CLAIMS_PATH), "w", encoding="utf-8") as f:
        json.dump(table, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write("\n")
    print(f"[apconv] 凍結 {len(table)} 支 → {CLAIMS_PATH}")


# ── 稽核：⛔ 出貨內容不可以再出現「未換算的屬性額外傷害」 ────────────────────
#
# ⚠️ 為什麼這一條**不是** `--check` 的逐位元組比對就夠了：`--check` 只看得見
#   `claims.json` 收進來的那 58 支。而 owner 的裁決是「**所有**技能」——
#   一支沒進凍結表的技能，`--check` 對它是**永遠綠的**（它根本不在迴圈裡）。
#   ⇒ 逐位元組比對驗的是「這 58 支有沒有被手改」，這一支驗的是「**還有誰沒被看過**」。
#   兩個名詞的關係，⛔ 不是單一名詞（部署後置條件那一課）。
def _iter_docs():
    """(檔案相對路徑, 文件 id, 文件本體) —— 含 champion 卡裡的內嵌技能鏡射。"""
    for d in AUDIT_DIRS:
        base = rel(d)
        if not os.path.isdir(base):
            continue
        for name in sorted(os.listdir(base)):
            if not name.endswith(".json") or name.startswith("_"):
                continue
            path = os.path.join(base, name)
            doc = json.load(open(path, encoding="utf-8"))
            relpath = os.path.relpath(path, ROOT)
            yield relpath, doc.get("id"), doc
            # champion 卡把技能**再存一份**（鏡射模型）—— 出貨的是這一份，
            # ⛔ 不掃它等於只驗了兩份副本的其中一份。
            for slot, sub in sorted((doc.get("abilities") or {}).items()):
                if isinstance(sub, dict):
                    yield f"{relpath}#abilities.{slot}", sub.get("id"), sub


def _unconverted_amounts(doc: dict) -> list[str]:
    """還帶 `attrRatios` 而同一格沒有 `ap` 係數的酬載 —— 回傳它們在文件裡的路徑。

    ⚠️ ⛔ 不走 `gen.damage_amounts()`：那一支只認 `doc["effects"]` 底下的
      `damage`／`dot` 家族，而**道具**把 on-hit 的酬載掛在 `doc["passive"][].effects`
      上（朗基努斯之槍 `godie-i018` 就是）—— 用它掃道具會逐份回 0 筆，
      於是這條閘對整個 `content/items/**` **永遠是綠的**（失敗形態⑦：掃屬性代替掃行為）。
    ⇒ 這裡走**整份文件**找 `attrRatios`，形狀無關。
    """
    bad: list[str] = []

    def walk(node, path: str) -> None:
        if isinstance(node, dict):
            if node.get("attrRatios"):
                if not any((r or {}).get("stat") == "ap" for r in (node.get("ratios") or [])):
                    bad.append(path or "(root)")
            for key, value in node.items():
                walk(value, f"{path}.{key}")
        elif isinstance(node, list):
            for i, value in enumerate(node):
                walk(value, f"{path}[{i}]")

    walk(doc, "")
    return bad


def audit() -> list[str]:
    """回傳問題清單（空 = 過）。⭐ 兩個軸：卡面的乘數宣稱 + JSON 的 `attrRatios`。"""
    with open(rel(EXEMPTIONS_PATH), encoding="utf-8") as f:
        table = json.load(f)["exemptions"]
    required = ("id", "axis", "kind", "why", "refutedBy", "expiresWhen")
    problems: list[str] = []
    for row in table:
        missing = [k for k in required if not str(row.get(k) or "").strip()]
        if missing:
            problems.append(
                f"豁免 `{row.get('id')}` 少了 {missing} —— ⛔ 一筆沒有 `refutedBy` 的豁免"
                "就是一段沒有人能反駁的散文，它會活得比它的理由久"
            )
    exempt = {(r["id"], a) for r in table for a in (("prose", "json") if r["axis"] == "both" else (r["axis"],))}
    used: set[tuple[str, str]] = set()

    offenders: list[str] = []
    for where, doc_id, doc in _iter_docs():
        for axis, detail in (
            ("prose", lambda d=doc: gen.claims(d.get("description") or "")),
            ("json", lambda d=doc: _unconverted_amounts(d)),
        ):
            hits = detail()
            if not hits:
                continue
            if (doc_id, axis) in exempt:
                used.add((doc_id, axis))
                continue
            offenders.append(f"{where} · {doc_id} · [{axis}] {hits}")

    if offenders:
        problems.append(
            f"{len(offenders)} 處**未換算的屬性額外傷害**還在出貨內容裡"
            "（owner 2026-08-22 #544：「所有技能力敏智屬性額外傷害都換算成AP」）：\n"
            + "\n".join(f"    · {o}" for o in offenders)
            + f"\n  → 換算規則寫在 `{KNOBS_PATH}` 的 `$formula`。真的不該換的，"
              f"進 `{EXEMPTIONS_PATH}` 並寫下 `why` / `refutedBy` / `expiresWhen`。"
        )
    stale = sorted(exempt - used)
    if stale:
        problems.append(
            f"{len(stale)} 筆豁免對不到任何東西（那一支已經換算完、或改名了）："
            + "、".join(f"`{i}`[{a}]" for i, a in stale)
            + f"\n  → 從 `{EXEMPTIONS_PATH}` 刪掉它。⛔ 過期的豁免是一句沒有人會發現的謊。"
        )
    return problems


# ── 主流程 ──────────────────────────────────────────────────────────────────
def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--freeze", action="store_true")
    args = ap.parse_args()

    if args.freeze:
        freeze()
        return 0

    k = load_knobs()
    with open(rel(CLAIMS_PATH), encoding="utf-8") as f:
        table = json.load(f)
    generator_owned = gen.generator_owned()

    stale: list[str] = []
    behind: list[str] = []
    # ⭐ 只記**生效的**開關，⛔ 不記 `$note` / `$fields` / `$formula` 那些散文 ——
    #   否則改一個註解的錯字就會讓這份產物過期，而 `--check` 會用「產物過期」
    #   這個看起來很嚴重的訊息紅（而真相是有人改了一個逗號）。
    manifest = {"knobs": {kk: vv for kk, vv in k.items() if not kk.startswith("$")}, "abilities": []}

    for aid, entry in sorted(table.items()):
        path = rel(f"content/abilities/{aid}.json")
        if not os.path.exists(path):
            raise SystemExit(f"{aid} 不在內容樹裡 —— 凍結表過期了，⛔ 不要靜靜跳過")
        raw = open(path, encoding="utf-8").read()
        doc = json.loads(raw)
        want = apply_doc(doc, entry, k)
        text = json.dumps(want, ensure_ascii=False, indent=2) + "\n"

        champ = aid.rpartition(".")[0]
        owned_by_generator = champ in generator_owned
        base = [c for c in entry["claims"] if c["stacking"] == "base"]
        manifest["abilities"].append({
            "abilityId": aid,
            "owner": "generator" if owned_by_generator else "json",
            "apPct": pct_for(base[0]["coeff"], k) if base else None,
            "conditionalPct": [pct_for(c["coeff"], k) for c in entry["claims"] if c["stacking"] != "base"],
            "damageType": _damage_type_of(want, 0),
        })

        if owned_by_generator:
            # ⛔ 只驗不寫 —— 這一份的主人是 `tools/skill-remake/heroes/<英雄>.py`。
            if text != raw:
                behind.append(f"{aid} → tools/skill-remake/heroes/{champ}.py")
            continue
        if text == raw:
            continue
        if args.check:
            stale.append(aid)
        else:
            with open(path, "w", encoding="utf-8") as f:
                f.write(text)

    manifest_text = json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    mp = rel(MANIFEST_PATH)
    os.makedirs(os.path.dirname(mp), exist_ok=True)
    current = open(mp, encoding="utf-8").read() if os.path.exists(mp) else None
    if current != manifest_text:
        if args.check:
            stale.append(MANIFEST_PATH)
        else:
            with open(mp, "w", encoding="utf-8") as f:
                f.write(manifest_text)

    problems: list[str] = []
    if stale:
        problems.append(
            f"{len(stale)} 份產物過期：{', '.join(stale[:8])}{' …' if len(stale) > 8 else ''}\n"
            "  → 跑 `pnpm apconv:build` 然後 `git add content/abilities docs/_data`。⛔ 不要手改。"
        )
    if behind:
        problems.append(
            f"{len(behind)} 支**產生器擁有**的技能還沒跟上換算（⛔ 改 JSON 沒有用，"
            "下一次 `pnpm skills:sync` 會把它蓋回去）：\n"
            + "\n".join(f"    · {b}" for b in behind)
            + "\n  → 去改那支 `.py` 的規格字串與 `ad=`／`ap=` 係數，然後 `pnpm skillremake:json`。"
        )

    # ⭐ 稽核跑在**寫完之後**：它問的是「磁碟上還有誰沒換算」，⛔ 不是「這 58 支對不對」。
    problems += audit()

    n = len(table)
    n_gen = sum(1 for a in manifest["abilities"] if a["owner"] == "generator")
    print(f"[apconv] 開關 enabled={k['enabled']} mode={k['mode']} physical={k['physical']} "
          f"rounding={k['rounding']} step={k['stepPct']}% ap/點={k['apPerAttrPoint']}")
    print(f"[apconv] 語料 {n} 支（產生器擁有 {n_gen}，直接編 JSON {n - n_gen}）")
    if problems:
        print("\n[apconv] ⛔ " + f"{len(problems)} 個問題：\n" + "\n".join("\n  " + p for p in problems),
              file=sys.stderr)
        return 1
    print(f"[apconv] {'check OK' if args.check else 'build OK'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
