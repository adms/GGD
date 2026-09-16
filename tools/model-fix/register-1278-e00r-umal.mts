/**
 * 🔗 GH#1278／GH#1186：初號機、拳四郎接上論壇模型（減面＋原作逐動作顯示），熊貓真的切到論壇模型。
 *
 * owner（逐字）：
 * > 2026-09-16「那很簡單 接上 初號機 熊貓 拳四郎 就結束了」
 * > 2026-09-16「拳四郎 站立 跟 奔跑 多餘白光 要處理吧」
 * > 2026-09-10「超過一萬面 減面到 8000以下 並且要通過檢驗 通過以後原始檔一樣保留只是放到S3 只有正式採用才放到git」
 *
 * ① **來源就地更新**（原檔已備份 s3://ggd-390630837668-ap-east-2-an/model-decimation/20260916/originals/；
 *    來源 SHA-256 對不上就停，⛔ 不在別人改過的檔上疊）。候選的產生方式：
 *      python3 tools/w3x-import/restore_geoset_visibility.py --mdx <ou99 原始 zip> --glb <原檔> --out <…geoa.glb> …
 *      npx tsx tools/model-budget/optimize.ts <…geoa.glb> --role champion --geometry --lock-blend --tris-target 8000 --tex-edge 1024 --apply
 *    · ou99.464696 拳四郎：21,733 → 7,967 面；6 片出拳光照原作只在出招時出現（站立／跑步的白光刃消失）
 *    · ou99.498341 初號機：11,222 → 7,996 面；多出來的第二把刀照原作只在死亡時出現
 *    驗收（亮像素、逐動作實拍、骨架、入庫檢查）：materials/model-decimation/decimation-ledger-20260916.json
 * ② **註冊並切成作用中**：與後台「新增版本」同一條 `ModelVersions.prepare({ action: "register" })`；
 *    原本綁的模型自動凍結成「原上線模型」⇒ 後台下拉選單一鍵切回（rollback）。
 * ③ **熊貓**：d52cb7609 註冊了 ou99 熊貓，⛔ 但它是「相似造型」、預設不參加自動選用 ⇒ `modelKey` 仍是原上線模型
 *    （體素替身）。這裡做與後台下拉選單「選這個版本」同一個動作（`activate`）。
 *
 *   node --import tsx tools/model-fix/register-1278-e00r-umal.mts [--write]
 *   （不帶 --write 只試算，⛔ 一個位元組都不寫）
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ModelVersions } from "../../apps/content-api/src/modelVersions";
import { resizeImageWithFfmpeg } from "../../apps/content-api/src/resizeImage.node";
import { contentSha256 } from "../../packages/shared/src/content/import/jcs";
import { spliceMembers } from "../../packages/shared/src/content/editModel";
import { inspectModelUpload } from "../../packages/shared/src/content/modelUpload/inspect";
import { normalizeUploadedModel } from "../../packages/shared/src/content/modelUpload/normalize";
import { zModelVersionCommand, type ChampionModelVersion, type ModelVersionCommand } from "../../packages/shared/src/content/schema/championModelVersions";

const WRITE = process.argv.includes("--write");
const root = resolve("content");
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const summary = async (bytes: Uint8Array) => {
  const m = await inspectModelUpload(bytes);
  return { sha256: sha256(bytes).slice(0, 16), triangles: m.triangles, drawCalls: m.meshes, textures: m.textures.map((t) => Math.max(t.width, t.height)) };
};
const atomicWrite = (path: string, bytes: Uint8Array | string) => {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try { writeFileSync(temporary, bytes, { flag: "wx" }); renameSync(temporary, path); } finally { if (existsSync(temporary)) unlinkSync(temporary); }
};

const SOURCES = [
  {
    modelKey: "ou99.464696", original: "8210480e325b095dd4c85cb104ca2f9feb198752dd68c3c522862d95e167b85f",
    candidate: "tools/model-budget/optimized-out/assets/models/ou99/ab1278/ou99_464696.geoa.glb", candidateSha: "92373809c93556b7b1a82a315df51071c5a65a11ebc1d240e4e2087bdf38403a",
  },
  {
    modelKey: "ou99.498341", original: "914f4225e2418b1b038c84a31bf32f706d38bbf1e6ff7609103317132a77937f",
    candidate: "tools/model-budget/optimized-out/assets/models/ou99/ab1278/ou99_498341.geoa.glb", candidateSha: "ceee652e34be4500e33d90909ed912943bab55be90a50ee06217112822174bcd",
  },
] as const;

const log: unknown[] = [];
for (const s of SOURCES) {
  const doc = JSON.parse(readFileSync(resolve(root, "models", `${s.modelKey}.json`), "utf8"));
  const path = resolve(root, doc.glbPath);
  const found = sha256(new Uint8Array(readFileSync(path)));
  if (found === s.original) {
    const candidate = new Uint8Array(readFileSync(resolve(s.candidate)));
    if (sha256(candidate) !== s.candidateSha) throw new Error(`⛔ 候選 ${s.candidate} 的雜湊不是驗收過的那一份 —— 停手`);
    const normalized = await normalizeUploadedModel(candidate, { resizeImage: resizeImageWithFfmpeg });
    log.push({ source: s.modelKey, before: await summary(new Uint8Array(readFileSync(path))), after: await summary(normalized.bytes) });
    if (WRITE) atomicWrite(path, normalized.bytes);
  } else {
    const current = await summary(new Uint8Array(readFileSync(path)));
    // ⭐ 重跑：已經是 ≤8,000 面的產出就略過；其餘一律停
    if (current.triangles > 8000) throw new Error(`⛔ ${s.modelKey} 來源雜湊 ${found.slice(0, 16)} 不是預期的原檔，也不是本工具的產出 —— 停手`);
    log.push({ source: s.modelKey, skipped: "已是本工具的產出", current });
  }
}

type Step =
  | { heroId: string; action: "register"; sourceModelKey: string; label: string; source: Extract<ModelVersionCommand, { action: "register" }>["source"] }
  | { heroId: string; action: "activate"; sourceModelKey: string };
const STEPS: Step[] = [
  {
    heroId: "godie-umal", action: "register", sourceModelKey: "ou99.464696", label: "ou99 拳四郎（本尊·減面＋逐動作顯示）",
    source: { kind: "exact", character: "拳四郎", work: "北斗神拳", library: "ou99 偶久網", reference: "https://www.ou99.com/thread-464696-1-1.html", tier: "w3x", selectionClass: "community-mod" },
  },
  {
    heroId: "godie-e00r", action: "register", sourceModelKey: "ou99.498341", label: "ou99 初號機（本尊·減面＋逐動作顯示）",
    source: { kind: "exact", character: "初號機", work: "新世紀福音戰士", library: "ou99 偶久網", reference: "https://www.ou99.com/thread-498341-1-1.html", tier: "w3x", selectionClass: "community-mod" },
  },
  { heroId: "godie-h02k", action: "activate", sourceModelKey: "ou99.463344" },
];

for (const step of STEPS) {
  const service = new ModelVersions(root);
  const before = service.state(step.heroId);
  for (const version of before.versions) service.verify(version);
  const champion = service.champion(step.heroId);
  let command: ModelVersionCommand;
  if (step.action === "activate") {
    const target = before.versions.find((v: ChampionModelVersion) => v.sourceModelKey === step.sourceModelKey);
    if (!target) throw new Error(`⛔ ${step.heroId} 沒有來源是 ${step.sourceModelKey} 的版本`);
    if (champion.modelKey === target.modelKey) { log.push({ heroId: step.heroId, skipped: "已是作用中" }); continue; }
    command = zModelVersionCommand.parse({ action: "activate", expectedHash: before.expectedHash, modelKey: target.modelKey });
  } else {
    if (before.versions.some((v: ChampionModelVersion) => v.label === step.label)) { log.push({ heroId: step.heroId, skipped: "已註冊" }); continue; }
    // 試算時來源還沒就地更新 ⇒ 註冊會被採用政策擋（>10,000 面），明說略過
    if (!WRITE) { log.push({ heroId: step.heroId, skipped: "試算：來源要 --write 才會更新" }); continue; }
    command = zModelVersionCommand.parse({ action: "register", expectedHash: before.expectedHash, sourceModelKey: step.sourceModelKey, label: step.label, source: step.source });
  }
  const prepared = await service.prepare(step.heroId, command);
  let next = prepared.champion;
  const wanted = step.action === "activate" ? next.modelKey : prepared.artifacts.at(-1)!.version.modelKey;
  if (next.modelKey !== wanted) next = { ...next, modelKey: wanted, modelSelectionMode: "manual" };
  log.push({ heroId: step.heroId, action: step.action, mode: `${champion.modelSelectionMode ?? "automatic"} → ${next.modelSelectionMode}`, from: champion.modelKey, to: next.modelKey });
  if (!WRITE) continue;
  service.assertCurrent(step.heroId, before.expectedHash);
  service.writeArtifacts(prepared.artifacts);
  for (const artifact of prepared.artifacts) service.verify(artifact.version);
  const championPath = resolve(root, "champions", `${step.heroId}.json`);
  const raw = readFileSync(championPath, "utf8");
  service.assertCurrent(step.heroId, before.expectedHash);
  atomicWrite(championPath, spliceMembers(raw, { modelKey: next.modelKey, modelVersions: next.modelVersions, modelSelectionMode: next.modelSelectionMode }));
  const after = new ModelVersions(root).state(step.heroId);
  for (const version of after.versions) new ModelVersions(root).verify(version);
  for (const version of before.versions) {
    if (!after.versions.some((candidate: ChampionModelVersion) => contentSha256(candidate) === contentSha256(version))) throw new Error(`⛔ 版本歷史少了一筆：${step.heroId}/${version.modelKey}`);
  }
}
console.log(JSON.stringify({ write: WRITE, log }, null, 2));
