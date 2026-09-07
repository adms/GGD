import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("electron", async () => {
  const { EventEmitter } = await import("node:events");
  return { ipcMain: new EventEmitter() };
});
import { ipcMain, type BrowserWindow } from "electron";
import { requestEditorDrafts } from "./saveBeforeClose";
afterEach(() => { ipcMain.removeAllListeners(); });
function target() {
  const webContents = { mainFrame: {}, send: vi.fn(), executeJavaScript: vi.fn(async (): Promise<void> => undefined) };
  return { window: { webContents } as unknown as BrowserWindow, webContents };
}
describe("close and update save acknowledgement", () => {
  it("waits for the correct request and editor frame, not a second window", async () => {
    const { window, webContents } = target();
    const pending = requestEditorDrafts(window, "backup");
    await Promise.resolve();
    const request = webContents.send.mock.calls[0]![1];
    let done = false; void pending.then(() => { done = true; });
    ipcMain.emit("ggd-drafts:flushed", { sender: {}, senderFrame: webContents.mainFrame }, { requestId: request.requestId, ok: true });
    ipcMain.emit("ggd-drafts:flushed", { sender: webContents, senderFrame: webContents.mainFrame }, { requestId: "stale", ok: true });
    await Promise.resolve(); expect(done).toBe(false);
    ipcMain.emit("ggd-drafts:flushed", { sender: webContents, senderFrame: webContents.mainFrame }, { requestId: request.requestId, ok: true, result: "snapshot" });
    await expect(pending).resolves.toBe("snapshot");
    expect(ipcMain.listenerCount("ggd-drafts:flushed")).toBe(0);
  });
  it("fails closed when saving fails or the renderer never responds", async () => {
    const { window, webContents } = target();
    const pending = requestEditorDrafts(window, "flush");
    await Promise.resolve();
    const request = webContents.send.mock.calls[0]![1];
    ipcMain.emit("ggd-drafts:flushed", { sender: webContents, senderFrame: webContents.mainFrame }, { requestId: request.requestId, ok: false, error: "disk full" });
    await expect(pending).rejects.toThrow("disk full");
    await expect(requestEditorDrafts(window, "flush", undefined, 5)).rejects.toThrow("保存尚未完成");
    expect(ipcMain.listenerCount("ggd-drafts:flushed")).toBe(0);
  });
  it("waits for renderer initialization and never sends a late request after its deadline", async () => {
    const { window, webContents } = target();
    let ready!: () => void;
    webContents.executeJavaScript.mockImplementation(() => new Promise<void>((resolve) => { ready = resolve; }));
    const pending = requestEditorDrafts(window, "flush");
    await Promise.resolve(); expect(webContents.send).not.toHaveBeenCalled();
    ready(); await Promise.resolve();
    const request = webContents.send.mock.calls[0]![1];
    ipcMain.emit("ggd-drafts:flushed", { sender: webContents, senderFrame: webContents.mainFrame }, { requestId: request.requestId, ok: true });
    await expect(pending).resolves.toBeUndefined();
    webContents.send.mockClear();
    await expect(requestEditorDrafts(window, "flush", undefined, 5)).rejects.toThrow("保存尚未完成");
    ready(); await Promise.resolve(); expect(webContents.send).not.toHaveBeenCalled();
    expect(ipcMain.listenerCount("ggd-drafts:flushed")).toBe(0);
  });
});
