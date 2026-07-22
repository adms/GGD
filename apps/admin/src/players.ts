/** Pure helpers for the Players table (client-side refinement of the server
 * search: substring filter over username / email / id, case-insensitive). */
import type { AccountRow } from "./types";

export function filterAccounts(rows: AccountRow[], query: string): AccountRow[] {
  const q = query.trim().toLowerCase();
  if (q === "") return rows;
  return rows.filter(
    (r) =>
      r.username.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q) ||
      r.id.toLowerCase().includes(q),
  );
}

/** Compact win-rate string for the table (0 games → "—"). */
export function winRate(row: AccountRow): string {
  if (row.games <= 0) return "—";
  return `${Math.round((row.wins / row.games) * 100)}%`;
}
