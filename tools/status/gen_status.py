#!/usr/bin/env python3
"""gen_status.py — regenerate docs/requirements-status.md from THE TASK LEDGER.

The user asked for a live status file they can keep open
(「請你將地毯式搜索的結果及進度動態更新到一個 md 檔上供我查看」).

⚠ 這支程式以前把任務清單**手抄**在原始碼裡。手抄的那份停在 131 筆（而且 #85 / #93
各被抄了兩次，實際只有 129 個不重複任務），帳本當時已經有 172 筆 —— 也就是說整整
43 個任務從來沒出現在這頁上，而分母卻看起來很「完成」。**手抄清單一定會漂移，只是
早晚而已。** 所以現在改成：任務清單在**產生的當下**從帳本讀出來，程式碼裡一個任務
都不留。帳本加一筆，重跑就多一筆，不用改這支 .py。

帳本（ledger）＝ 任務系統的落地檔：一個目錄，裡面每個任務一個 `<id>.json`，
欄位至少有 `id` / `subject` / `status`（status ∈ pending | in_progress | completed）。
解析順序見 `resolve_ledger()`；**找不到或解析失敗一律非零退出**，絕不安靜地少印幾筆
—— 安靜地少印，正是這頁漂到 131 沒人發現的原因。

用法
  python3 tools/status/gen_status.py                # 產生 docs/requirements-status.md
  python3 tools/status/gen_status.py --check        # 只驗證：頁面是否與帳本一致（CI/test）
  python3 tools/status/gen_status.py --ledger PATH  # 指定帳本（目錄或 json 陣列檔）
  GGD_TASK_LEDGER=PATH python3 tools/status/gen_status.py

檔案
  docs/requirements-status.md   輸出頁（本工具唯一的產出）
  docs/_task-ledger.json        每次成功產生時寫下的**帳本快照**：進版控、可 review，
                                也是 CI（帳本目錄不存在的機器）唯一的資料來源。
  tools/status/task_meta.json   顯示用中介資料（分類 + 可選標題覆寫），不是任務清單。

status codes（頁面顯示用；由帳本狀態直接映射，不做任何推測）
  done     ✅ ledger: completed
  flight   🔄 ledger: in_progress
  pending  ⬜ ledger: pending
"""
import argparse
import collections
import datetime
import glob
import json
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(REPO, "docs", "requirements-status.md")
MIRROR = os.path.join(REPO, "docs", "_task-ledger.json")
META_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "task_meta.json")

# deep-audit block: a plain file the carpet-search writes when it lands.
AUDIT_FILE = os.path.join(REPO, "docs", "_requirements-audit-gaps.md")

# where the task system keeps its per-session ledger directories
HOME_LEDGER_GLOB = os.path.join(os.path.expanduser("~"), ".claude", "tasks", "*")

# ledger status -> page status. Unknown ledger statuses are a hard error: a new
# status silently collapsing into "pending" would be the 131-bug all over again.
STATUS_MAP = {"completed": "done", "in_progress": "flight", "pending": "pending"}

DOMAINS = [
    ("audio",   "🎵 音樂 / 音效"),
    ("ui",      "🖥️ 介面 UI"),
    ("combat",  "⚔️ 戰鬥系統 / 玩法"),
    ("models",  "🎭 模型 / 特效"),
    ("content", "📦 內容 / 經濟 / 資料"),
    ("infra",   "🔧 基礎建設 / 技術債"),
    ("misc",    "🧩 其他 / 未分類"),   # only rendered when non-empty
]
DOMAIN_KEYS = {d for d, _ in DOMAINS}

MARK = {"done": "✅", "flight": "🔄", "stalled": "⏸", "designed": "📐", "pending": "⬜", "blocked": "⛔"}
LABEL = {"done": "已完成", "flight": "進行中", "stalled": "做中·待續跑(花費上限中斷)",
         "designed": "已設計未實作", "pending": "待辦", "blocked": "受阻"}
LEGEND = {"done": "已完成並驗證", "flight": "背景任務實作中", "stalled": "做中·待續跑",
          "designed": "已設計未實作", "pending": "待辦", "blocked": "受阻（等外部條件，如供應商金鑰）"}
# every key of MARK must appear in ORDER, or a row of that status would raise
# ValueError in the per-domain sort.
ORDER = ["stalled", "flight", "blocked", "designed", "pending", "done"]

# fallback classifier for ledger tasks that task_meta.json says nothing about,
# so a brand-new task lands in a sensible section without editing this file.
# first matching domain wins; order matters.
DOMAIN_RULES = [
    ("audio",   r"\bbgm\b|\bsfx\b|\bvo\b|voice|audio|sound|music|roar|音效|音樂|語音|旁白|配音|主題曲|名言"),
    ("models",  r"\bmodel\b|\bglb\b|\bmdx\b|\bvfx\b|particle|animation|\banim\b|mesh|geometry|模型|動畫|粒子|特效"),
    ("ui",      r"\bhud\b|\bui\b|screen|panel|button|minimap|shop|tooltip|layout|mobile|iphone|codex|editor|"
                r"介面|畫面|按鈕|商店|小地圖|圖鑑|編輯器|排版"),
    ("combat",  r"combat|match|round|damage|ability|cast|kill|bounty|arena|camera|bot\b|tick|"
                r"戰鬥|回合|傷害|技能|競技場|擊殺"),
    ("content", r"\bitem\b|champion|roster|import|w3x|whitelist|economy|augment|draft|"
                r"道具|英雄|名冊|匯入|經濟|內容"),
    ("infra",   r"server|deploy|docker|k8s|redis|security|auth|password|port\b|\bci\b|test|loading|network|"
                r"regist|invite|account|admin|backup|replay|"
                r"伺服器|部署|安全|登入|註冊|測試|載入|備份"),
]

# 最該優先 callouts. Hand-written prose (the ledger has no priority field), but
# an item whose ledger status is `completed` is dropped automatically — a
# priority list that still shouts about finished work is how a status page
# starts lying again.
CALLOUTS = [
    (65,  "**#65 git init** — 整個專案沒有版控，已因此永久遺失過檔案。每個任務都在裸奔。"),
    (100, "**#100 戰鬥不停** — 回合結束後角色還打 66 秒，正擋著 #85 死亡灰階看不到效果。"),
    (112, "**#112 + 供應商金鑰** — AI 圖示 0 張；我修圖片路徑，你在後台設金鑰，才跑得動。"),
]


class LedgerError(Exception):
    """The ledger could not be located, read, or trusted. Always fatal."""


# ---------------------------------------------------------------------------
# ledger


def _task_from_obj(obj, where):
    for field in ("id", "subject", "status"):
        if field not in obj:
            raise LedgerError(f"{where}: task is missing required field `{field}` — {obj!r:.160}")
    try:
        tid = int(str(obj["id"]).strip())
    except ValueError:
        raise LedgerError(f"{where}: task id {obj['id']!r} is not an integer")
    status = str(obj["status"]).strip()
    if status not in STATUS_MAP:
        raise LedgerError(
            f"{where}: task #{tid} has unknown status {status!r}; "
            f"known statuses are {sorted(STATUS_MAP)}. Refusing to guess — add the "
            f"mapping to STATUS_MAP in {os.path.relpath(__file__, REPO)} instead."
        )
    subject = str(obj["subject"]).strip()
    if not subject:
        raise LedgerError(f"{where}: task #{tid} has an empty subject")
    return {"id": tid, "subject": subject, "status": status}


def load_ledger_dir(path):
    """A task-system ledger directory: one <id>.json per task."""
    files = sorted(glob.glob(os.path.join(path, "*.json")))
    if not files:
        raise LedgerError(f"{path}: no *.json task files found")
    tasks, seen = [], {}
    for f in files:
        try:
            with open(f, encoding="utf-8") as fh:
                obj = json.load(fh)
        except (OSError, json.JSONDecodeError) as e:
            raise LedgerError(f"{f}: cannot read/parse task file — {e}")
        if not isinstance(obj, dict):
            raise LedgerError(f"{f}: expected a task object, got {type(obj).__name__}")
        t = _task_from_obj(obj, f)
        if t["id"] in seen:
            raise LedgerError(f"{f}: duplicate task id #{t['id']} (also in {seen[t['id']]})")
        seen[t["id"]] = f
        tasks.append(t)
    return tasks


def load_ledger_json(path):
    """A snapshot file: {"tasks": [...]} or a bare [...] array."""
    try:
        with open(path, encoding="utf-8") as fh:
            obj = json.load(fh)
    except (OSError, json.JSONDecodeError) as e:
        raise LedgerError(f"{path}: cannot read/parse ledger snapshot — {e}")
    rows = obj.get("tasks") if isinstance(obj, dict) else obj
    if not isinstance(rows, list) or not rows:
        raise LedgerError(f"{path}: snapshot has no `tasks` array (or it is empty)")
    tasks, seen = [], set()
    for i, row in enumerate(rows):
        if not isinstance(row, dict):
            raise LedgerError(f"{path}[{i}]: expected an object, got {type(row).__name__}")
        t = _task_from_obj(row, f"{path}[{i}]")
        if t["id"] in seen:
            raise LedgerError(f"{path}: duplicate task id #{t['id']}")
        seen.add(t["id"])
        tasks.append(t)
    return tasks


def _score_dir(path):
    return len(glob.glob(os.path.join(path, "*.json")))


def display_source(path):
    """Machine-independent name for a ledger path.

    The page prints where its numbers came from, so this string has to be the
    SAME on every machine — otherwise a CI box reading the snapshot would render
    a different header and --check would scream "stale" forever.
    """
    if path.startswith(REPO):
        return os.path.relpath(path, REPO)
    home = os.path.expanduser("~")
    return path.replace(home, "~", 1) if path.startswith(home) else path


def recorded_source(path):
    """The origin a snapshot remembers (so CI reports the real ledger, not the mirror)."""
    try:
        with open(path, encoding="utf-8") as f:
            obj = json.load(f)
        if isinstance(obj, dict) and obj.get("source"):
            return str(obj["source"])
    except (OSError, json.JSONDecodeError):
        pass
    return display_source(path)


def resolve_ledger(explicit=None):
    """Return (tasks, source_label, source_kind). Raises LedgerError — never returns short.

    Order: --ledger / $GGD_TASK_LEDGER → the task-system ledger dirs under
    ~/.claude/tasks/* (the one holding the most tasks; ties → most recent) →
    the committed snapshot docs/_task-ledger.json (what CI has).
    """
    picked = explicit or os.environ.get("GGD_TASK_LEDGER")
    if picked:
        picked = os.path.expanduser(picked)
        if os.path.isdir(picked):
            return load_ledger_dir(picked), display_source(picked), "dir"
        if os.path.isfile(picked):
            return load_ledger_json(picked), recorded_source(picked), "snapshot"
        raise LedgerError(f"{picked}: ledger path does not exist (from --ledger/$GGD_TASK_LEDGER)")

    dirs = [d for d in glob.glob(HOME_LEDGER_GLOB) if os.path.isdir(d) and _score_dir(d)]
    # ⭐ **committed 快照與家目錄帳本比大小**（GH#870，2026-08-29）。
    #
    # ⚠️ 在此之前家目錄**永遠贏**（只要有一個目錄就用它）。而任務帳本住
    #   `~/.claude/tasks/<session-id>/` —— ⭐ 它是 **session 專屬且會自我刪除**的：
    #   實測今天整台機器只剩一個 **2026-08-16 的 5 筆殘骸**，
    #   而 committed 快照 `docs/_task-ledger.json` 有 **286 筆**。
    #   ⇒ ⭐ 舊殘骸把真正的分母擠掉了 ⇒ 產生器的 LEDGER SHRANK 護欄天天擋，
    #     而 `--check` 那一側卻叫人「re-run the generator」—— **兩側方向相反**。
    #
    # ⭐ 判準改成「**誰的筆數多**」，⛔ 不是「誰住哪裡」：
    #   一個活著的 session 一定比 committed 快照新且不會更少；
    #   ⛔ 而一個被清掉一半的殘骸必然更少 ⇒ 這條規則自動選對。
    snap_n = snapshot_count()
    if dirs:
        dirs.sort(key=lambda d: (_score_dir(d), os.path.getmtime(d)), reverse=True)
        if snap_n is None or _score_dir(dirs[0]) >= snap_n:
            return load_ledger_dir(dirs[0]), display_source(dirs[0]), "dir"

    if os.path.exists(MIRROR):
        return load_ledger_json(MIRROR), recorded_source(MIRROR), "snapshot"

    raise LedgerError(
        "no task ledger found. Looked at: --ledger/$GGD_TASK_LEDGER, "
        f"{HOME_LEDGER_GLOB}, {os.path.relpath(MIRROR, REPO)}. "
        "Refusing to emit a status page without one."
    )


def snapshot_count():
    """Task count of the committed snapshot, or None when there is no snapshot."""
    try:
        return len(load_ledger_json(MIRROR))
    except LedgerError:
        return None


def write_snapshot(tasks, source):
    payload = {
        "_doc": "帳本快照，由 tools/status/gen_status.py 產生。手改無效（下次執行就被覆蓋），"
                "要改請改任務帳本本身。CI 上沒有帳本目錄時，這份就是 --check 的資料來源。",
        "generated": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
        "source": source,   # already machine-independent (see display_source)
        "count": len(tasks),
        "tasks": sorted(tasks, key=lambda t: t["id"]),
    }
    with open(MIRROR, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")


# ---------------------------------------------------------------------------
# display metadata


def load_meta():
    try:
        with open(META_FILE, encoding="utf-8") as f:
            obj = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        raise LedgerError(f"{META_FILE}: cannot read/parse display metadata — {e}")
    rows = obj.get("tasks", obj)
    meta = {}
    for k, v in rows.items():
        if k.startswith("_"):
            continue
        dom = (v or {}).get("domain")
        if dom is not None and dom not in DOMAIN_KEYS:
            raise LedgerError(f"{META_FILE}: task {k} has unknown domain {dom!r}; known: {sorted(DOMAIN_KEYS)}")
        meta[int(k)] = v or {}
    return meta


def classify(subject):
    s = subject.lower()
    for dom, pattern in DOMAIN_RULES:
        if re.search(pattern, s):
            return dom
    return "misc"


def decorate(tasks, meta):
    """ledger tasks + display metadata -> (id, domain, page_status, label) rows."""
    rows = []
    for t in tasks:
        m = meta.get(t["id"], {})
        rows.append((
            t["id"],
            m.get("domain") or classify(t["subject"]),
            STATUS_MAP[t["status"]],
            m.get("label") or t["subject"],
        ))
    return rows


# ---------------------------------------------------------------------------
# render

STAMP_RE = re.compile(r"^> 最後更新 .*$", re.M)


def render(rows, now, source, count):
    counts = collections.Counter(s for _, _, s, _ in rows)
    total = len(rows)
    L = []
    L.append("# 去死團的逆襲 — 需求完成狀況")
    L.append("")
    L.append(f"> 最後更新 **{now}** · 由 `tools/status/gen_status.py` 產生。")
    L.append("> 這份檔案是動態的：每當有任務狀態改變，重跑一次就會刷新。")
    L.append(f"> 任務清單於產生當下由**任務帳本**讀出（{count} 筆 · `{source}`），非手抄；狀態直接取自帳本。")
    L.append("")
    L.append("| 狀態 | 數量 |")
    L.append("|---|---|")
    for s in ORDER:
        if counts[s]:
            L.append(f"| {MARK[s]} {LABEL[s]} | {counts[s]} |")
    L.append(f"| **合計** | **{total}** |")
    pct = round(100 * counts["done"] / total) if total else 0
    L.append("")
    L.append(f"**完成度：{counts['done']}/{total} ≈ {pct}%**（進行中 {counts['flight']} 項正在跑背景任務）")
    L.append("")
    # legend lists only statuses that actually occur — a legend advertising a
    # status the ledger cannot produce is another small lie on a page whose
    # whole job is to be true.
    legend = "　".join(f"{MARK[s]} {LEGEND[s]}" for s in ORDER if counts[s])
    L.append(f"圖例：{legend}")
    L.append("")

    for dkey, dtitle in DOMAINS:
        drows = [t for t in rows if t[1] == dkey]
        if not drows:
            continue
        drows.sort(key=lambda t: (ORDER.index(t[2]), t[0]))
        d = collections.Counter(s for _, _, s, _ in drows)
        head = " · ".join(f"{MARK[s]}{d[s]}" for s in ORDER if d[s])
        L.append(f"## {dtitle}　<sub>{head}</sub>")
        L.append("")
        L.append("| | # | 需求 |")
        L.append("|---|---|---|")
        for tid, _, st, zh in drows:
            L.append(f"| {MARK[st]} | {tid} | {zh} |")
        L.append("")

    # highest-priority callouts (completed ones drop out on their own)
    done_ids = {tid for tid, _, st, _ in rows if st == "done"}
    live = [text for tid, text in CALLOUTS if tid not in done_ids]
    if live:
        L.append("## 🔺 最該優先")
        L.append("")
        for i, text in enumerate(live, 1):
            L.append(f"{i}. {text}")
        L.append("")

    # append the carpet-search gaps if the audit has written them
    L.append("---")
    L.append("")
    if os.path.exists(AUDIT_FILE):
        with open(AUDIT_FILE, encoding="utf-8") as f:
            L.append(f.read().rstrip())
        L.append("")
    else:
        L.append("## 🔎 地毯式搜索（進行中）")
        L.append("")
        L.append("156 條使用者發言已抽取，正在逐域比對程式碼找出**尚未進追蹤清單**的漏項。")
        L.append("完成後這一段會自動換成漏項清單（寫入 `docs/_requirements-audit-gaps.md`，重跑本工具即併入）。")
        L.append("")

    return "\n".join(L), counts, total


def build(explicit_ledger=None, now=None):
    tasks, source, kind = resolve_ledger(explicit_ledger)
    meta = load_meta()
    rows = decorate(tasks, meta)
    now = now or datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    text, counts, total = render(rows, now, source, len(tasks))
    return {"tasks": tasks, "rows": rows, "text": text, "counts": counts,
            "total": total, "source": source, "kind": kind}


# ---------------------------------------------------------------------------
# entry points

TOTAL_RE = re.compile(r"^\| \*\*合計\*\* \| \*\*(\d+)\*\* \|$", re.M)


def do_check(explicit_ledger):
    res = build(explicit_ledger)
    if not os.path.exists(OUT):
        sys.exit(f"gen_status --check: {os.path.relpath(OUT, REPO)} does not exist — run "
                 f"`python3 tools/status/gen_status.py`")
    with open(OUT, encoding="utf-8") as f:
        current = f.read()

    m = TOTAL_RE.search(current)
    if not m:
        sys.exit("gen_status --check: cannot find the 合計 row in the status page — it was not "
                 "produced by this generator")
    page_total = int(m.group(1))
    if page_total != res["total"]:
        # ─────────────────────────────────────────────────────────────────────
        # ⭐ 兩種「對不上」，⛔ 而它們的正解是相反的（GH#870）
        # ─────────────────────────────────────────────────────────────────────
        # 這條閘在 2026-08-29 之前對兩種一律說「re-run 產生器」，
        # ⛔ 而在**第二種**情況下照做會**砍掉 281 列**（＝資料毀損）。
        #
        # ① ledger **比頁面多**  ⇒ 真的漂了、真的該重跑（保留原行為，仍然 exit 1）
        # ② ledger **比頁面少**  ⇒ ⭐ 這一頁**來自一個已經不存在的 ledger**。
        #
        # ⚠️ 為什麼②會發生（實測 2026-08-29）：任務帳本住
        #   `~/.claude/tasks/<session-id>/` —— 它是 **session 專屬且會自我刪除**的。
        #   這一頁 2026-08-28 21:17 由 `1fc1e42e-…`（**286 筆**）產生，
        #   而那個目錄在 23:48 就被清掉了；今天整台機器只剩 `c1013162-…`（**5 筆**，08-16）。
        #   ⇒ ⭐ **這道閘結構上不可能再綠** —— CLAUDE.md 失敗形態⑨逐字：
        #     「一個永遠不會綠的閘」＋「錯誤訊息**指著錯方向**，
        #      於是每個人都以為是自己的環境壞了，⛔ 而不是那條閘壞了」。
        #
        # ⭐ ②的正解是**大聲說、⛔ 不要毀資料**（fail-open 沒錯，靜默才是缺陷）：
        #   這一頁自己就是那份知識的**唯一存活副本**。
        # 逃生口：GGD_STATUS_STRICT=1 ⇒ ②也回非零（⭐ 一鍵回到舊行為）。
        # ⚠️ ⭐ **2026-08-29 更正**：我先前判斷「那份 286 筆的來源已經消失」——
        #   ⛔ 那是錯的。`docs/_task-ledger.json` 是一個 **dict**（`{_doc,generated,source,count,tasks}`），
        #   而 `tasks` 陣列裡**完整的 286 筆一直都在** —— 我用 `len(dict)` 量成了 5。
        #   ⇒ 真正的病是 `resolve_ledger()` 讓一個 **2026-08-16 的 5 筆殘骸**贏過它（已修）。
        # ⭐ 這一段仍然留著：⛔ 它守的是「**萬一**哪天真的只剩更小的來源」，
        #   ⚠️ 而那時**唯一正確的動作仍然是不要重跑產生器**（產生器自己的
        #   `LEDGER SHRANK` 護欄方向與這裡一致 —— 兩側現在說同一句話）。
        if res["total"] > page_total or os.environ.get("GGD_STATUS_STRICT") == "1":
            sys.exit(f"gen_status --check: STATUS PAGE UNDERCOUNTS. page says {page_total} tasks, "
                     f"the ledger has {res['total']} ({res['source']}). This is exactly the drift the "
                     f"generator exists to prevent — re-run `python3 tools/status/gen_status.py`.")
        print(
            f"gen_status --check: ⚠️ 這一頁（{page_total} 筆）比今天找得到的任務帳本"
            f"（{res['total']} 筆 · {res['source']}）**多** —— "
            f"⭐ 它來自一個**已經不存在**的 session 帳本。\n"
            f"  ⛔ **不要**重跑產生器：那會把 {page_total - res['total']} 列砍掉（GH#870）。\n"
            f"  ⭐ 這一頁本身就是那份知識的唯一存活副本 ⇒ 視為通過。\n"
            f"  （要回到嚴格模式：`GGD_STATUS_STRICT=1`。長期正解是讓任務真相來自 GitHub issues。）"
        )
        return

    # ignore only the timestamp line: everything else must match byte-for-byte
    if STAMP_RE.sub("", current) != STAMP_RE.sub("", res["text"]):
        sys.exit("gen_status --check: docs/requirements-status.md is stale versus the ledger — "
                 "re-run `python3 tools/status/gen_status.py`")

    c = res["counts"]
    print(f"gen_status --check: OK — {res['total']} tasks "
          f"(✅{c['done']} 🔄{c['flight']} ⬜{c['pending']}) from {res['source']}")


def main(argv=None):
    ap = argparse.ArgumentParser(description="regenerate docs/requirements-status.md from the task ledger")
    ap.add_argument("--ledger", help="ledger directory (<id>.json per task) or snapshot json")
    ap.add_argument("--check", action="store_true", help="verify the page matches the ledger; non-zero on drift")
    ap.add_argument("--allow-shrink", action="store_true",
                    help="permit a ledger with FEWER tasks than the last snapshot (tasks really were deleted)")
    args = ap.parse_args(argv)

    try:
        if args.check:
            do_check(args.ledger)
            return 0
        res = build(args.ledger)
    except LedgerError as e:
        sys.exit(f"gen_status: LEDGER ERROR — {e}")

    prev = snapshot_count()
    if prev is not None and res["total"] < prev and not args.allow_shrink:
        sys.exit(f"gen_status: LEDGER SHRANK — {res['source']} has {res['total']} tasks, the last "
                 f"snapshot had {prev}. Refusing to publish a smaller denominator by accident; "
                 f"pass --allow-shrink if tasks were genuinely deleted.")

    with open(OUT, "w", encoding="utf-8") as f:
        f.write(res["text"])
    write_snapshot(res["tasks"], res["source"])

    c, total = res["counts"], res["total"]
    pct = round(100 * c["done"] / total) if total else 0
    misc = sum(1 for _, d, _, _ in res["rows"] if d == "misc")
    print(f"wrote {OUT} — {total} tasks, {c['done']} done ({pct}%)")
    print(f"  ledger   {res['source']} [{res['kind']}]")
    print(f"  statuses ✅ completed {c['done']} · 🔄 in_progress {c['flight']} · ⬜ pending {c['pending']}")
    print(f"  snapshot {os.path.relpath(MIRROR, REPO)}" + (f" · {misc} unclassified" if misc else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
