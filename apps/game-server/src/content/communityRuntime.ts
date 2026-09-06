import { inflateRawSync } from "node:zlib";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ContentStore } from "@ggd/shared/content/store";
import { buildCommunityRoomContent, captureCommunityContentBase, zCommunityHeroPin, MAX_COMMUNITY_HEROES, MAX_COMMUNITY_ROOM_ASSET_BYTES, type CommunityContentBase, type CommunityHeroPin, type CommunityRoomContent, type CommunityRoomManifest, type CommunityTarget } from "@ggd/shared/content/communityRoom";
import { buildAuthoringProcessor } from "@ggd/shared/content/import/authoringProcessor";
import { currentMigrationFingerprint } from "@ggd/shared/content/import/migrationFingerprint";
import { zHeroStoredVersion } from "@ggd/shared/content/communityHero";
import { heroImportHeaders, HERO_IMPORT_PREFIX } from "@ggd/shared/content/node/heroImportAuth";

let base: CommunityContentBase | null = null;
let target: CommunityTarget | null = null;
let loading = 0;

export function initializeCommunityRuntime(store: ContentStore, contentVersion: string): void {
  // Both services must carry the release's explicit stamp. A skeleton/dev fallback
  // may serve official testing, but must never claim compatibility with a publication.
  const gameRevision = process.env.GGD_BUILD_STAMP?.trim();
  if (!gameRevision) throw new Error("缺少遊戲建置戳記，社群英雄保持停用。");
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
  const processor = buildAuthoringProcessor(repo);
  const nextBase = captureCommunityContentBase(store);
  target = { gameRevision, contentVersion, migrationFingerprint: currentMigrationFingerprint(), processorFingerprint: processor.fingerprint };
  base = nextBase;
}

export function officialCommunityContext() { return base?.context; }

async function readMain(path: string, limit: number, signal?: AbortSignal): Promise<Uint8Array> {
  const origin = process.env.GGD_CONTENT_API_URL?.replace(/\/$/, "");
  if (!origin) throw new Error("遊戲伺服器未設定完整英雄匯入服務。");
  const timeout = AbortSignal.timeout(60000);
  const url = new URL(`${origin}${HERO_IMPORT_PREFIX}${path}`);
  const secret = process.env.GGD_HERO_IMPORT_SECRET;
  const response = await fetch(url, { headers: secret ? heroImportHeaders(secret, "GET", url.pathname + url.search) : {}, redirect: "error", signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (!response.ok || !response.body) throw new Error(`無法取得固定英雄資料（HTTP ${response.status}）。`);
  const declared = Number(response.headers.get("content-length"));
  if (declared > limit) { await response.body.cancel(); throw new Error("固定英雄資料超過容量限制。"); }
  const reader = response.body.getReader(); const parts: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.length;
      if (bytes > limit) { await reader.cancel(); throw new Error("固定英雄資料超過容量限制。"); }
      parts.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(bytes); let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

export async function readPublishedHeroPackage(raw: CommunityHeroPin, signal?: AbortSignal): Promise<Uint8Array> {
  const pin = zCommunityHeroPin.parse(raw);
  const path = `/work-versions/${encodeURIComponent(pin.workId)}/${encodeURIComponent(pin.packageDigest)}`;
  const detail = JSON.parse(new TextDecoder().decode(await readMain(path, 2 * 1024 * 1024, signal))) as { schema?: unknown; version?: unknown };
  if (detail.schema !== "ggd-work-version-detail@1") throw new Error("固定英雄版本回應格式不符。");
  // Main's storage record adds creation metadata to the portable version facts.
  // The platform snapshots the portable facts; compare that same projection.
  if (!detail.version || typeof detail.version !== "object" || Array.isArray(detail.version)) throw new Error("固定英雄版本紀錄不合法。");
  const { createdAt, ...versionFacts } = detail.version as Record<string, unknown>;
  if (typeof createdAt !== "string" || !Number.isFinite(Date.parse(createdAt))) throw new Error("固定英雄版本缺少建立時間。");
  const version = zHeroStoredVersion.parse(versionFacts);
  if (version.workId !== pin.workId || version.projectId !== pin.workId || version.versionId !== pin.packageDigest || version.packageDigest !== pin.packageDigest || version.snapshotDigest !== pin.snapshotDigest) throw new Error("固定英雄快照與核准版本不一致。");
  return readMain(`${path}/package`, 64 * 1024 * 1024, signal);
}

/** Called inside the owning game process; only JSON pins cross Colyseus RPC. */
export async function resolveCommunityRoom(raw: unknown, expected?: CommunityRoomManifest): Promise<CommunityRoomContent> {
  const pins = zCommunityHeroPin.array().min(1).max(MAX_COMMUNITY_HEROES).parse(raw);
  if (!base || !target) throw new Error("這台遊戲伺服器尚未具備相容的社群英雄執行環境。");
  if (loading >= 2) throw new Error("社群英雄正在載入中，請稍後重試開房。");
  loading++;
  try {
    const archives = new Map<string, Uint8Array>(); let bytes = 0;
    const signal = AbortSignal.timeout(80000);
    for (const pin of pins) {
      const archive = await readPublishedHeroPackage(pin, signal); bytes += archive.length;
      if (bytes > MAX_COMMUNITY_ROOM_ASSET_BYTES) throw new Error("社群英雄套件合計超過房間容量限制。");
      archives.set(pin.workId, archive);
    }
    return buildCommunityRoomContent({ base, target, pins, archives, expected, inflate: (bytes, maxBytes) => new Uint8Array(inflateRawSync(bytes, { maxOutputLength: maxBytes })) });
  } finally { loading--; }
}
