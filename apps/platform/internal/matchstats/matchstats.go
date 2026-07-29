// Package matchstats persists the per-match ANALYSIS LEDGER the game-server
// produces (packages/shared/src/sim/stats/matchLedger.ts) and carries it to a
// new host through the #243 platform archive. Task #207 (後台覆盤).
//
// ── WHY THIS IS NOT A FEW MORE FIELDS ON gamelink.Settlement ────────────────
// The settlement record is the SETTLEMENT: who placed where, what MMR / M幣 /
// 水晶 / points each account ends the match with. It is replayed by the WAL,
// it is idempotent by construction (every value absolute), and Apply writes it
// on the critical path of paying players. The ledger is the opposite kind of
// data — every cast, every 三選一 the player DECLINED, every item transaction —
// and losing it must never cost anybody a coin. Bolting it onto Settlement
// would put a megabyte of analytics inside the WAL intent that gets replayed
// after a crash, and would make one malformed analytics blob able to block a
// payout. Separate document, separate route, separate failure domain.
//
// ── THE VERSION STAMP IS THE POINT, NOT A DECORATION ────────────────────────
// The owner wants this data to compare BUILDS: did the 攻速上限 change move
// average round length, did the base-bonus rework move the S~D distribution.
// A pile of match rows with no build identity cannot answer that, and nothing
// downstream can reconstruct it later — by the time anyone asks, the host has
// been redeployed. So every record carries four stamps, written at INGEST:
//
//	versions.record    this file's format version (RecordVersion)
//	versions.game      the game-server build that played the match (from the body)
//	versions.platform  GGD_PLATFORM_VERSION of the platform that accepted it
//	versions.content   content/manifest.json's contentVersion at accept time
//
// They are stamped HERE and not by the sender for `platform` and `content`
// (the game-server does not know either) and taken from the sender for `game`
// (the platform does not know it). Each stamp is written by the only process
// that actually knows the fact.
//
// ── THE WRITE GATE (validate.go) ────────────────────────────────────────────
// Same shape and same reasoning as internal/contentoverlay/validate.go: an
// ALLOWLIST of section names plus an ID COMPARISON, never a transcription of
// the TypeScript types into Go. Transcribing would rot in the OVER-rejection
// direction, and a gate that refuses data the consumers would have accepted is
// worse than the hole it closes. See validate.go's header.
//
// ── ONE BAD RECORD MAY NEVER COST THE BATCH ─────────────────────────────────
// This is the v0.9.13 overlay lesson (internal/platformarchive/overlaygate.go)
// applied one level down. Two independent places:
//
//   - INGEST: a single malformed element inside `casts` drops THAT ELEMENT and
//     lists it in `dropped`; the other 2,900 casts and the whole rest of the
//     match are persisted. Rejecting the POST would throw away the match.
//   - READ: List skips a file it cannot decode instead of failing the page, so
//     one corrupt record cannot blank the whole 後台覆盤 screen. (admin's
//     walkMatches already made this call for match records; same call here.)
//
// The loss is never silent: `dropped` travels INSIDE the record, so the console
// can say "this match is missing 3 casts and here is why" rather than showing a
// slightly-wrong number nobody can question.
package matchstats

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/ggd/platform/internal/data/jsonstore"
)

// RecordVersion is the format version of a persisted record.
//
// Bump it when an OLDER reader would MISINTERPRET a record — the same rule
// platformarchive.ArchiveVersion states. Adding an optional field is not such a
// change; redefining what an existing field means is.
const RecordVersion = 1

// Schema tags the document so a file that lands here by accident fails with
// "this is not a match-stats record" instead of decoding into a zero value.
const Schema = "ggd-match-stats@1"

// CollectionPrefix is the root of the YYYY/MM-partitioned tree, mirroring
// gamelink's `matches/`. TestPartitioningTracksGamelink pins the two together:
// the 後台覆盤 screen joins a stats record to its settlement record, and a
// partition split between them would make that join silently empty for every
// match in the month the two disagreed about.
const CollectionPrefix = "match-stats"

// MaxRecordBytes caps one stored record.
//
// ⚠️ IT IS DERIVED, NOT PICKED. platformarchive.MaxDocEntryBytes is 8 MiB, so a
// record larger than this could be WRITTEN but never EXPORTED — it would fail
// the archive's per-entry hygiene check and the operator would discover, at
// migration time, that some matches cannot move. Accepting data the migration
// path cannot carry is the exact failure #243 exists to prevent.
// TestRecordCapFitsTheArchive (in platformarchive, the package that can see
// both constants) fails if the two ever drift.
const MaxRecordBytes = 8 << 20 // 8 MiB

// ErrNotFound is returned by Get when no record exists for a match id.
var ErrNotFound = errors.New("matchstats: not found")

// Versions is the build identity of one record. Every field is stamped by the
// only process that knows it; see the package header.
type Versions struct {
	// Record is RecordVersion at write time.
	Record int `json:"record"`
	// Game is the game-server build that played the match ("" when the sender
	// did not say — old game-servers, and a fact we must not invent).
	Game string `json:"game,omitempty"`
	// Platform is GGD_PLATFORM_VERSION of the accepting platform.
	Platform string `json:"platform,omitempty"`
	// Content is content/manifest.json's contentVersion at accept time.
	Content string `json:"content,omitempty"`
}

// Dropped is one element the write gate refused, kept INSIDE the record so the
// loss is visible to whoever reads the numbers. A silently short array is how a
// "measured" figure becomes a lie.
type Dropped struct {
	// Path is the element's position, e.g. "casts[7]".
	Path string `json:"path"`
	// Reason is the operator-facing sentence.
	Reason string `json:"reason"`
}

// Record is one persisted match ledger.
//
// Ledger stays a json.RawMessage on purpose. The shape is owned by
// packages/shared/src/sim/stats/matchLedger.ts and it is still growing; Go
// re-declaring those seven arrays would produce a second, drifting definition
// whose only observable effect is dropping fields the TypeScript added last
// week. The gate judges STRUCTURE (validate.go); the bytes pass through.
type Record struct {
	Schema  string   `json:"schema"`
	MatchID string   `json:"matchId"`
	Version Versions `json:"versions"`
	// EndedAt is the match's own end time — it picks the partition, and it is
	// the axis every version-over-version comparison is drawn against.
	EndedAt time.Time `json:"endedAt"`
	// ReceivedAt is when this platform accepted it. Distinct from EndedAt: a
	// retry an hour later must not look like an hour-long match.
	ReceivedAt time.Time       `json:"receivedAt"`
	Ledger     json.RawMessage `json:"ledger"`
	Dropped    []Dropped       `json:"dropped,omitempty"`
}

// Collection returns the YYYY/MM partition for a match end time.
//
// Deliberately the same partitioning as gamelink.MatchCollection, so
// data/match-stats/2026/07 sits beside data/matches/2026/07 and a retention
// sweep, a backup or an eyeball sees one month in one place.
func Collection(endedAt time.Time) string {
	return fmt.Sprintf("%s/%04d/%02d", CollectionPrefix, endedAt.UTC().Year(), int(endedAt.UTC().Month()))
}

// Options configure the service. Both version stamps are read ONCE at
// construction: they describe the running build, so re-reading per request
// would only add a syscall and the chance of a mid-match change.
type Options struct {
	// PlatformVersion is GGD_PLATFORM_VERSION ("" when the deploy sets none).
	PlatformVersion string
	// ContentDir is the content/ tree, read only for contentVersion.
	ContentDir string
	// Now overrides the clock (tests).
	Now func() time.Time
}

// Service persists and reads match ledgers.
type Service struct {
	store           *jsonstore.Store
	platformVersion string
	contentVersion  string
	now             func() time.Time
}

// New builds the service and resolves the two stamps this host owns.
func New(store *jsonstore.Store, opts Options) *Service {
	now := opts.Now
	if now == nil {
		now = time.Now
	}
	return &Service{
		store:           store,
		platformVersion: opts.PlatformVersion,
		contentVersion:  readContentVersion(opts.ContentDir),
		now:             now,
	}
}

// contentManifest is the subset of content/manifest.json read here.
type contentManifest struct {
	ContentVersion string `json:"contentVersion"`
}

// readContentVersion is best-effort: a host with no CONTENT_DIR still records
// matches, it simply cannot claim which content tree they were played on. An
// EMPTY stamp is honest; a guessed one would poison every later comparison.
func readContentVersion(contentDir string) string {
	if contentDir == "" {
		slog.Warn("matchstats: no CONTENT_DIR — records will carry no content version stamp",
			"why", "版本間對照 needs to know which content tree a match was played on")
		return ""
	}
	// #nosec G304 -- operator-configured CONTENT_DIR joined with a literal.
	raw, err := os.ReadFile(filepath.Join(contentDir, "manifest.json"))
	if err != nil {
		slog.Warn("matchstats: content manifest unreadable — records will carry no content version stamp",
			"path", filepath.Join(contentDir, "manifest.json"), "err", err)
		return ""
	}
	var m contentManifest
	if err := json.Unmarshal(raw, &m); err != nil {
		slog.Warn("matchstats: content manifest is not JSON — records will carry no content version stamp",
			"err", err)
		return ""
	}
	return m.ContentVersion
}

// Ingest is one accepted submission: the sanitized ledger plus what was dropped.
type Ingest struct {
	MatchID     string
	GameVersion string
	EndedAt     time.Time
	Ledger      json.RawMessage
	Dropped     []Dropped
}

// Put stamps and persists one record, returning what was stored.
//
// The write is a plain jsonstore.Put — last writer wins for the same match id
// in the same partition, which is what a game-server retry should do. The
// caller is expected to send the SAME endedAt it sent to the settlement
// callback; a different one lands in a different month's partition and would
// leave two copies, so Put refuses a zero-value EndedAt rather than defaulting
// it and creating that ambiguity silently.
func (s *Service) Put(in Ingest) (Record, error) {
	if in.MatchID == "" {
		return Record{}, errors.New("matchstats: empty match id")
	}
	if in.EndedAt.IsZero() {
		return Record{}, errors.New("matchstats: endedAt is required — it selects the storage partition")
	}
	rec := Record{
		Schema:  Schema,
		MatchID: in.MatchID,
		Version: Versions{
			Record:   RecordVersion,
			Game:     in.GameVersion,
			Platform: s.platformVersion,
			Content:  s.contentVersion,
		},
		EndedAt:    in.EndedAt.UTC(),
		ReceivedAt: s.now().UTC(),
		Ledger:     in.Ledger,
		Dropped:    in.Dropped,
	}
	if err := s.store.Put(Collection(rec.EndedAt), rec.MatchID, rec); err != nil {
		return Record{}, err
	}
	return rec, nil
}

// Partitions lists the YYYY/MM collections present under the root, newest
// first. A missing tree reads as none.
func (s *Service) Partitions() []string { return partitionsUnder(s.store.Root()) }

// partitionsUnder enumerates <root>/match-stats/<YYYY>/<MM>, newest first.
//
// It is depth-bounded and name-filtered by jsonstore's own segment rule, for
// the same reason platformarchive's childDirs is: a recursive walk of DATA_DIR
// is how an unrelated directory ends up being treated as data.
func partitionsUnder(root string) []string {
	out := []string{}
	for _, y := range childDirs(root, CollectionPrefix) {
		for _, m := range childDirs(root, CollectionPrefix+"/"+y) {
			out = append(out, CollectionPrefix+"/"+y+"/"+m)
		}
	}
	// Lexical descending == chronological descending for zero-padded YYYY/MM.
	sort.Sort(sort.Reverse(sort.StringSlice(out)))
	return out
}

// segmentRe mirrors jsonstore.go's collection-segment rule, the same way
// platformarchive/scope.go mirrors it: a directory jsonstore itself would
// refuse must never be enumerated as a partition. Copied rather than exported
// from jsonstore so this package cannot widen that package's key rule by
// accident; TestSegmentRuleMatchesJsonstore compares the two source literals.
var segmentRe = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$`)

func childDirs(root, rel string) []string {
	entries, err := os.ReadDir(filepath.Join(root, filepath.FromSlash(rel)))
	if err != nil {
		return nil
	}
	out := []string{}
	for _, e := range entries {
		if !e.IsDir() || !segmentRe.MatchString(e.Name()) {
			continue
		}
		out = append(out, e.Name())
	}
	sort.Strings(out)
	return out
}

// Get loads one record by match id, searching partitions newest-first.
func (s *Service) Get(matchID string) (Record, error) {
	if matchID == "" {
		return Record{}, ErrNotFound
	}
	for _, col := range s.Partitions() {
		var rec Record
		err := s.store.Get(col, matchID, &rec)
		if errors.Is(err, jsonstore.ErrNotFound) || errors.Is(err, jsonstore.ErrInvalidKey) {
			continue
		}
		if err != nil {
			return Record{}, err
		}
		return rec, nil
	}
	return Record{}, ErrNotFound
}

// Summary is the list row: everything the 後台覆盤 index needs without paying
// for the ledger body, which is the overwhelming majority of the bytes.
type Summary struct {
	MatchID    string    `json:"matchId"`
	Version    Versions  `json:"versions"`
	EndedAt    time.Time `json:"endedAt"`
	ReceivedAt time.Time `json:"receivedAt"`
	// Dropped is the COUNT of refused elements. A non-zero value here is why
	// the console can flag "these numbers are incomplete" instead of quietly
	// charting a short array.
	Dropped int `json:"dropped"`
	// Bytes is the on-disk size, so an operator can see what the tree costs.
	Bytes int64 `json:"bytes"`
}

// List returns record summaries newest first.
//
// ⚠️ A RECORD IT CANNOT DECODE IS SKIPPED, NOT FATAL. One corrupt file must
// not blank the whole review screen — that is the same "one bad doc must not
// cost the batch" rule the ingest gate enforces, applied to the read side. The
// skip is counted and returned so it is visible rather than silent.
func (s *Service) List(limit int) (rows []Summary, unreadable int) {
	rows = []Summary{}
	for _, col := range s.Partitions() {
		ids, err := s.store.Scan(col)
		if err != nil {
			continue
		}
		sort.Sort(sort.Reverse(sort.StringSlice(ids)))
		for _, id := range ids {
			if IsQuarantineID(id) {
				continue
			}
			var rec Record
			if err := s.store.Get(col, id, &rec); err != nil || rec.MatchID == "" {
				unreadable++
				continue
			}
			rows = append(rows, Summary{
				MatchID: rec.MatchID, Version: rec.Version,
				EndedAt: rec.EndedAt, ReceivedAt: rec.ReceivedAt,
				Dropped: len(rec.Dropped), Bytes: sizeOf(s.store, col, id),
			})
		}
	}
	sort.SliceStable(rows, func(i, j int) bool { return rows[i].EndedAt.After(rows[j].EndedAt) })
	if limit > 0 && len(rows) > limit {
		rows = rows[:limit]
	}
	return rows, unreadable
}

func sizeOf(store *jsonstore.Store, col, id string) int64 {
	p, err := store.Path(col, id)
	if err != nil {
		return 0
	}
	st, err := os.Stat(p)
	if err != nil {
		return 0
	}
	return st.Size()
}

// quarantineMark is the id infix that marks a record kept verbatim because the
// gate refused it. Same convention as contentoverlay's `overlay.corrupt-*` and
// platformarchive's `overlay.rejected-*`: the bytes survive, but nothing reads
// them as live data.
const quarantineMark = ".rejected-"

// IsQuarantineID reports whether an id names a quarantined copy rather than a
// live record. Exported because the ARCHIVE has to make the same distinction
// (a quarantined copy must be moved verbatim, never re-judged).
func IsQuarantineID(id string) bool { return strings.Contains(id, quarantineMark) }

// QuarantineIDFor names the doc that keeps a refused record's ORIGINAL bytes.
// Keyed by a hash of those bytes so two different bad records both survive and
// re-importing the same one re-uses a single id — the reasoning is spelled out
// in platformarchive/overlaygate.go's quarantineIDFor.
func QuarantineIDFor(matchID string, raw []byte) string {
	return matchID + quarantineMark + shortHash(raw)
}
