/**
 * couchChampSelect — 沙發模式下**手把在選人畫面上循環的那份清單**（GH#518）。
 *
 * ---- 缺陷 -------------------------------------------------------------------
 * `GameApp.onPadButton` 原本寫的是 `Champions.ids()` —— 那是**整份登錄表**：
 * 下架的英雄（owner 2026-08-02「預設不應該再有」）、變身態的第二具身體
 * （owner 2026-07-26「換成本體，變身態改由技能觸發」）、隱藏彩蛋
 * （owner 2026-08-17「隱藏角色可以隨機到 但不能選到」）、以及**沒有被營運勾選**
 * 的英雄，全部都在裡面。
 * ⇒ 一個坐在沙發上的 2P 用 A 一路按下去，會停在一個**伺服器會拒絕**的 id 上，
 *   而畫面上只是那一格不動 —— 失敗形態②（送出去了但什麼都沒發生）。
 *
 * 滑鼠玩家不會踩到，因為格子那一邊
 * （`ui/panels/ChampSelectPanel` → `applyChampionWhitelist`）早就在過濾了。
 * ⛔ 所以這裡**不是**第二套規則：它呼叫的是同一支 `whitelistedChampionIds`，
 * 兩邊只可能一起對或一起錯。
 *
 * ---- ⭐ 清單從**後台白名單**推導，⛔ 不從檔案系統／整份登錄表 --------------
 * 順序：`Champions.ids()`（登錄表原始順序，穩定）
 *   → `whitelistedChampionIds(ids, wl, retired, hidden)`
 *   → 變身態被**解析回本體**（⛔ 不是被丟掉 —— 那是 #55 黑化Saber 的形狀）、
 *     重複塌掉、下架／隱藏／未勾選的被移除。
 *
 * ⚠️ 白名單是**非同步**抓回來的（`ui/panels/whitelist.ts`，一場一次的 memo），
 * 而手把按鍵是同步事件。所以這裡持有一份**快照**：`primeWhitelist(matchId)`
 * 在 champ-select 期間把它拉進來，按鍵當下讀的是最後一次拿到的值。
 * ⛔ 還沒回來時退回 `NO_FILTER` —— 那不是「全開」，`whitelistedChampionIds`
 * 在不強制的情況下**照樣**拿掉變身態與下架的，那三層是內容事實，⛔ 不是營運選項。
 */
import { Champions } from "@ggd/shared/sim/content/registry";
import { hiddenChampionIds, retiredChampionIds } from "@ggd/shared/content/championRetirement";
import { NO_FILTER, whitelistedChampionIds, type Whitelist } from "../ui/panels/champSelectFilter";
import { whitelistForMatch } from "../ui/panels/whitelist";

/**
 * 手把循環得到的英雄清單。⚠️ 純函式，⛔ 沒有讀登錄表也沒有讀網路 ——
 * 三個來源全部是參數，所以守衛可以直接餵一份含變身態／下架／未勾選的清單。
 */
export function couchPickableIds(
  ids: readonly string[],
  wl: Whitelist,
  retired: ReadonlySet<string>,
  hidden: ReadonlySet<string>,
): string[] {
  return whitelistedChampionIds(ids, wl, retired, hidden);
}

/** 這一場的白名單快照。⚠️ 只被 `primeWhitelist` 寫，⛔ 沒有別的寫入點。 */
let snapshot: Whitelist = NO_FILTER;
let primedFor = "";

/**
 * 把這一場的白名單拉進快照（重複呼叫同一個 matchId 是免費的 —— 底下是
 * `whitelistForMatch` 一場一次的 memo，⛔ 不會重打一次 HTTP）。
 */
export function primeWhitelist(matchId: string): void {
  if (primedFor === matchId) return;
  primedFor = matchId;
  snapshot = NO_FILTER;
  void whitelistForMatch(matchId).then((wl) => {
    if (primedFor === matchId) snapshot = wl;
  });
}

/** 出貨路徑上的那份清單：登錄表 × 白名單快照 × 下架 × 隱藏。 */
export function shippedCouchPickableIds(): string[] {
  return couchPickableIds(
    Champions.ids().map(String),
    snapshot,
    retiredChampionIds(),
    hiddenChampionIds(),
  );
}

/**
 * 每位沙發玩家的游標。⭐ 記的是**英雄 id**，⛔ 不是索引 —— 白名單是非同步回來的，
 * 清單長度會在一場之內變一次（`NO_FILTER` → 營運勾選的那幾隻）。存索引的話那一刻
 * 每個人手上的英雄會**無聲跳掉**；存 id 就只是「從他現在這一隻的下一隻繼續」。
 */
const cursor = new Map<number, string>();

/** ⚠️ 測試用：忘掉所有游標。 */
export function __resetCouchCursorsForTest(): void {
  cursor.clear();
}

/**
 * 下一隻（`step = +1`）／上一隻（`step = -1`）。清單空的時候回 null ——
 * 呼叫端**不送**，⛔ 不是送一個空字串（那會被伺服器拒絕，而畫面上看不出來）。
 */
export function cycleCouchChampion(player: number, step: number, list: readonly string[]): string | null {
  if (list.length === 0) return null;
  const cur = cursor.get(player);
  const at = cur === undefined ? -1 : list.indexOf(cur);
  // 沒選過（-1）時 +1 → 第 0 隻；-1 → 最後一隻。兩個方向都要能開場。
  const next = ((at + step) % list.length + list.length) % list.length;
  const id = list[next]!;
  cursor.set(player, id);
  return id;
}
