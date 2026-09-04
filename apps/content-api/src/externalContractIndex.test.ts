import { describe, expect, it, vi } from "vitest";
import { fetchExternalContractIndex } from "./externalContractIndex";

describe("external Main contract-index bridge", () => {
  it("reads only the fixed same-origin route", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      schema: "ggd-editor-contract-index@1",
      digest: "abc",
      representations: [],
    }), { headers: { "content-type": "application/json" } }));
    await expect(fetchExternalContractIndex(
      "https://ggd.adms.ai/content/editor-target-profile.json",
      "/api/v1/content-import/contract-index",
      { fetchImpl },
    )).resolves.toMatchObject({ schema: "ggd-editor-contract-index@1" });
    expect(fetchImpl).toHaveBeenCalledOnce();

    await expect(fetchExternalContractIndex(
      "https://ggd.adms.ai/content/editor-target-profile.json",
      "https://evil.example/api/v1/content-import/contract-index",
      { fetchImpl },
    )).rejects.toThrow(/同源/);
    await expect(fetchExternalContractIndex(
      "https://ggd.adms.ai/content/editor-target-profile.json",
      "/api/v1/content-import/active/runtime-bundle",
      { fetchImpl },
    )).rejects.toThrow(/contract-index href/);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("rejects wrong schema and oversized responses", async () => {
    const wrong = vi.fn(async () => new Response(JSON.stringify({ schema: "old@1" }), {
      headers: { "content-type": "application/json" },
    }));
    await expect(fetchExternalContractIndex(
      "https://ggd.adms.ai/content/editor-target-profile.json",
      "/api/v1/content-import/contract-index",
      { fetchImpl: wrong },
    )).rejects.toThrow(/schema/);

    const huge = vi.fn(async () => new Response("{}", {
      headers: { "content-type": "application/json", "content-length": "99" },
    }));
    await expect(fetchExternalContractIndex(
      "https://ggd.adms.ai/content/editor-target-profile.json",
      "/api/v1/content-import/contract-index",
      { fetchImpl: huge, maxBytes: 10 },
    )).rejects.toThrow(/超過/);
  });
});
