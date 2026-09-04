import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCE = join(ROOT, "tools/skill-forge/codex-visual-advisory.source.json");
const PACKET = join(ROOT, "docs/_reports/editor-skill-human-review/index.json");
const MANIFEST = join(ROOT, "docs/_reports/editor-skill-basic-visual-proof/manifest.json");
const ACCEPTANCE = join(ROOT, "docs/_reports/editor-skill-acceptance-42x46.json");
const OUT_DIR = join(ROOT, "docs/_reports/editor-skill-codex-advisory");
const OUT_JSON = join(OUT_DIR, "review.json");
const OUT_MD = join(OUT_DIR, "review.md");
const CHECK = process.argv.includes("--check");

const load = (path) => JSON.parse(readFileSync(path, "utf8"));
const source = load(SOURCE);
const packet = load(PACKET);
const manifest = load(MANIFEST);
const acceptance = load(ACCEPTANCE);

const fail = (message) => { throw new Error(`[codex-visual-advisory] ${message}`); };
if (source.schema !== "ggd-editor-skill-codex-advisory-source@2") fail(`unknown source schema ${source.schema}`);
if (packet.schema !== "ggd-editor-skill-human-review-index@2") fail(`unknown packet schema ${packet.schema}`);
if (typeof packet.packetDigest !== "string" || !Array.isArray(packet.documentSources)) {
  fail("review packet is missing per-document source digests");
}
if (manifest.summary?.captured !== 46 || manifest.summary?.humanPending !== 46) {
  fail("advisory requires 46 captured documents while Owner verdicts remain pending");
}
if (acceptance.summary?.themes !== 42 || acceptance.summary?.documents !== 46) {
  fail("acceptance scope is not 42 themes / 46 documents");
}

const manifestById = new Map(manifest.cases.map((row) => [row.id, row]));
const acceptanceById = new Map(acceptance.rows.map((row) => [row.id, row]));
const packetSourceById = new Map();
for (const row of packet.documentSources) {
  if (packetSourceById.has(row.id)) fail(`duplicate packet source row ${row.id}`);
  if (typeof row.sourceDigest !== "string" || !/^[a-f0-9]{64}$/.test(row.sourceDigest)) {
    fail(`invalid packet source digest ${String(row.id)}`);
  }
  packetSourceById.set(row.id, row.sourceDigest);
}
const sourceById = new Map();
for (const row of source.entries ?? []) {
  if (sourceById.has(row.id)) fail(`duplicate source row ${row.id}`);
  if (typeof row.sourceDigest !== "string" || !/^[a-f0-9]{64}$/.test(row.sourceDigest)) {
    fail(`invalid source digest ${String(row.id)}`);
  }
  if (!Number.isInteger(row.score) || row.score < 0 || row.score > 10) fail(`invalid score ${row.id}`);
  if (!["ready-for-owner-review", "editor-rework", "main-blocked"].includes(row.disposition)) {
    fail(`invalid disposition ${row.id}: ${row.disposition}`);
  }
  if (typeof row.note !== "string" || row.note.trim() === "") fail(`empty note ${row.id}`);
  sourceById.set(row.id, row);
}

const expectedIds = acceptance.rows.map((row) => row.id);
const missing = expectedIds.filter((id) => !sourceById.has(id));
const extra = [...sourceById.keys()].filter((id) => !acceptanceById.has(id));
if (missing.length || extra.length) fail(`scope mismatch missing=${missing.join(",")} extra=${extra.join(",")}`);
const missingPacketSources = expectedIds.filter((id) => !packetSourceById.has(id));
const extraPacketSources = [...packetSourceById.keys()].filter((id) => !acceptanceById.has(id));
if (missingPacketSources.length || extraPacketSources.length) {
  fail(`packet source scope mismatch missing=${missingPacketSources.join(",")} extra=${extraPacketSources.join(",")}`);
}
const stale = expectedIds.filter((id) => sourceById.get(id).sourceDigest !== packetSourceById.get(id));
if (stale.length > 0) {
  fail(`stale per-document review (${stale.length}/${expectedIds.length}): ${stale.join(",")}`);
}

const rows = expectedIds.map((id) => {
  const authored = sourceById.get(id);
  const visual = manifestById.get(id);
  const contract = acceptanceById.get(id);
  if (!visual || !contract) fail(`missing generated evidence for ${id}`);
  const machineIssues = visual.machineIssues ?? [];
  const mainBlocker = machineIssues.some((issue) => issue.severity === "blocker" && issue.owner === "main");
  if (mainBlocker !== (authored.disposition === "main-blocked")) {
    fail(`${id} disposition disagrees with deterministic Main blocker routing`);
  }
  const solidBeamIssue = machineIssues.some((issue) =>
    issue.code === "MISSING_VISUAL_BRICK" && issue.brickId === "solid-beam",
  );
  const solidBeamFlag = (authored.flags ?? []).includes("missing-solid-beam");
  if (solidBeamIssue !== solidBeamFlag) {
    fail(`${id} missing-solid-beam flag disagrees with deterministic brickId`);
  }
  const authoringBlockers = contract.authoringBlockers ?? [];
  const noCodeStatus = authoringBlockers.length > 0
    ? "blocked"
    : (contract.scriptTimelineGaps ?? []).length > 0
      ? "effect-graph-bridge"
      : "ready";
  return {
    id,
    name: contract.name,
    themeId: contract.themeId,
    sourceDigest: authored.sourceDigest,
    strictVisual: contract.strictVisual,
    score: authored.score,
    disposition: authored.disposition,
    flags: authored.flags ?? [],
    note: authored.note,
    frameCount: visual.frames?.length ?? 0,
    proofSource: visual.proofSource,
    mechanicVisualAdditions: visual.mechanicVisualAdditions ?? [],
    noCode: {
      status: noCodeStatus,
      designerPath: contract.designerPath,
      presetId: contract.presetId || null,
      eventAuthoring: contract.noCodeEventAuthoring,
      scriptTimelineGaps: contract.scriptTimelineGaps ?? [],
      authoringBlockers,
    },
    machineIssues,
  };
});

const countBy = (key) => Object.fromEntries([...new Set(rows.map((row) => row[key]))]
  .sort().map((value) => [value, rows.filter((row) => row[key] === value).length]));
const flagCounts = {};
for (const row of rows) for (const flag of row.flags) flagCounts[flag] = (flagCounts[flag] ?? 0) + 1;
const output = {
  schema: "ggd-editor-skill-codex-advisory@2",
  reviewedAt: source.reviewedAt,
  packetDigest: packet.packetDigest,
  authority: "advisory-only",
  scope: { themes: 42, documents: 46 },
  policy: {
    ownerHumanVerdictRemainsAuthoritative: true,
    simWorldAndEventTraceRemainAuthoritative: true,
    scoreIsNotPromotionApproval: true,
    reviewInputIsInvalidatedPerDocumentWhenSourceDigestChanges: true,
  },
  summary: {
    dispositions: countBy("disposition"),
    noCode: Object.fromEntries(["ready", "effect-graph-bridge", "blocked"].map((status) => [
      status, rows.filter((row) => row.noCode.status === status).length,
    ])),
    averageVisualScore: Number((rows.reduce((sum, row) => sum + row.score, 0) / rows.length).toFixed(2)),
    flagCounts: Object.fromEntries(Object.entries(flagCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
  },
  rows,
};

const esc = (value) => String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", "<br>");
const md = [
  "# 42 主題／46 技能 Codex 視覺與 no-code 審閱",
  "",
  `- 證據包指紋：\`${output.packetDigest}\``,
  "- 過期單位：逐份技能文件（改一份只作廢一份）",
  `- 審閱時間：${output.reviewedAt}`,
  `- 視覺平均分：${output.summary.averageVisualScore}/10`,
  `- 分流：${Object.entries(output.summary.dispositions).map(([key, value]) => `${key} ${value}`).join(" · ")}`,
  `- no-code：ready ${output.summary.noCode.ready} · effect-graph bridge ${output.summary.noCode["effect-graph-bridge"]} · blocked ${output.summary.noCode.blocked}`,
  "",
  "> 這是 Codex advisory，不是 Owner 批核。SimWorld／事件 trace 判定機制；Owner 肉眼 verdict 決定是否可套用。任何 framebuffer、Main 積木或 authoring blocker 都不得被分數掩蓋。",
  "",
  "| 技能 | 分數 | 分流 | no-code | 機器問題 | 肉眼審閱 |",
  "|---|---:|---|---|---|---|",
  ...rows.map((row) => {
    const issues = row.machineIssues.map((issue) =>
      `${issue.code}/${issue.owner}${issue.brickId ? `#${issue.brickId}` : ""}`,
    ).join("、") || "—";
    const bridge = row.noCode.status === "effect-graph-bridge"
      ? `effect graph → ${row.noCode.scriptTimelineGaps.join(",")}`
      : row.noCode.status;
    return `| \`${row.id}\` ${esc(row.name)} | ${row.score} | ${row.disposition} | ${esc(bridge)} | ${esc(issues)} | ${esc(row.note)} |`;
  }),
  "",
  "## Main 外部阻塞",
  "",
  ...rows.filter((row) => row.disposition === "main-blocked").map((row) =>
    `- \`${row.id}\` ${row.name}：${row.machineIssues.map((issue) =>
      `${issue.brickId ? `[${issue.brickId}] ` : ""}${issue.summary}`,
    ).join("；")}`,
  ),
  "",
  "## 重建",
  "",
  "```bash",
  "pnpm skillforge:visual-review:check",
  "pnpm skillforge:visual-sheets:check",
  "pnpm skillforge:visual-advisory:check",
  "```",
  "",
].join("\n");
const json = `${JSON.stringify(output, null, 2)}\n`;

function checkOrWrite(path, content) {
  if (CHECK) {
    if (!existsSync(path) || readFileSync(path, "utf8") !== content) fail(`stale ${path}`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

checkOrWrite(OUT_JSON, json);
checkOrWrite(OUT_MD, md);
console.log(`${CHECK ? "PASS" : "WROTE"} Codex advisory · ${rows.length} documents · ${output.summary.averageVisualScore}/10`);
