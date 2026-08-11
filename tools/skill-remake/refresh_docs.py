#!/usr/bin/env python3
"""
把 90 支重製技能的**兩份文件**從產生器重新生成 —— owner 2026-08-12：

    「記得更新 給編輯器開發的文件 包含重製正規化後後計畫及JSON」

兩份文件、一個來源：

  1. `docs/英雄技能第一批重製-90支.md`        ← `emit_spec_md.py`（規格 ↔ JSON 並排）
  2. `docs/技能編輯器引擎須知 20260811.md` §13.10  ← 這支腳本（給 Codex 的完整 JSON）

⚠️ 為什麼要有這支：§13.10 是**貼在一份 9,000 行大文件裡的 JSON**，
產生器一改它就過期，而**沒有任何東西會叫**。2026-08-12 的 90 支重製就是這樣 ——
產生器修了 8 個缺陷、JSON 全部變了，文件裡那一份還是舊的。

⛔ 所以這一段**不可以手改**。改了產生器就跑這支。

用法：
    python3 tools/skill-remake/refresh_docs.py
    python3 tools/skill-remake/refresh_docs.py --check   # 只檢查有沒有過期，回非零
"""
import importlib.util
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "../.."))
CODEX = os.path.join(ROOT, "docs", "技能編輯器引擎須知 20260811.md")
HEAD = "### 13.10 ⭐ 90 支的**完整 JSON**（出貨檔原文）"
NEXT = "## 十四、交件前自檢"


def build_chapter() -> str:
    """從產生器同一張表產出 §13.10 的內文。⛔ 不讀磁碟上的 JSON —— 那會多一個住處。"""
    spec = importlib.util.spec_from_file_location("batch1", os.path.join(HERE, "batch1.py"))
    b = importlib.util.module_from_spec(spec)
    sys.modules["batch1"] = b
    spec.loader.exec_module(b)
    docs = [b.build(e) for e in b.T]
    assert len(docs) == 90, f"表裡只有 {len(docs)} 支，應該是 90"

    L = [HEAD, ""]
    L.append("> ⛔ **這一節是產生的，不要手改。** 來源是 `tools/skill-remake/batch1.py` 的同一張表，")
    L.append("> 重新生成：`python3 tools/skill-remake/refresh_docs.py`。")
    L.append(">")
    L.append("> ⚠️ 手改這裡 = 第二個住處 = 它一定會過期。2026-08-12 這一節就過期過一次：")
    L.append("> 產生器修了 8 個缺陷、90 支 JSON 全部變了，而這裡還貼著舊的，**沒有任何東西叫**。")
    L.append(">")
    L.append("> ⭐ 規格 ↔ JSON 的**並排對照**在 [`英雄技能第一批重製-90支.md`](英雄技能第一批重製-90支.md)，")
    L.append("> 那一份適合「檢查有沒有照規格做」；這一節適合「直接複製一份骨架來改」。")
    L.append("")

    by_hero: dict[str, list] = {}
    for e, (_cid, _slot, d) in zip(b.T, docs):
        by_hero.setdefault(e["num"].split("-")[0], []).append(d)
    for hero in sorted(by_hero, key=int):
        cid = b.HERO.get(hero, "?")
        L.append(f"#### {hero} — `{cid}`")
        L.append("")
        for d in by_hero[hero]:
            L.append(f"<details><summary><code>{d['id']}</code> — {d['name']}</summary>")
            L.append("")
            L.append("```jsonc")
            L.append(json.dumps(d, ensure_ascii=False, indent=2))
            L.append("```")
            L.append("")
            L.append("</details>")
            L.append("")
        L.append("---")
        L.append("")
    return "\n".join(L)


def main() -> None:
    check = "--check" in sys.argv
    s = open(CODEX, encoding="utf-8").read()
    a, z = s.index(HEAD), s.index(NEXT)
    fresh = build_chapter()
    stale = s[a:z].rstrip() != fresh.rstrip()

    if check:
        print("§13.10 " + ("**已過期** —— 跑 `python3 tools/skill-remake/refresh_docs.py`" if stale else "是最新的"))
        sys.exit(1 if stale else 0)

    open(CODEX, "w", encoding="utf-8").write(s[:a] + fresh + "\n" + s[z:])
    print(f"§13.10 已重新生成（{'有改動' if stale else '本來就是最新的'}）")

    r = subprocess.run([sys.executable, os.path.join(HERE, "emit_spec_md.py")], capture_output=True, text=True)
    print(r.stdout.strip() or r.stderr.strip())
    if r.returncode != 0:
        sys.exit(r.returncode)


if __name__ == "__main__":
    main()
