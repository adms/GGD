package opstate

import (
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"sort"
	"strings"
	"time"

	"github.com/ggd/platform/internal/combatenv"
	"github.com/ggd/platform/internal/curation"
	"github.com/ggd/platform/internal/data/jsonstore"
)

// Restore results, one per part.
const (
	// ResultWritten — the target changed.
	ResultWritten = "written"
	// ResultUnchanged — the target already matched the bundle. This is what a
	// second `restore` of the same bundle must produce, every time.
	ResultUnchanged = "unchanged"
	// ResultSkipped — nothing to do, deliberately (an unconfigured part, a part
	// the bundle does not carry, a part not selected).
	ResultSkipped = "skipped"
	// ResultBlocked — the target holds state NEWER than the bundle and -force
	// was not given. Nothing was written; the restore exits non-zero.
	ResultBlocked = "blocked"
	// ResultPlanned — -dry-run: this is what WOULD have been written.
	ResultPlanned = "planned"
)

// Action is one line of the restore report.
type Action struct {
	Part   string `json:"part"`
	Result string `json:"result"`
	Detail string `json:"detail"`
	// Changes lists the concrete differences applied (or that would be).
	Changes []string `json:"changes,omitempty"`
}

// RestoreReport is the full account of what a restore did. Every path fills it
// in — including the ones that did nothing — because "restore said nothing"
// and "restore did nothing" must not look the same at 9pm.
type RestoreReport struct {
	Actions  []Action `json:"actions"`
	Notes    []string `json:"notes"`
	Warnings []string `json:"warnings"`
	// Dead are bundle ids the target's content tree does not define.
	Dead DeadIDs `json:"dead"`
	// Blocked is true when any part refused to overwrite newer target state.
	Blocked bool `json:"blocked"`
	// Changed is true when anything was actually written.
	Changed bool `json:"changed"`
}

func (r *RestoreReport) note(format string, args ...any) {
	r.Notes = append(r.Notes, fmt.Sprintf(format, args...))
}

func (r *RestoreReport) warn(format string, args ...any) {
	r.Warnings = append(r.Warnings, fmt.Sprintf(format, args...))
}

func (r *RestoreReport) add(a Action) {
	r.Actions = append(r.Actions, a)
	switch a.Result {
	case ResultWritten:
		r.Changed = true
	case ResultBlocked:
		r.Blocked = true
	}
}

// RestoreOptions parameterise Restore.
type RestoreOptions struct {
	// DataDir is the DATA_DIR to write into. Required. It need not exist.
	DataDir string
	// ContentDir is the content/ tree the target will serve, used to verify
	// that every id in the bundle still resolves. Empty = no verification, with
	// a warning.
	ContentDir string
	// Parts selects what to restore (nil = every part the bundle carries).
	Parts []string
	// Force overwrites target state that is NEWER than the bundle. Off by
	// default: he will curate on the host too (the admin console is there), and
	// a routine "re-run the deploy script" must not silently undo an evening of
	// it.
	Force bool
	// Strict turns dead ids into a hard failure instead of a reported drop.
	Strict bool
	// DryRun computes and reports everything, writes nothing.
	DryRun bool
}

// ErrDeadIDs is returned under -strict when the bundle names content that the
// target tree does not define.
var ErrDeadIDs = errors.New("opstate: the bundle names content that no longer exists")

// ErrBlocked is returned when a part would overwrite newer target state.
var ErrBlocked = errors.New("opstate: the target holds state newer than the bundle")

// Restore applies a bundle to a DATA_DIR.
//
// THE THREE PROPERTIES IT IS BUILT AROUND:
//
//  1. IDEMPOTENT. Restoring the same bundle twice reports `unchanged` the
//     second time and touches no file. Comparison is on CONTENT (the id sets,
//     the multiplier table), never on the timestamp, so a rewritten updatedAt
//     cannot masquerade as a change.
//  2. IT NEVER SILENTLY BEATS NEWER TARGET STATE. Each part compares the
//     target's updatedAt against the bundle's and REFUSES (ResultBlocked, exit
//     non-zero) rather than overwriting. That is the direction he will hit for
//     real: curate on the host during playtest one, then re-run the deploy.
//  3. IT SAYS WHAT IT CHANGED, by id. A restore that prints only "ok" is how a
//     wrong whitelist reaches champ-select unnoticed.
func Restore(b *Bundle, opts RestoreOptions) (*RestoreReport, error) {
	if b == nil {
		return nil, errors.New("opstate: no bundle")
	}
	if opts.DataDir == "" {
		return nil, errors.New("opstate: DataDir is required")
	}
	if err := b.Validate(); err != nil {
		return nil, err
	}
	selected, err := selectedParts(b, opts.Parts)
	if err != nil {
		return nil, err
	}
	store, err := jsonstore.New(opts.DataDir)
	if err != nil {
		return nil, err
	}
	cat, err := LoadCatalog(opts.ContentDir)
	if err != nil {
		return nil, err
	}
	rep := &RestoreReport{}
	if !cat.Loaded {
		rep.warn("no content tree at %q — ids in this bundle could NOT be verified. "+
			"Point -content at the deploy's content/ directory to find out whether every champion still exists.",
			opts.ContentDir)
	} else if b.Source.ContentVersion != "" && cat.Version != "" && b.Source.ContentVersion != cat.Version {
		rep.note("content version differs: bundle was exported against %s, this tree is %s — "+
			"every id is checked individually below.", b.Source.ContentVersion, cat.Version)
	}
	if ok, err := b.VerifyChecksum(); err != nil {
		return nil, err
	} else if !ok {
		rep.warn("bundle carries no checksum — integrity was not verified.")
	}

	for _, part := range selected {
		switch part {
		case PartCuration:
			if err := restoreCuration(store, b, cat, opts, rep); err != nil {
				return rep, err
			}
		case PartCombatEnv:
			restoreConfigPart(store, CombatEnvDoc, PartCombatEnv, "戰鬥系統", b.CombatEnv, opts, rep,
				validateCombatEnvDoc)
		case PartServerOps:
			restoreConfigPart(store, ServerOpsDoc, PartServerOps, "系統運維", b.ServerOps, opts, rep, nil)
		case PartAccounts:
			restoreAccounts(store, b, opts, rep)
		}
	}

	if opts.Strict && !rep.Dead.Empty() {
		return rep, fmt.Errorf("%w: %s", ErrDeadIDs, strings.Join(rep.Dead.Lines(), "; "))
	}
	if rep.Blocked {
		return rep, ErrBlocked
	}
	return rep, nil
}

// selectedParts intersects the requested parts with what the bundle carries,
// and says so when the two disagree — silently skipping a part the operator
// asked for is how a restore "succeeds" without restoring anything.
func selectedParts(b *Bundle, requested []string) ([]string, error) {
	have := map[string]bool{}
	for _, p := range b.Parts() {
		have[p] = true
	}
	if len(requested) == 0 {
		return b.Parts(), nil
	}
	want, err := NormalizeParts(requested)
	if err != nil {
		return nil, err
	}
	missing := []string{}
	out := []string{}
	for _, p := range want {
		if have[p] {
			out = append(out, p)
			continue
		}
		missing = append(missing, p)
	}
	if len(missing) > 0 {
		return nil, fmt.Errorf("opstate: this bundle does not contain %s (it has: %s)",
			strings.Join(missing, ", "), strings.Join(b.Parts(), ", "))
	}
	return out, nil
}

// ---------------------------------------------------------------- curation ---

func restoreCuration(store *jsonstore.Store, b *Bundle, cat *Catalog, opts RestoreOptions, rep *RestoreReport) error {
	part := b.Curation
	if part == nil {
		rep.add(Action{Part: PartCuration, Result: ResultSkipped, Detail: "not in this bundle"})
		return nil
	}
	live, dead := VerifyWhitelist(part.Doc.Champions, part.Doc.Items, part.Doc.Abilities, cat)
	rep.Dead = dead
	if !dead.Empty() {
		for _, line := range dead.Lines() {
			rep.warn("whitelist: %s", line)
		}
		rep.warn("whitelist: those %d id(s) were DROPPED from what will be enabled — "+
			"they would otherwise sit in the file doing nothing.", dead.Total())
	}

	desired := curation.Doc{
		Version:   part.Doc.Version,
		UpdatedAt: part.Doc.UpdatedAt,
		Champions: live.Champions,
		Items:     live.Items,
		Abilities: live.Abilities,
	}
	if desired.Version == 0 {
		desired.Version = curation.SchemaVersion
	}

	current, existed, err := curation.NewRepo(store, nil).Load()
	if err != nil {
		return fmt.Errorf("opstate: reading the target whitelist: %w", err)
	}

	changes := whitelistChanges(current, desired)
	if len(changes) == 0 {
		rep.add(Action{Part: PartCuration, Result: ResultUnchanged,
			Detail: fmt.Sprintf("target already enables the same %d champions / %d items / %d abilities",
				len(desired.Champions), len(desired.Items), len(desired.Abilities))})
		return nil
	}

	// Newer-target protection. `existed` matters: the platform lazily creates an
	// EMPTY whitelist on its first read, so a virgin host that has merely been
	// booted has a file whose updatedAt is NOW — newer than any bundle. Blocking
	// on that would make the tool refuse exactly the deploy it exists for, so an
	// empty target is never treated as newer state. Emptiness is not a choice
	// anyone made.
	targetIsMeaningful := existed && len(current.Champions) > 0
	if targetIsMeaningful && current.UpdatedAt.After(desired.UpdatedAt) && !opts.Force {
		rep.add(Action{
			Part: PartCuration, Result: ResultBlocked,
			Detail: fmt.Sprintf("the target whitelist was edited at %s, AFTER this bundle was exported (%s) — "+
				"not overwriting. Export from the target first (that is the host→laptop direction), or pass -force to discard the target's edits.",
				current.UpdatedAt.Format(time.RFC3339), desired.UpdatedAt.Format(time.RFC3339)),
			Changes: changes,
		})
		return nil
	}

	if opts.DryRun {
		rep.add(Action{Part: PartCuration, Result: ResultPlanned, Changes: changes,
			Detail: fmt.Sprintf("would enable %d champions / %d items / %d abilities",
				len(desired.Champions), len(desired.Items), len(desired.Abilities))})
		return nil
	}
	if err := curation.NewRepo(store, nil).Save(nil, desired); err != nil {
		return fmt.Errorf("opstate: writing the whitelist: %w", err)
	}
	rep.add(Action{Part: PartCuration, Result: ResultWritten, Changes: changes,
		Detail: fmt.Sprintf("enabled %d champions / %d items / %d abilities",
			len(desired.Champions), len(desired.Items), len(desired.Abilities))})
	return nil
}

// whitelistChanges describes the difference between two whitelists as operator
// text. Empty result == the two enable exactly the same content, which is the
// idempotency test.
func whitelistChanges(current, desired curation.Doc) []string {
	out := []string{}
	for _, kind := range []struct {
		name             string
		before, after    []string
		maxNamesInReport int
	}{
		{"champions", current.Champions, desired.Champions, 24},
		{"items", current.Items, desired.Items, 24},
		{"abilities", current.Abilities, desired.Abilities, 8},
	} {
		added, removed := diffIDs(kind.before, kind.after)
		if len(added) == 0 && len(removed) == 0 {
			continue
		}
		parts := []string{}
		if len(added) > 0 {
			parts = append(parts, fmt.Sprintf("+%d (%s)", len(added), sample(added, kind.maxNamesInReport)))
		}
		if len(removed) > 0 {
			parts = append(parts, fmt.Sprintf("-%d (%s)", len(removed), sample(removed, kind.maxNamesInReport)))
		}
		out = append(out, fmt.Sprintf("%s: %s", kind.name, strings.Join(parts, "  ")))
	}
	return out
}

func diffIDs(before, after []string) (added, removed []string) {
	inBefore := map[string]bool{}
	for _, id := range before {
		inBefore[id] = true
	}
	inAfter := map[string]bool{}
	for _, id := range after {
		inAfter[id] = true
	}
	for _, id := range after {
		if !inBefore[id] {
			added = append(added, id)
		}
	}
	for _, id := range before {
		if !inAfter[id] {
			removed = append(removed, id)
		}
	}
	sort.Strings(added)
	sort.Strings(removed)
	return added, removed
}

func sample(ids []string, max int) string {
	if len(ids) <= max {
		return strings.Join(ids, " ")
	}
	return strings.Join(ids[:max], " ") + fmt.Sprintf(" …+%d more", len(ids)-max)
}

// ------------------------------------------------------------------ config ---

// restoreConfigPart installs one `config` document, and — the load-bearing case
// — installs NOTHING when the bundle records that the source never configured
// it. See the package header: writing a content-seeded table here is how a
// migration silently pins a deploy to today's numbers forever.
func restoreConfigPart(
	store *jsonstore.Store, docID, part, zh string, p *ConfigPart,
	opts RestoreOptions, rep *RestoreReport, validate func(json.RawMessage, *RestoreReport),
) {
	if p == nil {
		rep.add(Action{Part: part, Result: ResultSkipped, Detail: "not in this bundle"})
		return
	}
	targetRaw, targetExists := readRawDoc(store, docID)

	if !p.Configured {
		detail := "the source never configured " + zh + " — nothing written, so the target keeps resolving from content defaults (and future content re-tunes stay live)"
		if targetExists {
			detail = "the source never configured " + zh + ", but the TARGET has its own stored override — left untouched. " +
				"A bundle that carries absence does not delete a choice made on the target."
		}
		rep.add(Action{Part: part, Result: ResultSkipped, Detail: detail})
		return
	}

	if validate != nil {
		validate(p.Doc, rep)
	}

	if targetExists && sameConfigDoc(targetRaw, p.Doc) {
		rep.add(Action{Part: part, Result: ResultUnchanged, Detail: "target already holds the same " + zh + " table"})
		return
	}
	if targetExists {
		targetAt := rawUpdatedAt(targetRaw)
		bundleAt := p.UpdatedAt()
		if targetAt.After(bundleAt) && !opts.Force {
			rep.add(Action{Part: part, Result: ResultBlocked,
				Detail: fmt.Sprintf("the target's %s table was saved at %s, AFTER this bundle was exported (%s) — not overwriting. Pass -force to discard it.",
					zh, targetAt.Format(time.RFC3339), bundleAt.Format(time.RFC3339))})
			return
		}
	}
	if opts.DryRun {
		rep.add(Action{Part: part, Result: ResultPlanned, Detail: "would install the source's " + zh + " override"})
		return
	}
	if err := store.Put(ConfigCollection, docID, p.Doc); err != nil {
		rep.warn("%s: could not write %s/%s: %v", part, ConfigCollection, docID, err)
		return
	}
	rep.add(Action{Part: part, Result: ResultWritten, Detail: "installed the source's " + zh + " override"})
}

func readRawDoc(store *jsonstore.Store, docID string) (json.RawMessage, bool) {
	var raw json.RawMessage
	err := store.Get(ConfigCollection, docID, &raw)
	if err != nil {
		return nil, false
	}
	return raw, true
}

// sameConfigDoc compares two config documents on CONTENT, ignoring the
// server-owned updatedAt — otherwise every restore would look like a change and
// idempotency would be impossible to observe.
func sameConfigDoc(a, b json.RawMessage) bool {
	stripped := func(raw json.RawMessage) map[string]any {
		var m map[string]any
		if json.Unmarshal(raw, &m) != nil {
			return nil
		}
		delete(m, "updatedAt")
		return m
	}
	ma, mb := stripped(a), stripped(b)
	if ma == nil || mb == nil {
		return false
	}
	return reflect.DeepEqual(ma, mb)
}

func rawUpdatedAt(raw json.RawMessage) time.Time {
	var probe struct {
		UpdatedAt time.Time `json:"updatedAt"`
	}
	if json.Unmarshal(raw, &probe) != nil {
		return time.Time{}
	}
	return probe.UpdatedAt
}

// validateCombatEnvDoc checks an incoming combat-env table against the platform's
// own key set and bounds and WARNS on anything odd. It warns rather than
// refuses because the platform's loader already sanitizes hand-edited files —
// but an operator who moved a bundle between builds with different keys should
// hear about it here, not discover it as a multiplier that quietly reverted.
func validateCombatEnvDoc(raw json.RawMessage, rep *RestoreReport) {
	var doc struct {
		Multipliers map[string]float64 `json:"multipliers"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		rep.warn("combat-env: the bundle's table could not be parsed for checking: %v", err)
		return
	}
	if len(doc.Multipliers) == 0 {
		rep.warn("combat-env: the bundle claims a stored override but its multiplier table is EMPTY.")
		return
	}
	unknown, outOfRange := []string{}, []string{}
	for k, v := range doc.Multipliers {
		if !combatenv.KnownKey(k) {
			unknown = append(unknown, k)
			continue
		}
		if v < combatenv.MinFactor || v > combatenv.MaxFactor {
			outOfRange = append(outOfRange, fmt.Sprintf("%s=%g", k, v))
		}
	}
	sort.Strings(unknown)
	sort.Strings(outOfRange)
	if len(unknown) > 0 {
		rep.warn("combat-env: %d key(s) this build does not know will be dropped when the platform loads the file: %s",
			len(unknown), strings.Join(unknown, ", "))
	}
	if len(outOfRange) > 0 {
		rep.warn("combat-env: %d factor(s) outside the accepted [%g, %g] range: %s",
			len(outOfRange), combatenv.MinFactor, combatenv.MaxFactor, strings.Join(outOfRange, ", "))
	}
	// Missing keys are NOT a warning: the platform backfills them from the
	// content defaults on load (combatenv.sanitizeFrom), which is the correct
	// and intended behaviour.
}

// ---------------------------------------------------------------- accounts ---

// restoreAccounts installs account documents that the target does not already
// have. It NEVER overwrites an existing account without -force: an account doc
// carries the password hash, the wallet and the season record, and the target
// is by definition the machine where people have been playing.
func restoreAccounts(store *jsonstore.Store, b *Bundle, opts RestoreOptions, rep *RestoreReport) {
	part := b.Accounts
	if part == nil {
		rep.add(Action{Part: PartAccounts, Result: ResultSkipped, Detail: "not in this bundle"})
		return
	}
	added, kept, overwritten := 0, 0, 0
	changes := []string{}
	for _, col := range []string{AccountsCollection, AccountsByUsernameCo, AccountsByEmailCo} {
		for id, raw := range part.Collections[col] {
			exists, err := store.Exists(col, id)
			if err != nil {
				rep.warn("accounts: could not stat %s/%s: %v", col, id, err)
				continue
			}
			if exists && !opts.Force {
				kept++
				continue
			}
			if exists {
				overwritten++
			} else {
				added++
			}
			if opts.DryRun {
				continue
			}
			if err := store.Put(col, id, raw); err != nil {
				rep.warn("accounts: could not write %s/%s: %v", col, id, err)
			}
		}
	}
	if kept > 0 {
		changes = append(changes, fmt.Sprintf("%d document(s) already on the target were LEFT ALONE (use -force to replace them)", kept))
	}
	if overwritten > 0 {
		changes = append(changes, fmt.Sprintf("%d document(s) overwritten by -force", overwritten))
	}
	result := ResultWritten
	switch {
	case opts.DryRun && added+overwritten > 0:
		result = ResultPlanned
	case added+overwritten == 0:
		result = ResultUnchanged
	}
	rep.add(Action{Part: PartAccounts, Result: result, Changes: changes,
		Detail: fmt.Sprintf("%d document(s) added across accounts/, by-username/ and by-email/", added)})
	if added+overwritten > 0 {
		rep.note("accounts: restart the platform (or run /seed) so the Redis hot layer is rebuilt from the restored account JSON.")
	}
}
