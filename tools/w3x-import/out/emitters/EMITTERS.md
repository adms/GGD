# Imported-model emitter dataset

Source: `out/GoDieEX22s-src/raw` — 132 imported models, 0 parse failures.

Machine-readable: `EMITTERS.json` (per model, per emitter, raw + converted) and `MODEL_REFS.json` (every model-valued object-data field, classified).

## Census

| | count |
|---|---:|
| models scanned | 132 |
| models parsed without error | 132 |
| models carrying at least one emitter | 82 |
| PRE2 particle emitters | 238 |
| RIBB ribbon emitters | 56 |
| PREM (v1) emitters | 0 |
| models declaring an EMPTY PREM chunk | 59 |
| **emitters decoded byte-exactly** (consumed their full declared inclusiveSize) | **294 / 294** |
| emitters with leftover bytes (layout suspect) | 0 |
| emitters carrying animation tracks beyond visibility | 48 |
| emitters with a parse/authoring warning | 62 |
| emitters whose texture did not resolve | 0 |

### Asset classes

| class | models | meaning |
|---|---:|---|
| `mesh-and-emitter-hybrid` | 55 | real mesh AND emitters — converts to a plausible-looking glb with the particle layer silently missing |
| `mesh-only` | 49 | no emitters; the glb is complete |
| `emitter-dominant-hybrid` | 15 | <=48 triangles — a token billboard; the emitters are effectively the whole asset |
| `pure-emitter` | 12 | zero geometry — the emitters ARE the asset; the glb is an empty shell |
| `no-geometry-no-emitter` | 1 | neither — an invisible carrier or a collision-only stub |

### Pure-emitter models (glb is an empty shell)

`BlackHole.mdx`, `Boomnl.mdx`, `DarkBreathDamage.mdx`, `Demonfilth.mdx`, `DivineRing.mdx`, `Enchant.MDX`, `HeroNarutoS4Effect.mdx`, `LasercannonfinalRED.mdx`, `LavaBreathDamage.mdx`, `MusicCast.mdx`, `SephBoom.mdx`, `babyface.mdx`

### Emitter-dominant hybrids (mesh is a token billboard)

`BlackHole1.mdx`, `BloodBreathStream.mdx`, `Flash.mdx`, `HeroCloudKFKSword.mdx`, `HeroEVA01S2.mdx`, `HeroRaichuS3.mdx`, `HolyAwakening.mdx`, `OblivionAura.MDX`, `SonicBreathStream.mdx`, `SuperShinyThingy.mdx`, `flamessmoke.mdx`, `frostnova.mdx`, `gx.mdx`, `gxhuge.mdx`, `heroluffeattack.mdx`

## Model-value forms in the object data

| form | fields | meaning |
|---|---:|---|
| `blizzard-stock` | 1122 | path contains `\` — a Blizzard asset, NOT in this repo (licensing, not conversion) |
| `map-imported` | 288 | bare `name.mdx|.mdl` — file is in `raw/`, matched case- and extension-insensitively |
| `invisible` | 250 | blank / `none.mdl` — DELIBERATELY invisible, a real WC3 idiom. Do not make these visible. |
| `lightning-id` | 38 | 4 chars — a `Lightning.slk` beam id, there is no model |

## Per-model detail

| model | class | geosets/tris | PRE2 | RIBB | tracked | lights | refs | glb bytes |
|---|---|---|---:|---:|---:|---:|---:|---:|
| `DivineRing.mdx` | pure-emitter | 0/0 | 20 | 0 | 0 | 0 | 4 | 1020 |
| `EarthTornado2.mdx` | mesh-and-emitter-hybrid | 3/114 | 14 | 0 | 0 | 0 | 7 | 28868 |
| `HolyAwakening.mdx` | emitter-dominant-hybrid | 2/36 | 6 | 8 | 3 | 1 | 5 | 20484 |
| `LightningTornado.mdx` | mesh-and-emitter-hybrid | 3/114 | 14 | 0 | 0 | 0 | 4 | 42928 |
| `AquaSpikeVersion2.mdx` | mesh-and-emitter-hybrid | 1/60 | 12 | 0 | 1 | 1 | 2 | 13292 |
| `BlackHole.mdx` | pure-emitter | 0/0 | 7 | 2 | 0 | 1 | 4 | 5848 |
| `LasercannonfinalRED.mdx` | pure-emitter | 0/0 | 8 | 0 | 0 | 0 | 1 | 288 |
| `Meteor.mdx` | mesh-and-emitter-hybrid | 7/158 | 8 | 0 | 2 | 1 | 5 | 41456 |
| `SephBoom.mdx` | pure-emitter | 0/0 | 7 | 0 | 2 | 0 | 0 | — |
| `HeroNarutoS4Effect.mdx` | pure-emitter | 0/0 | 6 | 0 | 1 | 0 | 1 | 1916 |
| `HeroSasuke.mdx` | mesh-and-emitter-hybrid | 3/998 | 4 | 2 | 0 | 0 | 1 | 272708 |
| `SuperShinyThingy.mdx` | emitter-dominant-hybrid | 6/44 | 3 | 3 | 0 | 0 | 5 | 50580 |
| `Boomnl.mdx` | pure-emitter | 0/0 | 5 | 0 | 0 | 1 | 4 | 288 |
| `Demonfilth.mdx` | pure-emitter | 0/0 | 5 | 0 | 0 | 0 | 1 | 288 |
| `Enchant.MDX` | pure-emitter | 0/0 | 5 | 0 | 5 | 0 | 1 | 5536 |
| `NetherStrike.mdx` | mesh-and-emitter-hybrid | 5/414 | 5 | 0 | 5 | 0 | 2 | 113360 |
| `gumdam.mdx` | mesh-and-emitter-hybrid | 5/490 | 5 | 0 | 4 | 0 | 1 | 246404 |
| `DeathWave.mdx` | mesh-and-emitter-hybrid | 2/66 | 1 | 3 | 1 | 0 | 4 | 22800 |
| `FireBlast.mdx` | mesh-and-emitter-hybrid | 1/248 | 4 | 0 | 0 | 0 | 2 | 18900 |
| `HeroShana.mdx` | mesh-and-emitter-hybrid | 3/1504 | 3 | 1 | 0 | 0 | 2 | 237756 |
| `LuBu.mdx` | mesh-and-emitter-hybrid | 3/1547 | 3 | 1 | 3 | 0 | 1 | 574960 |
| `SD2.MDX` | mesh-and-emitter-hybrid | 4/836 | 0 | 4 | 0 | 0 | 3 | 264416 |
| `flamessmoke.mdx` | emitter-dominant-hybrid | 1/4 | 4 | 0 | 0 | 1 | 5 | 3224 |
| `frostnova.mdx` | emitter-dominant-hybrid | 1/14 | 4 | 0 | 4 | 0 | 0 | 3492 |
| `ye-wuqi1.MDX` | mesh-and-emitter-hybrid | 2/890 | 3 | 1 | 0 | 0 | 1 | 213892 |
| `1hswd_01.mdx` | mesh-and-emitter-hybrid | 2/328 | 3 | 0 | 0 | 0 | 1 | 41524 |
| `BlackHole1.mdx` | emitter-dominant-hybrid | 3/12 | 3 | 0 | 3 | 0 | 2 | 33652 |
| `BloodBreathStream.mdx` | emitter-dominant-hybrid | 1/4 | 3 | 0 | 0 | 1 | 3 | 3236 |
| `Darkraor.mdx` | mesh-and-emitter-hybrid | 3/129 | 3 | 0 | 0 | 0 | 4 | 48860 |
| `HeroCloudStrife.mdx` | mesh-and-emitter-hybrid | 3/1986 | 2 | 1 | 0 | 0 | 1 | 376016 |
| `HeroHimuraKenshin.mdx` | mesh-and-emitter-hybrid | 6/596 | 2 | 1 | 0 | 0 | 2 | 299704 |
| `HeroIchigo.mdx` | mesh-and-emitter-hybrid | 8/2075 | 1 | 2 | 0 | 0 | 2 | 384260 |
| `HeroMusashiMiyamoto.mdx` | mesh-and-emitter-hybrid | 5/1320 | 1 | 2 | 0 | 0 | 5 | 272704 |
| `HeroSaber.mdx` | mesh-and-emitter-hybrid | 5/1698 | 2 | 1 | 0 | 0 | 6 | 264544 |
| `LinaInvers.mdx` | mesh-and-emitter-hybrid | 3/812 | 3 | 0 | 0 | 0 | 2 | 219000 |
| `MusicCast.mdx` | pure-emitter | 0/0 | 2 | 1 | 1 | 0 | 0 | — |
| `RenaRyugu2.mdx` | mesh-and-emitter-hybrid | 5/1698 | 2 | 1 | 0 | 0 | 2 | 229788 |
| `SonicBreathStream.mdx` | emitter-dominant-hybrid | 1/4 | 3 | 0 | 0 | 1 | 1 | 3420 |
| `WindMissle.mdx` | mesh-and-emitter-hybrid | 2/66 | 0 | 3 | 0 | 0 | 2 | 16772 |
| `herofate.mdx` | mesh-and-emitter-hybrid | 8/2372 | 2 | 1 | 0 | 0 | 1 | 285116 |
| `niya.mdx` | mesh-and-emitter-hybrid | 6/2470 | 2 | 1 | 0 | 0 | 2 | 295076 |
| `Flash.mdx` | emitter-dominant-hybrid | 3/8 | 2 | 0 | 0 | 1 | 1 | 7224 |
| `HeroEVA01S2.mdx` | emitter-dominant-hybrid | 2/22 | 2 | 0 | 1 | 0 | 3 | 5384 |
| `HeroGirl.mdx` | mesh-and-emitter-hybrid | 4/1411 | 0 | 2 | 0 | 0 | 2 | 270296 |
| `HeroHanzouHattori.mdx` | mesh-and-emitter-hybrid | 5/729 | 1 | 1 | 0 | 0 | 1 | 261676 |
| `HeroHehi.mdx` | mesh-and-emitter-hybrid | 5/1320 | 1 | 1 | 0 | 0 | 2 | 236348 |
| `HeroKunoichi.mdx` | mesh-and-emitter-hybrid | 4/1411 | 0 | 2 | 0 | 0 | 3 | 263416 |
| `HeroMiku.MDx` | mesh-and-emitter-hybrid | 7/2070 | 2 | 0 | 0 | 0 | 1 | 552904 |
| `HeroOichi.mdx` | mesh-and-emitter-hybrid | 3/1664 | 2 | 0 | 0 | 0 | 1 | 232140 |
| `HeroRaichuS3.mdx` | emitter-dominant-hybrid | 2/22 | 2 | 0 | 2 | 0 | 1 | 5384 |
| `HeroSamanosukeAkechi.mdx` | mesh-and-emitter-hybrid | 3/1172 | 1 | 1 | 0 | 0 | 0 | — |
| `HeroSephiroth.mdx` | mesh-and-emitter-hybrid | 4/664 | 1 | 1 | 0 | 0 | 2 | 266744 |
| `HeroToshiieMaeda.mdx` | mesh-and-emitter-hybrid | 4/1151 | 1 | 1 | 0 | 0 | 1 | 244636 |
| `HeroXelloss.MDX` | mesh-and-emitter-hybrid | 3/947 | 2 | 0 | 0 | 0 | 1 | 231572 |
| `Herokyo.mdx` | mesh-and-emitter-hybrid | 4/836 | 1 | 1 | 0 | 0 | 1 | 261768 |
| `Lightningnova.mdx` | mesh-and-emitter-hybrid | 3/64 | 2 | 0 | 1 | 0 | 4 | 18260 |
| `MinitypeFlame.MDX` | mesh-and-emitter-hybrid | 3/126 | 2 | 0 | 2 | 0 | 2 | 19356 |
| `Sesshomaru.mdx` | mesh-and-emitter-hybrid | 4/576 | 1 | 1 | 0 | 0 | 2 | 240964 |
| `Tectonicfury.mdx` | mesh-and-emitter-hybrid | 2/68 | 2 | 0 | 2 | 0 | 2 | 12360 |
| `cloud.mdx` | mesh-and-emitter-hybrid | 6/3282 | 1 | 1 | 0 | 0 | 2 | 757132 |
| `gx.mdx` | emitter-dominant-hybrid | 3/26 | 1 | 1 | 1 | 1 | 2 | 13968 |
| `gxhuge.mdx` | emitter-dominant-hybrid | 3/26 | 1 | 1 | 1 | 1 | 1 | 13980 |
| `ma.mdx` | mesh-and-emitter-hybrid | 2/708 | 2 | 0 | 0 | 0 | 1 | 309060 |
| `mfls.mdx` | mesh-and-emitter-hybrid | 2/1606 | 0 | 2 | 0 | 0 | 3 | 260648 |
| `negi.mdx` | mesh-and-emitter-hybrid | 8/861 | 2 | 0 | 0 | 0 | 2 | 243316 |
| `Bladestorm_SwordEffect.mdx` | mesh-and-emitter-hybrid | 4/150 | 1 | 0 | 0 | 0 | 2 | 35164 |
| `Bulbasaur.mdx` | mesh-and-emitter-hybrid | 3/250 | 1 | 0 | 1 | 0 | 2 | 205900 |
| `DarkBreathDamage.mdx` | pure-emitter | 0/0 | 1 | 0 | 0 | 0 | 3 | 288 |
| `HeroBuu.mdx` | mesh-and-emitter-hybrid | 2/596 | 1 | 0 | 0 | 0 | 7 | 216392 |
| `HeroCloudKFKSword.mdx` | emitter-dominant-hybrid | 1/4 | 1 | 0 | 0 | 0 | 2 | 13328 |
| `HeroRider.mdx` | mesh-and-emitter-hybrid | 4/1211 | 1 | 0 | 0 | 0 | 2 | 186564 |
| `HeroRyuk.mdx` | mesh-and-emitter-hybrid | 4/1050 | 1 | 0 | 0 | 0 | 3 | 189724 |
| `LavaBreathDamage.mdx` | pure-emitter | 0/0 | 1 | 0 | 0 | 0 | 1 | 288 |
| `Magical_Sword.mdx` | mesh-and-emitter-hybrid | 1/571 | 1 | 0 | 0 | 0 | 6 | 26704 |
| `OblivionAura.MDX` | emitter-dominant-hybrid | 3/20 | 1 | 0 | 0 | 0 | 2 | 25224 |
| `babyface.mdx` | pure-emitter | 0/0 | 1 | 0 | 0 | 0 | 1 | 288 |
| `billy.mdx` | mesh-and-emitter-hybrid | 2/550 | 1 | 0 | 1 | 0 | 1 | 204340 |
| `fox.mdx` | mesh-and-emitter-hybrid | 5/2205 | 1 | 0 | 0 | 0 | 1 | 202840 |
| `fox2.mdx` | mesh-and-emitter-hybrid | 5/2205 | 1 | 0 | 0 | 0 | 1 | 217464 |
| `heroluffeattack.mdx` | emitter-dominant-hybrid | 3/36 | 1 | 0 | 1 | 0 | 1 | 40664 |
| `horse.mdx` | mesh-and-emitter-hybrid | 1/210 | 1 | 0 | 0 | 0 | 2 | 259272 |
| `picacugy.mdx` | mesh-and-emitter-hybrid | 8/770 | 0 | 1 | 0 | 0 | 1 | 171312 |

## Emitter textures actually named by the map

| texture | emitters |
|---|---:|
| `Clouds8x8.blp` | 20 |
| `Flame4.blp` | 20 |
| `Clouds8x8Fire.blp` | 11 |
| `LightningBall.blp` | 11 |
| `firering6.blp` | 10 |
| `Clouds8x8Fade.blp` | 8 |
| `Flare.blp` | 8 |
| `White_64_Foam1.blp` | 6 |
| `Clouds8x8Mod.blp` | 6 |
| `sun.blp` | 6 |
| `RibbonNE1_blue.blp` | 5 |
| `ShockwaveWater1Black.blp` | 5 |
| `Yellow_Glow.blp` | 5 |
| `GenericGlowX.blp` | 5 |
| `CloudSingle.blp` | 5 |
| `Yellow_Star_Dim.blp` | 5 |
| `GenericGlow2b.blp` | 4 |
| `Blue_Glow2.blp` | 4 |
| `BloodWhiteSmall.blp` | 4 |
| `Shockwave10.blp` | 4 |
| `smoke_1.blp` | 3 |
| `Dust3x.blp` | 3 |
| `ShockwaveWater1.blp` | 3 |
| `GenericGlow2c.blp` | 3 |
| `GenericGlow64.blp` | 3 |
| `Zap1.blp` | 3 |
| `Dust5A.blp` | 3 |
| `ping4.blp` | 3 |
| `TeamGlow01.blp` | 3 |
| `GenericGlowX_Mod2.blp` | 2 |
| `star5tga.blp` | 2 |
| `star2.blp` | 2 |
| `TjLeaves.blp` | 2 |
| `LavaLump2.blp` | 2 |
| `Yellow_Star.blp` | 2 |
| `star6.blp` | 2 |
| `Shockwave1White.blp` | 2 |
| `Energy1.blp` | 2 |
| `MusicCast.blp` | 2 |
| `Clouds8x8Grey.blp` | 2 |
| `Star8.blp` | 2 |
| `WaterWake3.blp` | 1 |
| `AuraRune7Green.blp` | 1 |
| `Demon_Rune2.blp` | 1 |
| `Leaf.blp` | 1 |
| `Green_Star.blp` | 1 |
| `star4_32.blp` | 1 |
| `Star8b.blp` | 1 |
| `HeroCloudKFKSword.blp` | 1 |
| `HeroEVA01Effect.blp` | 1 |
| `Dust3_Thunder.blp` | 1 |
| `Shockwave4.blp` | 1 |
| `Sparkle_Anim.blp` | 1 |
| `CampaignOrcHair.blp` | 1 |
| `Dust5ABlack.blp` | 1 |
| `clouds_anim1_bw.blp` | 1 |
| `CartoonCloud.blp` | 1 |
| `Shockwave1.blp` | 1 |
| `GenericGlowFaded.blp` | 1 |
| `Zap1b.blp` | 1 |
| `HitBase.blp` | 1 |
| `DeathScream.blp` | 1 |
| `Ghost1.blp` | 1 |
| `Dust3.blp` | 1 |
| `rock64.blp` | 1 |
| `Skull1.blp` | 1 |
| `Shockwave4white.blp` | 1 |
| `pixies1.blp` | 1 |
| `NightElfFemaleEyeGlow1.blp` | 1 |
| `RockParticle.blp` | 1 |
| `babyface.blp` | 1 |
| `Blue_Star2.blp` | 1 |
| `ManaDrainIn.blp` | 1 |
| `TjShockwave2.blp` | 1 |
| `Star8c.blp` | 1 |
| `Clouds8x8Black.blp` | 1 |

## Notes

- godie-aquaspikeversion2-p9: negative emissionRate -25.0
- godie-aquaspikeversion2-p9: animated tracks present: KP2E — a static emitter cannot reproduce these
- godie-aquaspikeversion2-p10: negative speed (inward emission) — direction is part of the effect, do not fold to magnitude
- godie-blackhole-p2: negative speed (inward emission) — direction is part of the effect, do not fold to magnitude
- godie-blackhole1-p0: emissionRate 0 in the fixed block; the real rate is the KP2E track (peak 50.0)
- godie-blackhole1-p0: animated tracks present: KP2E — a static emitter cannot reproduce these
- godie-blackhole1-p1: negative speed (inward emission) — direction is part of the effect, do not fold to magnitude
- godie-blackhole1-p1: emissionRate 0 in the fixed block; the real rate is the KP2E track (peak 50.0)
- godie-blackhole1-p1: animated tracks present: KP2E — a static emitter cannot reproduce these
- godie-blackhole1-p2: emissionRate 0 in the fixed block; the real rate is the KP2E track (peak 1000.0)
- godie-blackhole1-p2: animated tracks present: KP2E — a static emitter cannot reproduce these
- godie-bulbasaur-p0: emissionRate 0 in the fixed block; the real rate is the KP2E track (peak 10.0)
- godie-bulbasaur-p0: animated tracks present: KP2E — a static emitter cannot reproduce these
- godie-deathwave-p0: emissionRate 0 in the fixed block; the real rate is the KP2E track (peak 236.7)
- godie-deathwave-p0: zero emitter size in the fixed block; the whole shape is in the KP2W/KP2N tracks
- godie-deathwave-p0: animated tracks present: KP2E,KP2N,KP2W — a static emitter cannot reproduce these
- godie-demonfilth-p0: latitude 555.0deg exceeds a hemisphere — an authoring artefact (this map's author fills unused fields with 555/900); WC3 renders it as full spread. Clamp to 180.
- godie-demonfilth-p1: latitude 555.0deg exceeds a hemisphere — an authoring artefact (this map's author fills unused fields with 555/900); WC3 renders it as full spread. Clamp to 180.
- godie-demonfilth-p2: latitude 555.0deg exceeds a hemisphere — an authoring artefact (this map's author fills unused fields with 555/900); WC3 renders it as full spread. Clamp to 180.
- godie-demonfilth-p3: latitude 555.0deg exceeds a hemisphere — an authoring artefact (this map's author fills unused fields with 555/900); WC3 renders it as full spread. Clamp to 180.
- godie-demonfilth-p4: latitude 555.0deg exceeds a hemisphere — an authoring artefact (this map's author fills unused fields with 555/900); WC3 renders it as full spread. Clamp to 180.
- godie-enchant-p0: animated tracks present: KP2E — a static emitter cannot reproduce these
- godie-enchant-p1: animated tracks present: KP2E — a static emitter cannot reproduce these
- godie-enchant-p2: animated tracks present: KP2E — a static emitter cannot reproduce these
- godie-enchant-p3: animated tracks present: KP2E — a static emitter cannot reproduce these
- godie-enchant-p4: animated tracks present: KP2E — a static emitter cannot reproduce these
- godie-fireblast-p3: negative speed (inward emission) — direction is part of the effect, do not fold to magnitude
- godie-herocloudstrife-p1: latitude 200.0deg exceeds a hemisphere — an authoring artefact (this map's author fills unused fields with 555/900); WC3 renders it as full spread. Clamp to 180.
- godie-heroeva01s2-p0: emissionRate 0 in the fixed block; the real rate is the KP2E track (peak 31.5)
- godie-heroeva01s2-p0: animated tracks present: KP2E — a static emitter cannot reproduce these
- godie-heronarutos4effect-p5: animated tracks present: KP2E,KP2S — a static emitter cannot reproduce these
- godie-heroraichus3-p0: emissionRate 0 in the fixed block; the real rate is the KP2E track (peak 31.5)
- godie-heroraichus3-p0: animated tracks present: KP2E — a static emitter cannot reproduce these
- godie-heroraichus3-p1: animated tracks present: KP2E — a static emitter cannot reproduce these
- HeroSamanosukeAkechi.mdx: no models_report entry — mesh scale defaulted to 0.02778
- godie-holyawakening-p0: emissionRate 0 in the fixed block; the real rate is the KP2E track (peak 40.0)
- godie-holyawakening-p0: animated tracks present: KP2E — a static emitter cannot reproduce these
- godie-holyawakening-p1: emissionRate 0 in the fixed block; the real rate is the KP2E track (peak 50.0)
- godie-holyawakening-p1: animated tracks present: KP2E — a static emitter cannot reproduce these
- godie-holyawakening-p3: emissionRate 0 in the fixed block; the real rate is the KP2E track (peak 26.3)
- godie-holyawakening-p3: animated tracks present: KP2E,KP2S — a static emitter cannot reproduce these
- godie-lightningnova-p0: latitude 500.0deg exceeds a hemisphere — an authoring artefact (this map's author fills unused fields with 555/900); WC3 renders it as full spread. Clamp to 180.
- godie-lightningnova-p1: animated tracks present: KP2N,KP2W — a static emitter cannot reproduce these
- godie-lubu-p0: emissionRate 0 in the fixed block; the real rate is the KP2E track (peak 60.0)
- godie-lubu-p0: lifespan 0 — particles die on the frame they spawn
- godie-lubu-p0: animated tracks present: KP2E — a static emitter cannot reproduce these
- godie-lubu-p1: emissionRate 0 in the fixed block; the real rate is the KP2E track (peak 10.0)
- godie-lubu-p1: animated tracks present: KP2E — a static emitter cannot reproduce these
- godie-lubu-p2: emissionRate 0 in the fixed block; the real rate is the KP2E track (peak 10.0)
- godie-lubu-p2: animated tracks present: KP2E — a static emitter cannot reproduce these
- godie-meteor-p3: emissionRate 0 in the fixed block; the real rate is the KP2E track (peak 90.0)
- godie-meteor-p3: animated tracks present: KP2E — a static emitter cannot reproduce these
- godie-meteor-p5: negative emissionRate -22.0
- godie-meteor-p5: animated tracks present: KP2E — a static emitter cannot reproduce these
- godie-meteor-p7: negative speed (inward emission) — direction is part of the effect, do not fold to magnitude
- godie-minitypeflame-p0: animated tracks present: KP2E — a static emitter cannot reproduce these
- godie-minitypeflame-p1: animated tracks present: KP2E — a static emitter cannot reproduce these
- MusicCast.mdx: no models_report entry — mesh scale defaulted to 0.02778
- godie-musiccast-p1: emissionRate 0 in the fixed block; the real rate is the KP2E track (peak 50.0)
- godie-musiccast-p1: animated tracks present: KP2E — a static emitter cannot reproduce these
- godie-netherstrike-p0: emissionRate 0 in the fixed block; the real rate is the KP2E track (peak 30.0)
- godie-netherstrike-p0: animated tracks present: KP2E,KP2N,KP2W — a static emitter cannot reproduce these
- godie-netherstrike-p1: emissionRate 0 in the fixed block; the real rate is the KP2E track (peak 20.0)
- godie-netherstrike-p1: animated tracks present: KP2E,KP2N,KP2W — a static emitter cannot reproduce these
- godie-netherstrike-p2: emissionRate 0 in the fixed block; the real rate is the KP2E track (peak 20.0)
- godie-netherstrike-p2: animated tracks present: KP2E — a static emitter cannot reproduce these
- godie-netherstrike-p3: emissionRate 0 in the fixed block; the real rate is the KP2E track (peak 15.0)
- godie-netherstrike-p3: animated tracks present: KP2E — a static emitter cannot reproduce these
- godie-netherstrike-p4: emissionRate 0 in the fixed block; the real rate is the KP2E track (peak 10.0)
- godie-netherstrike-p4: animated tracks present: KP2E — a static emitter cannot reproduce these
- SephBoom.mdx: no models_report entry — mesh scale defaulted to 0.02778
- godie-sephboom-p0: latitude 900.0deg exceeds a hemisphere — an authoring artefact (this map's author fills unused fields with 555/900); WC3 renders it as full spread. Clamp to 180.
- godie-sephboom-p3: latitude 900.0deg exceeds a hemisphere — an authoring artefact (this map's author fills unused fields with 555/900); WC3 renders it as full spread. Clamp to 180.
- godie-sephboom-p4: animated tracks present: KP2E,KP2N,KP2S,KP2W — a static emitter cannot reproduce these
- godie-sephboom-p5: animated tracks present: KP2E,KP2N,KP2S,KP2W — a static emitter cannot reproduce these
- godie-supershinythingy-p0: negative speed (inward emission) — direction is part of the effect, do not fold to magnitude
- godie-tectonicfury-p0: animated tracks present: KP2S — a static emitter cannot reproduce these
- godie-tectonicfury-p1: negative emissionRate -10.4167
- godie-tectonicfury-p1: animated tracks present: KP2E — a static emitter cannot reproduce these
- godie-billy-p0: emissionRate 0 in the fixed block; the real rate is the KP2E track (peak 100.0)
- godie-billy-p0: latitude 500.0deg exceeds a hemisphere — an authoring artefact (this map's author fills unused fields with 555/900); WC3 renders it as full spread. Clamp to 180.
- godie-billy-p0: animated tracks present: KP2E — a static emitter cannot reproduce these
- godie-frostnova-p0: emissionRate 0 in the fixed block; the real rate is the KP2E track (peak 75.0)
- godie-frostnova-p0: animated tracks present: KP2E,KP2S — a static emitter cannot reproduce these
- godie-frostnova-p1: animated tracks present: KP2E,KP2S — a static emitter cannot reproduce these
- godie-frostnova-p2: animated tracks present: KP2E,KP2S — a static emitter cannot reproduce these
- godie-frostnova-p3: animated tracks present: KP2E — a static emitter cannot reproduce these
- godie-gumdam-p0: animated tracks present: KP2E — a static emitter cannot reproduce these
- godie-gumdam-p2: negative emissionRate -15.4
- godie-gumdam-p2: animated tracks present: KP2E — a static emitter cannot reproduce these
- godie-gumdam-p3: animated tracks present: KP2E,KP2N,KP2W — a static emitter cannot reproduce these
- godie-gumdam-p4: animated tracks present: KP2N — a static emitter cannot reproduce these
- godie-gx-p0: emissionRate 0 in the fixed block; the real rate is the KP2E track (peak 50.0)
- godie-gx-p0: animated tracks present: KP2E — a static emitter cannot reproduce these
- godie-gxhuge-p0: emissionRate 0 in the fixed block; the real rate is the KP2E track (peak 50.0)
- godie-gxhuge-p0: animated tracks present: KP2E — a static emitter cannot reproduce these
- godie-heroluffeattack-p0: emissionRate 0 in the fixed block; the real rate is the KP2E track (peak 60.0)
- godie-heroluffeattack-p0: animated tracks present: KP2E — a static emitter cannot reproduce these
