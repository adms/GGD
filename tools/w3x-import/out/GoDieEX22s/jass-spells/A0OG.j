// rawcode: A0OG
// hero: godie-u010 (slot Q)  championDoc: content/champions/godie-u010.json
// nameZh: 邪王炎殺劍
// abilityDoc: content/abilities/godie-u010.q.json
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=Tcv actions=Tdv (trigger var ZM)
// w3a base: ANcl  levels: None
// cooldown: {"1": 45.0, "2": 45.0, "3": 45.0, "4": 50.0}
// mana: {"1": 85, "2": 115, "3": 145, "4": 275}
// range: {"2": 650.0, "3": 650.0, "4": 9999.0, "1": 650.0}
// data[1] per level: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// data[2] per level: {"1": 2, "2": 2, "3": 2, "4": 2}
// data[3] per level: {"1": 5, "2": 5, "3": 5, "4": 5}
// data[4] per level: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// data[5] per level: {"1": 0, "2": 0, "3": 0, "4": 0}
// data[6] per level: {"1": "coldarrows", "2": "coldarrows", "3": "coldarrows", "4": "coldarrows"}
// slice tiers: core=['Tcv', 'Tdv'] depth1=['TCv'] depth2=[]

// --- Tcv (core, line 22782 in war3map.j) ---
function Tcv takes nothing returns boolean
return(GetSpellAbilityId()=='A0OG')
endfunction

// --- TCv (depth1, line 22785 in war3map.j) ---
function TCv takes nothing returns boolean
return(GetUnitTypeId(GetTriggerUnit())=='U010')
endfunction

// --- Tdv (core, line 22788 in war3map.j) ---
function Tdv takes nothing returns nothing
set yE=0
set zE=GetTriggerUnit()
set YE=GetUnitLoc(GetTriggerUnit())
set ZE=GetUnitLoc(GetTriggerUnit())
set vX=GetUnitFacing(GetTriggerUnit())
if(TCv())then
set oX=I2R((('d'*GetUnitAbilityLevelSwapped(GetSpellAbilityId(),GetTriggerUnit()))+($96+R2I(I2R((GetHeroStatBJ(1,GetTriggerUnit(),true)*3))))))
else
set oX=I2R((('d'*GetUnitAbilityLevelSwapped(GetSpellAbilityId(),GetTriggerUnit()))+($96+R2I(I2R(GetHeroStatBJ(1,GetTriggerUnit(),true))))))
endif
call UnitAddAbility(GetTriggerUnit(),'A0J6')
call GroupClear(xX)
call UnitAddAbility(GetTriggerUnit(),'Avul')
call PlaySoundOnUnitBJ(hd,'d',GetTriggerUnit())
call EnableTrigger(vp)
endfunction
