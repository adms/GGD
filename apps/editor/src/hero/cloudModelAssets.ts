import { sha256Bytes } from "@ggd/shared/content/sha256";
import { heroModelFileRefs, loadHeroModelBytes, saveHeroModelBytes } from "./modelAssets";
import { heroPlatform, useHeroAccount } from "./communitySession";
import type { HeroDraftPayload } from "./store";

function sameAccount(accountId: string): void { if (useHeroAccount.getState().account?.id !== accountId) throw new Error("登入帳號已切換，模型原檔仍保存在本機。"); }
export async function syncHeroModelAssets(value: HeroDraftPayload, accountId: string): Promise<void> {
  for (const ref of heroModelFileRefs(value)) {
    sameAccount(accountId);
    const bytes = await loadHeroModelBytes(ref.sha256);
    if (bytes.length !== ref.bytes) throw new Error("模型原檔大小與草稿不符。");
    const response = await heroPlatform.binaryResponse(`/hero-model-assets/${ref.sha256}`, new Blob([Uint8Array.from(bytes)], { type: "model/gltf-binary" }), { method: "PUT", contentType: "model/gltf-binary" });
    const receipt = await response.json() as { sha256?: string; bytes?: number };
    sameAccount(accountId);
    if (receipt.sha256 !== ref.sha256 || receipt.bytes !== bytes.length) throw new Error("雲端模型版本回應不符，未更新草稿。");
  }
}
export async function restoreCloudHeroModels(value: HeroDraftPayload, accountId: string): Promise<void> {
  for (const ref of heroModelFileRefs(value)) {
    sameAccount(accountId);
    try { if ((await loadHeroModelBytes(ref.sha256)).length === ref.bytes) continue; } catch { /* Restore the fixed version from this account's private storage. */ }
    const response = await heroPlatform.binaryResponse(`/hero-model-assets/${ref.sha256}`);
    const blob = await response.blob(); sameAccount(accountId);
    if (blob.size !== ref.bytes) throw new Error("雲端模型原檔大小不符。");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (sha256Bytes(bytes) !== ref.sha256) throw new Error("雲端模型原檔完整性檢查失敗。");
    await saveHeroModelBytes(bytes, ref.name);
  }
}
