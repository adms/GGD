import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("ggdSetup", {
  useRemote: (url: string) => ipcRenderer.invoke("ggd-setup:remote", url),
  useLocal: () => ipcRenderer.invoke("ggd-setup:local"),
  cancel: () => ipcRenderer.invoke("ggd-setup:cancel"),
});

