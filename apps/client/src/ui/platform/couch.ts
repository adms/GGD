/**
 * Couch-play helpers (pure) — guest pseudo-id naming shared with the Go
 * platform: local players 2..4 on one machine play as "{accountId}:pN" and
 * display as "Name (2P)".."(4P)". Mirrors apps/platform/internal/gamelink/guest.go.
 */

/** Pseudo account id of couch player n (2..4) of base. */
export function guestAccountId(base: string, n: number): string {
  return `${base}:p${n}`;
}

/** (baseAccountId, playerNumber): playerNumber is 1 for the owner, 2..N for guests. */
export function splitGuestId(id: string): { base: string; player: number } {
  const i = id.lastIndexOf(":p");
  if (i <= 0) return { base: id, player: 1 };
  const n = Number(id.slice(i + 2));
  if (!Number.isInteger(n) || n < 2) return { base: id, player: 1 };
  return { base: id.slice(0, i), player: n };
}

/** Display name of couch player n: "Name (2P)" (n>=2), or the name itself. */
export function guestDisplayName(name: string, n: number): string {
  if (n <= 1) return name;
  return name ? `${name} (${n}P)` : `(${n}P)`;
}

/** Member-list seat badge: "×N (本機)" for couch members, "" for solo. */
export function memberSeatLabel(localPlayers: number): string {
  const n = Math.max(1, localPlayers || 1);
  return n > 1 ? `×${n} (本機)` : "";
}

/** Short per-viewport player badge: "1P".."4P" (player is 0-based). */
export function playerBadge(player: number): string {
  return `${player + 1}P`;
}

/** Σ localPlayers over the member list — seats claimed by humans. */
export function seatSum(members: { localPlayers?: number }[]): number {
  return members.reduce((sum, m) => sum + Math.max(1, m.localPlayers ?? 1), 0);
}
