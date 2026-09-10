import { z } from "zod";
import { zId } from "../common";
import { CHAMPION_FORM_PAIRS } from "../../championForms";

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
 *   · `statusStrength`     ⭐ M1:`statuses` 那一半的濃度,0 = 逐位元回到
 *                          M1 之前(**一鍵 rollback**)。
 *
 * ---------------------------------------------------------------------------
 * ⭐ M1(GH#599)—— 為什麼同一張表要有**兩種鍵**
 * ---------------------------------------------------------------------------
 * 這三個旋鈕本來只認得「變身態的 championId」,於是它們的存在**依賴**那份變身態
 * champion doc 活著。而 owner 2026-08-22 要的正好相反:「變身帶來許多問題,因此我
 * 想要開啟變身態盡可能下架」。
 *
 * 七軸量測的結論是:5 對變身在畫面上的全部差別**就是這三個旋鈕**。所以只要它們
 * 認得**狀態 id**,那 5 對就可以退掉整份 champion doc 而畫面一個像素都不掉 ——
 * 這就是 `statuses` 那一格。⛔ 它不是第二套機制,是同一張表的第二種鍵。
 */
/**
 * 變身對的**兩半**（base ＋ alternate）的 championId。⭐ M1 用它把 `statuses`
 * 的鍵空間和 `forms` 的鍵空間**分開**——理由寫在 `statuses` 那一格。
 */
const FORM_PAIR_IDS: ReadonlySet<string> = new Set(
  CHAMPION_FORM_PAIRS.flatMap((p) => [p.baseId, p.alternateId]),
);

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
    /**
     * ⭐ M3(2026-08-23)—— **整具身體換一份模型**（`models/` 的文件 id，
     * 例:`imported.picacugy`）。省略 = 身體不換，只套顏色/大小/掛件。
     *
     * ─────────────────────────────────────────────────────────────────────
     * ⛔ 它與 `attachModelKey` 是**兩件事**，⛔ 不是同一格的兩種寫法
     * ─────────────────────────────────────────────────────────────────────
     *   · `attachModelKey` —— **多**掛一份 glb 在本體上（悟空超三的頭）
     *   · `modelKey`（這一格）—— 本體**換掉**（拳四郎 barbarian → heropikachu）
     * 兩者可以同時填，⛔ 但填錯格的症狀完全不同：拿這一格去掛頭，本體會直接
     * 變成一顆頭。
     *
     * ─────────────────────────────────────────────────────────────────────
     * 為什麼這一格要存在（量到的，⛔ 不是假設）
     * ─────────────────────────────────────────────────────────────────────
     * owner 2026-08-22:「變身帶來許多問題，因此我想要**開啟變身態盡可能下架**」。
     * 19 對變身逐對量下來，有 **4 對**的差別裡包含「身體真的換了一具模型」：
     *
     *   · `godie-n00p` 妖狐    fox2 → fox
     *   · `godie-o02l` 皮卡    picacugy
     *   · `godie-u034` 傑富力士 champ.thorne（共用替身）→ imported.herobiggon
     *   · `godie-u00l` 拳四郎   champ.skin.barbarian → **imported.heropikachu**
     *
     * ⭐ 最後那一對是**刻意的惡搞**，⛔ 不是資料錯誤 —— owner 2026-08-22 逐字：
     * 「這是對的，這是因為要**惡搞**他大絕招是變身大型皮卡丘」。
     *
     * 在這一格之前，`config.form-visuals@1` 只調得動顏色/大小/掛件 ⇒ 那 4 對
     * 的變身態 champion doc **不能退場**（退了身體就換不回去）。
     *
     * ─────────────────────────────────────────────────────────────────────
     * ⚠️ 與既有兩條解析路的**優先序**（寫在這裡，因為它是資料層的承諾）
     * ─────────────────────────────────────────────────────────────────────
     *   1. **這一格贏過 `e.key`** —— `e.key` 是伺服器每 tick 從
     *      `Champions.get(championId).modelKey` 重算的，也就是「這個座位選了誰」；
     *      這一格說的是「這具身體**現在**穿什麼」，那是更晚的一句話。
     *   2. **這一格贏過裝備造型替換**（`resolveModelKey`）—— 造型是本體的化妝，
     *      而這一格是「本體不是那個東西了」。落地方式是把它餵成
     *      `resolveModelKey` 的**輸入**（⛔ 不是加一條 if）：造型表查不到這個新
     *      的 key，於是原樣回傳，「變身贏」就是這件事的自然結果。
     *   3. **它繞過 `blizzardOverlay.resolve`** —— overlay 的工作是「這個
     *      championId 沒有自己的模型時去 w3u 借一具」，而這一格是操作者**明寫**
     *      的選擇，和裝備造型同一個待遇（`modelDocFor` 那條 `resolved !== modelKey`
     *      的早退就是它）。
     *
     * ⚠️ 上界 64 與 `attachModelKey` 對齊；⛔ 這裡不驗「這份 models 文件存不存在」
     * —— 那是 `contentRefs` 那一族的工作，而寫死一張名單會讓新增一份模型就要改
     * schema。查不到的 key ⇒ `modelFor` 回 null ⇒ 退回體素身體（⛔ 不丟例外）。
     */
    modelKey: z.string().min(1).max(64).optional(),
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
     * 為什麼不是 1:兩份 glb 是用**不同的轉檔倍率**烘出來的。`goku.glb` 走英雄
     * 身高規則(整隻 1.70u),`goku3head.glb` 走 1/36 道具倍率(2.836u,比本體還高)。
     * ⇒ 這一格是**兩個 `scale_factor` 的比值**:悟空是
     * **0.4161 = 0.01156 / 0.02778**,兩個數字都逐字取自
     * `tools/w3x-import/out/GoDieEX22s/models_report.json`。
     * 算法與出處寫在 `content/attachmentScale.ts`,守衛在它旁邊的 `.test.ts`
     * (它真的讀那兩份 JSON 對數字,⛔ 不掃註解)。
     *
     * ⛔ 這一段在 2026-08-20 之前寫的是「0.3221 = 0.008946 / 0.027778」,
     * 而 **`0.008946` 在整個 repo 裡不存在** —— 一段事後合理化(第三守則,GH#482)。
     * 出貨值因此是忠實尺寸的 77%;owner 2026-08-20:「**照原著 改成忠實值**」。
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
    /**
     * ⭐ M1(GH#599)—— **狀態 id** -> 帶著這個狀態的身體長什麼樣。
     *
     * `forms` 與這一格是**同一張表的兩種鍵**,值的形狀逐位元相同(`zFormVisualEntry`)。
     * 差別只有「誰決定它成不成立」:
     *
     *   · `forms`    —— 身體換成了 `Emeu` 那一半(⇒ 變身態 champion doc 必須存在)
     *   · `statuses` —— 身體**沒有換**,只是掛著某一個狀態
     *
     * ⚠️ 這一格存在的理由是**退場**:七軸量測(`docs/_reports/變身態退場評估v2_*`)
     * 量到 5 對變身在畫面上的全部差別就是這三個旋鈕(Saber 青白 ×1.04、白木 矮 9%、
     * 悟空 金色＋超三頭、臭作 ×1.56、索隆 全身黃色氣場)。把旋鈕搬到狀態上之後,
     * 那 5 對就可以退掉整份變身態 champion doc 而**畫面一個像素都不掉**。
     *
     * ⭐ 出貨五格(owner 2026-08-23「照你提的逐對建議」):`super-saiyan` ·
     * `invisible-air` · `armament-haki` · `perverted-gentleman` · `taproot`。
     * 前兩格與 `forms` 的對應格**逐位元同值**,那是遷移期的關鍵性質:
     * `composeBodyVisual` 的規則是「狀態命中 ⇒ 形態那一份整份讓位」,兩邊同值
     * ⇒ 「形態還在」與「形態退場了」畫面一個像素都不差。⛔ 不要把其中一邊調成
     * 「差不多」的值 —— 那會讓退場那一天冒出一個沒有人改過的視覺變化。
     *
     * ⚠️ 這張表只是**視覺的那一半**:狀態要真的掛到身上,觸發變身的技能才是寫入者
     * (`applyBuff.statusId` / `applyStatus.statusId` → `world.status` →
     * `net/snapshot.ts` 的 `SeatState.statusIds`)。⛔ `applyBuff.stackKey` 不算,
     * 它不上線。每一格的 `note` 各自寫了缺的是哪一支技能。
     *
     * ⛔ key 不可以是任何一半的 championId(base 或 alternate)。兩個原因:
     *   ① 那是 `forms` 的鍵空間,寫錯邊會得到一個「後台顯示得好好的、遊戲永遠不採用」
     *      的格子 —— 這一類是最難查的;
     *   ② 基本型的 id 若能從這裡拿到外觀,「基本型悟空不可以長出超三的頭」那條
     *      資料層防線就從 `isAlternateForm` 底下被繞過去了。
     */
    statuses: z
      .record(zId, zFormVisualEntry)
      .default({})
      .refine(
        (m) => Object.keys(m).every((k) => !FORM_PAIR_IDS.has(k)),
        "statuses 的 key 是**狀態 id**,不可以是變身對的任何一半 championId(那是 forms 的鍵空間)",
      ),
    /**
     * 0..1 —— `statuses` 那一半的濃度,也是 **M1 的一鍵 rollback**。
     *
     * 0 = 狀態外觀整個關掉(逐位元回到 M1 之前:只有 `forms` 那一半算數),
     * 1 = 完全照 `statuses[]` 寫的值。中間值和 `tintStrength` 一樣,插的是
     * 「離中性有多遠」,⛔ 不是直接相乘(直接乘會讓 0 變成全黑)。
     *
     * ⚠️ 它是**數值**而不是布林,和 `tintStrength`/`scaleStrength` 同型 —— 後台
     * 那一頁的布林格與數值格是兩種控制項,共用同一組欄位定義,所以同型的新欄位
     * 不需要動任何一行版面程式。
     */
    statusStrength: z.number().min(0).max(1).default(1),
  })
  .strict();
export type FormVisualEntry = z.infer<typeof zFormVisualEntry>;
export type ConfigFormVisualsDoc = z.infer<typeof zConfigFormVisualsDoc>;

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
  // ⭐ M1(GH#599)—— **owner 2026-08-23 已經勾了**:「照你提的逐對建議」
  // (對著 🟢 可退場 9 · 🟡 要先做一個機制 6 · 🔴 不建議退場 4 · ⚪ 兩邊都沒接 1
  // 那張表)。⛔ 在那之前這一格是空的,理由是「他還沒勾,先寫進去 = 我替他下架」;
  // 那句理由現在過期了,所以它被換掉而不是留著(第三守則:過期的理由會被下一輪引用)。
  //
  // ⚠️ 這五格是**視覺的那一半**。要在遊戲裡看得到,觸發變身的那支技能還要把
  // 對應的 `statusId` 掛上去(每一格的 `note` 各自寫了是哪一支);⛔ 只有 `stackKey`
  // 不算 —— 線上送的是 `world.status` 的 `statusId`(`net/snapshot.ts`)。
  // 後台「變身外觀」那一頁的〈狀態外觀〉區塊是它的編輯入口,
  // `statusStrength` 轉到 0 是整區的一鍵 rollback。
  statuses: {
    // 11-002 武裝色霸氣 —— 兩半同模型同色同大小,唯一的差別是氣場球體。
    // attachScale 0.4204 = 0.01168 / 0.02778(`models_report.json` 的兩個
    // scale_factor),算法與 `godie-o00x` 那一格逐字相同。
    "armament-haki": {
      note: "11-002 武裝色霸氣(godie-udre ⇄ godie-u01u)。七軸量測:兩半同模型 imported.heromusashimiyamoto、同色、同大小 —— 唯一看得出來的是全身氣場球體。attachScale 0.4204 = 0.01168 ÷ 0.02778(models_report.json 的兩個 scale_factor:HeroMusashiMiyamoto.mdx ÷ war3mapImported__poweraura.MDX),算法與 godie-o00x 那一格逐字相同。⚠️ 這一格要在遊戲裡生效,godie-udre.ex 的 applyBuff 還要帶 statusId:\"armament-haki\" —— 那半個檔案這一輪在別條 lane 的柵欄裡。",
      attachModelKey: "imported.war3mapimported-poweraura",
      attachBone: "origin",
      attachScale: 0.4204,
    },
    // 20-01 風王結界 —— ⭐ 值與 `forms["godie-e00l"]` 逐位元相同(見下面那段
    // 「為什麼兩邊同值」)。
    "invisible-air": {
      note: '20-01 風王結界(godie-e002 ⇄ godie-e00l)。⭐ 值與上面 forms.godie-e00l **逐位元相同**,那是刻意的:composeBodyVisual 的規則是「狀態命中就取代形態」,兩邊同值 ⇒ 遷移中與退場後畫面一個像素都不差。w3x 兩半無任何視覺差(同模型/同色/同 usca 1.10),所以這是美術決定。⚠️ 要生效還需要 godie-e002.w 的切換在開啟時掛上 statusId:"invisible-air"(切換技,所以是開/關兩個出口,⛔ 不是一個時鐘)。',
      tint: [0.72, 0.92, 1.35],
      scaleMult: 1.04,
    },
    // 30-002 變態紳士 —— ⚠️ 帶著一個**已知的**渲染缺口,寫在 note 裡。
    "perverted-gentleman": {
      note: "30-002 變態紳士(godie-orkn ⇄ godie-o030)。1.5609 = o030 的 relativeScale 3.0 ÷ orkn 的 1.922(content/models/_standin-overrides.json),⛔ 不是地圖的 usca 3.0 —— 兩半共用 champ.sela,身高正規化之後只有比值有意義。⚠️⚠️ 已知缺口:orkn 那一筆帶 standinRelativeScale:1,而 championBody.modelOverrideFor 只把變身倍率乘進 relativeScale、**沒有**乘進 standinRelativeScale(standinScale.ts 檔頭自己寫著這條縫)。⇒ 退場之後,只有在真的載入 Orkn.glb 時看得到這個 1.56 倍;回退到方塊人時它會被吃掉。修法是那一行乘法,⛔ 不是改這個數字。",
      scaleMult: 1.5609,
    },
    // 09-03 超級賽亞人 —— ⭐ 值與 `forms["godie-o00x"]` 逐位元相同。
    "super-saiyan": {
      note: '09-03 超級賽亞人(godie-ogrh ⇄ godie-o00x)。⭐ 值與上面 forms.godie-o00x **逐位元相同**(理由同 invisible-air)。掛件是真的 w3x 事實(A0MJ 球體(悟空超3) = Goku3head.mdx @ origin),金色與 +8% 身高是美術決定。⚠️ 要生效還需要 godie-ogrh.e 的 applyBuff 帶 statusId:"super-saiyan"(它今天只有 stackKey,而 stackKey ⛔ 不會出現在 SeatState.statusIds 上)。',
      tint: [1.45, 1.3, 0.55],
      scaleMult: 1.08,
      attachModelKey: "imported.goku3head",
      attachBone: "origin",
      attachScale: 0.4161,
      attachOffsetY: 0,
    },
    // 70-00 紮根 —— 地圖自己把紮根形態縮小(usca 1.10 → 1.00)。
    taproot: {
      note: '70-00 紮根(godie-e00s ⇄ godie-e010)。0.9091 = e010 的 relativeScale 1.0 ÷ e00s 的 1.1 —— 地圖自己把紮根形態**縮小**(usca 1.10 → 1.00),那是這支切換技唯一的視覺。⭐ 這一對的另一半(走不動)已經不需要換英雄卡了:M5 的 SourceGrantFields.immobile 掛在一份 whileStatus 閘住的天生技 rank 上就夠(守衛 sim/immobileGrant.test.ts)。⚠️ 要生效還需要 godie-e00s.passive 在開啟時掛上 statusId:"taproot"。',
      scaleMult: 0.9091,
    },
  },
  statusStrength: 1,
  forms: {
    // 09 悟空 → 超級賽亞人。掛件是 w3x 事實(A0MJ 球體(悟空超3) = Goku3head.mdx);
    // 金色與 +8% 身高是美術決定(w3u 兩半的 tint/usca 完全相同)。
    "godie-o00x": {
      note: "掛件=w3x A0MJ 球體(悟空超3),掛點 origin 也是 w3x 記的;金色 tint 與 1.08 倍身高是美術決定,w3u 兩半同色同大小",
      tint: [1.45, 1.3, 0.55],
      scaleMult: 1.08,
      attachModelKey: "imported.goku3head",
      attachBone: "origin",
      // ⭐ GH#482 —— 忠實值 0.01156 / 0.02778（`models_report.json` 的兩個
      //    `scale_factor`）。⛔ 舊值 0.3221 只有它的 77%，而旁邊那句註解引用的
      //    `0.008946` 在整個 repo 裡不存在。守衛：`content/attachmentScale.test.ts`。
      attachScale: 0.4161,
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
