#!/usr/bin/env tsx

/**
 * Deterministic 42-theme / 46-document acceptance inventory.
 *
 * This is deliberately stricter than a schema sweep.  A row is not visually
 * passed merely because its ability JSON parses: the report separately records
 * the designer-facing authoring path, event triggers that VFX Forge can/cannot
 * bind, and whether real framebuffer evidence has received a human verdict.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SKILL_ACCEPTANCE_CANDIDATES,
  SKILL_ACCEPTANCE_THEME_IDS,
  STRICT_VISUAL_ACCEPTANCE,
  STRICT_VISUAL_ACCEPTANCE_IDS,
  skillAcceptanceThemeId,
} from "../../apps/editor/src/forge/skillAcceptanceCatalog";
import { SKILL_TYPE_PRESETS } from "../../apps/editor/src/forge/skillTypePresets";
import { VFX_SCRIPT_TRIGGERS } from "../../packages/shared/src/content/schema/vfxScript";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT_JSON = join(ROOT, "docs/_reports/editor-skill-acceptance-42x46.json");
const OUT_MD = join(ROOT, "docs/_reports/editor-skill-acceptance-42x46.md");
const VISUAL_MANIFEST = join(ROOT, "docs/_reports/editor-skill-basic-visual-proof/manifest.json");
const CHECK = process.argv.includes("--check");
const generatedAt = CHECK && existsSync(OUT_JSON)
  ? (JSON.parse(readFileSync(OUT_JSON, "utf8")) as { generatedAt?: string }).generatedAt ?? "missing"
  : taipeiMinute();

interface AbilityDoc {
  readonly id: string;
  readonly name: string;
  readonly slot: string;
  readonly innateKind?: string;
  readonly passive?: unknown;
  readonly effects?: readonly unknown[];
  readonly template?: { readonly ref?: string; readonly cards?: readonly { readonly ref?: string }[] };
  readonly vfxKey?: string;
  readonly vfxLayers?: readonly unknown[];
  readonly [key: string]: unknown;
}

interface VisualProofEntry {
  readonly id?: unknown;
  readonly status?: unknown;
  readonly blockers?: unknown;
  readonly audit?: unknown;
  readonly humanVerdict?: unknown;
  readonly humanScore?: unknown;
  readonly humanNote?: unknown;
  readonly frames?: unknown;
  readonly machineIssues?: unknown;
  readonly basicVisualFallback?: unknown;
  readonly mechanicVisualAdditions?: unknown;
}

const capabilities = json<{
  effectKinds: readonly string[];
  hookEvents: readonly string[];
  conditionLeafKinds: readonly string[];
}>(
  "docs/editor-contract/ggd-runtime-capabilities.json",
);
const effectVocabulary = new Set(capabilities.effectKinds);
const hookVocabulary = new Set(capabilities.hookEvents);
const conditionVocabulary = new Set(capabilities.conditionLeafKinds);
const presetById = new Map(SKILL_TYPE_PRESETS.map((preset) => [preset.id, preset] as const));
const proofById = visualProofById();

const rows = SKILL_ACCEPTANCE_CANDIDATES.map((candidate) => {
  const doc = json<AbilityDoc>(`content/abilities/${candidate.id}.json`);
  const surface = vocabularySurface(doc);
  const templateRefs = [
    ...(typeof doc.template?.ref === "string" ? [doc.template.ref] : []),
    ...(doc.template?.cards ?? []).flatMap((card) => typeof card.ref === "string" ? [card.ref] : []),
  ];
  const inheritedPreset = candidate.forgeTypeId ?? (
    candidate.mirrorOf
      ? SKILL_ACCEPTANCE_CANDIDATES.find((row) => row.id === candidate.mirrorOf)?.forgeTypeId
      : undefined
  );
  const preset = inheritedPreset ? presetById.get(inheritedPreset) : undefined;
  const activation = activationMode(doc);
  const scriptTimelineGaps = [...surface.hooks]
    .filter((hook) => hook !== "onReflectSuccess")
    .sort();
  const scriptPath = existsSync(join(ROOT, `content/vfx-scripts/${candidate.id}.json`));
  const visualBrick = Boolean(
    doc.vfxKey || (doc.vfxLayers?.length ?? 0) > 0 ||
    [...surface.effects].some((kind) => [
      "spawnVfx", "spawnModelFx", "screenFlash", "screenShake", "floatingText",
      "shield", "championForm", "summon", "dash", "leap", "blink", "knockback", "pull",
    ].includes(kind)),
  );
  const proof = proofById.get(candidate.id);
  const batchStatus = proof?.status === "captured" || proof?.status === "blocked" || proof?.status === "failed"
    ? proof.status
    : "missing";
  const batchBlockers = Array.isArray(proof?.blockers) ? proof.blockers.map(String) : [];
  const humanVerdict = proof?.humanVerdict === "pass" || proof?.humanVerdict === "fail"
    ? proof.humanVerdict
    : "pending";
  const humanScore = Number.isInteger(proof?.humanScore) && Number(proof?.humanScore) >= 0 && Number(proof?.humanScore) <= 10
    ? Number(proof?.humanScore)
    : null;
  const humanNote = typeof proof?.humanNote === "string" ? proof.humanNote : "";
  const frameCount = Array.isArray(proof?.frames) ? proof.frames.length : 0;
  const machineIssues = Array.isArray(proof?.machineIssues)
    ? proof.machineIssues.flatMap((value) => {
        if (!value || typeof value !== "object") return [];
        const issue = value as Record<string, unknown>;
        return typeof issue.code === "string"
          ? [{
              code: issue.code,
              owner: typeof issue.owner === "string" ? issue.owner : "unknown",
              summary: typeof issue.summary === "string" ? issue.summary : "",
            }]
          : [];
      })
    : [];
  const basicVisualFallback = proof?.basicVisualFallback && typeof proof.basicVisualFallback === "object"
    ? proof.basicVisualFallback as Record<string, unknown>
    : null;
  const mechanicVisualAdditions = Array.isArray(proof?.mechanicVisualAdditions)
    ? proof.mechanicVisualAdditions
    : [];
  const designerPath = templateRefs.length > 0
    ? "template-product"
    : preset
      ? "preset-stack-plus-advanced-form"
      : "advanced-no-code-effect-form";
  const contractGaps = [
    ...(candidate.requiredEffectKinds ?? []).filter((kind) => !effectVocabulary.has(kind)).map((kind) => `未知效果積木 ${kind}`),
    ...(candidate.requiredHooks ?? []).filter((hook) => !hookVocabulary.has(hook)).map((hook) => `未知事件積木 ${hook}`),
    ...(candidate.requiredConditionKinds ?? []).filter((kind) => !conditionVocabulary.has(kind)).map((kind) => `未知條件積木 ${kind}`),
  ];
  const authoringBlockers = contractGaps;
  return {
    id: candidate.id,
    name: candidate.name,
    themeId: skillAcceptanceThemeId(candidate),
    group: candidate.group,
    strictVisual: STRICT_VISUAL_ACCEPTANCE_IDS.has(candidate.id),
    acceptance: candidate.acceptance,
    activation,
    designerPath,
    presetId: preset?.id ?? null,
    templateRefs,
    effectKinds: [...surface.effects].sort(),
    hookEvents: [...surface.hooks].sort(),
    noCodeEventAuthoring: surface.hooks.size > 0 ? "skill-forge-effect-graph" : "not-applicable",
    vfxScriptTimelineCoverage: scriptTimelineGaps.length === 0 ? "complete" : "cast-and-reflect-only",
    scriptTimelineGaps,
    hasVisualBrick: visualBrick,
    hasShippedVfxScript: scriptPath,
    framebuffer: {
      batchStatus,
      frameCount,
      audit: proof?.audit ?? null,
      blockers: batchBlockers,
      humanVerdict,
      humanScore,
      humanNote,
      machineIssues,
      basicVisualFallback,
      mechanicVisualAdditions,
    },
    authoringBlockers,
    status: batchStatus === "failed"
      ? "fail"
      : batchStatus === "blocked"
        ? "blocked"
        : frameCount > 0 && humanVerdict === "pass" && authoringBlockers.length === 0
          ? "pass"
          : frameCount > 0 && humanVerdict === "fail"
        ? "fail"
        : authoringBlockers.length > 0
          ? "blocked"
          : "needs-frame-review",
  } as const;
});

const summary = {
  themes: SKILL_ACCEPTANCE_THEME_IDS.size,
  documents: rows.length,
  ownerUnion: rows.filter((row) => row.group === "owner-union").length,
  runtimeCoverage: rows.filter((row) => row.group === "runtime-coverage").length,
  strictVisualThemes: STRICT_VISUAL_ACCEPTANCE.length,
  strictVisualDocuments: rows.filter((row) => row.strictVisual).length,
  gpuCaptured: rows.filter((row) => row.framebuffer.batchStatus === "captured").length,
  gpuFailed: rows.filter((row) => row.framebuffer.batchStatus === "failed").length,
  gpuBlocked: rows.filter((row) => row.framebuffer.batchStatus === "blocked").length,
  visualPass: rows.filter((row) => row.status === "pass").length,
  visualFail: rows.filter((row) => row.status === "fail").length,
  needsFrameReview: rows.filter((row) => row.status === "needs-frame-review").length,
  blocked: rows.filter((row) => row.status === "blocked").length,
  scriptTimelineGaps: [...new Set(rows.flatMap((row) => row.scriptTimelineGaps))].sort(),
  machineIssueCounts: countBy(rows.flatMap((row) => row.framebuffer.machineIssues.map((issue) => issue.code))),
  machineIssueOwnerCounts: countBy(rows.flatMap((row) => row.framebuffer.machineIssues.map((issue) => issue.owner))),
  basicVisualFallbacks: rows.filter((row) => row.framebuffer.basicVisualFallback !== null).length,
  mechanicVisualDocuments: rows.filter((row) => row.framebuffer.mechanicVisualAdditions.length > 0).length,
  mechanicVisualBricks: rows.reduce(
    (total, row) => total + row.framebuffer.mechanicVisualAdditions.length,
    0,
  ),
};

if (summary.themes !== 42 || summary.documents !== 46) {
  throw new Error(`acceptance scope drift: ${summary.themes} themes / ${summary.documents} documents`);
}

const receipt = {
  schema: "ggd-editor-skill-acceptance@1",
  generatedAt,
  scope: "42 skill themes / 46 shipped ability documents",
  policy: {
    visualPassRequiresFramebufferAndHumanVerdict: true,
    strictSubset: "8 named scenes require multi-phase reference comparison; they remain part of the 46",
    designerView: "A schema-valid JSON alone is never a pass; the no-code authoring path and event binding are audited separately.",
  },
  contracts: {
    vfxScriptTriggers: [...VFX_SCRIPT_TRIGGERS],
    capabilityFingerprint: json<{ capabilityFingerprint?: string }>(
      "docs/editor-contract/ggd-editor-coverage.json",
    ).capabilityFingerprint ?? null,
  },
  summary,
  rows,
};

const md = markdown(receipt);
emit(OUT_JSON, `${JSON.stringify(receipt, null, 2)}\n`);
emit(OUT_MD, md);
if (!CHECK) console.log(`WROTE ${relative(ROOT, OUT_JSON)} · ${summary.themes}/${summary.documents}`);
else console.log(`PASS Skill acceptance receipt current · ${summary.themes}/${summary.documents}`);

function vocabularySurface(value: unknown): { effects: Set<string>; hooks: Set<string> } {
  const effects = new Set<string>();
  const hooks = new Set<string>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (typeof record.kind === "string" && effectVocabulary.has(record.kind)) effects.add(record.kind);
    if (typeof record.on === "string" && hookVocabulary.has(record.on)) hooks.add(record.on);
    for (const child of Object.values(record)) visit(child);
  };
  visit(value);
  return { effects, hooks };
}

function activationMode(doc: AbilityDoc): "active" | "passive" {
  if (doc.slot === "PASSIVE") return doc.innateKind === "active" ? "active" : "passive";
  return doc.passive && (doc.effects?.length ?? 0) === 0 ? "passive" : "active";
}

function visualProofById(): Map<string, VisualProofEntry> {
  if (!existsSync(VISUAL_MANIFEST)) return new Map();
  const value = JSON.parse(readFileSync(VISUAL_MANIFEST, "utf8")) as { cases?: readonly VisualProofEntry[] };
  return new Map((value.cases ?? []).flatMap((row) => typeof row.id === "string" ? [[row.id, row] as const] : []));
}

function json<T>(path: string): T {
  return JSON.parse(readFileSync(join(ROOT, path), "utf8")) as T;
}

function emit(path: string, content: string): void {
  if (CHECK) {
    if (!existsSync(path) || readFileSync(path, "utf8") !== content) {
      throw new Error(`${relative(ROOT, path)} is stale; run pnpm skillforge:audit`);
    }
    return;
  }
  writeFileSync(path, content);
}

function markdown(value: typeof receipt): string {
  const s = value.summary;
  const lines = [
    "# Editor 技能自我驗收：42 個主題／46 份實際技能",
    "",
    `產生時間（至分鐘）：${value.generatedAt}`,
    "",
    "> JSON/schema/單元測試通過不等於視覺通過。每列必須有真 framebuffer 關鍵格與人工裁決；八招另做逐階段嚴格比對。",
    "",
    `- 範圍：${s.themes} 個主題／${s.documents} 份技能（Owner ${s.ownerUnion}＋runtime 補集 ${s.runtimeCoverage}）`,
    `- 嚴格視覺子集：${s.strictVisualThemes} 個主題／${s.strictVisualDocuments} 份技能文件（直接讀 Main 機器契約）`,
    `- 全體視覺判定：已通過 ${s.visualPass}；失敗 ${s.visualFail}；待看圖 ${s.needsFrameReview}；被接縫阻塞 ${s.blocked}`,
    `- GPU 批次：已擷取 ${s.gpuCaptured}；畫面守衛失敗 ${s.gpuFailed}；契約／素材阻塞 ${s.gpuBlocked}`,
    `- 自動根因：${formatCounts(s.machineIssueCounts)}`,
    `- 自動分工：${formatCounts(s.machineIssueOwnerCounts)}`,
    `- 基本視覺安全替代：${s.basicVisualFallbacks} 份（只替換 Editor baseline，不改原技能綁定）`,
    `- 真機制節點自動補圖：${s.mechanicVisualDocuments} 份／${s.mechanicVisualBricks} 塊（只存在預覽副本，未改 gameplay JSON）`,
    `- VFX Script 直接時間軸未涵蓋（不是 Main 阻塞；由 Skill Forge 效果圖綁定）：${s.scriptTimelineGaps.length ? s.scriptTimelineGaps.join("、") : "無"}`,
    "",
    "| 技能 | 主題 | 設計師路徑 | 事件演出 | 畫面證據 | 自動根因 | 狀態 |",
    "|---|---|---|---|---|---|---|",
    ...value.rows.map((row) =>
      `| \`${row.id}\` ${row.name} | \`${row.themeId}\` | ${row.designerPath}${row.presetId ? `（${row.presetId}）` : ""}${formatFallback(row.framebuffer.basicVisualFallback)} | ${row.noCodeEventAuthoring}${row.scriptTimelineGaps.length ? `；script 時間軸：${row.scriptTimelineGaps.join("、")}` : ""} | ${row.framebuffer.batchStatus}／${row.framebuffer.frameCount} 格／${row.framebuffer.humanVerdict}${row.framebuffer.humanScore === null ? "" : `／${row.framebuffer.humanScore}分`} | ${row.framebuffer.machineIssues.map((issue) => `${issue.code}/${issue.owner}`).join("、") || "—"} | **${row.status}** |`,
    ),
    "",
    "## 判定邊界",
    "",
    "- `blocked` 只用於機器契約真的缺少 required effect/hook/condition，不能因 `vfx-script@1` 沒有直連 hook 就誤報；該路徑由 Skill Forge 的 hook effect graph 組裝。",
    "- `needs-frame-review` 表示資料與操作入口成立，但尚無人看過實際遊戲畫面，不能宣稱完成。",
    "- 八招是高風險壓力測試，不是其餘 38 份的替代品。",
  ];
  return `${lines.join("\n")}\n`;
}

function countBy(values: readonly string[]): Record<string, number> {
  return Object.fromEntries(
    [...new Set(values)].sort().map((value) => [value, values.filter((item) => item === value).length]),
  );
}

function formatCounts(values: Readonly<Record<string, number>>): string {
  const entries = Object.entries(values);
  return entries.length > 0 ? entries.map(([key, count]) => `${key} ${count}`).join("、") : "尚無瀏覽器證據";
}

function formatFallback(value: Readonly<Record<string, unknown>> | null): string {
  if (!value) return "";
  return `；安全替代 \`${String(value.fromVfxId)}\` → \`${String(value.toVfxId)}\``;
}

function taipeiMinute(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}+08:00`;
}
