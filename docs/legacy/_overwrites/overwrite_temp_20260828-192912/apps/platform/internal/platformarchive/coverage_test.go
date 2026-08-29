package platformarchive

import (
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// Failure mode ⑫ — a scan that only walks ONE head.
//
// scope_test.go's TestScopeAcceptsEveryCollectionAMigrationNeeds walks from the
// DECLARATION side: it takes a hand-written list of collections and asks "is
// each one in scope?". That question can never surface a collection nobody
// thought to put on the list — and scope.go says so out loud:
//
//	"⚠️ 這張白名單是**明列**的 —— 沒加進來的集合換主機時會安靑地留在舊機
//	 （沒有測試會紅）"
//
// This test walks the OTHER head: it derives the collections from the PLATFORM
// SOURCE (every string constant in apps/platform/internal that names a
// jsonstore collection) and asks, for each one, "does the archive carry it, or
// does the manifest say out loud that it was left behind?".
//
// Neither direction is sufficient alone. This one catches "somebody added a
// collection and never came here"; the other catches "somebody dropped a rule
// the migration needs".
//
// KNOWN BLIND SPOT, stated rather than hidden: collection names built by a
// FUNCTION rather than a constant (ranking.snapshotCollection(),
// gamelink.MatchCollection(), matchstats.Collection()) are not derived here —
// resolving them would mean evaluating Go expressions. Their prefixes happen to
// be covered by the prefix rules, and the constants they are built from ARE
// scanned. A new function-built collection is still invisible to this gate.
// ---------------------------------------------------------------------------

// collectionIdentRe selects the declarations that name a collection: `ColFoo`,
// `Collection`, `LogCollection`, `SnapshotCollection`, `slackCollection`,
// `CollectionPrefix`, `AccountsByEmailCo`…
var collectionIdentRe = regexp.MustCompile(`(?i)(^col([A-Z_]|$)|collection)`)

// coverageExemptions are collection constants that are deliberately NOT in any
// archive group AND not worth a line in the operator-facing manifest. Every
// entry must carry a reason that can be argued with — "not yet" is not one.
var coverageExemptions = map[string]string{}

type collectionConst struct {
	ident string // package-qualified declaration name
	value string // the collection path it resolves to
	file  string // where it is declared
}

// platformInternalRoot is apps/platform/internal, relative to this package.
const platformInternalRoot = ".."

// scanCollectionConsts parses every non-test Go file under
// apps/platform/internal (this package excluded — it is the consumer, not a
// producer) and returns the string constants whose NAME says "collection" and
// whose VALUE is shaped like a jsonstore collection path.
func scanCollectionConsts(t *testing.T) []collectionConst {
	t.Helper()

	type specRef struct {
		pkg, name, file string
		val             ast.Expr
	}
	var specs []specRef

	fset := token.NewFileSet()
	err := filepath.WalkDir(platformInternalRoot, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			switch d.Name() {
			case "platformarchive", "testutil", "testdata":
				return fs.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		f, perr := parser.ParseFile(fset, path, nil, 0)
		if perr != nil {
			return nil // a file this test cannot parse is not this test's business
		}
		pkg := f.Name.Name
		for _, decl := range f.Decls {
			gd, ok := decl.(*ast.GenDecl)
			if !ok || (gd.Tok != token.CONST && gd.Tok != token.VAR) {
				continue
			}
			for _, spec := range gd.Specs {
				vs, ok := spec.(*ast.ValueSpec)
				if !ok {
					continue
				}
				for i, name := range vs.Names {
					if i >= len(vs.Values) {
						continue
					}
					specs = append(specs, specRef{pkg: pkg, name: name.Name, file: path, val: vs.Values[i]})
				}
			}
		}
		return nil
	})
	if err != nil {
		t.Fatalf("walking %s: %v", platformInternalRoot, err)
	}

	// Resolve string values. Several passes so a const may reference another
	// const declared later, or in another package (combatenv.Collection).
	table := map[string]string{}
	for pass := 0; pass < 4; pass++ {
		for _, s := range specs {
			if v, ok := resolveStringExpr(s.val, s.pkg, table); ok {
				table[s.pkg+"."+s.name] = v
			}
		}
	}

	seen := map[string]bool{}
	out := []collectionConst{}
	for _, s := range specs {
		if !collectionIdentRe.MatchString(s.name) {
			continue
		}
		v, ok := table[s.pkg+"."+s.name]
		if !ok || !looksLikeCollection(v) {
			continue
		}
		key := s.pkg + "." + s.name
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, collectionConst{ident: key, value: v, file: s.file})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ident < out[j].ident })
	return out
}

// resolveStringExpr folds string literals, references to already-known
// constants, and `a + b` concatenations. Anything else is not a constant
// collection name.
func resolveStringExpr(e ast.Expr, pkg string, table map[string]string) (string, bool) {
	switch v := e.(type) {
	case *ast.BasicLit:
		if v.Kind != token.STRING {
			return "", false
		}
		s, err := strconv.Unquote(v.Value)
		return s, err == nil
	case *ast.Ident:
		s, ok := table[pkg+"."+v.Name]
		return s, ok
	case *ast.SelectorExpr:
		x, ok := v.X.(*ast.Ident)
		if !ok {
			return "", false
		}
		s, ok := table[x.Name+"."+v.Sel.Name]
		return s, ok
	case *ast.BinaryExpr:
		if v.Op != token.ADD {
			return "", false
		}
		l, lok := resolveStringExpr(v.X, pkg, table)
		r, rok := resolveStringExpr(v.Y, pkg, table)
		if !lok || !rok {
			return "", false
		}
		return l + r, true
	}
	return "", false
}

// looksLikeCollection accepts values whose every segment is a legal jsonstore
// path segment. It filters out doc ids, env var names and URL paths that happen
// to be declared next to a collection.
func looksLikeCollection(v string) bool {
	if v == "" || strings.HasPrefix(v, "/") || strings.Contains(v, " ") {
		return false
	}
	for _, seg := range strings.Split(v, "/") {
		if !segmentRe.MatchString(seg) {
			return false
		}
	}
	return true
}

// coveredByArchive answers, for one collection name, whether the archive can
// carry it — directly, or as the parent of a partitioned rule
// (`match-stats` → `match-stats/<YYYY>/<MM>`).
func coveredByArchive(v string) bool {
	if RuleFor(v) != nil {
		return true
	}
	for _, suffix := range []string{"/S1", "/S1/champions", "/2026/07"} {
		if RuleFor(v+suffix) != nil {
			return true
		}
	}
	return false
}

// declaredExcluded reports whether the manifest names this collection (or the
// tree it lives under) as deliberately left behind.
func declaredExcluded(v string) bool {
	head := strings.Split(v, "/")[0]
	for _, ex := range ExcludedItems() {
		exHead := strings.Split(ex.Name, "/")[0]
		if ex.Name == v || exHead == head {
			return true
		}
	}
	return false
}

func TestEveryPlatformCollectionIsCarriedOrDeclaredLeftBehind(t *testing.T) {
	consts := scanCollectionConsts(t)

	// --- calibrate the measuring stick, BOTH directions -------------------
	// A scan that silently found nothing would pass this test forever.
	if len(consts) < 12 {
		t.Fatalf("the source scan found only %d collection constants — it is broken, "+
			"not the platform (expected the ~20 under %s)", len(consts), platformInternalRoot)
	}
	byValue := map[string]bool{}
	for _, c := range consts {
		byValue[c.value] = true
	}
	// Known-present: a collection the archive definitely carries.
	if !byValue["accounts"] {
		t.Fatal(`the scan did not find the "accounts" collection — it cannot see the platform`)
	}
	// Known-absent direction: the predicate must be able to say "no".
	if coveredByArchive("definitely-not-a-real-collection") ||
		declaredExcluded("definitely-not-a-real-collection") {
		t.Fatal("the coverage predicate accepts anything — it can never go red")
	}

	// --- the gate ---------------------------------------------------------
	missing := []string{}
	for _, c := range consts {
		if coveredByArchive(c.value) || declaredExcluded(c.value) {
			continue
		}
		if reason, ok := coverageExemptions[c.value]; ok {
			if strings.TrimSpace(reason) == "" {
				t.Errorf("exemption for %q must carry a reason that can be argued with", c.value)
			}
			continue
		}
		missing = append(missing, c.ident+" = "+strconv.Quote(c.value)+"  ("+c.file+")")
	}
	if len(missing) > 0 {
		t.Errorf("%d platform collection(s) are written on the host but belong to NO archive "+
			"group and are NOT named in the manifest's excluded list.\n"+
			"On a migration they stay silently on the old machine.\n"+
			"Fix by adding a rule in scope.go's Rules(), OR an entry in ExcludedItems() "+
			"with a reason, OR (last resort) coverageExemptions here:\n  %s",
			len(missing), strings.Join(missing, "\n  "))
	}
}

// TestCoverageExemptionsAllCarryAReason keeps the escape hatch honest even when
// the gate above is green.
func TestCoverageExemptionsAllCarryAReason(t *testing.T) {
	for col, reason := range coverageExemptions {
		if strings.TrimSpace(reason) == "" {
			t.Errorf("coverageExemptions[%q] must state why it never travels", col)
		}
	}
}
