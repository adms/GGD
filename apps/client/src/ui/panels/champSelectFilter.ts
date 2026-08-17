/**
 * Pure, testable logic for the champion-select roster: substring filtering
 * (Chinese/CJK names included — plain substring, no locale casing tricks) and
 * uniform-random pick. No React imports so it unit-tests cleanly.
 *
 * ⚠️ CORRECTED 2026-08-17：這裡本來寫「No React / **registry** imports」。
 * `shopCatalogue` 現在要知道**哪 49 把是寶具**，而那個答案只住在
 * `legendary-weapons` 那張 loot table 裡（⛔ 沒有任何 per-item 標記對得上），
 * 所以 `shopShelf.legendaryShelfIds()` 會讀登錄表 —— 這個模組因此**間接**依賴
 * 它。登錄表是純資料（一個 Map，沒有副作用），登錄表沒填時回空集合，所以
 * 既有的純函式單元測試一條都不用改。
 */
import {
  baseFormIdOf,
  isSplitFormBody,
  isTransformedBody,
} from "@ggd/shared/content/championForms";
import { isShopService, itemHasEffect, legendaryShelfPrice } from "@ggd/shared/sim/economy/itemTiers";
import {
  LEGENDARY_PRICE_MULTIPLIER,
  LEGENDARY_SHELF_OPEN,
  legendaryShelfIds,
  legendaryShelfListable,
  randomOnlyIds,
  shelfListable,
  WEAPON_SHELF_OPEN,
} from "@ggd/shared/sim/economy/shopShelf";

export interface RosterChampion {
  id: string;
  name: string;
  role?: string;
  tags?: readonly string[];
  /** w3x icon path ("assets/icons/…") — absent for stock-art heroes */
  icon?: string;
}

/**
 * Filter `champs` to those whose name (or id/role/tag) contains `query` as a
 * substring, case-insensitively for ASCII. An empty/whitespace query returns
 * the list unchanged. CJK matching is exact-substring (e.g. "亞瑟" ⊂ "亞瑟王").
 */
export function filterChampions<T extends RosterChampion>(champs: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [...champs];
  return champs.filter((c) => {
    if (c.name.toLowerCase().includes(q)) return true;
    if (c.id.toLowerCase().includes(q)) return true;
    if (c.role && c.role.toLowerCase().includes(q)) return true;
    return (c.tags ?? []).some((t) => t.toLowerCase().includes(q));
  });
}

/**
 * Uniform-random pick from `ids`. `rng` defaults to Math.random and must return
 * [0, 1); injectable for deterministic tests. Returns null for an empty list.
 */
export function pickRandomId(ids: readonly string[], rng: () => number = Math.random): string | null {
  if (ids.length === 0) return null;
  const i = Math.floor(rng() * ids.length);
  // guard the rng()===1 edge so we never index out of range
  return ids[Math.min(i, ids.length - 1)] ?? null;
}

// ---------------------------------------------------------------------------
// Content whitelist (curation contract).
//
// The platform serves an operator-curated whitelist at
// GET /api/v1/curation/whitelist ({ champions, items, abilities }). The
// game-server is the authority; the client renders only whitelisted entries so
// a player never sees — or picks — a champion the server would reject.
//
// DEFAULT-EMPTY is the contract: a fresh install enables nothing. But we must
// distinguish "operator enabled nothing" (→ empty-state message) from
// "platform unreachable in offline/dev" (→ no filter, full roster). So an
// unreachable fetch yields `enforced: false` (allow all) while a successful
// fetch — even of an empty doc — yields `enforced: true`.
// ---------------------------------------------------------------------------

/** A whitelist snapshot for one match (id membership sets + the enforce flag). */
export interface Whitelist {
  /** false = not fetched / offline / dev → no filtering (allow everything) */
  enforced: boolean;
  champions: ReadonlySet<string>;
  items: ReadonlySet<string>;
  abilities: ReadonlySet<string>;
}

/** Permissive default: allow everything (used until/unless a doc is fetched). */
export const NO_FILTER: Whitelist = {
  enforced: false,
  champions: new Set(),
  items: new Set(),
  abilities: new Set(),
};

function toStringSet(v: unknown): Set<string> {
  const out = new Set<string>();
  if (Array.isArray(v)) for (const x of v) if (typeof x === "string" && x !== "") out.add(x);
  return out;
}

/**
 * Build an ENFORCED whitelist from a fetched doc. A successfully-read doc is
 * always enforced, even when empty (that is the fresh-install empty-state);
 * only an unreachable platform maps to {@link NO_FILTER} (see useWhitelist).
 */
export function whitelistFromDoc(raw: unknown): Whitelist {
  if (raw === null || typeof raw !== "object") return NO_FILTER;
  const d = raw as Record<string, unknown>;
  return {
    enforced: true,
    champions: toStringSet(d["champions"]),
    items: toStringSet(d["items"]),
    abilities: toStringSet(d["abilities"]),
  };
}

// ---------------------------------------------------------------------------
// TRANSFORMED BODIES ARE NEVER PICKABLE — owner 2026-07-30:
//   「不要出現讓人解鎖變身後的英雄吧」
// (and 2026-07-26 「換成本體，變身態改由技能觸發」, same ruling stated twice).
//
// ⚠️ THIS GATE IS DELIBERATELY *OUTSIDE* THE WHITELIST, and that is the whole
// fix. The whitelist has an `enforced` flag whose false branch returns the list
// UNCHANGED — offline, dev, and any unreachable-platform boot take that branch
// (see `NO_FILTER` above). So every "filter it in the whitelist" placement is
// silently a no-op in exactly the environments we develop and playtest in, and
// that is how all 119 champion docs reached the grid instead of the shipping
// roster. Even when enforced, an operator who ticks an alternate id in 後台
// would put a transformed body back on the grid; a pickability rule must not be
// something an operator can toggle.
//
// The symptom owner reported was 「選人畫面有太多重複名稱英雄令人困惑」: measured,
// the 119 docs hold 19 duplicate-NAME groups (38 docs) and **all 19 are
// transform pairs** — base and alternate carry an identical `unam` in the w3x
// (they differ only in `unsf`, the sub-name the importer does not read). So the
// duplicate names were never a naming bug: they were the transformed bodies
// leaking onto a screen they must never be on. Removing them removes all 19.
//
// `isTransformedBody` (not `isAlternateForm`) is the right question: it also
// covers `Nef1` split tiers — asking only the narrower one is what let 巴恩's
// three bodies stay invisible. See `championForms.ts`.
// ---------------------------------------------------------------------------

/**
 * True when `id` may appear on the champion-select grid at all. False for every
 * second-form body (`Emeu` alternate or `Nef1` split tier), and false for a
 * RETIRED champion (owner 2026-08-02「預設不應該再有」).
 *
 * ⚠️ `retired` 是**注入**的，不是在這裡讀 registry —— 這個模組刻意不 import
 * registry（見檔頭）。算好的 Set 由呼叫端從
 * `@ggd/shared/content/championRetirement` 拿。預設空集合，所以既有呼叫端
 * 的行為完全不變。
 */
export function isPickableChampionId(
  id: string,
  retired: ReadonlySet<string> = NO_RETIRED,
  hidden: ReadonlySet<string> = NO_HIDDEN,
): boolean {
  return !isTransformedBody(id) && !retired.has(id) && !hidden.has(id);
}

/** 「沒有人下架」。模組級常數而不是每次 `new Set()`，避免在熱路徑配置。 */
const NO_RETIRED: ReadonlySet<string> = new Set();

/**
 * 「沒有人被藏起來」（隱藏英雄 = 彩蛋，owner 2026-08-17「隱藏角色可以隨機到
 * 但不能選到」）。
 *
 * ⚠️ 形狀與理由跟 `retired` **完全一樣**：它是**注入**的，因為這個模組刻意不
 * import registry（見檔頭）。算好的 Set 由呼叫端從
 * `@ggd/shared/content/championRetirement` 的 `hiddenChampionIds()` 拿。
 *
 * ⚠️ 這一層擋的是「畫面上出現／點得到」，它不是安全邊界 —— 真正的閘在伺服器
 * (`MatchController.selectChampion`)。這裡的價值是**彩蛋不會被劇透**：格子上沒有
 * 它、🎲 的母體沒有它、商店也不賣它。
 */
const NO_HIDDEN: ReadonlySet<string> = new Set();

/**
 * ⚠️ SUBSTITUTE, DO NOT DELETE — the difference is the whole safety of this fix.
 *
 * The operator's saved whitelist enables TEN alternate-form ids by hand
 * (godie-o00x 超級賽亞人悟空, godie-u01u 索隆, godie-u00l 北斗之鼠拳四郎 …; see
 * `ui/platform/valhalla.ts`). A plain `.filter(isPickableChampionId)` would take
 * those ten heroes off the lobby showcase and the grid — which is the #55
 * 黑化Saber shape, a hero vanishing in silence.
 *
 * So an alternate id RESOLVES TO ITS BASE instead of being dropped, which is
 * owner's 2026-07-26 ruling verbatim:「換成本體，變身態改由技能觸發」. Measured
 * on the real content tree: all 26 declared pairs have a base doc on disk, so
 * the substitution never has to invent an entry — but the `?? entry` fallback
 * below keeps a hero visible rather than deleting it should that ever change.
 *
 * SPLIT-FORM tiers have no base to fall back to (they are ranks of one caster's
 * `Nef1` split, not halves of a pair), so those are dropped outright.
 */
function resolveToPickable(
  id: string,
  retired: ReadonlySet<string>,
  hidden: ReadonlySet<string> = NO_HIDDEN,
): string | null {
  if (isSplitFormBody(id)) return null;
  const base = baseFormIdOf(id);
  // ⚠️ 下架檢查在 baseFormIdOf **之後**：下架的是「這位英雄」，而變身態會被
  // 解析回本體，所以只檢查傳進來的 id 會漏掉「勾了變身態 → 解析回一個已下架的
  // 本體」這條路。兩個 id 都查是刻意的冗餘。
  if (retired.has(id) || retired.has(base)) return null;
  // ⚠️ 隱藏英雄**直接 return null，不做 base 代換**。上面那個「變身態解析回本體」
  // 的替代規則存在是為了「英雄不可以無聲消失」（#55 黑化Saber 的形狀），而彩蛋
  // 要的**正是**它在選人畫面上不存在 —— 代換成別人反而會把一個不相干的英雄推上
  // 格子。同樣兩個 id 都查：勾了變身態也不可以繞回一位隱藏本體。
  if (hidden.has(id) || hidden.has(base)) return null;
  return base;
}

/**
 * Restrict a champion roster to the whitelist. Not enforced → whitelist is not
 * applied, but transformed bodies resolve to their base REGARDLESS (see above),
 * and the resulting duplicates collapse. The existing search/random then operate
 * on top of this set.
 */
export function applyChampionWhitelist<T extends RosterChampion>(
  champs: readonly T[],
  wl: Whitelist,
  retired: ReadonlySet<string> = NO_RETIRED,
  hidden: ReadonlySet<string> = NO_HIDDEN,
): T[] {
  const byId = new Map(champs.map((c) => [c.id, c]));
  // The whitelist is compared in BASE space too: an operator who ticked only the
  // alternate still gets the hero, as the base. Ticking is about which heroes are
  // open, never about which body is pickable.
  const allowed = wl.enforced ? new Set([...wl.champions].map((id) => baseFormIdOf(id))) : null;
  const out: T[] = [];
  const seen = new Set<string>();
  for (const entry of champs) {
    const id = resolveToPickable(entry.id, retired, hidden);
    if (id === null) continue;
    if (allowed && !allowed.has(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    // Prefer the real base doc. The `??` branch only fires when an alternate is
    // in the roster but its base is not — a content-integrity fault, not a
    // pickability question — and it re-ids the entry rather than dropping it,
    // because the BASE id is what the server accepts and what spawns. A guard
    // test asserts this branch never fires on the shipping registry.
    out.push(byId.get(id) ?? ({ ...entry, id } as T));
  }
  return out;
}

/** Whitelisted subset of champion ids (for the 🎲 random pick). */
export function whitelistedChampionIds(
  ids: readonly string[],
  wl: Whitelist,
  retired: ReadonlySet<string> = NO_RETIRED,
  hidden: ReadonlySet<string> = NO_HIDDEN,
): string[] {
  return applyChampionWhitelist(
    ids.map((id) => ({ id, name: "" })),
    wl,
    retired,
    hidden,
  ).map((c) => c.id);
}

/** Restrict an item catalogue to the whitelist (ShopPanel). */
export function applyItemWhitelist<T extends { id: string }>(items: readonly T[], wl: Whitelist): T[] {
  if (!wl.enforced) return [...items];
  return items.filter((i) => wl.items.has(i.id));
}

/**
 * The shop catalogue for one match.
 *
 * RULE 1 (owner, task #70, stated twice): 只有最終合成武器才能上架可直接購買
 * (有製作書的) — the shop lists ONLY final crafted weapons. This is now read
 * off the `craftRole` marker recovered from the source-map triggers, NOT from
 * cost or name. The previous pass filtered on `cost > 0`, which let 96 recipe
 * components and 54 no-op recipe books onto the shelf and put the quest item
 * 魔戒 on sale for 300g — because cost encodes neither craft stage nor quest
 * provenance. See tools/w3x-import/extract_item_roles.py for how the marker is
 * derived, and packages/shared/src/sim/content/defs.ts for the role vocabulary.
 *
 * Buyable = `craftRole === "final"` OR a shop SERVICE (傳說寶玉 / 能力屬性強化,
 * which are mechanics, not weapons). Nothing else — no components, no books, no
 * quest items, no direct/token/none items — may ever be listed.
 *
 * When the whitelist is ENFORCED the operator's list narrows the buyable set
 * further, but can never WIDEN it past the final/service rule: a mis-curated
 * whitelist cannot resurrect the old "every priced item" shop.
 */
export function shopCatalogue<
  T extends { id: string; cost?: number; craftRole?: string; modifiers?: unknown; passive?: unknown },
>(
  items: readonly T[],
  wl: Whitelist,
  /**
   * 武器貨架 open/closed (#261). Defaults to the shipped flag, so the SHOP
   * calls this with no third argument and gets 暫時下架 for free. Explicit only
   * where a caller needs the other state — the whitelist/craftRole guards below
   * pass `true` so a closed shelf cannot mask what THEY are asserting, and
   * `shopShelfListing.test.ts` pins the closed default on its own.
   */
  shelfOpen: boolean = WEAPON_SHELF_OPEN,
  /**
   * 寶具（傳說武器）貨架 open/closed（owner 2026-08-17）。與上面那格**分開**：
   * #261 下架的 70 把普通武器不會因為寶具上架而一起回來。
   */
  legendaryOpen: boolean = LEGENDARY_SHELF_OPEN,
  /** 寶具統一價的倍率（× 傳說寶玉價）。出貨 4 ＝ 9,600 金。 */
  legendaryMultiplier: number = LEGENDARY_PRICE_MULTIPLIER,
  /**
   * ⭐ **隨機限定**的抽獎表（`legendaryShelf.randomOnlyTables`，出貨空的）。
   * 表裡的道具永遠不上架 —— 這裡與 sim 的 `buyItem` 讀**同一支** `randomOnlyIds`，
   * ⛔ 只擋一邊 = 畫面上買得到、按下去被伺服器拒絕。
   */
  randomOnlyTables: readonly string[] = [],
): T[] {
  // A final crafted weapon is buyable only when it does SOMETHING the sim can
  // apply. Six finals (雷神之鎚/黑色魔書/…) carry only an active ability item@1
  // cannot express yet (blocked on #56); the sim refuses to sell them, so
  // listing one is a dead 1200g button. They stay classified `final` but off
  // the shelf until the schema grows — exactly the shop's S3 gate.
  const isFinal = (i: T) => i.craftRole === "final" && itemHasEffect(i as never);
  // ⭐ 寶具的具名旁路（owner 2026-08-17「寶具可以上架直接販售了」）。與 sim 的
  // `buyItem` 讀**同一支** `legendaryShelfListable`，所以「架上有、買不到」那種
  // 兩邊各說各話的死按鈕不可能出現。⛔ 這不是把 `isFinal` 放寬：那 49 把裡有
  // 23 把不是 `final`，而放寬 `isFinal` 會把 70 把普通武器的合成原料一起放上架。
  const legendaryIds = legendaryShelfIds();
  // 兩個集合都提到迴圈外：這支函式一次掃一千多份文件。
  const randomOnly = randomOnlyIds(randomOnlyTables);
  const onLegendaryShelf = (i: T) =>
    legendaryShelfListable(i.id, legendaryOpen, legendaryIds, randomOnly);
  const legendaryPrice = legendaryShelfPrice(legendaryMultiplier);
  /**
   * 唯一的出口。⭐ 下面每一條 `return` 都經過它，所以⛔ 沒有任何一條分支能送出
   * 一件**標價 0 元的寶具** —— 那正是失敗形態②（算出來了但玩家看不到）的樣子：
   * 商店會照樣畫出卡片，只是價格是 0，而 sim 收的是 14,400。
   */
  const priced = (list: readonly T[]): T[] =>
    list.map((i) => (onLegendaryShelf(i) ? ({ ...i, cost: legendaryPrice } as T) : i));
  // 暫時下架 (#261) — the LAST word on every branch below, so no fallback path
  // can re-list a weapon the shelf flag closed. The two SERVICES always pass
  // (`shelfListable`), which is exactly 「除了能力屬性強化、及傳說寶玉外」.
  // The DRAFT/loot path never calls this function, so 「隨機三選一仍然可以隨機
  // 到」 holds by construction — see economy/shopShelf.ts.
  // ⭐ `!randomOnly.has` 排在最外層，與 `buyItem` 的那一道全域閘同一個位置：
  // EX理外 那批將來若帶價格又是 `final`，只擋寶具那條路的話它們會從普通武器
  // 那條路上架（而 sim 會拒絕）—— 兩邊必須是**同一條**規則。
  const shelved = (list: readonly T[]): T[] =>
    list.filter(
      (i) => !randomOnly.has(i.id) && (shelfListable(i.id, shelfOpen) || onLegendaryShelf(i)),
    );
  const buyable = shelved(
    items.filter((i) => isFinal(i) || isShopService(i.id) || onLegendaryShelf(i)),
  );
  if (wl.enforced) return priced(applyItemWhitelist(buyable, wl));
  // Unenforced / offline dev is where the shop actually gets played, and the
  // final/service rule holds there too. The ONLY concession is the bare
  // skeleton box (unit tests, `pnpm dev` with no imported content): if not a
  // single final-role item is loaded, fall back to the demo stat sticks so the
  // shop is not an empty grid. Real matches always load the 34 map finals, so
  // this branch never runs in the product.
  if (buyable.some((i) => i.craftRole === "final")) return priced(buyable);
  const services = items.filter((i) => isShopService(i.id));
  const demo = shelved(items.filter((i) => (i.cost ?? 0) > 0 && !isShopService(i.id)));
  if (demo.length > 0) return priced([...services, ...demo]);
  // last-resort skeleton branch: still shelf-filtered, so a closed shelf shows
  // the services alone rather than the entire unfiltered content box.
  const all = shelved(items);
  return priced(all.length > 0 ? all : [...services]);
}

/**
 * True when the whitelist is enforced and yields ZERO champions from the given
 * roster — the champ-select empty-state trigger. Per CONTRACT the panel shows
 * an ACTIONABLE recovery path (/admin/ → 內容白名單 → ⭐ 啟用示範組合 → 儲存,
 * or `make seed-demo`) rather than a broken empty grid.
 */
export function isChampRosterEmpty(champs: readonly RosterChampion[], wl: Whitelist): boolean {
  return wl.enforced && applyChampionWhitelist(champs, wl).length === 0;
}
