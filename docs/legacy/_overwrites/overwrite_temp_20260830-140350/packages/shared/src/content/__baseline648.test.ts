import { describe, it } from "vitest";
import { abilityQuantities } from "/Users/Takuro/GGD/packages/shared/src/content/abilityProse";

describe("baseline", () => {
  it("probe", () => {
    const p = abilityQuantities({
      effects: [{ kind: "damage", damageType: "magic", amount: { flat: 100, mult: 0.5 } }],
    });
    console.log("FLAT+MULT:", JSON.stringify(p.dmg));
    const q = abilityQuantities({
      effects: [{ kind: "damage", damageType: "magic", amount: { perRank: [100, 200], mult: 0.5 } }],
    });
    console.log("PERRANK+MULT:", JSON.stringify(q.dmg));
    const r = abilityQuantities({
      effects: [{ kind: "damage", damageType: "magic", amount: { flat: 100 } }],
    });
    console.log("NO MULT:", JSON.stringify(r.dmg));
  });
});
