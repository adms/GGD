#!/usr/bin/env python3
"""素材上 S3 —— 內容定址上傳與對帳（GH#1116）。

owner 2026-09-08（逐字）：
  「資源庫 我覺得**不要進 git** 但可以**存到 S3 ggd-390630837668-ap-east-2-an**」
  「使用 S3 存資源庫 作為所有網站上下傳統一資源庫⋯只有我這台開發機保留一份及原始檔案、
   加工品、半成品等⋯加速下載而不會卡在網站本身速度」

⭐ key 形狀：`assets/<sha256[0:2]>/<sha256><ext>` —— **內容定址**。
   它一次買到四件事：永久快取（可宣告 immutable）· 自動去重 · 不必清 CDN 快取 · 版本共存。

⛔⛔ 金鑰：這支腳本**從不碰憑證**。它只設 `AWS_PROFILE`，讓 AWS CLI 自己解析。
   ⛔ 不讀 ~/.aws/credentials、⛔ 不接受環境變數裡的 key、⛔ 不印任何憑證。

⚠️⚠️ **`sync` 回 0 不等於「傳對了」** —— 它只代表送出去了。
   ⇒ 這支的 `--verify` 是**把位元組抓回來重算 sha256**，那才排除得掉「傳了但傳壞」。
   ⭐ 這是本專案「一把只驗過單邊的尺不算自證過」的直接應用。

⚠️ 這個角色**刻意沒有 DeleteObject**（owner 2026-09-08 設定）。
   ⭐ 那是設計，⛔ 不是缺陷：內容定址的東西刪一顆 ＝ 讓所有指著那個 sha 的舊版本破圖。
   ⇒ 收到 AccessDenied on DeleteObject ⇒ ⛔ 不要嘗試擴權，那是邊界。

用法：
    python3 tools/asset-cdn/upload.py            # 上傳缺的（先 dry-run 印計畫）
    python3 tools/asset-cdn/upload.py --apply    # 真的上傳
    python3 tools/asset-cdn/upload.py --check    # 閘：manifest 每一筆都在 S3 上（⛔ 唯讀）
    python3 tools/asset-cdn/upload.py --verify 12  # 抽 N 顆下載回來重算雜湊
"""
from __future__ import annotations

import hashlib
import json
import os
import pathlib
import random
import shutil
import subprocess
import tempfile
import sys

REPO = pathlib.Path(__file__).resolve().parents[2]
MANIFEST = REPO / "content" / "assets-manifest.json"
PROFILE = os.environ.get("GGD_S3_PROFILE", "vibe-coding")
REGION = os.environ.get("GGD_S3_REGION", "ap-east-2")
BUCKET = os.environ.get("GGD_S3_BUCKET", "ggd-390630837668-ap-east-2-an")
# ⚠️ ⛔ 不可以寫死 `/private/tmp`（GH#1003）—— 那是 macOS 專屬的，Linux 上建不出來
#   而且**是靜默失敗**：這支腳本在 CI 或伺服器上跑就會找不到暫存區。
STAGE = pathlib.Path(os.environ.get("GGD_S3_STAGE") or os.path.join(tempfile.gettempdir(), "ggd-cdn-stage"))
# ⭐ 一年 ＋ immutable —— 只有在 key 是內容定址時才成立（內容變了 key 就變）。
CACHE_CONTROL = "public, max-age=31536000, immutable"


def aws(*args: str, capture: bool = True) -> subprocess.CompletedProcess:
    """跑 aws CLI。⛔ 不注入任何憑證 —— 只給 profile 名字,讓 CLI 自己解析。"""
    env = {**os.environ, "AWS_PROFILE": PROFILE, "AWS_REGION": REGION}
    return subprocess.run(["aws", *args], capture_output=capture, text=not capture is False, env=env)


def identity_ok() -> bool:
    """⭐ owner 要求：動任何 AWS 之前先驗身分,ARN 必須含 assumed-role/vibe-coding-s3-role/。"""
    want = os.environ.get("GGD_S3_ROLE_SUBSTR", "assumed-role/vibe-coding-s3-role/")
    r = aws("sts", "get-caller-identity", "--query", "Arn", "--output", "text")
    arn = (r.stdout or "").strip()
    if r.returncode != 0 or want not in arn:
        # ⛔ 只印比對結果,⛔ 不印完整 ARN 以外的任何東西 —— 而 ARN 不是祕密。
        print(f"⛔ 身分不符：期望含 {want}，實得 {arn or '(取不到)'}", file=sys.stderr)
        return False
    return True


def entries() -> list[dict]:
    return json.loads(MANIFEST.read_text(encoding="utf-8"))["entries"]


def key_of(e: dict) -> str:
    sha = e["sha256"]
    return f"assets/{sha[:2]}/{sha}{os.path.splitext(e['path'])[1]}"


def local_of(e: dict) -> pathlib.Path:
    p = REPO / e["path"]
    if p.exists():
        return p
    # manifest 的 path 有兩種寫法（含不含 content/ 前綴）—— 兩種都試。
    return REPO / "content" / "assets" / e["path"].replace("content/assets/", "").replace("assets/", "")


def stage() -> tuple[int, int, int, int]:
    """把每一顆連結成內容定址的名字。⭐ 用 hardlink ⇒ 零複製,而且同 sha 自然去重。"""
    if STAGE.exists():
        shutil.rmtree(STAGE)
    seen: set[str] = set()
    made = dup = miss = size = 0
    for e in entries():
        src = local_of(e)
        if not src.exists():
            miss += 1
            continue
        k = key_of(e)
        if k in seen:
            dup += 1
            continue
        seen.add(k)
        dst = STAGE / k
        dst.parent.mkdir(parents=True, exist_ok=True)
        try:
            os.link(src, dst)
        except OSError:
            dst.write_bytes(src.read_bytes())
        made += 1
        size += e.get("bytes", 0)
    return made, dup, miss, size


def cmd_upload(apply: bool) -> int:
    if not identity_ok():
        return 2
    made, dup, miss, size = stage()
    print(f"⭐ 清單 {len(entries())} 筆 → 唯一 key {made} · 去重省下 {dup} · ⛔ 檔案找不到 {miss}")
    print(f"   待同步 {size / 1048576:.1f} MB → s3://{BUCKET}/assets/")
    if miss:
        print("⛔ 有檔案找不到 —— 先修 manifest 或補檔,⛔ 不要傳一半", file=sys.stderr)
        return 1
    if not apply:
        print("（dry-run；加 --apply 才真的傳）")
        return 0
    r = aws("s3", "sync", f"{STAGE}/assets/", f"s3://{BUCKET}/assets/",
            "--cache-control", CACHE_CONTROL, "--only-show-errors", capture=False)
    if r.returncode != 0:
        print("⛔ sync 失敗", file=sys.stderr)
        return r.returncode
    print("✓ sync 完成 —— ⚠️ 而這只代表**送出去了**；跑 --verify 才知道傳對了")
    return 0


def cmd_check() -> int:
    """閘：manifest 每一筆都在 S3 上。⭐ 缺一顆就紅,⛔ 而不是玩家看到破圖才知道。"""
    if not identity_ok():
        return 2
    r = aws("s3api", "list-objects-v2", "--bucket", BUCKET, "--prefix", "assets/",
            "--query", "Contents[].Key", "--output", "json")
    if r.returncode != 0:
        print("⛔ 列不到 bucket", file=sys.stderr)
        return 2
    have = set(json.loads(r.stdout or "[]") or [])
    want = {key_of(e) for e in entries()}
    missing = sorted(want - have)
    print(f"⭐ manifest 唯一 key {len(want)} · S3 上 {len(have)} · 缺 {len(missing)}")
    if missing:
        for k in missing[:10]:
            print(f"  ⛔ 缺 {k}")
        if len(missing) > 10:
            print(f"  …另外 {len(missing) - 10} 顆")
        print("⇒ 跑 `python3 tools/asset-cdn/upload.py --apply`")
        return 1
    return 0


def cmd_verify(n: int) -> int:
    """⭐ 抽 N 顆**下載回來重算 sha256** —— ⛔ 「上傳成功」證明不了「傳對了」。"""
    if not identity_ok():
        return 2
    es = entries()
    random.seed(1116)
    ok = bad = 0
    for e in random.sample(es, min(n, len(es))):
        k = key_of(e)
        r = subprocess.run(["aws", "s3", "cp", f"s3://{BUCKET}/{k}", "-"],
                           capture_output=True,
                           env={**os.environ, "AWS_PROFILE": PROFILE, "AWS_REGION": REGION})
        if r.returncode != 0:
            print(f"⛔ 取不到 {k}")
            bad += 1
            continue
        if hashlib.sha256(r.stdout).hexdigest() == e["sha256"]:
            ok += 1
        else:
            print(f"⛔ 雜湊不符 {k}")
            bad += 1
    print(f"⭐ 抽驗 {ok + bad} 顆：相符 {ok} · 不符 {bad}")
    return 1 if bad else 0


def main() -> int:
    a = sys.argv[1:]
    if "--check" in a:
        return cmd_check()
    if "--verify" in a:
        i = a.index("--verify")
        n = int(a[i + 1]) if i + 1 < len(a) and a[i + 1].isdigit() else 12
        return cmd_verify(n)
    return cmd_upload(apply="--apply" in a)


if __name__ == "__main__":
    raise SystemExit(main())
