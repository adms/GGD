#!/usr/bin/env python3
"""
scan_shapes.py —— 全技能**形狀**掃描器（owner 技能模板群組⑨）

owner 2026-08-23 逐字：
  「以上範例技能模板請**重新掃描套用在全部技能**，檢查是否有**動畫效果等待、迴圈、
    持續特效**等機制，**形成新模板及套用設定**」

⭐ 它是一支**掃描器**，⛔ 不是一份手寫報告。手寫的表在下一支技能落地的那一天就過期，
而它過期的樣子跟正確的一模一樣（CLAUDE.md 第三守則）。

── 它回答什麼 ──────────────────────────────────────────────────────────────
  ① 出貨的每一支技能是什麼**形狀**（六條軸的子集合）—— 從 `content/abilities/**` 推導
  ② 形狀相同的歸一群，每群**幾支**
  ③ 每一群**有沒有模板**（從 `content/ability-templates/**` ＋ 誰真的引用它 推導）
  ④ ⭐ **宣稱 vs 實作的差集** ——「說明說有迴圈、JSON 裡沒有任何迴圈機制」的那幾支。
     ⭐ **這一格就是⑨的價值**：owner 的規則是按**擋住的支數**排序，而在這支掃描器
     之前沒有人知道「有幾支技能在等一個不存在的模板」。

── 知識住哪裡 ──────────────────────────────────────────────────────────────
  ⛔ **這支程式裡一個欄位名都沒有。** 兩份表是唯一住處（第〇·四守則）：
     `shape_axes.json`    出貨 JSON 的哪一格算哪一條軸（＝實作側）
     `prose_markers.json` 說明裡的哪一句話算哪一條軸（＝宣稱側）
  ⇒ 引擎多一個時序機制時，改的是那兩份 JSON，⛔ 不是這支程式。

── 閘（⛔ 不是判準）────────────────────────────────────────────────────────
  `--check` 在**兩件事**上回非零：
    (A) **欄位覆蓋** —— 出貨技能裡出現過的欄位名，落在 axes/byKind/ignored 之外 ⇒ 紅，
        訊息指名那個欄位與它出現在哪個 kind。
        ⭐ 這是承重的那一條：沒有它，引擎哪天加一個 `windUpSec` 而沒有人分類它，
        掃描器會**安靜地**把那一族技能算成「沒有等待」，而報表看起來完全正常
        （失敗形態②）。
    (B) **產物新鮮度** —— `--out` 指的那份文件與現在算出來的**逐位元組**不同 ⇒ 紅。
  ⚠️ 產物**刻意沒有產生日期**（同 `caps:export` / `spec:build`）：任何隨時鐘變動的
     欄位都會讓逐位元組比對永遠不相等，於是閘只能被放寬成模糊比對 —— 而一條被放寬的
     閘等於沒有閘。

用法:
  python3 tools/skill-templates/scan_shapes.py --out docs/_reports/xxx.md
  python3 tools/skill-templates/scan_shapes.py --check --out <同一份>
  python3 tools/skill-templates/scan_shapes.py --json /tmp/shapes.json
  python3 tools/skill-templates/scan_shapes.py --selftest
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
ABIL_DIR = ROOT / "content" / "abilities"
TPL_DIR = ROOT / "content" / "ability-templates"

AXES_TABLE = HERE / "shape_axes.json"
PROSE_TABLE = HERE / "prose_markers.json"

# ⭐ 軸的**列印順序**（⛔ 不是字典序）—— 前三條逐字是 owner 的用詞，
#    所以它們排前面；報表要讓他一眼認得出自己那句話。
AXIS_ORDER = ["等待", "迴圈", "持續", "續效特效", "多段", "路徑"]

# ⭐ 宣稱側**很弱**的軸：中文說明幾乎不直接描述特效壽命，所以它的差集
#    ⛔ 不可以當成「缺模板」的證據（那會產生一整欄假的需求）。
#    理由寫在 prose_markers.json 的 `續效特效.why`。
PROSE_WEAK_AXES = {"續效特效"}

# 一群要幾支才值得**單獨**做一個模板。⭐ 判準是 owner 的規則（按擋住的支數排序），
# 5 是這份 repo 既有的做法量出來的：`tpl-single-strike` 32 支、`tpl-buff-self` 31 支、
# `tpl-instant-blast` 12 支、`tpl-proxy-cast` 8 支、`tpl-line-sweep` 2 支 ——
# 已出貨且真的有人用的模板，最小的一個是 2 支，而中位數落在 8。
# 5 是「值得一個模板」與「併進既有模板的參數」之間那條線。
GROUP_TEMPLATE_THRESHOLD = 5

QUOTE_RE = re.compile(r"「[^」]*」", re.S)
PLACEHOLDER_RE = re.compile(r"\{\{[^}]*\}\}")


# ───────────────────────────────────────────────────────────────────────────
# 讀表
# ───────────────────────────────────────────────────────────────────────────
def load_tables() -> tuple[dict, dict]:
    axes = json.loads(AXES_TABLE.read_text(encoding="utf-8"))
    prose = json.loads(PROSE_TABLE.read_text(encoding="utf-8"))
    return axes, prose


def strip_prose(desc: str) -> str:
    """⛔ 剝掉整段「…」對白與 {{…}} 佔位。見 prose_markers.json 的兩則 `_…Strip`。"""
    return PLACEHOLDER_RE.sub("", QUOTE_RE.sub("", desc or ""))


# ───────────────────────────────────────────────────────────────────────────
# 實作側：從 effects 樹推導軸
# ───────────────────────────────────────────────────────────────────────────
def implemented_axes(doc: dict, axes: dict) -> tuple[set[str], list[tuple[str, str]]]:
    """回傳 (這支技能的軸, 未分類欄位 [(kind, field)])。"""
    got: set[str] = set()
    unknown: list[tuple[str, str]] = []
    fields = axes["fields"]
    by_kind = axes["byKind"]
    cond = axes["conditional"]
    ignored = axes["ignored"]

    def resolve(kind: str, field: str, value) -> list[str] | None:
        """None = 沒有人分類過它（⇒ 閘要紅）。[] = 分類過但不帶軸。"""
        bk = by_kind.get(f"{kind}.{field}")
        if bk is not None:
            return bk
        if field in cond:
            rule = cond[field]
            n = value if isinstance(value, (int, float)) else None
            return list(rule["axes"]) if (n is not None and n >= rule["minValue"]) else []
        if field in fields:
            return list(fields[field])
        if field in ignored:
            return []
        return None

    def walk(node) -> None:
        if isinstance(node, dict):
            kind = node.get("kind")
            if isinstance(kind, str):
                for f, v in node.items():
                    r = resolve(kind, f, v)
                    if r is None:
                        unknown.append((kind, f))
                    else:
                        got.update(r)
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(doc.get("effects") or [])

    # 技能文件自己的欄位
    for f in doc:
        if f in axes["topLevel"]:
            got.update(axes["topLevel"][f])
        elif f in ignored or f in fields or f in cond:
            pass
        else:
            unknown.append(("(ability)", f))

    # 被動：auras 是常駐的圈；hooks ⛔ 不是時序
    passive = doc.get("passive") or {}
    for rank in (passive.get("ranks") or []):
        for f, v in rank.items():
            if f in axes["passive"]:
                if v:
                    got.update(axes["passive"][f])
            else:
                # 被動 rank 的其餘欄位走 effects 樹同一份表（modifiers/flight/…）
                r = resolve("(passive)", f, v)
                if r is None:
                    unknown.append(("(passive)", f))
                else:
                    got.update(r)
        walk(rank.get("hooks") or [])
        walk(rank.get("auras") or [])

    # ⚠️ vfxLayers 裡的 delayMs 是一段真的等待（`godie-e008.q` 的 90ms 第二層）
    for layer in (doc.get("vfxLayers") or []):
        if isinstance(layer, dict) and layer.get("delayMs"):
            got.add("等待")

    # ⭐ 接上模板的技能磁碟上 `effects` 是**空的**（88 支裡 86 支）—— 形狀住在
    #    `template.params`。⛔ 少了這一段，那 86 支會全部被算成「沒有形狀」。
    tpl = doc.get("template")
    if isinstance(tpl, dict):
        a, u = template_param_axes((tpl.get("params") or {}).keys(), axes)
        got.update(a)
        unknown.extend((f"(template:{tpl.get('ref')})", f) for f in u)

    return got, unknown


def template_param_axes(names, axes: dict) -> tuple[set[str], list[str]]:
    """模板參數名 → 軸。回傳 (軸, 沒有人分類過的參數名)。"""
    tbl = axes["templateParams"]
    got: set[str] = set()
    unknown: list[str] = []
    for f in names:
        if f in tbl["axes"]:
            got.update(tbl["axes"][f])
        elif f in tbl["ignored"]:
            pass
        else:
            unknown.append(f)
    return got, unknown


# ───────────────────────────────────────────────────────────────────────────
# 宣稱側：從說明推導軸
# ───────────────────────────────────────────────────────────────────────────
def declared_axes(desc: str, prose: dict) -> set[str]:
    clean = strip_prose(desc)
    got: set[str] = set()
    for axis, spec in prose["markers"].items():
        text = clean
        for neg in spec.get("negative") or []:
            text = text.replace(neg, "")
        if any(re.search(p, text) for p in spec["patterns"]):
            got.add(axis)
    return got


# ───────────────────────────────────────────────────────────────────────────
# 掃描
# ───────────────────────────────────────────────────────────────────────────
def sig(axset: set[str]) -> str:
    ordered = [a for a in AXIS_ORDER if a in axset]
    return "＋".join(ordered) if ordered else "（無時序形狀）"


def scan() -> dict:
    axes, prose = load_tables()
    rows = []
    unknown_fields: Counter = Counter()
    for p in sorted(ABIL_DIR.glob("*.json")):
        if p.name == "_index.json":
            continue
        d = json.loads(p.read_text(encoding="utf-8"))
        impl, unk = implemented_axes(d, axes)
        decl = declared_axes(d.get("description") or "", prose)
        for k, f in unk:
            unknown_fields[f"{k}.{f}"] += 1
        rows.append({
            "id": d["id"],
            "name": d.get("name", ""),
            "slot": d.get("slot", ""),
            # ⛔ 前搖**不是**形狀（理由寫在 shape_axes.json 的 ignored.castTimeSec），
            #    但它是 owner 那句「動畫效果等待」的字面讀法，所以單獨記一筆給報表註腳。
            "castTimeSec": d.get("castTimeSec"),
            "template": (d.get("template") or {}).get("ref"),
            "implemented": sorted(impl),
            "declared": sorted(decl),
            "gap": sorted(decl - impl - PROSE_WEAK_AXES),
            "signature": sig(impl),
        })

    templates = []
    for p in sorted(TPL_DIR.glob("tpl-*.json")):
        t = json.loads(p.read_text(encoding="utf-8"))
        req_axes: set[str] = set()
        for r in (t.get("requires") or []):
            req_axes.update(prose["requiresAxes"].get(r, []))
        # ⭐ 模板自己**宣告得出來**的形狀 = 參數槽帶的軸 ∪ requires 帶的軸。
        #    22 個 draft 一支技能都沒接，實測形狀算不出來 —— 這一格是它們唯一的聲音。
        slot_axes, slot_unknown = template_param_axes((t.get("params") or {}).keys(), axes)
        for f in slot_unknown:
            unknown_fields[f"(template:{t['id']}).{f}"] += 1
        templates.append({
            "id": t["id"], "name": t.get("name", ""), "status": t.get("status", ""),
            "requires": t.get("requires") or [], "requiresAxes": sorted(req_axes),
            "declaredAxes": sorted(slot_axes | req_axes),
            "params": len(t.get("params") or {}), "gapScore": t.get("gapScore"),
        })

    return {"abilities": rows, "templates": templates, "unknownFields": dict(unknown_fields)}


# ───────────────────────────────────────────────────────────────────────────
# 產出
# ───────────────────────────────────────────────────────────────────────────
def render(data: dict) -> str:
    rows, templates = data["abilities"], data["templates"]
    total = len(rows)

    # 形狀群
    groups: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        groups[r["signature"]].append(r)

    # 每個模板實測產出的形狀（只有真的被引用的算得出來）
    tpl_sigs: dict[str, Counter] = defaultdict(Counter)
    for r in rows:
        if r["template"]:
            tpl_sigs[r["template"]][r["signature"]] += 1
    sig_to_tpl: dict[str, set[str]] = defaultdict(set)
    for t, c in tpl_sigs.items():
        for s in c:
            sig_to_tpl[s].add(t)
    # ⭐ 模板**實測**產出的軸（⛔ 不是它宣告得出來的）。`tpl-orbit-array` 宣告了「迴圈」，
    #    而它唯一的使用者沒有填 `rayIntervalSec` ⇒ 實測那一群裡沒有迴圈。
    #    差別很重要：「有人用而且真的跑出這條軸」和「有人用但那條軸空著」是兩種結論。
    tpl_realised: dict[str, set[str]] = defaultdict(set)
    for r in rows:
        if r["template"]:
            tpl_realised[r["template"]].update(r["implemented"])

    by_axes = {t["id"]: set(t["declaredAxes"]) for t in templates}
    unused_ids = {t["id"] for t in templates if not tpl_sigs.get(t["id"])}

    L: list[str] = []
    A = L.append
    A("# 全技能形狀掃描 —— 群 → 支數 → 有沒有模板 → 建議")
    A("")
    A("> ⛔ **這一份是產生的**（`tools/skill-templates/scan_shapes.py`）。手改會被下一次掃描寫回去。")
    A("> 知識住在 `tools/skill-templates/shape_axes.json`（實作側）與 `prose_markers.json`（宣稱側）。")
    A("> ⚠️ 刻意沒有產生日期 —— 帶時鐘的欄位會逼 `--check` 從逐位元組比對被放寬成模糊比對，")
    A("> 而一條被放寬的閘等於沒有閘。")
    A("")
    A("owner 技能模板群組 **⑨** 逐字：")
    A("")
    A("> 「以上範例技能模板請**重新掃描套用在全部技能**，檢查是否有**動畫效果等待、迴圈、持續特效**等機制，**形成新模板及套用設定**」")
    A("")

    # ── 0 一眼看完 ──
    tpl_used = sum(1 for r in rows if r["template"])
    referenced = {t for t in tpl_sigs}
    A("## 0. 一眼看完")
    A("")
    A("| | |")
    A("|---|---:|")
    A(f"| 掃到的技能 | **{total}** |")
    A(f"| 不同的形狀（群） | **{len(groups)}** |")
    A(f"| 已經接上模板的技能 | **{tpl_used}**（{tpl_used*100//total}%） |")
    A(f"| ⛔ 還沒接模板的技能 | **{total - tpl_used}** |")
    A(f"| 模板文件總數 | **{len(templates)}** |")
    A(f"| ⛔ 一支技能都沒引用的模板 | **{len(templates) - len(referenced)}** |")
    A("")

    # ── 1 形狀群 ──
    A("## 1. 形狀群 → 支數 → 有沒有模板 → 建議")
    A("")
    A("⭐ 「形狀」＝六條軸的子集合。軸的定義與**每一格欄位為什麼算數**住在 `shape_axes.json`。")
    A("")
    A("| # | 形狀（軸的組合） | 支數 | 已接模板 | 實測產出這個形狀的模板 | 建議 |")
    A("|---:|---|---:|---:|---|---|")
    for i, (s, members) in enumerate(
        sorted(groups.items(), key=lambda kv: (-len(kv[1]), kv[0])), 1
    ):
        n = len(members)
        bound = sum(1 for m in members if m["template"])
        have = sorted(sig_to_tpl.get(s, ()))
        axset = set() if s == "（無時序形狀）" else set(s.split("＋"))
        if s == "（無時序形狀）":
            advice = "⛔ 逐支確認是**真的沒有**還是**沒實作**（見第 2 節差集）"
        elif have:
            advice = f"沿用（{n - bound} 支還沒接）" if bound < n else "✅ 全部接上了"
        else:
            # ⭐ 只列**貼得最近**的那幾份：一份只宣告「路徑」的模板對每一個含路徑的群
            #    都是子集，全部列出來等於沒列（實測會列到 16 份）。取覆蓋最多軸的，最多 3 份。
            cands = [t for t in unused_ids if by_axes[t] and by_axes[t] <= axset]
            if cands:
                best = max(len(by_axes[t]) for t in cands)
                drafts = sorted(t for t in cands if len(by_axes[t]) == best)[:3]
                more = f"（另有 {len(cands) - len(drafts)} 份較不貼合）" if len(cands) > len(drafts) else ""
                advice = "⚠️ 模板已在、**0 支使用**：" + "・".join(drafts) + more
            elif n >= GROUP_TEMPLATE_THRESHOLD:
                advice = f"⛔ **缺模板**（{n} 支）"
            else:
                advice = "併進既有模板的參數"
        A(f"| {i} | {s} | **{n}** | {bound} | {'・'.join(have) or '—'} | {advice} |")
    A("")

    # ── 2 差集（⑨的價值所在）──
    A("## 2. ⭐ 宣稱 vs 實作 —— 有幾支技能在等一個不存在的模板")
    A("")
    A("**說明裡寫了、JSON 裡一格都沒有**的那幾支。宣稱側先剝掉整段 `「…」` 對白與 `{{…}}` 佔位")
    A("（第〇·六守則②，owner 2026-08-12：「「」代表角色施展技能的對白，不是真正的效果」）。")
    A("")
    A("| 軸 | 說明宣稱 | JSON 實作 | ⛔ 宣稱了但沒實作 | 這一格擋住的是什麼 |")
    A("|---|---:|---:|---:|---|")
    axis_why = {
        "等待": "延遲結算／吟唱／飛行時間 —— 躲不躲得掉",
        "迴圈": "每隔 T 秒重複 —— 排程與終止條件",
        "持續": "有期間的狀態，到期自己收掉",
        "續效特效": "特效自己的壽命／掛載／分層",
        "多段": "一次施放拆成多下（連段／連鎖）",
        "路徑": "效果沿著空間移動",
    }
    for a in AXIS_ORDER:
        d = sum(1 for r in rows if a in r["declared"])
        im = sum(1 for r in rows if a in r["implemented"])
        g = sum(1 for r in rows if a in r["gap"])
        note = axis_why[a]
        if a in PROSE_WEAK_AXES:
            note += "（⚠️ 宣稱側很弱，差集不計）"
        A(f"| {a} | {d} | {im} | **{g}** | {note} |")
    A("")

    worst = Counter()
    for r in rows:
        for a in r["gap"]:
            worst[a] += 1
    if worst:
        top_axis = worst.most_common(1)[0]
        A(f"⇒ ⭐ **最擋人的一條軸是「{top_axis[0]}」，{top_axis[1]} 支技能的說明宣稱它而 JSON 裡沒有。**")
        A("")

    # ⭐ 前搖的註腳 —— owner 那句「動畫效果等待」的字面讀法在這裡結帳，
    #    ⛔ 但它刻意不進形狀（理由在 shape_axes.json 的 ignored.castTimeSec）。
    cts = sorted(r["castTimeSec"] for r in rows if isinstance(r["castTimeSec"], (int, float)))
    if cts:
        med = cts[len(cts) // 2]
        A(f"⚠️ **前搖（`castTimeSec`）不在上表**：{len(cts)}/{total} 支有它，"
          f"{len(set(cts))} 個相異值連續分布在 {cts[0]}–{cts[-1]} 秒，中位數 {med} 秒。")
        A("它是**每一支技能都有的施法動作長度**（多半是 w3x 匯進來的），⛔ 不是作者寫下的機制 ——")
        A("算進「等待」軸的話這條軸會命中 421 支裡的 361 支，於是它分不出任何一群。")
        A("")

    for a in AXIS_ORDER:
        miss = [r for r in rows if a in r["gap"]]
        if not miss:
            continue
        A(f"<details><summary>「{a}」缺口逐支（{len(miss)} 支）</summary>")
        A("")
        A("| 技能 | 名稱 | 已接模板 | 目前形狀 |")
        A("|---|---|---|---|")
        for r in sorted(miss, key=lambda r: r["id"]):
            A(f"| `{r['id']}` | {r['name']} | {r['template'] or '—'} | {r['signature']} |")
        A("")
        A("</details>")
        A("")

    # ── 3 模板覆蓋 ──
    A("## 3. 模板覆蓋 —— 41 份文件，實際被引用的有幾份")
    A("")
    A("`宣告形狀` = 這份模板的**參數槽**與 `requires` 加起來寫得出什麼（22 個 draft 一支技能都沒接，")
    A("實測形狀算不出來 —— 這一欄是它們唯一的聲音）。`實測形狀` = 引用它的技能真的落在哪一群。")
    A("")
    A("| 模板 | 名稱 | 狀態 | 參數格 | 引用支數 | 宣告形狀 | 實測形狀 |")
    A("|---|---|---|---:|---:|---|---|")
    for t in sorted(templates, key=lambda t: (-sum(tpl_sigs[t["id"]].values()), t["id"])):
        c = tpl_sigs.get(t["id"], Counter())
        used = sum(c.values())
        shapes = "・".join(f"{s}×{n}" for s, n in c.most_common()) or "—"
        decl = sig(set(t["declaredAxes"])) if t["declaredAxes"] else "—"
        A(
            f"| `{t['id']}` | {t['name']} | {t['status']} | {t['params']} | "
            f"{'**0**' if used == 0 else used} | {decl} | {shapes} |"
        )
    A("")

    # ── 4 按擋住的支數排序（owner 的規則）──
    A("## 4. ⭐ 該做什麼 —— 按**擋住的支數**排序")
    A("")
    A("CLAUDE.md 第〇·五守則：「⛔ **不要逐支實作。** 按**擋住的支數**做機制，不是按技能順序做技能。」")
    A("⇒ 這張表的排序就是那條規則：左邊擋得多的先做。")
    A("")
    A("| 軸 | 擋住幾支 | 現成的模板 | 狀態 | 該做什麼 |")
    A("|---|---:|---|---|---|")
    for axis, cnt in sorted(
        ((a, sum(1 for r in rows if a in r["gap"])) for a in AXIS_ORDER),
        key=lambda kv: -kv[1],
    ):
        if cnt == 0:
            continue
        cands = [t for t in templates if axis in t["declaredAxes"]]
        enabled = [t for t in cands if t["status"] == "enabled"]
        used = [t for t in cands if axis in tpl_realised.get(t["id"], ())]
        if used:
            names = "・".join(f"`{t['id']}`" for t in used[:2])
            todo = f"⭐ **模板已在、而且真的跑出這條軸** ⇒ 把這 {cnt} 支接上去（改內容，⛔ 不必動引擎）"
        elif enabled:
            names = "・".join(f"`{t['id']}`" for t in enabled[:2])
            todo = f"⚠️ **模板做好了卻 0 支使用** ⇒ 先驗一支，再把這 {cnt} 支接上去"
        elif cands:
            names = "・".join(f"`{t['id']}`" for t in cands[:2])
            todo = f"⛔ **只有草稿**（0 參數格）⇒ 這 {cnt} 支在等它被做出來"
        else:
            names = "—"
            todo = f"⛔ **完全沒有模板** ⇒ {cnt} 支在等一個沒有人開始做的機制"
        status = "・".join(sorted({t["status"] for t in cands})) or "—"
        A(f"| {axis} | **{cnt}** | {names} | {status} | {todo} |")
    A("")
    built_unused = [t for t in templates if t["params"] >= 5 and not tpl_sigs.get(t["id"])]
    if built_unused:
        A(f"⚠️ **另一個方向的浪費**：有 **{len(built_unused)}** 份模板參數面已經做好"
          f"（≥5 格參數）卻**一支技能都沒引用** ——")
        A("　" + "・".join(f"`{t['id']}`({t['params']}格/{t['status']})" for t in built_unused))
        A("")
        A("⛔ 它們與上表是**同一個問題的兩半**：一邊有技能在等機制，一邊有機制在等技能。")
        A("")

    # ── 5 閘 ──
    A("## 5. 閘 —— 未分類欄位")
    A("")
    unk = data["unknownFields"]
    if unk:
        A("⛔ 下面這些欄位出現在出貨技能裡，而 `shape_axes.json` 沒有替它們做過決定：")
        A("")
        A("| 欄位 | 出現次數 |")
        A("|---|---:|")
        for k, v in sorted(unk.items(), key=lambda kv: -kv[1]):
            A(f"| `{k}` | {v} |")
    else:
        A("✅ 出貨技能裡的**每一個**欄位名都在 `shape_axes.json` 裡有決定")
        A("（帶軸，或在 `ignored` 裡帶著一個能被反駁的理由）。")
        A("")
        A("⇒ 引擎哪天多一個 `windUpSec` 而沒有人分類它，`--check` 會**紅**並指名它 ——")
        A("⛔ 不是安靜地把那一族技能算成「沒有等待」。")
    A("")
    return "\n".join(L) + "\n"


# ───────────────────────────────────────────────────────────────────────────
# 自檢（⭐ 承重的三條，⛔ 不是每個分支各一條）
# ───────────────────────────────────────────────────────────────────────────
def selftest() -> int:
    axes, prose = load_tables()
    fails: list[str] = []

    # ① 對白剝除 —— 沒有它，44-04 心臟麻痺的台詞會變成一支有 35 秒延遲的技能
    dialog = "造成傷害。「不，還不能笑，我一定要忍住……在35秒後宣布勝利吧。」"
    if declared_axes(dialog, prose):
        fails.append("① 對白沒有被剝掉：「…在35秒後…」被讀成了機制")
    if "等待" not in declared_axes("指定目標區域，1秒後將位於該區域上的所有單位拉到身旁", prose):
        fails.append("① 剝過頭：真正的「1秒後」讀不到了")

    # ② conditional —— count:1 的 delayed 逐字是「純延遲」,⛔ 不是迴圈
    one = {"id": "x", "effects": [{"kind": "delayed", "delaySec": 1, "count": 1,
                                   "shape": "single", "effects": [{"kind": "damage", "amount": 1}]}]}
    many = json.loads(json.dumps(one))
    many["effects"][0]["count"] = 7
    if "迴圈" in implemented_axes(one, axes)[0]:
        fails.append("② count:1 被算成迴圈")
    if "迴圈" not in implemented_axes(many, axes)[0]:
        fails.append("② count:7 沒有被算成迴圈")

    # ③ 覆蓋閘真的會叫（⭐ 最承重的一條：沒有它，新機制會被安靜地漏掉）
    novel = {"id": "x", "effects": [{"kind": "damage", "windUpSec": 3}]}
    if not implemented_axes(novel, axes)[1]:
        fails.append("③ 覆蓋閘瞎了：沒分類過的 windUpSec 沒有被回報")

    for f in fails:
        print("FAIL " + f, file=sys.stderr)
    print(f"selftest: {len(fails)} 條失敗" if fails else "selftest: 3/3 ok")
    return 1 if fails else 0


# ───────────────────────────────────────────────────────────────────────────
def main() -> int:
    ap = argparse.ArgumentParser(description="全技能形狀掃描器（owner 技能模板群組⑨）")
    ap.add_argument("--out", type=Path, help="markdown 產物路徑")
    ap.add_argument("--json", type=Path, help="機器可讀產物路徑")
    ap.add_argument("--check", action="store_true", help="唯讀：覆蓋閘 + 產物新鮮度，紅了回非零")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()

    if args.selftest:
        return selftest()

    data = scan()
    md = render(data)

    if args.check:
        rc = 0
        if data["unknownFields"]:
            print("⛔ shape_axes.json 沒有替下面這些欄位做過決定：", file=sys.stderr)
            for k, v in sorted(data["unknownFields"].items(), key=lambda kv: -kv[1]):
                print(f"     {k}  ×{v}", file=sys.stderr)
            print("   ⇒ 把它加進 fields / byKind（帶軸），或加進 ignored（帶一個能被反駁的理由）。",
                  file=sys.stderr)
            rc = 1
        if args.out:
            cur = args.out.read_text(encoding="utf-8") if args.out.exists() else ""
            if cur != md:
                print(f"⛔ {args.out} 過期了 —— 跑一次不帶 --check 的同一行然後 git add。", file=sys.stderr)
                rc = 1
        if rc == 0:
            print(f"✅ {len(data['abilities'])} 支技能、{len(data['templates'])} 份模板，覆蓋與新鮮度都過")
        return rc

    if args.json:
        args.json.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"wrote {args.json}")
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(md, encoding="utf-8")
        print(f"wrote {args.out}")
    if not args.out and not args.json:
        sys.stdout.write(md)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
