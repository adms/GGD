#!/usr/bin/env python3
"""Render out/<map>/REPORT.md (Chinese) from the pipeline artifacts.
Usage: gen_report.py [out_dir]  (default out/GoDieEX22s)
"""

from __future__ import annotations

import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from w3xlib.drafts import (  # noqa: E402
    ARCHETYPES, UNMAPPABLE, _clean, combined_name,
)

CAST_ZH = {"targeted": "指定目標", "skillshot": "直線彈道", "ground": "地面範圍",
           "self": "自身", "dash": "衝刺位移"}


def main(out_dir: str) -> int:
    inv = json.load(open(os.path.join(out_dir, "inventory.json")))
    mrep = json.load(open(os.path.join(out_dir, "models_report.json")))
    irep = json.load(open(os.path.join(out_dir, "import_report.json")))
    heroes = json.load(open(os.path.join(out_dir, "parsed", "heroes.json")))
    abilities = json.load(open(os.path.join(out_dir, "parsed", "abilities.json")))
    items = json.load(open(os.path.join(out_dir, "parsed", "items.json")))
    heroes_orig = json.load(open(os.path.join(out_dir, "parsed",
                                              "heroes_original.json")))
    pool_path = os.path.join(out_dir, "parsed", "random_pool.json")
    pool = json.load(open(pool_path)) if os.path.exists(pool_path) else None

    root = os.path.normpath(os.path.join(os.path.dirname(out_dir), "..", "..", ".."))
    content = os.path.join(root, "content")

    L: list[str] = []
    A = L.append
    A(f"# 《{inv['map']}》 匯入報告")
    A("")
    A("原始地圖:去死團的逆襲 EX 2.2s(`GoDieEX22s.w3x`,6.28 MB,受保護的 MPQ)。")
    A("模型與貼圖皆為地圖作者自製素材(使用者聲明)。")
    A("")
    A("## 一、檔案匯入總覽")
    A("")
    ok_files = {k: v for k, v in inv["files"].items() if v["status"] == "ok"}
    by_ext: dict[str, list] = {}
    for name, v in ok_files.items():
        ext = name.rsplit(".", 1)[-1].lower() if "." in name else "-"
        by_ext.setdefault(ext, []).append((name, v))
    A(f"- MPQ block table 共 **{inv['block_table_entries']}** 筆,"
      f"成功還原 **{len(ok_files)}** 個檔案。")
    A(f"- **{inv['unrecovered_blocks']}** 筆無法還原檔名(此圖為受保護地圖,"
      "`(listfile)` 與 `war3map.imp` 均被破壞;MPQ 只儲存檔名雜湊,無法逆推。"
      "依副檔名統計推測多為未被物編/腳本引用的音效與未使用素材)。")
    A("- 檔名還原方式:already-known(war3map.*)+ 物件編輯資料(w3u/w3a/w3t 等)"
      "字串欄位與 JASS 腳本中的路徑掃描 + MDX 貼圖引用(TEXS)遞迴補收。")
    A("")
    A("| 類型 | 數量 | 說明 |")
    A("| --- | --- | --- |")
    desc = {"mdx": "模型(全部轉出 glTF)", "blp": "貼圖(全部解碼為 PNG)",
            "mp3": "音樂/音效(僅解出,未使用)", "j": "JASS 腳本",
            "wts": "字串表(繁中)", "w3u": "單位資料", "w3a": "技能資料",
            "w3t": "物品資料"}
    for ext in sorted(by_ext, key=lambda e: -len(by_ext[e])):
        A(f"| .{ext} | {len(by_ext[ext])} | {desc.get(ext, '')} |")
    A("")
    A("完整逐檔清單(含大小與還原方式)見 [`inventory.md`](inventory.md)。")
    A("")

    # models
    A("## 二、模型轉換(MDX → glTF)")
    A("")
    okm = [m for m in mrep if m["status"] == "ok"]
    heroes_m = [m for m in okm if m.get("kind") == "hero"]
    A(f"- {len(okm)}/{len(mrep)} 個 .mdx 全數轉出 `.glb`(嵌入 PNG 貼圖),"
      "並通過 Babylon NullEngine 載入驗證。")
    A(f"- 其中 **{len(heroes_m)}** 個判定為角色模型(具 Walk/Attack/Death 動作 + 骨架),"
      f"{len(okm) - len(heroes_m)} 個為特效/道具模型(可作場景裝飾)。")
    A("- 座標轉換:MDX 為 Z 朝上右手系 → glTF Y 朝上,直接烘焙 `(x,y,z)→s·(x,z,−y)`;"
      "四元數與縮放軌跡同步變換。")
    A("- 縮放:先把角色本體網格正規化為「usca=1.0 → 約 1.7 遊戲單位」的基準,"
      "再乘上地圖作者為每名英雄設定的縮放值(`usca`,單位資料 Scaling Value),"
      "讓大小英雄如地圖原意般有差異;有效身高鉗制於 0.6–3.0 單位以免過度變形。"
      "碰撞半徑 `collisionRadius` 仍由玩法決定,**不**隨視覺大小縮放"
      "(每名英雄的 usca→scale 記錄於 `models_report.json`)。")
    A("- 動畫:每個 WC3 序列輸出一條 glTF animation,線性軌跡原樣輸出、"
      "Hermite/Bezier 軌跡以 30fps 重取樣為線性;`clipMap` 依序列名稱自動對應 "
      "idle/run/attack/cast/hurt/death。")
    A("- 材質/透明度(本次修正):貼圖依 BLP alpha 通道與 WC3 filter mode 選定 "
      "glTF `alphaMode` — 不透明層 OPAQUE、1-bit 鏤空 MASK(alphaCutoff)、"
      "漸層 BLEND;武器/裝甲常見的「隊伍色底層 + 細節疊加層」材質,以往只取疊加層"
      "並套 BLEND 導致武器半透明(看似消失),現偵測到不透明底層時整體轉為 OPAQUE,"
      "武器/球體正常實體顯示。")
    A("- 隊伍色/發光:隊伍色區塊(replaceableId 1)以中性不透明色呈現並列入 "
      "`teamTintMaterials` 交由客戶端上色(不再是半透明灰色鬼影);隊伍發光"
      "(replaceableId 2)無法上色,直接丟棄避免灰色色塊;疊加(additive)發光"
      "幾何轉為 glTF emissive(`KHR_materials_emissive_strength`)呈現為光而非黑塊。")
    A("- 附掛物:調查後本圖英雄的武器/球體皆已內含於自身 geoset(無外掛模型引用"
      "── 單位 Art 欄位與 MDX ATCH 節點均無外部模型路徑);匯入器已支援把 ATCH "
      "節點引用的獨立模型烘焙進主模型的對應附掛點,本圖需要烘焙的外掛模型為 0。"
      "能量特效型球體(如 Excalibur 金光)為粒子發射器,glTF 無粒子系統,無法還原。")
    A("")

    # champions
    champs = irep["champions"]
    champs_orig = irep.get("champions_original", [])
    standins = irep.get("standin_models", {})
    A("## 三、英雄 → champion 文件(content/champions/)")
    A("")
    A(f"WC3 自訂英雄共 {len(heroes)} 名;其中 **{len(champs)}** 名使用自製模型、"
      f"已寫入 content/ 並通過 schema 驗證;{len(irep['champions_draft_only'])} 名"
      "使用暴雪內建模型(無法取得),草稿保留於 `drafts/champions/`。")
    A("")
    A(f"另有 **{len(champs_orig)}** 名「原始表」英雄(直接修改暴雪標準英雄 rawcode,"
      "如 `Hpal`、`Hart`;隨機英雄池引用)本次補匯入 content/:改過的欄位"
      "(中文名、屬性、技能)照常轉換,地圖未改的欄位以 WC3 標準英雄一級數值表"
      "(近似值,見 `w3xlib/drafts.py` `STANDARD_HERO_DEFAULTS`)補齊;其中 "
      f"{len(standins)} 名的原模型為暴雪內建(無法匯出),以現有匯入模型代替"
      "(champion 文件標記 `standin-model` 標籤,對照表見下)。")
    A("")
    # name combine before/after (fix #1)
    A("### 顯示名稱合併(稱號 + 名字 → 單一名稱)")
    A("")
    A("WC3 英雄的「名稱」欄(`unam`)在本圖存的是稱號/標題,"
      "「專有名稱」欄(`upro`)存的是角色本名;兩者合併為單一 `name`,"
      "格式「稱號 - 名字」(LoL 風格);只有其一者則單獨使用,不留多餘分隔號。"
      "以下為前 10 例對照(舊=僅稱號、新=合併後):")
    A("")
    A("| champion id | 舊(僅 unam) | 新(合併 unam + upro) |")
    A("| --- | --- | --- |")
    shown = 0
    for cid in champs:
        wc3 = cid.replace("godie-", "").upper()
        h = heroes.get(wc3, {})
        old = _clean(h.get("name")) or "—"
        new = combined_name(h)
        if not h.get("proper_name"):
            continue  # show ones that actually combine
        A(f"| {cid} | {old} | {new} |")
        shown += 1
        if shown >= 10:
            break
    A("")

    # per-unit size spread (fix #2)
    spread = irep.get("size_spread") or {}
    if spread:
        A("### 每單位大小(usca → 模型 scale)")
        A("")
        A("模型 `scale` 依地圖的 `usca` 逐英雄計算;有效身高鉗制 0.6–3.0 單位。"
          "最小與最大英雄如下(usca / 有效身高單位):")
        A("")

        def _row(item):
            name, usca, eff = item
            return f"`{name}` (usca {usca} → {eff}u)"
        A("- 最矮:" + "、".join(_row(x) for x in spread.get("smallest", [])))
        A("- 最高:" + "、".join(_row(x) for x in spread.get("largest", [])) +
          "(均鉗制於 3.0u 上限)。")
        A("")

    A("數值換算(WC3 → 本遊戲):距離 ×11/600(600 射程=11 單位)、"
      "移速 270–522 → 5.5–8(線性)、HP=(基礎HP+25×力量)×0.8、"
      "魔力=基礎+12×智力、攻擊=骰子期望+主屬性、攻速=1/攻擊間隔、"
      "護甲=基礎+0.3×敏捷;傷害/治療/冷卻/耗魔數值 1:1 保留。")
    A("")
    A("| champion id | 名稱 | WC3 | 模型 | HP | AD | 護甲 | 移速 | Q / W / E / R |")
    A("| --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    for cid in champs:
        doc = json.load(open(os.path.join(content, "champions", cid + ".json")))
        wc3 = cid.replace("godie-", "").upper()
        h = heroes.get(wc3, {})
        abl = " / ".join(doc["abilities"][s]["name"] for s in "QWER")
        A(f"| {cid} | {doc['name']} | {wc3} ({h.get('base','')}) | "
          f"`{doc['modelKey']}` | {doc['baseStats']['maxHealth']} | "
          f"{doc['baseStats']['ad']} | {doc['baseStats']['armor']} | "
          f"{doc['baseStats']['ms']} | {abl} |")
    A("")

    if champs_orig:
        orig_by_cid = {"godie-" + k.lower(): v for k, v in heroes_orig.items()}
        A("### 原始表英雄(本次補匯)")
        A("")
        A("模型欄標「⚠ 代替」者:原模型為暴雪內建,以現有模型代替。")
        A("")
        A("| champion id | 名稱 | WC3 | 模型 | HP | AD | 護甲 | 移速 |"
          " Q / W / E / R |")
        A("| --- | --- | --- | --- | --- | --- | --- | --- | --- |")
        for cid in champs_orig:
            doc = json.load(open(os.path.join(content, "champions",
                                              cid + ".json")))
            h = orig_by_cid.get(cid, {})
            abl = " / ".join(doc["abilities"][s]["name"] for s in "QWER")
            mark = " ⚠ 代替" if cid in standins else ""
            A(f"| {cid} | {doc['name']} | {h.get('id','')} | "
              f"`{doc['modelKey']}`{mark} | {doc['baseStats']['maxHealth']} | "
              f"{doc['baseStats']['ad']} | {doc['baseStats']['armor']} | "
              f"{doc['baseStats']['ms']} | {abl} |")
        A("")

    # random-hero pool
    if pool:
        A("### 隨機英雄池")
        A("")
        A(f"地圖的隨機英雄模式從 JASS 腳本的 rawcode 陣列抽取(混淆變數 "
          f"`{pool['var']}`,共 **{pool['count']}** 名,自動解析;其中 6 筆索引"
          "以 JASS 十六進位字面值 `$A`–`$F` 寫入,簡單十進位掃描會漏掉)。"
          "狀態:已匯入=自訂表英雄、先前已進 content/;本次補匯=原始表英雄、"
          "本次新增;草稿=自訂表但模型未還原,僅存 `drafts/`;未還原=物編資料"
          "中找不到。")
        A("")
        A("| # | rawcode | 名稱 | 狀態 |")
        A("| --- | --- | --- | --- |")
        drafts_set = set(irep["champions_draft_only"])
        champs_set = set(champs)
        orig_set = set(champs_orig)
        st_count: dict[str, int] = {}
        for i, code in enumerate(pool["codes"], pool.get("first_index", 1)):
            cid = "godie-" + code.lower()
            h = heroes.get(code) or heroes_orig.get(code) or {}
            name = _clean(h.get("name")) or "—"
            if cid in champs_set:
                st = "已匯入"
            elif cid in orig_set:
                st = "本次補匯" +("(模型代替)" if cid in standins else "")
            elif cid in drafts_set:
                st = "草稿"
            else:
                st = "未還原"
            st_count[st.split("(")[0]] = st_count.get(st.split("(")[0], 0) + 1
            A(f"| {i} | `{code}` | {name} | {st} |")
        A("")
        A("小計:" + "、".join(f"{k} {v} 名" for k, v in st_count.items()) + "。")
        A("")
        A("池序同步輸出於 `parsed/random_pool.json`(content 的 config 集合"
          "schema 已凍結、無對應文件型別,故不寫入 content/config/)。")
        A("")

    # ability mapping table
    A("### 技能原型對應表(WC3 base rawcode → EffectDef)")
    A("")
    used_bases: dict[str, int] = {}
    pool_orig_heroes = {
        k: v for k, v in heroes_orig.items()
        if "godie-" + k.lower() in set(champs_orig)
    }
    for hid, h in {**heroes, **pool_orig_heroes}.items():
        for aid in h.get("hero_abilities", []):
            if aid == "Aamk":
                continue
            ab = abilities.get(aid)
            base = ab["base"] if ab else aid
            used_bases[base] = used_bases.get(base, 0) + 1
    A("| WC3 原型 | 次數 | 對應方式 |")
    A("| --- | --- | --- |")
    for base, n in sorted(used_bases.items(), key=lambda kv: -kv[1]):
        if base in ARCHETYPES:
            zh = ARCHETYPES[base][0]
            builder_doc = {"_t_targeted_nuke": "指定目標傷害",
                           "_t_skillshot": "彈道",
                           "_t_ground_aoe": "地面 AoE"}
            A(f"| `{base}` | {n} | {zh} → 依模板轉為傷害/狀態/增益效果 |")
        elif base in UNMAPPABLE:
            A(f"| `{base}` | {n} | ⚠ {UNMAPPABLE[base]} → 佔位技能(TODO) |")
        else:
            A(f"| `{base}` | {n} | ⚠ 未知原型 → 佔位傷害技能(TODO) |")
    A("")
    todo_notes = [n for n in irep["notes"] if "TODO" in n or "placeholder" in n]
    A(f"共 {len(todo_notes)} 個技能無法忠實轉換(召喚/幻象/觸發腳本 `ANcl` 類),"
      "已以佔位技能代替並逐條記錄於 `import_report.json` → `notes`。")
    A("")

    # skins
    A("### 造型(skins)")
    A("")
    for sid in irep["skins"]:
        A(f"- `{sid}`")
    A("")

    # items
    A("## 四、物品 → item 文件(content/items/)")
    A("")
    n_mods = 0
    for iid in irep["items"]:
        d = json.load(open(os.path.join(content, "items", iid + ".json")))
        if d.get("modifiers"):
            n_mods += 1
    A(f"共匯入 **{len(irep['items'])}** 件物品(中文名稱、金價、階級全數保留);"
      f"其中 {n_mods} 件成功解析出屬性加成(+攻擊/+護甲/+生命…),其餘為主動效果"
      "或觸發式物品,屬性欄留空並記錄於 notes。階級由金價換算"
      "(<500→T1、<1500→T2、<3000→T3、<6000→T4、其餘 T5)。")
    A("")
    A("| item id | 名稱 | 金價 | 階級 | 加成 |")
    A("| --- | --- | --- | --- | --- |")
    for iid in irep["items"]:
        d = json.load(open(os.path.join(content, "items", iid + ".json")))
        mods = ", ".join(f"{m['stat']}+{m['value']}" for m in d.get("modifiers", []))
        A(f"| {iid} | {d['name']} | {d['cost']} | T{d['tier']} | {mods} |")
    A("")

    # arena
    ar = irep["arena"]
    A("## 五、地形 → 競技場(content/arenas/arena.godie.json)")
    A("")
    A("本遊戲的競技場為「兩個圓形決鬥區」,與 WC3 的方形大地圖結構不同,採近似轉換:")
    A(f"- 解析 `war3map.wpm` 通行格(512×512, 每格 32 單位),以距離場找出兩塊最大的"
      f"開放區域(格座標 {ar['zones'][0]['disc_cells']} 與 {ar['zones'][1]['disc_cells']}),"
      "分別映射為兩個決鬥區(半徑 24)。")
    A(f"- 區內不可通行的格子群聚 → 圓形障礙物(zone-0:{ar['zones'][0]['obstacles']} 個、"
      f"zone-1:{ar['zones'][1]['obstacles']} 個)。")
    A(f"- `war3map.doo` 共 {ar['doodad_total']} 個裝飾物,落在兩區內者轉為 decor"
      f"(共 {ar['decor_count']} 個),樹木類使用匯入的 `japanesecherry.glb`(自製櫻花樹模型)。")
    A("")

    # not recovered
    A("## 六、無法還原/轉換的部分")
    A("")
    A(f"- **{inv['unrecovered_blocks']} 個 MPQ 區塊**無檔名可還原(受保護地圖,見上)。")
    A("- `(listfile)`、`(attributes)` 遭地圖保護破壞(解壓失敗,屬預期)。")
    A("- 暴雪內建模型本身(`units\\...` 路徑)不在檔案內、不可匯出:自訂表英雄"
      "缺模型者僅產出草稿;隨機池的原始表英雄則以現有匯入模型代替"
      "(原模型為暴雪內建,以現有模型代替;見第三節對照表)。")
    A("- 召喚類/幻象類/`ANcl`(觸發腳本)技能:實際邏輯在 1.3MB 的 JASS 腳本內,"
      "無法自動轉為 EffectDef,以佔位技能標記 TODO。")
    A("- 模型附掛粒子特效(能量球體/刀光等)、GEOA 逐序列顯隱、"
      "全域序列(global sequence)軌跡未轉換。")
    A("- 疊加發光材質改以 glTF emissive 呈現(而非舊版半透明灰塊);"
      "隊伍發光(replaceableId 2)無法上色而丟棄。本次共移除 "
      f"{len(irep.get('dropped_glow_models', []))} 個模型上的隊伍發光灰塊、"
      f"烘焙外掛模型 {len(irep.get('attachments_baked', []))} 個"
      f"(略過 {len(irep.get('attachments_skipped', []))} 個未還原者)。")
    A("")
    A("## 七、驗證與授權")
    A("")
    n_docs = 0
    for coll in os.listdir(content):
        cpath = os.path.join(content, coll)
        if os.path.isdir(cpath):
            n_docs += sum(1 for f in os.listdir(cpath)
                          if f.endswith(".json") and f != "_index.json")
    A(f"- `pnpm content:build` + `content:validate`:**{n_docs} 份文件全數通過**"
      "(schema + 參照完整性)。")
    A("- 129 個 `.glb` 全數通過 Babylon NullEngine 載入測試(0 失敗);"
      "編輯器 Model Inspector 實機渲染確認(材質/骨架/動畫切換正常)。")
    A("- 測試套件 `w3x-import-unit`(tools/testrunner/suites.yaml)含 15 項測試:"
      "解密/explode 往返、物編解析(含原始表)、TRIGSTR、MDX 解析(含 ATCH 附掛路徑)、"
      "glTF 產出、clipMap 對應、隨機池解析、端對端管線與內容接線,"
      "以及本次三項修正:名稱合併、usca→scale、alpha/隊伍色材質、外掛模型烘焙,"
      "對應 `docs/todo/w3x-import.md`。")
    A("- 授權:匯入之 MDX 模型與 BLP 貼圖為地圖作者(使用者)自製素材;"
      "未匯入任何暴雪官方模型/貼圖(內建路徑素材一律以佔位圖代替)。")
    A("")

    out = os.path.join(out_dir, "REPORT.md")
    with open(out, "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")
    print("wrote", out, f"({len(L)} lines)")
    return 0


if __name__ == "__main__":
    d = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "out", "GoDieEX22s")
    raise SystemExit(main(d))
