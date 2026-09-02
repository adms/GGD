import {
  DEFAULT_EDITOR_PROFILE_HOSTS,
  ExternalProfileError,
  readBoundedBody,
  validateExternalProfileUrl,
} from "./externalProfile";

export const MAX_EXTERNAL_CONTRACT_INDEX_BYTES = 4 * 1024 * 1024;
export const CONTRACT_INDEX_PATH = "/api/v1/content-import/contract-index";

function contractIndexUrl(profileUrl: URL, rawHref: unknown): URL {
  if (typeof rawHref !== "string" || rawHref.length < 1 || rawHref.length > 2048) {
    throw new ExternalProfileError(422, "contract-index href 必須是 1–2048 字元字串");
  }
  let url: URL;
  try {
    url = new URL(rawHref, profileUrl);
  } catch {
    throw new ExternalProfileError(422, "contract-index href 格式不合法");
  }
  if (
    url.origin !== profileUrl.origin ||
    url.pathname !== CONTRACT_INDEX_PATH ||
    url.search !== "" ||
    url.hash !== "" ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw new ExternalProfileError(403, `contract-index href 必須是同源 ${CONTRACT_INDEX_PATH}`);
  }
  return url;
}

/** Bounded same-origin bridge; this is intentionally not a generic JSON proxy. */
export async function fetchExternalContractIndex(
  rawProfileUrl: unknown,
  rawHref: unknown,
  opts: {
    allowedHosts?: readonly string[];
    fetchImpl?: typeof fetch;
    maxBytes?: number;
  } = {},
): Promise<Record<string, unknown>> {
  const profileUrl = validateExternalProfileUrl(
    rawProfileUrl,
    opts.allowedHosts ?? DEFAULT_EDITOR_PROFILE_HOSTS,
  );
  const url = contractIndexUrl(profileUrl, rawHref);
  const response = await (opts.fetchImpl ?? fetch)(url, {
    headers: { accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new ExternalProfileError(502, `contract-index upstream 回應 ${response.status}`);
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    throw new ExternalProfileError(502, `contract-index Content-Type 不是 JSON：${contentType || "(missing)"}`);
  }
  const bytes = await readBoundedBody(response, opts.maxBytes ?? MAX_EXTERNAL_CONTRACT_INDEX_BYTES);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ExternalProfileError(502, "contract-index 不是有效的 UTF-8 JSON");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ExternalProfileError(502, "contract-index 必須是 JSON object");
  }
  const contract = value as Record<string, unknown>;
  if (contract["schema"] !== "ggd-editor-contract-index@1") {
    throw new ExternalProfileError(502, `不支援的 contract-index schema：${String(contract["schema"])}`);
  }
  return contract;
}
