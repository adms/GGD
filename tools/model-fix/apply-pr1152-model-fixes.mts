/**
 * 🩹 PR #1152 合進 main 之前的模型修補 —— 讓 `vfxassets:check` 與 `models:check` 由紅轉綠，
 * ⭐ 而且**不放寬任何一條閘**、**不破壞版本登記的雜湊綁定**。
 *
 * owner 2026-09-14：「請你驗收合併這張票 解決英雄殿跟遊戲回合中 model, 特效, 音效, 語音 等遺漏與不足之處」
 *
 * ## 為什麼是「原地修＋雜湊傳播」，⛔ 不是重新登記
 * - 這些文件**全部是 PR 新增、還沒出貨**（main 上一份都沒有）⇒ 修正草稿，⛔ 不是改寫已發布的歷史。
 * - `ModelVersions.freeze()` 的 id 取自當時的外觀；⛔ 從**現在的**來源重新登記會把**別顆位元組**登記進來
 *   （量過：`version.body.2226d94…` 的來源 `ou99.495015` 現在是 2 個圖元，而已登記的版本是 5 個）。
 * - ⭐ `ModelVersions.verify()` 在後台切換時比對 `modelSha256`／`binarySha256`
 *   ⇒ 這支**用它自己的 `contentSha256` 與 zod parse** 重算，最後逐一跑 `verify()` 當證據。
 *
 * ## 三種修
 *  ① 貼圖背板：`fix_glb_textures.py` 產出的新位元組 → 每一份引用舊 GLB 的文件改指新檔（內容定址）
 *  ② 殘留幾何：凍結版本**弄丟了**來源上的 `hiddenPrimitives` ⇒ 補回（圖元編號用閘對**版本自己的 GLB** 量到的）
 *  ③ 雜湊傳播：每一份被改到的 `version.body.*` → 重算 `modelSha256`／`binarySha256` → 寫回每一位英雄的 `modelVersions`
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { contentSha256 } from "../../packages/shared/src/content/import/jcs";
import { spliceMembers } from "../../packages/shared/src/content/editModel";
import { zModelDoc } from "../../packages/shared/src/content/schema/model";
import { ModelVersions } from "../../apps/content-api/src/modelVersions";

const ROOT = join(import.meta.dirname, "../..");
const C = join(ROOT, "content");
const sha = (b: Uint8Array | Buffer) => createHash("sha256").update(b).digest("hex");
const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8"));

const textures: { key: string; oldGlb: string; newSha: string }[] = readJson(process.argv[2]);
const FIXED_DIR = dirname(process.argv[2]);
const GORE: Record<string, number> = {           // 閘對每一顆**版本 GLB** 量到的殘留圖元
  "4c4c6b29b0a10ee3f95c2855c8417c318495a1a22ab9e924b61647d46d830702.glb": 1,
  "981134292fed0b71c90169cf15ef258874cccb78f0eb688037e6ccb699c6ebd3.glb": 2,
  "cea1b7329f3fa45947bfb508de838b1a4727ec8f450e012aa230a19a3305c724.glb": 1,
  "250f873ccdd2a6111cdcd041cd94f9c054a0a598b76cabf5bbb3bbe85be0b160.glb": 2,
  "226f31c83d149dc843be270fb79116e4ab8067516bd74139c0c0558e7b3faffb.glb": 1,
  "70752c0f9056ee76741657630e2ef1081dee058e424fd8205a8a23cf57e2c515.glb": 2,
  "52eef1bdd02b3d903ca50f58fad639f626a0b96be078d1fdb0d030ea141fa03d.glb": 2,
};

// ── 全部模型文件（原文字，⭐ 用 spliceMembers 只動要動的欄位，⛔ 不重新序列化整份）──
const modelFiles = readdirSync(join(C, "models")).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
const text = new Map<string, string>();
const docOf = new Map<string, any>();
for (const f of modelFiles) { const t = readFileSync(join(C, "models", f), "utf8"); text.set(f, t); docOf.set(f, JSON.parse(t)); }
const touched = new Set<string>();
const oldGlbFiles = new Set<string>();

// ① 貼圖背板
for (const fix of textures) {
  const oldBase = basename(fix.oldGlb);
  const fixedBytes = readFileSync(join(FIXED_DIR, `${fix.newSha}.glb`));
  if (sha(fixedBytes) !== fix.newSha) throw Error(`修好的位元組雜湊對不上：${fix.newSha}`);
  for (const [f, d] of docOf) {
    if (!d.glbPath || basename(d.glbPath) !== oldBase) continue;
    const newPath = `${dirname(d.glbPath)}/${fix.newSha}.glb`;
    mkdirSync(join(C, dirname(newPath)), { recursive: true });
    if (!existsSync(join(C, newPath))) copyFileSync(join(FIXED_DIR, `${fix.newSha}.glb`), join(C, newPath));
    oldGlbFiles.add(d.glbPath);
    const t = spliceMembers(text.get(f)!, { glbPath: newPath });
    text.set(f, t); docOf.set(f, JSON.parse(t)); touched.add(f);
    console.log(`① ${d.id.slice(0, 34)}  ${oldBase.slice(0, 12)} → ${fix.newSha.slice(0, 12)}`);
  }
}
// ② 殘留幾何宣告（⭐ 每一份引用那顆 GLB 的文件都要補，⛔ 只補一份的話切到另一份就又看到屍體）
for (const [glb, prim] of Object.entries(GORE)) {
  let n = 0;
  for (const [f, d] of docOf) {
    if (!d.glbPath || basename(d.glbPath) !== glb) continue;
    const have: number[] = d.hiddenPrimitives ?? [];
    if (have.includes(prim)) continue;
    const t = spliceMembers(text.get(f)!, { hiddenPrimitives: [...have, prim].sort((a, b) => a - b) });
    text.set(f, t); docOf.set(f, JSON.parse(t)); touched.add(f); n += 1;
    console.log(`② ${d.id.slice(0, 34)}  hiddenPrimitives += [${prim}]`);
  }
  if (!n) console.log(`⚠️ ${glb.slice(0, 12)} 沒有文件需要補（已宣告？）`);
}
for (const f of touched) zModelDoc.parse(docOf.get(f));   // ⛔ 寫之前先過 schema
for (const f of touched) writeFileSync(join(C, "models", f), text.get(f)!);

// ③ 雜湊傳播到英雄的 modelVersions
const byKey = new Map<string, any>();
for (const [, d] of docOf) byKey.set(d.id, d);
const champDir = join(C, "champions");
let entries = 0;
const touchedKeys = new Set([...touched].map((f) => docOf.get(f).id));
for (const f of readdirSync(champDir).filter((x) => x.endsWith(".json") && !x.startsWith("_"))) {
  const raw = readFileSync(join(champDir, f), "utf8");
  const champ = JSON.parse(raw);
  const versions: any[] = champ.modelVersions ?? [];
  let changed = false;
  const next = versions.map((v) => {
    if (!touchedKeys.has(v.modelKey)) return v;
    const doc = zModelDoc.parse(byKey.get(v.modelKey));
    const modelSha256 = contentSha256(doc).slice(7);
    const binarySha256 = sha(readFileSync(join(C, doc.glbPath)));
    if (v.modelSha256 === modelSha256 && v.binarySha256 === binarySha256) return v;
    changed = true; entries += 1;
    return { ...v, modelSha256, binarySha256 };
  });
  if (!changed) continue;
  writeFileSync(join(champDir, f), spliceMembers(raw, { modelVersions: next }));
  console.log(`③ ${f.replace(".json", "")}：modelVersions 雜湊更新`);
}

// ④ ⭐ 證據：用 ModelVersions 自己的 verify() 逐一驗「每一位英雄的每一個版本」
const service = new ModelVersions(C);
let verified = 0; const failed: string[] = [];
for (const f of readdirSync(champDir).filter((x) => x.endsWith(".json") && !x.startsWith("_"))) {
  for (const v of readJson(join(champDir, f)).modelVersions ?? []) {
    try { service.verify(v); verified += 1; } catch (e) { failed.push(`${f}:${v.modelKey}: ${(e as Error).message}`); }
  }
}
// ⑤ 舊 GLB：沒有任何文件再引用才刪（⛔ 還有人引用就留著）
// ⛔⛔ 2026-09-14 第一版只問了 content/models ⇒ 刪掉 3 顆仍被中央素材庫（priority-runtime-options.json）釘住的神劍闖江湖 GLB，
//    current_resource_index.py 當場讀不到檔（假綠燈⑫：只從一頭走）。⇒ 兩頭都問：materials/ 裡還有人寫著這個 sha 就不刪。
const stillUsed = new Set([...byKey.values()].map((d) => d.glbPath).filter(Boolean));
const catalogued = (p: string) =>
  spawnSync("git", ["grep", "-l", "-F", basename(p, ".glb"), "--", "materials"], { cwd: ROOT, encoding: "utf8" }).stdout.trim() !== "";
let removed = 0;
for (const p of oldGlbFiles) {
  if (stillUsed.has(p) || !existsSync(join(C, p))) continue;
  if (catalogued(p)) { console.log(`⑤ 留著 ${basename(p).slice(0, 12)}：materials/ 仍釘著它 —— 先把原件歸檔並改寫目錄（tools/model-fix/record_backdrop_repairs.py）`); continue; }
  rmSync(join(C, p)); removed += 1;
}

console.log(JSON.stringify({ modelDocsTouched: touched.size, versionEntriesRehashed: entries, verified, verifyFailed: failed.length, oldGlbRemoved: removed }));
if (failed.length) { console.error(failed.slice(0, 10).join("\n")); process.exitCode = 1; }
