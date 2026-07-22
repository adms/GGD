package curation

import "sort"

// The DEMO STARTER SET — the named, reviewable "make a fresh install playable"
// bundle (task #47).
//
// WHY IT EXISTS. The whitelist ships EMPTY on purpose (task #4): the imported
// WC3 tree carries 113 champions / 212 items / 554 abilities and none of it is
// vetted, so production must never enable content behind an operator's back.
// Correct, but hostile: a brand-new install has zero playable champions and
// champ-select shows nothing but an empty-state. This bundle is the answer —
// a SMALL, HAND-PICKED, DOCUMENTED set that a human applies on purpose.
//
// SECURITY CONTRACT (do not weaken):
//   - Nothing here is ever applied implicitly. Service.Get() still lazily
//     creates the EMPTY document and seeds nothing.
//   - Application is UNION-only (ApplyStarterSet) — it can never disable an
//     operator's choice.
//   - The automated path (cmd/seed -starter) additionally refuses to run
//     unless the whitelist is genuinely empty, so an operator who has already
//     curated is never re-expanded on the next restart.
//   - It is a SUGGESTION, not a floor: disable every id afterwards and the
//     install is empty again.
//
// THREE DOORS APPLY IT, all explicit:
//  1. ops console → 內容白名單 → 「⭐ 啟用示範組合」 (POST …/whitelist/starter,
//     audited as `curation.starter`).
//  2. `make seed-demo` — curl the same admin endpoint from a shell.
//  3. `seed -starter` / GGD_SEED_STARTER_WHITELIST=1 — headless/CI/fresh dev
//     box, default OFF, no-op when the whitelist already has a champion.
//
// ---------------------------------------------------------------------------
// SELECTION RULES (every one of them is asserted by
// TestStarterSetMatchesContentTree against the real content tree — the bundle
// cannot silently rot when content is re-imported):
//
// CHAMPIONS (13) — 113 candidates in, 13 out:
//
//	G1 not a test/placeholder hero (測試/範例/範本).
//	G2 the champion declares an icon AND the PNG exists on disk.
//	G3 the glb is genuinely TEXTURED: the body primitive paints with an image
//	   larger than the exporter's 8x8 grey placeholder, and the glb embeds no
//	   placeholder at all.
//	G4 silhouette in band: glb bbox height x model scale lands in 1.5–2.1u
//	   (the roster median is 1.745u), so the fixed camera and HUD read right.
//	G5 its OWN imported w3x model — 80 of 113 champions share one of four CC0
//	   stand-ins (champ.sela alone is worn by 18); no two picks share a model.
//	G6 every clipMap entry (idle/run/attack/cast/hurt/death) resolves to a real
//	   animation in the glb.
//	G7 ability set is COMPLETE and follows the task #11 hero-number convention:
//	   Q/W/E/R carry the 2-digit xx-0N prefix, the EX carries xx-00N, all five
//	   share ONE hero number, and all five standalone docs exist.
//	G8 the champion HAS an EX — the EX is the only ability the whitelist
//	   actually gates (MatchController.learnEx), so a champion without one
//	   would demo a dead hotkey.
//	G9 no two picks are the SAME CHARACTER, decided by the one shared IDENTITY
//	   RULE — the task #11 hero 編號 carried by the ability names, plus the
//	   display name. Source of truth:
//	   packages/shared/src/content/championIdentity.ts (ported for this gate in
//	   heroidentity_test.go and asserted by TestChampionIdentityRule).
//
//	   IDENTITY IS **NOT** THE MODEL AND **NOT** THE PORTRAIT. 80 of 113
//	   champions wear one of four CC0 stand-in meshes because their WC3 model
//	   was a Blizzard built-in (champ.sela alone is worn by 18 unrelated
//	   heroes), and w3x icon extraction handed the same PNG to several heroes
//	   (曹操孟德 wears 皮卡丘's). Treating either as "same hero" is what erased
//	   英靈-亞瑟王-黑化Saber (hero 69, its own 黑泥 kit) as a supposed duplicate
//	   of 亞瑟王-Saber (hero 20). G5 above still forbids two picks sharing a
//	   MESH, but for a presentation reason (the demo grid should not show the
//	   same body twice) — never as an identity claim.
//
//	   The rule leans lenient per the user's ruling
//	   「遇到疑慮一律判斷寬鬆為多英雄」: merging needs positive evidence, because
//	   a wrongly-merged champion vanishes with its kit while a wrongly-kept
//	   duplicate is cosmetic. Concretely for this bundle: e00n / n01g / hjai are
//	   excluded as genuine duplicate ENTRIES of e001 / n003 / h020, while u00l
//	   (hero 25 北斗之鼠-拳四郎) is excluded only by G5 — it wears the same
//	   imported.heropikachu mesh as the pick ofar. It is a real, distinct,
//	   curatable champion, just not a good second demo tile.
//
//	Spread is by KIT ARCHETYPE, not by the `role` field: the imported roster
//	only ever says fighter (79) or marksman (32), so a true role spread is
//	impossible today (filed as a follow-up). 7 melee / 5 ranged, covering
//	assassin, duelist, bruiser, tank, skirmisher, marksman, burst mage,
//	durable caster and support.
//
// ITEMS (104) — 212 in, 104 out, split across FOUR surfaces (task #70 drew the
// first two; task #82 split the third out of the shop and added the fourth;
// task #108 re-curated 7 mis-placed items across the shop/draft/legendary line).
// The bundle is not a hand-picked demo shelf; it is the whole shippable item
// catalogue, because every way to obtain an item is one of these four. The 104
// total is unchanged — task #108 moved items between surfaces, it added none.
//
//	SHOP       70  bought with gold, at one of exactly two prices
//	SERVICES    2  bought with gold, occupy no slot (orb + stat tick)
//	LEGENDARY  25  the round-5 card + the orb pool — NEVER purchasable
//	DRAFT       7  the round-2 quest card — free, never purchasable
//
// WHY THE SHOP WENT 92 -> 63 (task #82). All 29 legendary-weapons entries were
// ALSO in the shop list — 29 of 29 — which violates the user's rule
// 「傳說的武器道具，只能隨機三選一」 in every single case. They are not deleted
// and not un-whitelisted: they move to their own surface, stay reachable
// through the round-5 card and the 傳說寶玉, and simply stop having a price.
//
// THE GOVERNING DECISION (user, 2026-07-22):
// 「理論上競技場上的所有道具跟武器都不需要合成」 — there is NO CRAFTING IN THE
// ARENA AT ALL. Not "only final items are sold": there is no combine STEP
// anywhere. Every item a player can obtain is complete and immediately
// effective the moment they get it, and nothing is a stepping stone to
// anything. That is also already the engine's reality — the sim has never had
// combine/recipe logic; the WC3 recipes only ever lived in the map's JASS and
// were never ported. What leaked in was DATA: 55 recipe books plus the
// component items, sitting in content/items as buyable no-ops.
//
// The consequence for THIS file is the important one: the WC3 recipe tree
// (docs/content/wc3-crafting-tree.json) does NOT gate the shop. It is design
// history and a classification tool, nothing more. The gates below are stated
// purely in terms of facts the shipped content doc carries, and they happen to
// reproduce the classification exactly — which is the proof that the tree is
// not load-bearing:
//
//	SHOP (70) — a gold purchase during intermission:
//
//	S1 a real display name (name != id).
//	S2 cost is EXACTLY one of the two tier prices — 300 (SIMPLE) or 1200
//	   (POWERFUL). This is 統一化 and it is the whole point of task #82: inside
//	   the WC3 import price carried no information at all (正義之杖 cost
//	   100,000g for 6.75 AEP of stats; 恐龍之斧 cost 1,050g for 31.6), and price
//	   rank disagreed with VALUE rank on 41 of the 59 imported entries. A 0g
//	   item is not a shop entry at all; it is a draft reward.
//	   The prices live in packages/shared/src/sim/economy/itemTiers.ts.
//	S3 IT ACTUALLY DOES SOMETHING: at least one stat modifier or a passive
//	   hook. 18 "final" WC3 items and every one of the 55 recipe books carry
//	   neither — their whole payload is an active ability the item@1 schema
//	   cannot express yet (blocked on task #56 / the active-schema addition).
//	   Charging gold for those is strictly worse than not listing them. This is
//	   an EXCLUSION FROM THE SHOP LIST, not a deletion: the content files stay,
//	   and all 18 come back the moment item@1 grows an active slot.
//	S4 sane values. Asserted, but as of this writing NOTHING in content/items
//	   violates it — the extreme numbers task #47 recorded (ad 99999,
//	   critChance 2.75..10, a 0g item with 20000 maxHealth) are no longer in
//	   the shipped docs. All four critChance values are fractions (0.03, 0.15,
//	   0.15, 0.30); the largest ad is 158 and the largest maxHealth 960. The
//	   gate stays because a re-import can put them back.
//
//	S1-S4 admit ZERO recipe books and ZERO token/no-op items, and they admit 15
//	items the recipe tree calls "components". That is deliberate and it is NOT
//	crafting: with no combine logic a component is just a cheap stat stick, and
//	the governing decision only drops items whose ONLY reason to exist was
//	being a component — which is exactly the set S3 already rejects. Dropping
//	all 30 components instead would delete the entire native early game and
//	leave FOUR items buyable on the 600g starting purse.
//
//	DRAFT (7) — the free 3-choose-1 weapon card, granted on pick:
//
//	D1 a real display name, D2 cost == 0 (the WC3 quest/score rewards — items
//	   the shop cannot sell you), D3 it actually does something.
//	D4 NO 四魂之玉 SHARDS. D1-D3 pass all four 「四魂之玉的碎片-X」, and they are
//	   dropped anyway by an explicit policy call: in a game with no combining,
//	   an item literally named "shard OF the jewel" sitting next to the
//	   completed jewel is the single most likely thing to send a player hunting
//	   for a crafting UI that does not exist. Removing them removes the last
//	   artefact that re-suggests crafting. They are dropped OUTRIGHT — no shard
//	   is gated behind another, and the assembled 四魂之玉 is offered whole.
//
//	SERVICES (2) — a gold purchase that never occupies an inventory slot. Their
//	payload is CODE (packages/shared/src/sim/economy), not modifier data, so S3
//	would reject them and they get their own gates:
//
//	SV1 a real display name, SV2 cost > 0, SV3 the id is one the sim actually
//	    dispatches (isShopService in economy/itemTiers.ts) — a service the sim
//	    does not know about would take the player's gold and do nothing.
//
//	LEGENDARY (25) — the round-5 3-choose-1 pool and the 傳說寶玉 pool:
//
//	L1 a real display name, L2 it actually does something, L3 it is NOT on the
//	   shop surface. L3 is the user's rule made mechanical: the only routes to a
//	   legendary are the free round-5 card and the 2400g orb, which buys the
//	   ROLL and never the item.
//
//	LOOT CLOSURE (both tables). MatchController filters a weapon offer to the
//	whitelist and SKIPS the grant when nothing survives, so an under-seeded
//	bundle makes the round-2/round-5 cards silently give the player nothing.
//	Round 2 rolls `quest-rewards` (all 7 enabled here) and round 5 rolls
//	`legendary-weapons` (all 25 enabled here). The orb takes the same pool but
//	filters BEFORE rolling and refuses the sale when it is empty, so it can
//	never reproduce that failure.
//
//	BUILD TOLERANCE, not build closure. Task #47's I7 required every id in
//	every starter champion's buildPriority to be purchasable. That is no longer
//	achievable and no longer necessary. godie-i003 聖光石 (1450g) sits in SEVEN
//	starter builds and is an S3 casualty — its entire payload is a 500 HP heal
//	active, so the shipped doc carries no modifiers at all. content/champions is
//	owned by another task, so instead of rewriting champion data the BOT was
//	made tolerant: AIDriver now skips a buildPriority entry the whitelist
//	rejects rather than re-picking it every replan and stalling forever (which
//	is what the old code did — see nextBuildPurchase in ai/Tier0Brain.ts). The
//	surviving gate is that every starter champion keeps at least 4 purchasable
//	rungs, so every bot still climbs a real ladder.
//
//	THE ABOVE-CEILING PROBLEM IS GONE. Task #47 recorded 23 shop entries costing
//	more than the 7600g a match can produce, topping out at 正義之杖 at 100000g,
//	and said the fix was "an economy-wide repricing decision, not a curation
//	one". That decision is task #82: the most expensive thing in the shop is now
//	1200g, and the most expensive thing a player can buy at all is the 2400g
//	orb. The aboveCeiling ledger in the test is therefore EMPTY, and the gate
//	now asserts it stays empty.
//
// ABILITIES (65) — 13 champions x {q,w,e,r,ex}:
//
//	Only `.ex` is enforced today (a champion's Q/W/E/R are embedded in the
//	champion doc and ungated), but listing all five makes the bundle
//	self-describing and future-proofs it if gating widens. It also means there
//	is no such thing as a HALF-ENABLED champion in this set.
var (
	// 13 champions — 8 melee / 5 ranged, one archetype each.
	starterChampions = []string{
		"godie-e001", // 蟬在叫人壞掉 - 龍宮禮奈  melee  assassin (stealth opener, voice)
		"godie-e008", // 火霧戰士 - 夏娜          melee  duelist (mid-stat control champion)
		"godie-edem", // 寫輪眼復仇者 - 宇智波佐助 melee  burst assassin (longest melee reach)
		"godie-h01u", // 亂世癿王者 - 呂布奉先     melee  bruiser (stat-trade passive + damage aura)
		"godie-hart", // 最終幻想 - 克勞德         melee  heavy skirmisher (top of the height band)
		"godie-hpb1", // 獸矛傳承使 - 蒼月潮       melee  tank / juggernaut (640 HP, 50% DR barrier, voice)
		"godie-o02p", // 夢幻之星 - 初音           melee  enchanter (chain heal, team buff, 19 clips)
		"godie-etyr", // 治癒系公主 - 木乃香       ranged support / healer (cleanse, aura, 式神)
		"godie-h020", // 黑魔導士 - 莉娜因巴斯     ranged burst mage (the INT-scaling demo)
		"godie-n003", // 黑暗福音 - 依文潔琳       ranged durable dark caster (voice)
		"godie-o00k", // 傲嬌電氣老鼠 - 皮卡娘     ranged mobile burst caster (600u blink, voice)
		"godie-ofar", // 神奇寶貝兒 - 皮卡丘       ranged transform marksman (R flips ranged→melee, voice)
		// hero 69 — 英靈-亞瑟王 - 黑化Saber. Added by task #55 after the identity
		// rule was corrected. The OLD heuristics erased her twice over: she shares
		// imported.herosaber with hero 20 (Saber), and her portrait is byte-identical
		// to Saber's, so both the model-based and the icon-hash-based dedup folded
		// her away as a "duplicate". She is not one — she carries her own kit
		// (69-01 力量強化 / 69-02 黑泥召喚 / 69-03 約束與勝利之劍 / 69-04 魔力增幅 +
		// EX 69-002 固有結界-黑洞), and task #49's vertex tint renders her BLACK,
		// which is what distinguishes her on screen. Identity is the hero 編號, never
		// the model or the icon bytes. Passes all of G1-G9 + I7; displaces nothing.
		"godie-e00q", // 英靈-亞瑟王 - 黑化Saber   melee  STR bruiser (black-tinted Saber, own kit)
	}

	// 70 SHOP items — every content item that is priced, named and actually
	// does something (S1-S4), MINUS the 25 that the round-5 legendary card
	// owns. Grouped by the ONLY two prices that exist (task #82's 統一化):
	// SIMPLE 300g and POWERFUL 1200g. Within a group the order is the phase-1
	// value ranking, which is now the only ranking there is.
	starterShopItems = []string{
		// ---- SIMPLE, 300g (42). TWO of these are the whole 600g turn-1 purse.
		"ember-rod",   // Ember Rod  ap 31.6
		"godie-i002",  // 武聖手鐲  critChance 0.171 / critDamage 0.286
		"godie-i004",  // 魔戒  maxHealth 39 / ad 1.9 / maxMana 23
		"godie-i005",  // 初心者寶石  maxHealth 39 / ad 1.9 / maxMana 23
		"godie-i008",  // 初級傳送捲軸  maxHealth 32 / ad 1.6 / maxMana 19 / maxHealth 6 / ad 0.3 / maxMana 4
		"godie-i00g",  // 奇美拉之翼  maxHealth 32 / ad 1.6 / maxMana 19 / maxHealth 6 / ad 0.3 / maxMana 4
		"godie-i00k",  // 女神之淚  armor 17
		"godie-i00m",  // 米索莉護板  armor 2.1 / armor 14.9
		"godie-i00p",  // 聖誕之靴  ms 0.225 / as% 0.112
		"godie-i00q",  // 伊娃之盾  armor 17
		"godie-i010",  // 熱戀魔杖  ap 21.1 / maxMana 63
		"godie-i016",  // 晨曦之光  maxHealth 39 / ad 1.9 / maxMana 23
		"godie-i01f",  // 和道一文字  as% 0.154
		"godie-i01m",  // 黑核晶  maxMana 155 / manaRegen% 1.16
		"godie-i01w",  // 祕銀鎖子甲  armor 17  (task #108: demoted from LEGENDARY — mithril chainmail, defensive gear not a legendary weapon)
		"godie-i02d",  // 消失的密室  maxHealth 23 / ad 1.1 / maxMana 14 / ms 0.34
		"godie-i02p",  // 網友手環  armor 17  (task #108: demoted from DRAFT — a +4 armor meetup-token trinket)
		"godie-i033",  // 初心者護腕  armor 1.7 / maxHealth 35 / ad 1.7 / maxMana 21
		"godie-i03d",  // 光明虎徹  maxHealth 39 / ad 1.9 / maxMana 23
		"godie-i03f",  // 甘豆腐之袍  armor 17
		"godie-i03m",  // 反射之盾  armor 17
		"godie-i041",  // 火閃電  ms 0.828
		"godie-i05k",  // 打我阿笨蛋卷軸  maxHealth 6 / ad 0.3 / maxMana 4 / maxHealth 32 / ad 1.6 / maxMana 19
		"godie-i05l",  // 力量護腕  armor 17
		"godie-i05m",  // 敏捷護腕  armor 17
		"godie-i05n",  // 智慧護腕  armor 17
		"godie-i05o",  // 刺針  maxHealth 39 / ad 1.9 / maxMana 23
		"godie-i05r",  // 吸血石  lifesteal 0.266
		"godie-i05s",  // 嚇人假面  manaRegen% 3.0  (task #108: demoted from DRAFT — plain mana-regen mask; caps at 48% of SIMPLE)
		"godie-i05t",  // 定情戒指  healthRegen 3.3
		"godie-i05u",  // 熱舞之靴  ms 0.828
		"godie-i05v",  // 破壞王手套  as% 0.154
		"godie-i05x",  // 辣妹護腕  mr 37.8
		"godie-i061",  // 死之王的神盾  armor 14.2 / armor 2.8
		"godie-i063",  // 防狼電擊棒  maxMana 185 / manaRegen% 0.168
		"godie-i066",  // 復仇之玉  +passive
		"godie-i068",  // 瑪那寶石  maxMana 190
		"godie-i06b",  // 思念的守護  armor 2.8 / ap 17.6 / maxMana 53
		"godie-i06h",  // 求生護腕  maxHealth 39 / ad 1.9 / maxMana 23
		"godie-i06q",  // 鍊金術之盾  armor 11.3 / armor 5.7
		"godie-i06r",  // 一克拉鑽戒  armor 17
		"swift-boots", // Swift Boots  ms 0.828
		// ---- POWERFUL, 1200g (28). Worth exactly 4 SIMPLE items, in ONE slot.
		"godie-i006",    // 雅典娜的驚嘆號  ap 82.1 / maxMana 246 / manaRegen% 0.684
		"godie-i00j",    // 奇門盾甲  maxHealth 187 / healthRegen 3.9
		"godie-i00n",    // 分手之鎚  ad 26 +passive armor-shred  (task #108: demoted from LEGENDARY — a mundane-joke armor-shred hammer)
		"godie-i00s",    // 黃金聖鬥衣  ms 0.262 / maxHealth 44 / ad 2.2 / maxMana 26 / as% 0.393
		"godie-i01j",    // 靈魂魔石  maxHealth 218 / maxMana 136
		"godie-i01o",    // 死神裝束  maxHealth 55 / ad 2.8 / maxMana 33 / ms 0.333 / as% 0.333
		"godie-i020",    // 瑪那魔杖  ap 79 / maxMana 237 / manaRegen% 1.581  (task #108: demoted from LEGENDARY — generic caster stat-stick + chain-lightning active)
		"godie-i02g",    // 奇美拉之翼(電腦)  maxHealth 77 / ad 3.9 / maxMana 46 / maxHealth 77 / ad 3.9 / maxMana 46
		"godie-i02r",    // 奇蹟之墜  ap 29 / maxMana 87 / maxHealth 174
		"godie-i031",    // 天生牙  ad 8.2 / maxHealth 181
		"godie-i039",    // 幻之匕首  as% 0.616
		"godie-i03b",    // 真．雅典娜的驚嘆號  ap 81.6 / maxMana 245 / manaRegen% 0.816
		"godie-i03c",    // 雅典娜的驚嘆號．改  ap 81.8 / maxMana 245 / manaRegen% 0.767
		"godie-i040",    // 破甲槍  ad 26 +passive armor-shred  (task #108: demoted from LEGENDARY — identity is a stat function, armor-shred)
		"godie-i049",    // 賢者之石  maxHealth 77 / ad 3.9 / maxMana 46 / maxHealth 77 / ad 3.9 / maxMana 46
		"godie-i04b",    // 冰晶虎魄  ad 12.1 / maxHealth 76 / ap 17.3 / maxMana 52 +passive
		"godie-i04d",    // 冰晶虎魄 - 改  ad 12.6 / maxHealth 76 / ap 17.2 / maxMana 52 +passive
		"godie-i05h",    // 失心匕首  as% 0.616
		"godie-i05q",    // 友情呼喚號角  as% 0.616
		"godie-i05y",    // 蜂蜜罐  healthRegen 12.06 / manaRegen% 2.002 + 1500-HP heal active  (task #108: demoted from DRAFT — a fine POWERFUL consumable, a deflating legendary)
		"godie-i060",    // 死之王的意志  maxHealth 144 / healthRegen 6
		"godie-i067",    // 惡夢魔王碎片  maxMana 688 / manaRegen% 2.296
		"godie-i06a",    // 妖物碎殺牙  ad 22.2 / lifesteal 0.155
		"godie-i06c",    // 恐龍之斧  maxHealth 181 / ad 8.2
		"godie-i06k",    // 奧理哈魯根劍身  ad 26
		"godie-i06o",    // 血染八月  ad 16.7 +passive
		"ironhide-vest", // Ironhide Vest  armor 36.7 / maxHealth 122
		"serrated-edge", // Serrated Edge  ad 18.4 +passive
	}

	// 2 SHOP SERVICES — listings that take gold but never occupy a slot. They
	// are the two mechanics task #82 adds, shipped as real item@1 documents so
	// they carry a name and a description and the operator can disable them
	// like anything else. They are held in their OWN list because gates S1-S4
	// do not apply: a service has no modifiers by design (S3 would reject it),
	// and its payload is code in packages/shared/src/sim/economy, not data.
	//
	//	SV1 a real display name, SV2 cost > 0, SV3 the id is one the sim
	//	actually dispatches (isShopService in economy/itemTiers.ts).
	starterServiceItems = []string{
		"legendary-orb",   // 傳說寶玉 2400g — rolls a legendary 3-choose-1
		"stat-attunement", // 能力屬性強化 375g — the repeatable stat tick
	}

	// 25 LEGENDARY items — the round-5 3-choose-1 card and the 傳說寶玉 pool.
	// 「傳說的武器道具，只能隨機三選一」: NONE of these may be bought directly,
	// which is why they are a separate surface rather than part of the shop.
	// They stay WHITELISTED (a legendary the operator has not enabled is
	// silently never offered — task #47's loot-closure rule), they just stop
	// being purchasable. This list is exactly the entries of
	// content/loot-tables/legendary-weapons.json; the two must not drift.
	//
	// TASK #108 removed 4 mis-curated entries to the shop (surface change, not a
	// deletion): 破甲槍/分手之鎚 (armor-shred stat-sticks) and 瑪那魔杖 (a caster
	// stat-stick) → POWERFUL; 祕銀鎖子甲 (mithril chainmail, defensive gear) →
	// SIMPLE. Each reads as a shop item in a 3-choose-1, not a mythic weapon.
	starterLegendaryItems = []string{
		"godie-i000", // 丈八蛇矛
		"godie-i00f", // 霸王槍
		"godie-i00i", // 炎龍巨弩
		"godie-i00l", // 落魂的嗜血劍
		"godie-i00u", // 名刀-天狼
		"godie-i007", // 妖刀村正
		"godie-i012", // 熾天使之弓
		"godie-i013", // 八取武士刀
		"godie-i014", // 天叢雲劍
		"godie-i018", // 朗基努斯之槍
		"godie-i01d", // 死之王的長槍
		"godie-i01g", // 貫雷槍
		"godie-i01v", // 螺旋劍
		"godie-i027", // 光魔杖
		"godie-i02e", // 狂暴軒轅劍
		"godie-i02x", // 斬岩刃
		"godie-i045", // 寂靜刃 - 詠月
		"godie-i04i", // 厄夜鐮刀
		"godie-i04v", // 正義之杖
		"godie-i06d", // 斬龍刀
		"godie-i06e", // 月牙魔杖
		"godie-i06f", // 月神槍
		"godie-i06g", // 殺豬刀
		"godie-i06i", // 炎神弩
		"godie-i06s", // 龍騎士之劍
	}

	// 7 DRAFT items — the 0g WC3 quest/score rewards (D1-D4). These are the
	// ONLY items the shop cannot sell you, which is what makes the round-2
	// 3-choose-1 card worth anything. content/loot-tables/quest-rewards.json is
	// this same set; both must stay in sync or the card rolls nothing.
	//
	// TASK #108 removed 3 mis-curated entries to the shop: 網友手環 (a +4 armor
	// "meetup token") and 嚇人假面 (a plain mana-regen mask) → SIMPLE; 蜂蜜罐 (a
	// fine 1500-HP heal jar) → POWERFUL. What remains reads as a real prize card.
	starterDraftItems = []string{
		"godie-i00z", // 四魂之玉  maxHealth 100 / ad 5 / maxMana 60 …
		"godie-i035", // 海潮泰坦護盾  armor 7 / ad 26 / maxHealth 572
		"godie-i01k", // 火焰泰坦腰帶  armor 7
		"godie-i01n", // 天堂之劍  critChance 0.03
		"godie-i034", // 大地泰坦角盔  armor 7
		"godie-i06j", // 獸人船長十字鎬  ad 20
		"godie-i06n", // 老衲的棒子  ad 44 +passive
	}

	// The whitelist gates every surface with ONE item list, so the bundle is the
	// union of all four: an item that is not whitelisted is silently never
	// offered, whichever surface it lives on. Note the legendary surface must
	// stay in the union even though nothing there is purchasable — dropping it
	// would empty the round-5 card, which is exactly task #47's silent failure.
	starterItems = concat(starterShopItems, starterServiceItems, starterLegendaryItems, starterDraftItems)

	// 65 abilities — the FULL kit of every starter champion ("<championId>.<slot>").
	// Only `.ex` is gated today; the other four are listed so the bundle is
	// self-describing and no champion can ever be half-enabled.
	starterAbilities = buildStarterAbilities(starterChampions)
)

// starterAbilitySlots are the five ability documents every starter champion
// ships (task #11 convention: Q/W/E/R + the gated EX).
var starterAbilitySlots = []string{"q", "w", "e", "r", "ex"}

// buildStarterAbilities expands the champion list into its `<id>.<slot>` ability
// ids, so the two lists can never drift apart.
func buildStarterAbilities(champions []string) []string {
	out := make([]string, 0, len(champions)*len(starterAbilitySlots))
	for _, id := range champions {
		for _, slot := range starterAbilitySlots {
			out = append(out, id+"."+slot)
		}
	}
	sort.Strings(out)
	return out
}

// StarterShopItems returns a fresh copy of the SHOP surface — the items a
// player can buy with gold during intermission (gates S1-S4 above).
func StarterShopItems() []string {
	return append([]string(nil), starterShopItems...)
}

// StarterDraftItems returns a fresh copy of the DRAFT surface — the 0g quest
// rewards offered by the free 3-choose-1 weapon card (gates D1-D4 above).
// These are exactly the entries of content/loot-tables/quest-rewards.json.
func StarterDraftItems() []string {
	return append([]string(nil), starterDraftItems...)
}

// StarterServiceItems returns a fresh copy of the SHOP SERVICES — the two
// listings that take gold but never occupy an inventory slot (傳說寶玉 and
// 能力屬性強化). Gates SV1-SV3; S1-S4 deliberately do not apply.
func StarterServiceItems() []string {
	return append([]string(nil), starterServiceItems...)
}

// StarterLegendaryItems returns a fresh copy of the LEGENDARY surface — the
// round-5 3-choose-1 pool, which is also the 傳說寶玉 pool. Whitelisted so the
// card can offer them, purchasable nowhere: 「傳說的武器道具，只能隨機三選一」.
// These are exactly the entries of content/loot-tables/legendary-weapons.json.
func StarterLegendaryItems() []string {
	return append([]string(nil), starterLegendaryItems...)
}

// concat joins the surface lists into the single whitelist union.
func concat(lists ...[]string) []string {
	out := []string{}
	for _, l := range lists {
		out = append(out, l...)
	}
	return out
}

// StarterSet returns a fresh copy of the starter bundle (sorted, never nil).
// It is NOT the default state — nothing applies it implicitly.
func StarterSet() Doc {
	return Doc{
		Version:   SchemaVersion,
		Champions: union(nil, starterChampions),
		Items:     union(nil, starterItems),
		Abilities: union(nil, starterAbilities),
	}
}
