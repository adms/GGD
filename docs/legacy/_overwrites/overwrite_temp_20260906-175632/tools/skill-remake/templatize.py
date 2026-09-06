#!/usr/bin/env python3
"""
🧱 templatize —— 把手寫的 `effects[]` 換成 `{"template":{"ref","params"}}`（GH#993 Scope 3）。

> owner 2026-08-05：「我**最推崇的方案[模板化/模組化]**　不是到處改改改」

⭐ 這一支是**正規化器**，⛔ 不是產生器：它只在「一支手寫技能與某一份模板展開出來的
東西**逐位元相同**」的時候動那一份文件；差一格參數就**不轉**，並把差在哪裡印出來。

── ⭐ 三條它自己守的規矩 ─────────────────────────────────────────────────────
① **先驗鑰匙再同步**（第〇·六守則：`h02u` 的 W/E 互換被同步器放大成整支技能消失）：
   每一份文件的 `id` 要等於檔名、全樹唯一；`name` 前綴的 JASS 編號（`xx-01`→Q …
   `xx-00`→PASSIVE · `xx-002`→EX）要與 `slot` 一致、同一隻英雄的編號不可重複。
   驗不過的那一格 **⛔ 不轉，指名它**。
② **產物不動**（第零守則「改產物等於沒改」）：`skillremake:json` 認領的那 90 份
   （`tools/parallel-gates/sync-io.json` 的 writes，⛔ 不是手寫名單）一律跳過 ——
   要轉它們得改 `tools/skill-remake/batch1.py` 的來源列。
③ **只轉逐位元等價的**：每一族的比對規則寫在 `MATCHERS`，它們是**提案**；
   真正的裁判是 `packages/shared/src/content/templatizeEquivalence.test.ts` ——
   它拿**出貨的** `expand()` ＋ `mergeExpansion()` ＋ `zAbilityDoc` 把每一支重新展開，
   與帳本裡的「轉換前」逐位元比對。⚠️ 所以這裡的 Python 比對**不是**第二份展開器：
   它只負責「要不要提案」，答對答錯都由 TS 那一邊定案。

── 帳本 ──────────────────────────────────────────────────────────────────────
`tools/skill-remake/templatize-ledger.json`：每一支被轉的技能記 `ref` / `params` /
`before`（轉換前的行為欄位：castType / effects / radius / range / castTimeSec /
targetsEnemies / innateKind / passive / marks）。它是**等價閘的證據**，
也是 `--revert` 的退路（第零守則：覆蓋之前先留一份）。

用法：
  python3 tools/skill-remake/templatize.py                 # dry-run：只印計畫
  python3 tools/skill-remake/templatize.py --apply         # 寫檔 ＋ 更新帳本
  python3 tools/skill-remake/templatize.py --apply --only godie-e00n.ex,godie-e00n.q
  python3 tools/skill-remake/templatize.py --exclude godie-o02w.q,…   # 別條 lane 的檔
  python3 tools/skill-remake/templatize.py --revert godie-e00n.ex      # 從帳本還原
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
from collections import Counter, defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ABIL_DIR = os.path.join(ROOT, "content", "abilities")
TPL_DIR = os.path.join(ROOT, "content", "ability-templates")
SYNC_IO = os.path.join(ROOT, "tools", "parallel-gates", "sync-io.json")
LEDGER_DEFAULT = os.path.join(ROOT, "tools", "skill-remake", "templatize-ledger.json")

#: 與 `templates/expand.ts` 的 `GGD_PER_WC3 = 11 / 600` 同一個常數（⛔ 這裡不抄第二個值）。
GGD_PER_WC3 = 11 / 600

#: 展開器會**整格覆蓋**的文件層鍵（`expand.ts` 的 `EXPANDED_KEYS`）＋ `range`
#: （它在 ExpandResult 上，⛔ 但不在 EXPANDED_KEYS —— 見報告的「缺的模板參數」）。
BEHAVIOUR_KEYS = (
    "castType",
    "effects",
    "radius",
    "range",
    "castTimeSec",
    "targetsEnemies",
    "innateKind",
    "passive",
    "marks",
)

#: `proxy-fanout` 的狀態下拉 → 節點上的機制欄位（`expand.ts` 的 `CC_MECHANIC`）。
CC_MECHANIC = {
    "root": {"root": True},
    "burnstun": {"stun": True},
    "slow30": {"moveSpeedMult": 0.7},
}

DAMAGE_TYPES = ("magic", "physical", "true")

#: JASS 編號的尾碼 → slot（記憶 `ggd-ability-numbering`：xx-00 天生 / xx-01..04 QWER / xx-002 EX）。
NUMBER_TO_SLOT = {"00": "PASSIVE", "01": "Q", "02": "W", "03": "E", "04": "R", "002": "EX"}
NAME_RE = re.compile(r"^(\d{2})-(\d{2,3})\s")


def round2_js(x: float) -> float:
    """JS 的 `Math.round(x * 100) / 100`（半數**往上**，⛔ 不是 Python 的銀行家捨入）。"""
    return math.floor(x * 100 + 0.5) / 100


def to_wc3u(ggd: float) -> float | None:
    """GGD 長度 → 模板 `wc3u` 槽的值；⭐ 只在 `toLen()` 能**逐位元**回到同一個 GGD 值時才回傳。"""
    cand = round2_js(ggd / GGD_PER_WC3)
    return cand if round2_js(cand * GGD_PER_WC3) == ggd else None


def load_json(path: str):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def dump_json(path: str, doc) -> None:
    # ⭐ 與 repo 裡既有文件逐位元同一種排版（indent=2、非 ASCII 原樣、結尾換行）——
    #   實測三份文件 round-trip 逐位元相同，所以 diff 只會出現在真的改了的那幾行。
    with open(path, "w", encoding="utf-8") as f:
        f.write(json.dumps(doc, ensure_ascii=False, indent=2) + "\n")


# ── 產物與模板 ────────────────────────────────────────────────────────────────


def product_ids() -> set[str]:
    """`skillremake:json` 認領的技能 id —— 從量出來的 sync-io.json 讀，⛔ 不手寫名單。"""
    out: set[str] = set()
    for step in load_json(SYNC_IO)["steps"]:
        if (step.get("name") or step.get("id")) != "skillremake:json":
            continue
        for w in step.get("writes", []):
            if w.startswith("content/abilities/") and not w.endswith("_index.json"):
                out.add(os.path.basename(w)[:-5])
    return out


def templates() -> dict[str, dict]:
    out = {}
    for f in sorted(os.listdir(TPL_DIR)):
        if f.endswith(".json") and not f.startswith("_"):
            out[f[:-5]] = load_json(os.path.join(TPL_DIR, f))
    return out


def slot_ok(tpl: dict, name: str, value) -> bool:
    """`num()` 的範圍檢查（min/max）—— 超界的提案在 TS 那邊一定展不開，⛔ 不要提。"""
    s = tpl["params"].get(name)
    if s is None:
        return False
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if s.get("min") is not None and value < s["min"]:
            return False
        if s.get("max") is not None and value > s["max"]:
            return False
    if s.get("type") == "enum" and value not in s.get("values", []):
        return False
    return True


# ── 鑰匙 ──────────────────────────────────────────────────────────────────────


def verify_keys(docs: dict[str, dict]) -> dict[str, str]:
    """回傳 {id: 為什麼這把鑰匙不可信}。⭐ 空 dict = 全部自洽。"""
    bad: dict[str, str] = {}
    seen_numbers: dict[str, dict[str, str]] = defaultdict(dict)  # hero → number → id
    for stem, doc in docs.items():
        aid = doc.get("id")
        if aid != stem:
            bad[stem] = f"id「{aid}」≠ 檔名「{stem}」"
            continue
        m = NAME_RE.match(str(doc.get("name", "")))
        if not m:
            continue  # 沒有 JASS 編號的（sela/thorne/zombie…）不在這條鑰匙的範圍
        hero, num = m.group(1), m.group(2)
        want = NUMBER_TO_SLOT.get(num)
        if want is None:
            bad[stem] = f"編號尾碼「{num}」不是 00/01–04/002"
            continue
        if doc.get("slot") != want:
            bad[stem] = f"編號 {hero}-{num} 該是 {want}，文件 slot 是 {doc.get('slot')}"
            continue
        champ = stem.rsplit(".", 1)[0]
        other = seen_numbers[champ].get(num)
        if other is not None:
            bad[stem] = f"同一隻英雄兩格都是 {hero}-{num}（另一格 {other}）"
            bad[other] = f"同一隻英雄兩格都是 {hero}-{num}（另一格 {stem}）"
        seen_numbers[champ][num] = stem
    return bad


# ── 比對器（提案；⛔ 不是展開器）─────────────────────────────────────────────


def _keys_exactly(node: dict, keys: set[str]) -> bool:
    return set(node.keys()) == keys


def _damage_node(n) -> bool:
    return (
        isinstance(n, dict)
        and n.get("kind") == "damage"
        and _keys_exactly(n, {"kind", "damageType", "amount"})
        and n.get("damageType") in DAMAGE_TYPES
        and isinstance(n.get("amount"), dict)
    )


def _common_reject(doc: dict, emits_targets) -> str | None:
    """每一族都適用的「差一格就不轉」。`emits_targets`：這一族展開出來的 targetsEnemies（None = 不發）。"""
    if "innateKind" in doc:
        # ⛔ mergeExpansion 會把文件層 innateKind 整格刪掉（EXPANDED_KEYS），而 zAbilityDoc 又
        #    要求 PASSIVE+active 的文件 effects 非空 ⇒ 兩道門都關著（見報告「缺的模板參數」）。
        return "innateKind：merge 會刪掉它、schema 又要求 active 的 effects 非空"
    for k in ("passive", "marks"):
        if k in doc:
            return f"文件層有 {k}：merge 會整格刪掉，展開又不發它"
    have = doc.get("targetsEnemies")
    if emits_targets is None and have is not None:
        return f"targetsEnemies:{json.dumps(have)} 會被 merge 抹掉（這一族不發它）"
    if emits_targets is not None and have is not emits_targets:
        return f"targetsEnemies 文件 {json.dumps(have)} ≠ 這一族發的 {json.dumps(emits_targets)}"
    return None


def _cast_time(tpl: dict, doc: dict, params: dict) -> str | None:
    """`castTimeSec`：沿用出貨 71/79 位採用者的慣例（文件與 params 同一個值）。超過槽上界就不轉。"""
    if "castTimeSec" not in doc:
        return None
    v = doc["castTimeSec"]
    if not slot_ok(tpl, "castTimeSec", v):
        return f"castTimeSec {v} 超出槽的範圍"
    params["castTimeSec"] = v
    return None


def m_buff_self(tpl: dict, doc: dict):
    if doc.get("castType") != "self":
        return None, None
    eff = doc.get("effects") or []
    if len(eff) != 1 or eff[0].get("kind") != "applyBuff":
        return None, None
    n = eff[0]
    if not _keys_exactly(n, {"kind", "modifiers", "duration"}):
        return None, f"applyBuff 多了鍵：{sorted(set(n) - {'kind', 'modifiers', 'duration'})}"
    if not isinstance(n["modifiers"], list) or not slot_ok(tpl, "duration", n["duration"]):
        return None, f"duration {n['duration']} 超出槽的範圍"
    if "radius" in doc:
        return None, "文件層有 radius：merge 會刪掉"
    r = _common_reject(doc, None)
    if r:
        return None, r
    params = {"duration": n["duration"], "modifiers": n["modifiers"]}
    r = _cast_time(tpl, doc, params)
    if r:
        return None, r
    return params, None


def _single_damage(doc: dict):
    eff = doc.get("effects") or []
    if len(eff) != 1 or not _damage_node(eff[0]):
        return None
    return eff[0]


def m_single_strike(tpl: dict, doc: dict):
    if doc.get("castType") != "targeted":
        return None, None
    d = _single_damage(doc)
    if d is None:
        return None, None
    if "radius" in doc:
        return None, "targeted 卻有 radius：merge 會刪掉"
    r = _common_reject(doc, True)
    if r:
        return None, r
    params = {"damage": d["amount"], "damageType": d["damageType"]}
    r = _cast_time(tpl, doc, params)
    if r:
        return None, r
    return params, None


def m_instant_blast(tpl: dict, doc: dict):
    if doc.get("castType") != "ground" or "radius" not in doc:
        return None, None
    d = _single_damage(doc)
    if d is None:
        return None, None
    wc3 = to_wc3u(doc["radius"])
    if wc3 is None or not slot_ok(tpl, "radius", wc3):
        return None, f"radius {doc['radius']} 換不回同一個 wc3u（或超出槽的範圍）"
    r = _common_reject(doc, True)
    if r:
        return None, r
    params = {"radius": wc3, "damage": d["amount"], "damageType": d["damageType"]}
    r = _cast_time(tpl, doc, params)
    if r:
        return None, r
    return params, None


def m_proxy_fanout(tpl: dict, doc: dict):
    if doc.get("castType") != "ground" or "radius" not in doc:
        return None, None
    eff = doc.get("effects") or []
    if len(eff) != 2:
        return None, None
    dmg = next((n for n in eff if isinstance(n, dict) and n.get("kind") == "damage"), None)
    st = next((n for n in eff if isinstance(n, dict) and n.get("kind") == "applyStatus"), None)
    if dmg is None or st is None:
        return None, None
    if not _damage_node(dmg):
        return None, "damage 節點多了鍵"
    sid = st.get("statusId")
    mech = CC_MECHANIC.get(sid)
    if mech is None:
        return None, f"statusId「{sid}」不在 proxy-fanout 的下拉（root/burnstun/slow30）"
    want = {"kind": "applyStatus", "statusId": sid, "duration": st.get("duration"), **mech}
    if st != want:
        return None, f"applyStatus 節點 ≠ 這一族發的 {json.dumps(want, ensure_ascii=False)}"
    if not slot_ok(tpl, "statusDurationSec", st["duration"]):
        return None, f"狀態時長 {st['duration']} 超出槽的範圍"
    wc3 = to_wc3u(doc["radius"])
    if wc3 is None or not slot_ok(tpl, "radius", wc3):
        return None, f"radius {doc['radius']} 換不回同一個 wc3u（或超出槽的範圍）"
    r = _common_reject(doc, True)
    if r:
        return None, r
    params = {
        "radius": wc3,
        "damage": dmg["amount"],
        "damageType": dmg["damageType"],
        "statusId": sid,
        "statusDurationSec": st["duration"],
    }
    r = _cast_time(tpl, doc, params)
    if r:
        return None, r
    return params, None


def m_blink_strike(tpl: dict, doc: dict):
    if doc.get("castType") != "targeted":
        return None, None
    eff = doc.get("effects") or []
    if len(eff) != 1 or eff[0].get("kind") != "blink":
        return None, None
    b = eff[0]
    if not _keys_exactly(b, {"kind", "shape", "to", "applyTo", "stopShortUnits", "onArrive"}):
        return None, "blink 節點的鍵集合 ≠ 這一族發的"
    if b["shape"] != "single" or b["to"] != "targetUnit" or b["applyTo"] != "self":
        return None, "blink 不是 single/targetUnit/self"
    arr = b["onArrive"]
    if (
        not isinstance(arr, list)
        or len(arr) != 2
        or arr[0] != {"kind": "spawnVfx", "vfxId": arr[0].get("vfxId"), "at": "point"}
        or not _damage_node(arr[1])
    ):
        return None, "onArrive ≠ [spawnVfx@point, damage]"
    if "range" not in doc or not slot_ok(tpl, "range", doc["range"]):
        return None, "range 缺席或超出槽的範圍"
    if not slot_ok(tpl, "stopShortUnits", b["stopShortUnits"]):
        return None, "stopShortUnits 超出槽的範圍"
    r = _common_reject(doc, True)
    if r:
        return None, r
    params = {
        "range": doc["range"],
        "stopShortUnits": b["stopShortUnits"],
        "damage": arr[1]["amount"],
        "damageType": arr[1]["damageType"],
        "arriveVfxId": arr[0]["vfxId"],
    }
    r = _cast_time(tpl, doc, params)
    if r:
        return None, r
    return params, None


def m_drain_leech(tpl: dict, doc: dict):
    if doc.get("castType") != "targeted":
        return None, None
    eff = doc.get("effects") or []
    kinds = sorted(n.get("kind") for n in eff if isinstance(n, dict))
    if kinds != ["damage", "dot", "heal"]:
        return None, None
    dmg = next(n for n in eff if n.get("kind") == "damage")
    heal = next(n for n in eff if n.get("kind") == "heal")
    dot = next(n for n in eff if n.get("kind") == "dot")
    amt = dmg.get("amount")
    if not _damage_node(dmg) or not isinstance(amt, dict):
        return None, "damage 節點多了鍵"
    ratios = amt.get("ratios")
    if set(amt) != {"damageTier", "ratios"} or not (
        isinstance(ratios, list) and len(ratios) == 1 and set(ratios[0]) == {"stat", "coeff"} and ratios[0]["stat"] == "ap"
    ):
        return None, "damage.amount 不是 {damageTier, ratios:[ap]}"
    if heal != {"kind": "heal", "amount": {"flat": heal.get("amount", {}).get("flat")}, "applyTo": "self"}:
        return None, "heal 節點 ≠ {amount.flat, applyTo:self}"
    want_dot = {
        "kind": "dot",
        "damageType": dmg["damageType"],
        "amountPerTick": amt,
        "intervalSec": dot.get("intervalSec"),
        "durationSec": dot.get("durationSec"),
    }
    if "stacking" in dot:
        want_dot["stacking"] = dot["stacking"]
    if dot != want_dot:
        return None, "dot 節點 ≠ 這一族發的（同傷害型別、同級距、同係數）"
    for name, v in (
        ("apRatio", ratios[0]["coeff"]),
        ("leechFlat", heal["amount"]["flat"]),
        ("intervalSec", dot["intervalSec"]),
        ("durationSec", dot["durationSec"]),
        ("damageTier", amt["damageTier"]),
    ):
        if not slot_ok(tpl, name, v):
            return None, f"{name} {v} 超出槽的範圍"
    r = _common_reject(doc, True)
    if r:
        return None, r
    params = {
        "damageTier": amt["damageTier"],
        "apRatio": ratios[0]["coeff"],
        "damageType": dmg["damageType"],
        "leechFlat": heal["amount"]["flat"],
        "intervalSec": dot["intervalSec"],
        "durationSec": dot["durationSec"],
    }
    if "stacking" in dot:
        params["stacking"] = dot["stacking"]
    r = _cast_time(tpl, doc, params)
    if r:
        return None, r
    return params, None


def m_life_manipulate(tpl: dict, doc: dict):
    eff = doc.get("effects") or []
    if len(eff) != 1 or eff[0].get("kind") != "restore":
        return None, None
    n = eff[0]
    if "applyTo" not in n:
        # ⛔ `applyTo` 是必填槽（有預設）⇒ 這一族**永遠**發它；文件沒寫就不是逐位元相同。
        return None, "restore 沒有 applyTo，而這一族永遠發 applyTo（預設 target）"
    if not _keys_exactly(n, {"kind", "healthPct", "applyTo"} | ({"manaPct"} if "manaPct" in n else set())):
        return None, "restore 節點的鍵集合 ≠ 這一族發的"
    want_cast = "self" if n["applyTo"] == "self" else "targeted"
    if doc.get("castType") != want_cast:
        return None, f"castType {doc.get('castType')} ≠ applyTo 推出來的 {want_cast}"
    r = _common_reject(doc, False)
    if r:
        return None, r
    params = {"healthPct": n["healthPct"], "applyTo": n["applyTo"]}
    if "manaPct" in n:
        params["manaPct"] = n["manaPct"]
    r = _cast_time(tpl, doc, params)
    if r:
        return None, r
    return params, None


#: 提案順序 ＝ 「已有採用者多的先」——同一個形狀兩份模板都對得上時，接**已經有客戶的那一份**
#: （報告 §2：`ground-nova` 形狀對而語意不對，那 12 支的正解是 21 支在用的 `single-strike`）。
MATCHERS = (
    ("tpl-buff-self", m_buff_self),
    ("tpl-single-strike", m_single_strike),
    ("tpl-instant-blast", m_instant_blast),
    ("tpl-proxy-fanout", m_proxy_fanout),
    ("tpl-blink-strike", m_blink_strike),
    ("tpl-drain-leech", m_drain_leech),
    ("tpl-life-manipulate", m_life_manipulate),
)


# ── 主流程 ────────────────────────────────────────────────────────────────────


def hand_written(doc: dict) -> bool:
    t = doc.get("template")
    return (t is None or t == {}) and bool(doc.get("effects"))


def shape_of(doc: dict) -> str:
    kinds: list[str] = []

    def walk(nodes):
        if not isinstance(nodes, list):
            return
        for n in nodes:
            if not isinstance(n, dict):
                continue
            if isinstance(n.get("kind"), str):
                kinds.append(n["kind"])
            for v in n.values():
                if isinstance(v, list):
                    walk(v)

    walk(doc.get("effects") or [])
    c = Counter(kinds)
    return " + ".join(f"{k}×{n}" if n > 1 else k for k, n in sorted(c.items()))


def with_template(doc: dict, ref: str, params: dict) -> dict:
    """`effects` 清空、`template` 插在它後面（與出貨採用者同一個鍵序）。"""
    out = {}
    for k, v in doc.items():
        if k == "template":
            continue
        out[k] = [] if k == "effects" else v
        if k == "effects":
            out["template"] = {"ref": ref, "params": params}
    if "template" not in out:
        out["effects"] = []
        out["template"] = {"ref": ref, "params": params}
    return out


def plan(args):
    tpls = templates()
    products = product_ids()
    exclude = set(filter(None, (args.exclude or "").split(",")))
    only = set(filter(None, (args.only or "").split(",")))
    docs = {
        f[:-5]: load_json(os.path.join(ABIL_DIR, f))
        for f in sorted(os.listdir(ABIL_DIR))
        if f.endswith(".json") and f != "_index.json"
    }
    bad_keys = verify_keys(docs)
    proposals: list[tuple[str, str, dict]] = []
    skipped: dict[str, list[tuple[str, str]]] = defaultdict(list)  # reason-bucket → [(id, detail)]
    for stem, doc in docs.items():
        if not hand_written(doc):
            continue
        if only and stem not in only:
            continue
        if stem in products:
            skipped["產物（skillremake:json）"].append((stem, "改 tools/skill-remake/batch1.py 的來源列"))
            continue
        if stem in exclude:
            skipped["柵欄外（--exclude）"].append((stem, ""))
            continue
        if stem in bad_keys:
            skipped["🔑 鑰匙驗不過"].append((stem, bad_keys[stem]))
            continue
        near: list[str] = []
        hit = None
        for ref, fn in MATCHERS:
            tpl = tpls.get(ref)
            if tpl is None or tpl.get("status") != "enabled":
                continue
            params, why = fn(tpl, doc)
            if params is not None:
                hit = (ref, params)
                break
            if why:
                near.append(f"{ref}: {why}")
        if hit:
            proposals.append((stem, hit[0], hit[1]))
        elif near:
            skipped["差一格（形狀對、位元不對）"].append((stem, " ｜ ".join(near)))
        else:
            skipped["沒有模板發這個形狀"].append((stem, shape_of(doc)))
    return docs, proposals, skipped, bad_keys


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true", help="真的寫檔（預設 dry-run）")
    ap.add_argument("--only", help="只處理這幾支（逗號分隔）")
    ap.add_argument("--exclude", help="跳過這幾支（逗號分隔；別條 lane 的檔）")
    ap.add_argument("--revert", help="從帳本還原這幾支（逗號分隔）")
    ap.add_argument("--ledger", default=LEDGER_DEFAULT)
    args = ap.parse_args(argv)

    ledger = load_json(args.ledger) if os.path.exists(args.ledger) else {
        "schema": "templatize-ledger@1",
        "note": (
            "⭐ GH#993 templatize 的帳本：每一支被轉的技能記 ref/params 與轉換前的行為欄位。"
            "它是 templatizeEquivalence.test.ts 的證據，⛔ 不是第二份技能資料 —— 改技能請改 content/。"
        ),
        "entries": {},
    }

    if args.revert:
        for stem in filter(None, args.revert.split(",")):
            e = ledger["entries"].get(stem)
            if e is None:
                print(f"⛔ 帳本裡沒有 {stem}")
                return 2
            path = os.path.join(ABIL_DIR, f"{stem}.json")
            doc = load_json(path)
            doc.pop("template", None)
            for k in BEHAVIOUR_KEYS:
                doc.pop(k, None)
            # ⭐ 行為欄位放回原來的位置：重建鍵序（castType… 在 effects 前，與出貨文件一致）
            restored = {}
            for k, v in doc.items():
                restored[k] = v
                if k == "maxRank" and "castType" in e["before"]:
                    pass
            restored.update(e["before"])
            dump_json(path, restored)
            del ledger["entries"][stem]
            print(f"↩︎ {stem} 還原（{e['ref']}）")
        dump_json(args.ledger, ledger)
        return 0

    docs, proposals, skipped, bad_keys = plan(args)
    by_ref = Counter(ref for _, ref, _ in proposals)
    print(f"🧱 templatize —— 提案 {len(proposals)} 支（{'寫檔' if args.apply else 'dry-run'}）")
    for ref, n in by_ref.most_common():
        print(f"   {n:3d}  {ref}")
    for stem, ref, params in proposals:
        print(f"   ✓ {stem:24s} → {ref}  {json.dumps(params, ensure_ascii=False)}")
    for bucket, rows in skipped.items():
        print(f"\n⏭ {bucket}：{len(rows)} 支")
        for stem, detail in rows:
            print(f"   · {stem:24s} {detail}")
    if bad_keys:
        print(f"\n🔑 全樹鑰匙驗不過的文件：{len(bad_keys)}（⛔ 全部不轉）")
        for stem, why in sorted(bad_keys.items()):
            print(f"   · {stem}: {why}")

    if not args.apply:
        return 0
    for stem, ref, params in proposals:
        doc = docs[stem]
        before = {k: doc[k] for k in BEHAVIOUR_KEYS if k in doc}
        ledger["entries"][stem] = {"ref": ref, "params": params, "before": before}
        dump_json(os.path.join(ABIL_DIR, f"{stem}.json"), with_template(doc, ref, params))
    ledger["entries"] = dict(sorted(ledger["entries"].items()))
    dump_json(args.ledger, ledger)
    print(f"\n✅ 寫了 {len(proposals)} 份文件 ＋ 帳本 {os.path.relpath(args.ledger, ROOT)}（{len(ledger['entries'])} 筆）")
    print("   下一步：npx vitest run packages/shared/src/content/templatizeEquivalence.test.ts")
    return 0


if __name__ == "__main__":
    sys.exit(main())
