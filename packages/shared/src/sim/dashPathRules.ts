/**
 * ⭐ GH#1190【衝刺沿途命中】的規則開關（`config.displacement-tiers@1` 的 `dashPath` 區塊）。
 *
 * ⭐ **為什麼住在位移那一份 config**：與 `projectileRedirect`／`markedBlink`／`wallBlock` 同一排 ——
 * 都是「施法者的**衝刺**怎麼跟場上的東西互動」的規則（⛔ 不是級距）。新開一份 config 會多一個要記得同步的住處。
 *
 * ⭐ **它是修正輪的正確性爭議預設＋rollback**（鄂爾 E 沿途傷害，⛔ 不是 owner 原話）：
 *   · `sweep`（預設）`dash.onPathHit` 逐 tick 只打**身體真的掃過**的那一段；被柱／牆擋停 ⇒ 擋停點之後的人⛔ 不挨打
 *   · `full`         施放那一刻沿**整條授權長度**（`maxDistance`）一次結算，⛔ 不管後來有沒有被擋停
 *                    ＝ 這個機制出現之前「`damageLine` 抄衝刺長度」的舊近似（柱子後面的人也挨打）
 */
export type DashPathMode = "sweep" | "full";

export interface DashPathRules {
  readonly mode: DashPathMode;
}

/** ⭐ 出貨值。⛔ 缺文件時回這一份（＝逐 tick 掃），⛔ 不是退回舊近似。 */
export const DEFAULT_DASH_PATH: DashPathRules = { mode: "sweep" };

const MODES: readonly DashPathMode[] = ["sweep", "full"];

/** 從 `config.displacement-tiers@1` 讀。逐格 typeof（同 `projectileRedirectFromDoc`：部分壞掉的 config 不拖垮整條規則）。 */
export function dashPathFromDoc(doc: unknown): DashPathRules {
  const d = doc as { schema?: string; dashPath?: Record<string, unknown> } | undefined;
  if (!d || d.schema !== "config.displacement-tiers@1") return DEFAULT_DASH_PATH;
  const mode = d.dashPath?.["mode"];
  return MODES.includes(mode as DashPathMode) ? { mode: mode as DashPathMode } : DEFAULT_DASH_PATH;
}
