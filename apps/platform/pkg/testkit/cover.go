// Package testkit contains test-only helpers for the Go platform.
//
// NOTE (deviation from the master plan): the plan placed the Go Cover helper at
// packages/shared/testkit/cover.go, but Go code must live inside the Go module,
// so it lives here at apps/platform/pkg/testkit. The emitted NDJSON format is
// identical to packages/shared/testkit/cover.ts.
package testkit

import (
	"fmt"
	"os"
	"sync"
	"testing"
)

var mu sync.Mutex

// Cover records that the TODO item with the given test_id was exercised by a
// passing test. When GGD_COVERAGE_FILE is set (by the test runner), a beacon
// line {"cover":"<id>"} is appended as NDJSON on test completion — only if the
// test passed, so the todo-check runtime gate cannot be satisfied by a failing
// test. No-op when the env var is unset.
func Cover(t *testing.T, id string) {
	t.Helper()
	file := os.Getenv("GGD_COVERAGE_FILE")
	if file == "" {
		return
	}
	t.Cleanup(func() {
		if t.Failed() || t.Skipped() {
			return
		}
		mu.Lock()
		defer mu.Unlock()
		// #nosec G703,G304 -- `file` is GGD_COVERAGE_FILE, set by the test runner
		// for its own child processes; it is an env var, not request data, so
		// reaching it already requires control of the process environment. This
		// helper is test-only and cannot be linked into a serving binary: Cover
		// takes a *testing.T and the package imports "testing", and every one of
		// the 49 importers of pkg/testkit under apps/platform is a _test.go file
		// — neither cmd/platform nor cmd/opstate pulls it in.
		//
		// 0o600 (was 0o644): the beacon is a throwaway NDJSON artefact written and
		// read by the same user, so nothing is locked out. This intentionally
		// diverges from the otherwise-identical tools/testrunner copy, which kept
		// 0644 to stay readable "without sudo" — same-uid access does not need it.
		f, err := os.OpenFile(file, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
		if err != nil {
			t.Logf("testkit.Cover: open %s: %v", file, err)
			return
		}
		defer f.Close()
		fmt.Fprintf(f, "{\"cover\":%q}\n", id)
	})
}
