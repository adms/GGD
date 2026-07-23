package opstate

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Catalog is the set of ids that EXIST in a content tree. It is what turns "48
// champions were restored" into "48 champions were restored and all 48 resolve
// to a real champion document".
type Catalog struct {
	// Loaded is false when no content tree was readable. Every membership test
	// then answers true, so an unverifiable restore degrades to the old
	// behaviour (restore everything) instead of dropping the whole roster.
	Loaded    bool
	Champions map[string]struct{}
	Items     map[string]struct{}
	Abilities map[string]struct{}
	// Version is content/manifest.json's contentVersion, "" when absent.
	Version string
}

// LoadCatalog enumerates the champion / item / ability ids in a content tree.
//
// It lists the DIRECTORIES rather than trusting each collection's _index.json:
// the index is derived state, and this is the check that decides whether an id
// is real. A missing content tree is not an error — the caller is told via
// Loaded and warns.
func LoadCatalog(contentDir string) (*Catalog, error) {
	c := &Catalog{
		Champions: map[string]struct{}{},
		Items:     map[string]struct{}{},
		Abilities: map[string]struct{}{},
	}
	if strings.TrimSpace(contentDir) == "" {
		return c, nil
	}
	if _, err := os.Stat(contentDir); err != nil {
		return c, nil
	}
	for dir, set := range map[string]map[string]struct{}{
		"champions": c.Champions,
		"items":     c.Items,
		"abilities": c.Abilities,
	} {
		entries, err := os.ReadDir(filepath.Join(contentDir, dir))
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return c, fmt.Errorf("opstate: reading content/%s: %w", dir, err)
		}
		for _, e := range entries {
			name := e.Name()
			if e.IsDir() || !strings.HasSuffix(name, ".json") || strings.HasPrefix(name, "_") {
				continue
			}
			set[strings.TrimSuffix(name, ".json")] = struct{}{}
		}
	}
	c.Loaded = len(c.Champions) > 0 || len(c.Items) > 0 || len(c.Abilities) > 0
	if raw, err := os.ReadFile(filepath.Join(contentDir, "manifest.json")); err == nil {
		var m contentManifest
		if json.Unmarshal(raw, &m) == nil {
			c.Version = m.ContentVersion
		}
	}
	return c, nil
}

func (c *Catalog) has(set map[string]struct{}, id string) bool {
	if !c.Loaded || len(set) == 0 {
		return true
	}
	_, ok := set[id]
	return ok
}

// HasChampion / HasItem / HasAbility report membership, answering true whenever
// the catalog could not be loaded (see Catalog.Loaded).
func (c *Catalog) HasChampion(id string) bool { return c.has(c.Champions, id) }
func (c *Catalog) HasItem(id string) bool     { return c.has(c.Items, id) }
func (c *Catalog) HasAbility(id string) bool  { return c.has(c.Abilities, id) }

// DeadIDs lists, per kind, the whitelist ids a content tree no longer defines.
// Every id is listed BY NAME and never truncated: the whole failure this
// prevents is a bundle that imports "48 champions" of which six quietly do
// nothing, and a count would reproduce it exactly.
type DeadIDs struct {
	Champions []string `json:"champions"`
	Items     []string `json:"items"`
	Abilities []string `json:"abilities"`
}

// Total is how many ids in the bundle no longer exist.
func (d DeadIDs) Total() int { return len(d.Champions) + len(d.Items) + len(d.Abilities) }

// Empty reports whether every id in the bundle resolves.
func (d DeadIDs) Empty() bool { return d.Total() == 0 }

// Lines renders the dead ids as operator-facing text, one line per kind.
func (d DeadIDs) Lines() []string {
	out := []string{}
	for _, kind := range []struct {
		name string
		ids  []string
	}{
		{"champions", d.Champions},
		{"items", d.Items},
		{"abilities", d.Abilities},
	} {
		if len(kind.ids) == 0 {
			continue
		}
		out = append(out, fmt.Sprintf("%d %s no longer exist in this content tree: %s",
			len(kind.ids), kind.name, strings.Join(kind.ids, ", ")))
	}
	return out
}

// VerifyWhitelist splits a whitelist document against a content catalog into
// the ids that resolve (live) and the ids that do not (dead).
func VerifyWhitelist(champions, items, abilities []string, cat *Catalog) (live struct {
	Champions, Items, Abilities []string
}, dead DeadIDs) {
	split := func(ids []string, has func(string) bool) (keep, drop []string) {
		keep, drop = []string{}, []string{}
		for _, id := range sortedCopy(ids) {
			if has(id) {
				keep = append(keep, id)
			} else {
				drop = append(drop, id)
			}
		}
		return keep, drop
	}
	live.Champions, dead.Champions = split(champions, cat.HasChampion)
	live.Items, dead.Items = split(items, cat.HasItem)
	live.Abilities, dead.Abilities = split(abilities, cat.HasAbility)
	sort.Strings(dead.Champions)
	sort.Strings(dead.Items)
	sort.Strings(dead.Abilities)
	return live, dead
}
