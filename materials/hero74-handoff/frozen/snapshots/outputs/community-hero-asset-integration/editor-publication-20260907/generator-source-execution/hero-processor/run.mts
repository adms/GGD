import { readFileSync, writeFileSync } from 'node:fs';
import { generateHeroDraft, compileGeneratedHeroDraft } from './packages/shared/src/content/heroForge/generator.ts';
const input = JSON.parse(readFileSync('input.json', 'utf8'));
const generated = generateHeroDraft(input.plan, input.options);
writeFileSync('output.json', JSON.stringify({generated, compiled: compileGeneratedHeroDraft(generated, input.templates, input.configs)}));