/**
 * Per-account champion OWNERSHIP — the game-server's authoritative enforcement
 * of the meta-progression unlock gate (task #201; the unlock economy itself is
 * #118).
 *
 * WHY THIS IS SEPARATE FROM THE WHITELIST. The curation whitelist (#4,
 * curation/whitelist.ts) is per-DEPLOY AVAILABILITY: which champions exist in
 * this build at all. Ownership is per-ACCOUNT: which of those a given player has
 * unlocked (the free starter roster + everything bought with 水晶). The
 * selectable roster is the INTERSECTION `owned ∩ available` — the two predicates
 * are orthogonal and are enforced independently. A locked champion must be
 * rejected at lock-in EVEN WHEN it is whitelisted, and a whitelist can never
 * widen ownership nor vice-versa.
 *
 * WHERE THE SET COMES FROM. The platform is the source of truth: it computes
 * each human seat's playable set (free champions ∪ that account's unlocked
 * champions — see gamelink.PlayableChampions) and ships it in the HMAC-signed
 * `POST /_internal/matches` body. MatchRoom rebuilds this object from the
 * per-seat `owned` arrays; the client is never trusted for it.
 *
 * FAIL-OPEN, DELIBERATELY. Unlike the whitelist (fail-SAFE to allow-all so an
 * outage cannot leak un-curated content), ownership FAILS OPEN: a seat with no
 * ownership entry — a bot, a dev/LAN join, a legacy platform that did not send
 * the field — is allowed to pick anything the whitelist permits. Enforcing an
 * ABSENT set would strand exactly the players #130 protects (a fresh account
 * would face an empty selectable roster and spawn dead). Ownership is a
 * progression gate, not a security boundary against un-curated content, so
 * "unknown ownership → do not block" is the correct floor. Only a seat we were
 * TOLD the ownership of is enforced.
 */

/** One seat's ownership as it arrives on the wire (accountId → playable ids). */
export interface SeatOwnership {
  accountId: string;
  owned: readonly string[];
}

/**
 * An immutable ownership snapshot for one match: a map of accountId → the set of
 * champion ids that account may select. An account absent from the map is
 * UNKNOWN and therefore unenforced (fail-open — see the file header).
 */
export class Ownership {
  private readonly byAccount: ReadonlyMap<string, ReadonlySet<string>>;

  private constructor(byAccount: Map<string, ReadonlySet<string>>) {
    this.byAccount = byAccount;
  }

  /** Build from the per-seat wire arrays. Seats with no `owned` list (bots, dev
   * joins) are simply not enrolled, so they stay unenforced. An empty array IS
   * enrolled — a platform that explicitly says "this account owns nothing" is
   * honoured (though #130's free-roster floor means that never happens for a
   * real account). */
  static fromSeats(seats: readonly Partial<SeatOwnership>[] | undefined): Ownership {
    const map = new Map<string, ReadonlySet<string>>();
    for (const s of seats ?? []) {
      if (!s || typeof s.accountId !== "string" || s.accountId === "") continue;
      if (!Array.isArray(s.owned)) continue; // no list → leave unenforced
      map.set(s.accountId, new Set(s.owned.filter((x): x is string => typeof x === "string")));
    }
    return new Ownership(map);
  }

  /** The unenforced snapshot: every account is unknown, so everything is owned.
   * The default for every legacy call site and unit test (mirrors
   * Whitelist.allowAll). */
  static allowAll(): Ownership {
    return new Ownership(new Map());
  }

  /** Is this account's ownership known to us (i.e. actually enforced)? */
  enforces(accountId: string | undefined): boolean {
    return accountId !== undefined && this.byAccount.has(accountId);
  }

  /**
   * May this account select this champion? An account we were never told about
   * is unenforced and owns everything (fail-open); an account we WERE told about
   * owns exactly its set — a champion outside it is rejected even if whitelisted.
   */
  owns(accountId: string | undefined, championId: string): boolean {
    if (accountId === undefined) return true;
    const set = this.byAccount.get(accountId);
    if (set === undefined) return true; // unknown account → unenforced
    return set.has(championId);
  }

  /**
   * Restrict a champion-id pool to what this account owns. Identity for an
   * unenforced account. Used to keep the RANDOM/auto pick from ever landing on a
   * locked champion — the caller falls back to the un-filtered pool when the
   * intersection is empty so the match still runs (#130), exactly as
   * randomChampionPool does for the whitelist.
   */
  filterOwned(accountId: string | undefined, ids: readonly string[]): string[] {
    if (accountId === undefined) return [...ids];
    const set = this.byAccount.get(accountId);
    if (set === undefined) return [...ids];
    return ids.filter((id) => set.has(id));
  }
}
