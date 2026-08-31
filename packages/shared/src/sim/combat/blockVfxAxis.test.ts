import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zBlockGrant } from "../../content/schema/effects/_shared";

/**
 * ⭐⭐ GH#650 —— **擋下的那一瞬間有沒有特效軸**（owner 說過**兩次**：
 * 「初號機 AT力場應該要有特效 **這個之前回報過了啊**」）。
 *
 * ── ⭐ 為什麼是一道機制，⛔ 不是替初號機寫一個 if（第〇·五守則）────────────
 * 施法者側的特效走 `spawnVfx` / `spawnModelFx`，那些都掛在**技能施放**上；
 * ⛔ 而「這一發被擋下」發生在**減傷鏈的中途**，那裡在此之前**一個內容驅動的
 * 特效出口都沒有** ⇒ 所有格擋長一模一樣。
 *
 * ── ⭐ 這條守衛驗**三段接縫**，⛔ 不是任何一段自己（失敗形態⑪）──────────
 * ① schema 收得下 ② sim 在**真的擋中**那一行發得出來 ③ fanout 放行
 * ⚠️ ⭐ 而第四段（客戶端**取代**泛用火花）驗在 `apps/client` 那一側。
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../../../..");

describe("GH#650 格擋特效軸（三段接縫）", () => {
  it("① schema 收得下 vfxId / vfxScale / vfxTint，⭐ 而它們全是選填", () => {
    const base = { damageTypes: ["physical"], chance: 0.5, fraction: 0.5 };
    expect(zBlockGrant.safeParse(base).success, "⛔ 既有內容不可以因為加欄位而失效").toBe(true);
    const withVfx = zBlockGrant.safeParse({
      ...base, vfxId: "fx.atfield", vfxScale: 1.5, vfxTint: [255, 128, 0],
    });
    expect(withVfx.success).toBe(true);
    // ⭐ 上下界要在（0–255），⛔ 不是只有下界
    expect(zBlockGrant.safeParse({ ...base, vfxTint: [999, 0, 0] }).success).toBe(false);
  });

  it("★ ② sim 在**真的擋中**那一行發事件 —— ⭐ 兩種疊法都要有", () => {
    const src = readFileSync(join(REPO, "packages/shared/src/sim/combat/block.ts"), "utf8");
    // ⭐ 承重：`blockLastFired` 是「這一發真的被擋掉了」唯一的記號 ——
    //    發射點必須貼著它，⛔ 不是貼在骰子之前或迴圈外。
    const fires = src.split("blockLastFired = world.tick");
    expect(fires.length - 1, "⛔ 兩種疊法（chain / best）少一個就有一半的格擋沒特效").toBe(2);
    for (const tail of fires.slice(1)) {
      expect(tail.slice(0, 200)).toContain("emitBlockVfx");
    }
    expect(src, "⛔ 沒填 vfxId 的 grant 一則都不該發（出貨兩支平擋道具都沒填）")
      .toContain("if (b.vfxId === undefined) return;");
  });

  it("③ fanout 放行 blockVfx（⛔ 不放行 = 算出來了但從沒送到客戶端）", () => {
    const src = readFileSync(join(REPO, "apps/game-server/src/net/eventFanout.ts"), "utf8");
    expect(src).toContain('"blockVfx"');
  });
});
