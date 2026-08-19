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

WHAT IT READS: nothing but content/ and the operator whitelist — the loader is
`build_context()` in gen_reference.py, shared with the docs/reference/*.md
generator so the two can never disagree. The whitelist is git-ignored; when it is
absent the OPEN roster is empty and this script SAYS SO loudly rather than
emitting a silent empty list.

Run it with `pnpm docs:readme` from the repo root, or directly:
  python3 tools/reference/gen_readme_lists.py

Flags:
  --check   exit 1 if the README OR the docs/reference/*.md are stale; writes nothing.

Stdlib only, deterministic, idempotent: two runs produce byte-identical output.
There is no timestamp — the contentVersion is the freshness stamp.
"""

import json
import os
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

BLOCKS = ("roster", "abilities", "items", "grail", "mechanics", "arenas")


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
    """The whitelist is git-ignored; on a fresh clone the OPEN list is empty. Say
    so loudly — an empty open list rendered as if it were content is exactly the
    failure that made the owner think the README was broken."""
    return note([
        f"⚠️ **開放{kind}名單目前是空的。** `data/curation/whitelist.json` 不存在或沒有列出任何"
        f"{kind}（那個檔是 gitignored，fresh clone 的預設狀態）。恢復方式見 §4，或在 "
        "`/admin/` → 內容白名單 → ⭐ 啟用示範組合 → 儲存。**這不是清單壞掉，是白名單是空的。**",
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
    open_rows = [c for c in champs if c["id"] in open_ids]
    closed_n = len(champs) - len(open_rows)
    open_no_passive = [c for c in open_rows if not c.get("passiveAbility")]

    L = [
        f"#### 開放名單 OPEN roster（{len(open_rows)} 名）— 角色 + 六個技能 slot",
        "",
    ]
    L += note([
        "選角畫面看得到、bot 也會抽到的就是這些。這是**營運策展狀態**，不是程式常數："
        f"真相在 `data/curation/whitelist.json`，由 platform 的 `GET /api/v1/curation/whitelist` "
        f"提供、game-server 在建房時執行。來源：{ctx['whitelist_note']}",
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

    L.append(
        f"> 📖 **完整 {len(champs)} 名英雄**（含 {closed_n} 名未開放）與逐欄資料（開放旗標、"
        f"技能 id、攻擊類型…）在 [`{DOC_ROSTER}`](./{DOC_ROSTER})。"
    )
    L.append("")
    L += provenance(ctx, f"開放 {len(open_rows)} / 全 {len(champs)} 名。")
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

    open_abil_n = sum(1 for a in abils if owner_of.get(a["id"]) in open_champ)

    L = [
        f"#### 技能 abilities（全 {len(abils)} 個；開放英雄的 {open_abil_n} 個）",
        "",
    ]
    L += note([
        "**開放英雄的每一個技能，都已經印在上面的開放名冊裡**（每名英雄六條：天生 ＋ "
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


GENERATORS = {"roster": gen_roster, "abilities": gen_abilities, "items": gen_items,
              "grail": gen_grail, "mechanics": gen_mechanics, "arenas": gen_arenas}


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
