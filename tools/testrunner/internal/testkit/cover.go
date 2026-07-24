// Package testkit provides the Go-side test-coverage beacon, mirroring
// packages/shared/testkit/cover.ts (and the planned apps/platform/pkg/testkit).
//
// A test calls testkit.Cover(t, "infra-single-writer") to record that the TODO
// item with that test_id was exercised. When GGD_COVERAGE_FILE is set (the
// runner sets it per run), beacons are appended as NDJSON lines of the form
// {"cover":"<test_id>"}; `pnpm todo:runtime <file>` then fails the build if any
// TODO item marked `done` was never covered.
package testkit

import (
	"encoding/json"
	"os"
	"testing"
)

// Cover records that a TODO item's test executed. No-op unless
// GGD_COVERAGE_FILE is set. Appends are O_APPEND-atomic per line, so parallel
// test binaries may share one file.
func Cover(t testing.TB, testID string) {
	t.Helper()
	file := os.Getenv("GGD_COVERAGE_FILE")
	if file == "" {
		return
	}
	line, err := json.Marshal(map[string]string{"cover": testID})
	if err != nil {
		t.Fatalf("testkit.Cover: marshal: %v", err)
	}
	// #nosec G703,G304,G302 -- `file` is GGD_COVERAGE_FILE, set by this same
	// test runner for its own child processes; it is never attacker-supplied.
	// The beacon is an append-only NDJSON artefact that CI reads and throws
	// away, so 0644 is deliberate: a developer must be able to read it after
	// a failing run without sudo.
	f, err := os.OpenFile(file, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		t.Fatalf("testkit.Cover: open %s: %v", file, err)
	}
	defer f.Close()
	if _, err := f.Write(append(line, '\n')); err != nil {
		t.Fatalf("testkit.Cover: write: %v", err)
	}
}
