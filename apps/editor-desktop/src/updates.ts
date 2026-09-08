import { createHash, createPublicKey, verify } from "node:crypto";
import { mkdir, open, rename, rm } from "node:fs/promises";
import { join } from "node:path";

export interface UpdatePolicy {
  schema: "ggd-editor-update-policy@1";
  enabled: boolean;
  feedUrl: string | null;
  publicKeys: Record<string, string>;
  macTeamId: string | null;
  windowsPublisherThumbprints: string[];
}
export interface StableRelease {
  schema: "ggd-editor-stable-release@1";
  channel: "stable";
  version: string;
  issuedAt: string;
  expiresAt: string;
  draftFormat: { min: number; max: number };
  assets: Array<{ target: "darwin-universal" | "win32-x64"; url: string; bytes: number; sha256: string }>;
}
export function compareVersions(a: string, b: string): number {
  const parse = (value: string) => {
    if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) throw new Error("穩定版版本號無效。");
    const parts = value.split(".").map(Number);
    if (parts.some((part) => !Number.isSafeInteger(part))) throw new Error("版本號超出範圍。");
    return parts;
  };
  const aa = parse(a), bb = parse(b);
  for (let i = 0; i < 3; i++) if (aa[i] !== bb[i]) return aa[i]! > bb[i]! ? 1 : -1;
  return 0;
}
function trustedUrl(value: string, policy: UpdatePolicy): URL {
  const url = new URL(value), feed = new URL(policy.feedUrl ?? "invalid:");
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.origin !== feed.origin) throw new Error("更新來源不在安裝包內的信任範圍。");
  return url;
}
export function verifyStableRelease(envelope: unknown, policy: UpdatePolicy, currentVersion: string, now = Date.now()): StableRelease {
  if (!policy.enabled || !policy.feedUrl) throw new Error("穩定更新尚未啟用：發布來源與平台簽署資料尚未配置。");
  trustedUrl(policy.feedUrl, policy);
  const value = envelope as { keyId?: unknown; payload?: unknown; signature?: unknown } | null;
  if (!value || typeof value.keyId !== "string" || typeof value.payload !== "string" || typeof value.signature !== "string"
    || value.payload.length > 200_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value.payload) || !/^[A-Za-z0-9+/]+={0,2}$/.test(value.signature)) throw new Error("更新資訊格式無效。");
  const pem = Object.hasOwn(policy.publicKeys, value.keyId) ? policy.publicKeys[value.keyId] : undefined;
  if (!pem) throw new Error("更新簽署金鑰不受信任。");
  const key = createPublicKey(pem), payload = Buffer.from(value.payload, "base64"), signature = Buffer.from(value.signature, "base64");
  if (key.asymmetricKeyType !== "ed25519" || signature.length !== 64 || !verify(null, payload, key, signature)) throw new Error("更新資訊簽章驗證失敗。");
  const release = JSON.parse(payload.toString("utf8")) as StableRelease;
  if (release.schema !== "ggd-editor-stable-release@1" || release.channel !== "stable") throw new Error("只接受穩定更新通道。");
  if (compareVersions(release.version, currentVersion) <= 0) throw new Error("此版本不是較新的穩定版；不自動降級。");
  const issued = Date.parse(release.issuedAt), expires = Date.parse(release.expiresAt);
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || issued > now + 300_000 || expires <= now || expires <= issued || expires - issued > 45 * 86400_000) throw new Error("更新資訊已過期或日期無效。");
  if (!release.draftFormat || release.draftFormat.min > 1 || release.draftFormat.max < 1 || !Number.isInteger(release.draftFormat.min) || !Number.isInteger(release.draftFormat.max)) throw new Error("此版本無法讀取目前草稿格式，已保留現有版本。");
  if (!Array.isArray(release.assets) || release.assets.length !== 2 || new Set(release.assets.map((asset) => asset.target)).size !== 2) throw new Error("穩定版必須同時提供兩個平台的產物。");
  for (const asset of release.assets) {
    const url = trustedUrl(asset.url, policy);
    const suffix = asset.target === "darwin-universal" ? ".dmg" : asset.target === "win32-x64" ? ".exe" : "";
    if (!suffix || !url.pathname.endsWith(suffix) || !Number.isSafeInteger(asset.bytes) || asset.bytes < 1 || asset.bytes > 2 * 1024 ** 3 || !/^[a-f0-9]{64}$/.test(asset.sha256)) throw new Error("更新產物的種類、大小或摘要無效。");
  }
  return release;
}
export async function fetchStableRelease(policy: UpdatePolicy, currentVersion: string): Promise<StableRelease> {
  if (!policy.enabled || !policy.feedUrl) throw new Error("穩定更新尚未啟用：發布來源與平台簽署資料尚未配置。");
  const response = await fetch(trustedUrl(policy.feedUrl, policy), { redirect: "error", signal: AbortSignal.timeout(15_000) });
  if (!response.ok || !response.body) throw new Error(`更新檢查失敗（HTTP ${response.status}），目前版本仍可使用。`);
  let text = "";
  for await (const chunk of chunks(response.body)) {
    text += Buffer.from(chunk).toString("utf8");
    if (Buffer.byteLength(text) > 256_000) throw new Error("更新資訊超出大小限制。");
  }
  return verifyStableRelease(JSON.parse(text), policy, currentVersion);
}
export async function downloadVerifiedUpdate(asset: StableRelease["assets"][number], directory: string, response: Response): Promise<string> {
  if (!response.ok || !response.body) throw new Error(`無法下載更新（HTTP ${response.status}）。`);
  await mkdir(directory, { recursive: true });
  const file = join(directory, `${asset.sha256}${asset.target === "darwin-universal" ? ".dmg" : ".exe"}`);
  const temporary = `${file}.${process.pid}.download`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    let bytes = 0; const hash = createHash("sha256");
    for await (const chunk of chunks(response.body)) {
      bytes += chunk.length;
      if (bytes > asset.bytes) throw new Error("更新檔案超出簽署大小。");
      hash.update(chunk); await handle.writeFile(chunk);
    }
    if (bytes !== asset.bytes || hash.digest("hex") !== asset.sha256) throw new Error("更新檔案摘要不符，已取消安裝。");
    await handle.sync(); await handle.close(); await rename(temporary, file);
    return file;
  } catch (error) { await handle.close().catch(() => {}); await rm(temporary, { force: true }); throw error; }
}

async function* chunks(body: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  const reader = body.getReader();
  try {
    while (true) { const next = await reader.read(); if (next.done) return; yield next.value; }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
