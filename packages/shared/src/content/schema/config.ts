/**
 * config@1 — system parameter documents. The canonical doc is `config.match`
 * (tick constants, match timers, economy values, progression, draft schedule).
 * Values mirror the engine defaults in constants.ts / economy/*.ts; the
 * game-server will consume this doc when it switches to the ContentLoader.
 *
 * config.store@1 — the M COIN store document (`config/store.json`): champion
 * unlock prices and per-placement match rewards. Lives in the same `config`
 * collection; the collection schema is a discriminated union on `schema`.
 */
import { z } from "zod";
import { zAlpha, zCoreAbilitySlot, zId, zRef, zTintRgb } from "./common";
import { zAugmentTier } from "./augment";
import {
  COMBAT_ENV_KEYS,
  FACTOR_BAND_MAX,
  FACTOR_BAND_MIN,
  GOLD_FACTOR_MAX,
  GOLD_FACTOR_MIN,
  isBandedFactorEnvKey,
  isGoldEnvKey,
  type CombatEnvKey,
} from "../../sim/combatEnv";
// 基礎加成的 per-stat 區間 (task #277) — 定義在 sim 那一份,schema 只是把它搬上
// Zod,所以「頁面 / schema / sim」三層守的是同一組數字。
import { ALL_STATS, Stat } from "../../sim/stats/statTypes";
import { baseBonusBounds } from "../../sim/baseBonus";
// 屬性上限的 per-stat 區間 —— 同一條規矩:數字定義在 sim,schema 只是搬上 Zod。
import { STAT_CAP_CEILING, statCapBounds } from "../../sim/statCaps";
import {
  COOLDOWN_MIN_SECONDS_MAX,
  COOLDOWN_MIN_SECONDS_MIN,
  COOLDOWN_RULES_DOC_ID,
  DEFAULT_COOLDOWN_RULES,
} from "../../sim/cooldownRules";
// 吟唱規則（owner 2026-08-13 的三句：0.06~4.00、倍率可調、上下限可調）——
// 同一條規矩：數字與語意住在 sim/castTimeRules.ts，schema 只是把它搬上 Zod。
import {
  CAST_CAP_MAX,
  CAST_CAP_MIN,
  CAST_FLOOR_MAX,
  CAST_FLOOR_MIN,
  CAST_MULTIPLIER_MAX,
  CAST_MULTIPLIER_MIN,
  CAST_TIME_RULES_DOC_ID,
  DEFAULT_CAST_TIME_RULES,
} from "../../sim/castTimeRules";
// AoE 四級距（owner 2026-08-11「原則上不寫範圍數字」）—— 同一條規矩：
// 數字與語意定義在 content/aoeTiers.ts，schema 只是把它搬上 Zod。
import {
  AOE_TIER_NAMES,
  AOE_TIER_RADIUS_MAX,
  AOE_TIER_RADIUS_MIN,
  AOE_TIERS_DOC_ID,
  DEFAULT_AOE_TIERS,
} from "../aoeTiers";
// 英雄屬性正規化（owner 2026-08-12）—— 同一條規矩：數字與語意定在
// content/statNormalization.ts，schema 只是把它搬上 Zod。
import {
  PER_LEVEL_BONUS_MAX,
  PER_LEVEL_BONUS_MIN,
} from "../../sim/baseBonus";
import {
  ARCHETYPES,
  BAND_VALUE_MAX,
  BAND_VALUE_MIN,
  DEFAULT_STAT_NORMALIZATION,
  NORMAL_BANDS,
  NORMALIZED_STAT_KEYS,
  ORIGINS,
  STAT_NORMALIZATION_DOC_ID,
} from "../statNormalization";
// 手把自動瞄準的小怪讓路幅度（GH#315）—— 同一條規矩：上下界定在 sim，schema 只搬上 Zod。
import { AIM_ASSIST_MOB_PENALTY_MAX, AIM_ASSIST_MOB_PENALTY_MIN } from "../../sim/combatFeel";
// 位移級距（GH#318）與減傷曲線／穿透（負抗性放大）—— 兩份 config schema 各自
// 住在自己的檔案裡（那一輪 config.ts 由多個 lane 同時碰），這裡只把它們接進 union。
// ⛔ 漏掉任何一行 = 那份 json 進了 content/ 之後整份驗證失敗 → 骨架英雄。
import { zConfigDisplacementTiersDoc } from "./displacementDoc";
import { zConfigMitigationDoc } from "./mitigationDoc";
// The eleven barcode slots, in ANATOMICAL ORDER. Imported (not restated) so the
// stored doc's keys can never drift from the model — see zConfigVoxelBarcodesDoc.
// `voxelSkin/types` is a leaf: zero imports of its own, no zod, no sim.
import { BARCODE_SLOTS } from "../voxelSkin/types";
// 每回合 S~D 評價的係數 (#212/#232)。整份 schema 定在自己的檔案裡(欄位多、
// 上下界全部從 sim 的 ROUND_GRADE_BOUNDS 生),這裡只把它掛進 collection union。
import { zConfigRoundGradeDoc } from "./roundGrade";
// config.victory-podium@1 (GH#257/#256) 的整份 schema、出貨預設與解析器住在自己
// 的檔案裡（欄位的理由很長,而且客戶端的 RoundWinnerStage / ui/panels/victoryPodium
// 直接 import 它）。這裡只做兩件事:把它掛進 collection union（**漏掉這一步就是
// 2026-08-02 那次線上事故的形狀** —— 內容裡有一個 union 不認得的 schema tag,
// 整棵內容驗證失敗、客戶端 fail-open 退回 2 隻英雄的骨架）、以及原地 re-export。
import { zConfigVictoryPodiumDoc } from "./victoryPodium";
// config.vfx-families@1 lives in ./vfx next to the vfx@1 docs it tunes (the
// w3x art family layer); only its union membership belongs here.
import { zConfigVfxFamiliesDoc } from "./vfx";
// 嘲弄規則的上界 —— 定義在 sim/taunt.ts(sim 也夾同一個數字),schema 只是把它
// 接上 Zod,所以兩層守的不可能是兩個數字。
import {
  TAUNT_DURATION_MULT_MAX,
  TAUNT_LEASH_MAX,
  TAUNT_MAX_TARGETS,
} from "../../sim/taunt";
// 火圈灼燒曲線的出貨值 —— 定義在 sim/fireRing.ts（sim 缺欄位時退回同一份），
// schema 只是把它接上 Zod 的 `.default()`。抄第二份就是兩個「沒填的話燒多少」。
import {
  DEFAULT_BURN_CURVE,
  DEFAULT_LETHAL_SAVE_APPLIES,
  DEFAULT_MAX_PCT_PER_SEC,
  DEFAULT_STAGE1_RADIUS,
  DEFAULT_STAGE2_SHRINK_SEC,
  ringFullCloseSec,
} from "../../sim/fireRing";
// 開房房主可調的四格（#288）的上下界 —— **只有一份**，住在 `roomSettings.ts`。
// 那四格同時被四層讀（client 表單的 min/max、game-server 的權威夾取、這一份 Zod、
// 後台顯示），所以抄一份數字進來就是第二個「上限是多少」的答案：房主表單擋在
// 1800，Zod 放行 3600，兩邊漂開的那一天沒有任何東西會紅。
// ⚠️ 相依方向是安全的：`roomSettings.ts` 自己一個 import 都沒有（純表 + 純函式）。
import { MAX_ROUNDS_UNLIMITED, ROOM_SETTING_LIMITS } from "../../roomSettings";

/**
 * Fire-ring (火圈 / 火環) schedule — the round-pacing hazard (tasks #132/#195).
 * Lives inside `config.match@1`'s `match` block next to `combatMaxSec`.
 *
 * #195 turned the ring from a global burn timer into a SHRINKING ring: it
 * ignites `startSec` combat-elapsed seconds in, contracts from the zone
 * boundary to `minRadius` over `shrinkSec`, and burns only the champions
 * OUTSIDE it, at a rate read off the `burnCurve` breakpoint table. `stepSec`/
 * `pctPerStep` are gone with the staircase they described, and (owner
 * 2026-08-02) `burnPctPerSecStart`/`burnPctPerSecEnd` are gone with the
 * two-point ramp THEY described — the block is `.strict()`, so an old doc fails
 * loudly instead of silently arming a ring with the wrong burn.
 *
 * Percentages are fractions of each victim's OWN maxHealth; the burn ignores
 * armor/MR (it is TRUE damage) and the combat-env damage knob. Optional +
 * additive: absent = no ring (legacy behavior).
 */
export const zFireRingConfig = z
  .object({
    /** 第一段起燃：combat-elapsed seconds until the ring ignites (回合長度的旋鈕) */
    startSec: z.number().positive(),
    /** 第一段縮多久：seconds to contract from the zone boundary to `stage1Radius` */
    shrinkSec: z.number().positive().default(20),
    /**
     * 第一段停下來的半徑 —— 二段制 (owner 2026-08-02 「第一段燒 20 秒就**停止
     * 縮圈**」)。停止縮圈的那個半徑**必須站得住**，否則「停止」只是把處決往後
     * 挪 10 秒：`fireRingIsSafe` 是「整個身體在圈內」，而角色碰撞半徑是 0.6
     * (`spawnChampion.ts`)，所以下界 1 是**這條機制成不成立**的邊界，不是防手滑。
     *
     * 出貨 4.0 = 可站立的圓盤半徑 3.4，三個人肩並肩塞得下、還是被逼到貼身。
     *
     * ⚠️ 上界 24 = 出貨競技場的 `boundaryRadius`：比它大等於第一段在四張標準
     * 場地上完全不縮（`arena.royale` 是 42，那裡 24 仍然是真的收圈）。
     *
     * ⚠️ 留白 ⇒ 沿用 `minRadius`，也就是**沒有口袋、單段**（見 `stage2StartSec`
     * 的相容性註記）。只有在 `stage2StartSec` 有填的時候，缺席才會退回出貨的
     * 4.0（`sim/fireRing.ts` 的 {@link DEFAULT_STAGE1_RADIUS}）。
     */
    stage1Radius: z.number().min(1).max(24).optional(),
    /**
     * 第二段起始（**戰鬥第幾秒**，絕對值，owner 說的 90）。
     *
     * ⚠️ **這一格有沒有填，就是二段制的總開關。** 留白 = 只有第一段，一路縮到
     * `minRadius`，和二段制之前**逐 tick 完全一樣**。
     *
     * 為什麼「缺席 = 關掉」而不是「缺席 = 出貨的 90」：後台的耐久覆蓋層
     * (data/, task #189) 可能**已經存過一份二段制之前的 `config.match`**，而它會
     * 蓋掉 `content/`。如果缺席要補一個固定的 90，那份舊文件就得通過下面兩條
     * 跨欄位檢查（例如它的 `combatMaxSec` 若還是舊的 100，90+20 就過不了）——
     * 而覆蓋層裡一份**過不了 Zod 的文件不會只讓自己失效，它會讓整層覆蓋被丟掉**
     * （`apps/platform/internal/contentoverlay/validate.go` 的檔頭把這個爆炸半徑
     * 寫得很清楚：基礎加成、屬性上限、小怪波……全部一起退回 repo 的數字，而後台
     * 還是回報「已寫入」）。所以這裡選的是**舊文件永遠不會變非法**：任何在這次
     * 改動之前就能通過的文件，改動之後照樣通過。
     *
     * ⇒ 代價要講清楚：線上如果真的存過覆蓋層，deploy 之後那一場**還是單段**，
     *   直到有人在後台把這兩格存進去。後台頁那一格的說明就是這麼寫的。
     */
    stage2StartSec: z.number().positive().max(3600).optional(),
    /**
     * 第二段縮多久（秒）—— 從 `stage1Radius` 收到 `minRadius`（全地圖淹沒）。
     * 只有在 `stage2StartSec` 有填時才會被讀；留白 ⇒ sim 的
     * {@link DEFAULT_STAGE2_SHRINK_SEC}（20，和第一段一樣）。
     * 上界 3600 與 `startSec` 那組一致：一個小時的收圈已經遠在任何回合之外。
     */
    stage2ShrinkSec: z.number().positive().max(3600).optional(),
    /**
     * 全地圖淹沒後的半徑 —— 第二段的終點。出貨 **0**（owner 2026-08-02
     * 「第二段燒到**全地圖淹沒**」）。
     *
     * ⚠️ 舊版這裡寫「0 會讓『距離剛好 0』變成一個測度為零的安全點」——**那是假的**：
     * 判定是 `inner = radius - 0.6; inner > 0 && …`，半徑 0 時 `inner = -0.6`，
     * 對所有人都是 false。真正需要 > 0 的是**畫面**（客戶端的火牆是一圈帶狀
     * 網格，半徑 0 那一格會縮成看不見），那是渲染的事，不是這個欄位的語意。
     */
    minRadius: z.number().nonnegative().default(0.5),
    /**
     * 灼燒曲線 (owner 2026-08-02):
     *
     *   「火圈應該是**隨秒數越高越燒越痛**的生命百分比的真實傷害
     *     (極端情形第100秒後燒100%真實傷害=必死)」
     *
     * 一張斷點表，x 是**火圈點燃後**經過的秒數，y 是那一刻每秒燒掉的自身最大
     * 生命比例；中間線性內插，最後一列之後**維持**在那個值。
     *
     * ⚠️ 它取代了 `burnPctPerSecStart` / `burnPctPerSecEnd`，而不是和它們並存。
     * 舊的兩點式 x 軸是**收圈進度**，20 秒就飽和 —— owner 要的「越燒越痛」在那
     * 個座標系裡根本表達不出來。兩個欄位並存就是兩個地方回答「這一刻燒多少」，
     * 也就是 `tauntRules.priority` 那份驗屍報告寫的同一種 drift。
     *
     * ⚠️ **x 是「點燃後」不是「回合第幾秒」，這一格刻意不是開關。**
     * `extendRoundForBoss` 把起燃往後推 180 秒，決賽輪則直接換成 180 秒；用
     * 回合絕對秒數查表的話，王局的圈一點燃就已經走完整張表 —— 實測「圈外站著
     * 不回來」從 11.60 秒死變成 1.03 秒死，20 秒的收圈張力整個塌掉。一個只有
     * 一種取值不是壞掉的「決策點」不是決策點。
     * owner 的「第 100 秒」因此是**出貨 `startSec: 60` 之下**的 `sec: 40`；
     * 後台頁把兩種時鐘並排顯示，所以改 `startSec` 時看得見錨點跑到哪。
     *
     * 上下界（CLAUDE.md「欄位要有上界，不是只有下界」）:
     *   · `sec` 0～600 —— 一個圈最長能燒多久是 `hardDeadline − hardCap`（出貨
     *     40 秒，上界情境下也不到 3600），600 = 10 分鐘已經遠在任何人會授權的
     *     回合長度之外，純粹是誤植守衛。
     *   · `pctPerSec` 0～2 —— 1.0 = 100 %/秒 = 一秒燒完一條滿血 = owner 說的
     *     「必死」。上界**刻意留在必死之上**：2.0 = 0.5 秒 = 15 個 tick，紅
     *     畫面與灼燒音效還來得及被看見/聽見；再往上火圈就不是危險而是一條瞬殺
     *     線，那是 `minRadius` 幾何的工作，不是燒傷的。
     *   · 2～8 列 —— 一個點畫不出「越燒越痛」（而且 `compileBurnCurve` 對空表
     *     會整張退回出貨曲線，等於操作者存了一列、遊戲照舊）；8 列與
     *     `attackRangeCurve` 同，也讓每 tick 的掃描最多 7 次比較。
     */
    burnCurve: z
      .array(
        z
          .object({
            /** 火圈**點燃後**經過的秒數（不是回合秒數） */
            sec: z.number().min(0).max(600),
            /** 這一刻每秒燒掉的自身最大生命比例。1 = 100 %/秒 = 一秒必死 */
            pctPerSec: z.number().min(0).max(2),
          })
          .strict(),
      )
      .min(2)
      .max(8)
      // 第一列必須是點燃當下,否則「起燃時每秒燒多少」有兩個答案:表上第一列的
      // 值,和 `fireRingRatePerSec` 在第一列之前那段夾出來的平值。
      .refine((pts) => pts[0]!.sec === 0, {
        message: "match.fireRing.burnCurve 的第一列必須是 sec: 0（火圈點燃的那一刻）",
      })
      // 嚴格遞增:重複的 sec 會讓內插的分母是 0,順序錯掉的表在畫面上完全正常
      // 而燒傷是亂的。
      .refine((pts) => pts.every((p, i) => i === 0 || p.sec > pts[i - 1]!.sec), {
        message:
          "match.fireRing.burnCurve 必須依 sec 由小到大排列，而且不可以有重複的秒數",
      })
      .default(DEFAULT_BURN_CURVE as { sec: number; pctPerSec: number }[]),
    /**
     * 每秒燒傷的天花板（佔最大生命）。owner 2026-08-02：
     *
     *   「可以把燃燒真傷上限數值設定放在後台，例如預設最高是50%之類，
     *     不必到100%」
     *
     * 出貨 0.5，而且**留白不是「不設限」，是回到出貨的 0.5**（`.default()`
     * 在這一層填，`fireRingRulesFromConfig` 的 `??` 在 sim 那一層填，兩邊指的
     * 是同一個常數 {@link DEFAULT_MAX_PCT_PER_SEC}）。舊版這裡是 `.optional()`
     * 配上 sim 的 `?? Infinity`，兩層對「上限是多少」給出相差無限大的答案。
     *
     * ⚠️ 上界是 1（= 一秒滿血變空）。比 1 大的數字改變不了任何玩家看得到的
     * 東西，所以它不是一個可用的設定值，是一個打錯字的機會。
     * ⚠️ 這道牆現在**確實低於出貨曲線的尾巴**（`burnCurve` 最後一列是 1.0）：
     * 那是 owner 要的 —— 第 100 秒的 100 %/秒被夾成 50 %/秒，還是必死，只是
     * 要兩秒不是一秒。要讓曲線的高處真的生效就把這一格調高。
     */
    maxPctPerSec: z.number().min(0).max(1).default(DEFAULT_MAX_PCT_PER_SEC),
    /**
     * 【免死】擋不擋火圈燒傷 (GH#287)。
     *
     * ⚠️ 這是一個 **owner 還沒表態的設計決策點**，所以它是一個欄位而不是程式裡的
     * 一個分支（CLAUDE.md 第一守則），而預設值選的是「保留今天行為」的那一個：
     * **關閉（出貨預設）= 火圈無視免死**，燒到 0 就是死 —— 火圈存在的理由是**強制
     * 結束回合**。開啟之後，帶免死標記的英雄（例如狂戰士 52-002【十二道試煉】的
     * 12 層）會在火圈裡逐層消耗免死次數，也就是一個人可以在圈外站 12 次，回合會被
     * 拖長；那正是這個開關要讓 owner 自己決定的事。
     *
     * ⛔ **無敵沒有對應的欄位，而那不是漏了**：內容側已經有一格
     * （`invulnerable` 的 `blocksTrueDamage`），所以「這支技能擋不擋火圈」本來就是
     * 編輯器卡片上的一個選項。再開一個全域開關會變成兩個地方回答同一個問題。
     *
     * 缺席 ⇒ {@link DEFAULT_LETHAL_SAVE_APPLIES}（false）—— 和 sim 那一層
     * `fireRingRulesFromConfig` 的 `??` 指同一個常數，所以「沒填的話擋不擋」只有
     * 一個答案（`maxPctPerSec` 那一段記錄過兩層各說各話的代價）。耐久覆蓋層裡一份
     * 這一格出現之前的舊文件因此仍然合法，而且照舊玩它被授權的那個火圈。
     */
    lethalSaveApplies: z.boolean().default(DEFAULT_LETHAL_SAVE_APPLIES),
    /**
     * 回合硬上限 (#248). owner 2026-08-01:
     *
     *   「時間延長太久了，**不管什麼條件**，每回合最長上限就是 5 分鐘出現火圈
     *     準備收場，不會無限增加時間」
     *
     * The combat-elapsed second at which the ring's closing sequence STARTS no
     * matter what. It is a CEILING ON `startSec`, not a second timer: at this
     * many combat-elapsed seconds the ring ignites and contracts over the
     * ordinary `shrinkSec`, so 「出現火圈準備收場」 is the same sequence the
     * player already knows, just no longer deferrable.
     *
     * WHAT IT ACTUALLY STOPS. `boss.delayFireRingSec` / `boss.extendCombatSec`
     * are applied ONCE PER 殭屍王 SUMMON, and `arena-rules.json` ships the king
     * as `repeatable: true` at `killThreshold: 100` — so a champion farming
     * zombies re-summons at 100, 200, 300 … and EACH summon adds another 180 s
     * to both deadlines, per champion. That is the unbounded round the owner
     * measured; the two `.max(3600)` bounds on the boss knobs bound ONE summon,
     * never the total. This bounds the total.
     *
     * ⚠️ WHY THERE IS NO 「停用硬上限」 SWITCH. 不管什麼條件 is the requirement; a
     * boolean that turns it off is the defect wearing a checkbox. The operator's
     * escape hatch is the NUMBER — raise it to 1800 for a marathon round — which
     * cannot silently restore an unbounded round the way an off switch would.
     *
     * BOUNDED BOTH ENDS (CLAUDE.md 「欄位要有上界，不是只有下界」):
     *   · min 20 — a round shorter than one closing animation (`shrinkSec`
     *     ships at 20 s) would ignite the ring and force-end combat before it
     *     ever reached `minRadius`, i.e. the 收場 the player is promised would
     *     never be drawn. The cross-field refine below additionally requires
     *     `roundHardCapSec >= startSec + shrinkSec` against the ACTUAL authored
     *     shrink, so this static floor is only the last line.
     *   · max 1800 — 30 minutes. The mis-parse this catches is the stray digit
     *     on the shipped 300 (「5 分鐘」 typed as 3000 = 50 minutes, or as
     *     「500」 minutes), which is precisely the shape #277 named. 1800 is
     *     still longer than any round anyone would deliberately author, so the
     *     ceiling costs the operator nothing real.
     *
     * ABSENT ⇒ NO CAP in the SIM's own mirror (`FireRingConfigLike` in
     * sim/fireRing.ts treats it as `Infinity`), so a hand-built fixture or the
     * client's prediction shadow behaves byte-identically to pre-#248. The
     * schema's `.default(300)` means every doc that goes through the loader HAS
     * one — same two-sided asymmetry the `boss` block above documents.
     */
    roundHardCapSec: z.number().min(20).max(1800).default(300),
    /**
     * 殭屍王在場 → 回合延長 (#L1). owner 2026-07-30:
     *
     *   「殭屍王出現**回合結束時間延長 3 分鐘**(**火圈時間也延後**),
     *     除非全死不然不會提前結束,避免打到一半結果回合結束」
     *
     * TWO knobs, not one, even though the owner said one number. They move two
     * DIFFERENT deadlines and an operator will eventually want them apart: the
     * ring's ignition is 「還有多久開始收圈」 (pacing/tension) and the backstop is
     * 「這回合最長多久」 (match length). Shipping them fused would mean the first
     * time somebody wants a longer king fight WITHOUT a longer round, the answer
     * is a code change. Both ship at the owner's 180.
     *
     * WHY INSIDE `fireRing` AND NOT BESIDE IT. The match host resolves exactly
     * this block (`resolveFireRing()`) and hands it to the sim's
     * `fireRingRulesFromConfig`. A sibling block would need new plumbing through
     * the host before it did anything — and a knob that needs plumbing before it
     * works is a knob the operator can turn with no effect (failure mode ②).
     *
     * 0 on either = that half is OFF.
     *
     * ⚠️ AN ABSENT BLOCK DEFAULTS **ON**, at 180/180 — the one place in this
     * schema where 「缺席 = 今天的行為」 is deliberately NOT the rule. The reason
     * is `scripts/exportContentToJson.ts`: it regenerates `config.match.json`
     * from a literal that predates this block, so a default of 「off」 would let
     * a routine content re-export silently delete a mechanic the owner asked
     * for, and nothing downstream would notice (it would just be a shorter
     * round). Defaulting on makes that failure mode impossible. The SIM's own
     * mirror (`FireRingConfigLike.boss` in sim/fireRing.ts) still treats absent
     * as 0, so a hand-built fixture or the client's prediction shadow is
     * byte-identical to pre-#L1 — the two asymmetries protect opposite ends.
     *
     * Because of that default, deleting the block from the JSON does NOT turn
     * the feature off; `bossRoundExtension.test.ts` therefore pins the RAW file
     * as well as the parsed doc.
     *
     * ⚠️ BOUNDED ON BOTH SIDES (CLAUDE.md 「欄位要有上界,不是只有下界」). 3600 s
     * is an hour of extension per summon; the king is `repeatable`, so an
     * unbounded field plus a farmer is an unbounded round.
     */
    boss: z
      .object({
        /** seconds added to `combatMaxSec`'s deadline each time a king spawns */
        extendCombatSec: z.number().min(0).max(3600).default(180),
        /** seconds the ring's ignition is pushed back each time a king spawns */
        delayFireRingSec: z.number().min(0).max(3600).default(180),
      })
      .strict()
      .default({}),
  })
  .strict();

export type FireRingConfig = z.infer<typeof zFireRingConfig>;

/** Contract defaults for the fireRing block (dev cheats / fallbacks). */
export const DEFAULT_FIRE_RING_CONFIG: FireRingConfig = {
  startSec: 60,
  shrinkSec: 20,
  // 二段制的出貨形狀 (owner 2026-08-02)：60 起燃 → 80 停止縮圈（口袋 4.0）
  // → 90 第二段 → 110 全地圖淹沒。
  stage1Radius: DEFAULT_STAGE1_RADIUS,
  stage2StartSec: 90,
  stage2ShrinkSec: DEFAULT_STAGE2_SHRINK_SEC,
  minRadius: 0,
  burnCurve: DEFAULT_BURN_CURVE as { sec: number; pctPerSec: number }[],
  maxPctPerSec: DEFAULT_MAX_PCT_PER_SEC,
  lethalSaveApplies: DEFAULT_LETHAL_SAVE_APPLIES,
  roundHardCapSec: 300,
  boss: { extendCombatSec: 180, delayFireRingSec: 180 },
};

export const zConfigMatchDoc = z
  .object({
    id: zId,
    schema: z.literal("config@1"),
    tick: z
      .object({
        /** authoritative sim tick rate (Hz) */
        tickHz: z.number().int().positive(),
        /** network snapshot broadcast rate (Hz) */
        snapshotHz: z.number().int().positive(),
      })
      .strict(),
    match: z
      .object({
        teamCount: z.number().int().min(2),
        teamSize: z.number().int().min(1),
        /** shared team lives at match start (PairedDuels) */
        startingTeamLives: z.number().int().positive(),
        /**
         * 一場最多打幾回合（#288）。{@link MAX_ROUNDS_UNLIMITED}（0）= **不設限**，
         * 也就是照賽制打到最後一回合（決賽，game-server 的 `PairedDuels.FINAL_ROUND`）
         * 為止 —— 出貨值就是 0，因為 owner 2026-08-08 說的是「預設值保留現在」。
         *
         * ⛔ **不是**「打到團隊生命歸零」。這句話在 2026-08-08 的第一版寫錯了（第三守則）：
         * owner 2026-07-27 取消淘汰之後 `startingTeamLives` 歸零**不會讓任何人出局**，
         * 它只是排名次的計分板。整份推導寫在 `PairedDuels.FINAL_ROUND` 的檔頭。
         *
         * 上下界 import 自 `roomSettings.ts` 的 `ROOM_SETTING_LIMITS.maxRounds`：
         * 開房房主可以覆蓋這一格，兩層必須是同一個界，否則後台存得進去的數字房主
         * 設不了（或反過來）。
         *
         * ⚠️ 為什麼是 `.default()` 而不是必填：耐久覆蓋層（`data/`, task #189）裡
         * 可能已經存過一份**這一格出現之前**的 `config.match`。必填會讓那份舊文件
         * 當場變成非法，而一份過不了 Zod 的覆蓋文件**不會只讓自己失效，它會讓整層
         * 覆蓋被丟掉**（`apps/platform/internal/contentoverlay/validate.go` 的檔頭）。
         * 這裡選的是和 `stage2StartSec` 同一條規矩：**舊文件永遠不會變非法**，而且
         * 缺席補進來的 0 剛好就是「今天的行為」。
         */
        maxRounds: z
          .number()
          .int()
          .min(ROOM_SETTING_LIMITS.maxRounds.min)
          .max(ROOM_SETTING_LIMITS.maxRounds.max)
          .default(MAX_ROUNDS_UNLIMITED),
        /**
         * 選角階段長度（秒）—— **有人類對手的一般對局**。
         *
         * ⚠️ 上界 600 是 2026-08-03 補的:在此之前這一格只有 `positive()`,
         * 所以 20 打成 2000 會過後台,而選角會卡在那裡 33 分鐘,沒有任何東西擋。
         * CLAUDE.md:「欄位要有上界,不是只有下界」。
         */
        champSelectSec: z.number().positive().max(600),
        /**
         * 選角階段長度（秒）—— **vs bot 的一鍵開打**（owner 2026-08-03:
         * 「vs bot 一鍵開打的時候，選角色時間可以延長+300秒」）。
         *
         * 為什麼是**獨立一格**而不是把 `champSelectSec` 調大:那兩個情境的成本
         * 完全不同。PvP 多等 5 分鐘是**別人**在等；bot 局只有自己,想看多久英雄
         * 資料都行。共用一格的話,調長 bot 局就一定會拖慢 PvP。
         *
         * 缺席（`undefined`）時退回 `champSelectSec` —— 也就是「不特別處理」。
         * 這一格本身就是那個決策點的開關:設成和 `champSelectSec` 一樣就等於關掉。
         */
        champSelectSecVsBot: z.number().positive().max(1800).optional(),
        /**
         * **vs bot 的選角早退**（owner 2026-08-03:「vs bot 選角後就可以開始進入
         * 戰鬥不用等，一樣是因為不用等其他 bot」）。
         *
         * true（出貨）= 人類座位全部鎖定英雄的那一刻就進戰鬥，不等
         * `champSelectSecVsBot` 的倒數跑完。false = 一律等倒數（這一格出現之前
         * 的行為）。
         *
         * ⚠️ 沒有第三種選項「等 bot 也選完」—— bot 根本不在選角階段選，牠們是在
         * 階段結束時由 `autoPickAndSpawn` 一次配好的。所以「等 bot」在程式上
         * 不存在，這一格就是那個決策點的全部。
         *
         * ⚠️ 判準是**人類座位數 <= 1**，不是「場上有 bot」—— `MatchRoom` 把每一個
         * 沒人坐的座位都填成 `isBot: true`，所以「有 bot」在**每一場**都成立。
         * 用它判會讓三個朋友一起打的局也被第一個鎖定的人拖走。同理
         * `champSelectSecVsBot`（v0.9.29）。
         */
        champSelectEarlyStartVsBot: z.boolean().optional(),
        /**
         * **vs bot 的強制結算**（owner 2026-08-03:「如果是 vs bot，玩家場勝負
         * 結算，另一場的 bot 還沒則強制結算，不要讓玩家白等」）。
         *
         * 相位要**每一個 zone 都有勝負**才結束（`MatchController.checkCombatEnd`
         * 回 `duelWinners.size === pairings.length`），所以一個人打 bot 局時，
         * 自己那一場三十秒打完之後還要看著另外一區的兩隊 bot 慢慢磨到火圈。
         *
         * true（出貨）= 人類那一區記下勝負的**同一 tick**，其餘未決的 zone 用
         * 和時間到完全一樣的裁決（團隊血量比例高者勝，平手擲 `world.rng`）
         * 立刻結算。false = 這一格出現之前的行為（等每一區自己打完）。
         *
         * ⚠️ 它**只**縮短等待，不改變任何一區的勝負規則：用的是既有的
         * `timerExpired` 裁決分支，不是新發明一套。人類那一隊自己那一場的勝負
         * 一格都沒被碰到。
         */
        forceSettleVsBot: z.boolean().optional(),
        /**
         * **血耗光的隊伍要不要當場收到一張結算卡**（GH#264 / #193）。
         *
         * #193 的中途結算卡本來掛在「團隊生命歸零」上，因為當時歸零**就是**出局。
         * owner 2026-07-27 取消淘汰之後那兩件事分家了：歸零只是計分板見底，那一
         * 隊照樣打完十回合，**而且照樣可能奪冠**（第 1 名由決賽決定、不看團隊
         * 生命）。所以舊的觸發條件會在比賽中途對未來的冠軍送出一張
         * `winnerTeam: -1` 的「戰鬥結束」卡，而那張卡在客戶端是直接附「返回大廳」
         * 的 —— 按下去就是放棄一場自己會贏的比賽。
         *
         * false（出貨）= 比賽沒結束就沒有人出局，沒有人收到中途結算卡；離場走
         * #271 的一般確認框。這一側是 owner 明說的那一側：「不管前面被淘汰與否，
         * 大家都回來打第 10 回合」。
         * true = 這一格出現之前的行為（血一歸零就發卡），讓計分板墊底的人可以提早
         * 看評價再離場。⚠️ 打開就會重現上面那個「冠軍先收到淘汰卡」的情況。
         *
         * ⚠️ 布林沒有上下界可講 —— 它的「界」是這兩個具名狀態，由後台的
         * `MATCH_BOOL_LABELS` 守（`matchConfig.test.ts` 要求每一個布林都在裡面）。
         * 缺席 = false，和其他兩個 `.optional()` 布林同一個約定：一份還沒有這一格
         * 的舊文件應該得到 owner 現在要的行為。
         */
        settlementCardOnHealthSpent: z.boolean().optional(),
        /**
         * 中場（商店）秒數。
         *
         * ⚠️ 上界是 #288 補的：這一格從此**房主開房時可以覆蓋**，而房主那條路不會
         * 經過後台的 `MATCH_CONSOLE_MAX`（那張表只在後台頁裡）。少了這一行，表單
         * 擋住的 601 用 HTTP 直送照樣進得去 —— CLAUDE.md「欄位要有上界，不是只有
         * 下界」的同一個形狀（`champSelectSec` 2026-08-03 已經補過）。
         * 數字 import 自 `ROOM_SETTING_LIMITS.intermissionSec`，不是打字。
         */
        intermissionSec: z.number().positive().max(ROOM_SETTING_LIMITS.intermissionSec.max),
        /**
         * HARD combat backstop: the phase force-ends here (PhaseMachine). It is
         * NOT the intended round length — the fire ring (below) closes in first
         * and settles a stalemate well before this cap. Must leave room for the
         * WHOLE ring (`startSec + shrinkSec`), not just its ignition: a ring
         * that is still shrinking when the phase force-ends never gets to
         * finish anyone (refine below).
         *
         * ⚠️ 上界是 #288 補的，理由同 `intermissionSec`：這一格從此房主開房時可以
         * 覆蓋，而房主那條路不經過後台的 `MATCH_CONSOLE_MAX`。數字 import 自
         * `ROOM_SETTING_LIMITS.combatMaxSec`（1800 = 30 分鐘）—— 它比後台原本自己
         * 補的 3600 緊，是刻意的：`roundHardCapSec` 的上界本來就是 1800，一場回合
         * 的硬底線沒有理由可以設得比「回合絕對上限」更遠。
         */
        combatMaxSec: z.number().positive().max(ROOM_SETTING_LIMITS.combatMaxSec.max),
        /**
         * Fire ring (火圈 / 火環, tasks #132/#195) — the round-pacing ring.
         * `startSec` is the SINGLE SOURCE OF TRUTH for round length: at that
         * combat-elapsed time the ring appears at the zone boundary and then
         * contracts over `shrinkSec` to `minRadius`, burning everyone OUTSIDE
         * it with a defence-ignoring %-HP true-damage rate that ramps with the
         * shrink. By the end there is no survivable space at all, so a
         * stalemate cannot outlast it. Optional + additive: an absent block =
         * no ring (legacy behavior). Consumed by the sim via
         * `fireRingRulesFromConfig` → `beginCombatFireRing`.
         */
        fireRing: zFireRingConfig.optional(),
        resolutionSec: z.number().positive(),
      })
      .strict()
      /**
       * 二段制 —— 第二段不可以比第一段收完更早 (owner 2026-08-02).
       *
       * 「第一段燒 20 秒就停止縮圈…第二段起始於 90 秒」 只有在 90 >= 60 + 20 的
       * 時候才是一句話；填成 70 的話「停止縮圈」的窗口是負的，而畫面上完全正常
       * ——圈只是連續縮完，操作者以為自己設了一個喘息期而玩家從來沒有拿到。
       * sim 端會把它夾住（`fireRingRulesFromConfig` 的 `Math.max(shrinkTicks, …)`，
       * 那是給不走 Zod 的 fixture 的安全帶），所以這裡**在作者時擋掉**才是唯一
       * 會讓人知道自己填錯的地方 —— 夾住不報錯的話，操作者存了 70 卻在玩 80。
       *
       * 留白（單段）⇒ 這條不成立也不檢查。
       */
      .refine(
        (m) =>
          !m.fireRing ||
          m.fireRing.stage2StartSec === undefined ||
          m.fireRing.stage2StartSec >= m.fireRing.startSec + m.fireRing.shrinkSec,
        {
          message:
            "match.fireRing.stage2StartSec 必須 >= startSec + shrinkSec（第二段不能比第一段停止縮圈更早開始，否則「停止縮圈」的喘息期是負的）",
          path: ["fireRing", "stage2StartSec"],
        },
      )
      /**
       * 整個火圈（兩段都算）要在硬底線之前收完。
       *
       * ⚠️ 這條以前寫的是 `startSec + shrinkSec`，而二段制之後那個算式**只涵蓋
       * 第一段**：出貨的圈從點燃到淹沒是 50 秒，不是 20 秒，所以舊算式會放行一份
       * 「第二段縮到一半就被強制結束」的設定，而且是靜靜地放行（失敗形態 ④：
       * 斷言方向跟缺陷無關）。長度只有一個答案，住在 {@link ringFullCloseSec}。
       */
      .refine(
        (m) => !m.fireRing || m.fireRing.startSec + ringFullCloseSec(m.fireRing) <= m.combatMaxSec,
        {
          message:
            "match.fireRing: 起燃秒數 + 整個火圈收完要幾秒（兩段都算）必須 <= match.combatMaxSec，否則圈還在縮就被硬底線強制結束",
          path: ["fireRing", "startSec"],
        },
      )
      /**
       * #L1 — THE SAME INVARIANT, ONE 殭屍王 LATER.
       *
       * `extendRoundForBoss` adds `delayFireRingSec` to the ignition and
       * `extendCombatSec` to the backstop. If the delay is the larger of the
       * two, the ring is pushed PAST the (extended) backstop and the round ends
       * with the ring still open — the stalemate-breaker silently stops
       * existing for exactly the rounds a king showed up in, which is the worst
       * possible time for it to stop existing.
       *
       * Checked once here, at author time, instead of clamped at runtime: a
       * clamp would let the operator save 300/180 and then quietly play 200/180.
       * Shipped 60+20 vs 100 leaves 20 s of slack, so the shipped 180/180 passes
       * with room to spare.
       */
      .refine(
        (m) =>
          !m.fireRing ||
          m.fireRing.startSec +
            m.fireRing.boss.delayFireRingSec +
            ringFullCloseSec(m.fireRing) -
            m.fireRing.boss.extendCombatSec <=
            m.combatMaxSec,
        {
          message:
            "match.fireRing.boss: after a 殭屍王 extension the ring must STILL finish closing before the backstop — require startSec + delayFireRingSec + 整個火圈收完要幾秒（兩段都算） <= combatMaxSec + extendCombatSec",
          path: ["fireRing", "boss", "delayFireRingSec"],
        },
      )
      /**
       * #248 — THE HARD CAP MUST NOT TRUNCATE THE UN-EXTENDED ROUND.
       *
       * `roundHardCapSec` is a CEILING on the ignition tick. If it were authored
       * BELOW `startSec` the ring would ignite early on every ordinary round and
       * `startSec` — documented one field up as 「回合長度的單一真相」 — would
       * silently stop being true. Requiring the cap to leave room for the whole
       * un-extended ring (`startSec + shrinkSec`) states the stronger, more
       * useful fact: the cap can only ever shorten a round that something
       * EXTENDED, never the baseline one, and there is always at least one full
       * closing animation inside it.
       *
       * Shipped: 60 + 20 = 80 <= 300, so the cap is inert until a 殭屍王 shows up.
       *
       * Checked at author time rather than clamped at runtime, for the same
       * reason the refine above is: a clamp would let the operator save 30 and
       * then quietly play 80.
       */
      .refine(
        (m) =>
          !m.fireRing ||
          m.fireRing.startSec + ringFullCloseSec(m.fireRing) <= m.fireRing.roundHardCapSec,
        {
          message:
            "match.fireRing.roundHardCapSec must leave room for the WHOLE un-extended ring — require startSec + 整個火圈收完要幾秒（兩段都算） <= roundHardCapSec (回合硬上限只能砍掉被延長的回合，不能砍掉正常回合)",
          path: ["fireRing", "roundHardCapSec"],
        },
      ),
    economy: z
      .object({
        startingGold: z.number().int().min(0),
        killGold: z.number().int().min(0),
        /**
         * One-time bounty paid on TOP of killGold the first time each enemy
         * champion dies (task #90). OPTIONAL + additive: a config doc without it
         * (older exports, the editor's new-doc template) still validates, and the
         * sim reads its own GOLD_REWARDS.killBounty default — this key is the
         * operator override for that value.
         */
        killBounty: z.number().int().min(0).optional(),
        assistGold: z.number().int().min(0),
        roundWinGold: z.number().int().min(0),
        roundLoseGold: z.number().int().min(0),
        /** fraction of cost refunded on sell, 0..1 */
        sellRefund: z.number().min(0).max(1),
        inventorySlots: z.number().int().min(1).max(9),
      })
      .strict(),
    progression: z
      .object({
        levelCap: z.number().int().min(1),
        /** xpToNext(level) = xpBase + xpPerLevel * (level - 1) */
        xpBase: z.number().int().positive(),
        xpPerLevel: z.number().int().min(0),
        xpKill: z.number().int().min(0),
        xpAssist: z.number().int().min(0),
        xpRoundSurvive: z.number().int().min(0),
      })
      .strict(),
    draft: z
      .object({
        offerCount: z.number().int().min(1).max(5),
        /** round number (as string key) -> augment tier offered that round */
        tierSchedule: z.record(z.string().regex(/^[0-9]+$/), zAugmentTier),
      })
      .strict(),
  })
  .strict();

/**
 * Store config: the FLAT 藍水晶 champion unlock price + match placement rewards.
 *
 * Owner, 2026-07-30:「所有英雄藍水晶都是統一價，新上架預設也是一樣價格」. This
 * replaced a 53-entry `championPrices` map whose only real content was "300, 41
 * times, and 0 twelve times" — a maintenance liability that made FORGETTING a
 * line mean GIVING THE CHAMPION AWAY (an absent price reads as free on both the
 * client and the server). Under the flat model an unlisted champion costs
 * `championUnlockCost`, so onboarding a hero needs no store edit at all.
 */
export const zConfigStoreDoc = z
  .object({
    id: zId,
    schema: z.literal("config.store@1"),
    /**
     * The 藍水晶 price of ONE champion unlock — the same number for every
     * champion that is not on `freeChampionIds`. Upper bound is a typo guard,
     * not a balance opinion: 1,000,000 is already ~4,300 first-place matches.
     */
    championUnlockCost: z.number().int().min(0).max(1_000_000),
    /**
     * The champions that cost NOTHING — the free starter roster every new
     * account is seeded with. Emptying it is legal (the owner may want a fully
     * uniform store); see the note in apps/platform/internal/wallet/catalog.go
     * for what a new account then faces.
     */
    freeChampionIds: z.array(zId),
    /** M COIN granted per final team placement (1 = winner) */
    mcoinRewards: z
      .object({
        placement1: z.number().int().min(0),
        placement2: z.number().int().min(0),
        placement3: z.number().int().min(0),
        placement4: z.number().int().min(0),
      })
      .strict(),
    /**
     * 隨機選角（🎲）在**擁有權讀不到**的時候該怎麼辦 —— owner 2026-08-02：
     *「隨機選角的時候，只能隨機到自己有解鎖的角色」。
     *
     * 這是一個**決策點**，不是一個數字，所以它是一個欄位而不是一行程式碼裡的
     * `if`。它只在一種狀態下有意義：客戶端**有登入 session、但錢包/目錄讀不到**
     * （平台故障、請求逾時，或選角開頭那段還在載入的視窗）。三種狀態的分工：
     *
     *   · 讀得到擁有權 → 一律只抽 `owned ∩ whitelist`，本欄位管不到。
     *   · 沒有 session（本機 `pnpm dev` / LAN 直連，根本沒有帳號）→ 一律照抽，
     *     本欄位也管不到：沒有「自己」就沒有「自己解鎖的角色」，而伺服器對這種
     *     座位同樣是 fail-open（apps/game-server/src/curation/ownership.ts），
     *     擋掉只會讓 🎲 在開發機上變成一顆死按鈕。
     *   · 有 session 但擁有權讀不到 → **就是這一欄**。
     *
     * `"block"`（出貨預設，owner 明說的那個）：不抽，按鈕停用並說明原因。寧可
     * 讓 🎲 暫時不能用，也不要抽出一隻玩家沒解鎖的英雄 —— 平台故障時伺服器那
     * 道擁有權閘同樣拿不到名單而 fail-open，所以那一抽是真的會打進場的。
     * `"whitelist"`：照抽全白名單（2026-08-02 之前的行為），代價是平台故障期間
     * 🎲 會抽到沒解鎖的英雄。
     *
     * 缺欄位 ⇒ `"block"`（見 DEFAULT_RANDOM_PICK_OWNERSHIP）。
     */
    randomPickOwnership: z.enum(["block", "whitelist"]).optional(),
  })
  .strict();

/** 缺 `randomPickOwnership` 時的語意 —— owner 的「只能隨機到有解鎖的」。 */
export const DEFAULT_RANDOM_PICK_OWNERSHIP = "block" as const;

/** 擁有權讀不到時 🎲 的兩種模式（`config.store@1.randomPickOwnership`）。 */
export type RandomPickOwnershipMode = "block" | "whitelist";

/**
 * config.arena-rules@1 — LoL-Arena style ROUND RULES (`config/arena-rules.json`).
 * Per-round grants (levels/gold), auto-learned abilities, augment-offer tiers,
 * free 3-choose-1 item ("legendary weapon") offers rolled from a loot table,
 * and the round from which R ignores the 6/11/16 level gate. Consumed by the
 * game-server MatchController; when the doc is absent the controller keeps the
 * legacy skeleton behavior exactly (Q-only start, level gates, gacha round 2+).
 */
export const zArenaRoundGrant = z
  .object({
    /** champion levels granted at intermission entry (each = +1 ability point) */
    grantLevels: z.number().int().min(0).optional(),
    /** flat gold granted at intermission entry */
    grantGold: z.number().int().min(0).optional(),
    /** slots auto-learned to rank 1 (points permitting) after level grants */
    autoLearn: z.array(zCoreAbilitySlot).optional(),
    /** augment offer tier this round (3-choose-1 via the draft system) */
    augmentTier: zAugmentTier.optional(),
    /** free 3-choose-1 item offer rolled from this loot table id */
    weaponLootTable: z.string().min(1).optional(),
  })
  .strict();

/**
 * Healing-flower rules (LoL-Arena style): during Combat, neutral attackable
 * flowers spawn periodically in each duel zone; killing one bursts HP/MP to
 * the killer + nearby allies. Percentages are fractions of each RECIPIENT's
 * own maxHealth/maxMana. Optional + additive: absent block = no flowers
 * (legacy behavior).
 */
export const zFlowerConfig = z
  .object({
    /** seconds after combat start until the first flower spawns (per zone) */
    firstSpawnSec: z.number().positive(),
    /** seconds after a flower's DEATH until the zone's next flower spawns */
    respawnSec: z.number().positive(),
    /** max concurrently-alive flowers per zone */
    maxAlivePerZone: z.number().int().min(1),
    /** flower hit points (no regen) */
    hp: z.number().positive(),
    /** fraction of each recipient's OWN maxHealth restored on burst (0..1) */
    healPctMax: z.number().min(0).max(1),
    /** fraction of each recipient's OWN maxMana restored on burst (0..1) */
    manaPctMax: z.number().min(0).max(1),
    /** burst radius (GGD units) around the FLOWER for allied recipients */
    burstRadius: z.number().positive(),
  })
  .strict();

export type FlowerConfig = z.infer<typeof zFlowerConfig>;

/** Contract defaults for the flowers block (used by dev cheats / fallbacks). */
export const DEFAULT_FLOWER_CONFIG: FlowerConfig = {
  firstSpawnSec: 15,
  respawnSec: 25,
  maxAlivePerZone: 1,
  hp: 60,
  healPctMax: 0.18,
  manaPctMax: 0.18,
  burstRadius: 6,
};

/**
 * Revive circles (task #84 復活小火圈): a champion who dies in combat drops a
 * team-tinted ring on the corpse; a LIVING TEAMMATE who stands in it and
 * channels brings them back — once per team per round. Optional + additive:
 * an absent block means the mechanic is simply OFF (same legacy-compat
 * convention as `flowers`). Every judgement call in the design is one of these
 * keys, so a playtest disagreement is a JSON edit, not a rebuild.
 */
export const zReviveCircleConfig = z
  .object({
    /**
     * seconds a teammate must ACCUMULATE standing in the ring before the revive
     * fires (must exceed the kill cadence). Shipped at 5.0 — the task #206
     * threshold, mirrored by REVIVE_CHANNEL_SEC in sim/revive.ts.
     */
    channelSec: z.number().positive(),
    // NOTE: there is deliberately no `lifetimeSec`. The ring burns until the
    // round ends (task #196, matching LoL Arena's untimed downed zone), so the
    // knob was removed rather than pinned to 0 — a dead knob invites someone
    // to "restore" the bug. `.strict()` below makes a stale doc that still
    // carries the key fail loudly instead of silently doing nothing.
    /** ring radius (GGD units) — the channel/contest area */
    radius: z.number().positive(),
    /** progress drained per tick when the ring is empty (1 = same rate as filling) */
    decayMult: z.number().min(0),
    /** completed revives a team may perform per ROUND (the round-termination knob) */
    revivesPerTeamPerRound: z.number().int().min(0),
    /** fraction of the revived champion's OWN maxHealth restored (0..1) */
    reviveHpPctMax: z.number().min(0).max(1),
    /** fraction of the revived champion's OWN maxMana restored (0..1) */
    reviveManaPctMax: z.number().min(0).max(1),
    /** an enemy inside the ring HOLDS progress (false = enemies are ignored) */
    contestPauses: z.boolean(),
    /** taking damage cancels the channel (false by design — see the todo doc) */
    damageInterrupts: z.boolean(),
    /** stun/root/knockdown cancels the channel */
    ccInterrupts: z.boolean(),
  })
  .strict();

export type ReviveCircleConfig = z.infer<typeof zReviveCircleConfig>;

/** Contract defaults for the reviveCircles block (dev cheats / fallbacks). */
export const DEFAULT_REVIVE_CIRCLE_CONFIG: ReviveCircleConfig = {
  channelSec: 5, // task #206: 5s accumulate threshold (REVIVE_CHANNEL_SEC)
  radius: 2,
  decayMult: 2,
  revivesPerTeamPerRound: 1,
  reviveHpPctMax: 0.5,
  reviveManaPctMax: 0.5,
  contestPauses: true,
  damageInterrupts: false,
  ccInterrupts: true,
};

/**
 * Neutral duel-zone GUARDIAN (守護塔 / 守護石碑, task #89). During Combat one
 * neutral attackable guardian stands at each ACTIVE duel zone's centre; anyone
 * may attack it, the LAST-HIT killer is paid (full HP+MP, gold, 鎮守之力), and
 * while awake it fires a telegraphed AoE volley at its top damagers. Optional +
 * additive: an absent block means the mechanic is simply OFF (same legacy-compat
 * convention as `flowers` / `reviveCircles`). Seconds in the doc, ticks in the
 * sim (converted once by `guardianRulesFromConfig`). See docs/guardian-tower.md
 * §5 for the derivation of every number.
 *
 * SEAM: `armor` / `magicResist` (structure mitigation) and `maxHitPctMaxHp`
 * (the per-packet clamp) are consumed by `combat/damage.ts` — owned by the
 * parallel combat wave — and are carried here + on StructureComp so that file
 * needs no further schema change. Until it wires them, a guardian takes
 * unmitigated damage exactly like the flower.
 */
export const zGuardianTowerConfig = z
  .object({
    /** base HP at round 1 */
    hpBase: z.number().positive(),
    /** HP scales by (1 + hpGrowthPerRound*(round-1)) */
    hpGrowthPerRound: z.number().min(0),
    /** structure armour (SEAM: read by combat/damage.ts) */
    armor: z.number().min(0),
    /** structure magic resist (SEAM: read by combat/damage.ts) */
    magicResist: z.number().min(0),
    /** body / collision radius (GGD units) */
    radius: z.number().positive(),
    /** hard cap on a single packet, as a fraction of maxHp (SEAM: combat/damage.ts) */
    maxHitPctMaxHp: z.number().min(0).max(1),

    /** seconds between volleys while awake */
    volleyPeriodSec: z.number().positive(),
    /** telegraph wind-up before a volley lands */
    volleyWindupSec: z.number().positive(),
    /** number of top-damagers marked per volley */
    volleyMarks: z.number().int().min(1),
    /** AoE radius around each stamped mark */
    volleyRadius: z.number().positive(),
    /** base per-mark damage at round 1 */
    volleyDamageBase: z.number().positive(),
    /** volley damage scales by (1 + growth*(round-1)) */
    volleyDamageGrowthPerRound: z.number().min(0),
    /** anti-stall ramp: volley n deals base × min(rampMax, 1 + rampPct*(n-1)) */
    volleyRampPct: z.number().min(0),
    volleyRampMax: z.number().min(1),
    /** seconds untouched before the guardian sleeps (threat + ramp reset) */
    dormancySec: z.number().positive(),

    /** gold paid to the last-hit killer */
    rewardGold: z.number().int().min(0),
    /** fraction of the killer's OWN maxHealth restored (0..1) — 滿血 = 1 */
    restoreHpPct: z.number().min(0).max(1),
    /** fraction of the killer's OWN maxMana restored (0..1) — 滿魔 = 1 */
    restoreManaPct: z.number().min(0).max(1),
    /** seconds the 鎮守之力 inherited-volley buff lasts */
    buffDurationSec: z.number().positive(),
    /** 鎮守之力 pulse damage as a fraction of the guardian's volley damage */
    heirPulsePct: z.number().min(0),
    /** 鎮守之力 pulse radius around the bearer */
    heirPulseRadius: z.number().positive(),
  })
  .strict();

export type GuardianTowerConfig = z.infer<typeof zGuardianTowerConfig>;

/** Contract defaults for the guardianTower block (dev cheats / fallbacks). */
export const DEFAULT_GUARDIAN_TOWER_CONFIG: GuardianTowerConfig = {
  hpBase: 1450,
  hpGrowthPerRound: 0.28,
  armor: 0,
  magicResist: 17.65,
  radius: 2.5,
  maxHitPctMaxHp: 0.15,
  volleyPeriodSec: 4.0,
  volleyWindupSec: 0.8,
  volleyMarks: 3,
  volleyRadius: 3.0,
  volleyDamageBase: 108,
  volleyDamageGrowthPerRound: 0.14,
  volleyRampPct: 0.15,
  volleyRampMax: 2.0,
  dormancySec: 6.0,
  rewardGold: 150,
  restoreHpPct: 1.0,
  restoreManaPct: 1.0,
  buffDurationSec: 25,
  heirPulsePct: 0.25,
  heirPulseRadius: 2.5,
};

/**
 * 陣亡投幣 (task #191) — a DEAD player may throw their unspent gold onto the
 * arena floor 100 at a time, and any passing champion picks it up. Optional +
 * additive: an absent block means the mechanic is simply OFF (same legacy-compat
 * convention as `flowers` / `reviveCircles` / `guardianTower`), which is what
 * every unit test and the client's prediction shadow world see.
 *
 * No seconds anywhere, so unlike the other three blocks there is no ticks
 * conversion — `coinRulesFromConfig` copies it straight through.
 */
export const zGoldDropConfig = z
  .object({
    /** gold per coin — deducted from the thrower, banked whole by the finder */
    coinValue: z.number().int().positive(),
    /** hard cap on throws per player per ROUND (the owner's 「最多 10 枚」) */
    coinsPerRound: z.number().int().min(1).max(255),
    /** radius of the 10-slot ring the coins land on, around the corpse */
    dropRadius: z.number().positive(),
    /** a living champion this close to a coin collects it */
    pickupRadius: z.number().positive(),
    /** the coin's own body radius (it collides with nothing; drives the model) */
    coinRadius: z.number().positive(),
  })
  .strict();

export type GoldDropConfig = z.infer<typeof zGoldDropConfig>;

/**
 * 傳說武器三選一的補抽規則 (GH#249) — what a weapon card does when its ELIGIBLE
 * POOL is genuinely smaller than `offerCount`.
 *
 * owner 2026-08-01:「傳說武器有時候只有跳出一個而不是三選一」. The reported bug
 * was NOT this block: `MatchController` rolled three and then dropped the ones
 * the operator whitelist did not enable, so a 49-entry pool with a stale
 * whitelist produced 1-card and 2-card draws at random. That is fixed by ORDER
 * (`sim/economy/draft.eligibleItemPool` now filters before the roll) and is not
 * switchable — a card silently losing entries is never a preference.
 *
 * What IS a preference is the leftover case: every gate has run and there really
 * are fewer than `offerCount` legal weapons left. Three answers, and the shipped
 * one is the conservative `short`; see `DEFAULT_ITEM_DRAFT_POLICY` in
 * `sim/economy/draft.ts` for why the other two each hand the player something
 * the content never promised.
 *
 * Optional: an absent block means the shipped policy, so every pre-GH#249 doc
 * (and `DEFAULT_ARENA_RULES`) keeps behaving exactly as it did.
 */
export const zItemDraftConfig = z
  .object({
    /**
     * 候選不足時怎麼辦。`short` = 就發幾張（出貨值，最保守）;
     * `fallback` = 從 `fallbackTable` 借; `duplicate` = 重複已抽到的補滿。
     */
    shortPoolMode: z.enum(["short", "fallback", "duplicate"]),
    /**
     * `fallback` 模式要借哪一張 loot table。空字串 = 沒有備援（於是等同 short）。
     * 64 chars is well past every shipped table id (`legendary-weapons` = 17);
     * the ceiling exists so a pasted paragraph cannot become a table id.
     */
    fallbackTable: z.string().max(64),
    /**
     * 一張卡最多抽幾次。Every draw removes an entry from its working pool, so
     * termination never depends on this — it bounds a mis-typed `offerCount`
     * and any future with-replacement mode. Floor 1 (a card must be allowed at
     * least one draw); ceiling 512, which catches 64 mis-typed as 640 while
     * still sitting an order of magnitude above the 49-entry shipped pool.
     */
    maxDraws: z.number().int().min(1).max(512),
    /**
     * 哪些 `craftRole` **不可以**被三選一發出去（owner 2026-08-04
     * 「49支可被隨機三選一 就好」）。
     *
     * 出貨值 `["token","service"]` —— 完整理由與它取代了什麼寫在
     * `sim/economy/offerEligibility.ts` 的 `DEFAULT_OFFER_EXCLUDED_CRAFT_ROLES`。
     * 一句話版：2026-08-04 之前 `component` 也在名單裡，而那道閘**只掛在
     * 傳說寶玉上**，免費武器卡沒有 —— 同一支合成原料免費卡發得出來、寶玉抽不到。
     * 現在兩條門讀同一份清單，而 `component` 被拿掉了（GGD 沒有合成系統，
     * 那個標記描述的是一個不存在的系統裡的角色）。
     *
     * ⚠️ **要把 `component` 關回去，在這裡加一個字串就好** —— 不用改程式、
     * 不用重建映像（`content/` 是 live bind-mount）。
     *
     * 省略 = 出貨值。上界 8 個成員 / 每個 32 字元：`craftRole` 今天只有四個值
     * (`final`/`component`/`quest`/`token`)＋`service`，8 是留給未來的餘裕，
     * 而不是一個可以貼進一整段文字的欄位（#277 的教訓：**欄位要有上界**）。
     */
    excludedCraftRoles: z.array(z.string().min(1).max(32)).max(8).optional(),
  })
  .strict();

export type ItemDraftConfig = z.infer<typeof zItemDraftConfig>;

/**
 * 71-00 暗夜契約 (owner 2026-07-30 re-design) — while a 暗夜契約 carrier fights
 * in a zone, EVERY champion death there (friend or foe) raises a 暗夜旗 that
 * radiates 黑夜靈氣; every flag is cleared at round end. Optional + additive: an
 * absent block means the mechanic is simply OFF (the same legacy-compat
 * convention as `flowers` / `reviveCircles` / `guardianTower` / `goldDrop`),
 * which is what every unit test and the client's prediction shadow world see.
 *
 * ⚠️ EVERY FIELD HERE IS A DECISION THE OWNER WILL WANT TO FLIP, and each has an
 * UPPER bound as well as a lower one — `validateField` only checked `min` until
 * 2026-07-29, which is how 50 typed as 500 used to sail through the admin form
 * and get silently clamped downstream (#277).
 */
export const zNightPactConfig = z
  .object({
    /**
     * WHICH 天生技 docs count as 暗夜契約. A LIST, not the single literal
     * `"godie-u00k.passive"`, for the reason `championPrices` taught us: one
     * hard-coded id means a re-id or a second hero with the same mechanic
     * silently disables the whole feature with no error anywhere.
     */
    abilityIds: z.array(z.string().min(1)).min(1).max(16),
    /**
     * BASE 黑夜靈氣 radius in sim units, BEFORE the combat-env `abilityRange`
     * factor (#136).
     *
     * ⚠️ THIS NUMBER IS NOT PORTED — it is a design choice, and it says so here
     * because a reader would otherwise assume fidelity. `A0HH` has an EMPTY
     * `area` column (`OBJECTS.json` → `"area": {}`), so the source map supplies
     * nothing. The shipped default is the ORDER OF MAGNITUDE the rest of this
     * content tree uses for a hero aura: 芬多精 `A0GM` is 4.58 (250 WC3 units),
     * 靈壓 `A0ID` is 9.17 (500), and 6.42 (350) is the modal `radius` among the
     * innate 天生技 docs in `content/abilities`. The 40 ceiling is the same
     * mis-parse guard `zAuraDef.radius` carries: the zone's `boundaryRadius` is
     * 24, so anything past 40 is a raw un-converted WC3 number.
     */
    auraRadius: z.number().positive().max(40),
    /**
     * WHO 黑夜靈氣 reaches. `owner` = only the unit carrying 暗夜契約 (死之王
     * himself); `team` = its whole team.
     *
     * ⚠️ THE OWNER DID NOT RULE ON THIS. The shipped default is the CONSERVATIVE
     * reading of 「帶來暗夜效果」 — the ubertip's 夜間 clauses are all about 死之王
     * — and it is a dropdown precisely so the answer costs one save.
     */
    beneficiary: z.enum(["owner", "team"]),
    /**
     * HOW SEVERAL FLAGS COMBINE. `max` = any number of overlapping flags is one
     * dose; `add` = they sum. A 12-champion massacre can leave a lot of banners
     * on one battlefield, so this is the difference between a flavour buff and
     * +600 % move speed — a real gameplay decision, hence a field.
     */
    stacking: z.enum(["max", "add"]),
    /** hard cap on simultaneously standing flags PER ZONE (0 would disable it) */
    maxFlagsPerZone: z.number().int().min(1).max(64),
    /** 移動速度提升 100% → 1.0 (a PercentAdd). The ubertip's own number. */
    msPercent: z.number().min(0).max(10),
    /** 生命回復速度提升 30 點 → a flat healthRegen. The ubertip's own number. */
    healthRegenFlat: z.number().min(0).max(500),
    /**
     * 「在死之王附近想施展技能的敵方單位有 12% 的機率魔力全失,並且受到傷害」.
     * NOT about the flag — it keys off proximity to a LIVING carrier.
     */
    manaBurn: z
      .object({
        enabled: z.boolean(),
        /** enemy casts within this distance of a living carrier are at risk */
        radius: z.number().positive().max(40),
        /** the ubertip's 12 % */
        chance: z.number().min(0).max(1),
        /**
         * TRUE damage on a successful proc.
         *
         * ⚠️ SHIPS AT 0 BECAUSE THE NUMBER DOES NOT EXIST. `A0HH`'s only two
         * data fields are `Def1`/`Def5` = 1.0, the NEUTERED damage-reduction
         * columns of its base `Aegr` (Elune's Grace, stock `AIdd`, `DataA1
         * 0.65`) — ×1.0 is "no reduction", not a damage value — and the rawcode
         * appears ZERO times in `war3map.j`. 0 is the honest encoding of
         * "unknown"; a made-up number would launder a guess into balance.
         */
        damage: z.number().min(0).max(10000),
      })
      .strict(),
  })
  .strict();

export type NightPactConfig = z.infer<typeof zNightPactConfig>;

/** Contract defaults for the nightPact block (dev cheats / fallbacks). */
export const DEFAULT_NIGHT_PACT_CONFIG: NightPactConfig = {
  abilityIds: ["godie-u00k.passive"],
  auraRadius: 6.42,
  beneficiary: "owner",
  stacking: "max",
  maxFlagsPerZone: 12,
  msPercent: 1.0,
  healthRegenFlat: 30,
  manaBurn: { enabled: true, radius: 6.42, chance: 0.12, damage: 0 },
};

/** Contract defaults for the goldDrop block (dev cheats / fallbacks). */
export const DEFAULT_GOLD_DROP_CONFIG: GoldDropConfig = {
  coinValue: 100,
  coinsPerRound: 10,
  dropRadius: 1.9,
  pickupRadius: 1.6,
  coinRadius: 0.31,
};

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

export const zConfigArenaRulesDoc = z
  .object({
    id: zId,
    schema: z.literal("config.arena-rules@1"),
    /** round from which R is learnable at any level; absent = classic 6/11/16 */
    ultUnlockRound: z.number().int().min(1).optional(),
    /**
     * Round from which champions that HAVE an `exAbility` unlock their per-hero
     * "EX 技能" (WC3 level-30 gate mapped to a late arena round). Absent = EX
     * never unlocks (skeleton/legacy behavior).
     */
    exUnlockRound: z.number().int().min(1).optional(),
    /** choices per offer (augment + weapon offers) */
    offerCount: z.number().int().min(1).max(5),
    /**
     * 傳說武器卡候選不足時的補抽規則 (GH#249); omit = the shipped `short`
     * policy. See {@link zItemDraftConfig} — and note that the whitelist
     * shrink owner reported is fixed by ordering, NOT by this block.
     */
    itemDraft: zItemDraftConfig.optional(),
    /**
     * 已退場的抽獎池 (owner 2026-08-01「第 2、5 回合改發棱彩傳說之後，那 13 支
     * 任務小飾品沒有任何回合排它＝拿不到。排回去還是退場? **=> 退場**」).
     *
     * ── 為什麼「退場」是一個欄位，而不是刪掉那張表 ─────────────────────────
     * 刪表是最大破壞的做法：`content/loot-tables/quest-rewards.json` 同時是
     * `starter.go` 的 DRAFT 白名單面 (`starterDraftItems`)、Go 側
     * `TestStarterDraftIsQuestSet` 的兩個方向、`arenaItemModel.test.ts` 的
     * DRAFT∩LEGENDARY 對照，以及後台 三選一抽獎池 分頁的一個可編輯文件。
     * 刪掉它會讓那 13 支道具從白名單消失（＝從圖鑑與後台一起消失），而 owner
     * 的裁決只說「不要再發給玩家」，沒有說「這些道具下架」。
     *
     * 所以退場的機械意義是**它不可以被任何回合排到**，而那正是這個欄位 +
     * 下面的 superRefine 在擋的事。表還在、道具還在白名單上、後台照樣編輯得到；
     * 要復活它是一個**看得見的兩步編輯**（把 id 從這裡拿掉），不是一次靜靜地
     * 把 `weaponLootTable` 打回去。
     *
     * ⚠️ 這是**列表不是布林**，理由和 `nightPact.abilityIds` 同源：寫死單一
     * 字面值 `"quest-rewards"` 的話，第二張要退場的表就得改程式。
     *
     * 上界 16：出貨樹只有 3 張 loot table，16 遠高於任何合理的退場清單，而且
     * 擋得住「把整份 items 清單貼進來」這種打錯。每一格的長度上界 64 與
     * `itemDraft.fallbackTable` 同一個數字（出貨最長的 id `legendary-weapons`
     * 是 17 個字元）。省略 = 沒有任何表退場（＝這個機制以前的行為）。
     */
    retiredLootTables: z.array(z.string().min(1).max(64)).max(16).optional(),
    /** round number (string key) -> grants for that round */
    rounds: z.record(z.string().regex(/^[0-9]+$/), zArenaRoundGrant),
    /** grants applied on every round PAST the highest `rounds` key */
    overflow: z
      .object({
        grantLevels: z.number().int().min(0),
        grantGold: z.number().int().min(0),
        /** extra gold per round beyond the table (escalates the late game) */
        grantGoldPerRound: z.number().int().min(0),
        /** augment offer tier on every overflow round (keeps 隨機三選一 literal) */
        augmentTier: zAugmentTier.optional(),
      })
      .strict()
      .optional(),
    /** legacy per-round free item gacha; omit to disable under arena rules */
    gacha: z
      .object({
        fromRound: z.number().int().min(1),
        lootTable: z.string().min(1),
      })
      .strict()
      .optional(),
    /** healing-flower rules; omit = no flowers (legacy behavior) */
    flowers: zFlowerConfig.optional(),
    /** revive-circle rules; omit = no revive circles (legacy behavior) */
    reviveCircles: zReviveCircleConfig.optional(),
    /** neutral guardian-tower rules; omit = no guardian (legacy behavior) */
    guardianTower: zGuardianTowerConfig.optional(),
    /** 陣亡投幣 rules (task #191); omit = dead players cannot throw gold */
    goldDrop: zGoldDropConfig.optional(),
    /** roguelite mob-wave rules (task #215); omit = no mobs (legacy behavior) */
    mobWaves: zMobWavesConfig.optional(),
    /** 71-00 暗夜契約 rules; omit = no 暗夜旗, no 黑夜靈氣, no mana burn */
    nightPact: zNightPactConfig.optional(),
  })
  .strict();

/**
 * config.combat-env@1 — the GLOBAL combat-environment multiplier table
 * (`config/combat-env.json`, task #28 admin 戰鬥系統). One multiplicative
 * factor per environment quantity; each factor is applied at exactly one sim
 * formula site (see `sim/combatEnv.ts` for the site table). 1.0 = neutral.
 * Keys are OPTIONAL (a sparse admin override is valid) and normalized onto
 * COMBAT_ENV_DEFAULTS via `normalizeCombatEnv` before entering the sim.
 * The key set is generated from the sim's COMBAT_ENV_KEYS, so the schema can
 * never drift from the engine.
 *
 * The NINE 三圍 coefficients (`strToMaxHealth` … — eight from #248, plus
 * `intToMagicResist` from GH#221) ride the same table but are COEFFICIENTS, not
 * ×factors: their neutral value is the shipped WC3-or-owner number (23 hp per
 * strength point, 0.6 魔抗 per intelligence point), not 1.0, and their legal band
 * is 0..100 — which is why `zEnvFactor` has always allowed 100 and why an omitted
 * coefficient falls back to `defaultForKey`, never to 1.0.
 *
 * ⚠️ NOTHING IS ADDED HERE WHEN A KEY IS ADDED. The Zod object is BUILT from
 * `COMBAT_ENV_KEYS`, so `.strict()` starts accepting the new key the moment the
 * sim declares it. That is the design — but it also means this file cannot be
 * the place a reviewer checks to see whether the key landed; the sim's
 * COMBAT_ENV_KEYS is.
 */
const zEnvFactor = z.number().min(0).max(100);

/**
 * 金錢發放倍率 (owner 2026-08-04) get a TIGHTER ceiling than the shared 0..100.
 * 100 is the band the 三圍 coefficients need (23 hp per STR); for a payout
 * factor it is 「一隻殭屍給你一整套裝備」, i.e. exactly the #277 shape — a
 * mistyped digit that the console happily accepts and the sim happily obeys.
 * Mirrors GOLD_FACTOR_MIN/MAX in the sim and `combatenv.Bounds` in the Go
 * platform; all three must agree or one of them is lying about what is legal.
 */
const zGoldEnvFactor = z.number().min(GOLD_FACTOR_MIN).max(GOLD_FACTOR_MAX);

/**
 * 2026-08-10 的三格 (`moveSpeedMelee` / `moveSpeedRanged` / `magicResistMult`)
 * 拿的是**平台一直在用的 ×倍率區間**（`combatenv.MinFactor/MaxFactor`
 * 與後台 `MAX_FACTOR`），不是上面那個 0..100。0..100 存在是因為 三圍 係數需要
 * （23 hp / STR），而十八格既有 ×倍率一路沾光沾到今天 —— 反過來把它們全部收緊
 * **不是 no-op**（`manaRegen` 出貨 8，同一批 owner 要調到 16），所以那是一次有
 * 傷亡名單的決定，屬於 owner，不屬於這一條 lane。新的三格先拿對的區間。
 * 推導寫在 `sim/combatEnv.ts` 的 `FACTOR_BAND_MIN`。
 */
const zBandedEnvFactor = z.number().min(FACTOR_BAND_MIN).max(FACTOR_BAND_MAX);

export const zCombatEnvMultipliers = z
  .object(
    Object.fromEntries(
      COMBAT_ENV_KEYS.map((k) => [
        k,
        (isGoldEnvKey(k)
          ? zGoldEnvFactor
          : isBandedFactorEnvKey(k)
            ? zBandedEnvFactor
            : zEnvFactor
        ).optional(),
      ]),
    ) as Record<CombatEnvKey, z.ZodOptional<z.ZodNumber>>,
  )
  .strict();

export const zConfigCombatEnvDoc = z
  .object({
    id: zId,
    schema: z.literal("config.combat-env@1"),
    /** monotonically bumped by the admin console on every published change */
    version: z.number().int().min(1),
    /** env-key -> factor; omitted keys mean 1.0 (neutral) */
    multipliers: zCombatEnvMultipliers,
  })
  .strict();

/**
 * config.base-bonus@1 — 基礎加成 (`config/base-bonus.json`): a FLAT grant added
 * to every champion's final stat, AFTER the combat-env multiplier and therefore
 * NOT scaled by it. owner 2026-07-28:「初始HP/MP/AP/AD/... 增加數值也要放到後台
 * 設定 並且不參與倍率計算」.
 *
 * ⚠️ 為什麼是自己一份文件,不是塞進 `config.combat-env@1`。那份文件的每個 key 都
 * 是**倍率**,而這裡每個 key 都是**加數**。合在一起的話,後台一個表格裡會有兩種
 * 語意相反的欄位共用同一種外觀 —— 把 300 打進倍率欄位是 300 倍傷害。
 *
 * 語意見 sim/baseBonus.ts。未列的 stat = 0(沒有贈禮),不是「沿用預設」。
 *
 * ⚠️ 每個 stat 都有**自己的區間** (task #277),和 combat-env 的 per-key bounds
 * 同一個形狀。舊版只有 `z.number().finite()`,於是 `maxHealth: -9999` 是一份
 * 完全合法的文件 —— 全 115 位英雄開場即死,而且三層(頁面/schema/sim)沒有一層
 * 會說話。區間本身定義在 `sim/baseBonus.ts`(`baseBonusBounds`),schema 這一層
 * 只是把它搬到 Zod 上,所以兩邊不可能漂走。
 *
 * 未知的鍵仍然被接受(`.catchall`,只要是有限數字)並在 `normalizeBaseBonus`
 * 被丟掉 —— 這維持了改版前的容忍度:一個打錯的 key 不該讓整棵內容樹載不起來。
 */
const zBaseBonusTable = z
  .object(
    Object.fromEntries(
      ALL_STATS.map((s) => {
        const [lo, hi] = baseBonusBounds(s);
        return [s, z.number().finite().min(lo).max(hi).optional()];
      }),
    ) as Record<Stat, z.ZodOptional<z.ZodNumber>>,
  )
  .catchall(z.number().finite());

export const zConfigBaseBonusDoc = z
  .object({
    id: zId,
    schema: z.literal("config.base-bonus@1"),
    /** stat key ("maxHealth" / "ad" / "ap" …) -> flat grant. 缺鍵 = 0。 */
    bonus: zBaseBonusTable,
  })
  .strict();

/**
 * config.per-level-bonus@1 — **每級加成**（`config/per-level-bonus.json`）。
 *
 * owner 2026-08-13：「我追加一個設定，**英雄每等級都會 +1 AP**，
 * 這個參數一樣可在後台設定」。
 *
 * ⚠️ 為什麼不塞進 `config.base-bonus@1`：那一份每格是**一個數**（一次性加數），
 * 這一份每格是**一對**（數量 + 給誰）。兩種語意共用一張表，操作者沒有線索分辨
 * 他填的 1 是「+1」還是「每級 +1」—— 和 stat-caps 當初分家的理由逐字相同。
 *
 * 語意見 `sim/baseBonus.ts` 的 `PerLevelBonus`。缺文件 = 出貨預設（法強每級 +1，
 * 給每一位），缺鍵 = 那條屬性沒有每級加成。
 */
export const zPerLevelBonusEntry = z
  .object({
    /** 每一級加多少。⚠️ 上界 100 是保險絲：99 級時那就是 +9,800。 */
    amount: z.number().finite().min(PER_LEVEL_BONUS_MIN).max(PER_LEVEL_BONUS_MAX),
    /**
     * 給誰。⭐ `nonPrimary` 存在的理由：扁平加成會**壓平定位差距**
     * （實測 +1 AP/級讓法師/坦克的 AP 比從 1.74 掉到 1.48），
     * 想補償非法師又不想壓平法師時就用它。
     */
    appliesTo: z.enum(["all", "primary", "nonPrimary"]),
  })
  .strict();

export const zConfigPerLevelBonusDoc = z
  .object({
    id: zId,
    schema: z.literal("config.per-level-bonus@1"),
    note: z.string().optional(),
    /** stat key → { amount, appliesTo }。缺鍵 = 那條沒有每級加成。 */
    perLevel: z.record(z.string(), zPerLevelBonusEntry),
  })
  .strict();

/**
 * config.stat-caps@1 — 屬性上限 (`config/stat-caps.json`, GH#286): 每條屬性的
 * **一般上限** 與 **解鎖上限**。owner 2026-07-28:「一般上限是 4.0,搭配特殊條件
 * 如技能、道具...等效果,可以解鎖最多到 10.0。這兩個參數也可以放到後台設定」.
 *
 * ⚠️ 又是一份自己的文件,理由和 `config.base-bonus@1` 一樣但更強:這裡每個 key
 * 的值是一個**上限對**,而 combat-env 是倍率、base-bonus 是加數。三種語意共用一張
 * 表格的話,操作者沒有任何線索分辨他填的 4.0 是「四倍」「+4 點」還是「天花板」。
 *
 * 語意見 sim/statCaps.ts。**缺文件 = 出貨預設**(攻速 4.0 / 10.0、法強 100000
 * 開到頂),缺鍵 = 那條屬性退回 `STAT_CLAMPS` 的上界而且不可解鎖。
 *
 * ⚠️ 2026-08-01 補上**兩端的界**。這兩個欄位在此之前只有 `z.number().finite()`,
 * 也就是 CLAUDE.md 2026-07-29 點名的那個缺陷的最純粹版本:上界下界都沒有。
 * 界分兩層:
 *   · `zStatCap` 自己 —— 全屬性通用的最寬合法帶 `[0, STAT_CAP_CEILING]`,
 *     連 `catchall` 收到的未知 key 都套得到,所以「兩端都有界」沒有例外。
 *   · `.superRefine` —— 認得的 stat key 再收緊到 `statCapBounds(stat)`
 *     (下界是那條屬性 `STAT_CLAMPS` 的**地板**:比地板還低的天花板不是更嚴格的
 *     上限,而是地板無條件獲勝、這一格完全失效)。
 * 這一層擋的是打錯,不是平衡:每一條上界都遠高於出貨內容打得到的值,見
 * sim/statCaps.ts 的 `STAT_CAP_MAX`。
 */
export const zStatCap = z
  .object({
    /** 沒有解鎖來源時的上限 */
    base: z.number().finite().min(0).max(STAT_CAP_CEILING),
    /** `ModOp.CapRaise` 最多能抬到的硬上限(小於 base 會被讀成 base) */
    unlocked: z.number().finite().min(0).max(STAT_CAP_CEILING),
  })
  .strict();

/** 一條屬性自己的那一對,收緊到 `statCapBounds(stat)`。 */
function zStatCapFor(stat: Stat): typeof zStatCap {
  const [lo, hi] = statCapBounds(stat);
  const n = z.number().finite().min(lo).max(hi);
  return z.object({ base: n, unlocked: n }).strict();
}

/**
 * ⚠️ 形狀刻意和 `zBaseBonusTable` 一樣(逐 stat 一格 + `catchall`),**不是**
 * `.superRefine`:`zConfigDoc` 是 `z.discriminatedUnion`,而 discriminated union
 * 的成員必須是 ZodObject —— 一個 `.superRefine` 會把這份 schema 變成 ZodEffects,
 * 整個 config 聯集當場失效。界要下在**值**上,不能下在文件上。
 */
export const zStatCapsTable = z
  .object(
    Object.fromEntries(ALL_STATS.map((s) => [s, zStatCapFor(s).optional()])) as Record<
      Stat,
      z.ZodOptional<typeof zStatCap>
    >,
  )
  // 未知的 key 仍然吃通用帶(兩端都有界)。它進不了遊戲 —— `normalizeStatCaps`
  // 只讀 `CAPPABLE_STATS` —— 但一份文件不該因為一個 typo 而變成無界。
  .catchall(zStatCap);

export const zConfigStatCapsDoc = z
  .object({
    id: zId,
    schema: z.literal("config.stat-caps@1"),
    /** stat key ("as" / "ap" / "ms" / "cdr" …) -> { base, unlocked } */
    caps: zStatCapsTable,
  })
  .strict();

/**
 * config.combat-feel@1 — 戰鬥手感 (`config/combat-feel.json`, GH#193):
 * 擊退法則的三個參數 + 打就站定的開關與門檻。語意與出貨預設見 sim/combatFeel.ts。
 *
 * ⚠️ 為什麼又是一份自己的文件(現在 config 底下已經有四份「調參」文件):
 *   · combat-env  每格是**倍率**(1.0 = 不變)
 *   · base-bonus  每格是**加數**(0 = 沒有贈禮)
 *   · stat-caps   每格是一對**天花板**
 *   · combat-feel 每格是一條**規則的參數**(比例門檻 / 身位數 / 布林開關)
 * 混在一起的話,操作者沒有任何線索分辨他填的 0.05 是「打五折」「+0.05 點」
 * 「上限 0.05」還是「5% 的門檻」。
 *
 * **缺文件 = 出貨預設**(擊退 0.05/10/1.0、站定全開),不是空表。
 */
export const zConfigCombatFeelDoc = z
  .object({
    id: zId,
    schema: z.literal("config.combat-feel@1"),
    knockback: z
      .object({
        /** 傷害 / 受傷單位最大生命 低於此比例 → 完全不擊退 */
        minPct: z.number().min(0).max(1),
        /** 一擊打掉 100% 生命時的擊退身位數 */
        maxBodies: z.number().min(0).max(100),
        /** 一個身位 = 多少 GGD 單位 */
        bodyUnit: z.number().min(0).max(100),
        /**
         * 決策點:技能授權的位移(擊退/擊飛/衝刺)遇上傷害驅動的擊退時誰贏。
         * ABSENT = 出貨預設 true(技能贏)。false = 傷害無條件蓋掉 —— 那是這條
         * 缺陷被修之前的行為,而它讓每一支「又打又推」的技能的擊退全滅。
         * 完整理由見 `sim/combatFeel.ts` 的 `damageShoveWins`。
         */
        authoredWins: z.boolean().optional(),
        /**
         * 決策點(只在 `authoredWins` 開著時有意義):傷害驅動的擊退推得更遠時
         * 要不要接管。ABSENT = 出貨預設 false。
         * ⚠️ true 那一側會讓拉近系(`from: "pull"`)的技能在傷害夠大時把目標
         * 往反方向推出去。
         */
        longerDamageWins: z.boolean().optional(),
        /**
         * ⭐ 擊飛四檔落點(GH#301-1)的兩段長度 + 「到底部」指哪個邊緣。
         * 語意與出貨預設(3 / 12 / true)全部寫在 `sim/combatFeel.ts` 的
         * `KnockbackRules`。ABSENT = 出貨預設。
         *
         * ⛔ 它們**不可以**是 `effects/knockback.ts` 裡的常數:四檔是列舉(作者
         * 選哪一檔),但一檔多遠是操作者每週會改的數字(第一守則)。
         */
        launchShortUnits: z.number().min(0).max(100).optional(),
        launchLongUnits: z.number().min(0).max(100).optional(),
        launchEdgeUsesFireRing: z.boolean().optional(),
      })
      .strict()
      .optional(),
    standstill: z
      .object({
        /** 總開關;false = 維持舊行為(邊走邊打) */
        enabled: z.boolean(),
        /** 「有在動」與「正在靠近」共用的速度門檻 (units/sec) */
        walkEps: z.number().min(0).max(100),
        /** 小怪(含殭屍王)是否同樣受約束 */
        applyToMobs: z.boolean(),
      })
      .strict()
      .optional(),
    /**
     * 玩家**自己點名**的攻擊目標，對上系統的自動索敵 (GH#266)。語意、量到的數字
     * 與出貨預設全部寫在 `sim/combatFeel.ts` 的 `ManualOrderRules`。
     *
     * ⚠️ 為什麼是欄位不是一行修正：#274 的「地面指令取代攻擊指令」在**滑鼠**上
     * 是對的（WC3 / LoL 都這樣），右鍵一次點擊只送一條指令。壞掉的是把同一條規則
     * 套到**連續轉向**上 —— 搖桿每一拍都送一條 `move`，那不是「我要取消攻擊」而是
     * 「我正在走路」，於是手選目標的壽命是 1 tick（33 ms）。sim 分不出這兩者，
     * 所以選擇權交給 owner。
     *
     * ABSENT ⇒ `DEFAULT_MANUAL_ORDER`（撐得過移動指令、不限制牽引距離）——
     * 也就是 owner 2026-08-03 明說的那一側，**不是**今天的行為。
     */
    manualOrder: z
      .object({
        /**
         * true（出貨）= 玩家點名的那一隻撐得過一條移動指令：走位照走，打的還是
         * 他指的那一個。false = #274 的原行為（右鍵地面取消攻擊指令）。
         * 只管 `kind:"move"`；A 移動（attackMove）兩側都一律取代手選目標。
         */
        survivesGroundMove: z.boolean(),
        /**
         * 手選目標的**牽引距離**（單位）；`0`（出貨）= 不限制，對應 owner 的
         * 「永遠」。競技場半徑 24，所以 24 以上實務上等同不限制；上界 200 純粹
         * 是擋「24 打成 2400」那種手滑 —— 一個荒謬的牽引距離不會有任何錯誤訊息，
         * 只會讓這一格看起來沒作用（#277 的形狀）。
         */
        leashUnits: z.number().min(0).max(200),
      })
      .strict()
      .optional(),
    /**
     * 手把／觸控的**自動**瞄準：一堆殭屍擋在敵方英雄前面時該鎖誰（GH#315）。
     *
     * ⚠️ 這是 2026-08-11 那個 T0 的另一半。修好「殭屍點得到」之後，同一份可點選
     * 清單也餵給 `pickNearestUnit` —— 少了這個懲罰，貼臉的殭屍會把瞄準從敵方
     * 英雄身上搶走，那是把一個缺陷換成另一個。
     *
     * ⛔ **只有自動索敵讀它。** 滑鼠直接點刻意不讀 —— 點到誰就是誰。
     * 語意與出貨預設寫在 `sim/combatFeel.ts` 的 `AimAssistRules`。
     */
    aimAssist: z
      .object({
        /**
         * 小怪被扣的「等效距離」（單位）。出貨 **6** =「殭屍要比英雄近 6 個單位
         * 以上才搶得走瞄準」。0 = 不讓路（＝GH#315 修好之前那個被殭屍海淹沒的
         * 行為）。上界 24 = 決鬥區半徑，再高等於「小怪永遠不會被自動瞄準」。
         */
        mobPenalty: z
          .number()
          .min(AIM_ASSIST_MOB_PENALTY_MIN)
          .max(AIM_ASSIST_MOB_PENALTY_MAX),
      })
      .strict()
      .optional(),
    /**
     * 面向鎖的窗口長度 (#264 / #275 / #280)。語意與出貨預設見
     * `sim/combatFeel.ts` 的 `FacingRules`。
     *
     * ⚠️ 這裡**沒有** `aimHoldTicks`,那是刻意的 —— 見 `sim/aimHold.ts` 檔頭:
     * 客戶端預測沒有任何 config 通道,把瞄準沿用窗口做成可調會讓預測與權威用
     * 不同的窗口,自己的角色面向會和伺服器長期不同意。
     */
    facing: z
      .object({
        /** 出手後的收招餘韻 tick 數 (30 tick = 1 秒) */
        followThroughTicks: z.number().int().min(0).max(300),
        /** 瞬發技的最低鎖定 tick 數 */
        instantCastTicks: z.number().int().min(0).max(300),
      })
      .strict()
      .optional(),
    /**
     * 卡住就接敵 (GH#216)。語意與出貨預設見 `sim/combatFeel.ts` 的
     * `AutoEngageRules` —— 那裡有量到的數字(近戰索敵 6 / 射程 1.6 的四倍落差、
     * 右鍵點進柱子之後 |v| = 0.00 連續 2,240 tick)。
     *
     * ⚠️ `seekRadius` **不是平常的索敵半徑**。把它當成「自動攻擊範圍」調大並不會
     * 讓**走得動**的玩家自動衝過去 —— 那條路徑一格都沒有被動到(見
     * `systems/OrderSystem.ts` 的 `autoEngageActive`)。
     *
     * ⚠️ 它現在有**兩個**入口(2026-07-31):走位卡住(一直都有),以及站著不動
     * (`idleSeeks`,出貨關著)。所以「只在走位卡住時生效」這句話只在
     * `idleSeeks: false` 時才成立 —— 那是出貨值。
     */
    autoEngage: z
      .object({
        /** 總開關;false = 移動指令期間絕不接手(#274 的行為) */
        enabled: z.boolean(),
        /** 連續幾個 tick 走不動才算卡住 (30 tick = 1 秒) */
        stallTicks: z.number().int().min(1).max(600),
        /** 「走不動」的速度門檻 (units/sec),和 standstill.walkEps 同一個量 */
        stallSpeed: z.number().min(0).max(100),
        /** 卡住之後的索敵半徑(單位);bot 的 AI_ENGAGE_RANGE 是 48 */
        seekRadius: z.number().min(0).max(200),
        /**
         * **決策點**(2026-07-31 W4):站著不動的玩家要不要也吃 `seekRadius`。
         *
         * 出貨 `false` = 今天的行為。索敵半徑目前是**不對稱**的 ——「走位卡住」
         * 的人吃 `seekRadius`(48),「完全站著不動」的人只吃近戰地板 6,也就是
         * 卡住比站著更容易索到敵。實測 `autoAcquireWhileMoving.test.ts` 的
         * `[idle]` 情境:整場 2,410 tick 沒有任何敵方英雄靠到 14.95 單位以內,
         * 所以那個座位 0 次索敵、0 次揮擊。
         *
         * `true` = 站著不動的人也吃 `seekRadius`,手感等同全員預設 A 移動:
         * 什麼都不按也會自己走過去打人,代價是玩家放手時方向盤不在他手上。
         * 這是**平衡決策不是缺陷修正**,所以預設留在今天那一側,由 owner 決定。
         *
         * ⚠️ 需要總開關 `enabled` 也開著 —— `enabled: false` 承諾的是「完全回到
         * #274 的行為」,獨立生效會讓那句話變成謊話。
         */
        idleSeeks: z.boolean(),
        /**
         * true(出貨)= 玩家每送出一條新的移動指令,走位權當場還給他。
         * 搖桿/虛擬搖桿每一拍都送一條,所以推著搖桿的人永遠不會被接管;
         * 滑鼠右鍵一次只送一條,點進柱子之後才會觸發接敵。
         * 關掉會回到「上鎖之後不放手」的行為(實測 86.6% 的走位 tick 被搶走)。
         */
        respectLiveSteering: z.boolean(),
        /**
         * true(出貨)= 硬控(定身/昏迷/擊倒/施法鎖/hitstop)的 tick **不算**
         * 走位卡住,計數凍結在原地。
         *
         * 掃出貨內容量到:86 支帶 root/stun 的 `applyStatus`,其中 47 支持續
         * ≥ 1 秒,最長 4 秒 = 120 tick —— 是 `stallTicks` 的四倍。關掉這一格,
         * 一個被定身 1 秒以上的玩家會被判定成「走位卡住」,走位權被追擊搶走,
         * 解控之後角色往反方向跑。
         *
         * ⚠️ 不要用「把 stallTicks 調大到 120」代替它:那會讓真的卡在柱子上的
         * 玩家等四秒才被救。
         */
        ccPausesStall: z.boolean(),
      })
      .strict()
      .optional(),
  })
  .strict();

/**
 * config.ambient-vfx@1 — AMBIENT vfx bindings (`config/ambient-vfx.json`):
 * per-model attachments that live while the entity lives (WC3 hero glows,
 * smolder trails, ribbon wings). Each binding names a `vfx` doc id from the
 * vfx collection (vfx@1 particle or ribbon@1 trail); the anchor bone lives ON
 * the vfx/ribbon doc itself, not the binding. Consumed by the client's
 * AmbientVfx channel; unknown modelKeys/doc ids degrade to no-ops.
 */
export const zAmbientVfxBinding = z
  .object({
    /** vfx-or-ribbon doc id in the vfx collection (SOFT: may be unauthored) */
    vfx: z.string().min(1),
  })
  .strict();

/**
 * 場地環境火焰 —— `dressArena` 掛在競技場布景道具上的常駐火焰粒子。
 *
 * owner 2026-08-01 實戰回饋：「場地天空火焰很礙眼 請全部場地都去掉」(GH#251)。
 * 出貨值因此是 `enabled: false`。**程式碼沒有被刪掉**：這是一個「要不要有環境
 * 火」的決策點，不是一個 bug，所以它是一格開關而不是一次刪除 —— owner 改主意時
 * 只要把這一格打開就好，不必再改程式碼＋重新部署一次（CLAUDE.md 第一守則）。
 *
 * `models` 是「哪些布景道具會冒火」：值是對 decor `model` 路徑做**子字串**比對，
 * 也就是 `dressArena` 原本寫死的那個 `d.model.includes("torch")`。清單留空 =
 * 沒有任何道具冒火（等同關閉），這是刻意的：一個空清單讀起來就是「沒有東西該
 * 冒火」，不需要第二種語意。
 */
export const zArenaFire = z
  .object({
    /** 總開關。false = `dressArena` 一個火焰粒子系統都不建立。 */
    enabled: z.boolean(),
    /**
     * 會冒火的 decor 模型（對 `model` 路徑做子字串比對，例如 `"torch"` 命中
     * `assets/models/props/torch.glb` 與 `torch_mounted.glb`）。
     * 上限 8 條是為了讓「哪些道具會冒火」還是一件看得懂的事；每一條上限 64 字
     * 擋掉把整份路徑清單黏成一條字串貼進來的誤填。
     */
    models: z.array(z.string().min(1).max(64)).max(8),
    /**
     * 整張場地最多幾個火焰粒子系統。出貨的 skeleton / castle / colosseum 各有
     * 16 個火把，所以 16 是「全部點燃」；上限 64 擋掉把 16 打成 160/1600 這種
     * 誤填（每一個都是一組獨立的 ParticleSystem + 一張貼圖）。
     */
    maxEmitters: z.number().int().min(0).max(64),
    /** 每個火焰每秒噴幾顆粒子。上限 200 擋掉把 18 打成 180/1800。 */
    emitRate: z.number().min(0).max(200),
    /**
     * 火焰粒子大小的倍率（1 = 原本的 0.3–0.6 世界單位）。上限 4 擋掉把「倍率」
     * 當成「百分比」填 100 的那種誤填 —— 4 倍已經是一顆比英雄還高的火球。
     */
    sizeScale: z.number().min(0.05).max(4),
  })
  .strict();

export const zConfigAmbientVfxDoc = z
  .object({
    id: zId,
    schema: z.literal("config.ambient-vfx@1"),
    /** modelKey -> ambient attachments applied while an entity uses the model */
    bindings: z.record(z.string().min(1), z.array(zAmbientVfxBinding)),
    /** 場地布景道具的常駐火焰（GH#251）。缺席 = 用 `DEFAULT_ARENA_FIRE`。 */
    arenaFire: zArenaFire.optional(),
  })
  .strict();

/**
 * config.audio-map@1 — CLIENT audio bindings (`config/audio-map.json`):
 * scene → background-music track, and gameplay/UI event → SFX clip pool.
 * Consumed by the client's `audio/AudioSystem` (plain WebAudio, no Babylon):
 * `bgm` keys are scene names (menu/lobby/room/champSelect/intermission/
 * combat/fireRing/settlement + the one-shot stings battleStart/victory/
 * defeat), `sfx` keys are event names (the MSG.EVENT whitelist plus
 * client-only UI moments like `champSelectConfirm`). Both maps are OPEN
 * records: an unknown scene/event is simply silent, and a file that 404s is a
 * no-op — audio never throws into the frame loop.
 */
const zAudioAssetPath = z
  .string()
  .min(1)
  .regex(/^assets\//, "audio path must be relative to content/ and start with assets/");

export const zAudioBgmTrack = z
  .object({
    /** path under content/, e.g. "assets/audio/bgm/combat.mp3" */
    file: zAudioAssetPath,
    /** true = seamless loop (the file is loop-joined); false = one-shot sting */
    loop: z.boolean(),
    /** per-track gain multiplier applied on top of the BGM bus (default 1) */
    gain: z.number().min(0).max(4).optional(),
  })
  .strict();

export const zAudioSfxEntry = z
  .object({
    /** clip pool — one file is picked at random per trigger */
    files: z.array(zAudioAssetPath).min(1),
    /** per-event gain multiplier applied on top of the SFX bus (default 1) */
    gain: z.number().min(0).max(4).optional(),
    /** minimum ms between two plays of this event (bursts are dropped) */
    cooldownMs: z.number().min(0).optional(),
    /** max simultaneously-playing voices for this event */
    maxConcurrent: z.number().int().min(1).optional(),
  })
  .strict();

export const zConfigAudioMapDoc = z
  .object({
    id: zId,
    schema: z.literal("config.audio-map@1"),
    /** scene name -> background-music track */
    bgm: z.record(z.string().min(1), zAudioBgmTrack),
    /** event name -> SFX clip pool + throttling */
    sfx: z.record(z.string().min(1), zAudioSfxEntry),
  })
  .strict();

/**
 * config.champion-voices@1 — per-CHAMPION voice bindings
 * (`config/champion-voices.json`): the clip pool played when the player clicks
 * their own hero in battle. `select` lists w3x map quip clips extracted for
 * that champion (`source: "map-quip"`); champions with no map quip get an
 * empty pool (`source: "none"`) plus a `soundset` hint — the WC3 unit
 * soundset name the blizzard-local overlay can resolve to Blizzard click
 * lines on machines that staged `content/assets/blizzard-local/`. Missing
 * clips / null soundsets degrade to silence — never an error.
 */
export const zChampionVoiceEntry = z
  .object({
    /** click-quip clip pool, e.g. ["assets/audio/sfx/pikakill.mp3"] */
    select: z.array(zAudioAssetPath),
    /** where the pool came from: extracted map quips, or nothing authored */
    source: z.enum(["map-quip", "none"]),
    /** WC3 soundset name (blizzard-local overlay fallback hint) or null */
    soundset: z.string().min(1).nullable(),
  })
  .strict();

export const zConfigChampionVoicesDoc = z
  .object({
    id: zId,
    schema: z.literal("config.champion-voices@1"),
    /** championId -> voice entry (every champion doc gets exactly one) */
    champions: z.record(zId, zChampionVoiceEntry),
  })
  .strict();

/**
 * config.unit-tints@1 — the w3x VERTEX-COLOUR PORTING LEDGER
 * (`config/unit-tints.json`, task #49).
 *
 * The champion-facing half of the port lives on the champion docs themselves
 * (`champion.tint` / `champion.alpha`) — that is what the renderer reads. This
 * doc is the COMPLETE extract, and exists because the map tints things GGD has
 * no collection for:
 *
 *   • `units` — every w3x unit whose effective art colour is non-neutral,
 *     keyed by its 4-char rawcode. The 20 that became champions carry
 *     `championId` and MUST agree with that champion doc (regression-tested);
 *     the other 32 are creeps/summons/bosses with no GGD doc yet, and this is
 *     the only place their colour survives until they are modelled.
 *   • `transient` — runtime `SetUnitVertexColorBJ` states a CHAMPION takes on
 *     during a buff (Berserker's red rage) and the restore that ends it. Not
 *     yet driven by the sim; recorded with its `war3map.j` line so the buff
 *     phase can wire it without re-reading the map. Two restores are flagged
 *     `erasesStaticTint` — original-map BUGS that reset the hero to white and
 *     destroy its identity tint for the rest of the match; the port must
 *     restore to `champion.tint`, never to white.
 *
 * Nothing here is read by the sim. Dummy-effect/missile unit tints are
 * deliberately OUT of scope (task #50 owns per-invocation VFX art params).
 */
export const zUnitTintEntry = z
  .object({
    /** the champion doc this w3x unit became; absent = no GGD doc yet */
    championId: zRef("champions").optional(),
    /** the unit's map name (context for a bare rawcode) */
    name: z.string().min(1),
    /** effective vertex-colour multiply; see `zTintRgb` */
    tint: zTintRgb.optional(),
    /** effective opacity; absent = 1 (every static w3u entry is opaque) */
    alpha: zAlpha.optional(),
    /**
     * `w3u-static`  — explicit `uclr/uclg/uclb` mods in `war3map.w3u`;
     * `w3u-base-inherited` — no mods of its own; the colour comes from the
     *                   entry's BASE, which is itself a `war3map.w3u` entry
     *                   (custom OR original table). #49 had no such step and
     *                   lost `U00L` (北斗之鼠) because of it — see task #263;
     * `slk-inherited` — no mods anywhere in the w3u chain; the colour comes
     *                   from the stock `Units\UnitUI.slk` row (43 units here).
     */
    source: z.enum(["w3u-static", "w3u-base-inherited", "slk-inherited"]),
    /** where the number came from, in enough detail to re-derive it */
    evidence: z.string().min(1),
  })
  .strict();

export const zUnitTintState = z
  .object({
    /** champion that takes on this state */
    championId: zRef("champions"),
    /** JASS trigger function the call lives in */
    trigger: z.string().min(1),
    /** line in the UNPROTECTED `GoDieEX22s-src/raw/war3map.j` */
    line: z.number().int().positive(),
    /** what the state is (ability name / "restore") */
    note: z.string().min(1),
    tint: zTintRgb.optional(),
    alpha: zAlpha.optional(),
    /**
     * true = the ORIGINAL MAP restores to white here and permanently erases
     * the champion's static tint. Do NOT reproduce: restore to `champion.tint`.
     */
    erasesStaticTint: z.boolean().optional(),
  })
  .strict();

export const zConfigUnitTintsDoc = z
  .object({
    id: zId,
    schema: z.literal("config.unit-tints@1"),
    /** w3x unit rawcode (4 chars, case-sensitive) -> permanent colour */
    units: z.record(z.string().regex(/^[A-Za-z0-9]{4}$/, "w3x rawcode"), zUnitTintEntry),
    /** runtime buff-state colours, in `war3map.j` line order */
    transient: z.array(zUnitTintState),
  })
  .strict();

/**
 * config.gore@1 — the 濺血 STYLE KNOB (`config/gore.json`, task #39).
 *
 * The roster puts Pikachu, 初音 and 妙蛙種子 next to 死亡騎士 and 鋼彈, so how
 * bloody a landed hit sprays is an art/tone decision and belongs in content:
 *   • `style` — "blood" (red droplets + mist + a fading ground pool; the
 *     shipped default), "stylized" (a damage-type-tinted energy burst, no red
 *     and no ground pool) or "off" (the layer emits nothing at all).
 *   • `intensity` — 0..1, scales droplet counts, sizes and splat opacity.
 *   • `championStyles` — narrows the style for individual champions, so
 *     mechanical / undead / plant champions spray sparks or ichor, not blood.
 *
 * Consumed by the client's `vfx/goreConfig`, where a per-champion entry may
 * only ever REDUCE gore and the player's own setting is a hard floor — which
 * is why "blood" is not an accepted per-champion value. An absent doc leaves
 * the shipped default (blood @ 0.85). Purely presentational: never enters the
 * sim, never affects a damage number.
 */
export const zGoreStyle = z.enum(["blood", "stylized", "off"]);

export const zConfigGoreDoc = z
  .object({
    id: zId,
    schema: z.literal("config.gore@1"),
    /** global spray style */
    style: zGoreStyle,
    /** 0..1 spray density / opacity multiplier */
    intensity: z.number().min(0).max(1),
    /**
     * championId -> narrowed style (may only reduce gore, never add it).
     * SOFT by construction: a key naming a champion that no longer exists
     * simply never matches, so this table can never break a content build.
     */
    championStyles: z.record(zId, z.enum(["stylized", "off"])),
  })
  .strict();

/**
 * `#rrggbb`, and nothing else. A colour is a value with a **shape**, and the
 * shape is this field's upper bound in exactly the sense #277 means: without it
 * an operator can type 「紅」 into the form, the PUT succeeds, and the game
 * silently keeps the old colour — 「存了但畫面沒變」, the failure form this repo
 * hates most. Six digits only (no `#rgb`, no `rgba()`): one accepted spelling
 * means one parser on the client and one thing to assert in a test.
 */
const zColorHex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "顏色必須是 #rrggbb");

/**
 * config.damage-colors@1 — 傷害數字與受擊閃光的**四向配色**
 * (`config/damage-colors.json`).
 *
 * owner 2026-08-01, verbatim:
 *   「真實傷害目前在畫面上看不出來 => 顯示白色傷害數字(紅物理; 紫魔法; 白真實;
 *     綠治療)」
 *
 * Before this doc the client branched on `=== "magic"` in TWO places
 * (`ui/combatText.combatTextStyle` and `render/combatFeedback.flashColorFor`),
 * so 真實傷害 was pixel-identical to 物理傷害 in both the floating number and
 * the victim body flash. The only channel that already told them apart was the
 * impact spark (`vfx/vfxPresets.IMPACT_TINTS`, three-way since task #33) and the
 * hit SFX (`audio/combatSfx`, `hit` / `hitMagic` / `hitTrue`) — which is why the
 * defect reads as 「看不出來」 rather than 「完全沒反應」.
 *
 * ── WHY THIS IS A CONFIG DOC AND NOT FOUR CONSTANTS IN THE RENDERER ──────────
 * The owner has now overruled this exact palette TWICE IN TWO DAYS (2026-07-31
 * 「魔法傷害(AP) 跳出來的數字應該是紫色系」, then this). A hex literal in
 * `apps/client/**` is baked into the image at BUILD time, so each of those two
 * words cost a full rebuild + container restart; `content/` is the live
 * bind-mount, so this doc costs a save. That is CLAUDE.md 第一守則's stated
 * reason, and the seam already exists — `ContentDb.load` pushes gore / stealth /
 * vfx-families / model-lod into the render layer the same way.
 *
 * ── WHY `text` AND `flash` CARRY DIFFERENT VALUES FOR THE SAME SCHOOL ────────
 * They are not the same physical channel and 「白」 is only achievable in one of
 * them. The floating number is DOM text drawn over a hard black ring, so pure
 * white is its most legible possible fill (21:1 against the ring). The victim
 * flash is a Babylon overlay drawn with ALPHA_COMBINE
 * (`out = base·(1−a) + flash·a`), where a white overlay can only push channels
 * UP — measured against the real w3x tints in `config/unit-tints.json` it moves
 * a pale model by ΔRGB 0.03–0.09, i.e. it is INVISIBLE on exactly the models the
 * complaint is about. So the flash's 真實 entry is the palest colour that still
 * moves a pale model (a cyan-white), and `damagePalette.test.ts` measures it.
 * Same AXIS in both channels — three schools, three answers — different values,
 * on purpose, and both are yours to change.
 */
export const zDamageTextAxis = z.enum(["damageType", "relation"]);

/**
 * 哪些飄字算「我被打」,也就是要換外框的那一組 (owner 2026-08-01
 * 「加第二個通道，不動色相 => ok」)。
 *
 * `off` ＝ 這個功能出現之前的行為(全部同一個外框)。
 * `taken` ＝ 只有真的掉血的那個數字換框。
 * `incoming` ＝ 所有「朝我來的」都換框:掉血、被盾吃掉(GUARD)、閃掉(閃避)。
 *
 * 為什麼這是一個欄位而不是寫死: 「閃避」是不是「我被打」在字面上兩邊都說得通
 * (它是朝我來的一擊,但我沒被打到)。`ui/combatText` 自己的檔頭說 dodge
 * 「occupies the same slot in the player's attention」,所以出貨值選 `incoming`;
 * 覺得太吵就切 `taken`,不必改程式。
 */
export const zCombatTextOutlineMode = z.enum(["off", "taken", "incoming"]);

export const zConfigDamageColorsDoc = z
  .object({
    id: zId,
    schema: z.literal("config.damage-colors@1"),
    note: z.string().optional(),
    /**
     * What a DAMAGE number's hue means. `damageType` is owner's ruling and the
     * shipped default; `relation` is the pre-ruling behaviour (hue = 受到/造成,
     * damage school shown only as a violet accent on magic) kept expressible
     * because it is a genuine trade-off, not a bug — see the admin page's note.
     */
    textAxis: zDamageTextAxis,
    /** Floating-number fills. `heal` applies on both axes; the rest only on `damageType`. */
    text: z
      .object({
        physical: zColorHex,
        magic: zColorHex,
        true: zColorHex,
        heal: zColorHex,
      })
      .strict(),
    /** Victim body-flash overlay colours (three schools; heal never flashes a body). */
    flash: z
      .object({
        physical: zColorHex,
        magic: zColorHex,
        true: zColorHex,
      })
      .strict(),
    /**
     * ── 第二個通道:外框 (owner 2026-08-01 「加第二個通道，不動色相 => ok」) ──
     *
     * `textAxis: "damageType"` 的代價是「我打人」與「我被打」同一個色相。這一組
     * 把那個分別放回去,**不動色相**:填色繼續講傷害屬性,外框講「這個數字是誰
     * 的血」。兩個通道互不搶。
     *
     * ⚠️ 這裡調的是**外圈**,不是那圈黑框。硬黑框是 #164「傷害數字看起來是黑色」
     * 留下來的辨識度地板,而且它**沒有餘裕可以換色** —— 實測:黑框對土色地面
     * (#6d6250) 只有 3.51:1,而物理傷害的填色 #FF5900 在同一個地面只有 1.90:1,
     * 也就是說那個地面完全靠黑框撐。把黑框換成任何一個看得出來是紅色的顏色
     * (#5A0000 → 2.45:1)就會掉到 3.0 以下,整個數字在土地上糊掉。
     *
     * 所以外圈是**多畫一層**,畫在黑框後面、比黑框大 `widthMult` 倍:黑框原封不
     * 動(地板還在),外圈提供顏色。`outgoing` 的出貨值就是黑色,而**與黑框同色的
     * 外圈不會被畫出來**(在黑框後面畫一圈黑只是多花畫素),所以「我打人」那一
     * 組的 CSS 和這個功能出現之前一字不差。
     */
    outline: z
      .object({
        /** 哪些飄字算「我被打」。`off` = 這個功能出現之前的行為。 */
        mode: zCombatTextOutlineMode,
        /** 「我打人」(以及所有第三方飄字)的外圈色。出貨黑 = 看不到外圈。 */
        outgoing: zColorHex,
        /** 「我被打」的外圈色。出貨深紅 #5A0000。 */
        incoming: zColorHex,
        /**
         * 外圈半徑 ÷ 黑框半徑。1.9 → 30px 的受傷數字得到一圈約 1.8px 的深紅。
         * 下界 1.1:等於 1 就完全被黑框蓋住,那是第二個關閉開關。
         * 上界 3:黑框 2px × 3 = 6px,再大就不是描邊而是一團色塊了。
         */
        widthMult: z.number().min(1.1).max(3),
      })
      .strict(),
  })
  .strict();

/**
 * config.icon-plan@1 — WHICH content entries get a generated icon
 * (`config/icon-plan.json`, task #72), written by
 * `tools/icon-gen/src/plan.py --write` and read by the codex's broken-data
 * table and the 圖示覆蓋率 bar.
 *
 * PURELY DESCRIPTIVE. Nothing in the sim, the client renderer or the platform
 * reads it: it explains a gap, it never creates one. An entry the plan calls
 * "dropped" still ships, still appears in the codex, still works in a match —
 * the only consequence is that the paid image batch skips it.
 *
 * IT LIVES HERE, IN A SCHEMA-VALIDATED COLLECTION, ON PURPOSE. An unregistered
 * doc under `content/config/` loads fine until someone runs `content:build`,
 * which indexes every .json in the directory — and then the ContentLoader
 * throws on the unknown discriminator and the whole content load fails. Adding
 * the union member is the cost of putting a file here; the alternative is
 * `content/assets/`, which is served verbatim and validated by nobody.
 *
 * The rule keys (`recipe-book`, `third-party-ip`, …) are DATA, not schema: the
 * planner adds and retires rules as content changes, and a schema that
 * enumerated them would have to be edited in lockstep with a tool in another
 * language. So the buckets are a record, and each carries its own human
 * justification — that note is what the codex renders next to the entry.
 */
const zIconPlanBucket = z
  .object({
    /** short label for the group header */
    label: z.string(),
    /** why these entries are excluded — shown verbatim to the reader */
    note: z.string(),
    ids: z.array(z.string()),
  })
  .strict();

export const zConfigIconPlanDoc = z
  .object({
    id: zId,
    schema: z.literal("config.icon-plan@1"),
    /** the prompt-template version the batch would run with */
    templateVersion: z.string(),
    /** fingerprint of the content the plan was derived from */
    contentDigest: z.string(),
    counts: z
      .object({
        total: z.record(z.string(), z.number()),
        byFamily: z.record(z.string(), z.record(z.string(), z.number())),
      })
      .strict(),
    /** importer resolution -> how many icon-less entries came from it */
    provenance: z.record(z.string(), z.number()),
    /** rule key -> the entries deliberately never generated */
    dropped: z.record(z.string(), zIconPlanBucket),
    /** rule key -> the entries held pending a human decision */
    blocked: z.record(z.string(), zIconPlanBucket),
    generate: z
      .object({
        tier1: z.array(z.object({ id: z.string(), family: z.string() }).strict()),
        tier2: z.array(z.object({ id: z.string(), family: z.string() }).strict()),
      })
      .strict(),
    /** ids a live surface protects from ever being dropped */
    vetoed: z.array(z.string()),
    /** live-surface files the planner could not find (a too-narrow veto) */
    missingSurfaceFiles: z.array(z.string()),
  })
  .strict();

/**
 * config.victory-taunts@1 — the VICTORY VO SCRIPT (`config/victory-taunts.json`,
 * task #93 勝利演出). Two tiers of taunt live in one doc:
 *
 *   • `roundWin` — tier 1 (grey screen, small fireworks): one pool per CHAMPION,
 *     keyed by champion id, each line riffing on that champion's source
 *     character + 稱號. Every champion on the roster has an entry today, but the
 *     record is open by construction (as in `config.gore@1`): a key naming a
 *     champion that no longer exists simply never matches, so retiring a
 *     champion can never break a content build.
 *   • `matchWin` — tier 2 (dark screen, giant roast-chicken firework):
 *     champion-agnostic, one shared pool.
 *   • `roundWinFallback` — what plays when a champion's own pool is drained, or
 *     for a champion with nothing quotable to twist. Non-empty, so the
 *     presentation layer always has a line and never has to handle silence.
 *
 * Every line is one PRE-RENDERED clip staged under
 * `content/assets/audio/voice-taunt/`, generated by tools/tts-gen from
 * `content/audio-manifests/taunts.json`: `id` is the manifest id, `file` the
 * staged mp3, `text` the script (subtitle copy, and the record of what was
 * said), `langs` the languages actually spoken, in fragment order — a line may
 * switch language mid-sentence (「うそだ！抱歉，是真的。」), which is why it is a
 * list and not a single tag. `voices` and `rate` record the cast and speaking
 * rate the clips were rendered WITH: provenance for a re-render, not playback
 * parameters.
 *
 * `note` and `direction` are the authoring brief, kept next to the copy because
 * they are the two rules a rewrite must not lose: the lines are ORIGINAL
 * writing that twists a well-known catchphrase into an insult aimed at the
 * loser (never a reproduced quote), and the delivery is flat and emotionless —
 * the line is the joke, the voice never performs it. Same aesthetic the
 * announcer pack is held to; see `announcerVo.test.ts`.
 *
 * Purely presentational: nothing here enters the sim or touches a damage number.
 */
export const zVictoryTauntLang = z.enum(["zh", "ja", "en"]);

/** One pre-rendered clip: manifest id, staged mp3, and the script it reads. */
export const zVictoryTauntLine = z
  .object({
    /** tools/tts-gen manifest id, e.g. "taunt-round-godie-e001-2" */
    id: zId,
    /** path under content/, e.g. "assets/audio/voice-taunt/round/godie-e001-1.mp3" */
    file: zAudioAssetPath,
    /** the spoken script — doubles as the subtitle copy */
    text: z.string().min(1),
  })
  .strict();

/** A taunt line also tags the languages spoken in it, in fragment order. */
export const zVictoryTauntTaggedLine = zVictoryTauntLine
  .extend({
    /** languages heard in the clip, in the order they are spoken */
    langs: z.array(zVictoryTauntLang).min(1),
  })
  .strict();

/** One champion's tier-1 pool, plus the context the jokes were written from. */
export const zVictoryTauntChampionEntry = z
  .object({
    /** the champion as the copy addresses it (稱號 - 角色名) */
    name: z.string().min(1),
    /**
     * the source work whose catchphrase the lines twist, or null when none was
     * recorded — a null is a missing ANNOTATION, not a missing pool: the entry
     * still carries its full set of lines. Present-and-null (never absent), so
     * "unattributed" stays a deliberate state, as with `soundset` above.
     */
    source: z.string().min(1).nullable(),
    lines: z.array(zVictoryTauntTaggedLine).min(1),
  })
  .strict();

export const zConfigVictoryTauntsDoc = z
  .object({
    id: zId,
    schema: z.literal("config.victory-taunts@1"),
    /** the authoring brief: what each tier is and what the copy may be */
    note: z.string().min(1),
    /** the delivery direction the clips were cast and rendered to */
    direction: z.string().min(1),
    /** BCP-47 tag -> the TTS voice that read that language (re-render provenance) */
    voices: z.record(z.string().min(1), z.string().min(1)),
    /** words-per-minute each tier was rendered at (re-render provenance) */
    rate: z
      .object({
        roundWin: z.number().int().positive(),
        matchWin: z.number().int().positive(),
      })
      .strict(),
    /** championId -> that champion's tier-1 pool */
    roundWin: z.record(zId, zVictoryTauntChampionEntry),
    /** tier-1 lines for a drained pool / a champion with no entry */
    roundWinFallback: z.array(zVictoryTauntLine).min(1),
    /** tier-2 pool, champion-agnostic */
    matchWin: z.array(zVictoryTauntTaggedLine).min(1),
  })
  .strict();

/**
 * config.voxel-barcodes@1 — 特徵生成 (docs/_體素特徵生成規格.md) L0, the layer the
 * ADMIN CONSOLE writes.
 *
 * WHY THIS DOC EXISTS SEPARATELY FROM `content/models/_voxel-barcodes.json`.
 * That file is the shipped SEED: it is a sidecar (leading underscore), so the
 * indexer skips it and it is fetched by path, exactly like `_voxel-skins.json`.
 * A sidecar cannot be the console's write target, because the platform's durable
 * overlay keys are `^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$` — an id may not START
 * with an underscore, so `models/_voxel-barcodes` is a 400 and there is no
 * spelling of it that is not. This doc is the overlay-writable half:
 *
 *   effective barcode(champion) = overlay(config/voxel-barcodes).barcodes[id]
 *                              ?? seed(models/_voxel-barcodes.json).barcodes[id]
 *
 * so `barcodes` here holds ONLY what an operator edited. An empty map is the
 * shipped state and means "every champion is still on the seed", which is what
 * lets the console's per-champion badge tell 「後台改過的版本」 from 「出貨預設值」
 * as a FACT about the data rather than as decoration.
 *
 * IT LIVES IN A SCHEMA-VALIDATED COLLECTION FOR THE REASON `config.icon-plan@1`
 * spells out above, plus one this doc has and that one does not: the overlay
 * merge (`OverlayContentSource.readManifest`) publishes EVERY collection the
 * overlay touches, and `ContentLoader` rejects a collection it has no schema
 * for. So an unregistered home for this doc would not fail at authoring time —
 * it would fail on the host, at boot, the first time the owner pressed 儲存.
 *
 * The band shape is restated in zod rather than derived from `BarcodeBand`:
 * `BARCODE_SLOTS` is imported so the eleven keys and their ANATOMICAL ORDER
 * cannot drift, but the value constraints (a strict `#rrggbb`, a positive frac)
 * are checks a TypeScript interface cannot make on a JSON file.
 */
const zBarcodeHex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "顏色必須是 #rrggbb");

const zBarcodeBand = z
  .object({
    hex: zBarcodeHex,
    /** share of the WHOLE figure's height; present bands sum to 1.0 */
    frac: z.number().gt(0).max(1),
  })
  .strict();

/** The eleven slots, every key present, an absent slot explicitly `null`. */
const zBarcodeBands = z
  .object(
    Object.fromEntries(BARCODE_SLOTS.map((s) => [s, zBarcodeBand.nullable()])) as Record<
      (typeof BARCODE_SLOTS)[number],
      z.ZodNullable<typeof zBarcodeBand>
    >,
  )
  .strict();

const zVoxelBarcodeEntry = z
  .object({
    v: z.literal(1),
    championId: zId,
    bands: zBarcodeBands,
    sleeve: z.enum(["long", "short", "none"]),
    faceColors: z
      .object({ eye: zBarcodeHex, nose: zBarcodeHex.nullable(), mouth: zBarcodeHex })
      .strict(),
    /** MANDATORY audit field — who decided this barcode (規格 §6). */
    source: z.enum(["manual", "extracted", "keyword", "generated"]),
    extraction: z
      .object({
        refImage: z.string().min(1),
        verdict: z.enum(["PASS", "SUSPECT", "FAIL", "DUPLICATE"]),
        reasons: z.array(z.string()),
        maxPairwiseDeltaE: z.number(),
        foregroundRatio: z.number(),
      })
      .strict()
      .optional(),
    note: z.string().optional(),
  })
  .strict();

export const zConfigVoxelBarcodesDoc = z
  .object({
    id: zId,
    schema: z.literal("config.voxel-barcodes@1"),
    note: z.string().optional(),
    /** the file's own copy of the anatomical order — a formatter that
     *  alphabetised the slot keys shows up here instead of silently re-stacking
     *  every character */
    slotOrder: z.array(z.string()).optional(),
    /** championId -> the barcode an operator authored. Empty = all seed. */
    barcodes: z.record(zId, zVoxelBarcodeEntry),
  })
  .strict();

/**
 * config.voxel-bodies@1 — WHICH BODY EACH CHAMPION WEARS, and the ONLY place an
 * operator's answer to that question survives a deploy.
 *
 * owner, 2026-07-28:「請你都先用暴雪的 3d model，要替換成體素是我從後台設定套用
 * 才生效」.
 *
 * THE THREE-LAYER RESOLUTION, most specific first:
 *
 *   effective preferVoxelBody(champion)
 *     = overlay(config/voxel-bodies).bodies[id]                    ← 後台開關
 *    ?? seed(models/_voxel-skins.json).overrides[id].preferVoxelBody ← 手工美術指定
 *    ?? defaultPrefersVoxelBody(modelKey, id)                       ← 「有自己的模型就用」
 *
 * ⚠️ WHY THIS IS A CONFIG DOC AND NOT A FIELD IN `models/_voxel-skins.json`.
 * That file is a sidecar baked into the image. Had the console written to it,
 * every `docker compose build` would have restored the repo's copy and SILENTLY
 * DISCARDED the operator's choices — a setting that works all week and then
 * quietly reverts on the next deploy, with no error anywhere. The durable
 * overlay is the only writable surface that outlives an image, and its keys may
 * not start with `_`, so a sidecar could not be its target even in principle
 * (see `config.voxel-barcodes@1` above, which hit the same wall).
 *
 * `bodies` therefore holds ONLY what an operator explicitly toggled. Empty is
 * the shipped state and means 「全部照預設」 — which lets the console show
 * 「後台改過」 vs 「預設」 as a fact about the data rather than as a guess.
 */
export const zConfigVoxelBodiesDoc = z
  .object({
    id: zId,
    schema: z.literal("config.voxel-bodies@1"),
    note: z.string().optional(),
    /**
     * championId -> true = 體素身體, false = 自己的 3D 模型.
     * BOTH directions are stored on purpose: an operator must be able to force a
     * Blizzard-modelled champion back onto voxel AND to force a voxel champion
     * onto whatever model it has. A one-way switch is a lever, not a setting.
     */
    bodies: z.record(zId, z.boolean()),
  })
  .strict();

/**
 * config.form-visuals@1 — 變身「看得出來」的三個旋鈕 (`config/form-visuals.json`,
 * task #249 / GH#288).
 *
 * ---------------------------------------------------------------------------
 * 為什麼這是一份 **設定**,而不是從 w3x 抄過來的事實
 * ---------------------------------------------------------------------------
 * owner:「基本上變身前後都是同一模型,但是附帶不同球體效果及 3D model 顏色、
 * 大小、能力屬性變化而已」。對 26 對裡的多數這是對的,但對本次上架的兩對,
 * **w3u 的顏色與大小欄位是空的**,查證如下(不要再查一次,直接看這裡):
 *
 *   · 09 悟空  `Ogrh` uclr/uclg/uclb 未設 → tint [1,1,1];`usca` 未設 → 1.0
 *              `O00X` 同上,tint [1,1,1]、`usca` 未設 → 1.0
 *              → **顏色與大小完全相同**。真正的差別是球體掛件:
 *                `Ogrh` 掛 `A0MI` 球體(悟空正常) = `Gokuhead.mdx`,
 *                `O00X` 掛 `A0MJ` 球體(悟空超3)  = `Goku3head.mdx`。
 *   · 20 Saber `E002` / `E00L` 兩半都是 tint [1,1,1]、`usca` 1.10 —— 一模一樣,
 *              而且 `O00X` 有的那種球體它一個也沒有(`E00L` 多的是 `A05M`
 *              法術書與 `A0M3` 攻擊修飾,兩個都沒有 art)。
 *   · `war3map.j` 全域搜 `SetUnitVertexColorBJ`,A09E(超級賽亞人)與 A0DZ
 *     (風王結界)兩條觸發**都沒有**改顏色(A09E 只放地震/踏地/雷擊特效)。
 *
 * 也就是說:照抄 w3x,這兩對變身在畫面上 **完全看不出來**。所以顏色與大小是
 * 這裡授權操作者做的**美術決定**,出貨預設是刻意挑的,不是量到的 —— 而球體
 * 掛件那一項是真的 w3x 事實。`championFormVisuals.test.ts` 把這段話的每一句
 * 都釘在匯入器的 fixture 上,所以它不會慢慢變成謊話。
 *
 * ---------------------------------------------------------------------------
 * 為什麼掛件是「執行期掛」而不是烘進 glb
 * ---------------------------------------------------------------------------
 * `godie-ogrh` 與 `godie-o00x` **共用 `imported.goku` 這一個 modelKey**,而
 * `Gokuhead` 已經在 #267 被烘進 `goku.glb` 了。把 `Goku3head` 也烘進去 ⇒
 * **基本型悟空也會長出超三的頭**。所以變身態的頭是執行期掛在 ChampionView 上
 * 的第二個 glb,base 那一半的設定表裡根本沒有這個欄位可以填。
 *
 * ---------------------------------------------------------------------------
 * 三個全域旋鈕的語意(每一個都能把功能整個關掉)
 * ---------------------------------------------------------------------------
 *   · `enabled`            總開關。false = 變身完全不改外觀(回到 v0.9.12 行為)。
 *   · `tintStrength`       0..1,對「顏色偏離白色的量」的濃度。0 = 不上色,
 *                          1 = 完全照 `forms[].tint`。**不是**直接乘上去 ——
 *                          直接乘會讓 0 變成全黑,那是關不掉的意思相反。
 *   · `scaleStrength`      0..2,對「大小偏離 1.0 的量」的濃度。0 = 不縮放。
 *   · `attachmentsEnabled` 球體掛件的獨立開關(掛件要多載一個 glb,所以低階
 *                          機器可以只留顏色與大小)。
 */
export const zFormVisualEntry = z
  .object({
    /** 這一格是怎麼來的 —— w3x 事實 or 美術決定,寫給下一個人看 */
    note: z.string().optional(),
    /**
     * 乘在 albedo/diffuse 上的 [r,g,b](和 #49 的 `tint` 同一條管線,同一個語意:
     * 乘法,不是覆蓋)。`[1,1,1]` 與省略同義。上界 4 而不是 1:WC3 的
     * `SetUnitVertexColor` 只能變暗,但這裡是美術決定,要能打亮一個金色超賽。
     */
    tint: z.tuple([z.number().min(0).max(4), z.number().min(0).max(4), z.number().min(0).max(4)]).optional(),
    /**
     * 疊在 #150 身高正規化 **之上** 的倍率(1 = 和本體一樣高)。
     * 上界 3 對齊 `_standin-overrides.json` 已經在用的最大值(O030 的 3.0);
     * 下界 0.2 以下就小到看不見了,那不叫變身。
     */
    scaleMult: z.number().min(0.2).max(3).optional(),
    /** 掛件的 models/ 文件 id(例:`imported.goku3head`)。省略 = 沒有掛件。 */
    attachModelKey: z.string().min(1).optional(),
    /**
     * 掛點。`"origin"`(預設,也是 w3x 對 A0MI/A0MJ 記的值)= 模型原點;
     * 其他值當骨頭名稱,找不到就退回模型原點(絕不丟例外)。
     */
    attachBone: z.string().min(1).optional(),
    /**
     * 掛件在**掛點的 local frame**(= 本體 glb 的原生座標系)裡的縮放。
     *
     * 為什麼預設是 0.3221 而不是 1:兩份 glb 是用**不同的轉檔倍率**烘出來的。
     * `goku.glb` 走英雄身高規則(整隻 1.70u),`goku3head.glb` 走 1/36 道具倍率
     * (2.836u,比本體還高)。0.3221 = 0.008946 / 0.027778,就是把後者換算回前者
     * 的座標系。換算完 SSJ3 的頭髮落在 Y 0.73..1.65,而本體頭骨在 1.476、
     * 頭頂在 1.698 —— 自己站到正確位置,所以 `attachOffsetY` 是 0。
     */
    attachScale: z.number().min(0.01).max(10).optional(),
    /** 掛件沿 Y 的微調,單位是掛點 local frame。0 = 用 mdx 自己烘的高度。 */
    attachOffsetY: z.number().min(-5).max(5).optional(),
  })
  .strict();

export const zConfigFormVisualsDoc = z
  .object({
    id: zId,
    schema: z.literal("config.form-visuals@1"),
    note: z.string().optional(),
    /** 總開關。false = 變身不改外觀。 */
    enabled: z.boolean(),
    /** 0..1 顏色濃度(0 = 不上色,1 = 照 `forms[].tint`)。 */
    tintStrength: z.number().min(0).max(1),
    /** 0..2 大小濃度(0 = 不縮放,1 = 照 `forms[].scaleMult`)。 */
    scaleStrength: z.number().min(0).max(2),
    /** 球體掛件的獨立開關。 */
    attachmentsEnabled: z.boolean(),
    /**
     * **變身態 championId** -> 這一態長什麼樣。
     *
     * ⚠️ key 一律是 `Emeu` 那一半。`resolveFormVisual` 會再驗一次
     * `isAlternateForm(id)`,所以就算有人把 `godie-ogrh` 填進來,基本型也拿不到
     * 任何外觀 —— 這正是「基本型悟空不可以長出超三的頭」的資料層防線。
     */
    forms: z.record(zId, zFormVisualEntry),
  })
  .strict();

/**
 * config.model-lod@1 —— 「哪一個畫質等級去抓哪一階模型檔」的對照表
 * (`config/model-lod.json`, task #115)。
 *
 * 為什麼是內容而不是程式裡的 switch:這張表是**平衡/體感決策**,不是事實。
 * 目前量到的變體覆蓋率是 83/167(49.7%),`-small` 平均省掉一半以上的面數與
 * 位元組;但「中畫質到底該吃 mid 還是 small」要看真機發燙與畫面能接受到哪裡,
 * owner 會想改。寫死的話改一格 = 一次 client rebuild + 重新部署;放在
 * `content/` 就是存檔即生效(content/ 是 live bind-mount)。
 *
 *   · `enabled`     總開關。false = 一律載原檔,等於 #115 之前的行為。
 *                   線上如果發現某一階的檔壞了,這一格是止血閥。
 *   · `presetTiers` 四個 preset 各自對到 high/mid/small。
 *
 * ⚠️ `auto` 預設留在 `high` 是**刻意**的,不是漏填:自適應階梯每幾秒就會換一
 * 級,而換模型階 = 丟掉 AssetContainer 再發一次網路請求。讓它跟著階梯跑,就會
 * 在最撐不住的那台機器上、打到一半、反覆下載模型。改這一格之前先讀
 * `apps/client/src/render/modelLod.ts` 的檔頭。
 *
 * 缺的階自動退回:要 small 但只生了 mid → 給 mid;兩個都沒有 → 給原檔。所以
 * 這張表**不可能**因為某個模型沒有變體而 404(`resolveLodPath` 在守)。
 */
export const zModelLodTier = z.enum(["high", "mid", "small"]);

export const zConfigModelLodDoc = z
  .object({
    id: zId,
    schema: z.literal("config.model-lod@1"),
    note: z.string().optional(),
    /** 總開關。false = 每個 preset 都載原檔。 */
    enabled: z.boolean(),
    /** 畫質 preset -> 要抓的模型階。四個都必填,不允許靜默漏掉一個。 */
    presetTiers: z
      .object({
        low: zModelLodTier,
        medium: zModelLodTier,
        high: zModelLodTier,
        auto: zModelLodTier,
      })
      .strict(),
  })
  .strict();

/**
 * config.vfx-cleanup@1 —— 回合邊界要把特效層的池子回收到什麼程度
 * (`config/vfx-cleanup.json`, task #262)。
 *
 * owner 的症狀是「越打越鈍」「一場就很燙」+ 親眼看到殘留特效。#259 已經把
 * **live** 的一次性效果與 VfxSystem/rig 自己的池子在回合邊界還回去了；量出來
 * 還在漏的是 `Telegraph` 的**每個 Scene 共用**的網格 free-list：它以
 * 「半徑字串」為 key，一個 key 最多 8 個 ring mesh(各自一份 StandardMaterial)，
 * 而那張 Map 沒有人清 —— `TelegraphLayer.dispose()` 也不清。實測 60 個不同
 * 半徑打完，`dispose()` 之後 scene 上仍留著 72 mesh / 73 material /
 * 13 texture / 12 particleSystem。
 *
 * 為什麼是內容而不是常數:「回合之間要不要把暖好的池子丟掉」是**體感取捨**,
 * 不是事實。丟掉 = 穩態記憶體最低,代價是下一回合第一次施法要重新配置;留著
 * = 第一次施法不卡,代價是那些網格整場都在。哪一邊比較好要看 owner 在真機上
 * 打起來的感覺,而寫死的話改一格 = 一次 client rebuild + 重新部署。
 *
 *   · `enabled`                    總開關。false = 完全回到 #259 的行為
 *                                  (只清 live 效果,共用池子不動)。止血閥。
 *   · `purgeSharedPoolsOnRoundEnd` 回合結束是否強制清空共用池子。
 *   · `maxPooledRings`             不強制清空時,整個 scene 允許留幾個預告圈
 *                                  網格。超出的部分在回合邊界被丟掉。0 = 一個
 *                                  都不留(等於強制清空 ring 那一層)。
 *
 * ⚠️ 「角色退場時歸還 tint clone 材質」**刻意不做成開關**:那是正確性修復
 * (未著色英雄 + 成長階級 > 0 的 clone 從來沒被歸還,實測每回合 +30 個
 * material 線性成長),不是 owner 會想推翻的判斷。給它一個開關等於把
 * 「要不要漏記憶體」放上後台。
 */
export const zConfigVfxCleanupDoc = z
  .object({
    id: zId,
    schema: z.literal("config.vfx-cleanup@1"),
    note: z.string().optional(),
    /** 總開關。false = 回合邊界不碰共用池子(#259 的行為)。 */
    enabled: z.boolean(),
    /** 回合結束是否強制清空共用池子(ring / fill / shockwave free-list)。 */
    purgeSharedPoolsOnRoundEnd: z.boolean(),
    /**
     * 不強制清空時,整個 scene 允許留下的預告圈網格上限。每一個網格帶一份
     * StandardMaterial,所以這個數字直接就是「回合之間常駐的 mesh/material 數」。
     * 上下界都有:0 = 一個都不留;512 是實測 60 個半徑 × 每個 key 上限 8 的
     * 量級,再高就沒有意義而只會讓打錯的數字靜默通過(#277 的形狀)。
     */
    maxPooledRings: z.number().int().min(0).max(512),

    /* ── GH#267 死亡火焰的收斂（owner 2026-08-03）─────────────────────────
     *
     * 「我找到場地天空火的兇手了，是角色死亡後的特效，持續太久了變得很干擾」
     *
     * 兇手是**復活圈的火**：#196 把圈圈的存續時間整個拿掉，所以每死一位英雄，
     * 場上就多一團永遠不滅、往天上飄的橘色火。這三格決定它燒多久、收斂到多暗、
     * 以及有人來救時要不要燒回全亮。消費端是
     * `apps/client/src/render/views/deathFxBurn.ts`（逐格降級讀取）。
     *
     * ⚠️ 三格都 `.optional()`，而且**必須**是 optional：`config.vfx-cleanup@1`
     * 已經有耐久覆蓋層在線上（後台存過就有），一份存於新欄位之前的 override
     * 少了必填欄就會整份被 Zod 退回 → 內容載入失敗 → fail-open 退回骨架。
     * 那是 2026-08-02 兩次事故的形狀，不要再走一次。
     */

    /**
     * 英雄倒下後留在屍體上的那團火（火柱／火舌／往天上飄的餘燼）用**全亮**燒幾秒。
     * 燒完之後降到下面那格的比例。0 = 一出現就是低調狀態。
     *
     * ⚠️ 這只改**看起來**多久，不改復活圈本身還救不救得回來 —— 圈圈的存活由
     * 伺服器決定（#196 無到期），這一格碰不到它。改大 = 回到 GH#267 之前那種
     * 「燒到回合結束」的畫面。上界 600 秒＝十分鐘，比任何一個回合都長。
     */
    deathFxBurnSec: z.number().min(0).max(600).optional(),
    /**
     * 全亮秒數過完之後，火剩下原本的幾成（火柱與火舌的 alpha、餘燼的噴發速率
     * 一起乘上這個數）。
     *
     * 1 = 永遠不收斂，等於一鍵回到 #196 的行為（**止血閥**）；0 = 完全熄掉，
     * 只剩地上那圈。⚠️ 地上那圈的亮度**不受這一格影響**，因為它是玩家判斷
     * 「這裡還救得回來」的錨點 —— 讓機制不可讀不是一個可選的美術取捨。
     */
    deathFxCalmScale: z.number().min(0).max(1).optional(),
    /**
     * 隊友踩進圈圈開始復活、或敵人站進來卡住時，要不要立刻把火燒回全亮。
     *
     * true（出貨）= 收斂不會吃掉「有人在救／被卡住」這個一眼可讀的訊號。
     * false = 圈圈收斂後就一直低調，畫面最乾淨但要靠 HUD 才知道有人在救。
     */
    deathFxRelightOnChannel: z.boolean().optional(),

    /* ── GH#270 一次性發射器的「有界」保證（owner 2026-08-04 實測）──────────
     *
     * owner 用 v0.9.33 的診斷面板在真的線上對局量到 **線性洩漏**：
     * Round 2 = 144 個發射器 / 2,819 顆活粒子 → Round 4 = 266 / 5,975。
     * 每回合大約 +60 個發射器。
     *
     * 上面 #262 那三格管的是**預告圈網格**；一次性**粒子發射器**的池子當時
     * 完全沒有人管：
     *   · `HitSpark` 的共用 `ImpactComposer`（`vfx-preset-*`）掛在
     *     per-Scene WeakMap 上，**不屬於 VfxSystem**，`resetForRound()` 明文
     *     寫著不碰它；它唯一的回收器 `BurstPool.update()` 又只在**還有活的
     *     HitSpark** 時才被打點 —— 戰鬥一安靜就再也不回收。
     *   · `AmbientVfx.psPool`（`ambient-*`）只增不減、沒有上限、沒有回合重置。
     *
     * 兩者都是**只長不縮**。所以這三格把它變成有界的：
     *   · `maxOneShotEmitters`      同時允許幾個閒置的一次性發射器（硬上限）
     *   · `emitterSweepSec`         多久掃一次（把閒置的還回去）
     *   · `purgeImpactPoolOnRoundEnd` 回合結束要不要把打擊感池整個丟掉
     *
     * ⚠️ 全部 `.optional()`，理由和上面那三格一樣：線上已經有耐久覆蓋層，
     * 少一個必填欄會讓整份 config 被 Zod 退回 → 內容載入失敗 → 退回骨架。
     */

    /**
     * 同時允許**閒置**的一次性粒子發射器上限（整個 scene）。
     *
     * 「閒置」= 這一格的池子裡沒有粒子在飛、也沒有人正在用。超出的部分在下一次
     * 掃描時被丟掉（最久沒用的先丟），而且**會被說出來**：`VfxSystem` 把每一次
     * 驅逐的數字累加在 `oneShotEvictions` 上，診斷面板讀得到（CLAUDE.md：
     * 靜默夾掉才是缺陷）。
     *
     * 上下界都有。下界 16 = 一組打擊感（3 層 × 4 個實例）加上幾個常見 doc，
     * 再低就等於每一拳都要重新配置。上界 1024 遠高於 owner 量到的 266，
     * 打錯一個 0 不會靜默通過（#277 的形狀）。
     */
    maxOneShotEmitters: z.number().int().min(16).max(1024).optional(),
    /**
     * 多久掃一次閒置發射器（秒）。掃描本身只走一次 `scene.particleSystems`
     * 等級的清單，很便宜；設小 = 殘骸活得更短、記憶體更平，代價是回收動作
     * 更頻繁。0.5–60 秒。
     */
    emitterSweepSec: z.number().min(0.5).max(60).optional(),
    /**
     * 回合結束要不要把**打擊感共用池**（`vfx-preset-*`：白光/火花/煙）整個丟掉。
     *
     * true（出貨）= 商店那一段場上一個一次性發射器都不留，下一回合從零長回來。
     * false = 留著，下一回合第一拳不用重新配置，代價是那些系統整場都在場景裡
     * 被每一幀走訪 —— 那正是 GH#270 量到的東西，所以關它是**止血閥**不是省事。
     */
    purgeImpactPoolOnRoundEnd: z.boolean().optional(),
  })
  .strict();

/**
 * config.shield@1 — 護盾規則 (GH#289 lane P6)。
 *
 * 目前只有一格:**同一個單位身上有多個護盾池時,誰先被吃掉**。語意、三個值的
 * 差別、以及「為什麼這是欄位不是寫死的 if」全部寫在 `sim/shieldRules.ts`。
 *
 * ⚠️ 為什麼是自己一份文件,而不是塞進 `config.combat-feel@1`:
 *   · 語意上 combat-feel 是**手感**(擊退距離、打就站定、面向鎖窗口),護盾誰
 *     先吃是**傷害結算規則**,兩者一起調的機會是零;
 *   · 技術上 combat-feel 那一頁的後台欄位是 `deriveFields(zConfigCombatFeelDoc)`
 *     推導出來的,而那支推導器只認得 number / boolean —— enum 會被歸進
 *     `unsupported`,而 `apps/admin/src/combatFeel.test.ts` 斷言
 *     `unsupported` 必須是空陣列。把一個 enum 塞進去 = 隔壁工作流的頁面紅掉,
 *     而那個紅燈的意思是「有人要決定這一格的 UI 長怎樣」,不是「schema 錯了」。
 *
 * **缺文件 = 出貨預設**(`specificFirst` = 這條規則變成欄位之前的行為),不是空表。
 */
export const zConfigShieldDoc = z
  .object({
    id: zId,
    schema: z.literal("config.shield@1"),
    note: z.string().optional(),
    /**
     * 多個護盾池同時吃得下這一發時的消耗順序。
     *
     *   specificFirst   先花只吸這一型的池子(出貨值 = 舊行為)
     *   generalFirst    先花全類型的池子 —— 讓「先打掉泛用盾、逼出抗魔盾」
     *                   變成一個可以操作的節奏
     *   insertionOrder  不看類型專一性,純粹舊的先花 —— 護盾會過期,先花快到期
     *                   的那個才不會浪費
     *
     * 三個值都有行為守衛(sim/effects/shieldAbsorb.test.ts:同一組池子 + 同一發
     * 傷害 → 三種順序留下三組不同的剩餘量)。
     */
    absorbOrder: z.enum(["specificFirst", "generalFirst", "insertionOrder"]),
  })
  .strict();

/**
 * config.block@1 — 格擋規則。
 *
 * 目前只有一格:**同一個單位身上有多個格擋來源時,它們怎麼疊**。語意、owner 的
 * 原話、以及「為什麼 `best` 還留著」全部寫在 `sim/blockRules.ts`。
 *
 * ⚠️ 和 `config.shield@1` 不同,**這份文件的出貨值會改變平衡**,而且是故意的:
 * owner 2026-07-31 裁決「這種情形應該是獨立判斷兩次,拿第一次檔掉剩餘繼續算
 * 下一次」,推翻了原本的「取最好的一個、只抽一次」。晨曦之光 + 殺豬刀從 30%
 * 變成 51%。舊行為保留成 `best`,後台切得回去。
 *
 * 為什麼是自己一份文件而不是塞進 `config.shield@1`:護盾與格擋在 `damage.ts`
 * 是**兩段相鄰但獨立**的結算(格擋在護盾之前、而且刻意不吃護盾),而 schema 加
 * 一格等於把 `config.shield@1` 升版 —— 一份已經在線上存過 overlay 的文件升版,
 * 代價是操作者存過的值全部要遷移。同理也不塞 `config.combat-feel@1`:那一頁的
 * 欄位是 `deriveFields()` 從 Zod 推導的,而那支推導器只認得 number / boolean,
 * 塞一個 enum 進去就是把隔壁工作流的頁面弄紅(同 `config.shield@1` 的理由)。
 *
 * **缺文件 = 出貨預設**(`independent`),不是空表 —— 一個 undefined 的 stacking
 * 會讓 `blockCutFor` 兩條分支都不走,也就是格擋整族靜默失效。
 */
export const zConfigBlockDoc = z
  .object({
    id: zId,
    schema: z.literal("config.block@1"),
    note: z.string().optional(),
    /**
     * 多個格擋來源同時吃得到這一發時,它們怎麼疊。
     *
     *   independent  每個來源各抽各的,擋中的從**剩餘**傷害裡扣掉自己的
     *                `fraction`,剩下的交給下一個(出貨值 = owner 的裁決)
     *   best         只有 `chance × fraction` 最大的那一個參與,整發只抽一次
     *                (= 這條規則變成欄位之前的行為)
     *
     * 兩個值都有行為守衛(`sim/combat/block.test.ts` ⑤:同一組來源 + 同一顆
     * 種子 → 兩種模式給出兩組不同的擋掉量與不同的 rng draw 數)。
     */
    stacking: z.enum(["independent", "best"]),
  })
  .strict();

/**
 * config.crit@1 — 暴擊規則（GH#302）。
 *
 * owner 2026-08-09 逐字：
 *
 * > 我同時獲得 1%機率 100倍 以及 10%機率 2倍暴擊傷害，這樣我會有三種結果，
 * > 100x2=200、100、2倍，**因為是每一條暴擊獨立算完傷害再帶入下一條**
 *
 * ⚠️ 和 `config.shield@1` 不同、和 `config.block@1` 相同：**這份文件的出貨值會
 * 改變平衡**，而且是故意的 —— owner 推翻了原本的「取最好的那一條、整發只抽一次」。
 * 舊行為保留成 `stackMode: "max"`，後台切得回去（連抽幾次骰都一樣，見
 * `sim/critRules.ts` 的 `CritStackMode`）。
 *
 * ⭐ owner 同一天另外交代：「**暴擊計算方式 上限 這些參數都要能後台彈性設定**」——
 * 所以這裡是三格而不是一格：怎麼算（`stackMode`）、總倍率上限（`maxTotalMult`）、
 * 最多算幾條（`sourceCap`）。
 *
 * 為什麼是自己一份文件而不是塞進 `config.block@1`：格擋與暴擊是 `damage.ts` 兩段
 * 不相干的結算（一個在防守側、一個在出手側），而 schema 加一格等於把
 * `config.block@1` 升版 —— 一份已經在線上存過 overlay 的文件升版，代價是操作者
 * 存過的值全部要遷移。同理也不塞 `config.combat-feel@1`（那一頁的欄位是
 * `deriveFields()` 從 Zod 推導的，而那支推導器只認得 number / boolean，塞一個
 * enum 進去就是把隔壁工作流的頁面弄紅）。
 *
 * **缺文件 = 出貨預設**（{@link SHIPPED_CRIT}），不是空表 —— 一個 undefined 的
 * `stackMode` 會讓 `rollCritStrike` 的分支全部落空，也就是暴擊整族靜默失效：
 * 暴擊數字照跳、音效照響、傷害一點都沒多。
 */
export const zConfigCritDoc = z
  .object({
    id: z.literal("crit"),
    schema: z.literal("config.crit@1"),
    note: z.string().optional(),
    /**
     * 多條暴擊來源同時吃得到這一發時，它們怎麼合成。
     *
     *   multiply  每一條各抽各的骰，抽中的倍率**相乘**（出貨值 = owner 的裁決）
     *   max       只有期望增益最高的那一條參與，整發只抽一次
     *             （= 這條規則變成欄位之前的行為）
     *   add       每一條各抽各的骰，抽中的倍率**相加**
     *
     * 三個值都有行為守衛（`sim/combat/critStrike.test.ts`：同一組來源 + 同一顆
     * 種子 → 三種模式給出三組不同的總倍率）。
     */
    stackMode: z.enum(["multiply", "max", "add"]),
    /**
     * 一次攻擊的**總**倍率上限（owner 指定 100）。夾的是合成之後的那一個數字。
     *
     * ⚠️ 兩端都有界（#277）。下界 1 不是平衡政策，是保險絲：一個 <1 的「上限」
     * 會把每一次暴擊變成減傷，而畫面上只看得到「暴擊怎麼比平砍還不痛」。
     */
    maxTotalMult: z.number().min(1).max(1000),
    /**
     * 同一次攻擊最多算**幾條來源攜帶的**暴擊（owner 指定 5）。超出的照期望增益
     * 由高到低排序後整條不參與，連骰都不抽 —— 所以它同時是每一發的亂數預算上界。
     *
     * ⚠️ 它不管英雄自己的 `Stat.CritChance`（那是一條聚合屬性，永遠只有一條）。
     * 理由寫在 `sim/critRules.ts`：讓它佔格的話，把這一格調到 1 會讓每一個堆了
     * 暴擊率的英雄完全吃不到暴擊武器，而畫面上就是「這把劍壞了」。
     */
    sourceCap: z.number().int().min(1).max(16),
  })
  .strict();
export type ConfigCritDoc = z.infer<typeof zConfigCritDoc>;

/** ⚠️ 缺文件 = 這一份，不是空物件（同 `SHIPPED_WEAKNESS` 的規矩）。 */
export const SHIPPED_CRIT: ConfigCritDoc = {
  id: "crit",
  schema: "config.crit@1",
  stackMode: "multiply",
  maxTotalMult: 100,
  sourceCap: 5,
};

/**
 * config.berserk@1 — 暴走規則（59-00 初號機那一族）。
 *
 * ⚠️ **這個 schema tag 在 2026-08-05 之前不存在，而 sim 早就在讀它的三格。**
 * `sim/abilities/berserkRules.ts` 有 `DEFAULT_BERSERK_RULES`、有
 * `berserkRulesFromDoc()`、`SimWorld` 有 `berserkRules` 欄位、`abilitySystem`
 * 有兩處在讀它 —— 少的只是**文件、schema、後台頁與那條接線**。
 * 也就是說那個解析器從上架起就沒有拿到過一份真的文件，而三格的值只能是寫死的
 * 那一份。這正是 `augmentEnemyFilter` 的同型病理（見 `MatchController` 的
 * 賦值區註解），只是這一個連文件那一半都沒有。
 *
 * 出貨值逐字等於當時的 `DEFAULT_BERSERK_RULES`，所以建立它不改變任何平衡。
 *
 * **缺文件 = 出貨預設**（`normalizeBerserkRules` 的最裡層），不是空表 ——
 * 一個 undefined 的 `castHpPct` 會讓門檻永遠不成立，EX 在滿血也放得出來，
 * 而且沒有任何錯誤訊息。
 */
/**
 * config.dispel@1 — 淨化規則（A4b / #278）。
 *
 * ⚠️ 三個 `*DefaultDispellable` 決定「作者沒有想過這件事」時的答案，
 * 而出貨值是**刻意不對稱**的（理由逐格寫在下面）。它們是這一份文件裡唯一
 * 會**真的改變平衡**的三格 —— 其餘都是「拔幾層 / 先拔誰」這種手感旋鈕。
 */
/**
 * config.cooldown-rules@1 — 冷卻規則（owner 2026-08-10）。
 *
 * owner：「cdr 天花板可以是 0.99（99%減免），但要卡最低秒數 0.1 秒，
 * 這些都可以在後台設定」。⭐ 那是**兩個**旋鈕，住在兩份文件裡：
 *   · 比率天花板 → `config.stat-caps@1` 的 `cdr`（跟攻速上限同一張表）
 *   · 秒數地板   → 這裡的 `minSeconds`
 * 語意與「為什麼要兩個」寫在 `sim/cooldownRules.ts`。
 */
export const zConfigCooldownRulesDoc = z
  .object({
    id: zId,
    schema: z.literal("config.cooldown-rules@1"),
    note: z.string().optional(),
    /** 止血閥。false = 地板不作用（但看得見它是關的）。 */
    enabled: z.boolean(),
    /**
     * 實際冷卻**最短**幾秒。出貨 0.1。
     *
     * 0 = 沒有地板（合法，是「我知道我在做什麼」的寫法）。
     * 上界 10 —— 再高就會把大多數技能的冷卻**拉長**而不是設地板，那是打錯
     * 數字的樣子（3 秒 CD 的技能配一個 30 秒的「地板」）。
     */
    minSeconds: z.number().min(COOLDOWN_MIN_SECONDS_MIN).max(COOLDOWN_MIN_SECONDS_MAX),
  })
  .strict();

export const DEFAULT_COOLDOWN_RULES_DOC = {
  id: COOLDOWN_RULES_DOC_ID,
  schema: "config.cooldown-rules@1",
  enabled: DEFAULT_COOLDOWN_RULES.enabled,
  minSeconds: DEFAULT_COOLDOWN_RULES.minSeconds,
} as const;

/**
 * config.cast-time@1 — 吟唱規則（owner 2026-08-13）。
 *
 * owner 的三句話 = 這三格：
 *   ①「請你照我的 **0.06~4.00 秒**來設定吟唱時間」→ `floorSec` / `capSec`
 *   ②「**吟唱時間倍率** 也可以在系統後台設定」    → `multiplier`
 *   ③「吟唱時間**上下限**也可以一起設定」        → 上面那兩格變成欄位而非常數
 *
 * ⭐ 三格住同一份文件，因為它們是同一條算式的三個位置 ——
 * 拆到兩頁會讓「調了倍率卻被上限吃掉」看起來像 bug。
 * 語意、夾兩次的理由、以及「為什麼下限不能是 0」寫在 `sim/castTimeRules.ts`。
 */
export const zConfigCastTimeDoc = z
  .object({
    id: zId,
    schema: z.literal("config.cast-time@1"),
    note: z.string().optional(),
    /** 止血閥。false = 三格全部不作用（⚠️ 連地板一起關掉）。 */
    enabled: z.boolean(),
    /** 全域吟唱倍率。1.0 = 照算出來的值出貨；0.5 = 全技能吟唱減半。 */
    multiplier: z.number().min(CAST_MULTIPLIER_MIN).max(CAST_MULTIPLIER_MAX),
    /**
     * 吟唱**最短**幾秒。出貨 0.06 = 2 個 sim tick。
     *
     * ⛔ 下界是**一個 tick**（≈0.034）而不是 0：比一個 tick 更短時
     * `Math.round(sec / dt)` 會算出 0 tick ⇒ sim 當它瞬發，而客戶端**照樣**
     * 畫得出吟唱條與預告光束。兩邊都不報錯，只有玩家看得出來。
     */
    floorSec: z.number().min(CAST_FLOOR_MIN).max(CAST_FLOOR_MAX),
    /** 吟唱**最長**幾秒。出貨 4.00 —— 作者寫「吟唱 10 秒」時被夾住的地方。 */
    capSec: z.number().min(CAST_CAP_MIN).max(CAST_CAP_MAX),
  })
  .strict();

export const DEFAULT_CAST_TIME_DOC = {
  id: CAST_TIME_RULES_DOC_ID,
  schema: "config.cast-time@1",
  enabled: DEFAULT_CAST_TIME_RULES.enabled,
  multiplier: DEFAULT_CAST_TIME_RULES.multiplier,
  floorSec: DEFAULT_CAST_TIME_RULES.floorSec,
  capSec: DEFAULT_CAST_TIME_RULES.capSec,
} as const;

/**
 * config.aoe-tiers@1 — AoE 範圍四級距（owner 2026-08-11）。
 *
 * owner：「重新對應範圍只有 小/中/大/超大，**原則上不寫範圍數字**」。
 * → 技能 JSON 填 `radiusTier: "中"`，這張表決定「中」是多少半徑。
 * 語意、四個數字的來歷、以及「級別 vs 手寫 radius 誰贏」寫在 `content/aoeTiers.ts`。
 *
 * ⚠️ 上界 24 = 決鬥區半徑。大於它的「範圍」就是全場命中，那要走另一種寫法。
 */
export const zConfigAoeTiersDoc = z
  .object({
    id: zId,
    schema: z.literal("config.aoe-tiers@1"),
    note: z.string().optional(),
    /** 止血閥。false = `radiusTier` 不解析（填了也不生效，但看得見它是關的）。 */
    enabled: z.boolean(),
    /** 級別 → 半徑（GGD 單位）。四格都必填，缺一格就不是一把完整的尺。 */
    radius: z
      .object(
        Object.fromEntries(
          AOE_TIER_NAMES.map((n) => [
            n,
            z.number().min(AOE_TIER_RADIUS_MIN).max(AOE_TIER_RADIUS_MAX),
          ]),
        ) as Record<(typeof AOE_TIER_NAMES)[number], z.ZodNumber>,
      )
      .strict(),
  })
  .strict();

export const DEFAULT_AOE_TIERS_DOC = {
  id: AOE_TIERS_DOC_ID,
  schema: "config.aoe-tiers@1",
  enabled: DEFAULT_AOE_TIERS.enabled,
  radius: DEFAULT_AOE_TIERS.radius,
} as const;

/** 三格的數值（小/中/大）。⛔ 極小/極大不在這裡 —— 它們是硬上下限，住 stat-caps。 */
const zBandName = () => z.enum(["極小", "小", "中", "大", "極大"] as const);

const zNormBandValues = z
  .object(Object.fromEntries(NORMAL_BANDS.map((b) => [b, z.number().finite().min(BAND_VALUE_MIN).max(BAND_VALUE_MAX)])) as Record<string, z.ZodNumber>)
  .strict();

/** 四個角色定位各落在哪一格。 */
const zNormArchetypeBands = z
  .object(Object.fromEntries(ARCHETYPES.map((a) => [a, zBandName()])) as Record<string, ReturnType<typeof zBandName>>)
  .strict();

/** 十格出身表的一列。⭐ 允許只填一部分（沒填的退回四格那張）。 */
const zNormOriginBands = z
  .object(Object.fromEntries(ORIGINS.map((o) => [o, zBandName().optional()])) as Record<string, z.ZodOptional<ReturnType<typeof zBandName>>>)
  .strict();

/**
 * config.origin-routes@1 —— 出身 × 路線的**文案**（`config/origin-routes.json`）。
 *
 * ⛔ **一個數字都不進入戰鬥計算。** owner 2026-08-12：「我沒有要你作新機制，
 * 我只是要作為**調整英雄初始與成長屬性的定位參考**，並且可以更新在**英雄選角說明**」。
 * 真正驅動數值的是 `config.stat-normalization@1` 的十格出身表。
 *
 * ⚠️ 為什麼要獨立成一份文件：它是**純文案**（10 個出身 × 一句話 + 32 條路線 × 三句），
 * 而 stat-normalization 那一份每一格都是會進算式的數字。兩種東西混在一起，
 * 操作者沒有線索分辨他改的那一格會不會動到平衡。
 */
export const zOriginRoute = z
  .object({
    name: z.string().min(1).max(12),
    summary: z.string().min(1).max(120),
    gain: z.string().min(1).max(60),
    // ⚠️ 允許空字串但**不建議**：一條只加不減的不是路線，是被動。
    lose: z.string().max(60),
  })
  .strict();

const zOriginInfo = z
  .object({
    rule: z.string().min(1).max(60),
    tagline: z.string().min(1).max(120),
    // owner 2026-08-12：「個別**至少 2~4** 種路線」。
    routes: z.array(zOriginRoute).min(2).max(4),
  })
  .strict();

export const zConfigOriginRoutesDoc = z
  .object({
    id: zId,
    schema: z.literal("config.origin-routes@1"),
    note: z.string().optional(),
    /** 十個出身，⛔ 一個都不能少（`.strict()` 也擋掉多打的）。 */
    origins: z
      .object(Object.fromEntries(ORIGINS.map((o) => [o, zOriginInfo])) as Record<string, typeof zOriginInfo>)
      .strict(),
  })
  .strict();

/**
 * config.stat-normalization@1 — 英雄屬性正規化（owner 2026-08-12，第三版）。
 *
 * ⭐ owner：「你要重新寫出**定位 10 種**如何影響**極小小中大極大**的**所有屬性**」
 * → 十格出身 × 十項屬性 × 五格級距。⛔ `range` 不在裡面（雙峰，型別不是級別）。
 *
 * ⚠️ 前兩版的說明（「只套用移速與魔抗」「極小/極大不是格是上下限」）**已經失效**，
 * 那是我把範圍讀窄了 —— owner 2026-08-12：「出身跟定位**是影響所有屬性**不是這幾項而已」。
 */
export const zConfigStatNormalizationDoc = z
  .object({
    id: zId,
    schema: z.literal("config.stat-normalization@1"),
    note: z.string().optional(),
    mode: z.enum(["normalized", "legacy"]),
    /** 這一版真的套用的屬性。⛔ `range` 不在清單裡（雙峰，型別不是級別）。 */
    appliesTo: z.array(z.enum(NORMALIZED_STAT_KEYS)).max(NORMALIZED_STAT_KEYS.length),
    /** 每一項的**五格**數值。⭐ 由「中」× 階梯推出來，⛔ 不手打。 */
    bands: z
      .object(Object.fromEntries(NORMALIZED_STAT_KEYS.map((k) => [k, zNormBandValues])) as Record<string, typeof zNormBandValues>)
      .strict(),
    /** 四格定位表 —— owner 2026-08-12 逐字給的，留著當退路。 */
    byArchetype: z
      .object(Object.fromEntries(NORMALIZED_STAT_KEYS.map((k) => [k, zNormArchetypeBands])) as Record<string, typeof zNormArchetypeBands>)
      .strict(),
    /** ⭐ 十格出身表，**優先於**上面那張。 */
    byOrigin: z
      .object(Object.fromEntries(NORMALIZED_STAT_KEYS.map((k) => [k, zNormOriginBands])) as Record<string, typeof zNormOriginBands>)
      .strict(),
    /** 每一項寫進哪個通道。⚠️ `ms` 出貨走 `baseStats` 是量出來的機制限制。 */
    channel: z
      .object(Object.fromEntries(NORMALIZED_STAT_KEYS.map((k) => [k, z.enum(["baseStats", "growth"] as const)])) as Record<string, z.ZodEnum<["baseStats", "growth"]>>)
      .strict(),
    referenceLevel: z.number().int().min(2).max(99),
    /** 變身態往上位移幾格。出貨 1（本體中 → 變身大）。⛔ 0 = 變身與本體同級。 */
    transformBandShift: z.number().int().min(-4).max(4),
    allowNegativeGrowth: z.boolean(),
    skipTransformedBodies: z.boolean(),
  })
  .strict();

export const DEFAULT_STAT_NORMALIZATION_DOC = {
  id: STAT_NORMALIZATION_DOC_ID,
  schema: "config.stat-normalization@1",
  mode: DEFAULT_STAT_NORMALIZATION.mode,
  appliesTo: DEFAULT_STAT_NORMALIZATION.appliesTo,
  bands: DEFAULT_STAT_NORMALIZATION.bands,
  byArchetype: DEFAULT_STAT_NORMALIZATION.byArchetype,
  channel: DEFAULT_STAT_NORMALIZATION.channel,
  referenceLevel: DEFAULT_STAT_NORMALIZATION.referenceLevel,
  allowNegativeGrowth: DEFAULT_STAT_NORMALIZATION.allowNegativeGrowth,
  skipTransformedBodies: DEFAULT_STAT_NORMALIZATION.skipTransformedBodies,
} as const;

export const zConfigDispelDoc = z
  .object({
    id: zId,
    schema: z.literal("config.dispel@1"),
    note: z.string().optional(),
    /**
     * 止血閥。false = `dispel` 這個 effect kind 整條不作用。
     *
     * ⚠️ 它**只**關掉淨化。復活與回合重置走的是 `clearForFreshBody`，
     * 那兩條不受它影響 —— 它們不是淨化，是重置。
     */
    enabled: z.boolean(),
    /**
     * 沒標 `dispellable` 的 **status** 算不算可拔。出貨 **true**。
     *
     * 14 份 status 文件今天一格都沒標，所以這一格實際上就是「【淨化】拔不拔得到
     * 減速/纏繞/暈眩」。填 false = 上線當天什麼都拔不到，而那看起來跟功能壞掉
     * 一模一樣。
     */
    statusDefaultDispellable: z.boolean(),
    /**
     * 沒標 `dispellable` 的 **DoT** 算不算可拔。出貨 **true**。
     *
     * 單獨一格而不是跟 status 共用，因為 `world.dot` 在 A4 之前**完全沒有
     * 任何移除路徑** —— 把它打開是一次真的能力增加，值得有自己的閥。
     */
    dotDefaultDispellable: z.boolean(),
    /**
     * 沒標 `dispellable` 的 **ModifierSource**（道具被動／增益卡／靈氣投影）
     * 算不算可拔。出貨 **false**。
     *
     * ⛔ 出貨關著的理由：**沒有人預期自己買的裝備效果可以被敵人剝掉**。
     * 打開它會讓「敵方淨化」變成一個能拆對手裝備的機制 —— 那是一個設計決定，
     * 不是一個預設值。
     */
    buffDefaultDispellable: z.boolean(),
    /** 文件沒寫 `pools` 時，預設清不清 status。出貨 true。 */
    defaultPoolStatus: z.boolean(),
    /** 同上，dot。出貨 true。 */
    defaultPoolDot: z.boolean(),
    /**
     * 同上，護盾。出貨 **false** —— 淨化的語意是「拔狀態」，順手把護盾也吃掉
     * 會讓【破盾】(D1) 這件獨立道具失去存在理由。
     */
    defaultPoolShields: z.boolean(),
    /** 同上，buff。出貨 **false**，理由同 `buffDefaultDispellable`。 */
    defaultPoolBuffs: z.boolean(),
    /**
     * 一發淨化每一池最多拔幾層的**全域上限**：文件沒寫 `count` 時用它，
     * **寫了也夾不過它**（一句話管到底，避免出現兩個會分歧的上限）。
     *
     * 兩端都有界（#277）。上界 50 只擋多打一個零。
     */
    maxCountCap: z.number().int().min(1).max(50),
    /**
     * `count` 砍不完時**留下哪幾個**。
     *
     *   newest  先拔最晚掛上的（剛被暈到就解得掉 —— 玩家預期的那一種）
     *   oldest  先拔最早掛上的（優先清快過期的殘渣，實際上比較弱）
     */
    defaultOrder: z.enum(["newest", "oldest"]),
    /**
     * 殭屍身上的狀態吃不吃淨化。出貨 true。
     * 獨立一格的理由與 `tauntRules.appliesToMobs` 一模一樣：第 3 場之後場上
     * 大多數敵人就是殭屍，PvE 與 PvP 的答案不一定相同。
     */
    appliesToMobs: z.boolean(),
  })
  .strict();

/**
 * `config.wounds@1` —— 【重創】的全域規則（A6，#278）。
 *
 * 今天只有一格，而它是一個真的決策點：引擎自己對「同型效果怎麼疊」**沒有一致
 * 答案**（`missChance` 取 max、護盾相加），所以寫死等於替 owner 挑一個而不告訴他。
 * ⚠️ 三格倍率**不在**這裡 —— 它們住在施加重創的那張卡上（`applyStatus`），
 * 因為「這一支技能的重創有多重」本來就該逐支不同。
 */
/**
 * `config.damage-rules@1` —— 傷害規則。今天只有一格：**沒寫型別時用哪一種**。
 *
 * owner 2026-08-05：「請把技能傷害預設都改成 AP 傷害」。
 * ⚠️ 在此之前 `damageType` 是**必填**，所以這是新增一個預設而不是改掉一個。
 * 完整理由（含「為什麼它必須是一格看得到的欄位」）見 `sim/damageRules.ts` 檔頭。
 */
export const zConfigDamageRulesDoc = z
  .object({
    id: z.literal("damage-rules"),
    schema: z.literal("config.damage-rules@1"),
    note: z.string().optional(),
    defaultAbilityDamageType: z
      .enum(["physical", "magic", "true"])
      .describe(
        "一份傷害效果沒有寫 damageType 時用哪一種。magic = 吃魔抗（出貨值）；" +
          "physical = 吃護甲；true = 什麼減免都不吃。" +
          "⚠️ 只影響**沒寫**的那些 —— 已經明寫型別的技能一支都不會被改到。",
      ),
  })
  .strict();
export type ConfigDamageRulesDoc = z.infer<typeof zConfigDamageRulesDoc>;

/** ⚠️ 缺文件 = 這一份，不是空物件。 */
export const SHIPPED_DAMAGE_RULES: ConfigDamageRulesDoc = {
  id: "damage-rules",
  schema: "config.damage-rules@1",
  defaultAbilityDamageType: "magic",
};

export const zConfigWoundsDoc = z
  .object({
    id: z.literal("wounds"),
    schema: z.literal("config.wounds@1"),
    note: z.string().optional(),
    stackMode: z
      .enum(["max", "multiply"])
      .describe(
        "多筆重創同時在身上時怎麼合成。max = 只算最重的那一筆（與失手率一致，出貨值）；" +
          "multiply = 相乘，兩層 0.5 變成 0.25，疊到第三層幾乎等於禁療。",
      ),
  })
  .strict();
export type ConfigWoundsDoc = z.infer<typeof zConfigWoundsDoc>;

/** ⚠️ 缺文件 = 這一份，不是空物件（同 `DEFAULT_DISPEL_RULES` 的規矩）。 */
export const SHIPPED_WOUNDS: ConfigWoundsDoc = {
  id: "wounds",
  schema: "config.wounds@1",
  stackMode: "max",
};

/**
 * `config.weakness@1` —— 【虛弱】的全域定義（GH#301-4）。
 *
 * owner 2026-08-09：「虛弱 => **攻擊速度暫時減半、AP/AD 造成傷害暫時減半**」。
 *
 * ⚠️ 這三格**不在卡片上**，這是它與【重創】的分野：重創的倍率逐卡不同（「這一支
 * 技能的重創有多重」），而虛弱是 owner 給的一個**全域定義**（「虛弱就是減半」）。
 * 定義住在一個地方，所以調整它只要動這一頁，不用逐卡改。
 *
 * ⚠️ 兩個倍率兩端都有界（#277）：上界 1 不是平衡政策，是保險絲 —— 一個 >1 的
 * 「虛弱」會讓中了虛弱的人變強，而畫面上只看得到「他怎麼突然打很痛」。
 * 完整推導（為什麼砍封包不砍屬性、為什麼層數不放大它）見 `sim/weakness.ts` 檔頭。
 */
export const zConfigWeaknessDoc = z
  .object({
    id: z.literal("weakness"),
    schema: z.literal("config.weakness@1"),
    note: z.string().optional(),
    statusTag: z
      .string()
      .min(1)
      .max(64)
      .describe(
        "哪一個**狀態分類**算虛弱（狀態文件 tags 上的一個字串）。引擎不認任何寫死的狀態編號 —— " +
          "只要一份 status-effect 文件的 tags 帶了這個字，掛上它就會觸發虛弱。改這一格＝換一個分類。",
      ),
    attackSpeedMult: z
      .number()
      .min(0)
      .max(1)
      .describe(
        "被虛弱時攻擊速度乘多少。0.5 = 減半（出貨值，owner 2026-08-09）；1 = 這一半關掉；0 = 完全打不出來。",
      ),
    damageDealtMult: z
      .number()
      .min(0)
      .max(1)
      .describe(
        "被虛弱時**造成**的傷害乘多少。0.5 = 減半（出貨值）。⚠️ 是「他打出去的」不是「他受到的」，" +
          "而且連固定值傷害一起打折（砍 AD/AP 屬性的寫法對固定值完全沒作用）。",
      ),
  })
  .strict();
export type ConfigWeaknessDoc = z.infer<typeof zConfigWeaknessDoc>;

/** ⚠️ 缺文件 = 這一份，不是空物件（同 `SHIPPED_WOUNDS` 的規矩）。 */
export const SHIPPED_WEAKNESS: ConfigWeaknessDoc = {
  id: "weakness",
  schema: "config.weakness@1",
  statusTag: "weakness",
  attackSpeedMult: 0.5,
  damageDealtMult: 0.5,
};

export const zConfigBerserkDoc = z
  .object({
    id: zId,
    schema: z.literal("config.berserk@1"),
    note: z.string().optional(),
    /**
     * 主動暴走可以按下去的**生命比例**（0.15 = 15%）。生命 ≤ 它才放得出來；
     * 高於它 `castAbility` 回 `"hp-too-high"`，**魔力與冷卻一格都不扣**。
     *
     * 兩端都有界（#277）：上界 1 不是平衡政策，是保險絲 —— 打成 15 而不是 0.15
     * 等於「隨時能放」，而夾掉之後畫面上看不出差別。
     */
    castHpPct: z.number().min(0).max(1),
    /**
     * 暴走期間，**這一次**施法的冷卻要乘多少。2 = 變兩倍長（owner 的字面意思，
     * 暴走的代價）。1 = 不影響。
     *
     * 下界 0.1 而不是 0：0 = 每一支技能都沒有冷卻，那不是「冷卻縮短」是
     * 「無限連放」，而一個打錯的 0 看起來跟關掉這個功能一模一樣。
     */
    cooldownMult: z.number().min(0.1).max(10),
    /**
     * 上面兩格套用在誰身上。
     *
     *   berserkGrantors  只有會授予暴走的**主動技**（出貨值 —— 天生技走 hook
     *                    的 condition，不需要這道閘）
     *   off              施法閘不存在、冷卻也不加倍（＝這個功能整個下線，
     *                    但**看得見**它是被關掉的，不是壞掉的）
     */
    trigger: z.enum(["berserkGrantors", "off"]),
  })
  .strict();

/**
 * config.augment-filter@1 — 稜彩增益卡的敵方過濾器全域覆寫（批 1 決策點 1-1）。
 *
 * 目前只有一格:**殭屍算不算 `HookDef.victim: "enemyChampion"` 的敵人**。
 * 語意、owner 的裁決、以及「為什麼它不是一顆單一的全域布林」全部寫在
 * `sim/augmentEnemyFilter.ts`。
 *
 * 出貨值 `false` ＝ 字面語意 ＝ 這個欄位出現之前的行為，所以這份文件出現本身
 * **不改變任何一場比賽**（同 `config.shield@1`、與 `config.block@1` 相反）。
 *
 * 為什麼是自己一份文件而不是塞進 `config.combat-env@1`:那一份是**數值倍率
 * 表**（每一格都是一個 number，Go 平台 `apps/platform/internal/combatenv` 有一份
 * key 對 key 的鏡射，`keysync_test.go` 在守），塞一個 boolean 進去等於同時改
 * 三個語言的形狀。也不塞 `config.arena-rules@1`:那一份講的是**場地**（火圈、
 * 花、守衛塔、殭屍波），而這一格講的是**卡片文案怎麼解釋「敵」這個字**。
 *
 * **缺文件 = 出貨預設**，不是空表 —— 一個 `undefined` 的布林今天剛好等於
 * `false`，但那是巧合不是設計，而下一格（predicate 反過來的那種）不會這麼幸運。
 */
export const zConfigAugmentFilterDoc = z
  .object({
    id: zId,
    schema: z.literal("config.augment-filter@1"),
    note: z.string().optional(),
    /**
     * 打開之後，`victim: "enemyChampion"` 的 hook 也把敵對陣營的**小怪（殭屍）**
     * 算成合格目標。`"allyChampion"` 不受影響，`"enemy"` 本來就收。
     *
     * ⚠️ 它**不會**讓殭屍長出 `StatsComp`，所以掛在殭屍身上的 buff/status 照樣
     * 是靜默 no-op —— 這一格救得到的是「效果掛在自己身上」的那一族卡。
     */
    mobsCountAsEnemy: z.boolean(),
  })
  .strict();

/**
 * config.stealth@1 — 隱形規則 (隱形原語 lane D).
 *
 * 每一格的語意、以及「為什麼出貨值是這一個」寫在 `packages/shared/src/sim/
 * stealth.ts`。四個「擋不擋」與三個「破不破」全部是 WC3 原作行為,所以這份文件
 * 出現本身不改變任何一場比賽 —— 它只是把已經寫在程式裡的那些決定變成可以改的。
 *
 * ⚠️ **缺文件 = `DEFAULT_STEALTH_RULES`(出貨值)**,不是空表。空表在 TypeScript
 * 底下會讓四個 `blocks*` 全部讀成 `undefined`(falsy),也就是隱形只剩畫面、
 * 完全不影響索敵 —— 而畫面上看起來一切正常。
 *
 * 為什麼是自己一份文件而不是塞進 `config.combat-feel@1`:combat-feel 是**手感**
 * (擊退距離、打就站定、面向鎖),隱形是**可見性規則**,兩者一起調的機會是零;
 * 而且 combat-feel 那一頁的欄位是從 Zod 推導的,同一個理由(見 shield 那段)。
 */
export const zConfigStealthDoc = z
  .object({
    id: zId,
    schema: z.literal("config.stealth@1"),
    note: z.string().optional(),
    /** 隱形是否讓敵人的**自動索敵**看不到你(WC3: 是) */
    blocksAutoAcquire: z.boolean(),
    /** 隱形是否讓**殭屍/小怪的 aggro** 看不到你(WC3: 是) */
    blocksMobAggro: z.boolean(),
    /** 隱形是否讓敵方玩家**點不到你**(WC3: 是) */
    blocksManualTarget: z.boolean(),
    /**
     * 隱形是否讓**技能 AoE 打不到你**。
     * WC3 出貨值是 **false** —— 暴風雪照樣燒得到隱形單位。true 會把永久隱形
     * 變成「穿過整場戰鬥毫髮無傷」,那是另一種設計而不是原作。
     */
    blocksAbilityAoe: z.boolean(),
    /** 普攻是否破隱(WC3: 是) */
    breaksOnBasicAttack: z.boolean(),
    /** 施法是否破隱(WC3: 是) */
    breaksOnCast: z.boolean(),
    /** **被打**是否破隱(WC3: 否) */
    breaksOnDamaged: z.boolean(),
    /**
     * 全域淡出延遲倍率。1 = 照技能文件寫的秒數(27-00 永久性的隱形術 = 4.0 s,
     * 直接來自 w3x `Dur` 欄)。上界 10 是誤植守衛(#277 的形狀):打成 40 等於
     * 那位英雄整場再也不會隱形,而畫面上看起來就是「功能壞了」。
     */
    fadeDelayMult: z.number().min(0).max(10),
    /** 己方看到的隱形隊友不透明度。**不要設 0** —— 你會看不到自己的角色。 */
    allyAlpha: z.number().min(0).max(1),
    /** 敵方(沒有真視)看到的不透明度。0 = 完全消失;>0 = 半透明鬼影。 */
    enemyAlpha: z.number().min(0).max(1),
    /** 隱形時對敵方隱藏血條(WC3: 是 —— 看不到單位自然看不到血條) */
    hideEnemyHealthBar: z.boolean(),
  })
  .strict();

/**
 * config.taunt@1 — 嘲弄規則 (鍊金術之盾 godie-i06q 的 [嘲弄]).
 *
 * 每一格的語意、以及「為什麼出貨值是這一個」寫在
 * `packages/shared/src/sim/taunt.ts` 的 {@link TauntRules}。
 *
 * ⚠️ **缺文件 = `DEFAULT_TAUNT_RULES`(出貨值)**,不是空表。空表在 TypeScript
 * 底下會讓 `enabled` 讀成 `undefined`(falsy),也就是嘲弄靜默消失 —— 道具照樣
 * 買得到、描述照樣寫著「吸引周圍敵人」、內部冷卻照樣在跑,而場上沒有任何人被
 * 拉走。這是 `stealthRules` / `statCaps` 學過的同一課。
 *
 * 為什麼是自己一份文件而不是塞進 `config.combat-feel@1`:combat-feel 是**手感**
 * (擊退距離、打就站定、面向鎖窗口),嘲弄是**索敵規則**,兩者一起調的機會是零;
 * 而且 combat-feel 那一頁的欄位是 `deriveFields(zConfigCombatFeelDoc)` 推導的,
 * 而那支推導器不認得 enum(`conflictMode` 會落進 `unsupported`,而
 * `apps/admin/src/combatFeel.test.ts` 斷言 `unsupported` 必須是空陣列)——
 * 塞進去就是把隔壁工作流的頁面弄紅。同 `config.shield@1` 的理由。
 */
export const zConfigTauntDoc = z
  .object({
    id: zId,
    schema: z.literal("config.taunt@1"),
    note: z.string().optional(),
    /** 總開關;false = 嘲弄完全不存在(既有紀錄讀不出來,新的也寫不進去) */
    enabled: z.boolean(),
    /**
     * **決策點**:嘲弄要不要蓋掉玩家**自己右鍵點名**的目標。
     * 出貨 false = 只接管自動索敵與 bot／小怪 aggro,玩家手上的方向盤不動。
     * true = WC3 原作行為(嘲弄連玩家指令一起蓋掉)。
     */
    overridesManualOrder: z.boolean(),
    /**
     * **決策點**:上面那格開著時,嘲弄退掉之後要不要把玩家原本點名的目標
     * **還回去**。出貨 true。
     *
     * ⚠️ 它以前不存在,而缺席不是「少一個選項」是一個缺陷:被搶走的手選目標
     * 會被 `attackTargetAuto = true` 重新填上,也就是一次右鍵點名被**永久**
     * 轉成自動目標。一個布林值決定兩件事,而卡片上只寫了前一件。
     */
    restoreManualOrderOnLapse: z.boolean(),
    /** **決策點**:小怪(殭屍/殭屍王)吃不吃嘲弄。出貨 true。 */
    appliesToMobs: z.boolean(),
    /**
     * **決策點**:小怪被嘲弄時,嘲弄者是**取代**牠的最近敵人掃描(出貨
     * `replace`),還是只**偏袒**(`nearestFirst` —— 掃描照跑,嘲弄者只有在沒有
     * 更近的敵人時才贏)。
     */
    mobTauntMode: z.enum(["replace", "nearestFirst"]),
    /**
     * **決策點**:嘲弄在索敵比較器裡站哪一格。
     * `absolute`(出貨,= owner 卡面「優先攻擊自己」)= sort key 0,壓過
     * 「敵方英雄優先」與「威脅」;`aboveThreatOnly` = 排在「敵方英雄優先」
     * 之後。差別只在嘲弄者與另一個候選**種類不同**時看得到。
     */
    priority: z.enum(["absolute", "aboveThreatOnly"]),
    /**
     * **決策點**:一個被嘲弄的身體最多被拖多遠(GGD 單位)。0 = 不限制。
     * 出貨 24 = 一個決鬥區的半徑;上界 100 是誤植守衛(區域直徑才 48)。
     */
    leashUnits: z.number().min(0).max(TAUNT_LEASH_MAX),
    /**
     * **決策點**:一發**範圍**嘲弄最多拉幾個人。卡片沒寫 `maxTargets` 時用
     * 它,卡片寫了也夾不過它。出貨 20 = 這一格出現前寫死的那個數字。
     */
    maxTargetsCap: z.number().int().min(1).max(TAUNT_MAX_TARGETS),
    /**
     * **決策點**:上面那個上限砍人時**留下哪幾個**。
     * `nearest`(出貨,由近到遠)/ `lowestHp`(血最低先拉)/ `id`(先生成先拉)。
     */
    capOrder: z.enum(["nearest", "lowestHp", "id"]),
    /**
     * **決策點**:同一個人被兩個敵人先後嘲弄時誰贏。
     * newest(出貨)= 最後喊的贏;longest = 剩餘時間長的贏。
     */
    conflictMode: z.enum(["newest", "longest"]),
    /**
     * 全域持續時間倍率,乘在內容自己寫的秒數上。1 = 照文件寫的。
     * 上界 10 是誤植守衛(#277 的形狀):0.5 秒打成 40 倍就是 20 秒,
     * 整整一波交戰所有人都在打同一個人,而畫面上看起來就是「索敵壞掉了」。
     */
    durationMult: z.number().min(0).max(TAUNT_DURATION_MULT_MAX),
  })
  .strict();

/**
 * config.body-scale@1 — 身體放大倍數 → 攻擊距離 (GH#252).
 *
 * 每一格的語意、以及「為什麼出貨值是這一個」寫在
 * `packages/shared/src/sim/bodyScale.ts`。
 *
 * ⚠️ **這份文件的出貨值會改變平衡**,和 `config.shield@1` 相反:在它出現之前
 * 射程完全不看體型,所以出貨曲線不是「維持原狀」而是 owner 要的新行為。要退回
 * 舊行為把 `enabled` 關掉。
 *
 * ⚠️ **缺文件 = `DEFAULT_BODY_SCALE_RULES`(出貨值)**,不是空表 —— 空表在
 * TypeScript 底下會讓曲線讀成 `undefined`,而 `undefined[0].rangeMult` 一路
 * 乘進 `Stat.AttackRange` 就是全場沒有人打得到人。
 *
 * ⚠️ **兩端夾住,不外推。** 小於第一個斷點取第一列,大於最後一個取最後一列。
 * 這是一個決定不是省事:外推要猜一條沒有人審過的斜率,而一隻 `sizeMult` 8 的
 * 殭屍王會照那條斜率一路長到一個 owner 從來沒看過的射程。要涵蓋更大的體型,
 * **加一列**(那是一個看得見的決定),不要改成外推(那是一個看不見的決定)。
 */
export const zConfigBodyScaleDoc = z
  .object({
    id: zId,
    schema: z.literal("config.body-scale@1"),
    note: z.string().optional(),
    /** 總開關。false = 攻擊距離完全不看體型(= 這個功能出現之前的行為)。 */
    enabled: z.boolean(),
    /**
     * **決策點**:體型 → 普攻射程倍率的斷點表,中間線性內插、兩端夾住。
     *
     * owner 2026-08-01:「**通常不會是等比倍率**,例如 2x body, 1.2x 攻擊距離;
     * 3x body 1.3x攻擊距離」——「遞減」不是一個係數表達得出來的東西(單一係數
     * 只畫得出一條直線),所以這裡放的是表不是數。
     *
     * 上界:8 個斷點是可讀性上限(要捲動的表看不出它是不是遞減的);體型 10 是
     * 小怪波 `boss.sizeMult` 的出貨值(貼錯格擋在這裡);倍率 3 擋的是「把百分比
     * 當倍率填」(120 → 120 倍射程,那位英雄會從畫面外開打)。
     */
    attackRangeCurve: z
      .array(
        z
          .object({
            /** 身體放大倍數(英雄卡的 `bodyScale`,1 = 一般體型)。 */
            bodyScale: z.number().min(0.1).max(10),
            /** 這個體型對應的普攻射程倍率(1 = 照卡面)。 */
            rangeMult: z.number().min(0.1).max(3),
          })
          .strict(),
      )
      .min(2)
      .max(8)
      // 嚴格遞增:重複的 `bodyScale` 會讓內插除以 0(→ Infinity 射程),而順序
      // 錯掉的表在畫面上看起來完全正常,只有內插結果是亂的。
      .refine(
        (pts) => pts.every((p, i) => i === 0 || p.bodyScale > pts[i - 1]!.bodyScale),
        { message: "attackRangeCurve 必須依 bodyScale 由小到大排列,而且不可以有重複的體型" },
      ),
  })
  .strict();

/**
 * config.regen@1 — 百分比回血 **與百分比扣血** 規則 (GH#253).
 *
 * 每一格的語意寫在 `packages/shared/src/sim/regenRules.ts`。
 *
 * ⚠️ 兩族欄位都是「英雄卡有填才啟動」:
 *   · 回血族(`pctEnabled` / `pctMode` / `floorPerSec` …)看英雄卡的
 *     `healthRegenPctOfMax` —— **出貨內容目前沒有任何一位填它**,所以這一族
 *     現在對每一場比賽都是 no-op;
 *   · 扣血族(`drain*`)看 `healthDrainPctOfMax` —— 出貨只有海克力斯 - Berserker
 *     (`godie-hapm`,0.01)填了,而 `drainFloorPctOfMax: 0.01` 就是 owner
 *     2026-08-02 的「直到生命不足 1%」。
 *
 * ⚠️ **缺文件 = `DEFAULT_REGEN_RULES`(出貨值)**,不是空表:一個 undefined 的
 * `pctMode` 會讓 `healthRegenPerSec` 兩條分支都不走 = 全場沒有人回血。
 */
export const zConfigRegenDoc = z
  .object({
    id: zId,
    schema: z.literal("config.regen@1"),
    note: z.string().optional(),
    /** 百分比回血的總開關。false = 英雄卡上的百分比全部當作沒填。 */
    pctEnabled: z.boolean(),
    /**
     * **決策點**:百分比是**取代**英雄卡那條固定回血,還是**疊加**在上面。
     * `replace` = 出貨值 = owner 的「沒有保底」——「疊加」等於給了一條與最大
     * 生命無關的地板,那正是 owner 要移除的東西。
     */
    pctMode: z.enum(["replace", "add"]),
    /**
     * **決策點**:保底,每秒至少回這麼多點。**出貨 0 = 沒有保底**(owner 裁決)。
     * 上界 1000 是誤植守衛:Berserker 一級最大生命約 7.5k,1% 是 75/秒,
     * 所以 1000 已經是「這條地板自己就能撐住一場」。
     */
    floorPerSec: z.number().min(0).max(1000),
    /** **決策點**:百分比那一項要不要吃 戰鬥系統 的 `healthRegen` 全域倍率。 */
    applyEnvMultiplier: z.boolean(),
    /**
     * **決策點**:百分比只給英雄(出貨 true)。關掉之後,一隻臉是 Berserker 的
     * 隨機英雄殭屍王也會每秒回 1% 最大生命。
     */
    championsOnly: z.boolean(),
    /** 百分比**扣血**的總開關(出貨 true)。關 = 英雄卡上的自傷全部當作沒填。 */
    drainEnabled: z.boolean(),
    /**
     * **決策點**:扣血停在「最大生命的」這個比例。出貨 `0.01` = owner 2026-08-02
     * 的「直到生命不足 1%」。上界 0.5 是誤植守衛 —— 地板高過半條命的話,扣血在
     * 絕大多數局面裡一點事都不會發生。
     * ⚠️ 填 0 也扣不死人:扣血不走傷害管線,沒有人會設 `alive`,所以實作把有效
     * 地板夾在 1 點之上(`regenRules.ts` 的 `MIN_ALIVE_HP`)。
     */
    drainFloorPctOfMax: z.number().min(0).max(0.5),
    /**
     * **決策點**:打到地板那一刻停手還是夾住 —— 兩者在「同時被敵人打」時完全不同。
     * `stop`(出貨)= 扣血自己不再往下,但也不把血條往上拉,敵人照樣殺得死他
     * (自傷不是無敵,這是 owner 的裁決)。`clamp` = 每 tick 夾在地板 = 免疫致死。
     */
    drainFloorMode: z.enum(["stop", "clamp"]),
    /** **決策點**:扣血只給英雄(出貨 true)。關掉之後殭屍王也會自己掉血。 */
    drainChampionsOnly: z.boolean(),
  })
  .strict();

/**
 * config.victory-fx@1 — 勝利煙火的開關 (#93 / #235).
 *
 * owner 2026-08-02 實戰回饋：「天空的火焰似乎沒有被移除，我懷疑是煙火的時間太長」
 * → 裁決「請你直接取消煙火(變成後台開關)」。**出貨值兩格都是關的。**
 *
 * ⚠️ 程式碼一行都沒有刪。「回合結束要不要放煙火」是一個決策點，不是一個 bug
 * （CLAUDE.md 第一守則）——owner 改主意時是後台打一個勾，不是再改一次程式碼
 * 加重新部署。GH#251 的 `arenaFire` 是同一個形狀，也是同一個理由。
 *
 * ⚠️ **兩格分開，不是一格。** 兩層是刻意不同的效果（`fireworkMath` 的檔頭寫著
 * 「deliberately NOT the same effect at two sizes」），而且成本與頻率差一個
 * 量級：回合小煙火一場放 3–5 次、峰值 +28 個 ParticleSystem、持續約 1.3 秒；
 * 全場結束的烤雞煙火一場放一次、峰值 +8 個 ParticleSystem 加一個自訂 shader 的
 * mesh、持續約 4.3 秒。用一格把兩者綁死，等於下次 owner 想「只留吃雞」時又要
 * 改一次程式。
 *
 * ⚠️ 這一份**不管畫面變灰／變暗**（`render/victoryPresentation` 的 wash）、
 * 也不管勝利的嘲弄語音（`config/victory-taunts.json`）。owner 要拿掉的是**煙火**，
 * 把結算畫面的底色和語音一起關掉會是一個沒有人要求的迴歸。
 */
export const zVictoryFireworkTier = z
  .object({
    /** 這一層煙火要不要放。false = 一個粒子系統都不會被建立。 */
    enabled: z.boolean(),
  })
  .strict();

export const zConfigVictoryFxDoc = z
  .object({
    id: zId,
    schema: z.literal("config.victory-fx@1"),
    note: z.string().optional(),
    /** 每一回合贏的時候，天空那一輪小煙火（#235，約 1.3 秒）。 */
    roundVolley: zVictoryFireworkTier,
    /** 全場結束吃雞時，那隻全螢幕的烤雞煙火（#93，約 4.3 秒）。 */
    matchChicken: zVictoryFireworkTier,
  })
  .strict();

/**
 * config.lobby-layout@1 — 大廳左欄的上下分割政策（GH#255）。
 *
 * owner:「原本排行榜移到朋友列表下半部，各佔左邊排的上下各半」。
 *
 * ⚠️ 值的**唯一真相**是 `apps/client/src/ui/platform/lobbyLayout.ts` 的
 * `DEFAULT_LOBBY_LAYOUT` —— 那一份是螢幕真的在用的。這裡這一份是內容層的鏡像,
 * `apps/admin/src/laneConfigDocs.test.ts` 逐格比對兩邊,所以它們不可能各走各的。
 *
 * ⚠️ **這份文件目前沒有執行期消費端**（`LobbyScreen.tsx` 直接吃常數）。它在
 * `configDocCoverage.ts` 上以 DEFERRED 掛帳,到期條件是機器數出來的呼叫端數量。
 * 不要在別的地方再抄一份預設值。
 */
export const zConfigLobbyLayoutDoc = z
  .object({
    id: zId,
    schema: z.literal("config.lobby-layout@1"),
    note: z.string().optional(),
    /**
     * 左欄在寬螢幕上的固定寬度（px）。上界 480 是「左欄吃掉半個 1024 平板」;
     * 下界 180 之下,朋友名字與排名列都會被截斷成看不懂。
     */
    leftColumnWidthPx: z.number().int().min(180).max(480),
    /**
     * 分割模式下,**朋友列表**佔左欄高度的比例（0..1）。
     *
     * ⚠️ 語意在 2026-08-03 變了,舊註解「`0.5` 就是 owner 的『各半』」已經是謊話:
     * owner 說「大廳 FRIEND 跟排位榜 **中間**,多出一個區域顯示所有大廳正在線上的
     * 玩家列表」—— 左欄從**兩塊**變成**三塊**,所以「各半」不存在了,出貨值是
     * 40 / 30 / 30。上下界從 0.2/0.8 收成 0.15/0.7,抄的是
     * `apps/client/src/ui/platform/lobbyLayout.ts` 的 `LOBBY_LAYOUT_BOUNDS`
     * （那份是渲染端自己的判準:低於 0.15 一塊面板就只剩標題沒有列）。
     *
     * ⚠️ 三段加起來必須是 1。flexbox **不會**檢查這件事（grow 是相對的）,所以
     * 0.5/0.5/0.5 會排得好好的而文件宣稱 50%/50%/50% —— 那就是一個「40%」欄位
     * 不再是百分比的瞬間。檢查在 `lobbyLayoutProblems()`,不是靠渲染器隱含。
     */
    friendsShare: z.number().min(0.15).max(0.7),
    /** 分割模式下,**線上玩家**佔左欄高度的比例（0..1）。三段相加必須是 1。 */
    onlineShare: z.number().min(0.15).max(0.7),
    /** 分割模式下,**排位榜**佔左欄高度的比例（0..1）。三段相加必須是 1。 */
    leaderboardShare: z.number().min(0.15).max(0.7),
    /**
     * 線上玩家列表遇到**已經是朋友**的人怎麼顯示 —— 這是決策點不是數值。
     * `greyed-button` 那一列留著,按鈕變成不能按的「已加入」;
     * `hide-row` 直接把那一列拿掉。
     */
    alreadyFriendMode: z.enum(["greyed-button", "hide-row"]),
    /** 堆疊模式（手機）下三塊面板由上到下的順序。 */
    stackOrder: z.array(z.enum(["friends", "online", "leaderboard"])).length(3),
    /** 堆疊模式下,每一塊面板保證拿到的高度（px）。 */
    minSlotHeightPx: z.number().int().min(80).max(600),
    /** 左欄矮於這個高度（px）就不分割、改成整欄一起捲。 */
    splitMinHeightPx: z.number().int().min(320).max(1200),
    /**
     * 視窗窄於這個寬度（px）時左欄已經是整頁寬的一條,再按高度切一半沒有意義。
     * 出貨值刻意等於 `ui/platform/ranking.css` 的 `@media (max-width: 720px)`。
     */
    stackBelowWidthPx: z.number().int().min(320).max(1600),
  })
  .strict();

/**
 * config.valhalla-sandbox@1 — 英靈殿技能試放空間的規則（GH#254）。
 *
 * owner 原話:「英靈殿 多一個施展技能小模擬空間(但人不會移動，鏡頭永遠跟著人)
 * 以及一個生命 10,000 的假人 (生命歸零3秒後自動補滿)」——
 * `dummyHealth` 與 `dummyRespawnSec` 兩格是他明說的,其餘五格是被寫成欄位的
 * 決策點（CLAUDE.md 第一守則:「心裡出現要選 A 還是 B」的那些）。
 *
 * ⚠️ 值與上下界的**唯一真相**是
 * `apps/client/src/ui/platform/valhalla/valhallaSandboxRules.ts` 的
 * `DEFAULT_VALHALLA_SANDBOX` / `VALHALLA_SANDBOX_BOUNDS`;這裡是內容層的鏡像,
 * `apps/admin/src/laneConfigDocs.test.ts` 逐格比對。
 *
 * ⚠️ 同樣**還沒有執行期消費端**（沙盒直接吃常數）,見 `configDocCoverage.ts`。
 */
export const zConfigValhallaSandboxDoc = z
  .object({
    id: zId,
    schema: z.literal("config.valhalla-sandbox@1"),
    note: z.string().optional(),
    /** 假人的生命上限。owner 明說 10,000。 */
    dummyHealth: z.number().int().min(1).max(1_000_000),
    /** 假人歸零之後幾秒補滿。owner 明說 3 秒;0 = 立刻補滿也是合法玩法。 */
    dummyRespawnSec: z.number().min(0).max(60),
    /** 假人站在英雄正前方幾公尺。太遠近戰會完全空揮（房間裡不能走路）。 */
    dummyDistance: z.number().min(0.5).max(30),
    /** 沙盒要不要套用線上的 combat-env 全域倍率（#125:預覽不可以說謊）。 */
    applyCombatEnv: z.boolean(),
    /** `anchor` = 連擊退/衝刺都推不動;`input` = 只吃掉走位指令。 */
    movementLock: z.enum(["anchor", "input"]),
    /** 進場就把 W/E/R 升到 1 級並解鎖 EX。關掉的話六格裡有五格是死的。 */
    unlockAllSlots: z.boolean(),
    /** 魔力不消耗。關掉的話多數英雄放兩三發就會 `no-mana`。 */
    infiniteMana: z.boolean(),
  })
  .strict();

/**
 * config.item-card@1 — 道具卡片的**排版與配色**（`config/item-card.json`）。
 *
 * owner 2026-08-02, verbatim:
 *   「卡片道具的排版連在一起不好閱讀，關於效果及數值的部分應該要特殊顏色表示」
 *   「先做傳說武器道具開放的49個的部分就好」
 *   「別漏掉 [隱形]、[焚身] ...之類」
 *
 * ── 為什麼是一份 config 文件，不是元件裡的 if-else ──────────────────────────
 * owner 手寫的 49 支傳說文案把機制關鍵字寫成 `[標記]`（`[焚身]`、`[緩慢]`…），
 * 而那些字**不准被改**（`legendary49OwnerText.test.ts` 逐位元組比對）。所以卡片
 * 只能在**渲染時**解析：把 `[xx]` 認成 chip、把數值認成 token。那就需要一張
 * 「標記 → 分類」對照表，而這張表**一定會長**：owner 每寫一支新道具就可能發明
 * 一個新標記。表寫在元件裡 = 每新增一個標記就是一次 rebuild + 重啟容器；表寫在
 * `content/` = 存檔就生效（第一守則的那個理由，這裡是第 N 次）。
 *
 * ── 四個分類是 owner 核准的語意，不是這裡發明的 ─────────────────────────────
 *   `stat`    屬性加成（純數值，不需要任何事件）
 *   `active`  主動效果（需觸發：普攻、施法、擊殺、受擊…）
 *   `passive` 被動效果（常駐，沒有觸發事件）
 *   `debuff`  負面/控場（作用在敵人身上）
 *
 * ⚠️ 分類線最模糊的一條是 active↔passive。這裡採用的判準是「**有沒有一個離散的
 * 觸發事件**」：`[擴散]`（普攻濺射）算 active，`[流星]`（每秒自動）算 passive。
 * 這是判斷，不是真理 —— 所以它是一格資料。覺得 On-Hit 該算常駐，改這份 JSON 的
 * 一列即可，不要回來改程式。
 *
 * ── 未知標記不可以讓卡片壞掉 ────────────────────────────────────────────────
 * `unknownCategory` 是表上查不到的標記落到哪一類。它存在的理由是失敗形態：
 * owner 明天寫一支新道具用了新標記，卡片必須照常畫出來（chip 有顏色、有分行），
 * 只是分類是預設的那一類。
 */
export const zItemCardCategory = z.enum(["stat", "active", "passive", "debuff"]);

/** 一個分類的畫面樣子：中文標籤 + 它的專用色。 */
const zItemCardCategoryStyle = z
  .object({
    /** chip 旁邊那個分類名（玩家看得到）。 */
    label: z.string().min(1).max(12),
    /** 這一類 chip 的文字/邊框色。卡片專用配色，刻意不沿用戰鬥飄字那五個色。 */
    color: zColorHex,
  })
  .strict();

export const zConfigItemCardDoc = z
  .object({
    id: zId,
    schema: z.literal("config.item-card@1"),
    note: z.string().optional(),
    /** 四個分類各自的標籤與顏色。 */
    categories: z
      .object({
        stat: zItemCardCategoryStyle,
        active: zItemCardCategoryStyle,
        passive: zItemCardCategoryStyle,
        debuff: zItemCardCategoryStyle,
      })
      .strict(),
    /** 數值 token（`+87`、`30%`、`0.6秒`…）的顏色 —— owner 要的「數值特殊顏色」。 */
    numberColor: zColorHex,
    /** 解說/歷史那一段的顏色（刻意比效果暗，讓效果先被讀到）。 */
    loreColor: zColorHex,
    /** 表上查不到的標記落到哪一類 —— 新標記絕不可以讓卡片壞掉。 */
    unknownCategory: zItemCardCategory,
    /**
     * 標記 → 分類。key 是**方括號裡的原字**，一字不差（`On-Hit` 與 `OnHit` 是
     * 兩列，因為 owner 的原稿兩種都寫過，而原稿不准改）。
     */
    markers: z.record(z.string().min(1), zItemCardCategory),
    /**
     * 方括號裡其實是**內嵌數值**而不是關鍵字的那些字串，照數值上色、不畫成 chip。
     *
     * 這一格不是為了通用性發明的：49 支裡真的有一個 ——
     * 虛哭神去（godie-i007）的 `[自身已損失的生命百分比數值(0~100)]`。owner 用
     * 方括號當「這裡填一個值」的佔位符，不是當關鍵字。把它畫成 chip 會出現一個
     * 20 字寬的分類標籤，那就是排版壞掉。
     */
    inlineValueMarkers: z.array(z.string().min(1)),
    /**
     * 哪些整行的字是**段落標題**而不是內容（`效能`、`解說`、`歷史`…）。
     * 比對時會先去掉結尾的全形/半形冒號 —— 狂暴軒轅劍寫的是 `效能：`。
     */
    efficacyHeadings: z.array(z.string().min(1)),
    /** 同上，但這些標題以下的內容是**解說**（暗色、不解析數值）。 */
    loreHeadings: z.array(z.string().min(1)),
  })
  .strict();

/* ══════════════════════════════════════════════════════════════════════════
 * config.boss-intro@1 —— 殭屍王出場演出 (owner 2026-08-02)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * owner 2026-08-02：「殭屍王出場 會音效+大字講該英雄的名言，然後跳出該英雄的
 * 描述及攻略注意要點及弱點等提示，五秒後提示淡出消失」
 *
 * ── 「該英雄」是誰：**每次召喚都不一定是同一個人** ─────────────────────────
 * `mobWaves.boss.championSource` 的出貨值是 `"random"`（owner 2026-07-29
 * 「特殊殭屍 殭屍王 預設是隨機」），所以王借的是**當回合抽到的那位英雄**的臉、
 * 數值與模型 —— 不是固定的喪標麥可。抽籤發生在 arm time
 * （`sim/mobs.mobRulesFromConfig` 的 `mobKindChampion`），結果現在被寫進
 * `MobBossRules.championId` 並隨 `mobBossSpawn` 過線，所以這一頁的內容是
 * 「**這一隻**王穿的是誰」查出來的，不是猜的。
 *
 * ⚠️ 這就是為什麼**逐英雄的文案不能寫死在程式裡**：可能出場的是 120 位裡的
 * 任何一位。缺資料是常態而不是例外，所以 `bossIntroContent` 的契約是
 * 「只吐存在的段落」，不是「缺一段就整個不畫」。
 *
 * ── 名言：**今天沒有這份資料，而且我們沒有編造它** ────────────────────────
 * 每位英雄的名言是 GH#139 / #142，兩張都還是 pending：`champion@1` 沒有
 * `quote` 欄位，`config/victory-taunts.json` 裡的是**嘲弄台詞**（對輸家講的
 * 原創挖苦），不是那個角色的名言，拿來當名言用是張冠李戴。
 * 所以 {@link zBossIntroChampionEntry} 有 `quote` 這一格、出貨值**全部留空**，
 * 由 owner（或 #139）填。空的時候大字整段不畫 —— 不是畫一個空框，也不是塞一句
 * 我們自己寫的台詞。
 *
 * ── 為什麼逐英雄文案在 config 而不在 champion doc ───────────────────────
 * 和 `config/victory-taunts.json` 同一個形狀（那份也是 `championId -> 文案`）：
 * 演出文案是**演出**的資料，不是英雄的定義；放在這裡，一份文件就能看完整場
 * 演出要講什麼，也不用為了一句提示去動 120 份 champion doc。
 */
export const zBossIntroChampionEntry = z
  .object({
    /**
     * 大字名言。**出貨一律空字串**（見上）。空 = 大字那一段整段不畫。
     * ⚠️ 這一格不是「隨便寫一句氣勢的話」；它是那個角色**原作裡的名言**，
     * 沒有考據來源就留空。
     */
    quote: z.string().max(80).optional(),
    /** 攻略注意要點 —— 「打這隻的時候要記得做什麼」。 */
    tips: z.array(z.string().min(1).max(60)).max(6).optional(),
    /** 弱點 —— 「牠哪裡可以被吃」。 */
    weaknesses: z.array(z.string().min(1).max(60)).max(6).optional(),
    /** 這幾行是怎麼推導出來的（給下一個編輯的人看，不上畫面）。 */
    authoringNote: z.string().max(600).optional(),
  })
  .strict();

export const zConfigBossIntroDoc = z
  .object({
    id: zId,
    schema: z.literal("config.boss-intro@1"),
    note: z.string().optional(),
    /**
     * **決策點**：整段出場演出要不要存在。關掉 = 只剩既有的 4.6 秒降臨橫幅與
     * 恐怖音效，名言／描述／要點／弱點一格都不畫。止血閥：這一段吃掉螢幕中央
     * 走廊好幾秒，線上覺得礙眼時要能在不重新部署的情況下關掉。
     */
    enabled: z.boolean(),
    /**
     * 提示停留幾秒才開始淡出（owner 明說五秒）。
     * ⚠️ 這一格是欄位不是常數，因為 owner 對時長一向會調（火圈、商店倒數、
     * 死亡淡出都被改過）。上界 30 是誤植守衛：5 打成 50 會讓提示蓋著整場前半。
     */
    introHoldSec: z.number().min(0).max(30),
    /** 淡出花幾秒。0 = 直接消失（不建議：瞬間消失讀起來像掉幀）。 */
    fadeSec: z.number().min(0).max(5),
    /**
     * **決策點**：描述最多顯示幾個字，超過截斷加省略號。
     * champion doc 的 `description` 是完整故事（喪標麥可那一份 400 字以上），
     * 整段搬上戰鬥畫面就是一面牆。0 = 不顯示描述那一段。
     */
    descriptionMaxChars: z.number().int().min(0).max(400),
    /** 最多列幾條攻略要點（超過的不畫）。0 = 不顯示這一段。 */
    maxTips: z.number().int().min(0).max(6),
    /** 最多列幾條弱點（超過的不畫）。0 = 不顯示這一段。 */
    maxWeaknesses: z.number().int().min(0).max(6),
    /**
     * #291 —— **版面高度**。owner 2026-08-03:「殭屍王出場的描述框 不夠大
     * 描述還有很多沒顯示完」。
     *
     * ⚠️ 這一組以前是 `ui/hud/bossIntroModel.ts` 裡六個寫死的常數，而
     * `descriptionMaxChars` 是唯一可調的那一格 —— 於是**把字數調大完全看不出
     * 差別**：版面永遠只算 34px（約兩行）給描述，多出來的字被外框的
     * `overflow: hidden` 吃掉。三層各自獨立在吃字，只改一層等於沒改。
     *
     * ⚠️ 這幾格是**和 `BossIntroOverlay.tsx` 的 CSS 對齊的量**，不是隨便填的
     * 美感值：`descLineH` 要等於描述那一行的 `fontSize × lineHeight`
     * （出貨 12 × 1.35 ≈ 16.2 → 17），`descCharsPerLine` 是 460px 寬的面板扣掉
     * 24px 左右留白之後，12px 中文字大約塞得下的字數。填錯的代價是版面算出來的
     * 高度和畫出來的高度不一樣 —— 算太少會截字（就是這次的缺陷），算太多會在
     * 底下留一塊空白。
     */
    layout: z
      .object({
        /** 大字名言那一行的高度 */
        quoteH: z.number().min(0).max(200),
        /** 英雄名那一行的高度（這一行永遠在） */
        nameH: z.number().min(0).max(200),
        /** 描述**一行**多高 */
        descLineH: z.number().min(1).max(80),
        /** 描述最多佔幾行 —— 這一格才是「描述框有多大」 */
        descMaxLines: z.number().int().min(1).max(24),
        /** 描述一行大約幾個字（換算行數用） */
        descCharsPerLine: z.number().int().min(1).max(200),
        /** 一個段落標題（「攻略要點」／「弱點」）多高 */
        headH: z.number().min(0).max(120),
        /** 一條列點多高 */
        rowH: z.number().min(0).max(120),
        /** 外框上下留白合計 */
        padH: z.number().min(0).max(120),
      })
      .strict()
      .optional(),
    /**
     * #291 **決策點** —— 走廊高度不夠時**先丟哪一段**。
     * SHIPS `["description", "tips", "weaknesses"]`（＝這一格出現之前寫死的順序）。
     *
     * 為什麼它現在必須是一格：把描述框加高的代價是**矮螢幕上更容易連攻略要點都
     * 保不住**。原本的理由是「描述是身世故事，戰鬥中最不影響下一秒的動作；弱點是
     * 『現在要怎麼打』的答案，最後才丟」—— 那是一個判斷，不是一條定律，而它的
     * 後果會隨著描述變大而變重。填 `["tips","weaknesses","description"]` 就是
     * 「我寧可先保住描述」。列表裡沒提到的段落＝**最後才丟**。
     * 名言不在選項裡：它是 owner 指名的主角，而且只有真的有資料時才存在。
     */
    dropOrder: z.array(z.enum(["description", "tips", "weaknesses"])).max(3).optional(),
    /** championId -> 這一隻王穿上那張臉時要講什麼。沒有的 key = 那位沒有文案。 */
    champions: z.record(zBossIntroChampionEntry),
  })
  .strict();

/**
 * config.roster@1 — **哪些英雄已經下架**（owner 2026-08-02:「預設不應該再有」）。
 *
 * ── 為什麼這是一份文件而不是一張寫死的表 ─────────────────────────────────
 *
 * 前例是 `championForms.ts` 的 `CHAMPION_FORM_PAIRS`：那也是一條「這隻不可以被
 * 選」的規則，而它寫死在 TS 裡。下架**不一樣** —— 它是 owner 的內容裁決，會隨
 * 內容補完而改變（今天下架是因為技能沒做完，做完就該上架），寫死等於每改一次
 * 主意就要 rebuild + 重啟容器。`content/` 是 host 上的 live bind-mount，
 * 這一份存檔就生效。CLAUDE.md 第一守則。
 *
 * ── 為什麼不是白名單就好 ─────────────────────────────────────────────────
 *
 * ⚠️ 白名單**擋不住這件事**，兩個洞：
 *   ① 平台連不上時客戶端退到 `NO_FILTER`（champSelectFilter 的 `NO_FILTER`），
 *      **整份 119 隻全開**。localhost 與任何一次平台故障都走這條，
 *      而我們的試玩幾乎都在 localhost —— 也就是白名單那一格在我們自己看得到的
 *      環境裡永遠是 no-op。
 *   ② 伺服器端 `CurationWhitelist.bypass` 同理。
 * 而且白名單是**營運狀態**（後台勾選、可被一鍵重設覆蓋），下架是**內容事實**。
 * 一個手滑的勾選不應該把技能名字全是 `"none"` 的半成品放回選人畫面。
 * 所以這條規則刻意放在白名單**之外**，兩邊都擋。
 *
 * ── 出貨的兩隻 ───────────────────────────────────────────────────────────
 *
 * `godie-e00u` 十六夜Sakuya 與 `godie-u01f` 黑化張飛：各 5 支技能裡有 **4 支
 * `name: "none"`**（QWER 全部），也就是選到就是四格空技能。owner 2026-07-30
 * 說下架，2026-08-02 再確認一次「預設不應該再有」。
 */
export const zConfigRosterDoc = z
  .object({
    id: zId,
    schema: z.literal("config.roster@1"),
    note: z.string().optional(),
    /**
     * 已下架的英雄 id。這些 id **不會**出現在選人畫面、大廳英靈殿、商店英雄列，
     * 隨機也抽不到，伺服器直接拒絕，**不管白名單是什麼狀態**。
     *
     * ⚠️ 這裡放的是 id 不是名字：名字有 19 組重複（變身對），用名字會誤傷本體。
     * ⚠️ 空陣列 = 沒有人下架，是合法且有意義的狀態（全部上架）。
     */
    retiredChampions: z.array(z.string()),
  })
  .strict();

/* ══════════════════════════════════════════════════════════════════════════
 * config.replay@1 —— 對戰錄影政策 (owner 2026-08-02)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * owner 2026-08-02：「請幫我預設打開，就算玩到一半就離開也應該有 replay 才對」
 *
 * ── 為什麼這份文件存在（＝在此之前的狀態）────────────────────────────────
 * #175 的錄影從頭到尾**沒有開關**。`MatchRoom.onCreate` 無條件呼叫
 * `MatchRecorder.open()`，落地間隔是 `Recorder.ts` 裡的 `const FLUSH_MS = 500`，
 * 保留量是 `store.ts` 裡的 `RETAIN_MAX_FILES = 200` / `RETAIN_MAX_AGE_DAYS = 30`。
 * 三個都是 CLAUDE.md 第一守則點名的那種寫死：**每一個都是一個「A 還是 B」的
 * 決定**，而它們一個都不在後台，改任何一個都要 rebuild 映像 + 重啟容器。
 *
 * ⚠️ 「預設打開」在程式上一直是真的（沒有開關 ⇒ 永遠開）。owner 之所以覺得它
 * 是關的，是因為 GH#170：正式機的 `/data/replays` 是 root 的、容器跑 uid 1000，
 * `createWriteStream` **非同步**吃到 EACCES，於是每一場都「開了錄影、零位元組
 * 落地」。那個病灶的解法在 `replayHealth.ts` + `docs/replay-observability.md`，
 * 不在這份文件裡 —— 這份文件解的是「開關本身不存在」。
 *
 * ── 這份文件**不**收什麼 ──────────────────────────────────────────────────
 * `GGD_REPLAY_DIR` / `GGD_REPLAY_REQUIRED` / `GGD_REPLAY_UNHEALTHY_AFTER` /
 * `GGD_REPLAY_HEALTHZ_STATUS` 留在環境變數，**刻意的**：那四個是「這台機器的
 * 監控行為」，一台一個值，而且 `/healthz` 要在內容樹載入之前就答得出來。
 * 這份文件收的是「錄影政策」——每一場比賽都適用、owner 會想改的那些。
 */
export const zConfigReplayDoc = z
  .object({
    id: zId,
    schema: z.literal("config.replay@1"),
    note: z.string().optional(),
    /**
     * 要不要錄影。**出貨值 true**（owner 2026-08-02「請幫我預設打開」）。
     *
     * 關掉之後這台 shard 上的每一場都完全不開錄影檔：後台「對戰回放」不會再有
     * 新的一列，`/healthz` 的 `replay.opened` 停在原地。留這一格是因為錄影是
     * best-effort 的旁路 —— 磁碟快滿、或某一場出了會讓錄影器自己爆掉的內容時，
     * 這是唯一不用重新 build 映像就能止血的閥。
     */
    enabled: z.boolean(),
    /**
     * 緩衝的錄影行多久交給檔案串流一次（毫秒）。**出貨值 500**。
     *
     * 它決定的是「**中途離開最多丟掉幾秒**」：程序被 `kill -9`（容器重啟、OOM）
     * 時，還沒交出去的那一段就沒了。調小 = 掉的秒數變少，代價是每分鐘多幾次
     * write syscall；調大 = 反過來。**不可以調成 0** —— 那等於每 tick 寫檔，
     * 而錄影器的第一條契約是「不准在 tick 路徑上做同步磁碟 I/O」。
     *
     * 上界 10000：再大的話一次容器重啟就會吃掉十秒以上的比賽，而那正是這張單
     * 要修的東西。下界 50：低於這個值只是在燒 syscall，換不到有意義的秒數。
     */
    flushIntervalMs: z.number().int().min(50).max(10_000),
    /**
     * 磁碟上最多留幾份錄影（新的贏）。**出貨值 200**。
     *
     * 影響的是「多久以前的那一場還找得回來」與磁碟佔用。實測一場 4 分鐘 12 人
     * 的比賽壓縮後約 60 KB，所以 200 份約 12 MB。調到 1 等於「只留最新一場」。
     */
    retainMaxFiles: z.number().int().min(1).max(5_000),
    /**
     * 超過幾天的錄影一律刪掉（與上面那條取先觸發的）。**出貨值 30**。
     *
     * 影響的是「上個月那一場還在不在」。錄影檔帶著玩家顯示名稱，所以這一格
     * 同時是保留期限，不只是磁碟策略。
     */
    retainMaxAgeDays: z.number().int().min(1).max(3_650),
  })
  .strict();

/** The `config` collection accepts all variants (discriminated on `schema`). */
export const zConfigDoc = z.discriminatedUnion("schema", [
  zConfigReplayDoc,
  zConfigRosterDoc,
  zConfigBossIntroDoc,
  zConfigMatchDoc,
  zConfigStoreDoc,
  zConfigArenaRulesDoc,
  zConfigCombatEnvDoc,
  zConfigAmbientVfxDoc,
  zConfigVfxFamiliesDoc,
  zConfigAudioMapDoc,
  zConfigChampionVoicesDoc,
  zConfigUnitTintsDoc,
  zConfigGoreDoc,
  zConfigDamageColorsDoc,
  zConfigIconPlanDoc,
  zConfigVictoryTauntsDoc,
  zConfigVoxelBarcodesDoc,
  zConfigVoxelBodiesDoc,
  zConfigBaseBonusDoc,
  // 每級加成（owner 2026-08-13）。⚠️ 漏掉這一行 = 內容整份驗證失敗 → 骨架英雄。
  zConfigPerLevelBonusDoc,
  zConfigStatCapsDoc,
  zConfigCombatFeelDoc,
  zConfigFormVisualsDoc,
  zConfigModelLodDoc,
  zConfigVfxCleanupDoc,
  zConfigRoundGradeDoc,
  zConfigShieldDoc,
  zConfigBlockDoc,
  // 暴擊規則（GH#302）。⚠️ 漏掉這一行 = 一份 crit.json 進了 content/ 之後整份
  // 內容驗證失敗 → 骨架英雄，理由見下面那一段。
  zConfigCritDoc,
  zConfigBerserkDoc,
  zConfigWoundsDoc,
  // 【虛弱】的全域定義（GH#301-4）。⚠️ 漏掉這一行 = 一份 weakness.json 進了
  // content/ 之後整份內容驗證失敗 → 骨架英雄，理由見下面那一段。
  zConfigWeaknessDoc,
  zConfigDamageRulesDoc,
  zConfigDispelDoc,
  zConfigCooldownRulesDoc,
  // 吟唱規則（owner 2026-08-13）。⚠️ 漏掉這一行 = 一份 cast-time.json 進了
  // content/ 之後整份內容驗證失敗 → 骨架英雄（2026-08-02 事故的形狀）。
  zConfigCastTimeDoc,
  // AoE 四級距（owner 2026-08-11）。⚠️ 漏掉這一行 = 一份 aoe-tiers.json 進了
  // content/ 之後整份內容驗證失敗 → 骨架英雄，理由見下面那一段。
  zConfigAoeTiersDoc,
  // 英雄屬性正規化（owner 2026-08-12）。⚠️ 漏掉這一行 = 一份 stat-normalization.json
  // 進了 content/ 之後整份內容驗證失敗 → 骨架英雄。
  zConfigStatNormalizationDoc,
  // 出身 × 路線的文案（owner 2026-08-12）。⚠️ 漏掉這一行 = 內容整份驗證失敗 → 骨架英雄。
  zConfigOriginRoutesDoc,
  // ⚠️ 批 1 (2026-08-04) 的新 schema tag。**union 漏掉這一行 = 整份內容驗證
  // 失敗 → main.tsx 的 fail-open 退回 2 隻骨架英雄**,而網站看起來完全正常。
  // 那正是 2026-08-02 線上壞掉四小時的形狀,理由寫在下面那一段。
  zConfigAugmentFilterDoc,
  zConfigStealthDoc,
  zConfigTauntDoc,
  zConfigBodyScaleDoc,
  zConfigRegenDoc,
  zConfigVictoryFxDoc,
  zConfigItemCardDoc,
  // ── 2026-08-02 收尾:三個 lane 各自定義的欄位,三個落點一次接完 ───────────
  // ⚠️ **這三行是最重要的一步。** 新的 config 文件進了 `content/` 而 union 不認得
  // 它的 schema tag,`zConfigDoc` 就會拒絕整份文件 → ContentLoader 驗證失敗 →
  // `main.tsx` 的 fail-open 註冊 2 隻英雄的骨架 → 選人畫面整個空掉,而網站看起來
  // 完全正常。那正是 2026-08-02 線上壞掉四小時的根因（roster / boss-intro /
  // item-card / victory-fx 四個 tag 同時漏掉）。
  zConfigLobbyLayoutDoc,
  zConfigValhallaSandboxDoc,
  zConfigVictoryPodiumDoc,
  // 位移級距（GH#318，owner 2026-08-13）。⚠️ 漏掉這一行 = 內容整份驗證失敗 → 骨架英雄。
  zConfigDisplacementTiersDoc,
  // 減傷曲線的負抗性放大上限（owner 2026-08-13）。⚠️ 同上。
  zConfigMitigationDoc,
]);

/** ConfigDoc keeps naming the canonical match config (existing consumers). */
export type ConfigBodyScaleDoc = z.infer<typeof zConfigBodyScaleDoc>;
export type ConfigRegenDoc = z.infer<typeof zConfigRegenDoc>;
export type VictoryFireworkTier = z.infer<typeof zVictoryFireworkTier>;
export type ConfigVictoryFxDoc = z.infer<typeof zConfigVictoryFxDoc>;
/** 道具卡片的四個語意分類（owner 2026-08-02 核准）。 */
export type ItemCardCategory = z.infer<typeof zItemCardCategory>;
export type ConfigItemCardDoc = z.infer<typeof zConfigItemCardDoc>;
/** 解析後的煙火政策 —— 兩層各自的開關。 */
export interface VictoryFxPolicy {
  roundVolley: VictoryFireworkTier;
  matchChicken: VictoryFireworkTier;
}
export type ConfigVoxelBodiesDoc = z.infer<typeof zConfigVoxelBodiesDoc>;
/**
 * `config` 這個集合裡的**任何一份**文件（GH#312）。
 *
 * ⚠️ 2026-08-11 之前這裡寫的是 `z.infer<typeof zConfigMatchDoc>` —— 也就是
 * 只描述 match 那一份。於是任何 `store.all<ConfigDoc>("config")` 拿到的型別
 * 都在說謊，而 `.schema === "config.xxx@1"` 的比對會被 tsc 判成
 * 「兩個字面型別沒有交集」→ **一個永遠 false 的死比對**。
 * 接 `config.aoe-tiers@1` 時撞到（tsc 擋下來了，所以沒有出貨）。
 *
 * ⭐ 「我要的就是 match 那一份」請用下一行的 {@link ConfigMatchDoc}。
 */
export type ConfigDoc = z.infer<typeof zConfigDoc>;
export type ConfigMatchDoc = z.infer<typeof zConfigMatchDoc>;
export type ConfigStoreDoc = z.infer<typeof zConfigStoreDoc>;
export type ArenaRoundGrant = z.infer<typeof zArenaRoundGrant>;
export type ConfigArenaRulesDoc = z.infer<typeof zConfigArenaRulesDoc>;
export type CombatEnvMultipliersDoc = z.infer<typeof zCombatEnvMultipliers>;
export type ConfigCombatEnvDoc = z.infer<typeof zConfigCombatEnvDoc>;
export type AmbientVfxBinding = z.infer<typeof zAmbientVfxBinding>;
export type ArenaFire = z.infer<typeof zArenaFire>;
export type ConfigAmbientVfxDoc = z.infer<typeof zConfigAmbientVfxDoc>;
export type AudioBgmTrack = z.infer<typeof zAudioBgmTrack>;
export type AudioSfxEntry = z.infer<typeof zAudioSfxEntry>;
export type ConfigAudioMapDoc = z.infer<typeof zConfigAudioMapDoc>;
export type ChampionVoiceEntry = z.infer<typeof zChampionVoiceEntry>;
export type ConfigChampionVoicesDoc = z.infer<typeof zConfigChampionVoicesDoc>;
export type UnitTintEntry = z.infer<typeof zUnitTintEntry>;
export type UnitTintState = z.infer<typeof zUnitTintState>;
export type ConfigUnitTintsDoc = z.infer<typeof zConfigUnitTintsDoc>;
export type GoreStyle = z.infer<typeof zGoreStyle>;
export type ConfigGoreDoc = z.infer<typeof zConfigGoreDoc>;
export type DamageTextAxis = z.infer<typeof zDamageTextAxis>;
export type CombatTextOutlineMode = z.infer<typeof zCombatTextOutlineMode>;
export type ConfigDamageColorsDoc = z.infer<typeof zConfigDamageColorsDoc>;
export type ConfigStealthDoc = z.infer<typeof zConfigStealthDoc>;
export type ConfigIconPlanDoc = z.infer<typeof zConfigIconPlanDoc>;
export type VictoryTauntLang = z.infer<typeof zVictoryTauntLang>;
export type VictoryTauntLine = z.infer<typeof zVictoryTauntLine>;
export type VictoryTauntTaggedLine = z.infer<typeof zVictoryTauntTaggedLine>;
export type VictoryTauntChampionEntry = z.infer<typeof zVictoryTauntChampionEntry>;
export type ConfigVictoryTauntsDoc = z.infer<typeof zConfigVictoryTauntsDoc>;
export type ConfigVoxelBarcodesDoc = z.infer<typeof zConfigVoxelBarcodesDoc>;
export type ConfigBaseBonusDoc = z.infer<typeof zConfigBaseBonusDoc>;
export type StatCapDoc = z.infer<typeof zStatCap>;
export type ConfigStatCapsDoc = z.infer<typeof zConfigStatCapsDoc>;
export type ConfigCombatFeelDoc = z.infer<typeof zConfigCombatFeelDoc>;
export type FormVisualEntry = z.infer<typeof zFormVisualEntry>;
export type ConfigFormVisualsDoc = z.infer<typeof zConfigFormVisualsDoc>;
export type ModelLodTierName = z.infer<typeof zModelLodTier>;
export type ConfigModelLodDoc = z.infer<typeof zConfigModelLodDoc>;
export type ConfigVfxCleanupDoc = z.infer<typeof zConfigVfxCleanupDoc>;
export type ConfigShieldDoc = z.infer<typeof zConfigShieldDoc>;
export type ConfigBlockDoc = z.infer<typeof zConfigBlockDoc>;
export type ConfigAugmentFilterDoc = z.infer<typeof zConfigAugmentFilterDoc>;
export type ConfigTauntDoc = z.infer<typeof zConfigTauntDoc>;
export type ConfigRosterDoc = z.infer<typeof zConfigRosterDoc>;
/** 對戰錄影政策（`content/config/replay.json`）。 */
export type ConfigReplayDoc = z.infer<typeof zConfigReplayDoc>;
export type BossIntroChampionEntry = z.infer<typeof zBossIntroChampionEntry>;
export type ConfigBossIntroDoc = z.infer<typeof zConfigBossIntroDoc>;

/**
 * 出貨預設 —— `content/config/boss-intro.json` 讀不到（舊部署、內容載入失敗、
 * 或 overlay 存了一份壞的）時，出場演出退回到的那一份。
 *
 * ⚠️ **`champions` 是空的，而那是刻意的。** 這是程式裡的保險絲，不是文案的第二
 * 份副本：兩份逐英雄文案就是兩份會 drift 的東西，而它們的分歧會以「線上看到的
 * 弱點跟後台填的不一樣」的形態出現。缺文件 = 只剩既有的降臨橫幅 + 那個英雄的
 * 描述（描述來自 champion doc，不需要這份文件）。
 *
 * 純量那幾格必須和 `content/config/boss-intro.json` 一字不差 ——
 * `apps/client/src/ui/hud/bossIntroShipped.test.ts` 的 drift 斷言在守。
 */
export const DEFAULT_BOSS_INTRO: ConfigBossIntroDoc = {
  id: "boss-intro",
  schema: "config.boss-intro@1",
  enabled: true,
  introHoldSec: 5,
  fadeSec: 0.6,
  // #291 owner 2026-08-03「描述還有很多沒顯示完」—— 120 → 300。
  // ⚠️ 單獨調大這一格**看不出任何差別**（那正是缺陷的一半）：版面必須同時給得出
  // 高度，也就是下面 `layout.descMaxLines`。300 字 ÷ 36 字/行 ≈ 9 行 × 17px
  // ≈ 146px，1280×800 的中央走廊有 424px，連攻略要點與弱點一起放得下。
  descriptionMaxChars: 300,
  maxTips: 3,
  maxWeaknesses: 3,
  // #291 —— 和 `content/config/boss-intro.json` 一字不差；出貨值等於這一格出現
  // 之前 `bossIntroModel.ts` 那六個常數（DESC 那一格從「34px 固定」換成
  // 「一行 17px × 最多 10 行」，因為固定值就是缺陷本身）。
  layout: {
    quoteH: 42,
    nameH: 20,
    descLineH: 17,
    descMaxLines: 10,
    descCharsPerLine: 36,
    headH: 16,
    rowH: 17,
    padH: 14,
  },
  dropOrder: ["description", "tips", "weaknesses"],
  champions: {},
};

/**
 * 讀一份 `config.boss-intro@1`。文件不在／schema 不對／型別不合 →
 * {@link DEFAULT_BOSS_INTRO}。
 *
 * ⚠️ 一格一格檢查型別，不是 `doc as ConfigBossIntroDoc`。這份文件會被後台
 * overlay 覆蓋（`data/` 耐久層），而 overlay 的寫入路徑在 GH#283 被查出**沒有**
 * Zod 驗證 —— 也就是說一個 `introHoldSec: "5"` 真的有辦法躺在正式站上。到了
 * 這裡再一次把它擋掉，代價是幾行 typeof，換到的是「壞資料不會變成一個永遠不消失
 * 的全螢幕提示」。
 */
export function bossIntroFromDoc(doc: unknown): ConfigBossIntroDoc {
  const parsed = zConfigBossIntroDoc.safeParse(doc);
  return parsed.success ? parsed.data : DEFAULT_BOSS_INTRO;
}
// config.round-grade@1 的型別/Zod/出貨文件全部在 ./roundGrade,這裡只再匯出一次
// 給 `export * from "./config"` 的既有消費端(admin / codex 都是這樣拿的)。
export * from "./roundGrade";
export type AnyConfigDoc = z.infer<typeof zConfigDoc>;

/**
 * 出貨預設 —— `content/config/model-lod.json` 不存在(舊部署 / 內容掛掉)時,
 * `applyModelLodPolicy` 回退到的就是這一份,而它必須等於 #115 落地當下的行為:
 * low→small、medium→mid、high/auto→high。
 *
 * ⚠️ 每一格都要和 `content/config/model-lod.json` 一字不差 ——
 * `packages/shared/src/content/modelLodConfig.test.ts` 的 drift 斷言在守。
 * 兩份存在的理由不同:JSON 是**出貨值**(操作者會改),這份是**程式的保險絲**。
 */
export const DEFAULT_MODEL_LOD: ConfigModelLodDoc = {
  id: "model-lod",
  schema: "config.model-lod@1",
  enabled: true,
  presetTiers: { low: "small", medium: "mid", high: "high", auto: "high" },
};

/**
 * 出貨預設 —— `content/config/vfx-cleanup.json` 不存在(舊部署 / 內容掛掉)時,
 * `applyVfxCleanupPolicy` 回退到的就是這一份。
 *
 * ⚠️ 每一格都要和 `content/config/vfx-cleanup.json` 一字不差 ——
 * `packages/shared/src/content/vfxCleanupConfig.test.ts` 的 drift 斷言在守。
 * 兩份存在的理由不同:JSON 是**出貨值**(操作者會改),這份是**程式的保險絲**。
 *
 * 預設選 `purgeSharedPoolsOnRoundEnd: true` 的理由是 owner 的原話 ——
 * 「洩漏的粒子/mesh 回收 很重要」「一場就很燙」:在「省記憶體」和
 * 「下一回合第一次施法少一次配置」之間,他已經表態要前者。
 */
export const DEFAULT_VFX_CLEANUP: ConfigVfxCleanupDoc = {
  id: "vfx-cleanup",
  schema: "config.vfx-cleanup@1",
  enabled: true,
  purgeSharedPoolsOnRoundEnd: true,
  maxPooledRings: 24,
  // GH#270 —— 出貨值必須和 `content/config/vfx-cleanup.json` 一字不差；
  // `vfxCleanupPolicy.test.ts` 的 drift 斷言在守。
  maxOneShotEmitters: 96,
  emitterSweepSec: 2,
  purgeImpactPoolOnRoundEnd: true,
};

/**
 * 出貨預設 —— `content/config/ambient-vfx.json` 沒有 `arenaFire` 區塊時
 * （舊部署 / 內容掛掉 / 後台把它清掉）`resolveArenaFire` 回退到的就是這一份。
 *
 * `enabled: false` 是 owner 2026-08-01 的原話：「場地天空火焰很礙眼 請全部場地
 * 都去掉」。**回退值也必須是關的** —— 如果保險絲是開的，那麼「內容檔載不到」
 * 這條路就會把 owner 明說要拿掉的東西又點回來，而且是在最沒人看的那條路上。
 *
 * ⚠️ 每一格都要和 `content/config/ambient-vfx.json` 的 `arenaFire` 一字不差 ——
 * `apps/client/src/render/arenaFire.test.ts` 的 drift 斷言在守。
 */
export const DEFAULT_ARENA_FIRE: ArenaFire = {
  enabled: false,
  models: ["torch"],
  maxEmitters: 16,
  emitRate: 18,
  sizeScale: 1,
};

/**
 * 讀出「這張場地要不要冒火、冒幾個」。文件缺席 / 沒有 `arenaFire` 區塊時回退到
 * `DEFAULT_ARENA_FIRE`（也是關的）。
 *
 * 放在 shared 而不是 client 的理由：出貨值（JSON）、保險絲（上面那份）與
 * 讀取規則必須是**同一段**程式，否則「後台關了但場上還在燒」會是三份各自
 * 正確的程式加起來的結果。
 */
export function resolveArenaFire(doc: ConfigAmbientVfxDoc | null | undefined): ArenaFire {
  return doc?.arenaFire ?? DEFAULT_ARENA_FIRE;
}

/**
 * 一個 decor 模型路徑該不該掛火焰。`models` 是子字串比對（`dressArena` 原本
 * 寫死的 `d.model.includes("torch")` 就是這個語意），總開關關掉時**永遠**是
 * false —— 這是唯一一個決定「場上有沒有火」的地方，讓它只有一份。
 */
export function decorModelBurns(fire: ArenaFire, modelPath: string): boolean {
  if (!fire.enabled) return false;
  return fire.models.some((m) => modelPath.includes(m));
}

/**
 * 出貨預設 —— `content/config/victory-fx.json` 讀不到時（舊部署 / 內容掛掉 /
 * 後台把它清掉）`resolveVictoryFx` 回退到的就是這一份。
 *
 * **兩格都是 false**，因為那是 owner 2026-08-02 的原話：「請你直接取消煙火」。
 * 保險絲必須和出貨值同向 —— 如果回退值是開的，那麼「內容檔載不到」這條路
 * （也就是 2026-08-01 骨架事故的那條路）就會把 owner 明說要拿掉的東西又點回來，
 * 而且是在最沒有人看的那條路上。`DEFAULT_ARENA_FIRE` 為了同一個理由也是關的。
 *
 * ⚠️ 每一格都要和 `content/config/victory-fx.json` 一字不差 ——
 * `apps/client/src/vfx/victoryFxPolicy.test.ts` 的 drift 斷言在守。
 */
export const DEFAULT_VICTORY_FX: VictoryFxPolicy = {
  roundVolley: { enabled: false },
  matchChicken: { enabled: false },
};

/**
 * 讀出「這一場的兩層勝利煙火各自要不要放」。文件缺席時回退到
 * `DEFAULT_VICTORY_FX`（也是關的）。
 *
 * 放在 shared 而不是 client 的理由和 `resolveArenaFire` 同源：出貨值（JSON）、
 * 保險絲（上面那份）與讀取規則必須是**同一段**程式，否則「後台關了但畫面上還在
 * 放煙火」會是三份各自正確的程式加起來的結果。
 */
export function resolveVictoryFx(doc: ConfigVictoryFxDoc | null | undefined): VictoryFxPolicy {
  if (!doc) return DEFAULT_VICTORY_FX;
  return { roundVolley: doc.roundVolley, matchChicken: doc.matchChicken };
}

// ─────────────────────── 大廳版面 / 英靈殿沙盒（2026-08-02 收尾）──────────

export type ConfigLobbyLayoutDoc = z.infer<typeof zConfigLobbyLayoutDoc>;
export type ConfigValhallaSandboxDoc = z.infer<typeof zConfigValhallaSandboxDoc>;

/** 去掉 id/schema/note 的殼之後,程式真正讀的那一份。 */
export type LobbyLayoutPolicyDoc = Omit<ConfigLobbyLayoutDoc, "id" | "schema" | "note">;
export type ValhallaSandboxPolicyDoc = Omit<ConfigValhallaSandboxDoc, "id" | "schema" | "note">;

/**
 * 出貨預設（＝內容載不到時的保險絲）。
 *
 * ⚠️ 每一格都必須和 `apps/client/src/ui/platform/lobbyLayout.ts` 的
 * `DEFAULT_LOBBY_LAYOUT` 一字不差 —— 那一份才是螢幕真的在用的。
 * `apps/admin/src/laneConfigDocs.test.ts` 逐格比對兩邊,差一格就紅。
 */
export const DEFAULT_LOBBY_LAYOUT_POLICY: LobbyLayoutPolicyDoc = {
  leftColumnWidthPx: 280,
  // 30 / 20 / 50 —— owner 2026-08-04:「FRIEND, 線上玩家, 排位榜 UI 佔的高度比例
  // 應該是 3:2:5」。（2026-08-03 插進線上玩家那一版是 40/30/30。）
  // 三段相加必須是 1 —— flexbox 不會替你檢查，`lobbyLayoutProblems()` 會。
  friendsShare: 0.3,
  onlineShare: 0.2,
  leaderboardShare: 0.5,
  alreadyFriendMode: "greyed-button",
  stackOrder: ["friends", "online", "leaderboard"],
  minSlotHeightPx: 168,
  splitMinHeightPx: 560,
  stackBelowWidthPx: 720,
};

/**
 * 出貨預設。owner 明說的兩格是 `dummyHealth: 10000` 與 `dummyRespawnSec: 3`。
 *
 * ⚠️ 同上,唯一真相是 `valhallaSandboxRules.ts` 的 `DEFAULT_VALHALLA_SANDBOX`。
 */
export const DEFAULT_VALHALLA_SANDBOX_POLICY: ValhallaSandboxPolicyDoc = {
  dummyHealth: 10_000,
  dummyRespawnSec: 3,
  dummyDistance: 3.2,
  applyCombatEnv: true,
  movementLock: "anchor",
  unlockAllSlots: true,
  infiniteMana: true,
};

/**
 * 文件 → 政策。缺席／壞掉一律回退到出貨預設,理由和 `resolveVictoryFx` 同源:
 * 內容載不到是 2026-08-01 骨架事故那一條路,而在那條路上把左欄高度變成 0
 * 會讓「內容全毀」看起來像「朋友列表不見了」。
 */
export function resolveLobbyLayout(
  doc: ConfigLobbyLayoutDoc | null | undefined,
): LobbyLayoutPolicyDoc {
  if (!doc) return DEFAULT_LOBBY_LAYOUT_POLICY;
  return {
    leftColumnWidthPx: doc.leftColumnWidthPx,
    friendsShare: doc.friendsShare,
    onlineShare: doc.onlineShare,
    leaderboardShare: doc.leaderboardShare,
    alreadyFriendMode: doc.alreadyFriendMode,
    stackOrder: doc.stackOrder,
    minSlotHeightPx: doc.minSlotHeightPx,
    splitMinHeightPx: doc.splitMinHeightPx,
    stackBelowWidthPx: doc.stackBelowWidthPx,
  };
}

/** 同上。文件缺席時沙盒仍然要開得起來（假人 10,000 血、三秒補滿）。 */
export function resolveValhallaSandbox(
  doc: ConfigValhallaSandboxDoc | null | undefined,
): ValhallaSandboxPolicyDoc {
  if (!doc) return DEFAULT_VALHALLA_SANDBOX_POLICY;
  return {
    dummyHealth: doc.dummyHealth,
    dummyRespawnSec: doc.dummyRespawnSec,
    dummyDistance: doc.dummyDistance,
    applyCombatEnv: doc.applyCombatEnv,
    movementLock: doc.movementLock,
    unlockAllSlots: doc.unlockAllSlots,
    infiniteMana: doc.infiniteMana,
  };
}

/**
 * 出貨預設 —— 文件不存在時 `resolveFormVisual` 讀的就是這一份。
 *
 * ⚠️ 這裡的每一個數字都要和 `content/config/form-visuals.json` 一字不差,
 * `championFormVisuals.test.ts` 的 drift 斷言在守(缺一個欄位就紅)。
 * 兩者存在的理由不同:JSON 是**出貨值**(操作者會改),這份是**程式的保險絲**
 * (內容掛掉時遊戲還是要能跑,而且要跑成一樣的樣子)。
 */
export const DEFAULT_FORM_VISUALS: ConfigFormVisualsDoc = {
  id: "form-visuals",
  schema: "config.form-visuals@1",
  enabled: true,
  tintStrength: 1,
  scaleStrength: 1,
  attachmentsEnabled: true,
  forms: {
    // 09 悟空 → 超級賽亞人。掛件是 w3x 事實(A0MJ 球體(悟空超3) = Goku3head.mdx);
    // 金色與 +8% 身高是美術決定(w3u 兩半的 tint/usca 完全相同)。
    "godie-o00x": {
      note: "掛件=w3x A0MJ 球體(悟空超3),掛點 origin 也是 w3x 記的;金色 tint 與 1.08 倍身高是美術決定,w3u 兩半同色同大小",
      tint: [1.45, 1.3, 0.55],
      scaleMult: 1.08,
      attachModelKey: "imported.goku3head",
      attachBone: "origin",
      attachScale: 0.3221,
      attachOffsetY: 0,
    },
    // 20 Saber → 風王結界。w3x 沒有任何視覺差(同模型、同色、同 usca 1.10,
    // 且 A0DZ 觸發不改 vertex color),所以整格都是美術決定。
    "godie-e00l": {
      note: "w3x 無任何視覺差(同模型/同色/同 usca);風王結界的青白光暈與 1.04 倍身高皆為美術決定",
      tint: [0.72, 0.92, 1.35],
      scaleMult: 1.04,
    },
  },
};

/**
 * 出貨預設 —— `content/config/damage-colors.json` 不存在(舊部署 / 內容掛掉)時,
 * `applyDamageColorsDoc` 回退到的就是這一份。
 *
 * ⚠️ 每一格都要和 `content/config/damage-colors.json` 一字不差 ——
 * `apps/client/src/render/damagePalette.test.ts` 的 drift 斷言在守。
 * 兩份存在的理由不同:JSON 是**出貨值**(操作者會改),這份是**程式的保險絲**。
 *
 * 每一個 hex 都是**量出來的**,不是挑好看的。判準與 `ui/combatText` 檔頭同一套
 * (那是 #164 「傷害數字看起來是黑色」修好之後留下的規則),四個地面取樣自
 * `apps/client/src/ui/combatTextContrast.test.ts`:
 *
 *   text.physical `#FF5900` — 就是 `taken` 原本那一格。從 833 個同時滿足
 *     「每個地面 fill-或-ring ≥ 3.0」「fill 對自己的黑框 ≥ 3.0」「離四個隊伍色
 *     ΔE > 25」的候選裡挑出來最紅的一個(團隊色 ΔE 31.0 / 對黑框 6.68:1 /
 *     最差地面 3.14:1)。純紅 `#FF0000` 在暗土上只有 2.47:1,所以「紅」不等於
 *     `#FF0000`。
 *   text.magic `#B872FF` — 團隊色 ΔE 31.7、對黑框 6.89:1、暗土 fill 3.24:1,
 *     而且離 `dodge` 的薰衣草 `#C9A7FF` ΔE 34.5(場上另一個紫,必須分得開)。
 *     ⚠️ 更深的紫 `#9D4EDD` / `#A855F7` / `#8B5CF6` 全部**過不了暗土**
 *     (2.15 / 2.49 / 2.33),因為黑框在暗土上只有 2.13:1 —— 那個地面是這一格
 *     真正的限制條件,不是團隊色。
 *   text.true `#FFFFFF` — 對黑框 21:1,團隊色 ΔE 73.6。白岩地面 fill 只有
 *     1.19:1,由黑框(17.62:1)扛,這正是「框扛辨識度、色扛語意」的設計。
 *   text.heal `#00FF00` — RO 的 `(0,1,0)`,原本就在表上,團隊色 ΔE 55.5。
 *
 *   flash.* 是**另一條物理**(ALPHA_COMBINE 疊加,不是文字),所以值不同 ——
 *     見 `zConfigDamageColorsDoc` 的檔頭。`#FF2626` / `#FF59E6` 是原本寫死的
 *     `[1,.15,.15]` / `[1,.35,.9]` 的 8-bit 表示(差 <0.002,肉眼不可能分辨);
 *     `#33FFFF` = `[0.2,1,1]` 是新的一格,它在七個真實 w3x tint 上的
 *     ΔRGB 都 > 0.35(白色只有 0.06)。
 *
 *   outline.incoming `#5A0000` — 「我被打」的外圈。同樣是量出來的,但**約束條件
 *     和上面那七格不同**,因為它畫在黑框後面,不必扛地面辨識度(黑框還在原位)。
 *     它要滿足的是三件事:①離黑色夠遠,否則這個通道等於沒加(ΔE 48.1);
 *     ②離四個隊伍色夠遠,否則會被讀成隊伍標示而不是「我被打」(最近 ΔE 45.9,
 *     隊伍紅 #e5483f);③對每一個可能被它包住的填色都 ≥ 4.5:1,否則外圈會和
 *     數字糊在一起 —— 最差的一格是物理 #FF5900 的 4.66:1,其餘 4.80(魔法)/
 *     14.64(真實)/8.12(GUARD 灰)/7.29(閃避薰衣草)。它對物理受擊閃光
 *     #FF2626 也有 3.87:1,所以在數字誕生的那一下閃光上仍然看得見。
 *   outline.outgoing `#000000` — 就是黑框本身的顏色,所以外圈不會被畫出來,
 *     「我打人」的 CSS 與這個功能出現之前逐位元相同。
 *   outline.widthMult `1.9` — 8 個方向的位移是把整個字形往外膨脹,不是點光源,
 *     所以 8 個方向的近似誤差只有 `r × (1 − cos 22.5°) = 0.076 r`(1.9 × 2px
 *     時是 0.29px),不會出現扇貝邊。
 */
export const DEFAULT_DAMAGE_COLORS: ConfigDamageColorsDoc = {
  id: "damage-colors",
  schema: "config.damage-colors@1",
  textAxis: "damageType",
  text: {
    physical: "#FF5900",
    magic: "#B872FF",
    true: "#FFFFFF",
    heal: "#00FF00",
  },
  flash: {
    physical: "#FF2626",
    magic: "#FF59E6",
    true: "#33FFFF",
  },
  outline: {
    mode: "incoming",
    outgoing: "#000000",
    incoming: "#5A0000",
    widthMult: 1.9,
  },
};

/**
 * 出貨預設 —— `content/config/item-card.json` 不存在(舊部署 / 內容掛掉)時,
 * `applyItemCardDoc` 回退到的就是這一份。
 *
 * ⚠️ 每一格都要和 `content/config/item-card.json` 一字不差 ——
 * `packages/shared/src/content/itemCardShipped.test.ts` 的 drift 斷言在守。
 * 兩份存在的理由不同:JSON 是**出貨值**(owner 會改),這份是**程式的保險絲**。
 *
 * ── `markers` 這 32 列是掃出來的,不是想出來的 ───────────────────────────────
 * 來源是 `content/loot-tables/legendary-weapons.json` 那 49 支的 description,
 * 逐字掃 `[...]`:31 個關鍵字標記 + 1 個內嵌數值(見 `inlineValueMarkers`)。
 * owner 點名的 `[焚身]` 在(死之王的神盾 godie-i061);他寫的 `[隱形]` **不在** ——
 * 49 支裡的那一個是 `[隱身]`(至尊魔戒 godie-i004)。`[隱形]` 這三個字在這批裡
 * 只出現在 `[看穿]` 的說明文字裡(「看穿隱形」),不是一個標記。表上兩個都收:
 * `隱身` 是實際存在的那一個,`隱形` 是 owner 講的那個名字,先在表上等它出現 ——
 * 一個查得到的空位比一個 fallback 好,因為 fallback 不會告訴你它猜過。
 *
 * ⚠️ 2026-08-10 之前這裡是 `On-Hit` 與 `OnHit` **兩列**:雅典娜的驚嘆號
 * (godie-i006)寫 `[OnHit]`、其餘 16 支寫 `[On-Hit]`,而「原稿不准改」讓對照表
 * 必須同時認得兩種拼法。**owner 當天親自解除了那個限制**:「On-hit 說明應該
 * 跟技能統一 tag []」—— 整批(17 件的 description + authoringNote)改成
 * `[普通攻擊時]`,兩列併成一列,同一行裡重複的尾綴 `(On-Hit)` 一併拿掉。
 * ⭐ 留著這段是因為它記錄了**為什麼曾經有兩列**:那不是疏忽,是一條刻意的
 * 「不為了程式好寫去動文案」的紀律。解除它的是文案作者本人,不是我。
 *
 * ── 顏色是量出來的 ──────────────────────────────────────────────────────────
 * 對卡片底色 `#12151d` 的對比度:stat 10.25 / active 11.36 / passive 9.40 /
 * debuff 7.50 / number 15.15 / lore 5.93 —— 全部過 4.5:1。
 * 四個分類彼此的 CIE76 ΔE 最小 57.7(stat↔passive),數值色離最近的分類色 32.7
 * (active),都在 ~25 的可混淆線之上。
 * 而且**刻意不沿用戰鬥飄字那五個色**(owner 2026-08-02 裁定「卡片專用一套新的」):
 * 離 `config/damage-colors.json` 五個 hue 最近的一格是 stat↔魔力青 ΔE 29.5,
 * 仍在線上 —— 卡片是靜態閱讀介面,不必扛戰場地面對比,判準是「別讀成傷害屬性」。
 */
export const DEFAULT_ITEM_CARD: ConfigItemCardDoc = {
  id: "item-card",
  schema: "config.item-card@1",
  categories: {
    stat: { label: "屬性加成", color: "#6FD3C4" },
    active: { label: "主動效果", color: "#FFC24D" },
    passive: { label: "被動效果", color: "#A9B6FF" },
    debuff: { label: "負面控場", color: "#FF7BA6" },
  },
  numberColor: "#FFE9A3",
  loreColor: "#8B93A6",
  unknownCategory: "passive",
  markers: {
    // ── 屬性加成:沒有任何觸發事件,就是一串數字 ──
    神速: "stat", // 攻速上限提升至 10 / 攻擊速度+200%
    伸長: "stat", // 近戰攻擊距離+4;遠戰+2
    閃避: "stat", // 閃避 +10%
    死之王套裝: "stat", // 三件套齊 → 總 AP +100%
    // ── 主動效果:有一個離散的觸發事件(普攻/施法/擊殺/受擊) ──
    普通攻擊時: "active", // owner 2026-08-10：標記統一成中文,兩種拼法併成一列
    擴散: "active", // 普攻濺射
    暴擊: "active", // 普攻機率兩倍傷害
    暴擊吸血: "active",
    // A4b(#278) —— 【淨化】。分到 active：它是一個**會發生的事件**
    // （On-Hit 機率觸發／每 N 秒觸發），不是一條常駐屬性。
    淨化: "active", // 暴擊時 100% 吸血
    疊層: "active", // 普攻命中 / 擊殺英雄時疊加
    衝刺: "active", // 施放技能時向前衝刺
    復活: "active", // 擊殺敵方英雄時復活我方
    回復: "active", // 擊殺任一敵方單位時回血
    煉金術: "active", // 受敵人攻擊時機率把敵人變成黃金
    // ── 被動效果:常駐,沒有觸發事件 ──
    隱身: "passive", // 永久隱身
    隱形: "passive", // owner 講的名字;49 支裡目前沒有,先佔位(見檔頭)
    看穿: "passive", // 常駐真視
    飛昇: "passive", // 移動轉為無視碰撞的飛行形態
    無視: "passive", // 普攻無視防禦
    // ⭐ 【穿透】—— 霸王破甲槍 2026-08-13 從「真傷」改成「100% 護甲穿透」之後
    //   啟用的新標記。⚠️ 它**不是**【無視】的同義詞：穿透照樣被格擋擋得下、
    //   照樣被物理護盾吃、照樣觸發反傷，只是把護甲當成 0。
    //   ⛔ 漏掉這一列，卡片會走 `unknownCategory` 去猜分類（猜出來剛好也是
    //   passive，所以畫面上看不出來 —— 那正是 `itemCardShipped` 要擋的形態）。
    穿透: "passive", // 普攻無視敵方 N% 護甲
    真實傷害: "passive", // 技能傷害全部轉真實
    反彈: "passive", // 反彈普通攻擊傷害
    斬殺: "passive", // 低血直接斬殺
    格擋: "passive", // 機率抵擋
    迴避: "passive", // 機率迴避物理傷害
    流星: "passive", // 每秒自動範圍傷害
    // ── 負面/控場:作用在敵人身上 ──
    緩慢: "debuff",
    暈眩: "debuff",
    重創: "debuff", // 降低敵方吸血回復量
    嘲弄: "debuff", // 強制敵人優先攻擊自己
    焚身: "debuff", // 周圍敵人每秒燃燒
    腐蝕: "debuff", // 周圍敵方防禦 -30
    變形: "debuff", // 把敵人變成食材,無法動作
  },
  inlineValueMarkers: ["自身已損失的生命百分比數值(0~100)"],
  efficacyHeadings: ["效能"],
  loreHeadings: ["解說", "歷史"],
};
