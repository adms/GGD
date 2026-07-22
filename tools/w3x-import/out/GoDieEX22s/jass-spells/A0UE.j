// rawcode: A0UE
// hero: godie-o00l (slot R)  championDoc: content/champions/godie-o00l.json
// nameZh: 暴爆咒
// abilityDoc: content/abilities/godie-o00l.r.json
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=PIv actions=PBv (trigger var Pm)
// w3a base: APsa  levels: 3
// cooldown: {"2": 60.0, "3": 60.0}
// mana: {"1": 300, "2": 420, "3": 540}
// area: {"1": 10.0, "2": 10.0, "3": 10.0}
// duration: {"1": 5.0, "2": 5.0, "3": 5.0}
// hero_duration: {"1": 5.0, "2": 5.0, "3": 5.0}
// slice tiers: core=['PIv', 'PBv'] depth1=['gt', 'PNv', 'Pbv'] depth2=['PAv']

// --- gt (depth1, line 2287 in war3map.j) ---
function gt takes real At,location Ft returns group
set et=CreateGroup()
call GroupEnumUnitsInRangeOfLoc(et,Ft,At,ot)
return et
endfunction

// --- PIv (core, line 20761 in war3map.j) ---
function PIv takes nothing returns boolean
return(GetSpellAbilityId()=='A0UE')
endfunction

// --- PAv (depth2, line 20764 in war3map.j) ---
function PAv takes nothing returns boolean
return(IsPlayerEnemy(GetOwningPlayer(GetEnumUnit()),GetOwningPlayer(Ri)))
endfunction

// --- PNv (depth1, line 20767 in war3map.j) ---
function PNv takes nothing returns nothing
if(PAv())then
set po=(po+GetUnitStateSwap(UNIT_STATE_MANA,GetEnumUnit()))
call AddSpecialEffectTargetUnitBJ("chest",GetEnumUnit(),"Abilities\\Spells\\Undead\\Darksummoning\\DarkSummonTarget.mdl")
call DestroyEffect(bj_lastCreatedEffect)
endif
endfunction

// --- Pbv (depth1, line 20774 in war3map.j) ---
function Pbv takes nothing returns boolean
return(QR[(1+GetPlayerId(GetOwningPlayer(Ri)))])
endfunction

// --- PBv (core, line 20777 in war3map.j) ---
function PBv takes nothing returns nothing
set Ri=GetTriggerUnit()
set WA=.0
set yA=GetUnitFacing(GetTriggerUnit())
if(Pbv())then
call AddSpecialEffectTargetUnitBJ("chest",Ri,"Abilities\\Spells\\Undead\\DeathCoil\\DeathCoilMissile.mdl")
call DestroyEffect(bj_lastCreatedEffect)
set po=.0
call ForGroupBJ(gt(1200.,GetUnitLoc(Ri)),function PNv)
set po=(po*.03)
endif
call EnableTrigger(qm)
endfunction
