# Third-party asset credits

All bundled art assets are **CC0 (public domain)** — free for any use, no attribution
required (credits kept here out of courtesy and for provenance).

## Characters (`models/champions/*.glb`)

**KayKit — Character Pack: Adventurers (1.0)** by Kay Lousberg (kaylousberg.com)
- Source: https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0
- License: CC0 (see pack's LICENSE.txt)
- Files: `mage.glb`, `knight.glb`, `barbarian.glb`, `rogue.glb` — rigged, 76 animation clips each.

## Environment props (`models/props/*.glb`)

**KayKit — Dungeon Remastered (1.0)** by Kay Lousberg (kaylousberg.com)
- Source: https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0
- License: CC0
- Files: pillar, torch, torch_mounted, barrel_small, crates_stacked, chest,
  floor_tile_large, floor_tile_small, banner_shield_{blue,red,green,yellow}.

## Arena guardians (`models/props/guardian_*.glb`)

The per-arena face of the 中立守護塔 (task #89 / #105). **CC0, courtesy credit only —
NO attribution obligation.** Licence verified on the pack's own `LICENSE.txt` and
README, not by author reputation.

**KayKit — Character Pack: Skeletons (1.0)** by Kay Lousberg (kaylousberg.com)
- Source: https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0
- Also published at https://kaylousberg.itch.io/kaykit-skeletons (same pack; the page's
  licence field reads **"Creative Commons Zero v1.0 Universal"**)
- Licence, verbatim from the pack's own `LICENSE.txt`:
  > License: (Creative Commons Zero, CC0)
  > http://creativecommons.org/publicdomain/zero/1.0/
  > This content is free to use in personal, educational and commercial projects.
  > Support me by crediting Kay Lousberg, www.kaylousberg.com (this is not mandatory)

  and from the repo `README.md`:
  > **Free for personal and commercial use**, no attribution required. (CC0 Licensed)
- Downloaded with no login and no account, direct from `raw.githubusercontent.com`.
- File: **`guardian_skeleton.glb`** (1,036,516 B) — the `arena.skeleton` guardian,
  **拼裝骷髏 / 骨巨人**. Derived from the pack's `Characters/gltf/Skeleton_Minion.glb`
  (4,814,296 B upstream): geometry, rig, materials and texture are **byte-unchanged**;
  only the **animation set was trimmed from 95 clips to the 15** the guardian state
  machine uses, which is what takes it from 4.81 MB to 1.04 MB.
- Bone-white skeleton with an **exposed ribcage torso**, femur legs, bare skull and a
  tattered cloak; the eye sockets are a separate `Glow` material, so the torch ring
  backlights a lit-eyed silhouette for free. **5,288 tris / 4,858 verts**, 9 meshes,
  **2 materials** (`skeleton`, `Glow`), one **1024×1024 PNG gradient atlas, 17,037 B**
  (the whole pack shares it), skinned to a **41-bone `Rig`**.
- Native bbox **1.9382 × 2.1661 × 0.9122** (X is the T-pose arm span), origin at the
  feet — measured through the client's own load path (Babylon 7.54.3
  `LoadAssetContainerAsync` on a `NullEngine`, `refreshBoundingInfo({applySkeleton:true})`).
  Per-mesh rest heights: legs 0→0.529, torso 0.376→**1.4246** (top of the solid body),
  cloak 0.798→1.312, arms 1.005→1.202, jaw 1.193→1.516, **skull 1.314→2.1661**,
  glowing eyes 1.578→1.704 — i.e. the skull is already a separate mesh sitting entirely
  above the torso, which is what makes #89 §9.2's "solid body / non-occluding crown"
  split a mesh-name filter rather than a modelling job.
- At the height #89 §14 Q4 settled — **~3.4 u, 「只比人高一倍」, twice the 1.7 u hero** —
  the uniform scale is **3.4 / 2.1661 = 1.5696**, and then *every mesh except the skull
  and its eye glow already sits under `SIGHTLINE_HEIGHT_CAP` 2.4 u*: torso top 2.236,
  jaw top 2.380, cloak top 2.059, legs top 0.831, skull 2.062→3.400, eyes 2.476→2.675.
  Footprint 1.432 u deep, well inside the guardian's 2.5 u radius. #29's ray sweep still
  has to be re-run per §14, but the hollow ribcage and the single skull on a thin neck
  are the sparse silhouette that note asks for.
- Clip names, verbatim: `Skeletons_Inactive_Floor_Pose`, `Skeletons_Awaken_Floor`,
  `Skeletons_Awaken_Floor_Long`, `Skeleton_Inactive_Standing_Pose`, `Idle`,
  `Idle_Combat`, `Hit_A`, `Hit_B`, `Spellcast_Raise`, `Spellcast_Shoot`,
  `Spellcasting`, `Death_C_Skeletons`, `Death_C_Pose`, `Taunt`, `Walking_D_Skeletons`.
- *Kit-bash parts from the same CC0 pack, not staged:* `Characters/gltf/Skeleton_Warrior.glb`
  carries the horned helmet (`Skeleton_Warrior_Helmet`, 830 tris) on the identical
  41-bone `Rig`, and `Assets/gltf/Skeleton_Axe` (534 tris) / `Skeleton_Shield_Large_A`
  (626 tris) are standalone accessories. They exist for the "one heavy arm, one thin
  one, horn crown" read if the integrate phase wants it — same rig, same atlas, no new
  licence.
- **The EXTRA/SOURCE itch.io tiers (which contain a purpose-built Skeleton Golem and a
  Necromancer) are PAID and were NOT used.** Everything here is from the free public
  GitHub repo.

## Hex terrain (`models/hex/*.glb`)

**KayKit — Medieval Hexagon Pack (1.0)** by Kay Lousberg (kaylousberg.com)
- Source: https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0
- License: CC0
- Files (glTF→glb, self-contained): `hex_water`, `hex_grass`, `tree_single`,
  `trees_medium`, `trees_large`, `rock`, `waterlily`, `tower_blue`, `tower_red`.
  Used by the `arena.dota` river/jungle/lane-base decor.

## Login scene models (`models/menu/*.glb`)

The login-screen boss dragon is **`dragon2.glb`** (LasquetiSpice, CC-BY 4.0, below),
referenced by `apps/client/src/render/menu/LoginScene.ts` (`DRAGON_URL`). It SOARS the
vista with its real baked wing-flap. The earlier cartoon incumbent **`dragon.glb`**
("Dragon Evolved" by Quaternius, CC0) was **rejected and removed** — it read as an
imp/gargoyle and only hovered in place; it is no longer shipped and no code references
it (the `ModelDragonController` falls back to a procedural mesh, not to any file).

> **⚠ ATTRIBUTION REQUIRED for `dragon2.glb` — this file is NOT CC0, and it is the
> model that ACTUALLY SHIPS on the login screen.** It is **CC-BY 4.0**, so its credit
> line **must** be surfaced on the in-game credits/settings screen (task #13). This is
> a license obligation, not courtesy.
>
> Note for task #13: this used to be one of *two* mandatory in-game credits, the other
> being the BGM. **That BGM credit is now gone (task #91)** — all eleven tracks are our
> own work (see "Background music" below), so this dragon is the one mandatory display
> credit that remains.

**Animated Dragon Three Motion Loops** by **LasquetiSpice** — semi-realistic Western dragon
- Source (original): https://sketchfab.com/3d-models/animated-dragon-three-motion-loops-eca98cf6cd084c1596cecf716e110c29
- Author profile: https://sketchfab.com/LasquetiSpice
- Obtained via: Objaverse 1.0 mirror (allenai/objaverse on Hugging Face, object
  `eca98cf6cd084c1596cecf716e110c29`), which redistributes the model under its
  original Sketchfab license. Downloaded directly (no Sketchfab login required).
- License: **CC-BY 4.0** (https://creativecommons.org/licenses/by/4.0/) — attribution
  **mandatory**. Verified on the model's own Sketchfab page ("CC Attribution").
- **Required credit string (verbatim):**
  > "Animated Dragon Three Motion Loops" (https://sketchfab.com/3d-models/animated-dragon-three-motion-loops-eca98cf6cd084c1596cecf716e110c29)
  > by LasquetiSpice (https://sketchfab.com/LasquetiSpice) licensed under CC-BY 4.0
  > (https://creativecommons.org/licenses/by/4.0/)
- File: `dragon2.glb` (4.35 MB). Semi-realistic textured Western dragon — scaled skin,
  horned skull, large membrane wings, long tail. 1 mesh, 1 skeleton, **220 bones**,
  12,267 verts / **19,542 tris**, 1 PBR material (Diffuse + Normal + Occlusion +
  Specular-Glossiness maps). Ships with **one animation clip `Flying`** (frames 0–788,
  412 channels) — a real soaring/wing-flap flight cycle (the source's idle/fly/roar
  loops appear concatenated into this single timeline; the integrate phase can play
  the flight sub-range). Extensions: `EXT_texture_webp`, `KHR_materials_pbrSpecularGlossiness`
  (both supported by Babylon 7.54). Optimized from the 8.38 MB Objaverse original with
  `gltf-transform prune + dedup + webp(q90)` → 4.35 MB (geometry/rig/animation unchanged;
  four 1024² PNG maps re-encoded to WebP). **This is THE login-screen dragon** — the
  integrate phase pointed `DRAGON_URL` here and removed the old cartoon `dragon.glb`.
  Renders at ~5.7-unit wingspan × the controller's uniform scale, faces local +Z (the
  flight controller yaws it to its travel tangent, pitches on climb/dive, and banks into
  turns), with the `Flying` clip looped as a slow, majestic wing-flap.
- *Also evaluated (directly-downloadable CC-BY fallback, not staged):* **"Dragon Rigged"**
  by **na3ee1**, CC-BY 3.0 (https://creativecommons.org/licenses/by/3.0/),
  https://poly.pizza/m/WIOTISRjeX — a clean low-poly Western dragon in a spread-wing
  glide pose, rigged (79 bones) but **flat-shaded (no textures) and no baked animation
  clips**. Kept as a lightweight (~340 KB) fallback in scratch; `dragon2.glb` (LasquetiSpice)
  was chosen for its semi-realistic textured look + baked flight animation.

## Intermission shop set (`models/shop/*.glb`)

The 中場 (intermission) is its OWN Babylon scene — not a prop dressed onto the arena —
so this travelling-merchant set never appears during combat. Three models, **all CC0
(courtesy credit only, NO attribution obligation)**, all by **Quaternius**
(https://quaternius.com), obtained from the **Poly Pizza** mirror, which redistributes
them under their original licence and serves the `.glb` straight off `static.poly.pizza`
**with no login and no account**.

> **Licence verified ON EACH MODEL PAGE, not by reputation** (the task #16 dragon
> precedent). Every one of the three pages carries the verbatim line
> **"FBX/GLTF format • Public Domain (CC0)"** linking
> https://creativecommons.org/publicdomain/zero/1.0/. Corroborated upstream on
> Quaternius' own pack pages, whose *License* field links the same CC0 deed.
> This check was NOT a formality: the neighbouring **"Animated Wizard"**
> (https://poly.pizza/m/kttbFvCl2C, also by Quaternius, also low-poly, also rigged)
> reads **"Creative Commons Attribution"** — CC-BY, i.e. a *mandatory* credit —
> so it was **rejected** for this set. Nothing here adds a display obligation;
> the CC-BY login dragon stays the only mandatory in-game credit (task #13).

**Cart** by Quaternius — `merchant_cart.glb` (108,660 B)
- Source: https://poly.pizza/m/l7bDe7ak6j (posted Jul 11, 2022)
- License: **CC0 / Public Domain** (stated on that page)
- Two-wheeled hand-cart with pull shafts and a maroon/cream striped canopy on four
  posts — the 旅行商人 silhouette (it has WHEELS: the shop visibly travels with you).
  1 mesh / 5 primitives, 2,659 tris, 5 flat-colour materials, **0 textures**, no rig.
  Native bbox 0.462 × **0.7961** × 0.9274 with the origin on the ground plane.

**Market Stand** by Quaternius — `merchant_stall.glb` (63,640 B)
- Source: https://poly.pizza/m/hts7l0NZxW (posted Jul 11, 2022)
- License: **CC0 / Public Domain** (stated on that page)
- Wooden counter + striped awning + striped back curtain — the counter the champion
  actually walks up to. 1 mesh / 3 primitives, 1,132 tris, 3 materials, 0 textures.
  Native bbox 0.5172 × **1.0421** × 1.1542, origin on the ground plane.

**Hooded Adventurer** by Quaternius — `merchant.glb` (1,598,564 B)
- Source: https://poly.pizza/m/y9KWOVG21R (posted Apr 10, 2022)
- License: **CC0 / Public Domain** (stated on that page)
- The 店員: hooded brown cowl, leather harness, dark trousers — a wanderer, not a
  townsfolk. Meshes `Medieval_Head/Body/Legs/Feet` + a detachable **`Sword`** mesh
  (hidden for the shopkeeper read). 7,276 tris, 11 flat-colour materials, 0 textures,
  skinned, and it ships **24 baked clips** on Quaternius' shared `CharacterArmature`
  rig — verbatim names `CharacterArmature|Idle`, `|Idle_Neutral`, `|Wave`,
  `|Interact`, `|Walk`, `|Run`, `|Roll`, `|Death`, … so the animated-figure bonus is
  covered: `Idle` loops by default, `Wave` fires on scene entry, `Interact` on a
  purchase. Native bbox 0.5756 × **1.8367** × 1.0255 (Babylon 7.54
  `refreshBoundingInfo({applySkeleton:true})`, origin at the feet).

All three were **measured through the client's own load path** — Babylon 7.54
`LoadAssetContainerAsync` on a `NullEngine`, the same version the client ships — so
the heights below are measured, not guessed. Rendered scales (game units, champions
render normalised to 1.7 u — see `modelScale.fixture.json`):

| file | native H | scale | **rendered H** | footprint |
|---|---|---|---|---|
| `merchant_cart.glb` | 0.7961 | **3.20** | **2.548 u** | 1.48 × 2.97 u |
| `merchant_stall.glb` | 1.0421 | **2.00** | **2.084 u** | 1.03 × 2.31 u |
| `merchant.glb` | 1.8367 | **0.953** | **1.750 u** | — (heroes are 1.7 u) |

No 2.4 u prop cap applies: task #29's occluder sweep governs the ARENA, and this set
stands in a different scene. Nothing here is loaded by `ArenaScene`.

*Also evaluated, CC0, not staged:* `Market Stand` https://poly.pizza/m/DGIM5HGISb
(open-backed twin of the chosen stall), `Market Stalls Compact`
https://poly.pizza/m/fmHUuX9AS3 (2×2 produce stalls, 14,164 tris / 988 KB — a good
background "market square" filler if the set ever needs more depth), `Village Market`
https://poly.pizza/m/0TsHLxX6CB. The dressing around the cart (barrels, stacked
crates, chest, torches, floor tiles, banners; trees/rocks for the far silhouette)
reuses the **KayKit Dungeon Remastered / Medieval Hexagon** models ALREADY shipped
above — no new download, and it is why the set sits beside the existing props instead
of looking imported from another game.

## Neutral guardians (`models/guardians/*.glb`)

The per-arena face of the 中立守護者 (task #105; mechanics live in `docs/guardian-tower.md`
§9, which caps the occluding body at `SIGHTLINE_HEIGHT_CAP` = 2.4 u).

**Triceratops** by Quaternius — `guardian_beast.glb` (309,684 B)
- Source: https://poly.pizza/m/IGvrUqGrRM (posted Aug 18, 2021)
- License: the model page's own line, verbatim —
  **"Aug 18, 2021 • FBX/GLTF format • Public Domain (CC0)"**, the words
  *Public Domain (CC0)* hyperlinked to https://creativecommons.org/publicdomain/zero/1.0/.
  Courtesy credit only; **no attribution obligation, no change to task #13's
  mandatory list** (which stays exactly one item: the CC-BY login dragon).
- sha256 `79ade346de5e778a58ce8c253c7e6dbd505499176a616583d1a29fa4624f498c`, fetched
  straight off `https://static.poly.pizza/6aa1f3ff-b9b3-4bb5-9d85-b2ffa514f0cc.glb`
  with no login and no account.
- The `arena.dota` guardian **山寨肉山 (巨獸)** — the river zone's neutral objective.
  A hunched, heavy-shouldered quadruped with a raised horned head and a broad frill:
  the frill and brow horns give the crown read, the shoulders give the mass.
  1 mesh / 3 primitives, **1,332 tris**, 2,662 verts, **3 flat-colour materials,
  0 textures / 0 texture bytes** — so the mossy-shell/algae recolour is three
  `baseColorFactor` swaps, not a texture author.
- Skinned, `skeleton0` with **29 bones**, and it ships **6 baked clips** — verbatim
  names `Armature|Triceratops_Idle` (2.542 s, **14 channels**),
  `|Triceratops_Death` (1.792 s, 31 ch), `|Triceratops_Attack` (0.750 s, 18 ch),
  `|Triceratops_Walk` (2.917 s, 36 ch), `|Triceratops_Run` (0.792 s, 36 ch),
  `|Triceratops_Jump` (1.667 s, 33 ch). Idle and Death — the two the guardian
  actually needs — are the two cheapest.
- Native bbox **5.8482 × 8.8714 × 20.9815** (`minY` −0.112), measured through the
  client's own load path: Babylon **7.54.3** `NullEngine` +
  `refreshBoundingInfo({ applySkeleton: true })`, the same version the client ships.
  Scaled to the 2.4 u sightline cap → **scale 0.2705**, rendered footprint
  1.58 × 5.68 u, top height 2.4 u (heroes are 1.7 u).
- **Staged & swept (#105):** ship **broadside** (`rotQuarter 1`/`3`, footprint 5.67 × 1.58 u) — it
  reads best AND sweeps tallest. Task #29's 35-ray occluder sweep at `zone.center` on both zones (added
  UNSQUASHED, since a spawned guardian entity is not squashable decor) **PASSES with 0 failures** at
  the 2.4 u ship height; the tallest scale this SOLID silhouette passes is **≈ 2.49 u** (scale ~0.279),
  far short of the 3.4 u the sparse 樹人 / 骨巨人 forms reach — that per-silhouette gap is the finding.
  Full sweep table and derivation in `docs/guardian-tower.md` §15.2.

> **Licence verified ON THIS MODEL'S OWN PAGE, and the per-model check earned its
> keep again.** Quaternius is *not* uniformly CC0: **"Big arm"**
> (https://poly.pizza/m/KaVJET0WHx, same author, same low-poly style, also rigged and
> animated) is **CC-BY 3.0**, a mandatory display credit, and it was a real candidate
> for this slot. All six Quaternius dinosaurs were checked individually and all six
> read CC0 1.0. Everything sourced from *Poly by Google*, *jeremy* and *Hoai Nguyen*
> (the crocodiles, hippo, gorillas, bears, armadillos, ground sloth, Armored
> Allosaurus, Stegoknight) is **CC-BY 3.0** and was rejected on that basis alone.

*Also evaluated, CC0, not staged:* **Stegosaurus**
https://poly.pizza/m/eFcNbOlpvl (same pack, same page line "Aug 18, 2021 •
FBX/GLTF format • Public Domain (CC0)", 2,282 tris, 0 textures, 29 bones, the same
6 clips, native bbox 5.1309 × 10.5004 × 22.9471) — the *back-spine* reading of the
same brief: a dense double row of dorsal plates plus a spiked tail, which is the
closer echo of Roshan's carapace. It lost on two counts: 71% more triangles, and a
long thin spiked tail that sprawls ~2.7 u from the body at guardian scale, which is
worse as a compact click target at `zone.center`. Keep it as the alternate if the art
direction wants the spine row over the horns. Also evaluated and rejected as not
reading as 巨獸 at all: Quaternius `Yeti`, `Goleling`/`Goleling Evolved`, `Monkroose`,
`Crab Enemy`, `Glub Evolved`, `Armored Catfish`, `Giant`, `Enemy Large` — all CC0,
all cute cartoon blobs at this camera.

### `arena.godie` — 白木三叔公 (樹人 / sakura treant), a COMPOSITE, not one model

The `arena.godie` (去死團的逆襲 EX 2.2s, `groundStyle` dirt) guardian is the map's
**HOME** face: a 白木 — the map's own original tree-clan (`content/champions/godie-e00s.json`
白木老樹精 白木卡迪那, 「通常處於被動守護狀態…不像黃金龍族常巡邏出擊」). A neutral guardian that
stands at `zone.center` and only fights back when hit *is* a 白木, so this arena is where
#89 Q4's 樹人 default is native. Named 三叔公 (great-uncle third), 卡迪那's family register.

Unlike the skeleton and beast — each a single rigged glb with baked idle/death/hit clips —
this guardian is a **three-part composite**, because its brief mandates that the crown be
the arena's OWN geometry (the decor is `50 × japanesecherry.glb` and literally nothing
else). There is **no single rigged CC0 glTF sakura-treant in existence** — see the
"rigged alternative" note below — so the faithful build is a re-materialised canopy on a
sourced CC0 trunk-and-roots body:

1. **CROWN / 樹冠 = `models/imported/japanesecherry.glb` — ZERO NEW ASSET, already
   vendored.** The arena's own cherry tree (the map author's *own* work — `import_report`:
   「自製櫻花樹模型」 — so it ships as OURS, no third-party licence). It is a **2-primitive**
   mesh: `mesh_primitive0` is the **bark sub-branch** geoset (mat0, opaque, 44 verts,
   native |xz|≤2.01, y −0.77→17.11) and `mesh_primitive1` is the **sakura blossom** canopy
   (mat1, **alpha-BLEND** foliage, 108 verts, native |xz|≤9.83, y 7.94→18.78). Re-instancing
   `_primitive1` above the trunk **is** the crown; because it is alpha-blended foliage with
   gaps, it is the sparse silhouette #89 §14 Q4 asks for — the wide part of the guardian is
   see-through, only the trunk is a solid occluder. Wake (canopy shivers, drops petals) and
   death (trunk splits, crown blows away as a petal storm) are **procedural VFX** on this
   geometry + `VfxSystem` petals — the §9.2/§9.4 procedural-state model — **not** baked
   skeletal clips, which is why the body meshes below need no rig.

2. **TRUNK / 樹幹 = `guardian_treant_trunk.glb` (24,412 B)** — a gnarled bare bark trunk.
   **KayKit — Halloween Bits** by Kay Lousberg (kaylousberg.com), the *same author* as the
   champions / props / hex sets, so it is the tightest stylistic match in the whole vendored
   tree.
   - Source: https://poly.pizza/m/k80NkrvY2f ("Dead tree" by Kay Lousberg)
   - Licence, verbatim from that model's own page: **"Public Domain (CC0)"**, the words
     hyperlinked to https://creativecommons.org/publicdomain/zero/1.0/. Courtesy credit
     only; **no attribution obligation, no change to task #13's mandatory list**.
   - sha256 `abaf1cf785904c8b6fbe855e4c20bbc9ffb3e3c94533fc0f8224a3e594e223e7`, fetched
     byte-unchanged from `https://static.poly.pizza/4077bb9f-b2c9-43f0-baf4-2f81be2f60c5.glb`
     with no login and no account.
   - **256 tris / 177 verts**, 1 mesh (`tree_dead_large`), **1 material** (`HalloweenBits`),
     one shared **256² PNG atlas `halloweenbits_texture.png`, 15,093 B**. **No skin, 0
     animation clips.** Native bbox **2.3016 × 5.0661 × 1.3766** (y −0.272→4.794), origin
     near the base.

3. **ROOT-CLAWS / 盤根 = `guardian_treant_roots.glb` (15,376 B)** — a stump with root
   spurs radiating from the base: the "root-claws gripping the ground" the brief names.
   **Quaternius** (quaternius.com).
   - Source: https://poly.pizza/m/nFvEbUX6LE ("Tree Stump with Moss" by Quaternius)
   - Licence, verbatim from that model's own page: **"Public Domain (CC0)"**, hyperlinked
     to https://creativecommons.org/publicdomain/zero/1.0/. Courtesy credit only.
   - sha256 `194f67985d88a6e4a0857971772a292ab517306c3f6c7820a7302bba4ee40803`, fetched
     byte-unchanged from `https://static.poly.pizza/f6caf11a-75ff-4a6e-9d87-28b44f685803.glb`.
   - **232 tris / 468 verts**, 1 mesh (`TreeStump_Moss`), **2 flat-colour materials**
     (`Wood`, `Green` — vertex/`baseColorFactor` colour, so the bark/moss recolour is two
     factor swaps), **0 textures / 0 texture bytes. No skin, 0 animation clips.** Native
     bbox **1.3596 × 0.6216 × 1.0314** (a low, wide root pad).

   > **Per-model check, again, earned its keep.** Quaternius is *not* uniformly CC0 (the
   > `guardian_beast` note above found `Big arm` CC-BY 3.0 by the same author). Both pages
   > here were opened individually and both read the verbatim **"Public Domain (CC0)"** line;
   > nothing sourced adds a display obligation — the CC-BY login dragon (#13) stays the only
   > mandatory in-game credit.

**Cost.** Body total **488 tris + one 15,093 B texture**; the crown re-uses geometry
already loaded for the arena decor (0 additional). Negligible against the 182,610-tri /
198-file budget and the ~6,400-tri champions. At the #89 §14 Q4 target height **~3.4 u**
(「只比人高一倍」, 2× the 1.7 u hero) the composite scales to roots ≈ ×2.5 (footprint ~2.6 u,
inside the 2.5 u guardian radius), trunk ≈ ×0.46 (top ~2.7 u), crown = `_primitive1` at the
arena's own decor scale (~0.115) offset to ~2.0 u — the SOLID occluder is only the ~0.4 u-wide
trunk, so #29's 35-ray sweep (which must still be re-run per §14) sees a thin shaft, not a
2.4 u+ slab. **#89 §9.3 is unchanged: no new mandatory attribution.**

*Rigged single-file alternative, evaluated and NOT chosen (flag it as a decision, not an
accident):* **Tennessippi Studios "Treant Pack"** (https://tennessippitudios.itch.io/treant-pack —
page reads verbatim "**---CC0--- No Attribution Required----**", 2 treants, 5,438 / 7,340 tris,
10 clips incl. `Idle` / `Attack01–03` / `Death01–03` / `Taunt`) is a genuine rigged treant and
would match the skeleton/beast single-rigged-glb convention. It was rejected because (a) it ships
**FBX + OBJ only, no glTF**, and this environment has no Blender / FBX2glTF to convert or verify
it; and (b) it is a **bipedal Groot** — it does not, and cannot, use the arena's own sakura
canopy, so it reads as a walking monster, not a rooted 白木 「被動守護」 standing guard. Pick it
only if the art direction abandons the "crown = the arena's own cherry" pillar. *Also evaluated,
CC0, not staged:* Quaternius `Tree Blob` (/m/0X3fUj0uUF, 1,892 tris, root-legs built in — a valid
ONE-file body fallback if integration wants to minimise files) and `Tree Spikes` (/m/a6Vo1seJw9,
2,548 tris). Sketchfab treants were all rejected: the CC0 filter returns **zero** treants, and
every "Treant/Ent/Tree Golem" hit is CC-BY (mandatory credit) and/or 30k–2M tris.

### `arena.colosseum` — 石膏鬥士 (石頭人)

The sand amphitheatre's neutral objective (task #105): a statue of a past champion standing where
the plinth stands — the ONE arena where a stone body reads *against* the ground (grey stone on tan
sand, not stone-on-stone), which is why 石頭人 belongs on colosseum and not on castle/skeleton.
石膏 (plaster, not marble) is the joke: the fake Colosseum could only afford a fake statue, and it
chips.

**Warrior** (mesh `warr_03.comp`) by **mastjie** — `guardian_stone.glb` (301,924 B)
- Source: https://poly.pizza/m/Z6ZUtm6kc1 (posted Jun 23, 2022)
- Licence, verbatim from that model's own page: **"Jun 23, 2022 • FBX /GLTF format • Public Domain
  (CC0)"**, the words *Public Domain (CC0)* hyperlinked to
  https://creativecommons.org/publicdomain/zero/1.0/ (the page's embedded record reads
  `"license":"CC0 1.0"`, `"Animated":false`). Courtesy credit only; **no attribution obligation, no
  change to task #13's mandatory list** (which stays exactly one item: the CC-BY login dragon).
- sha256 `4160bdbfa82959f81eeb1983879f2955552edbae15b46f0e910fb3e947b21609`, fetched byte-unchanged
  from `https://static.poly.pizza/06763472-0463-4335-8daa-58a2e541303d.glb` with no login and no
  account.
- A low-poly **Roman gladiator**: a crested **galea** helm (a vertical plume — this **is** the
  "helm crest / laurel = crown layer" read), sleeved tunic, belted skirt, bracers and greaves;
  symmetric standing pose; **solid legs, torso and base**. Ships cream-skin + steel + brown → the
  **plaster/marble recolour is a material swap** (metallic→0, roughness→~0.9, one bone-white
  `baseColorFactor`), not a texture author — it drops straight into the #49 tint pipeline.
- **1 mesh, 4,300 tris / 8,560 verts, 1 material** (`w_m_03`, metallic 0.4 / rough 0.27, one
  baseColorTexture), one baked **97-byte PNG `w_txr.png`** (a flat-colour palette atlas — so
  **97 texture bytes total**, essentially free; the 302 KB file is uncompressed geometry, which the
  #99 batch optimiser can weld/dedup if it wants). **No skin, 0 animation clips.**
- Native bbox **0.0142 × 0.0231 × 0.0073** (authored at ≈1/100 unit; `minY` 0), measured through the
  client's own load path: Babylon **7.54.3** `NullEngine` + `refreshBoundingInfo({ applySkeleton:
  true })`. Scaled to the 2.4 u sightline cap → **scale ≈ 103.9**, rendered footprint 1.48 × 0.76 u,
  top height 2.4 u (heroes are 1.7 u) — a compact click target at `zone.center`.
- **Wake = the crack-light + step-off, death = shatter into `rock.glb` chalk rubble are the §9.2/§9.4
  PROCEDURAL states**, not baked skeletal clips — a statue stands dead-still then cracks apart, which
  is why a rigless static body is faithful here rather than a compromise. **#89 §9.3 is unchanged: no
  new mandatory attribution.**

> **Honest gaps, flagged for #89/#105 integration — this is NOT the beast's rigged Idle/Death.**
> (a) **No rig, 0 clips.** For this entity that matches §9.2 (procedural crack-wake + shatter-death),
> but the guardian view must fall back to procedural-only for the stone variant — it cannot play a
> baked `Idle`/`Death` the way `guardian_beast.glb` does. (b) **Symmetric standing pose, no sword
> mesh** — the galea crest carries the crown read, but the brief's literal "raised sword arm" is not
> in the geometry. (c) **Ships flesh-toned**; the plaster tint above is a required step, not baked in.
> (d) Tiny native unit → normalize to 2.4 u (routine — heroes already normalize to 1.7 u).

> **Per-model licence check, again per model not per author.** All three mastjie **"Warrior"**
> variants were opened individually and all three read the verbatim **"Public Domain (CC0)"** line:
> warr_01 (https://poly.pizza/m/RaWl2GJ0NZ, horned helm — reads Viking), warr_02
> (https://poly.pizza/m/o6i43Vacwc, flat cap) and **warr_03** (chosen, https://poly.pizza/m/Z6ZUtm6kc1),
> picked for the vertical galea crest = the clearest gladiator + crown-layer read.

*Rigged single-file alternative, evaluated and NOT chosen (a decision, not an accident):*
**Quaternius "Giant"** (https://poly.pizza/m/BldaiPtyJa, page line verbatim "Public Domain (CC0)")
— 3,812 tris, 1 mesh, a 512² atlas (`Atlas.png`, 3,567 B), 12-bone skin, and **7 baked clips incl.
`Idle` / `Attack` / `Death` / `HitRecieve`** — it matches the beast's rigged-single-glb convention
and tinted grey reads as a crude stone golem, but it is a fleshy big-nosed strongman with **no helm
crest, no sword, no laurel**, so it loses the "statue of a past champion" gladiator read the arena
brief demands. Pick it only if integration truly needs baked Idle/Death over the gladiator read.
*Also evaluated, CC0, rejected:* Quaternius **"Character Soldier"** (https://poly.pizza/m/PpLF4rt4ah,
CC0, rigged 14 clips incl. Idle/HitReact/Death) — **20,712 tris** (≈3× the heaviest champion) and a
chibi toy-soldier read. *The literal grey-stone option deliberately NOT taken to protect §9.3:*
the **Zsky "Statue" set** (e.g. https://poly.pizza/m/NZo0rzQExF — a crowned figure with a **raised**
staff arm, already stone-grey, 863 tris, needs no tint and even supplies the raised arm) reads as a
statue out of the box, but **every Zsky statue is CC-BY** — staging one would add a SECOND mandatory
in-game credit and contradict the settled §9.3 ("the mandatory-attribution list does not change").
Flagged, not shipped.

### `arena.castle` — 值班鎧甲 (空鎧), REUSES `champions/knight.glb` — ZERO NEW ASSET

The stone-hall guardian (task #105) is an **animated empty suit of full plate** — the castle's
on-duty armour that only fights back when struck. **No new file, no new licence:** it is
`assets/models/champions/knight.glb` (**KayKit Adventurers, CC0**, already credited under *Champion
models* above; `content/assets/models/champions/knight.glb`, `champ.thorne`), rendered as the 空鎧 by
**hiding the head, cape, weapons and shields** and reskinning the remainder to steel. **#89 §9.3 is
unchanged: no new mandatory attribution** (the CC-BY login dragon stays the only mandatory credit).

- **Subset shown (the 空鎧):** `Knight_Helmet` (closed **great-helm**, no face — the crown layer),
  `Knight_Body` (cuirass/gorget), `Knight_ArmLeft`/`Knight_ArmRight` (pauldrons + vambraces),
  `Knight_LegLeft`/`Knight_LegRight` (greaves). **Hidden:** `Knight_Head`, `Knight_Cape`, and every
  weapon/shield (`1H_Sword`, `2H_Sword`, `1H_Sword_Offhand`, `*_Shield`, `Badge_Shield`). **3,672
  tris**, shares the champions' single 1024² baked albedo — **0 new texture bytes**.
- **Silhouette, measured two ways through the client's own load path (Babylon 7.54.3 `NullEngine`):**
  the raw-glb accessor bounds are a **T-pose** (arm meshes authored straight out) → **1.9425 × 2.4666
  × 1.2536** (W×H×D); the **rendered idle** (`2H_Melee_Idle`, `refreshBoundingInfo({applySkeleton:
  true})`, arms tucked) is only **1.177 × 2.4688 × 1.376** — helmet-dominated, ~40% narrower. The
  static occluder-sweep reads the T-pose (conservative); the player sees the idle.
- **Height / scale.** #89 §14 Q4 family target **~3.4 u** (「只比人高一倍」, 2× the 1.7 u hero) →
  uniform **scale 1.377** (3.4 / 2.4688), rendered footprint **1.62 × 1.90 u**, well inside the
  guardian's 2.5 u radius. Wake/death are the §9.2/§9.4 **procedural** states over baked
  `2H_Melee_Idle` / `Hit_A`/`Hit_B` / `Death_A`/`Death_B` clips (72 baked in the shared file).

> **#29 35-ray sweep — RUN, not deferred (this is the technical crux of #105 for this face).**
> Staged at each `zone.center` of `arena.castle` (replacing the centre pillar the guardian *is*, §2),
> at **full height, NOT squashed to the 2.4 u cap**, then swept with the identical
> `apps/client/scripts/occluder-sweep.ts` math. **Result: PASS** — 52,250 standable points, 40
> occluders, worst ray-block 35/35 (every full-hide is an EXISTING prop's contact-hide; the guardian
> adds **zero** hides), 26 contact-hides (worst gap 0.401 u), **0 failures at 3.4 u**. The guardian's
> own full-hide band stays *inside* its 3.1 u keep-out ring (radius-2.5 obstacle + 0.6 body), so no
> hero can stand in it. **Tallest full-height PASS for this silhouette = top 3.871 u (scale 1.568);**
> first failure at 3.90 u (8 points on the innermost standable ring, 1.91 u clear). So 3.4 u ships
> with **0.47 u of headroom, no squash, no light-column trick, no fade-management.**
>
> **The finding the task predicted — silhouette + arena, not height alone.** A *solid* humanoid on an
> *open* centre (the beast on `arena.dota`, the statue on `arena.colosseum` — no centre obstacle) had
> to cap at 2.4 u because heroes stand right up to it. The same solid mass here clears **3.87 u**
> purely because `arena.castle`'s r-2.5 keep-out holds every hero ≥3.1 u away. Sensitivity: at r=1.5
> the ceiling is 3.03 u; even at a champion-sized r=0.6 body it is 2.61 u — still above the 2.4 u cap.
> **So the 3.4 u family height is safe as long as the guardian keeps its ≥1.5 u collision radius**
> (the spec's 2.5 u, §3.5, carried in the `shield` snapshot slot); a future shrink of that body
> would lower the ceiling and must re-run the sweep.

> **Honest gaps, flagged for #89/#105 integration** (the 空鎧 read is not free). (a) **The "empty /
> hollow" quality is carried by MATERIAL, not silhouette** — from the fixed 55° top-down camera the
> figure reads as a *faceless steel knight*, because the great-helm base (native y 1.11) sits *below*
> the cuirass top (1.29), so there is no visible neck-void from above; the emptiness needs a dark
> interior + cold rim, not just hidden meshes. (b) **Helm-dominant chibi proportion** (the helm is the
> top ~55% of the body) — it matches the game's own KayKit champions so it is not jarring, but it is a
> stout knight, not a slender suit. (c) **Fixed closed great-helm, not a hinged visor** — the brief's
> "visor snaps down with a clatter" has no geometry; nearest faithful read is the helm settling on
> wake. (d) **`Death_A`/`Death_B` are full-body collapses, not a per-plate disassembly** — the
> "comes apart plate by plate" is a client VFX job (detach the plate submeshes), not a baked clip.

## Particle textures (`textures/particles/*.png`)

**Particle Pack (1.1)** by Kenney Vleugels (kenney.nl)
- Source: https://www.kenney.nl/assets/particle-pack (mirror: https://github.com/Calinou/kenney-particle-pack)
- License: CC0
- 98 sprites: flames, fire, magic, circles, stars, sparks, smoke, light, twirls, etc.

## Arena ground textures (`textures/ground/*/*.png`)

**These 16 PNGs are OUR OWN WORK — no third-party asset, no attribution
required, no upstream licence to honour.** They are the four arena floor PBR
sets (`stone`, `dirt`, `grass`, `sand` — albedo + normal + ORM + macro each),
computed from scratch by `apps/client/scripts/gen-ground.ts` and the painters in
`apps/client/scripts/texgen/`. **No image file of any kind is read as input**:
nothing is scanned, photographed, downloaded or model-generated — every texel is
a seeded integer hash, so `pnpm tsx apps/client/scripts/gen-ground.ts`
reproduces them byte-for-byte. Same standing as the `tools/bgm-gen` soundtrack
and the `gen-cursors.ts` cursor art.

CC0 PBR sets from **ambientCG** or **Poly Haven** were the obvious alternative
and would have been perfectly usable (both are genuinely CC0). They were not
taken for an art reason rather than a legal one: a downloaded ground set is a
single seamless tile, and one tile repeated ~12× across a 48-unit arena is
precisely the visible lattice task #80 exists to kill. Generating the sets is
what makes the non-repeating macro layer possible. Nothing in this section
creates an obligation — it is provenance, not attribution.

## Background music (`bgm/`)

**All eleven BGM tracks are OUR OWN WORK. No attribution is required for any of
them, and no third-party terms apply to the music.** They are synthesised from
scratch in this repo by `tools/bgm-gen` — a deterministic score→audio pipeline
that computes every waveform from numpy arrays (a formant-synthesised SATB
choir, supersaw, Karplus–Strong pluck, additive struck piano, membrane-mode
taiko, noise-based kit and FX) and mixes/encodes with ffmpeg. **No audio file of
any kind is read as input**: nothing is sampled, nothing is downloaded, and
nothing is model-generated, so no licence attaches. `bgm/MANIFEST.json` is the
live record — every entry now has `"source": "bgm-gen"` and
`generator.stillThirdParty` is empty.

> ### ✅ STATUS: APPROVED — the self-made pack is the live BGM (tasks #52, #91)
>
> The pack ships. Audition it at
> **`http://localhost:39527/bgm-audition.html`** (client dev server; the page is
> `apps/client/public/bgm-audition.html`, regenerate with
> `python3 tools/bgm-gen/src/audition.py`).
>
> **`content/config/audio-map.json` needs no edit.** Its 11
> `bgm` keys already point at `assets/audio/bgm/<scene>.mp3` — which is exactly
> where `render.py` writes. There is no path swap left to perform.
>
> **The old third-party files are gone.** Because the render target is the same
> path they occupied, rendering **overwrote them in place**, and this repo has no
> VCS history to restore from.
>
> **Follow-ons — done (task #91):**
> 1. The mandatory BGM credit line has been **removed** from this file (see below).
> 2. **Task #13's obligation shrank**: the BGM no longer has to be surfaced on the
>    in-game credits/settings screen. The **CC-BY 4.0 dragon
>    model still must be** — that requirement is untouched.

### What this replaced, and why the difference matters

The previous pack was **魔王魂 (Maoudamashii)** by **森田交一 (Koichi Morita)**,
used under the Maoudamashii Terms of Use (https://maou.audio/rule/). That licence
is generous — free for commercial games, modification and looping permitted, no
prior notification — but it is **not** CC0 and it is **not** attribution-free:

| | 魔王魂 (previous) | `tools/bgm-gen` (this pack) |
|---|---|---|
| Attribution | **MANDATORY** — 「音楽：魔王魂」 had to be displayed in-game | **None required** |
| Copyright | 森田交一 (Koichi Morita) | This repo |
| AI training | **Forbidden** by its terms | Unrestricted — it is ours |
| Redistribution as music | **Forbidden** (streaming platforms, NFTs) | Unrestricted |
| Reproducible | No — opaque MP3s | Yes — byte-for-byte from a seed |

> **CREDIT LINE — REMOVED (task #91).** No 魔王魂 music ships any more, so the
> mandatory in-game credit it used to require — 「音楽：魔王魂 (https://maou.audio/)」 —
> is no longer a licence requirement and has been struck from every surface: this
> file, the client credits page (`apps/client/src/ui/platform/creditsData.ts`) and
> the login footer (`HomeFooter.tsx`). It is recorded here only as what was removed,
> not as a live obligation.

### The eleven tracks

One shared identity across the whole pack: key family **D minor / F major**
(the tonic pitch class never moves, so any track can follow any other), BPM
family **67.5 / 90 / 135 / 180** (all rational multiples of 90 and all
sample-aligned at 44.1 kHz), one loop **grid** (**1 881 600 samples = 42.667 s**
— every looping track is that length or an integer multiple of it, so all of
them are a whole number of bars in every tempo of the family; `menu`, `combat`
and `intermission` run at 2× = 85.333 s) and one lead hook that every track
either states, quotes or alludes to.

Loop tracks are seamless self-joins (the 0.3 s following the cut-end is
crossfaded onto the head); stings fade to silence. All are MP3 128 kbps /
44.1 kHz / stereo, loudness-normalised to ≈ −16 LUFS with a two-pass linear
`loudnorm`.

Re-render any track byte-for-byte — the `seed` is the only randomness:

```sh
python3 tools/bgm-gen/src/render.py menu     # -> content/assets/audio/bgm/menu.mp3
python3 tools/bgm-gen/src/render.py --all    # the whole pack
python3 tools/bgm-gen/src/manifest.py        # refresh MANIFEST.json
python3 tools/bgm-gen/src/audition.py        # refresh the audition page
python3 tools/bgm-gen/probe/track_check.py   # pack gates
```

- **戰旗 / Banner of the Fallen (main theme)** — GGD / `tools/bgm-gen` — own work, no attribution — `tools/bgm-gen/scores/menu.py` — Dm, 90.0 bpm, 32 bars (2× the loop grid, 85.333 s), loop, seed 5201 (`menu.mp3`)
  <br>↳ replaced 魔王魂 オーケストラ25 (Orchestra 25) — https://maou.audio/bgm_orchestra25/
- **灯火 / Hearthlight** — GGD / `tools/bgm-gen` — own work, no attribution — `tools/bgm-gen/scores/lobby.py` — Dm, 90.0 bpm, 16 bars, loop, seed 3307 (`lobby.mp3`)
  <br>↳ replaced 魔王魂 ファンタジー14「やすらぎの丘」 — https://maou.audio/bgm_fantasy14/
- **控室 / The Antechamber** — GGD / `tools/bgm-gen` — own work, no attribution — `tools/bgm-gen/scores/room.py` — Dm, 90.0 bpm, 16 bars, loop, seed 2213 (`room.mp3`)
  <br>↳ replaced 魔王魂 ファンタジー10「ひとときの休息」 — https://maou.audio/bgm_fantasy10/
- **選抜 / The Choosing (draft)** — GGD / `tools/bgm-gen` — own work, no attribution — `tools/bgm-gen/scores/champSelect.py` — Dm, 135.0 bpm, 24 bars, loop, seed 5204 (`champSelect.mp3`)
  <br>↳ replaced 魔王魂 ファンタジー06「新世界へ」 — https://maou.audio/bgm_fantasy06/
- **合間 / Between the Bells** — GGD / `tools/bgm-gen` — own work, no attribution — `tools/bgm-gen/scores/intermission.py` — Dm, 90.0 bpm, 16 bars, loop, seed 4409 (`intermission.mp3`)
  <br>↳ replaced 魔王魂 オーケストラ20 (Orchestra 20) — https://maou.audio/bgm_orchestra20/
- **戦域 II / Contested Ground — The Turn (battle)** — GGD / `tools/bgm-gen` — own work, no attribution — `tools/bgm-gen/scores/combat.py` — Dm, 135.0 bpm, 48 bars, loop, seed 5206 (`combat.mp3`)
  <br>↳ replaced 魔王魂 オーケストラ24 (Orchestra 24) — https://maou.audio/bgm_orchestra24/
- **開陣 / The Gate Opens (battle start)** — GGD / `tools/bgm-gen` — own work, no attribution — `tools/bgm-gen/scores/battleStart.py` — Dm, 135.0 bpm, 3 bars, sting, seed 5207 (`battleStart.mp3`)
  <br>↳ replaced 魔王魂 ゲームジングル04 (Game Jingle 04) — https://maou.audio/game_jingle04/
- **凱歌 / Raise the Banner (victory)** — GGD / `tools/bgm-gen` — own work, no attribution — `tools/bgm-gen/scores/victory.py` — Dm, 90.0 bpm, 5 bars, sting, seed 5211 (`victory.mp3`)
  <br>↳ replaced 魔王魂 ゲームジングル01「勝利」 — https://maou.audio/game_jingle01/
- **灰燼 / Ash (defeat)** — GGD / `tools/bgm-gen` — own work, no attribution — `tools/bgm-gen/scores/defeat.py` — Dm, 67.5 bpm, 3 bars, sting, seed 5213 (`defeat.mp3`)
  <br>↳ replaced 魔王魂 ゲームジングル08「全滅」 — https://maou.audio/game_jingle08/
- **餘燼 / What the Battle Left (settlement)** — GGD / `tools/bgm-gen` — own work, no attribution — `tools/bgm-gen/scores/settlement.py` — Dm, 67.5 bpm, 12 bars, loop, seed 5217 (`settlement.mp3`)
  <br>↳ replaced 魔王魂 オーケストラ26 (Orchestra 26) — https://maou.audio/bgm_orchestra26/
- **火環 / Ring of Fire (arena hazard)** — GGD / `tools/bgm-gen` — own work, no attribution — `tools/bgm-gen/scores/fireRing.py` — Dm, 135.0 bpm, 24 bars, loop, seed 5211 (`fireRing.mp3`)
  <br>↳ replaced 魔王魂 オーケストラ21 (Orchestra 21) — https://maou.audio/bgm_orchestra21/

**Choir provenance — no TTS, no third-party audio.** The SATB choir is FORMANT
SYNTHESIS (`tools/bgm-gen/src/ggd/choir.py`): vowels are built from filtered
glottal pulses, not from recordings. A TTS-sampling route (macOS `say`) was
built and measured as a comparison reference only — it was **rejected** and
**nothing derived from it is in any shipped file**. The pack therefore has no
TTS dependency at render time and no licence question at all;
`tools/bgm-gen/probe/tts_route.py` reproduces the measurements behind that call.


## Login / UI sound effects (`sfx/dragon-roar*.mp3`, `sfx/ui-*.mp3`)

Five short SFX for the login screen (task #20): two boss-dragon roars (near/far)
plus button-press, hover/focus, and keystroke ticks. **All CC0 (public domain) —
no attribution legally required**; recorded here for provenance. Bound in
`content/config/audio-map.json` as the `dragonRoar` (2-clip pool), `uiClick`,
`uiHover`, and `uiType` sfx events. Sources download without any login.

The three UI ticks are re-encoded to **mono 44.1 kHz MP3**, edge-silence trimmed,
and **peak-normalised only** (no dynamics change — relative loudness is set by
the per-event `gain` in `audio-map.json`, not by re-rendering). The three dragon
roars are **multi-layer composites** of CC0 sources (recipes below); the result
is still CC0.

> **Roar voicing — how the three files got their character (three rejected passes).**
> Pass 1 layered only the low-frequency "deep monster roar" sources: <200 Hz was
> the loudest band and >800 Hz sat ~20 dB down, so it read as a flatulent sub-bass
> rumble (user: 「低音放屁聲」). Pass 2 overcorrected into a raptor screech with
> 1–3 kHz emphasised — measurably bright, and the user rejected it as
> 「太吵了 / 高亢尖銳」. Pass 3 landed the **Godzilla** voicing the user wanted —
> 沉穩 (composed, weighty, steady): a resin-coated glove dragged down a double-bass
> string and slowed, i.e. a brassy resonant sustained bellow living in the
> **midrange**, reading as enormous mass and control rather than pain or
> aggression-screaming. That is the shipped voicing for the **angry** file.
>
> Pass 4 tried to make the two ambients relaxing on request
> (「長吟 可以多一點像鯨魚低鳴的聲音可以讓人放鬆」) by rebuilding them as **whale
> song**: a *synthesised* `aevalsrc` glide tone was made the dominant layer and the
> organic voice was pushed down to 0.30–0.42 behind a 1.8 kHz lowpass. **Rejected** —
> 「龍吟現在又調的太像鬼叫了 / 嚇死人了 / 還是要跟龍吼聽的出來是同一個生物的聲音聲紋吧」.
> Two distinct failures, both worth remembering:
> **(a)** a smooth synthetic harmonic tone with vibrato and a slow pitch glide is
> literally the recipe for a **theremin**, and a theremin reads as *supernatural*.
> What makes a sound animal rather than ghostly is the noise, breath and roughness
> that the synth tone lacks and that the 1.8 kHz brick wall removed from what was
> left. **(b)** because the angry file is built from organic sources while the
> ambients had become mostly synth, the two **no longer shared a timbre** — the pool
> stopped sounding like one creature. Measured after the fact, the whale ambients sat
> **15.9 dB / 14.2 dB** mean-per-band away from the angry file's spectral envelope.
>
> **Shipped principle — ANCHOR AND VARIATIONS.** `dragon-roar-angry.mp3` is the
> **anchor**: the voicing the user accepted, and it is not to be changed. The two
> ambients are the *same voice, calm* — built from the **same organic sources**
> (`evil_screech_1.ogg` bursts + `monster_roar.wav` body) through the **same formant
> chain**, with the organic layer **dominant** (1.00) and its natural rasp/breath
> left intact. Calm-versus-enraged is expressed only through **energy, length,
> attack and level**, never through a different instrument. There is **no
> synthesised tone in any shipped file**. Result: **3.5 dB / 2.7 dB** mean-per-band
> from the anchor, versus 15.9 / 14.2 for the rejected whale pass.
>
> Common to all three: the organic voice is pitched down hard (`asetrate` ×0.26–0.30,
> ~1.7–2 octaves, so the screech source's energy lands in **300–900 Hz** as a brassy
> wail, not a cry), shaped by three resonant **formant peaks at 250 / 450 / 800 Hz**
> (a huge resonating throat), with everything above ~3 kHz shelved away because that
> top shimmer is what read as 尖銳. A real low body sits underneath for mass but is
> kept below the midrange.
>
> What the ambients keep from the whale attempt — the parts that were right, now
> delivered organically: **(1) a gentle glide** — no synth needed, the recorded
> screech has its own natural descending portamento; the slice is chosen to skip the
> steep initial fall, leaving ~7–11 % of movement (the whale pass's 17–20 % sweep was
> itself a large part of the ghost impression). **(2) no attack** — a stretched
> exponential swell reaches 90 % of peak only after ~0.9–1.1 s, so nothing reads as
> an onset. **(3) shallow, slow vibrato** — 3–3.2 Hz at depth 0.10–0.12.
> **(4) a long, diffuse tail** — `aecho` plus a modest convolution-reverb send
> (`afir` fed a synthesised 1.8 s decaying dark pink-noise IR); shorter and drier
> than the whale pass's cathedral wash, which was itself part of the eeriness.
> **(5) sitting back** — both ambients are baked ~4 dB quieter (peak ≈ −4 dBFS) since
> they are background atmosphere, not events.

Shared **formant chain** — now **identical in all three files** (this is what makes
it one throat rather than three filter sweeps, and it is the main reason the
voiceprint match is tight):
`equalizer f=250 q=1.1 g=+7, equalizer f=450 q=1.1 g=+6, equalizer f=800 q=1.2 g=+4, treble f=3000 g=−11, lowpass=3500`

| file | source clip | author | license | verified-on | processing |
| --- | --- | --- | --- | --- | --- |
| `dragon-roar.mp3` | voice (dominant): `evil_screech_1.ogg`, burst 2 slice **2.23–2.90 s** | **Nocturnal_Vanguard** (AuraVoice) | **CC0** | https://opengameart.org/content/evil-screech-1 | ambient LONG CRY 長吟 — the anchor's voice, calm. 5.90 s, mono, peak −4.09 dB, RMS −16.6 dB. `asetrate*0.27` (the anchor's own pitch region) + `vibrato=f=3:d=0.12` + `highpass=140` + **the shared formant chain**, natural rasp/breath **kept** (no 1.8 kHz brick wall), `afade in d=1.20 curve=exp` at gain **1.00**. The slice starts 0.30 s into the burst to skip the steep initial fall, leaving the creature's own gentle descending portamento. Measured: attack-to-90 % **1.09 s**, glide **7.0 %** (262→281→262 Hz), **voiceprint r = +0.985, mean\|Δ\| = 3.5 dB** vs the anchor. Bands: full −16.6 / low<150 −25.5 / **mid150-1200 −17.3** / high>2500 −47.4 |
| ″ (body + sub of `dragon-roar.mp3`) | `monster_roar.wav` — "CC0 Deep Monster Roar" | **trazzz123** | **CC0** | https://opengameart.org/content/cc0-deep-monster-roar | **the anchor's own body treatment**: `asetrate*0.86` + `highpass=145` + shared formant chain at 0.55, sub `lowpass=150` at 0.16, both slow-swelled (`afade in d≈1.1 curve=exp`) |
| `dragon-roar2.mp3` | voice (dominant): `evil_screech_1.ogg`, burst 4 slice **6.02–6.51 s** | **Nocturnal_Vanguard** (AuraVoice) | **CC0** | https://opengameart.org/content/evil-screech-1 | ambient VARIANT — same voice, shorter and a little higher so the 2-clip pool never repeats. 4.30 s, mono, peak −4.05 dB, RMS −16.3 dB. `asetrate*0.30` (**exactly the anchor's Voice-B rate**) + `vibrato=f=3.2:d=0.10` + `highpass=140` + shared formant chain, `afade in d=0.95 curve=exp` at gain **1.00**. Measured: attack-to-90 % **0.87 s**, glide **11.1 %** (267→296→267 Hz), **voiceprint r = +0.985, mean\|Δ\| = 2.7 dB** vs the anchor. Bands: full −16.3 / low<150 −25.3 / **mid150-1200 −17.0** / high>2500 −45.9 |
| ″ (body + sub of `dragon-roar2.mp3`) | `monster_roar.wav` (same source as the anchor) | **trazzz123** | **CC0** | https://opengameart.org/content/cc0-deep-monster-roar | `asetrate*0.92` + `highpass=145` + shared formant chain at 0.55, sub 0.16. **`roar_04.ogg` (rubberduck) was dropped here** — a different growl source measurably broke the voiceprint match with the anchor; variety now comes from burst/pitch/length instead |
| ″ (bus + reverb send, both ambients) | synthesised IR (`anoisesrc` pink, 1.8 s exponential decay, `lowpass=2600`) | — (own work) | **CC0** | (generated) | `aecho=0.75:0.45:400\|850` (roar 1) / `360\|760` (roar 2) plus a modest `afir` wet-only send (`gtype=0:irgain=1`, wet ×0.8 / ×0.75), then `lowpass=3600` and the anchor-style gentle `acompressor threshold=0.09:ratio=4:attack=40:release=350:makeup=4` + `alimiter=0.62` — the compressor is what lets them sit ~8 dB below the anchor in peak yet stay present. `afir` outputs wet only here, so dry and wet are summed explicitly |
| `dragon-roar-angry.mp3` | voice layers: `evil_screech_1.ogg` bursts 3 (3.86–4.75 s) and 1 (0.42–1.13 s) | **Nocturnal_Vanguard** (AuraVoice) | **CC0** | https://opengameart.org/content/evil-screech-1 | the ACTION bellow for the click/enter swoop (`dragonRoarBig`) — **bigger, longer and more low-mid forceful, NOT shriller**. 4.40 s, stereo (11 ms Haas widen), peak −0.82 dB, RMS −8.70 dB. Voice A `asetrate*0.26` + `vibrato=f=4:d=0.2` at t=140 ms; Voice B `asetrate*0.30` + `vibrato=f=5:d=0.16` swells in late at t=1.25 s so the bellow *grows* instead of stabbing; both `highpass=140` + formant chain + `afade curve=exp`. Bands: full −8.7 / low<150 −17.8 / **mid150-1200 −9.3** / high>2500 −39.1 |
| ″ (body + bus of `dragon-roar-angry.mp3`) | growl body `monster_roar.wav` | **trazzz123** | **CC0** | https://opengameart.org/content/cc0-deep-monster-roar | body `asetrate*0.86` + `highpass=145` + formant chain at 0.85 (much more body than the ambients — this is where the force comes from), sub `lowpass=150` at 0.26. Bus: `aecho=0.75:0.4:300\|620`, **gentle** `acompressor threshold=0.16:ratio=5:attack=25:release=250:makeup=3`, `lowpass=3600`, `volume=2.9`, `alimiter=0.9`. Loudness comes from level and low-mid density — the earlier `asoftclip=atan` saturation and hard limiting were **removed** because that fizz was a large part of the 吵 complaint |
| `ui-click.mp3` | `click1.wav`, Kenney **UI Audio** pack | **Kenney** (kenney.nl) | **CC0** | https://kenney.nl/assets/ui-audio (mirror https://github.com/Calinou/kenney-ui-audio) | mono, peak −1.5 dB |
| `ui-hover.mp3` | `rollover1.wav`, Kenney **UI Audio** pack | **Kenney** (kenney.nl) | **CC0** | https://kenney.nl/assets/ui-audio (mirror https://github.com/Calinou/kenney-ui-audio) | mono, peak −1.5 dB |
| `ui-type.mp3` | `tick_001.wav`, Kenney **Interface Sounds** pack | **Kenney** (kenney.nl) | **CC0** | https://kenney.nl/assets/interface-sounds (mirror https://github.com/Calinou/kenney-interface-sounds) | mono, subtle keystroke tick |

- **OpenGameArt roars** — direct file downloads from opengameart.org (no login);
  each page's license field reads "CC0" (Public Domain). `monster_roar.wav` by
  trazzz123 ("made this sound to be used for a giant sandworm or another
  monster") is now the growl **body of all three** roars — deliberately, since a
  shared body source is part of what keeps the voiceprints matched. rubberduck's
  `roar_04.ogg` (body of the old `dragon-roar2.mp3`) and `scream_01/02.ogg` (the
  rejected screech pass) are **no longer part of any shipped file**.
- **`evil_screech_1.ogg`** — the **voice of all three roars**, dominant in every
  one of them. Author **Nocturnal_Vanguard** (voice-over artist "AuraVoice"), CC0,
  tagged *evil / screech / yell / shout*. It is a recorded human screech; the name
  is misleading for how it is used here — dropped ~2 octaves (`asetrate`
  ×0.26–0.30) its rasp slows into a brassy, resonant midrange bellow with no cry
  character left, which is precisely the slowed-recording trick behind the Godzilla
  voice. The 7.57 s file holds four separate bursts (0.42–1.13, 1.93–2.90,
  3.86–4.75, 5.65–6.51 s); each roar takes a different burst — and the ambients
  start their slice ~0.3 s in, which both removes the aggressive onset and leaves
  the natural falling portamento that supplies their glide. Keeping this one
  recorded voice in front in every file is what makes the pool one creature.
- **Synthesised material is not third-party** — and there is now **no synthesised
  voice in any shipped file** (the `aevalsrc` whale tone was removed with pass 4).
  The only generated audio left is the reverb impulse response (`anoisesrc` pink
  noise with an exponential decay), which contains no sampled audio, is own work,
  and carries no attribution obligation. It is documented only so the files can be
  regenerated exactly.
- **Objective gate (all three roars must keep passing it).** These cannot be
  judged by ear in CI, so regeneration is checked by splitting each file into
  **<150 Hz / 150–1200 Hz / >2500 Hz** and running `volumedetect` on each band:
  (1) **150–1200 Hz must be the loudest band** — the voice lives there;
  (2) **>2500 Hz must sit ≥12 dB below the full-mix mean** — this is the
  anti-shrillness condition (currently 30–33 dB below on all three);
  (3) **<150 Hz present but below the midrange band** — the anti-rumble
  condition; (4) true peak ≤ −0.3 dBFS. Conditions 1–3 together pin the sound
  between the rejected failure modes, so a future re-render cannot drift back
  into either sub-bass rumble or shrill screech.
- **Three extra conditions for the two ambients** (`dragon-roar.mp3`,
  `dragon-roar2.mp3`; the angry file is the anchor and is exempt from 5–6, it is
  meant to hit hard):
  (5) **attack ≥ 400 ms** — time from clip start until the 10 ms envelope first
  reaches 90 % of peak, so nothing reads as a transient (currently **1.09 s** and
  **0.87 s**); (6) **glide ≈ 5–12 %** — the per-window dominant frequency should
  trace a gentle rise/fall (currently **7.0 %** and **11.1 %**). Note this is a
  *band*, not a floor: the rejected whale pass ran 17–20 % and that eerie sweep was
  a large part of why it read as 鬼叫, while a dead-flat pitch reads mechanical.
  Both are measured by `glide.py` (pure-stdlib: 10 ms envelope for the attack,
  autocorrelation with octave correction and parabolic interpolation for the
  per-window pitch, windows selected relative to the loudest window).
- **(7) VOICEPRINT MATCH — the ambients must sound like the anchor.** This is the
  condition the user actually asked for (「還是要跟龍吼聽的出來是同一個生物的聲音
  聲紋吧」). `ltas.py` computes a long-term average spectrum in **21 third-octave
  bands (63 Hz–6.3 kHz)**, normalises each file to its own total energy (so level
  and duration cancel out and only the spectral *envelope* is compared), and scores
  each ambient against `dragon-roar-angry.mp3`:
  **require r ≥ 0.97 and mean\|Δ\| ≤ 5.0 dB per band.**
  Current: `dragon-roar.mp3` **r = +0.985, 3.5 dB**; `dragon-roar2.mp3`
  **r = +0.985, 2.7 dB**. The rejected synth-dominant whale versions scored
  **+0.950 / 15.9 dB** and **+0.938 / 14.2 dB** — note the *correlation* barely
  moved (both shapes have a midrange hump), so **mean\|Δ\| is the discriminating
  metric** and the threshold sits well clear of both populations. Without this
  condition a re-render can satisfy every other gate and still sound like a
  different animal.
- **Kenney UI Audio / Interface Sounds** — Kenney's audio packs are CC0 1.0
  Universal (public-domain dedication); the Calinou GitHub mirrors repackage them
  verbatim under the same CC0 and were used for the direct file fetch.

## Announcer VO pack (`audio/announcer/*.mp3`)

Thirteen arena-announcer broadcast lines (task #34; ja-JP in #40; recast
**trilingual zh/ja/en** in #57) — **machine VO, not a third-party asset and not a
human recording**. Synthesized locally with the macOS built-in TTS (`say`) piped
through ffmpeg/libmp3lame by the repo tool **`tools/tts-gen`**, from the manifest
`content/audio-manifests/announcer.json`. Apple voices **Kyoko** (ja_JP),
**Tingting** (zh_CN), **Karen** (en_AU) and **Sinji** (zh_HK), all at 185 wpm.
Line texts are our own writing — Taiwanese transit-PA, Japanese 丁寧語 and
airport-gate English idiom, not machine translation; the `ally-slain` line is a
deliberate flat restaging of the user's own GoDieEX22s.w3x team-kill quip. No
attribution owed; recorded here for provenance.

- **THE FLAT, EMOTIONLESS DELIVERY IS INTENTIONAL — it is the whole aesthetic.**
  The direction, in the user's own words:

  > 惡搞語音不應該是機械音 而是類似 google 語音那樣字正腔圓講話清楚但不帶感情所以嘲諷

  *("The 惡搞 voice should not be a robot voice — it should be like Google's
  voice: perfectly enunciated, clearly spoken, but emotionless, and THAT is what
  makes it mocking.")* The joke is the LINE, never the VOICE. Every clip is a
  real, standard, full-band system voice reading correct text in a language it
  genuinely speaks. **Do not "fix" this to sound livelier, and do not recast it
  to novelty/character voices** — that was tried and retired; the measurements
  that disqualify the novelty voices (85% spectral rolloff 956–2474 Hz vs
  2174–4921 Hz for real voices, i.e. no energy in the 2–8 kHz band where
  consonants live) are in `content/assets/audio/README.md`.
- **Local/dev placeholder only.** For production, the same manifest is
  regenerated through a real cloud TTS provider via the platform proxy
  `POST /api/v1/ai/tts` (task #23 stub-mode pattern: `501 {"stub":true}` when
  no provider is configured; the admin supplies the provider API key at
  runtime, stored server-side only — never in the repo, never logged).
- Bound in `content/config/audio-map.json` to the **seven SYSTEM events** —
  `matchStart`, `roundStart`, `levelUp`, `death`, `multiKill`, `allySlain` and
  `exUnlock` — and those pools hold **announcer VO exclusively**. The full line
  list, the zh↔spoken pairing table and the per-line language reasoning live in
  `content/audio-manifests/announcer.cast.json`; measurements in
  `content/assets/audio/README.md`.
- **DELIBERATE voice / text split.** A SYSTEM broadcast (no speaker in the
  fiction) is machine VO; a CHARACTER line (a named champion of the user's own
  map speaking) stays Chinese, and **all on-screen text stays Chinese**. The
  map's own Chinese announcer quips were **preserved, not deleted** — parked in
  the opt-in `mapFlavorIntro` / `mapFlavorAnnounce` pools, or rehomed to
  `content/config/champion-voices.json` where they were really character voices
  (`mandie` → 初音, `87joke` → 飛影). Please do not "correct" either half back.
- **Three retired packs are kept, never deleted**, each unbound, with a `NOTE.md`
  and a manifest retargeted into its own archive so a rerun cannot overwrite the
  live clips: `retired-zh/` (#34 — and it was secretly Alex, an American English
  voice, because the zh_TW voice Meijia is advertised by `say -v '?'` but is not
  installed and falls back silently), `retired-ja-kyoko/` (#40, uniform Japanese),
  and `retired-jank-novelty/` (#57 first pass, novelty/singing voices).

## Champion call-out VO pack (`audio/voices/names/*.mp3`)

112 champion champ-select call-outs (task #35; changed to speak **稱號 + 全名** in
#57) — **machine VO, not a third-party asset and not a human recording**, on the
same footing as the announcer pack above. Synthesized locally with the macOS
built-in TTS (`say`, Apple voices **Kyoko** ja_JP / **Tingting** zh_CN / **Karen**
en_AU, 185 wpm) piped through ffmpeg/libmp3lame by the repo tool
**`tools/tts-gen`**, from the manifest
`content/audio-manifests/champ-names.ja-JP.json` — which is itself generated,
along with the canonical mapping doc, by
`tools/tts-gen/src/build-champ-names.mjs`. No attribution owed for the audio;
recorded here for provenance.

- **The names AND titles are third-party CHARACTER NAMES**, not third-party audio
  — the readings of characters the user's own map GoDieEX22s.w3x already casts
  (ピカチュウ, シシオマコト, ヒエイ, スーパーサイヤジン …). They are the same names the
  existing Chinese champion titles already use; the pack only speaks them. Where
  a canonical Japanese original exists it is **restored rather than translated**
  (最終幻想 → ファイナルファンタジー, 火霧戰士 → フレイムヘイズ). Per-champion `evidence`
  for every casting decision lives in
  `content/assets/audio/voices/names/MANIFEST.json`.
- **Same 惡搞 direction and the same user quote as the announcer pack above.** The
  comedy is that a composed broadcast voice treats 「外掛開很大的死神」 as a job
  title. The 稱號 is never dropped — it is the best parody material in the game
  and it is also what makes six pairs of otherwise-identical champions distinct.
  A test pins it.
- **Local/dev placeholder only.** For production, the same manifest is
  regenerated through a real cloud TTS provider via the platform proxy
  `POST /api/v1/ai/tts` (task #23 stub-mode pattern: `501 {"stub":true}` when
  no provider is configured; the admin supplies the provider API key at
  runtime, stored server-side only — never in the repo, never logged).
- NOT bound through `content/config/audio-map.json`: the pack is keyed by
  champion id and carries its own mapping doc. Casting rules, coverage and
  playback notes in `content/assets/audio/README.md`.

## 効果音ラボ / Sound Effect Lab pack (`audio/sfx/lab/`, `audio/voice-jp/`)

40 real recordings (32 SFX + 8 Japanese voice clips) from **効果音ラボ
(Sound Effect Lab)** — https://soundeffect-lab.info/ — downloaded 2026-07-22
(task #51). They fill the gaps the synthesised `sfx/fx/*.wav` set could not:
weapon material, magic elements, explosions, and a whole class of UI/system
moments (denial, purchase, gold, panel open, low health, gongs, settlement
reveal) that previously had **no sound bound at all**.

> **COURTESY CREDIT — attribution is NOT required for this pack.** Unlike the
> CC-BY 4.0 dragon above (and unlike the 魔王魂 BGM this repo used to ship,
> now replaced by our own tracks), 効果音ラボ explicitly waives the
> obligation: 「使用にあたっての報告、リンク、クレジット表記不要（禁止ではなく
> 任意）」 — reporting, linking and credit are *optional, not forbidden*. This
> block therefore belongs with the CC0 art credits, kept for provenance.
>
> **But it is NOT CC0 / public domain.** Copyright is expressly **retained**
> (「素材の著作権は放棄していないため」) by 効果音ラボ; the voice actors assigned
> every right except 著作者人格権 by contract. It is a **permissive licence with
> live prohibitions** (below) — do not merge these rows into the CC0 block or
> treat the files as public domain.
>
> If we do credit (recommended, and the in-game credits screen of task #13 is
> the place), the site specifies the exact strings:
> **`効果音ラボ`** (ja) / **`Sound Effect Lab`** (en).

**Grant, verified on the site's own 利用規約 + FAQ:**

- **Commercial use is free and unconditional** — 「個人、法人、公的機関問わず無料で
  使用可能（商用利用無料）」. Paid vs free product makes no difference
  (「有料か無料かに関係なく、料金発生なし、報告不要、クレジット表記不要」), and
  overseas commercial use is explicitly fine (「海外での商用利用は可能ですか？」→
  「問題ございません」).
- **Shipping the raw audio files exposed — including publishing them on GitHub —
  is NOT redistribution.** 「効果音を利用したゲームやアプリを、音源ファイルむき出し
  で配布・販売して良いですか？」→「問題ございません」, with a *request* (not a
  condition) to obscure the files where technically convenient. This is the
  clause that makes the pack usable in GGD at all.
- **Format conversion is explicitly allowed** — 「WAVやOGGなどどのような形式に変換
  していただいても構いません」 — so the mono/44.1 kHz + trim + normalise + WAV/MP3
  pipeline below is sanctioned, not tolerated.

> **⚠ SOURCE WARNING — download from soundeffect-lab.info ONLY.** Byte-identical
> copies of many of these clips are also published on **ニコニ・コモンズ** under a
> **different, commercially RESTRICTED licence**. Only the soundeffect-lab.info
> copy carries the terms above. If a clip ever has to be replaced, re-download it
> from the `source page` recorded in its row — never from a mirror.

**Prohibitions that actually bite in GGD** (full list in
`audio/sfx/lab/MANIFEST.json` → `licence.prohibitions`):

- **No soundboard / sound-test screen.** 再配布 of the raw files is forbidden;
  embedding them as operation sounds in an app is explicitly *not*
  redistribution. The one build we could plausibly ship that **would** trip the
  clause is an asset-editor "audition every clip" screen with a download button.
  Do not add one for this directory.
- **No AI training** — 「AI学習用のデータとして利用することは禁止」. We therefore
  **cannot** voice-clone the 声素材 actress to synthesise our bespoke lines (the
  白目 taunt). That option is closed; see the hybrid note in
  `audio/README.md`.
- **Nothing that harms the voice actors** — 「声優の尊厳を傷つけたり、声優が被害を
  被る使い方は禁止」. GGD rule: **play her lines whole.** Never re-cut her
  syllables into a sentence she did not record, and never splice her into the
  mocking taunt register.
- **No hotlinking** — the files are self-hosted here; the client must never fetch
  soundeffect-lab.info at runtime.
- No YouTube Content ID or 音商標 registration of anything containing them, and
  no video that showcases the sound effects one by one (a normal gameplay
  trailer is fine).

### Usage ledger — SFX (`audio/sfx/lab/`, 32 clips)

| staged file | source page | original file | source category | GGD binding | processing | dur / size | licence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `ui-denied.wav` | https://soundeffect-lab.info/sound/button/ | `beep1.mp3` ビープ音1 | 演出・システム / ボタン・システム音 | `uiDenied` — authored, awaits emit (#44 shop 無金幣/已擁有) | mono 44.1 kHz, edge-trim, +2.60 dB → 16-bit WAV | 0.41 s / 35 KB | SEL ToU (credit optional) |
| `shop-purchase.wav` | https://soundeffect-lab.info/sound/various/ | `clearing1.mp3` レジスターで精算 | 演出・システム / お金 | `shopPurchase` — authored, awaits emit (#44) | mono 44.1 kHz, edge-trim, +0.00 dB → 16-bit WAV | 0.72 s / 62 KB | SEL ToU (credit optional) |
| `gold-gain.wav` | https://soundeffect-lab.info/sound/various/ | `money-drop1.mp3` お金を落とす1 | 演出・システム / お金 | `goldGain` — authored, awaits emit | mono 44.1 kHz, edge-trim, -1.10 dB, 20 ms fade-out → 16-bit WAV | 1.01 s / 87 KB | SEL ToU (credit optional) |
| `panel-open.wav` | https://soundeffect-lab.info/sound/button/ | `menu4.mp3` メニューを開く4 | 演出・システム / ボタン・システム音 | `panelOpen` — authored, awaits emit (#38 prep-phase shop/skill panel) | mono 44.1 kHz, edge-trim, +1.00 dB → 16-bit WAV | 0.89 s / 77 KB | SEL ToU (credit optional) |
| `ui-cancel.wav` | https://soundeffect-lab.info/sound/button/ | `cancel1.mp3` キャンセル1 | 演出・システム / ボタン・システム音 | `uiCancel` — authored, awaits emit (panel back/close) | mono 44.1 kHz, edge-trim, +2.80 dB → 16-bit WAV | 0.13 s / 11 KB | SEL ToU (credit optional) |
| `ability-rank-up.mp3` | https://soundeffect-lab.info/sound/button/ | `decision10.mp3` 決定ボタンを押す10 | 演出・システム / ボタン・システム音 | `abilityRankUp` — authored, awaits emit (skill point spend) | mono 44.1 kHz, edge-trim, -2.10 dB → MP3 192k | 1.96 s / 47 KB | SEL ToU (credit optional) |
| `low-health.wav` | https://soundeffect-lab.info/sound/button/ | `warning1.mp3` 警告音1 | 演出・システム / ボタン・システム音 | `lowHealth` — authored, awaits emit (HUD HP threshold) | mono 44.1 kHz, edge-trim, +5.90 dB → 16-bit WAV | 1.31 s / 113 KB | SEL ToU (credit optional) |
| `settlement-reveal.mp3` | https://soundeffect-lab.info/sound/button/ | `data-display3.mp3` データ表示3 | 演出・システム / ボタン・システム音 | `settlementReveal` — authored, awaits emit (#25/#36 ranking row reveal) | mono 44.1 kHz, edge-trim, +2.40 dB → MP3 192k | 2.96 s / 71 KB | SEL ToU (credit optional) |
| `match-start-gong.wav` | https://soundeffect-lab.info/sound/anime/ | `gong-played1.mp3` 試合開始のゴング | 演出・アニメ / 対戦演出 | `matchStartGong` — authored, awaits emit. **NOT** in `matchStart`: that pool is announcer-VO-only (#40) | mono 44.1 kHz, edge-trim, +1.30 dB → 16-bit WAV | 1.71 s / 148 KB | SEL ToU (credit optional) |
| `match-end-gong.mp3` | https://soundeffect-lab.info/sound/anime/ | `gong-played2.mp3` 試合終了のゴング | 演出・アニメ / 対戦演出 | `matchEndGong` — authored, awaits emit (match over → settlement) | mono 44.1 kHz, edge-trim, +2.00 dB → MP3 192k | 2.57 s / 62 KB | SEL ToU (credit optional) |
| `vs-reveal.mp3` | https://soundeffect-lab.info/sound/anime/ | `match-card1.mp3` 対戦カード表示1 | 演出・アニメ / 対戦演出 | `vsReveal` — authored, awaits emit (champ-select 對戰卡) | mono 44.1 kHz, edge-trim, +2.00 dB, 20 ms fade-out → MP3 192k | 2.34 s / 56 KB | SEL ToU (credit optional) |
| `level-up-jingle.mp3` | https://soundeffect-lab.info/sound/anime/ | `levelup1.mp3` レベルアップ | 演出・アニメ | `levelUpJingle` — authored, awaits emit. **NOT** in `levelUp`: announcer-VO-only (#40) | mono 44.1 kHz, edge-trim, +0.30 dB → MP3 192k | 1.92 s / 47 KB | SEL ToU (credit optional) |
| `attack-sword-1.wav` | https://soundeffect-lab.info/sound/battle/ | `sword-slash1.mp3` 剣で斬る1 | 戦闘 / 剣・斬撃 | staged, not bound — `basicAttack` is weapon-agnostic today | mono 44.1 kHz, edge-trim, +1.50 dB → 16-bit WAV | 0.75 s / 65 KB | SEL ToU (credit optional) |
| `attack-sword-2.wav` | https://soundeffect-lab.info/sound/battle/ | `sword-slash2.mp3` 剣で斬る2 | 戦闘 / 剣・斬撃 | staged, not bound — `basicAttack` is weapon-agnostic today | mono 44.1 kHz, edge-trim, +1.60 dB → 16-bit WAV | 0.56 s / 49 KB | SEL ToU (credit optional) |
| `attack-greatsword.wav` | https://soundeffect-lab.info/sound/battle/ | `large-sword-slash1.mp3` 大剣で斬る | 戦闘 / 剣・斬撃 | staged, not bound — `basicAttack`; also 1.70 s vs a 90 ms cooldown | mono 44.1 kHz, edge-trim, +2.30 dB → 16-bit WAV | 1.70 s / 147 KB | SEL ToU (credit optional) |
| `attack-katana.wav` | https://soundeffect-lab.info/sound/battle/ | `katana-slash1.mp3` 刀で斬る1 | 戦闘 / 剣・斬撃 | staged, not bound — `basicAttack`; also +7.4 dB vs the pool anchor | mono 44.1 kHz, edge-trim, +0.90 dB → 16-bit WAV | 0.80 s / 69 KB | SEL ToU (credit optional) |
| `whiff-sword.wav` | https://soundeffect-lab.info/sound/battle/ | `sword-gesture2.mp3` 剣の素振り2 | 戦闘 / 剣・斬撃 | **`whiff`** (bound — replaced `fx/whiff.wav`) | mono 44.1 kHz, edge-trim, +1.10 dB → 16-bit WAV | 0.48 s / 41 KB | SEL ToU (credit optional) |
| `block-clash.wav` | https://soundeffect-lab.info/sound/battle/ | `sword-clash2.mp3` 剣で打ち合う2 | 戦闘 / 剣・斬撃 | **`block`** (bound — replaced `fx/guard.wav`) | mono 44.1 kHz, edge-trim, -0.10 dB → 16-bit WAV | 0.73 s / 63 KB | SEL ToU (credit optional) |
| `block-shield.wav` | https://soundeffect-lab.info/sound/battle/ | `shield1.mp3` 盾で防御 | 戦闘 / 防御 | **`block`** (bound — replaced `fx/guard.wav`) | mono 44.1 kHz, edge-trim, +1.30 dB → 16-bit WAV | 0.60 s / 51 KB | SEL ToU (credit optional) |
| `bow-draw.wav` | https://soundeffect-lab.info/sound/battle/ | `bow-draw1.mp3` 弓を引き絞る1 | 戦闘 / 弓矢 | staged, not bound — bow-only; −6.1 dB vs `fx/windup.wav` | mono 44.1 kHz, edge-trim, +4.90 dB, 20 ms fade-out → 16-bit WAV | 0.98 s / 85 KB | SEL ToU (credit optional) |
| `arrow-release.wav` | https://soundeffect-lab.info/sound/battle/ | `arrow-release1.mp3` 弓矢を放つ | 戦闘 / 弓矢 | staged, not bound — bow-only; `projectileSpawn` fires for every projectile | mono 44.1 kHz, edge-trim, +0.00 dB → 16-bit WAV | 0.51 s / 44 KB | SEL ToU (credit optional) |
| `arrow-pierce.wav` | https://soundeffect-lab.info/sound/battle/ | `arrow-pierce1.mp3` 弓矢が刺さる | 戦闘 / 弓矢 | staged, not bound — arrow-only; `projectileHit` fires for magic bolts too | mono 44.1 kHz, edge-trim, +2.20 dB → 16-bit WAV | 0.34 s / 30 KB | SEL ToU (credit optional) |
| `gunshot.wav` | https://soundeffect-lab.info/sound/battle/battle2.html | `handgun-firing1.mp3` 拳銃を撃つ | 戦闘 / 戦争・銃 | staged, not bound — gun-only; same reason | mono 44.1 kHz, edge-trim, -0.60 dB → 16-bit WAV | 1.37 s / 118 KB | SEL ToU (credit optional) |
| `impact-heavy.wav` | https://soundeffect-lab.info/sound/battle/ | `punch-heavy1.mp3` 重いパンチ1 | 戦闘 / 格闘 | staged, not bound — would fight `fx/crit.wav`'s rising-sting legibility | mono 44.1 kHz, edge-trim, +1.60 dB → 16-bit WAV | 0.55 s / 47 KB | SEL ToU (credit optional) |
| `cast-circle.mp3` | https://soundeffect-lab.info/sound/battle/ | `magic-circle1.mp3` 魔法陣を展開 | 戦闘 / 魔法 | staged, not bound — 3.50 s against `castBegin`'s 120 ms cooldown | mono 44.1 kHz, edge-trim, +1.90 dB → MP3 192k | 3.50 s / 83 KB | SEL ToU (credit optional) |
| `magic-fire.wav` | https://soundeffect-lab.info/sound/battle/ | `magic-flame1.mp3` 火炎魔法1 | 戦闘 / 魔法 | staged, not bound — needs per-ability routing (`abilityCast` is one global event) | mono 44.1 kHz, edge-trim, -5.60 dB → 16-bit WAV | 0.74 s / 64 KB | SEL ToU (credit optional) |
| `magic-ice.mp3` | https://soundeffect-lab.info/sound/battle/ | `magic-ice1.mp3` 氷魔法1 | 戦闘 / 魔法 | staged, not bound — needs per-ability routing | mono 44.1 kHz, edge-trim, -0.10 dB → MP3 192k | 2.16 s / 52 KB | SEL ToU (credit optional) |
| `magic-lightning.wav` | https://soundeffect-lab.info/sound/battle/ | `magic-electron2.mp3` 雷魔法2 | 戦闘 / 魔法 | staged, not bound — needs per-ability routing | mono 44.1 kHz, edge-trim, -1.60 dB → 16-bit WAV | 1.46 s / 126 KB | SEL ToU (credit optional) |
| `magic-holy.mp3` | https://soundeffect-lab.info/sound/battle/ | `magic-attack-holy1.mp3` 聖魔法 | 戦闘 / 魔法 | `exUnlockSting` — authored, awaits emit. **NOT** in `exUnlock`: announcer-VO-only (#40) | mono 44.1 kHz, edge-trim, +1.90 dB → MP3 192k | 3.72 s / 89 KB | SEL ToU (credit optional) |
| `magic-heal.mp3` | https://soundeffect-lab.info/sound/battle/ | `magic-cure2.mp3` 回復魔法2 | 戦闘 / 魔法 | `heal` — authored, awaits emit | mono 44.1 kHz, edge-trim, +2.20 dB → MP3 192k | 2.35 s / 56 KB | SEL ToU (credit optional) |
| `magic-buff.mp3` | https://soundeffect-lab.info/sound/battle/ | `magic-statusup1.mp3` ステータス上昇魔法1 | 戦闘 / 魔法 | `buffApply` — authored, awaits emit | mono 44.1 kHz, edge-trim, -0.20 dB → MP3 192k | 1.98 s / 48 KB | SEL ToU (credit optional) |
| `explosion.mp3` | https://soundeffect-lab.info/sound/battle/battle2.html | `bomb2.mp3` 爆発2 | 戦闘 / 戦争・銃 | `explosion` — authored, awaits emit (#39 VFX pairing) | mono 44.1 kHz, edge-trim, +2.30 dB → MP3 192k | 2.52 s / 61 KB | SEL ToU (credit optional) |

### Usage ledger — 声素材 voice (`audio/voice-jp/`, 8 clips)

All eight are the same actress, **「落ち着いた女性」 (`info-lady1`)** — real human
ja-JP VO, normalised to the announcer band (mean −15 dB, −1.5 dB peak ceiling) so
they can drop into an announcer pool without a level seam. The pack sits at
`voice-jp/` rather than under `voices/` because `audio/voices/**` and
`audio/announcer/**` belong to task #40; both manifests record the adjacency so
nobody "tidies" it later.

| staged file | source page | original file | source category | GGD binding | processing | dur / size | licence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `level-up.mp3` | https://soundeffect-lab.info/sound/voice/info-lady1.html | `info-lady1-levelup1.mp3` 「レベルアップ」 | 声素材 / 落ち着いた女性 (info-lady1) | staged, not bound — `levelUp` is announcer-VO-only (#40); whole-pool swap required | mono 44.1 kHz, edge-trim, +8.00 dB → MP3 192k | 0.90 s / 23 KB | SEL ToU (credit optional) |
| `prep-phase-start.mp3` | https://soundeffect-lab.info/sound/voice/info-lady1.html | `info-lady1-zyunbihaiidesuka1.mp3` 「準備はいいですか？」 | 声素材 / 落ち着いた女性 (info-lady1) | staged, not bound — no `prepPhaseStart` event until #38 lands | mono 44.1 kHz, edge-trim, +8.90 dB → MP3 192k | 1.15 s / 29 KB | SEL ToU (credit optional) |
| `countdown.mp3` | https://soundeffect-lab.info/sound/voice/info-lady1.html | `info-lady1-countdown1.mp3` 「3、2、1、0」 | 声素材 / 落ち着いた女性 (info-lady1) | staged, not bound — one 3.37 s 「3、2、1、0」 clip cannot drive per-second `countTick` | mono 44.1 kHz, edge-trim, +8.10 dB → MP3 192k | 3.37 s / 80 KB | SEL ToU (credit optional) |
| `matchmaking-wait.mp3` | https://soundeffect-lab.info/sound/voice/info-lady1.html | `info-lady1-shibarakuomachi1.mp3` 「しばらくお待ちください」 | 声素材 / 落ち着いた女性 (info-lady1) | staged, not bound — no matchmaking-wait event exists | mono 44.1 kHz, edge-trim, +8.30 dB, 20 ms fade-out → MP3 192k | 1.42 s / 35 KB | SEL ToU (credit optional) |
| `settlement-victory.mp3` | https://soundeffect-lab.info/sound/voice/info-lady1.html | `info-lady1-omedetougozaimasu1.mp3` 「おめでとうございます」 | 声素材 / 落ち着いた女性 (info-lady1) | staged, not bound — no settlement VO event; #40 owns the system voice | mono 44.1 kHz, edge-trim, +9.20 dB → MP3 192k | 1.21 s / 30 KB | SEL ToU (credit optional) |
| `settlement-defeat.mp3` | https://soundeffect-lab.info/sound/voice/info-lady1.html | `info-lady1-zannendeshita1.mp3` 「残念でした」 | 声素材 / 落ち着いた女性 (info-lady1) | staged, not bound — same | mono 44.1 kHz, edge-trim, +6.60 dB → MP3 192k | 0.99 s / 25 KB | SEL ToU (credit optional) |
| `candidates/match-start-youkoso.mp3` | https://soundeffect-lab.info/sound/voice/info-lady1.html | `info-lady1-youkoso1.mp3` 「ようこそ」 | 声素材 / 落ち着いた女性 (info-lady1) | quarantined candidate — partial match for `matchStart` | mono 44.1 kHz, edge-trim, +7.40 dB → MP3 192k | 0.70 s / 18 KB | SEL ToU (credit optional) |
| `candidates/round-start-start.mp3` | https://soundeffect-lab.info/sound/voice/info-lady1.html | `info-lady1-start1.mp3` 「スタート」 | 声素材 / 落ち着いた女性 (info-lady1) | quarantined candidate — partial match for `roundStart` | mono 44.1 kHz, edge-trim, +8.60 dB → MP3 192k | 0.74 s / 19 KB | SEL ToU (credit optional) |

### What is bound, and what deliberately is not

**Bound and audible today** (surgical additive edit to
`content/config/audio-map.json`, after task #40 landed):

| event | pool | gain | why |
| --- | --- | --- | --- |
| `block` | `lab/block-clash.wav`, `lab/block-shield.wav` | 0.63 | 防禦 is weapon-agnostic — a real 剣で打ち合う / 盾で防御 beats the synth ping. Replaces `fx/guard.wav`; the two members sit ±1.6 dB around the old pool level, so the event's perceived loudness is unchanged. |
| `whiff` | `lab/whiff-sword.wav` | 0.43 | a real 剣の素振り, and at −21.7 dB mean it is within 0.7 dB of the `fx/whiff.wav` it replaces — a true drop-in. |

**Authored but silent** — 16 further events (`uiDenied`, `uiCancel`, `panelOpen`,
`shopPurchase`, `goldGain`, `lowHealth`, `abilityRankUp`, `settlementReveal`,
`vsReveal`, `matchStartGong`, `matchEndGong`, `levelUpJingle`, `exUnlockSting`,
`heal`, `buffApply`, `explosion`) are authored in `audio-map.json` with a tuned
gain/cooldown/voice-cap, but **no code emits them yet**. The emit sites live in
`apps/client/src/audio/**` and the HUD/shop surfaces owned by tasks #38/#39/#44.
An unknown event is simply silent, so this costs nothing at runtime and gives
those tasks a binding that is already level-matched.

**Three "obvious" bindings that are FORBIDDEN, not merely undone:** `matchStart`,
`levelUp` and `exUnlock` are **announcer-VO-only** pools — task #40 made every
system broadcast Japanese and `announcerVo.test.ts` asserts the pools contain
nothing outside `assets/audio/announcer/`. The gong, the level-up jingle and the
holy sting therefore got their **own** event keys (`matchStartGong`,
`levelUpJingle`, `exUnlockSting`) to be layered *alongside* the VO by whoever
adds the emit site. Do not "simplify" them back into the VO pools.

**Not bound, with the reason recorded per row above:** every weapon clip
(sword ×3, katana, greatsword, bow, arrow ×2, gunshot, heavy punch) and the three
elemental magic casts. `basicAttack` / `projectileSpawn` / `projectileHit` /
`attackWindup` / `abilityCast` are **single global events** — GGD has no
per-weapon or per-ability audio routing, so binding a katana slash there would
put a metal blade on a mage's staff and a fletched arrow on a fireball. These
clips are the raw material for that routing, not a drop-in upgrade; the routing
itself is client-audio work (`apps/client/src/audio/**`).
