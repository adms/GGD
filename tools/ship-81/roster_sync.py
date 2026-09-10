#!/usr/bin/env python3
"""⭐ 盤點表 ↔ 出貨名單的**雙向**對帳 ＋ 阻塞理由的新鮮度。

owner 2026-09-10 逐字：
「**全角色模型盤點.md 會持續更新模型預設對應表，請你也配合改變上架設定**」

⇒ ⭐ 「配合改變」要成立，得先有一個東西**看得見兩邊不一樣**。
⛔ 而 `gen.py` 今天只把落差印進報告 —— 一個**只在報告裡出現的數字**，
⭐ 沒有任何東西會紅（本文件記過五次：判準 0/4 全破，只有閘有用）。

── ⛔⛔ 為什麼要**兩個方向**（第二守則⑫）─────────────────────────
⭐ 只從一頭走，**結構上**看不到另一頭：

| 方向 | 問什麼 | ⛔ 一頭走時漏掉的 |
|---|---|---|
| **正向** | 盤點表每一列 → 出貨內容裡找得到嗎？ | 「**有宣告而無實體**」——表上寫著、而玩家拿不到 |
| **反向** | 出貨每一名 → 盤點表裡有那一列嗎？ | 「**有實體而無宣告**」——上架了、而 owner 的表不知道 |

⚠️ 2026-09-10 實測：正向 7 筆、反向 1 筆。⭐ 兩個數字**不會互相推導** ——
⛔ 少走一頭就是靜靜地少掉一整類。

── ⭐ 母體怎麼框（⛔ 不寫死名單）─────────────────────────────────
盤點表管的是**社群英雄**，⛔ 不是原作 `godie-*` 那 69 名。
⇒ 反向的母體 = 出貨 `champion@1` **扣掉** `godie-*` **扣掉引擎骨架那兩顆**，
⭐ 而骨架那兩顆是從 `model_map.SKELETON` **推導**的（⛔ 不是這裡再抄一份 id）。

── ⭐ 變身態是**推導出來的**豁免，⛔ 不是一張名單 ────────────────
`transform.role == "alternate"` 的分身**自己不佔一列**（它靠 `counterpartId` 配對）。
⇒ 豁免條件是「**本體在表上**」——⛔ 本體也不在表上的分身**仍然要喊**。
⚠️ 寫成名單的話，下一隻新分身會靜靜地通過（那正是「有實體而無宣告」）。
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from model_map import SKELETON, parse_inventory, stale_blockers  # noqa: E402

#: ⭐ 引擎骨架那兩顆的**英雄 id** —— 從 modelKey 推導（`champ.thorne` → `thorne`）。
#: ⛔ 不在這裡再抄一份字面值：`SKELETON` 一改，這裡跟著改（第〇·四守則）。
SKELETON_HERO_IDS = {v.split(".", 1)[-1] for v in SKELETON.values()}


def _row_id(row: str) -> str:
    """⭐ 從表格第一格撈出反引號裡的英雄 id —— ⭐ 那才是穩定的 join key。

    ⚠️ ⛔ 不要拿顯示名當 key：owner 隨時會改中文名，而 id 不會漂。
    撈不到就退回整格原文（⇒ 棘輪對不上就會紅，⛔ 不會靜靜地放行）。
    """
    if "`" in row:
        parts = row.split("`")
        if len(parts) >= 2 and parts[1].strip():
            return parts[1].strip()
    return row.strip()


def load_shipped(repo: Path) -> dict[str, dict]:
    """出貨的 `champion@1` 全部讀進來（⛔ 不篩 —— 母體要先完整才框得起來）。"""
    out: dict[str, dict] = {}
    for f in sorted((repo / "content/champions").glob("*.json")):
        if f.name == "_index.json":
            continue
        d = json.loads(f.read_text(encoding="utf-8"))
        if d.get("schema") != "champion@1" or not d.get("id"):
            continue
        out[d["id"]] = d
    return out


#: ⭐ 別名表住在棘輪基準線旁邊（同一個檔、同一個寫入端＝我）。
BASELINE = Path(__file__).resolve().parent / "roster-sync.baseline.json"


def _load_aliases() -> list[dict]:
    """⭐ 盤點表的 rowId ↔ 出貨 champion id 的**宣告過的**別名。⛔ 不是猜出來的規則。"""
    if not BASELINE.exists():
        return []
    doc = json.loads(BASELINE.read_text(encoding="utf-8"))
    return list((doc.get("idAliases") or {}).get("rows") or [])


def _resolve_aliases(rows: list[dict], shipped: dict[str, dict]) -> tuple[dict, dict, list[dict]]:
    """⭐ **先驗那把鑰匙**（第〇·六守則 / GH#635），⛔ 不是拿 key 直接 join。

    ⚠️ 背景：盤點表『LOL 追加 7 名』那一節的 rowId 是 `example:<slug>`，
    ⛔ 而出貨的 id 是 `lol-<slug>` ⇒ **同樣 7 名同時出現在正向與反向落差裡**
    （forwardGap `example:*` 7 筆 · reverseGap `lol-*` 7 筆 —— ⭐ 同一批人被數了兩次）。

    ⛔⛔ **而正解不是寫一條 `example: → lol-` 的字串規則** —— 那是「照 key 同步」，
    ⭐ 也就是 GH#635 把消化液整支覆蓋掉的那個形狀。⇒ 這裡改成：
    別名**逐筆宣告**在 `roster-sync.baseline.json`，而每一筆**跑的時候**要過四道驗：

      ① 那一列**今天還在**盤點表上（owner 刪了 ⇒ 別名過期 ⇒ 🔴）
      ② 那個出貨 id **今天還在**（下架了 ⇒ 🔴）
      ③ ⭐ **獨立軸**：盤點表的顯示名 == 出貨 `champion@1.name`
         （⛔ 顯示名**不是** join key —— 它是**驗算**：兩個各自維護的欄位對上了，
          才證明這一對指的是同一個人。對不上 ⇒ 🔴 並指名，⛔ 不靜靜地 join）
      ④ 棘輪：rowId 本身**已經**是出貨 id ⇒ 這筆別名多餘 ⇒ 🔴，要刪掉

    ⇒ 別名成立時，**兩個方向一起**消掉；任何一道驗不過就回報 issue（⛔ 不套用）。
    """
    by_row = {r["heroId"]: r for r in rows}
    alias_of: dict[str, str] = {}
    aliased_ship: dict[str, str] = {}
    issues: list[dict] = []
    for a in _load_aliases():
        row_id, ship_id = a.get("rowId", ""), a.get("shippedId", "")
        row, ship = by_row.get(row_id), shipped.get(ship_id)
        if row_id in shipped:
            issues.append({"rowId": row_id, "shippedId": ship_id, "reason": "redundant-alias",
                           "detail": f"{row_id} 本身就是出貨 id ⇒ 這筆別名多餘，從 idAliases 刪掉"})
            continue
        if row is None:
            issues.append({"rowId": row_id, "shippedId": ship_id, "reason": "row-not-on-inventory",
                           "detail": f"盤點表上今天沒有 `{row_id}` 這一列 ⇒ 別名過期，從 idAliases 刪掉"})
            continue
        if ship is None:
            issues.append({"rowId": row_id, "shippedId": ship_id, "reason": "shipped-id-not-found",
                           "detail": f"content/champions/ 今天沒有 `{ship_id}` ⇒ 別名指向不存在的英雄"})
            continue
        inv_name = row.get("heroName", "").strip()
        ship_name = str(ship.get("name", "")).strip()
        if inv_name != ship_name:
            issues.append({"rowId": row_id, "shippedId": ship_id, "reason": "display-name-disagrees",
                           "detail": f"盤點表寫「{inv_name}」而出貨寫「{ship_name}」"
                                     " ⇒ ⛔ 這一對可能不是同一個人，別名**不套用**"})
            continue
        alias_of[row_id] = ship_id
        aliased_ship[ship_id] = row_id
    return alias_of, aliased_ship, issues


def audit(inventory: Path, repo: Path) -> dict:
    """⭐ 一次回答三題，⛔ 而且每個數字都附**分母與探針**。"""
    lod = json.loads((repo / "content/config/model-lod.json").read_text(encoding="utf-8"))
    shipped_limit = int(lod["championChannelLimit"])

    rows = parse_inventory(inventory)
    inv_ids = {r["heroId"] for r in rows}
    shipped = load_shipped(repo)

    # ── ⓪ ⭐ **先驗那把鑰匙** ───────────────────────────────────
    # ⛔ 兩邊的 id 不同命名空間時，直接 join 會把同一批人數兩次（正向一次、反向一次）。
    alias_of, aliased_ship, alias_issues = _resolve_aliases(rows, shipped)

    # ⭐ 反向的母體：⛔ 不是「全部出貨英雄」——盤點表本來就不管 `godie-*` 與骨架。
    community = {
        k: v for k, v in shipped.items()
        if not k.startswith("godie-") and k not in SKELETON_HERO_IDS
    }

    # ── ① 阻塞理由過期沒 ─────────────────────────────────────────
    stale = []
    for b in stale_blockers(inventory, shipped_limit):
        stale.append({**b, "rowId": _row_id(b["row"])})

    # ── ② 正向：表上有、出貨沒有（⭐ 驗過的別名算「有」）──────────
    forward_gap = sorted(i for i in inv_ids if i not in shipped and i not in alias_of)

    # ── ③ 反向：出貨有、表上沒有（⭐ 變身態的豁免是**推導**的）──────
    reverse_gap, alternates_exempted = [], []
    for hid in sorted(community):
        # ⭐ 直接同名，或**驗過的別名**指到它 ⇒ 表上有這個人。
        if hid in inv_ids or hid in aliased_ship:
            continue
        tf = community[hid].get("transform") or {}
        counterpart = tf.get("counterpartId")
        if tf.get("role") == "alternate" and counterpart in inv_ids:
            alternates_exempted.append({"id": hid, "counterpartId": counterpart})
            continue
        reverse_gap.append(hid)

    return {
        "shippedLimit": shipped_limit,
        "denominators": {
            "inventoryRows": len(rows),
            "shippedChampions": len(shipped),
            "shippedCommunity": len(community),
        },
        "probes": {
            "skeletonHeroIds": sorted(SKELETON_HERO_IDS),
            "alternatesExempted": alternates_exempted,
            "inventorySections": sorted({r["section"] for r in rows}),
            # ⭐ 別名要印出來 —— ⛔ 一個消掉落差的機制不可以是隱形的。
            "idAliasesApplied": [{"rowId": k, "shippedId": v} for k, v in sorted(alias_of.items())],
        },
        "staleBlockers": stale,
        "forwardGap": forward_gap,
        "reverseGap": reverse_gap,
        "aliasIssues": alias_issues,
    }


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--inventory", type=Path, required=True)
    ap.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[2])
    a = ap.parse_args()
    print(json.dumps(audit(a.inventory, a.repo), ensure_ascii=False, indent=2))
