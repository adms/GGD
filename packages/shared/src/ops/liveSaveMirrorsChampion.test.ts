/**
 * live 設定頁存一格技能欄位時，**英雄副本要跟著動**（GH#822 / #823 / #829）。
 *
 * ---------------------------------------------------------------------------
 * ⭐ 為什麼（2026-08-29 三個對抗性複驗**各自獨立**撞到同一件事）
 * ---------------------------------------------------------------------------
 * 每支 Q/W/E/R 技能同時住兩份：
 *   · `content/abilities/<cid>.<slot>.json` —— **權威**
 *   · `content/champions/<cid>.json` 的 `abilities[<slot>]` —— **副本**
 *
 * ⛔ 共用寫入端在此之前**只寫前者**，兩個後果：
 *
 * | | |
 * |---|---|
 * | `auditAbilityMirrorDrift()` 比對兩份鍵的**聯集**（只跳過 `schema`） | 每存一格，出貨閘 `abilityMirror.test.ts` 就從綠變紅 |
 * | `registry.ts` 的 `fillGaps()` 把標準檔**缺席**的欄位從副本補回來 | ⭐ 「清空一格」在**比賽裡靜默無效** |
 *
 * ⭐ 三條 lane（#822 #823 #829）各自被這**同一個**機制缺口擋下 ——
 * 這正是第〇·五守則說的形狀：⛔ 不要逐支補，**做那個機制**。
 *
 * 突變紀錄：把 `mirrorAbilityIntoChampion` 的回傳改成恆為 `{ wrote: null }` → 紅。
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const load = async (): Promise<{
  mirrorAbilityIntoChampion: (
    root: string,
    path: string,
    pointer: string,
    value: unknown,
  ) => { wrote: string | null; error?: string };
}> =>
  (await import(/* @vite-ignore */ ("../../../../tools/admin-live/middleware.mjs" as string))) as never;

function sandbox(): string {
  const t = mkdtempSync(join(tmpdir(), "ggd-mirror-"));
  mkdirSync(join(t, "content/abilities"), { recursive: true });
  mkdirSync(join(t, "content/champions"), { recursive: true });
  mkdirSync(join(t, "scripts"), { recursive: true });
  // ⭐ genguard 的替身：回 0 ＝「不是產物，可以寫」。⛔ 仍然**真的被呼叫**。
  const gg = join(t, "scripts/genguard.sh");
  writeFileSync(gg, "#!/bin/sh\nexit 0\n");
  chmodSync(gg, 0o755);
  writeFileSync(
    join(t, "content/abilities/hero-x.q.json"),
    JSON.stringify({ id: "hero-x.q", schema: "ability@1", cooldownTier: "中", vfxKey: "fx.old" }, null, 2),
  );
  writeFileSync(
    join(t, "content/champions/hero-x.json"),
    JSON.stringify(
      { id: "hero-x", schema: "champion@1", abilities: { q: { id: "hero-x.q", cooldownTier: "中", vfxKey: "fx.old" } } },
      null,
      2,
    ),
  );
  return t;
}

const champ = (t: string): Record<string, unknown> =>
  (JSON.parse(readFileSync(join(t, "content/champions/hero-x.json"), "utf8")).abilities as Record<string, Record<string, unknown>>)
    .q!;

describe("存技能欄位時英雄副本跟著動（GH#822/#823/#829）", () => {
  it("⭐ 改一格 → 副本拿到同一個值", async () => {
    const t = sandbox();
    const { mirrorAbilityIntoChampion } = await load();
    const r = mirrorAbilityIntoChampion(t, "content/abilities/hero-x.q.json", "/vfxKey", "fx.new");
    expect(r.error, "⛔ 鏡射不該失敗").toBeUndefined();
    expect(r.wrote, "⛔ 沒有寫任何副本 —— abilityMirror 閘會紅，而且刪除在比賽裡靜默無效").toBe(
      "content/champions/hero-x.json",
    );
    expect(champ(t).vfxKey).toBe("fx.new");
  });

  it("⭐ 清空一格 → 副本也要空（⛔ 否則 fillGaps 會把舊值補回來）", async () => {
    const t = sandbox();
    const { mirrorAbilityIntoChampion } = await load();
    mirrorAbilityIntoChampion(t, "content/abilities/hero-x.q.json", "/vfxKey", null);
    // ⭐ 寫入端的語意是**刪掉那個鍵**（⛔ 不是設成 null）—— 而那正是對的：
    //   `fillGaps()` 只在標準檔缺席時從副本補，兩邊都沒有 ⇒ 補不回舊值。
    expect("vfxKey" in champ(t), "⛔ 副本還留著舊值 ⇒ fillGaps 會把它補回來,玩家在比賽裡照樣看到舊特效").toBe(false);
  });

  it("⛔ 不是技能檔就不碰（⭐ 不要對每一次存檔都去翻英雄）", async () => {
    const t = sandbox();
    const { mirrorAbilityIntoChampion } = await load();
    expect((await load()) && mirrorAbilityIntoChampion(t, "content/config/x.json", "/a", 1).wrote).toBeNull();
  });
});
