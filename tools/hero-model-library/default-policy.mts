import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const file = fileURLToPath(new URL('../../materials/hero-model-library/default-policy.json', import.meta.url));
export const defaultPolicy = JSON.parse(readFileSync(file, 'utf8'));
export function defaultEligible(heroId: string, option: {sourceId: string; sourceModelKey: string; source: {kind: string}}): boolean {
  if (option.source.kind !== 'style-proxy') return true;
  return defaultPolicy.approvedDerivatives.some((a: any) => a.heroId === heroId && a.sourceId === option.sourceId && a.modelKey === option.sourceModelKey);
}
