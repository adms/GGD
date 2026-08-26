#!/usr/bin/env python3
"""📋 守則犯錯帳本的引擎（`scripts/rule-slip.sh` 呼叫它）。

owner 2026-08-27（逐字）：
> 「你要把每次開發守則上規則犯的錯記成一張表 守則犯錯.md 用來統計每次犯錯的
>  頻率及原因，日後可以用來改進反思，請你記到開發守則」

⭐ 兩欄是重點，⛔ 不是「記一句話」：
  · **守則代號** —— 犯的是哪一條（統計頻率用）
  · **成因代號** —— **為什麼**會犯（⭐ 這一欄才是日後改進的抓手）
兩欄都只准用下面的封閉詞彙表：打錯字的代號會讓統計**靜默分裂**成兩列，
而一份會靜默分裂的統計，比沒有統計更糟（它看起來是對的）。
"""
import collections
import datetime
import os
import re
import subprocess
import sys

# ── 守則代號 ────────────────────────────────────────────────────────────────
RULES = {
    "0.4-二住處": "第〇·四：同一個值有第二個住處（算得出來的數字被烘進文件/測試/註解）",
    "0.5-寫if": "第〇·五：為某一支技能寫程式（該是條件葉／模板參數）",
    "0.6-階梯": "第〇·六：衝突時沒照優先序階梯（或被「」台詞誤導）",
    "0.7-拆檔": "第〇·七：達標的檔沒拆／拆錯病（一行接線病用拆檔治）",
    "1-寫死": "第一：把該可調的數字或決策寫死",
    "1-旋鈕": "第一：動了 owner 的旋鈕（引用不到他的原話）",
    "1-推測當需求": "第一：把我的推測寫成事實／需求（票、模板預設值、註解）",
    "1.5-空宣稱": "第一·五：卡面／文件說了但不會發生",
    "2-守衛": "第二：改壞不會紅（沒守衛／斷言方向錯／被測的不是出貨的）",
    "2-形態8": "第二：失敗形態⑧（消費端存在但消費不到）",
    "3-註解說謊": "第三：註解／文件的宣稱沒去驗（引用的檔或測試不存在）",
    "0-成本": "第零：測試／agent／查詢過度配比",
    "0-產物": "第零：改產生器的產物而不是來源",
    "0-備份": "第零：覆蓋／刪除前沒留底（含改 CLAUDE.md／記憶前沒快照）",
    "0-順序": "第零：順序相依沒排對（產生器／閘的先後）",
    "技術-離開碼": "硬約束：`| head` / `| tail` 吞掉離開碼，或背景任務的 exit 誤讀",
    "技術-git": "硬約束：git 危險動作（add -A ／ checkout <檔> ／ amend ／ 裸 commit）",
    "技術-shell": "硬約束：shell 轉義吃掉內容（反引號／錢字元；訊息沒走 --body-file）",
    "👁-未驗收": "👁：沒有終端證據就說「做完／已修」",
}

# ── 成因代號（⭐ 改進的抓手）─────────────────────────────────────────────────
CAUSES = {
    "憑印象": "沒有打開來源就下結論（記憶／推測代替量測）",
    "抄字面值": "把一個值複製到第二個地方，而那裡沒有守衛",
    "工具騙我": "工具／訊息／文件給了錯的資訊（誤導源）",
    "順手": "為了快，跳過一個已知的步驟",
    "沒有閘": "這條規則當時只是散文，沒有會紅的東西",
    "併行": "多條 lane／工作流互相干擾",
    "疲勞重複": "同一個坑今天已經踩過，仍然再踩",
}

BEGIN, END = "<!-- SLIP_STATS_BEGIN -->", "<!-- SLIP_STATS_END -->"
ROW_MARK = "<!-- SLIP_ROWS -->"
ROW_RE = re.compile(r"^\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|")


def rows(text: str):
    return [
        (m.group(1), m.group(2).strip(), m.group(3).strip())
        for m in (ROW_RE.match(ln) for ln in text.splitlines())
        if m
    ]


def stats_block(rs) -> str:
    by_rule = collections.Counter(r[1] for r in rs)
    by_cause = collections.Counter(r[2] for r in rs)
    by_day = collections.Counter(r[0] for r in rs)
    out = [BEGIN, "", f"## 📊 統計（{len(rs)} 筆 · ⭐ 自動重算，⛔ 不要手改這一區）", ""]
    out += ["### 依守則", "", "| 守則 | 次數 | 是什麼 |", "|---|---:|---|"]
    for k, n in by_rule.most_common():
        out.append(f"| `{k}` | **{n}** | {RULES.get(k, '⚠️ 未知代號')} |")
    out += ["", "### 依成因（⭐ 改進的抓手）", "", "| 成因 | 次數 | 是什麼 |", "|---|---:|---|"]
    for k, n in by_cause.most_common():
        out.append(f"| `{k}` | **{n}** | {CAUSES.get(k, '⚠️ 未知代號')} |")
    out += ["", "### 依日期", "", "  " + " · ".join(f"{d} {n} 筆" for d, n in sorted(by_day.items())), ""]
    if by_rule:
        k, n = by_rule.most_common(1)[0]
        out.append(f"⭐ **最常犯的守則**：`{k}`（{n} 次）—— {RULES.get(k, '')}")
    if by_cause:
        k, n = by_cause.most_common(1)[0]
        out.append(f"⭐ **最常見的成因**：`{k}`（{n} 次）—— {CAUSES.get(k, '')}")
    out += ["", END]
    return "\n".join(out)


def main() -> int:
    ledger = sys.argv[1]
    args = sys.argv[2:]
    text = open(ledger, encoding="utf-8").read() if os.path.exists(ledger) else ""

    if args and args[0] == "--check":
        rs = rows(text)
        want = stats_block(rs)
        cur = re.search(re.escape(BEGIN) + r".*?" + re.escape(END), text, re.S)
        if cur is None or cur.group(0) != want:
            print(f"⛔ {ledger} 的統計區與資料列不一致 —— 跑 `bash scripts/rule-slip.sh --stats`")
            return 1
        bad = [r for r in rs if r[1] not in RULES or r[2] not in CAUSES]
        if bad:
            print("⛔ 這幾列用了未知的守則／成因代號（統計會靜默分裂成兩列）：")
            for r in bad:
                print("   ", r)
            return 1
        print(f"✓ 守則犯錯帳本：{len(rs)} 筆 · 代號全部合法 · 統計區最新")
        return 0

    if args and args[0] == "--stats":
        rs = rows(text)
        new = re.sub(re.escape(BEGIN) + r".*?" + re.escape(END), lambda _m: stats_block(rs), text, count=1, flags=re.S)
        open(ledger, "w", encoding="utf-8").write(new)
        print(f"✓ 統計區重算：{len(rs)} 筆")
        return 0

    if len(args) < 3:
        print("用法: bash scripts/rule-slip.sh <守則代號> <成因代號> <一句話>", file=sys.stderr)
        print("守則: " + " · ".join(RULES), file=sys.stderr)
        print("成因: " + " · ".join(CAUSES), file=sys.stderr)
        return 2

    rule, cause, what = args[0], args[1], " ".join(args[2:])
    if rule not in RULES:
        print(f"⛔ 未知守則代號 '{rule}'。有的：{' · '.join(RULES)}", file=sys.stderr)
        return 2
    if cause not in CAUSES:
        print(f"⛔ 未知成因代號 '{cause}'。有的：{' · '.join(CAUSES)}", file=sys.stderr)
        return 2

    sha = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True).stdout.strip()
    row = f"| {datetime.date.today().isoformat()} | {rule} | {cause} | {what.replace('|', '/')} | `{sha}` |"
    if ROW_MARK not in text:
        print(f"⛔ {ledger} 缺 {ROW_MARK} —— 它是資料列的插入點", file=sys.stderr)
        return 2
    text = text.replace(ROW_MARK, ROW_MARK + "\n" + row, 1)
    rs = rows(text)
    text = re.sub(re.escape(BEGIN) + r".*?" + re.escape(END), lambda _m: stats_block(rs), text, count=1, flags=re.S)
    open(ledger, "w", encoding="utf-8").write(text)
    print(f"✓ 記了一筆：{rule} / {cause}（累計 {len(rs)} 筆）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
