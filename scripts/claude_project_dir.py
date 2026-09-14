#!/usr/bin/env python3
"""「這個專案的 Claude 目錄在哪」—— ⭐ **唯一住處**（GH#1254）。

    python3 scripts/claude_project_dir.py                    # 印出 ~/.claude/projects/<slug>
    python3 scripts/claude_project_dir.py --need memory      # 那個子目錄不存在 ⇒ 非零，印出嘗試過的路徑
    python3 scripts/claude_project_dir.py --start <dir>      # 從別的樹推（預設：這支腳本所在的樹）

⛔ 在此之前同一件事有**兩種寫法、五個住處**：
  · `backup-rules.sh` 用**腳本位置**推 slug ⇒ 在 worktree（`/private/tmp/ggd-merge`）推成
    `-private-tmp-ggd-merge` ⇒ 那個目錄不存在 ⇒ `set -euo pipefail` 下 `find` 失敗 ⇒
    ⭐ **exit 1、一個字都沒印、記憶沒存**（09-12～14 三份快照只有 CLAUDE.md）。
  · `asked-before.sh`／`memory-temp.sh`／`message-ledger.sh`／`preserve-before-overwrite.py`
    **寫死** `-Users-Takuro-GGD` ⇒ 換一台機器或換 clone 路徑就錯。

⭐ 規則：slug 由 git 的**主工作樹**推（`--git-common-dir` 的上一層），⛔ 不是 cwd、⛔ 不是腳本位置 ——
   Claude Code 在 worktree 裡開的 session 仍然把記憶與 transcript 寫在**主樹**的 slug 底下。
⭐ slug ＝ 路徑裡每一個非英數字元換成 `-`（實測：`/Users/Takuro/GGD/.claude/worktrees/x`
   ⇒ `-Users-Takuro-GGD--claude-worktrees-x`，`.` 也變 `-`）。

⚠️ 找不到（不是 git 樹、git 不在 PATH）⇒ 丟 `LookupError` 並說出嘗試過什麼 ——
   呼叫端自己決定要不要退回（hook 永遠 exit 0，所以它退回；備份腳本 fail-loud）。
"""
from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent


def main_worktree(start: Path | None = None) -> Path:
    """`start` 所在 git 樹的**主工作樹**根目錄。"""
    start = Path(start or HERE)
    try:
        r = subprocess.run(
            ["git", "-C", str(start), "rev-parse", "--path-format=absolute", "--git-common-dir"],
            capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.SubprocessError) as e:
        raise LookupError(f"`git rev-parse --git-common-dir` 跑不起來（{e}）；start={start}") from e
    common = r.stdout.strip()
    if r.returncode != 0 or not common:
        raise LookupError(f"`{start}` 不在 git 樹裡（git: {r.stderr.strip() or r.returncode}）")
    return Path(common).parent


def slug(root: Path) -> str:
    return re.sub(r"[^A-Za-z0-9]", "-", str(root))


def project_dir(start: Path | None = None) -> Path:
    """`~/.claude/projects/<主工作樹的 slug>`。⚠️ 不檢查存在與否（呼叫端決定那是不是錯）。"""
    return Path.home() / ".claude" / "projects" / slug(main_worktree(start))


if __name__ == "__main__":
    args = sys.argv[1:]

    def opt(name: str) -> str | None:
        if name not in args:
            return None
        i = args.index(name)
        return args[i + 1] if i + 1 < len(args) else ""

    start, need = opt("--start"), opt("--need")
    try:
        d = project_dir(Path(start) if start else None)
    except LookupError as e:
        sys.exit(f"⛔ 推不出 Claude 專案目錄：{e}")
    if need is not None and not (d / need).is_dir():
        sys.exit(
            f"⛔ `{d / need}` 不存在\n"
            f"   推導：主工作樹 {main_worktree(Path(start) if start else None)} ⇒ slug {d.name}\n"
            f"   ⇒ 這台機器上沒有這個專案的 Claude 資料，或主工作樹搬過家（{os.environ.get('HOME', '~')}/.claude/projects/ 底下找找看）")
    print(d)
