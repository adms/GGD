/**
 * Lane 1（2026-08-08）四個新 effect kind 的**上下界**，schema 與 handler 共用一份。
 *
 * ── 為什麼是一支共用檔而不是四份各自的常數 ────────────────────────────────
 * 第零守則⑨：「N 個同型項目 = K 個模板 + 一張表」。這四個 kind 是同一個形狀
 * （`shape` + 決策欄位 + 一個 handler）的四個實例，它們的界如果各自寫在
 * `content/schema/effect.ts` 的字面量裡，就是四份**沒有守衛**的第二住處 ——
 * schema 改了、handler 的夾值沒改，而兩邊看起來都對。
 *
 * ⚠️ CLAUDE.md：「欄位要有**上界**，不是只有下界」。下面每一格都是**誤打守衛**
 * （50 打成 500 那一類），不是平衡政策 —— 平衡值住在 `content/` 與後台。
 */

/** `modifyCooldown.mode:"reduce"` 的比例上界。1 = 直接歸零（那時該用 `"reset"`）。 */
export const CD_REDUCE_MAX_PCT = 1;
/**
 * `modifyCooldown.mode:"reduceFlat"` 的秒數上界。
 * 120 = 出貨最長的 EX 冷卻；再大就不是「縮短」而是打錯字。
 */
export const CD_REDUCE_MAX_FLAT_SEC = 120;

/**
 * `weightedBranch.branches` 的分支數上界。
 * 12 ≈ 一場的總人數，也遠大於俄羅斯輪盤要的 3 —— 它擋的是「一份被程式產生器
 * 灌爆的文件」，不是設計空間。
 */
export const BRANCH_MAX_COUNT = 12;
/**
 * 單一分支的 `weight` 上界。權重是**相對**的，所以絕對值多大都不影響結果，
 * 上界純粹是誤打守衛（1e9 會讓總和的浮點精度開始說謊）。
 * ⚠️ 下界是 **0**（允許「先關掉這個分支」而不必刪掉它），所以「總和為 0」
 * 必須另外在**載入時**擋 —— 見 schema 的 `refineWeightedBranch`。
 */
export const BRANCH_MAX_WEIGHT = 1000;

/**
 * `swapResource.clampMin` 的上界。
 * §16.16 建議的下限是 1（交換不殺人）；做成欄位是因為「交換到 0 血算不算死」
 * 是真的設計決定。上界 100 —— 再高就會在低血上限的身體上把交換變成純加血。
 */
export const SWAP_CLAMP_MIN_MAX = 100;

/**
 * `eventValueConversion.ratio` 的上界。5 = 「轉出 5 倍」已經是一個迴圈，
 * 而 15-002 太陰道要的是 1 以下。
 */
export const CONVERT_MAX_RATIO = 5;
/** 轉換順帶給的臨時屬性加成的秒數上界（「**短暫**加成至 AP」）。 */
export const CONVERT_BUFF_MAX_SEC = 60;

// ═══════════════════════════════════════════════════════════════════════════
//  Lane 2（2026-08-08）—— 三個新 kind 的界，住進**同一張表**
//
//  ⚠️ 不另開 `lane2Limits.ts`。第零守則⑨：同型項目要收斂成一張表，兩張表的
//  那一天它們會分岔，而每一張看起來都對。下面每一格一樣是**誤打守衛**
//  （50 打成 500 那一類），不是平衡政策。
// ═══════════════════════════════════════════════════════════════════════════

/**
 * `randomArea.count`（一次施放總共落幾發）的上界。
 * 32 遠大於出貨最多的一支（13-04 龍星群 10 顆），擋的是「一份被程式產生器灌爆
 * 的文件」—— 而它同時是**決定性預算**的上界：一發落點吃 2 次 rng draw，
 * 所以一次施放最多推進亂數流 64 步，這個數字必須是**看得到**的。
 */
export const RANDOM_AREA_MAX_COUNT = 32;
/**
 * `randomArea.intervalSec` 的上界。
 * 10 秒 ≈ 一個回合的十分之一；再長就不是「一波齊射」而是打錯字。
 * ⚠️ 下界不在這裡：schema 用 `.positive()`，執行期再夾成**至少 1 tick**
 * （見 `randomArea.ts`）—— 0.001 秒與 0.033 秒在 30Hz 下是同一件事，
 * 而一個會算出 0 tick 間隔的排程會把整波塞進同一個 tick。
 */
export const RANDOM_AREA_MAX_INTERVAL_SEC = 10;
/**
 * `randomArea.scatterRadius`（落點散佈半徑）的上界，與 schema 既有的
 * `radius` 上界同一個數字 —— 兩者都是「這個效果碰得到多遠」，分開會讓
 * 「散佈可以超出競技場」變成一個沒有人發現的合法值（場地 `boundaryRadius` 是 24）。
 */
export const RANDOM_AREA_MAX_SCATTER_RADIUS = 40;

/**
 * `manaBarrier.perMana`（一點魔力抵幾點傷害）的上界。
 * 44-00 機警是 **3**。20 = 一點魔力抵二十點傷害已經讓魔力條變成第二條血條，
 * 而那是一個平衡決定，不該靠打錯字達成。
 */
export const MANA_BARRIER_MAX_PER_MANA = 20;
/** `manaBarrier.durationSec` 的上界。60 = 一個回合的長度量級。 */
export const MANA_BARRIER_MAX_DURATION_SEC = 60;

/**
 * `extendBuff.addSec`（滿一份門檻延長幾秒）的上界。52-01 狂戰士之怒是 **2**。
 */
export const EXTEND_BUFF_MAX_ADD_SEC = 30;
/**
 * ⭐ `extendBuff.maxRemainingSec` 的上界 —— 這一格是這個 kind 的**安全閥**。
 *
 * 「每承受 5% 最大生命的傷害就延長 2 秒」在一個高血量、高減傷的身體上是一條
 * 正回饋：挨得越多、狂怒越久。沒有上界它會變成**永久**，而且症狀是「這場比賽
 * 就是打不完」，不是一個看得出來的錯誤。所以 `maxRemainingSec` 是**必填**
 * （不是選填），這裡只是它自己的上界。
 */
export const EXTEND_BUFF_MAX_REMAINING_SEC = 120;
/**
 * `extendBuff.perDamagePctOfMaxHealth` 的上界。
 * 1 = 「承受一整條血才延長一次」，比它大的數字沒有語意。
 */
export const EXTEND_BUFF_MAX_THRESHOLD_PCT = 1;

// ═══════════════════════════════════════════════════════════════════════════
//  Lane 3（2026-08-10）—— 六個新機制的界，住進**同一張表**
//
//  ⚠️ 一樣不另開第三張表（第零守則⑨）。下面每一格一樣是**誤打守衛**
//  （0.2 打成 20、3 打成 300 那一類），不是平衡政策 —— 平衡值住在 `content/`
//  與後台。schema 與 handler 都 `import` 這裡，⛔ 不在任何一邊抄字面值。
// ═══════════════════════════════════════════════════════════════════════════

/**
 * `damageArea.onHitTargets` / `damageLine.onHitTargets` 一段最多掛幾個效果
 *（effect.target-set-chain@1）。
 *
 * 失敗形態與 {@link BRANCH_MAX_COUNT} 同一族：一份把 40 段效果掛在一次濺射上的
 * 文件不是「很豐富」，是一次 tick 的預算炸掉，而症狀是掉幀不是錯誤訊息。
 * ⚠️ 它只擋**寬度**不擋**深度** —— 一段 `onHitTargets` 裡可以再放一個帶
 * `onHitTargets` 的 `damageArea`。JSON 不可能有環，所以深度由文件本身的巢狀
 * 決定、必然有限；這與 `randomArea.effects` 的既有姿態一致。
 */
export const EFFECT_CHAIN_MAX_STEPS = 8;

/**
 * `HookDef.maxTriggers`（一條 hook 總共能發動幾次）的上界。
 *
 * 99 = 誤打守衛（3 打成 300 那一類）。⛔ 缺席 = **無限次** = 這個欄位出現之前
 * 每一條 hook 的行為，所以這個上界只約束**明確填了次數**的那些。
 */
export const HOOK_MAX_TRIGGERS = 99;

/**
 * `dash.onEnd`（衝刺結束那一刻跑的那一段）的長度上界。
 * 8 遠大於「AoE 傷害 + 減速 + 特效」這種真實用法。
 */
export const DASH_ON_END_MAX_EFFECTS = 8;

/**
 * `delayed.delaySec`（第一發要等多久）的上界。
 * 10 秒 ≈ 一個回合的二十分之一；再長就不是「延遲斬擊」而是打錯字。
 */
export const DELAYED_MAX_DELAY_SEC = 10;
/**
 * `delayed.count`（一次施放總共落幾發）的上界，與 {@link RANDOM_AREA_MAX_COUNT}
 * **同一個數字同一個理由**：兩者都是「一次施放排出幾個未來的 tick」。
 * ⚠️ 52-002 卡面寫「連續 100 下」——那是一個**設計決定**，要突破就改這個常數
 * 並知道自己在做什麼（同 ggd-faithful-import-over-rescale：明知地抬高守衛，
 * ⛔ 不要偷偷把內容 rescale 成 32）。
 */
export const DELAYED_MAX_COUNT = 32;
/**
 * `delayed.intervalSec` 的上界。10 秒同 {@link RANDOM_AREA_MAX_INTERVAL_SEC}。
 * ⚠️ 下界不在這裡：schema 用 `.positive()`，執行期再夾成**至少 1 tick** ——
 * 0.001 秒與 0.033 秒在 30Hz 下是同一件事，而一個算出 0 tick 間隔的排程會把
 * 整波塞進同一個 tick（畫面上就不是「連擊」而是「一下」）。
 */
export const DELAYED_MAX_INTERVAL_SEC = 10;
/**
 * ⭐ `delayed.advance.stepDist` / `.startDist`（每一發往前推幾格 / 第一發離施法者
 * 多遠）的上界，**GGD 單位**。
 *
 * 8 是 **mis-parse 柵欄**不是平衡政策，而且這一格的 mis-parse 是可以指名的：
 * 原作的每一步都是 WC3 單位（龍破斬 45、月牙天衝 50、蒼龍破 ~67、光牙 50、
 * 龍氣爆發 75、神通眼 100），換算是 `GGD_PER_WC3`（≈1/54.5）。一個忘了換算而
 * 直接貼進來的 `50` 會是 **50 GGD 單位**＝兩倍競技場直徑，於是第一發就落在場外，
 * 整支技能**一個人都打不到** —— 而畫面上跟「這支技能沒做」一模一樣（失敗形態②）。
 * 8 GGD ≈ 436 WC3 單位，已經是全 repo 最大一步（100）的四倍餘裕。
 */
export const DELAYED_MAX_STEP_DIST = 8;

/**
 * `proxyCast.maxDepth` 的上界 —— ⭐ 這一格是 `proxyCast` 的**終止性證明**。
 *
 * 與 `reflectLimits.ts` 的 `REFLECT_MAX_CHAIN_DEPTH` 同一個角色：
 * `EffectContext.proxyDepth` 嚴格遞增 + 一個有界的上限 ⇒ 鏈長有限 ⇒ 一定終止。
 * ⛔ 它必須是一個**看得見的數字**：一個沒有上界的 `maxDepth` 等於把「這一場會
 * 不會卡死」交給內容作者，而症狀是 `world.step()` 不回來 —— 不是一個看得出來
 * 的錯誤。3 = 「A 放 B、B 放 C、C 放 D」已經沒有人看得懂了。
 */
export const PROXY_MAX_CHAIN_DEPTH = 3;

/**
 * `applyBuff.maxStat.value` 的上界 —— **打錯數字的護欄，不是平衡政策**。
 *
 * 它擋的是「多打一個零」與「沒換算的 WC3 原始值」（WC3 的距離單位是 GGD 的
 * 約 109 倍，所以一個忘了換算的 600 會變成一個永遠咬不到的天花板 —— 而畫面上
 * 跟「這張卡就是沒有上限」一模一樣，正是失敗形態②）。
 *
 * 100000 遠高於任何合理的設計值（全 repo 最大的既有屬性天花板是攻速 10、
 * 血量以千計），但擋得住 1e6 那一級的打字錯誤。
 * ⛔ 要調平衡請改那張卡自己的 `maxStat.value`，不是這個常數。
 */
export const STAT_CEILING_MAX = 100000;

// ───────────────────────────────────────────────────────────────────────────
// [EX∅ 根源] 詞彙包（2026-08-18）—— 五條 lane 共用的上下界，**一份表**。
// ⛔ 這七個常數一律 import，不抄字面值進 Zod（第零守則⑦：抄一份就是第四個
// 住處，而它沒有守衛）。
// ───────────────────────────────────────────────────────────────────────────

/**
 * `typeStreakImmunity.threshold`（連續幾發同型之後開始免疫）的上界。
 *
 * 20 是 mis-parse 柵欄不是平衡政策：卡片上寫的是「連續 2 次」，而一個把 2 打成
 * 20 的門檻在一場 3 分鐘的回合裡**永遠達不到** —— 畫面上跟「這件寶具沒做」
 * 一模一樣（失敗形態②）。
 */
export const TYPE_STREAK_MAX_THRESHOLD = 20;

/**
 * `typeStreakImmunity.streakTimeoutSec`（連擊多久沒被續上就歸零）的上界。
 *
 * 抄 `zInvulnerable.durationSec` 的同一個判例：一段沒有上界的免疫 = 一個打不完
 * 的回合。⚠️ **缺席 = 永不逾時**，所以這個上界只約束明確填了秒數的那些；
 * 出貨值填不填是 owner 的平衡決定。
 */
export const TYPE_STREAK_MAX_TIMEOUT_SEC = 30;

/**
 * `carry.durationSec`（背多久）的上界。
 *
 * 6 打成 60 = 一名英雄整個回合退出戰鬥而且不可被選取 —— 那不是一個技能，
 * 那是一個少打一個 0 的錯字。
 */
export const CARRY_MAX_SEC = 30;

/** `carry.maxTargets`（一次背幾個）的上界。一個 zone 只有 6 名英雄。 */
export const CARRY_MAX_PASSENGERS = 3;

/**
 * `aura.scaleByNearby.min` / `.max`（人數縮放的層數）的上界。
 *
 * 一個 zone 最多 6 名英雄，8 是 mis-parse 柵欄。⚠️ 它承重：`stacks` 是**線性**
 * 乘數（`statPipeline.ts` 的 `pctMult *= 1 + m.value * stacks`），一條
 * `pctMult -0.5` 配 stacks 2 就是把對方那條屬性歸零。
 */
export const AURA_COUNT_MAX = 8;

/** `convertTeam.durationSec`（借多久）的上界。抄 `summon.durationSec` 的 600。 */
export const CONVERT_TEAM_MAX_SEC = 600;

/** `convertTeam.maxHeld`（同時控幾隻）的上界。 */
export const CONVERT_TEAM_MAX_HELD = 8;

// ═══════════════════════════════════════════════════════════════════════════
//  連鎖閃電（GH#451，2026-08-19）—— `chainLightning` 的界，住進**同一張表**
//
//  ⛔ 不另開 `chainLimits.ts`（第零守則⑨，同 Lane 2 的理由）。下面每一格
//  一樣是**誤打守衛**，不是平衡政策 —— 平衡值住在 effect 文件裡。
// ═══════════════════════════════════════════════════════════════════════════

/**
 * `chainLightning.radius`（起始圈）與 `jumpRange`（每一跳能跳多遠）的共用上界。
 *
 * 24 = 決鬥區的 `boundaryRadius`，理由與 `spreadLimits.SPREAD_MAX_RADIUS` 逐字
 * 相同：超過它的圓沒有第二種意思（已經蓋滿全場），而它照樣擋得住任何一個沒換算
 * 的 w3x 原始值（w3x 的 300 ≈ GGD 的 5.5）。
 *
 * ⚠️ 原作 `A04H`（base `AOcl`）的 `area` 是 **1800 w3x ≈ 33 GGD** —— 也就是
 * 「整張地圖隨便跳」。夾到 24 之後行為**完全相同**（24 已經是整個決鬥區），
 * 所以這條界對忠實度是零損失。
 */
export const CHAIN_MAX_RADIUS = 24;

/**
 * 一條連鎖總共能打到幾個人（含起點）的上界。
 * 原作 `A04H` 的 DataB 是 **16**（兩支技能的說明都寫「傳遞16次」），24 給的是
 * 一點點設計餘裕；再大就不是設計而是打錯字。
 */
export const CHAIN_MAX_JUMPS = 24;

/** 每一跳的傷害倍率界。1 = 不遞減，0 = 第二跳起歸零。超過 1 就不叫遞減了。 */
export const CHAIN_MIN_DECAY = 0;
export const CHAIN_MAX_DECAY = 1;

/** 一次施放最多生出幾條連鎖（＝起始圈裡最多幾個人各觸發一次）的上界。 */
export const CHAIN_MAX_SOURCES = 20;

/**
 * ⭐ **一次施放的總跳數硬上限** —— 這一格是這個 kind 的保險絲，不是平衡旋鈕。
 *
 * ⚠️ 為什麼非有不可：這個機制的成本是 **O(來源數 × 跳數)** 次空間查詢，而場上
 * 尖峰是 **100 隻殭屍** —— `content/config/arena-rules.json:241` 的
 * `mobWaves.schedule[3]`（第 9 回合）`maxAlivePerZone: 50`，× 2 zone。
 * ⛔ 不是 30：30 只是 `schedule[1]`（第 7 回合）那一格，讀成上限會低估一半。
 * 20 條連鎖 × 24 跳 = 480 次「找下一個」+ 480 筆傷害。
 * 沒有這一格的話，「越多單位越痛」在引擎側就是「越多單位越卡」。
 *
 * ⭐ **量到的（2026-08-20，best-of-3 穩態，100 隻身體，480 跳打滿）**：
 *
 * | 排程 | 施放那一 tick | 之後每個**有付款的** tick | 單格最多幾發 |
 * |---|---|---|---|
 * | 一格 tick 全結算（**舊**） | **6.83 ms**（plain node）/ ~9.8 ms（vitest） | — | **480** |
 * | 逐跳（`jumpIntervalSec` > 0，**現在**） | **0.09 ms** | **0.26 ms** | **20** |
 *
 * ⇒ 約 **14 µs 一跳**，⭐ **總工作量一個位元組都沒少** —— 變的是分佈：一個 tick
 * 扛的從 480 發變成「還活著的鏈數」（= `maxSources` 上限 20），30Hz 一格的
 * **20% → 0.8%**。這正是 owner 2026-08-20 說的「剛好可以避免你說的計算上限」：
 * ⭐ 攤平，⛔ 不是砍掉。
 * ⚠️ **第一次呼叫**是 ~50 ms（JIT 冷啟動，不是穩態成本）。
 * ⚠️ ⛔ **不要報「160 格裡的最大值」** —— 那麼長的迴圈幾乎一定會撞到一次 GC
 * 停頓，同一個情境量過 0.34 / 4.67 / 14.68 三種「最大值」，而那是 GC 不是這個
 * 機制（`ggd-behaviour-dependent-quantities`：兩次量不一致就是它是個區間）。
 * ⛔ 這些是量到的不是推的（`chainLightning.test.ts` 的第三條會把數字印出來）。
 *
 * 480 = `CHAIN_MAX_SOURCES`(20) × `CHAIN_MAX_JUMPS`(24)，也就是**兩個上界都拉到
 * 頂**的那個數字。選它是因為這一格是**上界**（誤打守衛），⛔ 不是預設值：
 * 它不會改變任何一份照著另外兩個上界寫的文件的行為。真正在場上生效的是
 * `chainLightning.maxTotalJumps` 這一格**內容欄位**（第一守則：決策點可調），
 * 出貨值由技能文件自己寫。實測見 `chainLightning.test.ts` 的 60 目標情境。
 */
export const CHAIN_MAX_TOTAL_JUMPS = 480;

/**
 * 作者沒寫 `maxTotalJumps` 時的預設 —— 上界本身（＝只受另外兩個上界拘束）。
 * 語意與 `spreadLimits.DEFAULT_SPREAD_MAX_TARGETS` 逐字相同：⛔ 一個**會咬人的
 * 預設**等於一格「我明明寫了 16 跳卻只跑了 8 跳」的靜默截斷（失敗形態②）。
 * 要限制就在文件裡寫出來。
 */
export const DEFAULT_CHAIN_MAX_TOTAL_JUMPS = CHAIN_MAX_TOTAL_JUMPS;

/**
 * ⭐ `chainLightning.jumpIntervalSec`（**兩發閃電之間**的秒數）的上界。
 *
 * owner 2026-08-20：「每個閃電有**極小的時間間隔**播放閃電動畫與傷害才到下一個」。
 * 1 秒是**誤打守衛**（0.05 打成 5 那一類），不是平衡政策：24 跳 × 1 秒 = 一條鏈
 * 放電 24 秒，已經比一整個回合的四分之一還長，那不是「極小的間隔」而是打錯字。
 * ⚠️ 下界是 **0**（合法值 = 明寫「我要瞬發」），所以它不能用 `.positive()`。
 * 執行期再夾成**至少 1 tick**（見 `chainLightning.ts`）—— 0.001 秒與 0.033 秒在
 * 30Hz 下是同一件事，而一個算出 0 tick 間隔的排程會把整條鏈塞回同一個 tick，
 * 那正是這一版要修的症狀（同 `RANDOM_AREA_MAX_INTERVAL_SEC` 的那一段）。
 */
export const CHAIN_MAX_JUMP_INTERVAL_SEC = 1;

/**
 * 作者沒寫 `jumpIntervalSec` 時的預設 —— ⭐ **不是 0**。
 *
 * ⚠️ 這一格與 {@link DEFAULT_CHAIN_MAX_TOTAL_JUMPS}（＝上界本身，刻意不咬人）
 * **立場相反**，而那是第〇·六守則要的：owner 2026-08-20 的裁決說時間差是這支
 * 技能的**身分**（「有其特殊性與純範圍直接給傷害區別很大」），而
 * 「優先權大的更新後都是**預設啟動**」。一個 0 的預設會讓「忘了寫這一格」
 * 靜默退回被推翻的那個行為 —— 說了但不會發生（第一·五守則）。
 *
 * 0.05 秒 ≈ 30Hz 的 **1.5 tick**（執行期 `Math.round` 成 2 tick ≈ 0.067 秒），
 * 也就是肉眼看得出先後、但整條 16 跳的鏈仍在 ~1 秒內走完。
 */
export const DEFAULT_CHAIN_JUMP_INTERVAL_SEC = 0.05;

/**
 * ⭐ **同時在飛的鏈**的硬上限 —— 逐跳排程之後才出現的一個**新的量**。
 *
 * 舊版沒有這一格也不需要：整次施放在一個 tick 裡結算完，佇列不存在。
 * 逐跳之後「還沒放完電的鏈」會跨 tick 累積，而每一條鏈每個到期 tick 都要付
 * 一次空間查詢 + 一筆傷害（量到 ~14 µs）。240 條 ≈ **3.4 ms** 的最壞單 tick，
 * 也就是 30Hz 一格的 10%；而 240 = 12 次滿編施放（20 條）同時在飛，
 * 已經遠超過六名英雄 + 冷卻擋得住的情況。
 *
 * ⛔ 撞到上限時**不是丟掉那幾條鏈**（那會安靜地少打幾個人 = 失敗形態②）——
 * 是那一次施放**退回瞬發**（同一 tick 全部結算）：傷害一筆不少，失去的是時間差。
 */
export const CHAIN_MAX_LIVE_STRANDS = 240;
