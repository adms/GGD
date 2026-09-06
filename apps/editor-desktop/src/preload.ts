import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("ggdDesktopPlatform", { origin: process.argv.find((value) => value.startsWith("--ggd-platform-origin="))?.slice("--ggd-platform-origin=".length) ?? "offline" });

contextBridge.exposeInMainWorld("ggdSetup", {
  useRemote: (url: string) => ipcRenderer.invoke("ggd-setup:remote", url),
  useLocal: () => ipcRenderer.invoke("ggd-setup:local"),
  cancel: () => ipcRenderer.invoke("ggd-setup:cancel"),
});

contextBridge.exposeInMainWorld("ggdDesktopDrafts", {
  onFlush: (flush: (operation: "flush" | "backup" | "restore" | "prepare-update" | "resume", payload?: string) => Promise<unknown>) => {
    const receive = async (_event: unknown, request: { requestId?: unknown; operation?: unknown; payload?: unknown }) => {
      const { requestId, operation, payload } = request ?? {};
      if (typeof requestId !== "string" || !["flush", "backup", "restore", "prepare-update", "resume"].includes(String(operation))) return;
      try { const result = await flush(operation as "flush" | "backup" | "restore" | "prepare-update" | "resume", typeof payload === "string" ? payload : undefined); ipcRenderer.send("ggd-drafts:flushed", { requestId, ok: true, result }); }
      catch (error) { ipcRenderer.send("ggd-drafts:flushed", { requestId, ok: false, error: error instanceof Error ? error.message : String(error) }); }
    };
    ipcRenderer.on("ggd-drafts:flush", receive);
    return () => ipcRenderer.removeListener("ggd-drafts:flush", receive);
  },
});
