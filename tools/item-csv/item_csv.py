#!/usr/bin/env python3
"""道具 ↔ CSV 雙向轉換。

    python3 tools/item-csv/item_csv.py export   -o items.csv
    python3 tools/item-csv/item_csv.py import   -i items.csv [--dry-run]
    python3 tools/item-csv/item_csv.py requests -i items.csv

匯入是「疊加」不是「重寫」：先讀原本的 JSON，只把 CSV 有的欄位蓋上去，
所以任何這個工具不認得的欄位都會原封不動留著，鍵的順序也不會被打亂
（＝git diff 只會顯示你真的改的那幾行）。

⚠️ 任何一列有問題就整批不寫。半套寫入會讓 content 樹處於沒人知道的中間狀態。

─────────────────────────────────────────────────────────────────────────────
「修改需求」欄 —— import 故意不讀它，讀它的是 `requests`
─────────────────────────────────────────────────────────────────────────────
owner 不想直接改 modifiers/passive_json 那些結構化欄位（那等於要求他先懂
schema），所以匯出多了一欄純文字的「修改需求」，讓他用白話寫想要什麼效果，
例如「攻擊力提高到 50」「被動改成暈眩 1 秒」。白話請求本來就需要人工/Claude
判斷，`import` 的 apply_row() 從不讀那一欄——接一個關鍵字 parser 上去只會
做出一個很脆的假自動化。

但「219 列都塞進 Claude 的 context 讓它自己找哪幾列有填」本身也是浪費。
owner 定的規則很明確，寫死在這裡，不是留給 Claude 每次重新掃一遍：

    `requests` 子命令只掃 `修改需求` 這一欄。有內容的列才印，印判斷需要的
    最小資料（id、需求原文、現有 modifiers/passive/auras/description）。
    name/description/tier/cost/requiresAttackType/in_legendary_pool 這些
    欄位不管有沒有變，`import` 都會機械式套用，套用不需要「懂」，所以不算
    是 `requests` 要篩的東西——沒有 `修改需求` 的列完全不出現在輸出裡，
    連「這列其實只改了 tier」這種 FYI 都不印，owner 自己知道自己填了什麼。

流程是「owner 填欄位 → 跑 `requests` 拿到精簡摘要 → Claude 讀摘要、理解白話
需求、對照 schema 自己動手編輯 JSON（尊重 statPipeline 的 pctAdd/pctMult
語意等既有慣例）→ 重新 export 一份乾淨的 CSV 讓 owner 核對」。

─────────────────────────────────────────────────────────────────────────────
「in_legendary_pool」欄 —— 唯一一個寫到另一個檔案的欄
─────────────────────────────────────────────────────────────────────────────
這一欄不是 `content/items/*.json` 的欄位，是「這件道具在不在
`content/loot-tables/legendary-weapons.json` 的 entries 裡」。YES → 該在
（不在就加一筆 weight:1）；空白 → 不該在（在的話就移除）。所有其他欄位都是
per-item 的疊加寫入，這欄是唯一橫跨全表比對、只寫一次的例外，所以放在
do_import() 的主迴圈外單獨處理。

⚠️ 加進池子不等於玩家抽得到——round-5 3-choose-1 之外還有一道
`apps/platform/internal/curation/starter.go` 的 `starterLegendaryItems`
白名單gate（Go 程式碼，這支工具不會、也不該自動改）。import 只負責提醒：
新加進池子但不在那份白名單裡的道具會被列出來，需要手動去 starter.go 補一行。
"""
import argparse
import csv
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ITEMS_DIR = REPO / "content" / "items"
# ⭐ owner 2026-08-18 的三階寶具池。`LEGENDARY_POOL` 留著指 EX 那一張（CSV 的
# 「在不在傳說池」欄與上架流程都是以它為主），三張的聯集在 `LEGENDARY_POOLS`。
LEGENDARY_POOL = REPO / "content" / "loot-tables" / "legendary-weapons.json"
LEGENDARY_POOLS = [
    REPO / "content" / "loot-tables" / f"{t}.json"
    for t in ("legendary-weapons", "ex-release-weapons", "ex-origin-weapons")
]
STARTER_GO = REPO / "apps" / "platform" / "internal" / "curation" / "starter.go"

# 與 packages/shared/src/content/schema/item.ts 對齊。新增 stat/op 時這裡要跟著加，
# 否則匯入會擋下一個其實合法的值。
STATS = {
    "ad", "ap", "armor", "as", "critChance", "critDamage", "healthRegen",
    "lifesteal", "manaRegen", "maxHealth", "maxMana", "mr", "ms",
}
OPS = {"flat", "pctAdd", "pctMult", "capRaise"}

# 「修改需求」是給人／Claude 寫入的自由文字，apply_row() 從不讀它
# （見檔頭「219 列都塞進 Claude 的 context...」）。
# 「in_legendary_pool」也不在 apply_row() 裡——它寫的是另一個檔案，
# 在 do_import() 主迴圈外單獨處理（見檔頭「in_legendary_pool 欄」）。
COLUMNS = [
    "id", "name", "修改需求", "tier", "cost", "craftRole", "tags",
    "requiresAttackType", "unique", "draftEligible", "icon",
    "description", "modifiers",
    "passive_json", "auras_json", "recipe_json", "authoringNote",
    "in_legendary_pool",
]

JSON_COLUMNS = {"passive_json": "passive", "auras_json": "auras", "recipe_json": "recipe"}
BOOL_COLUMNS = {"unique", "draftEligible"}
INT_COLUMNS = {"tier", "cost"}


def item_files():
    return sorted(p for p in ITEMS_DIR.glob("*.json") if p.name != "_index.json")


def legendary_ids():
    pool = json.loads(LEGENDARY_POOL.read_text(encoding="utf-8"))
    return {e["itemId"] for e in pool["entries"]}


def starter_legendary_ids():
    """從 starter.go 讀 starterLegendaryItems 白名單，純讀取，只用來提醒。"""
    text = STARTER_GO.read_text(encoding="utf-8")
    m = re.search(r"starterLegendaryItems\s*=\s*\[\]string\{(.*?)\n\t\}", text, re.S)
    if not m:
        return None  # 找不到這個區塊代表 starter.go 改了形狀，工具該更新，不要假裝沒事
    return set(re.findall(r'"([\w-]+)"', m.group(1)))


def parse_pool_flag(raw, where):
    raw = raw.strip()
    if raw in ("", "-"):
        return False
    if raw.upper() in ("YES", "TRUE", "1"):
        return True
    if raw.upper() in ("NO", "FALSE", "0"):
        return False
    raise ValueError(f"{where}: in_legendary_pool 只能是 YES 或空白，收到 {raw!r}")


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
            "in_legendary_pool": "YES" if it["id"] in legendary else "",
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

    current_pool = legendary_ids()

    # 先全部解析完再寫，任何一列爆掉就整批不動——包含 in_legendary_pool 的解析。
    planned = []
    pool_adds = []
    pool_removes = []
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
            pool_flag = parse_pool_flag(row["in_legendary_pool"], where)
        except ValueError as e:
            errors.append(str(e))
            continue
        if changed:
            planned.append((path, it, item_id, changed))
        if pool_flag and item_id not in current_pool:
            pool_adds.append(item_id)
        elif not pool_flag and item_id in current_pool:
            pool_removes.append(item_id)

    if errors:
        print("⛔ 有問題，整批都沒有寫入：\n")
        for e in errors:
            print("  " + e)
        sys.exit(1)

    if not planned and not pool_adds and not pool_removes:
        print("沒有任何差異，沒有檔案被改動。")
        return

    for path, it, item_id, changed in planned:
        print(f"  {item_id}: {', '.join(changed)}")
        if not dry_run:
            path.write_text(json.dumps(it, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if pool_adds or pool_removes:
        print(f"\n傳說池（legendary-weapons.json）：+{len(pool_adds)} -{len(pool_removes)}")
        starter_ids = starter_legendary_ids()
        for iid in pool_adds:
            note = ""
            if starter_ids is not None and iid not in starter_ids:
                note = "  ⚠️ 不在 starter.go 的 starterLegendaryItems 白名單裡，加了也抽不到，要手動去補一行"
            print(f"  + {iid}{note}")
        for iid in pool_removes:
            print(f"  - {iid}")
        if not dry_run:
            pool = json.loads(LEGENDARY_POOL.read_text(encoding="utf-8"))
            entries = [e for e in pool["entries"] if e["itemId"] not in pool_removes]
            entries.extend({"itemId": iid, "weight": 1} for iid in pool_adds)
            pool["entries"] = entries
            LEGENDARY_POOL.write_text(json.dumps(pool, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    n_files = len(planned) + (1 if (pool_adds or pool_removes) else 0)
    verb = "會改動" if dry_run else "已改動"
    print(f"\n{verb} {n_files} 個檔案。")
    if dry_run:
        print("這是 --dry-run，沒有寫入。拿掉旗標才會真的寫。")
    else:
        print("⚠️ 接著要跑 `pnpm content:build`，否則 bundle.test.ts 會紅。")


def do_requests(in_path):
    """只掃「修改需求」有內容的列，只印判斷那一列所需的最小資料。

    唯一的篩選規則：`修改需求` 欄是不是空的。name/description/tier/cost/
    requiresAttackType/in_legendary_pool 不管有沒有變，`import` 都會機械式
    套用——套用不需要判斷，所以那些變化不在這裡出現，owner 自己知道自己
    填了什麼，不需要 Claude 再覆誦一遍。給 Claude 讀的入口，不是給 owner
    核對用的（核對請重新 export 看新的 CSV）。
    """
    with in_path.open(newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))

    missing = [c for c in COLUMNS if c not in (rows[0].keys() if rows else [])]
    if missing:
        sys.exit(f"CSV 少了這些欄：{', '.join(missing)}。請用 export 產生的檔案為基礎編輯。")

    hits = [row for row in rows if row.get("修改需求", "").strip()]
    print(f"{len(rows)} 件道具，{len(hits)} 件有修改需求。\n")
    if not hits:
        return

    for row in hits:
        item_id = row["id"].strip()
        path = ITEMS_DIR / f"{item_id}.json"
        if not path.exists():
            print(f"⚠️ {item_id or '(空 id)'}: 找不到對應檔案，略過\n")
            continue
        current = json.loads(path.read_text(encoding="utf-8"))

        print(f"── {item_id}（{current.get('name', '')}）──")
        print(f"修改需求：{row['修改需求'].strip()}")
        mods = current.get("modifiers", [])
        if mods:
            print("現有 modifiers：" + fmt_modifiers(mods))
        if current.get("passive"):
            print("現有 passive：" + json.dumps(current["passive"], ensure_ascii=False))
        if current.get("auras"):
            print("現有 auras：" + json.dumps(current["auras"], ensure_ascii=False))
        print("現有 description：")
        print(current.get("description", "(無)"))
        print()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("export", help="content/items/*.json → CSV")
    e.add_argument("-o", "--out", type=Path, required=True)
    i = sub.add_parser("import", help="CSV → content/items/*.json")
    i.add_argument("-i", "--in", dest="inp", type=Path, required=True)
    i.add_argument("--dry-run", action="store_true", help="只印出會改什麼，不寫檔")
    r = sub.add_parser("requests", help="CSV → 只印出有變化的列（給 Claude 讀，省 token）")
    r.add_argument("-i", "--in", dest="inp", type=Path, required=True)
    args = ap.parse_args()

    if args.cmd == "export":
        do_export(args.out)
    elif args.cmd == "import":
        do_import(args.inp, args.dry_run)
    else:
        do_requests(args.inp)


if __name__ == "__main__":
    main()
