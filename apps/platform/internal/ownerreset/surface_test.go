// surface_test.go asserts what the reset must NEVER become.
//
// The capability here — replace any administrator's password, unban them,
// approve them — is the most dangerous one in this repo. It is safe for exactly
// one reason: reaching it requires a shell on the host. Every property that
// keeps that true is structural rather than behavioural, so it is pinned by
// reading the source, in the same spirit (and style) as
// internal/server/devsurface_test.go.
//
// Three things must stay true:
//
//  1. THE SERVING BINARY DOES NOT LINK THIS PACKAGE. Not "the routes are
//     guarded" — absent. A capability that is not compiled into the process
//     listening on :8080 cannot be reached by any request, any header, any
//     proxy hop, or any future handler someone adds in a hurry.
//  2. NOTHING HERE READS A CALLER ADDRESS. If an HTTP entry point is ever
//     argued for, "the request came from 127.0.0.1" must not be the argument:
//     the LAN-published vite dev server launders every phone on the wifi into
//     127.0.0.1 as this binary sees it, so loopback here means "anyone on the
//     network". Same ban, same reason, as internal/{auth,admin,server}.
//  3. NO FLAG ACCEPTS A PASSWORD. argv is world-readable via `ps` and lands in
//     shell history; a flag that took one would leak the credential before the
//     command had done anything at all.
package ownerreset_test

import (
	"bytes"
	"go/parser"
	"go/printer"
	"go/token"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/platform/pkg/testkit"
)

// resetPkgPath is the import path an HTTP-serving package must never name.
const resetPkgPath = `"github.com/ggd/platform/internal/ownerreset"`

// allowedImporters are the only places that may import the reset package: the
// command an operator runs, and this package's own tests.
var allowedImporters = []string{
	filepath.Join("cmd", "ownerreset"),
	filepath.Join("internal", "ownerreset"),
}

// platformRoot walks up from internal/ownerreset to apps/platform.
func platformRoot(t *testing.T) string {
	t.Helper()
	wd, err := os.Getwd() // .../apps/platform/internal/ownerreset
	require.NoError(t, err)
	return filepath.Dir(filepath.Dir(wd))
}

// goFiles returns every .go file under root, with its path relative to root.
func goFiles(t *testing.T, root string) map[string]string {
	t.Helper()
	out := map[string]string{}
	require.NoError(t, filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() || !strings.HasSuffix(path, ".go") {
			return nil
		}
		rel, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		body, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		out[rel] = string(body)
		return nil
	}))
	require.NotEmpty(t, out, "found no Go files under %s — this guard would be vacuous", root)
	return out
}

// ownerreset-not-an-endpoint: only the operator's own command links the reset.
// The platform binary cannot expose what it does not compile.
func TestOnlyTheCommandLinksTheReset(t *testing.T) {
	testkit.Cover(t, "ownerreset-not-an-endpoint")
	root := platformRoot(t)
	checked := 0
	for rel, src := range goFiles(t, root) {
		allowed := false
		for _, dir := range allowedImporters {
			if strings.HasPrefix(rel, dir+string(filepath.Separator)) {
				allowed = true
				break
			}
		}
		if allowed {
			continue
		}
		checked++
		assert.NotContains(t, src, resetPkgPath,
			"%s imports internal/ownerreset — the host-side password reset must not be linked into "+
				"anything that serves HTTP (see this file's header)", rel)
	}
	require.Greater(t, checked, 20, "the scan covered suspiciously few files")

	// The positive half: the command really does use it, so the ban above is
	// about placement rather than about the package being dead.
	main, err := os.ReadFile(filepath.Join(root, "cmd", "ownerreset", "main.go"))
	require.NoError(t, err, "cmd/ownerreset moved — re-point this guard")
	assert.Contains(t, string(main), resetPkgPath)
}

// forbiddenAddressTokens mirrors internal/server/devsurface_test.go's list. The
// reset decides who may replace an administrator's credential; if it ever grew
// an HTTP face, an address must not be what authorises it.
var forbiddenAddressTokens = []string{
	"X-Real-Ip", "X-Real-IP", "x-real-ip",
	"X-Forwarded-For", "x-forwarded-for",
	"httpx.ClientIP", "RemoteAddr", "IsLoopback", "127.0.0.1", "::1",
}

// codeWithoutComments returns a file's Go source with every comment stripped.
//
// The ban below is on CODE, not on prose. Both files here explain at length WHY
// a loopback check is the wrong answer on this binary — that explanation is the
// most valuable thing in them and must not be what trips the guard. Stripping
// via the parser rather than a regex means a token cannot hide inside a comment
// that only LOOKS like a comment either.
func codeWithoutComments(t *testing.T, path string) string {
	t.Helper()
	fset := token.NewFileSet()
	// No parser.ParseComments: with the flag off the parser attaches no comment
	// groups at all, so the printer cannot re-emit them. (Clearing f.Comments
	// afterwards is NOT enough — the printer also prints each declaration's own
	// Doc field.)
	f, err := parser.ParseFile(fset, path, nil, 0)
	require.NoError(t, err, "parse %s", path)
	var buf bytes.Buffer
	require.NoError(t, printer.Fprint(&buf, fset, f))
	return buf.String()
}

// ownerreset-not-an-endpoint: the reset never reads a caller address, and never
// learns what loopback looks like.
func TestResetNeverReadsACallerAddress(t *testing.T) {
	testkit.Cover(t, "ownerreset-not-an-endpoint")
	root := platformRoot(t)
	for _, dir := range allowedImporters {
		entries, err := os.ReadDir(filepath.Join(root, dir))
		require.NoError(t, err, "%s must exist", dir)
		checked := 0
		for _, e := range entries {
			name := e.Name()
			// Test files are exempt: THIS file names every forbidden token.
			if e.IsDir() || !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
				continue
			}
			code := codeWithoutComments(t, filepath.Join(root, dir, name))
			checked++
			for _, tok := range forbiddenAddressTokens {
				// assert.False rather than NotContains: a failure here should
				// name the token, not dump the whole file into the test output.
				assert.False(t, strings.Contains(code, tok),
					"%s/%s references %q in CODE — authority here is a shell on the host, never an address", dir, name, tok)
			}
		}
		require.Greater(t, checked, 0, "%s had no non-test .go files to check", dir)
	}
}

// passwordFlagRe catches any attempt to define a flag whose NAME is
// password-shaped, in any of flag's declaration forms.
var passwordFlagRe = regexp.MustCompile(`flag\.(String|StringVar)\((?:&\w+,\s*)?"[^"]*(?i:pass|pw|secret|credential)[^"]*"`)

// ownerreset-no-password-leak: the command defines no flag that could carry a
// password, and it refuses one BEFORE flag.Parse — by the time flag would
// complain, the secret is already in the shell history and in `ps`.
func TestTheCommandDefinesNoPasswordFlag(t *testing.T) {
	testkit.Cover(t, "ownerreset-no-password-leak")
	root := platformRoot(t)
	body, err := os.ReadFile(filepath.Join(root, "cmd", "ownerreset", "main.go"))
	require.NoError(t, err, "cmd/ownerreset moved — re-point this guard")
	src := string(body)

	assert.NotRegexp(t, passwordFlagRe, src,
		"cmd/ownerreset must define NO flag that accepts a password (see this file's header)")

	reject := strings.Index(src, "ownerreset.RejectPasswordArg(os.Args[1:])")
	parse := strings.Index(src, "flag.Parse()")
	require.Greater(t, reject, 0, "the password-flag refusal is gone from cmd/ownerreset")
	require.Greater(t, parse, 0, "cmd/ownerreset no longer parses flags — re-point this guard")
	assert.Less(t, reject, parse,
		"RejectPasswordArg must run BEFORE flag.Parse, so `-password …` gets the explanation rather than a parse error")

	// The password reaches the reset as a struct field, never as an argument the
	// operating system can show to other users.
	assert.NotContains(t, src, "flag.Args()", "positional arguments must not be used to smuggle a password")
}
