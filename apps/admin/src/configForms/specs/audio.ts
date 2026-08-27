/**
 * 🔊 音訊對照表（`config.audio-map@1`）—— GH#806。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 為什麼它到今天才有後台頁
 * ════════════════════════════════════════════════════════════════════════════
 * `configDocCoverage.ts` 把它逐字記在 **`KNOWN_GAP`**（帳單，⛔ 不是免死金牌）
 * 上，理由是「它的形狀不適合通用長表單（N × 3 格）」。⭐ 那個理由是對的，而
 * **正解不是手刻一頁**，是第零守則⑨：**N 個同型 = K 個模板 + 一張表**。
 *
 * ⇒ 這一份用的是 `configTables.ts` 新開的 `recordScalars` 形狀：
 * **一個 entry 模板（幾欄）× N 列**，⛔ 不是 N × 欄數 個手寫欄位。
 * 232 顆 SFX 是 **3 欄**，⛔ 不是 696 格。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 三件這一頁自己要守的事
 * ════════════════════════════════════════════════════════════════════════════
 * 1. ⛔ **存檔是逐鍵合併，不是覆蓋。** `sfx.*.files`（音檔清單）這一頁不畫 ——
 *    它是內容作者的東西，而且改它要先有檔案。`validateTable` 拿基底文件逐鍵
 *    合併，所以 `files` 原封帶著走。少了那一半，第一次存檔就會讓整份文件過不了
 *    Zod（`files` 必填 min(1)），而**選填的 `gain` 被洗掉不會有任何錯誤** ——
 *    它只是安靜地退回 1.0。
 * 2. ⛔ **鍵不開放編輯（`keysFixed`）。** 事件名是消費端逐字比對的 key；後台加
 *    一列新的事件名只會多出一顆永遠不會被觸發的音，而畫面上看起來像成功了。
 * 3. ⭐ **搜尋是功能性的。** 232 列沒有搜尋 = 操作者找不到他要調的那一列，
 *    而「找不到」與「這一頁不存在」對他來說是同一件事。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 這一頁**同時**是三張票的後台一鍵 rollback（票的 Dependencies）
 * ════════════════════════════════════════════════════════════════════════════
 *   · GH#605 `rankUpAudience` —— 技能升級鈴播誰的
 *   · GH#568 `castLayerCap`   —— 一次施法最多疊幾層聲音（含 owner 的白名單）
 *   · GH#763 打擊音分層       —— rollback 是「把 `hit-light/medium/heavy` 三顆
 *     的音量調到 0」或請內容側把那三個 key 拿掉；⚠️ 這一頁**不加/刪 key**，
 *     所以那句話寫在 `sfx` 表的說明段落裡，⛔ 不讓 owner 自己去猜。
 */
import { zConfigAudioMapDoc } from "@ggd/shared/content";
import type { ConfigDocSpec } from "../engine";

/** 音檔路徑的形狀 —— 和 `zAudioAssetPath` 同一條規則（`^assets/`）。 */
const ASSET_PATH = /^assets\//;
const ASSET_PATH_ERR = "音檔路徑要以 assets/ 開頭（相對 content/）—— 打錯不會報錯，只會安靜地不出聲";

/** BGM 一列的三欄 —— `bgm` 與 `mapBgm` 共用同一個 entry 模板。 */
const BGM_COLUMNS = [
  {
    field: "file",
    zh: "音檔",
    kind: "text" as const,
    maxLen: 160,
    width: 300,
    pattern: ASSET_PATH,
    patternError: ASSET_PATH_ERR,
    note: "這個場景放哪一首。⚠️ 換一首之前要先確定檔案真的在 content/ 底下 —— 404 的音檔是**靜音**，⛔ 不是錯誤訊息。",
  },
  {
    field: "loop",
    zh: "循環",
    kind: "boolean" as const,
    width: 96,
    note: "開＝無縫循環的鋪底；關＝一次性的短曲（開場／勝利／落敗那三段）。把鋪底設成不循環，那個場景會在第一遍結束之後安靜下來。",
  },
  {
    field: "gain",
    zh: "音量",
    kind: "number" as const,
    min: 0,
    max: 4,
    optional: true,
    width: 90,
    note: "疊在 BGM 匯流排之上的個別倍率。它治的是「這一首本身錄得比別首大聲」，⛔ 不是玩家的總音量（那在遊戲內設定）。",
  },
];

export const AUDIO_MAP_SPEC: ConfigDocSpec<"audioMap"> = {
  page: "audioMap",
  collection: "config",
  docId: "audio-map",
  schemaTag: "config.audio-map@1",
  zod: zConfigAudioMapDoc,
  title: "音訊對照表",
  intro: [
    "**哪一個場景放哪一首、哪一個事件出哪一顆音、以及那顆音多大聲。** 在這一頁出現之前，這整條音訊線是第一守則的一個缺口：內容檔有、Zod 有，而**後台一格都轉不到** —— 調一格音量要編 repo 再走一次內容部署。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/audio-map.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果，要改就從這一頁改。",
    "⚠️ **這一頁不加也不刪任何一個 key。** 場景名與事件名是消費端逐字比對的鍵，而每一列背後要有真的音檔 —— 新增一顆音走內容編輯器，這一頁只調它的參數。",
  ],
  consumer:
    "apps/client/src/audio/AudioSystem.ts（bgm/sfx 的播放參數，客戶端開機時讀一次）；`castLayerCap` 走 apps/client/src/audio/sfxLayerCap.ts（播放的那一刻才夾，⛔ 不動任何內容檔）",
  effect:
    "玩家**下一次重新整理遊戲頁面**時生效（客戶端開機時才讀內容覆蓋層）。⛔ 不需要重啟 game-server —— 音訊整段活在客戶端。",
  fields: [
    {
      path: "rankUpAudience",
      zh: "技能升級鈴播誰的",
      note: "`rankUp` 是**廣播**事件，所以在夾之前，場上六個人每按一次 Q，你就聽見一次自己的升級鈴。self＝只有本人聽得到；all＝逐位元回到夾之前的行為。⛔ 刻意沒有第三種「別人的播小聲一點」——今天的音量是逐 key 的（下面那張 SFX 表），沒有逐事件的縫，收一個做不到的值進來就是一格設定得起來、遊戲裡什麼都不會發生的欄位。",
      optionLabels: {
        self: "self 只播本人的（出貨）",
        all: "all 全場每一次升級都響（夾之前的行為）",
      },
    },
    {
      path: "castLayerCap.enabled",
      zh: "一次施法的音效層數上限",
      note: "關掉＝一層都不夾，也就是這一格出現之前的行為。⭐ 夾只發生在**播放的那一刻** —— `content/config/vfx-families.json` 與逐支覆寫一個位元組都不會動，所以關掉它聲音**原封回來**，⛔ 不必重建任何內容。⚠️ 開著才有「碰到上限」這件事可以被回報，而 owner 2026-08-23 要的正是那個：「設定上限但同時也讓我知道哪些碰到上限，我可以額外審查白名單」。",
    },
    {
      path: "castLayerCap.maxLayers",
      zh: "一次施法最多播幾層",
      note: "層的順序是固定的：施法音 → 特效發射 → 特效命中 → 特效循環 → 特效消散。超出的從**後面**開始不播，所以被丟掉的永遠是最邊緣的那幾層，⛔ 不會是施法音本身。⚠️ 它數的是**同一次施法的整條生命週期**，⛔ 不是同一瞬間。出貨值 {{出貨值}} ＝今天一層都不夾；往下調 1 先夾掉消散音，再往下夾掉循環音。",
    },
    {
      path: "modelFxSound.enabled",
      zh: "移動中的模型特效要不要出聲",
      note: "【移動中的模型特效】（動地剁那一族）自帶音效的總開關。關掉＝逐位元回到那一族沒有聲音的那一版。⚠️ 這一格存在的理由是**回頭**，⛔ 不是觀望 —— owner 2026-08-23 的常設指令：「沒做完以前別問我了自己判斷 但是留後台開關可以簡易 rollback」。",
    },
    {
      path: "modelFxSound.arrive",
      zh: "落點那一發要不要響",
      note: "關掉＝只播施放那一刻的聲音，飛到落點的那一發不排。⚠️ 它與上面那格分開，是因為落點那一發是**客戶端自己排的**（sim 只送延遲秒數），比發射那一發多一個會出錯的環節 —— 值得能單獨關掉，而不必連發射音一起犧牲。⚠️ 它是「我挑的那一半」的 rollback，⛔ 不是一個平起平坐的選項。",
    },
  ],
  preserved: [],
  tables: [
    {
      path: "sfx",
      shape: "recordScalars",
      keysFixed: true,
      filterAfter: 20,
      title: "音效（每一個事件一列）",
      intro: [
        "**遊戲裡發生一件事，出哪一顆音、多大聲、多密集。** 每一列是一個事件名（普攻、命中、技能、UI…），而這一頁調的是它的三個播放參數 —— 音檔清單本身是內容作者的東西，這一頁**不動它**（存檔逐鍵合併，`files` 原封帶著走）。",
        "⚠️ **打擊音分層（GH#763）的一鍵 rollback 就在這張表上**：把 `hit-light` / `hit-medium` / `hit-heavy` 三列的音量調到 0，分層就聽不見了（⛔ 這一頁不刪 key —— 真的要拿掉那三個 key 要走內容編輯器）。",
        "⚠️ 音量是**倍率**不是分貝：0 = 靜音，1 = 原樣，超過 1 會疊在匯流排之上，一顆本來就錄得大聲的音很快就會削波。",
      ],
      key: {
        zh: "事件名",
        note: "消費端**逐字比對**的鍵（sim 的事件名，或客戶端自己的 UI 時刻）。⛔ 這一欄是唯讀的：改一個字就對不到任何事件，而那顆音會安靜地從遊戲裡消失，畫面上不會有任何錯誤。",
        maxLen: 64,
      },
      columns: [
        {
          field: "gain",
          zh: "音量",
          kind: "number",
          min: 0,
          max: 4,
          optional: true,
          width: 90,
          note: "疊在音效匯流排之上的個別倍率。留白＝1（原樣）。這是逐事件的音量，⛔ 不是玩家的總音量。",
        },
        {
          field: "cooldownMs",
          zh: "最短間隔(ms)",
          kind: "number",
          min: 0,
          max: 60_000,
          optional: true,
          width: 110,
          note: "同一個事件兩次播放之間至少隔多久，中間的**直接丟掉**。它治的是「十個人同時挨打變成一團白噪音」，代價是密集戰鬥時你聽不到每一下。⚠️ 上界是後台補的（schema 只有下界）。",
        },
        {
          field: "maxConcurrent",
          zh: "同時最多幾聲",
          kind: "int",
          min: 1,
          max: 32,
          optional: true,
          width: 110,
          note: "這個事件同時最多疊幾個聲音在播。調成 1 = 這顆音永遠不會和自己重疊，聽起來會比較乾淨但也比較假。⚠️ 上界是後台補的（schema 只有下界）。",
        },
      ],
      minRows: 1,
      maxRows: 600,
    },
    {
      path: "bgm",
      shape: "recordScalars",
      keysFixed: true,
      title: "背景音樂（場景）",
      intro: [
        "**每一個場景放哪一首。** 鍵是場景名（menu / lobby / combat / fireRing / settlement…，加上開場／勝利／落敗那三段一次性的短曲）。",
        "⚠️ 一個沒有登記的場景就是**安靜**的，⛔ 不會報錯 —— 所以刪一列的後果是「那一段沒有音樂」而不是任何錯誤訊息（也因此這一欄的鍵是唯讀的）。",
      ],
      key: {
        zh: "場景名",
        note: "客戶端逐字比對的場景鍵。⛔ 唯讀：改一個字＝那個場景從此靜音，而畫面上一切正常（音訊這一層從來不往畫格迴圈裡丟例外）。",
        maxLen: 64,
      },
      columns: BGM_COLUMNS,
      minRows: 1,
      maxRows: 64,
    },
    {
      path: "mapBgm",
      shape: "recordScalars",
      keysFixed: true,
      title: "背景音樂（逐場地的戰鬥主題）",
      intro: [
        "owner 2026-08-22:「因為現在地圖變多了，我們來為每張地圖創作新音樂吧」。這裡的每一列**取代**該場地戰鬥時的共用鋪底。",
        "⚠️ 一張沒有登記主題的場地會退回共用的 `combat` 鋪底，⛔ 不會靜音 —— 那個退路是刻意的：一首缺席的曲子永遠不可以讓一場比賽變安靜。",
      ],
      key: {
        zh: "場地 id",
        note: "`arena.*` 的 id，拼法要和場地輪替那一頁一字不差（伺服器每一 tick 送的也是同一個字串）。⛔ 唯讀：拼錯的那一列不會報錯，只會讓那張地圖繼續放共用鋪底。",
        maxLen: 64,
      },
      columns: BGM_COLUMNS,
      minRows: 0,
      maxRows: 64,
    },
    {
      path: "castLayerCap.whitelist",
      shape: "stringList",
      title: "層數上限的白名單（owner 的例外清單）",
      intro: [
        "owner 2026-08-23:「我可以**額外審查白名單**」。列在這裡的技能**不受**上面那個層數上限限制 —— 它們的每一層都照播。",
        "⚠️ 值是**技能 id**（例：`godie-e008.r`），⛔ 不是英雄 id。填錯不會報錯，只會讓那一支繼續被夾。",
      ],
      key: {
        zh: "技能 id",
        note: "`ability@1` 的文件 id，逐字比對。⛔ 不是英雄 id、⛔ 不是技能中文名 —— 填錯的那一列不會有任何錯誤訊息，它只是不生效，而 owner 會以為自己已經放行了那一支。",
        maxLen: 64,
      },
      minRows: 0,
      maxRows: 200,
    },
  ],
};
