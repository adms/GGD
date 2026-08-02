/**
 * 英靈殿技能試放空間 (GH#254) 的守衛。
 *
 * 這裡守的是三件「壞掉就等於功能不存在，但畫面上看起來一樣」的事：
 *
 *  ① 假人歸零之後**真的**會在 3 秒後補滿。壞掉的樣子是：打死一次之後標靶永遠
 *     消失，玩家以為「這個房間只能打一次」。
 *  ② 英雄**真的**不會移動。壞掉的樣子是：走位鍵按下去人跑出鏡頭外，而
 *     owner 明說「人不會移動，鏡頭永遠跟著人」。
 *  ③ 技能**真的**放得出來、**真的**扣到假人的血。這一條對應失敗形態 ②
 *     「算出來了但從沒送到消費端」—— 一個只畫特效不扣血的試放空間，
 *     和一個壞掉的試放空間在畫面上是同一個東西。
 *
 * ⚠️ 每一條都是**跑出貨的那一份**：`new ValhallaSandbox(...)` + `.step()`，
 * 走真的 `SimWorld.step` → `combatResolveSystem` / `deathSystem`，施法走真的
 * `castAbility`。沒有任何一條測試自己重算一次公式或自己手寫一個 world
 * （失敗形態 ⑤/⑥/⑦）。
 *
 * ⚠️ 2026-08-02 更正：這一段原本寫「走真的 `commandSystem` → `castAbility`」，
 * 而 `commandSystem` **不在**施法路徑上 —— `sb.cast()` 直呼 `castAbility`
 * （見 `valhallaSandbox.ts` 檔頭）。下面沒有任何一條測試證明得了 `CastCommand`
 * 的解析，所以那句話當初是假的（CLAUDE.md 第三守則）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { registerChampion, startDash, type AbilityDef, type ChampionDef } from "@ggd/shared/sim";
import { TICK_HZ } from "@ggd/shared/constants";
import type { AbilityId, ChampionId, ItemId } from "@ggd/shared/ids";
import {
  ValhallaSandbox,
  respawnDelayTicks,
  suppressMovementIntent,
  SUPPRESSED_ORDER_KINDS,
} from "./valhallaSandbox";
import {
  DEFAULT_VALHALLA_SANDBOX,
  VALHALLA_SANDBOX_ADMIN_FIELDS,
  VALHALLA_SANDBOX_BOUNDS,
  clampSandboxRules,
  type ValhallaSandboxRules,
} from "./valhallaSandboxRules";

const CHAMP_ID = "test-valhalla-dummy-range" as ChampionId;

/** 一發打得到、打得痛的單體技 —— 用來證明「技能真的放出去了」。 */
const NUKE: AbilityDef = {
  id: "test.valhalla.q" as AbilityId,
  name: "試放用單體技",
  slot: "Q",
  castType: "targeted",
  maxRank: 4,
  cooldown: [1, 1, 1, 1],
  manaCost: [0, 0, 0, 0],
  range: 20,
  targetsEnemies: true,
  effects: [
    {
      kind: "damage",
      damageType: "true",
      amount: { flat: 250 },
    },
  ],
} as unknown as AbilityDef;

const filler = (slot: "W" | "E" | "R"): AbilityDef =>
  ({
    id: `test.valhalla.${slot.toLowerCase()}` as AbilityId,
    name: slot,
    slot,
    castType: "self",
    maxRank: 4,
    cooldown: [1, 1, 1, 1],
    manaCost: [0, 0, 0, 0],
    range: 1,
    effects: [{ kind: "heal", amount: { flat: 1 } }],
  }) as unknown as AbilityDef;

const CHAMP: ChampionDef = {
  id: CHAMP_ID,
  name: "試放測試英雄",
  role: "fighter",
  attackType: "melee",
  modelKey: "champ.thorne",
  baseStats: {
    maxHealth: 660,
    healthRegen: 1.7,
    maxMana: 500,
    manaRegen: 1.36,
    ad: 40,
    ap: 0,
    armor: 5,
    mr: 28,
    as: 0.53,
    ms: 5.8,
    critChance: 0,
    critDamage: 1.75,
    cdr: 0,
    lifesteal: 0,
    range: 1.6,
  },
  growth: {},
  skillOrder: ["Q", "W", "E", "R"],
  buildPriority: [] as ItemId[],
  abilities: { Q: NUKE, W: filler("W"), E: filler("E"), R: filler("R") },
} as unknown as ChampionDef;

beforeAll(() => {
  registerChampion(CHAMP, { overrideAbilities: true });
});

/** 把假人打到 0 並讓 `deathSystem` 真的跑過去（不是自己寫 alive=false）。 */
function killDummy(sb: ValhallaSandbox): void {
  sb.world.health.get(sb.dummyId)!.hp = 0;
  sb.step();
}

describe("GH#254 假人：生命 10,000，歸零 3 秒後自動補滿", () => {
  it("出貨值就是 owner 明說的兩個數字", () => {
    expect(DEFAULT_VALHALLA_SANDBOX.dummyHealth).toBe(10_000);
    expect(DEFAULT_VALHALLA_SANDBOX.dummyRespawnSec).toBe(3);
  });

  it("假人以 10,000 滿血進場，而且是一個合法的敵人", () => {
    const sb = new ValhallaSandbox({ championId: CHAMP_ID });
    const f = sb.snapshot();
    expect(f.dummyMaxHp).toBe(10_000);
    expect(f.dummyHp).toBe(10_000);
    expect(f.dummyAlive).toBe(true);
    // 敵對隊伍 —— 不是的話所有 `enemiesInCircle` 都會跳過它
    expect(sb.world.team.get(sb.dummyId)!.teamId).not.toBe(
      sb.world.team.get(sb.heroId)!.teamId,
    );
    sb.dispose();
  });

  it("歸零之後整整 3 秒都還是 0，第 90 tick 才補滿（絕對 tick，不是遞減計數器）", () => {
    const sb = new ValhallaSandbox({ championId: CHAMP_ID });
    killDummy(sb);

    const armed = sb.snapshot();
    expect(armed.dummyAlive).toBe(false);
    expect(armed.dummyHp).toBe(0);
    // 排程用的是絕對 tick：補滿時刻 = 死亡當下的 tick + 90
    expect(armed.dummyRespawnAtTick).toBe(armed.tick + respawnDelayTicks(3));

    // 89 tick：還是死的。少一 tick 就補滿 = 3 秒這個數字沒有真的被遵守。
    let f = armed;
    for (let i = 0; i < TICK_HZ * 3 - 1; i++) f = sb.step();
    expect(f.dummyAlive).toBe(false);
    expect(f.dummyHp).toBe(0);

    // 第 90 tick：補滿，而且是補到**上限**，不是補到某個寫死的 10000。
    f = sb.step();
    expect(f.dummyAlive).toBe(true);
    expect(f.dummyHp).toBe(f.dummyMaxHp);
    expect(f.dummyRespawnAtTick).toBeNull();
    sb.dispose();
  });

  it("補滿之後可以再被打死、再補滿一次（不是只有第一次會動）", () => {
    const sb = new ValhallaSandbox({ championId: CHAMP_ID, rules: rules({ dummyRespawnSec: 1 }) });
    for (let round = 0; round < 2; round++) {
      killDummy(sb);
      let f = sb.snapshot();
      for (let i = 0; i < TICK_HZ; i++) f = sb.step();
      expect(f.dummyAlive).toBe(true);
      expect(f.dummyHp).toBe(f.dummyMaxHp);
    }
    sb.dispose();
  });

  it("後台把秒數調成 0 時，下一 tick 就補滿", () => {
    const sb = new ValhallaSandbox({ championId: CHAMP_ID, rules: rules({ dummyRespawnSec: 0 }) });
    killDummy(sb);
    const f = sb.step();
    expect(f.dummyAlive).toBe(true);
    expect(f.dummyHp).toBe(10_000);
    sb.dispose();
  });
});

describe("GH#254 「人不會移動，鏡頭永遠跟著人」", () => {
  it("餵一個往遠處的移動指令 60 tick，英雄的座標一格都沒有動", () => {
    const sb = new ValhallaSandbox({ championId: CHAMP_ID });
    const start = { ...sb.snapshot().heroPos };
    let f = sb.snapshot();
    for (let i = 0; i < 60; i++) {
      f = sb.step({ order: { kind: "move", point: { x: start.x + 40, z: start.z + 40 } }, commands: [] });
    }
    expect(f.heroPos.x).toBe(start.x);
    expect(f.heroPos.z).toBe(start.z);
    // 錨點就是原點本身 —— 「鏡頭永遠跟著人」在一個不動的人身上是自動成立的
    expect(f.heroPos).toEqual(sb.anchor);
    sb.dispose();
  });

  it("attackMove / attackTarget 也推不動他（追擊是移動的另一個名字）", () => {
    for (const kind of ["attackMove", "attackTarget"] as const) {
      const sb = new ValhallaSandbox({ championId: CHAMP_ID });
      const start = { ...sb.snapshot().heroPos };
      let f = sb.snapshot();
      for (let i = 0; i < 30; i++) {
        f = sb.step({
          order: { kind, point: { x: start.x + 40, z: start.z }, entity: sb.dummyId },
          commands: [],
        });
      }
      expect(f.heroPos).toEqual(start);
      sb.dispose();
    }
  });

  it("`movementLock: \"input\"` 也擋得住走位指令（兩種模式都要滿足 owner 的話）", () => {
    const sb = new ValhallaSandbox({ championId: CHAMP_ID, rules: rules({ movementLock: "input" }) });
    const start = { ...sb.snapshot().heroPos };
    let f = sb.snapshot();
    for (let i = 0; i < 60; i++) {
      f = sb.step({ order: { kind: "move", point: { x: start.x + 40, z: start.z } }, commands: [] });
    }
    expect(f.heroPos).toEqual(start);
    sb.dispose();
  });

  it("吃掉的只有移動：`aim`（面向）與 `commands`（施法）原封不動送進 sim", () => {
    const aim = { x: 0, z: 1 };
    const frame = {
      order: { kind: "move" as const, point: { x: 9, z: 9 } },
      aim,
      commands: [{ kind: "ready" as const }],
    };
    const out = suppressMovementIntent(frame);
    expect(out.order).toBeUndefined();
    expect(out.aim).toBe(aim);
    expect(out.commands).toBe(frame.commands);
    // stop / hold 是「站著」，不是移動 —— 不該被吃掉
    for (const kind of ["stop", "hold"] as const) {
      expect(suppressMovementIntent({ order: { kind }, commands: [] }).order).toEqual({ kind });
    }
    expect(SUPPRESSED_ORDER_KINDS).toEqual(["move", "attackMove", "attackTarget"]);
  });

  /**
   * ⚠️ 這一條是這一組裡**唯一**會因為拿掉 `applyMovementLock()` 而紅的。
   *
   * 突變驗證量到的：把 `this.applyMovementLock();` 從 `step()` 拿掉，上面每一條
   * 「移動指令推不動他」全部照樣綠 —— 因為那些只證明了**指令**被吃掉。
   * 一個衝刺 / 擊退 完全不經過 `IntentFrame`（`nav.override` 是效果直接寫的），
   * 所以只吃指令的版本會讓英雄整個滑出鏡頭，而 owner 說的是「人不會移動」。
   * 這一條走的是出貨的 `startDash`，也就是 47 支位移技實際用的那條路。
   */
  it("衝刺／擊退也推不動他 —— 這才是「錨定」和「只吃輸入」的差別", () => {
    const anchored = new ValhallaSandbox({ championId: CHAMP_ID });
    startDash(anchored.world, anchored.heroId, { x: 1, z: 0 }, 12, 10);
    let f = anchored.snapshot();
    for (let i = 0; i < 20; i++) f = anchored.step();
    expect(f.heroPos).toEqual(anchored.anchor);
    anchored.dispose();

    // 對照組：`movementLock: "input"` 就是**放行**技能位移的那一側。
    // 沒有這一半的話，上面那條斷言對「錨定被拿掉」與「錨定還在」都會過。
    const loose = new ValhallaSandbox({ championId: CHAMP_ID, rules: rules({ movementLock: "input" }) });
    startDash(loose.world, loose.heroId, { x: 1, z: 0 }, 12, 10);
    let g = loose.snapshot();
    for (let i = 0; i < 20; i++) g = loose.step();
    expect(g.heroPos.x).toBeGreaterThan(loose.anchor.x + 1);
    loose.dispose();
  });

  it("`aim` 真的到得了 sim —— 英雄會轉向（面向不是被移動鎖一起吃掉的）", () => {
    const sb = new ValhallaSandbox({ championId: CHAMP_ID });
    expect(sb.snapshot().heroFacing).toEqual({ x: 1, z: 0 });
    const f = sb.step({ aim: { x: 0, z: -1 }, commands: [] });
    expect(f.heroFacing.z).toBeCloseTo(-1, 6);
    sb.dispose();
  });
});

describe("GH#254 技能真的放得出來，而且真的扣到假人的血", () => {
  it("按 Q → CastResult 是 ok，假人掉血，而且掉的量出現在 damage 事件裡", () => {
    const sb = new ValhallaSandbox({ championId: CHAMP_ID });
    const before = sb.snapshot().dummyHp;
    expect(sb.cast("Q")).toBe("ok");

    let hits: number[] = [];
    let after = before;
    for (let i = 0; i < 30 && hits.length === 0; i++) {
      const f = sb.step();
      hits = f.dummyHits;
      after = f.dummyHp;
    }
    // ② 「算出來了但從沒送到消費端」：畫面畫的浮動數字讀的就是這個陣列
    expect(hits.length).toBeGreaterThan(0);
    expect(after).toBeLessThan(before);
    expect(before - after).toBeCloseTo(hits.reduce((a, b) => a + b, 0), 6);
    sb.dispose();
  });

  it("六格全開：W/E/R 進場就是 1 級（預設 `unlockAllSlots`）", () => {
    const sb = new ValhallaSandbox({ championId: CHAMP_ID });
    const ab = sb.world.abilities.get(sb.heroId)!;
    for (const slot of ["Q", "W", "E", "R"] as const) {
      expect(ab.slots[slot].rank).toBeGreaterThan(0);
    }
    sb.dispose();
  });

  it("關掉 `unlockAllSlots` 之後 W 回「還沒學」—— 這一格是真的開關，不是裝飾", () => {
    const sb = new ValhallaSandbox({ championId: CHAMP_ID, rules: rules({ unlockAllSlots: false }) });
    expect(sb.world.abilities.get(sb.heroId)!.slots.W.rank).toBe(0);
    expect(sb.cast("W", { type: "self" })).toBe("not-learned");
    sb.dispose();
  });

  it("假人在空窗期不會被當成活目標（單體技回 bad-target，對地技照樣放得出來）", () => {
    const sb = new ValhallaSandbox({ championId: CHAMP_ID });
    killDummy(sb);
    // 死著的時候預設目標會退成地面點，而 Q 是 targeted → 拒絕，不是靜默無事發生
    expect(sb.defaultTargetFor().type).toBe("point");
    sb.dispose();
  });
});

describe("GH#254 後台欄位：上下界與三個落點的清單", () => {
  it("每一格規則都有一列後台欄位描述（union 漏一格就紅）", () => {
    const declared = new Set(VALHALLA_SANDBOX_ADMIN_FIELDS.map((f) => f.key));
    const actual = Object.keys(DEFAULT_VALHALLA_SANDBOX) as (keyof ValhallaSandboxRules)[];
    for (const key of actual) expect(declared.has(key)).toBe(true);
    expect(declared.size).toBe(actual.length);
  });

  it("每一列的出貨值就是 DEFAULT 的那一個（後台頁與執行時不會漂）", () => {
    for (const f of VALHALLA_SANDBOX_ADMIN_FIELDS) {
      expect(f.shipped).toBe(DEFAULT_VALHALLA_SANDBOX[f.key]);
    }
  });

  it("數值欄位**上界下界都有**（只有下界的話 3 打成 300 會靜默過關）", () => {
    for (const f of VALHALLA_SANDBOX_ADMIN_FIELDS) {
      if (f.kind !== "number") continue;
      expect(typeof f.min).toBe("number");
      expect(typeof f.max).toBe("number");
      expect(f.max!).toBeGreaterThan(f.min!);
    }
  });

  it("超界的值被夾回界內，不是被丟掉，也不是原樣送進 sim", () => {
    const wild = clampSandboxRules(
      rules({ dummyHealth: 99_999_999, dummyRespawnSec: -5, dummyDistance: 0 }),
    );
    expect(wild.dummyHealth).toBe(VALHALLA_SANDBOX_BOUNDS.dummyHealth.max);
    expect(wild.dummyRespawnSec).toBe(VALHALLA_SANDBOX_BOUNDS.dummyRespawnSec.min);
    expect(wild.dummyDistance).toBe(VALHALLA_SANDBOX_BOUNDS.dummyDistance.min);
  });

  it("夾過的值真的被沙盒吃進去（不是只有 clamp 函式自己知道）", () => {
    const sb = new ValhallaSandbox({ championId: CHAMP_ID, rules: rules({ dummyHealth: 0 }) });
    expect(sb.snapshot().dummyMaxHp).toBe(VALHALLA_SANDBOX_BOUNDS.dummyHealth.min);
    sb.dispose();
  });

  it("`dummyDistance` 真的決定假人站哪裡", () => {
    const sb = new ValhallaSandbox({ championId: CHAMP_ID, rules: rules({ dummyDistance: 7 }) });
    const dt = sb.world.transform.get(sb.dummyId)!;
    expect(dt.pos.x - sb.anchor.x).toBeCloseTo(7, 6);
    expect(dt.pos.z).toBeCloseTo(sb.anchor.z, 6);
    sb.dispose();
  });
});

function rules(patch: Partial<ValhallaSandboxRules>): ValhallaSandboxRules {
  return { ...DEFAULT_VALHALLA_SANDBOX, ...patch };
}
