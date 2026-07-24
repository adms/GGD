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

METHOD_VERSION = "twopass-v3"  # written into each PNG; bump to force regeneration

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
    # the last 4 champions without art. Their `description` is empty, so the NAME
    # is the only signal the doc has — curated here rather than left to the role
    # fallback, because these render in champ select and the login marquee.
    "godie-h02r": ("a friendly green dinosaur-toad creature with a large pink "
                   "flower and broad green leaves growing from its back",
                   "leaf green and pink"),
    "godie-u01f": ("a fierce bearded Chinese general in blackened lacquer armour, "
                   "wild glaring eyes, a serpent-headed spear",
                   "black and crimson"),
    "godie-h02n": ("a goofy grinning brawler with both fists raised in a taunt, "
                   "a dented helmet and a bandaged arm", "dull bronze and green"),
    "godie-u00b": ("a burly barbarian with a flying-squirrel gliding membrane "
                   "cape spread wide, big front teeth, a grin",
                   "warm brown and cream"),
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


# Two items lost their NAME in the w3x import — the `name` field is literally
# the doc id — so ITEM_NAME_OBJECT can never fire and they fall to their primary
# stat, which draws a shield for both. Their 解說 lore, however, names a concrete
# object outright, so the subject is curated from the doc's OWN text:
#   godie-i065 「從一枚強大戒指掉出來的寶石碎片」 -> a shard off a ring's gemstone
#   godie-i06p 「血羽是烏鴉族的聖物」            -> the crow clan's blood feather
# (The missing NAME is a content bug, not an icon bug — flagged, not fixed here.)
ITEM_ID_SUBJECT: dict[str, tuple[str, str]] = {
    "godie-i065": ("a chipped shard broken off a large red gemstone",
                   "deep crimson"),
    "godie-i06p": ("a glossy black crow feather tipped with blood",
                   "black and blood red"),
}


def item_keywords(doc: dict) -> tuple[str, str, str]:
    """-> (english subject object, dominant colour, signal)."""
    iid = (doc.get("id") or "").strip()
    if iid in ITEM_ID_SUBJECT:
        subj, hue = ITEM_ID_SUBJECT[iid]
        return subj, hue, "curated"
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
# The 21 augments are the 3-choose-1 DRAFT CARDS the player picks EVERY round —
# the single most-looked-at icon surface in the game (#110 makes the icon
# mandatory on the card). 21 docs is small enough to CURATE, which is what the
# champions did for exactly the same reason, and curation is the only way to
# guarantee 21 distinct pictures. The tag/name heuristics below stay as the
# fallback for augments added later (#149 wants the pool expanded).
#
# WHY THE HEURISTIC WASN'T ENOUGH: AUG_NAME_HINT is English-only, so the 15
# CHINESE-named augments could never match it, and AUG_TAG_OBJECT knows only
# 8 tags while the corpus actually uses `offense`, `on-hit`, `tempo`,
# `snowball`, `attack-speed`, `haste`, `cc`, `aoe`. Measured result: 8 of 21
# fell through to the SAME "a glowing heraldic power sigil" in cyan, and three
# more collapsed onto one shield rune — the bare-tile look the owner saw live.
AUGMENT_SUBJECT: dict[str, tuple[str, str]] = {
    # the four DEFENCE augments, deliberately drawn as four different objects
    "iron-bulwark": ("a riveted iron wall-plate tower shield", "steel grey"),
    "immortal-bulwark": ("a towering fortress rampart of gold-trimmed stone",
                         "radiant white-gold"),
    "guardian-ward": ("a hexagonal rune barrier glyph standing on edge",
                      "pale ice blue"),
    "aegis-surge": ("a domed energy shield bubble", "electric white-blue"),
    # arcane
    "arcane-focus": ("a floating faceted arcane crystal ringed by orbiting glyphs",
                     "arcane violet"),
    "arcane-haste": ("a winged hourglass trailing motion streaks", "cyan"),
    "arcane-overload": ("an overloading rune core cracking open with escaping "
                        "energy", "arcane violet"),
    "spell-blade": ("a sword blade inscribed with burning runes", "arcane violet"),
    # offence / attack speed
    "berserkers-fury": ("a pair of crossed war axes wreathed in raging aura",
                        "furious red"),
    "swift-strikes": ("a curved blade trailing motion streaks", "cyan"),
    "overdrive-engine": ("a glowing mechanical engine core with spinning gears "
                         "venting steam", "molten orange"),
    "bone-splitter": ("a cracked white femur bone", "bone white"),
    "storm-arrow": ("an arrow of compressed wind splitting the air",
                    "electric white-blue"),
    "hunters-instinct": ("a golden hawk's piercing eye", "amber gold"),
    "conqueror": ("a golden laurel victory crown", "warm gold"),
    # blood / sustain
    "blood-tyrant": ("a goblet brimming over with blood", "deep crimson"),
    "bloodlust": ("a dripping crimson fang", "blood red"),
    "soul-reaver": ("a curved reaper scythe blade trailing soul wisps",
                    "spectral pale cyan"),
    "vital-surge": ("a swelling green heart wrapped in rising vitality motes",
                    "verdant green"),
    # cold / control
    "chill-touch": ("a frost-rimed open hand", "pale ice blue"),
    "frost-shatter": ("a blue ice crystal blowing apart into shards",
                      "pale ice blue"),
}

AUG_TAG_OBJECT = {
    "defense": ("a glowing blue guardian shield rune", "steel blue"),
    "ad": ("a crossed pair of red steel blades", "crimson and steel"),
    "sustain": ("a glowing red heart with dripping vitality", "blood red"),
    "utility": ("a swirling arcane rune sigil", "cyan"),
    "ap": ("a glowing violet arcane orb", "arcane violet"),
    "as": ("a coiled spring of speed lines", "cyan"),
    "crit": ("a cracked spark of critical energy", "crimson"),
    "mobility": ("a winged boot emblem", "cyan"),
    # tags the live corpus actually uses that the map used to have no answer for
    "offense": ("a crossed pair of bared steel blades", "crimson and steel"),
    "on-hit": ("a rune flaring bright on a blade's impact point", "arcane violet"),
    "attack-speed": ("a curved blade trailing motion streaks", "cyan"),
    "haste": ("a winged hourglass trailing motion streaks", "cyan"),
    "tempo": ("a winged hourglass trailing motion streaks", "cyan"),
    "snowball": ("a golden laurel victory crown", "warm gold"),
    "cc": ("a shackled figure locked in place", "pale ice blue"),
    "aoe": ("an expanding ring of force flattening the ground", "molten orange"),
}
# Matched on BOTH language forms — the pool is mixed 中文/English (鐵壁護甲 /
# Bloodlust / 奧術專注) and an English-only table left every Chinese name on the
# generic fallback. Chinese morphemes first, then the lowercased English.
AUG_NAME_HINT: list[tuple[str, str, str]] = [
    # ── Chinese morphemes ────────────────────────────────────────────────
    ("壁壘", "a fortress rampart wall", "steel grey"),
    ("護甲", "a riveted iron wall-plate shield", "steel grey"),
    ("結界", "a hexagonal rune barrier glyph", "pale ice blue"),
    ("盾", "a raised guardian shield", "steel blue"),
    ("血", "a dripping crimson fang", "blood red"),
    ("噬", "a curved soul-devouring reaper blade", "spectral pale cyan"),
    ("魂", "a spectral soul wisp", "spectral pale cyan"),
    ("霜", "a blue ice crystal blowing apart", "pale ice blue"),
    ("冰", "a blue ice crystal blowing apart", "pale ice blue"),
    ("焰", "a burning orange flame", "molten orange"),
    ("火", "a burning orange flame", "molten orange"),
    ("雷", "a crackling lightning bolt", "electric white-blue"),
    ("風暴", "an arrow of compressed wind", "electric white-blue"),
    ("疾風", "a curved blade trailing motion streaks", "cyan"),
    ("奧術", "a faceted arcane focus crystal", "arcane violet"),
    ("奧能", "an overloading rune core", "arcane violet"),
    ("咒", "a rune-inscribed sword blade", "arcane violet"),
    ("狂戰", "crossed war axes wreathed in raging aura", "furious red"),
    ("怒", "crossed war axes wreathed in raging aura", "furious red"),
    ("暴君", "a goblet brimming over with blood", "deep crimson"),
    ("碎骨", "a cracked white femur bone", "bone white"),
    ("骨", "a cracked white femur bone", "bone white"),
    ("獵手", "a golden hawk's piercing eye", "amber gold"),
    ("征服", "a golden laurel victory crown", "warm gold"),
    ("引擎", "a mechanical engine core with spinning gears", "molten orange"),
    ("生命", "a swelling green heart", "verdant green"),
    ("湧動", "a swelling green heart", "verdant green"),
    # ── English ──────────────────────────────────────────────────────────
    ("aegis", "a glowing guardian shield", "steel blue"),
    ("shield", "a glowing guardian shield", "steel blue"),
    ("blood", "a dripping crimson fang", "blood red"),
    ("lust", "a burning red aura fist", "blood red"),
    ("chill", "a frost-rimed open hand", "pale ice blue"),
    ("frost", "a spiky blue ice crystal", "pale ice blue"),
    ("flame", "a burning orange flame", "molten orange"),
    ("storm", "a crackling lightning bolt", "electric blue"),
    # ── WIDENED for console-authored augments (#186) ──────────────────────
    # Every one of the 21 shipped augments is hard-coded in AUGMENT_SUBJECT, so
    # the tables above were only ever exercised by ids that already had a
    # curated answer. A card CREATED IN THE CONSOLE has no curated entry by
    # definition, so it lands here — and a measured probe (`thunder-sigil`)
    # fell straight through to the generic sigil, because "thunder" was absent
    # while "storm" was present. That is the 「根本不知道哪招是哪招」 failure
    # reproduced on brand-new content: unmatched cards all draw the SAME
    # heraldic sigil, so a draft screen of them is unreadable.
    #
    # ORDER IS LOAD-BEARING — `augment_keywords` returns on the FIRST substring
    # hit, so a longer key must precede any key contained within it
    # ("lightning" before "light", "frozen" before "rose"-style accidents).
    # Bare "ice" is deliberately NOT here: it fires inside justice/sacrifice.
    # Subjects deliberately REUSE the strings above so the pool keeps one
    # visual language instead of gaining a second, divergent one.
    ("lightning", "a crackling lightning bolt", "electric white-blue"),
    ("thunder", "a crackling lightning bolt", "electric white-blue"),
    ("bolt", "a crackling lightning bolt", "electric white-blue"),
    ("shock", "a crackling lightning bolt", "electric white-blue"),
    ("glacial", "a spiky blue ice crystal", "pale ice blue"),
    ("frozen", "a spiky blue ice crystal", "pale ice blue"),
    ("burn", "a burning orange flame", "molten orange"),
    ("ember", "a smouldering ember", "molten orange"),
    ("venom", "a dripping green poison fang", "toxic green"),
    ("poison", "a dripping green poison fang", "toxic green"),
    ("toxic", "a bubbling green toxin vial", "toxic green"),
    ("shadow", "a shrouded hooded figure dissolving into smoke", "void purple"),
    ("void", "a collapsing sphere of starless dark", "void purple"),
    ("dark", "a shrouded hooded figure dissolving into smoke", "void purple"),
    ("radiant", "a blazing holy sunburst", "radiant white-gold"),
    ("divine", "a blazing holy sunburst", "radiant white-gold"),
    ("holy", "a blazing holy sunburst", "radiant white-gold"),
    ("light", "a blazing holy sunburst", "radiant white-gold"),
    ("gale", "an arrow of compressed wind", "electric white-blue"),
    ("wind", "an arrow of compressed wind", "electric white-blue"),
    ("swift", "a curved blade trailing motion streaks", "cyan"),
    ("haste", "a winged hourglass trailing motion streaks", "cyan"),
    ("crit", "a cracked targeting reticle over a struck point", "crimson and steel"),
    ("precision", "a golden hawk's piercing eye", "amber gold"),
    ("hunter", "a golden hawk's piercing eye", "amber gold"),
    ("pierce", "a barbed armour-piercing spearhead", "steel grey"),
    ("thorn", "a ring of barbed iron thorns", "verdant green"),
    ("leech", "a goblet brimming over with blood", "deep crimson"),
    ("drain", "a goblet brimming over with blood", "deep crimson"),
    ("vital", "a swelling green heart", "verdant green"),
    ("regen", "a swelling green heart", "verdant green"),
    ("heal", "a swelling green heart", "verdant green"),
    ("soul", "a spectral soul wisp", "spectral pale cyan"),
    ("reaper", "a curved soul-devouring reaper blade", "spectral pale cyan"),
    ("bone", "a cracked white femur bone", "bone white"),
    ("fury", "crossed war axes wreathed in raging aura", "furious red"),
    ("rage", "crossed war axes wreathed in raging aura", "furious red"),
    ("berserk", "crossed war axes wreathed in raging aura", "furious red"),
    ("bulwark", "a riveted iron wall-plate tower shield", "steel grey"),
    ("rampart", "a fortress rampart wall", "steel grey"),
    ("barrier", "a hexagonal rune barrier glyph", "pale ice blue"),
    ("ward", "a hexagonal rune barrier glyph", "pale ice blue"),
    ("guard", "a raised guardian shield", "steel blue"),
    ("armor", "a riveted iron wall-plate shield", "steel grey"),
    ("armour", "a riveted iron wall-plate shield", "steel grey"),
    ("arcane", "a faceted arcane focus crystal", "arcane violet"),
    ("rune", "a rune-inscribed sword blade", "arcane violet"),
    ("spell", "a rune-inscribed sword blade", "arcane violet"),
    ("mana", "a floating blue mana orb", "arcane violet"),
    ("overload", "an overloading rune core", "arcane violet"),
    ("engine", "a mechanical engine core with spinning gears", "molten orange"),
    ("titan", "a colossal armoured gauntlet", "steel grey"),
    ("stone", "a jagged slab of grey rock", "stone grey"),
    ("earth", "a jagged slab of grey rock", "stone grey"),
    ("iron", "a riveted iron wall-plate shield", "steel grey"),
    ("steel", "a crossed pair of bared steel blades", "crimson and steel"),
    ("blade", "a crossed pair of bared steel blades", "crimson and steel"),
    ("conquer", "a golden laurel victory crown", "warm gold"),
    ("sigil", "a glowing heraldic power sigil", "cyan"),
    # ── Chinese morphemes the table above still lacked ────────────────────
    ("毒", "a dripping green poison fang", "toxic green"),
    ("影", "a shrouded hooded figure dissolving into smoke", "void purple"),
    ("暗", "a shrouded hooded figure dissolving into smoke", "void purple"),
    ("虛空", "a collapsing sphere of starless dark", "void purple"),
    ("聖", "a blazing holy sunburst", "radiant white-gold"),
    ("神聖", "a blazing holy sunburst", "radiant white-gold"),
    ("光", "a blazing holy sunburst", "radiant white-gold"),
    ("暴擊", "a cracked targeting reticle over a struck point", "crimson and steel"),
    ("致命", "a cracked targeting reticle over a struck point", "crimson and steel"),
    ("吸血", "a goblet brimming over with blood", "deep crimson"),
    ("荊棘", "a ring of barbed iron thorns", "verdant green"),
    ("治療", "a swelling green heart", "verdant green"),
    ("回復", "a swelling green heart", "verdant green"),
    ("穿透", "a barbed armour-piercing spearhead", "steel grey"),
    ("破甲", "a barbed armour-piercing spearhead", "steel grey"),
    ("鐵", "a riveted iron wall-plate shield", "steel grey"),
    ("鋼", "a crossed pair of bared steel blades", "crimson and steel"),
    ("岩", "a jagged slab of grey rock", "stone grey"),
    ("巨", "a colossal armoured gauntlet", "steel grey"),
    ("速", "a curved blade trailing motion streaks", "cyan"),
    ("迅", "a curved blade trailing motion streaks", "cyan"),
    ("爆", "an expanding ring of force flattening the ground", "molten orange"),
    ("刃", "a crossed pair of bared steel blades", "crimson and steel"),
    ("劍", "a crossed pair of bared steel blades", "crimson and steel"),
    ("法力", "a floating blue mana orb", "arcane violet"),
]


def augment_keywords(doc: dict) -> tuple[str, str, str]:
    aug_id = (doc.get("id") or "").strip()
    if aug_id in AUGMENT_SUBJECT:
        subj, hue = AUGMENT_SUBJECT[aug_id]
        return subj, hue, "curated"
    name = doc.get("name") or ""
    tags = [t.lower() for t in (doc.get("tags") or [])]
    for key, obj, hue in AUG_NAME_HINT:
        if key in name or key in name.lower():
            return obj, hue, "name"
    for t in tags:
        if t in AUG_TAG_OBJECT:
            obj, hue = AUG_TAG_OBJECT[t]
            return obj, hue, "tag"
    return "a glowing heraldic power sigil", "cyan", "fallback"


# ───────────────────────────────────────────────────────────── ABILITIES ──
# 516 of the 602 missing icons are abilities, so PASS 0 for this family is the
# whole job. The lexicon that already exists in ../src/prompt.py (NAME_NOUN /
# ELEMENT_HUE, written against these very docs) is the base; ABILITY_NOUN_EXTRA
# below only WIDENS it, because on the real corpus 86 abilities matched nothing
# and would all have prompted the same "a burst of focused energy".
#
# Signal order, strongest first: the ability's own NAME -> its DESCRIPTION ->
# its damage type. Nothing generic is used while a real signal is available.
import prompt as _prompt  # ../src is already on sys.path (batch.py inserts it)

ABILITY_NOUN_EXTRA: list[tuple[str, str]] = [
    # ── 天生技 / PASSIVE-doc cluster-breakers ────────────────────────────────
    # The 108 `*.passive.json` docs are a corpus the lexicon had never seen. 48
    # of them are TRUE passives (`innateKind: "passive"`) with `effects: []` and
    # NO vfxKey, so neither the shape clause nor the damage-type hue can fire —
    # the NAME is the only signal, and it is a rich one. These entries were
    # written against the MEASURED output: every one below replaces a subject
    # that was demonstrably wrong (a body-text false positive, or a collision).
    # Longest/most specific first, as everywhere else in this table.
    ("四次元口袋", "a magic belly pocket opening onto a starry void"),  # was 口 -> jaws
    ("觀音大士", "a serene bodhisattva statue"),      # was 音 -> musical notes
    ("木乃伊", "a bandaged mummy"),
    ("憤怒的門牙", "a snarling mouth of bared white teeth"),  # was 怒 -> berserk figure
    ("感應意脈", "a network of glowing meridian lines across an open palm"),
    ("十二道試煉", "a ring of twelve engraved ordeal marks"),
    ("永久性的隱形術", "a figure fading into full invisibility"),
    ("薔薇荊棘之刃", "a thorned rose stem with a razor blade edge"),
    ("相轉移裝甲", "a shimmering phase-shifting armour plate"),
    ("銀色甲胄", "a suit of silver plate armour"),
    ("龍紋記憶", "a dragon-crest tattoo etched into skin"),   # vs 青龍槍術 below
    ("青龍槍術", "a spear wreathed in a coiling azure dragon"),
    ("撲殺爪擊", "a pouncing set of raking claws"),           # was 殺 -> strike burst
    ("北斗", "a seven-star big dipper burning over a clenched fist"),
    ("飛將神弓", "a great ornate war bow drawn taut"),        # was 飛 -> winged form
    ("無限再生", "torn flesh knitting itself endlessly back together"),
    ("再生能力", "a wound closing over as new flesh grows"),  # was 鐵(body) -> steel bar
    ("古老智慧", "a long-bearded elder sage's face"),         # was 飛(body) -> winged form
    ("獸化心靈", "a snarling half-beast transformed face"),
    ("賽亞人的血脈", "a spatter of dark blood over a warrior's crest"),
    ("暗夜契約", "a signed blood-pact scroll under a night sky"),
    ("黑化之力", "a figure being consumed by corrupting darkness"),
    ("正妹優勢", "a dazzling wink with a sparkle"),
    ("可愛就是正義", "a heart-shaped badge of justice"),
    ("裝可愛", "a coquettish cutesy pose ringed with sparkles"),
    ("憂鬱的眼神", "a pair of sad drooping downcast eyes"),
    ("邪眼全開", "a wide-open evil eye ringed with dark veins"),
    ("石化之眼", "a stone-grey petrifying eye"),
    ("寫輪眼", "a red eye with three spinning comma marks"),
    ("灼眼", "a blazing burning eye"),
    ("鬼眼", "a horned demon's glaring eye"),
    ("開設雜貨店", "a little general-store stall hung with goods"),
    ("開瓶特技", "a bottle uncorked, cap flying off"),
    ("天香斷續膠", "an open jar of medicinal healing salve"),
    ("吃洨火鍋", "a bubbling hot pot on a burner"),
    ("攝影機", "a boxy hand-cranked film camera"),           # was 影 -> shadow
    ("芬多精", "a burst of fresh forest air motes among pine needles"),
    ("砍樹", "an axe biting deep into a tree trunk"),
    ("三刀流", "three katana held in a three-sword stance"),
    ("百連", "a hundred-hit chain of rapid strikes"),
    ("猜猜拳", "a rock-paper-scissors hand sign"),
    ("小考", "a marked exam paper"),
    ("淨化", "a cleansing burst of white purifying motes"),
    ("機警", "a pricked-up alert ear"),                      # was 盾(body) -> shield
    ("通靈", "a medium's hand cupping a glowing spirit wisp"),
    ("JENOVA", "an alien crystalline womb pod"),
    ("二檔", "a body venting pressurised steam"),
    ("怒斬", "a furious downward blade slash"),              # vs 暴走 berserk figure
    ("閃擊", "a blinding lightning-fast lunge"),
    ("玄武", "a black tortoise-serpent guardian beast"),
    ("恰恰", "a pair of dancing cha-cha shoes"),
    ("SM派對", "a studded leather collar and buckled cuffs"),
    ("龍捲風", "a towering tornado funnel"),                  # was 龍 -> dragon
    ("飛葉", "a spinning razor leaf"),                        # was 飛 -> winged form
    ("麻痺粉", "a drifting cloud of paralysing spores"),
    ("祕技", "a secret-technique hand seal"),
    # ── cluster-breakers (added when the corpus was measured) ────────────────
    # Each of these was written because a MEASURED collision cluster needed
    # splitting: 18 abilities all prompted "a forked lightning bolt", 15 "a
    # sphere of golden ki", 15 "a grinning skull", 13 "a berserk figure". The
    # compound is the real subject; the bare element only ever supplied the hue.
    # LIGHTNING cluster
    ("陽電子砲", "a heavy positron cannon"),
    ("光束炮", "a heavy plasma beam cannon"),
    ("光束砲", "a heavy plasma beam cannon"),
    ("電漿", "a writhing coil of plasma"),
    ("千鳥", "a bird-shaped crackling blade held in an open palm"),
    ("伏特", "a crackling voltage arc leaping between two points"),
    ("詭雷", "a hidden proximity mine"),
    ("落雷", "a lightning strike hammering down from above"),
    ("一閃", "a single blinding flash of a drawn blade"),
    ("絕招", "a finishing signature strike"),
    ("投擲", "a thrown weapon spinning in flight"),
    # KI / AURA cluster
    ("氣功", "a channelled energy beam fired from cupped palms"),
    ("霸氣", "an overpowering conqueror's aura"),
    ("戰氣", "a blazing battle aura"),
    ("念力", "an object held aloft by telekinetic force"),
    ("發勁", "a short explosive open-palm strike"),
    ("採藥", "a gathered medicinal herb"),
    ("綁架", "a bound captive slung in a sack"),
    # DEATH / VOID cluster
    ("死神", "a hooded reaper holding a scythe"),
    ("亡靈大軍", "a rising horde of undead soldiers"),
    ("亡靈", "a rising horde of undead soldiers"),
    ("筆記本", "a black leather notebook"),
    ("產卵", "a clutch of glistening eggs"),
    ("蛻變", "a splitting chrysalis"),
    ("隕落", "a body falling wreathed in dark energy"),
    ("漫延", "a creeping spreading blight"),
    ("規則", "a written list of rules on a page"),
    ("召喚", "a glowing summoning circle"),
    ("肘擊", "a driving elbow strike"),
    # BERSERK cluster
    ("頭槌", "a driving headbutt"),
    ("胸毛", "a bristling tuft of chest hair"),
    ("菊花", "a chrysanthemum bloom"),
    ("簡諧", "a swinging pendulum"),
    ("怪物", "a hulking monster"),
    ("戰士", "an armoured warrior"),
    ("皮卡", "a small yellow electric rodent"),
    # FIRE cluster
    ("火球", "a hurled fireball"),
    ("火箭", "a launched rocket"),
    ("火車", "a charging steam locomotive"),
    ("火遁", "a ninja hand seal breathing fire"),
    ("烈焰", "a towering column of flame"),
    # broadly useful compounds
    ("流星", "a streaking meteor"), ("隕石", "a falling meteor"),
    ("夜行", "a procession of night spirits"),
    ("九頭", "a nine-headed serpent"),
    ("天翔", "a soaring leap arcing through the sky"),
    ("盤根", "a mass of gnarled grasping roots"),
    ("理財", "a stack of coins beside an open ledger"),
    ("習慣", "a repeating tally of marks"),
    ("戟", "a crescent-bladed halberd"), ("鏢", "a spinning throwing star"),
    ("扇", "a folding war fan"), ("傘", "an opened parasol"),
    ("笛", "a wooden flute"), ("針", "a driven needle"),
    ("繩", "a coiled rope"), ("盒", "a lacquered box"),
    ("飛", "a soaring winged form"),
    # ── original entries ─────────────────────────────────────────────────────
    # multi-character, most specific first
    ("草泥馬", "a spitting alpaca"), ("羊駝", "a spitting alpaca"),
    ("壽司", "a piece of nigiri sushi"), ("豆皮", "a piece of nigiri sushi"),
    ("餅乾", "a round biscuit cookie"), ("料理", "a steaming cooked dish"),
    ("便當", "a packed lunch box"), ("肉", "a roasted meat haunch"),
    ("靈壓", "a crushing wave of spirit pressure"),
    ("屏障", "a hexagonal energy barrier"), ("結界", "a hexagonal energy barrier"),
    ("護盾", "a raised shield"), ("障壁", "a hexagonal energy barrier"),
    ("地裂", "a cracked splitting earth fissure"),
    ("大地", "a cracked splitting earth fissure"),
    ("岩", "a jagged boulder"), ("石", "a jagged boulder"),
    ("土", "a heaved mound of earth"), ("砂", "a swirl of sand"),
    ("沙", "a swirl of sand"),
    ("鋼", "a bar of gleaming steel"), ("鐵", "a bar of gleaming steel"),
    ("尾", "a lashing tail"), ("鞭", "a cracking whip"),
    ("藤", "a snaking thorned vine"), ("荊", "a knot of thorned briar"),
    ("棘", "a knot of thorned briar"), ("刺", "a row of driven spikes"),
    ("釘", "a row of driven spikes"), ("樹", "a gnarled tree"),
    ("根", "a mass of grasping roots"), ("木", "a gnarled tree"),
    ("種", "a seed pod"), ("草", "a tuft of grass blades"),
    ("束縛", "a tangle of binding cords"), ("縛", "a tangle of binding cords"),
    ("鎖鏈", "a length of chain"), ("纏", "a tangle of binding cords"),
    ("死亡", "a grinning skull"), ("亡", "a grinning skull"),
    ("死", "a grinning skull"), ("屍", "a grinning skull"),
    ("獄", "a barred hell gate"), ("地獄", "a barred hell gate"),
    ("握", "a clutching skeletal hand"), ("掌", "an open striking palm"),
    ("指", "a pointing finger of force"),
    ("吞", "a set of gaping jaws"), ("噬", "a set of gaping jaws"),
    ("吃", "a set of gaping jaws"), ("食", "a set of gaping jaws"),
    ("口", "a set of gaping jaws"),
    ("分身", "a row of identical ghosted duplicates"),
    ("幻影", "a ghosted after-image silhouette"),
    ("幻", "a ghosted after-image silhouette"),
    ("虛空", "a tear of empty void"), ("空", "a tear of empty void"),
    ("消失", "a figure dissolving into motes"),
    ("暴走", "a berserk figure wreathed in raging aura"),
    ("怒", "a berserk figure wreathed in raging aura"),
    ("狂", "a berserk figure wreathed in raging aura"),
    ("恐懼", "a screaming spectral face"), ("驚", "a screaming spectral face"),
    ("懼", "a screaming spectral face"),
    ("門", "an opening portal doorway"), ("界", "an opening portal doorway"),
    ("絲", "a spun web of silk"), ("網", "a spun web of silk"),
    ("丸", "a compressed sphere of energy"), ("彈丸", "a compressed sphere of energy"),
    ("環", "a closing ring of energy"), ("圈", "a closing ring of energy"),
    ("陣", "a drawn magic circle"), ("印", "a glowing seal sigil"),
    ("封", "a glowing seal sigil"), ("咒", "a glowing curse sigil"),
    ("力量", "a flexed muscular arm"), ("強化", "an upward power aura"),
    ("必殺", "a finishing strike burst"), ("殺", "a finishing strike burst"),
    ("斬擊", "a slashing blade arc"), ("擊", "an impact shockwave"),
    ("撞", "an impact shockwave"), ("震", "an impact shockwave"),
    ("爆", "a bursting explosion"), ("裂", "a splitting crack"),
    ("步", "streaking motion lines"), ("走", "streaking motion lines"),
    ("跳", "a leaping silhouette"), ("躍", "a leaping silhouette"),
    ("鎧甲", "a plated cuirass"), ("裝甲", "a plated cuirass"),
    ("旗", "a battle standard banner"), ("鼓", "a war drum"),
    ("歌", "floating musical notes"), ("音", "floating musical notes"),
    ("聲", "concentric sound rings"), ("吼", "a roaring open maw"),
    ("笑", "a mocking grinning mask"), ("淚", "a falling teardrop"),
    ("愛", "a glowing heart"), ("心", "a beating heart"),
    ("吻", "a glowing lip mark"),
    ("錢", "a stack of coins"), ("賭", "a pair of dice"),
    ("命", "a flickering life flame"), ("運", "a spinning fortune wheel"),
    ("時", "an hourglass"), ("鐘", "a clock face"),
    ("速", "streaking motion lines"),
    ("弱肉強食", "a set of gaping jaws"),
    ("學習", "an open study book"), ("點名", "a checked name roster"),
    ("母體", "a pulsing organic core"),
    # hand-authored English docs
    ("barkskin", "a shell of thick tree bark"), ("bulwark", "a raised shield"),
    ("thorn", "a knot of thorned briar"), ("bramble", "a knot of thorned briar"),
    ("lash", "a cracking whip"), ("snare", "a tangle of binding cords"),
    ("root", "a mass of grasping roots"), ("scorch", "a scorched ring of fire"),
    ("firestorm", "a swirling firestorm"), ("ember", "a smouldering ember"),
    ("bolt", "a hurled energy bolt"), ("burst", "a bursting explosion"),
    ("ring", "a closing ring of energy"), ("ward", "a protective ward ring"),
]

ABILITY_HUE_EXTRA: list[tuple[str, str]] = [
    # colour words the 天生技 names use. A true passive has `effects: []` and no
    # vfxKey, so without these it lands on DAMAGE_HUE's "cyan" default — which is
    # what put 銀色甲胄 (a SILVER cuirass) and 紅色龍氣 (a RED dragon aura) on the
    # same generic cyan as everything else.
    ("銀色", "lustrous silver"), ("銀", "lustrous silver"),
    ("紅色", "deep crimson"), ("紅", "deep crimson"),
    ("薔薇", "crimson and verdant"), ("灼", "molten orange"),
    ("青龍", "azure blue"), ("蒼", "azure blue"),
    ("黑化", "void violet-black"), ("暗夜", "midnight indigo"),
    ("憂鬱", "melancholy slate blue"), ("可愛", "rose pink"),
    ("石", "earthen brown"), ("岩", "earthen brown"), ("土", "earthen brown"),
    ("地裂", "earthen brown"), ("砂", "sandy ochre"), ("沙", "sandy ochre"),
    ("鋼", "steel grey"), ("鐵", "steel grey"), ("刃", "steel grey"),
    ("藤", "verdant green"), ("荊", "verdant green"), ("棘", "verdant green"),
    ("樹", "verdant green"), ("根", "verdant green"), ("草", "verdant green"),
    ("死", "bone white and violet"), ("亡", "bone white and violet"),
    ("屍", "bone white and violet"), ("獄", "hellish red-black"),
    ("靈", "spectral pale cyan"), ("魂", "spectral pale cyan"),
    ("幻", "spectral pale cyan"), ("虛空", "void violet-black"),
    ("愛", "rose pink"), ("心", "rose pink"), ("吻", "rose pink"),
    ("金", "warm gold"), ("錢", "warm gold"), ("寶", "warm gold"),
    ("毒", "sickly green"), ("酸", "sickly green"),
    ("音", "luminous magenta"), ("歌", "luminous magenta"),
    ("怒", "furious red"), ("狂", "furious red"), ("暴", "furious red"),
]

# ── vfxKey: the VFX lane's own element+shape classification, reused verbatim ──
# Every one of the 516 planned abilities carries a `vfxKey` (145 distinct), and
# it is the ONE orthogonal signal the name lexicon does not already have: the
# name says WHAT, the key says WHAT SHAPE it takes on screen. Folding the shape
# into the subject is what stops 18 lightning abilities from all prompting "a
# forked lightning bolt" — a lightning BEAM and a lightning NOVA are different
# pictures, and the arena already renders them as different pictures.
# EVERY form is phrased as a BACKDROP ("with … behind it"), never as an
# appositive ("…, radiating as a soft concentric aura"). That grammar matters
# more than the words: an appositive re-heads the noun phrase, so SD drew the
# SHAPE and dropped the subject — 仙氣．採藥 ("a gathered medicinal herb") and
# 火羽 ("a single feather") both came back as identical gold mandalas, and
# 拔焰刀 ("a single-edged katana") came back as a bare orange slash with no
# blade. 53% of the 529 abilities take the two radial forms (pulse/nova), so
# that one grammatical slip was collapsing half the ability bar into the same
# concentric-ring picture. Demoted to a trailing "with …", the concrete noun
# stays the head and actually renders, while the shape still reads.
VFX_SHAPE_FORM = {
    "beam": "with a long straight lance of energy streaking out behind it",
    "bolt": "with one compact bolt of energy trailing behind it",
    "nova": "with an expanding ring of light bursting out behind it",
    "pulse": "with a soft glowing aura pulsing behind it",
    "explosion": "with a violent burst of light behind it",
    "shockwave": "with a shockwave rolling outward behind it",
    "slash": "with a crescent slash arc sweeping behind it",
    "swarm": "with a swarm of scattering shards around it",
    "tornado": "with a whirling vortex spiralling behind it",
    "dash": "with a streaking dash trail behind it",
    "summon": "with summoning smoke rising around it",
}
# The non-`fx.prim.*` keys are the hand-authored effects; they name their own shape.
VFX_NAMED_FORM = {
    "fx.scorch-ring": "burning as a scorched ring on the ground",
    "fx.ember-bolt": "hurled as one compact ember bolt",
    "fx.ember-bolt-cast": "gathering in a cupped hand before release",
    "fx.firestorm": "swirling as a firestorm column",
    "fx.cinder-ward": "held steady as a protective ward ring",
    "fx.root-snare": "erupting as grasping roots from the ground",
    "fx.thorn-lash": "lashing out as a thorned whip",
    "fx.bramble-burst": "bursting open as a bramble thicket",
    "fx.barkskin": "hardening into a shell of thick bark",
    "fx.basic-attack": "delivered as a plain committed strike",
}
# Size reads as INTENSITY, never as scale: "huge and overwhelming" fought
# PASS-1's own "full subject in frame" and pushed the subject off the edges.
VFX_SIZE_FORM = {"-lg": "brilliant and intense", "-sm": "small and tightly focused"}

# vfx element -> hue. Ranked ABOVE the description-derived hue, because the
# description is mechanics prose: 天翔龍閃 (an arcane dragon slash) was picking
# up "rose pink" from a stray 心 in its stat block.
VFX_ELEMENT_HUE = {
    "fire": "molten orange", "ice": "pale ice blue",
    "lightning": "electric white-blue", "holy": "radiant white-gold",
    "void": "void violet-black", "arcane": "arcane violet",
    "nature": "verdant green", "earth": "earthen brown",
    "wind": "pale mint", "blood": "deep crimson", "ki": "warm gold",
    "sound": "luminous magenta", "physical": "steel and crimson",
}

# Morphemes whose whole visual contribution is ALREADY carried by the hue. They
# are skipped on the first noun pass so a compound name yields its concrete
# object instead of its element: 雷鳴劍 -> "a straight sword" (electric
# white-blue), not a 4th identical "forked lightning bolt". They are still
# matched on the second pass, so a name that is ONLY an element still resolves.
ELEMENT_MORPHEMES = {
    "雷", "電", "火", "炎", "焰", "冰", "霜", "凍", "毒", "風", "光", "暗",
    "影", "血", "聖", "神", "魔", "鬼", "氣", "念", "水", "海", "木", "土",
    "石", "岩", "金",
}


def _non_element(table: list[tuple[str, str]]) -> list[tuple[str, str]]:
    return [row for row in table if row[0] not in ELEMENT_MORPHEMES]


def _vfx_form(doc: dict) -> tuple[str, str]:
    """-> (shape clause, element) from the doc's vfxKey. ('', '') when absent."""
    key = (doc.get("vfxKey") or "").strip()
    if not key:
        return "", ""
    if not key.startswith("fx.prim."):
        return VFX_NAMED_FORM.get(key, ""), ""
    parts = key.split(".")
    if len(parts) < 4:
        return "", ""
    element, tail = parts[2], parts[3]
    shape, size = tail, ""
    for suffix in ("-lg", "-sm"):
        if tail.endswith(suffix):
            shape, size = tail[: -len(suffix)], suffix
    form = VFX_SHAPE_FORM.get(shape, "")
    if form and size:
        form = f"{form}, {VFX_SIZE_FORM[size]}"
    return form, element


# Last resort: the doc's own damage type. Still doc-derived, never a constant.
DAMAGE_HUE = {"magic": "arcane violet", "physical": "steel and crimson",
              "true": "radiant white-gold"}
SLOT_FALLBACK_NOUN = {
    "Q": "a forward energy strike", "W": "a swirling energy sigil",
    "E": "a rising aura of power", "R": "an overwhelming ultimate energy burst",
    "EX": "a searing ultimate power crest",
    # PASSIVE is a NEW slot value (the 108 天生技 docs). Without this row it fell
    # through to the generic "a burst of focused energy" — the same picture an
    # unmatched Q would get, which is exactly wrong for a permanent trait.
    "PASSIVE": "a carved stone rune sigil",
}

# `\w` matches CJK in Python's re, so prompt.strip_hero_number's `^\d+-\d+\w*\s*`
# eats the WHOLE name whenever the hero number is not followed by a space:
# `61-00百連我殺` -> ``, `72-01洗刷刷` -> ``. The doc then has no name signal at
# all and silently falls back to its mechanics prose. Restricting the optional
# suffix to ASCII letters keeps `90-002` / `69-001` working and fixes the 5
# affected docs. Kept LOCAL rather than patched into ../src/prompt.py, whose
# lexicon is hashed into the paid path's `.hash` sidecars (editing it would
# invalidate icons this task has no mandate to redraw).
_HERO_NUMBER_RE = re.compile(r"^\d+-\d+[A-Za-z]*\s*")


def _strip_number(name: str) -> str:
    return _HERO_NUMBER_RE.sub("", (name or "").strip()).strip()


def is_innate_passive(doc: dict) -> bool:
    """A TRUE 天生技: permanently on, never cast.

    `slot: "PASSIVE"` alone is not enough — 60 of the 108 passive docs carry
    `innateKind: "active"` and are real castable skills with cooldown, mana and
    effects (22-00 嗚鎖打! deals 150 damage). Those keep the full action-shot
    treatment, VFX backdrop included; only `innateKind: "passive"` drops it.
    """
    return ((doc.get("slot") or "").upper() == "PASSIVE"
            and (doc.get("innateKind") or "").lower() == "passive")


def _ability_damage_type(doc: dict) -> str:
    for eff in doc.get("effects") or []:
        if eff.get("kind") == "damage" and eff.get("damageType"):
            return eff["damageType"]
    return ""


def ability_keywords(doc: dict) -> tuple[str, str, str]:
    """-> (english subject, dominant colour, signal).

    NAME beats DESCRIPTION beats damage type — the ability's own words decide
    what is drawn, so the icon depicts THAT ability, not a house sigil.
    """
    name = _strip_number(doc.get("name") or "")
    body = _prompt.clean_body(doc.get("description") or "")
    form, vfx_element = _vfx_form(doc)
    # A permanent trait has no on-screen cast, so the VFX backdrop is dropped:
    # stacking "…, with a crescent slash arc sweeping behind it, engraved as a
    # crest" makes a three-clause prompt where neither read survives. The crest
    # clause in pass1_prompt is the passive's discriminating form instead.
    if is_innate_passive(doc):
        form = ""

    def pick(table, text):
        return _prompt._pick(table, text)

    def pick_ci(table, text):
        return pick(table, text) or pick(table, (text or "").lower())

    # NOUN. Pass A skips the pure-element morphemes so a COMPOUND name gives up
    # its concrete object (雷鳴劍 -> a sword, not a bolt); pass B lets them back
    # in for names that really are only an element (打雷絕招 -> a bolt).
    noun = (pick_ci(_non_element(ABILITY_NOUN_EXTRA), name)
            or pick(_non_element(_prompt.NAME_NOUN), name)
            or pick(_prompt.NAME_NOUN_EN, name.lower())
            or pick_ci(ABILITY_NOUN_EXTRA, name)
            or pick(_prompt.NAME_NOUN, name))
    signal = "name"
    if not noun:
        noun = pick_ci(ABILITY_NOUN_EXTRA, body) or pick(_prompt.NAME_NOUN, body)
        signal = "body" if noun else signal
    # HUE. The name's own element wins; the vfxKey's element is next, ABOVE the
    # description, whose mechanics prose produces false positives.
    hue = (pick(_prompt.ELEMENT_HUE, name) or pick_ci(ABILITY_HUE_EXTRA, name)
           or pick(_prompt.ELEMENT_HUE_EN, name.lower())
           or VFX_ELEMENT_HUE.get(vfx_element)
           or pick(_prompt.ELEMENT_HUE, body) or pick(ABILITY_HUE_EXTRA, body))
    if not noun:
        slot = (doc.get("slot") or "").upper()
        noun = SLOT_FALLBACK_NOUN.get(slot, "a burst of focused energy")
        signal = "slot"
    if not hue:
        hue = DAMAGE_HUE.get(_ability_damage_type(doc), "cyan")
    # The vfxKey's SHAPE is appended last: same subject, different on-screen form
    # = a different picture, which is the whole point of the ability bar.
    if form:
        noun = f"{noun}, {form}"
    return noun, hue, signal


# ────────────────────────────────────────────────── prompt assembly ──────
DERIVERS = {
    "champions": champion_keywords,
    "items": item_keywords,
    "augments": augment_keywords,
    "abilities": ability_keywords,
}


_ARTICLE_RE = re.compile(r"^(an?|the)\s+", re.I)


def _one_of(subject: str) -> str:
    """"a steel longsword" -> "a single steel longsword".

    The item/augment framing wants a singular head noun, and it used to get it by
    prepending "a single " unconditionally. Every ITEM_NAME_OBJECT value happens
    to start with an article, so that read fine — until a subject that does NOT
    ("a fan of…" is fine, but a bare plural is not) produced literal nonsense
    like "a single three overlapping speed-blurred blade after-images", which
    rendered as an unreadable starburst. Swapping the leading article keeps every
    existing item string byte-identical and makes the new ones grammatical.
    """
    subject = (subject or "").strip()
    if _ARTICLE_RE.match(subject):
        return "a single " + _ARTICLE_RE.sub("", subject, count=1)
    return subject


def pass1_prompt(family: str, doc: dict) -> tuple[str, str, str]:
    """The PASS-1 (subject) positive prompt + its negative + signal. Minimal
    style so the subject renders CLEARLY and recognisably."""
    subject, hue, signal = DERIVERS[family](doc)
    if family == "champions":
        pos = (f"anime character, {subject}, {hue} colour scheme, upper body "
               f"portrait, front view, centred, single character, simple plain "
               f"background, clear detailed face, full subject in frame")
    elif family == "abilities":
        # ── TRIED AND REJECTED: a distinct "emblem" read for true passives ────
        # A passive is always on and never cast, so drawing it as a still crest
        # rather than an action shot is an appealing idea (it would echo #166,
        # where passive buttons already get a dashed border). It was BUILT and
        # A/B-MEASURED against three passives at 4 clauses x 3 subjects:
        #   A  (no clause)                                        <- winner
        #   B  ", engraved as a still symmetrical heraldic crest emblem"
        #   C  ", carved in engraved metal relief, still and motionless"
        #   D  ", struck into a worn metal rune plate"
        # Every one of B/C/D pulled the picture toward a round medallion and
        # away from the subject. 21-00 灼眼 is the clean read on it: with no
        # clause it renders a brilliant orange EYE in a solar corona; with B it
        # is a gold kaleidoscope with the eye almost gone, with C an eye lost in
        # a metal octagon, with D a tech ring with no eye at all. Adding ANY
        # emblem word re-heads the noun phrase — the same failure VFX_SHAPE_FORM
        # documents — and at 48 passives it would have rebuilt the collapse the
        # previous wave was fixed to remove. The passive/castable distinction
        # therefore stays where it already works: in the UI, not in the art.
        #
        # An ability is an EFFECT, not a product on a table — same PASS-1 rules
        # (one clear centred subject, plain background), different framing.
        pos = (f"{subject}, glowing magical skill effect, {hue} colour scheme, "
               f"centred, one single subject, plain dark background, clear sharp "
               f"silhouette, full subject in frame")
    else:
        pos = (f"{_one_of(subject)}, {hue} colour scheme, centred, one object, "
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
