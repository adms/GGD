/**
 * ⭐ GH#610 飄過去的那一片霧 —— **三條承重的線**，⛔ 不驗任何一個可調數字。
 * ① 玩法閘：兩層霧**相乘**的最壞情況，在出貨場地量得到的最遠對戰距離上仍然看得到敵人，
 *    ⭐ 而「最壞 = 只被一片蓋到」這個前提**自己也被驗**（沿時間軸取樣，兩片永不重疊）。
 * ② 決定性：同一個 t ＋ 同一個 seed ⇒ **逐位元**同一批矩陣；t 走了 ⇒ 真的動了。
 * ③ 接線：走**出貨的那條路**（`buildArena`）—— 霧那一格關掉 ⇒ 霧片**沒有被建出來**。
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import {
  DEFAULT_WEATHER,
  FOG_MIN_TRANSMITTANCE,
  fogSightTransmittance,
  weatherLookFor,
  zConfigWeatherDoc,
} from "@ggd/shared/content";
import { AIR_SCATTER_DENSITY } from "./airScatter";
import { setWeatherToggles, weatherToggles } from "./weather";
import { buildArena } from "./ArenaScene";
import { fogBankPose, fogFootprint } from "./weatherFogBanks";
import { DEFAULT_GRAPHICS, type GraphicsSettings } from "../settings/types";

const DIR = join(__dirname, "../../../../content/arenas");
const ARENAS = readdirSync(DIR)
  .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  .map((f) => JSON.parse(readFileSync(join(DIR, f), "utf8")) as Record<string, any>);
const FOGGY = "arena.frieren"; // 出貨天氣 = `fog`（權重 1 ⇒ 霧片最多的那一張）
const ZONES = [{ id: "z0", center: { x: 0, z: 0 }, boundaryRadius: 30, obstacles: [], spawns: [] }];
const max = (k: string): number => (zConfigWeatherDoc.shape as any)[k].maxValue as number;
const build = (over: Partial<GraphicsSettings> = {}) => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  setWeatherToggles(weatherToggles({ ...DEFAULT_GRAPHICS, ...over }, "high", 0, false));
  const h = buildArena(scene, { id: FOGGY, name: "f", zones: ZONES, decor: [] } as never, "stone");
  const mesh = h.root.getChildMeshes(false).find((m) => m.name.startsWith("fog-banks")) as
    | Mesh
    | undefined;
  return { mesh, done: () => (scene.dispose(), engine.dispose()) };
};

describe("飄過去的那一片霧", () => {
  it("① 兩層霧一起算，最遠對戰距離上仍然看得到敵人 —— 而且兩片永遠不重疊", () => {
    // 距離**從內容推導**（一個 zone 裡兩人最遠 = 直徑），⛔ 不抄字面值。
    const far = Math.max(
      ...ARENAS.flatMap((d) => (d.zones as { boundaryRadius: number }[]).map((z) => z.boundaryRadius * 2)),
    );
    const worst = fogSightTransmittance(
      AIR_SCATTER_DENSITY + max("fogDensityAtFull"),
      far,
      max("fogBankAlpha"),
    );
    expect(worst).toBeGreaterThanOrEqual(FOG_MIN_TRANSMITTANCE);

    // ⭐ 上面那個算術假設「任何一點最多被**一片**蓋到」。這裡驗那個假設本身：
    //    霧片最多、車道最滿的設定下，沿著一整趟飄程取樣，兩兩的外接圓永不相交。
    const pol = { fogBankLaneFill: 1, fogBankDriftSec: DEFAULT_WEATHER.fogBankDriftSec };
    const foot = fogFootprint(ZONES);
    const n = max("fogBankCount");
    for (let s = 0; s < 64; s++) {
      const t = (s / 64) * pol.fogBankDriftSec * 2;
      const p = Array.from({ length: n }, (_, i) => fogBankPose(foot, pol, 12345, i, n, t));
      for (let a = 0; a < n; a++)
        for (let b = a + 1; b < n; b++) {
          const ra = Math.hypot(p[a]!.halfX, p[a]!.halfZ);
          const rb = Math.hypot(p[b]!.halfX, p[b]!.halfZ);
          expect(Math.hypot(p[a]!.x - p[b]!.x, p[a]!.z - p[b]!.z)).toBeGreaterThan(ra + rb);
        }
    }
  });

  it("② 同 t 同 seed ⇒ 逐位元同一個位置；t 走了 ⇒ 真的飄了", () => {
    const foot = fogFootprint(ZONES);
    const pol = { fogBankLaneFill: 0.85, fogBankDriftSec: 90 };
    const at = (t: number) => fogBankPose(foot, pol, 999, 1, 4, t);
    expect(at(7.5)).toEqual(at(7.5));
    expect(at(7.5)).not.toEqual(at(30.5));
    expect(at(7.5)).not.toEqual(fogBankPose(foot, pol, 1000, 1, 4, 7.5)); // 換 seed ⇒ 換路
  });

  it("③ 出貨路徑：霧開著就有霧片；那一格關掉 ⇒ 一顆都沒建", () => {
    const on = build();
    expect(on.mesh?.thinInstanceCount ?? 0).toBe(weatherLookFor(DEFAULT_WEATHER, FOGGY, {
      wetGround: true, puddles: true, fog: true,
    }).fogBanks);
    expect(on.mesh?.thinInstanceCount ?? 0).toBeGreaterThan(0);
    on.done();
    const off = build({ weatherFog: "off" });
    expect(off.mesh).toBeUndefined();
    off.done();
  });
});
