import type { FastifyInstance } from "fastify";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { heroBodyModels } from "@ggd/shared/content/heroForge/bodyModels";

/**
 * ⭐ GH#1188：「哪些英雄身體可以挑、哪些還在**待認領**」—— 後台與編輯器問的是同一題，
 * 判準只住 `@ggd/shared/content/heroForge/bodyModels.ts`（編輯器的 `catalog.ts` 與匯入器用同一支）。
 *
 * ⚠️ 只讀出貨樹的 `champions/`（⛔ 不含 `_legacy/`），與編輯器／匯入器看到的英雄卡集合相同；
 * 量到（2026-09-15）：把 `_legacy/champions` 也算進去，待認領的顆數不變。
 * ⛔ 壞掉的 JSON 不吞 —— 讓這支回 500，而不是靜靜少列幾顆。
 */
export function readHeroBodyModels(root: string): { ids: string[]; unclaimed: string[] } {
  const documents: Array<[string, unknown]> = [];
  for (const collection of ["champions", "models"]) {
    const dir = join(root, collection);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).filter((file) => file.endsWith(".json") && !file.startsWith("_")).sort()) {
      const doc = JSON.parse(readFileSync(join(dir, name), "utf8")) as { id?: unknown };
      if (typeof doc.id === "string") documents.push([`${collection}/${doc.id}`, doc]);
    }
  }
  return heroBodyModels(documents);
}

export function registerHeroBodyModelRoutes(app: FastifyInstance, root: string): void {
  app.get("/content-api/hero-body-models", async () => readHeroBodyModels(root));
}
