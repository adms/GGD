import { BrowserWindow, ipcMain } from "electron";
import { zLocalAiPreferenceRequest, zLocalModelControlRequest } from "@ggd/shared/content";
import type { LocalModelStore } from "./local/modelStore";
import { writeAiPreference } from "./preferences";

const STATUS_CHANNEL = "ggd-ai:status";
const GET_CHANNEL = "ggd-ai:get-status";
const PREFERENCE_CHANNEL = "ggd-ai:set-preference";
const CONTROL_CHANNEL = "ggd-ai:model-control";

export function registerLocalAiIpc(window: BrowserWindow, store: LocalModelStore, userData: string): () => void {
  const assertSender = (senderId: number): void => {
    if (senderId !== window.webContents.id) throw new Error("AI IPC sender is not the editor window.");
  };
  ipcMain.handle(GET_CHANNEL, (event) => {
    assertSender(event.sender.id);
    return store.status();
  });
  ipcMain.handle(PREFERENCE_CHANNEL, (event, raw: unknown) => {
    assertSender(event.sender.id);
    const { mode } = zLocalAiPreferenceRequest.parse(raw);
    writeAiPreference(userData, mode);
    return store.setPreference(mode);
  });
  ipcMain.handle(CONTROL_CHANNEL, async (event, raw: unknown) => {
    assertSender(event.sender.id);
    const { action } = zLocalModelControlRequest.parse(raw);
    return store.control(action);
  });
  const unsubscribe = store.subscribe((status) => {
    if (!window.isDestroyed()) window.webContents.send(STATUS_CHANNEL, status);
  });
  const dispose = (): void => {
    unsubscribe();
    ipcMain.removeHandler(GET_CHANNEL);
    ipcMain.removeHandler(PREFERENCE_CHANNEL);
    ipcMain.removeHandler(CONTROL_CHANNEL);
  };
  window.once("closed", dispose);
  return dispose;
}
