# Leap (跳躍落地) — the parabolic jump rebuilt from the map's JASS

The primitive itself (#247): ten `SetUnitFlyHeightBJ(-k*Pow(i-m,2)+A)` sites in
`war3map.j` all satisfy `A = k(m-1)²`, so substituting `u = (i-1)/(2m-2)`
collapses every one of them onto a single normalised parabola
`h = 4·A·u·(1-u)`. The GGD leap is not an approximation of that curve, it IS
that curve re-parameterised. See `packages/shared/src/sim/movement/leap.ts`.

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
| leap-01 | the rig this suite measures against IS the shipped one (68°, dolly 10 = DOLLY_MIN, fov 0.8, minZ 0.5), and the vertical budget is aspect-independent (fov stays VERTICAL-fixed, so a phone in landscape inherits it) | leap-framing-camera | regression | done |
| leap-02 | EVERY leap in content — standalone + embedded champion copies, four headings — is never behind the near plane, off-frame ≤15% of its flight, cropped ≤35%, measured through the real CameraRig at DOLLY_DEFAULT | leap-framing-onscreen | regression | done |
| leap-03 | the near-plane wall is located by bisecting the real rig (~8.45 u of fly height for a champion's head) and every shipped apex is proven under it — the #247 values 11.00 / 18.33 were over it | leap-framing-nearplane | regression | done |
| leap-04 | NEGATIVE CONTROL — the exact #247 arc (apex 11.00, 1.44 s, 14 u) still fails this gate, so a quietly widened limit cannot show green | leap-framing-negative | regression | done |
| leap-05 | DOLLY_DEFAULT is the WORST case: zooming out never increases off-frame / cropped / near-plane counts, which is why gating one dolly is enough | leap-framing-dolly | regression | done |
| leap-06 | altitude converts at `GGD_APEX_PER_WC3 = 1/250` (never the planar 11/600), the JASS family's ordering survives the rescale with no two arcs colliding, and every shipped apex is a value from that family | leap-apex-scale | unit | done |

See also: `sim-determinism.md` (the arc is bit-identical and rng-free) and
`victory-fireworks.md` #93 (the same "nobody ever pointed the game camera at it"
failure, one feature earlier).
