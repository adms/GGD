// rawcode: A0BO
// hero: godie-h00l (slot Q)  championDoc: content/champions/godie-h00l.json
// nameZh: 科奇利族的迴旋鏢
// abilityDoc: content/abilities/godie-h00l.q.json
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=wYv actions=w0v (trigger var tp)
// w3a base: ANcl  levels: None
// cooldown: {"1": 15.0, "2": 15.0, "3": 15.0, "4": 15.0, "5": 7.0}
// mana: {"1": 50, "2": 85, "3": 120, "4": 155, "5": 75}
// data[1] per level: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0, "5": 0.0}
// data[2] per level: {"1": 3, "2": 3, "3": 3, "4": 3, "5": 3}
// data[3] per level: {"1": 5, "2": 5, "3": 5, "4": 5, "5": 5}
// data[5] per level: {"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}
// data[6] per level: {"1": "coldarrows", "2": "coldarrows", "3": "coldarrows", "4": "coldarrows", "5": "coldarrows"}
// slice tiers: core=['wYv', 'w0v'] depth1=['Vt', 'Ht', 'wzv', 'wZv', 'w_v'] depth2=[]

// --- Vt (depth1, line 2245 in war3map.j) ---
function Vt takes location Et,real Xt,real Ot returns location
return Location(GetLocationX(Et)+Xt*Cos(Ot*bj_DEGTORAD),GetLocationY(Et)+Xt*Sin(Ot*bj_DEGTORAD))
endfunction

// --- Ht (depth1, line 2303 in war3map.j) ---
function Ht takes player Dt,integer jt returns group
set et=CreateGroup()
set bj_groupEnumTypeId=jt
call GroupEnumUnitsOfPlayer(et,Dt,filterGetUnitsOfPlayerAndTypeId)
return et
endfunction

// --- wYv (core, line 23891 in war3map.j) ---
function wYv takes nothing returns boolean
return(GetSpellAbilityId()=='A0BO')
endfunction

// --- wzv (depth1, line 23894 in war3map.j) ---
function wzv takes nothing returns nothing
call KillUnit(GetEnumUnit())
call RemoveUnit(GetEnumUnit())
endfunction

// --- wZv (depth1, line 23898 in war3map.j) ---
function wZv takes nothing returns nothing
call KillUnit(GetEnumUnit())
call RemoveUnit(GetEnumUnit())
endfunction

// --- w_v (depth1, line 23902 in war3map.j) ---
function w_v takes nothing returns nothing
call KillUnit(GetEnumUnit())
call RemoveUnit(GetEnumUnit())
endfunction

// --- w0v (core, line 23906 in war3map.j) ---
function w0v takes nothing returns nothing
call PlaySoundOnUnitBJ(Qf,100.,GetTriggerUnit())
set Ox=GetTriggerUnit()
set Rx=(50.+(100.*I2R(GetUnitAbilityLevelSwapped('A0BO',GetTriggerUnit()))))
set Ix=GetSpellTargetLoc()
set Ax=GetUnitLoc(GetTriggerUnit())
set Fx=Vt(Ax,SquareRoot((Pow(500.,2.)+Pow(250.,2.))),(AngleBetweenPoints(Ax,Ix)+(.0-AcosBJ((500./ SquareRoot((Pow(500.,2.)+Pow(250.,2.))))))))
call CreateNUnitsAtLoc(1,'h00P',GetOwningPlayer(GetTriggerUnit()),Ax,bj_UNIT_FACING)
set bx=bj_lastCreatedUnit
set Nx=(AngleBetweenPoints(Ax,Ix)+.0)
call RemoveLocation(Ix)
call RemoveLocation(Ax)
set Bx=150.
set cx=.0
call PlaySoundOnUnitBJ(md,100.,GetTriggerUnit())
call EnableTrigger(Tp)
call ForGroupBJ(Ht(GetOwningPlayer(QX),'hfoo'),function wzv)
call ForGroupBJ(Ht(GetOwningPlayer(QX),'hfoo'),function wZv)
call ForGroupBJ(Ht(GetOwningPlayer(QX),'hfoo'),function w_v)
endfunction
