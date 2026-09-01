/**
 * ⭐⭐ **G2 準備度** —— `implementedStage` 從**推導**來，⛔ 不是一個手寫常數。
 *
 * ── ⛔ 為什麼不能是常數 ────────────────────────────────────────────────────
 * 規格 §3 逐字：「target profile **真的完成後才可**宣告 implementedStage: G2」。
 * ⚠️ 而一個手寫的 `"G2"` **沒有任何東西在守它** —— ⭐ 它會在有人覺得
 * 「差不多做完了」的那一天被改掉，然後對面打開 full/delta，
 * ⛔ 而 base pin 那幾格還是 null。
 *
 * ⇒ ⭐ 改成**逐條問**：每一格 G2 的前提各是一個 `boolean`，
 *   全部成立才回 `"G2"`，⛔ 否則回 `"G1"` **並且列出缺哪幾條**。
 *
 * ⚠️ ⭐ 這與本 repo 一路的判準同構：一個宣稱要有出處，
 * 而這裡的出處是**同一個函式當場算出來的那幾個 boolean**。
 */
import type { AuthoringStoreState, PackageMode } from "./targetProfile";

/** G2 的每一條前提。⭐ 每一條都要說得出「它為什麼是必要的」。 */
export interface G2Precondition {
  readonly id: string;
  readonly ok: boolean;
  /** ⭐ 不成立時對面看得懂的一句話。 */
  readonly why: string;
}

export interface G2Facts {
  /** 有沒有一個真的 ACTIVE（＝ bootstrap 已經跑過）。 */
  readonly hasActiveSnapshot: boolean;
  /** 現在這一版的 activation digest。 */
  readonly activationDigest: string | null;
  /** authoring corpus 的 digest。 */
  readonly authoringDigest: string | null;
  /** 遊戲建置的身分（`GGD_BUILD_STAMP` / `git describe`）。 */
  readonly gameRevision: string | null;
  /** bootstrap 要帶的 migration fingerprint（⛔ 算不出來就是 null）。 */
  readonly migrationFingerprint: string | null;
  /** 六條匯入端點都掛上去了嗎。 */
  readonly endpointsMounted: boolean;
  /** runtime-direct 處理器指紋算得出來嗎。 */
  readonly processorFingerprint: string | null;
  /** 完整 asset manifest 的 digest。 */
  readonly assetManifestDigest: string | null;
}

export function g2Preconditions(f: G2Facts): readonly G2Precondition[] {
  return Object.freeze([
    {
      id: "importer-endpoints",
      ok: f.endpointsMounted,
      why: "六條匯入端點（validate/apply/rollback/active/runtime-bundle/operations）要全部掛上。",
    },
    {
      id: "processor-fingerprint",
      ok: f.processorFingerprint !== null && f.processorFingerprint !== "",
      why:
        "算不出 runtime-direct 處理器指紋 ⇒ 對面無法知道「我驗過的規則還是不是你跑的那一套」。",
    },
    {
      id: "asset-manifest",
      ok: f.assetManifestDigest !== null,
      why: "沒有完整 asset manifest ⇒ 對面驗不了它引用的 GLB／貼圖是不是預期的那一顆。",
    },
    {
      id: "game-revision",
      ok: f.gameRevision !== null && f.gameRevision !== "",
      why:
        "`base.gameRevision` 是 full/delta 的 pin 之一 —— " +
        "沒有它，一包 delta 就無法宣告它是對**哪一個遊戲版本**建的。",
    },
    {
      id: "active-snapshot",
      ok: f.hasActiveSnapshot && f.activationDigest !== null,
      why:
        "還沒有任何 activation ⇒ ⭐ 沒有 base 可以 pin ⇒ " +
        "**只有 bootstrap 是合法的**（⛔ 這不是缺陷，是這台的真實狀態）。",
    },
    {
      id: "authoring-digest",
      ok: f.authoringDigest !== null,
      why: "`base.authoringDigest` 是 full/delta 的第二個 pin。",
    },
    {
      id: "migration-fingerprint",
      ok: f.migrationFingerprint !== null && f.migrationFingerprint !== "",
      why:
        "bootstrap 必須帶 migrationFingerprint，而 profile 要說得出**現在是哪一個**，" +
        "⛔ 否則對面只能猜。",
    },
  ]);
}

/** ⭐ 全部成立才是 G2。⛔ 沒有「差不多」。 */
export function resolveImplementedStage(f: G2Facts): {
  stage: "G1" | "G2";
  missing: readonly G2Precondition[];
} {
  const missing = g2Preconditions(f).filter((p) => !p.ok);
  return { stage: missing.length === 0 ? "G2" : "G1", missing };
}

/**
 * ⭐ 支援哪幾種 mode —— 從**同一組事實**推導。
 *
 * ⛔ 沒有 base 就只有 bootstrap，⚠️ 而那**不是限制，是事實**：
 * 一包 delta 要 pin 一個 base，而這台還沒有。
 */
export function supportedModesOf(f: G2Facts): readonly PackageMode[] {
  if (!f.hasActiveSnapshot || f.activationDigest === null || f.authoringDigest === null) {
    return ["bootstrap"];
  }
  return ["bootstrap", "full", "delta"];
}

/**
 * ⭐ `deltaExportAllowed` —— ⛔ 它**不等於** `supportedModes` 含 delta。
 *
 * ⚠️ 兩者的問句不同：
 *   · `supportedModes` 問「這台**收不收**」
 *   · 這一格問「對面**現在做得出**一包 production-ready 的 delta 嗎」
 * ⇒ ⭐ 後者還多要一條：**整個 G2 都成立**。⛔ 否則對面會建出一包
 *   pin 了半組欄位的 delta，而它在 apply 的時候才被拒。
 */
export function deltaExportAllowedOf(f: G2Facts): boolean {
  return resolveImplementedStage(f).stage === "G2" && supportedModesOf(f).includes("delta");
}

/** ⭐ authoring store 的三態（⛔ 不是 boolean）。 */
export function authoringStoreStateOf(f: G2Facts): AuthoringStoreState {
  if (!f.hasActiveSnapshot) return "absent";
  return f.authoringDigest === null ? "bootstrapping" : "ready";
}
