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
 * THE PRICE COMES FROM THE SERVER (2026-07-30). One flat 藍水晶 cost applies to
 * every champion that is not on the store doc's free list — owner:「所有英雄藍水
 * 晶都是統一價，新上架預設也是一樣價格」 — and that number SHIPS in
 * content/config/store.json (`championUnlockCost`), is overridden live by
 * 後台 → 商店經濟, and reaches us on every wallet payload as `crystalUnlockCost`.
 *
 * ⚠️ THE SERVER HALF WAS BROKEN UNTIL #241, AND THIS COMMENT DID NOT KNOW.
 * "editable from the admin console" was true of the console and false of the
 * platform: the console wrote into the durable content overlay while the wallet
 * charged a value it had read out of content/ once, at boot. Everything on THIS
 * side already worked — the field rode the payload, the fallback was already a
 * fallback — which is exactly why nothing here went red. If the number on the
 * 解鎖 button ever stops tracking the console again, the failure is on the
 * platform (apps/platform/internal/wallet/economy.go), not in this file.
 *
 * `CRYSTAL_UNLOCK_COST` below is now only the FALLBACK for a payload that never
 * arrived. It used to be the price, which is why changing the price needed a
 * client rebuild; a stale copy here now costs one wrong label on an offline
 * client instead of a wrong charge.
 *
 * The catalog price map still tells us whether a champion is *priced* (locked
 * behind currency) versus a free starter — that is a different question from
 * how much one unlock costs.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../platform/api";
import { CRYSTAL_EARN_HINT } from "../../platform/currency";

/**
 * FALLBACK crystal cost of one champion unlock, used only until (or unless) a
 * wallet payload arrives carrying the live `crystalUnlockCost`. Kept equal to
 * the shipped content value by TestStarterRosterMatchesChampionPrices (Go), so
 * an offline client still prints a number the server would honour.
 */
export const CRYSTAL_UNLOCK_COST = 300;

/**
 * The hint shown when a player taps 「解鎖」 on a champion they cannot afford —
 * it tells them HOW to earn 藍水晶 instead of a silent no-op (task #213).
 *
 * MOVED to ui/platform/currency (task #227): the lobby store shows the same
 * hint on the same failure, and its purchase state machine is a pure module
 * that must not import this React hook module. Re-exported so every existing
 * champ-select caller keeps its import, and so the two screens can never quote
 * two different earn rules at the player.
 */
export { CRYSTAL_EARN_HINT };

/** The slice of GET /wallet the champ-select meta chrome consumes. */
export interface MetaWallet {
  crystal: number;
  /**
   * The live flat unlock price the SERVER will deduct. Absent/invalid payloads
   * degrade to CRYSTAL_UNLOCK_COST rather than to 0 — a 0 here would render
   * 「🔓 解鎖 (0 水晶)」 and make `canAfford` true for a broke account.
   */
  crystalUnlockCost: number;
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
  const costRaw = raw?.crystalUnlockCost;
  // A missing / non-finite / negative cost falls back to the compiled-in
  // constant. NOT to 0: an old platform that does not send the field must not
  // advertise free unlocks. 0 IS accepted when the server really sends it —
  // the owner may legitimately set the flat price to 0.
  const crystalUnlockCost =
    typeof costRaw === "number" && Number.isFinite(costRaw) && costRaw >= 0
      ? Math.floor(costRaw)
      : CRYSTAL_UNLOCK_COST;
  const owned = Array.isArray(raw?.ownedChampions)
    ? raw.ownedChampions.filter((x): x is string => typeof x === "string")
    : [];
  const favourites = Array.isArray(raw?.favourites)
    ? raw.favourites.filter((x): x is string => typeof x === "string")
    : [];
  return { crystal, crystalUnlockCost, ownedChampions: owned, favourites };
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
 * True when this champion is SELECTABLE by ownership — i.e. NOT "locked" (a
 * priced champion the account has not unlocked). Free / unpriced champions and
 * already-owned champions are selectable; this is exactly the negation of the
 * 「解鎖」 unlock-button condition, and it mirrors the server's OwnsChampion rule
 * (free is always playable; priced must be owned).
 */
export function isSelectableByOwnership(id: string, prices: PriceMap, owned: ReadonlySet<string>): boolean {
  return lockStateOf(id, prices, owned) !== "locked";
}

/**
 * Restrict a roster to the champions the account may actually select — the
 * `owned ∩ available` intersection, applied ON TOP of the curation whitelist
 * (task #201). A locked (priced, un-unlocked) champion is removed from the
 * pickable grid entirely, so it can be neither clicked nor swept over. Non-
 * mutating; order preserved.
 */
export function selectableByOwnership<T extends { id: string }>(
  list: readonly T[],
  prices: PriceMap,
  owned: ReadonlySet<string>,
): T[] {
  return list.filter((c) => isSelectableByOwnership(c.id, prices, owned));
}

/**
 * The id-level counterpart for the 🎲 RANDOM pick: keep only champion ids the
 * account owns, so a random/auto pick can never land on a locked champion.
 */
export function selectableIdsByOwnership(
  ids: readonly string[],
  prices: PriceMap,
  owned: ReadonlySet<string>,
): string[] {
  return ids.filter((id) => isSelectableByOwnership(id, prices, owned));
}

/**
 * Split a whitelisted roster into what the champ-select grid SHOWS versus what
 * the account may SELECT.
 *
 * The grid must DISPLAY every available champion — including a LOCKED (priced,
 * un-owned) one — because the 「🔓 解鎖 (N 水晶)」 unlock affordance (#118) lives
 * on the locked champion's OWN card. Filtering locked champions out of the grid
 * (which task #201 first did, via `selectableByOwnership` on the display set)
 * removes the only place a player can spend crystals to unlock them — the very
 * 「藍水晶解鎖角色不見了」 regression this exists to prevent.
 *
 * `selectableIds` is the `owned ∩ available` set: it gates the click-to-pick and
 * the 🎲 random pool, so a locked champion can be previewed and unlocked but
 * never LOCKED IN. The game-server's MatchController.selectChampion remains the
 * authoritative reject of an unowned lock-in (#201) — this is UX legibility only.
 */
export function rosterDisplayAndSelectable<T extends { id: string }>(
  whitelisted: readonly T[],
  prices: PriceMap,
  owned: ReadonlySet<string>,
): { display: readonly T[]; selectableIds: ReadonlySet<string> } {
  const selectableIds = new Set<string>();
  for (const c of whitelisted) {
    if (isSelectableByOwnership(c.id, prices, owned)) selectableIds.add(c.id);
  }
  return { display: whitelisted, selectableIds };
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
  /** live flat unlock cost from the platform (CRYSTAL_UNLOCK_COST until it lands) */
  unlockCost: number;
  owned: ReadonlySet<string>;
  favourites: ReadonlySet<string>;
  prices: PriceMap;
}

const EMPTY_DATA: MetaData = {
  crystal: 0,
  unlockCost: CRYSTAL_UNLOCK_COST,
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
    // Re-read from the mutation response, not carried over from `prev`: an
    // operator price change must reach the button without a reload.
    unlockCost: wallet.crystalUnlockCost,
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

/**
 * How much this client knows about the local account's champion OWNERSHIP.
 * The distinction exists because 🎲 (and only 🎲) needs to tell two very
 * different "we have no owned set" situations apart — see `randomPickGate`:
 *
 *   "known"     — the wallet loaded; `owned`/`prices` are real.
 *   "anonymous" — there is no session at all (local `pnpm dev`, LAN direct
 *                 join). There is no account, so there is nothing to own; the
 *                 game-server is fail-open for exactly these seats too.
 *   "unknown"   — there IS a session but the wallet/catalog did not load (still
 *                 loading, platform outage, malformed payload). We have an
 *                 account whose ownership we cannot see. THIS is the state the
 *                 old `meta.available` boolean silently merged with "anonymous",
 *                 which is how 🎲 could roll an un-unlocked champion during a
 *                 platform outage.
 */
export type OwnershipVisibility = "known" | "unknown" | "anonymous";

export type LoadResult =
  | { available: true; data: MetaData }
  | { available: false; ownership: "unknown" | "anonymous" };

/**
 * Load the wallet + catalog prices, degrading to `available:false` on ANY
 * failure (no session, offline platform, malformed payload). The champ-select
 * hides all meta chrome when unavailable and keeps its existing behaviour.
 *
 * The failure branch now REPORTS WHY (`ownership`): "anonymous" for a client
 * with no session, "unknown" for a signed-in client whose wallet we could not
 * read. Both hide the meta chrome identically — the difference only matters to
 * the 🎲 gate.
 */
export async function loadWalletMeta(deps: WalletMetaDeps = defaultDeps): Promise<LoadResult> {
  if (!deps.hasSession()) return { available: false, ownership: "anonymous" };
  try {
    const [wallet, prices] = await Promise.all([deps.fetchWallet(), deps.fetchPrices()]);
    // ⚠️ AN EMPTY PRICE TABLE IS A FAILURE, NOT A ROSTER WHERE EVERYTHING IS FREE.
    //
    // `lockStateOf` (:134) reads `prices.get(id)` and returns "free" whenever the
    // id is absent — correct per-champion (a champion with no price IS free), and
    // catastrophic table-wide: with an empty map EVERY champion classifies "free",
    // `selectableIdsByOwnership` degenerates into the identity function, and 🎲
    // draws from the whole whitelist. That is exactly the symptom owner reported
    // on 2026-08-02 (「隨機英雄應該要隨機到能選的(已解鎖)」).
    //
    // This branch is reachable WITHOUT any exception: the platform answers 200
    // with `{champions: []}` when its catalogue is not mounted (EmptyCatalog —
    // a missing file is not an error there), so the `catch` below never fires.
    //
    // Falling into "unknown" hands the decision to the admin field that already
    // exists for it (`store.randomPickOwnership`, shipped default 「block」)
    // rather than inventing a second switch — the 第一守則 split: this layer is
    // DATA INTEGRITY (we cannot tell what is locked), the preference layer is
    // already a field.
    if (prices.size === 0) return { available: false, ownership: "unknown" };
    return {
      available: true,
      data: {
        crystal: wallet.crystal,
        unlockCost: wallet.crystalUnlockCost,
        owned: new Set(wallet.ownedChampions),
        favourites: new Set(wallet.favourites),
        prices,
      },
    };
  } catch {
    // A signed-in client whose wallet call failed: we KNOW there is an account
    // and we do NOT know what it owns. Deliberately not "anonymous".
    return { available: false, ownership: "unknown" };
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
  /**
   * WHY `available` is false, for the one consumer that must care: the 🎲
   * random pick. `available === true` ⇔ `ownership === "known"`; when it is
   * false this says whether we are anonymous (no account exists) or merely
   * blind (a real account whose wallet we could not read). See
   * {@link OwnershipVisibility}. While `loading`, this is "unknown" for a
   * signed-in client — a 🎲 press in the first frames must not fail open either.
   */
  ownership: OwnershipVisibility;
  loading: boolean;
  crystal: number;
  /**
   * What ONE unlock costs right now, as the platform reports it. Every label
   * and affordability check must read this, never CRYSTAL_UNLOCK_COST — the
   * constant is the offline fallback baked into this value already.
   */
  unlockCost: number;
  owned: ReadonlySet<string>;
  favourites: ReadonlySet<string>;
  prices: PriceMap;
  /** the champion id currently mutating (disables its buttons), else null. */
  busyId: string | null;
  error: string | null;
  /**
   * A non-error advisory note — set when the player taps 「解鎖」 without enough
   * 藍水晶, carrying `CRYSTAL_EARN_HINT` (how to earn more). Distinct from
   * `error` so the panel can style it as guidance, not a failure. null = none.
   */
  hint: string | null;
  unlock(championId: string): void;
  toggleFavourite(championId: string): void;
  dismissError(): void;
  dismissHint(): void;
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
  // Seeded from `hasSession()` so the FIRST render of a signed-in client is
  // already "unknown" (blind), not "anonymous" (nothing to be blind about).
  // Getting this backwards would re-open the fail-open hole for the whole
  // load window, which is exactly when an impatient player mashes 🎲.
  const [ownership, setOwnership] = useState<OwnershipVisibility>(() =>
    deps.hasSession() ? "unknown" : "anonymous",
  );
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<MetaData>(EMPTY_DATA);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

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
        setOwnership("known");
      } else {
        setAvailable(false);
        setOwnership(res.ownership);
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
    setHint(null); // a real action supersedes any stale insufficient-crystal hint
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
      // Can't afford it? Don't POST (the server would reject anyway) — surface
      // the earn hint so the tap is answered instead of silently doing nothing
      // (task #213). Affordability lives here, the single source of truth the
      // 「解鎖」 button's disabled/dim styling also reads through `canAfford`.
      if (!canAfford(data.crystal, data.unlockCost)) {
        setError(null);
        setHint(CRYSTAL_EARN_HINT);
        return;
      }
      run(championId, () => mutators.unlock(championId));
    },
    [run, mutators, data.crystal, data.unlockCost],
  );

  const toggleFavourite = useCallback(
    (championId: string): void => {
      const next = !data.favourites.has(championId);
      run(championId, () => mutators.favourite(championId, next));
    },
    [run, mutators, data.favourites],
  );

  const dismissError = useCallback((): void => setError(null), []);
  const dismissHint = useCallback((): void => setHint(null), []);

  return {
    available,
    ownership,
    loading,
    crystal: data.crystal,
    unlockCost: data.unlockCost,
    owned: data.owned,
    favourites: data.favourites,
    prices: data.prices,
    busyId,
    error,
    hint,
    unlock,
    toggleFavourite,
    dismissError,
    dismissHint,
  };
}
