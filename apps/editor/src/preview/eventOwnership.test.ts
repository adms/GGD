import { describe, expect, it } from "vitest";
import {
  abilityIdOfEventOrigin,
  currentPlayerCanResolveEventOrigin,
  eventOriginBelongsToAbility,
} from "./eventOwnership";

describe("VFX event provenance ownership", () => {
  it("resolves direct, passive-hook and buff-hook origins without substring guesses", () => {
    expect(abilityIdOfEventOrigin("ability:godie-hart.r")).toBe("godie-hart.r");
    expect(abilityIdOfEventOrigin("hook:abilityPassive:godie-e002.ex")).toBe("godie-e002.ex");
    expect(abilityIdOfEventOrigin("hook:buff:ability:godie-e002.r#20")).toBe("godie-e002.r");
    expect(eventOriginBelongsToAbility("hook:abilityPassive:godie-e002.ex", "godie-e002.e")).toBe(false);
    expect(abilityIdOfEventOrigin("item:godie-e002.ex")).toBeNull();
  });

  it("keeps the current player limitation explicit until GH#885 fixes main", () => {
    expect(currentPlayerCanResolveEventOrigin("ability:godie-hart.r")).toBe(true);
    expect(currentPlayerCanResolveEventOrigin("hook:abilityPassive:godie-e002.ex")).toBe(false);
  });
});
