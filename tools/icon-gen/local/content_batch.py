#!/usr/bin/env python3
"""已進 content/ 的英雄補頭像＋六格技能圖示（第四批 37 名，GH#1185／#1205）。

owner 2026-09-16（逐字）：「頭像, 6 格技能圖示 你可以用之前本地端生成方式補上」

⭐ 同一條路（⛔ 不是另一套）：`community_batch.py` 的策劃主體換 deriver（`_curated_deriver`）、
`_method_stamp`、`_stable_seed`，以及 `keywords.pass1_prompt／pass2_prompt` ＋ `pipeline.generate／stylize`
兩段式管線逐字沿用 ⇒ 風格與出貨圖示同源（同一份 `content/config/icon-style.json`）。

與 `community_batch.py` 唯一的差別：讀的是**已經在 content/ 的英雄卡與技能文件**
（那一支讀交接資料夾的草稿），產出直接落 `content/assets/icons/{champions,abilities}/`
—— 也就是 `tools/ship-81/gen.py::attach_ability_icon`／`lol7.py::attach_champion_icon` 認的住處。
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys
import time

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "src"))

import community_batch as cb  # noqa: E402  ⭐ 借用同一組 deriver 替換、方法戳記、種子
import keywords  # noqa: E402
import pipeline  # noqa: E402

REPO = HERE.parents[2]
SLOTS = ["PASSIVE", "Q", "W", "E", "R", "EX"]


def worklist(subjects: dict, ids: list[str]) -> list[dict]:
    work: list[dict] = []
    for hid in ids:
        entry = subjects[hid]
        champ = json.loads((REPO / "content/champions" / f"{hid}.json").read_text(encoding="utf-8"))
        work.append({"family": "champions", "id": hid, "curated": tuple(entry["hero"]),
                     "doc": {k: champ.get(k) for k in ("id", "name", "role", "attackType", "origin", "description")}})
        for slot in SLOTS:
            aid = f"{hid}.{slot.lower()}"
            ab = json.loads((REPO / "content/abilities" / f"{aid}.json").read_text(encoding="utf-8"))
            work.append({"family": "abilities", "id": aid, "curated": tuple(entry["slots"][slot]),
                         "doc": {"id": aid, "name": ab.get("name"), "description": ab.get("description")}})
    return work


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--subjects", default=str(HERE / "data" / "batch37-subjects.json"))
    ap.add_argument("--only", default="", help="逗號分隔的圖示 id（抽樣用）")
    ap.add_argument("--out", default=str(REPO / "content/assets/icons"))
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--size", type=int, default=128)
    ap.add_argument("--strength", type=float, default=0.58)
    ap.add_argument("--pass1-steps", type=int, default=28)
    ap.add_argument("--pass1-guidance", type=float, default=7.5)
    ap.add_argument("--pass2-steps", type=int, default=22)
    ap.add_argument("--pass2-guidance", type=float, default=7.0)
    a = ap.parse_args()

    subjects = json.loads(pathlib.Path(a.subjects).read_text(encoding="utf-8"))["heroes"]
    work = worklist(subjects, sorted(subjects))
    if a.only:
        want = {s.strip() for s in a.only.split(",") if s.strip()}
        work = [w for w in work if w["id"] in want]
    out = pathlib.Path(a.out)
    if not a.force:
        work = [w for w in work if not (out / w["family"] / f'{w["id"]}.webp').exists()]
    stamp = cb._method_stamp()
    print(f"清單 {len(work)} 張 · method={stamp}", flush=True)
    if a.dry_run:
        for w in work[:8]:
            with cb._curated_deriver(w["family"], w["curated"]):
                p1p, _, _ = keywords.pass1_prompt(w["family"], w["doc"])
            print(f"  {w['family']}/{w['id']}  {p1p[:110]}")
        return 0

    ok = fail = 0
    t0 = time.time()
    for i, w in enumerate(work, 1):
        try:
            with cb._curated_deriver(w["family"], w["curated"]):
                p1p, p1n, _ = keywords.pass1_prompt(w["family"], w["doc"])
                p2p, p2n = keywords.pass2_prompt(w["family"], w["doc"])
            seed = cb._stable_seed(w["id"])
            base = pipeline.generate(p1p, p1n, size=None, steps=a.pass1_steps, guidance=a.pass1_guidance, seed=seed)
            img = pipeline.stylize(base, p2p, p2n, strength=a.strength, steps=a.pass2_steps,
                                   guidance=a.pass2_guidance, size=a.size, seed=seed)
            dst = out / w["family"] / f'{w["id"]}.webp'
            dst.parent.mkdir(parents=True, exist_ok=True)
            img.save(dst, "WEBP", quality=92, method=6)
            ok += 1
            print(f"  [{i}/{len(work)}] {w['family']}/{w['id']}  {dst.stat().st_size}b", flush=True)
        except Exception as exc:  # noqa: BLE001
            fail += 1
            print(f"  [{i}/{len(work)}] {w['family']}/{w['id']}  ⛔ FAILED: {exc}", flush=True)
    print(f"\n完成 {(time.time() - t0) / 60:.1f} 分：{ok} 張，{fail} 失敗 → {out}", flush=True)
    return 1 if fail else 0


if __name__ == "__main__":
    raise SystemExit(main())
