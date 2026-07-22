// rawcode: A0Y9
// hero: godie-e00j (slot R)  championDoc: content/champions/godie-e00j.json
// nameZh: 藍色戰氣一百重天
// abilityDoc: content/abilities/godie-e00j.r.json
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=nPe actions=nse (trigger var Vs)
// w3a base: Aprg  levels: 3
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0}
// mana: {"1": 140, "2": 220, "3": 300}
// range: {"1": 200.0, "2": 200.0, "3": 200.0}
// duration: {"1": 3.0, "2": 3.0, "3": 3.0}
// hero_duration: {"1": 3.0, "2": 3.0, "3": 3.0}
// data[1] per level: {"2": 5, "3": 5}
// data[3] per level: {"1": 0.0}
// data[6] per level: {"1": 300, "2": 500, "3": 700}
// slice tiers: core=['nPe', 'nse'] depth1=['nqe', 'nQe'] depth2=[]

// --- nPe (core, line 28313 in war3map.j) ---
function nPe takes nothing returns boolean
return(GetSpellAbilityId()=='A0Y9')
endfunction

// --- nqe (depth1, line 28316 in war3map.j) ---
function nqe takes nothing returns boolean
return(UnitHasBuffBJ(NB,'B04Y'))
endfunction

// --- nQe (depth1, line 28319 in war3map.j) ---
function nQe takes nothing returns boolean
return(UnitHasBuffBJ(KB,'B050'))
endfunction

// --- nse (core, line 28322 in war3map.j) ---
function nse takes nothing returns nothing
set KB=GetSpellTargetUnit()
set lB=(300.+(300.*I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(),GetTriggerUnit()))))
if(nqe())then
set kB=GetUnitLoc(GetTriggerUnit())
call CreateNUnitsAtLoc(1,'hfoo',GetOwningPlayer(NB),kB,bj_UNIT_FACING)
call UnitApplyTimedLifeBJ(2.,'BTLF',bj_lastCreatedUnit)
call UnitAddAbility(bj_lastCreatedUnit,'A0UT')
call SetUnitAbilityLevelSwapped('A0UT',bj_lastCreatedUnit,GetUnitAbilityLevelSwapped('A0Y9',GetTriggerUnit()))
call IssueImmediateOrderById(bj_lastCreatedUnit,$D009F)
call KillUnit(bj_lastCreatedUnit)
call RemoveUnit(bj_lastCreatedUnit)
call AddSpecialEffectLocBJ(kB,"Abilities\\Spells\\Human\\Thunderclap\\ThunderClapCaster.mdl")
call DestroyEffect(bj_lastCreatedEffect)
call RemoveLocation(kB)
endif
call TriggerSleepAction(.0)
if(nQe())then
call UnitDamageTargetBJ(NB,KB,lB,ATTACK_TYPE_NORMAL,DAMAGE_TYPE_MAGIC)
call AddSpecialEffectTargetUnitBJ("chest",KB,"Units\\NightElf\\Wisp\\WispExplode.mdl")
call DestroyEffect(bj_lastCreatedEffect)
call AddSpecialEffectTargetUnitBJ("overhead",KB,"Abilities\\Spells\\Human\\Avatar\\AvatarCaster.mdl")
call DestroyEffect(bj_lastCreatedEffect)
endif
endfunction
