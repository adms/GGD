/**
 * B3 綁定守衛 —— 兩支**出貨技能**的多層特效,在真的引擎上真的變成多組發射器。
 *
 * ---------------------------------------------------------------------------
 * 這一條和 `VfxSystem.layers.test.ts` 的差別
 * ---------------------------------------------------------------------------
 * 那一條測的是**機制**(「schema 收得下、runtime 播得出來」),用的是測試自己
 * 合成的 doc。這一條測的是**這次綁定本身**:它從 `content/abilities/` 讀
 * 真的檔案、過真的 `zAbilityDoc`、餵給真的 `VfxSystem.handleEvent`,然後讀
 * Babylon 手上發射器的粒子參數。
 *
 * ⛔ 這裡刻意**沒有**「我這桶綁了 N 支 fx.w3x.*」這種普查斷言 —— GH#230 已經有
 * 那種測試,它綠著而玩家一直看到替身。斷言全部指向「引擎輸出的參數真的不同」。
 *
 * ⚠️ 「綁定前」必須用**同一個 ability id** 註冊,不能用 `<id>.unbound` 這種
 * 複製品:`w3xFamilyArtRows()` 是**用 id 當 key** 的,換了 id 就掉出家族推導,對照組
 * 會退回 `fx.prim.*`,於是「綁定後比綁定前多」變成一句廢話(第④號故障:斷言
 * 方向跟缺陷無關)。第一版就是這樣寫的,量到才發現 —— 對照組播的是
 * `fx.prim.void.explosion-lg` 而不是 `fx.fam.burst.w3x-ff0000.s150`。
 *
 * ---------------------------------------------------------------------------
 * 兩支技能的層是從 JASS 抄下來的,不是挑的
 * ---------------------------------------------------------------------------
 * `tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j`:
 *
 * · `godie-u00j.ex` 74-002 超新星 = `Trig_Supernova_*`('A0S3')
 *     TriggerSleepAction 0.10 → 位移到目標前 150 → TriggerSleepAction 0.10
 *     → 對目標 600 範圍內每個單位 AddSpecialEffectLoc `FlameStrikeTarget.mdl`
 *   → 主爆(w3a `ability.targetArt` = `stampedemissiledeath`,family `burst`)
 *     在 t=0;火柱(`flamestriketarget`,family `flamePillar`)在 **t=200 ms**。
 *
 * · `godie-o02v.w` 81-02 Acxel Shooter = `Trig_AcxelShooter_*`('A0LB')
 *     AddSpecialEffectLoc(caster) `MarkOfChaosTarget.mdl`   ← t=0
 *     TriggerSleepAction 0.05 → TriggerSleepAction 0.30
 *     AddSpecialEffectLoc(target) `FireLordDeathExplode.mdl` ← t=0.35
 *   → `mark` 在 t=0,`burst` 在 **t=350 ms**。
 *
 * 每一層的 `vfxKey` 也不是手挑的字串:它是 `resolveFamilyArt` /
 * `nearestBakedFamilyKey`(出貨的那兩支函式)對「這支技能 + 這個 family」給出
 * 的答案。第一條測試就是把這件事釘住的 —— 有人動了家族推導,這裡會紅,而不是
 * 讓內容檔和推導安靜地漂開。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
// GH#384 —— 逐技能特效綁定住在 content/；⛔ 少了這一行從 repo 根跑單檔會看到空的綁定。
import "../render/vfx/shippedAbilityArt.testkit";
import { existsSync, readFileSync } from "node:fs";
import { readContentJson } from "../testkit/contentFixtures";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));
import { Scene } from "@babylonjs/core/scene";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { Abilities } from "@ggd/shared/sim/content/registry";
import type { AbilityId } from "@ggd/shared/ids";
import type { VfxDoc } from "@ggd/shared/content";
import { zAbilityDoc } from "@ggd/shared/content/schema/ability";
import { resolveFamilyArt, nearestBakedFamilyKey } from "../render/vfx/familyTuning";
import { VfxSystem, type VfxContext } from "./VfxSystem";

const root = (p: string): string => fileURLToPath(new URL(`../../../../${p}`, import.meta.url));
const loadVfx = (id: string): VfxDoc =>
  JSON.parse(readFileSync(root(`content/vfx/${id}.json`), "utf8")) as VfxDoc;
const loadAbility = (id: string): Record<string, unknown> =>
  // GH#323 —— 走 `readContentJson`：先 `content/`，再 `content/_legacy/`。
  // ⚠️ 這幾支技能在 2026-08-13 隨著它們的英雄退場了，但這條測試驗的是**引擎**
  //    （vfxLayers 會不會變成多組發射器），doc 只是夾具 —— 它在不在名單上不影響。
  
  readContentJson<Record<string, unknown>>(`abilities/${id}.json`);

const SUPERNOVA = "godie-u00j.ex";
// ⭐ 2026-08-27：原本是 `godie-o02v.w` —— ⛔ **那支技能今天在 `content/abilities/` 裡
//   一個檔都沒有**（只有 `.e` 與 `.ex`）。普查跟著內容重跑（#777）之後它的家族列
//   被正確地剪掉，於是 `resolveFamilyArt()` 回 undefined，而這一條用
//   「burst 層必須就是今天在播的那個家族 key」紅 —— ⭐ 一句與真相無關的訊息
//   （真相是**夾具指著一支不存在的技能**，失敗形態⑩）。
// ⚠️ 逐支掃過出貨內容：今天**只有 `godie-u00j.ex` 一支**同時滿足
//   「2 層 vfxLayers」與「家族解析得到」⇒ 兩個區塊共用同一份 doc，
//   ⭐ 但各自套**不同的家族覆寫**（`flamePillar` vs `mark`）—— 那個區別才是這裡在守的。
//   ⛔ 沒有為了湊一支「看起來不一樣」的技能而挑一個家族解析不到的（那會讓它永遠綠）。
const ACXEL = "godie-o02v.w";

let engine: NullEngine;
let scene: Scene;

/** 出貨檔 → 真的 Zod → 註冊到**它自己的 id** 上。 */
function registerShipped(id: string): void {
  Abilities.register(id as AbilityId, zAbilityDoc.parse(loadAbility(id)) as never);
}
/** 「綁定之前」= 同一份出貨檔拿掉 `vfxLayers`,**id 一字不改**。 */
function registerUnbound(id: string): void {
  const raw = { ...loadAbility(id) };
  delete raw.vfxLayers;
  Abilities.register(id as AbilityId, zAbilityDoc.parse(raw) as never);
}

beforeAll(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
});
afterAll(() => {
  scene.dispose();
  engine.dispose();
});
beforeEach(() => {
  registerShipped(SUPERNOVA);
  registerShipped(ACXEL);
});

function harness(): { sys: VfxSystem; resolved: string[] } {
  const resolved: string[] = [];
  const ctx: VfxContext = {
    entityPos: () => ({ x: 0, z: 0 }),
    vfxDoc: (key: string) => {
      try {
        const d = loadVfx(key);
        resolved.push(key);
        return d;
      } catch {
        return null;
      }
    },
  };
  return { sys: new VfxSystem(scene, ctx), resolved };
}

const cast = (abilityId: string): EventMessage =>
  ({ type: "abilityCast", data: { abilityId, caster: 1 } }) as unknown as EventMessage;

interface Snap {
  name: string;
  peakSize: number;
  maxLife: number;
  blend: number;
  texture: string;
}

/**
 * 這一刻場上的**文件型**發射器。名字有兩種前綴,而**這兩種前綴本身就是量到的
 * 事實**:
 *
 *   · `w3xfx-<doc id>` = `W3xEmitterRig`(`playCastVfx` 階梯第 1 級)
 *   · `vfx-<doc id>`   = pooled `play()`(第 2 級,以及 `vfxLayers` 的第 0 級)
 *
 * 刻意排掉 `vfx-preset-*`:那是 EX 施法的 `layeredPop`(flash / sparks /
 * smoke),和層堆疊沒有關係,算進來只會讓計數變成噪音。
 */
function docSystems(before: readonly unknown[] = []): Snap[] {
  return scene.particleSystems
    .filter(
      (ps) =>
        (ps.name.startsWith("vfx-fx.") || ps.name.startsWith("w3xfx-fx.")) && !before.includes(ps),
    )
    .map((ps) => {
      // ⚠️ Babylon 的 FactorGradient 欄位是 `factor1`,不是 `factor`
      // (`VfxSystem.layers.test.ts` 檔頭記過這個坑:寫錯會拿到 NaN,而
      // `not.toBeCloseTo(NaN)` 是會過的 —— 第④號故障)。
      const sizes = (ps.getSizeGradients() ?? []).map((g) => g.factor1);
      for (const s of sizes) expect(Number.isFinite(s), `size 不是有限數:${String(s)}`).toBe(true);
      return {
        name: ps.name,
        peakSize: sizes.length > 0 ? Math.max(...sizes) : ps.maxSize,
        maxLife: ps.maxLifeTime,
        blend: ps.blendMode,
        texture: (ps.particleTexture as { name?: string } | null)?.name ?? "",
      };
    });
}

const layerKeysOf = (id: string): string[] =>
  ((Abilities.get(id as AbilityId) as unknown as { vfxLayers?: { vfxKey: string }[] }).vfxLayers ?? []).map(
    (l) => l.vfxKey,
  );

/** 發射器名字 → 它播的 vfx doc id(去掉播放路徑前綴與覆寫簽章)。 */
function docIdOf(name: string): string {
  return name.replace(/^(w3xfx-|vfx-)/, "").split("#")[0]!;
}

/** 兩個發射器在引擎上是不是真的長得不一樣(不是比 id 字串)。 */
function reallyDiffer(a: Snap, b: Snap): boolean {
  return (
    a.texture !== b.texture ||
    a.blend !== b.blend ||
    Math.abs(a.peakSize - b.peakSize) > 1e-4 ||
    Math.abs(a.maxLife - b.maxLife) > 1e-4
  );
}

describe("B3 綁定:出貨技能的多層特效在引擎上真的是多組發射器", () => {
  it("兩支技能的層 key 都是家族推導的輸出,不是手打的字串", () => {
    const nova = layerKeysOf(SUPERNOVA);
    expect(nova, "godie-u00j.ex 沒有 vfxLayers").toHaveLength(2);
    expect(nova[0], "第一層必須就是今天在播的那個家族 key").toBe(
      resolveFamilyArt(SUPERNOVA, null)?.vfxKey,
    );
    const pillar = resolveFamilyArt(SUPERNOVA, {
      schema: "config.vfx-families@1",
      id: "vfx-families",
      enabled: true,
      abilities: { [SUPERNOVA]: { family: "flamePillar" } },
    } as never);
    expect(pillar).toBeDefined();
    expect(nova[1]).toBe(nearestBakedFamilyKey(pillar!.family, pillar!.colour, pillar!.docScale));

    // ⭐⭐ 2026-08-27：`godie-o02v.w` 今天在 `content/abilities/` 裡**一個檔都沒有**
    //   （只有 `.e` 與 `.ex`）。普查跟著內容重跑（#777）之後它的家族列被正確剪掉
    //   ⇒ `resolveFamilyArt()` 回 undefined，而這一條用「burst 層必須就是今天在播的
    //   那個家族 key」紅 —— ⭐ **一句與真相無關的訊息**（真相是夾具指著一支不存在的
    //   技能，失敗形態⑩）。
    // ⚠️ 逐支掃過出貨內容：今天**只有 `godie-u00j.ex` 一支**同時滿足「2 層 vfxLayers」
    //   與「家族解析得到」，而它已經是下面那一條的夾具 —— 共用會互相干擾（實測：
    //   兩條一起紅）。
    // ⇒ ⭐ **明說「這一半無事可守」，⛔ 不假裝綠、⛔ 也不挑一支家族解析不到的來湊
    //   （那會讓它永遠綠 —— 比刪掉更糟）。** 補一支合格的夾具＝ GH#529 的活。
    const live = resolveFamilyArt(ACXEL, null);
    if (live === undefined) {
      // ⭐ 反方向：**證明它真的不在**（⛔ 不是「解析不到就跳過」——
      //   那會讓一個真的壞掉的家族解析也靜靜地跳過去）。
      // ⚠️ ⛔ **不可以**用 `readContentJson` 問這一題 —— 它會**退回 `content/_legacy/`**
      //   （檔頭 GH#323 逐字寫著），於是一支退休技能也回「存在」⇒ 這條反方向會永遠紅。
      //   ⭐ 問的是「**出貨的** `content/` 裡有沒有」，所以直接看檔案系統。
      const shipped = existsSync(
        join(dirname(fileURLToPath(import.meta.url)), "../../../../content/abilities", `${ACXEL}.json`),
      );
      expect(
        shipped,
        `⛔ ${ACXEL} 在出貨內容裡**存在**，而它的家族卻解析不到 —— 那是真的壞了，⛔ 不是「這支退場了」。`,
      ).toBe(false);
      return;
    }
    const acxel = layerKeysOf(ACXEL);
    expect(acxel, `${ACXEL} 沒有 vfxLayers`).toHaveLength(2);
    expect(acxel[1], "burst 層必須就是今天在播的那個家族 key").toBe(live.vfxKey);
    const mark = resolveFamilyArt(ACXEL, {
      schema: "config.vfx-families@1",
      id: "vfx-families",
      enabled: true,
      abilities: { [ACXEL]: { family: "mark" } },
    } as never);
    expect(mark).toBeDefined();
    expect(acxel[0]).toBe(nearestBakedFamilyKey(mark!.family, mark!.colour, mark!.docScale));
  });

  it("超新星:綁定前只有主爆一組,綁定後多出一組火柱,而且兩組參數不同", () => {
    const keys = layerKeysOf(SUPERNOVA);

    // ---- 對照組:同一個 id、同一份檔,只是沒有 vfxLayers ----
    registerUnbound(SUPERNOVA);
    const s0 = [...scene.particleSystems];
    const h0 = harness();
    h0.sys.handleEvent(cast(SUPERNOVA), 1_000);
    h0.sys.update(1_400);
    const before = docSystems(s0);
    expect(
      before.map((s) => s.name),
      "綁定前應該就是家族推導的那一組主爆(走 rig)",
    ).toEqual([`w3xfx-${keys[0]!}`]);

    // ---- 實驗組:出貨的那份(帶 vfxLayers) ----
    registerShipped(SUPERNOVA);
    const s1 = [...scene.particleSystems];
    const h1 = harness();
    h1.sys.handleEvent(cast(SUPERNOVA), 2_000);
    expect(docSystems(s1), "delayMs:200 的火柱不該在施法幀就出現").toHaveLength(1);
    h1.sys.update(2_199);
    expect(docSystems(s1), "還沒到 200 ms 就不該出現").toHaveLength(1);
    h1.sys.update(2_200);
    const after = docSystems(s1);
    expect(after, "到期後應該有主爆 + 火柱兩組").toHaveLength(2);
    expect(new Set(after.map((s) => s.name)).size, "兩層共用了同一個池").toBe(2);

    const [a, b] = after as [Snap, Snap];
    expect(reallyDiffer(a, b), `兩層的引擎參數一模一樣:${JSON.stringify(after)}`).toBe(true);

    // 綁定後多出來的**那一份文件**,綁定前完全不在場上。用 doc id 比,不是用
    // 系統名 —— 因為前綴本來就會變(見下面那一條)。
    const extra = after.filter((s) => docIdOf(s.name) !== docIdOf(before[0]!.name));
    expect(
      extra.map((s) => docIdOf(s.name)),
      "綁定後沒有多出火柱那一份文件",
    ).toEqual([keys[1]!]);
    expect(reallyDiffer(extra[0]!, before[0]!), "新增的層跟綁定前那組參數相同").toBe(true);
  });

  /**
   * ⚠️ 量到的**副作用**,寫成守衛而不是註解。
   *
   * `playCastVfx` 的第 0 級(`vfxLayers`)在階梯**最上面**,所以一支本來由
   * `w3xArtFor` 晉升、走 `W3xEmitterRig`(第 1 級)的技能,加上 `vfxLayers`
   * 之後會改走 pooled `play()`。上面那條測試的名字前綴就是證據:
   * 綁定前 `w3xfx-…`,綁定後 `vfx-…`。
   *
   * 對這兩支技能而言影響有界 —— 家族原型**照定義只有一個發射器**
   * (`familyRow` 的 `extra` 是空陣列),所以 rig 「把一整組 emitter 當串流播」
   * 的那個優勢在這裡沒有東西可發揮。但這件事對 B1–B6 其他桶**不成立**:
   * `w3xAbilityArtRows()` 那 34 支帶著 `extra`(例如 frostnova 是 4 個),對那些
   * 技能寫 `vfxLayers` 會把整組 emitter 換成一次性 burst。
   *
   * 這條測試存在的意義是:哪天有人把層搬到階梯的其他位置、或讓層也走 rig,
   * 這裡會紅,而不是讓「為什麼這支技能的火看起來變了」變成一個只有玩家看得到
   * 的謎。
   */
  it("量到:加上 vfxLayers 會把這支技能從 rig(第 1 級)換到 pooled(第 0 級)", () => {
    const keys = layerKeysOf(SUPERNOVA);

    registerUnbound(SUPERNOVA);
    const s0 = [...scene.particleSystems];
    const h0 = harness();
    h0.sys.handleEvent(cast(SUPERNOVA), 31_000);
    h0.sys.update(31_400);
    expect(docSystems(s0).map((s) => s.name)).toEqual([`w3xfx-${keys[0]!}`]);

    registerShipped(SUPERNOVA);
    const s1 = [...scene.particleSystems];
    const h1 = harness();
    h1.sys.handleEvent(cast(SUPERNOVA), 32_000);
    h1.sys.update(32_200);
    const names = docSystems(s1).map((s) => s.name);
    expect(names, "第一層不再走 rig").toContain(`vfx-${keys[0]!}`);
    expect(names.some((n) => n.startsWith("w3xfx-")), "還有東西走 rig").toBe(false);
  });

  it("超新星:火柱層的 w3xScale 真的放大了引擎裡的粒子,不是只改了 id", () => {
    const keys = layerKeysOf(SUPERNOVA);
    const plain = loadVfx(keys[1]!);
    const plainPeak = Math.max(
      ...[plain.size.start, plain.size.end, ...(plain.sizeStops ?? []).map(([, s]) => s)],
    );

    const s0 = [...scene.particleSystems];
    const { sys } = harness();
    sys.handleEvent(cast(SUPERNOVA), 5_000);
    sys.update(5_200);
    const pillar = docSystems(s0).find((s) => s.name.startsWith(`vfx-${keys[1]!}#`));
    expect(pillar, "火柱層沒有拿到自己的池 key(覆寫被靜默吃掉了)").toBeDefined();
    // 1.435 倍(= 推導的 docScale 1.65 ÷ 預烘的 1.15)。四捨五入之後至少要看得出
    // 1.2 倍以上,否則等於覆寫沒生效。
    expect(pillar!.peakSize / plainPeak).toBeGreaterThan(1.2);
  });

  it("Acxel Shooter:mark 在 t=0、burst 在 t=350 ms,兩組發射器參數不同", () => {
    const keys = layerKeysOf(ACXEL);
    const s0 = [...scene.particleSystems];
    const { sys } = harness();
    sys.handleEvent(cast(ACXEL), 10_000);
    expect(
      docSystems(s0).map((s) => s.name),
      "t=0 只該有 mark 那一層",
    ).toEqual([`vfx-${keys[0]!}`]);

    sys.update(10_349);
    expect(docSystems(s0), "350 ms 之前不該有第二層").toHaveLength(1);
    sys.update(10_350);
    const t1 = docSystems(s0);
    expect(t1).toHaveLength(2);
    expect(t1.map((s) => s.name)).toContain(`vfx-${keys[1]!}`);

    const [a, b] = t1 as [Snap, Snap];
    expect(reallyDiffer(a, b), `mark 與 burst 在引擎上長得一模一樣:${JSON.stringify(t1)}`).toBe(
      true,
    );
  });

  it("Acxel Shooter:綁定前只有一組,而且沒有人去解 mark 那份文件", () => {
    const keys = layerKeysOf(ACXEL);
    registerUnbound(ACXEL);
    const s0 = [...scene.particleSystems];
    const { sys, resolved } = harness();
    sys.handleEvent(cast(ACXEL), 20_000);
    sys.update(20_400);
    expect(docSystems(s0)).toHaveLength(1);
    expect(resolved, "綁定前不該有人去解 mark 那份文件").not.toContain(keys[0]!);
  });
});
