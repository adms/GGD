package curation_test

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/curation"
	"github.com/ggd/platform/internal/wallet"
	"github.com/ggd/platform/pkg/testkit"
)

// contentRoot is the repo's read-only content tree, relative to this package
// (apps/platform/internal/curation → ../../../../content).
func contentRoot() string {
	return filepath.Join("..", "..", "..", "..", "content")
}

// ---------------------------------------------------------------- fixtures --

type championDoc struct {
	ID            string            `json:"id"`
	Name          string            `json:"name"`
	Role          string            `json:"role"`
	AttackType    string            `json:"attackType"`
	ModelKey      string            `json:"modelKey"`
	Icon          string            `json:"icon"`
	ExAbility     string            `json:"exAbility"`
	BuildPriority []string          `json:"buildPriority"`
	Abilities     map[string]abilit `json:"abilities"`
}

type abilit struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Slot string `json:"slot"`
}

type abilityDoc struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Slot        string `json:"slot"`
	Description string `json:"description"`
}

type itemDoc struct {
	ID        string          `json:"id"`
	Name      string          `json:"name"`
	Cost      int             `json:"cost"`
	Tier      int             `json:"tier"`
	CraftRole string          `json:"craftRole"`
	Modifiers []itemModifier  `json:"modifiers"`
	Passive   json.RawMessage `json:"passive"`
	// ⭐ 2026-08-18 (GH#355) [EX∅ 根源] 的三條新酬勞軸。每一條都**單獨**構成
	// 一件寶具的全部效果，所以 hasEffect 少讀一條就會把一件做好了的寶具
	// 判成空卡，而 L2 的結論會是「它不該在池子裡」—— 100% 反向。
	Auras              json.RawMessage `json:"auras"`
	Marks              json.RawMessage `json:"marks"`
	TypeStreakImmunity json.RawMessage `json:"typeStreakImmunity"`
}

type itemModifier struct {
	Stat  string  `json:"stat"`
	Op    string  `json:"op"`
	Value float64 `json:"value"`
}

// hasEffect is shop gate S3 / draft gate D3: the item does SOMETHING in the
// shipped engine. 18 imported "final" items and all 55 recipe books carry
// neither a modifier nor a passive hook — their entire payload is an active
// ability item@1 cannot express yet, so they are excluded from both surfaces
// (the content files stay; see starter.go).
func (d itemDoc) hasEffect() bool {
	if len(d.Modifiers) > 0 {
		return true
	}
	// ⚠️ 這一串是**必須跟著 item@1 的酬勞欄位一起長**的清單，漏一條是靜默的：
	// 討伐叉整張卡就是一圈 auras、GANTZ Suit / 千年積木的免死是 marks + lethal、
	// 史萊姆裝只有 typeStreakImmunity 一格 —— 三件在 2026-08-18 都是
	// modifiers/passive 兩格全空而**確實會生效**的寶具。
	for _, raw := range []json.RawMessage{d.Passive, d.Auras, d.Marks, d.TypeStreakImmunity} {
		p := strings.TrimSpace(string(raw))
		if p != "" && p != "null" && p != "[]" {
			return true
		}
	}
	return false
}

// insaneModifiers is gate S4: values that can only be an import/unit bug.
// critChance is a FRACTION in this codebase (0.30 = 30%), so anything above
// 1.0 is a 100%+ crit rate and the classic "two incompatible units in one
// collection" defect task #47 recorded.
func (d itemDoc) insaneModifiers() []string {
	var bad []string
	for _, m := range d.Modifiers {
		switch {
		case m.Stat == "critChance" && m.Value > 1.0,
			m.Stat == "lifesteal" && m.Value > 1.0,
			m.Stat == "ad" && m.Value > 500,
			m.Stat == "ap" && m.Value > 500,
			m.Stat == "maxHealth" && m.Value > 5000,
			m.Stat == "maxMana" && m.Value > 5000,
			m.Stat == "armor" && m.Value > 200,
			m.Stat == "mr" && m.Value > 200:
			bad = append(bad, fmt.Sprintf("%s %v", m.Stat, m.Value))
		}
	}
	return bad
}

type lootTable struct {
	Entries []struct {
		ItemID string `json:"itemId"`
	} `json:"entries"`
}

func readJSON[T any](t *testing.T, path string) T {
	t.Helper()
	raw, err := os.ReadFile(path)
	require.NoErrorf(t, err, "read %s", path)
	var out T
	require.NoErrorf(t, json.Unmarshal(raw, &out), "parse %s", path)
	return out
}

// ------------------------------------------------------------------ gates --

// The task #11 hero-number prefix ("22-01 鬼隱之擊" → 22 / 01, "22-002 …" → 22 /
// 002) is parsed by `heroNumberRe` in heroidentity_test.go — ONE regex per
// package, because that prefix is also what decides champion identity.

// The arena's total buying power: 600g starting gold + round rewards
// 750+2500+1000+1250+1500. This is the DETERMINISTIC floor (a winning player
// clears 9100g before kill gold), and it is what the price ladder is derived
// against — see packages/shared/src/sim/economy/itemTiers.ts.
const matchGoldCeiling = 7600

// Starting gold, i.e. what the turn-1 shop has to work with. Exactly TWO
// SIMPLE items. MatchController granted 500 until task #82 found the drift.
const startingGold = 600

// THE TWO PRICES. 統一化 (user, 2026-07-22: 「武器價格請統一化，只有三種價格」).
// Mirrors ITEM_TIER_PRICE in packages/shared/src/sim/economy/itemTiers.ts —
// a shop item whose cost is neither of these is a bug in one of the two files.
const (
	priceSimple   = 300
	pricePowerful = 1200
)

// Inventory slots a champion has to fill. Mirrors INVENTORY_SLOTS in
// packages/shared/src/sim/economy/shop.ts. Used as the floor for "is the shelf
// still a shop": a catalogue no bigger than the slots it fills is a loadout.
const inventorySlots = 6

// The two SHOP SERVICES and their prices (SV1-SV3). Mirrors
// LEGENDARY_ORB_PRICE / STAT_TICK_PRICE in economy/itemTiers.ts.
var servicePrices = map[string]int{
	"legendary-orb":   2400,
	"stat-attunement": 375,
}

// ⭐ The THREE weapon tier tables (owner 2026-08-18: 「舊時代上架傳說武器道具全部捏平
// 成 EX寶具，只有五件我們特別拎出來寫 EX解放，再加上新一批的 EX／EX解放／EX根源，
// 組成全部上架的隨機三選一寶具」). This is a list of FILE NAMES, not of items — the
// item sets are read off disk, so promoting a 寶具 between tiers never touches Go.
//
// ⚠️ It has to be all three. `weaponTiers.pickWeaponTable` can point a card at any
// of them, and MatchController rolls BEFORE it filters to the whitelist: a tier
// whose members are unlisted deals the seat nothing, silently, with `offerCount`
// still reading 3. Mirrors DEFAULT_WEAPON_TIERS[].table plus the base pool that
// `rounds[].weaponLootTable` schedules.
var weaponPoolTables = []string{
	"legendary-weapons",  // EX
	"ex-release-weapons", // [EX解放]
	"ex-origin-weapons",  // [EX∅ 根源]
}

// whitelist-starter-content: every id in the STARTER SET names a document that
// actually exists in the content tree AND still satisfies the selection gates
// documented in starter.go. This is the guard that keeps the bundle from
// rotting when content is re-imported: the first-open roster's 48 champions
// must always be real, complete-kitted and distinct, the shop must stay
// two-priced and effective, and both weapon cards must stay rollable.
//
// The CHAMPION gates are ROSTER-INTEGRITY gates (R1–R4), not the retired
// demo-showcase visual gates — the 48 deliberately include heroes that share a
// CC0 stand-in mesh and heroes with no portrait, so uniqueness/icon/silhouette
// are NOT asserted here (see starter.go for the full rationale).
//
// Skips (does not fail) when the content tree is not checked out next to the
// module, so the unit run stays hermetic; CI runs it against the real tree.
func TestStarterSetMatchesContentTree(t *testing.T) {
	testkit.Cover(t, "whitelist-starter-content")
	root := contentRoot()
	if _, err := os.Stat(filepath.Join(root, "champions")); err != nil {
		t.Skipf("content tree not present at %s — skipping starter/content reconciliation", root)
	}

	set := curation.StarterSet()
	require.GreaterOrEqual(t, len(set.Champions), 40, "the first open roster is 49 champions")
	require.GreaterOrEqual(t, len(set.Items), 24, "starter set must enable at least 24 items")
	require.GreaterOrEqual(t, len(set.Abilities), len(set.Champions)*5,
		"every starter champion contributes its full Q/W/E/R/EX kit")

	// Every id resolves to a real content doc.
	check := func(kind string, ids []string) {
		for _, id := range ids {
			path := filepath.Join(root, kind, id+".json")
			_, err := os.Stat(path)
			require.NoErrorf(t, err, "starter %s %q has no content doc at %s", kind, id, path)
		}
	}
	check("champions", set.Champions)
	check("items", set.Items)
	check("abilities", set.Abilities)

	abilitySet := make(map[string]struct{}, len(set.Abilities))
	for _, id := range set.Abilities {
		abilitySet[id] = struct{}{}
	}
	itemSet := make(map[string]struct{}, len(set.Items))
	for _, id := range set.Items {
		itemSet[id] = struct{}{}
	}

	// R4 — no two picks are the SAME CHARACTER. Decided by the shared identity
	// rule (hero 編號 + name; see heroidentity_test.go and
	// packages/shared/src/content/championIdentity.ts), NEVER by "same mesh" or
	// "same portrait" — those heuristics erased 黑化Saber from the login roster,
	// and the 48-roster deliberately includes mesh-sharing heroes.
	seenCharacter := []championDoc{}

	for _, champID := range set.Champions {
		champ := readJSON[championDoc](t, filepath.Join(root, "champions", champID+".json"))

		for _, other := range seenCharacter {
			assert.Falsef(t, sameCharacter(other, champ),
				"first-open-roster champions %q (%s) and %q (%s) are the SAME character (hero %s) — pick one",
				other.ID, other.Name, champ.ID, champ.Name, heroNumberOf(champ))
		}
		seenCharacter = append(seenCharacter, champ)

		// R1 — not a test/placeholder hero (the 測試英雄-索隆 trap: godie-u01q is
		// rejected in favour of godie-u01u).
		for _, bad := range []string{"測試", "範例", "範本"} {
			assert.NotContainsf(t, champ.Name, bad, "roster champion %q looks like a test hero", champID)
		}

		// R2/R3 — COMPLETE, hero-number-consistent kit, all five docs present, EX
		// declared, and no HALF-ENABLED champion (every one of the five ability
		// ids must be in the bundle). NOTE this intentionally does NOT gate copy
		// quality: some real picks (e.g. 魔人普烏's EX) ship an empty description
		// in content this package does not own, so description length is not
		// asserted — identity and completeness are.
		require.Equalf(t, champID+".ex", champ.ExAbility,
			"roster champion %q must declare its EX ability", champID)
		heroNum := ""
		for _, slot := range []string{"q", "w", "e", "r", "ex"} {
			abilityID := champID + "." + slot
			_, enabled := abilitySet[abilityID]
			require.Truef(t, enabled, "roster champion %q is HALF-ENABLED: %s missing from the bundle",
				champID, abilityID)

			ab := readJSON[abilityDoc](t, filepath.Join(root, "abilities", abilityID+".json"))
			require.Equalf(t, strings.ToUpper(slot), strings.ToUpper(ab.Slot),
				"roster ability %q sits in the wrong slot", abilityID)

			m := heroNumberRe.FindStringSubmatch(ab.Name)
			require.NotNilf(t, m, "roster ability %q name %q lacks the task #11 xx-0N prefix",
				abilityID, ab.Name)
			if heroNum == "" {
				heroNum = m[1]
			}
			require.Equalf(t, heroNum, m[1],
				"roster champion %q mixes hero numbers: %q is %s-, expected %s-",
				champID, abilityID, m[1], heroNum)
			wantLen := 2
			if slot == "ex" {
				wantLen = 3
			}
			require.Lenf(t, m[2], wantLen,
				"roster ability %q prefix %q has the wrong width for slot %s", abilityID, ab.Name, slot)
		}
	}

	// ---------------------------------------------------------------- items --
	// The surfaces of the arena item model (task #70): an item is bought with
	// gold OR handed out free, never both.
	shop := curation.StarterShopItems()
	services := curation.StarterServiceItems()
	legendary := curation.StarterLegendaryItems()
	// `>= 20` was July's shelf size and stopped meaning anything when owner
	// 2026-08-01 moved 18 effective finals onto the 棱彩 surface. The property
	// worth holding: the shelf must still outnumber the 6 inventory slots a
	// build has to fill (INVENTORY_SLOTS, packages/shared/src/sim/economy/shop.ts)
	// — a shelf at or below that is a fixed loadout, not a shop.
	require.Greater(t, len(shop), inventorySlots,
		"the shop surface must offer more finals than a build has slots to fill")
	require.GreaterOrEqual(t, len(legendary), 6, "the weapon pools must be able to fill a 3-choose-1 twice")
	require.Len(t, services, 2, "the shop services are exactly 傳說寶玉 + 能力屬性強化")

	// PAID vs FREE is absolute, and it is the half that matters:
	// 「傳說的武器道具，只能隨機三選一」 means a legendary must be reachable ONLY
	// through a round card or the orb, so an id in both lists would be a
	// directly-purchasable legendary.
	paidSurfaceOf := map[string]string{}
	for name, list := range map[string][]string{"shop": shop, "services": services} {
		for _, id := range list {
			if prev, dup := paidSurfaceOf[id]; dup {
				t.Errorf("item %q is on BOTH the %s and %s surfaces", id, prev, name)
			}
			paidSurfaceOf[id] = name
		}
	}
	legendarySeen := map[string]struct{}{}
	for _, id := range legendary {
		if _, dup := legendarySeen[id]; dup {
			t.Errorf("the weapon-pool surface lists %q twice", id)
		}
		if paid, dup := paidSurfaceOf[id]; dup {
			t.Errorf("item %q is on the paid %s surface AND the free weapon surface — it can be bought",
				id, paid)
		}
		legendarySeen[id] = struct{}{}
	}

	// ⭐ 2026-08-18 the surfaces are a PARTITION again. FREE∩FREE used to be a
	// pinned 6-id overlap because the same 任務道具 sat on both the DRAFT and the
	// 棱彩 surface; owner retired the 任務道具 label 「在競技場新玩法則完全不考慮這個
	// 標籤」, so there is no second free surface to overlap with any more.
	require.Len(t, set.Items, len(shop)+len(services)+len(legendary),
		"the served bundle is SHOP + SERVICES + WEAPONS deduped — an unlisted id on two "+
			"surfaces would be silently swallowed here")

	// S1–S5 — every SHOP item is a FINAL crafted weapon (owner rule 1, task
	// #70), carries ONE OF THE TWO PRICES, is effective and is sane. S5 is the
	// new structural gate: the shop is derived from `craftRole == "final"`, not
	// from price — which is what stops a priced component or a priced quest item
	// (魔戒 at 300g was the reopening's smoking gun) from ever reaching the shelf.
	affordableAtStart, simpleCount, powerfulCount := 0, 0, 0
	for _, id := range shop {
		item := readJSON[itemDoc](t, filepath.Join(root, "items", id+".json"))
		assert.NotEqualf(t, id, item.Name, "S1: shop item %q has no display name", id)
		assert.Equalf(t, "final", item.CraftRole,
			"S5: shop item %q has craftRole %q, not \"final\" — 「只有最終合成武器才能上架可直接購買」. "+
				"The shop is the set of final crafted weapons, recovered from the source-map triggers "+
				"by tools/w3x-import/extract_item_roles.py, NOT the set of priced items.", id, item.CraftRole)
		// S2, the 統一化 gate: exactly one of the two prices, nothing between,
		// nothing above.
		assert.Containsf(t, []int{priceSimple, pricePowerful}, item.Cost,
			"S2: shop item %q costs %dg — the shop has exactly TWO prices, %d (SIMPLE) and %d "+
				"(POWERFUL). See packages/shared/src/sim/economy/itemTiers.ts",
			id, item.Cost, priceSimple, pricePowerful)
		assert.Truef(t, item.hasEffect(),
			"S3: shop item %q has no modifier and no passive — it would be a paid no-op", id)
		assert.Emptyf(t, item.insaneModifiers(),
			"S4: shop item %q carries impossible values %v (unit/import bug)", id, item.insaneModifiers())

		switch item.Cost {
		case priceSimple:
			simpleCount++
		case pricePowerful:
			powerfulCount++
		}
		if item.Cost <= startingGold {
			affordableAtStart++
		}
		assert.LessOrEqualf(t, item.Cost, matchGoldCeiling,
			"shop item %q costs %dg, above the %dg a whole match can earn — task #82 removed the "+
				"above-ceiling band entirely, so this is a regression, not a known exception",
			id, item.Cost, matchGoldCeiling)
	}
	// The shop is FINAL weapons only, minus whatever the 棱彩 pool claims, so it
	// is a much smaller, sharper shelf than the old cost-filtered 70. It still
	// has to give turn 1 a real choice (at least one SIMPLE final is buyable on
	// the 600g purse) and a real late game: a player filling every slot with
	// POWERFUL items must have had an ALTERNATIVE at each one. `>= 10` was
	// July's count and measured nothing once 18 finals moved to the draft.
	assert.GreaterOrEqualf(t, affordableAtStart, 1,
		"no shop item is buyable on the %dg starting purse — turn 1 has nothing", startingGold)
	assert.GreaterOrEqualf(t, simpleCount, 1, "only %d SIMPLE finals", simpleCount)
	assert.Greaterf(t, powerfulCount, inventorySlots,
		"%d POWERFUL finals for %d slots — the late shop is a forced build, not a choice",
		powerfulCount, inventorySlots)

	// SV1–SV3 — the shop services. No modifiers by design (their payload is
	// code), so S3 is deliberately not applied; instead the id must be one the
	// sim actually dispatches, or the listing takes gold and does nothing.
	for _, id := range services {
		item := readJSON[itemDoc](t, filepath.Join(root, "items", id+".json"))
		assert.NotEqualf(t, id, item.Name, "SV1: service %q has no display name", id)
		want, known := servicePrices[id]
		assert.Truef(t, known,
			"SV3: service %q is not a service the sim dispatches — see isShopService in "+
				"packages/shared/src/sim/economy/itemTiers.ts", id)
		assert.Equalf(t, want, item.Cost, "SV2: service %q costs %dg, expected %dg", id, item.Cost, want)
	}

	// L1–L4 — the weapon-pool surface. L3 is the user's rule made mechanical.
	for _, id := range legendary {
		item := readJSON[itemDoc](t, filepath.Join(root, "items", id+".json"))
		assert.NotEqualf(t, id, item.Name, "L1: 寶具 %q has no display name", id)
		assert.Truef(t, item.hasEffect(),
			"L2: 寶具 %q has no modifier and no passive — the card would grant NOTHING", id)
		assert.Zerof(t, item.Cost,
			"L3: 寶具 %q carries a price of %dg. 「傳說的武器道具，只能隨機三選一」 — a 寶具 "+
				"is reachable only through the free weapon card or the 2400g 傳說寶玉, never by paying "+
				"for the item itself", id, item.Cost)
		// ⭐ The surviving half of the retired D4: no 四魂之玉 shard may be offered.
		// In a game with no combining, an item named "shard OF the jewel" next to
		// the completed jewel is the surest way to send a player hunting for a
		// crafting UI that does not exist.
		assert.NotContainsf(t, item.Name, "四魂之玉的碎片",
			"L4: %q (%s) is a 四魂之玉 shard — shards are never offered, only the assembled jewel is",
			id, item.Name)
		assert.Emptyf(t, item.insaneModifiers(),
			"寶具 %q carries impossible values %v", id, item.insaneModifiers())
	}

	// The stat path must be REACHABLE, and only just: 20 ticks at 375g is
	// 7,500g of the 7,600g a match deterministically yields. If someone
	// repriced the tick, this is where it surfaces.
	tickCost := servicePrices["stat-attunement"]
	assert.LessOrEqualf(t, tickCost*20, matchGoldCeiling,
		"20 stat ticks cost %dg but a match only yields %dg — the 能力屬性強化 capstone is "+
			"UNREACHABLE", tickCost*20, matchGoldCeiling)
	assert.Greaterf(t, tickCost*20, matchGoldCeiling*9/10,
		"20 stat ticks cost only %dg of a %dg match — the stat path is supposed to cost you the "+
			"WHOLE match, not leave room to also buy items", tickCost*20, matchGoldCeiling)

	// ⚠️ D1–D5 (the 任務道具 draft gates) WERE HERE. owner 2026-08-18 retired the
	// label —「在競技場新玩法**則完全不考慮這個標籤**」— and the six items moved into
	// the tier tables, where L1–L4 below already hold them to a stricter bar
	// (D3 was deliberately NOT an effect gate; L2 is). ⭐ The one clause that
	// outlived the surface is D4「no 四魂之玉 shards」, re-stated over the pools below.

	// ═══════════════════════════════════════════════════════════════════════
	// LOOT CLOSURE — the whitelist ⟷ the THREE tier tables, BOTH directions
	// ═══════════════════════════════════════════════════════════════════════
	// MatchController filters a weapon offer to the whitelist and rolls BEFORE it
	// filters, so an id in a pool but not on the whitelist eats a card slot in
	// silence, and a whole pool of unlisted ids deals a seat NOTHING while
	// `offerCount` still reads 3. Measured 2026-08-18 before this was widened:
	// 22 of ex-release-weapons' entries were unlisted and nothing warned.
	//
	// ⭐ DERIVED, NOT PINNED: the expectation is the union of the files, read at
	// test time. Moving a 寶具 between tiers therefore needs NO edit here — only
	// adding or removing one does, which is exactly the change worth a red test.
	poolIDs := []string{}
	for _, table := range weaponPoolTables {
		loot := readJSON[lootTable](t, filepath.Join(root, "loot-tables", table+".json"))
		require.NotEmptyf(t, loot.Entries, "content/loot-tables/%s.json is empty — that tier deals nothing", table)
		for _, e := range loot.Entries {
			poolIDs = append(poolIDs, e.ItemID)
		}
	}
	sort.Strings(poolIDs)
	// A 寶具 belongs to EXACTLY ONE pool (owner 2026-08-18 「請將所有寶具回歸到所屬
	// 池子」). Before that edit 5 items sat in two pools and could be rolled twice.
	for i := 1; i < len(poolIDs); i++ {
		assert.NotEqualf(t, poolIDs[i-1], poolIDs[i],
			"%q is in TWO tier tables — a 寶具 belongs to exactly one pool, or it is rolled twice", poolIDs[i])
	}
	wantWeapons := append([]string(nil), legendary...)
	sort.Strings(wantWeapons)
	assert.Equalf(t, wantWeapons, poolIDs,
		"the three loot tables and the bundle's weapon surface have drifted apart — "+
			"an id here that is not whitelisted is silently never offered")
}

// allItemDocs reads every shippable content/items/*.json (skipping the _index
// and the collection helpers) so a guard can be stated over the WHOLE tree, not
// just the curated bundle — the only way to catch an item that SHOULD be on a
// surface but was left off it.
func allItemDocs(t *testing.T) map[string]itemDoc {
	t.Helper()
	dir := filepath.Join(contentRoot(), "items")
	entries, err := os.ReadDir(dir)
	require.NoError(t, err)
	out := map[string]itemDoc{}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") || strings.HasPrefix(e.Name(), "_") {
			continue
		}
		id := strings.TrimSuffix(e.Name(), ".json")
		out[id] = readJSON[itemDoc](t, filepath.Join(dir, e.Name()))
	}
	return out
}

// TestStarterShopIsFinalWeapons — THE guard the owner asked for, shop half
// (task #70, reopened twice). It fails if a non-final item reaches the shop OR
// a final crafted weapon is missing from it. Derived from the craftRole marker
// over the whole content tree, so neither half can rot: the inclusion half (a
// new final must be listed) is checked as strictly as the exclusion half (a
// component/quest/token must NOT be), and it is the EXCLUSION half — 「只有最終
// 合成武器才能上架」 — that the previous cost-based filter silently dropped.
func TestStarterShopIsFinalWeapons(t *testing.T) {
	testkit.Cover(t, "whitelist-shop-final-only")
	docs := allItemDocs(t)
	shop := map[string]struct{}{}
	for _, id := range curation.StarterShopItems() {
		shop[id] = struct{}{}
	}

	// A weapon pool CLAIMS a final away from the shelf: owner moved the effective
	// finals into the pools and zeroed their price in the same edit, so rule 1
	// (「最終合成武器…可直接購買」) and 「傳說＝三選一專屬」 point the same way for them —
	// they are drafted, not sold. Read from the shipped loot tables so moving an
	// item between surfaces needs no edit here — an exclusion LIST would rot on
	// the next move.
	// ⚠️ 2026-08-18: ALL THREE tables, not just legendary-weapons. Reading one of
	// three would let a 寶具 promoted to [EX解放] quietly become shop-eligible again.
	legendary := map[string]struct{}{}
	for _, name := range weaponPoolTables {
		table := readJSON[lootTable](t, filepath.Join(contentRoot(), "loot-tables", name+".json"))
		for _, e := range table.Entries {
			legendary[e.ItemID] = struct{}{}
		}
	}
	require.NotEmpty(t, legendary, "the weapon pools are empty — the exclusion below would be vacuous")

	// EXCLUSION: nothing on the shelf may be anything but a final crafted weapon,
	// and nothing on the shelf may be a 棱彩 entry.
	for id := range shop {
		d := docs[id]
		assert.Equalf(t, "final", d.CraftRole,
			"shop item %q (%s) has craftRole %q — the shop is FINAL crafted weapons only "+
				"(owner rule 1). A priced component or quest item must never reach the shelf.",
			id, d.Name, d.CraftRole)
		_, drafted := legendary[id]
		assert.Falsef(t, drafted,
			"shop item %q (%s) is also in one of the weapon tier tables — "+
				"「傳說的武器道具，只能隨機三選一」. It carries cost 0 now, so listing it is a dead "+
				"0g button on the shelf the moment 武器貨架 (#261) reopens.", id, d.Name)
	}
	// INCLUSION: every final crafted weapon that CAN be sold (has an expressible
	// payload) and that the 棱彩 pool has NOT claimed must be on the shelf. A
	// final with no effect is blocked on the item@1 active schema (#56) and is
	// legitimately absent.
	for id, d := range docs {
		if d.CraftRole != "final" || !d.hasEffect() {
			continue
		}
		if _, drafted := legendary[id]; drafted {
			continue
		}
		_, listed := shop[id]
		assert.Truef(t, listed,
			"final crafted weapon %q (%s) is NOT in the shop — 「最終合成武器…可直接購買」 requires it "+
				"to be buyable. Add it to starterShopItems, or explain the exclusion.", id, d.Name)
	}
}

// ⚠️ TestStarterDraftIsQuestSet WAS HERE and is gone, 2026-08-18. It pinned the
// DRAFT surface to the `craftRole == "quest"` marker and to
// content/loot-tables/quest-rewards.json, both of which owner retired:
// 「他有個舊標籤叫做任務道具，但在競技場新玩法**則完全不考慮這個標籤**」.
// ⛔ Nothing was left unguarded: the six items are 寶具 in the tier tables now, and
// TestStarterSetMatchesContentTree's LOOT CLOSURE pins those tables to the
// whitelist in BOTH directions — a stricter bar than the D-gates were.

// firstOpenRoster is the user's 49 hand-picked champions — the FIRST OPEN
// ROSTER (對戰可選名單), one canonical id per requested name after dropping the
// test/placeholder and duplicate-reskin candidates (see starter.go and 附錄A of
// docs/hero-popularity-ranking.md). Pinned here id-for-id so a re-import or a
// careless edit to starter.go cannot silently add, drop or swap a champion.
//
// 48 at task #138; task #212 added godie-efur (揍敵客桀諾 #13) and godie-hblm
// (賈修貝爾 #05); GH#29 added godie-zombiex (喪標麥可 #100 —— 玩家從第 3 回合起
// 每場都在打的那隻殭屍,owner 要它可選). Adding a champion here is deliberate and reviewable — that is
// the whole point of the pin. The new-hero checklist that must be walked before
// an id lands in this list is docs/新英雄上架SOP.md.
// TASK #249 SWAPPED TEN OF THESE from the 變身 form to the BASE unit. Each swap
// is `alternate → base` for one hero, so the roster SIZE and the set of hero
// 編號 are unchanged; what changed is which BODY the player picks:
//
//	#04 h020→hjai  #08 n01c→nbbc  #09 o00x→ogrh  #11 u01u→udre  #12 e007→ewar
//	#18 n00p→nsjs  #25 u00l→umal  #38 u010→uvng  #90 h02r→hgam  #92 h02u→h02v
//
// Owner ruling 2026-07-26:「換成本體，變身態改由技能觸發」.
//
// L1 (owner 2026-07-30) added the 52nd and 53rd:「加入釋出變身釋出可選白名單:
// 70 白木老樹精 · 白木卡迪那 紮根態、6 職業獵人 · 傑 富力士 傑桑變化」—— both land
// as the BASE body (R6), because the 變身態 the owner names IS what the base's own
// trigger ability reaches: godie-e00s #70 toggles into godie-e010 via 70-00 紮根,
// godie-ucrl #06 morphs into godie-u034 for 7s via 06-04 傑桑變化.
var firstOpenRoster = []string{
	"godie-e001", "godie-e002", "godie-e008", "godie-e00r",
	"godie-e00s", "godie-e00w", "godie-edem", "godie-efur", "godie-emfr",
	"godie-emns",
	"godie-etyr", "godie-ewar", "godie-h00l", "godie-h01n", "godie-h01u",
	"godie-h02k", "godie-h02v", "godie-hapm", "godie-hart", "godie-hgam", "godie-hjai", "godie-hpb1", "godie-huth",
	"godie-hvsh", "godie-hvwd", "godie-n003", "godie-n00b", "godie-nbbc",
	"godie-nsjs", "godie-o00k", "godie-o00l", "godie-o02p",
	"godie-ofar", "godie-ogld", "godie-ogrh", "godie-orkn", "godie-osam",
	"godie-u00h", "godie-u00j", "godie-u00k", "godie-u00n", "godie-u00v",
	"godie-ubal", "godie-ucrl", "godie-udea", "godie-udre", "godie-umal",
	"godie-uvng",
	"godie-zombiex",
}

// whitelist-first-open-roster: the enabled champion set the starter bundle
// seeds is EXACTLY the 49 canonical first-open-roster ids — no more, no fewer,
// none swapped. This is the guard the task asks for; it needs no content tree,
// so it runs in any environment.
func TestFirstOpenRoster(t *testing.T) {
	testkit.Cover(t, "whitelist-first-open-roster")

	require.Len(t, firstOpenRoster, 49, "the first open roster is 49 champions")
	seen := map[string]struct{}{}
	for _, id := range firstOpenRoster {
		_, dup := seen[id]
		require.Falsef(t, dup, "the pinned roster repeats %q", id)
		seen[id] = struct{}{}
	}

	want := append([]string(nil), firstOpenRoster...)
	sort.Strings(want)
	assert.Equal(t, want, curation.StarterSet().Champions,
		"the starter bundle's enabled champion set must be EXACTLY the 49 canonical first-open-roster ids")
}

// storeDoc is the FLAT-PRICE half of content/config/store.json — the same two
// fields wallet.LoadCatalog reads into Catalog.UnlockCost / the free set.
//
// It replaced a `championPrices map[string]int` on 2026-07-30 (owner:「所有英雄
// 藍水晶都是統一價，新上架預設也是一樣價格」). Read the test below for what that
// changed about the risk being guarded.
type storeDoc struct {
	ChampionUnlockCost int      `json:"championUnlockCost"`
	FreeChampionIds    []string `json:"freeChampionIds"`
}

// FREE / PRICED is the ECONOMY SHAPE the owner has deliberately decided not to
// change (2026-07-26:「藍水晶本來就是獎勵 有人抱怨我們再來改」). The roster may
// move ids; it may not quietly move these two numbers.
//
// ⚠️ 2026-08-16 —— 41 → 37。**這不是改經濟形狀，是名單變短了**：owner 下架四位
// （安云 godie-e00k · 藤井八雲 godie-hpal · 賈修貝爾 godie-hblm · 麻倉葉 godie-nplh），
// 四位全部是付費解鎖的，所以 53−4=49 位裡 12 免費、37 付費。免費那 12 位一位都沒動
// —— 那才是這條斷言真正在守的東西（「免費的比例不可以偷偷變」）。
// ⛔ 如果哪天 free 也跟著動了，那就**不是**跟著名單走，要回來問 owner。
const (
	starterFreeChampions   = 12
	starterPricedChampions = 37
)

// clientWalletMetaPath is the champ-select module that carries the client's
// FALLBACK unlock cost. Read as text (not imported — it is TypeScript) so the
// three-sided price agreement can be asserted from one place.
const clientWalletMetaPath = "apps/client/src/ui/panels/champselect/walletMeta.ts"

var clientUnlockCostRe = regexp.MustCompile(`CRYSTAL_UNLOCK_COST\s*=\s*(\d+)`)

// whitelist-store-prices: the FLAT champion price is the one every roster
// champion actually pays, the free list names only real roster champions, and
// the number is the same on all three sides.
//
// WHAT THIS USED TO GUARD, AND WHY THE RISK MOVED. Until 2026-07-30 store.json
// carried a 53-entry `championPrices` map that had to be kept equal to the
// first open roster by hand, and this test asserted that equality in both
// directions. It was written after the #249 regression, where swapping ten
// roster slots left ten prices behind: an id with NO price entry read as FREE
// on both sides (client lockStateOf: `price === undefined` → "free"; server
// wallet.OwnsChampion: `!priced` → true), and an orphaned 0-price id kept being
// seeded into every new account by Catalog.FreeChampions().
//
// The map is gone, so "a roster id with no price line" is no longer expressible
// — LoadCatalog derives every price from the flat cost. That does NOT make this
// test unnecessary, it makes it guard a different set of mistakes:
//
//	P1 the DEFAULT DIRECTION. A roster champion that is not free-listed must
//	   cost the flat cost, never 0. This is the whole point of the redesign:
//	   the failure mode it replaced ("forgot a line → the champion is a gift")
//	   is only fixed for as long as the unlisted case resolves to PAID.
//	P2 the free list has no TYPOS. Every id on `freeChampionIds` must be a real
//	   roster champion. A typo is silent in both directions — the mistyped id
//	   prices nothing, and the champion it was meant to name quietly costs 300.
//	P3 the shape (12 free / 41 priced) is unchanged, same owner decision as
//	   before.
//	P4 all three sides agree on the number: the content doc, the Go fallback
//	   constant (wallet.CrystalUnlockCost) and the client fallback constant
//	   (CRYSTAL_UNLOCK_COST). The two constants are fallbacks now, not the
//	   price, but a stale fallback prints a number the server will not charge
//	   to exactly the players whose client cannot reach the wallet API.
//
// "a new champion needs no store edit at all" is the fourth property and it is
// asserted where it can be exercised end-to-end, against a synthetic content
// tree: TestNewChampionIsPricedWithoutAnyStoreEdit in internal/wallet.
func TestStarterRosterMatchesChampionPrices(t *testing.T) {
	testkit.Cover(t, "whitelist-store-prices")
	root := contentRoot()
	storePath := filepath.Join(root, "config", "store.json")
	if _, err := os.Stat(storePath); err != nil {
		t.Skipf("content tree not present at %s — skipping roster/price reconciliation", storePath)
	}

	doc := readJSON[storeDoc](t, storePath)
	require.Positivef(t, doc.ChampionUnlockCost,
		"%s carries no championUnlockCost — with a flat price of 0 EVERY champion is a giveaway "+
			"and the 水晶 loop has nothing to spend on", storePath)

	roster := curation.StarterSet().Champions
	inRoster := make(map[string]struct{}, len(roster))
	for _, id := range roster {
		inRoster[id] = struct{}{}
	}
	freeIDs := make(map[string]struct{}, len(doc.FreeChampionIds))
	for _, id := range doc.FreeChampionIds {
		freeIDs[id] = struct{}{}
	}

	// P2 — a typo on the free list is invisible without this.
	var ghosts []string
	for _, id := range doc.FreeChampionIds {
		if _, ok := inRoster[id]; !ok {
			ghosts = append(ghosts, id)
		}
	}
	sort.Strings(ghosts)
	assert.Emptyf(t, ghosts,
		"%d id(s) on freeChampionIds in %s are NOT on the first open roster: %v. Nothing rejects a "+
			"mistyped id — it simply frees nobody, while the champion it was meant to name silently "+
			"costs %d crystals. Fix the spelling, or add the champion to starterChampions on purpose.",
		len(ghosts), storePath, ghosts, doc.ChampionUnlockCost)

	// P1 + P3 — price every roster champion through the SHIPPED rule.
	free, priced := 0, 0
	var wrong []string
	for _, id := range roster {
		got := wallet.PriceOf(doc.ChampionUnlockCost, freeIDs, id)
		_, isFree := freeIDs[id]
		switch {
		case isFree && got == 0:
			free++
		case !isFree && got == doc.ChampionUnlockCost:
			priced++
		default:
			wrong = append(wrong, fmt.Sprintf("%s = %d (free-listed: %v)", id, got, isFree))
		}
	}
	sort.Strings(wrong)
	assert.Emptyf(t, wrong,
		"wallet.PriceOf disagrees with the store doc for %d roster champion(s): %v. A roster champion "+
			"is either on freeChampionIds and costs 0, or is not and costs exactly championUnlockCost "+
			"(%d) — there is no third answer, and 0 for a non-free champion is the give-it-away bug "+
			"the flat price exists to make unrepresentable.",
		len(wrong), wrong, doc.ChampionUnlockCost)

	assert.Equalf(t, starterFreeChampions, free,
		"the roster ships %d FREE champions, expected %d. The crystal economy's shape is a deliberate "+
			"owner decision (2026-07-26:「藍水晶本來就是獎勵 有人抱怨我們再來改」) — moving a roster id "+
			"must carry its price across, not change how many heroes are free. If this change IS "+
			"intended, update starterFreeChampions/starterPricedChampions here so it is reviewed.",
		free, starterFreeChampions)
	assert.Equalf(t, starterPricedChampions, priced,
		"the roster ships %d PRICED champions, expected %d — that is the crystal SINK. See the note on "+
			"starterFreeChampions before changing this pin.",
		priced, starterPricedChampions)

	// P4 — the doc, the Go fallback and the client fallback are one number.
	assert.Equalf(t, doc.ChampionUnlockCost, wallet.CrystalUnlockCost,
		"content/config/store.json charges %d crystals but wallet.CrystalUnlockCost is %d. That "+
			"constant is the FALLBACK a content-less boot uses and the figure the whole balance model "+
			"in meta.go is written against; a stale copy makes that reasoning fiction.",
		doc.ChampionUnlockCost, wallet.CrystalUnlockCost)

	clientPath := filepath.Join(root, "..", filepath.FromSlash(clientWalletMetaPath))
	src, err := os.ReadFile(clientPath) // #nosec G304 -- fixed repo-relative test path
	require.NoErrorf(t, err, "cannot read %s — the client's fallback price cannot be checked", clientPath)
	m := clientUnlockCostRe.FindSubmatch(src)
	require.Lenf(t, m, 2, "no CRYSTAL_UNLOCK_COST literal in %s", clientPath)
	clientCost, err := strconv.Atoi(string(m[1]))
	require.NoError(t, err)
	assert.Equalf(t, doc.ChampionUnlockCost, clientCost,
		"the client's CRYSTAL_UNLOCK_COST fallback is %d but the store doc charges %d. The live client "+
			"reads `crystalUnlockCost` off GET /wallet, so this only bites a client that cannot reach "+
			"the platform — which is exactly when it prints 「🔓 解鎖 (%d 水晶)」 and the server "+
			"deducts %d.",
		clientCost, doc.ChampionUnlockCost, clientCost, doc.ChampionUnlockCost)
}

// whitelist-starter-shape: the bundle's three lists are internally consistent
// (sorted, deduped, abilities exactly mirror the champions) WITHOUT touching
// the content tree, so this gate runs even in a hermetic unit environment.
func TestStarterSetShape(t *testing.T) {
	testkit.Cover(t, "whitelist-starter-shape")
	set := curation.StarterSet()

	for _, list := range [][]string{set.Champions, set.Items, set.Abilities} {
		seen := map[string]struct{}{}
		prev := ""
		for _, id := range list {
			_, dup := seen[id]
			require.Falsef(t, dup, "starter bundle repeats %q", id)
			seen[id] = struct{}{}
			require.LessOrEqualf(t, prev, id, "starter bundle is not sorted at %q", id)
			prev = id
		}
	}

	champs := make(map[string]struct{}, len(set.Champions))
	for _, id := range set.Champions {
		champs[id] = struct{}{}
	}
	want := make(map[string]struct{}, len(set.Champions)*5)
	for id := range champs {
		for _, slot := range []string{"q", "w", "e", "r", "ex"} {
			want[fmt.Sprintf("%s.%s", id, slot)] = struct{}{}
		}
	}
	for _, id := range set.Abilities {
		_, ok := want[id]
		assert.Truef(t, ok, "starter ability %q belongs to no starter champion", id)
		delete(want, id)
	}
	assert.Emptyf(t, want, "starter champions are missing %d ability ids (half-enabled champion)", len(want))
}
