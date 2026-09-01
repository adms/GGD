#!/usr/bin/env python3
"""覆蓋／刪除**之前**先留一份 —— PreToolUse hook。

owner 2026-08-20：

  「我說過你要做**取代**這種事情以前都要**備份**，就算備份到 legacy 資料夾也沒關係，
   請你特別要檢查**覆蓋、刪除檔案內容**指令的時候先做備份，這一定要放到開發守則**嚴守**」

⚠️ 為什麼是 hook 而不是散文：這條規則已經失效**兩次** ——
2026-08-18 一個 `git checkout GameApp.ts` 洗掉三條 lane；
2026-08-20 一個 `cat > ggd-board.html` 洗掉整份作戰板（唯一副本在 scratchpad，救不回來）。
兩次我都「知道」這條規則。⇒ 判準治不了，只有**在動作發生前跑的東西**治得了。

⭐ 判準：**git 裡有沒有一份可以救回來的副本？**
  · 已追蹤且乾淨      → git 有 → 只記一行，⛔ 不重複備份（不然 legacy 會爆）
  · 已追蹤但有未提交改動 → **備份**（那些改動 git 沒有）
  · 未追蹤 / 不在 repo 裡 → **備份**（唯一副本）

備份落點：`docs/legacy/_overwrites/overwrite_temp_<YYYYMMDD-HHMMSS>/…`（repo 內，被 git 看得到）
repo 外的檔（scratchpad 等）落在 `~/.claude/projects/-Users-Takuro-GGD/overwrite-backups/`。

⛔ 這支腳本**永遠不擋**工具（exit 0）。它只留副本 —— 一個會擋人的備份 hook
會被關掉，而被關掉的閘等於沒有閘。
"""
from __future__ import annotations
import json
import re, os, re, shutil, subprocess, sys, time
from pathlib import Path

REPO = Path(os.environ.get("CLAUDE_PROJECT_DIR", "/Users/Takuro/GGD")).resolve()
IN_REPO_DEST = REPO / "docs/legacy/_overwrites"
OUT_REPO_DEST = Path.home() / ".claude/projects/-Users-Takuro-GGD/overwrite-backups"
LOG = REPO / "docs/legacy/_overwrites/_ledger.tsv"
MAX_BYTES = 8 * 1024 * 1024  # 超過就只記帳，⛔ 不把大二進位塞進 repo

# Bash 裡真的會毀掉內容的形狀。⛔ `>>` 是附加,不算。
PATTERNS = [
    re.compile(r"(?<![>\d])>\s*(?!>)([^\s;|&()<>]+)"),          # cmd > file  /  cat > file
    re.compile(r"\brm\s+(?:-[a-zA-Z]+\s+)*([^\s;|&()<>]+)"),     # rm file
    re.compile(r"\btruncate\b[^;|&]*?\s([^\s;|&()<>]+)"),
    re.compile(r"\btee\s+(?!-a\b)(?:-[a-zA-Z]+\s+)*([^\s;|&()<>]+)"),
    re.compile(r"\b(?:mv|cp)\s+(?:-[a-zA-Z]+\s+)*\S+\s+([^\s;|&()<>]+)"),
    re.compile(r"\bgit\s+(?:checkout|restore)\s+(?:--\s+)?([^\s;|&()<>-][^\s;|&()<>]*)"),
]


def git(*a: str, cwd: Path | None = None) -> tuple[int, str]:
    r = subprocess.run(("git", *a), cwd=cwd or REPO, capture_output=True, text=True)
    return r.returncode, r.stdout.strip()


# ── ⛔⛔ **worktree 感知**（GH#625，2026-08-24 量到的）────────────────────────
#
# 在此之前這支腳本把 `REPO` 寫死成主樹,而**兩半都因此在 worktree 裡失效**:
#
#   · genguard —— `rel` 算成 `.claude/worktrees/lane-x/docs/…`,對不到 sync-io.json
#     的 `docs/…` ⇒ **一個字都不擋**。實測同一份產生器產物:
#         主樹     `EXIT=2`（擋下）
#         worktree `EXIT=0`（**放行**）
#   · 備份 —— `git status` 在主樹跑,而 `.claude/worktrees/` 在 `.git/info/exclude`
#     裡 ⇒ 每一個 lane 檔都被判成「未追蹤」⇒ 明明 git 有副本卻照樣備份(legacy 會爆)。
#
# ⭐ 這正是失敗形態⑧:hook 有掛、有跑、exit 0,而它**什麼都沒保護**。
# ⚠️ 而它的殺傷力隨著 GH#625 放大 —— 那張票要把**每一條 lane 都搬進 worktree**。
#
# ⇒ 判準改成「這個檔屬於**哪一棵**樹」,⛔ 不是「repo 根寫死是哪裡」。
def tree_root(p: Path) -> Path:
    """`p` 所在的 **worktree 根**（主樹或某條 lane 的樹）。走不到就退回 REPO。

    ⭐ 由**檔案系統**推導（往上找 `.git`,worktree 的 `.git` 是一個**檔案**不是目錄），
    ⛔ 不呼叫 git —— 這支 hook 在每一次 Write/Edit/Bash 前都跑,不可以再多開行程。
    """
    try:
        d = (p if p.is_dir() else p.parent).resolve()
    except OSError:
        return REPO
    for cand in (d, *d.parents):
        if (cand / ".git").exists():
            return cand
    return REPO


def needs_backup(p: Path) -> str | None:
    """回傳理由字串代表要備份;None 代表 git 已經有一份。"""
    root = tree_root(p)
    try:
        rel = p.resolve().relative_to(root)
    except (ValueError, OSError):
        return "repo 外"
    code, out = git("status", "--porcelain", "--", str(rel), cwd=root)
    if code != 0:
        return "git 讀不到"
    if not out:
        code, _ = git("ls-files", "--error-unmatch", str(rel), cwd=root)
        return None if code == 0 else "未追蹤"
    return "未追蹤" if out.startswith("??") else "有未提交改動"


def preserve(p: Path, why: str, stamp: str, actor: str) -> str:
    try:
        size = p.stat().st_size
    except OSError:
        return "stat 失敗"
    if size > MAX_BYTES:
        return f"只記帳（{size}B > 上限）"
    try:
        rel = p.resolve().relative_to(REPO)
        dest = IN_REPO_DEST / stamp / rel
    except (ValueError, OSError):
        dest = OUT_REPO_DEST / stamp / p.name
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(p, dest)
    return str(dest)


# ── 🪤 heredoc 的**內文不是命令**（GH#791,2026-08-27 實測)──────────────────
#
# 在此之前這裡只做 `re.sub(r"(?<!<)<<-?(?!<)\s*'?\w+'?", " ", cmd)` —— 那只拿掉**分隔符**,
# ⛔ 內文原封不動留在字串裡。於是 `cat > <某個新檔> <<'SH' … SH` 的內文(註解、
# 程式碼、markdown 表格裡到處都是 `>`)被當成一道又一道重導,取後面的 token 當路徑,
# 解析成 `/`(repo 根) ⇒ 走到 #771 那條「鎖著無主 ⇒ 擋」的分支 ⇒ **擋下合法的寫新檔**。
#
# ⭐ 為什麼它 2026-08-27 才爆:在此之前「無主」是**靜默放行**,解析錯了也看不出來;
#    #771 把它改成會擋之後,同一個解析缺陷就開始擋錯人。
# ⚠️ 誤報的成本是**不對稱**的:一個會擋錯人的閘會被關掉,而被關掉的閘等於沒有閘。
# ⚠️ ⭐ `(?<!<)<<(?!<)` —— **herestring 護欄**（GH#663，2026-08-29 對抗性複驗量到）。
#   `foo <<<"$MSG"` 是 **herestring**，⛔ 不是 heredoc。少了這個護欄，
#   `_strip_heredocs()` 會把 `<<<` 當成起點，然後**把後面每一行整段吞掉**
#   ⇒ ⭐ 同一個指令裡的 `git commit` **從閘眼前消失** ⇒ rc=0、一個字都不印。
#   （實測：`_strip_heredocs('grep -q x <<<"$MSG"\ngit commit -m …')` → `'grep -q x < '`）
# ⭐ 這是第〇·四守則：opener 規則本來有**兩個住處**（這裡與 `_heredocs()` 的），
#   而只有那一份帶護欄。⇒ 兩邊現在共用**這一個**。
_HEREDOC_START = re.compile(r"(?<!<)<<-?(?!<)\s*(?:'([^']*)'|\"([^\"]*)\"|\\?([A-Za-z_][A-Za-z0-9_]*))")


# ── ⭐⭐ 結束符規則只有**一個住處**（GH#663,2026-08-29）────────────────────────
#
# ⚠️ 在此之前這份知識有**兩份**,而它們**不一樣**:
#   · `_strip_heredocs()`  → `(probe.lstrip("\t") if dash else probe).rstrip() == delim`
#   · `_heredocs()`        → `lines[i].strip() != delim`   ⇐ ⛔ **無條件 strip**
# ⇒ 第二份會被**縮排的** `EOF` 終止,而 bash ⛔ 不會 —— 於是 commit 訊息裡任何一段
#   引用 heredoc 慣用法的 markdown 程式碼區塊,都會讓閘讀到一份**被截斷**的訊息,
#   而截斷點**之後**的違規**完全看不到**,且**一個字都不印**。
#
# ⭐ 下面兩條是**跑出來的**(2026-08-29,`bash` 5.x),⛔ 不是推論:
#   · plain `<<` : `EOF ` (尾隨一個空格) ⇒ **不終止**(量到 3 行,⛔ 不是 1 行)
#   · `<<-`      : tab 縮排 ⇒ 終止(1 行);**空格**縮排 ⇒ **不終止**(3 行)
# ⇒ 所以 `<<-` 只可以剝**前導 tab**,而**兩種都不可以** rstrip/strip。
def _is_heredoc_end(line: str, delim: str, dash: bool) -> bool:
    """這一行是不是 heredoc 的結束符 —— ⭐ 照 bash 的規則,兩個解析器共用這一份。"""
    return (line.lstrip("\t") if dash else line) == delim


def _strip_heredocs(cmd: str) -> str:
    """把每一段 heredoc 的**內文**整段丟掉,只留下真正的命令行。

    ⛔ 不重寫整個 shell 解析(#791 Non-goals)—— 只認得「起訖標記之間不是命令」。
    `<<-` 允許結束標記前面有 tab;`<<<`(herestring)⛔ 不是 heredoc,不會匹配。
    """
    if "<<" not in cmd:
        return cmd
    lines = cmd.split("\n")
    out: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        i += 1
        pending = [
            ((m.group(1) or m.group(2) or m.group(3)), m.group(0).startswith("<<-"))
            for m in _HEREDOC_START.finditer(line)
        ]
        out.append(_HEREDOC_START.sub(" ", line))  # 命令那一行留著,分隔符不是檔案
        for delim, dash in pending:
            while i < len(lines):
                probe = lines[i]
                i += 1
                if _is_heredoc_end(probe, delim, dash):
                    break
            # 內文整段**不 append** —— 它不是命令
    return "\n".join(out)


#: 解析失敗的註記(⛔ 只印一次,targets() 在 main 裡會被叫到兩次)。
_PARSE_NOTES: list[str] = []


def _looks_like_a_file_target(p: Path) -> bool:
    """解析出來的東西像不像一個**真的檔案目標**。

    ⭐ #791 的第二件:解析成 repo 根 / 檔案系統根 / 父目錄不存在 ⇒ 那是**我解析失敗**,
    ⛔ 不是「使用者要覆蓋 repo 根」。⇒ 放行並出聲(fail-open 沒錯,靜默才是缺陷 ——
    但**擋錯人**比靜默更糟)。
    """
    try:
        rp = p.resolve()
    except OSError:
        _PARSE_NOTES.append(f"{p}(路徑解析不了)")
        return False
    if rp.parent == rp or rp == REPO or rp == tree_root(rp):
        _PARSE_NOTES.append(f"{p}(解析成 repo 根/檔案系統根)")
        return False
    if not rp.parent.is_dir():
        _PARSE_NOTES.append(f"{p}(父目錄不存在)")
        return False
    return True


def targets(tool: str, ti: dict, cwd: Path) -> list[Path]:
    out: list[Path] = []
    if tool in ("Write", "Edit"):
        fp = ti.get("file_path")
        if fp:
            out.append(Path(fp))
    elif tool == "Bash":
        cmd = _strip_heredocs(ti.get("command") or "")
        for pat in PATTERNS:
            for m in pat.finditer(cmd):
                tok = m.group(1)
                if tok.startswith("$") or tok in ("/dev/null", "/dev/stdout", "/dev/stderr"):
                    continue
                p = Path(tok) if tok.startswith("/") else cwd / tok
                if not _looks_like_a_file_target(p):
                    continue
                out.append(p)
    return out


# ── 🚫 genguard —— 產生器的產物不准手改（owner 2026-08-24:「你已經犯過**數十次**
#    一樣的錯,請你一定要**寫成script擋住先檢查**,並且寫到開發守則」）─────────
#
# 錯的形狀:直接改產生器的產物 ⇒ 下一次 skills:sync 打回來,而那個「又紅了」
# 看起來像**新的**錯（2026-08-23 一晚在 godie-e002.r 上中兩次、49 檔一次）。
#
# ⭐ 擁有者表從 `tools/parallel-gates/sync-io.json` 的 writes **推導**（量出來的,
#    ⛔ 不是手寫）。⚠️ 這一段與備份那一半哲學不同:備份**永遠不擋**（擋人的備份
#    hook 會被關掉）,genguard **要擋** —— 因為「改產物」沒有任何合法情境:
#    產生器自己寫檔走 python/node 的檔案 API,⛔ 不經過 Write/Edit/shell 重導。
#    逃生口:GGD_GENGUARD_OFF=1（用過要在 commit 訊息裡說為什麼）。

#: ⭐⭐ **正規化器 ≠ 作者**（2026-08-24 主 session 裁決，L6 lane 點名要的那一條）。
#:
#: sync-io.json 是**量出來的**寫入表,所以它只知道「誰寫過這個檔」,⛔ 不知道
#: 「誰**擁有**這個檔」。而有一族步驟是**就地改欄位**的正規化器 ——
#: `tiers:apply` 讀 530 個檔、寫 401 個檔,它做的事情是把五級距重新解析回每一份
#: 技能文件,⛔ 它**不產生**那些檔案(檔案裡 99% 的內容不是它寫的)。
#:
#: ⛔ 把它當成作者的後果是**封死唯一的合法路**:出貨的 401 支技能文件裡有 39 支
#: 是直接編 JSON 的(沒有 `tools/skill-remake/heroes/*.py` 來源),於是
#: 「改來源再重生成」對它們**不存在** —— GH#648 的內容批就是卡在這裡。
#:
#: ⇒ 判準改成:**只有正規化器認領** ⇒ 警告(放行);**有作者認領** ⇒ 照舊擋下。
#: ⚠️ 放行之後**仍然要跑一次那個正規化器**,不然級距欄位會與新內容不一致 ——
#: 訊息會這麼說。嚴格模式 `GGD_GENGUARD_NORMALIZER_STRICT=1` 可以把它變回擋。
#: ⛔ 清單只准放 **sync-io.json 真的有的步驟名**(normalizerListIsReal.test.ts 在守)。
#: 2026-08-25 拿掉 "prose:apply":那是幽靈名(真名 prose:build,而它**不在** sync-io
#: 的 38 步裡)⇒ 永遠比不中,掛在這裡只是一句看起來有防的散文。
#: ⛔⛔ 2026-08-26 拿掉 "apdmg:build" —— 量到它的 2 份 writes **共有 0 份**
#: (content/config/ap-damage-scaling.json 它是唯一寫入者) ⇒ 它是**作者**不是正規化器,
#: 而 CLAUDE.md 明文把那一份列在「⛔ 不可手改」的 7 份 config 產物裡。
#:    ⭐⭐ 2026-08-27 加入 `skillremake:provenance` —— 它的 writes 是兩條 glob
#:    (content/{abilities,champions}/*.json = **494 份**)，於是 genguard 對那 494 份
#:    一律回 AUTHOR ⇒ 「改產物被擋／改來源沒有來源」的**死路**。
#:    ⛔ 而它不是作者：逐行讀 `tools/skill-remake/stamp_provenance.py` 只寫
#:    `out["provenance"]` 一格（⛔ 不是信檔頭，是看程式）。⇒ 純就地改欄位。
#:    ⭐ 加進來之後，真的有作者的那些檔（`skillremake:json` 也認領的 91+16 份）
#:    **仍然被擋**——因為 authors 濾掉正規化器之後還剩下它。這一格只放行
#:    「**只有** provenance 認領」的那些。實測擋住 lane C/K 三次的就是這一條。
#:    ⭐⭐ 2026-08-27 第二筆:speedtiers:build —— 與上面**同一個形狀**,而我第一次只修了一半。
#:    它的 writes 是一條 glob(content/champions 的 *.json = 71 份),而逐行讀
#:    tools/speed-growth/gen.ts 的 withTierLines():它只在**原始字串**上刪/插
#:    tier 欄位那幾行,⛔ 其餘位元組一個都不碰 ⇒ 正規化器。
#:    ⚠️ 漏掉它的後果:71 份英雄卡裡 55 份被判 AUTHOR 而訊息叫人「改來源」——
#:    **英雄卡自己就是來源**,那是一條死路(另一條 lane 實測撞到,GH#805)。
#:    ⭐⭐ 2026-08-27（GH#707）清單**搬進 tools/parallel-gates/normalizers.json** ——
#:    在此之前它有兩份手寫副本（這裡 + genguard.sh），而**第三個消費端**
#:    （scripts/product-quarantine.sh）根本不認得這個概念 ⇒ 這支 hook 說「放行」
#:    而檔案是 chmod 444 ⇒ **387 份**合法手編吃 EACCES。⇒ 唯一住處，三邊一起讀。
#:    每一格的理由（逐行讀過那支程式）住在那份 JSON 裡，⛔ 不再散落在三處註解。
_NORMALIZERS_JSON = REPO / "tools/parallel-gates/normalizers.json"

# ── 🎫 接手宣告的抽取（GH#808）─────────────────────────────────────────────
# ⭐ 慣例詞彙的**唯一住處**是 tools/parallel-gates/takeover-vocab.json，
#   `scripts/ticket-lint.sh --dupes` 讀同一份 ——⛔ 兩支各寫一條 regex 就是 GH#707 的病
#   （#808 的 Known risks 逐字說了「換一種寫法就漏掉」⇒ 那一格要有**一個**住處）。
_TAKEOVER_JSON = REPO / "tools/parallel-gates/takeover-vocab.json"


def _takeover_ids(text: str) -> set[int]:
    """從一段票文字抽出「接手 #N」的票號集合。

    ⛔ 先剝掉**兩種引用**（與 --dupes 逐字一致，量到的效果見那支腳本的註解）：
      ① 表格列（行首 `|`）—— 一張在**描述**重複的票會把別人的清單抄進表格
      ② `「…」` 與 `` `…` `` —— CLAUDE.md 第〇·六守則①②：讀文字找機制的正則
         一律先剝引號。#808 的驗收欄裡那個「接手 #20」是**測試夾具**，⛔ 不是宣告。
    """
    try:
        v = json.loads(_TAKEOVER_JSON.read_text(encoding="utf-8"))
        verbs, seps = v["verbs"], v["separators"]
    except Exception:
        return set()  # 詞彙表讀不到 ⇒ 不喊（⛔ 這是提醒不是閘）
    cls = "[" + "".join("\\" + c if c in "]^\\-" else c for c in seps) + "]*"
    rx = re.compile("(?:" + "|".join(re.escape(x) for x in verbs) + r")\s*((?:#\d+" + cls + r")+)")
    txt = "\n".join(l for l in text.split("\n") if not l.lstrip().startswith("|"))
    txt = re.sub(r"`[^`]*`", "", re.sub(r"「[^」]*」", "", txt))
    return {int(n) for grp in rx.findall(txt) for n in re.findall(r"\d+", grp)}


def _normalizer_steps() -> dict[str, list[str] | None]:
    """正規化器清單 —— ⛔ 不快取（hook 是一次性行程，而 lane 的樹可能有不同的表）。

    值是選填的 `only`（路徑 glob 陣列）＝ ⭐ **這一支只對這些路徑算正規化器**；
    `None` ＝ 全部路徑。⚠️ 分類是**逐檔**的，⛔ 不是逐步驟：apconv:build 就地改
    `content/abilities/*.json`（正規化器），而 `docs/_data/ap-conversion-applied.json`
    是它自己整份 emit 的清單（作者）—— 在此之前 hook 對那份**真產物**放行。

    ⚠️ 讀不到就回**空表**：那讓每一個被認領的檔都判成 AUTHOR ＝ **擋**。
    hook 這一側刻意 fail-**closed**（擋一個該放的，代價是一句話；
    放一個該擋的，代價是 owner 記錄過上百次的那個事故）。
    """
    try:
        data = json.loads(_NORMALIZERS_JSON.read_text(encoding="utf-8"))
        return {
            str(n["step"]): (list(n["only"]) if isinstance(n.get("only"), list) else None)
            for n in data.get("normalizers", [])
        }
    except Exception:
        return {}


def _unowned_fields(p: Path) -> str:
    """⭐ GH#827 —— 這一份裡有哪幾欄**不是它的擁有者算得出來的**（量出來的）。

    住處是 `tools/parallel-gates/field-io.json`（`field-io.mts` 呼叫產生器自己的
    推導函式產生）⇒ ⛔ 這裡沒有一張手抄的欄位表。讀不到就回空字串（這是**訊息**
    的一半，⛔ 不是裁決 —— 裁決仍然是「擋」）。

    ⚠️ 表**先讀 `p` 自己那棵樹**（lane 可能剛加了一支探針），沒有才退回主樹；
    而文件一定讀 `p` 本人 —— 讀主樹那一份會拿別人的內容算這一份的欄位。
    """
    try:
        root = tree_root(p)
        rel = str(p.resolve()).replace(str(root) + "/", "")
        fio_path = root / "tools/parallel-gates/field-io.json"
        if not fio_path.exists():
            fio_path = REPO / "tools/parallel-gates/field-io.json"
        fio = json.loads(fio_path.read_text(encoding="utf-8"))
        ent = next((f for f in fio.get("files", []) if f.get("path") == rel), None)
        if not ent:
            return ""
        doc = json.loads(p.read_text(encoding="utf-8"))
        parts = []
        for sect, own in (ent.get("owned") or {}).items():
            if sect == "$top":
                present = set(doc.keys())
            else:
                present = {k for r in (doc.get(sect[:-3]) or {}).values() if isinstance(r, dict) for k in r}
            un = sorted(present - set(own))
            if un:
                parts.append(f"{sect}: {' '.join(un)}")
        return " / ".join(parts)
    except Exception:
        return ""


def _generator_owner(p: Path) -> tuple[str, bool] | None:
    """`(步驟名, 是不是只有正規化器認領)`;沒有人認領回 None。"""
    try:
        # ⭐ 表讀主樹那一份(lane 的樹上可能還沒有),但 `rel` **一定要對 p 自己的樹算**
        #    —— 否則 lane 檔會算成 `.claude/worktrees/…/docs/x`,對不到任何 writes ⇒ 靜默放行。
        io_path = REPO / "tools/parallel-gates/sync-io.json"
        data = json.loads(io_path.read_text(encoding="utf-8"))
        root = tree_root(p)
        rel = str(p.resolve()).replace(str(root) + "/", "")
        claimants: list[str] = []
        import fnmatch as _fn
        for step in data.get("steps", []):
            for w in step.get("writes", []):
                # ⭐ GH#771:日期戳家族是 glob（merge-io 正規化）⇒ fnmatch。
                if (
                    rel == w
                    or (w.endswith("/") and rel.startswith(w))
                    or (any(ch in w for ch in "*?[") and _fn.fnmatch(rel, w))
                ):
                    name = step.get("name") or "?"
                    if name not in claimants:
                        claimants.append(name)
                    break
        if not claimants:
            return None
        normalizer_steps = _normalizer_steps()

        def _normalizes(step: str) -> bool:
            if step not in normalizer_steps:
                return False
            only = normalizer_steps[step]
            return True if not only else any(_fn.fnmatch(rel, g) for g in only)

        authors = [c for c in claimants if not _normalizes(c)]
        if authors:
            return (authors[0], False)
        return (claimants[0], True)
    except Exception:
        return None  # 表讀不到 ⇒ 不擋(⛔ hook 自身故障不可以癱瘓所有編輯)


# ── 🔒 全域鎖:產生器鏈**只能在主樹跑**（GH#625）─────────────────────────────
#
# `pnpm skills:sync` 寫 `bundle.json` ⇒ CLAUDE.md 逐字:「**同一時間只能有一條工作流跑它**」。
# 在 lane 的 worktree 裡跑它更糟 —— 產物落在**那棵樹**,主樹永遠看不到,
# 而 lane 收斂時那些產物會被 merge 進 main ⇒ 主樹的 `--check` 說 stale,
# 而「誰寫的」已經查不出來了。
#
# ⛔ 這是**閘不是判準**:lane 的 prompt 裡已經寫了「禁止跑」,而散文治不了(這份
#    文件記錄了五次判準失效)。⇒ 在**指令送出之前**擋下,並指名去主樹跑。
LOCKED_SCRIPTS = ("content:build", "skills:sync", "spec:build", "ship:check")
_LOCKED_RE = re.compile(
    r"\b(?:pnpm|npm|yarn)\s+(?:run\s+)?(" + "|".join(re.escape(s) for s in LOCKED_SCRIPTS) + r")\b"
)


def lane_marker(cwd: Path) -> Path | None:
    """cwd 是不是一條 lane 的 worktree(由 `worktree.mjs new` 放的標記推導)。"""
    root = tree_root(cwd)
    m = root / ".ggd-lane.json"
    return m if root != REPO and m.exists() else None


# ── 🏷️ commit 訊息住**兩個地方**,而閘只讀過一個（GH#663 的洞,2026-08-29 量到）──
#
# ⛔ 2026-08-27 `0ea4c6df` 掛上這道閘之後 **2 小時 08 分**,`98189e4f` 照樣落地 ——
#    而它的訊息裡逐字寫著 `#A5`(lint 判硬紅的形狀)。直接跑 lint 是 **exit 1**。
#    ⇒ 閘沒有壞,**是訊息從來沒送到它手上**。
#
# ⭐ 根因:`-F <檔>` 在 **PreToolUse 當下還不存在** —— 它與 commit 在**同一個 Bash 呼叫**裡:
#       cat > /private/tmp/m663.txt <<'EOF'
#       …訊息…
#       EOF
#       git commit -F /private/tmp/m663.txt -- <檔>
#    舊碼 `except OSError: _msg = None  # 它可能是 heredoc 剛要建的檔` ——
#    ⚠️ **註解指名了這個案例,然後放它過去**。而訊息**就在指令字串裡**。
#
# ⇒ ⭐ 這正是「同一個值有第二個住處,而讀端只讀一個」:磁碟上的檔 vs 指令字串裡的 heredoc。
#    修法是**兩個住處都讀**,⛔ 不是換一個猜法。
def _heredocs(cmd: str) -> list[tuple[str | None, str]]:
    """`[(重導目標 or None, 內文)]` —— 指令字串裡的每一個 heredoc。

    ⚠️ `(?<!<)<<(?!<)` 是刻意的:`<<<` 是 herestring,⛔ 不是 heredoc
    （`foo <<<'EOF'` 會被一個天真的正則讀成一份空訊息 ⇒ 靜默放行）。
    """
    out: list[tuple[str | None, str]] = []
    opener = re.compile(r"(?<!<)<<(?!<)(-?)\s*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\2")
    lines = cmd.split("\n")
    i = 0
    while i < len(lines):
        m = opener.search(lines[i])
        if not m:
            i += 1
            continue
        dash, delim = m.group(1) == "-", m.group(3)
        # 同一行的重導目標(`> 檔` / `tee 檔`);沒有 ⇒ 它餵的是 stdin
        tgt = None
        t = re.search(r">>?\s*([^\s;|&<>]+)", lines[i]) or re.search(
            r"\btee\s+(?:-[a-zA-Z]+\s+)*([^\s;|&<>]+)", lines[i]
        )
        if t:
            tgt = t.group(1).strip("\"'")
        body: list[str] = []
        i += 1
        # ⭐ 結束符規則與 `_strip_heredocs()` **共用同一個** `_is_heredoc_end()`。
        #    ⛔ 在此之前這裡是 `lines[i].strip() != delim` —— 無條件 strip ⇒
        #    一段引用 heredoc 慣用法的 markdown 程式碼區塊(縮排的 `EOF`)會**提早終止**,
        #    而 bash ⛔ 不會 ⇒ 閘讀到截斷的訊息、截斷點之後的違規靜默通過。
        while i < len(lines) and not _is_heredoc_end(lines[i], delim, dash):
            body.append(lines[i])
            i += 1
        i += 1
        out.append((tgt, "\n".join(body)))
    return out


#: ⭐ 這一次的指令**自己**會寫到那個路徑嗎（重導 / tee / cp / mv）。
#: ⛔ 吃的是**剝掉 heredoc 內文**的指令 —— 訊息**內文**裡的 `>` 不是一道重導。
_WRITERS = (
    re.compile(r">>?\s*([^\s;|&()<>]+)"),
    re.compile(r"\btee\s+(?:-[a-zA-Z]+\s+)*([^\s;|&()<>]+)"),
    re.compile(r"\b(?:cp|mv)\s+(?:-[a-zA-Z]+\s+)*\S+\s+([^\s;|&()<>]+)"),
)


def _command_writes_to(cmd_nohd: str, target: Path, cwd: Path) -> bool:
    for pat in _WRITERS:
        for m in pat.finditer(cmd_nohd):
            tok = m.group(1).strip("\"'")
            if tok.startswith("$"):
                continue
            p = Path(tok) if tok.startswith("/") else cwd / tok
            try:
                if p.resolve() == target.resolve():
                    return True
            except OSError:
                pass
    return False


def commit_message_of(cmd: str, cwd: Path) -> tuple[str, bool] | None:
    """`(訊息, 確定嗎)`;找不到回 None。

    `確定嗎=False` 只用在一個**啟發式**的分支(見下),⇒ 呼叫端只警告⛔ 不擋。

    ⚠️⚠️ **順序是這個函式最重要的一件事**（GH#663,2026-08-29 對抗性複驗量到）。
    在此之前它是「**先讀磁碟**,讀不到才去 heredoc 找」,而 CLAUDE.md 逐字規定的
    併行 commit 形狀是往一個**固定路徑**寫:

        printf '%s\n' "$MSG" > /private/tmp/msg.txt
        git commit -F /private/tmp/msg.txt -- <檔>

    ⇒ 那個路徑上很可能還躺著**上一條 lane 的訊息**。PreToolUse 跑在寫入**之前**,
      於是舊碼讀到的是**別人的位元組**,lint 它、標 `sure=True`、`rc=0`、**零輸出**
      —— ⭐ 一次**靜默的假驗證**:閘跑了,而它驗的不是要送出的那份訊息。
    ⇒ 修法是**先問「這一次的指令自己會不會寫那個檔」**:
        · 會,而 heredoc 給得出內文 ⇒ ⭐ 用 heredoc(那才是要送出的那份)
        · 會,但內文取不到(`$MSG` 展不開) ⇒ ⛔ **不可以拿磁碟上那份頂替** ⇒ 說「沒驗到」
        · ⛔ 不會 ⇒ 磁碟上那份就是訊息(前一個呼叫寫好的)⇒ 讀它
    """
    m = re.search(r"(?:-F|--file)[=\s]+(\S+)", _strip_heredocs(cmd))
    if m:
        raw = m.group(1).strip("\"'")
        p: Path | None = None
        if raw != "-":
            p = Path(raw)
            if not p.is_absolute():
                p = cwd / p
        hds = _heredocs(cmd)
        for tgt, body in hds:
            if p is None:                       # `-F -` ⇒ 訊息直接餵 stdin
                if tgt is None:
                    return (body, True)
            elif tgt is not None:
                t = Path(tgt)
                if not t.is_absolute():
                    t = cwd / t
                if t == p:
                    return (body, True)         # 這個 heredoc 寫的就是那個 `-F` 檔
        # ⭐⭐ heredoc 對不上。⇒ 先問「這一次的指令自己會不會寫那個檔」——
        #    會 ⇒ 磁碟上那份是**還沒被覆蓋的舊訊息**,⛔ 不可以拿它當這一次的訊息。
        if p is not None and not _command_writes_to(_strip_heredocs(cmd), p, cwd):
            try:
                return (p.read_text(encoding="utf-8", errors="replace"), True)
            except OSError:
                pass   # 檔不存在而指令也不寫它 ⇒ 往下走推論／「沒驗到」
        # ⭐ 對不到目標但**全指令只有一個 heredoc** ⇒ 幾乎一定是它
        #    (CLAUDE.md 自己的寫法 `MSG=$(cat <<'EOF' … )` 就落在這裡 —— 那一行沒有重導)。
        #    ⚠️ 只**警告** ⛔ 不擋:這一步是推論,而一個會誤擋的 hook 會被關掉。
        if len(hds) == 1:
            return (hds[0][1], False)
        return None
    # ⭐ `-m` 要收**每一個**(`-m 主旨 -m 內文` 的第二段以前完全沒被驗到)
    #   ⛔ 掃的是**剝掉 heredoc 內文**的指令:一段引用 `git commit -m "…"` 的訊息內文
    #   ⛔ 不是這一次要送出的訊息(它會同時造成誤擋與擋錯對象)。
    parts = [g[1:-1] for g in re.findall(
        r"(?:-m|--message)[=\s]+(\"(?:[^\"\\]|\\.)*\"|'[^']*')", _strip_heredocs(cmd))]
    return ("\n\n".join(parts), True) if parts else None


# ── ⭐⭐ `git` 與 `commit` **中間可以有東西**（GH#663,2026-08-29 對抗性複驗量到）──
#
# 舊的偵測式是 `\bgit\s+commit\b` ⇒ 只要中間插一個全域旗標就**整段跳過**,
# ⛔ 而且**一個字都不印** —— 實測 `git -C <dir> commit -m "…#A5…"` 與
# `git -c user.name=x commit …` 都是 `rc=0` 全靜。⭐ 那正是 `5c81bbec4` 這一批
# 逐字要消滅的形狀（「安靜的跳過與全過長得一樣」），而它在同一支 hook 裡還活著。
#
# ⚠️ 有趣的是 `git --git-dir=<…>/.git commit` **當時是擋得住的** —— ⛔ 不是設計,
#    是路徑尾巴的 `.git commit` 剛好餵飽了那個正則。⭐ 一條靠巧合綠的閘 ⇒ 不算閘。
_GIT_GLOBAL_OPT = (
    r"(?:-[cC]\s+\S+"                                    # -C <path> / -c <k=v>
    r"|--(?:git-dir|work-tree|namespace|exec-path|config-env)[=\s]\S+"
    r"|--[a-z][a-z-]*"                                   # --no-pager / --bare / --paginate…
    r"|-[a-zA-Z])"
)
_GIT_COMMIT = re.compile(r"\bgit\b(?:\s+" + _GIT_GLOBAL_OPT + r")*\s+commit\b")
#: ⭐ 兜底網:長得像 commit 但上面那條沒認出來 ⇒ ⛔ 不擋,但**要出聲**。
#: 要求同時出現訊息旗標,免得 `git log … | grep commit` 這種唯讀指令也在喊。
_GIT_COMMIT_LOOSE = re.compile(r"\bgit\b[^\n;|&]*\bcommit\b")
_MSG_FLAG = re.compile(r"(?:-F|--file|-m|--message)\b")


def main() -> int:
    try:
        ev = json.load(sys.stdin)
    except Exception:
        return 0
    tool = ev.get("tool_name", "")
    ti = ev.get("tool_input") or {}
    cwd = Path(ev.get("cwd") or REPO)
    if tool == "Bash" and os.environ.get("GGD_LANE_LOCK_OFF") != "1":
        hit = _LOCKED_RE.search(ti.get("command") or "")
        if hit and lane_marker(cwd):
            print(
                f"🔒 全域鎖:`pnpm {hit.group(1)}` ⛔ 不可以在 lane 的 worktree 裡跑。\n"
                f"   它寫 bundle.json/產生器產物 —— 落在這棵樹上主樹看不到,\n"
                f"   而 merge 回 main 之後主樹的 --check 會說 stale 且查不出是誰寫的。\n"
                f"   ⇒ 去**主樹** {REPO} 跑,或由主 session 收斂時統一跑一次。",
                file=sys.stderr,
            )
            return 2
    # ── 🏷️ commit 訊息的票號 / lane 代號（GH#663）────────────────────────────
    #
    # `scripts/commit-ref-lint.sh` 在 `9d634cfe` 就寫好了，⛔ **而沒有任何東西呼叫它** ——
    # 一支沒有掛上去的閘等於沒有閘（這份文件記錄過同型的五次）。
    # 票裡列的掛法有兩個:`.claude/settings.json`（lane Y 柵欄外）或
    # ⭐ 逐字：「或併入 `scripts/preserve-before-overwrite.py` 的 Bash 攔截段
    # —— 它已攔 git 指令」。⇒ 走這一條。
    #
    # ⚠️⚠️ **為什麼這一格是「擋」而不是「警告」**（票裡要求寫下分界與理由）：
    #   ⭐ commit 訊息在併行 lane 裡是**不可修的** —— CLAUDE.md 逐字禁止
    #      `git commit --amend`（它動的是 HEAD，而 HEAD 不屬於任何一條 lane）。
    #   ⇒ 一個寫壞的訊息**落地那一刻就是永久的**，警告完全沒有用：
    #      看到警告的時候 commit 已經跑完了。⇒ 唯一有效的時機是**送出之前**。
    #   ⛔ 而只擋 lint 自己判成硬紅的那一種（lane 代號形狀 / 快取重抓後仍對不到的票號）；
    #      「沒驗到」（離線、沒有快取）在那支腳本裡就是 exit 0 ⇒ 這裡自然放行。
    #   逃生口 `GGD_COMMITREF_OFF=1`（commit 訊息裡說為什麼）。
    if tool == "Bash" and os.environ.get("GGD_COMMITREF_OFF") != "1":
        _cmd = ti.get("command") or ""
        _cmd_nohd = _strip_heredocs(_cmd)
        if not _GIT_COMMIT.search(_cmd_nohd) and (
            _GIT_COMMIT_LOOSE.search(_cmd_nohd) and _MSG_FLAG.search(_cmd_nohd)
        ):
            # ⭐ 兜底網:它長得像一個帶訊息的 commit,而上面那條精確式沒認出來
            #    ⇒ ⛔ 不擋(我可能只是解析不了這個 shell 寫法),⭐ 但**要出聲**。
            print(
                "🏷️ ⚠️ commit 訊息**沒驗到**(GH#663,⛔ 不擋)——\n"
                "   這看起來是一個帶訊息的 `git commit`,而我解析不出它的形狀。\n"
                "   ⇒ 票號/lane 代號那道閘**這一次沒有跑**。要自己驗:\n"
                "      bash scripts/commit-ref-lint.sh --message-file <你的訊息檔>",
                file=sys.stderr,
            )
        if _GIT_COMMIT.search(_cmd_nohd):
            # ⭐ 訊息有**兩個住處**:磁碟上的 `-F` 檔,與指令字串裡的 heredoc。
            #    `commit_message_of()` 兩個都讀 —— 只讀前者就是 GH#663 的洞
            #    （98189e4f 的訊息與 commit 在同一個 Bash 呼叫裡,檔當下還不存在）。
            _found = commit_message_of(_cmd, cwd)
            _msg, _sure = _found if _found else (None, True)
            if not _msg and _MSG_FLAG.search(_cmd_nohd):
                # ⭐ 有帶訊息旗標卻**取不到內容**。兩種都落在這裡,而**兩種以前都是靜默的**:
                #    ① `printf '%s' "$MSG" > f && commit -F f` —— `$MSG` 在前一個呼叫
                #       就設好了,hook 展不開 shell 變數 ⇒ 結構上取不到。
                #    ② ⭐ 同上,而 `f` 那個固定路徑上**還躺著上一條 lane 的訊息** ——
                #       在此之前 hook 會把**那份舊位元組**拿去 lint 並標 `sure=True`
                #       ⇒ `rc=0`、零輸出 ⇒ 一次**假的驗證**(閘跑了,驗的不是這一份)。
                # ⛔ 兩種都**不擋**(它們完全合法),但也 ⛔ **不可以安靜地跳過** ——
                #    CLAUDE.md 逐字:「安靜的跳過與全過長得一樣」。⇒ 說出「沒驗到」。
                print(
                    "🏷️ ⚠️ commit 訊息**沒驗到**(GH#663,⛔ 不擋)——\n"
                    "   取不到**這一次要送出的**訊息內容。常見的兩種:\n"
                    "     · `printf '%s' \"$MSG\" > 檔` ＋ `-F 檔` —— hook 展不開 shell 變數,\n"
                    "       而磁碟上那一份是**還沒被覆蓋的舊訊息** ⇒ 拿它來驗等於沒驗;\n"
                    "     · 訊息從 stdin 進來而不是 heredoc(herestring、管道…)。\n"
                    "   ⇒ 票號/lane 代號那道閘**這一次沒有跑**。要自己驗:\n"
                    "      bash scripts/commit-ref-lint.sh --message-file <你的訊息檔>",
                    file=sys.stderr,
                )
            if _msg:
                try:
                    import subprocess as _sp
                    _r = _sp.run(
                        ["bash", "scripts/commit-ref-lint.sh", "--message-file", "/dev/stdin"],
                        input=_msg, capture_output=True, text=True, cwd=str(REPO), timeout=30,
                    )
                    if _r.returncode == 1 and not _sure:
                        # ⭐ 訊息是**推論**出來的（唯一的 heredoc,但它沒寫進那個 `-F` 檔）
                        #    ⇒ 出聲但⛔ 不擋 —— 一個會誤擋的 hook 會被關掉,
                        #      而被關掉的閘等於沒有閘。
                        print(
                            "🏷️ ⚠️ **commit 訊息疑似違規**(GH#663,⛔ 不擋 —— 這一份是推論的)——\n"
                            + (_r.stderr or "").rstrip() + "\n"
                            "   ⇒ 我讀的是指令裡**唯一的 heredoc**,而它沒有寫進那個 `-F` 檔。\n"
                            "      若它就是訊息,請先改掉再送出（落地之後 ⛔ 不可 `--amend`）。",
                            file=sys.stderr,
                        )
                    elif _r.returncode == 1:
                        print(
                            "🏷️ **commit 訊息擋下**(GH#663)——\n"
                            + (_r.stderr or "").rstrip() + "\n"
                            "   ⭐ 這一格擋而不只是警告,因為併行 lane ⛔ 禁止 `--amend`\n"
                            "      ⇒ 訊息落地就**改不掉了**,唯一有效的時機是送出之前。\n"
                            "   逃生口:GGD_COMMITREF_OFF=1（並在訊息裡說為什麼）。",
                            file=sys.stderr,
                        )
                        return 2
                    if (_r.stderr or "").strip():
                        print(_r.stderr.rstrip(), file=sys.stderr)  # 「沒驗到」也要出聲
                except Exception:
                    pass  # ⛔ lint 自身故障不可以癱瘓 commit
    # 🎫 開票規格(owner 2026-08-24):「開票要把 [acceptance criteria,] 及
    # [緊急][重要][優先] 的tag, 採用的 [思考策略] 與 [解決模板] 寫清楚」。
    # ⭐ 警告⛔ 不擋(exit 0):一張缺欄的票仍然比沒有票好,而被擋掉的開票
    #    會變成「算了不開了」—— 那正是這個 hook 要防的反面。
    #    完整檢查/回補工具:scripts/ticket-lint.sh
    if tool == "Bash":
        _cmd = ti.get("command") or ""
        if re.search(r"\bgh\s+issue\s+create\b", _cmd):
            _missing = []
            if not re.search(r"acceptance criteria|驗收標準|##\s*驗收", _cmd, re.I):
                _missing.append("驗收標準(acceptance criteria)")
            if not re.search(r"\[(緊急|重要|優先|一般)\]", _cmd):
                _missing.append("[緊急]/[重要]/[優先]/[一般] tag(標題)")
            if not re.search(
                r"\[(breaking change|fix|improve|feature|refactor|perf|docs|test|chore|bug|infra)\]",
                _cmd, re.I,
            ):
                _missing.append("[fix]/[feature]/[improve]/[breaking change] 類型 tag(標題)")
            if not re.search(r"\[思考策略\]|##\s*思考策略", _cmd):
                _missing.append("[思考策略]")
            if not re.search(r"\[解決模板\]|##\s*解決模板", _cmd):
                _missing.append("[解決模板]")
            # v3 追加的六節（owner:模板是**追加**不是取代）
            for _pat, _name in (
                (r"\bObjective\b", "Objective"),
                (r"\bScope\b", "Scope"),
                (r"Files\s*/?\s*modules|likely affected|影響檔案", "Files/modules affected"),
                (r"Implementation constraints|實作約束", "Implementation constraints"),
                (r"Test\s*/?\s*verification|驗證方式|##\s*驗證|verification criteria", "Test/verification criteria"),
            ):
                if not re.search(_pat, _cmd, re.I):
                    _missing.append(_name)
            # ⭐⭐ 2026-08-27（GH#808）:**同一批舊票被兩種切法接手兩次**。
            # 量到的:08-26 02:1x 開了一批「主題合併票」、03:2x 又開了一批「逐張接手票」,
            # 造出**四對重複**(#727⇄#737/#752 · #724⇄#738 · #726⇄#748 · #725⇄#741/#742)。
            # ⚠️ 它抓不到,因為**每張票的標題都自己成立、body 都自己完整** ——
            #    只有把 `接手 #N` 攤開比對才看得見。
            # ⇒ 新票的「接手 #N」清單若與**任何 open 票**的相交 ⇒ 喊出來(⛔ 仍不擋)。
            # ⭐⭐ 2026-08-27（GH#808 Scope 2 一起收）—— 抽取搬到 `_takeover_ids()`，
            #    詞彙表與 `ticket-lint.sh --dupes` 共用一份。三個實測到的修正：
            #    ① 分隔字元少了 `＋` ⇒「接手 #14＋#20」**只讀到 #14**（#727 正是這個寫法）
            #    ② 比對**只掃別人的標題** ⇒ 量到 `接手 #N` 標題 14 次 / **內文 21 次**，
            #       也就是漏掉了大多數 ⇒ 改成標題＋內文
            #    ③ 沒有剝引用 ⇒ 一張在**描述**重複的票（#808 自己）變成誤報
            _mine = _takeover_ids(_cmd)
            if _mine:
                try:
                    import subprocess as _sp
                    _raw = _sp.run(
                        ["gh", "issue", "list", "--state", "open", "--limit", "400",
                         "--json", "number,title,body"],
                        capture_output=True, text=True, timeout=20,
                    ).stdout
                    _clash = []
                    for _it in json.loads(_raw or "[]"):
                        _theirs = _takeover_ids(
                            (_it.get("title") or "") + "\n" + (_it.get("body") or "")
                        )
                        if _theirs & _mine:
                            _clash.append(f"#{_it['number']}（也接手 {sorted(_theirs & _mine)}）")
                    if _clash:
                        print(
                            "🎫 ⚠️ **接手重複**(GH#808):這張票要接手的舊票,已經有 open 票在接手了 ——\n"
                            "   " + " · ".join(_clash[:5]) + "\n"
                            "   ⇒ 先看那幾張:是要**合併**、還是這一張要**縮範圍**?\n"
                            "   ⛔ 兩張都留著 = 同一件事做兩次,而每張票自己看都是合理的。",
                            file=sys.stderr,
                        )
                except Exception:
                    pass  # gh 打不到就算了 —— ⛔ 這是提醒不是閘

            if _missing:
                print(
                    "🎫 開票規格警告(owner 2026-08-24,⛔ 不擋但要補):這張票缺 "
                    + " · ".join(_missing)
                    + "\n   ⇒ 開完用 scripts/ticket-lint.sh <票號> 驗,再 gh issue edit 補上。",
                    file=sys.stderr,
                )
    # 🚫 genguard:只攔 Write/Edit(手改)與 Bash 重導 —— 產生器不走這些路
    import os as _os
    tgts = targets(tool, ti, cwd)
    if _PARSE_NOTES:
        # ⭐ #791:解析不了就**放行並出聲**。⛔ 靜默的跳過與「全過」長得一樣。
        print(
            "🤷 hook:這道命令有我**解析不了**的重導目標 —— " + " · ".join(_PARSE_NOTES)
            + "\n   ⇒ 放行不擋(⛔ 一個會擋錯人的閘會被關掉,而被關掉的閘等於沒有閘)。",
            file=sys.stderr,
        )
    if _os.environ.get("GGD_GENGUARD_OFF") != "1":
        strict_norm = _os.environ.get("GGD_GENGUARD_NORMALIZER_STRICT") == "1"
        for p in tgts:
            hit = _generator_owner(p)
            # ⭐ 2026-08-26(owner:「追誤會的多個源頭」)——「無主」有兩種:
            #    檔案唯讀(444) = 隔離區鎖過 = **它是產物,只是戶籍表漏登**
            #    (量測洞:條件寫入端在已同步的樹上量到 0 寫,GH#771)。
            #    在此之前這一段對它**完全靜默放行** —— 連一個字都不印,
            #    而那正是「改產生物」一再發生的入口之一。
            if hit is None:
                try:
                    if p.exists() and not _os.access(p, _os.W_OK):
                        print(
                            f"🚫 genguard:{p} **鎖著(444)但戶籍無主** —— 它是產物,"
                            f"只是 sync-io 的量測漏了它(GH#771)。⛔ 不要手改。\n"
                            f"   ⇒ 找產生器: grep -rl \"{p.name}\" tools/ scripts/ | head\n"
                            f"   ⇒ 改**來源**,跑 bash scripts/genrun.sh <該步驟> 重生成。\n"
                            f"   真的要改(極罕見):GGD_GENGUARD_OFF=1,commit 訊息裡說為什麼。",
                            file=sys.stderr,
                        )
                        return 2
                except OSError:
                    pass
            if hit:
                owner, only_normalizer = hit
                if only_normalizer and not strict_norm:
                    # ⭐ 只有**正規化器**認領 ⇒ 這個檔不是它產生的,它只是就地改欄位。
                    #    放行,但要求改完跑一次那支(不然級距欄位與新內容不一致)。
                    print(
                        f"⚠️ genguard:{p} 會被正規化器 **{owner}** 就地改欄位,"
                        f"⛔ 但它不是那支產生器的產物 ⇒ **放行**。\n"
                        f"   ⚠️ 改完請跑一次 `pnpm {owner}`,讓級距/換算欄位跟著新內容重算。",
                        file=sys.stderr,
                    )
                    continue
                # ⭐⭐ GH#827:下面那句「改它的來源再重生成」對**一部分欄位是謊話** ——
                #    擁有者逐格保留它們,重跑不會動到,也沒有來源可以改。⇒ 先說出來。
                _un = _unowned_fields(p)
                if _un:
                    print(
                        f"⚠️⚠️ genguard:{p} 裡**這幾欄不是 {owner} 的**"
                        f"(量出來的,見 tools/parallel-gates/field-io.json):\n   {_un}\n"
                        f"   ⇒ 重跑 {owner} 不會動它們,也沒有「來源」可以改;寫入端寫在\n"
                        f"     tools/parallel-gates/field-probes.json 的 fieldAuthors。\n"
                        f"   ⚠️ 而整份是一個產物 ⇒ 那幾欄今天沒有任何合法寫入端(GH#827)。",
                        file=sys.stderr,
                    )
                print(
                    f"🚫 genguard:{p} 是產生器 **{owner}** 的產物 —— 手改會在下一次 "
                    f"skills:sync 被打回來(2026-08-23 一晚中三次的錯)。\n"
                    f"   ⇒ 改它的**來源**(tools/ 或上游 content),然後 `bash scripts/genrun.sh {owner.replace(':check',':build')}` 重生成\n"
                    f"   (genrun = 解鎖該支的產物→跑→重新上鎖;產物平時 chmod 444,見 product-quarantine.sh)。\n"
                    f"   真的要改產物(極罕見):GGD_GENGUARD_OFF=1,並在 commit 訊息裡說為什麼。",
                    file=sys.stderr,
                )
                return 2
    # ⭐ 命名慣例 `{用途}_temp_{時間戳}`（owner 2026-08-20）——
    # 清理 docs/ 的時候一眼就看得出「這是暫存的，過時了可以進 legacy」。
    stamp = "overwrite_temp_" + time.strftime("%Y%m%d-%H%M%S")
    lines: list[str] = []
    for p in tgts:
        try:
            if not p.is_file():
                continue
        except OSError:
            continue
        why = needs_backup(p)
        if why is None:
            lines.append(f"{stamp}\t{tool}\tSKIP(git 有)\t{p}\t")
            continue
        where = preserve(p, why, stamp, tool)
        lines.append(f"{stamp}\t{tool}\t{why}\t{p}\t{where}")
    if lines:
        # ⭐⭐ 帳本寫不進去**不可以殺掉這支 hook**（2026-09-01 量到）。
        #
        # ⚠️ 這個檔頭逐字承諾「這支 hook **永遠不擋工具**（exit 0）—— 一個會擋人的
        #   備份 hook 會被關掉，而被關掉的閘等於沒有閘」。⛔ 而在此之前，
        #   帳本一旦變成唯讀（隔離區掃到它、或一次手滑的 chmod），這裡就
        #   **擲 PermissionError ⇒ 整支 hook rc=1** —— ⭐ 它自己變成了那個會擋人的東西。
        #
        # ⚠️ 而它真的發生了：`_ledger.tsv` 被鎖成 444（genguard：「鎖著但戶籍無主」），
        #   於是 `laneYCommitRefHookMounted` 的「這條完全合法」那一條紅了 —— ⭐ 而症狀
        #   長得像「hook 誤擋合法指令」，⛔ 根因卻是**帳本的權限**。
        #
        # ⭐ 留底**已經做完了**（`preserve()` 在上面）⇒ 帳本寫不進去只損失**紀錄**，
        #   ⛔ 不損失副本。⇒ 出聲，然後放行（fail-open 沒錯，靜默才是缺陷）。
        try:
            LOG.parent.mkdir(parents=True, exist_ok=True)
            with LOG.open("a", encoding="utf-8") as f:
                f.write("\n".join(lines) + "\n")
        except OSError as e:
            print(
                f"⚠️ 覆蓋帳本寫不進去（{e.__class__.__name__}）—— ⭐ 副本**已經留了**，"
                f"⛔ 只是這幾筆沒記進 {LOG}。\n"
                f"   ⇒ 多半是它被鎖成唯讀：chmod u+w {LOG}",
                file=sys.stderr,
            )
        kept = [l for l in lines if "SKIP" not in l]
        if kept:
            print(f"🗄  覆蓋前已留底 {len(kept)} 份 → docs/legacy/_overwrites/{stamp}/", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
