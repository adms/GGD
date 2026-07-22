// rawcode: A0D6
// hero: godie-e00v (slot E)  championDoc: tools/w3x-import/out/GoDieEX22s/drafts/champions/godie-e00v.json
// nameZh: 蜜汁
// abilityDoc: tools/w3x-import/out/GoDieEX22s/drafts/champions/godie-e00v.json#abilities.E
// kind: active (spell-effect trigger)
// handler: event=EVENT_PLAYER_UNIT_SPELL_EFFECT cond=x5e actions=x6e (trigger var Yq)
// w3a base: ANmr  levels: 4
// cooldown: {"1": 50.0, "2": 50.0, "3": 50.0, "4": 50.0}
// mana: {"1": 125, "2": 175, "3": 225, "4": 275}
// range: {"1": 350.0, "2": 350.0, "3": 350.0, "4": 350.0}
// duration: {"1": 3.0, "2": 4.0, "3": 5.0, "4": 6.0}
// hero_duration: {"1": 3.0, "2": 4.0, "3": 5.0, "4": 6.0}
// data[1] per level: {"2": 60.0, "3": 60.0, "4": 60.0, "1": 60.0}
// slice tiers: core=['x5e', 'x6e'] depth1=[] depth2=[]

// --- x5e (core, line 26551 in war3map.j) ---
function x5e takes nothing returns boolean
return(GetSpellAbilityId()=='A0D6')
endfunction

// --- x6e (core, line 26554 in war3map.j) ---
function x6e takes nothing returns nothing
set HO=GetUnitLoc(GetTriggerUnit())
set jO=GetUnitLoc(GetSpellTargetUnit())
call CreateNUnitsAtLocFacingLocBJ(1,'hfoo',GetOwningPlayer(GetTriggerUnit()),HO,jO)
set LO=bj_lastCreatedUnit
set hO=GetSpellTargetUnit()
call UnitApplyTimedLifeBJ(.5,'BTLF',LO)
call ShowUnitHide(LO)
call UnitAddAbility(LO,'A0D8')
call SetUnitAbilityLevelSwapped('A0D8',LO,GetUnitAbilityLevelSwapped('A0D6',GetTriggerUnit()))
call IssueTargetOrderById(LO,$D02BC,hO)
call UnitAddAbility(LO,'S005')
call SetUnitAbilityLevelSwapped('S005',LO,GetUnitAbilityLevelSwapped('A0D6',GetTriggerUnit()))
call IssueTargetOrderById(LO,$D00DD,hO)
call KillUnit(LO)
call RemoveUnit(LO)
call CreateTextTagUnitBJ("TRIGSTR_6477",GetTriggerUnit(),50.,12.,100.,100.,100.,.0)
call SetTextTagVelocityBJ(bj_lastCreatedTextTag,70.,90)
call SetTextTagPermanentBJ(bj_lastCreatedTextTag,false)
call SetTextTagLifespanBJ(bj_lastCreatedTextTag,3.)
call SetTextTagFadepointBJ(bj_lastCreatedTextTag,1.)
call RemoveLocation(HO)
call RemoveLocation(jO)
endfunction
