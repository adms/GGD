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

OUT_STATUS = REPO / "content/status-effects"

# ⭐ 普攻聲由人決定（GH#745 · GH#1211 同一張詞彙表：greatsword | katana | gun | bow | magic |
# thrown | fist | claw | sword）。理由來自**角色本身**，⛔ 不是「看起來像」（GH#1281）。
WEAPON_TAGS = {
    "acquired-alice": "sword",            # 藍薔薇之劍
    "acquired-astralym": "magic",         # 帕魯龍族，吐息
    "acquired-asuna": "sword",            # 細劍
    "acquired-beatrice": "magic",         # 禁書庫的大精靈，陰魔法
    "acquired-cattiva": "claw",           # 貓型帕魯，抓擊
    "acquired-dio": "fist",               # 『世界』的連打
    "acquired-emilia": "magic",           # 冰系精靈術
    "acquired-inuyasha": "greatsword",    # 鐵碎牙（巨大牙刀）
    "acquired-jetragon": "magic",         # 帕魯龍族，飛彈吐息
    "acquired-kita-kita": "fist",         # 徒手（跳舞），沒有武器
    "acquired-kuroyukihime": "sword",     # 黑之王，四肢是刃
    "acquired-leafa": "katana",           # 長刀
    "acquired-lord-nightmares": "magic",  # 魔王，魔法
    "acquired-mario": "fist",             # 拳腳
    "acquired-mewtwo": "magic",           # 念力
    "acquired-minecraft": "fist",         # 鎬是鈍擊（普攻挖材料），⛔ 不是刀刃
    "acquired-morgiana": "fist",          # 法納利斯的踢技
    "acquired-naruto": "fist",            # 體術
    "acquired-pokemon-trainer": "thrown",  # 丟寶可夢球
    "acquired-ram": "magic",              # 風魔法
    "acquired-rim": "claw",               # 魔龍，爪
    "acquired-ryu": "fist",               # 格鬥家
    "acquired-saya": "magic",             # 非人之物，觸手汲取（遠程）
    "acquired-wargreymon": "claw",        # 龍之破壞者（雙爪）
    "acquired-xiaodangjia": "sword",      # 菜刀
    "acquired-zero": "sword",             # Z 光劍
    "lol-ahri": "magic",                  # 法球
    "lol-ashe": "bow",                    # 冰弓
    "lol-blitzcrank": "fist",             # 蒸汽巨拳
    "lol-chogath": "claw",                # 虛空巨獸，爪
    "lol-fiddlesticks": "greatsword",     # 大鐮刀（雙手大刃）
    "lol-garen": "greatsword",            # 大劍
    "lol-malphite": "fist",               # 岩石拳
    "lol-ornn": "fist",                   # 鍛造錘是鈍擊，⛔ 不是刀刃
    "lol-sett": "fist",                   # 拳擊
    "lol-thresh": "thrown",               # 鎖鐮甩擊
    "lol-velkoz": "magic",                # 能量射線
}

_CC_TAGS = (
    ("stun", ["stun", "hard-cc", "cc", "disable", "move-denied", "attack-denied", "cast-denied"]),
    ("root", ["root", "immobilize", "move-denied", "disable", "cc"]),
    ("silenced", ["silence", "cast-denied", "cc"]),
    ("disarmed", ["disarm", "attack-denied", "cc"]),
    ("feared", ["fear", "uncontrollable", "ai-override", "flee", "attack-denied", "disable", "cc"]),
    ("charmed", ["charmed", "cc", "move-denied"]),
)


def status_docs(abilities: list[dict], champion: dict) -> list[dict]:
    """⭐ 英雄專屬 `statusId` 的狀態文件 —— **從技能實際怎麼用它推導**，⛔ 不手寫（GH#1281）。

    編譯器只產 champions／abilities／vfx-scripts ⇒ 這些 id 在 `content/status-effects/` 沒有文件
    ⇒ 載入時 137 筆 soft ref 懸空、HUD 沒有名稱、免控判斷讀不到分類標籤。
    · 名稱＝施加它的技能名（⛔ 不發明新名字）
    · 極性：帶控制／緩速／失手 ⇒ debuff（施加在自己身上也是代價）；加速 ⇒ buff；
      純標記 ⇒ 看施加對象（自己 buff、目標 debuff）
    · 標籤：**逐字等同 id** 的專屬 tag（`statusTagOpenness` 的第 1 條）＋ 出貨詞彙裡對應機制的類別
    """
    uses: dict[str, list[dict]] = {}
    named: dict[str, str] = {}

    def walk(node, ability):
        if isinstance(node, dict):
            sid = node.get("statusId")
            if isinstance(sid, str) and sid.startswith(champion["id"] + "."):
                named.setdefault(sid, ability["name"])
                uses.setdefault(sid, [])
                if node.get("kind") == "applyStatus":
                    uses[sid].append(node)
            for v in node.values():
                walk(v, ability)
        elif isinstance(node, list):
            for v in node:
                walk(v, ability)

    for a in abilities:
        walk(a, a)
    docs = []
    # ⭐⭐ 同一個 statusId 在**別的技能**上帶了機制，而這一格只有名字 ⇒ 補齊。
    #   ⛔ 「只掛得上名字」的 applyStatus 比沒有效果更糟：狀態列會畫圖示、HUD 會倒數，
    #   而 `sim/effects/applyStatus.ts` 讀的那幾格一個都沒填 ⇒ 對方完全自由（主動誤導決策）。
    #   ⭐ 補什麼**不是我發明的**：取同一個 id 在這位英雄身上其他節點填過的那幾格
    #   （與 `gen.py::backfill_status_mechanics` 同一條規矩，只是母體換成這一批自己）。
    SKIP = {"kind", "statusId", "applyTo", "duration", "stacks", "onExisting", "stackKey", "sourceScope", "refresh", "condition"}
    for sid, nodes in uses.items():
        filled = {}
        for n in nodes:
            for k, v in n.items():
                if k not in SKIP:
                    filled.setdefault(k, v)
        if not filled:
            continue
        for n in nodes:
            if not any(k not in SKIP for k in n):
                n.update(filled)
    for sid in sorted(uses):
        tags: list[str] = [sid]
        debuff = buff = False
        # ⭐⭐ 類別 tag 只標「**每一次**都會發生」的那幾樣（交集），⛔ 不是所有用法的聯集。
        #   ⚠️ 量到的（2026-09-17）：同一個 id 在不同技能上做不同的事 —— 吉他吉他老伯的
        #   `disruption` 在 Q 是致盲、在 R 是定身。聯集會讓狀態文件宣稱「它會定身**也會**致盲」，
        #   而 `noOpModifierClaims` 正是從 tag 推導「這個節點該填哪一格」⇒ 兩邊互相判對方少填。
        #   ⭐ 而機制**住在 effect 節點上**（那份 schema 的檔頭逐字說的），狀態文件只負責身分：
        #   ⇒ 身分只寫「每次都成立」的部分，⛔ 不替某一支技能的特例背書。
        def has(node: dict, key: str) -> bool:
            if key == "slow":
                v = node.get("moveSpeedMult")
                return isinstance(v, (int, float)) and v < 1
            if key == "haste":
                v = node.get("moveSpeedMult")
                return isinstance(v, (int, float)) and v > 1
            if key == "blind":
                return bool(node.get("missChance"))
            return bool(node.get(key))

        nodes = uses[sid]
        always = {k for k in ("stun", "root", "silenced", "disarmed", "feared", "charmed", "slow", "haste", "blind")
                  if nodes and all(has(n, k) for n in nodes)}
        ever = {k for k in ("stun", "root", "silenced", "disarmed", "feared", "charmed", "slow", "haste", "blind")
                if any(has(n, k) for n in nodes)}
        for key, cat in _CC_TAGS:
            if key in always:
                tags += cat
        if "slow" in always:
            tags += ["slow", "move-speed-down", "soft-cc", "cc"]
        if "haste" in always:
            tags += ["haste", "move-speed-up"]
        if "blind" in always:
            tags += ["blind", "miss", "accuracy-down", "soft-cc", "cc"]
        debuff = bool(ever - {"haste"})
        buff = "haste" in ever
        if not debuff and not buff:
            debuff = any(n.get("applyTo", "target") == "target" for n in nodes)
        polarity = "debuff" if debuff else "buff"
        tags.append(polarity)
        docs.append({
            "id": sid, "schema": "status-effect@1", "name": named[sid],
            "description": f"{champion['name']}「{named[sid]}」施加的狀態。",
            "polarity": polarity, "tags": list(dict.fromkeys(tags)),
        })
    return docs


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
        # ⭐ owner 2026-08-21：「所有角色的 力敏智成長都歸 0」（GH#1211 同病，GH#1281）
        for k in ("strGrowth", "agiGrowth", "intGrowth"):
            if k in (champion.get("attributes") or {}):
                champion["attributes"][k] = 0
        champion["tags"] = [WEAPON_TAGS[champion["id"]]]
        abilities = [attach_ability_icon(drop_baked_values(backfill_status_mechanics(a, status_mech) or a))
                     for a in pack["abilities"]]
        statuses = status_docs(abilities, champion)
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
            OUT_STATUS.mkdir(parents=True, exist_ok=True)
            for st in statuses:
                (OUT_STATUS / f"{st['id']}.json").write_text(
                    json.dumps(st, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
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
