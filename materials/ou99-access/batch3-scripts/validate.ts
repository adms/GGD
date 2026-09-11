/** 驗兩件事：① 22 份 model@1 文件過 Zod ② 22 顆 glb 過出貨的 inspectModelUpload。 */
import fs from "node:fs";
import path from "node:path";
import { validateDoc } from "/Users/Takuro/GGD/packages/shared/src/content/loader";
import { inspectModelUpload } from "/Users/Takuro/GGD/packages/shared/src/content/modelUpload/inspect";

const TIDS = ["283718","310996","328403","413694","454069","457710","457780","457874","459087","460977","463344","464696","466002","467165","469191","470225","470782","478121","495978","497213","497400","497746"];
const ROOT = "/Users/Takuro/GGD";
async function main() {
let bad = 0;
const rows: Record<string, unknown>[] = [];
for (const tid of TIDS) {
  const docPath = path.join(ROOT, `content/models/ou99.${tid}.json`);
  const doc = JSON.parse(fs.readFileSync(docPath, "utf8"));
  const row: Record<string, unknown> = { tid };
  try {
    const r = validateDoc("models", doc) as { ok: boolean; issues?: unknown[] };
    if (r.ok) row.zod = "ok";
    else { row.zod = `⛔ ${JSON.stringify(r.issues).slice(0, 300)}`; bad++; }
  } catch (e) { row.zod = `⛔ ${(e as Error).message.slice(0, 200)}`; bad++; }
  const bytes = new Uint8Array(fs.readFileSync(path.join(ROOT, "content", doc.glbPath)));
  try {
    const ins = await inspectModelUpload(bytes);
    const names = ins.clips.map((c) => c.name);
    const declared = Object.values(doc.clipMap) as string[];
    const missing = declared.filter((n) => !names.includes(n));
    const dupes = declared.filter((n) => names.filter((m) => m === n).length > 1);
    row.inspect = "ok";
    row.clips = ins.clips.length;
    row.tris = ins.triangles;
    row.meshes = ins.meshes;
    row.texMax = Math.max(...ins.textures.map((t) => Math.max(t.width, t.height)));
    if (missing.length) { row.missingClip = missing; bad++; }
    if (dupes.length) { row.nonUniqueClip = dupes; bad++; }
  } catch (e) { row.inspect = `⛔ ${(e as Error).message.slice(0, 200)}`; bad++; }
  rows.push(row);
}
console.log(JSON.stringify(rows, null, 1));
console.log(bad ? `⛔ 有問題 ${bad}` : "⭐ 22/22 全過");
process.exit(bad ? 1 : 0);
}
main();
