// Package runner executes planned suites and streams structured events.
//
// Safety properties:
//   - Allow-list only: a Run is created from a scheduler.Request which resolves
//     suite IDs against suites.yaml. No API surface accepts commands.
//   - argv exec: commands run via os/exec (no shell interpolation, ever).
//   - Per-run isolation: each run gets its own temp dir; GGD_COVERAGE_FILE
//     points at a per-run NDJSON shared by every suite of that run.
//
// Coverage gate placement: after ALL suites — including the regression phase,
// which the scheduler pins last — the runner executes the todo-check runtime
// gate (`pnpm todo:runtime <coverage.ndjson>` at the repo root) as the very
// last automatic step and folds its verdict into the run-end event. Running it
// after regression (rather than before) keeps "the gate sees every beacon the
// run produced" trivially true. The gate only runs for mode=all: a partial run
// (single suite/category/rerun-failed) can never cover every `done` item, so a
// failing gate verdict there would be noise, not signal.
package runner

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/ggd/testrunner/internal/config"
	"github.com/ggd/testrunner/internal/scheduler"
)

// Suite / run statuses.
const (
	StatusPending   = "pending"
	StatusRunning   = "running"
	StatusPass      = "pass"
	StatusFail      = "fail"
	StatusSkip      = "skip"
	StatusCancelled = "cancelled" // run-level only
)

// Event types streamed over SSE.
const (
	EventSuiteStart = "suite-start"
	EventLine       = "line"
	EventSuiteEnd   = "suite-end"
	EventRunEnd     = "run-end"
)

// Event is one streamed occurrence within a run.
type Event struct {
	Seq        int64       `json:"seq"`
	Type       string      `json:"type"`
	SuiteID    string      `json:"suiteId,omitempty"`
	Stream     string      `json:"stream,omitempty"` // stdout|stderr (line events)
	Text       string      `json:"text,omitempty"`
	Status     string      `json:"status,omitempty"` // suite-end: pass|fail|skip; run-end: pass|fail|cancelled
	ExitCode   *int        `json:"exitCode,omitempty"`
	DurationMs int64       `json:"durationMs,omitempty"`
	Gate       *GateResult `json:"gate,omitempty"`
	At         time.Time   `json:"at"`
}

// GateResult is the todo-check runtime gate verdict attached to run-end.
type GateResult struct {
	Ran      bool   `json:"ran"`
	Ok       bool   `json:"ok"`
	ExitCode int    `json:"exitCode"`
	Output   string `json:"output,omitempty"`
	Reason   string `json:"reason,omitempty"` // why the gate was skipped
}

// SuiteState is per-suite progress inside a run.
type SuiteState struct {
	Suite      config.Suite `json:"suite"`
	Status     string       `json:"status"`
	ExitCode   *int         `json:"exitCode,omitempty"`
	DurationMs int64        `json:"durationMs"`
}

// Snapshot is the JSON view of a run (GET /api/runs/{id}).
type Snapshot struct {
	ID           string       `json:"id"`
	Mode         string       `json:"mode"`
	Category     string       `json:"category,omitempty"`
	Stepped      bool         `json:"stepped"`
	Status       string       `json:"status"`
	Suites       []SuiteState `json:"suites"`
	Gate         *GateResult  `json:"gate,omitempty"`
	CoverageFile string       `json:"coverageFile"`
	CreatedAt    time.Time    `json:"createdAt"`
}

// Run is one execution of a plan.
type Run struct {
	ID           string
	Mode         string
	Category     string
	Stepped      bool
	CoverageFile string
	CreatedAt    time.Time

	mu     sync.Mutex
	seq    int64
	events []Event
	notify chan struct{} // closed+replaced on every emit
	suites []*SuiteState
	status string
	gate   *GateResult
	cancel context.CancelFunc
	nextCh chan struct{}
	done   chan struct{}
}

// Options configures a Manager.
type Options struct {
	RepoRoot string
	// GateCmd is the todo runtime gate argv; the coverage file path is
	// appended. Defaults to ["pnpm", "todo:runtime"]. Overridable for tests.
	GateCmd []string
	// ExtraEnv is merged into every suite process (after suite env).
	ExtraEnv map[string]string
}

// Manager owns runs.
type Manager struct {
	mu   sync.Mutex
	runs map[string]*Run
	ord  []string // creation order
	reg  *config.Registry
	opts Options
}

// NewManager creates a Manager over a validated registry.
func NewManager(reg *config.Registry, opts Options) *Manager {
	if len(opts.GateCmd) == 0 {
		opts.GateCmd = []string{"pnpm", "todo:runtime"}
	}
	return &Manager{runs: map[string]*Run{}, reg: reg, opts: opts}
}

// Registry returns the allow-list registry backing this manager.
func (m *Manager) Registry() *config.Registry { return m.reg }

// Start plans and launches a run. Suite selection goes through the scheduler
// (allow-list + regression-last ordering).
func (m *Manager) Start(req scheduler.Request, stepped bool) (*Run, error) {
	suites, err := scheduler.Plan(m.reg, req)
	if err != nil {
		return nil, err
	}

	tempDir, err := os.MkdirTemp("", "ggd-testrun-*")
	if err != nil {
		return nil, fmt.Errorf("create run temp dir: %w", err)
	}

	r := &Run{
		ID:           newRunID(),
		Mode:         req.Mode,
		Category:     req.Category,
		Stepped:      stepped,
		CoverageFile: filepath.Join(tempDir, "coverage.ndjson"),
		CreatedAt:    time.Now(),
		notify:       make(chan struct{}),
		status:       StatusRunning,
		nextCh:       make(chan struct{}, 1),
		done:         make(chan struct{}),
	}
	for _, s := range suites {
		r.suites = append(r.suites, &SuiteState{Suite: s, Status: StatusPending})
	}

	ctx, cancel := context.WithCancel(context.Background())
	r.cancel = cancel

	m.mu.Lock()
	m.runs[r.ID] = r
	m.ord = append(m.ord, r.ID)
	m.mu.Unlock()

	go m.execute(ctx, r)
	return r, nil
}

// Get returns a run by id.
func (m *Manager) Get(id string) (*Run, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	r, ok := m.runs[id]
	return r, ok
}

// List returns runs, newest first.
func (m *Manager) List() []*Run {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]*Run, 0, len(m.ord))
	for i := len(m.ord) - 1; i >= 0; i-- {
		out = append(out, m.runs[m.ord[i]])
	}
	return out
}

// LatestFinished returns the most recent run that completed (any verdict).
func (m *Manager) LatestFinished() (*Run, bool) {
	for _, r := range m.List() {
		if r.Finished() {
			return r, true
		}
	}
	return nil, false
}

// RerunFailed starts a new run containing the failed suites of a previous run.
func (m *Manager) RerunFailed(id string) (*Run, error) {
	src, ok := m.Get(id)
	if !ok {
		return nil, fmt.Errorf("unknown run %q", id)
	}
	if !src.Finished() {
		return nil, fmt.Errorf("run %q has not finished", id)
	}
	var ids []string
	src.mu.Lock()
	for _, st := range src.suites {
		if st.Status == StatusFail {
			ids = append(ids, st.Suite.ID)
		}
	}
	src.mu.Unlock()
	if len(ids) == 0 {
		return nil, fmt.Errorf("run %q has no failed suites", id)
	}
	return m.Start(scheduler.Request{Mode: scheduler.ModeIDs, IDs: ids}, false)
}

// Next advances a stepped run to its next suite (no-op queue of depth 1).
func (r *Run) Next() {
	select {
	case r.nextCh <- struct{}{}:
	default:
	}
}

// Cancel stops the run: the in-flight suite is killed, pending suites skip.
func (r *Run) Cancel() { r.cancel() }

// Finished reports whether the run reached a terminal state.
func (r *Run) Finished() bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.status != StatusRunning
}

// Wait blocks until the run finishes (CLI mode).
func (r *Run) Wait() { <-r.done }

// Snapshot returns the JSON view of the run.
func (r *Run) Snapshot() Snapshot {
	r.mu.Lock()
	defer r.mu.Unlock()
	suites := make([]SuiteState, len(r.suites))
	for i, st := range r.suites {
		suites[i] = *st
	}
	return Snapshot{
		ID: r.ID, Mode: r.Mode, Category: r.Category, Stepped: r.Stepped,
		Status: r.status, Suites: suites, Gate: r.gate,
		CoverageFile: r.CoverageFile, CreatedAt: r.CreatedAt,
	}
}

// Events returns buffered events from index `from`, plus a channel that is
// closed on the next emit, plus whether the run is finished. This replay-based
// subscription is lossless: SSE handlers page through the buffer and wait on
// the notify channel when caught up.
func (r *Run) Events(from int) (evs []Event, changed <-chan struct{}, finished bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if from < len(r.events) {
		evs = make([]Event, len(r.events)-from)
		copy(evs, r.events[from:])
	}
	return evs, r.notify, r.status != StatusRunning
}

func (r *Run) emit(ev Event) {
	r.mu.Lock()
	r.seq++
	ev.Seq = r.seq
	ev.At = time.Now()
	r.events = append(r.events, ev)
	close(r.notify)
	r.notify = make(chan struct{})
	r.mu.Unlock()
}

func (m *Manager) execute(ctx context.Context, r *Run) {
	defer close(r.done)

	cancelled := false
	for _, st := range r.suites {
		if r.Stepped && !cancelled {
			// Stepped mode: every suite (including the first) waits for
			// POST /api/runs/{id}/next.
			select {
			case <-ctx.Done():
				cancelled = true
			case <-r.nextCh:
			}
		}
		if ctx.Err() != nil {
			cancelled = true
		}
		if cancelled {
			r.mu.Lock()
			st.Status = StatusSkip
			r.mu.Unlock()
			r.emit(Event{Type: EventSuiteEnd, SuiteID: st.Suite.ID, Status: StatusSkip, Text: "skipped: run cancelled"})
			continue
		}
		m.runSuite(ctx, r, st)
	}

	// ---- Final automatic step: todo-check runtime gate (see package doc). ----
	gate := &GateResult{}
	switch {
	case cancelled:
		gate.Reason = "run cancelled"
	case r.Mode != scheduler.ModeAll:
		gate.Reason = "gate only runs after a full run (mode=all)"
	default:
		m.runGate(ctx, r, gate)
	}

	status := StatusPass
	r.mu.Lock()
	for _, st := range r.suites {
		if st.Status == StatusFail {
			status = StatusFail
		}
	}
	if gate.Ran && !gate.Ok {
		status = StatusFail
	}
	if cancelled {
		status = StatusCancelled
	}
	r.status = status
	r.gate = gate
	r.mu.Unlock()

	r.emit(Event{Type: EventRunEnd, Status: status, Gate: gate})
}

func (m *Manager) runSuite(ctx context.Context, r *Run, st *SuiteState) {
	s := st.Suite
	r.mu.Lock()
	st.Status = StatusRunning
	r.mu.Unlock()
	r.emit(Event{Type: EventSuiteStart, SuiteID: s.ID})

	start := time.Now()
	// Allow-list: s came from suites.yaml via the scheduler; argv exec, no shell.
	// #nosec G204 -- argv exec (no shell) and `s` is an allow-listed suite
	// from the checked-in suites.yaml; running those commands IS the job.
	cmd := exec.CommandContext(ctx, s.Cmd[0], s.Cmd[1:]...)
	cmd.Dir = filepath.Join(m.opts.RepoRoot, s.Cwd)
	cmd.Env = m.suiteEnv(r, s)
	cmd.WaitDelay = 5 * time.Second
	setProcAttr(cmd)

	var wg sync.WaitGroup
	stdout, err1 := cmd.StdoutPipe()
	stderr, err2 := cmd.StderrPipe()
	if err1 != nil || err2 != nil {
		m.finishSuite(r, st, StatusFail, nil, start, fmt.Sprintf("pipe error: %v %v", err1, err2))
		return
	}
	if err := cmd.Start(); err != nil {
		m.finishSuite(r, st, StatusFail, nil, start, fmt.Sprintf("start error: %v", err))
		return
	}
	stream := func(name string, rd interface{ Read([]byte) (int, error) }) {
		defer wg.Done()
		sc := bufio.NewScanner(rd)
		sc.Buffer(make([]byte, 64*1024), 1024*1024)
		for sc.Scan() {
			r.emit(Event{Type: EventLine, SuiteID: s.ID, Stream: name, Text: truncate(sc.Text(), 8192)})
		}
	}
	wg.Add(2)
	go stream("stdout", stdout)
	go stream("stderr", stderr)
	wg.Wait()
	err := cmd.Wait()

	exit := 0
	if cmd.ProcessState != nil {
		exit = cmd.ProcessState.ExitCode()
	}
	switch {
	case ctx.Err() != nil:
		m.finishSuite(r, st, StatusFail, &exit, start, "cancelled")
	case err == nil:
		m.finishSuite(r, st, StatusPass, &exit, start, "")
	default:
		m.finishSuite(r, st, StatusFail, &exit, start, "")
	}
}

func (m *Manager) finishSuite(r *Run, st *SuiteState, status string, exit *int, start time.Time, note string) {
	dur := time.Since(start).Milliseconds()
	r.mu.Lock()
	st.Status = status
	st.ExitCode = exit
	st.DurationMs = dur
	r.mu.Unlock()
	r.emit(Event{Type: EventSuiteEnd, SuiteID: st.Suite.ID, Status: status, ExitCode: exit, DurationMs: dur, Text: note})
}

func (m *Manager) runGate(ctx context.Context, r *Run, gate *GateResult) {
	if _, err := os.Stat(r.CoverageFile); err != nil {
		// No suite emitted a beacon — still run the gate: it will fail if any
		// TODO item is `done`, which is exactly the point. Create empty file.
		// #nosec G306 -- see testkit.Cover: the beacon is a throwaway CI artefact
		// that a developer must be able to read after a failing run.
		_ = os.WriteFile(r.CoverageFile, nil, 0o644)
	}
	argv := append(append([]string{}, m.opts.GateCmd...), r.CoverageFile)
	// #nosec G204 -- argv exec; GateCmd is this tool's own configured gate.
	cmd := exec.CommandContext(ctx, argv[0], argv[1:]...)
	cmd.Dir = m.opts.RepoRoot
	cmd.Env = m.suiteEnv(r, config.Suite{})
	cmd.WaitDelay = 5 * time.Second
	out, err := cmd.CombinedOutput()
	gate.Ran = true
	gate.Ok = err == nil
	if cmd.ProcessState != nil {
		gate.ExitCode = cmd.ProcessState.ExitCode()
	}
	gate.Output = truncate(string(out), 64*1024)
	for _, line := range strings.Split(strings.TrimRight(gate.Output, "\n"), "\n") {
		r.emit(Event{Type: EventLine, SuiteID: "todo-gate", Stream: "stdout", Text: line})
	}
}

func (m *Manager) suiteEnv(r *Run, s config.Suite) []string {
	env := os.Environ()
	env = append(env, "NO_COLOR=1")
	keys := make([]string, 0, len(s.Env))
	for k := range s.Env {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		env = append(env, k+"="+s.Env[k])
	}
	ekeys := make([]string, 0, len(m.opts.ExtraEnv))
	for k := range m.opts.ExtraEnv {
		ekeys = append(ekeys, k)
	}
	sort.Strings(ekeys)
	for _, k := range ekeys {
		env = append(env, k+"="+m.opts.ExtraEnv[k])
	}
	// Last wins: the per-run coverage file is not overridable by suite env.
	env = append(env, "GGD_COVERAGE_FILE="+r.CoverageFile)
	return env
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…(truncated)"
}

func newRunID() string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return fmt.Sprintf("run-%d-%s", time.Now().UnixMilli(), hex.EncodeToString(b))
}
