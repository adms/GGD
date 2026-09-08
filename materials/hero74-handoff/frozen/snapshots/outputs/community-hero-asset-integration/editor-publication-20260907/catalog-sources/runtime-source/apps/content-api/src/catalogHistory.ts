import type { FastifyInstance } from "fastify";
import { captureHeroCatalogVersion, HERO_CATALOG_WORK_ID } from "./catalogVersions";
import { ImportStore } from "./importStore";
import { retainHeroTemplates } from "./heroTemplateHistory";

/** Uses the existing importer object store; never changes official ACTIVE.
 * Before-write snapshots cover shared dependencies together with every hero,
 * including archived and incomplete authoring content. */
export class HeroCatalogHistory {
  readonly store: ImportStore;
  private previous?: string;
  constructor(readonly contentDir: string, storeDir: string, readonly gameRevision: string, readonly repoRoot?: string) {
    this.store = new ImportStore({ dir: storeDir });
  }
  capture() {
    try {
      this.previous ??= this.store.listWorkVersions(HERO_CATALOG_WORK_ID)[0]?.versionId;
      const result = captureHeroCatalogVersion(this.contentDir, this.store, {
        gameRevision: this.gameRevision, repoRoot: this.repoRoot, allowIncomplete: true, reuseUnchangedFrom: this.previous,
      });
      retainHeroTemplates(this.store, [...result.files].filter(([path]) => path.startsWith("catalog/ability-templates/") && !path.endsWith("/_index.json")).map(([, bytes]) => JSON.parse(new TextDecoder().decode(bytes))));
      this.previous = result.record.versionId;
      return result;
    } catch (cause) {
      throw Object.assign(new Error("完整英雄版本無法保存，未開始覆寫內容。請檢查版本儲存空間與檔案完整性。", { cause }), { statusCode: 503 });
    }
  }
  mount(app: FastifyInstance) {
    // Capture is an explicit mutation and inherits the normal dev write guard.
    app.post("/content-api/hero-catalog/versions/capture", async (_req, reply) => {
      const result = this.capture();
      return reply.send({ version: result.record, heroes: result.manifest.heroes, incomplete: result.manifest.incomplete ?? null });
    });
    app.get<{ Querystring: { cursor?: string } }>("/content-api/hero-catalog/versions", async (req, reply) => {
      const records = this.store.listWorkVersions(HERO_CATALOG_WORK_ID);
      const start = req.query.cursor ? records.findIndex((record) => record.versionId === req.query.cursor) : 0;
      if (start < 0) return reply.code(404).send({ error: "找不到此歷史游標。" });
      return reply.send({ items: records.slice(start, start + 50).map((record) => ({ versionId: record.versionId, snapshotDigest: record.snapshotDigest, createdAt: record.createdAt, fileCount: record.files.length, bytes: record.files.reduce((total, fact) => total + fact.bytes, 0) })), nextCursor: records[start + 50]?.versionId ?? null });
    });
    app.get<{ Params: { version: string } }>("/content-api/hero-catalog/versions/:version", async (req, reply) => {
      if (!/^sha256:[a-f0-9]{64}$/.test(req.params.version)) return reply.code(400).send({ error: "完整版本編號不合法。" });
      const bytes = this.store.readWorkFile(HERO_CATALOG_WORK_ID, req.params.version, "catalog-version.json");
      if (!bytes) return reply.code(404).send({ error: "找不到此完整版本。" });
      return reply.type("application/json").send(bytes);
    });
  }
}
