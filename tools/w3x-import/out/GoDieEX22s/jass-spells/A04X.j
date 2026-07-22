// rawcode: A04X
// hero: godie-e007 (slot R)  championDoc: content/champions/godie-e007.json
// nameZh: 龍氣爆發
// abilityDoc: content/abilities/godie-e007.r.json
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=DZv actions=D_v (trigger var aK)
// w3a base: ANcl  levels: None
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 18.0}
// mana: {"1": 215, "2": 280, "3": 345, "4": 180}
// range: {"5": 350.0}
// duration: {"1": 3.0, "2": 3.0, "3": 3.0}
// hero_duration: {"1": 3.0, "2": 3.0, "3": 3.0}
// data[1] per level: {"1": 4.010000228881836, "2": 4.010000228881836, "3": 4.010000228881836, "4": 4.010000228881836}
// data[2] per level: {"4": 1, "1": 3, "2": 3, "3": 3}
// data[3] per level: {"1": 25, "2": 25, "3": 25, "4": 25}
// data[4] per level: {"1": 3.0, "2": 3.0, "3": 3.0, "4": 1.0099999904632568}
// data[5] per level: {"1": 0, "2": 0, "3": 0, "4": 0}
// data[6] per level: {"2": "channel", "3": "channel", "4": "channel"}
// slice tiers: core=['DZv', 'D_v'] depth1=['Vt'] depth2=[]

// --- Vt (depth1, line 2245 in war3map.j) ---
function Vt takes location Et,real Xt,real Ot returns location
return Location(GetLocationX(Et)+Xt*Cos(Ot*bj_DEGTORAD),GetLocationY(Et)+Xt*Sin(Ot*bj_DEGTORAD))
endfunction

// --- DZv (core, line 14874 in war3map.j) ---
function DZv takes nothing returns boolean
return(GetSpellAbilityId()=='A04X')
endfunction

// --- D_v (core, line 14877 in war3map.j) ---
function D_v takes nothing returns nothing
call DisableTrigger(GetTriggeringTrigger())
set Ir=GetTriggerUnit()
set fr=GetUnitFacing(Ir)
set Br=GetUnitLoc(GetTriggerUnit())
set Ar=(350.+I2R((300*GetUnitAbilityLevelSwapped('A04X',Ir))))
set AE=I2R(GetHeroStatBJ(1,GetTriggerUnit(),true))
set cr=0
set Dr=0
call GroupClear(dr)
call CreateNUnitsAtLoc(1,'h000',GetOwningPlayer(Ir),Vt(Br,125.,GetUnitFacing(Ir)),bj_UNIT_FACING)
call UnitApplyTimedLifeBJ(6.,'BTLF',bj_lastCreatedUnit)
call RemoveLocation(Br)
set Nr=bj_lastCreatedUnit
set Br=GetUnitLoc(Nr)
call StartTimerBJ(br,true,1.)
endfunction
