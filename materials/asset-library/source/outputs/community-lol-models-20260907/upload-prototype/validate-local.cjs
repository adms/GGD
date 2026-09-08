const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const validator = require('gltf-validator');
const [source, output] = process.argv.slice(2);
(async () => {
  const results = [];
  for (const name of fs.readdirSync(source).filter(name => name.endsWith('.glb')).sort()) {
    const bytes = fs.readFileSync(path.join(source, name));
    const report = await validator.validateBytes(new Uint8Array(bytes), { uri: name, format: 'glb', maxIssues: 100, writeTimestamp: false, externalResourceFunction: async () => { throw new Error('External resources are forbidden for this local upload probe'); } });
    results.push({name, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), report});
    console.log(JSON.stringify({name, errors: report.issues.numErrors, warnings: report.issues.numWarnings, truncated: report.issues.truncated}));
  }
  fs.writeFileSync(output, JSON.stringify({validator: validator.version(), results}, null, 2) + '\n');
})().catch(error => { console.error(error); process.exitCode = 1; });
