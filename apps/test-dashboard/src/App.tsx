import { useEffect } from "react";
import { CoverageTab } from "./CoverageTab";
import { groupByCategory, useStore } from "./store";
import type { SuiteState } from "./types";

const statusChip = (status: string) => <span className={`chip chip-status-${status}`}>{status}</span>;

export function App() {
  const s = useStore();

  useEffect(() => {
    void s.init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups = groupByCategory(s.suites, s.categoryOrder);
  const running = s.run?.status === "running";
  const failed = s.run?.suites.some((x) => x.status === "fail") ?? false;
  const stateOf = (id: string): SuiteState | undefined => s.run?.suites.find((x) => x.suite.id === id);

  return (
    <div className="app">
      <header>
        <h1>
          GGD test dashboard <span className="muted">· regression always runs last</span>
        </h1>
        <div className="toolbar">
          <button disabled={running || !s.connected} onClick={() => void s.startRun({ mode: "all" })}>
            ▶ Run all
          </button>
          <button
            disabled={running || !s.connected}
            onClick={() => void s.startRun({ mode: "all", stepped: true })}
            title="creates the run paused; use Next to advance suite by suite"
          >
            ⏯ Step mode
          </button>
          <button disabled={!running || !s.run?.stepped} onClick={() => void s.next()}>
            ⏭ Next
          </button>
          <button disabled={!running} onClick={() => void s.cancel()}>
            ■ Cancel
          </button>
          <button disabled={running || !failed} onClick={() => void s.rerunFailed()}>
            ↻ Re-run failed
          </button>
        </div>
        <div className="tabs">
          <button className={s.tab === "runs" ? "tab active" : "tab"} onClick={() => s.setTab("runs")}>
            Runs
          </button>
          <button
            className={s.tab === "coverage" ? "tab active" : "tab"}
            onClick={() => s.setTab("coverage")}
          >
            Coverage
          </button>
        </div>
      </header>

      {s.error && <div className="error">{s.error}</div>}
      {!s.connected && (
        <div className="empty">
          runner unreachable — start it with <code>cd tools/testrunner && go run ./cmd/testrunner</code>
        </div>
      )}

      {s.tab === "coverage" ? (
        <CoverageTab />
      ) : (
        <main className="columns">
          <div className="suites">
            {s.run && (
              <div className="runbar">
                run <code>{s.run.id}</code> {statusChip(s.run.status)}
                {s.run.gate &&
                  s.run.status !== "running" &&
                  (s.run.gate.ran ? (
                    <span className={`chip ${s.run.gate.ok ? "chip-pass" : "chip-fail"}`}>
                      todo-gate {s.run.gate.ok ? "pass" : "FAIL"}
                    </span>
                  ) : (
                    <span className="chip" title={s.run.gate.reason}>
                      todo-gate skipped
                    </span>
                  ))}
              </div>
            )}
            {groups.map((g) => (
              <section key={g.category}>
                <h2>
                  {g.category}
                  {g.category === "regression" && <span className="badge">runs last</span>}
                  <button
                    className="mini"
                    disabled={running || !s.connected}
                    onClick={() => void s.startRun({ mode: "category", category: g.category })}
                  >
                    run category
                  </button>
                </h2>
                <ul>
                  {g.suites.map((suite) => {
                    const st = stateOf(suite.id);
                    return (
                      <li
                        key={suite.id}
                        className={s.selectedSuite === suite.id ? "suite selected" : "suite"}
                        onClick={() => s.selectSuite(suite.id)}
                        title={suite.comment ?? suite.name}
                      >
                        <span className="suite-name">
                          {suite.name}
                          {!suite.enabled && <span className="muted"> (disabled)</span>}
                        </span>
                        <span className="suite-meta">
                          {st ? statusChip(st.status) : statusChip(suite.enabled ? "idle" : "off")}
                          {st?.durationMs ? <span className="muted">{st.durationMs}ms</span> : null}
                          <button
                            className="mini"
                            disabled={running || !suite.enabled || !s.connected}
                            onClick={(e) => {
                              e.stopPropagation();
                              void s.startRun({ mode: "suite", suiteId: suite.id });
                            }}
                          >
                            run
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>

          <div className="logpane">
            <h2>
              log {s.selectedSuite ? <code>{s.selectedSuite}</code> : <span className="muted">(select a suite)</span>}
            </h2>
            <pre>
              {(s.selectedSuite ? (s.logs[s.selectedSuite] ?? []) : []).join("\n") ||
                "no output yet"}
            </pre>
            {s.run?.gate?.output && (
              <>
                <h2>todo-gate</h2>
                <pre>{s.run.gate.output}</pre>
              </>
            )}
          </div>
        </main>
      )}
    </div>
  );
}
