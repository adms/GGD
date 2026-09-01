import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { buildServer } from "../../content-api/src/server";
import { addAllowedOrigins } from "../../content-api/src/guard";
import {
  EDITOR_DESKTOP_SOURCE_SCHEMA,
  type EditorDesktopSourceInfo,
} from "@ggd/shared/editorDesktop";
import {
  contentDirForRemoteWorkspace,
  normalizeRemoteSource,
  remoteWorkspaceKey,
  remoteWorkspacePolicy,
  syncRemoteWorkspace,
  type RemoteWorkspacePolicy,
} from "./remoteWorkspace";

const SOURCE_CONFIG_SCHEMA = "ggd-editor-source-config@1" as const;

type SourceConfig =
  | { schema: typeof SOURCE_CONFIG_SCHEMA; kind: "local"; workspacePath: string }
  | { schema: typeof SOURCE_CONFIG_SCHEMA; kind: "remote"; sourceUrl: string; workspacePath: string };

const MIME: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".bin": "application/octet-stream",
};

function validWorkspace(root: string): boolean {
  return existsSync(join(root, "content", "manifest.json")) && existsSync(join(root, "package.json"));
}

function configFile(): string {
  return join(app.getPath("userData"), "source.json");
}

function persistConfig(config: SourceConfig): void {
  mkdirSync(app.getPath("userData"), { recursive: true });
  writeFileSync(configFile(), `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function readPersistedConfig(policy: RemoteWorkspacePolicy): SourceConfig | null {
  try {
    const value = JSON.parse(readFileSync(configFile(), "utf8")) as SourceConfig;
    if (value.schema !== SOURCE_CONFIG_SCHEMA) return null;
    if (value.kind === "local" && validWorkspace(resolve(value.workspacePath))) {
      return { ...value, workspacePath: resolve(value.workspacePath) };
    }
    if (value.kind === "remote" && typeof value.sourceUrl === "string" && value.workspacePath) {
      normalizeRemoteSource(value.sourceUrl, policy);
      return { ...value, workspacePath: resolve(value.workspacePath) };
    }
  } catch {
    // The setup screen will repair a missing or obsolete preference.
  }

  // One-time migration from the V0 folder-only preference.
  try {
    const old = JSON.parse(readFileSync(join(app.getPath("userData"), "workspace.json"), "utf8")) as { workspace?: unknown };
    if (typeof old.workspace === "string" && validWorkspace(resolve(old.workspace))) {
      const migrated: SourceConfig = { schema: SOURCE_CONFIG_SCHEMA, kind: "local", workspacePath: resolve(old.workspace) };
      persistConfig(migrated);
      return migrated;
    }
  } catch {
    // First launch.
  }
  return null;
}

function setupHtml(policy: RemoteWorkspacePolicy): string {
  const hosts = policy.allowedHosts.join("、");
  return `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>GGD Editor 資料來源</title>
<style>
:root{color-scheme:dark;font:15px system-ui,sans-serif;background:#11141a;color:#e7eaf0}*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at top,#232b38,#11141a 65%)}
main{width:min(680px,calc(100vw - 40px));padding:32px;border:1px solid #364052;border-radius:14px;background:#191e27;box-shadow:0 20px 70px #0008}
h1{margin:0 0 10px;font-size:24px}p{color:#aeb6c5;line-height:1.65}.card{margin-top:20px;padding:18px;border:1px solid #343d4c;border-radius:10px;background:#141820}
label{display:block;margin-bottom:8px;color:#f0bd69}input{width:100%;padding:11px;border:1px solid #465269;border-radius:7px;background:#0e1117;color:#fff;font:inherit}
.actions{display:flex;gap:10px;margin-top:14px}button{padding:10px 14px;border:1px solid #526079;border-radius:7px;background:#252c38;color:#eef1f7;font:inherit;cursor:pointer}
button.primary{border-color:#d79738;background:#9a5c16}button:disabled{opacity:.45;cursor:wait}.note{font-size:12px;color:#858fa0}.status{min-height:22px;margin:12px 0 0;color:#ffb3a8}
</style></head><body><main>
<h1>選擇參考資料來源</h1>
<p>線上資料只作為唯讀 Base；你的修改、備份、素材快取與 JSON／ZIP 全部留在這台電腦。</p>
<section class="card"><label for="url">遊戲網站 URL</label>
<input id="url" value="https://ggd.adms.ai" spellcheck="false" autocomplete="off">
<div class="actions"><button id="remote" class="primary">使用線上正式站</button><button id="local">使用本機 GGD 專案</button></div>
<p class="note">第一次會下載 JSON Base；3D 模型和貼圖只在預覽時下載。允許來源：${hosts}。Base 上限 ${Math.round(policy.maxBundleBytes / 1024 / 1024)} MB，單一素材上限 ${Math.round(policy.maxAssetBytes / 1024 / 1024)} MB。</p>
<p id="status" class="status"></p></section>
</main><script>
const status=document.getElementById('status');const buttons=[...document.querySelectorAll('button')];
function busy(v){buttons.forEach(b=>b.disabled=v)}
document.getElementById('remote').onclick=async()=>{busy(true);status.textContent='正在設定本機工作區…';const r=await window.ggdSetup.useRemote(document.getElementById('url').value);if(!r.ok){status.textContent=r.error;busy(false)}};
document.getElementById('local').onclick=async()=>{busy(true);const r=await window.ggdSetup.useLocal();if(!r.ok){status.textContent=r.error||'已取消';busy(false)}};
</script></body></html>`;
}

async function chooseSource(policy: RemoteWorkspacePolicy): Promise<SourceConfig | null> {
  const explicitWorkspace = app.commandLine.getSwitchValue("workspace");
  if (explicitWorkspace && validWorkspace(resolve(explicitWorkspace))) {
    return { schema: SOURCE_CONFIG_SCHEMA, kind: "local", workspacePath: resolve(explicitWorkspace) };
  }
  const explicitUrl = app.commandLine.getSwitchValue("source-url");
  if (explicitUrl) {
    const normalized = normalizeRemoteSource(explicitUrl, policy);
    const workspacePath = join(app.getPath("userData"), "workspaces", remoteWorkspaceKey(normalized.sourceUrl, policy));
    return { schema: SOURCE_CONFIG_SCHEMA, kind: "remote", sourceUrl: normalized.sourceUrl, workspacePath };
  }
  if (!app.commandLine.hasSwitch("choose-source")) {
    const persisted = readPersistedConfig(policy);
    if (persisted) return persisted;
  }

  return await new Promise<SourceConfig | null>((resolveSelection) => {
    let settled = false;
    let setupWindow: BrowserWindow | null = null;
    const settle = (value: SourceConfig | null): void => {
      if (settled) return;
      settled = true;
      setTimeout(() => {
        if (setupWindow && !setupWindow.isDestroyed()) setupWindow.close();
        resolveSelection(value);
      }, 25);
    };
    const window = setupWindow = new BrowserWindow({
      width: 760,
      height: 600,
      resizable: false,
      title: "GGD Editor 資料來源",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: join(__dirname, "preload.cjs"),
      },
    });

    ipcMain.handle("ggd-setup:remote", async (_event, input: unknown) => {
      try {
        const normalized = normalizeRemoteSource(String(input ?? ""), policy);
        const value: SourceConfig = {
          schema: SOURCE_CONFIG_SCHEMA,
          kind: "remote",
          sourceUrl: normalized.sourceUrl,
          workspacePath: join(app.getPath("userData"), "workspaces", remoteWorkspaceKey(normalized.sourceUrl, policy)),
        };
        persistConfig(value);
        settle(value);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    });
    ipcMain.handle("ggd-setup:local", async () => {
      const result = await dialog.showOpenDialog(window, {
        title: "選擇 GGD 專案資料夾",
        properties: ["openDirectory", "createDirectory"],
        message: "請選擇內含 content/manifest.json 與 package.json 的 GGD 專案。",
      });
      if (result.canceled || result.filePaths.length !== 1) return { ok: false, error: "已取消" };
      const workspacePath = resolve(result.filePaths[0]!);
      if (!validWorkspace(workspacePath)) return { ok: false, error: "這不是可用的 GGD 專案" };
      const value: SourceConfig = { schema: SOURCE_CONFIG_SCHEMA, kind: "local", workspacePath };
      persistConfig(value);
      settle(value);
      return { ok: true };
    });
    ipcMain.handle("ggd-setup:cancel", async () => { settle(null); return { ok: true }; });
    window.on("closed", () => settle(null));
    void window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(setupHtml(policy))}`);
  }).finally(() => {
    ipcMain.removeHandler("ggd-setup:remote");
    ipcMain.removeHandler("ggd-setup:local");
    ipcMain.removeHandler("ggd-setup:cancel");
  });
}

function rendererRoot(): string {
  return app.isPackaged
    ? join(process.resourcesPath, "editor")
    : resolve(__dirname, "../../editor/dist");
}

function adminRoot(): string {
  return app.isPackaged
    ? join(process.resourcesPath, "admin")
    : resolve(__dirname, "../../admin/dist");
}

async function start(): Promise<void> {
  const policy = remoteWorkspacePolicy();
  const config = await chooseSource(policy);
  if (!config) { app.quit(); return; }

  let contentDir: string;
  let dataRoot: string;
  let remoteContentBaseUrl: string | null = null;
  let sourceInfo: EditorDesktopSourceInfo;
  if (config.kind === "remote") {
    sourceInfo = await syncRemoteWorkspace({
      sourceInput: config.sourceUrl,
      workspaceRoot: config.workspacePath,
      policy,
    });
    remoteContentBaseUrl = sourceInfo.contentBaseUrl;
    contentDir = contentDirForRemoteWorkspace(config.workspacePath);
    dataRoot = join(config.workspacePath, "data");
  } else {
    contentDir = join(config.workspacePath, "content");
    dataRoot = join(config.workspacePath, "data");
    const manifest = JSON.parse(readFileSync(join(contentDir, "manifest.json"), "utf8")) as { contentVersion?: unknown };
    const version = typeof manifest.contentVersion === "string" ? manifest.contentVersion : null;
    sourceInfo = {
      schema: EDITOR_DESKTOP_SOURCE_SCHEMA,
      kind: "local",
      state: "local",
      sourceUrl: null,
      contentBaseUrl: null,
      workspacePath: config.workspacePath,
      pinnedContentVersion: version,
      latestRemoteContentVersion: version,
      workingContentVersion: version,
      offline: false,
      conflicts: [],
      compatibilityWarnings: [],
      contractStatus: "local-content-api",
      targetProfileDigest: null,
      message: "使用本機 GGD 專案",
    };
  }

  const initialWorkingContentVersion = sourceInfo.workingContentVersion;
  const currentSourceInfo = (): EditorDesktopSourceInfo => {
    let workingContentVersion = sourceInfo.workingContentVersion;
    try {
      const manifest = JSON.parse(readFileSync(join(contentDir, "manifest.json"), "utf8")) as { contentVersion?: unknown };
      workingContentVersion = typeof manifest.contentVersion === "string" ? manifest.contentVersion : null;
    } catch {
      // Keep the last verified value; the content-api will report the actual read error elsewhere.
    }
    const locallyChanged = sourceInfo.kind === "remote"
      && sourceInfo.state === "current"
      && workingContentVersion !== initialWorkingContentVersion;
    return {
      ...sourceInfo,
      workingContentVersion,
      state: locallyChanged ? "local-changes" : sourceInfo.state,
      message: locallyChanged ? "線上 Base 已固定；目前有尚未匯出的本機修改" : sourceInfo.message,
    };
  };

  const server = buildServer({
    contentDir,
    backupDir: join(dataRoot, "content-backups"),
    watch: true,
    logger: false,
    allowProduction: true,
    reviewDir: join(dataRoot, "editor-review"),
    externalProfileHosts: policy.allowedHosts,
    desktopSource: currentSourceInfo,
    ...(remoteContentBaseUrl ? {
      remoteAssets: {
        contentBaseUrl: remoteContentBaseUrl,
        cacheDir: join(config.workspacePath, "cache", "assets"),
        maxAssetBytes: policy.maxAssetBytes,
        timeoutMs: policy.requestTimeoutMs,
      },
    } : {}),
  });
  const editorFiles = rendererRoot();
  const adminFiles = adminRoot();
  server.get("/editor", async (_req, reply) => reply.redirect("/editor/"));
  server.get<{ Params: { "*": string } }>("/editor/*", async (req, reply) => {
    const requested = req.params["*"] || "index.html";
    const candidate = resolve(editorFiles, requested);
    const confined = candidate === editorFiles || candidate.startsWith(editorFiles + sep);
    const file = confined && existsSync(candidate) ? candidate : join(editorFiles, "index.html");
    return reply.type(MIME[extname(file)] ?? "application/octet-stream").send(await readFile(file));
  });
  server.get("/admin", async (_req, reply) => reply.redirect("/admin/"));
  server.get<{ Params: { "*": string } }>("/admin/*", async (req, reply) => {
    const requested = req.params["*"] || "index.html";
    const candidate = resolve(adminFiles, requested);
    const confined = candidate === adminFiles || candidate.startsWith(adminFiles + sep);
    const file = confined && existsSync(candidate) ? candidate : join(adminFiles, "index.html");
    return reply.type(MIME[extname(file)] ?? "application/octet-stream").send(await readFile(file));
  });
  // The packaged admin reads JSON/assets through `/content/*`; keep it read-only
  // and confined to the selected local working tree.
  server.get<{ Params: { "*": string } }>("/content/*", async (req, reply) => {
    const rel = req.params["*"] ?? "";
    const segments = rel.split("/");
    if (rel === "" || segments.some((part) => part === "" || part === "." || part === ".." || part.includes("\0"))) {
      return reply.code(400).send({ error: "invalid content path" });
    }
    const file = resolve(contentDir, rel);
    if (file !== contentDir && !file.startsWith(contentDir + sep)) return reply.code(400).send({ error: "path escapes content root" });
    if (!existsSync(file)) return reply.code(404).send({ error: `content not found: ${rel}` });
    return reply.type(MIME[extname(file)] ?? "application/octet-stream").send(await readFile(file));
  });
  const address = await server.listen({ host: "127.0.0.1", port: 0 });
  const origin = new URL(address).origin;
  const { rejected } = addAllowedOrigins([origin]);
  if (rejected.length > 0) throw new Error(`桌面 Editor origin 被拒絕：${rejected.join("、")}`);

  const window = new BrowserWindow({
    width: 1540,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    title: "GGD 技能／VFX 編輯器",
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  let reviewWindow: BrowserWindow | null = null;
  const openReview = (): void => {
    if (reviewWindow && !reviewWindow.isDestroyed()) {
      reviewWindow.focus();
      return;
    }
    reviewWindow = new BrowserWindow({
      width: 1440,
      height: 920,
      minWidth: 1000,
      minHeight: 700,
      title: "GGD AI 變更上線前批核",
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    reviewWindow.on("closed", () => { reviewWindow = null; });
    void reviewWindow.loadURL(`${origin}/admin/?desktopPage=aiChangeReview`);
  };
  const relaunch = (choose = false): void => {
    const args = process.argv.slice(1).filter((arg) => arg !== "--choose-source");
    app.relaunch({ args: choose ? [...args, "--choose-source"] : args });
    app.exit(0);
  };
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: "檔案",
      submenu: [
        { label: "重新同步資料來源", click: () => relaunch(false) },
        { label: "更換資料來源…", click: () => relaunch(true) },
        { label: "開啟本機工作區", click: () => { void shell.openPath(config.workspacePath); } },
        { label: "AI 變更上線前批核…", click: openReview },
        { type: "separator" },
        { role: process.platform === "darwin" ? "close" : "quit" },
      ],
    },
    { label: "編輯", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    { label: "檢視", submenu: [{ role: "reload" }, { role: "toggleDevTools" }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { role: "togglefullscreen" }] },
  ]));
  await window.loadURL(`${origin}/editor/`);
  app.on("before-quit", () => { void server.close(); });
}

app.whenReady().then(start).catch((error) => {
  void dialog.showErrorBox("GGD Editor 無法啟動", error instanceof Error ? error.stack ?? error.message : String(error));
  app.quit();
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
