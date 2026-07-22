// rawcode: A0RQ
// hero: godie-hvsh (slot R)  championDoc: content/champions/godie-hvsh.json
// nameZh: 騎英之疆繩
// abilityDoc: content/abilities/godie-hvsh.r.json
// kind: active (spell-effect trigger)
// handler: event=inline-check; called via bNv<-bbv (events: EVENT_PLAYER_UNIT_SPELL_EFFECT) cond=None actions=bAv (trigger var None)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=mzv actions=mZv (trigger var em)
// w3a base: ANcl  levels: None
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 6.0}
// mana: {"1": 230, "2": 330, "3": 430, "4": 5}
// range: {"2": 800.0, "3": 800.0, "4": 1000.0, "1": 800.0}
// area: {"1": 500.0, "2": 500.0, "3": 500.0}
// data[1] per level: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.4000000059604645}
// data[2] per level: {"1": 2, "2": 2, "3": 2, "4": 3}
// data[3] per level: {"1": 7, "2": 7, "3": 7, "4": 5}
// data[4] per level: {"1": 0.0, "2": 0.0, "3": 0.0}
// data[6] per level: {"2": "charm", "3": "charm", "4": "channel", "1": "charm"}
// slice tiers: core=['bAv', 'bbv', 'bNv', 'mzv', 'mZv'] depth1=['Vt'] depth2=[]

// --- Vt (depth1, line 2245 in war3map.j) ---
function Vt takes location Et,real Xt,real Ot returns location
return Location(GetLocationX(Et)+Xt*Cos(Ot*bj_DEGTORAD),GetLocationY(Et)+Xt*Sin(Ot*bj_DEGTORAD))
endfunction

// --- bAv (core, line 12572 in war3map.j) ---
function bAv takes nothing returns boolean
return(GetSpellAbilityId()=='A0RQ')and(QR[(1+GetPlayerId(GetOwningPlayer(GetTriggerUnit())))])
endfunction

// --- bNv (core, line 12575 in war3map.j) ---
function bNv takes nothing returns boolean
return(bAv())or(GetSpellAbilityId()=='A0AP')
endfunction

// --- bbv (core, line 12578 in war3map.j) ---
function bbv takes nothing returns boolean
return(bNv())
endfunction

// --- mzv (core, line 19839 in war3map.j) ---
function mzv takes nothing returns boolean
return(GetSpellAbilityId()=='A0RQ')and(QR[(1+GetPlayerId(GetOwningPlayer(GetTriggerUnit())))]==false)
endfunction

// --- mZv (core, line 19842 in war3map.j) ---
function mZv takes nothing returns nothing
local location m_v
call ShowUnitHide(dR)
set m_v=GetUnitLoc(GetTriggerUnit())
set AR=GetSpellTargetLoc()
set NR=Vt(m_v,800.,(GetUnitFacing(GetTriggerUnit())+180.))
set cR=AngleBetweenPoints(m_v,NR)
set bR=(cR+37.)
call CreateNUnitsAtLoc(1,'h024',GetOwningPlayer(GetTriggerUnit()),m_v,bR)
set fR=bj_lastCreatedUnit
set BR=750.
set CR=100.
call RemoveLocation(m_v)
call EnableTrigger(xm)
endfunction
