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

import json
import os
import re
import sys

METHOD_VERSION = "twopass-v3"  # written into each PNG; bump to force regeneration

# ─────────────────────────────────────────────────────────── PASS 2 STYLE ──
# 風格（PASS 2）現在**住在後台可調的 JSON 裡**，⛔ 不再是這裡的 Python 常數。
#
# 為什麼搬走（第一守則）：owner 2026-08-17 要的是「**日本 2D RPG**、精緻，但**不要
# 過度花俏複雜的顏色**」。而在這一行以前，風格是下面那兩個常數，寫的是
# "Japanese anime style … vibrant saturated colours" —— 既不是他要的風格，顏色方向
# 還剛好相反，而且**沒有任何後台入口**：改一個形容詞要改程式。
# 「精緻到哪、花俏到哪算過頭」是看過圖才知道的體感取捨，不是事實 ⇒ 一律可調。
#
# 下面兩個常數**留著當 fail-open 的退路**（讀不到 JSON 時仍然畫得出圖），
# ⛔ 但它們不再是出貨值 —— 出貨值在 content/config/icon-style.json。
ANIME_STYLE = (
    "Fate Type-Moon anime illustration in the ufotable style, hand-painted "
    "digital art, confident brush strokes with visible paint texture, clean "
    "ink outline, cel shading in two tone steps, warm gold key light from the "
    "upper left with a cool azure rim light down the lower right, restrained "
    "palette of burnished gold and deep indigo over muted steel and leather "
    "lifted by one crimson accent, a few drifting blue-white magical motes, "
    "plain near-black background, bold readable silhouette, high local "
    "contrast, chunky forms"
)
ANIME_NEGATIVE = (
    "gilded lace, baroque scrollwork, fine ornamental linework, runes, "
    "inscribed symbols, stained-glass tracery, neon, oversaturated, garish "
    "clashing colours, rainbow gradient, glitter, excessive glow, lens flare, "
    "chromatic aberration, busy cluttered detail, kaleidoscope, mandala, "
    "emblem, logo, photorealistic, photograph, 3d render, glossy plastic, "
    "chrome, specular highlight, depth of field, text, letters, watermark, "
    "signature, border, frame, ui panel, multiple views, collage, grid, "
    "blurry, lowres, deformed, extra limbs, extra fingers, mutated, western "
    "cartoon, sketch, monochrome"
)

_HERE = os.path.dirname(os.path.abspath(__file__))
# local -> icon-gen -> tools -> repo root
ICON_STYLE_PATH = os.path.abspath(
    os.path.join(_HERE, "..", "..", "..", "content", "config", "icon-style.json"))

# 這幾格對應 `config.icon-style@1` 的 Zod（packages/shared/.../iconStyleDoc.ts）。
# ⚠️ 這裡的值是**退路**不是出貨值；出貨值在那份 JSON 裡，兩者刻意逐字相同。
_ICON_STYLE_FALLBACK = {
    "stylePrompt": ANIME_STYLE,
    "negativePrompt": ANIME_NEGATIVE,
    # ⭐ GH#457：LoRA 清單（`[{path, weight}]`）。⛔ 退路是**空的**，⛔ 不是某一顆
    #    LoRA —— 讀不到設定就畫沒有 LoRA 的圖，而 `pipeline._lora_specs()` 讀的
    #    是這一格。⚠️ 路徑相對於 `tools/icon-gen/models/`（那個目錄是 gitignore
    #    的），所以這份 JSON 裡⛔ 不會出現某一台機器的絕對路徑。
    "loras": [],
    "strength": 0.58,
    "pass1Steps": 26,
    "pass1Guidance": 7.5,
    "pass2Steps": 30,
    "pass2Guidance": 7.0,
    "size": 128,
}
_icon_style_cache: dict | None = None


def load_icon_style(path: str | None = None) -> dict:
    """讀 `content/config/icon-style.json` —— PASS 2 的風格與兩階段的取樣火候。

    **fail-open，但⛔ 不靜默。** 讀不到／壞掉時退回上面那份常數並在 stderr 印一行
    說它退回了。理由是 CLAUDE.md 第二守則那條：fail-open 沒錯，靜默才是缺陷 ——
    這支工具跑起來要好幾分鐘，一份沒被讀到的風格設定如果不出聲，操作者會以為
    「我明明調了」而整批 61 張都用舊風格畫完。
    """
    global _icon_style_cache
    if path is None and _icon_style_cache is not None:
        return _icon_style_cache
    target = path or ICON_STYLE_PATH
    style = dict(_ICON_STYLE_FALLBACK)
    try:
        with open(target, encoding="utf-8") as fh:
            doc = json.load(fh)
        if not isinstance(doc, dict):
            raise ValueError("not a JSON object")
        for key in _ICON_STYLE_FALLBACK:
            if key in doc and doc[key] is not None:
                style[key] = doc[key]
    except Exception as exc:
        print(f"[icon-gen] WARNING: 讀不到 {target} ({exc}) —— "
              f"風格退回程式內建的常數，後台這一頁的設定這一輪不會生效。",
              file=sys.stderr)
    if path is None:
        _icon_style_cache = style
    return style


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
    # 喪標麥可（聖杯黑泥醬）—— owner 2026-08-17：「要補頭圖，可參考**植物大戰殭屍
    # 的殭屍頭圖**」。所以它是**頭部特寫**不是全身照，而且是**卡通化的**：⛔ 不血腥、
    # ⛔ 不寫實。灰綠皮膚 / 凹陷眼窩 / 外露的牙 / 破爛衣領是那張頭圖的四個辨識點。
    # ⚠️ 沒有這一列它會掉到 ROLE_FALLBACK —— 它的 role 是 "tank"，而那張表沒有
    # "tank" 這個鍵，所以會落到 `ROLE_FALLBACK["fighter"]`＝「輕甲拿武器的動漫戰士」。
    # 79 份英雄文件裡**只有它沒有 icon 欄位**，少了這一列的後果就是那個泛用戰士上架。
    "godie-zombiex": ("a goofy cartoon zombie man, head and shoulders, grey-green "
                      "rotten skin, dark sunken eye sockets, crooked teeth in a "
                      "wide grin, a tattered shirt collar", "grey-green and dull violet"),
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
    # ── [EX解放] #50–#69（owner 2026-08-17）────────────────────────────────
    # ⚠️ 這一批**一定要走這張覆寫表**，⛔ 不能讓 `item_keywords` 從名字/描述推導。
    # 前科量得到：60 張聖杯願望走推導時只長出 16 種特徵，33/60（55%）撞在同一句。
    # 傳說武器的描述格式又更整齊（「武器\n效能\n[標籤]…」），推導的塌陷會更嚴重。
    #
    # ⭐ #61 是 owner 2026-08-17 把「弓與箭」**整件換掉**之後的新設計 ——
    # 舊主題（弓／箭／Stand 使者）一個字都不能留，否則畫出來的是上一版的東西。
    "shining-golden-orbs": (
        "two large polished golden spheres resting side by side on a dark pedestal, "
        "radiant golden light bursting outward behind them, bold centred silhouette",
        "brilliant gold and deep amber",
    ),
    # ── [EX∅ 根源] 19 件新寶具（owner 2026-08-18）──────────────────────────
    # ⚠️ 同上：⛔ 不走推導。這 19 份的 `description` 是**同一個模板**
    # （「武器\n效能\n[標籤]…\n\n解說」），而 `item_keywords` 的名字表只認單一
    # 語素 —— 「刀」「槍」「劍」「杖」「戒」「書」「面具」「冠」會把其中 8 件
    # 收斂成 5 種通用物件（katana / spear / longsword / staff / ring…），
    # 另外 11 件（紙片・手套・火把・立體機動裝置・淚珠・首輪…）名字裡一個語素
    # 都沒有，會整批掉到 STAT_OBJECT 或 "an ornate adventuring relic"。
    # 這些是**寶具**，在商店與背包裡並排出現 —— 撞圖就是白做。
    "ultimate-mod-shiranui": (
        "an over-engineered katana, extra bolted-on metal plates and screws along "
        "the blade, pale flame licking off the cutting edge, held upright, "
        "bold centred silhouette",
        "gunmetal grey and pale blue",
    ),
    "lance-kongotetsu": (
        "a very long ceremonial lance, a diamond-faceted spearhead above a ringed "
        "vajra collar, standing upright, clean centred silhouette",
        "polished silver and warm gold",
    ),
    "mystery-scrap-of-paper": (
        "a single small torn scrap of old parchment floating in the dark, faded "
        "unreadable marks on it, edges strangely uncharred, bold centred silhouette",
        "aged parchment cream and ink brown",
    ),
    "fingerless-gloves": (
        "a pair of worn fingerless leather gloves with reinforced knuckle straps, "
        "one laid across the other, bold centred silhouette",
        "dark leather brown and brass",
    ),
    "torch-master": (
        "a wooden torch with a cloth-wrapped burning head, one tall steady flame, "
        "held upright, bold centred silhouette",
        "molten orange and charred brown",
    ),
    # ⚠️ soul-eater 重跑到上限（2 次）。三版都不理想，出貨的是第 2 版。
    # 量到的：第 3 版把 "pale ghost wisps" 畫成了**一個幽靈少女角色**（寶具畫成人物
    # ＝完全走鐘），所以這一句刻意**不含任何 wisp/soul/ghost 的形容** —— 那些詞會把
    # 主體從「一把劍」拉成「一個亡靈」。要再試的話請動別的地方。
    "soul-eater": (
        "one upright black broadsword planted point down, a fanged skull mouth "
        "carved into the base of the blade, bold centred silhouette",
        "obsidian black and spectral cyan",
    ),
    "meat-cleaver": (
        "one butcher's meat cleaver standing upright, a broad flat rectangular "
        "chopping blade much wider than its short wooden handle, bold centred "
        "silhouette",
        "dull steel and wood brown",
    ),
    "meteor-ring": (
        "a golden finger ring set with three small burning star gems, thin meteor "
        "trails curving around the band, bold centred silhouette",
        "warm gold and starlight white",
    ),
    "staff-of-ainz-ooal-gown": (
        "an ornate black magic staff crowned with coiled serpent heads gripping a "
        "single glowing jewel, standing upright, bold centred silhouette",
        "obsidian black and deep violet",
    ),
    "spear-of-lightning": (
        "a slender javelin forged out of crackling lightning, sharp arcs jumping "
        "off the shaft, driven point-down, bold centred silhouette",
        "electric white and deep blue",
    ),
    "odm-gear": (
        "a leather harness rig with twin pressurised gas canisters and a steel "
        "grapple-hook launcher, one coiled wire trailing, bold centred silhouette",
        "leather brown and steel grey",
    ),
    "stone-mask": (
        "a carved stone face mask with hollow empty eyes and a slack open mouth, "
        "thin bone spines bristling from its inner rim, bold centred silhouette",
        "pale stone grey and blood red",
    ),
    "gravity-sword-black-rod": (
        "a featureless matte black rectangular rod sword with no edge and no guard, "
        "the ground cratering under its weight, bold centred silhouette",
        "matte black and dark violet",
    ),
    "teardrop-of-rebirth": (
        "one large teardrop-shaped crystal droplet hanging in the dark, a tiny "
        "curled sprout of light glowing inside it, bold centred silhouette",
        "clear aqua and pale gold",
    ),
    "book-of-gospel": (
        "a thick gospel book lying open, gilded page ribbons lifting, faint script "
        "glowing across the spread pages, bold centred silhouette",
        "ivory white and warm gold",
    ),
    "magic-armor-type-zero": (
        "a knight's chest plate armour with wide shoulder pauldrons, a round "
        "glowing reactor core set in the middle of the chest, brass pipes running "
        "up to the shoulders, bold centred silhouette",
        "brass and glowing cyan",
    ),
    "usagizuki-twin-crescents": (
        "exactly two curved crescent-moon swords crossed in an X, each blade a "
        "thin sickle-shaped sliver of moon, bold centred silhouette",
        "moonlight silver and deep indigo",
    ),
    "collar-of-the-deadly-soul": (
        "a thick studded black neck collar with a heavy iron ring hanging at the "
        "front and a small skull clasp, bold centred silhouette",
        "black leather and iron grey",
    ),
    "pale-moon-requiem-crown": (
        "a woven circlet crown of pale moon blossoms with long trailing petals, "
        "resting tilted, bold centred silhouette",
        "pale blue-white and soft green",
    ),
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

# ─────────────────────────────────────────────── 聖杯願望 60 張（#333）──────
# ⭐ **一張卡一句特徵，60 張 60 句，⛔ 不分組。**
#
# 為什麼不能分組（量到的，不是猜的）：把出貨的 `augment_keywords` 跑過這 60 份文件，
# 只長出 **16 種**不同的特徵，其中 **33/60（55%）**掉在同一句
# "a glowing heraldic power sigil"。而聖杯願望是**三選一**——一次同時出三張，玩家要
# 在幾秒內分辨。三張裡有兩張長一樣，那個畫面就是 #110 當初要修的
# 「根本不知道哪招是哪招」原地重演。
#
# ⚠️ 這 60 句是**內容不是程式**：寫的時候想的是「這張卡在畫面上長什麼樣」，所以
# 每一句都要有**主體物件 + 材質 + 動作**，⛔ 不可以是 "a glowing sigil" 這種通用詞。
# 同名的 A/C/EX 三階（反射術式 · 魔力裝甲 · 戰鬥續行 · 單獨行動 · 起源彈 · 魔力放出）
# 刻意畫成**不同的東西**而不是同一個東西換顏色 —— 它們在牌庫裡會同時出現。
#
# 顏色一律**兩個色詞以內**：owner 2026-08-17「⛔ 不要過度花俏複雜的顏色」。
# 格式與 CHAMPION_SUBJECT 相同：id -> (english subject, dominant colour phrase)
GRAIL_SUBJECT: dict[str, tuple[str, str]] = {
    # ── A 階（金）：固有技能 / 魔術，主體大、動作明確 ──────────────────────
    "grail-a-01": ("a golden mystic eye set into a raised parry dagger, a snapped "
                   "arrow flung back off the blade", "amber gold and steel"),
    "grail-a-02": ("a round mirror rune catching a spell bolt and pouring red "
                   "healing light back out", "mirror silver and crimson"),
    "grail-a-03": ("a chipped steel gorget stopping a killing blade a finger from "
                   "the throat, sparks at the point", "steel grey and gold"),
    "grail-a-04": ("an open floating grimoire whose glowing runes spin like a "
                   "clock face", "violet and gold"),
    "grail-a-05": ("a predator's slit amber eye above a set of bared fangs, hunting "
                   "embers rising past it", "amber gold and blood red"),
    "grail-a-06": ("a lone armoured figure walking on alone past a comrade's fallen "
                   "cloak", "pale gold and ash grey"),
    "grail-a-07": ("a shattered crystal statue knitting itself back together along "
                   "glowing golden seams", "warm gold and pale blue"),
    "grail-a-08": ("two overlapping casting circles, the rear one a ghostly echo "
                   "trailing a beat behind", "violet and gold"),
    "grail-a-09": ("a translucent glass-bodied figure whose armour plates are "
                   "dissolving into empty air", "pale violet and glass white"),
    "grail-a-10": ("a copper circuit ring clamped shut by a valve, sparks feeding a "
                   "blue core through it", "copper and deep blue"),
    "grail-a-11": ("a suit of armour woven out of flowing blue mana light worn over "
                   "a beating red heart", "mana blue and crimson"),
    "grail-a-12": ("a violet spell bolt hardening in mid-flight into a heavy steel "
                   "spearhead", "violet and steel"),
    "grail-a-13": ("a massive iron gauntlet clenched into a fist, crushing a cracked boulder in its grip, dust bursting from between the fingers", "flesh red and gold"),
    "grail-a-14": ('a single straw sandal wrapped in a spiralling wind ribbon, one bold centred silhouette, sharp motion streak behind it', 'amber gold and dust grey'),
    "grail-a-15": ("a golden soul flame bursting upward out of snapping black "
                   "chains", "golden flame and black"),
    "grail-a-16": ("stacked panes of glass forming a hexagonal mind-wall in front of "
                   "a raised open palm", "pale gold and glass blue"),
    "grail-a-17": ('one upright sword in front, two more swords crossed behind it forming a tight fan, bold clean silhouette centred', 'steel and warm gold'),
    "grail-a-18": ("a molten circuit line running along a bare forearm, embers "
                   "dripping off the elbow", "molten orange and gold"),
    "grail-a-19": ("a mechanical arm being rebuilt, one fresh violet crystal plate "
                   "slotting into place", "violet and brass"),
    "grail-a-20": ("a single wide-open eye at the end of a long telescope of light "
                   "reaching to the horizon", "sky blue and gold"),
    # ── C 階（銀）：同名技能的樸素版，主體刻意小一號 ───────────────────────
    "grail-c-01": ("a small silver ward charm burning away one strand of purple "
                   "curse smoke", "silver and pale violet"),
    "grail-c-02": ("an open palm shoving an attacker's blade aside in a burst of "
                   "wind", "silver grey and white"),
    "grail-c-03": ("a jagged mirror shard bouncing a spell away as a single blue "
                   "mana droplet", "mirror silver and blue"),
    "grail-c-04": ("a cracked breastplate leaking red droplets that turn blue as "
                   "they fall into a flask", "crimson and mana blue"),
    "grail-c-05": ("a thin shirt of blue mana chainmail worn over a plain cloth "
                   "tunic", "mana blue and grey"),
    "grail-c-06": ('a large round stopwatch whose single hand is a sword blade, blurred sweep arc, one bold centred object', 'silver and cyan'),
    "grail-c-07": ("a plain steel blade sheathed edge to tip in humming blue mana "
                   "light", "mana blue and steel"),
    "grail-c-08": ("a dull lead bullet drilling a neat hole clean through a golden "
                   "aura ring", "lead grey and gold"),
    "grail-c-09": ("a red-corded spear tip cracking straight through a pane of blue "
                   "barrier glass", "crimson and pale blue"),
    "grail-c-10": ("a pale hungry soul mouth swallowing three small glowing orbs "
                   "whole", "spectral cyan and white"),
    "grail-c-11": ('a clenched fist punching upward out of a shattered purple shackle cuff, off-centre diagonal composition, broken chain fragments flying', 'silver and bruised purple'),
    "grail-c-12": ("a small hexagonal chant barrier of silver runes closing around a "
                   "caster's shoulders", "silver and pale cyan"),
    "grail-c-13": ("a crowned skull with a single silver blade driven down through "
                   "the crown", "silver and rot green"),
    "grail-c-14": ("a vein of green leyline light pouring out of a cracked stone "
                   "monolith", "leyline green and stone grey"),
    "grail-c-15": ("one lit lantern left standing beside a comrade's dropped helm",
                   "pale gold and ash grey"),
    "grail-c-16": ("a small blue homing bolt curving hard along a looping trail of "
                   "light", "mana blue and white"),
    "grail-c-17": ("a silver guard plate snapping into place an instant before a "
                   "critical strike lands", "silver and warning red"),
    "grail-c-18": ("a plain steel blade wrapped in a spiralling coil of orange flame, "
                   "embers dripping", "molten orange and steel"),
    "grail-c-19": ("two burning star-shaped shards falling side by side, sharp four-pointed flares, close up filling the frame", "starlight silver and indigo"),
    "grail-c-20": ("a translucent blueprint copy of a sword forming beside the real "
                   "one", "projection blue and gold"),
    # ── EX 階（稜彩）：權能 / 寶具 / 固有結界，最大最誇張的那一組 ────────────
    "grail-ex-01": ("a golden quill rewriting a line of law text on a floating page, "
                    "the words turning white hot", "gold and white"),
    "grail-ex-02": ("a marble temple built out of floating clock gears whose hands "
                    "spin backwards", "pale blue and gold"),
    "grail-ex-03": ("a golden ouroboros ring closing around a raised victory laurel",
                    "deep gold"),
    "grail-ex-04": ('a raised open hand seen from the back, three glowing crimson command-seal marks burning on the skin, bold centred silhouette', 'crimson and gold'),
    "grail-ex-05": ("a blazing sword raised overhead with a second identical blade of "
                    "light overlapping it", "white and gold"),
    "grail-ex-06": ("a spurred riding boot in a stirrup of light with feathered wings "
                    "spread from the heel", "sky blue and gold"),
    "grail-ex-07": ("a battered warrior standing calm with a blade stopped dead "
                    "against one bare palm", "off-white and blood red"),
    "grail-ex-08": ("a still swordsman standing with eyes closed while three ghost "
                    "blades strike outward around him", "pale blue and white"),
    "grail-ex-09": ("a golden herald's trumpet pouring ten falling meteor lights down "
                    "over a burning ring", "ember red and gold"),
    "grail-ex-10": ("an unrolled contract scroll marked with a red handprint, a soul "
                    "flame sinking back into a fallen body", "crimson and pale gold"),
    "grail-ex-11": ("a figure rising out of a blooming lotus of light while broken "
                    "armour re-forms around it", "white and gold"),
    "grail-ex-12": ("a floating glass orb filled with a deep blue ocean, waves "
                    "curling inside the glass", "deep blue"),
    "grail-ex-13": ("a barbed crimson bone spear piercing a cracked heart, its thorns "
                    "curling backwards", "dark crimson"),
    "grail-ex-14": ("a black bullet blowing apart a nested cage of gold aura and blue "
                    "barrier glass", "gunmetal and gold"),
    "grail-ex-15": ("a sword whose blade is a stacked column of cut gemstones, each "
                    "facet flaring", "jewel green and violet"),
    "grail-ex-16": ("three swallow-tail sword arcs crossing at once inside a single "
                    "cut", "steel blue and white"),
    "grail-ex-17": ("a gun barrel pressed point blank against a breastplate, muzzle "
                    "flare at zero range", "gunmetal and orange"),
    "grail-ex-18": ("a glowing furnace heart inside an armoured chest with blue pipes "
                    "drawing light out of it", "furnace red and blue"),
    "grail-ex-19": ("an endless spiral of violet mana rings receding inward, brighter "
                    "at every turn", "deep violet"),
    "grail-ex-20": ("a sword blade split by a white lightning arc, thunder sparks "
                    "jumping off the edge", "white and blue"),
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
    # 聖杯願望先查它自己那張表（60 張各一句）。
    if aug_id in GRAIL_SUBJECT:
        subj, hue = GRAIL_SUBJECT[aug_id]
        return subj, hue, "grail"
    if aug_id.startswith("grail-"):
        # ⛔ 不要靜默掉進下面的啟發式。一張沒進表的聖杯願望還是畫得出圖（fail-open），
        # 但它畫出來的會是那句通用的 "a glowing heraldic power sigil" —— 而三選一
        # 同時出三張，一張通用圖就是一張玩家分不出來的卡。所以退回這件事要出聲
        # （第二守則：fail-open 沒錯，靜默才是缺陷）。
        print(f"[icon-gen] WARNING: {aug_id} 不在 GRAIL_SUBJECT —— "
              f"這張聖杯願望會退回通用啟發式，畫出來很可能跟別張撞圖。"
              f"請到 keywords.py 的 GRAIL_SUBJECT 補一句特徵。", file=sys.stderr)
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


# ─────────────────────────────────────────────────────── PASS 1 構圖 ──────
# ⭐ owner 2026-08-19（GH#457）：「圖示應該是類似**剪影、局部動作、特效、符咒或
#    物件**的呈現，⛔ **不應該直接畫出角色**」。
#
# ⚠️ 這一條**只管 champions 以外的家族**。英雄頭像本來就該是一個角色 ——
#    把「不要畫角色」套到它身上，那 113 張會全部變成抽象光團。
#    所以構圖規則跟著**家族**走，而 champions 是它明著的例外。
#
# ⚠️ 為什麼寫在 PASS 1 而⛔ 不是 `content/config/icon-style.json` 的負向：
#    那一段是**全家族共用**的（PASS 2 不知道自己在畫哪一家），寫進去會把英雄頭像
#    一起殺掉。構圖是「畫什麼」= PASS 1 的職責，風格才是 PASS 2 的。
#
# ⭐ 這四段字串是**常數不是字面值**，因為 `batch._method_stamp()` 要 digest 它們：
#    ⛔ 沒有這一步的話，改構圖 = 一張圖都不會重畫（＝2026-08-19 之前風格那一格
#    踩過的同一個坑，見 `_method_stamp` 的說明）。
_NO_CHARACTER = (
    "shown WITHOUT a character: as a bold silhouette, a partial action (only "
    "the hands, blade, claw or footfall at the instant it lands), a burst of "
    "the effect itself, a talisman or sigil, or the bare object"
)

PASS1_FRAME: dict[str, str] = {
    # 英雄 —— **這條是例外**：它就是要畫一個角色。
    "champions": ("anime character, {subject}, {hue} colour scheme, upper body "
                  "portrait, front view, centred, single character, simple plain "
                  "background, clear detailed face, full subject in frame"),
    "abilities": ("{subject}, glowing magical skill effect, {hue} colour scheme, "
                  "{nochar}, centred, one single subject, plain dark background, "
                  "clear sharp silhouette, full subject in frame"),
    "augments": ("{one_of}, {hue} colour scheme, {nochar}, centred, one single "
                 "subject, plain background, clear sharp silhouette, "
                 "full subject in frame"),
    "items": ("{one_of}, {hue} colour scheme, {nochar}, centred, one object, "
              "studio product shot, plain background, clear sharp silhouette, "
              "full object in frame"),
}

# 負向也跟著家族走 —— ⛔ 一樣不可以套到 champions 上。
PASS1_NEG_BASE = ("blurry, lowres, deformed, cropped, multiple objects, collage, "
                  "text, watermark, frame, border, extra limbs, bad anatomy")
PASS1_NEG_NO_CHARACTER = ("full character, whole person, human figure, face, "
                          "portrait, standing pose, anime girl, anime boy")


def pass1_prompt(family: str, doc: dict) -> tuple[str, str, str]:
    """The PASS-1 (subject) positive prompt + its negative + signal. Minimal
    style so the subject renders CLEARLY and recognisably."""
    subject, hue, signal = DERIVERS[family](doc)
    if family == "abilities":
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
        pass
    elif family == "augments":
        # ⭐ 2026-08-17（聖杯願望 60 張）—— augments **不可以**走下面那條
        # `studio product shot`。那是一個**風格詞長在特徵階段**，而且方向剛好跟
        # owner 要的「日本 2D RPG · 平塗 · 不花俏」相反：量到的第一輪 6 張樣本
        # 全部出成亮面 3D 產品照（桌面、硬投影、玻璃高光），PASS 2 要把 strength
        # 拉到 0.58 才壓得過去 —— 而那個 strength 是全家族共用的。
        #
        # ⛔ 沒有直接改下面 items 那一條：那 700 多張道具圖已經出貨，換掉它的框架
        # 等於讓「重跑一次就變另一種畫風」，blast radius 遠超這一批。
        # 願望是**祝福/效果**不是桌上的商品，所以它跟 abilities 同一種框架。
        pass
    frame = PASS1_FRAME.get(family, PASS1_FRAME["items"])
    pos = frame.format(subject=subject, one_of=_one_of(subject), hue=hue,
                       nochar=_NO_CHARACTER)
    neg = PASS1_NEG_BASE
    if family != "champions":
        neg = f"{neg}, {PASS1_NEG_NO_CHARACTER}"
    return pos, neg, signal


def pass2_prompt(family: str, doc: dict) -> tuple[str, str]:
    """The PASS-2 (style) positive + negative. The subject's colour is echoed so
    img2img keeps the right hue while applying the finish.

    ⭐ 風格那一段來自 `content/config/icon-style.json`（後台可調），⛔ 不再是寫死的
    常數 —— 見這個檔頂 `load_icon_style()`。主色 `hue` 仍然由 PASS 0 推導：那是
    「這張圖是什麼顏色」，屬於**特徵**不是**風格**，兩者刻意不放同一個地方。
    """
    _subject, hue, _signal = DERIVERS[family](doc)
    style = load_icon_style()
    return f"{style['stylePrompt']}, {hue} accents", style["negativePrompt"]
