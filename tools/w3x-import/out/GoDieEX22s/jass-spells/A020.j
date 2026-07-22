// rawcode: A020
// hero: godie-u034 (slot E)  championDoc: content/champions/godie-u034.json
// nameZh: 山形修煉-強
// abilityDoc: content/abilities/godie-u034.e.json
// kind: passive (referenced via GetUnitAbilityLevel/GetLearnedSkill in other triggers)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=None actions=csv (trigger var dk)
// handler: event=EVENT_PLAYER_UNIT_ATTACKED cond=None actions=c5v (trigger var fk)
// w3a base: Aamk  levels: None
// slice tiers: core=['csv', 'c5v'] depth1=['Ct', 'gt', 'Ht', 'cKv', 'clv', 'cmv', 'cMv', 'cpv', 'cPv', 'cqv', 'cQv', 'czv', 'c_v', 'c0v', 'c1v', 'c2v', 'c3v', 'c4v'] depth2=['cLv', 'cZv']

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

// --- cKv (depth1, line 13464 in war3map.j) ---
function cKv takes nothing returns boolean
return(IsUnitAlly(GetSpellTargetUnit(),Player($C))!=true)
endfunction

// --- clv (depth1, line 13467 in war3map.j) ---
function clv takes nothing returns nothing
call CameraSetEQNoiseForPlayer(GetOwningPlayer(GetEnumUnit()),12.)
endfunction

// --- cLv (depth2, line 13470 in war3map.j) ---
function cLv takes nothing returns boolean
return(IsUnitAlly(GetEnumUnit(),GetOwningPlayer(Wi))==false)
endfunction

// --- cmv (depth1, line 13473 in war3map.j) ---
function cmv takes nothing returns nothing
if(cLv())then
call UnitDamageTargetBJ(Wi,GetEnumUnit(),wi,ATTACK_TYPE_NORMAL,DAMAGE_TYPE_MAGIC)
endif
endfunction

// --- cMv (depth1, line 13478 in war3map.j) ---
function cMv takes nothing returns boolean
return(QR[(1+GetPlayerId(GetOwningPlayer(GetTriggerUnit())))])
endfunction

// --- cpv (depth1, line 13481 in war3map.j) ---
function cpv takes nothing returns boolean
return(QR[(1+GetPlayerId(GetOwningPlayer(GetTriggerUnit())))])
endfunction

// --- cPv (depth1, line 13484 in war3map.j) ---
function cPv takes nothing returns boolean
return(DistanceBetweenPoints(eB,xB)<=500.)
endfunction

// --- cqv (depth1, line 13487 in war3map.j) ---
function cqv takes nothing returns boolean
return(DistanceBetweenPoints(eB,xB)<=250.)
endfunction

// --- cQv (depth1, line 13490 in war3map.j) ---
function cQv takes nothing returns nothing
call KillUnit(GetEnumUnit())
call RemoveUnit(GetEnumUnit())
endfunction

// --- csv (core, line 13494 in war3map.j) ---
function csv takes nothing returns nothing
set Wi=GetTriggerUnit()
set yi=GetSpellTargetUnit()
set eB=GetUnitLoc(GetTriggerUnit())
set xB=GetUnitLoc(GetSpellTargetUnit())
if(cqv())then
set wi=(350.+(150.*I2R(GetUnitAbilityLevelSwapped('A020',GetTriggerUnit()))))
set V=0
set E=GetSpellTargetUnit()
set n=GetUnitLoc(GetTriggerUnit())
set O=GetUnitLoc(GetSpellTargetUnit())
set X=AngleBetweenPoints(n,O)
call RemoveLocation(n)
call RemoveLocation(O)
call UnitDamageTargetBJ(GetTriggerUnit(),yi,wi,ATTACK_TYPE_NORMAL,DAMAGE_TYPE_MAGIC)
call CreateTextTagUnitBJ((("石頭 "+I2S(R2I(wi)))+"!!"),GetTriggerUnit(),-30.,10.,90.,.0,.0,10.)
call SetTextTagVelocityBJ(bj_lastCreatedTextTag,64.,90.)
call SetTextTagPermanentBJ(bj_lastCreatedTextTag,false)
call SetTextTagLifespanBJ(bj_lastCreatedTextTag,2.8)
call SetTextTagFadepointBJ(bj_lastCreatedTextTag,1.5)
if(cKv())then
call EnableTrigger(Dk)
endif
call PlaySoundOnUnitBJ(jD,100.,GetTriggerUnit())
set bj_forLoopBIndex=1
set bj_forLoopBIndexEnd=GetUnitAbilityLevelSwapped(GetSpellAbilityId(),GetTriggerUnit())
loop
exitwhen bj_forLoopBIndex>bj_forLoopBIndexEnd
call ForGroupBJ(Ct(RectFromCenterSizeBJ(GetSpellTargetLoc(),1600.,1600.)),function clv)
set bj_forLoopBIndex=bj_forLoopBIndex+1
endloop
call TriggerSleepAction(.5)
set bj_forLoopBIndex=1
set bj_forLoopBIndexEnd=$C
loop
exitwhen bj_forLoopBIndex>bj_forLoopBIndexEnd
call CameraClearNoiseForPlayer(Player(-1+(bj_forLoopBIndex)))
set bj_forLoopBIndex=bj_forLoopBIndex+1
endloop
else
if(cPv())then
set wi=(250.+(100.*I2R(GetUnitAbilityLevelSwapped('A08W',GetTriggerUnit()))))
call AddSpecialEffectTargetUnitBJ("chest",yi,"HeroCloudCyd.mdx")
call DestroyEffect(bj_lastCreatedEffect)
call UnitDamageTargetBJ(GetTriggerUnit(),yi,wi,ATTACK_TYPE_NORMAL,DAMAGE_TYPE_MAGIC)
call CreateTextTagUnitBJ((("剪刀 "+I2S(R2I(wi)))+"!!"),GetTriggerUnit(),-30.,10.,90.,.0,.0,10.)
call SetTextTagVelocityBJ(bj_lastCreatedTextTag,64.,90.)
call SetTextTagPermanentBJ(bj_lastCreatedTextTag,false)
call SetTextTagLifespanBJ(bj_lastCreatedTextTag,2.8)
call SetTextTagFadepointBJ(bj_lastCreatedTextTag,1.5)
if(cpv())then
call CreateNUnitsAtLocFacingLocBJ(1,'hfoo',GetOwningPlayer(Wi),eB,xB)
call ShowUnitHide(bj_lastCreatedUnit)
call UnitApplyTimedLifeBJ(1.,'BTLF',bj_lastCreatedUnit)
call UnitAddAbility(bj_lastCreatedUnit,'A0NP')
call IssueTargetOrderById(bj_lastCreatedUnit,$D02B6,yi)
endif
else
set wi=(225.+(75.*I2R(GetUnitAbilityLevelSwapped('A08X',GetTriggerUnit()))))
call AddSpecialEffectLocBJ(xB,"Units\\NightElf\\Wisp\\WispExplode.mdl")
call DestroyEffect(bj_lastCreatedEffect)
call ForGroupBJ(gt(270.,xB),function cmv)
call CreateTextTagUnitBJ((("布 "+I2S(R2I(wi)))+"!!"),GetTriggerUnit(),-30.,10.,90.,.0,.0,10.)
call SetTextTagVelocityBJ(bj_lastCreatedTextTag,64.,90.)
call SetTextTagPermanentBJ(bj_lastCreatedTextTag,false)
call SetTextTagLifespanBJ(bj_lastCreatedTextTag,2.8)
call SetTextTagFadepointBJ(bj_lastCreatedTextTag,1.5)
if(cMv())then
call CreateNUnitsAtLocFacingLocBJ(1,'hfoo',GetOwningPlayer(Wi),xB,eB)
call ShowUnitHide(bj_lastCreatedUnit)
call UnitApplyTimedLifeBJ(1.,'BTLF',bj_lastCreatedUnit)
call UnitAddAbility(bj_lastCreatedUnit,'A04W')
call IssueImmediateOrderById(bj_lastCreatedUnit,$D0080)
endif
endif
endif
call RemoveLocation(eB)
call RemoveLocation(xB)
call TriggerSleepAction(2)
call ForGroupBJ(Ht(GetOwningPlayer(Wi),'hfoo'),function cQv)
endfunction

// --- czv (depth1, line 13637 in war3map.j) ---
function czv takes nothing returns boolean
return(IsUnitAlly(GetTriggerUnit(),Player($C))!=true)
endfunction

// --- cZv (depth2, line 13640 in war3map.j) ---
function cZv takes nothing returns boolean
return((IsUnitAliveBJ(GetEnumUnit()))and(IsUnitAlly(GetEnumUnit(),GetOwningPlayer(Wi))==false)and(IsUnitType(GetEnumUnit(),UNIT_TYPE_STRUCTURE)==false))!=null
endfunction

// --- c_v (depth1, line 13643 in war3map.j) ---
function c_v takes nothing returns nothing
if(cZv())then
call UnitDamageTargetBJ(Wi,GetEnumUnit(),wi,ATTACK_TYPE_NORMAL,DAMAGE_TYPE_MAGIC)
endif
endfunction

// --- c0v (depth1, line 13648 in war3map.j) ---
function c0v takes nothing returns boolean
return(QR[(1+GetPlayerId(GetOwningPlayer(Wi)))])
endfunction

// --- c1v (depth1, line 13651 in war3map.j) ---
function c1v takes nothing returns boolean
return(QR[(1+GetPlayerId(GetOwningPlayer(Wi)))])
endfunction

// --- c2v (depth1, line 13654 in war3map.j) ---
function c2v takes nothing returns boolean
return(GetRandomInt(1,2)==1)
endfunction

// --- c3v (depth1, line 13657 in war3map.j) ---
function c3v takes nothing returns boolean
return(GetRandomInt(1,'d')<=(5+R2I((I2R(GetHeroStatBJ(1,GetAttacker(),true))/ 10.))))
endfunction

// --- c4v (depth1, line 13660 in war3map.j) ---
function c4v takes nothing returns nothing
call KillUnit(GetEnumUnit())
call RemoveUnit(GetEnumUnit())
endfunction

// --- c5v (core, line 13664 in war3map.j) ---
function c5v takes nothing returns nothing
set Wi=GetAttacker()
set yi=GetTriggerUnit()
set eB=GetUnitLoc(Wi)
set xB=GetUnitLoc(yi)
if(c3v())then
set wi=(350.+(150.*I2R(GetUnitAbilityLevelSwapped('A020',Wi))))
set V=0
set E=yi
set n=GetUnitLoc(Wi)
set O=GetUnitLoc(yi)
set X=AngleBetweenPoints(n,O)
call RemoveLocation(n)
call RemoveLocation(O)
call UnitDamageTargetBJ(Wi,yi,wi,ATTACK_TYPE_NORMAL,DAMAGE_TYPE_MAGIC)
call CreateTextTagUnitBJ((("石頭 "+I2S(R2I(wi)))+"!!"),Wi,-30.,10.,90.,.0,.0,10.)
call SetTextTagVelocityBJ(bj_lastCreatedTextTag,64.,90.)
call SetTextTagPermanentBJ(bj_lastCreatedTextTag,false)
call SetTextTagLifespanBJ(bj_lastCreatedTextTag,2.8)
call SetTextTagFadepointBJ(bj_lastCreatedTextTag,1.5)
if(czv())then
call EnableTrigger(Dk)
endif
call PlaySoundOnUnitBJ(jD,100.,Wi)
else
if(c2v())then
set wi=(250.+(100.*I2R(GetUnitAbilityLevelSwapped('A08W',Wi))))
call AddSpecialEffectTargetUnitBJ("chest",yi,"HeroCloudCyd.mdx")
call DestroyEffect(bj_lastCreatedEffect)
call UnitDamageTargetBJ(Wi,yi,wi,ATTACK_TYPE_NORMAL,DAMAGE_TYPE_MAGIC)
call CreateTextTagUnitBJ((("剪刀 "+I2S(R2I(wi)))+"!!"),Wi,-30.,10.,90.,.0,.0,10.)
call SetTextTagVelocityBJ(bj_lastCreatedTextTag,64.,90.)
call SetTextTagPermanentBJ(bj_lastCreatedTextTag,false)
call SetTextTagLifespanBJ(bj_lastCreatedTextTag,2.8)
call SetTextTagFadepointBJ(bj_lastCreatedTextTag,1.5)
if(c1v())then
call CreateNUnitsAtLocFacingLocBJ(1,'hfoo',GetOwningPlayer(Wi),eB,xB)
call ShowUnitHide(bj_lastCreatedUnit)
call UnitApplyTimedLifeBJ(1.,'BTLF',bj_lastCreatedUnit)
call UnitAddAbility(bj_lastCreatedUnit,'A0NP')
call IssueTargetOrderById(bj_lastCreatedUnit,$D02B6,yi)
endif
else
set wi=(225.+(75.*I2R(GetUnitAbilityLevelSwapped('A08X',Wi))))
call AddSpecialEffectLocBJ(xB,"Units\\NightElf\\Wisp\\WispExplode.mdl")
call DestroyEffect(bj_lastCreatedEffect)
call ForGroupBJ(gt(270.,xB),function c_v)
call CreateTextTagUnitBJ((("布 "+I2S(R2I(wi)))+"!!"),GetTriggerUnit(),-30.,10.,90.,.0,.0,10.)
call SetTextTagVelocityBJ(bj_lastCreatedTextTag,64.,90.)
call SetTextTagPermanentBJ(bj_lastCreatedTextTag,false)
call SetTextTagLifespanBJ(bj_lastCreatedTextTag,2.8)
call SetTextTagFadepointBJ(bj_lastCreatedTextTag,1.5)
if(c0v())then
call CreateNUnitsAtLocFacingLocBJ(1,'hfoo',GetOwningPlayer(Wi),xB,eB)
call ShowUnitHide(bj_lastCreatedUnit)
call UnitApplyTimedLifeBJ(1.,'BTLF',bj_lastCreatedUnit)
call UnitAddAbility(bj_lastCreatedUnit,'A04W')
call IssueImmediateOrderById(bj_lastCreatedUnit,$D0080)
endif
endif
endif
call RemoveLocation(eB)
call RemoveLocation(xB)
call TriggerSleepAction(2)
call ForGroupBJ(Ht(GetOwningPlayer(Wi),'hfoo'),function c4v)
endfunction
