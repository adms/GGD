/**
 * client-08 (client-hud-discrete): architecture gate, in the spirit of
 * packages/shared/src/sim/purity.test.ts — a source scan enforcing:
 *   1. ONLY render/* and vfx/* import @babylonjs (imperative canvas stays
 *      behind the render seam);
 *   2. zustand (the React-visible store) is imported ONLY by ui/* and
 *      net/RoomStore.ts — the HUD reads discrete-rate schema projections;
 *   3. no `.setState(` outside net/RoomStore.ts — per-frame code paths
 *      (GameApp/render/vfx/predict/input) can never write into Zustand;
 *   4. React only under ui/* + main.tsx.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";

const SRC = __dirname;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

/** strip comments so prose about forbidden tokens can't trip the gate */
function readSource(p: string): string {
  return readFileSync(p, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

const rel = (p: string): string => relative(SRC, p).split(sep).join("/");

describe("client architecture gate (client-08)", () => {
  const files = walk(SRC);

  it("scans a real source tree", () => {
    cover("client-hud-discrete");
    expect(files.length).toBeGreaterThan(20);
  });

  it("only render/* and vfx/* import @babylonjs", () => {
    cover("client-hud-discrete");
    const violations: string[] = [];
    for (const f of files) {
      const r = rel(f);
      if (r.startsWith("render/") || r.startsWith("vfx/")) continue;
      if (/from\s+["']@babylonjs\//.test(readSource(f)) || /import\s*\(\s*["']@babylonjs\//.test(readSource(f))) {
        violations.push(r);
      }
    }
    expect(violations).toEqual([]);
  });

  it("zustand only appears in ui/* and net/RoomStore.ts", () => {
    cover("client-hud-discrete");
    const violations: string[] = [];
    for (const f of files) {
      const r = rel(f);
      if (r.startsWith("ui/") || r === "net/RoomStore.ts") continue;
      if (/from\s+["']zustand["'/]/.test(readSource(f))) violations.push(r);
    }
    expect(violations).toEqual([]);
  });

  it("no zustand setState writes outside net/RoomStore.ts (no per-frame writes)", () => {
    cover("client-hud-discrete");
    const violations: string[] = [];
    for (const f of files) {
      const r = rel(f);
      if (r === "net/RoomStore.ts") continue;
      // ⚠️ `this.setState(` 是 **React class component** 的 API，跟這一條要守的
      // 東西（zustand store 的每幀寫入）完全無關。剝掉它而不是整條放寬：
      // `store.setState(` / `useX.setState(` 照樣會被抓到。
      // 2026-08-02 `ui/HudErrorBoundary.tsx` 撞到這裡 —— 它是 React 唯一的
      // error-catch 機制，只能是 class component，而 fallback 要真的畫出來就
      // 必須在 componentDidCatch 裡 setState（實測：拿掉那一行，boundary 攔到了
      // 例外卻從不 commit fallback，畫面上什麼都沒有）。
      const src = readSource(f).replace(/\bthis\.setState\s*\(/g, "");
      if (/\.setState\s*\(/.test(src)) violations.push(r);
    }
    expect(violations).toEqual([]);
  });

  it("react only under ui/* (+ main.tsx); per-frame layers stay React-free", () => {
    cover("client-hud-discrete");
    const violations: string[] = [];
    for (const f of files) {
      const r = rel(f);
      if (r.startsWith("ui/") || r === "main.tsx") continue;
      if (/from\s+["']react(-dom)?["'/]/.test(readSource(f))) violations.push(r);
    }
    expect(violations).toEqual([]);
  });

  it("render/vfx never import the HUD store (transforms bypass React state)", () => {
    cover("client-hud-discrete");
    const violations: string[] = [];
    for (const f of files) {
      const r = rel(f);
      if (!r.startsWith("render/") && !r.startsWith("vfx/")) continue;
      if (/RoomStore/.test(readSource(f))) violations.push(r);
    }
    expect(violations).toEqual([]);
  });
});
