// rawcode: A0G2
// hero: godie-hpb1 (slot W)  championDoc: content/champions/godie-hpb1.json
// nameZh: 者、皆、陣
// abilityDoc: content/abilities/godie-hpb1.w.json
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=j6v actions=Jrv (trigger var ll)
// w3a base: ANcl  levels: None
// cooldown: {"1": 50.0, "2": 50.0, "3": 50.0, "4": 50.0}
// mana: {"1": 110, "2": 140, "3": 170, "4": 275}
// range: {"2": 9999.0, "3": 9999.0, "4": 9999.0, "1": 9999.0}
// data[1] per level: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// data[2] per level: {"1": 2, "2": 2, "3": 2, "4": 2}
// data[3] per level: {"1": 5, "2": 5, "3": 5, "4": 5}
// data[4] per level: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// data[5] per level: {"1": 0, "2": 0, "3": 0, "4": 0}
// data[6] per level: {"1": "coldarrows", "2": "coldarrows", "3": "coldarrows", "4": "coldarrows"}
// slice tiers: core=['j6v', 'Jrv'] depth1=['Vt', 'It', 'gt', 'j7v', 'j8v', 'j9v', 'Jev', 'Jov'] depth2=['Jvv', 'Jxv']

// --- Vt (depth1, line 2245 in war3map.j) ---
function Vt takes location Et,real Xt,real Ot returns location
return Location(GetLocationX(Et)+Xt*Cos(Ot*bj_DEGTORAD),GetLocationY(Et)+Xt*Sin(Ot*bj_DEGTORAD))
endfunction

// --- It (depth1, line 2253 in war3map.j) ---
function It takes real At,location Nt,code bt returns nothing
local rect r
if(At>=0)then
set ZS=GetLocationX(Nt)
set vt=GetLocationY(Nt)
set bj_enumDestructableRadius=At*At
set r=Rect(ZS-At,vt-At,ZS+At,vt+At)
call EnumDestructablesInRect(r,filterEnumDestructablesInCircleBJ,bt)
call RemoveRect(r)
set r=null
endif
endfunction

// --- gt (depth1, line 2287 in war3map.j) ---
function gt takes real At,location Ft returns group
set et=CreateGroup()
call GroupEnumUnitsInRangeOfLoc(et,Ft,At,ot)
return et
endfunction

// --- j6v (core, line 17738 in war3map.j) ---
function j6v takes nothing returns boolean
return(GetSpellAbilityId()=='A0G2')
endfunction

// --- j7v (depth1, line 17741 in war3map.j) ---
function j7v takes nothing returns boolean
return(QR[(1+GetPlayerId(GetOwningPlayer(GetTriggerUnit())))]==false)
endfunction

// --- j8v (depth1, line 17744 in war3map.j) ---
function j8v takes nothing returns boolean
return(oo==1)
endfunction

// --- j9v (depth1, line 17747 in war3map.j) ---
function j9v takes nothing returns nothing
call KillDestructable(GetEnumDestructable())
endfunction

// --- Jvv (depth2, line 17750 in war3map.j) ---
function Jvv takes nothing returns boolean
return(IsUnitInGroup(GetEnumUnit(),xo)==false)
endfunction

// --- Jev (depth1, line 17753 in war3map.j) ---
function Jev takes nothing returns nothing
if(Jvv())then
call GroupAddUnit(xo,GetEnumUnit())
endif
endfunction

// --- Jxv (depth2, line 17758 in war3map.j) ---
function Jxv takes nothing returns boolean
return((IsUnitType(GetEnumUnit(),UNIT_TYPE_STRUCTURE)!=true)and(IsUnitAliveBJ(GetEnumUnit()))and(IsUnitAlly(GetEnumUnit(),GetOwningPlayer(zx))!=true))!=null
endfunction

// --- Jov (depth1, line 17761 in war3map.j) ---
function Jov takes nothing returns nothing
if(Jxv())then
call UnitDamageTargetBJ(zx,GetEnumUnit(),eo,ATTACK_TYPE_NORMAL,DAMAGE_TYPE_MAGIC)
call AddSpecialEffectLocBJ(GetUnitLoc(GetEnumUnit()),"Abilities\\Spells\\Other\\Stampede\\StampedeMissileDeath.mdl")
call DestroyEffect(bj_lastCreatedEffect)
endif
endfunction

// --- Jrv (core, line 17768 in war3map.j) ---
function Jrv takes nothing returns nothing
set Yx=0
set zx=GetTriggerUnit()
set Zx=GetUnitLoc(GetTriggerUnit())
set vo=GetUnitFacing(GetTriggerUnit())
set eo=I2R(((GetHeroStatBJ(0,GetTriggerUnit(),true)*GetUnitAbilityLevelSwapped(GetSpellAbilityId(),GetTriggerUnit()))+$E1))
if(j8v())then
if(j7v())then
set eo=((3.*I2R(GetHeroStatBJ(1,GetTriggerUnit(),true)))+eo)
else
set eo=((6.*I2R(GetHeroStatBJ(1,GetTriggerUnit(),true)))+eo)
endif
call CreateTextTagUnitBJ("連技！",GetTriggerUnit(),-30.,12.,'d',.0,.0,10.)
call SetTextTagPermanentBJ(bj_lastCreatedTextTag,false)
call SetTextTagLifespanBJ(bj_lastCreatedTextTag,3.)
call SetTextTagFadepointBJ(bj_lastCreatedTextTag,1.5)
call CreateNUnitsAtLoc(1,'o00W',GetOwningPlayer(zx),GetUnitLoc(GetEnumUnit()),bj_UNIT_FACING)
call UnitApplyTimedLifeBJ(1.,'BTLF',bj_lastCreatedUnit)
endif
call CreateTextTagUnitBJ("者、皆、陣",GetTriggerUnit(),-30.,16.,100.,100.,100.,10.)
call SetTextTagVelocityBJ(bj_lastCreatedTextTag,64.,GetUnitFacing(GetTriggerUnit()))
call SetTextTagPermanentBJ(bj_lastCreatedTextTag,false)
call SetTextTagLifespanBJ(bj_lastCreatedTextTag,2.8)
call SetTextTagFadepointBJ(bj_lastCreatedTextTag,1.5)
call UnitAddAbility(GetTriggerUnit(),'A09O')
call UnitAddAbility(GetTriggerUnit(),'A09P')
call GroupClear(xo)
call UnitAddAbility(GetTriggerUnit(),'Avul')
call PlaySoundOnUnitBJ(hd,'d',GetTriggerUnit())
call PlaySoundBJ(GD)
call TriggerSleepAction(.1)
set Zx=GetUnitLoc(zx)
set Yx=1
loop
exitwhen Yx>3
set Zx=Vt(Zx,200.,vo)
call It(300.,Zx,function j9v)
call ForGroupBJ(gt(300.,Zx),function Jev)
set Yx=Yx+1
endloop
call ForGroupBJ(xo,function Jov)
call SetUnitPositionLoc(zx,Zx)
call SetUnitAnimationWithRarity(zx,"Attack Slam",RARITY_FREQUENT)
call GroupClear(xo)
call UnitRemoveAbility(zx,'A09O')
call UnitRemoveAbility(zx,'A09P')
call UnitRemoveAbility(zx,'Avul')
set oo=2
call TriggerSleepAction(1.)
set oo=0
endfunction
