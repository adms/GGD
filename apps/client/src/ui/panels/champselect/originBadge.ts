/**
 * 出身 × 路線 —— 選角畫面身分標題那一區的**唯讀**視圖模型。
 *
 * owner 2026-08-13：
 *
 * > 「我**沒有要你作新機制**，我只是要作為**調整英雄初始與成長屬性的定位參考**，
 * >  並且可以更新在**英雄選角說明**作為參考」
 *
 * 所以這一支**沒有任何機制**：它把兩個既有的東西接起來，一格新的判定都不寫。
 *   · 出身怎麼判 → `statNormalization.originOf()`（三圍 lv10 權重 × 攻擊型別）
 *   · 出身叫什麼、一句話是什麼、有哪幾條路線 → `config.origin-routes@1` 的內容
 *
 * ---------------------------------------------------------------------------
 * ⭐ 它與「系統推斷」玩法標籤（`playstyle.ts`）的關係：**兩條不同的軸**
 * ---------------------------------------------------------------------------
 * 兩者都是推導出來的一行字，所以很容易被做成互相打架的兩個標籤。它們不打架，
 * 因為**輸入不同、回答的問題不同、住的地方也不同**：
 *
 * |            | 出身（這一支）              | 玩法標籤（`playstyle.ts`）        |
 * |---         |---                          |---                                |
 * | 讀什麼     | `attributes` 三圍 + 攻擊型別 | **技能組**的 effect kinds / radius |
 * | 回答什麼   | 這位的**屬性骨架**是什麼     | 這位**怎麼打**                     |
 * | 住哪裡     | 身分標題（跟稱號/全名同一區）| 玩法 tab 的「系統推斷」區          |
 * | 會不會變   | 改技能**不會**變             | 改技能就會變                       |
 *
 * ⛔ 所以出身**不印** 突進／範圍／爆發 那些 token，玩法標籤**不印**出身。
 * 唯一重疊的是 近戰／遠程 —— 那本來就已經同時在兩邊（標題的 `attackTypeLabel`
 * 與玩法標籤的第一個 token），這一支沒有讓它變多。
 *
 * ⚠️ 出身放在身分標題是因為它是**身分**（不隨技能改動而變），而玩法標籤是
 * 對技能組的觀察 —— 把出身放進「系統推斷」區會讓兩者看起來是同一種東西的兩行。
 *
 * ⛔ **路線今天沒有引擎機制，也不是玩家選的。** 那 32 個路線名是提案
 * （`content/config/origin-routes.json` 的 `note` 自己寫著 owner 還沒定稿），
 * 所以畫面上**必須**帶著 {@link ORIGIN_CAPTION} —— 少了它，「路線 鐵壁 · 反噬」
 * 在選角畫面上看起來就是一個可以點的分支。
 */
import { Configs } from "@ggd/shared/content";
import { originOf, type Origin } from "@ggd/shared/content/statNormalization";
import {
  ORIGIN_ROUTES_DOC_ID,
  originRoutesFromDoc,
  type OriginRoutes,
} from "@ggd/shared/content/originRoutes";

/** 出身那幾行的強調色。⛔ 刻意不用「系統推斷」的橘（#e0a878）—— 兩者不是同一種東西。 */
export const ORIGIN_ACCENT = "#8fb8e0";

/** 路線不是機制、也不是玩家選的。⛔ 拿掉這一行，路線清單就會被讀成可選分支。 */
export const ORIGIN_CAPTION = "由三圍與攻擊方式推導 · 僅為數值定位參考，路線尚未實裝";

/** `originOf` 需要的最小形狀 —— 讓守衛可以餵普通物件，不用造一整張英雄卡。 */
export type OriginBadgeInput = Parameters<typeof originOf>[0];

export interface OriginBadge {
  /** 出身名（坦克 / 砲手 / …）。⚠️ 推導來的，⛔ 英雄卡上沒有這一欄。 */
  origin: Origin;
  /** 判定規則的中文說明（「力量主 · 近戰」）。標題上只當 tooltip，不佔一行。 */
  rule: string;
  /** 一句話：這個出身是什麼樣的英雄。 */
  tagline: string;
  /** 該出身的路線名，2~4 條（上下界在 `originRoutes.ts`，⛔ 不在這裡）。 */
  routeNames: readonly string[];
  /** 上面那幾條接成一行（「鐵壁 · 反噬 · 血怒 · 嘲哮」）。 */
  routesLine: string;
}

const ATTR_FIELDS = ["str", "agi", "int", "strGrowth", "agiGrowth", "intGrowth"] as const;

/**
 * 這張英雄卡有沒有三圍。
 *
 * ⚠️ 這不是防禦性程式碼，是一個**真的會說謊的洞**：`originOf` 對一張三圍全 0 的
 * 卡不會丟例外，它會安靜地回「坦克」（排序平手 → str 第一 → 近戰 → 坦克）。
 * 出貨的 78 位都有三圍，所以那個謊今天看不見 —— 但下一位還沒填三圍的新英雄
 * 會在選角畫面被貼上一個**憑空捏造**的出身，而且畫面上完全正常。
 */
function hasAttributes(def: OriginBadgeInput): boolean {
  const a = def.attributes;
  if (!a) return false;
  return ATTR_FIELDS.some((k) => typeof a[k] === "number" && (a[k] as number) > 0);
}

/**
 * 純函式：三圍 + 文案 → 那三行字。三圍缺席 → `null`（呼叫端整區不畫）。
 *
 * ⚠️ `originOf` 的 `mixedRatio`（混血門檻 1.2）今天還是寫死的常數，
 * `statNormalization.ts` 自己記著「⛔ 它應該變成後台欄位（`config.stat-normalization@1`）
 * ——**還沒做**」。等它變成欄位的那一天，這裡要把它一起傳進去，
 * ⛔ 否則選角畫面說「法刺」而那張十格屬性表用的是「鬥士」，兩邊會無聲地分家。
 */
export function originBadgeFrom(def: OriginBadgeInput, routes: OriginRoutes): OriginBadge | null {
  if (!hasAttributes(def)) return null;
  const origin = originOf(def);
  const info = routes[origin];
  const routeNames = info.routes.map((r) => r.name);
  return {
    origin,
    rule: info.rule,
    tagline: info.tagline,
    routeNames,
    routesLine: routeNames.join(" · "),
  };
}

/**
 * 現行文案 —— 從**內容**讀，⛔ 不是從 `DEFAULT_ORIGIN_ROUTES` 讀。
 *
 * 這一行就是整支的承重點：出身名／一句話／32 個路線名全部是 owner 會改的文案，
 * 而它們改一次不應該要一次部署（第一守則）。`originRoutesFromDoc` 本身是**逐格**
 * fallback，所以只改了一格的覆蓋層不會把其餘 31 條清成空白。
 */
export function contentOriginRoutes(): OriginRoutes {
  return originRoutesFromDoc(Configs.tryGet(ORIGIN_ROUTES_DOC_ID));
}

/** 選角面板用的入口：一張英雄卡 → 那三行字（或 `null`）。 */
export function originBadgeForChampion(def: OriginBadgeInput): OriginBadge | null {
  return originBadgeFrom(def, contentOriginRoutes());
}
