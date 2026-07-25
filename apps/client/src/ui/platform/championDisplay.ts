/**
 * championDisplay — champion id → the strings a PLAYER can read (task #227).
 *
 * 「Lobby Store 裡面的東西依然還是 ID 而不是玩家看得懂的名稱及描述」. The lobby
 * store printed `godie-zombiex` where the roster has 「聖杯黑泥醬 - 喪標麥可」,
 * because the store's own data path never had a name to print: the Go catalog
 * (`GET /store/catalog`) is deliberately name-free for champions — it reads
 * `content/config/store.json`, an id→price map — and the client's derivation
 * layer only ever enriched SKINS from their content docs.
 *
 * The name was always in memory. `Champions` is populated from the content
 * bundle at boot, and every other champion-facing surface already reads it
 * (MerchantShop's #202 fix, MatchEndPanel, ChampSelectPanel). This module is
 * that one-liner given a name, so the store and the room picker stop being the
 * two screens that re-derive it wrong.
 *
 * ---------------------------------------------------------------------------
 * REUSE, NOT A THIRD PARSER
 * ---------------------------------------------------------------------------
 * The 稱號/全名 split is `splitChampionName` (ui/codex/codexData) — the ONE rule
 * for 「稱號 - 全名」, shared with the codex and the champ-select identity block.
 * The blurb comes out of `parseDescriptionSections` (ui/panels/champselect) —
 * the map's `description` is a multi-section 故事/推薦玩家/上手度/角色成長 blob
 * with embedded newlines, so printing the raw field into a one-line store row
 * would wreck the layout. Neither rule is re-implemented here.
 *
 * ---------------------------------------------------------------------------
 * TWO INVARIANTS THE CALLERS MUST NOT BREAK
 * ---------------------------------------------------------------------------
 *  1. `?? id` IS TERMINAL. A champion with no registered doc (the skeleton
 *     content path registers only sela/thorne; an offline/degraded boot may
 *     register nothing) degrades to TODAY's behaviour — the id — never to a
 *     blank row. `named` says which happened, so a test can assert "a name was
 *     available and the id was still printed" without guessing.
 *  2. SUBSCRIBE, DON'T SNAPSHOT. `championDisplayFor` reads the registry at
 *     call time, and the registry is EMPTY while the shell paints (main.tsx
 *     streams content in the background; only the match screen gates on it).
 *     Every React caller must re-run it when `useContentReady()` flips — the
 *     exact trap that left the login marquee blank for its entire life
 *     (ChampionMarquee.tsx). A `useMemo(..., [])` here is the bug coming back.
 */
import { Champions } from "@ggd/shared/sim/content/registry";
import type { ChampionId } from "@ggd/shared/ids";
import { splitChampionName } from "../codex/codexData";
import { parseDescriptionSections } from "../panels/champselect/championProfile";

export interface ChampionDisplay {
  /** the champion's full display name 「稱號 - 全名」, or the id when unknown */
  name: string;
  /** 稱號 only; null when the doc name carries none (sela/thorne and friends) */
  title: string | null;
  /** 全名 only; equals `name` when there is no 稱號 */
  fullName: string;
  /** one-line 故事 blurb; "" when the doc has no usable description */
  blurb: string;
  /** true when a real content name was found (false ⇒ `name` is the raw id) */
  named: boolean;
}

/**
 * How much of the 故事 a one-line store row can carry before the ellipsis. The
 * row clips with CSS too; this keeps the DOM text honest for tests and for
 * screen readers rather than relying on an overflow rule.
 */
export const BLURB_MAX_CHARS = 40;

/**
 * Squash the map's multi-line `description` into one printable line.
 * Prefers the 故事 section; falls back to the first non-empty line for the
 * handful of docs that carry free text with no recognised header.
 */
export function championBlurb(description: string | null | undefined): string {
  if (typeof description !== "string" || description.trim() === "") return "";
  const sections = parseDescriptionSections(description);
  const source = sections.story ?? description;
  const line = source
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (line === "") return "";
  return line.length > BLURB_MAX_CHARS ? line.slice(0, BLURB_MAX_CHARS) + "…" : line;
}

/**
 * PURE: build the display strings from a champion doc's raw fields. Split out
 * from the registry lookup so the store's derivation can be unit-tested with
 * hand-written docs and no content boot.
 */
export function championDisplayFrom(
  id: string,
  name?: string | null,
  description?: string | null,
): ChampionDisplay {
  const raw = typeof name === "string" ? name.trim() : "";
  if (raw === "") {
    return { name: id, title: null, fullName: id, blurb: championBlurb(description), named: false };
  }
  const { title, fullName } = splitChampionName(raw);
  return { name: raw, title, fullName, blurb: championBlurb(description), named: true };
}

/**
 * Registry-backed lookup. `description` is an optional field on the champion
 * doc that `ChampionDef` omits but `registerChampion` preserves verbatim, so it
 * is read off the runtime object the same way championProfile does.
 */
export function championDisplayFor(id: string): ChampionDisplay {
  const def = Champions.tryGet(id as ChampionId);
  const description = (def as { description?: unknown } | undefined)?.description;
  return championDisplayFrom(id, def?.name, typeof description === "string" ? description : null);
}
