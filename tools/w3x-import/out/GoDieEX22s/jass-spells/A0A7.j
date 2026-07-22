// rawcode: A0A7
// hero: godie-ecen (slot W)  championDoc: content/champions/godie-ecen.json
// nameZh: 酒釀精華
// abilityDoc: content/abilities/godie-ecen.w.json
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=WZv actions=W3v (trigger var oP)
// w3a base: ANcl  levels: 4
// cooldown: {"1": 50.0, "2": 50.0, "3": 50.0, "4": 50.0}
// mana: {"1": 60, "2": 80, "3": 100, "4": 120}
// range: {"5": 350.0, "1": 400.0, "2": 400.0, "3": 400.0, "4": 400.0}
// data[1] per level: {"1": 4.010000228881836, "2": 4.010000228881836, "3": 4.010000228881836, "4": 4.010000228881836}
// data[2] per level: {"1": 1, "2": 1, "3": 1, "4": 1}
// data[3] per level: {"1": 25, "2": 25, "3": 25, "4": 25}
// data[4] per level: {"1": 1.0099999904632568, "2": 1.0099999904632568, "3": 1.0099999904632568, "4": 1.0099999904632568}
// data[5] per level: {"1": 0, "2": 0, "3": 0, "4": 0}
// data[6] per level: {"2": "channel", "3": "channel", "4": "channel"}
// slice tiers: core=['WZv', 'W3v'] depth1=['W0v', 'W1v', 'W2v'] depth2=['W_v']

// --- WZv (core, line 24163 in war3map.j) ---
function WZv takes nothing returns boolean
return(GetSpellAbilityId()=='A0A7')
endfunction

// --- W_v (depth2, line 24166 in war3map.j) ---
function W_v takes nothing returns boolean
return(UnitHasBuffBJ(Hv,'B00I')==false)and(UnitHasBuffBJ(Hv,'B05A')==false)
endfunction

// --- W0v (depth1, line 24169 in war3map.j) ---
function W0v takes nothing returns boolean
return(IsUnitAlly(jv,GetOwningPlayer(Hv))==false)
endfunction

// --- W1v (depth1, line 24172 in war3map.j) ---
function W1v takes nothing returns boolean
return(IsUnitAlly(jv,GetOwningPlayer(Hv))==false)
endfunction

// --- W2v (depth1, line 24175 in war3map.j) ---
function W2v takes nothing returns boolean
return(W_v())
endfunction

// --- W3v (core, line 24178 in war3map.j) ---
function W3v takes nothing returns nothing
set Hv=GetTriggerUnit()
set jv=GetSpellTargetUnit()
set Jv=GetUnitAbilityLevelSwapped('A0A7',Hv)
if(W2v())then
if(W1v())then
call UnitDamageTargetBJ(Hv,jv,((I2R(Jv)*40.)+28.),ATTACK_TYPE_NORMAL,DAMAGE_TYPE_MAGIC)
else
call SetWidgetLife(jv,(GetUnitStateSwap(UNIT_STATE_LIFE,jv)+((I2R(Jv)*40.)+28.)))
call SetUnitManaBJ(jv,(GetUnitStateSwap(UNIT_STATE_MANA,jv)+((I2R(Jv)*40.)+28.)))
endif
else
if(W0v())then
call UnitDamageTargetBJ(Hv,jv,((I2R(Jv)*40.)+(28.+I2R(GetHeroStatBJ(2,Hv,true)))),ATTACK_TYPE_NORMAL,DAMAGE_TYPE_MAGIC)
else
call SetWidgetLife(jv,(GetUnitStateSwap(UNIT_STATE_LIFE,jv)+((I2R(Jv)*40.)+(28.+I2R(GetHeroStatBJ(2,Hv,true))))))
call SetUnitManaBJ(jv,(GetUnitStateSwap(UNIT_STATE_MANA,jv)+((I2R(Jv)*40.)+(28.+I2R(GetHeroStatBJ(2,Hv,true))))))
endif
endif
call StartTimerBJ(kv,true,1.)
endfunction
