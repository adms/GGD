// rawcode: A0TN
// hero: godie-h02k (slot E)  championDoc: tools/w3x-import/out/GoDieEX22s/drafts/champions/godie-h02k.json
// nameZh: 憤怒的胸毛
// abilityDoc: tools/w3x-import/out/GoDieEX22s/drafts/champions/godie-h02k.json#abilities.E
// kind: passive (referenced via GetUnitAbilityLevel/GetLearnedSkill in other triggers)
// handler: event=helper-ref; called from rwe (events: EVENT_PLAYER_UNIT_DEATH) cond=None actions=rue (trigger var None)
// handler: event=helper-ref; called from rwe (events: EVENT_PLAYER_UNIT_DEATH) cond=None actions=rUe (trigger var None)
// w3a base: AUau  levels: 4
// area: {"2": 50.0, "3": 50.0, "4": 50.0, "1": 50.0}
// data[1] per level: {"2": 0.05999999865889549, "3": 0.08999999612569809, "4": 0.11999999731779099, "1": 0.029999999329447746}
// data[2] per level: {"1": 0.029999999329447746, "2": 0.029999999329447746, "3": 0.029999999329447746, "4": 0.029999999329447746}
// data[3] per level: {"1": 1, "2": 1, "3": 1, "4": 1}
// slice tiers: core=['rue', 'rwe', 'rUe'] depth1=['rTe', 'gt'] depth2=[]

// --- gt (depth1, line 2287 in war3map.j) ---
function gt takes real At,location Ft returns group
set et=CreateGroup()
call GroupEnumUnitsInRangeOfLoc(et,Ft,At,ot)
return et
endfunction

// --- rTe (depth1, line 27312 in war3map.j) ---
function rTe takes nothing returns boolean
return((GetRandomInt(1,3)==2)and(IsPlayerAlly(GetOwningPlayer(GetEnumUnit()),GetOwningPlayer(GetTriggerUnit()))==false)and(IsUnitType(GetEnumUnit(),UNIT_TYPE_STRUCTURE)==false))!=null
endfunction

// --- rue (core, line 27315 in war3map.j) ---
function rue takes nothing returns nothing
if(rTe())then
call UnitDamageTargetBJ(GetTriggerUnit(),GetEnumUnit(),(1000.*I2R(GetUnitAbilityLevelSwapped('A0TN',GetTriggerUnit()))),ATTACK_TYPE_NORMAL,DAMAGE_TYPE_MAGIC)
call AddSpecialEffectTargetUnitBJ("chest",GetEnumUnit(),"Units\\Undead\\Abomination\\AbominationExplosion.mdl")
call DestroyEffect(bj_lastCreatedEffect)
call AddSpecialEffectTargetUnitBJ("chest",GetEnumUnit(),"Objects\\Spawnmodels\\Other\\NeutralBuildingExplosion\\NeutralBuildingExplosion.mdl")
call DestroyEffect(bj_lastCreatedEffect)
endif
endfunction

// --- rUe (core, line 27324 in war3map.j) ---
function rUe takes nothing returns boolean
return(GetRandomInt(1,'d')<=(GetUnitAbilityLevelSwapped('A0TN',GetTriggerUnit())*4))
endfunction

// --- rwe (core, line 27327 in war3map.j) ---
function rwe takes nothing returns nothing
if(rUe())then
call ReviveHeroLoc(GetTriggerUnit(),GetUnitLoc(GetTriggerUnit()),true)
call SetUnitLifePercentBJ(GetTriggerUnit(),'d')
call PlaySoundOnUnitBJ(MD,'d',GetTriggerUnit())
set BO=GetUnitLoc(GetTriggerUnit())
call CreateNUnitsAtLoc(1,'oshm',GetOwningPlayer(GetTriggerUnit()),BO,bj_UNIT_FACING)
call ShowUnitHide(bj_lastCreatedUnit)
call UnitApplyTimedLifeBJ(1.,'BTLF',bj_lastCreatedUnit)
call IssueTargetOrderById(bj_lastCreatedUnit,$D0085,GetTriggerUnit())
call UnitAddAbility(bj_lastCreatedUnit,'A0SR')
call IssueImmediateOrderById(bj_lastCreatedUnit,$D009F)
call ModifyHeroStat(2,GetTriggerUnit(),0,GetRandomInt(0,1))
call ModifyHeroStat(1,GetTriggerUnit(),0,GetRandomInt(0,1))
call ModifyHeroStat(0,GetTriggerUnit(),0,GetRandomInt(0,1))
call ForGroupBJ(gt(600.,GetUnitLoc(GetTriggerUnit())),function rue)
endif
set KI=0
call SetUnitVertexColorBJ(GetDyingUnit(),100.,'d',100.,0)
endfunction
