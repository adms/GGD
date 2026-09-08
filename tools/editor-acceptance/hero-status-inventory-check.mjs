import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const directory = path.join(root, 'docs/_reports/hero-character-status-20260909');
const counts = { listed: 45, hidden: 4, retired: 6, legacy: 36, builtin: 2, community: 37, prototype: 7, alternate: 26 };
const labels = {
  listed: '已列預設上架白名單', hidden: '已列預設上架白名單／隱藏角色',
  retired: '已下架（本體）', legacy: '未上架／歷史庫', builtin: '內建示範／非預設上架名單',
  community: '社群機制審查／修正中；正式未發布', prototype: '工坊原型；無正式上架證據',
  alternate: '變身形態；非獨立選角項目',
};
const escape = value => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');

export function checkInventory(data, markdown, readSource) {
  assert.equal(data.schema, 'ggd-hero-status-inventory@1');
  assert.equal(data.baseCommit, '0dc947758cce13fba5c9ea5efc3283d33c4e42df');
  assert.equal(data.productionVerified, false, 'SNAPSHOT_IS_NOT_PRODUCTION_VERIFICATION');
  assert.equal(data.rows.length, 163);
  assert.equal(data.totalEntries, 163);
  assert.equal(new Set(data.rows.map(row => row.id)).size, 163, 'DUPLICATE_ID');
  assert.deepEqual(data.counts, counts);
  const sourceText = new Map();
  let localEvidence = 0;
  for (const source of data.sources) {
    assert(!path.isAbsolute(source.path), 'MACHINE_SPECIFIC_PATH');
    assert.match(source.sha256, /^[a-f0-9]{64}$/);
    if (!source.commit) {
      assert.equal(source.kind, 'local-evidence-not-production-api');
      assert.equal(source.pathBase, 'originating-workspace');
      assert(source.availability.includes('not independent revalidation'));
      localEvidence++;
      continue;
    }
    assert.equal(source.commit, data.baseCommit);
    assert(!sourceText.has(source.path), 'DUPLICATE_SOURCE');
    const bytes = readSource(source);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256, source.path);
    sourceText.set(source.path, bytes.toString());
  }
  assert.equal(sourceText.size, 159);
  assert.equal(localEvidence, 2);
  const roster = JSON.parse(sourceText.get('content/config/roster.json'));
  const block = sourceText.get('apps/platform/internal/curation/starter.go')
    .match(/starterChampions = \[\]string\{([\s\S]*?)\n\t\}/);
  assert(block, 'STARTER_SOURCE_SHAPE_CHANGED');
  const starter = new Set([...block[1].matchAll(/^\s*"([^"]+)"/gm)].map(match => match[1]));
  assert.equal(starter.size, 49);
  const expectedNativeIds = new Set([...sourceText].filter(([file]) => /^content\/(?:_legacy\/)?champions\//.test(file))
    .map(([, text]) => JSON.parse(text).id));
  const actualNativeIds = new Set();
  for (const row of data.rows) {
    assert.equal(row.productionVerified, false);
    assert.equal(row.status, labels[row.category]);
    const source = sourceText.get(row.source);
    assert(source, `UNBOUND_ROW_SOURCE:${row.id}`);
    if (row.family === 'shipping' || row.family === 'legacy') {
      const doc = JSON.parse(source);
      actualNativeIds.add(row.id);
      assert.equal(row.id, doc.id);
      assert.equal(row.name, doc.name);
      assert.equal(row.counterpartId, doc.transform?.counterpartId ?? null);
      assert.equal(row.transformRole, doc.transform?.role ?? null);
      const family = row.source.startsWith('content/_legacy/') ? 'legacy' : 'shipping';
      assert.equal(row.family, family);
      const category = doc.transform?.role === 'alternate' ? 'alternate'
        : roster.retiredChampions.includes(doc.id) ? 'retired'
        : starter.has(doc.id) ? (roster.hiddenChampions.includes(doc.id) ? 'hidden' : 'listed')
        : family === 'legacy' ? 'legacy' : 'builtin';
      assert.equal(row.category, category, `WRONG_STATUS:${row.id}`);
    } else if (row.family === 'community37') {
      const recipe = JSON.parse(source);
      assert.equal(row.category, 'community');
      assert.equal(row.id, recipe.projectId);
      assert.equal(row.name, recipe.displayName);
      assert.equal(row.source, `materials/community-hero-forge/recipes/${String(row.number).padStart(2, '0')}.upload-recipe.json`);
    } else {
      assert.equal(row.family, 'lol-example');
      assert.equal(row.category, 'prototype');
      const examples = [...source.matchAll(/id: "([^"]+)", inspiration: "([^"]+)", name: "([^"]+)"/g)];
      assert(examples.some(([, id, , name]) => row.id === `example:${id}` && row.name === name));
    }
  }
  assert.deepEqual(actualNativeIds, expectedNativeIds, 'INCOMPLETE_NATIVE_INVENTORY');
  for (const [category, count] of Object.entries(counts)) {
    const rows = data.rows.filter(row => row.category === category);
    assert.equal(rows.length, count, category);
    const heading = `## ${labels[category]}（${count} 筆）`;
    const position = markdown.indexOf(heading);
    assert(position >= 0, `MISSING_HEADING:${category}`);
    const end = markdown.indexOf('\n## ', position + heading.length);
    const section = markdown.slice(position, end < 0 ? undefined : end);
    rows.forEach((row, index) => {
      const counterpart = row.counterpartId ? `；對應 \`${row.counterpartId}\`` : '';
      const line = `| ${row.number ?? index + 1} | ${escape(row.name)} | \`${row.id}\` | ${escape(row.note || row.status)}${counterpart} |`;
      assert(section.split('\n').includes(line), `MARKDOWN_ROW_MISMATCH:${row.id}`);
    });
  }
  assert.equal(markdown.split('\n').filter(line => /^\| \d+ \|/.test(line)).length, 163);
  for (const limitation of data.limitations) assert(markdown.includes(limitation));
  assert(markdown.includes(data.baseCommit));
  return { entries: data.rows.length, counts, verifiedGitSources: sourceText.size,
    localEvidenceNotIndependentlyRevalidated: localEvidence, productionVerified: false };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkInventory(JSON.parse(fs.readFileSync(path.join(directory, 'inventory.json'), 'utf8')),
    fs.readFileSync(path.join(directory, '全角色狀態清單.md'), 'utf8'),
    source => execFileSync('git', ['show', `${source.commit}:${source.path}`], { cwd: root, maxBuffer: 16 * 1024 * 1024 }));
  console.log(JSON.stringify(result, null, 2));
}
