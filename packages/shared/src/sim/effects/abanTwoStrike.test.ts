/**
 * 08-04 阿邦快速劍X ——「**二連技**」的機制守衛（GH#843）。
 *
 * ---------------------------------------------------------------------------
 * ⭐ 承重的斷言是「**只有兩段都吃到的人**才挨那十倍」
 * ---------------------------------------------------------------------------
 * owner 2026-08-28（逐字）：
 * > 「第一個A式直線命中的敵人身上都會帶1秒 技能標籤，B一秒後生效有帶該技能
 * >  標籤敵方單位則額外造成 **（A+AP） 10倍傷害** 才對」
 *
 * ⇒ 卡面那個 **X** 是兩道劍氣**交叉**：A 式掃一條線、B 式炸一個圈，
 *   而**交集**（線上被劃到、一秒後還站在圈裡）才是這招的全部威力。
 *
 * ⛔ **不是**「B 段傷害很高」—— 那一條對「無條件十倍」的實作也是綠的
 *   （失敗形態④：斷言方向跟缺陷無關）。所以下面**同時**量兩個人：
 *   · 站在線上又站在圈裡的 ⇒ 吃到十倍那一發
 *   · **只**站在圈裡（沒被線劃到）⇒ ⛔ 一定沒有那一發
 *   單邊校準的尺會在它最需要說話的時候沉默（CLAUDE.md 第一守則）。
 *
 * ---------------------------------------------------------------------------
 * 突變紀錄（都真的做過）
 * ---------------------------------------------------------------------------
 *   · `resolveScaling` 的 `sc.mult` 那一行拿掉（回傳 v）      → 紅（十倍不見了）
 *   · 第二發 `damageArea` 的 `condition` 拿掉（變成無條件）    → 紅（沒被線劃到的也挨了）
 *   · A 式的 `onHitTargets` 拿掉（不掛印記）                   → 紅（沒有人挨十倍）
 */
import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "../../content/loader";
import { shippedContentSource } from "../../content/__fixtures__/shippedContent";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "../content/registry";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { spawnChampion } from "../spawnChampion";
import { runEffects } from "./effectRunner";
import type { EffectContext, EffectDef } from "./effect";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId } from "../../ids";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");
const C = SKELETON_ARENA.zones[0]!.center;
const HERO = "godie-n01c" as ChampionId;
const SUBJECT = "godie-n01c.r" as AbilityId;

let ready = false;
async function load(): Promise<void> {
  if (ready) return;
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(shippedContentSource(CONTENT)).load()).store);
  ready = true;
}

/**
 * ⏱ **明確的 60 秒時鐘**（GH#979）—— ⭐ 放寬的是**時鐘**，⛔ 不是斷言。
 *
 * 下面三條每一條都要先 `await load()`：一次 `ContentLoader.load()` 讀整棵出貨內容樹
 * （1,900+ 份文件）＋ `registerAll`，然後 `cast()` 還要跑兩場 45 tick 的模擬。
 * ⇒ owner 的 M 系列機器上綽綽有餘，而 **CI 的 2-core runner 上超過 vitest 預設的
 *   5,000ms**：2026-09-04 的 CI 上前兩條以 `Test timed out in 5000ms` 紅掉
 *   （⭐ 與另外 4 條共用同一則錯誤訊息，⛔ **一個斷言都沒有失敗**）。
 *
 * ⚠️ ⭐ 為什麼**三條都給**，而 CI 只紅了兩條：`load()` 靠 `ready` 這個旗標記憶化，
 * 而它是**在載完之後**才設 true ⇒ 第一條逾時被砍掉時 `ready` 仍是 false
 * ⇒ 下一條重新載一次、再逾時一次。⭐ 也就是說「哪幾條會紅」取決於**執行順序**，
 * ⛔ 不是這三條各自的成本 ⇒ 只補紅過的那兩條，下一次換一個順序就換兩條紅。
 * ⚠️ 這三條測試的**內容一個位元組都沒有改**。
 */
describe("08-04 阿邦快速劍X 是二連技（GH#843 · owner 2026-08-28）", () => {
  /**
   * ⭐ **同一個受害者、同一個位置，唯一的變數是「B 落地時他身上還有沒有印記」。**
   *
   * ⚠️ 第一版用「線上 vs 線外」兩個位置當對照，而它**量不出東西** —— 幾何變成
   * 第二個變數（控制組其實也在線上／也吃到別的節點，兩次量到逐位元相同的 779.24）。
   * ⇒ 這一版把幾何整個消掉：跑兩次同一發，第二次在 B 落地**之前**把印記拔掉。
   *   差值就是「十倍那一發」，⛔ 沒有別的東西能解釋它。
   */
  const cast = async (stripMark: boolean): Promise<number> => {
    await load();
    const world = new SimWorld(SKELETON_ARENA, 5);
    const mk = (dx: number, dz: number, seat: number, team: number): EntityId =>
      spawnChampion(world, {
        championId: HERO, seatId: asSeatId(seat), teamId: asTeamId(team),
        pos: { x: C.x + dx, z: C.z + dz }, zone: 0,
      });
    const caster = mk(0, 0, 0, 0);
    const victim = mk(8, 0, 1, 1); // 線上 ＋ 落點（10.08）2.08 內
    world.step(new Map());
    world.transform.get(caster)!.facing = { x: 1, z: 0 };
    // ⭐⭐ 血池要**遠大於**這一發，否則量到的是「血條見底」⛔ 不是「這一發多大」。
    //    2026-08-28 的教訓：出貨 max HP 是 **2086**，而帶印記那一次量到的
    //    「傷害」也正好是 2086 —— 我把**死亡**讀成了「90% 傷害不見了」，
    //    還為此開了一張票（#855，已更正關閉）。⛔ 一把量不到上限之外的尺，
    //    在它最需要說話的時候只會回報上限本身。
    const pool = world.health.get(victim)!;
    pool.maxHp = 1_000_000;
    pool.hp = 1_000_000;
    const before = pool.hp;
    runEffects((Abilities.get(SUBJECT).effects ?? []) as EffectDef[], {
      world, caster, rank: 1, targets: [], point: { x: C.x + 12, z: C.z },
      origin: `ability:${SUBJECT}`, rng: world.rng,
    } satisfies EffectContext);
    for (let i = 0; i < 45; i++) {
      // 印記在 t≈1 掛上；B 段（delayed 1.0s）在 t≈32 落地。第 10 tick 拔掉
      // ⇒ A 段的傷害照吃，⛔ 只有十倍那一發拿不到。
      if (stripMark && world.tick >= 10) {
        const st = world.status.get(victim);
        if (st) st.effects = st.effects.filter((e) => e.statusId !== "aban-x-mark");
      }
      world.step(new Map());
    }
    return before - world.health.get(victim)!.hp;
  };

  it("⭐ 印記還在 ⇒ 挨十倍；印記被拔掉 ⇒ 只挨基礎那一發", async () => {
    const withMark = await cast(false);
    const without = await cast(true);
    expect(without, "把印記拔掉之後一點傷害都沒吃到 —— A 段或落點 AoE 壞了").toBeGreaterThan(0);
    expect(
      withMark,
      `⛔ 帶印記與不帶印記吃到的傷害沒有拉開（${Math.round(withMark)} vs ${Math.round(without)}）` +
        " ⇒ 十倍那一發沒有發生，或它是無條件的",
      // ⭐ 門檻 **3×**：授權值是 (500+AP×1.8)×10 ≈ 7016，而不帶印記那一次只有
      //    基礎那幾發（~1400）⇒ 真實比值 ~5×。3× 給了餘裕又擋得住「倍率沒生效」。
    ).toBeGreaterThan(without * 3);
  }, 60_000); // ⏱ 見 describe 上面的說明（GH#979）

  it("⭐⭐ 印記必須**活得比 B 段的延遲久** —— 否則這個機制是擲硬幣", async () => {
    await load();
    // ── 2026-08-28 實測到的 off-by-one ────────────────────────────────
    // 印記 1.0s（30 tick）從 t≈1 掛上 ⇒ t≈31 到期；而 B 段 `delayed 1.0s` 的
    // 傷害在 **t=32** 才落地（延遲排程 ＋ damageQueue 各吃一 tick）
    // ⇒ 條件在**它要被讀的前一個 tick**失效，十倍那一發永遠不發生。
    // ⭐ 所以這兩個數字**不是各自獨立的**：印記要蓋過延遲 ＋ 排程落地的餘裕。
    //    這一條把那個關係釘住，⛔ 不是釘住 1.5 這個數字。
    const effects = (Abilities.get(SUBJECT).effects ?? []) as EffectDef[];
    const line = effects.find((e) => e.kind === "damageLine") as never as {
      onHitTargets?: { kind: string; duration?: number }[];
    };
    const mark = (line.onHitTargets ?? []).find((e) => e.kind === "applyStatus");
    const delayed = effects.find((e) => e.kind === "delayed") as never as { delaySec?: number };
    expect(mark?.duration, "A 式沒有掛印記 —— 二連技的前提不見了").toBeDefined();
    expect(delayed?.delaySec, "B 段沒有延遲 —— 那一秒不見了").toBeDefined();
    expect(
      mark!.duration!,
      "⛔ 印記活得不比 B 段的延遲久 ⇒ 條件在它要被讀的那一刻剛好過期（實測差一個 tick）",
    ).toBeGreaterThan(delayed!.delaySec!);
  }, 60_000); // ⏱ 見 describe 上面的說明（GH#979）

  it("⭐ A 式命中會留下印記（B 式讀的就是它）", async () => {
    await load();
    const world = new SimWorld(SKELETON_ARENA, 5);
    const caster = spawnChampion(world, {
      championId: HERO, seatId: asSeatId(0), teamId: asTeamId(0), pos: { x: C.x, z: C.z }, zone: 0,
    });
    const victim = spawnChampion(world, {
      championId: HERO, seatId: asSeatId(1), teamId: asTeamId(1), pos: { x: C.x + 5, z: C.z }, zone: 0,
    });
    world.step(new Map());
    world.transform.get(caster)!.facing = { x: 1, z: 0 };
    const line = ((Abilities.get(SUBJECT).effects ?? []) as EffectDef[]).filter(
      (e) => e.kind === "damageLine",
    );
    expect(line, "出貨的 08-04 沒有 A 式那條線 —— 標本失效了").toHaveLength(1);
    runEffects(line, {
      world, caster, rank: 1, targets: [], point: { x: C.x + 12, z: C.z },
      origin: `ability:${SUBJECT}`, rng: world.rng,
    } satisfies EffectContext);
    const marks = world.status.get(victim)?.effects.map((e) => e.statusId) ?? [];
    expect(marks, "A 式命中卻沒有留下印記 ⇒ B 式永遠讀不到，二連技退化成兩段各打各的").toContain(
      "aban-x-mark",
    );
  }, 60_000); // ⏱ 見 describe 上面的說明（GH#979）
});
