import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

describe("Skill Forge workspace layout", () => {
  it("uses every content column instead of collapsing into the document-list column", () => {
    const rule = styles.match(/\.forge-gallery,\s*\.forge-studio\s*\{([^}]+)\}/)?.[1] ?? "";

    expect(rule).toMatch(/grid-column:\s*2\s*\/\s*-1\s*;/);
    expect(rule).toMatch(/min-width:\s*0\s*;/);
    expect(rule).toMatch(/height:\s*100vh\s*;/);
  });
});
