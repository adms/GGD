/**
 * cooldownChrome — every HUD surface paints the SAME cooldown language (#219).
 *
 * THE "SECOND SURFACE" TRAP. HudRoot mounts three mutually-exclusive ability
 * HUDs — the desktop `AbilityBar`, the touch `TouchControls`, the couch
 * `CouchHudGrid` — and each one carried its OWN inline copy of the cooldown
 * maths and its own overlay markup. Five copies of three lines. That is how the
 * touch EX and touch 天生技 tiles ended up drawing the dark rect with NO NUMBER
 * at all, how the couch chip ended up with NO progress fill at all, and how all
 * of them ended up dividing by the AUTHORED cooldown instead of the ENV-SCALED
 * one (see ui/cooldownView for that root cause).
 *
 * So this scan does not hard-code three filenames. It DERIVES the surface list
 * from HudRoot's own imports — any file HudRoot mounts that reads
 * `seat.cooldowns` is an ability surface and owes the whole contract. A fourth
 * HUD variant joins with no edit here, exactly as ui/surfaceParity.test.ts
 * derives its surfaces rather than listing them.
 *
 * SOURCE-LEVEL, like every other UI test in this client: the vitest env is
 * `node` with no DOM, and the failure being guarded ("this surface renders
 * different chrome from that one") is structural. Comments are stripped first
 * so prose about the fix can never satisfy a check.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";

const SRC = fileURLToPath(new URL("../../", import.meta.url)); // apps/client/src/

/** Source with comments stripped, so a docblock cannot satisfy a scan. */
function readSource(abs: string): string {
  return readFileSync(abs, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

/** Resolve every relative import of a file to an absolute path. */
function localImports(abs: string): string[] {
  const out: string[] = [];
  const re = /import\s+(?:type\s+)?(?:\{[^}]*\}|\w+)\s+from\s+["']([^"']+)["']/g;
  const src = readSource(abs);
  for (let m = re.exec(src); m; m = re.exec(src)) {
    const spec = m[1]!;
    if (!spec.startsWith(".")) continue;
    const base = resolve(dirname(abs), spec);
    const hit = [base + ".tsx", base + ".ts", base + "/index.tsx", base + "/index.ts"].find((c) =>
      existsSync(c),
    );
    if (hit) out.push(hit);
  }
  return out;
}

const HUD_ROOT = join(SRC, "ui/HudRoot.tsx");

/**
 * THE DERIVED SURFACE SET: everything HudRoot mounts that reads a seat's
 * cooldown ticks off the wire. That is the definition of "a surface that shows
 * cooldowns", and it cannot go stale.
 */
/**
 * ⚠️ 讀 `seat.cooldowns` 但**不畫冷卻**的面板。
 *
 * `StatsHoverPanel`（2026-08-03，owner「右下角懸停顯示全屬性」）讀那格只為了顯示
 * 技能的**冷卻長度** —— 一個靜態秒數，而且已經走
 * `displayFinalText(r.cooldownSec, "cooldown", { env })` 做過 env 縮放。它**沒有**
 * 會動的剩餘時間、沒有技能格、沒有掃描圈。把它當成冷卻介面的話，這條守衛會要求它
 * import `cooldownView`（一個算「還剩幾秒」的純函式），而那個概念在它身上不存在。
 *
 * 這一列是**豁免不是修好**：加進來要寫清楚為什麼，而且下面「三個變體」那條斷言
 * 仍然在守這個掃描不會變成空的。
 */
const NOT_A_COOLDOWN_SURFACE = ["ui/hud/StatsHoverPanel.tsx"];

const SURFACES = localImports(HUD_ROOT).filter(
  (f) =>
    f.endsWith(".tsx") &&
    /\.cooldowns\b/.test(readSource(f)) &&
    !NOT_A_COOLDOWN_SURFACE.some((x) => f.endsWith(x)),
);

/**
 * How many ability TILES a surface renders, counted from the `data-*-slot`
 * attribute it tags them with. Anchored on the leading whitespace of a JSX
 * attribute so the rAF loops' `"[data-touch-slot=…]"` query strings do not
 * inflate the count.
 */
function tileCount(src: string): number {
  const keyed = src.match(/\sdata-slot-key=/g)?.length ?? 0;
  const touched = src.match(/\sdata-touch-slot=/g)?.length ?? 0;
  return keyed + touched;
}

const COOLDOWN_VIEW = join(SRC, "ui/cooldownView.ts");
const CHROME = join(SRC, "ui/components/CooldownChrome.tsx");
const COOLDOWN_CSS = join(SRC, "ui/cooldown.css");
const MAIN = join(SRC, "main.tsx");

/** The rect the whole pre-#219 cooldown language was made of. */
const OLD_RECT = "rgba(8, 10, 16, 0.78)";

const short = (abs: string): string => abs.slice(SRC.length);

describe("every ability HUD surface speaks ONE cooldown language (cooldown-legibility)", () => {
  it("the surface scan finds all three HUD variants (a vacuous scan passes forever)", () => {
    cover("cooldown-legibility");
    const names = SURFACES.map(short).sort();
    expect(names, "HudRoot no longer mounts three cooldown surfaces — scan broken?").toEqual([
      "ui/TouchControls.tsx",
      "ui/components/AbilityBar.tsx",
      "ui/components/CouchHudGrid.tsx",
    ]);
  });

  for (const surface of SURFACES) {
    const name = short(surface);

    it(`${name}: takes its cooldown read from the shared pure helper`, () => {
      cover("cooldown-legibility");
      const src = readSource(surface);
      expect(src, `${name} does not import cooldownView`).toMatch(/from\s+["'][^"']*cooldownView["']/);
      expect(src, `${name} does not call cooldownView(`).toContain("cooldownView(");
      // no surface may keep its own ticks→seconds copy beside the helper
      expect(src, `${name} still divides ticks by TICK_HZ inline`).not.toMatch(/\/\s*TICK_HZ/);
    });

    it(`${name}: divides by the ENV-SCALED cooldown, not the authored base (#219 root cause)`, () => {
      cover("cooldown-legibility");
      const src = readSource(surface);
      // the same seam the 冷卻 tooltip chip uses (#125) — the sim charges
      // `authored × combat-env.cooldown`, so an authored denominator caps the
      // progress fraction at that multiplier and hides the whole indicator
      expect(src, `${name} does not use displayFinal`).toContain("displayFinal(");
      expect(src, `${name} never routes a cooldown through the "cooldown" factor`).toMatch(
        /displayFinal\([^)]*"cooldown"/,
      );
      expect(src, `${name} does not read the live combat-env table`).toContain("useDisplayEnv(");
    });

    it(`${name}: renders the shared chrome on EVERY one of its ability tiles`, () => {
      cover("cooldown-legibility");
      const src = readSource(surface);
      const chrome = src.split("<CooldownChrome").length - 1;
      expect(chrome, `${name} renders no <CooldownChrome/>`).toBeGreaterThan(0);
      // TILE COUNT, derived from the attribute each surface tags its tiles with
      // — this is the check that would have caught the touch EX and touch 天生技
      // tiles shipping the rect with no countdown number at all. (The couch grid
      // tags no slots; its single mapped chip is covered by the check above.)
      const tiles = tileCount(src);
      if (tiles === 0) return;
      expect(chrome, `${name} has ${tiles} ability tiles but only ${chrome} cooldown overlays`).toBe(
        tiles,
      );
    });

    it(`${name}: the old bottom-anchored rect is gone`, () => {
      cover("cooldown-legibility");
      // it shared its exact geometry with the cast fill and lived inside the
      // ability-name scrim; leaving one copy behind is how surfaces drift
      expect(readSource(surface), `${name} still paints the pre-#219 sweep rect`).not.toContain(
        OLD_RECT,
      );
    });
  }

  it("no file anywhere still paints the pre-#219 sweep rect", () => {
    cover("cooldown-legibility");
    const leftovers = [...SURFACES, CHROME, COOLDOWN_VIEW].filter((f) =>
      readSource(f).includes(OLD_RECT),
    );
    expect(leftovers.map(short)).toEqual([]);
  });
});

describe("the shared chrome is legible and mounted (cooldown-legibility)", () => {
  it("the wipe is rotational and the number is shadowed + tabular", () => {
    cover("cooldown-legibility");
    const src = readSource(COOLDOWN_VIEW);
    expect(src, "cooldownWipeStyle is not a conic wipe").toMatch(
      /cooldownWipeStyle[\s\S]*?conic-gradient/,
    );
    expect(src, "cooldownNumberStyle carries no textShadow").toMatch(
      /cooldownNumberStyle[\s\S]*?textShadow/,
    );
    expect(src, "cooldownNumberStyle is not tabular").toMatch(
      /cooldownNumberStyle[\s\S]*?tabular-nums/,
    );
    // purity: the node-testable helper must not drag React/zustand in
    expect(src, "cooldownView imports displayFinal (React + RoomStore at module scope)").not.toMatch(
      /from\s+["'][^"']*displayFinal["']/,
    );
  });

  it("the chrome component renders wipe + number + ready bloom", () => {
    cover("cooldown-legibility");
    const src = readSource(CHROME);
    expect(src).toContain("cooldownWipeStyle(");
    expect(src).toContain("cooldownNumberStyle(");
    expect(src).toContain("cooldownReadyStyle(");
    expect(src, "the number is not rendered from the shared label").toContain("cd.label");
  });

  it("the ready-bloom keyframes exist and are imported by the app entry", () => {
    cover("cooldown-legibility");
    expect(existsSync(COOLDOWN_CSS), "ui/cooldown.css is missing").toBe(true);
    expect(readFileSync(COOLDOWN_CSS, "utf8")).toContain("@keyframes ggd-cd-ready");
    // an un-imported stylesheet is an animation that silently never plays
    expect(readSource(MAIN), "main.tsx does not import ui/cooldown.css").toMatch(
      /import\s+["']\.\/ui\/cooldown\.css["']/,
    );
  });

  it("the couch chip clips the wipe (rounded corners) instead of painting over it", () => {
    cover("cooldown-legibility");
    const couch = SURFACES.find((f) => /CouchHudGrid/.test(f))!;
    const src = readSource(couch);
    const at = src.indexOf("<CooldownChrome");
    expect(at, "couch chip renders no cooldown chrome").toBeGreaterThan(0);
    // the chip's own style object, immediately above the overlay it must clip
    const chip = src.slice(Math.max(0, at - 900), at);
    expect(chip, "the couch chip is not a positioned clipping parent").toContain(
      'position: "relative"',
    );
    expect(chip, "the couch chip does not clip — the wipe will square its corners").toContain(
      'overflow: "hidden"',
    );
  });
});
