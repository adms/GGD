#!/usr/bin/env python3
"""✂️ 精確替換一段文字 —— ⭐ **對不上就非零離開**，⛔ 不會安靜地什麼都不做。

owner 的元規則（CLAUDE.md）：「判準治不了 —— 把判準換成一個會擋下你的數字或程式。」

⚠️ 這支腳本因為**同一天三次**同型失誤而存在（2026-08-31）：
   我用 `python3 -c "…s.replace(old,new)…"` 改檔而**沒有 assert**，
   於是字串對不上時：
     ① 檔案一個位元組都沒動
     ② 而腳本印出「✓ 改好了」
     ③ ⇒ ⭐ 我把「**沒有改到**」讀成「**改了而測試還是綠的**」
   三次裡有**兩次**發生在突變驗證上 —— 也就是說我讀到的是**假的綠燈**，
   而那正是這份文件整章在防的東西。

用法：
    python3 scripts/edit-or-die.py <檔> --old-file <舊> --new-file <新> [--count N]
    python3 scripts/edit-or-die.py <檔> --line N --new-file <新>      # 整行取代
    ... --old-file/--new-file 吃檔案，所以 ⛔ 不必跟 shell 的引號搏鬥。

離開碼：0 = 真的改了 · 2 = 出現次數不是期望值（⛔ **檔案不動**）· 3 = 檔案不存在
"""
import argparse
import sys
from pathlib import Path


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("--old-file")
    ap.add_argument("--new-file", required=True)
    ap.add_argument("--line", type=int, help="1-based；給了就整行取代（⛔ 不用 old）")
    ap.add_argument("--count", type=int, default=1, help="期望出現次數（預設 1）")
    a = ap.parse_args()

    p = Path(a.path)
    if not p.exists():
        print(f"⛔ 檔案不存在：{p}", file=sys.stderr)
        return 3
    src = p.read_text()
    new = Path(a.new_file).read_text()

    if a.line is not None:
        lines = src.split("\n")
        if not 1 <= a.line <= len(lines):
            print(f"⛔ 行號 {a.line} 超出範圍（1..{len(lines)}）", file=sys.stderr)
            return 2
        before = lines[a.line - 1]
        lines[a.line - 1] = new.rstrip("\n")
        p.write_text("\n".join(lines))
        print(f"✓ {p}:{a.line} 取代了：{before[:60]}")
        return 0

    if a.old_file is None:
        print("⛔ 要嘛給 --old-file，要嘛給 --line", file=sys.stderr)
        return 2
    old = Path(a.old_file).read_text()
    n = src.count(old)
    if n != a.count:
        # ⭐ 指出**最接近的**一行，⛔ 不是只說「對不上」——
        #   對不上的原因八成是縮排或全形/半形，而那眼睛看不出來。
        head = old.strip().split("\n")[0][:50]
        # ⭐ 逐步放寬前綴長度 —— 一段長字串通常只差**一個**縮排或全形字，
        #   而只試一個固定長度的前綴會「一行都沒有」（⛔ 那等於沒有訊息）。
        near: list[str] = []
        for cut in (32, 24, 16, 10, 6):
            probe = head[:cut].strip()
            if len(probe) < 4:
                break
            near = [
                f"  {i + 1}: {ln}" for i, ln in enumerate(src.split("\n")) if probe in ln
            ][:3]
            if near:
                break
        print(
            f"⛔ 出現 {n} 次，期望 {a.count} —— **檔案沒有被改動**。\n"
            f"   ⭐ 最接近的幾行（注意縮排與全形字）：\n" + ("\n".join(near) or "   （一行都沒有）"),
            file=sys.stderr,
        )
        return 2
    p.write_text(src.replace(old, new, a.count))
    print(f"✓ {p} 替換了 {n} 處")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
