/**
 * Entry point. DEV ONLY — hard-refuses NODE_ENV=production (the production
 * stack serves content/ as static files through nginx; this service is never
 * deployed there).
 *
 * It also refuses to BIND anywhere but loopback. The write guard (guard.ts)
 * already rejects non-loopback peers, but listening on 0.0.0.0 would still
 * expose the read + SSE surface of a RW service to the whole LAN, and it would
 * leave the guard as the only thing standing between a phone on the wifi and
 * the content tree. Two independent defences beat one. Override HOST only with
 * a loopback address; anything else exits.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildServer } from "./server";
import { isLoopbackHost } from "./guard";

const here = dirname(fileURLToPath(import.meta.url));

if (process.env.NODE_ENV === "production") {
  console.error("content-api refuses to start in production");
  process.exit(1);
}

const contentDir = process.env.GGD_CONTENT_DIR ?? join(here, "../../../content");
const backupDir = process.env.GGD_CONTENT_BACKUP_DIR ?? join(here, "../../../data/content-backups");
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";

if (!isLoopbackHost(host)) {
  console.error(
    `content-api refuses to bind HOST="${host}" — it is a DEV-ONLY read-write service and ` +
      "may only listen on loopback (127.0.0.1 / ::1 / localhost).",
  );
  process.exit(1);
}

const app = buildServer({ contentDir, backupDir, watch: true, logger: true });

app
  .listen({ port, host })
  .then(() => {
    console.log(`content-api (dev-only) on http://${host}:${port}/content-api`);
    console.log(`content-api undo store: ${app.backupDir}`);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
