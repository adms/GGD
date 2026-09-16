#!/usr/bin/env python3
"""⭐ 第四／五批 37 名上架（GH#1185 LoL 11 ＋ GH#1205 已取得素材 26）——
⛔ 不是第四支產生器，是 **`lol7.py` 那一條管線的下一批**（第零守則⑨：N 個同型 ＝ K 個模板 ＋ 一張表）。

> owner 2026-09-15（逐字）：「你要替我發佈全部角色 這是這一個新版的主要目的」
> owner 2026-09-16（逐字）：「全部英雄上架是預設的 不需要我審查通過」

⭐ 這一支**一行新規則都沒有**：級距清洗（`drop_baked_values`）、狀態機制補齊
（`backfill_status_mechanics`）、圖示接線（`attach_ability_icon` / `attach_champion_icon`）、
草稿句剝除（`strip_dev_notes`）、`yields` 補寫（`ship_script`）、模型歷史保留
（`preserve_model_history`）全部**沿用 `gen.py` 與 `lol7.py` 的同一組函式**。

## 執行順序（⛔ 與第三批逐字相同）

    python3 tools/ship-81/batch37.py --report docs/_reports/batch37-ship.json --write
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
from gen import (OUT_AB, OUT_CH, attach_ability_icon, backfill_status_mechanics,  # noqa: E402
                 drop_baked_values, shipped_status_mechanics, strip_dev_notes)
from lol7 import OUT_TPL, OUT_VFX, REPO, attach_champion_icon, ship_script  # noqa: E402
from model_map import preserve_model_history  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--report", type=Path, help="逐名報告（⭐ 暫用的都列出來）")
    ap.add_argument("--only", help="只做這幾個出貨 id（逗號分隔）")
    ap.add_argument("--write", action="store_true", help="⛔ 不給就是 dry-run")
    args = ap.parse_args()

    with tempfile.TemporaryDirectory() as tmp:
        compiled_dir = Path(tmp) / "compiled"
        cmd = ["npx", "tsx", str(REPO / "tools/ship-81/batch37_compile.mts"), "--out", str(compiled_dir)]
        if args.only:
            cmd += ["--only", args.only]
        proc = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True)
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
        clean = strip_dev_notes(champion)
        if clean is not None:
            champion["description"] = clean
        previous_path = OUT_CH / f"{champion['id']}.json"
        if previous_path.exists():
            preserve_model_history(champion, json.loads(previous_path.read_text(encoding="utf-8")))
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
                    json.dumps(ship_script(s), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            OUT_TPL.mkdir(parents=True, exist_ok=True)
            for tpl in pack.get("abilityTemplates") or []:
                # ⚠️ ⭐ JCS 正規形（鍵排序＋不留空白）—— id 就是那串位元組的雜湊，⛔ 不是 indent=2
                (OUT_TPL / f"{tpl['id']}.json").write_text(
                    json.dumps(tpl, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n",
                    encoding="utf-8")
        report_rows.append({
            "id": champion["id"], "name": champion["name"], "origin": champion.get("origin"),
            "role": champion.get("role"), "icon": champion.get("icon"),
            "abilities": [a["id"] for a in abilities],
            "abilityIcons": sum(1 for a in abilities if "icon" in a),
            "vfxScripts": [s["id"] for s in pack["vfxScripts"]],
            "abilityTemplates": [t["id"] for t in (pack.get("abilityTemplates") or [])],
            "model": pack["model"], "source": pack["source"], "placeholders": placeholders,
        })

    summary = {
        "schema": "ggd-batch37-report@1", "heroes": len(report_rows),
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
                      ("heroes", "withChampionIcon", "abilityIcons", "abilitySlots", "withPlaceholders")},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
