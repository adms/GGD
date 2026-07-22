// rawcode: A0U1
// hero: godie-hapm (slot W)  championDoc: content/champions/godie-hapm.json
// nameZh: 蹂躪編年史
// abilityDoc: content/abilities/godie-hapm.w.json
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=ole actions=oLe (trigger var rQ)
// w3a base: AOcl  levels: 4
// cooldown: {"1": 45.0, "2": 45.0, "3": 45.0, "4": 45.0}
// mana: {"2": 155, "3": 190, "4": 225}
// range: {"1": 300.0, "2": 300.0, "3": 300.0, "4": 300.0}
// area: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// data[1] per level: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// data[2] per level: {"1": 1, "2": 1, "3": 1, "4": 1}
// data[3] per level: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// slice tiers: core=['ole', 'oLe'] depth1=[] depth2=[]

// --- ole (core, line 26793 in war3map.j) ---
function ole takes nothing returns boolean
return(GetSpellAbilityId()=='A0U1')
endfunction

// --- oLe (core, line 26796 in war3map.j) ---
function oLe takes nothing returns nothing
set pI=(250.+(100.*I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(),GetTriggerUnit()))))
set PI=.0
set qI=GetTriggerUnit()
set QI=GetSpellTargetUnit()
set sI=GetUnitLoc(QI)
set SI=GetUnitLoc(GetTriggerUnit())
set tI=AngleBetweenPoints(sI,SI)
call RemoveLocation(sI)
call RemoveLocation(SI)
call PauseUnit(QI,true)
call SetUnitPathing(QI,false)
call UnitAddAbility(QI,'Arav')
call UnitAddAbility(QI,'Avul')
call EnableTrigger(iQ)
endfunction
