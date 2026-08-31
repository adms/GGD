# WC3 particle extraction — GoDieEX22s

- models scanned: 129; models with emitters/events: 90
- vfx@1 docs (PRE2): 228; ribbon@1 docs (RIBB): 54; total docs: 282
- hero models with ambient bindings: 4 (content/config/ambient-vfx.json)
- map-archive textures copied to content/assets/textures/particles/wc3/: 8
- transparent bright backdrops neutralized for additive-safe composition: 2
- Blizzard stock textures substituted with CC0 sprites: 71
- scale: per-model `scale_factor` from models_report.json (heroes normalized to 1.7 world units tall; props 1/36); applied to width/speed/gravity/segmentScaling/ribbon heights
- latitude found stored in DEGREES in this map's v800 files (values 0..180) — used as angleDeg directly, clamped [1,180]
- WC3 `variation` treated as a fraction of speed; negative speeds (inward shockwaves) folded to magnitude
- `Width` x `Length` are the FULL sides of the emission rectangle (particles spawn over +/- half of each about the node), so `emitter.radius` = max(Width, Length) / 2 * scale — the disc that bounds that rectangle. Proven against the binary in extract_particles.emission_disc_radius(); identical to w3xEmitterToVfxDoc() in apps/client/src/render/vfx/w3xEmitter.ts
- burst `burstCount` = emissionRate * density (density=1.0); 1.0 is faithful. Runtime particle budget lives in render/vfx/emitterBudget.ts and is NOT baked in here

## Per-model emitters

| model | hero | doc | kind | src name | blend | ambient | anim-gated | anchorBone | texture |
|---|---|---|---|---|---|---|---|---|---|
| 1hswd_01.mdx |  | godie-1hswd-01-p0 | pre2 | Particle_0 | additive |  |  | bone_b9 | assets/textures/particles/smoke_01.png |
| 1hswd_01.mdx |  | godie-1hswd-01-p1 | pre2 | Particle_1 | additive |  |  | bone_b10 | assets/textures/particles/smoke_01.png |
| 1hswd_01.mdx |  | godie-1hswd-01-p2 | pre2 | Particle_2 | additive |  |  | bone_b11 | assets/textures/particles/smoke_01.png |
| AquaSpikeVersion2.mdx |  | godie-aquaspikeversion2-p0 | pre2 | BlizParticle04cone01 | additive |  |  |  | assets/textures/particles/light_02.png |
| AquaSpikeVersion2.mdx |  | godie-aquaspikeversion2-p1 | pre2 | BlizParticle02burst1 | additive |  |  |  | assets/textures/particles/light_02.png |
| AquaSpikeVersion2.mdx |  | godie-aquaspikeversion2-p2 | pre2 | BlizParticle02burst02white | additive |  |  |  | assets/textures/particles/light_02.png |
| AquaSpikeVersion2.mdx |  | godie-aquaspikeversion2-p3 | pre2 | BlizParticle02wake end | additive |  |  |  | assets/textures/particles/circle_02.png |
| AquaSpikeVersion2.mdx |  | godie-aquaspikeversion2-p4 | pre2 | BlizParticle02burst02whiteend | additive |  |  |  | assets/textures/particles/smoke_07.png |
| AquaSpikeVersion2.mdx |  | godie-aquaspikeversion2-p5 | pre2 | BlizParticle02burst02fire | additive |  |  |  | assets/textures/particles/smoke_07.png |
| AquaSpikeVersion2.mdx |  | godie-aquaspikeversion2-p6 | pre2 | BlizParticle02burst2 | additive |  |  |  | assets/textures/particles/trace_03.png |
| AquaSpikeVersion2.mdx |  | godie-aquaspikeversion2-p7 | pre2 | BlizParticle02burst02white02 | additive |  |  |  | assets/textures/particles/trace_03.png |
| AquaSpikeVersion2.mdx |  | godie-aquaspikeversion2-p8 | pre2 | BlizParticle02burst02whiteend02 | additive |  |  |  | assets/textures/particles/trace_03.png |
| AquaSpikeVersion2.mdx |  | godie-aquaspikeversion2-p9 | pre2 | BlizParticle02 | additive |  |  |  | assets/textures/particles/trace_03.png |
| AquaSpikeVersion2.mdx |  | godie-aquaspikeversion2-p10 | pre2 | BlizParticle08shockwaves01 | additive |  |  |  | assets/textures/particles/light_02.png |
| AquaSpikeVersion2.mdx |  | godie-aquaspikeversion2-p11 | pre2 | BlizParticle03explodering | additive |  |  |  | assets/textures/particles/trace_03.png |
| BlackHole.mdx |  | godie-blackhole-p0 | pre2 | DeathFlash | additive |  | Y |  | assets/textures/particles/wc3/blue-glow2.png |
| BlackHole.mdx |  | godie-blackhole-p1 | pre2 | Shockwave | alpha |  | Y |  | assets/textures/particles/circle_04.png |
| BlackHole.mdx |  | godie-blackhole-p2 | pre2 | BlizParticle08shockwaves01 | additive |  | Y |  | assets/textures/particles/circle_02.png |
| BlackHole.mdx |  | godie-blackhole-p3 | pre2 | BlachHole | modulate |  |  |  | assets/textures/particles/light_03.png |
| BlackHole.mdx |  | godie-blackhole-p4 | pre2 | Shockwave2 | alpha |  |  |  | assets/textures/particles/circle_04.png |
| BlackHole.mdx |  | godie-blackhole-p5 | pre2 | Energy1 | additive |  |  |  | assets/textures/particles/wc3/blue-glow2.png |
| BlackHole.mdx |  | godie-blackhole-p6 | pre2 | Energy2 | additive |  |  |  | assets/textures/particles/fire_02.png |
| BlackHole.mdx |  | godie-blackhole-r0 | ribbon | BlizRibbon01 | additive |  |  | Dummy01 | assets/textures/particles/wc3/blue-glow2.png |
| BlackHole.mdx |  | godie-blackhole-r1 | ribbon | BlizRibbon02 | additive |  |  | Dummy04 | assets/textures/particles/wc3/blue-glow2.png |
| BlackHole1.mdx |  | godie-blackhole1-p0 | pre2 | BlizParticle01 | additive |  |  |  | assets/textures/particles/star_07.png |
| BlackHole1.mdx |  | godie-blackhole1-p1 | pre2 | BlizParticle02 | additive |  |  |  | assets/textures/particles/star_07.png |
| BlackHole1.mdx |  | godie-blackhole1-p2 | pre2 | BlizParticle04 | additive |  |  |  | assets/textures/particles/star_08.png |
| Bladestorm_SwordEffect.mdx |  | godie-bladestorm-swordeffect-p0 | pre2 | BlizParticle03tubespinner | additive |  |  |  | assets/textures/particles/light_03.png |
| BloodBreathStream.mdx |  | godie-bloodbreathstream-p0 | pre2 | BlizParticle FLAME 1 | alpha |  |  | Dummy02 | assets/textures/particles/smoke_04.png |
| BloodBreathStream.mdx |  | godie-bloodbreathstream-p1 | pre2 | BlizParticle FLAME 02 | alpha |  |  | Dummy02 | assets/textures/particles/smoke_04.png |
| BloodBreathStream.mdx |  | godie-bloodbreathstream-p2 | pre2 | BlizParticle FLAME 03redglow | alpha |  |  | Dummy02 | assets/textures/particles/smoke_04.png |
| Boomnl.mdx |  | godie-boomnl-p0 | pre2 | BlizParticle01 | additive |  |  |  | assets/textures/particles/fire_02.png |
| Boomnl.mdx |  | godie-boomnl-p1 | pre2 | BlizParticle02 | additive |  |  |  | assets/textures/particles/fire_02.png |
| Boomnl.mdx |  | godie-boomnl-p2 | pre2 | BlizParticle03 | alpha |  |  |  | assets/textures/particles/fire_02.png |
| Boomnl.mdx |  | godie-boomnl-p3 | pre2 | BlizParticle04 | alpha |  |  |  | assets/textures/particles/fire_02.png |
| Boomnl.mdx |  | godie-boomnl-p4 | pre2 | BlizParticle05 | additive |  |  |  | assets/textures/particles/fire_02.png |
| Bulbasaur.mdx | Y | godie-bulbasaur-p0 | pre2 | BlizParticle01 | additive |  |  | bone_root | assets/textures/particles/star_08.png |
| DarkBreathDamage.mdx |  | godie-darkbreathdamage-p0 | pre2 | BlizParticle05 | modulate |  |  |  | assets/textures/particles/smoke_09.png |
| Darkraor.mdx |  | godie-darkraor-p0 | pre2 | BlizParticle01 | alpha |  | Y |  | assets/textures/particles/smoke_04.png |
| Darkraor.mdx |  | godie-darkraor-p1 | pre2 | BlizParticle07 | additive |  | Y |  | assets/textures/particles/smoke_07.png |
| Darkraor.mdx |  | godie-darkraor-p2 | pre2 | Trail | alpha |  |  | Bone_Rocket | assets/textures/particles/smoke_07.png |
| DeathWave.mdx |  | godie-deathwave-p0 | pre2 | BlizParticle01 | additive |  |  |  | assets/textures/particles/light_02.png |
| DeathWave.mdx |  | godie-deathwave-r0 | ribbon | BlizRibbon02 | additive |  |  | Dummy06 | assets/textures/particles/light_02.png |
| DeathWave.mdx |  | godie-deathwave-r1 | ribbon | BlizRibbon01 | additive |  |  | Dummy01x | assets/textures/particles/light_02.png |
| DeathWave.mdx |  | godie-deathwave-r2 | ribbon | BlizRibbon03 | additive |  |  | Dummy10 | assets/textures/particles/light_02.png |
| Demonfilth.mdx |  | godie-demonfilth-p0 | pre2 | Shockwave | alpha |  | Y |  | assets/textures/particles/magic_01.png |
| Demonfilth.mdx |  | godie-demonfilth-p1 | pre2 | Rune | alpha |  | Y |  | assets/textures/particles/smoke_07.png |
| Demonfilth.mdx |  | godie-demonfilth-p2 | pre2 | Rune2 | alpha |  | Y |  | assets/textures/particles/smoke_07.png |
| Demonfilth.mdx |  | godie-demonfilth-p3 | pre2 | Light2 | additive |  | Y |  | assets/textures/particles/magic_01.png |
| Demonfilth.mdx |  | godie-demonfilth-p4 | pre2 | Rune2 | alpha |  | Y |  | assets/textures/particles/smoke_07.png |
| DivineRing.mdx |  | godie-divinering-p0 | pre2 | BlizParticle02 | additive |  |  | Point01 | assets/textures/particles/fire_01.png |
| DivineRing.mdx |  | godie-divinering-p1 | pre2 | BlizParticle03 | additive |  |  | Point01 | assets/textures/particles/fire_01.png |
| DivineRing.mdx |  | godie-divinering-p2 | pre2 | BlizParticle04 | additive |  |  | Point01 | assets/textures/particles/fire_01.png |
| DivineRing.mdx |  | godie-divinering-p3 | pre2 | BlizParticle05 | additive |  |  | Point01 | assets/textures/particles/fire_01.png |
| DivineRing.mdx |  | godie-divinering-p4 | pre2 | BlizParticle06 | additive |  |  | Point01 | assets/textures/particles/fire_01.png |
| DivineRing.mdx |  | godie-divinering-p5 | pre2 | BlizParticle02 | additive |  |  | BlizParticle02 | assets/textures/particles/fire_01.png |
| DivineRing.mdx |  | godie-divinering-p6 | pre2 | BlizParticle03 | additive |  |  | BlizParticle03 | assets/textures/particles/fire_01.png |
| DivineRing.mdx |  | godie-divinering-p7 | pre2 | BlizParticle04 | additive |  |  | BlizParticle04 | assets/textures/particles/fire_01.png |
| DivineRing.mdx |  | godie-divinering-p8 | pre2 | BlizParticle05 | additive |  |  | BlizParticle05 | assets/textures/particles/fire_01.png |
| DivineRing.mdx |  | godie-divinering-p9 | pre2 | BlizParticle06 | additive |  |  | BlizParticle06 | assets/textures/particles/fire_01.png |
| DivineRing.mdx |  | godie-divinering-p10 | pre2 | BlizParticle02_2 | additive |  |  | BlizParticle02 | assets/textures/particles/light_01.png |
| DivineRing.mdx |  | godie-divinering-p11 | pre2 | BlizParticle02_2 | additive |  |  | BlizParticle02_2 | assets/textures/particles/light_03.png |
| DivineRing.mdx |  | godie-divinering-p12 | pre2 | BlizParticle03_2 | additive |  |  | BlizParticle03 | assets/textures/particles/light_01.png |
| DivineRing.mdx |  | godie-divinering-p13 | pre2 | BlizParticle03_2 | additive |  |  | BlizParticle03_2 | assets/textures/particles/light_03.png |
| DivineRing.mdx |  | godie-divinering-p14 | pre2 | BlizParticle04_2 | additive |  |  | BlizParticle04 | assets/textures/particles/light_01.png |
| DivineRing.mdx |  | godie-divinering-p15 | pre2 | BlizParticle04_2 | additive |  |  | BlizParticle04_2 | assets/textures/particles/light_03.png |
| DivineRing.mdx |  | godie-divinering-p16 | pre2 | BlizParticle05_2 | additive |  |  | BlizParticle05 | assets/textures/particles/light_01.png |
| DivineRing.mdx |  | godie-divinering-p17 | pre2 | BlizParticle05_2 | additive |  |  | BlizParticle05_2 | assets/textures/particles/light_03.png |
| DivineRing.mdx |  | godie-divinering-p18 | pre2 | BlizParticle06_2 | additive |  |  | BlizParticle06 | assets/textures/particles/light_01.png |
| DivineRing.mdx |  | godie-divinering-p19 | pre2 | BlizParticle06_2 | additive |  |  | BlizParticle06_2 | assets/textures/particles/light_03.png |
| EarthTornado2.mdx |  | godie-earthtornado2-p0 | pre2 | BlizParticle03tubespinner | additive |  |  |  | assets/textures/particles/light_03.png |
| EarthTornado2.mdx |  | godie-earthtornado2-p1 | pre2 | UNNAMED | additive |  |  | UNNAMED | assets/textures/particles/smoke_07.png |
| EarthTornado2.mdx |  | godie-earthtornado2-p2 | pre2 | UNNAMED | alphaKey |  |  | evilbox42spinerdummy | assets/textures/particles/light_02.png |
| EarthTornado2.mdx |  | godie-earthtornado2-p3 | pre2 | UNNAMED | additive |  |  | evilbox36 | assets/textures/particles/smoke_01.png |
| EarthTornado2.mdx |  | godie-earthtornado2-p4 | pre2 | UNNAMED | additive |  |  | UNNAMED | assets/textures/particles/smoke_07.png |
| EarthTornado2.mdx |  | godie-earthtornado2-p5 | pre2 | UNNAMED | additive |  |  | UNNAMED | assets/textures/particles/smoke_07.png |
| EarthTornado2.mdx |  | godie-earthtornado2-p6 | pre2 | UNNAMED | alphaKey |  |  | evilbox22 | assets/textures/particles/light_02.png |
| EarthTornado2.mdx |  | godie-earthtornado2-p7 | pre2 | UNNAMED | additive |  |  | evilbox39 | assets/textures/particles/smoke_01.png |
| EarthTornado2.mdx |  | godie-earthtornado2-p8 | pre2 | UNNAMED | additive |  |  | UNNAMED | assets/textures/particles/smoke_07.png |
| EarthTornado2.mdx |  | godie-earthtornado2-p9 | pre2 | UNNAMED | alpha |  |  | evilbox40 | assets/textures/particles/light_01.png |
| EarthTornado2.mdx |  | godie-earthtornado2-p10 | pre2 | UNNAMED | additive |  |  | UNNAMED | assets/textures/particles/smoke_07.png |
| EarthTornado2.mdx |  | godie-earthtornado2-p11 | pre2 | UNNAMED | additive |  |  | evilbox42 | assets/textures/particles/smoke_01.png |
| EarthTornado2.mdx |  | godie-earthtornado2-p12 | pre2 | UNNAMED | additive |  |  | UNNAMED | assets/textures/particles/smoke_07.png |
| EarthTornado2.mdx |  | godie-earthtornado2-p13 | pre2 | UNNAMED | additive |  |  | UNNAMED | assets/textures/particles/star_07.png |
| Enchant.MDX |  | godie-enchant-p0 | pre2 | BlizParticle01 | additive |  |  | Dummy01 | assets/textures/particles/flame_03.png |
| Enchant.MDX |  | godie-enchant-p1 | pre2 | BlizParticle02 | additive |  |  | Dummy01 | assets/textures/particles/flame_03.png |
| Enchant.MDX |  | godie-enchant-p2 | pre2 | BlizParticle03 | additive |  |  | Dummy01 | assets/textures/particles/flame_03.png |
| Enchant.MDX |  | godie-enchant-p3 | pre2 | BlizParticle04 | additive |  |  | Dummy01 | assets/textures/particles/flame_03.png |
| Enchant.MDX |  | godie-enchant-p4 | pre2 | BlizParticle05 | additive |  |  | Dummy01 | assets/textures/particles/flame_03.png |
| FireBlast.mdx |  | godie-fireblast-p0 | pre2 | BlizParticle01 | additive |  | Y |  | assets/textures/particles/star_05.png |
| FireBlast.mdx |  | godie-fireblast-p1 | pre2 | BlizParticle02v | additive |  |  |  | assets/textures/particles/star_08.png |
| FireBlast.mdx |  | godie-fireblast-p2 | pre2 | BlizParticle03 | additive |  | Y |  | assets/textures/particles/flame_03.png |
| FireBlast.mdx |  | godie-fireblast-p3 | pre2 | BlizParticle08shockwaves | additive |  | Y |  | assets/textures/particles/circle_02.png |
| Flash.mdx |  | godie-flash-p0 | pre2 | BlizParticle01healtail01 | additive |  |  | Dummy01 | assets/textures/particles/circle_05.png |
| Flash.mdx |  | godie-flash-p1 | pre2 | BlizParticle01healtail03 | additive |  |  | Dummy01 | assets/textures/particles/star_07.png |
| HeroBuu.mdx | Y | godie-herobuu-p0 | pre2 | BlizParticle01death | additive |  | Y | Bone_Head | assets/textures/particles/light_03.png |
| HeroCloudKFKSword.mdx |  | godie-herocloudkfksword-p0 | pre2 | BlizParticle01 | alpha |  |  |  | assets/textures/particles/wc3/herocloudkfksword.png |
| HeroCloudStrife.mdx |  | godie-herocloudstrife-p0 | pre2 | UNNAMED | additive |  | Y | Bone_Chest | assets/textures/particles/star_07.png |
| HeroCloudStrife.mdx |  | godie-herocloudstrife-p1 | pre2 | UNNAMED | additive |  | Y | Bone_Hand_R | assets/textures/particles/star_01.png |
| HeroCloudStrife.mdx |  | godie-herocloudstrife-r0 | ribbon | UNNAMED | additive |  | Y | Bone_Hand_R | assets/textures/particles/wc3/ribbonblur1.png |
| HeroEVA01S2.mdx |  | godie-heroeva01s2-p0 | pre2 | BlizParticle01 | alpha |  |  |  | assets/textures/particles/smoke_01.png |
| HeroEVA01S2.mdx |  | godie-heroeva01s2-p1 | pre2 | UNNAMED | additive |  |  |  | assets/textures/particles/wc3/heroeva01effect.png |
| HeroGirl.mdx |  | godie-herogirl-r0 | ribbon | BlizRibbon_R | additive |  | Y | Sword_R | assets/textures/particles/wc3/ribbonblur1.png |
| HeroGirl.mdx |  | godie-herogirl-r1 | ribbon | BlizRibbon_L | additive |  | Y | Sword_L | assets/textures/particles/wc3/ribbonblur1.png |
| HeroHanzouHattori.mdx |  | godie-herohanzouhattori-p0 | pre2 | BlizParticle01 | additive |  | Y |  | assets/textures/particles/flame_03.png |
| HeroHanzouHattori.mdx |  | godie-herohanzouhattori-r0 | ribbon | BlizRibbon01 | additive |  | Y | Sword | assets/textures/particles/wc3/ribbonblur1.png |
| HeroHehi.mdx | Y | godie-herohehi-p0 | pre2 | BlizParticle01 | additive |  | Y |  | assets/textures/particles/flame_03.png |
| HeroHehi.mdx | Y | godie-herohehi-r0 | ribbon | BlizRibbon_R | additive |  | Y | Sword_R | assets/textures/particles/wc3/ribbonblur1.png |
| HeroHimuraKenshin.mdx |  | godie-herohimurakenshin-p0 | pre2 | BlizParticle01 | additive |  | Y |  | assets/textures/particles/flame_03.png |
| HeroHimuraKenshin.mdx |  | godie-herohimurakenshin-p1 | pre2 | BlizParticle03tubespinner | additive |  | Y |  | assets/textures/particles/light_03.png |
| HeroHimuraKenshin.mdx |  | godie-herohimurakenshin-r0 | ribbon | BlizRibbon01 | additive |  | Y | Sword | assets/textures/particles/wc3/ribbonblur1.png |
| HeroIchigo.mdx | Y | godie-heroichigo-p0 | pre2 | UNNAMED | additive |  | Y | bone_handR | assets/textures/particles/smoke_02.png |
| HeroIchigo.mdx | Y | godie-heroichigo-r0 | ribbon | BlizRibbon02 | additive |  | Y | bone_ribbonwan | assets/textures/particles/wc3/ribbonblur1.png |
| HeroIchigo.mdx | Y | godie-heroichigo-r1 | ribbon | BlizRibbon01 | additive |  | Y | bone_ribbon | assets/textures/particles/wc3/ribbonblur1.png |
| HeroKunoichi.mdx |  | godie-herokunoichi-r0 | ribbon | BlizRibbon_R | additive |  | Y | Sword_R | assets/textures/particles/wc3/ribbonblur1.png |
| HeroKunoichi.mdx |  | godie-herokunoichi-r1 | ribbon | BlizRibbon_L | additive |  | Y | Sword_L | assets/textures/particles/wc3/ribbonblur1.png |
| HeroMiku.mdx | Y | godie-heromiku-p0 | pre2 | BlizParticle01 | additive |  | Y |  | assets/textures/particles/circle_01.png |
| HeroMiku.mdx | Y | godie-heromiku-p1 | pre2 | BlizParticle02 | additive |  | Y |  | assets/textures/particles/spark_06.png |
| HeroMusashiMiyamoto.mdx | Y | godie-heromusashimiyamoto-p0 | pre2 | BlizParticle01 | additive |  | Y |  | assets/textures/particles/flame_03.png |
| HeroMusashiMiyamoto.mdx | Y | godie-heromusashimiyamoto-r0 | ribbon | BlizRibbon_R | additive |  | Y | Sword_R | assets/textures/particles/wc3/ribbonblur1.png |
| HeroMusashiMiyamoto.mdx | Y | godie-heromusashimiyamoto-r1 | ribbon | BlizRibbon_L | additive |  | Y | Sword_L | assets/textures/particles/wc3/ribbonblur1.png |
| HeroNarutoS4Effect.mdx |  | godie-heronarutos4effect-p0 | pre2 | KitaFX_Diagonal_1 | additive |  |  | PowerOrb_by_Kitabatake | assets/textures/particles/flare_01.png |
| HeroNarutoS4Effect.mdx |  | godie-heronarutos4effect-p1 | pre2 | KitaFX_Diagonal_1 | additive |  |  | PowerOrb_by_Kitabatake | assets/textures/particles/flare_01.png |
| HeroNarutoS4Effect.mdx |  | godie-heronarutos4effect-p2 | pre2 | KitaFX_Diagonal_2 | additive |  |  | PowerOrb_by_Kitabatake | assets/textures/particles/flare_01.png |
| HeroNarutoS4Effect.mdx |  | godie-heronarutos4effect-p3 | pre2 | KitaFX_Diagonal_2 | additive |  |  | PowerOrb_by_Kitabatake | assets/textures/particles/flare_01.png |
| HeroNarutoS4Effect.mdx |  | godie-heronarutos4effect-p4 | pre2 | KitaFX_Vertical | additive |  |  | PowerOrb_by_Kitabatake | assets/textures/particles/flare_01.png |
| HeroNarutoS4Effect.mdx |  | godie-heronarutos4effect-p5 | pre2 | KitaFX_Death | additive |  |  | PowerOrb_by_Kitabatake | assets/textures/particles/flare_01.png |
| HeroOichi.mdx | Y | godie-herooichi-p0 | pre2 | BlizParticle_R | additive |  | Y | Bone_Hand_R | assets/textures/particles/star_09.png |
| HeroOichi.mdx | Y | godie-herooichi-p1 | pre2 | BlizParticle_L | additive |  | Y | Bone_Hand_L | assets/textures/particles/star_09.png |
| HeroRaichuS3.mdx |  | godie-heroraichus3-p0 | pre2 | BlizParticle01 | alpha |  |  |  | assets/textures/particles/smoke_01.png |
| HeroRaichuS3.mdx |  | godie-heroraichus3-p1 | pre2 | UNNAMED | additive |  |  |  | assets/textures/particles/spark_04.png |
| HeroRider.mdx | Y | godie-herorider-p0 | pre2 | UNNAMED | additive | Y |  | Bone_Hand_R | assets/textures/particles/light_01.png |
| HeroRyuk.mdx |  | godie-heroryuk-p0 | pre2 | BlizParticle01 | alpha |  | Y |  | assets/textures/particles/smoke_10.png |
| HeroSaber.mdx | Y | godie-herosaber-p0 | pre2 | BlizParticle01 | additive |  | Y |  | assets/textures/particles/flame_03.png |
| HeroSaber.mdx | Y | godie-herosaber-p1 | pre2 | BlizParticle02 | additive |  | Y | Bone_Hand_L | assets/textures/particles/flare_01.png |
| HeroSaber.mdx | Y | godie-herosaber-r0 | ribbon | BlizRibbon | additive |  | Y | Weapon | assets/textures/particles/wc3/ribbonblur1.png |
| HeroSasuke.mdx | Y | godie-herosasuke-p0 | pre2 | BlizParticle04 | additive |  | Y |  | assets/textures/particles/smoke_07.png |
| HeroSasuke.mdx | Y | godie-herosasuke-p1 | pre2 | BlizParticle01 | additive |  | Y | Bone_Arm2_R | assets/textures/particles/spark_04.png |
| HeroSasuke.mdx | Y | godie-herosasuke-p2 | pre2 | BlizParticle02 | additive |  | Y | Bone_Arm2_R | assets/textures/particles/spark_04.png |
| HeroSasuke.mdx | Y | godie-herosasuke-p3 | pre2 | BlizParticle03 | additive |  | Y | Bone_Arm2_R | assets/textures/particles/spark_04.png |
| HeroSasuke.mdx | Y | godie-herosasuke-r0 | ribbon | BlizRibbon01 | additive |  | Y | Bone_Arm2_R | assets/textures/particles/wc3/ribbonblur1.png |
| HeroSasuke.mdx | Y | godie-herosasuke-r1 | ribbon | BlizRibbon02 | additive |  | Y | Bone_Sword02 | assets/textures/particles/wc3/ribbonblur1.png |
| HeroSephiroth.mdx | Y | godie-herosephiroth-p0 | pre2 | BlizParticle01 | additive |  | Y |  | assets/textures/particles/flame_03.png |
| HeroSephiroth.mdx | Y | godie-herosephiroth-r0 | ribbon | BlizRibbon01 | additive |  | Y | Sword | assets/textures/particles/wc3/ribbonblur1.png |
| HeroShana.mdx | Y | godie-heroshana-p0 | pre2 | BlizParticle01 | additive | Y |  | Bone_Weapon | assets/textures/particles/smoke_07.png |
| HeroShana.mdx | Y | godie-heroshana-p1 | pre2 | BlizParticle02 | additive | Y |  | Bone_Weapon | assets/textures/particles/smoke_07.png |
| HeroShana.mdx | Y | godie-heroshana-p2 | pre2 | BlizParticle01 | additive | Y |  | Bone_Weapon | assets/textures/particles/smoke_07.png |
| HeroShana.mdx | Y | godie-heroshana-r0 | ribbon | UNNAMED | additive |  | Y | Bone_Weapon | assets/textures/particles/wc3/ribbonblur1.png |
| HeroToshiieMaeda.mdx | Y | godie-herotoshiiemaeda-p0 | pre2 | BlizParticle01 | additive |  | Y |  | assets/textures/particles/flame_03.png |
| HeroToshiieMaeda.mdx | Y | godie-herotoshiiemaeda-r0 | ribbon | BlizRibbon01 | additive |  | Y | Weapon | assets/textures/particles/wc3/ribbonblur1.png |
| HeroXelloss.mdx | Y | godie-heroxelloss-p0 | pre2 | staff spell 1 | additive |  | Y | staff berd | assets/textures/particles/smoke_05.png |
| HeroXelloss.mdx | Y | godie-heroxelloss-p1 | pre2 | staff spell 2 | additive |  | Y | staff berd | assets/textures/particles/spark_04.png |
| Herokyo.mdx | Y | godie-herokyo-p0 | pre2 | BlizParticle01 | additive |  | Y |  | assets/textures/particles/flame_03.png |
| Herokyo.mdx | Y | godie-herokyo-r0 | ribbon | BlizRibbon01 | additive |  | Y | Sword | assets/textures/particles/wc3/ribbonblur1.png |
| HolyAwakening.mdx |  | godie-holyawakening-p0 | pre2 | BlizParticle05white02 | modulate |  |  |  | assets/textures/particles/smoke_09.png |
| HolyAwakening.mdx |  | godie-holyawakening-p1 | pre2 | BlizParticle05white03 | modulate |  |  |  | assets/textures/particles/smoke_09.png |
| HolyAwakening.mdx |  | godie-holyawakening-p2 | pre2 | BlizParticle022222 | additive |  |  |  | assets/textures/particles/star_01.png |
| HolyAwakening.mdx |  | godie-holyawakening-p3 | pre2 | BlastFlareStreamers | additive |  |  |  | assets/textures/particles/smoke_06.png |
| HolyAwakening.mdx |  | godie-holyawakening-p4 | pre2 | BlizParticle08shockwaves02 | additive |  |  |  | assets/textures/particles/circle_04.png |
| HolyAwakening.mdx |  | godie-holyawakening-p5 | pre2 | BlizParticle08shockwavesYellow | additive |  |  |  | assets/textures/particles/light_02.png |
| HolyAwakening.mdx |  | godie-holyawakening-r0 | ribbon | BlizRibbon04 | additive |  |  | Dummy14 | assets/textures/particles/light_02.png |
| HolyAwakening.mdx |  | godie-holyawakening-r1 | ribbon | BlizRibbon06 | additive |  |  | Dummy20 | assets/textures/particles/light_02.png |
| HolyAwakening.mdx |  | godie-holyawakening-r2 | ribbon | BlizRibbon07 | additive |  |  | Dummy24 | assets/textures/particles/light_02.png |
| HolyAwakening.mdx |  | godie-holyawakening-r3 | ribbon | BlizRibbon09 | additive |  |  | Dummy30 | assets/textures/particles/light_02.png |
| HolyAwakening.mdx |  | godie-holyawakening-r4 | ribbon | BlizRibbon10 | additive |  |  | Dummy34 | assets/textures/particles/light_02.png |
| HolyAwakening.mdx |  | godie-holyawakening-r5 | ribbon | BlizRibbon12 | additive |  |  | Dummy40 | assets/textures/particles/light_02.png |
| HolyAwakening.mdx |  | godie-holyawakening-r6 | ribbon | BlizRibbon02 | additive |  |  | Dummy06 | assets/textures/particles/light_02.png |
| HolyAwakening.mdx |  | godie-holyawakening-r7 | ribbon | BlizRibbon03 | additive |  |  | Dummy10 | assets/textures/particles/light_02.png |
| LasercannonfinalRED.mdx |  | godie-lasercannonfinalred-p0 | pre2 | BlizParticleLowFire | additive |  | Y |  | assets/textures/particles/circle_04.png |
| LasercannonfinalRED.mdx |  | godie-lasercannonfinalred-p1 | pre2 | BlizParticleLowSmoke | additive |  | Y |  | assets/textures/particles/circle_05.png |
| LasercannonfinalRED.mdx |  | godie-lasercannonfinalred-p2 | pre2 | BlizParticleShockWave04 | additive |  | Y |  | assets/textures/particles/light_02.png |
| LasercannonfinalRED.mdx |  | godie-lasercannonfinalred-p3 | pre2 | BlizParticleFlash | additive |  |  |  | assets/textures/particles/flare_01.png |
| LasercannonfinalRED.mdx |  | godie-lasercannonfinalred-p4 | pre2 | BlizParticleShockWave03 | additive |  | Y |  | assets/textures/particles/light_01.png |
| LasercannonfinalRED.mdx |  | godie-lasercannonfinalred-p5 | pre2 | BlizParticleShockWave05 | additive |  | Y |  | assets/textures/particles/light_02.png |
| LasercannonfinalRED.mdx |  | godie-lasercannonfinalred-p6 | pre2 | BlizParticleShockWave06 | additive |  | Y |  | assets/textures/particles/light_02.png |
| LasercannonfinalRED.mdx |  | godie-lasercannonfinalred-p7 | pre2 | BlizParticleLowFlash | additive |  | Y |  | assets/textures/particles/light_03.png |
| LavaBreathDamage.mdx |  | godie-lavabreathdamage-p0 | pre2 | BlizParticle05 | additive |  |  |  | assets/textures/particles/flame_03.png |
| LightningTornado.mdx |  | godie-lightningtornado-p0 | pre2 | BlizParticle03tubespinner | additive |  |  |  | assets/textures/particles/spark_04.png |
| LightningTornado.mdx |  | godie-lightningtornado-p1 | pre2 | UNNAMED | additive |  |  | UNNAMED | assets/textures/particles/smoke_07.png |
| LightningTornado.mdx |  | godie-lightningtornado-p2 | pre2 | UNNAMED | additive |  |  | evilbox42spinerdummy | assets/textures/particles/spark_04.png |
| LightningTornado.mdx |  | godie-lightningtornado-p3 | pre2 | UNNAMED | additive |  |  | evilbox36 | assets/textures/particles/wc3/zap1.png |
| LightningTornado.mdx |  | godie-lightningtornado-p4 | pre2 | UNNAMED | additive |  |  | UNNAMED | assets/textures/particles/smoke_07.png |
| LightningTornado.mdx |  | godie-lightningtornado-p5 | pre2 | UNNAMED | additive |  |  | UNNAMED | assets/textures/particles/smoke_07.png |
| LightningTornado.mdx |  | godie-lightningtornado-p6 | pre2 | UNNAMED | additive |  |  | evilbox22 | assets/textures/particles/spark_04.png |
| LightningTornado.mdx |  | godie-lightningtornado-p7 | pre2 | UNNAMED | additive |  |  | evilbox39 | assets/textures/particles/wc3/zap1.png |
| LightningTornado.mdx |  | godie-lightningtornado-p8 | pre2 | UNNAMED | additive |  |  | UNNAMED | assets/textures/particles/smoke_07.png |
| LightningTornado.mdx |  | godie-lightningtornado-p9 | pre2 | UNNAMED | additive |  |  | evilbox40 | assets/textures/particles/spark_04.png |
| LightningTornado.mdx |  | godie-lightningtornado-p10 | pre2 | UNNAMED | additive |  |  | UNNAMED | assets/textures/particles/smoke_07.png |
| LightningTornado.mdx |  | godie-lightningtornado-p11 | pre2 | UNNAMED | additive |  |  | evilbox42 | assets/textures/particles/wc3/zap1.png |
| LightningTornado.mdx |  | godie-lightningtornado-p12 | pre2 | UNNAMED | additive |  |  | UNNAMED | assets/textures/particles/smoke_07.png |
| LightningTornado.mdx |  | godie-lightningtornado-p13 | pre2 | UNNAMED | additive |  |  | UNNAMED | assets/textures/particles/wc3/zap1b.png |
| Lightningnova.mdx |  | godie-lightningnova-p0 | pre2 | BlizParticle01 | additive |  |  |  | assets/textures/particles/light_02.png |
| Lightningnova.mdx |  | godie-lightningnova-p1 | pre2 | BlizParticle02 | additive |  |  |  | assets/textures/particles/spark_04.png |
| LinaInvers.mdx | Y | godie-linainvers-p0 | pre2 | attack 1 | additive |  | Y | bone right hand | assets/textures/particles/fire_02.png |
| LinaInvers.mdx | Y | godie-linainvers-p1 | pre2 | magic ball | additive |  | Y | bone right hand | assets/textures/particles/light_01.png |
| LinaInvers.mdx | Y | godie-linainvers-p2 | pre2 | attack 2 | additive |  | Y | bone left hand | assets/textures/particles/fire_02.png |
| LuBu.mdx | Y | godie-lubu-p0 | pre2 | BlizParticle02 | additive |  | Y | Sword | assets/textures/particles/circle_05.png |
| LuBu.mdx | Y | godie-lubu-p1 | pre2 | BlizParticle01 | additive |  | Y | Bone_Root | assets/textures/particles/light_02.png |
| LuBu.mdx | Y | godie-lubu-p2 | pre2 | BlizParticle03 | additive |  | Y | Bone_Root | assets/textures/particles/light_02.png |
| LuBu.mdx | Y | godie-lubu-r0 | ribbon | BlizRibbon01 | additive |  | Y | Sword | assets/textures/particles/wc3/ribbonblur1.png |
| Magical_Sword.mdx |  | godie-magical-sword-p0 | pre2 | BlizParticle01 | additive |  |  | etoile | assets/textures/particles/star_09.png |
| Meteor.mdx |  | godie-meteor-p0 | pre2 | BlizParticle08 | additive |  |  | Dummy02 | assets/textures/particles/smoke_07.png |
| Meteor.mdx |  | godie-meteor-p1 | pre2 | BlizParticle09 | alpha |  |  | Dummy02 | assets/textures/particles/smoke_09.png |
| Meteor.mdx |  | godie-meteor-p2 | pre2 | BlizParticle10 | additive |  |  | Dummy02 | assets/textures/particles/smoke_07.png |
| Meteor.mdx |  | godie-meteor-p3 | pre2 | BlizParticle01smokering01 | alpha |  |  |  | assets/textures/particles/smoke_10.png |
| Meteor.mdx |  | godie-meteor-p4 | pre2 | BlizParticle11impacttails | additive |  |  |  | assets/textures/particles/smoke_03.png |
| Meteor.mdx |  | godie-meteor-p5 | pre2 | BlizParticle12 | additive |  |  |  | assets/textures/particles/smoke_03.png |
| Meteor.mdx |  | godie-meteor-p6 | pre2 | BlizParticle08rocks | alphaKey |  |  |  | assets/textures/particles/dirt_02.png |
| Meteor.mdx |  | godie-meteor-p7 | pre2 | BlizParticle08shockwaves | additive |  |  |  | assets/textures/particles/circle_05.png |
| MinitypeFlame.MDX |  | godie-minitypeflame-p0 | pre2 | BlizParticle01 | additive |  |  | Plane02 | assets/textures/particles/smoke_07.png |
| MinitypeFlame.MDX |  | godie-minitypeflame-p1 | pre2 | BlizParticle02 | additive |  |  |  | assets/textures/particles/light_03.png |
| NetherStrike.mdx |  | godie-netherstrike-p0 | pre2 | BlizParticleLowFire | modulate |  |  |  | assets/textures/particles/smoke_09.png |
| NetherStrike.mdx |  | godie-netherstrike-p1 | pre2 | BlizParticleLowSmoke | modulate |  |  |  | assets/textures/particles/smoke_09.png |
| NetherStrike.mdx |  | godie-netherstrike-p2 | pre2 | BlizParticleShockWave1 | alpha |  |  |  | assets/textures/particles/circle_04.png |
| NetherStrike.mdx |  | godie-netherstrike-p3 | pre2 | BlizParticleShockWave02 | alpha |  |  |  | assets/textures/particles/circle_04.png |
| NetherStrike.mdx |  | godie-netherstrike-p4 | pre2 | BlizParticleFlash | modulate |  |  |  | assets/textures/particles/light_03.png |
| OblivionAura.mdx |  | godie-oblivionaura-p0 | pre2 | BlizParticle01 | additive |  |  |  | assets/textures/particles/light_01.png |
| RenaRyugu2.mdx | Y | godie-renaryugu2-p0 | pre2 | BlizParticle01 | additive |  | Y |  | assets/textures/particles/flame_03.png |
| RenaRyugu2.mdx | Y | godie-renaryugu2-p1 | pre2 | BlizParticle02 | additive |  | Y | Bone_Hand_L | assets/textures/particles/flare_01.png |
| RenaRyugu2.mdx | Y | godie-renaryugu2-r0 | ribbon | BlizRibbon | additive | Y |  | Weapon | assets/textures/particles/wc3/ribbonblur1.png |
| SD2.mdx | Y | godie-sd2-r0 | ribbon | BlizRibbon01 | additive | Y |  | Bone_Weapon_heart | assets/textures/particles/wc3/ribbonblur1.png |
| SD2.mdx | Y | godie-sd2-r1 | ribbon | BlizRibbonA1 | additive | Y |  |  | assets/textures/particles/wc3/ribbonblur1.png |
| SD2.mdx | Y | godie-sd2-r2 | ribbon | BlizRibbonA3 | additive | Y |  |  | assets/textures/particles/wc3/ribbonblur1.png |
| SD2.mdx | Y | godie-sd2-r3 | ribbon | BlizRibbonA2 | additive | Y |  |  | assets/textures/particles/wc3/ribbonblur1.png |
| Sesshomaru.mdx | Y | godie-sesshomaru-p0 | pre2 | BlizParticle01 | additive |  | Y |  | assets/textures/particles/flame_03.png |
| Sesshomaru.mdx | Y | godie-sesshomaru-r0 | ribbon | BlizRibbon01 | additive |  | Y | Sword | assets/textures/particles/wc3/ribbonblur1.png |
| SonicBreathStream.mdx |  | godie-sonicbreathstream-p0 | pre2 | BlizParticle FLAME 1 | additive |  |  | Dummy02 | assets/textures/particles/light_01.png |
| SonicBreathStream.mdx |  | godie-sonicbreathstream-p1 | pre2 | BlizParticle FLAME 02 | additive |  |  | Dummy02 | assets/textures/particles/light_01.png |
| SonicBreathStream.mdx |  | godie-sonicbreathstream-p2 | pre2 | BlizParticle FLAME 03redglow | additive |  |  | Dummy02 | assets/textures/particles/light_01.png |
| SuperShinyThingy.mdx |  | godie-supershinythingy-p0 | pre2 | BlizParticle08shockwaves02 | additive |  |  |  | assets/textures/particles/circle_03.png |
| SuperShinyThingy.mdx |  | godie-supershinythingy-p1 | pre2 | BlizParticle03 | additive |  |  |  | assets/textures/particles/light_01.png |
| SuperShinyThingy.mdx |  | godie-supershinythingy-p2 | pre2 | BlizParticle03 | additive |  |  |  | assets/textures/particles/light_03.png |
| SuperShinyThingy.mdx |  | godie-supershinythingy-r0 | ribbon | BlizRibbon02 | additive |  |  | Dummy06 | assets/textures/particles/light_03.png |
| SuperShinyThingy.mdx |  | godie-supershinythingy-r1 | ribbon | BlizRibbon01 | additive |  |  | Dummy01 | assets/textures/particles/light_03.png |
| SuperShinyThingy.mdx |  | godie-supershinythingy-r2 | ribbon | BlizRibbon03 | additive |  |  | Dummy10 | assets/textures/particles/light_03.png |
| Tectonicfury.mdx |  | godie-tectonicfury-p0 | pre2 | BlizParticle02 | additive |  |  |  | assets/textures/particles/smoke_01.png |
| Tectonicfury.mdx |  | godie-tectonicfury-p1 | pre2 | BlizParticle03head | alpha |  |  |  | assets/textures/particles/wc3/rockparticle.png |
| WindMissle.mdx |  | godie-windmissle-r0 | ribbon | BlizRibbon02 | additive |  |  | Dummy06 | assets/textures/particles/light_02.png |
| WindMissle.mdx |  | godie-windmissle-r1 | ribbon | BlizRibbon01 | additive |  |  | Dummy01x | assets/textures/particles/light_02.png |
| WindMissle.mdx |  | godie-windmissle-r2 | ribbon | BlizRibbon03 | additive |  |  | Dummy10 | assets/textures/particles/light_02.png |
| babyface.mdx |  | godie-babyface-p0 | pre2 | BlizParticle01 | additive |  |  |  | assets/textures/particles/wc3/babyface.png |
| billy.mdx |  | godie-billy-p0 | pre2 | UNNAMED | additive |  |  |  | assets/textures/particles/star_08.png |
| cloud.mdx | Y | godie-cloud-p0 | pre2 | UNNAMED | additive |  | Y | Bone_Root | assets/textures/particles/flame_03.png |
| cloud.mdx | Y | godie-cloud-r0 | ribbon | UNNAMED | additive |  | Y | Sword | assets/textures/particles/wc3/ribbonblur1.png |
| flamessmoke.mdx |  | godie-flamessmoke-p0 | pre2 | BlizParticle01 | additive |  |  |  | assets/textures/particles/smoke_07.png |
| flamessmoke.mdx |  | godie-flamessmoke-p1 | pre2 | BlizParticle02 | additive |  |  |  | assets/textures/particles/smoke_07.png |
| flamessmoke.mdx |  | godie-flamessmoke-p2 | pre2 | BlizParticle03 | additive |  |  |  | assets/textures/particles/flare_01.png |
| flamessmoke.mdx |  | godie-flamessmoke-p3 | pre2 | BlizParticle04 | alpha |  |  |  | assets/textures/particles/smoke_07.png |
| fox.mdx | Y | godie-fox-p0 | pre2 | FF_Particles | additive |  | Y | Bone_Hand_L | assets/textures/particles/star_04.png |
| fox2.mdx | Y | godie-fox2-p0 | pre2 | FF_Particles | additive |  | Y | Bone_Hand_L | assets/textures/particles/star_04.png |
| frostnova.mdx |  | godie-frostnova-p0 | pre2 | Mana_Rings | additive |  |  |  | assets/textures/particles/star_05.png |
| frostnova.mdx |  | godie-frostnova-p1 | pre2 | Brilliance_Rings | additive |  |  |  | assets/textures/particles/circle_02.png |
| frostnova.mdx |  | godie-frostnova-p2 | pre2 | Birth_Inner_Particle | additive |  |  |  | assets/textures/particles/circle_02.png |
| frostnova.mdx |  | godie-frostnova-p3 | pre2 | BlizParticle01 | additive |  |  |  | assets/textures/particles/star_09.png |
| gumdam.mdx |  | godie-gumdam-p0 | pre2 | BlizParticle01 | alpha |  |  | Object11 | assets/textures/particles/smoke_01.png |
| gumdam.mdx |  | godie-gumdam-p1 | pre2 | BlizParticle06 | alpha |  | Y |  | assets/textures/particles/smoke_03.png |
| gumdam.mdx |  | godie-gumdam-p2 | pre2 | BlizParticle09 | additive |  |  |  | assets/textures/particles/flame_03.png |
| gumdam.mdx |  | godie-gumdam-p3 | pre2 | BlizParticle01fire05 | additive |  | Y |  | assets/textures/particles/smoke_07.png |
| gumdam.mdx |  | godie-gumdam-p4 | pre2 | BlizParticle08 | alpha |  | Y |  | assets/textures/particles/smoke_04.png |
| gx.mdx |  | godie-gx-p0 | pre2 | BlizParticle01 | additive |  |  |  | assets/textures/particles/wc3/blue-glow2.png |
| gx.mdx |  | godie-gx-r0 | ribbon | BlizRibbon01 | additive |  |  |  | assets/textures/particles/wc3/blue-glow2.png |
| gxhuge.mdx |  | godie-gxhuge-p0 | pre2 | BlizParticle01 | additive |  |  |  | assets/textures/particles/wc3/blue-glow2.png |
| gxhuge.mdx |  | godie-gxhuge-r0 | ribbon | BlizRibbon01 | additive |  |  |  | assets/textures/particles/wc3/blue-glow2.png |
| herofate.mdx |  | godie-herofate-p0 | pre2 | blizparticle01 | additive |  | Y |  | assets/textures/particles/flame_03.png |
| herofate.mdx |  | godie-herofate-p1 | pre2 | ff_particles | alpha |  | Y | bone_hand_l | assets/textures/particles/circle_04.png |
| herofate.mdx |  | godie-herofate-r0 | ribbon | blizribbon | alpha |  | Y | weapon | assets/textures/particles/light_01.png |
| heroluffeattack.mdx |  | godie-heroluffeattack-p0 | pre2 | UNNAMED | additive |  |  | Hero05 | assets/textures/particles/spark_04.png |
| horse.mdx | Y | godie-horse-p0 | pre2 | UNNAMED | alpha |  | Y |  | assets/textures/particles/smoke_07.png |
| ma.mdx |  | godie-ma-p0 | pre2 | BlizParticle01 | additive |  | Y |  | assets/textures/particles/light_02.png |
| ma.mdx |  | godie-ma-p1 | pre2 | BlizParticle02 | additive |  | Y |  | assets/textures/particles/light_02.png |
| mfls.mdx | Y | godie-mfls-r0 | ribbon | UNNAMED | additive |  | Y | Bone_Hand_R | assets/textures/particles/wc3/ribbonblur1.png |
| mfls.mdx | Y | godie-mfls-r1 | ribbon | UNNAMED | additive |  | Y | Bone_Hand_L | assets/textures/particles/wc3/ribbonblur1.png |
| negi.mdx | Y | godie-negi-p0 | pre2 | UNNAMED | additive |  | Y | Bone_Hand_R | assets/textures/particles/star_09.png |
| negi.mdx | Y | godie-negi-p1 | pre2 | UNNAMED | additive |  | Y | Bone_Hand_L | assets/textures/particles/star_09.png |
| niya.mdx |  | godie-niya-p0 | pre2 | BlizParticle01 | additive |  | Y |  | assets/textures/particles/flame_03.png |
| niya.mdx |  | godie-niya-p1 | pre2 | BlizParticle02 | additive |  | Y | Bone_Hand_L | assets/textures/particles/flare_01.png |
| niya.mdx |  | godie-niya-r0 | ribbon | BlizRibbon | additive |  | Y | Weapon | assets/textures/particles/wc3/ribbonblur1.png |
| picacugy.mdx | Y | godie-picacugy-r0 | ribbon | UNNAMED | additive |  | Y | bone_tail | assets/textures/particles/wc3/ribbonblur1.png |
| ye-wuqi1.mdx |  | godie-ye-wuqi1-p0 | pre2 | BlizParticle02 | additive |  |  | Box02 | assets/textures/particles/light_03.png |
| ye-wuqi1.mdx |  | godie-ye-wuqi1-p1 | pre2 | BlizParticle04 | additive |  |  | bone_Box11 | assets/textures/particles/light_03.png |
| ye-wuqi1.mdx |  | godie-ye-wuqi1-p2 | pre2 | BlizParticle03 | additive |  |  | bone_Box10 | assets/textures/particles/light_03.png |
| ye-wuqi1.mdx |  | godie-ye-wuqi1-r0 | ribbon | BlizRibbon01 | additive |  | Y | Box02 | assets/textures/particles/wc3/ribbonblur1.png |

## Texture substitutions (Blizzard stock -> CC0 Kenney sprite)

| WC3 texture | substitute | uses |
|---|---|---|
| Abilities\Spells\Human\Brilliance\TjShockwave2.blp | circle_02.png | 1 |
| Abilities\Spells\Other\HowlOfTerror\Skull1.blp | light_01.png | 1 |
| Abilities\Spells\Other\Monsoon\HitBase.blp | light_02.png | 1 |
| Doodads\Cinematic\EyeOfSargeras\Demon_Rune2.blp | magic_01.png | 1 |
| ReplaceableTextures\Weather\Clouds8x8.blp | smoke_07.png | 18 |
| SharedModels\TjLeaves.blp | light_02.png | 2 |
| Textures\AuraRune7Green.blp | magic_01.png | 1 |
| Textures\BloodWhiteSmall.blp | smoke_04.png | 4 |
| Textures\Blue_Star2.blp | star_08.png | 1 |
| Textures\CampaignOrcHair.blp | light_01.png | 1 |
| Textures\CartoonCloud.blp | smoke_06.png | 1 |
| Textures\CloudSingle.blp | smoke_01.png | 5 |
| Textures\Clouds8x8.blp | smoke_07.png | 2 |
| Textures\Clouds8x8Black.blp | smoke_04.png | 1 |
| Textures\Clouds8x8Fade.blp | smoke_07.png | 8 |
| Textures\Clouds8x8Fire.blp | fire_02.png | 8 |
| Textures\Clouds8x8Grey.blp | smoke_01.png | 2 |
| Textures\Clouds8x8Mod.blp | smoke_09.png | 6 |
| Textures\DeathScream.blp | light_02.png | 1 |
| Textures\Dust3.blp | smoke_10.png | 1 |
| Textures\Dust3_Thunder.blp | smoke_02.png | 1 |
| Textures\Dust3x.blp | smoke_07.png | 3 |
| Textures\Dust5A.blp | smoke_03.png | 3 |
| Textures\Dust5ABlack.blp | smoke_10.png | 1 |
| Textures\Energy1.blp | light_01.png | 2 |
| Textures\Flame4.blp | flame_03.png | 19 |
| Textures\Flare.blp | flare_01.png | 5 |
| Textures\GenericGlow2b.blp | light_02.png | 18 |
| Textures\GenericGlow2c.blp | light_03.png | 3 |
| Textures\GenericGlow64.blp | light_03.png | 3 |
| Textures\GenericGlowFaded.blp | light_02.png | 1 |
| Textures\GenericGlowX.blp | light_03.png | 5 |
| Textures\GenericGlowX_Mod2.blp | light_03.png | 2 |
| Textures\Ghost1.blp | light_02.png | 1 |
| Textures\Green_Star.blp | star_07.png | 1 |
| Textures\LavaLump2.blp | flame_03.png | 2 |
| Textures\Leaf.blp | light_01.png | 1 |
| Textures\LightningBall.blp | spark_04.png | 11 |
| Textures\ManaDrainIn.blp | star_05.png | 1 |
| Textures\RibbonNE1_blue.blp | trace_03.png | 5 |
| Textures\Shockwave1.blp | circle_04.png | 1 |
| Textures\Shockwave10.blp | circle_05.png | 4 |
| Textures\Shockwave1White.blp | circle_04.png | 1 |
| Textures\Shockwave4.blp | circle_01.png | 1 |
| Textures\Shockwave4white.blp | circle_03.png | 1 |
| Textures\ShockwaveWater1.blp | circle_02.png | 3 |
| Textures\ShockwaveWater1Black.blp | circle_04.png | 5 |
| Textures\Sparkle_Anim.blp | spark_06.png | 1 |
| Textures\Star8.blp | star_04.png | 2 |
| Textures\Star8b.blp | star_08.png | 1 |
| Textures\Star8c.blp | star_09.png | 1 |
| Textures\TeamGlow01.blp | light_03.png | 3 |
| Textures\WaterWake3.blp | circle_02.png | 1 |
| Textures\White_64_Foam1.blp | light_02.png | 6 |
| Textures\Yellow_Glow.blp | light_01.png | 5 |
| Textures\Yellow_Star.blp | star_07.png | 2 |
| Textures\Yellow_Star_Dim.blp | star_09.png | 5 |
| Textures\clouds_anim1_bw.blp | smoke_05.png | 1 |
| Textures\firering6.blp | fire_01.png | 10 |
| Textures\pixies1.blp | light_01.png | 1 |
| Textures\rock64.blp | dirt_02.png | 1 |
| Textures\star2.blp | star_08.png | 1 |
| Textures\star4_32.blp | star_05.png | 1 |
| Textures\star5tga.blp | star_07.png | 2 |
| Textures\star6.blp | star_01.png | 2 |
| Textures\sun.blp | flare_01.png | 6 |
| UI\Glues\SinglePlayer\NightElfCampaign3D\NightElfFemaleEyeGlow1.blp | light_03.png | 4 |
| UI\MiniMap\ping4.blp | light_01.png | 3 |
| Units\Undead\SkeletonMage\smoke_1.blp | smoke_01.png | 3 |
| abilities\Weapons\AvengerMissile\Ghost1Mod.blp | light_01.png | 1 |
| textures\star2.blp | star_08.png | 1 |

## EVTS inventory (spawn/splat/uber/sound markers per model)

Names are SPN (spawn model), SPL (ground splat), UBR (uber splat), SND (sound) + a 4-char id; times are track keys in milliseconds on the model timeline (death markers land inside the Death sequence). For later death/impact-effect wiring.

| model | event | times (ms) |
|---|---|---|
| AquaSpikeVersion2.mdx | SNDXDNBL | 0 |
| Bladestorm_SwordEffect.mdx | SNDxAOWW | 56667 |
| Darkraor.mdx | SNDxMMEA | 20400, 22700, 25200 |
| Darkraor.mdx | SNDxMDCL | 3333, 4667, 6000, 7333, 8667, 10000 |
| DeathWave.mdx | SNDXACCV | 400 |
| EarthTornado2.mdx | SNDxAOWW | 56667 |
| FireBlast.mdx | SNDXMKGL | 8667 |
| FireBlast.mdx | SNDXMKGH | 11000 |
| Flash.mdx | SNDxAEBL | 700 |
| HeroBigGon.mdx | SNDxDDSH | 30000 |
| HeroBigGon.mdx | SPNxOBHS | 24000 |
| HeroBigGon.mdx | FPTxFBL1 | 1233 |
| HeroBigGon.mdx | SPLxOBL3 | 24833 |
| HeroBigGon.mdx | SPLxOBS2 | 24267 |
| HeroBigGon.mdx | SPLxOBL1 | 24267 |
| HeroBigGon.mdx | SNDxDFOO | 24000 |
| HeroBigGon.mdx | FPTxFBR1 | 900 |
| HeroBuu.mdx | SNDxDTUS | 17633 |
| HeroBuu.mdx | SNDxAAMS | 14967, 16300 |
| HeroBuu.mdx | SNDxKIRG | 84100 |
| HeroBuu.mdx | SNDxAHEA | 25000 |
| HeroBuu.mdx | SNDxAOSH | 22833 |
| HeroGirl.mdx | SNDXDRAN | 11500 |
| HeroGirl.mdx | FPTxFBR0 | 266933, 267433 |
| HeroGirl.mdx | FPTxFBL0 | 267167, 267667 |
| HeroGirl.mdx | SPLxHBS0 | 11800 |
| HeroGirl.mdx | SPLxHBL3 | 11933 |
| HeroGirl.mdx | SPLxHBS2 | 12100 |
| HeroGirl.mdx | SPLyHBS0 | 11667 |
| HeroGirl.mdx | SPNxNBAR | 11533 |
| HeroGirl.mdx | SNDxAEFK | 272468 |
| HeroGirl.mdx | SNDXKBM1 | 264833 |
| HeroGirl.mdx | SNDXKBM2 | 265833, 267800 |
| HeroHanzouHattori.mdx | SNDXDBLA | 149233 |
| HeroHanzouHattori.mdx | FPTxFBR0 | 160034, 160534 |
| HeroHanzouHattori.mdx | FPTxFBL0 | 160268, 160768 |
| HeroHanzouHattori.mdx | SPLxOBS2 | 149533 |
| HeroHanzouHattori.mdx | SPLxOBS3 | 149799 |
| HeroHanzouHattori.mdx | SPLyOBS1 | 150000 |
| HeroHanzouHattori.mdx | SNDXKBM1 | 156200 |
| HeroHanzouHattori.mdx | SNDXKBM2 | 157467 |
| HeroHanzouHattori.mdx | SNDXAOCR | 158701 |
| HeroHehi.mdx | SNDXAOCR | 17733 |
| HeroHehi.mdx | SNDXDPAL | 22200 |
| HeroHehi.mdx | SNDXKBM1 | 14333 |
| HeroHehi.mdx | SNDXKBM2 | 31833 |
| HeroHehi.mdx | FPTxFBL1 | 28967 |
| HeroHehi.mdx | FPTxFBR1 | 29333 |
| HeroHehi.mdx | SNDxAOWW | 56667 |
| HeroHehi.mdx | SNDXDDSO | 50133 |
| HeroHehi.mdx | SPLxHBL1 | 22267 |
| HeroHehi.mdx | SPLxHBS2 | 22267 |
| HeroHehi.mdx | SPLxHBL2 | 22800 |
| HeroHehi.mdx | SPLxHBS0 | 23067 |
| HeroHehi.mdx | SPLxHBL3 | 22833 |
| HeroHehi.mdx | SPNxOBHS | 22000 |
| HeroHehi.mdx | SNDXKBM1 | 73833 |
| HeroHehi.mdx | SNDXKBM2 | 74833, 75833 |
| HeroHimuraKenshin.mdx | SNDXAOCR | 17733 |
| HeroHimuraKenshin.mdx | SNDXDBLA | 22000 |
| HeroHimuraKenshin.mdx | SNDXKBM1 | 14333 |
| HeroHimuraKenshin.mdx | SNDXKBM2 | 31833 |
| HeroHimuraKenshin.mdx | FPTxFBL1 | 28967 |
| HeroHimuraKenshin.mdx | FPTxFBR1 | 29333 |
| HeroHimuraKenshin.mdx | SNDxAOWW | 56667 |
| HeroHimuraKenshin.mdx | SNDXDDSO | 50133 |
| HeroHimuraKenshin.mdx | SPLxOBL1 | 22267 |
| HeroHimuraKenshin.mdx | SPLxOBS2 | 22267 |
| HeroHimuraKenshin.mdx | SPLxOBL2 | 22800 |
| HeroHimuraKenshin.mdx | SPLxOBS0 | 23067 |
| HeroHimuraKenshin.mdx | SPLxOBL3 | 22833 |
| HeroHimuraKenshin.mdx | SPNxOBHS | 22000 |
| HeroKunoichi.mdx | SNDXDRAN | 11500 |
| HeroKunoichi.mdx | FPTxFBR0 | 266933, 267433 |
| HeroKunoichi.mdx | FPTxFBL0 | 267167, 267667 |
| HeroKunoichi.mdx | SPLxHBS0 | 11800 |
| HeroKunoichi.mdx | SPLxHBL3 | 11933 |
| HeroKunoichi.mdx | SPLxHBS2 | 12100 |
| HeroKunoichi.mdx | SPLyHBS0 | 11667 |
| HeroKunoichi.mdx | SPNxNBAR | 11533 |
| HeroKunoichi.mdx | SNDxAEFK | 272468 |
| HeroKunoichi.mdx | SNDXKBM1 | 264833 |
| HeroKunoichi.mdx | SNDXKBM2 | 265833, 267800 |
| HeroLight.mdx | SNDXDBES | 22000 |
| HeroLight.mdx | SNDXMFRL | 14333 |
| HeroLight.mdx | FPTxFBL1 | 28967 |
| HeroLight.mdx | FPTxFBR1 | 29333 |
| HeroLight.mdx | SNDXDUDS | 49133 |
| HeroLight.mdx | SPLxHBL1 | 22267 |
| HeroLight.mdx | SPLxHBS2 | 22267 |
| HeroLight.mdx | SPLxHBL2 | 22800 |
| HeroLight.mdx | SPLxHBS0 | 23067 |
| HeroLight.mdx | SPLxHBL3 | 22833 |
| HeroLight.mdx | SPNxOBHS | 22000 |
| HeroLingTong.mdx | SNDXDRAN | 11500 |
| HeroLingTong.mdx | FPTxFBR0 | 266933, 267433 |
| HeroLingTong.mdx | FPTxFBL0 | 267167, 267667 |
| HeroLingTong.mdx | SPLxHBS0 | 11800 |
| HeroLingTong.mdx | SPLxHBL3 | 11933 |
| HeroLingTong.mdx | SPLxHBS2 | 12100 |
| HeroLingTong.mdx | SPLyHBS0 | 11667 |
| HeroLingTong.mdx | SPNxNBAR | 11533 |
| HeroLingTong.mdx | SNDxAEFK | 272468 |
| HeroLingTong.mdx | SNDXKBM1 | 264833 |
| HeroLingTong.mdx | SNDXKBM2 | 265833, 267800 |
| HeroMiku.mdx | SNDxDDSN | 63668 |
| HeroMusashiMiyamoto.mdx | SNDXAOCR | 17733 |
| HeroMusashiMiyamoto.mdx | SNDXDPAL | 22200 |
| HeroMusashiMiyamoto.mdx | SNDXKBM1 | 14333 |
| HeroMusashiMiyamoto.mdx | SNDXKBM2 | 31833 |
| HeroMusashiMiyamoto.mdx | FPTxFBL1 | 28967 |
| HeroMusashiMiyamoto.mdx | FPTxFBR1 | 29333 |
| HeroMusashiMiyamoto.mdx | SNDxAOWW | 56667 |
| HeroMusashiMiyamoto.mdx | SNDXDDSO | 50133 |
| HeroMusashiMiyamoto.mdx | SPLxHBL1 | 22267 |
| HeroMusashiMiyamoto.mdx | SPLxHBS2 | 22267 |
| HeroMusashiMiyamoto.mdx | SPLxHBL2 | 22800 |
| HeroMusashiMiyamoto.mdx | SPLxHBS0 | 23067 |
| HeroMusashiMiyamoto.mdx | SPLxHBL3 | 22833 |
| HeroMusashiMiyamoto.mdx | SPNxOBHS | 22000 |
| HeroMusashiMiyamoto.mdx | SNDXKBM1 | 73833 |
| HeroMusashiMiyamoto.mdx | SNDXKBM2 | 74833, 75833 |
| HeroOichi.mdx | FPTxFBR0 | 18800 |
| HeroOichi.mdx | FPTxFBL0 | 18400 |
| HeroOichi.mdx | SPLxHBL2 | 11767 |
| HeroOichi.mdx | SPLxHBS3 | 12100 |
| HeroOichi.mdx | SPLxHBL3 | 12300 |
| HeroOichi.mdx | SPLxHBL1 | 12667 |
| HeroOichi.mdx | SNDxDDMN | 11500 |
| HeroRider.mdx | SNDXDRAN | 11500 |
| HeroRider.mdx | FPTxFBR0 | 266933, 267433 |
| HeroRider.mdx | FPTxFBL0 | 267167, 267667 |
| HeroRider.mdx | SPLxHBS0 | 11800 |
| HeroRider.mdx | SPLxHBL3 | 11933 |
| HeroRider.mdx | SPLxHBS2 | 12100 |
| HeroRider.mdx | SPLyHBS0 | 11667 |
| HeroRider.mdx | SPNxNBAR | 11533 |
| HeroSaber.mdx | SNDXAOCR | 17733 |
| HeroSaber.mdx | SNDXDJAN | 22000 |
| HeroSaber.mdx | SNDXKBM1 | 14333 |
| HeroSaber.mdx | SNDXKBM2 | 31833 |
| HeroSaber.mdx | FPTxFBL0 | 28967 |
| HeroSaber.mdx | FPTxFBR0 | 29333 |
| HeroSaber.mdx | SNDXDDSO | 50133 |
| HeroSaber.mdx | SPLxHBL1 | 22267 |
| HeroSaber.mdx | SPLxHBS2 | 22267 |
| HeroSaber.mdx | SPLxHBL2 | 22800 |
| HeroSaber.mdx | SPLxHBS0 | 23067 |
| HeroSaber.mdx | SPLxHBL3 | 22833 |
| HeroSaber.mdx | SPNxHBSR | 22000 |
| HeroSephiroth.mdx | SNDXAOCR | 17733 |
| HeroSephiroth.mdx | SNDXDPAL | 22200 |
| HeroSephiroth.mdx | SNDXKBM1 | 14333 |
| HeroSephiroth.mdx | SNDXKBM2 | 31833 |
| HeroSephiroth.mdx | FPTxFBL1 | 28967 |
| HeroSephiroth.mdx | FPTxFBR1 | 29333 |
| HeroSephiroth.mdx | SNDXDDSO | 50133 |
| HeroSephiroth.mdx | SPLxHBL1 | 22267 |
| HeroSephiroth.mdx | SPLxHBS2 | 22267 |
| HeroSephiroth.mdx | SPLxHBL2 | 22800 |
| HeroSephiroth.mdx | SPLxHBS0 | 23067 |
| HeroSephiroth.mdx | SPLxHBL3 | 22833 |
| HeroSephiroth.mdx | SPNxOBHS | 22000 |
| HeroShana.mdx | SNDxKBM1 | 14333 |
| HeroShana.mdx | SNDxKBM2 | 31833 |
| HeroShana.mdx | SNDxAOCR | 17733 |
| HeroShana.mdx | SNDxDRAN | 22000 |
| HeroShana.mdx | SNDxDDSN | 50133 |
| HeroShana.mdx | SNDxMFRL | 66500 |
| HeroToshiieMaeda.mdx | SNDXAOCR | 17733 |
| HeroToshiieMaeda.mdx | SNDXDPAL | 22000 |
| HeroToshiieMaeda.mdx | SNDXKBM1 | 14333 |
| HeroToshiieMaeda.mdx | SNDXKBM2 | 31833 |
| HeroToshiieMaeda.mdx | FPTxFBL1 | 28967 |
| HeroToshiieMaeda.mdx | FPTxFBR1 | 29333 |
| HeroToshiieMaeda.mdx | SNDXDDSO | 50133 |
| HeroToshiieMaeda.mdx | SPLxHBL1 | 22267 |
| HeroToshiieMaeda.mdx | SPLxHBS2 | 22267 |
| HeroToshiieMaeda.mdx | SPLxHBL2 | 22800 |
| HeroToshiieMaeda.mdx | SPLxHBS0 | 23067 |
| HeroToshiieMaeda.mdx | SPLxHBL3 | 22833 |
| HeroToshiieMaeda.mdx | SPNxOBHS | 22000 |
| HeroXelloss.mdx | FPTxFBL2 | 4760 |
| HeroXelloss.mdx | FPTxFBR2 | 5149 |
| HeroXelloss.mdx | SNDxDVLM | 17780 |
| HeroXelloss.mdx | SPLxDBL2 | 18746 |
| HeroXelloss.mdx | SPLxDBS2 | 18746 |
| Hero_Turtle.mdx | FPTxFPR2 | 10567 |
| Hero_Turtle.mdx | FPTxFPL2 | 10267 |
| Hero_Turtle.mdx | SPLxHBS0 | 18233 |
| Hero_Turtle.mdx | SPLxHBL1 | 18433 |
| Hero_Turtle.mdx | SPLxHBL2 | 18100 |
| Hero_Turtle.mdx | SNDxDFUR | 16667 |
| Hero_Turtle.mdx | SNDxAWRS | 23767 |
| Herokyo.mdx | SNDXAOCR | 17733 |
| Herokyo.mdx | SNDXDPAL | 22200 |
| Herokyo.mdx | SNDXKBM1 | 14333 |
| Herokyo.mdx | SNDXKBM2 | 31833 |
| Herokyo.mdx | FPTxFBL1 | 28967 |
| Herokyo.mdx | FPTxFBR1 | 29333 |
| Herokyo.mdx | SNDXDDSO | 50133 |
| Herokyo.mdx | SPLxHBL1 | 22267 |
| Herokyo.mdx | SPLxHBS2 | 22267 |
| Herokyo.mdx | SPLxHBL2 | 22800 |
| Herokyo.mdx | SPLxHBS0 | 23067 |
| Herokyo.mdx | SPLxHBL3 | 22833 |
| Herokyo.mdx | SPNxOBHS | 22000 |
| HolyAwakening.mdx | SNDXAHMC | 1167 |
| Kikyou.mdx | SPLxHBL1 | 13003 |
| Kikyou.mdx | SPLyHBL0 | 13173 |
| Kikyou.mdx | SPLyHBL2 | 13453 |
| Kikyou.mdx | SNDXDJAN | 12500 |
| Kikyou.mdx | FPTxFBL0 | 20080 |
| Kikyou.mdx | FPTxFBR0 | 20477 |
| LasercannonfinalRED.mdx | UBRaDHLB | 2001 |
| LightningTornado.mdx | SNDxAOWW | 56667 |
| Lightningnova.mdx | SNDXASTS | 1033 |
| LinaInvers.mdx | FPTxFBL2 | 7558 |
| LinaInvers.mdx | FPTxFBR2 | 8059 |
| LinaInvers.mdx | SNDxDJAN | 23433 |
| LinaInvers.mdx | SPNxHBBM | 23437 |
| LinaInvers.mdx | SPLxHBL2 | 23961 |
| LuBu.mdx | SNDXAOCR | 17733 |
| LuBu.mdx | SNDXDPAL | 22200 |
| LuBu.mdx | SNDXKBM1 | 14333, 55234 |
| LuBu.mdx | SNDXKBM2 | 31833 |
| LuBu.mdx | FPTxFBL1 | 28967 |
| LuBu.mdx | FPTxFBR1 | 29333 |
| LuBu.mdx | SNDXDDSO | 50133 |
| LuBu.mdx | SPLxOBL1 | 22267 |
| LuBu.mdx | SPLxOBS2 | 22267 |
| LuBu.mdx | SPLxOBL2 | 22800 |
| LuBu.mdx | SPLxOBS0 | 23067 |
| LuBu.mdx | SPLxOBL3 | 22833 |
| LuBu.mdx | SPNxOBHS | 22000 |
| LuBu.mdx | SNDxKDK1 | 55234 |
| Luffe.mdx | SNDxAAMS | 667, 3000 |
| Luffe.mdx | SNDxADIS | 1833 |
| Luffe.mdx | SNDxDPRS | 10167 |
| Luffe.mdx | SNDxDNDS | 11163 |
| Meteor.mdx | SNDXAINB | 23033 |
| Meteor.mdx | UBRxTHND | 24000 |
| Meteor.mdx | SPNxDNBL | 24000 |
| Meteor.mdx | SPNxHFSS | 24000 |
| NetherStrike.mdx | SPNaHFSS | 233 |
| NetherStrike.mdx | SPNbHFSS | 467 |
| NetherStrike.mdx | SPNcHFSS | 667 |
| NetherStrike.mdx | SPNdHFSS | 933 |
| NetherStrike.mdx | UBRaDHLB | 600 |
| NetherStrike.mdx | SNDxAHFS | 67 |
| RenaRyugu2.mdx | SNDXAOCR | 17733 |
| RenaRyugu2.mdx | SNDXDJAN | 22000 |
| RenaRyugu2.mdx | SNDXKBM1 | 14333 |
| RenaRyugu2.mdx | SNDXKBM2 | 31833 |
| RenaRyugu2.mdx | FPTxFBL0 | 28967 |
| RenaRyugu2.mdx | FPTxFBR0 | 29333 |
| RenaRyugu2.mdx | SNDXDDSO | 50133 |
| RenaRyugu2.mdx | SPLxHBL1 | 22267 |
| RenaRyugu2.mdx | SPLxHBS2 | 22267 |
| RenaRyugu2.mdx | SPLxHBL2 | 22800 |
| RenaRyugu2.mdx | SPLxHBS0 | 23067 |
| RenaRyugu2.mdx | SPLxHBL3 | 22833 |
| RenaRyugu2.mdx | SPNxHBSR | 22000 |
| Sesshomaru.mdx | SNDXAOCR | 17733 |
| Sesshomaru.mdx | SNDXDBES | 22000 |
| Sesshomaru.mdx | SNDXKBM1 | 14333 |
| Sesshomaru.mdx | SNDXKBM2 | 31833 |
| Sesshomaru.mdx | FPTxFBL1 | 28967 |
| Sesshomaru.mdx | FPTxFBR1 | 29333 |
| Sesshomaru.mdx | SNDXDDSH | 50133 |
| Sesshomaru.mdx | SPLxHBL1 | 22267 |
| Sesshomaru.mdx | SPLxHBS2 | 22267 |
| Sesshomaru.mdx | SPLxHBL2 | 22800 |
| Sesshomaru.mdx | SPLxHBS0 | 23067 |
| Sesshomaru.mdx | SPLxHBL3 | 22833 |
| Sesshomaru.mdx | SPNxOBHS | 22000 |
| SuperShinyThingy.mdx | SNDXAIVS | 0 |
| Tectonicfury.mdx | SNDXMCAT | 400, 467, 667, 867, 1067, 1267 |
| Tectonicfury.mdx | UBRxTHND | 400, 467, 667, 867, 1067, 1267 |
| WindMissle.mdx | SNDXACCV | 400 |
| babyface.mdx | SNDxDVLC | 1000 |
| billy.mdx | SNDxAHHB | 5800 |
| billy.mdx | SNDxDBNT | 24000 |
| billy.mdx | SNDxDDSH | 30000 |
| cloud.mdx | SNDxDDEM | 22000 |
| cloud.mdx | SPNxHBF0 | 22034 |
| cloud.mdx | SNDxAOCR | 99774 |
| crescent.mdx | SNDXAEFL | 667 |
| crescent.mdx | SNDXAIDC | 667 |
| fox.mdx | SNDxDWRD | 30333 |
| fox.mdx | FPTxFBR0 | 26133, 26633 |
| fox.mdx | FPTxFBL0 | 26367, 26867 |
| fox.mdx | SNDxAEFK | 38167 |
| fox.mdx | SNDxDDSN | 50033 |
| fox.mdx | SPNxHBPR | 30300 |
| fox.mdx | SNDXKWAR | 35800, 46667, 52767 |
| fox.mdx | SPLxHBS0 | 30544 |
| fox.mdx | SPLxHBS1 | 31044 |
| fox.mdx | SPLxHBL1 | 30533 |
| fox.mdx | SPLxHBS3 | 30422 |
| fox2.mdx | SNDxDWRD | 30333 |
| fox2.mdx | FPTxFBR0 | 26133, 26633 |
| fox2.mdx | FPTxFBL0 | 26367, 26867 |
| fox2.mdx | SNDxAEFK | 38167 |
| fox2.mdx | SNDxDDSN | 50033 |
| fox2.mdx | SPNxHBPR | 30300 |
| fox2.mdx | SNDXKWAR | 35800, 46667, 52767 |
| fox2.mdx | SPLxHBS0 | 30544 |
| fox2.mdx | SPLxHBS1 | 31044 |
| fox2.mdx | SPLxHBL1 | 30533 |
| fox2.mdx | SPLxHBS3 | 30422 |
| goku.mdx | SNDxAAMS | 5500, 6667 |
| goku.mdx | SNDxAAST | 12000, 18833 |
| goku.mdx | SNDxDDEM | 13333 |
| gumdam.mdx | SNDxKIRG | 17167 |
| gumdam.mdx | SNDxDIRG | 23400 |
| gumdam.mdx | FPTxFBL4 | 21000 |
| gumdam.mdx | FPTxFBR4 | 20533 |
| gumdam.mdx | SNDXFDFR | 20333 |
| gumdam.mdx | SNDXFDFL | 20900 |
| gx.mdx | SNDxMFAR | 1000 |
| gx.mdx | SNDxMCDA | 0 |
| gxhuge.mdx | SNDxMFAR | 1000 |
| gxhuge.mdx | SNDxMCDA | 0 |
| herofate.mdx | sndxaocr | 17733 |
| herofate.mdx | sndxdjan | 22000 |
| herofate.mdx | sndxkbm1 | 14333 |
| herofate.mdx | sndxkbm2 | 31833 |
| herofate.mdx | fptxfbl0 | 28967 |
| herofate.mdx | fptxfbr0 | 29333 |
| herofate.mdx | sndxddso | 50133 |
| herofate.mdx | splxhbl1 | 22267 |
| herofate.mdx | splxhbs2 | 22267 |
| herofate.mdx | splxhbl2 | 22800 |
| herofate.mdx | splxhbs0 | 23067 |
| herofate.mdx | splxhbl3 | 22833 |
| herofate.mdx | spnxhbsr | 22000 |
| horse.mdx | SNDxDHOR | 29733 |
| horse.mdx | FPTxFHR0 | 733 |
| horse.mdx | FPTxFHL0 | 867 |
| horse.mdx | FPTxFHR0 | 567 |
| horse.mdx | FPTxFHL0 | 667 |
| horse.mdx | SPNxHBL0 | 29733 |
| horse.mdx | SPLxHBS0 | 31000 |
| horse.mdx | SPLxHBS1 | 31833 |
| horse.mdx | SPLxHBS3 | 32033 |
| linkstik.mdx | FPTxFBL1 | 17833, 20267 |
| linkstik.mdx | FPTxFBR1 | 18267, 20800 |
| linkstik.mdx | SNDxDBNT | 21333 |
| linkstik.mdx | SPLxHBS0 | 21500 |
| linkstik.mdx | SPLxHBS1 | 22333 |
| ma.mdx | SNDxDPAL | 17333 |
| ma.mdx | SPLxHBS1 | 18333 |
| ma.mdx | SPLxHBS0 | 17433 |
| ma.mdx | SPLxHBL1 | 17933 |
| ma.mdx | SPLxHBL2 | 17400, 17433 |
| ma.mdx | SNDxDDSH | 28333 |
| ma.mdx | FPTxFBL2 | 8133 |
| ma.mdx | FPTxFBR2 | 8000, 8253 |
| ma.mdx | SPNxHBR0 | 17333 |
| mfls.mdx | SNDxKBM1 | 265130, 266373, 267953, 272570, 272737, 272897 |
| mfls.mdx | SNDxDVLW | 11500 |
| negi.mdx | FPTxFBL0 | 9900 |
| negi.mdx | FPTxFBR0 | 10367 |
| negi.mdx | SNDxDVLC | 40033 |
| negi.mdx | SNDxDDSH | 43367 |
| negi.mdx | SPLxHBS0 | 40733 |
| negi.mdx | SPLxHBS1 | 42233 |
| negi.mdx | SPLxHBL1 | 40700 |
| negi.mdx | SPLxHBS3 | 40367 |
| niya.mdx | SNDXAOCR | 17733 |
| niya.mdx | SNDXDJAN | 22000 |
| niya.mdx | SNDXKBM1 | 14333 |
| niya.mdx | SNDXKBM2 | 31833 |
| niya.mdx | FPTxFBL0 | 28967 |
| niya.mdx | FPTxFBR0 | 29333 |
| niya.mdx | SNDXDDSO | 50133 |
| niya.mdx | SPLxHBL1 | 22267 |
| niya.mdx | SPLxHBS2 | 22267 |
| niya.mdx | SPLxHBL2 | 22800 |
| niya.mdx | SPLxHBS0 | 23067 |
| niya.mdx | SPLxHBL3 | 22833 |
| niya.mdx | SPNxHBSR | 22000 |
| picacugy.mdx | SNDxAOWW | 15833 |
| picacugy.mdx | SNDxDPMB | 21710 |
| pika.mdx | SNDxDWRD | 30333 |
| pika.mdx | FPTxFBR1 | 26801 |
| pika.mdx | FPTxFBL1 | 27115 |
| pika.mdx | SNDxDDSN | 50500 |
| pika.mdx | SPNxNBDH | 30300 |
| rabbit.mdx | SNDxDPES | 34367 |
| rabbit.mdx | SNDxKPES | 23233, 27700 |
| rabbit.mdx | FPTxFBL1 | 29833, 30800, 31767 |
| rabbit.mdx | FPTxFBR1 | 29400, 30367, 31333 |
| rabbit.mdx | SPLxHBL1 | 34400 |
| rabbit.mdx | SPLxHBS2 | 35000 |
| rabbit.mdx | SPLxHBS0 | 36133 |
| rabbit.mdx | SPNxHBP0 | 34367 |
| ye-wuqi1.mdx | SNDxKBM1 | 5000, 13333 |
| ye-wuqi1.mdx | SNDxKBM2 | 8333 |
| ye-wuqi1.mdx | SNDxAOCR | 11150 |
| ye-wuqi1.mdx | SNDxDDKN | 7000 |

## Extraction notes

- godie-1hswd-01-p0: rectangular 24.306x3.281 emission plane approximated by its bounding disc r=0.338 (vfx@1 has no box emitter)
- godie-1hswd-01-p1: rectangular 1.389x0.0 emission plane approximated by its bounding disc r=0.019 (vfx@1 has no box emitter)
- godie-1hswd-01-p2: rectangular 3.3x50.0 emission plane approximated by its bounding disc r=0.695 (vfx@1 has no box emitter)
- godie-aquaspikeversion2-p5: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-aquaspikeversion2-p9: negative emissionRate -25.0 folded to abs
- godie-blackhole-p6: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-blackhole1-p0: emissionRate 0, used KP2E peak 50.0
- godie-blackhole1-p1: emissionRate 0, used KP2E peak 50.0
- godie-blackhole1-p2: emissionRate 0, used KP2E peak 1000.0
- godie-boomnl-p0: rectangular 70.111x65.683 emission plane approximated by its bounding disc r=0.974 (vfx@1 has no box emitter)
- godie-boomnl-p0: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-boomnl-p1: rectangular 70.111x65.683 emission plane approximated by its bounding disc r=0.974 (vfx@1 has no box emitter)
- godie-boomnl-p1: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-boomnl-p2: rectangular 70.111x65.683 emission plane approximated by its bounding disc r=0.974 (vfx@1 has no box emitter)
- godie-boomnl-p2: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-boomnl-p3: rectangular 70.111x65.683 emission plane approximated by its bounding disc r=0.974 (vfx@1 has no box emitter)
- godie-boomnl-p3: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-boomnl-p4: rectangular 70.111x65.683 emission plane approximated by its bounding disc r=0.974 (vfx@1 has no box emitter)
- godie-boomnl-p4: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-bulbasaur-p0: emissionRate 0, used KP2E peak 10.0
- godie-darkbreathdamage-p0: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-darkraor-p1: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-darkraor-p2: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-deathwave-p0: emissionRate 0, used KP2E peak 236.7
- godie-deathwave-r0: additive ribbon with alpha 0 — alpha luma-keyed from RGB (GH#665)
- godie-deathwave-r1: additive ribbon with alpha 0 — alpha luma-keyed from RGB (GH#665)
- godie-deathwave-r2: additive ribbon with alpha 0 — alpha luma-keyed from RGB (GH#665)
- godie-demonfilth-p1: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-demonfilth-p2: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-demonfilth-p4: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-earthtornado2-p1: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-earthtornado2-p4: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-earthtornado2-p5: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-earthtornado2-p8: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-earthtornado2-p10: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-earthtornado2-p12: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-fireblast-p1: rectangular 42.139x36.059 emission plane approximated by its bounding disc r=0.585 (vfx@1 has no box emitter)
- godie-heroeva01s2-p0: emissionRate 0, used KP2E peak 31.5
- godie-herohanzouhattori-p0: rectangular 5.244x5.2 emission plane approximated by its bounding disc r=0.033 (vfx@1 has no box emitter)
- godie-herohehi-p0: rectangular 5.244x5.2 emission plane approximated by its bounding disc r=0.03 (vfx@1 has no box emitter)
- godie-herohimurakenshin-p0: rectangular 5.244x5.2 emission plane approximated by its bounding disc r=0.035 (vfx@1 has no box emitter)
- godie-heromiku-p1: dropped 4x4 spriteSheet (substituted single-frame texture)
- godie-heromusashimiyamoto-p0: rectangular 5.244x5.2 emission plane approximated by its bounding disc r=0.031 (vfx@1 has no box emitter)
- godie-heroraichus3-p0: emissionRate 0, used KP2E peak 31.5
- godie-herorider-p0: rectangular 150.0x0.0 emission plane approximated by its bounding disc r=1.136 (vfx@1 has no box emitter)
- godie-herosaber-p0: rectangular 5.244x5.2 emission plane approximated by its bounding disc r=0.035 (vfx@1 has no box emitter)
- godie-herosaber-p1: rectangular 0.03x0.0 emission plane approximated by its bounding disc r=0.001 (vfx@1 has no box emitter)
- godie-herosasuke-p0: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-herosephiroth-p0: rectangular 5.244x5.2 emission plane approximated by its bounding disc r=0.028 (vfx@1 has no box emitter)
- godie-heroshana-p0: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-heroshana-p1: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-heroshana-p2: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-herotoshiiemaeda-p0: rectangular 5.244x5.2 emission plane approximated by its bounding disc r=0.033 (vfx@1 has no box emitter)
- godie-heroxelloss-p0: dropped 4x4 spriteSheet (substituted single-frame texture)
- godie-herokyo-p0: rectangular 5.244x5.2 emission plane approximated by its bounding disc r=0.034 (vfx@1 has no box emitter)
- godie-holyawakening-p0: modulate emitter with segmentAlpha 0/0/0 — alpha luma-keyed from RGB (GH#665)
- godie-holyawakening-p0: emissionRate 0, used KP2E peak 40.0
- godie-holyawakening-p0: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-holyawakening-p1: modulate emitter with segmentAlpha 0/0/0 — alpha luma-keyed from RGB (GH#665)
- godie-holyawakening-p1: emissionRate 0, used KP2E peak 50.0
- godie-holyawakening-p1: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-holyawakening-p3: emissionRate 0, used KP2E peak 26.3
- godie-lightningtornado-p1: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-lightningtornado-p4: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-lightningtornado-p5: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-lightningtornado-p8: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-lightningtornado-p10: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-lightningtornado-p12: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-linainvers-p0: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-linainvers-p2: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-lubu-p0: emissionRate 0, used KP2E peak 60.0
- godie-lubu-p1: emissionRate 0, used KP2E peak 10.0
- godie-lubu-p2: emissionRate 0, used KP2E peak 10.0
- godie-meteor-p0: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-meteor-p1: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-meteor-p2: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-meteor-p3: emissionRate 0, used KP2E peak 90.0
- godie-meteor-p5: negative emissionRate -22.0 folded to abs
- godie-minitypeflame-p0: dropped 9x9 spriteSheet (substituted single-frame texture)
- godie-netherstrike-p0: emissionRate 0, used KP2E peak 30.0
- godie-netherstrike-p0: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-netherstrike-p1: emissionRate 0, used KP2E peak 20.0
- godie-netherstrike-p1: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-netherstrike-p2: emissionRate 0, used KP2E peak 20.0
- godie-netherstrike-p3: emissionRate 0, used KP2E peak 15.0
- godie-netherstrike-p4: emissionRate 0, used KP2E peak 10.0
- godie-renaryugu2-p0: rectangular 5.244x5.2 emission plane approximated by its bounding disc r=0.036 (vfx@1 has no box emitter)
- godie-renaryugu2-p1: rectangular 0.03x0.0 emission plane approximated by its bounding disc r=0.001 (vfx@1 has no box emitter)
- godie-sd2-r0: static heightAbove/Below 0/0, used KRHA/KRHB peak 24.0/36.0
- godie-sesshomaru-p0: rectangular 5.244x5.2 emission plane approximated by its bounding disc r=0.032 (vfx@1 has no box emitter)
- godie-tectonicfury-p0: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-tectonicfury-p1: negative emissionRate -10.41670036315918 folded to abs
- godie-billy-p0: emissionRate 0, used KP2E peak 100.0
- godie-cloud-p0: rectangular 5.244x5.2 emission plane approximated by its bounding disc r=0.034 (vfx@1 has no box emitter)
- godie-flamessmoke-p0: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-flamessmoke-p1: rectangular 60.517x61.255 emission plane approximated by its bounding disc r=0.851 (vfx@1 has no box emitter)
- godie-flamessmoke-p1: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-flamessmoke-p2: rectangular 60.517x61.255 emission plane approximated by its bounding disc r=0.851 (vfx@1 has no box emitter)
- godie-flamessmoke-p3: rectangular 60.517x61.255 emission plane approximated by its bounding disc r=0.851 (vfx@1 has no box emitter)
- godie-flamessmoke-p3: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-frostnova-p0: emissionRate 0, used KP2E peak 75.0
- godie-gumdam-p0: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-gumdam-p2: negative emissionRate -15.399999618530273 folded to abs
- godie-gumdam-p3: rectangular 58.639x117.377 emission plane approximated by its bounding disc r=0.39 (vfx@1 has no box emitter)
- godie-gumdam-p4: rectangular 25.0x-15.241 emission plane approximated by its bounding disc r=0.083 (vfx@1 has no box emitter)
- godie-gumdam-p4: dropped 8x8 spriteSheet (substituted single-frame texture)
- godie-gx-p0: rectangular 39.661x43.835 emission plane approximated by its bounding disc r=0.609 (vfx@1 has no box emitter)
- godie-gx-p0: emissionRate 0, used KP2E peak 50.0
- godie-gxhuge-p0: rectangular 39.661x43.835 emission plane approximated by its bounding disc r=0.609 (vfx@1 has no box emitter)
- godie-gxhuge-p0: emissionRate 0, used KP2E peak 50.0
- godie-herofate-p0: rectangular 5.244x5.2 emission plane approximated by its bounding disc r=0.046 (vfx@1 has no box emitter)
- godie-heroluffeattack-p0: rectangular 200.0x400.0 emission plane approximated by its bounding disc r=5.556 (vfx@1 has no box emitter)
- godie-heroluffeattack-p0: emissionRate 0, used KP2E peak 60.0
- godie-horse-p0: rectangular 40.0x10.0 emission plane approximated by its bounding disc r=0.208 (vfx@1 has no box emitter)
- godie-niya-p0: rectangular 5.244x5.2 emission plane approximated by its bounding disc r=0.209 (vfx@1 has no box emitter)
- godie-niya-p1: rectangular 0.03x0.0 emission plane approximated by its bounding disc r=0.001 (vfx@1 has no box emitter)
- godie-ye-wuqi1-p0: rectangular 160.0x9.662 emission plane approximated by its bounding disc r=0.614 (vfx@1 has no box emitter)
- godie-ye-wuqi1-p1: rectangular 10.0x30.0 emission plane approximated by its bounding disc r=0.115 (vfx@1 has no box emitter)
- godie-ye-wuqi1-p2: rectangular 10.0x20.0 emission plane approximated by its bounding disc r=0.077 (vfx@1 has no box emitter)
