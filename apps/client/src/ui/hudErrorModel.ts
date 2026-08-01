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
 * 自動重試的次數上限。
 *
 * ⚠️ 為什麼要有上限：這次兇手的形狀是「某個狀態一旦出現就持續成立」
 * （owner 說「下一場戰鬥也是 介面沒有再回來了」，所以不是一閃即逝的例外）。
 * 對這種兇手，每次 resetKey 變化都重掛 = 每個相位切換都再炸一次、再灌一次
 * console、再重掛一次子樹。到頂之後就停手，並且**把話改成「請重新整理」** ——
 * 玩家需要知道等下去沒有用。
 */
export const HUD_BOUNDARY_RETRY_CAP = 3;

/** 已經重試過這麼多次之後，還要不要再自動重試一次。 */
export function shouldAutoRetry(failCount: number, cap = HUD_BOUNDARY_RETRY_CAP): boolean {
  return failCount < cap;
}

/**
 * fallback 上的字。
 *
 * ⚠️ 要說出**哪裡**壞了與**還能不能玩**，不是「發生錯誤」——
 * 那等於沒說。也不要教玩家跑指令（`HudRoot` 的「Connecting to match…」
 * 有過那個前科：對 ggd.adms.ai 的家人叫出 `pnpm` 指令既沒用又嚇人）。
 *
 * `exhausted` = 自動重試已經用完（見 {@link HUD_BOUNDARY_RETRY_CAP}）。這時候
 * 「下一回合會自動重試」就變成一句**謊話**，必須換掉 —— 玩家會照著它等，
 * 而它永遠不會發生。
 */
/**
 * 這一層的 boundary **什麼時候**才會重試。
 *
 * ⚠️ 這不是措辭偏好，是一個實測到的謊話。原本所有 fallback 都寫「下一回合會自動
 * 重試」，而包住整個 `<MatchOverlay />` 的那一顆 resetKey 是 `matchEpoch` ——
 * 換回合、換相位都不會動它。複驗者實測還原例外之後**等了 25 秒 HUD 沒有回來**，
 * 而畫面上那行字還在叫玩家等。玩家會照著它等，而它永遠不會發生。
 *
 * 所以文案跟著 resetKey 走：`round` = `${phase}:${round}`（HudRoot 的 37 個成員），
 * `match` = `matchEpoch`（MatchOverlay 那 10 個 + 最外層那一顆）。
 */
export type HudRetryScope = "round" | "match";

const RETRY_WHEN: Record<HudRetryScope, string> = {
  round: "下一回合",
  match: "換一場",
};

export function hudErrorFallbackText(
  label: string,
  exhausted = false,
  scope: HudRetryScope = "round",
): string {
  if (exhausted) return `${label} 顯示不出來（其餘介面正常，請重新整理頁面）`;
  return `${label} 顯示不出來（其餘介面正常，${RETRY_WHEN[scope]}會自動重試）`;
}
