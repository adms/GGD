import { useEffect } from "react";
import { useStore } from "./store";

/** TODO↔test matrix: docs/todo/*.md items joined with the latest run's beacons. */
export function CoverageTab() {
  const coverage = useStore((s) => s.coverage);
  const loadCoverage = useStore((s) => s.loadCoverage);

  useEffect(() => {
    void loadCoverage();
  }, [loadCoverage]);

  if (!coverage) return <div className="empty">loading coverage…</div>;

  const files = [...new Set(coverage.items.map((i) => i.file))];
  const c = coverage.counts;

  return (
    <div className="coverage">
      <div className="coverage-summary">
        <span className="chip">{c.total ?? 0} items</span>
        <span className="chip chip-pass">{c.done ?? 0} done</span>
        <span className="chip chip-run">{c.covered ?? 0} covered</span>
        <span className={`chip ${c.doneUncovered ? "chip-fail" : "chip-pass"}`}>
          {c.doneUncovered ?? 0} done-but-uncovered
        </span>
        <span className="muted">
          {coverage.runId ? `beacons from ${coverage.runId}` : "no finished run yet — run all suites"}
        </span>
      </div>

      {files.map((file) => (
        <section key={file}>
          <h3>{file}</h3>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Item</th>
                <th>Test ID</th>
                <th>Category</th>
                <th>Status</th>
                <th>Covered</th>
              </tr>
            </thead>
            <tbody>
              {coverage.items
                .filter((i) => i.file === file)
                .map((i) => (
                  <tr key={i.id} className={i.status === "done" && !i.covered ? "row-bad" : ""}>
                    <td>{i.id}</td>
                    <td>{i.item}</td>
                    <td>
                      <code>{i.testId}</code>
                    </td>
                    <td>{i.category}</td>
                    <td>
                      <span className={`chip chip-status-${i.status}`}>{i.status}</span>
                    </td>
                    <td>{i.covered ? <span className="chip chip-pass">✓</span> : <span className="muted">—</span>}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
