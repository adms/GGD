#!/usr/bin/env python3
"""
gen.py —— 技能**模板語料**的唯一入口（`pnpm templates:build` / `templates:check`）。

    python3 tools/ability-templates/gen.py            # 重生成 docs/ability-templates.{csv,md}
    python3 tools/ability-templates/gen.py --check    # 唯讀:逐位元組比對,漂了就非零離開

⭐ 為什麼是**一個**入口而不是三支各自可跑的腳本
------------------------------------------------------------------
這三支是一條鏈,而且**兩兩共用同一份產物**:

    classify_templates.build_rows()  → 第 1–40 欄(分類/參數/WC3/JASS/行為模板)
    score_gap.score(rows)            → 第 41–42 欄(實作落差分/落差說明)
    emit_templates_md.render(rows)   → docs/ability-templates.md

在此之前三支都自己讀/寫 `docs/ability-templates.csv`,於是**順序決定結果**:
單獨跑 `classify_templates.py` 會把後兩段補的欄位**整欄洗掉**(七個 `行為*` 欄 +
兩個落差欄 = 309 筆 JASS 細讀記錄與 498 列評分),而它 EXIT 0、沒有任何東西會紅。
⇒ 那是 CLAUDE.md 第〇·七守則說的**順序相依**:⛔ 拆檔治不了它,治它的是入口本身。

⭐ 為什麼 md 與 CSV 走**同一份 rows**
------------------------------------------------------------------
兩條路徑各自重算會分岔,而分岔的那一刻沒有人會發現(失敗形態 ⑤:被測的不是出貨的
那個)。同 `docs/tools/ability_ledger.py` 的檔頭。

⚠️ 這支腳本**刻意不寫產生日期**。任何隨時鐘變動的欄位都會讓逐位元組比對永遠不
相等,於是 `--check` 只能被放寬成模糊比對 —— 而一條被放寬的閘等於沒有閘
(同 `pnpm caps:export` / `pnpm spec:build` / `pnpm vfxbind:check` 的理由)。
"""

from __future__ import annotations

import csv
import io
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CSV_OUT = ROOT / "docs" / "ability-templates.csv"
MD_OUT = ROOT / "docs" / "ability-templates.md"


def build() -> tuple[str, str]:
    """(csv 文字, md 文字) —— ⛔ 不碰檔案系統,`--check` 與寫入走同一份結果。"""
    import classify_templates
    import emit_templates_md
    import score_gap

    rows = classify_templates.build_rows()
    score_gap.score(rows)
    buf = io.StringIO(newline="")
    writer = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    writer.writerows(rows)
    return buf.getvalue(), emit_templates_md.render(rows)


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    csv_text, md_text = build()
    # BOM: Excel 開中文 CSV 用的(owner 驗收用這一份)
    want = {CSV_OUT: csv_text.encode("utf-8-sig"), MD_OUT: md_text.encode("utf-8")}

    if "--check" in argv:
        stale = [p for p, b in want.items() if not p.exists() or p.read_bytes() != b]
        if stale:
            for p in stale:
                print(f"⛔ {p.relative_to(ROOT)} 過期了", file=sys.stderr)
            print("⛔ 跑 `pnpm templates:build` 然後 git add docs/", file=sys.stderr)
            return 1
        print(f"✅ 模板語料與 content/ 一致({CSV_OUT.name} · {MD_OUT.name})")
        return 0

    for p, b in want.items():
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(b)
        print(f"寫入 {p.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
