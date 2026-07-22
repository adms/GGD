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
		f, err := os.OpenFile(file, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
		if err != nil {
			t.Logf("testkit.Cover: open %s: %v", file, err)
			return
		}
		defer f.Close()
		fmt.Fprintf(f, "{\"cover\":%q}\n", id)
	})
}
