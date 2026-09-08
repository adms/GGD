import type { FastifyInstance } from "fastify";
import { ZIP_LIMITS } from "@ggd/shared/content/import/zipSafety";

/** The selected trusted game site remains the authority for every cloud write. */
export function registerDesktopPlatformBridge(app: FastifyInstance, platformOrigin: string | null, fetchImpl: typeof fetch = fetch, editorOrigin?: () => string): void {
  for (const type of ["application/octet-stream", "image/png", "image/jpeg", "image/webp", "application/zip"]) {
    if (!app.hasContentTypeParser(type)) app.addContentTypeParser(type, { parseAs: "buffer", bodyLimit: ZIP_LIMITS.maxArchiveCompressedBytes }, (_request, body, done) => done(null, body));
  }
  app.route({ method: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], url: "/api/v1/*", bodyLimit: ZIP_LIMITS.maxArchiveCompressedBytes,
    handler: async (request, reply) => {
      if (request.headers.origin && editorOrigin && request.headers.origin !== editorOrigin()) return reply.code(403).send({ message: "只接受目前桌面視窗的平台請求。" });
      if (!platformOrigin) return reply.code(503).send({ code: "DESKTOP_PLATFORM_UNSET", message: "請在「更換資料來源」選擇遊戲網站，再登入同步或投稿。本機草稿仍可編輯。" });
      const url = new URL(request.raw.url ?? request.url, platformOrigin);
      if (url.origin !== platformOrigin || !url.pathname.startsWith("/api/v1/")) return reply.code(400).send({ message: "平台請求路徑無效。" });
      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers)) {
        if ((["authorization", "cookie", "content-type", "if-match", "if-none-match"].includes(name) || name.startsWith("x-ggd-")) && typeof value === "string") headers.set(name, value);
      }
      let body: Buffer | string | undefined;
      if (!["GET", "HEAD"].includes(request.method) && request.body !== undefined) body = Buffer.isBuffer(request.body) ? request.body : typeof request.body === "string" ? request.body : JSON.stringify(request.body);
      try {
        const result = await fetchImpl(url, { method: request.method, headers, body: Buffer.isBuffer(body) ? Uint8Array.from(body) : body, redirect: "error", signal: AbortSignal.timeout(90_000) });
        reply.code(result.status);
        for (const name of ["content-type", "etag", "retry-after"]) { const value = result.headers.get(name); if (value) reply.header(name, value); }
        reply.header("cache-control", "no-store");
        const cookies = result.headers.getSetCookie();
        if (cookies.length) reply.header("set-cookie", cookies);
        if (!result.body) return reply.send();
        const reader = result.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
        try {
          while (true) {
            const next = await reader.read(); if (next.done) break;
            bytes += next.value.length;
            if (bytes > ZIP_LIMITS.maxArchiveCompressedBytes) throw new Error("平台回應超出大小限制。");
            chunks.push(next.value);
          }
        } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
        return reply.send(Buffer.concat(chunks));
      } catch (error) { return reply.code(502).send({ code: "DESKTOP_PLATFORM_UNAVAILABLE", message: `目前無法連線平台；本機修改仍保留。${error instanceof Error ? error.message : String(error)}` }); }
    },
  });
}
