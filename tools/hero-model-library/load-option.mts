import { defaultEligible } from './default-policy.mts';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { verifyUploadedHeroModel } from '../../packages/shared/src/content/modelUpload/heroModel';
import { zHeroModelProvenance } from '../../packages/shared/src/content/modelUpload/provenance';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));

/** The Git manifest is the authoring source. Bytes must be hydrated from its pinned S3 release. */
export async function loadPreferredLibraryModel(projectId: string, contentRoot = resolve(repo, 'content')) {
  const manifest = read(resolve(repo, 'materials/hero-model-library/manifest.json'));
  const hero = manifest.heroes.find((row: any) => row.id === projectId);
  if (!hero?.options.length) return null;
  const option = [...hero.options].filter((o: any) => defaultEligible(projectId, o)).sort((a: any, b: any) => manifest.priority.indexOf(a.source.tier) - manifest.priority.indexOf(b.source.tier))[0];
  if (!option) return null;
  const model = manifest.models.find((row: any) => row.id === option.sourceId);
  if (!model) throw Error('Missing library model definition: ' + option.sourceId);
  const inside = (relative: string) => {
    const path = realpathSync(resolve(contentRoot, relative));
    if (!path.startsWith(realpathSync(contentRoot) + sep)) throw Error('Model dependency escapes content root');
    return path;
  };
  const raw = readFileSync(inside(`models/${model.modelKey}.json`));
  if (createHash('sha256').update(raw).digest('hex') !== model.documentSha256) throw Error('Library model binding changed');
  const doc = JSON.parse(raw.toString('utf8'));
  const bytes = new Uint8Array(readFileSync(inside(doc.glbPath)));
  const verified = await verifyUploadedHeroModel({ schema: 'ggd-uploaded-hero-model@1', sha256: model.sha256, byteSize: model.bytes, clipMap: doc.clipMap, yawOffsetDeg: doc.yawOffsetDeg ?? 0 }, bytes);
  if (verified.document.id !== doc.id) throw Error('Library model identity mismatch');
  const provenance = zHeroModelProvenance.parse({ schema: 'ggd-hero-model-provenance@1', modelSha256: model.sha256,
    sourceAssetId: model.sourceAssetId, sourceCharacter: model.sourceCharacter, sourceWork: model.sourceWork,
    relationship: option.source.kind, notes: model.limitations.join(' ') || manifest.scope });
  return { ...verified, bytes, provenance, sourceId: option.sourceId };
}
