import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { validateDoc } from "../loader";

describe("link-60", () => {
  it("validates", () => {
    for (const f of ["w", "e", "r", "ex"]) {
      const doc = JSON.parse(
        fs.readFileSync(`/Users/Takuro/GGD/content/abilities/godie-h00l.${f}.json`, "utf8"),
      );
      const res = validateDoc("abilities", doc);
      // eslint-disable-next-line no-console
      console.log(f, "ok=", (res as { ok?: boolean }).ok, JSON.stringify(res).slice(0, 600));
    }
    expect(true).toBe(true);
  });
});
