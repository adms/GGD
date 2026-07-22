// rawcode: A0IJ
// hero: godie-edem (slot E)  championDoc: content/champions/godie-edem.json
// nameZh: 千鳥
// abilityDoc: content/abilities/godie-edem.e.json
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=shv actions=sJv (trigger var BM)
// w3a base: ANcl  levels: 4
// cooldown: {"1": 45.0, "2": 45.0, "3": 45.0, "4": 45.0}
// mana: {"1": 120, "2": 185, "3": 250, "4": 315}
// range: {"2": 700.0, "3": 700.0, "4": 700.0, "1": 700.0}
// data[1] per level: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// data[2] per level: {"1": 1, "4": 1, "2": 1, "3": 1}
// data[3] per level: {"1": 9, "2": 9, "3": 9, "4": 9}
// data[4] per level: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// data[5] per level: {"1": 0, "2": 0, "3": 0, "4": 0}
// data[6] per level: {"1": "coldarrows", "2": "coldarrows", "3": "coldarrows", "4": "coldarrows"}
// slice tiers: core=['shv', 'sJv'] depth1=['Vt', 'Ht', 'sHv', 'sjv'] depth2=[]

// --- Vt (depth1, line 2245 in war3map.j) ---
function Vt takes location Et,real Xt,real Ot returns location
return Location(GetLocationX(Et)+Xt*Cos(Ot*bj_DEGTORAD),GetLocationY(Et)+Xt*Sin(Ot*bj_DEGTORAD))
endfunction

// --- Ht (depth1, line 2303 in war3map.j) ---
function Ht takes player Dt,integer jt returns group
set et=CreateGroup()
set bj_groupEnumTypeId=jt
call GroupEnumUnitsOfPlayer(et,Dt,filterGetUnitsOfPlayerAndTypeId)
return et
endfunction

// --- shv (core, line 21708 in war3map.j) ---
function shv takes nothing returns boolean
return(GetSpellAbilityId()=='A0IJ')
endfunction

// --- sHv (depth1, line 21711 in war3map.j) ---
function sHv takes nothing returns nothing
call KillUnit(GetEnumUnit())
call RemoveUnit(GetEnumUnit())
endfunction

// --- sjv (depth1, line 21715 in war3map.j) ---
function sjv takes nothing returns nothing
call KillUnit(GetEnumUnit())
call RemoveUnit(GetEnumUnit())
endfunction

// --- sJv (core, line 21719 in war3map.j) ---
function sJv takes nothing returns nothing
call DisableTrigger(GetTriggeringTrigger())
set NA=GetTriggerUnit()
set bA=GetSpellTargetUnit()
set BA=GetUnitLoc(GetTriggerUnit())
set cA=GetUnitLoc(bA)
set CA=I2R((((GetHeroLevel(GetTriggerUnit())*20)+(GetUnitAbilityLevelSwapped(GetSpellAbilityId(),GetTriggerUnit())*$C8))+$C8))
set dA=(45.+(I2R(GetUnitAbilityLevelSwapped('A0U7',GetTriggerUnit()))*5.))
set DA=(160.+(I2R(GetUnitAbilityLevelSwapped('A0U7',GetTriggerUnit()))*40.))
set fA=true
set oB=0
call AddSpecialEffectLocBJ(BA,"Abilities\\Spells\\Human\\Thunderclap\\ThunderClapCaster.mdl")
call DestroyEffect(bj_lastCreatedEffect)
call UnitAddAbility(NA,'A0I5')
call SetUnitAnimation(NA,"attack slam")
call AddSpecialEffectTargetUnitBJ("origin",GetTriggerUnit(),"Abilities\\Spells\\Orc\\Purge\\PurgeBuffTarget.mdl")
call DestroyEffect(bj_lastCreatedEffect)
set FA=1
loop
exitwhen FA>$C
set gA=Vt(BA,(I2R(FA)*12.),(I2R(FA)*30.))
call CreateNUnitsAtLoc(1,'n00N',GetOwningPlayer(GetTriggerUnit()),gA,bj_UNIT_FACING)
call UnitApplyTimedLifeBJ(1.,'BTLF',bj_lastCreatedUnit)
call RemoveLocation(gA)
set FA=FA+1
endloop
call RemoveLocation(BA)
call TriggerSleepAction(.2)
call SetUnitPathing(NA,false)
call EnableTrigger(cM)
call TriggerSleepAction(3.)
call ForGroupBJ(Ht(GetOwningPlayer(NA),'n00N'),function sHv)
call ForGroupBJ(Ht(GetOwningPlayer(NA),'o022'),function sjv)
endfunction
