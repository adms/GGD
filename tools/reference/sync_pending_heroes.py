#!/usr/bin/env python3
"""sync_pending_heroes.py — 從**另一個 repo** 的權威狀態頁重抽「待上架」英雄快照。

⭐ 為什麼要有這支（⛔ 不是手抄一次就算了）
─────────────────────────────────────────────────────────────────────────────
`docs/全英雄列表.md` 讀的是 `content/champions/`，⇒ 它只看得到**已經進 repo** 的英雄。
而 owner 的 126 名範圍裡有 **45 名還沒進來**（LoL 第二批 11 ＋ 已取得模型／重上架 34）。

那 45 名的權威狀態住在**另一個 repo**：
  GGD-community-acquired-heroes/docs/editor-contract/社群英雄126名上架狀態.md

⛔ 產生器**不可以**直接讀它 —— 那個 repo 不保證在（CLAUDE.md：「換機時：⛔ 有文件不等於有素材」），
而 `docs/全英雄列表.md` 必須在**每一台機器**上算出同樣的位元組。

⇒ ⭐ 同 `docs/reference/_curation-snapshot.json` 的模式：
   **進版控的快照**是產生器的輸入，⛔ 而這支腳本是唯一的寫入端。

⚠️ ⭐ 這**不違反**第〇·四守則（同一個值不可以有兩個住處）：
   來源仍然只有一個（那份狀態頁），⭐ 這裡是它的**快照**，而快照有唯一的重抽路徑。
   ⛔ 違反的會是「有人手打一份 45 名的清單」—— 那才是第二個住處。

用法
────
  python3 tools/reference/sync_pending_heroes.py            # 重抽並寫入
  python3 tools/reference/sync_pending_heroes.py --check    # 來源不在就**跳過並明說**；在就比對，不同 ⇒ exit 1

⚠️ `--check` 在來源缺席時**明說跳過**（⛔ 不是安靜地過）——
   安靜的跳過與「比對過而且一致」長得一模一樣（CLAUDE.md：fail-open 沒錯，靜默才是缺陷）。

環境變數 `GGD_ACQUIRED_REPO` 覆寫來源 repo 的位置。
"""

import json
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(REPO, "docs", "_data", "pending-heroes.json")

DEFAULT_SRC_REPO = os.path.expanduser(
    "~/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-acquired-heroes"
)
STATUS_REL = "docs/editor-contract/社群英雄126名上架狀態.md"
MACHINE_REL = "docs/community-hero-forge/release-resources-126.json"

#: 要抽的兩節 —— (狀態頁的節標題, 這一批的票號)。
#: ⭐ 第一批 37／第二批 37／LoL 第一批 7 **刻意不在這裡**：它們的卡已經在 `content/champions/`，
#: ⇒ `全英雄列表.md` 本來就印得到它們（⛔ 印兩次才是第二個住處）。
SECTIONS = (
    ("LoL 第二批（11）", "LoL 第二批", "GH#1185"),
    ("已取得模型／重上架舊角（34）", "已取得模型／重上架舊角", "GH#1205"),
)


def section_body(text, head):
    m = re.search(r"^## " + re.escape(head) + r".*?$(.*?)(?=^## |\Z)", text, re.S | re.M)
    return m.group(1) if m else ""


def parse_rows(body):
    """`| 1 | \\`id\\` | 角色 | 狀態 |` —— ⛔ 只認這個形狀，多一欄少一欄都不要猜。"""
    out = []
    for line in body.split("\n"):
        m = re.match(r"\|\s*\d+\s*\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|", line)
        if m:
            out.append({"id": m.group(1), "name": m.group(2).strip(), "status": m.group(3).strip()})
    return out


def build(src_repo):
    with open(os.path.join(src_repo, STATUS_REL), encoding="utf-8") as f:
        text = f.read()
    groups = []
    for head, label, ticket in SECTIONS:
        rows = parse_rows(section_body(text, head))
        if not rows:
            sys.exit(f"⛔ 來源的「{head}」一列都沒抽到 —— 表格形狀變了？⛔ 不要猜，去看來源。")
        groups.append({"batch": label, "ticket": ticket, "rows": rows})
    return {
        "schema": "ggd-pending-heroes@1",
        "note": (
            "⭐ **還沒進 `content/champions/` 的英雄**（待上架）。⛔ 這不是第二份名單 —— "
            "它是**另一個 repo** 的權威狀態頁在本 repo 的**進版控快照**，理由與 "
            "`docs/reference/_curation-snapshot.json` 相同：產生器要在**每一台機器**上算出同樣的位元組，"
            "而那份來源不保證在（換機時有文件不等於有素材）。"
            "⛔ 不要手改：跑 `python3 tools/reference/sync_pending_heroes.py` 從來源重抽。"
        ),
        "source": {
            "repo": "GGD-community-acquired-heroes",
            "path": STATUS_REL,
            "machineEntry": MACHINE_REL,
            "snapshotDate": "2026-09-11",
        },
        "statusDefinition": "已上架 = 已在 Main 當下正式服務確認可選，且有目前發布版本（來源逐字）。",
        "counts": {"pending": sum(len(g["rows"]) for g in groups)},
        "groups": groups,
    }


def main():
    check = "--check" in sys.argv[1:]
    src_repo = os.environ.get("GGD_ACQUIRED_REPO", DEFAULT_SRC_REPO)
    status = os.path.join(src_repo, STATUS_REL)

    if not os.path.exists(status):
        # ⭐ 明說跳過（⛔ 不是安靜地過）—— 這台機器沒有那個 repo 是**正常的**。
        print(f"⏭  來源不在這台機器上（{status}）⇒ **跳過比對**，⛔ 沒有驗到任何東西。"
              f" 設 GGD_ACQUIRED_REPO 指向它，或在有那個 repo 的機器上跑。")
        return 0

    doc = build(src_repo)
    body = json.dumps(doc, ensure_ascii=False, indent=2) + "\n"
    current = ""
    if os.path.exists(OUT):
        with open(OUT, encoding="utf-8") as f:
            current = f.read()

    if check:
        if body != current:
            sys.exit("stale — 跑 `python3 tools/reference/sync_pending_heroes.py`："
                     f"{os.path.relpath(OUT, REPO)} 與來源狀態頁對不上")
        print(f"pending-heroes 快照與來源一致（{doc['counts']['pending']} 名待上架）")
        return 0

    if body != current:
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        with open(OUT, "w", encoding="utf-8") as f:
            f.write(body)
        print(f"wrote {os.path.relpath(OUT, REPO)} — {doc['counts']['pending']} 名待上架")
    else:
        print(f"unchanged — {doc['counts']['pending']} 名待上架")
    return 0


if __name__ == "__main__":
    sys.exit(main())
