#!/usr/bin/env python3
"""英雄定位批次表 —— `content/champions/*.json` ↔ CSV（owner 2026-08-16）。

owner：「理論上 **後台設定及編輯器 應該都有正規批次設定的方法**對應才對」

⭐ 這一支刻意跟 `tools/item-csv/item_csv.py` **同一個形狀**（export / import /
   requests 三個子命令、`修改需求` 自由欄、`--dry-run`），因為 owner 已經在用那個
   工作流：只填幾欄、其餘當參考，剩下交給 Claude 翻譯。
   ⛔ 不要為英雄發明第二種操作方式。

────────────────────────────────────────────────────────────────────────────────
這張表管的是**四欄**，而它們分成兩種完全不同的東西
────────────────────────────────────────────────────────────────────────────────

| 欄 | 種類 | 寫回哪裡 | 改了會怎樣 |
|---|---|---|---|
| `origin` 出身 | **決策** | `champion@1.origin` | 🔴 連動**十一項屬性**：級距表換一整欄 |
| `playstyle` 核心玩法 | 文案 | `champion@1.playstyle` | 只有 tooltip 那一行 |
| `pitch` 選角說明 | 文案 | `champion@1.pitch` | 只有 tooltip 那一段 |
| `修改需求` | 自由文字 | ⛔ **哪裡都不寫** | 給人／Claude 讀的欄，`apply_row()` 從不讀它 |

⚠️ **`attack_range` 是唯讀的**（匯出有、匯入不理）。射程**不是**逐英雄設定 ——
它由出身查表得到（`scaleByOrigin` 選尺 × `byOrigin.range` 給級距 ×
`bandsByScale` 給絕對值）。想改一位英雄的射程，**改他的 `origin`**；
想改一整個出身的射程，去後台改那張表。
⛔ 在這裡開一欄可寫的射程，就是把那張表抄成第五個住處。

⚠️ 同理 `role` / `attackType` / `tags` **不在這張表裡**：
`attackType` 是「投射物 vs 近身揮擊」（改它會換一支普攻的表現形式），
`tags` 是引擎與普查腳本讀的。兩者都不是定位設定，⛔ 不要順手在這裡改。

────────────────────────────────────────────────────────────────────────────────
用法
────────────────────────────────────────────────────────────────────────────────

    pnpm champions:csv:export            # → champions.csv，用 Excel 開
    pnpm champions:csv:requests          # 只印出有變化的列（省 token）
    pnpm champions:csv:import            # 寫回 content/champions/*.json
    pnpm content:build                   # ⛔ 別忘了，然後 git add content/

⚠️ 匯入之後**一定要**跑 `pnpm content:build` 並把產物一起 commit
（CLAUDE.md 硬性技術約束）。
"""
import argparse
import csv
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
CHAMPS_DIR = REPO / "content" / "champions"
ROSTER = REPO / "content" / "config" / "roster.json"
STAT_NORM = REPO / "content" / "config" / "stat-normalization.json"

# 與 packages/shared/src/content/statNormalization.ts 的 ORIGINS 對齊。
# ⛔ 新增出身時這裡要跟著加，否則匯入會擋下一個其實合法的值。
ORIGINS = {"坦克", "砲手", "鬥士", "射手", "法鬥", "法師", "狂戰", "硬輔", "法刺", "軟輔"}

# owner 的表用全形頓號分隔核心玩法（「攻速・暗殺・追擊」）。
# ⚠️ 也收半形逗號與頓號 —— Excel 使用者不該為了一個分隔符被擋下來。
STYLE_SEPARATORS = "・,、"

COLUMNS = [
    "id", "name", "修改需求",
    "origin", "playstyle", "pitch",
    "attack_range", "retired",
]

# ⛔ 匯入時**不寫回**的欄：唯讀展示，或給人讀的自由文字。
READ_ONLY = {"id", "name", "修改需求", "attack_range", "retired"}


def champ_files():
    return sorted(p for p in CHAMPS_DIR.glob("*.json") if p.name != "_index.json")


def retired_ids():
    doc = json.loads(ROSTER.read_text(encoding="utf-8"))
    return set(doc.get("retiredChampions") or [])


def range_by_origin():
    """出身 → 射程絕對值。⭐ **查表算出來的**，⛔ 不是抄的。

    `scaleByOrigin[range][出身]` 選尺 → `byOrigin[range][出身]` 給級距
    → `bandsByScale[range][尺][級距]` 給絕對值。
    表不完整的出身回 None（⛔ 不猜一個）。
    """
    n = json.loads(STAT_NORM.read_text(encoding="utf-8"))
    scales = (n.get("scaleByOrigin") or {}).get("range") or {}
    bands = (n.get("bandsByScale") or {}).get("range") or {}
    tiers = (n.get("byOrigin") or {}).get("range") or {}
    out = {}
    for origin in ORIGINS:
        scale, tier = scales.get(origin), tiers.get(origin)
        if scale is None or tier is None:
            continue
        v = (bands.get(scale) or {}).get(tier)
        if v is not None:
            out[origin] = f"{scale}/{tier} {v}"
    return out


def do_export(out_path):
    retired = retired_ids()
    ranges = range_by_origin()
    rows = []
    for p in champ_files():
        d = json.loads(p.read_text(encoding="utf-8"))
        cid = d.get("id")
        if not cid:
            continue
        origin = d.get("origin") or ""
        rows.append({
            "id": cid,
            "name": d.get("name", ""),
            "修改需求": "",
            "origin": origin,
            "playstyle": "・".join(d.get("playstyle") or []),
            "pitch": d.get("pitch") or "",
            # 唯讀：這一格是**推導**出來的，改它沒有用（見檔頭）
            "attack_range": ranges.get(origin, ""),
            "retired": "Y" if cid in retired else "",
        })
    with out_path.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS)
        w.writeheader()
        w.writerows(rows)
    print(f"✓ {len(rows)} 位 → {out_path}")
    print("  可改的欄：origin · playstyle · pitch（其餘唯讀，見檔頭）")


def apply_row(d, row, where):
    """把一列 CSV 套進一份英雄文件。回傳改了哪幾欄。

    ⛔ 空字串 = **不動**，不是「清空」。Excel 會把沒填的格子給成空字串，
    所以「空 = 清空」等於讓一次匯出匯入把整份文案洗掉。
    要清空請明寫 `-`。
    """
    changed = []

    origin = (row.get("origin") or "").strip()
    if origin and origin != "-":
        if origin not in ORIGINS:
            raise SystemExit(f"{where}: origin「{origin}」不是十種出身之一 —— {sorted(ORIGINS)}")
        if d.get("origin") != origin:
            d["origin"] = origin
            changed.append("origin")
    elif origin == "-" and "origin" in d:
        del d["origin"]
        changed.append("origin(清除→回推導)")

    style_raw = (row.get("playstyle") or "").strip()
    if style_raw and style_raw != "-":
        parts = style_raw
        for sep in STYLE_SEPARATORS[1:]:
            parts = parts.replace(sep, STYLE_SEPARATORS[0])
        parts = [s.strip() for s in parts.split(STYLE_SEPARATORS[0]) if s.strip()]
        if len(parts) > 6:
            raise SystemExit(f"{where}: 核心玩法最多 6 項（給了 {len(parts)}）")
        if d.get("playstyle") != parts:
            d["playstyle"] = parts
            changed.append("playstyle")
    elif style_raw == "-" and "playstyle" in d:
        del d["playstyle"]
        changed.append("playstyle(清除)")

    pitch = (row.get("pitch") or "").strip()
    if pitch and pitch != "-":
        if len(pitch) > 120:
            raise SystemExit(f"{where}: 選角說明最長 120 字（給了 {len(pitch)}）")
        if d.get("pitch") != pitch:
            d["pitch"] = pitch
            changed.append("pitch")
    elif pitch == "-" and "pitch" in d:
        del d["pitch"]
        changed.append("pitch(清除)")

    return changed


def read_rows(in_path):
    with in_path.open(newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        raise SystemExit(f"{in_path}: 空檔")
    missing = [c for c in COLUMNS if c not in rows[0]]
    if missing:
        raise SystemExit(f"{in_path}: 缺欄 {missing}")
    return rows


def do_import(in_path, dry_run):
    rows = read_rows(in_path)
    by_id = {}
    for p in champ_files():
        d = json.loads(p.read_text(encoding="utf-8"))
        if d.get("id"):
            by_id[d["id"]] = (p, d)
    touched = 0
    for i, row in enumerate(rows, start=2):
        cid = (row.get("id") or "").strip()
        if not cid:
            continue
        if cid not in by_id:
            raise SystemExit(f"第 {i} 列: 找不到英雄 {cid}")
        p, d = by_id[cid]
        changed = apply_row(d, row, f"第 {i} 列 ({cid})")
        if not changed:
            continue
        touched += 1
        print(f"  {cid:16} {row.get('name','')[:20]:22} {'、'.join(changed)}")
        if not dry_run:
            p.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if dry_run:
        print(f"\n（--dry-run）{touched} 位會被改動，⛔ 沒有寫檔")
    else:
        print(f"\n✓ {touched} 位已寫回")
        print("⛔ 別忘了：pnpm content:build && git add content/")


def do_requests(in_path):
    """只印出「修改需求」有寫東西的列 —— 給 Claude 讀，⛔ 不要整張表塞進 context。"""
    rows = read_rows(in_path)
    n = 0
    for row in rows:
        req = (row.get("修改需求") or "").strip()
        if not req:
            continue
        n += 1
        print(f"── {row['id']} · {row.get('name','')}")
        print(f"   現況：出身 {row.get('origin') or '（推導）'} · "
              f"射程 {row.get('attack_range') or '?'} · {row.get('playstyle') or '（無）'}")
        print(f"   需求：{req}\n")
    if n == 0:
        print("（沒有任何一列填了「修改需求」）")


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("export", help="content/champions/*.json → CSV")
    e.add_argument("-o", "--out", type=Path, required=True)
    i = sub.add_parser("import", help="CSV → content/champions/*.json")
    i.add_argument("-i", "--in", dest="inp", type=Path, required=True)
    i.add_argument("--dry-run", action="store_true", help="只印出會改什麼，不寫檔")
    r = sub.add_parser("requests", help="CSV → 只印出有填「修改需求」的列（省 token）")
    r.add_argument("-i", "--in", dest="inp", type=Path, required=True)
    args = ap.parse_args()
    if args.cmd == "export":
        do_export(args.out)
    elif args.cmd == "import":
        do_import(args.inp, args.dry_run)
    else:
        do_requests(args.inp)


if __name__ == "__main__":
    sys.exit(main())
