#!/usr/bin/env python3
"""37 名社群英雄 ＋ 222 槽技能的圖示補生成（GH#1129 A 段）。

⭐ 為什麼要一支獨立的驅動器（⛔ 不是直接跑 `batch.py`）：
`batch.py::_load_doc()` 只讀 `content/<family>/<id>.json`,而這 37 名**還沒發布**——
執行狀態文件逐字寫著「本批 37 名是**隔離候選／草稿**,尚未發布正式英雄」。
⇒ ⭐ 它們不落進 `content/` 之前,批次**看不到它們**。

⭐ 而票的裁決是「補新的」,⛔ 不是「先發布再補圖」⇒ 這一支走票裡的**選項②**:
從交接資料夾造出**合成文件**餵給同一組提示詞產生器與同一條兩段式管線,
產出落在**交接目錄**,⛔ 不碰 `content/` 一個位元組。

⚠️ ⭐ 同一組 `keywords` 與 `pipeline`（⛔ 不是另一條路）——
⭐ 這樣風格與出貨的 1,010 張**逐位元組同源**（同一份 `icon-style.json`、同一個 `_method_stamp`）。

owner 2026-09-09 逐字：
> 「新的 37支英雄及技能 icon 需要重新生成,請你拿之前開發好的 icon 生成 script 來補完,記得 FATE 風格」
> 「是本地端SD 生成 icon 還記得嗎」
> 「有一個例外 37個新角色頭圖及技能產ICON 這個票是你曾經做過的 你來做比較有效率 請你做完補給codex編輯器來上傳」
"""
from __future__ import annotations

import argparse
import contextlib
import json
import os
import pathlib
import sys
import time

HERE = pathlib.Path(__file__).resolve().parent
# ⚠️ `keywords.py` 第 872 行 `import prompt` —— 那支住 `../src`,
#   而它的註解逐字說「batch.py inserts it」⇒ ⭐ 這一支也要插,⛔ 否則 import 就死。
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "src"))

import keywords  # noqa: E402
import pipeline  # noqa: E402

DEFAULT_HANDOFF = pathlib.Path(
    "/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/outputs"
    "/community-hero-asset-integration/handoff-with-models-v2"
)
REPO = HERE.parents[2]

SLOT_ORDER = ["PASSIVE", "Q", "W", "E", "R", "EX"]


def _stable_seed(doc_id: str) -> int:
    """⭐ 與 `batch.py::_stable_seed` **同一個公式** —— 同一個 id 永遠同一張圖。"""
    h = 0
    for ch in doc_id:
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
    return h


def _method_stamp() -> str:
    style = keywords.load_icon_style()
    import hashlib

    blob = json.dumps(style, sort_keys=True, ensure_ascii=False).encode("utf-8")
    return f"twopass-v3+style:{hashlib.sha256(blob).hexdigest()[:12]}"


SUBJECTS = json.loads((HERE / "data" / "community37-subjects.json").read_text(encoding="utf-8"))["heroes"]


def _curated(index: str, slot: str | None) -> tuple[str, str] | None:
    """⭐ 逐一策劃的主體 —— ⛔ 內建 deriver 對中文名是瞎的。

    量到的（2026-09-09,`keywords.DERIVERS` 跑全部 259 張）：
      · 34/37 英雄落到 `role` 退路 ⇒ ⛔ **22 隻會長成同一張** `an anime warrior…`
      · 222 支技能只推出 **68** 個相異主體,最多的一個重複 **26** 次
    ⇒ ⭐ 直接產出等於交 37 張看不出是誰的頭圖。

    ⭐ 主體與顏色**逐字取自交接資料的「視覺方向」**（`brief.concept`）,⛔ 不是編的。
    """
    e = SUBJECTS.get(index)
    if not e:
        return None
    pair = e["slots"].get(slot) if slot else e.get("hero")
    return (pair[0], pair[1]) if pair else None


def worklist(handoff: pathlib.Path) -> list[dict]:
    """交接資料 → 圖示工作清單（⭐ 英雄 ＋ 每一槽技能）。"""
    index = json.loads((handoff / "index.json").read_text(encoding="utf-8"))
    work: list[dict] = []
    for hero in index["heroes"]:
        proj = json.loads((handoff / hero["project"]).read_text(encoding="utf-8"))
        brief = proj.get("brief") or {}
        plan = proj.get("acceptedPlan") or {}
        hid = hero["projectId"]
        # ⭐ 英雄卡：`champion_keywords` 讀 id / name / role
        work.append({
            "family": "champions",
            "id": hid,
            "curated": _curated(hero["index"], None),
            "doc": {
                "id": hid,
                "name": brief.get("name") or hero["name"],
                "role": plan.get("archetype") or "fighter",
                "attackType": plan.get("attackType") or "melee",
                "origin": plan.get("origin"),
                "description": (brief.get("concept") or "").strip(),
            },
        })
        # ⭐ 技能：`ability_keywords` 讀 name / description
        slots = plan.get("slots") or {}
        for slot in SLOT_ORDER:
            s = slots.get(slot)
            if not s:
                continue
            work.append({
                "family": "abilities",
                "id": f"{hid}.{slot.lower()}",
                "curated": _curated(hero["index"], slot),
                "doc": {
                    "id": f"{hid}.{slot.lower()}",
                    "name": s.get("name") or (brief.get("moveNames") or {}).get(slot) or slot,
                    "description": (s.get("purpose") or "").strip(),
                },
            })
    return work


@contextlib.contextmanager
def _curated_deriver(family: str, cur):
    """暫時把 `keywords.DERIVERS[family]` 換成回傳策劃主體的那一支。

    ⚠️ ⭐ 為什麼是 monkey-patch 而不是加參數：`keywords.py` 是**出貨那 1,010 張**
    走的同一支,而這一批是**草稿**（37 名尚未發布）——
    ⛔ 為一批草稿改出貨模組的簽章,會讓那 1,010 張的風險等於這一批的風險。
    ⇒ 借用它、⛔ 不改它;`with` 區塊結束就還原。
    """
    if not cur:
        yield
        return
    subject, hue = cur
    orig = keywords.DERIVERS[family]
    keywords.DERIVERS[family] = lambda _doc: (subject, hue, "curated37")
    try:
        yield
    finally:
        keywords.DERIVERS[family] = orig


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--handoff", default=str(DEFAULT_HANDOFF))
    ap.add_argument("--out", required=True, help="產出目錄（⛔ 不是 content/）")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--only", default="", help="逗號分隔的 id（抽樣用）")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true", help="已存在也重畫")
    ap.add_argument("--size", type=int, default=128)
    ap.add_argument("--strength", type=float, default=0.58)
    ap.add_argument("--pass1-steps", type=int, default=28)
    ap.add_argument("--pass1-guidance", type=float, default=7.5)
    ap.add_argument("--pass2-steps", type=int, default=22)
    ap.add_argument("--pass2-guidance", type=float, default=7.0)
    a = ap.parse_args()

    handoff = pathlib.Path(a.handoff)
    if not (handoff / "index.json").exists():
        print(f"⛔ 找不到 {handoff}/index.json")
        return 2
    work = worklist(handoff)
    if a.only:
        want = {s.strip() for s in a.only.split(",") if s.strip()}
        work = [w for w in work if w["id"] in want]
    out = pathlib.Path(a.out)
    stamp = _method_stamp()
    if not a.force:
        work = [w for w in work if not (out / w["family"] / f'{w["id"]}.webp').exists()]
    if a.limit:
        work = work[: a.limit]

    heroes = sum(1 for w in work if w["family"] == "champions")
    print(f"清單 {len(work)} 張（英雄 {heroes} · 技能 {len(work) - heroes}）· method={stamp}")
    if a.dry_run:
        miss = [w["id"] for w in work if not w.get("curated")]
        for w in work[:10]:
            with _curated_deriver(w["family"], w.get("curated")):
                subj, hue, sig = keywords.DERIVERS[w["family"]](w["doc"])
            print(f"  {w['family']}/{w['id']}  [{sig}]  {subj[:58]} · {hue[:24]}")
        # ⭐ 沒有策劃值的要**指名**,⛔ 不是靜靜地退回會撞在一起的推導
        print(f"\n⭐ 有策劃主體 {len(work) - len(miss)}/{len(work)}" + (f" · ⛔ 缺 {len(miss)}: {miss[:6]}" if miss else ""))
        return 0

    ok = fail = 0
    t0 = time.time()
    for i, w in enumerate(work, 1):
        try:
            # ⭐⭐ 接法是**換掉 deriver**,⛔ 不是複製組裝邏輯 ——
            #   `pass1_prompt` / `pass2_prompt` 的第一行都是 `DERIVERS[family](doc)`,
            #   而它們後面那一段（PASS1_FRAME · load_icon_style · negative）就是
            #   出貨那 1,010 張走的**同一條路**。
            #   ⇒ 只把「主體/顏色」那一格換成策劃值,風格就與出貨**逐位元組同源**。
            #   ⛔ 若改成自己拼字串,這批的風格會與出貨分家,而**沒有東西會紅**。
            cur = w.get("curated")
            with _curated_deriver(w["family"], cur):
                p1p, p1n, signal = keywords.pass1_prompt(w["family"], w["doc"])
                p2p, p2n = keywords.pass2_prompt(w["family"], w["doc"])
            if cur:
                signal = "curated37"
            seed = _stable_seed(w["id"])
            base = pipeline.generate(p1p, p1n, size=None, steps=a.pass1_steps,
                                     guidance=a.pass1_guidance, seed=seed)
            img = pipeline.stylize(base, p2p, p2n, strength=a.strength, steps=a.pass2_steps,
                                   guidance=a.pass2_guidance, size=a.size, seed=seed)
            dst = out / w["family"] / f'{w["id"]}.webp'
            dst.parent.mkdir(parents=True, exist_ok=True)
            img.save(dst, "WEBP", quality=92, method=6)
            dst.with_suffix(".webp.method").write_text(stamp + "\n", encoding="utf-8")
            ok += 1
            print(f"  [{i}/{len(work)}] {w['family']}/{w['id']}  [{signal}]  {dst.stat().st_size}b", flush=True)
        except Exception as exc:  # noqa: BLE001
            fail += 1
            print(f"  [{i}/{len(work)}] {w['family']}/{w['id']}  ⛔ FAILED: {exc}", flush=True)
    mins = (time.time() - t0) / 60
    manifest = {
        "schema": "ggd-community-hero-icons@1",
        "ticket": "GH#1129",
        "method": stamp,
        "handoff": str(handoff),
        "rendered": ok,
        "failed": fail,
        "minutes": round(mins, 1),
        "note": "⭐ 37 名社群英雄草稿的圖示。⛔ 不在 content/ —— 這批英雄尚未發布正式英雄。"
                "交給 Codex 編輯器上傳（owner 2026-09-09）。",
    }
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\n完成 {mins:.1f} 分：{ok} 張，{fail} 失敗 → {out}")
    return 1 if fail else 0


if __name__ == "__main__":
    raise SystemExit(main())
