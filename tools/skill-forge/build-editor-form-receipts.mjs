#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BRICKS = join(ROOT, "docs/editor-contract/ggd-bricks.json");
const TYPE_CATALOG = join(ROOT, "docs/editor-contract/ggd-type-catalog.json");
const OUTPUT = join(ROOT, "docs/editor-contract/coordination/claim.editor-form-receipts.json");
const CHECK = process.argv.includes("--check");

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : null;
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function fail(message) {
  console.error(`FAIL editor form receipts: ${message}`);
  process.exit(1);
}

const existing = existsSync(OUTPUT)
  ? JSON.parse(readFileSync(OUTPUT, "utf8"))
  : null;
const commit = option("--commit") ?? existing?.claims?.[0]?.commit ?? null;
const baseCommit = option("--base-commit") ?? existing?.baseCommit ?? (CHECK ? null : git("rev-parse", "origin/main"));
if (!commit) fail("首次產生要帶 --commit <包含量測器的 commit>");
if (!baseCommit) fail("首次產生要帶 --base-commit <origin/main sha>");

const contract = JSON.parse(readFileSync(BRICKS, "utf8"));
if (contract.schema !== "ggd-bricks@1") fail(`不支援 ${contract.schema}`);

// Execute the real React controls and their handlers. Schema membership alone
// cannot establish that an input changes a document and survives reopening.
const temporary = mkdtempSync(join(tmpdir(), "ggd-form-receipts-"));
let measurement;
try {
  const output = join(temporary, "interactions.json");
  execFileSync("pnpm", ["--filter", "@ggd/editor", "exec", "vitest", "run", "src/form/editorFormInteractions.test.tsx", "--pool=forks", "--maxWorkers=1", "--minWorkers=1"], {
    cwd: ROOT, env: { ...process.env, GGD_FORM_RECEIPTS_OUTPUT: output }, encoding: "utf8", timeout: 120_000, maxBuffer: 16 * 1024 * 1024,
  });
  measurement = JSON.parse(readFileSync(output, "utf8"));
} finally { rmSync(temporary, { recursive: true, force: true }); }
const receipts = measurement.receipts.sort((a, b) => a.layer.localeCompare(b.layer) || a.id.localeCompare(b.id));
const countByLayer = Object.fromEntries(
  [...new Set(receipts.map((row) => row.layer))].sort().map((layer) => {
    const rows = receipts.filter((row) => row.layer === layer);
    return [layer, {
      total: rows.length,
      renderable: rows.filter((row) => row.renderable).length,
      missing: rows.filter((row) => !row.renderable).length,
    }];
  }),
);
const renderable = receipts.filter((row) => row.renderable).length;
const missing = receipts.length - renderable;
// The census consumes these receipts. Hash only its measurement inputs,
// otherwise regenerating editorForm creates a self-referential freshness loop.
const brickInput = contract.bricks.map(({ id, layer }) => ({ id, layer })).sort((a, b) => a.layer.localeCompare(b.layer) || a.id.localeCompare(b.id));

const packet = {
  schema: "ggd-coord-packet@1",
  dedupeKey: "claim.editor-form-receipts",
  kind: "claim",
  from: "codex",
  to: "main",
  baseCommit,
  contractFingerprint: sha256(TYPE_CATALOG).slice(0, 16),
  title: `Editor ${receipts.length} 顆積木的 React 操作與回讀：${renderable} 通過、${missing} 不可用`,
  claims: [
    {
      kind: "confirmed",
      text:
        `掛載實際 FormRenderer、ConditionEditor 或 HeroSlotEditor，操作選單／參數、序列化並重新掛載後，` +
        `${receipts.length} 顆積木中 ${renderable} 顆通過，${missing} 顆由現有契約阻擋。` +
        `每列分別記錄參數是否編輯；這是 headless React 證據，不是瀏覽器、IndexedDB、全部參數或 runtime 驗收。`,
      repro: {
        command: "node tools/skill-forge/build-editor-form-receipts.mjs --check",
        expectedExit: 0,
      },
      commit,
      evidence: [
        "apps/editor/src/form/editorFormInteractions.test.tsx",
        "apps/editor/src/form/walk.test.ts",
        "tools/skill-forge/build-editor-form-receipts.mjs",
        "docs/editor-contract/ggd-bricks.json",
      ],
    },
  ],
  source: {
    bricks: relative(ROOT, BRICKS),
    brickInputSha256: createHash("sha256").update(JSON.stringify(brickInput)).digest("hex"),
    capabilityFingerprint: contract.capabilityFingerprint,
    typeCatalog: relative(ROOT, TYPE_CATALOG),
    typeCatalogSha256: sha256(TYPE_CATALOG),
  },
  summary: {
    total: receipts.length,
    renderable,
    missing,
    parameterEdited: receipts.filter((row) => row.parameterEdited).length,
    byLayer: countByLayer,
  },
  measurementLimits: measurement.limits,
  receipts,
};

const content = `${JSON.stringify(packet, null, 2)}\n`;
if (CHECK) {
  if (!existsSync(OUTPUT)) fail(`${relative(ROOT, OUTPUT)} 不存在`);
  if (readFileSync(OUTPUT, "utf8") !== content) fail(`${relative(ROOT, OUTPUT)} 已過期`);
  console.log(
    `PASS editor form receipts · ${receipts.length} total · ${renderable} renderable · ${missing} missing`,
  );
} else {
  writeFileSync(OUTPUT, content);
  console.log(
    `WROTE ${relative(ROOT, OUTPUT)} · ${receipts.length} total · ${renderable} renderable · ${missing} missing`,
  );
}
