// rawcode: A0U7
// hero: godie-edem (slot R)  championDoc: content/champions/godie-edem.json
// nameZh: 哥哥
// abilityDoc: content/abilities/godie-edem.r.json
// kind: passive (referenced via GetUnitAbilityLevel/GetLearnedSkill in other triggers)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=None actions=sJv (trigger var BM)
// handler: event=helper-ref; called from sUv (events: TimerEventPeriodic) cond=None actions=sPv (trigger var None)
// handler: event=helper-ref; called from sUv (events: TimerEventPeriodic) cond=None actions=sQv (trigger var None)
// w3a base: Aamk  levels: 3
// slice tiers: core=['sJv', 'sPv', 'sUv', 'sQv'] depth1=['Vt', 'Ht', 'sHv', 'sjv', 'spv', 'Ct', 'gt', 'sKv', 'slv', 'sLv', 'smv', 'sMv', 'sqv', 'ssv', 'sSv', 'stv', 'sTv', 'suv'] depth2=[]

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

// --- gt (depth1, line 2287 in war3map.j) ---
function gt takes real At,location Ft returns group
set et=CreateGroup()
call GroupEnumUnitsInRangeOfLoc(et,Ft,At,ot)
return et
endfunction

// --- Ht (depth1, line 2303 in war3map.j) ---
function Ht takes player Dt,integer jt returns group
set et=CreateGroup()
set bj_groupEnumTypeId=jt
call GroupEnumUnitsOfPlayer(et,Dt,filterGetUnitsOfPlayerAndTypeId)
return et
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

// --- sKv (depth1, line 21753 in war3map.j) ---
function sKv takes nothing returns boolean
return(DistanceBetweenPoints(cA,gA)>DA)
endfunction

// --- slv (depth1, line 21756 in war3map.j) ---
function slv takes nothing returns boolean
return(fA)
endfunction

// --- sLv (depth1, line 21759 in war3map.j) ---
function sLv takes nothing returns nothing
call CameraSetEQNoiseForPlayer(GetOwningPlayer(GetEnumUnit()),8.)
endfunction

// --- smv (depth1, line 21762 in war3map.j) ---
function smv takes nothing returns boolean
return(fA)
endfunction

// --- sMv (depth1, line 21765 in war3map.j) ---
function sMv takes nothing returns boolean
return(fA)
endfunction

// --- spv (depth1, line 21768 in war3map.j) ---
function spv takes nothing returns boolean
return((IsUnitAliveBJ(GetEnumUnit()))and(IsPlayerAlly(GetOwningPlayer(GetEnumUnit()),GetOwningPlayer(NA))==false)and(IsUnitType(GetEnumUnit(),UNIT_TYPE_STRUCTURE)==false))!=null
endfunction

// --- sPv (core, line 21771 in war3map.j) ---
function sPv takes nothing returns nothing
if(spv())then
call AddSpecialEffectTargetUnitBJ("chest",GetEnumUnit(),"Abilities\\Spells\\Other\\Monsoon\\MonsoonBoltTarget.mdl")
call DestroyEffect(bj_lastCreatedEffect)
call UnitDamageTargetBJ(NA,GetEnumUnit(),I2R((GetHeroStatBJ(1,NA,true)*(GetUnitAbilityLevelSwapped('A0U7',NA)*2))),ATTACK_TYPE_NORMAL,DAMAGE_TYPE_MAGIC)
endif
endfunction

// --- sqv (depth1, line 21778 in war3map.j) ---
function sqv takes nothing returns nothing
call CameraSetEQNoiseForPlayer(GetOwningPlayer(GetEnumUnit()),8.)
endfunction

// --- sQv (core, line 21781 in war3map.j) ---
function sQv takes nothing returns boolean
return(GetUnitAbilityLevelSwapped('A0U7',NA)>0)and(UnitHasBuffBJ(bA,'B03W'))
endfunction

// --- ssv (depth1, line 21784 in war3map.j) ---
function ssv takes nothing returns nothing
call KillUnit(GetEnumUnit())
call RemoveUnit(GetEnumUnit())
endfunction

// --- sSv (depth1, line 21788 in war3map.j) ---
function sSv takes nothing returns nothing
call KillUnit(GetEnumUnit())
call RemoveUnit(GetEnumUnit())
endfunction

// --- stv (depth1, line 21792 in war3map.j) ---
function stv takes nothing returns nothing
call KillUnit(GetEnumUnit())
call RemoveUnit(GetEnumUnit())
endfunction

// --- sTv (depth1, line 21796 in war3map.j) ---
function sTv takes nothing returns nothing
call KillUnit(GetEnumUnit())
call RemoveUnit(GetEnumUnit())
endfunction

// --- suv (depth1, line 21800 in war3map.j) ---
function suv takes nothing returns boolean
return(DistanceBetweenPoints(BA,GA)>100.)and(oB<'d')
endfunction

// --- sUv (core, line 21803 in war3map.j) ---
function sUv takes nothing returns nothing
set oB=(oB+1)
set BA=GetUnitLoc(NA)
call AddSpecialEffectLocBJ(BA,"Abilities\\Spells\\Human\\ThunderClap\\ThunderClapCaster.mdl")
call DestroyEffect(bj_lastCreatedEffect)
set gA=GetUnitLoc(bA)
if(slv())then
if(sKv())then
set fA=false
call RemoveLocation(GA)
set GA=Vt(cA,DA,AngleBetweenPoints(cA,gA))
else
call RemoveLocation(GA)
set GA=GetUnitLoc(bA)
endif
endif
call RemoveLocation(gA)
if(suv())then
set gA=Vt(BA,dA,AngleBetweenPoints(BA,GA))
call SetUnitPositionLoc(NA,gA)
call PlaySoundOnUnitBJ(Hf,100.,NA)
call RemoveLocation(BA)
call RemoveLocation(gA)
else
call DisableTrigger(GetTriggeringTrigger())
if(sQv())then
if(sMv())then
call UnitDamageTargetBJ(NA,bA,CA,ATTACK_TYPE_NORMAL,DAMAGE_TYPE_MAGIC)
endif
call ForGroupBJ(gt(600.,BA),function sPv)
set bj_forLoopAIndex=1
set bj_forLoopAIndexEnd=5
loop
exitwhen bj_forLoopAIndex>bj_forLoopAIndexEnd
call CreateNUnitsAtLoc(1,'h02O',GetOwningPlayer(NA),GA,GetRandomReal(0,360))
set UA[bj_forLoopAIndex]=bj_lastCreatedUnit
call CreateNUnitsAtLoc(1,'h02P',GetOwningPlayer(NA),GetRandomLocInRect(RectFromCenterSizeBJ(GA,300.,300.)),bj_UNIT_FACING)
set wA[bj_forLoopAIndex]=bj_lastCreatedUnit
set bj_forLoopAIndex=bj_forLoopAIndex+1
endloop
call EnableTrigger(CM)
call EnableTrigger(dM)
call TerrainDeformationRippleBJ(4,true,BA,512.,$400,256.,1,512)
call AddSpecialEffectLocBJ(BA,"Abilities\\Spells\\Other\\Monsoon\\MonsoonRain.mdl")
call DestroyEffect(bj_lastCreatedEffect)
call CreateTextTagUnitBJ("雷遁 - 麒麟！！",NA,0,20.,100.,100.,.0,0)
call SetTextTagVelocityBJ(bj_lastCreatedTextTag,64,90)
call SetTextTagPermanentBJ(bj_lastCreatedTextTag,false)
call SetTextTagLifespanBJ(bj_lastCreatedTextTag,2.8)
call SetTextTagFadepointBJ(bj_lastCreatedTextTag,1.5)
call ForGroupBJ(Ct(RectFromCenterSizeBJ(GA,1600.,1600.)),function sqv)
else
if(smv())then
call UnitDamageTargetBJ(NA,bA,CA,ATTACK_TYPE_NORMAL,DAMAGE_TYPE_MAGIC)
call CreateNUnitsAtLoc(1,'o006',GetOwningPlayer(NA),BA,bj_UNIT_FACING)
call UnitApplyTimedLifeBJ(1.,'BTLF',bj_lastCreatedUnit)
call CreateTextTagUnitBJ("千鳥！",NA,0,14.,'d',.0,.0,0)
call SetTextTagVelocityBJ(bj_lastCreatedTextTag,64,90)
call SetTextTagPermanentBJ(bj_lastCreatedTextTag,false)
call SetTextTagLifespanBJ(bj_lastCreatedTextTag,2.8)
call SetTextTagFadepointBJ(bj_lastCreatedTextTag,1.5)
call ForGroupBJ(Ct(RectFromCenterSizeBJ(GA,1600.,1600.)),function sLv)
else
call CreateTextTagUnitBJ("Miss！",NA,0,10.,'d',.0,.0,0)
call SetTextTagVelocityBJ(bj_lastCreatedTextTag,64,90)
call SetTextTagPermanentBJ(bj_lastCreatedTextTag,false)
call SetTextTagLifespanBJ(bj_lastCreatedTextTag,2.8)
call SetTextTagFadepointBJ(bj_lastCreatedTextTag,1.5)
endif
endif
call RemoveLocation(BA)
call RemoveLocation(cA)
call RemoveLocation(gA)
call RemoveLocation(GA)
set fA=false
call TriggerSleepAction(.1)
call UnitRemoveAbility(NA,'A0I5')
call SetUnitPathing(NA,true)
call EnableTrigger(BM)
call TriggerSleepAction(2.)
call DisableTrigger(CM)
call DisableTrigger(dM)
set bj_forLoopBIndex=1
set bj_forLoopBIndexEnd=$C
loop
exitwhen bj_forLoopBIndex>bj_forLoopBIndexEnd
call CameraClearNoiseForPlayer(Player(-1+(bj_forLoopBIndex)))
set bj_forLoopBIndex=bj_forLoopBIndex+1
endloop
call TriggerSleepAction(2.)
call DisableTrigger(CM)
call ForGroupBJ(Ht(GetOwningPlayer(NA),'hfoo'),function ssv)
set bj_wantDestroyGroup=true
call ForGroupBJ(Ht(GetOwningPlayer(NA),'h02O'),function sSv)
call ForGroupBJ(Ht(GetOwningPlayer(NA),'h02Q'),function stv)
set bj_wantDestroyGroup=true
call ForGroupBJ(Ht(GetOwningPlayer(NA),'o006'),function sTv)
endif
endfunction
