import { z } from "zod";

/**
 * Roguelite mob waves (task #215 肉鴿小怪波 — 聖杯黑泥醬-喪標麥可 voxel-zombies).
 * From `fromRound` onward, mobs stream in from the EDGES of each active duel
 * zone: a wave every `waveIntervalSec`, the wave at combat-second (2k-1)
 * spawning min(k, `mobsPerWaveCap`) mobs, capped at `maxAlivePerZone` alive per
 * battlefield. Each mob walks to the nearest enemy champion and melee-attacks;
 * on death it pays the killer `reward.gold` + `reward.xp`, and every
 * `reward.killsPerLevel`th mob kill grants that champion +1 LEVEL (the intended
 * climb past the round-grant L50 ceiling toward LV99). Optional + additive: an
 * absent block means the mechanic is simply OFF (same legacy-compat convention
 * as `flowers` / `reviveCircles` / `guardianTower`), which is what every unit
 * test and the client's prediction shadow world see. Seconds in the doc, ticks
 * in the sim (converted once by `mobRulesFromConfig`).
 */
/**
 * 由誰擔任的來源 (#289, owner 2026-07-29 「除了指定英雄,也要有隨機選項。特殊殭屍
 * 與殭屍王預設是隨機」; follow-up ruling: 隨機 = 「從策展白名單抽」).
 *
 * ⚠️ A PARALLEL ENUM, NOT `championId: "__random__"`. A sentinel string passes
 * `z.string().min(1)` unchanged, and the sim would then look it up, find nothing
 * and silently fall back to the default model + the default stats — a zombie
 * that says 「隨機」 in the console and is a plain 喪標麥可 in the match. Three
 * legal values means an unsupported one is a 422 an operator can see.
 *
 * ⚠️ THREE VALUES ONLY — no `"wave"`, no `"mob"`. A hero-derived zombie's hp and
 * attack damage are baked from ONE champion at arm time and stored per-KIND on
 * `MobRules`, so a per-wave/per-entity face would render a champion whose
 * numbers belong to somebody else. See `MobChampionSource` in sim/mobs.ts for
 * the full reasoning and what it would take to lift the restriction.
 *
 * THE ENUMERATION IS THE BOUND. There is no min/max to state for a string knob:
 * anything outside these three is rejected by zod here and by
 * `validateField`'s `enum` branch in the console, so both ends agree.
 */
export const zMobChampionSource = z.enum(["inherit", "fixed", "random"]);

/**
 * 英雄卡讀在幾級的來源 (#290, owner 2026-07-29 「特殊殭屍也可以設 heroLevel,但
 * 預設是跟當時場上英雄最高等級相同(一樣是個選項)」).
 *
 *   · `"round"`        — 沿用該回合一般殭屍的等級(會隨回合成長)。
 *   · `"fixed"`        — 用同一個 block 的 `heroLevel` 那個數字(王 = 99)。
 *   · `"matchHighest"` — **該小怪所在 zone 的全部英雄裡最高的等級,死活都算**,
 *     在**生成那一刻**解析。⚠️ 不要順手加回存活過濾:owner 2026-07-29 明文裁決
 *     「死活都計算在內」,理由是這樣就消掉「全隊倒地→殭屍反而變弱」那個倒過來的
 *     難度曲線。fallback 到 `armedLevel` 現在只有一條路走得到:那個 zone 真的
 *     一個英雄都沒有。
 *
 * ⚠️ ABSENT ≠ `"round"`. 缺席代表 pre-#290 那條鏈 `heroLevel ?? 該回合等級`,所以
 * 一份沒有這個欄位的舊 arena 逐位元不變 —— 特別是 `heroLevel: 99` 的王不會被一個
 * 「比較整齊」的預設值悄悄降到第 3 級(血量直接砍掉一半以上)。
 *
 * ⚠️ 為什麼不是 `heroLevel: 0` 這種 sentinel:`heroLevel` 是 `int().min(1).max(99)`,
 * 塞 sentinel 就得把下界開到 0,而 0 在其他每一格都只代表「填錯了」。三個具名值讓
 * 沒實作的模式是一個 422,不是一個安靜的預設值。
 *
 * THE ENUMERATION IS THE BOUND —— 和 `zMobChampionSource` 同一條規矩:字串旋鈕沒有
 * min/max 可講,清單本身就是界線,後台的 `validateField` 讀同一份清單。
 */
/**
 * ⚠️ `"curve"`（owner 2026-08-04）要配同一個區塊的 `levelCurve` 一起填。
 * 選了 `"curve"` 卻沒填曲線 = 退回該回合等級（不是 1）—— 空欄位是「還沒填」,
 * 不是「零級」，同 `"fixed"` 的既有慣例。
 */
export const zMobHeroLevelSource = z.enum(["curve", "round", "fixed", "matchHighest"]);

/**
 * 等級曲線 —— `等級 = 回合² × perRoundSq + 回合 × perRound + flat`。
 *
 * owner 2026-08-04：普通 `回合*2+1`、特殊 `回合*3+5`、王 `回合*回合+10`。
 * 兩條線性一條二次，所以是二次多項式而不是三個寫死的公式（第一守則）。
 *
 * ⚠️ **每一格兩端都有界**（#277）。`perRoundSq` 上界 5 —— 5×13² 早就超過等級
 * 上限 99，再高只是讓一個打錯的數字看起來合法。結果一律夾在 [1, 99]，
 * 見 `sim/mobs.ts` 的 `mobLevelFromCurve`。
 */
export const zMobLevelCurve = z
  .object({
    /** 回合² 的係數。0 = 線性（普通與特殊都是 0）。 */
    perRoundSq: z.number().min(0).max(5),
    /** 回合 的係數。 */
    perRound: z.number().min(0).max(50),
    /** 常數項。 */
    flat: z.number().min(0).max(99),
  })
  .strict();

/**
 * 殭屍上限的上界 (owner 2026-07-30 裁定「上限值 500」).
 *
 * ⚠️ 這是**上界**,不是預設值。出貨值仍然是 `maxAlivePerZone: 15`(逐回合表最高
 * 爬到 50);500 是「後台這一格最多讓操作者填到多少」。
 *
 * ── 為什麼上界非有不可 ───────────────────────────────────────────────────────
 * 這兩個欄位在 GH#206 補上界的那一輪被漏掉了:整個 `mobWaves` 區塊只有這兩格
 * 是 `min(1)` 而沒有 `max`,所以 50 打成 5000 會**完全合法**地存下去,一路寫進
 * 耐久覆蓋層。沒有人會在後台看到任何一個字,缺陷要到那一場比賽的伺服器開始
 * 掉幀才會被發現。
 *
 * ── 為什麼是 500,而不是「隨便一個很大的數」 ─────────────────────────────────
 * 一場比賽是**單執行緒**的:主機 24 核對「一場裡有幾隻殭屍」完全沒有幫助,加核
 * 只增加同時開幾場。`maxAlivePerZone` 是**每個 zone**、一場四個 zone,所以 500
 * 是場上 2,000 個實體的意思 —— 已經遠在單場 tick 預算之外。上界的作用是把
 * 「一個手滑的 0」擋在存檔之前,不是描述效能甜蜜點(甜蜜點是出貨的 15~50)。
 *
 * ── 為什麼是常數而不是欄位 ─────────────────────────────────────────────────
 * 和 `BASE_BONUS_MAX` 同一條規矩(sim/baseBonus.ts):**被守的那一格才是欄位**,
 * 上界本身是守衛。把守衛也做成可調的,等於沒有守衛。
 */
export const MOB_ALIVE_CAP_MAX = 500;

/**
 * 每波數量上限的上界。和 `MOB_ALIVE_CAP_MAX` 同一個數字、同一個理由 —— 一波生
 * 出來的量最終還是被場上上限收住,所以兩格用同一條天花板,操作者不用記兩個數。
 */
export const MOB_PER_WAVE_CAP_MAX = 500;

export const zMobWavesConfig = z
  .object({
    /** 1-based round from which waves begin (matches ultUnlockRound:3 precedent) */
    fromRound: z.number().int().min(1),
    /** combat-second of wave k=1 (→ firstWaveTicks = round(sec/dt)) */
    firstWaveSec: z.number().positive(),
    /** combat-seconds between waves (wave k lands at second 2k-1 when =2) */
    waveIntervalSec: z.number().positive(),
    /** hard cap on mobs spawned per wave: count = min(k, mobsPerWaveCap) */
    mobsPerWaveCap: z.number().int().min(1).max(MOB_PER_WAVE_CAP_MAX),
    /** hard cap on mobs ALIVE per battlefield/duel zone at once */
    maxAlivePerZone: z.number().int().min(1).max(MOB_ALIVE_CAP_MAX),
    /**
     * 「一隊全滅之後，這個 zone 還要不要繼續生殭屍」——
     * owner 2026-08-02「敵方英雄全死光 或我方英雄全死光 殭屍就不應該再生成」。
     *
     * ⚠️ 這一格與下面那一格是**同一個迴圈的兩個切點**，而那個迴圈是玩家體感
     * 「一定要等火圈」的根因：一隊全滅 → 主機想記勝負 → 場上有殭屍 → 不記 →
     * 沒進 `settledZones` → 繼續生殭屍 → 場上永遠有殭屍。
     *
     * ABSENT ⇒ `true`。缺席退回**開啟**而不是關閉，因為 owner 的話是「不應該
     * 再生成」—— 一份沒有這格的舊 config 應該得到他現在要的行為，不是舊行為。
     */
    stopSpawnOnTeamWipe: z.boolean().optional(),
    /**
     * 「哪幾種怪會壓住回合不結束」。
     *
     * ⚠️ 這是一個**改過的決策**，不是一個常數：2026-07-30 owner 說「場上還有任何
     * 殭屍時，只剩一隊也不結束」；2026-08-02 實打後收窄成「場上沒有殭屍王 → 回合
     * 應該要馬上勝利結算」。所以它是一個欄位，下次再改是一個下拉選單。
     *
     *   none            誰都壓不住 —— 一隊全滅就結束
     *   boss            只有殭屍王（出貨值 = owner 2026-08-02 的原話）
     *   bossAndSpecial  王 + 特殊殭屍
     *   any             任何殭屍（2026-07-30 的舊行為）
     *
     * ABSENT ⇒ `"boss"`。`timerExpired`（階段硬底線）永遠贏過這一格，所以再怎麼
     * 設定都不會出現「回合永遠不結束」。
     */
    roundHoldMobKinds: z.enum(["none", "boss", "bossAndSpecial", "any"]).optional(),
    /**
     * 精英小怪（特殊殭屍 + 殭屍王）頭上那條**小血條** (GH#268)。
     *
     * ⚠️ 這是 `mobWaves` **本身**的一塊，不是 `boss` 的：血條要不要出現、多大、
     * 多高，是「精英怪長什麼樣」的決定，特殊殭屍與王共用同一份。王另外還有一條
     * **長血條**（`boss.healthBar*`，畫在畫面頂端／技能列上方），兩者是不同的
     * 東西 —— 長血條回答「這一場有沒有王」，這一條回答「我正在打的這一隻還剩多少」。
     *
     * 一般殭屍**不吃這一塊**：波峰時一區 50 隻，50 條血條就是把畫面糊掉。判準是
     * 伺服器投影寫進快照的 `ENTITY_FLAG.MOB_ELITE`（`isEliteMob`），不是體型、
     * 不是 modelKey、不是血量 —— 那三個都是設定值，操作者一改就會讓「誰有血條」
     * 悄悄跟著變。
     *
     * ⚠️ 它走的是 `MatchState.mobVisualJson`（`sim/mobs.ts` 的 `MobVisualTable`），
     * 和染黑強度／腳下圈圈同一條既有頻道 —— 不新開 `defineTypes` 欄位（那是
     * append-only、加錯回不去的一格）。客戶端的讀取器
     * `ui/hud/mobHealthBarModel.mobHealthBarConfigFrom` 是**逐欄位**降級的，所以
     * 一台跑在舊 shard 前面的客戶端拿到的是出貨值，不是一張歸零的表。
     *
     * ABSENT ⇒ 整塊退回出貨值（顯示、34 × 5、0.35u、全程顯示）。缺席不代表關掉：
     * 一份沒有這塊的舊 arena 文件應該長得跟出貨一樣，而不是把血條靜默刪掉
     * （失敗形態 ③：功能被刪掉而且全綠）。
     */
    healthBar: z
      .object({
        /**
         * 到底畫不畫。false = 畫面上**一個節點都不建**（不是畫成透明），所以它
         * 也是「血條把畫面弄亂了」的止血閥。
         */
        showHealthBar: z.boolean(),
        /**
         * 血條寬度（CSS px）。冠軍那條是 64，精英刻意小一號 —— 波峰時畫面上同時
         * 有 12 個玩家，一條和玩家一樣寬的血條會被誤讀成「那裡有個人」。
         * 上界 200 是防呆：打成 5000 會蓋掉半個畫面（#277 同型）。
         */
        barWidth: z.number().min(8).max(200),
        /** 血條厚度（CSS px）。太薄在手機上看不到，太厚會把小怪的頭蓋掉。 */
        barHeight: z.number().min(1).max(40),
        /**
         * 血條浮在**頭頂**上方多高 —— 給的是**世界高度**，不是像素偏移。
         *
         * ⚠️ 這一格的單位是刻意的：特殊殭屍體型倍率 2、王 5，一個固定的 px 偏移
         * 會讓王的血條埋進牠胸口（失敗形態 ①：算出來但畫在看不到的地方）。
         * 實際高度 = 1.8 × 體型倍率 + 這一格。負值（下界 −2）是「畫在頭裡面」，
         * 是真的有人會想要的（極矮的模型）。
         */
        yOffset: z.number().min(-2).max(6),
        /**
         * 血量**低於**這個比例才亮血條。1（出貨）= 只要是精英就全程顯示。
         *
         * ⚠️ 這是**唯一**可以讓血條在死亡前消失的欄位。其他任何提早消失都是缺陷
         * —— GH#268 的兩次回報都是把血條的存續綁到了比身體短命的東西上（一顆
         * 單槽事件）。0.5 = 「半血以下才給線索」，是一種玩法，不是預設。
         */
        showThreshold: z.number().min(0).max(1),
      })
      .strict()
      .optional(),
    /**
     * LATE-MATCH SCHEDULE (owner, 2026-07-27) — a per-round OVERRIDE of the two
     * caps above, for the escalation into the finale:
     *
     *   rounds 3-5 →   5 / 15   (the authored caps — the ramp-in)
     *   round  6   →  10 / 20
     *   round  7   →  15 / 30
     *   round  8   →  20 / 40
     *   round  9   →  25 / 50
     *   round 10   →   0 /  0   (乾淨總決賽 — no zombies at all)
     *
     * An explicit TABLE rather than a multiplier, because the owner's curve is
     * not a curve: it doubles, then doubles again, then goes to ZERO. Any
     * formula that produces 0 at round 10 also produces nonsense on the way
     * there, and the grand final's emptiness is a design statement — the last
     * round is champions only, with nothing to farm and nowhere to hide.
     *
     * Applied where the LEVEL already is (`mobRulesFromConfig(cfg, dt, round)`),
     * so it needs no new channel for the round to reach the sim and nothing
     * per-tick learns what a round is.
     *
     * Rounds not listed keep the authored caps. Absent block ⇒ no schedule,
     * which is what every legacy doc, unit test and the client's prediction
     * shadow world see.
     *
     * min(0), unlike the base caps' min(1): 0 is the whole point of round 10.
     */
    schedule: z
      .array(
        z
          .object({
            /** 1-based round this row applies to */
            round: z.number().int().min(1),
            /** cap on mobs spawned per wave in that round (0 = none) */
            mobsPerWaveCap: z.number().int().min(0).max(MOB_PER_WAVE_CAP_MAX),
            /** cap on mobs ALIVE per zone in that round (0 = none) */
            maxAlivePerZone: z.number().int().min(0).max(MOB_ALIVE_CAP_MAX),
            /**
             * PER-ROUND MOB FACE (owner 2026-07-27, 後台殭屍波系統頁).
             *
             * 「甚至設定每回合殭屍指定哪個英雄來擔任」 — the champion doc this
             * round's mobs wear the face of, overriding `mob.championId` for
             * this round only. Absent (the normal case) ⇒ inherit
             * `mob.championId`, which is itself optional and falls back to
             * MOB_CHAMPION_ID — so every legacy doc keeps its exact behaviour
             * and nothing about the shipped schedule changes.
             *
             * CONSUMED SINCE GH#191. `mobRulesFromConfig` resolves the round's
             * champion through `mobChampionForRound`, which reads THIS field
             * first — travelling the same `round` argument the per-round caps
             * already use, so no new channel into the sim was needed. Because
             * the mob's MODEL is now resolved FROM that champion (GH#192), a
             * value here changes both the face and the mesh that spawns.
             */
            championId: z.string().min(1).optional(),
          })
          .strict(),
      )
      .optional(),
    /** the mob unit's combat stats */
    mob: z
      .object({
        /** mob hit points (no regen) */
        maxHp: z.number().positive(),
        /** melee packet amount */
        attackDamage: z.number().min(0),
        /** #215 — the mob's OWN walk speed (u/s). Without it a mob inherits
         *  MovementSystem's BASE_MOVE_SPEED, which is a GENERAL fallback and
         *  not a mob knob. */
        moveSpeed: z.number().min(0).optional(),
        /** melee reach (GGD units; stored/compared squared in the sim) */
        attackRange: z.number().positive(),
        /** melee cooldown in seconds */
        attackCdSec: z.number().positive(),
        /** collision/body radius (drives the edge inset = boundaryRadius - radius) */
        radius: z.number().positive(),
        /**
         * OPTIONAL MODEL OVERRIDE (GH#192). Absent — the normal case now — means
         * 「用英雄的模型」: the mesh is resolved from `championId`'s champion doc
         * (`mobChampionModelKey` in sim/mobs.ts), so 「選什麼英雄就會讀取什麼 3d
         * modal」 without an operator having to keep two fields in agreement.
         * Authored = that doc id wins, for an arena that deliberately wants a
         * mesh no champion wears.
         */
        modelKey: z.string().min(1).optional(),
        /**
         * 體型倍率 (GH#192) — the mob's on-screen size as a MULTIPLE of what its
         * model doc already declares. 1 = exactly the champion's own size.
         *
         * A multiplier and not an absolute height, because it has to compose
         * with #150's height-normalization: the champion's mesh is already
         * normalized to TARGET_HEIGHT × doc.scale, and this scales THAT. It is
         * pure presentation — the mob's collision `radius` above is the sim's
         * body and is deliberately NOT driven from here (a 10× visual with a 10×
         * hitbox would also need the nav grid and the zone inset to agree).
         */
        sizeMult: z.number().positive().optional(),
        /**
         * 染黑強度 (GH#192, owner: 「只會會是染黑色的模型避免跟玩家混在一起」).
         * 0 = the champion's own colours, 1 = a solid black silhouette. Applied
         * to EVERY mob kind (一般 / 特殊 / 王) through the #49/#254 tint pipeline,
         * so one knob decides how far a zombie reads as 「不是玩家」.
         *
         * 0.65 is the shipped default: dark enough that a 喪標麥可 zombie cannot
         * be mistaken for the 喪標麥可 a player picked, light enough that the
         * silhouette still says WHICH champion it is wearing.
         */
        tintStrength: z.number().min(0).max(1).optional(),
        /**
         * 腳下圈圈的基準直徑 (#247, owner 2026-08-01: 「殭屍王底下圈圈會比較大，
         * 但不影響無碰撞」) — GGD units, at 體型倍率 1.
         *
         * ⚠️ PURELY VISUAL, AND THAT IS THE REQUIREMENT, NOT A SIDE NOTE. The
         * sim's body is `radius` (this block) / `boss.radius`, and NOTHING reads
         * this number on the server: it travels in `MatchState.mobVisualJson`
         * next to `tintStrength` and is consumed only by the renderer's team
         * ring. So there is no path by which widening the ring could widen what
         * the king collides with — see `mobGroundRingDiameter` in sim/mobs.ts
         * and its guard in sim/mobRingIndependence.test.ts.
         *
         * Lives on `mob` and not on `boss` for the same reason `tintStrength`
         * does: it applies to all three kinds, and the wire table is match-wide.
         *
         * 1.25 = the champion team ring's diameter, so a 體型倍率-1 zombie wears
         * exactly the ring a player does. 上界 8: a ring wider than 8u under one
         * body already covers a sixth of a 48u-wide zone — 24 (the arena's
         * boundary radius, the neighbouring number an operator might paste)
         * would carpet the whole floor. 0 = 不畫圈, a real choice.
         */
        groundRingDiameter: z.number().min(0).max(8).optional(),
        /**
         * 圈圈跟著體型倍率放大的程度. 1 (shipped) = 完全跟著 —— a 10× king wears a
         * 10× ring, which is owner's 「圈圈會比較大」. 0 = 每一種殭屍的圈圈一樣大.
         *
         * A SEPARATE knob from the diameter because they are separate decisions:
         * 「圈圈本身多大」 and 「王的圈圈要不要跟著王一起變大」. 上界 2 catches the
         * mis-paste of `boss.sizeMult` (10) into this box, which would put a
         * 100×-wide ring under the king; 下界 0 is the 「都一樣大」 end.
         */
        groundRingSizeFollow: z.number().min(0).max(2).optional(),
        /**
         * #217 — the CHAMPION DOC the mob wears the FACE of. Since #244 this is
         * PRESENTATION + a LEGACY FALLBACK only: when the four `baseHp`/
         * `hpPerLevel`/`baseRegen`/`regenPerLevel` numbers below are authored,
         * they win and the hero sheet is never read for stats. Absent =
         * `MOB_CHAMPION_ID` (godie-zombiex).
         */
        championId: z.string().min(1).optional(),
        /**
         * #289 — 指定 or 隨機 for the NORMAL zombie. Ships `"fixed"`: the owner
         * asked for 隨機 to be the DEFAULT on the king and the special only, and
         * the rank-and-file zombie stays 喪標麥可.
         *
         * ⚠️ THE PER-ROUND `schedule[].championId` COLUMN STILL WINS. 「第 5 回合
         * 由皮卡丘擔任」 is a statement about one round; 隨機 is a whole-match
         * default, so the draw slots in where `mob.championId` is and not above
         * the row (see `mobChampionForRound`).
         */
        championSource: zMobChampionSource.optional(),
        /** #217 — mob level in round `fromRound` (owner: 第3場 = lv3) */
        baseLevel: z.number().int().min(1).optional(),
        /** #217 — levels gained per round past `fromRound` (owner: 每場 +1) */
        levelPerRound: z.number().int().min(0).optional(),
        /**
         * owner 2026-08-04「普通殭屍等級: 回合數*2+1」。**有它就以它為準**,
         * `baseLevel`/`levelPerRound` 一併不看（`sim/mobs.mobLevelForRound`）。
         * 省略 = 2026-08-04 之前的線性式，逐位元不變。
         */
        levelCurve: zMobLevelCurve.optional(),
        /**
         * #244 — THE MOB'S OWN HP CURVE, split out of the hero sheet.
         *
         * Before #244 the mob's hp was `championDoc.baseStats.maxHealth +
         * growth.maxHealth*(level-1)`, so editing 喪標麥可 THE HERO silently
         * re-tuned the roguelite difficulty — it happened on 2026-07-26 when a
         * growth change moved round-3 zombies from 200 to 300 hp. These four
         * numbers are the mob's own source; the champion doc is now only a
         * fallback for arenas authored before #244.
         *
         * Law is identical to the hero one so the shipped curve survives
         * byte-for-byte: `round(baseHp + hpPerLevel*(level-1))`.
         */
        baseHp: z.number().positive().optional(),
        /** #244 — hp gained per mob level past 1 (paired with `baseHp`) */
        hpPerLevel: z.number().min(0).optional(),
        /** #244 — hp regenerated per second at level 1 */
        baseRegen: z.number().min(0).optional(),
        /** #244 — hp/sec gained per mob level past 1 (paired with `baseRegen`) */
        regenPerLevel: z.number().min(0).optional(),
      })
      .strict(),
    /** per-kill rewards */
    reward: z
      .object({
        /** flat gold to the killer per mob kill */
        gold: z.number().int().min(0),
        /** XP to the killer per mob kill */
        xp: z.number().int().min(0),
        /** every Nth mob kill grants the killer +1 level */
        killsPerLevel: z.number().int().min(1),
      })
      .strict(),
    /**
     * 殭屍王 (task #262, owner 2026-07-28: 「殭屍王 有機會上線嗎 包括單個英雄擊敗
     * 100 隻殭屍招喚跟後台設定?」).
     *
     * A BATTLEFIELD QUEST hung on `world.mobKills`, which is already PER
     * CHAMPION and already MATCH-CUMULATIVE (#215 owner decision): when ONE
     * champion's personal tally reaches `killThreshold`, a boss is summoned into
     * THAT champion's duel zone. Two champions on 50 kills each summon nothing —
     * the counter that fires is one person's, never the team's sum.
     *
     * ABSENT = the whole sub-mechanic is off, exactly like an absent `mobWaves`
     * turns the waves off. That is what keeps every pre-#262 arena, every unit
     * test and the client's prediction shadow byte-identical.
     */
    boss: z
      .object({
        /** master switch; false keeps the block authored but inert */
        enabled: z.boolean(),
        /**
         * ONE champion's cumulative zombie kills that summon the king (owner:
         * 100). Compared against `world.mobKills.get(champion)`, so it spans
         * rounds — that is the 「跨回合累積」 in the task title.
         */
        killThreshold: z.number().int().min(1),
        /**
         * true  = every Nth kill summons another king (100, 200, 300 …)
         * false = ONCE per champion per match, on exactly the Nth kill.
         * Owner ruling pending (see the task's openQuestions); the shipped
         * default is `true` because `mobKills` never resets inside a match and a
         * once-only king would leave rounds 7-10 with nothing to chase.
         */
        repeatable: z.boolean(),
        /**
         * The king's hit points as a FLAT number. Used only when `hpMult` below
         * is absent — an arena authored before GH#192 keeps its exact king.
         */
        maxHp: z.number().positive(),
        /**
         * ×N THE NORMAL MOB'S HP FOR THAT ROUND (GH#192, owner: 「HP是100倍」).
         *
         * Wins over the flat `maxHp` when present, and it is the shipped setting,
         * because a flat king stops being a wall the moment the zombie curve is
         * retuned: at round 3 the mob has 60 hp, so ×100 is 6,000 — the same king
         * the flat number authored — and by round 9 (180 hp) it is 18,000 instead
         * of the same 6,000 a champion 16 levels stronger would delete.
         */
        hpMult: z.number().positive().optional(),
        /**
         * 由誰擔任 (GH#192). The champion doc the KING wears the face and the
         * MODEL of. Absent = whatever the normal mob of that round is wearing,
         * so an operator who only changes 「這回合由誰擔任」 gets a matching king
         * for free.
         */
        championId: z.string().min(1).optional(),
        /**
         * #289 — 指定 or 隨機 for the KING. SHIPS `"random"` (owner 2026-07-29
         * 「特殊殭屍與殭屍王預設是隨機」), drawn from the curated whitelist once
         * per round. The draw feeds `heroHpMult`/`heroDamageMult` as well as the
         * mesh, so a randomised king is a DIFFERENT FIGHT each round and not a
         * re-skin. Absent / `"inherit"` = the pre-#289 chain (`championId`, else
         * the round's mob champion).
         */
        championSource: zMobChampionSource.optional(),
        /**
         * 體型倍率 (GH#192, owner: 「modal 大小是10倍」). Same units and same
         * composition rule as `mob.sizeMult`; 10 is the shipped default, and it
         * is a KNOB rather than a constant precisely because 10 is enormous
         * (see the openQuestions on GH#192).
         */
        sizeMult: z.number().positive().optional(),
        /** melee packet amount */
        attackDamage: z.number().min(0),
        /** walk speed in GGD units/second */
        moveSpeed: z.number().min(0),
        /** melee reach (stored/compared squared in the sim) */
        attackRange: z.number().positive(),
        /** melee cooldown in seconds */
        attackCdSec: z.number().positive(),
        /**
         * ⭐【殭屍王算不算英雄單位】—— owner 2026-08-13：
         *   「只能吃掉英雄，**特殊殭屍跟殭屍王可以被考慮是英雄單位**」
         *   「**這兩個是獨立欄位，都要有**」
         *
         * 它決定 `condition{kind, is:"champion"}` 讀不讀得到殭屍王 ——
         * 89-002 輪盤的「只吃英雄」、以及未來每一條寫「對英雄才生效」的技能。
         *
         * ⚠️ 這是一個**決策點**不是數值（第一守則）：owner 上一句才說「只能吃掉
         * 英雄」，下一句又把精英怪算進去 —— 那正是「他會改」的形狀。
         * ABSENT ⇒ `true`（第〇·六守則：優先權大的更新**預設啟動**，開關是為了回頭）。
         */
        countsAsChampion: z.boolean().optional(),
        /** collision/body radius — also what makes the king LOOK like a king */
        radius: z.number().positive(),
        /** model doc id (resolved client-side); absent = the normal mob's */
        modelKey: z.string().min(1).optional(),
        /**
         * The prize pool in gold, split among every champion that damaged the
         * king in proportion to that damage. NOT a per-hero amount.
         *
         * ⚠️ NOT NECESSARILY THE AMOUNT PAID. Under the shipped
         * `lastHitMode: "bonus"` (owner 2026-07-29, GH#206) the last hitter
         * receives an EXTRA copy of their own share, so the total lands in
         * `[bountyGold, bountyGold × lastHitMultiplier]`. Only `"weight"` pays
         * exactly this number. See `splitBossBounty` in sim/mobBoss.ts.
         */
        bountyGold: z.number().int().min(0),
        /** the same, in XP */
        bountyXp: z.number().int().min(0),
        /**
         * 等級提升 (owner 2026-07-29: 「殭屍王 獎勵 金錢+30,000 等級提升+50」).
         * WHOLE LEVELS, split by damage share exactly like `bountyGold` — not
         * XP, so it skips the curve entirely.
         *
         * ⚠️ The REQUEST, not the guarantee: `LEVEL_CAP` is 99 and a champion
         * who farmed 100 zombies to summon the king is already past L50, so the
         * grant is routinely smaller. Anything shown to a player must read what
         * `grantLevels` returned, never this number.
         */
        bountyLevels: z.number().int().min(0).max(99),
        /**
         * 最後一刀翻倍 (owner). 2 = 翻倍. What it multiplies depends on
         * `lastHitMode`.
         */
        lastHitMultiplier: z.number().min(1).max(10),
        /**
         * How 「最後一刀翻倍」 is paid — the owner reversed this on 2026-07-29
         * and asked for both to stay available (GH#206):
         *   · `"bonus"`  (default) 「超過總額沒關係」 — split by raw damage, then
         *                pay the last hitter one extra copy of their own share.
         *                One champion doing all the damage AND landing the blow
         *                takes 200%, which is the owner's own worked example.
         *   · `"weight"` — the pre-#206 rule: the doubling is folded into the
         *                proportions, so the total is exactly `bountyGold` and
         *                a low-damage kill-stealer cannot mint gold.
         */
        lastHitMode: z.enum(["bonus", "weight"]).optional(),
        /**
         * 溢傷算不算 — owner 2026-07-29 ruled **不算** (GH#206).
         *
         * `false` (shipped): the ledger records the hp the king ACTUALLY lost,
         * so a 4,000-damage ult on a king with 100 hp left weighs 100. `true`:
         * the raw post-mitigation number, overkill and all — which under
         * `lastHitMode: "bonus"` inflates the whole payout, not just one share.
         */
        countOverkill: z.boolean().optional(),
        /**
         * #291 —— 分紅結算面板的**抬頭**。SHIPS 「殭屍王 分紅結算」。
         *
         * owner 2026-08-03:「特殊殭屍 不應該用殭屍王 分紅結算畫面」。
         * 王與特殊殭屍走的是同一顆 `mobBossSlain` 事件（見 sim/systems/MobSystem
         * 的 #288 說明），差別只有 payload 上的 `kind`。所以「畫面上要寫什麼」
         * 必須是**兩格分開的字**，否則兩種怪只能共用一句話 —— 那正是 owner 抱怨
         * 的東西。寫死在 `ui/hud/mobBossModel.ts` 的 `BOSS_SETTLEMENT_TITLE`
         * 是它以前的樣子。
         */
        settlementTitle: z.string().min(1).max(24).optional(),

        /* ── 從英雄推導的數值 (owner 2026-07-29, GH#206) ──────────────────
         *
         * 「生命與能力屬性倍數為**該設定英雄的** N 倍」。ABSENT ⇒ the pre-#206
         * path (`hpMult` × the round's zombie, flat `maxHp`/`attackDamage`)
         * stays byte-identical, which a lot of arena tests depend on.
         *
         * ⚠️ OWNER SAID ONE NUMBER; THIS IS TWO, AND THAT IS THE 折衷 THEY
         * APPROVED. The spec's single 「生命與能力屬性倍數 20×」 lands the king
         * at AD 4,400 against a round-3 player's ~2,000 hp — one swing kills
         * twice over. HP and damage fail differently: a huge HP pool just makes
         * the king a wall (fun), a huge AD makes it a one-shot (not). Splitting
         * them is the only way to keep 「20 倍的王」 without the one-shot.
         */
        /** ×`championStatBase(MaxHealth)` of `championId` at `heroLevel` */
        heroHpMult: z.number().positive().max(1000).optional(),
        /**
         * ×`championStatBase(AttackDamage)`. Deliberately SMALLER than
         * `heroHpMult` — see the note above. Shipped 4 (king) / 2 (special)
         * against 20 / 5 for hp.
         */
        heroDamageMult: z.number().positive().max(1000).optional(),
        /**
         * 基礎生命額外 — a FLAT add AFTER the multiply, mirroring the
         * `baseBonus` semantics owner ruled on 2026-07-28 (加成不參與倍率).
         */
        hpFlatBonus: z.number().min(0).max(10_000_000).optional(),
        /** ×the NORMAL zombie's walk speed. 0.2 = 「移動速度 -80%」 */
        moveSpeedMult: z.number().min(0).max(10).optional(),
        /**
         * 殭屍王的等級 (owner 2026-07-29:「殭屍王的等級是滿級99」).
         *
         * ⚠️ THIS IS NOT COSMETIC. At the round-3 level the hero-derived HP is
         * 553 and the flat +100,000 is 90% of the total, so WHICH CHAMPION THE
         * KING WEARS BARELY MATTERS. At 99 it is 8,847 → the hero contributes
         * 64%. The 隨機選英雄 feature only means something because of this.
         */
        heroLevel: z.number().int().min(1).max(99).optional(),
        /**
         * #290 — 上面那格「幾級」怎麼決定. SHIPS `"fixed"`, i.e. 「就用 99」 said
         * out loud: the owner pinned the king at 滿級 99 and that ruling has not
         * changed. `"matchHighest"` is available on the king too (every knob on
         * this page is 後台可調) and would make the king track the lobby's best
         * hero instead — a very different, much softer, boss.
         *
         * ABSENT ⇒ the pre-#290 chain `heroLevel ?? 該回合等級`, so a doc without
         * this field is byte-identical. See {@link zMobHeroLevelSource}.
         */
        heroLevelSource: zMobHeroLevelSource.optional(),
        /** 配 `heroLevelSource: "curve"` —— owner 2026-08-04 的 per-kind 等級公式。 */
        levelCurve: zMobLevelCurve.optional(),

        /* ── #247 owner 2026-08-01 實戰回饋 ────────────────────────────────
         *
         * 「殭屍王 應該要可以無視碰撞穿透地形 不然被卡住永遠走不到」
         * 「每回合最多只會出現一次殭屍王，不會無限出場」
         *
         * BOTH are DECISIONS, so both are fields with the owner's answer as the
         * default. The no-clip half deliberately borrows 翔封界's vocabulary
         * (`FlightGrant` in sim/flight.ts) instead of inventing a second one:
         * the king is granted the SAME state a flying champion carries, so the
         * three MovementSystem exemptions have exactly one implementation.
         */
        /**
         * 無視碰撞 — master switch. SHIPS **true** (owner's answer).
         *
         * ⚠️ WHAT IT DOES NOT DO: it is not invulnerability and not stealth.
         * `world.grid` (the broad phase every targeting/AoE query reads) is
         * untouched, so a no-clip king is still hittable — that distinction is
         * the whole reason sim/flight.ts exists and is quoted there.
         */
        noClip: z.boolean().optional(),
        /**
         * 穿過其他單位 (其他殭屍、英雄、花、守衛塔). ABSENT = true.
         *
         * A SEPARATE decision from `noClipObstacles` for the reason
         * `FlightGrant` gives: walking through BODIES is a positioning change,
         * walking through PILLARS is a map-geometry change. In the king's case
         * this one is the load-bearing half — a round-9 zone holds up to 50
         * zombies, and the soft-separation pass is what pins a 1.8-radius body
         * inside its own escort.
         */
        noClipUnits: z.boolean().optional(),
        /** 穿過牆與柱子 (`zone.obstacles`). ABSENT = true. */
        noClipObstacles: z.boolean().optional(),
        /**
         * 仍然被場地邊界夾住. ABSENT = **true**, and the polarity is deliberately
         * the opposite of the two above — 「無視碰撞」 must not become 「走出競技
         * 場」. A king outside the boundary breaks every zone-scoped mechanic
         * (duel resolution, `teamAliveInZone`, the minimap) and the fire ring
         * would burn it from outside the world.
         */
        noClipStayInside: z.boolean().optional(),
        /**
         * 每回合最多召喚幾隻殭屍王 (owner 2026-08-01: 「每回合最多只會出現一次」).
         * SHIPS **1**.
         *
         * ⚠️ THIS IS A SECOND, INDEPENDENT GATE — it does NOT replace
         * `repeatable`. `repeatable` answers 「同一個英雄的第 200 隻要不要再召喚」
         * over the WHOLE MATCH; this answers 「這一回合已經來過幾隻了」. With
         * `repeatable: true` and six champions in a zone, the old code could
         * summon six kings inside one round — that is the 「無限出場」 owner saw.
         *
         * Counted per ROUND because `beginCombatMobs` is the round boundary the
         * host already calls; there is no timer and no decrementing counter
         * (sim/purity.test.ts).
         *
         * 上界 20:「一回合 20 隻王」 already means the cap does nothing, so
         * anything larger is a mis-paste — specifically the 100 from
         * `killThreshold`, the box directly above it on the 後台 page.
         * 下界 1: 0 would be 「永遠不召喚」 said in the wrong field; that is what
         * `enabled: false` is for, and a silent 0 would look like a broken king.
         */
        maxPerRound: z.number().int().min(1).max(20).optional(),
        /**
         * 那個上限是算「每個戰場」還是「整場比賽」. SHIPS `"zone"`.
         *
         * The ambiguity is real and it is owner's sentence, so it is a field
         * rather than a guess in a comment. `"zone"` is the default because a
         * king spawns in the SUMMONER's own duel zone: under `"match"`, one
         * champion in zone 0 crossing 100 kills would permanently deny every
         * other zone its king that round, which reads as a bug rather than a cap.
         */
        maxPerRoundScope: z.enum(["zone", "match"]).optional(),

        /* ── #247 owner 2026-08-01 實戰回饋(第二批)────────────────────────
         *
         * 「殭屍王出現英雄/bot都會優先打殭屍王 (因為獎勵很高)」
         * 「殭屍王 要像其他遊戲 BOSS 一樣亮長血條」
         *
         * 前者是**索敵排序**,後者是**畫面**,而兩件都是決策點,所以四個欄位。
         */

        /**
         * 殭屍王在自動索敵比較器上的**排名**(sim/targeting.ts 的 KEY 1)。
         *
         * ⚠️ 這是一個「數字」而不是「開關」,而且它落在的是一個**既有的軸**:
         * `TARGET_CLASS` 已經是 敵方英雄 0 → 召喚物 1 → 小怪 2 的字典序排名
         * (sim/summonRules.ts),`beats()` 比的就是 `a.kind < b.kind`。所以
         * 「王排第幾」最誠實的表達就是「王在這個軸上占哪個數字」——
         * 不是另外發明一套加權分數,那會把 嘲弄/威脅/低血/最近 四把鑰匙的語意
         * 一起改掉,而這次改動不該碰它們。
         *
         *   · **< 0**(出貨 −1)—— 王排在**敵方英雄之前**。owner 的字面讀法:
         *     「英雄/bot都會優先打殭屍王」。
         *   · 0 —— 跟敵方英雄同級,由 威脅/低血/最近 決勝。
         *   · 0 < x < 1 —— 敵方英雄之後、召喚物之前。這格就是「**稍微優先**」:
         *     被敵方英雄追殺時不會轉頭去打王,但王仍然贏過所有雜魚與召喚物。
         *   · 1 < x < 2 —— 召喚物之後、一般殭屍之前。
         *   · 2 —— 跟一般殭屍同級 = **等於關掉這個功能**(這正是上界的意義)。
         *
         * 下界 −1:任何負值效果都一樣(都在英雄之前),−1 是「剛好高一階」那個
         * 值,所以 −10 這種打錯的數字在這裡就被擋下來而不是靜默地等於 −1。
         * 上界 2:比 2 更大代表「排在一般殭屍後面」,而 `TARGET_CLASS` 沒有比
         * 小怪更低的階,所以 3 跟 2 完全同義 —— 也就是說 >2 一定是打錯。
         *
         * ABSENT ⇒ 2,也就是**今天的行為**(王就是一隻小怪)。這一格是平衡,
         * 所以照「缺席 = 今天的行為」的家規走 —— 跟下面三格刻意不同,理由見那裡。
         */
        aggroRank: z.number().min(-1).max(2).optional(),
        /**
         * 要不要亮長血條 (owner 2026-08-01)。SHIPS **true**。
         *
         * ⚠️ 這一格(以及下面兩格)**故意不照「缺席 = 今天的行為」**,跟
         * `aggroRank` 相反,理由與 sim/summonRules.ts 的
         * `DEFAULT_SUMMON_AUTO_TARGETABLE` 同一條:那條家規是為了「不要不小心
         * 改到行為」,而這裡**行為改變本身就是交付物**。而且它是純畫面 ——
         * 一張沒被作者填過的舊 arena 文件拿到血條,不會讓任何一場的數值不同。
         */
        healthBar: z.boolean().optional(),
        /**
         * 長血條畫在畫面上哪裡。SHIPS `"top"`。
         *
         *   · `"top"`    —— 相位計時器下方的中央走廊頂端(WoW/FF14 的團隊首領條)
         *   · `"bottom"` —— 技能列正上方(魂系遊戲的首領條)
         *
         * 兩種都是真的慣例,所以它是欄位而不是註解裡的辯護。兩邊都會讓
         * 降臨橫幅與連殺計數器讓位(#107 安全區契約),見
         * ui/hud/bossHealthBar.ts。
         */
        healthBarAnchor: z.enum(["top", "bottom"]).optional(),
        /**
         * 什麼時候亮出來。SHIPS `"summon"`。
         *
         *   · `"summon"`  —— 召喚的那一刻就亮(owner 的字面讀法:王一出現就亮)
         *   · `"sighted"` —— 要等到王真的**進入你正在看的那個戰場**才亮。
         *     差別是真的:#269 之後鏡頭是玩家自己按鈕切的,所以「我這一區的王」
         *     跟「我正在看的那一區」是兩個不同的集合。
         */
        healthBarReveal: z.enum(["summon", "sighted"]).optional(),
      })
      .strict()
      .optional(),
    /**
     * 特殊殭屍 (owner 2026-07-28: 「殭屍群裡面會有一隻特殊殭屍」).
     *
     * Every spawned mob rolls once against `chancePercent`; a winner is a
     * SPECIAL zombie — its own model, its own size, its own stats and its own
     * reward multiplier. The roll is `world.rng`, so the same seed reproduces
     * the same zombies (see sim/mobs.ts `rollMobKind`).
     *
     * ABSENT (or chancePercent 0) = no special zombies, and NO rng draw at all,
     * so a pre-#262 arena leaves the shared random stream untouched.
     */
    special: z
      .object({
        /** probability per spawned mob, in PERCENT (0 = off, 100 = always) */
        chancePercent: z.number().min(0).max(100),
        /** maxHp multiplier against the normal mob of the same round */
        hpMult: z.number().positive(),
        /** melee damage multiplier */
        damageMult: z.number().min(0),
        /** walk-speed multiplier */
        moveSpeedMult: z.number().min(0),
        /** body-radius multiplier — the SIM's body (melee reach scales with it) */
        radiusMult: z.number().positive(),
        /**
         * ⭐【特殊殭屍算不算英雄單位】—— owner 2026-08-13：
         *   「只能吃掉英雄，**特殊殭屍跟殭屍王可以被考慮是英雄單位**」
         *   「**這兩個是獨立欄位，都要有**」
         *
         * 它決定 `condition{kind, is:"champion"}` 讀不讀得到一隻特殊殭屍 ——
         * 89-002 輪盤的「只吃英雄」、以及未來每一條寫「對英雄才生效」的技能。
         *
         * ⚠️ 這是一個**決策點**不是數值（第一守則）：owner 上一句才說「只能吃掉
         * 英雄」，下一句又把精英怪算進去 —— 那正是「他會改」的形狀。
         * ABSENT ⇒ `true`（第〇·六守則：優先權大的更新**預設啟動**，開關是為了回頭）。
         */
        countsAsChampion: z.boolean().optional(),
        /** GH#206 — same three as the boss; see the notes on `boss.heroHpMult` */
        heroHpMult: z.number().positive().max(1000).optional(),
        heroDamageMult: z.number().positive().max(1000).optional(),
        hpFlatBonus: z.number().min(0).max(10_000_000).optional(),
        /**
         * 特殊殭屍的等級。只有在 `heroLevelSource: "fixed"` 時才會被讀到。
         * ABSENT + 沒有 `heroLevelSource` = 沿用該回合一般殭屍的等級。
         */
        heroLevel: z.number().int().min(1).max(99).optional(),
        /**
         * #290 — 特殊殭屍的「幾級」來源. SHIPS `"matchHighest"` (owner
         * 2026-07-29 「預設是跟當時場上英雄最高等級相同」).
         *
         * ⚠️ 這一格是全 `mobWaves` 唯一一個在**生成那一刻**才解析的欄位。其他每一
         * 格都在 `mobRulesFromConfig`(arm time)烘成常數;「當時場上最高等級」不是
         * 常數,英雄在同一回合裡會升級,所以它必須在 `spawnMob` 那裡算。填 `"round"`
         * 就退回 #290 之前那條會隨回合成長的曲線。
         */
        heroLevelSource: zMobHeroLevelSource.optional(),
        /** 配 `heroLevelSource: "curve"` —— owner 2026-08-04 的 per-kind 等級公式。 */
        levelCurve: zMobLevelCurve.optional(),
        /**
         * 體型倍率 (GH#192) — the RENDERED size, aligned in meaning with the
         * king's. Distinct from `radiusMult` (the collision body) on purpose:
         * before GH#192 the visible size came from the `champ.mob.zombie-special`
         * doc's `scale` and the hitbox from `radiusMult`, two numbers in two
         * files that nothing kept in agreement.
         */
        sizeMult: z.number().positive().optional(),
        /**
         * gold AND xp multiplier on the kill reward, paid to the LAST HITTER.
         *
         * ⚠️ INERT once a 分紅獎池 is authored below (#288): the pool replaces
         * this reward rather than stacking with it, so a special with
         * `bountyGold` pays 5,000-split and NOT an extra `rewardGold × 3` to
         * whoever landed the blow. Still the only thing that pays a special in
         * an arena that authors no pool.
         */
        rewardMult: z.number().min(0),
        /** model doc id (resolved client-side); absent = the normal mob's */
        modelKey: z.string().min(1).optional(),
        /** 由誰擔任 (GH#192); absent = the normal mob's champion for that round */
        championId: z.string().min(1).optional(),
        /**
         * #289 — 指定 or 隨機 for the 特殊殭屍. SHIPS `"random"` (owner
         * 2026-07-29 「特殊殭屍與殭屍王預設是隨機」). Same wiring as the king's:
         * the drawn champion is what `heroHpMult`/`heroDamageMult` read, so its
         * ~12,000 hp really is THAT hero's sheet ×5 and not the zombie's.
         */
        championSource: zMobChampionSource.optional(),

        /* ── 分紅獎池 (#288, owner 2026-07-29) ────────────────────────────────
         *
         * 「特殊殭屍也照傷害比例分,獎勵是金錢 +5,000 · 等級提升 +5」. Same six
         * knobs as the king's, meaning the same six things and divided by the
         * same `splitBossBounty` — plus `splitByDamage`, which the king does not
         * need (see below).
         *
         * ALL THREE POOL NUMBERS ABSENT ⇒ NO POOL AT ALL: the special keeps NO
         * damage ledger and pays the pre-#288 `rewardMult` to the last hitter,
         * byte for byte. Authoring any one of them opts the block in.
         */
        /** the pool in gold, split by damage share (owner: 5,000) */
        bountyGold: z.number().int().min(0).max(10_000_000).optional(),
        /** the same, in XP */
        bountyXp: z.number().int().min(0).max(10_000_000).optional(),
        /**
         * 等級提升 — WHOLE levels, split by damage exactly like gold (owner: 5).
         * ⚠️ A REQUEST, not a guarantee: `LEVEL_CAP` is 99 and the settlement
         * panel shows what `grantLevels` actually handed out.
         */
        bountyLevels: z.number().int().min(0).max(99).optional(),
        /**
         * 最後一刀倍率. ABSENT ⇒ **1**, i.e. a pure proportion with no 翻倍 —
         * the owner's 翻倍 ruling was about the KING, and the instruction here
         * was only 「照傷害比例分」. Deliberately different from the king's
         * shipped 2.
         */
        lastHitMultiplier: z.number().min(1).max(10).optional(),
        /** ABSENT ⇒ `"bonus"`, matching the king. Inert while the倍率 is 1. */
        lastHitMode: z.enum(["bonus", "weight"]).optional(),
        /**
         * ABSENT ⇒ **true** (the owner's instruction). `false` restores the
         * pre-#288 behaviour: the WHOLE pool goes to whoever landed the killing
         * blow, nobody else gets a share.
         */
        splitByDamage: z.boolean().optional(),
        /**
         * 溢傷算不算 — ABSENT ⇒ false, the same ruling the king ships with
         * (owner 2026-07-29 「不算」). Its OWN field rather than a read of
         * `boss.countOverkill`, so an arena with no king still controls this.
         */
        countOverkill: z.boolean().optional(),
        /**
         * #291 —— 特殊殭屍分紅結算面板的**抬頭**。SHIPS 「特殊殭屍 分紅結算」。
         *
         * owner 2026-08-03:「特殊殭屍 不應該用殭屍王 分紅結算畫面」。它自己的字，
         * 而不是共用 `boss.settlementTitle` —— 共用就是 owner 抱怨的那個畫面。
         */
        settlementTitle: z.string().min(1).max(24).optional(),
        /**
         * #291 **決策點** —— 特殊殭屍的分紅結算**用哪一種呈現**。SHIPS `"panel"`。
         *
         *   · `"panel"` —— 和殭屍王同一面完整表格（自己的抬頭）。owner 的原話是
         *     「不應該用殭屍王的畫面」＝要自己的字，所以出貨給它自己的面板。
         *   · `"toast"` —— 一行字帶過（抬頭 + 總額 + 你自己那份），不吃整個走廊。
         *   · `"off"`   —— 完全不畫。
         *
         * 逃生門是有實際來由的：一隻特殊殭屍現在有一萬多血、一回合會死好幾隻，而
         * owner 抱怨過「怎麼會收到好幾次分紅結算」。面板一次佔中央走廊 8.2 秒，
         * 所以「太吵」必須是後台一個下拉，不是一次改程式。
         */
        settlementMode: z.enum(["panel", "toast", "off"]).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type MobWavesConfig = z.infer<typeof zMobWavesConfig>;
export type MobBossConfig = NonNullable<MobWavesConfig["boss"]>;
export type MobSpecialConfig = NonNullable<MobWavesConfig["special"]>;

/** Contract defaults for the mobWaves block (dev cheats / fallbacks). */
export const DEFAULT_MOB_WAVES_CONFIG: MobWavesConfig = {
  fromRound: 3,
  firstWaveSec: 1,
  waveIntervalSec: 2,
  mobsPerWaveCap: 5,
  maxAlivePerZone: 15,
  // owner 2026-08-02 的兩個回合結束旋鈕（見上面 Zod 的說明）。
  stopSpawnOnTeamWipe: true,
  roundHoldMobKinds: "boss",
  // GH#268 精英小怪頭上的小血條。34 × 5 是「比冠軍那條（64 × 6）小一號」，
  // 0.35u ≈ 頭頂上一個拳頭，1.0 = 全程顯示（owner 要的那個）。
  // ⚠️ 這四個數字同時住在 `apps/client/src/ui/hud/mobHealthBarModel.ts` 的
  // `SHIPPED_MOB_HEALTH_BAR`（客戶端在拿不到表時的降級值）與
  // `apps/admin/src/mobWaves.ts` 的 `SHIPPED_MOB_WAVES`。三處漂開 = 後台顯示的
  // 和實戰跑的不是同一個數字。
  healthBar: {
    showHealthBar: true,
    barWidth: 34,
    barHeight: 5,
    yOffset: 0.35,
    showThreshold: 1,
  },
  // owner, 2026-07-27 (second pass — the ramp now starts at round 6 and climbs
  // by +5 alive a round instead of doubling). Round 10 is EMPTY: 乾淨總決賽.
  //
  // Render cost was checked rather than assumed. The peak is round 9: 50 alive
  // × 2 zones = 100 mobs, against the 60 that docs/legacy/改進延遲.md computed for the
  // old guardian_skeleton (5,288 tris ⇒ 317,280 skinned tris/frame). On today's
  // blocky-undead at 168 tris those 100 mobs are 16,800 tris — a nineteenth of
  // the load that motivated that document. Server-side AI for 100 mobs is the
  // cost worth watching, not the renderer.
  schedule: [
    { round: 6, mobsPerWaveCap: 10, maxAlivePerZone: 20 },
    { round: 7, mobsPerWaveCap: 15, maxAlivePerZone: 30 },
    { round: 8, mobsPerWaveCap: 20, maxAlivePerZone: 40 },
    { round: 9, mobsPerWaveCap: 25, maxAlivePerZone: 50 },
    { round: 10, mobsPerWaveCap: 0, maxAlivePerZone: 0 },
  ],
  mob: {
    // Flat LAST-RESORT fallback (#217): only reached when neither the #244 mob
    // curve below nor a registered champion doc is available.
    maxHp: 24,
    attackDamage: 1.2,
    moveSpeed: 3,
    attackRange: 1.8,
    attackCdSec: 1.0,
    radius: 0.6,
    championId: "godie-zombiex",
    // #289 — the RANK-AND-FILE zombie stays 喪標麥可 by name. 隨機 is available
    // on this row too (the owner asked for it on all three kinds) but is NOT the
    // default here: 「特殊殭屍與殭屍王預設是隨機」 named exactly two of the three.
    championSource: "fixed" as const,
    // NO `modelKey` (GH#192): blank is what makes 「選什麼英雄就會讀取什麼 3d
    // modal」 the LIVE path. Authoring one here would ship the feature inert —
    // the override would win on every arena and the champion branch would never
    // run in a real match.
    // 0.68 PRESERVES AN OWNER PLAYTEST RULING, it is not a fresh guess. #217
    // shipped `modelKey: "champ.mob.zombie"` — the same blocky-undead mesh at
    // doc scale 0.68 — because on 2026-07-26 the owner played the hero-sized
    // version and said 「肉鴿殭屍…縮小到適合尺寸…不然現在根本玩不了」. Resolving the
    // mesh from the champion (GH#192) would have handed that back at 1.0, so the
    // ruling moves onto this knob instead of being lost with the doc: a zombie
    // still renders at 0.68 × TARGET_HEIGHT = 1.224u against a 1.8u hero.
    sizeMult: 0.68,
    tintStrength: 0.65,
    // #247 owner 2026-08-01 「殭屍王底下圈圈會比較大」. 1.25 is the champion team
    // ring's own diameter, and `groundRingSizeFollow: 1` makes the ring track
    // 體型倍率 — so the shipped king (sizeMult 10) stands on a 12.5u ring while a
    // 0.68 zombie keeps a 0.85u one. Purely visual: see the schema note.
    groundRingDiameter: 1.25,
    groundRingSizeFollow: 1,
    baseLevel: 3,
    levelPerRound: 1,
    // owner 2026-08-04「普通殭屍等級: 回合數*2+1」。
    levelCurve: { perRoundSq: 0, perRound: 2, flat: 1 },
    // #244 — the mob's OWN curve (owner 2026-07-26): 100 + 100*(level-1), so the
    // round-3 floor of level 3 is 300 hp, round 4 → 400, round 5 → 500,
    // round 6 → 600. Regen 1 + 0.2*(level-1). These used to live on the
    // 喪標麥可 hero sheet; they are the mob's numbers now and the hero's
    // stats can never move them again.
    baseHp: 20,
    hpPerLevel: 20,
    baseRegen: 0,
    regenPerLevel: 0,
  },
  reward: {
    gold: 20,
    xp: 40,
    // owner, 2026-07-27: 「打殭屍 變成每打死6支升1級」 (was 30).
    // Deliberate 5x acceleration of the roguelite climb, and it composes with
    // the v0.7.1 nerfs rather than compounding them: a zombie now has 20 base HP,
    // 1.2 attack and half the move speed, so six of them is a short errand
    // rather than the grind thirty of them used to be. The reward that used to
    // arrive once a round now arrives several times, which is the point —
    // 「肉鴿」 is supposed to feel like a climb, not like homework.
    killsPerLevel: 6,
  },
  // 殭屍王 (#262). 100 personal kills, and — because `killsPerLevel` is 6 — a
  // champion who summons one is already ~16 levels up from zombies alone, so the
  // king is authored as a genuine wall rather than a big zombie: 6,000 hp against
  // the round-9 zombie's 200, and a 12 attack against its 1.2.
  //
  // BOUNTY, owner 2026-07-28 (#187): 「殭屍王 總獎金也要後台能設定 預設是
  // 30,000」. It was 3,000 — deliberately「roughly HALF the ~7,600g deterministic
  // match income」so the king was a prize and not a second economy. 30,000 is a
  // knowing REVERSAL of that framing: the king is now worth ~4x a whole match's
  // baseline income, i.e. summoning one IS the economy for whoever kills it.
  // That is the owner's call, not an inference — the number is his, and the 後台
  // 小怪波 page can retune it live (`boss.bountyGold`).
  //
  // ⚠️ THIS DEFAULT IS WRITTEN THREE TIMES. `apps/admin/src/mobWaves.ts` mirrors
  // it (so the console can render a default before the GET resolves) and
  // `content/config/arena-rules.json` is the doc the sim actually loads;
  // apps/admin/src/mobWaves.test.ts pins all three together. Changing one alone
  // makes the console show a default the server does not use.
  boss: {
    enabled: true,
    killThreshold: 100,
    repeatable: true,
    maxHp: 6000,
    attackDamage: 12,
    moveSpeed: 2.4,
    attackRange: 2.6,
    attackCdSec: 1.4,
    // 0.9 against the zombie's 0.6 — owner 2026-08-02 halved BOTH the king's
    // 體型 and its 判定 (「殭屍王體型可以減半」→「可以也減判定」), so the model and
    // the hitbox stay the same size. It is still 1.5× a zombie, which keeps the
    // silhouette cue that says 「這不是雜魚」 before any model loads. WAS 1.8.
    radius: 0.9,
    // ⭐ owner 2026-08-13「殭屍王可以被考慮是英雄單位」—— 預設啟動。
    countsAsChampion: true,
    // ⚠️ MERGE SEAM (v0.9.12): two lanes each landed ONE owner instruction here
    // and the conflict looked like a choice. It is not — BOTH must survive, and
    // dropping either one is invisible to every test in the repo:
    //   · 經濟組  #187 「總獎金…預設是 30,000」  → bountyGold
    //   · 殭屍身分組 #192 「屬性跟 modal 大小是10倍、HP是100倍」 → hpMult/sizeMult,
    //     and NO `modelKey` (the king now wears the round's champion like every
    //     other zombie, so a hard-coded model doc would silently override it)
    // Taking either side wholesale ships a king that is either the wrong size or
    // the wrong price, and both suites stay green. This is the same shape as the
    // v0.9.11 attributes.ts seam — written down so the next merge does not have
    // to rediscover it.
    //
    // ×100 of the round-3 mob (60 hp) is 6,000 — byte-identical to the flat
    // `maxHp` above, so the shipped king at the round it FIRST appears is
    // unchanged and only the later rounds scale.
    hpMult: 100,
    // #289 owner 2026-07-29 「特殊殭屍與殭屍王預設是隨機」 + 「從策展白名單抽」.
    //
    // ⚠️ NO `championId` BESIDE IT, ON PURPOSE. `championSource` decides WHICH
    // branch runs; `championId` is only the 「指定」 branch's argument. Authoring
    // both would look like a contradiction on the console (「隨機」 next to a
    // named hero) even though the code has a clear precedence — and the moment
    // an operator flips this box back to 指定 they should be choosing the hero
    // deliberately, not inheriting one somebody left behind.
    //
    // THE KING'S NUMBERS FOLLOW THE DRAW: `heroHpMult: 20` reads the DRAWN
    // champion's MaxHealth, so round 4's king is a genuinely different wall from
    // round 3's — which is the point of the feature and the thing
    // mobs.randomChampion.test.ts pins.
    championSource: "random" as const,
    // 體型倍率. GH#206 shipped 30; the owner walked it back to **10** on
    // 2026-07-29 after a playtest — 30 × the zombie's 0.68 × the 1.8u normalised
    // body is 36.72u tall in a duel zone whose RADIUS is 24u, i.e. the king was
    // taller than the arena is wide and it ate the whole camera. 10 keeps it at
    // 12.24u: still a landmark, still legible, no longer a wall of texture.
    //
    // ⚠️ THIS MIRROR IS NOT THE SOURCE. `content/config/arena-rules.json` is,
    // and `mobs.heroDerived.test.ts` + `apps/admin/src/mobWaves.test.ts` both
    // pin the three copies against each other — editing one alone is a red suite,
    // which is exactly what stopped this value drifting for a whole version.
    // owner 2026-08-02 「殭屍王體型可以減半」—— WAS 10。與上面的 radius 一起減半,
    // 兩個必須同動:只縮模型會讓玩家打到看不見的空氣,只縮判定會讓大模型穿不進去。
    sizeMult: 5,
    // ── 從英雄推導 (GH#206, owner 2026-07-29) ───────────────────────────────
    // 「生命與能力屬性 = 該設定英雄的 20 倍, 基礎生命額外 +100,000, 移速 −80%,
    //   等級是滿級 99」. Against the shipped 喪標麥可 sheet that resolves to:
    //     hp  = round(8,847.2 × 20) + 100,000 = 276,944
    //     ad  = 408.4 × 4                     = 1,633.6
    //     ms  = 3 × 0.2                       = 0.6   (×the ZOMBIE, not the hero)
    // `hpMult`/`maxHp`/`attackDamage`/`moveSpeed` above are now UNREACHABLE for
    // this doc — deliberately kept, because they are the fallback the moment an
    // operator clears `heroHpMult` in the console, and because a champion that
    // fails to resolve degrades onto them rather than onto zero.
    heroHpMult: 20,
    // ⚠️ 2, NOT 20 — the owner-approved 折衷, walked down from GH#206's 4 on
    // 2026-07-29. HP and damage fail differently: a huge pool makes the king a
    // wall (fun), a huge attack makes it a one-shot (not). At 99 the 喪標麥可
    // sheet gives 408.4 ad, so ×2 = 816.8 instead of 1,633.6. See the schema
    // note on `boss.heroDamageMult`.
    heroDamageMult: 2,
    hpFlatBonus: 100000,
    moveSpeedMult: 0.2,
    heroLevel: 99,
    // #290 — 「就用上面那個 99」 said out loud. The owner's 滿級 99 ruling is
    // unchanged; naming the mode is what makes 「跟場上最高」 a visible ALTERNATIVE
    // in the console rather than an invisible one.
    // owner 2026-08-04「殭屍王等級: 回合數*回合數+10」。`heroLevel: 99` 保留但不再被讀。
    heroLevelSource: "curve" as const,
    levelCurve: { perRoundSq: 1, perRound: 0, flat: 10 },
    bountyGold: 30000,
    // XP stays at 1,200. GH#206 added 等級提升 as its OWN currency rather than
    // inflating this — the owner asked for 「等級提升+50」, and levels and XP are
    // different things (one skips the curve, the other rides it).
    bountyXp: 1200,
    // GH#206 owner 2026-07-29 「殭屍王 獎勵 金錢+30,000 等級提升+50」.
    bountyLevels: 50,
    lastHitMultiplier: 2,
    // GH#206 — see the schema note above. `"bonus"` is the owner's ruling and
    // deliberately lets the payout exceed `bountyGold` (200% at the extreme).
    lastHitMode: "bonus" as const,
    // owner 2026-07-29:「溢傷算不算?=> 不算」
    countOverkill: false,
    // #291 —— 這一串字以前寫死在 `ui/hud/mobBossModel.BOSS_SETTLEMENT_TITLE`。
    // 一字不差搬過來,所以出貨行為不變,而它現在是後台一格。
    settlementTitle: "殭屍王 分紅結算",
    // #247 owner 2026-08-01 —— 「應該要可以無視碰撞穿透地形 不然被卡住永遠走不到」.
    // All three permissions ON, the boundary clamp STILL ON. The king is granted
    // the same `FlightGrant` a flying champion carries (sim/flight.ts), so
    // 「無視碰撞」 has exactly one implementation in the repo.
    noClip: true,
    noClipUnits: true,
    noClipObstacles: true,
    noClipStayInside: true,
    // #247 owner 2026-08-01 —— 「每回合最多只會出現一次殭屍王，不會無限出場」.
    // Per DUEL ZONE, because a king spawns in the summoner's own zone and a
    // match-wide 1 would let one champion deny the other three zones their king.
    maxPerRound: 1,
    maxPerRoundScope: "zone" as const,
    // #247 owner 2026-08-01 —— 「殭屍王出現英雄/bot都會優先打殭屍王 (因為獎勵很高)」.
    // −1 是 owner 的字面讀法:王排在**敵方英雄之前**。想改成「稍微優先」(被敵方
    // 英雄追殺時不轉頭)就把這格填 0.5 —— 那是後台一個數字,不是一次改程式。
    aggroRank: -1,
    // 「殭屍王 要像其他遊戲 BOSS 一樣亮長血條」. 三格都是畫面決策,出貨值就是
    // owner 那句話的字面讀法:亮、在上方、召喚那一刻就亮。
    healthBar: true,
    healthBarAnchor: "top" as const,
    healthBarReveal: "summon" as const,
  },
  // 特殊殭屍 (#262). One in twenty, so a wave of 20 carries about one — 「殭屍群
  // 裡面會有一隻特殊殭屍」 read literally. Double size and double hp make it
  // legible at a glance even before it has its own model; triple reward is what
  // makes hunting it a decision rather than trivia.
  special: {
    // owner 2026-08-02 「特殊殭屍出現頻率太高且血太多 請都減半」——
    // chancePercent 5 → 2.5 (一波 20 隻約半隻), hpMult 2 → 1 (跟普通殭屍同底),
    // hpFlatBonus 4,000 → 2,000 (見下)。三個一起減半才是「都減半」。
    chancePercent: 1.25,
    hpMult: 1,
    damageMult: 1.5,
    // owner 2026-07-29 (GH#206) 「移動速度 −50%」 — WAS 1.25, i.e. the special
    // used to be FASTER than a zombie. This one field is the whole reason 移速
    // is anchored on the normal zombie instead of on the hero: the special picks
    // its face from the round's champion, hero `ms` on this roster spans 2.6..6.1,
    // and a hero-anchored ×0.5 would land anywhere from 1.3 to 3.05 — sometimes
    // faster than the 3.0 zombie it is supposed to be a slowed version of.
    moveSpeedMult: 0.5,
    radiusMult: 1.8,
    // ⭐ owner 2026-08-13「特殊殭屍可以被考慮是英雄單位」—— 預設啟動。
    countsAsChampion: true,
    // GH#192 — the RENDERED size now says the same thing the hitbox does. No
    // `modelKey`: like the king, it wears the round's champion.
    // GH#206 shipped 3; owner walked it to **2** on 2026-07-29 (same playtest
    // that took the king from 30 to 10). 2 × 0.68 × 1.8u ≈ 2.45u — still reads
    // as 「那一隻不一樣」 next to a 1.22u zombie without blocking the fight behind it.
    sizeMult: 2,
    rewardMult: 3,
    // #289 — 隨機, same ruling and same no-`championId` rule as the king's.
    // Drawn on its OWN slot salt, so the special and the king are (usually) two
    // different heroes in the same round rather than twins.
    championSource: "random" as const,
    // ── 從英雄推導 (GH#206, 等級來源改寫於 #290) ─────────────────────────────
    // 「生命與能力屬性 = 該設定英雄的 5 倍, 基礎生命額外 +4,000」.
    heroHpMult: 5,
    heroDamageMult: 2,
    // owner 2026-07-29: 10,000 → 4,000. At round 3 the +10,000 was 78% of a
    // special's 12,764 hp — the hero it wears barely mattered and every special
    // in the match was the same fat wall. Pulling the flat down puts the HERO
    // back in charge of the number, which is the whole point of 隨機英雄 +
    // 「跟場上最高等級」.
    // owner 2026-08-02 「血太多 請都減半」: 4,000 → **2,000**, 與同批的 hpMult
    // 2 → 1 相乘,實際血量剩約四分之一。
    hpFlatBonus: 2000,
    // #290 — owner 2026-07-29 「預設是跟當時場上英雄最高等級相同」. THE ONE FIELD
    // IN THIS DOC THAT IS NOT A CONSTANT: resolved in `spawnMob`, not at arm
    // time, because heroes level up inside a round. `"round"` restores the
    // pre-#290 curve (round 3 → the round-3 sheet, round 9 → the round-9 one).
    // owner 2026-08-04「特殊殭屍等級: 回合數*3+5」。
    heroLevelSource: "curve" as const,
    levelCurve: { perRoundSq: 0, perRound: 3, flat: 5 },
    // ── 分紅獎池 (#288, owner 2026-07-29) ──────────────────────────────────
    // 「特殊殭屍也照傷害比例分,獎勵是金錢 +5,000 · 等級提升 +5」. Both numbers
    // are the owner's, verbatim.
    //
    // ⚠️ THIS REPLACES `rewardMult: 3` FOR THE SPECIAL — it does not stack. The
    // special used to pay 60 gold / 120 xp to the last hitter; it now pays a
    // 5,000-gold + 5-level pool divided among everyone who hurt it. That is a
    // ~83× reward increase, and it is deliberate: since GH#206 a 特殊殭屍 has
    // 12,764 hp at round 3 (a hero-derived mini-boss, not a fat zombie), so
    // killing one is a fight rather than a stray cleave.
    bountyGold: 5000,
    // NOT OWNER-SPECIFIED — he named gold and levels only. 200 is the king's
    // 1,200 scaled by the same 1/6 the gold pool is (5,000 vs 30,000), so the
    // special reads as 「王的六分之一」 on every currency instead of having one
    // number invented for it. A live 後台 knob like everything else here.
    bountyXp: 200,
    bountyLevels: 5,
    // 1 = NO 翻倍, unlike the king's 2. The owner's 「補最後一刀翻倍」 ruling was
    // about the 殭屍王; the instruction for the special is only 「照傷害比例分」,
    // so the shipped answer is a pure proportion.
    lastHitMultiplier: 1,
    // Inert while the multiplier is 1 (both modes agree there — see
    // mobBossBonus.test.ts). Authored anyway so raising the multiplier in the
    // console does not silently pick a mode the operator never saw.
    lastHitMode: "bonus" as const,
    splitByDamage: true,
    // owner 2026-07-29 「溢傷算不算?=> 不算」 — the same ruling as the king's.
    countOverkill: false,
    // #291 owner 2026-08-03「特殊殭屍 不應該用殭屍王 分紅結算畫面」——
    // 它自己的抬頭 + 它自己的面板。`toast` / `off` 是逃生門,不是出貨值。
    settlementTitle: "特殊殭屍 分紅結算",
    settlementMode: "panel" as const,
  },
};

/* ══════════════════════════════════════════════════════════════════════════
 * #291 分紅結算的措辭 —— 「特殊殭屍不應該用殭屍王的畫面」(owner 2026-08-03)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 王與特殊殭屍共用同一顆 `mobBossSlain` 事件（sim/systems/MobSystem 的 #288
 * 決定，理由寫在那裡），差別只有 payload 上的 `kind: "boss" | "special"`。
 * 那個欄位**一直都在送**，只是客戶端從來沒讀 —— MobSystem 自己的註解就承認了
 * 代價：「until the client reads `kind`, a special's settlement renders with the
 * king's wording and takes the king's single panel slot」。
 *
 * 這三格是那句話的另一半：讀到 `kind` 之後，畫面上要講的**字**與**呈現方式**。
 */

/** 特殊殭屍的分紅結算怎麼呈現（見 `zMobWavesConfig.special.settlementMode`）。 */
export type MobSettlementMode = NonNullable<MobSpecialConfig["settlementMode"]>;

/** 出貨抬頭 —— 和 `content/config/arena-rules.json` 一字不差（drift 測試在守）。 */
export const DEFAULT_BOSS_SETTLEMENT_TITLE = "殭屍王 分紅結算";
export const DEFAULT_SPECIAL_SETTLEMENT_TITLE = "特殊殭屍 分紅結算";
export const DEFAULT_SPECIAL_SETTLEMENT_MODE: MobSettlementMode = "panel";

/** 一場比賽裡「分紅結算要怎麼講」的全部答案。 */
export interface MobSettlementWording {
  /** 殭屍王的抬頭 */
  bossTitle: string;
  /** 特殊殭屍的抬頭 */
  specialTitle: string;
  /** 特殊殭屍要不要畫、畫成什麼 */
  specialMode: MobSettlementMode;
}

export const DEFAULT_MOB_SETTLEMENT_WORDING: MobSettlementWording = {
  bossTitle: DEFAULT_BOSS_SETTLEMENT_TITLE,
  specialTitle: DEFAULT_SPECIAL_SETTLEMENT_TITLE,
  specialMode: DEFAULT_SPECIAL_SETTLEMENT_MODE,
};

/**
 * 從一份 `config.arena-rules@1` 讀出這三格，缺一格就退回出貨值。
 *
 * ⚠️ **刻意逐格 typeof，而不是拿 `zConfigArenaRulesDoc` 整份 parse。** 這支函式
 * 跑在客戶端畫面上：整份 parse 的話，arena-rules 裡**任何一個別的 block**
 * （火圈、商店、守護者…）有一格不合，分紅面板的抬頭就會整個退回出貨值，而畫面上
 * 看起來完全正常 —— 一個 block 的問題吃掉另一個 block 的設定。同一份文件的
 * `mobWaves.boss.healthBar*` 是走 sim armed 的路，這一條沒有那條路可以走（結算
 * 面板整段活在客戶端）。
 *
 * 空字串／只有空白的抬頭一律當成「沒填」：一面沒有抬頭的結算面板比一面寫著王的
 * 字的面板更難懂。
 */
export function mobSettlementWordingFromDoc(doc: unknown): MobSettlementWording {
  const dig = (obj: unknown, key: string): unknown =>
    typeof obj === "object" && obj !== null ? (obj as Record<string, unknown>)[key] : undefined;
  const waves = dig(doc, "mobWaves");
  const title = (block: unknown, fallback: string): string => {
    const t = dig(block, "settlementTitle");
    return typeof t === "string" && t.trim() !== "" ? t.trim() : fallback;
  };
  const rawMode = dig(dig(waves, "special"), "settlementMode");
  const specialMode: MobSettlementMode =
    rawMode === "panel" || rawMode === "toast" || rawMode === "off"
      ? rawMode
      : DEFAULT_SPECIAL_SETTLEMENT_MODE;
  return {
    bossTitle: title(dig(waves, "boss"), DEFAULT_BOSS_SETTLEMENT_TITLE),
    specialTitle: title(dig(waves, "special"), DEFAULT_SPECIAL_SETTLEMENT_TITLE),
    specialMode,
  };
}
