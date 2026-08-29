#!/usr/bin/env python3
"""GGD 戰情版 —— 從**來源文件**產生，⛔ 不手寫。

owner 2026-08-22:「我說的作戰版是 ggd-board.html 不要搞混了 我**重新命名為 GGD戰情版**避免混亂」
⇒ 這一份叫**戰情版**；「平行批次盤」是另一塊手寫的姊妹頁,⛔ 兩者不是同一個東西。

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


def _split_cells(line: str) -> list[str]:
    """⭐ 在**沒有被跳脫**的 `|` 上切欄（與 scripts/ledger_table.py 同一套規則）。

    ⚠️ 裸 `split("|")` 會在 `\\|` 的 `|` 上切開,把一則內嵌 Markdown 表格的裁決
    炸成十幾個 <td> —— owner 2026-08-22 在戰情版上看到的就是這個。
    """
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
            rows.append(_split_cells(t))
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


def shipped_version() -> str:
    """⭐ **推導**目前線上版號，⛔ 不是寫死。

    在 2026-08-20 之前這一行是字面值 `v0.21.4 → v0.21.5 · 開發中` ——
    而 repo 那時已經在 **v0.22.4**。又一個「被散文保護的假話活得比有效期久，
    而且沒有任何東西會紅」（第三守則）。owner 一眼就看出來了。

    ⚠️ 這是 git 狀態，但它與被拿掉的 HEAD hash / 未 push 數**不同類**：
    tag 只在**真的發版**時才變（一天一次），⛔ 不是每 commit 一次。
    所以 `--check` 在發版後到重生之間會紅一次 —— 那是**對的**：
    板本來就該跟著新版重生，而 `board:build` 就在 `skills:sync` 裡。
    """
    v = sh("git", "describe", "--tags", "--abbrev=0")
    return v or "（未打 tag）"


def data_asof(dailies: list) -> str:
    """⭐ 標題上的 GMT+8 時間戳（owner 2026-08-20：「標題請一定要加上 GMT8 時間戳記」）。

    ⛔ 它**不是產生時間** —— 那會是時鐘欄位，讓逐位元組 `--check` 永遠不可能綠，
    而那正是這支產生器在 2026-08-20 之前**完全沒有閘**的原因（見 `meta()` 的註解）。

    ⭐ 改成從**來源**推導：最新那份帳本的日期 + 該檔「逐則對票」表裡**最晚的一則訊息時間**。
    ⇒ 它只在真的有新訊息時才變 ⇒ `--check` 比得起來，而且它回答的是
    **「這塊板的資料到幾點」**，比「這個檔案幾點被產生」有用得多
    （產生時間不告訴你資料新不新）。
    """
    if not dailies:
        return ""
    newest = dailies[-1]
    day = newest.stem                      # 2026-08-20
    times = re.findall(r"^\|\s*(\d{2}:\d{2})\s*\|", newest.read_text(encoding="utf-8"), re.M)
    hhmm = max(times) if times else "00:00"
    return f"{day} {hhmm} (GMT+8)"


def meta(body: str, dailies: list) -> str:
    """⛔ **這一格刻意不放 git 狀態**（owner 2026-08-20：「fix all, fix gen_board.py」）。

    它以前寫的是 HEAD hash · 未 push 數 · 工作區改動數 —— 那三個都是**時鐘欄位**：
    每 commit 一次產物就變，於是逐位元組 `--check` **不可能**綠。結果是這支產生器
    ⛔ **沒有 npm script 也沒有任何測試** —— 全 repo 唯一完全無閘的產生器，
    而它的產物 `docs/_release/ggd-board.html` 是版控的。

    ⚠️ 而檔頭第 22 行當時**自己宣稱**「⛔ 沒有時鐘欄位，所以比得起來」—— 那是第三守則
    說的那種謊：一句被散文保護的假話活得比它的有效期久，**而且沒有任何東西會紅**。

    現在這一格只放**從來源文件推導**的東西：帳本份數與被點名的票號數。
    它只在來源真的變了的時候變 ⇒ `--check` 從此比得起來，這支產生器才能接進
    `pnpm skills:check`（`board:check`）。
    """
    tickets = sorted({int(n) for n in re.findall(r"#(\d{2,4})\b", body)})
    return (f'<div class="meta"><span>帳本 <b>{len(dailies)}</b> 份</span>'
            f'<span>點名票號 <b>{len(tickets)}</b> 張</span>'
            f'<span>區塊 <b>{body.count("<section>")}</b> 節</span></div>')


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
    return (f"<title>GGD 戰情版 · {data_asof(dailies)}</title>\n<style>{CSS}</style>\n"
            f'<div class="wrap"><header><p class="eyebrow">線上 {html.escape(shipped_version())} · 資料截至 {html.escape(data_asof(dailies))}</p>'
            f"<h1>GGD 戰情版 · {html.escape(data_asof(dailies))}</h1>{meta(body, dailies)}</header>\n{body}\n"
            f'<footer>由 <code>tools/board/gen_board.py</code> 從 docs/_daily · docs/_release 產生（⛔ 不含 git 狀態:那是時鐘欄位） —— '
            f'⛔ 不要手改這份 HTML</footer></div>\n')


def _preserve_previous() -> None:
    """把**即將被覆蓋**的那一份戰情板複製進 legacy，並記進同一本帳。

    ⭐ 內容**逐位元組相同**時跳過（⛔ 不然每跑一次 `--check` 之後的重生成都留一份，
    legacy 會爆），但仍記一列 `SKIP(內容相同)` —— ⚠️ 靜默跳過與沒跑過長得一樣。
    ⚠️ 這支**永遠不讓產生器失敗**（備份壞掉不可以弄壞出貨），⛔ 但它會大聲說。
    """
    import shutil, time, hashlib
    try:
        if not OUT.exists():
            return
        repo = Path(__file__).resolve().parents[2]
        log = repo / "docs/legacy/_overwrites/_ledger.tsv"
        stamp = "overwrite_temp_" + time.strftime("%Y%m%d-%H%M%S")
        prev = OUT.read_bytes()
        new_sum = hashlib.sha256(build().encode("utf-8")).hexdigest()
        if hashlib.sha256(prev).hexdigest() == new_sum:
            dest, why = "", "SKIP(內容相同)"
        else:
            dest_p = repo / "docs/legacy/_overwrites" / stamp / OUT.relative_to(repo)
            dest_p.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(OUT, dest_p)
            dest, why = str(dest_p), "產生器覆蓋前"
        log.parent.mkdir(parents=True, exist_ok=True)
        with log.open("a", encoding="utf-8") as fh:
            fh.write(f"{time.strftime('%Y%m%d-%H%M%S')}\tgen_board\t{why}\t{OUT}\t{dest}\n")
        if dest:
            print(f"  🗄 覆蓋前留底 → {Path(dest).relative_to(repo)}")
    except Exception as exc:                       # noqa: BLE001
        print(f"  ⚠️ 留底失敗（⛔ 仍然繼續產生）：{exc}")


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
        # ⭐ **覆蓋前先留底**（owner 2026-08-29：「每次產生記得都有備份」）。
        #
        # ⚠️ 為什麼產生器要自己做：`scripts/preserve-before-overwrite.py` 那道 hook
        # 只攔 Write／Edit／shell 重導 —— ⛔ 它對 **Python 檔案 API 直寫是瞎的**，
        # 而這一行正是。⇒ 這份戰情板在 2026-08-20 被 `cat >` 洗掉過一次，
        # 當時唯一副本在 scratchpad 且未版控 ⇒ **救不回來**。
        #
        # ⭐ 復用**同一套**慣例與同一本帳（⛔ 不造第二套）：
        #   落點 docs/legacy/_overwrites/overwrite_temp_<ts>/ · 帳本 _ledger.tsv
        _preserve_previous()
        OUT.write_text(page, encoding="utf-8")
        print(f"✓ 寫出 {OUT}（{len(page.splitlines())} 行）")
