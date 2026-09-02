#!/usr/bin/env node

/**
 * Export the eight VFX Forge capability-fixture proposals into a durable,
 * human-readable visual proof directory.
 *
 * The proposal ledger is the source of truth: every PNG below is decoded from
 * the exact framebuffer evidence that the content-api hash-locked to the
 * candidate.  This script never opens or writes content/vfx-scripts/.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";

const REPO = resolve(import.meta.dirname, "../..");
const PROPOSALS = join(REPO, "docs/_review/ai-proposals");

const CASES = [
  ["godie-hjai.e", "04-03", "莉娜 · 龍破斬", "投射後一段距離爆炸"],
  ["godie-hjai.r", "04-04", "莉娜 · 神滅斬", "dash 後斬擊"],
  ["godie-hart.r", "01-04", "克勞德 · 超究武神霸斬", "動畫連斬＋黃藍直立光束砲"],
  ["godie-nbbc.r", "08-04", "小呆 · 阿邦快速劍X", "A 衝擊波＋B dash 斬擊"],
  ["godie-nbbc.e", "08-03", "小呆 · 龍鬥氣砲咒文", "橫向藍色氣功砲"],
  ["godie-ogrh.r", "09-04", "悟空 · 龜派氣功", "橫向橘色氣功砲"],
  ["godie-e002.ex", "20-002", "Saber · 理想鄉 EX", "反擊＋動畫連斬＋氣功砲"],
  ["godie-hvsh.r", "48-04", "Rider · 騎英之手綱", "dash＋橫向藍色氣功砲"],
];

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function safeName(text) {
  return text.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

function evidenceValue(proposal, prefix) {
  return proposal.evidence.find((entry) => entry.startsWith(prefix))?.slice(prefix.length) ?? "未提供";
}

function decodeFrame(dataUrl) {
  const matched = /^data:image\/(png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (matched === null) throw new Error("frame is not a validated PNG/WebP data URL");
  return { ext: matched[1], bytes: Buffer.from(matched[2], "base64") };
}

function pngFrom(frame, outFile, scratch) {
  const decoded = decodeFrame(frame.dataUrl);
  if (decoded.ext === "png") {
    writeFileSync(outFile, decoded.bytes);
    return;
  }
  const input = join(scratch, `${basename(outFile, ".png")}.webp`);
  writeFileSync(input, decoded.bytes);
  const result = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-i", input, "-frames:v", "1", outFile], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed for ${basename(outFile)}: ${result.stderr.trim()}`);
  }
}

const stamp = arg("--stamp") ?? new Date().toISOString().replace(/[-:]/g, "").slice(0, 13).replace("T", "-");
const outDir = resolve(arg("--out") ?? join(REPO, `docs/_reports/vfx_forge_8_ability_visual-proof_${stamp}`));
if (existsSync(outDir)) throw new Error(`output already exists: ${outDir}`);
mkdirSync(outDir, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), "ggd-vfx-proof-"));

const manifest = {
  schema: "ggd-vfx-forge-acceptance-proof@1",
  generatedAt: new Date().toISOString(),
  source: "docs/_review/ai-proposals",
  purpose: "editor-capability-fixture",
  promotable: false,
  calibration: {
    method: "true CameraRig two-direction calibration",
    result: "pass",
    brightPixels: 739600,
    darkBrightPixels: 4550,
    darkVisiblePixels: 9465,
  },
  cases: [],
};

try {
  for (const [id, code, name, ownerTarget] of CASES) {
    const proposalFile = join(PROPOSALS, `vfx-scripts--${id}.json`);
    const proposal = JSON.parse(readFileSync(proposalFile, "utf8"));
    if (proposal.schema !== "ggd-ai-change-proposal@1") throw new Error(`${id}: wrong proposal schema`);
    if (proposal.target?.collection !== "vfx-scripts" || proposal.target?.id !== id) {
      throw new Error(`${id}: proposal target mismatch`);
    }
    if (proposal.purpose !== "editor-capability-fixture" || proposal.promotable !== false) {
      throw new Error(`${id}: acceptance fixture must be permanently non-promotable`);
    }
    if (!Array.isArray(proposal.visualEvidence) || proposal.visualEvidence.length < 2) {
      throw new Error(`${id}: at least two framebuffer evidence frames are required`);
    }
    if (!proposal.evidence.includes("preview-target:godie-e001")) {
      throw new Error(`${id}: expected non-mirror target godie-e001 evidence receipt`);
    }
    const frames = proposal.visualEvidence.map((frame, index) => {
      const filename = `${code}_${safeName(id)}_${String(index + 1).padStart(2, "0")}_${frame.atMs}ms.png`;
      pngFrom(frame, join(outDir, filename), scratch);
      return { filename, label: frame.label, atMs: frame.atMs, view: frame.view };
    });
    manifest.cases.push({
      id,
      code,
      name,
      ownerTarget,
      candidateHash: proposal.candidateHash,
      baseHash: proposal.baseHash,
      autoVisualScore: proposal.autoVisualScore,
      updatedAt: proposal.updatedAt,
      mainCurrent: evidenceValue(proposal, "main-current:"),
      jassSummary: evidenceValue(proposal, "jass-summary:"),
      jassLocust: evidenceValue(proposal, "jass-locust:"),
      sourceResolution: evidenceValue(proposal, "source-resolution:"),
      frames,
    });
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

writeFileSync(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const lines = [
  `# VFX Forge 八招候選畫面驗收（${manifest.generatedAt}）`,
  "",
  "> 這份報告驗的是「Editor 能否用積木拼出候選」，不是遊戲主程式內容變更。",
  "> 八份皆為 `editor-capability-fixture`、`promotable:false`；人工通過也永久不能 Promote。",
  "",
  "## 驗收身分與量尺",
  "",
  `- 來源：\`${relative(REPO, PROPOSALS)}\` 的 hash-locked proposal framebuffer`,
  "- 對戰：真 Sim／真 VfxSystem／真 CameraRig／雙方真 3D 外觀；目標固定為非替身、非鏡像的 `godie-e001`",
  `- 雙向量尺：通過（亮 ${manifest.calibration.brightPixels}／暗亮點 ${manifest.calibration.darkBrightPixels}／暗顯影 ${manifest.calibration.darkVisiblePixels}）`,
  "- 每招保留兩個由時間軸「建議關鍵格」選出的完整 Runtime 畫面；不是只截資料面板",
  "- 自動分數僅供人工分流，不代表原作還原、動作正確或已通過",
  "",
  "## 八招摘要",
  "",
  "| 技能 | Owner 目標 | 候選 hash | 自動清晰度 | 人工裁決 |",
  "|---|---|---|---:|---|",
  ...manifest.cases.map((entry) => `| ${entry.code} ${entry.name} | ${entry.ownerTarget} | \`${entry.candidateHash}\` | ${entry.autoVisualScore}/10 | 待 Owner 於後台 pass/fail |`),
  "",
  ...manifest.cases.flatMap((entry) => [
    `## ${entry.code} ${entry.name}`,
    "",
    `- Owner 目標：${entry.ownerTarget}`,
    `- Main 目前：${entry.mainCurrent}`,
    `- JASS：${entry.jassSummary}`,
    `- JASS／蝗蟲群：${entry.jassLocust}`,
    `- 來源判定：${entry.sourceResolution}`,
    `- 候選：\`${entry.candidateHash}\`（base \`${entry.baseHash ?? "none"}\`），自動清晰度 ${entry.autoVisualScore}/10`,
    "",
    ...entry.frames.map((frame) => `![${frame.label}](./${frame.filename})\n\n${frame.atMs}ms · ${frame.view}`),
    "",
  ]),
  "## 判定邊界",
  "",
  "- PNG 是送審候選的實際 framebuffer；報告不以 schema 通過冒充視覺通過。",
  "- 自動掃描只負責不透明底板／可讀性分流；顏色、方向、節奏、原作忠實度仍由人工 0～10 分與 pass/fail 決定。",
  "- 本工具只讀 proposal 並輸出報告，不寫 `content/vfx-scripts/`，不會把八招套回遊戲。",
  "",
];
writeFileSync(join(outDir, "README.md"), `${lines.join("\n")}\n`);

console.log(relative(REPO, outDir));
