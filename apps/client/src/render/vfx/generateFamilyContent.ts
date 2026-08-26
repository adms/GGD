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
 * ⛔ **而所有權是三層的**（GH#427 —— 同一個缺陷的第二次）：2026-08-20 之前那個
 * 「只覆寫自己那幾格」只做在**頂層**，而 `families` / `abilities` 正是它擁有的
 * 頂層鍵 ⇒ 整張逐列表被換掉，**197 格**（音效 GH#390、仰角 GH#391、
 * groundDecal GH#439）連同 **53 整列**一起消失。逐列逐格的所有權表在
 * {@link shippedFamilyConfig} 的 TSDoc 上，合併在 `mergeRow()`。
 *
 * ⚠️ 檔頭同一段還寫著「`familyContent.test.ts` re-runs the same functions」——
 * **那個檔案不存在**（CLAUDE.md 第三守則）。真的在跑的守衛是
 * `generateFamilyContent.test.ts`：它把這支腳本跑在沙箱樹上再比對檔案。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { writeProduct } from "@ggd/shared/ops/writeProduct";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zConfigVfxFamiliesDoc, type ConfigVfxFamiliesDoc } from "@ggd/shared/content";
import {
  DEFAULT_SCALE_MAPPING,
  W3X_ART_FAMILIES,
  W3X_ART_FAMILY_IDS,
  type W3xArtFamily,
} from "./w3xArtFamilies";
import { w3xFamilyArtRows } from "./w3xFamilyArt";
import { requiredFamilyDocs } from "./familyTuning";
import { loadAbilityArtFromDisk } from "./loadAbilityArtFromDisk";

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
 * 家族原型那一層，**這支產生器算得出來的那幾格**（形狀／顏色／大小／α／時間／高度）。
 *
 * ⛔ 刻意**不含 `enabled`** —— 那是操作者的「這一族整個關掉」開關，⛔ 不是證據。
 * 它只在建立一列新的家族時被 seed 一次（見 {@link shippedFamilyConfig}）。
 * ⛔ 也不含 `sound*` / `groundDecal`：那兩組的主人是
 * `tools/w3x-import/build_vfx_sound_bindings.py` 與後台（GH#390 / GH#439）。
 */
export function familyArtRows(): Record<string, Record<string, unknown>> {
  const rows: Record<string, Record<string, unknown>> = {};
  for (const id of W3X_ART_FAMILY_IDS) {
    const p = W3X_ART_FAMILIES[id];
    rows[id] = {
      primitive: p.primitive,
      element: p.element,
      scale: p.scale,
      alpha: p.alpha,
      timeScale: p.timeScale,
      heightY: p.heightY,
    };
  }
  return rows;
}

/**
 * 逐技能那一層，**這支產生器算得出來的那幾格** —— 也就是地圖自己的那些數字。
 *
 * ⛔ 刻意不含 `pitchDeg` / `facingDeg` / `sound*` / `alpha` / `timeScale` / `enabled`：
 * 那些的主人是 `build_vfx_orient.py`、`build_slash_pitch.py`、
 * `build_vfx_sound_bindings.py` 與後台（GH#391 / GH#390 / #366）。
 */
/**
 * ⭐ GH#713 / GH#802 —— **出貨了的技能** id 集合，從 `content/abilities/` **現算**。
 *
 * ⚠️ 判準要放在**證據這一層**，⛔ 不是只放在合併迴圈裡。第一版我只擋了合併，
 *    於是 `abilityArtRows()` 仍然回報那 90 條 ⇒ 守衛拿「證據」對「出貨檔」
 *    就會說少了 90 列 —— 而**單獨跑測試是綠的**，只有 `ship:check`
 *    （序列段會重生成證據檔）才紅。⭐ 一個只在特定順序下紅的閘最難查。
 *
 * ⚠️ 母體是空的時候（讀不到 `content/abilities`）**回 null ⇒ 不剪任何東西** ——
 *    否則一次掛載失誤會把整份鏡像清空，而那看起來跟「本來就沒有」一模一樣。
 */
function shippedAbilityIds(): Set<string> | null {
  const dir = join(CONTENT_DIR, "abilities");
  if (!existsSync(dir)) return null;
  const ids = readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => f.slice(0, -5));
  return ids.length > 0 ? new Set(ids) : null;
}

export function abilityArtRows(): Record<string, Record<string, unknown>> {
  const rows: Record<string, Record<string, unknown>> = {};
  const shipped = shippedAbilityIds();
  for (const [abilityId, row] of Object.entries(w3xFamilyArtRows()).sort(([a], [b]) => a.localeCompare(b))) {
    // ⭐ 技能檔不存在的那一列一律不進證據（見 shippedAbilityIds 的檔頭）。
    if (shipped !== null && !shipped.has(abilityId)) continue;
    rows[abilityId] = {
      family: row.family as W3xArtFamily,
      ...(row.scale !== undefined ? { w3xScale: row.scale } : {}),
      ...(row.tint ? { tint: [row.tint[0], row.tint[1], row.tint[2]] as [number, number, number] } : {}),
      ...(row.flyHeight !== undefined ? { flyHeight: row.flyHeight } : {}),
      ...(row.anchor ? { anchor: row.anchor } : {}),
    };
  }
  return rows;
}

/**
 * 一張逐列表裡，**產生器擁有的欄位** = 它在任何一列寫得出來的每一個鍵。
 *
 * ⭐ 由產出**推導**，⛔ 不是第二張手抄的白名單 —— 守衛拿同一支函式算同一個集合，
 * 所以「產生器擁有哪幾格」不可能有兩個互相矛盾的答案。
 */
export function ownedRowFields(rows: Record<string, Record<string, unknown>>): ReadonlySet<string> {
  const owned = new Set<string>();
  for (const row of Object.values(rows)) for (const k of Object.keys(row)) owned.add(k);
  return owned;
}

/**
 * 一列的合併 —— **保留是預設，覆寫要有所有權**。
 *
 * · 磁碟上那一格不是產生器的 → 原封不動帶過去（新旋鈕不必回來改這裡）
 * · 是產生器的、這一輪也算得出來 → 用新算的值，**留在它原本的位置**（diff 最小）
 * · 是產生器的、這一輪算不出來 → 落掉（證據不再有它，⛔ 不是「保留一個過期值」）
 */
function mergeRow(
  existing: Record<string, unknown> | undefined,
  generated: Record<string, unknown>,
  owned: ReadonlySet<string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(existing ?? {})) {
    if (!owned.has(k)) out[k] = v;
    else if (k in generated) out[k] = generated[k];
  }
  for (const [k, v] of Object.entries(generated)) if (!(k in out)) out[k] = v;
  return out;
}

/**
 * The shipped `config.vfx-families@1` doc, built from the code's own defaults
 * **merged on top of what is already on disk**.
 *
 * ⭐ 這支函式擁有的鍵 = 它回傳的那幾個，⛔ 沒有第二張手抄的白名單：守衛用
 * `shippedFamilyConfig({})` 把它們**推導**出來，所以這裡多算一格或少算一格，
 * 守衛自己會跟著走。
 *
 * ⚠️ **所有權是三層的，⛔ 不是只有頂層**（GH#427 = GH#378 的第二次）：
 * `families` 與 `abilities` 是這支函式擁有的**頂層鍵**，所以 2026-08-20 之前
 * 的 `{ ...existing, ...owned }` 把整張逐列表換掉 —— 量到 **197 格**被吃掉
 * （111 個 `soundLaunch`、40 個 `pitchDeg`、33 個 `soundImpact`、
 * 8 個 `soundDissipate`、4 個 `soundLoop`、1 個 `groundDecal`），其中
 * **53 列整列消失**。全部是別的產生器與後台的資產（下表）。
 *
 * | 層 | 產生器擁有 | ⛔ 別人的（逐格保留） |
 * |---|---|---|
 * | 頂層 | `id` `schema` `enabled` `scaleGain` `scaleMin` `scaleMax` `families` `abilities` | `maxAbilityVfxLayers` `oneShotMaxLifeSec` `castHeightSource` `projectileArtFromDoc` `projectileRadiusGain` `projectileFlyHeightY` `familyPitchDefaults` `*PitchDeg` `*AngleDeg` `soundEnabled` |
 * | `families[<id>]` | `primitive` `element` `scale` `alpha` `timeScale` `heightY` | `enabled`（後台開關，只在建列時 seed）· `sound*` `soundGain` `soundLoopMs` `soundLoopMaxMs`（`build_vfx_sound_bindings.py`）· `groundDecal`（GH#439） |
 * | `abilities[<id>]` | `family` `w3xScale` `tint` `flyHeight` `anchor` | `pitchDeg`（`build_vfx_orient.py` / `build_slash_pitch.py`）· `facingDeg` `alpha` `timeScale` `enabled`（後台）· `sound*` `soundGain`（`build_vfx_sound_bindings.py`）· **證據沒點到的整列** |
 */
export function shippedFamilyConfig(
  existing: Record<string, unknown> = existingFamilyConfig(),
): ConfigVfxFamiliesDoc {
  const existingFamilies = (existing.families ?? {}) as Record<string, Record<string, unknown>>;
  const familyArt = familyArtRows();
  const ownedFamilyFields = ownedRowFields(familyArt);
  const families: ConfigVfxFamiliesDoc["families"] = {};
  for (const id of [...Object.keys(familyArt), ...Object.keys(existingFamilies)]) {
    if (families[id as W3xArtFamily]) continue;
    const row = mergeRow(existingFamilies[id], familyArt[id] ?? {}, ownedFamilyFields);
    // `enabled` 是操作者的「這一族整個關掉」開關 —— 只在**建立新列**時 seed 成 true。
    families[id as W3xArtFamily] = ("enabled" in row ? row : { enabled: true, ...row }) as never;
  }
  // Per-ability rows carry the MAP'S OWN numbers, and only those. An ability
  // the map stated nothing about gets an entry with just its family, so the
  // console can still see and retarget it — an empty object would read as
  // "unbound" in the UI when it is in fact bound with no overrides.
  const existingAbilities = (existing.abilities ?? {}) as Record<string, Record<string, unknown>>;
  const abilityArt = abilityArtRows();
  const ownedAbilityFields = ownedRowFields(abilityArt);
  const abilities: ConfigVfxFamiliesDoc["abilities"] = {};
  const abilityIds = [...new Set([...Object.keys(existingAbilities), ...Object.keys(abilityArt)])].sort((a, b) =>
    a.localeCompare(b),
  );
  // ⚠️ 死列的判準住在 `abilityArtRows()`（見 `shippedAbilityIds` 的檔頭）——
  //    ⛔ 這裡**不要**再放一份，兩份判準會各自漂（第〇·四守則）。
  for (const id of abilityIds) {
    const row = mergeRow(existingAbilities[id], abilityArt[id] ?? {}, ownedAbilityFields);
    // 證據不再點名這一支、而它身上又沒有任何別人的覆寫 = 這一列該走了
    // （⛔ 留一個空物件在 UI 上會讀成「未綁定」）。
    if (Object.keys(row).length > 0) abilities[id] = row as never;
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
  // ⭐ GH#384 —— 258 筆家族證據住在 `content/config/vfx-ability-art.json`。
  // ⛔ 少了這一行，`requiredFamilyDocs(null)` 會回一個空的 Map，於是這支腳本會
  //    **把 78 份 fx.fam 文件全部當成孤兒掃掉** —— 而它會 EXIT 0。
  const bound = loadAbilityArtFromDisk(CONTENT_DIR);
  if (bound === 0) {
    throw new Error(
      "⛔ content/config/vfx-ability-art.json 是空的或不存在 —— ⛔ 不要在這種狀態下重建 fx.fam 文件。",
    );
  }
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
    writeProduct(join(vfxDir, `${id}.json`), stable(doc));
  }
  // ⚠️ 讀與寫共用 `FAMILY_CONFIG_REL` —— 兩邊各打一次路徑就是兩個「那份檔在哪」，
  //    而它們漂開的那一天，保留邏輯會安靜地退化成「整份重寫」（＝ GH#378 本人）。
  writeProduct(join(CONTENT_DIR, FAMILY_CONFIG_REL), stable(shippedFamilyConfig()));
  const perFamily: Record<string, number> = {};
  for (const row of Object.values(w3xFamilyArtRows())) perFamily[row.family] = (perFamily[row.family] ?? 0) + 1;
  process.stdout.write(
    `wrote ${docs.size} fx.fam docs (removed ${removed} orphan) + config/vfx-families.json ` +
      `for ${Object.keys(w3xFamilyArtRows()).length} abilities\n` +
      `${Object.entries(perFamily)
        .sort((a, b) => b[1] - a[1])
        .map(([f, n]) => `  ${f}: ${n}`)
        .join("\n")}\n` +
      `NEXT: pnpm content:build\n`,
  );
}

// `tsx path/to/this.ts` runs it; importing it from a test does not.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
