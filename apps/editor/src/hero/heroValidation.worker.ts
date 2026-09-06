import { validateHero } from "./validation";
import type { HeroCatalog } from "./catalog";
self.onmessage = (event: MessageEvent<{ request: number; project: unknown; catalog: HeroCatalog; playground?: Parameters<typeof validateHero>[2] }>) => {
  const { request, project, catalog, playground } = event.data;
  self.postMessage({ request, result: validateHero(project, catalog, playground) });
};
