/**
 * ⭐⭐ 第十一回合的**取捨迴圈**（GH#920 / #1151 C）—— 純函式，⛔ 不碰 world。
 *
 * > owner 2026-09-01（逐字）：
 * > 「殭屍王要有真正的威脅跟獎勵對抗取捨（寶具死掉會隨機噴 有機會隨機三選一再拿到新的）
 * >  **特殊殭屍打死才能復活隊友一次**（出現復活圈）而不是無限復活
 * >  **普通殭屍放著會變成特殊殭屍**
 * >  噴寶具是**你死就一定會噴 被誰殺死都會隨機噴一件**
 * >  打死殭屍王後的重抽三選一 **不暫停時間**喔
 * >  **寶具掉落 就是損壞了 不能撿回**」
 * > owner 2026-09-02（逐字）：「[普通 → 特殊：一隻普通殭屍存活滿 **45 秒** 就轉化] ok」
 *
 * ── ⭐ 迴圈：拖延 ⇒ 特殊怪更多 ⇒ 復活權更多，⛔ 而場面失控 ──────────
 * ⭐ 三種敵人**各自同時是你想要的東西與你害怕的東西**。
 */

/**
 * ⭐ 這一隻普通殭屍**放到夠久了嗎**？
 *
 * ⚠️ ⭐ 吃的是**絕對 tick**（`spawnTick` 與現在），⛔ 不是一個遞減計數器 ——
 * `sim/**` 禁遞減計數器（`purity.test.ts` 在守），⭐ 而且絕對 tick 在
 * 長 tick／重播快轉之下**不會漏掉**轉化的那一刻。
 *
 * ⚠️ `secs <= 0` ⇒ ⛔ **不轉化**（＝這個機制關著），
 * ⭐ 而**不是**「每一隻一出生就轉」—— 後者會讓場上瞬間全部是特殊怪。
 */
export function shouldConvertToSpecial(
  spawnTick: number,
  nowTick: number,
  secs: number,
  tickHz: number,
): boolean {
  if (!(secs > 0) || !(tickHz > 0)) return false;
  return nowTick - spawnTick >= secs * tickHz;
}

/**
 * ⭐ 死的時候**損壞哪一件寶具** —— 回格子索引；`null` ＝ 身上一件都沒有。
 *
 * ⚠️ ⭐ `roll` 是 **[0,1)** 的抽樣值（由 `world.rng` 給）——
 * ⛔ `sim/**` 禁 `Math.random`，而且錄影要重播得出同一件。
 *
 * ⚠️⚠️ ⭐ 它只在**有東西的格子**之間抽 —— ⛔ 不是「在 6 個格子裡抽，抽到空的就沒事」：
 * 後者會讓一個只帶一件寶具的玩家有 **5/6** 的機率什麼都沒損失，
 * ⭐ 而 owner 逐字說的是「**你死就一定會噴**」。
 */
export function pickItemToBreak(
  items: readonly (string | null | undefined)[],
  roll: number,
): number | null {
  const filled: number[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it !== null && it !== undefined && it !== "") filled.push(i);
  }
  if (filled.length === 0) return null;
  const r = roll < 0 ? 0 : roll >= 1 ? 0.999999 : roll;
  const idx = Math.floor(r * filled.length);
  return filled[idx < filled.length ? idx : filled.length - 1]!;
}

/**
 * ⭐⭐ ④ 打死殭屍王 ⇒ **這一次發不發重抽三選一**（GH#920 ④）。
 *
 * > owner 2026-09-01（逐字，⭐ 兩則，⛔ 兩則都不可以只讀一半）：
 * > 「殭屍王要有真正的威脅跟獎勵對抗取捨（寶具死掉會隨機噴
 * >  **有機會**隨機三選一再拿到新的）」
 * > 「打死殭屍王後的**重抽三選一 不暫停時間**喔 我回答過了」（23:52，⭐ 較新、較specific）
 *
 * ── ⭐ 為什麼**沒有**第二格 `enabled` 布林 ────────────────────────────
 * ⭐ `chancePct === 0` **就是**關著（⛔ 而不是「每次都不中」）——
 * ⚠️ 這是這個檔案上面 `shouldConvertToSpecial` 已經用過的**同一個**家族慣例
 * （逐字：「⛔ 調 0 ＝ **不轉化**（機制關著）」）。
 * ⛔ 一格 `enabled:false` ＋ 一格 `chancePct:50` 是**兩個住處在說同一件事**
 * （第〇·四守則），而它們會漂：關著卻寫 50 的那一格，讀的人分不出哪一個贏。
 *
 * ⚠️ ⭐ `sim/**` 禁 `Math.random`／時鐘 ⇒ `roll` 是呼叫端從 `world.rng` 取的
 * **[0,1)** 抽樣值，⭐ 而那讓錄影重播抽得出同一次結果。
 */
export function bossRerollGranted(chancePct: number, roll: number): boolean {
  // ⭐ 0（與負數）＝ 機制關著。⛔ 呼叫端在這之前就該連 rng 都不動 —— 見
  //   `MatchController.onRound11BossReroll`：關著的那條路要**逐位元 no-op**。
  if (!(chancePct > 0)) return false;
  if (chancePct >= 100) return true;
  const r = roll < 0 ? 0 : roll >= 1 ? 0.999999 : roll;
  return r * 100 < chancePct;
}
