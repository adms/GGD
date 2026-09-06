#!/usr/bin/env python3
"""gen_readme_lists.py — write the OPEN roster / ability / item lists INTO README.md.

WHY THIS EXISTS. The owner wants to SEE the open (whitelisted) champions, their
skills, and the shop shelf on the GitHub repo page WITHOUT CLICKING anything.
Hand-written they would be wrong within a week (see docs/champions.csv — nothing
generates it, nothing checks it, and it has been drifting from content/ ever
since). So the lists live in the README but NOTHING HUMAN WRITES THEM: this
script owns three marker-delimited regions and rewrites only the text between
them.

    <!-- BEGIN GENERATED:roster -->    …    <!-- END GENERATED:roster -->
    <!-- BEGIN GENERATED:abilities --> …    <!-- END GENERATED:abilities -->
    <!-- BEGIN GENERATED:items -->     …    <!-- END GENERATED:items -->

WHAT CHANGED (2026-07, three real causes the owner reported):
  1. The three blocks used to be wrapped in <details>, which GitHub renders
     COLLAPSED — so the repo page showed three triangles and he concluded the
     lists were missing. The OPEN lists are now rendered EXPANDED, no <details>.
  2. The README was 224 KB because it inlined all 113 champions / 554 abilities /
     214 items. The EXHAUSTIVE full sets now live in docs/reference/*.md; the
     README keeps only the OPEN roster + kits + the shop shelf + the draft/orb
     pools, and links to the full docs. This script writes BOTH targets in one
     run (see main()).
  3. The item lists are classified by the semantic `craftRole` marker (task #70),
     not the old price heuristic: the shop shelf is the 28 effectful `final`
     weapons + 2 services; the 3-choose-1 draft is the 13 `quest` items.
  4. The roster's skill column showed raw content ids (godie-e001.q). It now
     shows each ability's NAME + a one-line effect gist per slot — the readable
     overview the owner asked for. The full untruncated text stays in
     docs/reference/abilities.md and the #codex page.
  5. A champion is SIX slots, not five: the 天生技 (w3x `NN-00`, owned from level
     1) is a real slot and it leads the kit. The importer had dropped it; the
     archaeology pass recovered 108 of the 111 that have one. Every kit list here
     now starts with 天生 and the census counts PASSIVE.

WHAT IT READS: nothing but content/ and the VERSIONED curation snapshot
(`docs/reference/_curation-snapshot.json`) — the loader is `build_context()` in
gen_reference.py, shared with the docs/reference/*.md generator so the two can
never disagree. ⭐ GH#995: the git-ignored `data/curation/whitelist.json` is no
longer an input of the rendered text — it only refreshes the snapshot (write
mode) or flags it stale (`--check`), so the same commit renders the same bytes
on every machine and `--check` is a real gate in CI. `GGD_REFERENCE_CURATION=
placeholder` renders the lists WITHOUT any open flags (see gen_reference.py).

Run it with `pnpm docs:readme` from the repo root, or directly:
  python3 tools/reference/gen_readme_lists.py

Flags:
  --check   exit 1 if the README OR the docs/reference/*.md are stale; writes nothing.

Stdlib only, deterministic, idempotent: two runs produce byte-identical output.
There is no timestamp — the contentVersion is the freshness stamp.
"""

import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import gen_reference as G  # noqa: E402  — sibling module, same directory
import gen_grail as GR  # noqa: E402  — 聖杯願望 + 機制詞彙，同一次 run

REPO = G.REPO
README = os.path.join(REPO, "README.md")

CMD = "pnpm docs:readme"
SCRIPT = "tools/reference/gen_readme_lists.py"

# Truncation limits, in CHARACTERS. A markdown cell / kit line that runs to 300
# characters destroys readability, and readability is the entire point of the
# open lists. Almost every value is CJK (double-width), so keep these low. The
# full untruncated text is in docs/reference/*.md and http://localhost:39527/#codex.
LIMIT_CHAMPION_DESC = 40
LIMIT_KIT_GIST = 34          # per-slot effect gist in the roster kit
LIMIT_ITEM_STATS = 52
LIMIT_ITEM_PASSIVE = 28

# Where the full (all-113 / all-554 / all-214) sets live, linked from each block.
DOC_ROSTER = "docs/reference/roster.md"
DOC_ABILITIES = "docs/reference/abilities.md"
DOC_ITEMS = "docs/reference/items.md"
DOC_GRAIL = "docs/reference/grail-wishes.md"
DOC_MECHANICS = "docs/reference/mechanics.md"

# 級距那一節借用的兩份**產生的**文件（⛔ 都不是這支寫的，只是連過去 / 讀數字）。
DOC_TIERS = "docs/editor-contract/ggd-skill-tiers.md"   # `pnpm tiers:build`
DOC_ANCHORS = "docs/平衡錨點量測.md"                      # `pnpm anchors:build`

BLOCKS = ("roster", "abilities", "items", "grail", "mechanics", "arenas",
          "combat-env", "stat-bands", "tiers")


# ---------------------------------------------------------------------------
# marker splicing
# ---------------------------------------------------------------------------

def markers(name):
    return (f"<!-- BEGIN GENERATED:{name} -->", f"<!-- END GENERATED:{name} -->")


def splice(text, name, body):
    """Replace the text between the marker pair with `body`.

    Returns (new_text, "replaced" | "appended"). Missing markers are appended at
    the end of the file — that is how the first run bootstraps. A BEGIN without
    its END (or the pair in the wrong order) is a hand-edit accident, not
    something to guess at, so it aborts."""
    begin, end = markers(name)
    n_begin, n_end = text.count(begin), text.count(end)
    if n_begin > 1 or n_end > 1:
        sys.exit(f"README.md has {n_begin} BEGIN / {n_end} END markers for '{name}' — expected at most 1 of each")
    if n_begin != n_end:
        sys.exit(f"README.md has an unmatched marker for '{name}' (BEGIN={n_begin}, END={n_end}) — fix it by hand")

    block = f"{begin}\n{body.rstrip()}\n{end}"
    if n_begin == 0:
        sep = "" if text.endswith("\n\n") else ("\n" if text.endswith("\n") else "\n\n")
        return text + sep + block + "\n", "appended"

    i = text.index(begin)
    j = text.index(end, i)
    if j < i:
        sys.exit(f"README.md has END before BEGIN for '{name}' — fix it by hand")
    return text[:i] + block + text[j + len(end):], "replaced"


# ---------------------------------------------------------------------------
# shared chrome
# ---------------------------------------------------------------------------

def note(lines):
    # ">" alone, never "> " — a trailing space on a blank quote line is invisible
    # churn that makes the next diff noisy for no reason.
    return [("> " + l if l else ">") for l in lines] + [""]


def provenance(ctx, extra=None):
    """The small italic provenance line every block ends with."""
    tail = f"*由 `{CMD}` 從 contentVersion `{ctx['contentVersion']}` 產生。"
    if extra:
        tail += f" {extra}"
    return [tail + " 這三段標記之間的任何字都會在下次重新產生時被覆蓋。*"]


def empty_open_warning(kind):
    """The curation snapshot lists nobody of this kind. Say so loudly — an empty
    open list rendered as if it were content is exactly the failure that made the
    owner think the README was broken."""
    return note([
        f"⚠️ **開放{kind}名單目前是空的。** `{G.CURATION_SNAPSHOT_REL}` 沒有列出任何"
        f"{kind}。恢復方式：在 `/admin/` → 內容白名單 → ⭐ 啟用示範組合 → 儲存，然後在那台"
        "機器跑 `pnpm docs:readme`（它會從白名單重刷快照）。**這不是清單壞掉，是白名單是空的。**",
    ])


# ---------------------------------------------------------------------------
# roster — OPEN champions, readable kit (name + one-line effect per slot)
# ---------------------------------------------------------------------------

def kit_slots(c, ctx):
    """Yield (label, ability_doc) for all SIX slots, in slot order, skipping
    empties: 天生 (the `passiveAbility` ref — level 1, leads the kit), Q/W/E/R
    (embedded in the champion doc) and EX (a ref). Both refs resolve through
    ctx['ability_by_id']; the passive is never embedded, deliberately."""
    passive = c.get("passiveAbility")
    if passive:
        a = ctx["ability_by_id"].get(passive)
        if a:
            yield "天生", a
    abils = c.get("abilities") or {}
    for slot in ("Q", "W", "E", "R"):
        a = abils.get(slot)
        if isinstance(a, dict) and a.get("id"):
            yield slot, a
    ex = c.get("exAbility")
    if ex:
        a = ctx["ability_by_id"].get(ex)
        if a:
            yield "EX", a


def kit_bullets(c, ctx):
    """One '- **SLOT** 名稱：一行效果' bullet per ability, SIX per champion
    (天生 first, then Q/W/E/R/EX). The NAME is the human-readable id (e.g.
    '22-01 鬼隱之擊'); the gist strips the [標籤]/冷卻 boilerplate and truncates.
    This is cause #4: readable, not raw ids.

    Rendered as a nested bullet list under each champion — it reads cleanly on
    GitHub and, unlike a wide table cell holding five name+effect entries, never
    blows the table width."""
    out = []
    for slot, a in kit_slots(c, ctx):
        if slot == "天生":
            # 被動 aura/proc vs a real cooldown'd innate active is the one thing a
            # reader needs disambiguated on this slot — `innateKind` says which.
            slot = G.INNATE_LABEL.get(a.get("innateKind"), slot)
        name = G.cell(a.get("name") or a.get("id"))
        gist = G.one_line(a.get("description"), LIMIT_KIT_GIST) or G.effect_summary(a) or "—"
        out.append(f"- **{slot}** {name}：{G.cell(gist)}")
    if not out:
        out.append("- *（此英雄的技能文件缺漏）*")
    return out


def gen_roster(ctx):
    champs = ctx["champions"]
    open_ids = ctx["open_champions"]
    # ⭐ GH#995 —— `placeholder` 模式沒有開放名單可印 ⇒ 印**全部**英雄（⛔ 不是印一張空表，
    #   也⛔ 不是拿全量名單假裝成開放名單：標題與來源句都改）。
    flags = ctx["curation_flags"]
    open_rows = [c for c in champs if c["id"] in open_ids] if flags else list(champs)
    closed_n = len(champs) - len(open_rows)
    open_no_passive = [c for c in open_rows if not c.get("passiveAbility")]

    if flags:
        title = f"#### 開放名單 OPEN roster（{len(open_rows)} 名）— 角色 + 六個技能 slot"
        lead = (
            "選角畫面看得到、bot 也會抽到的就是這些。這是**營運策展狀態**，不是程式常數："
            f"真相在 `data/curation/whitelist.json`，由 platform 的 `GET /api/v1/curation/whitelist` "
            f"提供、game-server 在建房時執行。來源：{ctx['whitelist_note']}"
        )
    else:
        title = f"#### 英雄名冊 roster（全 {len(champs)} 名）— 角色 + 六個技能 slot"
        lead = (
            "哪些英雄開放（選角畫面看得到、bot 會抽到）是**營運策展狀態**，不是程式常數，"
            f"這一段**不印它**：{ctx['whitelist_note']}"
        )
    L = [title, ""]
    L += note([
        lead,
        "",
        "每名英雄一格：**`id` 全名**（稱號 · 職業 · 攻擊）— 一句話說明，底下**六條**是"
        "**天生技（等級 1 就有）＋ Q/W/E/R/EX** 的**技能名稱＋一行效果**。"
        "天生技那條會標 `天生·被動`（光環／機率觸發／回復類）或 `天生·主動`（有冷卻、"
        "原本掛在 D 鍵的）。"
        f"效果截斷到 {LIMIT_KIT_GIST} 字、說明截斷到 "
        f"{LIMIT_CHAMPION_DESC} 字，結尾的 `…` 是產生器加的。完整逐字內容在 "
        f"[`{DOC_ABILITIES}`](./{DOC_ABILITIES}) 或 <http://localhost:39527/#codex>。",
    ])
    if open_no_passive:
        who = "、".join(
            f"**{G.cell(G.split_champion_name(c.get('name', ''))[1])}**（`{c['id']}`）"
            for c in open_no_passive
        )
        all_no_passive = sum(1 for c in champs if not c.get("passiveAbility"))
        L += note([
            f"ℹ️ 其中 {who}只有五條 —— 沒有 `NN-00` 天生技，"
            "**這是還原出來的事實，不是漏掉**"
            f"（全 {len(champs)} 名裡共 {all_no_passive} 名，逐一原因見 "
            f"[`{DOC_ROSTER}`](./{DOC_ROSTER})）。",
        ])

    if not open_rows:
        L += empty_open_warning("英雄")
    for c in open_rows:
        title, full = G.split_champion_name(c.get("name", ""))
        atk = "近戰" if c.get("attackType") == "melee" else "遠程"
        meta = " · ".join(x for x in (G.cell(title) if title else None,
                                      G.cell(c.get("role")), atk) if x and x != "—")
        desc = G.one_line(c.get("description"), LIMIT_CHAMPION_DESC)
        head = f"**`{c['id']}` {G.cell(full)}**（{meta}）"
        if desc:
            head += f" — {G.cell(desc)}"
        L.append(head)
        L.append("")
        L += kit_bullets(c, ctx)
        L.append("")

    if flags:
        L.append(
            f"> 📖 **完整 {len(champs)} 名英雄**（含 {closed_n} 名未開放）與逐欄資料（開放旗標、"
            f"技能 id、攻擊類型…）在 [`{DOC_ROSTER}`](./{DOC_ROSTER})。"
        )
    else:
        L.append(
            f"> 📖 **完整 {len(champs)} 名英雄**的逐欄資料（技能 id、攻擊類型…）在 "
            f"[`{DOC_ROSTER}`](./{DOC_ROSTER})。"
        )
    L.append("")
    L += provenance(ctx, f"開放 {len(open_rows)} / 全 {len(champs)} 名。" if flags
                    else f"全 {len(champs)} 名。")
    return "\n".join(L), len(open_rows)


# ---------------------------------------------------------------------------
# abilities — the open kits are shown IN THE ROSTER above; this block is the
# census + how-to-read + a link to the full 554-row detail table in docs. It is
# deliberately compact so the README stays small; it is EXPANDED (no <details>).
# ---------------------------------------------------------------------------

def gen_abilities(ctx):
    abils = ctx["abilities"]
    open_champ = ctx["open_champions"]
    owner_of = ctx["ability_owner"]

    counts = {}
    for a in abils:
        counts[a.get("slot")] = counts.get(a.get("slot"), 0) + 1
    census = " · ".join(
        f"{'天生 ' if s == 'PASSIVE' else ''}{s} {counts.get(s, 0)}" for s in G.SLOTS
    )
    innate = [a for a in abils if a.get("slot") == "PASSIVE"]
    innate_p = sum(1 for a in innate if a.get("innateKind") == "passive")
    innate_a = sum(1 for a in innate if a.get("innateKind") == "active")

    flags = ctx["curation_flags"]
    open_abil_n = sum(1 for a in abils if owner_of.get(a["id"]) in open_champ) if flags else len(abils)

    L = [
        (f"#### 技能 abilities（全 {len(abils)} 個；開放英雄的 {open_abil_n} 個）" if flags
         else f"#### 技能 abilities（全 {len(abils)} 個）"),
        "",
    ]
    L += note([
        ("**開放英雄的每一個技能，都已經印在上面的開放名冊裡**" if flags
         else "**每一個技能都已經印在上面的名冊裡**")
        + "（每名英雄六條：天生 ＋ "
        "Q/W/E/R/EX，含名稱與一行效果）。這裡不再重印一次，只放全表的統計與連結，"
        "讓 README 保持精簡。",
        "",
        f"每個英雄每個 slot 一份：{census}。**`slot` 有六種**，`PASSIVE`（天生技，w3x 的 "
        f"`NN-00`）跟 Q/W/E/R/EX 一樣是一個 slot，而且**等級 1 就擁有**；共 {len(innate)} 份"
        f"（{innate_p} 純被動 ＋ {innate_a} 有冷卻的天生主動），由 champion doc 的 "
        "`passiveAbility` 指到 `<championId>.passive`。",
        "",
        "⚠️ 別跟舊的 `champion.passive` 區塊混為一談：那是掛在某個 QWER 技能上的被動型效果"
        "（`型態` 欄標「被動」的那些），跟天生技 slot 是兩回事。",
        "",
        "數值是 `content/` 的**原始值**，未套用 `combat-env` 全域倍率 —— 遊戲內顯示的一律是乘算後的"
        "最終值，所以畫面上的冷卻／傷害跟表格不會相同。那是預期行為。",
    ])
    L.append(
        f"> 📖 **全 {len(abils)} 個技能的逐欄表**（id、名稱、slot、型態、編號、擁有英雄、開放旗標、"
        f"完整短效果）在 [`{DOC_ABILITIES}`](./{DOC_ABILITIES})；互動版在 "
        "<http://localhost:39527/#codex>。"
    )
    L.append("")
    L += provenance(ctx, f"開放英雄技能 {open_abil_n} / 全 {len(abils)} 個。")
    return "\n".join(L), open_abil_n


# ---------------------------------------------------------------------------
# items — the shop shelf + services + draft/orb pools, by craftRole, EXPANDED
# ---------------------------------------------------------------------------

ITEM_HEAD = [
    "| id | 名稱 | 價格 | 開放 | 屬性 modifiers | 被動 |",
    "|---|---|---|---|---|---|",
]


def item_row(i, ctx, price_override=None):
    cost = i.get("cost")
    if price_override is not None:
        price = price_override
    elif isinstance(cost, (int, float)) and cost > 0:
        price = f"{cost}g"
    else:
        price = "—"
    return "| {id} | {name} | {price} | {open_} | {stats} | {passive} |".format(
        id=f"`{i['id']}`",
        name=G.cell(i.get("name")),
        price=price,
        open_="✅" if i["id"] in ctx["open_items"] else "—",
        stats=G.cell(G.truncate(G.fmt_modifiers(i), LIMIT_ITEM_STATS)),
        passive=G.cell(G.truncate(G.fmt_passive(i), LIMIT_ITEM_PASSIVE)),
    )


def gen_items(ctx):
    items = ctx["items"]
    b = G.classify_items(ctx)
    shop, inert, services = b["shop_final"], b["inert_final"], b["services"]
    legend, quest = b["legendary"], b["quest"]
    rest_n = len(b["component"]) + len(b["token"]) + len(b["other"]) + len(inert)

    L = [
        f"#### 商店貨架 + 抽卡池（能實際取得的道具）",
        "",
    ]
    legacy_line = G.legacy_items_note(ctx, "")
    L += note(([legacy_line, ""] if legacy_line else []) + [
        f"全部 {len(items)} 件道具依 `craftRole` 標記分類（task #70）。**真正能買的只有 "
        f"{len(shop)} 件最終合成武器＋{len(services)} 項服務**；三選一 draft 抽 {len(quest)} 件任務道具、"
        f"傳說寶玉抽 {len(legend)} 件傳說。其餘 {rest_n} 件是配方組件、代幣、殘件或還沒 payload 的 "
        "final，不會單獨出現在商店或抽卡。",
        "",
        "只有兩種商店價格：簡易 **300g**、強力 **1200g**"
        "（`packages/shared/src/sim/economy/itemTiers.ts:43-46`）。**傳說沒有價格**，"
        "只能抽。背包 6 格、賣出退 40%。",
        "",
        f"⚠️ `屬性 modifiers` 截斷到 {LIMIT_ITEM_STATS} 字、`被動` 截斷到 {LIMIT_ITEM_PASSIVE} 字。"
        f"`暴擊率`/`吸血` 的 flat 值是小數比例（`+0.17` = 17%）。完整內容在 "
        f"[`{DOC_ITEMS}`](./{DOC_ITEMS}) 或 <http://localhost:39527/#codex>。",
    ])

    def section(title, blurb, rows, price_override=None):
        L.append(f"##### {title}（{len(rows)}）")
        L.append("")
        if blurb:
            L.append(blurb)
            L.append("")
        if not rows:
            L.append("*（無）*")
            L.append("")
            return
        L.extend(ITEM_HEAD)
        L.extend(item_row(i, ctx, price_override) for i in rows)
        L.append("")

    section("🛒 商店貨架 shop shelf — `craftRole:final` 且有效果",
            "真正能用金幣買的最終合成武器。白名單啟用時可能再縮小，但永遠不會放進非 final 的東西"
            "（`shop.ts:110`）。", shop)
    section("🔧 商店服務 services",
            "不佔背包格、可重複買：傳說寶玉（抽傳說）與能力屬性強化（20 疊屬性路線）。",
            services)
    section("🎴 舊標記 `craftRole:quest`（⚠️ 已不是一個取得面）",
            "owner 2026-08-18：「他有個舊標籤叫做任務道具，但在競技場新玩法**則完全不考慮這個標籤**」"
            "—— 這些道具的取得路徑跟其他寶具一樣，就是下面那三階寶具池。", quest, price_override="抽卡")
    section("💎 寶具池 weapon pools（三階）",
            "三張表等權重（`" + "` · `".join(G.WEAPON_POOL_TABLES) + "`）。只能從寶具三選一或 "
            "2400g 傳說寶玉取得。⭐ 一件寶具**只屬於一個池**。", legend, price_override="抽卡")

    if inert:
        L.append(
            f"> ⚠️ 另有 **{len(inert)} 件 `final` 沒有 payload**"
            + "（" + "、".join(G.cell(i.get("name")) for i in inert) + "）"
            "：主動效果 schema 還裝不下（#56），所以商店拒賣。詳見完整表。"
        )
        L.append("")

    L.append(
        f"> 📖 **全 {len(items)} 件道具依 craftRole 的完整分類表**"
        f"（component {len(b['component'])} / token {len(b['token'])} / none {len(b['other'])} …）"
        f"在 [`{DOC_ITEMS}`](./{DOC_ITEMS})。"
    )
    L.append("")
    L += provenance(ctx, f"可取得 {len(shop) + len(services) + len(quest) + len(legend)} / 全 {len(items)} 件。")
    return "\n".join(L), len(shop) + len(services) + len(quest) + len(legend)


# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# grail — 聖杯願望三選一，全部 60 張（owner 2026-08-17：「詳細列表在 readme」）
# ---------------------------------------------------------------------------

def gen_grail(ctx):
    """README 區塊：三個階級各一張表，每一格都是從願望 JSON 讀出來的。"""
    grail, legacy = GR.load_grail(G.CONTENT)
    out = ["## 🏆 聖杯願望三選一（回合獎勵）", ""]
    out += note([
        f"每個回合結束顯現三張願望，選一張**刻入靈基**直到本場結束。共 **{len(grail)} 張**："
        f"C {sum(1 for a in grail if a['tier'] == 'silver')} · "
        f"A {sum(1 for a in grail if a['tier'] == 'gold')} · "
        f"EX {sum(1 for a in grail if a['tier'] == 'prismatic')}。",
        "",
        "⛔ **這一段沒有任何一行是手寫的** —— 觸發事件、效果、適性條件全部從 "
        "`content/augments/grail-*.json` 讀出來，而那 60 份 JSON 由 owner 的 CSV 產生。"
        "願望本身**零程式**：用到的 effect kinds / hook events 全部是引擎已有的機制。",
    ])

    for tier in GR.RANK_ORDER:
        rows = [a for a in grail if a.get("tier") == tier]
        if not rows:
            continue
        out += [
            f"### {GR.RANK_LABEL[tier]}（後台 `{tier}`）—— {GR.RANK_ROLE[tier]}",
            "",
            "| 願望 | 效果 | 觸發 | 效果機制 | 靈基適性條件 | 顯現位置 |",
            "|---|---|---|---|---|---|",
        ]
        for a in rows:
            out.append("| **{name}**<br>`{id}` | {desc} | {trig} | {eff} | {elig} | {slot} |".format(
                name=a.get("name", a["id"]),
                id=a["id"],
                desc=G.cell(a.get("description", "")),
                trig=GR.trigger_cell(a),
                eff=GR.effects_cell(a),
                elig=GR.eligibility_cell(a.get("eligibility")),
                slot=GR.SLOT_LABEL.get(a.get("selectionSlot"), "泛用"),
            ))
        out.append("")

    out += note([
        f"⚠️ 另外還有 **{len(legacy)} 張舊增益卡**留在 `content/augments/`，"
        "但**預設不進卡池**（設計規則 §8「⛔ 禁止純屬性增益」）。"
        "後台「傳說武器三選一」頁的〈舊增益卡〉切成「兩批一起發」就整批回來。",
    ])
    out += [
        f"逐張的完整 JSON（每一格參數、每一個 hook、每一條條件）在 [`{DOC_GRAIL}`]({DOC_GRAIL})。",
        "",
    ]
    out += provenance(ctx)
    return "\n".join(out), len(grail)


# ---------------------------------------------------------------------------
# mechanics — 引擎詞彙：標籤 / 觸發事件 / 條件 / 效果 / 特效
# ---------------------------------------------------------------------------

def gen_mechanics(ctx):
    """README 區塊：引擎**真的有**的詞彙 + 內容用到多少。

    ⭐ 「有哪些」讀 `content/editor-target-profile.json` 的 `runtimeCapabilities`
    —— 那是 `buildCapabilityManifest()` 的輸出，也就是外部編輯器契約讀的同一份。
    ⛔ 不自己掃原始碼：那會是第二個真相來源。
    """
    prof = GR.load_profile(G.CONTENT)
    grail, legacy = GR.load_grail(G.CONTENT)
    abilities = ctx["abilities"]
    everything = list(abilities) + grail + legacy

    kinds_used = GR.usage_census(everything, GR.effect_kinds_of)
    hooks_used = GR.usage_census(everything, GR.hooks_of)
    leaves_used = GR.usage_census(everything, GR.condition_leaves_of)
    status_tags = GR.load_status_tags(G.CONTENT)
    vfx = GR.load_vfx(G.CONTENT)

    kinds = prof.get("effectKinds") or sorted(kinds_used)
    hooks = prof.get("hookEvents") or sorted(hooks_used)
    leaves = prof.get("conditionLeafKinds") or sorted(leaves_used)
    families = prof.get("templateFamilies") or []
    unsupported = prof.get("unsupported") or []
    broken = prof.get("knownBroken") or []

    out = ["## 🧩 技能機制詞彙（效果 / 觸發 / 條件 / 標籤 / 特效）", ""]
    out += note([
        "**一支技能或一張願望能寫什麼，由這五張表決定。**"
        "「有哪些」從 `content/editor-target-profile.json` 的 `runtimeCapabilities` 讀 ——"
        "那是出貨註冊表推導出來的同一份（外部編輯器契約讀的也是它），"
        "⛔ 不是手抄的清單。「用了幾份」是從 `content/` 逐檔數的。",
        "",
        "⚠️ 一個 token 出現在這裡＝**引擎認得它**；「內容」欄是 0 ＝ 機制在但還沒有人用，"
        "⛔ 不是壞掉。",
    ])

    out += [
        f"### 效果（effect kind）—— {len(kinds)} 種",
        "",
        "| 效果 | 用它的內容 | 效果 | 用它的內容 | 效果 | 用它的內容 |",
        "|---|--:|---|--:|---|--:|",
    ]
    cells = [f"`{k}` | {len(kinds_used.get(k, []))}" for k in kinds]
    for i in range(0, len(cells), 3):
        row = cells[i:i + 3]
        while len(row) < 3:
            row.append(" | ")
        out.append("| " + " | ".join(row) + " |")
    out.append("")

    out += [
        f"### 觸發事件（hook event）—— {len(hooks)} 種",
        "",
        "| 事件 | 中文 | 用它的內容 |",
        "|---|---|--:|",
    ]
    # ⛔ 缺中文名 = 非零離開。以前這裡是 `.get(h, '—')`，於是 2026-08-17 新增的
    # 14 個事件在 README 上是 14 格 `—`，而沒有任何東西會紅。
    GR.V.reconcile(GR.HOOK_LABEL, hooks, "README 的觸發事件")
    for h in hooks:
        flag = ""
        for b in broken:
            if isinstance(b, dict) and b.get("token") == f"hook:{h}":
                flag = f" ⛔ 已知壞掉（{b.get('issue', '')}）"
        out.append(f"| `{h}` | {GR.HOOK_LABEL[h]}{flag} | {len(hooks_used.get(h, []))} |")
    out.append("")

    out += [
        f"### 條件葉（condition leaf）—— {len(leaves)} 種",
        "",
        "| 條件 | 用它的內容 |",
        "|---|--:|",
    ]
    for c in leaves:
        out.append(f"| `{c}` | {len(leaves_used.get(c, []))} |")
    out.append("")

    out += [
        f"### 狀態標籤 —— {len(status_tags)} 個（`content/status-effects/*.json` 逐檔數出來）",
        "",
        "標籤是**開放**詞彙（自由字串），條件葉 `status` 的類別分支就是查它：",
        "",
    ]
    out.append(" ".join(f"`{t}`×{len(ids)}" for t, ids in status_tags.items()))
    out.append("")

    out += [
        f"### 特效（vfx）—— {len(vfx)} 份",
        "",
        f"`content/vfx/*.json`，由 `spawnVfx.vfxId` 與技能的 `vfxKey` 引用。逐份清單在 [`{DOC_MECHANICS}`]({DOC_MECHANICS})。",
        "",
    ]
    if families:
        out += [f"### 技能模板家族 —— {len(families)} 種", "",
                " ".join(f"`{f}`" for f in families), ""]
    if unsupported:
        out += ["### ⛔ 宣告為 unsupported（引擎沒有，⛔ 不要寫進 JSON）", "",
                " ".join(f"`{u}`" for u in unsupported), ""]

    out += [f"完整的參數與上下界（每個效果每一格能填什麼）在 "
            f"[`docs/技能標記機制與效果規則.md`](docs/技能標記機制與效果規則.md)，同樣是產生的。", ""]
    out += provenance(ctx)
    return "\n".join(out), len(kinds) + len(hooks) + len(leaves)


# ---------------------------------------------------------------------------
# arenas — 場地清單（GH#449）
# ---------------------------------------------------------------------------

def _num(x):
    """`31.240998703626623` → `31.24`，`24.0` → `24`。

    ⛔ 不要 round() 之後直接 str()：`24.0` 印成 `24.0` 會讓十三列裡有兩種寫法。
    """
    if x is None:
        return "—"
    v = round(float(x) + 0.0, 2)
    return str(int(v)) if v == int(v) else str(v)


def load_arenas():
    """`content/arenas/arena.*.json` 逐檔讀出來，⛔ 不吃 `_index.json`。"""
    import glob
    out = []
    for path in sorted(glob.glob(os.path.join(G.CONTENT, "arenas", "arena.*.json"))):
        with open(path, encoding="utf-8") as f:
            out.append(json.load(f))
    return out


def load_arena_pool():
    """`config.arena-pool@1` —— 回合輪替池與決賽場地（GH#324 之後是後台可調的）。"""
    path = os.path.join(G.CONTENT, "config", "arena-pool.json")
    if not os.path.exists(path):
        sys.exit(f"missing {path} — 輪替池是 config.arena-pool@1，⛔ 不是散文")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def gen_arenas(ctx):
    """README 區塊：**每一張**場地與它的幾何，從 `content/arenas/*.json` 數出來。

    ⭐ 為什麼這一段必須是產生的（GH#449，owner「新的地圖場地 也記得更新到 github
    readme」）：README 這一節以前手寫著「輪替池：五份文件…manifest 也記
    `arenas: 5`」，而實際上有 **13 張**，而且輪替池早就不是那個寫死的 TS 陣列了
    （GH#324 把它搬進 `config.arena-pool@1`）。一份手寫的清單就是一個**保證會
    過期**的第二住處 —— 這個 repo 已經因為同一個形狀被咬過三次
    （`SIM_CAPABILITIES` 兩次、`skillTiers.ts` 的「110 支」實為 29 支）。

    ⛔ 這裡刻意**不驗證**幾何本身（那是 `arenaCollision.test.ts` 的工作）。
    它只驗一件 README 自己造得出來的謊：**輪替池點名了一張不存在的場地**。
    那是兩個名詞之間的**關係**，⛔ 分別檢查每一半永遠看不出來。
    """
    arenas = load_arenas()
    pool = load_arena_pool()
    rotation = list(pool.get("rotation") or [])
    finale = pool.get("finale")
    by_id = {a["id"]: a for a in arenas}

    missing = [i for i in rotation + ([finale] if finale else []) if i not in by_id]
    if missing:
        sys.exit(
            f"config.arena-pool@1 點名了 {len(missing)} 張不存在的場地：{', '.join(missing)}\n"
            f"   → 補上 content/arenas/<id>.json 或把它從 arena-pool.json 拿掉，"
            f"⛔ 不要改產生器"
        )

    radii = sorted({z["boundaryRadius"] for a in arenas for z in a["zones"]})
    featured = [a for a in arenas if any(z.get("regions") or z.get("interactions") or z.get("gates")
                                         for z in a["zones"])]

    L = [
        f"#### 競技場 arenas（{len(arenas)} 張 · 邊界半徑 {len(radii)} 種 · "
        f"{len(featured)} 張帶場地特色）",
        "",
    ]
    L += note([
        f"**輪替**欄讀 `content/config/arena-pool.json`（`config.arena-pool@1`，後台可調）："
        f"🔁 ＝在回合輪替池裡（{len(rotation)} 張）、🏁 ＝決賽場地"
        f"（`{finale}`，刻意不在池子裡）、— ＝有文件但目前沒有人抽得到。"
        "⚠️ 池子的**順序不是輪替順序** —— `pickRoundArena()` 用 match seed 洗一次牌。",
        "",
        "其餘每一欄都是從那一份 arena 文件**逐檔數**出來的："
        "**半徑**＝各 zone 的 `boundaryRadius`（不同就全部列出）、"
        "**zone**＝一張圖切成幾個獨立的對決區、"
        "**障礙**＝`obstacles` 的段/圓總數（碰撞幾何，⛔ 不是佈景）、"
        "**出生點**＝`spawns` 攤平後的座標數、"
        "**地面**＝`groundStyle`、**背景**＝有沒有 `backdrop` 遠景層、"
        "**佈景**＝`decor` 物件數 ＋ `scenery.props` 的實例數（⛔ 兩者都不擋路）、"
        "**場地特色**＝`regions` 命名區域 / `interactions` 互動點 / `gates` 週期開關門。",
    ])

    L += [
        "| id | 名稱 | 輪替 | 半徑 | zone | 障礙 | 出生點 | 地面 | 背景 | 佈景 | 場地特色 |",
        "|---|---|:-:|--:|--:|--:|--:|---|:-:|--:|---|",
    ]
    for a in arenas:
        zones = a["zones"]
        role = "🔁" if a["id"] in rotation else ("🏁" if a["id"] == finale else "—")
        radius = " / ".join(_num(r) for r in sorted({z["boundaryRadius"] for z in zones}))
        obstacles = sum(len(z.get("obstacles") or []) for z in zones)
        spawns = sum(len(team) for z in zones for team in (z.get("spawns") or []))
        decor = len(a.get("decor") or [])
        props = sum(int(p.get("count", 1)) for p in ((a.get("scenery") or {}).get("props") or []))
        feats = []
        for label, key in (("區域", "regions"), ("互動", "interactions")):
            n = sum(len(z.get(key) or []) for z in zones)
            if n:
                feats.append(f"{label}×{n}")
        if any(z.get("gates") for z in zones):
            feats.append("機關門")
        L.append(
            f"| `{a['id']}` | {G.cell(a.get('name'))} | {role} | {radius} | {len(zones)} | "
            f"{obstacles} | {spawns} | `{a.get('groundStyle') or '—'}` | "
            f"{'✅' if a.get('backdrop') else '—'} | {decor}+{props} | "
            f"{'、'.join(feats) or '—'} |"
        )
    L.append("")
    L += provenance(ctx, f"輪替 {len(rotation)} / 全 {len(arenas)} 張。")
    return "\n".join(L), len(arenas)


# ---------------------------------------------------------------------------
# combat-env + tiers — 「卡面值」與「玩家實際吃到的值」中間那兩條接縫
# ---------------------------------------------------------------------------

def load_config(name):
    """`content/config/<name>.json` —— 出貨值那一份（後台 override 會再蓋它一層）。"""
    path = os.path.join(G.CONTENT, "config", f"{name}.json")
    if not os.path.exists(path):
        sys.exit(f"missing {path} —— README 的倍率／級距表是從出貨 config 產生的，"
                 f"⛔ 不是手寫的")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _ts_const(rel, pattern, what):
    """從一支 TS 檔把**一個**常數挖出來 —— ⛔ 不在這裡再宣告一份。

    ⭐ 判準：這個數字／名單在 TS 裡有**唯一**的住處（而且有守衛看著），這裡就只
    負責把它讀出來。抄一份進 Python 就是第零守則⑨的反面標記 —— 兩份會分岔，而
    分岔的那一刻 README 會**用正確的格式印出錯誤的內容**。
    """
    path = os.path.join(G.REPO, rel)
    if not os.path.exists(path):
        sys.exit(f"missing {path} —— {what} 只有那一個住處")
    with open(path, encoding="utf-8") as f:
        m = re.search(pattern, f.read())
    if not m:
        sys.exit(f"{rel} 裡找不到 {what}（pattern: {pattern}）—— 它被改名或搬家了，"
                 f"⛔ 不要在 README 產生器裡另外寫一份")
    return m


SKILL_TIERS_TS = "packages/shared/src/content/skillTiers.ts"
EXPAND_TS = "packages/shared/src/content/templates/expand.ts"
ADMIN_ENV_TS = "apps/admin/src/combatEnv.ts"

ENV_LABEL_RE = re.compile(r"(\w+)\s*:\s*\{\s*zh\s*:\s*\"([^\"]+)\"", re.S)


def env_labels():
    """每一格倍率的中文名 —— 唯一住處是後台那一頁（`apps/admin/src/combatEnv.ts`）。

    ⭐ 讀它而不是在 README 再寫一份「作用」欄：那一欄手寫時已經過期過一次
    （寫著 `cooldown` 0.25 / `maxHealth` 8.0，而出貨是 0.2 / 4）。
    ⛔ 找不到標籤不 die —— 少一個中文名不會讓任何人做錯事，印 `—` 就好。
    """
    path = os.path.join(G.REPO, ADMIN_ENV_TS)
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as f:
        return {m.group(1): m.group(2) for m in ENV_LABEL_RE.finditer(f.read())}


def tier_names():
    """五個級距名 —— 唯一住處是 `skillTiers.ts` 的 `SKILL_TIER_NAMES`。"""
    m = _ts_const(SKILL_TIERS_TS, r"SKILL_TIER_NAMES\s*=\s*\[([^\]]*)\]",
                  "SKILL_TIER_NAMES")
    return [s.strip().strip('"').strip("'") for s in m.group(1).split(",") if s.strip()]


def wc3_per_unit():
    """`GGD_PER_WC3` —— w3x 的一格距離換成 GGD 的一格距離。"""
    m = _ts_const(EXPAND_TS, r"GGD_PER_WC3\s*=\s*([0-9.]+)\s*/\s*([0-9.]+)",
                  "GGD_PER_WC3")
    return float(m.group(1)), float(m.group(2))


POP_RE = re.compile(r"\*\*(\d+) 位對戰可選英雄\*\*")


def balance_population():
    """平衡量測的**母體大小** —— 讀 `pnpm anchors:build` 寫的那份報告。

    ⛔ 這裡**不**重算母體。母體只有一個定義（`packages/shared/testkit/
    balancePopulation.ts`：對戰可選名單 − 退場 − 變身態），`anchors:build` 把它印
    進報告，`pnpm roster:check` 的第 ⑦ 條再驗「報告裡印的母體 ↔ 名單長度」。
    ⇒ 這一行只是把那個已經被守著的數字接過來；在 Python 裡重寫一次定義，就會多出
    一個**沒有守衛**的第二住處，而它一定會在下一次上下架時說謊。
    """
    path = os.path.join(G.REPO, DOC_ANCHORS)
    if not os.path.exists(path):
        sys.exit(f"missing {path} —— 跑 `pnpm anchors:build`")
    with open(path, encoding="utf-8") as f:
        m = POP_RE.search(f.read())
    if not m:
        sys.exit(f"{DOC_ANCHORS} 裡找不到「**N 位對戰可選英雄**」—— "
                 f"母體出處被拿掉了，跑 `pnpm anchors:build`")
    return int(m.group(1))


def gen_combat_env(ctx):
    """README 區塊：全域倍率表 —— **從 `content/config/combat-env.json` 產生**。

    ⭐ 為什麼它必須是產生的：這一節手寫時說 `cooldown` 0.25 / `damageDealt` 0.5 /
    `maxHealth` 8.0 / `abilityRange` 0.6「其餘 14 項 1.0」，而出貨那一份**四項全部
    不是那個值**、非 1.0 的項目也不只四項。它就是這個 repo 反覆踩的同一個形狀：
    一張手寫的鏡子，鏡子不會因為本體變了而紅。
    """
    env = load_config("combat-env")
    mult = env.get("multipliers") or {}
    if not mult:
        sys.exit("combat-env.json 沒有 multipliers —— 這一節整段的來源不見了")
    tuned = sorted((k for k, v in mult.items() if float(v) != 1.0), key=str)
    neutral = sorted((k for k, v in mult.items() if float(v) == 1.0), key=str)

    L = [
        f"#### 全域倍率表 `combat-env`（{len(mult)} 項 · {len(tuned)} 項不是 1.0）",
        "",
    ]
    L += note([
        "`content/config/combat-env.json` 是一張全域倍率表，每項只作用在模擬裡的**唯一一個**"
        "公式點。**遊戲內顯示的每一個數字，都是乘完倍率之後的最終值** —— 換算走唯一一條接縫 "
        "`apps/client/src/ui/displayFinal.ts`，React 端訂閱權威的 `combatEnvJson`，"
        "後台改倍率時畫面即時跟著變。",
        "",
        "⚠️ 下表是**出貨值**。後台覆寫逐鍵蓋過 content 預設，所以線上那一場可能不是這些數字"
        "（改 config 前先查有沒有存過 override）。",
    ])
    labels = env_labels()
    L += ["| 倍率 | 值 | 是什麼 |", "| --- | ---: | --- |"]
    for k in tuned:
        L.append(f"| `{k}` | **{_num(mult[k])}** | {G.cell(labels.get(k) or '—')} |")
    L.append("")
    L.append(f"其餘 **{len(neutral)}** 項是 1.0（不動）："
             + "、".join(f"`{k}`" for k in neutral) + "。")
    L.append("")
    L += provenance(ctx, f"倍率讀 `content/config/combat-env.json`（version "
                         f"{env.get('version', '?')}）。")
    return "\n".join(L), len(mult)


# 每一份 `*-tiers.json` 對應的**作者欄位**（技能 JSON 裡填的那個 key）。
# ⛔ 這裡只放**名字**，⛔ 一個數字都沒有 —— 數字全部從那份 config 讀。
# 多出一份沒登記的 `*-tiers.json` 會讓這支直接 die（見 gen_tiers），那是刻意的閘：
# 第六張表出現時，README 應該**紅**，⛔ 不是安靜地只印五張。
TIER_FILE_FIELDS = {
    "config.range-tiers@1": ("`rangeTier`", "施法距離"),
    "config.aoe-tiers@1": ("`radiusTier`", "施法範圍（AoE 半徑）"),
    "config.displacement-tiers@1": ("`distanceTier`", "位移（衝刺 / 擊退）"),
    "config.cooldown-tiers@1": ("`cooldownTier` + `cooldownShape`", "冷卻"),
    "config.damage-tiers@1": ("`damageTier`（住 `amount.zScaling`）", "傷害"),
    # ⭐ 2026-08-21 —— 五軸的**最後一軸**。在它之前 `ability@1` 上根本沒有這一格，
    #    所以另外四軸各有 85–350 支填了級別，而耗魔是 0 支（機制沒做，⛔ 不是漏填）。
    "config.mana-tiers@1": ("`manaCostTier`", "耗魔"),
    # ⏳ 2026-09-02 GH#943 —— owner 逐字：「吟唱⋯其實這個也可以五級距
    #    **0, 0.1, 0.3, 0.5, 1** 建議也改成這個」。⚠️ ⭐ 上界 1.0 與
    #    `castTimeMaxSec`（#787 的 owner 夾）**刻意同一個數字** ⇒ ⛔ 作者不可能
    #    寫出一個「會被靜靜夾掉」的值。載入時由 `resolveCastTimeTierOnDoc` 翻譯
    #    （⭐ 級距贏，同 `resolveCooldownTier` 的「級別贏」規則）。
    "config.cast-time-tiers@1": ("`castTimeTier`", "吟唱"),
    # 🧮 2026-09-02 GH#942/#943 —— ⭐ 這一張**不是**「級距 → 值」的表，而是
    #    **六維公式的乘數表**（冷卻·吟唱·距離·形狀·條件·基礎值補償）。
    #    ⚠️ 它的級距欄位 `conditionTier` 是**讀取時推導**的（⛔ 不改文件）：
    #    缺席時由 `resolveConditionTier()` 從文件自己的結構推導 ⇒ ⛔ 208 支帶 AP
    #    係數的技能**不必**各填一格（那會是 208 個會過期的第二住處）。
    "config.ap-coefficient@1": ("`conditionTier`（住 `amount.zScaling`，⭐ 缺席時推導）", "AP 係數六維公式"),
    # 💨 2026-08-27 GH#789 —— owner:「移動速度加成一律的 %轉換為五級距，一樣列表
    #    可設定，五級距上下限增加移速為 0.1~4」。⚠️ 作者欄位**不在** `ability@1` 頂層,
    #    它落在**任何一條加移速的 modifier**（ability／item／augment 共用同一把梯子）,
    #    而且是 **exclusive**：填了級別就**沒有** `value`（第〇·四）。
    #    ⛔ 單位是 u/s 的 flat 移速不走這條梯子（7 列進了帶理由的豁免表）。
    "config.move-speed-tiers@1": ("`msBonusTier`（住 modifier）", "移速加成（%）"),
    # ⭐ 2026-08-21 —— ⚠️ 這一張**不是技能的軸**，是**英雄卡**的軸（owner：「請你給我
    #    移動速度及攻擊速度 每級成長五級距」）。作者欄位落在 `champion@1` 而不是
    #    `ability@1`，而且它有**兩把梯子**（`growth.A` / `growth.B`，`ladder` 一格切）。
    #    ⛔ 不要因為「它跟技能無關」就把它從這一節漏掉：讀者要問的是「五級距總共有
    #    哪幾軸」，而答案裡有它 —— 漏掉就是這一節在說謊（它已經因為這個 die 過一次）。
    "config.speed-growth-tiers@1": (
        "`msGrowthTier` / `asGrowthTier`（**英雄卡**）",
        "移動速度 · 攻擊速度的**每級成長**",
    ),
}


def _ladders(doc, names):
    """把一份 tier config 裡**每一條梯子**挖出來。

    ⭐ 判準是**形狀**，⛔ 不是一張寫死的 key 清單：任何「key 剛好就是那五個級距名」
    的 dict 就是一條梯子。⇒ 新增一條梯子（例如冷卻表多一個形狀）不用改這支。
    值可以是數字（`damage`）也可以是物件（`travel.極小 = {distance, speed}`），
    後者按子欄位再拆成一列。
    """
    want = set(names)
    out = []

    def walk(node, path):
        if not isinstance(node, dict):
            return
        if set(node.keys()) == want:
            vals = [node[n] for n in names]
            if all(isinstance(v, (int, float)) for v in vals):
                out.append((path, vals))
            elif all(isinstance(v, dict) for v in vals):
                subs = sorted({k for v in vals for k in v})
                for s in subs:
                    if all(isinstance(v.get(s), (int, float)) for v in vals):
                        out.append((path + [s], [v[s] for v in vals]))
            return
        for k, v in node.items():
            walk(v, path + [k])

    walk(doc, [])
    return out


def gen_tiers(ctx):
    """README 區塊：**技能五級距** —— 五張表、卡面↔實際、與原始值的關係、母體。

    ⭐ 這一節整段是產生的，理由跟 arenas 那一段一樣：級距表在 2026-08-20／21 三天內
    重錨了**三次**（500/1250/… → 1150/2875/… → 600/1500/…），每一次都讓散文裡的
    五個數字變成謊話，而**沒有任何東西會紅**。這裡一個級距數字都不手寫。
    """
    import glob
    names = tier_names()
    paths = sorted(glob.glob(os.path.join(G.CONTENT, "config", "*-tiers.json")))
    if not paths:
        sys.exit("content/config/*-tiers.json 一份都沒有 —— 級距表整層不見了")

    tables = []
    for p in paths:
        with open(p, encoding="utf-8") as f:
            doc = json.load(f)
        tag = doc.get("schema")
        if tag not in TIER_FILE_FIELDS:
            sys.exit(
                f"{os.path.relpath(p, G.REPO)} 的 schema `{tag}` 沒有登記在 "
                f"TIER_FILE_FIELDS 裡。\n"
                f"   → 這是**第六張級距表**。補一列（作者欄位 + 中文軸名）到 "
                f"tools/reference/gen_readme_lists.py，⛔ 不要把它從 README 漏掉。")
        field, axis = TIER_FILE_FIELDS[tag]
        tables.append((os.path.basename(p), doc, field, axis, _ladders(doc, names)))

    rows = sum(1 for t in tables for _p, v in t[4] if len(set(v)) > 1)
    off = [t[0] for t in tables if t[1].get("enabled") is False]
    # 「卡面 ↔ 實際」那一句的驗算用的是**單體·極小**那一格 —— 從剛讀進來的梯子
    # 取，⛔ 不另外打一個 6 進去（它 2026-08-19 才被 owner 給滿，下次還會動）。
    smallest_cd, smallest_cd_label = None, ""
    for _fname, doc, _field, _axis, ladders in tables:
        if doc.get("schema") != "config.cooldown-tiers@1":
            continue
        for path, vals in ladders:
            if smallest_cd is None or vals[0] < smallest_cd:
                smallest_cd, smallest_cd_label = vals[0], path[-1]
    pop = balance_population()
    num, den = wc3_per_unit()
    env = (load_config("combat-env").get("multipliers") or {})
    cdrules = load_config("cooldown-rules")

    L = [
        f"#### ⭐ 技能五級距（{len(tables)} 張表 · {rows} 條梯子 · 母體 **{pop} 位對戰可選英雄**）",
        "",
    ]
    L += note([
        f"**級距名全專案只有一份**（`{SKILL_TIERS_TS}` 的 `SKILL_TIER_NAMES` = "
        + " / ".join(f"**{n}**" for n in names)
        + "）—— ⛔ 沒有「超大」，也沒有任何一軸可以自己再宣告一組。",
        "",
        "⭐ **靠攏發生在註冊時，⛔ 內容 JSON 不動。** 技能檔裡那些從 w3x 匯進來的自由"
        "秒數／耗魔，是在 `packages/shared/src/content/tierSnap.ts` 被靠到格點上的 —— "
        "舊技能、新技能、模板展開出來的技能走**同一個**接縫。"
        "靠攏方向是 owner 的規則「**傷害低的往前靠、傷害高的往後靠**」，"
        "而「高／低」那條線是後台一格（`highDamageThreshold`，**0 = 自動**＝全庫中位滿階傷害）。",
        "",
        "每一張表自己帶 `enabled` 開關：翻掉那一格，那一軸就回到技能自己手寫的數字"
        "（**一鍵 rollback**，⛔ 不必改任何一份技能 JSON）。",
    ])
    if off:
        L += note([f"⚠️ 目前 **{len(off)}** 張表的 `enabled` 是 false："
                   + "、".join(f"`{n}`" for n in off) + "。"])

    # ⚠️ 表數從 `tables` 推導，⛔ 不寫死「五張」—— 2026-08-21 一天內從 5 張長到 7 張，
    #    而一個寫死的量詞不會紅，它只會安靜地變成假話（第三守則）。
    L += [f"##### 一 · {len(tables)} 張表（**卡面值**，出貨 `content/config/*-tiers.json`）", ""]
    L += ["| 軸 | 技能 JSON 填什麼 | 梯子 | " + " | ".join(names) + " | 開關 | 出處 |",
          "|---|---|---|" + "---:|" * len(names) + ":-:|---|"]
    flat = []   # 五格全同的「梯子」—— 它是一個伴隨欄位，⛔ 不是一條級距
    for fname, doc, field, axis, ladders in tables:
        first = True
        for path, vals in ladders:
            if len(set(vals)) == 1:
                flat.append((fname, ".".join(path), vals[0]))
                continue
            L.append(
                f"| {axis if first else ' '} | {field if first else ' '} | "
                f"`{'.'.join(path)}` | " + " | ".join(f"**{_num(v)}**" for v in vals)
                + f" | {'✅' if doc.get('enabled') else '⛔'} | `{fname}` |")
            first = False
    L.append("")
    if flat:
        # ⛔ 不要把它們默默丟掉 —— 讀者要知道那些欄位存在、而且**刻意**五格一樣。
        L.append("同一份 config 裡另外 **{n}** 個欄位五格是同一個值（⇒ 它是伴隨參數，"
                 "⛔ 不是一條級距）：{items}。".format(
                     n=len(flat),
                     items="、".join(f"`{p}` = **{_num(v)}**（`{f}`）" for f, p, v in flat)))
        L.append("")

    # ⭐ 2026-08-21 —— 一張級距表**存在**不代表有人填得到它。
    #   `asGrowthTier` 就是這個形狀：軸還在、後台還在、README 還印著五格，
    #   而 `speedtiers:build` 已經**不再敲它**（攻速交回 `stat-normalization` 的出身表）。
    #   ⛔ 不講的話，讀者會以為那是一個可以用的設計維度 —— 這正是第一·五守則的
    #   「說了但不會發生」。⛔ 用量現場數 `content/champions/`，不打字。
    champ_fields = {"msGrowthTier", "asGrowthTier"}
    used = {f: 0 for f in champ_fields}
    for p in sorted(glob.glob(os.path.join(G.CONTENT, "champions", "*.json"))):
        if os.path.basename(p).startswith("_"):
            continue
        with open(p, encoding="utf-8") as fh:
            doc = json.load(fh)
        for f in champ_fields:
            if doc.get(f) is not None:
                used[f] += 1
    dead = sorted(f for f, n in used.items() if n == 0)
    if dead:
        norm_applies = load_config("stat-normalization").get("appliesTo") or []
        L += note([
            "⚠️ **英雄卡那一軸有 " + str(len(dead)) + " 格今天是 0 份用量**："
            + "、".join(f"`{f}`" for f in dead)
            + "。級距表、後台欄位、schema 都在，但**沒有一張卡填它** —— "
            + ("那條屬性已經交給 `config.stat-normalization@1` 的出身表"
               f"（`appliesTo` 現在有 {len(norm_applies)} 條）"
               if norm_applies else "那一軸還沒有內容在用")
            + "。⛔ 不要因為表上印著五格就以為它是一個可以填的設計維度。",
        ])
    L += ["##### 二 · 卡面 ↔ 實際（表上的數字**不是**玩家吃到的數字）", ""]
    L += note([
        f"{len(tables)} 張表印的全部是**卡面值**。玩家實際吃到的是它再過一次全域倍率表"
        "（上一節的 `combat-env`），⛔ 而且**不是每一軸都有倍率**：",
    ])
    L += ["| 軸 | 卡面 → 實際 | 接縫 |", "|---|---|---|"]
    L += [
        f"| 冷卻 | × `cooldown` **{_num(env.get('cooldown'))}**，再被 "
        f"`config.cooldown-rules@1.minSeconds` **{_num(cdrules.get('minSeconds'))}** 夾一次 "
        f"| `sim/abilities/abilitySystem.ts` |",
        f"| 施法距離 · AoE 半徑 | × `abilityRange` **{_num(env.get('abilityRange'))}**"
        f"（**⛔ 不含普攻** —— 那條走 `attackRange` **{_num(env.get('attackRange'))}**）"
        f"| `abilityCastRange()` / `abilityRadius()` |",
        f"| 傷害 | × `damageDealt` **{_num(env.get('damageDealt'))}**，之後才進減傷 "
        f"| `sim/combat/damage.ts` |",
        "| 位移（衝刺／擊退） | **⛔ 不套倍率** —— 卡面即實際 "
        "| `sim/effects/dash.ts` · `sim/effects/knockback.ts` |",
    ]
    L.append("")
    # ⭐ 2026-08-21 —— 傷害那一軸多了**第三層**，而這張表在此之前只講到全域倍率。
    #    ⛔ 少講它 = 讀者拿級距表當「玩家看到的傷害」，而出貨設定下差到 2 倍。
    ap = load_config("ap-damage-scaling")
    if ap.get("rate") and ap.get("scope") in ("ability", "all"):
        # ⛔ **不可以**用 `_num()` 印這一格：它 round 到兩位小數，而出貨值是 0.005 ——
        #    印出來會是 `0.01`，也就是**剛好兩倍**的一個看起來很合理的假數字。
        rate_txt = f"{ap['rate']:.10g}"
        L += note([
            f"🔴 **傷害還有第三層**（2026-08-21 新增，⛔ 只打在傷害這一軸）："
            f"`基礎傷害 × (1 + 施法者法強 × {rate_txt})`"
            f"（＝ **{+round(ap['rate'] * 100, 6):g}%**／點法強） —— "
            f"出貨 `scope: {ap['scope']}` / `apRatioMode: {ap['apRatioMode']}`"
            f"（`content/config/ap-damage-scaling.json`，`rate = 0` 是一鍵 rollback）。"
            f"⇒ 級距表上那一列**不是**玩家看到的傷害；法強級距從極小到極大，"
            f"同一支技能差 "
            f"**{_num(round((1 + load_config('stat-normalization')['bands']['ap']['極大'] * ap['rate']) / (1 + load_config('stat-normalization')['bands']['ap']['極小'] * ap['rate']), 3))}×**。"
            f"契約在 [`docs/editor-contract/ap-damage-scaling.md`](./docs/editor-contract/ap-damage-scaling.md)。",
        ])
    if smallest_cd is not None:
        actual = max(smallest_cd * float(env.get("cooldown", 1)),
                     float(cdrules.get("minSeconds", 0)))
        L += note([
            f"⚠️ 所以「{smallest_cd_label}·{names[0]}」的 **{_num(smallest_cd)} 卡面秒**，"
            f"在出貨設定下實際是 "
            f"**{_num(actual)} 秒**。⛔ 卡面上寫的是前者 —— "
            "傷害與回魔的反算全部站在這個換算上。",
        ])

    L += ["##### 三 · 級距與**原始值**的關係", ""]
    L += ["| 軸 | 原始值是什麼 | 怎麼變成級距 |", "|---|---|---|"]
    L += [
        f"| 施法距離 · AoE · 位移 | w3x 的 `w3a` 欄位（JASS 優先） | "
        f"先乘換算係數 `GGD_PER_WC3 = {_num(num)}/{_num(den)}`，再靠到梯子上。"
        f"梯子本身是**決鬥區半徑的分數**（owner 給的錨：大 = 1/4、極大 = 1/3），"
        f"⛔ 不是等比也不是等差 |",
        "| 冷卻 | w3x 匯進來的自由秒數 | owner 2026-08-19 **直接給滿**十五格"
        "（單體／範圍／變身各一列），⛔ 所以這一軸照抄，沒有推導梯子。"
        "不在格點上的走 `tierSnap` 靠攏 |",
        f"| 傷害 | 技能自己手寫的 `flat` / `perRank` | **推導**：母體 {pop} 位可選英雄的"
        f"純基礎中位血量 ÷ owner 的「20 發要能殺死」× HP 倍率 ＋ 初始加成 ÷ 20 → 進位 "
        f"= 極小；其餘四格 = 極小 × **單體冷卻比**。填了 `damageTier` 就**取代** "
        f"`flat`/`perRank`（⛔ 不是相加） |",
    ]
    L.append("")
    L += note([
        f"⭐ **母體是 {pop} 位對戰可選英雄**，⛔ 不是 `content/champions/` 的檔案數 —— "
        "那一份含**變身態**（同一位英雄的第二張卡 ⇒ 重複計數）與 fail-open 骨架佔位。"
        "定義只有一個住處（`packages/shared/testkit/balancePopulation.ts`："
        "對戰可選名單 − 退場名單 − 變身態），`pnpm roster:check` 逐份交付物驗它。",
        "",
        f"逐格推導、三個錨點（LV30 hard / LV50 soft / LV99 極限）的達成率、"
        f"以及兩個「空間」（純基礎 ↔ 引擎最終）的對照表在 "
        f"[`{DOC_ANCHORS}`](./{DOC_ANCHORS})；"
        f"與 w3x 的逐支對照與梯子推導在 [`{DOC_TIERS}`](./{DOC_TIERS})。兩份都是產生的。",
    ])
    L += provenance(ctx, f"級距讀 `content/config/*-tiers.json`（{len(tables)} 張表）、"
                         f"母體讀 `{DOC_ANCHORS}`。")
    return "\n".join(L), rows


# ---------------------------------------------------------------------------
# stat-bands —— 十出身 × 十一屬性（⭐ 2026-08-21 之前這一整段是**手打的**）
# ---------------------------------------------------------------------------
#
# ⚠️ 而它已經在說謊：那張表的「生效中」欄替**攻速**印著 `⛔`，底下還跟著一句
#   「攻速 ⛔ 不在生效名單：它已經有 `stat-caps` 兩層在管」—— 而 owner 2026-08-21
#   已經把 `as` 交回出身表（「請你照出身表的規劃來設定就好」）。
#   ⛔ 手改成 ✅ 只是把過期往後推一次，所以整段改成從 `stat-normalization.json` 產生。
#
# ⭐ 中文顯示名。⚠️ 只是顯示名 —— key 才是契約（同 Codex 契約那一份）。
STAT_ZH = {
    "ms": "移速", "as": "攻速", "ad": "攻擊力", "ap": "法強",
    "maxHealth": "生命", "armor": "裝甲", "mr": "魔抗", "maxMana": "魔力",
    "healthRegen": "生命回復", "manaRegen": "魔力回復", "range": "攻擊距離",
}
# 出身的排序 —— ⚠️ 六個純血在前（力/敏/智 × 近/遠），四個混血在後。
ORIGIN_ORDER = ["鬥士", "狂戰", "射手", "砲手", "坦克", "法鬥", "法師", "法刺", "硬輔", "軟輔"]
STAT_NORM_TS = "packages/shared/src/content/statNormalization.ts"
BAND_MEANING_RE = r"(?s)BAND_MEANING[^{]*\{(.*?)\}"
GROWTH_KEYS = ("str", "agi", "int")


def band_meaning(names):
    """五格的語意（缺陷／偏低／標準／優勢／特化）—— 唯一住處是 `statNormalization.ts`。"""
    m = _ts_const(STAT_NORM_TS, BAND_MEANING_RE, "BAND_MEANING")
    got = dict(re.findall(r"(\S+?):\s*\"([^\"]+)\"", m.group(1)))
    missing = [n for n in names if n not in got]
    if missing:
        sys.exit(f"{STAT_NORM_TS} 的 BAND_MEANING 少了 {missing} —— "
                 f"⛔ 不要在 README 產生器裡補一份")
    return got


def growth_survey():
    """出貨英雄卡上 `growth.str/agi/int` 的現況 —— ⛔ 現場數，不打字。"""
    import glob
    total, zero, nonzero = 0, 0, []
    for p in sorted(glob.glob(os.path.join(G.CONTENT, "champions", "*.json"))):
        if os.path.basename(p).startswith("_"):
            continue
        total += 1
        with open(p, encoding="utf-8") as f:
            g = (json.load(f).get("growth") or {})
        if any(float(g.get(k) or 0) != 0 for k in GROWTH_KEYS):
            nonzero.append(os.path.splitext(os.path.basename(p))[0])
        else:
            zero += 1
    return total, zero, nonzero


def gen_stat_bands(ctx):
    """README 區塊：**十出身 × 十一屬性**（級距、數值、上限、成長來源）。"""
    n = load_config("stat-normalization")
    caps = load_config("stat-caps").get("caps") or load_config("stat-caps")
    names = tier_names()
    bo, bands = n["byOrigin"], n["bands"]
    two = n.get("bandsByScale", {})
    scales = n.get("scaleByOrigin", {}).get("range", {})
    applies = n["appliesTo"]
    keys = [k for k in STAT_ZH if k in bands]
    origins = [o for o in ORIGIN_ORDER if any(o in bo.get(k, {}) for k in keys)]
    unlisted = sorted({o for k in keys for o in bo.get(k, {})} - set(origins))
    if unlisted:
        # ⛔ 靜默漏掉一個出身 = 這張表在**別人**新增出身的那天變成假的而沒人知道。
        sys.exit(f"stat-normalization.json 的 byOrigin 有 {len(unlisted)} 個沒登記在 "
                 f"ORIGIN_ORDER 裡的出身：{unlisted} —— 補進 gen_readme_lists.py")
    meaning = band_meaning(names)
    total, zero, nonzero = growth_survey()
    lv = n["referenceLevel"]

    L = [f"#### 十出身 × 十一屬性 —— 每一格落在哪一級距（{len(origins)} × {len(keys)}）", ""]
    L += ["| 出身 | " + " | ".join(STAT_ZH[k] for k in keys) + " |",
          "|---|" + "---|" * len(keys)]
    for o in origins:
        cells = []
        for k in keys:
            b = bo.get(k, {}).get(o)
            if k == "range" and b:
                scale = scales.get(o)
                zh = "近戰" if scale == "melee" else "遠程"
                v = (two.get(k, {}).get(scale, {}) or {}).get(b)
                cells.append(f"{zh}・{b} {_num(v)}" if v is not None else b)
            else:
                cells.append(b or "—")
        L.append(f"| **{o}** | " + " | ".join(cells) + " |")
    L += ["", "**級距語意**：`"
          + " · ".join(f"{b} = {meaning[b]}" for b in names) + "`", ""]

    L += ["#### 級距的實際數值與上限", ""]
    L += ["| 屬性 | " + " | ".join(names) + " | 一般上限 | 解鎖上限 | 生效中 |",
          "|---|" + "--:|" * len(names) + "--:|--:|:-:|"]
    for k in keys:
        c = caps.get(k) or {}
        cap = f"{_num(c['base'])} | {_num(c['unlocked'])}" if c else "— | —"
        live = "✅" if k in applies else "⛔"
        if k in two:
            for scale, zh in (("melee", "近戰尺"), ("ranged", "遠程尺")):
                row = " | ".join(_num(two[k][scale][b]) for b in names)
                L.append(f"| **{STAT_ZH[k]}**（{zh}） | {row} | {cap} | {live} |")
        else:
            L.append(f"| {STAT_ZH[k]} | "
                     + " | ".join(_num(bands[k][b]) for b in names) + f" | {cap} | {live} |")
    L.append("")
    L += [
        f"- 「級距值」是**基準等級（{lv} 級）的最終總值**，⛔ 不是初始值",
        "- 「解鎖上限」要靠道具／技能標籤才碰得到",
        f"- ⛔ 「生效中」是這張表最容易說謊的一欄：級距數字一直都在，"
        f"但 `⛔` 的那幾項**沒有接進 `appliesTo`**，照它們調平衡會調到一條沒接上的線",
        "- 移速那一列的兩個天花板是**碰撞物理**不是偏好：一般上限就是**穿牆平手線**"
        "（每 tick 剛好走滿一個身體半徑），級距的極大刻意留在線內 —— 推導在 "
        "`packages/shared/src/sim/statCaps.ts`",
        "",
    ]
    # ⭐ 2026-08-21 的架構裁決 —— 這一段在此之前 README 一個字都沒說。
    L += [f"#### 🔴 每級成長 **100% 由出身決定**（三圍成長已經全部歸 0）", ""]
    L += note([
        f"力量／敏捷／智慧的**每級成長全部是 0**（{zero}/{total} 張英雄卡，含變身態）。"
        f"一位英雄升一級拿到的每一點，都是引擎**反解**出來的 —— "
        f"反解的目標就是上表那一格級距值（等級 {lv} 的終值）。",
        "",
        "⭐ owner 的分工一句話：**初始＝個性（卡上的 `baseStats`），"
        "成長＝定位（出身的級距）**。兩位同出身的英雄可以有不同的起點，"
        f"但他們在等級 {lv} 收斂到同一格。",
        "",
        f"⚠️ 所以調 `combat-env` 的 `intToAbilityPower` **不會**讓法強終值變高 —— "
        f"它只改「等級 1 拿到多少」，反解把差額從每級成長裡等量扣掉，等級 {lv} 逐位元不變。"
        f"要改法強終值只有一格：上表的 `bands.ap`。",
    ])
    if nonzero:
        L += note([f"🔴 **例外 {len(nonzero)} 張**（三圍成長不是 0）："
                   + "、".join(f"`{c}`" for c in nonzero) + "。"])
    L += provenance(ctx, "級距與 `appliesTo` 讀 `content/config/stat-normalization.json`、"
                         "上限讀 `stat-caps.json`、成長現況現場數 `content/champions/`。")
    return "\n".join(L), len(origins) * len(keys)


GENERATORS = {"roster": gen_roster, "abilities": gen_abilities, "items": gen_items,
              "grail": gen_grail, "mechanics": gen_mechanics, "arenas": gen_arenas,
              "combat-env": gen_combat_env, "stat-bands": gen_stat_bands,
              "tiers": gen_tiers}


def render(ctx):
    """name -> (body, rows), in the fixed BLOCKS order."""
    return {name: GENERATORS[name](ctx) for name in BLOCKS}


def _render_docs(ctx):
    """The FULL sets (all 113 / 554 / 214) that live in docs/reference/*.md — the
    same source of truth, written in the same run so README and docs can never
    drift. name -> (path, text)."""
    return {
        "roster": (G.gen_roster, os.path.join(G.OUTDIR, "roster.md")),
        "abilities": (G.gen_abilities, os.path.join(G.OUTDIR, "abilities.md")),
        "items": (G.gen_items, os.path.join(G.OUTDIR, "items.md")),
        # ⭐ 聖杯願望與機制詞彙 —— 同一次 run，同一份 ctx，所以 README 的摘要與
        # 這兩份完整清單不可能互相矛盾（owner 2026-08-17「統一用程式建立」）。
        "grail": (lambda c: (GR.gen_grail_doc(c, G.CONTENT), 0),
                  os.path.join(G.OUTDIR, "grail-wishes.md")),
        "mechanics": (lambda c: (GR.gen_mechanics_doc(c, G.CONTENT, c["abilities"]), 0),
                      os.path.join(G.OUTDIR, "mechanics.md")),
    }


def main():
    check_only = "--check" in sys.argv[1:]

    if not os.path.exists(README):
        sys.exit(f"missing {README}")
    with open(README, encoding="utf-8") as f:
        original = f.read()

    ctx = G.build_context()
    rendered = render(ctx)

    # README: splice the OPEN lists between the markers.
    text = original
    actions = {}
    for name in BLOCKS:
        body, _rows = rendered[name]
        text, actions[name] = splice(text, name, body)

    # docs/reference/*.md: the FULL sets, from the same ctx.
    docs = {}
    for name, (fn, path) in _render_docs(ctx).items():
        doc_text, _ = fn(ctx)
        current = ""
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                current = f.read()
        docs[name] = (path, doc_text, doc_text != current)

    if check_only:
        # ⛔⛔ **在此之前這是一條在 CI 結構上不可能綠的閘**（CLAUDE.md 失敗形態⑨）。
        #   這支產生器讀 `data/curation/whitelist.json` —— 一份 **git-ignored 的營運狀態**
        #   （檔頭第 39 行自己就寫著 "The whitelist is git-ignored"）。
        #   ⇒ owner 的機器有它 ⇒ 產出 49 名 OPEN；CI 的全新 clone 沒有它 ⇒ 產出 0 名
        #   ⇒ **同一個 commit 在兩台機器上得到兩份不同的「正確」輸出**，而 `--check`
        #   逐位元組比對 ⇒ CI 永遠是 `stale`，訊息還叫人去跑一支跑了也沒用的產生器。
        #
        # ⭐ 判準：**量不到就說量不到**，⛔ 不要假裝驗過，也⛔ 不要假裝壞掉。
        #   （CLAUDE.md：「fail-open 沒錯，**靜默**才是缺陷」；同 repo 前例
        #    `tools/model-budget/report.test.ts` 的 `HAS_OVERLAY` 逐字寫過同一件事。）
        # ⚠️ 殘留的洞誠實寫在這裡：這條路徑上 README 的**內容漂移也一起沒驗到**。
        #   真正的根治是「產生的文件不要烘進營運狀態」（第〇·四守則：值只有一個住處），
        #   那要動 owner 看得到的版面 ⇒ 已開票，⛔ 不在這裡順手改。
        if not os.path.exists(G.WHITELIST):
            print(
                "⚠️ **沒驗到** —— `data/curation/whitelist.json` 不存在（全新 clone / CI）。\n"
                "   這支產生器的輸出**取決於它**（OPEN 名單），所以在這台機器上"
                "「過期」與「沒過期」量起來一模一樣。\n"
                "   ⇒ 刻意 exit 0，⛔ 而不是靜默跳過。要在 CI 真的驗它，見 GH#995。",
            )
            return
        stale = []
        if text != original:
            stale.append("README:" + ",".join(f"{n}({a})" for n, a in actions.items()))
        for name, (path, _t, changed) in docs.items():
            if changed:
                stale.append(os.path.relpath(path, REPO))
        if stale:
            sys.exit(f"stale — run `{CMD}`: {'; '.join(stale)}")
        print(f"README.md + docs/reference/*.md up to date with contentVersion {ctx['contentVersion']}")
        return

    changed = text != original
    if changed:
        with open(README, "w", encoding="utf-8") as f:
            f.write(text)
    os.makedirs(G.OUTDIR, exist_ok=True)
    for name, (path, doc_text, doc_changed) in docs.items():
        if doc_changed:
            with open(path, "w", encoding="utf-8") as f:
                f.write(doc_text)

    print(f"contentVersion {ctx['contentVersion']}")
    for name in BLOCKS:
        _body, rows = rendered[name]
        print(f"  README:{name:<10} {rows:>4} open rows  ({actions[name]})")
    for name, (path, _t, doc_changed) in docs.items():
        print(f"  {os.path.relpath(path, REPO):<26} ({'wrote' if doc_changed else 'unchanged'})")
    size = len(text.encode("utf-8"))
    print(f"{'wrote' if changed else 'unchanged'} {os.path.relpath(README, REPO)}"
          f" — {len(text.splitlines())} lines, {size} bytes ({size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
