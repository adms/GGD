package server

// ADMIN SURFACES MUST FAIL CLOSED (2026-07-27).
//
// Two real defects were found on the live deployment on the same day, and both
// were invisible to every existing test:
//
//   P0-1  /ai/icon, /ai/text, /ai/tts and /ai/music were mounted on the
//         merely-AUTHENTICATED router, outside the admin group. Any approved
//         player could spend the operator's paid AI quota. The per-route
//         limiter (30/min, music 4/min) bounds the RATE, not the bill, and a
//         limiter is not an authorization control.
//
//   P0-2  Eight packages guarded their admin group with
//             if h.adminOnly != nil { ar.Use(h.adminOnly) }
//         so wiring nil SILENTLY produced an admin surface with no
//         authorization whatsoever. It compiled. Nothing went red.
//
// The two tests below are the permanent guards. They are deliberately written
// against the SOURCE OF THE WIRING rather than against a live HTTP round trip,
// because the defect is structural: the route exists in the wrong group / the
// gate is optional. A request-level test would need an admin token, a player
// token and a running platform to say the same thing, and it would still miss
// a ninth package added next month — the walk below cannot.
//
// ⚠️ This file is one of the very few places in the repo where scanning source
// is the CORRECT instrument rather than the failure shape it usually is. The
// distinction: we are asserting the ABSENCE of a syntactic pattern that is
// unsafe by construction, across a set that grows. Asserting a call exists
// would prove nothing; asserting this pattern does NOT exist anywhere proves
// exactly the property we need, and a new package inherits the guard for free.

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Every package that mounts an admin-gated surface. Adding one here is cheap;
// forgetting to is caught by TestNoPackageMountsAnOptionalAdminGate, which
// walks the tree rather than reading this list.
var adminGatedPackages = []string{
	"ai", "approvelink", "combatenv", "contentoverlay",
	"curation", "invite", "opsenv", "platformarchive",
}

func internalDir(t *testing.T) string {
	t.Helper()
	// this file lives in internal/server
	return filepath.Join("..")
}

// isOptionalGate reports whether an AST node is `if <x>.adminOnly != nil`.
//
// ⚠️ WHY THE AST AND NOT A REGEX. The first version of this guard grepped for
// the string `if h.adminOnly != nil` — and went red on a clean tree, because
// the COMMENT this file's authors wrote to explain the defect quotes the
// defect verbatim. A text scan cannot tell code from prose about code. The AST
// sees only real `if` statements, so comments and string literals are inert.
func isOptionalGate(n ast.Node) bool {
	ifs, ok := n.(*ast.IfStmt)
	if !ok {
		return false
	}
	bin, ok := ifs.Cond.(*ast.BinaryExpr)
	if !ok || bin.Op != token.NEQ {
		return false
	}
	sel, ok := bin.X.(*ast.SelectorExpr)
	if !ok || sel.Sel.Name != "adminOnly" {
		return false
	}
	id, ok := bin.Y.(*ast.Ident)
	return ok && id.Name == "nil"
}

// P0-2 — the gate may not be optional in ANY package, including ones that do
// not exist yet. This walks; it does not consult adminGatedPackages.
func TestNoPackageMountsAnOptionalAdminGate(t *testing.T) {
	var offenders []string
	root := internalDir(t)
	fset := token.NewFileSet()
	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		file, parseErr := parser.ParseFile(fset, path, nil, parser.SkipObjectResolution)
		if parseErr != nil {
			return parseErr
		}
		ast.Inspect(file, func(n ast.Node) bool {
			if isOptionalGate(n) {
				offenders = append(offenders, path)
				return false
			}
			return true
		})
		return nil
	})
	if err != nil {
		t.Fatalf("walk internal/: %v", err)
	}
	if len(offenders) > 0 {
		t.Errorf(
			"an admin gate is written as OPTIONAL in %d file(s): %s\n"+
				"`if h.adminOnly != nil { ar.Use(h.adminOnly) }` means passing nil mounts an\n"+
				"admin surface with NO authorization, silently. Use `ar.Use(h.adminOnly)` and\n"+
				"panic on nil in NewHandlers instead.",
			len(offenders), strings.Join(offenders, ", "))
	}
}

// P0-2 — the constructor must refuse nil loudly. A gate that is merely
// "usually wired" is not a gate.
func TestEveryAdminPackagePanicsOnNilGate(t *testing.T) {
	root := internalDir(t)
	for _, pkg := range adminGatedPackages {
		path := filepath.Join(root, pkg, "handlers.go")
		src, err := os.ReadFile(path)
		if err != nil {
			t.Errorf("%s: %v", path, err)
			continue
		}
		if !strings.Contains(string(src), "adminOnly middleware is required") {
			t.Errorf(
				"%s: NewHandlers accepts a nil adminOnly without panicking.\n"+
					"Wiring nil must crash on boot, not mount an unguarded admin surface.",
				path)
		}
	}
}

// P0-1 — the four AI GENERATION routes cost real money. They must sit inside
// the admin group, not merely behind auth.
//
// Asserted by position: every /ai/ route must be registered on the group
// router (`ar.`), never on the bare authenticated router (`r.`). Moving one
// back out is exactly the defect, and it turns this red.
func TestAiGenerationRoutesAreAdminGated(t *testing.T) {
	path := filepath.Join(internalDir(t), "ai", "handlers.go")
	src, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("%s: %v", path, err)
	}
	text := string(src)

	// the paid endpoints, by the literal route string that ships
	paid := []string{`"/ai/icon"`, `"/ai/text"`, `"/ai/tts"`, `"/ai/music"`}

	for _, route := range paid {
		idx := strings.Index(text, route)
		if idx < 0 {
			t.Errorf("route %s no longer exists in ai/handlers.go — if it moved, move this guard with it", route)
			continue
		}
		// the registration call immediately precedes the route literal on its line
		lineStart := strings.LastIndex(text[:idx], "\n") + 1
		line := strings.TrimSpace(text[lineStart:idx])

		if strings.HasPrefix(line, "r.") {
			t.Errorf(
				"%s is registered on the bare authenticated router (%q).\n"+
					"That is P0-1 exactly: any approved player can spend the operator's paid\n"+
					"AI quota. Register it on the admin group router (ar.) instead.",
				route, line)
			continue
		}
		if !strings.HasPrefix(line, "ar.") {
			t.Errorf("%s is registered by an unrecognised router %q — expected `ar.` (the admin group)", route, line)
		}
	}

	// and the group itself must actually apply the gate
	if !strings.Contains(text, "ar.Use(h.adminOnly)") {
		t.Error("ai/handlers.go no longer applies adminOnly to its group — the routes are inside a group that gates nothing")
	}
}
