#!/usr/bin/env python3
"""技能模板**驗收標準** —— 三軸（特效／動畫／傷害）逐支量尺。  票 #450

owner 2026-08-22 逐字：

    「這三支為何作為驗收標準，是為了建立**特效正確性、動畫正確性、傷害正確性
     三大標準檢驗**(因為有一堆**時間序JASS+w3x效果演出**)，製作而成的 **script
     來套驗檢驗其他所有的技能特效傷害與動畫**，並且讓 **codex編輯器也能依照合約
     做出類似的模板技能、傷害與動畫效果**，所以才稱為**技能模板驗收標準**」

⇒ ⭐ 這張票的產出是**這支 script 與那份合約**，⛔ 不是「把三支修好」。
   三支（04-04 神滅斬 · 42-04 世界終結 · 01-04 超究武神霸斬）是**校準用的標本**：
   先讓尺量得準，再拿尺去量其他 420 支。

用法
----
    python3 tools/skill-audit/audit.py              # 重新產生 docs/技能模板驗收標準.md
    python3 tools/skill-audit/audit.py --check      # 唯讀，逐位元組比對；過期回 1
    python3 tools/skill-audit/audit.py --top 30     # 把缺口表印到 stdout
    python3 tools/skill-audit/audit.py --id godie-hart.r --json -   # 單支的完整量測

⛔ 這支工具裡**一個技能專屬的 if 都沒有**（第〇·五守則）。
   三支標本只以 id 出現在 `CALIBRATION` 那一格 —— 那是「這份文件要展示哪幾支」的
   **顯示清單**，⛔ 不是判準：把它清空，421 支的量測結果一個位元組都不會變。

⚠️ ⛔ 刻意沒有產生時間戳（同 `caps:export` / `spec:build` 的理由）：
   任何隨時鐘變動的欄位都會讓逐位元組比對永遠不相等，
   而一條被放寬的閘等於沒有閘。
"""

from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from axes import (  # noqa: E402
    ggd_counts,
    model_fx_nodes,
    model_stems,
    norm_stem,
    played_stems,
    promised_hits,
    strip_dialogue,
    vfx_family,
)
from jassfacts import closure, index_by_rawcode, parse_jass  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
ABILITIES = os.path.join(ROOT, "content", "abilities")
TEMPLATES = os.path.join(ROOT, "content", "ability-templates")
MODELS = os.path.join(ROOT, "content", "models")
PROVENANCE = os.path.join(ROOT, "content", "assets", "vfx", "w3x-ability-provenance.json")
WAR3MAP = os.path.join(ROOT, "tools", "w3x-import", "out", "GoDieEX22s-src", "raw", "war3map.j")
DOC = os.path.join(ROOT, "docs", "技能模板驗收標準.md")

#: ⭐ **顯示**清單，⛔ 不是判準。owner 點名的三支標本 —— 文件要把它們並排展開，
#: 因為「尺準不準」只有在已知答案的標本上才看得出來。
#: ⚠️ 把這一格清空，421 支的量測**一個位元組都不會變**（只有文件的 §3 會空掉）。
#: ⚠️ owner 寫的是「龍破斬／神滅斬」—— 那是莉娜的 **E 與 R 兩支**（04-03 / 04-04），
#: 所以兩支都展開，⛔ 不替他挑一支。
CALIBRATION = ["godie-h020.e", "godie-h020.r", "godie-n01g.r", "godie-hart.r"]

#: provenance 的四級證據強度。`stock-inherited` 是「作者什麼都沒設，WC3 掉進暴雪
#: 的基礎技能」—— 那**不是意圖**（provenanceContract 自己這樣寫的），所以不算數。
AUTHORED = {"jass-literal", "w3a-override", "w3h-override"}


# --------------------------------------------------------------------------
# 載入
# --------------------------------------------------------------------------

def _load_dir(path: str) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for name in sorted(os.listdir(path)):
        if not name.endswith(".json") or name.startswith("_"):
            continue
        with open(os.path.join(path, name), encoding="utf-8") as fh:
            doc = json.load(fh)
        if isinstance(doc, dict) and doc.get("id"):
            out[doc["id"]] = doc
    return out


def audit_all() -> list[dict]:
    """421 支 × 三軸。回傳**已排序**的列（⛔ 不依賴 dict 走訪順序）。"""
    abilities = _load_dir(ABILITIES)
    templates = _load_dir(TEMPLATES)
    models = _load_dir(MODELS)
    with open(PROVENANCE, encoding="utf-8") as fh:
        prov = json.load(fh)
    prov_ab = prov.get("abilities") or {}

    groups = parse_jass(WAR3MAP)
    by_rawcode = index_by_rawcode(groups)

    rows: list[dict] = []
    for aid in sorted(abilities):
        doc = abilities[aid]
        p = prov_ab.get(aid) or {}

        # ---- 原作那一側 -------------------------------------------------
        rawcodes = list(p.get("rawcodes") or [])
        seeds = [g for rc in rawcodes for g in by_rawcode.get(rc, [])]
        chain = closure(groups, seeds)

        src_sfx: dict[str, int] = {}
        src_damage = 0
        src_beats = 0
        src_anim = 0
        src_moves = 0
        periodic = None
        unbounded = False
        for g in chain:
            for st, n in g.sfx.items():
                src_sfx[st] = src_sfx.get(st, 0) + n
            src_damage += g.damage_calls
            src_beats += g.wait_beats
            src_anim += g.anim_calls
            src_moves += g.move_calls
            unbounded = unbounded or g.unbounded_loop
            if g.periodic is not None and (periodic is None or g.periodic < periodic):
                periodic = g.periodic

        # 作者真的指名過的美術 = w3a/w3h 的 override ∪ JASS 裡逐字打出來的模型。
        authored = {norm_stem(st) for st in src_sfx}
        authored_paths: dict[str, str] = {norm_stem(st): st for st in src_sfx}
        for art in p.get("realArt") or []:
            if art.get("provenance") in AUTHORED and art.get("stem"):
                authored.add(norm_stem(art["stem"]))
                authored_paths.setdefault(norm_stem(art["stem"]), art["stem"])
        authored.discard("")

        # ---- GGD 那一側 --------------------------------------------------
        binding = doc.get("template") or {}
        tref = binding.get("ref")
        tdoc = templates.get(tref) if tref else None
        counts = ggd_counts(doc.get("effects"), tdoc, binding.get("params"))
        key = doc.get("vfxKey")
        fx_nodes = model_fx_nodes(doc.get("effects"))
        # ⭐ 特效軸讀**兩個**來源：定點的 `vfxKey` ∪ 移動中的模型 `modelKey`。
        #   在 #543 之前只讀前者 ⇒ 一支真的把原作模型推出去的技能被判成「一個都沒播」。
        played = played_stems(key) | model_stems(doc.get("effects"), models)

        # ---- 三軸 ----------------------------------------------------------
        missing_art = sorted(authored - played)
        vfx_gap = len(missing_art)

        ggd_beats = counts["beats"]
        anim_gap = max(0, src_beats - ggd_beats)

        # ⭐ 動畫軸的第二個讀法：原作把一具模型**沿路徑**推出去（>1 次移動 = 一段路徑,
        #   ⛔ 一次是瞬移/擊退的落點修正）而 GGD 這一側連一具都沒有 ⇒ 整個演出缺席。
        #   ⚠️ 它是**機制**的有無（0/1）,⛔ 不是「段數差幾段」—— 段數取決於 tick 率,
        #   那是一個會隨引擎設定飄的數字,拿它當缺口會讓表在調 TICK_HZ 的那天全部變色。
        move_gap = 1 if (src_moves > 1 and counts["modelSegments"] == 0) else 0

        promised, evidence, rejected = promised_hits(doc.get("description") or "")
        ggd_hits = counts["damageLeaves"]
        dmg_gap = max(
            0,
            (promised - ggd_hits) if promised else 0,
            src_damage - ggd_hits,
        )

        rows.append(
            {
                "id": aid,
                "name": doc.get("name") or "",
                "slot": doc.get("slot") or "",
                "rawcodes": rawcodes,
                "joinConfidence": p.get("joinConfidence") or "NONE",
                "chain": [g.base for g in chain],
                "src": {
                    "sfx": dict(sorted(src_sfx.items())),
                    "damageCalls": src_damage,
                    "beats": src_beats,
                    "animCalls": src_anim,
                    "dummyMoves": src_moves,
                    "periodicSec": periodic,
                    "unboundedLoop": unbounded,
                },
                "ggd": {
                    "vfxKey": key,
                    "vfxFamily": vfx_family(key),
                    "damageLeaves": ggd_hits,
                    "beats": ggd_beats,
                    "modelFx": len(fx_nodes),
                    "modelSegments": counts["modelSegments"],
                    "template": tref,
                    "inertParams": counts["inert"],
                },
                "promised": {"hits": promised, "evidence": evidence, "rejected": rejected},
                "gaps": {"vfx": vfx_gap, "anim": anim_gap, "dmg": dmg_gap, "move": move_gap},
                "missingArt": [authored_paths.get(s, s) for s in missing_art],
            }
        )

    # ⭐ 排序鍵是**三個計數的元組**，⛔ 不是一個加權總分。
    #    三軸誰重要是 owner 的決定，⛔ 不是這支工具的。
    rows.sort(
        key=lambda r: (
            -(r["gaps"]["dmg"] + r["gaps"]["anim"] + r["gaps"]["vfx"] + r["gaps"]["move"]),
            -r["gaps"]["dmg"],
            -r["gaps"]["anim"],
            -r["gaps"]["vfx"],
            -r["gaps"]["move"],
            r["id"],
        )
    )
    return rows


# --------------------------------------------------------------------------
# 文件
# --------------------------------------------------------------------------

def _fence(obj) -> str:
    return "```json\n" + json.dumps(obj, ensure_ascii=False, indent=2) + "\n```"


def _shape(doc: dict) -> dict:
    """一支技能「做了什麼」住在哪 —— `effects`，或（模板化的那些）`template`。

    ⚠️ ⛔ 不可以無條件貼 `effects`：模板化的技能那一格是 **`[]`**，
    而一份把 `"effects": []` 當成「通過的樣子」展示給 Codex 的合約，
    會讓抄的人做出一支什麼都不會發生的技能 —— 而 schema 收得下它。
    """
    eff = doc.get("effects")
    out: dict = {}
    if eff:
        out["effects"] = eff
    if doc.get("template"):
        out["template"] = doc["template"]
    if doc.get("vfxKey"):
        out["vfxKey"] = doc["vfxKey"]
    return out


def _row_line(r: dict) -> str:
    g = r["gaps"]
    src, ggd = r["src"], r["ggd"]
    return (
        f"| {r['id']} | {r['name']} | {g['dmg']} | {g['anim']} | {g['vfx']} | {g['move']} | "
        f"{src['damageCalls']} | {ggd['damageLeaves']} | "
        f"{r['promised']['hits'] if r['promised']['hits'] else '—'} | "
        f"{src['beats']} | {ggd['beats']} | "
        f"{src['dummyMoves']} | {ggd['modelSegments']} | {ggd['vfxFamily']} |"
    )


_TABLE_HEAD = (
    "| id | 技能 | 傷害缺 | 動畫缺 | 特效缺 | 移動模型缺 | JASS 扣血 | GGD 扣血 | 卡面承諾 | "
    "JASS 拍 | GGD 拍 | JASS 推模型 | GGD 模型段 | 特效家族 |\n"
    "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|"
)


def render(rows: list[dict], abilities: dict[str, dict], templates: dict[str, dict]) -> str:
    by_id = {r["id"]: r for r in rows}
    fam: dict[str, int] = {}
    for r in rows:
        fam[r["ggd"]["vfxFamily"]] = fam.get(r["ggd"]["vfxFamily"], 0) + 1
    joined = [r for r in rows if r["chain"]]
    gapped = [r for r in rows if sum(r["gaps"].values()) > 0]

    L: list[str] = []
    A = L.append

    A("# 技能模板驗收標準（三軸：特效 · 動畫 · 傷害）")
    A("")
    A("> ⛔ **這份文件是產生的** —— `python3 tools/skill-audit/audit.py`。")
    A("> 手改會被下一次產生蓋掉，而且 `--check` 會紅。要改內容請改**來源**：")
    A("> `content/abilities/*.json` · `content/ability-templates/*.json` ·")
    A("> `content/assets/vfx/w3x-ability-provenance.json` · `war3map.j`。")
    A("")
    A("owner 2026-08-22 逐字：")
    A("")
    A("> 「這三支為何作為驗收標準，是為了建立**特效正確性、動畫正確性、傷害正確性")
    A(">  三大標準檢驗**(因為有一堆**時間序JASS+w3x效果演出**)，製作而成的 **script")
    A(">  來套驗檢驗其他所有的技能特效傷害與動畫**，並且讓 **codex編輯器也能依照合約")
    A(">  做出類似的模板技能、傷害與動畫效果**，所以才稱為**技能模板驗收標準**」")
    A("")
    A("⭐ 所以這份文件回答的是「**一支技能要通過三軸驗收，它的 JSON 要長什麼樣**」，")
    A("⛔ 不是「這三支修好了沒有」。")
    A("")
    A("---")
    A("")

    # ---- §1 量法 --------------------------------------------------------
    A("## §1 三軸怎麼量（Codex 可以照著自檢）")
    A("")
    A("每一軸都輸出一個**計數**，⛔ 不是分數。計數不相加成一個判決 ——")
    A("它們只被拿來**排序**（差最多的排前面）。誰重要是 owner 的決定。")
    A("")
    A("⭐ 動畫軸有**兩個讀法**：拍數（時間上分得開的節拍）與**移動中的模型**")
    A("（原作把一具 locust dummy 沿路徑推出去）。⛔ 兩者不可互相取代 ——")
    A("一支「不等待、只把模型推過去」的技能拍數是 0，而它的演出整段都在移動上。")
    A("")
    A("| 軸 | 原作那一側怎麼數 | GGD 那一側怎麼數 | 缺口 |")
    A("|---|---|---|---|")
    A(
        "| **特效正確性** | 作者**指名過**的模型 stem：`realArt[]` 裡 provenance ∈ "
        "`{jass-literal, w3a-override, w3h-override}` 的，∪ JASS 演出鏈裡 "
        "`AddSpecialEffect*` 逐字打出來的路徑。⛔ `stock-inherited` 不算 —— "
        "provenance 合約自己寫著它「NOT intent」 | `vfxKey` 反推：`fx.w3x.<類>.<stem>` "
        "才對得上一份原作模型；`fx.prim.*` 是**通用原型**，一份都對不上。"
        "⭐ **∪ `spawnModelFx.modelKey`** —— 移動中的那具模型也是播出來的原作美術，"
        "stem 從模型文件的 `glbPath` 檔名推導 | "
        "指名過但播不出來的 stem 數 |"
    )
    A(
        "| **動畫正確性** | 演出鏈裡 `TriggerSleepAction`/`PolledWait` 的**拍數**，"
        "且**展開字面上界的 `loop`**（七連斬寫成 `exitwhen i > 7`，不展開只有 2 拍） | "
        "時間上分得開的節拍：`dot` 的 tick 數（`durationSec/intervalSec`）＋ `delayed` "
        "節點＋模板中**未被宣告失效**且 `unit == \"count\"` 的分段參數 | "
        "`max(0, JASS 拍 − GGD 拍)` |"
    )
    A(
        "| **動畫正確性②：移動中的模型** | 演出鏈裡 `SetUnitPosition`/`SetUnitX`/"
        "`SetUnitY` 的呼叫次數（展開 `loop`）—— 那是 locust dummy 被一格一格推出去的"
        "痕跡。⚠️ **>1 次才算一段路徑**，一次是瞬移／擊退的落點修正 | "
        "`spawnModelFx` 的**段數** ＝ 實例數（`radial`/`orbit` 讀 `count`，直線恆為 1）"
        "× 沿路取樣數（`onTouch` 才有，公式與 `sim/effects/spawnModelFx.ts` 同一條） | "
        "原作推了模型而 GGD 一具都沒有 → 1，否則 0。⚠️ 它是**機制的有無**，"
        "⛔ 不是段數差 —— 段數跟著 tick 率飄 |"
    )
    A(
        "| **傷害正確性** | 演出鏈裡 `UnitDamage*` 的呼叫次數（同樣展開 `loop`） | "
        "扣血葉數：`kind` 以 `damage` 開頭、或帶 `damageType` 的節點；`dot` 按 tick 展開。"
        "⭐ `spawnModelFx` 的 `onTouch`/`onArrive` 底下的葉子要**乘上實例數** —— "
        "12 具各掃一次就是 12 次，⛔ 不是 1 次 | "
        "`max(卡面承諾 − GGD, JASS − GGD, 0)` |"
    )
    A("")
    A("### ⚠️ 三條這把尺自己要遵守的規矩")
    A("")
    A("1. **演出鏈是跟著 `EnableTrigger` 走的，⛔ 不是「同名的那個函式」。**")
    A("   WC3 的時序演出幾乎不寫在同一個 trigger 裡：施法那一個 `EnableTrigger` 下一個。")
    A("   只用 rawcode 接合會整段漏掉 —— 42-04 的 rawcode 只掛在 `The_End_ofWorldStart`，")
    A("   而它承諾的連續打擊住在它啟動的 `The_End_ofWorldCasting`（0.1 秒週期 timer）裡。")
    A("2. ⭐ **讀說明找機制之前先剝掉整段 `「…」`**（owner 2026-08-12：那是**角色對白**，")
    A("   不是真正的效果）。含跨行、含行中。量到過的誤報：一句台詞裡的「在35秒後」")
    A("   會讓一支技能被判成有 35 秒延遲時序。")
    A("3. **模板自己宣告的 `inert` 是證據，不是藉口。** 一個標了 `inert` 的參數")
    A("   （例：分段時序未支援）等於作者已經承認這一段演不出來 —— 它會被列進缺口表的")
    A("   `inertParams`，⛔ 不會因為「已宣告」就從缺口裡消失。")
    A("")

    # ---- §2 詞彙 --------------------------------------------------------
    A("## §2 詞彙（從出貨內容推導，⛔ 不是手寫的清單）")
    A("")
    A("**特效家族** —— `vfxKey` 的前綴決定它對不對得上原作美術：")
    A("")
    A("| 家族 | 意思 | 支數 |")
    A("|---|---|---:|")
    for k, label in (
        ("w3x", "`fx.w3x.*` —— 從原作模型抽出來的粒子層，**對得上** stem"),
        ("prim", "`fx.prim.*` —— 通用原型（火/冰/聖/虛空…），⛔ 對不上任何原作 stem"),
        ("other", "既不是 `fx.w3x.` 也不是 `fx.prim.` 的自訂 id"),
        ("none", "⛔ 沒有 `vfxKey`"),
    ):
        A(f"| {k} | {label} | {fam.get(k, 0)} |")
    A("")
    A("**扣血葉** —— 判準是結構：`kind` 以 `damage` 開頭，或節點帶 `damageType`。")
    A("出貨內容裡符合的 kind：")
    A("")
    kinds: dict[str, int] = {}

    def _scan(n):
        if isinstance(n, dict):
            k = n.get("kind")
            if isinstance(k, str) and (k.startswith("damage") or "damageType" in n):
                kinds[k] = kinds.get(k, 0) + 1
            for v in n.values():
                _scan(v)
        elif isinstance(n, list):
            for v in n:
                _scan(v)

    for aid in sorted(abilities):
        _scan(abilities[aid].get("effects"))
    A("| kind | 出現次數 |")
    A("|---|---:|")
    for k in sorted(kinds):
        A(f"| `{k}` | {kinds[k]} |")
    A("")
    A("**模板宣告失效的參數**（`params[*].inert`）—— 這些是引擎**已知演不出來**的東西，")
    A("Codex 填了它們不會報錯，但遊戲裡不會發生：")
    A("")
    A("| 模板 | 參數 | 宣告的理由 |")
    A("|---|---|---|")
    for tid in sorted(templates):
        for pname, pspec in sorted((templates[tid].get("params") or {}).items()):
            if isinstance(pspec, dict) and pspec.get("inert"):
                A(f"| `{tid}` | `{pname}` | {pspec['inert']} |")
    A("")

    # ---- §2.5 移動中的模型 ----------------------------------------------
    A("## §2.5 移動中的模型（`spawnModelFx`）—— 原作的 locust dummy")
    A("")
    A("owner 2026-08-22 逐字：「**w3x jass + 球體 + 蝗蟲群單位 3d model 特效**")
    A("(ex. Saber 約束勝利之劍的翻滾光束就是)」。")
    A("")
    A("⭐ 三個**模板家族**把這一族拆成可填的參數（`content/ability-templates/`）：")
    A("")
    A("| 模板 | 演出 | 狀態 | 範本 |")
    A("|---|---|---|---|")
    for tid in sorted(templates):
        t = templates[tid]
        if "modelFx" not in (t.get("requires") or []):
            continue
        A(
            f"| `{tid}` | {t.get('name')} | `{t.get('status')}` | "
            f"{t.get('exemplar', {}).get('skill', '')}（`{t.get('exemplar', {}).get('jass', '')}`） |"
        )
    A("")
    fx_rows = [r for r in rows if r["ggd"]["modelFx"] > 0]
    A(f"**出貨內容裡已經在用它的技能：{len(fx_rows)} 支**")
    A("")
    A("| id | 技能 | 具數 | 段數 | 傷害葉 |")
    A("|---|---|---:|---:|---:|")
    for r in sorted(fx_rows, key=lambda x: x["id"]):
        A(
            f"| {r['id']} | {r['name']} | {r['ggd']['modelFx']} | "
            f"{r['ggd']['modelSegments']} | {r['ggd']['damageLeaves']} |"
        )
    A("")
    move_rows = [r for r in rows if r["gaps"]["move"]]
    A(f"⚠️ **原作把模型沿路徑推出去，而 GGD 一具都沒有：{len(move_rows)} 支**（缺口最大的排前面）")
    A("")
    A("| id | 技能 | JASS 推模型 | 傷害缺 | 動畫缺 | 特效缺 |")
    A("|---|---|---:|---:|---:|---:|")
    for r in move_rows:
        A(
            f"| {r['id']} | {r['name']} | {r['src']['dummyMoves']} | "
            f"{r['gaps']['dmg']} | {r['gaps']['anim']} | {r['gaps']['vfx']} |"
        )
    A("")
    A("⚠️ 這張表 ⛔ **不是一張待辦清單** —— `SetUnitPosition` 也可能是瞬移或擊退的")
    A("落點修正。它說的是「**這裡值得去看一眼原作到底演了什麼**」。")
    A("")

    # ---- §3 標本 --------------------------------------------------------
    A("## §3 三支校準標本（owner 點名的那三支）")
    A("")
    A("⭐ 它們的用途是**校準這把尺**：答案已知，所以尺量錯看得出來。")
    A("⛔ 它們不是「要修好的三支」——這份文件不追蹤修復進度。")
    A("")
    for aid in CALIBRATION:
        r = by_id.get(aid)
        if r is None:
            continue
        doc = abilities[aid]
        A(f"### {r['name']}　`{aid}`")
        A("")
        A(f"- **rawcode**：{', '.join(r['rawcodes']) or '（無）'}"
          f"　·　接合信心：`{r['joinConfidence']}`")
        A(f"- **JASS 演出鏈**：{' → '.join(r['chain']) or '（接不到）'}")
        per = r["src"]["periodicSec"]
        A(
            f"- **原作**：扣血 {r['src']['damageCalls']} 次　·　等待 {r['src']['beats']} 拍"
            f"　·　動畫指令 {r['src']['animCalls']} 次"
            f"　·　推模型 {r['src']['dummyMoves']} 次"
            + (f"　·　週期驅動 {per} 秒" if per is not None else "")
            + ("　·　⚠️ 有上界不明的 `loop`" if r["src"]["unboundedLoop"] else "")
        )
        A(
            f"- **GGD**：扣血葉 {r['ggd']['damageLeaves']}　·　節拍 {r['ggd']['beats']}"
            f"　·　移動模型 {r['ggd']['modelFx']} 具／{r['ggd']['modelSegments']} 段"
            f"　·　`vfxKey` = `{r['ggd']['vfxKey']}`（{r['ggd']['vfxFamily']}）"
            + (f"　·　模板 `{r['ggd']['template']}`" if r["ggd"]["template"] else "")
        )
        pr = r["promised"]
        if pr["hits"]:
            A(f"- **卡面承諾**：{pr['hits']} 次　·　佐證：`…{pr['evidence'].strip()}…`")
        A(
            f"- **缺口**：傷害 {r['gaps']['dmg']}　·　動畫 {r['gaps']['anim']}"
            f"　·　特效 {r['gaps']['vfx']}　·　移動模型 {r['gaps']['move']}"
        )
        if r["missingArt"]:
            A(f"- **指名過但播不出來的模型**：{', '.join('`%s`' % s for s in r['missingArt'])}")
        if r["ggd"]["inertParams"]:
            A(f"- **模板宣告失效的參數**：{', '.join('`%s`' % s for s in r['ggd']['inertParams'])}")
        A("")
        A("出貨 JSON 的 `effects`（⭐ 從 `content/abilities/` 逐字抄來，⛔ 不是編的）：")
        A("")
        A(_fence(_shape(doc)))
        A("")

    # ---- §4 全表 --------------------------------------------------------
    A("## §4 缺口表（差最多的排前面）")
    A("")
    A(f"- 量到的技能：**{len(rows)}** 支")
    A(f"- 接得上原作演出鏈的：**{len(joined)}** 支"
      f"（其餘 {len(rows) - len(joined)} 支在 JASS 裡沒有觸發器 —— "
      f"它們是純 w3a 資料技能或 GGD 原創，三軸對它們只量得到 GGD 那一側）")
    A(f"- **任一軸有缺口的：{len(gapped)}** 支")
    A("")
    A(_TABLE_HEAD)
    for r in gapped:
        A(_row_line(r))
    A("")

    # ---- §5 通過的樣子 --------------------------------------------------
    A("## §5 通過的樣子（⭐ 兩份都是出貨內容，⛔ 不是編的範例）")
    A("")
    A("⚠️ 為什麼是**兩份**：出貨內容裡目前**沒有任何一支**同時做到「三軸都不缺」與")
    A("「`vfxKey` 對得上原作模型」。⛔ 硬編一份兩者兼具的假範例，抄的人會照著做出一份")
    A("schema 收得下、遊戲裡卻沒有對應資產的 JSON。⇒ 兩半分開展示，各自都是真的。")
    A("")

    A("### §5.1 三軸都不缺（有原作演出鏈可以對照的）")
    A("")
    clean = [
        r for r in rows
        if r["chain"] and sum(r["gaps"].values()) == 0 and r["src"]["damageCalls"] > 0
    ]
    A(f"符合的有 **{len(clean)}** 支（接得上演出鏈的 {len(joined)} 支裡）。")
    A("")
    if clean:
        ex = clean[0]
        doc = abilities[ex["id"]]
        A(f"⭐ **{ex['name']}**　`{ex['id']}`")
        A("")
        A(f"- 原作扣血 {ex['src']['damageCalls']} 次 ↔ GGD 扣血葉 {ex['ggd']['damageLeaves']}")
        A(f"- 原作 {ex['src']['beats']} 拍 ↔ GGD {ex['ggd']['beats']} 拍（原作沒有時序，GGD 也不假裝有）")
        A(f"- 原作**一份美術都沒指名**（`sfx` 空、`realArt` 全是 `stock-inherited`）"
          f"⇒ `{ex['ggd']['vfxKey']}` 這種通用原型在特效軸上**不算缺口**")
        A("")
        A(_fence(_shape(doc)))
    A("")

    A("### §5.2 特效軸滿分（`vfxKey` 真的對得上原作 stem）")
    A("")
    arty = [r for r in rows if r["ggd"]["vfxFamily"] == "w3x" and r["gaps"]["vfx"] == 0]
    A(f"符合的有 **{len(arty)}** 支。⚠️ 用了 `fx.w3x.*` 的一共 {fam.get('w3x', 0)} 支 ——")
    A("差額是「播了一份原作模型，但作者**還指名過別的**」的那些。")
    A("")
    if arty:
        ex = arty[0]
        doc = abilities[ex["id"]]
        A(f"⭐ **{ex['name']}**　`{ex['id']}`　·　`vfxKey` = `{ex['ggd']['vfxKey']}`")
        A("")
        A("形狀是 `fx.w3x.<類>.<模型 stem>.<粒子層>` —— 中間那一段就是 w3a/JASS 裡")
        A("逐字打出來的模型檔名（去目錄、去副檔名、轉小寫）。⭐ **接合鍵在檔名上**，")
        A("⛔ 不在技能名上：改技能名不會弄壞它，改 stem 會。")
        A("")
        A(_fence(_shape(doc)))
    A("")
    A("### 收下這份合約的人要做的三件事")
    A("")
    A("1. **特效**：能對上原作 stem 就用 `fx.w3x.<類>.<stem>`；真的沒有那份模型時才退")
    A("   `fx.prim.*`，⛔ 而且要知道那一支在特效軸上會一直記著缺口。")
    A("2. **動畫**：卡面說「連斬七次」，`effects` 裡就要有七個**時間上分得開**的節拍")
    A("   （`dot` 的 `durationSec/intervalSec` 或 `delayed` 串接），⛔ 不是一次結算。")
    A("3. **傷害**：扣血葉數要對得上承諾。⭐ 第一·五守則 —— 卡片上不可以有")
    A("   「說了但不會發生」的字；做不到就**改描述**，⛔ 不是留著一句謊話。")
    A("")
    return "\n".join(L) + "\n"


# --------------------------------------------------------------------------
# 守衛：這把尺**真的看得見**移動中的模型嗎（#543）
# --------------------------------------------------------------------------

def selftest(rows: list[dict]) -> list[str]:
    """⭐ 一條薄守衛，量的是**機制**，⛔ 不是數字。

    ⚠️ 它跑在**出貨的 421 列量測結果**上，⛔ 不是自己捏一份夾具 ——
    「被測的不是出貨的那個」（失敗形態⑤）正是這支工具最容易犯的錯：
    一份手寫的 `spawnModelFx` 夾具會在出貨內容改成別的形狀之後照樣全綠。

    ⛔ 這裡一個技能 id、一個門檻數字都沒有：每一條都從資料自己推導。
    ⚠️ 每一條都是「拿掉某一行實作就會紅」的形狀 —— 見報告裡的突變紀錄。
    """
    bad: list[str] = []
    models = _load_dir(MODELS)
    abilities = _load_dir(ABILITIES)
    fx_rows = [r for r in rows if r["ggd"]["modelFx"] > 0]

    # ⓪ 反空欄位：出貨內容裡一具移動模型都沒有的話，下面三條全部是**真空真理**。
    if not fx_rows:
        return ["⛔ 出貨內容裡找不到任何 spawnModelFx —— 底下三條守衛全部退化成空真理"]

    for r in fx_rows:
        nodes = model_fx_nodes((abilities.get(r["id"]) or {}).get("effects"))

        # ① 傷害軸：`onTouch` 的葉子要**乘上實例數**。
        #    ⛔ 拿掉乘數 ⇒ 12 具等分只算 1 次 ⇒ 這一條紅。
        want_inst = sum(
            axes_instances(n) for n in nodes if n.get("onTouch") and _has_damage(n.get("onTouch"))
        )
        if want_inst and r["ggd"]["damageLeaves"] < want_inst:
            bad.append(
                f"{r['id']}：{want_inst} 具模型各掛著一片 onTouch 傷害葉，"
                f"而傷害軸只數到 {r['ggd']['damageLeaves']} —— 實例數沒有被乘進去"
            )

        # ② 動畫軸②：有模型就一定要有段數（段數 0 = 這具模型在尺上不存在）。
        if r["ggd"]["modelSegments"] <= 0:
            bad.append(f"{r['id']}：有 spawnModelFx 卻量到 0 段位移")

        # ③ 特效軸：`modelKey` 指的模型要能解析成一個 stem，而且要**真的**進到
        #    「播得出來」那個集合裡 —— ⛔ 不是「解析得出來」就算數。
        stems = model_stems((abilities.get(r["id"]) or {}).get("effects"), models)
        if not stems:
            keys = sorted({n.get("modelKey") for n in nodes if n.get("modelKey")})
            bad.append(f"{r['id']}：modelKey {keys} 一個都反推不出原作 stem")

    # ④ 原作那一側：JASS 真的數得到「一段路徑」（>1 次移動）。
    #    ⛔ 正則掛掉 ⇒ 全部是 0 ⇒ 移動軸永遠 0 缺口，而它看起來完全正常。
    if not any(r["src"]["dummyMoves"] > 1 for r in rows):
        bad.append("⛔ 421 支裡沒有任何一支的 JASS 推過模型 —— dummy 移動的正則失效了")

    return bad


def _has_damage(branch) -> bool:
    from axes import _is_damage_node  # noqa: PLC0415 — 只有守衛需要它

    def walk(n) -> bool:
        if isinstance(n, dict):
            return _is_damage_node(n) or any(walk(v) for v in n.values())
        if isinstance(n, list):
            return any(walk(v) for v in n)
        return False

    return walk(branch)


def axes_instances(node: dict) -> int:
    from axes import model_fx_instances  # noqa: PLC0415

    return model_fx_instances(node)


# --------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description="技能模板驗收標準：三軸逐支量尺")
    ap.add_argument("--check", action="store_true", help="唯讀比對，過期回 1")
    ap.add_argument("--top", type=int, default=0, help="把前 N 列缺口表印到 stdout")
    ap.add_argument("--json", metavar="OUT", help="把完整量測寫成 JSON（`-` = stdout）")
    ap.add_argument("--id", metavar="ABILITY_ID", help="只看這一支")
    ap.add_argument(
        "--selftest",
        action="store_true",
        help="只跑守衛（⛔ 不重新產生文件）。`--check` 一定會連帶跑它",
    )
    args = ap.parse_args()

    rows = audit_all()

    # ⭐ 守衛跑在**全部 421 列**上，所以要在 `--id` 過濾之前。
    if args.selftest or args.check:
        problems = selftest(rows)
        if problems:
            print("⛔ 移動中的模型特效：這把尺量不到它了", file=sys.stderr)
            for p in problems:
                print(f"   · {p}", file=sys.stderr)
            return 1
        if args.selftest:
            print(f"✅ selftest 通過（{sum(1 for r in rows if r['ggd']['modelFx'])} 支帶移動模型）")
            return 0

    if args.id:
        rows = [r for r in rows if r["id"] == args.id]
        if not rows:
            print(f"⛔ 找不到 {args.id}", file=sys.stderr)
            return 2

    if args.json:
        blob = json.dumps(rows, ensure_ascii=False, indent=2) + "\n"
        if args.json == "-":
            sys.stdout.write(blob)
        else:
            with open(args.json, "w", encoding="utf-8") as fh:
                fh.write(blob)
            print(f"寫了 {args.json}（{len(rows)} 列）")

    if args.top:
        print(_TABLE_HEAD)
        for r in rows[: args.top]:
            print(_row_line(r))

    if args.id or (args.json and not args.check):
        return 0

    abilities = _load_dir(ABILITIES)
    templates = _load_dir(TEMPLATES)
    want = render(rows, abilities, templates)

    if args.check:
        have = open(DOC, encoding="utf-8").read() if os.path.exists(DOC) else None
        if have == want:
            print(f"✅ {os.path.relpath(DOC, ROOT)} 與產生器同步（{len(rows)} 支）")
            return 0
        print(
            "⛔ 技能模板驗收標準過期了。⛔ 不要手改那份文件、⛔ 不要改測試 —— 跑：\n"
            "    python3 tools/skill-audit/audit.py\n"
            "然後 `git add docs/技能模板驗收標準.md`。",
            file=sys.stderr,
        )
        return 1

    os.makedirs(os.path.dirname(DOC), exist_ok=True)
    with open(DOC, "w", encoding="utf-8") as fh:
        fh.write(want)
    print(f"寫了 {os.path.relpath(DOC, ROOT)}（{len(rows)} 支，其中 "
          f"{sum(1 for r in rows if sum(r['gaps'].values()) > 0)} 支有缺口）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
