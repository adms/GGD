// rawcode: A0GB
// hero: godie-huth (slot Q)  championDoc: content/champions/godie-huth.json
// nameZh: 吃掉你
// abilityDoc: content/abilities/godie-huth.q.json
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=qCv actions=qDv (trigger var zm)
// handler: event=EVENT_PLAYER_UNIT_SPELL_CAST cond=qFv actions=qhv (trigger var Zm)
// w3a base: ANtm  levels: 5
// cooldown: {"1": 35.0, "2": 28.0, "3": 21.0, "4": 14.0, "5": 7.0}
// mana: {"1": 30, "2": 50, "3": 70, "4": 90, "5": 110}
// range: {"1": 200.0}
// data[1] per level: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0, "5": 0.0}
// data[3] per level: {"1": 9, "2": 9, "3": 9, "4": 9, "5": 9}
// data[4] per level: {"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}
// slice tiers: core=['qCv', 'qDv', 'qFv', 'qhv'] depth1=['qdv', 'qGv'] depth2=['qgv']

// --- qCv (core, line 21088 in war3map.j) ---
function qCv takes nothing returns boolean
return(GetSpellAbilityId()=='A0GB')
endfunction

// --- qdv (depth1, line 21091 in war3map.j) ---
function qdv takes nothing returns boolean
return(rX==6)
endfunction

// --- qDv (core, line 21094 in war3map.j) ---
function qDv takes nothing returns nothing
set rX=(rX+1)
if(qdv())then
set rX=0
call ModifyHeroStat(0,GetTriggerUnit(),0,1)
endif
endfunction

// --- qFv (core, line 21101 in war3map.j) ---
function qFv takes nothing returns boolean
return(GetSpellAbilityId()=='A0GB')
endfunction

// --- qgv (depth2, line 21104 in war3map.j) ---
function qgv takes nothing returns boolean
return(GetUnitTypeId(GetSpellTargetUnit())=='ebal')or(GetUnitTypeId(GetSpellTargetUnit())=='orai')or(GetUnitTypeId(GetSpellTargetUnit())=='n002')or(GetUnitTypeId(GetSpellTargetUnit())=='h01W')or(GetUnitTypeId(GetSpellTargetUnit())=='nshe')or(GetUnitTypeId(GetSpellTargetUnit())=='u001')or(GetUnitTypeId(GetSpellTargetUnit())=='u00D')or(GetUnitTypeId(GetSpellTargetUnit())=='u00E')
endfunction

// --- qGv (depth1, line 21107 in war3map.j) ---
function qGv takes nothing returns boolean
return(qgv())
endfunction

// --- qhv (core, line 21110 in war3map.j) ---
function qhv takes nothing returns nothing
if(qGv())then
call IssueImmediateOrderById(GetTriggerUnit(),$D0004)
call CreateTextTagUnitBJ("這個看起來不好吃...",GetTriggerUnit(),-30.,10.,90.,.0,.0,10.)
call SetTextTagVelocityBJ(bj_lastCreatedTextTag,64.,90.)
call SetTextTagPermanentBJ(bj_lastCreatedTextTag,false)
call SetTextTagLifespanBJ(bj_lastCreatedTextTag,2.8)
call SetTextTagFadepointBJ(bj_lastCreatedTextTag,1.5)
endif
endfunction
