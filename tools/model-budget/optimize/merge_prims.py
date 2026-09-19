#!/usr/bin/env python3
"""merge_prims — optimize.ts 的**合併 stage** worker：把「畫起來一樣」的 primitive 接成一塊。

⭐ 它**不改變畫面**。接起來的每一塊渲染狀態**逐位元組相同**（同一份材質、同一張
貼圖、同一種 wrap），而半透明一律**不接**（繪製順序保護）⇒ 同樣的像素，更少的
draw call。⛔ 這與圖集 stage 不同 —— 那一支會重排貼圖、把每一格縮小，**會**改變畫面。

⛔ 這一支**沒有第二份判準，也沒有第二份實作** —— 兩者都 import 自上游：
  · 判準（接不接得起來）：`tools/w3x-import/glb_draw_state.merge_groups`
  · 實作（真的接）      ：`tools/w3x-import/merge_glb_prims.merge`
⭐ 它只補 optimize.ts 需要而上游沒有的兩件事：
  ① **乾跑規劃** —— ⛔ 不寫任何檔就答得出「接完剩幾個 draw」；
  ② **絕不就地覆蓋** —— 先複製到 `--out`，再接**那一份複本**（optimize.ts 的那條不可
     談判的規則）。上游的 `merge()` 是就地寫的，⛔ 所以不可以拿來直接指著出貨檔。

⚠️ ⭐ **「draw call」與「primitive」不是同一個數**：預算數的是 **node×primitive**
（一個 mesh 被兩個 node 引用就畫兩次），而 `merge()` 動的是那個 mesh 的 primitive
清單。⇒ 接完的 draw 數 = 引用它的 node 數 × 接完的 primitive 數。
⛔ 把兩者當成同一個，會在「同一顆 mesh 被多個 node 引用」時預測錯。

  python3 merge_prims.py <src.glb> --plan            # 只回答,⛔ 不寫檔
  python3 merge_prims.py <src.glb> --out <dst.glb>   # 複製再接複本,⛔ 不碰 src
"""
from __future__ import annotations

import argparse
import json
import pathlib
import shutil
import struct
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "w3x-import"))
from glb_draw_state import is_blend, merge_groups  # noqa: E402
from merge_glb_prims import merge as _merge  # noqa: E402


def read_json_chunk(path: str) -> dict:
    """只讀 JSON chunk —— 規劃⛔ 不需要碰幾何位元組（一顆 20 MB 的模型只讀前幾 KB）。"""
    with open(path, "rb") as f:
        f.read(12)
        length, _ = struct.unpack("<II", f.read(8))
        return json.loads(f.read(length).decode("utf-8"))


def plan(path: str) -> dict:
    """接完會剩幾個 draw —— ⭐ 逐條鏡射 `merge_glb_prims.merge()` 的前置判斷。

    ⛔ 這裡不可以自己另立一套「可不可以接」的規則：規劃與實作只要有一條不一致，
    規劃就會答應一件實作做不到的事，⭐ 而那個落差要等到 apply 才會被發現。
    """
    doc = read_json_chunk(path)
    nodes = doc.get("nodes", []) or []
    meshes = doc.get("meshes", []) or []
    prim_of = [
        (ni, pi)
        for ni, n in enumerate(nodes)
        if n.get("mesh") is not None
        for pi in range(len(meshes[n["mesh"]].get("primitives", []) or []))
    ]
    draws = len(prim_of)
    out = {"beforeDraws": draws, "afterDraws": draws, "mergeable": False, "skip": ""}
    if draws <= 1:
        out["skip"] = "只有一個 primitive,不用合併"
        return out

    used = {nodes[ni]["mesh"] for ni, _ in prim_of}
    if len(used) != 1:
        out["skip"] = f"有 {len(used)} 個 mesh —— 上游的合併器只接單一 mesh（各 mesh 節點的變換不同）"
        return out

    mesh_index = next(iter(used))
    prims = meshes[mesh_index]["primitives"]
    order = merge_groups(doc, [p.get("material") for p in prims])
    # ⭐ 預算數的是 node×primitive ⇒ 要乘回引用這顆 mesh 的節點數。
    refs = sum(1 for n in nodes if n.get("mesh") == mesh_index)
    out["beforePrims"] = len(prims)
    out["afterPrims"] = len(order)
    out["afterDraws"] = refs * len(order)
    # ⭐ 「是不是半透明」也只問上游那一份判準,⛔ 不在這裡自己讀 alphaMode。
    out["blendPrims"] = sum(1 for p in prims if is_blend(doc, p.get("material")))
    if out["afterDraws"] >= draws:
        out["skip"] = "每個 primitive 的畫法都不同（或都是半透明）,已經是最少的 draw call"
        return out
    out["mergeable"] = True
    return out


def apply(src: str, dst: str) -> dict:
    """⭐ 先複製再接**複本** —— ⛔ `src` 一個位元組都不會被動到。"""
    report = plan(src)
    if not report["mergeable"]:
        return report
    pathlib.Path(dst).parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, dst)
    report["note"] = _merge(dst)
    report["wrote"] = dst
    after = plan(dst)
    # ⭐ 量**產物**,⛔ 不是複述規劃 —— 規劃是預測,而預測要被產物證實。
    report["afterDraws"] = after["beforeDraws"]
    return report


def main() -> int:
    ap = argparse.ArgumentParser(description="merge same-render-state primitives (picture-preserving)")
    ap.add_argument("src")
    ap.add_argument("--out", default=None, help="寫這裡（⛔ 沒給就是乾跑）")
    ap.add_argument("--plan", action="store_true", help="只規劃,⛔ 不寫檔")
    a = ap.parse_args()
    report = plan(a.src) if (a.plan or not a.out) else apply(a.src, a.out)
    print(json.dumps(report, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
