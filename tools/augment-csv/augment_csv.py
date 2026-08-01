#!/usr/bin/env python3
"""
augment_csv — 能力增強 (augment@1) 的 CSV 匯出/匯入，跟 tools/item-csv 同一套習慣。

─────────────────────────────────────────────────────────────────────────────
owner 只填三欄，其餘是給他看的參考

2026-07-31 立的習慣（見 tools/item-csv/item_csv.py）：owner 在試算表裡只動
`name` / `修改需求` / `description` 三欄，`modifiers_json` / `hooks_json` 那些
結構化欄位是**唯讀參考**，不是要他手填 JSON。匯入時由 Claude 讀「修改需求」
那一欄的白話，手動翻成結構化欄位 —— 因為那一欄寫的是「我要它變成怎樣」，
不是「我算好了新的係數」。

所以 `import` 預設**只吃 name / description / 修改需求**，結構化欄位一律忽略，
除非明確加 `--apply-structured`（那是給程式產生的 CSV 用的，不是給人填的）。

─────────────────────────────────────────────────────────────────────────────
為什麼多了「出現回合」這一欄

augment 跟道具最大的差別是 **owner 看不到自己的池子有多淺**。抽哪一階完全由
`content/config/arena-rules.json` 的 `rounds[r].augmentTier` 決定，而 CSV 裡
只寫 tier 的話，「silver 只有 6 張要撐三個回合的三選一」這件事在試算表上是隱形的。
所以匯出時把 arena-rules 讀進來，直接寫出「這一階實際出現在第幾回合」與
「同階共幾張」，讓池子太淺在試算表上一眼看得出來。

⚠️ 這一欄是**算出來的**，匯入時忽略。改回合排程要去改 arena-rules.json。
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
AUG_DIR = REPO / "content" / "augments"
ARENA_RULES = REPO / "content" / "config" / "arena-rules.json"

# owner 手填的三欄 + 唯讀參考欄。順序刻意把 修改需求 放第三,緊跟著 name,
# 因為那是他實際會打字的格子。
COLUMNS = [
    "id",
    "name",
    "修改需求",
    "tier",
    "weight",
    "出現回合",
    "同階張數",
    "tags",
    "description",
    "modifiers_json",
    "hooks_json",
]
OWNER_EDITABLE = {"name", "description", "修改需求"}


def tier_rounds() -> dict[str, list[int]]:
    """Which rounds each tier is actually drafted on, read from the shipped schedule."""
    rules = json.loads(ARENA_RULES.read_text())
    rounds = rules.get("rounds", {})
    out: dict[str, list[int]] = {}
    for r, cfg in rounds.items():
        t = (cfg or {}).get("augmentTier")
        if t:
            out.setdefault(t, []).append(int(r))
    for t in out:
        out[t].sort()
    return out


def load_docs() -> list[dict]:
    docs = []
    for f in sorted(AUG_DIR.glob("*.json")):
        if f.name == "_index.json":
            continue
        docs.append(json.loads(f.read_text()))
    return docs


def export(out_path: Path) -> None:
    docs = load_docs()
    rounds = tier_rounds()
    per_tier: dict[str, int] = {}
    for d in docs:
        per_tier[d["tier"]] = per_tier.get(d["tier"], 0) + 1

    with out_path.open("w", newline="", encoding="utf-8-sig") as fh:
        w = csv.DictWriter(fh, fieldnames=COLUMNS)
        w.writeheader()
        # tier 由弱到強,同 tier 內按名字 —— 讓 owner 在試算表裡一眼看到
        # 「開局那幾回合的池子」是連續的一段。
        order = {"silver": 0, "gold": 1, "prismatic": 2}
        for d in sorted(docs, key=lambda x: (order.get(x["tier"], 9), x["name"])):
            rs = rounds.get(d["tier"], [])
            w.writerow(
                {
                    "id": d["id"],
                    "name": d["name"],
                    "修改需求": "",
                    "tier": d["tier"],
                    "weight": d.get("weight", ""),
                    "出現回合": ",".join(str(r) for r in rs) if rs else "(沒有回合排這一階)",
                    "同階張數": per_tier.get(d["tier"], 0),
                    "tags": ",".join(d.get("tags", [])),
                    "description": d.get("description", ""),
                    "modifiers_json": json.dumps(d["modifiers"], ensure_ascii=False)
                    if d.get("modifiers")
                    else "",
                    "hooks_json": json.dumps(d["hooks"], ensure_ascii=False)
                    if d.get("hooks")
                    else "",
                }
            )
    print(f"{out_path}  {len(docs)} 張")
    for t in ("silver", "gold", "prismatic"):
        rs = rounds.get(t, [])
        n = per_tier.get(t, 0)
        warn = "  ⚠️ 三選一抽 3 張,池子只有 %d 張" % n if n < 6 else ""
        print(f"  {t:10s} {n:2d} 張  出現在回合 {rs or '—'}{warn}")


def import_csv(src: Path, apply_structured: bool) -> None:
    with src.open(newline="", encoding="utf-8-sig") as fh:
        rows = list(csv.DictReader(fh))

    changed, requests = 0, []
    for row in rows:
        aid = (row.get("id") or "").strip()
        if not aid:
            continue
        path = AUG_DIR / f"{aid}.json"
        if not path.exists():
            print(f"  ✖ {aid}: 沒有這個檔,跳過", file=sys.stderr)
            continue
        doc = json.loads(path.read_text())
        dirty = False

        for col in ("name", "description"):
            val = (row.get(col) or "").strip()
            if val and val != doc.get(col):
                doc[col] = val
                dirty = True

        req = (row.get("修改需求") or "").strip()
        if req:
            requests.append((aid, doc.get("name", aid), req))

        if apply_structured:
            for col, key in (("modifiers_json", "modifiers"), ("hooks_json", "hooks")):
                raw = (row.get(col) or "").strip()
                if raw:
                    doc[key] = json.loads(raw)
                    dirty = True
            for col in ("tier", "weight"):
                val = (row.get(col) or "").strip()
                if val:
                    doc[col] = int(val) if col == "weight" else val
                    dirty = True

        if dirty:
            path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n")
            changed += 1

    print(f"寫回 {changed} 個檔。記得跑 `pnpm content:build`(它現在會先驗證再寫入)。")
    if requests:
        print(f"\n⚠️ {len(requests)} 筆「修改需求」**沒有被自動套用** —— 那一欄是白話,要人讀:")
        for aid, name, req in requests:
            print(f"  · {name} ({aid}): {req}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("export", help="content/augments → CSV")
    e.add_argument("out", nargs="?", default=str(REPO / "augments_GGD - augments.csv"))
    i = sub.add_parser("import", help="CSV → content/augments (預設只吃 name/description)")
    i.add_argument("src")
    i.add_argument(
        "--apply-structured",
        action="store_true",
        help="連 modifiers_json/hooks_json/tier/weight 一起寫回。給程式產生的 CSV 用,不是給人填的。",
    )
    a = ap.parse_args()
    if a.cmd == "export":
        export(Path(a.out))
    else:
        import_csv(Path(a.src), a.apply_structured)


if __name__ == "__main__":
    main()
