// rawcode: A0UB
// hero: godie-e00w (slot R)  championDoc: content/champions/godie-e00w.json
// nameZh: 真-雷光劍
// abilityDoc: content/abilities/godie-e00w.r.json
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=vZe actions=v_e (trigger var cq)
// w3a base: ANcl  levels: None
// cooldown: {"1": 70.0, "2": 70.0, "3": 70.0, "4": 1.0}
// mana: {"1": 150, "2": 225, "3": 300, "4": 1}
// range: {"3": 600.0, "2": 600.0, "4": 600.0, "1": 600.0}
// data[1] per level: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// data[2] per level: {"1": 3, "3": 3, "2": 3, "4": 3}
// data[3] per level: {"1": 1, "2": 1, "3": 1, "4": 1}
// data[4] per level: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// data[5] per level: {"1": 0, "3": 0, "2": 0, "4": 0}
// data[6] per level: {"1": "shockwave", "2": "shockwave", "3": "shockwave", "4": "shockwave"}
// slice tiers: core=['vZe', 'v_e'] depth1=['Vt', 'BT', 'gT', 'hT'] depth2=['bT']

// --- Vt (depth1, line 2245 in war3map.j) ---
function Vt takes location Et,real Xt,real Ot returns location
return Location(GetLocationX(Et)+Xt*Cos(Ot*bj_DEGTORAD),GetLocationY(Et)+Xt*Sin(Ot*bj_DEGTORAD))
endfunction

// --- bT (depth2, line 2879 in war3map.j) ---
function bT takes nothing returns hashtable
return kI
endfunction

// --- BT (depth1, line 2882 in war3map.j) ---
function BT takes handle cT,string CT,unit dT returns nothing
call SaveUnitHandle(bT(),GetHandleIdBJ(cT),StringHashBJ(CT),dT)
endfunction

// --- gT (depth1, line 2894 in war3map.j) ---
function gT takes handle cT,string CT,integer dT returns nothing
call SaveInteger(bT(),GetHandleIdBJ(cT),StringHashBJ(CT),dT)
endfunction

// --- hT (depth1, line 2900 in war3map.j) ---
function hT takes handle cT,string CT,real dT returns nothing
call SaveReal(bT(),GetHandleIdBJ(cT),StringHashBJ(CT),dT)
endfunction

// --- vZe (core, line 25775 in war3map.j) ---
function vZe takes nothing returns boolean
return(GetSpellAbilityId()=='A0UB')
endfunction

// --- v_e (core, line 25778 in war3map.j) ---
function v_e takes nothing returns nothing
local unit pyv=GetTriggerUnit()
local location P1=GetUnitLoc(GetTriggerUnit())
local location P2=GetSpellTargetLoc()
local location P3
local real v0e=AngleBetweenPoints(P1,P2)
set P3=Vt(P1,200.,v0e)
call CreateNUnitsAtLoc(1,'o02U',GetOwningPlayer(pyv),P3,bj_UNIT_FACING)
set MA=bj_lastCreatedUnit
call BT(MA,"Caster",pyv)
call gT(MA,"Index",0)
call hT(MA,"Angle",v0e)
call RemoveLocation(P1)
call RemoveLocation(P2)
call RemoveLocation(P3)
call EnableTrigger(Cq)
endfunction
