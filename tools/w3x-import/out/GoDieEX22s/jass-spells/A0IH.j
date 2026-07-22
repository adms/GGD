// rawcode: A0IH
// hero: godie-n00p (slot E)  championDoc: content/champions/godie-n00p.json
// nameZh: 妖狐變化
// abilityDoc: content/abilities/godie-n00p.e.json
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=dRv actions=dIv (trigger var qk)
// w3a base: AEIl  levels: 4
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0, "4": 60.0}
// mana: {"2": 300, "3": 400, "4": 500, "1": 200}
// duration: {"1": 0.0, "2": 0.0, "3": 0.0, "4": 0.0}
// hero_duration: {"1": 8.0, "2": 12.0, "3": 16.0, "4": 20.0}
// data[1] per level: {"1": "Nsjs", "2": "Nsjs", "3": "Nsjs", "4": "Nsjs"}
// data[5] per level: {"1": 250.0, "2": 350.0, "3": 450.0, "4": 550.0}
// slice tiers: core=['dRv', 'dIv'] depth1=[] depth2=[]

// --- dRv (core, line 14176 in war3map.j) ---
function dRv takes nothing returns boolean
return(GetSpellAbilityId()=='A0IH')
endfunction

// --- dIv (core, line 14179 in war3map.j) ---
function dIv takes nothing returns nothing
set EX=GetTriggerUnit()
call PlaySoundOnUnitBJ(Rd,100.,GetTriggerUnit())
call MoveRectToLoc(YC,GetUnitLoc(GetTriggerUnit()))
set bj_forLoopBIndex=1
set bj_forLoopBIndexEnd=$A
loop
exitwhen bj_forLoopBIndex>bj_forLoopBIndexEnd
call AddSpecialEffectLocBJ(GetRandomLocInRect(YC),"Abilities\\Spells\\Undead\\Unsummon\\UnsummonTarget.mdl")
call DestroyEffect(bj_lastCreatedEffect)
set bj_forLoopBIndex=bj_forLoopBIndex+1
endloop
endfunction
