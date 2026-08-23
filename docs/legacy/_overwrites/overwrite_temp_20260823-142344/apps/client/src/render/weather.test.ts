/**
 * 天氣（GH#610 第二批）—— 四條**承重**的線，⛔ 不驗任何一個可調數字。
 *
 * ① 霧再濃也不會讓最遠的敵人消失（owner：「這個地圖是**全視野**」）—— 距離從
 *    **出貨場地**量，⛔ 不抄字面值。
 * ② 名字逐字寫著「（室內）／（室外）」的兩張圖，出貨天氣要同意。
 * ③ 每一格開關關掉 ⇒ 那一樣真的是 0。
 * ④ 不傳天氣 ⇒ 地板逐位元等於這一版之前，而且**沒有積水 mesh**（接線的突變點）。
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
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
import { weatherToggles } from "./weather";
import { buildZoneGround } from "./ArenaGround";
import { DEFAULT_GRAPHICS, type GraphicsSettings } from "../settings/types";

const ARENAS = join(__dirname, "../../../../content/arenas");
const arenaDocs = readdirSync(ARENAS)
  .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  .map((f) => JSON.parse(readFileSync(join(ARENAS, f), "utf8")) as Record<string, any>);

describe("霧只影響觀感，⛔ 不影響玩法", () => {
  it("最濃的霧在出貨場地量得到的最遠對戰距離上仍然看得到敵人", () => {
    // ⭐ 距離**從內容推導**：一個 zone 裡兩個人能離多遠 = 直徑。⛔ 不抄 84。
    const far = Math.max(
      ...arenaDocs.flatMap((d) =>
        (d.zones as { boundaryRadius: number }[]).map((z) => z.boundaryRadius * 2),
      ),
    );
    // Zod 的上界 + 空氣漫反射的基礎值 = 玩家可能吃到的最濃的一次。
    const maxAdd = (zConfigWeatherDoc.shape.fogDensityAtFull as any).maxValue as number;
    expect(fogTransmittance(AIR_SCATTER_DENSITY + maxAdd, far)).toBeGreaterThanOrEqual(
      FOG_MIN_TRANSMITTANCE,
    );
  });
});

describe("室內不下雨（owner 2026-08-23）", () => {
  it("名字逐字寫著室內／室外的場地，出貨天氣要同意", () => {
    const judged = arenaDocs.filter((d) => /（室內）|（室外）/.test(String(d.name)));
    // ⛔ 空陣列會讓這條測試變成永遠綠的裝飾品。
    expect(judged.length).toBeGreaterThan(0);
    for (const d of judged) {
      const kind = DEFAULT_WEATHER.arenas[d.id as string];
      expect(kind, `${d.id} 沒有列在出貨天氣表上`).toBeDefined();
      expect(weatherKindIsSheltered(kind!), `${d.id}（${d.name}）`).toBe(
        String(d.name).includes("（室內）"),
      );
    }
  });
});

describe("四格開關", () => {
  const g = (over: Partial<GraphicsSettings>): GraphicsSettings => ({
    ...DEFAULT_GRAPHICS,
    ...over,
  });
  it("關掉哪一格，哪一樣就是 0 —— 而其餘三格不受影響", () => {
    const rainy = "arena.shiganshina";
    const all = weatherToggles(g({}), "high", 0, false);
    const full = weatherLookFor(DEFAULT_WEATHER, rainy, all);
    expect(full.wet).toBeGreaterThan(0);
    expect(full.puddle).toBeGreaterThan(0);
    expect(full.fogDensity).toBeGreaterThan(0);
    expect(all.lightning).toBe(true);

    const wetOff = weatherLookFor(
      DEFAULT_WEATHER,
      rainy,
      weatherToggles(g({ wetGround: "off" }), "high", 0, false),
    );
    expect(wetOff.wet).toBe(0);
    expect(wetOff.puddle).toBe(full.puddle);

    expect(
      weatherLookFor(DEFAULT_WEATHER, rainy, weatherToggles(g({ puddles: "off" }), "high", 0, false))
        .puddle,
    ).toBe(0);
    expect(
      weatherLookFor(
        DEFAULT_WEATHER,
        rainy,
        weatherToggles(g({ weatherFog: "off" }), "high", 0, false),
      ).fogDensity,
    ).toBe(0);
    // 減少動態 ⇒ 閃電被強制關掉（無障礙，⛔ 不是效能）。
    expect(weatherToggles(g({}), "high", 0, true).lightning).toBe(false);
  });
});

describe("接線（NullEngine）", () => {
  let engine: NullEngine;
  let scene: Scene;
  beforeAll(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
  });
  afterAll(() => {
    scene.dispose();
    engine.dispose();
  });

  const zone = { center: { x: 0, z: 0 }, boundaryRadius: 24 };

  it("不傳天氣 = 這一版之前的地板，⛔ 沒有積水", () => {
    const g = buildZoneGround(scene, new TransformNode("dry", scene), zone, 0, "stone");
    expect((g.floor.material as PBRMaterial).roughness).toBe(0.9);
    expect(g.puddles ?? null).toBeNull();
  });

  it("下雨 ⇒ 地板真的變濕，而且積水 mesh 真的被建出來", () => {
    const look = weatherLookFor(DEFAULT_WEATHER, "arena.shiganshina", {
      wetGround: true,
      puddles: true,
      fog: true,
    });
    const g = buildZoneGround(scene, new TransformNode("wet", scene), zone, 1, "stone", undefined, {
      policy: DEFAULT_WEATHER,
      look,
      reducedMotion: false,
    });
    // 讀**最終物件**：濕度乘在材質常數與 albedoColor 上，⛔ 不是換掉貼圖。
    expect((g.floor.material as PBRMaterial).roughness).toBeLessThan(0.9);
    expect(g.puddles).not.toBeNull();
    expect(g.puddles!.thinInstanceCount).toBeGreaterThan(0);
  });
});
