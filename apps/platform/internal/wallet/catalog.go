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
//
// FLAT PRICE, NOT A PER-CHAMPION MAP (owner 2026-07-30:「所有英雄藍水晶都是統一
// 價，新上架預設也是一樣價格」). This struct used to carry
// `ChampionPrices map[string]int` — 53 lines that said "300" 41 times and "0"
// twelve times. The map was not just noise, it was a TRAP: an absent entry
// reads as FREE on both sides (client lockStateOf: `price === undefined` →
// "free"; server OwnsChampion: `!priced` → true), so onboarding a champion and
// forgetting the store line silently gave that champion away. It happened to
// godie-e00s and godie-ucrl the night they shipped.
//
// The flat shape has no line to forget: an unlisted champion costs
// ChampionUnlockCost. FreeChampionIds is the only per-champion data left, and
// it is a SHORT list of deliberate exceptions rather than a mirror of the
// roster — a typo there costs a starter hero, not a whole price.
type storeDoc struct {
	ID     string `json:"id"`
	Schema string `json:"schema"`
	// ChampionUnlockCost is the 藍水晶 price of EVERY champion that is not on
	// FreeChampionIds. This is the SHIPPED value; the operator's live edit is an
	// overlay entry that Service.effective lays over it per request (economy.go).
	// The Go and client constants named CrystalUnlockCost / CRYSTAL_UNLOCK_COST
	// are fallbacks used only when neither can be read.
	ChampionUnlockCost int `json:"championUnlockCost"`
	// FreeChampionIds are the champions that cost nothing — the starter roster
	// Catalog.FreeChampions() seeds into every new account.
	FreeChampionIds []string `json:"freeChampionIds"`
	MCoinRewards    struct {
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

// championIndex is the shape of content/champions/_index.json we care about —
// the SHIPPED ROSTER, i.e. which champions exist in this content tree at all.
//
// WHY THE CATALOG NOW READS IT. Under the old per-champion price map the store
// doc doubled as the champion list; deleting the map deleted that list too, and
// something has to answer "is this a champion?" for the 404 on
// UnlockChampion / ToggleFavourite and for the store rows. The content tree's
// own collection index is that answer, and it is the one source that ALREADY
// grows when a champion is added — which is the whole point of the flat price:
// ship the champion doc and it is priced, with no second edit anywhere.
type championIndex struct {
	Entries []struct {
		ID string `json:"id"`
	} `json:"entries"`
}

// Catalog is the store catalog loaded from CONTENT_DIR at boot. It is the BASE
// layer, not the final word on price: the operator's 商店經濟 override is laid
// over it per request by Service.effective (see economy.go), and WithEconomy is
// what performs that derivation. Everything else here — the roster, the skins,
// the M COIN reward table — is boot-time truth with no override path.
type Catalog struct {
	// ChampionPrices maps championId -> 藍水晶 unlock price (0 = free starter).
	//
	// DERIVED, NOT AUTHORED (2026-07-30). Every entry is computed by PriceOf
	// from UnlockCost + the free list; it is materialised as a map only so the
	// readers that already existed (FreeChampions, UnlockableChampions,
	// CatalogFor, liveFavourites) keep working unchanged. Do NOT hand-edit it
	// back into a source of truth — the whole point of the flat model is that
	// there is exactly one number and one exception list.
	ChampionPrices map[string]int
	// UnlockCost is the flat 藍水晶 price of one champion unlock, straight from
	// content/config/store.json. This — not the CrystalUnlockCost constant — is
	// what the server charges and what the client is told to display, UNLESS the
	// operator has saved a 商店經濟 override, in which case Service.effective
	// hands out a catalog carrying that price instead (economy.go).
	UnlockCost int
	// Rewards maps final team placement (1..4) -> M COIN granted.
	Rewards map[int]int
	// Skins maps skinId -> definition.
	Skins map[string]SkinDef

	freeIDs       map[string]struct{}
	championOrder []string
	skinOrder     []string
}

// PriceOf is THE pricing rule, in one place: a champion on the free list costs
// nothing, every other champion costs the flat unlock cost.
//
// It is deliberately TOTAL — it answers for an id the catalog has never heard
// of too, and the answer is the flat cost, never 0. That direction is the whole
// bug fix: the previous shape defaulted an unknown champion to FREE, so the one
// mistake a human actually makes (shipping a hero, forgetting the store line)
// was also the most expensive one. Membership in the roster is a SEPARATE
// question, answered by ChampionPrice's second return value.
func PriceOf(unlockCost int, freeIDs map[string]struct{}, id string) int {
	if _, free := freeIDs[id]; free {
		return 0
	}
	return unlockCost
}

// PriceOf reports what this catalog charges for the champion. See the package
// function of the same name for why an unknown id is priced, not free.
func (c Catalog) PriceOf(id string) int { return PriceOf(c.UnlockCost, c.freeIDs, id) }

// WithEconomy returns a copy of c re-priced under a different flat unlock cost
// and free list — the derivation Service.effective applies when the operator has
// saved a 商店經濟 override (economy.go).
//
// Only the two authored fields move. The ROSTER does not: which champions exist
// is content/champions/_index.json's answer and an operator cannot invent one
// from the price page, so ChampionPrices keeps exactly the same key set (and
// ChampionPrice's second return, the 404 gate, keeps meaning the same thing).
// Skins, skin order and the M COIN reward table are shared with c unchanged.
//
// Every price is recomputed through PriceOf, never patched: patching would have
// to decide what to do with an id that used to be free, and "leave it at 0" is
// the giveaway bug the flat model was built to kill.
func (c Catalog) WithEconomy(unlockCost int, freeIDs []string) Catalog {
	out := c
	out.UnlockCost = unlockCost
	out.freeIDs = make(map[string]struct{}, len(freeIDs))
	for _, id := range freeIDs {
		out.freeIDs[id] = struct{}{}
	}
	out.ChampionPrices = make(map[string]int, len(c.championOrder))
	for _, id := range c.championOrder {
		out.ChampionPrices[id] = PriceOf(unlockCost, out.freeIDs, id)
	}
	return out
}

// IsFreeChampion reports whether the champion is on the store doc's free list.
func (c Catalog) IsFreeChampion(id string) bool {
	_, free := c.freeIDs[id]
	return free
}

// FreeChampionIDs returns the sorted free list AS AUTHORED — including any id
// that does not exist in the content tree. FreeChampions() returns only the
// ones that are really on the roster, so comparing the two surfaces a typo.
func (c Catalog) FreeChampionIDs() []string {
	out := make([]string, 0, len(c.freeIDs))
	for id := range c.freeIDs {
		out = append(out, id)
	}
	sort.Strings(out)
	return out
}

// EmptyCatalog is a valid catalog with no content (platform still boots when
// CONTENT_DIR is absent; nothing is purchasable and matches grant 0 M COIN).
//
// UnlockCost falls back to the CrystalUnlockCost constant rather than 0: a
// content-less boot must not make every champion free the moment someone wires
// a roster in from elsewhere.
func EmptyCatalog() Catalog {
	return Catalog{
		ChampionPrices: map[string]int{},
		UnlockCost:     CrystalUnlockCost,
		Rewards:        map[int]int{},
		Skins:          map[string]SkinDef{},
		freeIDs:        map[string]struct{}{},
	}
}

// LoadCatalog reads config/store.json plus the skins collection from the
// read-only content tree. A missing content dir / store doc yields an empty
// catalog (with a nil error) so the platform can boot without content mounted;
// malformed content is a hard error.
//
// IT RUNS EXACTLY ONCE, AT BOOT (internal/server's composition root), and that
// is a deliberate limit rather than a gap: content/ is a read-only bind mount on
// the family host (docker/compose.family.yaml), so nothing an operator does can
// change what this reads without a deploy. The console's live edits ride the
// content overlay instead and are applied per request — see economy.go.
func LoadCatalog(contentDir string) (Catalog, error) {
	cat := EmptyCatalog()

	storePath := filepath.Join(contentDir, "config", "store.json")
	// #nosec G304 -- `contentDir` is operator configuration (CONTENT_DIR, set in
	// docker/compose*.yaml), never request data, and the leaf is the literal
	// "store.json". A caller who can set CONTENT_DIR already chooses which
	// content tree the whole platform serves; being able to name a file inside
	// it grants nothing further. No HTTP path reaches this — it runs once at
	// boot, from server.New, and nowhere else. (There is NO "admin
	// content-reload"; an earlier version of this comment claimed one, and that
	// invented reload was the story that let 商店經濟 ship write-only. `grep -rn
	// -i reload internal/server internal/admin` finds nothing.)
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
	if doc.ChampionUnlockCost < 0 {
		return cat, fmt.Errorf("wallet: %s: negative championUnlockCost %d", storePath, doc.ChampionUnlockCost)
	}
	cat.UnlockCost = doc.ChampionUnlockCost
	for _, id := range doc.FreeChampionIds {
		cat.freeIDs[id] = struct{}{}
	}

	roster, err := loadChampionRoster(contentDir)
	if err != nil {
		return cat, err
	}
	for _, id := range roster {
		cat.ChampionPrices[id] = cat.PriceOf(id)
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

// loadChampionRoster returns the champion ids this content tree ships, from
// champions/_index.json (falling back to a scan of champions/*.json when the
// index is absent, the same two-step loadSkins uses).
//
// An ABSENT champions collection is not an error: the platform is allowed to
// boot against a partial tree, and the result is simply a store with no
// champion rows — the same degraded state a missing store.json produces. A
// PRESENT but unparseable index IS an error, because silently reading it as
// "no champions" would make every champion unknown (404 on unlock/favourite)
// while everything else looked healthy.
func loadChampionRoster(contentDir string) ([]string, error) {
	dir := filepath.Join(contentDir, "champions")
	// #nosec G304 -- same rule as the store.json read above: `dir` derives from
	// the operator's CONTENT_DIR and the leaf is the literal "_index.json".
	raw, err := os.ReadFile(filepath.Join(dir, "_index.json"))
	if err == nil {
		var idx championIndex
		if err := json.Unmarshal(raw, &idx); err != nil {
			return nil, fmt.Errorf("wallet: parse champions/_index.json: %w", err)
		}
		out := make([]string, 0, len(idx.Entries))
		for _, e := range idx.Entries {
			if e.ID != "" {
				out = append(out, e.ID)
			}
		}
		return out, nil
	}
	if !errors.Is(err, fs.ErrNotExist) {
		return nil, fmt.Errorf("wallet: read champions/_index.json: %w", err)
	}
	matches, globErr := filepath.Glob(filepath.Join(dir, "*.json"))
	if globErr != nil {
		return nil, globErr
	}
	out := make([]string, 0, len(matches))
	for _, m := range matches {
		base := filepath.Base(m)
		if strings.HasPrefix(base, "_") {
			continue
		}
		out = append(out, strings.TrimSuffix(base, ".json"))
	}
	return out, nil
}

// loadSkins reads skins/_index.json (falling back to a directory scan) and
// every skin doc it lists.
func loadSkins(contentDir string, cat *Catalog) error {
	dir := filepath.Join(contentDir, "skins")
	var files []string
	// #nosec G304 -- same rule as the store.json read above: `dir` derives from
	// the operator's CONTENT_DIR and the leaf is the literal "_index.json".
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
		// #nosec G304 -- `files` comes from the collection's own _index.json inside
		// CONTENT_DIR (or a ReadDir of it), so every entry is a path the operator
		// already published. The indexer enforces doc.id == filename stem, and no
		// request can add an entry.
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

// ChampionPrice returns the unlock price and whether the champion EXISTS in
// this content tree at all.
//
// The two returns answer different questions and always did: the int is
// "what does it cost" (now always PriceOf — flat cost unless free-listed), the
// bool is "is this a champion I have heard of", which gates the 404 on
// UnlockChampion / ToggleFavourite. What changed in 2026-07-30 is the SOURCE of
// the bool: it used to be "does store.json name it", which made a forgotten
// store line look like "not a champion" AND (through OwnsChampion's `!priced`
// branch) like "free to play". It is now the champions collection itself.
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

// ChampionIDs returns every championId this content tree ships, sorted.
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
// nor equal to cost. server.go warns on a non-empty result at boot.
//
// WHAT IT MEANS UNDER THE FLAT PRICE (2026-07-30). Every priced champion now
// costs exactly Catalog.UnlockCost, so this is all-or-nothing: it is empty when
// `cost == UnlockCost` and lists every unlockable champion otherwise. Callers
// pass the CLIENT's compiled-in fallback (CrystalUnlockCost), so a non-empty
// result no longer means "the content tree is internally inconsistent" — it
// means "an OFFLINE client, one that cannot read crystalUnlockCost off
// GET /wallet, would print the wrong number on the 解鎖 button". That is still
// worth a boot warning; it is just a much narrower claim than it used to be.
// The 「keep championPrices at the client constant」 hint server.go prints
// alongside it names a field that no longer exists — see the openQuestions of
// the task that removed it.
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
