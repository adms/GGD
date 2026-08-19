#!/usr/bin/env python3
"""icon-gen prompt module — the PINNED image prompt and how a doc becomes one.

Every string a paid image model will ever see is defined here. This file is the
single point of change for art direction, and it is HASHED INTO EVERY SIDECAR
(see generate.py): editing `TEMPLATE_VERSION`, `PREFIX`, `NEGATIVE` or any
lexicon entry below invalidates the affected icons and they regenerate on the
next run. That is deliberate — art direction must never drift silently between
a batch that ran in July and one that resumes in August.

────────────────────────────────────────────────────────────────────────────
WHERE THE STYLE CAME FROM (task #72 phase 3)
────────────────────────────────────────────────────────────────────────────
All 113 extracted map icons were rendered and looked at. They split in two:

  * 85 CHAMPION portraits are cropped anime/manga screenshots (Naruto, Bleach,
    One Piece, Dragon Ball, Pokémon, Fate, Doraemon, Wolverine). Third-party
    art — which is why the Blizzard-stock audit never flagged them, and why
    they are NOT the house style.
  * the 15 ITEM + 13 ABILITY icons ARE the house style, and they agree with
    each other: one object on near-black, blade running lower-left to
    upper-right, cool rim light, exactly one saturated colour.

The prefix below is derived from those 28, not from the 85.

All 113 are 64x64 with the WC3 button BEVEL BAKED INTO THE PIXELS. That is the
reason `NEGATIVE` forbids a border or frame: bake a bevel in and the frame can
never be recoloured by rarity, and two different-rarity items look identical at
a glance. The frame belongs to the UI layer, not to the art.

────────────────────────────────────────────────────────────────────────────
EVERY PREFIX CLAUSE EXISTS TO PREVENT A SPECIFIC FAILURE
────────────────────────────────────────────────────────────────────────────
  "ONE subject, centred, ~80% of frame"  -> models love to answer an icon brief
                                            with a 2x2 sheet of variants.
  "Fixed lighting: warm key upper-left,  -> THE MAIN COHESION LEVER. 600 icons
   cyan rim lower-right"                    from one model drift in light
                                            direction; pinning it is what makes
                                            them read as one set.
  "flat near-black void #0B0E16"         -> the extracted 28 are on pure black.
                                            A light background also destroys the
                                            tile at 64px against a dark HUD.
  "ONE saturated accent hue"             -> lets the per-doc hue below be the
                                            thing that distinguishes icons.
  "chunky forms, no fine filigree" +     -> these are rendered at 26-52px in the
   "legible at 64 pixels"                   ability bar and shop rows. Detail
                                            that survives at 1024 is mud at 40.

────────────────────────────────────────────────────────────────────────────
TWO SUBJECT MODES
────────────────────────────────────────────────────────────────────────────
`derive_subject()` is the FREE, deterministic, offline path: a lexicon over the
doc's name. Phase 3 measured its ceiling honestly — 529 abilities collapse to
192 distinct fingerprints, and 邪王炎殺劍 vs 陽光烈焰 differ only by the name
inside the quotes, so they will very likely render the same picture.

So the runner also supports `--subject=text` : one cheap /ai/text call per doc
writes the subject line instead, cached and hash-sidecar'd exactly like the
image. The PREFIX and NEGATIVE are NEVER delegated — the invariants that make
the set cohere stay in code where they can be diffed.

RULES LEARNED BY GETTING THEM WRONG (do not "simplify" these away):
  * The NAME is matched FIRST. A version that matched the description turned
    妖狐變化 into "an impacting fist", because the mechanics boilerplate
    攻擊力 contains 擊.
  * Numbers are mechanics, never visuals — they are stripped before matching.
  * NO raw Chinese mechanics prose is ever forwarded to the image model. Only
    the name survives, inside 「」, as a proper noun.
"""
from __future__ import annotations

import re

# Bump when any pinned string below changes in a way that should force a
# regeneration. It is part of the sidecar hash.
TEMPLATE_VERSION = "icon-gen/1"

# ---------------------------------------------------------------- pinned ----

# ⭐ owner 2026-08-19：「請你幫我生成圖示得部分加註包含 prompt 都要 **FATE 風格**」
#    「我們擴充地圖物件跟生成圖片、貼圖也盡量 FATE 相關風格」
#
# ⚠️ FATE（型月／ufotable）的視覺語言與這份 PREFIX 的**可讀性條款直接衝突**，
#    而那些條款每一條都是為了擋一個量到的失敗（見上面的清單）：
#
#      FATE 想要                    64px 的現實
#      ─────────────────────       ─────────────────────────────────────
#      鎏金蕾絲、繁複雕花          → 26–52px 的技能列上是一團泥
#      魔法陣的細密符文            → 同上，而且會被模型當成「文字」
#      彩繪玻璃的細分割            → 同上
#
# ⇒ 解法**不是**在兩者之間妥協，是分清楚 FATE 的哪一半**撐得過縮圖**：
#
#      撐得過（＝寫進 PREFIX）      撐不過（＝寫進 NEGATIVE）
#      ─────────────────────       ─────────────────────────
#      三色調：金 × 靛藍 × 緋紅     鎏金蕾絲 / 細密符文 / 玻璃分割
#      魔力光點（藍白微塵上飄）     細碎裝飾線
#      令咒那種特定的朱紅          寫實質感
#      剪影層級的魔法陣光環        （光環只做輪廓，⛔ 不做符文）
#      ufotable 的高對比邊光       —
#
# ⛔ 所以「chunky forms, no fine filigree / legible at 64 pixels」**不可以拿掉** ——
#    它們是這一組圖示還讀得懂的原因，⛔ 不是風格偏好。
PREFIX = (
    "Fate-style anime game icon in the Type-Moon / ufotable visual language: "
    "hand-painted digital illustration, thick confident brush strokes with "
    "visible paint texture, heroic-spirit fantasy. "
    "ONE subject, centred, filling about 80% of a square frame, nothing cropped. "
    "Fixed lighting: warm gold key light from the upper left at 45 degrees, cool "
    "azure rim light down the lower-right edge, shadow pooling bottom-right. "
    "Background is a flat near-black void #0B0E16 with a single soft radial glow "
    "behind the subject, a faint concentric magic-circle halo read only as "
    "SILHOUETTE, and darkened corners. "
    "A few drifting blue-white prana motes rising from the lower edge. "
    "Palette: burnished gold and deep indigo base with muted steel and leather, "
    "lifted by exactly ONE saturated accent hue. "
    "Bold readable silhouette, high local contrast, chunky forms, no fine filigree. "
    "Painted to stay legible at 64 pixels."
)

NEGATIVE = (
    "Negative: no text, no letters, no numbers, no watermark, no signature; "
    "no border, no frame, no button bevel, no UI panel; "
    "no white or light background, no paper, no page drop-shadow; "
    "no collage, no multiple objects, no grid, no side-by-side variants; "
    "no photorealism, no 3D render, no studio product shot; "
    "no real-world brand or logo, no recognisable copyrighted character; "
    # ⭐ FATE 那一半撐不過縮圖的東西，逐條擋掉（見 PREFIX 上面的對照表）。
    # ⚠️ 「no runes / no inscribed symbols」同時擋掉兩件事：符文在 40px 是泥，
    #    而且圖像模型會把符文當成 text 的邀請 —— 上面已經有 no text 了，
    #    但實測「magic circle」這個詞會壓過它，所以要在這裡再擋一次。
    "no gilded lace, no baroque scrollwork, no fine ornamental linework; "
    "no runes, no inscribed symbols, no stained-glass tracery."
)

# ---------------------------------------------------------------- lexicon ---

# NAME lexicon: the highest-signal mapping there is. Chinese morpheme -> a
# CONCRETE English visual noun. Order matters — longer/more specific first.
NAME_NOUN: list[tuple[str, str]] = [
    ("妖狐", "a nine-tailed fox spirit"), ("狐", "a fox spirit"),
    ("龍", "a coiling eastern dragon"), ("鳳", "a phoenix"),
    ("虎", "a tiger"), ("熊", "a bear"), ("蛇", "a serpent"),
    ("鬼", "a horned oni mask"), ("魔", "a demonic sigil"),
    ("神", "a divine halo"), ("聖", "a radiant sunburst"),
    ("影", "a detaching shadow"), ("暗", "a smothering darkness"),
    ("血", "a spatter of dark blood"), ("骨", "bleached bone"),
    ("雷", "a forked lightning bolt"), ("電", "a forked lightning bolt"),
    ("火", "a gout of flame"), ("炎", "a gout of flame"), ("焰", "a gout of flame"),
    ("冰", "a cluster of ice shards"), ("霜", "a rime of frost"),
    ("凍", "a cluster of ice shards"),
    ("毒", "a drip of green venom"),
    ("風", "a curl of wind"), ("嵐", "a whirlwind"),
    ("光", "a lance of white light"), ("星", "a falling star"),
    ("月", "a crescent moon"), ("日", "a blazing sun"),
    ("葉", "a spinning razor leaf"), ("花", "a blossom"), ("種", "a seed pod"),
    ("刀", "a single-edged katana"), ("劍", "a straight sword"),
    ("斬", "a slashing blade arc"), ("拳", "a clenched fist"),
    ("爪", "a raking set of claws"), ("牙", "a bared fang"),
    ("箭", "a loosed arrow"), ("弓", "a drawn bow"),
    ("彈", "a bursting energy bullet"), ("砲", "a cannon blast"),
    ("炮", "a cannon blast"),
    ("氣", "a sphere of golden ki"), ("念", "a sphere of golden ki"),
    ("波", "a rolling energy wave"), ("盾", "a raised shield"),
    ("鎧", "a plated cuirass"), ("甲", "a plated cuirass"),
    ("書", "an open grimoire"), ("符", "a paper talisman"),
    ("眼", "a staring eye"), ("心", "a beating heart"),
    ("翼", "a spread wing"), ("羽", "a single feather"),
    ("鎖", "a length of chain"), ("錘", "a war hammer"),
    ("槍", "a long spear"), ("斧", "a broad axe"), ("杖", "a topped staff"),
    ("藥", "a stoppered potion"), ("酒", "a drinking gourd"),
    ("金", "a heap of gold"), ("幣", "a stack of coins"), ("寶", "a treasure"),
    ("鏡", "a polished mirror"), ("鈴", "a hanging bell"),
    ("霸", "a crowned overlord's sigil"), ("王", "a crown"),
    ("隱", "a dissolving cloaked figure"),
    ("治", "a bloom of green healing motes"),
    ("癒", "a bloom of green healing motes"),
    ("速", "streaking motion lines"), ("疾", "streaking motion lines"),
    ("變化", "a silhouette dissolving mid-transformation"),
    ("變身", "a silhouette dissolving mid-transformation"),
]

ELEMENT_HUE: list[tuple[str, str]] = [
    ("雷", "electric white-blue"), ("電", "electric white-blue"),
    ("火", "molten orange"), ("炎", "molten orange"), ("焰", "molten orange"),
    ("冰", "pale ice blue"), ("霜", "pale ice blue"), ("凍", "pale ice blue"),
    ("毒", "sickly green"), ("血", "deep crimson"),
    ("影", "violet-black"), ("暗", "violet-black"), ("鬼", "violet-black"),
    ("光", "radiant white-gold"), ("聖", "radiant white-gold"),
    ("風", "pale mint"), ("氣", "warm gold"), ("念", "warm gold"),
    ("治", "verdant green"), ("癒", "verdant green"),
    ("葉", "verdant green"), ("木", "verdant green"),
    ("水", "deep blue"), ("海", "deep blue"),
]

# A handful of docs are HAND-AUTHORED in English (sela, thorne, ember-rod,
# swift-boots, serrated-edge, ironhide-vest, legendary-orb…) and every one of
# them is on a live surface, so they are tier 1 and cannot be left to the
# "an adventuring relic named X" fallback. Matched case-insensitively, AFTER
# the Chinese lexicon (a doc is one or the other, never both).
NAME_NOUN_EN: list[tuple[str, str]] = [
    ("ember", "a smouldering ember"), ("flame", "a gout of flame"),
    ("frost", "a rime of frost"), ("ice", "a cluster of ice shards"),
    ("storm", "a forked lightning bolt"), ("thunder", "a forked lightning bolt"),
    ("bramble", "a knot of thorned briar"), ("thorn", "a knot of thorned briar"),
    ("serrated", "a saw-toothed blade"), ("edge", "a honed blade edge"),
    ("blade", "a straight sword"), ("sword", "a straight sword"),
    ("rod", "a topped rod"), ("staff", "a topped staff"), ("wand", "a slim wand"),
    ("boot", "a running boot"), ("vest", "a studded leather vest"),
    ("hide", "a studded leather vest"), ("plate", "a plated cuirass"),
    ("shield", "a raised shield"), ("orb", "a glowing orb"),
    ("gem", "a cut gemstone"), ("stone", "a cut gemstone"),
    ("ring", "a banded ring"), ("crown", "a crown"),
    ("fang", "a bared fang"), ("claw", "a raking set of claws"),
    ("bow", "a drawn bow"), ("arrow", "a loosed arrow"),
    ("sage", "an arcane focus"), ("knight", "a plated cuirass"),
]

ELEMENT_HUE_EN: list[tuple[str, str]] = [
    ("ember", "molten orange"), ("flame", "molten orange"), ("fire", "molten orange"),
    ("frost", "pale ice blue"), ("ice", "pale ice blue"),
    ("storm", "electric white-blue"), ("thunder", "electric white-blue"),
    ("bramble", "verdant green"), ("thorn", "verdant green"),
    ("venom", "sickly green"), ("poison", "sickly green"),
    ("blood", "deep crimson"), ("shadow", "violet-black"), ("dark", "violet-black"),
    ("holy", "radiant white-gold"), ("light", "radiant white-gold"),
    ("swift", "cyan"), ("iron", "steel grey"), ("steel", "steel grey"),
]

ITEM_ARCHETYPE = {
    "武器": "a weapon", "防具": "a piece of armour", "飾品": "a small worn trinket",
    "法器": "an arcane focus", "神器": "an ornate divine relic",
    "傳說": "a legendary relic wreathed in power",
    "夢幻": "a dreamlike ethereal relic",
    "特殊": "an odd one-off curio", "積分獎勵": "a trophy token",
    "任務": "a quest token",
}

STAT_HUE: list[tuple[str, str, str]] = [
    ("力量", "molten orange-gold", "heavy, thick, brutal mass"),
    ("敏捷", "cyan", "lean, keen, motion-streaked"),
    ("智慧", "violet", "arcane and weightless"),
    ("生命", "verdant green", "warm and vital"),
    ("魔力", "deep blue", "cool and luminous"),
    ("護甲", "steel grey", "plated and solid"),
    ("暴擊", "crimson", "sharp and violent"),
]

# The ability's own [tag] decides COMPOSITION — an active reads as the instant
# of the strike, a passive as a still emblem. That is the one signal in the
# description that is reliable, because the importer wrote it, not the map author.
ABILITY_COMP = {
    "主動攻擊": "the instant of the strike, energy bursting toward the viewer",
    "主動傷害": "the instant of the strike, energy bursting toward the viewer",
    "主動": "the instant of the strike, energy bursting toward the viewer",
    "被動": "a still heraldic emblem glowing faintly from within",
    "傷害加成": "a still heraldic emblem glowing faintly from within",
    "輔助": "a calm concentric aura or ward glyph",
    "輔助攻擊": "a calm concentric aura or ward glyph",
    "強化": "a calm concentric aura or ward glyph",
    "靈氣": "a calm concentric aura or ward glyph",
    "變身": "a silhouette caught mid-metamorphosis, dissolving into energy",
    "召喚": "a summoned creature's head and shoulders rising from smoke",
    "開關": "a rune toggled bright against its dark twin",
    "魔法書": "an open grimoire, pages lifting",
    "投影": "a translucent duplicate silhouette, ghosted and offset",
}

# Mechanics boilerplate, stripped BEFORE element matching. Without this the
# body match is dominated by stat words that appear in every single doc.
BOILER = [
    "攻擊力", "攻擊速度", "數值", "冷卻時間", "持續", "等級", "範圍", "移動速度",
    "生命值", "魔力值", "每秒", "點傷害", "點生命", "秒", "提升", "增加", "降低",
    "造成", "目標", "敵人", "附近", "獲得", "成長", "能力", "效果", "狀態",
]

_TAG_FALLBACK_NOUN = {
    "被動": "a carved heraldic crest",
    "輔助": "a protective ward ring",
    "變身": "a dissolving silhouette",
    "召喚": "a summoned beast's head",
}


# ------------------------------------------------------------- derivation ---

def clean_body(s: str) -> str:
    """Description with the [tag], every number and all boilerplate removed."""
    s = re.sub(r"^\[[^\]]*\]", "", s.strip())
    s = re.sub(r"\d+(\.\d+)?\s*(點|秒|%|％)?", "", s)
    for b in BOILER:
        s = s.replace(b, "")
    return re.sub(r"[\s*+\-()（）,，。、:：]+", " ", s).strip()


def _pick(table: list, text: str):
    for row in table:
        if row[0] and row[0] in text:
            return row[1]
    return None


def _pick_any(zh_table: list, en_table: list, text: str):
    """Chinese lexicon first, then the English one on the lowercased text. The
    hand-authored English docs are all tier 1, so leaving them on the generic
    fallback would put the weakest prompts on the most visible icons."""
    return _pick(zh_table, text) or _pick(en_table, (text or "").lower())


def strip_hero_number(name: str) -> str:
    """`22-01 鬼隱之擊` -> `鬼隱之擊` (the xx-0N convention is bookkeeping)."""
    return re.sub(r"^\d+-\d+\w*\s*", "", (name or "").strip()).strip()


def derive_ability(doc: dict) -> tuple[str, str, str]:
    """-> (subject clause, which signal fired, confidence)."""
    desc = (doc.get("description") or "").strip()
    name = strip_hero_number(doc.get("name") or "")
    m = re.match(r"\[([^\]]+)\]", desc)
    tag = m.group(1) if m else ""
    comp = ABILITY_COMP.get(tag, "a bold centred emblem of the effect")
    body = clean_body(desc)

    from_name = _pick(NAME_NOUN, name)
    noun = from_name or _pick(NAME_NOUN, body)
    hue = _pick(ELEMENT_HUE, name) or _pick(ELEMENT_HUE, body) or "cyan"
    if from_name:
        signal, conf = "name", "high"
    elif noun:
        signal, conf = "body", "medium"
    else:
        signal, conf = "tag-default", "low"
        noun = _TAG_FALLBACK_NOUN.get(tag, "a burst of focused energy")

    subject = (
        f"{noun}, composed as {comp}; the single accent hue is {hue}; "
        f"this is the martial-arts technique known as 「{name}」"
    )
    return subject, signal, conf


def derive_item(doc: dict) -> tuple[str, str, str]:
    """-> (subject clause, which signal fired, confidence)."""
    desc = (doc.get("description") or "").strip()
    name = (doc.get("name") or "").strip()
    lines = [ln.strip() for ln in desc.split("\n") if ln.strip()]
    head = lines[0] if lines else ""
    arch = ITEM_ARCHETYPE.get(head) or next(
        (v for k, v in ITEM_ARCHETYPE.items() if k in desc), None
    )
    stats = desc.split("效能")[1].split("解說")[0] if "效能" in desc else desc

    hue, motif = "cyan", "lean and keen"
    for key, h, mo in STAT_HUE:
        if key in stats:
            hue, motif = h, mo
            break

    noun = _pick_any(NAME_NOUN, NAME_NOUN_EN, name)
    ehue = _pick_any(ELEMENT_HUE, ELEMENT_HUE_EN, name)
    if ehue:
        hue = ehue

    if noun and arch:
        subject, signal, conf = f"{noun} — {arch} named 「{name}」", "name+category", "high"
    elif noun:
        subject, signal, conf = f"{noun}, an adventuring relic named 「{name}」", "name", "high"
    elif arch:
        subject, signal, conf = f"{arch} named 「{name}」", "category", "medium"
    else:
        subject, signal, conf = f"an adventuring relic named 「{name}」", "fallback", "low"

    return f"{subject}; {motif}; the single accent hue is {hue}", signal, conf


def derive_champion(doc: dict) -> tuple[str, str, str]:
    """Champion portraits are NOT generated by this batch — see plan.py's IP
    gate. The deriver exists so a future, IP-cleared run has one, and so the
    planner can show what it WOULD say."""
    name = (doc.get("name") or "").strip()
    # keep only the part after the last "-" (the character name), never the
    # 「(出自:…)」 source attribution
    short = name.split("-")[-1].strip() or name
    role = (doc.get("role") or "fighter").strip()
    noun = _pick_any(NAME_NOUN, NAME_NOUN_EN, short)
    hue = _pick_any(ELEMENT_HUE, ELEMENT_HUE_EN, short) or "cyan"
    base = f"an original {role} character portrait, head and shoulders, three-quarter view"
    # Only append a motif when one actually matched. The earlier version always
    # appended, which produced "a portrait … with a portrait as their motif".
    motif = f"; {noun} as their motif" if noun else ""
    signal, conf = ("name", "medium") if noun else ("role-default", "low")
    return f"{base}{motif}; the single accent hue is {hue}", signal, conf


DERIVERS = {
    "abilities": derive_ability,
    "items": derive_item,
    "champions": derive_champion,
}


def build_prompt(subject: str) -> str:
    """The complete, final string sent to the image model."""
    return f"{PREFIX} SUBJECT: {subject.strip().rstrip('.')}. {NEGATIVE}"


def derive(doc: dict, family: str) -> tuple[str, str, str]:
    """Doc + family -> (subject, signal, confidence). Deterministic, offline."""
    deriver = DERIVERS.get(family)
    if deriver is None:
        raise ValueError(f"unknown family {family!r}")
    return deriver(doc)


# --------------------------------------------------------- text-mode brief ---

# The /ai/text instruction used by `--subject=text`. It asks for ONE line and
# forbids the model from re-stating the style — the style is PREFIX's job and
# duplicating it dilutes the invariants.
TEXT_SYSTEM_FIELD = "icon subject line"
TEXT_INSTRUCTION = (
    "Write ONE English clause naming a single concrete visual object or moment "
    "to paint as this game icon, plus exactly one saturated accent colour. "
    "Under 25 words. No style words, no lighting, no background, no framing — "
    "those are fixed elsewhere. No numbers, no game statistics, no proper nouns "
    "from real-world franchises. Answer with the clause only."
)


def text_mode_context(doc: dict, family: str) -> str:
    """The doc context handed to /ai/text. Deliberately small: the name, the
    bracket tag and the CLEANED body — never the raw stat block."""
    name = strip_hero_number(doc.get("name") or "") if family == "abilities" else (doc.get("name") or "")
    desc = (doc.get("description") or "").strip()
    m = re.match(r"\[([^\]]+)\]", desc)
    parts = [f"kind: {family[:-1]}", f"name: {name}"]
    if m:
        parts.append(f"category: {m.group(1)}")
    body = clean_body(desc)
    if body:
        parts.append(f"flavour: {body[:300]}")
    return "\n".join(parts)
