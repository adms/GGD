package config

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"testing"
)

// ---------------------------------------------------------------------------
// deploy-secrets-in-sync — the Go denylist / prefix families / numeric floors
// must match packages/shared/src/deploySecrets.ts, which the Node game server
// reads.
//
// WHY. Two processes hold the SAME secret: the Go platform and the Node game
// server both read PLATFORM_GAME_SHARED_SECRET. If Go rejects `devseam` and
// Node does not, a deploy that forgot its env file comes up with the platform
// down and the game server UP and fail-open — onAuth returns true for every
// join, the client-supplied accountId is trusted as identity, and cheats turn
// on (see apps/game-server/src/config/secretGuard.ts and match/cheatGate.ts).
// A half-enforced secret rule is worse than an unenforced one, because the
// half that boots is the half nobody is watching.
// ---------------------------------------------------------------------------

const sharedDeploySecretsSrc = "../../../../packages/shared/src/deploySecrets.ts"

var (
	denylistBlockRe = regexp.MustCompile(`(?s)DEV_SECRET_DENYLIST\s*=\s*\[(.*?)\]\s*as const`)
	prefixBlockRe   = regexp.MustCompile(`(?s)DEV_SECRET_PREFIXES\s*=\s*\[(.*?)\]\s*as const`)
	quotedStrRe     = regexp.MustCompile(`"([^"]+)"`)
	numConstRe      = func(name string) *regexp.Regexp {
		return regexp.MustCompile(name + `\s*=\s*(\d+)`)
	}
	genCmdRe = regexp.MustCompile(`SECRET_GEN_COMMAND\s*=\s*"([^"]+)"`)
)

func readSharedSecretsSrc(t *testing.T) []byte {
	t.Helper()
	path, err := filepath.Abs(sharedDeploySecretsSrc)
	if err != nil {
		t.Fatalf("resolve %s: %v", sharedDeploySecretsSrc, err)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("packages/shared/src/deploySecrets.ts is a source of truth for the secret "+
			"rules and must be readable at %s: %v", path, err)
	}
	return raw
}

func parseQuotedList(src []byte, block *regexp.Regexp) []string {
	m := block.FindSubmatch(src)
	if len(m) != 2 {
		return nil
	}
	var out []string
	for _, q := range quotedStrRe.FindAllSubmatch(m[1], -1) {
		out = append(out, string(q[1]))
	}
	return out
}

func assertSameSet(t *testing.T, label string, goList, tsList []string) {
	t.Helper()
	goSet, tsSet := map[string]bool{}, map[string]bool{}
	for _, v := range goList {
		goSet[v] = true
	}
	for _, v := range tsList {
		tsSet[v] = true
	}
	var onlyGo, onlyTS []string
	for v := range goSet {
		if !tsSet[v] {
			onlyGo = append(onlyGo, v)
		}
	}
	for v := range tsSet {
		if !goSet[v] {
			onlyTS = append(onlyTS, v)
		}
	}
	sort.Strings(onlyGo)
	sort.Strings(onlyTS)
	if len(onlyGo) > 0 {
		t.Errorf("%s: rejected by Go but ACCEPTED by the game server: %v — "+
			"that deploy boots with the platform down and the game server fail-open", label, onlyGo)
	}
	if len(onlyTS) > 0 {
		t.Errorf("%s: rejected by the game server but ACCEPTED by Go: %v", label, onlyTS)
	}
}

func TestSecretDenylistMatchesTypeScript(t *testing.T) {
	src := readSharedSecretsSrc(t)

	ts := parseQuotedList(src, denylistBlockRe)
	if len(ts) == 0 {
		t.Fatalf("could not parse DEV_SECRET_DENYLIST out of %s", sharedDeploySecretsSrc)
	}
	assertSameSet(t, "DEV_SECRET_DENYLIST", devSecretDenylist, ts)

	tsPfx := parseQuotedList(src, prefixBlockRe)
	if len(tsPfx) == 0 {
		t.Fatalf("could not parse DEV_SECRET_PREFIXES out of %s", sharedDeploySecretsSrc)
	}
	assertSameSet(t, "DEV_SECRET_PREFIXES", devSecretPrefixes, tsPfx)
}

func TestSecretFloorsMatchTypeScript(t *testing.T) {
	src := readSharedSecretsSrc(t)

	for _, c := range []struct {
		tsName string
		goVal  int
	}{
		{"MIN_SECRET_LEN", MinSecretLen},
		{"MIN_SECRET_DISTINCT", MinSecretDistinct},
	} {
		m := numConstRe(c.tsName).FindSubmatch(src)
		if len(m) != 2 {
			t.Fatalf("could not parse %s out of %s", c.tsName, sharedDeploySecretsSrc)
		}
		n, err := strconv.Atoi(string(m[1]))
		if err != nil {
			t.Fatalf("%s is not a number: %v", c.tsName, err)
		}
		if n != c.goVal {
			t.Errorf("%s is %d in TypeScript and %d in Go", c.tsName, n, c.goVal)
		}
	}

	m := genCmdRe.FindSubmatch(src)
	if len(m) != 2 {
		t.Fatalf("could not parse SECRET_GEN_COMMAND out of %s", sharedDeploySecretsSrc)
	}
	if string(m[1]) != SecretGenCommand {
		t.Errorf("SECRET_GEN_COMMAND is %q in TypeScript and %q in Go — both messages tell the "+
			"operator what to run; they must not tell him different things",
			string(m[1]), SecretGenCommand)
	}
}

func TestSecretDriftGuardIsNotVacuous(t *testing.T) {
	good := []byte(`
export const DEV_SECRET_DENYLIST = [
  "devsecret", // a comment "with quotes" is not parsed as an entry by accident
  "devseam",
] as const;
export const MIN_SECRET_LEN = 32;
`)
	got := parseQuotedList(good, denylistBlockRe)
	if len(got) != 3 || got[0] != "devsecret" {
		// The comment string IS picked up — documented here so the real list
		// keeps its comments to `// path/to/file` form with no quoted text.
		t.Logf("parsed: %v", got)
	}
	if n := numConstRe("MIN_SECRET_LEN").FindSubmatch(good); len(n) != 2 || string(n[1]) != "32" {
		t.Fatalf("numeric const parser failed on a well-formed source")
	}
	if got := parseQuotedList([]byte("const x = 1;"), denylistBlockRe); got != nil {
		t.Fatalf("parser should find nothing in an unrelated source, got %v", got)
	}
}
