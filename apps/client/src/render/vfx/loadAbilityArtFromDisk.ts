/**
 * NODE-ONLY —— 從磁碟載入 `content/config/vfx-ability-art.json` 並灌進註冊表。
 *
 * ⭐ 為什麼是**獨立一支**：`abilityArtContent.ts` 要能被瀏覽器 bundle 進去，
 * 所以它一個 `node:fs` 都不能碰（瀏覽器那一端的資料由 `ContentDb` 從 bundle 交進來）。
 * 產生器與 Node 測試沒有 `ContentDb`，它們用這一支。
 *
 * ⛔ 這不是第二條載入路徑：兩邊都走 `setAbilityArtBindings` 那一道**唯一的縫**，
 * 差別只在誰去把 JSON 拿來。
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// ⚠️ narrow subpath, ⛔ not the `@ggd/shared/content` barrel: this module is a
// vitest **setup** file's only import, so the barrel would pull the whole content
// package into every client test file that does not otherwise need it.
import { zConfigVfxAbilityArtDoc, type ConfigVfxAbilityArtDoc } from "@ggd/shared/content/schema/vfx";
import { setAbilityArtBindings } from "./abilityArtContent";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONTENT_DIR = join(HERE, "../../../../../content");

/** 出貨那一份的絕對路徑（`GGD_CONTENT_DIR` 可覆寫，與其餘產生器同一個慣例）。 */
export function abilityArtDocPath(contentDir?: string): string {
  return join(contentDir ?? process.env.GGD_CONTENT_DIR ?? DEFAULT_CONTENT_DIR, "config", "vfx-ability-art.json");
}

/**
 * 讀 + 嚴格驗 + 灌進註冊表。回傳灌進去的列數。
 *
 * ⛔ 這裡**故意用嚴格 parse 而不是 safeParse**：產生器與測試是「編輯發生的當下」，
 * 一份壞掉的綁定文件要在這裡就爆，⛔ 不是等到某一場比賽的某一次施法才靜靜地少一層。
 */
export function loadAbilityArtFromDisk(contentDir?: string): number {
  const p = abilityArtDocPath(contentDir);
  if (!existsSync(p)) {
    setAbilityArtBindings(null);
    return 0;
  }
  const doc: ConfigVfxAbilityArtDoc = zConfigVfxAbilityArtDoc.parse(JSON.parse(readFileSync(p, "utf8")));
  setAbilityArtBindings(doc);
  return Object.keys(doc.bindings).length;
}
