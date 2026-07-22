// rawcode: A0IK
// hero: godie-emns (slot Q)  championDoc: content/champions/godie-emns.json
// nameZh: 死神之眼
// abilityDoc: content/abilities/godie-emns.q.json
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=Sov actions=Siv (trigger var FM)
// w3a base: Acrs  levels: 4
// cooldown: {"1": 20.0, "2": 20.0, "3": 20.0, "4": 20.0}
// mana: {"1": 150, "2": 200, "3": 250, "4": 300}
// range: {"1": 500.0, "2": 700.0, "3": 900.0, "4": 1100.0}
// duration: {"1": 15.0, "2": 15.0, "3": 15.0, "4": 15.0}
// hero_duration: {"1": 15.0, "2": 15.0, "3": 15.0, "4": 15.0}
// slice tiers: core=['Sov', 'Siv'] depth1=['Srv'] depth2=[]

// --- Sov (core, line 22001 in war3map.j) ---
function Sov takes nothing returns boolean
return(GetSpellAbilityId()=='A0IK')
endfunction

// --- Srv (depth1, line 22004 in war3map.j) ---
function Srv takes nothing returns boolean
return(GetPlayerController(GetOwningPlayer(GetTriggerUnit()))==MAP_CONTROL_COMPUTER)
endfunction

// --- Siv (core, line 22007 in war3map.j) ---
function Siv takes nothing returns nothing
call PlaySoundOnUnitBJ(wd,100.,GetTriggerUnit())
set N=GetSpellTargetUnit()
call CreateTextTagUnitBJ((GetUnitName(N)+" 已經被死神之眼鎖定了..."),GetSpellTargetUnit(),0,10.,90.,20.,30.,0)
call SetTextTagVelocityBJ(bj_lastCreatedTextTag,64,90)
call SetTextTagPermanentBJ(bj_lastCreatedTextTag,false)
call SetTextTagLifespanBJ(bj_lastCreatedTextTag,3.)
call SetTextTagFadepointBJ(bj_lastCreatedTextTag,1.7)
if(Srv())then
call IssueImmediateOrderById(GetTriggerUnit(),$D026D)
call IssueImmediateOrderById(GetTriggerUnit(),$D00C4)
call IssueImmediateOrderById(GetTriggerUnit(),$D0277)
call IssueImmediateOrderById(GetTriggerUnit(),$D0080)
call IssueImmediateOrderById(GetTriggerUnit(),$D009F)
call IssueImmediateOrderById(GetTriggerUnit(),$D00C4)
call IssueImmediateOrderById(GetTriggerUnit(),$D0277)
call IssueImmediateOrderById(GetTriggerUnit(),$D0080)
call IssueImmediateOrderById(GetTriggerUnit(),$D009F)
endif
call SetUnitLifePercentBJ(GetTriggerUnit(),(GetUnitLifePercent(GetTriggerUnit())/ 2.))
call SetUnitLifePercentBJ(GetTriggerUnit(),(GetUnitLifePercent(GetTriggerUnit())/ 2.))
call PlaySoundOnUnitBJ(xD,'d',GetTriggerUnit())
endfunction
