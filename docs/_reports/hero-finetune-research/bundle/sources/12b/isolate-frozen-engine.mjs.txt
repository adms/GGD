/** Copy-only evaluation sandbox; never changes another task's checkout. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sha } from './intake.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../..');
const out = path.resolve(process.argv[2]); assert.equal(path.dirname(out), here); assert(!fs.existsSync(out));
const repo = path.join(root, 'GGD-community-hero-forge'), copyRepo = path.join(out, 'GGD-community-hero-forge');
const destination = path.join(out, 'outputs', path.basename(here));
const pins = JSON.parse(fs.readFileSync(path.join(here, 'current-engine-v1/source-pins.json'), 'utf8'));
const snapshot = JSON.parse(fs.readFileSync(path.join(here, 'current-engine-v1/manifest.json'), 'utf8'));
fs.mkdirSync(destination, { recursive: true }); fs.mkdirSync(path.join(copyRepo, 'packages'), { recursive: true });
fs.cpSync(path.join(repo, 'packages/shared'), path.join(copyRepo, 'packages/shared'),
  { recursive: true, filter: p => path.basename(p) !== 'node_modules' });
fs.cpSync(path.join(repo, 'content'), path.join(copyRepo, 'content'), { recursive: true });
for (const f of ['package.json', 'tsconfig.json']) if (fs.existsSync(path.join(repo, f))) fs.copyFileSync(path.join(repo, f), path.join(copyRepo, f));
for (const d of ['node_modules', 'packages/shared/node_modules']) fs.symlinkSync(path.join(repo, d), path.join(copyRepo, d), 'dir');
const restored = [];
for (const p of pins) {
  const file = path.join(out, p.path);
  if (fs.existsSync(file) && sha(fs.readFileSync(file)) === p.sha256) continue;
  const rel = path.relative(repo, path.join(root, p.path)); assert(!rel.startsWith('..'));
  const bytes = execFileSync('git', ['show', `${snapshot.head}:${rel}`], { cwd: repo, maxBuffer: 64 * 1024 ** 2 });
  assert.equal(sha(bytes), p.sha256, `HISTORICAL_BLOB_NOT_PINNED:${rel}`);
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes);
  restored.push({ path: p.path, sourceCommit: snapshot.head, sha256: p.sha256 });
}
for (const p of pins) assert.equal(sha(fs.readFileSync(path.join(out, p.path))), p.sha256);
for (const f of fs.readdirSync(here)) if (/\.(mjs|mts|py)$/.test(f)) fs.copyFileSync(path.join(here, f), path.join(destination, f));
for (const d of ['current-engine-v1', 'semantic-facts-base-v2', 'ir2-jsonschema-smoke-v1', 'lora-facts-pilot-v1'])
  fs.cpSync(path.join(here, d), path.join(destination, d), { recursive: true });
const receipt = { schema: 'ggd-frozen-engine-copy@1', createdAt: new Date().toISOString(),
  root: out, researchDirectory: destination, sourcePins: pins.length, restored, copiedContentNeedsCatalogVerification: true,
  dependencyLink: 'Existing installed node_modules only; source and content are copies.',
  originalCheckoutModified: false, reason: 'another task changed source after baseline; evaluate both stages using frozen source bytes' };
fs.writeFileSync(path.join(out, 'COPY_RECEIPT.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(receipt, null, 2));
