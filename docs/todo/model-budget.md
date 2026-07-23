# Asset budget — per-screen triangle/texture caps + offline batch optimiser (task #99)

The unit of concern is **one frame（同一畫面）**, never the repository. A total
across 200-plus files is not a budget; what is simultaneously resident while the
player looks at the screen is. So the tool (`tools/model-budget`) parses every
`.glb`, traces **where each one is used** (which champions / skins / arenas /
scenes reference it), assembles the *simultaneous* cost of each scene (login,
champ-select, intermission, the four combat arenas, settlement), and scores it
against a per-role gate and a per-screen cap — each carrying its derivation in
`why`, printed next to the number. The measurement is published once to
`content/assets/model-budget/report.json`; the 後台管理 **模型預算** page and the
offline optimiser both READ that file and never re-measure (two disagreeing
triangle counts are worth less than one).

**What binds is not triangles.** The whole tree is ~194k tris and the worst
frame ~124k — small for any target GPU. The lines that actually bind are draw
calls, texture VRAM and skinned-animation channels (measured, task #80 + #99
probes). Triangles still get a line because the user asked for one and it catches
a catastrophic import, but the page says plainly which axis is the real gate.

**The offline batch optimiser is an entrypoint, not an action.**
`tools/model-budget/worklist.ts` reads the report, lists every asset over its
threshold (the **warning line** by default), and writes an
`optimize-worklist.json`. It queues only what an automated pass can actually
shrink — an oversized texture (resize) or excess geometry (decimate, #115) — and
names draw-call / animation-channel breaches as **re-authoring** work rather than
dressing them up as "optimise". `--optimize` hands the queued `.glb` paths to
`optimize.ts`, which even then defaults to a DRY RUN, writes to a separate tree
and never in place (no VCS here, #65 — a destructive pass has eaten originals
once). The admin page's 「排入離線最佳化」button produces the identical schema
(`model-budget/optimise-worklist@1`) from the same report, so the console and the
CLI drive the same optimiser. Adoption stays a separate human act.

Owned by #99: `tools/model-budget/**`, `content/assets/model-budget/*.json`,
`apps/admin/src/ui/ModelBudgetPage.tsx` (+ its data module
`apps/admin/src/assets/modelBudget.ts`). The actual decimation (skin-aware
simplify + rig survival) is **task #115**.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| mb-01 | Per-model measurement carries triangle/vertex counts, texture size + VRAM, draw calls AND **where-it-is-used** — the four KayKit stand-ins traced to the champions that reference them, `japanesecherry` traced to godie at 50 instances, procedural ground carried on the SCENE not any glb; usage is traced, never guessed | mbudget-where-used | unit | done |
| mb-02 | **Same-screen caps**: every scene assembles its simultaneous per-frame cost (texture deduped per distinct glb, geometry multiplied per instance) and every combat scene scores all four budgeted axes (triangles / draw calls / anim channels / VRAM) against a configurable cap + warning line with a verdict; no scene total ever approaches the repo total | mbudget-same-screen | unit | done |
| mb-03 | **Offline worklist builder** classifies the report's verdicts into: items the optimiser can shrink (texture-resize / geometry-decimate, each with a concrete target from the role gate), `needsReauthor` (over only on draw calls / anim channels), and `broken` (zero/near-zero geometry) — queue ordered heaviest-first, `--over-only` restricts to hard limits, scenes over cap carried through | mbudget-worklist | unit | done |
| mb-04 | The worklist over the SHIPPED report is valid and actionable — every queued item is a real `.glb` file with ≥1 concrete action, ordered heavy→light — and `--optimize` hands those paths to the optimiser (dry-run, separate tree, never in place) | mbudget-worklist-real | integration | done |
| mb-05 | Admin **模型預算** page: per-model table sorted heavy→light (VRAM then triangles, unmeasured sinks last), a clear over-threshold list from the report's OWN verdicts, and a one-click 「排入離線最佳化」that produces the same-schema worklist (queues only what is optimisable, names manual work, `--over-only` + id filter, null-report-safe) | adminui-model-budget-optimise | unit | done |
| mb-06 | The offline optimiser's rig-survival gate rejects any decimation candidate that did not actually shrink or that lost an animation clip / skeleton, and the texture stage writes to a separate tree leaving the original byte-identical (never in place) | mbudget-optimise-safety | unit | done |
| mb-07 | Geometry **decimation** stage (skin-aware meshoptimizer simplify + full rig-survival verification, deps isolated under `.optvendor` so the workspace lockfile is untouched) is owned by the LOD wave | mbudget-geometry-decimate | unit | deferred |
