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
 * ⚠️ **一條斷言都沒有抄出貨數值**（第二守則「驗機制不驗數字」）：`durationSec`
 * 驗的是**原子與否**（leap > 0、blink 恰好 0），⛔ 不是 0.2 這個數。
 */
import { beforeAll, describe, expect, it } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const CONTENT = join(REPO, "content");

/**
 * 外送分類的**真的那兩個 Set**。
 *
 * ⚠️ ⭐ 為什麼是動態載入而不是 `import`：`packages/shared/tsconfig.json` 有
 * `rootDir`，靜態 import `apps/` 底下的檔會被 tsc 判 **TS6059**（實測過）。
 * ⛔ 而退回「readFileSync 然後找 `"displace"` 這個字」是失敗形態⑥ ——
 * ⭐ `"displace"` 在那個檔的**註解裡就出現了三次**，一個字串比對對**分類壞掉**
 * 的世界也會回答「有」。⇒ 載入真的模組，讀真的 Set。
 */
async function fanoutSets(): Promise<{
  FANNED_OUT_EVENT_TYPES: ReadonlySet<string>;
  SERVER_ONLY_EVENT_TYPES: ReadonlySet<string>;
}> {
  const href = pathToFileURL(join(REPO, "apps/game-server/src/net/eventFanout.ts")).href;
  return (await import(/* @vite-ignore */ href)) as Awaited<ReturnType<typeof fanoutSets>>;
}
const C = SKELETON_ARENA.zones[0]!.center;

/** 三個標本 —— 每一種 mode 一支**出貨技能**；`dash` 那一支是為了量缺口（第④條）。 */
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
  //    `id !== caster` 才講得清楚。
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

  it("③⭐ 它**過線了** —— ⛔ 不開線的話 phase 與 abilityId 送不到編輯器", async () => {
    const { FANNED_OUT_EVENT_TYPES: FANNED_OUT, SERVER_ONLY_EVENT_TYPES: SERVER_ONLY } =
      await fanoutSets();
    // ⛔⛔ 這一條在 2026-09-02 **翻面了**。
    //
    // 原本它釘住的是「`displace` 在 `SERVER_ONLY`」——而那個狀態的理由
    // （`eventFanout.ts` 逐字：「與已外送的 `leapStart` 講同一件事」）
    // ⭐ 在同一天**失效了**：`leapStart` 只涵蓋**跳躍**，
    // ⛔ 而 `displace` 是**三種位移共用**（dash / blink / leap 三個發射站），
    // 而且它現在帶著 `phase` 與 `abilityId`。
    //
    // ⇒ ⭐ 不開線 ＝ Codex 逐字要的那兩格**送不到編輯器** ＝ 積木等於沒做
    //   （失敗形態⑧：發得出去、沒有人接得到）。
    //
    // ⚠️ 動態載入真的那個 Set，⛔ 不是字串 grep ——「displace」在該檔的註解裡
    //   出現超過三次，grep 會兩個方向都答錯。
    expect(
      FANNED_OUT.has("displace"),
      "⛔ `displace` 不在 FANNED_OUT_EVENT_TYPES 裡 ⇒ ⭐ 它到不了客戶端，\n" +
        "   而上面那幾條驗到的 `phase` / `abilityId` 就只是伺服器自己知道的事。",
    ).toBe(true);
    expect(
      SERVER_ONLY.has("displace"),
      "⛔ 它同時在兩張表上 ⇒ 白名單自相矛盾",
    ).toBe(false);
  });

  it("④⭐ **三個發射站全部**帶著 phase 與 abilityId（⛔ 缺一個就是形態⑧）", () => {
    // ⛔⛔ 這一條在 2026-09-02 **翻面了**，而翻面的過程本身值得記：
    //
    // ⭐ 這條 lane 的柵欄只給了 `leap.ts` 與 `blink.ts` 兩個檔 ——
    //   而它**查出來有第三站**（`effects/dash.ts:36`），
    //   ⭐ 於是它**宣告而不偷改**：把缺口寫進這一條，訊息指名要改哪幾行。
    // ⇒ ⭐ 主 session 據此補上第三站，這一條就從「釘住缺口」變成「釘住完整」。
    //
    // ⚠️ 而缺一站的代價**不是少一個功能**：消費端讀 `ev.data.phase`
    //   在衝刺上會拿到 **`undefined`** —— 一個「有 case、而它讀一個零寫入端的
    //   欄位」的洞（失敗形態⑧，CLAUDE.md 記著它一天中過五次）。
    for (const mode of ["leap", "blink", "dash"] as const) {
      const ev = realWirePayload(mode);
      expect(ev.mode, `標本失效了 —— 這一支已經不是 ${mode}`).toBe(mode);
      expect(
        (ev as { phase?: string }).phase,
        `⛔ ${mode} 的 displace 沒有 phase ⇒ 編輯器分不出起點與終點`,
      ).toBeDefined();
      expect(
        (ev as { abilityId?: unknown }).abilityId !== undefined,
        `⛔ ${mode} 的 displace 沒有 abilityId 那一格（null 是合法值，⛔ 缺席不是）`,
      ).toBe(true);
    }
  });
});
