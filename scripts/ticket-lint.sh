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
# ⭐ `[自動]` —— **誰決定這張票該存在**（owner 2026-08-29：
#   「AI 開的票跟人(我)要求開的票 tag 要不一樣，AI 多一個 [自動]」）。
# ⚠️ lint **不強制**它（⛔ 我判斷不出一張既有票當初是誰決定的），
#   ⭐ 但它**驗位置**：有的話要在**最前面** —— owner 掃的是標題開頭。
RE_AUTO='\[自動\]' 
# ⭐ 「這個數字還住在哪裡？」（2026-08-29 立，一天中六次）——
#   ⚠️ lint **只警告**：⛔ 不是每一張票都在寫入一個值（infra/docs 票就沒有）。
#   ⭐ 而它出現在**警告清單**裡就夠了 —— 開票的人會看到那一行。
RE_HOME='第二個住處|還住在哪裡'

RE_STRAT='\[思考策略\]|##[[:space:]]*思考策略'
RE_TPL='\[解決模板\]|##[[:space:]]*解決模板'

# ── ⭐ 第三層：catalog 驗必要欄 · tag 路由 · 前提回驗（GH#686 Scope ②④⑤）─────────
# ⚠️ 前兩層問的是「**這張票有沒有寫**」；這一層問的是「**它寫的那句話今天成不成立**」。
#   三個問題各自獨立，但它們共用同一個形狀：**票文的自我宣告要被驗**，
#   ⛔ 不是「有寫這個詞就算數」（第三守則：註解會說謊，票文也會）。
lint_deep() { # $1=標籤 $2=標題 $3=內文 —— 回 1 = 有硬缺
  python3 - "$1" "$2" "$3" <<'PY'
import json, os, re, sys
label, title, body = sys.argv[1], sys.argv[2], sys.argv[3]
hard: list[str] = []
soft: list[str] = []

# ── ② catalog：宣稱了模板 X ⇒ 驗 X 的必要欄 ──────────────────────────────────
# ⭐ catalog 是**唯一住處**：⛔ 這裡不抄任何模板名或必要欄（GH#707 的病）。
try:
    cat = json.load(open("tools/ticket-templates/catalog.json", encoding="utf-8"))
except Exception as exc:  # noqa: BLE001
    print(f"⛔ 讀不到 catalog（{exc}）—— ⛔ 不要把「讀不到」當成「模板檢查過了」。", file=sys.stderr)
    sys.exit(2)
# 只讀 [解決模板] 那一行（⛔ 不掃全文：內文引用別的模板名不算宣稱）
claim = "\n".join(l for l in body.split("\n") if re.search(r"\[解決模板\]|^##\s*解決模板", l))
for t in cat["templates"]:
    if t["name"] in claim and t.get("lint"):
        miss = [r for r in t["lint"] if not re.search(r, body, re.I)]
        if miss:
            hard.append(f"宣稱了模板「{t['name']}」但內文點名不到：" + " · ".join(miss)
                        + f"（必要欄：{' / '.join(t['requires'])}）")

# ── ⑤ tag 路由：類型 tag 決定**驗證形狀** ────────────────────────────────────
# ⛔ 只有 [breaking change] 是硬擋 —— 它是**部署節奏**的訊號（⛔ 不可 --content-only），
#    漏了它的代價是一次線上事故；其餘兩條是建議（⛔ 不擋，同 hook 的哲學）。
if re.search(r"\[breaking\s*change\]", title, re.I) and not re.search(
        r"完整重建|重建映像|--content-only|部署節奏|append-only|舊分頁|deploy", body, re.I):
    hard.append("[breaking change] 但內文沒有**部署節奏**聲明"
                "（要寫：完整重建映像 ⛔ 不可 --content-only／舊分頁會怎樣）")
if re.search(r"\[fix\]|\[bug\]", title, re.I) and not re.search(r"突變|mutation|迴歸|regression", body, re.I):
    soft.append("[fix] 建議寫**迴歸守衛＋突變**（哪一行改壞會紅）")
SCREEN = re.compile(r"apps/client/src/(vfx|render|ui)|畫面|特效|渲染")
if re.search(r"\[feature\]|\[improve\]", title, re.I) and SCREEN.search(body) and not re.search(
        r"@visual-proof|visual-proof|終端證據|亮像素", body):
    soft.append("[feature]＋畫面層 建議寫 **@visual-proof** 的終端證據"
                "（CLAUDE.md 👁：鏈路接上 ≠ 玩家看得到）")

# ── ④ 前提回驗：票文點名的 repo 路徑，今天還成立嗎 ────────────────────────────
# ⭐ lane T 2026-08-27 手工驗 25 張票抓到 3 張前提被證偽，而**最便宜也最值錢**的那一種
#   逐字是「檔案 X 不存在」——它是一行 `os.path.exists`。#565/#674 的那句假前置
#   活過了**五則**稽核留言，每一則都把它複述成「下一步第一個動作」。
ROOTS = r"apps|packages|content|tools|scripts|docs|infra|deploy"
for m in re.finditer(rf"`((?:{ROOTS})/[^`\s]+)`", body):
    # ⚠️ 票文的慣例是 `檔:行號`（`a/b.ts:162/222`）—— ⛔ 不切掉行號就會判成「檔不存在」。
    path = re.sub(r":[\d/,\-–]+$", "", m.group(1)).rstrip("/")
    # ⛔ 佔位符不是路徑（`tools/<dir>` · `content/.../x`）—— 判它「不存在」是**誤報**,
    #   而一支會誤報的閘,下一輪就會被整段忽略（⛔ 那比沒有閘更糟）。
    if any(c in path for c in "*{<>") or "..." in path or "/" not in path:
        continue
    # ⚠️ 視窗要**切在分隔符**上 —— 第一版取前 60 字，於是 `a 缺席 · b` 裡的 b
    #   被上一個條目的「缺席」誤判成前提過期（實測踩到，⛔ 那是量尺自己在說謊）。
    before = re.split(r"[·\n。；;、]", body[max(0, m.start() - 80):m.start()])[-1]
    after = re.split(r"[·\n。；;、]", body[m.end():m.end() + 40])[0]
    claims_absent = re.search(r"缺席|不存在|沒有這一?份|尚未建立|missing|補一份|先補它", before + after)
    if claims_absent and os.path.exists(path):
        soft.append(f"⭐ **前提過期**：票文說 `{path}` 缺席／不存在，而**它今天在**"
                    "（⛔ 先確認是不是換了集合／換了住處，再改票文）")
    elif not claims_absent and not os.path.exists(path) and not re.search(r"新|new|要加|預計", before + after):
        soft.append(f"票文點名的 `{path}` 今天**不存在**（新檔的話請在旁邊註明「新」）")

# ── GH#821 Scope ③：**AC 不可以比 owner 的原話窄**（引言動詞覆蓋，警告⛔不擋）────
# 根因（#775 的反省）：owner 說「讀取**及儲存**」，我開的票把 AC 寫成只有讀的方向 ——
# 「唯讀」兩個字是我自己寫進票裡的，而四條 AC 全綠＝我宣告「做完」。
# ⇒ 票 body 有 `> 引言`（規矩：owner 的話一律引言格式）時，引言裡出現的**動作動詞**
#   若沒被 AC 段覆蓋（含同義詞）⇒ soft 警告點名那個動詞。⛔ 治不了根因②③（那兩層
#   各自有閘）；同義表是啟發式 —— 它的產出是「去看一眼」，⛔ 不是裁決。
VERB_COVER = {
    "儲存": r"儲存|保存|存檔|存回|寫入|寫回|改得動|save|writ",
    "寫入": r"寫入|寫回|儲存|存回|改得動|save|writ",
    "讀取": r"讀取|重讀|載入|讀得|read|load",
    "產生": r"產生|生成|generate|推導",
    "同步": r"同步|sync|回流",
    "更新": r"更新|update|重生成",
    "刪除": r"刪除|移除|delete|退場",
    "備份": r"備份|留底|backup|快照",
    "還原": r"還原|rollback|回捲|開關",
    "rollback": r"rollback|還原|回捲|開關",
    "驗收": r"驗收|acceptance|驗證|端到端",
    "部署": r"部署|deploy|上線",
}
quotes = "\n".join(l for l in body.split("\n") if re.match(r"\s*>", l))
if quotes.strip():
    m = re.search(r"(?:acceptance criteria|驗收標準|##\s*驗收)([\s\S]*?)(?=\n##|\Z)", body, re.I)
    ac = m.group(1) if m else ""
    missing = [v for v, cover in VERB_COVER.items() if v in quotes and not re.search(cover, ac, re.I)]
    if missing:
        soft.append("⭐ owner 引言裡的動詞「" + "、".join(dict.fromkeys(missing))
                    + "」沒被驗收標準覆蓋 —— **AC 不可以比原話窄**"
                    "（GH#821 根因①：「唯讀」是我自己寫進 #775 的，AC 把它固定下來了）")

for x in dict.fromkeys(soft):
    print(f"ℹ️ {label} {x}")
for x in dict.fromkeys(hard):
    print(f"⚠️ {label} {x}")
sys.exit(1 if hard else 0)
PY
}

lint_text() { # $1=標籤 $2=標題 $3=內文
  local missing=()
  echo "$2" | grep -qE  "$RE_TAG"   || missing+=("標題缺 [緊急]/[重要]/[優先]/[一般]")
  # ⭐ `[自動]` 有的話要在**最前面**（owner 掃的是標題開頭）——
  #   ⛔ lint 不強制「該不該有」（那要知道當初是誰決定的），只驗**位置**。
  if echo "$2" | grep -qE "$RE_AUTO" && ! echo "$2" | grep -qE "^\[自動\]"; then
    missing+=("[自動] 要放在標題**最前面**（owner 掃的是開頭；排第三個等於要他讀完整行）")
  fi
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
  # ⭐「這個數字還住在哪裡？」—— 2026-08-29 一天中**六次**（鏡射／vfxKey／上下界／
  #   卡面／claims 兩個消費端／契約說明）。⚠️ 每一次症狀都不一樣,⛔ 讀起來像六個病。
  #   ⚠️ 只警告:⛔ 不是每張票都在寫入一個值（infra／docs 票就沒有）。
  echo "$3" | grep -qE "$RE_HOME"      || advisory+=("第二個住處（這個值還住在哪裡？）")
  if [ ${#advisory[@]} -gt 0 ] && [ ${#missing[@]} -eq 0 ]; then
    local aj=""; for a in "${advisory[@]}"; do aj="${aj}${aj:+ · }${a}"; done
    echo "ℹ️ $1 建議補(⛔ 不擋):${aj}"
  fi
  if [ ${#missing[@]} -gt 0 ]; then
    local joined=""
    for m in "${missing[@]}"; do joined="${joined}${joined:+ · }${m}"; done
    echo "⚠️ $1 缺:${joined}"
    lint_deep "$1" "$2" "$3" || true   # 五件都沒齊時第三層只印,⛔ 不重複算一次紅
    return 1
  fi
  lint_deep "$1" "$2" "$3" || return 1
  return 0
}

BAD=0
if [ "${1:-}" = "--dupes" ]; then
  # ⭐ 預設只掃 open（存量清理）;`--dupes all` 連已關的一起掃 ——
  #   ⛔ 這不是選配:GH#808 的四對裡**有三對已經關掉一張**,只掃 open 看不到它們,
  #   而「列得出今天這四對」正是那張票的驗收標準 ⇒ 量尺要驗得到自己。
  STATE="${2:-open}"
  # ⭐ GGD_TICKET_DUPES_JSON=<夾具檔> —— 讓守衛驗得到**這支腳本本身**而不必碰網路。
  #   ⛔ 不是「測試自己造一份 payload 餵進消費端」(失敗形態⑤) —— 它跑的是**出貨的**
  #   這支腳本、出貨的抽取與分組，只有「issue 從哪來」被換掉。
  if [ -n "${GGD_TICKET_DUPES_JSON:-}" ]; then
    RAW=$(cat "$GGD_TICKET_DUPES_JSON") || RAW=""
    STATE="夾具"
  else
    RAW=$(gh issue list --state "$STATE" --limit 800 --json number,title,body 2>/dev/null) || RAW=""
  fi
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

    ⛔ **兩種「引用」要先剝掉** —— 一張**在描述重複**的票（#808 自己就是）
    會把別人的接手清單抄進來，於是它變成一個看起來很合理的誤報:
      ① **表格列**（行首 `|`）—— #808 的對照表整張抄了四對
      ② ⭐ **`「…」` 與 `` `…` ``** —— CLAUDE.md 第〇·六守則①②已經立過同一條規矩:
         任何讀文字找機制的正則都要先剝掉引號內容。#808 的驗收欄寫著
         「造一個『接手 #20』的假開票」—— 那是**測試夾具**，⛔ 不是宣告。
    ⭐ 量到的（2026-08-27，91 張 open 票）:表格列命中 **1**（正是 #808）；
    非表格列剝除前 **40** → 剝除後 **39**，被剝掉的就是上面那一行。
    ⇒ 兩道都**零成本**（真陽性一個都沒少）。
    """
    lines = ((it.get("title") or "") + "\n" + (it.get("body") or "")).split("\n")
    txt = "\n".join(l for l in lines if not l.lstrip().startswith("|"))
    txt = re.sub(r"「[^」]*」", "", txt)
    txt = re.sub(r"`[^`]*`", "", txt)
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
