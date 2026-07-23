// Package opstate moves OPERATOR STATE between deploys: the things the owner
// CHOSE, as opposed to the things the process regenerates.
//
// WHY THIS EXISTS. .gitignore excludes /data/** (correct — accounts, session
// tokens and logs must never be committed), and that same rule silently strips
// data/curation/whitelist.json, which is the file that decides whether anybody
// can pick a champion. A freshly-cloned host therefore boots REACHABLE and
// WELL-FORMED with an EMPTY whitelist: the game-server's fail-safe does not
// engage (that path is only for an UNREACHABLE platform), every SELECT_CHAMPION
// is answered `not-whitelisted`, and champ-select renders zero cards. Nothing
// crashes. It just cannot be played. Copying one 12 KB file fixes it — this
// package is the supported way to copy it.
//
// THE SECOND THING IT CARRIES, AND THE ONE IT REFUSES TO INVENT. The combat-env
// multiplier table (task #28) is a MERGE: content/config/combat-env.json is the
// base, and the operator's saved override wins per key. The platform therefore
// distinguishes "never configured" (no data/config/combat-env.json — the public
// endpoint answers `multipliers:{}`, i.e. "I have no opinion", and the content
// tuning survives) from "configured to neutral" (a stored table of 1.0s, which
// really does flatten the content tuning). That distinction was BOUGHT: serving
// a defaults-filled table from a fresh platform is the bug that once reset every
// content-authored multiplier.
//
// A migration tool is the natural place to recreate it. Reading GET
// /api/v1/admin/combat-env on a never-configured platform yields a full,
// content-seeded table; writing that back makes the deploy "configured", and
// every future content re-tune is then silently masked by the frozen copy. So:
//
//	AN UNCONFIGURED SOURCE EXPORTS AS UNCONFIGURED, AND RESTORES AS ABSENCE.
//
// The type system carries that rule rather than a comment: ConfigPart.Doc is a
// pointer that MUST be nil when Configured is false, and Validate rejects any
// bundle where the two disagree — a bundle cannot physically carry a table it
// is not allowed to install.
//
// WHAT IS DELIBERATELY NOT IN A BUNDLE:
//   - data/config/ai-provider.json — stores a PLAINTEXT provider API key.
//     Secrets do not travel in a file the owner will scp and forget about.
//   - data/invites/ — invite codes are credentials, single-use by design.
//   - data/accounts/ — password hashes and the admin role. Judgement call, see
//     the runbook: a fresh host's first registration becomes the owner, so
//     starting clean is safe TODAY (every account has games=0) and stops being
//     safe the moment playtest one records real MMR. PartAccounts exists and is
//     OFF unless asked for, so the decision stays his.
//   - Redis, data/journal/ — rebuildable at boot from the JSON truth.
//   - data/blizzard-overlay/ (84 MB) — bytes, not choices; task #177 owns it.
package opstate

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/ggd/platform/internal/curation"
)

// Kind tags the file so a mistyped path fails with "this is not a bundle"
// rather than with a JSON decode error 200 lines later.
const Kind = "ggd-operator-state"

// BundleVersion is the format version written by this build.
//
// The rule for bumping it: increment on any change that an OLDER reader would
// misinterpret. Adding a new optional part is not such a change (an old reader
// ignores it and says so, see Restore's report); changing the meaning of an
// existing field is. Restore refuses a bundleVersion it does not know rather
// than guessing, because guessing here means writing the wrong whitelist.
const BundleVersion = 1

// Part names, used by -parts on the CLI and by the report.
const (
	PartCuration  = "curation"
	PartCombatEnv = "combat-env"
	PartServerOps = "server-ops"
	PartAccounts  = "accounts"
)

// DefaultParts is what an export carries when nothing is asked for: the
// operator's CHOICES, no credentials. Accounts are opt-in (see the package
// header).
var DefaultParts = []string{PartCuration, PartCombatEnv, PartServerOps}

// AllParts is every part this build understands.
var AllParts = []string{PartCuration, PartCombatEnv, PartServerOps, PartAccounts}

// Bundle is one snapshot of operator state. It is a plain JSON file: readable,
// diffable, and small enough to eyeball before restoring it.
type Bundle struct {
	Kind          string    `json:"kind"`
	BundleVersion int       `json:"bundleVersion"`
	ExportedAt    time.Time `json:"exportedAt"`
	Source        Source    `json:"source"`

	// Curation is the enablement gate. Nil when the part was not exported.
	Curation *CurationPart `json:"curation,omitempty"`
	// CombatEnv is the 戰鬥系統 override — ABSENT-MEANS-ABSENT, see ConfigPart.
	CombatEnv *ConfigPart `json:"combatEnv,omitempty"`
	// ServerOps is the 系統運維 override (maxRooms / snapshotHz), same shape.
	ServerOps *ConfigPart `json:"serverOps,omitempty"`
	// Accounts is the opt-in player-progression part.
	Accounts *AccountsPart `json:"accounts,omitempty"`

	// Checksum is sha256 over the bundle with this field emptied. It catches a
	// truncated scp and a hand-edit, not tampering — it is not a signature.
	Checksum string `json:"checksum"`
}

// Source records where a bundle came from, so a restore that goes wrong can be
// traced without asking the owner to remember.
type Source struct {
	// DataDir is the absolute DATA_DIR the export read.
	DataDir string `json:"dataDir"`
	// Host is os.Hostname() of the exporting machine.
	Host string `json:"host"`
	// ContentVersion is content/manifest.json's contentVersion ("" when the
	// content tree was not readable). THE FIELD THAT MAKES A STALE BUNDLE
	// VISIBLE: a whitelist is a set of ids INTO the content tree, so a bundle
	// exported against different content may name champions that no longer
	// exist. Restore verifies id-by-id and names every drop; this field is what
	// lets the report say "and here is why".
	ContentVersion string `json:"contentVersion"`
	// Tool is the build that wrote the bundle.
	Tool string `json:"tool"`
}

// CurationPart carries the whitelist document verbatim.
type CurationPart struct {
	// Stored reports whether data/curation/whitelist.json existed at export.
	// It is INFORMATIONAL only: the platform lazily creates an EMPTY whitelist
	// on the first read, so "the file exists" says nothing about whether anybody
	// curated. Emptiness is the signal that matters, and Export refuses to write
	// an empty one without -allow-empty.
	Stored bool `json:"stored"`
	// Doc is the whitelist as the platform stores it.
	Doc curation.Doc `json:"doc"`
}

// ConfigPart carries one document out of the `config` collection with its
// CONFIGURED/UNCONFIGURED state made explicit and structurally enforced.
//
// Configured=false means "the operator never saved this" and Doc MUST be nil.
// That is not a convention: Validate rejects the other combination, so no
// bundle can exist that claims absence while carrying a table.
type ConfigPart struct {
	Configured bool `json:"configured"`
	// Doc is the stored document verbatim (raw JSON, so a knob added by another
	// build survives a round trip untouched). Nil ⟺ !Configured.
	Doc json.RawMessage `json:"doc,omitempty"`
}

// AccountsPart carries account documents verbatim (opt-in; see the header).
//
// It is collection-keyed rather than account-keyed because an account is THREE
// files: accounts/<id>.json plus the accounts/by-username and accounts/by-email
// uniqueness refs that login resolves through. Carrying the account docs alone
// would restore a host where every password is correct and no username can be
// found. Raw JSON keeps this independent of the account schema, which other
// work is actively changing.
type AccountsPart struct {
	// Collections maps jsonstore collection -> doc id -> the JSON as stored.
	Collections map[string]map[string]json.RawMessage `json:"collections"`
}

// Count returns the number of account documents (not index refs).
func (p *AccountsPart) Count() int {
	if p == nil {
		return 0
	}
	return len(p.Collections[AccountsCollection])
}

// UpdatedAt digs the server-owned updatedAt out of a raw config doc so Restore
// can compare host state against bundle state without knowing the schema. A doc
// without a parseable updatedAt returns the zero time, which sorts as "older
// than anything" — the conservative direction, since Restore only ever REFUSES
// on a strictly-newer host document.
func (p *ConfigPart) UpdatedAt() time.Time {
	if p == nil || len(p.Doc) == 0 {
		return time.Time{}
	}
	var probe struct {
		UpdatedAt time.Time `json:"updatedAt"`
	}
	if err := json.Unmarshal(p.Doc, &probe); err != nil {
		return time.Time{}
	}
	return probe.UpdatedAt
}

// Validate checks the structural invariants of a decoded bundle. It is called
// by Load, so nothing downstream has to re-check them.
func (b *Bundle) Validate() error {
	if b.Kind != Kind {
		return fmt.Errorf("opstate: not a %s bundle (kind=%q)", Kind, b.Kind)
	}
	if b.BundleVersion <= 0 {
		return errors.New("opstate: bundle has no bundleVersion")
	}
	if b.BundleVersion > BundleVersion {
		return fmt.Errorf(
			"opstate: bundle format v%d was written by a NEWER build than this one (this build reads up to v%d) — "+
				"restoring it could install a whitelist this binary misreads. Update the platform, then retry",
			b.BundleVersion, BundleVersion)
	}
	for name, part := range map[string]*ConfigPart{
		PartCombatEnv: b.CombatEnv,
		PartServerOps: b.ServerOps,
	} {
		if part == nil {
			continue
		}
		if part.Configured && len(part.Doc) == 0 {
			return fmt.Errorf("opstate: %s claims configured=true but carries no document", name)
		}
		if !part.Configured && len(part.Doc) > 0 {
			return fmt.Errorf(
				"opstate: %s claims configured=false but carries a document — refusing. "+
					"Installing it would turn \"never configured\" into \"configured\", which masks every future content re-tune",
				name)
		}
	}
	if b.Curation != nil {
		if b.Curation.Doc.Champions == nil {
			b.Curation.Doc.Champions = []string{}
		}
		if b.Curation.Doc.Items == nil {
			b.Curation.Doc.Items = []string{}
		}
		if b.Curation.Doc.Abilities == nil {
			b.Curation.Doc.Abilities = []string{}
		}
	}
	return nil
}

// computeChecksum returns the sha256 of the bundle with Checksum emptied.
func (b *Bundle) computeChecksum() (string, error) {
	clone := *b
	clone.Checksum = ""
	data, err := json.Marshal(&clone)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:]), nil
}

// Seal fills in Checksum. Called by Export just before writing.
func (b *Bundle) Seal() error {
	sum, err := b.computeChecksum()
	if err != nil {
		return err
	}
	b.Checksum = sum
	return nil
}

// VerifyChecksum recomputes the checksum and compares. An EMPTY checksum is
// accepted with ok=false and no error: a hand-written bundle is a legitimate
// thing for an operator to build, it just cannot claim integrity.
func (b *Bundle) VerifyChecksum() (ok bool, err error) {
	if strings.TrimSpace(b.Checksum) == "" {
		return false, nil
	}
	sum, err := b.computeChecksum()
	if err != nil {
		return false, err
	}
	if sum != b.Checksum {
		return false, fmt.Errorf(
			"opstate: checksum mismatch — the bundle was truncated or edited after export (want %s, got %s)",
			b.Checksum, sum)
	}
	return true, nil
}

// Marshal renders the bundle as indented JSON with a trailing newline.
func (b *Bundle) Marshal() ([]byte, error) {
	data, err := json.MarshalIndent(b, "", "  ")
	if err != nil {
		return nil, err
	}
	return append(data, '\n'), nil
}

// Parse decodes and validates a bundle from bytes.
func Parse(data []byte) (*Bundle, error) {
	var b Bundle
	if err := json.Unmarshal(data, &b); err != nil {
		return nil, fmt.Errorf("opstate: %s is not valid JSON: %w", Kind, err)
	}
	if err := b.Validate(); err != nil {
		return nil, err
	}
	return &b, nil
}

// Parts lists the part names actually present in the bundle, in AllParts order.
func (b *Bundle) Parts() []string {
	out := []string{}
	if b.Curation != nil {
		out = append(out, PartCuration)
	}
	if b.CombatEnv != nil {
		out = append(out, PartCombatEnv)
	}
	if b.ServerOps != nil {
		out = append(out, PartServerOps)
	}
	if b.Accounts != nil {
		out = append(out, PartAccounts)
	}
	return out
}

// NormalizeParts validates and de-duplicates a requested part list, preserving
// AllParts order so reports read the same way every time.
func NormalizeParts(in []string) ([]string, error) {
	if len(in) == 0 {
		return append([]string{}, DefaultParts...), nil
	}
	want := map[string]bool{}
	for _, raw := range in {
		p := strings.ToLower(strings.TrimSpace(raw))
		if p == "" {
			continue
		}
		if p == "all" {
			for _, a := range AllParts {
				want[a] = true
			}
			continue
		}
		known := false
		for _, a := range AllParts {
			if a == p {
				known = true
				break
			}
		}
		if !known {
			return nil, fmt.Errorf("opstate: unknown part %q (known: %s)", p, strings.Join(AllParts, ", "))
		}
		want[p] = true
	}
	out := []string{}
	for _, a := range AllParts {
		if want[a] {
			out = append(out, a)
		}
	}
	if len(out) == 0 {
		return nil, errors.New("opstate: no parts selected")
	}
	return out, nil
}

// sortedCopy returns a sorted copy of ids (never nil).
func sortedCopy(ids []string) []string {
	out := append([]string{}, ids...)
	sort.Strings(out)
	if out == nil {
		out = []string{}
	}
	return out
}
