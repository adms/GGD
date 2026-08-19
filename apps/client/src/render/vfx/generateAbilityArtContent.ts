/**
 * GENERATOR — `content/config/vfx-ability-art.json`（GH#384）。
 *
 *   pnpm exec tsx apps/client/src/render/vfx/generateAbilityArtContent.ts
 *   pnpm exec tsx apps/client/src/render/vfx/generateAbilityArtContent.ts --check
 *
 * ⭐ **它只擁有一格。** 這一份文件有四格，而四格的來源不一樣 ——
 * 把三格都重寫是 `generateFamilyContent.ts` 在 GH#378 踩過的坑
 * （「整份重寫」把六個後台旋鈕整格刪掉，而 `content:build` 是綠的）。
 *
 * | 格 | 來源 | 這支腳本 |
 * |---|---|---|
 * | `family` | `MODEL_USAGE.json` + `VFX_BINDINGS.json` **推導得出來** | ⭐ **重寫**（`deriveW3xFamilyArt`） |
 * | `prim` | 人讀技能中文名分出來的**分類**，沒有上游 | 逐位保留 |
 * | `owner` | ⭐ **owner 的設計覆寫**（GH#431），沒有上游 | 逐位保留 |
 * | `promoted` | 人挑的晉升清單（可渲染性閘），沒有上游 | 逐位保留 |
 *
 * ⚠️ `owner` 那一格被**同一條「保留是預設」的規則**接住，⛔ 不需要為它加一段程式 ——
 * 這正是 GH#378／GH#427 的教訓寫進來之後拿到的利息。而它必須是**另一格**，
 * ⛔ 不可以直接改 `family`：`family` 每一次產生都會被推導整格換掉。
 *
 * ⚠️ **保留是預設而不是白名單**：這份文件之後多一格（例如後台加一種綁定），
 * 不必回來改這裡，它自動活下來。⛔ 反過來寫（列出要保留的 key）就是 GH#378。
 *
 * ⛔ **沒有產生日期／版本戳。** 與 `caps:export` / `spec:build` 同一個理由：
 * 任何隨時鐘變動的欄位都會讓逐位元組比對永遠不相等，於是 `--check` 只能被放寬成
 * 模糊比對 —— 而一條被放寬的閘等於沒有閘。
 *
 * ⚠️ 跑完要 `pnpm content:build`（每一次 `content/` 編輯都要，否則
 * `shippedBundleIsCurrent.test.ts` 對過期的 bundle 紅）。
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveW3xFamilyArt, type W3xModelUsage, type W3xVfxBindings } from "./deriveW3xFamilyArt";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../../../..");

/** ⚠️ 與 `generateFamilyContent.ts` 同一個 env 慣例，守衛靠它跑在沙箱樹上。 */
export const CONTENT_DIR = process.env.GGD_CONTENT_DIR ?? join(REPO, "content");
export const DOC_REL = join("config", "vfx-ability-art.json");
export const USAGE_PATH = join(REPO, "tools/w3x-import/out/vfx-census/MODEL_USAGE.json");
export const BINDINGS_PATH = join(REPO, "tools/w3x-import/out/vfx-bindings/VFX_BINDINGS.json");

interface AbilityArtDoc {
  id: string;
  schema: string;
  bindings: Record<string, Record<string, unknown>>;
}

/** 磁碟上那一份 —— 它帶著這支腳本算不出來的每一格。 */
function readDoc(contentDir: string): AbilityArtDoc {
  const p = join(contentDir, DOC_REL);
  if (!existsSync(p)) return { id: "vfx-ability-art", schema: "config.vfx-ability-art@1", bindings: {} };
  return JSON.parse(readFileSync(p, "utf8")) as AbilityArtDoc;
}

/**
 * 磁碟上那一份 + 重新推導的 `family` 格。
 *
 * ⭐ 每一列的 key 順序固定成 `prim` → `family` → `owner` → `promoted`，key 本身排序，
 * 所以同樣的輸入永遠產出同樣的位元組。
 */
export function nextDoc(contentDir: string = CONTENT_DIR): AbilityArtDoc {
  const disk = readDoc(contentDir);
  const rows: Record<string, Record<string, unknown>> = {};
  for (const [id, row] of Object.entries(disk.bindings)) rows[id] = { ...row };

  // `family` 那一格 —— 推導得出來就以推導為準（含刪掉推導不再產生的列）。
  // ⚠️ 輸入不在（那兩份是 `tools/w3x-import` 的產物）時**整格不動**：
  // ⛔ 一台沒有輸入的機器不可以把 258 筆證據靜靜地清成 0。
  if (existsSync(USAGE_PATH) && existsSync(BINDINGS_PATH)) {
    const usage = JSON.parse(readFileSync(USAGE_PATH, "utf8")) as W3xModelUsage;
    const bindings = JSON.parse(readFileSync(BINDINGS_PATH, "utf8")) as W3xVfxBindings;
    const derived = deriveW3xFamilyArt(usage, bindings);
    for (const row of Object.values(rows)) delete row["family"];
    for (const [id, fam] of Object.entries(derived)) (rows[id] ??= {})["family"] = fam;
  }

  const out: Record<string, Record<string, unknown>> = {};
  for (const id of Object.keys(rows).sort()) {
    const r = rows[id]!;
    const ordered: Record<string, unknown> = {};
    // ⭐ `owner` 緊跟在 `family` 後面（GH#431）—— 讀檔的人看到的是
    // 「原作證明了什麼」再「owner 推翻成什麼」，兩格相鄰，⛔ 不必翻兩個地方。
    for (const k of ["prim", "family", "owner", "promoted"]) if (r[k] !== undefined) ordered[k] = r[k];
    for (const k of Object.keys(r).sort()) if (ordered[k] === undefined) ordered[k] = r[k];
    if (Object.keys(ordered).length > 0) out[id] = ordered;
  }
  return { id: "vfx-ability-art", schema: "config.vfx-ability-art@1", bindings: out };
}

export function serialise(doc: AbilityArtDoc): string {
  return JSON.stringify(doc, null, 2) + "\n";
}

export function generateAbilityArtContent(contentDir: string = CONTENT_DIR): {
  path: string;
  text: string;
  rows: number;
} {
  const doc = nextDoc(contentDir);
  const path = join(contentDir, DOC_REL);
  const text = serialise(doc);
  writeFileSync(path, text);
  return { path, text, rows: Object.keys(doc.bindings).length };
}

const isMain = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false;
if (isMain) {
  const check = process.argv.includes("--check");
  const path = join(CONTENT_DIR, DOC_REL);
  const want = serialise(nextDoc(CONTENT_DIR));
  if (check) {
    const have = existsSync(path) ? readFileSync(path, "utf8") : "";
    if (have !== want) {
      console.error(
        "⛔ content/config/vfx-ability-art.json 與推導不一致 —— 跑 " +
          "`pnpm exec tsx apps/client/src/render/vfx/generateAbilityArtContent.ts` 然後 `pnpm content:build`。",
      );
      process.exit(1);
    }
    console.log(`✅ 逐技能特效綁定是最新的（${Object.keys(nextDoc(CONTENT_DIR).bindings).length} 列）`);
  } else {
    const r = generateAbilityArtContent(CONTENT_DIR);
    console.log(`wrote ${r.rows} rows → ${r.path}`);
  }
}
