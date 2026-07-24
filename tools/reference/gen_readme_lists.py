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

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import gen_reference as G  # noqa: E402  — sibling module, same directory

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

BLOCKS = ("roster", "abilities", "items")


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
    """Yield (slot, ability_doc) for Q/W/E/R (embedded in the champion doc) and
    EX (a ref resolved through ctx['ability_by_id']), in slot order, skipping
    empties."""
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
    """One '- **SLOT** 名稱：一行效果' bullet per ability. The NAME is the
    human-readable id (e.g. '22-01 鬼隱之擊'); the gist strips the [標籤]/冷卻
    boilerplate and truncates. This is cause #4: readable, not raw ids.

    Rendered as a nested bullet list under each champion — it reads cleanly on
    GitHub and, unlike a wide table cell holding five name+effect entries, never
    blows the table width."""
    out = []
    for slot, a in kit_slots(c, ctx):
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

    L = [
        f"#### 開放名單 OPEN roster（{len(open_rows)} 名）— 角色 + 技能",
        "",
    ]
    L += note([
        "選角畫面看得到、bot 也會抽到的就是這些。這是**營運策展狀態**，不是程式常數："
        f"真相在 `data/curation/whitelist.json`，由 platform 的 `GET /api/v1/curation/whitelist` "
        f"提供、game-server 在建房時執行。來源：{ctx['whitelist_note']}",
        "",
        "每名英雄一格：**`id` 全名**（稱號 · 職業 · 攻擊）— 一句話說明，底下五條是 Q/W/E/R/EX "
        f"的**技能名稱＋一行效果**。效果截斷到 {LIMIT_KIT_GIST} 字、說明截斷到 "
        f"{LIMIT_CHAMPION_DESC} 字，結尾的 `…` 是產生器加的。完整逐字內容在 "
        f"[`{DOC_ABILITIES}`](./{DOC_ABILITIES}) 或 <http://localhost:39527/#codex>。",
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
    census = " · ".join(f"{s} {counts.get(s, 0)}" for s in ("Q", "W", "E", "R", "EX"))

    open_abil_n = sum(1 for a in abils if owner_of.get(a["id"]) in open_champ)

    L = [
        f"#### 技能 abilities（全 {len(abils)} 個；開放英雄的 {open_abil_n} 個）",
        "",
    ]
    L += note([
        "**開放英雄的每一個技能，都已經印在上面的開放名冊裡**（每名英雄 Q/W/E/R/EX 五條，"
        "含名稱與一行效果）。這裡不再重印一次，只放全表的統計與連結，讓 README 保持精簡。",
        "",
        f"每個英雄每個 slot 一份：{census}。`slot` 只有 Q/W/E/R/EX 五種 —— **被動不是一個 slot**，"
        "它掛在某個 QWER 技能上（`型態` 欄標「被動」的就是）；全樹沒有任何 `xx-00` 被動技能文件。",
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
    L += note([
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
    section("🎴 三選一 draft — `craftRole:quest`",
            f"每回合三選一 draft 從這些抽（`content/loot-tables/{G.QUEST_POOL_TABLE}.json`；"
            "`仙后座` = `godie-i01s`）。**買不到，只能抽到。**", quest, price_override="抽卡")
    section("💎 傳說池 legendary pool",
            f"`content/loot-tables/{G.LEGENDARY_POOL_TABLE}.json`，等權重。只能從武器三選一或 "
            "2400g 傳說寶玉取得。", legend, price_override="抽卡")

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

GENERATORS = {"roster": gen_roster, "abilities": gen_abilities, "items": gen_items}


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
