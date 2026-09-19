/**
 * valhallaHoverPop —— 英靈殿 3D 舞台的 **hover 放大**（GH#1264）。
 *
 * > owner 2026-09-15（逐字）：「英靈殿 hover 過去 3d model 會 pop out 放大」
 *
 * ⚠️ 除了上面那一句引言之外，這個檔案裡的每一句都是我（Claude）推的或量的，
 * ⛔ 不是 owner 的話（CLAUDE.md「我的推測會變成他的需求」）。
 *
 * ---------------------------------------------------------------------------
 * ⛔⛔ 為什麼放大**不可以**是 `transform: scale()`
 * ---------------------------------------------------------------------------
 * 舞台上那塊 `<canvas>` 的**繪圖緩衝**大小是由它的**排版尺寸**決定的：
 * `render/StorePreview.ts:196` 掛了 `new ResizeObserver(() => this.engine.resize())`
 * 在畫布本人身上。CSS transform ⛔ **不改變排版尺寸** ⇒ ResizeObserver 不會響
 * ⇒ `engine.resize()` 不會被呼叫 ⇒ 放大的是一張**低解析度點陣圖**，畫面會糊。
 *
 * ⇒ ⭐ 這裡算的是**容器真正的 width/height（px）**，⛔ 不是一個縮放係數。
 * 「畫面上變大」與「繪圖緩衝變大」是**兩個名詞**，只驗前者會把一個糊掉的放大當成做完。
 *
 * ---------------------------------------------------------------------------
 * ⭐ 一條幾何規則就同時解掉三件事：**底邊釘在原位，只往上與左右長**
 * ---------------------------------------------------------------------------
 * | 要解的 | 這條規則怎麼解 |
 * |---|---|
 * | ⛔ 不可以蓋住「⚔️ 一鍵開打」 | 英靈殿在大廳**單人 vs BOT 之上**（owner 2026-07-25 的原話），按鈕永遠在舞台**下方** ⇒ 放大後的框**底邊不超過舞台底邊** ⇒ 結構上蓋不到它。⛔ 不必去 DOM 裡找那顆按鈕（它沒有 data 屬性，而 `LobbyScreen.tsx` 不在這條 lane 的柵欄內），⭐ 也不會因為別人改了大廳排版而失效 |
 * | ⛔ hover 抖動 | 放大後的框**必須包住原本的框**（下面最後那一段夾擠）。⚠️ 沒有這一條，滑鼠停在原框內、框卻縮到別的地方 ⇒ 立刻 leave ⇒ 收回 ⇒ 又 enter ⇒ **無限閃爍** |
 * | ⛔ 被 `overflow: hidden` 裁掉 | 舞台本人是 `overflow: hidden` 的那一層，放大時它自己變成 `position: fixed` ⇒ 它不再被卡片裁切（消費端把原本的位置留成一個等高的**空位**，所以卡片排版一個像素都不動） |
 *
 * ⚠️ 空間不夠時**回 `null`（不放大）**，⛔ 不是硬擠一個 1.02× 的「放大」——
 * 一個看不出來的放大，與一個壞掉的功能長得一模一樣。
 */
import type { CSSProperties } from "react";

/** 螢幕座標的一個框（`getBoundingClientRect()` 的四格，換成我們自己的名字）。 */
export interface ValhallaRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * hover 放大的**決策點**，一格一個。
 *
 * CLAUDE.md 第一守則：「如果我在寫程式時心裡出現『這裡要選 A 還是 B』，那就是一個決策點」。
 * 這個功能冒出五個那樣的瞬間，五格都在這裡，⛔ 沒有一個寫死在元件裡。
 */
export interface ValhallaHoverRules {
  /**
   * 要不要放大。
   *
   * 預設 **true** —— owner 這一則要的就是這個功能，而 CLAUDE.md 第〇·六守則：
   * 「優先權大的更新後都是預設啟動」。關掉之後行為與 2026-09-15 之前逐格相同。
   */
  readonly enabled: boolean;
  /**
   * 目標倍率（線性，⛔ 不是面積）。
   *
   * ⚠️ owner 沒說。1.8 的理由是**上方可用空間**：大廳在 900px 高的視窗上，舞台
   * 上緣距離視窗頂大約 150px、舞台自己 168px ⇒ 往上長得到 ≈1.9×。
   * 再大就會被上緣夾掉而每一台機器的實際倍率都不一樣（⛔ 那比小一點更糟）。
   * ⭐ 這是**目標**不是保證：空間不夠時實際倍率會被夾小，夾到沒意義就不放大。
   */
  readonly scale: number;
  /**
   * 滑鼠停留幾毫秒才彈出。
   *
   * ⚠️ owner 沒說。180ms 是「**路過** vs **看它**」的界線：滑鼠橫越大廳去按
   * 「⚔️ 一鍵開打」時會掃過舞台，0ms 的話每一次路過都彈一下。
   */
  readonly hoverDelayMs: number;
  /** 彈出／收回的動畫時間。⚠️ owner 沒說；140ms 快到不必等、慢到看得出是同一塊東西在長大。 */
  readonly transitionMs: number;
  /** 放大後距離視窗邊緣至少留幾 px。⚠️ owner 沒說；12 與大廳卡片自己的間距同一個量級。 */
  readonly edgeMargin: number;
}

/** 出貨值。五格都是我挑的 ⇒ ⭐ 每一格都留得住一鍵 rollback（`enabled: false`）。 */
export const DEFAULT_VALHALLA_HOVER: ValhallaHoverRules = Object.freeze({
  enabled: true,
  scale: 1.8,
  hoverDelayMs: 180,
  transitionMs: 140,
  edgeMargin: 12,
});

/**
 * 上下界。**上界不是可選的** —— CLAUDE.md：`validateField` 在 2026-07-29 之前只檢查
 * `min`，所以 1.8 打成 18 會過後台、在下游才被靜默夾掉。
 */
export const VALHALLA_HOVER_BOUNDS = Object.freeze({
  /** 1 = 等於不放大；4 = 已經比任何桌機視窗的可用高度都大，再上去只是被夾 */
  scale: { min: 1, max: 4 },
  /** 0 = 碰到就彈；2000 = 兩秒，超過就等於關掉 */
  hoverDelayMs: { min: 0, max: 2000 },
  /** 0 = 瞬間切換（也是合法的選擇）；1000 = 一秒，再久就像卡住 */
  transitionMs: { min: 0, max: 1000 },
  /** 0 = 貼著視窗邊；120 = 再多就沒有空間放大了 */
  edgeMargin: { min: 0, max: 120 },
} as const);

/** 放大後的舞台疊在大廳之上的層級 —— 比卡片高，比對話框（`RallyConfirmDialog` 用 1000）低。 */
export const VALHALLA_POP_Z_INDEX = 40;

/** 小於這個實際倍率就**不放大** —— 看不出來的放大 ＝ 一個壞掉的功能。 */
export const VALHALLA_POP_MIN_SCALE = 1.05;

/** 夾到界內。**回傳夾過的值**，⛔ 不是靜默吃掉（#279 的教訓）。 */
export function clampHoverRules(raw: ValhallaHoverRules): ValhallaHoverRules {
  const b = VALHALLA_HOVER_BOUNDS;
  const clamp = (v: number, lo: number, hi: number): number =>
    !Number.isFinite(v) ? lo : v < lo ? lo : v > hi ? hi : v;
  return {
    enabled: raw.enabled === true,
    scale: clamp(raw.scale, b.scale.min, b.scale.max),
    hoverDelayMs: clamp(raw.hoverDelayMs, b.hoverDelayMs.min, b.hoverDelayMs.max),
    transitionMs: clamp(raw.transitionMs, b.transitionMs.min, b.transitionMs.max),
    edgeMargin: clamp(raw.edgeMargin, b.edgeMargin.min, b.edgeMargin.max),
  };
}

/**
 * 放大後的框 —— ⭐ 純函式，算的是**真正的 px**。
 *
 * @param slot     舞台今天在螢幕上佔的框（`getBoundingClientRect()`）
 * @param viewport 視窗大小
 * @param rules    上面那五格（呼叫端已經夾過界）
 * @returns 放大後的框；**不該放大**時回 `null`（關掉、框量不到、上方沒空間、倍率沒意義）
 *
 * 保證（`valhallaHoverPop.test.ts` 逐條釘住）：
 *  ① `result.y + result.height === slot.y + slot.height` —— 底邊不動 ⇒ 蓋不到下面的「一鍵開打」
 *  ② `result` **包住** `slot` ⇒ 滑鼠不會因為框跑掉而 leave（⛔ 無限閃爍）
 *  ③ 長寬比與 `slot` 相同 ⇒ 模型不會被拉扁
 *  ④ 除了②要求的以外不超出視窗邊界 `edgeMargin`
 */
export function valhallaPopRect(input: {
  readonly slot: ValhallaRect;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly rules: ValhallaHoverRules;
}): ValhallaRect | null {
  const { slot, viewport, rules } = input;
  if (!rules.enabled) return null;
  // 量不到（jsdom 沒排版、元件還沒掛上、卡片收起來了）⇒ ⛔ 不猜一個尺寸出來
  if (!(slot.width > 0) || !(slot.height > 0)) return null;
  if (!(viewport.width > 0) || !(viewport.height > 0)) return null;

  const margin = rules.edgeMargin;
  // ⭐ 只往上長：可用的空間就是舞台上緣到視窗上緣（扣掉邊界留白）
  const roomAbove = slot.y - margin;
  if (!(roomAbove > 0)) return null;

  const maxWidth = viewport.width - margin * 2;
  if (!(maxWidth > 0)) return null;

  const scale = Math.min(rules.scale, (slot.height + roomAbove) / slot.height, maxWidth / slot.width);
  if (!(scale >= VALHALLA_POP_MIN_SCALE)) return null;

  const width = slot.width * scale;
  const height = slot.height * scale;
  const bottom = slot.y + slot.height;

  // 水平置中 → 夾進視窗 → ⭐ 最後夾成「一定包住原框」。
  // ⚠️ 順序是刻意的：兩者打架時**包住原框贏** —— 差幾 px 的留白沒有人看得出來，
  // 而少包住一條縫就是滑鼠 leave ⇒ 收回 ⇒ 再 enter 的無限閃爍。
  const centred = slot.x + slot.width / 2 - width / 2;
  const inViewport = Math.min(Math.max(centred, margin), viewport.width - margin - width);
  const x = Math.min(Math.max(inViewport, slot.x + slot.width - width), slot.x);

  return { x, y: bottom - height, width, height };
}

/**
 * 舞台那一層的 style —— ⭐ 放大時給的是 **width/height（px）**。
 *
 * ⛔ 這裡**永遠不會有 `transform`**，理由見檔頭。守衛讀的是**畫出來的 DOM**
 * （`ValhallaPanelMount.test.ts`），⛔ 不是這個物件 —— 只驗這個物件的話，
 * 一個在別處補上 `transform: scale()` 的實作照樣全綠（失敗形態⑥）。
 */
export function valhallaPopStageStyle(pop: ValhallaRect | null, rules: ValhallaHoverRules): CSSProperties {
  if (pop === null) return { position: "absolute", inset: 0 };
  const t = `${rules.transitionMs}ms ease`;
  return {
    position: "fixed",
    left: pop.x,
    top: pop.y,
    width: pop.width,
    height: pop.height,
    zIndex: VALHALLA_POP_Z_INDEX,
    boxShadow: "0 18px 48px rgba(0, 0, 0, 0.55)",
    transition: `left ${t}, top ${t}, width ${t}, height ${t}`,
  };
}

/** 一格後台欄位的完整描述 —— key / 型別 / 出貨值 / 上下界 / 標籤 / 它影響什麼。 */
export interface ValhallaHoverAdminField {
  readonly key: keyof ValhallaHoverRules;
  readonly kind: "number" | "boolean";
  readonly shipped: number | boolean;
  readonly min?: number;
  readonly max?: number;
  /** 後台顯示的中文標籤 */
  readonly label: string;
  /** 說明文字 —— 寫「它影響什麼」，⛔ 不是複述欄位名（CLAUDE.md 第一守則） */
  readonly help: string;
}

/**
 * ⛔⛔ **四個住處還沒接完** —— 誠實的現況，⛔ 不是設計。
 *
 * CLAUDE.md 第一守則要求一格後台欄位同時落四個住處：
 *   1. `content/config/valhalla-hover.json`（或併進英靈殿那一份）—— `shipped` 那一欄
 *   2. `packages/shared/src/content/schema/config.ts` —— Zod（`min`/`max` **都要**）＋ `DEFAULT_*`
 *   3. `apps/admin/src/*.ts` —— `SHIPPED_*` ＋ 欄位 union ＋ 順序 ＋ 標籤 ＋ 分組（建議「英靈殿」）＋ `configFromForm`
 *   4. ⭐ **消費端** —— 今天已經接好了：`ValhallaPanel.tsx` 的 `hoverRules`，
 *      舞台在 `ValhallaStage` 讀它（`valhallaPopRect` 的 `rules`）
 *
 * ⛔ 1–3 那三個檔（含 `apps/admin/src/store.ts` 與 `ui/App.tsx` 這兩個**跨 lane 共用檔**）
 * 不在這一條 lane 的柵欄內 ⇒ 這一份是**欄位定義的來源**，整合者照抄即可。
 * 在那之前執行時吃的是 {@link DEFAULT_VALHALLA_HOVER}（＝出貨值本身），
 * 所以**行為正確、只是還不能從後台轉**；要關掉的人傳 `hoverPop={{ enabled: false }}`。
 * ⭐ 與 `valhallaSandboxRules.ts` 的 `VALHALLA_SANDBOX_ADMIN_FIELDS`（GH#254）同一條路，
 * ⛔ 不要另外開第二條。
 */
export const VALHALLA_HOVER_ADMIN_FIELDS: readonly ValhallaHoverAdminField[] = Object.freeze([
  {
    key: "enabled",
    kind: "boolean",
    shipped: DEFAULT_VALHALLA_HOVER.enabled,
    label: "英靈殿滑鼠移入放大",
    help: "開＝滑鼠移到英靈殿的 3D 模型上，模型會跳出來放大，移開回原位。關＝完全不放大（回到 2026-09-15 之前的樣子）。手機與矮視窗（高度 520px 以下）本來就不放大，這一格影響不到。",
  },
  {
    key: "scale",
    kind: "number",
    shipped: DEFAULT_VALHALLA_HOVER.scale,
    min: VALHALLA_HOVER_BOUNDS.scale.min,
    max: VALHALLA_HOVER_BOUNDS.scale.max,
    label: "放大倍率（目標）",
    help: "模型框要放大幾倍。這是目標不是保證：放大只往上長（才不會蓋住「一鍵開打」），所以視窗矮的時候實際倍率會自動變小；小到看不出來就乾脆不放大。",
  },
  {
    key: "hoverDelayMs",
    kind: "number",
    shipped: DEFAULT_VALHALLA_HOVER.hoverDelayMs,
    min: VALHALLA_HOVER_BOUNDS.hoverDelayMs.min,
    max: VALHALLA_HOVER_BOUNDS.hoverDelayMs.max,
    label: "移入後幾毫秒才彈出",
    help: "滑鼠要在模型上停多久才放大。調成 0＝滑鼠只是經過也會彈一下；調大＝要停久一點才彈，比較不會干擾去按「一鍵開打」的人。",
  },
  {
    key: "transitionMs",
    kind: "number",
    shipped: DEFAULT_VALHALLA_HOVER.transitionMs,
    min: VALHALLA_HOVER_BOUNDS.transitionMs.min,
    max: VALHALLA_HOVER_BOUNDS.transitionMs.max,
    label: "放大動畫時間（毫秒）",
    help: "框從原本大小長到放大後大小要花多久。0＝瞬間切換；太長會讓人以為畫面卡住。",
  },
  {
    key: "edgeMargin",
    kind: "number",
    shipped: DEFAULT_VALHALLA_HOVER.edgeMargin,
    min: VALHALLA_HOVER_BOUNDS.edgeMargin.min,
    max: VALHALLA_HOVER_BOUNDS.edgeMargin.max,
    label: "距離視窗邊緣留白（px）",
    help: "放大後的框至少離視窗邊緣幾個像素。調大＝放大上限跟著變小（因為往上長的空間變少）。",
  },
]);
