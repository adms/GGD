# WC3 particle port (engine half) — TODO

Task #30 engine work: extend **vfx@1** with the WC3 MDX emitter feature set
(gravity, multi-stop color/size gradients, modulate/alphaKey blends,
sprite-sheet flipbooks, stretched tail billboards, speed ranges, anchorBone,
ambient flag), add **ribbon@1** trail docs to the same vfx collection, unify
the duplicated client/editor particle factories into ONE implementation
(`apps/client/src/vfx/particleFactory.ts`; the editor's
`preview3d/particles.ts` is a thin adapter — preview == ship), render ribbons
(`RibbonTrail`), attach ambient per-bone effects from the `ambient-vfx`
config doc (`AmbientVfx`, wired in GameApp off the public EntityViewRegistry
surface), and upgrade the VfxSystem pool to a per-doc free-list (cap 4, LRU
steal) so one doc can play multiple times per frame.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| pt-01 | vfx@1 WC3 extensions parse (all optional — 293 existing/imported docs stay valid) + sanity refinements reject bad stops/sheet/speed | schema-extend | unit | done |
| pt-02 | ribbon@1 parses standalone AND through the vfx collection union; ambient-vfx config doc parses; registerAll splits VfxDefs/RibbonDefs | ribbon-schema | unit | done |
| pt-03 | ONE factory serves client + editor (options seam: scale / texture URL / texture injection) with WC3 gravity/speed/stretched+tail and multi-stop gradients (2-stop legacy fallback) | factory-unify | unit | done |
| pt-04 | spriteSheet rows×cols → Babylon sprite-cell animation (cell ids/sizes, cycleSec → change speed, randomStartCell) | sprite-sheet-map | unit | done |
| pt-05 | blend mapping: additive→ONEONE, alpha→STANDARD, modulate→MULTIPLY, alphaKey→STANDARD | blend-map | unit | done |
| pt-06 | ambient bindings resolve modelKey → pooled emitters/ribbons on the anchorBone node (late .glb re-resolution + root fallback, idempotent attach, pooled detach/sweep) | ambient-binding-resolve | unit | done |
| pt-07 | ribbon swept-strip math: ring-buffer sizing (60 Hz, cap 64), pos ± up·width paths, age-faded vertex alpha in ribbon vertex order | ribbon-geometry | unit | done |
| pt-08 | VfxSystem pool: same-frame replays get distinct systems; cap 4/doc; LRU steal beyond; idle instances reused | pooling-multi | unit | done |

## Task #37 — swing trails read as 刀光劍影, not light pollution

The imported WC3 trails pooled into a permanent glowing slab: additive ribbons
never faded at all (`blendFunc(ONE, ONE)` discards vertex alpha), their ring
was too short to ever reach alpha 0, they were constant-width bands rather than
blade arcs, and both channels were ALWAYS ON — trailing an idle weapon bone
every frame. The ambient particle emitters on weapon/hand bones had the same
disease from the content side: lifetimes of 0.5–1.0 s, alpha held at 1.0 until
the particle was culled, and rate × lifetime ≈ 100 live additive quads on one
bone. Both halves now share one 刀光 budget and one swing gate (anchor speed
measured RELATIVE to the entity root, so walking is not swinging).

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| pt-09 | A swing leaves a crisp tapered streak that is COMPLETELY gone ≤0.25 s after the blade stops; idle/walking draws nothing; continuous max-speed swinging never accumulates; concurrent trails are capped (LRU steal) and pooled meshes are reused forever | ribbon-swing-trail | unit | done |
| pt-10 | Weapon-bone ambient particle trails are retuned into the same budget: clamped lifetime, live-count-capped rate, monotonic alpha reaching exactly 0, pop→shrink sizes, COLOUR IDENTITY preserved at the tint stop | swing-trail-particles | unit | done |
| pt-11 | The ambient channel gates weapon-trail emit rate on the swing (idle ember → full arc → ember), is not fooled by running, and reuses one pooled ParticleSystem across repeated swings | ambient-swing-gate | unit | done |

## Task #39 — 濺血 + the generic combat-feedback gaps

Task #33 rebuilt the LANDED-HIT kit (white-hot core flash + gravity/drag spark
streaks + low-alpha smoke body + ground shockwave). What it did not cover was
everything AROUND a hit, and blood most of all. Blood was never an import bug:
WC3 blood is a Blizzard BUILT-IN spawn model
(`Objects\Spawnmodels\<race>\<race>Blood\*.mdx`), so it was never part of the
custom map and could not appear among the 294 imported vfx docs — and the
extracted Blizzard assets are copyright-gated to the local-only overlay. The
shipping blood is therefore fully PROCEDURAL over the CC0 particle sprites
already in `content/assets/textures/particles/`.

Blood LAYERS with #33's kit on the same frame; it never replaces it. Every new
layer rides the same pooled `BurstSpec`/`BurstPool` toolkit (front-loaded
bursts, capacity caps, LRU steal, idle reap), and two new emitter shapes were
added for it: a DIRECTED cone (aimed per fire, so direction is never baked into
a pool key) and a FLAT RING (the radial floor kick a landing makes).

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| pt-12 | 濺血: a landed hit sprays stretched droplets + a brief wound mist along the DAMAGE VECTOR (attacker→victim), 0.12–0.35 s, standard-blend dark red (never additive — additive red reads as fire), gravity/drag heavy, scaled by damage magnitude and crit; layered WITH the #33 impact kit, never instead of it | vfx-blood-spray | unit | done |
| pt-13 | Ground pools: one fading splat per bleeding hit, ~1.5 s, alpha held then faded to EXACTLY 0, hard-capped at 20 concurrent, pooled meshes/materials/textures reused forever (spent splats reused before the pool grows; the oldest is stolen at the cap) | vfx-blood-decal | unit | done |
| pt-14 | Gore STYLE KNOB (`content/config/gore.json` + graphics settings): `blood` (default) / `stylized` (damage-type-tinted energy, no red, no pool) / `off` (emits NOTHING); intensity 0–1; per-champion overrides for mechanical/undead/plant champions that may only ever REDUCE gore — a content edit can never re-introduce blood for a player who chose otherwise | vfx-gore-style | unit | done |
| pt-15 | The other generic gaps: muzzle flash at a projectile's cast origin (aimed by the owner's last committed aim, since `projectileSpawn` carries no direction), landing/knockdown/death floor dust as a flat radial ring, and a BLOCK/PARRY steel clink whose sparks rebound back at the attacker (a blocked hit used to fire the identical warm flesh spark as a clean one) | vfx-feedback-gaps | unit | done |
| pt-16 | Status body visuals: the authoritative CC bitmask (`EntitySchema.flags` — 1 dashing / 2 rooted / 4 stunned / 8 slowed) has shipped on the wire since the protocol was written and nothing on the client ever read it. Decoded into pulsed pooled auras (stars overhead / grit at the feet / frost motes / speed lines) that cost nothing for a healthy entity and age out on despawn. **Engine only — still needs one line in the game loop's per-entity pass: `vfx.statusFx.set(es.id, es.flags, x, z, nowMs)`.** | vfx-status-aura | unit | done |

Not closed here, and why: **dash dust** has no reachable trigger (the dash bit
lives in the same unread `flags` stream as the other statuses — it comes free
with the pt-16 wiring); a **death dissolve** on the champion MESH belongs to
`render/views/ChampionView` (deaths currently read via the EX-grade impact pop
+ ash plume + the new floor dust). The gore settings TOGGLE still needs a row
in `ui/SettingsScreen.tsx` — the store field, clamping, persistence and live
propagation to the vfx layer are all in place and tested.

## CT 起手預告 LANE B — 0.6 秒施法光柱（`CastPillarFx`）

> owner 原話：「…所以施展技能的時候都要帶一段 **0.6 秒的施展光柱光芒**來提示」
> 參考圖是 FF7 極限技的光柱：中心黃白熾光、外圈橘紅火焰、能量向上聚攏、人物在光柱裡呈剪影。

由**權威施法窗**驅動，不是自己的計時器：`castBegin{castTimeSec, ticks}` → 升柱，
`castEnd` → 釋放閃光，`castInterrupt` / `death` → **熄滅（更暗、往下塌、不閃）**。
MatchRoom 早就把這三個事件廣播給**每一個** client（跟頭上施法條同一條流），
所以每個英雄都有光柱——受害者看得到才是重點。實測登錄表：**545/554 個可施放技能**都會升柱
（另外 9 個是純被動，根本按不下去，也就沒有窗）。

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| ct-b1 | 光柱長度＝真實施法窗（0.35s / 0.6s / 2.0s 走同一條曲線，模組裡沒有 0.6 這個常數）；castEnd 釋放閃光、castInterrupt 往下熄滅且永遠比施法期暗；castEnd 掉包也不會讓光柱燒不完 | vfx-cast-pillar | unit | done |
| ct-b2 | 中斷語意：打斷不得看起來像結算（更暗、塌陷、無閃光）；已結算後再收到中斷則忽略 | vfx-cast-pillar-interrupt | unit | done |
| ct-b3 | 12 人同時施法不得洗白畫面：每柱 alpha 隨同時數遞減（1/(1+k(n-1))，下限 0.4），總亮度 12 柱 = 5.43 柱份而非 12 份；光點數同步節流 | vfx-cast-pillar-crowd | unit | done |
| ct-b4 | 可讀性：地面光暈比 `Telegraph.BASE_ALPHA` 暗、比最小 AoE 半徑小（直接對 Telegraph 匯出的常數斷言，不是抄一份字面值）；核心比身體細（人物成剪影）、外殼比身體寬；柱高蓋過 2.45 的血條錨點；#85 死亡去色後仍比地板亮 1.8 倍且不會全通道爆白 | vfx-cast-pillar-readability | unit | done |
| ct-b5 | 元素正確：顏色取自技能自己的 `fx.prim.<element>.…` vfxKey（冰是藍不是橘），退而求其次取 doc 色、最後才是 FF7 金；**顏色同時寫進頂點色**，因為 Babylon 一旦綁 emissiveTexture 就會用貼圖 rgb 取代 emissiveColor（實測所有元素都變同一種灰） | vfx-cast-pillar-element | unit | done |
| ct-b6 | 預算：暖機後每次施法 **0 mesh / 0 material / 0 particle system**；柱數硬上限 16，超過時回收「最接近結束」那一柱而不是最新的 | vfx-cast-pillar-budget | unit | done |
| ct-b7 | 接線：真的 `VfxSystem.handleEvent` 吃真的 castBegin/castEnd/castInterrupt payload（含只有 ticks 沒有 castTimeSec 的情形），瞬發技能（沒有 castBegin）刻意不升柱 | vfx-cast-pillar-wiring | unit | done |
| ct-b8 | #93 勝利罩色下仍可讀：round 灰罩／match 暗罩／match-held 三種都直接吃 `victoryPresentation` 匯出的 filter + 漸層常數，用 Filter Effects 規範的矩陣算真值，取漸層裡**最不透明**那一段當最壞情況；光柱亮度須 > 罩後地板 1.25 倍（實測 round 灰罩最嚴、為 1.92 倍）且不得全通道爆白。與 #85 分開測是因為機制不同：#85 是 Babylon post-process，#93 是 DOM 的 backdrop-filter + 半透明漸層，過得了 shader 不代表過得了漸層；而 #100「結算後還在打」表示罩色亮著時真的還有人在施法 | vfx-cast-pillar-victorywash | unit | done |

`public/cast-pillar-audition.html`（+ `src/vfx/castPillarAudition.ts`）是這個效果的確認頁：
真的 `CastPillarFx`、真的 `Telegraph`、真的相機角度，可切元素／同時人數／起手長度，
並支援**凍結時間點**截圖。owner 給的是一張圖，數字表格無法對照一張圖，所以要有這頁。
