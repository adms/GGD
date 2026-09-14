/**
 * 🧭 把模型面向普查**量到的** yaw 寫回模型文件 —— ⛔ 不是猜，不是家族規則。
 *
 * 量尺是 `apps/client/src/render/views/modelFacing.test.ts`（GH#216）：
 * 「the SHIPPED offset equals the offset each model's own geometry requires」——
 * 從 GLB 的左右骨架對（chirality，n≥3、coherence≥0.99）量出模型需要轉幾度，
 * 而它自帶校準（imported.heroryuk 必須被重新量成 270°）。
 * 2026-09-15 合併 PR #1152 之後，GLB 真的進了 git ⇒ 普查第一次量得到它們 ⇒ 35 份文件的 yaw 對不上；
 * 其中 godie-ogld（美白大法師）的**作用中**身體差 90° ＝ 比賽裡側著走。
 *
 * ⚠️ 根因：ou99 批次的標準化把 `yawOffsetDeg: 0` 寫死進文件（或留空讓路徑家族規則給 0），
 *    ⛔ 而 WC3 轉出來的模型多半要 90°（少數 270°）。
 *
 * 輸入 `measured-yaw-20260915.json` 是那條測試在 ed7311d92 上的失敗輸出逐列抄出的 {modelKey: 度數}。
 *
 *   node --import tsx tools/model-fix/apply-measured-yaw.mts tools/model-fix/measured-yaw-20260915.json
 *
 * 三件事：① `spliceMembers` 只改 `yawOffsetDeg`（⛔ 不重新序列化整份）② 被改到的 `version.body.*`
 * 在每位英雄的 `modelVersions` 重算 `modelSha256` ③ 用 `ModelVersions.verify()` 驗全部版本。
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { contentSha256 } from "../../packages/shared/src/content/import/jcs";
import { spliceMembers } from "../../packages/shared/src/content/editModel";
import { zModelDoc } from "../../packages/shared/src/content/schema/model";
import { ModelVersions } from "../../apps/content-api/src/modelVersions";

const ROOT = join(import.meta.dirname, "../..");
const C = join(ROOT, "content");
const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const measured: Record<string, number> = readJson(process.argv[2]!);

const touched = new Map<string, unknown>();
for (const [key, deg] of Object.entries(measured)) {
  if (![0, 90, 180, 270].includes(deg)) throw Error(`${key}: 量到的不是四分之一圈（${deg}）`);
  const file = join(C, "models", `${key}.json`);
  const text = readFileSync(file, "utf8");
  const doc = JSON.parse(text);
  if (doc.yawOffsetDeg === deg) continue;
  const next = spliceMembers(text, { yawOffsetDeg: deg });
  const parsed = zModelDoc.parse(JSON.parse(next));          // ⛔ 寫之前先過 schema
  writeFileSync(file, next);
  touched.set(key, parsed);
  console.log(`① ${key.slice(0, 40).padEnd(40)} yawOffsetDeg ${doc.yawOffsetDeg ?? "(家族規則)"} → ${deg}`);
}

const champDir = join(C, "champions");
let rehashed = 0;
for (const f of readdirSync(champDir).filter((x) => x.endsWith(".json") && !x.startsWith("_"))) {
  const raw = readFileSync(join(champDir, f), "utf8");
  const champ = readJson(join(champDir, f));
  const versions: { modelKey: string; modelSha256: string }[] = champ.modelVersions ?? [];
  let changed = false;
  const next = versions.map((v) => {
    const doc = touched.get(v.modelKey);
    if (!doc) return v;
    const modelSha256 = contentSha256(doc).slice(7);
    if (v.modelSha256 === modelSha256) return v;
    changed = true; rehashed += 1;
    return { ...v, modelSha256 };
  });
  if (!changed) continue;
  writeFileSync(join(champDir, f), spliceMembers(raw, { modelVersions: next }));
  console.log(`② ${f.replace(".json", "")}：modelVersions 雜湊更新`);
}

const service = new ModelVersions(C);
let verified = 0; const failed: string[] = [];
for (const f of readdirSync(champDir).filter((x) => x.endsWith(".json") && !x.startsWith("_"))) {
  for (const v of readJson(join(champDir, f)).modelVersions ?? []) {
    try { service.verify(v); verified += 1; } catch (e) { failed.push(`${f}:${v.modelKey}: ${(e as Error).message}`); }
  }
}
console.log(JSON.stringify({ modelDocsTouched: touched.size, versionEntriesRehashed: rehashed, verified, verifyFailed: failed.length }));
if (failed.length) { console.error(failed.slice(0, 10).join("\n")); process.exitCode = 1; }
