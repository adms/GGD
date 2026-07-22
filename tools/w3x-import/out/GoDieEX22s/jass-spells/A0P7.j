// rawcode: A0P7
// hero: godie-n00p (slot R)  championDoc: content/champions/godie-n00p.json
// nameZh: 億年樹
// abilityDoc: content/abilities/godie-n00p.r.json
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=C7v actions=dev (trigger var Mk)
// w3a base: AUin  levels: 3
// cooldown: {"1": 75.0, "2": 75.0, "3": 75.0}
// mana: {"1": 200, "2": 375, "3": 550}
// range: {"1": 350.0, "2": 350.0, "3": 350.0}
// area: {"1": 450.0, "2": 450.0, "3": 450.0}
// duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582}
// hero_duration: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582}
// data[1] per level: {"1": 300.0, "2": 500.0, "3": 700.0}
// data[2] per level: {"1": 8.0, "2": 12.0, "3": 16.0}
// data[4] per level: {"1": "n019", "2": "n01A", "3": "n010"}
// slice tiers: core=['C7v', 'dev'] depth1=['Ht', 'C8v', 'C9v', 'dvv'] depth2=[]

// --- Ht (depth1, line 2303 in war3map.j) ---
function Ht takes player Dt,integer jt returns group
set et=CreateGroup()
set bj_groupEnumTypeId=jt
call GroupEnumUnitsOfPlayer(et,Dt,filterGetUnitsOfPlayerAndTypeId)
return et
endfunction

// --- C7v (core, line 14117 in war3map.j) ---
function C7v takes nothing returns boolean
return(GetSpellAbilityId()=='A0P7')
endfunction

// --- C8v (depth1, line 14120 in war3map.j) ---
function C8v takes nothing returns nothing
set XX=GetEnumUnit()
endfunction

// --- C9v (depth1, line 14123 in war3map.j) ---
function C9v takes nothing returns nothing
call KillUnit(GetEnumUnit())
call RemoveUnit(GetEnumUnit())
endfunction

// --- dvv (depth1, line 14127 in war3map.j) ---
function dvv takes nothing returns nothing
call KillUnit(GetEnumUnit())
call RemoveUnit(GetEnumUnit())
endfunction

// --- dev (core, line 14131 in war3map.j) ---
function dev takes nothing returns nothing
set EX=GetTriggerUnit()
call TriggerSleepAction(1.5)
call ForGroupBJ(Ht(GetOwningPlayer(EX),'n010'),function C8v)
call TriggerSleepAction(I2R((GetUnitAbilityLevelSwapped('A0P7',EX)*9)))
call ForGroupBJ(Ht(GetOwningPlayer(EX),'o00A'),function C9v)
call ForGroupBJ(Ht(GetOwningPlayer(EX),'n010'),function dvv)
endfunction
