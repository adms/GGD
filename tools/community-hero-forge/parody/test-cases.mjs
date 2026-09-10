import {redesign,rewritten} from './designs.mjs';
const cast=(slot,extra={})=>({kind:'cast',slot,waitSec:.3,...extra});
export const passiveScenarios={
 '12':[{event:'onShieldBroken',steps:[cast('W'),...Array.from({length:5},()=>cast('Q',{actor:'foe',target:'caster',waitSec:.2}))]}],
 '18':[{event:'onDamageDealt',steps:[cast('R')]}],
 '19':[{event:'onAbilityCast',steps:[cast('Q'),cast('W')]}],
 '36':[{event:'onDamageTaken',steps:[cast('W'),cast('Q',{actor:'foe',target:'caster'})]}],
};
export const redesignedCases=()=>rewritten.map(n=>[n,{...redesign(n),passiveScenarios:passiveScenarios[n]??[]}]);
