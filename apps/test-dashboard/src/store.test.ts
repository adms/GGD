import { describe, expect, it } from "vitest";
import { appendFileSync } from "node:fs";
import { applyEvent, appendLog, groupByCategory, MAX_LOG_LINES } from "./store";
import type { RunnerEvent, RunSnapshot, Suite } from "./types";

/**
 * Coverage beacon — same NDJSON contract as packages/shared/testkit/cover.ts
 * (local copy: that helper is not part of @ggd/shared's public exports).
 */
function cover(testId: string): void {
  const file = process.env.GGD_COVERAGE_FILE;
  if (!file) return;
  appendFileSync(file, JSON.stringify({ cover: testId }) + "\n");
}

const suite = (id: string, category: string): Suite => ({
  id,
  name: id,
  category,
  cwd: ".",
  cmd: ["true"],
  parallelSafe: false,
  enabled: true,
});

const baseRun = (): RunSnapshot => ({
  id: "run-1",
  mode: "all",
  stepped: false,
  status: "running",
  suites: [
    { suite: suite("unit-a", "unit"), status: "pending", durationMs: 0 },
    { suite: suite("reg-z", "regression"), status: "pending", durationMs: 0 },
  ],
  coverageFile: "/tmp/cov.ndjson",
  createdAt: new Date().toISOString(),
});

const ev = (partial: Partial<RunnerEvent>): RunnerEvent => ({
  seq: 1,
  type: "line",
  at: new Date().toISOString(),
  ...partial,
});

describe("applyEvent", () => {
  it("tracks the suite lifecycle from SSE events", () => {
    cover("infra-dashboard-store"); // docs/todo/infra.md infra-13

    let run = baseRun();
    run = applyEvent(run, ev({ type: "suite-start", suiteId: "unit-a" }));
    expect(run.suites[0]!.status).toBe("running");
    expect(run.suites[1]!.status).toBe("pending");

    run = applyEvent(
      run,
      ev({ type: "suite-end", suiteId: "unit-a", status: "pass", exitCode: 0, durationMs: 42 }),
    );
    expect(run.suites[0]!.status).toBe("pass");
    expect(run.suites[0]!.durationMs).toBe(42);

    run = applyEvent(run, ev({ type: "suite-end", suiteId: "reg-z", status: "fail", exitCode: 1 }));
    run = applyEvent(
      run,
      ev({
        type: "run-end",
        status: "fail",
        gate: { ran: true, ok: false, exitCode: 1, output: "1 uncovered" },
      }),
    );
    expect(run.status).toBe("fail");
    expect(run.gate?.ran).toBe(true);
    expect(run.gate?.ok).toBe(false);
  });

  it("is immutable (does not mutate the previous snapshot)", () => {
    const before = baseRun();
    const after = applyEvent(before, ev({ type: "suite-start", suiteId: "unit-a" }));
    expect(before.suites[0]!.status).toBe("pending");
    expect(after).not.toBe(before);
  });
});

describe("appendLog", () => {
  it("appends per-suite lines and flags stderr", () => {
    let logs: Record<string, string[]> = {};
    logs = appendLog(logs, ev({ type: "line", suiteId: "unit-a", stream: "stdout", text: "hello" }));
    logs = appendLog(logs, ev({ type: "line", suiteId: "unit-a", stream: "stderr", text: "boom" }));
    logs = appendLog(logs, ev({ type: "line", suiteId: "reg-z", stream: "stdout", text: "later" }));
    expect(logs["unit-a"]).toEqual(["hello", "! boom"]);
    expect(logs["reg-z"]).toEqual(["later"]);
  });

  it("caps the log buffer", () => {
    let logs: Record<string, string[]> = {};
    for (let i = 0; i < MAX_LOG_LINES + 10; i++) {
      logs = appendLog(logs, ev({ type: "line", suiteId: "s", text: `l${i}` }));
    }
    expect(logs["s"]).toHaveLength(MAX_LOG_LINES);
    expect(logs["s"]![0]).toBe("l10");
  });

  it("ignores non-line events", () => {
    const logs = {};
    expect(appendLog(logs, ev({ type: "suite-start", suiteId: "x" }))).toBe(logs);
  });
});

describe("groupByCategory", () => {
  it("groups in the fixed execution order with regression pinned last", () => {
    const suites = [
      suite("reg-1", "regression"),
      suite("sec-1", "security"),
      suite("unit-1", "unit"),
      suite("unit-2", "unit"),
    ];
    const groups = groupByCategory(suites, ["unit", "integration", "security", "regression"]);
    expect(groups.map((g) => g.category)).toEqual(["unit", "security", "regression"]);
    expect(groups[0]!.suites.map((s) => s.id)).toEqual(["unit-1", "unit-2"]);
    expect(groups.at(-1)!.category).toBe("regression");
  });

  it("pins regression last even if the server-sent order is tampered", () => {
    const suites = [suite("reg-1", "regression"), suite("unit-1", "unit")];
    const groups = groupByCategory(suites, ["regression", "unit"]);
    expect(groups.map((g) => g.category)).toEqual(["unit", "regression"]);
  });
});
