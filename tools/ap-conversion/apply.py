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
MANIFEST_PATH = "docs/_data/ap-conversion-applied.json"

#: ⭐ 卡面上「這一項是法強百分比」的**唯一**寫法。出貨內容早就在用
#: （77-02 雷鳴劍「10% [AP]傷害」、77-01「50% [AD]」），⛔ 不要另發明一種。
AP_TAG = "[AP]"
#: `abilityScaling.test.ts` 的 fx-16 與這一支讀**同一個**字樣。⛔ 不要抄第二份正則。
AP_CLAIM_RE = re.compile(r"[0-9]+(?:\.[0-9]+)?%\s*\[AP\]")


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
        for key in ("ratios", "attrRatios"):
            amount.pop(key, None)
            if before.get(key) is not None:
                amount[key] = json.loads(json.dumps(before[key]))

    if not k["enabled"]:
        return out

    out["description"] = rewrite_description(entry["description"], k)

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
    if k["mode"] == "add":
        kept = [r for r in (amount.get("ratios") or []) if r.get("stat") != "ap"]
        amount["ratios"] = kept + [ratio]
    else:
        amount["ratios"] = [ratio]
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
    manifest = {"knobs": k, "abilities": []}

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
