/**
 * ID → 出貨名稱 (#786) —— 傷害排行榜這類營運頁的名稱 join。
 *
 * owner 2026-08-27（逐字）：
 * > 「我說過 給人看的話不能只有ID 還要有名稱，請你把後台傷害排行榜內ID都補上名稱」
 *
 * ⭐ 名稱只有一個住處：出貨 bundle（`/content/bundle.json`，prod 由 nginx、
 * dev 由 vite middleware 同源提供）。這裡在**載入時 join**，⛔ 不把名稱抄進
 * 排行榜資料 —— 名稱改了，這一頁下一次載入就跟著改（第〇·四守則）。
 *
 * ⚠️ 查不到的 id 回 `name: null`，呼叫端誠實印裸 id＋⚠，⛔ 不編一個名字出來
 * （退休英雄／#786 之前寫進榜的舊資料本來就會查不到）。「索引還沒載到」與
 * 「查過了沒有」是兩個狀態：前者頁面印裸 id 不加 ⚠（什麼都還沒宣稱）。
 */

/** 這三個集合的 doc 都有 `id` + `name` 兩格（champions/abilities/items）。 */
export type NameKind = "champions" | "abilities" | "items";

const KINDS: readonly NameKind[] = ["champions", "abilities", "items"];

export interface NameIndex {
  /** bundle 頂層的 `contentVersion` —— 快取的鍵（見 {@link fetchNameIndex}）。 */
  contentVersion: string;
  names: Readonly<Record<NameKind, ReadonlyMap<string, string>>>;
}

/**
 * 寬鬆解析 bundle → 名稱索引。壞形狀／缺集合回空 Map，⛔ 不 throw ——
 * 一頁唯讀報表不該因為 bundle 半殘就整頁爆紅（列會退回裸 id＋⚠，那才是誠實的降級）。
 *
 * ⚠️ 只收 `name !== id` 的名字：placeholder 卡的 `name` 逐字等於 id，把它當名字
 * 印出去就是「這位英雄就叫 godie-h020」—— 正是 owner 在抱怨的東西（同 championLabels）。
 */
export function buildNameIndex(v: unknown): NameIndex {
  const out: Record<NameKind, Map<string, string>> = {
    champions: new Map(),
    abilities: new Map(),
    items: new Map(),
  };
  let contentVersion = "";
  if (typeof v === "object" && v !== null) {
    const b = v as Record<string, unknown>;
    if (typeof b.contentVersion === "string") contentVersion = b.contentVersion;
    const cols =
      typeof b.collections === "object" && b.collections !== null
        ? (b.collections as Record<string, unknown>)
        : {};
    for (const kind of KINDS) {
      const col = cols[kind];
      const entries =
        typeof col === "object" && col !== null && Array.isArray((col as { entries?: unknown }).entries)
          ? ((col as { entries: unknown[] }).entries)
          : [];
      for (const e of entries) {
        const doc = typeof e === "object" && e !== null ? (e as { doc?: unknown }).doc : undefined;
        if (typeof doc !== "object" || doc === null) continue;
        const { id, name } = doc as { id?: unknown; name?: unknown };
        if (typeof id !== "string" || id === "") continue;
        if (typeof name !== "string" || name === "" || name === id) continue;
        out[kind].set(id, name);
      }
    }
  }
  return { contentVersion, names: out };
}

/** 一格「給人看」的標籤。`name === null` ＝ 出貨 bundle 查不到（⚠️ 誠實裸 id）。 */
export interface NameLabel {
  id: string;
  name: string | null;
}

export function nameLabelFor(index: NameIndex, kind: NameKind, id: string): NameLabel {
  return { id, name: index.names[kind].get(id) ?? null };
}

/** 裝備欄一整串 id → 標籤（順序照傳進來的；查不到的留 null，⛔ 不丟列）。 */
export function itemLabels(index: NameIndex, ids: readonly string[]): NameLabel[] {
  return ids.map((id) => nameLabelFor(index, "items", id));
}

// ---------------------------------------------------------------------------
// fetch + 快取。⚠️ 快取跟 contentVersion 走（#786 的 constraint）：bundle 2.5MB，
// 每次 mount 重抓太粗；但一個 module 快取活過 deploy 就是拿舊名字說謊。
// 所以命中快取前先花 1.6KB 探 `/content/manifest.json` 的 contentVersion ——
// 相同才用快取，變了就重抓整份。
// ---------------------------------------------------------------------------

let cached: NameIndex | null = null;

async function getJson(path: string): Promise<unknown> {
  const resp = await fetch(path, { headers: { accept: "application/json" } });
  if (!resp.ok) throw new Error(`${path} HTTP ${resp.status}`);
  return resp.json() as Promise<unknown>;
}

/**
 * 名稱索引（含快取）。讀不到而且手上一份都沒有 → throw，呼叫端把索引留在
 * null（頁面印裸 id、不加 ⚠ —— 沒查過就不宣稱「沒有」）。
 */
export async function fetchNameIndex(): Promise<NameIndex> {
  if (cached !== null) {
    try {
      const mf = (await getJson("/content/manifest.json")) as { contentVersion?: unknown };
      if (mf.contentVersion === cached.contentVersion) return cached;
    } catch {
      return cached; // 探針失敗但手上有索引：舊名字仍比整頁裸 id 誠實（fail-open）
    }
  }
  try {
    cached = buildNameIndex(await getJson("/content/bundle.json"));
    return cached;
  } catch (err) {
    if (cached !== null) return cached;
    throw err;
  }
}
