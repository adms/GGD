import { expect, it } from "vitest";
import { acceptanceScope, assertVisualProofScope } from "./visual-proof-scope.mjs";

const scope = acceptanceScope({ schema: "ggd-editor-skill-acceptance@1", summary: { documents: 3, themes: 2 }, rows: [{ id: "hero.q", themeId: "hero" }, { id: "hero.r", themeId: "hero" }, { id: "new.passive", themeId: "new" }] });
const proof = { documents: 3, themes: 2, cases: [{ id: "new.passive" }, { id: "hero.r" }, { id: "hero.q" }] };
it("accepts the complete current ID set in any order without a fixed census", () => {
  expect(() => assertVisualProofScope(proof, scope)).not.toThrow();
});
it("rejects an old but internally consistent smaller batch when a new acceptance row is added", () => {
  const old = { documents: 2, themes: 1, cases: [{ id: "hero.q" }, { id: "hero.r" }] };
  expect(() => assertVisualProofScope(old, scope)).toThrow("new.passive");
  expect(() => assertVisualProofScope(old, scope, { allowPartial: true })).not.toThrow();
});
it("rejects duplicate, substituted and falsely counted cases even when total length matches", () => {
  expect(() => assertVisualProofScope({ ...proof, cases: [{ id: "hero.q" }, { id: "hero.r" }, { id: "hero.r" }] }, scope)).toThrow("duplicate");
  expect(() => assertVisualProofScope({ ...proof, cases: [{ id: "hero.q" }, { id: "hero.r" }, { id: "unrelated" }] }, scope)).toThrow("unexpected");
  expect(() => assertVisualProofScope({ ...proof, themes: 3 }, scope)).toThrow("header");
});
