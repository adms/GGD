import { describe, it, expect } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { arenaDefFromDoc } from "@ggd/shared/sim/world/ArenaDef";
import type { ArenaDoc } from "@ggd/shared/content";
import { buildArena, disposeArena } from "./ArenaScene";

describe("每回合換場地的殘留量測", () => {
  it("N 輪 build→dispose 之後 scene 上還剩多少", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const dir = fileURLToPath(new URL("../../../../content/arenas/", import.meta.url));
    const docs = readdirSync(dir)
      .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
      .map((f) => JSON.parse(readFileSync(dir + f, "utf8")) as ArenaDoc)
      .filter((d) => (d as { schema?: string }).schema?.startsWith("arena"));
    expect(docs.length).toBeGreaterThan(3);
    const rows: string[] = [];
    for (let round = 1; round <= 8; round++) {
      const doc = docs[(round - 1) % docs.length]!;
      const def = arenaDefFromDoc(doc);
      const style = (doc as { groundStyle?: string }).groundStyle;
      const h = buildArena(scene, def, style);
      disposeArena(scene, h);
      rows.push(
        `R${round} mesh=${scene.meshes.length} mat=${scene.materials.length} tex=${scene.textures.length}` +
          `  MAT[${scene.materials.map((m) => m.name).join(",")}]` +
          `  TEX[${scene.textures.map((t) => (t.name || "?").split("/").pop()).join(",")}]`,
      );
    }
    console.log("\n" + rows.join("\n") + "\n");
    expect(rows.length).toBe(8);
  }, 300000);
});
