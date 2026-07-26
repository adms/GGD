# Leap — parabolic jump primitive (task #247) — TODO

`packages/shared/src/sim/movement/leap.ts` + `sim/systems/LeapSystem.ts`, the `leap` EffectDef
(`content/schema/effect.ts`), the `h` wire channel (`protocol/schema.ts` → `net/snapshot.ts` →
`net/InterpolationBuffer.ts` → `render/views/ChampionView.ts`), and the `tpl-leap-strike`
Skill-Forge template.

Rebuilt from the source map's own JASS, not invented: **ten** `SetUnitFlyHeightBJ(-k·Pow(i-m,2)+A)`
sites across **nine** abilities (A0JZ owns two arcs, j:30802 + j:30990). Every one satisfies
`A = k(m-1)²`, so they all collapse to the single normalised parabola `h = 4·A·u·(1-u)` that the
primitive ships. Bound abilities: `godie-hpb1.e` (A0G3), `godie-hart.w` (A0UX),
`godie-u00n.r`/`godie-u00o.r` (A0RZ, vertical inPlace), `godie-hapm.w` (A0U1, `applyTo: "target"` —
the victim flies, not the caster).

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| leap-01 | the normalised arc reproduces all TEN JASS `(k, m, A)` triples at every integer index | leap-jass-arc | unit | done |
| leap-02 | same seed ⇒ byte-identical digests with a leap in flight, and the leap is genuinely inside the hash | leap-determinism | determinism | done |
| leap-03 | no trig / rng / clock reachable from the arc sources (static ban) | leap-no-trig | determinism | done |
| leap-04 | a leap CROSSES a pillar a walker cannot pass, and lands on the requested point | leap-crosses-terrain | integration | done |
| leap-05 | a blocked / out-of-bounds landing re-aims at TAKEOFF and touches down legally, with no landing-tick snap | leap-landing-legal | integration | done |
| leap-06 | hitstop freezes the arc and it resumes on the exact same curve | leap-hitstop | integration | done |
| leap-07 | death mid-air drops the body to the floor and fires NO landing effects | leap-death-midair | integration | done |
| leap-08 | the landing detonates `onLand` on the landing tick, centred on the landing point | leap-detonate | integration | done |
| leap-09 | reach is bounded UPSTREAM at cast resolution — a ground cast clicked far past its range lands at the range, not at the click | leap-reach-upstream | integration | done |
| leap-10 | a landing payload may MUTATE the entity set (`spawnProjectile` in `onLand`) without corrupting the arc walk | leap-payload-mutates | regression | done |
| leap-11 | detonation order is uniform: a re-leap fired by a landing starts at `elapsed 0` regardless of spawn order | leap-detonate-order | regression | done |
| leap-12 | fly height reaches the renderer and interpolates (Catmull-Rom), and a body killed at apex SNAPS down | leap-render-height | unit | done |
| leap-13 | the editor form renders a REAL leap card (typed widgets + recursive `onLand`), not just a union tag | leap-editor-form | unit | done |
| leap-14 | the editor's live preview lists a leap-only ability instead of showing an empty effect list | leap-editor-preview | unit | done |
| leap-15 | wire the caster model-scale ramp (A0U8 巨神一擊: 130→190 % over 7×0.04 s, restore to the hero's 120 % base) — needs a real EffectDef + ramp store; the #247 `sc` channel was removed as dead | leap-caster-scale | integration | pending |

## #247b — the apex was ported through the WRONG RULER, and the leap was off-screen

#247 converted the JASS fly heights with the PLANAR import scale
(`GGD_PER_WC3 = 11/600`), which put 蒼月潮 07-03 at **apex 11.00 u**. Measured
through the game's own `CameraRig` at the shipped default (`DOLLY_DEFAULT =
DOLLY_MIN = 10`, pitch 68°, fov 0.8 rad, eye ≈ 9.27 u, standoff ≈ 3.75 u):

* the champion left the top of the frame at **5.51 u** of fly height (feet) /
  **3.71 u** (top of head),
* it crossed the **near plane at 10.25 u** (feet) / **8.45 u** (head) — where the
  model clips inside-out or vanishes outright,
* so the shipped arc was outside the frame for **73% of its 44 ticks**, part of
  it fully behind the near plane. The two `inPlace` R-slots were worse: 18.33 u.

**Root cause: one map does not have one scale.** The planar constant is fixed by
the arena's geometry (763 → 14.00 u). The VERTICAL budget is fixed by the
CAMERA, and GGD's is not WC3's — ~30° / 1650 u / ~70° fov there versus 68° /
10 u / 0.8 rad here. Solving "how high above the camera target may a body rise
and stay in frame" gives ~950 WC3 u of headroom in WC3 against 5.51 GGD u here,
i.e. ~172 WC3 u per GGD u, not 54.5. Using the planar ruler inflated every apex
by ~3.2× in screen terms.

**Fix:** a second, documented conversion for the vertical axis only —
`GGD_APEX_PER_WC3 = 1/250` (`toApex`, `templates/expand.ts`), with the template
slot's unit changed from `wc3u` to a new `wc3h`. Planar values (`range`,
`radius`, `landRadius`, `throwDistance`) are untouched. The map's own hierarchy
of arcs is preserved because this is one linear factor: 1000 > 600 > 400 > 300 >
250 still orders 4.00 > 2.40 > 1.60 > 1.20 > 1.00.

| JASS | WC3 apex | shipped GGD apex | abilities |
| --- | --- | --- | --- |
| A0G3 / A0UX | 600 | 2.40 u | godie-hpb1.e (蒼月潮 07-03), godie-hart.w (01-02 隕石擊) |
| A0RZ | 1000 | 4.00 u | godie-u00n.r, godie-u00o.r (76-04 巨人迴旋彈) |
| A0U1 | 300 | 1.20 u | godie-hapm.w (52-02 蹂躪編年史, the VICTIM flies) |

This is a **deliberate, narrow override of the faithful-import rule** (「a
verified WC3 value beats a sanity cap」). It is not a sanity cap: the value is
still ported from the source through a single measured constant, and the
constant it is ported through is the one the source's own camera implies. A
leap the player cannot see is not a leap — the #93 lesson, 驗證畫面必須用遊戲真正
的 68° 鏡頭拍.

## The gate

`apps/client/src/render/leapFraming.test.ts` builds a REAL `CameraRig` on a
NullEngine, drives it with the shipped follow-lerp, renders to flush Babylon's
own matrices, and asks `rig.projectToScreen` where the champion's feet and head
land — for EVERY `leap` effect in `content/`, standalone docs and the
denormalised champion copies alike, in four travel headings. The heights it
feeds in are the RENDERED heights (sim `leapHeightAt` → the client's
`catmullRom1D`), so spline overshoot at the apex is inside the number.

Limits (`LEAP_FRAMING_LIMITS`, defended at their definition):
`nearPlane = 0` samples (a wall, not a budget) · `outside ≤ 15%` of the flight ·
`cropped ≤ 35%`. Measured today: every arc **0 near-plane, 0% outside**; only
the two A0RZ arcs are cropped, at **27%** — the deliberate apex peek on the
biggest leap in the map.

**Scope note.** The contract is "the leaper YOU ARE WATCHING stays on screen"
(follow-lock, the shipped default #31a). A leap by someone the camera is not
following is off-screen for zoom reasons, not apex reasons: at `DOLLY_DEFAULT`
the visible ground only reaches ~5.5 u past the camera target, so a takeoff 14 u
away is already off-screen at ground level. The EX cinematic punch-in (dolly 5)
halves the height budget for 260 ms and is likewise out of scope — it is another
feature's camera override, and no leap in content is an EX slot.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| leap-16 | the rig this suite measures against IS the shipped one (68°, dolly 10 = DOLLY_MIN, fov 0.8, minZ 0.5), and the vertical budget is aspect-independent (fov stays VERTICAL-fixed, so a phone in landscape inherits it) | leap-framing-camera | regression | done |
| leap-17 | EVERY leap in content — standalone + embedded champion copies, four headings — is never behind the near plane, off-frame ≤15% of its flight, cropped ≤35%, measured through the real CameraRig at DOLLY_DEFAULT | leap-framing-onscreen | regression | done |
| leap-18 | the near-plane wall is located by bisecting the real rig (~8.45 u of fly height for a champion's head) and every shipped apex is proven under it — the #247 values 11.00 / 18.33 were over it | leap-framing-nearplane | regression | done |
| leap-19 | NEGATIVE CONTROL — the exact #247 arc (apex 11.00, 1.44 s, 14 u) still fails this gate, so a quietly widened limit cannot show green | leap-framing-negative | regression | done |
| leap-20 | DOLLY_DEFAULT is the WORST case: zooming out never increases off-frame / cropped / near-plane counts, which is why gating one dolly is enough | leap-framing-dolly | regression | done |
| leap-21 | altitude converts at `GGD_APEX_PER_WC3 = 1/250` (never the planar 11/600), the JASS family's ordering survives the rescale with no two arcs colliding, and every shipped apex is a value from that family | leap-apex-scale | unit | done |
| leap-22 | INTEGRATION (#244 x #247): a GROWN champion keeps its growth size and its footing through a whole leap — `applyAirborne` runs last and composes with the growth factor instead of reverting it | growth-tier-airborne-compose | regression | done |

See also: `sim-determinism.md` (the arc is bit-identical and rng-free) and
`victory-fireworks.md` #93 (the same "nobody ever pointed the game camera at it"
failure, one feature earlier).
