// Package wallet implements the M COIN virtual currency and the champion/skin
// store: the read-only content catalog (CONTENT_DIR), per-account wallet state
// on the account JSON truth (Redis is only a rebuildable cache), buy/equip
// mutations and match-placement rewards.
package wallet

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// SchemaStore is the schema tag of content/config/store.json.
const SchemaStore = "config.store@1"

// SchemaSkin is the schema tag of content/skins/*.json docs.
const SchemaSkin = "skin@1"

// SkinDef is one purchasable skin from the content tree.
type SkinDef struct {
	ID         string `json:"id"`
	Schema     string `json:"schema"`
	ChampionID string `json:"championId"`
	Name       string `json:"name"`
	MCoinPrice int    `json:"mcoinPrice"`
	ModelKey   string `json:"modelKey"`
}

// storeDoc mirrors content/config/store.json (config.store@1).
type storeDoc struct {
	ID             string         `json:"id"`
	Schema         string         `json:"schema"`
	ChampionPrices map[string]int `json:"championPrices"`
	MCoinRewards   struct {
		Placement1 int `json:"placement1"`
		Placement2 int `json:"placement2"`
		Placement3 int `json:"placement3"`
		Placement4 int `json:"placement4"`
	} `json:"mcoinRewards"`
}

// skinIndex is the shape of content/skins/_index.json we care about.
type skinIndex struct {
	Entries []struct {
		ID   string `json:"id"`
		Path string `json:"path"`
	} `json:"entries"`
}

// Catalog is the immutable store catalog loaded from CONTENT_DIR at boot.
type Catalog struct {
	// ChampionPrices maps championId -> M COIN unlock price (0 = starter).
	ChampionPrices map[string]int
	// Rewards maps final team placement (1..4) -> M COIN granted.
	Rewards map[int]int
	// Skins maps skinId -> definition.
	Skins map[string]SkinDef

	championOrder []string
	skinOrder     []string
}

// EmptyCatalog is a valid catalog with no content (platform still boots when
// CONTENT_DIR is absent; nothing is purchasable and matches grant 0 M COIN).
func EmptyCatalog() Catalog {
	return Catalog{ChampionPrices: map[string]int{}, Rewards: map[int]int{}, Skins: map[string]SkinDef{}}
}

// LoadCatalog reads config/store.json plus the skins collection from the
// read-only content tree. A missing content dir / store doc yields an empty
// catalog (with a nil error) so the platform can boot without content mounted;
// malformed content is a hard error.
func LoadCatalog(contentDir string) (Catalog, error) {
	cat := EmptyCatalog()

	storePath := filepath.Join(contentDir, "config", "store.json")
	raw, err := os.ReadFile(storePath)
	if errors.Is(err, fs.ErrNotExist) {
		return cat, nil
	}
	if err != nil {
		return cat, fmt.Errorf("wallet: read %s: %w", storePath, err)
	}
	var doc storeDoc
	if err := json.Unmarshal(raw, &doc); err != nil {
		return cat, fmt.Errorf("wallet: parse %s: %w", storePath, err)
	}
	if doc.Schema != SchemaStore {
		return cat, fmt.Errorf("wallet: %s: schema %q, want %q", storePath, doc.Schema, SchemaStore)
	}
	for id, price := range doc.ChampionPrices {
		if price < 0 {
			return cat, fmt.Errorf("wallet: %s: negative price for champion %q", storePath, id)
		}
		cat.ChampionPrices[id] = price
		cat.championOrder = append(cat.championOrder, id)
	}
	sort.Strings(cat.championOrder)
	for place, v := range map[int]int{
		1: doc.MCoinRewards.Placement1, 2: doc.MCoinRewards.Placement2,
		3: doc.MCoinRewards.Placement3, 4: doc.MCoinRewards.Placement4,
	} {
		if v < 0 {
			return cat, fmt.Errorf("wallet: %s: negative reward for placement %d", storePath, place)
		}
		cat.Rewards[place] = v
	}

	if err := loadSkins(contentDir, &cat); err != nil {
		return cat, err
	}
	return cat, nil
}

// loadSkins reads skins/_index.json (falling back to a directory scan) and
// every skin doc it lists.
func loadSkins(contentDir string, cat *Catalog) error {
	dir := filepath.Join(contentDir, "skins")
	var files []string
	if raw, err := os.ReadFile(filepath.Join(dir, "_index.json")); err == nil {
		var idx skinIndex
		if err := json.Unmarshal(raw, &idx); err != nil {
			return fmt.Errorf("wallet: parse skins/_index.json: %w", err)
		}
		for _, e := range idx.Entries {
			files = append(files, filepath.Join(contentDir, filepath.FromSlash(e.Path)))
		}
	} else {
		matches, globErr := filepath.Glob(filepath.Join(dir, "*.json"))
		if globErr != nil {
			return globErr
		}
		for _, m := range matches {
			if filepath.Base(m) == "_index.json" {
				continue
			}
			files = append(files, m)
		}
	}

	for _, file := range files {
		raw, err := os.ReadFile(file)
		if err != nil {
			return fmt.Errorf("wallet: read skin doc %s: %w", file, err)
		}
		var sk SkinDef
		if err := json.Unmarshal(raw, &sk); err != nil {
			return fmt.Errorf("wallet: parse skin doc %s: %w", file, err)
		}
		if sk.Schema != SchemaSkin {
			return fmt.Errorf("wallet: %s: schema %q, want %q", file, sk.Schema, SchemaSkin)
		}
		if sk.ID == "" || sk.ChampionID == "" || sk.ModelKey == "" || sk.MCoinPrice < 0 {
			return fmt.Errorf("wallet: %s: invalid skin doc", file)
		}
		if strings.TrimSuffix(filepath.Base(file), ".json") != sk.ID {
			return fmt.Errorf("wallet: %s: filename stem must equal doc id %q", file, sk.ID)
		}
		cat.Skins[sk.ID] = sk
		cat.skinOrder = append(cat.skinOrder, sk.ID)
	}
	sort.Strings(cat.skinOrder)
	return nil
}

// RewardFor returns the M COIN reward for a final placement (0 if unknown).
func (c Catalog) RewardFor(place int) int { return c.Rewards[place] }

// ChampionPrice returns the unlock price and whether the champion is priced
// in the store doc at all.
func (c Catalog) ChampionPrice(id string) (int, bool) {
	p, ok := c.ChampionPrices[id]
	return p, ok
}

// FreeChampions returns the sorted championIds with price 0 (starter roster).
func (c Catalog) FreeChampions() []string {
	out := []string{}
	for _, id := range c.championOrder {
		if c.ChampionPrices[id] == 0 {
			out = append(out, id)
		}
	}
	return out
}

// ChampionIDs returns every priced championId in sorted order.
func (c Catalog) ChampionIDs() []string { return append([]string{}, c.championOrder...) }

// UnlockableChampions returns the sorted championIds with price > 0 — the
// champions a player can actually spend crystals on.
func (c Catalog) UnlockableChampions() []string {
	out := []string{}
	for _, id := range c.championOrder {
		if c.ChampionPrices[id] > 0 {
			out = append(out, id)
		}
	}
	return out
}

// PriceDrift returns the sorted championIds whose unlock price is neither free
// nor equal to cost. The champ-select unlock button label is a CLIENT-side
// mirror of the flat CrystalUnlockCost, so any priced champion that disagrees
// would show the player one number and charge another. server.go warns on a
// non-empty result at boot rather than letting that lie ship silently.
func (c Catalog) PriceDrift(cost int) []string {
	out := []string{}
	for _, id := range c.UnlockableChampions() {
		if c.ChampionPrices[id] != cost {
			out = append(out, id)
		}
	}
	return out
}

// SkinIDs returns every skinId in sorted order.
func (c Catalog) SkinIDs() []string { return append([]string{}, c.skinOrder...) }
