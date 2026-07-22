# GoDieEX22s — champion & prop model scales

Regenerated after the facing + scale normalization pass (job "Fix model facing + scales").
All heights are MESH-ONLY world-space bbox heights measured through Babylon's
NullEngine on the exact .glb the client loads. Target champion height ≈ **1.70**
world units (the importer's HERO_TARGET_HEIGHT convention).

- **imported.* height** = `bodyH`, the largest-vertex mesh (the character body).
- **champ.* (KayKit) height** = `trimmedH`, full silhouette minus weapons/capes
  (incl. headgear); these are normalized by **head-top** so faces align at ~1.70
  and hats/helmets protrude naturally (hence resulting world height > 1.70 for tall hats).
- collisionRadius is UNCHANGED for every model (planar sim authority).

## Champions

| modelKey | family | measured height | old scale | new scale | rendered height |
|---|---|---:|---:|---:|---:|
| champ.sela | kaykit | 2.716 | 1 | 0.7727 | 2.098 |
| champ.skin.barbarian | kaykit | 2.398 | 0.55 | 0.7798 | 1.870 |
| champ.skin.rogue | kaykit | 2.187 | 0.55 | 0.7798 | 1.705 |
| champ.thorne | kaykit | 2.467 | 1 | 0.7328 | 1.808 |
| imported.bulbasaur | imported | 1.700 | 1.7647 | 1 | 1.700 |
| imported.cloud | imported | 1.700 | 1 | 1 _(unchanged)_ | 1.700 |
| imported.collision | imported | — (empty glb) | 1.5 | 1.5 _(unchanged)_ | — (procedural fallback) |
| imported.fox | imported | 1.700 | 1.15 | 1 | 1.700 |
| imported.fox2 | imported | 1.700 | 1.05 | 1 | 1.700 |
| imported.goku | imported | 1.700 | 1 | 1 _(unchanged)_ | 1.700 |
| imported.gumdam | imported | 1.700 | 1 | 1 _(unchanged)_ | 1.700 |
| imported.herobiggon | imported | 36.354 | 0.0608 | 0.0468 | 1.701 |
| imported.herobuu | imported | 1.700 | 1 | 1 _(unchanged)_ | 1.700 |
| imported.herofate | imported | 1.700 | 1 | 1 _(unchanged)_ | 1.700 |
| imported.herogirl | imported | 1.700 | 1.01 | 1.01 _(unchanged)_ | 1.717 |
| imported.herohanzouhattori | imported | 1.700 | 1 | 1 _(unchanged)_ | 1.700 |
| imported.herohehi | imported | 1.700 | 0.85 | 1 | 1.700 |
| imported.herohimurakenshin | imported | 1.700 | 1 | 1 _(unchanged)_ | 1.700 |
| imported.heroichigo | imported | 1.700 | 0.7 | 1 | 1.700 |
| imported.herokunoichi | imported | 1.700 | 1 | 1 _(unchanged)_ | 1.700 |
| imported.herokyo | imported | 1.700 | 1 | 1 _(unchanged)_ | 1.700 |
| imported.herolight | imported | 1.700 | 1 | 1 _(unchanged)_ | 1.700 |
| imported.herolingtong | imported | 1.700 | 1 | 1 _(unchanged)_ | 1.700 |
| imported.heromiku | imported | 1.700 | 1 | 1 _(unchanged)_ | 1.700 |
| imported.heromusashimiyamoto | imported | 1.700 | 1 | 1 _(unchanged)_ | 1.700 |
| imported.herooichi | imported | 1.700 | 1.1 | 1 | 1.700 |
| imported.heropika | imported | 1.700 | 1 | 1 _(unchanged)_ | 1.700 |
| imported.heropikachu | imported | 1.700 | 1.7647 | 1 | 1.700 |
| imported.herorider | imported | 1.700 | 1.4 | 1 | 1.700 |
| imported.herosaber | imported | 1.700 | 1.1 | 1 | 1.700 |
| imported.herosasuke | imported | 1.700 | 0.7 | 1 | 1.700 |
| imported.herosephiroth | imported | 1.700 | 1 | 1 _(unchanged)_ | 1.700 |
| imported.heroshana | imported | 1.700 | 1.25 | 1 | 1.700 |
| imported.heroshanawingsmall | imported | 3.188 | 0.5332 | 0.5332 _(unchanged)_ | 1.700 |
| imported.herotoshiiemaeda | imported | 1.700 | 1 | 1 _(unchanged)_ | 1.700 |
| imported.heroxelloss | imported | 1.700 | 1 | 1 _(unchanged)_ | 1.700 |
| imported.horse | imported | 1.700 | 1 | 1 _(unchanged)_ | 1.700 |
| imported.horsehead | imported | 1.700 | 1 | 1 _(unchanged)_ | 1.700 |
| imported.hzyn | imported | 1.700 | 1.1 | 1 | 1.700 |
| imported.kikyou | imported | 1.700 | 1 | 1 _(unchanged)_ | 1.700 |
| imported.lgcr | imported | 1.700 | 1 | 1 _(unchanged)_ | 1.700 |
| imported.linainvers | imported | 1.700 | 1 | 1 _(unchanged)_ | 1.700 |
| imported.linkstik | imported | 1.700 | 0.9 | 1 | 1.700 |
| imported.long | imported | 1.700 | 0.7 | 1 | 1.700 |
| imported.lubu | imported | 1.700 | 1 | 1 _(unchanged)_ | 1.700 |
| imported.luffe | imported | 1.700 | 1.1 | 1 | 1.700 |
| imported.ma | imported | 1.700 | 1 | 1 _(unchanged)_ | 1.700 |
| imported.mfls | imported | 1.700 | 1 | 1 _(unchanged)_ | 1.700 |
| imported.negi | imported | 1.700 | 0.9 | 1 | 1.700 |
| imported.niya | imported | 1.700 | 1 | 1 _(unchanged)_ | 1.700 |
| imported.picacugy | imported | 1.700 | 1.7647 | 1 | 1.700 |
| imported.pika | imported | 1.700 | 1.2 | 1 | 1.700 |
| imported.rabbit | imported | 1.700 | 1 | 1 _(unchanged)_ | 1.700 |
| imported.renaryugu2 | imported | 1.700 | 1 | 1 _(unchanged)_ | 1.700 |
| imported.sd2 | imported | 1.700 | 1.1 | 1 | 1.700 |
| imported.sesshomaru | imported | 1.700 | 1.1 | 1 | 1.700 |
| imported.ye-wuqi1 | imported | 1.700 | 0.7 | 1 | 1.700 |
| imported.zy3 | imported | 1.700 | 1 | 1 _(unchanged)_ | 1.700 |

_Rendered height for KayKit is the full hat-inclusive silhouette; their head-top
sits at ~1.70 by construction. Median rendered head height across champions: 1.7._

## Props

| modelKey | glb | mesh H × W | scale | rendered H × W | collisionRadius |
|---|---|---:|---:|---:|---:|
| prop.flower | waterlily.glb | 0.017 × 0.145 | 8 | 0.137 × 1.161 | 0.7 |

prop.flower is a targetable objective sized to fill its **0.7** collision radius
(≈1.4 u footprint), NOT a champion — the waterlily lily-pad is intentionally flat.
scale is left in the existing [6,12] contract (flowerModel.test.ts) and collisionRadius
matches the sim constant FLOWER_RADIUS.

## Effect-mesh inflation (content review — NOT a scale-doc bug)

These champion .glbs carry stray effect/beam geometry far above the body; the body
height (used for scaling) is correct, but the full bbox is inflated (bbox/culling/aim
hazard). Fix belongs in the importer (drop non-body geosets) or the render bbox.

| modelKey | bodyH | full mesh bbox H | ratio |
|---|---:|---:|---:|
| imported.niya | 1.700 | 14.485 | 8.52× |
| imported.heromiku | 1.700 | 4.269 | 2.51× |
| imported.ma | 1.700 | 3.970 | 2.34× |
| imported.picacugy | 1.700 | 3.609 | 2.12× |
| imported.bulbasaur | 1.700 | 3.130 | 1.84× |
| imported.heropika | 1.700 | 2.819 | 1.66× |
| imported.linkstik | 1.700 | 2.780 | 1.64× |

