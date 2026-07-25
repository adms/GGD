/**
 * abilityNameOnTile — the ability NAME is legible ON every desktop tile (#152).
 *
 * THE BUG THIS LOCKS OUT. Owner requirement: 「技能名稱要顯示在按鈕上」on ALL
 * platforms. On desktop the tile's icon is `<IconImg fill>`, which resolves to
 * `position:absolute; inset:0; width/height:100%` (components/IconImg.tsx). An
 * absolutely-positioned, inset:0 element paints over anything that came BEFORE
 * it in the DOM — so a name div rendered in normal flow ahead of the icon is
 * invisible whenever the icon resolves (the common case), and only ever shows
 * when the icon 404s. The name was effectively never on the button.
 *
 * THE INVARIANT. The name must be rendered AFTER `<IconImg fill>` in the DOM,
 * on its own absolutely-positioned bottom scrim, so it paints ON TOP of the art
 * on all six tiles — the innate (天生技), the four Q/W/E/R actives, and the EX.
 * The touch bar (ui/TouchControls.tsx) already shows the name and renders no
 * icon, so this scan is desktop-only, over components/AbilityBar.tsx.
 *
 * Like abilityBarOrder.test.ts, this asserts the SOURCE: there is no rendered
 * DOM to measure here, and the failure mode (z-order by DOM position under an
 * absolute overlay) is exactly the kind a unit render would not catch without a
 * real layout engine. So we read the file, strip comments so prose can't
 * satisfy a scan, and assert the ORDER of the two anchors in each tile block.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";

/** Source with comments stripped, so prose about the fix cannot satisfy a scan. */
function readSource(rel: string): string {
  return readFileSync(join(__dirname, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

const BAR = readSource("AbilityBar.tsx");

/** The three tile blocks, sliced on the same anchors abilityBarOrder uses. */
function innateBlock(): string {
  const start = BAR.indexOf('data-slot-key="PASSIVE"');
  const end = BAR.indexOf("SLOTS.map(");
  expect(start, "no innate tile").toBeGreaterThanOrEqual(0);
  expect(end, "no SLOTS.map").toBeGreaterThan(start);
  return BAR.slice(start, end);
}
function coreBlock(): string {
  const start = BAR.indexOf("SLOTS.map(");
  const end = BAR.indexOf('data-slot-key="EX"');
  expect(start, "no SLOTS.map").toBeGreaterThanOrEqual(0);
  expect(end, "no EX tile").toBeGreaterThan(start);
  return BAR.slice(start, end);
}
function exBlock(): string {
  const start = BAR.indexOf('data-slot-key="EX"');
  expect(start, "no EX tile").toBeGreaterThanOrEqual(0);
  return BAR.slice(start);
}

describe("the ability name is painted ON the button, not under the icon (#152)", () => {
  it("has a TileName overlay that is an absolute bottom strip with a scrim", () => {
    cover("ability-bar-order");
    // The component the three tiles share. It must be positioned so it can
    // overlay the icon (absolute, pinned to the tile's bottom) and carry a dark
    // background so the text stays legible over a bright icon.
    const at = BAR.indexOf("function TileName");
    expect(at, "AbilityBar has no TileName overlay component").toBeGreaterThanOrEqual(0);
    const body = BAR.slice(at, at + 900);
    expect(body).toContain('position: "absolute"');
    expect(body).toContain("bottom: 0");
    // a scrim behind the text — without it the name is illegible over a light icon
    expect(body).toMatch(/background:\s*["'`][^"'`]*rgba/);
  });

  for (const [name, block, icon, label] of [
    ["innate 天生技", innateBlock, "iconSrc(innate.icon)", "innate.displayName"],
    ["Q/W/E/R actives", coreBlock, "iconSrc(ability.icon)", "stripAbilityNumber(ability.name)"],
    ["EX", exBlock, "iconSrc(ex.icon)", "stripAbilityNumber(ex.name)"],
  ] as const) {
    it(`renders the ${name} name AFTER its <IconImg fill> so it is not occluded`, () => {
      cover("ability-bar-order");
      const b = block();
      const iconAt = b.indexOf(icon);
      const nameAt = b.indexOf("<TileName");
      expect(iconAt, `${name}: no IconImg for ${icon}`).toBeGreaterThanOrEqual(0);
      expect(nameAt, `${name}: no <TileName> caption`).toBeGreaterThanOrEqual(0);
      // The whole point: the name element comes LATER in the DOM than the
      // absolute, inset:0 icon, so it paints on top of it instead of under it.
      expect(nameAt, `${name}: name must come after the icon in the DOM`).toBeGreaterThan(iconAt);
      // and it really is the ability's name that the caption shows
      expect(b, `${name}: caption is not wired to the ability name`).toContain(label);
    });
  }

  it("keeps no in-flow name div BEFORE the icon on any tile (the old bug)", () => {
    cover("ability-bar-order");
    // The pre-fix shape was a `whiteSpace: "nowrap"` name div sitting ahead of
    // <IconImg fill>. Each tile now has exactly one name element (the TileName
    // overlay) and it is the one after the icon, proven above. Guard the count
    // so a stray in-flow copy cannot creep back beside the overlay.
    for (const [name, block, label] of [
      ["innate", innateBlock, "innate.displayName"],
      ["core", coreBlock, "stripAbilityNumber(ability.name)"],
      ["ex", exBlock, "stripAbilityNumber(ex.name)"],
    ] as const) {
      const b = block();
      const occurrences = b.split(label).length - 1;
      expect(occurrences, `${name}: the ability name is printed more than once`).toBe(1);
    }
  });
});
