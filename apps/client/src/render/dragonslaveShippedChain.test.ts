/**
 * @visual-proof 🐉 GH#779 —— 莉娜 04-03 龍破斬「零特效只剩文字」的出貨鏈契約。
 *
 * ── 為什麼 `modelFxWireContract` 擋不住這一張票 ─────────────────────────────
 * 那一支驗的是「sim 的 payload → VfxSystem → rig」，⛔ 但它**手動呼叫**
 * `vfx.handleEvent`。owner 看到的形狀（浮動文字在、光束一具都沒有）多出一段
 * 它蓋不到的路：**GameApp 的 frame drain** —— 每一則事件要按順序穿過十幾個
 * sink（vfx → views → casts → 相機 → SFX → 語音 → HUD 記錄器），而
 * `GameApp.ts` 全檔零個 `try` ⇒ 任何一個 sink 在同一批的**前一則**事件上
 * 擲例外，後面的 `modelFxSpawn` 就整批消失（GH#608 的形狀）——
 * 而浮動文字因為 `vfx.handleEvent` 是**第一個** sink，永遠先畫出來。
 * ⇒「只剩文字」正是「batch 在 vfx 之後的某個 sink 死掉」在畫面上的樣子。
 *
 * ⇒ 這一支把整段接起來：**出貨內容 → 真 SimWorld → 出貨 `castAbility`（真詠唱
 * 1.233s）→ 每 tick 的真事件批 → `GameApp.prototype.drainNetworkEvents`
 * （真的那一支，stub `this` 手法同 `ui/hud/killCombo.test.ts`）→ 真 `VfxSystem`
 * → 真 `ModelFxRig` → 斷言**出貨場景樹**上兩具模型的節點都在。**
 *
 * ⚠️ 誠實邊界：`views`/`casts`/相機/語音/SFX 佇列是 noop stub（要 Babylon 全套
 * 或 AudioContext），所以「那幾個 sink 自己擲例外」這一族仍然只有真瀏覽器
 * 抓得到 —— 那一半的證據住 `docs/_reports/dragonslave_visual-proof_<ts>` 目錄
 * （beam-audition 的連續像素圖）。HUD 記錄器（recordCastEvent 那一族）與
 * zone cue 判準跑的是**真的**。
 *
 * ── 突變紀錄（一批一條，最承重的那一行）────────────────────────────────────
 *  · `VfxSystem.ts` 的 `case "modelFxSpawn"` 改回 GH#606 之前的形狀
 *    （`const p = (ev.data as { spec?: ModelFxSpawnEvent }).spec; if (!p) break;`）
 *    → 本檔紅：「⛔ 龍破斬的光束本體一具都沒生出來」（axis 節點 0 個）。
 *    改回 → 綠。（2026-08-27，一批一條。）
 */
import { beforeAll, describe, expect, it } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { ContentLoader } from "@ggd/shared/content/loader";
import { shippedContentSource } from "@ggd/shared/content/__fixtures__/shippedContent";
import {
  Arenas,
  Configs,
  Models,
  StatusEffects,
  VfxDefs,
  registerAll,
} from "@ggd/shared/content/registries";
import {
  Abilities,
  Augments,
  Champions,
  Items,
  LootTables,
  Projectiles,
} from "@ggd/shared/sim/content/registry";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import { castAbility } from "@ggd/shared/sim/abilities/abilitySystem";
import { asSeatId, asTeamId, type AbilityId, type ChampionId } from "@ggd/shared/ids";
import { GameApp } from "../GameApp";
import { VfxSystem } from "../vfx/VfxSystem";
import { VisibleZones } from "../net/zoneVisibility";
import { modelFxDocFor } from "./modelFxRig";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const CASTER = "godie-h020" as ChampionId; // 黑魔導士．莉娜因巴斯
const SUBJECT = "godie-h020.e" as AbilityId; // 04-03 龍破斬
/** 詠唱 1.233s（37 tick）＋ 飛行 12u/27.5u·s⁻¹（14 tick）＋ 落點餘裕。 */
const TICKS_TO_RUN = 60;

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(shippedContentSource(CONTENT)).load()).store);
});

/** killCombo.test.ts 的同一個手法：真 prototype、collaborator 換成惰性 own-property。 */
interface DrainSeam {
  drainNetworkEvents(state: null, localId: number | null, nowMs: number): void;
}

function drainSeam(vfx: VfxSystem, nextBatch: () => unknown[]): DrainSeam {
  const noop = (): void => {};
  return Object.assign(Object.create(GameApp.prototype) as object, {
    sessions: { primary: { drainEvents: nextBatch } },
    vfx, // ⭐ 真的 VfxSystem —— 這正是 killCombo 那一支 stub 掉、而本檔要驗的那一格
    views: { handleEvent: noop },
    casts: { handleEvent: noop },
    sfxQueue: { push: noop },
    deathFocus: { noteDeath: noop },
    applyCombatFeedback: noop,
    dispatchContextualVoice: noop,
    pushVfxSound: noop,
    routeScreenCue: noop,
    audioEntityPos: () => null,
    audioTeamOf: () => null,
    zoneOfEntity: () => null,
    visibleZones: new VisibleZones(), // 預設放行全部（重算之前 everything=true）
    batchProfiled: false,
    frameKicks: 0,
  }) as unknown as DrainSeam;
}

describe("GH#779 龍破斬的出貨鏈（真 content → 真詠唱 → 真 GameApp drain → 真 rig）", () => {
  it("施放一次，浮動文字與兩具模型（fireblast 光束 + monsoonbolt 落雷）都走到場景樹", () => {
    const world = new SimWorld(SKELETON_ARENA, 1);
    world.combatActive = true;
    const c = SKELETON_ARENA.zones[0]!.center;
    const caster = spawnChampion(world, {
      championId: CASTER,
      seatId: asSeatId(0),
      teamId: asTeamId(0),
      pos: { x: c.x, z: c.z },
      zone: 0,
    });
    world.step(new Map());
    world.transform.get(caster)!.facing = { x: 1, z: 0 };

    // E 還沒學 ⇒ castAbility 會拒絕 —— 這裡只把 rank 抬到 1（出貨的升級路徑
    // 是 abilityRankUp intent，這一步不是被測物）。魔力補滿（288 耗魔）。
    const ab = world.abilities.get(caster)!;
    (ab.slots as { E: { rank: number } }).E.rank = 1;
    const hp = world.health.get(caster)!;
    hp.mana = hp.maxMana;

    const verdict = castAbility(world, caster, "E", {
      type: "point",
      point: { x: c.x + 10, z: c.z },
    });
    expect(verdict, "出貨的 castAbility 拒絕了龍破斬 —— 標本失效了").toBe("ok");

    const scene = new Scene(new NullEngine());
    const vfx = new VfxSystem(scene, {
      entityPos: () => null,
      modelDocFor: (k: string) => modelFxDocFor(Models.tryGet(k) ?? null),
      loadModelContainer: () => Promise.resolve(null),
      vfxDoc: (k: string) => VfxDefs.tryGet(k) ?? null,
    } as never);

    let batch: unknown[] = [];
    const seam = drainSeam(vfx, () => batch);
    const seen: Record<string, number> = {};
    for (let t = 0; t < TICKS_TO_RUN; t++) {
      world.step(new Map());
      // ⚠️ step() 的第一行清空 events ⇒ 每 tick 讀完整批（同 beamAudition 的 drain）。
      batch = [...world.events];
      for (const ev of world.events) seen[ev.type] = (seen[ev.type] ?? 0) + 1;
      // ⭐ 真的 GameApp drain。任何一個 sink 在這一批上擲例外 ⇒ 本測試當場紅 ——
      //    那正是「浮動文字在、光束不在」的 GH#608 形狀。
      seam.drainNetworkEvents(null, null, t * (1000 / 30));
    }

    // sim 那一半：兩則 modelFxSpawn（光束本體 + 落雷 dummy）、詠唱台詞、落點爆炸。
    expect(seen["modelFxSpawn"] ?? 0, "sim 沒有發出兩則 modelFxSpawn").toBe(2);
    expect(seen["floatingText"] ?? 0, "詠唱台詞的 floatingText 沒有發出").toBeGreaterThan(0);
    expect(seen["vfxSpawn"] ?? 0, "落點爆炸（onArrive spawnVfx）沒有發出").toBeGreaterThan(0);

    // 客戶端那一半：**出貨場景樹**上兩具模型的實例節點（⛔ 不是讀 rig 的內部欄位）。
    const axisNodes = scene.transformNodes.filter((n) => n.name.startsWith("modelfx-axis-"));
    expect(
      axisNodes.some((n) => n.name.includes("imported.fireblast")),
      "⛔ 龍破斬的光束本體一具都沒生出來 —— #606/#779 的形狀",
    ).toBe(true);
    expect(
      axisNodes.some((n) => n.name.includes("w3x.stock.monsoonbolttarget")),
      "⛔ 落雷 dummy（tpl-locust-strike × monsoonbolttarget）沒有生出來",
    ).toBe(true);

    vfx.dispose();
  });
});
