import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fixtures } from './ir-fixtures.mts';
import { checkEnginePins, currentCatalog, compileIR, hash } from './ir-compiler.mts';
import { runIRProbes } from './ir-behavior.mts';
assert.equal(process.argv.length, 3); const out = path.resolve(process.argv[2]); assert(!fs.existsSync(out), 'REFUSE_OVERWRITE');
checkEnginePins(); const catalog = currentCatalog();
const rows = fixtures.map(f => { const built = compileIR(f.ir, f.source, catalog); return { id: f.id, probes: runIRProbes(built.compiled, f.id, catalog) }; });
checkEnginePins(); fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(rows, null, 2) + '\n', { flag: 'wx' });
const summary = { schema: 'ggd-hero12b-ir-fixture-probes@1', createdAt: new Date().toISOString(),
  behaviorScriptSha256: hash(fs.readFileSync(new URL('./ir-behavior.mts', import.meta.url))),
  total: rows.reduce((n, r) => n + r.probes.total, 0), passed: rows.reduce((n, r) => n + r.probes.passed, 0),
  completeHeroCoverage: false, trainingAdmitted: false, releaseQualified: false,
  results: rows.map(r => ({ id: r.id, total: r.probes.total, passed: r.probes.passed,
    failures: r.probes.cases.filter(c => !c.passed).map(c => ({ name: c.name, error: c.error })) })) };
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(summary, null, 2)); if (summary.total !== summary.passed) process.exitCode = 1;
