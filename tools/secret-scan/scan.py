#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
secret-scan —— 掃這個 **public** repo 有沒有金鑰／登入憑證／不該公開的資料。

⭐ 它是一道**閘**（有發現就回非零），⛔ 不是一份要記得看的報告。

三個模式（⭐ 分母不一樣,⛔ 不可互相代替）：
  --worktree  （預設）追蹤中的檔案 —— 「現在 push 出去會洩漏什麼」
  --staged    已 stage 的內容      —— pre-commit 用
  --history   **所有 blob**        —— 「歷史上曾經洩漏過什麼」（刪掉也還在）

⚠️⚠️ 校準（CLAUDE.md 第一守則「一把只驗過單邊的尺,不算自證過」）：
每次掃描**之前**先跑 calibrate(),而且驗**兩個方向** ——
  ① 已知**有**的量得到：每一條規則要抓得到自己的檢體（rules.tsv 的 specimen）
  ② 已知**沒有**的量不到：一份乾淨的對照檔不可以命中任何一條
任一方向失敗 ⇒ exit 3,⭐ 這把尺的**一切結論作廢**（⛔ 不是「大概還能用」）。
"""
from __future__ import annotations
import argparse, os, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RULES = Path(__file__).parent / "rules.tsv"
ALLOW = Path(__file__).parent / "allowlist.tsv"
PUBLIC = Path(__file__).parent / "known-public.tsv"
HOSTS = Path(__file__).parent / "hosts.local.tsv"  # ⛔ 不進 git
HISTORY_BLOB_CAP = 1 << 20  # 1 MiB —— 比這大的是資料傾印,⛔ 不是憑證

# POSIX 字元類 → Python re（規則表刻意寫成 ERE,好讓它也能直接餵 grep -E）
_POSIX = {
    "[:space:]": r"\s", "[:alpha:]": r"a-zA-Z", "[:digit:]": r"0-9",
    "[:alnum:]": r"a-zA-Z0-9", "[:upper:]": r"A-Z", "[:lower:]": r"a-z",
    "[:xdigit:]": r"0-9a-fA-F", "[:punct:]": r"!-/:-@\[-`{-~",
}


def ere_to_py(rx: str) -> str:
    for k, v in _POSIX.items():
        rx = rx.replace(k, v)
    return rx


class Rule:
    __slots__ = ("id", "kind", "rx", "specimen", "why", "cre")

    def __init__(self, rid, kind, rx, specimen, why):
        self.id, self.kind, self.rx = rid, kind, rx
        self.specimen, self.why = specimen, why
        self.cre = re.compile(ere_to_py(rx))


def _rows(path: Path, ncols: int):
    for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) != ncols:
            sys.exit(f"⛔ {path.name}:{n} 欄位數 {len(parts)} ≠ {ncols}（欄位分隔是 TAB）")
        yield n, [p.strip() for p in parts]


#: ⭐ 檢體裡的**零寬接合標記**。載入時拿掉,檔案裡就永遠不含連續的憑證形狀。
#  ⚠️ 為什麼要這個:GitHub **Push Protection** 會掃 push 的內容,而一個
#  「長得像 AWS key 的校準檢體」跟真的 key **在偵測器眼裡一模一樣** ⇒ 整個 push 被擋。
#  （2026-09-11 實際被擋:AWS×2 · Slack×2 · HuggingFace）⭐ 而它擋得對 ——
#  ⛔ 我不能要求全世界的掃描器相信「這一個是假的」。
SPLICE = "{{}}"


def load_rules() -> list[Rule]:
    rules = []
    for n, (rid, kind, rx, spec, why) in _rows(RULES, 5):
        spec = spec.replace(SPLICE, "")
        if kind not in ("content", "path", "infra"):
            sys.exit(f"⛔ rules.tsv:{n} kind 只能是 content|path|infra")
        rules.append(Rule(rid, kind, rx, spec, why))
    if not rules:
        sys.exit("⛔ rules.tsv 是空的 —— 一把沒有規則的尺永遠是綠的")
    return rules


def load_allow() -> list[tuple[str, re.Pattern, str]]:
    out = []
    for n, (rid, prx, reason) in _rows(ALLOW, 3):
        if len(reason) < 12:
            sys.exit(f"⛔ allowlist.tsv:{n} 理由太短 —— 要寫得出一個**能被反駁**的理由")
        out.append((rid, re.compile(ere_to_py(prx)), reason))
    return out


def load_public() -> list[tuple[str, str]]:
    out = []
    for n, (lit, why) in _rows(PUBLIC, 2):
        lit = lit.replace(SPLICE, "")
        if len(lit) < 12:
            sys.exit(f"⛔ known-public.tsv:{n} 字面值只有 {len(lit)} 字 —— 太短會把整條規則關掉")
        if len(why) < 12:
            sys.exit(f"⛔ known-public.tsv:{n} 理由太短")
        out.append((lit, why))
    return out


def is_public(pub, text: str) -> str | None:
    for lit, why in pub:
        if lit in text:
            return why
    return None


def allowed(allow, rid: str, path: str) -> str | None:
    for arid, prx, reason in allow:
        if (arid == "*" or arid == rid) and prx.search(path):
            return reason
    return None


def load_host_rules() -> tuple[list[Rule], str | None]:
    """⭐ 我們自己主機的位址從**不進 git** 的 hosts.local.tsv 長成規則。

    ⚠️ 把它們寫進 rules.tsv 等於**為了偵測洩漏而再洩漏一次** —— rules.tsv 在 git 裡。
    ⛔ 檔案不在時**不是**靜默跳過:回一句要印出來的話,說「這一族沒有在驗」。
    """
    if not HOSTS.exists():
        return [], ("⚠️ 沒有 tools/secret-scan/hosts.local.tsv ⇒ ⭐ **主機位址那一族沒有在驗**"
                    "（通用的 ssh 帳號@主機／私鑰檔名仍然有驗）。"
                    "\n   修法：cp tools/secret-scan/hosts.local.tsv.example "
                    "tools/secret-scan/hosts.local.tsv 然後填它")
    rules = []
    for n, (rid, val, what) in _rows(HOSTS, 3):
        if "<" in val or len(val) < 7:
            sys.exit(f"⛔ hosts.local.tsv:{n} 還留著佔位值 `{val}` —— 填它或刪掉這一列")
        rules.append(Rule(f"host-{rid}", "infra",
                          f"(^|[^0-9A-Za-z.-]){re.escape(val)}([^0-9A-Za-z.-]|$)",
                          f" {val} ", f"{what}（來自 hosts.local.tsv）"))
    return rules, None


# ───────────────────────── 校準（兩個方向） ─────────────────────────
CONTROL = (
    "// 一份刻意乾淨的對照檔：像憑證但不是。\n"
    "const apiBase = process.env.GGD_API_BASE ?? 'http://127.0.0.1:2567';\n"
    "const cooldownTier = '極大'; const damage = 6000; // 五級距\n"
    "export const token = 'hook:onDeath';\n"
    "const sha = 'e3b0c44298fc1c149afbf4c8996fb924';\n"
)


def calibrate(rules: list[Rule], pub=()) -> list[str]:
    """回傳失敗訊息清單（空 = 這把尺兩個方向都量得準）。"""
    bad = []
    # ① 已知有的量得到
    for r in rules:
        probe = r.specimen if r.kind == "content" else r.specimen
        if not r.cre.search(probe):
            bad.append(f"① 規則 {r.id} 抓不到自己的檢體 → 它在真的洩漏面前也會沉默")
    # ② 已知沒有的量不到
    for r in rules:
        if r.kind == "path":
            continue
        for ln, line in enumerate(CONTROL.splitlines(), 1):
            if r.cre.search(line):
                bad.append(f"② 規則 {r.id} 在乾淨對照檔第 {ln} 行誤報 → 它會把噪音淹過真訊號")
    # ④ ⭐ **兩個引擎都要吃得下同一條 regex**。
    #    ⚠️ 掃描分兩條路:工作樹／staged 走 `git grep -E`（POSIX ERE),
    #    歷史／commit／gh／probe 走 Python `re`。Python 有 lookahead 而 ERE **沒有**
    #    ⇒ 一條用了 `(?!…)` 的規則會**校準全綠而工作樹掃描整條爆掉**。
    #    （2026-09-11 實際寫出來過一條,而前三個方向都說它是好的。)
    for r in rules:
        if r.kind == "path":
            continue
        chk = subprocess.run(["git", "grep", "-I", "-E", "-e", r.rx, "--", ":!*"],
                             cwd=ROOT, capture_output=True, text=True, errors="replace")
        if chk.returncode > 1:   # 0=有命中 1=沒命中 >1=regex 本身不合法
            bad.append(f"④ 規則 {r.id} 的 regex `git grep -E` 吃不下 → "
                       f"工作樹掃描會整條失效：{chk.stderr.strip()[:120]}")
    # ③ 公開值表 ⛔ 不可以把任何一條規則的檢體吃掉（吃掉 = 那條規則靜默失效）
    for r in rules:
        why = is_public(pub, r.specimen)
        if why:
            bad.append(f"③ 規則 {r.id} 的檢體被 known-public 吃掉 → 這條規則實際上關掉了")
    return bad


# ───────────────────────── 掃描 ─────────────────────────
def git(*args, ok=(0,)) -> str:
    """⚠️ 預設**失敗就死**。`git grep` 沒命中回 1 是正常的,那種呼叫要自己傳 ok=(0,1)。

    ⛔ 在此之前這支只回 `p.stdout` 而不看離開碼 —— 2026-09-11 的實例：
    `--batch-check` 少了 `=` ⇒ git 報錯到 stderr ⇒ 這支回空字串 ⇒
    歷史模式量到「0 個 blob」而印出 ✅ 零發現。⭐ 一個結構上失明的閘。
    """
    p = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True,
                       errors="replace")
    if p.returncode not in ok:
        sys.exit(f"⛔ git {' '.join(args[:3])}… 回 {p.returncode}：{p.stderr.strip()[:300]}")
    return p.stdout


def scan_paths(rules, allow, paths, findings):
    for r in (x for x in rules if x.kind == "path"):
        for p in paths:
            if r.cre.search(p):
                why = allowed(allow, r.id, p)
                if not why:
                    findings.append((r, p, 0, os.path.basename(p)))


def scan_content(rules, allow, pub, cached: bool, findings, paths=None):
    # ⚠️ 樣式一律走 `-e` —— `-----BEGIN … PRIVATE KEY-----` 以 `-` 開頭,
    #    ⛔ 不帶 `-e` 會被 git 當成**選項**而整條規則靜默失效
    #    （2026-09-11 實際踩到:最高風險的私鑰那兩條一直是死的,而輸出是「✅ 零發現」)。
    base = ["grep", "-I", "-n", "-E"] + (["--cached"] if cached else [])
    for r in (x for x in rules if x.kind in ("content", "infra")):
        # ⚠️ `--cached` 掃的是**整個 index**,⛔ 不是「這次 staged 的那幾個檔」——
        #    ⇒ 一行的 commit 也要 34 秒。⭐ 而一個 34 秒的 pre-commit 會被關掉,
        #    而被關掉的閘等於沒有閘（2026-09-11 實測）。⇒ staged 模式逐檔限定範圍。
        scope = ["--", *paths] if paths else ["--", "."]
        out = git(*base, "-e", r.rx, *scope, ok=(0, 1))
        for line in out.splitlines():
            parts = line.split(":", 2)
            if len(parts) != 3:
                continue
            path, lno, text = parts
            if not allowed(allow, r.id, path) and not is_public(pub, text):
                findings.append((r, path, lno, text.strip()[:160]))  # 判定用整行 text


def scan_history(rules, allow, pub, findings, quiet=False):
    """⭐ 一次 pass 掃**所有 blob** —— 刪掉的檔案仍在歷史裡。"""
    listing = git("cat-file", "--batch-all-objects",
                  "--batch-check=%(objecttype) %(objectname) %(objectsize)")
    rows = [l.split() for l in listing.splitlines() if l.startswith("blob")]
    blobs = [(sha, int(sz)) for _t, sha, sz in rows if int(sz) <= HISTORY_BLOB_CAP]
    total = len(blobs)
    # ⭐ 結構性自證：一個有歷史的 repo ⛔ 不可能只有 0 個 blob。
    #    量到 0 ⇒ 是**列舉壞了**,⛔ 不是「歷史很乾淨」—— 這兩者的輸出長得一模一樣。
    if not rows:
        sys.exit("🚨 歷史列舉回 0 個 blob —— ⭐ 這是列舉壞了,⛔ 不是零發現。結論作廢。")
    if not quiet:
        print(f"  歷史 blob：{total} 個可掃 / {len(rows)} 個總計"
              f"（已略過 >1MiB 的資料傾印）", file=sys.stderr)
    crules = [r for r in rules if r.kind in ("content", "infra")]
    hits: dict[str, dict[str, str]] = {}
    proc = subprocess.Popen(["git", "cat-file", "--batch"], cwd=ROOT,
                            stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    assert proc.stdin and proc.stdout
    for i, (sha, _sz) in enumerate(blobs):
        # ⚠️ **每一筆都要 flush**：這是嚴格的一問一答協定,寫進緩衝區而不送出
        #    ⇒ git 收不到 ⇒ 它不產出 ⇒ 我的 readline() 永遠等 ⇒ **雙邊死鎖**
        #    （2026-09-11 實際踩到：兩個 process 都 0% CPU 卡 10 分鐘）
        proc.stdin.write((sha + "\n").encode())
        proc.stdin.flush()
        if not quiet and i and i % 20000 == 0:
            print(f"  …{i}/{total}", file=sys.stderr, flush=True)
        hdr = proc.stdout.readline().split()
        if len(hdr) != 3:
            break
        body = proc.stdout.read(int(hdr[2]))
        proc.stdout.read(1)
        if b"\0" in body[:8000]:
            continue
        txt = body.decode("utf-8", "replace")
        for r in crules:
            m = r.cre.search(txt)
            if not m:
                continue
            ls = txt.rfind("\n", 0, m.start()) + 1
            le = txt.find("\n", m.end())
            # ⚠️ **判定讀整行,截斷只給顯示用** —— 2026-09-11 踩到：
            #    `[:160]` 先切,於是第 170 字元的 `REDACTED_TEST_PASSWORD` 比對不到
            #    ⇒ 5 筆誤報活下來。⭐ 一個為了排版做的動作改變了結論。
            line = txt[ls:(len(txt) if le < 0 else le)].strip()
            if is_public(pub, line):
                continue
            hits.setdefault(sha, {})[r.id] = line[:160]
    proc.stdin.close()
    proc.wait()
    byid = {r.id: r for r in rules}
    names: dict[str, str] = {}
    if hits:  # 只有真的命中才值得跑一次全 repo 物件列舉
        for line in git("rev-list", "--objects", "--all").splitlines():
            sha_, _, name = line.partition(" ")
            if name and sha_ in hits:
                names.setdefault(sha_, name)
    for sha, rids in hits.items():
        path = names.get(sha, f"(unreachable-blob {sha[:12]})")
        where = git("log", "--all", "--oneline", "-1",
                    f"--find-object={sha}", ok=(0, 1)).strip()
        for rid, line in rids.items():
            if not allowed(allow, rid, path):
                findings.append((byid[rid], path, 0,
                                 f"{line}\n        ↳ blob {sha[:12]} · {where[:70]}"))


def _scan_text(rules, allow, pub, where: str, text: str, findings):
    """把任意一段文字餵給同一組規則。⭐ 規則不變,⛔ 只是換一個來源。"""
    for r in (x for x in rules if x.kind in ("content", "infra")):
        for ln, line in enumerate(text.splitlines(), 1):
            if r.cre.search(line) and not allowed(allow, r.id, where) \
                    and not is_public(pub, line):
                findings.append((r, where, ln, line.strip()[:160]))


def scan_commits(rules, allow, pub, findings, quiet=False):
    """⭐ commit 訊息與 repo 內容一樣公開,⛔ 而它從來不是一個 blob。"""
    # ⚠️ 分隔符⛔不可以是 \x00 —— 它進不了 argv（ValueError: embedded null byte）。
    #    ⭐ 用 ASCII RS (\x1e)：commit 訊息裡不會有它。
    SEP = "\x1e"
    out = git("log", "--all", "--no-merges", "--format=%H%x01%B%x1e")
    n = 0
    for chunk in out.split(SEP):
        chunk = chunk.strip("\n")
        if "\x01" not in chunk:
            continue
        sha, _, body = chunk.partition("\x01")
        n += 1
        _scan_text(rules, allow, pub, f"commit {sha.strip()[:12]}", body, findings)
    if not n:
        sys.exit("🚨 commit 列舉回 0 筆 —— ⭐ 列舉壞了,⛔ 不是零發現。")
    if not quiet:
        print(f"  commit 訊息：{n} 筆", file=sys.stderr)


def scan_github(rules, allow, pub, findings, quiet=False):
    """⭐ issue／PR 的標題、內文與每一則留言 —— 它們跟 repo 一樣公開。"""
    import json
    url = git("remote", "get-url", "origin").strip()
    slug = url.split("github.com", 1)[-1].lstrip(":/").removesuffix(".git")
    if slug.count("/") != 1:
        sys.exit(f"⛔ 認不出 GitHub repo（origin = {url}）")
    def api(path: str):
        p = subprocess.run(["gh", "api", "--paginate", f"repos/{slug}/{path}"],
                           cwd=ROOT, capture_output=True, text=True, errors="replace")
        if p.returncode != 0:
            sys.exit(f"⛔ gh api {path} 回 {p.returncode}：{p.stderr.strip()[:300]}\n"
                     "   ⭐ 這是**沒驗到**,⛔ 不是沒發現 —— 先 `gh auth login`。")
        # --paginate 會把每一頁的 JSON 陣列串起來,中間是 `][`
        return json.loads("[" + p.stdout.replace("][", ",").strip().lstrip("[").rstrip("]") + "]")
    total = 0
    for path, kind in (("issues?state=all&per_page=100", "issue/PR"),
                       ("issues/comments?per_page=100", "留言"),
                       ("pulls/comments?per_page=100", "審查留言")):
        rows = api(path)
        total += len(rows)
        if not quiet:
            print(f"  GitHub {kind}：{len(rows)} 筆", file=sys.stderr, flush=True)
        for row in rows:
            num = row.get("number") or row.get("issue_url", "").rsplit("/", 1)[-1]
            where = f"gh {kind} #{num}"
            for field in ("title", "body"):
                if row.get(field):
                    _scan_text(rules, allow, pub, f"{where} [{field}]", row[field], findings)
    if not total:
        sys.exit("🚨 GitHub 列舉回 0 筆 —— ⭐ 列舉壞了,⛔ 不是零發現。")


# ───────────────────────── 主程式 ─────────────────────────
def main() -> int:
    ap = argparse.ArgumentParser(description="掃 repo 的金鑰／憑證／敏感資料")
    m = ap.add_mutually_exclusive_group()
    m.add_argument("--worktree", action="store_true", help="追蹤中的檔案（預設）")
    m.add_argument("--staged", action="store_true", help="已 stage 的內容（pre-commit）")
    m.add_argument("--history", action="store_true", help="所有 blob（含已刪除）")
    m.add_argument("--commits", action="store_true", help="**commit 訊息**（⛔ 它不是 blob）")
    m.add_argument("--gh", action="store_true", help="**GitHub issue／PR／留言**（同樣公開）")
    ap.add_argument("--probe", metavar="檔案", help="只掃這一個檔（守衛用來驗尺沒瞎）")
    ap.add_argument("--calibrate", action="store_true", help="只跑校準自證")
    ap.add_argument("--infra", action="store_true",
                    help="改掃**登入方法／基礎設施**（ssh 帳號@主機 · 對外/內網 IP · 私鑰檔名)")
    ap.add_argument("--quiet", action="store_true")
    a = ap.parse_args()

    rules, allow, pub = load_rules(), load_allow(), load_public()
    host_rules, host_note = load_host_rules()
    rules += host_rules
    # ⭐ 兩個**互斥**的問題,⛔ 不是一個問題的兩個嚴重度:
    #    預設問「有沒有**憑證**外洩」（要能一眼看完並行動）
    #    --infra 問「公開了多少**登入路徑**」（幾百筆,是一份普查⛔不是一張待辦)
    want = {"infra"} if a.infra else {"content", "path"}
    if a.infra and host_note:
        print(host_note, file=sys.stderr)   # ⭐ fail-loud:⛔ 不靜默跳過一整族
    rules = [r for r in rules if r.kind in want]

    bad = calibrate(rules, pub)
    if bad:
        print("🚨 校準失敗 —— ⭐ 這把尺量不準,本次掃描的**一切結論作廢**：", file=sys.stderr)
        for b in bad:
            print(f"   ⛔ {b}", file=sys.stderr)
        return 3
    if a.calibrate:
        n = len(rules)
        print(f"✅ 校準通過：{n} 條規則**四個方向**都量得準（①各自抓得到檢體 "
              f"②乾淨對照檔零誤報 ③檢體沒被公開值表吃掉 ④git grep -E 與 Python re 都吃得下）")
        return 0

    mode = ("probe" if a.probe else "commits" if a.commits
            else "gh" if a.gh else "history" if a.history else "staged" if a.staged else "worktree")
    if not a.quiet:
        print(f"🔍 secret-scan [{mode}] · {len(rules)} 條規則 · "
              f"{len(allow)} 列豁免 + {len(pub)} 個公開範例值 · ✅ 校準已通過")

    findings: list = []
    if a.probe:
        txt = Path(a.probe).read_text(encoding="utf-8", errors="replace")
        scan_paths(rules, allow, [a.probe], findings)
        for r in (x for x in rules if x.kind in ("content", "infra")):
            for ln, line in enumerate(txt.splitlines(), 1):
                if (r.cre.search(line) and not allowed(allow, r.id, a.probe)
                        and not is_public(pub, line)):
                    findings.append((r, a.probe, ln, line.strip()[:160]))
    elif mode == "commits":
        scan_commits(rules, allow, pub, findings, a.quiet)
    elif mode == "gh":
        scan_github(rules, allow, pub, findings, a.quiet)
    elif mode == "history":
        scan_history(rules, allow, pub, findings, a.quiet)
    else:
        cached = mode == "staged"
        paths = [p for p in (git("diff", "--cached", "--name-only", "--diff-filter=ACMR")
                             .splitlines() if cached else git("ls-files").splitlines()) if p]
        if cached and not paths:
            print("✅ [staged] 沒有 staged 的檔案 ⇒ 沒東西可掃。")
            return 0
        scan_paths(rules, allow, paths, findings)
        scan_content(rules, allow, pub, cached, findings, paths if cached else None)

    if not findings:
        print(f"✅ [{mode}] 零發現。")
        return 0

    by_rule: dict[str, list] = {}
    for r, path, lno, text in findings:
        by_rule.setdefault(r.id, []).append((r, path, lno, text))
    print(f"\n🚨 {len(findings)} 筆疑似敏感資料（{len(by_rule)} 條規則命中）：\n")
    for rid, rows in sorted(by_rule.items()):
        print(f"  ── {rid} —— {rows[0][0].why}（{len(rows)} 筆）")
        for _r, path, lno, text in rows[:12]:
            loc = f"{path}:{lno}" if lno else path
            print(f"     {loc}\n        {text}")
        if len(rows) > 12:
            print(f"     …另外 {len(rows) - 12} 筆")
        print()
    print("⛔ 誤報 ⇒ 在 tools/secret-scan/allowlist.tsv 補一列,"
          "並寫下一個**能被反駁**的理由（⛔ 不是「這是假的」）。")
    print("⭐ 真的洩漏 ⇒ ①先去該服務**撤銷／輪換**那把金鑰（⛔ 刪 commit 不等於失效）"
          " ②再處理 repo。")
    return 1


if __name__ == "__main__":
    sys.exit(main())
