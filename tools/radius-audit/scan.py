#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
半徑／射程稽核 —— 把每一支技能的「範圍數字」對回它的來源，列出對不上的。

⭐ 起因（GH#548，owner 2026-08-22）：「蒼龍破範圍似乎有點太誇張了 你是不是抓錯了」。
   一支抓錯多半不是一支的事，所以這支腳本問的是**同一個問題的全體版本**。

⚠️ 票上原本的假設是「漏除 128」。⛔ 那個常數在這個 repo 裡不存在 ——
   平面換算是 `GGD_PER_WC3 = 11/600`（≈ 1/54.5），寫在
   `packages/shared/src/content/templates/expand.ts`，而這支腳本**去讀那一行**，
   ⛔ 不自己抄一份（第〇·四守則：值不要有第二個住處）。

三個檢查，⭐ 每一個的門檻都從 `content/config/` 推導，⛔ 沒有字面值：

  A) 級距 ↔ 實值漂移
     一支技能同時寫了 `radiusTier`（級距名）與一個模板半徑參數時，
     `aoe-tiers.json[radiusTier]` 必須等於 `toLen(參數)`。
     ⛔ 對不上 = 卡面說「極小」而模擬器收到別的數字（第一·五守則的鏡像：
     發生了但沒說）。

  B) 單位換算稽核（對 w3x 來源）
     以技能**編號**（`34-04`）為 join key 對回 rawcode，取來源的距離常數
     （w3u 的 `area` / `range` / DataA–D，以及 JASS 切片裡
     `PolarProjectionBJ` / `GroupEnumUnitsInRange*` 的距離），
     算 GGD 值 ÷ 來源值：
       · ≈ 11/600 → ⭐ 正常（有換算）
       · ≈ 1      → ⛔ **沒換算**，一個裸的 wc3 數字住在 GGD 欄位裡
       · ≈ 1/128  → ⛔ 用了錯的除數
     模板參數宣告 `unit: "wc3u"` 的那些**本來就是 wc3 值**，所以它們的比值
     應該是 1 —— 這支腳本知道差別，⛔ 不會把它們誤報。

  C) 場地尺度
     把展開後的**佔地**（單發＝圓；行進波動＝膠囊）對到 `aoe-tiers.json`
     最大那一級（極大）與 `map-spec.json` 的場地尺寸。
     ⛔ 這一項只排名不判對錯 —— 一支 ultimate 本來就可以很大。

⚠️ **只報告，⛔ 不自動改**。改錯半徑比範圍太大更糟（owner 2026-08-22）。

用法:
    python3 tools/radius-audit/scan.py                # 全部三項
    python3 tools/radius-audit/scan.py --only A       # 只跑一項
    python3 tools/radius-audit/scan.py --json out.json
    python3 tools/radius-audit/scan.py --selftest     # 自我驗證（不讀 content）
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CONTENT = os.path.join(ROOT, "content")
CONFIG = os.path.join(CONTENT, "config")
EXPAND_TS = os.path.join(
    ROOT, "packages", "shared", "src", "content", "templates", "expand.ts"
)
SRC = os.path.join(ROOT, "tools", "w3x-import", "out", "GoDieEX22s")

#: 名字裡帶這些字根的數字才被當成「長度」。⛔ 不要加 `speed` —— 那是 u/s 不是 u。
LENGTH_KEY = re.compile(r"(radius|range|length|width|distance|reach|aoe)", re.I)

#: 技能編號 = JASS 的 join key（`ggd-naming-layer`：名字可以改，編號不行）。
NUMBER = re.compile(r"^(\d{2}-\d{2,3})")

#: JASS 切片裡「這個數字是一段距離」的兩種寫法。
JASS_POLAR = re.compile(r"PolarProjection\w*\s*\([^,]+,\s*([0-9.]+)\s*,")
JASS_ENUM = re.compile(r"GroupEnumUnitsInRange\w*\s*\([^,]+,[^,]+,[^,]+,\s*([0-9.]+)")


def _read_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def ggd_per_wc3() -> float:
    """⭐ 讀 `expand.ts` 那一行，⛔ 不抄一份。它改了這支腳本自己跟著改。"""
    with open(EXPAND_TS, encoding="utf-8") as f:
        m = re.search(r"GGD_PER_WC3\s*=\s*([0-9.]+)\s*/\s*([0-9.]+)", f.read())
    if not m:
        raise SystemExit("找不到 expand.ts 的 GGD_PER_WC3 —— 換算常數搬家了，先修這裡")
    return float(m.group(1)) / float(m.group(2))


def to_len(wc3: float, k: float) -> float:
    return round(wc3 * k, 2)


# ---------------------------------------------------------------------------
# 讀內容
# ---------------------------------------------------------------------------


def load_templates():
    out = {}
    d = os.path.join(CONTENT, "ability-templates")
    for name in sorted(os.listdir(d)):
        if not name.endswith(".json") or name.startswith("_"):
            continue
        doc = _read_json(os.path.join(d, name))
        out[doc["id"]] = doc
    return out


def load_abilities():
    out = []
    d = os.path.join(CONTENT, "abilities")
    for name in sorted(os.listdir(d)):
        if not name.endswith(".json") or name.startswith("_"):
            continue
        out.append((name, _read_json(os.path.join(d, name))))
    return out


def content_lengths(doc, templates):
    """回傳 [(路徑, 值, 單位)]。單位是 'ggd'（已換算）或 'wc3u'（模板原值）。"""
    found = []

    def walk(node, path):
        if isinstance(node, dict):
            for k, v in node.items():
                if isinstance(v, (int, float)) and not isinstance(v, bool):
                    if LENGTH_KEY.search(k):
                        found.append((f"{path}.{k}", float(v), "ggd"))
                else:
                    walk(v, f"{path}.{k}")
        elif isinstance(node, list):
            for i, v in enumerate(node):
                walk(v, f"{path}[{i}]")

    # ⚠️ 模板參數要先切出來單獨處理 —— 它們的單位是模板宣告的，⛔ 不是 GGD。
    tpl = doc.get("template")
    body = {k: v for k, v in doc.items() if k != "template"}
    walk(body, "")
    if isinstance(tpl, dict):
        t = templates.get(tpl.get("ref"))
        for k, v in (tpl.get("params") or {}).items():
            if not isinstance(v, (int, float)) or isinstance(v, bool):
                continue
            slot = (t or {}).get("params", {}).get(k, {})
            unit = slot.get("unit")
            if unit in ("wc3u", "wc3h"):
                found.append((f"template.params.{k}", float(v), "wc3u"))
            elif LENGTH_KEY.search(k):
                found.append((f"template.params.{k}", float(v), "ggd"))
    return found


# ---------------------------------------------------------------------------
# 讀來源（w3x + JASS）
# ---------------------------------------------------------------------------


def load_source():
    """回傳 編號 -> {rawcode, w3u 常數集合, jass 常數集合}。找不到來源就整包空的。"""
    idx_path = os.path.join(SRC, "jass-spells", "INDEX.json")
    ab_path = os.path.join(SRC, "parsed", "abilities.json")
    if not (os.path.exists(idx_path) and os.path.exists(ab_path)):
        return {}
    index = _read_json(idx_path)["byRawcode"]
    abilities = _read_json(ab_path)
    by_number = {}
    for raw, meta in index.items():
        m = NUMBER.match(meta.get("nameZh") or "")
        if m:
            by_number.setdefault(m.group(1), raw)
    for raw, ab in abilities.items():
        m = NUMBER.match(ab.get("name") or "")
        if m:
            by_number.setdefault(m.group(1), raw)

    out = {}
    for number, raw in by_number.items():
        ab = abilities.get(raw, {})
        consts = set()
        for field in ("area", "range"):
            for v in (ab.get(field) or {}).values():
                if isinstance(v, (int, float)) and v > 0:
                    consts.add(round(float(v), 2))
        for _slot, per_level in (ab.get("data") or {}).items():
            for v in (per_level or {}).values():
                if isinstance(v, (int, float)) and 20 <= float(v) <= 5000:
                    consts.add(round(float(v), 2))
        jass = set()
        slice_path = os.path.join(SRC, "jass-spells", f"{raw}.j")
        if os.path.exists(slice_path):
            with open(slice_path, encoding="utf-8") as f:
                text = f.read()
            for rx in (JASS_POLAR, JASS_ENUM):
                for hit in rx.findall(text):
                    v = float(hit)
                    if 10 <= v <= 5000:
                        jass.add(round(v, 2))
        out[number] = {"rawcode": raw, "w3u": consts, "jass": jass}
    return out


# ---------------------------------------------------------------------------
# 檢查
# ---------------------------------------------------------------------------


def check_a(abilities, templates, tiers, k):
    """級距 ↔ 實值漂移。"""
    rows = []
    for fname, doc in abilities:
        tier = doc.get("radiusTier")
        if tier is None or tier not in tiers:
            continue
        want = float(tiers[tier])
        tpl = doc.get("template")
        if not isinstance(tpl, dict):
            continue
        t = templates.get(tpl.get("ref"), {})
        for name, v in (tpl.get("params") or {}).items():
            if not isinstance(v, (int, float)) or isinstance(v, bool):
                continue
            if not LENGTH_KEY.search(name):
                continue
            slot = t.get("params", {}).get(name, {})
            got = to_len(float(v), k) if slot.get("unit") == "wc3u" else float(v)
            if abs(got - want) > 0.01:
                rows.append(
                    {
                        "file": fname,
                        "name": doc.get("name"),
                        "param": name,
                        "raw": v,
                        "tier": tier,
                        "tierRadius": want,
                        "actual": got,
                        "deltaPct": round((got - want) / want * 100, 1),
                    }
                )
    return sorted(rows, key=lambda r: -abs(r["deltaPct"]))


def check_b(abilities, templates, source, k, tier_values=frozenset()):
    """單位換算稽核。回傳 (可疑, 統計)。

    ⚠️ `tier_values` 是**級距表裡的那些數字**（`aoe-tiers` + `range-tiers`）。
    一個逐位元等於級距值的長度是**從表解析來的**（第〇·四守則的正確形狀），
    ⛔ 不是一個換算失敗的殘骸 —— 它跟來源常數的比值長什麼樣完全是巧合。
    少了這一格，`rangeTier: 極大` 的 12.0 會被 1600 wc3 的來源常數配成 1/133
    而誤報成「除數用了 128」（實測 6 筆全部是這個形狀）。
    """
    rows = []
    stats = {"joined": 0, "unjoined": 0, "values": 0}
    for fname, doc in abilities:
        m = NUMBER.match(doc.get("name") or "")
        src = source.get(m.group(1)) if m else None
        if src is None:
            stats["unjoined"] += 1
            continue
        stats["joined"] += 1
        consts = sorted(src["w3u"] | src["jass"])
        if not consts:
            continue
        for path, value, unit in content_lengths(doc, templates):
            if value <= 0:
                continue
            stats["values"] += 1
            if unit == "ggd" and round(value, 2) in tier_values:
                continue
            # 找最貼近「正確換算」的來源常數，並記下它的比值。
            best = min(consts, key=lambda c: abs(value / c - (1.0 if unit == "wc3u" else k)))
            ratio = value / best
            expected = 1.0 if unit == "wc3u" else k
            verdict = None
            if abs(ratio - expected) <= expected * 0.08:
                continue  # 對得上，不報
            if unit == "ggd" and abs(ratio - 1.0) <= 0.02:
                verdict = "⛔ 沒換算（裸 wc3 數字住在 GGD 欄位）"
            elif unit == "ggd" and abs(ratio - 1 / 128) <= (1 / 128) * 0.08:
                verdict = "⛔ 除數用了 128（本 repo 是 11/600）"
            elif unit == "wc3u" and ratio <= k * 2:
                verdict = "⛔ 已經先除過一次（wc3u 槽卻放了 GGD 值）"
            if verdict:
                rows.append(
                    {
                        "file": fname,
                        "name": doc.get("name"),
                        "rawcode": src["rawcode"],
                        "path": path,
                        "value": value,
                        "unit": unit,
                        "nearestSource": best,
                        "ratio": round(ratio, 5),
                        "verdict": verdict,
                    }
                )
    return rows, stats


def footprint(doc, templates, k):
    """展開後的佔地：(前伸, 半寬, 面積)。⛔ 只有看得懂的形狀才回值。"""
    tpl = doc.get("template")
    if isinstance(tpl, dict) and tpl.get("ref") == "tpl-traveling-wave":
        t = templates.get("tpl-traveling-wave", {})
        p = tpl.get("params") or {}

        def g(name):
            v = p.get(name, t.get("params", {}).get(name, {}).get("default"))
            slot = t.get("params", {}).get(name, {})
            return to_len(float(v), k) if slot.get("unit") == "wc3u" else float(v)

        n = int(p.get("stepCount", t["params"]["stepCount"]["default"]))
        step, r = g("stepSize"), g("aoePerStep")
        reach = (n - 1) * step + r
        area = (n - 1) * step * 2 * r + math.pi * r * r
        return reach, r, area
    r = doc.get("radius")
    if isinstance(r, (int, float)) and r > 0:
        return float(r), float(r), math.pi * float(r) ** 2
    return None


def check_c(abilities, templates, tiers, spec, k):
    biggest = max(float(v) for v in tiers.values())
    grid = spec["grid"]
    arena_w = grid["colsMax"] * grid["tileSize"]
    arena_h = grid["rowsMax"] * grid["tileSize"]
    arena_area = arena_w * arena_h
    ref_area = math.pi * biggest * biggest
    rows = []
    for fname, doc in abilities:
        fp = footprint(doc, templates, k)
        if fp is None:
            continue
        reach, half, area = fp
        rows.append(
            {
                "file": fname,
                "name": doc.get("name"),
                "reach": round(reach, 2),
                "halfWidth": round(half, 2),
                "area": round(area, 1),
                "vsMaxTier": round(area / ref_area, 2),
                "vsArena": round(area / arena_area, 3),
            }
        )
    return (
        sorted(rows, key=lambda r: -r["area"]),
        {"maxTierRadius": biggest, "arena": [arena_w, arena_h], "refArea": round(ref_area, 1)},
    )


# ---------------------------------------------------------------------------


def selftest(k):
    """⭐ 一條薄守衛：三種誤判形態各造一筆假資料，確認判準真的認得出來。"""
    tiers = {"極小": 3.0, "中": 6.0}
    templates = {
        "t": {
            "id": "t",
            "params": {
                "radius": {"type": "number", "unit": "wc3u"},
                "plain": {"type": "number"},
            },
        }
    }
    ok = to_len(327, k) == 6.0
    drift = check_a(
        [("x.json", {"name": "00-01 x", "radiusTier": "極小", "template": {"ref": "t", "params": {"radius": 327}}})],
        templates,
        tiers,
        k,
    )
    src = {"00-02": {"rawcode": "AAAA", "w3u": {450.0}, "jass": set()}}
    bare, _ = check_b(
        [("y.json", {"name": "00-02 y", "radius": 450})], templates, src, k
    )
    problems = []
    if not ok:
        problems.append("toLen(327) 不是 6.0 —— 換算常數與 aoe-tiers 對不上了")
    if not drift:
        problems.append("A 沒抓到 327 對 極小(3) 的漂移")
    if not bare or "沒換算" not in bare[0]["verdict"]:
        problems.append("B 沒抓到裸 wc3 數字")
    for p in problems:
        print("⛔", p)
    print("selftest:", "PASS" if not problems else "FAIL")
    return 0 if not problems else 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=["A", "B", "C"])
    ap.add_argument("--json")
    ap.add_argument("--top", type=int, default=15)
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()

    k = ggd_per_wc3()
    if args.selftest:
        return selftest(k)

    tiers = _read_json(os.path.join(CONFIG, "aoe-tiers.json"))["radius"]
    spec = _read_json(os.path.join(CONFIG, "map-spec.json"))
    tier_values = frozenset(
        round(float(v), 2)
        for table in (tiers, _read_json(os.path.join(CONFIG, "range-tiers.json"))["range"])
        for v in table.values()
    )
    templates = load_templates()
    abilities = load_abilities()
    source = load_source()

    out = {"scale": k, "tiers": tiers}
    print(f"# 半徑稽核 —— 換算 GGD_PER_WC3 = {k:.6f}（讀自 expand.ts）")
    print(f"技能 {len(abilities)} 支 · 模板 {len(templates)} 份 · 來源編號 {len(source)} 筆\n")

    if args.only in (None, "A"):
        rows = check_a(abilities, templates, tiers, k)
        out["A"] = rows
        print(f"## A) 級距 ↔ 實值漂移 —— {len(rows)} 支")
        print("| 技能 | 參數 | 原值(wc3u) | 級距 | 級距半徑 | 實際 | 差 |")
        print("|---|---|---:|---|---:|---:|---:|")
        for r in rows:
            print(
                f"| {r['name']} | {r['param']} | {r['raw']} | {r['tier']} | "
                f"{r['tierRadius']} | {r['actual']} | {r['deltaPct']:+.1f}% |"
            )
        print()

    if args.only in (None, "B"):
        rows, stats = check_b(abilities, templates, source, k, tier_values)
        out["B"] = rows
        out["Bstats"] = stats
        print(
            f"## B) 單位換算稽核 —— 對到來源 {stats['joined']} 支 / 對不到 "
            f"{stats['unjoined']} 支 · 檢查 {stats['values']} 個長度 · 可疑 {len(rows)} 個"
        )
        if rows:
            print("| 技能 | rawcode | 欄位 | 值 | 單位 | 最近來源 | 比值 | 判定 |")
            print("|---|---|---|---:|---|---:|---:|---|")
            for r in rows:
                print(
                    f"| {r['name']} | {r['rawcode']} | {r['path']} | {r['value']} | "
                    f"{r['unit']} | {r['nearestSource']} | {r['ratio']} | {r['verdict']} |"
                )
        else:
            print("⭐ 沒有任何一支的長度落在「沒換算 / 除數用 128 / 換算兩次」上。")
        print()

    if args.only in (None, "C"):
        rows, meta = check_c(abilities, templates, tiers, spec, k)
        out["C"] = rows[: args.top]
        out["Cmeta"] = meta
        print(
            f"## C) 佔地排名（前 {args.top}）—— 最大級距半徑 {meta['maxTierRadius']}"
            f"（面積 {meta['refArea']}）· 場地 {meta['arena'][0]}×{meta['arena'][1]}"
        )
        print("| # | 技能 | 前伸 | 半寬 | 面積 | ÷極大圓 | ÷場地 |")
        print("|---:|---|---:|---:|---:|---:|---:|")
        for i, r in enumerate(rows[: args.top], 1):
            print(
                f"| {i} | {r['name']} | {r['reach']} | {r['halfWidth']} | {r['area']} | "
                f"{r['vsMaxTier']}× | {r['vsArena']:.1%} |"
            )
        print()

    if args.json:
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=1)
        print(f"（JSON → {args.json}）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
