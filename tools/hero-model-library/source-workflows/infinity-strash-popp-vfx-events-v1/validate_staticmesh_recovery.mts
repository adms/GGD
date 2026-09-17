import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';

const manifestPath = resolve(process.argv[2] ?? '');
const outputPath = resolve(process.argv[3] ?? '');
if (!process.argv[2] || !process.argv[3]) {
  throw new Error('usage: validate_staticmesh_recovery.mts <source-manifest.json> <output.json>');
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.schema !== 'ggd.infinity-strash-popp-vfx-staticmesh-recovery@1') {
  throw new Error(`unexpected schema: ${manifest.schema}`);
}
const require = createRequire(resolve('packages/shared/package.json'));
const validator = require('gltf-validator');
const rows = [];
for (const item of manifest.files) {
  const path = resolve(item.absolutePath);
  const bytes = readFileSync(path);
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== item.sha256 || bytes.length !== item.bytes) throw new Error(`byte drift: ${path}`);
  const report = await validator.validateBytes(new Uint8Array(bytes), {
    uri: item.path,
    maxIssues: 1000,
    writeTimestamp: false,
    externalResourceFunction: async () => { throw new Error('external GLB resource rejected'); },
  });
  rows.push({path: item.path, bytes: item.bytes, sha256: item.sha256, issues: report.issues});
}
const summary = {
  files: rows.length,
  errors: rows.reduce((sum, row) => sum + row.issues.numErrors, 0),
  warnings: rows.reduce((sum, row) => sum + row.issues.numWarnings, 0),
  infos: rows.reduce((sum, row) => sum + row.issues.numInfos, 0),
  hints: rows.reduce((sum, row) => sum + row.issues.numHints, 0),
  truncatedReports: rows.filter((row) => row.issues.truncated).length,
};
const result = {
  schema: 'ggd.infinity-strash-popp-vfx-staticmesh-khronos-validation@1',
  inputManifest: manifestPath,
  validator: 'gltf-validator@2.0.0-dev.3.10',
  options: {maxIssues: 1000, writeTimestamp: false, externalResources: 'rejected'},
  summary,
  rows,
};
writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({output: outputPath, ...summary}));
if (summary.errors || summary.warnings || summary.truncatedReports) process.exitCode = 1;
