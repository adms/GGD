#!/usr/bin/env python3
"""「逐則對票」表格的**唯一寫入者** —— 新列插進**表格裡**，⛔ 不是檔尾。

owner 2026-08-20：

    「🧾 逐則對票 · owner 的每一句話在哪張票上 => **你要持續更新吧**」

⚠️ 這支存在的理由是一個**量到的**缺陷，不是潔癖。`scripts/ruling.sh` 原本用
`grep -q '^## 逐則對票'` 確認「表格存在」，然後把新列 `>>` **附加到檔尾**。
於是 2026-08-20 那天七則裁決落在兩個錯的地方：

    docs/_daily/2026-08-20.md:84-86   ← 併進 `## ⏸️ 真正還卡在你身上的` 那張**兩欄**表
    docs/_daily/2026-08-20.md:131-134 ← 檔尾一段**沒有表頭**的孤兒表格

兩處都在 `## 逐則對票` 區段**外面**，所以 `tools/board/gen_board.py` 的
`section(daily, "逐則對票")`（抓標題到下一個同級標題）**一列都讀不到** ——
作戰板上那一區缺了七則，而寫入端每一次都回報「✓ 已寫入」。
⭐ 又一次「壞掉跟正常長得一模一樣」。

⇒ `ruling.sh`（裁決）與 `message-ledger.sh`（每一則訊息）**共用這一支**，
⛔ 不各寫一份會各自腐爛的插入邏輯（第零守則⑨：第二個只差參數就先抽模板）。

    python3 scripts/ledger_table.py <帳本.md> <HH:MM> <票號> [--id <身分>]   # 逐字原話走 stdin
    python3 scripts/ledger_table.py --map <帳本.md> <HH:MM 或 身分> <票號>   # 填某一列的票號
    python3 scripts/ledger_table.py --dedupe <帳本.md>              # 併掉重複列
    python3 scripts/ledger_table.py --regen <帳本.md>               # 只重生成吃帳本的兩支產生器

⭐ GH#1026 ①：帳本是 `board:roll` 與 `board:build` 的**輸入** —— **每一個**寫入端收工都要自己
重生成它們（`regenerate_boards()`，一份），⛔ 不等 `skills:check` 紅：2026-09-06 一夜紅了三次，
三次擋的都是 Codex 的 PR。
"""
from __future__ import annotations

import os
import re
import shlex
import subprocess
import sys
from pathlib import Path

#: 這張表的正規形狀。⛔ 欄位改了要連 `gen_board.py` 的呈現一起想。
CANON_HEAD = ["時間", "owner 說了什麼（逐字）", "票"]
UNMAPPED = "⏸ 未對票"

#: 找不到表格時新建的那一節。⚠️ 標題**含「逐則對票」**是硬需求 ——
#: `gen_board.py` 用 `.*逐則對票.*` 抓區段，改字會讓作戰板靜默少一區。
SECTION_TITLE = "## 逐則對票 · 每一則訊息（`scripts/message-ledger.sh` 維護）"
SECTION_NOTE = (
    "> ⭐ 這張表由 `scripts/message-ledger.sh` 從 session transcript **逐則**撈出來對帳，\n"
    "> `scripts/ruling.sh` 收到裁決時也寫進同一張表。\n"
    "> 表格那一格是**截斷**過的；⛔ 全文沒有被壓縮取代，它在 `ledger-source_temp_*.md`。\n"
    f"> 票號那一格 ⛔ 不可以留空：對不到票就寫 `{UNMAPPED}`，`--check` 會紅。\n"
)


# ⭐ 表格欄位要在**沒有被跳脫**的 `|` 上切,⛔ 不是裸 split("|")。
#
# ⚠️ 前科（owner 2026-08-22:「GGD作戰版的一個表格好像格式跑掉了」）:
# `cell()` 一直都有把內容裡的 `|` 跳脫成 `\|`,但**兩個讀端都用裸 split**,
# 於是在跳脫字元上切開 —— 一則裡面內嵌 Markdown 表格的裁決,
# 在作戰板上炸成十幾個 <td>,每一格結尾還掛著一個孤兒 `\`。
# ⛔ 沒有任何東西變紅:HTML 仍然合法,只是讀不懂。
def split_cells(line: str) -> list[str]:
    out, buf, esc = [], [], False
    for ch in line.strip().strip("|"):
        if esc:
            buf.append(ch if ch == "|" else "\\" + ch)
            esc = False
        elif ch == "\\":
            esc = True
        elif ch == "|":
            out.append("".join(buf).strip()); buf = []
        else:
            buf.append(ch)
    if esc:
        buf.append("\\")
    out.append("".join(buf).strip())
    return out


def cells(line: str) -> list[str]:
    return split_cells(line)


def cell(text: str, limit: int = 0) -> str:
    """把一段可能跨行的原話壓成一格 Markdown 儲存格。"""
    s = re.sub(r"\s+", " ", text).strip()
    if limit and len(s) > limit:
        s = s[:limit].rstrip() + "…"
    return s.replace("|", r"\|")


def _table_end(lines: list[str]) -> int | None:
    """回傳「正規表格最後一列的下一行」的索引；找不到回 None。

    ⚠️ 標題**可能帶後綴**（今天那份就是 `## 逐則對票 —— #1069–#1084（…）`），
    所以比對是 `startswith`，⛔ 不是相等。
    ⚠️ 取**最後**一個符合的區段：同一份帳本可以有「補登的歷史區塊」與
    「腳本維護的正規表格」兩張，寫入端只碰後者。
    """
    found = None
    for i, ln in enumerate(lines):
        if not re.match(r"^#{2,3} .*逐則對票", ln):
            continue
        j = i + 1
        while j < len(lines) and not re.match(r"^#{2} ", lines[j]):
            if lines[j].startswith("|") and cells(lines[j])[:1] == CANON_HEAD[:1]:
                k = j
                while k + 1 < len(lines) and lines[k + 1].startswith("|"):
                    k += 1
                found = k + 1
                break
            j += 1
    return found


def ensure(path: Path) -> list[str]:
    """把帳本讀成行陣列，必要時補上檔頭與正規表格。"""
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        _unlock(path)
        path.write_text(f"# {path.stem}\n", encoding="utf-8")
    lines = path.read_text(encoding="utf-8").split("\n")
    if _table_end(lines) is None:
        while lines and not lines[-1].strip():
            lines.pop()
        lines += [
            "",
            SECTION_TITLE,
            "",
            SECTION_NOTE.rstrip("\n"),
            "",
            "| " + " | ".join(CANON_HEAD) + " |",
            "|" + "---|" * len(CANON_HEAD),
        ]
    return lines


def _unlock(path: Path) -> None:
    """🔒 產物隔離區：這份帳本是**別的步驟**（board:build 那一族）的產物 ⇒ 平時 chmod 444。

    ⭐ 隔離區的設計要求**寫入點自解鎖**（`writeProduct()` 的 python 版）——
    ⛔ 不是叫人手動 chmod。2026-08-26 已在 `gen_contract_numbers.py`、
    `apply_placeholders.ts` 各補過同一件事,這是第三處。

    ⚠️ 這是 GH#771 修好戶籍前的**過渡 OK 繃**：戶籍表曾以量測那天的字面日期路徑
    記這份產物 ⇒ 隔天 genrun/quarantine 解鎖不到「今天」那一份，只好在寫入點自解鎖。
    戶籍已改以 glob 宣告（`tools/parallel-gates/merge-io.mjs` 的 DATE_FAMILIES）——
    glob 生效、genrun 解鎖得到之後，這段可拆。
    """
    try:
        path.chmod(0o644)
    except OSError:
        pass  # 唯讀檔案系統／別人的檔 —— 讓下面的 write 用它自己的錯誤說話


# ── ⭐ 一則訊息的**身分**（GH#1255）────────────────────────────────────────────
#
# ⛔ 在此之前「兩列是不是同一則」有四個住處、各自用 `HH:MM`＋文字**猜**：建置去重鍵
#   `(day, HH:MM, t[:80])`、`_find_row`、`map_ticket` 的 `c[0] != when`、存檔標題 `## HH:MM`
#   ⇒ 同一分鐘兩則分不開（`--map` 把兩列填成同一段票欄）、同一分鐘逐字相同的兩則塌成一則。
# ⭐ 而 transcript 早就給了唯一身分：`"type": "user"` 的 `uuid`、`queued_command` 的 `source_uuid`。
#   ⇒ 身分＝那個 uuid 的前 8 碼；帳本列把它放在原話格尾**不渲染**的 `<!-- id:… -->`，
#     全文存檔放在 `## HH:MM · <身分>`。⛔ 帳本與存檔只**引用**它，不另算。
# ⚠️ 舊列（沒有身分）照舊用「同一分鐘 ＋ 同一段文字」認；建置器認到之後把身分蓋上去。
#
# ⚠️⚠️ 更正 b8b1009bd 的「格式與解析**只住** ledger_table.py」——那句說過頭了。量到的拼寫處（GH#1255 審查後）：
#   | 住處 | 拼的是什麼 | 誰守 |
#   |---|---|---|
#   | 這裡 `ID_LEN`／`_ID_MARK`／`with_id`／`--map` 的身分判定 | 帳本列標記 `<!-- id:… -->` 的寫、讀、剝 | ⭐ Python 端的唯一住處（gen_board.py、board-roll.sh 都 import `strip_id`） |
#   | `tools/admin-live/datasets/parallel-board.mjs` 的 `ID_MARK` | 同一個標記的剝除（JS 讀不到這裡） | `packages/shared/src/ops/ledgerIdMarkParity.test.ts`（叫這裡真的 `with_id`／`strip_id` 對照） |
#   | `scripts/message-ledger.sh` 的 `ARCHIVE_HEAD` 與存檔寫入 | **另一種**格式：存檔段落標題 `## HH:MM · <身分>`（長度取這裡的 `ID_LEN`） | 讀寫同在那一支；`messageLedgerScript.test.ts` 斷言標題 |
#   | `scripts/ruling.sh` 解析 `--find-time` 第一行的正則 | 身分字元集與長度 `[0-9a-f]{8}` | ⛔ 沒有專屬閘（長度一改它會對不上 ⇒ 列鍵退回執行時間；見審查報告） |
ID_LEN = 8
_ID_MARK = re.compile(r"\s*<!-- id:([0-9a-f]{%d}) -->" % ID_LEN)


def short_id(uuid: str | None) -> str | None:
    """transcript 的 uuid → 帳本用的身分（前 8 碼）；沒有 uuid 回 None。"""
    s = re.sub(r"[^0-9a-f]", "", (uuid or "").lower())
    return s[:ID_LEN] if len(s) >= ID_LEN else None


def row_id(text: str) -> str | None:
    m = _ID_MARK.search(text or "")
    return m.group(1) if m else None


def strip_id(text: str) -> str:
    return _ID_MARK.sub("", text or "")


def with_id(text: str, mid: str | None) -> str:
    """原話格尾掛上身分（已經有就換掉）；沒有身分就原樣。"""
    return f"{strip_id(text).rstrip()} <!-- id:{mid} -->" if mid else text


def _norm(text: str) -> str:
    """同一句話在兩個寫入端手上可能長得不一樣（截斷位置、空白）—— 比對前先正規化。"""
    return re.sub(r"\s+", "", strip_id(text)).replace(r"\|", "|").rstrip("…")


#: 文字鑰匙的視窗 —— 與 `message-ledger.sh` 判「這則有沒有列」的 `WINDOW`（24）**同一個數字**，
#: ⛔ 不是另一個會各自漂的分母。
PREFIX_WINDOW = 24


def _prefix_len(x: str, y: str) -> int:
    n = 0
    for a, b in zip(x, y):
        if a != b:
            break
        n += 1
    return n


def _same_text(a: str, b: str) -> bool:
    """文字那一半。三種形狀算同一句（每一種都是量到的，⛔ 不是猜的）：

    · 太短的（「ok」）要求**全等**；
    · 截斷過的那一份是另一份的**前綴**（建置器 300 字截斷 vs `ruling.sh` 全文）；
    · ⭐ **前 24 字相同**：同一則訊息，一份在後面多接了字（截斷位置不同）。
      ⚠️ 這條**只在同一分鐘裡**成立（`_same_entry`）—— ⛔ 單獨拿 24 字去併會回到「ok/ok」那一次的毀損。
    """
    x, y = _norm(a), _norm(b)
    if len(x) < 12 or len(y) < 12:
        return x == y
    cp = _prefix_len(x, y)
    return cp >= min(len(x), len(y)) or cp >= PREFIX_WINDOW


def _lead(text: str) -> str:
    """`X => Y`／`X （⇒ 我的註）` 的**第一段**，去掉尾端的開括號／冒號。

    引用 owner 原話時我接在後面的註記（`（⇒ #1029 的出貨預設改成 …）`）⛔ 不算進鑰匙 ——
    它是**我的**字，而鑰匙要對的是**他的**字。
    """
    seg = re.split(r"=>|⇒", text, maxsplit=1)[0]
    return _norm(seg).rstrip("（(：:，,、")


def _same_entry(a_when: str, a_text: str, b_when: str, b_text: str) -> bool:
    """⭐ 「這一列已經存在」的**唯一判準** —— `_find_row`（追加）與 `dedupe`（清理）都問這一支（第〇·四守則）。

    ⭐⭐ **只有逐字同一則**：**同一分鐘** ＋ **同一段文字**（`_same_text`）。⛔ 沒有時間窗、⛔ 沒有子字串。

    owner 2026-09-12（逐字）：
    > 「我沒說過 我的原則**一定是詳實記錄不會合併** 這應該是你自己說的
    >  **請你要查證我說的話出處**」

    ⛔ 在此之前這裡住著 `_same_message`（文字相同 ＋ 15 分鐘窗）與 `_contains`（3 分鐘內子字串）——
    兩者來自 `9396c38d1`（GH#1028，⛔ **我自己開的票**），`asked-before.sh` 掃不到一則 owner 原話支持合併；
    2026-09-11 它把 owner 同一句話講的三次（17:45／17:47／17:56）併成一列（GH#1238）。
    `00e70d518` 拿掉了它們的**呼叫點**而函式、`exact_time` 旗標與 `authoritative_rows` 候選迴圈都還留著
    ⇒ ⛔ 一段宣稱有作用而其實沒有的程式（第三守則），這裡連同本體一起拿掉（歷史在 git 裡）。

    ⭐ 兩個寫入端記同一則時，**鍵要由寫入端自己對齊**，⛔ 不是靠這裡猜：
    `ruling.sh` 在 transcript 找到那一則 ⇒ 列鍵＝**訊息時間**、文字＝**transcript 的逐字原話**
    ⇒ 建置器補列時逐字命中，只併票號。找不到 ⇒ 各留一列（多一列無害，⭐ 少一列是把他的話弄丟）。

    ⭐ GH#1255：兩邊都帶**身分**（`<!-- id:… -->`）⇒ **身分說了算** —— 同一分鐘逐字相同而 uuid 不同
    （owner 在兩個 session 各貼一次）是兩則；任一邊沒有身分（舊列、`ruling.sh` 找不到訊息）才退回上面的判準。
    """
    ia, ib = row_id(a_text), row_id(b_text)
    if ia and ib:
        return ia == ib
    return a_when == b_when and _same_text(a_text, b_text)


def _pick_text(a_text: str, b_text: str) -> str:
    """同一則（`_same_entry`）的兩份文字留哪一份：**包含對方第一段**的那一份
    （owner 的全句包著我引用的片段）；再不然取長的（截斷少）。"""
    if len(_lead(b_text)) >= 12 and _lead(b_text) in _norm(a_text):
        return a_text
    if len(_lead(a_text)) >= 12 and _lead(a_text) in _norm(b_text):
        return b_text
    return a_text if len(_norm(a_text)) >= len(_norm(b_text)) else b_text


def _merge_tickets(a: str, b: str) -> str:
    """兩格票號取**聯集**（⛔ 不是誰後到誰贏）。未對票讓路給任何已決定的值。"""
    a, b = a.strip(), b.strip()
    if not decided(a):
        return b or a
    if not decided(b):
        return a
    seen, out = set(), []
    for tok in (a + " " + b).split():
        key = tok.lstrip("#")
        if key not in seen:
            seen.add(key); out.append(tok)
    return " ".join(out)


def _set_cell(ln: str, idx: int, value: str) -> str:
    """只改第 idx 格的位元組（idx=0 時間、-1 票號），其餘一個都不碰 —— 重建整列會吃掉跳脫。"""
    p = _pipes(ln)
    if len(p) < 2:
        return ln
    lo = p[idx] if idx >= 0 else p[idx - 1]
    hi = p[idx + 1] if idx >= 0 else p[idx]
    return ln[:lo + 1] + f" {value} " + ln[hi:]


def _find_row(lines: list[str], text: str, when: str) -> int | None:
    """找**逐字同一則**（`_same_entry`：同一分鐘 ＋ 同一段文字）已經在表裡的那一列；沒有回 None。

    ⛔⛔ 【⛔ 不要合併 —— owner 2026-09-12 逐字】
    > 「我沒說過 我的原則**一定是詳實記錄不會合併** 這應該是你自己說的」
    ⇒ 其餘一律各留一列。判準住 `_same_entry` 一處（見那裡的來由）。
    """
    for i, ln in enumerate(lines):
        if not ln.startswith("|"):
            continue
        c = cells(ln)
        if len(c) < 3 or not re.fullmatch(r"\d{1,2}:\d{2}", c[0]):
            continue
        if _same_entry(c[0], c[1], when, text):
            return i
    return None


def _raw_cell(ln: str, idx: int) -> str:
    """第 idx 格**沒有解跳脫**的原始位元組（`cells()` 會把 `\\|` 還原，寫回去要用這一份）。"""
    p = _pipes(ln)
    return ln[p[idx] + 1:p[idx + 1]].strip() if len(p) > idx + 1 else ""


def insert(
    path: Path,
    rows: list[tuple[str, str, str]],
    prefer_incoming_text: bool = False,
) -> int:
    """把 rows 插進正規表格**最後一列之後**。回傳實際**新增**的列數。

    ⭐ **逐字同一則**（`_same_entry`：同一分鐘 ＋ 同一段文字）已經在表裡 ⇒ ⛔ 不新增第二列，
    只把票號**併**進既有那一列（兩個寫入端記的是**同一則**：`ruling.sh` 找得到訊息時間時，
    它寫的鍵與建置器逐字相同）。⛔ 其餘一律新增一列 —— owner 2026-09-12「詳實記錄不會合併」。
    ⭐ 文字那一格：`prefer_incoming_text=True`（建置器 —— 它的字**逐字**來自 transcript）⇒ 來的贏；
    否則照 `_pick_text()`（包著對方第一段的／長的）。⛔ 不可以把 owner 的原話換成我的改述。
    """
    if not rows:
        return 0
    lines = ensure(path)
    added = 0
    for when, text, tk in rows:
        hit = _find_row(lines, text, when)
        if hit is not None:
            c = cells(lines[hit])
            ln = _set_cell(lines[hit], -1, cell(_merge_tickets(c[2], tk)))
            keep = text if prefer_incoming_text else _pick_text(_raw_cell(ln, 1), text)
            lines[hit] = _set_cell(ln, 1, with_id(keep, row_id(text) or row_id(_raw_cell(ln, 1))))
            continue
        at = _table_end(lines)
        assert at is not None  # ensure() 保證有表格
        lines[at:at] = ["| " + " | ".join((when, text, tk)) + " |"]
        added += 1
    _unlock(path)
    path.write_text("\n".join(lines).rstrip("\n") + "\n", encoding="utf-8")
    return added


def stamp_ids(path: Path, adopt: dict[int, str]) -> int:
    """把身分蓋到**舊列**上（`{行號(1 起): 身分}`，由 `message-ledger.sh` 的認領算出來）。

    ⭐ 只動原話那一格的**格尾**，文字與票號一個位元組都不碰（⛔ 不把手補的節錄換成 transcript 全文）。
    """
    if not adopt:
        return 0
    lines = path.read_text(encoding="utf-8").split("\n")
    for n, mid in adopt.items():
        ln = lines[n - 1]
        lines[n - 1] = _set_cell(ln, 1, with_id(_raw_cell(ln, 1), mid))
    _unlock(path)
    path.write_text("\n".join(lines).rstrip("\n") + "\n", encoding="utf-8")
    return len(adopt)


def dedupe(path: Path) -> int:
    """把表裡**已經存在**的重複列併掉（GH#1028 的一次性清理）。回傳併掉的列數。"""
    if not path.exists():
        return 0
    lines = path.read_text(encoding="utf-8").split("\n")
    kept: list[int] = []
    drop: list[int] = []
    for i, ln in enumerate(lines):
        if not ln.startswith("|"):
            continue
        c = cells(ln)
        if len(c) < 3 or not re.fullmatch(r"\d{1,2}:\d{2}", c[0]):
            continue
        for k in kept:
            kc = cells(lines[k])
            # ⭐⭐ 【`--dedupe` 只准併**同一分鐘**的列】（GH#1238）
            #
            # ⛔ 在此之前這裡用 `_same_message`（文字相同 ＋ 15 分鐘窗）——
            # ⚠️ 而那會**主動刪掉 owner 的訊息**：2026-09-11 他同一句話講了三次
            # （17:45 / 17:47 / 17:56），`--dedupe` 把三列併成一列
            # ⇒ ⭐ 「他重講了三遍」這個事實**當場消失**，而那本身就是重要資訊
            #   （代表我沒聽懂）。
            #
            # ⭐ 追加（`_find_row`）與這裡（`--dedupe`）問的是**同一個**判準 `_same_entry`：
            #   同一分鐘 ＋ 同一段文字。⛔ 在此之前這裡的註解寫「`find_row` 保留時間窗」——
            #   `00e70d518` 之後那句話就是假的（owner 2026-09-12「詳實記錄不會合併」）。
            #
            # ⚠️ ⭐ 而「寧可留兩列」是**安全的方向**：帳本是從 session transcript
            # **重建**的（`message-ledger.sh` 檔頭：「唯一可靠的來源是 session
            # transcript(它不會忘)」）⇒ ⭐ 多一列無害，⛔ 少一列要靠重建才回得來。
            if _same_entry(kc[0], kc[1], c[0], c[1]):
                merged = _set_cell(lines[k], -1, cell(_merge_tickets(kc[2], c[2])))
                a, b = _raw_cell(lines[k], 1), _raw_cell(ln, 1)
                lines[k] = _set_cell(merged, 1, with_id(_pick_text(a, b), row_id(a) or row_id(b)))
                drop.append(i)
                break
        else:
            kept.append(i)
    if drop:
        lines = [ln for i, ln in enumerate(lines) if i not in set(drop)]
        _unlock(path)
        path.write_text("\n".join(lines).rstrip("\n") + "\n", encoding="utf-8")
    return len(drop)


def decided(ticket_cell: str) -> bool:
    """票號那一格「有沒有人決定過」。⭐ 兩種合法值：對到票的號碼，或 `— <理由>`。

    ⭐ **唯一住處**（第〇·四守則）：`scripts/message-ledger.sh --check` 與下面的
    `map_ticket()` 都問這一支，⛔ 不各自帶一份會漂掉的正則。

    ⚠️ 這條規則在 2026-08-30 之前寫在 `message-ledger.sh` 裡且是 `#\\d{2,4}` ——
    **強制要有 `#`**，而 `#` 是排版⛔ 不是語意。實測 5 列**已經對到票**的列被誤報成
    「未對票」（2026-08-20 的 `447` × 3、2026-08-28 的 `860` / `863`）。
    ⭐ 之前沒有人發現，是因為那道閘只看**今天**；一旦開始掃已結束的日子，
    那 5 個假紅就會淹掉真紅（GH#876）。
    ⛔ 仍然拒絕：留空、`⏸ 未對票`（兩者都沒有數字）。
    """
    s = ticket_cell.strip()
    return bool(re.search(TICKET_NO, s)) or s.startswith(("—", "–"))


#: 票號那一格裡「一個票號」的樣子：`#877` 或 `877`（`#` 是排版 ⛔ 不是語意，見 `decided()`）。唯一住處。
TICKET_NO = r"(?<!\d)#?(\d{2,4})(?!\d)"

#: 票號那一格「**整格都是票號**」的樣子（`1157 1158`、`#1243,#1246`、`991、1024`）—— 只有這種格的裸數字算提到。
PURE_TICKET_CELL = r"#?\d{2,4}(?:(?:\s*[,，、/]\s*|\s+)#?\d{2,4})*"


def board_tickets(text: str) -> set[int]:
    """一份戰情版（或帳本）**提到**的票號（GH#1256，`bmpndd.sh` 的 M 步問它）。

    · 任何地方的 `#n`。
    · 逐則對票列（第一格 `HH:MM`）的票號格**整格都是票號**時，沒寫 `#` 的也算（`| 1157 1158 |`）。
    · ⛔ 散文裡的裸數字**不算**（「同 17:00 那一串」「117 列」「130 名」「2026」）——
      ⭐ 算進去是**空轉綠燈的方向**：一張開著的票剛好撞到散文裡的數字 ⇒ M 靜默不報它。
    ⚠️ 量到（a3a179e09 的 `戰情版-20260914.md`，204 列）：只認 `#n` 106 張；這一支 132 張（純票號格補回 26 張）。
      ⛔ 上一版（96e6ede6b）寫「181 張、舊寫法誤報 75 張」是**被散文數字灌大的** ——
      那 75 張裡 49 張來自票號格的散文（時間拆出來的 0／2、列數、年份），只有 26 張是真的沒寫 `#` 的票號（修正輪審查抓到）。
    """
    out = {int(n) for n in re.findall(r"#(\d{2,4})(?!\d)", text)}
    for ln in text.split("\n"):
        if ln.startswith("|") and len(c := cells(ln)) >= 3 and re.fullmatch(r"\d{1,2}:\d{2}", c[0]):
            if re.fullmatch(PURE_TICKET_CELL, c[-1].strip()):
                out.update(int(n) for n in re.findall(TICKET_NO, c[-1]))
    return out


def _pipes(line: str) -> list[int]:
    """一列裡**沒有被跳脫**的 `|` 的位置（與 `split_cells()` 同一套規則）。"""
    out, esc = [], False
    for i, ch in enumerate(line):
        if esc:
            esc = False
        elif ch == "\\":
            esc = True
        elif ch == "|":
            out.append(i)
    return out


def map_ticket(path: Path, when: str, ticket: str) -> int:
    """把某一列的**票號那一格**填掉。回傳改到的列數（0 ＝ 找不到那一列）。

    ⭐ GH#1255：`when` 是 `HH:MM` **或身分**（8 碼）。
    · 身分 ⇒ 只改帶那個身分的那一列。
    · `HH:MM` 而那一分鐘有**兩列以上** ⇒ ⛔ 拒絕並列出候選的身分 —— 在此之前它把同一分鐘的
      **每一列**都填成同一段票欄（帳本裡 09-11 13:44／14:55、09-14 02:44 被迫寫成長句說明）。

    ⭐ 為什麼非有這支不可（GH#876）：帳本平時 chmod **444**，而 genguard 也擋
    Write／Edit ⇒ 在此之前 `--check` 印的那句修法指示（「再把每一列的票號填上」）
    **沒有任何合法路徑做得到** —— 只剩手動 chmod（CLAUDE.md 逐字禁止）或繞過 genguard。
    ⇒ 一條「紅了而修不了」的閘，與「永遠不會綠的閘」是同一個病的兩半。

    ⚠️ 只動**最後一格**：其餘位元組（含內容裡跳脫過的 `\\|`）一個都不碰 ——
    重建整列會把跳脫吃掉（`cells()` 是解跳脫的，2026-08-22 作戰板炸掉那次的形狀）。
    """
    if not decided(ticket):
        raise SystemExit(
            f"⛔ `{ticket}` 填了也還是「未對票」—— 票號那一格只有兩種合法值："
            f"票號（`#877` 或 `877`）或 `— <為什麼不需要開票>`")
    lines = path.read_text(encoding="utf-8").split("\n")
    by_id = bool(re.fullmatch(r"[0-9a-f]{%d}" % ID_LEN, when))
    targets = [
        i for i, ln in enumerate(lines)
        if ln.startswith("|") and len(c := cells(ln)) >= 3 and re.fullmatch(r"\d{1,2}:\d{2}", c[0])
        and (row_id(c[1]) == when if by_id else c[0] == when) and len(_pipes(ln)) >= 2
    ]
    if not by_id and len(targets) > 1:
        cands = "\n".join(
            f"   · {row_id(cells(lines[i])[1]) or '（沒有身分 —— 先跑 `pnpm msgledger:build --date <日>` 補上）'}"
            f"  {strip_id(cells(lines[i])[1])[:50]}…" for i in targets)
        raise SystemExit(f"⛔ {path} 的 {when} 有 {len(targets)} 列 —— 用**身分**指定是哪一列：\n{cands}")
    for i in targets:
        p = _pipes(lines[i])
        lines[i] = lines[i][:p[-2] + 1] + f" {cell(ticket)} " + lines[i][p[-1]:]
    hit = len(targets)
    if hit:
        _unlock(path)
        path.write_text("\n".join(lines).rstrip("\n") + "\n", encoding="utf-8")
    return hit


#: 吃帳本的兩支產生器（公開名, raw 名 —— `genrun.sh` 用公開名查戶籍、用 raw 名跑）。
#: 順序有意義：`board:roll` 先寫戰情版 md，`board:build` 再讀 `docs/_release` 產 html。
BOARD_STEPS = (("board:roll", "board:roll:raw"), ("board:build", "board:build:raw"))
REPO = Path(__file__).resolve().parent.parent


def regenerate_boards(ledger: Path) -> list[str]:
    """寫完帳本之後重生成吃它的產生器（GH#1026 ①）。回傳真的跑了的步驟名。

    ⭐ 這是**三個寫入端共用的一份**（`ruling.sh` · `--map`／`--dedupe` · `message-ledger.sh` 建置），
    ⛔ 不各寫一份步驟清單。走 `genrun.sh`（解鎖→跑→重鎖），⛔ 不直接叫產生器（那會繞過隔離區）。

    什麼時候**不跑**（每一條都要說得出理由）：
    · `GGD_LEDGER_NO_REGEN=1` —— 一律跳過（回頭的開關）。
    · `GGD_QUARANTINE_UNLOCKED=1` —— 已經在 `genrun`／`skills:sync` 鏈裡：外層 genrun 收工會**對帳**
      「這一支寫了誰的檔」，在裡面再跑 board 會把 board 的產物算成 msgledger 的越界寫入（RC=3）；
      而 `skills:sync` 鏈上本來就有 `board:build`／`board:roll`。⇒ 讓鏈接手，⛔ 但要說出來。
    · 帳本不在 `docs/_daily/`（測試夾具的暫存目錄）且沒給 `GGD_GENRUN` —— 守衛用 stub 驗「有沒有叫」，
      ⛔ 不在測試裡跑真的產生器（它們寫版控的產物）。
    """
    if os.environ.get("GGD_LEDGER_NO_REGEN") == "1":
        print("  ⏭ GGD_LEDGER_NO_REGEN=1 ⇒ 沒有重生成 board（收工記得 `bash scripts/genrun.sh board:roll` ＋ `board:build`）")
        return []
    if os.environ.get("GGD_QUARANTINE_UNLOCKED") == "1":
        print("  ⏭ 在 genrun／skills:sync 鏈裡 ⇒ 這裡不重生成 board（skills:sync 鏈上有 board:roll／board:build；"
              "單獨跑 msgledger:build 的話收工請跑 `bash scripts/genrun.sh board:roll` ＋ `board:build`，⛔ 不然 commit 閘會擋）")
        return []
    genrun = os.environ.get("GGD_GENRUN", "").strip()
    try:
        shipped = ledger.resolve().is_relative_to((REPO / "docs/_daily").resolve())
    except (OSError, ValueError):
        shipped = False
    if not genrun and not shipped:
        return []
    cmd = shlex.split(genrun) if genrun else ["bash", "scripts/genrun.sh"]
    ran: list[str] = []
    for step, raw in BOARD_STEPS:
        r = subprocess.run([*cmd, step, raw], cwd=REPO, capture_output=True, text=True)
        if r.returncode == 0:
            print(f"  ✓ 重生成 {step}（帳本是它的輸入）")
            ran.append(step)
        else:
            tail = (r.stderr or r.stdout).strip().splitlines()[-1:] or [""]
            print(f"  ⚠️ {step} 重生成失敗（exit {r.returncode}：{tail[0]}）—— 手動跑：bash scripts/genrun.sh {step} {raw}",
                  file=sys.stderr)
    return ran


def canonical_rows(path: Path) -> list[tuple[int, list[str]]]:
    """帳本裡由腳本維護的那些列（第一格是 HH:MM）。給 `--check` 用。"""
    if not path.exists():
        return []
    out = []
    for n, ln in enumerate(path.read_text(encoding="utf-8").split("\n"), 1):
        if ln.startswith("|"):
            c = cells(ln)
            if len(c) >= 3 and re.fullmatch(r"\d{1,2}:\d{2}", c[0]):
                out.append((n, c))
    return out


if __name__ == "__main__":
    # ⭐ 三個動作：`--dedupe` 併掉已存在的重複列（GH#1028）、`--map` 填某一列的票號
    #   （⛔ 不新增列），其餘是插入新列（⭐ 插入前先以文字找既有列，有就併不新增）。
    # ⭐ 每一個**寫了帳本**的出口都以 `regenerate_boards()` 收工（GH#1026 ①）；沒寫（找不到列）就不跑。
    if len(sys.argv) >= 2 and sys.argv[1] == "--regen":
        if len(sys.argv) != 3:
            sys.exit(f"用法: {sys.argv[0]} --regen <帳本.md>")
        regenerate_boards(Path(sys.argv[2]))
        sys.exit(0)
    if len(sys.argv) >= 2 and sys.argv[1] == "--dedupe":
        if len(sys.argv) != 3:
            sys.exit(f"用法: {sys.argv[0]} --dedupe <帳本.md>")
        n = dedupe(Path(sys.argv[2]))
        print(f"✓ {sys.argv[2]}：併掉 {n} 列重複" if n else f"✓ {sys.argv[2]}：沒有重複列")
        if n:
            regenerate_boards(Path(sys.argv[2]))
        sys.exit(0)
    if len(sys.argv) >= 2 and sys.argv[1] == "--map":
        if len(sys.argv) < 5:
            sys.exit(f"用法: {sys.argv[0]} --map <帳本.md> <HH:MM 或 身分> <票號 或 「— 理由」>")
        p, when, tk = Path(sys.argv[2]), sys.argv[3], " ".join(sys.argv[4:])
        n = map_ticket(p, when, tk)
        if not n:
            sys.exit(f"⛔ {p} 裡找不到 {when} 那一列 —— 先跑 `pnpm msgledger:build` 補列")
        print(f"  ✓ {p} {when} → `{tk}`（{n} 列）")
        regenerate_boards(p)
        sys.exit(0)
    argv = sys.argv[1:]
    mid = None
    if "--id" in argv:                       # ⭐ GH#1255：`ruling.sh` 在 transcript 找到那一則時帶身分
        i = argv.index("--id")
        mid = short_id(argv[i + 1] if i + 1 < len(argv) else "")
        del argv[i:i + 2]
    if len(argv) < 3:
        sys.exit(f"用法: {sys.argv[0]} <帳本.md> <HH:MM> <票號> [截斷字數] [--id <身分>]  # 原話走 stdin\n"
                 f"      {sys.argv[0]} --map <帳本.md> <HH:MM 或 身分> <票號 或 「— 理由」>")
    day, when, tickets = Path(argv[0]), argv[1], argv[2]
    body = with_id(cell(sys.stdin.read(), limit=int(argv[3]) if len(argv) > 3 else 0), mid)
    insert(day, [(when, body, tickets or UNMAPPED)])
    print(f"  ✓ {day}（插進「逐則對票」表格，⛔ 不是檔尾）")
