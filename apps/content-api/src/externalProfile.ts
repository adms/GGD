/**
 * Bounded, allow-listed bridge for a local editor to read a published target
 * profile. Browsers cannot read the production profile directly unless that
 * CDN opts into CORS; the loopback-only sidecar performs this one read instead.
 *
 * The URL is still supplied by the operator, but it is not an open proxy:
 * HTTPS only, no credentials, standard port, and the hostname must be present
 * in the deployment allow-list (`GGD_EDITOR_PROFILE_HOSTS`).
 */

export const TARGET_PROFILE_SCHEMAS = Object.freeze([
  "ggd-content-target-profile@1",
  "ggd-editor-target-profile@1",
] as const);

export const DEFAULT_EDITOR_PROFILE_HOSTS = Object.freeze(["ggd.adms.ai"] as const);
export const MAX_EXTERNAL_PROFILE_BYTES = 2 * 1024 * 1024;

export class ExternalProfileError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export function parseEditorProfileHosts(raw: string | undefined): readonly string[] {
  const hosts = (raw ?? DEFAULT_EDITOR_PROFILE_HOSTS.join(","))
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(hosts)];
}

export function validateExternalProfileUrl(raw: unknown, allowedHosts: readonly string[]): URL {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) {
    throw new ExternalProfileError(422, "url 必須是 1–2048 字元的 HTTPS URL");
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ExternalProfileError(422, "target profile URL 格式不合法");
  }
  if (url.protocol !== "https:") throw new ExternalProfileError(422, "target profile 只允許 HTTPS");
  if (url.username || url.password) throw new ExternalProfileError(422, "target profile URL 不得包含帳號密碼");
  if (url.port && url.port !== "443") throw new ExternalProfileError(422, "target profile 只允許標準 HTTPS port");
  const allow = new Set(allowedHosts.map((host) => host.toLowerCase()));
  if (!allow.has(url.hostname.toLowerCase())) {
    throw new ExternalProfileError(
      403,
      `target profile host 未獲允許：${url.hostname}（可用 GGD_EDITOR_PROFILE_HOSTS 設定）`,
    );
  }
  url.hash = "";
  return url;
}

export async function readBoundedBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ExternalProfileError(413, `target profile 超過 ${maxBytes} bytes`);
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ExternalProfileError(413, `target profile 解碼後超過 ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export async function fetchExternalTargetProfile(
  rawUrl: unknown,
  opts: {
    allowedHosts?: readonly string[];
    fetchImpl?: typeof fetch;
    maxBytes?: number;
  } = {},
): Promise<Record<string, unknown>> {
  const url = validateExternalProfileUrl(rawUrl, opts.allowedHosts ?? DEFAULT_EDITOR_PROFILE_HOSTS);
  const response = await (opts.fetchImpl ?? fetch)(url, {
    headers: { accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new ExternalProfileError(502, `target profile upstream 回應 ${response.status}`);
  }
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    throw new ExternalProfileError(502, `target profile Content-Type 不是 JSON：${contentType || "(missing)"}`);
  }
  const bytes = await readBoundedBody(response, opts.maxBytes ?? MAX_EXTERNAL_PROFILE_BYTES);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ExternalProfileError(502, "target profile 不是有效的 UTF-8 JSON");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ExternalProfileError(502, "target profile 必須是 JSON object");
  }
  const profile = value as Record<string, unknown>;
  if (!TARGET_PROFILE_SCHEMAS.includes(profile["schema"] as (typeof TARGET_PROFILE_SCHEMAS)[number])) {
    throw new ExternalProfileError(502, `不支援的 target profile schema：${String(profile["schema"])}`);
  }
  return profile;
}
