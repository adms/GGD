// rawcode: A0HK
// hero: godie-u00k (slot R)  championDoc: tools/w3x-import/out/GoDieEX22s/drafts/champions/godie-u00k.json
// nameZh: 萬惡歸宗
// abilityDoc: tools/w3x-import/out/GoDieEX22s/drafts/champions/godie-u00k.json#abilities.R
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=zkv actions=zMv (trigger var MP)
// w3a base: AEsb  levels: 5
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 60.0, "5": 60.0}
// mana: {"3": 350, "1": 150, "2": 250, "4": 450, "5": 550}
// area: {"1": 600.0, "2": 600.0, "3": 600.0, "4": 600.0, "5": 600.0}
// duration: {"1": 2.0, "2": 2.0, "3": 2.0, "4": 2.0, "5": 2.0}
// hero_duration: {"1": 2.0, "2": 2.0, "3": 2.0, "4": 2.0, "5": 2.0}
// data[1] per level: {"2": 1.0, "3": 1.0, "1": 1.0, "4": 1.0, "5": 1.0}
// data[3] per level: {"1": 0.0}
// slice tiers: core=['zkv', 'zMv'] depth1=['gt', 'zlv', 'zmv'] depth2=['zKv', 'zLv']

// --- gt (depth1, line 2287 in war3map.j) ---
function gt takes real At,location Ft returns group
set et=CreateGroup()
call GroupEnumUnitsInRangeOfLoc(et,Ft,At,ot)
return et
endfunction

// --- zkv (core, line 25030 in war3map.j) ---
function zkv takes nothing returns boolean
return(GetSpellAbilityId()=='A0HK')
endfunction

// --- zKv (depth2, line 25033 in war3map.j) ---
function zKv takes nothing returns boolean
return((IsPlayerEnemy(GetOwningPlayer(GetEnumUnit()),GetOwningPlayer(GetTriggerUnit())))and(IsUnitType(GetEnumUnit(),UNIT_TYPE_STRUCTURE)!=true)and(GetUnitTypeId(GetEnumUnit())!='Udea'))!=null
endfunction

// --- zlv (depth1, line 25036 in war3map.j) ---
function zlv takes nothing returns nothing
set po=(po+GetUnitStateSwap(UNIT_STATE_MANA,GetEnumUnit()))
call SetUnitManaPercentBJ(GetEnumUnit(),.0)
call AddSpecialEffectTargetUnitBJ("chest",GetEnumUnit(),"Abilities\\Spells\\Human\\Thunderclap\\ThunderClapCaster.mdl")
call DestroyEffect(bj_lastCreatedEffect)
if(zKv())then
call GroupAddUnit(Po,GetEnumUnit())
endif
endfunction

// --- zLv (depth2, line 25045 in war3map.j) ---
function zLv takes nothing returns boolean
return(Lo==false)
endfunction

// --- zmv (depth1, line 25048 in war3map.j) ---
function zmv takes nothing returns nothing
call SetUnitAnimationWithRarity(GetEnumUnit(),"Death",RARITY_FREQUENT)
if(zLv())then
call UnitDamageTargetBJ(mo,GetEnumUnit(),((po+500.)*(I2R(GetUnitAbilityLevelSwapped('A0HK',GetTriggerUnit()))*.15)),ATTACK_TYPE_NORMAL,DAMAGE_TYPE_MAGIC)
else
call UnitDamageTargetBJ(mo,GetEnumUnit(),((po+.0)*(I2R(GetUnitAbilityLevelSwapped('A0HK',GetTriggerUnit()))*.15)),ATTACK_TYPE_NORMAL,DAMAGE_TYPE_MAGIC)
endif
call PlaySoundOnUnitBJ(Gf,'d',GetEnumUnit())
call AddSpecialEffectTargetUnitBJ("chest",GetEnumUnit(),"Objects\\Spawnmodels\\Undead\\UndeadDissipate\\UndeadDissipate.mdl")
call DestroyEffect(bj_lastCreatedEffect)
call AddSpecialEffectTargetUnitBJ("chest",GetEnumUnit(),"Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl")
call DestroyEffect(bj_lastCreatedEffect)
endfunction

// --- zMv (core, line 25061 in war3map.j) ---
function zMv takes nothing returns nothing
set mo=GetTriggerUnit()
set po=.0
call GroupClear(Po)
call ForGroupBJ(gt(600.,GetUnitLoc(GetTriggerUnit())),function zlv)
call TriggerSleepAction(1.)
call ForGroupBJ(Po,function zmv)
endfunction
