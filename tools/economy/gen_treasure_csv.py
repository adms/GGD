#!/usr/bin/env python3
"""寶具總表 CSV —— 給 owner 逐件審查／補充用（owner 2026-08-18 要的那一份）。

    python3 tools/economy/gen_treasure_csv.py            # 寫出 寶具總表_EX三階.csv
    python3 tools/economy/gen_treasure_csv.py --check    # 產物過期就回非零

⭐ 欄位逐格對齊 owner 手上那份 `三選一增益卡_重新設計.csv` 的習慣：
   結構化欄位（權重／引擎機制／tags／翻盤力）是**參考**，owner 實際會動的是
   最後兩欄「設計意圖／審查意見」與「修改需求」。

⛔ **一切從出貨資料推導，沒有任何手寫清單。**
   · 階級 ← 這件寶具在哪一張 loot table（⛔ 不看 tags —— tags 不是判準，
     2026-08-18 量到 2 件有 legendary 標籤卻不在任何池、4 件在池裡卻沒標籤）
   · 出現回合 ← `config.arena-rules@1.weaponTiers` 那一列的 minRound/maxRound
   · 效能 ← 卡面 description 的「效能」段逐行（⛔ 不重寫，那是玩家看到的字）
   · 引擎機制 ← 這份 JSON 真的用到的 effect kind / modifier op / hook 事件
   · 翻盤力 ← 從**推翻勝負條件**的機制推導（復活／斬殺／擋致命／團隊光環／
     解鎖上限／飛行／額外施放），⛔ 不是主觀評分

⚠️ 這份文件**刻意沒有產生日期** —— 任何隨時鐘變動的欄位都會讓 `--check` 的
逐位元組比對永遠不相等，於是閘只能被放寬成模糊比對，而一條被放寬的閘等於沒有閘。
（與 `caps:export` / `spec:build` 同一個理由。）
"""
from __future__ import annotations

import csv
import io
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "content"
OUT = ROOT / "寶具總表_EX三階.csv"

COLUMNS = [
    "階級", "id", "寶具名", "權重", "出現回合", "抽中機率", "每隊/每角上限",
    "效能（卡面逐行）", "翻盤力", "引擎機制", "tags", "設計意圖／審查意見", "修改需求",
]

# 推翻勝負條件的機制 → 翻盤力權重。⛔ 不是主觀評分，是「它動到哪一層規則」。
SWING = [
    ("revive", 3, "復活"),
    ("cheatDeath", 3, "擋致命"),
    ("execute", 3, "斬殺"),
    ("auras", 2, "團隊光環"),
    ("capRaise", 2, "解鎖上限"),
    ("flight", 2, "飛行"),
    ("proxyCast", 2, "額外施放"),
    ("hardCC", 1, "硬控"),
    ("trueDamage", 1, "真傷"),
]


def _walk(node, fn):
    if isinstance(node, list):
        for v in node:
            _walk(v, fn)
    elif isinstance(node, dict):
        fn(node)
        for v in node.values():
            _walk(v, fn)


def swing_marks(doc: dict) -> list[str]:
    """這份文件動到哪幾層規則。⛔ 讀結構，不讀描述文字。"""
    found: set[str] = set()

    def visit(o: dict) -> None:
        k = o.get("kind")
        if k == "revive":
            found.add("revive")
        if k == "proxyCast":
            found.add("proxyCast")
        if k == "block":
            found.add("cheatDeath")
        if o.get("damageType") == "true":
            found.add("trueDamage")
        if o.get("stun") is True or o.get("root") is True or o.get("feared") is True:
            found.add("hardCC")
        if o.get("op") in ("capRaise", "capRaisePct"):
            found.add("capRaise")
        if isinstance(o.get("flight"), dict):
            found.add("flight")
        if o.get("hpPctThreshold") is not None or o.get("executeBelowPct") is not None:
            found.add("execute")

    _walk(doc, visit)
    if doc.get("auras"):
        found.add("auras")
    # 「斬殺」在出貨內容裡多半是卡面用語 + 一條 hpPct 條件，補一個保守的文字旁證：
    if "斬殺" in (doc.get("description") or ""):
        found.add("execute")
    return [label for key, _, label in SWING if key in found]


def swing_score(doc: dict) -> int:
    marks = set(swing_marks(doc))
    return sum(w for _, w, label in SWING if label in marks)


def mechanisms(doc: dict) -> list[str]:
    kinds: set[str] = set()
    hooks: set[str] = set()
    ops: set[str] = set()

    def visit(o: dict) -> None:
        if isinstance(o.get("kind"), str):
            kinds.add(o["kind"])
        if isinstance(o.get("on"), str):
            hooks.add(o["on"])
        if isinstance(o.get("op"), str):
            ops.add(o["op"])

    _walk(doc, visit)
    return sorted(kinds) + sorted(hooks) + sorted(ops)


def efficacy_lines(doc: dict) -> str:
    """卡面「效能」段逐行。⛔ 不重寫 —— 那是玩家真的看到的字。"""
    desc = (doc.get("description") or "").split("\n")
    out: list[str] = []
    on = False
    for line in desc:
        s = line.strip()
        if s in ("效能", "合成後效能"):
            on = True
            continue
        if s == "解說":
            break
        if on and s:
            out.append(s)
    return "\n".join(out)


def build() -> str:
    tiers = json.loads((CONTENT / "config" / "arena-rules.json").read_text("utf-8")).get(
        "weaponTiers", []
    )
    # 池 id → 這一階的參數。基礎池不在 weaponTiers 裡（它是第 2/5 回合的 weaponLootTable）。
    by_table = {t["table"]: t for t in tiers if t.get("table")}

    rows: list[dict[str, str]] = []
    for path in sorted((CONTENT / "loot-tables").glob("*.json")):
        if path.name == "_index.json":
            continue
        table = json.loads(path.read_text("utf-8"))
        tid = table.get("id", path.stem)
        row_tier = by_table.get(tid)
        label = (row_tier or {}).get("label") or ("EX" if tid == "legendary-weapons" else tid)
        if row_tier:
            lo, hi = row_tier.get("minRound"), row_tier.get("maxRound")
            when = f"{lo}–{hi}" if hi else f"{lo}+"
            pct = f'{row_tier.get("basePct", "")}%'
            lim = f'{row_tier.get("limitScope","")} 限 {row_tier.get("limitCount","")}'
        else:
            when, pct, lim = "2 / 5", "—", "—"
        for entry in table.get("entries", []):
            iid = entry["itemId"]
            f = CONTENT / "items" / f"{iid}.json"
            if not f.exists():
                continue
            doc = json.loads(f.read_text("utf-8"))
            marks = swing_marks(doc)
            rows.append(
                {
                    "階級": label,
                    "id": iid,
                    "寶具名": doc.get("name", ""),
                    "權重": str(entry.get("weight", 1)),
                    "出現回合": when,
                    "抽中機率": pct,
                    "每隊/每角上限": lim,
                    "效能（卡面逐行）": efficacy_lines(doc),
                    "翻盤力": f"{swing_score(doc)}｜{'·'.join(marks) if marks else '數值型'}",
                    "引擎機制": " ".join(mechanisms(doc)),
                    "tags": ",".join(doc.get("tags", [])),
                    "設計意圖／審查意見": "",
                    "修改需求": "",
                }
            )

    order = {"EX": 0}
    rows.sort(key=lambda r: (order.get(r["階級"], 1), r["階級"], -swing_int(r), r["寶具名"]))
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=COLUMNS, lineterminator="\n")
    w.writeheader()
    w.writerows(rows)
    return buf.getvalue()


def swing_int(row: dict[str, str]) -> int:
    try:
        return int(row["翻盤力"].split("｜")[0])
    except (ValueError, IndexError):
        return 0


def main() -> int:
    text = build()
    # ⛔ 件數要用**解析回來的列數**，不是數換行 —— 「效能」欄是多行的，
    # 數換行會報出 204 這種三倍大的假數字（而它看起來完全像真的）。
    rows_n = sum(1 for _ in csv.DictReader(io.StringIO(text)))
    if "--check" in sys.argv:
        if not OUT.exists() or OUT.read_text("utf-8") != text:
            print(f"⛔ {OUT.name} 過期 —— 跑 `python3 tools/economy/gen_treasure_csv.py`")
            return 1
        print(f"✓ {OUT.name} 是最新的")
        return 0
    OUT.write_text(text, "utf-8")
    print(f"✓ 寫出 {OUT}（{rows_n} 件寶具）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
