import { randomUUID } from "node:crypto";
import { ipcMain, type BrowserWindow, type IpcMainEvent } from "electron";

/** The sender and request id must both match; a different window cannot ack a save. */
export function requestEditorDrafts(window: BrowserWindow, operation: "flush" | "backup" | "restore" | "prepare-update" | "resume", payload?: string, timeoutMs = 30_000): Promise<unknown> {
  const requestId = randomUUID();
  return new Promise((resolve, reject) => {
    let finished = false;
    const finish = (error?: Error, value?: unknown) => {
      if (finished) return; finished = true;
      clearTimeout(timer);
      ipcMain.removeListener("ggd-drafts:flushed", receive);
      error ? reject(error) : resolve(value);
    };
    const receive = (event: IpcMainEvent, value: unknown) => {
      if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) return;
      const receipt = value as { requestId?: unknown; ok?: unknown; error?: unknown; result?: unknown } | null;
      if (receipt?.requestId !== requestId) return;
      finish(receipt.ok === true ? undefined : new Error(typeof receipt.error === "string" ? receipt.error : "草稿尚未保存。"), receipt.result);
    };
    const timer = setTimeout(() => finish(new Error("保存尚未完成，已取消關閉。請回到我的作品檢查保存狀態。")), timeoutMs);
    ipcMain.on("ggd-drafts:flushed", receive);
    void window.webContents.executeJavaScript("window.ggdDesktopDrafts.whenReady()").then(() => {
      if (!finished) window.webContents.send("ggd-drafts:flush", { requestId, operation, payload });
    }).catch((error) => finish(error instanceof Error ? error : new Error(String(error))));
  });
}

export async function flushEditor(window: BrowserWindow): Promise<void> {
  await requestEditorDrafts(window, "flush");
}
