#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
w3a 翻譯層的**產生器** —— 把「原作 w3a 說什麼」與「GGD 出貨寫什麼」放進同一列。

```bash
pnpm w3a:build     # 重生成三份產物
pnpm w3a:check     # 唯讀:逐位元組比對,過期回非零
```

> owner 2026-08-26:「你應該做的事情是 **翻譯 JASS to 編輯器JSON**,
>  如果 **JSON 沒支援的標籤或邏輯則去實作**才對阿」
> owner 2026-08-26:「這個的做法還會**缺一個部分**就是 **w3x 原始技能的設定特效與機制
>  包含傷害方式**,也請一起考慮翻譯進去」

⛔ **這一支一個出貨數值都不改。** owner 常設:「公式已定好,只要公式本身自洽,
我們只調系統倍率」。它的工作是**讓落差看得見**,⛔ 不是替他裁決 ——
所以它只寫 `docs/` 的兩份表與一份機器可讀的 `gaps.json`,⛔ 不碰 `content/`。

## 三份產物

| 產物 | 是什麼 |
|---|---|
| `docs/w3a翻譯來源總表.md` | **翻譯來源** —— w3a 的每一個欄位碼翻成 GGD 的哪一格(逐欄、逐 base 的 data 字典、傷害軸的落點) |
| `docs/w3a落差表.md` | **落差表** —— 逐軸/逐支「w3a 說 A、GGD 出貨 B」,每一筆都要指得出**哪一層贏了** |
| `tools/w3a-translate/gaps.json` | 上面那張表的機器可讀版,`w3aTranslationGaps.test.ts` 吃它 |

## 輸入(全部唯讀)

| 來源 | 給什麼 |
|---|---|
| `tools/w3x-import/out/GoDieEX22s/ABILITY_W3A.json` | 第②層:w3a 物件資料(`build_ability_w3a.py` 的產物) |
| `content/abilities/*.json` | GGD 出貨側 |
| `packages/shared/src/sim/stats/statTypes.ts` | ⭐ `Stat` 詞彙 —— **推導**,⛔ 不抄名單 |
| `packages/shared/src/content/schema/common.ts` | ⭐ `Scaling.attrRatios` 的 `attr` 列舉 |
| `packages/shared/src/content/schema/effects/_shared.ts` | ⭐ `zResourcePctTerm` 的三個列舉 |
| `tools/w3a-translate/gap-ledger.json` | ⭐ **人編的裁決帳本**(哪一層贏了 + 理由),⛔ 不是產物 |

## ⭐ 兩個方向都要關(同 `editorCapabilities.ts` 的判準)

帳本宣告一個軸 `supported`(翻得過去、只是沒人翻)⇒ 產生器**去引擎裡找那個名詞**,
找不到就 `SystemExit`;宣告 `missing`(要去實作)⇒ 產生器**確認引擎真的沒有它**,
有了就 `SystemExit` 並要求刪掉那一列。
⛔ 一張手寫的「引擎支援什麼」表會過期而且不會有東西紅 —— 這一支不留那個洞。

## ⚠️ 刻意沒有產生日期

任何隨時鐘變動的欄位都會讓逐位元組比對永遠不相等 ⇒ `--check` 只能被放寬 ⇒
一條被放寬的閘等於沒有閘(同 `caps:export` / `spec:build` / `locust:build`)。

## 產物隔離區

`_write()` 先 `chmod 644` 再寫、收工 `chmod 444` —— 產生器對**自己的**產物是
合法寫入者,⛔ 但任何別的通道(含 python/node 檔案 API)吃 `PermissionError`。
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import re
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))

W3A_JSON = os.path.join(ROOT, "tools/w3x-import/out/GoDieEX22s/ABILITY_W3A.json")
LEDGER_JSON = os.path.join(HERE, "gap-ledger.json")
OUT_GAPS = os.path.join(HERE, "gaps.json")
OUT_SRC = os.path.join(ROOT, "docs/w3a翻譯來源總表.md")
OUT_GAP = os.path.join(ROOT, "docs/w3a落差表.md")
CMD = "pnpm w3a:build"

STAT_TS = os.path.join(ROOT, "packages/shared/src/sim/stats/statTypes.ts")
COMMON_TS = os.path.join(ROOT, "packages/shared/src/content/schema/common.ts")
SHARED_TS = os.path.join(ROOT, "packages/shared/src/content/schema/effects/_shared.ts")

# WC3 世界單位 → GGD 場地單位。⚠️ 這個 repo 有三個互相打架的因子
# (1/36 網格預設 · 11/600 技能移植的距離因子 · 1/85 gen_ex_content.py);
# 這裡沿用 W3A-DIFF 用的那一個,而且**只用來比對**,⛔ 不寫進任何內容。
GGD_PER_WC3 = 11.0 / 600.0

AXES = ["scaling", "cooldown", "mana", "range", "radius", "duration"]


# ───────────────────────── 引擎詞彙(推導,⛔ 不抄名單) ─────────────────────────
def _read(path: str) -> str:
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def ggd_vocabulary() -> dict:
    """從出貨的 TS 推導 GGD 的 scaling 詞彙。空的就是量錯了 ⇒ 硬錯誤。"""
    stat_src = _read(STAT_TS)
    body = stat_src[stat_src.index("export enum Stat {"):]
    body = body[: body.index("\n}")]
    stats = set(re.findall(r'^\s*[A-Za-z]\w*\s*=\s*"([A-Za-z]+)"', body, re.M))

    common = _read(COMMON_TS)
    m = re.search(r'attr:\s*z\.enum\(\[([^\]]*)\]\)', common)
    attrs = set(re.findall(r'"([a-z]+)"', m.group(1))) if m else set()

    shared = _read(SHARED_TS)
    rp = shared[shared.index("export const zResourcePctTerm"):]
    rp = rp[: rp.index("\n  .strict()")]
    def enum_of(field: str) -> set:
        mm = re.search(field + r':\s*z\.enum\(\[([^\]]*)\]\)', rp)
        return set(re.findall(r'"([a-z]+)"', mm.group(1))) if mm else set()
    resource_pct = {
        "subject": enum_of("subject"),
        "resource": enum_of("resource"),
        "basis": enum_of("basis"),
    }

    vocab = {"stats": stats, "attrs": attrs, "resourcePct": resource_pct}
    # ⭐ 量尺先自證:任何一格空掉,底下每一筆落差都會被誤判成「引擎沒有這個詞彙」。
    if len(stats) < 10 or len(attrs) != 3 or any(len(v) < 2 for v in resource_pct.values()):
        sys.exit(
            "FATAL: 引擎詞彙抽取失敗 —— "
            f"stats={len(stats)} attrs={sorted(attrs)} resourcePct={ {k: sorted(v) for k, v in resource_pct.items()} }\n"
            "  這三個檔的形狀變了。⛔ 不要放寬正則就當作沒事:抽空的話這一支會把\n"
            "  每一筆落差都標成「引擎沒有這個詞彙」,而那正好是它要防的謊。"
        )
    return vocab


def probe_landing(landing: dict, vocab: dict) -> bool:
    """帳本宣告的落點在引擎裡**真的存在**嗎?（兩個方向都靠這一支回答）"""
    kind = landing["probe"]["kind"]
    if kind == "stat":
        return landing["probe"]["id"] in vocab["stats"]
    if kind == "attr":
        return landing["probe"]["id"] in vocab["attrs"]
    if kind == "resourcePct":
        p = landing["probe"]
        return (
            p["subject"] in vocab["resourcePct"]["subject"]
            and p["resource"] in vocab["resourcePct"]["resource"]
            and p["basis"] in vocab["resourcePct"]["basis"]
        )
    if kind == "absent":
        # 宣告「引擎沒有這個名詞」—— 反方向:它出現了就要紅。
        token = landing["probe"]["token"]
        return token not in vocab["stats"] and token not in vocab["attrs"]
    sys.exit(f"FATAL: gap-ledger.json 的 probe.kind 不認得:{kind}")


# ───────────────────────── 出貨側 ─────────────────────────
def shipped_abilities() -> dict:
    out = {}
    for p in sorted(glob.glob(os.path.join(ROOT, "content/abilities/*.json"))):
        if p.endswith("_index.json"):
            continue
        with open(p, encoding="utf-8") as fh:
            d = json.load(fh)
        out[d["id"]] = d
    if len(out) < 100:
        sys.exit(f"FATAL: content/abilities 只讀到 {len(out)} 份 —— 母體量錯了")
    return out


def _walk_numbers(node, key: str, acc: list) -> None:
    if isinstance(node, dict):
        for k, v in node.items():
            if k == key and isinstance(v, (int, float)):
                acc.append(float(v))
            else:
                _walk_numbers(v, key, acc)
    elif isinstance(node, list):
        for v in node:
            _walk_numbers(v, key, acc)


def _has_key(node, key: str) -> bool:
    if isinstance(node, dict):
        if key in node:
            return True
        return any(_has_key(v, key) for v in node.values())
    if isinstance(node, list):
        return any(_has_key(v, key) for v in node)
    return False


def ggd_axis(doc: dict, axis: str):
    """出貨側這一軸的值(LV1/最大)與它有沒有級距欄。回 (value, has_tier)。"""
    if axis == "cooldown":
        cd = doc.get("cooldown") or []
        return (float(cd[0]) if cd else None, "cooldownTier" in doc)
    if axis == "mana":
        mp = doc.get("manaCost") or []
        return (float(mp[0]) if mp else None, "manaCostTier" in doc)
    if axis == "range":
        r = doc.get("range")
        return (float(r) if isinstance(r, (int, float)) else None, "rangeTier" in doc)
    if axis == "radius":
        acc: list = []
        _walk_numbers(doc, "radius", acc)
        return (max(acc) if acc else None, _has_key(doc, "radiusTier"))
    if axis == "duration":
        acc = []
        _walk_numbers(doc, "durationSec", acc)
        return (max(acc) if acc else None, False)  # ⚫ 這一軸沒有級距表
    raise AssertionError(axis)


W3A_STAT_KEY = {
    "cooldown": "cooldown",
    "mana": "mana",
    "range": "cast_range",
    "radius": "area",
    "duration": "duration",
}


def w3a_axis(rec: dict, axis: str):
    d = (rec.get("stats") or {}).get(W3A_STAT_KEY[axis]) or {}
    v = d.get("1")
    return float(v) if isinstance(v, (int, float)) else None


def same_value(axis: str, w: float, g: float) -> bool:
    if axis in ("range", "radius"):
        return abs(w * GGD_PER_WC3 - g) <= 0.05 + 0.02 * abs(g)
    return abs(w - g) <= 1e-6 + 0.02 * abs(g)


# ───────────────────────── 分類 ─────────────────────────
def classify(w3a: dict, shipped: dict, ledger: dict, vocab: dict) -> dict:
    axis_map = ledger["axisVocabulary"]
    gaps: list = []
    tally: Counter = Counter()
    joined = 0

    for rid in sorted(w3a["abilities"]):
        rec = w3a["abilities"][rid]
        g = rec.get("ggd") or {}
        sh = g.get("shipped")
        if not sh:
            continue
        doc = shipped.get(sh["abilityId"])
        if doc is None:
            continue
        joined += 1
        ggd_id = doc["id"]

        # ── ① scaling 軸 ──────────────────────────────────────────────
        sa = g.get("scalingAxis") or {}
        verdict = sa.get("verdict")
        if verdict in ("axis-mismatch", "ggd-has-no-axis"):
            w = sa.get("w3x") or {}
            axis_id = w.get("id") or "?"
            entry = axis_map.get(axis_id)
            if entry is None:
                sys.exit(
                    f"FATAL: gap-ledger.json 的 axisVocabulary 沒有 `{axis_id}` "
                    f"(第一次出現在 {rid} / {ggd_id})。\n"
                    "  ⇒ 補一列:它翻得到 GGD 的哪一格(supported),還是要去實作(missing)?\n"
                    "  ⛔ 不要在這裡寫預設值 —— 一個猜出來的落點會被下游當成事實。"
                )
            supported = entry["status"] == "supported"
            key = f"scaling:{'translatable' if supported else 'missing'}:{axis_id}"
            gaps.append({
                "axis": "scaling",
                "key": key,
                "w3a": rid,
                "ggd": ggd_id,
                "name": rec.get("name") or "",
                "w3aValue": f"{w.get('kind')}:{axis_id}×{w.get('coeff')}",
                "ggdValue": ", ".join(
                    f"{x.get('kind')}:{x.get('id')}×{x.get('coeff')}" for x in (sa.get("ggd") or [])
                ) or "（無）",
                "verdict": verdict,
            })
            tally[key] += 1

        # ── ② 五個數值軸 ──────────────────────────────────────────────
        for axis in ("cooldown", "mana", "range", "radius", "duration"):
            w = w3a_axis(rec, axis)
            gv, has_tier = ggd_axis(doc, axis)
            if w is None:
                tally[f"{axis}:w3a-absent"] += 1
                continue
            if gv is None:
                key = f"{axis}:ggd-absent"
            elif same_value(axis, w, gv):
                tally[f"{axis}:same"] += 1
                continue
            elif has_tier:
                key = f"{axis}:tier"
            elif gv == 0.0:
                key = f"{axis}:ggd-zero"
            else:
                key = f"{axis}:free-number"
            gaps.append({
                "axis": axis,
                "key": key,
                "w3a": rid,
                "ggd": ggd_id,
                "name": rec.get("name") or "",
                "w3aValue": round(w, 3),
                "ggdValue": None if gv is None else round(gv, 3),
                "verdict": key.split(":", 1)[1],
            })
            tally[key] += 1

    gaps.sort(key=lambda x: (AXES.index(x["axis"]), x["key"], x["ggd"], x["w3a"]))
    return {"gaps": gaps, "tally": tally, "joined": joined}


# ───────────────────────── 翻譯來源的逐欄表 ─────────────────────────
# (w3a code, 抽取後的鍵, 計數來源, GGD 落點)
# ⭐ 欄位名與帶值支數是**量出來的**;這裡只寫「它翻到 GGD 的哪一格」——
# 那是一個翻譯決定,⛔ 不是可以推導的事實,所以它是這一支唯一手寫的一張表。
FIELD_TO_GGD = [
    ("acdn", "stats.cooldown", ("stat", "cooldown"), "ability@1.cooldown[] ／ cooldownTier"),
    ("amcs", "stats.mana", ("stat", "mana"), "ability@1.manaCost[] ／ manaCostTier"),
    ("aran", "stats.cast_range", ("stat", "cast_range"), "ability@1.range ／ rangeTier（⚠️ WC3 世界單位,要換算）"),
    ("aare", "stats.area", ("stat", "area"), "effect.radius ／ radiusTier（⚠️ 同上）"),
    ("adur", "stats.duration", ("stat", "duration"), "effect.durationSec（對雜兵）"),
    ("ahdu", "stats.hero_duration", ("stat", "hero_duration"), "⚫ **GGD 沒有這一格** —— 對英雄減時是一個缺的機制"),
    ("atar", "stats.targets_allowed", ("stat", "targets_allowed"), "ability@1.targetsEnemies ＋ 效果的 filter（w3x 的集合比布林細）"),
    ("abuf", "stats.buffs", ("stat", "buffs"), "applyStatus.statusId ／ applyBuff（w3h 是第二條特效通道）"),
    ("acas", "stats.castTime", ("stat", "castTime"), "ability@1.castTimeSec"),
    ("aart", "icon", ("icon", ""), "ability@1.icon"),
    ("acat/atat/aeat/asat/amat/aaea", "art.models", ("artgroup", "models"), "ability@1.vfxKey → content/vfx/*"),
    ("alig", "art.models.LightningEffect", ("artcode", "LightningEffect"), "電弧家族（Lightning.slk 的列,⛔ 不是模型）"),
    ("aefs/aefa", "art.sounds", ("artgroup", "sounds"), "ability@1.sfxKey（⭐ owner 2026-08-20 點名的「特效音效綁定」）"),
    ("acap/aspt/ata0..5", "art.attach", ("artgroup", "attach"), "球體綁定位置（⭐ owner 點名;vfx.bone-attachment@1）"),
    ("atp1/aub1", "（ubertip）", ("ubertip", ""), "ability@1.description ＋ {{cd}}/{{mp}}/{{dmg}} 佔位"),
    ("Data A–I", "data[]", ("data", ""), "語意隨 base 而異 —— 見 §3 的逐 base 字典"),
]


def render_source_doc(w3a: dict, vocab: dict, ledger: dict, counts: dict,
                      art_count: Counter, base_rank: list, data_dict: list) -> str:
    L: list = []
    A = L.append
    A("# w3a 翻譯來源總表")
    A("")
    A("> ⛔ **這一份是產生的,不可以手改。** 重生成：")
    A("> ```bash")
    A("> pnpm w3a:build     # 重生成")
    A("> pnpm w3a:check     # 唯讀:過期就回非零")
    A("> ```")
    A("> 產生器 `tools/w3a-translate/gen.py`;第②層的抽取器是 `tools/w3x-import/build_ability_w3a.py`。")
    A("")
    A("> owner 2026-08-26:「你應該做的事情是 **翻譯 JASS to 編輯器JSON**,"
      "如果 **JSON 沒支援的標籤或邏輯則去實作**才對阿」")
    A("> owner 2026-08-26:「這個的做法還會**缺一個部分**就是 "
      "**w3x 原始技能的設定特效與機制包含傷害方式**,也請一起考慮翻譯進去」")
    A("")
    A("⇒ 翻譯的來源是**兩層**,⛔ 不是只有 JASS:")
    A("")
    A("| 層 | 是什麼 | 誰抽 |")
    A("|---|---|---|")
    A("| **① JASS 觸發器** | 演出時序 · 生成 · 縮放 · 清場 | `tools/w3x-import/extract_jass_spells.py` · `tools/jass-combo/extract.py` |")
    A("| **② w3a 物件資料** | **base 機制** · **傷害方式** · Data 欄 · 距離/範圍/冷卻/魔耗/持續/目標 · **特效欄** · **音效欄** | `tools/w3x-import/build_ability_w3a.py` ⇒ 本檔 |")
    A("")
    A(f"母體:**{w3a['summary']['abilities']} 支** w3a 技能,其中 "
      f"**{w3a['summary'].get('joined_to_ggd', 0)} 支**接得到 GGD 出貨技能。")
    A("")
    A("---")
    A("")
    A("## 1. 逐欄:w3a 的這一格翻到 GGD 的哪一格")
    A("")
    A("⚠️ 「帶值支數」是**量出來的**(從 `ABILITY_W3A.json` 數),⛔ 不是估計。")
    A("")
    A("| w3a 欄位 | 抽取後的鍵 | 帶值支數 | → GGD 落點 |")
    A("|---|---|---:|---|")
    for code, key, (tag, arg), landing in FIELD_TO_GGD:
        if tag == "stat":
            n = counts["stats"].get(arg, 0)
        elif tag == "artgroup":
            n = counts["artGroup"].get(arg, 0)
        elif tag == "artcode":
            n = counts["artCode"].get(arg, 0)
        else:
            n = counts[tag]
        A(f"| `{code}` | `{key}` | {n} | {landing} |")
    A("")
    A("### 特效／音效／掛點欄(⭐ owner 點名的那三項)")
    A("")
    A("| 群 | 欄位碼 | 支數 |")
    A("|---|---|---:|")
    for (grp, code), n in sorted(art_count.items(), key=lambda kv: (-kv[1], kv[0])):
        if not isinstance(grp, str) or grp not in ("models", "sounds", "attach"):
            continue
        A(f"| `{grp}` | `{code}` | {n} |")
    A("")
    A("⚠️ 這一份記的是**地圖寫了什麼**(w3a 覆寫),⛔ 不解析庫存 `*AbilityFunc.txt` 的繼承 ——")
    A("「最終生效的模型」住 `tools/w3x-import/build_vfx_bindings.py`,重寫一次就是第二個住處。")
    A("")
    A("---")
    A("")
    A("## 2. base 分佈 —— ⭐ 這是一個 **K 個模板**的題目,⛔ 不是 N 輪")
    A("")
    A("| # | base | 自訂技能 | 累計 |")
    A("|--:|---|--:|--:|")
    cum = 0
    for i, (b, n) in enumerate(base_rank, 1):
        cum += n
        A(f"| {i} | `{b}` | {n} | {cum} |")
    A("")
    A("---")
    A("")
    A("## 3. Data 欄字典 —— 同一個索引在不同 base 底下是不同的東西")
    A("")
    A("⛔ 「col 3 = 200.0」讀不出任何東西。下面每一欄都帶 **欄位碼 → World Editor 官方欄位名**,")
    A("由 `Units\\AbilityMetaData.slk` ＋ `UI\\WorldEditStrings.txt` 推導(⛔ 不是手寫的對照表)。")
    A("")
    A("| base | 1 (DataA) | 2 (DataB) | 3 (DataC) | 4 (DataD) | 5 (DataE) |")
    A("|---|---|---|---|---|---|")
    for b, cols in data_dict:
        cells = []
        for i in range(1, 6):
            c = cols.get(str(i))
            cells.append(f"`{c['field']}` {c['name']}" if c else "—")
        A(f"| **`{b}`** | " + " | ".join(cells) + " |")
    A("")
    A("---")
    A("")
    A("## 4. 傷害方式 —— 每一個 scaling 軸的 GGD 落點")
    A("")
    A("⭐ **這一節有兩個方向的閘**(同 `editorCapabilities.ts`):宣告 `supported` 而引擎沒有 → 產生器硬錯;")
    A("宣告 `missing` 而引擎其實有了 → 一樣硬錯(要求刪掉那一列)。⛔ 一張手寫的支援表會過期而且不會有東西紅。")
    A("")
    A("| w3x 文案的軸 | 狀態 | GGD 落點 | 引擎裡的證據 |")
    A("|---|---|---|---|")
    for axis_id in sorted(ledger["axisVocabulary"]):
        e = ledger["axisVocabulary"][axis_id]
        mark = "⭐ 翻得過去" if e["status"] == "supported" else "⛔ **要去實作**"
        A(f"| `{axis_id}` | {mark} | `{e['landing']}` | {e['evidence']} |")
    A("")
    A("⭐ 引擎現有的詞彙(**推導**,⛔ 不是抄的):")
    A("")
    A(f"- `Stat`（{len(vocab['stats'])} 個）：`" + " ".join(sorted(vocab["stats"])) + "`")
    A(f"- `Scaling.attrRatios.attr`：`" + " ".join(sorted(vocab["attrs"])) + "`")
    A("- `damage/dot.resourcePct`：subject `"
      + " ".join(sorted(vocab["resourcePct"]["subject"]))
      + "` · resource `" + " ".join(sorted(vocab["resourcePct"]["resource"]))
      + "` · basis `" + " ".join(sorted(vocab["resourcePct"]["basis"])) + "`")
    A("")
    A("---")
    A("")
    A("## 5. ⛔ 這一份沒有裁決任何數值")
    A("")
    A("owner 常設:「**公式已定好,只要公式本身自洽,我們只調系統倍率**」。")
    A("這一份的工作是**讓落差看得見**(見 `docs/w3a落差表.md`),⛔ 不是替他挑數字。")
    A("")
    return "\n".join(L) + "\n"


def render_gap_doc(res: dict, ledger: dict) -> str:
    tally = res["tally"]
    rows = ledger["rulings"]
    by_key = {r["key"]: r for r in rows}
    L: list = []
    A = L.append
    A("# w3a 落差表 —— 每一筆都要指得出**哪一層贏了**")
    A("")
    A("> ⛔ **這一份是產生的,不可以手改。** 重生成 `pnpm w3a:build`;閘 `pnpm w3a:check`。")
    A("> 裁決住 `tools/w3a-translate/gap-ledger.json`(**人編的**),守衛住")
    A("> `packages/shared/src/ops/w3aTranslationGaps.test.ts`。")
    A("")
    A("第〇·六守則的優先序階梯要求:一筆落差要嘛指得出**哪一層贏了**,要嘛它是 ⚫ **無主**。")
    A("⛔ 兩種東西長得一樣就會被混用 —— 所以這一份把它們分開列。")
    A("")
    A(f"接得上的技能對:**{res['joined']}** 組。")
    A("")
    A("## 1. 逐軸總表")
    A("")
    A("| 軸 | 相同 | 有主(指得出哪一層) | ⚫ 無主 | w3a 沒這一格 |")
    A("|---|--:|--:|--:|--:|")
    for axis in AXES:
        same = tally.get(f"{axis}:same", 0)
        absent = tally.get(f"{axis}:w3a-absent", 0)
        owned = 0
        unowned = 0
        for k, n in tally.items():
            if not k.startswith(f"{axis}:") or k.endswith(":same") or k.endswith(":w3a-absent"):
                continue
            r = by_key.get(k)
            if r and r["layer"] != "⚫無主":
                owned += n
            else:
                unowned += n
        A(f"| `{axis}` | {same} | {owned} | {unowned} | {absent} |")
    A("")
    A("## 2. 裁決帳本(逐列 —— ⭐ 棘輪:`max` 只准變小)")
    A("")
    A("| 落差類別 | 幾筆 | 哪一層贏了 | 理由 |")
    A("|---|--:|---|---|")
    for r in sorted(rows, key=lambda r: (AXES.index(r["key"].split(":")[0]), r["key"])):
        n = tally.get(r["key"], 0)
        A(f"| `{r['key']}` | {n} | {r['layer']} | {r['reason']} |")
    A("")
    A("⚠️ 一列的 `max` 是**上一次量到的數字**。修好一筆 ⇒ 這一份重生成 ⇒ 守衛要求把 `max` 調降;")
    A("⛔ 沒有人可以靜靜地讓它變大。")
    A("")
    A("## 3. ⚫ 無主的落差(逐筆)")
    A("")
    A("⛔ 這一節**不是提案**。它只是把「w3x 說 A、我們出貨 B、而沒有任何一層贏」擺到同一列上 ——")
    A("第一守則:出貨數值的每一次改動要能引用到 owner 的一句原話,而這裡一句都引不到。")
    A("")
    unowned = [g for g in res["gaps"] if (by_key.get(g["key"]) or {}).get("layer") == "⚫無主"]
    A(f"共 **{len(unowned)}** 筆。")
    A("")
    A("| # | 軸 | 類別 | w3a | 技能 | GGD id | w3x | GGD |")
    A("|--:|---|---|---|---|---|---|---|")
    for i, g in enumerate(unowned, 1):
        A(f"| {i} | `{g['axis']}` | `{g['key'].split(':', 1)[1]}` | `{g['w3a']}` | "
          f"{g['name']} | `{g['ggd']}` | {g['w3aValue']} | {g['ggdValue']} |")
    A("")
    A("## 4. ⛔ 這一份改了什麼")
    A("")
    A("**一個出貨數值都沒有。** owner 常設:「公式已定好,只要公式本身自洽,我們只調系統倍率」。")
    A("")
    return "\n".join(L) + "\n"


# ───────────────────────── 產物寫入 ─────────────────────────
def _write(path: str, body: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    # 產物隔離區:寫入點自解鎖(⛔ 不要改成「鎖著就拒跑」—— 那會毒掉自己的戶籍)。
    if os.path.exists(path):
        os.chmod(path, 0o644)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(body)
    os.chmod(path, 0o444)


def build() -> list:
    with open(W3A_JSON, encoding="utf-8") as fh:
        w3a = json.load(fh)
    with open(LEDGER_JSON, encoding="utf-8") as fh:
        ledger = json.load(fh)
    vocab = ggd_vocabulary()

    # ⭐ 兩個方向的閘 —— 帳本說的話要跟引擎對得上。
    for axis_id, e in sorted(ledger["axisVocabulary"].items()):
        # ⚠️ 先關掉一個自己踩過的洞:`status` 與 `probe.kind` 可以各自漂。
        #    只翻 `status`(而 probe 還指著一個存在的名詞)會讓下面兩條都放行 ——
        #    一個宣告與它的證據脫鉤的閘,等於沒有閘。
        wants_absent = e["probe"]["kind"] == "absent"
        if (e["status"] == "missing") != wants_absent:
            sys.exit(
                f"FATAL: gap-ledger.json 的 `{axis_id}` 自相矛盾:status={e['status']} 而 "
                f"probe.kind={e['probe']['kind']}。\n"
                "  ⇒ status=\"missing\" 一定配 probe.kind=\"absent\"(去引擎裡確認它真的不存在);"
                "其餘一定配一個指得到落點的 probe。"
            )
        ok = probe_landing(e, vocab)
        if e["status"] == "supported" and not ok:
            sys.exit(
                f"FATAL: gap-ledger.json 宣告 `{axis_id}` 是 supported(落點 {e['landing']}),"
                f"⛔ 但引擎裡找不到那個名詞。\n"
                "  ⇒ 要嘛落點寫錯了,要嘛引擎把它拿掉了。⛔ 不要放寬 probe。"
            )
        if e["status"] == "missing" and not ok:
            sys.exit(
                f"FATAL: gap-ledger.json 說 `{axis_id}` 要去實作,⛔ 但引擎裡已經有這個名詞了。\n"
                "  ⇒ 把那一列改成 supported 並填上落點 —— 一列說「這裡沒有」的宣告,"
                "下一個人讀到的是「不用做」,而那正是這張表要防的東西。"
            )

    shipped = shipped_abilities()
    res = classify(w3a, shipped, ledger, vocab)

    # 翻譯來源表要的量測（⭐ 全部從產物數出來,⛔ 沒有一個是抄的）
    stats_count = Counter()
    art_count = Counter()
    art_group = Counter()
    art_code = Counter()
    base_all = Counter()
    icon_n = 0
    data_n = 0
    data_dict_raw: dict = {}
    for rec in w3a["abilities"].values():
        for k, v in (rec.get("stats") or {}).items():
            if v:
                stats_count[k] += 1
        if rec.get("icon"):
            icon_n += 1
        if rec.get("data"):
            data_n += 1
        for grp, vals in (rec.get("art") or {}).items():
            art_group[grp] += 1
            for code in vals:
                art_count[(grp, code)] += 1
                art_code[code] += 1
        if rec.get("table") == "custom":
            base_all[rec.get("base") or "?"] += 1
        b = rec.get("base")
        if b and rec.get("data"):
            slot = data_dict_raw.setdefault(b, {})
            for idx, col in rec["data"].items():
                slot.setdefault(idx, {"field": col.get("field"), "name": col.get("name")})
    base_rank = base_all.most_common(20)
    data_dict = [(b, data_dict_raw.get(b, {})) for b, _ in base_rank if b in data_dict_raw]
    s = w3a["summary"]
    counts = {
        "stats": stats_count,
        "artGroup": art_group,
        "artCode": art_code,
        "icon": icon_n,
        "data": data_n,
        # ⭐ 「有 ubertip 的支數」＝ 四種傷害解析結果的和(含誠實 null),⛔ 不是猜的
        "ubertip": (s.get("damage_high", 0) + s.get("damage_medium", 0)
                    + s.get("damage_low", 0) + s.get("damage_unparsed_with_ubertip", 0)),
    }

    gaps_doc = {
        "schema": "ggd-w3a-gaps@1",
        "generatedBy": "tools/w3a-translate/gen.py",
        "purpose": "逐軸/逐支「w3a 說 A、GGD 出貨 B」。⛔ 不裁決任何數值,只讓落差看得見。",
        "ledger": "tools/w3a-translate/gap-ledger.json",
        "joined": res["joined"],
        "tally": dict(sorted(res["tally"].items())),
        "gaps": res["gaps"],
    }

    return [
        (OUT_GAPS, json.dumps(gaps_doc, ensure_ascii=False, indent=1) + "\n"),
        (OUT_SRC, render_source_doc(w3a, vocab, ledger, counts, art_count, base_rank, data_dict)),
        (OUT_GAP, render_gap_doc(res, ledger)),
    ]


def main() -> int:
    ap = argparse.ArgumentParser(description="w3a 翻譯來源 + 落差表的產生器")
    ap.add_argument("--check", action="store_true", help="唯讀:逐位元組比對,過期回 1")
    args = ap.parse_args()

    outputs = build()
    if args.check:
        stale = []
        for path, want in outputs:
            if not os.path.exists(path):
                stale.append((path, "不存在"))
                continue
            with open(path, encoding="utf-8") as fh:
                if fh.read() != want:
                    stale.append((path, "與重新產生的不一致"))
        if stale:
            print("w3a:check 過期:")
            for p, why in stale:
                print(f"  {os.path.relpath(p, ROOT)} —— {why}")
            print(f"→ 跑 {CMD} 然後 git add")
            return 1
        print(f"w3a:check OK({len(outputs)} 份產物皆最新)")
        return 0

    for path, body in outputs:
        _write(path, body)
    print(f"w3a:build 完成:{len(outputs)} 份產物")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
