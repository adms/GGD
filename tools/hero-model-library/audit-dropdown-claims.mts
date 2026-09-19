/**
 * 🔭【模型下拉：**兩個面列出來的東西一不一樣**，而列出來的每一顆選了載不載得起來】
 *    GH#1188（待認領要兩邊都列得到）· GH#1265（129＋衍生逐顆驗收）· GH#1262（選了就看得到）
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ⭐ 這一支問的是**關係**，⛔ 不是名詞（CLAUDE.md 配對式後置條件）
 * ═══════════════════════════════════════════════════════════════════════════
 *  挑模型有**兩個面**，而它們今天**各自算各自的清單**：
 *
 *  | 面 | 誰算的 | 規則 |
 *  |---|---|---|
 *  | **後台**「已匯入模型」（`apps/admin/src/ui/ChampionModelVersions.tsx:118` 的 datalist） | `readModelVersionCatalog`（`apps/admin/src/contentApi.ts:614`） | `content/models/_index.json` 裡**每一筆**非 `version.body.*` |
 *  | **編輯器**「英雄模型」（`apps/editor/src/hero/HeroPage.tsx:118`） | `heroBodyModelIds`（`packages/shared/.../heroForge/bodyModels.ts`） | `heroBody === true`，或被設計過的英雄連到 |
 *
 *  ⇒ ⭐ 兩個面**結構上就會給不同答案**，而在此之前**沒有任何東西在數那個差**。
 *    這一支把差列出來並指名每一顆，⛔ 不是回一個「幾筆」。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ⭐ 兩頭都走（假綠燈⑫：一頭必然對其中一種失明）
 * ═══════════════════════════════════════════════════════════════════════════
 *   ① 後台列得到、編輯器列不到 → `adminOnlyHeroBody`（⭐ #1265 的「34 份衍生編輯器列不出來」就在這裡）
 *   ② 編輯器列得到、後台列不到 → `editorOnly`（⛔ 應為 0：編輯器能挑而後台看不到 ＝ 兩個面對同一個問題答案不同）
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ⭐ 判準只有一個住處（第〇·四守則）—— 這支**匯入出貨的規則**，⛔ 不自己重寫一份
 * ═══════════════════════════════════════════════════════════════════════════
 *   · 可挑／待認領 → `heroBodyModelClaims`（`@ggd/shared/.../heroForge/modelClaims`，content-api 的 `/content-api/hero-body-models` 呼叫的同一支）
 *   · 凍結版本前綴 → `MODEL_VERSION_PREFIX`（⛔ 不寫字面值 `"version.body."`）
 *   · 模型文件 schema → `zModelDoc`
 *   · 編輯器打不打得開 → `MODEL_UPLOAD_LIMITS.jsonBytes`（`parseUploadGlb` 的 4 MiB JSON 區段上限；
 *     ⚠️ #1265 記過：Zod 綠、遊戲載得進去、**編輯器打不開**，三件事不是同一件）
 *
 * ⚠️ **缺席的 GLB 分兩種**：`content/assets-offdisk.json` 宣告過的（位元組在 S3，雜湊驗得了）⛔ 不是缺陷；
 *    沒有宣告的才是斷鏈。⛔ 不要把 `ls` 不到讀成「它不存在」（CLAUDE.md：我查的那條路上沒有 ≠ 它不存在）。
 *
 * ⛔ 它**不看畫面長什麼樣** —— 「像素上真的畫得出來」是 #1265 的另一半，要真的算繪，
 *    這一支只保證「選項列得到、而且選下去讀得進去」。⭐ 報告裡逐欄寫明它量了哪幾個軸。
 *
 *   node --import tsx tools/hero-model-library/audit-dropdown-claims.mts [--json <out>] [--all]
 *     --json <out>  完整逐顆結果寫成 JSON（⛔ 預設不寫檔）
 *     --all         列出全部差異（預設每桶只印前 40 筆）
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { zModelDoc } from "../../packages/shared/src/content/schema/model";
import { MODEL_VERSION_PREFIX } from "../../packages/shared/src/content/schema/championModelVersions";
import { MODEL_UPLOAD_LIMITS } from "../../packages/shared/src/content/modelUpload/glb";
import {
  HERO_MODEL_CLAIM_COLLECTIONS,
  MODEL_ACQUISITION_REGISTRY_PATH,
  heroBodyModelClaims,
  type ModelAcquisitionEntry,
} from "../../packages/shared/src/content/heroForge/modelClaims";

export const ROOT = join(import.meta.dirname, "../..");
const CONTENT = join(ROOT, "content");

/** ⭐ 英雄身體住的目錄 —— 逐字比照 `shippedGlbHasClaim.test.ts`：場景道具依路徑載入，⛔ 本來就沒有 `model@1`。 */
export const HERO_BODY_DIRS = ["assets/models/ou99/", "assets/models/community/", "assets/models/imported/", "assets/models/champions/"] as const;

export interface ModelRow {
  id: string;
  /** 後台「已匯入模型」列得到嗎（`_index` 減掉凍結版本）。 */
  admin: boolean;
  /** 編輯器「英雄模型」列得到嗎（`heroBodyModelIds`）。 */
  editor: boolean;
  /** 編輯器把它標成「待認領」嗎。 */
  unclaimed: boolean;
  /** 它是英雄身體目錄裡的 GLB 嗎（⛔ 場景道具不算）。 */
  heroBody: boolean;
  glbPath: string | null;
  /** 選了會載不起來的理由；空陣列 ＝ 讀得進去。 */
  problems: string[];
}

/**
 * ⭐ 一個統計要印出**分母與探針**（CLAUDE.md），⛔ 不是只回一個數字。
 *
 * ⚠️ 「後台列得到、編輯器列不到」今天是 **289** 筆，⛔ 而那 289 筆**不是同一種東西** ——
 *   把它讀成「289 顆英雄身體不見了」是錯的。所以這一支**逐族分開數**：
 *
 *   | 族 | 它是什麼 | 列不到算不算缺陷 |
 *   |---|---|---|
 *   | `ou99Derivative` | `ou99.<帖號>-standard*` / `-native-*`：同一顆的加工副本 | ⭐ **#1265 的未決項** —— 要嘛補 `heroBody`、要嘛寫下為什麼不補 |
 *   | `ou99Body` | ou99 本體 | 今天只有 `ou99.467258`（殺生丸）刻意 `heroBody:false` |
 *   | `communityUpload` | `community.body.<內容雜湊>`：編輯器上傳進來的身體，一次上傳一顆 | ⛔ 多半是歷史快照，與凍結版本同族 |
 *   | `w3xImport` | `imported.*` / `w3x.stock.*`：w3x 匯入傾印 | ⛔ 裡面**大量是特效與道具**，本來就不該進英雄身體選單 |
 *   | `champArt` | `champ.*`：怪物／皮膚美術 | ⛔ 不是可挑的英雄身體 |
 */
export type AdminOnlyFamily = "ou99Derivative" | "ou99Body" | "communityUpload" | "w3xImport" | "champArt" | "other";

export function adminOnlyFamily(id: string): AdminOnlyFamily {
  if (id.startsWith("ou99.")) return id.slice("ou99.".length).includes("-") ? "ou99Derivative" : "ou99Body";
  if (id.startsWith("community.body.")) return "communityUpload";
  if (id.startsWith("imported.") || id.startsWith("w3x.stock.")) return "w3xImport";
  if (id.startsWith("champ.")) return "champArt";
  return "other";
}

export interface DropdownClaimsReport {
  schema: "ggd-model-dropdown-claims@1";
  /** `adminOnlyHeroBody` 逐族的顆數 —— ⛔ 不要只讀總數。 */
  adminOnlyFamilies: Record<AdminOnlyFamily, number>;
  summary: {
    indexEntries: number;
    adminOptions: number;
    editorOptions: number;
    unclaimed: number;
    /** ⭐ 後台列得到、編輯器列不到，而且它是英雄身體 ⇒ 這一桶是 #1265 要決定的那批。 */
    adminOnlyHeroBody: number;
    /** 後台列得到、編輯器列不到，但不是英雄身體（道具／場景／FX）⇒ ⛔ 本來就不該進英雄身體選單。 */
    adminOnlyOther: number;
    /** ⛔ 應為 0。 */
    editorOnly: number;
    readinessProblems: number;
    offDiskDeclared: number;
    /** ⚠️ 算待認領時讀不到的證據（非空 ⇒ 待認領可能多標）。 */
    evidenceMissing: string[];
  };
  adminOnlyHeroBody: ModelRow[];
  editorOnly: ModelRow[];
  readinessProblems: ModelRow[];
  unclaimed: string[];
  rows: ModelRow[];
}

function indexIds(): { entries: number; ids: string[] } {
  const raw = JSON.parse(readFileSync(join(CONTENT, "models", "_index.json"), "utf8")) as { entries?: { id?: unknown }[] };
  const entries = raw.entries ?? [];
  // ⭐ 逐字比照 `readModelVersionCatalog`：列出每一筆非凍結版本。⛔ 前綴從 schema 匯入，不寫字面值。
  return { entries: entries.length, ids: entries.flatMap((e) => (typeof e.id === "string" && !e.id.startsWith(MODEL_VERSION_PREFIX) ? [e.id] : [])) };
}

function claimDocuments(): Array<[string, unknown]> {
  const documents: Array<[string, unknown]> = [];
  for (const collection of HERO_MODEL_CLAIM_COLLECTIONS) {
    const dir = join(CONTENT, collection);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_")).sort()) {
      const doc = JSON.parse(readFileSync(join(dir, name), "utf8")) as { id?: unknown };
      if (typeof doc.id === "string") documents.push([`${collection}/${doc.id}`, doc]);
    }
  }
  return documents;
}

function acquisitionEntries(): ModelAcquisitionEntry[] | null {
  const registry = join(ROOT, MODEL_ACQUISITION_REGISTRY_PATH);
  if (!existsSync(registry)) return null;
  const parsed = JSON.parse(readFileSync(registry, "utf8")) as { entries?: unknown };
  if (!Array.isArray(parsed.entries)) throw new Error(`${MODEL_ACQUISITION_REGISTRY_PATH} 沒有 entries 陣列。`);
  return parsed.entries as ModelAcquisitionEntry[];
}

/** GLB 的 JSON 區段大小（位元組）；⛔ 不是 GLB 檔案大小 —— 編輯器擋的是前者。 */
export function glbJsonBytes(file: string): number {
  const head = readFileSync(file).subarray(0, 20);
  if (head.length < 20 || head.readUInt32LE(0) !== 0x46546c67) throw new Error("不是 GLB（magic 不符）");
  return head.readUInt32LE(12);
}

export function buildReport(): DropdownClaimsReport {
  const index = indexIds();
  const documents = claimDocuments();
  const claims = heroBodyModelClaims(documents, acquisitionEntries());
  const admin = new Set(index.ids);
  const editor = new Set(claims.ids);
  const unclaimed = new Set(claims.unclaimed);
  const offDisk = new Set(
    Object.keys((JSON.parse(readFileSync(join(CONTENT, "assets-offdisk.json"), "utf8")) as { entries?: Record<string, unknown> }).entries ?? {}),
  );
  const tracked = new Set(
    execFileSync("git", ["ls-files", "--", "content/assets/models"], { cwd: ROOT, encoding: "utf8", maxBuffer: 128 * 1024 * 1024 }).split("\n").filter(Boolean),
  );

  const rows: ModelRow[] = [];
  for (const id of [...new Set([...admin, ...editor])].sort()) {
    const problems: string[] = [];
    let glbPath: string | null = null;
    let heroBody = false;
    const file = join(CONTENT, "models", `${id}.json`);
    if (!existsSync(file)) problems.push("模型文件不存在（⇒ 選單有、文件沒有）");
    else {
      const parsed = zModelDoc.safeParse(JSON.parse(readFileSync(file, "utf8")));
      if (!parsed.success) problems.push(`模型文件過不了 schema：${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`);
      else {
        glbPath = parsed.data.glbPath;
        heroBody = HERO_BODY_DIRS.some((dir) => glbPath!.startsWith(dir));
        const onDisk = join(CONTENT, glbPath);
        if (!existsSync(onDisk)) {
          // ⚠️ 宣告過的離線資產（位元組在 S3）⛔ 不是斷鏈 —— 沒有宣告的才是。
          if (!offDisk.has(glbPath)) problems.push(`GLB 不在磁碟上、也沒有在 assets-offdisk.json 宣告：${glbPath}`);
        } else {
          if (!tracked.has(`content/${glbPath}`)) problems.push(`GLB 不在 git 裡（出貨拿不到）：${glbPath}`);
          try {
            const bytes = glbJsonBytes(onDisk);
            if (bytes > MODEL_UPLOAD_LIMITS.jsonBytes) {
              problems.push(`GLB 的 JSON 區段 ${(bytes / 1048576).toFixed(2)} MiB 超過編輯器上限 ${(MODEL_UPLOAD_LIMITS.jsonBytes / 1048576).toFixed(0)} MiB（遊戲載得進去、編輯器打不開）`);
            }
          } catch (e) {
            problems.push(`GLB 讀不出來：${(e as Error).message}`);
          }
        }
      }
    }
    rows.push({ id, admin: admin.has(id), editor: editor.has(id), unclaimed: unclaimed.has(id), heroBody, glbPath, problems });
  }

  const adminOnly = rows.filter((r) => r.admin && !r.editor);
  const adminOnlyHeroBody = adminOnly.filter((r) => r.heroBody);
  const editorOnly = rows.filter((r) => r.editor && !r.admin);
  const readinessProblems = rows.filter((r) => r.problems.length);
  const adminOnlyFamilies: Record<AdminOnlyFamily, number> = { ou99Derivative: 0, ou99Body: 0, communityUpload: 0, w3xImport: 0, champArt: 0, other: 0 };
  for (const row of adminOnlyHeroBody) adminOnlyFamilies[adminOnlyFamily(row.id)] += 1;
  return {
    schema: "ggd-model-dropdown-claims@1",
    adminOnlyFamilies,
    summary: {
      indexEntries: index.entries,
      adminOptions: admin.size,
      editorOptions: editor.size,
      unclaimed: claims.unclaimed.length,
      adminOnlyHeroBody: adminOnlyHeroBody.length,
      adminOnlyOther: adminOnly.length - adminOnlyHeroBody.length,
      editorOnly: editorOnly.length,
      readinessProblems: readinessProblems.length,
      offDiskDeclared: offDisk.size,
      evidenceMissing: claims.evidence.missing,
    },
    adminOnlyHeroBody,
    editorOnly,
    readinessProblems,
    unclaimed: claims.unclaimed,
    rows,
  };
}

function main(): void {
  const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
  const all = process.argv.includes("--all");
  const report = buildReport();
  console.log(JSON.stringify({ ...report.summary, adminOnlyFamilies: report.adminOnlyFamilies }, null, 1));
  const bucket = (title: string, rows: ModelRow[]) => {
    if (!rows.length) return;
    console.log(`\n${title}（${rows.length}）`);
    for (const r of (all ? rows : rows.slice(0, 40))) console.log(`   · ${r.id}${r.glbPath ? ` ← ${r.glbPath}` : ""}${r.problems.length ? `\n       ${r.problems.join("\n       ")}` : ""}`);
    if (!all && rows.length > 40) console.log(`   …還有 ${rows.length - 40} 筆（--all 全列）`);
  };
  bucket("⚠️ 後台列得到、編輯器列不到（英雄身體）", report.adminOnlyHeroBody);
  bucket("⛔ 編輯器列得到、後台列不到", report.editorOnly);
  bucket("⛔ 選了載不起來", report.readinessProblems);
  const out = arg("--json");
  if (out) writeFileSync(out, `${JSON.stringify(report, null, 1)}\n`);
  // ⛔ 只有「載不起來」與「編輯器有而後台沒有」回非零 —— 兩個面的清單本來就不同大小，
  //    那個差是 #1265 要**決定**的東西（補 `heroBody` 或寫下為什麼不補），⛔ 不是它自己就是缺陷。
  process.exitCode = report.editorOnly.length || report.readinessProblems.length ? 1 : 0;
}

// ⭐ 直接跑才執行；被測試 import 時只拿 `buildReport()`。⛔ 不用檔名字尾比對（同名檔會誤判）。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
