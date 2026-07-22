/**
 * Test-coverage beacon. A test calls `cover("auth-register-unique")` to record
 * that the TODO item with that `test_id` was exercised. When the env var
 * `GGD_COVERAGE_FILE` is set (by the test runner), beacons are appended as NDJSON;
 * `tools/todo-check --runtime <file>` then fails the build if any TODO item's
 * `test_id` was never covered.
 *
 * This lives in `testkit/` (not `src/`) because it is test-only and may touch Node.
 */
import { appendFileSync } from "node:fs";

const FILE = process.env.GGD_COVERAGE_FILE;

/** Record that a TODO item's test executed. No-op unless GGD_COVERAGE_FILE is set. */
export function cover(testId: string): void {
  if (!FILE) return;
  appendFileSync(FILE, JSON.stringify({ cover: testId }) + "\n");
}
