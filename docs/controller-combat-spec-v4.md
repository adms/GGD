# Controller Combat System — Claude Code Implementation Spec

> **來源**：owner 2026-08-28 提供的「手把操作 v4」設計。
> ⛔ 這一份是**設計來源**，不是產物 —— 手改它等於改需求。
> 落地進度看 GH issue；本文件維持 owner 交付時的原樣。

## 0. Task

Implement a controller-first combat system for the existing game.

Tech stack:

* Web
* TypeScript
* Babylon.js
* Browser Gamepad API

Game design:

* 3v3v3 PvP
* Roguelite progression
* Large numbers of zombies continuously enter the arena
* Zombie bosses also enter the arena
* Dozens of zombies may exist on screen simultaneously
* Hundreds of zombies may be fought in one match
* Players must farm zombies for EXP or they will fall behind other teams
* Each hero has six active abilities:

  * Innate
  * Q
  * W
  * E
  * R
  * EX
* Items generally do NOT contain active abilities
* No RTS multi-unit control

The controller must support three very different combat styles:

1. Ranged basic-attack / marksman kiting
2. Mage / ability-based kiting
3. Melee characters that need to close small gaps to attack

The system must reduce repetitive PvE input without taking control away from the player during PvP.

---

# 1. Core Design Philosophy

The system has four core layers:

```text
1. AUTO FARM
   Automatically clears nearby PvE enemies.

2. MANUAL OVERRIDE
   Player combat input immediately overrides Auto Farm.

3. PVP FOCUS
   Holding LT removes zombies from hostile target selection.

4. MOVEMENT AUTHORITY
   Player movement always has priority over movement assistance.
```

The most important priority rule is:

```text
PLAYER EXPLICIT INTENT
        >
PVP TARGETING INTENT
        >
AUTO FARM
```

And:

```text
Auto Targeting can be aggressive.

Auto Movement must be conservative.
```

Never implement:

```text
controller
→ fake mouse
→ fake keyboard/mouse input
```

Instead:

```text
Gamepad
→ semantic input
→ combat controller
→ gameplay commands
→ existing gameplay simulation
```

---

# 2. Simplified Controller Layout

Use Xbox-style naming conceptually.

```text
LEFT STICK
Movement

RIGHT STICK
Aim / combat direction

RT
Manual Basic Attack Intent

LT
PvP Focus
Only hostile PLAYER targets are considered

A
Q

X
W

Y
E

B
R

LB
Innate

RB
EX

R3
Reserved

L3
Reserved

D-Pad
Roguelite / upgrades / ping / UI

Camera
Automatic hero follow
```

There are NO ability modifier layers.

There are exactly six direct ability buttons:

```text
LB       Innate

       Y / E

X / W         B / R

       A / Q

RB       EX
```

Do not put R or EX behind button combinations.

---

# 3. Controller Mental Model

The player should only need to understand:

```text
LS
Where do I move?

RS
Where do I want to fight?

RT
I explicitly want to basic attack.

LT
Ignore zombies. I want players.

Ability button
I want to use this ability.

No combat input for a short period
The game goes back to automatically farming zombies.
```

---

# 4. Auto Farm Is Required

Auto Farm is a core gameplay feature, NOT optional accessibility sugar.

Reason:

The player may fight hundreds of zombies per match.

Requiring:

```text
select zombie
attack
select zombie
attack
select zombie
attack
...
```

would create excessive input fatigue.

Auto Farm should automatically:

```text
find nearby PvE target
↓
basic attack when legal
↓
target dies
↓
immediately find next PvE target
↓
continue
```

Skills must NEVER be automatically cast.

Only basic attacks may be automated.

---

# 5. Auto Farm Activation

Maintain:

```ts
lastExplicitCombatInputAt: number;
```

Auto Farm becomes active after:

```ts
AUTO_FARM_DELAY_MS
```

without explicit combat input.

Initial tuning value:

```ts
AUTO_FARM_DELAY_MS = 600;
```

Make this configurable.

Recommended tuning range:

```text
500–800 ms
```

IMPORTANT:

Movement is NOT combat input.

The player must be able to continuously move with LS while Auto Farm remains active.

Wrong:

```ts
if (noControllerInputFor600ms) {
  enableAutoFarm();
}
```

Correct concept:

```ts
if (timeSinceExplicitCombatInput >= AUTO_FARM_DELAY_MS) {
  enableAutoFarm();
}
```

---

# 6. What Counts As Explicit Combat Input

These reset the Auto Farm timer:

```text
RS enters meaningful aim input
RT manual attack intent
LT PvP Focus
Innate
Q
W
E
R
EX
```

These do NOT reset the Auto Farm timer:

```text
LS movement
camera follow
normal camera updates
non-combat animation
```

UI/modal interaction may suspend combat separately according to the game's existing UI rules.

---

# 7. Auto Farm Does NOT Pause Between Zombies

The delay only controls:

```text
MANUAL → AUTO FARM
```

It does NOT run for every target.

Wrong:

```text
Zombie A dies
wait 600 ms

Zombie B dies
wait 600 ms

Zombie C...
```

Correct:

```text
Auto Farm active

Zombie A dies
→ immediately resolve Zombie B

Zombie B dies
→ immediately resolve Zombie C
```

---

# 8. Auto Farm Target Rules

Auto Farm candidates:

```text
Regular Zombie       YES
Zombie Boss          YES
Enemy Player         NO
Ally                  NO
```

Auto Farm must NEVER spontaneously attack another player.

This is a hard rule.

PvP must always originate from explicit player intent.

Therefore:

```text
AUTO FARM = PvE only
```

---

# 9. Target Sources

Do not implement separate Soft Target and Hard Target systems.

Use one current target with a source.

```ts
type TargetSource =
  | "auto-farm"
  | "manual"
  | "pvp-focus";

interface CombatTarget {
  entityId: EntityId;
  source: TargetSource;
}
```

Priority:

```text
PVP Focus / explicit manual targeting
        >
manual combat targeting
        >
Auto Farm
```

Switching between different target sources must happen immediately.

There is NO stickiness between:

```text
auto-farm → manual

auto-farm → pvp-focus
```

If the player expresses manual intent, Auto Farm loses immediately.

---

# 10. Manual Override

If Auto Farm is attacking:

```text
Zombie A
```

and the player moves RS toward another target:

```text
same frame:

Auto target discarded
→ Manual targeting begins
```

Likewise:

```text
LT pressed
→ PvP Focus takes priority immediately
```

Do not wait for:

* current attack animation
* Auto Farm timer
* target retention timer

Gameplay animation/cancel rules remain the responsibility of the combat system, but the targeting decision itself changes immediately.

---

# 11. PvP Focus

Hold:

```text
LT
```

to activate:

```text
PVP FOCUS
```

Meaning:

> When resolving a hostile unit target, only enemy players are legal candidates.

Candidates become:

```text
Enemy Player     YES

Zombie           NO
Zombie Boss      NO
```

This solves the primary 3v3v3 + zombie targeting problem.

Example:

```text
Zombie Zombie Zombie Zombie

        Enemy Player

Zombie      YOU       Zombie
```

Normal Auto Farm:

```text
→ Zombies
```

Player presses:

```text
LT
```

Immediately:

```text
→ Zombies removed from hostile target resolver
→ Enemy players only
```

---

# 12. PvP Focus Does Not Mean Auto Attack

LT only changes target filtering.

This:

```text
Hold LT
```

does NOT automatically attack players.

To basic attack a player:

```text
LT + RT
```

To use a hostile Unit Target skill against players:

```text
LT + Ability
```

Directional / Ground skills continue to use RS normally.

---

# 13. LT Scope

PvP Focus affects only hostile unit-target resolution.

Examples:

## Basic Attack

```text
LT + RT
→ Enemy players only
```

## Hostile Unit Target Q

```text
LT + Q
→ Enemy players only
```

## Friendly Heal

```text
LT
→ ignored
```

## Directional Skillshot

```text
LT
→ ignored
```

## Ground AoE

```text
LT
→ ignored
```

Do not make LT a giant global controller mode.

Its meaning is exactly:

```text
HOSTILE PLAYER TARGETS ONLY
```

---

# 14. Right Stick

RS expresses:

```text
combat direction
```

not camera movement.

Camera follows the hero automatically.

Meaningful RS input:

```text
magnitude > aimDeadzone
```

switches targeting to:

```text
manual
```

and resets:

```text
lastExplicitCombatInputAt
```

---

# 15. Manual Target Resolver

When the player is manually aiming at hostile units:

```text
score =
  direction * 0.75
  + distance * 0.15
  + stickiness * 0.10
```

These are initial tuning values.

Make them configurable.

Direction must dominate.

A closer zombie should not steal the target if the player is clearly pointing toward a farther target.

---

# 16. Do Not Use Huge Player Priority Bonuses

Avoid logic such as:

```text
Player +100
Boss +50
Zombie +10
```

during manual directional aiming.

That creates unwanted aim magnetism.

Instead:

```text
RS = WHERE
LT = WHO
```

If the player wants to guarantee targeting enemy players:

```text
Hold LT
```

This is much more predictable.

---

# 17. Target Stickiness

Keep target stickiness.

It is necessary because many enemies may overlap visually.

Example:

```text
Current target score = 0.72
New target score     = 0.77
Switch threshold     = 0.10

→ keep current target
```

Only switch if:

```ts
newScore > currentScore + switchThreshold
```

Initial:

```ts
switchThreshold = 0.10;
```

Stickiness is only valid inside the same source/context.

Example:

```text
manual Player A
vs
manual Player B

→ stickiness allowed
```

But:

```text
auto-farm Zombie
→ LT pressed
→ Player

must switch immediately
```

---

# 18. Auto Farm Resolver

Auto Farm should use a different scoring policy than manual aiming.

There is no strong aim direction during Auto Farm.

Its goal is:

> Efficiently continue fighting reasonable nearby PvE targets.

Recommended priority:

```text
1. Can currently attack
2. Distance
3. Existing target stickiness
```

Example conceptual scoring:

```ts
score =
    attackableNowBonus
  + distanceScore * 0.70
  + stickiness * 0.30;
```

Do not over-engineer threat scoring in the first implementation.

---

# 19. Boss Targeting

Zombie Boss counts as:

```text
PvE
```

Auto Farm may attack the boss if it is inside legal attack conditions.

However:

Do not give Boss a giant priority multiplier.

For manual aiming, if Boss needs to feel easier to point at, give it a larger targeting tolerance / targeting radius.

Example concept:

```ts
aimAssistRadius:
regularZombie = normal
player = normal
boss = larger
```

This makes the boss easier to intentionally point toward without forcing target priority.

---

# 20. Basic Attack Behavior

There are TWO sources of basic attacks:

```text
AUTO FARM BASIC ATTACK
MANUAL BASIC ATTACK
```

---

# 21. Auto Farm Basic Attack

When Auto Farm is active:

```text
resolve PvE target
↓
if attack is legal
↓
basic attack according to hero attack speed
```

The player does not need to repeatedly press RT.

This is essential for avoiding farming fatigue.

---

# 22. Manual Basic Attack

RT means:

```text
explicit manual basic attack intent
```

Recommended:

```text
Hold RT
→ continue attacking manually selected target
```

This is especially useful in PvP.

Example marksman:

```text
LS ←
RS →
RT held
```

Meaning:

```text
kite left
aim right
continuously basic attack
```

---

# 23. Auto Targeting Must Never Control Movement By Default

TargetResolver is allowed to answer:

```text
Who should I attack?
```

TargetResolver is NOT allowed to answer:

```text
Where should the hero walk?
```

Hard architectural rule:

```ts
// TargetResolver may select targets.
// TargetResolver MUST NOT emit movement commands.
```

---

# 24. Movement Authority

Player movement has absolute priority.

```text
LS magnitude > movementDeadzone
→ player owns movement
```

No automatic movement system may fight against LS.

If LS is active:

```text
Auto Approach = disabled immediately
```

Same frame.

---

# 25. Ranged Characters

Ranged basic attack profile:

```text
Auto Acquire PvE       YES
Auto Basic Attack      YES
Auto Chase             NO
Auto Approach          NO
```

Example:

```text
Zombie in attack range
→ Auto Farm attacks

Zombie outside attack range
→ hero does NOT walk toward it
```

The player uses LS to move into range.

---

# 26. Marksman Kiting

This must work naturally:

```text
Player continuously holds LS left.

Auto Farm stays active.

Zombie enters attack range.

Hero automatically attacks according to attack speed.

Player continues controlling movement.
```

Meaning:

```text
LS ← ← ←

Hero ←

                    Zombie
       projectile →
```

Movement must NOT disable Auto Farm.

Only explicit combat input disables Auto Farm.

---

# 27. Mage Behavior

Mage profile may still use automatic basic attacks for farming.

But:

```text
Skills are NEVER automatically cast.
```

Auto Farm assists mage players by:

```text
automatically basic attacking PvE
providing a reasonable current PvE target
providing optional assisted initial aim for abilities
```

Skill activation remains entirely player-controlled.

---

# 28. Melee Characters

Melee is the only archetype that may receive limited automatic movement assistance.

Reason:

If:

```text
attack range = 1.8m
Zombie distance = 2.1m
```

a fully stationary Auto Farm system feels broken.

Therefore implement:

```text
SHORT PVE AUTO APPROACH
```

Not:

```text
AUTO CHASE
```

---

# 29. Melee Auto Approach

Example:

```ts
attackRange = 1.8;
autoApproachRange = 3.0;
```

If:

```text
Auto Farm active
AND
LS neutral
AND
target is regular PvE
AND
target distance <= autoApproachRange
AND
target distance > attackRange
```

then:

```text
allow a short automatic approach
```

until attack range is reached.

---

# 30. Auto Approach Cancellation

The instant:

```text
LS magnitude > movementDeadzone
```

Auto Approach stops.

Player movement takes over in the SAME frame.

No blending.

No fighting the player.

No hysteresis.

---

# 31. No PvP Auto Chase

Never automatically chase:

```text
Enemy Player
```

Even for melee characters.

PvP positioning remains skill expression.

To close distance against players:

```text
player uses LS
player uses movement skills
```

Do not auto-follow enemies.

---

# 32. Boss Auto Approach

Default:

```text
allowBossAutoApproach = false
```

because automatically walking toward a dangerous boss may be undesirable.

Auto Farm can still basic attack the boss when it is already in range.

Make this configurable per combat profile if needed later.

---

# 33. Combat Profile

Do not hard-code controller logic based on:

```text
mage
marksman
melee
```

Use a profile.

Example:

```ts
interface BasicAttackControlProfile {
  autoFarmEnabled: boolean;
  autoBasicAttackEnabled: boolean;

  attackRange: number;

  autoApproach: {
    enabled: boolean;
    maxRange: number;

    pveOnly: boolean;
    allowBoss: boolean;

    requireMoveStickNeutral: boolean;
  };
}
```

Ranged example:

```ts
{
  autoFarmEnabled: true,
  autoBasicAttackEnabled: true,

  attackRange: 8,

  autoApproach: {
    enabled: false,
    maxRange: 8,
    pveOnly: true,
    allowBoss: false,
    requireMoveStickNeutral: true
  }
}
```

Melee example:

```ts
{
  autoFarmEnabled: true,
  autoBasicAttackEnabled: true,

  attackRange: 1.8,

  autoApproach: {
    enabled: true,
    maxRange: 3.0,
    pveOnly: true,
    allowBoss: false,
    requireMoveStickNeutral: true
  }
}
```

Do NOT write:

```ts
if (hero.class === "melee")
```

inside controller infrastructure.

---

# 34. Six Ability Slots

Use:

```ts
type AbilitySlot =
  | "innate"
  | "q"
  | "w"
  | "e"
  | "r"
  | "ex";
```

Bindings:

```ts
const controllerAbilityBindings = {
  innate: "LB",
  q: "A",
  w: "X",
  e: "Y",
  r: "B",
  ex: "RB",
} as const;
```

Controller must treat all six slots identically.

Do NOT special-case Innate.

Innate is an active ability slot.

---

# 35. Ability Target Types

Keep the controller ability model intentionally small.

Support only:

```ts
type AbilityTargetType =
  | "instant"
  | "unit"
  | "direction"
  | "ground";
```

Do not implement vector targeting until a real hero requires it.

Do not build hypothetical targeting types.

---

# 36. Ability Metadata

Use existing ability definitions where possible.

Conceptual minimum:

```ts
interface AbilityTargetingSpec {
  type:
    | "instant"
    | "unit"
    | "direction"
    | "ground";

  relation?:
    | "hostile"
    | "ally";

  range?: number;
  radius?: number;

  allowSelf?: boolean;
}
```

Do not create hero-name-specific controller code.

Bad:

```ts
if (hero.name === "SomeMage") {
}
```

Good:

```ts
if (ability.targeting.type === "ground") {
}
```

---

# 37. Instant Ability

Examples:

```text
self buff
transformation
instant shield
self explosion
```

Input:

```text
Press ability
→ cast immediately
```

No targeting mode.

No RS required.

Using the ability resets the Auto Farm timer.

---

# 38. Unit Target Ability

Examples:

```text
targeted stun
execute
ally shield
ally heal
```

Use TargetResolver.

For hostile unit skill:

```text
normal:
manual resolver may choose player / zombie / boss

LT held:
enemy players only
```

For ally unit skill:

```text
resolver only searches legal allies
LT ignored
```

---

# 39. Direction Ability

Examples:

```text
projectile
beam
hook
wave
dash
slash
```

RS controls direction.

TargetResolver is NOT required.

This preserves skill expression.

---

# 40. Ground Ability

Examples:

```text
AoE
meteor
ground trap
blink
area control
```

RS controls:

```text
angle = stick angle
distance = stick magnitude
```

Concept:

```text
Hero ●────────◎
               target point
```

No virtual mouse cursor.

---

# 41. Assisted Ability Aim

Skills are never automatically cast.

However Auto Farm may provide an initial suggested aim.

This is OPTIONAL assistance, not gameplay automation.

---

# 42. Unit Skill Assisted Aim

If Auto Farm currently targets:

```text
Zombie #37
```

and player activates a compatible hostile unit-target ability:

```text
initial candidate = Zombie #37
```

Player can immediately cast or override with RS.

---

# 43. Direction Skill Assisted Aim

If there is a valid current combat target:

```text
initial direction =
direction from hero toward current target
```

The instant RS provides meaningful input:

```text
manual RS direction wins
```

Never fight the stick.

---

# 44. Ground Skill Assisted Aim

If there is a valid current target:

```text
initial ground position =
target current position
```

The instant RS moves:

```text
manual ground placement wins
```

---

# 45. Do Not Predict PvP Skillshots

Do NOT automatically lead moving enemy players.

Wrong:

```text
enemy velocity
→ prediction
→ automatically aim skillshot ahead
```

Initial assisted aim may use:

```text
current target position
```

Anything beyond that should remain player skill unless explicitly designed later.

---

# 46. Ability Tap / Precision Behavior

Preferred UX:

```text
Tap
→ use assisted initial aim when legal

Hold + RS
→ precision manual aim

Release
→ cast
```

Do NOT implement an artificial 200ms delay before the ability responds.

Targeting starts immediately when the button is pressed.

RS may override immediately.

---

# 47. Auto Farm During Ability Input

Using an ability:

```text
temporarily exits Auto Farm
```

After the ability interaction completes:

```text
wait AUTO_FARM_DELAY_MS
```

with no further explicit combat input.

Then:

```text
Auto Farm resumes automatically
```

Example:

```text
Auto Farm
↓
Q
↓
manual skill interaction
↓
cast
↓
600 ms without combat input
↓
Auto Farm
```

No additional button is required.

---

# 48. Basic State Model

Do not build a giant state machine.

Use a small semantic combat mode.

```ts
type CombatControlMode =
  | "auto-farm"
  | "manual";
```

PvP Focus should preferably remain a modifier:

```ts
pvpFocusHeld: boolean;
```

Ability targeting can be independent:

```ts
activeAbilityTargeting?: AbilityTargetingSession;
```

Suggested state:

```ts
interface ControllerCombatState {
  mode: CombatControlMode;

  currentTarget?: CombatTarget;

  pvpFocusHeld: boolean;

  activeAbilityTargeting?: AbilityTargetingSession;

  lastExplicitCombatInputAt: number;
}
```

---

# 49. State Flow

Conceptual flow:

```text
                  explicit combat input
          ┌───────────────────────────────┐
          │                               ▼
┌──────────────────┐              ┌──────────────────┐
│    AUTO FARM     │              │      MANUAL      │
│ PvE target + AA  │              │ Player intent    │
└────────┬─────────┘              └────────┬─────────┘
         ▲                                 │
         │     combat idle >= 600ms        │
         └─────────────────────────────────┘


LT HELD
→ hostile unit target filter becomes enemy-player-only
→ immediate priority over Auto Farm
```

---

# 50. Auto Farm and Player Movement Are Independent

This scenario MUST work:

```text
LS continuously held for 10 seconds.

No RS.
No RT.
No ability.
No LT.

→ Auto Farm remains active.
```

This is required for ranged kiting and movement-heavy farming.

---

# 51. Target Entity Model

Target gameplay entities, NOT Babylon meshes.

Conceptual interface:

```ts
interface TargetableEntity {
  id: EntityId;

  position: Vec3;

  alive: boolean;
  visible: boolean;
  targetable: boolean;

  relation:
    | "self"
    | "ally"
    | "hostile";

  kind:
    | "player"
    | "zombie"
    | "zombie-boss";

  aimAssistRadius?: number;
}
```

Use existing project entity types if available.

Do not duplicate the project's entity model solely for controller support.

---

# 52. Spatial Query

Do NOT do:

```ts
scene.meshes.filter(...)
```

every frame.

Create/reuse:

```ts
interface TargetQueryService {
  queryHostilesInRadius(
    origin: Vec3,
    radius: number
  ): readonly TargetableEntity[];

  queryAlliesInRadius(
    origin: Vec3,
    radius: number
  ): readonly TargetableEntity[];
}
```

Use the existing:

* ECS query
* spatial hash
* grid
* octree
* gameplay registry

if the project already has one.

There may be dozens of zombies on screen.

Target selection must not depend on scanning every Babylon mesh.

---

# 53. Target Resolver API

Keep it small.

Conceptual interface:

```ts
type TargetResolveMode =
  | "manual-hostile"
  | "manual-ally"
  | "pvp-focus"
  | "auto-farm";

interface TargetResolveRequest {
  sourceEntityId: EntityId;

  origin: Vec3;

  mode: TargetResolveMode;

  aimDirection?: Vec3;

  range: number;

  previousTargetId?: EntityId;
}

interface TargetResolveResult {
  entityId?: EntityId;
  score?: number;
}
```

Do not add abstractions until actually required.

---

# 54. Target Validity

Reject invalid candidates before scoring.

Reject:

```text
dead
untargetable
invisible according to gameplay rules
wrong relation
wrong PvP/PvE filter
outside allowed range
invalid for ability
```

Do not give invalid targets negative scores.

Remove them completely.

---

# 55. Current Target Invalidation

Re-resolve when:

```text
target dies
target becomes untargetable
target leaves valid target range
target becomes illegal for current ability
LT changes target filter
manual aim strongly points elsewhere
```

---

# 56. Gamepad Input Layer

Use Browser Gamepad API.

Poll:

```ts
navigator.getGamepads();
```

inside the game update loop.

Do not use DOM key events for analog sticks.

Normalize raw gamepad state into:

```ts
interface Stick2 {
  x: number;
  y: number;
  magnitude: number;
}

interface ButtonFrame {
  value: number;

  held: boolean;
  pressed: boolean;
  released: boolean;

  heldMs: number;
}

interface InputFrame {
  timestampMs: number;

  move: Stick2;
  aim: Stick2;

  buttons: Record<ControllerButton, ButtonFrame>;
}
```

Gameplay/controller systems should never consume raw `Gamepad` objects directly.

---

# 57. Deadzones

Initial values:

```ts
moveDeadzone = 0.15;
aimDeadzone = 0.20;
```

Use radial deadzones.

Normalize stick Y so:

```text
positive Y = stick up
```

inside the input adapter.

The rest of the codebase should not care about Browser Gamepad Y-axis inversion.

---

# 58. Movement

LS is camera-relative movement.

Babylon world:

```text
Y = up
X/Z = ground
```

Convert LS into a ground-space direction based on camera orientation.

Controller code emits:

```ts
MoveIntent
```

It does NOT directly move Babylon meshes.

Use the existing movement/navigation/gameplay system.

---

# 59. Camera

Camera automatically follows the controlled hero.

RS does NOT move the camera.

Do not implement edge scrolling.

Do not implement RTS-style camera controls for controller MVP.

Camera may have existing look-ahead behavior based on hero movement if the game already supports it.

---

# 60. Gameplay Commands

Controller input should ultimately emit semantic gameplay intents/commands.

Conceptually:

```ts
type CastTarget =
  | { kind: "none" }
  | { kind: "unit"; entityId: EntityId }
  | { kind: "direction"; direction: GroundVector }
  | { kind: "point"; position: Vec3Data };

type GameCommand =
  | {
      type: "manual-basic-attack";
      targetId: EntityId;
    }
  | {
      type: "cast-ability";
      slot: AbilitySlot;
      target: CastTarget;
    };
```

Continuous Auto Farm may integrate with the existing basic attack state rather than emitting a network command every frame.

Follow existing game architecture.

---

# 61. Multiplayer Authority

If multiplayer is server-authoritative:

Client may express:

```text
I want to attack entity X.

I want to cast Q at position Y.
```

Server still validates:

```text
target alive
range
cooldown
resources
crowd control
line-of-sight
cast legality
attack cooldown
```

Controller-side targeting is UX assistance, not authority.

---

# 62. Recommended File Structure

Adapt to existing architecture.

Do not blindly create duplicates.

Suggested conceptual structure:

```text
src/
  input/
    gamepad/
      GamepadInputService.ts
      GamepadMapping.ts
      GamepadTypes.ts
      StickMath.ts

  combat/
    controller/
      ControllerCombatCoordinator.ts
      ControllerCombatState.ts
      ControllerBindings.ts

      targeting/
        TargetResolver.ts
        TargetingTypes.ts
        TargetScoring.ts

      autofarm/
        AutoFarmController.ts
        BasicAttackControlProfile.ts

      abilities/
        ControllerAbilityInput.ts
        AbilityTargetingSession.ts

      movement/
        AutoApproachController.ts

  presentation/
    controller/
      ControllerTargetIndicator.ts
      AbilityTargetPreview.ts
      ControllerGuidePage.ts

  config/
    controllerCombatConfig.ts

tests/
  controller/
```

If equivalents already exist:

REUSE THEM.

---

# 63. Controller Combat Coordinator

Create one high-level coordinator.

Concept:

```ts
class ControllerCombatCoordinator {
  update(
    input: InputFrame,
    dt: number
  ): void;
}
```

Responsibilities:

```text
detect explicit combat input

maintain manual vs auto-farm state

maintain PvP focus

update target

update basic attack intent

update ability targeting

request optional melee auto approach

emit presentation state
```

Delegate actual work to smaller systems.

Do not create a 2000-line god class.

---

# 64. Recommended Update Order

Each update:

```text
1. Poll Gamepad

2. Build InputFrame

3. Process LS player movement

4. Detect explicit combat input

5. Update PvP Focus

6. Determine Manual / Auto Farm mode

7. Process active ability targeting

8. Resolve current combat target

9. Process manual/automatic basic attack

10. Process optional melee Auto Approach

11. Update target/ability visual indicators
```

Critical:

Player LS processing happens before movement assistance.

This makes movement authority obvious.

---

# 65. Auto Farm Pseudocode

Conceptual only:

```ts
function updateCombatMode(now: number): void {
  if (hasExplicitCombatInputThisFrame()) {
    state.mode = "manual";
    state.lastExplicitCombatInputAt = now;
    return;
  }

  const idleMs =
    now - state.lastExplicitCombatInputAt;

  if (idleMs >= config.autoFarmDelayMs) {
    state.mode = "auto-farm";
  }
}
```

Remember:

```text
LS movement is not explicit combat input.
```

---

# 66. Manual Override Pseudocode

Concept:

```ts
if (manualAimStartedThisFrame) {
  state.mode = "manual";

  discardAutoFarmTargetImmediately();
}

if (pvpFocusPressedThisFrame) {
  discardAutoFarmTargetImmediately();
}
```

Do not delay this transition.

---

# 67. Auto Approach Pseudocode

Concept:

```ts
function canAutoApproach(
  target: TargetableEntity,
  moveInput: Stick2,
  profile: BasicAttackControlProfile
): boolean {
  if (!profile.autoApproach.enabled) {
    return false;
  }

  if (state.mode !== "auto-farm") {
    return false;
  }

  if (
    profile.autoApproach.requireMoveStickNeutral &&
    moveInput.magnitude > config.moveDeadzone
  ) {
    return false;
  }

  if (target.kind === "player") {
    return false;
  }

  if (
    target.kind === "zombie-boss" &&
    !profile.autoApproach.allowBoss
  ) {
    return false;
  }

  return distanceToTarget <=
    profile.autoApproach.maxRange;
}
```

---

# 68. Target Visual State

Expose presentation-only state:

```ts
interface ControllerCombatVisualState {
  currentTargetId?: EntityId;

  targetSource?:
    | "auto-farm"
    | "manual"
    | "pvp-focus";

  autoFarmActive: boolean;

  pvpFocusActive: boolean;

  abilityTargeting?: AbilityTargetPreview;
}
```

Rendering code must not decide targets.

---

# 69. Target Indicator UX

Only highlight the CURRENT target.

Do not highlight dozens of candidates.

Suggested visual hierarchy:

```text
AUTO FARM target
subtle target ring

MANUAL target
stronger target ring

PVP FOCUS target
clear PvP-focused target ring
```

Reuse the game's existing enemy/team color language.

Do not invent a disconnected color system.

Player should visually understand:

```text
"This zombie is being auto-farmed."

"This is the target I manually aimed at."

"LT is currently selecting enemy players."
```

---

# 70. Ability Preview

Support presentation data for:

```text
unit
direction
ground
```

Examples:

Directional:

```text
YOU ●──────────→
```

Ground:

```text
YOU ●──────────◎
                 AoE
```

Unit:

```text
       Enemy
         ◉
```

Do not instantiate/dispose Babylon preview meshes every frame.

Reuse preview objects.

---

# 71. Debug Overlay

Build a dev-only debug overlay.

Show:

```text
Controller connected

Combat mode:
AUTO FARM / MANUAL

PvP Focus:
ON / OFF

LS:
x / y / magnitude

RS:
x / y / magnitude

Current target:
entityId

Target source:
auto-farm / manual / pvp-focus

Target kind:
player / zombie / zombie-boss

Active ability:
slot

Ability targeting:
instant / unit / direction / ground

Auto Approach:
ON / OFF

Last explicit combat input:
milliseconds ago
```

Also support optional target scoring debug:

```text
Zombie_41

direction     0.82
distance      0.67
stickiness    0.10

total         0.75
```

This is essential for tuning.

---

# 72. Performance

Expected:

```text
dozens of zombies on screen
```

TargetResolver should query nearby gameplay entities only.

Do not:

```text
scan scene.meshes every frame
allocate large arrays every update
instantiate target indicator meshes repeatedly
```

Keep hot targeting paths allocation-light where practical.

Do not prematurely optimize unrelated systems.

---

# 73. Gamepad Disconnect

On disconnect:

```text
clear held button state

stop manual basic attack intent

cancel active ability targeting

stop Auto Approach movement

do not cast pending ability

do not treat reconnect-held buttons as fresh presses
```

Player movement must not get stuck.

---

# 74. First Implementation Plan

Do NOT implement the entire system in one giant change.

Work in the following phases.

---

## PHASE 0 — Repository Discovery

Before editing anything:

Inspect the repository.

Find existing:

```text
game loop
input
player controller
movement
camera
entity/ECS
combat
basic attack
ability definitions
ability casting
network commands
Babylon scene structure
spatial query
HUD/UI
```

Produce a short internal mapping of:

```text
Spec concept
→ existing project type/system
```

Reuse existing systems wherever possible.

Do not refactor unrelated architecture just to match names in this spec.

---

## PHASE 1 — Gamepad Foundation

Implement:

```text
Browser Gamepad polling

standard mapping

InputFrame

radial deadzones

button pressed / held / released

hot plug / disconnect

controller debug values
```

Acceptance:

```text
LS/RS/button values are reliable.

No stick drift outside deadzone.

Disconnect cannot leave stuck inputs.
```

---

## PHASE 2 — Movement + Six Ability Bindings

Implement:

```text
LS movement

automatic camera-follow compatibility

A = Q
X = W
Y = E
B = R
LB = Innate
RB = EX

RT = manual basic attack intent

LT = PvP Focus modifier
```

Do not yet implement advanced target assistance.

Acceptance:

```text
hero moves naturally

all six abilities have direct physical buttons

no modifier ability layers exist
```

---

## PHASE 3 — Target Resolver

Implement:

```text
TargetQueryService

TargetResolver

manual directional scoring

target stickiness

PvP player-only filtering

current target + target source

target indicator
```

Test initially with:

```text
1 player
10 zombies
1 boss
```

Then:

```text
6 enemy players
30+ zombies
```

Acceptance:

```text
RS can intentionally select entities.

LT immediately removes zombies from hostile selection.

Target does not flicker excessively.
```

---

## PHASE 4 — Auto Farm

Implement:

```text
lastExplicitCombatInputAt

600ms Manual → Auto Farm delay

PvE-only Auto Farm resolver

automatic basic attacks

immediate retarget after zombie death

movement does NOT disable Auto Farm
```

Acceptance:

A player should be able to:

```text
only move with LS
```

while the hero:

```text
automatically farms nearby zombies
```

for an extended period.

No enemy player may be automatically attacked.

---

## PHASE 5 — Manual Override + PvP

Verify:

```text
RS immediately overrides Auto Farm

RT immediately overrides Auto Farm

LT immediately overrides Auto Farm target selection

ability input immediately overrides Auto Farm

Auto Farm returns after configured combat-idle delay
```

Acceptance:

Scenario:

```text
Auto attacking Zombie

Enemy player enters

Player presses LT + RS

same frame:
targeting changes to players

RT:
basic attacks player

LT released

after combat idle delay:
returns to PvE Auto Farm
```

---

## PHASE 6 — Combat Profiles

Implement:

```text
BasicAttackControlProfile

ranged:
no auto approach

melee:
short PvE auto approach

LS:
same-frame cancellation of auto approach
```

Acceptance:

### Ranged

```text
out-of-range zombie
→ character does not chase
```

### Melee

```text
nearby zombie slightly outside attack range
+
LS neutral
→ short approach

touch LS
→ auto approach stops immediately
```

### PvP

```text
enemy player outside melee range
→ never auto chase
```

---

## PHASE 7 — Ability Targeting

Implement four types:

```text
instant
unit
direction
ground
```

Implement assisted initial aim.

Manual RS always wins.

Skills are never automatically cast.

Acceptance:

One test hero should contain:

```text
Innate:
Instant

Q:
Unit Target

W:
Directional

E:
Ground AoE

R:
another type

EX:
another type
```

All six must work using the same infrastructure.

---

## PHASE 8 — Player Guide Page

Implement the player-facing controller explanation page described later in this document.

This page is NOT the debug overlay.

It should explain the system in player language.

---

## PHASE 9 — Tuning / Polish

Tune:

```text
Auto Farm delay

manual target aim cone

target switch threshold

manual direction weight

Auto Farm acquisition distance

melee Auto Approach distance

target indicator intensity
```

Only tune after actual 3v3v3 + zombie playtests.

---

# 75. Required Integration Test Scenarios

Create/debug these scenarios.

---

## Test A — Zombie Farming

Scene:

```text
1 player
30 zombies
```

Player only moves with LS.

Expected:

```text
Auto Farm activates.

Hero continuously acquires and attacks nearby zombies.

Player never needs to press RT.

Zombie death immediately selects next reasonable zombie.

Movement continues normally.
```

---

## Test B — Marksman Kiting

Scene:

```text
ranged hero
20 zombies
```

Player:

```text
holds LS left continuously
```

Expected:

```text
Auto Farm remains active.

Hero attacks valid zombies while moving.

Hero never automatically walks toward zombies.
```

---

## Test C — PvP Interruption

Scene:

```text
30 zombies
enemy player
```

Hero is Auto Farming.

Player presses:

```text
LT
```

Expected same frame:

```text
Zombie target no longer valid for hostile selection.

Enemy player becomes the only hostile target category.
```

Player presses:

```text
RT
```

Expected:

```text
manual basic attack against player
```

No zombie may steal target.

---

## Test D — Return To Farming

After PvP interaction:

```text
release LT

stop RS

release RT

use no ability
```

After approximately:

```text
600ms
```

Expected:

```text
Auto Farm resumes
```

without another button.

---

## Test E — Melee Farming

Scene:

```text
melee hero
Zombie 2.5m away
attack range 1.8m
auto approach max 3m
```

LS neutral.

Expected:

```text
short automatic approach
→ attack
```

Now player pushes LS away.

Expected same frame:

```text
Auto Approach cancelled
player movement wins
```

---

## Test F — Melee PvP

Enemy player 2.5m away.

Expected:

```text
NO Auto Approach
```

even if hero is melee.

Player must manually move.

---

## Test G — Skill Usage During Farm

Auto Farm active.

Player activates Direction skill.

Expected:

```text
Auto Farm temporarily yields.

Skill receives assisted initial direction.

RS immediately overrides assisted direction.

Skill casts only because player pressed ability.

No automatic skill casting.

After combat idle delay:
Auto Farm returns.
```

---

## Test H — 3v3v3 + Horde

Scene:

```text
3 allied players
6 hostile players
30–50 zombies
1 zombie boss
```

Expected:

```text
Auto Farm remains stable.

Manual RS remains predictable.

LT makes PvP targeting reliable despite zombie density.

No target indicator flicker.

No unwanted player auto attacks.

No unwanted PvP auto movement.
```

---

# 76. Architecture Acceptance Criteria

The implementation is NOT complete if any of these are violated:

```text
Controller uses virtual mouse.

Controller scans scene.meshes for combat targeting.

Controller contains hero-name-specific targeting code.

Auto Farm attacks enemy players.

Skills auto cast.

Ranged characters auto chase.

Melee auto approaches while LS is active.

Melee auto chases players.

TargetResolver emits movement commands.

Innate is treated as passive-only.

Ability modifier banks are introduced unnecessarily.
```

---

# 77. Gameplay Acceptance Criteria

The controller design succeeds when:

### Farming

Player can efficiently kill hundreds of zombies without manually selecting every zombie.

### Marksman

Player can focus mainly on positioning and kiting instead of repeatedly selecting PvE targets.

### Mage

Player receives low-friction PvE basic attacks while retaining full manual control over ability timing and precision.

### Melee

Player does not repeatedly stop centimeters outside attack range while farming, but also never loses movement authority.

### PvP

When six enemy players are mixed with dozens of zombies:

```text
Hold LT
```

makes player targeting reliable.

### Control Authority

Any meaningful manual combat input immediately overrides automation.

### Recovery

When the player stops issuing combat commands:

```text
Auto Farm naturally returns
```

without a toggle or extra command.

---

# 78. PLAYER-FACING CONTROLLER GUIDE PAGE

Now implement a player-facing help/onboarding page.

This is NOT a technical page.

Do not show:

```text
TargetResolver
TargetSource
AUTO_FARM_DELAY_MS
state machine
score weights
```

Use simple player language.

Page title:

```text
手把戰鬥操作
```

Subtitle:

```text
專心走位、放技能，清怪交給自動戰鬥。
```

---

# 79. Guide Page — Main Controller Diagram

Show a simple controller illustration / layout.

Label:

```text
左搖桿
移動

右搖桿
瞄準

RT
手動普攻

LT
玩家專注

A
Q

X
W

Y
E

B
R

LB
天生

RB
EX
```

Do not label LT as:

```text
鎖定
```

because it is not a hard lock.

Use:

```text
玩家專注
```

or equivalent localized terminology.

Supporting text:

```text
按住 LT 時，攻擊與指定敵人的技能會忽略殭屍，只選敵方玩家。
```

---

# 80. Guide Page — Three Things To Remember

Display three highly visible concepts.

## ① 平常移動就能清怪

Player-facing copy:

```text
沒有進行戰鬥操作一小段時間後，
角色會自動尋找附近的殭屍並進行普攻。

你可以繼續用左搖桿移動，
不用一隻一隻重新選怪。
```

Visual:

```text
Zombie     Zombie

      YOU ───→ attack

          ↑
      LS movement
```

Label:

```text
自動清怪
```

---

## ② 想打玩家就按住 LT

Copy:

```text
殭屍太多找不到敵方玩家？

按住 LT 進入「玩家專注」。

這時攻擊與指定敵人的技能會忽略殭屍，
只選敵方玩家。
```

Visual:

```text
Zombie   Zombie

   [Enemy Player]
          ◉

Zombie      YOU

        LT held
```

Emphasize:

```text
LT 不會讓角色自動追人。
移動仍然完全由你控制。
```

---

## ③ 技能永遠由你決定

Copy:

```text
自動戰鬥只會幫你進行普攻。

天生、Q、W、E、R、EX
永遠不會自動施放。
```

Then:

```text
快速按下
→ 使用系統提供的初始瞄準

按住技能 + 右搖桿
→ 自己精準瞄準

放開
→ 施放
```

Only describe this Tap/Hold distinction for abilities where assisted aiming actually applies.

Instant abilities should simply display:

```text
按下立即施放
```

---

# 81. Guide Page — Combat Style Examples

Create three short visual cards/sections.

---

## 射手

Title:

```text
射手：專心走位
```

Visual:

```text
YOU ← ← ←

        ─────→ projectile

                  Zombie
```

Copy:

```text
清怪時，射程內的殭屍會自動成為普攻目標。

你只需要控制走位。

角色不會為了追怪自己跑出去。
```

---

## 法師

Title:

```text
法師：自動普攻，技能自己放
```

Visual:

```text
Auto Attack
YOU ─────→ Zombie

Q / W / E
YOU ═════→ Manual Skill
```

Copy:

```text
自動戰鬥會協助基本攻擊，
但不會替你放任何技能。

技能可以使用目前目標作為初始瞄準，
右搖桿一動就會立即改成你的手動方向。
```

---

## 近戰

Title:

```text
近戰：差一步時會幫你貼近
```

Visual:

```text
YOU →     Zombie
     short approach
```

Copy:

```text
自動清怪時，如果殭屍只差一小段距離，
近戰角色可以自動靠近到攻擊範圍。

只要你碰左搖桿，
自動靠近會立刻取消。
```

Then emphasize:

```text
對敵方玩家永遠不會自動追擊。
```

---

# 82. Guide Page — PvE / PvP Transition

Show a simple visual flow:

```text
平常

移動 + 自動清怪
        │
        │ LT
        ▼
玩家專注

只選敵方玩家
        │
        │ 放開 LT
        │ 停止戰鬥操作一小段時間
        ▼
自動清怪
```

Player-facing caption:

```text
不用切換永久模式。

想打玩家時按住 LT，
戰鬥結束後系統會自然回到自動清怪。
```

This is a key UX message.

---

# 83. Guide Page — Target Indicator Explanation

Explain only if target rings are visible in the game.

Suggested:

```text
自動清怪目標
較低調的目標標記

手動瞄準目標
較明顯的目標標記

玩家專注目標
最清楚的敵方玩家標記
```

Do not show rings on every zombie.

Only the current target should receive the controller targeting indicator.

---

# 84. Guide Page — Final Quick Reference

Bottom section:

```text
左搖桿
移動

右搖桿
瞄準

RT
手動普攻

LT
只選敵方玩家

A / X / Y / B
Q / W / E / R

LB
天生

RB
EX
```

Then show four rules:

```text
✓ 不操作戰鬥時，自動清怪

✓ 移動不會關閉自動清怪

✓ 技能不會自動施放

✓ 系統不會自動追敵方玩家
```

---

# 85. Guide Page Implementation Notes

Implement using the project's existing UI technology.

If UI is DOM-based:

Create a responsive component/page similar to:

```text
ControllerGuidePage
```

Requirements:

```text
desktop readable
controller navigation compatible if existing UI supports it
mobile/web responsive
no horizontal overflow
reuse existing game typography and HUD visual language
```

Do not create an unrelated visual style.

If controller glyph assets already exist, reuse them.

If not:

Use simple text/button glyphs first.

Do not block controller system implementation waiting for polished controller artwork.

---

# 86. Player Terminology

Use these player-facing terms consistently:

```text
Auto Farm
→ 自動清怪

PvP Focus
→ 玩家專注

Manual Target
→ 手動瞄準

Auto Approach
→ do NOT expose as a technical term
```

For melee simply explain:

```text
差一小段距離時會自動靠近殭屍
```

Do not expose internal state names.

---

# 87. Do Not Over-Engineer

This project does NOT need a Dota controller architecture.

Do NOT add unless an actual requirement appears:

```text
Hard Lock

Soft Lock + Hard Lock dual system

Enemy/Friendly targeting modes on separate buttons

Attack Move

Control Groups

RTS selection

Virtual cursor

Six item active slots

Ability modifier layers

Vector targeting

Global targeting

Hero-specific controller classes

Automatic PvP chase

Automatic skill casting
```

The intended architecture is deliberately small.

---

# 88. Final System Summary

The final control loop should feel like this:

```text
=====================
       FARMING
=====================

Player:
LS = movement

Game:
find zombie
basic attack
find next zombie
basic attack
...

Player does not need to select every zombie.


=====================
       PVP
=====================

Player:
Hold LT
→ zombies disappear from hostile targeting

RS
→ choose combat direction / player

RT
→ basic attack

Q/W/E/R/Innate/EX
→ skills

LS
→ full movement authority


=====================
       MAGE
=====================

Auto Farm:
basic attacks only

Player:
controls every skill


=====================
      MARKSMAN
=====================

Auto Farm:
attack nearby PvE

Player:
focuses on kiting

No auto chase.


=====================
       MELEE
=====================

Auto Farm:
may close a very small PvE gap

Player touches LS:
automation stops immediately

PvP:
never auto chase.
```

---

# 89. Absolute Priority Rules

When uncertain during implementation, follow these rules in order:

```text
1.
Player movement input always owns movement.

2.
Explicit player combat input always beats automation.

3.
LT means hostile enemy players only.

4.
Auto Farm attacks PvE only.

5.
Skills are never automatically cast.

6.
Auto Farm may automatically basic attack.

7.
Ranged characters never auto chase.

8.
Melee may only short-approach PvE while LS is neutral.

9.
Enemy players are never automatically chased.

10.
After manual combat inactivity, Auto Farm returns automatically.
```

---

# 90. Definition of Done

The controller MVP is complete when a controller-only player can enter a real:

```text
3v3v3
+
30–50 zombies
+
Zombie Boss
```

combat test and successfully:

```text
move

farm hundreds of zombies without target-spamming

kite while farming

manually attack

switch instantly from PvE to PvP using LT

reliably target players inside a zombie horde

use all six abilities

aim direction skills

aim ground skills

use unit target skills

play ranged characters without auto chase

play melee characters without stopping just outside attack range

override every automation immediately

return naturally to Auto Farm after combat
```

without:

```text
mouse
keyboard
virtual cursor
hard lock
RTS control
automatic skill casting
automatic PvP chase
```

---

# 91. Claude Code Execution Instructions

Before coding:

1. Inspect the repository.
2. Identify existing equivalent systems.
3. Reuse them.
4. Do not duplicate movement/combat/entity/ability/network systems.
5. Implement Phase 1 first.
6. Keep changes small and testable.
7. Add tests as each phase is implemented.
8. Preserve keyboard/mouse support.
9. Controller and keyboard/mouse should converge at the semantic gameplay-command layer.
10. Do not perform unrelated refactors.

Target architecture:

```text
Keyboard / Mouse ─────┐
                      │
                      ▼
              Semantic Gameplay
                  Commands
                      ▲
                      │
Controller ───────────┘
     │
     ├─ Manual Combat
     │
     ├─ PvP Focus
     │
     └─ Auto Farm Assist
```

Implement the smallest version that satisfies this specification first.

Do not add speculative abstractions.
