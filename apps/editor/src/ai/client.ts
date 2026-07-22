/**
 * Thin client for the PLATFORM AI proxy (the Go platform's `internal/ai`
 * package — built concurrently, coded here against the CONTRACT shape). The
 * provider endpoint/key/model live SERVER-SIDE in the admin config; the key is
 * NEVER sent to or seen by this client — we only call the proxy, which attaches
 * it. When the provider is unconfigured the proxy answers in STUB MODE
 * (`stub: true`) with a deterministic placeholder, so the whole flow works
 * without a key.
 *
 *   POST /api/v1/ai/icon  {prompt, style?, size?} -> { pngBase64, stub }
 *   POST /api/v1/ai/text  {prompt, field, context} -> { text, stub }
 *
 * fetch + base are injectable so the flow is unit-testable with a mock.
 */
import type { TextFillRequest } from "./prompt";

const DEFAULT_BASE = "/api/v1";

export interface AiClientOptions {
  /** platform API base (default "/api/v1"; dev proxies it — see vite.config). */
  base?: string;
  fetchFn?: typeof fetch;
  /** optional dev bearer token; attached only when present. */
  token?: string | null;
}

export interface IconGenRequest {
  prompt: string;
  style?: string;
  size?: number;
}

export interface IconGenResult {
  /** raw base64 or a `data:` URL — use toDataUrl() before putting it in <img>. */
  pngBase64: string;
  /** true = provider unconfigured, this is a generated placeholder. */
  stub: boolean;
}

export interface TextGenResult {
  text: string;
  stub: boolean;
}

export class AiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AiError";
  }
}

/** Read an optional dev token from localStorage (never a provider API key). */
function devToken(): string | null {
  try {
    return globalThis.localStorage?.getItem("ggd.editor.token") ?? null;
  } catch {
    return null;
  }
}

async function postJson(path: string, body: unknown, opts: AiClientOptions): Promise<unknown> {
  const base = opts.base ?? DEFAULT_BASE;
  const fetchFn = opts.fetchFn ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const token = opts.token !== undefined ? opts.token : devToken();
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers["authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetchFn(base + path, { method: "POST", headers, body: JSON.stringify(body) });
  } catch (e) {
    throw new AiError(0, `network error contacting AI proxy: ${String(e)}`);
  }
  if (!res.ok) {
    let message = `AI proxy request failed (${res.status})`;
    try {
      const j = (await res.json()) as { error?: { message?: string } | string };
      const m = typeof j.error === "string" ? j.error : j.error?.message;
      if (m) message = m;
    } catch {
      /* non-JSON body */
    }
    throw new AiError(res.status, message);
  }
  return res.json();
}

/** Pull a string out of the tolerated response shapes (flat or `{data:…}`). */
function pick(obj: unknown, keys: string[]): string | undefined {
  const rec = (obj ?? {}) as Record<string, unknown>;
  const src =
    rec.data && typeof rec.data === "object" ? (rec.data as Record<string, unknown>) : rec;
  for (const k of keys) {
    if (typeof src[k] === "string") return src[k] as string;
  }
  return undefined;
}

function pickStub(obj: unknown): boolean {
  const rec = (obj ?? {}) as Record<string, unknown>;
  const src =
    rec.data && typeof rec.data === "object" ? (rec.data as Record<string, unknown>) : rec;
  return src.stub === true || rec.stub === true;
}

export async function aiGenerateIcon(
  req: IconGenRequest,
  opts: AiClientOptions = {},
): Promise<IconGenResult> {
  const body = await postJson("/ai/icon", req, opts);
  const png = pick(body, ["pngBase64", "dataUrl", "image", "png"]);
  if (!png) throw new AiError(502, "AI proxy returned no image");
  return { pngBase64: png, stub: pickStub(body) };
}

export async function aiFillText(
  req: TextFillRequest,
  opts: AiClientOptions = {},
): Promise<TextGenResult> {
  const body = await postJson("/ai/text", req, opts);
  const text = pick(body, ["text", "content", "value"]);
  if (text === undefined) throw new AiError(502, "AI proxy returned no text");
  return { text, stub: pickStub(body) };
}

// ---- base64 / data-url helpers ---------------------------------------------

/** Normalize a possibly-data-url base64 blob into a `data:image/png` URL. */
export function toDataUrl(pngBase64: string, mime = "image/png"): string {
  return pngBase64.startsWith("data:") ? pngBase64 : `data:${mime};base64,${pngBase64}`;
}

/** Strip any `data:...;base64,` prefix, yielding raw base64 for storage. */
export function toRawBase64(pngBase64: string): string {
  const marker = "base64,";
  const i = pngBase64.indexOf(marker);
  return i >= 0 ? pngBase64.slice(i + marker.length) : pngBase64;
}

// ---- presenter (pure UI state, unit-tested without a DOM) -------------------

export interface IconPanelStatus {
  tone: "idle" | "ok" | "stub" | "error";
  label: string;
  hint?: string;
}

/**
 * Map a generation outcome to the banner the panel shows. The STUB case is the
 * "configure AI in admin" state — the placeholder still previews and can be
 * accepted, so the whole flow is exercisable with no provider configured.
 */
export function iconResultStatus(
  result: IconGenResult | null,
  error?: string | null,
): IconPanelStatus {
  if (error) return { tone: "error", label: "Generation failed", hint: error };
  if (!result) return { tone: "idle", label: "" };
  if (result.stub) {
    return {
      tone: "stub",
      label: "Placeholder — AI provider not configured",
      hint: "This is a generated placeholder. Configure the provider in the admin console (AI 生成設定) to get real art. You can still Accept it.",
    };
  }
  return { tone: "ok", label: "Generated" };
}
