/**
 * GENERATOR — `content/vfx/fx.fam.*.json` + `content/config/vfx-families.json`.
 *
 *   pnpm --filter @ggd/client exec tsx src/render/vfx/generateFamilyContent.ts
 *   (or from the repo root: pnpm exec tsx apps/client/src/render/vfx/generateFamilyContent.ts)
 *
 * The `fx.fam.*` docs it writes are a pure function of `w3xArtFamilies.ts` (the
 * 21 prototypes), `w3xFamilyArt.ts` (the evidence table) and `bindings.ts` (the
 * name classification that supplies the colour).
 *
 * ⚠️ Run `pnpm content:build` afterwards. Every `content/` edit must, or
 * `shippedBundleIsCurrent.test.ts` goes red on the stale bundle.
 *
 * WHY THE CONFIG DOC IS GENERATED TOO. The console's shipped starting point has
 * to agree with the code's defaults field-for-field, or the first save silently
 * changes 258 abilities. Generating it from the same constants is the only way
 * that stays true as the prototypes are retuned.
 *
 * ⛔ 但它**只擁有那份 config 的一部分**（GH#378）。這個檔頭在 2026-08-18 之前
 * 寫著「It NEVER reads what is already on disk」，而那句話正是缺陷本身：
 * `shippedFamilyConfig()` 整份重寫文件，於是 `maxAbilityVfxLayers` /
 * `oneShotMaxLifeSec` / `castHeightSource` / `projectileArtFromDoc` /
 * `projectileRadiusGain` / `projectileFlyHeightY` **六格被整格刪掉** ——
 * 而它們全是 Zod 的 optional，刪掉之後預設值補回去，`content:build` 綠、
 * 測試綠、後台頁畫得出來，**操作者存過的值靜靜回到出貨預設**（失敗形態②）。
 *
 * ⇒ 現在它讀進磁碟上那一份，只覆寫 {@link shippedFamilyConfig} **自己算得出來**
 * 的那幾格，其餘逐位保留。⭐ 保留是**預設**而不是一張白名單：之後有人加一格新的
 * 後台旋鈕，不必回來改這裡，它自動活下來。
 *
 * ⚠️ 檔頭同一段還寫著「`familyContent.test.ts` re-runs the same functions」——
 * **那個檔案不存在**（CLAUDE.md 第三守則）。真的在跑的守衛是
 * `generateFamilyContent.test.ts`：它把這支腳本跑在沙箱樹上再比對檔案。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zConfigVfxFamiliesDoc, type ConfigVfxFamiliesDoc } from "@ggd/shared/content";
import {
  DEFAULT_SCALE_MAPPING,
  W3X_ART_FAMILIES,
  W3X_ART_FAMILY_IDS,
  type W3xArtFamily,
} from "./w3xArtFamilies";
import { W3X_FAMILY_ART } from "./w3xFamilyArt";
import { requiredFamilyDocs } from "./familyTuning";

const HERE = dirname(fileURLToPath(import.meta.url));
/**
 * ⚠️ `GGD_CONTENT_DIR` 是這個 repo 既有的慣例（`packages/shared/scripts/` 的九支
 * 產生器全部讀它）。守衛靠它把**這支腳本本人**跑在沙箱樹上，
 * ⛔ 所以驗的是出貨的那一個入口，而不是一份手抄的複製品（失敗形態⑤）。
 */
export const CONTENT_DIR = process.env.GGD_CONTENT_DIR ?? join(HERE, "../../../../../content");

const FAMILY_CONFIG_REL = join("config", "vfx-families.json");

/**
 * 磁碟上那一份 —— 它帶著**這支產生器算不出來的**每一格（後台旋鈕、之後新增的
 * schema 欄位）。
 *
 * ⛔ 讀失敗或 JSON 壞掉時**不吞** —— 回一個 `{}` 等於再刪一次那六格，
 * 而那正是 GH#378 的形狀：沒有錯誤、只有靜靜消失的值。
 * 唯一的 fail-open 是「檔案還不存在」，那是第一次產生，沒有東西可以保留。
 */
function existingFamilyConfig(): Record<string, unknown> {
  const path = join(CONTENT_DIR, FAMILY_CONFIG_REL);
  if (!existsSync(path)) return {};
  const doc: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    throw new Error(`⛔ ${path} 不是一個 JSON 物件 —— 修好它再產生，⛔ 不要讓它被整份覆蓋掉。`);
  }
  return doc as Record<string, unknown>;
}

/**
 * The shipped `config.vfx-families@1` doc, built from the code's own defaults
 * **merged on top of what is already on disk**.
 *
 * ⭐ 這支函式擁有的鍵 = 它回傳的那幾個，⛔ 沒有第二張手抄的白名單：守衛用
 * `shippedFamilyConfig({})` 把它們**推導**出來，所以這裡多算一格或少算一格，
 * 守衛自己會跟著走。
 */
export function shippedFamilyConfig(
  existing: Record<string, unknown> = existingFamilyConfig(),
): ConfigVfxFamiliesDoc {
  const families: ConfigVfxFamiliesDoc["families"] = {};
  for (const id of W3X_ART_FAMILY_IDS) {
    const p = W3X_ART_FAMILIES[id];
    families[id] = {
      enabled: true,
      primitive: p.primitive,
      element: p.element,
      scale: p.scale,
      alpha: p.alpha,
      timeScale: p.timeScale,
      heightY: p.heightY,
    };
  }
  // Per-ability rows carry the MAP'S OWN numbers, and only those. An ability
  // the map stated nothing about gets an entry with just its family, so the
  // console can still see and retarget it — an empty object would read as
  // "unbound" in the UI when it is in fact bound with no overrides.
  const abilities: ConfigVfxFamiliesDoc["abilities"] = {};
  for (const [abilityId, row] of Object.entries(W3X_FAMILY_ART).sort(([a], [b]) => a.localeCompare(b))) {
    abilities[abilityId] = {
      family: row.family as W3xArtFamily,
      ...(row.scale !== undefined ? { w3xScale: row.scale } : {}),
      ...(row.tint ? { tint: [row.tint[0], row.tint[1], row.tint[2]] as [number, number, number] } : {}),
      ...(row.flyHeight !== undefined ? { flyHeight: row.flyHeight } : {}),
      ...(row.anchor ? { anchor: row.anchor } : {}),
    };
  }
  const owned = {
    id: "vfx-families",
    schema: "config.vfx-families@1",
    enabled: true,
    scaleGain: DEFAULT_SCALE_MAPPING.gain,
    scaleMin: DEFAULT_SCALE_MAPPING.min,
    scaleMax: DEFAULT_SCALE_MAPPING.max,
    families,
    abilities,
  } as const;
  // ⚠️ 順序是「先舊後新」而**不是**反過來：既有的鍵留在它原本的位置（產生的那幾格
  //    只換值），沒被點名的每一格原封不動地帶過去。⛔ 不可以回 `parse()` 的產物 ——
  //    Zod 會照 schema 的順序重排鍵，那會讓每一次產生都變成一份看不懂的巨大 diff。
  const merged: ConfigVfxFamiliesDoc = { ...(existing as Partial<ConfigVfxFamiliesDoc>), ...owned };
  const parsed = zConfigVfxFamiliesDoc.safeParse(merged);
  if (!parsed.success) {
    throw new Error(
      "⛔ 合併後的 `config.vfx-families@1` 過不了出貨的 Zod —— ⛔ 不要把它寫出去。\n" +
        "   最常見的成因：磁碟上那份有一格 schema 還不認得的鍵（`.strict()` 會擋）。\n" +
        `   ${JSON.stringify(parsed.error.issues.slice(0, 5))}`,
    );
  }
  return merged;
}

function stable(v: unknown): string {
  return `${JSON.stringify(v, null, 2)}\n`;
}

function main(): void {
  const docs = requiredFamilyDocs(null);
  const vfxDir = join(CONTENT_DIR, "vfx");
  mkdirSync(vfxDir, { recursive: true });
  // ORPHAN SWEEP FIRST. A retune changes which (family × colour × tier) keys
  // exist, and a left-behind `fx.fam.*` doc is not harmless: it is a schema-
  // valid file nothing points at, so it rides into the bundle, into every
  // client's download, and into any "which docs are unused" audit as noise.
  // Only `fx.fam.` files are touched — this generator owns that prefix and
  // nothing else in `content/vfx/`.
  let removed = 0;
  for (const f of readdirSync(vfxDir)) {
    if (!f.startsWith("fx.fam.") || !f.endsWith(".json")) continue;
    if (docs.has(f.slice(0, -".json".length))) continue;
    rmSync(join(vfxDir, f));
    removed += 1;
  }
  for (const [id, doc] of [...docs].sort(([a], [b]) => a.localeCompare(b))) {
    writeFileSync(join(vfxDir, `${id}.json`), stable(doc));
  }
  // ⚠️ 讀與寫共用 `FAMILY_CONFIG_REL` —— 兩邊各打一次路徑就是兩個「那份檔在哪」，
  //    而它們漂開的那一天，保留邏輯會安靜地退化成「整份重寫」（＝ GH#378 本人）。
  writeFileSync(join(CONTENT_DIR, FAMILY_CONFIG_REL), stable(shippedFamilyConfig()));
  const perFamily: Record<string, number> = {};
  for (const row of Object.values(W3X_FAMILY_ART)) perFamily[row.family] = (perFamily[row.family] ?? 0) + 1;
  process.stdout.write(
    `wrote ${docs.size} fx.fam docs (removed ${removed} orphan) + config/vfx-families.json ` +
      `for ${Object.keys(W3X_FAMILY_ART).length} abilities\n` +
      `${Object.entries(perFamily)
        .sort((a, b) => b[1] - a[1])
        .map(([f, n]) => `  ${f}: ${n}`)
        .join("\n")}\n` +
      `NEXT: pnpm content:build\n`,
  );
}

// `tsx path/to/this.ts` runs it; importing it from a test does not.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
