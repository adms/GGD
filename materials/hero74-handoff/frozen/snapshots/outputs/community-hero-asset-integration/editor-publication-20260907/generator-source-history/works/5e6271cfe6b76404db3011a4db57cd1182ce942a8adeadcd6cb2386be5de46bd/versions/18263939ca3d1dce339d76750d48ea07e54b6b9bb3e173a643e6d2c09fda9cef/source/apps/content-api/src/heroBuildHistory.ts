import { snapshotHeroGenerator, snapshotHeroProcessor } from "@ggd/shared/content/import/heroBuildSources";
import { ImportStore } from "./importStore";

/** Keep the actual source bytes and dependency locks behind each published
 * processor identity. A package cannot upload executable generator sources. */
export function retainHeroBuildSources(repoRoot: string, store: ImportStore, expectedProcessor: string) {
  const processor = snapshotHeroProcessor(repoRoot);
  if (processor.processorFingerprint !== expectedProcessor) throw new Error("生成程式已與服務啟動版本不同，請重新啟動服務並取得目前目標後再建包。");
  const generator = snapshotHeroGenerator(repoRoot);
  for (const [path, bytes] of generator.files) {
    const compiledSource = processor.files.get(path);
    if (path.startsWith("source/") && compiledSource && !Buffer.from(bytes).equals(Buffer.from(compiledSource))) throw new Error("生成器與建包處理器來源在保存期間變更，請重新建包。");
  }
  for (const source of [generator, processor]) {
    const workId = `ggd-${source.kind}-source`;
    store.putWorkVersion({ workId, projectId: workId, packageDigest: source.versionId }, source.files, { reuseUnchangedFrom: store.listWorkVersions(workId)[0]?.versionId });
  }
  return { generatorVersion: generator.versionId, processorVersion: processor.versionId, processorFingerprint: processor.processorFingerprint };
}
