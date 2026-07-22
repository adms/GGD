// rawcode: A03A
// hero: godie-naka (slot Q)  championDoc: content/champions/godie-naka.json
// nameZh: 忍法風魔手裡劍
// abilityDoc: content/abilities/godie-naka.q.json
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=Qnv actions=QVv (trigger var VM)
// w3a base: ANcl  levels: 4
// cooldown: {"1": 45.0, "2": 45.0, "3": 45.0, "4": 45.0, "5": 7.0}
// mana: {"1": 45, "2": 75, "3": 105, "4": 135, "5": 75}
// data[1] per level: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0, "5": 0.0}
// data[2] per level: {"1": 3, "2": 3, "3": 3, "4": 3, "5": 3}
// data[3] per level: {"1": 5, "2": 5, "3": 5, "4": 5, "5": 5}
// data[5] per level: {"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}
// data[6] per level: {"1": "coldarrows", "2": "coldarrows", "3": "coldarrows", "4": "coldarrows", "5": "coldarrows"}
// slice tiers: core=['Qnv', 'QVv'] depth1=['Vt'] depth2=[]

// --- Vt (depth1, line 2245 in war3map.j) ---
function Vt takes location Et,real Xt,real Ot returns location
return Location(GetLocationX(Et)+Xt*Cos(Ot*bj_DEGTORAD),GetLocationY(Et)+Xt*Sin(Ot*bj_DEGTORAD))
endfunction

// --- Qnv (core, line 21321 in war3map.j) ---
function Qnv takes nothing returns boolean
return(GetSpellAbilityId()=='A03A')
endfunction

// --- QVv (core, line 21324 in war3map.j) ---
function QVv takes nothing returns nothing
set Iv=GetTriggerUnit()
set Rv=(50.+(50.*I2R(GetUnitAbilityLevelSwapped('A03A',GetTriggerUnit()))))
set z=GetSpellTargetLoc()
set Z=GetUnitLoc(GetTriggerUnit())
set Y=Vt(Z,SquareRoot((Pow(500.,2.)+Pow(250.,2.))),(AngleBetweenPoints(Z,z)+(45.-AcosBJ((500./ SquareRoot((Pow(500.,2.)+Pow(250.,2.))))))))
set y=Vt(Z,SquareRoot((Pow(500.,2.)+Pow(250.,2.))),(AngleBetweenPoints(Z,z)-(45.-AcosBJ((500./ SquareRoot((Pow(500.,2.)+Pow(250.,2.))))))))
call CreateNUnitsAtLoc(1,'h009',GetOwningPlayer(GetTriggerUnit()),Z,bj_UNIT_FACING)
set vv=bj_lastCreatedUnit
call CreateNUnitsAtLoc(1,'h009',GetOwningPlayer(GetTriggerUnit()),Z,bj_UNIT_FACING)
set ev=bj_lastCreatedUnit
set xv=(AngleBetweenPoints(Z,z)-45.)
set ov=(AngleBetweenPoints(Z,z)+45.)
call RemoveLocation(z)
call RemoveLocation(Z)
set iv=500.
set rv=.0
call EnableTrigger(EM)
endfunction
