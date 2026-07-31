#!/usr/bin/env python3
"""道具 ↔ CSV 雙向轉換。

    python3 tools/item-csv/item_csv.py export -o items.csv
    python3 tools/item-csv/item_csv.py import  -i items.csv [--dry-run]

匯入是「疊加」不是「重寫」：先讀原本的 JSON，只把 CSV 有的欄位蓋上去，
所以任何這個工具不認得的欄位都會原封不動留著，鍵的順序也不會被打亂
（＝git diff 只會顯示你真的改的那幾行）。

⚠️ 任何一列有問題就整批不寫。半套寫入會讓 content 樹處於沒人知道的中間狀態。

─────────────────────────────────────────────────────────────────────────────
「修改需求」欄 —— 這隻程式故意不讀它
─────────────────────────────────────────────────────────────────────────────
owner 不想直接改 modifiers/passive_json 那些結構化欄位（那等於要求他先懂
schema），所以匯出多了一欄純文字的「修改需求」，讓他用白話寫想要什麼效果，
例如「攻擊力提高到 50」「被動改成暈眩 1 秒」。

這隻 CLI **完全不解析那一欄** —— import 時會照 COLUMNS 驗證它存在，但
apply_row() 從不讀它，所以裡面寫什麼都不會被這支程式當成指令執行。
它是寫給 Claude 看的，不是寫給這支 parser 看的：流程是「owner 填欄位 →
Claude 讀 CSV、理解白話需求、對照 schema 自己動手編輯 JSON（尊重
statPipeline 的 pctAdd/pctMult 語意等既有慣例）→ 重新 export 一份乾淨的
CSV 讓 owner 核對」。不要試圖把這一欄接成自動化 —— 白話請求本來就需要
人工/Claude 判斷，接一個關鍵字 parser 上去只會做出一個很脆的假自動化。
"""
import argparse
import csv
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ITEMS_DIR = REPO / "content" / "items"
LEGENDARY_POOL = REPO / "content" / "loot-tables" / "legendary-weapons.json"

# 與 packages/shared/src/content/schema/item.ts 對齊。新增 stat/op 時這裡要跟著加，
# 否則匯入會擋下一個其實合法的值。
STATS = {
    "ad", "ap", "armor", "as", "critChance", "critDamage", "healthRegen",
    "lifesteal", "manaRegen", "maxHealth", "maxMana", "mr", "ms",
}
OPS = {"flat", "pctAdd", "pctMult", "capRaise"}

# `_` 開頭 = 從 JSON 算出來的唯讀參考欄。
# 「修改需求」方向相反：是給人／Claude 寫入的自由文字，這支程式一樣不會處理它
# （見檔頭「這隻程式故意不讀它」）。兩種都不會出現在 apply_row() 裡。
COLUMNS = [
    "id", "name", "修改需求", "tier", "cost", "craftRole", "tags",
    "requiresAttackType", "unique", "draftEligible", "icon",
    "description", "modifiers",
    "passive_json", "auras_json", "recipe_json", "authoringNote",
    "_in_legendary_pool",
]

JSON_COLUMNS = {"passive_json": "passive", "auras_json": "auras", "recipe_json": "recipe"}
BOOL_COLUMNS = {"unique", "draftEligible"}
INT_COLUMNS = {"tier", "cost"}


def item_files():
    return sorted(p for p in ITEMS_DIR.glob("*.json") if p.name != "_index.json")


def legendary_ids():
    pool = json.loads(LEGENDARY_POOL.read_text(encoding="utf-8"))
    return {e["itemId"] for e in pool["entries"]}


def fmt_modifiers(mods):
    return " | ".join(f"{m['stat']} {m['op']} {m['value']}" for m in mods)


def parse_modifiers(cell, where):
    """`ad flat 45 | maxHealth flat 260` → [{stat, op, value}]"""
    cell = cell.strip()
    if not cell:
        return None
    out = []
    for part in cell.split("|"):
        part = part.strip()
        if not part:
            continue
        bits = part.split()
        if len(bits) != 3:
            raise ValueError(f"{where}: modifiers 每一段要三個欄位「stat op value」，收到 {part!r}")
        stat, op, raw = bits
        if stat not in STATS:
            raise ValueError(f"{where}: 未知的 stat {stat!r}（可用：{', '.join(sorted(STATS))}）")
        if op not in OPS:
            raise ValueError(f"{where}: 未知的 op {op!r}（可用：{', '.join(sorted(OPS))}）")
        try:
            value = float(raw)
        except ValueError:
            raise ValueError(f"{where}: value 不是數字：{raw!r}") from None
        out.append({"stat": stat, "op": op, "value": int(value) if value == int(value) else value})
    return out or None


def do_export(out_path):
    legendary = legendary_ids()
    rows = []
    for path in item_files():
        it = json.loads(path.read_text(encoding="utf-8"))
        rows.append({
            "id": it["id"],
            "name": it.get("name", ""),
            "修改需求": "",
            "tier": it.get("tier", ""),
            "cost": it.get("cost", ""),
            "craftRole": it.get("craftRole", ""),
            "tags": ",".join(it.get("tags", [])),
            "requiresAttackType": it.get("requiresAttackType", ""),
            "unique": "TRUE" if it.get("unique") else "",
            "draftEligible": "" if "draftEligible" not in it else ("TRUE" if it["draftEligible"] else "FALSE"),
            "icon": it.get("icon", ""),
            "description": it.get("description", ""),
            "modifiers": fmt_modifiers(it.get("modifiers", [])),
            "passive_json": json.dumps(it["passive"], ensure_ascii=False) if it.get("passive") else "",
            "auras_json": json.dumps(it["auras"], ensure_ascii=False) if it.get("auras") else "",
            "recipe_json": json.dumps(it["recipe"], ensure_ascii=False) if it.get("recipe") else "",
            "authoringNote": it.get("authoringNote", ""),
            "_in_legendary_pool": "YES" if it["id"] in legendary else "",
        })
    # utf-8-sig：Excel 沒有 BOM 會把中文顯示成亂碼。
    with out_path.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS)
        w.writeheader()
        w.writerows(rows)
    print(f"匯出 {len(rows)} 件道具 → {out_path}")


def apply_row(it, row, where):
    """把 CSV 的一列疊到既有的 item dict 上。就地改，所以鍵序不變。"""
    changed = []

    def put(key, value):
        if value is None:
            if key in it:
                del it[key]
                changed.append(key)
        elif it.get(key) != value:
            it[key] = value
            changed.append(key)

    put("name", row["name"].strip() or None)
    put("icon", row["icon"].strip() or None)
    put("description", row["description"] or None)
    put("craftRole", row["craftRole"].strip() or None)
    put("requiresAttackType", row["requiresAttackType"].strip() or None)
    put("authoringNote", row["authoringNote"] or None)

    for col in INT_COLUMNS:
        raw = row[col].strip()
        if not raw:
            put(col, None)
            continue
        try:
            put(col, int(float(raw)))
        except ValueError:
            raise ValueError(f"{where}: {col} 不是數字：{raw!r}") from None

    tags = [t.strip() for t in row["tags"].split(",") if t.strip()]
    put("tags", tags or None)

    for col in BOOL_COLUMNS:
        raw = row[col].strip().upper()
        if raw in ("", "-"):
            put(col, None)
        elif raw in ("TRUE", "YES", "1"):
            put(col, True)
        elif raw in ("FALSE", "NO", "0"):
            put(col, False)
        else:
            raise ValueError(f"{where}: {col} 只能是 TRUE / FALSE / 空白，收到 {raw!r}")

    put("modifiers", parse_modifiers(row["modifiers"], where))

    for col, key in JSON_COLUMNS.items():
        raw = row[col].strip()
        if not raw:
            put(key, None)
            continue
        try:
            put(key, json.loads(raw))
        except json.JSONDecodeError as e:
            raise ValueError(f"{where}: {col} 不是合法 JSON — {e}") from None

    return changed


def do_import(in_path, dry_run):
    with in_path.open(newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))

    missing = [c for c in COLUMNS if c not in (rows[0].keys() if rows else [])]
    if missing:
        sys.exit(f"CSV 少了這些欄：{', '.join(missing)}。請用 export 產生的檔案為基礎編輯。")

    # 先全部解析完再寫，任何一列爆掉就整批不動。
    planned = []
    errors = []
    for n, row in enumerate(rows, start=2):
        item_id = row["id"].strip()
        where = f"第 {n} 列（{item_id or '無 id'}）"
        if not item_id:
            errors.append(f"{where}: id 是空的")
            continue
        path = ITEMS_DIR / f"{item_id}.json"
        if not path.exists():
            errors.append(f"{where}: 找不到 {path.relative_to(REPO)} —— 這個工具不新增道具，只改既有的")
            continue
        it = json.loads(path.read_text(encoding="utf-8"))
        try:
            changed = apply_row(it, row, where)
        except ValueError as e:
            errors.append(str(e))
            continue
        if changed:
            planned.append((path, it, item_id, changed))

    if errors:
        print("⛔ 有問題，整批都沒有寫入：\n")
        for e in errors:
            print("  " + e)
        sys.exit(1)

    if not planned:
        print("沒有任何差異，沒有檔案被改動。")
        return

    for path, it, item_id, changed in planned:
        print(f"  {item_id}: {', '.join(changed)}")
        if not dry_run:
            path.write_text(json.dumps(it, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    verb = "會改動" if dry_run else "已改動"
    print(f"\n{verb} {len(planned)} 個檔案。")
    if dry_run:
        print("這是 --dry-run，沒有寫入。拿掉旗標才會真的寫。")
    else:
        print("⚠️ 接著要跑 `pnpm content:build`，否則 bundle.test.ts 會紅。")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("export", help="content/items/*.json → CSV")
    e.add_argument("-o", "--out", type=Path, required=True)
    i = sub.add_parser("import", help="CSV → content/items/*.json")
    i.add_argument("-i", "--in", dest="inp", type=Path, required=True)
    i.add_argument("--dry-run", action="store_true", help="只印出會改什麼，不寫檔")
    args = ap.parse_args()

    if args.cmd == "export":
        do_export(args.out)
    else:
        do_import(args.inp, args.dry_run)


if __name__ == "__main__":
    main()
