package curation

import "sort"

// The STARTER SET — the named, reviewable "make a fresh install playable"
// bundle (task #47). Its champion half is the FIRST OPEN ROSTER (對戰可選名單):
// the 50 champions the user hand-picked to be selectable in champ-select on a
// fresh install.
//
// WHY IT EXISTS. The whitelist ships EMPTY on purpose (task #4): the imported
// WC3 tree carries 113 champions / 212 items / 554 abilities and none of it is
// vetted, so production must never enable content behind an operator's back.
// Correct, but hostile: a brand-new install has zero playable champions and
// champ-select shows nothing but an empty-state. This bundle is the answer —
// a HAND-PICKED, DOCUMENTED set that a human applies on purpose.
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
// CHAMPIONS (50) — the FIRST OPEN ROSTER (對戰可選名單). 113 candidates in, the
// user's 50 hand-picked names out — 48 at task #138, +2 at task #212
// (揍敵客桀諾 godie-efur #13、賈修貝爾 godie-hblm #05). This is NOT the old 13-tile demo showcase:
// it is the whole selectable roster a fresh install offers in champ-select, so
// the gates are about ROSTER INTEGRITY (a real, complete, distinct champion),
// NOT about a pretty demo grid.
//
// ONE CANONICAL ID PER NAME. ~20 of the 50 wanted names matched several content
// docs (re-skins, blank-story twins, a 測試 stand-in). Each name resolves to ONE
// canonical id, chosen by: reject anything whose name carries 測試/範例/範本 or
// whose story is a blank placeholder; then prefer the entry with a real 稱號, a
// non-empty 描述 and a complete Q/W/E/R + EX kit. Ties follow 附錄A of
// docs/hero-popularity-ranking.md (the documented 重複換皮 keep/drop table). The
// per-entry choices are annotated inline on the slice below; the known trap
// 測試英雄-索隆 (godie-u01q) is rejected in favour of godie-u01u.
//
//	R1 not a test/placeholder hero (測試/範例/範本 in the display name).
//	R2 COMPLETE, hero-number-consistent kit (task #11 convention): Q/W/E/R carry
//	   the 2-digit xx-0N prefix, the EX carries xx-00N, all five share ONE hero
//	   number, exAbility == "<id>.ex", and all five standalone docs exist. The
//	   EX matters because it is the only ability the whitelist actually gates
//	   (MatchController.learnEx), so a champion without one would ship a dead
//	   hotkey.
//	R3 no HALF-ENABLED champion: all five ability ids are in the bundle.
//	R4 no two picks are the SAME CHARACTER, decided by the one shared IDENTITY
//	   RULE — the task #11 hero 編號 carried by the ability names, plus the
//	   display name. Source of truth:
//	   packages/shared/src/content/championIdentity.ts (ported in
//	   heroidentity_test.go, asserted by TestChampionIdentityRule). The 50 carry
//	   50 DISTINCT hero 編號, so no pair can collide. This is why the #212 pair
//	   opens 賈修貝爾 (godie-hblm) but NOT its 編號 05 twin 阿強一號 (godie-h021).
//	R5 the roster is EXACTLY these 50 canonical ids — pinned id-for-id by
//	   TestFirstOpenRoster so a re-import or a careless edit cannot silently add,
//	   drop or swap a champion.
//
// WHAT IS DELIBERATELY **NOT** GATED (and why the old showcase gates G2–G6 are
// gone). A 50-champion selectable roster is a different thing from a 13-tile
// demo grid, and the visual/uniqueness gates that made the grid pretty would
// now DELETE champions the user explicitly asked for:
//
//   - ICON on disk. 妙蛙花 (h02r) ships no portrait (stock art), the client
//     already treats `icon` as optional ("absent for stock-art heroes"), and a
//     parallel batch is still writing icon fields — so the seed must not depend
//     on a PNG being present.
//   - OWN / UNIQUE mesh. 80 of 113 champions wear one of four CC0 stand-in
//     meshes because their WC3 model was a Blizzard built-in (champ.sela alone
//     is worn by 18 unrelated heroes); the roster intentionally includes
//     several that share a mesh (champ.sela: n00b/orkn/ogld/u00k;
//     champ.skin.barbarian: ubal/hpal/h02k; champ.thorne: hapm/udea). A shared
//     mesh means "art is missing", NOT "same hero" — treating it as identity is
//     exactly what once erased 黑化Saber. Uniqueness was a demo-grid nicety, not
//     a roster rule.
//   - TEXTURED body / silhouette height band / animation count. Presentation
//     gates for the fixed-camera demo tiles; irrelevant to whether a champion
//     is pickable.
//   - buildPriority LADDER. Most of the 50 carry only a 2-item buildPriority,
//     and the AIDriver already TOLERATES a non-purchasable rung (it skips it
//     rather than stalling), so a "≥4 purchasable rungs" gate would reject real
//     champions for a problem the bot no longer has.
//   - copy quality. 魔人普烏 (huth) ships an empty EX description in content this
//     package does not own; the roster gates a champion's IDENTITY and
//     COMPLETENESS, not its flavour text.
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
// ABILITIES (250) — 50 champions x {q,w,e,r,ex}:
//
//	Only `.ex` is enforced today (a champion's Q/W/E/R are embedded in the
//	champion doc and ungated), but listing all five makes the bundle
//	self-describing and future-proofs it if gating widens. It also means there
//	is no such thing as a HALF-ENABLED champion in this set.
var (
	// The FIRST OPEN ROSTER — 50 canonical champion ids, one per user-picked
	// name (對戰可選名單). Sorted; ApplyStarterSet unions this into the whitelist,
	// which the client champ-select and the game-server both read. Inline
	// annotations record the display name, hero 編號, and — for the ~20 names
	// that matched several docs — which candidate was kept and why (see the
	// SELECTION RULES above and 附錄A of docs/hero-popularity-ranking.md).
	//
	// NOTE: keep this declared as `starterChampions = []string{` with one
	// quoted id per line — apps/game-server/.../whitelist.test.ts parses this
	// exact block as the single source of truth for the seeded roster.
	starterChampions = []string{
		"godie-e001", // 龍宮禮奈 - 蟬在叫人壞掉  #22
		"godie-e002", // Saber - 亞瑟王  #20  — 選 e002（e00l 劇情空白）
		"godie-e007", // 天地志狼 - 龍之子  #12  — 選 e007（附錄A 保留；剔 ewar）
		"godie-e008", // 夏娜 - 火霧戰士  #21
		"godie-e00k", // 安云 - 戰國刺客Azumi  #19  — 選 e00k（e00z 劇情空白）
		"godie-e00r", // 初號機 - 最終泛用人型決戰兵器  #59
		"godie-e00w", // 櫻綻剎那 - 神鳴流劍士  #77  — 選 e00w（剔 e00x）
		"godie-edem", // 宇智波佐助 - 寫輪眼復仇者  #45
		"godie-efur", // 揍敵客桀諾 - 揍敵客大家長  #13  — 任務 #212 追加
		"godie-emfr", // 涅吉。史普林。菲爾德 - 魔法老師  #15  — 選 #15 emfr（#82 h022 為另一獨立英雄）
		"godie-emns", // 夜神月 - 奇樂  #44
		"godie-etyr", // 木乃香 - 治癒系公主  #14
		"godie-h00l", // 林克 - 時空勇者  #60
		"godie-h01n", // 黑崎一護 - 開外掛的死神  #79  — 選 h01n（h01o 劇情空白）
		"godie-h01u", // 呂布奉先 - 亂世癿王者  #80
		"godie-h020", // 莉娜因巴斯 - 黑魔導士  #04  — 選 h020（剔 hjai）
		"godie-h02k", // 熊貓 - 國寶級的畜生  #89
		"godie-h02r", // 妙蛙花 - 種子神奇寶貝  #90  — 注意：無 icon（stock 美術）
		"godie-h02u", // 草泥馬 - 看似憂鬱的神獸  #92  — 選 h02u（剔 h02v）
		"godie-hapm", // Berserker - 海克力斯  #52
		"godie-hart", // 克勞德 - 最終幻想  #01
		"godie-hblm", // 賈修貝爾 - 慈悲的王者  #05  — 任務 #212 追加（雙胞胎 godie-h021 阿強一號 同為 #05，故不得一併開放）
		"godie-hpal", // 藤井八雲 - 不死之身-無  #35
		"godie-hpb1", // 蒼月潮 - 獸矛傳承使  #07
		"godie-huth", // 魔人普烏 - 超級普烏  #28  — 注意：EX 描述為空（不影響可選性）
		"godie-hvsh", // Rider - 梅杜莎  #48
		"godie-hvwd", // 桔梗 - 除魔巫女  #02
		"godie-n003", // 依文潔琳 - 黑暗福音  #42  — 選 n003（剔 n01g）
		"godie-n00b", // 哆拉A夢 - 小叮噹  #57
		"godie-n00p", // 南野秀一 - 妖狐藏馬  #18  — 選 n00p（剔 nsjs）
		"godie-n01c", // 勇者小呆 - 傳說的龍騎士  #08  — 選 n01c（剔 nbbc）
		"godie-nplh", // 麻倉葉 - 通靈人  #16
		"godie-o00k", // 皮卡娘 - 傲嬌電氣老鼠  #86
		"godie-o00l", // 傑洛士 - 獸神官  #53
		"godie-o00x", // 悟空 - 超級賽亞人  #09  — 選 SSJ o00x（剔 base ogrh）
		"godie-o02p", // 初音 - 夢幻之星  #99
		"godie-ofar", // 皮卡丘 - 神奇寶貝兒  #58  — 選 ofar（o02l 劇情空白）
		"godie-ogld", // 黑人牙膏 - 美白大法師  #72
		"godie-orkn", // 臭作 - 電車癡漢  #30
		"godie-osam", // 殺生丸 - 犬妖  #34
		"godie-u00h", // 鬼畜狂刀KYO - 鬼畜紅王  #39
		"godie-u00j", // 賽菲洛斯 - 神性的流失  #74
		"godie-u00k", // 死之王 - 邪惡意念集合體  #71
		"godie-u00l", // 拳四郎 - 北斗之鼠  #25  — 選 u00l（剔 umal）
		"godie-u00n", // 蒙其.D.魯夫 - 草帽小子  #76  — 選 u00n（剔 u00o）
		"godie-u00v", // 基廉列克 - 黑手黨老大  #78
		"godie-u010", // 飛影 - 邪眼師  #38  — 選 u010（剔 uvng）
		"godie-u01u", // 索隆 - 三刀流劍士  #11  — 選 u01u（reject 測試 u01q；剔 udre）
		"godie-ubal", // 巴恩大魔王 - 魔界霸主  #37
		"godie-udea", // 飛鼠先生 - 至尊學長  #65
	}

	// SHOP items — the FINAL CRAFTED WEAPONS, and nothing else (owner rule 1,
	// task #70 reopened twice: 「只有最終合成武器才能上架可直接購買 (有製作書的)」).
	// This list is now DERIVED, not curated: it is exactly the content items
	// whose `craftRole == "final"` AND that carry an expressible payload
	// (modifiers/passive). The role marker was recovered from the source-map
	// TRIGGERS by tools/w3x-import/extract_item_roles.py — a "final" is a recipe
	// SINK whose own recipe consumes a 製作書 — so this is 「有製作書的最終合成
	// 武器」 read literally off the map, not inferred from price or name.
	//
	// WHY THE OLD 70-ITEM LIST WAS THE BUG. It was filtered on `cost ∈ {300,
	// 1200}`, which is task #82's PRICE tier, not a craft stage. That admitted
	// 96 recipe components (初心者寶石/女神之淚/黑核晶/…) and every priced
	// stat-stick, and it put the quest reward 魔戒 on sale for 300g — because
	// `cost` encodes neither crafting stage nor quest provenance. The owner had
	// to restate the rule; this is the structural fix that lets it be expressed.
	//
	// Six more finals (雷神之鎚/黑色魔書/盾甲天書/嗜血邪書/天地崩裂魔杖/風行天衣)
	// are `craftRole == "final"` too but carry NO expressible payload (their
	// power is an active ability item@1 cannot hold yet — blocked on #56), so
	// they are held off the shelf by the same S3/hasEffect gate the client and
	// the sim use, and are NOT whitelisted here. They rejoin the moment item@1
	// grows an active slot; the content docs already carry craftRole "final".
	//
	// TestStarterShopIsFinalWeapons pins this to the marker: it fails if any id
	// here is not a `final` with an effect, or if a `final` with an effect is
	// missing. Prices: SIMPLE 300 / POWERFUL 1200 (task #82's 統一化), stamped
	// onto every final by tools/w3x-import/apply_item_roles.py.
	starterShopItems = []string{
		// ---- SIMPLE, 300g (5)
		"godie-i016", // 晨曦之光
		"godie-i03d", // 光明虎徹
		"godie-i03f", // 甘豆腐之袍
		"godie-i041", // 火閃電
		"godie-i05o", // 刺針
		// ---- POWERFUL, 1200g (23). Includes the 11 finals task #82 had zeroed
		// into the legendary pool — 霸王槍/光魔杖/狂暴軒轅劍/… — that rule 1 says
		// belong here, on the shelf.
		"godie-i00f", // 霸王槍
		"godie-i00i", // 炎龍巨弩
		"godie-i00j", // 奇門盾甲
		"godie-i018", // 朗基努斯之槍
		"godie-i01j", // 靈魂魔石
		"godie-i01o", // 死神裝束
		"godie-i01v", // 螺旋劍
		"godie-i027", // 光魔杖
		"godie-i02e", // 狂暴軒轅劍
		"godie-i02r", // 奇蹟之墜
		"godie-i031", // 天生牙
		"godie-i039", // 幻之匕首
		"godie-i03b", // 真．雅典娜的驚嘆號
		"godie-i040", // 破甲槍
		"godie-i045", // 寂靜刃 - 詠月
		"godie-i049", // 賢者之石
		"godie-i04d", // 冰晶虎魄 - 改
		"godie-i04i", // 厄夜鐮刀
		"godie-i05h", // 失心匕首
		"godie-i067", // 惡夢魔王碎片
		"godie-i06d", // 斬龍刀
		"godie-i06f", // 月神槍
		"godie-i06i", // 炎神弩
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

	// LEGENDARY items — the 傳說寶玉 (legendary-orb) gacha pool ONLY. The round-5
	// 3-choose-1 no longer rolls this table: under the owner's two-surface model
	// (task #70) every item 3-choose-1 offers ONLY quest items, so round 5 now
	// rolls `quest-rewards` like round 2. This surface is therefore just the orb.
	//
	// The 11 book-finals task #82 had zeroed into this pool (霸王槍/光魔杖/…) have
	// MOVED to the shop, where rule 1 puts them, so this list is exactly the 14
	// non-final entries that remain in content/loot-tables/legendary-weapons.json.
	// They are 7 recipe components (名刀-天狼/熾天使之弓/…) and 7 direct-buy 神器
	// (丈八蛇矛/落魂的嗜血劍/…) — a pool the owner has NOT re-endorsed and that the
	// in-flight task #108 owns; this task leaves it to #108 rather than redesign
	// the orb. See the report for the boundary.
	starterLegendaryItems = []string{
		"godie-i000", // 丈八蛇矛
		"godie-i00l", // 落魂的嗜血劍
		"godie-i00u", // 名刀-天狼
		"godie-i007", // 妖刀村正
		"godie-i012", // 熾天使之弓
		"godie-i013", // 八取武士刀
		"godie-i014", // 天叢雲劍
		"godie-i01d", // 死之王的長槍
		"godie-i01g", // 貫雷槍
		"godie-i02x", // 斬岩刃
		"godie-i04v", // 正義之杖
		"godie-i06e", // 月牙魔杖
		"godie-i06g", // 殺豬刀
		"godie-i06s", // 龍騎士之劍
	}

	// DRAFT items — EXACTLY the quest set, and nothing else (owner rule 2, task
	// #70: 「隨機三選一才能選到 所有任務道具 … 不要放這些任務道具以外的東西」).
	// DERIVED, not curated: exactly the content items whose `craftRole == "quest"`,
	// recovered from the source-map quest TRIGGERS (boss drops, CreateItemLoc in
	// a 「完成…任務」 handler, and the MissionScore 兌換 chains) by
	// tools/w3x-import/extract_item_roles.py. The owner's 「等」 (etc.) is honoured
	// by tracing every chain of the same shape, not just his five named items —
	// so 仙后座/戰旗/復仇之袍/惡魔吉他/蜂蜜罐 and the three Titan finals are here too.
	// These are 0g (draft-only; the sim refuses to sell a 0g item), which is what
	// makes the free 3-choose-1 card the ONLY way to obtain them.
	// content/loot-tables/quest-rewards.json is this same set; both must stay in
	// sync. TestStarterDraftIsQuestSet pins this to the marker — it fails if a
	// non-quest item appears here OR a quest item is missing (BOTH halves).
	starterDraftItems = []string{
		"godie-i004", // 魔戒 — was ON SALE for 300g; the clearest inversion
		"godie-i00z", // 四魂之玉
		"godie-i01k", // 火焰泰坦腰帶
		"godie-i01n", // 天堂之劍
		"godie-i01s", // 仙后座
		"godie-i02h", // 戰旗
		"godie-i02j", // 復仇之袍
		"godie-i02k", // 惡魔吉他
		"godie-i034", // 大地泰坦角盔
		"godie-i035", // 海潮泰坦護盾
		"godie-i05y", // 蜂蜜罐
		"godie-i06j", // 獸人船長十字鎬
		"godie-i06n", // 老衲的棒子
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
