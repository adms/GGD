import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCE = join(ROOT, "tools/skill-forge/codex-visual-advisory.source.json");
const PACKET = join(ROOT, "docs/_reports/editor-skill-human-review/index.json");
const MANIFEST = join(ROOT, "docs/_reports/editor-skill-basic-visual-proof/manifest.json");
const ACCEPTANCE = join(ROOT, "docs/_reports/editor-skill-acceptance-42x46.json");
const BRICKS = join(ROOT, "docs/editor-contract/ggd-bricks.json");
const OUT_DIR = join(ROOT, "docs/_reports/editor-skill-codex-advisory");
const OUT_JSON = join(OUT_DIR, "review.json");
const OUT_MD = join(OUT_DIR, "review.md");
const CHECK = process.argv.includes("--check");

const load = (path) => JSON.parse(readFileSync(path, "utf8"));
const source = load(SOURCE);
const packet = load(PACKET);
const manifest = load(MANIFEST);
const acceptance = load(ACCEPTANCE);
const bricks = load(BRICKS);

const fail = (message) => { throw new Error(`[codex-visual-advisory] ${message}`); };
if (source.schema !== "ggd-editor-skill-codex-advisory-source@2") fail(`unknown source schema ${source.schema}`);
if (packet.schema !== "ggd-editor-skill-human-review-index@2") fail(`unknown packet schema ${packet.schema}`);
if (typeof packet.packetDigest !== "string" || !Array.isArray(packet.documentSources)) {
  fail("review packet is missing per-document source digests");
}
if (bricks.schema !== "ggd-bricks@1" || !Array.isArray(bricks.bricks)) fail("unknown brick census schema");
// ⛔ 分母不寫死（CLAUDE.md 失敗形態⑨：一個永遠不會綠的閘）。在 2026-09-07 之前這裡是
//    `captured !== 46` 與 `themes !== 42 || documents !== 46`，而驗收包的分母改成從目錄推導
//    （`1de2bd31f`，46 → 47）之後，這兩行在**每一次正確的 checkout 上**都失敗，
//    而訊息 `acceptance scope is not 42 themes / 46 documents` 指著驗收包，⛔ 不是指著這兩個常數。
// ⇒ 現在驗的是**關係**：擷取包自己的統計要對得上它自己的列數，且 owner 的 verdict 仍全部待批。
const capturedCount = manifest.cases.length;
if (manifest.summary?.captured !== capturedCount) {
  fail(`manifest summary.captured ${manifest.summary?.captured} disagrees with ${capturedCount} captured cases`);
}
if (manifest.summary?.humanPending !== capturedCount) {
  fail(`advisory requires Owner verdicts to remain pending (${manifest.summary?.humanPending}/${capturedCount})`);
}
if (acceptance.rows.length !== acceptance.summary?.documents) {
  fail(`acceptance summary.documents ${acceptance.summary?.documents} disagrees with ${acceptance.rows.length} rows`);
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

// ⭐ 母體＝**審查包涵蓋的那些文件**（＝擷取到畫面的那些），⛔ 不是驗收包的全部列：
//    一份沒有擷取到畫面的技能，沒有東西可以被視覺審閱。⚠️ 而「驗收包裡有、但還沒擷取」
//    是一個**要被印出來的數字**（coverage.awaitingCapture），⛔ 不是一個靜默的差集。
const expectedIds = packet.documentSources.map((row) => row.id);
const missing = expectedIds.filter((id) => !sourceById.has(id));
const extra = [...sourceById.keys()].filter((id) => !packetSourceById.has(id));
if (missing.length || extra.length) fail(`scope mismatch missing=${missing.join(",")} extra=${extra.join(",")}`);
const withoutEvidence = expectedIds.filter((id) => !manifestById.has(id) || !acceptanceById.has(id));
if (withoutEvidence.length) fail(`packet rows without generated evidence: ${withoutEvidence.join(",")}`);
const awaitingCapture = acceptance.rows.map((row) => row.id).filter((id) => !packetSourceById.has(id));
// ⭐ 逐份作廢：一份的證據變了 ⇒ **只有那一份**的審閱作廢（其餘保留）。
//    ⛔ 這不是「放寬比對」—— 每一份仍然逐位元組比 64 hex digest，變的是**波及範圍**。
const staleIds = new Set(expectedIds.filter((id) => sourceById.get(id).sourceDigest !== packetSourceById.get(id)));

// ⭐ 積木名從**清冊推導**，⛔ 不寫死：在 2026-09-07 之前這裡逐字比 `"solid-beam"` 與
//    `"missing-solid-beam"` ⇒ 第二顆缺的積木對這條閘是**不存在的**。
//    ⚠️ 而「缺」是一個**關係**：`MISSING_VISUAL_BRICK` 的 brickId 必須**不在**出貨清冊裡 ——
//    哪一天那顆積木真的出貨了，這條閘就會紅並指名它（一個會變的問題）。
const shippedBrickIds = new Set(bricks.bricks.map((brick) => brick.id));
const brickBlocks = new Map();
for (const visual of manifest.cases) {
  for (const issue of visual.machineIssues ?? []) {
    if (issue.code !== "MISSING_VISUAL_BRICK") continue;
    if (typeof issue.brickId !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(issue.brickId)) {
      fail(`${visual.id}: MISSING_VISUAL_BRICK without a kebab-case brickId (got ${JSON.stringify(issue.brickId)})`);
    }
    if (shippedBrickIds.has(issue.brickId)) {
      fail(`${visual.id}: brickId ${issue.brickId} is already shipped in ggd-bricks.json — the MISSING_VISUAL_BRICK issue is stale`);
    }
    if (!brickBlocks.has(issue.brickId)) brickBlocks.set(issue.brickId, []);
    if (packetSourceById.has(visual.id)) brickBlocks.get(issue.brickId).push(visual.id);
  }
}
const brickFlag = (brickId) => `missing-${brickId}`;

const rows = expectedIds.map((id) => {
  const authored = sourceById.get(id);
  const visual = manifestById.get(id);
  const contract = acceptanceById.get(id);
  const reviewState = staleIds.has(id) ? "stale" : "current";
  const machineIssues = visual.machineIssues ?? [];
  const missingBricks = [...new Set(machineIssues
    .filter((issue) => issue.code === "MISSING_VISUAL_BRICK")
    .map((issue) => issue.brickId))].sort();
  // ⚠️ 一份 stale 的審閱是**對著舊證據**寫的 ⇒ ⛔ 不可以拿今天的機器分流去對它，
  //    也⛔ 不可以把它算進平均分。它保留原文，但帶著 `reviewState: "stale"`。
  if (reviewState === "current") {
    const mainBlocker = machineIssues.some((issue) => issue.severity === "blocker" && issue.owner === "main");
    if (mainBlocker !== (authored.disposition === "main-blocked")) {
      fail(`${id} disposition disagrees with deterministic Main blocker routing`);
    }
    const authoredFlags = new Set((authored.flags ?? []).filter((flag) => flag.startsWith("missing-")));
    const derivedFlags = new Set(missingBricks.map(brickFlag));
    if (authoredFlags.size !== derivedFlags.size || [...derivedFlags].some((flag) => !authoredFlags.has(flag))) {
      fail(`${id} missing-brick flags [${[...authoredFlags].join(",")}] disagree with deterministic brickIds [${[...derivedFlags].join(",")}]`);
    }
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
    currentDigest: packetSourceById.get(id),
    reviewState,
    missingBricks,
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

const currentRows = rows.filter((row) => row.reviewState === "current");
const countBy = (key) => Object.fromEntries([...new Set(currentRows.map((row) => row[key]))]
  .sort().map((value) => [value, currentRows.filter((row) => row[key] === value).length]));
const flagCounts = {};
for (const row of currentRows) for (const flag of row.flags) flagCounts[flag] = (flagCounts[flag] ?? 0) + 1;
// ⭐ 「擋住幾支」是**機器數的**：分母＝審查包裡帶同一個 brickId 的列數，⛔ 不是散文裡的一個數字。
const missingBrickBlocks = Object.fromEntries([...brickBlocks.entries()]
  .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
  .map(([brickId, ids]) => [brickId, {
    documents: ids.length,
    themes: new Set(ids.map((id) => acceptanceById.get(id)?.themeId)).size,
    ids: [...ids].sort(),
  }]));
const output = {
  schema: "ggd-editor-skill-codex-advisory@2",
  reviewedAt: source.reviewedAt,
  packetDigest: packet.packetDigest,
  authority: "advisory-only",
  // ⭐ 分母與探針都印出來（⛔ 不是只回一個數字）：驗收包多少列、擷取了幾份、審閱涵蓋幾份。
  scope: {
    themes: acceptance.summary.themes,
    acceptanceDocuments: acceptance.rows.length,
    capturedDocuments: manifest.cases.length,
    reviewedDocuments: rows.length,
  },
  coverage: { awaitingCapture },
  policy: {
    ownerHumanVerdictRemainsAuthoritative: true,
    simWorldAndEventTraceRemainAuthoritative: true,
    scoreIsNotPromotionApproval: true,
    reviewInputIsInvalidatedPerDocumentWhenSourceDigestChanges: true,
    staleRowsKeepTheirTextButAreExcludedFromEverySummary: true,
  },
  summary: {
    reviewFreshness: { current: currentRows.length, stale: rows.length - currentRows.length },
    dispositions: countBy("disposition"),
    noCode: Object.fromEntries(["ready", "effect-graph-bridge", "blocked"].map((status) => [
      status, currentRows.filter((row) => row.noCode.status === status).length,
    ])),
    averageVisualScore: currentRows.length === 0
      ? null
      : Number((currentRows.reduce((sum, row) => sum + row.score, 0) / currentRows.length).toFixed(2)),
    flagCounts: Object.fromEntries(Object.entries(flagCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    missingBrickBlocks,
  },
  rows,
};

const esc = (value) => String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", "<br>");
const md = [
  `# ${output.scope.themes} 主題／${output.scope.reviewedDocuments} 技能 Codex 視覺與 no-code 審閱`,
  "",
  `- 證據包指紋：\`${output.packetDigest}\``,
  "- 過期單位：逐份技能文件（改一份只作廢一份，其餘保留原審閱）",
  `- 分母：驗收包 ${output.scope.acceptanceDocuments} 列 · 已擷取 ${output.scope.capturedDocuments} 份 · 本頁審閱 ${output.scope.reviewedDocuments} 份`
    + (awaitingCapture.length ? ` · ⚠️ 等待擷取 ${awaitingCapture.length}（${awaitingCapture.join("、")}）` : ""),
  `- 審閱新鮮度：current ${output.summary.reviewFreshness.current} · stale ${output.summary.reviewFreshness.stale}`,
  `- 審閱時間：${output.reviewedAt}`,
  `- 視覺平均分（只算 current）：${output.summary.averageVisualScore}/10`,
  `- 分流：${Object.entries(output.summary.dispositions).map(([key, value]) => `${key} ${value}`).join(" · ")}`,
  `- no-code：ready ${output.summary.noCode.ready} · effect-graph bridge ${output.summary.noCode["effect-graph-bridge"]} · blocked ${output.summary.noCode.blocked}`,
  "",
  "> 這是 Codex advisory，不是 Owner 批核。SimWorld／事件 trace 判定機制；Owner 肉眼 verdict 決定是否可套用。任何 framebuffer、Main 積木或 authoring blocker 都不得被分數掩蓋。",
  "",
  "## 缺哪一顆積木擋住幾支（機器計數，分母＝審查包裡帶同一 brickId 的列數）",
  "",
  "| brickId | 擋住技能數 | 主題數 | 技能 |",
  "|---|---:|---:|---|",
  ...(Object.keys(missingBrickBlocks).length === 0
    ? ["| — | 0 | 0 | — |"]
    : Object.entries(missingBrickBlocks).map(([brickId, stat]) =>
      `| \`${esc(brickId)}\` | ${stat.documents} | ${stat.themes} | ${stat.ids.map((id) => `\`${esc(id)}\``).join("、")} |`)),
  "",
  "| 技能 | 分數 | 分流 | 新鮮度 | no-code | 機器問題 | 肉眼審閱 |",
  "|---|---:|---|---|---|---|---|",
  ...rows.map((row) => {
    const issues = row.machineIssues.map((issue) =>
      `${issue.code}/${issue.owner}${issue.brickId ? `#${issue.brickId}` : ""}`,
    ).join("、") || "—";
    const bridge = row.noCode.status === "effect-graph-bridge"
      ? `effect graph → ${row.noCode.scriptTimelineGaps.join(",")}`
      : row.noCode.status;
    const score = row.reviewState === "stale" ? `~~${row.score}~~` : String(row.score);
    return `| \`${row.id}\` ${esc(row.name)} | ${score} | ${row.disposition} | ${row.reviewState} | ${esc(bridge)} | ${esc(issues)} | ${esc(row.note)} |`;
  }),
  "",
  "## Main 外部阻塞",
  "",
  // ⭐ 這一節從**機器分流**推導（severity=blocker · owner=main），⛔ 不是從作者填的 disposition ——
  //    一份 stale 的 disposition 是對著舊證據寫的。
  ...rows.filter((row) => row.machineIssues.some((issue) => issue.severity === "blocker" && issue.owner === "main")).map((row) =>
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
console.log(
  `${CHECK ? "PASS" : "WROTE"} Codex advisory · ${rows.length}/${output.scope.acceptanceDocuments} documents`
  + ` · current ${output.summary.reviewFreshness.current} / stale ${output.summary.reviewFreshness.stale}`
  + ` · awaiting capture ${awaitingCapture.length}`
  + ` · ${output.summary.averageVisualScore}/10`,
);
