package curation_test

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"math"
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

type modelDoc struct {
	ID      string            `json:"id"`
	GlbPath string            `json:"glbPath"`
	Scale   float64           `json:"scale"`
	ClipMap map[string]string `json:"clipMap"`
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

// ------------------------------------------------------------- glb reader --
//
// Mirrors packages/shared/src/content/modelTexture.test.ts's readGlb: GLB
// container → JSON chunk → PNG IHDR, no 3D engine needed. Kept deliberately
// small — it only has to answer "is the body painted with a real texture" and
// "how tall is the silhouette".

type glbImage struct{ width, height uint32 }

type glbInfo struct {
	images []glbImage
	// bodyMaterial is the material index of the highest-vertex-count primitive
	// (the champion's body), or -1 when the glb declares none.
	bodyMaterial int
	// materialImage[i] is the baseColorTexture image of material i (nil = none).
	materialImage []*glbImage
	// height is the Y extent of the POSITION bbox across every primitive.
	height float64
	// animations is the number of animation groups in the container.
	animations int
	// animationNames are the glb's animation names (clipMap targets).
	animationNames []string
}

// placeholderMax is the exporter's "texture missing" fallback: an 8x8 solid
// grey PNG. Any image at or below it counts as unpainted.
const placeholderMax = 8

func readGlb(t *testing.T, path string) glbInfo {
	t.Helper()
	buf, err := os.ReadFile(path)
	require.NoErrorf(t, err, "read glb %s", path)
	require.Greaterf(t, len(buf), 20, "glb %s is truncated", path)

	jsonLen := int(binary.LittleEndian.Uint32(buf[12:16]))
	require.LessOrEqualf(t, 20+jsonLen, len(buf), "glb %s json chunk overruns the file", path)

	var doc struct {
		Images []struct {
			BufferView int `json:"bufferView"`
		} `json:"images"`
		Textures []struct {
			Source int `json:"source"`
		} `json:"textures"`
		Materials []struct {
			PBR *struct {
				BaseColorTexture *struct {
					Index int `json:"index"`
				} `json:"baseColorTexture"`
			} `json:"pbrMetallicRoughness"`
		} `json:"materials"`
		BufferViews []struct {
			ByteOffset int `json:"byteOffset"`
			ByteLength int `json:"byteLength"`
		} `json:"bufferViews"`
		Accessors []struct {
			Min   []float64 `json:"min"`
			Max   []float64 `json:"max"`
			Count int       `json:"count"`
		} `json:"accessors"`
		Meshes []struct {
			Primitives []struct {
				Material   *int           `json:"material"`
				Attributes map[string]int `json:"attributes"`
			} `json:"primitives"`
		} `json:"meshes"`
		Animations []struct {
			Name string `json:"name"`
		} `json:"animations"`
	}
	require.NoErrorf(t, json.Unmarshal(buf[20:20+jsonLen], &doc), "parse glb json chunk of %s", path)

	binOffset := 20 + jsonLen + 8 // skip the BIN chunk header
	out := glbInfo{bodyMaterial: -1, animations: len(doc.Animations)}
	for _, an := range doc.Animations {
		out.animationNames = append(out.animationNames, an.Name)
	}

	for _, im := range doc.Images {
		if im.BufferView < 0 || im.BufferView >= len(doc.BufferViews) {
			out.images = append(out.images, glbImage{})
			continue
		}
		at := binOffset + doc.BufferViews[im.BufferView].ByteOffset
		// PNG: 8B signature + 4B length + "IHDR" then width/height (big-endian).
		if at+24 > len(buf) {
			out.images = append(out.images, glbImage{})
			continue
		}
		out.images = append(out.images, glbImage{
			width:  binary.BigEndian.Uint32(buf[at+16 : at+20]),
			height: binary.BigEndian.Uint32(buf[at+20 : at+24]),
		})
	}

	for _, m := range doc.Materials {
		if m.PBR == nil || m.PBR.BaseColorTexture == nil {
			out.materialImage = append(out.materialImage, nil)
			continue
		}
		ti := m.PBR.BaseColorTexture.Index
		if ti < 0 || ti >= len(doc.Textures) {
			out.materialImage = append(out.materialImage, nil)
			continue
		}
		src := doc.Textures[ti].Source
		if src < 0 || src >= len(out.images) {
			out.materialImage = append(out.materialImage, nil)
			continue
		}
		img := out.images[src]
		out.materialImage = append(out.materialImage, &img)
	}

	lo, hi := math.Inf(1), math.Inf(-1)
	bestCount := -1
	for _, mesh := range doc.Meshes {
		for _, prim := range mesh.Primitives {
			pos, ok := prim.Attributes["POSITION"]
			if !ok || pos < 0 || pos >= len(doc.Accessors) {
				continue
			}
			acc := doc.Accessors[pos]
			if len(acc.Min) > 1 && len(acc.Max) > 1 {
				lo = math.Min(lo, acc.Min[1])
				hi = math.Max(hi, acc.Max[1])
			}
			if acc.Count > bestCount {
				bestCount = acc.Count
				out.bodyMaterial = -1
				if prim.Material != nil {
					out.bodyMaterial = *prim.Material
				}
			}
		}
	}
	if hi > lo {
		out.height = hi - lo
	}
	return out
}

// ------------------------------------------------------------------ gates --

// The task #11 hero-number prefix ("22-01 鬼隱之擊" → 22 / 01, "22-002 …" → 22 /
// 002) is parsed by `heroNumberRe` in heroidentity_test.go — ONE regex per
// package, because that prefix is also what decides champion identity.

// Silhouette band (G4): glb bbox height x model scale, in world units.
const (
	minHeightU = 1.5
	maxHeightU = 2.1
)

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

// whitelist-starter-content: every id in the DEMO STARTER SET names a document
// that actually exists in the content tree AND still satisfies the selection
// gates documented in starter.go. This is the guard that keeps the one-click
// bundle from rotting when content is re-imported: a fresh install's starter
// set must always be playable, textured, in-band, build-complete and able to
// roll a weapon card.
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
	require.GreaterOrEqual(t, len(set.Champions), 12, "starter set must enable at least 12 champions")
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

	seenModel := map[string]string{}
	// G9 — no two picks are the SAME CHARACTER. Decided by the shared identity
	// rule (hero 編號 + name; see heroidentity_test.go and
	// packages/shared/src/content/championIdentity.ts), NEVER by "same mesh" or
	// "same portrait" — those heuristics erased 黑化Saber from the login roster.
	seenCharacter := []championDoc{}

	for _, champID := range set.Champions {
		champ := readJSON[championDoc](t, filepath.Join(root, "champions", champID+".json"))

		for _, other := range seenCharacter {
			assert.Falsef(t, sameCharacter(other, champ),
				"starter champions %q (%s) and %q (%s) are the SAME character (hero %s) — pick one",
				other.ID, other.Name, champ.ID, champ.Name, heroNumberOf(champ))
		}
		seenCharacter = append(seenCharacter, champ)

		// G1 — not a test/placeholder hero.
		for _, bad := range []string{"測試", "範例", "範本"} {
			assert.NotContainsf(t, champ.Name, bad, "starter champion %q looks like a test hero", champID)
		}

		// G2 — declared icon AND the PNG exists on disk.
		require.NotEmptyf(t, champ.Icon, "starter champion %q declares no icon", champID)
		_, err := os.Stat(filepath.Join(root, champ.Icon))
		require.NoErrorf(t, err, "starter champion %q icon %s is missing on disk", champID, champ.Icon)

		// G7/G8 — complete, hero-number-consistent kit, all five docs present,
		// EX declared. NOTE this is also the "no half-enabled champion" gate:
		// every one of the five ability ids must be in the bundle.
		require.Equalf(t, champID+".ex", champ.ExAbility,
			"starter champion %q must declare its EX ability", champID)
		heroNum := ""
		for _, slot := range []string{"q", "w", "e", "r", "ex"} {
			abilityID := champID + "." + slot
			_, enabled := abilitySet[abilityID]
			require.Truef(t, enabled, "starter champion %q is HALF-ENABLED: %s missing from the bundle",
				champID, abilityID)

			ab := readJSON[abilityDoc](t, filepath.Join(root, "abilities", abilityID+".json"))
			require.GreaterOrEqualf(t, len([]rune(ab.Description)), 20,
				"starter ability %q has no real description", abilityID)
			require.Equalf(t, strings.ToUpper(slot), strings.ToUpper(ab.Slot),
				"starter ability %q sits in the wrong slot", abilityID)

			m := heroNumberRe.FindStringSubmatch(ab.Name)
			require.NotNilf(t, m, "starter ability %q name %q lacks the task #11 xx-0N prefix",
				abilityID, ab.Name)
			if heroNum == "" {
				heroNum = m[1]
			}
			require.Equalf(t, heroNum, m[1],
				"starter champion %q mixes hero numbers: %q is %s-, expected %s-",
				champID, abilityID, m[1], heroNum)
			wantLen := 2
			if slot == "ex" {
				wantLen = 3
			}
			require.Lenf(t, m[2], wantLen,
				"starter ability %q prefix %q has the wrong width for slot %s", abilityID, ab.Name, slot)
		}

		// BUILD TOLERANCE (replaces task #47's I7 "build closure"). Full closure
		// is no longer achievable: godie-i003 聖光石 sits in seven starter builds
		// and is an S3 casualty (its whole payload is an unported 500 HP heal
		// active, so the shipped doc carries no modifiers at all), and
		// content/champions is owned by another task. The bot was made TOLERANT
		// instead — AIDriver skips a non-purchasable rung rather than stalling on
		// it forever (nextBuildPurchase in ai/Tier0Brain.ts). What still has to
		// hold is that every bot has a real ladder left to climb.
		buyable := 0
		for _, want := range champ.BuildPriority {
			if _, ok := itemSet[want]; ok {
				buyable++
			}
		}
		require.GreaterOrEqualf(t, buyable, 4,
			"starter champion %q has only %d purchasable buildPriority rungs (of %d) — its bot cannot climb a ladder",
			champID, buyable, len(champ.BuildPriority))

		// G5 — its own model, shared with no other pick.
		require.NotEmptyf(t, champ.ModelKey, "starter champion %q declares no model", champID)
		if other, dup := seenModel[champ.ModelKey]; dup {
			t.Errorf("starter champions %q and %q share model %q (twins are excluded on purpose)",
				other, champID, champ.ModelKey)
		}
		seenModel[champ.ModelKey] = champID

		model := readJSON[modelDoc](t, filepath.Join(root, "models", champ.ModelKey+".json"))
		glbPath := filepath.Join(root, model.GlbPath)
		if _, err := os.Stat(glbPath); err != nil {
			t.Errorf("starter champion %q model %q has no glb at %s", champID, champ.ModelKey, glbPath)
			continue
		}
		glb := readGlb(t, glbPath)

		// G3 — no 8x8 placeholder anywhere, and the body paints with a real image.
		for i, img := range glb.images {
			assert.Falsef(t, img.width <= placeholderMax && img.height <= placeholderMax,
				"starter champion %q model %q embeds an %dx%d placeholder texture (image %d)",
				champID, champ.ModelKey, img.width, img.height, i)
		}
		require.GreaterOrEqualf(t, glb.bodyMaterial, 0,
			"starter champion %q model %q has no body material", champID, champ.ModelKey)
		require.Lessf(t, glb.bodyMaterial, len(glb.materialImage),
			"starter champion %q model %q body material is out of range", champID, champ.ModelKey)
		body := glb.materialImage[glb.bodyMaterial]
		require.NotNilf(t, body, "starter champion %q model %q body is UNTEXTURED", champID, champ.ModelKey)
		assert.Greaterf(t, body.width, uint32(placeholderMax),
			"starter champion %q model %q body texture is a %dx%d placeholder",
			champID, champ.ModelKey, body.width, body.height)

		// G4 — silhouette band.
		scale := model.Scale
		if scale == 0 {
			scale = 1
		}
		h := glb.height * scale
		assert.Truef(t, h >= minHeightU && h <= maxHeightU,
			"starter champion %q silhouette is %.3fu, outside the %.1f–%.1fu band",
			champID, h, minHeightU, maxHeightU)

		// G6 — every clipMap entry resolves to a real animation in the glb.
		anims := make(map[string]struct{}, len(glb.animationNames))
		for _, n := range glb.animationNames {
			anims[n] = struct{}{}
		}
		for clip, target := range model.ClipMap {
			_, ok := anims[target]
			assert.Truef(t, ok, "starter champion %q clip %q → animation %q does not exist in %s",
				champID, clip, target, model.GlbPath)
		}
		assert.GreaterOrEqualf(t, glb.animations, 6,
			"starter champion %q model %q ships only %d animations", champID, champ.ModelKey, glb.animations)
	}

	// ---------------------------------------------------------------- items --
	// The two surfaces of the arena item model (task #70). They partition the
	// bundle: an item is bought with gold OR drafted for free, never both.
	shop := curation.StarterShopItems()
	draft := curation.StarterDraftItems()
	services := curation.StarterServiceItems()
	legendary := curation.StarterLegendaryItems()
	require.GreaterOrEqual(t, len(shop), 60, "the shop surface must be a real catalogue")
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

	// S1–S4 — every SHOP item is named, carries ONE OF THE TWO PRICES, is
	// effective and is sane.
	affordableAtStart, simpleCount, powerfulCount := 0, 0, 0
	for _, id := range shop {
		item := readJSON[itemDoc](t, filepath.Join(root, "items", id+".json"))
		assert.NotEqualf(t, id, item.Name, "S1: shop item %q has no display name", id)
		// S2, the 統一化 gate: exactly one of the two prices, nothing between,
		// nothing above. This is the assertion the whole redesign exists to make.
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
	// Turn 1 must be a real decision: the 600g purse buys TWO 300g items out of
	// a wide shelf, not one item out of three. Before task #82 there were five
	// sub-600g listings and only three distinct stat mixes among them.
	assert.GreaterOrEqualf(t, affordableAtStart, 20,
		"only %d shop items are buyable on the %dg starting purse — turn 1 is not a real choice",
		affordableAtStart, startingGold)
	assert.GreaterOrEqualf(t, simpleCount, 20, "only %d SIMPLE listings", simpleCount)
	assert.GreaterOrEqualf(t, powerfulCount, 10, "only %d POWERFUL listings", powerfulCount)

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

	// D1–D3 — every DRAFT item is a named, FREE, effective quest reward. (D4,
	// "no 四魂之玉 shards", is a policy call asserted separately below.)
	for _, id := range draft {
		item := readJSON[itemDoc](t, filepath.Join(root, "items", id+".json"))
		assert.NotEqualf(t, id, item.Name, "D1: draft item %q has no display name", id)
		assert.Zerof(t, item.Cost, "D2: draft item %q costs %dg — it belongs in the shop", id, item.Cost)
		assert.Truef(t, item.hasEffect(),
			"D3: draft item %q has no modifier and no passive — the card would grant NOTHING", id)
		assert.Emptyf(t, item.insaneModifiers(),
			"draft item %q carries impossible values %v", id, item.insaneModifiers())
		assert.NotContainsf(t, item.Name, "四魂之玉的碎片",
			"D4: %q (%s) is a 四魂之玉 shard — shards are dropped, only the assembled jewel is drafted",
			id, item.Name)
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
