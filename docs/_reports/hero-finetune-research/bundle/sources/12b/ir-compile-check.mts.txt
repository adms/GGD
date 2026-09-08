import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { fixtures } from './ir-fixtures.mts';
import { checkEnginePins, currentCatalog, compileIR, hash } from './ir-compiler.mts';
const here = path.dirname(fileURLToPath(import.meta.url));
assert.equal(process.argv.length, 3, 'USAGE: node --import tsx ir-compile-check.mts NEW_OUTPUT_DIRECTORY');
const out = path.resolve(process.argv[2]); assert(!fs.existsSync(out), 'REFUSE_OVERWRITE');
checkEnginePins();
const catalog = currentCatalog(), rows: any[] = [];
for (const fixture of fixtures) {
  try { rows.push({ id: fixture.id, ok: true, ...compileIR(fixture.ir, fixture.source, catalog) }); }
  catch (e) { rows.push({ id: fixture.id, ok: false, error: String(e), stack: e instanceof Error ? e.stack : null }); }
}
checkEnginePins(); fs.mkdirSync(out, { recursive: true });
const put = (f: string, v: any) => fs.writeFileSync(path.join(out, f), JSON.stringify(v, null, 2) + '\n', { flag: 'wx' });
put('fixtures.private.json', fixtures); put('results.private.json', rows);
const manifest = { schema: 'ggd-hero12b-ir-compiler-check@1', createdAt: new Date().toISOString(),
  counts: { attemptedHeroes: rows.length, compiled: rows.filter(r => r.ok).length, semanticsVerified: 0, trainingAdmitted: 0 },
  source: 'manual-source-review-development-fixtures-not-model-output', gpuCalls: 0,
  pins: Object.fromEntries(['semantic-ir.mts', 'ir-compiler.mts', 'ir-fixtures.mts', 'ir-compile-check.mts'].map(f => [f, hash(fs.readFileSync(path.join(here, f)))])),
  releaseQualified: false };
put('manifest.json', manifest);
console.log(JSON.stringify({ ...manifest, results: rows.map(r => ({ id: r.id, ok: r.ok, gaps: r.lowered?.gaps, error: r.error })) }, null, 2));
if (rows.some(r => !r.ok)) process.exitCode = 1;
