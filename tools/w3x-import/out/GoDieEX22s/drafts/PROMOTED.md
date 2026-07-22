# Draft promotion — 25 heroes → voxel stand-in champions

Date: 2026-07-21 · Task #31A · All 25 drafts in `drafts/champions/` were promoted to
`content/champions/godie-*.json` (NEW files only; no existing doc touched, no index rebuilt —
`content:build` reindex happens in the main session).

These heroes' original WC3 models are **Blizzard built-ins** (`units\...` / `buildings\...`
paths, or inherited from the base unit) — not extractable from the map archive. Per explicit
user directive they ship with the **default KayKit voxel block characters** as stand-ins until
real models exist. Each doc is tagged **`voxel-standin`** for the later swap. The champion@1
schema has no free-comment field, so the original rawcode/model path is recorded here instead.

Collision/scale come from the referenced model@1 docs verbatim (`collisionRadius 0.6`,
voxel-native scale 1.0 / 0.55) — same as the skeleton voxel champions sela/thorne; the w3x
`scale` column is intentionally NOT applied to voxel proportions.

## Model heuristic

- **ranged** (large attackRange) or **INT-primary** → `champ.sela` (mage.glb)
- **STR-primary melee tank** (high hp/armor, modest AD) → `champ.thorne` (knight.glb)
- **STR / high-damage melee** → `champ.skin.barbarian` (barbarian.glb)
- **AGI-primary melee** → `champ.skin.rogue` (rogue.glb)

Primary attribute inferred from `parsed/heroes.json` (`str/agi/int` base + growth; the w3u
`primary_attr` column is mostly null in this table).

Distribution: mage 11 (9 ranged + 2 INT melee) · knight 6 · barbarian 4 · rogue 4.

## Roster

| Champion id | Name | Raw | Base | Original WC3 model (Blizzard built-in) | Prim/atk | Voxel model |
| --- | --- | --- | --- | --- | --- | --- |
| godie-e00r | 最終泛用人型決戰兵器 - 初號機 | E00R | Eill | units\creeps\SatyrTrickster\SatyrTrickster.mdl | AGI melee | champ.skin.rogue |
| godie-e00s | 白木老樹精 - 白木卡迪那 | E00S | Ecen | buildings\nightelf\AncientProtector\AncientProtector.mdl | INT ranged | champ.sela |
| godie-e00t | 七夜怪談 - 貞子 | E00T | Ewrd | units\creeps\BansheeGhost\BansheeGhost.mdl | INT ranged | champ.sela |
| godie-e00u | 完全而瀟灑的女僕 - 十六夜Sakuya | E00U | Ewrd | units\nightelf\Runner\Runner.mdl | AGI ranged | champ.sela |
| godie-e00v | 百畝森林的霸主 - 維尼 | E00V | Ewrd | units\creeps\PolarBear\PolarBear.mdl | STR melee (AD 40) | champ.skin.barbarian |
| godie-e010 | 白木老樹精 - 白木卡迪那 | E010 | Ecen | buildings\nightelf\AncientProtector\AncientProtector.mdl | INT ranged | champ.sela |
| godie-e015 | 夜市人生 - 金居福 | E015 | Edem | units\human\HeroMountainKing\HeroMountainKing.mdl | STR melee tank | champ.thorne |
| godie-h001 | 地獄來襲者 - 斑剎 | H001 | Hblm | (inherits Hblm built-in) | INT melee | champ.sela |
| godie-h00w | 豪洨天王 - 鄭先生 | H00W | Harf | units\human\HeroPaladin\HeroPaladin.mdl | STR melee tank (armor 10) | champ.thorne |
| godie-h021 | 破銅爛鐵 - 阿強一號 | H021 | Hblm | units\critters\VillagerKid\VillagerKid.mdl | INT ranged | champ.sela |
| godie-h02k | 國寶級的畜生 - 熊貓 | H02K | Hblm | Units\Creeps\PandarenBrewmaster\PandarenBrewmaster.mdl | STR melee (AD 106) | champ.skin.barbarian |
| godie-h02n | 腦包英雄 - 打我阿笨蛋 | H02N | Hmgd | (inherits Hmgd built-in) | STR melee tank (HP 4002) | champ.thorne |
| godie-h02s | 死亡騎士 | H02S | Harf | (inherits Harf built-in) | STR melee tank | champ.thorne |
| godie-h02y | 幕末復仇狂者 - 志志雄真實 | H02Y | Hpal | units\demon\ChaosHellscream\ChaosHellscream.mdl | STR melee | champ.skin.barbarian |
| godie-h02z | 不良少年 | H02Z | Harf | (inherits Harf built-in) | STR melee tank | champ.thorne |
| godie-n00b | 小叮噹 - 哆拉A夢 | N00B | Ntin | Units\Creeps\StormPandarenBrewmaster\StormPandarenBrewmaster.mdl | INT melee | champ.sela |
| godie-n01b | 地獄歌神 - 憤怒的胖虎 | N01B | Nman | Units\Creeps\EarthPandarenBrewmaster\EarthPandarenBrewmaster.mdl | STR ranged | champ.sela |
| godie-n01l | 學姊 - 小派 | N01L | Nbrn | (inherits Nbrn built-in) | AGI melee | champ.skin.rogue |
| godie-o02n | 曹操孟德 - 阿瞞大人 | O02N | Ofar | units\demon\ChaosWolfRider\ChaosWolfRider.mdl | AGI melee | champ.skin.rogue |
| godie-o02o | 曹操孟德 - 阿瞞大人 | O02O | Ofar | units\demon\ChaosWolfRider\ChaosWolfRider.mdl | AGI melee | champ.skin.rogue |
| godie-o030 | 電車癡漢 - 臭作 | O030 | Orkn | (inherits Orkn built-in) | AGI ranged | champ.sela |
| godie-u00b | 最M的魔法Jizz - 清蒸 飛鼠先生 | U00B | Udea | (inherits Udea built-in) | STR melee (AD 52, MS 8) | champ.skin.barbarian |
| godie-u00k | 邪惡意念集合體 - 死之王 | U00K | Uwar | units\demon\EredarWarlock\EredarWarlock.mdl | INT ranged | champ.sela |
| godie-u012 | 重金屬樂團的怪物 - 克勞薩II世 | U012 | Udre | (inherits Udre built-in) | STR melee tank | champ.thorne |
| godie-u01f | 萬夫莫敵 - 黑化張飛 | U01F | Utic | units\orc\Grunt\Grunt.mdl | STR ranged | champ.sela |

Ranged heroes all map to `champ.sela` regardless of attribute because the mage rig is the only
voxel model whose attack clip (`Spellcast_Shoot`) reads as a ranged attack.

## Ability substitutions

**None.** Every promoted doc embeds its Q/W/E/R abilities in full (champion@1 embeds
`zAbilityDef`, it does not ref the abilities collection), and every hard ref inside them
already resolves against the EXISTING indexes:

- `buildPriority` items → all present in `content/items/_index.json`
- `spawnProjectile.projectileId` → all present in `content/projectiles/_index.json`
- `vfxKey` / `statusId` (soft refs) → all present in `content/vfx/` / `content/status-effects/`
- `modelKey` → the 4 voxel model docs above, present in `content/models/_index.json`

Importer-generated placeholder nukes for unconvertible WC3 skills (summons/illusions/`ANcl`
trigger scripts — e.g. godie-h001.e 召喚術) were kept as-is inside the embedded abilities; they
are already itemized in `import_report.json` → `notes` (the "194 佔位技能" set).

No `exAbility` was set: these 25 heroes are absent from `EX_MAP.json` (88 heroes + 3
withoutEx covers only the previous 91-champion roster). **Reconciliation note for the main
session:** after `content:build`, the `ex-map-subset` test (withEx + withoutEx == total godie
champions) will need EX_MAP.json's `withoutEx` (or a fresh extract_ex.py run) to account for
the 25 promoted heroes.

## Pruned (2026-07-21, user rule: keep all except duplicates)

| removed | duplicate of |
| --- | --- |
| godie-e010 | godie-e00s 白木老樹精 - 白木卡迪那 (kept: has 編號70+pool+EX) |
| godie-o02n | godie-o02o 曹操孟德 - 阿瞞大人 (kept: has 編號87) |
| godie-h00w | live godie-harf 豪洨天王 - 鄭先生 (transform form, same 編號26) |
| godie-n01b | live godie-nman 地獄歌神 - 憤怒的胖虎 (transform form, 編號40) |
| godie-o030 | live godie-orkn 電車癡漢 - 臭作 (transform form, 編號30) |
