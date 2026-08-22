/**
 * ⭐ GH#602 —— 【特效自帶的音效】那一張表上的每一個 key，音效表認得嗎？
 *
 * ⚠️ `schema/vfx.ts` 的 {@link vfxSoundKeysUsed} 檔頭逐字寫著「⭐ 守衛用它去問
 * audio-map『這些 key 你認得嗎』」，而 2026-08-23 量到它**全 repo 零呼叫端** ——
 * 那句註解描述的守衛**不存在**（第三守則：註解會說謊 ＋ 失敗形態③）。
 *
 * ⛔ 這一格打錯字的失敗形態正是第一·五守則點名的那一種：schema 收得下
 * （`zVfxSoundKey` 只驗字元集，⛔ 不驗這個 key 存不存在）、後台存得起來、
 * `content:build` 全綠 —— 而遊戲裡那一發**安靜**，跟「這一族本來就沒聲音」
 * 長得一模一樣。
 *
 * ⭐ 它是**整張表**的閘（21 個家族原型 ＋ 逐支覆寫），⛔ 不是替某一支技能寫的檢查。
 * 走 `readFileSync` 直讀出貨檔（同 `audioAssets.test.ts`），所以它在
 * `content:build` 之前與之後都成立。
 */
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { zConfigAudioMapDoc } from "./schema/config";
import { vfxSoundKeysUsed, zConfigVfxFamiliesDoc } from "./schema/vfx";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG = join(HERE, "../../../..", "content", "config");
const read = (name: string): unknown =>
  JSON.parse(readFileSync(join(CONFIG, name), "utf8")) as unknown;

describe("config.vfx-families@1 · 特效自帶的音效", () => {
  it("每一個 sound key 都是 config.audio-map@1 認得的 sfx", () => {
    const families = zConfigVfxFamiliesDoc.parse(read("vfx-families.json"));
    const known = new Set(Object.keys(zConfigAudioMapDoc.parse(read("audio-map.json")).sfx));
    const used = vfxSoundKeysUsed(families);

    // 空的名單會讓下面那一條 vacuously 通過 —— 那是「守衛還在，只是不再守任何東西」。
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((k) => !known.has(k))).toEqual([]);
  });
});
