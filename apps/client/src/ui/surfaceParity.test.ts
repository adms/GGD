/**
 * GUARD — "global" components must exist on EVERY surface (audit shape **S9**,
 * docs/_false-completions.md:51).
 *
 * THE SHAPE. A component is built once, mounted once, and declared global. Then
 * a SECOND surface appears that renders the same thing a different way — a
 * second `root.render(` tree, a touch HUD instead of the desktop bar, a second
 * way into a match — and the "global" component is simply not in it. Nothing
 * throws. No test fails. The feature is 100% absent for whoever lands on that
 * surface, and it is absent SILENTLY. Three live instances were found by the
 * five-lane audit:
 *
 *   1. `#replay=` renders `<ReplayApp/>` instead of `<AppRoot/>` — the replay
 *      page had no audio toggle (#14) and no build stamp (#66)  [fixed, P0-6(b)]
 *   2. `CastNoticeLine` is in `AbilityBar` only, and `HudRoot` swaps
 *      `AbilityBar` out for `TouchControls` (phone) or `CouchHudGrid` (couch) —
 *      so on a phone a refused Q press never says why  [P1-2, open]
 *   3. `MatchLoadingOverlay` gates ONE of the three ways `screen` becomes
 *      "match"  [P1-4 note / #74, open]
 *
 * WHY THIS TEST IS BUILT THE WAY IT IS. A guard that hard-codes "AppRoot and
 * ReplayApp must both have AudioToggle" is worth nothing: it restates a defect
 * we already fixed and stays green through the next one. So BOTH SIDES OF THE
 * COMPARISON ARE COMPUTED FROM THE SOURCE AT TEST TIME:
 *
 *   • the SURFACES are enumerated by scanning the source — every `.render(<X/>)`
 *     in every file that calls `createRoot`, every mutually-exclusive boolean
 *     branch pair in `HudRoot`, every store action that sets `screen: "match"`.
 *     Add a third entry point, a fourth HUD variant, or a new "jump into a
 *     match" action and it joins the cross-product with NO edit to this file —
 *     and immediately owes every ubiquity contract below.
 *   • the CHROME SET is read out of `ui/GlobalChrome.tsx` itself (whatever it
 *     renders is the global set), not typed out here.
 *   • the CLAIMS are read out of component docblocks: any `.tsx` whose header
 *     says it is on "EVERY screen / page / render tree" must be discharged by a
 *     contract, by GlobalChrome membership, or by an explicit exemption.
 *
 * So this file contains no list of "things that are currently wrong". It
 * contains three CONTRACTS (what must be everywhere), an EXEMPTION table (with
 * reasons), and a KNOWN-GAP ratchet (see below). Everything else is derived.
 *
 * THE RATCHET. `KNOWN_GAPS` are the audit's still-open S9 instances, owned by
 * other task lanes. They are asserted BOTH WAYS: an unlisted violation fails
 * (regression), and a listed gap that is no longer a violation ALSO fails
 * ("you fixed it — delete the row"). A gap therefore cannot be forgotten in
 * either direction. It is deliberately NOT a "skip if broken" list: a silent
 * skip is the exact pathology this shape is made of.
 *
 * SOURCE-LEVEL, NOT RENDERED. The failure is structural ("which tree mounts
 * what"), the components portal to <body> and touch the audio subsystem, and
 * the client's vitest env is `node`. Rendering these trees is neither possible
 * nor the point. Comments are stripped before every structural scan, so prose
 * ABOUT `<GlobalChrome/>` can never satisfy a check that wants the real mount.
 *
 * COST: ~50ms for the whole file (measured, 5 cases) — it reads the ~80 `.tsx`
 * files under src/ once into a cache and runs pure regex over them; no DOM, no
 * React, no content load. Cheap enough to run on every `pnpm test`, and it
 * scales with the client's file count, not with the content set.
 *
 * RELATED: `./globalChrome.test.ts` is the narrow P0-6(b) regression test (it
 * pins the two specific trees by name). This file is the general shape gate.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";

const SRC = fileURLToPath(new URL("../", import.meta.url)); // apps/client/src/
const rel = (p: string): string => relative(SRC, p).split(sep).join("/");

// --------------------------------------------------------------- source io --

/**
 * Strip comments before any structural scan. Without this, a docblock that
 * MENTIONS `<GlobalChrome/>` (several do — they explain this very defect) would
 * satisfy a "renders GlobalChrome" check while the tree mounts nothing. The
 * `[^:]` guard keeps `https://` inside string literals intact.
 */
const codeCache = new Map<string, string>();
function code(file: string): string {
  let c = codeCache.get(file);
  if (c === undefined) {
    c = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    codeCache.set(file, c);
  }
  return c;
}
/** comment-free AND whitespace-collapsed: survives any prettier reflow */
const flatCache = new Map<string, string>();
function flat(file: string): string {
  let f = flatCache.get(file);
  if (f === undefined) flatCache.set(file, (f = code(file).replace(/\s+/g, " ")));
  return f;
}

/** the file's leading docblock (the component's own stated contract), if any */
function header(file: string): string {
  const m = /^\s*\/\*\*([\s\S]*?)\*\//.exec(readFileSync(file, "utf8"));
  return m ? m[1]! : "";
}

function walk(dir: string, ext: RegExp, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, ext, out);
    else if (ext.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const TSX = walk(SRC, /\.tsx$/);

/** every capitalised JSX tag rendered in a file (its rendered child set) */
function jsxChildren(file: string): Set<string> {
  return new Set([...flat(file).matchAll(/<([A-Z]\w*)/g)].map((m) => m[1]!));
}

/** local-import name → resolved absolute file (the module graph, as written) */
function imports(file: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /import\s+(?:type\s+)?(?:\{([^}]*)\}|(\w+))\s+from\s+["']([^"']+)["']/g;
  const src = code(file);
  for (let m = re.exec(src); m; m = re.exec(src)) {
    const spec = m[3]!;
    if (!spec.startsWith(".")) continue;
    const base = resolve(dirname(file), spec);
    const target = [base + ".tsx", base + ".ts", base + "/index.tsx", base + "/index.ts"].find(
      (c) => existsSync(c),
    );
    if (!target) continue;
    for (const raw of (m[1] ? m[1].split(",") : [m[2]!])) {
      const n = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()!.trim();
      if (n) out.set(n, target);
    }
  }
  return out;
}

/**
 * Does `comp` (as imported by `from`) render `<target/>`, directly or through
 * its own children? Depth-limited: a ubiquity contract discharged five levels
 * down is not a contract anyone can see, and the recursion must terminate on
 * the mutual imports the HUD tree has.
 */
function rendersDeep(
  comp: string,
  target: string,
  from: Map<string, string>,
  depth = 0,
  seen = new Set<string>(),
): boolean {
  const file = from.get(comp);
  if (!file || seen.has(file) || depth > 3) return false;
  seen.add(file);
  const kids = jsxChildren(file);
  if (kids.has(target)) return true;
  const im = imports(file);
  for (const k of kids) if (im.has(k) && rendersDeep(k, target, im, depth + 1, seen)) return true;
  return false;
}

// ----------------------------------------------------- surface enumeration --

/** SURFACE FAMILY 1 — every React tree the app can boot into. */
function renderRoots(): { name: string; entry: string; file: string | null }[] {
  const out: { name: string; entry: string; file: string | null }[] = [];
  for (const f of TSX.concat(walk(SRC, /\.tsx?$/)).filter((p) => code(p).includes("createRoot"))) {
    const im = imports(f);
    for (const m of flat(f).matchAll(/\.render\(\s*<([A-Z]\w*)/g)) {
      const name = m[1]!;
      if (!out.some((o) => o.name === name && o.entry === f)) {
        out.push({ name, entry: f, file: im.get(name) ?? null });
      }
    }
  }
  return out;
}

/**
 * SURFACE FAMILY 2 — mutually-exclusive HUD variants. A boolean `c` that gates
 * `{c && <A/>}` in one place and `{!c && <B/>}` in another is, by construction,
 * two renderings of the same moment: exactly one side is on screen. Both sides
 * are surfaces and both owe the same in-match feedback.
 *
 * Only BOOLEAN atoms qualify (see "what this does not catch" at the bottom).
 */
type Family = { atom: string; pos: Set<string>; neg: Set<string> };
function hudVariantFamilies(hudFile: string): Family[] {
  const s = flat(hudFile);
  const atoms = new Map<string, Family>();
  const re = /\{\s*((?:!?[A-Za-z_$][\w$]*\s*&&\s*)+)/g;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    // the whole `{ … }` branch, brace-matched, so a `(<> … </>)` fragment
    // contributes ALL of its components and not just the first one
    let depth = 0;
    let span = "";
    for (let i = m.index; i < s.length; i++) {
      if (s[i] === "{") depth++;
      else if (s[i] === "}" && --depth === 0) {
        span = s.slice(m.index, i);
        break;
      }
    }
    const comps = [...span.matchAll(/<([A-Z]\w*)/g)].map((x) => x[1]!);
    if (!comps.length) continue;
    for (const raw of m[1]!.split("&&")) {
      const t = raw.trim();
      if (!t) continue;
      const negated = t.startsWith("!");
      const atom = t.replace(/^!/, "");
      const fam = atoms.get(atom) ?? { atom, pos: new Set<string>(), neg: new Set<string>() };
      for (const c of comps) fam[negated ? "neg" : "pos"].add(c);
      atoms.set(atom, fam);
    }
  }
  // a family needs BOTH sides — a one-sided condition is a plain toggle
  return [...atoms.values()].filter((f) => f.pos.size > 0 && f.neg.size > 0);
}

/** SURFACE FAMILY 3 — every store action that puts the player into a match. */
function matchEntryActions(storeFile: string): string[] {
  const src = code(storeFile);
  const heads = [...src.matchAll(/\n {4}(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/g)].map((m) => ({
    name: m[1]!,
    at: m.index!,
  }));
  const found = new Set<string>();
  for (const hit of src.matchAll(/screen:\s*"match"/g)) {
    let owner: string | null = null;
    for (const h of heads) if (h.at < hit.index!) owner = h.name;
    if (owner) found.add(owner);
  }
  return [...found];
}

// ------------------------------------------------------- declared ubiquity --

const HUD_ROOT = resolve(SRC, "ui/HudRoot.tsx");
const GLOBAL_CHROME = resolve(SRC, "ui/GlobalChrome.tsx");
const STORE = resolve(SRC, "ui/platform/store.ts");
const LOADING_OVERLAY = resolve(SRC, "ui/platform/MatchLoadingOverlay.tsx");

/**
 * THE DECLARED-GLOBAL SET. Three contracts; each names WHAT must be everywhere
 * and WHICH computed surface family it must be everywhere IN. The surfaces are
 * never listed — they are derived above, so a contract automatically extends to
 * a surface that does not exist yet.
 */
const CONTRACTS = [
  {
    family: "render-root",
    what: "GlobalChrome",
    // #14 audio toggle + #66 build stamp. Declared once in ui/GlobalChrome so a
    // tree cannot drift from its sibling by hand-mounting (defect P0-6(b)).
    why: "the audio quick-toggle (#14) and the build stamp (#66) are on EVERY page",
  },
  {
    family: "hud-input-variant",
    what: "CastNoticeLine",
    // #181/#160: every Q/W/E/R/EX press answers back. `announceCastAttempt`
    // computes the sentence on every input path (keyboard, pad, tile, arc); the
    // variant that does not render the line throws that sentence away.
    why: "a refused cast must say WHY on every input surface (#181/#160)",
  },
  {
    family: "match-entry",
    what: "the staged loading handoff",
    // #74: the login roar must fade behind a >=1s bar before combat voices.
    // Any action that flips straight to "match" skips the fade AND the bar.
    why: "entering a match goes through the >=1s handoff bar (#74)",
  },
] as const;

/**
 * CLAIM EXEMPTIONS — a `.tsx` whose LEADING docblock claims ubiquity but which
 * is not itself a global component. Each needs a reason; the list must stay
 * tiny, and a growing list means the phrase scan needs tightening, not more
 * rows.
 */
const CLAIM_EXEMPTIONS: Record<string, string> = {
  // Its header's "above every screen" describes the <body>-portaled AudioToggle
  // cluster that LobbyScreen must RESERVE ROOM FOR (chromeReserve), not a claim
  // about LobbyScreen itself. LobbyScreen is one screen among several.
  "ui/platform/LobbyScreen.tsx":
    "the claim is about the audio cluster it reserves space for, not about itself",
};

/**
 * KNOWN GAPS — the audit's still-OPEN S9 instances (docs/_false-completions.md).
 * These are real defects, not exemptions: they are owned by other task lanes and
 * are recorded here so (a) they cannot multiply unnoticed and (b) they cannot be
 * fixed and forgotten — the ratchet test below fails when one stops being a gap.
 *
 * NEVER add a row here to make a red test green. A row is an admission that a
 * feature is invisible to a real player, with the audit line that says so.
 */
const KNOWN_GAPS: Record<string, string> = {
  // P1-2 — phone. HudRoot:144 swaps AbilityBar out for TouchControls, and
  // TouchControls imports abilityActivationCue + AbilityDescriptionOverlay but
  // not CastNoticeLine, so 冷卻中／魔力不足／距離太遠／尚未學習 are computed and
  // dropped. FIX: one `<CastNoticeLine />` in ui/TouchControls.tsx (it already
  // has a TOUCH_BOTTOM layout branch — it was written for this surface).
  "hud-input-variant/TouchControls": "docs/_false-completions.md P1-2 (open, task #181/#160)",
  // P1-2 — couch/split-screen. HudRoot:142 replaces the whole single-player HUD
  // block with CouchHudGrid, which is display-only. Same one-line fix.
  "hud-input-variant/CouchHudGrid": "docs/_false-completions.md P1-2 (open, task #181/#160)",
  // #74 — the dev direct-join button in LobbyScreen jumps straight to "match":
  // no bar, and the login roar never gets its fade.
  "match-entry/playOffline": "docs/_false-completions.md (#74 handoff covers 1 of 3 paths)",
  // #74 — the real one. A platform match arrives as a seat-token push and
  // enters the match from inside the ws reducer, bypassing the handoff.
  "match-entry/onWsMessage": "docs/_false-completions.md (#74 handoff covers 1 of 3 paths)",
};

/** How to resolve a violation. Repeated in every failure message on purpose. */
const HOW_TO_FIX =
  "\nResolve it one of three ways: (1) render the component on that surface too " +
  "(usually one line); (2) if it genuinely does not belong there, add a row to " +
  "CLAIM_EXEMPTIONS/KNOWN_GAPS in this file WITH A REASON — an exemption is a " +
  "decision on the record, not a mute button; (3) if the component's docblock " +
  "over-claims (\"on every screen\" when it is one screen's chrome), fix the " +
  "docblock. Do NOT delete the surface from the scan.";

// ------------------------------------------------------------------ checks --

/** Every violation, as `family/surface` keys with a human explanation. */
function violations(): { key: string; detail: string }[] {
  const out: { key: string; detail: string }[] = [];

  // 1 · render roots × global chrome
  const chromeImports = imports(GLOBAL_CHROME);
  for (const root of renderRoots()) {
    if (!root.file) {
      out.push({
        key: `render-root/${root.name}`,
        detail:
          `${rel(root.entry)} renders <${root.name}/> as a top-level tree but this guard cannot ` +
          `resolve it to a file (not a relative import?). It must render <GlobalChrome/>.`,
      });
      continue;
    }
    if (!jsxChildren(root.file).has("GlobalChrome")) {
      out.push({
        key: `render-root/${root.name}`,
        detail:
          `<${root.name}/> (${rel(root.file)}) is a render tree booted from ${rel(root.entry)} ` +
          `but does not render <GlobalChrome/> — that page has NO audio toggle (#14) and NO ` +
          `build stamp (#66), silently.`,
      });
    }
    // drift guard: hand-mounting a chrome member is how the trees diverged
    for (const member of [...jsxChildren(GLOBAL_CHROME)].filter((n) => chromeImports.has(n))) {
      if (jsxChildren(root.file).has(member)) {
        out.push({
          key: `render-root/${root.name}#${member}`,
          detail:
            `<${root.name}/> (${rel(root.file)}) hand-mounts <${member}/> instead of taking it ` +
            `from <GlobalChrome/>. Hand-mounting is what let one tree drift from the other.`,
        });
      }
    }
  }

  // 2 · HUD variant families × cast feedback
  const hudImports = imports(HUD_ROOT);
  for (const fam of hudVariantFamilies(HUD_ROOT)) {
    for (const side of ["neg", "pos"] as const) {
      const comps = [...fam[side]].filter((c) => hudImports.has(c));
      if (!comps.length) continue;
      if (comps.some((c) => rendersDeep(c, "CastNoticeLine", hudImports))) continue;
      for (const c of comps) {
        out.push({
          key: `hud-input-variant/${c}`,
          detail:
            `HudRoot renders <${c}/> on the ${side === "pos" ? "" : "!"}${fam.atom} side of a ` +
            `mutually-exclusive HUD variant, and NOTHING on that side renders <CastNoticeLine/>. ` +
            `On that surface a refused Q/W/E/R/EX press is computed, phrased, and thrown away — ` +
            `the player only gets a shake.`,
        });
      }
    }
  }

  // 3 · match-entry paths × the loading handoff
  const entries = matchEntryActions(STORE);
  const overlayUses = new Set(
    [...flat(LOADING_OVERLAY).matchAll(/useApp\(\s*\(\w+\)\s*=>\s*\w+\.(\w+)\)/g)].map((m) => m[1]!),
  );
  const commit = entries.filter((a) => overlayUses.has(a));
  for (const action of entries) {
    if (commit.includes(action)) continue;
    out.push({
      key: `match-entry/${action}`,
      detail:
        `ui/platform/store.ts action \`${action}\` sets screen: "match" directly, bypassing the ` +
        `staged handoff (\`${commit[0] ?? "<none>"}\`, the action MatchLoadingOverlay commits). ` +
        `Down that path there is no >=1s loading bar and the login dragon roar never gets its ` +
        `fade — it overlaps the combat scene (#74).`,
    });
  }

  return out;
}

// ------------------------------------------------------------------- specs --

describe("ubiquitous components exist on EVERY surface (shape S9)", () => {
  it("the surface scan actually finds surfaces (a guard that measures nothing passes forever)", () => {
    cover("ubiquitous-surface-parity");
    const roots = renderRoots();
    const families = hudVariantFamilies(HUD_ROOT);
    const entries = matchEntryActions(STORE);
    const chrome = [...jsxChildren(GLOBAL_CHROME)].filter((n) => imports(GLOBAL_CHROME).has(n));

    // If a refactor breaks these scans they would report "no violations" forever.
    // Each number is a floor, not the current value — growth is expected and fine.
    expect(TSX.length, "no .tsx files found under apps/client/src").toBeGreaterThan(20);
    expect(
      roots.length,
      "no `.render(<X/>)` site found — the render-root scan is broken, not clean",
    ).toBeGreaterThanOrEqual(2);
    expect(
      families.length,
      "no mutually-exclusive HUD variant found in ui/HudRoot.tsx — the branch scan is broken " +
        "(there are at least the touch and couch variants)",
    ).toBeGreaterThanOrEqual(2);
    expect(
      entries.length,
      'no store action sets screen: "match" — the match-entry scan is broken',
    ).toBeGreaterThanOrEqual(2);
    expect(
      chrome.length,
      "ui/GlobalChrome.tsx renders no imported component — the global chrome set is empty",
    ).toBeGreaterThanOrEqual(1);
  });

  it("every contract's subject still exists (a contract for a deleted component is a lie)", () => {
    cover("ubiquitous-surface-parity");
    const hudImports = imports(HUD_ROOT);
    expect(existsSync(GLOBAL_CHROME), "ui/GlobalChrome.tsx is gone").toBe(true);
    expect(
      TSX.some((f) => jsxChildren(f).has("CastNoticeLine")),
      "nothing renders <CastNoticeLine/> any more — either the cast-feedback contract above is " +
        "stale (delete it, and say why in the commit) or the component was silently dropped",
    ).toBe(true);
    expect(hudImports.size, "ui/HudRoot.tsx imports nothing — path wrong?").toBeGreaterThan(5);
    expect(
      TSX.some((f) => f !== LOADING_OVERLAY && jsxChildren(f).has("MatchLoadingOverlay")),
      "<MatchLoadingOverlay/> is mounted nowhere — the #74 handoff exists but never renders, " +
        "which makes the match-entry contract vacuous",
    ).toBe(true);
    expect(CONTRACTS.length).toBe(3);
  });

  it("NO UNLISTED surface is missing a ubiquitous component", () => {
    cover("ubiquitous-surface-parity");
    const unlisted = violations().filter((v) => !(v.key in KNOWN_GAPS));
    expect(
      unlisted.map((v) => `\n  • [${v.key}] ${v.detail}`).join("") + (unlisted.length ? HOW_TO_FIX : ""),
      "S9 — a component that is supposed to be everywhere is missing from a surface",
    ).toBe("");
  });

  it("every KNOWN_GAP is still a gap (fixed one? delete its row)", () => {
    cover("ubiquitous-surface-parity");
    const live = new Set(violations().map((v) => v.key));
    const stale = Object.keys(KNOWN_GAPS).filter((k) => !live.has(k));
    expect(
      stale.join(", "),
      "These KNOWN_GAPS rows no longer describe a real gap — most likely you just FIXED them. " +
        "Delete the rows from KNOWN_GAPS in this file so the surface is guarded from now on. " +
        "(A stale allow-list is how the next instance of this shape hides.)",
    ).toBe("");
  });

  it("no component claims ubiquity in its docblock without a contract to back it", () => {
    cover("ubiquitous-surface-parity");
    // The claim side, derived: if a component's OWN header says it is on every
    // screen, something must actually put it on every screen. This is the part
    // that catches the NEXT global component — nobody has to remember to
    // register it, because its docblock already made the promise.
    const CLAIM =
      /EVERY (screen|page|render tree|view|surface)|every (screen|page|render tree)|all screens|所有畫面|每一?個畫面/;
    const chromeMembers = new Set(
      [...jsxChildren(GLOBAL_CHROME)].filter((n) => imports(GLOBAL_CHROME).has(n)),
    );
    const contracted = new Set<string>(CONTRACTS.map((c) => c.what));

    const undischarged: string[] = [];
    for (const f of TSX) {
      if (!CLAIM.test(header(f))) continue;
      const r = rel(f);
      const name = r.split("/").pop()!.replace(/\.tsx$/, "");
      if (f === GLOBAL_CHROME) continue; // the registry itself
      if (chromeMembers.has(name)) continue; // delivered by GlobalChrome
      if (contracted.has(name)) continue; // has a contract above
      if (r in CLAIM_EXEMPTIONS) continue; // explicitly, reasonedly, not global
      undischarged.push(`\n  • ${r} — its header claims ubiquity, but nothing enforces it.`);
    }
    expect(
      undischarged.join("") + (undischarged.length ? HOW_TO_FIX : ""),
      "a docblock promises a component is on every screen and no mechanism delivers it",
    ).toBe("");
  });
});

/**
 * WHAT THIS DELIBERATELY DOES NOT CATCH — so the next reader does not mistake a
 * green run for proof of something it never checked:
 *
 *  • RUNTIME absence. Everything here is static structure. A component that is
 *    mounted on every surface and then returns null for the wrong reason, or is
 *    painted under another panel, is invisible to this test (that is #107's
 *    safe-area guard and the per-component unit tests).
 *  • NON-BOOLEAN branches. HUD variant families are derived from boolean atoms
 *    (`{touch && …}` / `{!touch && …}`). A surface selected by
 *    `{mode === "vr" && <VrControls/>}` is NOT treated as a variant family,
 *    because equality branches are usually phases (champSelect / intermission /
 *    matchEnd), where demanding parity would be wrong. A new *input surface*
 *    chosen by a string discriminant would slip through — extend
 *    `hudVariantFamilies` when one appears.
 *  • Surfaces outside the client bundle. The admin console (`apps/admin`) and the
 *    static audition pages have their own roots and are not scanned here.
 *  • Conditional mounts INSIDE a surface. If TouchControls rendered
 *    `{isLandscape && <CastNoticeLine/>}` this test would call it present.
 *  • Whether a global component is USEFUL on a surface. It only checks presence;
 *    "the replay page should not play lobby BGM" is a judgement call and lives
 *    as prose in ui/GlobalChrome.tsx's own "deliberately not here" list.
 */
