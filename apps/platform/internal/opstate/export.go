package opstate

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/ggd/platform/internal/combatenv"
	"github.com/ggd/platform/internal/curation"
	"github.com/ggd/platform/internal/data/jsonstore"
	"github.com/ggd/platform/internal/opsenv"
)

// Storage coordinates this package reads and writes. They are taken from the
// owning packages rather than re-typed, so a collection rename over there turns
// into a compile error here instead of a bundle that silently carries nothing.
var (
	// CurationCollection / CurationDoc address data/curation/whitelist.json.
	CurationCollection = curation.Collection
	CurationDoc        = curation.DocID
	// ConfigCollection is the `config` collection (data/config/).
	ConfigCollection = combatenv.Collection
	// CombatEnvDoc / ServerOpsDoc are the two documents in it this tool moves.
	CombatEnvDoc = combatenv.DocID
	ServerOpsDoc = opsenv.DocID
)

// Account collections (three files per account — see AccountsPart).
const (
	AccountsCollection   = "accounts"
	AccountsByUsernameCo = "accounts/by-username"
	AccountsByEmailCo    = "accounts/by-email"
)

// SecretDocID is the one document in the `config` collection this tool must
// NEVER move: internal/ai stores the provider API key in it as plaintext. It is
// named here so the exporter can SAY it skipped it — a silent omission and a
// forgotten secret look identical in a report.
const SecretDocID = "ai-provider"

// ExportOptions parameterise Export.
type ExportOptions struct {
	// DataDir is the DATA_DIR to read. Required.
	DataDir string
	// ContentDir is the content/ tree, read only for the content version stamp.
	// Empty or unreadable degrades to an empty stamp plus a note.
	ContentDir string
	// Parts selects what to carry (nil = DefaultParts).
	Parts []string
	// AllowEmptyWhitelist permits exporting a whitelist that enables no
	// champion. Default false, because a bundle whose whole job is to carry the
	// roster and carries none is worse than no bundle: it restores cleanly, and
	// the failure surfaces at champ-select in front of the family.
	AllowEmptyWhitelist bool
	// Now overrides the clock (tests).
	Now func() time.Time
	// Hostname overrides os.Hostname (tests).
	Hostname string
	// Tool labels the writer in Source.Tool.
	Tool string
}

// ExportReport is what the CLI prints: what went in, what did not, and why.
type ExportReport struct {
	Parts []string `json:"parts"`
	// Notes are operator-facing lines. They are the whole point of the report:
	// "combat-env: not configured on this host — the bundle carries ABSENCE"
	// must be visible, or the owner will assume his tuning is in the file.
	Notes    []string `json:"notes"`
	Warnings []string `json:"warnings"`
	// Counts summarises the whitelist for a one-line sanity check.
	Champions int `json:"champions"`
	Items     int `json:"items"`
	Abilities int `json:"abilities"`
	Accounts  int `json:"accounts"`
}

func (r *ExportReport) note(format string, args ...any) {
	r.Notes = append(r.Notes, fmt.Sprintf(format, args...))
}

func (r *ExportReport) warn(format string, args ...any) {
	r.Warnings = append(r.Warnings, fmt.Sprintf(format, args...))
}

// ErrEmptyWhitelist is returned when the source enables no champion.
var ErrEmptyWhitelist = errors.New("opstate: the source whitelist enables NO champion")

// Export reads operator state out of a DATA_DIR into a sealed Bundle.
//
// It reads the FILESYSTEM, not a running platform, for three reasons: the JSON
// files are the platform's own definition of truth (Redis is an explicitly
// rebuildable mirror), it needs no credentials on either machine, and it works
// on a host whose platform will not boot — which is exactly the situation a
// restore is for. Because it is filesystem-in / filesystem-out, it runs in BOTH
// directions with no extra machinery: laptop→host before the first playtest,
// host→laptop after it.
func Export(opts ExportOptions) (*Bundle, *ExportReport, error) {
	if opts.DataDir == "" {
		return nil, nil, errors.New("opstate: DataDir is required")
	}
	now := opts.Now
	if now == nil {
		now = time.Now
	}
	parts, err := NormalizeParts(opts.Parts)
	if err != nil {
		return nil, nil, err
	}
	store, err := jsonstore.New(opts.DataDir)
	if err != nil {
		return nil, nil, err
	}
	host := opts.Hostname
	if host == "" {
		host, _ = os.Hostname()
	}
	tool := opts.Tool
	if tool == "" {
		tool = "opstate"
	}

	rep := &ExportReport{Parts: parts}
	b := &Bundle{
		Kind:          Kind,
		BundleVersion: BundleVersion,
		ExportedAt:    now().UTC(),
		Source: Source{
			DataDir:        store.Root(),
			Host:           host,
			ContentVersion: readContentVersion(opts.ContentDir, rep),
			Tool:           tool,
		},
	}

	for _, part := range parts {
		switch part {
		case PartCuration:
			if err := exportCuration(store, b, rep, opts.AllowEmptyWhitelist); err != nil {
				return nil, rep, err
			}
		case PartCombatEnv:
			p, err := exportConfigDoc(store, CombatEnvDoc)
			if err != nil {
				return nil, rep, err
			}
			b.CombatEnv = p
			describeConfigPart(rep, "combat-env", "戰鬥系統", p,
				"content/config/combat-env.json still decides every multiplier on the target, "+
					"and a future content re-tune will still be honoured")
		case PartServerOps:
			p, err := exportConfigDoc(store, ServerOpsDoc)
			if err != nil {
				return nil, rep, err
			}
			b.ServerOps = p
			describeConfigPart(rep, "server-ops", "系統運維", p,
				"the game-server keeps its own compiled defaults for maxRooms / snapshotHz")
		case PartAccounts:
			if err := exportAccounts(store, b, rep); err != nil {
				return nil, rep, err
			}
		}
	}

	// Say out loud what was deliberately left behind, so "it is not in the
	// bundle" is never confused with "I forgot".
	if exists, _ := store.Exists(ConfigCollection, SecretDocID); exists {
		rep.note("config/%s.json EXISTS on this host and was NOT exported — it stores the AI provider API key in plaintext. "+
			"Re-enter the key in the admin console on the target instead.", SecretDocID)
	}

	if err := b.Seal(); err != nil {
		return nil, rep, err
	}
	return b, rep, nil
}

func exportCuration(store *jsonstore.Store, b *Bundle, rep *ExportReport, allowEmpty bool) error {
	doc, stored, err := curation.NewRepo(store, nil).Load()
	if err != nil {
		return fmt.Errorf("opstate: reading the whitelist: %w", err)
	}
	rep.Champions, rep.Items, rep.Abilities = len(doc.Champions), len(doc.Items), len(doc.Abilities)
	if len(doc.Champions) == 0 && !allowEmpty {
		return fmt.Errorf("%w (%s/%s.json %s) — a bundle with no roster restores cleanly and then greets "+
			"the players with an empty champion select. Curate first (admin console, or `make seed-demo`), "+
			"or pass -allow-empty if you really mean to move an empty one",
			ErrEmptyWhitelist, CurationCollection, CurationDoc,
			map[bool]string{true: "exists but enables nothing", false: "does not exist"}[stored])
	}
	if len(doc.Champions) == 0 {
		rep.warn("whitelist enables NO champion — this bundle cannot make a deploy playable")
	}
	b.Curation = &CurationPart{Stored: stored, Doc: doc}
	rep.note("whitelist: %d champions / %d items / %d abilities (updatedAt %s)",
		len(doc.Champions), len(doc.Items), len(doc.Abilities), doc.UpdatedAt.Format(time.RFC3339))
	return nil
}

// exportConfigDoc reads one `config` document as raw JSON. FILE ABSENT =
// NEVER CONFIGURED — the single most important line in this package, because
// the alternative (asking the service for its table) hands back a
// content-seeded doc that looks exactly like a deliberate operator choice.
func exportConfigDoc(store *jsonstore.Store, docID string) (*ConfigPart, error) {
	var raw json.RawMessage
	err := store.Get(ConfigCollection, docID, &raw)
	if errors.Is(err, jsonstore.ErrNotFound) {
		return &ConfigPart{Configured: false}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("opstate: reading %s/%s: %w", ConfigCollection, docID, err)
	}
	return &ConfigPart{Configured: true, Doc: raw}, nil
}

func describeConfigPart(rep *ExportReport, name, zh string, p *ConfigPart, absenceMeans string) {
	if !p.Configured {
		rep.note("%s (%s): NEVER CONFIGURED on this host — the bundle carries that ABSENCE, not a table. "+
			"On restore nothing is written, so %s.", name, zh, absenceMeans)
		return
	}
	rep.note("%s (%s): a stored operator override is included (updatedAt %s).",
		name, zh, p.UpdatedAt().Format(time.RFC3339))
}

func exportAccounts(store *jsonstore.Store, b *Bundle, rep *ExportReport) error {
	part := &AccountsPart{Collections: map[string]map[string]json.RawMessage{}}
	for _, col := range []string{AccountsCollection, AccountsByUsernameCo, AccountsByEmailCo} {
		ids, err := store.Scan(col)
		if err != nil {
			return fmt.Errorf("opstate: scanning %s: %w", col, err)
		}
		docs := map[string]json.RawMessage{}
		for _, id := range ids {
			var raw json.RawMessage
			if err := store.Get(col, id, &raw); err != nil {
				return fmt.Errorf("opstate: reading %s/%s: %w", col, id, err)
			}
			docs[id] = raw
		}
		part.Collections[col] = docs
	}
	b.Accounts = part
	rep.Accounts = part.Count()
	rep.warn("accounts: %d account documents INCLUDING PASSWORD HASHES and the admin role are in this bundle. "+
		"Treat the file as a credential: move it over scp, not email, and delete it from the target once restored.",
		part.Count())
	return nil
}

// contentManifest is the subset of content/manifest.json this package reads.
type contentManifest struct {
	ContentVersion string `json:"contentVersion"`
}

// readContentVersion stamps the bundle with the content tree it was curated
// against. Best-effort: an absent content tree is normal on a machine that only
// holds the data dir.
func readContentVersion(contentDir string, rep *ExportReport) string {
	if contentDir == "" {
		rep.note("no CONTENT_DIR given — the bundle carries no content-version stamp, so a restore cannot tell you whether it is stale.")
		return ""
	}
	raw, err := os.ReadFile(filepath.Join(contentDir, "manifest.json"))
	if err != nil {
		rep.warn("could not read %s: %v — the bundle carries no content-version stamp.",
			filepath.Join(contentDir, "manifest.json"), err)
		return ""
	}
	var m contentManifest
	if err := json.Unmarshal(raw, &m); err != nil {
		rep.warn("content manifest is malformed: %v — the bundle carries no content-version stamp.", err)
		return ""
	}
	return m.ContentVersion
}
