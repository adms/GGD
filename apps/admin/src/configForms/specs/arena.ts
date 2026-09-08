/**
 * 設定文件的**標籤資料**（地圖規格・鏡頭・減傷）—— GH#626 從 5,783 行的 `configForms.ts` 按職責拆出來。
 *
 * ⚠️ 這裡只有**語意**（中文名稱、「它影響什麼」、上下界）。結構仍然從 Zod 走出來
 * （`../engine`），⛔ 這裡一個欄位型別都不重打 —— 見門面 `../../configForms.ts` 的檔頭。
 * ⛔ 新增一份設定要**同時**把它的 spec 掛進門面的 `CONFIG_DOC_SPECS`：忘了掛
 * ⇒ `configDocCoverage.test.ts` 紅並指名那份 `content/config/*.json`（閘從出貨的東西推導）。
 */
import { zConfigMitigationDoc } from "@ggd/shared/content/schema/mitigationDoc";
import { zConfigMapSpecDoc } from "@ggd/shared/content/schema/mapSpecDoc";
import { zConfigCameraDoc } from "@ggd/shared/content/schema/config";
import type { ConfigDocSpec } from "../engine";
import { derivedFields } from "../schemaToForm";
/**
 * ⭐ GH#322 —— 2026-08-13 的平衡批新開了三份 config，但**沒有任何後台入口**。
 *
 * `configDocCoverage.test.ts` 抓到的正是這個：「這幾份 config 沒有任何後台入口，
 * 也沒有在豁免表上：要嘛做一頁，要嘛寫下為什麼不做」。
 * ⛔ 選「做一頁」而不是豁免 —— 這三份**全部是 owner 會調的平衡旋鈕**
 * （減傷天花板 / 位移級距 / 每級加成），豁免它們就是第一守則的三個住處缺第三個。
 */
export const MAP_SPEC_SPEC: ConfigDocSpec<"mapSpec"> = {
  page: "mapSpec",
  collection: "config",
  docId: "map-spec",
  schemaTag: "config.map-spec@1",
  zod: zConfigMapSpecDoc,
  title: "小地圖規格",
  intro: [
    "**所有動漫場地共用的一套規格**（GH#324，owner 2026-08-14）。⛔ 不要讓每張圖各自發明玩法 —— 七張圖只是套四個 layout template 之一。",
    "⭐ owner 的黃金鐵則：**「一張圖如果很壯觀但記不住，就簡化它；拿掉一個房間不影響玩法，就拿掉；垂直感能做成背景，就做成背景。玩家該跟玩家打，不是跟地圖打。」**",
    "⚠️ 這一頁調的是**產生器的驗收標準**，⛔ 不是任何一張已經產生出來的地圖 —— 改完要重跑 `pnpm --dir tools/anime-arena-map map:gen` 才會影響輸出（root 打 `pnpm map:gen` 會 ERR_PNPM_NO_SCRIPT）。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/map-spec.json`**。",
  ],
  consumer: "packages/shared/src/map/spec.ts（界與硬檢查清單；產生器與驗證器都從它 import）",
  effect: "**改完要重跑 `pnpm --dir tools/anime-arena-map map:gen`**。⛔ 它不會回頭改已經產生的場地 —— 那些要重新產生。",
  fields: derivedFields(zConfigMapSpecDoc, []),
  preserved: [],
};

// ── 戰鬥鏡頭（config/camera）—— GH#332 ─────────────────────────────────────
export const CAMERA_SPEC: ConfigDocSpec<"camera"> = {
  page: "camera",
  collection: "config",
  docId: "camera",
  schemaTag: "config.camera@1",
  zod: zConfigCameraDoc,
  title: "戰鬥鏡頭",
  intro: [
    "⭐ owner 2026-08-18（GH#361）：「**預設視角是偏低離地板太近**（預設應該是**離地板最高**，可縮放離地板更近），但**可以縮放最高的視角太高了，至少要砍低一半高度**」",
    "⇒ 兩件事：① 「開局預設鏡頭」變成**自己的一格**（以前它等於「最近視野」），出貨值＝「最遠視野」，也就是**一進場就離地板最高**；② 「最遠視野」36 → **18**，眼高從 33.4 砍到 16.7 單位（正好一半，那是 owner 要的**下限** —— 還嫌高就把這一格再往下調）。",
    "⚠️ **這是推翻 #31a 的設計改版，不是修 bug。** #31a 當時要「預設＝最近」，記下來的理由只有一句「**讓角色在畫面上盡可能大**」—— owner 2026-08-18 判定那個取捨換來的「離地板太近」更難忍受。**一鍵 rollback**：把「開局預設鏡頭」填成跟「最近視野」一樣的數字，就完全回到舊行為。",
    "⭐ 前一輪 owner 2026-08-15：「最大視野減少兩節(滑鼠滾輪)」。**「一節」不是一個單位，是一個換算**：瀏覽器滾一格的 `deltaY` 是 100–120，乘上「一單位滾輪推多少」（出貨 0.02）≈ 一節 2.0–2.4。",
    "⚠️ 在這一頁出現之前這些數字**全部寫死在 client 的 CameraRig.ts**，而它們已經被改過四次 —— 每一次都是一輪 client rebuild + 一次完整部署。現在存檔就生效（客戶端重新載入 bundle 之後）。",
    "⛔ **這一頁不管俯角。** 68° 是從遮擋安全推出來的幾何線（道具高度上限 2.4 單位是照那個角度算的），⛔ 不是一格可以隨手拉的滑桿。",
  ],
  consumer: "apps/client/src/render/CameraRig.ts 的 cameraLimits()（開局預設鏡頭、滾輪與陣亡觀戰的夾限）",
  effect: "客戶端重新載入 bundle 之後生效；⛔ 不需要重啟 game-server（鏡頭純粹是客戶端的事）。",
  fields: derivedFields(zConfigCameraDoc, []),
  preserved: [],
};

export const MITIGATION_SPEC: ConfigDocSpec<"mitigation"> = {
  page: "mitigation",
  collection: "config",
  docId: "mitigation",
  schemaTag: "config.mitigation@1",
  zod: zConfigMitigationDoc,
  title: "減傷規則",
  intro: [
    "LoL 式減傷四段的最後一格：**負抗性的放大上限**。護甲/魔抗被穿到負值時，傷害會被放大，這一格是那個放大倍率的天花板。",
    "⚠️ 沒有天花板的話，一件穿透道具疊到極端就會讓一發普攻打出天文數字 —— 這一格是保險絲，不是手感旋鈕。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/mitigation.json`**。",
  ],
  consumer: "packages/shared/src/sim/combat/penetration.ts 與 mitigate()（全專案唯一算減傷的地方）",
  effect: "**要重啟 game-server shard 才生效**。和 冷卻規則／吟唱規則 同一個形態(#278)。",
  fields: derivedFields(zConfigMitigationDoc, []),
  preserved: [],
};

