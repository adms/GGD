import { resolve } from "node:path";
import { buildHeroImportServer } from "./heroImportServer";

const repoRoot = resolve(import.meta.dirname, "../../..");
if (!process.env.GGD_PLATFORM_URL) throw new Error("Private hero import requires GGD_PLATFORM_URL to capture the same content overlay as the game.");
const server = buildHeroImportServer({
  repoRoot,
  contentDir: process.env.GGD_CONTENT_DIR ?? resolve(repoRoot, "content"),
  importDir: process.env.GGD_HERO_IMPORT_DIR ?? resolve(repoRoot, "data/content-import"),
  gameVersion: process.env.GGD_BUILD_STAMP ?? "",
  secret: process.env.GGD_HERO_IMPORT_SECRET ?? "",
  platformUrl: process.env.GGD_PLATFORM_URL,
  logger: true,
});
await server.listen({ host: process.env.HOST ?? "127.0.0.1", port: Number(process.env.PORT ?? 8788) });
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { void server.close(); });
