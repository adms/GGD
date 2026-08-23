import { z } from "zod";
import { zId } from "../common";

/**
 * config.world-cues@1 —— **世界演出**那一張表（`content/config/world-cues.json`）。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 它為什麼是一張表而不是七段程式
 * ════════════════════════════════════════════════════════════════════════════
 * 2026-08-23 的窮舉稽核（118 個 `world.emit` 對全部消費端逐欄位比對）留下七筆
 * 判決，而**七筆在做同一件事**：「某個東西在某個座標出現／消失／掃過了，
 * 放一個演出」。
 *
 *   `mobSpawn` · `summonSpawn` · `summonDespawn` · `deathWardSpawn` ·
 *   `guardianSleep` · `guardianSpawn` · `damageLine`
 *
 * 七筆全部是**失敗形態②**（sim 算完了、`eventFanout` 白名單放行了、線路上真的
 * 送過去了，而客戶端**零個消費端**）—— 傷害照樣掉血、召喚物照樣站在場上，
 * 所以它看起來完全正常。
 *
 * ⛔ 逐支寫七個 `case` 是七份會各自腐爛的程式（第零守則⑨：「N 個同型項目 =
 * K 個模板 + 一張表，⛔ 不是 N 輪」）。⭐ 這裡的 **K = 2**：
 *
 *   · **點**（`point`）—— 一個座標上的一次性爆發。5 列。
 *   · **線**（`line`）—— 兩端 + 粗細的一道掃過。1 列。
 *
 * 而**參數住在這份 JSON**（第〇·四守則）—— ⛔ 不是烘在 `VfxSystem.ts` 的
 * TS 常數裡。CLAUDE.md 逐字記著「374 個 id-keyed 特效綁定住在 TS 常數裡
 * （GH#384）」是**違反的樣子**；同一個形狀在這裡就是「七個事件的顏色與大小
 * 散在七個 case 裡，owner 要調得改程式 + 重建映像」。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⛔ 第七筆（`guardianSpawn`）**刻意不在這份文件裡**
 * ════════════════════════════════════════════════════════════════════════════
 * 它是一列**帶理由的豁免**，住在 `apps/client/src/vfx/worldCues.ts` 的
 * `WORLD_CUE_EXEMPTIONS`。理由與到期條件寫在那裡，閘是
 * `performanceEventsHaveConsumers.test.ts`：一則過線的事件要嘛有消費端、
 * 要嘛在豁免表裡帶著一個**能被反駁**的理由，⛔ 兩者皆非就紅。
 *
 * ⚠️ 為什麼豁免的**理由**不住在這份 JSON：它不是旋鈕。owner 一輩子不會去後台
 * 編輯一段「為什麼我們決定不畫它」的中文，而通用表單引擎畫不了字串
 * （`deriveFields` 只認得 number / boolean），塞進來只會多一列 `preserved`。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ 每一格都是 number / boolean，⛔ 沒有 enum、沒有字串
 * ════════════════════════════════════════════════════════════════════════════
 * 逐字沿用 `config.feel-fx@1` 的判例：後台通用表單引擎的 `deriveFields` 只認得
 * 這兩種，一個 enum 會被歸進 `unsupported` 而那一頁會紅。所以：
 *
 *   · 「多重」不是 `"light" | "heavy" | "ex"` 三選一，是 `heavy` 這一格布林
 *     （⛔ 這七筆沒有一筆該用 `ex` —— 那一檔是死亡與 EX 施法的亮度）；
 *   · 顏色不是一個 `#rrggbb` 字串，是 `tintR/G/B` 三格 0–1 的數字。
 */

/** 0–1 的一個顏色成分。三格合起來就是這一團演出的 tint。 */
const zChannel = z.number().min(0).max(1);

/**
 * **點**演出 —— 一個座標上的一次性層疊爆發（`VfxSystem.layeredPop`）。
 *
 * ⚠️ 座標的來源有兩條，順序固定：① 事件 payload 上的 `x`/`z`；
 * ② payload 只有 `id` 時（`guardianSleep` 就是這一種），從 `entityPos(id)` 解。
 * 那條規則寫在 `worldCues.ts` 的 `worldCuePoint()`，是**模板的一部分**，
 * ⛔ 不是逐事件的 if。
 */
const zPointCue = z
  .object({
    /**
     * 這一則演出畫不畫。⭐ 這是 owner 的一鍵 rollback（2026-08-23：「留後台開關
     * 可以簡易 rollback」）—— 關掉之後畫面**逐位元**回到這一版之前，而事件照樣
     * 過線、實體照樣存在、傷害照樣結算。
     */
    enabled: z.boolean(),
    /**
     * 重版還是輕版。false = 輕（小、短、不搶戲）；true = 重（大、亮、看得到）。
     * ⚠️ 沒有第三檔：最亮的那一檔（`ex`）是死亡與 EX 施法在用的，這七筆沒有一筆
     * 該跟它們一樣響。
     */
    heavy: z.boolean(),
    /**
     * 這一團從**離地多高**冒出來（世界單位）。0 = 貼地（殭屍破土、旗子插進土裡）；
     * 1 以上 = 身體中段（守護者那種大塊頭）。⚠️ 這一格就是 owner 點名的「球體綁定
     * 位置」那一族 —— 綁錯高度的特效不是「醜」，是**看不見**（失敗形態①：算出來
     * 但畫在地板下）。
     */
    heightY: z.number().min(0).max(4),
    /** 這一團的**紅**成分（0–1）。 */
    tintR: zChannel,
    /** 這一團的**綠**成分（0–1）。 */
    tintG: zChannel,
    /** 這一團的**藍**成分（0–1）。 */
    tintB: zChannel,
  })
  .strict();

/**
 * **線**演出 —— 兩端之間的一道掃過（`VfxSystem.strikeArc`）。
 *
 * ⭐ 兩端**照抄 sim 解算完的那一條**（`damageLine` 的 payload 帶 `x/z → x2/z2`），
 * ⛔ 不從施法者的面向重算一條：玩家要看到的是**真的被判定到的那一條**，
 * 而施法者在事件到達之前已經轉身了。
 */
const zLineCue = z
  .object({
    /** 同 `point.enabled` —— 一鍵 rollback，關掉之後傷害一點不差。 */
    enabled: z.boolean(),
    /**
     * 這一道有多**重**（粗細與分岔一起放大）。0.4 = 一絲細線；2 = 又粗又炸。
     * ⚠️ 它與傷害無關 —— 打多痛是技能 JSON 的事，這一格只決定看起來多痛。
     */
    power: z.number().min(0.4).max(2),
    /**
     * 這一道在畫面上留幾毫秒。太短 = 眨眼就錯過（等於沒畫）；太長 = 一支每次普攻
     * 都會掃的技能（18-00 薔薇荊棘之刃）會把畫面塗滿。
     */
    lifeMs: z.number().int().min(40).max(2000),
    /** 這一道畫在**離地多高**（世界單位）。同 `point.heightY` 的理由。 */
    heightY: z.number().min(0).max(4),
    /** 這一道的**紅**成分（0–1）。 */
    tintR: zChannel,
    /** 這一道的**綠**成分（0–1）。 */
    tintG: zChannel,
    /** 這一道的**藍**成分（0–1）。 */
    tintB: zChannel,
  })
  .strict();

export const zConfigWorldCuesDoc = z
  .object({
    id: zId,
    schema: z.literal("config.world-cues@1"),
    note: z.string().optional(),
    /**
     * 一個座標上的一次性爆發。**鍵就是事件名**，逐字等於 sim `world.emit` 的
     * 第一個參數 —— ⛔ 不是一個要再對照一次的代號。
     */
    point: z
      .object({
        /** 殭屍破土（`sim/mobs.ts`）。一波最多 20 隻，所以出貨值刻意是輕的。 */
        mobSpawn: zPointCue,
        /** 召喚物成形（`sim/summons.ts`）。96-04 獨孤九劍的九柄劍魂就是這一則。 */
        summonSpawn: zPointCue,
        /** 召喚物消散（到期／被殺／主人死／被擠掉）。 */
        summonDespawn: zPointCue,
        /**
         * 【死亡遺留】豎旗的那一下（71-00 暗夜契約的暗夜旗）。
         * ⭐ **黑圈本身不在這裡** —— 它是一個實體（`ENTITY_KIND.NIGHT_FLAG`），
         * 由 `NightFlagView` 從快照畫，半徑是權威的。這一格只管「插旗的那一瞬間」，
         * 也就是實體補丁**表達不出來**的那一拍。
         */
        deathWardSpawn: zPointCue,
        /**
         * 守護者重新睡著（`GuardianSystem`，久沒被打就休眠）。
         * ⚠️ 這一則的 payload **只有 `id`**，座標由 `entityPos(id)` 解。
         */
        guardianSleep: zPointCue,
      })
      .strict(),
    /** 兩端之間的一道掃過。 */
    line: z
      .object({
        /**
         * 18-00 薔薇荊棘之刃（妖狐藏馬）每一次普攻掃出去的那條直線。
         * ⚠️ 寫這個 effect 的人自己在 `sim/effects/damageLine.ts` 留了一句
         * 「the player has to SEE the lash, not just take damage from it」——
         * 而在這份文件出現之前，客戶端**零個消費端**。
         */
        damageLine: zLineCue,
      })
      .strict(),
  })
  .strict();

/** 世界演出表（`content/config/world-cues.json`）。 */
export type ConfigWorldCuesDoc = z.infer<typeof zConfigWorldCuesDoc>;

/** 一列點演出。 */
export type WorldPointCue = z.infer<typeof zPointCue>;

/** 一列線演出。 */
export type WorldLineCue = z.infer<typeof zLineCue>;

/**
 * 出貨預設 —— `content/config/world-cues.json` 讀不到（舊部署／內容掛掉／被存壞的
 * override）時 `readWorldCues` 回退到的就是這一份。
 *
 * ⚠️ 每一格都要和 `content/config/world-cues.json` 一字不差 ——
 * `apps/client/src/vfx/performanceEventsHaveConsumers.test.ts` 的 drift 斷言在守。
 *
 * ⭐ 為什麼保險絲**全部開著**：這一層碰不到任何一點傷害、任何一塊錢、任何一個
 * 實體。它只決定「那一刻看不看得見」。讀不到內容就靜音掉整批演出，是把一個內容
 * 故障翻譯成「這七件事又回到不存在」—— 而那正是這一版在修的東西。
 */
export const DEFAULT_WORLD_CUES: ConfigWorldCuesDoc = {
  id: "world-cues",
  schema: "config.world-cues@1",
  point: {
    // 破土：貼地、土色、輕。一波 20 隻同時冒出來，重版會變成一堵牆。
    // ⛔⛔ 2026-08-23 出貨改 `false`（owner 逐字「**請你預設關閉**」）——
    //    他回報「第一回合就開始 lag」，而伺服器實測完全沒事（sim tick p99 **2.8ms**
    //    / 預算 33.3ms、**shedEvents 0**、主機 load **0.24**）⇒ 成本在客戶端，
    //    ⭐ 而這一列是**每一隻小怪各一發**（一波 20 隻 = 20 發）。
    //    ⇒ 想開回來就在後台「世界演出」轉開（`content/` 是 live bind-mount，存檔就生效）。
    mobSpawn: { enabled: false, heavy: false, heightY: 0.15, tintR: 0.55, tintG: 0.42, tintB: 0.28 },
    // 成形：術式紫、重。一次施放才一批，而「憑空多出一個打手」值得被看到。
    summonSpawn: { enabled: true, heavy: true, heightY: 0.9, tintR: 0.62, tintG: 0.48, tintB: 1 },
    // 消散：同色系但輕 —— 消失不該比出現更響。
    summonDespawn: { enabled: true, heavy: false, heightY: 0.9, tintR: 0.5, tintG: 0.42, tintB: 0.75 },
    // 插旗：貼地、暗夜紫、重。一回合最多 12 次（英雄死亡數），⛔ 不是每 tick。
    deathWardSpawn: { enabled: true, heavy: true, heightY: 0.1, tintR: 0.35, tintG: 0.2, tintB: 0.5 },
    // 休眠：守護者的琥珀色、輕、身體中段。它是「威脅解除」的訊號，⛔ 不是一次打擊。
    guardianSleep: { enabled: true, heavy: false, heightY: 1.2, tintR: 0.95, tintG: 0.72, tintB: 0.42 },
  },
  line: {
    // 荊棘綠、腰高、短。18-00 是**普攻**觸發，所以壽命刻意短 —— 它會一直發生。
    damageLine: {
      enabled: true,
      power: 0.9,
      lifeMs: 220,
      heightY: 0.9,
      tintR: 0.45,
      tintG: 0.85,
      tintB: 0.4,
    },
  },
};
