import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "vitest";
import { abilityQuantities } from "./abilityProse";
describe("probe", () => {
  it("shipped mult ability", () => {
    for (const f of ["godie-nbbc.r.json", "godie-n01c.r.json"]) {
      const d = JSON.parse(
        readFileSync(join(__dirname, "../../../..", "content/abilities", f), "utf-8"),
      );
      console.log(f, "dmg =", JSON.stringify(abilityQuantities(d).dmg));
    }
  });
});
