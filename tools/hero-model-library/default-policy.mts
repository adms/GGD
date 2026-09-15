import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { modelGameReleaseDate } from '../../packages/shared/src/content/schema/championModelVersions';
const file = fileURLToPath(new URL('../../materials/hero-model-library/default-policy.json', import.meta.url));
export const defaultPolicy = JSON.parse(readFileSync(file, 'utf8'));

/**
 * Fill the provenance fields added after the first immutable model versions were registered.
 * Unknown platform/game values stay explicit rather than being inferred from a character IP.
 */
function sourceMetadata(source: any) {
  const library = String(source.library ?? '');
  const lower = library.toLowerCase();
  let sourceGame = library || 'unknown source game';
  let sourcePlatform = 'unknown (source record does not specify platform)';
  const release: Record<string,string> = {};
  if (lower === '300heroes') {
    sourceGame = '300英雄'; sourcePlatform = 'Windows';
  } else if (lower === 'mba') {
    sourceGame = 'Magical Battle Arena'; sourcePlatform = 'Windows';
  } else if (lower === 'lol') {
    sourceGame = 'League of Legends'; sourcePlatform = 'Windows / macOS';
    release.sourceGameReleaseReference = 'https://www.riotgames.com/darkroom/original/8e2a0ca2dbd5c484ff503513ed591f32%3Adb0dce6771e17a4e90bf6ba43a32c7ab/leagueoflegends-fact-sheet.pdf';
  } else if (lower === 'w3x' || lower === 'ou99') {
    sourceGame = 'Warcraft III community model'; sourcePlatform = 'Windows';
    release.sourceGameReleaseReference = 'https://news.blizzard.com/en-us/article/22636891/loktar-ogar-warcraft-iii-reforged-announced-at-blizzcon';
  } else if (lower.startsWith('lethal company mod')) {
    sourceGame = 'Lethal Company'; sourcePlatform = 'Windows';
    release.sourceGameReleasedAt = '2023-10-23';
    release.sourceGameReleaseReference = 'https://store.steampowered.com/app/1966720/Lethal_Company/';
  } else if (lower.startsWith('gta v mod')) {
    sourceGame = 'Grand Theft Auto V'; sourcePlatform = 'Windows';
  } else if (lower.startsWith('gta sa')) {
    sourceGame = 'Grand Theft Auto: San Andreas'; sourcePlatform = 'Windows';
  } else if (lower.startsWith('3ds ')) {
    sourceGame = library.split('／')[0]!.trim(); sourcePlatform = 'Nintendo 3DS';
  } else if (lower === 'original') {
    sourceGame = 'GGD procedural asset'; sourcePlatform = 'GGD runtime';
  }
  return {
    sourceGame: source.sourceGame ?? sourceGame,
    sourcePlatform: source.sourcePlatform ?? sourcePlatform,
    ...(source.sourceGameReleasedAt ? {} : release.sourceGameReleasedAt ? {sourceGameReleasedAt:release.sourceGameReleasedAt} : {}),
    ...(source.sourceGameReleaseReference ? {} : release.sourceGameReleaseReference ? {sourceGameReleaseReference:release.sourceGameReleaseReference} : {}),
  };
}
export function selectionSource(heroId: string, option: {sourceId: string; sourceModelKey: string; source: any}) {
  const approved = defaultPolicy.approvedDerivatives.some((a: any) => a.heroId === heroId && a.sourceId === option.sourceId && a.modelKey === option.sourceModelKey);
  const selectionClass = approved ? defaultPolicy.approvedDerivativePriority : defaultPolicy.sourceClassOverrides[option.sourceId] ?? option.source.selectionClass ?? (option.source.kind === 'style-proxy' ? 'similar-proxy' : option.source.tier);
  return {...option.source, ...sourceMetadata(option.source), selectionClass};
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
  return [...defaultPolicy.approvedDerivatives, ...(defaultPolicy.approvedWorkflowDefaults ?? [])].some((a: any) => a.heroId === heroId && a.sourceId === option.sourceId && a.modelKey === option.sourceModelKey);
}
