#!/usr/bin/env node

/**
 * One-command browser framebuffer proof pipeline.
 *
 * It starts the Editor dev servers only when needed, opens the real VFX Forge
 * QA route, lets the page drive SimWorld/WebGL capture, receives the result on
 * a random loopback-only URL, then imports/audits it. Gemini is advisory and
 * optional: the command always degrades cleanly when no API key is configured.
 */
import { copyFileSync, existsSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const args = process.argv.slice(2);

function valueAfter(flag, fallback = null) {
  const index = args.indexOf(flag);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

if (args.includes("--help")) {
  console.log(`Usage: pnpm editor:proof:capture [options]

  --ids a,b,c       Capture only selected 42/46 ability documents, then merge
  --origin URL      Loopback Editor origin (default http://127.0.0.1:5174)
  --out PATH        Raw receiver output (full run defaults to canonical proof)
  --timeout-ms N    Whole browser capture timeout (default 1200000)
  --no-open         Print the QA URL instead of opening the default browser
  --no-import       Stop after receiving/merging browser proof
  --no-gemini       Skip optional Gemini temporal triage

The command auto-starts pnpm dev:editor if the origin is not already serving.
Images are accepted only by a random localhost receiver. Gemini failure or a
missing key never fails the deterministic browser/import pipeline.`);
  process.exit(0);
}

const origin = new URL(valueAfter("--origin", "http://127.0.0.1:5174"));
if (origin.protocol !== "http:" || (origin.hostname !== "127.0.0.1" && origin.hostname !== "localhost")) {
  throw new Error("--origin must be a plain HTTP loopback URL");
}
origin.pathname = "";
origin.search = "";
origin.hash = "";

const ids = (valueAfter("--ids", "") ?? "").split(",").map((id) => id.trim()).filter(Boolean);
const focused = ids.length > 0;
const canonicalProof = resolve(root, "docs/_reports/editor-skill-basic-visual-proof.browser.json");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const rawOutput = resolve(valueAfter(
  "--out",
  focused ? resolve(tmpdir(), `ggd-editor-proof-${timestamp}.json`) : canonicalProof,
));
const timeoutMs = Number(valueAfter("--timeout-ms", "1200000"));
if (!Number.isInteger(timeoutMs) || timeoutMs < 30_000 || timeoutMs > 3_600_000) {
  throw new Error("--timeout-ms must be an integer between 30000 and 3600000");
}

let devServer = null;
let devTail = "";

function rememberDevOutput(chunk) {
  devTail = `${devTail}${String(chunk)}`.slice(-12_000);
}

function stopDevServer() {
  if (!devServer?.pid) return;
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(devServer.pid), "/t", "/f"], { stdio: "ignore" });
    } else {
      process.kill(-devServer.pid, "SIGTERM");
    }
  } catch {
    // The server may already have ended; cleanup is best effort.
  }
  devServer = null;
}

process.once("exit", stopDevServer);
process.once("SIGINT", () => { stopDevServer(); process.exit(130); });
process.once("SIGTERM", () => { stopDevServer(); process.exit(143); });

const forgeUrl = new URL("/editor/vfx-forge", origin);

async function editorIsServing() {
  try {
    const response = await fetch(forgeUrl, { signal: AbortSignal.timeout(3_000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureEditor() {
  if (await editorIsServing()) return;
  console.log("[editor-proof] Editor 未啟動；暫時啟動 pnpm dev:editor");
  devServer = spawn("pnpm", ["dev:editor"], {
    cwd: root,
    detached: process.platform !== "win32",
    env: { ...process.env, FORCE_COLOR: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  devServer.stdout?.on("data", rememberDevOutput);
  devServer.stderr?.on("data", rememberDevOutput);
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (devServer.exitCode !== null) break;
    if (await editorIsServing()) return;
    await new Promise((done) => setTimeout(done, 1_000));
  }
  throw new Error(`Editor dev server did not become ready.\n${devTail}`);
}

function run(label, command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    env: { ...process.env, FORCE_COLOR: "0" },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim().split(/\r?\n/).slice(-80).join("\n");
    throw new Error(`${label} failed\n${output}`);
  }
  console.log(`[editor-proof] PASS ${label}`);
}

function firstJsonLine(child) {
  return new Promise((resolveLine, rejectLine) => {
    let buffer = "";
    const onData = (chunk) => {
      buffer += String(chunk);
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      const line = buffer.slice(0, newline).trim();
      try {
        resolveLine(JSON.parse(line));
      } catch (error) {
        rejectLine(new Error(`receiver did not emit JSON: ${line}\n${String(error)}`));
      }
    };
    child.stdout?.on("data", onData);
    child.once("error", rejectLine);
    child.once("exit", (code) => {
      if (buffer.trim() === "") rejectLine(new Error(`receiver exited before ready (${String(code)})`));
    });
  });
}

function waitForExit(child, deadlineMs) {
  return new Promise((resolveExit, rejectExit) => {
    let stderr = "";
    child.stderr?.on("data", (chunk) => { stderr = `${stderr}${String(chunk)}`.slice(-12_000); });
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      rejectExit(new Error(`browser proof timed out after ${deadlineMs}ms`));
    }, deadlineMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      rejectExit(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolveExit();
      else rejectExit(new Error(`receiver exited ${String(code)}\n${stderr}`));
    });
  });
}

function openBrowser(url) {
  if (args.includes("--no-open")) {
    console.log(`[editor-proof] 請在瀏覽器開啟：${url}`);
    return;
  }
  const invocation = process.platform === "darwin"
    ? ["open", [url]]
    : process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : ["xdg-open", [url]];
  const result = spawnSync(invocation[0], invocation[1], { stdio: "ignore" });
  if (result.status !== 0) {
    throw new Error(`cannot open the default browser; retry with --no-open and open this URL manually:\n${url}`);
  }
}

async function main() {
  await ensureEditor();
  const receiverArgs = [
    resolve(root, "tools/editor-acceptance/proof-receiver.mjs"),
    "--out", rawOutput,
    "--origin", origin.origin,
  ];
  if (focused) receiverArgs.push("--allow-partial");
  const receiver = spawn(process.execPath, receiverArgs, {
    cwd: root,
    env: { ...process.env, FORCE_COLOR: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const ready = await firstJsonLine(receiver);
  if (ready?.schema !== "ggd-editor-proof-receiver@1" || typeof ready.sinkUrl !== "string") {
    receiver.kill("SIGTERM");
    throw new Error("proof receiver emitted an invalid readiness receipt");
  }

  const qaUrl = new URL(forgeUrl);
  qaUrl.searchParams.set("qa", "accept-46");
  qaUrl.searchParams.set("proofSink", ready.sinkUrl);
  if (focused) qaUrl.searchParams.set("ids", ids.join(","));
  console.log(`[editor-proof] 真 Renderer 擷取開始：${focused ? `${ids.length} 份聚焦技能` : "42 主題／46 份技能"}`);
  openBrowser(qaUrl.toString());
  await waitForExit(receiver, timeoutMs);
  console.log(`[editor-proof] 收到 browser framebuffer：${rawOutput}`);

  if (focused) {
    if (!existsSync(canonicalProof)) throw new Error("focused capture requires the existing canonical 46-document proof");
    const merged = `${canonicalProof}.next-${process.pid}`;
    run("focused proof merge", "pnpm", [
      "editor:proof:merge", "--", "--base", canonicalProof, "--patch", rawOutput, "--out", merged,
    ]);
    renameSync(merged, canonicalProof);
  } else if (rawOutput !== canonicalProof) {
    copyFileSync(rawOutput, canonicalProof);
  }

  if (!args.includes("--no-import")) {
    run("framebuffer proof import", "pnpm", ["skillforge:visual-proof:import", "--", canonicalProof]);
    run("42/46 acceptance audit", "pnpm", ["skillforge:audit"]);
    if (!args.includes("--no-gemini")) {
      const geminiArgs = ["vfx:review:temporal", "--", "--optional"];
      if (focused) geminiArgs.push("--ids", ids.join(","));
      run("optional Gemini temporal triage", "pnpm", geminiArgs);
    }
  }
  console.log(`[editor-proof] COMPLETE ${basename(canonicalProof)}；Gemini 僅供分流，人工視覺批核仍必須完成`);
}

main().catch((error) => {
  console.error(`[editor-proof] FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}).finally(stopDevServer);
