/**
 * TASK #227 (sweep) — no LOBBY screen may snapshot the champion registry.
 *
 * The store printed champion ids because its rows never carried a name. The
 * ladder has the SAME class of bug from the other direction: it looks up names
 * correctly (`opt?.name ?? r.championId`) but built its options in a
 * `useMemo(…, [])` under the comment "static after boot". It is not static —
 * boot paints the lobby first and streams the content bundle in the background
 * (#170) — so on a cold lobby the champion ladder rendered raw ids for the rest
 * of the page session, exactly like ChampionMarquee's documented failure.
 *
 * Client vitest is node-env with no DOM and these screens pull Babylon in
 * transitively, so this is a comment-stripped source scan (the established
 * pattern here). It fails if a lobby champion-name lookup is memoised without
 * subscribing to `useContentReady()`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";

const read = (file: string): string =>
  readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

/**
 * Every lobby screen that resolves a champion id → a player-facing name.
 *
 * ⚠️ GH#497 swept this list again (after #491 found `RoomView` printing raw ids
 * from OUTSIDE it). `ChampionMarquee.tsx` — the component whose failure this
 * whole file is named after, quoted in the header above — was itself **not on
 * the list**: the fix landed, and nothing was watching it. That is the same
 * shape as the bug: the guard existed and the screen was invisible to it.
 *
 * ⛔ Two platform screens are deliberately still absent, and both are real gaps
 * rather than exemptions — they are filed, not forgotten:
 *   · `ValhallaPanel.tsx` — subscribes correctly (`contentReady` is in the deps
 *     of its roster memo) but the memo body calls `valhallaRoster(whitelist)`,
 *     so `REGISTRY_READ` sees no registry call and the "reads no champion
 *     registry at all" assertion would fire. The predicate needs widening
 *     before this can join.
 *   · `valhalla/ValhallaSandboxPanel.tsx` — reads `Champions.tryGet` /
 *     `championDisplayFor` in the render body with NO `useContentReady()` at
 *     all, so it re-renders on content boot only if a parent happens to.
 */
const SCREENS = [
  "./StoreScreen.tsx",
  "./LeaderboardPanel.tsx",
  "./ChampionMarquee.tsx",
] as const;

/** A champion-registry read — the thing that returns nothing before boot. */
const REGISTRY_READ = /Champions\.(all|tryGet)\(|championDisplayFor\(/;

/**
 * Every `useMemo`/`useCallback` call in `src`, split into body + dep list.
 * Paren-matched rather than regex-sliced: the dep array is the LAST argument,
 * and a lazy regex happily stops at an unrelated `[]` inside the body (the
 * store's own `catalog ? … : []` fallback is exactly such a trap).
 */
function memoCalls(src: string): { body: string; deps: string }[] {
  const out: { body: string; deps: string }[] = [];
  const re = /use(?:Memo|Callback)\s*(?:<[^>]*>)?\s*\(/g;
  for (let m = re.exec(src); m !== null; m = re.exec(src)) {
    const start = m.index + m[0].length;
    let depth = 1;
    let i = start;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")") depth--;
    }
    const args = src.slice(start, i - 1);
    const depsAt = args.lastIndexOf("[");
    out.push({ body: args, deps: depsAt >= 0 ? args.slice(depsAt) : "<no dep list>" });
  }
  return out;
}

describe("#227 lobby champion names subscribe to content readiness", () => {
  for (const file of SCREENS) {
    it(`${file} never memoises a champion lookup on []`, () => {
      cover("champ-marquee-subscribes-to-content-ready");
      const src = read(file);
      expect(src).toMatch(/useContentReady\(\)/);
      const reads = memoCalls(src).filter((c) => REGISTRY_READ.test(c.body));
      expect(reads.length, `${file} reads no champion registry at all`).toBeGreaterThan(0);
      for (const r of reads) {
        expect(
          r.deps,
          `${file}: a champion lookup is memoised on ${r.deps} — a snapshot of an EMPTY registry, so this screen would print ids for the whole page session`,
        ).toContain("contentReady");
      }
    });
  }

  it("the ladder still has an id fallback — degrade, never blank", () => {
    cover("champ-marquee-subscribes-to-content-ready");
    expect(read("./LeaderboardPanel.tsx")).toMatch(/\?\?\s*r\.championId/);
  });
});
