/**
 * Champ-select meta progression (task #118) — the CLIENT read/write seam for the
 * platform wallet's free soft-currency layer:
 *
 *   • 水晶 / Crystal — a free per-match currency shown in champ-select.
 *   • 解鎖 / Unlock   — spend `CRYSTAL_UNLOCK_COST` crystals to add a *priced*
 *                       champion to the account roster (POST /wallet/champions/unlock).
 *   • 喜愛置頂 / Favourite — pin champions (POST /wallet/favourites); pinned
 *                       champions float to the TOP of the roster.
 *
 * This module owns the pure model (lock state, favourite sort, the crystal price
 * constant), the network loaders/mutators (built on the shared authenticated
 * ApiClient), and a small React hook the panel consumes. Everything the panel
 * needs degrades gracefully: no session or an unreachable platform resolves to
 * `available:false`, and the champ-select simply hides the meta chrome and
 * behaves exactly as before (offline / bare `pnpm dev` never breaks pick flow).
 *
 * The crystal price for one unlock is a flat server constant (`CrystalUnlockCost`
 * in internal/wallet/meta.go), NOT the champion's M-COIN catalog price — the
 * catalog price only tells us whether a champion is *priced* (locked behind
 * currency) versus a free starter. Mirror the flat cost here so the button label
 * matches what the server actually deducts.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../platform/api";

/** Flat crystal cost of one champion unlock — mirrors `CrystalUnlockCost`. */
export const CRYSTAL_UNLOCK_COST = 300;

/** The slice of GET /wallet the champ-select meta chrome consumes. */
export interface MetaWallet {
  crystal: number;
  ownedChampions: string[];
  favourites: string[];
}

export type PriceMap = ReadonlyMap<string, number>;

/**
 * A champion's ownership state for the roster card:
 *   • "owned"  — already on the account (no unlock button)
 *   • "locked" — priced (catalog price > 0) but not owned → show 「解鎖」
 *   • "free"   — a free starter or unknown price → no unlock button
 */
export type LockState = "owned" | "locked" | "free";

// ---------------------------------------------------------------- model ----

/** Coerce a raw /wallet payload into a safe MetaWallet (defaults, no NaN). */
export function normalizeWallet(raw: Partial<MetaWallet> | null | undefined): MetaWallet {
  const crystalRaw = raw?.crystal;
  const crystal =
    typeof crystalRaw === "number" && Number.isFinite(crystalRaw) ? Math.max(0, Math.floor(crystalRaw)) : 0;
  const owned = Array.isArray(raw?.ownedChampions)
    ? raw.ownedChampions.filter((x): x is string => typeof x === "string")
    : [];
  const favourites = Array.isArray(raw?.favourites)
    ? raw.favourites.filter((x): x is string => typeof x === "string")
    : [];
  return { crystal, ownedChampions: owned, favourites };
}

interface RawCatalogChampion {
  id?: unknown;
  price?: unknown;
}

/** Build an id → price map from a raw /store/catalog payload. */
export function pricesFromCatalog(raw: { champions?: RawCatalogChampion[] } | null | undefined): Map<string, number> {
  const prices = new Map<string, number>();
  const list = raw?.champions;
  if (Array.isArray(list)) {
    for (const c of list) {
      if (typeof c?.id === "string" && typeof c?.price === "number" && Number.isFinite(c.price)) {
        prices.set(c.id, Math.max(0, Math.floor(c.price)));
      }
    }
  }
  return prices;
}

/** Classify a champion for the roster card (owned / locked / free). */
export function lockStateOf(id: string, prices: PriceMap, owned: ReadonlySet<string>): LockState {
  if (owned.has(id)) return "owned";
  const price = prices.get(id);
  if (price === undefined || price <= 0) return "free";
  return "locked";
}

/** True when the wallet can afford one unlock. */
export function canAfford(crystal: number, cost: number = CRYSTAL_UNLOCK_COST): boolean {
  return crystal >= cost;
}

/**
 * Stable sort that floats favourited champions to the TOP while preserving the
 * original relative order within each group. Non-mutating.
 */
export function sortFavouritesFirst<T extends { id: string }>(
  list: readonly T[],
  favourites: ReadonlySet<string>,
): T[] {
  const fav: T[] = [];
  const rest: T[] = [];
  for (const item of list) {
    if (favourites.has(item.id)) fav.push(item);
    else rest.push(item);
  }
  return [...fav, ...rest];
}

/** The resolved meta state the hook exposes to the view. */
export interface MetaData {
  crystal: number;
  owned: ReadonlySet<string>;
  favourites: ReadonlySet<string>;
  prices: PriceMap;
}

const EMPTY_DATA: MetaData = {
  crystal: 0,
  owned: new Set<string>(),
  favourites: new Set<string>(),
  prices: new Map<string, number>(),
};

/**
 * Fold a wallet returned by a mutation (unlock / favourite) into the current
 * meta state. The catalog price map is static for the match, so it is carried
 * across unchanged. This is the reducer the "unlock flips owned" and
 * "favourite toggles" transitions run through.
 */
export function applyWallet(prev: MetaData, wallet: MetaWallet): MetaData {
  return {
    crystal: wallet.crystal,
    owned: new Set(wallet.ownedChampions),
    favourites: new Set(wallet.favourites),
    prices: prev.prices,
  };
}

// -------------------------------------------------------------- network ----

/** Injectable read seam (so the loader is unit-testable without the network). */
export interface WalletMetaDeps {
  hasSession(): boolean;
  fetchWallet(): Promise<MetaWallet>;
  fetchPrices(): Promise<Map<string, number>>;
}

/** Injectable write seam (unlock + favourite POSTs). */
export interface WalletMutators {
  unlock(champion: string): Promise<MetaWallet>;
  favourite(champion: string, favourite: boolean): Promise<MetaWallet>;
}

/** Production deps — the shared, already-authenticated platform ApiClient. */
export const defaultDeps: WalletMetaDeps = {
  hasSession: () => api.hasSession,
  async fetchWallet() {
    return normalizeWallet(await api.request<Partial<MetaWallet>>("/wallet"));
  },
  async fetchPrices() {
    return pricesFromCatalog(await api.request<{ champions?: RawCatalogChampion[] }>("/store/catalog"));
  },
};

/** Production mutators — the two meta POST endpoints. */
export const defaultMutators: WalletMutators = {
  async unlock(champion) {
    return normalizeWallet(
      await api.request<Partial<MetaWallet>>("/wallet/champions/unlock", { body: { champion } }),
    );
  },
  async favourite(champion, favourite) {
    return normalizeWallet(
      await api.request<Partial<MetaWallet>>("/wallet/favourites", { body: { champion, favourite } }),
    );
  },
};

export type LoadResult = { available: true; data: MetaData } | { available: false };

/**
 * Load the wallet + catalog prices, degrading to `available:false` on ANY
 * failure (no session, offline platform, malformed payload). The champ-select
 * hides all meta chrome when unavailable and keeps its existing behaviour.
 */
export async function loadWalletMeta(deps: WalletMetaDeps = defaultDeps): Promise<LoadResult> {
  if (!deps.hasSession()) return { available: false };
  try {
    const [wallet, prices] = await Promise.all([deps.fetchWallet(), deps.fetchPrices()]);
    return {
      available: true,
      data: {
        crystal: wallet.crystal,
        owned: new Set(wallet.ownedChampions),
        favourites: new Set(wallet.favourites),
        prices,
      },
    };
  } catch {
    return { available: false };
  }
}

function errMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "操作失敗，請稍後再試";
}

// ----------------------------------------------------------------- hook ----

/** What the champ-select panel consumes. */
export interface WalletMetaHook {
  /** false → hide all meta chrome (offline / no session / unreachable). */
  available: boolean;
  loading: boolean;
  crystal: number;
  owned: ReadonlySet<string>;
  favourites: ReadonlySet<string>;
  prices: PriceMap;
  /** the champion id currently mutating (disables its buttons), else null. */
  busyId: string | null;
  error: string | null;
  unlock(championId: string): void;
  toggleFavourite(championId: string): void;
  dismissError(): void;
}

/**
 * React hook: loads the wallet meta once on mount and exposes the crystal
 * balance, ownership/favourite/price maps, and the unlock/favourite mutations.
 * `deps`/`mutators` are injectable for tests but default to the live platform
 * client. A single in-flight mutation is enforced (busyId) so a double-click
 * never double-spends.
 */
export function useWalletMeta(
  deps: WalletMetaDeps = defaultDeps,
  mutators: WalletMutators = defaultMutators,
): WalletMetaHook {
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<MetaData>(EMPTY_DATA);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const aliveRef = useRef(true);
  const busyRef = useRef(false);

  useEffect(() => {
    aliveRef.current = true;
    setLoading(true);
    void loadWalletMeta(deps).then((res) => {
      if (!aliveRef.current) return;
      if (res.available) {
        setData(res.data);
        setAvailable(true);
      } else {
        setAvailable(false);
      }
      setLoading(false);
    });
    return () => {
      aliveRef.current = false;
    };
    // module-singleton deps: load exactly once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = useCallback((id: string, op: () => Promise<MetaWallet>): void => {
    if (busyRef.current) return; // one mutation at a time — no double-spend
    busyRef.current = true;
    setBusyId(id);
    setError(null);
    void (async () => {
      try {
        const wallet = await op();
        if (!aliveRef.current) return;
        setData((prev) => applyWallet(prev, wallet));
      } catch (err) {
        if (aliveRef.current) setError(errMessage(err));
      } finally {
        busyRef.current = false;
        if (aliveRef.current) setBusyId(null);
      }
    })();
  }, []);

  const unlock = useCallback(
    (championId: string): void => {
      run(championId, () => mutators.unlock(championId));
    },
    [run, mutators],
  );

  const toggleFavourite = useCallback(
    (championId: string): void => {
      const next = !data.favourites.has(championId);
      run(championId, () => mutators.favourite(championId, next));
    },
    [run, mutators, data.favourites],
  );

  const dismissError = useCallback((): void => setError(null), []);

  return {
    available,
    loading,
    crystal: data.crystal,
    owned: data.owned,
    favourites: data.favourites,
    prices: data.prices,
    busyId,
    error,
    unlock,
    toggleFavourite,
    dismissError,
  };
}
