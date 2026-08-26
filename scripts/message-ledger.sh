#!/usr/bin/env bash
# owner 的**每一則訊息**都要對到一張票 —— 這支腳本負責對帳,`--check` 是那道閘。
#
# owner 2026-08-20：
#   「🧾 逐則對票 · owner 的每一句話在哪張票上 => **你要持續更新吧**」
#
# ⚠️ 「要持續更新」是**判準**,而這份 repo 已經記錄了五次判準失效。
# `scripts/ruling.sh` 只在**我判斷這是一則裁決**的時候才跑 —— 而 owner 要的是
# 每一句話,包含提問、更正、「看不懂」這些不是裁決、我當下不會想到要記的訊息。
# ⇒ 唯一可靠的來源是 session transcript(它不會忘),對帳交給程式。
#
#   bash scripts/message-ledger.sh              # 回填今天缺的列
#   bash scripts/message-ledger.sh --check      # 閘:漏了 or 還有「⏸ 未對票」就回非零
#   bash scripts/message-ledger.sh --date 2026-08-19
#
# ⛔ 產物**不含時鐘欄位**:列上的 HH:MM 是**訊息**的時間(來自 transcript,固定),
# ⛔ 不是執行時間 —— 不然逐位元組比對的下游(gen_board.py)會每跑一次就紅。
#
# ⭐ 輸出路徑是**日期相依**的:`docs/_daily/<今天>.md` 與 `ledger-source_temp_<今天>.md`
# 每天換檔名 —— 戶籍表以 **glob** 宣告它們(`tools/parallel-gates/merge-io.mjs` 的
# DATE_FAMILIES:`docs/_daily/????-??-??.md` · `docs/_daily/ledger-source_temp_*.md`),
# ⛔ 不是量測那天的字面路徑。⇒ 改輸出路徑**家族**(搬目錄、改檔名格式)時,
# 要**同步那張 DATE_FAMILIES 表** —— 不然隔天的產物就變成「無主又鎖著」
# (2026-08-26 真的發生過:2026-08-26.md 鎖著而戶籍記著 2026-08-25.md,GH#771)。
set -uo pipefail
cd "$(dirname "$0")/.."

exec python3 - "$@" <<'PY'
import json, os, re, sys, glob, datetime
from pathlib import Path

sys.path.insert(0, "scripts")
import ledger_table as LT

TZ = datetime.timezone(datetime.timedelta(hours=8))          # owner 的本地時區
PROJ = Path(os.environ.get(                                    # 測試用;出貨一律讀真的 transcript
    "GGD_TRANSCRIPT_DIR", os.path.expanduser("~/.claude/projects/-Users-Takuro-GGD")))
MAXLEN = int(os.environ.get("GGD_LEDGER_MAXLEN", "300"))
WINDOW = 24                                                   # 判定「已經有列」的比對窗

argv = sys.argv[1:]
CHECK = "--check" in argv
DAY = next((argv[i + 1] for i, a in enumerate(argv) if a == "--date"), None) \
      or datetime.datetime.now(TZ).strftime("%Y-%m-%d")
DIR = Path(os.environ.get("GGD_LEDGER_DIR", "docs/_daily"))     # 測試用;出貨一律 docs/_daily
LEDGER = DIR / f"{DAY}.md"
ARCHIVE = DIR / f"ledger-source_temp_{DAY.replace('-', '')}.md"

SKIP = ("<", "[Request interrupted", "This session is being continued", "Caveat:")


def from_transcript():
    """最新的 session jsonl → 這一天的 owner 真人訊息。濾法照 CLAUDE.md 部署協定第 1 步。"""
    files = sorted(PROJ.glob("*.jsonl"), key=lambda q: q.stat().st_mtime, reverse=True) \
        if PROJ.is_dir() else []
    prev = (datetime.date.fromisoformat(DAY) - datetime.timedelta(days=1)).isoformat()
    # ⚠️ transcript 是 GB 級的,所以先用 bytes 粗篩再 json.loads(否則一次對帳要幾分鐘)。
    want = (f'"{DAY}T'.encode(), f'"{prev}T'.encode())
    out, seen = [], set()
    for src in files:
        with src.open("rb") as f:
            for raw in f:
                if b'"type":"user"' not in raw or not any(w in raw for w in want):
                    continue
                try:
                    d = json.loads(raw.decode("utf-8", "replace"))
                except Exception:
                    continue
                if d.get("type") != "user" or d.get("toolUseResult") is not None or d.get("isMeta"):
                    continue
                c = (d.get("message") or {}).get("content")
                t = c if isinstance(c, str) else "\n".join(
                    b.get("text", "") for b in c or []
                    if isinstance(b, dict) and b.get("type") == "text")
                t = t.strip()
                if not t or t.startswith(SKIP):
                    continue
                ts = d.get("timestamp", "")
                if not ts:
                    continue
                lo = datetime.datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(TZ)
                if lo.strftime("%Y-%m-%d") != DAY:
                    continue
                key = (lo.strftime("%H:%M"), t[:80])
                if key in seen:
                    continue
                seen.add(key)
                out.append((lo.strftime("%H:%M"), t))
    return sorted(out)


def from_archive():
    """transcript 不在這台機器上(CI / host)時的來源 —— 已進版控的全文存檔。

    ⭐ fail-open 但**不靜默**:退回存檔時會印出來,而且閘仍然驗得到
    「存檔裡的每一則都有列」。⛔ 直接 exit 0 才是靜默。
    """
    if not ARCHIVE.exists():
        return []
    out, cur, buf = [], None, []
    for ln in ARCHIVE.read_text(encoding="utf-8").split("\n"):
        m = re.match(r"^## (\d{1,2}:\d{2})$", ln)
        if m:
            if cur:
                out.append((cur, "\n".join(buf).strip()))
            cur, buf = m.group(1), []
        elif cur is not None:
            buf.append(ln)
    if cur:
        out.append((cur, "\n".join(buf).strip()))
    return out


def norm(s: str) -> str:
    return re.sub(r"[\s*`\\>#|]", "", s)


def covered(text: str, hay: str) -> bool:
    """這則訊息在帳本裡**已經有列**了嗎？

    ⭐ 用「原話的任一段 N 字視窗出現在帳本裡」判定,⛔ 不是比對整句 ——
    既有的列多半是**節錄**(補登的 #1069–#1084 就全是),比對整句會把它們
    全部誤判成「漏了」,於是每天重複塞一次。
    """
    n = norm(text)
    w = min(WINDOW, len(n))
    if w < 4:
        return True                      # 太短(「do it」「yes」)—— 沒有辨識度,不當成漏
    return any(n[i:i + w] in hay for i in range(len(n) - w + 1))


def tickets_in(text: str) -> str:
    seen, out = set(), []
    for n in re.findall(r"#(\d{2,4})\b", text):
        if n not in seen:
            seen.add(n)
            out.append(f"#{n}")
    return " ".join(out) or LT.UNMAPPED


msgs = from_transcript()
FROM_TX = bool(msgs)
if not FROM_TX:
    msgs = from_archive()
    if msgs:
        print(f"⚠️ transcript 撈不到 {DAY} 的訊息 —— 退回已版控的 {ARCHIVE}（{len(msgs)} 則）")

hay = norm(LEDGER.read_text(encoding="utf-8")) if LEDGER.exists() else ""
# ⭐ 2026-08-21 修：⛔ 只比文字窗會漏掉整則訊息。
# `scripts/ruling.sh` 把 owner 的原話**逐字**寫進帳本當「裁決」列 ⇒ 那一則的 24 字窗
# 在帳本裡找得到（藏在裁決列裡），於是閘以為「它有列了」——
# ⛔ **把「這段文字出現在某處」誤認成「這則訊息有自己的列」。**
# 實測漏掉 2026-08-21 的 12:52 / 12:56 / 13:06 / 14:48 四則，而 13:06 是 #486–#490 五張票的來源。
# ⇒ 現在**兩個條件都要成立**：文字窗命中，**而且**該時間戳真的有一列。
_row_times = {c[0].strip() for _, c in LT.canonical_rows(LEDGER)} if LEDGER.exists() else set()
missing = [(t, m) for t, m in msgs if not (covered(m, hay) and t in _row_times)]

if CHECK:
    # ⭐ 票號那一格只有兩種合法值：`#123`（對到票）或 `— <理由>`（明說不需要開票）。
    # ⛔ 留空**不算已處理** —— 空白看起來像「處理過了」,而那正是要防的東西。
    bad = [(n, c) for n, c in LT.canonical_rows(LEDGER)
           if not re.search(r"#\d{2,4}", c[-1]) and not c[-1].lstrip().startswith(("—", "–"))]
    if not missing and not bad:
        print(f"✓ 逐則對票 {DAY}：{len(msgs)} 則訊息全部有列、全部對到票")
        sys.exit(0)
    for t, m in missing:
        print(f"⛔ 漏了 {t}  {re.sub(chr(10), ' ', m)[:70]}…")
    for n, c in bad:
        print(f"⛔ 未對票 {LEDGER}:{n}  {c[0]}  {c[1][:60]}…")
    print(f"→ 跑 `pnpm msgledger:build` 補列,再把每一列的票號填上"
          f"（對不到票就寫 `— <為什麼不需要開票>`,⛔ 不要留空也不要留 {LT.UNMAPPED}）")
    sys.exit(1)

# ── build ──────────────────────────────────────────────────────────────────
# ⭐ 全文**另存**,⛔ 不是把原話壓縮取代掉(第一·五守則:撞到字數上限時另存)。
# ⚠️ 這個檔名 `ledger-source_temp_*` 是 `scripts/asked-before.sh` 已經在 grep 的那個。
if FROM_TX:
    ARCHIVE.parent.mkdir(parents=True, exist_ok=True)
    ARCHIVE.write_text(
        f"# 逐則對票 · owner 原話全文 {DAY}\n\n"
        f"> ⭐ `docs/_daily/{DAY}.md` 的表格那一格是**截斷**過的,全文在這裡。\n"
        f"> 由 `scripts/message-ledger.sh` 從 session transcript 產生 —— ⛔ 不要手改。\n"
        f"> `scripts/asked-before.sh` 會 grep 這一份找 owner 的原話。\n\n"
        + "\n\n".join(f"## {t}\n\n{m}" for t, m in msgs) + "\n",
        encoding="utf-8")

added = LT.insert(LEDGER, [(t, LT.cell(m, MAXLEN), tickets_in(m)) for t, m in missing])
print(f"✓ {DAY}：{len(msgs)} 則訊息,補了 {added} 列（其餘已經有列）")
if added:
    print(f"⚠️ 新列的票號是**推出來**的;推不出來的是 `{LT.UNMAPPED}` —— 去填掉,"
          f"⛔ 留著 `pnpm msgledger:check` 會紅")
PY
