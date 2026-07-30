/**
 * 擊退／擊飛 (`knockback`) 的硬上界 —— 一份表，兩個消費端 (lane P4).
 *
 * 完全比照 `spreadLimits.ts`：這裡**不是**平衡政策，是 MIS-PARSE 護欄。
 * CLAUDE.md「欄位要有上界，不是只有下界」講的就是這件事，而 w3x 的長度單位
 * 大約是 GGD 的 54.5 倍，所以任何從原始資料直接貼過來的 `Dist` 欄位
 * (200 / 400 / 1000) 都會把一個身體扔出整個競技場。
 *
 * ⚠️ 為什麼 sim 端也要夾一次（schema 已經擋了）—— 因為 schema 不是唯一入口。
 * 後台 overlay 的寫入路徑到今天為止**沒有跑 Zod**（#283，而且那裡的註解宣稱
 * 有，是假的），所以一份 `distance: 400` 的 ability 文件真的可以進到 registry。
 * schema 擋的是「檔案進不來」，sim 夾的是「就算進來了，一發技能也不會把人
 * 扔到場外」。兩層都要。
 *
 * ---------------------------------------------------------------------------
 * 數字從哪來
 * ---------------------------------------------------------------------------
 * `MAX_DISTANCE = 20` —— 這個數字是**量出來的**，不是憑感覺挑的。掃出貨內容
 *   (`content/abilities/*.json`) 找到 16 個文件 / 11 支技能的說明白紙黑字寫著
 *   擊退，其中三支直接寫了 w3x 的原始長度：
 *
 *       77-01 百烈櫻華斬 (godie-e00w/e00x.q)「擊退1000距離」
 *       78-04 死亡噴射肘擊 (godie-u00v.r)    「擊退目標1000距離」
 *       32-01 一騎槍閃 (godie-opgh.q)        「擊退目標600距離」
 *
 *   `toLen` 是 ×11/600，所以最大的那一支換算後是 **18.33 GGD**。
 *   上界必須蓋得住它 —— 這是 memory「a verified WC3 value beats a sanity cap:
 *   raise the guard knowingly, don't rescale content」那一條:原作真的有的
 *   數字不該被護欄靜默改小。20 留了頭，同時仍然遠小於決鬥區半徑 24，所以
 *   「1000」直接貼進來（沒換算）還是會被擋下來，那才是這個上界要抓的錯。
 *   ⚠️ 這夾的是**作者寫的下限值**，不是最終距離：`impactPower` 走的是
 *   `combatFeel.knockbackRaw`，它的上界是操作者自己的 `maxBodies × bodyUnit`
 *   （後台可調，夾在 100×100）。那是 owner 明說的旋鈕，不該被這裡二次否決。
 * `MAX_SPEED = 200` —— 場地半徑 24、一個 tick 是 1/30 秒，200 表示一個 tick
 *   走 6.7 單位，已經是「看不到過程」的等級。再快就是瞬移。
 * `MAX_IMPACT_POWER = 100000` —— 這是**傷害單位**不是距離。出貨最肥的身體
 *   （殭屍王）是 6,000 級距，10 萬保證任何合理的「這一擊有多重」都寫得下，
 *   同時擋得住把 `1e9` 貼進來讓 `pct` 溢位成 Infinity。
 * `MAX_LAUNCH_HEIGHT = 20` —— w3x 裡最高的一條弧是 A=1000 wc3 ≈ 18.33 GGD
 *   (`sim/movement/leap.ts` 檔頭的十條 JASS 弧)，20 蓋得住每一條，而
 *   「200」那種漏掉單位換算的貼上會被擋在門外。
 * `MAX_GETUP_TICKS = 90` —— 3 秒 @30Hz。`combat/damage.ts` 的
 *   `KNOCKDOWN_TICKS` 是 14 (≈0.47s)；3 秒已經是一個回合的 1/60，再長就等於
 *   一次技能把人從遊戲裡拿掉，而且是靜默的（「14 打成 1400」）。
 *
 * 五個都是**硬上界**，不是預設值。缺欄位時的預設寫在 `knockback.ts` 的
 * `DEFAULT_*`／`?? `旁邊，語意是「作者沒指定 → owner 明說的那個」。
 */

/** 作者寫的擊退距離（gap 0 時的下限）上界，GGD 單位。 */
export const KB_MAX_DISTANCE = 20;
/** 擊退滑行速度上界，GGD 單位/秒。 */
export const KB_MAX_SPEED = 200;
/** `impactPower` 上界 —— 傷害單位，不是距離。 */
export const KB_MAX_IMPACT_POWER = 100000;
/** 擊飛頂點高度上界，GGD 單位。 */
export const KB_MAX_LAUNCH_HEIGHT = 20;
/** 落地後「爬起來」不可控制 tick 上界。 */
export const KB_MAX_GETUP_TICKS = 90;

/** 夾到 [0, max]；非有限值 → 0（`NaN` 會讓每個比較都是 false，規則靜默消失）。 */
export function clampKb(v: number | undefined, max: number, fallback = 0): number {
  if (v === undefined || typeof v !== "number" || !Number.isFinite(v)) return fallback;
  if (v < 0) return 0;
  return v > max ? max : v;
}
