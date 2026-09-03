/**
 * ⭐⭐ GH#966 —— **驗過的 icon 資產落地**（`/apply` 才會跑到這裡）。
 *
 * ── ⭐ 為什麼落點是 `content/assets/icons/`，⛔ 不是匯入的 staging 樹 ──────────
 * `ability@1.icon` 的正則逐字要求 `^assets/`，而出貨的 1,039 份 WebP 就住在
 * `content/assets/icons/<collection>/<id>.webp`（`tools/icon-gen` 的輸出公式）。
 * ⇒ ⭐ 把圖寫到別的地方 ＝ 文件指得到、瀏覽器抓不到 —— **第一·五守則**的形狀
 *   （卡片上印著一張圖的路徑，而那個路徑是謊話）。
 *
 * ── ⭐ 順序：**先寫位元組，再換指標** ────────────────────────────────────────
 * icon 檔在**沒有任何文件指向它之前是惰性的** —— 寫下去不會改變任何一場比賽。
 * ⇒ 所以「寫圖 → 原子換文件樹」是安全的順序；⛔ 反過來（先換指標再寫圖）
 * 會有一段時間文件指著一個不存在的檔。
 *
 * ── ⭐ 冪等 ────────────────────────────────────────────────────────────────
 * 轉出來的 sha256 與現有檔相同 ⇒ **跳過寫入**，⛔ 不是每次都產生一筆 diff。
 * ⚠️ ⭐ `cwebp` 對同一份輸入是決定性的，所以這個比對真的會命中
 * （⛔ 不是一個永遠不成立的最佳化）。
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  encodeIcon,
  IconEncodeError,
  type EncodeIconOptions,
} from "@ggd/shared/content/icons/encodeIcon";
import type { IconAssetPlan } from "@ggd/shared/content/import/iconAssets";
import {
  ASSET_ROLE,
  parseIconAssetPath,
  iconOutputPath,
} from "@ggd/shared/content/import/iconAssets";

/** ⭐ `sha256:` wire format —— 與 `jcs.ts` 的 `contentSha256()` 同一種表示法。 */
export const assetSha256 = (bytes: Uint8Array): string =>
  "sha256:" + createHash("sha256").update(bytes).digest("hex");

/**
 * ⭐ manifest 裡宣告的每一顆 asset，**現在**在磁碟上的 sha256（CAS 的另一半）。
 * ⛔ 不掃整個 icons 目錄（1,039 份）—— 只讀這一包會碰到的那幾份。
 */
export function existingIconShas(
  contentDir: string,
  entries: readonly { path?: unknown; role?: unknown }[],
): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of entries) {
    if (e?.role !== ASSET_ROLE || typeof e?.path !== "string") continue;
    const p = parseIconAssetPath(e.path);
    if (p === null) continue;
    const abs = join(contentDir, iconOutputPath(p.collection, p.id));
    if (!existsSync(abs)) continue;
    out.set(`${p.collection}/${p.id}`, assetSha256(readFileSync(abs)));
  }
  return out;
}

export interface LandedIcon {
  readonly collection: string;
  readonly id: string;
  /** content-relative，⭐ 就是要寫進文件 `icon` 那一格的字串。 */
  readonly outputPath: string;
  readonly sha256: string;
  readonly bytes: number;
  /** ⭐ 轉出來與磁碟上的一模一樣 ⇒ 沒有寫入。 */
  readonly unchanged: boolean;
}

export interface LandIconsInput {
  readonly contentDir: string;
  readonly plans: readonly IconAssetPlan[];
  /** zip 解出來的原始位元組（path → bytes）。 */
  readonly sources: ReadonlyMap<string, Uint8Array>;
  readonly preserveAlpha: boolean;
  /** 測試注入用（⭐ 預設真的跑 `cwebp`）。 */
  readonly encode?: EncodeIconOptions["run"];
}

/**
 * ⭐⭐ 轉檔 ＋ 寫檔。⛔ 這一支**不驗證**任何東西 —— 它拿到的 plan 已經過了
 * `checkIconAssets()`（magic bytes · 檔頭長寬 · CAS · 位元組事實）。
 * ⭐ 「先驗後解」那個順序因此是**結構上**成立的：⛔ 這裡拿不到未驗過的東西。
 */
export function landIconAssets(input: LandIconsInput): LandedIcon[] {
  const out: LandedIcon[] = [];
  for (const plan of input.plans) {
    const src = input.sources.get(plan.path);
    if (src === undefined) {
      throw new IconEncodeError(
        `⛔ 內部不變量壞了：plan 有 \`${plan.path}\` 而位元組不見了（⭐ 它已經過了 checkIconAssets）。`,
      );
    }
    const webp = encodeIcon(src, {
      preserveAlpha: input.preserveAlpha,
      ...(input.encode === undefined ? {} : { run: input.encode }),
    });
    const sha = assetSha256(webp);
    const abs = join(input.contentDir, plan.outputPath);
    const unchanged = existsSync(abs) && assetSha256(readFileSync(abs)) === sha;
    if (!unchanged) {
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, webp);
    }
    out.push({
      collection: plan.collection,
      id: plan.id,
      outputPath: plan.outputPath,
      sha256: sha,
      bytes: webp.length,
      unchanged,
    });
  }
  return out;
}
