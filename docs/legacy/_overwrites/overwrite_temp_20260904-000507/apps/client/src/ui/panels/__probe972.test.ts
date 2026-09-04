import { describe, expect, it } from "vitest";
import { statPathReadout } from "/Users/Takuro/GGD/apps/client/src/ui/panels/statPathReadout";
describe("probe", () => {
  it("shape", () => {
    const r = statPathReadout({ stacks: 3, capstonePct: 0 });
    // eslint-disable-next-line no-console
    console.log("KEYS=", Object.keys(r), "VIEW=", JSON.stringify(r.view), "PROG=", r.progress);
    expect(r.view).toBeDefined();
  });
});
