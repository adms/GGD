#!/usr/bin/env python3
"""PASS 0 — the English visual-keyword layer of the two-pass icon method.

The single-pass method fed one HEAVY style prompt to text2img and the style
smothered the subject: every icon came back an unrecognisable abstract blob
(user: 完全看不出是什麼東西). The fix is to split the job:

  PASS 0 (this file)  Chinese name/description -> a SHORT English prompt naming a
                      CONCRETE, RECOGNISABLE subject and its REAL dominant colour.
                      Champions use the real character's features + colour
                      (夏娜 -> red hair + katana + flames, NEVER cyan). Items map
                      their FUNCTION/type to a concrete object (AD -> a steel
                      longsword; tank -> an iron shield; boots -> leather boots).
  PASS 1 (pipeline.generate)   text2img the subject CLEARLY — minimal style,
                      centred, plain background, readable silhouette.
  PASS 2 (pipeline.stylize)    img2img the pass-1 image with the JAPANESE-ANIME
                      STYLE prompt below at a moderate denoise, so the subject's
                      shape + colour are kept while the anime finish is applied.

Only the SUBJECT + COLOUR live here; the anime STYLE is PASS 2's job. Keeping
them apart is the whole point — mixing them is what broke the first attempt.
"""
from __future__ import annotations

import re

METHOD_VERSION = "twopass-v1"  # written into each PNG; bump to force regeneration

# ─────────────────────────────────────────────────────────── PASS 2 STYLE ──
# Japanese-anime finish (日本動漫風格), applied by img2img so it colours/【styles】
# the pass-1 subject instead of replacing it. Deliberately light on composition
# words — the composition already exists in the init image.
ANIME_STYLE = (
    "Japanese anime style, anime key visual, cel shading, clean bold line art, "
    "vibrant saturated colours, dramatic rim lighting, polished digital "
    "illustration, single subject centred, dark vignette background, "
    "video game icon"
)
ANIME_NEGATIVE = (
    "text, letters, words, watermark, signature, logo, border, frame, ui panel, "
    "multiple views, collage, split image, grid, blurry, lowres, deformed, "
    "extra limbs, extra fingers, mutated, photorealistic, 3d render, "
    "western cartoon, sketch, monochrome"
)


# ────────────────────────────────────────────────────────── CHAMPIONS ─────
# The mandatory champion set is fixed (2 hand-authored + 22 that lack extracted
# art), so a CURATED per-id map is the highest-quality PASS-0 source: real
# character features + the character's own dominant colour. Format:
#   id: (english subject with concrete visual traits, dominant colour phrase)
# Anything not listed falls back to name-morpheme heuristics below.
CHAMPION_SUBJECT: dict[str, tuple[str, str]] = {
    # hand-authored originals
    "sela": ("a female fire mage with a glowing ember staff, floating embers, "
             "fiery red-orange hair", "molten orange and red"),
    "thorne": ("a heavy knight in thorn-covered green armour, twisting bramble "
               "vines, a spiked shield", "deep forest green"),
    # imported, third-party-named -> real character features (LOCAL model, so no
    # cloud refusal; described by traits, not by franchise name)
    "godie-e00s": ("an ancient treant tree-spirit, gnarled wooden bark body, "
                   "glowing leaves and moss", "bark brown and green"),
    "godie-e00t": ("a creepy pale ghost girl, long straight black hair covering "
                   "her face, white burial dress", "pale white and black"),
    "godie-e00u": ("an elegant silver-haired maid throwing gleaming knives, "
                   "blue and white maid dress", "silver and blue"),
    "godie-e00v": ("a chubby cheerful yellow bear cub hugging a honey pot, tiny "
                   "red shirt", "honey yellow and red"),
    "godie-ecen": ("a striding dapper gentleman in a red tailcoat and black top "
                   "hat, walking cane, boots", "deep red and black"),
    "godie-efur": ("a bald elderly martial-arts assassin in a dark robe, sharp "
                   "eyes, wispy beard", "dark violet and grey"),
    "godie-ekee": ("a huge ornate legendary greatsword odachi with a wrapped "
                   "hilt, gleaming steel edge", "polished steel and gold"),
    "godie-h02k": ("a chubby giant panda bear standing upright, black and white "
                   "fur, bamboo", "black and white"),
    "godie-h02s": ("a grim death knight in dark spiked plate armour, glowing "
                   "eyes in a skull helm, a runeblade", "icy blue and violet"),
    "godie-h02u": ("a fluffy cream-coloured alpaca llama with a goofy calm face",
                   "cream white and tan"),
    "godie-h02v": ("a fluffy cream-coloured alpaca llama with a goofy calm face",
                   "cream white and tan"),
    "godie-h02z": ("a tough delinquent schoolboy with a blonde pompadour, open "
                   "school uniform, angry grin", "blonde yellow and red"),
    "godie-hgam": ("a cute quadruped reptile creature with a large green plant "
                   "bulb sprouting from its back", "turquoise and leaf green"),
    "godie-n00b": ("a round blue robot cat with a big white face, a red collar "
                   "and golden bell, a belly pocket", "bright blue and red"),
    "godie-n01l": ("a cheerful anime schoolgirl senpai in a sailor uniform, "
                   "long ponytail", "pink and white"),
    "godie-o02w": ("a wandering wuxia swordsman with a slim jian sword, flowing "
                   "robes, a wine gourd", "azure blue and white"),
    "godie-obla": ("a young farmhand with a wood axe, straw hat and overalls, "
                   "a chicken nearby", "earth brown and green"),
    "godie-ogld": ("a dapper gentleman in a black top hat and tuxedo flashing a "
                   "gleaming bright white smile", "black and gleaming white"),
    "godie-u00k": ("a towering dark death-lord, horned skull face, tattered "
                   "shroud, swirling dark energy", "violet-black and cyan"),
    "godie-udea": ("a plucky flying squirrel creature gliding with a cape-like "
                   "membrane, big eyes", "warm brown and cream"),
    "godie-usyl": ("a sleek biomechanical xenomorph alien, smooth elongated "
                   "black head, bared metallic teeth, clawed limbs",
                   "black and steel grey"),
    "godie-uwar": ("a cheerful anime chef holding up a giant golden meatball on "
                   "a skewer, apron and toque", "golden brown and white"),
}

# Fallback morpheme map for any champion not curated above (kept small; the
# curated map covers the whole mandatory set today).
CHAMP_FALLBACK_NOUN: list[tuple[str, str, str]] = [
    ("龍", "a fierce dragon warrior", "jade green"),
    ("狐", "a nine-tailed fox spirit person", "amber gold"),
    ("鬼", "a horned oni demon warrior", "crimson red"),
    ("劍", "an anime swordsman with a drawn sword", "steel blue"),
    ("刀", "an anime samurai holding a katana", "steel and red"),
    ("忍", "a masked ninja", "dark blue"),
    ("貓", "a cat-eared anime character", "grey and white"),
    ("熊", "a big bear character", "brown"),
]
ROLE_FALLBACK = {
    "mage": ("an anime mage holding a glowing staff", "arcane violet"),
    "marksman": ("an anime archer or gunner taking aim", "cool cyan"),
    "fighter": ("an anime warrior in light armour with a weapon", "steel and red"),
    "bruiser": ("a burly anime warrior in heavy armour", "steel grey"),
    "support": ("a gentle anime healer with a glowing light", "soft green"),
}


def _short_name(name: str) -> str:
    """`火霧戰士 - 夏娜` -> `夏娜` (the part after the last dash is the character)."""
    return (name or "").split("-")[-1].strip()


def champion_keywords(doc: dict) -> tuple[str, str, str]:
    """-> (english subject, dominant colour, signal)."""
    cid = doc.get("id") or ""
    if cid in CHAMPION_SUBJECT:
        subj, hue = CHAMPION_SUBJECT[cid]
        return subj, hue, "curated"
    short = _short_name(doc.get("name") or "")
    for morph, subj, hue in CHAMP_FALLBACK_NOUN:
        if morph in short:
            return subj, hue, "name"
    role = (doc.get("role") or "fighter").strip()
    subj, hue = ROLE_FALLBACK.get(role, ROLE_FALLBACK["fighter"])
    return subj, hue, "role"


# ─────────────────────────────────────────────────────────────── ITEMS ────
# Name-morpheme -> concrete object. The name is the strongest signal (a 矛 is a
# spear whatever its stats), so it wins; stats only pick the object when the name
# is opaque. Longer / more specific keys first.
ITEM_NAME_OBJECT: list[tuple[str, str]] = [
    ("蛇矛", "an ornate serpent-headed spear"), ("矛", "a long steel spear"),
    ("槍", "a long steel spear"),
    ("大刀", "a huge broad war blade"), ("刀", "a single-edged katana"),
    ("劍", "a straight steel longsword"), ("斬", "a slashing sword"),
    ("斧", "a heavy battle axe"), ("錘", "a spiked war hammer"),
    ("弓", "a curved wooden bow"), ("箭", "a sharp arrow"),
    ("盾", "a reinforced iron shield"), ("鎧", "a suit of plate armour"),
    ("甲", "a plated chest armour"), ("袍", "an enchanted robe"),
    ("靴", "a pair of leather boots"), ("鞋", "a pair of leather boots"),
    ("盔", "a steel helmet"), ("帽", "a pointed wizard hat"),
    ("手鐲", "an ornate golden bracelet"), ("鐲", "an ornate golden bracelet"),
    ("戒", "a glowing magic ring"), ("鍊", "a jewelled amulet necklace"),
    ("項鍊", "a jewelled amulet necklace"),
    ("寶石", "a large cut gemstone"), ("石", "a glowing enchanted gemstone"),
    ("珠", "a glowing magic orb"), ("球", "a glowing magic orb"),
    ("杖", "a topped magic staff"), ("錫杖", "a ringed monk's staff"),
    ("書", "a thick spellbook grimoire"), ("符", "a paper talisman"),
    ("旗", "a battle standard banner"), ("鼓", "a war drum"),
    ("藥", "a red potion bottle"), ("瓶", "a glass potion bottle"),
    ("酒", "a wine gourd flask"), ("丹", "a glowing round pill elixir"),
    ("面具", "a carved mask"), ("鏡", "a polished hand mirror"),
    ("鈴", "a small brass bell"), ("燈", "a glowing lantern"),
    ("翼", "a feathered wing charm"), ("羽", "a single feather"),
    ("爪", "a set of steel claws"), ("牙", "a curved fang"),
    ("冠", "a golden crown"), ("王冠", "a golden crown"),
    ("幣", "a stack of gold coins"), ("金", "a pile of gold"),
    ("卷軸", "a rolled scroll"), ("軸", "a rolled scroll"),
]

# Primary-stat -> (object when the name gave none, dominant colour). Order is
# the priority when an item has several modifiers.
STAT_OBJECT: list[tuple[str, str, str]] = [
    ("lifesteal", "a curved crimson vampiric fang", "blood crimson"),
    ("critChance", "a sharp gleaming dagger", "crimson and steel"),
    ("critDamage", "a sharp gleaming dagger", "crimson and steel"),
    ("ap", "a glowing arcane orb", "arcane violet"),
    ("maxMana", "a glowing blue mana crystal", "deep blue"),
    ("armor", "a heavy iron shield", "steel grey"),
    ("mr", "a warded rune shield", "teal and steel"),
    ("maxHealth", "a sturdy iron shield", "steel and red"),
    ("as", "a pair of steel claws", "cyan"),
    ("ms", "a pair of leather boots", "leather brown"),
    ("ad", "a steel longsword", "polished steel"),
    ("cdr", "an hourglass charm", "cyan"),
]

ARCHETYPE_HINT = {
    "傳說": "an ornate legendary weapon glowing with power",
    "夢幻": "a dreamlike ethereal relic",
    "神器": "an ornate divine relic",
}


def _first_line(desc: str) -> str:
    for ln in (desc or "").split("\n"):
        if ln.strip():
            return ln.strip()
    return ""


def item_keywords(doc: dict) -> tuple[str, str, str]:
    """-> (english subject object, dominant colour, signal)."""
    name = doc.get("name") or ""
    desc = doc.get("description") or ""
    mods = doc.get("modifiers") or []
    stats = [m.get("stat") for m in mods if m.get("stat")]

    # colour always follows the primary stat where there is one
    hue = "polished steel"
    for stat, _obj, h in STAT_OBJECT:
        if stat in stats:
            hue = h
            break

    # object: name morpheme first, then archetype, then primary stat, then a
    # generic relic. An active heal item (mana cost + restores HP, no modifiers)
    # reads as a potion.
    for morph, obj in ITEM_NAME_OBJECT:
        if morph in name:
            return obj, hue, "name"
    head = _first_line(desc)
    if head in ARCHETYPE_HINT:
        return ARCHETYPE_HINT[head], hue, "archetype"
    if not mods and ("恢復" in desc or "生命" in desc and "魔力" in _first_line(desc)):
        return "a glowing red healing potion bottle", "healing red", "active"
    for stat, obj, h in STAT_OBJECT:
        if stat in stats:
            return obj, h, "stat"
    return "an ornate adventuring relic", hue, "fallback"


# ────────────────────────────────────────────────────────────── AUGMENTS ──
AUG_TAG_OBJECT = {
    "defense": ("a glowing blue guardian shield rune", "steel blue"),
    "ad": ("a crossed pair of red steel blades", "crimson and steel"),
    "sustain": ("a glowing red heart with dripping vitality", "blood red"),
    "utility": ("a swirling arcane rune sigil", "cyan"),
    "ap": ("a glowing violet arcane orb", "arcane violet"),
    "as": ("a coiled spring of speed lines", "cyan"),
    "crit": ("a cracked spark of critical energy", "crimson"),
    "mobility": ("a winged boot emblem", "cyan"),
}
AUG_NAME_HINT: list[tuple[str, str, str]] = [
    ("aegis", "a glowing guardian shield", "steel blue"),
    ("shield", "a glowing guardian shield", "steel blue"),
    ("blood", "a dripping crimson fang", "blood red"),
    ("lust", "a burning red aura fist", "blood red"),
    ("chill", "a spiky blue ice crystal", "pale ice blue"),
    ("frost", "a spiky blue ice crystal", "pale ice blue"),
    ("flame", "a burning orange flame", "molten orange"),
    ("storm", "a crackling lightning bolt", "electric blue"),
]


def augment_keywords(doc: dict) -> tuple[str, str, str]:
    name = (doc.get("name") or "").lower()
    tags = [t.lower() for t in (doc.get("tags") or [])]
    for key, obj, hue in AUG_NAME_HINT:
        if key in name:
            return obj, hue, "name"
    for t in tags:
        if t in AUG_TAG_OBJECT:
            obj, hue = AUG_TAG_OBJECT[t]
            return obj, hue, "tag"
    return "a glowing heraldic power sigil", "cyan", "fallback"


# ────────────────────────────────────────────────── prompt assembly ──────
DERIVERS = {
    "champions": champion_keywords,
    "items": item_keywords,
    "augments": augment_keywords,
}


def pass1_prompt(family: str, doc: dict) -> tuple[str, str, str]:
    """The PASS-1 (subject) positive prompt + its negative + signal. Minimal
    style so the subject renders CLEARLY and recognisably."""
    subject, hue, signal = DERIVERS[family](doc)
    if family == "champions":
        pos = (f"anime character, {subject}, {hue} colour scheme, upper body "
               f"portrait, front view, centred, single character, simple plain "
               f"background, clear detailed face, full subject in frame")
    else:
        pos = (f"a single {subject}, {hue} colour scheme, centred, one object, "
               f"studio product shot, plain background, clear sharp silhouette, "
               f"full object in frame")
    neg = ("blurry, lowres, deformed, cropped, multiple objects, collage, text, "
           "watermark, frame, border, extra limbs, bad anatomy")
    return pos, neg, signal


def pass2_prompt(family: str, doc: dict) -> tuple[str, str]:
    """The PASS-2 (style) positive + negative. The subject's colour is echoed so
    img2img keeps the right hue while applying the anime finish."""
    _subject, hue, _signal = DERIVERS[family](doc)
    return f"{ANIME_STYLE}, {hue} accents", ANIME_NEGATIVE
