/**
 * ⭐ GH#610 飄過去的那一片霧 —— **三條承重的線**，⛔ 不驗任何一個可調數字。
 * ① 玩法閘：兩層霧**相乘**在最遠對戰距離（從出貨場地量）上仍看得到敵人；⭐ 而它靠的
 *    「最多被一片蓋到」這個前提**自己也被驗**（沿時間軸取樣，兩片永不重疊）。
 * ② 決定性：同 t 同 seed ⇒ 逐位元同一個位置；t 走了／換 seed ⇒ 換一條路。
 * ③ 接線：走**出貨的那條路**（`buildArena`）—— 霧那一格關掉 ⇒ 霧片**沒有被建出來**。
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
// prettier-ignore
import { DEFAULT_WEATHER, FOG_MIN_TRANSMITTANCE, fogSightTransmittance, weatherLookFor, zConfigWeatherDoc } from "@ggd/shared/content";
import { AIR_SCATTER_DENSITY } from "./airScatter";
import { setWeatherToggles, weatherToggles } from "./weather";
import { buildArena } from "./ArenaScene";
import { fogBankPose, fogFootprint } from "./weatherFogBanks";
import { DEFAULT_GRAPHICS, type GraphicsSettings } from "../settings/types";

const DIR = join(__dirname, "../../../../content/arenas");
const ARENAS = readdirSync(DIR)
  .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  .map((f) => JSON.parse(readFileSync(join(DIR, f), "utf8")) as any);
const FOGGY = "arena.frieren"; // 出貨天氣 = `fog`（權重 1 ⇒ 霧片最多的那一張）
const ZONES = [{ id: "z0", center: { x: 0, z: 0 }, boundaryRadius: 30, obstacles: [], spawns: [] }];
const FOOT = fogFootprint(ZONES);
const max = (k: string): number => (zConfigWeatherDoc.shape as any)[k].maxValue as number;
const build = (over: Partial<GraphicsSettings> = {}) => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  setWeatherToggles(weatherToggles({ ...DEFAULT_GRAPHICS, ...over }, "high", 0, false));
  const h = buildArena(scene, { id: FOGGY, name: "f", zones: ZONES, decor: [] } as never, "stone");
  const m = h.root.getChildMeshes(false).find((x) => x.name.startsWith("fog-banks"));
  return { mesh: m as Mesh | undefined, done: () => (scene.dispose(), engine.dispose()) };
};

describe("飄過去的那一片霧", () => {
  it("① 兩層霧一起算還看得到敵人 —— 而它靠的「兩片不重疊」也是真的", () => {
    const z2 = (d: any) => d.zones.map((z: any) => z.boundaryRadius * 2); // 一 zone 兩人最遠 = 直徑
    const dens = AIR_SCATTER_DENSITY + max("fogDensityAtFull");
    const worst = fogSightTransmittance(dens, Math.max(...ARENAS.flatMap(z2)), max("fogBankAlpha"));
    expect(worst).toBeGreaterThanOrEqual(FOG_MIN_TRANSMITTANCE);

    // ⭐ 上面那個算術假設「任何一點最多被**一片**蓋到」—— 這裡驗那個假設本身。
    const pol = { fogBankLaneFill: 1, fogBankDriftSec: DEFAULT_WEATHER.fogBankDriftSec };
    const n = max("fogBankCount");
    const rad = (p: { halfX: number; halfZ: number }) => Math.hypot(p.halfX, p.halfZ);
    for (let s = 0; s < 64; s++) {
      const t = (s / 64) * pol.fogBankDriftSec * 2;
      const p = Array.from({ length: n }, (_, i) => fogBankPose(FOOT, pol, 12345, i, n, t));
      for (let a = 0; a < n; a++)
        for (let b = a + 1; b < n; b++)
          expect(Math.hypot(p[a]!.x - p[b]!.x, p[a]!.z - p[b]!.z)).toBeGreaterThan(rad(p[a]!) + rad(p[b]!));
    }
  });

  it("② 同 t 同 seed ⇒ 逐位元同一個位置；t 走了／換 seed ⇒ 換一條路", () => {
    const pol = { fogBankLaneFill: 0.85, fogBankDriftSec: 90 };
    const at = (t: number, seed = 999) => fogBankPose(FOOT, pol, seed, 1, 4, t);
    expect(at(7.5)).toEqual(at(7.5));
    expect(at(7.5)).not.toEqual(at(30.5));
    expect(at(7.5)).not.toEqual(at(7.5, 1000));
  });

  it("③ 出貨路徑：霧開著就有霧片；那一格關掉 ⇒ 一顆都沒建", () => {
    const all = { wetGround: true, puddles: true, fog: true };
    const want = weatherLookFor(DEFAULT_WEATHER, FOGGY, all).fogBanks;
    expect(want).toBeGreaterThan(0); // ⛔ 0 == 0 是一條永遠綠的裝飾品
    const on = build();
    expect(on.mesh?.thinInstanceCount ?? 0).toBe(want);
    on.done();
    const off = build({ weatherFog: "off" });
    expect(off.mesh).toBeUndefined();
    off.done();
  });
});
