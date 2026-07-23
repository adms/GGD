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
  content/abilities/*.json           -> the 554 per-slot ability docs
  content/items/*.json               -> the 214 item docs
  content/loot-tables/legendary-weapons.json -> the legendary pool
  data/curation/whitelist.json       -> OPEN roster / open items / open abilities
                                        (operator state, NOT part of the bundle;
                                         absent on a fresh clone -> everything
                                         renders as 未開放 and the header says so)

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
CONTENT = os.environ.get("GGD_CONTENT_DIR") or os.path.join(REPO, "content")
WHITELIST = os.path.join(REPO, "data", "curation", "whitelist.json")
OUTDIR = os.path.join(REPO, "docs", "reference")

CMD = "pnpm docs:reference"
SCRIPT = "tools/reference/gen_reference.py"

# The two prices a weapon may carry — packages/shared/src/sim/economy/itemTiers.ts:43-46.
TIER_PRICE = {"SIMPLE": 300, "POWERFUL": 1200}
LEGENDARY_POOL_TABLE = "legendary-weapons"
# The two shop SERVICES: real item docs that never occupy an inventory slot.
SERVICE_IDS = {"stat-attunement", "legendary-orb"}

SLOT_ORDER = {"Q": 0, "W": 1, "E": 2, "R": 3, "EX": 4}

STAT_LABEL = {
    "ad": "攻擊力",
    "ap": "法強",
    "armor": "護甲",
    "mr": "魔抗",
    "as": "攻速",
    "ms": "移速",
    "maxHealth": "生命",
    "maxMana": "魔力",
    "healthRegen": "回血",
    "manaRegen": "回魔",
    "critChance": "暴擊率",
    "critDamage": "暴擊傷害",
    "lifesteal": "吸血",
    "cdr": "冷卻縮減",
    "range": "射程",
}


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


def fmt_modifier(m):
    stat = m.get("stat")
    label = STAT_LABEL.get(stat, stat)
    val = m.get("value")
    if not isinstance(val, (int, float)):
        return f"{label} ?"
    if m.get("op") == "pctAdd":
        num = round(val * 100, 2)
    else:
        num = round(val, 2)
    if isinstance(num, float) and num.is_integer():
        num = int(num)
    sign = "+" if num >= 0 else ""
    return f"{label} {sign}{num}%" if m.get("op") == "pctAdd" else f"{label} {sign}{num}"


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

def gen_roster(ctx):
    champs = ctx["champions"]
    open_ids = ctx["open_champions"]

    def row(c):
        title, full = split_champion_name(c.get("name", ""))
        abils = c.get("abilities") or {}
        ids = []
        for slot in ("Q", "W", "E", "R"):
            a = abils.get(slot)
            if isinstance(a, dict) and a.get("id"):
                ids.append(f"`{a['id']}`")
        if c.get("exAbility"):
            ids.append(f"`{c['exAbility']}`")
        desc = one_line(c.get("description"), 46) or "—"
        return "| {id} | {full} | {title} | {role} | {atk} | {open_} | {desc} | {abils} |".format(
            id=f"`{c['id']}`",
            full=cell(full),
            title=cell(title),
            role=cell(c.get("role")),
            atk="近戰" if c.get("attackType") == "melee" else "遠程",
            open_="✅" if c["id"] in open_ids else "—",
            desc=cell(desc),
            abils=" ".join(ids) if ids else "—",
        )

    open_rows = [c for c in champs if c["id"] in open_ids]
    closed_rows = [c for c in champs if c["id"] not in open_ids]

    L = header(
        "英雄名冊 / Champion roster",
        f"`content/champions/*.json` 共 **{len(champs)}** 名英雄，其中 **{len(open_rows)}** 名在"
        "開放名單（OPEN roster）內。開放名單是營運策展狀態，不是程式常數：真相是 "
        "`data/curation/whitelist.json`，由 platform 的 `GET /api/v1/curation/whitelist` 提供，"
        "由 game-server 在建房時執行。",
        len(champs),
        ctx,
        extra_notes=[
            "`稱號` / `全名` 是從 `name` 欄位拆出來的（慣例 `稱號 - 全名`），"
            "champion doc 上**沒有**獨立的稱號欄位；不符慣例的會顯示 `—`。",
            "`名言` 不在 champion doc 裡 —— 它在 `docs/champions.csv` 與 "
            "`content/assets/audio/voices/quotes/quotes.json`。",
        ],
    )
    head = [
        "| id | 全名 | 稱號 | role | 攻擊 | 開放 | 一句話說明 | 技能 id（Q W E R EX） |",
        "|---|---|---|---|---|---|---|---|",
    ]

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
        m = HERO_NUMBER_RE.match((a.get("name") or "").strip())
        num = f"{m.group(1)}-{m.group(2)}" if m else "—"
        eff = one_line(a.get("description"), 62) or effect_summary(a) or "—"
        owner = owner_of.get(a["id"])
        return "| {id} | {name} | {slot} | {kind} | {num} | {owner} | {open_} | {eff} |".format(
            id=f"`{a['id']}`",
            name=cell(a.get("name")),
            slot=slot,
            kind="被動" if is_passive else cell(tag or "主動"),
            num=num,
            owner=(f"`{owner}` {cell(champ_name.get(owner, ''))}" if owner else "**（無主）**"),
            open_="✅" if a["id"] in open_abils else "—",
            eff=cell(eff),
        )

    counts = {}
    for a in abils:
        counts[a.get("slot")] = counts.get(a.get("slot"), 0) + 1
    census = "　·　".join(f"{s} {counts.get(s, 0)}" for s in ("Q", "W", "E", "R", "EX"))

    L = header(
        "技能總表 / Ability reference",
        f"`content/abilities/*.json` 共 **{len(abils)}** 份，每個英雄每個 slot 一份："
        f"{census}。",
        len(abils),
        ctx,
        extra_notes=[
            "`slot` 只有 Q/W/E/R/EX 五種 —— **被動不是一個 slot**，它掛在某個 QWER 技能上"
            "（`型態` 欄標「被動」的就是）。全樹沒有任何 `xx-00` 的被動技能文件。",
            "`編號` 是 w3x 作者的 `NN-0X` 慣例（EX 用三位數 `NN-00X`），"
            "由 `HERO_NUMBER_RE` 解析；非 w3x 原創英雄與少數格式異常的會顯示 `—`。",
            "`型態` 取自描述開頭的 w3x 分類標記（`[主動攻擊]`／`[輔助]`／`[被動]`…），"
            "沒有標記的一律顯示「主動」。",
        ],
    )
    L.append("| id | 名稱 | slot | 型態 | 編號 | 擁有者 | 開放 | 短效果 |")
    L.append("|---|---|---|---|---|---|---|---|")
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

    by_id = {i["id"]: i for i in items}

    def has_effect(i):
        return bool(i.get("modifiers")) or bool(i.get("passive"))

    def shop_label(i):
        if i["id"] in SERVICE_IDS:
            return "服務（不佔格）"
        if i["id"] in legendary:
            return "傳說（無價格）"
        cost = i.get("cost")
        if cost == TIER_PRICE["SIMPLE"] and has_effect(i):
            return "簡易 300g"
        if cost == TIER_PRICE["POWERFUL"] and has_effect(i):
            return "強力 1200g"
        return "未上架"

    def row(i):
        return "| {id} | {name} | T{tier} | {cost} | {shop} | {leg} | {open_} | {stats} | {passive} |".format(
            id=f"`{i['id']}`",
            name=cell(i.get("name")),
            tier=i.get("tier"),
            cost=i.get("cost"),
            shop=shop_label(i),
            leg="✅" if i["id"] in legendary else "—",
            open_="✅" if i["id"] in open_items else "—",
            stats=cell(fmt_modifiers(i)),
            passive=cell(fmt_passive(i)),
        )

    head = [
        "| id | 名稱 | tier | cost | 商店層級 | 傳說池 | 開放 | 屬性 modifiers | 被動 passive |",
        "|---|---|---|---|---|---|---|---|---|",
    ]

    services = [i for i in items if i["id"] in SERVICE_IDS]
    simple = [i for i in items if shop_label(i) == "簡易 300g"]
    powerful = [i for i in items if shop_label(i) == "強力 1200g"]
    legend = [i for i in items if i["id"] in legendary]
    listed = {i["id"] for i in services + simple + powerful + legend}
    rest = [i for i in items if i["id"] not in listed]

    L = header(
        "道具總表 / Item reference",
        # Must account for EVERY doc: services used to be omitted here, which
        # made the breakdown 2 short of len(items). See gen_readme_lists.py.
        f"`content/items/*.json` 共 **{len(items)}** 份。實際上架的商店只有 "
        f"**{len(simple) + len(powerful)}** 件（簡易 {len(simple)} + 強力 {len(powerful)}），"
        f"傳說池 **{len(legend)}** 件，商店服務 **{len(services)}** 件，"
        f"其餘 **{len(rest)}** 份是 w3x 匯入的殘件："
        "價格不在階梯上、或沒有任何 `modifiers` / `passive`，所以買不到。",
        len(items),
        ctx,
        extra_notes=[
            "只有兩種價格：**簡易 300g**、**強力 1200g**"
            "（`packages/shared/src/sim/economy/itemTiers.ts:43-46`）。"
            "**傳說沒有價格**，只能靠三選一卡或 2400g 的傳說寶玉抽到。",
            "「可買」的判定是**同時**滿足：價格等於某個階梯價 **且** 真的有效果"
            "（有 `modifiers` 或 `passive`）。有幾件 1200g 的 WC3 製作書沒有效果，因此不上架。",
            f"`tier` 欄是 doc 上的 1..5 分級，那是 w3x 匯入的遺留欄位，"
            f"**與價格階梯無關**；請看「商店層級」欄。",
            "`暴擊率` / `暴擊傷害` / `吸血` 的 `flat` 值是**小數比例**，不是百分點："
            "`暴擊率 +0.17` 就是 17%。標了 `%` 的欄位才是 `pctAdd`。",
            "背包 6 格、賣出退 40%（`packages/shared/src/sim/economy/shop.ts:11,18`）。",
        ],
    )

    L.append(f"## 1. 商店服務 services（{len(services)}）")
    L.append("")
    L.append("真的是 `item@1` 文件，但 `buyItem` 在進背包路徑前就攔截它們：不佔格、可重複買。")
    L.append("")
    L += head
    L += [row(i) for i in services]
    L.append("")

    L.append(f"## 2. 簡易 SIMPLE 300g（{len(simple)}）")
    L.append("")
    L += head
    L += [row(i) for i in simple]
    L.append("")

    L.append(f"## 3. 強力 POWERFUL 1200g（{len(powerful)}）")
    L.append("")
    L += head
    L += [row(i) for i in powerful]
    L.append("")

    L.append(f"## 4. 傳說池 legendary pool（{len(legend)}）")
    L.append("")
    L.append(
        f"`content/loot-tables/{LEGENDARY_POOL_TABLE}.json`，等權重抽取。買不到，"
        "只能從第 5 回合的武器三選一或傳說寶玉取得。"
    )
    L.append("")
    L += head
    L += [row(i) for i in legend]
    L.append("")

    missing = sorted(i for i in legendary if i not in by_id)
    if missing:
        L.append("> ⚠️ 傳說池引用了不存在的道具 id：" + ", ".join(f"`{m}`" for m in missing))
        L.append("")

    L.append(f"## 5. 未上架 not purchasable（{len(rest)}）")
    L.append("")
    L.append("價格不在階梯上、或沒有任何效果。留著是為了 w3x 對照與未來策展，不會出現在商店。")
    L.append("")
    L += head
    L += [row(i) for i in rest]
    L.append("")
    return "\n".join(L) + "\n", len(items)


# ---------------------------------------------------------------------------

def build_context():
    """Load content/ + the whitelist into the one dict every emitter reads.

    Split out of main() so a sibling generator can reuse it — tools/reference/
    gen_readme_lists.py embeds the same three lists into README.md. One loader,
    one set of conventions, no second source of truth."""
    manifest = load_json(os.path.join(CONTENT, "manifest.json"))
    if not manifest:
        sys.exit(f"missing {os.path.join(CONTENT, 'manifest.json')} — run `pnpm content:build` first")

    champions = load_collection("champions")
    abilities = load_collection("abilities")
    items = load_collection("items")

    pool_doc = load_json(os.path.join(CONTENT, "loot-tables", f"{LEGENDARY_POOL_TABLE}.json"), {})
    legendary_pool = {e["itemId"] for e in (pool_doc.get("entries") or []) if e.get("itemId")}

    wl = load_json(WHITELIST)
    if wl is None:
        whitelist_note = (
            "`data/curation/whitelist.json` **不存在**（全新 clone 的預設狀態）→ 全部顯示為未開放"
        )
        open_champions, open_items, open_abilities = set(), set(), set()
    else:
        whitelist_note = f"`data/curation/whitelist.json`（updatedAt `{wl.get('updatedAt', '?')}`）"
        open_champions = set(wl.get("champions") or [])
        open_items = set(wl.get("items") or [])
        open_abilities = set(wl.get("abilities") or [])

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
        if c.get("exAbility"):
            ability_owner[c["exAbility"]] = c["id"]

    ctx = {
        "contentVersion": manifest.get("contentVersion", "?"),
        "whitelist_note": whitelist_note,
        "champions": sorted(champions, key=lambda c: c["id"]),
        "abilities": abilities,
        "items": sorted(items, key=lambda i: i["id"]),
        "legendary_pool": legendary_pool,
        "open_champions": open_champions,
        "open_items": open_items,
        "open_abilities": open_abilities,
        "ability_owner": ability_owner,
        "champion_display": champion_display,
    }
    return ctx


def main():
    ctx = build_context()
    abilities = ctx["abilities"]

    os.makedirs(OUTDIR, exist_ok=True)
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
