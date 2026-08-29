#!/usr/bin/env bash
# 🎫 開票規格 lint —— owner 2026-08-24 第 35 條 v3（同日三則,最後一則加了六節模板）：
#   「開票要把[緊急][重要][優先],[breaking change][fix][improve][feature] 等開發常用
#    在標題及內文 tag, 採用的 [acceptance criteria] 及 [思考策略] 與 [解決模板] 寫清楚」
#
# 五件必填:
#   ① 優先級 tag —— [緊急]/[重要]/[優先]/[一般] ——⭐ **標題**要有（owner 掃標題排序）
#   ② 類型 tag  —— [breaking change]/[fix]/[improve]/[feature] 等開發常用
#                  （也收 refactor/perf/docs/test/chore/bug/infra）——⭐ **標題**要有
#   ③ 驗收標準  —— 「acceptance criteria」或「驗收標準」或「## 驗收」（內文）
#   ④ [思考策略] —— 這張票用哪一種思考方式（盤點→按擋住支數排序 / 五層根因 /
#                   兩個名詞的關係 / 閘不是判準 / 量到再說…）（內文）
#   ⑤ [解決模板] —— 套哪一個解決模板（三個住處開關 / 條件葉 / 產生器+--check 閘 /
#                   HITL 分層漏斗 / 承重守衛+突變 / N 同型=K 模板+一張表…）（內文）
#
# 用法:
#   scripts/ticket-lint.sh 669 670 …        # lint 這幾張(讀 GitHub)
#   scripts/ticket-lint.sh --recent [天數]   # lint 最近 N 天開的 open 票(預設 3)
#   scripts/ticket-lint.sh --body-file 檔   # 開票**之前**先驗草稿(不碰網路)
#   scripts/ticket-lint.sh --dupes          # ⭐ GH#808 Scope 2:一次列出**所有**接手相交
#
# ⭐ --dupes 在問一個**單張票答不出來**的問題(GH#808):
#   2026-08-26 有兩種接手切法同時在跑(主題合併票 02:1x / 逐張接手票 03:2x),
#   造出四對重複 —— ⚠️ 而**每張票的標題都自己成立、body 都自己完整**,
#   五件規格檢查對它們**全綠**。判準不在單張票裡,只在**票與票的關係**裡。
#   ⇒ 開票 hook 管「當下」(Scope 1,⛔ 不擋),這個模式管「存量」。
#   慣例詞彙的唯一住處:tools/parallel-gates/takeover-vocab.json（hook 讀同一份）。
#
# 離開碼: 0 = 全過 · 1 = 有缺(逐張列出缺什麼) · 0 = gh 連不上(警告後跳過,
#   ⛔ 網路不通不可以擋人 —— 但會明說「沒驗到」,安靜的跳過與全過長得一樣)
#   --dupes: 1 = 找到相交(它是報表也是閘) · 0 = 沒有 · 0 = gh 連不上(明說沒驗到)
set -o pipefail
cd "$(dirname "$0")/.."

RE_AC='acceptance criteria|驗收標準|##[[:space:]]*驗收'
RE_TAG='\[(緊急|重要|優先|一般)\]'
RE_OBJ='\*\*Objective\*\*|##[[:space:]]*Objective'
RE_SCOPE='\*\*Scope\*\*|##[[:space:]]*Scope'
RE_FILES='Files[[:space:]]*/?[[:space:]]*modules|\*\*Files|影響檔案|likely affected'
RE_CONSTR='Implementation constraints|實作約束'
RE_TEST='Test[[:space:]]*/?[[:space:]]*verification|驗證方式|##[[:space:]]*驗證|verification criteria'
RE_DEPS='Dependencies|相依票|依賴'
RE_NONGOALS='Non-goals|非目標|不做什麼'
RE_RISKS='Known risks|已知風險'
RE_TYPE='\[(breaking change|fix|improve|feature|refactor|perf|docs|test|chore|bug|infra)\]'
RE_STRAT='\[思考策略\]|##[[:space:]]*思考策略'
RE_TPL='\[解決模板\]|##[[:space:]]*解決模板'

lint_text() { # $1=標籤 $2=標題 $3=內文
  local missing=()
  echo "$2" | grep -qE  "$RE_TAG"   || missing+=("標題缺 [緊急]/[重要]/[優先]/[一般]")
  echo "$2" | grep -qiE "$RE_TYPE"  || missing+=("標題缺 [fix]/[feature]/[improve]/[breaking change] 類型 tag")
  echo "$3" | grep -qiE "$RE_AC"      || missing+=("驗收標準(acceptance criteria)")
  echo "$3" | grep -qiE "$RE_OBJ"     || missing+=("Objective")
  echo "$3" | grep -qiE "$RE_SCOPE"   || missing+=("Scope")
  echo "$3" | grep -qiE "$RE_FILES"   || missing+=("Files/modules affected")
  echo "$3" | grep -qiE "$RE_CONSTR"  || missing+=("Implementation constraints")
  echo "$3" | grep -qiE "$RE_TEST"    || missing+=("Test/verification criteria")
  echo "$3" | grep -qE  "$RE_STRAT"   || missing+=("[思考策略]")
  echo "$3" | grep -qE  "$RE_TPL"     || missing+=("[解決模板]")
  # ⭐「最好再加」的三節(owner:建議⛔不硬擋) —— 缺了**警告**但不算 BAD
  local advisory=()
  echo "$3" | grep -qiE "$RE_DEPS"     || advisory+=("Dependencies")
  echo "$3" | grep -qiE "$RE_NONGOALS" || advisory+=("Non-goals")
  echo "$3" | grep -qiE "$RE_RISKS"    || advisory+=("Known risks")
  if [ ${#advisory[@]} -gt 0 ] && [ ${#missing[@]} -eq 0 ]; then
    local aj=""; for a in "${advisory[@]}"; do aj="${aj}${aj:+ · }${a}"; done
    echo "ℹ️ $1 建議補(⛔ 不擋):${aj}"
  fi
  if [ ${#missing[@]} -gt 0 ]; then
    local joined=""
    for m in "${missing[@]}"; do joined="${joined}${joined:+ · }${m}"; done
    echo "⚠️ $1 缺:${joined}"
    return 1
  fi
  return 0
}

BAD=0
if [ "${1:-}" = "--dupes" ]; then
  # ⭐ 預設只掃 open（存量清理）;`--dupes all` 連已關的一起掃 ——
  #   ⛔ 這不是選配:GH#808 的四對裡**有三對已經關掉一張**,只掃 open 看不到它們,
  #   而「列得出今天這四對」正是那張票的驗收標準 ⇒ 量尺要驗得到自己。
  STATE="${2:-open}"
  RAW=$(gh issue list --state "$STATE" --limit 800 --json number,title,body 2>/dev/null) || RAW=""
  [ -n "$RAW" ] || { echo "⚠️ gh 連不上 —— 接手相交**沒有被掃**(⛔ 這不是「沒有重複」)。"; exit 0; }
  # ⚠️ macOS 的 mktemp 要求 XXXXXX 在**結尾** —— 加了 .json 後綴會 mkstemp failed。
  TMP=$(mktemp /private/tmp/ticket-lint-dupes_temp_XXXXXX)
  printf '%s' "$RAW" > "$TMP"
  python3 - "$TMP" "tools/parallel-gates/takeover-vocab.json" "$STATE" <<'PY'
import json, re, sys, itertools
issues = json.load(open(sys.argv[1], encoding="utf-8"))
try:
    v = json.load(open(sys.argv[2], encoding="utf-8"))
    verbs, seps = v["verbs"], v["separators"]
except Exception as exc:  # noqa: BLE001
    print(f"⛔ 讀不到接手詞彙表 {sys.argv[2]}（{exc}）—— ⛔ 不要把「掃不到」當成「沒有重複」。", file=sys.stderr)
    sys.exit(2)

# ⭐ 分隔字元類逐字元組（⛔ 不用 re.escape 拼字串:它會把 - 之類的東西搬位置）。
_CLS = "[" + "".join("\\" + c if c in "]^\\-" else c for c in seps) + "]*"
_RE = re.compile("(?:" + "|".join(map(re.escape, verbs)) + r")\s*((?:#\d+" + _CLS + r")+)")

def takeovers(it: dict) -> set[int]:
    """⭐ **標題＋內文一起掃** —— 量到的:標題 14 次 / 內文 21 次。
    只掃標題（hook 的第一版）會漏掉大多數。

    ⛔ **但表格列要跳過**:一張**在描述重複**的票（#808 自己就是）會把
    別人的接手清單抄進表格 ⇒ 它變成一個看起來很合理的誤報。
    ⭐ 量到的（2026-08-27，91 張 open 票）:表格列裡的接手宣告 **1 次**（正是 #808），
    非表格列 **40 次 / 23 張** ⇒ 跳過表格列**零成本**地拿掉那個誤報。
    """
    lines = ((it.get("title") or "") + "\n" + (it.get("body") or "")).split("\n")
    txt = "\n".join(l for l in lines if not l.lstrip().startswith("|"))
    return {int(n) for grp in _RE.findall(txt) for n in re.findall(r"\d+", grp)}

owned = {it["number"]: takeovers(it) for it in issues}
owned = {n: s - {n} for n, s in owned.items() if s - {n}}  # ⛔ 自我引用不算

pairs = [
    (a, b, sorted(owned[a] & owned[b]))
    for a, b in itertools.combinations(sorted(owned), 2)
    if owned[a] & owned[b]
]
print(f"🎫 掃了 {len(issues)} 張 {sys.argv[3]} 票，其中 {len(owned)} 張宣告了接手。")
if not pairs:
    print("✓ 接手相交：0 對。")
    sys.exit(0)
# ⭐ 收成連通分量:三張票互相相交時列成一組,⛔ 不是三行看起來無關的配對。
parent = {n: n for n in owned}
def find(x):
    while parent[x] != x:
        parent[x] = parent[parent[x]]; x = parent[x]
    return x
for a, b, _ in pairs:
    parent[find(a)] = find(b)
groups: dict[int, list[int]] = {}
for n in owned:
    groups.setdefault(find(n), []).append(n)
groups = {k: sorted(v) for k, v in groups.items() if len(v) > 1}
print(f"⚠️ **接手相交 {len(pairs)} 對 / {len(groups)} 組**（GH#808）——")
for g in sorted(groups.values()):
    print(f"  ── 這一組互相重疊：{' ⇄ '.join('#' + str(n) for n in g)}")
    for n in g:
        print(f"     #{n} 接手 {sorted(owned[n])}")
    common = sorted(set.intersection(*(owned[n] for n in g)))
    if common:
        print(f"     ⭐ 全組共有：{common}")
print("   ⇒ 每一組:要**合併**,還是其中一張**縮範圍**?")
print("   ⛔ 兩張都留著 = 同一件事做兩次,而每張票自己看都是合理的。")
sys.exit(1)
PY
  BAD=$?
  rm -f "$TMP"
  exit "$BAD"
fi
if [ "$1" = "--body-file" ]; then
  [ -f "$2" ] || { echo "⛔ 讀不到 $2" >&2; exit 2; }
  # 草稿模式沒有標題 ⇒ tag 檢查落在草稿第一行（慣例:第一行寫未來的標題）
  lint_text "草稿 $2" "$(head -1 "$2")" "$(cat "$2")" || BAD=1
elif [ "$1" = "--recent" ]; then
  DAYS="${2:-3}"
  SINCE=$(date -v-"${DAYS}"d +%F 2>/dev/null || date -d "-${DAYS} days" +%F)
  LIST=$(gh issue list --state open --search "created:>=${SINCE}" --limit 100 \
         --json number -q '.[].number' 2>/dev/null) || {
    echo "⚠️ gh 連不上 —— 最近 ${DAYS} 天的票**沒有被驗**(⛔ 這不是全過)。"; exit 0; }
  for n in $LIST; do
    T=$(gh issue view "$n" --json title -q .title 2>/dev/null) || continue
    B=$(gh issue view "$n" --json body -q .body 2>/dev/null) || continue
    lint_text "#$n" "$T" "$B" || BAD=1
  done
else
  [ $# -gt 0 ] || { sed -n '2,20p' "$0"; exit 2; }
  for n in "$@"; do
    T=$(gh issue view "$n" --json title -q .title 2>/dev/null) || {
      echo "⚠️ gh 讀不到 #$n —— 這一張**沒有被驗**。"; continue; }
    B=$(gh issue view "$n" --json body -q .body 2>/dev/null)
    lint_text "#$n" "$T" "$B" || BAD=1
  done
fi
[ "$BAD" = 0 ] && echo "✓ 開票規格:受檢的每一張都帶齊四件。"
exit $BAD
