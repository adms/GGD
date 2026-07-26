package contentoverlay

// precedence.go — THE MERGE PRECEDENCE RULE, written down and made checkable.
//
// ═══ THE RULE ════════════════════════════════════════════════════════════════
//
//	merged = shipped(content/) ⊕ overlay(data/content-overlay/)
//
//	1. THE OVERLAY ALWAYS WINS. An overlaid doc replaces the shipped doc; a
//	   tombstoned id is dropped from the merged tree; an overlay-only id is
//	   appended. This is unconditional — including when the shipped bundle has
//	   MOVED UNDERNEATH the overlay entry since it was written.
//
//	2. AN OVERLAY ENTRY WHOSE BASE NO LONGER MATCHES IS *FLAGGED*, NOT DROPPED.
//	   Every entry records `baseHash` — the shipped doc's hash at the moment the
//	   operator edited it (contentoverlay.captureBase). On every status read the
//	   base is compared against what the shipped `_index.json` says NOW. A
//	   difference means a `git pull` (or a content rebuild) changed that doc
//	   underneath the edit. The entry KEEPS winning — never silently discard an
//	   operator's edit — but it is marked `stale`, counted in the status
//	   summary, warned about once at boot, and shown red on the admin page.
//
//	3. AN UNKNOWN BASE IS NOT A CLEAN BASE. An entry written before this field
//	   existed, or written on a host with no readable content tree, reports
//	   `unknown-base` and is flagged. docs/todo/content-sync.md csync-03 rules
//	   that a missing base "downgrades every two-sided difference to TRUE
//	   CONFLICT rather than picking a side"; the read-only equivalent here is
//	   "say you cannot tell", never "assume it is fine".
//
// ═══ WHY WIN-AND-FLAG, RATHER THAN LOSE-ON-STALE ═════════════════════════════
// The two failure modes are not symmetric. If a stale entry LOST, a `git pull`
// would silently revert an operator's live tuning — content the family is
// playing right now would change under them with no warning and no way to see
// what was lost. If a stale entry WINS AND IS FLAGGED, the worst case is that
// the repo's newer doc is not live yet and a red row on the admin page says so,
// with a one-click 還原 (RevertDoc) to take the repo's version. Nothing is ever
// lost without someone being asked.
//
// ═══ WHAT MOVES contentVersion ═══════════════════════════════════════════════
// cv_ is recomputed from the MERGED hashes on the consumer side
// (packages/shared/src/content/overlay.ts readManifest), so an overlay change
// does move cv_. That is NOT a divergence signal: it says the merged tree
// changed, not that the shipped doc moved under an overlay entry. Only the
// baseHash comparison here can say the latter.

import (
	"context"
	"encoding/json"
	"log/slog"
	"sort"
	"strings"
	"time"
)

// Entry states. Every overlaid key gets exactly one.
const (
	// StateClean — the shipped doc is byte-identical to the base this edit was
	// made against. The normal case; the overlay wins silently.
	StateClean = "clean"
	// StateStale — the SHIPPED doc changed since the edit (a git pull landed a
	// new version). The overlay still wins; the operator is told.
	StateStale = "stale"
	// StateOrphan — the shipped doc the edit was based on is GONE from the
	// content tree. The overlay is now the only source of this id.
	StateOrphan = "orphan"
	// StateAdded — the operator added a doc the shipped tree never had, and
	// still does not. Clean; nothing can be stale about it.
	StateAdded = "added"
	// StateShadow — the operator added a doc the shipped tree did NOT have, and
	// the shipped tree has since gained one with the same id. The overlay wins
	// and is now hiding a real shipped doc it was never compared against.
	StateShadow = "shadow"
	// StateUnknownBase — no usable base was recorded (legacy entry, or the
	// content tree was unreadable at edit time). Cannot be judged → flagged.
	StateUnknownBase = "unknown-base"
	// StateTombstone — a shipped doc deliberately removed from the merged tree,
	// and the shipped tree still has it (so the tombstone is doing work).
	StateTombstone = "tombstone"
	// StateTombstoneMoot — a tombstone over an id the shipped tree no longer
	// has. Harmless, but it is dead weight the operator can clear.
	StateTombstoneMoot = "tombstone-moot"
)

// StatusEntry is one overlaid key, judged against the shipped tree.
type StatusEntry struct {
	Key        string `json:"key"` // "collection/id"
	Collection string `json:"collection"`
	ID         string `json:"id"`
	State      string `json:"state"`
	// Flagged is the single boolean the console colours a row on: anything the
	// operator should look at.
	Flagged   bool `json:"flagged"`
	Tombstone bool `json:"tombstone"`
	// BaseHash is what the shipped tree said when this edit was made;
	// ShippedHash is what it says now. Empty means "no shipped doc".
	BaseHash    string `json:"baseHash"`
	ShippedHash string `json:"shippedHash"`
	// Bytes is the size of the overlaid doc (0 for a tombstone).
	Bytes int `json:"bytes"`
	// EditedAt / EditedBy — requirement 6's "when + by whom", per entry. This
	// travels only on the ADMIN-gated status route, never on the public
	// head/bundle, which blank UpdatedBy for exactly this reason.
	EditedAt time.Time `json:"editedAt"`
	EditedBy string    `json:"editedBy"`
}

// ShippedInfo describes whether the shipped tree could be consulted at all. If
// it could not, EVERY entry reports unknown-base and the console must say
// "cannot tell" rather than "all clean".
type ShippedInfo struct {
	Dir       string `json:"dir"`
	Available bool   `json:"available"`
	Detail    string `json:"detail,omitempty"`
}

// Status is the whole read-only picture: what is overlaid vs what is shipped.
type Status struct {
	SchemaVersion int            `json:"schemaVersion"`
	Generation    int            `json:"generation"`
	Fingerprint   string         `json:"fingerprint"`
	UpdatedAt     time.Time      `json:"updatedAt"`
	UpdatedBy     string         `json:"updatedBy"`
	Degraded      *Degradation   `json:"degraded,omitempty"`
	Shipped       ShippedInfo    `json:"shipped"`
	Entries       []StatusEntry  `json:"entries"`
	Counts        map[string]int `json:"counts"`
	FlaggedCount  int            `json:"flaggedCount"`
	// DataPath is where the durable overlay physically lives on this host — the
	// answer to "will my edit survive a rebuild?", shown rather than promised.
	DataPath string `json:"dataPath"`
}

// classify decides one key's state from its base and the shipped tree's current
// answer. Pure — the whole precedence rule in one testable function.
//
// shippedKnown=false means the shipped tree could not be consulted; that
// collapses to unknown-base regardless of what the base says, because a
// comparison with one side missing is not a comparison.
func classify(base BaseRef, tombstone, shippedPresent, shippedKnown bool, shippedHash string) (string, bool) {
	if tombstone {
		if !shippedKnown {
			return StateTombstone, false // cannot tell whether it is moot; not an alarm
		}
		if shippedPresent {
			return StateTombstone, false
		}
		return StateTombstoneMoot, false
	}
	if !base.Known || !shippedKnown {
		return StateUnknownBase, true
	}
	if base.Shipped {
		switch {
		case !shippedPresent:
			return StateOrphan, true
		case shippedHash == base.Hash:
			return StateClean, false
		default:
			return StateStale, true
		}
	}
	// the edit ADDED a doc the shipped tree did not have
	if shippedPresent {
		return StateShadow, true
	}
	return StateAdded, false
}

// Status computes the read-only overlaid-vs-shipped picture.
func (s *Service) Status(ctx context.Context) (Status, error) {
	s.mu.Lock()
	o, err := s.load()
	degraded := s.degraded
	s.mu.Unlock()
	if err != nil {
		return Status{}, err
	}

	available, detail := s.shipped.Available()
	st := Status{
		SchemaVersion: SchemaVersion,
		Generation:    o.Generation,
		Fingerprint:   o.fingerprint(),
		UpdatedAt:     o.UpdatedAt,
		UpdatedBy:     o.UpdatedBy,
		Degraded:      degraded,
		Shipped:       ShippedInfo{Dir: s.shipped.Dir(), Available: available, Detail: detail},
		Entries:       make([]StatusEntry, 0, len(o.Docs)+len(o.Deleted)),
		Counts:        map[string]int{},
		DataPath:      s.dataPath(),
	}

	keys := make([]string, 0, len(o.Docs)+len(o.Deleted))
	for k := range o.Docs {
		keys = append(keys, k)
	}
	for k, on := range o.Deleted {
		if on {
			keys = append(keys, k)
		}
	}
	sort.Strings(keys)

	for _, k := range keys {
		collection, id, ok := splitKey(k)
		if !ok {
			continue
		}
		doc, hasDoc := o.Docs[k]
		tombstone := !hasDoc && o.Deleted[k]

		shippedHash, shippedPresent, herr := s.shipped.Hash(collection, id)
		shippedKnown := herr == nil

		base := o.Bases[k]
		state, flagged := classify(base, tombstone, shippedPresent, shippedKnown, shippedHash)
		st.Counts[state]++
		if flagged {
			st.FlaggedCount++
		}
		st.Entries = append(st.Entries, StatusEntry{
			Key:         k,
			Collection:  collection,
			ID:          id,
			State:       state,
			Flagged:     flagged,
			Tombstone:   tombstone,
			BaseHash:    base.Hash,
			ShippedHash: shippedHash,
			Bytes:       len(doc),
			EditedAt:    base.At,
			EditedBy:    base.By,
		})
	}
	return st, nil
}

// dataPath is the absolute path of the durable overlay file, so the console can
// show the operator the exact thing the acceptance criterion is about.
func (s *Service) dataPath() string {
	p, err := s.store.Path(Collection, DocID)
	if err != nil {
		return ""
	}
	return p
}

// splitKey splits "collection/id". Ids may contain dots (godie-e001.ex) but
// never a slash, so the FIRST separator is the split point.
func splitKey(k string) (string, string, bool) {
	i := strings.Index(k, "/")
	if i <= 0 || i >= len(k)-1 {
		return "", "", false
	}
	return k[:i], k[i+1:], true
}

// ShippedDoc returns the bytes of the SHIPPED doc for a key, so the console can
// show the repo's current version next to the overlaid one. Read-only.
func (s *Service) ShippedDoc(collection, id string) (json.RawMessage, string, error) {
	if err := validateKey(collection, id); err != nil {
		return nil, "", err
	}
	hash, present, err := s.shipped.Hash(collection, id)
	if err != nil {
		return nil, "", err
	}
	if !present {
		return nil, "", nil
	}
	raw, err := s.shipped.Doc(collection, id)
	if err != nil {
		return nil, hash, err
	}
	return raw, hash, nil
}

// LogBootSummary writes ONE line about the durable overlay at process start,
// plus one warning per flagged entry.
//
// Requirement 2 asks that a stale entry not win "silently forever". The admin
// page is the interactive answer; this is the answer for the operator who is
// reading `docker compose logs` after a deploy and has not opened a browser.
// It never fails a boot: a broken overlay logs and the platform carries on.
func (s *Service) LogBootSummary(ctx context.Context) {
	st, err := s.Status(ctx)
	if err != nil {
		slog.Error("contentoverlay: could not read the durable overlay at boot "+
			"(serving the shipped content tree)", "err", err)
		return
	}
	if st.Degraded != nil {
		slog.Error("contentoverlay: boot with a CORRUPT durable overlay — shipped content only",
			"reason", st.Degraded.Reason, "quarantine", st.Degraded.Quarantine, "path", st.DataPath)
		return
	}
	if len(st.Entries) == 0 {
		slog.Info("contentoverlay: no durable content overlay on this host", "path", st.DataPath)
		return
	}
	slog.Info("contentoverlay: durable content overlay loaded",
		"generation", st.Generation, "entries", len(st.Entries),
		"flagged", st.FlaggedCount, "counts", st.Counts,
		"path", st.DataPath, "shippedTree", st.Shipped.Available)
	for _, e := range st.Entries {
		if !e.Flagged {
			continue
		}
		slog.Warn("contentoverlay: overlay entry needs review — it still WINS over the shipped doc",
			"key", e.Key, "state", e.State, "baseHash", e.BaseHash,
			"shippedHash", e.ShippedHash, "editedBy", e.EditedBy, "editedAt", e.EditedAt)
	}
}
