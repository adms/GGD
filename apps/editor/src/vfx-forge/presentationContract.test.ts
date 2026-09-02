import { describe, expect, it } from "vitest";
import {
  PRESENTATION_RECEIPT,
  isSingleArcVfxId,
  readPresentationReceipt,
  replacementClaimsForScript,
  singleArcVfxId,
  unsupportedReplacementClaims,
} from "./presentationContract";
import type { VfxScriptDoc } from "@ggd/shared/content/schema/vfxScript";

function doc(segments: VfxScriptDoc["segments"]): VfxScriptDoc {
  return { id: "ability.test", schema: "vfx-script@1", abilityId: "ability.test", segments };
}

describe("Main presentation receipt", () => {
  it("consumes the generated pulse vocabulary and single-arc IDs", () => {
    expect(PRESENTATION_RECEIPT.actorPulses.vocabulary).toEqual([
      "attack", "cast", "hurt", "guard", "dodge",
    ]);
    expect(isSingleArcVfxId("fx.prim.holy.arc")).toBe(true);
    expect(singleArcVfxId("void")).toBe("fx.prim.void.arc");
    expect(isSingleArcVfxId("fx.prim.holy.slash")).toBe(false);
  });

  it("rejects a receipt whose pulse vocabulary drifted from the schema", () => {
    expect(() => readPresentationReceipt({
      ...PRESENTATION_RECEIPT,
      actorPulses: {
        ...PRESENTATION_RECEIPT.actorPulses,
        vocabulary: ["attack", "cast", "hurt"],
      },
    })).toThrow(/詞彙/);
  });

  it("defines the exact actor replacement keys without claiming unrelated channels", () => {
    expect(replacementClaimsForScript(doc([
      { kind: "anim", on: "castStart", at: "caster", pulse: "cast" },
      { kind: "anim", on: "castEffect", at: "caster", pulse: "attack" },
      { kind: "anim", on: "strike", strikeIndex: 2, at: "caster", pulse: "attack" },
      { kind: "anim", on: "strike", strikeIndex: 2, at: "target", pulse: "hurt" },
      { kind: "anim", on: "projectileHit", at: "target", pulse: "hurt" },
      { kind: "anim", on: "reflectSuccess", at: "caster", pulse: "guard" },
      { kind: "vfx", on: "strike", strikeIndex: 2, at: "target", vfxId: "fx.prim.holy.arc" },
    ]))).toEqual([
      { trigger: "abilityCast", channel: "caster.action" },
      { trigger: "comboStrike", channel: "caster.action", strikeIndex: 2 },
      { trigger: "comboStrike", channel: "target.reaction", strikeIndex: 2 },
      { trigger: "projectileHit", channel: "target.reaction" },
      { trigger: "reflectSuccess", channel: "target.reaction" },
    ]);
  });

  it("does not claim channels for beats with no Main default", () => {
    expect(replacementClaimsForScript(doc([
      { kind: "anim", on: "castEffect", at: "caster", pulse: "attack" },
      { kind: "anim", on: "projectileSpawn", at: "caster", pulse: "cast" },
    ]))).toEqual([]);
  });

  it("fails closed while Main reports replacementPolicy unsupported", () => {
    const claims = unsupportedReplacementClaims(doc([
      { kind: "anim", on: "castStart", at: "caster", pulse: "cast" },
    ]));
    expect(PRESENTATION_RECEIPT.replacementPolicy.status).toBe("unsupported");
    expect(claims).toEqual([{ trigger: "abilityCast", channel: "caster.action" }]);
  });
});
