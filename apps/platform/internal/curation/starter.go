package curation

import "sort"

// The STARTER SET — the named, reviewable "make a fresh install playable"
// bundle (task #47). Its champion half is the FIRST OPEN ROSTER (對戰可選名單):
// the 49 champions the user hand-picked to be selectable in champ-select on a
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
// ⚠️ 2026-08-16 —— 名單從 53 縮到 49。⭐ 2026-08-16 owner 再下架四位（安云 godie-e00k · 藤井八雲 godie-hpal · 賈修貝爾 godie-hblm · 麻倉葉 godie-nplh）⇒ 53 → 49。下架的真相住在 content/config/roster.json 的 retiredChampions —— 那一格是**內容事實**，這裡只是跟著走。⛔ 種子清單留著已下架的 id 不是無害的：白名單閘會把它們丟掉，於是「種子說 53、實際開 49」而沒有任何東西會叫。
//
// SELECTION RULES (every one of them is asserted by
// TestStarterSetMatchesContentTree against the real content tree — the bundle
// cannot silently rot when content is re-imported):
//
// CHAMPIONS (49) — the FIRST OPEN ROSTER (對戰可選名單). 113 candidates in, the
// user's hand-picked names out — 48 at task #138, +2 at task #212, +1 at GH#29
// (揍敵客桀諾 godie-efur #13；⚠️ 同批的賈修貝爾 godie-hblm #05 已於 2026-08-16 下架)、喪標麥可 godie-zombiex #100
// (GH#29), +2 at L1 (owner 2026-07-30「加入釋出變身釋出可選白名單:70 白木老樹精 ·
// 白木卡迪那 紮根態、6 職業獵人 · 傑 富力士 傑桑變化」— godie-e00s #70 與
// godie-ucrl #06, BOTH as the BASE body per R6; the 變身態 is what their own
// trigger ability reaches). This is NOT the old 13-tile demo showcase:
// it is the whole selectable roster a fresh install offers in champ-select, so
// the gates are about ROSTER INTEGRITY (a real, complete, distinct champion),
// NOT about a pretty demo grid.
//
// ONE CANONICAL ID PER NAME. ~20 of the wanted names matched several content
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
//	   opened 賈修貝爾 (godie-hblm) but NOT its 編號 05 twin 阿強一號 (godie-h021).
//	   ⚠️ godie-hblm 本身已於 2026-08-16 下架；規則本身沒變，只是這個例子
//	   現在只剩歷史意義（第三守則：註解會說謊）。
//	R5 the roster is EXACTLY these 49 canonical ids — pinned id-for-id by
//	   TestFirstOpenRoster so a re-import or a careless edit cannot silently add,
//	   drop or swap a champion.
//	R6 NO ALTERNATE (變身) FORM. Every id here is a BASE unit — the hero a player
//	   picks — never the transformed body the map's `Emeu` field names. Decided
//	   by the closed w3x table in packages/shared/src/content/championForms.ts
//	   (26 pairs, from the WC3 Metamorphosis fields Eme1/Emeu), asserted by
//	   TestStarterRosterHasNoAlternateForms.
//	R7 THE PRICE LIST NO LONGER HAS TO MOVE WITH THE ROSTER — the rule was
//	   DELETED on 2026-07-30, and that is the point. It used to read「
//	   content/config/store.json's `championPrices` must name EXACTLY these
//	   ids」, because an absent price meant FREE on both sides (client
//	   lockStateOf: `price === undefined` → "free"; server
//	   wallet.OwnsChampion: `!priced` → true) and a price left behind for a
//	   dropped id kept being seeded into new accounts by
//	   Catalog.FreeChampions(). R7 was R6's own regression: the #249 swap moved
//	   ten ids, left all ten prices behind, and every gate was green.
//	   The owner then removed the map entirely (「所有英雄藍水晶都是統一價，新
//	   上架預設也是一樣價格」): store.json now carries one `championUnlockCost`
//	   plus a short `freeChampionIds` list, and a champion with no mention
//	   anywhere costs the flat price. So ADDING AN ID HERE NEEDS NO STORE EDIT.
//	   What survives is the economy's SHAPE (12 free / 41 priced @ 300) and the
//	   rule that every free-listed id is really on this roster, both still
//	   asserted by TestStarterRosterMatchesChampionPrices.
//
// R6 IS A BUG FIX, NOT A TIDY-UP (task #249). Ten of these fifty slots used to
// be the ALTERNATE body, offered to players as if it were the hero, because the
// importer drops Eme1/Emeu (task #56 — it whitelists ~30 of 180 w3u field
// codes) and NOTHING downstream could tell the two apart. What shipped:
//
//	godie-h02u  草泥馬 in its lying-down 臥 body — w3x movement speed 0
//	godie-h02r  妙蛙花, the final evolution at usca 3.0, from round one
//	godie-u00l  北斗之鼠, the joke Pikachu-DNA form, instead of 拳四郎 himself
//	godie-o00x  超級賽亞人, so 悟空's own R「超級賽亞人」 turned him into what he
//	            already was
//	godie-h020 · godie-n01c · godie-u01u · godie-e007 · godie-n00p · godie-u010
//
// The owner ruled (2026-07-26):「換成本體，變身態改由技能觸發」— each slot now
// holds the base, and the second form becomes reachable only through its
// transform ability once that mechanic exists (task #119). The alternate docs
// are NOT deleted and NOT un-whitelisted by this change; they simply stop being
// offered as picks.
//
// WHAT IS DELIBERATELY **NOT** GATED (and why the old showcase gates G2–G6 are
// gone). A 50-champion selectable roster is a different thing from a 13-tile
// demo grid, and the visual/uniqueness gates that made the grid pretty would
// now DELETE champions the user explicitly asked for:
//
//   - ICON on disk. Several roster entries ship no portrait (stock art), the
//     client already treats `icon` as optional ("absent for stock-art heroes"),
//     and a parallel batch is still writing icon fields — so the seed must not
//     depend on a PNG being present.
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
// ITEMS (83) — split across THREE surfaces. The bundle is not a hand-picked demo
// shelf; it is the whole obtainable item catalogue, because every way to get an
// item is one of these three.
//
//	SHOP       12  bought with gold, at one of exactly two prices
//	SERVICES    2  bought with gold, occupy no slot (orb + stat tick)
//	WEAPONS    69  the free weapon 3-choose-1 + the orb pool — NEVER purchasable
//
// ⚠️ THESE COUNTS ARE PROSE AND PROSE ROTS — the guard is
// TestStarterSetMatchesContentTree, which recomputes them from the loot tables
// and the item docs. If a number here disagrees with that test, the test is right.
// ⚠️ 2026-08-18 the FOURTH surface (DRAFT, the 0g 任務道具 card) was retired by
// owner: 「在競技場新玩法**則完全不考慮這個標籤**」. Its items moved into the tier
// tables; nothing was de-listed.
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
//	DRAFT — RETIRED 2026-08-18. Gates D1-D5 asked 「is this a 任務道具?」 and owner
//	killed the question: 「他有個舊標籤叫做任務道具，但在競技場新玩法**則完全不考慮
//	這個標籤**」. The six items are ordinary 寶具 in the tier tables now.
//	⭐ One clause outlived the surface and MOVED, it did not die: D4「NO 四魂之玉
//	SHARDS」 — in a game with no combining, an item named "shard OF the jewel"
//	next to the completed jewel is the surest way to send a player hunting for a
//	crafting UI that does not exist. The four 「四魂之玉的碎片-X」 are simply in no
//	pool, and the assembled 四魂之玉 (godie-i00z) is offered whole.
//
//	SERVICES (2) — a gold purchase that never occupies an inventory slot. Their
//	payload is CODE (packages/shared/src/sim/economy), not modifier data, so S3
//	would reject them and they get their own gates:
//
//	SV1 a real display name, SV2 cost > 0, SV3 the id is one the sim actually
//	    dispatches (isShopService in economy/itemTiers.ts) — a service the sim
//	    does not know about would take the player's gold and do nothing.
//
//	WEAPONS (69) — every 寶具 the free weapon 3-choose-1 or the 傳說寶玉 can roll,
//	across the THREE tier tables (EX / [EX解放] / [EX∅ 根源]):
//
//	L1 a real display name, L2 it actually does something, L3 it is NOT on the
//	   shop surface. L3 is the user's rule made mechanical: the only routes to a
//	   寶具 are the free weapon card and the 2400g orb, which buys the ROLL and
//	   never the item.
//	L4 ⭐ 2026-08-18 — THE UNION IS ALL THREE TABLES, not just legendary-weapons.
//	   The tier ladder (packages/shared/src/sim/economy/weaponTiers.ts) can send a
//	   card at ANY of the three, so a table whose members are unlisted here is a
//	   tier that silently deals nothing.
//
//	LOOT CLOSURE. MatchController filters a weapon offer to the whitelist and
//	SKIPS the grant when nothing survives, so an under-seeded bundle makes the
//	weapon cards silently give the player nothing.
//
//	⚠️ CORRECTED 2026-08-01: this paragraph used to describe a round-2
//	`quest-rewards` card that had not existed for weeks.
//	⚠️ 2026-08-18: `quest-rewards` and `round-reward` moved to
//	content/_legacy/loot-tables/ entirely. They stay named in
//	`arena-rules.retiredLootTables` because the retirement declaration is what
//	still closes the admin durable-override path (#283, no Zod there) —
//	see `packages/shared/src/content/retiredLootTables.ts`.
//
//	The orb takes the same legendary pool but filters BEFORE rolling and refuses
//	the sale when it is empty, so it can never reproduce that failure.
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
// ABILITIES — 49 champions x {q,w,e,r,ex}:
//
//	Only `.ex` is enforced today (a champion's Q/W/E/R are embedded in the
//	champion doc and ungated), but listing all five makes the bundle
//	self-describing and future-proofs it if gating widens. It also means there
//	is no such thing as a HALF-ENABLED champion in this set.
var (
	// The FIRST OPEN ROSTER — 49 canonical champion ids, one per user-picked
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
		"godie-e001",    // 龍宮禮奈 - 蟬在叫人壞掉  #22
		"godie-e002",    // Saber - 亞瑟王  #20  — 選 e002（e00l 劇情空白）
		"godie-e008",    // 夏娜 - 火霧戰士  #21
		"godie-e00r",    // 初號機 - 最終泛用人型決戰兵器  #59
		"godie-e00s",    // 白木老樹精 - 白木卡迪那  #70  — owner 2026-07-30「加入釋出變身釋出可選白名單」；本體，e010 紮根態由 70-00 紮根 toggle 觸發
		"godie-e00w",    // 櫻綻剎那 - 神鳴流劍士  #77  — 選 e00w（剔 e00x）
		"godie-edem",    // 宇智波佐助 - 寫輪眼復仇者  #45
		"godie-efur",    // 揍敵客桀諾 - 揍敵客大家長  #13  — 任務 #212 追加
		"godie-emfr",    // 涅吉。史普林。菲爾德 - 魔法老師  #15  — 選 #15 emfr（#82 h022 為另一獨立英雄）
		"godie-emns",    // 夜神月 - 奇樂  #44
		"godie-etyr",    // 木乃香 - 治癒系公主  #14
		"godie-ewar",    // 天地志狼 - 龍之子  #12  — 本體；e007 是 12-03 破凰之心 的變身態
		"godie-h00l",    // 林克 - 時空勇者  #60
		"godie-h01n",    // 黑崎一護 - 開外掛的死神  #79  — 選 h01n（h01o 劇情空白）
		"godie-h01u",    // 呂布奉先 - 亂世癿王者  #80
		"godie-h02k",    // 熊貓 - 國寶級的畜生  #89
		"godie-h02v",    // 草泥馬 - 看似憂鬱的神獸  #92  — 本體；h02u 是 92-01 臥草泥馬 的變身態（w3x 移動速度 0）
		"godie-hapm",    // Berserker - 海克力斯  #52
		"godie-hart",    // 克勞德 - 最終幻想  #01
		"godie-hgam",    // 妙蛙種子 - 種子神奇寶貝  #90  — 本體；h02r 妙蛙花 是 90-002 超進化! 的變身態（usca 1.2 → 3.0）
		"godie-hjai",    // 莉娜因巴斯 - 黑魔導士  #04  — 本體；h020 是 04-002 惡夢魔王的碎片 的變身態
		"godie-hpb1",    // 蒼月潮 - 獸矛傳承使  #07
		"godie-huth",    // 魔人普烏 - 超級普烏  #28  — 注意：EX 描述為空（不影響可選性）
		"godie-hvsh",    // Rider - 梅杜莎  #48
		"godie-hvwd",    // 桔梗 - 除魔巫女  #02
		"godie-n003",    // 依文潔琳 - 黑暗福音  #42  — 選 n003（剔 n01g）
		"godie-n00b",    // 哆拉A夢 - 小叮噹  #57
		"godie-nbbc",    // 勇者小呆 - 傳說的龍騎士  #08  — 本體；n01c 是 08-002 龍魔人 的變身態
		"godie-nsjs",    // 南野秀一 - 妖狐藏馬  #18  — 本體；n00p 是 18-03 妖狐變化 的變身態
		"godie-o00k",    // 皮卡娘 - 傲嬌電氣老鼠  #86
		"godie-o00l",    // 傑洛士 - 獸神官  #53
		"godie-o02p",    // 初音 - 夢幻之星  #99
		"godie-ofar",    // 皮卡丘 - 神奇寶貝兒  #58  — 選 ofar（o02l 劇情空白）
		"godie-ogld",    // 黑人牙膏 - 美白大法師  #72
		"godie-ogrh",    // 悟空 - 賽亞人  #09  — 本體；o00x 超級賽亞人 是 09-03 的變身態（否則 R 變身成他已經是的樣子）
		"godie-orkn",    // 臭作 - 電車癡漢  #30
		"godie-osam",    // 殺生丸 - 犬妖  #34
		"godie-u00h",    // 鬼畜狂刀KYO - 鬼畜紅王  #39
		"godie-u00j",    // 賽菲洛斯 - 神性的流失  #74
		"godie-u00k",    // 死之王 - 邪惡意念集合體  #71
		"godie-u00n",    // 蒙其.D.魯夫 - 草帽小子  #76  — 選 u00n（剔 u00o）
		"godie-u00v",    // 基廉列克 - 黑手黨老大  #78
		"godie-ubal",    // 巴恩大魔王 - 魔界霸主  #37
		"godie-ucrl",    // 職業獵人 - 傑 富力士  #06  — owner 2026-07-30；本體，u034 傑桑態由 06-04 傑桑變化 觸發（26 對裡真的換模型的 5 對之一）
		"godie-udea",    // 飛鼠先生 - 至尊學長  #65
		"godie-udre",    // 索隆 - 三刀流劍士  #11  — 本體；u01u 是 11-002 武裝色霸氣 的變身態（測試英雄 u01q 仍排除）
		"godie-umal",    // 拳四郎 - 北斗神拳掌門人  #25  — 本體；u00l 北斗之鼠 是 25-04 ChangeDNA 的變身態
		"godie-uvng",    // 飛影 - 邪眼師  #38  — 本體；u010 是 38-00 邪眼全開 的變身態
		"godie-zombiex", // 喪標麥可 - 聖杯黑泥醬  #100  — owner 2026-07-28:「喪標麥可 應該在預設英雄開放名單上」
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
	// FOUR finals (嗜血邪書/盾甲天書/黑色魔書/風行天衣) are `craftRole == "final"`
	// too but carry NO expressible payload (their power is an active ability
	// item@1 cannot hold yet — blocked on #56), so they are held off the shelf
	// by the same S3/hasEffect gate the client and the sim use, and are NOT
	// whitelisted here. They rejoin the moment item@1 grows an active slot; the
	// content docs already carry craftRole "final". 雷神之鎚 (godie-i01i) and
	// 天地崩裂魔杖 (godie-i03h) used to be on that payload-free list — owner gave
	// them real modifiers + passives on 2026-08-01 and moved them into the 棱彩
	// pool, so they are effective finals now, held off the shelf by the
	// LEGENDARY rule below rather than by the #56 gate.
	//
	// ⚠️ owner 2026-08-01 — THE SHOP IS «FINAL WITH AN EFFECT» **MINUS THE
	// WEAPON-POOL SURFACE**. 「隨機三選一發放道具 都改成棱彩武器道具」 moved the
	// effective finals into the weapon pools and zeroed their `cost` in the same
	// edit, so nothing can sell them. Leaving them on this list did not make them
	// buyable — `buyItem` refuses cost<=0 with "not-purchasable" — but it made the
	// whitelist claim a surface they had left, and it feeds `shopCatalogue`
	// (craftRole "final" + hasEffect + whitelisted) dead 0g buttons the moment the
	// 武器貨架 (#261) reopens. 「傳說＝三選一專屬」 only holds if the shop list stops
	// claiming them.
	// ⚠️ 2026-08-18 「the weapon pool」 became THREE tables. The claim rule reads
	// all three, so a 寶具 promoted from EX to [EX解放] does not quietly become
	// shop-eligible again.
	//
	// TestStarterShopIsFinalWeapons pins this to the marker: it fails if any id
	// here is not a `final` with an effect, or if a `final` with an effect that no
	// weapon pool has claimed is missing. Prices: SIMPLE 300 /
	// POWERFUL 1200 (task #82's 統一化), stamped onto every final by
	// tools/w3x-import/apply_item_roles.py.
	starterShopItems = []string{
		// ---- SIMPLE, 300g (3)
		"godie-i03d", // 光明虎徹
		"godie-i041", // 火閃電
		"godie-i05o", // 刺針
		// ---- POWERFUL, 1200g (9)
		"godie-i01j", // 靈魂魔石
		"godie-i01o", // 死神裝束
		"godie-i02r", // 奇蹟之墜
		"godie-i03b", // 真．雅典娜的驚嘆號
		"godie-i040", // 破甲槍
		"godie-i045", // 寂靜刃 - 詠月
		"godie-i049", // 賢者之石
		"godie-i04i", // 厄夜鐮刀
		"godie-i05h", // 失心匕首
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

	// WEAPON-POOL items — the whole 寶具 surface, reached TWO ways: the free
	// weapon 3-choose-1 that `rounds[].weaponLootTable` schedules, and the 2400g
	// 傳說寶玉 roll. Nothing here is buyable —「傳說的武器道具，只能隨機三選一」.
	//
	// ⭐ owner 2026-08-18 REDEFINED THE POOLS. 「舊時代上架傳說武器道具全部捏平成
	// EX寶具，只有五件我們特別拎出來寫 EX解放，再加上新一批的 EX／EX解放／EX根源，
	// 組成全部上架的隨機三選一寶具」＋「請將所有寶具回歸到所屬池子」。So the surface
	// is no longer one table of 49; it is the UNION OF THREE TIER TABLES, and a
	// 寶具 belongs to EXACTLY ONE of them (before this edit 5 items sat in two
	// pools and could be rolled twice):
	//
	//	content/loot-tables/legendary-weapons.json   EX          29
	//	content/loot-tables/ex-release-weapons.json  [EX解放]     35
	//	content/loot-tables/ex-origin-weapons.json   [EX∅ 根源]   5
	//
	// ⚠️⚠️ THE UNION IS THE WHOLE POINT. `MatchController` filters a weapon offer
	// to this whitelist and rolls BEFORE it filters, so an id missing here is not
	// 「that one weapon never appears」 — it eats a card slot, and when the tier
	// ladder picks a table whose members are all unlisted the seat gets NOTHING
	// while `offerCount` still reads 3. Measured 2026-08-18, before this edit:
	// 22 of ex-release-weapons' 26 listed entries were NOT whitelisted, and not
	// one console.warn fired. Missing a WHOLE TIER is the same bug, larger.
	//
	// ⚠️ 「任務道具」 IS NOT A SURFACE ANY MORE. owner 2026-08-18: 「他有個舊標籤叫做
	// 任務道具，但在競技場新玩法**則完全不考慮這個標籤**」 —— 四魂之玉/天堂之劍/
	// 獸人船長十字鎬/老衲的棒子/至尊魔戒/仙后座 are ordinary 寶具 that live in a tier
	// table like everything else, so `starterDraftItems` and
	// content/loot-tables/quest-rewards.json are both gone (the table was retired
	// to content/_legacy/loot-tables/ and is declared in arena-rules'
	// retiredLootTables). The four surfaces are a PARTITION again.
	//
	// TestStarterSetMatchesContentTree pins this list to the three files
	// id-for-id, BOTH directions, and does it by READING THEM — so moving a 寶具
	// between tiers needs no edit here, only adding or removing one does.
	starterLegendaryItems = []string{
		// ── EX（content/loot-tables/legendary-weapons.json）
		"cleaver-of-the-warden", // 泰坦九頭蛇
		"godie-i000", // 丈八蛇矛
		"godie-i007", // 虛哭神去
		"godie-i00i", // 炎龍巨弩
		"godie-i00j", // 奇門盾甲
		"godie-i00s", // 黃金聖鬥衣
		"godie-i00u", // 名刀-天狼
		"godie-i00z", // 四魂之玉
		"godie-i012", // 熾天使之弓
		"godie-i013", // 緣一零式
		"godie-i018", // 朗基努斯之槍
		"godie-i01g", // 貫雷槍
		"godie-i01i", // 雷神之鎚
		"godie-i01n", // 天堂之劍
		"godie-i01w", // 祕銀鎖子甲
		"godie-i020", // 瑪那魔杖
		"godie-i027", // 光魔杖
		"godie-i02e", // 狂暴軒轅劍
		"godie-i039", // 幻之匕首
		"godie-i03h", // 天地崩裂魔杖
		"godie-i03m", // 反射之盾
		"godie-i04d", // 冰晶虎魄 - 改
		"godie-i061", // 死之王的神盾
		"godie-i06a", // 妖物碎殺牙
		"godie-i06d", // 斬龍刀
		"godie-i06e", // 月牙魔杖
		"godie-i06j", // 獸人船長十字鎬
		"godie-i06n", // 老衲的棒子
		"godie-i06o", // 血染八月
		// ── [EX解放]（content/loot-tables/ex-release-weapons.json）
		"book-of-gospel", // 福音書
		"bulwark-charge-greaves", // 近擊的巨人鎧
		"collar-of-the-deadly-soul", // 致命魂之首輪
		"endless-edge", // 無盡連刃
		"fingerless-gloves", // 指貫手套
		"godie-i004", // 至尊魔戒
		"godie-i006", // 雅典娜的驚嘆號
		"godie-i00f", // 霸王破甲槍
		"godie-i00l", // 落魂的嗜血劍
		"godie-i014", // 天叢雲劍
		"godie-i01d", // 死之王的長槍
		"godie-i01s", // 仙后座
		"godie-i01v", // 螺旋劍
		"godie-i02d", // 消失的密室
		"godie-i03f", // 甘豆腐之袍
		"godie-i067", // 惡夢魔王碎片
		"godie-i06f", // 傲慢水龍王
		"godie-i06i", // 炎神弩
		"godie-i06q", // 鍊金術之盾
		"gravity-sword-black-rod", // 重力劍〈黑棒〉
		"lance-kongotetsu", // 神槍・金剛徹
		"magic-armor-type-zero", // 魔導鎧・零式
		"meat-cleaver", // 肉切菜刀
		"meteor-ring", // 流星之戒
		"mystery-scrap-of-paper", // 謎之紙片
		"odm-gear", // 立體機動裝置
		"pale-moon-requiem-crown", // 蒼月葬送・千年彼方花冠
		"shining-golden-orbs", // 閃耀金玉
		"soul-eater", // 噬魂者
		"spear-of-lightning", // 雷槍
		"staff-of-ainz-ooal-gown", // 安茲・烏爾・恭之杖
		"stone-mask", // 石鬼面
		"torch-master", // 火把師父
		"ultimate-mod-shiranui", // 終極魔改・不知火
		"usagizuki-twin-crescents", // 兎月【雙弦月】
		// ── [EX∅ 根源]（content/loot-tables/ex-origin-weapons.json）
		"godie-i016", // 晨曦之光
		"godie-i031", // 天生牙
		"godie-i060", // 死之王的意志
		"godie-i06g", // 殺豬刀
		"teardrop-of-rebirth", // 再誕之淚珠
	}

	// The whitelist gates every surface with ONE item list, so the bundle is the
	// union of all three: an item that is not whitelisted is silently never
	// offered, whichever surface it lives on. The weapon-pool surface must stay
	// in the union even though nothing there is purchasable — dropping it would
	// empty the weapon cards, which is exactly task #47's silent failure.
	//
	// ⚠️ 2026-08-18 the DRAFT (任務道具) surface left this line: owner retired the
	// label, its 6 items now sit in the tier tables above, and the three lists are
	// disjoint again. `concat` keeps duplicates and `StarterSet` runs the result
	// through `union` (sort + dedupe), so that stays true even if they overlap
	// again some day.
	starterItems = concat(starterShopItems, starterServiceItems, starterLegendaryItems)

	// 265 abilities — the FULL kit of every starter champion ("<championId>.<slot>").
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

// ⚠️ `StarterDraftItems` (the 0g 任務道具 surface) WAS HERE AND IS GONE, 2026-08-18.
// owner: 「他有個舊標籤叫做任務道具，但在競技場新玩法**則完全不考慮這個標籤**」.
// Its six items were not de-listed — they moved into the EX / [EX解放] tier tables
// and reach the player through `starterLegendaryItems` like every other 寶具.
// content/loot-tables/quest-rewards.json moved to content/_legacy/loot-tables/ and
// stays named in arena-rules' `retiredLootTables`, which is what still stops the
// admin durable-override path (#283, no Zod there) from scheduling it.

// StarterServiceItems returns a fresh copy of the SHOP SERVICES — the two
// listings that take gold but never occupy an inventory slot (傳說寶玉 and
// 能力屬性強化). Gates SV1-SV3; S1-S4 deliberately do not apply.
func StarterServiceItems() []string {
	return append([]string(nil), starterServiceItems...)
}

// StarterLegendaryItems returns a fresh copy of the WEAPON-POOL surface — every
// 寶具 the free 3-choose-1 or the 傳說寶玉 can roll. Whitelisted so the card can
// offer them, purchasable nowhere: 「傳說的武器道具，只能隨機三選一」.
// These are exactly the entries of the THREE tier tables
// (legendary-weapons + ex-release-weapons + ex-origin-weapons), unioned.
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
