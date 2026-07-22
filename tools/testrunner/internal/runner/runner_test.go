package runner

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ggd/testrunner/internal/config"
	"github.com/ggd/testrunner/internal/scheduler"
)

// testRegistry runs real (tiny, portable) processes: `true`, `false`, `echo`.
func testRegistry(t *testing.T) *config.Registry {
	t.Helper()
	reg, err := config.Parse([]byte(`
suites:
  - {id: unit-echo, category: unit, cmd: ["echo", "hello-world"], enabled: true}
  - {id: unit-fails, category: unit, cmd: ["false"], enabled: true}
  - {id: reg-last, category: regression, cmd: ["echo", "regression-ran"], enabled: true}
`))
	require.NoError(t, err)
	return reg
}

func waitRun(t *testing.T, r *Run) Snapshot {
	t.Helper()
	select {
	case <-time.After(30 * time.Second):
		t.Fatal("run did not finish in time")
	case <-func() chan struct{} { ch := make(chan struct{}); go func() { r.Wait(); close(ch) }(); return ch }():
	}
	return r.Snapshot()
}

func TestRunAllExecutesAndReportsPerSuiteStatus(t *testing.T) {
	mgr := NewManager(testRegistry(t), Options{RepoRoot: t.TempDir(), GateCmd: []string{"true"}})
	run, err := mgr.Start(scheduler.Request{Mode: scheduler.ModeAll}, false)
	require.NoError(t, err)
	snap := waitRun(t, run)

	assert.Equal(t, StatusFail, snap.Status) // unit-fails fails the run
	byID := map[string]SuiteState{}
	for _, s := range snap.Suites {
		byID[s.Suite.ID] = s
	}
	assert.Equal(t, StatusPass, byID["unit-echo"].Status)
	assert.Equal(t, StatusFail, byID["unit-fails"].Status)
	assert.Equal(t, StatusPass, byID["reg-last"].Status)

	// Regression must have been the last executed suite.
	assert.Equal(t, "reg-last", snap.Suites[len(snap.Suites)-1].Suite.ID)

	// Event stream: suite-start/line/suite-end per suite, run-end last.
	evs, _, finished := run.Events(0)
	require.True(t, finished)
	require.NotEmpty(t, evs)
	last := evs[len(evs)-1]
	assert.Equal(t, EventRunEnd, last.Type)
	require.NotNil(t, last.Gate)
	assert.True(t, last.Gate.Ran, "gate must run for mode=all")
	assert.True(t, last.Gate.Ok)

	var sawEchoLine, sawRegressionAfterEcho bool
	echoSeq := int64(0)
	for _, ev := range evs {
		if ev.Type == EventLine && ev.SuiteID == "unit-echo" && ev.Text == "hello-world" {
			sawEchoLine = true
			echoSeq = ev.Seq
		}
		if ev.Type == EventLine && ev.SuiteID == "reg-last" && ev.Text == "regression-ran" && ev.Seq > echoSeq {
			sawRegressionAfterEcho = true
		}
	}
	assert.True(t, sawEchoLine, "stdout lines must stream as events")
	assert.True(t, sawRegressionAfterEcho, "regression output must come after unit output")
}

func TestGateRunsAfterRegressionAsFinalStep(t *testing.T) {
	dir := t.TempDir()
	marker := filepath.Join(dir, "gate-saw.ndjson")
	// A regression suite appends a beacon to $GGD_COVERAGE_FILE; the "gate"
	// (GateCmd + appended coverage path → $1) copies it to a marker. If the
	// marker contains the beacon, the gate ran AFTER regression and received
	// the per-run coverage file as its final argument.
	reg, err := config.Parse([]byte(`
suites:
  - {id: reg-touch, category: regression, cmd: ["sh", "-c", "echo '{\"cover\":\"x\"}' >> \"$GGD_COVERAGE_FILE\""], enabled: true}
`))
	require.NoError(t, err)
	mgr := NewManager(reg, Options{RepoRoot: dir, GateCmd: []string{"sh", "-c", `cp "$1" ` + marker, "gate"}})
	run, err := mgr.Start(scheduler.Request{Mode: scheduler.ModeAll}, false)
	require.NoError(t, err)
	snap := waitRun(t, run)

	require.NotNil(t, snap.Gate)
	assert.True(t, snap.Gate.Ran)
	assert.True(t, snap.Gate.Ok)
	assert.Equal(t, StatusPass, snap.Status)

	data, err := os.ReadFile(marker)
	require.NoError(t, err)
	assert.Contains(t, string(data), `{"cover":"x"}`)
}

func TestGateSkippedForPartialRuns(t *testing.T) {
	mgr := NewManager(testRegistry(t), Options{RepoRoot: t.TempDir(), GateCmd: []string{"true"}})
	run, err := mgr.Start(scheduler.Request{Mode: scheduler.ModeSuite, SuiteID: "unit-echo"}, false)
	require.NoError(t, err)
	snap := waitRun(t, run)

	assert.Equal(t, StatusPass, snap.Status)
	require.NotNil(t, snap.Gate)
	assert.False(t, snap.Gate.Ran, "gate is only meaningful for full runs")
	assert.Contains(t, snap.Gate.Reason, "mode=all")
}

func TestSteppedModeWaitsForNext(t *testing.T) {
	mgr := NewManager(testRegistry(t), Options{RepoRoot: t.TempDir(), GateCmd: []string{"true"}})
	run, err := mgr.Start(scheduler.Request{Mode: scheduler.ModeAll}, true)
	require.NoError(t, err)

	// Nothing starts until /next.
	time.Sleep(150 * time.Millisecond)
	snap := run.Snapshot()
	assert.Equal(t, StatusPending, snap.Suites[0].Status, "stepped run must wait for next before the first suite")

	for range snap.Suites {
		run.Next()
		time.Sleep(150 * time.Millisecond)
	}
	waitRun(t, run)
}

func TestCancelSkipsRemainingSuites(t *testing.T) {
	reg, err := config.Parse([]byte(`
suites:
  - {id: slow, category: unit, cmd: ["sleep", "30"], enabled: true}
  - {id: after, category: unit, cmd: ["echo", "should-not-run"], enabled: true}
`))
	require.NoError(t, err)
	mgr := NewManager(reg, Options{RepoRoot: t.TempDir(), GateCmd: []string{"true"}})
	run, err := mgr.Start(scheduler.Request{Mode: scheduler.ModeAll}, false)
	require.NoError(t, err)

	require.Eventually(t, func() bool {
		return run.Snapshot().Suites[0].Status == StatusRunning
	}, 10*time.Second, 20*time.Millisecond)

	start := time.Now()
	run.Cancel()
	snap := waitRun(t, run)
	assert.Less(t, time.Since(start), 15*time.Second, "cancel must kill the in-flight process")

	assert.Equal(t, StatusCancelled, snap.Status)
	assert.Equal(t, StatusFail, snap.Suites[0].Status, "in-flight suite is failed on cancel")
	assert.Equal(t, StatusSkip, snap.Suites[1].Status, "pending suites are skipped on cancel")
	require.NotNil(t, snap.Gate)
	assert.False(t, snap.Gate.Ran)
}

func TestRerunFailedPlansOnlyFailedSuites(t *testing.T) {
	mgr := NewManager(testRegistry(t), Options{RepoRoot: t.TempDir(), GateCmd: []string{"true"}})
	run, err := mgr.Start(scheduler.Request{Mode: scheduler.ModeAll}, false)
	require.NoError(t, err)
	waitRun(t, run)

	rerun, err := mgr.RerunFailed(run.ID)
	require.NoError(t, err)
	snap := waitRun(t, rerun)
	require.Len(t, snap.Suites, 1)
	assert.Equal(t, "unit-fails", snap.Suites[0].Suite.ID)

	// A run with no failures refuses a rerun.
	okReg, err := config.Parse([]byte(`
suites:
  - {id: ok, category: unit, cmd: ["true"], enabled: true}
`))
	require.NoError(t, err)
	mgr2 := NewManager(okReg, Options{RepoRoot: t.TempDir(), GateCmd: []string{"true"}})
	okRun, err := mgr2.Start(scheduler.Request{Mode: scheduler.ModeAll}, false)
	require.NoError(t, err)
	waitRun(t, okRun)
	_, err = mgr2.RerunFailed(okRun.ID)
	assert.Error(t, err)
}

func TestCoverageFileIsInjectedPerRun(t *testing.T) {
	reg, err := config.Parse([]byte(`
suites:
  - {id: env-echo, category: unit, cmd: ["sh", "-c", "echo COV=$GGD_COVERAGE_FILE"], enabled: true}
`))
	require.NoError(t, err)
	mgr := NewManager(reg, Options{RepoRoot: t.TempDir(), GateCmd: []string{"true"}})

	runA, err := mgr.Start(scheduler.Request{Mode: scheduler.ModeAll}, false)
	require.NoError(t, err)
	waitRun(t, runA)
	runB, err := mgr.Start(scheduler.Request{Mode: scheduler.ModeAll}, false)
	require.NoError(t, err)
	waitRun(t, runB)

	assert.NotEqual(t, runA.CoverageFile, runB.CoverageFile, "each run gets its own coverage file (per-run temp dir)")

	find := func(r *Run) string {
		evs, _, _ := r.Events(0)
		for _, ev := range evs {
			if ev.Type == EventLine && ev.SuiteID == "env-echo" {
				return ev.Text
			}
		}
		return ""
	}
	assert.Equal(t, "COV="+runA.CoverageFile, find(runA))
	assert.Equal(t, "COV="+runB.CoverageFile, find(runB))
}
