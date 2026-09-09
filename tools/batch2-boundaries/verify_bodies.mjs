#!/usr/bin/env node
/**
 * ⭐⭐ **五道界線④「遊戲畫面驗收」對一顆身體的可判版本。**
 *
 * ⚠️ 測試環境（NullEngine）**畫不出像素** —— 這份 repo 記錄過那個教訓：
 *   ⛔ 那不是藉口，⭐ 是「我沒有把驗收標準翻成可判的不變量」。
 *
 * ⇒ 一顆身體「會不會在畫面上動起來」可以**不渲染就判得出來**：
 *   ① 有幾何（頂點數 > 100）—— ⛔ 零頂點的 mesh 畫出來是空的
 *   ② 有骨架（skin 的 joints ≥ 20）—— ⛔ 沒骨架的身體不會動
 *   ③ 六個用途的 clip **都在**，⛔ 而且每一段至少動到一根骨
 *   ④ ⛔ 沒有 NaN／Inf（一個 NaN 頂點會把整個 mesh 吃掉）
 *   ⑤ 高度落在人形區間（0.5–2.5）—— ⛔ 0.001 或 300 都是單位搞錯了
 *
 * ⭐ 五條**任何一條不過就是紅**，⛔ 不是警告。
 *
 *   node tools/batch2-boundaries/verify_bodies.mjs --bytes <目錄> [--check]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const INDEX = join(REPO, "docs/_reports/batch2-37-bodies/index.json");
const OUT = join(REPO, "docs/_reports/batch2-37-bodies/screen-verification.json");
const PURPOSES = ["idle", "run", "attack", "cast", "hurt", "death"];

const args = process.argv.slice(2);
const bytesDir = args[args.indexOf("--bytes") + 1];
if (!bytesDir || !existsSync(bytesDir)) {
  console.error("⛔ --bytes <目錄> 必填 —— ⭐ 位元組住 S3，這一支要在有它們的地方跑");
  process.exit(2);
}

function glbDoc(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error("不是 glTF 二進位");
  const jlen = dv.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(buf.subarray(20, 20 + jlen)));
}

const idx = JSON.parse(readFileSync(INDEX, "utf8"));
const results = {};
for (const [hid, meta] of Object.entries(idx.bodies ?? {})) {
  const p = join(bytesDir, `${meta.sha256}.glb`);
  if (!existsSync(p)) { results[hid] = { ok: false, why: `⛔ 位元組不在 ${bytesDir}` }; continue; }
  const buf = readFileSync(p);
  const doc = glbDoc(buf);
  const acc = doc.accessors ?? [];
  const verts = Math.max(0, ...(doc.meshes ?? []).flatMap((m) =>
    m.primitives.map((pr) => acc[pr.attributes?.POSITION ?? -1]?.count ?? 0)));
  const joints = Math.max(0, ...(doc.skins ?? []).map((s) => (s.joints ?? []).length));
  const anims = new Map((doc.animations ?? []).map((a) => [a.name, a]));
  const clipMap = JSON.parse(readFileSync(join(REPO, meta.modelDoc), "utf8")).clipMap ?? {};
  const missing = PURPOSES.filter((k) => !anims.has(clipMap[k]));
  const still = PURPOSES.filter((k) => (anims.get(clipMap[k])?.channels ?? []).length === 0);
  const nan = acc.some((a) => [...(a.min ?? []), ...(a.max ?? [])]
    .some((x) => typeof x === "number" && !Number.isFinite(x)));
  const pos = acc.find((a) => a.type === "VEC3" && Array.isArray(a.min));
  const height = pos ? Number((pos.max[1] - pos.min[1]).toFixed(4)) : null;
  const fails = [];
  if (verts <= 100) fails.push(`頂點只有 ${verts}`);
  if (joints < 20) fails.push(`骨頭只有 ${joints}`);
  if (missing.length) fails.push(`缺 clip: ${missing.join("／")}`);
  if (still.length) fails.push(`clip 沒有 channel: ${still.join("／")}`);
  if (nan) fails.push("有 NaN／Inf");
  if (height === null || height < 0.5 || height > 2.5) fails.push(`高度 ${height} 不像人形`);
  results[hid] = { ok: fails.length === 0, verts, joints, height,
                   clips: Object.fromEntries(PURPOSES.map((k) => [k, clipMap[k] ?? null])),
                   ...(fails.length ? { fails } : {}) };
}
const doc = {
  schema: "ggd-batch2-body-screen-verification@1",
  note: ("⭐ 五道界線④的**可判版本** —— ⛔ 不渲染也判得出「它會不會在畫面上動起來」。"
    + "產生器 tools/batch2-boundaries/verify_bodies.mjs，⛔ 不要手改。"),
  purposes: PURPOSES,
  passed: Object.values(results).filter((r) => r.ok).length,
  total: Object.keys(results).length,
  bodies: results,
};
const json = JSON.stringify(doc, null, 2) + "\n";
if (args.includes("--check")) {
  if (!existsSync(OUT) || readFileSync(OUT, "utf8") !== json) {
    console.error("⛔ screen-verification.json 過期 ⇒ 重跑 verify_bodies.mjs");
    process.exit(1);
  }
  console.log(`batch2:bodies:verify OK（${doc.passed}/${doc.total}）`);
} else {
  writeFileSync(OUT, json);
  console.log(`✅ ${OUT}（通過 ${doc.passed}/${doc.total}）`);
  for (const [h, r] of Object.entries(results)) if (!r.ok) console.log(`  ⛔ ${h}: ${(r.fails ?? [r.why]).join("・")}`);
}
