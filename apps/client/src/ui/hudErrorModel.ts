/**
 * hudErrorModel — `HudErrorBoundary` 的決策與紀錄那一半（純 TS，可在 node 直接跑）。
 *
 * 拆兩個檔的理由跟 `shopGate` / `MerchantShop` 一樣：`apps/client` 沒有
 * jsdom 也沒有 testing-library（`package.json` 裡沒有），所以能被真的
 * 「跑起來驗行為」的部分要放在不碰 React 的這一側。
 *
 * ⚠️ 這裡最重要的東西是 {@link recordHudError} 的**存在**。React 那行
 * 「The above error occurred in the <XXX> component」在 root 被卸載之後
 * **只會印一次**，而 owner 在打的時候不會開 devtools。所以那一瞬間如果沒有被
 * 存下來，它就永遠消失了 —— 這正是這個缺陷被回報四次卻抓不到兇手的原因。
 */

/** 一次 HUD 崩潰的完整現場。 */
export interface HudErrorRecord {
  /** 玩家看得懂的位置名（不是元件名）。 */
  readonly label: string;
  readonly message: string;
  /** React 給的元件堆疊 —— 兇手的名字就在這裡面。 */
  readonly componentStack: string;
}

/**
 * 保留幾筆。⚠️ 一次崩潰常常會連帶讓相鄰的面板也炸（同一份壞資料），
 * 所以只留 1 筆會讓人以為只壞了一個地方。20 筆足以看出「一起壞的那一群」，
 * 又不會讓一個每格都 throw 的元件把記憶體吃光。
 */
export const HUD_ERROR_LOG_CAP = 20;

const log: HudErrorRecord[] = [];

/** 記一次崩潰。超過上限時丟掉**最舊**的 —— 最早那次通常才是根因。 */
export function recordHudError(rec: HudErrorRecord): void {
  log.push(rec);
  // ⚠️ 刻意丟舊留新？不 —— 反過來。第一次崩潰是根因，後面的常常是它的餘波。
  // 但無上限會被一個每格 throw 的元件灌爆，所以到頂之後**停止收新的**，
  // 而不是把第一筆擠掉。
  if (log.length > HUD_ERROR_LOG_CAP) log.length = HUD_ERROR_LOG_CAP;
}

/** 目前為止的崩潰紀錄（唯讀複本）。 */
export function hudErrors(): readonly HudErrorRecord[] {
  return log.slice();
}

/** 清掉（測試用，以及未來若做「回報問題」按鈕送出後清空）。 */
export function clearHudErrors(): void {
  log.length = 0;
}

/**
 * fallback 上的字。
 *
 * ⚠️ 要說出**哪裡**壞了與**還能不能玩**，不是「發生錯誤」——
 * 那等於沒說。也不要教玩家跑指令（`HudRoot` 的「Connecting to match…」
 * 有過那個前科：對 ggd.adms.ai 的家人叫出 `pnpm` 指令既沒用又嚇人）。
 */
export function hudErrorFallbackText(label: string): string {
  return `${label} 顯示不出來（其餘介面正常，下一回合會自動重試）`;
}
