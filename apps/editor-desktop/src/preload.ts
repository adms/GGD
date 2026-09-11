import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("ggdDesktopPlatform", { origin: process.argv.find((value) => value.startsWith("--ggd-platform-origin="))?.slice("--ggd-platform-origin=".length) ?? "offline" });

contextBridge.exposeInMainWorld("ggdSetup", {
  useRemote: (url: string) => ipcRenderer.invoke("ggd-setup:remote", url),
  useLocal: () => ipcRenderer.invoke("ggd-setup:local"),
  cancel: () => ipcRenderer.invoke("ggd-setup:cancel"),
});

contextBridge.exposeInMainWorld("ggdAi", {
  getStatus: () => ipcRenderer.invoke("ggd-ai:get-status"),
  setPreference: (mode: unknown) => ipcRenderer.invoke("ggd-ai:set-preference", { mode }),
  controlModel: (action: unknown) => ipcRenderer.invoke("ggd-ai:model-control", { action }),
  onStatus: (listener: (status: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: unknown) => listener(status);
    ipcRenderer.on("ggd-ai:status", handler);
    return () => ipcRenderer.removeListener("ggd-ai:status", handler);
  },
});

let resolveDraftReady: () => void;
let draftReady = new Promise<void>((resolve) => { resolveDraftReady = resolve; });
let draftListeners = 0;
contextBridge.exposeInMainWorld("ggdDesktopDrafts", {
  // IndexedDB recovery runs before the renderer attaches its save handler.
  // Main waits for this promise instead of sending an event that can be lost.
  whenReady: () => draftReady,
  onFlush: (flush: (operation: "flush" | "backup" | "restore" | "prepare-update" | "resume", payload?: string) => Promise<unknown>) => {
    const receive = async (_event: unknown, request: { requestId?: unknown; operation?: unknown; payload?: unknown }) => {
      const { requestId, operation, payload } = request ?? {};
      if (typeof requestId !== "string" || !["flush", "backup", "restore", "prepare-update", "resume"].includes(String(operation))) return;
      try { const result = await flush(operation as "flush" | "backup" | "restore" | "prepare-update" | "resume", typeof payload === "string" ? payload : undefined); ipcRenderer.send("ggd-drafts:flushed", { requestId, ok: true, result }); }
      catch (error) { ipcRenderer.send("ggd-drafts:flushed", { requestId, ok: false, error: error instanceof Error ? error.message : String(error) }); }
    };
    ipcRenderer.on("ggd-drafts:flush", receive);
    draftListeners++; resolveDraftReady();
    let subscribed = true;
    return () => {
      if (!subscribed) return; subscribed = false;
      ipcRenderer.removeListener("ggd-drafts:flush", receive);
      if (--draftListeners === 0) draftReady = new Promise<void>((resolve) => { resolveDraftReady = resolve; });
    };
  },
});
