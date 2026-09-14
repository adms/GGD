import { afterEach, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildServer } from "./server";

/** ⭐ GH#1188：content-api 回的「可挑／待認領」就是 `heroBodyModels` 對出貨樹的答案（後台之後接這一支）。 */
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

it("GET /content-api/hero-body-models：只有沒被任何英雄卡身體鏈指到的可挑模型標成待認領", async () => {
  const root = mkdtempSync(join(tmpdir(), "ggd-model-claims-")); roots.push(root);
  const content = join(root, "content"), write = (path: string, doc: object) => { mkdirSync(join(content, path, ".."), { recursive: true }); writeFileSync(join(content, path), JSON.stringify(doc)); };
  const model = (id: string) => ({ id, schema: "model@1", glbPath: `assets/models/${id}.glb`, scale: 1, collisionRadius: 0.5, heroBody: true, clipMap: { idle: "i", run: "r", attack: "a", cast: "c", hurt: "h", death: "d" } });
  for (const id of ["waiting", "source"]) write(`models/${id}.json`, model(id));
  write("champions/versioned.json", { id: "versioned", modelKey: "version.body.x", modelVersions: [{ modelKey: "version.body.x", sourceModelKey: "source" }] });
  const app = buildServer({ contentDir: content, backupDir: join(root, "backups"), repoRoot: resolve(__dirname, "../../..") });
  try {
    const response = await app.inject({ url: "/content-api/hero-body-models" });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({ ids: ["source", "waiting"], unclaimed: ["waiting"] });
  } finally { await app.close(); }
});
