/**
 * ⭐【vfx 家族產生器不可以刪掉它不擁有的欄位】（GH#378）
 *
 * 量到的（v0.20.6）：跑一次
 *   `pnpm exec tsx apps/client/src/render/vfx/generateFamilyContent.ts`
 * 會把 `content/config/vfx-families.json` 的**六格整格刪掉** ——
 * `maxAbilityVfxLayers` · `oneShotMaxLifeSec` · `castHeightSource` ·
 * `projectileArtFromDoc` · `projectileRadiusGain` · `projectileFlyHeightY`。
 *
 * ⛔ 而**沒有任何既有守衛會紅**：這六格全是 Zod 的 optional，刪掉之後預設值補回去，
 * `content:build` 綠、後台頁照樣畫得出來，只有**操作者存過的值**靜靜回到出貨預設
 * （CLAUDE.md 失敗形態②：後台存了，場上讀不到）。
 *
 * ⭐ 這條驗的是**行為**：真的把那支腳本跑在沙箱樹上，再逐格比對檔案，
 * ⛔ 不是掃 `grep existing` 之類的原始碼字串（失敗形態⑥ —— 把 import 留著、
 * 把合併拿掉，掃描照樣綠）。
 *
 * ⭐ 「哪幾格是產生器的」由 `shippedFamilyConfig({})` **推導**，⛔ 沒有手抄清單：
 * 之後有人加一格新的後台旋鈕（lane R 正在加），它自動被這條守衛保護。
 *
 * 突變紀錄（2026-08-18，跑過）：
 *   · 把 `{ ...existing, ...owned }` 改回 `owned` → 這條紅，並指名
 *     六格 `maxAbilityVfxLayers …` 被吃掉 ✅
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { shippedFamilyConfig } from "./generateFamilyContent";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../../../..");
const SCRIPT = join(HERE, "generateFamilyContent.ts");
const SHIPPED = join(REPO, "content/config/vfx-families.json");

describe("vfx 家族產生器（GH#378）", () => {
  it("🔴 真的跑一次：產生器不擁有的每一格逐位保留", () => {
    // ⛔ 一律在沙箱裡跑 —— 對出貨的 content/ 跑產生器會動到別人正在編輯的樹。
    const sandbox = mkdtempSync(join(tmpdir(), "ggd-vfxfam-"));
    try {
      mkdirSync(join(sandbox, "config"), { recursive: true });
      cpSync(SHIPPED, join(sandbox, "config/vfx-families.json"));

      const before = JSON.parse(readFileSync(SHIPPED, "utf8")) as Record<string, unknown>;
      const owned = new Set(Object.keys(shippedFamilyConfig({})));
      const unowned = Object.keys(before).filter((k) => !owned.has(k));
      // 夾具前提：出貨檔一格「產生器不擁有的欄位」都沒有的話，下面那條在測空氣。
      expect(unowned.length, "vfx-families.json 沒有任何非產生欄位 —— 這條守衛在測空氣").toBeGreaterThan(0);

      execFileSync("npx", ["tsx", SCRIPT], {
        cwd: REPO,
        env: { ...process.env, GGD_CONTENT_DIR: sandbox },
        encoding: "utf8",
        stdio: "pipe",
      });

      const after = JSON.parse(
        readFileSync(join(sandbox, "config/vfx-families.json"), "utf8"),
      ) as Record<string, unknown>;
      const lost = unowned.filter((k) => JSON.stringify(after[k]) !== JSON.stringify(before[k]));
      expect(
        lost,
        "⛔ 這幾格被產生器吃掉了 —— 它們是後台調得到的旋鈕，" +
          "刪掉之後 Zod 用預設補回去，玩家那一場靜靜地變回出貨值。" +
          "修 `shippedFamilyConfig()` 的合併，⛔ 不要改這條測試。",
      ).toEqual([]);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  }, 120_000);
});
