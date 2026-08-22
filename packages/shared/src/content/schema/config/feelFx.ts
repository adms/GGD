import { z } from "zod";
import { zId } from "../common";

/**
 * config.feel-fx@1 —— **爽度**那一層 (`content/config/feel-fx.json`, GH#494)。
 *
 * owner 2026-08-21 逐字：
 *   「殭屍死掉後**掉落小金幣**停留 **1秒**後**動畫效果軌跡(貝茲曲線加速)吸回到
 *     擊殺的英雄**搭配**輕音效** **提高爽度 模仿肉鴿遊戲的氛圍感**」
 *   「**連擊也會有像 candy crush 類似連段音階升高的音效**刺激玩家帶來獎勵感」
 *   「你在施展技能的時候會釋放一個粒子特效，最後會飄散到天空，這個**特效存活
 *     時間真的太長了，請你砍半，不需要後半段飄到天空**」
 *
 * ⭐ 這一份文件裡**沒有一格會改變任何人拿到的金幣**。擊殺賞金今天就已經在
 * `sim/systems/MobSystem.ts` 發完了（`grantGold` / `payMobBounty`），這裡描述的
 * 是那一刻**看得到、聽得到**的部分。`goldPickup.enabled = false` ⇒ 逐位元回到
 * 這一版之前：錢照給，只是不畫不響。
 *
 * ⚠️ 為什麼是自己一份文件而不是塞進 `config.vfx-cleanup@1`：那一份管的是
 * **回收**（池子留幾個、發射器上限），這一份管的是**手感**（飛多久、彎多高、
 * 音階升幾階）。兩者一起調的機會是零，而混在一起會讓「關掉爽度」這個止血閥
 * 順手把回收也關掉。
 *
 * ⚠️ 每一格都是 number / boolean，⛔ 沒有 enum：後台通用表單引擎的
 * `deriveFields` 只認得這兩種，一個 enum 會被歸進 `unsupported` 而那一頁會紅。
 * 「用哪一種緩動」因此是 `easePower` 這個**連續**的數字，而不是三選一 ——
 * 好處是 owner 可以把它調到「剛剛好」，⛔ 不必在三個別人挑好的名字裡選。
 */
export const zConfigFeelFxDoc = z
  .object({
    id: zId,
    schema: z.literal("config.feel-fx@1"),
    note: z.string().optional(),
    /** 殭屍死了掉一枚小金幣、停一下、彎著飛回擊殺者身上的那一段。 */
    goldPickup: z
      .object({
        /**
         * 總開關。false = 完全不畫金幣、不播吸取音效，玩家拿到的錢**一毛不差**
         * （賞金在 sim 裡早就發完了）。這是止血閥：畫面太吵或手機掉幀時一鍵回到
         * 這個功能存在之前。
         */
        enabled: z.boolean(),
        /**
         * 金幣落在屍體上之後，**停在原地閃多久**才開始飛（秒）。owner 指定 1 秒。
         * 調小 = 錢一掉就被吸走，節奏更快但看不清楚掉了幾枚；調大 = 戰場上會同時
         * 躺著更多枚金幣，畫面更「肉鴿」但也更亂。
         */
        hoverSeconds: z.number().min(0).max(5),
        /**
         * 從起飛到被吸進英雄身上要**飛多久**（秒）。這一格決定「吸力」有多強：
         * 短 = 啪一下就進口袋（爽但幾乎看不到軌跡），長 = 看得清楚它繞過來，
         * 但太長會讓死亡與獎勵之間斷開。
         */
        flightSeconds: z.number().min(0.05).max(3),
        /**
         * **加速的力道**。1 = 等速直線（owner 明說⛔ 不要的那個）；越大越像被磁鐵
         * 吸走 —— 起步慢慢飄、末段暴衝進身體。這一格就是 owner 說的「貝茲曲線加速」
         * 裡的**加速**那一半（彎度是下面那一格）。
         */
        easePower: z.number().min(1).max(6),
        /**
         * 貝茲曲線的**控制點抬多高**（世界單位）。0 = 退化成直線（⛔ owner 不要的
         * 那個）；越大金幣拋得越高、弧越誇張。太大會讓金幣飛出畫面上緣再掉回來。
         */
        arcHeight: z.number().min(0).max(8),
        /**
         * 同時最多讓幾枚金幣在**飛**。超過的直接算成已吸取（錢本來就已經到手了），
         * 只是不畫那一段軌跡。這一格是畫面預算，⛔ 不是掉落上限。
         */
        maxConcurrent: z.number().int().min(1).max(256),
        /**
         * 兩發吸取音效之間至少隔幾毫秒。一次 AoE 掃掉一整排殭屍時，這一格決定
         * 你聽到的是「叮」還是一團糊掉的噪音。⛔ 被擋掉的那幾發是**不播**，
         * 不是排隊等一下再播（排隊只會把噪音延後）。
         */
        sfxThrottleMs: z.number().int().min(0).max(2000),
        /**
         * 吸取音效的音量倍率（乘在 `audio-map` 那一格自己的 gain 上）。owner 要的是
         * 「**輕**」音效 —— 一場幾十隻殭屍，這一格開太大就會蓋掉技能與打擊聲。
         */
        sfxVolume: z.number().min(0).max(2),
      })
      .strict(),
    /** 連段音階：連擊越長，吸金幣的「叮」越高，⭐ 到頂就不再升（⛔ 不刺耳）。 */
    comboPitch: z
      .object({
        /**
         * 總開關。false = 每一枚金幣都用**同一個**音高（連擊照樣算、HUD 照樣顯示，
         * 只是聽不出高低）。
         */
        enabled: z.boolean(),
        /**
         * 連擊每前進一段，音高升幾個**半音**。1 = 半音階（candy crush 的那種爬升），
         * 2 = 全音階（更明顯但爬得更快就到頂）。0 = 等於關掉。
         */
        semitonesPerStep: z.number().min(0).max(4),
        /**
         * 最多升到第幾段就**停住**。這一格是「不刺耳」的保證：12 段 × 1 半音 = 剛好
         * 一個八度。越大越尖，⛔ 到某個點之後聽起來就只是壞掉。
         */
        maxSteps: z.number().int().min(0).max(24),
        /**
         * 多久沒有再擊殺就把音階**歸零**（秒）。⚠️ 這是**聲音**的記憶，與 sim 的連擊
         * 視窗（`sim/combat/killCombo.ts` 的 5 秒）是兩件事：畫面上的連殺數字可以還
         * 亮著，而音階已經回到起點 —— 反過來也行。出貨值刻意設成一樣，所以耳朵與
         * 眼睛預設是同步的。
         */
        resetAfterSeconds: z.number().min(0.5).max(30),
      })
      .strict(),
    /**
     * 施法光柱那一圈**往上飄的粒子**（`vfx/castPillar.ts` 的 `moteSpec`）。
     *
     * owner 2026-08-21：「特效存活時間真的太長了，請你砍半，不需要後半段飄到天空」。
     * ⚠️ 只砍壽命是不夠的 —— 那會變成「飄到一半**突然消失**」。所以上升本身也要在
     * 壽命結束**之前**收斂（`gravityY` 小一點、`drag` 大一點），粒子才會自然停住。
     */
    castMotes: z
      .object({
        /** 這一圈粒子最短活幾秒。與下面那格一起決定「餘燼在畫面上留多久」。 */
        lifetimeMinSec: z.number().min(0.05).max(3),
        /** 最長活幾秒。調大 = 回到 GH#494 之前那種「一路飄到天上」的畫面。 */
        lifetimeMaxSec: z.number().min(0.05).max(3),
        /**
         * 往**上**的重力（全 repo 唯一一處重力是反的）。它就是「飄到天空」那個
         * 動作本身：越大爬得越高越久，0 = 粒子原地擴散不上升。
         */
        gravityY: z.number().min(0).max(20),
        /**
         * 空氣阻力（每秒保留幾成速度）。越小煞得越快 —— 這是讓上升在**還看得見的
         * 時候**就停下來的那一格，⛔ 不是靠壽命把它切掉。1 = 完全不減速。
         */
        drag: z.number().min(0.1).max(1),
      })
      .strict(),
  })
  .strict();
/** 爽度特效（`content/config/feel-fx.json`，GH#494）。 */
export type ConfigFeelFxDoc = z.infer<typeof zConfigFeelFxDoc>;

/**
 * 出貨預設 —— `content/config/feel-fx.json` 讀不到（舊部署 / 內容掛掉 / 被存壞的
 * override）時，`readFeelFx` 回退到的就是這一份。
 *
 * ⚠️ 每一格都要和 `content/config/feel-fx.json` 一字不差 ——
 * `apps/client/src/vfx/feelFx.test.ts` 的 drift 斷言在守。
 *
 * ⭐ 為什麼保險絲是**開著**的（`enabled: true`）：這一層碰不到任何一塊錢，
 * 它只決定「看不看得到」。讀不到內容就靜音掉 owner 明說要的爽度，是把一個
 * 內容故障翻譯成一個設計倒退（`arenaFire` 那格是相反的方向，因為 owner 明說
 * 要「全部場地都去掉」—— 保險絲要站在 owner 說過的那一邊）。
 */
export const DEFAULT_FEEL_FX: ConfigFeelFxDoc = {
  id: "feel-fx",
  schema: "config.feel-fx@1",
  goldPickup: {
    enabled: true,
    hoverSeconds: 1,
    flightSeconds: 0.42,
    easePower: 3,
    arcHeight: 1.9,
    maxConcurrent: 32,
    sfxThrottleMs: 55,
    sfxVolume: 0.32,
  },
  comboPitch: {
    enabled: true,
    semitonesPerStep: 1,
    maxSteps: 12,
    resetAfterSeconds: 5,
  },
  castMotes: {
    lifetimeMinSec: 0.175,
    lifetimeMaxSec: 0.35,
    gravityY: 3,
    drag: 0.7,
  },
};
