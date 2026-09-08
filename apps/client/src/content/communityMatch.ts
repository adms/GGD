import { buildCommunityRoomContent, captureCommunityContentBase, verifyCommunityRoomManifest, zCommunityTarget, MAX_COMMUNITY_ROOM_ASSET_BYTES, type CommunityContentBase, type CommunityRoomManifest } from "@ggd/shared/content/communityRoom";
import type { ContentStore } from "@ggd/shared/content/store";
import { installRegistryContextProvider, captureRegistryContext, extendRegistryContext, type RegistryContext } from "@ggd/shared/sim/content/registryContext";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { Configs, type ConfigVfxAbilityArtDoc, type ConfigVfxFamiliesDoc } from "@ggd/shared/content";
import { setAbilityArtBindings } from "../render/vfx/abilityArtContent";
import { mintTunedFamilyDocs } from "../render/vfx/w3xAbilityArt";
import { api } from "../ui/platform/api";
import { setFrozenMatchAssetUrls } from "./frozenAssets";
import { clientCommunityIdentity } from "./communityIdentity";

let base: CommunityContentBase | null = null;
let contentVersion = "";
let active: RegistryContext | undefined;
let providerInstalled = false;
let installed: CommunityRoomManifest | null = null;
let phase = "";
const listeners = new Set<() => void>();
export const communityLoadingSnapshot = () => phase;
export const subscribeCommunityLoading = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function setCommunityLoading(message: string): void { phase = message; for (const listener of listeners) listener(); }
export function activeCommunityManifest(): CommunityRoomManifest | null { return installed; }
export function assertCommunityState(raw: string | undefined): void {
  const manifest = raw ? verifyCommunityRoomManifest(JSON.parse(raw)) : null;
  if ((manifest?.digest ?? null) !== (installed?.digest ?? null)) throw new Error("伺服器對局內容與已驗證版本不同，已停止進場。請重新開啟對局或回放。");
}
export function captureClientCommunityBase(store: ContentStore, version: string): void { base = captureCommunityContentBase(store); contentVersion = version; }

async function readArchive(response: Response, current: () => boolean): Promise<Uint8Array> {
  const max = 64 * 1024 * 1024;
  if (!response.body || Number(response.headers.get("content-length")) > max) { await response.body?.cancel(); throw new Error("完整英雄下載超過容量限制。"); }
  const reader = response.body.getReader(); const parts: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      if (!current()) { await reader.cancel(); throw new Error("進場已取消。"); }
      length += chunk.value.length;
      if (length > max) { await reader.cancel(); throw new Error("完整英雄下載超過容量限制。"); }
      parts.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return bytes;
}

export interface CommunityContentLease { activate(): void; dispose(): void }

async function prepareContent(expected: CommunityRoomManifest, current: () => boolean, transport: {
  download(workId: string): Promise<Response>;
  ready(): Promise<void>;
}): Promise<CommunityContentLease> {
  const identity = clientCommunityIdentity();
  if (!base || !identity) throw new Error("此客戶端尚未支援固定版本社群英雄，請更新遊戲。");
  if (active) throw new Error("上一場對局尚未結束，無法載入另一份內容。");
  // GameApp normally registers these at construction. Community content must
  // include them before sealing, while later official games retain that setup.
  registerSkeletonContent();
  const matchBase = { ...base, context: captureRegistryContext(base.digest) };
  const target = zCommunityTarget.parse({ ...identity, contentVersion });
  const archives = new Map<string, Uint8Array>();
  let archiveBytes = 0;
  for (const [index, hero] of expected.heroes.entries()) {
    if (!current()) throw new Error("進場已取消。");
    setCommunityLoading(`正在核對並下載社群英雄 ${index + 1}/${expected.heroes.length}：${hero.name}`);
    const bytes = await readArchive(await transport.download(hero.workId), current);
    archiveBytes += bytes.length;
    if (archiveBytes > MAX_COMMUNITY_ROOM_ASSET_BYTES) throw new Error("完整英雄套件合計超過房間容量限制。");
    archives.set(hero.workId, bytes);
  }
  if (!current()) throw new Error("進場已取消。");
  setCommunityLoading("正在校驗完整英雄與房間固定版本…");
  const content = buildCommunityRoomContent({ base: matchBase, target, pins: expected.heroes, archives, expected });
  // The renderer normally derives tuned family docs during ContentDb.load.
  // Build those from this snapshot before sealing; never write a live registry.
  const context = extendRegistryContext(content.context, `${expected.digest}:presentation`, () => {
    const bindings = Configs.tryGet("vfx-ability-art") as ConfigVfxAbilityArtDoc | undefined;
    if (bindings) setAbilityArtBindings(bindings);
    mintTunedFamilyDocs(Configs.tryGet("vfx-families") as ConfigVfxFamiliesDoc | undefined ?? null);
  });
  const urls = new Map<string, string>();
  try {
    for (const asset of expected.assets) urls.set(asset.path, URL.createObjectURL(new Blob([Uint8Array.from(content.assets.get(asset.path)!)], { type: asset.mime })));
    if (!current()) throw new Error("進場已取消。");
    await transport.ready();
    if (!current()) throw new Error("房間版本已改變或進場已取消。");
    let disposed = false;
    return {
      activate() {
        if (disposed || !current()) throw new Error("進場已取消。");
        if (active && active !== context) throw new Error("上一場對局尚未結束，無法替換固定內容。");
        if (!providerInstalled) { installRegistryContextProvider(() => active); providerInstalled = true; }
        active = context; installed = expected; setFrozenMatchAssetUrls(urls);
      },
      dispose() {
        disposed = true;
        if (active === context) { active = undefined; installed = null; setFrozenMatchAssetUrls(null); }
        for (const url of urls.values()) URL.revokeObjectURL(url);
      },
    };
  } catch (error) { for (const url of urls.values()) URL.revokeObjectURL(url); throw error; }
}

/** Called before GameApp construction and before consuming any seat token. */
export async function prepareCommunityMatch(matchId: string, raw: unknown, current: () => boolean): Promise<CommunityContentLease> {
  const expected = verifyCommunityRoomManifest(raw);
  const signal = AbortSignal.timeout(90000);
  const live = verifyCommunityRoomManifest(await api.request(`/community-matches/${encodeURIComponent(matchId)}`, { signal }));
  if (live.digest !== expected.digest || !current()) throw new Error("房間內容與進場通知不同，請重新進場。");
  return prepareContent(expected, current, {
    download: (workId) => api.binaryResponse(`/community-matches/${encodeURIComponent(matchId)}/heroes/${encodeURIComponent(workId)}`, { signal }),
    async ready() {
      const receipt = verifyCommunityRoomManifest(await api.request(`/community-matches/${encodeURIComponent(matchId)}/ready`, { body: { digest: expected.digest }, signal }));
      if (receipt.digest !== expected.digest) throw new Error("房間版本已改變，請重新進場。");
    },
  });
}

/** Replay tickets authorize exactly one recording; publication state is irrelevant. */
export async function prepareReplayCommunity(replayId: string, ticket: string, current: () => boolean): Promise<CommunityContentLease | null> {
  // Unsigned local recordings predate community content and keep their existing path.
  if (!ticket) return null;
  const options = { auth: false, body: { ticket }, signal: AbortSignal.timeout(90000) };
  const reply = await api.request<{ communityContent: unknown }>(`/replay-content/${encodeURIComponent(replayId)}`, options);
  if (!current()) throw new Error("回放已取消。");
  if (reply.communityContent === null) return null;
  const expected = verifyCommunityRoomManifest(reply.communityContent);
  return prepareContent(expected, current, {
    download: (workId) => api.binaryResponse(`/replay-content/${encodeURIComponent(replayId)}/heroes/${encodeURIComponent(workId)}`, options),
    ready: async () => {},
  });
}
