# GGD Champion Mesh Audit — stray oversized effect meshes (task #17, READ-ONLY)

Measured headless in Babylon `NullEngine` via `LoadAssetContainerAsync`, applying **node world transforms** and transforming every vertex to world space. For each GLB: overall bbox height (min/max Y over all mesh verts), **body height** = bbox of the mesh with the **most vertices** (the solid character mesh, normalized to ~1.70u by task #1), and per-mesh vert count + world Y-top / Y-span / max|xz| + material emissive/alpha cues.

Scanned **129 imported** GLBs + **4 KayKit** reference champions. Raw per-mesh data in `MESH_AUDIT.json`.

**Body-detection caveat:** 'body = most-verts mesh' is reliable for the imported W3C models (one skinned body mesh + separate effect primitives) but under-measures the KayKit champions (barbarian/knight/mage/rogue) whose body is split into many small meshes — their flagged hats/heads/crossbows are legit equipment, not strays (noted below).

## 1. ACTIVE champions with STRAY effect meshes — STRIP

| model | champ ids | bodyH | fullH | ratio | stray meshes (verts, yTop, ySpan, |xz|, mat) |
|---|---|--:|--:|--:|---|
| **imported.niya** | godie-o01z, godie-o02v | 1.70 | 14.49 | **8.52** | `mesh_primitive3` 6v yTop=15.1922 ySpan=14.0964 |xz|=6.7857 /alpha TeamGlow2<br>`mesh_primitive5` 94v yTop=11.6595 ySpan=1.714 |xz|=1.4544  mat1<br>`mesh_primitive0` 454v yTop=10.9326 ySpan=10.2258 |xz|=5.1468  mat0<br>`mesh_primitive1` 228v yTop=9.7995 ySpan=6.8941 |xz|=1.8095  mat1<br>`mesh_primitive2` 12v yTop=1.8561 ySpan=1.0091 |xz|=9.8662 /alpha TeamGlow2 |
| **imported.heromiku** | godie-o02p | 1.70 | 4.27 | **2.51** | `mesh_primitive4` 22v yTop=4.2545 ySpan=3.5076 |xz|=3.2673 emis/alpha mat5<br>`mesh_primitive3` 111v yTop=4.1722 ySpan=4.1864 |xz|=1.2415 emis/alpha mat4 |
| **imported.ma** | godie-e00j | 1.70 | 3.97 | **2.33** | `mesh_primitive1` 4v yTop=4.6858 ySpan=1.1133 |xz|=0.5566 emis/alpha mat2 |
| **imported.picacugy** | godie-o02l | 1.70 | 3.61 | **2.12** | `mesh_primitive7` 4v yTop=3.0287 ySpan=3.4929 |xz|=1.8054 emis/alpha mat3 |
| **imported.renaryugu2** | godie-e001, godie-e00n | 1.70 | 2.52 | **1.48** | `mesh_primitive4` 6v yTop=2.645 ySpan=2.4542 |xz|=1.1814 /alpha TeamGlow2 |
| **imported.cloud** | godie-hart | 1.70 | 2.44 | **1.44** | `mesh_primitive4` 4v yTop=2.4933 ySpan=2.3134 |xz|=1.485 /alpha TeamGlow1 |
| **imported.herosaber** | godie-e00l, godie-e002, godie-e00q | 1.70 | 2.41 | **1.42** | `mesh_primitive4` 6v yTop=2.5256 ySpan=2.3435 |xz|=1.1281 /alpha TeamGlow2 |

- **imported.niya** — **SEVERE / the reported Nanoha (高町奈葉).** Body is `mesh_primitive4` (745v, ySpan 1.70) but it **floats at y4.39→6.09 and is offset xc=-1.34/zc=+1.36** — the whole rig sits inside a giant effect scene. Strip the 5 effect meshes (`mesh_primitive0/1/2/3/5`); the 6-vert `mesh_primitive3` is the y1.1→15.2 beam. After stripping, the body must ALSO be re-grounded to y=0 and re-centered on the axis, else it hangs in the air.
- **imported.heromiku** — Miku (初音). Two emissive+alpha effect meshes: `mesh_primitive3` (111v, full-height beam/wing y-0.01→4.17) and `mesh_primitive4` (22v, y0.75→4.25). Body = `mesh_primitive1` (1367v) + `mesh_primitive2`. Strip both effects.
- **imported.ma** — Ma (騜, godie-e00j). `mesh_primitive1` = 4v emissive+alpha quad floating y3.57→4.69 entirely above the 2.42u body — classic imported particle-emitter → solid quad. Strip.
- **imported.picacugy** — Pikachu (皮卡丘, godie-o02l). `mesh_primitive7` = 4v emissive+alpha lightning billboard y-0.46→3.03. Strip. (Secondary: `mesh_primitive6` is a wide low TeamGlow ground ring |xz|3.07 — cosmetic, optional.)
- **imported.renaryugu2** — Rena (龍宮禮奈, e001/e00n). `mesh_primitive4` = 6v TeamGlow weapon-glow quad (alpha, y0.19→2.65). The billhook is in the body mesh. Strip the glow quad.
- **imported.cloud** — Cloud (克勞德, godie-hart). The oversized mesh is `mesh_primitive4` = **4v TeamGlow sword-SLASH glow quad** (alpha, y0.18→2.49), NOT the Buster Sword. The actual Buster Sword is solid geometry inside body `mesh_primitive2` (opaque, |xz|1.79) and stays. Strip only the glow quad.
- **imported.herosaber** — Saber (亞瑟王, e002/e00l/e00q). `mesh_primitive4` = 6v TeamGlow sword-glow quad (alpha, y0.18→2.53). Excalibur itself is in body `mesh_primitive1`. Strip the glow quad.

## 2. Big meshes that are LEGIT (KEEP)

| model | champ ids | mesh | verts | yTop | what it is |
|---|---|---|--:|--:|---|
| imported.bulbasaur | godie-hgam, godie-h02r | `mesh_primitive1` | — | 3.13 | Venusaur's flower/bulb — opaque solid body part; makes it tall by design (ratio 1.84) |
| imported.linkstik | godie-h00l | `mesh_primitive1/3/4/5` | — | 2.22 | Link's tall pointed cap + hair — opaque, near-axis, contiguous with head; ratio 1.64. LOW confidence, visually confirm before ANY strip |
| imported.cloud | godie-hart | `mesh_primitive2 (in body)` | — | 1.66 | Buster Sword — opaque solid, part of body mesh, |xz|1.79 |

Also: `herosaber`/`renaryugu2`/`ma`/`heromiku` swords/weapons that are visible in-hand are baked into the **body** mesh and are untouched by the strips above — only the separate glow/beam quads are stray.

## 3. CRITICAL (separate bug): empty champion model

- **imported.collision** — champ **godie-u011** (克勞薩先生 / Krauser). GLB is an **empty `Armature` with ZERO meshes** (bbox = Infinity, `No meshes found`). This champion renders **invisible** — not a stray-mesh case but must be fixed separately (re-import a real body, or reassign modelKey). Note godie-u012 (Krauser II) uses `champ.thorne`, so a fallback skin exists.

## 4. Secondary — wide low team-glow ground quads (cosmetic, optional)

Within body height (do NOT inflate perceived height), but are baked WC3 team-color selection glows at the feet reaching wide |xz|. Harmless; strip later only for cleanliness. Present on: `imported.herobiggon`(|xz|4.5), `imported.herorider`(|xz|2.4), `imported.heroshana`(|xz|2.7), `imported.herotoshiiemaeda`(|xz|2.4), `imported.lubu`(|xz|2.4), `imported.picacugy`(|xz|3.1), `imported.zy3`(|xz|2.5).

## 5. Inactive or effect-only models flagged by ratio/stray (NOT champion-body problems)

These are auras/novas/meteors/beams or unused imports — being all-effect and 'giant' is expected; they are not champion bodies. Left as-is:

`babyface`, `blackhole1`, `blackhole`, `boomnl`, `darkbreathdamage`, `demonfilth`, `divinering`, `doom`, `enchant`, `grandorcaura`, `grandundeadaura`, `heroeva01s2`, `heronarutos4effect`, `heropika`, `heroraichus3`, `holyawakening`, `japanesecherry`, `lasercannonfinalred`, `lavabreathdamage`, `lightningnova`, `meteor`, `minitypeflame`.

## 6. Appendix — all models (bodyH / fullH / ratio / anim / verdict)

| model | active | bodyH | fullH | ratio | anim | verdict |
|---|:-:|--:|--:|--:|--:|---|
| imported.niya | yes | 1.70 | 14.49 | 8.52 | 14 | STRIP stray effect mesh(es) |
| imported.heromiku | yes | 1.70 | 4.27 | 2.51 | 19 | STRIP stray effect mesh(es) |
| imported.ma | yes | 1.70 | 3.97 | 2.33 | 13 | STRIP stray effect mesh(es) |
| imported.picacugy | yes | 1.70 | 3.61 | 2.12 | 9 | STRIP stray effect mesh(es) |
| imported.bulbasaur | yes | 1.70 | 3.13 | 1.84 | 8 | KEEP (big mesh is legit body part/weapon) |
| imported.linkstik | yes | 1.70 | 2.78 | 1.64 | 10 | KEEP (big mesh is legit body part/weapon) |
| imported.renaryugu2 | yes | 1.70 | 2.52 | 1.48 | 14 | STRIP stray effect mesh(es) |
| imported.cloud | yes | 1.70 | 2.44 | 1.44 | 13 | STRIP stray effect mesh(es) |
| imported.herosaber | yes | 1.70 | 2.41 | 1.42 | 14 | STRIP stray effect mesh(es) |
| imported.sd2 | yes | 1.70 | 2.09 | 1.23 | 8 | clean |
| imported.herofate | yes | 1.70 | 2.07 | 1.22 | 14 | clean |
| imported.negi | yes | 1.70 | 1.95 | 1.15 | 10 | clean |
| imported.heroichigo | yes | 1.70 | 1.95 | 1.15 | 19 | clean |
| imported.gumdam | yes | 1.70 | 1.91 | 1.13 | 4 | clean |
| imported.ye-wuqi1 | yes | 1.70 | 1.91 | 1.12 | 9 | clean |
| imported.linainvers | yes | 1.70 | 1.85 | 1.09 | 6 | clean |
| imported.herohimurakenshin | yes | 1.70 | 1.84 | 1.08 | 12 | clean |
| imported.pika | yes | 1.70 | 1.82 | 1.07 | 9 | clean |
| imported.fox | yes | 1.70 | 1.76 | 1.03 | 7 | clean |
| imported.fox2 | yes | 1.70 | 1.76 | 1.03 | 7 | clean |
| imported.goku | yes | 1.70 | 1.75 | 1.03 | 8 | clean |
| imported.heroshana | yes | 1.70 | 1.74 | 1.02 | 10 | clean |
| imported.herobiggon | yes | 36.35 | 36.35 | 1.00 | 12 | clean |
| imported.herobuu | yes | 1.70 | 1.70 | 1.00 | 9 | clean |
| imported.herogirl | yes | 1.70 | 1.70 | 1.00 | 12 | clean |
| imported.herohanzouhattori | yes | 1.70 | 1.70 | 1.00 | 11 | clean |
| imported.herohehi | yes | 1.70 | 1.70 | 1.00 | 9 | clean |
| imported.herokunoichi | yes | 1.70 | 1.70 | 1.00 | 12 | clean |
| imported.herokyo | yes | 1.70 | 1.70 | 1.00 | 11 | clean |
| imported.herolight | yes | 1.70 | 1.70 | 1.00 | 7 | clean |
| imported.herolingtong | yes | 1.70 | 1.70 | 1.00 | 12 | clean |
| imported.heromusashimiyamoto | yes | 1.70 | 1.70 | 1.00 | 12 | clean |
| imported.herooichi | yes | 1.70 | 1.70 | 1.00 | 10 | clean |
| imported.heropikachu | yes | 1.70 | 1.70 | 1.00 | 7 | clean |
| imported.herorider | yes | 1.70 | 1.70 | 1.00 | 9 | clean |
| imported.herosasuke | yes | 1.70 | 1.70 | 1.00 | 12 | clean |
| imported.herosephiroth | yes | 1.70 | 1.70 | 1.00 | 11 | clean |
| imported.herotoshiiemaeda | yes | 1.70 | 1.70 | 1.00 | 12 | clean |
| imported.heroxelloss | yes | 1.70 | 1.70 | 1.00 | 11 | clean |
| imported.horse | yes | 1.70 | 1.70 | 1.00 | 10 | clean |
| imported.hzyn | yes | 1.70 | 1.70 | 1.00 | 12 | clean |
| imported.kikyou | yes | 1.70 | 1.70 | 1.00 | 9 | clean |
| imported.lgcr | yes | 1.70 | 1.70 | 1.00 | 6 | clean |
| imported.long | yes | 1.70 | 1.70 | 1.00 | 10 | clean |
| imported.lubu | yes | 1.70 | 1.70 | 1.00 | 11 | clean |
| imported.luffe | yes | 1.70 | 1.70 | 1.00 | 10 | clean |
| imported.mfls | yes | 1.70 | 1.70 | 1.00 | 12 | clean |
| imported.rabbit | yes | 1.70 | 1.70 | 1.00 | 8 | clean |
| imported.sesshomaru | yes | 1.70 | 1.70 | 1.00 | 8 | clean |
| imported.zy3 | yes | 1.70 | 1.70 | 1.00 | 24 | clean |
| imported.collision | yes | — | — | — | 1 | EMPTY/EFFECT-ONLY (no solid mesh) |
| imported.lightningnova |  | 0.05 | 6.81 | 145.54 | 1 | has stray mesh (inactive/effect model — low priority) |
| imported.heroeva01s2 |  | 0.01 | 1.43 | 109.78 | 2 | has stray mesh (inactive/effect model — low priority) |
| imported.heroraichus3 |  | 0.01 | 1.43 | 109.78 | 2 | has stray mesh (inactive/effect model — low priority) |
| imported.holyawakening |  | 0.22 | 1.93 | 8.85 | 1 | has stray mesh (inactive/effect model — low priority) |
| imported.minitypeflame |  | 1.15 | 4.38 | 3.80 | 3 | has stray mesh (inactive/effect model — low priority) |
| imported.grandorcaura |  | 0.00 | 3.00 | 3.00 | 2 | has stray mesh (inactive/effect model — low priority) |
| imported.grandundeadaura |  | 0.00 | 3.00 | 3.00 | 2 | has stray mesh (inactive/effect model — low priority) |
| champ.mage |  | 0.95 | 2.72 | 2.84 | 76 | clean |
| champ.knight |  | 0.92 | 2.47 | 2.69 | 76 | clean |
| champ.rogue |  | 0.87 | 2.19 | 2.51 | 76 | clean |
| champ.barbarian |  | 0.96 | 2.40 | 2.48 | 76 | clean |
| imported.japanesecherry |  | 10.83 | 19.55 | 1.80 | 1 | clean |
| imported.blackhole1 |  | 0.33 | 0.56 | 1.67 | 4 | has stray mesh (inactive/effect model — low priority) |
| imported.heropika |  | 1.70 | 2.82 | 1.66 | 8 | clean |
| imported.doom |  | 3.85 | 6.06 | 1.57 | 1 | has stray mesh (inactive/effect model — low priority) |
| imported.xzz |  | 1.70 | 2.37 | 1.39 | 7 | clean |
| imported.hero-turtle |  | 1.70 | 2.33 | 1.37 | 8 | clean |
| imported.boxcat |  | 0.22 | 0.30 | 1.35 | 4 | clean |
| imported.bladestorm-swordeffect |  | 9.16 | 12.13 | 1.32 | 3 | clean |
| imported.earthtornado2 |  | 9.16 | 12.13 | 1.32 | 3 | clean |
| imported.lightningtornado |  | 9.16 | 12.13 | 1.32 | 2 | clean |
| imported.supershinythingy |  | 8.01 | 10.58 | 1.32 | 1 | clean |
| imported.tectonicfury |  | 5.16 | 6.77 | 1.31 | 3 | clean |
| imported.bahamut |  | 1.70 | 2.22 | 1.30 | 8 | clean |
| imported.herocloudstrife |  | 1.70 | 1.83 | 1.08 | 9 | clean |
| imported.meteor |  | 27.26 | 29.32 | 1.08 | 1 | has stray mesh (inactive/effect model — low priority) |
| imported.darkraor |  | 2.41 | 2.50 | 1.04 | 13 | clean |
| imported.oblivionaura |  | 2.51 | 2.59 | 1.03 | 1 | clean |
| imported.ritsu |  | 1.70 | 1.73 | 1.02 | 10 | clean |
| imported.1hswd-01 |  | 0.54 | 0.54 | 1.00 | 1 | clean |
| imported.aquaspikeversion2 |  | 16.63 | 16.63 | 1.00 | 1 | clean |
| imported.awing |  | 5.08 | 5.08 | 1.00 | 1 | clean |
| imported.azunyan |  | 1.70 | 1.70 | 1.00 | 10 | clean |
| imported.billy |  | 1.70 | 1.70 | 1.00 | 10 | clean |
| imported.bloodbreathstream |  | 1.76 | 1.76 | 1.00 | 1 | clean |
| imported.bwing |  | 5.08 | 5.08 | 1.00 | 1 | clean |
| imported.charlie |  | 1.70 | 1.70 | 1.00 | 4 | clean |
| imported.crescent |  | 3.33 | 3.33 | 1.00 | 2 | clean |
| imported.deathwave |  | 4.30 | 4.30 | 1.00 | 3 | clean |
| imported.fireblast |  | 2.67 | 2.67 | 1.00 | 3 | clean |
| imported.firefly |  | 0.56 | 0.56 | 1.00 | 6 | clean |
| imported.flamessmoke |  | 9.53 | 9.53 | 1.00 | 1 | clean |
| imported.flash |  | 3.49 | 3.49 | 1.00 | 1 | clean |
| imported.goku3head |  | 2.84 | 2.84 | 1.00 | 1 | clean |
| imported.gokuhead |  | 1.17 | 1.17 | 1.00 | 1 | clean |
| imported.gx |  | 3.94 | 3.94 | 1.00 | 3 | clean |
| imported.gxhuge |  | 78.90 | 78.90 | 1.00 | 3 | clean |
| imported.herocloudcyd |  | 8.44 | 8.44 | 1.00 | 1 | clean |
| imported.herocloudkfksword |  | 5.80 | 5.80 | 1.00 | 1 | clean |
| imported.herofatezemberform |  | 0.84 | 0.84 | 1.00 | 0 | clean |
| imported.herofatezemberformbig |  | 7.36 | 7.36 | 1.00 | 0 | clean |
| imported.heroluffeattack |  | 4.24 | 4.24 | 1.00 | 3 | clean |
| imported.heroryuk |  | 1.70 | 1.70 | 1.00 | 6 | clean |
| imported.heroshanawingsmall |  | 3.19 | 3.19 | 1.00 | 1 | clean |
| imported.holo |  | 6.80 | 6.80 | 1.00 | 1 | clean |
| imported.horsehead |  | 1.70 | 1.70 | 1.00 | 10 | clean |
| imported.katana |  | 0.31 | 0.31 | 1.00 | 0 | clean |
| imported.konyui |  | 1.70 | 1.70 | 1.00 | 7 | clean |
| imported.love2 |  | 4.06 | 4.06 | 1.00 | 1 | clean |
| imported.luffe-punch |  | 2.10 | 2.10 | 1.00 | 1 | clean |
| imported.magical-sword |  | 1.17 | 1.17 | 1.00 | 1 | clean |
| imported.ne-shield |  | 2.18 | 2.18 | 1.00 | 1 | clean |
| imported.netherstrike |  | 30.71 | 30.71 | 1.00 | 1 | clean |
| imported.purplecoat |  | 1.98 | 1.98 | 1.00 | 2 | clean |
| imported.sonicbreathstream |  | 7.03 | 7.03 | 1.00 | 1 | clean |
| imported.student |  | 1.70 | 1.70 | 1.00 | 6 | clean |
| imported.txbbb |  | 1.70 | 1.70 | 1.00 | 5 | clean |
| imported.war3mapimported-poweraura |  | 7.49 | 7.49 | 1.00 | 1 | clean |
| imported.windmissle |  | 4.30 | 4.30 | 1.00 | 3 | clean |
| imported.wuqi |  | 4.53 | 4.53 | 1.00 | 1 | clean |
| imported.babyface |  | — | — | — | 0 | EMPTY/EFFECT-ONLY (no solid mesh) |
| imported.blackhole |  | — | — | — | 2 | EMPTY/EFFECT-ONLY (no solid mesh) |
| imported.boomnl |  | — | — | — | 0 | EMPTY/EFFECT-ONLY (no solid mesh) |
| imported.darkbreathdamage |  | — | — | — | 0 | EMPTY/EFFECT-ONLY (no solid mesh) |
| imported.demonfilth |  | — | — | — | 0 | EMPTY/EFFECT-ONLY (no solid mesh) |
| imported.divinering |  | — | — | — | 1 | EMPTY/EFFECT-ONLY (no solid mesh) |
| imported.enchant |  | — | — | — | 1 | EMPTY/EFFECT-ONLY (no solid mesh) |
| imported.frostnova |  | 0.00 | 0.00 | 0.00 | 1 | clean |
| imported.heronarutos4effect |  | — | — | — | 3 | EMPTY/EFFECT-ONLY (no solid mesh) |
| imported.lasercannonfinalred |  | — | — | — | 0 | EMPTY/EFFECT-ONLY (no solid mesh) |
| imported.lavabreathdamage |  | — | — | — | 0 | EMPTY/EFFECT-ONLY (no solid mesh) |
| imported.midchildernanohaaura |  | 0.00 | 0.00 | 0.00 | 1 | clean |
