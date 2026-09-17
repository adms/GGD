/**
 * 🔻 owner 2026-09-15 的三件模型：哆啦A夢減面、臭作減面、超夢 Hero Forge 預設（魔人普烏）貼圖 256。
 *
 * owner（逐字）：
 * > 2026-09-15「3. godie-o030、godie-orkn 給我看 before/after阿」「4. godie-n00b 減面阿」
 * >           「5. 超夢在 Hero Forge 的預設模型：跟 godie-huth 用的是同一個模型檔 都給我看阿」
 * > 2026-09-10「超過一萬面 減面到 8000以下 並且要通過檢驗 通過以後原始檔一樣保留只是放到S3 只有正式採用才放到git」
 *
 * ① **來源就地更新**（⛔ 凍結版本一個位元組都不動 ⇒ 後台下拉裡的舊版本就是 rollback）
 *    · `imported.doraemon-cat`：09-10 已減到 7,864 面並過 A/B（fd90b7a3d：亮像素 −0.28%），但仍是 22 個 primitive
 *      ⇒ 後台正規化不合併它、預算閘擋「繪製網格 22 超過英雄模型上限 6」。這裡用 `model_intake --merge` 同一支
 *      `merge_glb_prims` 合成 3 個，再過 `normalizeUploadedModel`（貼圖 256）。
 *      ⚠️ 作用中的 `ou99.496905` 是**同一份匯出**的合併版（93 骨、36 動作、5,400 通道逐項相同），09-10 直接減它會把紅披風吃掉（−10.29%）
 *      ⇒ ⭐ 先減（22 塊各自減）再合併，⛔ 不是合併後再減。
 *    · `imported.herobuu`：貼圖 512 → 256（`acquired-mewtwo` 的 Hero Forge 暫代模型直接讀這個來源檔）。
 *    每一顆先比對來源 SHA-256，對不上就停（⛔ 不在別人改過的檔上疊）。
 * ② **註冊並切成作用中**：與後台「新增版本」同一條 `ModelVersions.prepare({ action: "register" })`
 *    · godie-n00b ← imported.doraemon-cat（家族朝向 90°，與原上線模型一致）
 *    · godie-o030／godie-orkn ← ou99.456546（09-10 已減到 7,999 面、09-11 已 256；朝向由 measured-yaw-20260915-biped.json 補成 90°）
 *
 *   node --import tsx tools/model-fix/register-owner-0915-bodies.mts [--write]
 *   （不帶 --write 只試算，⛔ 一個位元組都不寫）
 */
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ModelVersions } from "../../apps/content-api/src/modelVersions";
import { resizeImageWithFfmpeg } from "../../apps/content-api/src/resizeImage.node";
import { contentSha256 } from "../../packages/shared/src/content/import/jcs";
import { spliceMembers } from "../../packages/shared/src/content/editModel";
import { inspectModelUpload } from "../../packages/shared/src/content/modelUpload/inspect";
import { normalizeUploadedModel } from "../../packages/shared/src/content/modelUpload/normalize";
import { zModelVersionCommand, type ChampionModelVersion } from "../../packages/shared/src/content/schema/championModelVersions";

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
  { modelKey: "imported.doraemon-cat", expect: "56ab7b8aea6618ed2ba47f410675eb4dce44d0a3e117e595e0930bf786900198", mergePrimitives: true },
  { modelKey: "imported.herobuu", expect: "99f18391788367a91b8afacae159a89a351fcbe470f36a29f6dd195e72cc714d", mergePrimitives: false },
] as const;

const log: unknown[] = [];
for (const s of SOURCES) {
  const doc = JSON.parse(readFileSync(resolve(root, "models", `${s.modelKey}.json`), "utf8"));
  const path = resolve(root, doc.glbPath);
  let bytes = new Uint8Array(readFileSync(path));
  const found = sha256(bytes);
  if (found === s.expect) {
    const before = await summary(bytes);
    if (s.mergePrimitives) {
      const scratch = join(mkdtempSync(join(tmpdir(), "owner0915-")), "merge.glb");
      copyFileSync(path, scratch);
      execFileSync("python3", ["-c", "import sys; sys.path.insert(0, 'tools/w3x-import'); from merge_glb_prims import merge; print(merge(sys.argv[1]))", scratch], { stdio: "inherit" });
      bytes = new Uint8Array(readFileSync(scratch));
    }
    const normalized = await normalizeUploadedModel(bytes, { resizeImage: resizeImageWithFfmpeg });
    const after = await summary(normalized.bytes);
    log.push({ source: s.modelKey, before, after });
    if (WRITE) atomicWrite(path, normalized.bytes);
  } else {
    const current = await summary(bytes);
    // ⭐ 重跑：已經是這支產出的版面（draw ≤ 6、貼圖 ≤ 256）就略過；其餘一律停
    if (current.drawCalls > 6 || current.textures.some((edge) => edge > 256)) throw new Error(`⛔ ${s.modelKey} 來源雜湊 ${found.slice(0, 16)} 不是預期的 ${s.expect.slice(0, 16)}，也不是本工具的產出 —— 停手`);
    log.push({ source: s.modelKey, skipped: "已是本工具的產出", current });
  }
}

const REGISTER = [
  { heroId: "godie-n00b", sourceModelKey: "imported.doraemon-cat", label: "原上線模型（減面 7,864 面＋貼圖 256）", provenance: "origin" },
  { heroId: "godie-o030", sourceModelKey: "ou99.456546", label: "ou99 「动漫卡尔斯」（相似造型）（減面 7,999 面＋貼圖 256）", provenance: "active" },
  { heroId: "godie-orkn", sourceModelKey: "ou99.456546", label: "ou99 「动漫卡尔斯」（相似造型）（減面 7,999 面＋貼圖 256）", provenance: "active" },
] as const;

for (const r of REGISTER) {
  const service = new ModelVersions(root);
  const before = service.state(r.heroId);
  for (const version of before.versions) service.verify(version);
  const champion = service.champion(r.heroId);
  if (before.versions.some((v: ChampionModelVersion) => v.label === r.label)) { log.push({ heroId: r.heroId, skipped: "已註冊" }); continue; }
  // 試算時來源還沒就地更新 ⇒ 吃那份來源的註冊算不出來（會被預算閘擋），明說略過
  if (!WRITE && SOURCES.some((s) => s.modelKey === r.sourceModelKey)) { log.push({ heroId: r.heroId, skipped: "試算：來源要 --write 才會更新" }); continue; }
  const active = before.versions.find((v: ChampionModelVersion) => v.modelKey === champion.modelKey)!;
  const source = r.provenance === "active" ? active.source : {
    kind: "exact" as const, character: champion.name, work: "原上線內容", library: "GGD", reference: `models/${r.sourceModelKey}.json`, tier: "w3x" as const,
  };
  const automatic = (champion.modelSelectionMode ?? "automatic") === "automatic";
  const prepared = await service.prepare(r.heroId, zModelVersionCommand.parse({
    action: "register", expectedHash: before.expectedHash, sourceModelKey: r.sourceModelKey, label: r.label, source,
    ...(automatic ? { automaticEligible: true } : {}),
  }));
  const added = prepared.artifacts.at(-1)!;
  let next = prepared.champion;
  if (next.modelKey !== added.version.modelKey) next = { ...next, modelKey: added.version.modelKey, modelSelectionMode: "manual" };
  const activeDoc = JSON.parse(readFileSync(resolve(root, "models", `${champion.modelKey}.json`), "utf8"));
  log.push({
    heroId: r.heroId, mode: `${champion.modelSelectionMode ?? "automatic"} → ${next.modelSelectionMode}`,
    from: { modelKey: champion.modelKey, yaw: activeDoc.yawOffsetDeg, ...(await summary(new Uint8Array(readFileSync(resolve(root, activeDoc.glbPath))))) },
    to: { modelKey: added.version.modelKey, yaw: added.doc.yawOffsetDeg, glbPath: added.doc.glbPath, ...(await summary(added.bytes)) },
  });
  if (!WRITE) continue;
  service.assertCurrent(r.heroId, before.expectedHash);
  service.writeArtifacts(prepared.artifacts);
  for (const artifact of prepared.artifacts) service.verify(artifact.version);
  const championPath = resolve(root, "champions", `${r.heroId}.json`);
  const raw = readFileSync(championPath, "utf8");
  service.assertCurrent(r.heroId, before.expectedHash);
  atomicWrite(championPath, spliceMembers(raw, { modelKey: next.modelKey, modelVersions: next.modelVersions, modelSelectionMode: next.modelSelectionMode }));
  const after = new ModelVersions(root).state(r.heroId);
  for (const version of after.versions) new ModelVersions(root).verify(version);
  for (const version of before.versions) {
    if (!after.versions.some((candidate: ChampionModelVersion) => contentSha256(candidate) === contentSha256(version))) throw new Error(`⛔ 版本歷史少了一筆：${r.heroId}/${version.modelKey}`);
  }
}
console.log(JSON.stringify({ write: WRITE, log }, null, 2));
