/**
 * `resolveUiCues()` 不可以把文件裡的區塊**掉在地上**（GH#1052）。
 *
 * → 2026-09-06：回傳的物件字面值沒有 `commsWheel`／`lobbyStore`／`playerContent` ⇒
 * `uiCues().commsWheel` 永遠 undefined ⇒ 輪盤落到 FALLBACK `enabled:false`，V 鍵永遠沒反應
 * （失敗形態②：算出來了但從沒送到）。owner 關商店的 override（`lobbyStore.enabled:false`）同樣到不了畫面。
 *
 * ⚠️ 出貨文件 ＝ `DEFAULT_UI_CUES`，所以「等於文件」對「抄預設」也是綠的 ⇒ ② 翻一格再讀。
 * ⛔ ① 不寫死三個名字：`DEFAULT_UI_CUES` 有的鍵一個都不准掉 —— 下一個新區塊漏抄時這裡就紅。
 * 突變（實跑）：把 `commsWheel:` 那一行從 `resolveUiCues` 拿掉 → ① 紅（指名 `commsWheel`）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_UI_CUES, resolveUiCues, zConfigUiCuesDoc, type ConfigUiCuesDoc } from "./uiCues";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../..");
const shipped: ConfigUiCuesDoc = zConfigUiCuesDoc.parse(
  JSON.parse(readFileSync(join(ROOT, "content/config/ui-cues.json"), "utf8")),
);

describe("resolveUiCues 把每一個區塊都抄進回傳值（GH#1052）", () => {
  it("① 出貨文件的每一格都到得了消費端 —— DEFAULT 有的鍵一個都不准掉", () => {
    const r = resolveUiCues(shipped) as Record<string, unknown>;
    const src = shipped as unknown as Record<string, unknown>;
    for (const k of Object.keys(DEFAULT_UI_CUES)) {
      expect(r, `resolveUiCues 掉了 \`${k}\` —— 文件裡的值到不了 uiCues()`).toHaveProperty(k);
      expect(r[k], `\`${k}\` 回傳的不是文件值`).toEqual(src[k]);
    }
    expect(shipped.commsWheel?.enabled, "夾具前提：出貨輪盤是開的").toBe(true);
  });

  it("② 讀的是文件不是預設：翻一格就跟著翻；缺席退出貨預設", () => {
    const flipped = resolveUiCues({ ...shipped, commsWheel: { ...shipped.commsWheel!, enabled: false } });
    expect(flipped.commsWheel?.enabled).toBe(false);
    const absent = resolveUiCues({ ...shipped, commsWheel: undefined, lobbyStore: undefined });
    expect(absent.commsWheel).toEqual(DEFAULT_UI_CUES.commsWheel);
    expect(absent.lobbyStore).toEqual(DEFAULT_UI_CUES.lobbyStore);
  });
});
