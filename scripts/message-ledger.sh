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
#   bash scripts/message-ledger.sh --check      # 閘(語意見下)
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
#
# ══════════════════════════════════════════════════════════════════════════
# ⛔⛔ GH#876：`--check` 為什麼**不再**硬檢查「今天」
# ══════════════════════════════════════════════════════════════════════════
# 這支閘在 2026-08-30 之前只檢查**今天**,而今天的 transcript 在 session
# 進行中會**一直長大** ⇒ owner 每講一句話就多一則「沒有列」的訊息 ⇒ 閘紅。
# ⭐ 跑 `msgledger:build` 也救不了:補進去的列票號是 `⏸ 未對票`,而那是**第二種紅**。
# ⇒ ⭐ **在一條還在跑的 session 裡,沒有任何動作能讓它綠。**
#
# 量到的基線(2026-08-30 01:4x,GH#876):連跑兩次 `pnpm msgledger:check`,
# 兩次都 exit 1、輸出**逐位元組相同**:3 則漏列(01:12/01:28/01:36 ＝ 這條 session
# 自己的訊息)＋ 1 列 `⏸ 未對票`。⇒ 失敗形態⑨「**一個永遠不會綠的閘**」。
# ⚠️ 它的代價不是這一條紅,是**它讓「skills:check 紅了」失去意義** ——
# 36 支閘裡只要有一支永遠紅,其餘 35 支的紅就沒有人會分辨。
#
# ⭐ 判準改成一個**答得出來**的問題:
#
#   | 日子 | `--check` 做什麼 | 為什麼 |
#   |---|---|---|
#   | **已經結束的每一天** | 硬檢查(紅) | 它的 transcript 已經凍結 ⇒ 這一題有終局答案 |
#   | **今天(進行中)** | 印出來但**不擋**(exit 0) | 它還在長大 ⇒ 這一題今天沒有終局答案 |
#
# ⛔ 這**不是**「放寬成模糊比對」:比對本身一個字都沒有放寬,
# 改的是**分母**(檢查哪幾天),而每一天最終**都會**被硬檢查一次 —— 在它結束的隔天。
#
# ⭐ 逃生口(＝一鍵回頭的開關,這是開發閘不是玩家設定,所以住環境變數):
#   GGD_LEDGER_STRICT_TODAY=1 bash scripts/message-ledger.sh --check   # 今天也硬檢查
#   bash scripts/message-ledger.sh --check --date "$(date +%F)"        # 同上,收工/發版時跑
# ⚠️ **明確指定 `--date` 一律是硬檢查**(⛔ 不看它是不是今天)——
# 部署協定第 1 步(逐句對票)要的就是這一條。
set -uo pipefail
cd "$(dirname "$0")/.."

# ⭐ GH#1163 —— **build 只做今天，而 `--check` 硬檢查的是昨天** ⇒ 錯誤訊息叫人「跑 msgledger:build 補上」，
#   照做了昨天那三則仍然漏著（形態⑨第三變形：修法指令治不好它指出的病）。
#   ⇒ 沒指定 `--date`、也不是 `--check`／`--find-time` 的 build，先對**昨天**跑一次（明確 `--date`），再做今天。
#   ⛔ 不動 python 那一段的縮排；用 `exec` 之前的一次遞迴。GGD_LEDGER_NO_YESTERDAY=1 可關（測試／單日重跑）。
case " $* " in
  *" --check "*|*" --date "*|*" --find-time "*) ;;
  *)
    if [ "${GGD_LEDGER_NO_YESTERDAY:-0}" != 1 ]; then
      _yday=$(date -v-1d +%F 2>/dev/null || date -d yesterday +%F)
      GGD_LEDGER_NO_YESTERDAY=1 bash "$0" --date "$_yday" "$@" || true
    fi;;
esac

exec python3 - "$@" <<'PY'
import json, os, re, sys, glob, datetime
from pathlib import Path

sys.path.insert(0, "scripts")
import ledger_table as LT
import claude_project_dir as CPD

TZ = datetime.timezone(datetime.timedelta(hours=8))          # owner 的本地時區


def _transcript_dir() -> Path:
    """`GGD_TRANSCRIPT_DIR`（測試用）＞ 主工作樹 slug（GH#1254，⛔ 不寫死一台機器的路徑）。

    推不出來（不是 git 樹）⇒ 說出來，回一個不存在的路徑 ⇒ 走已版控存檔那條來源（本來就是 CI 的路）。
    """
    if os.environ.get("GGD_TRANSCRIPT_DIR"):
        return Path(os.environ["GGD_TRANSCRIPT_DIR"])
    try:
        return CPD.project_dir(Path.cwd())
    except LookupError as e:
        print(f"⚠️ 推不出 transcript 目錄（{e}）—— 只能讀已版控的存檔", file=sys.stderr)
        return Path("/nonexistent-claude-project-dir")


PROJ = _transcript_dir()
MAXLEN = int(os.environ.get("GGD_LEDGER_MAXLEN", "300"))
WINDOW = 24                                                   # 判定「已經有列」的比對窗

argv = sys.argv[1:]
CHECK = "--check" in argv
EXPLICIT = next((argv[i + 1] for i, a in enumerate(argv) if a == "--date"), None)
TODAY = datetime.datetime.now(TZ).strftime("%Y-%m-%d")
DAY = EXPLICIT or TODAY
DIR = Path(os.environ.get("GGD_LEDGER_DIR", "docs/_daily"))     # 測試用;出貨一律 docs/_daily
STRICT_TODAY = os.environ.get("GGD_LEDGER_STRICT_TODAY", "").strip() not in ("", "0", "false")

SKIP = ("<", "[Request interrupted", "This session is being continued", "Caveat:")


def ledger_of(day: str) -> Path:
    return DIR / f"{day}.md"


def archive_of(day: str) -> Path:
    return DIR / f"ledger-source_temp_{day.replace('-', '')}.md"


LEDGER = ledger_of(DAY)
ARCHIVE = archive_of(DAY)


def yesterday(day: str) -> str:
    return (datetime.date.fromisoformat(day) - datetime.timedelta(days=1)).isoformat()


def transcript_files() -> list:
    """session jsonl,**新的在前**。⭐ 唯一住處 —— `from_transcript()` 與 `--find-time` 都問這一支。"""
    return sorted(PROJ.glob("*.jsonl"), key=lambda q: q.stat().st_mtime, reverse=True) \
        if PROJ.is_dir() else []


#: ⭐ GH#1255 的回頭開關（開發閘，住環境變數）：`GGD_LEDGER_COLLECT_QUEUED=0` ⇒ 不收 `queued_command`。
COLLECT_QUEUED = os.environ.get("GGD_LEDGER_COLLECT_QUEUED", "1").strip() not in ("0", "false")


def _text_of(c) -> str:
    return (c if isinstance(c, str) else "\n".join(
        b.get("text", "") for b in c or [] if isinstance(b, dict) and b.get("type") == "text")).strip()


def owner_message(d: dict):
    """transcript 的一筆紀錄 → `(timestamp, 原話, uuid)`；不是 owner 打的字就回 None。

    ⭐ **兩條路**，⛔ 不是一條（GH#1255）：
      · `"type": "user"` —— owner 在助手**閒著**時打的字；身分＝`uuid`。
      · `"type": "attachment"`，其 attachment 的 `"type": "queued_command"`、`"commandMode": "prompt"`、`origin` 的 `"kind": "human"`
        —— owner 在助手**忙碌**時打進來、被吸收進當輪的字；身分＝`source_uuid`，時間＝`attachment.timestamp`。
        ⛔ 在此之前只收第一條 ⇒ 這一整類**不在分母裡** ⇒ `--check` 永遠綠（09-11～14 量到 55 則不在帳本，
        例：owner 2026-09-12 11:13 的合併原則那一則）。
    ⛔ 排除：`"commandMode": "task-notification"`（背景任務通知，⛔ 不是 owner 的話）、`"kind": "peer"`（別的 agent 傳來的）。
    """
    if d.get("type") == "user":
        if d.get("toolUseResult") is not None or d.get("isMeta"):
            return None
        ts, t, uid = d.get("timestamp", ""), _text_of((d.get("message") or {}).get("content")), d.get("uuid")
    elif d.get("type") == "attachment" and COLLECT_QUEUED:
        a = d.get("attachment") or {}
        if a.get("type") != "queued_command" or a.get("commandMode") != "prompt" \
                or (a.get("origin") or {}).get("kind") != "human":
            return None
        ts, t, uid = a.get("timestamp") or d.get("timestamp", ""), _text_of(a.get("prompt")), a.get("source_uuid")
    else:
        return None
    if not ts or not t or t.startswith(SKIP):
        return None
    return ts, t, uid


def from_transcript(days, files=None) -> dict:
    """最新的 session jsonl → 這幾天各自的 owner 真人訊息 `(HH:MM, 原話, 身分)`。濾法照 CLAUDE.md 部署協定第 1 步。

    ⭐ **一趟掃完全部要的日子**,⛔ 不是每天掃一次 —— 出貨那份 transcript 是 **14GB**,
    實測掃一趟 ≈ 26 秒。一天一趟的寫法會讓「今天 + 昨天」變成 52 秒(GH#876 量的)。
    `files` 沒給 ⇒ 全部(既有行為);給了 ⇒ 只掃那幾份(`--find-time` 用它逐份早停)。
    """
    days = set(days)
    # ⚠️ jsonl 的 timestamp 是 **UTC**,而我們按 GMT+8 分日 ⇒ 粗篩要連**前一天**的
    # UTC 前綴一起要(GMT+8 的 01:12 是 UTC 的前一天 17:12)。
    probe = days | {yesterday(d) for d in days}
    want = tuple(f'"{d}T'.encode() for d in sorted(probe))
    kinds = (b'"type":"user"', b'"queued_command"') if COLLECT_QUEUED else (b'"type":"user"',)
    files = transcript_files() if files is None else list(files)
    out = {d: [] for d in days}
    seen = set()
    # ⚠️ transcript 是 GB 級的,所以先用 bytes 粗篩再 json.loads(否則一次對帳要幾分鐘)。
    for src in files:
        with src.open("rb") as f:
            for raw in f:
                if not any(k in raw for k in kinds) or not any(w in raw for w in want):
                    continue
                try:
                    msg = owner_message(json.loads(raw.decode("utf-8", "replace")))
                except Exception:
                    continue
                if not msg:
                    continue
                ts, t, uid = msg
                lo = datetime.datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(TZ)
                day = lo.strftime("%Y-%m-%d")
                if day not in days:
                    continue
                # ⭐ 去重鍵＝**身分**（同一則被 resume 複製進另一份 transcript 時 uuid 不變 —— 實測 258 例）；
                #   ⛔ 不再是 `(day, HH:MM, t[:80])`：那會把同一分鐘逐字相同、uuid 不同的兩則塌成一則
                #   （owner 2026-09-12「詳實記錄不會合併」）。
                mid = LT.short_id(uid)
                key = mid or (day, lo.isoformat(), t)
                if key in seen:
                    continue
                seen.add(key)
                out[day].append((lo.isoformat(), lo.strftime("%H:%M"), t, mid))
    return {d: [(hm, t, mid) for _, hm, t, mid in sorted(v)] for d, v in out.items()}


#: 全文存檔的段落標題：`## HH:MM · <身分>`（GH#1255）；舊存檔的 `## HH:MM` 照讀（CI 走這條來源）。
ARCHIVE_HEAD = re.compile(r"^## (\d{1,2}:\d{2})(?: · ([0-9a-f]{%d}))?$" % LT.ID_LEN)


def from_archive(day: str):
    """transcript 不在這台機器上(CI / host)時的來源 —— 已進版控的全文存檔。

    ⭐ fail-open 但**不靜默**:退回存檔時會印出來,而且閘仍然驗得到
    「存檔裡的每一則都有列」。⛔ 直接 exit 0 才是靜默。
    """
    path = archive_of(day)
    if not path.exists():
        return []
    out, cur, buf = [], None, []
    for ln in path.read_text(encoding="utf-8").split("\n"):
        m = ARCHIVE_HEAD.match(ln)
        if m:
            if cur:
                out.append((*cur, "\n".join(buf).strip()))
            cur, buf = (m.group(1), m.group(2)), []
        elif cur is not None:
            buf.append(ln)
    if cur:
        out.append((*cur, "\n".join(buf).strip()))
    return [(t, m, mid) for t, mid, m in out]


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


def unmapped_rows(day: str):
    """票號那一格還沒被決定的列。⭐ **只讀帳本**,⛔ 不碰 transcript ⇒ 便宜到可以全掃。

    ⭐ 「算不算已決定」的規則住 `LT.decided()` **一處**(第〇·四守則)——
    `ledger_table.py --map`(填票號那支)問的是同一支,⛔ 不是各帶一份會漂掉的正則。
    """
    return [(n, c) for n, c in LT.canonical_rows(ledger_of(day)) if not LT.decided(c[-1])]


def evaluate(day: str, tx: dict):
    """回傳 (訊息, 漏掉的, 未對票的, 來源是不是 transcript, 認領)。

    認領＝`{帳本行號: 身分}`：**舊列**（沒有身分）認得這一則 ⇒ 建置器把身分蓋上去（`LT.stamp_ids`）。
    """
    msgs = tx.get(day) or []
    from_tx = bool(msgs)
    if not from_tx:
        msgs = from_archive(day)
    led = ledger_of(day)
    hay = norm(led.read_text(encoding="utf-8")) if led.exists() else ""
    rows = LT.canonical_rows(led)
    ids = {LT.row_id(c[1]) for _, c in rows} - {None}
    # ⭐ 2026-08-21 修：⛔ 只比文字窗會漏掉整則訊息 —— `ruling.sh` 把原話逐字寫進別的列時，
    #   24 字窗在帳本裡找得到而那一則**沒有自己的列**（實測漏 08-21 12:52/12:56/13:06/14:48）。
    #   ⇒ 文字窗命中**而且**那一分鐘真的有一列（GH#1238：逐字的 `HH:MM`，⛔ 沒有時間窗 ——
    #   owner 2026-09-12「詳實記錄不會合併」；模糊比對會把 17:45 與 17:56 的重講當成「有了」）。
    #
    # ⭐ GH#1255：帶**身分**的訊息先問身分 —— 有一列帶著它 ⇒ 有列。沒有 ⇒ 去認一列**還沒有身分**的舊列，
    #   每一列**只能被認一次**（同一分鐘逐字相同、uuid 不同的兩則 ⇒ 第二則沒有列可認 ⇒ 漏列 ⇒ 建置器補一列）。
    #   兩趟：先認「那一列的字就是這一則」的，再認「那一分鐘有一列、字在帳本某處」的（舊判準，改述過的列）。
    free = [(n, c) for n, c in rows if not LT.row_id(c[1])]
    adopt: dict = {}
    pending = []
    for t, m, mid in msgs:
        if mid and mid in ids:
            continue
        hit = next((n for n, c in free if mid and n not in adopt and c[0].strip() == t
                    and covered(m, norm(LT.strip_id(c[1])))), None)
        if hit is not None:
            adopt[hit] = mid
        else:
            pending.append((t, m, mid))
    missing = []
    for t, m, mid in pending:
        if not covered(m, hay):
            missing.append((t, m, mid))
            continue
        if not mid:                                  # 已版控的舊存檔（沒有身分）⇒ 舊判準
            if not any(c[0].strip() == t for _, c in rows):
                missing.append((t, m, mid))
            continue
        hit = next((n for n, c in free if n not in adopt and c[0].strip() == t), None)
        if hit is None:
            missing.append((t, m, mid))
        else:
            adopt[hit] = mid
    return msgs, missing, unmapped_rows(day), from_tx, adopt


def report(day: str, missing, bad, prefix: str = "⛔") -> None:
    # ⚠️ 「漏了 <HH:MM>」這個字串是守衛在斷言的（messageLedgerScript.test.ts），
    # ⇒ 日期補在**後面**,⛔ 不是插在中間把它切斷。
    for t, m, mid in missing:
        print(f"{prefix} 漏了 {t} · {day}{' · ' + mid if mid else ''}  {re.sub(chr(10), ' ', m)[:70]}…")
    for n, c in bad:
        mid = LT.row_id(c[1])
        print(f"{prefix} 未對票 {ledger_of(day)}:{n}  {c[0]}{' · ' + mid if mid else ''}  {LT.strip_id(c[1])[:60]}…")


HOWTO = (
    "→ 漏列：跑 `pnpm msgledger:build` 補上（⭐ 它會補**昨天＋今天**；更早的日子 `pnpm msgledger:build --date <日>`）\n"
    "→ 未對票：`python3 scripts/ledger_table.py --map <帳本.md> <HH:MM 或 身分> '<票號 或 — 理由>'`"
    "（同一分鐘兩列以上 ⇒ 用上面印的身分）\n"
    f"   （⛔ 不要手動 chmod、⛔ 不要直接編那份 444 的帳本；對不到票就寫 `— <為什麼不需要開票>`，"
    f"⛔ 不要留空也不要留 {LT.UNMAPPED}）")


def tickets_in(text: str) -> str:
    seen, out = set(), []
    for n in re.findall(r"#(\d{2,4})\b", text):
        if n not in seen:
            seen.add(n)
            out.append(f"#{n}")
    return " ".join(out) or LT.UNMAPPED


# ── find-time（GH#1028 A）──────────────────────────────────────────────────
# `ruling.sh` 的列鍵要是**訊息時間**(檔頭 :16-17 這張表自己宣告的鍵),⛔ 不是執行時間 ——
# 否則同一句話兩個寫入端各插一列,一列對了票、一列永遠 ⏸ 未對票(2026-09-06 量到三對)。
# ⭐ 解析 transcript 的程式只有 `from_transcript()` **這一份**;這裡只是把它端出去,
#   ⛔ 不在 ruling.sh 裡再長一份會漂掉的解析器。
#   bash scripts/message-ledger.sh --find-time "<逐字原話>" [--date <日>] [--with-text]
#   ⇒ stdout 印 `YYYY-MM-DD HH:MM <身分>`(找到;身分 GH#1255,`ruling.sh` 拿它當列的身分)或空(找不到,呼叫端退回執行時間);永遠 exit 0。
#   ⭐ `--with-text`:第二行起印**那一則在 transcript 裡的逐字原話**。
#     帳本 owner 2026-09-12 起「詳實記錄不會合併」⇒ 列的鍵是**同一分鐘 ＋ 同一段文字**
#     (`ledger_table._same_entry`)⇒ `ruling.sh` 只對齊時間而文字仍是**我記的版本**(掉字、接了我的註),
#     建置器補列時就對不上 ⇒ 同一則兩列、一列永遠 ⏸ 未對票(`rulingScript.test.ts` 量到)。
#     ⇒ 鍵的**兩半**都從 transcript 來,⛔ 不是只有時間。
#   ⚠️ 原話走**參數**⛔ 不是 stdin —— 這支 python 自己就是從 stdin(heredoc)餵進來的。
def find_message_time(text: str, days):
    """這句原話在 transcript 裡的 `(日期, HH:MM, 那一則的逐字原話, 身分)`;找不到回 None。

    ⭐ 鑰匙是**文字**(第〇·六守則:時間正是今天漂掉的那把):原話的任一段 24 字窗出現在某則
    訊息裡(與 `covered()` 同一套 `norm`)、或整句互為子字串。`X => Y` 這種「我的問句 => 他的答」
    也拆開各試一段。多則命中取**最晚**的一則(裁決一定記在它剛說完的時候);
    太短(<4 字)沒有辨識度 ⇒ 不猜,回 None。
    ⭐ 逐份 transcript **新的先掃、命中就停** —— 這句話幾乎一定在最新那一份,⛔ 不必每次掃 12GB。
    """
    segs = [text] + [s for s in re.split(r"=>|⇒", text) if s.strip()]
    keys = []
    for seg in segs:
        # ⚠️ 去掉段尾的開括號／冒號：「血量倍率4x, M=15 K=1000 （⇒ #1029 …）」切在 ⇒ 之後第一段
        #   尾巴掛著一個「（」—— 那是**我的**註記的開頭,⛔ 不是他說的字;留著它整段就對不上(2026-09-06 12:28 量到)。
        n = norm(seg).rstrip("（(：:，,、")
        if len(n) >= 4 and n not in keys:
            keys.append(n)
    if not keys:
        return None
    for src in transcript_files():
        best = None
        for day, msgs in from_transcript(set(days), files=[src]).items():
            for t, m, mid in msgs:
                hm = norm(m)
                for n in keys:
                    w = min(WINDOW, len(n))
                    hit = n in hm or (len(hm) >= 4 and hm in n) or \
                        any(n[i:i + w] in hm for i in range(len(n) - w + 1))
                    if hit and (best is None or (day, t) > best[:2]):
                        best = (day, t, m, mid)
                        break
        if best:
            return best
    return None


if "--find-time" in argv:
    _i = argv.index("--find-time")
    _text = argv[_i + 1] if _i + 1 < len(argv) else ""
    _hit = find_message_time(_text, {DAY, yesterday(DAY)}) if _text.strip() else None
    if _hit:
        print(f"{_hit[0]} {_hit[1]} {_hit[3] or ''}".rstrip())
        if "--with-text" in argv[_i + 2:]:
            print(_hit[2])
    sys.exit(0)


# ── check ──────────────────────────────────────────────────────────────────
if CHECK:
    # ⭐ 硬檢查的分母:明確指定 `--date` ⇒ 就那一天;否則 ⇒ **最近一個已經結束的日子**。
    # 「今天」只在 GGD_LEDGER_STRICT_TODAY=1 時進硬檢查(見檔頭的逃生口)。
    if EXPLICIT:
        hard, live = [EXPLICIT], None
    else:
        hard, live = [yesterday(TODAY)], (None if STRICT_TODAY else TODAY)
        if STRICT_TODAY:
            hard.append(TODAY)
    tx = from_transcript(set(hard) | ({live} if live else set()))

    failed = False
    for day in hard:
        msgs, missing, bad, from_tx, _ = evaluate(day, tx)
        if not from_tx and msgs:
            print(f"⚠️ transcript 撈不到 {day} 的訊息 —— 退回已版控的 {archive_of(day)}（{len(msgs)} 則）")
        if missing or bad:
            failed = True
            report(day, missing, bad)
        else:
            print(f"✓ 逐則對票 {day}：{len(msgs)} 則訊息全部有列、全部對到票")

    # ⭐ 再便宜地全掃一次**每一份已結束**帳本的票號欄（⛔ 不碰 transcript,所以幾乎免費）。
    # 這一條是永久的棘輪:一列 `⏸ 未對票` 不會因為那一天過去了就被忘掉。
    for path in sorted(DIR.glob("????-??-??.md")):
        day = path.stem
        if day >= TODAY or day in hard:
            continue
        bad = unmapped_rows(day)
        if bad:
            failed = True
            report(day, [], bad)

    # ⭐ 今天:印出來但**不擋**（失敗形態⑨ —— 見檔頭。⛔ fail-open 但不靜默）。
    if live:
        _, missing, bad, _, _ = evaluate(live, tx)
        if missing or bad:
            report(live, missing, bad, prefix="⏳")
            print(f"⏳ 上面 {len(missing)} 則漏列 + {len(bad)} 列未對票是**今天（{live}）**的 —— "
                  "這條 session 還在跑,transcript 還在長 ⇒ ⛔ **不擋**。")
            print("   收工/發版時硬檢查它：`bash scripts/message-ledger.sh --check --date "
                  f"{live}`（或 GGD_LEDGER_STRICT_TODAY=1）")
        else:
            print(f"✓ 今天（{live}）目前也全部有列、全部對到票")

    if failed:
        print(HOWTO)
        sys.exit(1)
    sys.exit(0)

# ── build ──────────────────────────────────────────────────────────────────
tx = from_transcript({DAY})
msgs, missing, _bad, FROM_TX, ADOPT = evaluate(DAY, tx)
if not FROM_TX and msgs:
    print(f"⚠️ transcript 撈不到 {DAY} 的訊息 —— 退回已版控的 {ARCHIVE}（{len(msgs)} 則）")


def _bytes(p: Path) -> bytes:
    return p.read_bytes() if p.exists() else b""


before = (_bytes(LEDGER), _bytes(ARCHIVE))   # ⭐ GH#1026 ①:收工要知道「有沒有動到 board 的輸入」

# ⭐ 全文**另存**,⛔ 不是把原話壓縮取代掉(第一·五守則:撞到字數上限時另存)。
# ⚠️ 這個檔名 `ledger-source_temp_*` 是 `scripts/asked-before.sh` 已經在 grep 的那個。
# ⭐ GH#1255：段落標題帶**身分**（`## HH:MM · <身分>`）⇒ CI 走存檔這條來源時一樣分得開同一分鐘的兩則；
#   寫入點自解鎖（與 `ledger_table._unlock` 同一支）—— 直接跑 `--date` 補舊日子時存檔平時 444。
if FROM_TX:
    ARCHIVE.parent.mkdir(parents=True, exist_ok=True)
    if ARCHIVE.exists():
        LT._unlock(ARCHIVE)
    ARCHIVE.write_text(
        f"# 逐則對票 · owner 原話全文 {DAY}\n\n"
        f"> ⭐ `docs/_daily/{DAY}.md` 的表格那一格是**截斷**過的,全文在這裡。\n"
        f"> 由 `scripts/message-ledger.sh` 從 session transcript 產生 —— ⛔ 不要手改。\n"
        f"> `scripts/asked-before.sh` 會 grep 這一份找 owner 的原話。\n\n"
        + "\n\n".join(f"## {t}{' · ' + mid if mid else ''}\n\n{m}" for t, m, mid in msgs) + "\n",
        encoding="utf-8")

# ⭐ `prefer_incoming_text=True`:建置器的字**逐字**來自 transcript ⇒ 逐字命中 `ruling.sh` 已插的**同一則**時,
#   owner 的原話贏過任何改述。⛔ 不命中就新增一列(owner 2026-09-12「詳實記錄不會合併」)。
# ⭐ GH#1255：先把身分蓋到**認得的舊列**上（只動格尾，文字與票號不碰），再補漏列 ——
#   順序有意義：舊列先帶上身分，同一分鐘逐字相同、uuid 不同的第二則才不會被 `_find_row` 當成同一則。
stamped = LT.stamp_ids(LEDGER, ADOPT) if LEDGER.exists() else 0
added = LT.insert(LEDGER, [(t, LT.with_id(LT.cell(m, MAXLEN), mid), tickets_in(m)) for t, m, mid in missing],
                  prefer_incoming_text=True)
print(f"✓ {DAY}：{len(msgs)} 則訊息,補了 {added} 列、舊列補上身分 {stamped} 列（其餘已經有列）")
if added:
    print(f"⚠️ 新列的票號是**推出來**的;推不出來的是 `{LT.UNMAPPED}` —— 去填掉,"
          f"⛔ 留著 `pnpm msgledger:check` 會紅")

# ⭐ GH#1026 ①:帳本與全文存檔都是 `board:roll`／`board:build` 的輸入 —— 動了就自己重生成,
#   ⛔ 不等 `skills:check`(⇒ CI 的 contract job)紅。位元組沒變就不跑(建置器每次都重寫存檔,內容常常相同)。
#   ⚠️ 在 `genrun`／`skills:sync` 鏈裡(GGD_QUARANTINE_UNLOCKED=1)它會讓鏈接手並說出來 —— 見 `regenerate_boards()`。
if (_bytes(LEDGER), _bytes(ARCHIVE)) != before:
    LT.regenerate_boards(LEDGER)
PY
