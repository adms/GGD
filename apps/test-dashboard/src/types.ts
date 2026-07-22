/** Wire types mirroring tools/testrunner (internal/{config,runner,coverage}). */

export type SuiteStatus = "pending" | "running" | "pass" | "fail" | "skip";
export type RunStatus = "running" | "pass" | "fail" | "cancelled";

export interface Suite {
  id: string;
  name: string;
  category: string;
  cwd: string;
  cmd: string[];
  parallelSafe: boolean;
  enabled: boolean;
  comment?: string;
}

export interface SuiteState {
  suite: Suite;
  status: SuiteStatus;
  exitCode?: number;
  durationMs: number;
}

export interface GateResult {
  ran: boolean;
  ok: boolean;
  exitCode: number;
  output?: string;
  reason?: string;
}

export interface RunSnapshot {
  id: string;
  mode: string;
  category?: string;
  stepped: boolean;
  status: RunStatus;
  suites: SuiteState[];
  gate?: GateResult;
  coverageFile: string;
  createdAt: string;
}

export type RunnerEventType = "suite-start" | "line" | "suite-end" | "run-end";

export interface RunnerEvent {
  seq: number;
  type: RunnerEventType;
  suiteId?: string;
  stream?: "stdout" | "stderr";
  text?: string;
  status?: string;
  exitCode?: number;
  durationMs?: number;
  gate?: GateResult;
  at: string;
}

export interface SuitesResponse {
  categoryOrder: string[];
  suites: Suite[];
}

export interface CoverageItem {
  id: string;
  item: string;
  testId: string;
  category: string;
  status: string;
  file: string;
  line: number;
  covered: boolean;
}

export interface CoverageMatrix {
  runId?: string;
  items: CoverageItem[];
  counts: Record<string, number>;
}
