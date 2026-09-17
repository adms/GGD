/** Read current counts from the same tracked authority used by roster:check. */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { balancePopulationIds, BALANCE_POPULATION_PROVENANCE } from '../../packages/shared/testkit/balancePopulation.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const definitions = readdirSync(resolve(root, 'content/champions'))
  .filter(name => name.endsWith('.json') && !name.startsWith('_'))
  .map(name => JSON.parse(readFileSync(resolve(root, 'content/champions', name), 'utf8')).id)
  .sort();
if (!definitions.length || new Set(definitions).size !== definitions.length) {
  throw new Error('Current champion definitions must be nonempty and have unique IDs.');
}
const selectable = balancePopulationIds(root);
if (selectable.some(id => !definitions.includes(id))) throw new Error('Selectable roster contains missing champion definitions.');
console.log(JSON.stringify({
  definitionCount: definitions.length,
  selectableCount: selectable.length,
  definitionIds: definitions,
  selectableIds: selectable,
  provenance: BALANCE_POPULATION_PROVENANCE,
  productionVerified: false,
}));
