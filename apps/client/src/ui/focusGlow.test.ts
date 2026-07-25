/**
 * GUARD + unit test for the ONE shared focus glow (task #222).
 *
 * WHAT WENT WRONG, AND WHY A SOURCE SCAN IS THE RIGHT SHAPE. The pad focus ring
 * was an `outline` + outer box-shadows injected from a JS template literal in
 * ui/PadFocusNav. `.ggd-btn` carries `clip-path` for its notched silhouette, and
 * clip-path clips outlines and OUTER shadows — so on essentially every control
 * in the app the ring rendered as nothing at all. Nothing failed. No test could
 * fail: the CSS was a string inside a component, invisible to every stylesheet
 * scan in the repo.
 *
 * So the fix is a real stylesheet, and the guard checks the things that would
 * silently undo it again. BOTH SIDES OF EVERY COMPARISON ARE DERIVED FROM THE
 * SOURCE — the palette check reads buttonFx.css's own accents, the
 * focus-vs-hover check reads both files' real numbers, the driver check derives
 * "who moves pad focus" from the imports. Nothing here is a hard-coded restating
 * of the current values, so an edit that guts the glow fails instead of passing.
 *
 * The client's vitest env is `node` with no DOM (see vite.config.ts), which is
 * also why the applyPadFocus/clearPadFocus unit test injects a fake document —
 * the same idiom ui/buttonSfx.test.ts uses.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { PAD_FOCUS_ATTR, applyPadFocus, clearPadFocus } from "./focusGlow";

const UI_DIR = fileURLToPath(new URL(".", import.meta.url)); // apps/client/src/ui/
const SRC_DIR = resolve(UI_DIR, "..");
const rel = (p: string): string => relative(SRC_DIR, p).split(sep).join("/");

const GLOW_CSS_FILE = join(UI_DIR, "focusGlow.css");
const GLOW_TS_FILE = join(UI_DIR, "focusGlow.ts");

// --------------------------------------------------------------- source io --

/** Comments stripped: prose ABOUT a rule must never satisfy a check for it. */
const stripCss = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, " ");
const stripTs = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

const read = (f: string): string => readFileSync(f, "utf8");
const GLOW_CSS = stripCss(read(GLOW_CSS_FILE));
const BTN_CSS = stripCss(read(join(UI_DIR, "buttonFx.css")));

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|css)$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}
const SOURCES = walk(SRC_DIR);

// ---------------------------------------------------------------- css i/o ---

type Rule = { sel: string; body: string };

/**
 * Flat rule list. Nested at-rule bodies (`@media`, `@keyframes`) contribute
 * their INNER rules with clean selectors — the wrapper itself never matches,
 * because a selector may not contain braces. That is exactly what we want: the
 * pairing contract below applies inside `@media` too.
 */
function rules(css: string): Rule[] {
  const out: Rule[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (let m = re.exec(css); m; m = re.exec(css)) out.push({ sel: m[1]!.trim(), body: m[2]! });
  return out;
}

/** The brace-matched body of an at-rule, header included. */
function atRule(css: string, header: string): string {
  const at = css.indexOf(header);
  if (at < 0) return "";
  const open = css.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(at, i + 1);
  }
  return "";
}

const REDUCED_MOTION = atRule(GLOW_CSS, "@media (prefers-reduced-motion: reduce)");
/** everything OUTSIDE the reduced-motion block — the normal-motion contract */
const GLOW_FULL_MOTION = GLOW_CSS.replace(REDUCED_MOTION, " ");

const num = (body: string, prop: string): number | null => {
  const m = new RegExp(`(?:^|;|\\s)${prop}:\\s*([\\d.]+)px`).exec(body);
  return m ? Number(m[1]) : null;
};
/** seconds from an `animation:` shorthand or an `animation-duration:` */
const secs = (body: string): number | null => {
  const m = /animation(?:-duration)?:[^;]*?([\d.]+)s/.exec(body);
  return m ? Number(m[1]) : null;
};
const find = (rs: Rule[], pred: (r: Rule) => boolean): Rule | undefined => rs.find(pred);

const PAD_SEL = `[${PAD_FOCUS_ATTR}]`;
const glowRules = rules(GLOW_FULL_MOTION);
/** the Tier-2 band rule: the .ggd-btn ::before override, not subdued, not disabled */
const bandRule = find(
  glowRules,
  (r) =>
    r.sel.includes(`.ggd-btn${PAD_SEL}::before`) &&
    !r.sel.includes("--subdued") &&
    !r.sel.includes(":disabled"),
);

// ------------------------------------------------------------- exemptions ---

/**
 * The ONLY files outside focusGlow.* allowed to speak the focus vocabulary.
 * Asserted BOTH WAYS (the KNOWN_GAPS ratchet convention from
 * ui/surfaceParity.test.ts): an unlisted offender fails, and a listed file that
 * no longer offends ALSO fails — "you removed it, delete the row". A stale
 * allow-list is how the next copy-pasted ring would hide.
 */
const FOCUS_STYLE_EXEMPTIONS: Record<string, string> = {
  // Pre-dates #222 and is a different control class: the <input type=range>
  // audio sliders in the top cluster, where the shared glow's inset rim would
  // paint over the track. Left alone deliberately; it is strictly additional
  // focus styling, not a competing ring.
  "ui/mobile.css": "the .ggd-audio-range slider's own :focus-visible (task #54), a range track",
};

const HOW_TO_FIX =
  "\nDo NOT add a bespoke focus style. Import ./focusGlow (applyPadFocus / " +
  "PAD_FOCUS_ATTR) and let ui/focusGlow.css paint it — that file is the ONE " +
  "focus treatment. If a control genuinely needs its own, add a row to " +
  "FOCUS_STYLE_EXEMPTIONS in this file WITH A REASON.";

// ------------------------------------------------------------------ specs ---

describe("#222 shared focus glow — the stylesheet contract", () => {
  it("focusGlow.css is imported exactly once, from main.tsx, AFTER buttonFx.css", () => {
    const importRe = /import\s+["'][^"']*focusGlow\.css["']/;
    const importers = SOURCES.filter((f) => importRe.test(read(f)));
    expect(importers.map(rel), "focusGlow.css must have exactly one importer").toHaveLength(1);
    expect(rel(importers[0]!)).toBe("main.tsx");

    const main = stripTs(read(importers[0]!));
    const btnAt = main.search(/import\s+["'][^"']*buttonFx\.css["']/);
    const glowAt = main.search(importRe);
    expect(btnAt, "main.tsx no longer imports buttonFx.css").toBeGreaterThanOrEqual(0);
    expect(
      glowAt,
      "focusGlow.css must be imported AFTER buttonFx.css — the Tier-2 overrides tie with " +
        "`.ggd-btn:hover::before` on specificity and win only on source order. Swap them and " +
        "the focus band silently loses to hover.",
    ).toBeGreaterThan(btnAt);
  });

  it("every focus rule is PAIRED: pad attribute and :focus-visible, never one alone", () => {
    const all = rules(GLOW_CSS);
    const focusRules = all.filter(
      (r) => r.sel.includes(PAD_SEL) || r.sel.includes(":focus-visible"),
    );
    expect(
      focusRules.length,
      "no focus rule found in focusGlow.css — the CSS scan is broken, not clean",
    ).toBeGreaterThanOrEqual(5);
    const unpaired = focusRules
      .filter((r) => !(r.sel.includes(PAD_SEL) && r.sel.includes(":focus-visible")))
      .map((r) => `\n  • ${r.sel.replace(/\s+/g, " ")}`);
    expect(
      unpaired.join(""),
      "a rule styles the gamepad state without the keyboard state (or vice versa). The pad " +
        "needs the explicit attribute (`:focus-visible` on a programmatic .focus() is a browser " +
        "heuristic keyed on input MODALITY, and a gamepad is not one); the keyboard needs " +
        ":focus-visible. Declaring them in ONE block is what keeps them identical.",
    ).toBe("");
  });

  it("reduced motion keeps the glow VISIBLE — it only stops moving", () => {
    expect(REDUCED_MOTION, "focusGlow.css has no prefers-reduced-motion block").not.toBe("");
    expect(REDUCED_MOTION).toMatch(/animation:\s*none/);
    // a frozen PEAK, not a removal: the rim/halo must still be painted
    expect(
      /box-shadow:/.test(REDUCED_MOTION),
      "the reduced-motion block must still paint the inset rim + halo (the frozen peak of the " +
        "pulse), otherwise the whole cue is motion-dependent",
    ).toBe(true);
    for (const killer of [/display:\s*none/, /opacity:\s*0(?![.\d])/]) {
      expect(
        killer.test(REDUCED_MOTION),
        `the reduced-motion block must not hide anything (${killer}). A user who asks for less ` +
          "motion must still SEE what the gamepad has selected — that is the whole point of #222.",
      ).toBe(false);
    }
    // and the band keeps its full thickness there
    const rmBand = find(rules(REDUCED_MOTION), (r) => r.sel.includes(`.ggd-btn${PAD_SEL}::before`));
    expect(rmBand, "reduced motion does not mention the .ggd-btn focus band").toBeTruthy();
    expect(num(rmBand!.body, "padding")).toBe(num(bandRule!.body, "padding"));
  });

  it("uses the #24 accent palette (native, not bolted on)", () => {
    const hexes = (s: string): Set<string> =>
      new Set([...s.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((m) => m[0]!.toLowerCase()));
    const mine = hexes(GLOW_CSS);
    const theirs = hexes(BTN_CSS);
    // the one colour focus may own alone: a white-hot glint that exists in no
    // other state (buttonFx spells white as rgba(), so it is not in `theirs`).
    const ALLOW = new Set(["#fff", "#ffffff"]);
    expect(mine.size, "focusGlow.css declares no colours at all").toBeGreaterThanOrEqual(3);
    const foreign = [...mine].filter((h) => !theirs.has(h) && !ALLOW.has(h));
    expect(
      foreign.join(", "),
      "focus must reuse the button redesign's own accents (ui/buttonFx.css) so it reads as part " +
        "of the game's cyber-JRPG language. The colour(s) above appear nowhere in it — that is " +
        "how the old ring ended up a generic blue that belonged to nothing.",
    ).toBe("");
  });

  it("focus outranks hover on THICKNESS and on SPEED (hover is not a focus cue)", () => {
    const btn = rules(BTN_CSS);
    const idle = find(btn, (r) => r.sel === ".ggd-btn::before");
    const hover = find(btn, (r) => r.sel === ".ggd-btn:hover::before");
    expect(idle, "ui/buttonFx.css no longer defines .ggd-btn::before").toBeTruthy();
    expect(hover, "ui/buttonFx.css no longer defines .ggd-btn:hover::before").toBeTruthy();
    expect(bandRule, "focusGlow.css defines no .ggd-btn focus band").toBeTruthy();

    const base = num(idle!.body, "padding");
    const focus = num(bandRule!.body, "padding");
    expect(base).toBeGreaterThan(0);
    expect(
      focus!,
      `the focus band (${focus}px) must be visibly THICKER than the idle/hover trim (${base}px) — ` +
        "hover already brightens that trim, so thickness is one of the axes that says 'focus'",
    ).toBeGreaterThan(base!);

    const [idleS, hoverS, focusS] = [secs(idle!.body), secs(hover!.body), secs(bandRule!.body)];
    expect([idleS, hoverS, focusS].every((s) => typeof s === "number")).toBe(true);
    expect(
      focusS!,
      `focus (${focusS}s) must animate FASTER than hover (${hoverS}s), which is itself faster ` +
        "than idle — a three-step ladder, so a focused-and-hovered control still reads as focused",
    ).toBeLessThan(hoverS!);
    expect(hoverS!).toBeLessThan(idleS!);
  });

  it("an inert control never wears the focus glow", () => {
    const guards = glowRules.filter((r) => /:disabled|\[disabled\]/.test(r.sel));
    expect(
      guards.length,
      "focusGlow.css has no :disabled guard. It is source-LATER than buttonFx.css's :disabled " +
        "rules at equal specificity, so without an explicit guard the glow wins the tie and an " +
        "inert button lights up as 'press me'.",
    ).toBeGreaterThanOrEqual(1);
    expect(guards.some((r) => /animation:\s*none/.test(r.body))).toBe(true);
  });
});

describe("#222 shared focus glow — nothing else may grow its own", () => {
  it("no file outside focusGlow.* styles or names the focus state", () => {
    const offenders = new Map<string, string[]>();
    for (const f of SOURCES) {
      if (f === GLOW_CSS_FILE || f === GLOW_TS_FILE) continue;
      const src = f.endsWith(".css") ? stripCss(read(f)) : stripTs(read(f));
      const hits: string[] = [];
      if (src.includes(PAD_FOCUS_ATTR)) hits.push(`writes the literal "${PAD_FOCUS_ATTR}"`);
      if (src.includes(":focus-visible")) hits.push("declares its own :focus-visible styling");
      if (hits.length) offenders.set(rel(f), hits);
    }
    const unlisted = [...offenders]
      .filter(([f]) => !(f in FOCUS_STYLE_EXEMPTIONS))
      .map(([f, h]) => `\n  • ${f} — ${h.join("; ")}`);
    expect(unlisted.join("") + (unlisted.length ? HOW_TO_FIX : ""), "focus styling has forked").toBe(
      "",
    );

    const stale = Object.keys(FOCUS_STYLE_EXEMPTIONS).filter((f) => !offenders.has(f));
    expect(
      stale.join(", "),
      "these FOCUS_STYLE_EXEMPTIONS rows no longer describe anything — most likely the bespoke " +
        "focus style is gone. Delete the rows so the file is guarded from now on.",
    ).toBe("");
  });

  it("every gamepad DRIVER that moves DOM focus uses the shared glow", () => {
    // derived, not listed: a file that reads a pad AND moves focus is a driver,
    // whatever it is called and whenever it is added.
    const drivers = SOURCES.filter((f) => {
      if (f.endsWith(".css")) return false;
      const src = stripTs(read(f));
      return /startGamepadFocus|listPadSources|padFocusNav/.test(src) && /\.focus\(/.test(src);
    });
    expect(
      drivers.length,
      "no gamepad focus driver found — the driver scan is broken, not clean",
    ).toBeGreaterThanOrEqual(2);
    const bare = drivers
      .filter((f) => !/from\s+["'][^"']*\/focusGlow["']/.test(stripTs(read(f))))
      .map((f) => `\n  • ${rel(f)} moves DOM focus from a gamepad but imports nothing from ./focusGlow`);
    expect(bare.join("") + (bare.length ? HOW_TO_FIX : ""), "a pad surface with no glow").toBe("");
  });

  it("PadFocusNav is GLOBAL CHROME, so every render tree gets pad navigation", () => {
    // ui/surfaceParity.test.ts then enforces the per-surface half for free: it
    // requires every `.render(<X/>)` tree to render <GlobalChrome/>, and fails
    // any tree that hand-mounts a chrome member instead.
    const chrome = stripTs(read(join(UI_DIR, "GlobalChrome.tsx")));
    expect(chrome).toMatch(/import\s*\{[^}]*\bPadFocusNav\b[^}]*\}\s*from/);
    expect(chrome).toContain("<PadFocusNav />");
    const appRoot = stripTs(read(join(UI_DIR, "platform/AppRoot.tsx")));
    expect(
      appRoot.includes("<PadFocusNav"),
      "AppRoot must take PadFocusNav from <GlobalChrome/>, not hand-mount it — hand-mounting is " +
        "exactly what left the replay tree without it (and surfaceParity.test.ts fails on it).",
    ).toBe(false);
  });
});

// ------------------------------------------------------------- pure helper --

type FakeEl = { attrs: Record<string, string> };
const fakeEl = (): FakeEl => ({ attrs: {} });
function el(f: FakeEl): Element {
  return {
    setAttribute: (k: string, v: string) => void (f.attrs[k] = v),
    removeAttribute: (k: string) => void delete f.attrs[k],
  } as unknown as Element;
}
function fakeDoc(...fs: FakeEl[]): Document {
  return {
    querySelectorAll: (sel: string) =>
      fs.filter((f) => (/^\[([^\]]+)\]$/.exec(sel)?.[1] ?? sel) in f.attrs).map(el),
  } as unknown as Document;
}

describe("#222 applyPadFocus / clearPadFocus (node env, injected document)", () => {
  it("marks exactly one element — the previous holder is always released", () => {
    const a = fakeEl();
    const b = fakeEl();
    const doc = fakeDoc(a, b);
    applyPadFocus(el(a), doc);
    expect(a.attrs[PAD_FOCUS_ATTR]).toBe("");
    applyPadFocus(el(b), doc);
    expect(b.attrs[PAD_FOCUS_ATTR]).toBe("");
    expect(PAD_FOCUS_ATTR in a.attrs, "two controls glowed at once — 'A presses THIS' is a lie").toBe(
      false,
    );
  });

  it("clearPadFocus releases every holder, and is idempotent", () => {
    const a = fakeEl();
    const doc = fakeDoc(a);
    applyPadFocus(el(a), doc);
    clearPadFocus(doc);
    clearPadFocus(doc);
    expect(PAD_FOCUS_ATTR in a.attrs).toBe(false);
  });

  it("a null target just clears (a driver whose focusable set vanished)", () => {
    const a = fakeEl();
    const doc = fakeDoc(a);
    applyPadFocus(el(a), doc);
    applyPadFocus(null, doc);
    expect(PAD_FOCUS_ATTR in a.attrs).toBe(false);
  });

  it("is a no-op with no DOM at all (SSR / node) rather than throwing", () => {
    expect(() => clearPadFocus()).not.toThrow();
    expect(() => applyPadFocus(null)).not.toThrow();
  });
});
