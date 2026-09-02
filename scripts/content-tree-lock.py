#!/usr/bin/env python3
"""⭐⭐ 內容樹的**讀寫鎖**（GH#950）—— ⛔ 這台沒有 `flock(1)`，所以用 fcntl。

## 它在防什麼（2026-09-02 量到，⛔ 不是推測）

| 怎麼跑 | 結果 |
|---|---|
| `pnpm -s speedlists:check` 直接跑 | ⭐ **EXIT=0** |
| `npx vitest run --dir apps/admin` | ⭐ 1305 全綠 |
| `npx vitest run --dir apps` | ⛔ **紅** —— 「speedlists:check 過期」 |

⇒ ⭐ 三次量測，**只有整個 `apps` 一起跑才紅** ⇒ 是**別的測試在干擾它**。

## ⭐ 干擾源（指名，⛔ 不是「調一下順序」）

`apps/content-api/src/editorSourceSurvivesSync.test.ts` 會

1. 真的改一份來源檔（`tools/skill-remake/heroes/godie-e00s.py`）
2. 真的跑三支產生器：`skillremake:json` · `tiers:apply` · `skillremake:provenance`
   —— ⭐ 它們**成批重寫 `content/abilities/*.json`**
3. `finally` 還原，再跑一次那三支

⚠️ 而 vitest **檔案之間是並行的** ⇒ `apps/admin/src/skillLists.test.ts` 的
`pnpm -s speedlists:check` 可能**正好**在那個窗裡讀內容樹
（`tools/skill-lists/gen.mjs` 走 `loadContentCached`）
⇒ ⭐ 它算出一份與磁碟上不同的產物 ⇒ 報「過期」。

⛔ **而那個訊息指著錯方向**：「跑 `speedlists:build` 然後 git add」——
照做會產生一份**位元組相同**的產物（＝什麼都沒發生），
⇒ 下一輪看到它又紅，會以為是新的錯。

## ⭐ 為什麼鎖在這裡，⛔ 不是重試或 `.skip`

重試把一條**假紅燈**換成一條**假綠燈**（真的過期時它也會重試成功）。
⭐ 這是一個**併發**問題，而併發問題的解法是**互斥**。

`scripts/genrun.sh` 本來就是**每一支產生器的唯一入口**（它負責解鎖/上鎖隔離區）
⇒ ⭐ 寫者那一側只要改**一個地方**。
讀者那一側走 `scripts/gencheck.sh`。

## 用法

    python3 scripts/content-tree-lock.py write -- <指令…>   # 獨佔
    python3 scripts/content-tree-lock.py read  -- <指令…>   # 共享

⚠️ 逾時（預設 600 秒）會**回非零並說出來**，⛔ 不會靜靜地跑下去 ——
一個等不到鎖就自己跑掉的鎖等於沒有鎖。
逃生口 `GGD_CONTENT_LOCK_OFF=1`（用了要在 commit 訊息裡說為什麼）。
"""
from __future__ import annotations

import fcntl
import os
import subprocess
import sys
import time

LOCK_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".content-tree.lock")
TIMEOUT_SEC = float(os.environ.get("GGD_CONTENT_LOCK_TIMEOUT", "600"))


def main() -> int:
    if len(sys.argv) < 4 or sys.argv[1] not in ("read", "write") or sys.argv[2] != "--":
        print("用法: python3 scripts/content-tree-lock.py <read|write> -- <指令…>", file=sys.stderr)
        return 2
    mode, cmd = sys.argv[1], sys.argv[3:]

    if os.environ.get("GGD_CONTENT_LOCK_OFF") == "1":
        return subprocess.call(cmd)

    flag = fcntl.LOCK_EX if mode == "write" else fcntl.LOCK_SH
    # ⭐ 鎖檔自己就是那把鎖 —— ⛔ 不刪它（刪掉會讓兩個 process 拿到不同的 inode）。
    fd = os.open(LOCK_PATH, os.O_RDWR | os.O_CREAT, 0o644)
    deadline = time.monotonic() + TIMEOUT_SEC
    while True:
        try:
            fcntl.flock(fd, flag | fcntl.LOCK_NB)
            break
        except BlockingIOError:
            if time.monotonic() >= deadline:
                print(
                    f"⛔ 等內容樹的{'獨佔' if mode == 'write' else '共享'}鎖超過 "
                    f"{TIMEOUT_SEC:.0f} 秒 —— ⭐ 另一支產生器卡住了嗎？\n"
                    f"   鎖檔：{os.path.abspath(LOCK_PATH)}\n"
                    "   ⛔ 這裡刻意**回非零**，不是跑下去 —— 一個等不到鎖就自己跑掉的鎖等於沒有鎖。",
                    file=sys.stderr,
                )
                os.close(fd)
                return 75  # EX_TEMPFAIL
            time.sleep(0.05)
    try:
        return subprocess.call(cmd)
    finally:
        fcntl.flock(fd, fcntl.LOCK_UN)
        os.close(fd)


if __name__ == "__main__":
    sys.exit(main())
