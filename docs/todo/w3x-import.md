# Warcraft III map importer — TODO

`tools/w3x-import`. Extracts a protected .w3x (MPQ decrypt + PKWARE explode),
parses object data (w3u/w3a/w3t + wts TRIGSTR), converts MDX models to glTF
(.glb + BLP→PNG), and generates validated content drafts (champions/abilities/
items/models/skins/projectiles/arena). Suite: `w3x-import-unit` (vitest shells
the python pipeline on a synthetic fixture map — no Blizzard data).

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| w3x-01 | MPQ extraction round-trips encrypted (+FIX_KEY) zlib/stored files | w3x-extract-roundtrip | unit | done |
| w3x-02 | PKWARE DCL explode decompresses an imploded sector | w3x-explode-pkware | unit | done |
| w3x-03 | w3u/w3a object-data parser reads mods incl. leveled data columns | w3x-w3u-parse | unit | done |
| w3x-17 | ability Requirements (`areq`) referencing the R00R research parse, and a hero unit owns that R00R-gated ability (per-hero「EX 技能」level-30 gate) | w3x-r00r-parse | unit | done |
| w3x-04 | TRIGSTR_n references resolve to war3map.wts (UTF-8 Chinese) | w3x-trigstr-resolve | unit | done |
| w3x-05 | MDX chunk parser reads MODL/SEQS/TEXS/GEOS/BONE/PIVT | w3x-mdx-header-parse | unit | done |
| w3x-06 | glTF writer emits a valid GLB (container, accessors, skin, anims) | w3x-gltf-writer-valid | unit | done |
| w3x-07 | clipMap auto-maps Stand/Walk/Attack/Death/Stand Hit sequences | w3x-clipmap-automap | unit | done |
| w3x-08 | end-to-end pipeline on fixture map produces champion/item/arena drafts | w3x-import-pipeline | unit | done |
| w3x-09 | real imported content docs are wired (champion→model→glb, items, arena) | w3x-content-drafts | integration | done |
| w3x-10 | w3u ORIGINAL-table entries (modified standard heroes) parse with obj_id == base_id | w3x-original-table-hero | unit | done |
| w3x-11 | JASS random-hero pool auto-extracts (incl. $hex indices) and roster heroes emit champions with WC3 defaults + stand-in models | w3x-pool-extract | unit | done |
| w3x-12 | hero display name combines the WC3 title (unam) + proper name (upro) into one「稱號 - 名字」string, single-field heroes keep no dangling separator | w3x-name-combine | unit | done |
| w3x-13 | per-unit model scale derives from the map's Scaling Value (usca): base ×usca, effective height clamped 0.6–3.0u, collisionRadius NOT scaled | w3x-usca-scale | unit | done |
| w3x-14 | BLP alpha + WC3 filter mode select glTF alphaMode (OPAQUE/MASK/BLEND), opaque-base overlays stay solid, team-colour → teamTint, additive glow → emissive | w3x-alpha-material | unit | done |
| w3x-15 | separate attachment models referenced by MDX ATCH nodes are extracted and baked into the parent glb at the attach-node transform | w3x-attach-bake | unit | done |
| w3x-16 | animation sampler timing: WC3 global-timeline ms keys → per-clip seconds rebased to 0, strictly increasing (float32 dup collapse), clamped to the clip, out-of-clip bones pinned with 1-key holds | w3x-anim-timing | unit | done |
| w3x-19 | 一擊斬 Critical Strike imports BOTH columns: DataA1 → `critChance`, DataB1 → `critDamage` as a delta on the 1.75 champion base (absent DataB1 = the stock `AIcs` default of 2, which the w3a never spells out). Each shipped crit item's stats and its 「N%機率造成M倍傷害」 tooltip agree — post-#82 the MODIFIERS are the oracle and the 效能 block is regenerated from them, so this gates the drift in either direction | w3x-item-crit-multiplier | integration | done |
| w3x-20 | no shipped item modifier sits AT a degenerate value — `critChance 1` is a guaranteed crit on every auto, not a big number, and the AEP rescale reached it by scaling up two legendaries that were missing most of their stats | w3x-item-no-degenerate-modifier | integration | done |
| w3x-21 | ability data columns are keyed on the w3a's own dataColumn header, not guessed from the mod code's 4th character, so the mnemonic item fields (`Iatt`/`Iagi`/`Ilif`) survive; an ability absent from the w3a inherits its value from the stock `Units\AbilityData.slk` row rather than importing as no stat at all | w3x-item-data-column | integration | done |
| w3x-18 | effect-geoset guard: `classify_geosets` (gltf.py) drops particle/emitter geosets baked as geometry — team-glow billboards (invisible) and additive glow quads that tower above / beam past / float above / ring far outside the body — while KEEPING opaque body/skin, team-colour, and in-silhouette glow (energy blades, eye glows); body height = union bbox of the KEPT geosets, so the biggest geoset can never be mistaken for the body (fixes the niya 8.5× mis-scale at the root) | w3x-effect-geoset-guard | unit | done |
