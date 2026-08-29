#!/usr/bin/env python3
"""
把 90 支重製技能的**兩份文件**從產生器重新生成 —— owner 2026-08-12：

    「記得更新 給編輯器開發的文件 包含重製正規化後後計畫及JSON」

兩份文件、一個來源：

  1. `docs/英雄技能第一批重製-90支.md`        ← `emit_spec_md.py`（規格 ↔ JSON 並排）
  2. `docs/技能編輯器引擎須知 20260811.md` §13.10  ← 這支腳本（給 Codex 的完整 JSON）
  3. 同一份文件**檔頭的指紋那幾行**（H5，2026-08-23）← 也是這支腳本 ——
     指紋與對帳摘要從 `docs/editor-contract/ggd-runtime-capabilities.json` 抄
     （`skills:sync` 裡 `caps:export` 恰好排在這支前面，所以它永遠是剛產生的那一份；
     單獨跑之前先確認 `pnpm caps:check` 是綠的）。
     ⚠️ 在此之前那幾行是**手維護的快照**，2026-08-14 實測過期而沒有任何東西叫；
     現在單一住處 = caps JSON，`codexContractFresh.test.ts` 仍然直接對引擎現算的指紋。
     ⛔ 刻意**不寫日期** —— 時鐘欄位會讓 `--check` 的逐位元組比對永遠不相等（GH#389/#426）。

⚠️ 為什麼要有這支：§13.10 是**貼在一份 9,000 行大文件裡的 JSON**，
產生器一改它就過期，而**沒有任何東西會叫**。2026-08-12 的 90 支重製就是這樣 ——
產生器修了 8 個缺陷、JSON 全部變了，文件裡那一份還是舊的。

⛔ 所以這些段落**不可以手改**。改了產生器（或引擎能力）就跑
`bash scripts/genrun.sh skillremake:docs`。

用法：
    bash scripts/genrun.sh skillremake:docs              # 重生成（解鎖產物→跑→重鎖）
    python3 tools/skill-remake/refresh_docs.py --check   # 只檢查有沒有過期，回非零（唯讀，隨便跑）

⚠️ 寫入一律走 genrun，⛔ 不要直接 `python3 …/refresh_docs.py`（不帶 --check）——
兩份產物平時被隔離區鎖成 444，直接跑會吃 EACCES（GH#771）。
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
CAPS = os.path.join(ROOT, "docs", "editor-contract", "ggd-runtime-capabilities.json")
HEAD = "### 13.10 ⭐ 90 支的**完整 JSON**（出貨檔原文）"
NEXT = "## 十四、交件前自檢"

# 檔頭指紋區塊的錨點：第一行長這樣，後續行以「> ⚠️ 對帳」或「>    」開頭。
FP_LINE = re.compile(r"^> 指紋 `ggd-runtime-capabilities@1 / [0-9a-f]{8}`")
FP_CONT = re.compile(r"^(> ⚠️ 對帳|>    )")


def build_fingerprint_block() -> str:
    """檔頭的指紋那幾行 —— 單一住處是 caps:export 的 JSON，⛔ 不手維護、⛔ 不寫日期。"""
    caps = json.load(open(CAPS, encoding="utf-8"))
    counts = " · ".join(
        f"{k} {len(caps[k])}"
        for k in ("effectKinds", "hookEvents", "conditionLeafKinds", "templateFamilies", "knownBroken")
    )
    return "\n".join(
        [
            f"> 指紋 `{caps['schema']} / {caps['fingerprint']}`"
            "（本行由 `tools/skill-remake/refresh_docs.py` 產生，⛔ 不要手改）。",
            f"> ⚠️ 對帳摘要：`{counts}`",
            ">    —— 單一住處：與 `docs/editor-contract/ggd-runtime-capabilities.json` 同源"
            "（`pnpm caps:export` 在 `skills:sync` 裡先跑），",
            ">    守衛 `codexContractFresh.test.ts` 另外直接對引擎現算的指紋，這一行說謊會紅。",
        ]
    )


def splice_fingerprint(s: str) -> tuple[str, bool]:
    """把檔頭指紋區塊換成剛算的那一份；回 (新全文, 原本是否過期)。"""
    lines = s.split("\n")
    hits = [i for i, l in enumerate(lines) if FP_LINE.match(l)]
    assert len(hits) == 1, (
        f"檔頭指紋錨點找到 {len(hits)} 處（應該恰好 1 處）—— "
        "拿掉它等於拿掉外部作者唯一的 pin base 依據，⛔ 不要刪、不要複製"
    )
    i = hits[0]
    j = i + 1
    while j < len(lines) and FP_CONT.match(lines[j]):
        j += 1
    fresh = build_fingerprint_block().split("\n")
    return "\n".join(lines[:i] + fresh + lines[j:]), lines[i:j] != fresh


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
    L.append("> 重新生成：`bash scripts/genrun.sh skillremake:docs`（⛔ 不要手改本檔 —— 它是產物；")
    L.append("> 直接跑 `python3 tools/skill-remake/refresh_docs.py` 會在鎖著的隔離區上吃 EACCES）。")
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
    s2, stale_fp = splice_fingerprint(s)

    if check:
        fix = "**已過期** —— 跑 `python3 tools/skill-remake/refresh_docs.py`"
        print("§13.10 " + (fix if stale else "是最新的"))
        print("檔頭指紋行 " + (fix if stale_fp else "是最新的"))
        sys.exit(1 if (stale or stale_fp) else 0)

    a2, z2 = s2.index(HEAD), s2.index(NEXT)
    open(CODEX, "w", encoding="utf-8").write(s2[:a2] + fresh + "\n" + s2[z2:])
    print(f"§13.10 已重新生成（{'有改動' if stale else '本來就是最新的'}）")
    print(f"檔頭指紋行（{'有改動' if stale_fp else '本來就是最新的'}）")

    r = subprocess.run([sys.executable, os.path.join(HERE, "emit_spec_md.py")], capture_output=True, text=True)
    print(r.stdout.strip() or r.stderr.strip())
    if r.returncode != 0:
        sys.exit(r.returncode)


if __name__ == "__main__":
    main()
