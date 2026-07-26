package curation_test

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/internal/curation"
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
	p := strings.TrimSpace(string(d.Passive))
	return p != "" && p != "null"
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

// The two SHOP SERVICES and their prices (SV1-SV3). Mirrors
// LEGENDARY_ORB_PRICE / STAT_TICK_PRICE in economy/itemTiers.ts.
var servicePrices = map[string]int{
	"legendary-orb":   2400,
	"stat-attunement": 375,
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
	require.GreaterOrEqual(t, len(set.Champions), 40, "the first open roster is 50 champions")
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
	// The two surfaces of the arena item model (task #70). They partition the
	// bundle: an item is bought with gold OR drafted for free, never both.
	shop := curation.StarterShopItems()
	draft := curation.StarterDraftItems()
	services := curation.StarterServiceItems()
	legendary := curation.StarterLegendaryItems()
	require.GreaterOrEqual(t, len(shop), 20, "the shop surface must be a real catalogue of final weapons")
	require.GreaterOrEqual(t, len(draft), 6, "the draft surface must be able to fill a 3-choose-1 twice")
	require.GreaterOrEqual(t, len(legendary), 6, "the legendary pool must be able to fill a 3-choose-1 twice")
	require.Len(t, services, 2, "the shop services are exactly 傳說寶玉 + 能力屬性強化")
	require.Len(t, set.Items, len(shop)+len(services)+len(legendary)+len(draft),
		"the bundle is exactly SHOP + SERVICES + LEGENDARY + DRAFT — an id on two surfaces would be "+
			"deduped away here")

	// The four surfaces PARTITION the catalogue. The shop/legendary split is
	// the one that matters most: 「傳說的武器道具，只能隨機三選一」 means a
	// legendary must be reachable ONLY through the round-5 card or the orb, so
	// an id in both lists would be a directly-purchasable legendary.
	surfaceOf := map[string]string{}
	for name, list := range map[string][]string{
		"shop": shop, "services": services, "legendary": legendary, "draft": draft,
	} {
		for _, id := range list {
			if prev, dup := surfaceOf[id]; dup {
				t.Errorf("item %q is on BOTH the %s and %s surfaces", id, prev, name)
			}
			surfaceOf[id] = name
		}
	}

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
	// The shop is now the FINAL weapons only, so it is a smaller, sharper shelf
	// than the old cost-filtered 70. It still has to give turn 1 a real choice
	// (at least one SIMPLE final is buyable on the 600g purse) and a real late
	// game (a body of POWERFUL finals).
	assert.GreaterOrEqualf(t, affordableAtStart, 1,
		"no shop item is buyable on the %dg starting purse — turn 1 has nothing", startingGold)
	assert.GreaterOrEqualf(t, simpleCount, 1, "only %d SIMPLE finals", simpleCount)
	assert.GreaterOrEqualf(t, powerfulCount, 10, "only %d POWERFUL finals", powerfulCount)

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

	// L1–L3 — the legendary pool. L3 is the user's rule made mechanical.
	for _, id := range legendary {
		item := readJSON[itemDoc](t, filepath.Join(root, "items", id+".json"))
		assert.NotEqualf(t, id, item.Name, "L1: legendary %q has no display name", id)
		assert.Truef(t, item.hasEffect(),
			"L2: legendary %q has no modifier and no passive — the card would grant NOTHING", id)
		assert.Zerof(t, item.Cost,
			"L3: legendary %q carries a price of %dg. 「傳說的武器道具，只能隨機三選一」 — a legendary "+
				"is reachable only through the round-5 card or the 2400g 傳說寶玉, never by paying "+
				"for the item itself", id, item.Cost)
		assert.Emptyf(t, item.insaneModifiers(),
			"legendary %q carries impossible values %v", id, item.insaneModifiers())
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

	// D1–D5 — every DRAFT item is a named, FREE, effective QUEST reward (owner
	// rule 2, task #70). D5 is the structural gate: the draft is the set of
	// `craftRole == "quest"` items, recovered from the source-map quest triggers
	// — so nothing that is not a quest item can appear here, which is the half
	// of the owner's rule 「不要放這些任務道具以外的東西」 most likely to be dropped.
	// (D4, "no 四魂之玉 shards", is a policy call asserted separately below.)
	for _, id := range draft {
		item := readJSON[itemDoc](t, filepath.Join(root, "items", id+".json"))
		assert.NotEqualf(t, id, item.Name, "D1: draft item %q has no display name", id)
		assert.Zerof(t, item.Cost, "D2: draft item %q costs %dg — a draft reward is free", id, item.Cost)
		// D3 is DELIBERATELY NOT an effect gate here (unlike the shop's S3).
		// 仙后座/戰旗/復仇之袍/惡魔吉他 are quest items the owner named or implied,
		// but their whole payload is an active/aura ability item@1 cannot express
		// yet (blocked on #56), so they carry no modifiers. Owner rule 2 is
		// 「所有任務道具」 — ALL quest items — so they belong in the draft anyway;
		// dropping them for lacking ported stats is how 仙后座 went missing before.
		assert.Emptyf(t, item.insaneModifiers(),
			"draft item %q carries impossible values %v", id, item.insaneModifiers())
		assert.NotContainsf(t, item.Name, "四魂之玉的碎片",
			"D4: %q (%s) is a 四魂之玉 shard — shards are dropped, only the assembled jewel is drafted",
			id, item.Name)
		assert.Equalf(t, "quest", item.CraftRole,
			"D5: draft item %q has craftRole %q, not \"quest\" — 「隨機三選一…不要放這些任務道具以外的"+
				"東西」. The draft is EXACTLY the quest set from the source-map triggers.", id, item.CraftRole)
	}

	// LOOT CLOSURE, both tables. MatchController filters a weapon offer to the
	// whitelist and SKIPS the grant when nothing survives, so an under-seeded
	// bundle makes the round-2/round-5 cards silently give the player nothing.
	// quest-rewards is the round-2 table and must be the draft surface exactly;
	// legendary-weapons is the round-5 table.
	quest := readJSON[lootTable](t, filepath.Join(root, "loot-tables", "quest-rewards.json"))
	questIDs := make([]string, 0, len(quest.Entries))
	for _, e := range quest.Entries {
		questIDs = append(questIDs, e.ItemID)
	}
	sort.Strings(questIDs)
	wantDraft := append([]string(nil), draft...)
	sort.Strings(wantDraft)
	assert.Equalf(t, wantDraft, questIDs,
		"content/loot-tables/quest-rewards.json and the bundle's draft surface have drifted apart")

	// Same closure for the legendary table: it is BOTH the round-5 card's pool
	// and the 傳說寶玉's pool, so a drift here would sell a 2400g token that
	// rolls from a table the whitelist does not match.
	legend := readJSON[lootTable](t, filepath.Join(root, "loot-tables", "legendary-weapons.json"))
	legendIDs := make([]string, 0, len(legend.Entries))
	for _, e := range legend.Entries {
		legendIDs = append(legendIDs, e.ItemID)
	}
	sort.Strings(legendIDs)
	wantLegendary := append([]string(nil), legendary...)
	sort.Strings(wantLegendary)
	assert.Equalf(t, wantLegendary, legendIDs,
		"content/loot-tables/legendary-weapons.json and the bundle's legendary surface have drifted apart")

	for _, table := range []string{"quest-rewards", "legendary-weapons"} {
		loot := readJSON[lootTable](t, filepath.Join(root, "loot-tables", table+".json"))
		enabled := 0
		for _, e := range loot.Entries {
			if _, ok := itemSet[e.ItemID]; ok {
				enabled++
			}
		}
		assert.Positivef(t, enabled,
			"no %s entry is enabled — that weapon-draft round would silently grant nothing (%d entries in the table)",
			table, len(loot.Entries))
	}
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

	// EXCLUSION: nothing on the shelf may be anything but a final crafted weapon.
	for id := range shop {
		d := docs[id]
		assert.Equalf(t, "final", d.CraftRole,
			"shop item %q (%s) has craftRole %q — the shop is FINAL crafted weapons only "+
				"(owner rule 1). A priced component or quest item must never reach the shelf.",
			id, d.Name, d.CraftRole)
	}
	// INCLUSION: every final crafted weapon that CAN be sold (has an expressible
	// payload) must be on the shelf. A final with no effect is blocked on the
	// item@1 active schema (#56) and is legitimately absent.
	for id, d := range docs {
		if d.CraftRole != "final" || !d.hasEffect() {
			continue
		}
		_, listed := shop[id]
		assert.Truef(t, listed,
			"final crafted weapon %q (%s) is NOT in the shop — 「最終合成武器…可直接購買」 requires it "+
				"to be buyable. Add it to starterShopItems, or explain the exclusion.", id, d.Name)
	}
}

// TestStarterDraftIsQuestSet — THE guard the owner asked for, draft half. It
// fails if a non-quest item reaches the 3-choose-1 OR a quest item is missing
// from it. The EXCLUSION half is 「不要放這些任務道具以外的東西」; the INCLUSION
// half is 「所有任務道具」. Both are checked against the craftRole marker AND the
// loot table the running match actually rolls, so the guard covers the whitelist
// bundle and content/loot-tables/quest-rewards.json together.
func TestStarterDraftIsQuestSet(t *testing.T) {
	testkit.Cover(t, "whitelist-draft-quest-only")
	docs := allItemDocs(t)

	wantQuest := map[string]struct{}{}
	for id, d := range docs {
		if d.CraftRole == "quest" {
			wantQuest[id] = struct{}{}
		}
	}
	require.GreaterOrEqual(t, len(wantQuest), 6, "the content tree must carry the quest set")

	check := func(surface string, ids []string) {
		got := map[string]struct{}{}
		for _, id := range ids {
			got[id] = struct{}{}
			assert.Equalf(t, "quest", docs[id].CraftRole,
				"%s offers %q (%s), craftRole %q — 「不要放這些任務道具以外的東西」: only quest items "+
					"may be drafted.", surface, id, docs[id].Name, docs[id].CraftRole)
		}
		for id, d := range docs {
			if d.CraftRole != "quest" {
				continue
			}
			_, ok := got[id]
			assert.Truef(t, ok,
				"%s is MISSING quest item %q (%s) — 「隨機三選一才能選到所有任務道具」 requires every "+
					"quest item to be draftable.", surface, id, d.Name)
		}
	}

	check("the draft whitelist surface", curation.StarterDraftItems())

	table := readJSON[lootTable](t, filepath.Join(contentRoot(), "loot-tables", "quest-rewards.json"))
	tableIDs := make([]string, 0, len(table.Entries))
	for _, e := range table.Entries {
		tableIDs = append(tableIDs, e.ItemID)
	}
	check("content/loot-tables/quest-rewards.json", tableIDs)
}

// firstOpenRoster is the user's 50 hand-picked champions — the FIRST OPEN
// ROSTER (對戰可選名單), one canonical id per requested name after dropping the
// test/placeholder and duplicate-reskin candidates (see starter.go and 附錄A of
// docs/hero-popularity-ranking.md). Pinned here id-for-id so a re-import or a
// careless edit to starter.go cannot silently add, drop or swap a champion.
//
// 48 at task #138; task #212 added godie-efur (揍敵客桀諾 #13) and godie-hblm
// (賈修貝爾 #05). Adding a champion here is deliberate and reviewable — that is
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
var firstOpenRoster = []string{
	"godie-e001", "godie-e002", "godie-e008", "godie-e00k", "godie-e00r",
	"godie-e00w", "godie-edem", "godie-efur", "godie-emfr", "godie-emns",
	"godie-etyr", "godie-ewar", "godie-h00l", "godie-h01n", "godie-h01u",
	"godie-h02k", "godie-h02v", "godie-hapm", "godie-hart", "godie-hblm",
	"godie-hgam", "godie-hjai", "godie-hpal", "godie-hpb1", "godie-huth",
	"godie-hvsh", "godie-hvwd", "godie-n003", "godie-n00b", "godie-nbbc",
	"godie-nplh", "godie-nsjs", "godie-o00k", "godie-o00l", "godie-o02p",
	"godie-ofar", "godie-ogld", "godie-ogrh", "godie-orkn", "godie-osam",
	"godie-u00h", "godie-u00j", "godie-u00k", "godie-u00n", "godie-u00v",
	"godie-ubal", "godie-udea", "godie-udre", "godie-umal", "godie-uvng",
}

// whitelist-first-open-roster: the enabled champion set the starter bundle
// seeds is EXACTLY the 50 canonical first-open-roster ids — no more, no fewer,
// none swapped. This is the guard the task asks for; it needs no content tree,
// so it runs in any environment.
func TestFirstOpenRoster(t *testing.T) {
	testkit.Cover(t, "whitelist-first-open-roster")

	require.Len(t, firstOpenRoster, 50, "the first open roster is 50 champions")
	seen := map[string]struct{}{}
	for _, id := range firstOpenRoster {
		_, dup := seen[id]
		require.Falsef(t, dup, "the pinned roster repeats %q", id)
		seen[id] = struct{}{}
	}

	want := append([]string(nil), firstOpenRoster...)
	sort.Strings(want)
	assert.Equal(t, want, curation.StarterSet().Champions,
		"the starter bundle's enabled champion set must be EXACTLY the 50 canonical first-open-roster ids")
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
