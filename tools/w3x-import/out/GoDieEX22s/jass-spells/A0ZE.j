// rawcode: A0ZE
// hero: godie-n01l (slot W)  championDoc: tools/w3x-import/out/GoDieEX22s/drafts/champions/godie-n01l.json
// nameZh: 平易近人的笑容
// abilityDoc: tools/w3x-import/out/GoDieEX22s/drafts/champions/godie-n01l.json#abilities.W
// kind: passive (referenced via GetUnitAbilityLevel/GetLearnedSkill in other triggers)
// handler: event=TimerEventPeriodic cond=VCe actions=Vfe (trigger var Ds)
// handler: event=helper-ref; called from Vfe (events: TimerEventPeriodic) cond=None actions=VDe (trigger var None)
// w3a base: AEar  levels: 4
// area: {"2": 350.0, "3": 350.0, "4": 350.0, "1": 350.0}
// data[1] per level: {"1": 0.03999999910593033, "2": 0.07999999821186066, "3": 0.11999999731779099, "4": 0.1599999964237213}
// data[2] per level: {"1": 1, "2": 1, "3": 1, "4": 1}
// slice tiers: core=['VCe', 'Vfe', 'VDe'] depth1=['gt', 'Vde'] depth2=[]

// --- gt (depth1, line 2287 in war3map.j) ---
function gt takes real At,location Ft returns group
set et=CreateGroup()
call GroupEnumUnitsInRangeOfLoc(et,Ft,At,ot)
return et
endfunction

// --- VCe (core, line 28573 in war3map.j) ---
function VCe takes nothing returns boolean
return(GetUnitAbilityLevelSwapped('A0ZE',WB)>0)
endfunction

// --- Vde (depth1, line 28576 in war3map.j) ---
function Vde takes nothing returns boolean
return(IsUnitAlly(GetEnumUnit(),GetOwningPlayer(WB)))and(IsUnitAliveBJ(GetEnumUnit()))
endfunction

// --- VDe (core, line 28579 in war3map.j) ---
function VDe takes nothing returns nothing
if(Vde())then
set ZB=GetUnitLoc(GetEnumUnit())
call SetWidgetLife(GetEnumUnit(),(GetUnitStateSwap(UNIT_STATE_LIFE,GetEnumUnit())+(100.*I2R(GetUnitAbilityLevelSwapped('A0ZE',WB)))))
call AddSpecialEffectLocBJ(ZB,"Abilities\\Spells\\Human\\Resurrect\\ResurrectTarget.mdl")
call DestroyEffect(bj_lastCreatedEffect)
call RemoveLocation(ZB)
endif
endfunction

// --- Vfe (core, line 28588 in war3map.j) ---
function Vfe takes nothing returns nothing
set zB=GetUnitLoc(WB)
call ForGroupBJ(gt(300.,zB),function VDe)
endfunction
