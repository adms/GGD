// rawcode: A05T
// hero: godie-n01c (slot W)  championDoc: content/champions/godie-n01c.json
// nameZh: 萊丁快速劍
// abilityDoc: content/abilities/godie-n01c.w.json
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_CAST cond=Dxv actions=Dov (trigger var yk)
// w3a base: AOcl  levels: 4
// cooldown: {"1": 30.0, "2": 30.0, "3": 30.0, "4": 30.0}
// mana: {"1": 50, "2": 80, "3": 110, "4": 140}
// range: {"1": 350.0, "2": 350.0, "3": 350.0, "4": 350.0}
// area: {"2": 250.0, "3": 250.0, "4": 250.0, "1": 250.0}
// data[1] per level: {"1": 150.0, "2": 250.0, "3": 350.0, "4": 450.0}
// data[2] per level: {"1": 16, "2": 16, "3": 16, "4": 16}
// data[3] per level: {"1": 0.30000001192092896, "2": 0.30000001192092896, "3": 0.30000001192092896, "4": 0.30000001192092896}
// slice tiers: core=['Dxv', 'Dov'] depth1=['it', 'ZT'] depth2=['yT']

// --- it (depth1, line 2226 in war3map.j) ---
function it takes real at returns nothing
local real nt
local real st=TimerGetElapsed(YS)
if st<=0 then
set YS=CreateTimer()
call TimerStart(YS,$F4240,false,null)
endif
if(at>0)then
loop
set nt=at-TimerGetElapsed(YS)+st
exitwhen nt<=0
if(nt>bj_POLLED_WAIT_SKIP_THRESHOLD)then
call TriggerSleepAction(.1*nt)
else
call TriggerSleepAction(bj_POLLED_WAIT_INTERVAL)
endif
endloop
endif
endfunction

// --- yT (depth2, line 3030 in war3map.j) ---
function yT takes nothing returns nothing
local effect YT=bj_lastCreatedEffect
local real zT=bj_enumDestructableRadius
call it(zT)
call DestroyEffect(YT)
endfunction

// --- ZT (depth1, line 3036 in war3map.j) ---
function ZT takes effect YT,real vu returns nothing
local real eu=bj_enumDestructableRadius
set bj_lastCreatedEffect=YT
set bj_enumDestructableRadius=vu
call ExecuteFunc("yT")
set bj_enumDestructableRadius=eu
endfunction

// --- Dxv (core, line 14497 in war3map.j) ---
function Dxv takes nothing returns boolean
return(GetSpellAbilityId()=='A05T')
endfunction

// --- Dov (core, line 14500 in war3map.j) ---
function Dov takes nothing returns nothing
local location dwv=GetUnitLoc(GetSpellTargetUnit())
call it(.0)
call UnitAddAbility(GetTriggerUnit(),'A09O')
call UnitAddAbility(GetTriggerUnit(),'A09P')
call AddSpecialEffectTargetUnitBJ("chest",GetTriggerUnit(),"Abilities\\Spells\\Orc\\MirrorImage\\MirrorImageCaster.mdl")
call ZT(bj_lastCreatedEffect,.5)
call TriggerSleepAction(.5)
call AddSpecialEffectLocBJ(GetUnitLoc(GetTriggerUnit()),"Objects\\Spawnmodels\\Undead\\ImpaleTargetDust\\ImpaleTargetDust.mdl")
call ZT(bj_lastCreatedEffect,.5)
call AddSpecialEffectTargetUnitBJ("chest",GetTriggerUnit(),"Abilities\\Spells\\Orc\\MirrorImage\\MirrorImageCaster.mdl")
call ZT(bj_lastCreatedEffect,.5)
call SetUnitPositionLoc(GetTriggerUnit(),dwv)
call RemoveLocation(dwv)
call SetUnitAnimation(bj_lastCreatedUnit,"Attack Walk Stand Spin")
call AddSpecialEffectTargetUnitBJ("chest",GetTriggerUnit(),"Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl")
call ZT(bj_lastCreatedEffect,.5)
call UnitRemoveAbility(GetTriggerUnit(),'A09O')
call UnitRemoveAbility(GetTriggerUnit(),'A09P')
endfunction
