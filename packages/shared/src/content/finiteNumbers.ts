/**
 * ⭐⭐ **內容裡的每一個數字都必須是有限的。**
 *
 * ── ⛔ 為什麼這是一個獨立的機制，⛔ 而不是 245 次 `.max()` ──────────────────
 *
 * 2026-08-30 對抗式稽核量到：`packages/shared/src/content/schema/**` 共有
 * **861 個 `z.number()`**，其中 **245 個（28%）沒有 `.max()`**。
 *
 * ⚠️ ⭐ 而 Zod 的其他界**一個都擋不住 `Infinity`**（實測）：
 *
 * | 值 | `z.number()` | `.positive()` | `.min(0)` |
 * |---|---|---|---|
 * | `Infinity` | ✅ 過 | ✅ **過** | ✅ **過** |
 * | `-Infinity` | ✅ 過 | ❌ | ❌ |
 * | `NaN` | ❌ | ❌ | ❌ |
 *
 * ⇒ ⭐ **只有 `.max()` 擋得住 `Infinity`** —— 而 245 格沒有它。
 *
 * ⚠️ ⭐ 而 JSON 送得進來：`JSON.parse("1e400")` **就是 `Infinity`**
 * （⛔ 不需要任何特殊語法，一個很大的數字字面值就夠了）。
 *
 * ── ⭐ 為什麼修在**門口**而不是逐格加界 ──────────────────────────────────
 *
 * · 逐格加 245 個 `.max()` ＝ ⭐ **245 個要挑的數字**，而每一個都得引用得到出處
 *   （第一守則）—— ⛔ 挑不出來的那些會變成「我編的預設值」。
 * · ⭐ 而「這個數字要多大」與「它不可以是無限大」是**兩個不同的問題**：
 *   前者是**平衡**（owner 的），後者是**正確性**（永遠成立）。
 * · ⇒ ⭐ 這裡只回答後者。上界仍然該逐格加，⛔ 但那是內容工作，不是安全工作。
 *
 * ── ⚠️ 它擋得住什麼、擋不住什麼（誠實）─────────────────────────────────
 *
 * ✅ 擋得住：`Infinity` / `-Infinity` / `NaN` 進入任何一份內容文件
 * ⛔ 擋不住：一個**有限但荒謬**的值（`1e300`）—— 那要靠逐格的 `.max()`
 * ⇒ ⭐ 兩者是互補的，⛔ 不是替代。
 */

/** 一個非有限數字的位置（⭐ 路徑要指得出來，⛔ 不是「某處有問題」）。 */
export interface NonFiniteHit {
  /** JSON 路徑，例：`effects.0.amount.flat` */
  readonly path: string;
  /** 它是什麼（`Infinity` / `-Infinity` / `NaN`） */
  readonly value: string;
}

/**
 * ⭐ 遞迴掃一份文件裡的每一個數字。
 *
 * ⚠️ ⭐ 有**深度上界**（`MAX_DEPTH`）—— ⛔ 否則這個檢查自己會被一份深度巢狀的
 * 文件弄爆（⭐ 那正是 2026-08-30 修掉的 `RangeError` 逃出隔離那個缺陷的形狀，
 * ⛔ 不可以在修它的路上再造一個）。
 */
const MAX_DEPTH = 64;

export function findNonFiniteNumbers(doc: unknown): NonFiniteHit[] {
  const hits: NonFiniteHit[] = [];
  const walk = (n: unknown, path: string, depth: number): void => {
    if (depth > MAX_DEPTH || hits.length >= 32) return; // ⭐ 32 筆夠指出問題了
    if (typeof n === "number") {
      if (!Number.isFinite(n)) {
        hits.push({ path: path === "" ? "(root)" : path, value: Number.isNaN(n) ? "NaN" : String(n) });
      }
      return;
    }
    if (Array.isArray(n)) {
      n.forEach((v, i) => walk(v, `${path}${path === "" ? "" : "."}${i}`, depth + 1));
      return;
    }
    if (n !== null && typeof n === "object") {
      for (const [k, v] of Object.entries(n as Record<string, unknown>)) {
        walk(v, `${path}${path === "" ? "" : "."}${k}`, depth + 1);
      }
    }
  };
  walk(doc, "", 0);
  return hits;
}

/** ⭐ 給隔離／錯誤訊息用的一句話（⛔ 不要在呼叫端各自組一次）。 */
export function nonFiniteDetail(hits: readonly NonFiniteHit[]): string {
  const list = hits.slice(0, 5).map((h) => `${h.path}=${h.value}`).join(" · ");
  const more = hits.length > 5 ? `（另有 ${hits.length - 5} 處）` : "";
  return (
    `文件裡有**非有限的數字**：${list}${more}。` +
    "⭐ Zod 的 `.positive()` / `.min()` 都擋不住 `Infinity` —— 只有 `.max()` 擋得住，" +
    "而出貨 schema 有 245/861 格沒有它。" +
    "⚠️ JSON 送得進來：`1e400` 解析出來就是 `Infinity`。"
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ⭐ 深度 —— ⛔ 與上面同一道門，⛔ 不是包在 schema 上
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * ⛔⛔ **⛔ 不要把深度檢查包成 `zEffectDef` 的 `superRefine`。**
 *
 * ⭐ 2026-08-31 我這樣做過，而它**當場弄壞了編輯器**：
 * 包成 `z.any().superRefine(...)` 之後，schema 的**可內省型別**
 * 從 `discriminatedUnion` 變成 `unknown`
 * ⇒ ⭐⭐ `apps/editor` 的 `walkZod()` **看不見那 46 種 effect kind**
 * ⇒ 表單產生器產不出任何一格。
 *
 * ⚠️ ⭐ 而那正好打在 owner 最在意的那一點上：
 * 「後台編輯器的**抽象化、完整性、視覺化可操作性**很重要」——
 * ⛔ 一個為了安全而做的改動，把「no code 介面」的地基抽掉了。
 *
 * ⇒ ⭐ 判準：**保護內容的檢查放在門口，⛔ 不放在 schema 裡** ——
 * schema 是**兩個消費端**共用的（引擎驗證 ＋ 編輯器內省），
 * ⛔ 而包一層 refine 只有前者看得見。
 *
 * ── ⭐ 它擋的是什麼（量到的）──────────────────────────────────────────
 * `zEffectDef` 是 `z.lazy` 遞迴（`delayed.effects` / `randomArea.effects` /
 * `spawnProjectile.onHit` / `dash.onEnd` / `damageArea.onHitTargets` 都會回到
 * `EffectDef[]`）。深度 **600** 會讓 `safeParse` 擲 `RangeError`，
 * ⚠️ ⭐ 而 `RangeError` **不是 `ZodError`** ⇒ 它逃得出隔離 ⇒ 全站退回 2 隻骨架。
 *
 * ⭐ 出貨內容今天最深 **4 層**（`godie-n01c.r`）⇒ 上界 12 有 **3 倍餘裕**。
 */
export const MAX_DOC_NESTING_DEPTH = 12;

/** 文件巢狀多深（⭐ 只數帶 `kind` 的節點 —— 那是效果樹的骨架）。 */
export function maxEffectDepth(doc: unknown): number {
  let deepest = 0;
  const walk = (n: unknown, d: number): void => {
    if (d > 200) {
      deepest = Math.max(deepest, d); // ⭐ 夠深就停,⛔ 不必數到爆
      return;
    }
    if (Array.isArray(n)) {
      for (const v of n) walk(v, d);
      return;
    }
    if (n === null || typeof n !== "object") return;
    const rec = n as Record<string, unknown>;
    const next = typeof rec["kind"] === "string" ? d + 1 : d;
    deepest = Math.max(deepest, next);
    for (const v of Object.values(rec)) walk(v, next);
  };
  walk(doc, 0);
  return deepest;
}

/** ⭐ 門口的**一道**檢查：非有限數字 ＋ 巢狀過深。 */
export function findDocProblems(doc: unknown): { path: string; message: string }[] {
  const out: { path: string; message: string }[] = [];
  for (const h of findNonFiniteNumbers(doc)) {
    out.push({ path: h.path, message: `非有限的數字（${h.value}）` });
  }
  const depth = maxEffectDepth(doc);
  if (depth > MAX_DOC_NESTING_DEPTH) {
    out.push({
      path: "(root)",
      message:
        `效果巢狀太深（${depth} 層，上限 ${MAX_DOC_NESTING_DEPTH}）。` +
        "⭐ 出貨內容最深是 4 層 —— ⛔ 這一份多半是產生器跑掉了，或是一份惡意文件。" +
        "⚠️ 沒有這個上界時，深度 600 會讓解析器堆疊爆掉，而那個錯誤**逃得出隔離**" +
        "（整份內容載入失敗 ⇒ 每個玩家退回 2 隻骨架）。",
    });
  }
  return out;
}
