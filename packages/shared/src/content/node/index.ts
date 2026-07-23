/**
 * NODE-ONLY content helpers (`@ggd/shared/content/node`) — fs source + tree
 * maintenance. Kept out of "./content" so browser bundles never see node:fs.
 */
export { FsContentSource } from "./FsContentSource";
export {
  docFileName,
  docPath,
  fileJson,
  writeDocAtomic,
  deleteDocFile,
  rebuildCollectionIndex,
  rebuildManifest,
  rebuildAllIndexes,
  bundlePath,
  writeContentBundle,
  deleteContentBundle,
} from "./fsStore";
