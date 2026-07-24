package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// captureStdout swaps os.Stdout for a temp file, runs fn, and returns what was
// written to the real fd (runExport writes via os.Stdout.Write, not a logger).
func captureStdout(t *testing.T, fn func() error) ([]byte, error) {
	t.Helper()
	tmp, err := os.CreateTemp(t.TempDir(), "stdout")
	if err != nil {
		t.Fatalf("temp: %v", err)
	}
	orig := os.Stdout
	os.Stdout = tmp
	runErr := fn()
	os.Stdout = orig
	if err := tmp.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}
	raw, err := os.ReadFile(tmp.Name())
	if err != nil {
		t.Fatalf("read back: %v", err)
	}
	return raw, runErr
}

// TestExportToStdoutEmitsOnlyTheBundle is the regression for a silent corruption:
// with -out - the bundle goes to stdout, and the human summary was printed to
// stdout too, immediately after it. So
//
//	opstate export -out - > bundle.json
//
// produced JSON followed by "✓ exported stdout (N bytes)" and the
// parts/whitelist/notes/warnings block — a structurally invalid bundle, every
// time, with the tool still exiting 0. The -json path escaped it only because it
// returns early. This is the natural inverse of the documented
// `docker compose exec -T platform /opstate restore -in -` pattern, so it is the
// shape an operator reaches for to pull state OFF the family host.
func TestExportToStdoutEmitsOnlyTheBundle(t *testing.T) {
	dataDir := filepath.Join(t.TempDir(), "data")
	if err := os.MkdirAll(dataDir, 0o750); err != nil {
		t.Fatalf("mkdir: %v", err)
	}

	raw, err := captureStdout(t, func() error {
		return runExport([]string{"-data", dataDir, "-out", "-", "-allow-empty"})
	})
	if err != nil {
		t.Fatalf("runExport: %v", err)
	}

	if !json.Valid(raw) {
		t.Fatalf("stdout is not valid JSON — the bundle is corrupted by the human summary.\ngot: %s", raw)
	}
	if strings.Contains(string(raw), "✓ exported") {
		t.Errorf("the human summary leaked into the bundle stream:\n%s", raw)
	}

	// And it really is the bundle, not an empty document.
	var bundle map[string]any
	if err := json.Unmarshal(raw, &bundle); err != nil {
		t.Fatalf("unmarshal bundle: %v", err)
	}
	if len(bundle) == 0 {
		t.Error("expected a non-empty bundle on stdout")
	}
}

// TestExportToStdoutReportsWriteFailure covers the discarded error: this is the
// carrier of the whole operator state (with -parts accounts it contains password
// hashes verbatim). On a short write the tool used to print "✓ exported" and exit
// 0, leaving truncation to surface much later as a restore-side checksum failure.
func TestExportToStdoutReportsWriteFailure(t *testing.T) {
	dataDir := filepath.Join(t.TempDir(), "data")
	if err := os.MkdirAll(dataDir, 0o750); err != nil {
		t.Fatalf("mkdir: %v", err)
	}

	// A closed pipe read end makes every write to os.Stdout fail (EPIPE/EBADF),
	// which is exactly the redirect-to-a-full-disk / broken-pipe case.
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatalf("pipe: %v", err)
	}
	if err := r.Close(); err != nil {
		t.Fatalf("close read end: %v", err)
	}
	if err := w.Close(); err != nil {
		t.Fatalf("close write end: %v", err)
	}

	orig := os.Stdout
	os.Stdout = w
	runErr := runExport([]string{"-data", dataDir, "-out", "-", "-allow-empty"})
	os.Stdout = orig

	if runErr == nil {
		t.Fatal("a failed write of the operator-state bundle must be reported, not discarded")
	}
	if !strings.Contains(runErr.Error(), "stdout") {
		t.Errorf("error should name the failed sink, got: %v", runErr)
	}
}
