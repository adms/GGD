#!/usr/bin/env python3
"""GH#1186 第二步 —— **GEOA 翻譯的母體、涵蓋率，與三條路的取捨**。

⚠️ 這支存在的理由是一個**分母問題**（CLAUDE.md「讀一張表之前先問這一欄的分母是什麼」）：
   #1186 票文量到「162 份 MDX 裡 **83 份帶 GEOA**（51%）」，⭐ 而那個數字回答的是
   「**這個 chunk 在不在**」—— ⛔ 不是「**有幾片要翻譯**」。
   ⭐ 一筆 GEOA 只要 alpha 從頭到尾都是 1，它**翻譯出來是空的**：
      原作每個動作都顯示它，轉出來每個動作都顯示它 —— 兩邊一樣，⛔ 沒有缺陷。
   ⇒ 真正的工作量是**逐動作會變**的那些，而它是 83 的一個**小**子集。

⭐ 2026-09-19 實跑（母體＝本樹的 w3x 地圖封包，⛔ 不含 ou99 論壇模型）：

    掃描 MDX 261 份 → 帶 GEOA 131 份 → ⚠️ **去重後 66 份**
      （`GoDieEX22s/raw` 與 `GoDieEX22s-src/raw` 兩棵樹 65/66 同名**且位元組相同**
       ⇒ ⛔ 不去重會把每一個數字灌成兩倍）
    GEOA 377 筆 → always-on 215（⭐ 翻譯出來是空的）· always-off 2 · **conditional 160**
    ⇒ ⭐ **去重後：31 份模型 / 80 片**，而這 31 份**全部**有出貨 GLB。

⚠️ ⛔ 上面的 261/131 是**檔案數**，⛔ 不是模型數 —— 這支預設印去重後的數字，
   要看檔案層級用 `--raw`。（⭐ 本專案記過「一個被 glob 灌大的統計，讀起來跟真的一模一樣」。）

── 為什麼是「插顯示節點 + 骨頭子樹 scale」而不是票文列的那兩條 ──────────────

  (a) **動 material 的 alpha 逐段軌**
      ⛔ 量到 **5/31 份**的 conditional 幾何與**別的幾何共用同一份材質**
         （`HeroIchigo` 的卍解兩具身體共用 material 0／3）⇒ 動材質會**一起**隱藏錯的東西。
      ⚠️ 而 GH#1164 還會把「畫起來逐像素一樣」的材質**再合併一次** ⇒ 共用只會更多。
      （⚠️ 它還需要 `KHR_animation_pointer`——Babylon 7.x 有，⛔ 但核心 glTF 沒有。）

  (b) **把 geoset 拆成自己的節點再 scale 歸零**
      ⛔⛔ **結構上無效**：這些是**蒙皮**模型，而 glTF 規範要求忽略蒙皮網格自己節點的變換。
         Babylon 的載入器逐字寫著「effectively ignores the transform of the skinned mesh,
         **as per spec**」（`glTFLoader.js:669`）⇒ ⭐ 縮節點**什麼都不會發生**：
         合法 glTF、零報錯、畫面一模一樣 —— ⛔ 正是本專案最常記的那種缺陷。
      ⛔ 而且就算它有效：拆節點 = 拆 primitive ⇒ 量到 **12/31 份**會把 draw call
         推過出貨上限 6（`negi` 7 → 13）。

  (c) ⭐ **在那一片專用骨頭子樹上方插一個顯示節點，每個動作一條 STEP scale 軌**
      ⇒ **0 個新 draw call、0 個新 primitive**（只追加 node／accessor／animation channel）。
      ⭐ 已實作並出貨：`restore_geoset_visibility.py`（commit 19b07ca85，拳四郎／初號機）。
      量到 **77/80 片**滿足它的前提④（alpha 只有 0／1、STEP、非 global sequence）。

    python3 tools/w3x-import/geoa_translation_census.py [--json out.json] [--verbose] [--raw]
    python3 tools/w3x-import/geoa_translation_census.py --selftest   # ⭐ 量尺自證（兩個方向）

⛔ 它**只讀不寫**（除了 `--json`）：⛔ 不碰 content/、⛔ 不轉檔、⛔ 不動任何 glb。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import struct
import sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)
import geoset_alpha_report as gar  # noqa: E402

#: 出貨的 draw call 上限。⚠️ 這是**參考值**，⛔ 不是第二個住處 —— 真正的來源是
#: `packages/shared/src/content/modelUpload/budget.ts` 的 `HERO_MODEL_BUDGET.meshes`
#: （2026-09-19 實算：limit 6／warn 3）。這支只拿它印一句話，⛔ 沒有人讀它做決定。
DRAW_CALL_LIMIT_REF = 6

MDX_ROOTS = [
    os.path.join(HERE, "out", "GoDieEX22s", "raw"),
    os.path.join(HERE, "out", "GoDieEX22s-src", "raw"),
]
GLB_DIR = os.path.join(REPO, "content", "assets", "models", "imported")


def find_mdx() -> list[str]:
    """⚠️ 大小寫**不分**：本樹有 24 份 `.MDX` 與 1 份 `.MDx`（`HeroMiku.MDx`）——
    一個 `find -name '*.mdx'` 會少掉 25 份（9.6%）。
    ⭐ 出貨的匯入器本來就是 `.lower().endswith('.mdx')`（`models.py:564`），
    ⛔ 所以少算的是掃描的人，不是匯入器。"""
    out = []
    for root in MDX_ROOTS:
        for dirpath, _dirs, files in os.walk(root):
            for f in files:
                if f.lower().endswith(".mdx"):
                    out.append(os.path.join(dirpath, f))
    return sorted(out)


def shipped_draw_calls(stem: str) -> tuple[str | None, int | None]:
    """出貨 GLB 的路徑與 **draw call 數**（＝`inspectModelUpload` 數的 primitive 對數）。"""
    path = os.path.join(GLB_DIR, gar.slug(stem) + ".glb")
    if not os.path.exists(path):
        return None, None
    try:
        data = open(path, "rb").read()
        jlen = struct.unpack_from("<I", data, 12)[0]
        j = json.loads(data[20:20 + jlen])
        return path, sum(len(m.get("primitives", [])) for m in j.get("meshes", []))
    except Exception:
        return path, None


def classify(mdx_path: str) -> dict | None:
    with open(mdx_path, "rb") as fh:
        data = fh.read()
    try:
        ch = gar.chunks(data)
    except Exception as exc:
        return {"path": mdx_path, "name": os.path.basename(mdx_path),
                "error": f"chunk 表讀不了: {exc}"}
    if "GEOA" not in ch or "SEQS" not in ch:
        return None
    try:
        seqs = gar.parse_seqs(data, *ch["SEQS"][0])
        geoas = gar.parse_geoa(data, *ch["GEOA"][0])
        geos = gar.parse_geos(data, *ch["GEOS"][0]) if "GEOS" in ch else []
    except Exception as exc:
        return {"path": mdx_path, "name": os.path.basename(mdx_path),
                "error": f"GEOA/SEQS/GEOS 解析失敗: {exc}"}
    if not seqs:
        return {"path": mdx_path, "name": os.path.basename(mdx_path),
                "error": "沒有任何序列"}

    rows = []
    for ga in geoas:
        track = ga["tracks"].get("KGAO")
        static_alpha = ga["static_alpha"]
        on = 0
        for s in seqs:
            a = gar.alpha_in_seq(track, static_alpha, s) if track else static_alpha
            on += 1 if a > 0.01 else 0
        kind = "conditional" if 0 < on < len(seqs) else ("always-on" if on else "always-off")
        binary = True
        if track:
            for _f, v in track["keys"]:
                if not (abs(v) < 0.01 or abs(v - 1.0) < 0.01):
                    binary = False
                    break
        step = (track["interp"] == 0) if track else True
        gseq = (track["gseq"] >= 0) if track else False
        gi = ga["geoset"]
        rows.append({
            "geoset": gi, "kind": kind,
            "verts": geos[gi]["nverts"] if gi < len(geos) else None,
            "material": geos[gi]["material"] if gi < len(geos) else None,
            "seqs_on": on, "seqs_total": len(seqs),
            "tool_ok": bool(binary and step and not gseq),
            "why_not": None if (binary and step and not gseq) else
                       ("global sequence" if gseq else
                        ("alpha 不是 0／1" if not binary else "有內插（非 STEP）")),
        })

    cond_gi = {r["geoset"] for r in rows if r["kind"] == "conditional"}
    cond_mats = {geos[i]["material"] for i in cond_gi if i < len(geos)}
    other_mats = {g["material"] for i, g in enumerate(geos) if i not in cond_gi}
    stem = os.path.splitext(os.path.basename(mdx_path))[0]
    glb, draws = shipped_draw_calls(stem)
    cond = [r for r in rows if r["kind"] == "conditional"]
    return {
        "path": os.path.relpath(mdx_path, REPO),
        "name": os.path.basename(mdx_path), "stem": stem,
        "sha256": hashlib.sha256(data).hexdigest(),
        "sequences": len(seqs), "geoa_total": len(rows),
        "always_on": sum(1 for r in rows if r["kind"] == "always-on"),
        "always_off": sum(1 for r in rows if r["kind"] == "always-off"),
        "conditional": len(cond),
        "conditional_tool_ok": sum(1 for r in cond if r["tool_ok"]),
        # ⭐ 路徑(a) 的否決條件：這一片與別的幾何共用材質 ⇒ 動材質會一起隱藏錯的東西
        "material_clash": sorted(cond_mats & other_mats),
        "shipped_glb": os.path.relpath(glb, REPO) if glb else None,
        "draw_calls": draws,
        "rows": rows,
    }


def collect() -> tuple[list[dict], list[dict], int]:
    """回傳 (去重後的模型, 解析失敗的, 掃描檔案數)。⭐ 去重以**內容 sha256** 為準。"""
    files = find_mdx()
    by_hash: dict[str, dict] = {}
    errors = []
    for p in files:
        r = classify(p)
        if r is None:
            continue
        if r.get("error"):
            errors.append(r)
            continue
        by_hash.setdefault(r["sha256"], r)
    return sorted(by_hash.values(), key=lambda m: m["name"].lower()), errors, len(files)


def selftest() -> int:
    """⭐ 量尺自證 —— **兩個方向**（CLAUDE.md：只驗單邊的尺不算自證過）。

    ＋方向：`HeroIchigo` 的卍解**兩具身體**。這個事實是**獨立量過**的，逐字記在
            `geoset_alpha_report.alpha_in_seq` 的檔頭（GH#742）：
            geoset1 = 540 頂點、geoset2 = 739 頂點，兩者**互補**地切開全部序列。
    －方向：`BlackHole1` 帶 3 筆 GEOA 而**每一筆都是 always-on**
            ⇒ ⭐ 這支**不可以**無中生有報出 conditional。
    """
    models = {m["name"].lower(): m for m in collect()[0]}
    fails = []

    ichigo = models.get("heroichigo.mdx")
    if not ichigo:
        fails.append("＋方向探針不見了：HeroIchigo.mdx")
    else:
        got = {r["verts"]: r for r in ichigo["rows"] if r["kind"] == "conditional"}
        for verts in (540, 739):
            if verts not in got:
                fails.append(f"＋方向：{verts} 頂點那一片沒有被判成 conditional")
        if 540 in got and 739 in got:
            a, b = got[540]["seqs_on"], got[739]["seqs_on"]
            if a + b != ichigo["sequences"]:
                fails.append(f"＋方向：兩具身體應該互補切開 {ichigo['sequences']} 個動作，"
                             f"量到 {a}+{b}={a + b}")

    black = models.get("blackhole1.mdx")
    if not black:
        fails.append("－方向探針不見了：BlackHole1.mdx")
    elif black["conditional"] != 0:
        fails.append(f"－方向：BlackHole1 應該 0 片 conditional，量到 {black['conditional']}")

    for f in fails:
        print("⛔ " + f)
    if fails:
        print("\n⛔⛔ 這把尺沒有自證過 ⇒ 它的**一切結論作廢**。")
        return 1
    print("✅ 兩個方向都通過：")
    print(f"   ＋ HeroIchigo 卍解兩具身體 540/739 頂點，"
          f"{got[540]['seqs_on']}+{got[739]['seqs_on']} = {ichigo['sequences']} 個動作（互補）")
    print("   － BlackHole1 的 3 筆 GEOA 全是 always-on ⇒ 報 0 片 conditional")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json")
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--raw", action="store_true", help="印檔案層級（⛔ 含重複）的數字")
    ap.add_argument("--selftest", action="store_true", help="量尺自證（兩個方向）")
    args = ap.parse_args()
    if args.selftest:
        return selftest()

    models, errors, nfiles = collect()
    cond_models = [m for m in models if m["conditional"]]
    cond_total = sum(m["conditional"] for m in cond_models)
    cond_ok = sum(m["conditional_tool_ok"] for m in cond_models)
    shipped = [m for m in cond_models if m["shipped_glb"]]

    print(f"掃描 MDX 檔案                  {nfiles}   （⚠️ 大小寫不分：含 24 份 .MDX ＋ 1 份 .MDx）")
    print(f"帶 GEOA —— ⭐ **去重後模型數**   {len(models)}")
    if args.raw:
        print("   ⚠️ --raw：兩棵來源樹同名且位元組相同的檔會各算一次")
    if errors:
        print(f"⛔ 解析失敗                     {len(errors)}")
        for e in errors[:5]:
            print(f"   · {e['name']} —— {e['error']}")
    print()
    print("⭐ GEOA 逐筆分類（⛔ 『有沒有 GEOA』不是工作量）")
    print(f"   always-on   每個動作都顯示   {sum(m['always_on'] for m in models):4d}"
          "   ⇒ ⭐ 翻譯出來是空的")
    print(f"   always-off  每個動作都不顯示  {sum(m['always_off'] for m in models):4d}"
          "   ⇒ 該丟的幾何")
    print(f"   conditional 逐動作會變        {cond_total:4d}"
          "   ⇒ ⭐ #1186 真正要翻的")
    print()
    print(f"⭐⭐ **工作佇列：{len(cond_models)} 份模型 / {cond_total} 片**"
          f"（⛔ 不是『帶 GEOA 的 {len(models)} 份』）")
    print(f"     其中出貨 GLB 存在            {len(shipped)} 份")
    print(f"     滿足 restore_geoset_visibility 前提④  {cond_ok} / {cond_total} 片")
    why = Counter(r["why_not"] for m in cond_models for r in m["rows"]
                  if r["kind"] == "conditional" and not r["tool_ok"])
    for k, v in why.most_common():
        print(f"     ⛔ 前提④不成立：{k} —— {v} 片")
    print()
    print("⭐ 三條路的取捨（⛔ 都是量到的，不是判斷）")
    clash = [m for m in cond_models if m["material_clash"]]
    print(f"   (a) 動材質 alpha   ⛔ {len(clash)}/{len(cond_models)} 份的 conditional 幾何"
          "與別的幾何**共用材質** ⇒ 會一起隱藏錯的東西")
    over = [m for m in shipped if m["draw_calls"] is not None
            and m["draw_calls"] + m["conditional"] > DRAW_CALL_LIMIT_REF]
    print(f"   (b) 拆節點 scale   ⛔ **對蒙皮模型結構上無效**（Babylon 逐字忽略蒙皮網格的節點變換）；")
    print(f"                        就算有效也有 {len(over)}/{len(shipped)} 份會超過 draw call 上限 {DRAW_CALL_LIMIT_REF}")
    print(f"   (c) 插顯示節點＋骨頭子樹 scale  ⭐ **0 個新 draw call**（已出貨：restore_geoset_visibility.py）")

    if args.verbose:
        print()
        print("工作佇列逐份（片數 / 前提④ / 目前 draw call / 路徑(b) 後）：")
        for m in sorted(cond_models, key=lambda x: -x["conditional"]):
            d = m["draw_calls"]
            after = f"{d + m['conditional']}" if isinstance(d, int) else "?"
            flag = " ⛔超上限" if isinstance(d, int) and d + m["conditional"] > DRAW_CALL_LIMIT_REF else ""
            mc = f"  ⛔共用材質{m['material_clash']}" if m["material_clash"] else ""
            print(f"  {m['conditional']:2d} 片  ④{m['conditional_tool_ok']:2d}  "
                  f"draw {d} → {after}{flag}  {m['stem']}{mc}")

    if args.json:
        with open(args.json, "w", encoding="utf-8") as fh:
            json.dump({
                "scanned_files": nfiles, "models_with_geoa": len(models),
                "conditional_models": len(cond_models), "conditional_total": cond_total,
                "conditional_tool_ok": cond_ok, "shipped": len(shipped),
                "material_clash_models": len(clash), "draw_call_over_models": len(over),
                "models": models, "errors": errors,
            }, fh, ensure_ascii=False, indent=2)
        print(f"\n→ {args.json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
