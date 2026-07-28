/**
 * displayBaseBonus — the 基礎加成 table every DISPLAYED champion stat must
 * include, resolved the same way in a match and in the lobby.
 *
 * #125 says a number a player reads is the number they actually have. The base
 * bonus makes that harder than the multiplier did, because it is invisible in
 * the champion doc: nothing about 「生命 380」 hints that the player will spawn
 * with 1440. So the panel has to be TOLD, and it must be told the same table the
 * sim used.
 *
 * TWO SOURCES, IN THIS ORDER — deliberately mirroring ui/displayFinal.ts:
 *
 *   1. `MatchState.baseBonusJson` — the table the SERVER snapshotted into THIS
 *      match. Authoritative; a running match keeps the table it started with.
 *   2. the `config.base-bonus@1` doc in the client's own `Configs` registry —
 *      for the lobby, where there is no match yet. Since #189's client overlay
 *      landed (content/clientOverlay.ts) this registry already carries the
 *      operator's durable edit, so the lobby and the shard read one table.
 *
 * An absent/blank source falls back to `DEFAULT_BASE_BONUS`, never to an empty
 * table. Zero would be a silent 300-HP lie on the panel with the server still
 * granting it — exactly the class of bug this whole layer exists to prevent.
 */
import { useEffect, useMemo } from "react";
import { Configs } from "@ggd/shared/content";
import {
  DEFAULT_BASE_BONUS,
  baseBonusFromDoc,
  normalizeBaseBonus,
  type BaseBonusTable,
} from "@ggd/shared/sim/baseBonus";
import { useHud } from "../net/RoomStore";

/** Parse `MatchState.baseBonusJson`; "" / junk → null (caller falls through). */
export function parseBaseBonusJson(json: string | null | undefined): BaseBonusTable | null {
  if (!json) return null;
  try {
    const raw: unknown = JSON.parse(json);
    if (!raw || typeof raw !== "object") return null;
    return normalizeBaseBonus(raw);
  } catch {
    return null;
  }
}

/** The content doc's table (lobby path). Falls back to the shipped default. */
export function contentBaseBonus(): BaseBonusTable {
  return baseBonusFromDoc(Configs.tryGet("base-bonus"));
}

/** Resolve wire-first, then content, then the shipped default. */
export function resolveBaseBonus(wireJson: string | null | undefined): BaseBonusTable {
  return parseBaseBonusJson(wireJson) ?? contentBaseBonus();
}

// ---------------------------------------------------------------------------
// singleton mirror — same pattern as displayFinal's, so an imperative call site
// in the same frame agrees with what React just rendered.
// ---------------------------------------------------------------------------
let current: BaseBonusTable = DEFAULT_BASE_BONUS;

export function getDisplayBaseBonus(): BaseBonusTable {
  return current;
}

export function setDisplayBaseBonus(table: BaseBonusTable): void {
  current = table;
}

/** Reset to the shipped default — for test isolation. */
export function resetDisplayBaseBonus(): void {
  current = DEFAULT_BASE_BONUS;
}

/** Live table for React renderers (re-renders when the snapshot carries a new one). */
export function useDisplayBaseBonus(): BaseBonusTable {
  const json = useHud((s) => s.baseBonusJson);
  const table = useMemo(() => resolveBaseBonus(json), [json]);
  useEffect(() => {
    setDisplayBaseBonus(table);
  }, [table]);
  return table;
}
