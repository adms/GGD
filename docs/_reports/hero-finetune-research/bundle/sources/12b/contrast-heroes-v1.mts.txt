/** One procedural research family; permutations are NOT independent heroes. */
import {SLOTS,sha} from './intake.mjs';
export const PERMUTATIONS=[['unit','field','line'],['unit','line','field'],['field','unit','line'],
  ['field','line','unit'],['line','unit','field'],['line','field','unit']] as const;
const descriptions={
  unit:'指定一名敵人造成小級魔法傷害，不波及附近其他敵人。',
  field:'選定落點，在同一位置依序爆發三次小級魔法傷害；每次重新判定區域內敵人，離開區域不再受擊，不追蹤最初目標。',
  line:'朝選定方向，從施法位置向前依序展開三段魔法打擊；每段小級魔法傷害，同一敵人可被相交段落重複命中；不集中在選定落點爆炸。',
};
export function contrastHero(permutation:number,timing:'required'|'none'){
  const families=PERMUTATIONS[permutation];if(!families)throw new Error('UNKNOWN_PERMUTATION');
  const id=`synthetic-spatial-${permutation+1}-${timing}`,name=`空間對照 ${permutation+1} ${timing==='required'?'吟唱':'瞬發'}`;
  const identity='這是研究用原創法師，區分指定一人、固定落點與向前展開的打擊，並以自身護盾和魔力回復維持施法。';
  const prefix=timing==='required'?'需要先吟唱（時長未定），完成後，':'不需要吟唱，';
  const text:any={PASSIVE:'普攻追加極小級魔法傷害，內置冷卻 2 秒。',
    R:'獲得持續 3 秒的自身全傷害護盾；重複施放時保留較大的剩餘護盾，不疊加。',
    EX:'回復自身 15% 最大魔力，然後獲得持續 3 秒的極小級移動速度提升，不提高攻速。'};
  ['Q','W','E'].forEach((s,i)=>text[s]=prefix+descriptions[families[i]]+'施放距離使用大級距。');
  const originalText=`角色：${name}\n出身：法師\n${identity}\n`+SLOTS.map(s=>`${s}：${text[s]}`).join('\n');
  const source={id,hero:{name,originalText,sourceSha256:sha(originalText)},
    slots:SLOTS.map(slot=>({slot,name:slot,originalText:text[slot],sourceSha256:sha(text[slot])})),
    sources:[{id:'hero-original',text:originalText,sha256:sha(originalText),authority:'assistant-authored synthetic research source; not Owner hero content'}]};
  const action=(s:string,op:string,fields:any)=>({op,evidence:text[s],...fields});
  const slots:any=Object.fromEntries(SLOTS.map(s=>[s,{delivery:s==='PASSIVE'?'passive':'self',rangeTier:null,
    castTiming:{requirement:'not_specified',seconds:null,evidence:null},actions:[],cost:null,mechanismGaps:[],tuningNotes:[]}]));
  slots.PASSIVE.actions=[action('PASSIVE','attack_proc',{damageType:'magic',tier:'極小',cooldown:2,targetHpBelow:null})];
  ['Q','W','E'].forEach((s,i)=>{
    const family=families[i];slots[s].delivery=family==='unit'?'targeted':'ground';slots[s].rangeTier='大';
    slots[s].castTiming={requirement:timing,seconds:null,evidence:prefix};
    const d={damageType:'magic',tier:'小'};
    slots[s].actions=[family==='unit'?action(s,'damage',d):family==='field'
      ?action(s,'area_pulses',{...d,count:3,interval:null,firstDelay:null,radiusTier:null,anchor:'point'})
      :action(s,'line_sequence',{...d,count:3,direction:'cast_facing',repeatHits:'per_segment',interval:null,firstDelay:null,stepDistance:null,radius:null})];
  });
  slots.R.actions=[action('R','shield_self',{duration:3,amount:null,absorbs:'all',stacking:'keep_larger'})];
  slots.EX.actions=[action('EX','restore_mana',{target:'self',basis:'maximum_mana',mode:'add',fraction:0.15}),
    action('EX','buff_self',{duration:3,moveSpeedTier:'極小',attackSpeedPct:null})];
  return {id,source,ir:{schema:'hero-semantic-ir@5',hero:{origin:'法師',originBasis:'source',identitySummary:identity,identityEvidence:[identity]},relations:[],slots},
    familyBySlot:Object.fromEntries(['Q','W','E'].map((s,i)=>[s,families[i]])),timing,
    sourceFamily:'synthetic-spatial-single-procedural-family',split:permutation<4?'engineering-train-candidate':'engineering-dev-combination',
    permutation,synthetic:true,ownerApproved:false,independentSourceHero:false,freshBlind:false,
    fullHeroRecipeTrainingAdmitted:false,releaseQualified:false,
    limitations:['Shared wording and common PASSIVE/R/EX; not independent source coverage.',
      'No resource-dependent or conditional cross-slot behavior; not evidence for those families.',
      'Preview numbers and cooldowns are script policy, not source facts.']};
}
export const CONTRAST_HEROES=PERMUTATIONS.flatMap((_,p)=>[contrastHero(p,'required'),contrastHero(p,'none')]);
