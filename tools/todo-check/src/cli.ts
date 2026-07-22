#!/usr/bin/env tsx
/**
 * TODO/test coverage gate.
 *
 *   todo-check --static [--dir docs/todo]
 *   todo-check --runtime <coverage.ndjson> [--dir docs/todo]
 *
 * --static  : validates every TODO item has a unique id + test_id + valid enums.
 * --runtime : additionally fails if any `done` item's test_id was not covered.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseTodoMarkdown, type TodoItem } from "./parse";
import { checkStatic, checkRuntime, parseCoverage } from "./check";

function loadTodos(dir: string): { items: TodoItem[]; parseErrors: string[] } {
  const items: TodoItem[] = [];
  const parseErrors: string[] = [];
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".md") && !f.startsWith("_"))
    .sort();
  for (const f of files) {
    const full = join(dir, f);
    const res = parseTodoMarkdown(`docs/todo/${f}`, readFileSync(full, "utf8"));
    items.push(...res.items);
    parseErrors.push(...res.errors);
  }
  return { items, parseErrors };
}

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function main(): void {
  const mode = process.argv.includes("--runtime") ? "runtime" : "static";
  const dir = resolve(argValue("--dir") ?? "docs/todo");
  const { items, parseErrors } = loadTodos(dir);

  const stat = checkStatic(items, parseErrors);
  const statusLine = Object.entries(stat.counts.byStatus)
    .map(([k, v]) => `${k}:${v}`)
    .join("  ");
  console.log(`todo-check: ${stat.counts.total} items  [${statusLine}]`);

  if (!stat.ok) {
    console.error(`\n✗ static errors (${stat.errors.length}):`);
    for (const e of stat.errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log("✓ static: every item has a unique id + test_id");

  if (mode === "runtime") {
    const covFile = process.argv[process.argv.indexOf("--runtime") + 1];
    if (!covFile) {
      console.error("✗ --runtime requires a path to the coverage NDJSON file");
      process.exit(2);
    }
    const covered = parseCoverage(readFileSync(covFile, "utf8"));
    const rep = checkRuntime(items, covered);
    console.log(`todo-check: ${rep.coveredCount} test beacons observed`);
    if (rep.orphanBeacons.length)
      console.warn(`  ! ${rep.orphanBeacons.length} beacon(s) match no TODO item`);
    if (!rep.ok) {
      console.error(`\n✗ runtime coverage failures (${rep.errors.length}):`);
      for (const e of rep.errors) console.error(`  - ${e}`);
      process.exit(1);
    }
    console.log('✓ runtime: every "done" item was covered by a passing test');
  }
}

main();
