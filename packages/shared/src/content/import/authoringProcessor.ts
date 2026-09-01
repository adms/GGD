/**
 * ⭐⭐ **runtime-direct authoring processor** —— 取代 Draft 0.4 的四層 compiler receipt。
 *
 * ── ⛔ 這個檔存在的理由是一個**契約自相矛盾** ────────────────────────────────
 * 2026-09-02 量到，同一套契約有**三份 receipt 在說不同的話**：
 *
 *   | 誰 | 說什麼 |
 *   |---|---|
 *   | `content/editor-target-profile.json` | `compiler.{contractVersion,fingerprint} = null`，理由是「⭐ **砍掉編譯器那一層**」 |
 *   | `zPackageManifest` | `compiler: { contractVersion: zShort, fingerprint: zShort }` —— ⛔ **必填、非空** |
 *   | `GGD_EDITOR_PACKAGE_SPEC.md` (Draft 0.4) | 描述四層 compiler ＋ `expectedCompiled` 比對 |
 *
 * ⇒ ⭐ 對面照 profile 做（不產 compiled）⇒ **manifest 過不了 schema**；
 *   照 schema 做（填一個假指紋）⇒ **我們這一側永遠不會去比對它**，
 *   而那個假指紋會讓對方去實作「重編比對」——一件我們這條路上不做的事。
 * ⚠️ ⛔ 兩條路都通不了，⭐ 而**每一份 receipt 自己看起來都是對的**。
 *
 * ── ⭐ 解法：把「處理器」這一格從「有沒有編譯器」改成「**是哪一種**」 ────────
 * `authoringProcessor.kind = "runtime-direct"` ——
 * canonical authority 就是包裡的 `ability@1` / `item@1` 本身，
 * ⛔ 不建立第二份 compiled 表示法，⛔ 不強制 `expectedCompiled`。
 * ⇒ compiler 那一格**留給未來真的需要 compile 的表示法**，⛔ 不塞假的 `none`。
 *
 * ── ⛔⛔ 而 `fingerprint` ⛔ 不可以是一個手寫的版本字串 ────────────────────
 * 它的**唯一**用途是讓對面知道「我上次驗過的那套規則還是不是這一套」。
 * ⇒ ⭐ 它必須是**量出來的**：把七個共用實作面的位元組雜湊起來。
 * ⚠️ 一個手寫的 `"runtime-direct@1.0.3"` 會在 schema 改了而版本沒 bump 時
 *   **靜靜地繼續說「一樣」** —— 那正是本 repo 記過 N 次的「散文守著一個數字」。
 *
 * ⚠️ ⭐ **兩個方向都要關**（失敗形態⑫）：
 *   ① 表上列的檔不存在 ⇒ **擲例外**（⛔ 不是跳過 —— 跳過會產出一個穩定但空的指紋）
 *   ② 參與驗證的檔沒有被任何一面涵蓋 ⇒ 守衛紅（見 `authoringProcessor.test.ts`）
 */
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { canonicalizeJcs } from "./jcs";

export const AUTHORING_PROCESSOR_KIND = "runtime-direct" as const;
export const AUTHORING_PROCESSOR_CONTRACT_VERSION = "runtime-direct@1" as const;

/**
 * ⭐ 七個**共用實作面** —— 對面驗一包所依賴的每一段程式。
 *
 * ⚠️ 每一面的 `paths` 是 repo 相對路徑，⭐ **順序有意義**（進 canonical receipt）。
 * ⛔ 不可以放測試檔：測試改動不改變「這包合不合法」，把它算進去只會製造假漂移。
 */
export interface ProcessorSurface {
  /** 規格點名的那七個名字，逐字。 */
  readonly surface: string;
  readonly paths: readonly string[];
  /** ⭐ 為什麼是這幾個檔 —— ⛔ 一個能被反駁的理由，不是「相關」。 */
  readonly why: string;
}

export const PROCESSOR_SURFACES: readonly ProcessorSurface[] = Object.freeze([
  {
    surface: "ability-item-zod-schemas",
    paths: [
      "packages/shared/src/content/schema/ability.ts",
      "packages/shared/src/content/schema/item.ts",
      "packages/shared/src/content/schema/effect.ts",
      "packages/shared/src/content/schema/condition.ts",
      "packages/shared/src/content/schema/common.ts",
      "packages/shared/src/content/schema/index.ts",
    ],
    why:
      "⭐ runtime-direct 的 canonical authority 就是 `ability@1`/`item@1` 本身 ⇒ " +
      "它們的 Zod 是**唯一**的驗證器。⚠️ `effect`/`condition`/`common` 一起算進來，" +
      "因為 ability 的 `effects[]` 是 discriminated union，⛔ 改一個 kind 就改了合法集合。",
  },
  {
    surface: "exact-ref-collector",
    paths: ["packages/shared/src/content/import/packageSchema.ts"],
    why:
      "⭐ `zExactRef` 與 `selectionRoots`/`requires` 的形狀定義了「一包要帶哪些東西才算封閉」。" +
      "⚠️ 今天它**沒有獨立模組**（住在 packageSchema.ts 裡）—— ⛔ 我不為了讓表好看而發明一個檔，" +
      "⭐ 而是誠實指向它現在真正的住處。",
  },
  {
    surface: "capability-applicability",
    paths: ["packages/shared/src/content/editorCapabilities.ts"],
    why:
      "⭐ `ggd-runtime-capabilities@1` 決定「這個標籤引擎認不認得」。" +
      "⚠️ 它是**從出貨註冊表推導**的（第〇·五守則），⛔ 不是手寫表 ⇒ 改引擎會改它。",
  },
  {
    surface: "authoring-rules",
    paths: ["packages/shared/src/content/authoringRules.ts"],
    why: "⭐ `ggd-authoring-rules@1` —— schema 收得下但**我們不接受**的那一層（第一·五守則）。",
  },
  {
    surface: "runtime-loader",
    paths: ["packages/shared/src/content/loader.ts", "packages/shared/src/content/bundle.ts"],
    why:
      "⭐ `ContentLoader` 是**出貨真的會跑**的那條路 —— ⛔ 不是 schema。" +
      "⚠️ 一份 schema 過得了而 loader 隔離的文件，對玩家等於不存在（失敗形態⑤）。",
  },
  {
    surface: "derived-rebuild-rules",
    paths: ["packages/shared/src/content/import/digest.ts"],
    why:
      "⭐ `semanticManifestProjection` / `NON_SEMANTIC_MANIFEST_KEYS` 定義了" +
      "「哪些欄位是**重算得出來**的」⇒ 它就是 derived rebuild 的規則本體。",
  },
  {
    surface: "golden-vectors",
    paths: [
      "packages/shared/src/content/import/jcs.ts",
      "packages/shared/src/content/import/unknownFields.ts",
      "packages/shared/src/content/import/zipSafety.ts",
    ],
    why:
      "⭐ 這三支是**兩邊必須逐位元一致**的那幾條：JCS 正規化、未知欄位政策、ZIP 安全。" +
      "⚠️ 它們的 golden vectors 住在各自的 `.test.ts` 裡（⛔ 沒有獨立的 vectors 檔）," +
      "⭐ 而指紋算的是**實作**，⛔ 不是測試 —— 實作改了對方就要重驗，測試改了不必。",
  },
]);

export interface SurfaceReceipt {
  readonly surface: string;
  readonly files: readonly { readonly path: string; readonly sha256: string }[];
}

export interface ProcessorReceipt {
  readonly kind: typeof AUTHORING_PROCESSOR_KIND;
  readonly contractVersion: typeof AUTHORING_PROCESSOR_CONTRACT_VERSION;
  readonly surfaces: readonly SurfaceReceipt[];
}

function sha256Hex(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * ⭐ 讀真的位元組算 receipt。
 * ⛔ 表上有而磁碟上沒有 ⇒ **擲例外** —— 靜靜跳過會產出一個「穩定但涵蓋不到東西」的指紋，
 *    ⚠️ 而那個指紋讀起來跟真的一模一樣（本 repo 記過的「被 glob 灌大的統計」同族）。
 */
export function buildProcessorReceipt(repoRoot: string): ProcessorReceipt {
  const surfaces = PROCESSOR_SURFACES.map((s) => ({
    surface: s.surface,
    files: s.paths.map((p) => {
      const abs = resolve(repoRoot, p);
      if (!existsSync(abs)) {
        throw new Error(
          `⛔⛔ authoringProcessor receipt 指向一個不存在的檔：${p}\n` +
            `   ⭐ 它八成是被改名或搬走了 —— 去 PROCESSOR_SURFACES 更新那一列，\n` +
            `   ⛔ 不要把它刪掉了事：刪掉會讓指紋在「這一面完全沒被涵蓋」時仍然穩定。`,
        );
      }
      return { path: p, sha256: sha256Hex(readFileSync(abs)) };
    }),
  }));
  return {
    kind: AUTHORING_PROCESSOR_KIND,
    contractVersion: AUTHORING_PROCESSOR_CONTRACT_VERSION,
    surfaces,
  };
}

/** ⭐ 短指紋 —— 與 repo 其餘 digest 同一個政策（sha256 的前 12 個十六進位字）。 */
export function processorFingerprint(receipt: ProcessorReceipt): string {
  return sha256Hex(canonicalizeJcs(receipt as unknown)).slice(0, 12);
}

export interface AuthoringProcessorDeclaration {
  readonly kind: typeof AUTHORING_PROCESSOR_KIND;
  readonly contractVersion: typeof AUTHORING_PROCESSOR_CONTRACT_VERSION;
  readonly fingerprint: string;
  /** ⭐ 對方看得到**指紋是從哪幾個檔算出來的** ⇒ 它變了他查得出來是哪一面變的。 */
  readonly surfaces: readonly { readonly surface: string; readonly digest: string }[];
}

export function buildAuthoringProcessor(repoRoot: string): AuthoringProcessorDeclaration {
  const receipt = buildProcessorReceipt(repoRoot);
  return {
    kind: receipt.kind,
    contractVersion: receipt.contractVersion,
    fingerprint: processorFingerprint(receipt),
    surfaces: receipt.surfaces.map((s) => ({
      surface: s.surface,
      digest: sha256Hex(canonicalizeJcs(s as unknown)).slice(0, 12),
    })),
  };
}
