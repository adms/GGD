package wallet

// economy.go — THE 商店經濟 OVERRIDE, READ AT REQUEST TIME (task #241).
//
// ── WHAT WAS BROKEN ──────────────────────────────────────────────────────────
// 後台 → 商店經濟 💎 shipped as a WRITE-ONLY page. It saved through
// `PUT /api/v1/content-overlay/docs/config/store` into
// data/content-overlay/overlay.json, and the platform charged
// `Catalog.UnlockCost`, which comes from wallet.LoadCatalog(CONTENT_DIR) —
// a different file, read exactly ONCE, at boot (server.go's composition root),
// into a `Catalog` the wallet service holds BY VALUE with no setter. Two
// pipelines that never met:
//
//	write:  StoreEconomyPage → putOverlayDoc → data/content-overlay/overlay.json
//	read:   wallet.LoadCatalog(ContentDir) → content/config/store.json
//
// So an operator saved 111, the page cheerfully answered「✓ 已寫入」, the page
// even re-rendered 111 on reload (it reads the overlay first), and every player
// went on being charged 900. The console lied self-consistently. Worse, the
// family host bind-mounts ../content READ-ONLY (docker/compose.family.yaml), so
// not even a restart could have picked the edit up — nothing writes content/.
//
// ── THE FIX, AND WHY IT IS NOT A COPY OF internal/combatenv ──────────────────
// combatenv is the shape that works: shipped values are the base, the operator
// override lives in the durable layer, and the two are merged ON EVERY REQUEST.
// This file gives config/store the same treatment — the only difference is WHICH
// durable layer, and that choice is forced:
//
//   - combatenv owns its own document (data/config/combat-env.json) plus its own
//     admin routes, both mounted from server.go.
//   - config/store already HAS a durable store and a mounted, admin-gated,
//     write-validated route: the content overlay (#189/#283), which is where the
//     console has been writing all along. Giving it a SECOND durable home would
//     mean two files claiming the same truth and an operator who has to guess
//     which page won.
//
// So the merge moved to the reader instead: shipped content/config/store.json is
// the base (LoadCatalog, at boot — it cannot change without a deploy anyway), and
// the overlay entry for `config/store` is layered on top HERE, on every pricing
// decision. No new route, no server.go change, and — the load-bearing part — the
// path an operator actually uses is the path under test.
//
// ⚠️ THE COUPLING THIS INTRODUCES, AND HOW IT IS PINNED. This file reads
// contentoverlay's durable document through the SAME *jsonstore.Store the
// overlay service writes it with (server.go builds one store and hands it to
// both). It cannot import internal/contentoverlay to borrow the constants:
// contentoverlay imports internal/admin for its audit line and admin imports
// wallet, so the edge would be an import cycle — the same cycle documented on
// GrantMCoin in meta.go. The three strings below are therefore COPIED, and
// economy_test.go pins them by writing through the real
// contentoverlay.Service and reading back through this code, so a rename
// there goes red here instead of silently reverting every price to shipped.

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"

	"github.com/ggd/platform/internal/data/jsonstore"
)

// Storage identifiers of the durable content overlay, mirroring
// internal/contentoverlay's Collection / DocID / key(collection, id).
//
// EXPORTED SO THEY CAN BE PINNED. They are copies (see the import-cycle note in
// the file header), and a copy nobody checks is how the whole page went
// write-only in the first place. economy_test.go compares the first two against
// contentoverlay's own constants and proves the third by reading back a doc the
// console's real HTTP route just wrote.
const (
	// OverlayCollection is contentoverlay.Collection.
	OverlayCollection = "content-overlay"
	// OverlayDocID is contentoverlay.DocID.
	OverlayDocID = "overlay"
	// OverlayStoreKey is contentoverlay's map key for content doc config/store —
	// exactly what the console's putOverlayDoc(STORE_COLLECTION, STORE_DOC_ID)
	// writes.
	OverlayStoreKey = "config/store"
)

// MaxUnlockCost is the largest flat 藍水晶 price an override may set, mirroring
// MAX_UNLOCK_COST in apps/admin/src/storeEconomy.ts (which mirrors
// zConfigStoreDoc in packages/shared). The console cannot produce a bigger
// number, so a doc that carries one did not come from the console and is not
// trusted — see parseStoreEconomy for why it is REJECTED rather than clamped.
const MaxUnlockCost = 1_000_000

// Economy is the operator-editable half of content/config/store.json: the flat
// unlock price and the free list. It is deliberately NOT the whole doc —
// `mcoinRewards` is read by internal/gamelink from its own boot-time copy of
// the catalog, so overriding it here would be a fourth thing that looks live
// and is not. See the openQuestions of task #241.
type Economy struct {
	// UnlockCost is the flat 藍水晶 price of every champion not on FreeIDs.
	UnlockCost int
	// FreeIDs is the free-champion list AS AUTHORED (a typo stays visible, the
	// same contract Catalog.FreeChampionIDs keeps).
	FreeIDs []string
	// Crystal is the per-match 藍水晶 payout: the four placement bases plus the
	// 多人比賽倍率 knobs (owner 2026-08-17). ALWAYS populated — an override doc
	// with no `crystalRewards` block yields DefaultCrystalRules, so a caller can
	// use this field without a second nil/zero check.
	//
	// ⚠️ IT IS LIVE, unlike `mcoinRewards` two paragraphs up. That is not an
	// inconsistency, it is which service reads it: M幣 is credited from
	// gamelink's own boot-time Catalog copy, while 藍水晶 is credited through the
	// wallet Service the settler already holds (Service.CrystalRulesNow), which
	// re-reads this file on every settlement. The console page has to say both
	// things, because it saves both fields in one document.
	Crystal CrystalRules
}

// overlayFile is the slice of contentoverlay.Overlay this package needs. Docs
// is left as raw JSON so an overlay carrying hundreds of champion docs costs
// one shallow scan, not hundreds of struct decodes.
type overlayFile struct {
	Docs    map[string]json.RawMessage `json:"docs"`
	Deleted map[string]bool            `json:"deleted"`
}

// parseStoreEconomy reads an overlay `config/store` doc into an Economy.
//
// It is ALL-OR-NOTHING and it fails towards the shipped values, because every
// partial reading of this document is a way to give a champion away:
//
//   - Wrong `schema` tag → reject. Some other config doc was saved onto this
//     key; reading its fields as a price is worse than ignoring it.
//   - `championUnlockCost` ABSENT → reject, and this is the migration case.
//     data/ on a host that ran an older build may hold an override in the OLD
//     shape, whose truth was a per-champion `championPrices` map with no flat
//     price at all. That map cannot be expressed in the flat model, and applying
//     the half that does survive (`freeChampionIds`) while silently defaulting
//     the price would charge the shipped 300 for champions the operator had
//     priced differently. So an old-shape doc is ignored WHOLE, loudly, and the
//     platform serves shipped prices until the operator re-saves the page once.
//   - Out of range → reject. Negative would make UnlockChampion's `price == 0`
//     branch miss and the "spend" ADD crystals; above MaxUnlockCost is a number
//     the console cannot produce. Neither is clamped: a clamp invents a price
//     nobody chose and hides the bad write, while falling back to shipped at
//     least lands on a number the owner once approved. Both paths WARN.
//
// The second return is false for "no usable override" in every one of those
// cases; the caller then serves the shipped catalog unchanged.
func parseStoreEconomy(raw []byte) (Economy, bool) {
	var d struct {
		Schema             string   `json:"schema"`
		ChampionUnlockCost *int     `json:"championUnlockCost"`
		FreeChampionIDs    []string `json:"freeChampionIds"`
		CrystalRewards     *struct {
			Base *struct {
				Place1 *int `json:"place1"`
				Place2 *int `json:"place2"`
				Place3 *int `json:"place3"`
				Place4 *int `json:"place4"`
			} `json:"base"`
			MinHumans     *int `json:"minHumans"`
			Offset        *int `json:"offset"`
			MaxMultiplier *int `json:"maxMultiplier"`
		} `json:"crystalRewards"`
	}
	if err := json.Unmarshal(raw, &d); err != nil {
		slog.Warn("wallet: 商店經濟 override is not readable JSON — serving the shipped store prices",
			"key", OverlayStoreKey, "err", err)
		return Economy{}, false
	}
	if d.Schema != SchemaStore {
		slog.Warn("wallet: 商店經濟 override carries the wrong schema tag — serving the shipped store prices",
			"key", OverlayStoreKey, "schema", d.Schema, "want", SchemaStore)
		return Economy{}, false
	}
	if d.ChampionUnlockCost == nil {
		slog.Warn("wallet: 商店經濟 override has no championUnlockCost — this is the pre-2026-07-30 "+
			"championPrices shape and cannot be applied to the flat model; serving the shipped store "+
			"prices until the console re-saves the page once",
			"key", OverlayStoreKey)
		return Economy{}, false
	}
	if *d.ChampionUnlockCost < 0 || *d.ChampionUnlockCost > MaxUnlockCost {
		slog.Warn("wallet: 商店經濟 override price is out of range — serving the shipped store prices",
			"key", OverlayStoreKey, "championUnlockCost", *d.ChampionUnlockCost, "max", MaxUnlockCost)
		return Economy{}, false
	}
	free := make([]string, 0, len(d.FreeChampionIDs))
	for _, id := range d.FreeChampionIDs {
		if id != "" {
			free = append(free, id)
		}
	}
	// 水晶那一組是 2026-08-17 才加的,所以「整塊不在」是**每一份既有覆蓋層**的常態,
	// ⛔ 不能跟上面那些 reject 一樣讓整份 override 失效 —— 那會讓線上所有存過價格的
	// 站台一夜之間退回出貨價。缺塊 = 出貨值,而不是 0(0 倍率 = 打完一場沒東西拿)。
	crystal := DefaultCrystalRules()
	if c := d.CrystalRewards; c != nil {
		cand := crystal
		if b := c.Base; b != nil {
			putInt(&cand.Place1, b.Place1)
			putInt(&cand.Place2, b.Place2)
			putInt(&cand.Place3, b.Place3)
			putInt(&cand.Place4, b.Place4)
		}
		putInt(&cand.MinHumans, c.MinHumans)
		putInt(&cand.Offset, c.Offset)
		putInt(&cand.MaxMultiplier, c.MaxMultiplier)
		if err := validateCrystalRules(cand); err != nil {
			// 同一條哲學:⛔ 不夾,退回出貨值並吼一聲。夾出來的倍率是沒有人選過的
			// 數字,而且它會長得跟正常的一模一樣。
			slog.Warn("wallet: 商店經濟 的水晶獎勵超出範圍 —— 這一塊退回出貨值",
				"key", OverlayStoreKey, "err", err)
		} else {
			crystal = cand
		}
	}
	return Economy{UnlockCost: *d.ChampionUnlockCost, FreeIDs: free, Crystal: crystal}, true
}

// putInt copies an OPTIONAL override field over a shipped default. A field the
// console did not write keeps the shipped value; it never lands as 0.
func putInt(dst *int, src *int) {
	if src != nil {
		*dst = *src
	}
}

// validateCrystalRules checks BOTH ENDS of every knob (GH#277: a min-only check
// is how 13 typed as 130 gets past a form and pays out 56 champions in one
// match). The bounds are the same ones zConfigStoreDoc and the console enforce.
func validateCrystalRules(r CrystalRules) error {
	for i, v := range []int{r.Place1, r.Place2, r.Place3, r.Place4} {
		if v < CrystalBaseMin || v > CrystalBaseMax {
			return fmt.Errorf("crystalRewards.base.place%d = %d, want %d..%d",
				i+1, v, CrystalBaseMin, CrystalBaseMax)
		}
	}
	if r.MinHumans < CrystalMinHumansMin || r.MinHumans > CrystalMinHumansMax {
		return fmt.Errorf("crystalRewards.minHumans = %d, want %d..%d",
			r.MinHumans, CrystalMinHumansMin, CrystalMinHumansMax)
	}
	if r.Offset < CrystalOffsetMin || r.Offset > CrystalOffsetMax {
		return fmt.Errorf("crystalRewards.offset = %d, want %d..%d",
			r.Offset, CrystalOffsetMin, CrystalOffsetMax)
	}
	if r.MaxMultiplier < CrystalMaxMultiplierMin || r.MaxMultiplier > CrystalMaxMultiplierMax {
		return fmt.Errorf("crystalRewards.maxMultiplier = %d, want %d..%d",
			r.MaxMultiplier, CrystalMaxMultiplierMin, CrystalMaxMultiplierMax)
	}
	return nil
}

// EconomyOverride returns the operator's live 商店經濟 override, or false when
// there is none (fresh install, tombstoned entry, or a doc parseStoreEconomy
// refused).
//
// It reads the durable file EVERY TIME, on purpose. That is what makes an edit
// land without a restart and without the player reloading anything, and it is
// the same thing contentoverlay.Service.Get does for the public bundle — the
// overlay is a handful of operator-edited docs, not a content tree.
func (s *Service) EconomyOverride() (Economy, bool) {
	if s.store == nil {
		return Economy{}, false
	}
	var f overlayFile
	if err := s.store.Get(OverlayCollection, OverlayDocID, &f); err != nil {
		if !errors.Is(err, jsonstore.ErrNotFound) {
			s.warnOnce("wallet: could not read the content overlay — serving the shipped store prices", err)
		}
		return Economy{}, false
	}
	if f.Deleted[OverlayStoreKey] {
		// Tombstoned: the operator explicitly reverted to shipped.
		return Economy{}, false
	}
	raw, ok := f.Docs[OverlayStoreKey]
	if !ok {
		return Economy{}, false
	}
	return parseStoreEconomy(raw)
}

// warnOnce logs a read failure once per process. A broken/permission-denied
// overlay file would otherwise emit one line per wallet request.
func (s *Service) warnOnce(msg string, err error) {
	s.overlayWarn.Do(func() { slog.Warn(msg, "err", err) })
}

// effective is the catalog EVERY pricing decision must go through: the shipped
// catalog re-priced under the operator's live override.
//
// Reaching for s.cat in a pricing decision is the bug this file exists to fix —
// s.cat is the value LoadCatalog produced at boot, and on the family host the
// content tree it came from is a read-only bind mount that no console can edit.
// s.cat stays correct for everything the override does not touch: the roster
// (which champions exist), the skins, and the M COIN reward table.
func (s *Service) effective() Catalog {
	ov, ok := s.EconomyOverride()
	if !ok {
		return s.cat
	}
	return s.cat.WithEconomy(ov.UnlockCost, ov.FreeIDs)
}
