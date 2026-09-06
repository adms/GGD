import { z } from "zod";
import { zId } from "../common";

/**
 * config.ambient-vfx@1 — AMBIENT vfx bindings (`config/ambient-vfx.json`):
 * per-model attachments that live while the entity lives (WC3 hero glows,
 * smolder trails, ribbon wings). Each binding names a `vfx` doc id from the
 * vfx collection (vfx@1 particle or ribbon@1 trail); the anchor bone lives ON
 * the vfx/ribbon doc itself, not the binding. Consumed by the client's
 * AmbientVfx channel; unknown modelKeys/doc ids degrade to no-ops.
 */
/**
 * ⭐【只在某一格開關技開著的時候戴】—— `whileToggle` 的合法值（GH#546）。
 *
 * owner 2026-08-22：
 * > 「**風王結界這種開關型按鈕 圖示跟特效要明顯看出是開還是關狀態**
 * >  （w3x會有**特殊攻擊特效跟隨手部**、圖示也會有流轉作為打開中顯示）」
 *
 * ⭐ 這一格逐字等於 `sim/intents.ts` 的 `CASTABLE_SLOTS`，而它**刻意不 import 它**：
 * `content/schema/` 是文件層、`sim/` 是規則層，理由與 `protocol/schema.ts` 的
 * `TOGGLE_MASK_SLOTS` 一字不差。取而代之的是一條**對帳斷言**
 * （`apps/client/src/ui/abilityToggleWiring.test.ts` 的 TOGGLE_MASK_SLOTS 那條）真的把兩張表比在一起
 * —— 有人加第七個槽位時它會紅，⛔ 而不是讓那一格永遠讀成「關著」。
 */
export const AMBIENT_TOGGLE_SLOTS = ["Q", "W", "E", "R", "EX", "PASSIVE"] as const;

export const zAmbientVfxBinding = z
  .object({
    /** vfx-or-ribbon doc id in the vfx collection (SOFT: may be unauthored) */
    vfx: z.string().min(1),
    /**
     * 這一列**為什麼在這裡**。⛔ 不被任何程式讀 —— 它存在是因為一列綁定的理由
     * （為什麼挑這一份 vfx 文件、為什麼綁 modelKey 而不是 championId）今天只活在
     * commit message 與 `docs/_reports/` 裡，而下一輪讀 JSON 的人看不到那些。
     */
    note: z.string().max(2000).optional(),
    /**
     * ⭐【這一列的開關】（GH#546）。`false` = 這一列**完全不掛**，⛔ 但那一行著作
     * 還在文件裡。
     *
     * ⚠️ 它存在的理由是**回頭的成本**：把一列拿掉要編一個 record-of-array 並且
     * 把那一行知識丟掉（第零守則：知識不可以無聲消失），而把它關掉是一格布林。
     * 缺席 = `true` = 這一列照掛 —— 也就是這一格出現之前 1,900 份綁定的行為逐字。
     */
    enabled: z.boolean().optional(),
    /**
     * ⭐【只在這一格開關技**開著**的時候才掛】（GH#546 —— 20-01 風王結界的手部特效）。
     *
     * 缺席 = 無條件（今天每一列都是這樣）。填了 = 這一列只在該座位的
     * `SeatState.toggleMask` 對應位元亮著的時候存在，關掉的那一刻**真的被拆掉**
     * （⛔ 不是 alpha 0 —— 那是 #262 的特效洩漏形狀）。
     *
     * ⚠️ **為什麼是這裡而不是 `ability@1.persistentVfx`**：那一格的條件語意逐字是
     * 「這支技能**在身上／已解鎖**就掛著」（`GetUnitAbilityLevel > 0`），而一支切換技
     * 學會之後**永遠**在身上 —— 寫在那裡的手部特效會從學會 W 的那一刻永久噴到
     * 比賽結束，⛔ 而 owner 要的正好相反：它就是「**開著**」這件事本身的顯示。
     *
     * ⚠️ 綁在 modelKey 上就是綁在**這具身體**上。一具身體被多位英雄共用而他們的
     * 切換技在**不同槽位**時，改綁 championId（`bindingsFor` 的鍵兩種都收，
     * 見 `GameApp.formAttachmentFor` 的雙鍵查表）。
     */
    whileToggle: z.enum(AMBIENT_TOGGLE_SLOTS).optional(),
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
    enabled: z.boolean().describe(
      "@zh 場地要不要有環境火焰\n" +
      "@note 關（出貨值）＝ 所有場地的火把一團火都不冒，也就是 owner 要的結果；開＝ 命中的布景道具每一支都掛一團常駐的加色火焰。這是唯一決定「場上有沒有火」的一格，下面三格只有在它開著時才有意義。",
    ),
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
    maxEmitters: z.number().int().min(0).max(64).describe(
      "@zh 一張場地最多幾團火\n" +
      "@note 同時存在的火焰粒子系統上限，超過的火把就單純不冒火（依場地文件的順序先到先得）。每一團都是一組獨立的粒子系統加一張貼圖，所以這個數字直接就是「這張場地為了火焰多付出的繪製成本」。16 ＝ 出貨場地的火把全部點燃；填 4 就是只點四支，畫面上仍然有火但不會沿著整圈邊緣亮一排。",
    ),
    /** 每個火焰每秒噴幾顆粒子。上限 200 擋掉把 18 打成 180/1800。 */
    emitRate: z.number().min(0).max(200).describe(
      "@zh 每團火每秒噴幾顆粒子\n" +
      "@note 火焰的濃密程度。18（出貨值）是一團看得出在燒的小火；調低會變成稀疏的火星、調高會變成一團實心的亮塊 —— 而 16 團同時調高就是 owner 抱怨的那個畫面。它同時決定同螢幕的粒子總量，平板發燙時這一格比關掉整個功能溫和。",
    ),
    /**
     * 火焰粒子大小的倍率（1 = 原本的 0.3–0.6 世界單位）。上限 4 擋掉把「倍率」
     * 當成「百分比」填 100 的那種誤填 —— 4 倍已經是一顆比英雄還高的火球。
     */
    sizeScale: z.number().min(0.05).max(4).describe(
      "@zh 火焰粒子的大小倍率\n" +
      "@note 1（出貨值）＝ 每顆粒子 0.3–0.6 個世界單位，大約是英雄身高的五分之一到三分之一。這一格直接決定火焰在畫面上佔多大 —— 它比上面那格更影響「礙不礙眼」，因為粒子變大是面積成長不是數量成長。2 已經是一團跟英雄一樣高的火。",
    ),
  })
  .strict();

/**
 * 圓盤外 2D 景深背景的**全域政策**（GH#324，owner 2026-08-14）。
 *
 * ⚠️ 這裡**沒有幾何**。「這一層長什麼樣」是**內容**，住在 `arena@1` 的 `backdrop`
 * （由 `content/maps/*.json` 編譯出來）。這一格只有三個**決策點**：
 * 要不要開、平板上畫幾層、整體要多透明。
 *
 * ⭐ 為什麼分開：一張圖的背景改了要重跑 `pnpm --filter @ggd/anime-arena-map map:gen`
 * （產生器擁有那份輸出），
 * 而「平板掉幀 → 少畫兩層」必須是**後台存檔就生效**。
 * 把兩者混在一起 = 調一個效能旋鈕要重新產生七張地圖（第一守則的反面）。
 */
export const zArenaBackdrop = z
  .object({
    /** 總開關。false = 一個背景 mesh 都不建（圓盤外回到純色 clearColor）。 */
    enabled: z.boolean().describe(
      "@zh 圓盤外要不要有景深背景\n" +
      "@note 開（出貨值）＝ 場地邊界外面鋪上一層層往下沉的環帶，看起來像場地漂在一個有深度的世界裡；關＝ 圓盤外回到純色底（深藍黑），也就是這個功能做之前的樣子。⚠️ 攝影機俯角 68 度，畫面最上緣在水平線下方 45 度，所以**地平線永遠不進畫面** —— 圓盤外看得到的只有地板平面，這也是為什麼這裡是一層層攤平的環帶而不是一面天空盒。",
    ),
    /**
     * 最多畫幾層。⚠️ 砍的是**最外圈**（最遠的先消失），所以調小不會在場地邊界
     * 旁邊留黑洞。上限 8 跟 `zBackdrop.layers` 的上限一致 —— 兩邊不同的話，
     * 「我明明填了 6 層卻只看到 4 層」會變成一個查不出來的謎。
     */
    maxLayers: z.number().int().min(0).max(8).describe(
      "@zh 最多畫幾層背景\n" +
      "@note 每一層是 1 個繪製呼叫、最多 128 個三角面（對照：一隻英雄 1,500–2,000 面），所以 4 層（出貨值）的成本大約是四分之一隻英雄。⭐ 平板掉幀時這一格是最先該調的：砍掉的是**最外圈**那幾層（最遠、最暗的先消失），所以調到 1 也不會在場地邊界旁邊留下一圈黑洞。填 0 等同關閉。",
    ),
    /**
     * 透明度總倍率（乘在每一層自己的 `alpha` 上）。1 = 照內容寫的畫。
     * 調低 = 整個背景往後退，⭐ 這是「背景太搶戲」時最先該動的一格。
     */
    alphaScale: z.number().min(0).max(1).describe(
      "@zh 背景整體透明度倍率\n" +
      "@note 乘在每一層自己的透明度上。1（出貨值）＝ 照地圖文件寫的畫。⭐ 覺得「背景太搶戲、看不清楚場上」的時候先動這一格，而不是直接關掉整個功能 —— 調到 0.4 會讓整個背景往後退成一層淡淡的底，場地邊界仍然讀得出來。0 ＝ 全透明（看起來跟關掉一樣，但仍然付繪製成本，所以真的不要就用上面那格關掉）。",
    ),
  })
  .strict();

/**
 * 場景特色（配色／會動的打光／裝飾散佈）的**全域政策**（GH#362，owner 2026-08-18）。
 *
 * ⚠️ 這裡**沒有任何顏色**。「這張圖長什麼樣」是**內容**，住在 `arena@1` 的
 * `scenery`（由 `content/maps/*.json` 編譯出來）。這一格只有三個**決策點**：
 * 要不要開、每個分區最多長幾件裝飾、燈要不要真的動。
 *
 * ⭐ 為什麼要有這三格（第一守則）：
 * ① `enabled` 是 **owner 的一鍵 rollback** —— 13 張圖一次換皮，不喜歡就關掉，
 *    ⛔ 不必回滾一次部署。
 * ② `maxPropsPerZone` 是**效能旋鈕**：散佈規則展開出來的每一件都是一次
 *    instantiate + 一塊接觸陰影，平板掉幀時這一格比關掉整個功能溫和。
 * ③ `animateLights` 單獨切掉**動畫**那一半（顏色與角度照樣是這張圖的）——
 *    會動的光是每幀寫兩盞燈，暈車 / 光敏感的玩家要的正是「留下配色、拿掉閃爍」。
 */
export const zArenaSceneryPolicy = z
  .object({
    /** 總開關。false = 配色、打光、散佈裝飾全部退回出貨前那一組寫死的值。 */
    enabled: z.boolean().describe(
      "@zh 場地要不要有各自的場景特色\n" +
      "@note 開（出貨值）＝ 每張場地用自己的地板／牆壁染色、自己的燈（而且**燈會動**）、自己那一組散佈裝飾；關＝ 13 張場地全部退回同一組灰石板配色加同一顆不會動的太陽，也就是 owner 2026-08-18 抱怨的那個樣子。⭐ 這一格是**一鍵 rollback**：整批換皮不喜歡就關掉，不必回滾一次部署。",
    ),
    /**
     * 每個對戰分區最多長幾件散佈裝飾。⚠️ 砍的是**規則順序的後面**，所以作者要把
     * 最能代表這張圖的規則寫在前面。上限 96 擋掉把 24 打成 240。
     */
    maxPropsPerZone: z.number().int().min(0).max(96).describe(
      "@zh 每個對戰分區最多長幾件特色裝飾\n" +
      "@note 地圖文件用「規則」描述裝飾（例如「沿著 0.9 倍半徑擺 18 根柱子」），這一格是展開出來的件數上限。每一件是一次模型實例化加一塊接觸陰影 —— 平板掉幀時先調這一格，比關掉整個功能溫和。40（出貨值）比出貨場地實際用量還高，所以現在一件都不會被砍；它擋的是作者一次填八條規則那種上千件的情況。⚠️ 砍的是**規則順序的後面**，所以地圖作者要把最能代表這張圖的規則寫在最前面。",
    ),
    /** 燈要不要真的動。false = 用這張圖的顏色與角度，但停在波形的起點（靜止）。 */
    animateLights: z.boolean().describe(
      "@zh 場地的燈要不要真的會動\n" +
      "@note 開（出貨值）＝ 每張圖的光照它自己的波形變化（呼吸／搖曳／掃掠／雷雨），影子會轉、亮度會起伏；關＝ **保留**這張圖的燈光顏色與角度，但停在波形的起點，變回一盞不動的燈。⭐ 這一格單獨切掉「動」那一半是刻意的：對閃爍敏感的玩家要的是「留下配色、拿掉閃爍」，而不是連場景特色一起失去。",
    ),
    /**
     * ④ 下載來的 CC0 布景**自帶的黑色描邊殼**要不要留（GH#386 ②）。
     *
     * `content/assets/models/scenery-cc0/` 的 16 件 `crystal-crossroads` 帶一層反面
     * 外擴的輪廓殼（材質名 `Outliner_Mat`）。GGD 的英雄沒有描邊 ⇒ 這 16 件在場上會
     * 自帶一圈黑邊。⭐ 那是**視覺決定**不是缺陷，owner 沒有指定 ⇒ 做成開關。
     *
     * ⚠️ `.default(true)` 而不是必填，⛔ 也刻意**不**寫進 `content/config/ambient-vfx.json`：
     * 加一把鑰匙到那個檔案 = 舊映像的 `.strict()` 會整份拒絕（2026-08-02 事故的形狀），
     * 而這一格的出貨值就是「今天的樣子」，用 Zod 預設表達它零風險、零 drift
     * （`resolveArenaScenery` 走的是 `DEFAULT_ARENA_SCENERY_POLICY`，兩邊同一個值）。
     * 同一個手法見 `maxRounds` 的 `.default(MAX_ROUNDS_UNLIMITED)`。
     */
    outlineShells: z.boolean().default(true).describe(
      "@zh 下載來的水晶布景要不要保留自帶的黑色描邊\n" +
      "@note 開（出貨值）＝ 維持今天畫面上的樣子。`content/assets/models/scenery-cc0/` 的 16 件水晶／斷牆／破甕（crystal-crossroads 那一系列）在原作者那邊是卡通描邊風格，每一件都多帶一層向外翻的黑色輪廓殼（材質名逐字叫 `Outliner_Mat`）；關＝ 只把那層殼藏起來，本體原封不動。⭐ 為什麼會是一格開關而不是直接決定：GGD 的英雄是平面著色的方塊人，**沒有描邊**，所以那 16 件站在場上會自帶一圈黑邊、跟旁邊的東西不同調 —— 這是喜好問題不是缺陷，所以選擇權留在這裡。⚠️ 順帶的效果是那 16 件的繪製呼叫會少掉大約一半（描邊殼是獨立的一份幾何），平板掉幀時關掉它比拿掉整批裝飾溫和。",
    ),
  })
  .strict();

export const zConfigAmbientVfxDoc = z
  .object({
    id: zId,
    schema: z.literal("config.ambient-vfx@1"),
    /** modelKey -> ambient attachments applied while an entity uses the model */
    bindings: z.record(z.string().min(1), z.array(zAmbientVfxBinding)),
    /** 場地布景道具的常駐火焰（GH#251）。缺席 = 用 `DEFAULT_ARENA_FIRE`。 */
    /**
     * ⭐⭐ GH#725 AC⑥（舊 #39）—— 揮擊殘影**由攻擊事件觸發**。
     *
     * ── ⛔ 在此之前的形狀 ──────────────────────────────────────────────────
     * 上面那份 `bindings` 有 22 筆，⛔ 而它們是 **model-keyed 的 ambient**
     * （常駐掛在模型上）—— ⛔ 不是「揮劍的那一刻放一道刀光」。
     * 票文逐字：「**大多數英雄揮劍仍無殘影**」。
     *
     * ── ⭐ 判準是**武器 tag**，⛔ 不是一張 model key 名單 ────────────────────
     * 英雄卡上早就有（量到：`katana` 13 · `sword` 12 · `greatsword` 4 · `claw` 5）
     * ⇒ 覆蓋率從「有人手動綁的 22 個」變成「**有武器 tag 的都有**」，
     * ⭐ 而新英雄上架時**不必再有人記得去加一列**。
     */
    attackTrail: z
      .object({
        /** ⛔ 關掉＝回到只有 ambient 綁定（一鍵 rollback）。 */
        enabled: z.boolean().describe(
          "@zh 揮擊殘影（刀光）\n" +
          "@note ⭐ **這是 GH#725 AC⑥ 的 rollback 開關**。開著＝有武器 tag 的英雄揮擊那一刻放一道殘影。⚠️ ⭐ 判準是**武器 tag**（`katana` / `sword` / `greatsword` / `claw`）⛔ 不是上面那張逐模型的 `bindings` —— 舊做法是 22 筆手綁的**常駐**特效，而票文逐字說「大多數英雄揮劍仍無殘影」。⇒ 覆蓋率變成「有武器 tag 的都有」，⭐ 新英雄上架不必再有人記得加一列。",
        ),
        /**
         * 兩道殘影之間至少隔多久（毫秒）。
         * ⚠️ ⭐ 攻速上限是 **10** ⇒ 沒有節流的話一秒十道刀光疊在一起，
         * 而那比完全沒有更難讀 —— ⛔ 這不是體感微調，是承重的。
         */
        minGapMs: z.number().int().min(0).max(2000).describe(
          "@zh 兩道殘影至少隔多久（毫秒）\n" +
          "@note ⚠️ ⭐ **這是承重的，⛔ 不是體感微調**：攻速上限是 10，沒有節流的話一秒十道刀光疊在一起，而那比完全沒有更難讀。⭐ 節流是**逐身體**的 —— 兩位英雄同時揮劍不會互相擋掉。",
        ),
        /** 武器 tag → 殘影。⭐ **順序＝優先序**（第一個對上的贏）。 */
        byWeaponTag: z
          .array(
            z
              .object({
                /** 英雄卡 `tags` 上的那個字（`katana` / `sword` / …）。 */
                tag: z.string().min(1).max(32),
                /** 放哪一份 `vfx@1`。 */
                vfxId: z.string().min(1).max(64),
                /** 揮擊的高度（世界單位）。 */
                y: z.number().min(0).max(6).optional(),
              })
              .strict(),
          )
          .min(1)
          .max(16),
      })
      .strict()
      .optional(),
    arenaFire: zArenaFire.optional(),
    /** 圓盤外的 2D 景深背景政策（GH#324）。缺席 = 用 `DEFAULT_ARENA_BACKDROP`。 */
    backdrop: zArenaBackdrop.optional(),
    /** 場景特色（配色／打光／裝飾散佈）政策（GH#362）。缺席 = 用 `DEFAULT_ARENA_SCENERY_POLICY`。 */
    /**
     * ⭐⭐ **命中回饋的兩個 beat**（GH#940，2026-09-02）。
     *
     * ⛔⛔ `shieldGained` 這一則在 sim 裡發得好好的（`sim/effects/shield.ts`，
     * 一次 `addShield` 一則），⛔ 而它停在 `SERVER_ONLY_EVENT_TYPES`
     * ⇒ ⭐ **生成那一半從來沒有畫過一個像素**，而**破碎**那一半
     * （`guardBreak`）一直是活的 ⇒ 玩家看到的是一個**只有下半場**的演出。
     *
     * ⭐ 為什麼是一格開關而不是直接寫死：owner 2026-08-23 逐字抱怨過
     * 「地上常出現**一堆亮藍色往外擴散的圈圈特效**⋯**太亮太搶眼不好看**」
     * ⇒ 這是一個**新的畫面元素**，而他不在
     * ⇒ 照常設指令（「沒做完以前別問我了自己判斷，**但是留後台開關可以簡易 rollback**」）
     *   我挑了「開」當預設，⭐ 而關掉它是**一格下拉**，⛔ 不是一次部署。
     *
     * ⚠️ 顏色刻意避開他點名的亮藍 —— 用**淡玉綠**，⛔ 不是 `ice` 那族的青白。
     */
    hitCues: z
      .object({
        /** ⛔ 關掉＝回到今天的行為（生成無聲、只有破碎會亮）。 */
        shieldGained: z.boolean().default(true).describe(
          "@zh 護盾生成要不要有一個 beat\n" +
          "@note ⭐ **這是 GH#940 的 rollback 開關**。開（出貨值）＝ 有人拿到一片護盾時，在他身上亮一下**淡玉綠**的光。⛔ 在此之前這一半**從來沒有畫過一個像素**：事件在 sim 裡發得好好的（一次 `addShield` 一則），而它停在只給伺服器的清單上 —— ⭐ 而**破碎**那一半（破防的白光）一直是活的 ⇒ 玩家看到的是一個**只有下半場**的演出。⚠️ 顏色刻意**避開亮藍**（owner 2026-08-23：「一堆亮藍色往外擴散的圈圈特效⋯太亮太搶眼」）。⭐ 節奏是**一次 `addShield` 一則**，⛔ 不是每幀 —— 一發 AoE 給三個人就是三下，因為那三個人真的各多了一片盾。",
        ),
      })
      .strict()
      .optional(),
    scenery: zArenaSceneryPolicy.optional(),
  })
  .strict();
export type AmbientVfxBinding = z.infer<typeof zAmbientVfxBinding>;
export type ArenaFire = z.infer<typeof zArenaFire>;
export type ArenaBackdropPolicy = z.infer<typeof zArenaBackdrop>;
export type ArenaSceneryPolicy = z.infer<typeof zArenaSceneryPolicy>;
export type ConfigAmbientVfxDoc = z.infer<typeof zConfigAmbientVfxDoc>;

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
 * 出貨預設 —— 圓盤外的 2D 景深背景政策（GH#324）。
 *
 * ⚠️ **回退值是「開的」**，跟 `DEFAULT_ARENA_FIRE` 相反，而理由是同一條：
 * **回退到 owner 要的那一邊**。環境火 owner 明說要拿掉 ⇒ 回退是關；
 * 背景是 owner 明說要做的東西（「填補場景外的空缺」）⇒ 回退是開。
 * ⛔ 如果回退是關的，「內容檔載不到」這條路會讓圓盤外變回一片黑，
 * 而那跟「這個功能沒做」在畫面上一模一樣（失敗形態①）。
 *
 * ⚠️ 每一格都要和 `content/config/ambient-vfx.json` 的 `backdrop` 一字不差 ——
 * drift 斷言在 `apps/client/src/render/arenaBackdrop.test.ts`。
 */
export const DEFAULT_ARENA_BACKDROP: ArenaBackdropPolicy = {
  enabled: true,
  maxLayers: 4,
  alphaScale: 1,
};

/** 讀出背景政策。文件缺席 / 沒有 `backdrop` 區塊時回退到 `DEFAULT_ARENA_BACKDROP`。 */
export function resolveArenaBackdrop(
  doc: ConfigAmbientVfxDoc | null | undefined,
): ArenaBackdropPolicy {
  return doc?.backdrop ?? DEFAULT_ARENA_BACKDROP;
}

/**
 * 出貨預設 —— 場景特色政策（GH#362）。
 *
 * ⚠️ **回退值是「開的」**，理由與 `DEFAULT_ARENA_BACKDROP` 同一條：
 * **回退到 owner 要的那一邊**。owner 2026-08-18 明說要「更多特色裝飾 · 會變動的光 ·
 * 該場景的地板與牆壁顏色」⇒ 讀不到設定時要給他那個，⛔ 不是退回他抱怨的那個樣子。
 *
 * `maxPropsPerZone: 40` 是出貨場地實際用量的上緣（最多的一張 colosseum 每區
 * 32 件手擺 decor），所以出貨內容一件都不會被砍；它存在是為了擋「作者一次填
 * 8 條 count 64 的規則」那種 1,024 件的情況。
 *
 * ⚠️ 每一格都要和 `content/config/ambient-vfx.json` 的 `scenery` 一字不差 ——
 * drift 斷言在 `apps/client/src/render/arenaScenery.test.ts`。
 */
export const DEFAULT_ARENA_SCENERY_POLICY: ArenaSceneryPolicy = {
  enabled: true,
  maxPropsPerZone: 40,
  animateLights: true,
  /** ⭐ 維持原樣（GH#386 ②）—— 出貨的 16 件 CC0 水晶今天就是帶著黑邊在跑的。 */
  outlineShells: true,
};

/** 讀出場景特色政策。文件缺席 / 沒有 `scenery` 區塊時回退到 `DEFAULT_ARENA_SCENERY_POLICY`。 */
export function resolveArenaScenery(
  doc: ConfigAmbientVfxDoc | null | undefined,
): ArenaSceneryPolicy {
  return doc?.scenery ?? DEFAULT_ARENA_SCENERY_POLICY;
}
