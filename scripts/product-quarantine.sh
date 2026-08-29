#!/usr/bin/env bash
# 🔒 產物隔離區 —— owner 2026-08-24（逐字）:
#   「這個問題發生上百次了，為什麼總是會改到產物而不是產生器？是否可以把產物放在
#    特定資料夾作為隔離區，只能靠產生器去操作修改產物內容？」
#
# ⭐ 隔離不搬資料夾（500+ 個產物路徑是對外契約,搬了每個消費者都斷）——
#   隔離用**檔案權限**:產物平時 chmod a-w(444),只有產生器執行期間解鎖。
#   ⇒ genguard hook 看不見的那條路（python/node 檔案 API 直寫 —— 上百次事故的
#   真正通道）從此吃 PermissionError,⛔ 不是靜默成功然後被下一次 sync 打回來。
#
# 擁有者表 = tools/parallel-gates/sync-io.json 的 writes（量出來的,⛔ 不是手寫）。
#
# ⭐⭐ GH#707（2026-08-27）——「誰該被鎖」⛔ 不等於「誰被寫過」。
#   sync-io 只知道**誰寫過這個檔**;而**正規化器**（tiers:apply 那一族）是就地改欄位,
#   它認領的檔**是手編的來源**,⛔ 不是它的產物。在此之前這支腳本不認得那個概念
#   ⇒ 把 387 份手編檔一起 chmod 444,而 genguard 對同樣那 387 份說「不擋你」
#   ⇒ **兩個閘意見相左 100%**,合法手編吃 EACCES 而訊息裡零指引。
#   ⇒ 判準改成:**至少有一個非正規化器認領** ⇒ 鎖;**只有正規化器認領** ⇒ 放行(chmod u+w)。
#   ⚠️ 「放行」是主動的,⛔ 不是「跳過」—— 跳過的話那 387 份會永遠停在 444,
#      而且每一次 genrun/sync 收工都要再確認一次。⭐ lock 的語意是
#      「**把隔離區推到正確狀態**」:該鎖的鎖上、該放的放開。
#   ⇒ 於是 genrun.sh 與 sync.mjs 的「解鎖→跑→重鎖」自動就對了(它們走的是同一個 lock)。
#   清單的唯一住處:tools/parallel-gates/normalizers.json（genguard.sh / hook 讀同一份）。
#
# 用法:
#   scripts/product-quarantine.sh lock             # 鎖全部產物(收斂完之後)
#   scripts/product-quarantine.sh unlock           # 解鎖全部(sync 開跑前;sync.mjs 自動呼叫)
#   scripts/product-quarantine.sh lock|unlock --step <name>   # 只動那一支的產物
#   scripts/product-quarantine.sh status           # 幾鎖幾開
#   scripts/product-quarantine.sh --doctor         # ⭐ GH#815:一個指令回答「現在有幾處污染」
# env:GGD_QUARANTINE_IO=<io.json 路徑>（測試用）· GGD_QUARANTINE_NORMALIZERS=<normalizers.json 路徑>
#     · GGD_QUARANTINE_PKG=<package.json 路徑>（校準用）· GGD_QUARANTINE_SCAN=<孤兒掃描根,逗號分隔>
#     · GGD_QUARANTINE_FIELDIO / GGD_QUARANTINE_FIELDPROBES=<欄位級表>（校準用）
#     · GGD_QUARANTINE_OFF=1（逃生口,commit 訊息要說為什麼）
set -euo pipefail
cd "$(dirname "$0")/.."
[ "${GGD_QUARANTINE_OFF:-}" = "1" ] && { echo "⚠️ 隔離區關閉中(GGD_QUARANTINE_OFF=1)"; exit 0; }
IO="${GGD_QUARANTINE_IO:-tools/parallel-gates/sync-io.json}"
NORM="${GGD_QUARANTINE_NORMALIZERS:-tools/parallel-gates/normalizers.json}"
PKG="${GGD_QUARANTINE_PKG:-package.json}"
SCAN="${GGD_QUARANTINE_SCAN:-content}"
FIO="${GGD_QUARANTINE_FIELDIO:-tools/parallel-gates/field-io.json}"
FPR="${GGD_QUARANTINE_FIELDPROBES:-tools/parallel-gates/field-probes.json}"
MODE="${1:?用法: lock|unlock|status|doctor [--step <name>]}"
[ "$MODE" = "--doctor" ] && MODE="doctor"
# ⭐⭐ GH#815 —— **不認得的模式要出聲**。在此之前 python 的分派是
#   `if status … elif lock … else:unlock` ⇒ `--doctor`／`lokc`／`DOCTOR` 全部
#   **靜靜跑了 unlock 然後 exit 0**,輸出與成功一模一樣（「壞掉跟正常長得一模一樣」）。
#   ⚠️ 而它的副作用是**真的解鎖**:一個打錯字的指令會把整個隔離區打開而沒有人知道。
case "$MODE" in
  lock|unlock|status|doctor) ;;
  *)
    echo "⛔ 不認得的模式 '$MODE' —— 只有 lock|unlock|status|doctor（別名 --doctor）。" >&2
    echo "   ⚠️ 在此之前這裡會**靜靜跑 unlock 並 exit 0**（GH#815）。" >&2
    exit 2 ;;
esac
STEP=""; [ "${2:-}" = "--step" ] && STEP="${3:?--step 要帶名字}"

if [ "$MODE" = "doctor" ]; then
  set +e
  python3 - "$IO" "$NORM" "$PKG" "$SCAN" "$FIO" "$FPR" <<'PY'
# 🩺 GH#815 ④ ＋ GH#827 —— 四段污染，**一個指令**（⛔ 不是四段各自去 grep）。
# ⭐ 四段全部**從出貨的東西推導**：package.json 的指令文字 · 檔案系統的 mode 位元 ·
#    sync-io.json 的 writes · field-io.json（產生器自己算出來的欄位擁有權）。
#    ⛔ 沒有一段是手寫清單。
import fnmatch, glob as _glob, json, os, stat, sys
io_path, norm_path, pkg_path, scan_roots = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
fio_path, fpr_path = sys.argv[5], sys.argv[6]

def _load(p, what):
    try:
        return json.load(open(p, encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        # ⚠️ fail-loud:讀不到表就**不要**印一份漂亮的 0（那與「沒有污染」長得一模一樣）。
        print(f"⛔ 讀不到{what} {p}（{exc}）—— ⛔ 不要把「沒有輸出」當成「沒有污染」。", file=sys.stderr)
        sys.exit(2)

io, nj, pkg = _load(io_path, "戶籍表"), _load(norm_path, "正規化器清單"), _load(pkg_path, "package.json")
pkg = pkg.get("scripts", {}) or {}
steps = io.get("steps", []) or []
NORM = {n["step"] for n in nj.get("normalizers", []) or []}
# ⭐ 「看過了，而它不是正規化器」也要留下**能被反駁的理由** —— 與
#    skillsSyncCoversGenerators 的豁免表同一個形狀（理由太短 ⇒ 不算清掉）。
CLEARED = {r["step"] for r in nj.get("$rejected", []) or [] if len(str(r.get("why-not") or "").strip()) >= 20}

def expand(ws):
    out = set()
    for w in ws or []:
        out.update(_glob.glob(w) if any(c in w for c in "*?[") else [w])
    return out

# ── ① 入口:寫產物的產生器 script 要自帶解鎖 ────────────────────────────────
#    兩個獨立推導（⛔ 一個不夠 —— 實測第一個漏了 10 支）:
#    ①-a sync-io 宣告寫產物的步驟  ①-b 存在 `X:check` ⇒ 產它的那一支必然寫產物
SUF = ["build", "apply", "json", "export", "csv", "audit", "numbers",
       "docs", "provenance", "wishes", "plan", "readme", "status", "roll"]
producers = {s["name"] for s in steps if s.get("writes")}
for k in list(pkg):
    if k.endswith(":check"):
        stem = k[: -len(":check")]
        for suf in SUF:
            if f"{stem}:{suf}" in pkg:
                producers.add(f"{stem}:{suf}")
bare = sorted(k for k in producers if k in pkg and not k.endswith(":raw") and "genrun.sh" not in pkg[k])
wrongly = sorted(k for k, v in pkg.items() if k.endswith(":check") and "genrun.sh" in v)
# ⚠️ **提示層,⛔ 不計入總數**:`X:check` 的兄弟裡上面兩個推導收不到的那些。
#    SUF 是一張**手寫**的後綴表（票的 Implementation constraints 說⛔不要手寫清單）——
#    ⭐ 拿掉它會多出 14 支誤報（review:serve / voxel:extract / skills:sync …），
#    所以它留著,而**它漏掉的**在這裡逐支指名,讓下一個人去判而不是永遠看不見。
hint = set()
for k in list(pkg):
    if not k.endswith(":check"):
        continue
    stem = k[: -len(":check")] + ":"
    for o in pkg:
        if (o != k and o.startswith(stem) and not o.endswith((":check", ":raw"))
                and o not in producers and "genrun.sh" not in pkg[o]):
            hint.add(o)

# ── ② 孤兒:444 而戶籍**無人宣告** ──────────────────────────────────────────
claimed = set()
for s in steps:
    claimed |= expand(s.get("writes"))
orphans = []
for root in [r for r in scan_roots.split(",") if r]:
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d != "_legacy"]
        for fn in filenames:
            if not fn.endswith(".json"):
                continue
            p = os.path.join(dirpath, fn)
            if p not in claimed and not (os.stat(p).st_mode & stat.S_IWUSR):
                orphans.append(p)

# ── ③ 疑似未分類的正規化器（⭐ 三個獨立訊號,⛔ 不是手工判斷）──────────────
#    A「glob 灌大」:一條 glob 就認領 N 份 ⇒ 它宣告的遠多於它 emit 的
#      （skillremake:provenance 494 vs 實寫 1 格 · speedtiers:build 72 vs 一格 tier 行）
#    B「讀寫重疊」:它讀的正是它寫的那些 ⇒ 就地改欄位的定義
#      ⚠️ merge-io.mjs:108 會把「自己也寫過的」從 reads 濾掉 ⇒ B 只在 glob/靜態宣告時看得見
#      ⇒ 這正是**為什麼要兩個訊號**:castderive:build:raw 只有 B,msgledger:build 只有 A。
#    ⭐ C「共寫」:它寫的**每一份**都有第二個寫入端,而且不只一份。
#      ⚠️⚠️ C 是 2026-08-29 對抗性複驗逼出來的 —— A 與 B 對 `tiers:apply` **結構上失明**:
#         它的 writes 是 **402 條明確路徑**（零 glob ⇒ A=0）,而那 402 條剛好被
#         merge-io 的 `not e.writes.has(r)` 從 reads 濾光（⇒ B=0）。⇒ 拿掉它兩支守衛
#         **一起是綠的**,而下一次 lock 會把 387 份手編技能檔 chmod 444（GH#707 的死路）。
#      ⭐ A 與 B 問的是**這一支自己**的形狀（名詞）;C 問的是**它與別人的關係** ——
#         而「就地改欄位」本來就是一個關係:那個檔是**別人**的。⇒ glob 與明確路徑都看得見。
wexp = {s["name"]: expand(s.get("writes")) for s in steps}
writers = {}
for n, fs in wexp.items():
    for f in fs:
        writers[f] = writers.get(f, 0) + 1
susp = []
for s in steps:
    W = s.get("writes") or []
    name = s["name"]
    a = max([len(_glob.glob(g)) for g in W if any(c in g for c in "*?[")] or [0])
    b = len(expand(W) & expand(s.get("reads")))
    mine = wexp[name]
    c = sum(1 for f in mine if writers.get(f, 0) > 1)
    if (a > 1 or b > 0 or (len(mine) > 1 and c == len(mine))) and name not in NORM and name not in CLEARED:
        susp.append((name, a, b, c, len(mine)))

# ── ④ 欄位級孤兒（GH#827）——「整份是產物」把**沒有任何寫入端的欄位**一起關進去 ──
#    ⭐ 為什麼要有這一段:`vfxfam:build` 擁有 content/config/vfx-families.json,而它
#      **逐格保留**一整族欄位（sound* / groundDecal / 後台旋鈕）。⇒ 那幾欄:
#        · 產生器不寫它們（重跑也不會回來）· genguard 對整份回 AUTHOR ⇒ 手改被擋
#        · 隔離區把整份 chmod 444 ⇒ 後台也寫不進去
#      ＝ ⭐ **沒有任何合法寫入端的欄位**,而三個閘一起是綠的。
#    ⭐ 「產生器擁有哪幾欄」是**量出來的**（field-io.mts 呼叫產生器自己的推導函式）,
#      ⛔ 不是這裡手寫;這一段只做**減法**與**認領檢查**。
#    ⚠️ 只對 field-io 真的量到的節做宣稱 —— 一個沒量到的節**不當成「全部自由」**
#      （那是危險的那個方向）。
def _rows_keys(obj):
    out = set()
    for v in (obj or {}).values():
        if isinstance(v, dict):
            out |= set(v.keys())
    return out

forphans = []
try:
    fio = json.load(open(fio_path, encoding="utf-8"))
    fpr = json.load(open(fpr_path, encoding="utf-8"))
except Exception as exc:  # noqa: BLE001
    print(f"⛔ 讀不到欄位級表（{exc}）—— ⛔ 不要把「沒有輸出」當成「沒有欄位級孤兒」。", file=sys.stderr)
    sys.exit(2)
authors_by_path = {p["path"]: (p.get("fieldAuthors") or {}) for p in fpr.get("probes", [])}
for f in fio.get("files", []):
    path, owned = f["path"], f.get("owned") or {}
    try:
        doc = json.load(open(path, encoding="utf-8"))
    except Exception:
        continue  # 檔不在（沙盒/精簡 checkout）⇒ 這一份沒得減,⛔ 不假裝有結論
    claimed = authors_by_path.get(path, {})
    for section, own in owned.items():
        present = set(doc.keys()) if section == "$top" else _rows_keys(doc.get(section[: -len("[*]")]))
        for k in sorted(present - set(own)):
            key = f"{section}/{k}"
            # ⚠️ 節名字面上含 `[*]`,而 fnmatch 會把 `[*]` 讀成**字元類**（比中一個 `*` 字元）
            #    ⇒ 整條 pattern 直接餵給 fnmatch 會**永遠比不中**,而輸出看起來像
            #    「這幾欄沒有人認領」= 一個永遠紅的閘（2026-08-29 第一版就是這樣）。
            #    ⇒ 節名逐字比,只有**欄名**那一段用 fnmatch。
            hit = False
            for pat in claimed:
                ps, _, pf = pat.rpartition("/")
                if ps == section and fnmatch.fnmatch(k, pf):
                    hit = True
                    break
            if hit:
                continue
            forphans.append(f"{path}  {key}  ⇐ {f['fileOwner']} 不擁有它,而沒有人認領")

def sec(n, title, rows, fix):
    print(f"\n{n} {title}: {len(rows)}")
    for r in rows[:12]:
        print(f"    · {r}")
    if len(rows) > 12:
        print(f"    …（另外 {len(rows) - 12} 筆）")
    if rows:
        print(f"    ⇒ {fix}")

print("🩺 隔離區體檢（GH#815 ＋ GH#827 ④）—— ⭐ 四段全部從出貨的東西推導")
sec("①", "入口裸跑（打下去直接寫 444 產物 ⇒ EACCES）",
    [f"pnpm {k}" for k in bare] + [f"⛔ {k} 是唯讀檢查卻被包進解鎖" for k in wrongly],
    "包成 `bash scripts/genrun.sh <step> <step>:raw`，真正的指令搬到 `<step>:raw`")
sec("②", "鎖了無主（444 而 sync-io 零命中 ⇒ ⭐ 永久唯讀的孤兒）", orphans,
    "二選一：補進 sync-io.json 的 writes（它真的是產物）／chmod 644（它是手編檔）")
sec("③", "疑似未分類的正規化器（A=glob 認領數 · B=讀寫重疊數 · C=與別人共寫/總寫）",
    [f"{n}  A={a} B={b} C={c}/{w}" for n, a, b, c, w in susp],
    "要嘛進 normalizers.json 的 normalizers，要嘛進 $rejected 並寫下**能被反駁的理由**")
sec("④", "欄位級孤兒（整份是產物,而這幾欄沒有任何寫入端 —— GH#827）", forphans,
    "去 field-probes.json 的 fieldAuthors 寫下**誰才是那一欄的寫入端**（能被反駁的理由）；"
    "真的沒有人寫 ⇒ 那一欄該刪掉,⛔ 不是留著讓它永遠唯讀")
if hint:
    print(f"\n⚠️ 提示（⛔ 不計入總數）：`X:check` 的兄弟中推導收不到的 {len(hint)} 支 —— "
          "逐支確認它會不會寫產物：\n    " + " · ".join(sorted(hint)))
total = len(bare) + len(wrongly) + len(orphans) + len(susp) + len(forphans)
print(f"\ndoctor: 入口 {len(bare) + len(wrongly)} · 孤兒 {len(orphans)} · 未分類 {len(susp)}"
      f" · 欄位級孤兒 {len(forphans)} · 總計 {total}")
sys.exit(1 if total else 0)
PY
  exit $?
fi

python3 - "$IO" "$MODE" "$STEP" "$NORM" <<'PY'
import fnmatch as _fnmatch
import glob as _glob
import json, os, stat, sys
io_path, mode, step, norm_path = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
d = json.load(open(io_path, encoding="utf-8"))

# ⭐ 正規化器清單 —— 唯一住處在 normalizers.json（genguard.sh / PreToolUse hook 讀同一份）。
# ⚠️ 讀不到 ⇒ **空集合＝全部當成作者＝全部鎖**（fail-closed:保護產物那一邊），
#    ⛔ 但一定要大聲 —— 靜默地退回舊行為就是把 GH#707 原地重演一次而輸出看起來正常。
try:
    # ⭐ 2026-08-29:值是**路徑範圍**（`only`,選填）—— 一支可以對 A 檔是正規化器、
    #    對 B 檔是作者（apconv:build 就是）。None ＝ 全部路徑（既有行為）。
    NORMALIZERS = {
        str(n["step"]): (list(n["only"]) if isinstance(n.get("only"), list) else None)
        for n in json.load(open(norm_path, encoding="utf-8")).get("normalizers", [])
    }
except Exception as exc:  # noqa: BLE001
    NORMALIZERS = {}
    print(f"⚠️⚠️ 讀不到正規化器清單 {norm_path}（{exc}）—— 這一輪把**每一份**被認領的檔都當成產物鎖起來。", file=sys.stderr)
    print("   ⇒ 那會讓正規化器認領的手編檔又變回唯讀（GH#707 的形狀）。先把那份 JSON 修好。", file=sys.stderr)

# ⭐ 「誰認領這個檔」要對**全部**步驟算，⛔ 不是只對 --step 的那一支 ——
#    否則 `lock --step tiers:apply` 會把「tiers:apply ＋ skillremake:json 共同認領」的
#    真產物誤判成正規化器專屬而放行（作者那一半在別的步驟裡）。
def _expand(w: str) -> list[str]:
    return _glob.glob(w) if any(ch in w for ch in "*?[") else [w]

claimants: dict[str, set[str]] = {}
for s in d.get("steps", []):
    for w in s.get("writes", []) or []:
        for f in _expand(w):
            claimants.setdefault(f, set()).add(s.get("name") or "?")

def _normalizes(step: str, f: str) -> bool:
    """這一支對**這一個路徑**算不算正規化器（⭐ 逐檔,⛔ 不是逐步驟）。"""
    if step not in NORMALIZERS:
        return False
    only = NORMALIZERS[step]
    return True if not only else any(_fnmatch.fnmatch(f, g) for g in only)


def has_author(f: str) -> bool:
    """⭐ 與 genguard.sh 的 authors.length 判準**逐字一致**。"""
    return any(not _normalizes(n, f) for n in claimants.get(f, set()))

files: set[str] = set()
matched = 0
for s in d.get("steps", []):
    if step and s.get("name") != step:
        continue
    matched += 1
    for w in s.get("writes", []) or []:
        # ⭐ GH#771:日期戳家族在戶籍表裡是 glob（merge-io 正規化的）⇒ 展開成現存檔。
        if any(ch in w for ch in "*?["):
            files.update(_glob.glob(w))
        else:
            files.add(w)
# ⭐ 2026-08-26（owner:「追誤會的多個源頭」）—— 兩種靜默都要出聲:
#   ① `--step` 打錯名字 ⇒ 之前**靜默得到空集合**,輸出與成功一模一樣 ⇒ 現在 exit 2 指名。
#   ② step 存在但宣告 0 份產物 ⇒ 之前印「解鎖 0 份」看起來像正常 ⇒ 現在明說那是
#      戶籍洞（GH#771:條件寫入端在已同步的樹上量到 0 寫）,單獨跑它會吃 EACCES。
if step and matched == 0:
    known = ", ".join(sorted((s.get("name") or "?") for s in d.get("steps", [])))
    print(f"⛔ 沒有叫 '{step}' 的步驟 —— 名字打錯或它不在 sync-io 的 {len(d.get('steps',[]))} 步裡。", file=sys.stderr)
    print(f"   有的: {known}", file=sys.stderr)
    sys.exit(2)
if step and matched > 0 and not files:
    print(f"⚠️ 步驟 '{step}' 在戶籍表裡宣告 **0 份產物** —— 若它其實會寫檔,那是量測洞（GH#771）:", file=sys.stderr)
    print(f"   它寫的檔仍然鎖著(444),單獨跑它會吃 EACCES。正解是重量測 sync-io,⛔ 不是手動 chmod。", file=sys.stderr)
locked = unlocked = missing = 0
released = 0   # ⭐ GH#707:lock 時**主動放行**的正規化器專屬檔（444 → 644）
norm_only = 0  # 追蹤到的正規化器專屬檔總數（status 用）
for f in sorted(files):
    if not os.path.isfile(f):
        missing += 1
        continue
    st = os.stat(f).st_mode
    writable = bool(st & stat.S_IWUSR)
    author = has_author(f)
    if not author:
        norm_only += 1
    if mode == "status":
        locked += 0 if writable else 1
        unlocked += 1 if writable else 0
    elif mode == "lock":
        # ⭐ lock ＝「把隔離區推到正確狀態」,⛔ 不是「一律加鎖」。
        if author and writable:
            os.chmod(f, st & ~(stat.S_IWUSR | stat.S_IWGRP | stat.S_IWOTH)); locked += 1
        elif not author and not writable:
            os.chmod(f, st | stat.S_IWUSR); released += 1
    elif mode == "unlock" and not writable:
        os.chmod(f, st | stat.S_IWUSR); unlocked += 1
scope = f"（step={step}）" if step else ""
# ⚠️ 這一行是 GH#707 的量尺:**> 0 就是 genguard 與隔離區又意見相左了**。
stuck = sum(
    1 for f in files
    if os.path.isfile(f) and not has_author(f) and not (os.stat(f).st_mode & stat.S_IWUSR)
)
tail = f",正規化器專屬 {norm_only} 份不上鎖" if norm_only else ""
if mode == "status":
    print(f"🔒 隔離區{scope}:鎖著 {locked} · 可寫 {unlocked} · 不存在 {missing} / 追蹤 {len(files)}{tail}")
    if stuck:
        print(f"⚠️ 其中 **{stuck} 份**只被正規化器認領卻是唯讀 —— genguard 說「不擋你」而檔案改不動（GH#707）。", file=sys.stderr)
        print("   ⇒ 跑一次 `bash scripts/product-quarantine.sh lock` 把它們放行。", file=sys.stderr)
elif mode == "lock":
    extra = f",放行 {released} 份正規化器專屬檔" if released else ""
    print(f"🔒 隔離區{scope}:上鎖 {locked} 份（追蹤 {len(files)},缺 {missing}{tail}）{extra}")
else:
    print(f"🔓 隔離區{scope}:解鎖 {unlocked} 份（追蹤 {len(files)},缺 {missing}）")
PY
