# GLOSSARY — decoded obfuscated helpers in scripts__war3map.j

Source: `tools/w3x-import/out/GoDieEX22s/raw/scripts__war3map.j` (protected map, single-char/short
obfuscated user-function names; natives and BJ functions keep their real names). Line numbers below
refer to the CR→LF normalized view of the file (same numbering used in slice headers).

## How spells are dispatched

One trigger per spell, registered in a big init function:

```
set XX=CreateTrigger()
call TriggerRegisterAnyUnitEventBJ(XX,EVENT_PLAYER_UNIT_SPELL_EFFECT)   // or _SPELL_CAST
call TriggerAddCondition(XX,Condition(function <cond>))   // cond: GetSpellAbilityId()=='A0XX'
call TriggerAddAction(XX,function <action>)               // action: the spell behavior
```

Passives instead hook `EVENT_PLAYER_UNIT_ATTACKED` / `EVENT_PLAYER_UNIT_DEATH` /
`EVENT_UNIT_DAMAGED` / periodic timers and gate on `GetUnitAbilityLevelSwapped('A0XX',u)>0`,
often with a `GetRandomInt(1,N)<=chance` proc roll.

Level scaling is done inline: `GetUnitAbilityLevelSwapped(rawcode,caster)` multiplied into damage,
plus `GetHeroStatBJ(stat,u,true)` where stat 0=STR, 1=AGI, 2=INT (includes bonuses).
Damage is dealt directly with `UnitDamageTargetBJ(caster,target,amount,ATTACK_TYPE_NORMAL,DAMAGE_TYPE_*)`.

## Geometry / group utilities (GUI "Custom Script" shims)

| name | signature | meaning |
|------|-----------|---------|
| `Vt` | `(location p, real dist, real angleDeg) -> location` | **Polar projection** (PolarProjectionBJ clone). Backbone of every projectile step, cone, ring and knockback offset. |
| `gt` | `(real radius, location p) -> group` | **Units within radius of point** (filter `ot` = always-true `Wt`). New group each call. |
| `Ct` | `(rect r) -> group` | Units in region. |
| `Ht` | `(player pl, integer unitTypeId) -> group` | Player's units of a given unit-type (find hero / find dummies). |
| `ot` / `Wt` | boolexpr / filter func | Group-enum filter; `Wt` just `return true`. |
| `sHv`, `sjv` | `() enum callback` | `KillUnit(GetEnumUnit())` + `RemoveUnit(...)` — group wipe of dummy units. |

## Timing / dummy lifecycle

| name | signature | meaning |
|------|-----------|---------|
| `it` | `(real seconds)` | **Accurate wait** (PolledWait clone on timer `YS`). Used for projectile tick loops, usually 0.03–0.05s. |
| `ZT` + `yT` | `(effect e, real delay)` | **Destroy special effect after delay** (async via `ExecuteFunc("yT")`, args smuggled through `bj_lastCreatedEffect` / `bj_enumDestructableRadius`). |
| `nu` + `xu` | `(unit u, real d1, real d2)` | **Delayed dummy cleanup**: wait `d1`; if `d2<0` remove unit, else kill, wait `d2`, remove. Args smuggled through `bj_lastCreatedUnit` etc. |
| `Ru` | `(string txt, unit u, real size, real life, ...)` | **Floating text tag** above a unit (velocity 75/90deg, fadepoint 1.8). |

Dummy units: `CreateNUnitsAtLoc(1,'hXXX',owner,loc,facing)` then `bj_UNIT_FACING`; result read from
`bj_lastCreatedUnit`; lifetimed with `UnitApplyTimedLifeBJ(t,'BTLF',u)`. Dummy casters are ordered
with `IssueTargetOrderById(dummy, orderId, target)` (`$D0097`-style hex order ids).

## Movement / knockback

There is **no central mover system**. Each moving spell runs its own loop, one of:

1. **Trigger-recursion loop** — action ends with `call TriggerExecute(GetTriggeringTrigger())`
   after `call it(0.05)`; per-iteration state in globals (`Za` etc.), position updated via
   `SetUnitPositionLoc(u, Vt(GetUnitLoc(u), step, angle))`.
2. **`ForLoopBJ`/`loop` with `it(dt)`** inside the action itself.
3. **Periodic triggers** (`TriggerRegisterTimerEventPeriodic`) that scan groups each tick
   (used by the passive slices, e.g. A0ZE heal aura, A116 note-spam).

## Handle-attach system (hashtable "LocalVars")

Global hashtable `kI`, accessor `bT()` → keys are `(GetHandleIdBJ(handle), StringHashBJ(name))`.
Classic GUI handle-vars port:

| save | load | type |
|------|------|------|
| `BT` | `KT` | unit |
| `gT` | `JT` | integer |
| `hT` | `kT` | real |
| `GT` | `jT` | boolean |
| `FT` | `lT` | timer |
| `DT` | `LT` | trigger |
| `fT` | `mT` | triggeraction |

`HT(handle)` flushes a handle's child table (cleanup at spell end). When you see
`call hT(t,"dist",...)` on a timer `t` and later `kT(GetExpiredTimer(),"dist")` inside a timer
callback, that is the projectile/knockback state being carried across ticks.

## Frequently seen globals in spell slices

Spell state is kept in short global names reused per spell block, e.g. `Sa` = casting unit of the
current spell family, `Wa` = target loc, `ya` = computed damage, `wa[]` = dummy array, `Za` = loop
counter. These are per-spell-family, not shared semantics — read them within a slice only.

## Events cheat-sheet for the passive slices

- `EVENT_PLAYER_UNIT_ATTACKED` — on-hit procs (roll `GetRandomInt` vs level*chance).
- `EVENT_PLAYER_UNIT_DEATH` / `GetKillingUnit()` — on-kill rewards (e.g. A08T soul drain stacks).
- `EVENT_UNIT_DAMAGED` — damage-taken procs (e.g. A0ZI dodge/flight).
- `EVENT_PLAYER_HERO_SKILL` (`GetLearnedSkill()=='A0XX'`) — one-time setup when the skill is learned
  (e.g. A0OS morph thresholds, A0FS tech-research sync).
- `TimerEventPeriodic` — auras / recurring pulses (A0ZE, A116).
