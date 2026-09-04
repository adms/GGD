import { canonicalizeJcs, compareUtf8Bytes } from "@ggd/shared/content/import/jcs";
import { binarySha256, deterministicStoredZip } from "../export-center/exportBuilder";
import type { StagedLocalIcon } from "./model";

const UTF8 = new TextEncoder();

export async function buildLocalIconBundleZip(icons: readonly StagedLocalIcon[]): Promise<{
  bytes: Uint8Array;
  archiveSha256: string;
  bundleSha256: string;
  filename: string;
  count: number;
}> {
  if (icons.length === 0) throw new Error("沒有本機暫存 Icon 可打包");
  const sorted = [...icons].sort((a, b) => compareUtf8Bytes(a.sourcePath, b.sourcePath));
  const seen = new Set<string>();
  const files: Array<{ path: string; bytes: Uint8Array }> = [];
  const entries: Array<{ path: string; mimeType: string; contentSha256: string; contentSize: number; owner: string }> = [];
  for (const icon of sorted) {
    if (seen.has(icon.sourcePath)) throw new Error(`Icon 路徑重複：${icon.sourcePath}`);
    seen.add(icon.sourcePath);
    if (icon.contentPath !== `assets/icons/${icon.kind}/${icon.docId}.webp`) {
      throw new Error(`Icon 路徑與 owner 不一致：${icon.contentPath}`);
    }
    if (!icon.sourcePreserved || icon.blob.type !== icon.mimeType) {
      throw new Error(`${icon.sourcePath} 不是可驗證的原始來源`);
    }
    const bytes = new Uint8Array(await icon.blob.arrayBuffer());
    const digest = await binarySha256(bytes);
    if (digest !== icon.contentSha256 || bytes.length !== icon.bytes) {
      throw new Error(`${icon.sourcePath} 的本機 bytes／hash 已漂移`);
    }
    files.push({ path: icon.sourcePath, bytes });
    entries.push({
      path: icon.sourcePath,
      mimeType: icon.mimeType,
      contentSha256: digest,
      contentSize: bytes.length,
      owner: `${icon.kind}/${icon.docId}`,
    });
  }
  const unsigned = {
    schema: "ggd-editor-icon-source-bundle@1",
    note: "工作備份；正式匯入請使用 Export Center 的 ggd-editor-import@1 ZIP。Main 負責唯一轉檔。",
    entries,
  } as const;
  const bundleSha256 = await binarySha256(UTF8.encode(canonicalizeJcs(unsigned)));
  const manifest = { ...unsigned, bundleSha256 };
  const zipBytes = deterministicStoredZip([
    { path: "manifest.json", bytes: UTF8.encode(`${canonicalizeJcs(manifest)}\n`) },
    ...files,
  ]);
  const archiveSha256 = await binarySha256(zipBytes);
  return {
    bytes: zipBytes,
    archiveSha256,
    bundleSha256,
    filename: `ggd-icons-${bundleSha256.slice("sha256:".length, "sha256:".length + 12)}.zip`,
    count: entries.length,
  };
}
