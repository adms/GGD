import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** Private Main work-import channel. Sign the method, exact request target,
 * body digest and operation identity; a valid build request cannot be replayed
 * as a publication, another work, or an official-content mutation.
 */
export const HERO_IMPORT_PREFIX = "/api/v1/content-import";
export const heroImportBodyDigest = (body: Uint8Array): string => createHash("sha256").update(body).digest("hex");
export function signHeroImport(secret: string, method: string, target: string, headers: Readonly<Record<string, string>>): string {
  const message = ["ggd-hero-import@1", headers["x-ggd-import-time"], method, target, headers["x-ggd-import-body"], headers["x-ggd-work-id"] ?? "", headers["x-ggd-operation-id"] ?? ""].join("\n");
  return createHmac("sha256", secret).update(message).digest("hex");
}
export function heroImportHeaders(secret: string, method: string, target: string, body = new Uint8Array(), identity: Record<string, string> = {}, now = Math.floor(Date.now() / 1000)): Record<string, string> {
  const headers = { ...identity, "x-ggd-import-time": String(now), "x-ggd-import-body": heroImportBodyDigest(body) };
  return { ...headers, "x-ggd-import-auth": signHeroImport(secret, method, target, headers) };
}
export function verifyHeroImport(secret: string, method: string, target: string, headers: Readonly<Record<string, string>>, now = Math.floor(Date.now() / 1000)): boolean {
  if (secret.length < 32 || !/^\d{10}$/.test(headers["x-ggd-import-time"] ?? "") || Math.abs(now - Number(headers["x-ggd-import-time"])) > 30 || !/^[a-f0-9]{64}$/.test(headers["x-ggd-import-body"] ?? "") || !/^[a-f0-9]{64}$/.test(headers["x-ggd-import-auth"] ?? "")) return false;
  return timingSafeEqual(Buffer.from(headers["x-ggd-import-auth"]!, "hex"), Buffer.from(signHeroImport(secret, method, target, headers), "hex"));
}
