# WC3 crafting tree (GoDieEX22s) — reconstructed from the JASS

> **This is a design-history document, not a spec.** The arena has **no crafting** (governing
> decision, 2026-07-22: 「理論上競技場上的所有道具跟武器都不需要合成」), and the GGD sim never had
> combine logic to begin with — the recipes only ever existed in the WC3 JASS and were never
> ported. This tree exists so we can *classify* the 212 imported items — which ones are only
> stepping stones (droppable) and which are complete on pickup — and so the original map's
> design is not lost when the component items are removed.
> **Do not implement any of it. Do not add `buildsFrom`/`recipe` fields to `item@1`.**

## How this was reconstructed

Two independent sources, cross-checked against each other:

1. **The JASS (authoritative).** `tools/w3x-import/out/GoDieEX22s/raw/scripts__war3map.j`.
   The classic WC3 combine idiom: a trigger registered on `EVENT_PLAYER_UNIT_PICKUP_ITEM`,
   whose condition is a conjunction of `UnitHasItemOfTypeBJ(GetTriggerUnit(),'IXXX')` and whose
   action is `RemoveItem(GetItemOfTypeFromUnitBJ(...))` once per component followed by a single
   `UnitAddItemByIdSwapped('IYYY',GetTriggerUnit())`. 72 such triggers exist: 67 are recipes,
   3 are author-only easter eggs, 2 are unrelated (a charge-stacking handler and a rune pickup).
2. **The item tooltips (corroborating).** 70 items in `OBJECTS.json` carry a literal
   `合成配方：` block in their `description`, listing the components by *name*.

Rawcode → content id is mechanical: `IXXX` → `godie-ixxx` (lowercased). Every rawcode referenced
by a recipe resolves to a real `content/items/*.json`, with the five exceptions listed under
*Author-only easter eggs* below.

**Result of the cross-check:** every JASS recipe with a 製作書 component also has a tooltip
recipe, and they agree. 44 agree character-for-character; 7 differ only by typos in the
*tooltip* (嚇人面具/嚇人假面, 秘銀/祕銀, 觀世音/觀音菩薩, 冰晶琥珀/冰晶虎魄) — the JASS is right.
One disagrees on the **product name**: 奇門遁甲製作書 claims it makes 「奇門遁甲」, but the JASS
produces `godie-i00j` 「奇門**盾**甲」 and no item named 奇門遁甲 exists anywhere. Trusting the JASS.

## Headline numbers

| | implemented in JASS | + declared-only | total |
|---|---:|---:|---:|
| Recipes | 67 | 3 | 70 |
| Distinct products | 67 | +3 | 70 |
| Distinct components | 114 | +4 | 118 |
| Intermediates (product **and** component) | 20 | +1 | 21 |
| Finals (never a component) | 47 | +2 | 49 |
| Component-only leaves | 94 | +3 | 97 |
| Content items untouched by any recipe | 47 | −6 | 41 |

- **Max chain depth: 4** (真．雅典娜的驚嘆號).
- **55 製作書** exist in `content/items`; **52** are consumed by an implemented recipe,
  **3** are orphans whose recipe was never coded. All 55 have **zero modifiers**.
- One book, 雅典娜的驚嘆號製作書, is consumed by **three** different recipes (the upgrade chain),
  which is why 54 recipes use only 52 distinct books.

### The tree is NOT flat

Depth histogram (all 70 recipes): **d1** = 43, **d2** = 25, **d3** = 1, **d4** = 1.

21 of the 70 products are *intermediates*: you craft them, then feed them into another recipe.
That is what makes this a tree rather than a lookup table, and it is why the drop list is bigger
than "just the 製作書": an intermediate like 瑪那魔杖 is a real, statted, buyable item that
nevertheless exists mainly to become 雅典娜的驚嘆號.

The deepest chain — four steps, one book reused at every tier (the tooltip even says
「可藉由製作書強化兩次」):

```
熱戀魔杖 1100g ────────┐
嚇人假面    0g ────────┼──> 瑪那魔杖 3000g ──┐
瑪那魔杖製作書 1500g ───┘                     │
                                             ├──> 雅典娜的驚嘆號 7500g ──┐
       雅典娜的驚嘆號製作書 4500g ────────────┘                           │
                                                                        ├──> 雅典娜的驚嘆號．改 12000g ──┐
                     雅典娜的驚嘆號製作書 4500g ────────────────────────┘                                │
                                                                                                        ├──> 真．雅典娜的驚嘆號 16500g
                                  雅典娜的驚嘆號製作書 4500g ────────────────────────────────────────────┘
```

Total spend to reach the top: 1100 + 0 + 1500 + 4500 + 4500 + 4500 = **16 100g**. Against the
arena gold ceiling of ~7 600g (600 starting + 7 000 in round rewards, per the task #47 audit)
the top two tiers were unreachable in an arena match regardless of whether crafting existed.

## Recipe classes

The 70 recipes fall into four structurally different groups. Only the first is "MOBA crafting".

### A. Book recipes — 57 recipes (54 implemented + 3 declared-only)

`X製作書` + N base items → `X`. The book is consumed. This is the bulk of the tree and exactly what
the user is pointing at: the books are buyable no-ops (0 modifiers, all 55 of them) and most of
the base items exist only to be spent. See the full table below.

### B. Bookless base→final recipes — 13 recipes

No 製作書 involved; two to four ordinary items combine directly. (四魂之玉 is technically in this
group but is structurally different enough to get its own section — see C.)

| Product | Components |
|---|---|
| 仙后座 `godie-i01s` 0g | 奇美拉之翼 `godie-i00g` 1750g + 仙后座殘骸 `godie-i053` 0g |
| 大地泰坦角盔 `godie-i034` 0g | 山之書 `godie-i00r` 2785g + 泰坦之魂 `godie-i02i` 0g |
| 復仇之袍 `godie-i02j` 9065g | 舊系服 `godie-i02l` 0g + 求生護腕 `godie-i06h` 950g |
| 惡魔吉他 `godie-i02k` 9065g | 牛蒡男 `godie-i02m` 0g + 吸血石 `godie-i05r` 1250g |
| 戰旗 `godie-i02h` 9065g | 斯巴達圓盾 `godie-i02n` 0g + 復仇之玉 `godie-i066` 1450g |
| 死之王的意志 `godie-i060` 7500g | 女神之淚 `godie-i00k` 2900g + 死之王意志的碎片 `godie-i03p` 4600g |
| 死之王的神盾 `godie-i061` 7100g | 祕銀鎖子甲 `godie-i01w` 3100g + 死之王神盾的碎片 `godie-i03q` 4000g |
| 死之王的長槍 `godie-i01d` 8600g | 貫雷槍 `godie-i01g` 4300g + 死之王長槍的碎片 `godie-i03o` 4300g |
| 海潮泰坦護盾 `godie-i035` 0g | 泰坦之魂 `godie-i02i` 0g + 澤之書 `godie-i02q` 2785g |
| 消失的密室 `godie-i02d` 40000g | 隱密介紹信 `godie-i037` 1000g + 熱舞之靴 `godie-i05u` 500g + 破壞王手套 `godie-i05v` 650g |
| 火焰泰坦腰帶 `godie-i01k` 0g | 火之書 `godie-i01c` 2040g + 泰坦之魂 `godie-i02i` 0g |
| 蜂蜜罐 `godie-i05y` 0g | 空罐頭 `godie-i02o` 0g + 世界樹的果實 `godie-i05g` 1800g |

Three sub-patterns hide in here:

- **積分獎勵 (score-reward) recipes** — 泰坦 series, 仙后座, 惡魔吉他, 復仇之袍, 戰旗, 蜂蜜罐.
  The 0g "component" (泰坦之魂, 仙后座殘骸, 牛蒡男, 舊系服, 斯巴達圓盾, 空罐頭) is a quest token
  redeemed through a matching `兌換X` voucher item — the voucher tooltips literally read
  「積分獎勵 - 蜂蜜罐」 etc. So the real chain is **score → 兌換券 → token → combine with a
  purchased item → final**: a two-step quest gate, not shop crafting.
- **死之王 series** — `死之王X的碎片` (a purchasable 4000–4600g "shard", 0 modifiers) plus a
  crafted intermediate. Despite the name these three shards are *not* a collect-3 set; each is
  an independent recipe for a different final item.
- **四魂之玉** — the only true collection recipe in the map.

### C. 四魂之玉 — the one collection recipe

```
四魂之玉的碎片-荒魂  godie-i00v  0g  (2 modifiers) ─┐
四魂之玉的碎片-和魂  godie-i00w  0g  (6 modifiers) ─┼──> 四魂之玉  godie-i00z  0g  (6 modifiers)
四魂之玉的碎片-幸魂  godie-i00x  0g  (2 modifiers) ─┤     + grants the title 「邪惡的」
四魂之玉的碎片-奇魂  godie-i00y  0g  (2 modifiers) ─┘     + disables its own trigger afterwards
```

JASS: condition `Arv` (all four `UnitHasItemOfTypeBJ`), action `Anv`. There is also an author
bypass — `GetPlayerName(GetOwningPlayer(GetTriggerUnit()))=="adms"` grants it outright.

**The fact that settles the open design question:** all four shards are *already fully statted*
(2, 6, 2 and 2 modifiers each) — they are not empty collection tokens. Each stands on its own as
a draft reward without needing the assembled 玉 to exist, and the assembled 玉 (6 modifiers)
stands on its own as a single reward without needing the shards. Nothing here forces a chain.

### D. Author-only easter eggs — 3, excluded from the tree

Gated on `GetPlayerName(...)=="adms"`. All three mint items (`I04R`, `I04S`, `I05D`) that do
**not exist** in the map's object data at all, so they were already dead in the original map.
Listed only so nobody re-discovers them as "missing recipes":

| JASS fn | Gate | Consumes | Produces |
|---|---|---|---|
| `BIv` | player name == `adms` | `rump` (Rune of Mana, original table) | `I04R` — **no such item** |
| `BBv` | player name == `adms` | `thle` 龍之血 (original table, not imported) | `I04S` — **no such item** |
| `BDv` | player name == variable `iR` | `godie-i00p` 聖誕之靴 | `I05D` — **no such item** |

## Looks like crafting, is not

- **初心者護腕 mode cycle.** JASS `NNv` on `EVENT_PLAYER_UNIT_SPELL_EFFECT`: abilities
  `A0VO`/`A0VQ`/`A0VP`/`A0VR` rotate `godie-i033` 初心者護腕 → `godie-i05l` 力量護腕 →
  `godie-i05m` 敏捷護腕 → `godie-i05n` 智慧護腕 → back to 初心者護腕. All four cost 1400g.
  This is **one item with four selectable stat modes**, not a chain, and none of the four is a
  component of anything. They are already complete on pickup — keep all four, or model them as
  one item with a mode toggle. This is *not* a crafting step and removing crafting does not
  touch it.
- **AI auto-buy (`rgv`).** The AI hero build routine swaps items and deducts gold
  (e.g. `RemoveItem(I061)` + `UnitAddItemByIdSwapped(I03M)` − 8200g). Those are *purchases*,
  not recipes. Useful only as corroboration of which items the author considered "final".
- **`k7`** is the generic item-charge stacking handler; **`BGv`** is a rune pickup that grants
  an ability. Neither is a recipe.

## The 19 titles that ride on recipes

19 of the 67 implemented recipes also award the player a permanent title, spliced into their
display name (`SetPlayerName`, e.g. 「|c00EFF000(奇門行者)|r」). This is real, hand-written content
that is invisible in the item data and would be silently lost with the recipes. If the arena
wants titles, re-hang these on *acquiring the final item* rather than on a combine step.

| Title | Awarded with | JASS fn |
|---|---|---|
| 「瞬動的」 | 仙后座 `godie-i01s` | `XEv` |
| 「劃破虛空的」 | 厄夜鐮刀 `godie-i04i` | `IYv` |
| 「魔界之王」 | 嗜血邪書 `godie-i038` | `Axv` |
| 「邪惡的」 | 四魂之玉 `godie-i00z` | `Anv` |
| 「嚇死人的」 | 大地泰坦角盔 `godie-i034` | `Xev` |
| 「崩裂的」 | 天地崩裂魔杖 `godie-i03h` | `IUv` |
| 「救世的」 | 天生牙 `godie-i031` | `I4v` |
| 「怨念的」 | 復仇之袍 `godie-i02j` | `XDv` |
| 「重金屬帝王」 | 惡魔吉他 `godie-i02k` | `XIv` |
| 「斯巴達之」 | 戰旗 `godie-i02h` | `XBv` |
| 「潮到噴汁」 | 海潮泰坦護盾 `godie-i035` | `Xiv` |
| 「作者威能的」 | 消失的密室 `godie-i02d` | `AOv` |
| 「慾火焚身」 | 火焰泰坦腰帶 `godie-i01k` | `E7v` |
| 「奇門行者」 | 盾甲天書 `godie-i02t` | `I8v` |
| 「小笨熊」 | 蜂蜜罐 `godie-i05y` | `XGv` |
| 「狂怒的」 | 雷神之鎚 `godie-i01i` | `ISv` |
| 「神出鬼沒的」 | 風行天衣 `godie-i00c` | `IPv` |
| 「裂地者」 | 黑色魔書 `godie-i030` | `I0v` |
| 「秒殺的」 | 真．雅典娜的驚嘆號 `godie-i03b` | `Rbv` |

## Full recipe table

`*` marks a component that is itself a crafted product (an intermediate). `Cost` is the product
cost; `Σ` is the sum of component costs. Sorted by depth, then name.

| d | Product | Cost | Components | Σ | JASS fn |
|---|---|---:|---|---:|---|
| 1 | 一克拉鑽戒 `godie-i06r` | 1850 | 一克拉鑽戒製作書 150g + 網友手環 0g + 定情戒指 400g + 寶石碎片 1150g | 1700 | `OOv` |
| 1 | 仙后座 `godie-i01s` | 0 | 奇美拉之翼 1750g + 仙后座殘骸 0g | 1750 | `XEv` |
| 1 | 伊娃之盾 `godie-i00q` | 4000 | 米索莉護板 950g + 伊娃之盾製作書 1500g + 嚇人假面 0g + 寶石碎片 1150g | 3600 | `Onv` |
| 1 | 光明虎徹 `godie-i03d` | 5450 | 聖光石 1450g + 初心者寶石 2450g + 光明虎徹製作書 600g + 真知之石 950g | 5450 | `OTv` |
| 1 | 八取武士刀 `godie-i013` | 3100 | 八取武士刀製作書 1000g + 恐龍之斧×2 1050g | 3100 | `Xkv` |
| 1 | 冰晶虎魄 `godie-i04b` | 4150 | 熱戀魔杖 1100g + 冰晶虎魄製作書 2000g + 恐龍之斧 1050g | 4150 | `Oov` |
| 1 | 分手之鎚 `godie-i00n` | 4000 | 分手之鎚製作書 1150g + 復仇之玉 1450g + 奧理哈魯根劍身 1600g | 4200 | `X5v` |
| 1 | 刺針 `godie-i05o` | 5500 | 初心者寶石 2450g + 刺針製作書 500g + 奧理哈魯根劍身 1600g + 真知之石 950g | 5500 | `OWv` |
| 1 | 厄夜鐮刀 `godie-i04i` | 6590 | 林之書 2550g + 火之書 2040g + 厄夜鐮刀製作書 2000g | 6590 | `IYv` |
| 1 | 名刀-天狼 `godie-i00u` | 4000 | 名刀-天狼製作書 1750g + 破壞王手套 650g + 奧理哈魯根劍身 1600g | 4000 | `X1v` |
| 1 | 和道一文字 `godie-i01f` | 3100 | 和道一文字製作書 1200g + 破壞王手套 650g + 血羽之心 1250g | 3100 | `O6v` |
| 1 | 嗜血邪書 `godie-i038` | 7735 | 風之書 1950g + 澤之書 2785g + 嗜血邪書製作書 3000g | 7735 | `Axv` |
| 1 | 四魂之玉 `godie-i00z` | 0 | 四魂之玉的碎片-荒魂 0g + 四魂之玉的碎片-和魂 0g + 四魂之玉的碎片-幸魂 0g + 四魂之玉的碎片-奇魂 0g | 0 | `Anv` |
| 1 | 大地泰坦角盔 `godie-i034` | 0 | 山之書 2785g + 泰坦之魂 0g | 2785 | `Xev` |
| 1 | 天叢雲劍 `godie-i014` | 5050 | 初心者寶石 2450g + 天叢雲劍製作書 1000g + 奧理哈魯根劍身 1600g | 5050 | `Xwv` |
| 1 | 天地崩裂魔杖 `godie-i03h` | 7575 | 山之書 2785g + 火之書 2040g + 天地崩裂魔杖製作書 2750g | 7575 | `IUv` |
| 1 | 天生牙 `godie-i031` | 6400 | 林之書 2550g + 澤之書 2785g + 天生牙製作書 1500g | 6835 | `I4v` |
| 1 | 奇蹟之墜 `godie-i02r` | 6700 | 風之書 1950g + 熱戀魔杖 1100g + 奇蹟之墜製作書 2500g + 寶石碎片 1150g | 6700 | `O2v` |
| 1 | 女神之淚 `godie-i00k` | 2900 | 網友手環 0g + 寶石碎片 1150g + 瑪那寶石 1250g + 女神之淚製作書 350g | 2750 | `OCv` |
| 1 | 妖刀村正 `godie-i007` | 3350 | 妖刀村正製作書 500g + 吸血石 1250g + 奧理哈魯根劍身 1600g | 3350 | **declared only** |
| 1 | 復仇之袍 `godie-i02j` | 9065 | 舊系服 0g + 求生護腕 950g | 950 | `XDv` |
| 1 | 思念的守護 `godie-i06b` | 3050 | 米索莉護板 950g + 熱戀魔杖 1100g + 思念的守護製作書 1000g | 3050 | `OKv` |
| 1 | 惡魔吉他 `godie-i02k` | 9065 | 牛蒡男 0g + 吸血石 1250g | 1250 | `XIv` |
| 1 | 戰旗 `godie-i02h` | 9065 | 斯巴達圓盾 0g + 復仇之玉 1450g | 1450 | `XBv` |
| 1 | 斬岩刃 `godie-i02x` | 3450 | 斬岩刃製作書 800g + 恐龍之斧 1050g + 奧理哈魯根劍身 1600g | 3450 | `Xtv` |
| 1 | 晨曦之光 `godie-i016` | 5550 | 初心者寶石 2450g + 晨曦之光製作書 0g + 觀音菩薩護身符 1650g + 真知之石 950g | 5050 | `OZv` |
| 1 | 海潮泰坦護盾 `godie-i035` | 0 | 泰坦之魂 0g + 澤之書 2785g | 2785 | `Xiv` |
| 1 | 消失的密室 `godie-i02d` | 40000 | 隱密介紹信 1000g + 熱舞之靴 500g + 破壞王手套 650g | 2150 | `AOv` |
| 1 | 火焰泰坦腰帶 `godie-i01k` | 0 | 火之書 2040g + 泰坦之魂 0g | 2040 | `E7v` |
| 1 | 火閃電 `godie-i041` | 2950 | 火閃電製作書 1500g + 熱舞之靴 500g + 求生護腕 950g | 2950 | `OQv` |
| 1 | 熾天使之弓 `godie-i012` | 3350 | 熾天使之弓製作書 500g + 奧理哈魯根劍身 1600g + 血羽之心 1250g | 3350 | `Xzv` |
| 1 | 瑪那魔杖 `godie-i020` | 3000 | 熱戀魔杖 1100g + 瑪那魔杖製作書 1500g + 嚇人假面 0g | 2600 | `Xqv` |
| 1 | 盾甲天書 `godie-i02t` | 7635 | 山之書 2785g + 澤之書 2785g + 盾甲天書製作書 2500g | 8070 | `I8v` |
| 1 | 祕銀鎖子甲 `godie-i01w` | 3100 | 米索莉護板 950g + 祕銀鎖子甲製作書 1500g + 辣妹護腕 650g | 3100 | `OHv` |
| 1 | 聖誕之靴 `godie-i00p` | 1650 | 聖誕之靴製作書 500g + 熱舞之靴 500g + 破壞王手套 650g | 1650 | `OMv` |
| 1 | 蜂蜜罐 `godie-i05y` | 0 | 空罐頭 0g + 世界樹的果實 1800g | 1800 | `XGv` |
| 1 | 貫雷槍 `godie-i01g` | 4300 | 貫雷槍製作書 2000g + 恐龍之斧 1050g + 血羽之心 1250g | 4300 | `X9v` |
| 1 | 賢者之石 `godie-i049` | 3450 | 初心者寶石 2450g + 賢者之石製作書 1000g | 3450 | `OFv` |
| 1 | 雷神之鎚 `godie-i01i` | 7990 | 風之書 1950g + 火之書 2040g + 雷神之鎚製作書 4000g | 7990 | `ISv` |
| 1 | 風行天衣 `godie-i00c` | 5500 | 風行天衣製作書 1000g + 風之書 1950g + 林之書 2550g | 5500 | `IPv` |
| 1 | 黑核晶 `godie-i01m` | 1800 | 黑核晶製作書 150g + 嚇人假面 0g + 瑪那寶石 1250g | 1400 | `ONv` |
| 1 | 黑色魔書 `godie-i030` | 6235 | 山之書 2785g + 風之書 1950g + 黑色魔書製作書 1500g | 6235 | `I0v` |
| 1 | 龍騎士之劍 `godie-i06s` | 3350 | 武聖手鐲 950g + 龍騎士之劍製作書 800g + 血羽之心 1250g | 3000 | `Xmv` |
| 2 | 光魔杖 `godie-i027` | 6700 | 光魔杖製作書 3700g + 瑪那魔杖\* 3000g | 6700 | `Rdv` |
| 2 | 冰晶虎魄 - 改 `godie-i04d` | 7900 | 冰晶虎魄\* 4150g + 冰晶虎魄 - 改製作書 3750g | 7900 | `Ruv` |
| 2 | 失心匕首 `godie-i05h` | 8000 | 失心匕首製作書 4000g + 名刀-天狼\* 4000g | 8000 | `Rlv` |
| 2 | 奇門盾甲 `godie-i00j` | 6550 | 奇門遁甲製作書 4700g + 一克拉鑽戒\* 1850g | 6550 | `IBv` |
| 2 | 妖物碎殺牙 `godie-i06a` | 8850 | 妖刀村正\* 3350g + 妖物碎殺牙製作書 5500g | 8850 | **declared only** |
| 2 | 寂靜刃 - 詠月 `godie-i045` | 4000 | 黑核晶\* 1800g + 寂靜刃 - 詠月製作書 2200g | 4000 | `Ryv` |
| 2 | 幻之匕首 `godie-i039` | 7600 | 和道一文字\* 3100g + 幻之匕首製作書 4500g | 7600 | `Rvv` |
| 2 | 惡夢魔王碎片 `godie-i067` | 6300 | 黑核晶\* 1800g + 惡夢魔王碎片製作書 4500g | 6300 | `Iiv` |
| 2 | 斬龍刀 `godie-i06d` | 7850 | 斬龍刀製作書 4500g + 龍騎士之劍\* 3350g | 7850 | `Rrv` |
| 2 | 月神槍 `godie-i06f` | 7200 | 月神槍製作書 4150g + 思念的守護\* 3050g | 7200 | `R3v` |
| 2 | 朗基努斯之槍 `godie-i018` | 8050 | 貫雷槍\* 4300g + 朗基努斯之槍製作書 3750g | 8050 | `Rsv` |
| 2 | 死之王的意志 `godie-i060` | 7500 | 女神之淚\* 2900g + 死之王意志的碎片 4600g | 7500 | `IDv` |
| 2 | 死之王的神盾 `godie-i061` | 7100 | 祕銀鎖子甲\* 3100g + 死之王神盾的碎片 4000g | 7100 | `IGv` |
| 2 | 死之王的長槍 `godie-i01d` | 8600 | 貫雷槍\* 4300g + 死之王長槍的碎片 4300g | 8600 | `IJv` |
| 2 | 死神裝束 `godie-i01o` | 6150 | 聖誕之靴\* 1650g + 死神裝束製作書 4500g | 6150 | `R7v` |
| 2 | 殺豬刀 `godie-i06g` | 10000 | 殺豬刀製作書 5500g + 龍騎士之劍\* 3350g | 8850 | **declared only** |
| 2 | 炎神弩 `godie-i06i` | 7350 | 熾天使之弓\* 3350g + 炎神弩製作書 4000g | 7350 | `Rjv` |
| 2 | 炎龍巨弩 `godie-i00i` | 7500 | 熾天使之弓\* 3350g + 炎龍巨弩製作書 4150g | 7500 | `IIv` |
| 2 | 狂暴軒轅劍 `godie-i02e` | 8100 | 八取武士刀\* 3100g + 狂暴軒轅劍製作書 5000g | 8100 | `Iev` |
| 2 | 甘豆腐之袍 `godie-i03f` | 8000 | 伊娃之盾\* 4000g + 甘豆腐之袍製作書 4000g | 8000 | `ILv` |
| 2 | 破甲槍 `godie-i040` | 8000 | 分手之鎚\* 4000g + 破甲槍製作書 4000g | 8000 | `Rpv` |
| 2 | 螺旋劍 `godie-i01v` | 9750 | 天叢雲劍\* 5050g + 螺旋劍製作書 4700g | 9750 | `IEv` |
| 2 | 雅典娜的驚嘆號 `godie-i006` | 7500 | 瑪那魔杖\* 3000g + 雅典娜的驚嘆號製作書 4500g | 7500 | `RVv` |
| 2 | 霸王槍 `godie-i00f` | 7100 | 霸王槍製作書 3650g + 斬岩刃\* 3450g | 7100 | `Rgv` |
| 2 | 靈魂魔石 `godie-i01j` | 5650 | 女神之淚\* 2900g + 靈魂魔石製作書 2750g | 5650 | `R_v` |
| 3 | 雅典娜的驚嘆號．改 `godie-i03c` | 12000 | 雅典娜的驚嘆號\* 7500g + 雅典娜的驚嘆號製作書 4500g | 12000 | `RRv` |
| 4 | 真．雅典娜的驚嘆號 `godie-i03b` | 16500 | 雅典娜的驚嘆號製作書 4500g + 雅典娜的驚嘆號．改\* 12000g | 16500 | `Rbv` |

Only one recipe consumes two copies of the same component: 八取武士刀 = 恐龍之斧 ×2 +
八取武士刀製作書. In the JASS (`Xkv`) this is done by removing one 恐龍之斧, re-testing for a
second (`XJv`), and handing the first one back if there is no second.

## Declared but never implemented — 3

These three 製作書 sit in `content/items`, cost real gold, and describe a recipe in their
tooltip — but **no JASS trigger implements them**. They were dead weight in the original map too,
which means 妖刀村正 / 妖物碎殺牙 / 殺豬刀 were never obtainable by crafting.

| Book | Cost | Tooltip recipe | Target item |
|---|---:|---|---|
| 妖刀村正製作書 `godie-i023` | 500 | 吸血石 + 奧理哈魯根劍身 + 妖刀村正製作書 | 妖刀村正 `godie-i007` 3350g |
| 妖物碎殺牙製作書 `godie-i02b` | 5500 | 妖刀村正 + 妖物碎殺牙製作書 | 妖物碎殺牙 `godie-i06a` 8850g |
| 殺豬刀製作書 `godie-i04m` | 5500 | 龍騎士之劍 + 殺豬刀製作書 | 殺豬刀 `godie-i06g` 10000g |

## Classification for task #70

### 1. Component-only 製作書 — 55 items, every one with 0 modifiers

Buyable no-ops whose only purpose was to be consumed (52 of them by a real recipe, 3 by a recipe
that was never coded). With no crafting they have **no reason to exist on any player-facing
surface**. This is the unambiguous drop list.

<details><summary>All 55</summary>

| Book | Cost | Consumed by N recipes |
|---|---:|---:|
| 殺豬刀製作書 `godie-i04m` | 5500 | 1 |
| 妖物碎殺牙製作書 `godie-i02b` | 5500 | 1 |
| 狂暴軒轅劍製作書 `godie-i02c` | 5000 | 1 |
| 奇門遁甲製作書 `godie-i04g` | 4700 | 1 |
| 螺旋劍製作書 `godie-i03z` | 4700 | 1 |
| 雅典娜的驚嘆號製作書 `godie-i026` | 4500 | 3 |
| 斬龍刀製作書 `godie-i029` | 4500 | 1 |
| 幻之匕首製作書 `godie-i03a` | 4500 | 1 |
| 惡夢魔王碎片製作書 `godie-i025` | 4500 | 1 |
| 死神裝束製作書 `godie-i02f` | 4500 | 1 |
| 月神槍製作書 `godie-i028` | 4150 | 1 |
| 炎龍巨弩製作書 `godie-i04h` | 4150 | 1 |
| 炎神弩製作書 `godie-i02a` | 4000 | 1 |
| 雷神之鎚製作書 `godie-i01l` | 4000 | 1 |
| 破甲槍製作書 `godie-i03x` | 4000 | 1 |
| 失心匕首製作書 `godie-i00b` | 4000 | 1 |
| 甘豆腐之袍製作書 `godie-i03g` | 4000 | 1 |
| 冰晶虎魄 - 改製作書 `godie-i04e` | 3750 | 1 |
| 朗基努斯之槍製作書 `godie-i024` | 3750 | 1 |
| 光魔杖製作書 `godie-i01q` | 3700 | 1 |
| 霸王槍製作書 `godie-i019` | 3650 | 1 |
| 嗜血邪書製作書 `godie-i036` | 3000 | 1 |
| 天地崩裂魔杖製作書 `godie-i03i` | 2750 | 1 |
| 靈魂魔石製作書 `godie-i02w` | 2750 | 1 |
| 盾甲天書製作書 `godie-i02z` | 2500 | 1 |
| 奇蹟之墜製作書 `godie-i02s` | 2500 | 1 |
| 寂靜刃 - 詠月製作書 `godie-i044` | 2200 | 1 |
| 厄夜鐮刀製作書 `godie-i04k` | 2000 | 1 |
| 貫雷槍製作書 `godie-i01h` | 2000 | 1 |
| 冰晶虎魄製作書 `godie-i04c` | 2000 | 1 |
| 名刀-天狼製作書 `godie-i011` | 1750 | 1 |
| 火閃電製作書 `godie-i042` | 1500 | 1 |
| 祕銀鎖子甲製作書 `godie-i017` | 1500 | 1 |
| 瑪那魔杖製作書 `godie-i015` | 1500 | 1 |
| 伊娃之盾製作書 `godie-i01u` | 1500 | 1 |
| 天生牙製作書 `godie-i032` | 1500 | 1 |
| 黑色魔書製作書 `godie-i02u` | 1500 | 1 |
| 和道一文字製作書 `godie-i01e` | 1200 | 1 |
| 分手之鎚製作書 `godie-i009` | 1150 | 1 |
| 風行天衣製作書 `godie-i00h` | 1000 | 1 |
| 天叢雲劍製作書 `godie-i021` | 1000 | 1 |
| 賢者之石製作書 `godie-i04a` | 1000 | 1 |
| 八取武士刀製作書 `godie-i01z` | 1000 | 1 |
| 思念的守護製作書 `godie-i01x` | 1000 | 1 |
| 斬岩刃製作書 `godie-i02y` | 800 | 1 |
| 龍騎士之劍製作書 `godie-i022` | 800 | 1 |
| 光明虎徹製作書 `godie-i03e` | 600 | 1 |
| 熾天使之弓製作書 `godie-i01y` | 500 | 1 |
| 妖刀村正製作書 `godie-i023` | 500 | 1 |
| 聖誕之靴製作書 `godie-i01p` | 500 | 1 |
| 刺針製作書 `godie-i00a` | 500 | 1 |
| 女神之淚製作書 `godie-i069` | 350 | 1 |
| 一克拉鑽戒製作書 `godie-i01r` | 150 | 1 |
| 黑核晶製作書 `godie-i02v` | 150 | 1 |
| 晨曦之光製作書 `godie-i01t` | 0 | 1 |

</details>

### 2. Component-only base items — 42 items

**Not automatically droppable.** Unlike the books, most carry real modifiers and were
individually purchasable, so each needs a judgement call as a standalone arena item. The ones
with `mods = 0` are the clear drops — they were pure crafting currency.

| Item | Cost | Mods | Used by | Note |
|---|---:|---:|---:|---|
| 死之王意志的碎片 `godie-i03p` | 4600 | 0 | 1 | 0 modifiers — pure crafting currency |
| 死之王長槍的碎片 `godie-i03o` | 4300 | 0 | 1 | 0 modifiers — pure crafting currency |
| 死之王神盾的碎片 `godie-i03q` | 4000 | 0 | 1 | 0 modifiers — pure crafting currency |
| 澤之書 `godie-i02q` | 2785 | 0 | 4 | 0 modifiers — pure crafting currency |
| 山之書 `godie-i00r` | 2785 | 0 | 4 | 0 modifiers — pure crafting currency |
| 林之書 `godie-i01b` | 2550 | 0 | 3 | 0 modifiers — pure crafting currency |
| 初心者寶石 `godie-i005` | 2450 | 3 | 5 |  |
| 火之書 `godie-i01c` | 2040 | 0 | 4 | 0 modifiers — pure crafting currency |
| 風之書 `godie-i00t` | 1950 | 0 | 5 | 0 modifiers — pure crafting currency |
| 世界樹的果實 `godie-i05g` | 1800 | 0 | 1 | 0 modifiers — pure crafting currency |
| 奇美拉之翼 `godie-i00g` | 1750 | 6 | 1 |  |
| 觀音菩薩護身符 `godie-i05w` | 1650 | 0 | 1 | 0 modifiers — pure crafting currency |
| 奧理哈魯根劍身 `godie-i06k` | 1600 | 1 | 7 |  |
| 聖光石 `godie-i003` | 1450 | 1 | 1 |  |
| 復仇之玉 `godie-i066` | 1450 | 0 | 2 | 0 modifiers — pure crafting currency |
| 瑪那寶石 `godie-i068` | 1250 | 1 | 2 |  |
| 吸血石 `godie-i05r` | 1250 | 1 | 2 |  |
| 血羽之心 `godie-i06p` | 1250 | 2 | 4 |  |
| 寶石碎片 `godie-i065` | 1150 | 1 | 4 |  |
| 熱戀魔杖 `godie-i010` | 1100 | 2 | 4 |  |
| 恐龍之斧 `godie-i06c` | 1050 | 2 | 5 |  |
| 隱密介紹信 `godie-i037` | 1000 | 0 | 1 | 0 modifiers — pure crafting currency |
| 真知之石 `godie-i06m` | 950 | 0 | 3 | 0 modifiers — pure crafting currency |
| 求生護腕 `godie-i06h` | 950 | 3 | 2 |  |
| 米索莉護板 `godie-i00m` | 950 | 2 | 3 |  |
| 武聖手鐲 `godie-i002` | 950 | 1 | 1 |  |
| 辣妹護腕 `godie-i05x` | 650 | 1 | 1 |  |
| 破壞王手套 `godie-i05v` | 650 | 1 | 4 |  |
| 熱舞之靴 `godie-i05u` | 500 | 1 | 3 |  |
| 定情戒指 `godie-i05t` | 400 | 1 | 1 |  |
| 網友手環 `godie-i02p` | 0 | 1 | 2 | quest / score token |
| 四魂之玉的碎片-幸魂 `godie-i00x` | 0 | 2 | 1 | quest / score token |
| 四魂之玉的碎片-和魂 `godie-i00w` | 0 | 6 | 1 | quest / score token |
| 四魂之玉的碎片-荒魂 `godie-i00v` | 0 | 2 | 1 | quest / score token |
| 空罐頭 `godie-i02o` | 0 | 0 | 1 | 0 modifiers — pure crafting currency; quest / score token |
| 仙后座殘骸 `godie-i053` | 0 | 0 | 1 | 0 modifiers — pure crafting currency; quest / score token |
| 泰坦之魂 `godie-i02i` | 0 | 0 | 3 | 0 modifiers — pure crafting currency; quest / score token |
| 嚇人假面 `godie-i05s` | 0 | 1 | 3 | quest / score token |
| 四魂之玉的碎片-奇魂 `godie-i00y` | 0 | 2 | 1 | quest / score token |
| 舊系服 `godie-i02l` | 0 | 0 | 1 | 0 modifiers — pure crafting currency; quest / score token |
| 斯巴達圓盾 `godie-i02n` | 0 | 0 | 1 | 0 modifiers — pure crafting currency; quest / score token |
| 牛蒡男 `godie-i02m` | 0 | 0 | 1 | 0 modifiers — pure crafting currency; quest / score token |

### 3. Intermediates — 21 items

Crafted, then consumed. Each is a genuine statted item, so each is a *judgement call*: keep as a
mid-cost standalone, or drop as a stepping stone. Note 妖刀村正 is an intermediate only in a
recipe that was never implemented, so in practice it always behaved as a final item.

| Item | Cost | Mods | Feeds N recipes |
|---|---:|---:|---:|
| 雅典娜的驚嘆號．改 `godie-i03c` | 12000 | 1 | 1 |
| 雅典娜的驚嘆號 `godie-i006` | 7500 | 1 | 1 |
| 天叢雲劍 `godie-i014` | 5050 | 3 | 1 |
| 貫雷槍 `godie-i01g` | 4300 | 5 | 2 |
| 冰晶虎魄 `godie-i04b` | 4150 | 4 | 1 |
| 名刀-天狼 `godie-i00u` | 4000 | 1 | 1 |
| 分手之鎚 `godie-i00n` | 4000 | 1 | 1 |
| 伊娃之盾 `godie-i00q` | 4000 | 1 | 1 |
| 斬岩刃 `godie-i02x` | 3450 | 3 | 1 |
| 熾天使之弓 `godie-i012` | 3350 | 2 | 2 |
| 龍騎士之劍 `godie-i06s` | 3350 | 1 | 2 |
| 妖刀村正 `godie-i007` | 3350 | 2 | 1 |
| 祕銀鎖子甲 `godie-i01w` | 3100 | 1 | 1 |
| 八取武士刀 `godie-i013` | 3100 | 3 | 1 |
| 和道一文字 `godie-i01f` | 3100 | 1 | 1 |
| 思念的守護 `godie-i06b` | 3050 | 3 | 1 |
| 瑪那魔杖 `godie-i020` | 3000 | 1 | 2 |
| 女神之淚 `godie-i00k` | 2900 | 1 | 2 |
| 一克拉鑽戒 `godie-i06r` | 1850 | 1 | 1 |
| 黑核晶 `godie-i01m` | 1800 | 2 | 2 |
| 聖誕之靴 `godie-i00p` | 1650 | 2 | 1 |

### 4. Final products — 49 items

Never a component of anything: the map's intended end-state items.

<details><summary>All 49</summary>

| Item | Cost | Mods |
|---|---:|---:|
| 消失的密室 `godie-i02d` | 40000 | 5 |
| 真．雅典娜的驚嘆號 `godie-i03b` | 16500 | 1 |
| 殺豬刀 `godie-i06g` | 10000 | 3 |
| 螺旋劍 `godie-i01v` | 9750 | 3 |
| 戰旗 `godie-i02h` | 9065 | 1 |
| 復仇之袍 `godie-i02j` | 9065 | 0 |
| 惡魔吉他 `godie-i02k` | 9065 | 2 |
| 妖物碎殺牙 `godie-i06a` | 8850 | 2 |
| 死之王的長槍 `godie-i01d` | 8600 | 4 |
| 狂暴軒轅劍 `godie-i02e` | 8100 | 3 |
| 朗基努斯之槍 `godie-i018` | 8050 | 5 |
| 失心匕首 `godie-i05h` | 8000 | 1 |
| 甘豆腐之袍 `godie-i03f` | 8000 | 1 |
| 破甲槍 `godie-i040` | 8000 | 1 |
| 雷神之鎚 `godie-i01i` | 7990 | 0 |
| 冰晶虎魄 - 改 `godie-i04d` | 7900 | 4 |
| 斬龍刀 `godie-i06d` | 7850 | 1 |
| 嗜血邪書 `godie-i038` | 7735 | 0 |
| 盾甲天書 `godie-i02t` | 7635 | 0 |
| 幻之匕首 `godie-i039` | 7600 | 1 |
| 天地崩裂魔杖 `godie-i03h` | 7575 | 0 |
| 死之王的意志 `godie-i060` | 7500 | 2 |
| 炎龍巨弩 `godie-i00i` | 7500 | 3 |
| 炎神弩 `godie-i06i` | 7350 | 3 |
| 月神槍 `godie-i06f` | 7200 | 4 |
| 死之王的神盾 `godie-i061` | 7100 | 2 |
| 霸王槍 `godie-i00f` | 7100 | 3 |
| 奇蹟之墜 `godie-i02r` | 6700 | 3 |
| 光魔杖 `godie-i027` | 6700 | 3 |
| 厄夜鐮刀 `godie-i04i` | 6590 | 1 |
| 奇門盾甲 `godie-i00j` | 6550 | 2 |
| 天生牙 `godie-i031` | 6400 | 1 |
| 惡夢魔王碎片 `godie-i067` | 6300 | 2 |
| 黑色魔書 `godie-i030` | 6235 | 0 |
| 死神裝束 `godie-i01o` | 6150 | 5 |
| 靈魂魔石 `godie-i01j` | 5650 | 1 |
| 晨曦之光 `godie-i016` | 5550 | 3 |
| 風行天衣 `godie-i00c` | 5500 | 1 |
| 刺針 `godie-i05o` | 5500 | 3 |
| 光明虎徹 `godie-i03d` | 5450 | 3 |
| 寂靜刃 - 詠月 `godie-i045` | 4000 | 2 |
| 賢者之石 `godie-i049` | 3450 | 6 |
| 火閃電 `godie-i041` | 2950 | 2 |
| 四魂之玉 `godie-i00z` | 0 | 6 |
| 火焰泰坦腰帶 `godie-i01k` | 0 | 1 |
| 大地泰坦角盔 `godie-i034` | 0 | 1 |
| 海潮泰坦護盾 `godie-i035` | 0 | 2 |
| 仙后座 `godie-i01s` | 0 | 1 |
| 蜂蜜罐 `godie-i05y` | 0 | 2 |

</details>

### 5. Untouched by any recipe — 41 items

Neither product nor component. Already complete on pickup; removing crafting does not affect
them at all.

<details><summary>All 41</summary>

| Item | Cost | Mods |
|---|---:|---:|
| 丈八蛇矛 `godie-i000` | 10000 | 3 |
| 出動怨念射手兵團 `godie-i001` | 1200 | 0 |
| 魔戒 `godie-i004` | 44444 | 3 |
| 初級傳送捲軸 `godie-i008` | 600 | 6 |
| 出動戀愛戰士兵團 `godie-i00d` | 1600 | 0 |
| 出動兄貴戰士兵團 `godie-i00e` | 1600 | 0 |
| 落魂的嗜血劍 `godie-i00l` | 11500 | 1 |
| 金雞蛋 `godie-i00o` | 0 | 0 |
| 黃金聖鬥衣 `godie-i00s` | 10000 | 5 |
| 好像有毒的生肉 `godie-i01a` | 0 | 0 |
| 天堂之劍 `godie-i01n` | 0 | 1 |
| 奇美拉之翼(電腦) `godie-i02g` | 1750 | 6 |
| 初心者護腕 `godie-i033` | 1400 | 4 |
| 黃昏公主的血脈 `godie-i03j` | 450 | 3 |
| 我愛一條柴 `godie-i03l` | 200 | 0 |
| 反射之盾 `godie-i03m` | 10000 | 1 |
| 餅乾 `godie-i03n` | 150 | 0 |
| 金幣(寶箱) `godie-i04j` | 0 | 0 |
| 正義之杖 `godie-i04v` | 100000 | 3 |
| 兌換空罐頭 `godie-i04y` | 0 | 0 |
| 兌換仙后座 `godie-i051` | 0 | 0 |
| 認領寵物 `godie-i054` | 0 | 0 |
| 兌換牛蒡男 `godie-i055` | 0 | 0 |
| 交換寵物 `godie-i056` | 0 | 0 |
| 兌換舊系服 `godie-i059` | 0 | 0 |
| 兌換泰坦之魂 `godie-i05a` | 0 | 0 |
| 兌換斯巴達圓盾 `godie-i05e` | 0 | 0 |
| 打我阿笨蛋卷軸 `godie-i05k` | 600 | 6 |
| 力量護腕 `godie-i05l` | 1400 | 1 |
| 敏捷護腕 `godie-i05m` | 1400 | 1 |
| 智慧護腕 `godie-i05n` | 1400 | 1 |
| 友情呼喚號角 `godie-i05q` | 2800 | 1 |
| 出動正義射手兵團 `godie-i05z` | 1200 | 0 |
| 飛鼠跳刀 `godie-i062` | 1550 | 1 |
| 防狼電擊棒 `godie-i063` | 1400 | 2 |
| 月牙魔杖 `godie-i06e` | 10000 | 1 |
| 獸人船長十字鎬 `godie-i06j` | 0 | 1 |
| 生肉 `godie-i06l` | 150 | 0 |
| 老衲的棒子 `godie-i06n` | 0 | 1 |
| 血染八月 `godie-i06o` | 12000 | 1 |
| 鍊金術之盾 `godie-i06q` | 15000 | 2 |

</details>

## Side findings

- **Two items whose `name` equals their `id`** (the task #47 I3 failure) are recoverable from
  the w3u purchase tooltip: `godie-i065` = **寶石碎片** (1150g, `生命+320`), `godie-i06p` =
  **血羽之心** (1250g, `敏捷+10`). Both are heavily-used components (4 recipes each). Fixing the
  names is independent of this task, but the data is here.
- **`godie-i02d` 消失的密室** costs 40 000g and is crafted from 2 150g of parts — a joke item,
  far outside the arena gold ceiling either way.
- **`godie-i02j` 復仇之袍, `godie-i02k` 惡魔吉他, `godie-i02h` 戰旗** all cost exactly 9 065g:
  a sentinel price for 積分獎勵 finals, which were meant to be earned rather than bought.
- **"0 modifiers" is only proof of inertness for the 製作書.** All 55 books have zero modifiers
  *and* zero abilities and zero base-item inheritance (`ITEM_GAP.json`, `cat: "recipe"`) — they
  really are no-ops. But 21 *other* statless items do carry abilities the importer never ported,
  so their emptiness is an import gap, not a design fact. `godie-i02j` 復仇之袍 (9 065g final,
  0 modifiers) is one: its effect lives in ability `A0XK`. Do not use "0 modifiers" alone as a
  drop criterion outside the book list.

## Machine-readable form

`docs/content/wc3-crafting-tree.json` — the same data with rawcodes, content ids, per-recipe
component lists (including quantities), depths, and the five classification buckets.
