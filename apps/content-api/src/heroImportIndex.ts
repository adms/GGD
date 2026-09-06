import { resolve } from "node:path";
import { buildHeroImportServer } from "./heroImportServer";

const repoRoot = resolve(import.meta.dirname, "../../..");
const server = buildHeroImportServer({
  repoRoot,
  contentDir: process.env.GGD_CONTENT_DIR ?? resolve(repoRoot, "content"),
  importDir: process.env.GGD_HERO_IMPORT_DIR ?? resolve(repoRoot, "data/content-import"),
  gameVersion: process.env.GGD_BUILD_STAMP ?? "",
  secret: process.env.GGD_HERO_IMPORT_SECRET ?? "",
  logger: true,
});
await server.listen({ host: process.env.HOST ?? "127.0.0.1", port: Number(process.env.PORT ?? 8788) });
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { void server.close(); });
