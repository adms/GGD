/**
 * 🔗 把「已凍結、位元組在 git、卻沒有任何英雄引用」的模型版本**接回**某位英雄的版本清單。
 *
 * ⭐ 用途（GH#1181 收尾）：卡比 `community-review-06-20260907` 當年缺席的 GLB `7bf3e20c…`（4×2 卡通調色盤，
 *   ⛔ 不是佔位圖）已找回並凍結成 `version.body.6484c748…`，⛔ 但沒有英雄卡引用它 ⇒ 後台「上線模型版本」下拉**切不回去**。
 * ⭐ 只**新增**一列版本，⛔ 不改作用中的 `modelKey`、⛔ 不動 `modelSelectionMode`、⛔ 不動任何既有版本列
 *   ⇒ 玩家畫面一個像素都不變；後台下拉多一個選項＝一鍵 rollback 的出口。
 * ⭐ 雜湊與後台同一條路：`modelSha256 = contentSha256(doc)`、`binarySha256 = sha256(bytes)`，寫完用
 *   `ModelVersions.verify()` 逐列重驗，並確認版本歷史一列都沒少（同 `register-normalized-version.mts`）。
 *
 *   node --import tsx tools/model-fix/relink-frozen-version.mts --hero <id> --version <version.body.…> \
 *     --label <下拉顯示名> --character <角色> [--work <作品>] [--write]
 *   （不帶 --write 只試算，⛔ 一個位元組都不寫）
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ModelVersions } from "../../apps/content-api/src/modelVersions";
import { contentSha256 } from "../../packages/shared/src/content/import/jcs";
import { spliceMembers } from "../../packages/shared/src/content/editModel";
import { MODEL_VERSION_PREFIX, zChampionModelVersion, type ChampionModelVersion } from "../../packages/shared/src/content/schema/championModelVersions";
import { zModelDoc } from "../../packages/shared/src/content/schema/model";

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const need = (name: string): string => arg(name) ?? (console.error(`⛔ 缺 --${name}`), process.exit(2));
const WRITE = process.argv.includes("--write");
const heroId = need("hero"), modelKey = need("version"), label = need("label"), character = need("character");
const work = arg("work") ?? "原上線內容";

const root = resolve(import.meta.dirname, "../../content");
const service = new ModelVersions(root);
const before = service.state(heroId);
if (!modelKey.startsWith(MODEL_VERSION_PREFIX)) { console.error(`⛔ ${modelKey} 不是凍結版本（要以 ${MODEL_VERSION_PREFIX} 開頭）`); process.exit(2); }
if (before.versions.some((v) => v.modelKey === modelKey)) { console.log(`✓ ${heroId} 的版本清單已經有 ${modelKey}，不必接`); process.exit(0); }

const docFile = resolve(root, "models", `${modelKey}.json`);
if (!existsSync(docFile)) { console.error(`⛔ 找不到 ${docFile}`); process.exit(2); }
const doc = zModelDoc.parse(JSON.parse(readFileSync(docFile, "utf8")));
if (!doc.bodyVersion) { console.error(`⛔ ${modelKey} 沒有 bodyVersion —— 它不是凍結身體`); process.exit(2); }
const bytes = readFileSync(resolve(root, doc.glbPath));
const version: ChampionModelVersion = zChampionModelVersion.parse({
  modelKey, label, sourceModelKey: doc.bodyVersion.sourceModelKey,
  modelSha256: contentSha256(doc).slice(7),
  binarySha256: createHash("sha256").update(bytes).digest("hex"),
  registeredAt: new Date().toISOString(),
  source: { kind: "previous", character, work, library: "GGD", reference: `models/${modelKey}.json`, tier: "original" },
});
service.verify(version);
console.log(`${WRITE ? "寫入" : "試算"}：${heroId} 新增版本「${label}」→ ${doc.glbPath}（binary ${version.binarySha256.slice(0, 12)}…）；作用中維持 ${before.activeModelKey}`);
if (!WRITE) process.exit(0);

const championPath = resolve(root, "champions", `${heroId}.json`);
const raw = readFileSync(championPath, "utf8");
const temporary = `${championPath}.${randomUUID()}.tmp`;
try {
  writeFileSync(temporary, spliceMembers(raw, { modelVersions: [...before.versions, version] }), { flag: "wx" });
  service.assertCurrent(heroId, before.expectedHash);
  renameSync(temporary, championPath);
} finally {
  if (existsSync(temporary)) unlinkSync(temporary);
}
const after = new ModelVersions(root).state(heroId);
for (const v of after.versions) new ModelVersions(root).verify(v);
for (const v of before.versions) {
  if (!after.versions.some((c) => contentSha256(c) === contentSha256(v))) throw new Error(`⛔ 版本歷史少了一筆：${heroId}/${v.modelKey}`);
}
if (after.activeModelKey !== before.activeModelKey) throw new Error(`⛔ 作用中模型被改了：${before.activeModelKey} → ${after.activeModelKey}`);
console.log(`✓ ${heroId}：版本 ${before.versions.length} → ${after.versions.length}，逐列 verify 通過，作用中不變`);
