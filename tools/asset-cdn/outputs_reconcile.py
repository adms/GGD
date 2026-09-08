#!/usr/bin/env python3
"""outputs/ → S3 對帳與逐檔可定址上傳。

⭐ 為什麼要這一支（⛔ 不是「再傳一次」）：
Codex 交接時 `coverage.jsonl` 把 279,523 檔標成 `s3_existing`,⭐ 而那個字的意思是
**這個檔的 sha256 被列在某個 tarball 的 manifest 裡**（`kind: s3_archive_member`）——
⛔ 不是「S3 上有這個物件」。兩件事差在哪很重要:

  · 封存（legacy/）  —— tarball 沒問題,owner 的裁決是「不對外開放下載使用」
  · 資源庫（assets/） —— ⛔ 網站沒有辦法從 `archive.tar.gz.part00042` 裡拿一顆 icon

⇒ 這一支做三件事,每一件都是**自動化的**（owner 2026-09-08:「不用每個都手動檢查」）:
  1. `verify-archives` —— 逐個 HEAD 那 206 個封存,證明它們**真的在**
  2. `stage` / `push`  —— 要對外服務的那一團改成 `assets/<sha[:2]>/<sha><ext>` 逐檔可定址
  3. `verify`          —— 抽驗:重新下載 + 比 sha256

⚠️ 這一支**只會 PUT**,⛔ 不刪任何東西（profile 本來也沒有刪除權限）。
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import random
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

BUCKET = os.environ.get("GGD_S3_BUCKET", "ggd-390630837668-ap-east-2-an")
REGION = os.environ.get("GGD_S3_REGION", "ap-east-2")
PROFILE = os.environ.get("AWS_PROFILE", "vibe-coding")
ROOT = pathlib.Path(
    os.environ.get(
        "GGD_OUTPUTS_ROOT",
        "/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT",
    )
)
COVERAGE = pathlib.Path(
    os.environ.get(
        "GGD_COVERAGE_JSONL",
        str(ROOT / "GGD-Asset-Library/backups/outputs-20260909/coverage.jsonl"),
    )
)
STAGE = pathlib.Path(os.environ.get("GGD_STAGE_DIR", "/Users/Takuro/ggd-s3-stage-outputs"))
OUT = pathlib.Path(__file__).resolve().parent / "outputs-reconcile"


def aws(*args: str, capture: bool = True) -> subprocess.CompletedProcess:
    env = {**os.environ, "AWS_PROFILE": PROFILE}
    return subprocess.run(
        ["aws", *args, "--region", REGION],
        capture_output=capture, text=True, env=env, check=False,
    )


def identity_ok() -> bool:
    r = aws("sts", "get-caller-identity")
    ok = r.returncode == 0 and "assumed-role/vibe-coding-s3-role/" in r.stdout
    if not ok:
        print(f"⛔ 身分不對 —— 預期 assumed-role/vibe-coding-s3-role/\n{r.stdout}{r.stderr}")
    return ok


def rows():
    """串流讀 coverage.jsonl（190 MB,⛔ 不整份載入）。"""
    with COVERAGE.open(encoding="utf-8", errors="replace") as fh:
        for line in fh:
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue


def uri_of(d: dict) -> str | None:
    loc = d.get("location") or {}
    return loc.get("manifest_uri") or loc.get("archive_uri") or loc.get("uri")


def head(uri: str) -> tuple[str, bool, str]:
    key = uri.split(f"{BUCKET}/", 1)[-1]
    r = aws("s3api", "head-object", "--bucket", BUCKET, "--key", key)
    return uri, r.returncode == 0, (r.stderr or "").strip().splitlines()[-1] if r.returncode else ""


def cmd_verify_archives(workers: int) -> int:
    """⭐ 逐個 HEAD 每一個被 coverage 引用的封存 —— ⛔ 不是相信那個欄位。"""
    seen: dict[str, int] = {}
    for d in rows():
        if d.get("coverage") != "s3_existing":
            continue
        u = uri_of(d)
        if u:
            seen[u] = seen.get(u, 0) + 1
    print(f"coverage 引用了 {len(seen)} 個封存,涵蓋 {sum(seen.values()):,} 個檔")
    missing = []
    with ThreadPoolExecutor(max_workers=workers) as ex:
        for uri, ok, err in ex.map(head, seen):
            if not ok:
                missing.append((uri, seen[uri], err))
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "archive-verify.json").write_text(
        json.dumps(
            {"archives": len(seen), "files_covered": sum(seen.values()),
             "missing": [{"uri": u, "files": n, "error": e} for u, n, e in missing]},
            ensure_ascii=False, indent=2),
        encoding="utf-8")
    if missing:
        print(f"⛔ {len(missing)} 個封存**不在 S3 上**,而 coverage 說它們在:")
        for u, n, e in missing[:10]:
            print(f"   {n:>8,} 檔  {u}\n            {e}")
        print(f"⇒ 那 {sum(n for _, n, _ in missing):,} 個檔的 `s3_existing` 是**假的**")
        return 1
    print(f"✓ {len(seen)} 個封存全部 HEAD 得到 ⇒ `s3_existing` 這 {sum(seen.values()):,} 檔的**憑據成立**")
    return 0


def wanted(under: str):
    """要逐檔可定址的那一團。sha256 直接用 coverage 裡量好的 ⇒ ⛔ 不重算。"""
    pref = f"outputs/{under}/"
    for d in rows():
        p = d.get("path", "")
        if p.startswith(pref) and d.get("status") == "hashed" and d.get("sha256"):
            yield d


def key_of(d: dict) -> str:
    sha = d["sha256"]
    return f"assets/{sha[:2]}/{sha}{os.path.splitext(d['path'])[1].lower()}"


def cmd_stage(under: str) -> int:
    """hardlink 成內容定址的名字 ⇒ ⭐ 零複製,而且同 sha 自然去重。"""
    if STAGE.exists():
        shutil.rmtree(STAGE)
    n = dup = miss = 0
    total = 0
    index: list[dict] = []
    for d in wanted(under):
        src = ROOT / d["path"]
        if not src.exists():
            miss += 1
            continue
        key = key_of(d)
        dst = STAGE / key
        if dst.exists():
            dup += 1
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        try:
            os.link(src, dst)
        except OSError:
            shutil.copy2(src, dst)
        n += 1
        total += d.get("bytes") or 0
        index.append({"key": key, "path": d["path"], "sha256": d["sha256"], "bytes": d.get("bytes")})
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"index-{under}.json").write_text(
        json.dumps({"under": under, "objects": n, "duplicate_sha": dup,
                    "missing_local": miss, "bytes": total, "entries": index},
                   ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✓ staged {n:,} 個物件 · {total/1e9:.2f} GB（同 sha 去重 {dup:,} · 本機找不到 {miss:,}）")
    print(f"  → {STAGE}")
    return 0


def cmd_push(apply: bool) -> int:
    if not (STAGE / "assets").is_dir():
        print("⛔ 還沒 stage")
        return 2
    if not identity_ok():
        return 2
    args = ["s3", "sync", str(STAGE / "assets"), f"s3://{BUCKET}/assets/", "--size-only", "--no-progress"]
    if not apply:
        args.append("--dryrun")
    r = aws(*args, capture=False)
    return r.returncode


def cmd_verify(under: str, n: int) -> int:
    """⭐ 抽驗:重新下載 + 比 sha256 —— ⛔ 不是「sync 沒報錯」。"""
    import hashlib
    idx = json.loads((OUT / f"index-{under}.json").read_text(encoding="utf-8"))["entries"]
    if not idx:
        print("⛔ 索引是空的")
        return 2
    picks = random.sample(idx, min(n, len(idx)))
    bad = 0
    tmp = pathlib.Path("/tmp/ggd-s3-verify.bin")
    for e in picks:
        # ⚠️ ⛔ 不要用 `aws s3 cp … -` 讀回來 —— capture 是 text 模式,
        #   ⭐ 而這些物件是二進位（png/glb/mp3）⇒ 量尺自己會 UnicodeDecodeError 而死。
        #   ⇒ 一律**落地成檔**再 hash。
        if tmp.exists():
            tmp.unlink()
        r2 = aws("s3", "cp", f"s3://{BUCKET}/{e['key']}", str(tmp))
        got = hashlib.sha256(tmp.read_bytes()).hexdigest() if (r2.returncode == 0 and tmp.exists()) else ""
        ok = got == e["sha256"]
        bad += 0 if ok else 1
        print(f"  {'✓' if ok else '⛔'} {e['key'][:46]}  {e['path'].split('/')[-1][:34]}")
    print(f"{'✓' if not bad else '⛔'} 抽驗 {len(picks)} 個 · 不符 {bad} 個")
    return 1 if bad else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("verify-archives").add_argument("--workers", type=int, default=16)
    s = sub.add_parser("stage"); s.add_argument("--under", required=True)
    p = sub.add_parser("push"); p.add_argument("--apply", action="store_true")
    v = sub.add_parser("verify"); v.add_argument("--under", required=True); v.add_argument("-n", type=int, default=12)
    a = ap.parse_args()
    if a.cmd == "verify-archives":
        return cmd_verify_archives(a.workers)
    if a.cmd == "stage":
        return cmd_stage(a.under)
    if a.cmd == "push":
        return cmd_push(a.apply)
    return cmd_verify(a.under, a.n)


if __name__ == "__main__":
    sys.exit(main())
