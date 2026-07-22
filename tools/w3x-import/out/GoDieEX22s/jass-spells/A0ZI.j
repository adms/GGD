// rawcode: A0ZI
// hero: godie-n01l (slot R)  championDoc: tools/w3x-import/out/GoDieEX22s/drafts/champions/godie-n01l.json
// nameZh: 自在飛翔
// abilityDoc: tools/w3x-import/out/GoDieEX22s/drafts/champions/godie-n01l.json#abilities.R
// kind: passive (referenced via GetUnitAbilityLevel/GetLearnedSkill in other triggers)
// handler: event=helper-ref; called from VGe (events: EVENT_UNIT_DAMAGED) cond=None actions=Vge (trigger var None)
// w3a base: AOr2  levels: 3
// area: {"1": 100.0, "2": 100.0, "3": 100.0}
// data[1] per level: {"1": 0.05000000074505806, "2": 0.10000000149011612, "3": 0.15000000596046448}
// data[2] per level: {"1": 0.20000000298023224, "2": 0.4000000059604645, "3": 0.6000000238418579, "4": 0.800000011920929}
// slice tiers: core=['Vge', 'VGe'] depth1=[] depth2=[]

// --- Vge (core, line 28592 in war3map.j) ---
function Vge takes nothing returns boolean
return(GetUnitAbilityLevelSwapped('A0ZI',GetTriggerUnit())>0)and(GetRandomInt(1,$A)==4)
endfunction

// --- VGe (core, line 28595 in war3map.j) ---
function VGe takes nothing returns nothing
local unit mPv
if(Vge())then
set zB=GetUnitLoc(GetTriggerUnit())
call CreateNUnitsAtLoc(1,'hfoo',GetOwningPlayer(GetTriggerUnit()),zB,bj_UNIT_FACING)
set mPv=bj_lastCreatedUnit
call UnitApplyTimedLifeBJ(3.,'BTLF',mPv)
call UnitAddItemByIdSwapped('will',mPv)
call ShowUnitHide(mPv)
call UnitUseItemTarget(mPv,bj_lastCreatedItem,GetTriggerUnit())
call RemoveLocation(zB)
call TriggerSleepAction(1.)
call KillUnit(mPv)
call RemoveUnit(mPv)
endif
endfunction
