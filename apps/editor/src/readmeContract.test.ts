/** Keep the human handoff on the same machine truth as the generated contract. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));

describe("Editor README contract receipt", () => {
  it("prints the current coverage and capability fingerprints plus required count", () => {
    const readme = readFileSync(`${REPO}apps/editor/README.md`, "utf8");
    const coverage = JSON.parse(
      readFileSync(`${REPO}docs/editor-contract/ggd-editor-coverage.json`, "utf8"),
    ) as {
      fingerprint: string;
      capabilityFingerprint: string;
      required: unknown[];
    };
    expect(readme).toContain(`editor coverage fingerprint     ${coverage.fingerprint}`);
    expect(readme).toContain(`capability fingerprint          ${coverage.capabilityFingerprint}`);
    expect(readme).toContain(`required cells                  ${coverage.required.length}`);
  });
});
