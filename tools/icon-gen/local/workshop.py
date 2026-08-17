#!/usr/bin/env python3
"""
workshop.py —— 圖示工坊的**地端入口**（owner 2026-08-17）。

	「可以透過 UI 生成，也可以在**地端呼叫 script 完成所有流程 + 測試 + 回饋比較
	  重新生成**，讓我以後可以**穩定的重複使用**」

⭐ 這一支存在的理由只有一個：把「重畫幾張圖」從**一串要記得的步驟**變成**一條指令**。
在它之前，重畫一批圖要記得：先備份（不然改壞了回不去）→ 用對的旗標跑 batch.py
（⚠️ `--contact-sheet` 是**模式**不是修飾詞，2026-08-17 就是這樣讓 60 張聖杯圖一張
都沒產出來）→ 記得它會順手改到別的圖 → 跑測試 → 自己想辦法比較新舊。
散文治不了這種事，一支腳本可以（見 CLAUDE.md 的「閘不是判準」）。

四個動作，⛔ 沒有第五個：

	python3 tools/icon-gen/local/workshop.py redo   --ids grail-a-14,grail-c-06
	python3 tools/icon-gen/local/workshop.py review --ids grail-a-14,grail-c-06
	python3 tools/icon-gen/local/workshop.py revert --ids grail-a-14
	python3 tools/icon-gen/local/workshop.py test

`redo`  = 備份成 `<icon>.prev.webp` → 重畫（**只畫指名的那幾張**）→ 跑測試 → 出對照頁
`review`= 不重畫，只出對照頁（新／舊並排）
`revert`= 把 `.prev.webp` 搬回去（⭐ 這是「不滿意就退回」那一步，⛔ 不必翻 git）
`test`  = 只跑閘（主題表相異性 + 風格 config 讀得到）

⚠️ **備份不是選項**。`redo` 一定先存 `.prev.webp`；那些檔在 `.gitignore` 裡，
⛔ 不會被 commit，但在你決定要不要留新圖之前一直都在。

⚠️ **只畫指名的那幾張。** `batch.py` 的 worklist 會把整個 family 掃進來，而 2026-08-17
那次就是這樣覆寫了三張已經出貨的技能圖。這裡逐張建 worklist item，⛔ 不呼叫
`build_worklist`。
"""
from __future__ import annotations

import argparse
import html
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

# ⭐ 產圖要 torch，而 torch 只裝在 `tools/icon-gen/.venv` 裡。⚠️ 用系統 python 跑
# 的後果**不是**一個看得懂的錯誤：`run_batch` 把每一張的例外吞成一行
# 「FAILED: No module named 'torch'」，然後印「0 rendered, 5 failed」就結束 —— 而
# 離開碼是 0。所以這裡自己換人跑，⛔ 不寫在文件裡叫人記得（閘不是判準）。
_VENV_PY = os.path.join(os.path.dirname(HERE), ".venv", "bin", "python")
if "--no-reexec" not in sys.argv and os.path.exists(_VENV_PY):
    try:
        import torch  # noqa: F401
    except ImportError:
        os.execv(_VENV_PY, [_VENV_PY, os.path.abspath(__file__), *sys.argv[1:], "--no-reexec"])

import batch  # noqa: E402  (sys.path 先設好才 import 得到)
import keywords  # noqa: E402

ROOT = batch.ROOT
REVIEW_DIR = os.path.join(ROOT, "docs", "icon-review")
PREV_SUFFIX = ".prev.webp"


# ── 找一個 id 屬於哪個 family ────────────────────────────────────────────────
FAMILIES = ("augments", "champions", "abilities", "items")


def family_of(doc_id: str) -> str | None:
    """從出貨的 `content/` 反查，⛔ 不從 id 的前綴猜（`grail-` 是慣例不是規則）。"""
    for fam in FAMILIES:
        if batch._load_doc(fam, doc_id) is not None:
            return fam
    return None


def resolve(ids: list[str]) -> list[dict]:
    """把 id 清單變成 batch.run_batch 吃得下的 worklist，順便報出找不到的。"""
    work: list[dict] = []
    missing: list[str] = []
    for doc_id in batch._dedupe(ids):
        fam = family_of(doc_id)
        if fam is None:
            missing.append(doc_id)
            continue
        # ⚠️ `doc` 這一格是必須的 —— `run_batch` 讀 `item["doc"]["icon"]` 來判斷
        # 「這一張已經出貨了」。少了它是 KeyError，不是靜默跳過（那是對的）。
        work.append({
            "family": fam,
            "id": doc_id,
            "doc": batch._load_doc(fam, doc_id) or {},
            "path": batch._icon_abs(fam, doc_id),
        })
    if missing:
        # ⛔ 不靜靜跳過：打錯一個 id 而腳本說「完成」是最糟的結果 —— 你會以為重畫過了。
        raise SystemExit(f"✗ 這些 id 在 content/ 裡找不到：{', '.join(missing)}")
    return work


# ── 備份 / 還原 ──────────────────────────────────────────────────────────────
def backup(work: list[dict]) -> int:
    n = 0
    for w in work:
        if os.path.exists(w["path"]):
            shutil.copy2(w["path"], w["path"] + PREV_SUFFIX)
            n += 1
    return n


def revert(work: list[dict]) -> int:
    n = 0
    for w in work:
        prev = w["path"] + PREV_SUFFIX
        if os.path.exists(prev):
            shutil.move(prev, w["path"])
            n += 1
    return n


# ── 對照頁 ───────────────────────────────────────────────────────────────────
def review_page(work: list[dict], out_path: str) -> str:
    """新／舊並排的一頁靜態 HTML。⚠️ 圖走相對路徑，⛔ 不內嵌 base64（60 張會爆）。"""
    rows = []
    for w in work:
        rel = os.path.relpath(w["path"], os.path.dirname(out_path))
        prev = rel + PREV_SUFFIX
        has_prev = os.path.exists(w["path"] + PREV_SUFFIX)
        doc = batch._load_doc(w["family"], w["id"]) or {}
        # ⚠️ 讀的是**產圖器自己**的 PASS-1 提示詞，⛔ 不是另外寫一段描述 ——
        # 對照頁要回答的是「這張圖為什麼長這樣」，那個答案只有提示詞說得準。
        subject = keywords.pass1_prompt(w["family"], doc)[0]
        palette = str(doc.get("name") or w["id"])
        rows.append(
            f'<figure><div class="pair">'
            f'<span><img src="{html.escape(rel)}" alt=""><b>新</b></span>'
            + (
                f'<span><img src="{html.escape(prev)}" alt=""><b>舊</b></span>'
                if has_prev
                else '<span class="none">（沒有舊圖）</span>'
            )
            + f'</div><figcaption><code>{html.escape(w["id"])}</code>'
            f'<p>{html.escape(subject)}</p>'
            f'<small>{html.escape(palette)}</small></figcaption></figure>'
        )
    doc = (
        "<!doctype html><meta charset=utf-8><title>圖示對照</title>"
        "<style>body{background:#14161c;color:#e6e8ee;font:14px/1.5 system-ui;padding:24px}"
        "h1{font-size:18px}figure{display:inline-block;margin:0 16px 24px 0;width:280px;vertical-align:top}"
        ".pair{display:flex;gap:8px}.pair span{text-align:center}"
        "img{width:128px;height:128px;image-rendering:pixelated;border-radius:8px;background:#0b0d12}"
        "b{display:block;font-size:11px;color:#8d97ad;font-weight:600}"
        ".none{width:128px;display:grid;place-items:center;color:#6b7488;font-size:11px}"
        "figcaption{margin-top:6px}code{color:#ffd479}p{margin:4px 0;font-size:12px}"
        "small{color:#8d97ad}</style>"
        f"<h1>圖示對照 · {len(work)} 張</h1>" + "".join(rows)
    )
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(doc)
    return out_path


# ── 閘 ───────────────────────────────────────────────────────────────────────
def run_tests() -> int:
    """跑這條產線自己的閘。⛔ 不跑全 repo（第零守則④：迭代跑單檔）。"""
    rc = subprocess.call(
        [sys.executable, os.path.join(HERE, "test_grail_subjects.py")], cwd=ROOT
    )
    print("✓ 主題表的閘通過" if rc == 0 else "✗ 主題表的閘紅了")
    return rc


def main() -> None:
    ap = argparse.ArgumentParser(description="GGD 圖示工坊 —— 重畫 · 對照 · 退回 · 測試")
    ap.add_argument("action", choices=["redo", "review", "revert", "test"])
    ap.add_argument("--ids", default="", help="逗號分隔的文件 id")
    ap.add_argument("--out", default=os.path.join(REVIEW_DIR, "compare.html"))
    ap.add_argument("--seed", type=int, default=None, help="省略 = 每個 id 自己的穩定種子")
    ap.add_argument("--no-reexec", action="store_true", help=argparse.SUPPRESS)
    args = ap.parse_args()

    if args.action == "test":
        raise SystemExit(run_tests())

    ids = [s.strip() for s in args.ids.split(",") if s.strip()]
    if not ids:
        raise SystemExit("✗ 需要 --ids（逗號分隔）")
    work = resolve(ids)

    if args.action == "revert":
        print(f"↩ 還原了 {revert(work)} / {len(work)} 張")
        return

    if args.action == "redo":
        print(f"▸ 備份 {backup(work)} 張為 {PREV_SUFFIX}")
        style = keywords.load_icon_style()
        # ⚠️ 逐格複製風格設定，⛔ 不重打預設值 —— 後台改了哪一格這裡就跟著改。
        ns = argparse.Namespace(
            strength=style["strength"],
            size=style["size"],
            pass1_steps=style["pass1Steps"],
            pass1_guidance=style["pass1Guidance"],
            pass2_steps=style["pass2Steps"],
            pass2_guidance=style["pass2Guidance"],
            seed=args.seed,
            force=True,            # 指名重畫 = 一定覆寫
            dry_run=False,
            no_write_icon_field=False,
            limit=None,
        )
        stats = batch.run_batch(work, ns)
        print(f"▸ 產出 {stats}")
        if run_tests() != 0:
            raise SystemExit(1)

    print(f"▸ 對照頁：{review_page(work, args.out)}")


if __name__ == "__main__":
    main()
