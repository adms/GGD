#!/usr/bin/env python3
"""⭐ 「這一支對**這一條路徑**算不算正規化器」—— 判準的**唯一住處**（GH#1099）。

════════════════════════════════════════════════════════════════════════════
它要治的病
════════════════════════════════════════════════════════════════════════════
`tools/parallel-gates/normalizers.json` 的一格設定 **`onlyOutsideOwnWrites: true`**
（`skillremake:json`，2026-09-02 加入）在 2026-09-07 之前**只有一個**消費端讀得到
（`packages/shared/src/content/import/editorSource.ts`）。

⇒ 量到的（2026-09-07，修之前）：另外**三個執行點** ——
`scripts/genguard.sh` · PreToolUse hook 的 `_generator_owner()` ·
產物隔離區 `scripts/product-quarantine.sh` —— 對 `skillremake:json` 逐檔列名產生的
**127 份真產物**一律回「正規化器專屬・**不擋你**」，而其中 **105 份**被隔離區
**主動放行**成 644。

⭐ 這是 CLAUDE.md 的**失敗形態⑧**（消費端存在，但它消費不到）：
那一格存在、schema 收得下、`editorSource.ts` 真的讀它 ——
⛔ 而**真正在擋人的那三個**讀不到。⚠️ 症狀完全沉默：genguard 印「不擋你」，
與正常放行**長得一模一樣**。

════════════════════════════════════════════════════════════════════════════
⛔ 為什麼這裡是**一支函式**，不是四份各自對的程式
════════════════════════════════════════════════════════════════════════════
在此之前這條判準有**四份手抄的實作**（genguard 的 inline node · hook 的
`_normalizes()` · 隔離區的 `_normalizes()` · `laneY…test.ts` ④ 自己那一份），
而它們對 `only` 收斂過一次（GH#815）、對 `onlyOutsideOwnWrites` **沒有** ——
⭐ 那正是第〇·四守則說的「同一份知識有第二個住處，⛔ 而它們之後各自漂」。

⇒ 前例就在隔壁：GH#1097 把 `product-quarantine.sh` 掛回 `marker_regions.py`
（⭐ 讀同一支判準，⛔ 不抄 regex、⛔ 不寫名單；讀不到 ⇒ fail-closed 而且大聲）。
這一支是**同一個形狀**。

════════════════════════════════════════════════════════════════════════════
⭐ 判準本身（三層，⛔ 順序不可以換）
════════════════════════════════════════════════════════════════════════════
呼叫端給的 `claimants` 一律是**從那一支自己的 `writes` 推導出來的**
（「誰的 writes 比中這條路徑」）⇒ 「這條路徑在它的 writes 裡」是**前提**，
⛔ 不是要在這裡再判一次。於是：

| 層 | 問題 | 答案 |
|---:|---|---|
| ① | 它在 `normalizers` 清單裡嗎（含 `:raw` 後綴的同一支）？ | 不在 ⇒ **作者** |
| ② | 它帶 `onlyOutsideOwnWrites: true` 嗎？ | 帶 ⇒ **作者**（見下） |
| ③ | 它帶 `only:[glob…]` 嗎？ | 帶而**比不中** ⇒ **作者**；其餘 ⇒ 正規化器 |

⭐ ② 的理由（`editorSource.ts` 逐字同一句）：`writes` 已經只列「這一支**真的產生**
的檔」⇒ 它出現在 claimants 裡就代表**這條路徑在它自己的 writes 裡** ⇒ 它是作者。
`onlyOutsideOwnWrites` 說的正是「**只在自己 writes 之外**才是正規化器」。

⚠️ ⛔ 這一支**不**回答「這條路徑被誰認領」（那是 `sync-io.json` 的 writes 比對，
呼叫端各自做，因為它們的路徑基準不同：hook 要對 lane 的樹算相對路徑、
隔離區要 `glob.glob` 展開）。⭐ 這裡只回答**分類**那一半。

════════════════════════════════════════════════════════════════════════════
消費端（⭐ 一起讀這一份，⛔ 不要各自再寫一份 —— GH#707 / GH#1099 的病）
════════════════════════════════════════════════════════════════════════════
· `scripts/genguard.sh`（手動查詢；shell → 這一支的 CLI）
· `scripts/preserve-before-overwrite.py` 的 `_generator_owner()`（PreToolUse，真的會擋）
· `scripts/product-quarantine.sh` 的 `has_author()`（檔案權限＝真正的隔離）
· ⭐ 第四個執行點 `packages/shared/src/content/import/editorSource.ts` 是 **TypeScript**
  （跑在 content-api 的行程裡，⛔ 叫不到 python）⇒ 它保留自己的實作，
  而**兩者一致**由 `packages/shared/src/ops/normalizerRuleAgreesAcrossEntrypoints.test.ts`
  逐檔比對 —— ⭐ 那條閘驗的是**關係**，⛔ 不是「那一格存不存在」。
· `apps/platform/internal/submissions/ownership.go`（Go，同上：自己的實作 ＋ 同一條閘）
· ⚠️ `tools/parallel-gates/reconcile.mjs` **刻意不接** —— 它的 `classify()` 第一件事
  就是 `if (isMine(p)) continue`（跳過「在自己 writes 裡」的路徑）⇒ 它問的**本來就是**
  「自己 writes **之外**」那一半 ⇒ `onlyOutsideOwnWrites` 在那裡的正確行為是
  **照樣當正規化器**。接上去反而會把 `skillremake:json` 合法的 `castTimeSec`
  就地改寫誤報成越界寫入（＝ 一條會誤報的閘，而它會被人放寬）。

CLI（給 shell 用）:
    python3 tools/parallel-gates/normalizer_rules.py <path> <認領步驟…>
      stdout 逐行印出**作者**（＝認領者裡不是正規化器的那些）
      exit 0 = 判準跑完了。⚠️ ⛔ **0 行 ≠ 失敗** —— 那是「只有正規化器認領」
      exit 2 = ⛔ 讀不到清單 ⇒ 呼叫端要 fail-closed **而且大聲**

    python3 tools/parallel-gates/normalizer_rules.py --batch
      stdin 每行 `path<TAB>step,step,…`；stdout 每行 `path<TAB>作者csv`
      （⭐ 給守衛用：846 份檔一次跑完，⛔ 不是 846 次 subprocess）
"""

from __future__ import annotations

import fnmatch
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DEFAULT_NORMALIZERS = REPO / "tools/parallel-gates/normalizers.json"


def load_entries(path: str | Path | None = None) -> list[dict]:
    """讀 `normalizers.json` 的 `normalizers` 陣列。

    ⚠️ ⛔ **不吞例外** —— 讀不到是呼叫端要 fail-closed 的訊號，
    而一個靜靜回空陣列的載入器會讓「全部當成正規化器」看起來完全正常。
    """
    p = Path(path) if path else DEFAULT_NORMALIZERS
    data = json.loads(p.read_text(encoding="utf-8"))
    return list(data.get("normalizers") or [])


def _index(entries: list[dict]) -> dict[str, dict]:
    """步驟名 → 那一格。

    ⭐ `:raw` 後綴同時登記**去掉後綴**的名字（`castderive:build:raw` ⇒ 也認得
    `castderive:build`）—— ⛔ 不是我發明的：`editorSource.ts:106` 與
    `ownership.go:98` 兩邊都已經這樣做，這裡跟上是為了**四者逐字同一條規則**。
    ⚠️ ⭐ 誠實記著：**這一行今天不承重** —— 出貨的 62 個步驟名裡沒有
    `castderive:build`（只有 `:raw` 那一個）⇒ 拿掉它今天不會有任何檔改變分類。
    留著是為了「哪天有人加一支 wrapper 步驟」時四邊仍然一致。
    """
    by: dict[str, dict] = {}
    for e in entries:
        step = str(e.get("step") or "")
        if not step:
            continue
        by.setdefault(step, e)
        if step.endswith(":raw"):
            by.setdefault(step[: -len(":raw")], e)
    return by


def normalizes(entry: dict, path: str) -> bool:
    """這一格對 `path` 算不算正規化器。

    ⚠️ **前提**：`path` 已經比中了這一支自己的 `writes`（呼叫端是這樣推導
    claimants 的）⇒ ⭐ `onlyOutsideOwnWrites` 在這裡的答案一定是「⛔ 不算」。
    """
    # ── ② ⭐ 「只在自己 writes 之外才是正規化器」⇒ 在裡面就是**作者**。
    if entry.get("onlyOutsideOwnWrites") is True:
        return False
    # ── ③ `only` 是**路徑範圍**：一支可以對 A 檔是正規化器、對 B 檔是作者。
    only = entry.get("only")
    if isinstance(only, list):
        return any(fnmatch.fnmatch(path, str(g)) for g in only)
    return True


def author_steps(path: str, claimants, entries: list[dict]) -> list[str]:
    """`claimants` 裡哪幾支是**作者**（⛔ 濾掉對這條路徑只做正規化的）。

    ⭐ 回傳保持呼叫端給的順序 —— genguard／hook 的訊息拿 `authors[0]` 當「擁有者」，
    ⛔ 排序過會讓訊息指名的那一支跟著變。
    """
    by = _index(entries)
    out: list[str] = []
    for c in claimants:
        e = by.get(str(c))
        if e is None or not normalizes(e, path):
            out.append(str(c))
    return out


def _split(csv: str) -> list[str]:
    return [x for x in (s.strip() for s in csv.split(",")) if x]


def main(argv: list[str]) -> int:
    try:
        entries = load_entries()
    except Exception as exc:  # noqa: BLE001
        # ⚠️ fail-closed **而且大聲**：呼叫端看到 exit 2 要自己決定怎麼保守，
        #    ⛔ 但絕不可以把「沒有輸出」讀成「沒有作者」。
        print(
            f"⛔ 讀不到正規化器清單 {DEFAULT_NORMALIZERS}（{exc}）—— "
            "⛔ 不要把「沒有輸出」當成「只有正規化器認領」。",
            file=sys.stderr,
        )
        return 2
    if argv and argv[0] == "--batch":
        for line in sys.stdin:
            line = line.rstrip("\n")
            if not line:
                continue
            path, _, csv = line.partition("\t")
            print(f"{path}\t{','.join(author_steps(path, _split(csv), entries))}")
        return 0
    if len(argv) < 1:
        print(__doc__ or "", file=sys.stderr)
        return 2
    path, claimants = argv[0], []
    for a in argv[1:]:
        claimants.extend(_split(a))
    for a in author_steps(path, claimants, entries):
        print(a)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
