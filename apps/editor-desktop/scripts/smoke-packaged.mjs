import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const PRODUCT_NAME = "GGD Ability & VFX Editor";
const DEFAULT_SOURCE_URL = "https://ggd.adms.ai";

export function packagedExecutableCandidates(platform, distDir) {
  if (platform === "darwin") {
    return [
      join(distDir, "mac-universal", `${PRODUCT_NAME}.app`, "Contents", "MacOS", PRODUCT_NAME),
      join(distDir, "mac", `${PRODUCT_NAME}.app`, "Contents", "MacOS", PRODUCT_NAME),
    ];
  }
  if (platform === "win32") {
    return [join(distDir, "win-unpacked", `${PRODUCT_NAME}.exe`)];
  }
  throw new Error(`packaged smoke 僅支援 macOS / Windows；目前平台是 ${platform}`);
}

export function resolvePackagedExecutable({ platform, distDir, override }) {
  if (override) {
    const absolute = resolve(override);
    if (!existsSync(absolute)) throw new Error(`指定的 packaged executable 不存在：${absolute}`);
    return absolute;
  }
  const candidates = packagedExecutableCandidates(platform, distDir);
  const executable = candidates.find((candidate) => existsSync(candidate));
  if (!executable) {
    throw new Error([
      "找不到已封裝的 Editor executable。請先在目前平台執行 dist:mac 或 dist:win。",
      ...candidates.map((candidate) => `- ${candidate}`),
    ].join("\n"));
  }
  return executable;
}

export function parseSmokeReceipt(stdout) {
  for (const line of stdout.split(/\r?\n/u).reverse()) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const value = JSON.parse(trimmed);
      if (value?.schema !== "ggd-editor-desktop-smoke@1") continue;
      if (!Array.isArray(value.checks) || value.checks.length < 4) {
        throw new Error("smoke receipt 缺少必要 route checks");
      }
      const failed = value.checks.filter((check) => check?.status !== 200);
      if (failed.length > 0) {
        throw new Error(`smoke receipt 含失敗 route：${failed.map((check) => check?.path ?? "?").join("、")}`);
      }
      return value;
    } catch (error) {
      if (error instanceof SyntaxError) continue;
      throw error;
    }
  }
  throw new Error("packaged app 沒有輸出 ggd-editor-desktop-smoke@1 receipt");
}

export function parseCliArgs(argv) {
  const options = {
    sourceUrl: DEFAULT_SOURCE_URL,
    executable: undefined,
    keepUserData: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--keep-user-data") {
      options.keepUserData = true;
      continue;
    }
    for (const [flag, key] of [["--source-url", "sourceUrl"], ["--executable", "executable"]]) {
      if (arg === flag) {
        const value = argv[index + 1];
        if (!value || value.startsWith("--")) throw new Error(`${flag} 需要值`);
        options[key] = value;
        index += 1;
        break;
      }
      if (arg.startsWith(`${flag}=`)) {
        const value = arg.slice(flag.length + 1);
        if (!value) throw new Error(`${flag} 需要值`);
        options[key] = value;
        break;
      }
    }
    if (arg.startsWith("--") && arg !== "--keep-user-data" &&
      !arg.startsWith("--source-url=") && !arg.startsWith("--executable=") &&
      arg !== "--source-url" && arg !== "--executable") {
      throw new Error(`不支援的參數：${arg}`);
    }
    if (!arg.startsWith("--")) throw new Error(`不支援的位置參數：${arg}`);
  }
  const source = new URL(options.sourceUrl);
  if (source.protocol !== "https:" && source.protocol !== "http:") {
    throw new Error(`source URL 僅支援 http/https：${options.sourceUrl}`);
  }
  return options;
}

export async function runPackagedSmoke({
  platform = process.platform,
  distDir,
  sourceUrl = DEFAULT_SOURCE_URL,
  executable: override,
  keepUserData = false,
}) {
  const executable = resolvePackagedExecutable({ platform, distDir, override });
  const userDataDir = await mkdtemp(join(tmpdir(), "ggd-editor-packaged-smoke-"));
  const args = [
    `--source-url=${sourceUrl}`,
    "--smoke-test",
    `--user-data-dir=${userDataDir}`,
  ];
  process.stderr.write(`[packaged-smoke] ${executable}\n`);
  let stdout = "";
  let stderr = "";
  try {
    const result = await new Promise((resolveResult, reject) => {
      const child = spawn(executable, args, { shell: false, windowsHide: true });
      child.stdout.on("data", (chunk) => {
        const text = chunk.toString();
        stdout += text;
        process.stdout.write(text);
      });
      child.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        stderr += text;
        process.stderr.write(text);
      });
      child.once("error", reject);
      child.once("close", (code, signal) => resolveResult({ code, signal }));
    });
    if (result.code !== 0) {
      throw new Error(`packaged app smoke 失敗：exit=${result.code ?? "null"} signal=${result.signal ?? "none"}\n${stderr}`);
    }
    const appReceipt = parseSmokeReceipt(stdout);
    const receipt = {
      schema: "ggd-editor-packaged-smoke-runner@1",
      platform,
      executable,
      sourceUrl,
      appReceipt,
    };
    console.log(JSON.stringify(receipt));
    return receipt;
  } finally {
    if (keepUserData) {
      process.stderr.write(`[packaged-smoke] 保留 user-data：${userDataDir}\n`);
    } else {
      await rm(userDataDir, { recursive: true, force: true }).catch((error) => {
        process.stderr.write(`[packaged-smoke] 無法清除暫存 user-data：${String(error)}\n`);
      });
    }
  }
}

async function main() {
  const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const options = parseCliArgs(process.argv.slice(2));
  await runPackagedSmoke({
    platform: process.platform,
    distDir: join(appRoot, "dist"),
    sourceUrl: options.sourceUrl,
    executable: options.executable,
    keepUserData: options.keepUserData,
  });
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
