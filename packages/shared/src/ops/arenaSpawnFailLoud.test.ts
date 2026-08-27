/**
 * 🅰️ **每側出生點 ≥ TEAM_SIZE：schema 擋在編輯當下，消費端 fail-loud** —— GH#325 的閘。
 *
 * ## 病灶
 * `zZoneDef.spawns` 只要求每側 ≥ 1，而 `MatchController` 以 `TEAM_SIZE` 取模。
 * ⇒ 一份**完全合法**的 `arena@1`（每側 1 個 spawn）讓 slot 1/2 取到 `undefined`，
 * 而兩個非空斷言把它一路帶進 runtime。
 * ⭐ 出貨 13 張場地每側都手寫了 3 個 —— ⛔ **那是巧合，不是契約**。
 *
 * ## ⭐ 兩層都要，⛔ 少一層等於沒修
 * ① **schema**（`zZoneDef` superRefine）擋在**編輯的當下**
 * ② **消費端** `spawnAt()` 擋住**繞過 schema 進來的那條路**（舊映像的 bind-mount
 *    內容、熱載、測試夾具）—— 產生器的保證救不了手寫的場地。
 *
 * ⚠️ ⛔ 刻意 fail-loud，⛔ 不 fail-open 退回 `spawns[side][0]`：
 * 退回第 0 格會讓**三個人疊在同一格**，畫面上只是「站得很近」⇒ ⭐ 沒有人會知道。
 * fail-open 沒錯，**靜默**才是缺陷。
 *
 * ── 突變紀錄（一批一條）────────────────────────────────────────────────
 *  · `MatchController` 的 `spawnAt()` 改回 `zoneDef.spawns[side]![slot % TEAM_SIZE]!`
 *    → 第 ② 條紅並指名它。實測過。
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TEAM_SIZE } from "../constants";
import { zZoneDef } from "../content/schema/arena";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

/** 一份**除了 spawns 之外樣樣合法**的 zone —— 從出貨場地借第一個 zone 當底。 */
function shippedZone(): Record<string, unknown> {
  const dir = join(ROOT, "content/arenas");
  const f = readdirSync(dir).find((n) => n.endsWith(".json") && !n.startsWith("_"))!;
  const doc = JSON.parse(readFileSync(join(dir, f), "utf8")) as { zones: Record<string, unknown>[] };
  return structuredClone(doc.zones[0]!);
}

describe("arena 每側出生點要坐得滿一隊 (arena-spawn-fail-loud)", () => {
  it("⭐ ① 每側只有 1 個 spawn 的**合法**文件會被 schema 擋下，訊息指名 zone 與側", () => {
    const zone = shippedZone();
    const spawns = zone["spawns"] as { x: number; z: number }[][];
    expect(spawns[0]!.length, "出貨場地每側就不到 TEAM_SIZE 個 —— 母體壞了").toBeGreaterThanOrEqual(
      TEAM_SIZE,
    );
    zone["spawns"] = [[spawns[0]![0]!], spawns[1]];

    const r = zZoneDef.safeParse(zone);
    expect(r.success, "⛔ 每側只有 1 個 spawn 的文件通過了 schema —— 契約回到「巧合」").toBe(false);
    const msg = r.success ? "" : r.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("\n");
    expect(msg, "訊息要指名是哪一個 zone 的哪一側，⛔ 不是一句 generic 的 too_small").toContain(
      String(zone["id"]),
    );
  });

  it("⭐ ② 消費端 fail-loud —— ⛔ 不是兩個 `!`，⛔ 也不是退回第 0 格", () => {
    const src = readFileSync(join(ROOT, "apps/game-server/src/match/MatchController.ts"), "utf8");
    expect(
      src.includes("zoneDef.spawns[side]![") ,
      "⛔ `MatchController` 又用非空斷言直接取出生點 —— 合法文件會在 runtime 給出 undefined。\n" +
        "   改用 `spawnAt(zoneDef, side, slot)`（它會 throw 並指名 zone／側／實際格數）。",
    ).toBe(false);
    // ⭐ 反方向：那支 helper 真的**擲例外**，⛔ 不是靜靜退回第 0 格。
    const helper = src.slice(src.indexOf("function spawnAt("), src.indexOf("function spawnAt(") + 900);
    expect(helper, "⛔ `spawnAt()` 沒有 throw —— 那就是 fail-open，三個人會疊在同一格").toContain(
      "throw new Error",
    );
  });
});
