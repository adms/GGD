import Fastify, { type FastifyInstance } from "fastify";
import { buildAuthoringProcessor } from "@ggd/shared/content/import/authoringProcessor";
import { HERO_IMPORT_PREFIX, heroImportBodyDigest, verifyHeroImport } from "@ggd/shared/content/node/heroImportAuth";
import { registerImportRoutes } from "./importRoutes";

export interface HeroImportServerOptions { contentDir: string; repoRoot: string; importDir: string; gameVersion: string; secret: string; logger?: boolean }
/** Production entry to the existing importer, scoped to immutable hero works.
 * No Editor CRUD, watcher, official apply/rollback or public listener mapping.
 */
export function buildHeroImportServer(opts: HeroImportServerOptions): FastifyInstance {
  if (opts.secret.length < 32 || !opts.gameVersion.trim()) throw new Error("Private hero import requires a secret of at least 32 characters and GGD_BUILD_STAMP.");
  buildAuthoringProcessor(opts.repoRoot); // Refuse incomplete deployment source trees.
  const app = Fastify({ logger: opts.logger ?? false, requestTimeout: 90000, connectionTimeout: 10000 });
  app.addHook("onRequest", async (req, reply) => {
    const headers = Object.fromEntries(Object.entries(req.headers).map(([name, value]) => [name, typeof value === "string" ? value : ""]));
    if (!verifyHeroImport(opts.secret, req.method, req.url, headers)) return reply.code(401).send({ message: "完整英雄匯入通道未通過驗證。" });
    const path = req.url.startsWith(HERO_IMPORT_PREFIX + "/") ? req.url.slice(HERO_IMPORT_PREFIX.length) : "";
    const allowed = req.method === "POST"
      ? ["/hero-package", "/inspect-hero-package", "/prepare-work"].includes(path)
      : req.method === "GET" && (path === "/active/target-profile" || /^\/work-versions\/[^/?]+\/[^/?]+(?:\/package|\/files\/[^?]+)?$/.test(path));
    if (!allowed) return reply.code(404).send({ message: "這個通道只處理完整英雄作品。" });
    if (req.method === "POST" && req.headers["content-type"]?.split(";")[0] !== "application/zip") return reply.code(415).send({ message: "完整英雄匯入需要 ZIP。" });
    reply.header("cache-control", "no-store").header("x-content-type-options", "nosniff");
  });
  app.addHook("preValidation", async (req, reply) => {
    const bytes = req.body === undefined ? new Uint8Array() : Buffer.isBuffer(req.body) ? req.body : null;
    if (!bytes || heroImportBodyDigest(bytes) !== req.headers["x-ggd-import-body"]) return reply.code(401).send({ message: "英雄匯入內容與簽章不同。" });
  });
  registerImportRoutes(app, { contentDir: opts.contentDir, repoRoot: opts.repoRoot, importDir: opts.importDir, gameVersion: opts.gameVersion, prefixes: [HERO_IMPORT_PREFIX], workOnly: true });
  return app;
}
