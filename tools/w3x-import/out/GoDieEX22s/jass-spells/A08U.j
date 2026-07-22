// rawcode: A08U
// hero: godie-huth (slot R)  championDoc: content/champions/godie-huth.json
// nameZh: 破滅能量彈
// abilityDoc: content/abilities/godie-huth.r.json
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=qjv actions=qlv (trigger var vM)
// w3a base: AOeq  levels: 3
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 60.0}
// mana: {"1": 280, "2": 430, "3": 580, "4": 730}
// range: {"2": 450.0, "3": 450.0, "4": 450.0, "1": 450.0}
// area: {"1": 410.0, "4": 350.0, "2": 410.0, "3": 410.0}
// duration: {"2": 5.0, "1": 5.0, "3": 5.0, "4": 5.0}
// hero_duration: {"1": 5.0, "2": 5.0, "3": 5.0, "4": 5.0}
// data[1] per level: {"1": 0.009999999776482582, "2": 0.009999999776482582, "3": 0.009999999776482582}
// data[2] per level: {"2": 0.0, "1": 0.0, "3": 0.0, "4": 0.0}
// data[3] per level: {"2": 0.44999998807907104, "1": 0.3499999940395355, "3": 0.550000011920929, "4": 0.6500000357627869}
// data[4] per level: {"1": 410.0, "2": 410.0, "3": 410.0, "4": 350.0}
// slice tiers: core=['qjv', 'qlv'] depth1=['Ht', 'qJv', 'qkv', 'qKv'] depth2=[]

// --- Ht (depth1, line 2303 in war3map.j) ---
function Ht takes player Dt,integer jt returns group
set et=CreateGroup()
set bj_groupEnumTypeId=jt
call GroupEnumUnitsOfPlayer(et,Dt,filterGetUnitsOfPlayerAndTypeId)
return et
endfunction

// --- qjv (core, line 21120 in war3map.j) ---
function qjv takes nothing returns boolean
return(GetSpellAbilityId()=='A08U')
endfunction

// --- qJv (depth1, line 21123 in war3map.j) ---
function qJv takes nothing returns nothing
call KillUnit(GetEnumUnit())
call RemoveUnit(GetEnumUnit())
endfunction

// --- qkv (depth1, line 21127 in war3map.j) ---
function qkv takes nothing returns nothing
call KillUnit(GetEnumUnit())
call RemoveUnit(GetEnumUnit())
endfunction

// --- qKv (depth1, line 21131 in war3map.j) ---
function qKv takes nothing returns nothing
call KillUnit(GetEnumUnit())
call RemoveUnit(GetEnumUnit())
endfunction

// --- qlv (core, line 21135 in war3map.j) ---
function qlv takes nothing returns nothing
set Zr=((I2R(GetUnitAbilityLevelSwapped(GetSpellAbilityId(),GetTriggerUnit()))*100.)+200.)
set ei=GetSpellTargetLoc()
set oi=-1
set vi=GetTriggerUnit()
call CreateNUnitsAtLoc(1,'o029',GetOwningPlayer(GetTriggerUnit()),ei,bj_UNIT_FACING)
set xi=bj_lastCreatedUnit
call SetUnitScalePercent(bj_lastCreatedUnit,1500.,1500.,1500.)
call TriggerExecute(eM)
call EnableTrigger(eM)
call ForGroupBJ(Ht(GetOwningPlayer(vi),'h02J'),function qJv)
call ForGroupBJ(Ht(GetOwningPlayer(vi),'h02J'),function qkv)
call ForGroupBJ(Ht(GetOwningPlayer(vi),'h02J'),function qKv)
endfunction
