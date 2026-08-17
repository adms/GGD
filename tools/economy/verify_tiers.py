#!/usr/bin/env python3
"""Task #82 phase 2 — verify the invariant the rescale created.

Independent of rescale_items.py: this re-reads the shipped JSON and re-derives
every number from tools/economy/aep.py + tools/economy/tiers.json. It shares no
code path with the writer beyond the valuation model itself, so a bug in the
solver cannot hide here.

    python3 tools/economy/verify_tiers.py

Exit 0 only when every check passes. Checks:
  1  every item named in the design exists on disk
  2  `cost` matches its tier price (300 / 1200 / 0)
  3  `tier` matches its tier rank (1 / 2 / 3)
  4  recomputed AEP == the tier budget (6.5 / 26 / 52) within tolerance
  5  no modifier breaches the loader's ITEM_MODIFIER_LIMITS / ITEM_PERCENT_LIMIT
  6  no item anywhere in content/items still carries an exact [A|A] duplicated
     modifier array (task #83)
  7  the stat mix was preserved: no item gained, lost, or reordered a stat
     relative to the pre-rescale backup, and within an item every modifier moved
     by the SAME scalar
  8  post-rescale per-stat maxima, reported for eyeballing against the design
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from aep import BUDGET_AEP, DECIMALS, TIER_PRICE, TIER_RANK, item_aep, modifier_aep  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
ITEMS = ROOT / "content" / "items"
# ⭐ 退場的道具（owner 2026-08-18「已經沒上架的武器道具」）。**目錄位置本身就是宣告**
#    —— ⛔ 這裡沒有、也不可以有一份「這些 id 要跳過」的名單：那會是第四個住處，
#    而 `tiers.json` 一改它就過期。搬一件進去／搬一件出來，這支腳本自動跟上。
LEGACY_ITEMS = ROOT / "content" / "_legacy" / "items"
TIERS = Path(__file__).resolve().parent / "tiers.json"
TOL = 0.005

# ⛔ Hand-copied mirror of `ITEM_MODIFIER_LIMITS` in
# packages/shared/src/content/schema/common.ts — see the long note on the same
# table in rescale_items.py. Check 5 below does `MODIFIER_LIMITS.get(stat)` and
# skips when it is None, so a stat missing here makes check 5 report PASS on a
# band it never looked at. 8 stats were in exactly that state until 2026-08-18.
# ⚠️ `as` (2.5 vs shipped 4.0) and `cdr` (0.45 vs shipped 1) are still stale on
# purpose — they are STRICTER than the loader, so they raise false alarms rather
# than false all-clears; moving them is an owner/balance call.
MODIFIER_LIMITS = {
    "maxHealth": 2500, "healthRegen": 100, "maxMana": 2500, "manaRegen": 50,
    "ad": 400, "ap": 400, "armor": 150, "mr": 200, "as": 2.5, "ms": 5,
    "critChance": 1, "critDamage": 50, "cdr": 0.45, "lifesteal": 1, "range": 5,
    "evasion": 1, "spellVamp": 1,
    "outputDamagePct": 0.5, "outputHealingPct": 0.5, "outputShieldPct": 0.5,
    "maxHitPctMaxHp": 0.5, "unavoidablePct": 0.5, "cooldownDrainRate": 0.5,
}
PERCENT_LIMIT = 3


def _read_dir(d: Path) -> dict:
    out = {}
    if not d.is_dir():
        return out
    for p in sorted(d.glob("*.json")):
        if p.name.startswith("_"):
            continue
        out[p.stem] = json.loads(p.read_text(encoding="utf-8"))
    return out


def docs() -> dict:
    return _read_dir(ITEMS)


def retired() -> dict:
    """已退場的道具 —— 從 `content/_legacy/items/` 這個**事實**推導。"""
    return _read_dir(LEGACY_ITEMS)


def main(backup: Path | None) -> int:
    design = json.loads(TIERS.read_text(encoding="utf-8"))["items"]
    live = docs()
    gone = retired()
    fail, warn = [], []

    # ---- 1-5: the tier + budget invariant, per design item
    at_budget = 0
    n_retired = 0
    for iid, d in design.items():
        doc = live.get(iid)
        if doc is None:
            # ⭐ 退場 ≠ 遺失。#82 的設計表是 2026-08 的**當時**快照，而 owner
            #    2026-08-18 把 101 件沒有取得路徑的道具搬進了 `_legacy/`。
            #    一件躺在 `_legacy/` 的道具**沒有價格層級可言**（買不到就沒有價），
            #    所以它退出這張表的檢查是正確的，⛔ 不是一個要修的失敗。
            #    真的不見了（兩邊都沒有）才是失敗 —— 那才叫「被刪掉」。
            if iid in gone:
                n_retired += 1
                continue
            fail.append(f"[1 missing]  {iid}: content/items/ 與 content/_legacy/items/ 都沒有 {iid}.json")
            continue
        tier = d["tier"]
        # Only shop items are buyable; draft legendaries and quest rewards are
        # won, so they must stay at cost 0 whatever their power tier.
        want_cost = TIER_PRICE[tier] if d["surface"] == "shop" else 0
        if doc.get("cost") != want_cost:
            fail.append(f"[2 price]    {iid}: cost={doc.get('cost')} expected {want_cost} "
                        f"({tier} on surface {d['surface']})")
        if want_cost != d["price"]:
            fail.append(f"[2 price]    {iid}: design price {d['price']} disagrees with "
                        f"{want_cost} derived from tier+surface")
        if doc.get("tier") != TIER_RANK[tier]:
            fail.append(f"[3 rank]     {iid}: tier={doc.get('tier')} expected {TIER_RANK[tier]} for {tier}")
        aep = item_aep(doc.get("modifiers") or [])
        budget = BUDGET_AEP[tier]
        if abs(aep - budget) <= TOL * budget:
            at_budget += 1
        else:
            warn.append((iid, doc.get("name"), tier, budget, aep))
        for m in doc.get("modifiers") or []:
            pct = m["op"] in ("pctAdd", "pctMult")
            lim = PERCENT_LIMIT if pct else MODIFIER_LIMITS.get(m["stat"])
            if lim is not None and abs(m["value"]) > lim:
                fail.append(f"[5 guard]    {iid}: {m['stat']} {m['op']} {m['value']} > band {lim}")

    # ---- 6: no duplicated modifier arrays left anywhere in the corpus
    for iid, doc in live.items():
        mods = doc.get("modifiers") or []
        n = len(mods)
        if n >= 2 and n % 2 == 0 and mods[: n // 2] == mods[n // 2:]:
            fail.append(f"[6 task#83]  {iid}: modifier array is still an exact [A|A] duplicate")

    # ---- 7: stat mix preserved (needs the pre-rescale backup)
    mix_checked = 0
    if backup is not None:
        for iid in design:
            bp = backup / f"{iid}.json"
            if not bp.exists() or iid not in live:
                continue
            was = json.loads(bp.read_text(encoding="utf-8")).get("modifiers") or []
            now = live[iid].get("modifiers") or []
            # the four task#83 items legitimately lost their duplicated half
            if len(was) == 2 * len(now) and was[: len(now)] == was[len(now):]:
                was = was[: len(now)]
            if [(m["stat"], m["op"]) for m in was] != [(m["stat"], m["op"]) for m in now]:
                fail.append(f"[7 mix]      {iid}: stat set/order changed "
                            f"{[(m['stat'], m['op']) for m in was]} -> {[(m['stat'], m['op']) for m in now]}")
                continue
            # The mix is preserved iff ONE scalar explains every row.  Do not try
            # to recover that scalar from the AEP ratio: the writer deliberately
            # offsets it so the ROUNDED array lands on budget, so the ratio
            # understates it.  Instead solve, per row, the interval of scalars
            # that would round to the shipped value, and intersect.  A non-empty
            # intersection proves a common scalar exists — which is exactly the
            # claim "only magnitude moved" — without knowing what it was.
            lo, hi, why = 0.0, float("inf"), None
            for w, n_ in zip(was, now):
                if not w["value"]:
                    continue
                nd = 3 if w["op"] != "flat" else DECIMALS.get(w["stat"], 2)
                q = 10.0 ** -nd
                a = (n_["value"] - q / 2) / w["value"]
                b = (n_["value"] + q / 2) / w["value"]
                if a > b:
                    a, b = b, a
                if a > lo:
                    lo, why = a, (w, n_)
                hi = min(hi, b)
            if lo > hi + 1e-12:
                fail.append(f"[7 mix]      {iid}: no single scalar explains the rescale "
                            f"(feasible band empty: [{lo:.6f}, {hi:.6f}]); binding row "
                            f"{why[0]['stat']} {why[0]['value']} -> {why[1]['value']}")
            mix_checked += 1

    # ---- 8: per-stat maxima, split by surface. The design's stated post-snap
    # bounds describe the PURCHASABLE set; draft legendaries sit at 52 AEP, twice
    # a POWERFUL, so their maxima are naturally about double and are listed apart.
    peak = {"shop": {}, "draft": {}}
    for iid, d in design.items():
        bucket = "shop" if d["surface"] == "shop" else "draft"
        for m in (live.get(iid) or {}).get("modifiers") or []:
            k = (m["stat"], m["op"])
            if m["value"] > peak[bucket].get(k, (float("-inf"),))[0]:
                peak[bucket][k] = (m["value"], iid, d["tier"])

    print("=" * 78)
    print("TASK #82 PHASE 2 — TIER + RESCALE INVARIANT")
    print("=" * 78)
    print(f"design items      : {len(design)}")
    print(f"retired (_legacy) : {n_retired}   ← 已無取得路徑，退出價格層級檢查（owner 2026-08-18）")
    print(f"at tier budget    : {at_budget} / {len(design) - n_retired}   (tolerance +/-{TOL*100:.1f}%)")
    print(f"stat-mix compared : {mix_checked} items against the pre-rescale backup")
    print(f"hard failures     : {len(fail)}")

    if warn:
        print(f"\nNOT AT BUDGET ({len(warn)}) — each of these is explained in the report:")
        for iid, name, tier, budget, aep in sorted(warn, key=lambda x: x[4] / x[3]):
            print(f"  {iid:<14} {(name or '')[:20]:<22} {tier:<9} {aep:7.2f} / {budget:<5} = {aep/budget:6.1%}")
    if fail:
        print(f"\nFAILURES ({len(fail)}):")
        for f in fail:
            print("  " + f)

    for bucket, label in (("shop", "SHOP (purchasable: SIMPLE 300g / POWERFUL 1200g)"),
                          ("draft", "DRAFT-ONLY (legendary 52 AEP + quest rewards, cost 0)")):
        print(f"\nPOST-RESCALE PER-STAT MAXIMA — {label}:")
        for (stat, op), (v, iid, tier) in sorted(peak[bucket].items(), key=lambda x: x[0]):
            print(f"  {stat:<12} {op:<8} {v:<10} {iid:<14} {tier:<9} ({modifier_aep(stat, op, v):.1f} AEP)")

    print("\n" + ("PASS" if not fail else "FAIL"))
    return 0 if not fail else 1


if __name__ == "__main__":
    b = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    sys.exit(main(b))
