// rawcode: A0I4
// hero: godie-othr (slot Q)  championDoc: content/champions/godie-othr.json
// nameZh: 迴旋爪擊
// abilityDoc: content/abilities/godie-othr.q.json
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=qYv actions=qZv (trigger var rM)
// w3a base: ANcl  levels: None
// cooldown: {"1": 30.0, "2": 30.0, "3": 30.0, "4": 50.0}
// mana: {"1": 120, "2": 150, "3": 180, "4": 275}
// range: {"2": 9999.0, "3": 9999.0, "4": 9999.0, "1": 9999.0}
// data[1] per level: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// data[2] per level: {"1": 2, "2": 2, "3": 2, "4": 2}
// data[3] per level: {"1": 5, "2": 5, "3": 5, "4": 5}
// data[4] per level: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// data[5] per level: {"1": 0, "2": 0, "3": 0, "4": 0}
// data[6] per level: {"1": "coldarrows", "2": "coldarrows", "3": "coldarrows", "4": "coldarrows"}
// slice tiers: core=['qYv', 'qZv'] depth1=['qzv'] depth2=[]

// --- qYv (core, line 21217 in war3map.j) ---
function qYv takes nothing returns boolean
return(GetSpellAbilityId()=='A0I4')
endfunction

// --- qzv (depth1, line 21220 in war3map.j) ---
function qzv takes nothing returns boolean
return(QR[(1+GetPlayerId(GetOwningPlayer(dc)))])
endfunction

// --- qZv (core, line 21223 in war3map.j) ---
function qZv takes nothing returns nothing
set pi=0
set ui=GetTriggerUnit()
set qi=GetUnitLoc(GetTriggerUnit())
set Qi=GetSpellTargetLoc()
set si=AngleBetweenPoints(qi,Qi)
set Si=I2R(((GetHeroStatBJ(0,GetTriggerUnit(),true)*2)+((GetUnitAbilityLevelSwapped(GetSpellAbilityId(),GetTriggerUnit())*'d')+50)))
if(qzv())then
set Si=(Si*2.)
endif
call CreateNUnitsAtLoc(1,'h019',GetOwningPlayer(GetTriggerUnit()),qi,GetRandomReal(0,360))
set Pi=bj_lastCreatedUnit
call SetUnitTimeScalePercent(Pi,600.)
call GroupClear(ti)
call ShowUnitHide(ui)
call RemoveLocation(qi)
call RemoveLocation(Qi)
call EnableTrigger(iM)
endfunction
