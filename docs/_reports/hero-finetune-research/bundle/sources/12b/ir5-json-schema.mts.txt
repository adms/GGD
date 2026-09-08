/** Exact JSON Schema for IR5; source mechanism selectors stay separate from numeric previews. */
import assert from 'node:assert/strict';
import {zIR5,zAction5,zLegacyAction,ACTIONS5} from './ir-v5.mts';
import {ACTIONS} from './semantic-ir.mts';
export function ir5JSONSchema() {
  function describe(s: any): any {
    if (s === zAction5) return { $ref: '#/$defs/action' };
    if (s === zLegacyAction) return { $ref: '#/$defs/legacy_action' };
    const d = s._def;
    switch (d.typeName) {
      case 'ZodOptional': return describe(d.innerType);
      case 'ZodNullable': return { anyOf: [describe(d.innerType), { type: 'null' }] };
      case 'ZodLazy': return describe(d.getter());
      case 'ZodLiteral': return { const: d.value };
      case 'ZodEnum': return { type: 'string', enum: d.values };
      case 'ZodBoolean': return { type: 'boolean' };
      case 'ZodString': {
        const out: any = { type: 'string' };
        for (const c of d.checks) {
          if(c.kind==='min')out.minLength=c.value;
          else if(c.kind==='max')out.maxLength=c.value;
          else if(c.kind==='regex'){assert.equal(c.regex.flags,'');out.pattern=c.regex.source;}
          else throw new Error(`UNSUPPORTED_STRING_CHECK:${c.kind}`);
        } return out;
      }
      case 'ZodNumber': {
        const out: any={type:'number'};
        for(const c of d.checks){if(c.kind==='int')out.type='integer';
          else if(c.kind==='min')out[c.inclusive?'minimum':'exclusiveMinimum']=c.value;
          else if(c.kind==='max')out[c.inclusive?'maximum':'exclusiveMaximum']=c.value;
          else assert.equal(c.kind,'finite');} return out;
      }
      case 'ZodArray': return { type:'array',items:describe(d.type),
        ...(d.minLength?{minItems:d.minLength.value}:{}),...(d.maxLength?{maxItems:d.maxLength.value}:{}) };
      case 'ZodObject': {
        assert.equal(d.unknownKeys,'strict'); const shape=d.shape();
        return {type:'object',additionalProperties:false,
          required:Object.entries(shape).filter(([,s]:any)=>s._def.typeName!=='ZodOptional').map(([k])=>k),
          properties:Object.fromEntries(Object.entries(shape).map(([k,s])=>[k,describe(s)]))};
      }
      default: throw new Error(`UNSUPPORTED_IR5_SCHEMA:${d.typeName}`);
    }
  }
  const root=describe(zIR5), slot=root.properties.slots.properties.PASSIVE;
  for(const value of Object.values(root.properties.slots.properties))assert.deepEqual(value,slot);
  root.properties.slots.properties=Object.fromEntries(Object.keys(root.properties.slots.properties).map(k=>[k,{$ref:'#/$defs/slot'}]));
  const options=Object.values(ACTIONS5);
  const legacyNames=Object.fromEntries(Object.keys(ACTIONS).map(op=>[op,ACTIONS5[op]===ACTIONS[op]?`action_${op}`:`legacy_action_${op}`]));
  const legacyDefs=Object.fromEntries(Object.entries(ACTIONS).filter(([op])=>ACTIONS5[op]!==ACTIONS[op]).map(([op,s])=>[legacyNames[op],describe(s)]));
  return {$schema:'https://json-schema.org/draft/2020-12/schema',...root,
    $defs:{slot,...legacyDefs,legacy_action:{oneOf:Object.keys(ACTIONS).map(op=>({$ref:`#/$defs/${legacyNames[op]}`}))},action:{oneOf:options.map((s:any)=>({$ref:`#/$defs/action_${s.shape.op._def.value}`}))},
      ...Object.fromEntries(options.map((s:any)=>[`action_${s.shape.op._def.value}`,describe(s)]))}};
}
