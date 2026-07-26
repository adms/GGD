package platformarchive

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"hash"
	"sort"
	"strings"
	"time"
)

// Kind tags the archive so a mistyped path fails with "this is not a platform
// archive" rather than with a JSON decode error deep inside the reader.
const Kind = "ggd-platform-archive"

// ArchiveVersion is the format version written by this build.
//
// Bump it on any change an OLDER reader would MISINTERPRET (a new optional
// collection is not such a change; redefining an existing field is). A reader
// refuses a version it does not know rather than guessing, because guessing
// here means writing the wrong account store.
const ArchiveVersion = 1

// ManifestName is the one entry allowed at the archive root.
const ManifestName = "manifest.json"

// Hygiene limits. Every number is derived from a real boundary in this repo,
// not picked round — the same discipline as contentoverlay's MaxDocs/MaxDocBytes.
const (
	// MaxEntries caps the central-directory size. Real archives: ~84 replays,
	// a few thousand matches per year. 50k leaves an order of magnitude and
	// keeps the manifest's entries map around 3 MB.
	MaxEntries = 50_000
	// MaxDocEntryBytes caps one doc/jsonl entry. The largest real document is a
	// champion overlay doc, and contentoverlay caps THAT at 512 KiB.
	MaxDocEntryBytes = 8 << 20 // 8 MiB
	// MaxOpaqueEntryBytes caps one replay blob.
	MaxOpaqueEntryBytes = 64 << 20 // 64 MiB
	// MaxTotalUncompressed caps the whole archive after decompression.
	MaxTotalUncompressed = 2 << 30 // 2 GiB
	// MaxManifestBytes caps manifest.json itself.
	MaxManifestBytes = 32 << 20 // 32 MiB
	// MaxCompressionRatio is the zip-bomb ratio guard. Only applied to entries
	// of at least MinRatioCheckBytes: small files compress at absurd ratios for
	// entirely innocent reasons.
	MaxCompressionRatio = 200
	// MinRatioCheckBytes is the floor for the ratio guard.
	MinRatioCheckBytes = 64 << 10 // 64 KiB
	// MaxUploadBytes caps a staged upload over HTTP. Mirrored by
	// server.maxArchiveUploadBytes and by the nginx exact-match location.
	MaxUploadBytes = 512 << 20 // 512 MiB
)

// Source records where an archive came from, so an import that goes wrong can
// be traced without asking the owner to remember.
type Source struct {
	DataDir string `json:"dataDir"`
	Host    string `json:"host"`
	// ContentVersion is content/manifest.json's contentVersion. It is what
	// makes a STALE archive visible (the whitelist is a set of ids INTO the
	// content tree).
	ContentVersion string `json:"contentVersion"`
	// PlatformVersion is the build stamp of the exporting platform, or "" when
	// the deploy does not set GGD_PLATFORM_VERSION.
	PlatformVersion string `json:"platformVersion"`
	Tool            string `json:"tool"`
}

// Scope records what was asked for and what was refused.
type Scope struct {
	Selected []string   `json:"selected"`
	Excluded []Excluded `json:"excluded"`
}

// CollectionInfo is the per-collection summary.
//
// SHA256 is COLLECTION-level, not entry-level, on purpose: it keeps the
// manifest O(collections) while forcing the reader to consume the entire
// collection before it can claim a match — i.e. "read and verify everything
// before writing anything" becomes a property of the format rather than a rule
// somebody has to remember. Single-entry corruption is caught by the ZIP's own
// CRC32.
//
// NOTE: re-exporting an imported archive does NOT reproduce this hash. Import
// writes through jsonstore.Put, which re-indents. The hash proves the archive
// is intact, never that an import "worked".
type CollectionInfo struct {
	Name    string    `json:"name"`
	Kind    EntryKind `json:"kind"`
	Group   string    `json:"group"`
	ZH      string    `json:"zh,omitempty"`
	Entries int       `json:"entries"`
	Bytes   int64     `json:"bytes"`
	SHA256  string    `json:"sha256"`
}

// Totals is the one-line sanity check.
type Totals struct {
	Entries           int   `json:"entries"`
	UncompressedBytes int64 `json:"uncompressedBytes"`
}

// Manifest is the archive's table of contents and its integrity claim.
type Manifest struct {
	Kind           string    `json:"kind"`
	ArchiveVersion int       `json:"archiveVersion"`
	ExportedAt     time.Time `json:"exportedAt"`
	Source         Source    `json:"source"`
	Scope          Scope     `json:"scope"`

	Collections []CollectionInfo `json:"collections"`

	// Entries maps every non-manifest entry name to its UNCOMPRESSED byte
	// count. Two jobs, neither optional:
	//   (a) the declared set and the ZIP central directory must be EXACTLY
	//       equal — one extra or one missing entry refuses the whole archive;
	//   (b) it lets the reader cross-check UncompressedSize64 BEFORE
	//       decompressing anything, which is how the zip-bomb ceiling is
	//       enforced without trusting the header alone.
	Entries map[string]int64 `json:"entries"`

	Totals Totals `json:"totals"`

	// Checksum is sha256 over the manifest with this field emptied. It catches
	// a truncated copy and a hand-edit. It is not a signature.
	Checksum string `json:"checksum"`
}

// Validate checks the structural invariants of a decoded manifest.
func (m *Manifest) Validate() error {
	if m.Kind != Kind {
		return fmt.Errorf("platformarchive: this is not a %s (kind=%q)", Kind, m.Kind)
	}
	if m.ArchiveVersion <= 0 {
		return errors.New("platformarchive: the archive declares no archiveVersion")
	}
	if m.ArchiveVersion > ArchiveVersion {
		return fmt.Errorf(
			"platformarchive: archive format v%d was written by a NEWER build than this one "+
				"(this build reads up to v%d) — importing it could write an account store this "+
				"binary misreads. Update the platform, then retry",
			m.ArchiveVersion, ArchiveVersion)
	}
	if m.Entries == nil {
		return errors.New("platformarchive: the manifest declares no entries map")
	}
	if len(m.Entries) > MaxEntries {
		return fmt.Errorf("platformarchive: the manifest declares %d entries (limit %d)",
			len(m.Entries), MaxEntries)
	}
	seen := map[string]bool{}
	for _, c := range m.Collections {
		if seen[c.Name] {
			return fmt.Errorf("platformarchive: collection %q declared twice", c.Name)
		}
		seen[c.Name] = true
		if RuleFor(c.Name) == nil {
			return fmt.Errorf(
				"platformarchive: collection %q is not in this build's scope allowlist — refusing "+
					"the WHOLE archive rather than silently skipping it", c.Name)
		}
	}
	var total int64
	for name, n := range m.Entries {
		if n < 0 {
			return fmt.Errorf("platformarchive: entry %q declares a negative size", name)
		}
		total += n
	}
	if total > MaxTotalUncompressed {
		return fmt.Errorf("platformarchive: the manifest declares %d uncompressed bytes (limit %d)",
			total, MaxTotalUncompressed)
	}
	return nil
}

// computeChecksum returns the sha256 of the manifest with Checksum emptied.
// Same shape as opstate.Bundle.computeChecksum, deliberately.
func (m *Manifest) computeChecksum() (string, error) {
	clone := *m
	clone.Checksum = ""
	data, err := json.Marshal(&clone)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:]), nil
}

// Seal fills in Checksum. Called by Export just before the manifest is written.
func (m *Manifest) Seal() error {
	sum, err := m.computeChecksum()
	if err != nil {
		return err
	}
	m.Checksum = sum
	return nil
}

// VerifyChecksum recomputes and compares. An EMPTY checksum is accepted with
// ok=false and no error — a hand-assembled archive is a legitimate thing for an
// operator to build, it simply cannot claim integrity. Same judgement as
// opstate.
func (m *Manifest) VerifyChecksum() (ok bool, err error) {
	if strings.TrimSpace(m.Checksum) == "" {
		return false, nil
	}
	sum, err := m.computeChecksum()
	if err != nil {
		return false, err
	}
	if sum != m.Checksum {
		return false, fmt.Errorf(
			"platformarchive: checksum mismatch — the archive was truncated or edited after export "+
				"(want %s, got %s)", m.Checksum, sum)
	}
	return true, nil
}

// Marshal renders the manifest as indented JSON with a trailing newline.
func (m *Manifest) Marshal() ([]byte, error) {
	data, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return nil, err
	}
	return append(data, '\n'), nil
}

// GroupsPresent lists the groups the archive actually carries, in AllGroups
// order.
func (m *Manifest) GroupsPresent() []string {
	have := map[string]bool{}
	for _, c := range m.Collections {
		have[c.Group] = true
	}
	out := []string{}
	for _, g := range AllGroups {
		if have[g] {
			out = append(out, g)
		}
	}
	return out
}

// CountFor returns the entry count of one collection (0 when absent).
func (m *Manifest) CountFor(col string) int {
	for _, c := range m.Collections {
		if c.Name == col {
			return c.Entries
		}
	}
	return 0
}

// collectionHasher accumulates a collection's rolling sha256.
//
// The digest is sha256 over the collection's ids IN SORTED ORDER, each
// contributing  id + "\n" + byteLen + "\n" + bytes.
//
// It is STREAMING (no entry body is ever retained) because one replay blob may
// be 64 MiB and a replay collection several hundred. The price is an ordering
// contract: callers must feed ids in ascending order, and addEntry refuses
// anything else rather than silently producing a digest that depends on the
// order the ZIP happened to be read in.
type collectionHasher struct {
	h      hash.Hash
	lastID string
	n      int
	bytes  int64
}

func newCollectionHasher() *collectionHasher {
	return &collectionHasher{h: sha256.New()}
}

// addEntry opens a new entry. The body must then be written to the hasher
// itself (it implements io.Writer) before the next addEntry.
func (c *collectionHasher) addEntry(id string, size int64) error {
	if c.n > 0 && id <= c.lastID {
		return fmt.Errorf(
			"platformarchive: internal: collection ids must be hashed in ascending order (%q after %q)",
			id, c.lastID)
	}
	c.lastID = id
	c.n++
	c.bytes += size
	if _, err := fmt.Fprintf(c.h, "%s\n%d\n", id, size); err != nil {
		return err
	}
	return nil
}

func (c *collectionHasher) Write(p []byte) (int, error) { return c.h.Write(p) }

func (c *collectionHasher) sum() (digest string, entries int, bytes int64) {
	return hex.EncodeToString(c.h.Sum(nil)), c.n, c.bytes
}

// sortedIDs is the ordering every caller of collectionHasher must use.
func sortedIDs(ids []string) []string {
	out := append([]string{}, ids...)
	sort.Strings(out)
	return out
}
