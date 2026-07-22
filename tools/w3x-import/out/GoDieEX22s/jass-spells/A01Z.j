// rawcode: A01Z
// hero: godie-ubal (slot R)  championDoc: content/champions/godie-ubal.json
// nameZh: 魔界之王
// abilityDoc: content/abilities/godie-ubal.r.json
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=uFv actions=uGv (trigger var ap)
// w3a base: ANef  levels: 3
// cooldown: {"1": 90.0, "3": 90.0, "2": 90.0}
// mana: {"2": 300, "3": 450}
// duration: {"1": 35.0, "2": 35.0, "3": 35.0}
// hero_duration: {"1": 35.0, "2": 35.0, "3": 35.0}
// data[1] per level: {"1": "u001", "2": "u00D", "3": "u00E"}
// slice tiers: core=['uFv', 'uGv'] depth1=['Ct', 'ugv'] depth2=[]

// --- Ct (depth1, line 2271 in war3map.j) ---
function Ct takes rect r returns group
set et=CreateGroup()
call GroupEnumUnitsInRect(et,r,ot)
return et
endfunction

// --- uFv (core, line 23207 in war3map.j) ---
function uFv takes nothing returns boolean
return(GetSpellAbilityId()=='A01Z')
endfunction

// --- ugv (depth1, line 23210 in war3map.j) ---
function ugv takes nothing returns nothing
call CameraSetEQNoiseForPlayer(GetOwningPlayer(GetEnumUnit()),12.)
endfunction

// --- uGv (core, line 23213 in war3map.j) ---
function uGv takes nothing returns nothing
set qn=GetTriggerUnit()
call PlaySoundOnUnitBJ(Jf,100.,GetTriggerUnit())
call PlaySoundOnUnitBJ(xf,100.,GetTriggerUnit())
set bj_forLoopBIndex=1
set bj_forLoopBIndexEnd=GetUnitAbilityLevelSwapped(GetSpellAbilityId(),GetTriggerUnit())
loop
exitwhen bj_forLoopBIndex>bj_forLoopBIndexEnd
call ForGroupBJ(Ct(RectFromCenterSizeBJ(GetSpellTargetLoc(),1600.,1600.)),function ugv)
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
endfunction
