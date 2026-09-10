// Canonical JS assembly bridge for the Python action generator.  One JSON
// request on stdin, one target on stdout; teacher data and filesystem catalog
// discovery are deliberately outside this boundary.
import assert from 'node:assert/strict';
import {assembleActionHero} from './hero-distillation-action-runtime.mjs';

const chunks=[];for await(const chunk of process.stdin)chunks.push(chunk);const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
assert.equal(process.argv.length,3,'USAGE: assemble');assert.equal(process.argv[2],'assemble','UNKNOWN_MODE');
const expected=['identity','slotSelections','slotCores','coreActions','productActions','decisionSpace','context','actionProtocol'];assert.deepEqual(Object.keys(value).sort(),expected.sort(),'ACTION_ASSEMBLY_INPUT_KEYS');
process.stdout.write(JSON.stringify(assembleActionHero(value))+'\n');
