/**
 * roundReportMount.test.ts — #265's MISSING half.
 *
 * The adversarial pass on #265 replaced BOTH `<RoundReportCard />` JSX lines in
 * MerchantShop.tsx with `{null}` — deleting the entire feature from the render
 * tree — and the full client suite reported
 *
 *     Test Files 302 passed (302) · Tests 3566 passed | 1 skipped (3567)
 *
 * byte-identical to the numbers #265 cited as its own gate. Its three test files
 * (roundReport / roundReportLayout / draftA11y) only drive pure modules; nothing
 * anywhere in the repo asserted the component is imported, mounted, or reachable.
 *
 * That is this project's most expensive failure mode, and #265 was the EIGHTH
 * instance: #93 fireworks under the floor · #247 jumps off-frame · 蒼月潮's
 * uncomputable combo · a lobby announcement with no reader · #259's voice
 * distance model that was computed and then never became volume · #221's
 * auto-acquire proven on a championId that isn't in the registry · #73's
 * absence-shaped assertion for an absence-shaped defect.
 *
 * So this file asserts the SEAM, not the arithmetic: the card is imported, and
 * it is rendered from BOTH shop branches (collapsed rail and open card). The
 * shop card can be toggled shut by the player — a report that only mounts in the
 * open branch disappears the moment they collapse it, which is exactly when they
 * have the most screen to read it in.
 *
 * Source-scan rather than render: MerchantShop pulls the whole HUD store graph
 * and a Babylon-backed portrait, so mounting it here would test the harness. The
 * scan is deliberately narrow — it fails when the JSX is gone, which is the one
 * regression it exists to catch.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SHOP = join(__dirname, "MerchantShop.tsx");
const src = readFileSync(SHOP, "utf8");

describe("#265 the round report must actually be in the render tree", () => {
  it("MerchantShop imports RoundReportCard", () => {
    expect(src).toMatch(/import\s*\{\s*RoundReportCard\s*\}\s*from\s*"\.\/RoundReportCard"/);
  });

  it("renders <RoundReportCard /> from BOTH shop branches, not just the open one", () => {
    const mounts = src.match(/<RoundReportCard\s*\/>/g) ?? [];
    expect(
      mounts.length,
      `MerchantShop.tsx renders <RoundReportCard /> ${mounts.length} time(s); ` +
        `both the collapsed rail and the open card must mount it, or the report ` +
        `vanishes when the player closes the shop.`,
    ).toBe(2);
  });

  it("the mounts are live JSX — not commented out, not behind {false}", () => {
    for (const line of src.split("\n")) {
      if (!line.includes("<RoundReportCard")) continue;
      const trimmed = line.trim();
      expect(trimmed.startsWith("//"), `commented-out mount: ${trimmed}`).toBe(false);
      expect(trimmed.startsWith("*"), `mount inside a block comment: ${trimmed}`).toBe(false);
      expect(/\{\s*false\s*&&/.test(line), `mount gated off: ${trimmed}`).toBe(false);
    }
  });

  it("MerchantShop itself is still mounted by HudRoot", () => {
    // One level up the same chain: if the shop stops rendering, so does the
    // report, and the two guards above would still pass.
    const hud = readFileSync(join(__dirname, "..", "HudRoot.tsx"), "utf8");
    expect(hud).toMatch(/<MerchantShop\s*\/>/);
  });
});
