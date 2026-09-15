/**
 * 🔭 下拉選單的**即時預覽能不能載得起來** —— 逐一問後台與編輯器每一個可選的模型。
 *
 * owner 2026-09-15（逐字）：「請你比照最近上架的素材重新比對在後台上架 特別是下拉式選單 要能即時載入御覽」
 *
 * 預覽（`apps/admin/src/ui/ModelPreview.tsx` → 編輯器 `ModelPanel`）會做的事，這支逐項先問一次：
 *   ① 模型文件存在且過 `zModelDoc`（⛔ 文件壞 ⇒ ModelPanel 只顯示「Doc invalid」）
 *   ② `glbPath` 在磁碟上**而且在 git 裡**（content-api 從磁碟送；⭐ 出貨的是 git，⛔ 不是這台工作區）
 *   ③ GLB 的動作名單讀得出來，clipMap 六格都對得到（與預覽同一支 `resolveClip`：先精確、再大小寫不分）
 *   ④ 英雄的版本條目過 `ModelVersions.verify()`（⛔ 雜湊對不上 ⇒ 看得到卻「套用」不了）
 *
 * 範圍：每一位英雄的 `modelKey` ＋ `modelVersions[]`（後台「上線模型版本」）
 *       ＋ Hero Forge 的 `ACQUIRED_MODEL_OPTIONS`（編輯器「模型版本（僅此作品）」）。
 * ⛔ 它不看畫面長什麼樣：那是預覽本身的事（人看）；這支只保證「選了一定載得起來」。
 *
 *   node --import tsx tools/model-preview/audit-dropdown-preview.mts [--json <out>] [--since <git rev>]
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { zModelDoc } from "../../packages/shared/src/content/schema/model";
import { ACQUIRED_MODEL_OPTIONS } from "../../packages/shared/src/content/heroForge/communityAcquired";
import { ModelVersions } from "../../apps/content-api/src/modelVersions";
import { CLIP_STATES, resolveClip } from "../../apps/editor/src/preview3d/clips";

const ROOT = join(import.meta.dirname, "../..");
const C = join(ROOT, "content");
const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const tracked = new Set(execFileSync("git", ["ls-files", "--", "content/assets/models"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split("\n").filter(Boolean));
const since = arg("--since");
const touchedSince = since
  ? new Set(execFileSync("git", ["diff", "--name-only", since, "HEAD", "--", "content/models", "content/champions", "content/assets/models"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split("\n").filter(Boolean))
  : null;

function glbAnimations(file: string): string[] {
  const b = readFileSync(file);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error("不是 GLB（magic 不符）");
  const len = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + len).toString("utf8")) as { animations?: { name?: string }[] };
  return (json.animations ?? []).map((a, i) => a.name ?? `animation${i}`);
}

type Row = { surface: "admin-version" | "admin-active" | "hero-forge"; owner: string; modelKey: string; label?: string; problems: string[]; recent: boolean };
const rows: Row[] = [];
const service = new ModelVersions(C);
const docCache = new Map<string, { problems: string[]; glb?: string }>();

function checkModel(modelKey: string): { problems: string[]; glb?: string } {
  const hit = docCache.get(modelKey);
  if (hit) return hit;
  const problems: string[] = [];
  const file = join(C, "models", `${modelKey}.json`);
  let glb: string | undefined;
  if (!existsSync(file)) problems.push("模型文件不存在");
  else {
    const parsed = zModelDoc.safeParse(JSON.parse(readFileSync(file, "utf8")));
    if (!parsed.success) problems.push(`模型文件過不了 schema：${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`);
    else {
      glb = `content/${parsed.data.glbPath}`;
      if (!existsSync(join(ROOT, glb))) problems.push(`GLB 不在磁碟上：${glb}`);
      else {
        if (!tracked.has(glb)) problems.push(`GLB 不在 git 裡（出貨拿不到）：${glb}`);
        try {
          const groups = glbAnimations(join(ROOT, glb)).map((name) => ({ name }));
          const missing = CLIP_STATES.filter((s) => !resolveClip(groups, parsed.data.clipMap[s]));
          if (missing.length) problems.push(`clipMap 對不到動作：${missing.map((s) => `${s}=${parsed.data.clipMap[s]}`).join("、")}`);
        } catch (e) { problems.push(`GLB 讀不出來：${(e as Error).message}`); }
      }
    }
  }
  const out = { problems, glb };
  docCache.set(modelKey, out);
  return out;
}
const recentOf = (modelKey: string, glb: string | undefined, owner: string) =>
  !touchedSince ? false : touchedSince.has(`content/models/${modelKey}.json`) || (!!glb && touchedSince.has(glb)) || touchedSince.has(`content/champions/${owner}.json`);

for (const f of readdirSync(join(C, "champions")).filter((x) => x.endsWith(".json") && !x.startsWith("_")).sort()) {
  const champ = JSON.parse(readFileSync(join(C, "champions", f), "utf8"));
  const versions: { modelKey: string; label?: string }[] = champ.modelVersions ?? [];
  if (!versions.length && champ.modelKey) {
    const m = checkModel(champ.modelKey);
    rows.push({ surface: "admin-active", owner: champ.id, modelKey: champ.modelKey, problems: m.problems, recent: recentOf(champ.modelKey, m.glb, champ.id) });
  }
  for (const v of versions) {
    const m = checkModel(v.modelKey);
    const problems = [...m.problems];
    try { service.verify(v as never); } catch (e) { problems.push(`版本雜湊驗不過：${(e as Error).message}`); }
    rows.push({ surface: "admin-version", owner: champ.id, modelKey: v.modelKey, label: v.label, problems, recent: recentOf(v.modelKey, m.glb, champ.id) });
  }
}
for (const [hero, keys] of Object.entries(ACQUIRED_MODEL_OPTIONS)) {
  for (const key of keys) {
    const m = checkModel(key);
    rows.push({ surface: "hero-forge", owner: hero, modelKey: key, problems: m.problems, recent: recentOf(key, m.glb, hero) });
  }
}

const bad = rows.filter((r) => r.problems.length);
const summary = {
  options: rows.length,
  adminVersionRows: rows.filter((r) => r.surface === "admin-version").length,
  adminActiveOnly: rows.filter((r) => r.surface === "admin-active").length,
  heroForgeOptions: rows.filter((r) => r.surface === "hero-forge").length,
  uniqueModelKeys: new Set(rows.map((r) => r.modelKey)).size,
  previewReady: rows.length - bad.length,
  previewBroken: bad.length,
  ...(since ? { since, recentOptions: rows.filter((r) => r.recent).length, recentBroken: bad.filter((r) => r.recent).length } : {}),
};
console.log(JSON.stringify(summary, null, 1));
for (const r of bad.slice(0, 40)) console.log(`⛔ [${r.surface}] ${r.owner} · ${r.modelKey}${r.label ? `（${r.label}）` : ""}${r.recent ? " · 近期" : ""}\n     ${r.problems.join("\n     ")}`);
const out = arg("--json");
if (out) writeFileSync(out, JSON.stringify({ schema: "ggd-dropdown-preview-readiness@1", summary, rows }, null, 1) + "\n");
process.exitCode = bad.length ? 1 : 0;
