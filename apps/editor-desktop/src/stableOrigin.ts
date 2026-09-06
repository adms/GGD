import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** IndexedDB is origin-scoped. Never silently pick a new port on restart. */
export async function listenWithStableOrigin(
  userData: string,
  listen: (port: number) => Promise<string>,
  close: () => Promise<unknown>,
): Promise<string> {
  const path = join(userData, "desktop-origin.json");
  let port = 0;
  try {
    const value = JSON.parse(await readFile(path, "utf8"));
    if (value.schema !== "ggd-desktop-origin@1" || !Number.isInteger(value.port) || value.port < 1024 || value.port > 65535) {
      throw new Error("桌面草稿來源紀錄無法驗證；已保留資料，請恢復備份。");
    }
    port = value.port;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  let address: string;
  try { address = await listen(port); }
  catch (error) {
    throw new Error(`無法開啟桌面草稿來源${port ? `（連接埠 ${port}）` : ""}。請關閉占用它的程式後重試；不會改用新來源而隱藏舊草稿。`, { cause: error });
  }
  try {
    const actual = new URL(address);
    if (actual.hostname !== "127.0.0.1" || actual.protocol !== "http:" || (port && Number(actual.port) !== port)) {
      throw new Error("桌面來源與保存紀錄不同，拒絕啟動。");
    }
    if (!port) {
      await mkdir(userData, { recursive: true });
      const temporary = `${path}.${process.pid}.tmp`;
      await writeFile(temporary, JSON.stringify({ schema: "ggd-desktop-origin@1", port: Number(actual.port) }), { mode: 0o600, flush: true });
      await rename(temporary, path);
    }
    return actual.origin;
  } catch (error) { await close(); throw error; }
}
