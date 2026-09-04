/**
 * ⭐⭐ **`displace` 的演出契約**（Codex 阻塞清單 P0-5）。
 *
 * Codex 逐字說的問題是：「目前 `displace` 主要只有角色 ID 與 mode，不足以讓 Editor
 * 安全判斷：哪一支技能造成位移／這是起點、途中、命中還是終點／應該播放哪個動作／
 * 如何對應 strikeIndex」。
 *
 * ⇒ ⭐ 這一條**整條線都用出貨的東西**：出貨內容 → 出貨技能 → sim **真的**送出的
 *   那一則 `displace`。⛔ 一格 payload 都不自己捏 —— 手寫夾具量到的是一個**虛構
 *   通道**（CLAUDE.md 失敗形態⑤：被測的不是出貨的那個）。
 *
 * ── 突變紀錄（一批一條，挑最承重的那一行）─────────────────────────────────
 *  · ⭐ 承重線 —— `movement/leap.ts::startLeap` 的 emit 拿掉 `phase: "start"`
 *    （＝回到 P0-5 之前那個「只有 id 與 mode」的酬載）
 *      → 紅：「⛔ leap 的 displace 沒有 phase ⇒ 編輯器分不出起點與終點」
 *
 * ── ⚠️ 這一條**不驗數字**（第二守則）──────────────────────────────────────
 * 沒有一條斷言抄出貨數值：`durationSec` 只驗「leap > 0 而 blink 恰好是 0」
 * （那是**原子與否**這個機制，⛔ 不是 0.2 這個數），`abilityId` 只驗它與**唯一的
 * 解析器**同意（⛔ 不是字面比對某一支技能的 id）。
 */
import { beforeAll, describe, expect, it } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "../content/loader";
import { shippedContentSource } from "../content/__fixtures__/shippedContent";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "./content/registry";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { runEffects } from "./effects/effectRunner";
import { abilityIdOfOrigin } from "./combat/damage";
import type { DisplaceEvent } from "./movement/leap";
import type { EffectContext, EffectDef } from "./effects/effect";
import { asSeatId, asTeamId, type AbilityId, type ChampionId } from "../ids";
import { FANNED_OUT_EVENT_TYPES, SERVER_ONLY_EVENT_TYPES } from "../../../../apps/game-server/src/net/eventFanout";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const C = SKELETON_ARENA.zones[0]!.center;

/**
 * 三個標本 —— **每一種 mode 一支出貨技能**（⛔ 不是三份夾具）。
 * `dash` 那一支在這裡是為了把**已知的缺口**量出來（見第④條）。
 */
const SPECIMENS = {
  leap: { champion: "godie-hart", ability: "godie-hart.q", slot: "Q" },
  blink: { champion: "godie-o00k", ability: "godie-o00k.w", slot: "W" },
  dash: { champion: "godie-h01n", ability: "godie-h01n.q", slot: "Q" },
} as const;

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(shippedContentSource(CONTENT)).load()).store);
});

/** 施放**出貨的**那一支，回傳 sim 真的送出的那一則 `displace`。 */
function realWirePayload(kind: keyof typeof SPECIMENS): DisplaceEvent {
  const s = SPECIMENS[kind];
  const world = new SimWorld(SKELETON_ARENA, 1);
  const caster = spawnChampion(world, {
    championId: s.champion as ChampionId,
    seatId: asSeatId(0), teamId: asTeamId(0), pos: { x: C.x, z: C.z }, zone: 0,
  });
  // ⚠️ 一個真的**目標**（⛔ 不是施法者自己）—— 「52-02 丟受害者」那一族靠
  //    `id !== caster` 才講得清楚，而一支對自己施放的標本量不到那個差別。
  const victim = spawnChampion(world, {
    championId: s.champion as ChampionId,
    seatId: asSeatId(1), teamId: asTeamId(1), pos: { x: C.x + 5, z: C.z }, zone: 0,
  });
  world.step(new Map());
  const def = Abilities.tryGet(s.ability as AbilityId);
  expect(def, `${s.ability} 不在註冊表裡 —— 標本被改名或內容載入失敗了`).toBeDefined();
  runEffects((def!.effects ?? []) as EffectDef[], {
    world, caster, rank: 1, targets: [victim],
    point: { x: C.x + 5, z: C.z },
    origin: `ability:${s.ability}`,
    abilitySlot: s.slot,
    rng: world.rng,
  } satisfies EffectContext);
  // ⚠️ 要在下一次 step() **之前**讀（step 第一行清空 events）。
  const ev = world.events.find((e) => e.type === "displace");
  expect(ev, `出貨的 ${s.ability} 沒有發出 displace —— 標本失效了`).toBeDefined();
  return ev!.data as unknown as DisplaceEvent;
}

describe("displace 的演出契約（Codex P0-5）", () => {
  it("①⭐ leap 是**起點**、blink 是**終點** —— 編輯器分得出來（承重）", () => {
    const leap = realWirePayload("leap");
    const blink = realWirePayload("blink");
    expect(leap.phase, "⛔ leap 的 displace 沒有 phase ⇒ 編輯器分不出起點與終點").toBe("start");
    expect(blink.phase, "⛔ blink 的 displace 沒有 phase ⇒ 編輯器分不出起點與終點").toBe("end");
    expect(leap.mode).toBe("leap");
    expect(blink.mode).toBe("blink");
    // ⭐ 「還要飛多久」與「已經到了」—— ⛔ 驗的是**原子與否**這個機制，不是秒數。
    expect(leap.durationSec, "⛔ 起跳那一則說飛行時間是 0 ⇒ 演出對不到落地").toBeGreaterThan(0);
    expect(blink.durationSec, "⭐ 瞬移是原子的：同一 tick 就到了").toBe(0);
    // ⭐ 誰造成的 / 誰被位移 —— 兩格都要有真的 entity id（⛔ 不是 undefined）。
    // ⚠️ `slot` 對照的是**那一支標本自己的**格子（⛔ 不是抄一個字面值 —— 兩支標本
    //    剛好一支是 Q 一支是 W，寫死任何一個都會在另一支上說謊）。
    for (const [w, s] of [[leap, SPECIMENS.leap], [blink, SPECIMENS.blink]] as const) {
      expect(typeof w.id, "⛔ id 不是數字 ⇒ WorldHookSystem 的 actorKey 掛不上人").toBe("number");
      expect(typeof w.caster, "⛔ caster 不是數字 ⇒ 「誰造成這次位移」答不出來").toBe("number");
      expect(w.slot, "⛔ 少了 slot ⇒ 「該播哪一格的動作」答不出來").toBe(s.slot);
    }
  });

  it("②⭐ `abilityId` 與**唯一的**解析器同意（⛔ 兩份不會分岔）", () => {
    for (const kind of ["leap", "blink"] as const) {
      const w = realWirePayload(kind);
      expect(typeof w.origin, "⛔ origin 是 provenance 標籤，⛔ 不是座標").toBe("string");
      expect(
        w.abilityId,
        `⛔ ${kind} 的 abilityId 與 abilityIdOfOrigin(origin) 不一致 ⇒ ` +
          "⭐ 那就是第〇·四守則說的第二個住處，而它已經漂了",
      ).toBe(abilityIdOfOrigin(w.origin) ?? null);
      expect(w.abilityId, "⛔ 解不出技能 id ⇒ Codex 的 sourceIdentity 仍然拿不到").not.toBeNull();
    }
  });

  it("③⛔ 它**沒有過線** —— 這一則今天到不了客戶端（刻意的，但要被量出來）", () => {
    expect(
      FANNED_OUT_EVENT_TYPES.has("displace"),
      "⭐ `displace` 現在過線了 —— ⛔ 那就要有人畫它，並且回頭刪掉這一條斷言",
    ).toBe(false);
    expect(
      SERVER_ONLY_EVENT_TYPES.has("displace"),
      "⛔ `displace` 兩張表都不在 ⇒ 它是一個**沒有人分類過**的事件（既不外送也沒有理由）",
    ).toBe(true);
    // ⇒ ⭐ 所以這份酬載今天**只餵 hook**（`WorldHookSystem` 的 onDashOrBlink）。
    //    Codex 要的「Editor 讀得到 phase」還差**開線**那一步，而開線是
    //    `eventFanout.ts` 的事 —— ⛔ 不在這條 lane 的柵欄裡。
  });

  it("④⛔ 已知缺口：第三個發射站 `effects/dash.ts:36` 還沒採用這個型別", () => {
    const dash = realWirePayload("dash");
    expect(dash.mode, "標本失效了 —— 這一支已經不是 dash").toBe("dash");
    expect(
      (dash as { phase?: string }).phase,
      "⭐ dash 補上 phase 了 —— ⛔ 這不是回歸，是**缺口關掉了**：\n" +
        "  ① 把 `effects/dash.ts:36` 的 emit 加上 `satisfies DisplaceEvent`\n" +
        "  ② 把 `movement/leap.ts` 的 `DisplaceEvent` 檔頭那張表改成三個 ✅\n" +
        "  ③ 把這一條改成 expect(dash.phase).toBe(\"start\")",
    ).toBeUndefined();
  });
});
