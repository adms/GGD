import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { modelGameReleaseDate } from '../../packages/shared/src/content/schema/championModelVersions';
const file = fileURLToPath(new URL('../../materials/hero-model-library/default-policy.json', import.meta.url));
export const defaultPolicy = JSON.parse(readFileSync(file, 'utf8'));
export function selectionSource(heroId: string, option: {sourceId: string; sourceModelKey: string; source: any}) {
  const approved = defaultPolicy.approvedDerivatives.some((a: any) => a.heroId === heroId && a.sourceId === option.sourceId && a.modelKey === option.sourceModelKey);
  const selectionClass = approved ? defaultPolicy.approvedDerivativePriority : defaultPolicy.sourceClassOverrides[option.sourceId] ?? option.source.selectionClass ?? (option.source.kind === 'style-proxy' ? 'similar-proxy' : option.source.tier);
  return selectionClass === option.source.tier && !option.source.selectionClass ? {...option.source} : {...option.source, selectionClass};
}
export function selectionRank(heroId: string, option: {sourceId: string; sourceModelKey: string; source: any}): number {
  const rank = defaultPolicy.priority.indexOf(selectionSource(heroId, option).selectionClass ?? option.source.tier);
  if (rank < 0) throw Error('Unknown model selection class');
  return rank;
}
export function compareSelection(heroId: string, a: {sourceId: string; sourceModelKey: string; source: any}, b: {sourceId: string; sourceModelKey: string; source: any}): number {
  return selectionRank(heroId,a)-selectionRank(heroId,b) || modelGameReleaseDate(b.source).localeCompare(modelGameReleaseDate(a.source));
}
export function defaultEligible(heroId: string, option: {sourceId: string; sourceModelKey: string; source: {kind: string}}): boolean {
  if (option.source.kind !== 'style-proxy') return true;
  return defaultPolicy.approvedDerivatives.some((a: any) => a.heroId === heroId && a.sourceId === option.sourceId && a.modelKey === option.sourceModelKey);
}
