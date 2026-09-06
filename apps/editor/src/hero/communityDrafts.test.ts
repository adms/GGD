import { expect, it } from "vitest";
import { heroEditFingerprint } from "./communityDrafts";
import { createHeroProject } from "./projectModel";
import type { HeroDraftPayload } from "./store";

it("keeps cloud sync receipts stable after storage restores optional fields and still detects raw edits", () => {
  const value: HeroDraftPayload = { project: createHeroProject("cloud-stability"), rawInputs: {}, mode: "quick", origin: "鬥士" };
  const fingerprint = heroEditFingerprint(value);
  expect(heroEditFingerprint({ ...value, originalIconRefs: {}, source: undefined, cloud: { accountId: "owner", revision: 1 }, submission: { operationId: "operation", packageDigest: "digest", allowAttributionRemix: false } })).toBe(fingerprint);
  expect(heroEditFingerprint({ ...value, rawInputs: { damage: { text: "1e", kind: "number" } } })).not.toBe(fingerprint);
  expect(heroEditFingerprint({ ...value, source: { workId: "original", submissionId: "version", packageDigest: "digest", authorId: "author" } })).not.toBe(fingerprint);
});
