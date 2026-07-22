// rawcode: A0LZ
// hero: godie-n01b (slot R)  championDoc: tools/w3x-import/out/GoDieEX22s/drafts/champions/godie-n01b.json
// nameZh: 地獄搖滾
// abilityDoc: tools/w3x-import/out/GoDieEX22s/drafts/champions/godie-n01b.json#abilities.R
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=pVv actions=pEv (trigger var dm)
// w3a base: ANcl  levels: None
// cooldown: {"1": 60.0, "2": 60.0, "3": 60.0}
// mana: {"1": 250, "2": 375, "3": 500}
// range: {"1": 650.0, "2": 650.0, "3": 650.0}
// area: {"1": 350.0, "2": 350.0, "3": 350.0}
// data[1] per level: {"1": 0.0, "2": 0.0, "3": 0.0}
// data[2] per level: {"1": 2, "2": 2, "3": 2}
// data[3] per level: {"1": 3, "2": 3, "3": 3}
// data[4] per level: {"1": 0.0, "2": 0.0, "3": 0.0}
// data[5] per level: {"1": 0, "2": 0, "3": 0}
// data[6] per level: {"1": "silence", "2": "silence", "3": "silence"}
// slice tiers: core=['pVv', 'pEv'] depth1=[] depth2=[]

// --- pVv (core, line 20318 in war3map.j) ---
function pVv takes nothing returns boolean
return(GetSpellAbilityId()=='A0LZ')
endfunction

// --- pEv (core, line 20321 in war3map.j) ---
function pEv takes nothing returns nothing
set HV=GetTriggerUnit()
set LV=GetSpellTargetLoc()
set jV=AngleBetweenPoints(GetUnitLoc(HV),LV)
set kV=DistanceBetweenPoints(GetUnitLoc(HV),LV)
set lV=.0
set kV=(kV/ 41.)
set PV=GetUnitFacing(GetTriggerUnit())
set TE=GetUnitAbilityLevelSwapped(GetSpellAbilityId(),GetTriggerUnit())
set MV=I2R((((GetUnitAbilityLevelSwapped('A0LZ',GetTriggerUnit())*$C8)+350)+(3*GetHeroStatBJ(0,GetTriggerUnit(),true))))
call PauseUnit(HV,true)
call PlaySoundOnUnitBJ(af,100.,HV)
call TriggerSleepAction(.3)
call UnitAddAbility(HV,'A0FZ')
call UnitAddAbility(HV,'Avul')
call SetUnitPathing(HV,false)
call SetUnitAnimation(HV,"attack slam")
call SetUnitTimeScalePercent(HV,40.)
call EnableTrigger(Dm)
endfunction
