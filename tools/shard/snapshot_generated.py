#!/usr/bin/env python3
"""GH#467 的**安全網**：分片前後，產生器的產出必須逐位元組相同。

⚠️ 基準取自**凍結的 commit**（預設 HEAD），⛔ 不是工作樹 ——
分片進行時工作樹會同時被別的 lane 編輯，拿它當基準等於拿一個會動的尺量東西。

  python3 tools/shard/snapshot_generated.py --save          # 存基準（從 HEAD）
  python3 tools/shard/snapshot_generated.py --compare       # 拿現在的工作樹比對基準

⭐ 它比的是**產生器的產出**（那 20 位英雄的技能 JSON），⛔ 不是產生器的原始碼 ——
分片本來就會讓原始碼長得完全不一樣，會變的**只能**是原始碼。
"""
from __future__ import annotations
import hashlib, json, subprocess, sys, tempfile, shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "docs/legacy/shard-baseline_temp"
GEN = "tools/skill-remake/batch1.py"


def sh(*a: str, cwd: Path | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(a, cwd=cwd or ROOT, capture_output=True, text=True)


def owned_ids() -> list[str]:
    """產生器擁有哪些技能 —— 從**它自己的產出**推導,⛔ 不抄一份會過期的清單。"""
    r = sh("python3", GEN, "--list")
    if r.returncode == 0 and r.stdout.strip():
        return sorted(x.strip() for x in r.stdout.split() if x.strip())
    # 沒有 --list 就退回:掃它在原始碼裡點名的 id
    src = (ROOT / GEN).read_text(encoding="utf-8", errors="replace")
    import re
    return sorted(set(re.findall(r"godie-[a-z0-9]+", src)))


def fingerprint(ids: list[str], tree: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    for i in ids:
        for p in sorted((tree / "content/abilities").glob(f"{i}.*.json")):
            out[p.name] = hashlib.sha256(p.read_bytes()).hexdigest()[:16]
    return out


def save() -> int:
    tmp = Path(tempfile.mkdtemp(prefix="ggd-shard-base-"))
    try:
        # ⭐ 從 HEAD 導出一棵乾淨的樹,⛔ 不碰工作區。
        # ⚠️ `git archive` 吐的是**二進位 tar**,⛔ 不可以用 text=True 解碼
        # (content/ 底下有 png,一定會炸 UnicodeDecodeError)。直接接管線。
        rc = subprocess.run(
            f'git archive --format=tar HEAD | tar -x -C "{tmp}"',
            shell=True, cwd=ROOT, capture_output=True).returncode
        if rc != 0:
            print("git archive 失敗", file=sys.stderr); return 1
        ids = owned_ids()
        fp = fingerprint(ids, tmp)
        BASE.mkdir(parents=True, exist_ok=True)
        head = sh("git", "rev-parse", "--short", "HEAD").stdout.strip()
        (BASE / "baseline.json").write_text(
            json.dumps({"head": head, "ids": ids, "files": fp}, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8")
        print(f"✓ 基準存好（HEAD {head}）：{len(ids)} 個 id / {len(fp)} 份 JSON")
        print(f"  {BASE / 'baseline.json'}")
        return 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def compare() -> int:
    f = BASE / "baseline.json"
    if not f.exists():
        print("⛔ 還沒有基準 —— 先跑 --save", file=sys.stderr); return 2
    b = json.loads(f.read_text(encoding="utf-8"))
    now = fingerprint(b["ids"], ROOT)
    drift = [k for k in sorted(set(b["files"]) | set(now)) if b["files"].get(k) != now.get(k)]
    if not drift:
        print(f"✓ {len(now)} 份產出與基準（HEAD {b['head']}）**逐位元組相同**")
        return 0
    print(f"⛔ {len(drift)} 份與基準不同：")
    for k in drift[:40]:
        print(f"    {k}  {b['files'].get(k,'（基準沒有）')} → {now.get(k,'（現在沒有）')}")
    return 1


if __name__ == "__main__":
    sys.exit(save() if "--save" in sys.argv else compare() if "--compare" in sys.argv
             else (print(__doc__) or 2))
