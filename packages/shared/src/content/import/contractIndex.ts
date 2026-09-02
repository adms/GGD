/**
 * ⭐⭐ **§0-1 —— `ggd-editor-contract-index@1`：雙方唯一的接縫。**
 *
 * ── ⛔ 交接文件逐字要它解掉的病 ─────────────────────────────────────────
 * 「不要再把 `accepts` 寫成**散落於 profile、Importer 與 Editor 的三份陣列**。」
 * 「資料結構**不得**把 store、operation、diff 或 audit hard-code 成只有兩種。」
 * 「目前 Export Center 只處理 abilities／items，VFX Forge 卻產 `vfx-script@1`；
 *   若 Main 現在只做兩種固定 union，**G5 一定再拆一次 importer**。」
 *
 * ── ⭐ 量到的（2026-09-02）：那三份陣列裡，**main 這一側就有兩份** ────────
 *   · `targetProfile.ts` 的 `authoringModel.accepts`
 *   · `packageSchema.ts` 的 `RAW_RUNTIME_SCHEMA_TAGS`
 * ⇒ ⭐ 這個檔是**那份表的唯一住處**（第〇·四守則），上面兩處改成**推導**。
 *
 * ── ⭐ 而 owner 的積木原則正是這一條 ────────────────────────────────────
 * 「[後台編輯器及 codex 編輯器] 是**堆積木**的角色，要**充分了解有哪些積木**，
 *   而 main 遊戲主程式 是**做出積木供使用**的角色。」
 * ⇒ ⭐ 一份「有哪些積木、每一塊今天能不能用、要什麼權限」的機器可讀清單，
 *   **就是** main 該交出去的那個東西。⛔ 不是一段散文。
 *
 * ── ⛔ 它刻意**不**做的事 ───────────────────────────────────────────────
 * ⛔ 不宣告任何「還沒做完」的東西是 supported —— 交接文件逐字：
 *   「不要為了讓 Editor 按鈕變亮而提前宣告」。
 * ⭐ `planned` 是一個**有用的**狀態：它讓對面現在就寫得出 store／operation／
 *   audit 的骨架，⛔ 而不必等我們出貨才發現 schema 要重來。
 */
import { sha256Hex } from "../sha256";
import { canonicalizeJcs } from "./jcs";

export const CONTRACT_INDEX_SCHEMA = "ggd-editor-contract-index@1" as const;

/**
 * ⭐ 最低的 Editor 契約版本 —— 低於它的 Editor 讀到這份 index 應該**停下來**，
 * ⛔ 不是挑自己看得懂的欄位用（那會讓一個舊 Editor 拿新政策當舊政策）。
 */
export const MIN_EDITOR_CONTRACT_VERSION = "1.0.0" as const;

/** 一塊積木今天的狀態。⛔ `planned` ≠ 「永遠不做」，⭐ 它是「骨架先留著」。 */
export type RepresentationState = "supported" | "planned" | "unsupported";

/**
 * ⭐ 誰有資格把它推上線。
 *
 * ⚠️ ⭐ 這一格是 **server policy**，⛔ 不是 package 或 Editor 可以關掉的旗標
 * （交接文件逐字：「它是 target-profile／plan 中**被 pin 的 server policy**」）。
 */
export type PromotionPolicy =
  /** 人工建立 ⇒ authenticated Admin 的 Package apply。 */
  | "admin-package-apply"
  /** 一律先審後上（不論來源）。 */
  | "review-required"
  /** ⛔ 永遠不可上線（能力 fixture）。 */
  | "forbidden";

export interface RepresentationRow {
  /** 文件的 schema tag（＝ `ability@1` 那一族）。 */
  readonly schema: string;
  /** 這種文件走哪一種 package kind。⛔ 不是從 schema 字串切出來的。 */
  readonly packageKind: string;
  readonly state: RepresentationState;
  /** 最低到得了的階段。 */
  readonly minStage: string;
  /** 這一塊今天允許哪些 package mode。⛔ 空陣列 ＝ 一個都不行。 */
  readonly modes: readonly string[];
  readonly promotionPolicy: PromotionPolicy;
  /**
   * ⭐ 為什麼是這個 state —— **一個能被反駁的理由**，⛔ 不是「還沒排到」。
   * （第〇·四守則的豁免規則：看不順眼可以反駁，而反駁的方式是把它改成 supported。）
   */
  readonly why: string;
}

/**
 * ⭐⭐ **積木清單 —— 這是唯一的住處。**
 *
 * ⚠️ 交接文件那張表逐列落地。⛔ 不可以在別處再抄一份：
 * `packageSchema.RAW_RUNTIME_SCHEMA_TAGS` 與 `targetProfile.authoringModel.accepts`
 * 現在都**從這裡推導**，而 `contractIndexIsSingleHome.test.ts` 在守這件事。
 */
export const REPRESENTATIONS: readonly RepresentationRow[] = Object.freeze([
  {
    schema: "ability@1",
    packageKind: "runtime-document",
    state: "supported",
    minStage: "G2",
    modes: ["bootstrap", "full", "delta"],
    promotionPolicy: "admin-package-apply",
    why:
      "runtime-direct：包裡的 `ability@1` 自己就是 canonical authority，" +
      "⛔ 沒有第二份 compiled 表示法要對。",
  },
  {
    schema: "item@1",
    packageKind: "runtime-document",
    state: "supported",
    minStage: "G2",
    modes: ["bootstrap", "full", "delta"],
    promotionPolicy: "admin-package-apply",
    why:
      "同 `ability@1`。⚠️ **取得性**（玩家拿不拿得到）另受 G3 的 curation 管 —— " +
      "⭐ 那是 `contentReachable` 與 `effectiveReachableUnderCuration` 兩格在回答的，" +
      "⛔ 不是這一列。",
  },
  {
    schema: "vfx-script@1",
    packageKind: "vfx-script",
    state: "planned",
    minStage: "G5",
    modes: [],
    promotionPolicy: "review-required",
    why:
      "VFX Forge 已經在產它，⛔ 而 main 這一側的 importer 還沒有它的 staging 驗證。" +
      "⭐ 現在就留這一列，是為了讓對面的 store／operation／audit 骨架**不必等** —— " +
      "⛔ 而 `modes: []` 保證它今天一包都過不了。" +
      "⚠️ ⭐ 它**不是** `vfx@1`（那是未來的 emitter authoring，另一塊積木）。",
  },
  {
    schema: "template@1",
    packageKind: "effect-template",
    state: "planned",
    minStage: "profile 宣告後",
    modes: [],
    promotionPolicy: "review-required",
    why:
      "legacy `template@1` 與未來的 effect-template／Product／Chain 是**同一族**。" +
      "⛔ 不可以設計掉（引擎今天真的在用 `template@1` 展開技能），" +
      "⛔ 也不可以現在假裝支援（importer 沒有它的 ref closure 規則）。",
  },
  {
    schema: "editor-capability-fixture",
    packageKind: "capability-fixture",
    state: "supported",
    minStage: "G2",
    modes: [],
    promotionPolicy: "forbidden",
    why:
      "⭐⭐ 八招是**編輯器能力**的驗收夾具 —— 它回答「Editor 表達得出來嗎」，" +
      "⛔ **不是**要換掉遊戲的技能。owner 逐字：「不是直接套用回去遊戲主程式中」。" +
      "⇒ ⭐ `promotionPolicy: \"forbidden\"` 是**永久**的：即使人工審過也不能上線。" +
      "⚠️ `state: \"supported\"` 說的是「這種文件我們**收得下、驗得了**」，" +
      "⛔ 不是「它可以上線」—— 那兩件事由**不同**欄位回答，這正是分開它們的理由。",
  },
]);

/** ⭐ 推導：今天真的收得下的 raw runtime 文件 tag。 */
export function acceptedRuntimeSchemas(): readonly string[] {
  return Object.freeze(
    REPRESENTATIONS.filter(
      (r) => r.state === "supported" && r.packageKind === "runtime-document",
    ).map((r) => r.schema),
  );
}

/** ⭐ 推導：某一種文件今天允許的 mode（⛔ 不在表上 ⇒ 空陣列，fail closed）。 */
export function modesFor(schema: string): readonly string[] {
  return REPRESENTATIONS.find((r) => r.schema === schema)?.modes ?? Object.freeze([]);
}

/** ⭐ 推導：某一種文件的上線政策（⛔ 不在表上 ⇒ `forbidden`，fail closed）。 */
export function promotionPolicyFor(schema: string): PromotionPolicy {
  return REPRESENTATIONS.find((r) => r.schema === schema)?.promotionPolicy ?? "forbidden";
}

// ---------------------------------------------------------------------------
// 🔌 endpoint 描述表 —— ⛔ 對面不從 URL 字串猜 route
// ---------------------------------------------------------------------------

export interface EndpointDescriptor {
  readonly id: string;
  readonly method: "GET" | "POST";
  readonly href: string;
  /** ⭐ 需要哪一種授權。`admin` = authenticated Admin actor。 */
  readonly authScope: "public" | "loopback" | "admin";
  readonly maxBytes: number | null;
  /** 非同步 ⇒ 回 `202 + operationId`，對面要 poll `operations/:id`。 */
  readonly async: boolean;
  readonly why: string;
}

/**
 * ⭐ 前綴是一個**決策點**（`importRoutes.ts` 檔頭記著兩個前綴都註冊的理由）——
 * 這裡列的是**規格路徑**，也是文件上該引用的那一個。
 */
const P = "/api/v1/content-import";

export const ENDPOINTS: readonly EndpointDescriptor[] = Object.freeze([
  {
    id: "validate",
    method: "POST",
    href: `${P}/validate`,
    authScope: "loopback",
    maxBytes: 64 * 1024 * 1024,
    async: true,
    why: "唯一收 package bytes 的地方。⭐ 建 immutable staging，回 `operationId`。",
  },
  {
    id: "apply",
    method: "POST",
    href: `${P}/apply`,
    authScope: "loopback",
    maxBytes: 64 * 1024 * 1024,
    async: false,
    why:
      "⭐ 只認 `operationId` ＋ CAS ⇒ ⛔ 它**不會**再收一份可能不同的 package bytes。",
  },
  {
    id: "rollback",
    method: "POST",
    href: `${P}/rollback`,
    authScope: "loopback",
    maxBytes: null,
    async: false,
    why: "⭐ 與 apply **分開授權與稽核**（交接文件逐字：三條 route 分開）。",
  },
  {
    id: "active",
    method: "GET",
    href: `${P}/active`,
    authScope: "public",
    maxBytes: null,
    async: false,
    why: "現在的 ACTIVE 指標 ＋ `rollbackAvailable`。",
  },
  {
    id: "active-runtime-bundle",
    method: "GET",
    href: `${P}/active/runtime-bundle`,
    authScope: "public",
    maxBytes: null,
    async: false,
    why:
      "⭐ **exact Base** —— 全部註冊 collection、逐文件 hash、collection hash、" +
      "`contentVersion`。⛔ 對面會全部重算後才接受。",
  },
  {
    id: "active-target-profile",
    method: "GET",
    href: `${P}/active/target-profile`,
    authScope: "public",
    maxBytes: null,
    async: false,
    why: "authenticated 版本的 profile（含完整 digest，⛔ 不是 12 位的 drift 顯示值）。",
  },
  {
    id: "operations",
    method: "GET",
    href: `${P}/operations/:operationId`,
    authScope: "public",
    maxBytes: null,
    async: false,
    why: "poll `validate` 的終態與診斷。",
  },
  {
    id: "health",
    method: "GET",
    href: `${P}/health`,
    authScope: "public",
    maxBytes: null,
    async: false,
    why: "匯入子系統活著嗎（⛔ 不是「內容對不對」）。",
  },
  {
    id: "audit",
    method: "GET",
    href: `${P}/audit`,
    authScope: "admin",
    maxBytes: null,
    async: false,
    why: "append-only 稽核尾巴。⛔ 唯讀，沒有刪除也沒有編輯。",
  },
  {
    id: "editor-source",
    method: "GET",
    href: "/content-api/editor-source",
    authScope: "public",
    maxBytes: null,
    async: false,
    why:
      "⭐ 一份文件的**擁有權**（hand-authored / generator-owned / normalizer-only）" +
      "與 `writePolicy`。⛔ 對面不從 `provenance` 猜。",
  },
  {
    id: "editor-source-write",
    method: "POST",
    href: "/content-api/editor-source",
    authScope: "loopback",
    maxBytes: 1024 * 1024,
    async: false,
    why:
      "⭐ 走**來源**的 CAS 寫入 ＋ 唯一的重生成指令。" +
      "⛔ 直接 PUT 產生器產物一律 409（`GENERATOR_OWNED_PRODUCT`）。",
  },
]);

export function endpoint(id: string): EndpointDescriptor | undefined {
  return ENDPOINTS.find((e) => e.id === id);
}

// ---------------------------------------------------------------------------
// 📇 index 本體
// ---------------------------------------------------------------------------

export interface ContractIndexPolicies {
  readonly digest: { readonly canonicalization: string; readonly hash: string };
  readonly zip: Readonly<Record<string, number>>;
  readonly operationStateMachineVersion: string;
}

export interface ContractIndex {
  readonly schema: typeof CONTRACT_INDEX_SCHEMA;
  readonly minEditorContractVersion: string;
  readonly representations: readonly RepresentationRow[];
  readonly endpoints: readonly EndpointDescriptor[];
  readonly policies: ContractIndexPolicies;
  /** ⭐ 這一份 index 的 canonical digest（12 位，與 profile 其餘 digest 同表示法）。 */
  readonly digest: string;
}

/**
 * ⭐ 建出 index。`zipLimits` 由呼叫端傳（⛔ 不 import `zipSafety`：
 * 那個模組拉進 node 的 zlib，而這一支要能在瀏覽器端被讀）。
 */
export function buildContractIndex(zipLimits: Readonly<Record<string, number>>): ContractIndex {
  const body = {
    schema: CONTRACT_INDEX_SCHEMA,
    minEditorContractVersion: MIN_EDITOR_CONTRACT_VERSION,
    representations: REPRESENTATIONS,
    endpoints: ENDPOINTS,
    policies: {
      digest: { canonicalization: "RFC8785-JCS", hash: "SHA-256" },
      zip: zipLimits,
      operationStateMachineVersion: "content-import-operation@1",
    },
  } as const;
  return Object.freeze({
    ...body,
    digest: sha256Hex(canonicalizeJcs(body as unknown as Record<string, unknown>)).slice(0, 12),
  });
}
