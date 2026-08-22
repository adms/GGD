#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/vfx-bind/scan.py —— 把「哪一支技能該播原作的哪一份特效」從**證據**推導出來。

    python3 tools/vfx-bind/scan.py            # 重新產生 content/config/ability-vfx-bindings.json
    python3 tools/vfx-bind/scan.py --check    # 唯讀:逐位元組比對 + 跨表對帳,漂了就非零離開
    python3 tools/vfx-bind/scan.py --report   # 只印人看的摘要,不寫檔

⭐ 為什麼是一支**產生器**而不是一張手寫表(CLAUDE.md 第〇·四守則)
------------------------------------------------------------------
一支技能該播哪一份 `fx.w3x.*`,答案完整地住在三個**已經存在**的地方:

  1. `content/assets/vfx/w3x-ability-provenance.json` —— IMMUTABLE ARCHAEOLOGY
     (技能 rawcode ↔ 原作藝術 ↔ 抽出來的 emitter 文件 id)
  2. `content/vfx/*.json`                            —— 哪幾份 emitter 真的出貨了
  3. `content/abilities/*.json`                      —— 哪幾支技能今天還活著

⇒ 把結論**抄**進 420 份技能文件的 `vfxKey` 是第二個住處,而且它會過期:
  抽取器多收一個模型、一支技能被退休、一份 emitter 被砍 —— 每一次都讓那 420 份
  裡的某幾份變成謊話,而**沒有任何東西會紅**。所以結論住一張表,表由這支腳本產生,
  `--check` 逐位元組比對。

⚠️ 這支腳本**刻意不寫時間戳**。任何隨時鐘變動的欄位都會讓逐位元組比對永遠不相等,
於是 `--check` 只能被放寬成模糊比對 —— 而一條被放寬的閘等於沒有閘
(同 `pnpm caps:export` / `pnpm spec:build` 的理由)。

⭐ 四道閘,順序固定 —— 一列必須全過才叫 CONFIRMED
------------------------------------------------------------------
| # | 閘 | ⛔ 沒有它會怎樣 |
|---|---|---|
| 1 | `joinConfidence == CONFIRMED` | rawcode↔技能 的 join 是猜的 → 綁到**別支技能的特效** |
| 2 | `provenance ∈ {w3a-override, w3h-override, jass-literal}` | 暴雪內建繼承**不是作者意圖**(見 provenance 檔的 `provenanceContract`) |
| 3 | `rootAnchored == emitterTotal > 0` | 掛在模型自己動畫節點上的 emitter,用世界座標重播會全部從同一點噴 —— 一團而不是一圈。這一道是既有的**可渲染性閘**(`apps/client/src/render/vfx/w3xAbilityArt.ts` 檔頭逐字記著 divinering 20 顆的量測),⛔ 這裡只是把它從散文變成程式,**沒有推翻它** |
| 4 | 每一份 `layerDocIds` 都在 `content/vfx/`,而且技能還活著 | 綁一份不存在的文件 = 這一招完全沒有特效(第一·五守則的空宣稱) |

沒過的**每一份** emitter 文件都會進 `unmatched`,帶著**能被反駁的理由**(哪一道閘、
量到的數字是多少),⛔ 不是「還沒收」。

⭐ 為什麼一列存的是 `vfxKeys`(陣列)而不是票上寫的 `vfxKey`(單值)
------------------------------------------------------------------
一次原作施法 = **一組** emitter(`holyawakening` 是 6 顆)。存一個 `vfxKey` 再另外
存一份 `extra` 的話,「主 emitter 是哪一顆」就變成一個**存下來的值**,而它是一條
規則算得出來的(`vfxKeys[0]`)—— 那就是第〇·四守則說的第二個住處。
⇒ 這裡只存**有序的整組**,主 emitter 由 `resolveAbilityVfxSource()` 依規則取第一顆。

⭐ 跨表對帳(`--check` 的第二半)
------------------------------------------------------------------
`content/config/vfx-ability-art.json` 的 `bindings.<id>.promoted` 是**客戶端渲染層**
的同一組結論。兩張表帶同一份值,所以它們之間必須有閘,否則就是無守衛的第二住處:

  · `MISSING`   —— 這裡推導得出來,`promoted` 沒有 → 那支技能拿不到原作藝術
  · `DEAD`      —— `promoted` 有,但那支技能已經不在 `content/abilities/` → 空宣稱
  · `SET-DRIFT` —— 兩邊的 emitter 集合不一樣 → 有一邊在說謊

⛔ 對帳**只回報,不自動改** `vfx-ability-art.json` —— 那份檔案有它自己的產生鏈
(`tools/w3x-import/build_vfx_bindings.py`),兩支腳本互相覆寫會變成無限迴圈。
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any

REPO = os.path.dirname(os.path.dirname(os.path.abspath(os.path.dirname(__file__) + "/../")))
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))

PROVENANCE = os.path.join(REPO, "content", "assets", "vfx", "w3x-ability-provenance.json")
VFX_DIR = os.path.join(REPO, "content", "vfx")
ABILITY_DIR = os.path.join(REPO, "content", "abilities")
ABILITY_ART = os.path.join(REPO, "content", "config", "vfx-ability-art.json")
OUT = os.path.join(REPO, "content", "config", "ability-vfx-bindings.json")

SCHEMA_TAG = "config.ability-vfx-bindings@1"
DOC_ID = "ability-vfx-bindings"

# 作者**自己**設的來源。⛔ `stock-inherited` / `stock-buff-inherited` 不算意圖 ——
# 那是 WC3 沿用了暴雪內建技能的欄位,而且那些模型根本不在這個 repo 裡。
INTENT_PROVENANCE = ("w3a-override", "w3h-override", "jass-literal")

# 一列最多幾顆 emitter —— 對齊 `ABILITY_VFX_LAYER_HARD_CAP`(shared 那一側的絕對上限)。
# ⚠️ 超過的家族不是被截斷,是**整列被拒**並進 `unmatched`:截斷會讓表面上綁好了、
# 畫面上少一半,而那是安靜的失敗。
MAX_LAYERS = 6


def _load_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def _shipped_vfx_ids() -> set[str]:
    return {
        f[:-5]
        for f in os.listdir(VFX_DIR)
        if f.endswith(".json") and not f.startswith("_")
    }


def _live_abilities() -> dict[str, dict]:
    out: dict[str, dict] = {}
    for f in sorted(os.listdir(ABILITY_DIR)):
        if not f.endswith(".json") or f.startswith("_"):
            continue
        doc = _load_json(os.path.join(ABILITY_DIR, f))
        aid = doc.get("id")
        if aid:
            out[aid] = doc
    return out


def _reached_by_other_paths(live: dict[str, dict]) -> dict[str, str]:
    """哪些 emitter 文件已經由**別條**路徑抵達畫面 —— 純讀取,只為了註記。"""
    out: dict[str, str] = {}

    def mark(doc_id: str, how: str) -> None:
        if doc_id and doc_id not in out:
            out[doc_id] = how

    for aid, doc in live.items():
        keys = [doc.get("vfxKey")] + [l.get("vfxKey") for l in (doc.get("vfxLayers") or [])]
        for k in keys:
            if k:
                mark(k, f"技能 `{aid}` 的 vfxKey")
    if os.path.exists(ABILITY_ART):
        for aid, row in _load_json(ABILITY_ART).get("bindings", {}).items():
            p = row.get("promoted") if isinstance(row, dict) else None
            if not p:
                continue
            for k in [p["primary"], *p["extra"]]:
                mark(k, f"vfx-ability-art.json 的 promoted 列 `{aid}`")
    return out


def derive() -> dict[str, Any]:
    prov = _load_json(PROVENANCE)
    abilities: dict[str, dict] = prov["abilities"]
    models: dict[str, dict] = prov["models"]
    shipped = _shipped_vfx_ids()
    live = _live_abilities()

    bindings: list[dict[str, Any]] = []
    # emitter 文件 id → 它為什麼沒被綁上(第一個踩到的閘就是理由)
    rejected: dict[str, str] = {}

    def reject(doc_ids: list[str], why: str) -> None:
        for d in doc_ids:
            if d in shipped and d not in rejected:
                rejected[d] = why

    for aid in sorted(abilities):
        rec = abilities[aid]
        join = rec.get("joinConfidence")
        rawcodes = tuple(rec.get("rawcodes") or ())
        for ex in rec.get("extractions", []):
            docs = list(ex.get("layerDocIds") or [])
            stem = ex.get("stem")
            model = models.get(stem or "", {})
            total = int(model.get("emitterTotal") or 0)
            root = int(model.get("rootAnchored") or 0)

            # 閘 1 —— rawcode↔技能 的 join
            if join != "CONFIRMED":
                reject(
                    docs,
                    f"閘1 join —— 這個模型只經由 joinConfidence={join} 的技能列連到技能,"
                    "自動綁上去可能是**別支技能的特效**。⭐ 人工裁決過的可以留在 "
                    "`vfx-ability-art.json` 的 promoted 列(對帳會標成 EXTRA,⛔ 不是錯)",
                )
                continue
            # 閘 2 —— 作者意圖
            if ex.get("provenance") not in INTENT_PROVENANCE:
                reject(docs, f"閘2 意圖 —— provenance={ex.get('provenance')},那是 WC3 從暴雪內建技能繼承來的欄位,⛔ 不是作者設的")
                continue
            # 閘 3 —— 可渲染性(既有的 root-anchor 閘)
            if total <= 0:
                reject(docs, "閘3 可渲染性 —— 這個模型抽不出任何 PRE2/RIBB emitter(emitterTotal=0)")
                continue
            if root != total:
                reject(
                    docs,
                    f"閘3 可渲染性 —— {total} 顆 emitter 只有 {root} 顆掛在模型根節點;"
                    "其餘掛在模型自己的動畫節點上,用世界座標重播會全部從同一點噴出("
                    "一團而不是一圈/一條龍捲)。⭐ 綁上去會讓辨識度**變差**,"
                    "⛔ 這不是「還沒收」",
                )
                continue
            # 閘 4a —— 文件真的出貨了
            missing = [d for d in docs if d not in shipped]
            if missing or not docs:
                reject(docs, f"閘4 出貨 —— 這一族有 {len(missing)} 份 emitter 文件不在 content/vfx/")
                continue
            if len(docs) > MAX_LAYERS:
                reject(docs, f"閘4 層數 —— 這一族有 {len(docs)} 顆 emitter,超過一支技能的層數硬上限 {MAX_LAYERS}")
                continue
            # 閘 4b —— 技能還活著
            if aid not in live:
                reject(docs, f"閘4 技能 —— 唯一引用它的技能 `{aid}` 已經不在 content/abilities/(英雄退休)")
                continue

            bindings.append(
                {
                    "abilityId": aid,
                    "vfxKeys": docs,
                    "source": f"{ex.get('provenance')}:{ex.get('channel')}",
                    "rawcode": rawcodes[0] if rawcodes else "",
                    "confidence": "CONFIRMED",
                }
            )

    # 一支技能可能有好幾條證據(caster + missile + buff)。取**第一條過閘的**,
    # 並把其餘那幾族記進 unmatched —— ⛔ 不是靜靜丟掉。
    seen: set[str] = set()
    deduped: list[dict[str, Any]] = []
    for row in bindings:
        if row["abilityId"] in seen:
            reject(row["vfxKeys"], f"同一支技能 `{row['abilityId']}` 已經由更前面的一條證據綁定(一支技能只播一組)")
            continue
        seen.add(row["abilityId"])
        deduped.append(row)
    bound_docs = {d for r in deduped for d in r["vfxKeys"]}

    # 剩下的 fx.w3x.* —— 連一條技能證據都沒有碰過
    for doc_id in sorted(shipped):
        if not doc_id.startswith("fx.w3x."):
            continue
        if doc_id in bound_docs or doc_id in rejected:
            continue
        stem = None
        for s, m in models.items():
            if doc_id in (m.get("layerDocIds") or []):
                stem = s
                break
        if stem is None:
            rejected[doc_id] = "⚠️ 這份 emitter 文件在 `models` 裡找不到來源模型 —— 它是別條產生鏈(例:extract_stock_vfx.py 的零售 MPQ 抽取)的產物,不歸這張表管"
        else:
            rejected[doc_id] = f"原作地圖裡**沒有任何技能**引用模型 `{stem}`(models.referencedBy 是空的)—— 它掛在單位/道具/裝飾物上,或整個沒被用到"

    # ⚠️ 「這張表沒綁它」≠「沒有人在用它」。把**其他**已知路徑標出來,否則
    # `unmatched` 會被讀成一張孤兒清單,而那個結論是錯的(例:FireRingFx 直接
    # 點名 4 份 flamessmoke、`fx.w3x.stock.*` 走家族原型規則)。
    otherwise_used = _reached_by_other_paths(live)
    unmatched = [
        {
            "vfxKey": d,
            "why": ("⚠️ 已由其他路徑使用(" + otherwise_used[d] + ")—— " if d in otherwise_used else "")
            + rejected[d],
        }
        for d in sorted(rejected)
        if d.startswith("fx.w3x.") and d not in bound_docs
    ]

    return {
        "id": DOC_ID,
        "schema": SCHEMA_TAG,
        "bindings": sorted(deduped, key=lambda r: r["abilityId"]),
        "unmatched": unmatched,
    }


def _serialize(doc: dict[str, Any]) -> str:
    return json.dumps(doc, ensure_ascii=False, indent=2) + "\n"


def crosscheck(doc: dict[str, Any]) -> list[str]:
    """對帳 `config.vfx-ability-art@1.bindings.<id>.promoted`。回傳一串問題。"""
    if not os.path.exists(ABILITY_ART):
        return ["⚠️ 找不到 content/config/vfx-ability-art.json —— 跳過跨表對帳"]
    art = _load_json(ABILITY_ART).get("bindings", {})
    live = set(_live_abilities())
    promoted = {
        aid: {row["promoted"]["primary"], *row["promoted"]["extra"]}
        for aid, row in art.items()
        if isinstance(row, dict) and row.get("promoted")
    }
    derived = {r["abilityId"]: set(r["vfxKeys"]) for r in doc["bindings"]}

    problems: list[str] = []
    for aid in sorted(set(derived) - set(promoted)):
        problems.append(f"MISSING   {aid} —— 證據過了四道閘,但 vfx-ability-art.json 沒有 promoted 列 ⇒ 這支技能拿不到原作藝術")
    for aid in sorted(set(promoted) - live):
        problems.append(f"DEAD      {aid} —— vfx-ability-art.json 有 promoted 列,但這支技能不在 content/abilities/ ⇒ 空宣稱(第一·五守則)")
    for aid in sorted((set(promoted) & live) - set(derived)):
        problems.append(
            f"EXTRA     {aid} —— promoted 有、推導沒有 ⇒ 人工裁決(閘 1/3 沒過但有人看過證據)。"
            "⛔ 這不是缺陷,列出來只是為了「沒有一列是無人知曉的」"
        )
    for aid in sorted(set(derived) & set(promoted)):
        if derived[aid] != promoted[aid]:
            only_d = sorted(derived[aid] - promoted[aid])
            only_p = sorted(promoted[aid] - derived[aid])
            problems.append(f"SET-DRIFT {aid} —— 推導多了 {only_d}、promoted 多了 {only_p}")
    return problems


def main() -> int:
    ap = argparse.ArgumentParser(description="從原作證據推導技能→原作特效綁定表")
    ap.add_argument("--check", action="store_true", help="唯讀:逐位元組比對 + 跨表對帳")
    ap.add_argument("--report", action="store_true", help="只印摘要,不寫檔")
    ap.add_argument(
        "--strict",
        action="store_true",
        help="讓跨表對帳的 MISSING/DEAD/SET-DRIFT 也回非零(⭐ 那幾筆修完之後,"
        "把 skills:check 裡的這一支改成 --check --strict,閘就從此關上)",
    )
    args = ap.parse_args()

    doc = derive()
    text = _serialize(doc)
    problems = crosscheck(doc)

    if args.report or args.check:
        print(f"綁定 {len(doc['bindings'])} 支技能 / 未綁 {len(doc['unmatched'])} 份 fx.w3x.* emitter 文件")
        for p in problems:
            print("  " + p)

    if args.check:
        if not os.path.exists(OUT):
            print(f"⛔ {OUT} 不存在 —— 跑一次 `python3 tools/vfx-bind/scan.py`", file=sys.stderr)
            return 1
        with open(OUT, "r", encoding="utf-8") as fh:
            have = fh.read()
        fatal = [p for p in problems if not p.startswith(("EXTRA", "⚠️"))] if args.strict else []
        if fatal:
            print(f"⛔ 跨表對帳有 {len(fatal)} 筆問題(--strict)", file=sys.stderr)
            return 1
        if have != text:
            print(
                f"⛔ {os.path.relpath(OUT, REPO)} 過期了 —— 跑 `python3 tools/vfx-bind/scan.py` 然後 git add",
                file=sys.stderr,
            )
            return 1
        print("✅ 綁定表與證據一致")
        return 0

    if args.report:
        return 0

    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(text)
    print(f"寫入 {os.path.relpath(OUT, REPO)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
