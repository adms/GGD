// rawcode: A09K
// hero: godie-u010 (slot R)  championDoc: content/champions/godie-u010.json
// nameZh: 黑龍波吸收
// abilityDoc: content/abilities/godie-u010.r.json
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=TPv actions=Ttv (trigger var xp)
// w3a base: ANht  levels: None
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0}
// mana: {"1": 100, "2": 200, "3": 300}
// area: {"1": 5.0, "2": 5.0, "3": 5.0}
// duration: {"1": 10.0, "3": 20.0}
// hero_duration: {"3": 20.0, "1": 10.0}
// data[1] per level: {"1": -1.0, "2": -1.0, "3": -1.0}
// data[4] per level: {"2": -20.0, "3": -30.0, "1": -10.0}
// slice tiers: core=['TPv', 'Ttv'] depth1=['Vt', 'Ct', 'Ht', 'Tqv', 'TQv', 'Tsv', 'TSv'] depth2=[]

// --- Vt (depth1, line 2245 in war3map.j) ---
function Vt takes location Et,real Xt,real Ot returns location
return Location(GetLocationX(Et)+Xt*Cos(Ot*bj_DEGTORAD),GetLocationY(Et)+Xt*Sin(Ot*bj_DEGTORAD))
endfunction

// --- Ct (depth1, line 2271 in war3map.j) ---
function Ct takes rect r returns group
set et=CreateGroup()
call GroupEnumUnitsInRect(et,r,ot)
return et
endfunction

// --- Ht (depth1, line 2303 in war3map.j) ---
function Ht takes player Dt,integer jt returns group
set et=CreateGroup()
set bj_groupEnumTypeId=jt
call GroupEnumUnitsOfPlayer(et,Dt,filterGetUnitsOfPlayerAndTypeId)
return et
endfunction

// --- TPv (core, line 22889 in war3map.j) ---
function TPv takes nothing returns boolean
return(GetSpellAbilityId()=='A09K')
endfunction

// --- Tqv (depth1, line 22892 in war3map.j) ---
function Tqv takes nothing returns boolean
return(GetHeroStatBJ(1,GetTriggerUnit(),false)<=$A0)
endfunction

// --- TQv (depth1, line 22895 in war3map.j) ---
function TQv takes nothing returns nothing
call CameraSetEQNoiseForPlayer(GetOwningPlayer(GetEnumUnit()),12.)
endfunction

// --- Tsv (depth1, line 22898 in war3map.j) ---
function Tsv takes nothing returns nothing
call KillUnit(GetEnumUnit())
call RemoveUnit(GetEnumUnit())
endfunction

// --- TSv (depth1, line 22902 in war3map.j) ---
function TSv takes nothing returns nothing
call KillUnit(GetEnumUnit())
call RemoveUnit(GetEnumUnit())
endfunction

// --- Ttv (core, line 22906 in war3map.j) ---
function Ttv takes nothing returns nothing
set Co=GetTriggerUnit()
call CreateNUnitsAtLoc(1,'o01V',GetOwningPlayer(GetTriggerUnit()),GetUnitLoc(GetTriggerUnit()),bj_UNIT_FACING)
call SetUnitVertexColorBJ(bj_lastCreatedUnit,.0,.0,.0,20.)
set pV=bj_lastCreatedUnit
call SetUnitFlyHeight(pV,-2000.,1800.)
call SetUnitTimeScalePercent(pV,1000.)
call AddSpecialEffectTargetUnitBJ("chest",bj_lastCreatedUnit,"Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl")
call DestroyEffect(bj_lastCreatedEffect)
call AddSpecialEffectTargetUnitBJ("chest",GetTriggerUnit(),"Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl")
call DestroyEffect(bj_lastCreatedEffect)
if(Tqv())then
call ModifyHeroStat(1,GetTriggerUnit(),0,(GetUnitAbilityLevelSwapped('A09K',GetTriggerUnit())+0))
else
call CreateTextTagUnitBJ("敏捷已達上限",GetTriggerUnit(),0,10.,'d',.0,.0,0)
call SetTextTagVelocityBJ(bj_lastCreatedTextTag,32.,90)
call SetTextTagPermanentBJ(bj_lastCreatedTextTag,false)
call SetTextTagLifespanBJ(bj_lastCreatedTextTag,2.8)
call SetTextTagFadepointBJ(bj_lastCreatedTextTag,1.5)
endif
call PlaySoundOnUnitBJ(Ud,'d',GetTriggerUnit())
set cn=1
loop
exitwhen cn>$C
call CreateNUnitsAtLoc(1,'o00Z',GetOwningPlayer(GetTriggerUnit()),Vt(GetUnitLoc(GetTriggerUnit()),350.,(I2R(cn)*30.)),bj_UNIT_FACING)
call ShowUnitHide(bj_lastCreatedUnit)
call UnitApplyTimedLifeBJ(5.,'BTLF',bj_lastCreatedUnit)
call UnitAddAbility(bj_lastCreatedUnit,'A09M')
call SetUnitAbilityLevelSwapped('A09M',bj_lastCreatedUnit,GetUnitAbilityLevelSwapped(GetSpellAbilityId(),GetTriggerUnit()))
call SetUnitFacingToFaceUnitTimed(bj_lastCreatedUnit,GetAttacker(),0)
call IssuePointOrderByIdLoc(bj_lastCreatedUnit,$D02AC,GetUnitLoc(bj_lastCreatedUnit))
call EnableTrigger(SJ)
call AddSpecialEffectLocBJ(GetRandomLocInRect(RectFromCenterSizeBJ(GetUnitLoc(GetTriggerUnit()),350.,350.)),"Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl")
call DestroyEffect(bj_lastCreatedEffect)
set cn=cn+1
endloop
call PlaySoundOnUnitBJ(ld,100.,GetTriggerUnit())
call ForGroupBJ(Ct(RectFromCenterSizeBJ(GetUnitLoc(Co),1600.,1600.)),function TQv)
call TriggerSleepAction(1.)
set bj_forLoopBIndex=1
set bj_forLoopBIndexEnd=$C
loop
exitwhen bj_forLoopBIndex>bj_forLoopBIndexEnd
call CameraClearNoiseForPlayer(Player(-1+(bj_forLoopBIndex)))
set bj_forLoopBIndex=bj_forLoopBIndex+1
endloop
call ForGroupBJ(Ht(GetOwningPlayer(Co),'o01V'),function Tsv)
call TriggerSleepAction(1.)
call ForGroupBJ(Ht(GetOwningPlayer(Co),'o00Z'),function TSv)
endfunction
