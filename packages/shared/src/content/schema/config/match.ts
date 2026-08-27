import { z } from "zod";
import { zId } from "../common";
import { zAugmentTier } from "../augment";
// 火圈灼燒曲線的出貨值 —— 定義在 sim/fireRing.ts（sim 缺欄位時退回同一份），
// schema 只是把它接上 Zod 的 `.default()`。抄第二份就是兩個「沒填的話燒多少」。
import { DEFAULT_BURN_CURVE, DEFAULT_LETHAL_SAVE_APPLIES, DEFAULT_MAX_PCT_PER_SEC, DEFAULT_STAGE1_RADIUS, DEFAULT_STAGE2_SHRINK_SEC, ringFullCloseSec } from "../../../sim/fireRing";
// 開房房主可調的四格（#288）的上下界 —— **只有一份**，住在 `roomSettings.ts`。
// 那四格同時被四層讀（client 表單的 min/max、game-server 的權威夾取、這一份 Zod、
// 後台顯示），所以抄一份數字進來就是第二個「上限是多少」的答案：房主表單擋在
// 1800，Zod 放行 3600，兩邊漂開的那一天沒有任何東西會紅。
// ⚠️ 相依方向是安全的：`roomSettings.ts` 自己一個 import 都沒有（純表 + 純函式）。
import { MAX_ROUNDS_UNLIMITED, ROOM_SETTING_LIMITS } from "../../../roomSettings";

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

/**
 * 英雄登場時的等級（`config.match@1.progression.heroStartLevel`）。
 * ⭐ owner 2026-08-23 逐字:「英雄登場初始等級設定為 6」。
 * ⚠️ 在此之前是 `spawnChampion` 裡寫死的 `?? 1`,而那一格後台調不到。
 */
export const DEFAULT_HERO_START_LEVEL = 6;

/**
 * 從一份 `config.match@1` 讀出英雄登場等級（讀不到 ⇒ 出貨預設）。
 *
 * ⚠️ **缺文件 = 出貨預設**，⛔ 不是 1 —— 讀不到時退回 1 等於「內容一出問題
 * 全場退回最脆弱的狀態」，而那正是 owner 今天在抱怨的東西。
 */
export function heroStartLevel(doc: unknown): number {
  const p = (doc as { progression?: { heroStartLevel?: unknown } } | null | undefined)?.progression;
  const v = p?.heroStartLevel;
  return typeof v === "number" && Number.isFinite(v) && v >= 1 ? Math.floor(v) : DEFAULT_HERO_START_LEVEL;
}

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
         * **選角結束時房裡沒有任何真人 ⇒ 收房**（GH#588）。
         *
         * owner 2026-08-23（逐字）：
         * > 「限制一名玩家同時最多只能在一個房間，如果有玩家馬上 kill AI」
         *
         * true（出貨）= 選角相位結束的那一 tick，如果房裡一個真人 driver 都沒有、
         * 一條連線都沒有、也沒有任何還沒被領走的保留席位（＝沒有人正在下載資產），
         * 就把房間收掉。false = 這一格出現之前的行為：`autoPickAndSpawn` 幫 12 個
         * 座位全部配好英雄，然後一場沒有人在看的比賽以 30Hz 打到底
         * （練習房的 `endlessCombat` 更是**永遠**打不完 —— 實測 60,660 tick）。
         *
         * ⚠️ 三個條件缺一不可，特別是**保留席位**那一條：`setSeatReservationTime(120)`
         * 存在的理由正是「客戶端要先下載 2.8MB 的資產才連得上遊戲 socket」，而
         * PvP 的選角只有 20 秒。少了那一條，一個網路慢的玩家會在自己還在讀取時
         * 被伺服器把房間收掉。
         *
         * ⚠️ 缺席 = **true**，⛔ 不是 false（隔壁三個 `.optional()` 布林是 false，
         * 因為它們「owner 要的那一邊」剛好是 false）。約定是同一條：一份**這一格
         * 出現之前**的舊文件應該拿到 owner 現在要的行為。
         */
        disposeEmptyChampSelect: z.boolean().optional(),
        /**
         * ⭐ **房間的存活上限**（GH#588 的第二半 / GH#801）。語意、owner 的原話與
         * 出貨預設全部寫在 `apps/game-server/src/rooms/roomLifetime.ts`
         * （`DEFAULT_ROOM_COMBAT_MAX_SEC` / `DEFAULT_ROOM_COMBAT_CAP_ENABLED`）——
         * ⛔ 這裡不重講一次（第〇·四守則：同一個值不要有第二個住處）。
         *
         * ⚠️ 兩格一律 `.optional()`：ABSENT ⇒ 解析端的預設（1800 秒 / 開著），
         * ⛔ 不是 `0` / `false`。同 `disposeEmptyChampSelect` 的約定。
         *
         * ⚠️ 上界不只有下界（第一守則）：`[60, 14400]` 與解析端的夾限**同一組
         * 數字**。⛔ 下界不是 0 —— 0 秒等於「一進戰鬥就收房」，而那不是一個
         * 兜底，是一個看起來像伺服器壞掉的設定。
         */
        roomCombatMaxSec: z.number().min(60).max(14_400).optional(),
        roomCombatCapEnabled: z.boolean().optional(),
        /**
         * ⭐ 兩格**誠信**開關（GH#726 / GH#801）。語意與出貨預設寫在
         * `apps/game-server/src/match/integrityPolicy.ts`
         * （`DEFAULT_CHAMPION_LOCK_ENFORCED` / `DEFAULT_SCORE_CHEATED_MATCHES`）。
         *
         * ⚠️ 兩格都 `.optional()`，ABSENT ⇒ 上面那兩個常數 —— 而它們**不是同一個
         * 布林值**（一個 true 一個 false）⇒ ⛔ 這裡寫死任何一邊都會是謊話。
         *
         * ⛔ 它們**不是平衡旋鈕**（不進 `owner-knobs.json`）：一個字都不改傷害，
         * 只決定伺服器承不承認一件客戶端宣稱的事。
         */
        championLockEnforced: z.boolean().optional(),
        scoreCheatedMatches: z.boolean().optional(),
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
        /**
         * ⭐ **英雄登場時的等級**（owner 2026-08-23：「英雄登場初始等級設定為 **6**」）。
         *
         * ⚠️ 在此之前這個數字**不存在** —— `spawnChampion` 的 `level: args.level ?? 1`
         * 是一個**寫死的預設**，而 `MatchController` 從來沒有傳過 `level`
         * ⇒ 每一場都從 LV1 開始，⛔ 而那一格後台調不到（第一守則）。
         *
         * ⭐ 它為什麼重要（2026-08-23 量到的）：五級距是**固定值**（極大 2000），
         * 而血量隨等級成長 ⇒ 同一發極大在 **LV1 佔 41.7%**、在 LV99 佔 3.0%。
         * owner 回報「技能兩三發就會死」的位置正是 **LV1–LV5**。
         * ⇒ 抬高登場等級**直接**把那一段的血條墊厚。
         *
         * ⛔ OPTIONAL：線上存過的耐久覆蓋層沒有這個 key，設成必填會讓整份
         * `safeParse` 失敗 ⇒ 內容載入整份掛掉（2026-08-02 事故的形狀）。
         * 省略 = `DEFAULT_HERO_START_LEVEL`。
         */
        heroStartLevel: z.number().int().min(1).max(99).optional(),
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
export type ConfigMatchDoc = z.infer<typeof zConfigMatchDoc>;
