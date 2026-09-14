import type { FastifyInstance } from "fastify";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { HERO_MODEL_CLAIM_COLLECTIONS, MODEL_ACQUISITION_REGISTRY_PATH, heroBodyModelClaims, type HeroBodyModelClaims, type ModelAcquisitionEntry } from "@ggd/shared/content/heroForge/modelClaims";

/**
 * ⭐ GH#1188：「哪些英雄身體可以挑、哪些還在**待認領**」—— 後台與編輯器問的是同一題，都問這一支；
 * 判準只住 `@ggd/shared/content/heroForge/modelClaims.ts`（「設計過的英雄」有哪幾個集合、為什麼，寫在那裡）。
 *
 * ⛔ 2026-09-15 更正 991b02ed6 這裡原本寫的「只讀 `champions/`；把 `_legacy/champions` 算進去待認領顆數不變」——
 * 那句話只在「只看英雄卡身體鏈」的前提下成立；而 owner 的判準是英雄有沒有設計過（包含上架及未上架），
 * 要一起讀 `_legacy/champions`、`skins`、heroForge TS 與 repo 根的下載清單。
 *
 * ⛔ 壞掉的 JSON 不吞 —— 讓這支回 500，而不是靜靜少列幾顆。
 * ⚠️ 下載清單不在（例：容器沒有 `materials/`）⇒ 不擋，但回應的 `evidence.missing` 會列出它（畫面要說「可能多標」）。
 */
export function readHeroBodyModels(root: string, repoRoot: string): HeroBodyModelClaims {
  const documents: Array<[string, unknown]> = [];
  for (const collection of HERO_MODEL_CLAIM_COLLECTIONS) {
    const dir = join(root, collection);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).filter((file) => file.endsWith(".json") && !file.startsWith("_")).sort()) {
      const doc = JSON.parse(readFileSync(join(dir, name), "utf8")) as { id?: unknown };
      if (typeof doc.id === "string") documents.push([`${collection}/${doc.id}`, doc]);
    }
  }
  const registry = join(repoRoot, MODEL_ACQUISITION_REGISTRY_PATH);
  let entries: ModelAcquisitionEntry[] | null = null;
  if (existsSync(registry)) {
    const parsed = JSON.parse(readFileSync(registry, "utf8")) as { entries?: unknown };
    if (!Array.isArray(parsed.entries)) throw new Error(`${MODEL_ACQUISITION_REGISTRY_PATH} 沒有 entries 陣列。`);
    entries = parsed.entries as ModelAcquisitionEntry[];
  }
  return heroBodyModelClaims(documents, entries);
}

export function registerHeroBodyModelRoutes(app: FastifyInstance, root: string, repoRoot: string): void {
  app.get("/content-api/hero-body-models", async () => readHeroBodyModels(root, repoRoot));
}
