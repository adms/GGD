/**
 * editor-13 (editor-ai-stub): the AI client talks the CONTRACT shape against a
 * mocked platform proxy, surfaces the STUB flag (provider unconfigured), and the
 * pure presenter turns that into the graceful "configure AI in admin" banner —
 * the placeholder still previews and stays acceptable. Also covers the base64
 * <-> data-url helpers the preview/Accept paths rely on.
 */
import { describe, it, expect, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  AiError,
  aiFillText,
  aiGenerateIcon,
  iconResultStatus,
  toDataUrl,
  toRawBase64,
} from "./client";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("aiGenerateIcon / stub state (editor-13)", () => {
  it("returns the placeholder PNG + stub:true when the provider is unconfigured", async () => {
    cover("editor-ai-stub");
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({ pngBase64: "iVBORw0KGgo=", stub: true }),
    );
    const r = await aiGenerateIcon(
      { prompt: "an ember knight", style: "painterly", size: 256 },
      { fetchFn, base: "/api/v1", token: null },
    );
    expect(r.stub).toBe(true);
    expect(r.pngBase64).toBe("iVBORw0KGgo=");

    // called the contract endpoint with the request body
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe("/api/v1/ai/icon");
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      prompt: "an ember knight",
      style: "painterly",
      size: 256,
    });
  });

  it("stub result renders the 'configure AI in admin' banner (still acceptable)", () => {
    const status = iconResultStatus({ pngBase64: "x", stub: true });
    expect(status.tone).toBe("stub");
    expect(status.label).toMatch(/not configured/i);
    expect(status.hint).toMatch(/admin/i);

    // a real (non-stub) generation is a plain ok state
    expect(iconResultStatus({ pngBase64: "x", stub: false }).tone).toBe("ok");
    // and a failure surfaces the error
    const errStatus = iconResultStatus(null, "boom");
    expect(errStatus.tone).toBe("error");
    expect(errStatus.hint).toBe("boom");
  });

  it("does not attach an Authorization header when no token is present", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ pngBase64: "x", stub: true }));
    await aiGenerateIcon({ prompt: "p" }, { fetchFn, token: null });
    const init = fetchFn.mock.calls[0]![1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBeUndefined();
  });

  it("attaches a bearer token when supplied (never a provider key)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ pngBase64: "x", stub: false }));
    await aiGenerateIcon({ prompt: "p" }, { fetchFn, token: "dev-token" });
    const init = fetchFn.mock.calls[0]![1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer dev-token");
  });

  it("maps a provider error envelope to an AiError", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { message: "provider down" } }, false, 502));
    await expect(aiGenerateIcon({ prompt: "p" }, { fetchFn, token: null })).rejects.toMatchObject({
      status: 502,
      message: "provider down",
    });
    await expect(aiGenerateIcon({ prompt: "p" }, { fetchFn, token: null })).rejects.toBeInstanceOf(
      AiError,
    );
  });
});

describe("aiFillText (editor-13)", () => {
  it("returns text + stub flag and posts the field-scoped body", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse({ text: "A blade that hungers.", stub: true }));
    const r = await aiFillText(
      { prompt: "write a description", field: "description", context: "{}" },
      { fetchFn, token: null },
    );
    expect(r).toEqual({ text: "A blade that hungers.", stub: true });
    expect(fetchFn.mock.calls[0]![0]).toBe("/api/v1/ai/text");
  });

  it("tolerates a {data:{…}} wrapped response", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ data: { text: "wrapped" } }));
    const r = await aiFillText({ prompt: "p", field: "name", context: "{}" }, { fetchFn, token: null });
    expect(r.text).toBe("wrapped");
    expect(r.stub).toBe(false);
  });
});

describe("base64 helpers (editor-13)", () => {
  it("normalizes to and from data URLs idempotently", () => {
    expect(toDataUrl("QUJD")).toBe("data:image/png;base64,QUJD");
    expect(toDataUrl("data:image/png;base64,QUJD")).toBe("data:image/png;base64,QUJD");
    expect(toRawBase64("data:image/png;base64,QUJD")).toBe("QUJD");
    expect(toRawBase64("QUJD")).toBe("QUJD");
  });
});
