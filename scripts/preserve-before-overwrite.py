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
import json, os, re, shutil, subprocess, sys, time
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


def git(*a: str) -> tuple[int, str]:
    r = subprocess.run(("git", *a), cwd=REPO, capture_output=True, text=True)
    return r.returncode, r.stdout.strip()


def needs_backup(p: Path) -> str | None:
    """回傳理由字串代表要備份;None 代表 git 已經有一份。"""
    try:
        rel = p.resolve().relative_to(REPO)
    except (ValueError, OSError):
        return "repo 外"
    code, out = git("status", "--porcelain", "--", str(rel))
    if code != 0:
        return "git 讀不到"
    if not out:
        code, _ = git("ls-files", "--error-unmatch", str(rel))
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


def targets(tool: str, ti: dict, cwd: Path) -> list[Path]:
    out: list[Path] = []
    if tool in ("Write", "Edit"):
        fp = ti.get("file_path")
        if fp:
            out.append(Path(fp))
    elif tool == "Bash":
        cmd = ti.get("command") or ""
        if "<<" in cmd:  # heredoc 的分隔符不是檔案
            cmd = re.sub(r"<<-?\s*'?\w+'?", " ", cmd)
        for pat in PATTERNS:
            for m in pat.finditer(cmd):
                tok = m.group(1)
                if tok.startswith("$") or tok in ("/dev/null", "/dev/stdout", "/dev/stderr"):
                    continue
                out.append(Path(tok) if tok.startswith("/") else cwd / tok)
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
NORMALIZER_STEPS = frozenset({"tiers:apply", "apconv:build", "apdmg:build", "prose:apply"})


def _generator_owner(p: Path) -> tuple[str, bool] | None:
    """`(步驟名, 是不是只有正規化器認領)`;沒有人認領回 None。"""
    try:
        io_path = REPO / "tools/parallel-gates/sync-io.json"
        data = json.loads(io_path.read_text(encoding="utf-8"))
        rel = str(p.resolve()).replace(str(REPO) + "/", "")
        claimants: list[str] = []
        for step in data.get("steps", []):
            for w in step.get("writes", []):
                if rel == w or (w.endswith("/") and rel.startswith(w)):
                    name = step.get("name") or "?"
                    if name not in claimants:
                        claimants.append(name)
                    break
        if not claimants:
            return None
        authors = [c for c in claimants if c not in NORMALIZER_STEPS]
        if authors:
            return (authors[0], False)
        return (claimants[0], True)
    except Exception:
        return None  # 表讀不到 ⇒ 不擋(⛔ hook 自身故障不可以癱瘓所有編輯)


def main() -> int:
    try:
        ev = json.load(sys.stdin)
    except Exception:
        return 0
    tool = ev.get("tool_name", "")
    ti = ev.get("tool_input") or {}
    cwd = Path(ev.get("cwd") or REPO)
    # 🚫 genguard:只攔 Write/Edit(手改)與 Bash 重導 —— 產生器不走這些路
    import os as _os
    if _os.environ.get("GGD_GENGUARD_OFF") != "1":
        strict_norm = _os.environ.get("GGD_GENGUARD_NORMALIZER_STRICT") == "1"
        for p in targets(tool, ti, cwd):
            hit = _generator_owner(p)
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
                print(
                    f"🚫 genguard:{p} 是產生器 **{owner}** 的產物 —— 手改會在下一次 "
                    f"skills:sync 被打回來(2026-08-23 一晚中三次的錯)。\n"
                    f"   ⇒ 改它的**來源**(tools/ 或上游 content),然後跑 pnpm {owner.replace(':check',':build')} 重生成。\n"
                    f"   真的要改產物(極罕見):GGD_GENGUARD_OFF=1,並在 commit 訊息裡說為什麼。",
                    file=sys.stderr,
                )
                return 2
    # ⭐ 命名慣例 `{用途}_temp_{時間戳}`（owner 2026-08-20）——
    # 清理 docs/ 的時候一眼就看得出「這是暫存的，過時了可以進 legacy」。
    stamp = "overwrite_temp_" + time.strftime("%Y%m%d-%H%M%S")
    lines: list[str] = []
    for p in targets(tool, ti, cwd):
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
        LOG.parent.mkdir(parents=True, exist_ok=True)
        with LOG.open("a", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
        kept = [l for l in lines if "SKIP" not in l]
        if kept:
            print(f"🗄  覆蓋前已留底 {len(kept)} 份 → docs/legacy/_overwrites/{stamp}/", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
