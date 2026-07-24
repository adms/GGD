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
}


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
    name = _prompt.strip_hero_number(doc.get("name") or "")
    body = _prompt.clean_body(doc.get("description") or "")
    form, vfx_element = _vfx_form(doc)

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


def pass1_prompt(family: str, doc: dict) -> tuple[str, str, str]:
    """The PASS-1 (subject) positive prompt + its negative + signal. Minimal
    style so the subject renders CLEARLY and recognisably."""
    subject, hue, signal = DERIVERS[family](doc)
    if family == "champions":
        pos = (f"anime character, {subject}, {hue} colour scheme, upper body "
               f"portrait, front view, centred, single character, simple plain "
               f"background, clear detailed face, full subject in frame")
    elif family == "abilities":
        # An ability is an EFFECT, not a product on a table — same PASS-1 rules
        # (one clear centred subject, plain background), different framing.
        pos = (f"{subject}, glowing magical skill effect, {hue} colour scheme, "
               f"centred, one single subject, plain dark background, clear sharp "
               f"silhouette, full subject in frame")
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
