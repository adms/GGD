/**
 * adminui-ai-config: tolerant parse of the masked provider config, the
 * configured/stub status logic, form seeding, and the WRITE-ONLY save-payload
 * key semantics (untouched → omit apiKey; touched → send it, empty clears).
 * adminui-ai-save: the API round-trip proves the page never expects a raw key
 * back and only sends a key when one was typed.
 */
import { describe, it, expect, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  emptyAiConfig,
  formFromConfig,
  formValid,
  musicStatus,
  normalizeAiConfig,
  providerStatus,
  imageStatus,
  textStatus,
  toSavePayload,
  ttsStatus,
  validateBaseUrl,
  validateForm,
  type AiConfigForm,
} from "./ai";
import { ApiClient, type TokenStorage } from "./session";
import type { TokenPair } from "./types";

const CONFIGURED = {
  version: 1,
  updatedAt: "2026-07-22T12:00:00Z",
  enabled: true,
  imageBaseUrl: "https://api.example.com/v1",
  imageModel: "img-1",
  textBaseUrl: "https://api.example.com/v1",
  textModel: "txt-1",
  ttsBaseUrl: "https://api.example.com/v1",
  ttsModel: "tts-1",
  ttsVoice: "shimmer",
  musicBaseUrl: "https://api.example.com/v1",
  musicModel: "music-1",
  apiKeyMasked: "sk-…abcd",
  hasKey: true,
  imageReady: true,
  textReady: true,
  ttsReady: true,
  musicReady: true,
};

describe("ai provider config parse + status (adminui-ai-config)", () => {
  it("tolerant parse: bare doc, {config:…} envelope, and garbage → empty", () => {
    cover("adminui-ai-config");
    expect(normalizeAiConfig(CONFIGURED).imageBaseUrl).toBe("https://api.example.com/v1");
    expect(normalizeAiConfig({ config: CONFIGURED }).textModel).toBe("txt-1");
    expect(normalizeAiConfig(null)).toEqual(emptyAiConfig());
    expect(normalizeAiConfig("nope")).toEqual(emptyAiConfig());
    // missing fields default rather than throw
    const partial = normalizeAiConfig({ enabled: true });
    expect(partial.enabled).toBe(true);
    expect(partial.imageBaseUrl).toBe("");
    expect(partial.hasKey).toBe(false);
  });

  it("status: configured only when enabled + key + a ready capability, else stub", () => {
    cover("adminui-ai-config");
    expect(providerStatus(normalizeAiConfig(CONFIGURED))).toBe("configured");
    expect(imageStatus(normalizeAiConfig(CONFIGURED))).toBe("ready");
    expect(textStatus(normalizeAiConfig(CONFIGURED))).toBe("ready");
    expect(ttsStatus(normalizeAiConfig(CONFIGURED))).toBe("ready");
    expect(musicStatus(normalizeAiConfig(CONFIGURED))).toBe("ready");

    // enabled but no key → stub
    expect(
      providerStatus(
        normalizeAiConfig({
          ...CONFIGURED,
          hasKey: false,
          imageReady: false,
          textReady: false,
          ttsReady: false,
          musicReady: false,
        }),
      ),
    ).toBe("stub");
    // has key but disabled → stub
    expect(providerStatus(normalizeAiConfig({ ...CONFIGURED, enabled: false }))).toBe("stub");
    // ANY single live capability is enough — music alone still counts
    expect(
      providerStatus(
        normalizeAiConfig({ ...CONFIGURED, imageReady: false, textReady: false, ttsReady: false, musicReady: true }),
      ),
    ).toBe("configured");
    // fresh default → stub, every cap stub
    const empty = emptyAiConfig();
    expect(providerStatus(empty)).toBe("stub");
    expect(imageStatus(empty)).toBe("stub");
    expect(textStatus(empty)).toBe("stub");
    expect(ttsStatus(empty)).toBe("stub");
    expect(musicStatus(empty)).toBe("stub");
  });

  it("form seeds from config with an empty, untouched key box", () => {
    cover("adminui-ai-config");
    const form = formFromConfig(normalizeAiConfig(CONFIGURED));
    expect(form.enabled).toBe(true);
    expect(form.imageModel).toBe("img-1");
    // every capability the page can save is seeded — a field the form did not
    // carry would be dropped from the next save payload
    expect(form.ttsModel).toBe("tts-1");
    expect(form.ttsVoice).toBe("shimmer");
    expect(form.musicModel).toBe("music-1");
    expect(form.apiKeyInput).toBe("");
    expect(form.apiKeyTouched).toBe(false);
  });

  it("base-url validation accepts empty / http(s), rejects other schemes", () => {
    cover("adminui-ai-config");
    expect(validateBaseUrl("")).toBe("");
    expect(validateBaseUrl("https://api.openai.com/v1")).toBe("");
    expect(validateBaseUrl("http://localhost:1234")).toBe("");
    expect(validateBaseUrl("ftp://x")).not.toBe("");
    expect(validateBaseUrl("api.openai.com")).not.toBe("");
    const bad = formFromConfig(emptyAiConfig());
    bad.imageBaseUrl = "not-a-url";
    expect(formValid(bad)).toBe(false);
    expect(validateForm(bad).imageBaseUrl).toBeTruthy();

    // the tts + music endpoints are validated the same way
    const badTts = formFromConfig(emptyAiConfig());
    badTts.ttsBaseUrl = "ftp://voices";
    expect(formValid(badTts)).toBe(false);
    expect(validateForm(badTts).ttsBaseUrl).toBeTruthy();
    const badMusic = formFromConfig(emptyAiConfig());
    badMusic.musicBaseUrl = "api.example.com";
    expect(formValid(badMusic)).toBe(false);
    expect(validateForm(badMusic).musicBaseUrl).toBeTruthy();
  });
});

describe("write-only save payload (adminui-ai-save)", () => {
  const base: AiConfigForm = {
    enabled: true,
    imageBaseUrl: "  https://api.example.com/v1  ",
    imageModel: " img-1 ",
    textBaseUrl: "https://api.example.com/v1",
    textModel: "txt-1",
    ttsBaseUrl: " https://api.example.com/v1 ",
    ttsModel: " tts-1 ",
    ttsVoice: "shimmer",
    musicBaseUrl: "https://api.example.com/v1",
    musicModel: "music-1",
    apiKeyInput: "",
    apiKeyTouched: false,
  };

  it("omits apiKey when the key box was not touched (keeps the stored secret)", () => {
    cover("adminui-ai-save");
    const body = toSavePayload(base);
    expect("apiKey" in body).toBe(false);
    // other fields are trimmed
    expect(body.imageBaseUrl).toBe("https://api.example.com/v1");
    expect(body.imageModel).toBe("img-1");
  });

  it("includes apiKey when typed; a touched-but-empty value clears it", () => {
    cover("adminui-ai-save");
    expect(toSavePayload({ ...base, apiKeyInput: "sk-new-123", apiKeyTouched: true }).apiKey).toBe("sk-new-123");
    expect(toSavePayload({ ...base, apiKeyInput: "   ", apiKeyTouched: true }).apiKey).toBe("");
  });
});

describe("tts + music are editable and always saved (adminui-ai-tts-music)", () => {
  it("a save carries every capability, so an unrelated edit cannot blank tts/music", () => {
    cover("adminui-ai-tts-music");
    // Load a config where tts + music are live (configured over the API), then
    // change ONLY the image model — the way an operator uses this page.
    const form = formFromConfig(normalizeAiConfig(CONFIGURED));
    const body = toSavePayload({ ...form, imageModel: "img-2" });

    // The platform PUT keeps omitted fields, so the tts/music values must be
    // PRESENT and unchanged rather than missing (this is the data-loss guard:
    // a payload without them used to wipe both capabilities server-side).
    expect(body.imageModel).toBe("img-2");
    expect(body.ttsBaseUrl).toBe("https://api.example.com/v1");
    expect(body.ttsModel).toBe("tts-1");
    expect(body.ttsVoice).toBe("shimmer");
    expect(body.musicBaseUrl).toBe("https://api.example.com/v1");
    expect(body.musicModel).toBe("music-1");
  });

  it("clearing a tts/music field sends the empty value (an explicit clear)", () => {
    cover("adminui-ai-tts-music");
    const form = formFromConfig(normalizeAiConfig(CONFIGURED));
    const body = toSavePayload({ ...form, ttsBaseUrl: "  ", ttsModel: "", ttsVoice: "" });
    expect(body.ttsBaseUrl).toBe("");
    expect(body.ttsModel).toBe("");
    expect(body.ttsVoice).toBe("");
    // the other capabilities are untouched by that clear
    expect(body.musicModel).toBe("music-1");
    expect(body.imageModel).toBe("img-1");
  });
});

// ---- API round-trip via a mocked fetch --------------------------------------

function memStorage(initial: TokenPair | null): TokenStorage {
  let cur = initial;
  return { load: () => cur, save: (t) => void (cur = t) };
}
const TOKENS: TokenPair = { accessToken: "acc-1", refreshToken: "ref-1", expiresIn: 900 };

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("ai config API round-trip (adminui-ai-save)", () => {
  it("GET returns the masked config; PUT sends the write-only payload and re-reads masked", async () => {
    cover("adminui-ai-save");
    const puts: Record<string, unknown>[] = [];
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/admin/ai/config") && (init?.method ?? "GET") === "GET") {
        return jsonRes(200, CONFIGURED);
      }
      if (u.endsWith("/admin/ai/config") && init?.method === "PUT") {
        puts.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return jsonRes(200, { ...CONFIGURED, imageModel: "img-2" });
      }
      return jsonRes(404, { error: { code: "not_found", message: "no" } });
    });

    // build a client + the api wrappers use the module-level singleton, so test
    // the ApiClient path directly here to keep it hermetic.
    const client = new ApiClient({ fetchFn: fetchFn as unknown as typeof fetch, storage: memStorage(TOKENS) });
    const raw = await client.request<unknown>("/admin/ai/config");
    const cfg = normalizeAiConfig(raw);
    expect(cfg.hasKey).toBe(true);
    expect(cfg.apiKeyMasked).toBe("sk-…abcd");
    // the masked value is NOT a usable key — the page never treats it as one
    expect(cfg.apiKeyMasked).not.toMatch(/^sk-[A-Za-z0-9]{8,}/);

    const body = toSavePayload({ ...formFromConfig(cfg), imageModel: "img-2" });
    const saved = normalizeAiConfig(await client.request<unknown>("/admin/ai/config", { method: "PUT", body }));
    expect(saved.imageModel).toBe("img-2");
    // the PUT omitted apiKey (untouched) so the server keeps its stored secret
    expect(puts).toHaveLength(1);
    const put = puts[0] ?? {};
    expect("apiKey" in put).toBe(false);
  });
});
