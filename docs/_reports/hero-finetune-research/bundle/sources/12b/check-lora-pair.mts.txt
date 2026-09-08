import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { gradeFact, gradeHero } from './evaluate-lora-pilot.mts';
import { checkEnginePins, currentCatalog } from './ir-compiler.mts';
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string) => JSON.parse(fs.readFileSync(path.join(here, p), 'utf8'));
const data = read('semantic-facts-base-v2/dataset.private.json'), raw = read('semantic-facts-base-v2/raw.json');
const facts = data.map((r: any, i: number) => gradeFact(r, raw.results[i]));
assert.equal(facts.filter((r: any) => r.jsonValid).length, 12);
assert.equal(facts.filter((r: any) => r.strictContractValid).length, 10);
assert.equal(facts.reduce((n: number, r: any) => n + r.verdictCorrect, 0), 71);
const gold = data[0], sample = (value: any) => ({ id: gold.id, requestDigest: gold.requestDigest,
  envelope: { channel: 'final', finishReason: 'stop', text: JSON.stringify(value) } });
assert.equal(gradeFact(gold, sample(gold.target)).verdictCorrect, 6);
const duplicate = structuredClone(gold.target); duplicate.claims[0] = duplicate.claims[1];
assert.equal(gradeFact(gold, sample(duplicate)).strictContractValid, false);
assert.equal(gradeFact(gold, sample(duplicate)).verdictCorrect, 4);
const invalid = sample(gold.target); invalid.envelope.text = '{"claims":[';
assert.equal(gradeFact(gold, invalid).verdictCorrect, 0);
assert.equal(gradeFact(gold, invalid).allClaims, 6);
const truncated = sample(gold.target); truncated.envelope.finishReason = 'length';
assert.equal(gradeFact(gold, truncated).jsonValid, false);
const wrong = structuredClone(gold.target), refuted = wrong.claims.find((c: any) => c.verdict === 'refuted');
refuted.verdict = 'supported';
assert.equal(gradeFact(gold, sample(wrong)).wrongSupport, 1);
checkEnginePins(); const catalog = currentCatalog();
const requests = read('ir2-jsonschema-smoke-v1/requests.json'), base = read('ir2-jsonschema-smoke-v1/raw.json');
const heroes = requests.map((req: any, i: number) => gradeHero(req, base.results[i], catalog).row);
assert.equal(heroes.filter((r: any) => r.compiled).length, 2);
assert.equal(heroes.reduce((n: number, r: any) => n + (r.probes?.passed ?? 0), 0), 7);
const lee = heroes.find((r: any) => r.id === 'community7-leesin');
assert.equal(lee.negatives.total, 3); assert.equal(lee.negatives.passed, 0);
checkEnginePins();
const receipt = { schema: 'ggd-lora-pair-preflight-checks@2', directAssertionsPassed: 14,
  baseFactScoresReproduced: { json: 12, strict: 10, verdictCorrect: 71, allClaims: 96 },
  baseWholeHeroScoresReproduced: { compiled: 2, partialProbesPassed: 7, addedLeeNegativesFailed: 3 },
  malformedMissingDuplicateTruncationAndWrongSupportRejected: true,
  sourcePinsVerified: 1668, catalogDocumentsVerified: catalog.documents.size, releaseQualified: false };
fs.writeFileSync(path.join(here, 'LORA_PAIR_CPU_CHECKS_V2.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(receipt, null, 2));
