/**
 * `groundStyle` —— 地面材質名的**單一真相**（GH#342）。
 *
 * ⭐ 這一格的名字同時活在**四個**地方，而在這個檔存在之前它們各抄了一份：
 *
 * ```
 *   packages/shared/src/content/schema/arena.ts   arena@1 收得下哪些值
 *   packages/shared/src/content/schema/map.ts     作者在 map@1 宣告哪些值
 *   apps/client/scripts/texgen/styles.ts          哪些值真的有 painter（PNG 從這產）
 *   apps/client/src/render/groundMaterials.ts     哪些值真的載得到貼圖
 * ```
 *
 * ⛔ 四份各自維護 = 四個會漂移的住處，而漂移的**每一種形狀都是靜默的**：
 * schema 收下一個沒有 painter 的值 ⇒ 地板退回純色（看起來只是「顏色怪怪的」）；
 * painter 產了一個 schema 不收的值 ⇒ 幾百 KB 的 PNG 沒有人載。
 * 兩種都不會有任何東西變紅。所以名字集合**只准住在這裡**，其餘四處 import。
 *
 * ⚠️ **新增一個 id 是有代價的**，加之前先確認這幾件事都做了
 * （⑤ 由型別強制，其餘四件只有這份清單在守）：
 *   ① `texgen/styles.ts` 有對應的 painter（否則就是「上線就是死的內容」）
 *   ② 跑過 `pnpm tsx apps/client/scripts/gen-ground.ts` 並把 PNG 一起 commit
 *   ③ `apps/client/src/render/ArenaGround.ts` 的 `GROUND_BASE` 有它的底色
 *      （那是貼圖載完之前的那一格畫面，缺了會靜默退成石頭灰）
 *   ④ 真的有一張場地在用它 —— `fieldAdoption.test.ts` 會把零採用的 enum 成員叫出來
 *   ⑤ `GROUND_STYLE_WALL_TINT` 補上這一列（GH#345；⭐ 這一件 TypeScript 會逼你做）
 *
 * ⛔ **順序是 append-only 的慣例**：既有的五個排在前面、新的往後加。
 * 這不是型別上的要求，是為了讓 `arena.ts` 的 diff 讀得出「只多了什麼」。
 */

/**
 * 引擎畫得出來的地面材質。⚠️ 前五個是 GH#324 之前就在的，⛔ 不要重排。
 */
export const GROUND_STYLE_IDS = [
  "stone",
  "dirt",
  "wood",
  "grass",
  "sand",
  "tatami",
  "obsidian",
] as const;

export type GroundStyleId = (typeof GROUND_STYLE_IDS)[number];

/**
 * 給人看的名字 —— 後台欄位提示與地圖編輯器的下拉選單用同一份。
 * ⚠️ 寫「它看起來像什麼」，⛔ 不是複述 id。
 */
export const GROUND_STYLE_LABELS: Record<GroundStyleId, string> = {
  stone: "地牢石板（冷灰花崗岩 · 深色灰泥縫）",
  dirt: "夯土（碎石與乾裂）",
  wood: "磨光檜木長廊（長木板 · 木紋 · 板縫）",
  grass: "踩踏過的草皮（露土的磨損處）",
  sand: "耙過的競技場砂",
  tatami: "榻榻米（藺草席面 · 市松鋪法 · 深色布縁）",
  obsidian: "拋光黑曜石大板（金色礦脈）",
};

/**
 * 沒有宣告時用哪一個。
 * ⚠️ 這是**既有行為**：`arena@1` 的 `groundStyle` 本來就 `.default("stone")`，
 * `compileMap()` 也一直寫死 `"stone"`。⛔ 不要為了「新的比較好看」改掉它 ——
 * 那會偷改每一張沒宣告的場地。
 */
export const DEFAULT_GROUND_STYLE: GroundStyleId = "stone";

/** 這個字串是不是引擎認得的材質名。⛔ 不要在別處重寫這個判斷。 */
export function isGroundStyleId(x: string | undefined): x is GroundStyleId {
  return x !== undefined && (GROUND_STYLE_IDS as readonly string[]).includes(x);
}

/**
 * ⭐ GH#345 —— 每一種地面材質**配套的牆色**（sRGB `#rrggbb`）。
 *
 * owner 2026-08-18 的抱怨是：GH#342 把七張動漫場地的地板換成榻榻米／檜木／
 * 黑曜石／夯土／草皮，**牆卻還是同一格水泥灰**（`ArenaScene` 寫死的
 * `Color3(0.42, 0.4, 0.45)`）。榻榻米房間配一圈水泥灰矮台是**新的**不協調。
 *
 * ⭐ 為什麼是**一張表**而不是七段 `if`（第零守則⑨）：七張圖不是七件事，是同一件事
 * 的七組參數。加第八種地面材質時，`Record<GroundStyleId, …>` 會在**編譯期**要求
 * 補這一列 —— ⛔ 不需要任何人記得，也⛔ 不會有「忘了補 → 靜默退回水泥灰」。
 * ⇒ 上面那份「新增一個 id 的四件事」現在是**五件**：這一列也要填。
 *
 * ⚠️ 這是**沒宣告時的預設**，⛔ 不是最終權威：場地自己的 `scenery.palette.wall`
 * （GH#362，編輯器欄位）永遠贏 —— 第〇·六守則的階梯，作者的設計 > 引擎的推導。
 *
 * ⚠️ `stone` 這一列**刻意逐格等於出貨前那個灰**（0.42 / 0.40 / 0.45 → `#6b6673`），
 * 所以石板場地在這次改動裡一個像素都不會動；⛔ 不要「順手調得好看一點」。
 */
export const GROUND_STYLE_WALL_TINT: Record<GroundStyleId, string> = {
  /** 出貨前的水泥灰本人（0.42 / 0.40 / 0.45）—— 地牢石板配冷灰牆本來就對。 */
  stone: "#6b6673",
  /** 夯土場地：牆是同一批土夯起來的，比地板乾、比地板亮一階。 */
  dirt: "#7a6248",
  /** 檜木長廊：牆是同一批木料的橫樑與腰板。 */
  wood: "#7a5c3c",
  /** 草皮競技場：圍邊是長了苔的砌石，⛔ 不是綠色（綠牆會和地板糊在一起）。 */
  grass: "#6e7a57",
  /** 競技場砂：矮台是曬白的砂岩。 */
  sand: "#b29a6a",
  /** 榻榻米：矮台走土壁與布縁的暖褐。 */
  tatami: "#8c7a55",
  /** 黑曜石：牆是同一塊石的暗紫黑，靠亮度差而不是色相差跟地板分開。 */
  obsidian: "#3e3a4e",
};

/**
 * 這張場地的地面材質配哪一個牆色。認不得的字串 → 預設材質那一列
 * （與 `groundTextureSet()` 同一條退路，⛔ 不要在呼叫端各寫一次判斷）。
 */
export function groundStyleWallTint(groundStyle: string | undefined): string {
  return GROUND_STYLE_WALL_TINT[isGroundStyleId(groundStyle) ? groundStyle : DEFAULT_GROUND_STYLE];
}
