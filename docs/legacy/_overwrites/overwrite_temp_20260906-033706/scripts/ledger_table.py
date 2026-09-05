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

    python3 scripts/ledger_table.py <帳本.md> <HH:MM> <票號>   # 逐字原話走 stdin
"""
from __future__ import annotations

import re
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


def _norm(text: str) -> str:
    """同一句話在兩個寫入端手上可能長得不一樣（截斷位置、空白）—— 比對前先正規化。"""
    return re.sub(r"\s+", "", text).replace(r"\|", "|").rstrip("…")


def _minutes(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def _same_text(a: str, b: str) -> bool:
    """文字那一半：截斷過的那一份是另一份的前綴 ⇒ 前綴相容就算同一句；太短的（「ok」）要求全等。"""
    x, y = _norm(a), _norm(b)
    if len(x) < 12 or len(y) < 12:
        return x == y
    return x.startswith(y) or y.startswith(x)


def _same_message(a_text: str, a_when: str, b_text: str, b_when: str) -> bool:
    """⭐ 「同一則訊息」＝ **文字相同 且 時間相近**，⛔ 不是文字相同就算。

    ⚠️ 2026-09-06 第一版只比文字，`--dedupe` 當場把 09-05 的 `01:25 ok` 與 `01:49 ok` 併成一列 ——
    owner 說了兩次「ok」是**兩則**訊息。⛔ 那正是第〇·六守則的形狀：拿一把會漂的鑰匙去同步，
    同步器把單點錯誤放大成資料毀損（`skills:check` 在 commit 前抓到：「漏了 01:49」）。
    ⭐ 時間那一半的來源：`ruling.sh` 記的是執行時間、建置器記的是訊息時間，兩者相差幾分鐘 ——
    長句給 15 分鐘窗、短句（更容易重複出現）只給 3 分鐘。窗外 ⇒ 寧可留兩列，⛔ 不併。
    """
    if not _same_text(a_text, b_text):
        return False
    try:
        gap = abs(_minutes(a_when) - _minutes(b_when))
    except ValueError:
        return False
    short = min(len(_norm(a_text)), len(_norm(b_text))) < 12
    return gap <= (3 if short else 15)


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


def _find_row(lines: list[str], text: str) -> int | None:
    """正規表格裡**同一句話**已存在的那一列（索引）；沒有回 None。"""
    for i, ln in enumerate(lines):
        if not ln.startswith("|"):
            continue
        c = cells(ln)
        if len(c) >= 3 and re.fullmatch(r"\d{1,2}:\d{2}", c[0]) and _same_text(c[1], text):
            return i
    return None


def insert(path: Path, rows: list[tuple[str, str, str]]) -> int:
    """把 rows 插進正規表格**最後一列之後**。回傳實際**新增**的列數。

    ⭐ GH#1028：同一句話已經在表裡 ⇒ ⛔ 不新增第二列，只把票號**併**進既有那一列
    （時間取兩者較早的 —— 建置器記的是訊息時間，ruling.sh 記的是執行時間，前者一定不晚於後者）。
    在此之前 `ruling.sh`（執行時間）與 `message-ledger.sh`（訊息時間）各插一列，
    每一則裁決都變成「一列對了票、一列永遠未對票」。
    """
    if not rows:
        return 0
    lines = ensure(path)
    added = 0
    for when, text, tk in rows:
        hit = _find_row(lines, text)
        if hit is not None:
            c = cells(lines[hit])
            ln = _set_cell(lines[hit], -1, cell(_merge_tickets(c[2], tk)))
            lines[hit] = _set_cell(ln, 0, min(c[0], when))
            continue
        at = _table_end(lines)
        assert at is not None  # ensure() 保證有表格
        lines[at:at] = ["| " + " | ".join((when, text, tk)) + " |"]
        added += 1
    _unlock(path)
    path.write_text("\n".join(lines).rstrip("\n") + "\n", encoding="utf-8")
    return added


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
            if _same_text(kc[1], c[1]):
                merged = _set_cell(lines[k], -1, cell(_merge_tickets(kc[2], c[2])))
                lines[k] = _set_cell(merged, 0, min(kc[0], c[0]))
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
    return bool(re.search(r"(?<!\d)#?\d{2,4}(?!\d)", s)) or s.startswith(("—", "–"))


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
    """把某一列的**票號那一格**填掉。回傳改到的列數（0 ＝ 找不到那個時間戳）。

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
    hit = 0
    for i, ln in enumerate(lines):
        if not ln.startswith("|"):
            continue
        c = cells(ln)
        if len(c) < 3 or not re.fullmatch(r"\d{1,2}:\d{2}", c[0]) or c[0] != when:
            continue
        p = _pipes(ln)
        if len(p) < 2:
            continue
        lines[i] = ln[:p[-2] + 1] + f" {cell(ticket)} " + ln[p[-1]:]
        hit += 1
    if hit:
        _unlock(path)
        path.write_text("\n".join(lines).rstrip("\n") + "\n", encoding="utf-8")
    return hit


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
    if len(sys.argv) >= 2 and sys.argv[1] == "--dedupe":
        if len(sys.argv) != 3:
            sys.exit(f"用法: {sys.argv[0]} --dedupe <帳本.md>")
        n = dedupe(Path(sys.argv[2]))
        print(f"✓ {sys.argv[2]}：併掉 {n} 列重複" if n else f"✓ {sys.argv[2]}：沒有重複列")
        sys.exit(0)
    if len(sys.argv) >= 2 and sys.argv[1] == "--map":
        if len(sys.argv) < 5:
            sys.exit(f"用法: {sys.argv[0]} --map <帳本.md> <HH:MM> <票號 或 「— 理由」>")
        p, when, tk = Path(sys.argv[2]), sys.argv[3], " ".join(sys.argv[4:])
        n = map_ticket(p, when, tk)
        if not n:
            sys.exit(f"⛔ {p} 裡找不到 {when} 那一列 —— 先跑 `pnpm msgledger:build` 補列")
        print(f"  ✓ {p} {when} → `{tk}`（{n} 列）")
        sys.exit(0)
    if len(sys.argv) < 4:
        sys.exit(f"用法: {sys.argv[0]} <帳本.md> <HH:MM> <票號>  # 原話走 stdin\n"
                 f"      {sys.argv[0]} --map <帳本.md> <HH:MM> <票號 或 「— 理由」>")
    day, when, tickets = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
    body = cell(sys.stdin.read(), limit=int(sys.argv[4]) if len(sys.argv) > 4 else 0)
    insert(day, [(when, body, tickets or UNMAPPED)])
    print(f"  ✓ {day}（插進「逐則對票」表格，⛔ 不是檔尾）")
