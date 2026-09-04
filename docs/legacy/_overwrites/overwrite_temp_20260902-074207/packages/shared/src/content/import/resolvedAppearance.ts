/**
 * ⭐⭐ **P1-3 —— `resolved-appearance@1`：外觀的唯一解析入口。**
 *
 * ── ⛔ 交接文件要的 ─────────────────────────────────────────────────────
 * 「請匯出 versioned `resolved-appearance@1`…**遊戲與 Editor 必須呼叫同一
 *   resolver 或用同一批 golden vectors 證明輸出一致**。」
 *
 * ── ⭐ 而它同時是 owner 的積木原則 ──────────────────────────────────────
 * owner 逐字：「main 遊戲主程式 是**做出積木供使用**的角色」。
 * ⇒ 「一個 champion 長什麼樣」在此之前是**四個消費端各自從 `modelKey` 湊**
 *    （`ChampionView` · `championModelAudition` · `EntityViewRegistry` · 選人畫面），
 *    ⛔ 而外部編輯器一個都拿不到。⇒ 這一支把它變成**一塊積木**。
 *
 * ── ⛔ 它刻意**不**做的事 ───────────────────────────────────────────────
 * ⛔ 不決定「該用哪顆模型」——那是內容的事（`champion@1.modelKey`）。
 * ⭐ 它只回答「**照今天的內容，這位英雄解出來是什麼**」，
 *   而且把「這顆是共用替身」這件事**明講**（`isStandIn`），
 *   ⛔ 不讓它變成一個看起來很正常的答案。
 */
import { sha256Hex } from "../sha256";
import { canonicalizeJcs } from "./jcs";
import { isStandInModel } from "../championIdentity";

export const RESOLVED_APPEARANCE_SCHEMA = "resolved-appearance@1" as const;

/** 一格附著點（模型本地座標）。 */
export interface AttachPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface ResolvedAppearance {
  readonly schema: typeof RESOLVED_APPEARANCE_SCHEMA;
  readonly championId: string;
  /** 解出來的 `model@1` id。 */
  readonly modelKey: string;
  /** `content/` 相對路徑（`assets/**`）。 */
  readonly glbPath: string;
  /** 這份 `model@1` 文件的 canonical digest（12 位）—— 文件改了它就變。 */
  readonly modelDocDigest: string;
  readonly scale: number;
  readonly collisionRadius: number;
  /** 模型面向修正（度）。缺席 ⇒ 0。 */
  readonly yawOffsetDeg: number;
  /** 邏輯狀態 → glb 裡的動畫片段名。 */
  readonly clipMap: Readonly<Record<string, string>>;
  /** 具名附著點（槍口／頭頂 UI／…）。 */
  readonly attachPoints: Readonly<Record<string, AttachPoint>>;
  /** 會被染成隊伍色的材質名。 */
  readonly teamTintMaterials: readonly string[];
  /**
   * ⭐⭐ **這顆是四塊共用替身網格之一**（`champ.*`）。
   *
   * ⚠️ ⭐ 為什麼要明講：一位英雄站在共用替身上時，畫面**看起來是正常的**
   * ——⛔ 它只是**別人**。2026-09-02 量到 **4 位**這樣的英雄，其中
   * `godie-e00r`（初號機）用的是 `champ.skin.rogue`。
   * ⇒ ⛔ 一個沉默的 resolver 會讓外部編輯器忠實預覽出一個**錯的角色**，
   *   而且它不會知道自己錯了。
   */
  readonly isStandIn: boolean;
  /** 這一支 resolver 的契約指紋（欄位集合 ＋ 版本）。 */
  readonly resolverFingerprint: string;
}

/** `champion@1` 需要的那幾格（⛔ 不要求整份文件）。 */
export interface AppearanceChampion {
  readonly id: string;
  readonly modelKey?: unknown;
}

/** `model@1` 需要的那幾格。 */
export interface AppearanceModel {
  readonly id?: unknown;
  readonly glbPath?: unknown;
  readonly scale?: unknown;
  readonly collisionRadius?: unknown;
  readonly yawOffsetDeg?: unknown;
  readonly clipMap?: unknown;
  readonly attachPoints?: unknown;
  readonly teamTintMaterials?: unknown;
}

/** 解不出來的原因 —— ⛔ 不是 `null`（那分不出「沒有這位英雄」與「沒有那顆模型」）。 */
export type AppearanceFailure =
  | { readonly kind: "no-champion"; readonly championId: string }
  | { readonly kind: "no-model-key"; readonly championId: string }
  | { readonly kind: "no-model-doc"; readonly championId: string; readonly modelKey: string };

export type AppearanceResult =
  | { readonly ok: true; readonly appearance: ResolvedAppearance }
  | { readonly ok: false; readonly failure: AppearanceFailure };

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function strRecord(v: unknown): Readonly<Record<string, string>> {
  if (v === null || typeof v !== "object") return Object.freeze({});
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === "string") out[k] = val;
  }
  return Object.freeze(out);
}

function points(v: unknown): Readonly<Record<string, AttachPoint>> {
  if (v === null || typeof v !== "object") return Object.freeze({});
  const out: Record<string, AttachPoint> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (val === null || typeof val !== "object") continue;
    const p = val as Record<string, unknown>;
    if (typeof p["x"] === "number" && typeof p["y"] === "number" && typeof p["z"] === "number") {
      out[k] = Object.freeze({ x: p["x"], y: p["y"], z: p["z"] });
    }
  }
  return Object.freeze(out);
}

/**
 * ⭐ 契約指紋 —— **欄位集合**的雜湊。
 *
 * ⚠️ 它與 `effectiveVfxLimits` 的指紋語意刻意不同：那一支的值會隨設定變，
 * 所以它雜湊的是**行為**；這一支的輸出完全由輸入文件決定，
 * ⇒ 要釘的是「**這一版回哪些欄位**」—— 少一格 / 多一格，對面就該知道。
 */
const FIELDS = Object.freeze([
  "schema",
  "championId",
  "modelKey",
  "glbPath",
  "modelDocDigest",
  "scale",
  "collisionRadius",
  "yawOffsetDeg",
  "clipMap",
  "attachPoints",
  "teamTintMaterials",
  "isStandIn",
  "resolverFingerprint",
]);

let cachedFp: string | undefined;

export function appearanceResolverFingerprint(): string {
  cachedFp ??= sha256Hex(
    canonicalizeJcs({ schema: RESOLVED_APPEARANCE_SCHEMA, fields: FIELDS }),
  ).slice(0, 12);
  return cachedFp;
}

/**
 * ⭐ **唯一入口。** 兩個消費端（遊戲 / 外部編輯器）都走這裡。
 *
 * @param champion 這位英雄的 `champion@1`（`undefined` ⇒ 沒有這位英雄）
 * @param model    `champion.modelKey` 指到的 `model@1`（`undefined` ⇒ 那顆模型不在）
 */
export function resolveAppearance(
  championId: string,
  champion: AppearanceChampion | undefined,
  model: AppearanceModel | undefined,
): AppearanceResult {
  if (champion === undefined) return { ok: false, failure: { kind: "no-champion", championId } };
  const modelKey = champion.modelKey;
  if (typeof modelKey !== "string" || modelKey === "") {
    return { ok: false, failure: { kind: "no-model-key", championId } };
  }
  if (model === undefined) {
    return { ok: false, failure: { kind: "no-model-doc", championId, modelKey } };
  }
  const glbPath = typeof model.glbPath === "string" ? model.glbPath : "";
  return {
    ok: true,
    appearance: Object.freeze({
      schema: RESOLVED_APPEARANCE_SCHEMA,
      championId,
      modelKey,
      glbPath,
      // ⭐ 對**整份** model 文件取 digest（⛔ 不是只有 glbPath）——
      //   縮放、附著點、動畫對應改了，預覽就該知道自己過期了。
      modelDocDigest: sha256Hex(canonicalizeJcs(model as Record<string, unknown>)).slice(0, 12),
      scale: num(model.scale, 1),
      collisionRadius: num(model.collisionRadius, 0.5),
      yawOffsetDeg: num(model.yawOffsetDeg, 0),
      clipMap: strRecord(model.clipMap),
      attachPoints: points(model.attachPoints),
      teamTintMaterials: Object.freeze(
        Array.isArray(model.teamTintMaterials)
          ? model.teamTintMaterials.filter((m): m is string => typeof m === "string")
          : [],
      ),
      isStandIn: isStandInModel(modelKey),
      resolverFingerprint: appearanceResolverFingerprint(),
    }),
  };
}
