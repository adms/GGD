/** Exact structural JSON Schema for the existing IR2 validator, not a new dialect. */
import assert from 'node:assert/strict';
import { ACTIONS, zAction } from './semantic-ir.mts';
import { zIR2 } from './ir-v2.mts';

export function describeSchema(schema: any): any {
  if (schema === zAction) return { $ref: '#/$defs/action' };
  const d = schema._def;
  switch (d.typeName) {
    case 'ZodNullable': return { anyOf: [describeSchema(d.innerType), { type: 'null' }] };
    case 'ZodLazy': return describeSchema(d.getter());
    case 'ZodLiteral': return { const: d.value };
    case 'ZodEnum': return { type: 'string', enum: d.values };
    case 'ZodBoolean': return { type: 'boolean' };
    case 'ZodString': {
      const out: any = { type: 'string' };
      for (const c of d.checks) {
        if (c.kind === 'min') out.minLength = c.value;
        else if (c.kind === 'max') out.maxLength = c.value;
        else if (c.kind === 'regex') { assert.equal(c.regex.flags, ''); out.pattern = c.regex.source; }
        else throw new Error(`UNSUPPORTED_STRING_CHECK:${c.kind}`);
      }
      return out;
    }
    case 'ZodNumber': {
      const out: any = { type: 'number' };
      for (const c of d.checks) {
        if (c.kind === 'int') out.type = 'integer';
        else if (c.kind === 'min') out[c.inclusive ? 'minimum' : 'exclusiveMinimum'] = c.value;
        else if (c.kind === 'max') out[c.inclusive ? 'maximum' : 'exclusiveMaximum'] = c.value;
        else assert.equal(c.kind, 'finite', `UNSUPPORTED_NUMBER_CHECK:${c.kind}`);
      }
      return out;
    }
    case 'ZodArray': {
      const out: any = { type: 'array', items: describeSchema(d.type) };
      if (d.minLength) out.minItems = d.minLength.value;
      if (d.maxLength) out.maxItems = d.maxLength.value;
      if (d.exactLength) out.minItems = out.maxItems = d.exactLength.value;
      return out;
    }
    case 'ZodObject': {
      assert.equal(d.unknownKeys, 'strict', 'ONLY_STRICT_OBJECTS_SUPPORTED');
      const shape = d.shape();
      return { type: 'object', additionalProperties: false, required: Object.keys(shape),
        properties: Object.fromEntries(Object.entries(shape).map(([key, value]) => [key, describeSchema(value)])) };
    }
    default: throw new Error(`UNSUPPORTED_SCHEMA_NODE:${d.typeName}`);
  }
}

export function irJSONSchema() {
  const root = describeSchema(zIR2), slots = root.properties.slots;
  const slot = slots.properties.PASSIVE;
  for (const value of Object.values(slots.properties)) assert.deepEqual(value, slot);
  slots.properties = Object.fromEntries(Object.keys(slots.properties).map(s => [s, { $ref: '#/$defs/slot' }]));
  return { $schema: 'https://json-schema.org/draft/2020-12/schema',
    $comment: 'Structural constraints only. Evidence anchoring, delivery semantics, dependencies, depth and engine/behavior checks remain mandatory.',
    ...root,
    $defs: { slot, action: { oneOf: Object.keys(ACTIONS).map(op => ({ $ref: `#/$defs/action_${op}` })) },
      ...Object.fromEntries(Object.entries(ACTIONS).map(([op, s]) => [`action_${op}`, describeSchema(s)])) } };
}
