// rawcode: A0BV
// hero: godie-usyl (slot E)  championDoc: content/champions/godie-usyl.json
// nameZh: 蛻變
// abilityDoc: content/abilities/godie-usyl.e.json
// kind: passive (referenced via GetUnitAbilityLevel/GetLearnedSkill in other triggers)
// handler: event=helper-ref; called from WMv (events: EVENT_PLAYER_HERO_SKILL) cond=None actions=Wmv (trigger var None)
// handler: event=EVENT_PLAYER_UNIT_DEATH cond=None actions=Wsv (trigger var Zp)
// w3a base: AEar  levels: 4
// area: {"1": 350.0, "2": 350.0, "3": 350.0, "4": 350.0}
// slice tiers: core=['Wmv', 'WMv', 'Wsv'] depth1=['WQv'] depth2=[]

// --- Wmv (core, line 24104 in war3map.j) ---
function Wmv takes nothing returns boolean
return(GetUnitAbilityLevelSwapped('A0BV',GetLearningUnit())>=1)
endfunction

// --- WMv (core, line 24107 in war3map.j) ---
function WMv takes nothing returns nothing
if(Wmv())then
set Ye=GetTriggerUnit()
call DisableTrigger(GetTriggeringTrigger())
call EnableTrigger(Zp)
call TriggerExecute(Zp)
endif
endfunction

// --- WQv (depth1, line 24121 in war3map.j) ---
function WQv takes nothing returns boolean
return(GetHeroStatBJ(1,GetKillingUnit(),false)<$8C)
endfunction

// --- Wsv (core, line 24124 in war3map.j) ---
function Wsv takes nothing returns nothing
call PlaySoundOnUnitBJ(gD,100.,GetKillingUnit())
if(WQv())then
call ModifyHeroStat(1,Ye,0,GetUnitAbilityLevelSwapped('A0BV',Ye))
else
call DisableTrigger(GetTriggeringTrigger())
endif
endfunction
