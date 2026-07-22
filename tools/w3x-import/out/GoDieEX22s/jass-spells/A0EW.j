// rawcode: A0EW
// hero: godie-h00w (slot R)  championDoc: tools/w3x-import/out/GoDieEX22s/drafts/champions/godie-h00w.json
// nameZh: 開天闢地‧洨者聖臨
// abilityDoc: tools/w3x-import/out/GoDieEX22s/drafts/champions/godie-h00w.json#abilities.R
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_CAST cond=mFv actions=mgv (trigger var WL)
// w3a base: AEIl  levels: 3
// cooldown: {"2": 75.0, "3": 75.0, "1": 75.0}
// mana: {"1": 140, "2": 210, "3": 280}
// duration: {"1": 0.0, "2": 0.0, "3": 0.0}
// hero_duration: {"1": 7.0, "2": 10.5, "3": 14.0}
// data[1] per level: {"1": "Harf", "2": "Harf", "3": "Harf"}
// data[5] per level: {"1": 0.0, "2": 0.0, "3": 0.0}
// slice tiers: core=['mFv', 'mgv'] depth1=['ZT'] depth2=['yT']

// --- yT (depth2, line 3030 in war3map.j) ---
function yT takes nothing returns nothing
local effect YT=bj_lastCreatedEffect
local real zT=bj_enumDestructableRadius
call it(zT)
call DestroyEffect(YT)
endfunction

// --- ZT (depth1, line 3036 in war3map.j) ---
function ZT takes effect YT,real vu returns nothing
local real eu=bj_enumDestructableRadius
set bj_lastCreatedEffect=YT
set bj_enumDestructableRadius=vu
call ExecuteFunc("yT")
set bj_enumDestructableRadius=eu
endfunction

// --- mFv (core, line 19724 in war3map.j) ---
function mFv takes nothing returns boolean
return(GetSpellAbilityId()=='A0EW')
endfunction

// --- mgv (core, line 19727 in war3map.j) ---
function mgv takes nothing returns nothing
call AddSpecialEffectTargetUnitBJ("origin",GetTriggerUnit(),"Abilities\\Spells\\NightElf\\Starfall\\StarfallCaster.mdl")
call ZT(bj_lastCreatedEffect,3.+3.*I2R(GetUnitAbilityLevelSwapped('A0EW',GetTriggerUnit())))
endfunction
