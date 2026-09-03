#!/usr/bin/env node

/**
 * One-shot loopback receiver for the VFX Forge browser proof.
 *
 * Blob downloads are intentionally browser-owned and awkward to automate.
 * This receiver gives the local Editor a narrow, auditable POST destination:
 * random path token, exact Origin, bounded JSON, one write, then shutdown.
 */
import { randomBytes } from "node:crypto";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
const valueAfter = (flag, fallback = null) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
};
const outputArg = valueAfter("--out");
if (!outputArg) {
  console.error("FAIL --out PATH is required");
  process.exit(2);
}
const output = resolve(process.cwd(), outputArg);
const origin = valueAfter("--origin", "http://127.0.0.1:5174");
const allowPartial = args.includes("--allow-partial");
const requestedPort = Number(valueAfter("--port", "0"));
if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65_535) {
  console.error("FAIL --port must be 0..65535");
  process.exit(2);
}
const token = randomBytes(24).toString("hex");
const route = `/proof/${token}`;
const limit = 128 * 1024 * 1024;
let settled = false;

const server = createServer((request, response) => {
  const requestOrigin = request.headers.origin;
  if (requestOrigin !== origin || request.url !== route) {
    response.writeHead(403).end("forbidden");
    return;
  }
  const cors = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
  if (request.method === "OPTIONS") {
    response.writeHead(204, cors).end();
    return;
  }
  if (request.method !== "POST" || settled) {
    response.writeHead(settled ? 409 : 405, cors).end(settled ? "already received" : "method not allowed");
    return;
  }
  const chunks = [];
  let bytes = 0;
  request.on("data", (chunk) => {
    bytes += chunk.length;
    if (bytes > limit) request.destroy(new Error("proof exceeds 128 MiB"));
    else chunks.push(chunk);
  });
  request.on("error", (error) => {
    if (!response.headersSent) response.writeHead(413, cors).end(String(error));
  });
  request.on("end", () => {
    try {
      const body = Buffer.concat(chunks).toString("utf8");
      const parsed = JSON.parse(body);
      const cases = Array.isArray(parsed?.cases) ? parsed.cases : [];
      const fullShape = parsed?.themes === 42 && parsed?.documents === 46 && cases.length === 46;
      const partialShape = allowPartial &&
        Number.isInteger(parsed?.themes) && parsed.themes > 0 && parsed.themes <= 42 &&
        Number.isInteger(parsed?.documents) && parsed.documents > 0 && parsed.documents <= 46 &&
        parsed.documents === cases.length;
      if (parsed?.schema !== "ggd-editor-basic-visual-proof@1" || (!fullShape && !partialShape)) {
        throw new Error("proof header/count mismatch");
      }
      mkdirSync(dirname(output), { recursive: true });
      const temporary = `${output}.tmp-${process.pid}`;
      writeFileSync(temporary, `${JSON.stringify(parsed, null, 2)}\n`, { flag: "wx" });
      renameSync(temporary, output);
      settled = true;
      response.writeHead(201, { ...cors, "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true, output, bytes }));
      console.log(JSON.stringify({ schema: "ggd-editor-proof-received@1", output, bytes }));
      server.close();
    } catch (error) {
      response.writeHead(400, cors).end(String(error));
    }
  });
});

server.listen(requestedPort, "127.0.0.1", () => {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("loopback receiver did not bind TCP");
  console.log(JSON.stringify({
    schema: "ggd-editor-proof-receiver@1",
    sinkUrl: `http://127.0.0.1:${address.port}${route}`,
    origin,
    output,
    maxBytes: limit,
    allowPartial,
  }));
});
