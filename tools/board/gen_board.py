#!/usr/bin/env python3
"""GGD 作戰板 —— 從**來源文件**產生，⛔ 不手寫。

owner 2026-08-20：「我說要**追加**，你怎麼移除了原本那些待追蹤議題、NOTE
以及對話記錄所對應的票，請你加回來，**這是這次改版的重點總覽**耶」

⚠️ 根因不是我手滑：那份頁面的**唯一副本**在 scratchpad（未版控），
所以一個 `cat >` 就把它洗掉了，而且救不回來 —— 與 `git checkout <檔>`
洗掉三條 lane 是同一個形狀：**唯一副本 + 一個覆蓋動作**。

⇒ 兩個修法一起上：
  ① 產物進版控（`docs/_release/ggd-board.html`），被蓋掉可以 `git diff` 看見
  ② ⭐ 內容從**來源文件**抽（owner #449：「資訊盡量 JSON → script 產生」），
     ⛔ 不再手寫 —— 手寫的那一份必然與帳本分岔，而且分岔時沒有人會知道。

來源：
  docs/_daily/*.md            逐則對票 · 卡在 owner · 三個轉折 · 規則變更 · 五條主線 · 三筆債
  docs/_release/*-draft.md    這一版的逐句對票
  git / gh                    即時狀態

  python3 tools/board/gen_board.py            # 產生
  python3 tools/board/gen_board.py --check    # 逐位元組比對（⛔ 沒有時鐘欄位，所以比得起來）
"""
from __future__ import annotations
import html, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs/_release/ggd-board.html"


def sh(*a: str) -> str:
    try:
        return subprocess.run(a, cwd=ROOT, capture_output=True, text=True, timeout=30).stdout.strip()
    except Exception:
        return ""


def section(md: str, title: str) -> str:
    """抓 `## <title>` 到下一個同級標題之間的原文。

    ⭐ 同一個標題在多份日期帳本裡各出現一次時,**全部串起來** ——
    只取第一個就會靜默丟掉補登的那一份(2026-08-20 就是這樣被漏掉的)。
    """
    out = []
    for m in re.finditer(rf"^#{{2,3}} .*{re.escape(title)}.*$", md, re.M):
        start = m.end()
        nxt = re.search(r"^#{2} ", md[start:], re.M)
        out.append(md[start:start + nxt.start()] if nxt else md[start:])
    return "\n".join(out)


INLINE = [
    (re.compile(r"`([^`]+)`"), lambda m: f"<code>{html.escape(m.group(1))}</code>"),
    (re.compile(r"\*\*([^*]+)\*\*"), lambda m: f"<b>{m.group(1)}</b>"),
]


def inline(s: str) -> str:
    s = html.escape(s.strip())
    for pat, rep in INLINE:
        s = pat.sub(rep, s)
    return s


def md_to_html(md: str) -> str:
    """只處理這幾份文件真的用到的東西：表格 · 標題 · 清單 · 引言 · 段落。"""
    out, rows = [], []

    def flush_table() -> None:
        if not rows:
            return
        head, body = rows[0], [r for r in rows[2:]] if len(rows) > 2 else []
        out.append('<div class="scroll"><table><tr>'
                   + "".join(f"<th>{inline(c)}</th>" for c in head) + "</tr>")
        for r in body:
            out.append("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>")
        out.append("</table></div>")
        rows.clear()

    for line in md.split("\n"):
        t = line.strip()
        if t.startswith("|"):
            rows.append([c.strip() for c in t.strip("|").split("|")])
            continue
        flush_table()
        if not t or t == "---":
            continue
        if t.startswith("#### ") or t.startswith("### "):
            out.append(f"<h3>{inline(t.lstrip('# '))}</h3>")
        elif t.startswith("> "):
            out.append(f"<blockquote>{inline(t[2:])}</blockquote>")
        elif re.match(r"^[-*] ", t):
            out.append(f'<p class="li">{inline(t[2:])}</p>')
        elif re.match(r"^\d+\. ", t):
            out.append(f'<p class="li">{inline(t)}</p>')
        else:
            out.append(f"<p>{inline(t)}</p>")
    flush_table()
    return "\n".join(out)


def live() -> str:
    head = sh("git", "log", "--oneline", "-1")
    unpushed = sh("git", "rev-list", "--count", "origin/main..HEAD") or "?"
    st = sh("git", "status", "--short").split("\n")
    tracked = sum(1 for l in st if l and not l.startswith("??"))
    untracked = sum(1 for l in st if l.startswith("??"))
    return (f'<div class="meta"><span>HEAD <b>{html.escape(head.split()[0] if head else "?")}</b></span>'
            f'<span>未 push <b>{unpushed}</b></span>'
            f'<span>工作區 <b>{tracked}</b> 改動 · <b>{untracked}</b> 未追蹤</span></div>')


CSS = (ROOT / "tools/board/board.css").read_text(encoding="utf-8")


def build() -> str:
    # ⭐ **所有**日期的帳本都要進來,⛔ 不是只有最新那一份 ——
    # 2026-08-20 的補登紀錄與 2026-08-19 的原始帳本**互補**,只讀一份就是又一次「漏掉後面的」。
    dailies = sorted((ROOT / "docs/_daily").glob("2026-*.md"), key=lambda q: q.name)
    daily = "\n\n".join(q.read_text(encoding="utf-8") for q in dailies)
    draft = sorted((ROOT / "docs/_release").glob("*-draft.md"))[-1].read_text(encoding="utf-8")
    live_md = (ROOT / "docs/_release/board-live.md").read_text(encoding="utf-8")

    blocks = [
        ("這一版在做什麼", section(daily, "一句話：這一版在做什麼")),
        ("五條主線", section(daily, "五條主線")),
        ("⏸ 卡在 owner 身上", section(daily, "卡在你身上")),
        ("🔀 工作流分工與群組現況", live_md),
        ("🧾 逐句對票 · 這一版（08-20）", section(draft, "逐句對票")),
        ("🧾 逐則對票 · owner 的每一句話在哪張票上", section(daily, "逐則對票")),
        ("⚠️ 三個轉折", section(daily, "三個轉折")),
        ("📏 規則變更", section(daily, "規則變更")),
    ]
    body = "\n".join(
        f'<section><p class="eyebrow">{html.escape(t.split(" ")[-1] if " " in t else t)}</p>'
        f"<h2>{inline(t)}</h2>{md_to_html(md)}</section>"
        for t, md in blocks if md.strip()
    )
    return (f"<title>GGD 作戰板</title>\n<style>{CSS}</style>\n"
            f'<div class="wrap"><header><p class="eyebrow">v0.21.4 → v0.21.5 · 開發中</p>'
            f"<h1>GGD 作戰板</h1>{live()}</header>\n{body}\n"
            f'<footer>由 <code>tools/board/gen_board.py</code> 從 docs/_daily · docs/_release · git 產生 —— '
            f'⛔ 不要手改這份 HTML</footer></div>\n')


if __name__ == "__main__":
    page = build()
    if "--check" in sys.argv:
        cur = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
        if cur != page:
            print("ggd-board.html is STALE — rerun: python3 tools/board/gen_board.py")
            sys.exit(1)
        print("ggd-board.html is current")
    else:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(page, encoding="utf-8")
        print(f"✓ 寫出 {OUT}（{len(page.splitlines())} 行）")
