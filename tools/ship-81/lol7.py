#!/usr/bin/env python3
"""⭐ 七名 LOL 英雄上架（GH#1165 / GH#1158）—— ⛔ 不是第三支產生器，是**同一條管線的第三批**。

> owner 2026-09-09（逐字）：「其實還有**七個LOL英雄**也要跟著上架喔」
> owner 2026-09-10（逐字）：「⋯**已經取得審查授權可以直接上架，被認定為預設官方角色**⋯
>  **全角色模型盤點.md 會持續更新模型預設對應表，請你也配合改變上架設定**」

⭐ **三張表 join，⛔ 零個新規則**（第零守則⑨：N 個同型 ＝ K 個模板 ＋ 一張表）：

  ① 英雄資料  ⭐ `packages/shared/src/content/heroForge/communityExamples.ts`
              （`COMMUNITY_HERO_EXAMPLES` —— 七名的六格招式、出身、改編說明、來源 URL）
  ② 模型      ⭐ owner 的 `全角色模型盤點.md` 第「LOL 追加 7 名」節 → `model_map.py`
  ③ 圖示      `docs/_reports/community-hero-icons-*/` ＋ 已出貨的 `content/assets/icons/`

⭐ 而**級距清洗、圖示接線、狀態機制補齊**全部**沿用 `gen.py` 的那三支函式** ——
⛔ 這一支一行都不重寫（第〇·四守則：一份知識一個住處）。

── ⛔⛔ 這一支推翻了 `b7a057080` 的結論 ────────────────────────────────
那個 commit 逐字寫著「**招式與數值不存在**⋯⛔ 而我不替社群作者發明招式與平衡」。
⭐ 它掃了 `content/` · `materials/recipes` · S3 的 13 個 manifest · 20 個 packageDigest ·
編輯器 catalog-store · 素材庫 —— ⛔ **而它沒有掃出貨的 TS**。
⇒ 那七名的招式在 `communityExamples.ts`，`20702b3a5`（2026-09-06）就併進 main 了，
  而 `docs/_reports/community-hero-forge/community-concepts/deterministic/proof.json`
  的 `status` 逐字是 **`passed`**（真的 SimWorld 跑過六格）。
⇒ ⭐ CLAUDE.md 那一條：「**我掃的是哪一條路？還有別條嗎？分母是誰？**」

## 執行順序（⛔ 這是第一步，不是最後一步）

    python3 tools/ship-81/lol7.py --inventory <全角色模型盤點.md> \
        --library <GGD-Asset-Library> --report docs/_reports/lol7-ship.json --write
    python3 tools/skill-remake/apply_tiers.py     # 級距 ＋ 英雄卡內嵌鏡射
    bash scripts/genrun.sh prose:build            # 卡面數字換成佔位
    python3 tools/skill-remake/apply_tiers.py     # ⭐ 再鏡射一次（佔位要進內嵌版）
    pnpm content:build
    # ⚠️ 上架面還要：starter.go 的 starterChampions ＋ starter_content_test.go 的 firstOpenRoster
    npx tsx tools/roster-guard/check.ts
"""
import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gen import (ICON_AB, ICON_CH, ICONS, OUT_AB, OUT_CH, attach_ability_icon,  # noqa: E402
                 backfill_status_mechanics, drop_baked_values, shipped_status_mechanics)
from model_map import catalog_titles, entry_for_model_key, parse_inventory, resolve, stale_blockers  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
OUT_VFX = REPO / "content/vfx-scripts"
OUT_TPL = REPO / "content/ability-templates"
SECTION = "LOL 追加 7 名"


def attach_champion_icon(champion: dict, placeholders: list[dict]) -> None:
    """⭐ 兩個住處都認（同 `attach_ability_icon`）——⛔ 誰先跑都一樣。"""
    hid = champion["id"]
    if (ICONS / "champions" / f"{hid}.webp").is_file() or (ICON_CH / f"{hid}.webp").is_file():
        champion["icon"] = f"assets/icons/champions/{hid}.webp"
    else:
        champion.pop("icon", None)
        placeholders.append({"field": "icon", "state": "no-generated-icon",
                             "why": f"⛔ 沒有產好的頭圖（找過 {ICONS.relative_to(REPO)}/champions/{hid}.webp "
                                    f"與 {ICON_CH.relative_to(REPO)}/{hid}.webp）"})


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--inventory", type=Path, required=True, help="全角色模型盤點.md（owner 的表）")
    ap.add_argument("--library", type=Path, required=True, help="GGD-Asset-Library 根目錄")
    ap.add_argument("--report", type=Path, help="逐名報告（⭐ 暫用的都列出來）")
    ap.add_argument("--write", action="store_true", help="⛔ 不給就是 dry-run")
    args = ap.parse_args()

    catalog_path = args.library / "catalog.json"
    titles = catalog_titles(catalog_path)
    lod = json.loads((REPO / "content/config/model-lod.json").read_text(encoding="utf-8"))
    stale = stale_blockers(args.inventory, int(lod["championChannelLimit"]))
    for b in stale:
        print(f"⚠️ 盤點表這一列的理由過期了：{b['row']} —— {b['why']}", file=sys.stderr)

    rows = []
    for row in parse_inventory(args.inventory):
        if not row["section"].startswith(SECTION):
            continue
        resolved = resolve(row, titles, "fighter")
        entry = entry_for_model_key(titles, resolved["modelKey"])
        src = ((entry or {}).get("provenance") or {}).get("sources") or [{}]
        rows.append({**row, **resolved, "assetId": (entry or {}).get("id"),
                     "assetTitle": (entry or {}).get("title"),
                     "glbPath": src[0].get("glbPath"), "glbSha256": src[0].get("sha256")})
    if not rows:
        raise SystemExit(f"⛔ 盤點表少了「{SECTION}」那一節 —— 母體塌了")

    with tempfile.TemporaryDirectory() as tmp:
        map_path = Path(tmp) / "models.json"
        map_path.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
        compiled_dir = Path(tmp) / "compiled"
        # ⭐ 編譯走**出貨的編輯器編譯器**（`compileHeroPackageProject`）——
        #   ⛔ 這一支不自己組 champion@1（那會是第二個住處）。
        proc = subprocess.run(
            ["npx", "tsx", str(REPO / "tools/ship-81/lol7_compile.mts"),
             "--library", str(args.library), "--map", str(map_path), "--out", str(compiled_dir)],
            cwd=REPO, capture_output=True, text=True)
        sys.stderr.write(proc.stderr)
        if proc.returncode != 0:
            raise SystemExit(f"⛔ 編譯失敗（exit {proc.returncode}）：{proc.stdout}")
        packs = [json.loads(f.read_text(encoding="utf-8"))
                 for f in sorted(compiled_dir.glob("*.json")) if f.name != "_compile.json"]

    status_mech = shipped_status_mechanics()
    report_rows = []
    for pack in packs:
        placeholders: list[dict] = []
        champion = drop_baked_values(pack["champion"])
        from model_map import preserve_model_history
        previous_path = OUT_CH / f"{champion['id']}.json"
        if previous_path.exists():
            preserve_model_history(champion, json.loads(previous_path.read_text(encoding='utf-8')))
        attach_champion_icon(champion, placeholders)
        abilities = [attach_ability_icon(drop_baked_values(backfill_status_mechanics(a, status_mech) or a))
                     for a in pack["abilities"]]
        missing_icons = [a["id"] for a in abilities if "icon" not in a]
        if missing_icons:
            placeholders.append({"field": "abilities[].icon", "state": "no-generated-icon",
                                 "why": f"⛔ {len(missing_icons)} 格技能沒有產好的圖示：{missing_icons}"})
        if args.write:
            OUT_CH.mkdir(parents=True, exist_ok=True)
            OUT_AB.mkdir(parents=True, exist_ok=True)
            OUT_VFX.mkdir(parents=True, exist_ok=True)
            (OUT_CH / f"{champion['id']}.json").write_text(
                json.dumps(champion, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            for a in abilities:
                (OUT_AB / f"{a['id']}.json").write_text(
                    json.dumps(a, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            for s in pack["vfxScripts"]:
                (OUT_VFX / f"{s['id']}.json").write_text(
                    json.dumps(s, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            # ⛔⛔ 少了這一段 ＝ 「模板展開失敗，已個別降級」而 `content:build` 仍然 exit 0
            #   —— 實測 16 支技能降級、其中 7 支**完全沒有效果**（GH#1165 同一個形狀）。
            OUT_TPL.mkdir(parents=True, exist_ok=True)
            for tpl in pack.get("abilityTemplates") or []:
                # ⚠️ ⭐ **鍵排序＋不留空白**，⛔ 不是 `indent=2` —— 出貨的 19 份
                #   `hero-template.*` 全部是 JCS 正規形（id 本身就是那串位元組的雜湊）。
                #   ⛔ 我第一版用 indent=2 寫回去 ⇒ **7 份既有模板整份重排**（內容一模一樣）
                #   ⇒ 那是 595 行的假 diff，而且會讓逐位元組比對的閘從此對不上。
                (OUT_TPL / f"{tpl['id']}.json").write_text(
                    json.dumps(tpl, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n",
                    encoding="utf-8")
        report_rows.append({
            "id": champion["id"], "exampleId": pack["exampleId"], "name": champion["name"],
            "origin": champion.get("origin"), "role": champion.get("role"),
            "icon": champion.get("icon"), "abilities": [a["id"] for a in abilities],
            "abilityIcons": sum(1 for a in abilities if "icon" in a),
            "vfxScripts": [s["id"] for s in pack["vfxScripts"]],
            "abilityTemplates": [t["id"] for t in (pack.get("abilityTemplates") or [])],
            "model": pack["model"], "source": pack["source"], "placeholders": placeholders,
        })

    summary = {
        "schema": "ggd-lol7-report@1", "heroes": len(report_rows),
        "withRealModel": sum(1 for r in report_rows if r["model"]["state"] in ("real", "real-late")),
        "inventoryStale": [r["name"] for r in report_rows if r["model"]["state"] == "real-late"],
        "staleBlockers": stale,
        "withChampionIcon": sum(1 for r in report_rows if r["icon"]),
        "abilityIcons": sum(r["abilityIcons"] for r in report_rows),
        "abilitySlots": sum(len(r["abilities"]) for r in report_rows),
        "withPlaceholders": sum(1 for r in report_rows if r["placeholders"]),
        "rows": report_rows,
    }
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: summary[k] for k in
                      ("heroes", "withRealModel", "inventoryStale", "withChampionIcon",
                       "abilityIcons", "abilitySlots", "withPlaceholders")}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
