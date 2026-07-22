# 打擊感稽核 — Capcom Street Fighter 對照 (2026-07-22)

對照真實程式碼的證據式稽核。狀態:strong=達標 / present-weak=有但弱 / wrong=實作但錯 / missing=沒有。

總計 49 項:{'missing': 12, 'present-weak': 18, 'wrong': 5, 'strong': 14}


## P0 (1)

### [missing] Single unified hit-weight / ImpactProfile driving all channels  ·  _mixed_ · integration-orchestration
- **Capcom 標準**: In SF one hit-weight value drives freeze+shake+spark+flash+sound together; here five decoupled constants make the boundary fuzzy.
- **證據**: Searched apps/client/src + packages/shared/src for ImpactProfile|hitWeight|impactTier|hitTier — NOT FOUND. Instead each channel classifies weight with its OWN constant: sim hitstop HITSTOP_PER_IMPACT=55 + min-impact 12 (damage.ts:37-41); client anim hitstop HITSTOP_DMG_PER_TICK=22 (combatFeedback.ts:73); blood/spark HEAVY_DAMAGE=60 (bloodPresets.ts:99); ripple HEAVY_HIT_DMG=120 (GameApp.ts:111); shake continuous SHAKE_DMG_SLOPE=0.006 (combatFeedback.ts:98); sfx no magnitude at all (combatSfx.ts:40-50)
- **落差**: There is NO single light/med/heavy/crit/EX classification. Five channels each pick their own 'heavy' cut (22 / 55 / 60 / 120 / continuous), so a 100-damage swing is simultaneously: near-max shake, a NON-heavy spark (spark heavy=crit||kill only, VfxSystem.ts:602), heavy blood, NO ripple (below 120), 3-tick client freeze but 3-tick sim freeze via a different formula. The punch is diffuse instead of one coordinated POP scaled by one number — the exact 'scattered/uncoordinated' failure.
- **修法**: Have the sim compute ONE ImpactProfile per landed hit {impact, dmg, tier:0..3, crit, blocked, guardBreak, killingBlow} in applyImpact and put it on BOTH damage+hitImpact payloads (or a single merged `hitImpact`). Client: derive shake amp, spark heaviness, blood band, ripple gate, hitstop ticks, sfx variant, flash intensity all from profile.tier/profile.impact so every channel crosses the light→heavy boundary on the SAME frame at the SAME threshold.
- **檔案**: packages/shared/src/sim/combat/damage.ts, apps/client/src/render/combatFeedback.ts, apps/client/src/GameApp.ts, apps/client/src/vfx/VfxSystem.ts, apps/client/src/vfx/bloodPresets.ts, apps/client/src/audio/combatSfx.ts


## P1 (20)

### [missing] Crit / counter / guard-break hitstop emphasis (the distinct 'heavy read')  ·  _sim_ · hitstop-hitstun
- **Capcom 標準**: 命中定格: counter/crush get a longer freeze — the dramatic pause that says 'that one HURT'.
- **證據**: applyImpact receives crit and guardBreak (damage.ts:79-80,256) but neither affects freeze length — hitstop ticks depend ONLY on raw impact (damage.ts:97-99); crit is used solely in the emit at damage.ts:88; guardBreak only fires an event at damage.ts:91. Searched damage.ts for any crit/guardBreak multiplier on ticks — not found.
- **落差**: In SF the signature of a big moment is a DISTINCTLY longer freeze on crit / counter-hit / guard-crush, not just the incidental extra length from higher damage. Here a crit freezes longer only because it happens to deal more damage; a crit for equal post-mitigation impact freezes identically to a normal hit, and a guard-shatter (the biggest 破碎 moment) gets zero extra hold. The 破碎衝擊 punch is under-sold on exactly the hits that should sell it hardest.
- **修法**: Add a small additive/multiplicative hitstop bonus for crit (e.g. +2 ticks) and a larger one for guardBreak (e.g. set floor to HITSTOP_MAX on shatter), clamped to a new counter cap (~8). Keep it deterministic (integer, no rng) so prediction still replays. Mirror the same bonus in the client curve per the previous finding.
- **檔案**: packages/shared/src/sim/combat/damage.ts

### [missing] Camera translational KICK/PUNCH on impact  ·  _camera_ · screenshake-camera
- **Capcom 標準**: 3 — impact punch / directional camera kick.
- **證據**: Searched CameraRig.ts and GameApp.ts: the only impact camera response is the oscillatory addShake (CameraRig.ts:261-300). There is no single directional impulse-and-recover offset. apply() only adds oscillating shakeX/shakeY (CameraRig.ts:388-394). No 'kick', 'recoil', or 'punch' translation found beyond shake.
- **落差**: Capcom hit-feel leads with a hard directional camera KICK on the contact frame (camera lurches in the hit direction, then snaps back), separate from the ringing jitter. Only the ringing jitter exists here, so contact lacks the initial 破碎衝擊 shove.
- **修法**: Add a one-shot directional kick: on impact push the camera eye a small distance along the hit vector for ~1-2 frames, then ease back with a fast (cubic) recovery, layered on top of the existing jitter. Reuse the ShakeImpulse pool with a directional term. Touches: CameraRig.ts, GameApp.ts.
- **檔案**: 

### [missing] EX / super camera treatment (freeze + darken + zoom)  ·  _camera_ · screenshake-camera
- **Capcom 標準**: 3 + 8 — camera zoom on EX / super freeze.
- **證據**: EX is routed as an ability slot (GameApp.ts:102 SLOT_INDEX EX:4, abilityForSeat EX branch lines 1088-1092) but produces NO camera response: the only cameraRig call from the event drain is addShake at GameApp.ts:1051, keyed on the generic damage event, not on EX/abilityCast. Searched GameApp.ts/CameraRig.ts for freeze/darken/zoomIn/timeScale on EX — none. abilityCast events (combat-juice.md contract) never reach cameraRig.
- **落差**: Checklist item 8 (SUPER/EX FREEZE: dramatic pause + darken + zoom) has zero camera participation. An EX cast is visually indistinguishable from any other hit at the camera level — no zoom-in, no hold, no framing beat on the signature move.
- **修法**: On EX cast/hit, drive a brief cinematic beat from CameraRig: quick zoom/dolly-in on the caster, a short hold, fast recover (pair with the sim EX-freeze if one exists and a post-fx darken). Add an EX-specific camera method and fire it from the abilityCast/EX path in the event drain. Touches: CameraRig.ts, GameApp.ts (EX event handling ~line 695/1089), coordinate with vfx post-fx for darken.
- **檔案**: 

### [missing] Counter-hit / crush red spark identity  ·  _vfx_ · hitsparks-flash
- **Capcom 標準**: Checklist 4: counter spark must be DISTINCT (red). Entirely absent.
- **證據**: searched packages/shared/src/sim/** and apps/client/src/** for counterHit/counter-hit/isCounter/counterhit — not found (only unrelated tick 'counter' variables). hitImpact (VfxSystem.ts:596) branches only on `blocked` and `crit`/`killingBlow`->heavy; there is no counter-hit sim flag and no third (red) spark path. IMPACT_TINTS (vfxPresets.ts:522-527) has physical/magic/true/guardBreak but no counter tint.
- **落差**: The SF checklist's third spark identity — the RED counter/crush spark that rewards hitting an opponent during their startup — does not exist. Heavy hits reuse the same warm tint as light hits (just more layers + a ring via `heavy`), so a crit and a counter are visually the same warm spark. No dramatic red flash marks a punish, which is a signature Capcom impact beat.
- **修法**: Add a `counter`/`crush` boolean to the sim's hit resolution (packages/shared/src/sim/combat/damage.ts) emitted on hitImpact, then add IMPACT_TINTS.counter (saturated red e.g. [1,0.2,0.15]) and route it through an 'ex'-weight HitSpark with a distinct larger flash so counters read instantly. Give the victim flash a counter variant too.
- **檔案**: packages/shared/src/sim/combat/damage.ts, apps/client/src/vfx/VfxSystem.ts, apps/client/src/vfx/vfxPresets.ts, apps/client/src/render/combatFeedback.ts

### [missing] Solid-chunk / voxel-shatter debris on hit and death  ·  _vfx_ · particles-blood-explosion
- **Capcom 標準**: checklist 6 破碎 — a SHATTERING impact should knock visible MASS (chunks/shards) off the struck body, the literal meaning of 破碎衝擊 in a voxel game
- **證據**: grep across apps/client/src for shatter|debris|chunk|fragment|voxelBurst|shard — the only 'debris' is WhirlwindFx.ts:177-178 (an ability-specific BurstSpec SPRITE ring) and ProjectileView 'shard' (a projectile mesh), never an on-hit body-shatter. Every impact-debris layer is a BILLBOARD sprite: sparks (vfxPresets.ts:553-566, additive quads) and blood droplets (bloodPresets.ts:262-283, alpha quads). Death emits only EX pop + ash smoke + floor dust (VfxSystem.ts:681-686); docs/todo/particles.md:72-76 explicitly defers the champion-MESH death dissolve/shatter to ChampionView as NOT done.
- **落差**: The heaviest 'shatter' cue a fighting game lands — opaque geometric fragments bursting off the point of contact — does not exist. All 破碎 is read through translucent billboards, which glow/haze rather than convey broken solid mass. In a VOXEL arena this is the single biggest missed opportunity: a struck body should shed a few short-lived opaque cubes/shards on heavy/crit/kill.
- **修法**: Add a pooled solid-chunk debris layer: 4–12 small instanced opaque cubes (reuse the voxel figure's palette) spawned on heavy/crit/killingBlow at the hit point, initial velocity along the damage vector + up-bias, gravityY≈-20, life 0.25–0.45s, then cull (snap-clear, no fade-glow). Fire it from VfxSystem hitImpact/death alongside bloodSpray. New file apps/client/src/vfx/DebrisChunkFx.ts (mirror BurstPool discipline) wired in VfxSystem.ts:596-633 and :671-687.
- **檔案**: apps/client/src/vfx/VfxSystem.ts, apps/client/src/vfx/vfxPresets.ts, apps/client/src/render/views/ChampionView.ts

### [missing] EX/Super dramatic pause (命中定格 / super-freeze on cast)  ·  _sim_ · superfreeze-ex-damagetext
- **Capcom 標準**: SF super/EX flash FREEZES both fighters for a beat (a global timescale-0 hold) at the moment the super activates — the 'here it comes' pause that makes the EX read as an event, not just another cast.
- **證據**: The ONLY EX-cast treatment is a bigger VFX pop: apps/client/src/vfx/VfxSystem.ts:502-504 (isEx → layeredPop 'ex' + play with EX_BURST_BOOST=1.6, VfxSystem.ts:105). No time-hold exists: packages/shared/src/sim/systems/HitstopSystem.ts only DECAYS hit-driven hitstop/knockdown counters; the only setter is landed-damage in packages/shared/src/sim/combat/damage.ts:37-60 (HITSTOP_MIN/MAX 2..6 ticks), never the cast path. Searched packages/shared/src/sim/abilities/abilitySystem.ts (cast at :158-163), combatJuice, CastResolveSystem for timeScale|pause|freeze on EX/cast — not found. So an EX cast produces zero freeze; its damage lands with the same generic 2-6 tick hitstop as a normal hit.
- **落差**: 破碎衝擊 is entirely carried by a particle burst; there is no time-domain punctuation, so the signature 'the world stops for your super' beat is absent. The EX does not feel weightier than a Q in the time domain.
- **修法**: Add a CLIENT-side cosmetic super-freeze (do NOT pause the deterministic sim). On the abilityCast event where def.slot==='EX' (already detected in VfxSystem.ts:502), hold render interpolation / freeze the local view for ~6-10 frames with a snap-in and a crisp release (respect the project's 收尾精準 value: fast, clean settle, no long ramp-out). Drive it from a new small client freeze controller invoked in GameApp.applyCombatFeedback / handleEvent alongside the existing shake path (apps/client/src/GameApp.ts:697). Files: apps/client/src/GameApp.ts, apps/client/src/vfx/VfxSystem.ts (or a new render/ExFreeze.ts), apps/client/src/render/CameraRig.ts.
- **檔案**: apps/client/src/vfx/VfxSystem.ts, packages/shared/src/sim/systems/HitstopSystem.ts, packages/shared/src/sim/combat/damage.ts, packages/shared/src/sim/abilities/abilitySystem.ts, apps/client/src/GameApp.ts

### [missing] EX camera zoom / punch-in / 特寫  ·  _camera_ · superfreeze-ex-damagetext
- **Capcom 標準**: The super cut-in pushes the camera IN on the attacker for the freeze, then snaps back — the zoom is half of why the EX reads as cinematic.
- **證據**: CameraRig exposes only user-wheel zoom (apps/client/src/render/CameraRig.ts:125 zoomBy) and a spectate widen (CameraRig.ts:131-145); no programmatic cinematic push-in. Camera SHAKE exists (apps/client/src/render/combatFeedback.ts:92-125 impactShakeAmp, queued as impulses in CameraRig) but is driven ONLY by the 'damage' event via GameApp.applyCombatFeedback (GameApp.ts:697,1030-1055), never by abilityCast. Searched CameraRig.ts / combatFeedback.ts for punch|kick|zoomIn|push on EX/cast — not found; the EX abilityCast branch (VfxSystem.ts:484-505) touches no camera.
- **落差**: The camera is completely inert on an EX cast — no push-in, not even a shake kick — so the biggest cast in the game moves the frame less than taking a basic-attack hit does.
- **修法**: Add a punch-in method to CameraRig (transient dolly toward DOLLY_MIN with a fast ease-in / crisp ease-out, auto-restoring the user's zoom clamp like CameraRig.ts:145 already does on spectate exit) and trigger it from the EX branch, ideally synchronized with the super-freeze hold. Optionally add a one-shot shake impulse on EX cast for the release frame. Files: apps/client/src/render/CameraRig.ts, apps/client/src/render/combatFeedback.ts, apps/client/src/GameApp.ts, apps/client/src/vfx/VfxSystem.ts.
- **檔案**: apps/client/src/render/CameraRig.ts, apps/client/src/render/combatFeedback.ts, apps/client/src/GameApp.ts, apps/client/src/vfx/VfxSystem.ts

### [present-weak] HITSTUN as a victim-specific recovery-lock (frame advantage) distinct from hitstop  ·  _sim_ · hitstop-hitstun
- **Capcom 標準**: 擊退/hitstun: victim recovery-lock on hit AND on block, attacker recovers first (frame advantage).
- **證據**: The only symmetric freeze is hitstop — attacker and victim get the SAME ticks (damage.ts:101-102). Knockback sets nav.override (damage.ts:122) but the action gates in BasicAttackSystem.ts:77-81 and CastResolveSystem.ts:26-33 check ONLY knockdown + hitstop, NOT nav.override kind==='knockback'. So once the shared hitstop expires, a victim being knocked back can immediately attack/cast while sliding.
- **落差**: There is no state where the victim is locked LONGER than the attacker — i.e. no true hitstun / frame advantage. On a normal medium hit the victim recovers exactly when the attacker does, and the pushback slide is not an actionlock. This removes the 'you got hit, now you're on the back foot' beat; only heavy KD-threshold hits (impact>=170) actually lock the victim (knockdown). Everything between chip and knockdown gives the defender free actions mid-shove.
- **修法**: Add a short victim-only hitstun counter (a few ticks, scaling with impact, always >= the attacker's hitstop) that roots actions like knockdown-lite (no prone), and gate BasicAttack/CastResolve on it. Keeps the attacker's advantage window and makes pushback a real disadvantage, not a free slide.
- **檔案**: packages/shared/src/sim/combat/damage.ts, packages/shared/src/sim/systems/BasicAttackSystem.ts, packages/shared/src/sim/systems/CastResolveSystem.ts, packages/shared/src/sim/systems/MovementSystem.ts

### [present-weak] Contact-point placement of the hit spark  ·  _vfx_ · hitsparks-flash
- **Capcom 標準**: Checklist 4: spark AT THE CONTACT POINT. Currently at victim center / fixed height, not the strike surface.
- **證據**: apps/client/src/vfx/VfxSystem.ts:622 fires `new HitSpark(this.scene, pos.x, pos.z, ...)` where `pos` is the VICTIM's entity position (posFromEvent, target center), and ImpactComposer defaults y=1.0 (apps/client/src/vfx/vfxPresets.ts:618 `const y = opts.y ?? 1.0`). No weapon/limb intersection point is computed; damageVector (VfxSystem.ts:442) is only used to aim blood/block cones, not to offset the spark toward the strike surface.
- **落差**: The spark blooms from the victim's torso-center at a fixed 1.0u height rather than at the actual contact surface (weapon edge / fist / the facing side of the body). Capcom sparks ignite exactly where steel meets body; a center-of-mass spark at constant height reads as 'a hit happened near this unit' rather than a precise strike, weakening the 力量感. Aerial/knocked-down victims get the spark at 1.0u regardless of real body height.
- **修法**: Offset the spark toward the attacker: place it at pos + normalize(damageVector)*bodyRadius (the surface facing the attacker), and derive y from the victim's model mid-height (or the projectile's impact y) instead of the hard-coded 1.0. Pass the computed y into HitSpark/ImpactComposer.fire.
- **檔案**: apps/client/src/vfx/VfxSystem.ts, apps/client/src/vfx/HitSpark.ts, apps/client/src/vfx/vfxPresets.ts

### [present-weak] Punchy core-flash + shockwave on NON-EX AoE / explosion landings  ·  _vfx_ · particles-blood-explosion
- **Capcom 標準**: checklist 6 — an explosion should POP (bright core + expanding shockwave ring) then crisply clear, not billow
- **證據**: The ImpactComposer pop (flash + sparks + smoke + shockwave ring, vfxPresets.ts:541-581) is only fired via HitSpark for: EX casts (VfxSystem.ts:502-503), per-victim hits (:621-632), death (:685), flowerBurst (:705), revive (:723). A non-EX AoE ability that lands on the GROUND (point target, no victim entity) gets ONLY its front-loaded imported doc — abilityCast at :498-504 calls play(doc) with NO layeredPop unless slot==='EX'. The imported docs are additive smoke/fire trails (content/vfx/godie-meteor-p1.json rate 60 alpha smoke, godie-fireblast-p2.json additive flame) with no bright core or ground shockwave.
- **落差**: A heavy non-EX ground nuke reads as a soft additive billow with no shatter transient and no floor shockwave — weak 破碎衝擊. Only the ultimate gets the real explosion punch. Task #123 (pending) confirms the shared explosion/nova primitive is not yet built.
- **修法**: In VfxSystem.abilityCast, fire a heavy layeredPop (ImpactComposer 'heavy', tint=tintOfDoc) for point-target abilities whose radius/damage exceeds a threshold, not just EX — so every AoE detonation gets the core flash + expanding shockwave ring. Best done as part of the #123 shared nova/explosion primitive.
- **檔案**: apps/client/src/vfx/VfxSystem.ts, apps/client/src/vfx/vfxPresets.ts

### [present-weak] No light / medium / heavy weight tiers — one identical thud for every physical hit  ·  _sfx_ · sfx-layering
- **Capcom 標準**: Checklist 7: distinct light/medium/heavy hit sounds; heavier hit = more low-freq body + lower pitch. Weight must be audible per-hit.
- **證據**: apps/client/src/audio/combatSfx.ts:40-58 combatSfxKey() returns a bare string per event: every non-crit non-magic non-true physical hit → 'hit' (fx/thud.wav) with no reference to damage magnitude. Call site apps/client/src/GameApp.ts:698-699 `const sfxKey = combatSfxKey(ev); if (sfxKey) audioSystem.playSfx(sfxKey);` — playSfx invoked with NO opts, so the per-call `volume`/`pan` in SfxPlayOptions (AudioSystem.ts:151, playSfx:596) is never used to scale by hit weight. A heavy-hit sample lab/impact-heavy.wav (ffprobe dur=0.547s) exists but is wired to no key (grep impact-heavy across apps/client + content/config — not found).
- **落差**: A 12-damage jab and a 400-damage ultimate connect play the exact same thud.wav at the same fixed 0.6 gain — no low-freq-body increase, no pitch drop, no volume swell for heavy blows. Capcom hit-feel makes weight audible; here weight lives only in VFX/shake, the audio is flat. crit and knockdown are the only 'heavier' voices and they are triggered by discrete flags, not a continuous weight scale.
- **修法**: Add a light/medium/heavy split in combatSfxKey keyed on ev.data.amount thresholds (thud-light / thud / thud-heavy), OR pass opts.volume = clamp(base + f(amount)) and a downward pitch bias into playSfx from the call site. Synthesize thud-light (shorter, less body) and thud-heavy (more sub-150Hz body, ~+80ms) via the existing GENERATE.sh pattern; wire the already-present impact-heavy as the heavy layer if a wet variant is wanted.
- **檔案**: apps/client/src/audio/combatSfx.ts, apps/client/src/GameApp.ts, content/assets/audio/sfx/fx/GENERATE.sh, content/config/audio-map.json

### [present-weak] Weapon swing SMEAR/trail (刀光) coverage across the roster  ·  _vfx_ · anim-contact-trails
- **Capcom 標準**: Every SF normal/special has a distinct blade/limb streak on the active frames; the smear is generated by the attack, not bolted to a subset of characters.
- **證據**: content/config/ambient-vfx.json has only 9 model bindings (imported.gumdam, herorider, heroshana, renaryugu2, sd2, ye-wuqi1, mfls, heromusashimiyamoto, sesshomaru). AmbientVfx.ts:132-171 builds a RibbonTrail/swing-particle ONLY from these per-model bindings. VfxSystem.ts:648-656 handles basicAttack/attackWindup but ONLY calls noteAim() — it spawns NO smear. Searched VfxSystem.ts, CombatFeedbackFx.ts, feedbackPresets.ts, EntityViewRegistry.ts — no generic attack-event-driven swing arc.
- **落差**: The 刀光劍影 smear that sells a melee swing exists for ~9 of ~113 champions. Every other champion swings a sword/fist with zero streak, so the 破碎衝擊 windup reads flat — the eye gets no motion vector into the impact. The smear is a static ambient binding tied to the model's weapon bone, not a beat fired by the attack, so a champion without a binding (or whose bound bone the attack clip doesn't move) never smears no matter how hard it swings.
- **修法**: Add a generic, attack-event-driven swing smear: on attackWindup/basicAttack in VfxSystem, spawn a short RibbonTrail (or the existing swingTrail preset) on the attacker's resolved weapon/hand bone for the windup span, tinted by weapon/dmgType, reusing the same 0.25s RIBBON_FADE_BUDGET so it stays crisp. Fall back to a hand bone when no weapon bone resolves. This makes the smear a per-swing beat (checklist 10) instead of a per-model art asset that 92% of the roster is missing.
- **檔案**: apps/client/src/vfx/VfxSystem.ts, apps/client/src/vfx/AmbientVfx.ts, apps/client/src/vfx/RibbonTrail.ts, content/config/ambient-vfx.json

### [present-weak] ATTACK_STRIKE_FRACTION is a fixed 0.5 for every model — contact hold may not align with the clip's real impact frame  ·  _anim_ · anim-contact-trails
- **Capcom 標準**: Hitstop and the spark land exactly on the active/contact frame, not a fixed clip percentage.
- **證據**: EntityViewRegistry.ts:41 `const ATTACK_STRIKE_FRACTION = 0.5;` used at :194-195 to size the clip window so the strike lands at the damage tick. This assumes every champion's attack clip delivers its blow at exactly 50% of the clip. Imported WC3 clips have varied strike timing; no per-model strike-frame field was found (searched ClipAnimator.ts, model docs clipMap, AnimationStateMachine.ts).
- **落差**: When a clip's true impact frame is not at 50% (a big wind-up axe hits at ~0.7, a quick jab at ~0.25), the hitstop freeze and the hit spark fire while the blade is still travelling or already recovering — the freeze holds the WRONG frame. That desync blunts the 破碎衝擊: the punch and the pause don't coincide, so the settle reads mushy instead of precise (收尾精準).
- **修法**: Add an optional per-model `strikeFraction` (or strike-frame seconds) to the model doc / clipMap and thread it into the windup window math, defaulting to 0.5. For imported rigs, derive it once from the clip's root-motion/hand-velocity peak. Aligns the freeze + spark to the actual contact frame per champion.
- **檔案**: apps/client/src/render/EntityViewRegistry.ts, apps/client/src/render/ClipAnimator.ts

### [present-weak] Channels split across two events with DIFFERENT amount semantics (impact vs dmg)  ·  _mixed_ · integration-orchestration
- **Capcom 標準**: Block should still shake+spark+freeze scaled to blow force; here shake alone is wired to HP-loss and vanishes on a shielded hit.
- **證據**: damage.ts:88 hitImpact carries amount=impact (post-mitigation, PRE-shield); damage.ts:241-252 `damage` carries amount=dmg (post-shield HP loss). Spark+blood read hitImpact.amount=impact (VfxSystem.ts:603,622,625); shake+ripple+vignette+client-hitstop+number+sfx read damage.amount=dmg (GameApp.ts:1040,1050,1055,1057; EntityViewRegistry.ts:221-222; VfxSystem.ts:546; combatSfx.ts). applyCombatFeedback returns early when dmg<=0 (GameApp.ts:1041).
- **落差**: For a fully-shielded heavy hit dmg=0 but impact is large: the sim STILL freezes (impact>=12), VFX still fires the block-spark, block SFX plays — but applyCombatFeedback returns at line 1041 so there is NO camera shake at all. The sim doc explicitly wants a blocked heavy hit to read as impact (damage.ts:28-30), yet the loudest channel (shake) is keyed off the wrong number and silently drops. Guard-crush moment loses its screen kick.
- **修法**: Drive shake/ripple/vignette off `impact` (pre-shield force) from the shared profile, not post-shield dmg; keep the floating NUMBER on dmg. Then a blocked heavy hit shakes (scaled by KB_BLOCK-style block multiplier) instead of going silent, and all reaction channels use the one 'how hard it landed' scalar.
- **檔案**: apps/client/src/GameApp.ts, apps/client/src/vfx/VfxSystem.ts, apps/client/src/render/EntityViewRegistry.ts, packages/shared/src/sim/combat/damage.ts

### [present-weak] Per-channel 'heavy' thresholds are mutually inconsistent  ·  _mixed_ · integration-orchestration
- **Capcom 標準**: Light vs heavy must be ONE boundary felt across all channels at once; four thresholds smear it.
- **證據**: Heavy defined 4 different ways: ripple crit||kill||amount>=120 (GameApp.ts:1057); blood band amount>=60 with damageScale saturating at 60 (bloodPresets.ts:99,110,117-120); spark heavy flag = crit||killingBlow ONLY, magnitude ignored (VfxSystem.ts:602); shake continuous with crit×1.5/kill×2.2 (combatFeedback.ts:100-101).
- **落差**: A 90-damage non-crit swing: heavy blood (>=60), big shake, but a LIGHT spark (not crit/kill) and NO ripple (<120). A 65-damage hit: heavy blood but small everything else. The visual 'this was a big hit' signal fires on different channels at different times, so no single crisp weight tier reads — the opposite of a unified POP.
- **修法**: Replace all four with profile.tier (derived once from impact, with crit/kill bumping tier). Spark size, blood band, ripple gate, shake amp, flash alpha all switch on the same tier so light/med/heavy is one coherent step across every channel.
- **檔案**: apps/client/src/GameApp.ts, apps/client/src/vfx/bloodPresets.ts, apps/client/src/vfx/VfxSystem.ts, apps/client/src/render/combatFeedback.ts

### [wrong] Client animation-freeze locked to the sim hitstop window  ·  _mixed_ · hitstop-hitstun
- **Capcom 標準**: 命中定格: the visual freeze must be exactly the impact freeze; a body frozen while its animation plays reads as a bug, not a hit.
- **證據**: Client recomputes its own freeze from the damage event, NOT from world.hitstop: EntityViewRegistry.ts:222 hitstopMs=hitstopMsForDamage(amount,TICK_MS) with amount=ev.data.amount (=dmg, post-shield HP removed, see damage.ts:198/241-253); combatFeedback.ts:80-84 uses clamp(1+floor(amount/22),1,6). Sim uses IMPACT (pre-shield, post-mitigation) with clamp(2+floor(impact/55),2,6) at damage.ts:97-99. Different input AND different curve.
- **落差**: The doc claims the client freeze 'reads in lock-step' (combatFeedback.ts:14-17) but it does not. Two concrete breaks: (1) a fully-blocked hit — sim still freezes both bodies (impact>=12, comment damage.ts:30) but client amount=dmg=0 -> hitstopMsForDamage(0)=0 -> NO animation freeze, so the body position-freezes while the limbs keep swinging (feel desync, the opposite of 收尾精準). (2) At higher damage the curves diverge (100 dmg -> client 5 ticks vs sim 3 ticks), so the pose un-freezes out of sync with the body.
- **修法**: Drive the client animation freeze from the authoritative sim hitstop counter (it is already replicated/in the digest) rather than re-deriving from the damage amount, OR at minimum feed the client the same IMPACT value + identical curve constants. Emit the hitstop tick count on the hitImpact/damage event and have setHitstop consume that directly.
- **檔案**: apps/client/src/render/EntityViewRegistry.ts, apps/client/src/render/combatFeedback.ts, packages/shared/src/sim/combat/damage.ts

### [wrong] Directional shake (aligned to hit/knockback vector)  ·  _camera_ · screenshake-camera
- **Capcom 標準**: 3 — shake is DIRECTIONAL.
- **證據**: advanceShake sums ox += mag*sin(age*freq+phase), oy += mag*cos(age*freq*1.3+phase) (CameraRig.ts:295-296); phase comes from a self-incrementing shakePhaseSeed (line 278), NOT from the hit direction. addShake(amp, durationMs) takes no direction argument (CameraRig.ts:261); GameApp.ts:1050-1051 passes none. The damage event carries x/z/source/target (combat-juice.md event contract) but the knockback vector is never forwarded to the shake.
- **落差**: The checklist explicitly requires a DIRECTIONAL shake; this is a symmetric radial jitter with a decorrelated random-ish phase, identical whether you are hit from the left or from behind. It loses the 'the blow came from THERE' punch that is core to SF impact.
- **修法**: Add a direction param to addShake (unit vector from source→victim, or victim→source for a taken hit) and bias the first oscillation along it — e.g. seed the impulse with a directional kick component (see next finding) plus a smaller perpendicular jitter. Compute the vector in GameApp.applyCombatFeedback from ev.data source/target positions. Touches: CameraRig.ts (ShakeImpulse+addShake+advanceShake), GameApp.ts:1049-1052.
- **檔案**: 

### [wrong] Open regression: stuck bright-white particle burst polluting the arena  ·  _vfx_ · particles-blood-explosion
- **Capcom 標準**: no light pollution / must snap-clear (#37/#33) — a persistent emitter is the exact opposite of 收尾精準
- **證據**: Ledger task #131 (pending): 'Combat: persistent bright-white particle burst stuck in top-right of the arena view'. Searched apps/client/src/vfx for the cause — not localized to a line. Suspect surface: pooled ParticleSystems in VfxSystem.play (:336-402) and BurstPool.fireAt (vfxPresets.ts:373-402) are start()-ed and reused but never explicitly stop()-ed; a mis-positioned reuse or a system left emitting (emitRate/manualEmitCount) would present as a fixed bright burst that never clears.
- **落差**: A live, reported lingering-emitter defect directly violates this dimension's core value (no pollution, snap-clear). It is bright/white → almost certainly an additive layer (flash/sparks) whose pooled system is stuck emitting or parked at a stale world position.
- **修法**: Repro, then audit pooled additive systems for a start() without a corresponding idle stop() and for a reuse path that fails to re-point ps.emitter before firing; assert emitRate stays 0 and manualEmitCount resets after each burst. Add a test that no pooled system reports live particles after busyWindow elapses.
- **檔案**: apps/client/src/vfx/VfxSystem.ts, apps/client/src/vfx/vfxPresets.ts, apps/client/src/vfx/HitSpark.ts

### [wrong] Block/guard hit voice RINGS — the one combat clip that violates 收尾精準  ·  _sfx_ · sfx-layering
- **Capcom 標準**: Checklist 7/收尾精純: block/guard is a core hit-vs-block distinct sound and must still be a crisp clank with a very short tail — attack transient + fast release, no lingering.
- **證據**: content/config/audio-map.json block => ['assets/audio/sfx/lab/block-clash.wav','assets/audio/sfx/lab/block-shield.wav'] gain 0.63. These are externally-acquired samples (lab/ACQUIRE.py), NOT the synth set. ffprobe: block-clash.wav dur=0.735s, block-shield.wav dur=0.596s. Measured RMS envelope: block-clash peakAt=14% RMS=0.09,0.24,0.20,0.17,0.10,0.05,0.03,0.02,0.01 (audible energy out to ~0.66s); block-shield peakAt=13% RMS=0.31,0.35,0.26,0.14,0.07,0.04,0.02,0.01. Meanwhile a purpose-built crisp synth clip EXISTS but is unwired: content/assets/audio/sfx/fx/GENERATE.sh:132-139 synth guard (guard.wav, ffprobe dur=0.12s) — never referenced by any audio-map key.
- **落差**: Block has a SLOW onset (peak at 13-14% of the clip, not the front) and a long lingering tail — audible ring out to ~0.5-0.66s, 3-5x longer than every synth hit clip and far past the '<=0.25s / snap-clear' project value. On a fighting-game block/parry this reads as mush, not a crisp deflect. The crisp 0.12s fx/guard.wav that matches the rest of the set is sitting unused while the block key points at the ringing external samples.
- **修法**: Repoint audio-map.json `block` to the synth fx/guard.wav (or hard-gate the lab clips through GENERATE-style processing: trim to <=0.2s, front-load the transient with a 3ms fade-in, and apply an exponential fade-out st=0.03 d=0.15). Keep two variants for anti-repetition but both must peak in the first 5% and be silent by ~0.2s.
- **檔案**: content/config/audio-map.json, content/assets/audio/sfx/fx/GENERATE.sh, content/assets/audio/sfx/lab/block-clash.wav, content/assets/audio/sfx/lab/block-shield.wav

### [wrong] Client animation hitstop synced to the sim's authoritative tick-freeze  ·  _sim_ · integration-orchestration
- **Capcom 標準**: Hitstop must freeze attacker+victim for exactly the same window; two different formulas on two different amounts break the frozen-on-contact read.
- **證據**: combatFeedback.ts:14-17 + :80-84 claim the client freeze 'mirrors the sim curve … floor of 1 tick … +1 per 22 dmg'. But sim damage.ts:38-41,97-100 uses floor 2 (HITSTOP_MIN_TICKS=2), +1 per 55 IMPACT, and a chip cutoff impact<12 = NO freeze. Client EntityViewRegistry.ts:221-222 feeds hitstopMsForDamage(damage.amount=dmg), i.e. post-shield dmg through the /22 curve. world.hitstop is NOT serialized (grep hitstop in net/protocol/schema — NOT FOUND), so the client never sees the real freeze length; it re-derives a different one.
- **落差**: The two freeze windows diverge despite the 'lock-step' docstring: (a) chip hits dmg 1-11 freeze the client anim (floor 1, amount>0) but the sim does NOT freeze (impact<12) → visible micro-stutter where the world keeps moving; (b) a shielded heavy hit freezes the sim (impact-based, long) far longer than the client anim shows (tiny dmg through /22); (c) even an unshielded hit: sim floor 2 @ /55 vs client floor 1 @ /22 give different tick counts. The attacker/victim model unfreezes off-beat from the actual sim position-freeze — hitstop reads mushy.
- **修法**: Serialize the sim's per-entity hitstop tick count (or the ImpactProfile.freezeTicks) and have setHitstop consume THAT × TICK_MS, deleting the client-side hitstopTicksForDamage re-derivation. One curve, one source of truth, keyed off impact.
- **檔案**: apps/client/src/render/combatFeedback.ts, apps/client/src/render/EntityViewRegistry.ts, packages/shared/src/sim/combat/damage.ts


## P2 (28)

### [missing] Launcher / vertical knock-up (上挑) for launch moves  ·  _sim_ · hitstop-hitstun
- **Capcom 標準**: 擊退: launchers send the victim up (juggle/上挑).
- **證據**: Searched packages/shared/src/sim/** for knockup|airborne|popup|verticalVel|pos.y impulse|上挑|浮空 — not found. nav.override kind is only 'dash'|'knockback' (components.ts:52); knockback dir is planar x/z (damage.ts:114) integrated on the ground plane (MovementSystem.ts:118-133). No ability applies displacement other than the damage-driven horizontal knockback and caster startDash (effectRunner.ts:161). No y-axis body velocity exists.
- **落差**: Checklist item 2 'launchers send up' is entirely absent — there is no popup/juggle/上挑 for any hit or ability. This is a genre-flavor gap more than a core-impact one (a MOBA rarely juggles), but it means dramatic launcher-type abilities cannot express the vertical pop that reads as a big hit.
- **修法**: If desired, add an optional 'launch' override kind with a short vertical arc (deterministic parabola on transform.pos.y) that roots the victim like knockdown on landing. Scope to specific launcher abilities rather than auto-attacks. Lower priority than the hitstun/lock-step fixes above.
- **檔案**: packages/shared/src/sim/components.ts, packages/shared/src/sim/combat/damage.ts, packages/shared/src/sim/systems/MovementSystem.ts

### [missing] Camera zoom / FOV punch on big hits  ·  _camera_ · screenshake-camera
- **Capcom 標準**: 3 — camera kick/zoom on big hits.
- **證據**: Searched apps/client/src for camera.fov and dolly writes on impact: fov is only set in menu/LoginScene.ts:299, intermission/IntermissionScene.ts:235, vfx firework auditions, and read in ui/hud/minimapMath.ts — never mutated by applyCombatFeedback or any damage/crit/kill path. dolly is only changed by zoomBy (wheel) and setDead (CameraRig.ts:125-127,145). No punch-in on crit/kill.
- **落差**: No momentary punch-in (quick FOV narrow / dolly-in then recover) on crits or killing blows. Big hits get a stronger shake but no zoom emphasis, so the heaviest moments don't POP forward the way a SF heavy/counter does.
- **修法**: Add a short FOV or dolly punch on crit/killingBlow: narrow fov (or reduce dolly) ~5-8% for ~2-4 frames, recover fast. Gate to crit/kill to avoid nausea on every auto. Touches: CameraRig.ts (a punchZoom impulse in apply()), GameApp.ts:1057 (fire alongside the ripple).
- **檔案**: 

### [missing] EX screen darken / desaturate (受身變色 backdrop)  ·  _vfx_ · superfreeze-ex-damagetext
- **Capcom 標準**: The super flash briefly DARKENS/desaturates the background so the attacker and the super VFX pop against a dimmed field — isolating the moment.
- **證據**: CombatPostFx is the only full-screen post pass and it exposes ONLY a red damage vignette + ripple: apps/client/src/vfx/CombatPostFx.ts (addVignette :97, uniforms vignette/vignetteColor/ripple :39-52), fed exclusively by local-player damage in apps/client/src/GameApp.ts:1055 (postFx.addVignette on 'damage'). There is no darken/desaturate uniform or path. Searched apps/client/src for darken|desatur|flashbang|screenFlash on EX — not found (the only desaturate concept is the still-pending death-spectator task #85). The EX branch in VfxSystem.ts:502-504 never touches postFx.
- **落差**: The EX burst fights the fully-lit arena for contrast; without a momentary dim, the layered pop reads as 'more particles' rather than 'the screen changed because something huge happened'.
- **修法**: Add a short darken/desaturate uniform to the CombatPostFx shader (a mix-to-dim over ~4-8 frames with the project's fast crisp release, NOT a slow fade — honour 收尾精準), and pulse it from the EX cast alongside the freeze + zoom. Reuse the existing decayIntensity/half-life plumbing (CombatPostFx.ts:111) but with a short half-life. Files: apps/client/src/vfx/CombatPostFx.ts, apps/client/src/vfx/postFxMath.ts, apps/client/src/GameApp.ts.
- **檔案**: apps/client/src/vfx/CombatPostFx.ts, apps/client/src/vfx/postFxMath.ts, apps/client/src/GameApp.ts

### [missing] EX/super hit unified freeze-darken-zoom on the impact path  ·  _mixed_ · integration-orchestration
- **Capcom 標準**: EX/super needs a dramatic freeze+darken+zoom tied to the hit; currently only a particle burst, off the unified path.
- **證據**: Searched apps/client/src for superFreeze|dramaticPause|darken(hit)|zoomPunch|cinematicHit|hitfreeze — NOT FOUND (only unrelated arena/blood/death darken matches). EX impact goes through the `abilityCast` event → VfxSystem.ts:502-504 isEx layeredPop + play only (no freeze/darken/zoom), and GameApp on-hit path has no isEx/exUnlock branch (grep in GameApp.ts — none). The unified impact path (damage/hitImpact) carries no EX/super flag.
- **落差**: Checklist #8 (dramatic EX pause + darken + zoom) is not wired into the orchestrated on-hit moment at all — EX visuals are a separate, weight-agnostic particle pop with no shared profile, so the biggest hits get no special freeze framing from the integration layer.
- **修法**: Tag EX/ultimate damage packets in the sim (origin prefix 'ex:' already exists) so applyImpact sets ImpactProfile.tier='ex'; client then drives a longer hitstop + brief scene darken + camera punch-zoom off that one flag, sharing the same orchestration as normal hits.
- **檔案**: apps/client/src/vfx/VfxSystem.ts, apps/client/src/GameApp.ts, packages/shared/src/sim/combat/damage.ts

### [present-weak] Shake decay speed / crisp settle (收尾精準)  ·  _camera_ · screenshake-camera
- **Capcom 標準**: 3 — shake DECAYS FAST for a crisp settle.
- **證據**: shakeDecayEnvelope is quadratic ease-out t*t (combatFeedback.ts:140-145); shakeDurationMs returns 160..460ms (line 130-133); oscillation SHAKE_FREQ=0.052 rad/ms ≈ 8.3Hz (CameraRig.ts:37, advanceShake lines 289-296). Envelope re-summed every frame in advanceShake, applied to camera position only with target held (CameraRig.ts:388-394) so there is no follow-lag smearing the settle.
- **落差**: Decay is smooth but not maximally crisp: a heavy/kill hit rings for up to 460ms and at age=0.7·dur the quadratic tail is still ~9% of a 0.85u shake (~0.076u visible), while ~8Hz is on the slow side of a snappy impact. Capcom hits settle in ~150-250ms with a hard high-freq snap; the current heavy tail reads slightly woolly rather than 破碎衝擊+精準收尾.
- **修法**: Cap heavy-hit duration lower (~120-260ms), raise decay order to cubic (t*t*t) so the tail dies faster, and lift SHAKE_FREQ toward ~12-15Hz for a sharper snap. Touches: apps/client/src/render/combatFeedback.ts (shakeDurationMs, shakeDecayEnvelope), CameraRig.ts (SHAKE_FREQ).
- **檔案**: 

### [present-weak] Shake trigger coverage (who/what shakes)  ·  _camera_ · screenshake-camera
- **Capcom 標準**: 3 + 4 — camera response distinct for hit vs block.
- **證據**: applyCombatFeedback only shakes when taken || selfHit (GameApp.ts:1046-1052): local player is victim or source. A block/guardBreak, knockdown, or a nearby enemy's heavy hit/EX that does not involve the local entity produces no camera response. hitImpact/guardBreak/knockdown events (combat-juice.md) drive particles but never cameraRig.
- **落差**: Camera impact is silent for block/guard-break (no distinct camera beat vs a clean hit) and for spectated/adjacent heavy action. The 'distinct hit vs block' feel that Capcom expresses partly through camera is absent at the camera layer.
- **修法**: Give block/guardBreak a distinct, smaller/sharper camera cue (e.g. tighter high-freq micro-shake, no directional kick) and optionally a falloff-scaled shake for heavy nearby impacts by distance. Touches: GameApp.ts:1038-1060 (branch on guardBreak/block flag), CameraRig.ts.
- **檔案**: 

### [present-weak] Blocked hit still flashes the victim RED  ·  _mixed_ · hitsparks-flash
- **Capcom 標準**: Checklist 5: victim flash should distinguish hit vs block. Currently identical red on both.
- **證據**: apps/client/src/render/EntityViewRegistry.ts:218-230 — the `damage` handler calls view.flash(flashColorFor(...)) unconditionally; it never inspects ev.data.blocked. Meanwhile the VfxSystem block branch (VfxSystem.ts:609) deliberately swaps to a cool-white spark and no blood. So the particles say 'blocked' (cool steel, rebound) but the model body still flashes damage-red.
- **落差**: Mixed signal: the block VFX correctly reads as a deflection, but the victim model simultaneously flashes the same red as taking a clean hit, undercutting the 'I guarded' read. Capcom flashes a blocked defender differently (or with a blue guard spark and a shorter/whiter body flash), not the full damage red.
- **修法**: Thread `blocked` into the flash: on a blocked damage event flash a brief cool blue-white (or skip the body flash and rely on the block spark) instead of red, and optionally shorten it. Small branch in EntityViewRegistry.ts damage case + a flashColorFor variant.
- **檔案**: apps/client/src/render/EntityViewRegistry.ts, apps/client/src/render/combatFeedback.ts

### [present-weak] Spark smoke-body tail length vs 收尾精準  ·  _vfx_ · hitsparks-flash
- **Capcom 標準**: Checklist 6/收尾精準: dense at impact but SHORT lifetime, snap-clear. Smoke body is the one layer that lingers.
- **證據**: apps/client/src/vfx/vfxPresets.ts:567-578 — the impact smoke layer lifetimeSec {min:0.4,max:0.6}; HitSpark.doneAfterMs is driven by smoke.lifetimeSec.max*1000 (HitSpark.ts:129), so a light basic-attack impact keeps a smoke puff alive up to ~600ms. Flash/spark layers are already crisp (<=350ms).
- **落差**: The bright spark pops and clears fast, but the accompanying grey smoke body lingers up to 0.6s on EVERY hit including light autos landing every ~2s. It is low-alpha standard-blend (a weight cue, not a trail), so it is not egregious light-pollution, but 0.6s brushes against the project's 收尾精準 / <=0.25s-tail value and can haze the arena during dense trades.
- **修法**: Scale smoke lifetime by intensity — cap light-hit smoke at ~0.3-0.35s (keep the ~0.55-0.6s only for heavy/ex), and lower light smokeN. One edit to IMPACT_TUNING / the smoke lifetimeSec in impactRecipe.
- **檔案**: apps/client/src/vfx/vfxPresets.ts

### [present-weak] Impact smoke body — longest impact tail (0.6s)  ·  _vfx_ · particles-blood-explosion
- **Capcom 標準**: 收尾精準 — the impact read should clear fast; the weight layer should not outlast the punch
- **證據**: vfxPresets.ts:567-578 impactRecipe.smoke lifetimeSec {min 0.4, max 0.6}; this is the longest of all impact layers (flash 0.033–0.05s :546, sparks 0.15–0.35s :555, ring lifeMs 240–320 :531-533). It is low-alpha (softBodyColorStops peak 0.28–0.38) standard blend, so it is a faint weight haze, not a wall.
- **落差**: The core shatter (flash+sparks+ring) clears by ~0.35s but a faint smoke body lingers to 0.6s. Low-alpha standard-blend so it is NOT light pollution, but for the crispest 收尾 the tail is slightly long relative to the 0.35s punch.
- **修法**: Trim impact smoke max life to ~0.45s (and light-tier to ~0.4s) so the weight layer settles with the punch instead of trailing 0.25s behind it. One edit in IMPACT_TUNING/impactRecipe.smoke.
- **檔案**: apps/client/src/vfx/vfxPresets.ts

### [present-weak] Zero pitch/pan variation — repeated identical samples read as machine-gun sameness, and off-center hits are not spatialized  ·  _sfx_ · sfx-layering
- **Capcom 標準**: Punchy per-hit audio uses small random pitch/pan jitter so a combo doesn't sound like one sample looped; directional hits pan toward the contact point.
- **證據**: apps/client/src/audio/AudioSystem.ts — grep for playbackRate|detune|pitch: no matches (only VOLUME_RAMP, gain.value, node.pan on playClip). playSfx (AudioSystem.ts:596-619) sets gain but never source.playbackRate/detune. The combat call GameApp.ts:699 passes no pan, so every hit plays dead-center regardless of where in the arena it landed. audioSelect.ts random-picks over `files` but block/hit/crit each have a single file, so even file-variety anti-repetition is absent for the primary hit voices.
- **落差**: A 5-hit combo plays the byte-identical thud five times at identical pitch and center pan — mechanical, not a flurry. No positional cue for which duel/side a hit came from. This is polish on top of the (good) transient design, but its absence caps how 'alive' fast exchanges feel.
- **修法**: In playSfx apply a small random source.detune (±40-70 cents) per voice, and thread opts.pan from the hit's screen-x at the GameApp call site so off-center hits pan. Optionally add 2-3 thud variants to the `hit` files array for sample-level variety.
- **檔案**: apps/client/src/audio/AudioSystem.ts, apps/client/src/GameApp.ts, apps/client/src/audio/combatSfx.ts, content/config/audio-map.json

### [present-weak] EX cast VFX flourish + gold identity (the one 'event' cue that exists)  ·  _vfx_ · superfreeze-ex-damagetext
- **Capcom 標準**: Distinct, unmistakable super activation read; the burst is a supporting layer under the freeze+zoom+darken, not the whole show.
- **證據**: On EX cast the client layers the max-intensity 'ex' pop (core flash + streaks + smoke + ground shockwave) tinted from the ability's own colour and scales the doc burst 1.6× (apps/client/src/vfx/VfxSystem.ts:499-504, EX_BURST_BOOST :105, EX_DEFAULT_TINT :114, tintOfDoc). EX also gets a one-time unlock cue: an 'exUnlock' SFX + gold HUD toast fired on the exRank 0→1 edge (apps/client/src/audio/sfxEdges.ts:76, audio/types.ts:69), and gold slot styling in the bar (ui/codex/codexLabels.ts:72). This is a genuine, well-built flourish and preserves per-ability identity.
- **落差**: It is the ONLY per-cast EX treatment — a purely spatial (particle) cue with no time, camera, or screen-state change. Because the three cinematic dimensions above are missing, the burst alone cannot make the EX 'feel like an event'; a big Q burst and an EX burst differ only by a 1.6× scalar.
- **修法**: Keep the layered pop as the anchor but sequence it with the new freeze (finding 1), punch-in (finding 2) and darken (finding 3): freeze-hold on the contact frame, camera pushes in against a dimmed field, then all three release crisply as the burst clears — a coordinated ~10-frame beat rather than one isolated particle spray. Files: apps/client/src/vfx/VfxSystem.ts (sequencing hook), plus the files in findings 1-3.
- **檔案**: apps/client/src/vfx/VfxSystem.ts, apps/client/src/audio/sfxEdges.ts

### [present-weak] Procedural voxel-fallback attack: no anticipation windup, no snap contact frame  ·  _anim_ · anim-contact-trails
- **Capcom 標準**: Windup (anticipation) -> snap on the active frame -> clean recovery; the held frame during hitstop is the impact pose.
- **證據**: ChampionView.ts:339-341 attack state sets `armR = -2.0` (raised strike) reached via the smoothing lerp at :365-369 (k = 1 - 0.5^(dt/40)). There is no pull-back pose, no over-shoot, no fast contact snap — a single eased raise held for the pulse. Hitstop path :322-325 does hold the current limb pose (contact-frame hold exists), but the pose it holds is a soft mid-lerp, not a struck frame.
- **落差**: Fallback champions (empty/absent glb — e.g. godie-u011 per task #69) swing with a smooth arm-raise and no anticipation or snap, so their melee has no 破碎衝擊 punch even though the hitstop freeze fires. This overlaps the in-flight #64/#69 wave editing ChampionView, so treat as coordinate-not-collide.
- **修法**: Give the procedural attack a 3-phase curve keyed on the pulse clock: quick pull-back (arm winds up ~0.15 of window), fast snap to the strike pose (steep ease), then a short recovery — so the held frame during hitstop is the extended strike, not a mid-lerp. Drive the phase off the attack pulse start time already available in AnimationStateMachine.
- **檔案**: apps/client/src/render/views/ChampionView.ts, apps/client/src/render/anim/AnimationStateMachine.ts

### [present-weak] Ranged projectile trail: clears on impact but max life 0.3s slightly over the 0.25s contract  ·  _vfx_ · anim-contact-trails
- **Capcom 標準**: Projectile streak vanishes with the projectile; no tail floating after the hit.
- **證據**: ProjectileView.ts:55 `TRAIL_LIFE = { min: 0.14, max: 0.3 }`. deactivate() :262-266 calls trail.stop() (stops emission; existing particles live out their lifetime) and setEnabled(false) on the head/body (head vanishes instantly). Size uses popShrinkStops (:183) so particles shrink to nothing. No separate impact-time trail flush.
- **落差**: On impact the comet head snaps off cleanly (good), but the last-emitted trail particles hang up to 0.30s — just past task #37's 0.25s 刀光 budget. Minor, but it's the same 收尾精準 rule applied elsewhere, so the projectile tail is the one trail channel that violates the project's own contract.
- **修法**: Lower TRAIL_LIFE.max to 0.24 (keep min ~0.12) so the tail is fully gone within the 0.25s budget; optionally on deactivate flush by scaling remaining particles' remaining life. One-line constant change.
- **檔案**: apps/client/src/render/views/ProjectileView.ts

### [present-weak] SFX weight tiering (light/med/heavy) integrated with hit-weight  ·  _sfx_ · integration-orchestration
- **Capcom 標準**: Heavy hits need a heavier transient+body; a magnitude-blind key can't deliver graded weight.
- **證據**: combatSfxKey (combatSfx.ts:40-50) branches only on blocked/crit/dmgType and returns a single 'hit'/'hitMagic'/'hitTrue'/'crit'/'block' key — it never reads ev.data.amount, so a 10-dmg poke and a 200-dmg smash play the identical clip.
- **落差**: The audible weight ('收尾精準' with a low-freq body on heavy hits) is decoupled from the impact profile entirely — SFX is the one channel that does not scale with hit weight at all. A heavy blow sounds the same as a chip auto.
- **修法**: Add a tier suffix from the shared profile (hit_light/hit_med/hit_heavy) or layer a low-freq body sample gated on profile.tier>=2, so the sound gets weightier in lock-step with the spark/shake/freeze. (Depth of the SFX layering itself is the SFX dimension's call; this is the integration hook it needs.)
- **檔案**: apps/client/src/audio/combatSfx.ts

### [strong] HITSTOP core freeze (both attacker + victim, scales, capped, deterministic)  ·  _sim_ · hitstop-hitstun
- **Capcom 標準**: 命中定格: attacker AND victim freeze a few frames on contact; heavier = longer; the freeze IS the impact.
- **證據**: packages/shared/src/sim/combat/damage.ts:97-102 sets ticks=clamp(2+floor(impact/55),2,6) and bumpFreeze on BOTH source and target; HitstopSystem.ts:25-28 ages it AFTER the gates ran (exact-N T+1..T+N); MovementSystem.ts:85-88 zeroes vel; BasicAttackSystem.ts:81 pauses windup; CastResolveSystem.ts:33 pauses cast; SimWorld.ts:341 folds into digest.
- **落差**: Meets the Capcom bar for the core: heavier hit = longer freeze, both bodies freeze, movement/windup/cast all gated while cooldowns keep ticking (balance-neutral). The only weakness is the flat freeze has no intra-freeze buzz/vibration (SF often shakes the two sprites 1-2px during the hold) — pure polish.
- **修法**: Optional P2: during the hitstop window, apply a tiny deterministic 1-2px positional jitter or a client-only render shiver on the two frozen views for the 破碎衝擊 buzz. No sim change needed if done client-side in ChampionView while hitstopUntilMs is active.
- **檔案**: packages/shared/src/sim/combat/damage.ts, packages/shared/src/sim/systems/HitstopSystem.ts, apps/client/src/render/views/ChampionView.ts

### [strong] Knockback / pushback on hit and on block  ·  _sim_ · hitstop-hitstun
- **Capcom 標準**: 擊退: pushback on hit and on block; magnitude scales with hit weight.
- **證據**: damage.ts:106-122 pushes away from source, distance = (impact/100)*KB_UNIT_AT_100*KB_TYPE_MULT[type], physical 1.0 / true 0.85 / magic 0.6 (damage.ts:49), blocked *0.35 (damage.ts:51,120), capped KB_MAX_DIST=4, integrated by moveWithCollision (slides/stops at walls, clamps to zone) via MovementSystem.ts:118-133; chip (<70 impact) doesn't shove (damage.ts:104).
- **落差**: Solid and genre-appropriate: directional, weight-scaled, type-differentiated, block-attenuated, wall-aware. Two minor bar gaps: (1) block pushback only exists above impact 70, so a blocked light/medium hit gives no shove at all (SF pushes on EVERY blocked hit); (2) KB_SPEED=16 is a fixed slide speed for all weights, so a heavy shove and a light one leave at the same velocity and only differ in distance — a heavier hit should also launch faster for the 破碎衝擊 snap.
- **修法**: Lower/curve the block pushback threshold so any blocked hit nudges (small); and scale KB_SPEED with impact so heavy hits snap away faster then settle, reinforcing the punch-then-precise-stop feel.
- **檔案**: packages/shared/src/sim/combat/damage.ts

### [strong] Screen shake magnitude scaling (weight-driven)  ·  _camera_ · screenshake-camera
- **Capcom 標準**: 3 — magnitude scales with hit weight.
- **證據**: apps/client/src/render/combatFeedback.ts:119-127 impactShakeAmp scales amp = amount*0.006, *1.5 crit, *2.2 killingBlow, *1.4 taken vs *0.45 self, clamped to SHAKE_MAX_AMP 0.85 (line 96). Wired at GameApp.ts:1050-1051 addShake(amp, shakeDurationMs(amp)); tier-scaled by cameraShakeScaleFor (combatFeedback.ts:162-164, mobile 0.5).
- **落差**: This part MEETS the Capcom bar: heavier hit = bigger shake, crit/kill amplify, taking a hit jolts harder than landing one. Only nit: SHAKE_DMG_SLOPE/caps are untuned against real ability damage numbers, so most autos land near the low end and the curve may feel flat across the common damage band.
- **修法**: Playtest-tune SHAKE_DMG_SLOPE and the crit/kill mults against the actual damage distribution so a light auto and a heavy nuke are clearly separable, not both near the floor. Touches: apps/client/src/render/combatFeedback.ts.
- **檔案**: 

### [strong] Layered hit-spark burst on every landed hit (flash+sparks+smoke+ring)  ·  _vfx_ · hitsparks-flash
- **Capcom 標準**: Checklist 4: bright spark at contact point, short-lived (pop then gone). Met for the flash+spark layers.
- **證據**: apps/client/src/vfx/VfxSystem.ts:596-623 fires a HitSpark on every `hitImpact`; apps/client/src/vfx/HitSpark.ts:99-130 drives ImpactComposer; recipe apps/client/src/vfx/vfxPresets.ts:541-581 — flash 33-50ms (1-3 frames), sparks 150-350ms, additive, all energy at t=0 (pooled, zero per-hit alloc). Textures confirmed: content/assets/textures/particles/{flare_01,spark_05_rotated}.png
- **落差**: Meets the Capcom pop-then-clear bar for the core spark: bright additive white-hot flash that lives 1-3 frames then a fast gravity/drag spark spray. This is the strongest part of the impact kit. Only caveat is the smoke body tail (separate finding).
- **修法**: No change needed to the spark/flash layers themselves. Keep flash <=3 frames and additive.
- **檔案**: apps/client/src/vfx/vfxPresets.ts, apps/client/src/vfx/HitSpark.ts, apps/client/src/vfx/VfxSystem.ts

### [strong] Hit vs Block spark are visually distinct  ·  _vfx_ · hitsparks-flash
- **Capcom 標準**: Checklist 4: DISTINCT hit vs block sparks (white/yellow hit, blue block). Met.
- **證據**: apps/client/src/vfx/VfxSystem.ts:609-620 — a blocked hitImpact fires a cool-white guardBreak-tinted HitSpark (IMPACT_TINTS.guardBreak [0.9,0.95,1]) PLUS feedback.block(), and NO blood; a clean hit (VfxSystem.ts:621-632) fires a warm dmgType-tinted spark (physical [1,0.72,0.28]) plus blood. Block recipe apps/client/src/vfx/feedbackPresets.ts:141-186 uses cool steel [0.82,0.92,1], a tight additive flash, and a rebound spark fan (gravityY -20, life 90-200ms) aimed BACK at the attacker (CombatFeedbackFx.ts:130-132).
- **落差**: Meets the bar: block reads as cool metal-on-metal deflection, clean hit reads as warm flesh spark. Two of the three SF spark identities (hit=warm, block=blue) are correctly differentiated and both are short-lived.
- **修法**: None. This is correct.
- **檔案**: apps/client/src/vfx/VfxSystem.ts, apps/client/src/vfx/feedbackPresets.ts, apps/client/src/vfx/CombatFeedbackFx.ts

### [strong] Victim white/red flash-tint on hit (and attacker flash)  ·  _anim_ · hitsparks-flash
- **Capcom 標準**: Checklist 5: victim flashes red a few frames, attacker flash on contact. Met (paint-target fidelity is the separate #64/#69 wave).
- **證據**: apps/client/src/render/EntityViewRegistry.ts:218-239 — on `damage`, victim gets view.flash(flashColorFor(dmgType), nowMs) + hitstop; attacker gets ATTACKER_FLASH_RGB white + hitstop. flashColorFor (combatFeedback.ts:40-42) = red [1,0.15,0.15], magenta [1,0.35,0.9] on magic; FLASH_MS=130, ATTACKER_FLASH_MS=70, FLASH_ALPHA=0.6 via per-mesh renderOverlay (ChampionView.ts:283-390, edge-guarded so it costs nothing while idle). Red (not white) was deliberately chosen because ALPHA_COMBINE white is a no-op on pale models (combatFeedback.ts:31-38).
- **落差**: Meets the bar: victim flashes red for ~4 sim ticks then clears (edge-guarded, no lingering), magic reads as magenta, and the attacker gets the complementary 'I connected' white pop. Pop-then-clear discipline is correct. (Attacker melee flash is the #64/#69 in-flight work — procedural-vs-glb paint fidelity is being handled by the other wave.)
- **修法**: None to the flash system itself; #64/#69 covers the procedural-figure paint gap.
- **檔案**: apps/client/src/render/combatFeedback.ts, apps/client/src/render/EntityViewRegistry.ts, apps/client/src/render/views/ChampionView.ts

### [strong] Blood spray (droplets + mist + ground splat) at impact  ·  _vfx_ · particles-blood-explosion
- **Capcom 標準**: checklist 6 — dense burst at contact, SHORT lifetime, snap-clear, no light pollution
- **證據**: apps/client/src/vfx/bloodPresets.ts:127-163 (BLOOD_TUNING dropletN 10/20/34, life 0.22/0.3/0.35), :161-163 (MIN 0.12/MAX 0.35 clamp), :276 (blend 'alpha' not additive), :277 (gravityY -18 heavy arc), :289 (mist life ≤0.24, always shorter than droplets); GroundDecalPool.ts:30 (MAX_DECALS 20 hard cap), bloodPresets.ts:205 (DECAL_LIFE_MS 1500 fade-to-0), :213-219 (decalFade held then (1-k)² to exactly 0); wired every landed hit at VfxSystem.ts:457-480/624-632 (bloodSpray on hitImpact)
- **落差**: Meets the bar. Density is scaled by damage/crit (破碎) and every airborne layer is gone in 0.12–0.35s (收尾精準); the only lingering element (ground pool) is standard-blend, capped at 20, and fades to exactly 0 over 1.5s. No fix needed — this is the reference-quality layer.
- **修法**: None required. Optional: expose per-champion decal life so undead/mechanical variants clear even faster.
- **檔案**: apps/client/src/vfx/bloodPresets.ts, apps/client/src/vfx/GroundDecalPool.ts, apps/client/src/vfx/BloodFx.ts

### [strong] Imported explosion/nova docs — billow-vs-crisp discipline  ·  _vfx_ · particles-blood-explosion
- **Capcom 標準**: checklist 6 — no lingering, no light pollution; effects clear immediately (per #37/#33)
- **證據**: Raw imported docs would linger badly (content/vfx/godie-blackhole1-p2.json lifetimeSec 3.5s burst 300; meteor/fireblast are 'continuous' 60–78/s streams). frontLoadDoc (VfxSystem.ts:236-256) collapses continuous streams into ONE front-loaded burst and clampOneShotLife (:221-227) hard-caps every one-shot particle at ONE_SHOT_MAX_LIFE_SEC=0.6s (:91); pooled per-doc with busyWindow = max life (:324-327).
- **落差**: For MY dimension this is correctly biased toward crisp: a 3.5s billow becomes a 0.6s front-loaded pop. Caveat (out of my dimension but worth flagging): the 0.6s clamp is BLUNT — it also truncates genuinely-sustained AoE zones (a black-hole pull) to 0.6s, so 'crisp' is enforced even where a designer wanted a lingering field. Acceptable given the project value, but the clamp has no per-doc 'sustained' opt-out.
- **修法**: Keep the clamp as the default. If sustained AoE fields are wanted later, add an optional doc flag (e.g. sustained:true) that raises the clamp for that doc only, so the crisp default is preserved everywhere else.
- **檔案**: apps/client/src/vfx/VfxSystem.ts

### [strong] Landing / knockdown / death floor dust  ·  _vfx_ · particles-blood-explosion
- **Capcom 標準**: checklist 6 — dense floor kick at impact, short life, no fog build-up
- **證據**: apps/client/src/vfx/feedbackPresets.ts:106-134 (landingDustRecipe: puff life 0.18–0.45s flatRing radial kick, grit life 0.16–0.36s gravityY -16); both STANDARD blend (:115,:127) with the explicit note 'additive dust turns into fog the moment two land together'; wired on knockdown (VfxSystem.ts:659-663) and death (:681). Pooled via CombatFeedbackFx BurstPool.
- **落差**: Meets the bar — dense, directional floor ring, ≤0.45s, standard-blend so overlapping landings don't fog. Minor: dash dust has no trigger (docs/todo/particles.md:70-71 — the dash bit rides the same unread flags stream; comes free with the pt-16 status wiring at VfxSystem.ts:296).
- **修法**: Wire the one-line status-flags pass (VfxSystem.ts:296 statusFx.set) which also unlocks dash dust; no dust-recipe change needed.
- **檔案**: apps/client/src/vfx/feedbackPresets.ts, apps/client/src/vfx/VfxSystem.ts

### [strong] Synthesized core hit voices (物理/魔法/true/crit/knockdown/破防) — transient + low-freq body + fast release  ·  _sfx_ · sfx-layering
- **Capcom 標準**: Checklist 7: hit sound = sharp transient + low-freq weight body + VERY short tail, no ring (audible 收尾精準).
- **證據**: content/assets/audio/sfx/fx/GENERATE.sh:53-59 (thud = 150→60Hz body + 900-4500Hz pink-noise snap, exp fade), :162-167 (knockdown = 110Hz sine thump + brown debris), :148-154 (crit up-chirp+hi transient), :119-130 (hit_magic/hit_true). Measured envelope (wave RMS, 10 segments): thud dur=0.24s peakAt=2% RMS=0.49,0.17,0.06,0.02,0.01,0→ silent by 40%; hit_true 0.20s peak2% →silent 30%; crit 0.22s peak1% →silent 40%; hit_magic 0.16s; impact 0.14s; guard_break 0.34s; knockdown 0.40s peak5% →silent 40%. ffprobe durations all ≤0.40s.
- **落差**: Meets the bar. Each clip is an instant transient (peak in first 1-5% of its length) with a fast exponential decay to silence well before the file ends — no ring. thud/knockdown carry a genuine sub-200Hz body for weight; hit_magic/hit_true/crit are deliberately brighter/tonal for type contrast. Physical vs magic vs true vs crit vs guardBreak vs knockdown are six distinct voices — checklist-7 distinctness for type is satisfied.
- **修法**: No change needed. Preserve these recipes; use them as the reference envelope when adding weight tiers (finding below).
- **檔案**: content/assets/audio/sfx/fx/GENERATE.sh

### [strong] Floating damage numbers — pop-arc-fade, coloured by category (task #92)  ·  _mixed_ · superfreeze-ex-damagetext
- **Capcom 標準**: Numbers pop with a birth overshoot, arc, and fade fast (no lingering light pollution); colour encodes meaning; crits/kills are emphasized without recolouring.
- **證據**: Fully implemented and faithful to the RO spec. Pure model apps/client/src/ui/combatText.ts: birth pop settling over POP_MS=130 (combatTextScale :584), RO lob (combatTextLift, RO_ARC_TURNS=1.5, peak t=1/3, falls below spawn :566-569), linear decay + 70ms fade-in (combatTextAlpha :576-581), short lives 700-1150ms (BASE table :311-474) — matches the project's anti-light-pollution value. Colour keyed on RELATIONSHIP not damage-school, all hues ΔE-measured clear of TEAM_CSS (:32-63): taken #FF0000, heal #00FF00, mana #38D8FF, dealt #E8E8E8, guard #B9C2CC; crit/kill emphasize via size+pop only, never recolour (CRIT_SIZE_MULT/KILL_SIZE_MULT :480-485). 8-dir black ring + halo + gradient for 清晰 (:718-771). Wired end-to-end: sim emits crit/killingBlow/blocked (packages/shared/src/sim/combat/damage.ts:238-256), frameBus.pushCombatText applies coalesce/stagger/priority admission (apps/client/src/frameBus.ts:299-391), and WorldAnchorLayer.tsx:168-217 applies lift/drift/scale/alpha/lane per frame off e.pose projected in GameApp.ts:1461-1463. Separate heal/mana sim events feed 補血/補魔 (frameBus.ts:572-593).
- **落差**: Meets the bar. Minor: coalesce/stagger constants are tuned in code only; no in-game way to verify colour-blind separability at runtime. Not a defect.
- **修法**: No change required. If desired, expose a debug overlay that spawns one of each category to eyeball 清晰 over the mid-grey #80 ground. File (optional): apps/client/src/ui/WorldAnchorLayer.tsx.
- **檔案**: apps/client/src/ui/combatText.ts, apps/client/src/frameBus.ts, apps/client/src/ui/WorldAnchorLayer.tsx, packages/shared/src/sim/combat/damage.ts, apps/client/src/GameApp.ts

### [strong] Contact-frame hold on melee impact (GLB-clip champions)  ·  _anim_ · anim-contact-trails
- **Capcom 標準**: Attacker and victim both freeze a few frames on contact, scaled by hit weight — matched here (hitstop 2-6 ticks by impact).
- **證據**: EntityViewRegistry.ts:188-197 (attackWindup) plays the attack clip stretched so its ~mid-clip strike lands at the damage point via ATTACK_STRIKE_FRACTION=0.5 (:41). On damage, :234-237 calls sourceView.setHitstop AND victim view.setHitstop. ChampionView.update() :307-309 freezes the live clip (clipAnimator.setFrozen -> ClipAnimator.setFrozen zeroes speedRatio, ClipAnimator.ts:161-172) for the sim hitstop window while position keeps flowing.
- **落差**: Genuinely strong: windup leads the swing, BOTH attacker and victim clips freeze on contact (Capcom 'both freeze'), and knockback still slides because only the clip freezes, not the transform. This is the core of the contact-frame hold and it meets the bar for models that have a real attack clip.
- **修法**: No change needed for the GLB path. Keep it as the reference the smear/procedural gaps should be brought up to.
- **檔案**: apps/client/src/render/EntityViewRegistry.ts, apps/client/src/render/ClipAnimator.ts, apps/client/src/render/views/ChampionView.ts

### [strong] Ribbon swing-trail crispness / fast settle (收尾精準)  ·  _vfx_ · anim-contact-trails
- **Capcom 標準**: Blade streak hugs the arc and is completely gone a few frames after the blade stops — no lingering band.
- **證據**: ribbonMath.ts: RIBBON_FADE_BUDGET_SEC=0.25 (:71), RIBBON_MAX_LIFESPAN_SEC=0.2 (:64), lifespan clamped by clampRibbonLifespanSec. Hysteresis swing gate SWING_ON_SPEED=3 / SWING_OFF_SPEED=1.25 / SWING_RELEASE_MS=80 (:317-328). RibbonTrail.ts:313-316 & 383-386 hide the mesh the instant peak alpha hits 0; additive fade is premultiplied into vertex RGB (:23-25). swingTrailMath.ts caps particle life at SWING_TRAIL_MAX_LIFE_SEC=0.22 (:53) and live count SWING_TRAIL_MAX_LIVE=24 (:66), rate folded to idle ember when not swinging (swingEmitScale).
- **落差**: For the models that DO have a trail, this is exemplary 收尾精準: gated to actual swings, gone inside 0.25s, no light pollution, colour identity preserved. Meets the bar. The only limitation is coverage (see the smear finding), not the trail's own quality.
- **修法**: No change to the trail engine. Reuse this exact budget when adding the generic per-swing smear so the new channel inherits the crisp settle.
- **檔案**: apps/client/src/vfx/ribbonMath.ts, apps/client/src/vfx/RibbonTrail.ts, apps/client/src/vfx/swingTrailMath.ts

### [strong] On-hit fan-out skeleton (single drain loop + co-tick sim events)  ·  _mixed_ · integration-orchestration
- **Capcom 標準**: A single orchestrated impact frame — the loop is right, the shared value is missing.
- **證據**: GameApp.ts:693-699 one drain loop fans each event to vfx.handleEvent / views.handleEvent / casts.handleEvent / applyCombatFeedback / combatSfxKey; damage.ts:241 emits `damage` then :256 applyImpact emits `hitImpact` on the SAME tick, both drained in the same client frame
- **落差**: The PLUMBING for a unified on-hit moment exists and is clean — this is the strength to build the fix on. What is missing is a shared payload; the loop dispatches the raw event to N consumers that each re-derive weight independently.
- **修法**: Keep this loop as the single orchestration point; introduce one ImpactProfile object (below) and pass it to every handler instead of each reading ev.data.amount.
- **檔案**: apps/client/src/GameApp.ts, packages/shared/src/sim/combat/damage.ts
