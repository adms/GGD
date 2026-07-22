/**
 * AI 生成設定 (AI provider config) — pure, node-testable logic behind the admin
 * page that configures the platform's AI proxy.
 *
 * The API KEY is WRITE-ONLY end to end: the platform stores it server-side and
 * only ever returns a MASKED hint (e.g. "sk-…abcd"); this module therefore
 * never holds a raw key from the server and only ever SENDS a key when the admin
 * actually typed a new one — an untouched form omits the field so the stored
 * secret is preserved.
 *
 * That omit-to-keep rule is the platform's contract for EVERY field, not just
 * the key: the PUT is a partial update. So this page must send every capability
 * it edits (image / text / tts / music) — a capability the form did not carry
 * would be dropped from the payload and, before that contract existed, silently
 * blanked server-side.
 *
 * Everything here is a pure function over plain data so the page's behaviour
 * (tolerant parse, configured/stub status, save-payload key semantics,
 * validation) is unit tested without React or a browser.
 */

// ------------------------------------------------------------ the doc ----

/** The MASKED provider config the platform GET returns (never the raw key). */
export interface AiConfigMasked {
  version: number;
  updatedAt: string;
  enabled: boolean;
  imageBaseUrl: string;
  imageModel: string;
  textBaseUrl: string;
  textModel: string;
  /** TTS (語音) provider — OpenAI-compatible /audio/speech */
  ttsBaseUrl: string;
  ttsModel: string;
  /** default provider voice used when a request does not name one */
  ttsVoice: string;
  /** music (BGM) provider — separate endpoint, price and latency class */
  musicBaseUrl: string;
  musicModel: string;
  /** masked hint like "sk-…abcd" ("" when unset) — NEVER the raw key */
  apiKeyMasked: string;
  hasKey: boolean;
  /** real image generation would run (enabled + key + endpoint + model) */
  imageReady: boolean;
  /** real text generation would run */
  textReady: boolean;
  /** real speech synthesis would run */
  ttsReady: boolean;
  /** real music generation would run */
  musicReady: boolean;
}

/** A fresh, disabled config — the shipped default (stub mode). */
export function emptyAiConfig(): AiConfigMasked {
  return {
    version: 1,
    updatedAt: "",
    enabled: false,
    imageBaseUrl: "",
    imageModel: "",
    textBaseUrl: "",
    textModel: "",
    ttsBaseUrl: "",
    ttsModel: "",
    ttsVoice: "",
    musicBaseUrl: "",
    musicModel: "",
    apiKeyMasked: "",
    hasKey: false,
    imageReady: false,
    textReady: false,
    ttsReady: false,
    musicReady: false,
  };
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function bool(v: unknown): boolean {
  return v === true;
}

/**
 * Tolerant parser for whatever the platform returns. Accepts the bare doc, a
 * `{ config: doc }` envelope, or garbage (→ empty doc); missing fields take
 * sane defaults so the page never dies on a partial response from a backend
 * that is still being built.
 */
export function normalizeAiConfig(raw: unknown): AiConfigMasked {
  if (raw === null || typeof raw !== "object") return emptyAiConfig();
  const outer = raw as Record<string, unknown>;
  const inner =
    outer["config"] && typeof outer["config"] === "object"
      ? (outer["config"] as Record<string, unknown>)
      : outer;
  return {
    version: typeof inner["version"] === "number" ? (inner["version"] as number) : 1,
    updatedAt: str(inner["updatedAt"]),
    enabled: bool(inner["enabled"]),
    imageBaseUrl: str(inner["imageBaseUrl"]),
    imageModel: str(inner["imageModel"]),
    textBaseUrl: str(inner["textBaseUrl"]),
    textModel: str(inner["textModel"]),
    ttsBaseUrl: str(inner["ttsBaseUrl"]),
    ttsModel: str(inner["ttsModel"]),
    ttsVoice: str(inner["ttsVoice"]),
    musicBaseUrl: str(inner["musicBaseUrl"]),
    musicModel: str(inner["musicModel"]),
    apiKeyMasked: str(inner["apiKeyMasked"]),
    hasKey: bool(inner["hasKey"]),
    imageReady: bool(inner["imageReady"]),
    textReady: bool(inner["textReady"]),
    ttsReady: bool(inner["ttsReady"]),
    musicReady: bool(inner["musicReady"]),
  };
}

// --------------------------------------------------------------- status ----

export type ProviderStatus = "configured" | "stub";

/**
 * Overall provider status. "configured" only when the provider is enabled, a
 * key is stored, and at least one capability is fully wired; otherwise "stub"
 * (the proxy still works — it returns placeholders — but nothing is live).
 */
export function providerStatus(cfg: AiConfigMasked): ProviderStatus {
  return cfg.enabled && cfg.hasKey && (cfg.imageReady || cfg.textReady || cfg.ttsReady || cfg.musicReady)
    ? "configured"
    : "stub";
}

export type CapabilityStatus = "ready" | "stub";

export function imageStatus(cfg: AiConfigMasked): CapabilityStatus {
  return cfg.imageReady ? "ready" : "stub";
}
export function textStatus(cfg: AiConfigMasked): CapabilityStatus {
  return cfg.textReady ? "ready" : "stub";
}
export function ttsStatus(cfg: AiConfigMasked): CapabilityStatus {
  return cfg.ttsReady ? "ready" : "stub";
}
export function musicStatus(cfg: AiConfigMasked): CapabilityStatus {
  return cfg.musicReady ? "ready" : "stub";
}

/** zh-Hant one-liner describing why the provider is in stub mode (or that it's live). */
export function statusReason(cfg: AiConfigMasked): string {
  if (providerStatus(cfg) === "configured") {
    const caps = [
      cfg.imageReady ? "圖片" : null,
      cfg.textReady ? "文字" : null,
      cfg.ttsReady ? "語音" : null,
      cfg.musicReady ? "音樂" : null,
    ]
      .filter(Boolean)
      .join(" + ");
    return `已設定，可正式生成（${caps}）。`;
  }
  if (!cfg.enabled) return "未啟用 — 目前為佔位模式（stub）。開啟「啟用」並填入端點與 API 金鑰後可正式生成。";
  if (!cfg.hasKey) return "缺少 API 金鑰 — 目前為佔位模式（stub）。填入金鑰後可正式生成。";
  return "端點或模型未填齊 — 目前為佔位模式（stub）。";
}

// ---------------------------------------------------------------- form -----

/** Editable form state. The key input is separate + a touched flag so an
 * untouched save never overwrites the stored secret. */
export interface AiConfigForm {
  enabled: boolean;
  imageBaseUrl: string;
  imageModel: string;
  textBaseUrl: string;
  textModel: string;
  ttsBaseUrl: string;
  ttsModel: string;
  ttsVoice: string;
  musicBaseUrl: string;
  musicModel: string;
  /** what the admin typed into the key box ("" while untouched) */
  apiKeyInput: string;
  /** true once the admin edited the key box (only then do we send a key) */
  apiKeyTouched: boolean;
}

/** Seed a form from a loaded (masked) config. The key box starts empty and
 * untouched — the stored key is preserved unless the admin types a new one. */
export function formFromConfig(cfg: AiConfigMasked): AiConfigForm {
  return {
    enabled: cfg.enabled,
    imageBaseUrl: cfg.imageBaseUrl,
    imageModel: cfg.imageModel,
    textBaseUrl: cfg.textBaseUrl,
    textModel: cfg.textModel,
    ttsBaseUrl: cfg.ttsBaseUrl,
    ttsModel: cfg.ttsModel,
    ttsVoice: cfg.ttsVoice,
    musicBaseUrl: cfg.musicBaseUrl,
    musicModel: cfg.musicModel,
    apiKeyInput: "",
    apiKeyTouched: false,
  };
}

/** The PUT body. apiKey is present ONLY when the admin typed one; an empty
 * touched value clears the stored key (platform write-only semantics). */
export interface AiConfigSave {
  enabled: boolean;
  imageBaseUrl: string;
  imageModel: string;
  textBaseUrl: string;
  textModel: string;
  ttsBaseUrl: string;
  ttsModel: string;
  ttsVoice: string;
  musicBaseUrl: string;
  musicModel: string;
  apiKey?: string;
}

/**
 * Build the save payload from the form, applying the write-only key rule.
 *
 * EVERY capability the page edits is sent, including tts + music: the platform
 * treats the PUT as a partial update (omitted = keep), so a field this page
 * edits must always be present or the admin could never clear it — and a field
 * the page did NOT edit must never appear here or saving would blank it.
 */
export function toSavePayload(form: AiConfigForm): AiConfigSave {
  const body: AiConfigSave = {
    enabled: form.enabled,
    imageBaseUrl: form.imageBaseUrl.trim(),
    imageModel: form.imageModel.trim(),
    textBaseUrl: form.textBaseUrl.trim(),
    textModel: form.textModel.trim(),
    ttsBaseUrl: form.ttsBaseUrl.trim(),
    ttsModel: form.ttsModel.trim(),
    ttsVoice: form.ttsVoice.trim(),
    musicBaseUrl: form.musicBaseUrl.trim(),
    musicModel: form.musicModel.trim(),
  };
  if (form.apiKeyTouched) body.apiKey = form.apiKeyInput.trim();
  return body;
}

// ------------------------------------------------------------ validation ---

/** A base URL must be empty or an http(s) URL. Returns a zh-Hant error or "". */
export function validateBaseUrl(u: string): string {
  const t = u.trim();
  if (t === "") return "";
  if (!/^https?:\/\//i.test(t)) return "網址必須以 http:// 或 https:// 開頭";
  return "";
}

export interface FormErrors {
  imageBaseUrl?: string;
  textBaseUrl?: string;
  ttsBaseUrl?: string;
  musicBaseUrl?: string;
}

/** Field-level validation for the Save button gate. */
export function validateForm(form: AiConfigForm): FormErrors {
  const errs: FormErrors = {};
  const img = validateBaseUrl(form.imageBaseUrl);
  if (img) errs.imageBaseUrl = img;
  const txt = validateBaseUrl(form.textBaseUrl);
  if (txt) errs.textBaseUrl = txt;
  const tts = validateBaseUrl(form.ttsBaseUrl);
  if (tts) errs.ttsBaseUrl = tts;
  const music = validateBaseUrl(form.musicBaseUrl);
  if (music) errs.musicBaseUrl = music;
  return errs;
}

/** True when the form has no blocking validation errors. */
export function formValid(form: AiConfigForm): boolean {
  return Object.keys(validateForm(form)).length === 0;
}

// -------------------------------------------------------- one-click pack ----

/**
 * The eleven audio-map BGM scenes the "one-click BGM pack" fills in a single
 * action (the provider-backed twin of `tools/bgm-gen --all`). Kept in step with
 * the platform's `bgmPackScenes` so the admin page can name what the button will
 * generate. `menuNocturne` (a later login alternate) is intentionally excluded,
 * matching the server batch.
 */
export const BGM_PACK_SCENES: readonly string[] = [
  "menu",
  "lobby",
  "room",
  "champSelect",
  "intermission",
  "battleStart",
  "combat",
  "fireRing",
  "settlement",
  "victory",
  "defeat",
];

/**
 * Whether the one-click BGM pack can run right now: only when the MUSIC
 * capability is fully live (enabled + key + endpoint + model). An unconfigured
 * provider would just return a stub for every scene, so the button stays gated.
 */
export function bgmPackAvailable(cfg: AiConfigMasked): boolean {
  return cfg.musicReady;
}

/** zh-Hant one-liner for the pack button's state (ready, or why it's gated). */
export function bgmPackReason(cfg: AiConfigMasked): string {
  if (cfg.musicReady) {
    return `可一鍵生成整套 BGM（共 ${BGM_PACK_SCENES.length} 個場景）。`;
  }
  return "音樂供應商尚未設定完成 — 填入端點、模型與 API 金鑰並啟用後才能一鍵生成 BGM。";
}
