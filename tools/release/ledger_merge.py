#!/usr/bin/env python3
"""公告帳本的合併 —— ⭐ 追加，⛔ 而補發要**更新**那一列。

⛔⛔ 2026-09-09 量到：在此之前這段邏輯是 `grep -q … || printf … >>`
⇒ ⭐ **已經在帳本上的版號永遠不會被改**。一次 `GGD_ANNOUNCE_FORCE=1` 的補發
把**真的內容**發了出去，⛔ 而帳本第三欄還留著被取代掉的罐頭句子
⇒ ⭐ 下一個讀帳本的人會得出「那一版本來就沒有玩家可見的改動」。

⭐ 搬出來是為了讓它**驗得到** —— 在此之前它是 shell 裡的一段 heredoc，
⛔ 而一段沒有辦法被單獨呼叫的邏輯，只能靠「真的發一次」來驗。

用法：ledger_merge.py <帳本> <日期> <內容> <force:0|1> <tag…>
"""
from __future__ import annotations
import pathlib
import sys


def merge(text: str, tags: list[str], today: str, content: str, force: bool) -> str:
    lines = text.splitlines()
    have = {ln.split("\t", 1)[0]: i for i, ln in enumerate(lines) if "\t" in ln}
    for t in tags:
        row = f"{t}\t{today}\t{content}"
        if t in have:
            if force:                     # ⭐ 補發 ⇒ 換成真的那一句
                lines[have[t]] = row
        else:
            lines.append(row)
            have[t] = len(lines) - 1
    return "\n".join(lines) + "\n"


def main(argv: list[str]) -> int:
    if len(argv) < 6:
        print(__doc__, file=sys.stderr)
        return 2
    path, today, content, force = argv[1], argv[2], argv[3], argv[4] == "1"
    p = pathlib.Path(path)
    p.write_text(merge(p.read_text(encoding="utf-8"), argv[5:], today, content, force),
                 encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
