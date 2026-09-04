import { describe, expect, it, vi } from "vitest";
import {
  ExternalProfileError,
  fetchExternalTargetProfile,
  parseEditorProfileHosts,
  validateExternalProfileUrl,
} from "./externalProfile";

describe("external target profile bridge", () => {
  it("accepts only allow-listed standard HTTPS URLs", () => {
    expect(validateExternalProfileUrl(
      "https://ggd.adms.ai/content/editor-target-profile.json#ignored",
      ["ggd.adms.ai"],
    ).href).toBe("https://ggd.adms.ai/content/editor-target-profile.json");
    expect(() => validateExternalProfileUrl("http://ggd.adms.ai/x", ["ggd.adms.ai"]))
      .toThrow(/HTTPS/);
    expect(() => validateExternalProfileUrl("https://127.0.0.1/x", ["ggd.adms.ai"]))
      .toThrow(/未獲允許/);
    expect(() => validateExternalProfileUrl("https://ggd.adms.ai:444/x", ["ggd.adms.ai"]))
      .toThrow(/port/);
  });

  it("normalizes the configurable host allow-list", () => {
    expect(parseEditorProfileHosts(" GGD.ADMS.AI,cdn.example.test,ggd.adms.ai "))
      .toEqual(["ggd.adms.ai", "cdn.example.test"]);
  });

  it("returns only a bounded recognized JSON profile", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      schema: "ggd-editor-target-profile@1",
      supportedModes: ["bootstrap"],
    }), { headers: { "content-type": "application/json" } }));
    await expect(fetchExternalTargetProfile("https://ggd.adms.ai/p.json", { fetchImpl }))
      .resolves.toMatchObject({ schema: "ggd-editor-target-profile@1" });
    expect(fetchImpl).toHaveBeenCalledOnce();

    const wrong = vi.fn(async () => new Response(JSON.stringify({ schema: "something-else" }), {
      headers: { "content-type": "application/json" },
    }));
    await expect(fetchExternalTargetProfile("https://ggd.adms.ai/p.json", { fetchImpl: wrong }))
      .rejects.toMatchObject({ statusCode: 502 } satisfies Partial<ExternalProfileError>);
  });

  it("rejects oversized and non-JSON responses before parsing", async () => {
    const huge = vi.fn(async () => new Response("{}", {
      headers: { "content-type": "application/json", "content-length": "99" },
    }));
    await expect(fetchExternalTargetProfile("https://ggd.adms.ai/p.json", {
      fetchImpl: huge,
      maxBytes: 10,
    })).rejects.toThrow(/超過/);

    const html = vi.fn(async () => new Response("<html/>", {
      headers: { "content-type": "text/html" },
    }));
    await expect(fetchExternalTargetProfile("https://ggd.adms.ai/p.json", { fetchImpl: html }))
      .rejects.toThrow(/Content-Type/);
  });
});
