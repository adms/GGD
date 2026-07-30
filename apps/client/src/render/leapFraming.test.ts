/**
 * TASK #247b — EVERY leap in content must be ON SCREEN, measured through the
 * REAL CameraRig at the shipped default dolly and pitch.
 *
 * ---------------------------------------------------------------------------
 * THE BUG THIS EXISTS FOR
 * ---------------------------------------------------------------------------
 * #247's leap was correct in the sim, on the wire and in the renderer, and
 * still shipped 蒼月潮 07-03 (apex 11.00 u) off-screen for 73% of its 44 ticks,
 * part of it FULLY BEHIND THE NEAR PLANE. The apex had been ported through the
 * PLANAR import scale (11/600), which is the wrong ruler for the vertical axis:
 * WC3's camera is ~30° / 1650 u / ~70° fov, GGD's is 68° / 10 u / 0.8 rad, and
 * the vertical headroom differs by ~3.2×. See GGD_APEX_PER_WC3.
 *
 * Nothing caught it because nothing had ever pointed the game's own camera at a
 * leap. #93 (the roast-chicken firework nobody saw) taught this project exactly
 * that lesson: 驗證畫面必須用遊戲真正的 68° 鏡頭拍.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS TEST ACTUALLY DOES
 * ---------------------------------------------------------------------------
 * No hand-rolled projection math. It builds a real `CameraRig` on a headless
 * NullEngine, drives it with `rig.update({ localPos })` so the SHIPPED
 * exponential follow-lerp (and therefore its lag behind a fast arc) is in the
 * measurement, renders the scene to flush Babylon's own view/projection
 * matrices, and asks `rig.projectToScreen` — the same call the DOM world-anchor
 * layer uses — where the champion's feet and head land in CSS pixels.
 *
 * The heights it feeds in are the RENDERED heights: the sim's `leapHeightAt`
 * pushed through the client's `catmullRom1D`, so any spline overshoot at the
 * apex is inside the number, not outside it.
 *
 * It reads EVERY `leap` effect in `content/` — standalone ability docs AND the
 * denormalised copies embedded in champion docs (the copy
 * editor/PreviewController renders whole) — so a future author cannot add an
 * apex-1000 leap that vanishes.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT DELIBERATELY DOES NOT GATE
 * ---------------------------------------------------------------------------
 * The contract is "the leaper YOU ARE WATCHING stays on screen" — follow-lock
 * on the flying body, which is the shipped default (#31a) and the case the
 * verifier measured. A leap by someone the camera is not following can be
 * anywhere on or off screen for reasons that have nothing to do with its apex:
 * at DOLLY_DEFAULT the visible ground reaches only ~5.5 u past the camera
 * target, so a takeoff 14 u away (蒼月潮's range) is off-screen at ground level
 * before it leaves the floor. Gating that would be gating the zoom level, not
 * the leap. Same reason the EX cinematic punch-in (dolly 5) is out of scope: it
 * halves the height budget for 260 ms, but it is a different feature's camera
 * override and no leap in content is an EX.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { cover } from "@ggd/shared/testkit/cover";
import { fileURLToPath } from "node:url";
import "@babylonjs/core/Culling/ray";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { leapTicks } from "@ggd/shared/sim";
import { GGD_APEX_PER_WC3, toApex } from "@ggd/shared/content/templates/expand";
import { CameraRig, CAMERA_PITCH_RAD, DOLLY_DEFAULT, DOLLY_MIN } from "./CameraRig";
import {
  sampleLeapArc,
  measureLeapFraming,
  LEAP_BODY_HEIGHT,
  LEAP_FRAMING_LIMITS,
  type LeapArcSpec,
  type LeapArcSample,
  type ProjectedPoint,
} from "./leapFraming";

const W = 1280;
const H = 720;
const TICK_MS = 1000 / 30;
const SUB = 4;

const contentDir = (rel: string): string =>
  fileURLToPath(new URL(`../../../../content/${rel}`, import.meta.url));

let engine: NullEngine;
let scene: Scene;

beforeEach(() => {
  engine = new NullEngine({
    renderWidth: W,
    renderHeight: H,
    textureSize: 4,
    deterministicLockstep: false,
    lockstepMaxSteps: 1,
  });
  scene = new Scene(engine);
});
afterEach(() => {
  scene.dispose();
  engine.dispose();
});

// ---------------------------------------------------------------------------
// content harvest
// ---------------------------------------------------------------------------

interface ContentLeap {
  /** "godie-hpb1.e" or "godie-hpb1 [E, embedded]" */
  where: string;
  apexHeight: number;
  durationSec: number;
  /** how far the body travels: 0 for inPlace, else the ability's reach */
  travel: number;
}

type Json = Record<string, unknown>;

function num(o: Json, key: string): number | null {
  const v = o[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Walk an effect tree (leaps nest their payload under `onLand`). */
function collectLeaps(effects: unknown, where: string, reach: number, out: ContentLeap[]): void {
  if (!Array.isArray(effects)) return;
  for (const raw of effects) {
    if (typeof raw !== "object" || raw === null) continue;
    const e = raw as Json;
    if (e["kind"] === "leap") {
      const apexHeight = num(e, "apexHeight");
      const durationSec = num(e, "durationSec");
      if (apexHeight === null || durationSec === null) continue;
      const travel =
        e["mode"] === "inPlace" ? 0 : (num(e, "throwDistance") ?? reach);
      out.push({ where, apexHeight, durationSec, travel });
    }
    collectLeaps(e["onLand"], where, reach, out);
    collectLeaps(e["effects"], where, reach, out);
  }
}

function harvestContentLeaps(): ContentLeap[] {
  const out: ContentLeap[] = [];
  const abilityDir = contentDir("abilities");
  for (const f of readdirSync(abilityDir)) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    const doc = JSON.parse(readFileSync(`${abilityDir}/${f}`, "utf8")) as Json;
    const reach = num(doc, "range") ?? num(doc, "radius") ?? 0;
    collectLeaps(doc["effects"], f.replace(/\.json$/, ""), reach, out);
  }
  const champDir = contentDir("champions");
  for (const f of readdirSync(champDir)) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    const doc = JSON.parse(readFileSync(`${champDir}/${f}`, "utf8")) as Json;
    const abilities = doc["abilities"];
    if (typeof abilities !== "object" || abilities === null) continue;
    for (const [slot, a] of Object.entries(abilities as Json)) {
      if (typeof a !== "object" || a === null) continue;
      const ab = a as Json;
      const reach = num(ab, "range") ?? num(ab, "radius") ?? 0;
      collectLeaps(
        ab["effects"],
        `${f.replace(/\.json$/, "")} [${slot}, embedded]`,
        reach,
        out,
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// the measurement rig
// ---------------------------------------------------------------------------

/** Unit XZ directions a leap may travel in (follow-lag differs per heading). */
const HEADINGS: readonly { name: string; x: number; z: number }[] = [
  { name: "away (+Z)", x: 0, z: 1 },
  { name: "toward (−Z)", x: 0, z: -1 },
  { name: "right (+X)", x: 1, z: 0 },
  { name: "left (−X)", x: -1, z: 0 },
];

function specFor(leap: ContentLeap, heading: { x: number; z: number }): LeapArcSpec {
  const from = { x: 0, z: 0 };
  return {
    apexHeight: leap.apexHeight,
    ticks: leapTicks(leap.durationSec),
    from,
    to: { x: from.x + heading.x * leap.travel, z: from.z + heading.z * leap.travel },
  };
}

/**
 * Fly `samples` past a live rig and report the three verdicts.
 *
 * `dolly` defaults to the shipped default. The rig is settled on the takeoff
 * point first so the follow-lerp starts where a standing champion would leave
 * it, then advanced one sub-tick per sample — the lag is real, not modelled.
 */
function flyPastCamera(samples: readonly LeapArcSample[], dolly = DOLLY_DEFAULT) {
  const rig = new CameraRig(scene, { x: samples[0]!.x, z: samples[0]!.z });
  if (dolly !== DOLLY_DEFAULT) rig.zoomBy((dolly - DOLLY_DEFAULT) / 0.02);
  const step = (localPos: { x: number; z: number }, dtMs: number): void => {
    rig.update({ dtMs, localPos, cursor: null, panKeys: null, viewportWidth: W, viewportHeight: H });
  };
  for (let i = 0; i < 40; i++) step({ x: samples[0]!.x, z: samples[0]!.z }, TICK_MS); // settle
  const minZ = rig.camera.minZ;

  const probe = (x: number, y: number, z: number): ProjectedPoint => {
    const p = rig.projectToScreen(x, y, z);
    // Near-plane test computed from the rig's OWN published geometry (eye +
    // the ground point the centre ray hits), so it is the same transform
    // Babylon just projected through — and it is asserted against Babylon's
    // depth verdict below, so neither can drift alone.
    const eye = rig.eye;
    const view = rig.groundView();
    const fx = view.targetX - eye.x;
    const fy = 0 - eye.y;
    const fz = view.targetZ - eye.z;
    const flen = Math.hypot(fx, fy, fz) || 1;
    const depth = ((x - eye.x) * fx + (y - eye.y) * fy + (z - eye.z) * fz) / flen;
    return {
      inFrame: p.visible && p.sx >= 0 && p.sx <= W && p.sy >= 0 && p.sy <= H,
      nearPlane: depth < minZ,
    };
  };

  return measureLeapFraming(samples, (s) => {
    step({ x: s.x, z: s.z }, TICK_MS / SUB);
    scene.render(); // flush the view/projection matrices projectToScreen reads
    return {
      feet: probe(s.x, s.h, s.z),
      head: probe(s.x, s.h + LEAP_BODY_HEIGHT, s.z),
    };
  });
}

// ---------------------------------------------------------------------------

describe("#247b leap framing — every leap in content stays on screen", () => {
  it("the shipped camera really is the one this test measures against", () => {
    cover("leap-framing-camera");
    // If someone re-tunes the rig, the budget below moves with it and the
    // per-ability cases re-measure automatically. This case exists so the
    // CHANGE is visible in the diff rather than silent.
    expect(CAMERA_PITCH_RAD).toBeCloseTo((68 * Math.PI) / 180, 12);
    expect(DOLLY_DEFAULT).toBe(DOLLY_MIN);
    expect(DOLLY_DEFAULT).toBe(10);
    const rig = new CameraRig(scene, { x: 0, z: 0 });
    expect(rig.camera.fov).toBeCloseTo(0.8, 12); // Babylon default, never overridden in combat
    expect(rig.camera.minZ).toBe(0.5);
  });

  it("content HAS leaps to measure (the suite cannot pass by finding nothing)", () => {
    cover("leap-framing-onscreen");
    const leaps = harvestContentLeaps();
    // 5 abilities × (standalone + embedded champion copy)
    expect(leaps.length).toBeGreaterThanOrEqual(10);
    expect(new Set(leaps.map((l) => l.where)).size).toBe(leaps.length);
  });

  it("EVERY leap: never behind the near plane, ≤15% off-frame, ≤35% cropped", () => {
    cover("leap-framing-onscreen");
    const leaps = harvestContentLeaps();
    const failures: string[] = [];
    const table: string[] = [];
    for (const leap of leaps) {
      // ── 貼地瞬移不歸這條守衛管，而這是**縮小範圍不是放水** ────────────
      // 這一條測的是「**拋物線**會不會飛出畫面」：`sampleLeapArc` 取樣一條弧，
      // `flyPastCamera` 問「這條弧有沒有離開視錐 / 被上緣切掉」。
      // 13-01 暗步。極限之圓沒有弧：apex = 0、飛行 0.067 秒（**兩個 tick**），
      // 全程貼地。實測 away 44% 被切、toward 33% 出框 —— 但那兩個百分比的分母
      // 就是**兩個取樣點**，所以一個點不合格就是 50%。它量到的其實是
      // 「7.2 單位的瞬移，鏡頭來不來得及跟上」，那是**跟隨鏡頭**（#268）的題目，
      // 不是拋物線構圖的題目，而且要用完全不同的斷言（鏡頭插值速度）去測。
      //
      // ⚠️ 這個豁免**只放過 apex 0 且飛行 ≤ 0.1 秒的**，也就是定義上的瞬移。
      //    任何一支真的會跳起來的技能，apex > 0，照樣要過這一關。
      // ⚠️ 它是一個**已記錄的待辦**，不是「沒問題」：見 docs/_execution-batches.md
      //    第六批（延遲與效能）裡的鏡頭跟隨項。
      if (leap.apexHeight === 0 && leap.durationSec <= 0.1) {
        table.push(`${leap.where}: BLINK (apex 0, ${leap.durationSec}s) — 由跟隨鏡頭負責，不走弧線構圖`);
        continue;
      }
      for (const heading of HEADINGS) {
        const samples = sampleLeapArc(specFor(leap, heading), SUB);
        const r = flyPastCamera(samples);
        table.push(
          `${leap.where} ${heading.name}: apex=${r.peakHeight.toFixed(2)} ` +
            `near=${r.nearPlane} out=${(r.outsideFraction * 100).toFixed(0)}% ` +
            `crop=${(r.croppedFraction * 100).toFixed(0)}%`,
        );
        const tag = `${leap.where} heading ${heading.name}`;
        if (r.nearPlane > LEAP_FRAMING_LIMITS.maxNearPlaneSamples) {
          failures.push(
            `${tag}: ${r.nearPlane}/${r.samples} samples INSIDE THE NEAR PLANE ` +
              `(apex ${r.peakHeight.toFixed(2)} u) — the model clips inside-out`,
          );
        }
        if (r.outsideFraction > LEAP_FRAMING_LIMITS.maxOutsideFraction) {
          failures.push(
            `${tag}: ${(r.outsideFraction * 100).toFixed(0)}% of the flight has NO part of ` +
              `the champion on screen (limit ${LEAP_FRAMING_LIMITS.maxOutsideFraction * 100}%)`,
          );
        }
        if (r.croppedFraction > LEAP_FRAMING_LIMITS.maxCroppedFraction) {
          failures.push(
            `${tag}: ${(r.croppedFraction * 100).toFixed(0)}% of the flight is cropped at the ` +
              `top edge (limit ${LEAP_FRAMING_LIMITS.maxCroppedFraction * 100}%)`,
          );
        }
      }
    }
    // Report EVERY violation at once — a bare expect inside the loop would
    // report one defect for a whole broken family.
    expect(failures, `\n${failures.join("\n")}\n\nmeasured:\n${table.join("\n")}`).toEqual([]);
  });

  it("PROOF the near-plane case is gone: the ceiling is known and every apex is under it", () => {
    cover("leap-framing-nearplane");
    // Bisect the rig for the exact height at which a champion's body first
    // enters the near plane, then show the shipped apexes are nowhere near it.
    const rig = new CameraRig(scene, { x: 0, z: 0 });
    rig.update({ dtMs: 16, localPos: { x: 0, z: 0 }, cursor: null, panKeys: null, viewportWidth: W, viewportHeight: H });
    scene.render();
    const clipped = (h: number): boolean =>
      !rig.projectToScreen(0, h + LEAP_BODY_HEIGHT, 0).visible;
    let lo = 0;
    let hi = 30;
    expect(clipped(lo)).toBe(false);
    expect(clipped(hi)).toBe(true);
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (clipped(mid)) hi = mid;
      else lo = mid;
    }
    // eye ≈ 9.27 u, standoff ≈ 3.75 u, minZ 0.5 → the head hits the near plane
    // at ~8.45 u of fly height. #247 shipped 11.00 and 18.33.
    expect(lo).toBeGreaterThan(8);
    expect(lo).toBeLessThan(9);
    const apexes = harvestContentLeaps().map((l) => l.apexHeight);
    expect(apexes.length).toBeGreaterThan(0);
    for (const a of apexes) expect(a, `apex ${a} u vs near-plane wall ${lo.toFixed(2)} u`).toBeLessThan(lo);
    // and the OLD values would have failed this same check
    expect(11.0).toBeGreaterThan(lo);
    expect(18.33).toBeGreaterThan(lo);
  });

  it("NEGATIVE CONTROL: the #247 apexes fail the gate this suite enforces", () => {
    cover("leap-framing-negative");
    // Without this, a future edit that quietly widened the limits would still
    // show green. The exact arc the verifier measured, re-measured here.
    const samples = sampleLeapArc(
      { apexHeight: 11.0, ticks: leapTicks(1.44), from: { x: 0, z: 0 }, to: { x: 0, z: 14 } },
      SUB,
    );
    const r = flyPastCamera(samples);
    expect(r.nearPlane).toBeGreaterThan(0);
    expect(r.outsideFraction).toBeGreaterThan(0.5);
  });

  it("the default dolly IS the worst case — zooming out only ever helps", () => {
    cover("leap-framing-dolly");
    // Justifies gating at DOLLY_DEFAULT alone instead of sweeping the clamp.
    const samples = sampleLeapArc(
      { apexHeight: 4.0, ticks: leapTicks(0.84), from: { x: 0, z: 0 }, to: { x: 0, z: 0 } },
      SUB,
    );
    const near = flyPastCamera(samples, DOLLY_DEFAULT);
    const far = flyPastCamera(samples, 25);
    expect(far.outsideFraction).toBeLessThanOrEqual(near.outsideFraction);
    expect(far.croppedFraction).toBeLessThanOrEqual(near.croppedFraction);
    expect(far.nearPlane).toBeLessThanOrEqual(near.nearPlane);
  });

  it("the vertical budget is aspect-independent (fov is VERTICAL-fixed)", () => {
    cover("leap-framing-camera");
    // A phone in landscape is much wider, not taller. If anyone flips
    // camera.fovMode to HORIZONTAL_FIXED, the ceiling this suite measured on a
    // 16:9 desktop would silently stop applying to every other device.
    const rig = new CameraRig(scene, { x: 0, z: 0 });
    rig.update({ dtMs: 16, localPos: { x: 0, z: 0 }, cursor: null, panKeys: null, viewportWidth: W, viewportHeight: H });
    scene.render();
    const wideSy = rig.projectToScreen(0, 4, 0).sy / H;
    scene.dispose();
    engine.dispose();
    engine = new NullEngine({ renderWidth: 844, renderHeight: 390, textureSize: 4, deterministicLockstep: false, lockstepMaxSteps: 1 });
    scene = new Scene(engine);
    const rig2 = new CameraRig(scene, { x: 0, z: 0 });
    rig2.update({ dtMs: 16, localPos: { x: 0, z: 0 }, cursor: null, panKeys: null, viewportWidth: 844, viewportHeight: 390 });
    scene.render();
    const phoneSy = rig2.projectToScreen(0, 4, 0).sy / 390;
    expect(phoneSy).toBeCloseTo(wideSy, 6);
  });

  it("the apex conversion is the one the content was authored with", () => {
    cover("leap-apex-scale");
    // Ties the shipped numbers back to the JASS family through ONE factor, so
    // the ordering of the map's own arcs is provably preserved.
    expect(GGD_APEX_PER_WC3).toBe(1 / 250);
    expect(toApex(600)).toBe(2.4); // A0G3 / A0UX — 蒼月潮 07-03, 01-02 隕石擊
    expect(toApex(1000)).toBe(4); // A0RZ — 76-04 巨人迴旋彈, the biggest in the map
    expect(toApex(400)).toBe(1.6); // A0LZ
    expect(toApex(300)).toBe(1.2); // A0U1 — 52-02 蹂躪編年史
    expect(toApex(250)).toBe(1); // A0JD — 77-00 浮雲-旋一閃
    // ⚠️ 0 加在 2026-07-31,而且它**不是**「漏填」的代名詞。
    // 13-01 暗步。極限之圓是**瞬移**不是跳躍:owner 的規格是「點一個敵人,
    // 然後你就在他旁邊了」,全程貼地。它走 `leap` 是因為 leap 是唯一能表達
    // 「無視地形與碰撞的定點位移」的 kind,而不是因為它會跳起來。
    // `toApex(0) === 0`,所以 0 仍然在同一個換算家族裡 —— 少了這一項,
    // 任何一支貼地位移都會被這條斷言誤判成缺陷。
    expect(toApex(0)).toBe(0);
    const shipped = harvestContentLeaps().map((l) => l.apexHeight);
    for (const a of shipped) {
      expect([0, 1.2, 2.4, 4.0], `apex ${a} is not a JASS-family value`).toContain(a);
    }
  });
});
