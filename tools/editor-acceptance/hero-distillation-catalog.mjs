import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const digest = value => createHash('sha256').update(value).digest('hex');
const hash = value => digest(JSON.stringify(value));
const keyOf = (layer, id) => `${layer}:${id}`;

// The index is identical for all heroes on a revision. It is built from the
// engine catalog alone, never from a teacher answer or list of expected IDs.
export function catalogIndex(catalog) {
  const byLayer = {};
  const seen = new Set();
  for (const brick of catalog.bricks) {
    const key = keyOf(brick.layer, brick.id);
    assert(!seen.has(key), 'DUPLICATE_CATALOG_KEY'); seen.add(key);
    (byLayer[brick.layer] ??= []).push(brick.id);
  }
  for (const ids of Object.values(byLayer)) ids.sort();
  return {
    schema: 'ggd-model-catalog-index@1', revision: catalog.revision,
    fingerprint: catalog.fingerprint, catalogSha256: hash(catalog),
    instruction: '索引列出的 ID 不等於無條件支援。參數契約與 partial/caveat 需用 catalog_lookup 查詢；完整驗證器永遠使用完整契約。不得以未查詢當作通過。',
    bricksByLayer: byLayer,
    capabilities: (catalog.constraints.planned ?? []).map(p => ({key: p.key, state: p.state, hasCaveat: Boolean(p.caveat)})),
    // These short global restrictions stay visible even before any lookup.
    simCapabilities: catalog.constraints.simCapabilities,
    unsupported: catalog.constraints.unsupported,
    knownBroken: catalog.constraints.knownBroken,
    deprecatedFields: catalog.constraints.deprecatedFields,
    lookupContract: {name: 'catalog_lookup', request: {bricks: [['layer', 'exact-id']], capabilities: ['exact-capability-key']},
      maxBricks: 48, maxCapabilities: 64, unknownId: 'error', responseIsQualityApproval: false},
  };
}

export function catalogLookup(catalog, index, request) {
  assert.equal(index.catalogSha256, hash(catalog), 'CATALOG_DRIFT');
  assert.equal(index.revision, catalog.revision, 'CATALOG_REVISION_MISMATCH');
  assert(request && !Array.isArray(request) && typeof request === 'object', 'LOOKUP_REQUEST_OBJECT');
  assert(Object.keys(request).every(k => ['bricks', 'capabilities'].includes(k)), 'UNKNOWN_LOOKUP_FIELD');
  assert(Array.isArray(request.bricks) && request.bricks.length <= 48, 'BRICK_QUERY_LIMIT');
  assert(Array.isArray(request.capabilities) && request.capabilities.length <= 64, 'CAPABILITY_QUERY_LIMIT');
  assert(request.bricks.length + request.capabilities.length > 0, 'EMPTY_QUERY');
  const catalogBricks = new Map(catalog.bricks.map(b => [keyOf(b.layer, b.id), b]));
  const used = new Set();
  const bricks = request.bricks.map(pair => {
    assert(Array.isArray(pair) && pair.length === 2 && pair.every(x => typeof x === 'string'), 'BRICK_QUERY_SHAPE');
    const key = keyOf(...pair);
    assert(!used.has(key), 'DUPLICATE_QUERY'); used.add(key);
    assert(catalogBricks.has(key), `UNKNOWN_BRICK:${key}`);
    return structuredClone(catalogBricks.get(key));
  });
  const planned = new Map((catalog.constraints.planned ?? []).map(c => [c.key, c]));
  const capabilities = request.capabilities.map(key => {
    assert(typeof key === 'string' && !used.has('cap:' + key), 'CAPABILITY_QUERY_SHAPE'); used.add('cap:' + key);
    assert(planned.has(key), `UNKNOWN_CAPABILITY:${key}`);
    return structuredClone(planned.get(key)); // Preserve caveat verbatim.
  });
  return {schema: 'ggd-model-catalog-lookup@1', revision: catalog.revision, catalogSha256: index.catalogSha256,
    requestSha256: hash(request), bricks, capabilities, semanticQualified: false, releaseQualified: false};
}

export function createIndexBundle(catalogs, sourceSha256) {
  return {schema: 'ggd-model-catalog-index-bundle@1', sourceCatalogsSha256: sourceSha256,
    indexes: Object.fromEntries(Object.entries(catalogs).map(([revision, catalog]) => {
      assert.equal(revision, catalog.revision, 'REVISION_KEY_MISMATCH');
      return [revision, catalogIndex(catalog)];
    })), scriptSha256: digest(fs.readFileSync(fileURLToPath(import.meta.url)))};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, catalogFile, ...args] = process.argv.slice(2);
  assert(catalogFile, 'USAGE: index CATALOGS_JSON NEW_FILE | lookup CATALOGS_JSON REVISION QUERY_JSON');
  const bytes = fs.readFileSync(catalogFile), catalogs = JSON.parse(bytes);
  if (mode === 'index') {
    assert.equal(args.length, 1, 'INDEX_OUTPUT_REQUIRED');
    const bundle = createIndexBundle(catalogs, digest(bytes));
    fs.writeFileSync(args[0], JSON.stringify(bundle, null, 2) + '\n', {flag: 'wx'});
    console.log(JSON.stringify({revisions: Object.keys(catalogs), sourceBytes: bytes.length, indexBytes: Buffer.byteLength(JSON.stringify(bundle)), teacherAnswersRead: false}));
  } else if (mode === 'lookup') {
    assert.equal(args.length, 2, 'LOOKUP_REVISION_QUERY_REQUIRED');
    const catalog = catalogs[args[0]];
    assert(catalog, 'UNKNOWN_REVISION');
    console.log(JSON.stringify(catalogLookup(catalog, catalogIndex(catalog), JSON.parse(args[1]))));
  } else throw new Error('UNKNOWN_COMMAND');
}
