#!/usr/bin/env python3
"""⭐ 「這一份**只有某幾段**是產物」—— 從**產生器自己寫的 marker** 推導（GH#1096）。

════════════════════════════════════════════════════════════════════════════
它要治的病
════════════════════════════════════════════════════════════════════════════
`genguard` 今天問的是「**這個檔**是不是產物」，而真正的問題是
「**這一次改的這幾個位元組**是不是產物」。

⚠️ 量到的（2026-09-07）：根目錄 `README.md` 有 **2,075 行**，其中只有 **9 段**
（`<!-- BEGIN GENERATED:… -->` … `<!-- END GENERATED:… -->`）是 `docs:readme` 寫的，
其餘約一千行是人寫的散文。⛔ 而 genguard 把**整份**判成產物並 exit 2
⇒ 那一千行**改不動**（GH#1089 的用語稽核就是撞在這裡）。

⭐ 只驗名詞（「這個檔是不是產物」）的閘，在**部分擁有**的檔案上必然過度封鎖。

════════════════════════════════════════════════════════════════════════════
⛔ 為什麼這裡**沒有**一張「哪些檔是部分產物」的名單
════════════════════════════════════════════════════════════════════════════
那會是第〇·四守則的第二個住處（而且它會過期 —— 產生器加一段 marker，名單不會跟）。
⇒ 兩件事都**推導**：

| 問題 | 從哪裡推導 |
|---|---|
| 這個檔有哪幾段是產物？ | ⭐ **讀那個檔自己的 marker**（產生器寫進去的） |
| 這一支產生器是 marker 拼接器嗎？ | ⭐ `package.json` 的 `scripts[step]` → 它跑的那支程式 → 裡面有沒有 `BEGIN GENERATED:` |

⚠️⚠️ **第二個問題不可以省**：一份檔案可能同時被一支 marker 拼接器**與**一支
整段重寫的產生器認領 —— 那時候「marker 外面」**不是**自由的。
實測（2026-09-07，逐份查）：

| 檔 | 認領者 | 判定 |
|---|---|---|
| `README.md` | `docs:readme`（marker 拼接） | ⭐ **部分產物** ⇒ 區段外放行 |
| `docs/效果標籤詞彙表v2.md` | `contract:numbers`（marker 拼接） | ⭐ **部分產物** |
| `docs/技能編輯器引擎須知 20260811.md` | `contract:numbers` ＋ **`skillremake:docs`** | ⛔ 後者用 `### 13.10 …` 標題拼接、⛔ 沒有 marker ⇒ **整份照舊擋** |

⇒ 判準是「**每一個**作者都是 marker 拼接器」，⛔ 不是「有一個是」。

════════════════════════════════════════════════════════════════════════════
消費端（⭐ 三個，一起讀這一份，⛔ 不要各自再寫一條 regex —— GH#707 的病）
════════════════════════════════════════════════════════════════════════════
· `scripts/preserve-before-overwrite.py` 的 genguard 段（PreToolUse，真的會擋）
· `scripts/genguard.sh`（手動查詢）
· `packages/shared/src/ops/genguardMarkerRegions.test.ts`（守衛）

CLI（給 shell 用）:
    python3 tools/parallel-gates/marker_regions.py <path> [作者步驟名…]
      exit 0 = 這一份是**部分產物**，stdout 逐行列出區段（`name\tL起\tL迄`）
      exit 1 = ⛔ 不是部分產物（沒有 marker、或有作者不是 marker 拼接器）
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]

#: ⭐ marker 的語法**只住這裡一份**。產生器那一側的原文長這樣：
#:     <!-- BEGIN GENERATED:roster -->  …  <!-- END GENERATED:roster -->
#:   （`tools/reference/gen_readme_lists.py::markers()` 與
#:     `tools/editor-contract/gen_contract_numbers.py::markers()` 是同一個字串）
BEGIN_LITERAL = "<!-- BEGIN GENERATED:"

#: ⚠️ 反向引用 `\1` 是刻意的：BEGIN 與 END 的名字要**同一個**才算一段。
#:   一個 BEGIN 配到別人的 END（手改事故）⇒ 這裡配不到 ⇒ 退回「整份是產物」，
#:   ⭐ 而那正是保守的那一邊（產生器自己遇到這種檔也是 `sys.exit`）。
_PAIR = re.compile(
    r"<!--\s*BEGIN GENERATED:([^\s>]+?)\s*-->(?:.*?)<!--\s*END GENERATED:\1\s*-->",
    re.S,
)

_SCRIPT_TOKEN = re.compile(r"[\w./-]+\.(?:py|ts|mts|cts|mjs|cjs|js)\b")


def regions(text: str) -> list[dict]:
    """`text` 裡每一段產生區段：`name` · 位元組區間 `[start, end)` · 行號區間。"""
    out: list[dict] = []
    for m in _PAIR.finditer(text):
        out.append(
            {
                "name": m.group(1),
                "start": m.start(),
                "end": m.end(),
                "line_begin": text.count("\n", 0, m.start()) + 1,
                "line_end": text.count("\n", 0, m.end()) + 1,
            }
        )
    return out


def _pkg_scripts(repo: Path) -> dict[str, str]:
    try:
        return dict(json.loads((repo / "package.json").read_text(encoding="utf-8"))["scripts"])
    except Exception:
        return {}


def _scripts_of(step: str, pkg: dict[str, str]) -> list[str]:
    """`step` 這個 npm script 最後**真的跑到**的那幾支程式檔。

    ⚠️ 要**追一層**：出貨的形狀是 `docs:readme` → `bash scripts/genrun.sh docs:readme
    docs:readme:raw` → `docs:readme:raw` → `python3 tools/reference/gen_readme_lists.py`。
    只看第一層會看到 `genrun.sh`（每一支都一樣）⇒ 那等於沒有分辨力。
    """
    seen: set[str] = set()
    todo = [step]
    files: list[str] = []
    while todo:
        name = todo.pop()
        if name in seen:
            continue
        seen.add(name)
        cmd = pkg.get(name)
        if not cmd:
            continue
        files.extend(_SCRIPT_TOKEN.findall(cmd))
        for tok in re.split(r"[\s;|&]+", cmd):
            if tok in pkg:
                todo.append(tok)
    return files


def splices_markers(step: str, repo: Path = REPO) -> bool:
    """這一支產生器是**marker 拼接器**嗎 —— ⛔ 不查名單，去讀它跑的那支程式。"""
    pkg = _pkg_scripts(repo)
    for f in _scripts_of(step, pkg):
        try:
            if BEGIN_LITERAL in (repo / f).read_text(encoding="utf-8", errors="replace"):
                return True
        except OSError:
            continue
    return False


def partial_regions(path: Path, authors: list[str], repo: Path = REPO) -> list[dict]:
    """`path` 是**部分產物**時回它的區段；否則回 `[]`（＝照舊當成整份產物）。

    ⚠️ 三個條件缺一不可，⛔ 少一個就會放行一份真產物：
      ① 有作者認領（沒有人認領本來就不歸 genguard 管）
      ② 檔案裡真的有**配對好的** marker
      ③ ⭐ **每一個**作者都是 marker 拼接器
    """
    if not authors:
        return []
    try:
        text = Path(path).read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []
    regs = regions(text)
    if not regs:
        return []
    if not all(splices_markers(a, repo) for a in authors):
        return []
    return regs


def hits_region(regs: list[dict], spans: list[tuple[int, int]]) -> dict | None:
    """`spans`（這一次要改的位元組區間）碰到的第一段產生區段；都沒碰到回 None。"""
    for s, e in spans:
        for r in regs:
            if s < r["end"] and e > r["start"]:
                return r
    return None


def describe(regs: list[dict]) -> str:
    """區段清單寫成一行人話（`roster L843–L1295 · items L1313–L1487`）。"""
    return " · ".join(f"{r['name']} L{r['line_begin']}–{r['line_end']}" for r in regs)


def main(argv: list[str]) -> int:
    if not argv:
        print("用法: marker_regions.py <path> [作者步驟名…]", file=sys.stderr)
        return 2
    regs = partial_regions(Path(argv[0]), argv[1:])
    if not regs:
        return 1
    for r in regs:
        print(f"{r['name']}\t{r['line_begin']}\t{r['line_end']}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
