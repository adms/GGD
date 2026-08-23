/**
 * 天氣（GH#610 第二批）—— 三條**承重**的線，⛔ 不驗任何一個可調數字。
 * ① 霧再濃也不會讓最遠的敵人消失（owner：「這個地圖是**全視野**」），距離**從出貨場地量**。
 * ② 名字逐字寫著「（室內）／（室外）」的圖，出貨天氣要同意（owner：室內不要下雨）。
 * ③ 開關關掉 ⇒ 那一樣真的是 0；不傳天氣 ⇒ 地板逐位元等於這一版之前且沒有積水 mesh。
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import {
  DEFAULT_WEATHER,
  FOG_MIN_TRANSMITTANCE,
  fogTransmittance,
  weatherKindIsSheltered,
  weatherLookFor,
  zConfigWeatherDoc,
} from "@ggd/shared/content";
import { AIR_SCATTER_DENSITY } from "./airScatter";
import { setWeatherToggles, weatherToggles } from "./weather";
import { buildZoneGround } from "./ArenaGround";
import { buildArena } from "./ArenaScene";
import { DEFAULT_GRAPHICS, type GraphicsSettings } from "../settings/types";

const DIR = join(__dirname, "../../../../content/arenas");
const ARENAS = readdirSync(DIR)
  .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  .map((f) => JSON.parse(readFileSync(join(DIR, f), "utf8")) as Record<string, any>);
const RAINY = "arena.shiganshina";
const on = (over: Partial<GraphicsSettings> = {}): GraphicsSettings => ({
  ...DEFAULT_GRAPHICS,
  ...over,
});
const look = (over?: Partial<GraphicsSettings>, reduced = false) =>
  weatherLookFor(DEFAULT_WEATHER, RAINY, weatherToggles(on(over), "high", 0, reduced));

describe("天氣", () => {
  it("① 最濃的霧在出貨場地量得到的最遠對戰距離上仍然看得到敵人", () => {
    // ⭐ 距離**從內容推導**（一個 zone 裡兩人最遠 = 直徑），⛔ 不抄字面值。
    const far = Math.max(
      ...ARENAS.flatMap((d) =>
        (d.zones as { boundaryRadius: number }[]).map((z) => z.boundaryRadius * 2),
      ),
    );
    const maxAdd = (zConfigWeatherDoc.shape.fogDensityAtFull as any).maxValue as number;
    expect(fogTransmittance(AIR_SCATTER_DENSITY + maxAdd, far)).toBeGreaterThanOrEqual(
      FOG_MIN_TRANSMITTANCE,
    );
  });

  it("② 名字逐字寫著室內／室外的場地，出貨天氣要同意", () => {
    const judged = ARENAS.filter((d) => /（室內）|（室外）/.test(String(d.name)));
    expect(judged.length).toBeGreaterThan(0); // ⛔ 空陣列 = 永遠綠的裝飾品
    for (const d of judged) {
      const kind = DEFAULT_WEATHER.arenas[d.id as string];
      expect(kind, `${d.id} 沒有列在出貨天氣表上`).toBeDefined();
      expect(weatherKindIsSheltered(kind!), `${d.id}（${d.name}）`).toBe(
        String(d.name).includes("（室內）"),
      );
    }
  });

  it("③ 關掉哪一格，哪一樣就是 0 —— ⛔ 而其餘幾格不受影響", () => {
    const full = look();
    expect([full.wet, full.puddle, full.fogDensity].every((v) => v > 0)).toBe(true);
    expect(weatherToggles(on(), "high", 0, false).lightning).toBe(true);
    const dry = look({ wetGround: "off" });
    expect(dry.wet).toBe(0);
    expect(dry.puddle).toBe(full.puddle); // ⛔ 四格各自關，不連坐
    expect(look({ puddles: "off" }).puddle).toBe(0);
    expect(look({ weatherFog: "off" }).fogDensity).toBe(0);
    // 減少動態 ⇒ 閃電被強制關掉（無障礙，⛔ 不是效能）
    expect(weatherToggles(on(), "high", 0, true).lightning).toBe(false);
  });

  it("③ 接線：不傳天氣 = 這一版之前的地板；下雨的**整張圖**真的濕 + 真的有積水", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const zone = { center: { x: 0, z: 0 }, boundaryRadius: 24 };
    const dry = buildZoneGround(scene, new TransformNode("d", scene), zone, 0, "stone");
    expect((dry.floor.material as PBRMaterial).roughness).toBe(0.9);
    expect(dry.puddles ?? null).toBeNull();

    // ⭐ 走**出貨的那條路**（`buildArena`），⛔ 不是直接呼叫 `buildZoneGround` ——
    //    後者對「ArenaScene 忘了把天氣傳下去」是全綠的（失敗形態③）。
    setWeatherToggles({ wetGround: true, puddles: true, fog: true, lightning: true });
    const h = buildArena(
      scene,
      { id: RAINY, name: "r", zones: [{ ...zone, id: "z0", obstacles: [], spawns: [] }], decor: [] } as never,
      "stone",
    );
    const g0 = h.grounds[0]!;
    expect((g0.floor.material as PBRMaterial).roughness).toBeLessThan(0.9);
    expect(g0.puddles?.thinInstanceCount ?? 0).toBeGreaterThan(0);
    scene.dispose();
    engine.dispose();
  });
});
