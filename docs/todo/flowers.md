# Healing flowers (LoL-Arena plants) — TODO

Periodic neutral, attackable flowers in each duel zone during **Combat**; killing one
bursts **HP + MP** (fraction of each recipient's OWN maxHealth/maxMana) to the killer
and the killer's allied champions within `burstRadius` of the flower.

**Config** (`content/config/arena-rules.json`, additive `flowers` block on
`config.arena-rules@1`): `firstSpawnSec 15 · respawnSec 25 · maxAlivePerZone 1 · hp 60 ·
healPctMax 0.18 · manaPctMax 0.18 · burstRadius 6`. Absent block = no flowers (legacy).

**Sim** (`packages/shared/src/sim/flowers.ts` + `systems/FlowerSystem.ts`): a flower is a
NEUTRAL entity — transform (radius 0.7) + health (no regen) + `FlowerComp` marker; **no
seat/TeamComp/nav/stats**, so team/champion iterations (duel victory, team lives,
placement, AI perception, kill stats) never see it by construction. Spawn positions are
deterministic from `world.rng` (square→disc rejection sampling, NO trig) with min-3u
clearance from obstacles + champion spawns (arena collision helpers). Cadence is driven
by `world.combatTicks` (armed via `beginCombatFlowers`/`endCombatFlowers` from the
MatchController on combat entry/exit); `respawnSec` counts from the previous flower's
DEATH. Burst runs in `flowerSystem` right after `deathSystem` (consumes the tick's
`death` events): killer always + allied champions within radius, alive + same zone only;
flower kills grant NO XP/gold/onKill. Flowers are valid targets for basic attacks,
enemy-targeted casts, ground AoE and projectiles, but ally-targeted casts
(`targetsEnemies: false`) reject them; unit separation treats them as static props.

**Protocol/server**: `EntityState.kind 2` (`ENTITY_KIND.FLOWER`), `key "prop.flower"`,
seatId -1, hp/maxHp projected (healthbars). `MSG.EVENT` whitelist gains
`flowerSpawn {id,x,z}` / `flowerBurst {id,x,z,teamId(of killer)}`. Dev cheat
`{kind:"spawnFlower"}` spawns one in the caller's zone (cheatGate-gated). Tier-0 AI:
below 65% HP with a live flower within 12u in its zone → attackTarget the flower.
Flowers are server entities: interpolated on the client like projectiles, never
predicted (the prediction shadow world never arms flower rules).

**Model doc**: `content/models/prop.flower.json` (model@1) → `assets/models/hex/waterlily.glb`
(existing CC0 hex-kit asset; the mesh is a MINIATURE ~0.145u across, so the doc uses
`scale 8.0` to read at champion scale ≈1.16u wide — the contract's "scale up … keep it
data-driven in the doc" clause), `collisionRadius 0.7`, all-"Stand" clipMap (static GLB,
0 animations — imported-prop convention). NOT yet in `content/models/_index.json`
(rebuilt only by `content:build` in the main session); until the reindex the client
shows the voxel fallback, then upgrades.

**Client render** (`apps/client/src/render/`): `EntityViewRegistry` kind 2 → pooled
`FlowerView` (ProjectileView-style free-list + ChampionView-style async .glb upgrade;
instant green/pink voxel fallback, cheap sine bob + slow spin, hide-on-dead, `posOf`
served for vfx/damage-numbers). **Healthbars**: `overheadAnchors.ts` pure rules
(champions + flowers get bars, projectiles never; neutral color `#b7e3a8` outside the
team palette; lower projection height 1.35 vs 2.45) feed `GameApp.updateFrameBus`,
which anchors kind 2 with name "" / teamId -1 / `color` override.
⚠ `ui/WorldAnchorLayer.tsx` is LOCKED (icons #33): the 1-line consumer change is
`makeChampionNode(anchor.name, anchor.color ?? teamCss(anchor.teamId), anchor.isLocal)`
— until then a flower bar renders with `teamCss(-1)` (gold).

**Client vfx** (`apps/client/src/vfx/VfxSystem.ts`): `flowerBurst` → existing
hand-authored `fx.barkskin` (green heal burst), `flowerSpawn` → `fx.root-snare` (leafy
sprout puff), both at the event's own x/z (the entity is already despawned on burst);
HitSpark fallback when the doc never loaded. No new vfx docs.

**Client net**: flowers ride the EXISTING interpolation path (GameApp.onStatePatch
pushes all entities into the id-keyed InterpolationBuffer — no kind filter) and are
NEVER predicted; zero net/predict changes needed. Client picking still targets
champions only — if desired, widen `GameApp.enemyUnitsFor` (radius 0.7) as a follow-up.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| flw-01 | `config.arena-rules@1` parses the additive `flowers` block; `rulesFromDoc` carries it; absent block -> legacy (null) | flower-config-parse | unit | done |
| flw-02 | spawn positions + world digests identical across two same-seed runs; min-3u clearance from obstacles/spawns, inside boundary | flower-spawn-deterministic | determinism | done |
| flw-03 | cadence: first spawn at `firstSpawnSec` of combat, `maxAlivePerZone` enforced, respawn `respawnSec` after the previous flower's DEATH | flower-cadence | unit | done |
| flw-04 | burst restores healPctMax/manaPctMax of each recipient's OWN maxima to killer + radius allies only; enemy nearby, dead ally, out-of-radius ally unaffected; NO kill XP/gold; `flowerBurst` emitted | flower-burst | unit | done |
| flw-05 | targeting: basic attacks + enemy-targeted casts + ground AoE hit flowers; ally-targeted (`targetsEnemies:false`) casts reject them; separation never moves a flower | flower-target-filters | unit | done |
| flw-06 | flowers NEVER count toward duel victory / team lives / placement / K-D stats; a live flower doesn't hold up combat resolution | flower-victory-isolated | integration | done |
| flw-07 | all flowers despawn when combat ends (round end / skipPhase); none survive into intermission/resolution | flower-despawn-roundend | integration | done |
| flw-08 | full MatchController round with the content doc's flowers block: flowers spawn during combat in the paired duel zones | flower-match-cadence | integration | done |
| flw-09 | snapshot projects kind 2 / key "prop.flower" / hp+maxHp / seatId -1; entity leaves the snapshot after burst | flower-snapshot-kind | unit | done |
| flw-10 | Tier-0 AI below 65% HP prefers an in-zone flower within 12u as attack target; healthy AI ignores it | flower-ai-seek | unit | done |
| flw-11 | dev cheat `spawnFlower` spawns a flower in the caller's zone (works without a flowers block via contract defaults) | flower-cheat-spawn | unit | done |
| flw-12 | MatchRoom MSG.EVENT whitelist forwards `flowerSpawn` + `flowerBurst` (source lint) | flower-event-whitelist | regression | done |
| flc-01 | `prop.flower` model doc parses under zModelDoc (direct file read, index-independent); glbPath asset exists; collisionRadius 0.7; scale sized for the miniature mesh | flower-model-doc | unit | done |
| flc-02 | EntityViewRegistry kind 2 → pooled FlowerView (never champion/projectile), voxel fallback instant, hide-on-dead, pool reuse across respawn, coexists with kinds 0/1, posOf served | flower-view-dispatch | unit | done |
| flc-03 | overhead-bar rules: champions AND flowers carry bars, projectiles never; flower color neutral (outside TEAM_CSS) with champion teamId-derived fallback; lower flower bar height | flower-anchor-filter | unit | done |
| flc-04 | VfxSystem maps flowerBurst→fx.barkskin / flowerSpawn→fx.root-snare at the event x/z (no live entity needed); HitSpark fallback without the doc; malformed events ignored | flower-vfx-events | unit | done |
