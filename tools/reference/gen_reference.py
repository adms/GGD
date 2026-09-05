#!/usr/bin/env python3
"""gen_reference.py — regenerate docs/reference/*.md from content/ + the curation whitelist.

WHY THIS EXISTS. The roster / ability / item lists are 881 rows and they move
every time someone touches `content/`. Hand-writing them into the README would
be wrong within a week, and a hand-kept list is a SECOND source of truth that
silently disagrees with the first (see docs/champions.csv, which nothing
generates and nothing checks). So: no hand-written lists. This script is the
only writer, `content/` is the only source, and the header of every emitted file
carries the `contentVersion` it was built from so a stale file is obvious.

WHAT IT READS (nothing else):
  content/manifest.json              -> contentVersion (a pure function of the docs)
  content/champions/*.json           -> the roster
  content/abilities/*.json           -> the per-slot ability docs (SIX slots per
                                        champion: PASSIVE/天生 + Q/W/E/R/EX)
  content/items/*.json               -> the 214 item docs
  content/loot-tables/legendary-weapons.json -> the legendary pool
  docs/reference/_curation-snapshot.json -> OPEN roster / open items / open abilities
                                        ⭐ GH#995: a VERSIONED snapshot of the
                                        operator whitelist, so the output is a pure
                                        function of git. `data/curation/whitelist.json`
                                        (git-ignored runtime state) is only consulted
                                        to REFRESH the snapshot (write mode) or to
                                        flag it stale (`--check`). See `load_curation`.

WHAT IT WRITES:
  docs/reference/roster.md
  docs/reference/abilities.md
  docs/reference/items.md

Run it with `pnpm docs:reference` from the repo root, or directly:
  python3 tools/reference/gen_reference.py

Stdlib only, deterministic (no timestamps in the output — the contentVersion is
the freshness stamp), same conventions as tools/status/gen_status.py.
"""

import json
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(REPO, "tools", "engine-vocab"))

import engine_vocab as V  # noqa: E402  — python 端唯一的引擎詞彙來源

CONTENT = os.environ.get("GGD_CONTENT_DIR") or os.path.join(REPO, "content")
OUTDIR = os.path.join(REPO, "docs", "reference")

# ---------------------------------------------------------------------------
# curation —— 開放名單（英雄／道具／技能）的來源（GH#995）
# ---------------------------------------------------------------------------
#
# ⛔ 在此之前這裡直接讀 `data/curation/whitelist.json` —— 一份 **git-ignored 的營運狀態**
#   ⇒ 同一個 commit 在兩台機器上得到兩份不同的「正確」輸出（owner 的機器 49 名 OPEN、
#   CI 的全新 clone 0 名）⇒ `docs:readme:check` 在 CI 結構上不可能綠（CLAUDE.md 失敗形態⑨），
#   於是它被寫成一條「白名單不在就 skip」—— 而一條 skip 的閘等於沒有閘。
#
# ⭐ 現在產生器只讀**進版控的快照** `docs/reference/_curation-snapshot.json`：
#   · 兩台機器 ⇒ 同一份位元組（快照在 git 裡，⛔ 產出不再取決於這台機器有什麼）
#   · 快照是**有閘的**第二住處：有白名單的機器上 `--check` 逐項比對「快照 ↔ 白名單」，
#     不同就 stale（⇒ 跑 `pnpm docs:readme`：寫模式會從白名單**重刷**快照再產文件）
#   · 快照帶白名單的 `updatedAt`，文件表頭印它 —— 過期看得出來，⛔ 不是靜靜地舊
#   ⚠️ 快照的來源是**跑產生器那台機器**的 `data/curation/whitelist.json`（README 在此之前
#     就是這樣烘的，只是沒有留下快照）。要從正式站拉，是一支獨立的 `curation:snapshot`
#     （package.json 不在這張票的柵欄內 ⇒ 沒做，記在報告裡）。
#
# 🔀 開關 `GGD_REFERENCE_CURATION`（owner 2026-09-06「有問題做成開關 不要卡在我這裡」）：
#   snapshot（預設）—— 上面那條路：README 照舊印**開放名單**（版面不變）
#   placeholder      —— 文件**完全不含**開放名單：不讀白名單也不讀快照，開放旗標整欄不印、
#                      README 名冊改印全部英雄，來源那一句改成固定文字指向
#                      `GET /api/v1/curation/whitelist`（票裡的 A/C 路）
#
# 🧪 `GGD_CURATION_WHITELIST`：白名單**路徑**覆寫。測試用它模擬「這台機器沒有白名單」
#    （指到一個不存在的路徑），`packages/shared/scripts/buildEditorTargetProfile.ts` 讀同一個名字。
CURATION_MODES = ("snapshot", "placeholder")
CURATION_MODE = os.environ.get("GGD_REFERENCE_CURATION") or "snapshot"
WHITELIST = os.environ.get("GGD_CURATION_WHITELIST") or os.path.join(
    REPO, "data", "curation", "whitelist.json")
CURATION_SNAPSHOT_REL = "docs/reference/_curation-snapshot.json"
# ggd:writes docs/reference/_curation-snapshot.json
CURATION_SNAPSHOT = os.path.join(REPO, *CURATION_SNAPSHOT_REL.split("/"))
CURATION_SNAPSHOT_SCHEMA = "ggd-curation-snapshot@1"
CURATION_ENDPOINT = "GET /api/v1/curation/whitelist"
CURATION_LISTS = ("champions", "items", "abilities")
# ⭐ 說明推導（票號待開） —— 算繪好的技能說明（`pnpm spec:build` 的產物，`spec:check` 守著）。
#    `GGD_ABILITY_PROSE` 是與 `GGD_CONTENT_DIR` 同款的沙盒接縫：把產生器指到另一份（例如
#    HEAD 匯出的）算繪產物，⛔ 不是給人翻的開關。
ABILITY_PROSE = os.environ.get("GGD_ABILITY_PROSE") or os.path.join(
    REPO, "docs", "editor-contract", "ggd-ability-prose.json")

CMD = "pnpm docs:reference"
SCRIPT = "tools/reference/gen_reference.py"

# The two prices a weapon may carry — packages/shared/src/sim/economy/itemTiers.ts:43-46.
TIER_PRICE = {"SIMPLE": 300, "POWERFUL": 1200}
# ⭐ owner 2026-08-18 把上架寶具切成三階：EX / [EX解放] / [EX∅ 根源]。
# ⛔ 列的是**檔名**，成員一律從磁碟讀 —— 搬一件寶具換階不必動這支腳本。
WEAPON_POOL_TABLES = ["legendary-weapons", "ex-release-weapons", "ex-origin-weapons"]
LEGENDARY_POOL_TABLE = WEAPON_POOL_TABLES[0]
# The two shop SERVICES: real item docs that never occupy an inventory slot.
SERVICE_IDS = {"stat-attunement", "legendary-orb"}

# SIX slots per champion, not five. `PASSIVE` (天生技, the w3x `NN-00`) is a real
# slot owned from level 1 — it sorts FIRST because its number is 00 and because
# the hero has it before he learns anything else. The importer originally dropped
# it entirely; the archaeology pass recovered 108 of them (3 heroes genuinely have
# no NN-00: godie-h02n / godie-u01q / godie-ogld).
SLOT_ORDER = {"PASSIVE": 0, "Q": 1, "W": 2, "E": 3, "R": 4, "EX": 5}
SLOTS = ("PASSIVE", "Q", "W", "E", "R", "EX")
CASTABLE_SLOTS = ("Q", "W", "E", "R", "EX")

# `ability@1.innateKind`, required on (and only on) slot PASSIVE.
INNATE_LABEL = {"passive": "天生·被動", "active": "天生·主動"}

# WHY a champion has no `passiveAbility`. Absence is a RECOVERED FACT, never a
# TODO, so the doc says which fact. Anything not listed here falls back to a
# generic line rather than a guess — if this dict goes stale the reader is told
# "reason not recorded", which is honest, instead of being told something false.
NO_PASSIVE_REASON = {
    "sela": "非 w3x 原創英雄，沒有 `NN` 編號",
    "thorne": "非 w3x 原創英雄，沒有 `NN` 編號",
    "godie-h02n": "原始地圖裡完全沒有技能",
    "godie-u01q": "原始地圖裡完全沒有技能",
    "godie-ogld": "有 `72-01..04` 與 `72-002`，但地圖裡不存在 `72-00`",
}

# ⚠️ QUEST_POOL_TABLE（`quest-rewards`）沒有了：owner 2026-08-18 把整張表搬進
# `content/_legacy/loot-tables/` ——「任務道具」的標籤在競技場新玩法完全不考慮，
# 那 6 件現在是三階寶具池裡的普通寶具。`craftRole:"quest"` 這個**標記**還在道具文件上
# （它是 w3x 匯入的來源紀錄），所以下面第 3 節照樣列得出來，只是它不再是一個「面」。

# Reader-facing labels for the `craftRole` marker recovered from the source-map
# triggers (packages/shared/src/sim/content/defs.ts is the vocabulary, task #70).
CRAFT_ROLE_LABEL = {
    "final": "最終合成 final",
    "component": "組件 component",
    "quest": "任務獎勵 quest",
    "token": "代幣 token",
    "service": "商店服務 service",
    "none": "無角色 none",
}


def item_has_effect(i):
    """Mirror of packages/shared/src/sim/economy/itemTiers.ts:itemHasEffect —
    an item@1 can express only modifiers/passive, so one carrying neither is
    inert by construction and the sim refuses to sell it."""
    return bool(i.get("modifiers")) or bool(i.get("passive"))


def classify_items(ctx):
    """The single craftRole-based partition every emitter reads. Mirrors the shop
    gate in packages/shared/src/sim/economy/shop.ts + ui/panels/champSelectFilter.ts
    (shopCatalogue): buyable == craftRole 'final' AND has effect, plus the two
    shop SERVICES. The 6 finals with no payload (雷神之鎚/黑色魔書/…) stay
    classified 'final' but off the shelf until item@1 grows an active field (#56).

    Returns a dict of id-ordered lists. Every one of the 214 docs lands in exactly
    one bucket, so the buckets always sum to len(items) — a breakdown that does
    not is a lie the reader would catch."""
    items = ctx["items"]
    legendary = ctx["legendary_pool"]

    shop_final = [i for i in items if i.get("craftRole") == "final" and item_has_effect(i)]
    inert_final = [i for i in items if i.get("craftRole") == "final" and not item_has_effect(i)]
    services = [i for i in items if i["id"] in SERVICE_IDS]
    legend = [i for i in items if i["id"] in legendary]
    quest = [i for i in items if i.get("craftRole") == "quest"]

    taken = {i["id"] for i in shop_final + inert_final + services + legend + quest}
    component = [i for i in items if i["id"] not in taken and i.get("craftRole") == "component"]
    token = [i for i in items if i["id"] not in taken and i.get("craftRole") == "token"]
    other = [i for i in items if i["id"] not in taken and i.get("craftRole") not in ("component", "token")]

    return {
        "shop_final": shop_final,
        "inert_final": inert_final,
        "services": services,
        "legendary": legend,
        "quest": quest,
        "component": component,
        "token": token,
        "other": other,
    }

# 表格用的**簡稱**（一格塞得下）。⛔ 這不是「有哪些屬性」的清單 ——
# 「有哪些」永遠是 `Stat` 枚舉，這裡只覆蓋想寫短一點的那幾條，其餘自動落到
# `baseBonus.ts::STAT_LABEL_ZH`（`Record<Stat,…>`，TypeScript 逼它完整）。
#
# ⛔ 2026-08-18 之前這裡是一份手抄的 15 條清單，於是 `evasion` / `spellVamp` /
# `maxHitPctMaxHp` 這些真的出現在出貨道具上的屬性，在 `docs/reference/items.md`
# 上印的是**裸 key**（`spellVamp +0.2`）。`V.label_table` 讓那件事不可能再發生：
# 引擎多一條屬性，這張表當天就多一條，⛔ 不是安靜地少一條。
STAT_LABEL = V.label_table({
    "ap": "法強",
    "mr": "魔抗",
    "as": "攻速",
    "ms": "移速",
    "maxHealth": "生命",
    "maxMana": "魔力",
    "healthRegen": "回血",
    "manaRegen": "回魔",
    "range": "射程",
    "maxHitPctMaxHp": "單發傷害上限",
    "cooldownDrainRate": "冷卻流逝",
}, what="docs/reference 的屬性簡稱")

# 每一個 `ModOp` 在這份文件裡怎麼讀。⛔ 缺一個就 raise（`V.require_ops`）——
# 一個沒被想過的運算子被當成 `+N` 印出來，是**一句帶著數字的假話**：
# `capRaise as 10`（解鎖攻速上限到 10）以前印的是「攻速 +10」。
#   None      = 一般加減（`+N` / `+N%`）
#   否則      = 一個 format 字串，`{label}` `{num}` `{extra}` 三個欄位
OP_FORM = {
    "flat": None,
    "pctAdd": None,
    "pctMult": None,
    "override": "{label} 固定為 {num}",
    "capRaise": "{label}上限解鎖至 {num}",
    "capRaisePct": "{label}上限解鎖 +{num}%",
    "percentOf": "{label} +{extra}的 {num}%",
}
V.require_ops(OP_FORM, "docs/reference 的 modifier 呈現")


# ---------------------------------------------------------------------------
# loading
# ---------------------------------------------------------------------------

def load_collection(name):
    """Every *.json in content/<name>/ except the generated _index.json."""
    d = os.path.join(CONTENT, name)
    if not os.path.isdir(d):
        sys.exit(f"missing collection dir: {d}")
    out = []
    for fn in sorted(os.listdir(d)):
        if not fn.endswith(".json") or fn == "_index.json":
            continue
        with open(os.path.join(d, fn), encoding="utf-8") as f:
            out.append(json.load(f))
    return out


def load_legacy_items():
    """`content/_legacy/items/` 的退場道具。

    ⭐ owner 2026-08-18：「不應該再出現在現有任何文件上⋯**包括道具總表**，
    但**可附註 legacy 路徑供有必要考古的話進一步查找**」。

    ⛔ 這裡**沒有**、也不可以有一份「哪些 id 退場了」的名單 —— 目錄位置本身
    就是宣告。`load_collection("items")` 掃的是 `content/items/`（非遞迴），
    所以退場的那些**自動**不在總表裡；這一支只是為了把「還有 N 件在哪裡」
    這句話也變成推導出來的，⛔ 不是手寫的數字。
    """
    d = os.path.join(CONTENT, "_legacy", "items")
    if not os.path.isdir(d):
        return []
    out = []
    for fn in sorted(os.listdir(d)):
        if not fn.endswith(".json") or fn.startswith("_"):
            continue
        with open(os.path.join(d, fn), encoding="utf-8") as f:
            out.append(json.load(f))
    return out


def legacy_items_note(ctx, root=""):
    """現役文件裡那一行**指標**（⛔ 不是逐筆內容）。缺席時回 None。

    `root` 是「從這份文件走回 repo 根」的相對前綴（README 是 ""，
    `docs/reference/*.md` 是 "../../"）。
    """
    gone = ctx.get("retired_items") or []
    if not gone:
        return None
    books = sum(1 for i in gone if "製作書" in (i.get("name") or ""))
    comp = sum(1 for i in gone if i.get("craftRole") == "component" and "製作書" not in (i.get("name") or ""))
    token = sum(1 for i in gone if i.get("craftRole") == "token")
    return (
        f"🗄️ **另有 {len(gone)} 件已退場道具不列在本表**"
        f"（製作書系列 {books}、合成過渡期道具 {comp}、兌換券 {token}）—— "
        "它們在出貨的商店貨架與每一張抽獎表上都不存在，所以玩家拿不到。"
        f"全文原封不動保存於 [`content/_legacy/items/`]({root}content/_legacy/items/)，"
        f"逐筆索引見 [`docs/legacy-index.md`]({root}docs/legacy-index.md)。"
        "⛔ 這一行是**指標**不是清單：退場與否由檔案在哪個目錄決定，沒有第二份名單。"
    )


def load_json(path, default=None):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# pure text helpers
# ---------------------------------------------------------------------------

def cell(text):
    """Make a string safe inside a markdown table cell."""
    if text is None:
        return "—"
    s = str(text).replace("\r", " ").replace("\n", " ").replace("|", "\\|")
    s = re.sub(r"\s+", " ", s).strip()
    return s if s else "—"


def truncate(text, limit):
    if text is None:
        return "—"
    s = str(text)
    return s if len(s) <= limit else s[: limit - 1].rstrip() + "…"


def name_components(name):
    """Mirror of packages/shared/src/content/championIdentity.ts:186 —
    split on a SPACE-DELIMITED hyphen/dash only. 「英靈-亞瑟王 - 黑化Saber」
    is two components, not three."""
    norm = re.sub(r"\s+", " ", (name or "").strip())
    parts = re.split(r"\s+[-–—]\s+", norm)
    return [p.strip() for p in parts if p.strip()]


def split_champion_name(name):
    """「稱號 - 全名」 -> (title, fullName). 109 of 113 follow the convention;
    the rest come back with title None (mirrors codexData.ts:176)."""
    parts = name_components(name)
    if len(parts) < 2:
        return (None, (name or "").strip() or name)
    return (" - ".join(parts[:-1]), parts[-1])


# `NN-0X 技能名`, EX uses the 3-digit `NN-00X` — championIdentity.ts:89.
HERO_NUMBER_RE = re.compile(r"^(\d{2})-(\d{2,3})(?!\d)")

# Lines the w3x tooltips prefix onto every description and that carry no effect text.
_NOISE_LINE = re.compile(
    r"^(\[[^\]]*\]"                      # [被動] / [主動攻擊] / …
    r"|[\d.]+秒冷卻時間"                  # 30秒冷卻時間
    r"|施展需求魔力[：:].*"
    r"|技能冷卻時間[：:].*"
    r"|效能|解說|故事|說明|背景"
    r"|(故事|說明|背景|解說)[：:]"
    r")$"
)


def meaningful_lines(text):
    out = []
    for raw in (text or "").split("\n"):
        line = raw.strip()
        if not line:
            continue
        if _NOISE_LINE.match(line):
            continue
        # 「故事：來自雛見澤的小女孩」 — strip the label, keep the sentence.
        line = re.sub(r"^(故事|說明|背景|解說)[：:]\s*", "", line)
        if line:
            out.append(line)
    return out


def one_line(text, limit):
    lines = meaningful_lines(text)
    return truncate(lines[0], limit) if lines else None


def effect_summary(doc):
    """Fallback for the 25 abilities with no description: what the sim will do."""
    kinds = []
    for e in doc.get("effects") or []:
        k = e.get("kind")
        if k and k not in kinds:
            kinds.append(k)
    return ("effects: " + ", ".join(kinds)) if kinds else None


def desc_tag(text):
    """The bracketed w3x category: [被動] / [主動攻擊] / [輔助] / …"""
    m = re.match(r"^\s*\[([^\]]+)\]", text or "")
    return m.group(1) if m else None


def _trim(num):
    num = round(num, 2)
    return int(num) if isinstance(num, float) and num.is_integer() else num


# `percentOf` 的**來源**：一條屬性（`from`）或一項當下的資源（`fromResource`）。
# 兩者互斥（`zStatModifier` 擋），語意差別寫在 `stats/resourceStats.ts` 的檔頭。
RESOURCE_LABEL = {"hp": "目前生命", "mp": "目前魔力"}


def _modifier_source(m):
    if m.get("from") in STAT_LABEL:
        return STAT_LABEL[m["from"]]
    res = m.get("fromResource")
    if res:
        return RESOURCE_LABEL.get(res, res)
    return "來源"


def fmt_modifier(m):
    stat, op = m.get("stat"), m.get("op")
    if stat not in STAT_LABEL:
        # ⛔ 以前這裡是 `.get(stat, stat)` —— 一個引擎不認得的屬性會被印成裸 key，
        #   看起來像「這條沒有中文名」，實際上是「這份內容寫了一條不存在的屬性」。
        raise V.VocabError(
            f"modifier 用了引擎不認得的屬性 `{stat}` —— 改那份內容 JSON，⛔ 不要改這支")
    if op not in OP_FORM:
        raise V.VocabError(f"modifier 用了引擎不認得的運算子 `{op}`")
    label = STAT_LABEL[stat]
    val = m.get("value")
    if not isinstance(val, (int, float)):
        return f"{label} ?"
    form = OP_FORM[op]
    if form is not None:
        num = _trim(val * 100) if op in ("capRaisePct", "percentOf") else _trim(val)
        return form.format(label=label, num=num, extra=_modifier_source(m))
    is_pct = op in ("pctAdd", "pctMult")
    num = _trim(val * 100) if is_pct else _trim(val)
    sign = "+" if num >= 0 else ""
    return f"{label} {sign}{num}%" if is_pct else f"{label} {sign}{num}"


def fmt_modifiers(doc):
    mods = doc.get("modifiers") or []
    return " · ".join(fmt_modifier(m) for m in mods) if mods else None


def fmt_passive(doc):
    p = doc.get("passive")
    if not p:
        return None
    hooks = []
    for h in p if isinstance(p, list) else [p]:
        if not isinstance(h, dict):
            continue
        on = h.get("on") or "?"
        kinds = [e.get("kind") for e in (h.get("effects") or []) if isinstance(e, dict)]
        hooks.append(f"{on}→{'/'.join(k for k in kinds if k)}" if kinds else on)
    return " · ".join(hooks) if hooks else "有被動"


# ---------------------------------------------------------------------------
# shared header
# ---------------------------------------------------------------------------

def header(title, subtitle, rows, ctx, extra_notes=()):
    wl = ctx["whitelist_note"]
    L = [
        f"# {title}",
        "",
        "> ⚠️ **本檔案由程式產生，請勿手動編輯。**",
        f"> 重新產生：`{CMD}`（或 `python3 {SCRIPT}`）",
        f"> 產生自 contentVersion **`{ctx['contentVersion']}`**"
        f"（`content/manifest.json`；它是 `content/**` 的純函數，改內容就會變）",
        f"> 資料列：**{rows}**　·　開放名單來源：{wl}",
        "",
        subtitle,
        "",
        "> 本檔的數值是 `content/` 的**原始值**，未套用 `combat-env` 全域倍率"
        "（`content/config/combat-env.json`）。遊戲內顯示的一律是乘算後的最終值，"
        "所以畫面上的冷卻／傷害／生命與這裡不會相同 —— 那是預期行為，不是資料錯誤。",
    ]
    for n in extra_notes:
        L.append(">")
        L.append(f"> {n}")
    L.append("")
    L.append("---")
    L.append("")
    return L


# ---------------------------------------------------------------------------
# roster.md
# ---------------------------------------------------------------------------

def open_flag_cells(ctx, flag):
    """開放旗標那一格 —— `placeholder` 模式**整欄不印**（⛔ 不印一排 `—` 假裝全部未開放）。"""
    return ["✅" if flag else "—"] if ctx["curation_flags"] else []


def open_flag_head(ctx, label="開放"):
    return [label] if ctx["curation_flags"] else []


def table_head(cols):
    return ["| " + " | ".join(cols) + " |", "|" + "---|" * len(cols)]


def gen_roster(ctx):
    champs = ctx["champions"]
    open_ids = ctx["open_champions"]

    def row(c):
        title, full = split_champion_name(c.get("name", ""))
        abils = c.get("abilities") or {}
        ids = []
        if c.get("passiveAbility"):
            ids.append(f"`{c['passiveAbility']}`")
        for slot in ("Q", "W", "E", "R"):
            a = abils.get(slot)
            if isinstance(a, dict) and a.get("id"):
                ids.append(f"`{a['id']}`")
        if c.get("exAbility"):
            ids.append(f"`{c['exAbility']}`")
        desc = one_line(c.get("description"), 46) or "—"
        cells = [
            f"`{c['id']}`",
            cell(full),
            cell(title),
            cell(c.get("role")),
            "近戰" if c.get("attackType") == "melee" else "遠程",
            *open_flag_cells(ctx, c["id"] in open_ids),
            cell(desc),
            " ".join(ids) if ids else "—",
        ]
        return "| " + " | ".join(cells) + " |"

    open_rows = [c for c in champs if c["id"] in open_ids]
    closed_rows = [c for c in champs if c["id"] not in open_ids]
    with_passive = [c for c in champs if c.get("passiveAbility")]
    no_passive = [c for c in champs if not c.get("passiveAbility")]

    if ctx["curation_flags"]:
        subtitle = (
            f"`content/champions/*.json` 共 **{len(champs)}** 名英雄，其中 **{len(open_rows)}** 名在"
            "開放名單（OPEN roster）內。開放名單是營運策展狀態，不是程式常數：真相是 "
            "`data/curation/whitelist.json`，由 platform 的 `GET /api/v1/curation/whitelist` 提供，"
            "由 game-server 在建房時執行；本檔印的是它進版控的快照（表頭有 updatedAt）。"
        )
    else:
        subtitle = (
            f"`content/champions/*.json` 共 **{len(champs)}** 名英雄。哪些在開放名單（OPEN roster）"
            "內是營運策展狀態，不是程式常數，**本檔不印它**：真相由 platform 的 "
            "`GET /api/v1/curation/whitelist` 提供，由 game-server 在建房時執行。"
        )

    L = header(
        "英雄名冊 / Champion roster",
        subtitle,
        len(champs),
        ctx,
        extra_notes=[
            "**每名英雄有六個 slot：天生技（PASSIVE）＋ Q／W／E／R／EX。** 天生技是 w3x 的 "
            "`NN-00`，**等級 1 就擁有**，doc 是 `champion.passiveAbility` 指到的 "
            f"`<id>.passive`（`exAbility` 的同款寫法）。{len(with_passive)} 名有天生技；"
            f"{len(no_passive)} 名沒有 `passiveAbility` —— "
            + "、".join(
                f"`{c['id']}`（{NO_PASSIVE_REASON.get(c['id'], '原因未記錄')}）"
                for c in no_passive
            )
            + " —— **那是還原出來的事實，不是待辦**。",
            "`稱號` / `全名` 是從 `name` 欄位拆出來的（慣例 `稱號 - 全名`），"
            "champion doc 上**沒有**獨立的稱號欄位；不符慣例的會顯示 `—`。",
            "`名言` 不在 champion doc 裡 —— 它在 `docs/champions.csv` 與 "
            "`content/assets/audio/voices/quotes/quotes.json`。",
        ],
    )
    head = table_head(["id", "全名", "稱號", "role", "攻擊", *open_flag_head(ctx),
                       "一句話說明", "技能 id（天生 Q W E R EX）"])

    if ctx["curation_flags"]:
        L.append(f"## 1. 開放名單 OPEN roster（{len(open_rows)}）")
        L.append("")
        L += head
        L += [row(c) for c in open_rows]
        L.append("")
        L.append(f"## 2. 未開放 not in the open roster（{len(closed_rows)}）")
        L.append("")
        L.append("文件存在、資料完整，但白名單沒放行，所以選角畫面看不到、bot 也不會抽到。")
        L.append("")
        L += head
        L += [row(c) for c in closed_rows]
        L.append("")
    else:
        L.append(f"## 1. 全部英雄（{len(champs)}）")
        L.append("")
        L.append(f"開放旗標不在本檔（{ctx['whitelist_note']}）。")
        L.append("")
        L += head
        L += [row(c) for c in champs]
        L.append("")
    return "\n".join(L) + "\n", len(champs)


# ---------------------------------------------------------------------------
# abilities.md
# ---------------------------------------------------------------------------

def gen_abilities(ctx):
    abils = ctx["abilities"]
    owner_of = ctx["ability_owner"]
    champ_name = ctx["champion_display"]
    open_abils = ctx["open_abilities"]

    def sort_key(a):
        owner = owner_of.get(a["id"], "")
        return (owner, SLOT_ORDER.get(a.get("slot"), 9), a["id"])

    rows = sorted(abils, key=sort_key)

    def row(a):
        tag = desc_tag(a.get("description"))
        is_passive = bool(a.get("passive")) or tag == "被動"
        slot = a.get("slot") or "?"
        # The 天生 slot says what KIND of innate it is (`innateKind`), which is the
        # thing a reader actually needs: 被動-type auras/procs vs a real D-slot
        # active with a cooldown. Both are the same level-1 slot.
        kind = INNATE_LABEL.get(a.get("innateKind")) if slot == "PASSIVE" else None
        if kind is None:
            kind = "被動" if is_passive else cell(tag or "主動")
        m = HERO_NUMBER_RE.match((a.get("name") or "").strip())
        num = f"{m.group(1)}-{m.group(2)}" if m else "—"
        eff = one_line(a.get("description"), 62) or effect_summary(a) or "—"
        owner = owner_of.get(a["id"])
        cells = [
            f"`{a['id']}`",
            cell(a.get("name")),
            slot,
            kind,
            num,
            (f"`{owner}` {cell(champ_name.get(owner, ''))}" if owner else "**（無主）**"),
            *open_flag_cells(ctx, a["id"] in open_abils),
            cell(eff),
        ]
        return "| " + " | ".join(cells) + " |"

    counts = {}
    for a in abils:
        counts[a.get("slot")] = counts.get(a.get("slot"), 0) + 1
    census = "　·　".join(
        f"{'天生 PASSIVE' if s == 'PASSIVE' else s} {counts.get(s, 0)}" for s in SLOTS
    )
    innate = [a for a in abils if a.get("slot") == "PASSIVE"]
    innate_p = sum(1 for a in innate if a.get("innateKind") == "passive")
    innate_a = sum(1 for a in innate if a.get("innateKind") == "active")

    L = header(
        "技能總表 / Ability reference",
        f"`content/abilities/*.json` 共 **{len(abils)}** 份，每個英雄每個 slot 一份："
        f"{census}。",
        len(abils),
        ctx,
        extra_notes=[
            "**`slot` 有六種：`PASSIVE`（天生技）＋ Q／W／E／R／EX。** 天生技是 w3x 的 "
            f"`NN-00`，**等級 1 就擁有**，doc id 是 `<championId>.passive`，由 champion doc 的 "
            f"`passiveAbility` 指過來；共 **{len(innate)}** 份"
            f"（{innate_p} 份 `innateKind:passive` 純被動、{innate_a} 份 `innateKind:active` "
            "有冷卻的天生主動）。原本的匯入把這個 slot 整個漏掉了，這批是從原始地圖還原回來的。",
            "**不要跟 champion doc 上那個舊的 `passive` 區塊搞混**：那是掛在 QWER 技能上的"
            "被動型效果（`型態` 欄標「被動」的那些），跟天生技 slot 是兩回事。",
            "`編號` 是 w3x 作者的 `NN-0X` 慣例（天生技用 `NN-00`，EX 用三位數 `NN-00X`），"
            "由 `HERO_NUMBER_RE` 解析；非 w3x 原創英雄與少數格式異常的會顯示 `—`。",
            "`型態` 取自描述開頭的 w3x 分類標記（`[主動攻擊]`／`[輔助]`／`[被動]`…），"
            "沒有標記的一律顯示「主動」；天生技那格顯示的是 `innateKind`"
            "（天生·被動／天生·主動），因為那才是讀者要分的東西。",
        ],
    )
    L += table_head(["id", "名稱", "slot", "型態", "編號", "擁有者", *open_flag_head(ctx), "短效果"])
    L += [row(a) for a in rows]
    L.append("")
    return "\n".join(L) + "\n", len(rows)


# ---------------------------------------------------------------------------
# items.md
# ---------------------------------------------------------------------------

def gen_items(ctx):
    items = ctx["items"]
    legendary = ctx["legendary_pool"]
    open_items = ctx["open_items"]
    b = classify_items(ctx)
    by_id = {i["id"]: i for i in items}

    def role_lbl(i):
        return CRAFT_ROLE_LABEL.get(i.get("craftRole"), i.get("craftRole") or "—")

    def price(i):
        cost = i.get("cost")
        return f"{cost}g" if isinstance(cost, (int, float)) and cost > 0 else "—"

    def row(i):
        cells = [
            f"`{i['id']}`",
            cell(i.get("name")),
            role_lbl(i),
            price(i),
            f"T{i.get('tier')}",
            "✅" if i["id"] in legendary else "—",
            *open_flag_cells(ctx, i["id"] in open_items),
            cell(fmt_modifiers(i)),
            cell(fmt_passive(i)),
        ]
        return "| " + " | ".join(cells) + " |"

    head = table_head(["id", "名稱", "craftRole", "價格", "tier", "傳說池", *open_flag_head(ctx),
                       "屬性 modifiers", "被動 passive"])

    shop = b["shop_final"]
    inert = b["inert_final"]
    services = b["services"]
    legend = b["legendary"]
    quest = b["quest"]
    component = b["component"]
    token = b["token"]
    other = b["other"]

    L = header(
        "道具總表 / Item reference",
        # The buyable shop is now the SEMANTIC `craftRole === "final"` set (task
        # #70), not a price heuristic. Every doc lands in exactly one bucket, so
        # this breakdown always sums to len(items).
        f"`content/items/*.json` 共 **{len(items)}** 份，依 `content/items/<id>.json` 的"
        f" **`craftRole`** 標記分類（來源：source-map triggers，見 "
        f"`tools/w3x-import/extract_item_roles.py`）。實際能在商店買到的只有 "
        f"**{len(shop)}** 件最終合成武器（`craftRole:final` 且有效果）＋ **{len(services)}** 項服務；"
        f"三選一 draft 抽 **{len(quest)}** 件任務道具，傳說寶玉抽 **{len(legend)}** 件傳說。"
        f"其餘（{len(component)} 組件、{len(token)} 代幣、{len(other)} 無角色、{len(inert)} 無 payload 的 final）"
        "是配方半成品或 w3x 殘件，不會單獨出現在任何商店或抽卡。",
        len(items),
        ctx,
        extra_notes=[
            n
            for n in [legacy_items_note(ctx, "../../")]
            if n
        ]
        + [
            "**上架規則（task #70）**：`shopCatalogue` / `buyItem` 只讓 "
            "`craftRole === \"final\"` **且** 真有效果的武器上架"
            "（`packages/shared/src/sim/economy/shop.ts:110`、"
            "`apps/client/src/ui/panels/champSelectFilter.ts:150`）。"
            "元件、製作書、任務、代幣一律拒賣，即使有價格、有效果、被白名單放行也一樣。",
            f"**{len(inert)} 件 `final` 沒有 payload**（雷神之鎚／黑色魔書…）：item@1 目前只能存 "
            "`modifiers` / `passive`，它們的主動效果 schema 還裝不下（卡在 #56），所以留在 "
            "`final` 分類但不上架，避免變成花 1200g 的空按鈕。",
            f"**帶著 `quest` 舊標記的有 {len(quest)} 件**"
            "（owner 2026-08-18：這個標籤在競技場新玩法**完全不考慮**，它們現在照樣住在三階寶具池裡）。"
            "只有兩種商店價格：簡易 **300g**、強力 **1200g**"
            "（`packages/shared/src/sim/economy/itemTiers.ts:43-46`）。",
            "`tier` 欄是 doc 上的 1..5 分級，那是 w3x 匯入的遺留欄位，**與 craftRole 無關**。",
            "`暴擊率` / `暴擊傷害` / `吸血` 的 `flat` 值是**小數比例**，不是百分點："
            "`暴擊率 +0.17` 就是 17%。標了 `%` 的欄位才是 `pctAdd`。",
            "背包 6 格、賣出退 40%（`packages/shared/src/sim/economy/shop.ts:11,18`）。",
        ],
    )

    def section(n, title, blurb, rows):
        L.append(f"## {n}. {title}（{len(rows)}）")
        L.append("")
        if blurb:
            L.append(blurb)
            L.append("")
        L.extend(head)
        L.extend(row(i) for i in rows)
        L.append("")

    section("1", "商店貨架 shop shelf — final 且有效果",
            "真正能用金幣買的最終合成武器：`craftRole:final` 且有 `modifiers`／`passive`。"
            "白名單啟用時可能再縮小，但永遠不會放進非 final 的東西。", shop)
    section("2", "商店服務 services",
            "真的是 `item@1` 文件，但 `buyItem` 在進背包路徑前就以 id 攔截它們：不佔格、可重複買"
            "（傳說寶玉 2400g／能力屬性強化 375g）。", services)
    section("3", "舊標記 quest（⚠️ 已不是一個取得面）",
            f"這 {len(quest)} 件帶著 w3x 匯入留下的 `craftRole:\"quest\"` 標記。"
            "owner 2026-08-18：「他有個舊標籤叫做任務道具，但在競技場新玩法**則完全不考慮這個標籤**」"
            "—— 它們的取得路徑跟其他寶具一樣，就是三階寶具池。", quest)
    section("4", "寶具池 weapon pools（三階）",
            "三張表等權重抽取（`" + "` · `".join(WEAPON_POOL_TABLES) + "`）。買不到，"
            "只能從寶具三選一或 2400g 傳說寶玉取得。⭐ 一件寶具**只屬於一個池**。", legend)
    section("5", "final 但無 payload（暫不上架）",
            "分類是最終合成，但沒有 `modifiers`／`passive`，主動效果 schema 還裝不下（#56），"
            "所以商店拒賣。", inert)
    section("6", "組件 component", "配方半成品：只在合成路徑上，不單獨上架。", component)
    section("7", "代幣 token", "任務／成就代幣，不是可裝備的道具。", token)
    section("8", "其餘 none", "沒有 craftRole 角色的殘件，留著做 w3x 對照與未來策展。", other)

    missing = sorted(i for i in legendary if i not in by_id)
    if missing:
        L.append("> ⚠️ 傳說池引用了不存在的道具 id：" + ", ".join(f"`{m}`" for m in missing))
        L.append("")

    return "\n".join(L) + "\n", len(items)


# ---------------------------------------------------------------------------

def _curation_lists(doc):
    """三張名單，各自排序去重 —— 集合的**唯一**正規形（快照與比對都用它）。"""
    return {k: sorted(set(doc.get(k) or [])) for k in CURATION_LISTS}


def _curation_digest(lists):
    import hashlib
    raw = json.dumps(lists, sort_keys=True, ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:12]


def load_curation(refresh_snapshot=False):
    """開放名單 → {mode, flags, note, stale, open_champions, open_items, open_abilities}。

    · `placeholder`：不讀任何東西，三張名單皆空，`flags=False`（旗標整欄不印）。
    · `snapshot`：讀進版控的快照。白名單**在**的時候逐項比對；不同 ⇒
        寫模式（refresh_snapshot=True）**重刷快照**，`--check` 則回報 stale。
      ⭐ 白名單**不在**（CI／全新 clone）⇒ 照樣從快照產出**同一份位元組**。
    """
    if CURATION_MODE not in CURATION_MODES:
        sys.exit(f"GGD_REFERENCE_CURATION={CURATION_MODE!r} 不認得 —— 只收 "
                 + " | ".join(CURATION_MODES))
    if CURATION_MODE == "placeholder":
        return {
            "mode": "placeholder", "flags": False, "stale": [],
            "note": "本檔**不含**開放名單（`GGD_REFERENCE_CURATION=placeholder`）—— 它是平台的"
                    f"執行期狀態，即時名單請查 `{CURATION_ENDPOINT}`",
            **{f"open_{k}": set() for k in CURATION_LISTS},
        }

    snap = load_json(CURATION_SNAPSHOT)
    wl = load_json(WHITELIST)
    stale = []
    if wl is not None:
        lists = _curation_lists(wl)
        fresh = {
            "schema": CURATION_SNAPSHOT_SCHEMA,
            "note": "⛔ 不要手改。`pnpm docs:readme` 從 data/curation/whitelist.json（git-ignored 的"
                    "營運狀態）刷新的快照；README 與 docs/reference/*.md 的開放旗標**只**讀它，"
                    "所以同一個 commit 在任何機器上產出同一份位元組（GH#995）。"
                    "白名單變了而快照沒刷 ⇒ `docs:readme:check` 紅。",
            "source": "data/curation/whitelist.json",
            "updatedAt": wl.get("updatedAt") or "?",
            "digest": _curation_digest(lists),
            **lists,
        }
        if (snap is None or _curation_lists(snap) != lists
                or snap.get("updatedAt") != fresh["updatedAt"]):
            if refresh_snapshot:
                with open(CURATION_SNAPSHOT, "w", encoding="utf-8") as f:
                    json.dump(fresh, f, ensure_ascii=False, indent=2)
                    f.write("\n")
            else:
                stale.append(f"{CURATION_SNAPSHOT_REL}(白名單 updatedAt "
                             f"{fresh['updatedAt']} ≠ 快照 "
                             f"{(snap or {}).get('updatedAt', '缺席')})")
            # `--check` 也拿 fresh 去算繪：它只是要回報 stale，⛔ 不是 die。
            snap = fresh
    if snap is None:
        sys.exit(f"{CURATION_SNAPSHOT_REL} 不存在，而這台機器也沒有 {WHITELIST} ——\n"
                 "   開放名單產不出來。到有白名單的機器跑 `pnpm docs:readme`（它會寫快照並 commit），\n"
                 "   或 GGD_REFERENCE_CURATION=placeholder 產一份不含開放名單的文件。")
    lists = _curation_lists(snap)
    note = (f"快照 `{CURATION_SNAPSHOT_REL}`（whitelist updatedAt `{snap.get('updatedAt', '?')}`；"
            f"英雄 {len(lists['champions'])} · 道具 {len(lists['items'])} · 技能 {len(lists['abilities'])}）"
            f"；即時名單 `{CURATION_ENDPOINT}`")
    return {
        "mode": "snapshot", "flags": True, "note": note, "stale": stale,
        **{f"open_{k}": set(v) for k, v in lists.items()},
    }


def build_context(refresh_snapshot=False):
    """Load content/ + the curation snapshot into the one dict every emitter reads.

    Split out of main() so a sibling generator can reuse it — tools/reference/
    gen_readme_lists.py embeds the same three lists into README.md. One loader,
    one set of conventions, no second source of truth.

    `refresh_snapshot=True` is the WRITE path (refreshes the curation snapshot from
    the local whitelist when present); `--check` callers leave it False."""
    manifest = load_json(os.path.join(CONTENT, "manifest.json"))
    if not manifest:
        sys.exit(f"missing {os.path.join(CONTENT, 'manifest.json')} — run `pnpm content:build` first")

    champions = load_collection("champions")
    abilities = load_collection("abilities")
    # ⭐ 說明推導（票號待開） —— 技能說明在 JSON 裡是**帶佔位符的原文**（`{{cd}}秒冷卻`），
    #    算繪器是 TypeScript。這一支是 Python，所以它讀**算繪好的產物**，
    #    ⛔ 不是自己再寫一份算繪 —— 第二份算繪就是下一次「文件說 A、場上跑 B」。
    #    產物由 `pnpm spec:build` 寫出，`pnpm spec:check` 逐位元組守著它。
    rendered = (load_json(ABILITY_PROSE, {}) or {}).get("rendered") or {}
    for _a in abilities:
        if _a.get("id") in rendered:
            _a["description"] = rendered[_a["id"]]
    for _c in champions:
        for _slot, _emb in (_c.get("abilities") or {}).items():
            if isinstance(_emb, dict) and _emb.get("id") in rendered:
                _emb["description"] = rendered[_emb["id"]]
    items = load_collection("items")
    retired_items = load_legacy_items()

    legendary_pool = set()
    for _t in WEAPON_POOL_TABLES:
        _doc = load_json(os.path.join(CONTENT, "loot-tables", f"{_t}.json"), {})
        legendary_pool |= {e["itemId"] for e in (_doc.get("entries") or []) if e.get("itemId")}

    # 舊的 `quest-rewards` 表不存在了；`quest` 現在只是道具文件上的一個標記。
    quest_pool = []

    # ⭐ GH#995 —— 開放名單只從進版控的快照來（或 placeholder 模式：完全不含）。
    #    ⛔ ctx 裡刻意**沒有**「這台機器有沒有白名單」這種欄位：任何吃環境的欄位
    #    都會讓 `--check` 的逐位元組比對在兩台機器上得到兩個答案。
    cur = load_curation(refresh_snapshot)

    # ability -> owning champion, resolved through the champion docs (authoritative),
    # not by string-splitting the id.
    ability_owner = {}
    champion_display = {}
    for c in champions:
        _title, full = split_champion_name(c.get("name", ""))
        champion_display[c["id"]] = full
        for slot in ("Q", "W", "E", "R"):
            a = (c.get("abilities") or {}).get(slot)
            if isinstance(a, dict) and a.get("id"):
                ability_owner[a["id"]] = c["id"]
        # `exAbility` and `passiveAbility` are both REFS to standalone docs (the
        # passive is deliberately never embedded in `abilities`). Absence of
        # `passiveAbility` is a recovered fact — the hero has no NN-00 — not a TODO.
        for ref_field in ("exAbility", "passiveAbility"):
            if c.get(ref_field):
                ability_owner[c[ref_field]] = c["id"]

    ctx = {
        "contentVersion": manifest.get("contentVersion", "?"),
        "whitelist_note": cur["note"],
        "curation_mode": cur["mode"],
        "curation_flags": cur["flags"],      # 印不印「開放」那一欄
        "curation_stale": cur["stale"],      # `--check` 用：快照 ≠ 這台機器的白名單
        "champions": sorted(champions, key=lambda c: c["id"]),
        "abilities": abilities,
        "ability_by_id": {a["id"]: a for a in abilities},
        "items": sorted(items, key=lambda i: i["id"]),
        "retired_items": sorted(retired_items, key=lambda i: i["id"]),
        "legendary_pool": legendary_pool,
        "quest_pool": quest_pool,
        "open_champions": cur["open_champions"],
        "open_items": cur["open_items"],
        "open_abilities": cur["open_abilities"],
        "ability_owner": ability_owner,
        "champion_display": champion_display,
    }
    return ctx


def main():
    os.makedirs(OUTDIR, exist_ok=True)
    ctx = build_context(refresh_snapshot=True)
    abilities = ctx["abilities"]

    results = []
    for fname, fn in (
        ("roster.md", gen_roster),
        ("abilities.md", gen_abilities),
        ("items.md", gen_items),
    ):
        text, rows = fn(ctx)
        path = os.path.join(OUTDIR, fname)
        with open(path, "w", encoding="utf-8") as f:
            f.write(text)
        results.append((os.path.relpath(path, REPO), rows))

    print(f"contentVersion {ctx['contentVersion']}")
    for path, rows in results:
        print(f"wrote {path} — {rows} rows")
    ability_owner = ctx["ability_owner"]
    orphans = [a["id"] for a in abilities if a["id"] not in ability_owner]
    if orphans:
        print(f"note: {len(orphans)} ability doc(s) not referenced by any champion: "
              + ", ".join(orphans[:5]) + ("…" if len(orphans) > 5 else ""))


if __name__ == "__main__":
    main()
