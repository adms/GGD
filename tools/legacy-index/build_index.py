#!/usr/bin/env python3
"""
⭐【legacy 索引產生器】—— owner 2026-08-13：

  「請你搬移過時資料到 legacy **不要刪除舊資料**，並且將所有搬到 legacy 資料夾的
    檔案都作一個檔案簡介 放在 docs/ 底下一個 legacy-index.md，
    **以免真的需要的時候還是可以有個記憶索引**」
  「你要掃描**所有 legacy 資料夾底下的檔案**建 legacy-index.md 喔，不只是這次搬移計畫」

⛔ 這一份是**產生器**，不是手寫索引。理由是第零守則⑨：
   legacy 會持續長大（今天 318 檔），一份手寫索引第二次歸檔就過期，
   而「過期的索引」比沒有索引更糟 —— 它會讓人以為查過了。

⚠️ 它掃的是**磁碟**，所以任何人把東西丟進 legacy 而沒更新索引，
   守衛（`packages/shared/src/ops/legacyIndexFresh.test.ts`）就會紅。

用法：
    python3 tools/legacy-index/build_index.py            # 寫出 docs/legacy-index.md
    python3 tools/legacy-index/build_index.py --check    # 只比對，過期回非零

三種簡介來源，優先序由高到低：
  ① `CURATED` —— 這一份裡逐檔手寫的裁決（來自 2026-08-13 的盤點 + 對抗複驗）
  ② 文件自己的**第一個標題 + 第一段非空內文**（md）
  ③ 從 JSON 內容推導（content/_legacy 的 277 份走這條：id / name / 為什麼下架）
"""
from __future__ import annotations

import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "docs", "legacy-index.md")

# ⚠️ 新增一個 legacy 目錄時把它加進這裡 —— 守衛掃的是這張表推導出來的檔案集合。
#    ⛔ 不要掃 .venv（第三方 pip 自己也有一個叫 legacy 的模組）。
LEGACY_ROOTS = [
    ("docs/legacy", "規格與文件的隔離區（第〇·六守則階梯的第 3–5 層 + 已被取代的同型文件）"),
    ("content/_legacy", "**下架的內容文件** —— 英雄、技能、**道具**、config。「消失 ≠ 歸檔」：白名單移除的東西要真的躺在這裡"),
]

# ---------------------------------------------------------------------------
# ① 逐檔裁決（2026-08-13 盤點：6 面向初盤 + 對抗複驗）
# ---------------------------------------------------------------------------
CURATED: dict[str, tuple[str, str]] = {
    # path -> (一句話這是什麼, 為什麼進 legacy / 誤讀會怎樣)
    "docs/legacy/README.md": (
        "隔離區的規則本身", "說明為什麼有這個資料夾、什麼該進來、閘在哪裡"),
    # ── 2026-08-13 第一批（w3x 保真度）──
    "docs/legacy/_w3x-fidelity-superseded.md": (
        "被 owner 新版設計取代的原作數值", "定義上就是「已被取代」。留著是因為知識不可以無聲消失"),
    "docs/legacy/_fidelity-audit-78.md": (
        "task #78「1:1 對照 w3x」的稽核報告", "#78 的預設立場被第〇·六守則推翻了 —— 它把 JASS/w3x 當真理，而那是第 3–5 層"),
    "docs/legacy/_ability-fidelity-ledger.md": (
        "696 支技能的三欄帳本（描述 vs 實作 vs w3x）", "第三欄的權威是 w3x。⚠️ 產生器 `docs/tools/ability_ledger.py` 的輸出路徑已改指這裡"),
    "docs/legacy/_ability-fidelity-ledger.json": (
        "同上的 JSON 版（編輯器吃這一份，不要 parse md）", "同上"),
    "docs/legacy/_kit-fidelity-audit-247.md": (
        "114 位英雄技能組・描述 vs 實作對帳清單", "同一個 w3x 保真度年代的產物"),
    "docs/legacy/效果標籤詞彙表.md": (
        "效果標籤詞彙表 **v1**", "已被 `docs/效果標籤詞彙表v2.md` 取代（v2 的檔頭自己就這樣寫）"),
    # ── 2026-08-13 第二批（本次搬移）──
    "docs/legacy/_skill-mechanics-coverage-20260808.md": (
        "90 支重製技能 → 機制覆蓋矩陣", "檔頭釘死查證 commit `8cfb22d3`，而**下一個** commit 就把 kinds 27→34、hooks 9→15。照它會判斷一堆「引擎做不到」而去繞路。現行權威是 `GET /capabilities`"),
    "docs/legacy/abilities_vfx_editor_readme.md": (
        "外部編輯器交接（2026-08-03 版）", "新版 `_codex-handoff.md`（08-12）的「必給三份」裡沒有它。照它交付的編輯器不知道五層階梯、不知道 `GET /capabilities` 才是權威"),
    "docs/legacy/_ability-ledger-editor-spec.md": (
        "保真度編輯器規格", "第三欄權威是 w3x；它操作的帳本本體早就在 legacy，規格卻留在第一層"),
    "docs/legacy/_vfx-fidelity-w3x.md": (
        "w3x 特效保真度對照", "「資料來源（權威順序）」逐條是 w3a / AbilityFunc.txt / war3map.j / w3u —— 定義上就是階梯第 3–5 層"),
    "docs/legacy/_derived-stats-248.md": (
        "從 w3u/UnitBalance.slk 重算全 114 位的三圍推導表", "它寫「倍率該留在 ×8 不要動」，而出貨的 `maxHealth` 是 **4.0** —— 照它調平衡回合長度直接翻倍"),
    "docs/legacy/_TEMP-工作流交接.md": (
        "臨時工作流交接（自稱 `_TEMP-`）", "自陳「等下一輪收工就可以刪掉」，卻又說「下次重新開始先讀這一頁」。它寫「v0.9.16 已上線」，實際差 15 個版號"),
    "docs/legacy/_outstanding-20260802.md": (
        "08-02 的待辦帳本", "自稱「當下的待辦帳本，不是歷史紀錄」，標題卻釘死 08-02。用 11 天前的 T0 清單覆蓋現在的優先序"),
    "docs/legacy/_live-progress.md": (
        "即時進度看板", "自稱「每有工作流回報就更新」，最後更新停在 **07-26**。已上線欄寫 v0.5.10（實際 v0.15.x）；「誠實覆蓋率 16.9%」今天是 100%"),
    "docs/legacy/_session-handover-0731.md": (
        "session 交接（07-31）", "以為部署卡在 ssh 私鑰、線上是 v0.9.15。⚠️ 搬移時已把 `_execution-batches.md` 的轉介路徑改掉"),
    "docs/legacy/_session-handover-2026-07-29.md": (
        "session 交接（07-29）", "兩次要求「下次開機第一件事：線上打一場」—— **直接違反現行守則**（owner 2026-08-09 已退掉手動打一場）"),
    "docs/legacy/_session-handoff-20260725.md": (
        "session 交接（07-25）", "自陳是 temp/過渡文件。⚠️ §7 明文寫著兩個外洩憑證的值 —— 搬檔**不改變資安態勢**，真正的修法是輪替（GH#181）"),
    "docs/legacy/_session-handoff-2026-07-24.md": (
        "session 交接（07-24，系列最舊）", "接到 20 天前、11 個次版號以前的 v0.4.1 現場"),
    "docs/legacy/_champion-dedup-113.md": (
        "#113 英雄去重的**舊**接手檔", "它的接班檔自己寫「本檔取代…那份的結論方向對、**理由是錯的**」。正確版是 `docs/_audit-113-duplicate-pairs.md`"),
    "docs/legacy/_champion-attack-range-20260731.md": (
        "07-31 的英雄攻擊距離快照", "自陳「這是一份時間點快照」，而「過期了就補一行指向新檔」那一行從沒補上"),
    "docs/legacy/_execution-batches-history-20260725.md": (
        "作戰表歷史封存（07-25）", "⚠️ 它的部署段寫「用裸的 docker compose build」—— 照做會踩地雷 4（掉版本戳 → 徽章寫 UNSTAMPED-BUILD）"),
    "docs/legacy/_execution-batches-history-20260726.md": (
        "作戰表歷史封存（07-26，120KB）", "已結案內容與活的作戰表同名同型住在同一層 —— 正是 legacy/README 指出的根因"),
    "docs/legacy/_execution-batches-history-20260727.md": (
        "作戰表歷史封存（07-26 深夜～07-27）", "含 v0.6.0 的部署驗收數字；當現況會用 07-27 的線上狀態判斷今天"),
    "docs/legacy/tiering-proposal.md": (
        "英雄分級**提案**（08-11）", "自陳「本文件沒有動過任何 content/ 檔案」，而隔天裁決就落地了。把已決事項當待辦重開"),
    "docs/legacy/英雄屬性正規化提案.md": (
        "屬性正規化**提案**（初版）", "自己把權威讓出去：「三個整包方案在計畫書第二·五節，**先讀那一份**」。`config.stat-normalization@1` 已出貨"),
    "docs/legacy/改進延遲.md": (
        "延遲改進計畫**第一版**", "第 1 行逐字「⛔⛔ 已廢棄 —— 不要參考這份文件 ⛔⛔」。現行版是 `docs/_延遲改進計畫.md`（雙向指認一致）"),
    "docs/legacy/新英雄範本.md": (
        "新英雄填空表（最早，07-25 12:22）", "寫「英雄編號 100 ← 目前最大 099」，而 100 已被佔用。編號是 JASS 對照的 join key，填錯是綁死的東西出錯"),
    "docs/legacy/新英雄範本-完整範例.md": (
        "新英雄填空表（帶範例）", "建議帶母體是 n=111，是 stat-normalization 上線**前**的原始分佈"),
    "docs/legacy/新英雄範本-Saber填入.md": (
        "新英雄填空表（Saber 填好的樣本）", "把 `godie-e002` 標成「與 `godie-e00l` 完全重複（#113 去重對象）」—— 而 #113 的裁決是 14 對**全部是本體↔變身態，一個都不能 dedup**"),
    # ── 程式類（鏡射原路徑）──
    "docs/legacy/code/apps/game-server/src/match/__mana_probe.test.ts": (
        "魔力倍率調查用的探測檔（原 `apps/game-server/src/match/`）", "267 行、`expect(` **0 次**、`console.log` 8 次 —— 永遠不會紅，卻把「跑一場真比賽」掛在每次 pnpm test 上"),
    "docs/legacy/code/apps/game-server/src/match/__autoattack_probe.test.ts": (
        "自動攻擊調查用的探測檔（同上）", "180 行、唯一的 expect 是夾具健檢。接班守衛 `autoAcquireWhileMoving.test.ts`（25 個 expect）已經很厚"),
    "docs/legacy/code/apps/game-server/src/match/__pacing_probe.test.ts": (
        "回合節奏 TTK 傾印（同上）", "39 行、`expect(` **0 次**。結論已寫進 docs，回合節奏改由 config 驅動"),
    "docs/legacy/code/tools/model-budget/optimize/_decim-test.mjs": (
        "meshopt 減面參數探測（07-22，原 `tools/model-budget/optimize/`）", "⚠️ 它**會真的寫出一個 glb** —— 有人拿它順手減模型就會產出沒走出貨路徑的資產。出貨的是 `decimate.mjs`"),
    "docs/legacy/code/tools/model-budget/optimize/_decim-test2.mjs": (
        "上一支的第二版（同上）", "同一支探測腳本留了兩代，**兩代都不是出貨的那一支**"),
    "docs/legacy/code/tools/model-budget/optimize/_diag.mjs": (
        "glb 統計傾印 + error 掃描（同上）", "它算三角形只認 `mode===4`，隔壁那支還處理 5/6 —— 同一個資料夾兩支對「幾個三角形」給不同答案"),
    "docs/legacy/code/tools/model-budget/optimize/_weldtest.mjs": (
        "weld tolerance 掃描（同上）", "**沒有結論**的掃描腳本 —— 跑出來是一張數字表，檔案裡沒有一行說最後選了哪一格"),
    "docs/legacy/code/tools/w3x-import/mesh_audit.mjs": (
        "`mesh_audit.mts` 的 tsc 編譯產物（原 `tools/w3x-import/`）", "專案一律用 tsx 直接跑 `.mts`。改到 `.mjs` 那份＝改了一個沒有人執行的檔案（靜默無效）"),
    "docs/legacy/code/tools/w3x-import/mesh_audit.mjs.map": (
        "上一項的 sourcemap", "決定性證據：第一行 `\"sources\":[\"mesh_audit.mts\"]`"),
    "docs/legacy/code/tools/w3x-import/validate_glb.mjs": (
        "`validate_glb.mts` 的 tsc 編譯產物（同上）", "⛔ **`.mts` 是活的出貨工具**（`package.json` 的 `validate:glb` 真的在跑它），這裡歸檔的只有編譯殘留"),
    "docs/legacy/code/tools/w3x-import/validate_glb.mjs.map": (
        "上一項的 sourcemap", "同上"),
}

# `content/_legacy` 的整批語意（逐檔簡介由 JSON 推導，見 describe_content_doc）
CONTENT_LEGACY_NOTE = (
    "**下架的內容文件**。它們不是「規格過期」，是「這一支不再出貨」——"
    "`invulnerableBinding.test.ts` 逐字釘著「**消失 ≠ 歸檔**」：白名單上不再出貨的，"
    "必須真的躺在這裡而不是憑空不見。⚠️ 有 6 支以上的活測試會讀這個目錄，⛔ 不要清空。\n\n"
    "⭐ **目錄位置本身就是宣告**（owner 2026-08-18：「不應該再出現在現有任何文件上"
    "或讓任何 script 浪費算力處理」）。`content/_legacy/` 不在 `COLLECTION_NAMES` 裡，"
    "所以 `pnpm content:build`、`bundle.json`、每一支 `content/<collection>/` 逐檔掃描的"
    "產生器（`gen_overview.ts` / `gen_spec.ts` / `gen_reference.py` / `gen_readme_lists.py`）"
    "與後台的道具清單**全部自動看不到它們** —— ⛔ 沒有任何一份「要跳過哪些 id」的硬編名單，"
    "那會是第四個住處，必然過期。"
)


def first_para(path: str) -> str:
    """md 的第一個標題 + 第一段非空內文（回退用）。"""
    try:
        with open(path, encoding="utf-8") as f:
            lines = [l.rstrip() for l in f.readlines()[:60]]
    except Exception:
        return ""
    title = next((l.lstrip("# ").strip() for l in lines if l.startswith("#")), "")
    body = ""
    for l in lines:
        s = l.strip()
        if not s or s.startswith("#") or s.startswith("|") or s.startswith("---"):
            continue
        body = re.sub(r"^[>*\-\s]+", "", s)
        break
    out = f"{title} —— {body}" if title and body else (title or body)
    return re.sub(r"\s+", " ", out)[:150]


def describe_content_doc(path: str) -> tuple[str, str]:
    """content/_legacy 的 JSON → (是什麼, 為什麼在這裡)。"""
    try:
        d = json.load(open(path, encoding="utf-8"))
    except Exception:
        return ("（無法解析的 JSON）", "")
    schema = str(d.get("schema", "?"))
    name = str(d.get("name") or d.get("displayName") or d.get("id") or "")
    # ⚠️ 不是每一份歸檔的 JSON 都是一份 content 文件。`content/_legacy/config/` 收的是
    # **從一份還在服役的文件裡切下來的片段**（例如 arena-rules 那三個永遠打不到的回合），
    # 它們沒有 `schema`／`name`，走上面那條會產出「?「」」這種空白列 —— 而一份看起來
    # 有查過、其實什麼都沒說的索引，比沒有索引更糟（這支腳本檔頭的原話）。
    # ⇒ 這一類自己帶 `note` + `supersededBy`，就用它們。
    if schema == "?" and not name and d.get("note"):
        # 第一句常常是「這不是一份會被載入的 content 文件」那句共用的樣板 —— 它對
        # 每一份都成立，所以說不出這一份是什麼。跳過它，取第一句有內容的。
        sents = [x.strip(" ⛔⭐⚠️") for x in re.split(r"[。\n]", str(d["note"])) if x.strip(" ⛔⭐⚠️")]
        first = next((x for x in sents if "不在 COLLECTION_NAMES" not in x), sents[0] if sents else "")
        why = str(d.get("supersededBy") or "").strip()
        return (first[:120] or "歸檔的設定片段", f"被 {why} 取代" if why else "已被取代，留著備查")
    kind = {"ability@1": "技能", "champion@1": "英雄", "item@1": "道具"}.get(schema, schema)
    extra = ""
    if schema == "champion@1":
        ab = d.get("abilities") or {}
        extra = f"，{len(ab)} 格技能" if ab else ""
    elif schema == "ability@1":
        slot = d.get("slot")
        extra = f"，槽位 {slot}" if slot else ""
    elif schema == "item@1":
        # ⚠️ 這一列的「為什麼」是**推導**的，⛔ 不是一份手抄的 id → 理由對照表。
        #    判準逐字對應 owner 2026-08-18 點名的兩個系列（製作書／合成過渡期），
        #    第三種是兌換券。三種都是「GGD 沒有合成系統」的殘留：
        #    `shopCatalogue` 只上架 `craftRole:"final"` ＋ 兩個 service ＋ 寶具貨架，
        #    所以這三類**在任何一扇門後面都拿不到**。
        return (
            f"道具「{name}」，{_item_series(d)}",
            "沒有任何取得路徑（不在商店貨架、不在任何抽獎表）",
        )
    return (f"{kind}「{name}」{extra}".strip("，"), "下架，不再出貨")


def _item_series(d: dict) -> str:
    """一件退場道具屬於哪一個系列 —— ⛔ 從文件自己的欄位推導，不查表。"""
    if "製作書" in str(d.get("name", "")):
        return "製作書系列"
    role = str(d.get("craftRole", ""))
    if role == "component":
        return f"合成過渡期道具（craftRole=component，原價 {d.get('cost', 0)}）"
    if role == "token":
        return "兌換券（craftRole=token）"
    return f"craftRole={role or '—'}"


def collect() -> list[tuple[str, str, list[tuple[str, str, str]]]]:
    """→ [(root, root 說明, [(rel, 是什麼, 為什麼)])]"""
    out = []
    for root, blurb in LEGACY_ROOTS:
        abs_root = os.path.join(ROOT, root)
        if not os.path.isdir(abs_root):
            continue
        rows = []
        for dirpath, dirnames, filenames in os.walk(abs_root):
            dirnames.sort()
            # ⭐⭐ 2026-09-02（GH#947）—— **`_overwrites/` 不逐檔列。**
            #
            # ⛔ 量到：3367 條裡 **2762 條（82%）是自動留底** ——
            # 而它們是 `scripts/preserve-before-overwrite.py`（PreToolUse hook）寫的，
            # ⭐ **每一次覆蓋檔案就多一個目錄** ⇒ 這份索引在一個工作 session 裡
            # 過期了 **5 次以上**，而每一次「紅」講的都不是知識的事。
            #
            # ⭐ 兩個理由，⛔ 都不是「它很吵」：
            # ① **它們已經有自己的帳本** —— `docs/legacy/_overwrites/_ledger.tsv`，
            #    CLAUDE.md 逐字指名那一份是覆蓋留底的紀錄。⇒ 這裡再列一次是
            #    **第二個住處**（第〇·四守則），而且是會腐爛的那一個。
            # ② 這份索引的用途是 owner 說的「**以免真的需要的時候**」找回退休的
            #    **文件** —— ⭐ 而 605 條真的條目被 2762 條機器留底埋掉了。
            #
            # ⚠️ ⛔ **不是刪除**：檔案原封不動躺在磁碟上，帳本一列都沒少。
            # ⭐ 要改回來就把這三行拿掉（⇒ 一行 diff 的 rollback）。
            if "_overwrites" in dirnames:
                dirnames.remove("_overwrites")
            for fn in sorted(filenames):
                if fn == ".DS_Store":
                    continue
                full = os.path.join(dirpath, fn)
                rel = os.path.relpath(full, ROOT)
                if rel in CURATED:
                    what, why = CURATED[rel]
                elif full.endswith(".json") and root == "content/_legacy":
                    what, why = describe_content_doc(full)
                elif full.endswith(".md"):
                    what, why = (first_para(full) or "（無標題）"), "（未逐檔裁決 —— 補進產生器的 CURATED）"
                else:
                    what, why = f"（{os.path.splitext(fn)[1] or '無副檔名'} 檔）", "（未逐檔裁決 —— 補進產生器的 CURATED）"
                rows.append((rel, what, why))
        out.append((root, blurb, rows))
    return out


def esc(s: str) -> str:
    return s.replace("|", "\\|").replace("\n", " ")


def render() -> str:
    data = collect()
    total = sum(len(r) for _, _, r in data)
    # ⛔ 這裡以前烙了 `git describe` 的版本號。那是一個**自製的過期來源**：
    #    版本號每 commit 一次就變，於是索引每 commit 一次就「過期」，
    #    守衛每天紅一次而且理由跟 legacy 的內容無關 —— 一條會誤報的守衛
    #    三個月後沒有人會讀（`noScratchProbes.test.ts` 檔頭記過同一個教訓）。
    #    索引要釘的是**檔案清單**，⛔ 不是產生它的那一刻。
    L = []
    L.append("# GGD · legacy 記憶索引")
    L.append("")
    L.append("> ⚙️ **這一份是產生出來的，⛔ 不要手改。**")
    L.append("> ")
    L.append("> ```bash")
    L.append("> python3 tools/legacy-index/build_index.py")
    L.append("> ```")
    L.append("> ")
    L.append("> 守衛：`packages/shared/src/ops/legacyIndexFresh.test.ts`（真的用 `--check` 跑腳本）。")
    L.append("> 它紅了不要改它 —— 跑上面那行，然後 `git add docs/legacy-index.md`。")
    L.append("")
    L.append("---")
    L.append("")
    L.append("## 這一份在回答什麼")
    L.append("")
    L.append("owner 2026-08-13：")
    L.append("")
    L.append("> 「請你搬移過時資料到 legacy **不要刪除舊資料**，並且將所有搬到 legacy 資料夾的檔案")
    L.append(">   都作一個檔案簡介 放在 docs/ 底下一個 legacy-index.md，")
    L.append(">   **以免真的需要的時候還是可以有個記憶索引**」")
    L.append("")
    L.append("⭐ 歸檔**不是刪除**。第〇·六守則逐字：「『分開』不是『丟掉』——")
    L.append("測試可以跟著設計走，**知識不可以無聲消失**」。")
    L.append("所以每一份都留著，而這一份是找回它們的地圖。")
    L.append("")
    L.append(f"**目前共 {total} 個檔案**，分佈在 {len(data)} 個隔離區。")
    L.append("")
    L.append("| 隔離區 | 檔數 | 是什麼 |")
    L.append("|---|---:|---|")
    for root, blurb, rows in data:
        L.append(f"| [`{root}/`](legacy-index.md#{root.replace('/', '').replace('_', '')}) | {len(rows)} | {blurb} |")
    L.append("")
    L.append("⚠️ **在這裡找到需要的東西之後**：它仍然是階梯第 3–5 層（或已被取代的同型文件）。")
    L.append("要用它之前先問「現行的那一份說什麼」—— 衝突時**現行的贏**（第〇·六守則）。")
    L.append("")
    for root, blurb, rows in data:
        L.append("---")
        L.append("")
        L.append(f"## `{root}/` —— {len(rows)} 檔")
        L.append("")
        L.append(blurb)
        L.append("")
        if root == "docs/legacy":
            # ⭐⭐ **少掉的那一整區要在這裡說出來** —— ⛔ 一個靜默地不見的區塊
            # 與「它本來就不存在」長得一模一樣（第一·五守則的反面：
            # 知識可以搬家，⛔ 不可以無聲消失）。
            L.append(
                "> ⚠️ ⛔ **`_overwrites/` 刻意不逐檔列。** 那裡是"
                "`scripts/preserve-before-overwrite.py`（PreToolUse hook）的**自動留底**，"
                "⭐ 每覆蓋一個檔就多一個目錄 —— 2026-09-02 量到它佔這份索引的 **82%**"
                "（3367 條裡 2762 條），⇒ 把 605 條真的條目埋掉，"
                "而且讓這份索引在一個工作 session 裡過期 **5 次以上**。"
            )
            L.append(">")
            L.append(
                "> ⭐ **它有自己的帳本**：[`docs/legacy/_overwrites/_ledger.tsv`]"
                "(legacy/_overwrites/_ledger.tsv) —— CLAUDE.md 逐字指名那一份。"
                "⇒ 要找某一次覆蓋的留底就查那裡，⛔ 檔案一個都沒有被刪。"
            )
            L.append("")
        if root == "content/_legacy":
            L.append(CONTENT_LEGACY_NOTE)
            L.append("")
            by = {}
            for rel, what, why in rows:
                seg = rel.split("/")[2] if len(rel.split("/")) > 2 else "(root)"
                by.setdefault(seg, []).append((rel, what, why))
            for seg in sorted(by):
                L.append(f"### `{seg}/` （{len(by[seg])} 檔）")
                L.append("")
                L.append("| 檔案 | 是什麼 |")
                L.append("|---|---|")
                for rel, what, why in by[seg]:
                    L.append(f"| `{os.path.basename(rel)}` | {esc(what)} |")
                L.append("")
            continue
        L.append("| 檔案 | 是什麼 | 為什麼在這裡 / 誤讀會怎樣 |")
        L.append("|---|---|---|")
        for rel, what, why in rows:
            short = rel[len(root) + 1:]
            L.append(f"| `{short}` | {esc(what)} | {esc(why)} |")
        L.append("")
    return "\n".join(L) + "\n"


def main() -> int:
    text = render()
    if "--check" in sys.argv:
        cur = open(OUT, encoding="utf-8").read() if os.path.exists(OUT) else ""
        if cur == text:
            print("legacy-index.md 是最新的")
            return 0
        print("⛔ docs/legacy-index.md 過期 —— 跑 `python3 tools/legacy-index/build_index.py`")
        return 1
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(text)
    n = sum(len(r) for _, _, r in collect())
    print(f"寫出 {OUT}（{n} 個檔案）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
