package config

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"testing"
)

// ---------------------------------------------------------------------------
// deploy-tier-in-sync — the Go tier table above must match
// packages/shared/src/deployTier.ts, which the package doc names as the source
// of truth.
//
// WHY THIS TEST EXISTS. The same shape of guard already lives at
// internal/opsenv/keysync_test.go, and it was written because the combat-env
// key lists SILENTLY drifted: #136 added abilityRange to the TypeScript sim and
// to content, but not to Go, and for a whole release the platform quietly
// dropped the key from every table it served while nothing failed.
//
// The tier vocabulary is a worse version of that bug. If `family` resolves to
// "family" in TypeScript and to "public" in Go, the platform logs
// deployTier=public and skips the full-asset warning while the client bundle
// happily requests an overlay the edge is refusing — or, in the direction that
// actually ruins the evening, the platform announces FULL ASSETS while the
// client never issues the request. Both builds look healthy. Nobody finds out
// until a family member says "why is everyone a wizard".
//
// The parse is deliberately dumb (regex over the literal source) so it has no
// build dependency on Node: `go test ./internal/config` is enough.
// ---------------------------------------------------------------------------

var (
	tiersArrayRe  = regexp.MustCompile(`(?s)DEPLOY_TIERS\s*=\s*\[(.*?)\]`)
	aliasBlockRe  = regexp.MustCompile(`(?s)DEPLOY_TIER_ALIASES\s*:\s*Record<[^>]*>\s*=\s*\{(.*?)\n\}`)
	quotedTierRe  = regexp.MustCompile(`"([a-z]+)"`)
	aliasPairRe   = regexp.MustCompile(`(?m)^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*"([a-z]+)"\s*,`)
	fullAssetsRe  = regexp.MustCompile(`(?s)function\s+servesFullAssets\([^)]*\)\s*:\s*boolean\s*\{\s*return\s+tier\s*===\s*"([a-z]+)"`)
	restrictedRe  = regexp.MustCompile(`(?s)function\s+allowsRestrictedContent\([^)]*\)\s*:\s*boolean\s*\{\s*return\s+tier\s*!==\s*"([a-z]+)"`)
	defaultTierRe = regexp.MustCompile(`DEFAULT_DEPLOY_TIER\s*:\s*DeployTier\s*=\s*"([a-z]+)"`)
)

// sharedDeployTierSrc is the path of the TypeScript source of truth, relative
// to this package (apps/platform/internal/config).
const sharedDeployTierSrc = "../../../../packages/shared/src/deployTier.ts"

func parseTierList(src []byte) []string {
	m := tiersArrayRe.FindSubmatch(src)
	if len(m) != 2 {
		return nil
	}
	var out []string
	for _, q := range quotedTierRe.FindAllSubmatch(m[1], -1) {
		out = append(out, string(q[1]))
	}
	return out
}

func parseTierAliases(src []byte) map[string]string {
	m := aliasBlockRe.FindSubmatch(src)
	if len(m) != 2 {
		return nil
	}
	out := map[string]string{}
	for _, p := range aliasPairRe.FindAllSubmatch(m[1], -1) {
		out[string(p[1])] = string(p[2])
	}
	return out
}

func readSharedTierSrc(t *testing.T) []byte {
	t.Helper()
	path, err := filepath.Abs(sharedDeployTierSrc)
	if err != nil {
		t.Fatalf("resolve %s: %v", sharedDeployTierSrc, err)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("packages/shared/src/deployTier.ts is the source of truth for the tier "+
			"vocabulary and must be readable at %s: %v", path, err)
	}
	return raw
}

func sortedKeys(m map[string]string) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func TestDeployTierSetMatchesTypeScript(t *testing.T) {
	src := readSharedTierSrc(t)

	tsTiers := parseTierList(src)
	if len(tsTiers) == 0 {
		t.Fatalf("could not parse `DEPLOY_TIERS = [...]` out of %s", sharedDeployTierSrc)
	}
	goSet, tsSet := map[string]bool{}, map[string]bool{}
	for _, v := range DeployTiers {
		goSet[v] = true
	}
	for _, v := range tsTiers {
		tsSet[v] = true
	}
	for v := range goSet {
		if !tsSet[v] {
			t.Errorf("tier %q exists in Go (config.DeployTiers) but NOT in DEPLOY_TIERS in %s — "+
				"a tier the server understands and the client does not is a silent split-brain deploy",
				v, sharedDeployTierSrc)
		}
	}
	for v := range tsSet {
		if !goSet[v] {
			t.Errorf("tier %q exists in DEPLOY_TIERS (%s) but NOT in Go (config.DeployTiers)",
				v, sharedDeployTierSrc)
		}
	}
}

func TestDeployTierAliasesMatchTypeScript(t *testing.T) {
	src := readSharedTierSrc(t)

	tsAliases := parseTierAliases(src)
	if len(tsAliases) == 0 {
		t.Fatalf("could not parse `DEPLOY_TIER_ALIASES = {...}` out of %s", sharedDeployTierSrc)
	}
	if got, want := sortedKeys(tsAliases), sortedKeys(deployTierAliases); len(got) != len(want) {
		t.Errorf("alias key sets differ:\n  ts: %v\n  go: %v", got, want)
	}
	for alias, tier := range tsAliases {
		got, ok := deployTierAliases[alias]
		if !ok {
			t.Errorf("GGD_DEPLOY_TIER=%q is accepted by TypeScript (→ %q) but NOT by Go — "+
				"the owner would type it, the client would go full-asset and the platform would "+
				"silently fall back to %q", alias, tier, DefaultDeployTier)
			continue
		}
		if got != tier {
			t.Errorf("GGD_DEPLOY_TIER=%q resolves to %q in TypeScript and %q in Go", alias, tier, got)
		}
		// And the live function must agree with its own table.
		if normalizeDeployTier(alias) != tier {
			t.Errorf("normalizeDeployTier(%q) = %q, table says %q", alias, normalizeDeployTier(alias), tier)
		}
	}
	for alias := range deployTierAliases {
		if _, ok := tsAliases[alias]; !ok {
			t.Errorf("GGD_DEPLOY_TIER=%q is accepted by Go but NOT by TypeScript", alias)
		}
	}
}

func TestDeployTierPredicatesMatchTypeScript(t *testing.T) {
	src := readSharedTierSrc(t)

	m := fullAssetsRe.FindSubmatch(src)
	if len(m) != 2 {
		t.Fatalf("could not parse servesFullAssets() out of %s", sharedDeployTierSrc)
	}
	fullTier := string(m[1])
	for _, tier := range DeployTiers {
		want := tier == fullTier
		if got := ServesFullAssets(tier); got != want {
			t.Errorf("ServesFullAssets(%q) = %v; TypeScript servesFullAssets says %v "+
				"(it returns true only for %q)", tier, got, want, fullTier)
		}
	}

	m = restrictedRe.FindSubmatch(src)
	if len(m) != 2 {
		t.Fatalf("could not parse allowsRestrictedContent() out of %s", sharedDeployTierSrc)
	}
	denyTier := string(m[1])
	for _, tier := range DeployTiers {
		want := tier != denyTier
		if got := AllowsRestrictedContent(tier); got != want {
			t.Errorf("AllowsRestrictedContent(%q) = %v; TypeScript says %v", tier, got, want)
		}
	}

	m = defaultTierRe.FindSubmatch(src)
	if len(m) != 2 {
		t.Fatalf("could not parse DEFAULT_DEPLOY_TIER out of %s", sharedDeployTierSrc)
	}
	if string(m[1]) != DefaultDeployTier {
		t.Errorf("DEFAULT_DEPLOY_TIER is %q in TypeScript and %q in Go — the fail-safe "+
			"direction of the copyright gate must not depend on which language you ask",
			string(m[1]), DefaultDeployTier)
	}
	// The fail-safe direction itself, asserted rather than assumed.
	if ServesFullAssets(DefaultDeployTier) || AllowsRestrictedContent(DefaultDeployTier) {
		t.Errorf("the default tier %q must serve NEITHER full assets nor restricted content; "+
			"deny by omission is the whole point of #127", DefaultDeployTier)
	}
}

// TestDriftGuardIsNotVacuous exercises the parser against synthetic sources, so
// the guard cannot pass merely because its regexes stopped matching anything.
// (A guard nobody has ever seen fail is a guard nobody knows works — the same
// note opsenv/keysync_test.go carries.)
func TestDriftGuardIsNotVacuous(t *testing.T) {
	good := []byte(`
export const DEPLOY_TIERS = ["public", "private", "family"] as const;
export const DEPLOY_TIER_ALIASES: Record<string, DeployTier> = {
  public: "public",
  lan: "private",
}
`)
	if got := parseTierList(good); len(got) != 3 || got[2] != "family" {
		t.Fatalf("parseTierList failed on a well-formed source: %v", got)
	}
	if got := parseTierAliases(good); len(got) != 2 || got["lan"] != "private" {
		t.Fatalf("parseTierAliases failed on a well-formed source: %v", got)
	}
	if got := parseTierList([]byte("export const SOMETHING_ELSE = [1];")); got != nil {
		t.Fatalf("parseTierList should find nothing in an unrelated source, got %v", got)
	}
	if got := parseTierAliases([]byte("const x = {a: 1};")); len(got) != 0 {
		t.Fatalf("parseTierAliases should find nothing in an unrelated source, got %v", got)
	}
	// A drifted source must be DETECTED, not tolerated.
	drifted := []byte(`export const DEPLOY_TIERS = ["public", "private"] as const;`)
	tsTiers := parseTierList(drifted)
	found := false
	for _, v := range tsTiers {
		if v == "family" {
			found = true
		}
	}
	if found {
		t.Fatal("parser hallucinated a tier that is not in the source")
	}
}
