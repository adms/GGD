#!/usr/bin/env node
// ggd:writes docs/editor-contract/coordination/claim.editor-form-receipts-interactable-landed.json

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EDITOR_FORM_RECEIPT_KEY, unchangedHistoricalReceipt } from "./editor-form-receipt-history.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BRICKS = join(ROOT, "docs/editor-contract/ggd-bricks.json");
const TYPE_CATALOG = join(ROOT, "docs/editor-contract/ggd-type-catalog.json");
// ⚠️ 第 2 行的 `ggd:writes` 標頭必須與這個檔名逐字相同（那是量測擁有者表的字面值）。
const OUTPUT = join(ROOT, "docs/editor-contract/coordination", `${EDITOR_FORM_RECEIPT_KEY}.json`);
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
// Hang detector, not a verdict: standalone this child takes ~35 s, but under
// skills:check's 16-way fan-out it measured 124 s and the old fixed 120 s cap
// SIGTERMed a healthy run. Default = the 5-minute "go check if it hung" line;
// GGD_FORM_RECEIPTS_TIMEOUT_MS=120000 restores the previous cap.
const TIMEOUT_MS = Number(process.env.GGD_FORM_RECEIPTS_TIMEOUT_MS ?? 300_000);
const temporary = mkdtempSync(join(tmpdir(), "ggd-form-receipts-"));
let measurement;
let timedOut = false;
try {
  const output = join(temporary, "interactions.json");
  try {
    execFileSync("pnpm", ["--filter", "@ggd/editor", "exec", "vitest", "run", "src/form/editorFormInteractions.test.tsx", "--pool=forks", "--maxWorkers=1", "--minWorkers=1"], {
      cwd: ROOT, env: { ...process.env, GGD_FORM_RECEIPTS_OUTPUT: output }, encoding: "utf8", timeout: TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024,
    });
    measurement = JSON.parse(readFileSync(output, "utf8"));
  } catch (error) {
    if (error?.code !== "ETIMEDOUT") throw error;
    timedOut = true;
  }
} finally { rmSync(temporary, { recursive: true, force: true }); }
if (timedOut) fail(`量測子行程超過 ${TIMEOUT_MS / 1000} 秒被終止（負載逾時或卡住，⛔ 不是收據不符）—— 單獨重跑 \`pnpm formreceipts:check\` 判斷`);
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
const typeCatalogSha256 = sha256(TYPE_CATALOG);

const packet = {
  schema: "ggd-coord-packet@1",
  dedupeKey: EDITOR_FORM_RECEIPT_KEY,
  kind: "claim",
  from: "codex",
  to: "main",
  baseCommit,
  contractFingerprint: typeCatalogSha256.slice(0, 16),
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
    typeCatalogSha256,
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

// The coordination packet is a historical claim after merging. A capability-wide
// fingerprint can change for unrelated asset/config work without changing any
// actual form measurement input. Preserve the merged bytes only when the freshly
// executed measurement and EVERY other packet field remain identical.
let mergedReceiptText = null;
try {
  mergedReceiptText = execFileSync("git", ["show", `origin/main:${relative(ROOT, OUTPUT)}`], {
    cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
  });
} catch {
  // No available merged receipt: retain the normal fresh-output/check behavior.
}
const historicalContent = unchangedHistoricalReceipt(mergedReceiptText, packet);
const content = historicalContent ?? `${JSON.stringify(packet, null, 2)}\n`;
if (historicalContent !== null) {
  console.log("Historical editor-form claim retained: actual measurement inputs and measured receipt values unchanged; its capability fingerprint and census-copied usedBy remain historical.");
}
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
