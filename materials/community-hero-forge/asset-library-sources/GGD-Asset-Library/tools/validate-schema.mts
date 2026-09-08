import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [repo, planFile] = process.argv.slice(2);
const base = path.join(repo, 'packages/shared/src/content/schema');
const { zModelDoc } = await import(pathToFileURL(path.join(base, 'model.ts')).href);
const { zVfxCollectionDoc } = await import(pathToFileURL(path.join(base, 'vfx.ts')).href);
const { zVfxScriptDoc } = await import(pathToFileURL(path.join(base, 'vfxScript.ts')).href);
const schemas = { model: zModelDoc, vfx: zVfxCollectionDoc, script: zVfxScriptDoc };
const errors = [];
for (const item of JSON.parse(fs.readFileSync(planFile, 'utf8'))) {
 const parsed = schemas[item.kind].safeParse(JSON.parse(fs.readFileSync(item.path, 'utf8')));
 if (!parsed.success) errors.push({ path: item.path, issues: parsed.error.issues });
}
console.log(JSON.stringify({ checked: JSON.parse(fs.readFileSync(planFile, 'utf8')).length, errors }));
if (errors.length) process.exitCode = 1;
