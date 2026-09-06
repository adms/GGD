import { z } from "zod";

// ---------------------------------------------------------------- #329 ----
/**
 * ⭐【`config.camera@1`】—— 戰鬥鏡頭的**滾輪縮放界線 + 開局預設鏡頭**。
 *
 * owner 2026-08-15：
 * > 「**最大視野減少兩節**(滑鼠滾輪)」
 *
 * owner 2026-08-18（GH#361，**推翻 #31a**）：
 * > 「目前**預設視角是偏低離地板太近**（預設應該是**離地板最高**，可縮放離地板更近），
 * >  但**可以縮放最高的視角太高了，至少要砍低一半高度**」
 *
 * ⇒ 兩件事，⛔ 不可以只做一半：
 * ① **預設不再等於最近** —— 它變成自己的一格 {@link CAMERA_DOC_ID} 欄位
 *    `zoom.defaultDolly`，出貨值 = 區間的**最遠端**；
 * ② **最遠端本身砍一半** —— `maxDolly` 36 → 18（眼高 `dolly·sin68°`
 *    33.4u → 16.7u，正好是 owner 要的「砍低一半高度」的下限）。
 *
 * ⚠️ #31a 當時**唯一記下來的理由**是「讓角色在畫面上盡可能大」
 * （`CameraRig` 原註解：「so the champion starts as large as the clamp permits」；
 * `docs/todo/restart-cheats.md` rc-19 那一列沒有再寫別的）。⛔ 沒有任何地方寫過
 * 它與體素替身有關 —— 不要替它補一個沒人寫過的理由。owner 2026-08-18 的判斷是
 * 那個取捨換來的「離地板太近」比大角色更難忍受。
 * ⇒ 這不是修 bug，是**設計改版**；舊行為留在一格欄位裡（把 `defaultDolly`
 * 填成 `minDolly` 就是 #31a），一鍵 rollback。
 *
 * ── 為什麼是一份文件而不是改一個常數 ─────────────────────────────────
 * 這一族數字 owner 已經動過**四次**（#31a 預設拉到最近、#161 俯角 55°→68°、
 * 2026-08-15 最大視野減兩節、GH#361 預設換端點 + 最遠端再砍一半），
 * 而它們原本一直住在 `CameraRig.ts` 的 `const DOLLY_MAX = 40`。
 * ⇒ 每動一次 = 一次 client rebuild + 一次完整部署。第一守則的原話：
 * **「改一個寫死的數字 = 一次完整部署」**。
 *
 * ⚠️ 而且「視野多大」是**體感**題 —— 它一定會再被調，而且要邊玩邊調。
 * 一格後台欄位讓那件事從「改程式」變成「存檔」。
 *
 * ⚠️ 這一份**只管縮放界線**，⛔ 不管俯角。俯角改變會連動遮擋安全（#29/#103 的
 * 2.4u 道具高度上限是從角度推出來的），那是一條有幾何論證的線，
 * 不是一格可以隨手拉的滑桿。
 */
export const CAMERA_DOC_ID = "camera";

/**
 * 滾輪一「節」轉多少 dolly。
 *
 * ⚠️ 這一格存在的理由是 owner 用「**節**」講話，而程式裡沒有「節」這個單位 ——
 * 只有 `deltaY * wheelStep`。瀏覽器一節滾輪的 `deltaY` 是 100–120，
 * 所以出貨的 0.02 ＝ **一節約 2.0–2.4 dolly**。
 * ⇒「減少兩節」＝ `maxDolly` 40 → 36。這一格讓那個換算**寫得出來**，
 * ⛔ 不是散落在註解裡的心算。
 */
export const CAMERA_WHEEL_STEP_MIN = 0.002;
export const CAMERA_WHEEL_STEP_MAX = 0.2;
/**
 * `minDolly` 的界。下界 4：再近就穿進角色身體裡（EX 演出用的 5 已經是刻意的特寫）。
 * 上界 40：這是**這一格自己的天花板**，⛔ 不是「出貨最大視野」的複本 ——
 * GH#361 之後出貨的 `maxDolly` 是 18，所以填 40 會被 `superRefine` 的
 *「最近比最遠還遠」那一條擋下來。⚠️ 那條跨欄位規則才是真正的閘；
 * 這個 40 只是防手滑打成 400。
 */
export const CAMERA_MIN_DOLLY_MIN = 4;
export const CAMERA_MIN_DOLLY_MAX = 40;
/**
 * `maxDolly` 的界。
 *
 * ⚠️ 上界 120 不是裝飾：拉遠等於**把整個競技場塞進同樣多的像素**，
 * 角色會小到看不出誰是誰（而 24×18 的場地本來就只有 ~30u 對角）。
 * 下界 8 允許「幾乎不能拉遠」這種刻意的緊繃視角。
 */
export const CAMERA_MAX_DOLLY_MIN = 8;
export const CAMERA_MAX_DOLLY_MAX = 120;

export const zConfigCameraDoc = z
  .object({
    id: z.literal(CAMERA_DOC_ID),
    schema: z.literal("config.camera@1"),
    note: z.string().optional(),
    /**
     * ⚠️ 為什麼包一層 `zoom` 而不是四格攤平在頂層：跨欄位的規則
     *（最近不可以比最遠遠）只能用 `.superRefine()` 表達，而 `.superRefine()`
     * 會把 ZodObject 變成 **ZodEffects** —— `zConfigDoc` 是
     * `z.discriminatedUnion`，它**只吃 ZodObject**。頂層一加就會讓整個 union
     * 的型別推導塌成 `{[x:string]: any}`，然後 `refs.ts` / `registries.ts` 冒出
     * 十幾條看起來毫不相干的 tsc 錯（2026-08-15 實際踩到）。
     * ⇒ 規則放在**巢狀區塊**上，頂層保持乾淨的 ZodObject。
     * `mapSpecDoc` 的 grid / traversal / topology 也是同一個形狀。
     */
    zoom: z
      .object({
        /** 滾輪能推到的**最近**距離（＝離地板最低）。⛔ 2026-08-18 起它**不再**是開局預設。 */
        minDolly: z.number().min(CAMERA_MIN_DOLLY_MIN).max(CAMERA_MIN_DOLLY_MAX).describe(
          "@zh 最近視野（玩家滾輪能拉到的最貼地）\n" +
          "@note 滾輪能推到多近，單位是鏡頭到角色的距離。⛔ **它已經不是開局預設了**（GH#361 之前是）—— 預設改成下面那一格。所以現在調它只影響「玩家最多能拉多近」。⚠️ 下界 4：再近鏡頭會穿進角色身體裡（EX 演出用的特寫是 5，那是刻意的例外，不受這一格管）。",
        ),
        /** 滾輪能拉到的**最遠**距離 —— owner 2026-08-15 減兩節、2026-08-18(#361) 再砍一半的就是這一格。 */
        maxDolly: z.number().min(CAMERA_MAX_DOLLY_MIN).max(CAMERA_MAX_DOLLY_MAX).describe(
          "@zh 最遠視野（GH#361 砍了一半的就是這一格）\n" +
          "@note 滾輪能拉到多遠，同時也是出貨的**開局預設**。出貨 {{出貨值}} ＝ 原本 36 的一半（owner 2026-08-18「可以縮放最高的視角太高了，至少要砍低一半高度」；眼高 = 距離 × sin68°，所以 33.4 → 16.7 單位）。⭐ 那是他要求的**下限** —— 還嫌高就繼續往下調，⚠️ 但記得「開局預設鏡頭」如果比它大會被擋下來，兩格要一起調。⚠️ 上界 120 不是裝飾：拉遠等於把整個競技場塞進同樣多的像素，角色會小到分不出誰是誰 —— 而 24×18 的場地對角線本來就只有 30 單位左右。",
        ),
        /**
         * ⭐ **開局的預設鏡頭**（GH#361）。出貨值 = `maxDolly`，也就是
         * owner 要的「預設離地板最高，玩家再自己縮放拉近」。
         *
         * ⚠️ **刻意是 optional**：這一格是加在一份**已經可能被後台存過 override**
         * 的文件上（`data/` 覆蓋層會蓋掉 `content/`）。做成必填的話，任何一份
         * 舊的四鍵 override 都會在 `.strict()` 下解析失敗 → 內容整份載入失敗 →
         * fail-open 退回骨架 —— 那正是 2026-08-02 生產故障的形狀。
         * 沒填時走 {@link resolveCamera} 的出貨值 + 夾限，⛔ 不會壞。
         *
         * ⭐ **一鍵 rollback**：填 `minDolly` 的數字 = 回到 #31a 的舊行為
         *（預設＝最近）。⚠️ 這一格與 `minDolly` 相等時，手把 R3 的縮放圈會自動
         * 反向（見 `CameraRig.zoomAwaySign`）—— 因為「離預設遠的那一端」換邊了。
         */
        defaultDolly: z.number().min(CAMERA_MIN_DOLLY_MIN).max(CAMERA_MAX_DOLLY_MAX).optional().describe(
          "@zh ⭐ 開局預設鏡頭（GH#361：出貨＝離地板最高）\n" +
          "@note 每一場**一進場**時鏡頭離角色多遠。出貨 {{出貨值}} ＝ 跟「最遠視野」一樣，也就是 owner 要的「**預設離地板最高，玩家再自己縮放拉近**」。⭐ **一鍵 rollback**：填成跟「最近視野」一樣的數字（出貨 10）就完全回到 #31a 的舊行為（一進場就貼著角色）。⚠️ 它**必須落在「最近視野」與「最遠視野」之間**，否則存檔會被擋下來 —— 落在區間外的預設會在進場當下被夾回端點，於是後台顯示的數字跟遊戲裡的不是同一個。⚠️ 這一格也決定手把 R3 縮放圈往哪個方向走：預設在最遠端時 R3 一節一節**往內**推，預設在最近端時**往外**拉，最後一下都是歸位。",
        ),
        /**
         * **陣亡觀戰**時的最遠距離。刻意比 `maxDolly` 寬很多 ——
         * 死了以後看的是「整場打成怎樣」，不是自己的操作。
         */
        maxDollyDead: z.number().min(CAMERA_MAX_DOLLY_MIN).max(CAMERA_MAX_DOLLY_MAX).describe(
          "@zh 陣亡觀戰時的最遠視野\n" +
          "@note 死掉之後看整場用的。刻意比上面那格寬很多（出貨 {{出貨值}} 對 18），因為觀戰時要看的是「這一場打成怎樣」而不是自己的操作。⚠️ GH#361 砍的是**活著**的最遠視野，這一格**刻意沒有跟著砍** —— 觀戰本來就是要看全場。覺得死掉之後拉太遠就調這一格。⚠️ 它**不可以小於**最遠視野 —— 存檔時會被擋下來，理由是那會讓「死了以後視野反而變窄」。",
        ),
        /** 一單位 `deltaY` 推多少 dolly。見 `CAMERA_WHEEL_STEP_*` 的「節」換算。 */
        wheelStep: z.number().min(CAMERA_WHEEL_STEP_MIN).max(CAMERA_WHEEL_STEP_MAX).describe(
          "@zh 一單位滾輪推多少（＝「一節」的換算）\n" +
          "@note 鏡頭距離 += 滾輪的 deltaY × 這一格。出貨 {{出貨值}}，配上瀏覽器一節 100–120 的 deltaY ⇒ **一節約 2.0–2.4**。⭐ 這一格存在的理由就是讓「幾節」講得出來 —— 調大它滾一下跑更遠（比較跳），調小比較細膩但要滾很多下。⚠️ 觸控板的 deltaY 比滑鼠小很多，所以同一格對兩種裝置的手感不一樣。",
        ),
      })
      .strict()
      .superRefine((v, ctx) => {
        // ⚠️ 上下界各自合法但**組合起來**不合法的那兩格。⛔ Zod 的 min/max 抓不到。
        if (v.minDolly > v.maxDolly) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["maxDolly"],
            message: "最遠視野不可以比最近視野還近 —— 滾輪會整個失效",
          });
        }
        if (v.maxDollyDead < v.maxDolly) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["maxDollyDead"],
            message: "觀戰視野不可以比活著的時候還窄",
          });
        }
        // 預設鏡頭必須落在縮放區間**裡面**。⛔ 各自的上下界抓不到這個組合：
        // 4…120 對 `defaultDolly` 是合法的，但落在 [minDolly, maxDolly] 外面時
        // 玩家一進場就被夾到區間端點 —— 後台會顯示一個「存了但不是那個值」的數字。
        if (v.defaultDolly !== undefined && (v.defaultDolly < v.minDolly || v.defaultDolly > v.maxDolly)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["defaultDolly"],
            message: "開局預設鏡頭必須介於最近視野與最遠視野之間",
          });
        }
      }),
  })
  .strict();

/**
 * 出貨值。
 *
 * ⭐ `maxDolly` 的三代：**40**（原始）→ **36**（owner 2026-08-15「減兩節」，
 * 一節 = 一次滾輪 `deltaY≈100` × `wheelStep` 0.02 ≈ 2.0 dolly）
 * → **18**（owner 2026-08-18 / GH#361「至少要砍低一半高度」）。
 * 眼高 = `dolly·sin(68°)`，所以 36→18 就是 33.4u→16.7u，**正好一半** ——
 * 那是 owner 要求的**下限**，他嫌還高的話這一格直接往下調即可（後台存檔就生效）。
 *
 * ⭐ `defaultDolly` = `maxDolly` ⇒「預設就是離地板最高」（GH#361 第①條）。
 * ⛔ 它**不是**寫成 `maxDolly` 的別名：owner 之後很可能想要「預設比最遠再近一點」，
 * 那要是一格獨立的數字，不是一條推導。
 */
export const DEFAULT_CAMERA = {
  minDolly: 10,
  defaultDolly: 18,
  maxDolly: 18,
  maxDollyDead: 90,
  wheelStep: 0.02,
} as const;

export const DEFAULT_CAMERA_DOC = {
  id: CAMERA_DOC_ID,
  schema: "config.camera@1",
  zoom: { ...DEFAULT_CAMERA },
} as const;

export type ConfigCameraDoc = z.infer<typeof zConfigCameraDoc>;

/**
 * 生效中的鏡頭界線 —— 後台 overlay ?? `content/config/camera.json` ?? 出貨預設。
 *
 * ⚠️ `defaultDolly` 在這裡就被**夾進 [minDolly, maxDolly]**，⛔ 不是留給每一個
 * 呼叫端各自夾一次。理由：它是 optional（見 schema），所以一份**只存了四鍵的舊
 * override** 會拿到出貨的 18 配上它自己存的 `minDolly/maxDolly` —— 兩個各自合法、
 * 組合起來可能出界。夾在唯一的解析點，下游就沒有「預設在區間外」這個狀態存在。
 */
export function resolveCamera(doc: Partial<ConfigCameraDoc> | null | undefined): {
  minDolly: number;
  defaultDolly: number;
  maxDolly: number;
  maxDollyDead: number;
  wheelStep: number;
} {
  const z0 = doc?.zoom;
  const minDolly = z0?.minDolly ?? DEFAULT_CAMERA.minDolly;
  const maxDolly = z0?.maxDolly ?? DEFAULT_CAMERA.maxDolly;
  const wanted = z0?.defaultDolly ?? DEFAULT_CAMERA.defaultDolly;
  return {
    minDolly,
    defaultDolly: Math.min(Math.max(wanted, minDolly), maxDolly),
    maxDolly,
    maxDollyDead: z0?.maxDollyDead ?? DEFAULT_CAMERA.maxDollyDead,
    wheelStep: z0?.wheelStep ?? DEFAULT_CAMERA.wheelStep,
  };
}
