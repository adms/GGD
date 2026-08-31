/**
 * ⭐⭐ GH#730 批 A —— **讀一份內容文件時把覆蓋層疊在出貨樹上**。
 *
 * ── 為什麼需要它（⭐ 量到的）────────────────────────────────────────────────
 * 9 個內容編輯頁今天走 `contentApi.ts`，而那一支 `const ENABLED = isDevBuild()`
 * ⇒ ⛔ **正式 build 裡每一個入口都短路**（檔內逐字「EVERY export below
 * short-circuits on ENABLED」）。
 * ⭐ 票文的裁決是「走 `putOverlayDoc` 覆蓋層遷移，⛔ **不是拔 DEV 閘**」——
 * 而遷移的第一步是**讀**：覆蓋層只有「被改過的那幾份」，⛔ 讀要疊在出貨樹上。
 *
 * ── ⭐ 形狀抄自 client 那一側（⛔ 不自己發明）──────────────────────────────
 * `apps/client/src/content/clientOverlay.ts` 已經做同一件事：`docs` ＋ `deleted`
 * 兩個 map。⭐ 兩邊用同一個語意，⛔ 否則後台看到的與玩家看到的會不一樣 ——
 * 而那正是這一整條鏈要防的東西。
 *
 * ── ⛔ 這個檔只做**純函式**，⛔ 不碰網路 ──────────────────────────────────
 * 合成是一個**資料**問題。⭐ 抽出來才測得到；取檔留給呼叫端。
 */

/** 覆蓋層的一份鍵：`<collection>/<id>`（與平台端、client 端同一個字面形狀）。 */
export function overlayKey(collection: string, id: string): string {
  return `${collection}/${id}`;
}

export interface OverlayLayer {
  /** `<collection>/<id>` → 整份文件（覆蓋層裡被改過的那些）。 */
  readonly docs: Readonly<Record<string, unknown>>;
  /** `<collection>/<id>` → true（被刪掉的那些）。 */
  readonly deleted: Readonly<Record<string, boolean>>;
}

/** 一份文件在合成之後的樣子，⭐ 以及**它為什麼長這樣**。 */
export interface ComposedDoc {
  readonly doc: unknown | null;
  /**
   * ⭐ `shipped` = 出貨樹的原樣 · `overlay` = 後台改過的 · `deleted` = 後台刪掉的 ·
   * `missing` = 兩層都沒有。
   *
   * ⚠️ ⭐ 這一格是**承重的**：少了它，「後台刪掉了」與「本來就沒有」在 UI 上
   * **長得一模一樣** —— ⛔ 而那正是 fail-open 的靜默版（CLAUDE.md：
   * 「fail-open 沒錯，靜默才是缺陷」）。
   */
  readonly source: "shipped" | "overlay" | "deleted" | "missing";
}

/**
 * ⭐ 疊一層。`shipped` 是出貨樹讀到的（沒有就 `null`）。
 *
 * ⛔ **刪除優先於覆蓋** —— 一份同時出現在 `docs` 與 `deleted` 的文件是刪掉的：
 * 平台端的語意是「先寫後刪」，⭐ 而讀端不可以自己挑一個相反的答案。
 */
export function composeDoc(
  collection: string,
  id: string,
  shipped: unknown | null,
  overlay: OverlayLayer | null,
): ComposedDoc {
  const key = overlayKey(collection, id);
  if (overlay?.deleted[key] === true) return { doc: null, source: "deleted" };
  const over = overlay?.docs[key];
  if (over !== undefined) return { doc: over, source: "overlay" };
  if (shipped !== null && shipped !== undefined) return { doc: shipped, source: "shipped" };
  return { doc: null, source: "missing" };
}

/**
 * ⭐ 一個集合裡**合成之後**有哪些 id（給列表頁）。
 *
 * ⛔ 覆蓋層可以**新增**（出貨樹沒有的 id）也可以**刪除** —— 兩個方向都要算，
 * ⚠️ 只算其中一邊的列表會與編輯頁互相矛盾。
 */
export function composeIds(
  collection: string,
  shippedIds: readonly string[],
  overlay: OverlayLayer | null,
): string[] {
  const out = new Set(shippedIds);
  if (overlay) {
    const prefix = `${collection}/`;
    for (const k of Object.keys(overlay.docs)) {
      if (k.startsWith(prefix)) out.add(k.slice(prefix.length));
    }
    for (const [k, v] of Object.entries(overlay.deleted)) {
      if (v === true && k.startsWith(prefix)) out.delete(k.slice(prefix.length));
    }
  }
  return [...out].sort();
}
