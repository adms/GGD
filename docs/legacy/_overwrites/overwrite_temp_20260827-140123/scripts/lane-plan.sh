#!/usr/bin/env bash
# 🗂️ **lane-plan** —— 把「開幾條並行 lane、哪幾張票可以同時跑」從**人工排**變成**算出來的**。
# GH#686 Scope ③。它打的是 CLAUDE.md 第〇·七守則的**觸發器②（撞車次數）**。
#
# ⭐ 它存在的理由（量到的，⛔ 不是感覺）：2026-08-27 主 session 手工排了 **10 條 lane**，
#   每一條的柵欄都是人逐張票讀 `Files / modules likely affected` 排出來的。
#   ⇒ 那是一件**純機械**的工作，而它每一批都要重做一次。
#
# ⚠️⚠️ owner 2026-08-23 的但書逐字是「謹慎注意**相依性、順序性及同時間的唯一性、一致性**」
#   ⇒ ⛔ **撞檔只是四個裡的一個**。這支腳本因此輸出**四種**擋人的理由，⛔ 不是只有撞檔：
#
#   | 理由 | 判準 | 資料來源 |
#   |---|---|---|
#   | ⛔ **撞檔** | 兩張票的 Files 區有交集（含 glob 與目錄包含） | 票文的 Files 區 |
#   | ⛔ **順序** | `Dependencies` 點名的票**還開著** ⇒ 它要排在後面 | 票文的 Dependencies 區 |
#   | 🔒 **全域鎖** | Files 區碰到**真的產物**（改它就要跑產生器鏈 ⇒ 寫 `bundle.json`） | `sync-io.json` writes − `normalizers.json` |
#   | 🚧 **有人在做** | `--busy` 點名的票（唯讀稽核 lane **沒有柵欄**，撞檔判斷看不到它） | 呼叫端 |
#
#   ⭐ 最後一列是 lane T 2026-08-27 現場撞到的洞：它唯讀跑到一半 **HEAD 在腳下換了**，
#   於是 10 分鐘前量到的「零命中」10 分鐘後變成 9 個命中。
#   ⇒ 「這張票有沒有另一條 lane 正在做」是一個**撞檔判斷抓不到**的維度。
#
# ⚠️ **它抓不到什麼（誠實列出來 —— 一份沒有分母的表比沒有表更糟）**：
#   ① **票文沒寫的順序相依**。例：`contract:numbers` 必須在 `content:build` **之後**跑 ——
#      那是**指令之間**的順序，⛔ 不在任何一張票的 Dependencies 區裡。
#   ② **票文沒寫的檔**。Files 區是人填的 ⇒ 漏填的檔不會被算進撞車。
#      ⇒ 沒有 Files 區的票會被列進「排不進來」那一欄，⛔ 不是靜靜地放進批次 1。
#   ③ **同一個檔的不同段落**。兩條 lane 各改 `main.tsx` 的**不同一行**在 git 上不衝突，
#      但這支腳本仍然判撞 —— 保守方向（⛔ 寧可多排一批，也不要兩條 lane 互相覆蓋）。
#
# 用法：
#   scripts/lane-plan.sh                      # 掃全部 open 票 → 提議分批
#   scripts/lane-plan.sh --busy 686,715       # 這幾張已經有 lane 在跑 ⇒ 它們的檔先佔住
#   scripts/lane-plan.sh --limit 40           # 只看最近 N 張（預設 400）
#   scripts/lane-plan.sh --width 10           # 一批最多幾條 lane（預設 10；owner 的並行度上限 min(16,CPU-2)）
#   GGD_LANE_PLAN_JSON=<夾具檔>               # ⭐ 守衛用：讀夾具⛔不碰網路（跑的仍是**出貨的**這支腳本）
#
# 離開碼：0 = 排得出計畫（含「全部都撞在一起」這種計畫）· 2 = 讀不到票/資料
set -o pipefail
cd "$(dirname "$0")/.."

BUSY=""; LIMIT=400; WIDTH=10
while [ $# -gt 0 ]; do
  case "$1" in
    --busy)  BUSY="${2:-}"; shift 2 ;;
    --limit) LIMIT="${2:-400}"; shift 2 ;;
    --width) WIDTH="${2:-10}"; shift 2 ;;
    -h|--help) sed -n '2,45p' "$0"; exit 0 ;;
    *) echo "⛔ 不認得的參數：$1（-h 看用法）" >&2; exit 2 ;;
  esac
done

if [ -n "${GGD_LANE_PLAN_JSON:-}" ]; then
  RAW=$(cat "$GGD_LANE_PLAN_JSON") || RAW=""
  SRC="夾具"
else
  RAW=$(gh issue list --state open --limit "$LIMIT" --json number,title,body 2>/dev/null) || RAW=""
  SRC="open"
fi
[ -n "$RAW" ] || { echo "⚠️ gh 連不上 —— **沒有排到任何計畫**（⛔ 這不是「沒有撞車」）。"; exit 0; }

# ⚠️ macOS 的 mktemp 要求 XXXXXX 在**結尾**（加 .json 後綴會 mkstemp failed）。
TMP=$(mktemp /private/tmp/lane-plan_temp_XXXXXX)
printf '%s' "$RAW" > "$TMP"
python3 - "$TMP" "$SRC" "$BUSY" "$WIDTH" <<'PY'
import json, re, sys
from itertools import combinations

issues = json.load(open(sys.argv[1], encoding="utf-8"))
src, busy_arg, width = sys.argv[2], sys.argv[3], max(1, int(sys.argv[4]))
BUSY = {int(n) for n in re.findall(r"\d+", busy_arg)}

# ── ① 誰擁有哪個檔 ──────────────────────────────────────────────────────────
# ⭐ 兩份 JSON 是**唯一住處**（第〇·四守則）：`sync-io.json` 是**量出來的**寫入表，
#   `normalizers.json` 記著哪幾支只是**就地改欄位**。裁決與 `scripts/genguard.sh`
#   同一套：**作者 = 寫入者 − 正規化器**。
# ⛔ 這裡**不抄任何路徑清單** —— 抄一份就是 GH#707 的病（三個消費端各自硬寫）。
try:
    io = json.load(open("tools/parallel-gates/sync-io.json", encoding="utf-8"))
    norm = {n["step"] for n in json.load(open("tools/parallel-gates/normalizers.json", encoding="utf-8"))["normalizers"]}
except Exception as exc:  # noqa: BLE001
    print(f"⛔ 讀不到產物擁有者表（{exc}）—— ⛔ 不要把「查不到」當成「沒有全域鎖」。", file=sys.stderr)
    sys.exit(2)
PRODUCTS = {w for s in io.get("steps", []) if s.get("name") not in norm for w in s.get("writes", [])}

# ── ② 從票文抽 Files 區與 Dependencies 區 ───────────────────────────────────
# ⚠️ 標題的 regex ⛔ 不可以吃掉整行（`[^\n]*`）—— `**Files …** a.ts · b.ts` 這種
#   把標題與內容寫在同一行的票，會被整行剝掉而變成「沒有 Files 區」（實測踩到）。
RE_FILES = re.compile(
    r"^\s*(?:#{1,4}\s*|\*\*)?(?:Files\s*/?\s*modules(?:\s*(?:likely\s*)?affected)?|影響檔案|likely affected)"
    r"\s*(?:\*\*)?\s*[:：]?", re.I)
RE_DEPS = re.compile(r"^\s*(?:#{1,4}\s*|\*\*)?(?:Dependencies|相依票|依賴)\b", re.I)
RE_HEAD = re.compile(r"^\s*(?:#{1,4}\s|\*\*[A-Za-z一-鿿][^*]{0,40}\*\*\s*$|---\s*$)")
ROOTS = r"apps|packages|content|tools|scripts|docs|infra|deploy|\.github"
RE_PATH = re.compile(rf"(?:\./)?(?:{ROOTS})/[^\s，、。·|（）()`'\"、；:：\[\]]+")

def section(body: str, head: re.Pattern[str]) -> str:
    """抓一節的內容。⚠️ 標題那一行**自己**也可能帶內容（`**Files …** a.ts · b.ts`）。"""
    out, on = [], False
    for line in body.split("\n"):
        if head.match(line):
            on = True
            out.append(head.sub("", line, count=1))
            continue
        if on:
            if RE_HEAD.match(line) or line.strip().startswith("## "):
                break
            out.append(line)
    return "\n".join(out)

def paths(text: str) -> set[str]:
    """⛔ 先剝 `「…」`（CLAUDE.md 第〇·六守則①②：讀文字找機制的東西一律先剝引號）。"""
    text = re.sub(r"「[^」]*」", "", text)
    found: set[str] = set()
    for raw in RE_PATH.findall(text):
        p = raw.lstrip("./").rstrip(".,;·、，）)】>」")
        if not p or p.endswith("："):
            continue
        # `content/{abilities,champions}/*.json` ⇒ 兩條
        m = re.search(r"\{([^{}]*)\}", p)
        for one in ([p.replace(m.group(0), x.strip()) for x in m.group(1).split(",")] if m else [p]):
            found.add(one)
    return found

def clash(a: str, b: str) -> bool:
    """⭐ 保守方向：glob 對得上、目錄包得住、完全相同 —— 三者任一都算撞。"""
    if a == b:
        return True
    for x, y in ((a, b), (b, a)):
        if x.endswith("/") and y.startswith(x):
            return True
        if not x.endswith("/") and y.startswith(x + "/"):
            return True
        if "*" in x:
            rx = re.escape(x).replace(r"\*\*", ".+").replace(r"\*", "[^/]*")
            if re.fullmatch(rx, y):
                return True
    return False

PRIO = {"緊急": 0, "重要": 1, "優先": 2, "一般": 3}
tickets: list[dict] = []
for it in issues:
    body, title = it.get("body") or "", it.get("title") or ""
    fs = paths(section(body, RE_FILES))
    deps = {int(n) for n in re.findall(r"#(\d+)", section(body, RE_DEPS))}
    pr = next((v for k, v in PRIO.items() if f"[{k}]" in title), 4)
    tickets.append({
        "n": it["number"], "title": title, "files": fs, "deps": deps - {it["number"]},
        "prio": pr, "lock": sorted(f for f in fs if any(clash(f, p) for p in PRODUCTS))[:3],
    })

open_ns = {t["n"] for t in tickets}
planned = [t for t in tickets if t["files"] and t["n"] not in BUSY]
noplan = [t for t in tickets if not t["files"]]
for t in planned:
    t["deps"] &= open_ns  # 已關的相依票不擋人

# ── ③ 先算 **lane**（撞檔的連通分量），再把 lane 排進批次 ────────────────────
# ⭐⭐ 這裡的模型是 2026-08-27 對照**人手排的那 10 條 lane** 校正過的：
#   第一版把單位當成「一張票一條 lane」⇒ #715 與 #768 被排進**相鄰的兩批**（#768 相依 #715），
#   而人把它們放進**同一條 lane 依序做** —— 兩者都對，但只有後者是真的在排 lane。
#   ⇒ ⭐ **lane = 撞檔的連通分量**（同一批檔只能有一個寫入者），
#     **批次 = 一組可以同時開的 lane**，而**相依只在 lane 之間才會擋批次**
#     （同一條 lane 內部照順序做就好，⛔ 不必多開一批）。
parent: dict[int, int] = {t["n"]: t["n"] for t in planned}

def find(x: int) -> int:
    while parent[x] != x:
        parent[x] = parent[parent[x]]
        x = parent[x]
    return x

for a, b in combinations(planned, 2):
    if any(clash(f, g) for f in a["files"] for g in b["files"]):
        parent[find(a["n"])] = find(b["n"])
# 🔒 全域鎖：改到**真的產物**就要跑產生器鏈（寫 bundle.json）⇒ 同時間只能有一條 lane。
#   ⛔ 這不是撞檔，是 CLAUDE.md 那句「同一時間只能有一條工作流跑它」——
#   所以它把**所有**碰產物的票收進同一條 lane，⛔ 不是排進不同批次。
locks = [t for t in planned if t["lock"]]
for a, b in zip(locks, locks[1:]):
    parent[find(a["n"])] = find(b["n"])

lanes: dict[int, list[dict]] = {}
for t in planned:
    lanes.setdefault(find(t["n"]), []).append(t)
lane_of = {t["n"]: k for k, v in lanes.items() for t in v}

# ⚠️ **跨 lane** 的相依才會決定批次順序。lane 內部的相依只是**做事的順序**。
lane_deps: dict[int, set[int]] = {k: set() for k in lanes}
for t in planned:
    for d in t["deps"]:
        if d in lane_of and lane_of[d] != lane_of[t["n"]]:
            lane_deps[lane_of[t["n"]]].add(lane_of[d])

# lane 的深度（⚠️ 成環時停住 —— 環是一個**排不出順序**的事實，⛔ 不可以讓腳本掛掉）
ldepth = {k: 0 for k in lanes}
for _ in range(len(lanes) + 1):
    changed = False
    for k in lanes:
        d = max((ldepth[x] + 1 for x in lane_deps[k]), default=0)
        if d > ldepth[k]:
            ldepth[k], changed = d, True
    if not changed:
        break

def lane_key(k: int) -> tuple:
    v = lanes[k]
    return (ldepth[k], min(t["prio"] for t in v), -len(v), min(t["n"] for t in v))

batches: list[list[int]] = []
if BUSY:
    batches.append([])  # 批次 1 留給「已經有 lane 在跑」的那幾張（下面單獨印）
slot: dict[int, int] = {}
for k in sorted(lanes, key=lane_key):
    i = max((slot[d] + 1 for d in lane_deps[k] if d in slot), default=(1 if BUSY else 0))
    while True:
        while len(batches) <= i:
            batches.append([])
        if len(batches[i]) < width:
            batches[i].append(k)
            slot[k] = i
            break
        i += 1

# ── ④ 報表 ────────────────────────────────────────────────────────────────
print(f"🗂️ lane-plan —— 掃了 {len(issues)} 張 {src} 票：{len(planned)} 張排得進來 · "
      f"{len(noplan)} 張沒有 Files 區 · {len(BUSY)} 張標成有人在做")
print(f"⭐ 算出 **{len(lanes)} 條 lane**（撞檔的連通分量）⇒ 排成 "
      f"**{sum(1 for b in batches if b) + (1 if BUSY else 0)} 批**（--width {width}）")
if BUSY:
    print(f"\n── 批次 1：🚧 已經有 lane 在跑（--busy）—— 它們的檔先被佔住")
    for t in sorted((x for x in tickets if x["n"] in BUSY), key=lambda x: x["n"]):
        print(f"   #{t['n']} {t['title'][:52]}")
for i, b in enumerate(batches):
    if not b:
        continue
    print(f"\n── 批次 {i + 1}：{len(b)} 條 lane 可並行")
    for k in sorted(b, key=lane_key):
        v = sorted(lanes[k], key=lambda x: (depth[x["n"]], x["prio"], x["n"]))
        lock = " 🔒" if any(t["lock"] for t in v) else ""
        head = " → ".join(f"#{t['n']}" for t in v)
        print(f"   lane{lock} {head}")
        for t in v:
            print(f"        #{t['n']} {t['title'][:56]}")
        fence = sorted({f for t in v for f in t["files"]})
        print(f"        柵欄（{len(fence)}）：{' · '.join(fence[:6])}"
              + (" …" if len(fence) > 6 else ""))
        if len(v) > 1:
            print("        ⚠️ 這幾張**撞同一批檔**（或同吃全域鎖）⇒ 同一條 lane 依序做，⛔ 不要並行")
        if lane_deps[k]:
            print("        ⚠️ 跨 lane 相依：要等 "
                  + " ".join("lane#" + str(min(t["n"] for t in lanes[d])) for d in sorted(lane_deps[k])))
if noplan:
    print(f"\n⚠️ **沒有 Files 區 ⇒ 排不進來**（{len(noplan)} 張）—— ⛔ 這不是「它們可以隨便跑」，"
          "是**量不到**。先補票文的 Files 區：")
    print("   " + " ".join(f"#{t['n']}" for t in sorted(noplan, key=lambda x: x["n"])[:40]))
print("\n⚠️ 這份計畫看不到：票文沒寫的順序相依（例：contract:numbers 必須在 content:build 之後）· "
      "Files 區漏填的檔 · 唯讀 lane（用 --busy 告訴它）。")
PY
RC=$?
rm -f "$TMP"
exit $RC
