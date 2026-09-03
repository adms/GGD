import { describe, expect, it } from "vitest";
import { normalizeLoopbackProofSink, proofSinkFromSearch } from "./proofAutomation";

describe("browser proof automation", () => {
  it("accepts only plain HTTP loopback sinks", () => {
    expect(normalizeLoopbackProofSink("http://127.0.0.1:49152/proof/token"))
      .toBe("http://127.0.0.1:49152/proof/token");
    expect(normalizeLoopbackProofSink("http://localhost:49152/proof/token"))
      .toBe("http://localhost:49152/proof/token");
    expect(normalizeLoopbackProofSink("https://127.0.0.1/proof/token")).toBe("");
    expect(normalizeLoopbackProofSink("http://example.com/proof/token")).toBe("");
    expect(normalizeLoopbackProofSink("not-a-url")).toBe("");
  });

  it("reads the encoded one-shot sink from the QA URL", () => {
    expect(proofSinkFromSearch(
      "?qa=accept-46&proofSink=http%3A%2F%2F127.0.0.1%3A49152%2Fproof%2Ftoken",
    )).toBe("http://127.0.0.1:49152/proof/token");
  });
});
