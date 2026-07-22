// rawcode: A05I
// hero: godie-emns (slot R)  championDoc: content/champions/godie-emns.json
// nameZh: 心臟麻痺
// abilityDoc: content/abilities/godie-emns.r.json
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=SAv actions=SNv (trigger var GM)
// w3a base: ANbr  levels: 3
// cooldown: {"1": 45.0, "2": 45.0, "3": 45.0}
// mana: {"1": 150, "2": 250, "3": 350}
// area: {"1": 0.5, "2": 0.5, "3": 0.5}
// duration: {"1": 1.0, "2": 1.0, "3": 1.0}
// hero_duration: {"1": 1.0, "2": 1.0, "3": 1.0}
// data[1] per level: {"1": 0.0, "2": 0.0, "3": 0.0}
// slice tiers: core=['SAv', 'SNv'] depth1=[] depth2=[]

// --- SAv (core, line 22071 in war3map.j) ---
function SAv takes nothing returns boolean
return(GetSpellAbilityId()=='A05I')
endfunction

// --- SNv (core, line 22074 in war3map.j) ---
function SNv takes nothing returns nothing
set uV=((GetUnitStateSwap(UNIT_STATE_MAX_LIFE,N)*(.05+(.1*I2R(GetUnitAbilityLevelSwapped('A05I',GetTriggerUnit())))))+450.)
call EnableTrigger(hM)
call CreateNUnitsAtLoc(1,'o002',GetOwningPlayer(GetTriggerUnit()),GetUnitLoc(N),bj_UNIT_FACING)
call ShowUnitHide(bj_lastCreatedUnit)
call UnitApplyTimedLifeBJ(1.,'BTLF',bj_lastCreatedUnit)
call UnitAddAbility(bj_lastCreatedUnit,'A0EC')
call SetUnitAbilityLevelSwapped('A0EC',bj_lastCreatedUnit,GetUnitAbilityLevelSwapped(GetSpellAbilityId(),GetTriggerUnit()))
call SetUnitFacingToFaceUnitTimed(bj_lastCreatedUnit,N,0)
call IssueTargetOrderById(bj_lastCreatedUnit,$D00F1,N)
call PlaySoundOnUnitBJ(oD,'d',GetTriggerUnit())
call TriggerSleepAction(1.)
call DisableTrigger(hM)
endfunction
