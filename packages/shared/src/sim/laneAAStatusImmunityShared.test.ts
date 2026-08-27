/**
 * GH#684 —— 殭屍王免疫與初號機暴走**共用同一個機制**（owner 2026-08-24 逐字）：
 *
 * > 「殭屍王免疫負面狀態 包含暈眩 緩慢 詛咒 致盲 但可被吸血、暴擊、淨化跟其他技能
 * >  標記與疊層（**跟初號機暴走一樣，我建議可以參考甚至共用部分模板**）」
 *
 * ── 收斂前的樣子（＝這條守衛存在的理由）────────────────────────────────────
 * 殭屍王走 `statusImmunity{tags:["cc"]}`（掛上**之前**拒絕）；暴走**寫不出來**
 *（`tools/skill-remake/common.py` 的 `_BUFF_FIELDS` 白名單漏了第 13 格），
 * 只好用 `onStatusApplied` + `dispel` **事後補拔** ⇒ 同一個意圖兩份平行實作。
 * ⭐ 收斂之後兩邊是**同一個機制、一格參數**：`cc ⊂ debuff`。
 *
 * ── 這條守衛驗的兩件**行為**（⛔ 不是屬性、⛔ 不抄任何出貨數字）─────────────
 *   ① 一個機制**兩個消費者** —— 從**出貨內容**推導，⛔ 不是斷言裡寫死兩個 id。
 *   ② ⭐ 免疫是**依 tag 分群**的，⛔ 不是「暴走中什麼都掛不上」：
 *      帶 `debuff` 的掛不上來，而 `devour-cooldown`（59-01 吞噬**自己**的內部
 *      冷卻標記，量到它是唯一 polarity=debuff 卻**不帶** `debuff` tag 的一份）
 *      ⭐ **照樣掛得上**。⚠️ 這一條是承重的：`applyStatus.ts` 逐字寫著免疫
 *      「⛔ 不排除 `target === ctx.caster`」⇒ 這一格要是擋掉了，暴走中的初號機
 *      就**免疫掉自己的吞噬冷卻** ＝ 無限吞噬，而血條上看不出來（失敗形態⑦）。
 *
 * 突變（一條，承重線）：把 `berserk_package()` 的
 * `statusImmunity={"tags": ["debuff"]}` 拿掉再 `genrun skillremake:json`
 *   → ①紅（消費者剩一個）＋②紅（詛咒掛得上來了）。
 */
import { beforeAll, describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "../content/loader";
import { FsContentSource } from "../content/node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "./content/registry";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { runEffects } from "./effects/effectRunner";
import { hasStatus } from "./effects/effectCommon";
import { isBerserk } from "./berserk";
import { DEFAULT_AUTO_ENGAGE } from "./combatFeel";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type StatusId } from "../ids";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const CONTENT = join(ROOT, "content");
const EVA = "godie-e00r" as ChampionId;

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);
});

describe("GH#684 · statusImmunity 是一個機制的兩個消費者", () => {
  it("① 出貨內容裡至少兩位**不同**英雄授予 statusImmunity —— ⛔ 不是殭屍王一個人的特例", () => {
    const dir = join(CONTENT, "abilities");
    const owners = new Set<string>();
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".json") || f.startsWith("_")) continue;
      if (!readFileSync(join(dir, f), "utf8").includes('"statusImmunity"')) continue;
      owners.add(f.split(".")[0]!); // godie-e00r.passive.json → godie-e00r
    }
    expect(
      owners.size,
      `statusImmunity 只有 ${[...owners].join("/") || "零"} 在用 —— ` +
        `一個只有一個消費者的「共用模板」就是一支技能的特例（第〇·五守則）`,
    ).toBeGreaterThanOrEqual(2);
  });

  it("② 暴走中：帶 debuff tag 的掛不上來，而不帶的（吞噬冷卻）照樣掛得上", () => {
    const w = new SimWorld(SKELETON_ARENA, 684);
    w.combatActive = true;
    w.combatFeel = {
      ...w.combatFeel,
      autoEngage: { ...DEFAULT_AUTO_ENGAGE, ...w.combatFeel.autoEngage, enabled: false },
    };
    const spawn = (seat: number, team: number, x: number): EntityId =>
      spawnChampion(w, {
        championId: EVA, seatId: asSeatId(seat), teamId: asTeamId(team),
        pos: { x, z: 0 }, zone: 0,
      });
    const eva = spawn(0, 0, 0);
    const other = spawn(1, 1, 30);
    w.step(new Map());

    // 這兩份狀態的分群從**出貨的 status 文件**讀，⛔ 不是斷言裡寫死。
    const tagsOf = (id: string): readonly string[] => StatusEffects.get(id)?.tags ?? [];
    expect(tagsOf("curse"), "詛咒沒有 debuff tag —— 這條測試的前提不成立").toContain("debuff");
    expect(tagsOf("devour-cooldown"), "吞噬冷卻帶了 debuff tag —— 它會被免疫掉").not.toContain("debuff");

    const ctx = { world: w, caster: other, rank: 1, targets: [eva],
                  origin: "ability:test.laneAA-684", rng: w.rng };

    // 進暴走（走出貨的 onDamageTaken 門檻，⛔ 不是手寫旗標）。
    const hp = w.health.get(eva)!;
    hp.hp = hp.maxHp * 0.05;
    w.damageQueue.push({ source: other, target: eva, amount: 1, type: "true",
                         crit: false, origin: "ability:test.laneAA-684" });
    w.step(new Map());
    expect(isBerserk(w, eva)).toBe(true);

    // 帶 debuff tag ⇒ 掛不上來。
    runEffects([{ kind: "applyStatus" as const, statusId: "curse" as StatusId,
                  duration: 4, missChance: 0.33 }], ctx);
    expect(hasStatus(w, eva, "curse" as StatusId),
      "帶 debuff tag 的狀態掛上來了 —— statusImmunity 沒有在擋").toBe(false);

    // ⭐ 不帶 debuff tag ⇒ 照樣掛得上（⛔ 免疫不是一刀切）。
    runEffects([{ kind: "applyStatus" as const, statusId: "devour-cooldown" as StatusId,
                  duration: 6, applyTo: "self" as const }],
               { ...ctx, caster: eva, targets: [eva] });
    expect(hasStatus(w, eva, "devour-cooldown" as StatusId),
      "吞噬的內部冷卻被自己的免疫擋掉了 —— 暴走中會變成無限吞噬").toBe(true);
  });
});
