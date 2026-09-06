import { z } from "zod";
import { zId } from "../common";

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

/**
 * ⭐ **平台政策**（GH#1089）—— 「哪一種裝置玩得到，以及它跑幾張」的**唯一**一份住處。
 *
 * owner 2026-09-06（逐字）：
 * > 「請你開票修改所有來源 本遊戲不支援手機但支援平板最高 30fps  手機是 30fps
 * >  以 ipad mini 的 A17 Pro 為最低配備標準來設計」
 *
 * ── 為什麼它住在 `config.model-lod@1` 裡 ────────────────────────────────
 * 這份文件已經**不只**是模型階對照表：`adaptiveCostMode`（自適應階梯讀哪一個成本）
 * 早就住在這裡了。它實際上是「**這台裝置能跑成什麼樣**」那一頁，而平台政策
 * 正是同一個問題的最上層答案。⛔ 開一份新的 `content/config/*.json` 需要動
 * `apps/admin/src/configForms.ts` 的有序註冊表（全 repo 撞車率最高的接線之一），
 * 而這一格不值得那個代價。
 *
 * ── 為什麼 30 只有一個住處 ───────────────────────────────────────────
 * `apps/client/src/render/frameCap.ts` 以前寫著 `MOBILE_FPS_CAP = 30` 這個**字面值**。
 * 現在那個常數改名成 `TABLET_FPS_CAP` 並且**從這裡的 Zod 預設推導**
 * （`DEFAULT_MODEL_LOD.platformPolicy.tabletFpsCap`）—— 第〇·四守則：
 * 一個算得出來的數字不可以有第二個住處。
 *
 * ⚠️ **判準要組合多個訊號，而且誤判的方向要選對**：web 上分不乾淨手機與平板
 * （iPadOS 的 Safari 預設回報成桌機 UA、`'ontouchstart' in window` 是 false，
 * 只有 `maxTouchPoints` 與 `(pointer: coarse)` 說得出真話）。
 * ⇒ `phoneShortEdgePx` 是**短邊 CSS px**的門檻，而**沒過門檻一律當平板放行** ——
 * ⭐ 把平板誤判成平板（放行）比把平板誤判成手機（擋住玩家）便宜得多。
 */
const zPlatformPolicy = z
  .object({
    phone: z
      .enum(["unsupported", "supported"])
      .default("unsupported")
      .describe(
        "@zh 📱 手機的支援狀態\n" +
        "@note owner 2026-09-06 逐字：「本遊戲**不支援手機**但支援平板」。unsupported（出貨）＝ 判定為手機的裝置進站時先看到一張「不支援手機・最低配備 …」的告知；supported ＝ 不顯示任何告知（＝這一版之前的行為，rollback 用）。⚠️ 這一格**不改變**任何遊戲行為，它只決定要不要**說**。真正擋不擋人是下面那一格。\n" +
        "@opt unsupported 不支援（出貨）—— 進站顯示告知\n" +
        "@opt supported 支援 —— 不顯示告知（回到這一版之前）",
      ),
    phoneHardBlock: z
      .boolean()
      .default(false)
      .describe(
        "@zh 📱 手機告知要不要**硬擋**\n" +
        "@note 關（出貨）＝ 告知畫面上有一顆「仍要繼續」，玩家按了就照常進遊戲。開＝ 沒有那顆按鈕，判定為手機就進不去。⛔ 出貨刻意是**關**：判準在 web 上分不乾淨手機與平板，而誤擋一位拿平板的玩家的代價遠高於讓一位拿手機的玩家自己承擔卡頓。要開之前先確認 `phoneShortEdgePx` 在真機上量過。",
      ),
    phoneShortEdgePx: z
      .number()
      .int()
      .min(0)
      .max(2000)
      .default(600)
      .describe(
        "@zh 📱 判成手機的門檻：短邊幾個 CSS px 以下\n" +
        "@note 觸控裝置的**短邊**（`min(視窗寬, 視窗高)`，所以橫拿直拿同一個答案）小於這個數字就判成手機，否則判成平板。⭐ 出貨 {{出貨值}} 的來源：iPad mini 短邊 744、目前最大的手機約 430 —— 600 落在兩者中間而且離兩邊都很遠。⚠️ 往上調會開始把小平板誤判成手機（＝擋住玩家），往下調只會少說一句話。⇒ ⛔ 不確定就往下調。填 0 ＝ 沒有任何裝置會被判成手機。",
      ),
    tabletFpsCap: z
      .number()
      .int()
      .min(15)
      .max(240)
      .default(30)
      .describe(
        "@zh 🎞 平板（觸控裝置）的 fps 上限\n" +
        "@note owner 2026-09-06 逐字：「支援平板**最高 30fps**」（出貨 {{出貨值}}；與他 2026-07-28 那句「FPS強制都是60，除非額外調整，手機則是預設⋯」是同一個數字）。⭐ 這是**全遊戲唯一**一份 30：`apps/client/src/render/frameCap.ts` 的 `TABLET_FPS_CAP` 從這一格推導，戰鬥、登入、中場、商店立繪四條 render loop 全部吃它。⚠️ 它是**預設**不是硬鎖 —— 玩家在設定裡選過的值永遠贏（owner 那句話的後半「除非額外調整」）。調高＝平板更順但更燙。",
      ),
    minDevice: z
      .string()
      .min(1)
      .max(80)
      .default("iPad mini (A17 Pro)")
      .describe(
        "@zh 🧾 最低配備標準（顯示給玩家看的字）\n" +
        "@note owner 2026-09-06 逐字：「以 **ipad mini 的 A17 Pro** 為最低配備標準來設計」。⭐ 這一格是那句話在整個 repo 的**唯一**住處：手機告知畫面上那一行字直接讀它，⛔ 不是在客戶端、README、商店頁各打一次。換機型只要改這一格，⛔ 不必動任何程式。",
      ),
  })
  .strict();

/**
 * 平台政策的形狀。⚠️ 從文件 schema 推導，⛔ 不另外宣告一份 —— 兩份會漂。
 */
export type PlatformPolicy = z.infer<typeof zPlatformPolicy>;

export const zConfigModelLodDoc = z
  .object({
    id: zId,
    schema: z.literal("config.model-lod@1"),
    note: z.string().optional(),
    /** 總開關。false = 每個 preset 都載原檔。 */
    enabled: z.boolean().describe(
      "@zh 分級總開關\n" +
      "@note 關掉之後四個畫質等級全部載原始模型檔，等於 #115 之前的行為。線上如果發現某一階的 .glb 壞掉（破圖／載不進來），這一格是止血閥。",
    ),
    /** 畫質 preset -> 要抓的模型階。四個都必填,不允許靜默漏掉一個。 */
    presetTiers: z
      .object({
        low: zModelLodTier.describe(
          "@zh 低畫質 → 抓哪一階\n" +
          "@note 玩家選「低」時下載的模型階。small 面數最少、位元組最少，是老一點的平板最不容易發燙的一階，代價是輪廓會糊。\n" +
          "@opt high high（原始檔）\n" +
          "@opt mid mid（中階）\n" +
          "@opt small small（最省）",
        ),
        medium: zModelLodTier.describe(
          "@zh 中畫質 → 抓哪一階\n" +
          "@note 多數玩家會停在這一格，所以它是這一頁最實際的取捨點：mid 平均省一半以上位元組而外觀差異不明顯；改成 small 會更省但角色臉會開始糊掉。\n" +
          "@opt high high（原始檔）\n" +
          "@opt mid mid（中階）\n" +
          "@opt small small（最省）",
        ),
        high: zModelLodTier.describe(
          "@zh 高畫質 → 抓哪一階\n" +
          "@note 桌機通常留在 high（＝不換階，載作者原檔）。改成 mid 等於全體降階，連效能有餘裕的機器也拿不到最好的畫面。\n" +
          "@opt high high（原始檔）\n" +
          "@opt mid mid（中階）\n" +
          "@opt small small（最省）",
        ),
        auto: zModelLodTier.describe(
          "@zh 自適應 → 抓哪一階\n" +
          "@note ⚠️ 自適應階梯每幾秒就會換一級，而換模型階＝丟掉已載入的模型再發一次網路請求。留在 high 才不會在最撐不住的那台機器上、打到一半、反覆下載模型。改這一格之前先確認你要的是這個。\n" +
          "@opt high high（原始檔）\n" +
          "@opt mid mid（中階）\n" +
          "@opt small small（最省）",
        ),
      })
      .strict(),
    /**
     * ⭐ **自適應階梯讀哪一個成本**（GH#D5）。
     *
     * `frame`（出貨）＝ **整幀**：準時的幀回報 `workMs`、**遲到的幀回報 `wallMs`**。
     * ⛔ 在此之前它只讀 rAF 迴圈自己的 `workMs` ⇒ 瀏覽器合成、強制回流、GC、
     * shader 編譯、React reconcile **這一段再大它也不會降畫質**
     * —— 那就是「fps 好看卻很卡」的機制。
     *
     * `work` ＝ **止血閥**，逐位元回到 2026-08-23 之前的行為。
     *
     * ⚠️ ⛔ **不可以直接改成無條件讀 `wallMs`**（量過會做出更糟的缺陷）：
     * 牆上間隔的下界是「fps 上限」與「面板更新率」的較大值 ⇒ 健康機器**永遠**
     * 只量得到 60，而往上爬的門檻是 72 ⇒ **階梯一旦降下去就再也回不來**。
     * ⇒ 規則是「一個判斷、兩種回報」：`wallMs ≤ 1000/target × 1.15` 算準時。
     */
    adaptiveCostMode: z.enum(["frame", "work"]).default("frame").describe(
      "@zh 自適應階梯看哪一個成本\n" +
      "@note 自適應畫質在決定「要不要降級」時，量的是哪一段時間。⛔ 在 2026-08-23 之前它只看**遊戲迴圈自己**跑了多久（workMs）—— 而瀏覽器合成、版面重算、垃圾回收、著色器編譯、介面重繪這些**都不在裡面**。後果是「fps 數字很好看卻很卡」：畫面明明在掉幀，階梯卻認為機器很閒而一級都不降。整幀＝出貨值（準時的幀照舊只算遊戲迴圈，**遲到的幀才改算整幀**）；只算遊戲迴圈＝逐位元回到 2026-08-23 之前，如果新行為讓你的機器畫質降得太兇就切這一格。⚠️ 這裡刻意**不是**「一律改算整幀」—— 量過那樣會讓階梯降下去就爬不回來（健康機器被 fps 上限鎖在 60，而往上爬的門檻是 72）。\n" +
      "@opt frame 整幀（出貨）—— 遲到的幀算進瀏覽器那一段\n" +
      "@opt work 只算遊戲迴圈 —— 回到 2026-08-23 之前",
    ),
    /**
     * ⭐ 平台政策（GH#1089）。⚠️ `.default({})` 是刻意的：線上已經存過的
     * `model-lod` 覆蓋層文件不會有這一格，而 `.strict()` 底下少一個**必填**欄位
     * 會讓那份覆蓋層整份驗證失敗 ⇒ 操作者調過的 preset 表靜靜地退回出貨值。
     * 有了預設，舊覆蓋層照樣解析，只是拿到出貨政策。
     */
    platformPolicy: zPlatformPolicy.default({}),
  })
  .strict();
export type ModelLodTierName = z.infer<typeof zModelLodTier>;
export type ConfigModelLodDoc = z.infer<typeof zConfigModelLodDoc>;

/**
 * 出貨預設 —— `content/config/model-lod.json` 不存在(舊部署 / 內容掛掉)時,
 * `applyModelLodPolicy` 回退到的就是這一份,而它必須等於 #115 落地當下的行為:
 * low→small、medium→mid、high/auto→high。
 *
 * ⚠️ 每一格都要和 `content/config/model-lod.json` 一字不差 ——
 * `packages/shared/src/content/modelLodConfig.test.ts` 的 drift 斷言在守。
 * 兩份存在的理由不同:JSON 是**出貨值**(操作者會改),這份是**程式的保險絲**。
 */
/** 自適應階梯的成本來源出貨值（GH#D5）。`work` = 逐位元回到 2026-08-23 之前。 */
export const DEFAULT_ADAPTIVE_COST_MODE = "frame" as const;

export const DEFAULT_MODEL_LOD: ConfigModelLodDoc = {
  id: "model-lod",
  schema: "config.model-lod@1",
  enabled: true,
  presetTiers: { low: "small", medium: "mid", high: "high", auto: "high" },
  adaptiveCostMode: DEFAULT_ADAPTIVE_COST_MODE,
  // ⭐ 從 Zod 的 `.default()` **解析出來**，⛔ 不在這裡重打一次那五個值 ——
  //    重打就是第二個住處，而兩份預設漂掉的症狀是「後台顯示 A、程式回退到 B」。
  platformPolicy: zPlatformPolicy.parse({}),
};
