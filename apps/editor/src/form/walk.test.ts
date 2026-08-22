/**
 * editor-01 (editor-walker-widgets): the zod field-walker emits every widget
 * kind. editor-02 (editor-walker-union): discriminated EffectDef unions become
 * variant cards and the recursive spawnProjectile.onHit terminates via the
 * depth cap.
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  zAbilityDoc,
  zChampionDoc,
  zEffectDef,
  zModelDoc,
  zVfxDoc,
  zRef,
} from "@ggd/shared/content";
import {
  SPREAD_MAX_FALLOFF,
  SPREAD_MAX_RADIUS,
  SPREAD_MAX_TARGETS,
  SPREAD_MIN_FALLOFF,
} from "@ggd/shared/sim/effects/spreadLimits";
import { cover } from "@ggd/shared/testkit/cover";
import { walkZod, defaultValueFor, defaultForVariant } from "./walk";
import type {
  UIArray,
  UIDiscriminatedUnion,
  UINode,
  UINumber,
  UIObject,
  UIText,
} from "./uiSchema";

function fieldsOf(node: UINode): Map<string, UINode> {
  expect(node.kind).toBe("object");
  return new Map((node as UIObject).fields.map((f) => [f.path.split(".").pop()!, f]));
}

describe("walkZod widget kinds (editor-01)", () => {
  it("maps strings/numbers/bools/enums/arrays/refs/literals from the REAL shared schemas", () => {
    cover("editor-walker-widgets");
    const ability = walkZod(zAbilityDoc, "", "Ability");
    const f = fieldsOf(ability);

    expect(f.get("schema")!.kind).toBe("literal");
    expect(f.get("name")!.kind).toBe("text");
    // slot enum covers all SIX slots a champion owns: Q/W/E/R, the per-hero
    // "EX" ultimate (EX 技能), and "PASSIVE" — the 天生技 the source map grants
    // at level 1 (ability code NN-00), which the w3x importer used to drop.
    expect(f.get("slot")).toMatchObject({
      kind: "enum",
      options: ["Q", "W", "E", "R", "EX", "PASSIVE"],
    });
    expect(f.get("maxRank")).toMatchObject({ kind: "number", int: true, min: 1, max: 6 });
    expect(f.get("cooldown")!.kind).toBe("array");
    expect((f.get("cooldown") as UIArray).item.kind).toBe("number");
    expect(f.get("radius")).toMatchObject({ kind: "number", optional: true });
    expect(f.get("targetsEnemies")).toMatchObject({ kind: "boolean", optional: true });
    // zRef metadata survives the walk -> RefSelect
    expect(f.get("vfxKey")).toMatchObject({
      kind: "text",
      optional: true,
      ref: { target: "vfx", soft: true },
    });

    const champion = walkZod(zChampionDoc, "", "Champion");
    const cf = fieldsOf(champion);
    expect(cf.get("modelKey")).toMatchObject({ kind: "text", ref: { target: "models", soft: false } });
    expect(cf.get("baseStats")!.kind).toBe("record");
    const buildPriority = cf.get("buildPriority") as UIArray;
    expect(buildPriority.kind).toBe("array");
    expect((buildPriority.item as UIText).ref).toEqual({ target: "items", soft: false });
    // nested object with the 4 fixed slots
    const abilities = cf.get("abilities") as UIObject;
    expect(abilities.kind).toBe("object");
    expect(abilities.fields.map((x) => x.path.split(".").pop())).toEqual(["Q", "W", "E", "R"]);

    // record of xyz points (model attachPoints) + tuple (vfx color is object of tuples)
    const model = walkZod(zModelDoc, "", "Model");
    expect(fieldsOf(model).get("attachPoints")!.kind).toBe("record");
    const vfx = walkZod(zVfxDoc, "", "Vfx"); // wrapped in ZodEffects (superRefine) — must unwrap
    const vf = fieldsOf(vfx);
    expect(vf.get("emitter")!.kind).toBe("discriminatedUnion");
    expect(vf.get("mode")).toMatchObject({ kind: "enum", options: ["continuous", "burst"] });
  });

  it("walks plain zod unions to the JSON fallback", () => {
    const odd = z.object({ u: z.union([z.string(), z.number()]) });
    const f = fieldsOf(walkZod(odd, "", "Odd"));
    expect(f.get("u")!.kind).toBe("unknown");
  });
});

describe("discriminated EffectDef union (editor-02)", () => {
  it("renders variant cards keyed by kind, recursion depth-capped", () => {
    cover("editor-walker-union");
    const ability = walkZod(zAbilityDoc, "", "Ability");
    const effects = fieldsOf(ability).get("effects") as UIArray;
    expect(effects.kind).toBe("array");
    const union = effects.item as UIDiscriminatedUnion;
    expect(union.kind).toBe("discriminatedUnion");
    expect(union.discriminator).toBe("kind");
    // This list is a DELIBERATE tripwire: it goes red the moment the shared
    // schema grows an effect kind, so the editor cannot silently fall behind the
    // sim. Adding the tag here is NOT the fix on its own — see the `leap` case
    // below and PreviewController.effectLines, which must both learn the kind.
    const tags = union.variants.map((v) => v.tag).sort();
    // `leap` joined the union in #247 (the parabolic jump ported from the map's
    // own SetUnitFlyHeightBJ sites) — this list had not been updated with it,
    // so the suite was red on the #247 branch before this line changed.
    expect(tags).toEqual(
      [
        "applyBuff",
        "applyStatus",
        // ⭐ 真瞬移（owner 2026-08-09 / GH#301-2）。它推翻了 templates/expand.ts
        // 那句「a `kind: "blink"` … deliberately was not added」—— 那句辯護的
        // 前提（三個檔正被別的 lane 同時編輯）不再成立，而 owner 的裁決是
        // 「是真的瞬移，不是平移」。⛔ 與上面那五個保留槽位同一個形狀：schema
        // 認得它、`sim/effects/blink.ts` 的 apply **會丟例外**，而
        // `PreviewController` 的 case 印「⚠️ 引擎側尚未實作」——
        // 那個 `never` 分支在我把它加進 union 的當下就先把編譯打紅了，
        // 所以「補一個 tag」在這一支從來不是一個選項。
        "blink",
        // ── 2026-08-18 [EX∅ 根源] 的兩個新 kind (GH#355) ──────────────────
        // `carry`（禰豆子的木箱：背著隊友走 + 不可被選取）與 `convertTeam`
        // （大師球：把一隻既有單位借到自己這一隊）。⛔ 補 tag **不是**修好它：
        // `PreviewController.effectLines` 的窮盡性 `never` 分支在這兩個 kind
        // 進 union 的當下就先把編譯打紅了，兩個 case 是同一輪補上的。
        "carry",
        "championForm", // task #249 — the w3x Eme1/Emeu body swap
        // ── 2026-08-20 GH#451 連鎖閃電 ──────────────────────────────────────
        // ⭐ owner 2026-08-20 裁決：「**DECAY 0.9**，但這個技能的重點在於**隨機選擇
        // 單位遞減時間差的閃電特效與傷害**（每個閃電有極小的時間間隔播放閃電動畫
        // 與傷害才到下一個…）**有其特殊性與純範圍直接給傷害區別很大**」
        // ⇒ 它**不是** damageArea 的一個參數，是一個獨立 kind：`jumpIntervalSec`
        // 讓整條鏈**不在同一 tick 結算**，那正是 owner 說的那個「區別很大」。
        // ⛔ 這張清單是刻意寫死的（同 navSections 的 BASELINE_PAGES）——
        // 它的用意就是**逼加新 kind 的人在這裡留下痕跡**，⛔ 不要改成從 union 推導。
        "chainLightning",
        // ── 2026-08-22 GH#541「連段→收尾」───────────────────────────────
        // ⭐ owner:「克勞德很類似**龍虎亂舞類打打打最後大招**，是常用模板，
        // 包含 SaberEX 的理想鄉也是此類模板」「JASS 裡面有**間隔時間給予多次傷害**
        // 的都是這類家族技能模板」。⇒ 29 個 JASS 函式一個機制解決。
        // ⛔ 它不是 `dot`：`dot` 沒有 N 次**獨立命中判定**、沒有 N 次演出、
        // 沒有收尾那一發（Saber 卡面「最後施展約束與勝利之劍」是第八段，形狀不同）。
        "comboStrikes",
        "convertTeam",
        // ── 2026-08-22 GH#551/#543/#549 —— 四個「演出」kind ────────────────
        // owner:「都是**動畫特效**⋯別忘了還有**特效文字**」
        // ⭐ `spawnModelFx` 是**帶模型的單位**沿路徑移動（翻滾光束／砲擊／衝擊波），
        //    ⛔ 不是粒子 —— owner 明說它是「球體 + 蝗蟲群單位 3d model 特效」。
        // ── 2026-07-31 技能批次的四個新 kind ────────────────────────────
        // 這四個是**同一天**進來的，而這條釘子沒有跟上 —— 也就是說有四張卡
        // 在編輯器裡是新的，而「編輯器不能落後 sim」這條保證有四天是假的。
        // 補 tag 從來就不是修好它：`PreviewController.effectLines` 也必須
        // 認得每一個 kind，否則它的 `default` 分支會直接把預覽炸掉
        // （`spendMana` 就是這樣被抓到的，見那個 case）。
        "cycleBuff", // 13-00 念。攻防轉換 —— 每 N 秒輪到下一格
        "damage",
        // `damageArea` joined in #210 (近戰擴散) and this list was not updated,
        // which is what the tripwire is FOR. Landing the tag was not the fix:
        // the audit it forced found that switching a card to `damageArea` seeded
        // `radius: 0` into a `.positive()` field, so every such card 422'd on
        // save. See the dedicated case below.
        "damageArea", // task #210
        "damageLine", // 13-03 龍頭戲畫。佈壁 —— 一條走廊，不是一個圓
        "dash",
        // 【吞噬】owner 2026-08-05（初號機 EX）。與 `PreviewController` 的
        // `case "devour"` 同時進來 —— 那個 `never` 分支不給補 tag 這條路。
        "devour",
        // 【淨化】A4b（#278）。它與 `PreviewController.effectLines` 的
        // `case "dispel"` 同時進來 —— 那個 `never` 分支在我加進 union 的當下就
        // 把編譯打紅了，所以「補 tag」在這一支從來不是一個選項。
        "dispel",
        // ── GH#289 RESERVED KINDS ─────────────────────────────────────────
        // Five slots landed AHEAD of their implementations so that six
        // parallel primitive lanes never edit the shared union concurrently.
        // The schema knows them (so the card renders and docs validate); the
        // sim handler THROWS a named error until its lane lands, and
        // PreviewController prints 「⚠ NOT IMPLEMENTED」 — a designer can see
        // the card but can never mistake it for a working spell.
        "dot", // lane P1 — 持續傷害
        "evasion", // lane P5 — 閃避
        "grantAttribute", // 08-00 龍紋記憶 —— 暫時把三圍推上去
        // ── 鍊金術之盾 (godie-i06q) 的兩半 ────────────────────────────────
        // 兩個都跟著 `PreviewController.effectLines` 的 case 一起進來，所以
        // 這條釘子與那個 `never` 分支同時被滿足 —— 補 tag 不是修好它。
        "grantGold", // 「黃金數量為敵方等級」
        "floatingText",
        "heal",
        "invulnerable", // lane P3 — 無敵
        "knockback", // lane P4 — 擊退
        "leap", // task #247
        // ── 2026-08-22 GH#147 吸引（`A091` 及喀爾度的錨點環）──────────────
        // ⛔ 與 `knockback` 是同一族的反向：knockback 把人推開、`pull` 把人
        // 拉到落點或**等分錨點環**（一人一個點）。owner 2026-07-26 裁決
        // 「三條描述↔JASS 衝突一律照 JASS 修」，而這一條之前卡在引擎沒有詞彙。
        "pull",
        "restore",
        // 復活 —— 天生牙 godie-i031 「殺死任一個敵方英雄單位，將復活我方所有英雄」。
        // 它與 `PreviewController.effectLines` 的 case 同時進來,所以補 tag 不是
        // 修好它:那個 `never` 分支也必須認得它。
        "revive",
        "shield",
        // 【破盾】D1（#278）。與 `PreviewController` 的 `case "shieldBreak"` 同時進來。
        "shieldBreak",
        "screenFlash",
        "screenShake",
        "spawnModelFx",
        "spawnProjectile",
        "spawnVfx",
        "spendMana", // 20-01 風王結界 / 13-002 絕。暗殺奧義 —— 燒法力
        "summon", // lane P2 — 召喚物
        "taunt", // [嘲弄] —— 強迫敵人優先攻擊施法者 (sim/taunt.ts)
        // ── Lane 1（2026-08-08）的四個新 kind ────────────────────────────
        // 四個同一天進來，而且**四個都是**同一個形狀的實例（`shape` + 決策欄位）。
        // 它們與 `PreviewController.effectLines` 的四個 case 同時落地 ——
        // 那個 `never` 分支在我把它們加進 union 的當下就把 apps/editor 編譯打紅了，
        // 所以「只補 tag」在這一批從來不是一個選項。
        "eventValueConversion", // 15-002 太陰道 / 59-01 吞噬（⚠️ basis 待 freeze）
        "modifyCooldown", // #284 —— 縮短**特定一支**技能的冷卻，不是全域 cdr
        "swapResource", // 44-002 交換筆記本 —— 原子交換現存生命
        "weightedBranch", // 89-002 俄羅斯輪盤 —— 整段只抽一次 rng
        // ── Lane 2（2026-08-08）的三個新 kind ────────────────────────────
        // 同一句話：它們與 `PreviewController.effectLines` 的三個 case 同時落地。
        "extendBuff", // 52-01 狂戰士之怒 —— 受傷延長狂怒（無狀態，連續比例）
        "manaBarrier", // 44-00 機警 —— 每點魔力抵 3 點傷害（扣血之前換成扣魔）
        "randomArea", // 13-04 龍星群 / 70-04 千年練成 —— 隨機落點排程（2×count draws）
        // ── Lane 3（2026-08-10）的兩個新 kind ────────────────────────────
        // 同一句話：`PreviewController.effectLines` 的兩個 case 與它們同時落地
        // （PreviewController.ts:657 / :675），所以「只補 tag」在這裡也不是選項。
        // ⚠️ 這兩個 kind 各自又帶 `EffectDef[]` 子欄位（delayed 的 effects /
        // finalEffects、proxyCast 走既有技能）—— 它們正是把這支檔案的 walker
        // 撐爆的那批遞迴邊之一，見 walk.ts 的 MAX_REENTRY。
        "delayed", // G12 —— 凍住名單、隔幾拍才付（連擊/預告落點）
        "proxyCast", // S5 —— 代放另一支技能（80-04 每次普攻 proc）
      ].sort(),
    );

    // damage variant: enum + nested scaling object
    const damage = union.variants.find((v) => v.tag === "damage")!;
    const dmgFields = new Map(damage.fields.map((f) => [f.path.split(".").pop()!, f]));
    expect(dmgFields.get("damageType")).toMatchObject({ kind: "enum" });
    expect(dmgFields.get("amount")!.kind).toBe("object");

    // spawnProjectile: hard ref + RECURSIVE onHit (lazy) — walker must terminate
    const spawn = union.variants.find((v) => v.tag === "spawnProjectile")!;
    const spawnFields = new Map(spawn.fields.map((f) => [f.path.split(".").pop()!, f]));
    expect((spawnFields.get("projectileId") as UIText).ref).toEqual({
      target: "projectiles",
      soft: false,
    });
    const onHit = spawnFields.get("onHit") as UIArray;
    expect(onHit.kind).toBe("array");
    expect(["discriminatedUnion", "unknown"]).toContain(onHit.item.kind);

    // low depth cap degrades to the JSON fallback instead of infinite recursion
    const capped = walkZod(zAbilityDoc, "", "Ability", { maxDepth: 2 });
    expect(capped.kind).toBe("object");
  });

  /**
   * TASK #247 follow-up. `leap` reaching the tag list above only proves the
   * walker SAW the variant. What a designer needs is a card with real widgets
   * on it — and, because `leap` is the SECOND recursive member of the union
   * (`onLand`, alongside spawnProjectile's `onHit`), that its recursion still
   * terminates at the depth cap rather than blowing the stack.
   */
  it("the leap variant is a REAL editable card, not just a tag", () => {
    cover("leap-editor-form");
    const ability = walkZod(zAbilityDoc, "", "Ability");
    const union = (fieldsOf(ability).get("effects") as UIArray).item as UIDiscriminatedUnion;
    const leap = union.variants.find((v) => v.tag === "leap")!;
    const f = new Map(leap.fields.map((x) => [x.path.split(".").pop()!, x]));

    // every authored knob is a typed widget the form can actually render …
    expect(f.get("mode")).toMatchObject({ kind: "enum", options: ["toPoint", "inPlace"] });
    expect(f.get("applyTo")).toMatchObject({
      kind: "enum",
      options: ["self", "target"],
      optional: true,
    });
    expect(f.get("apexHeight")).toMatchObject({ kind: "number", min: 0, optional: false });
    expect(f.get("durationSec")).toMatchObject({ kind: "number", optional: false });
    expect(f.get("throwDistance")).toMatchObject({ kind: "number", optional: true });
    expect(f.get("landRadius")).toMatchObject({ kind: "number", optional: true });
    // … and the landing payload is the SAME union card, one level down, so a
    // designer can author "leap here, then blast" without touching JSON.
    const onLand = f.get("onLand") as UIArray;
    expect(onLand.kind).toBe("array");
    expect(onLand.item.kind).toBe("discriminatedUnion");
    const nested = (onLand.item as UIDiscriminatedUnion).variants.map((v) => v.tag);
    expect(nested).toContain("damage");
    expect(nested).toContain("applyStatus");

    // switching the card to `leap` seeds every REQUIRED field (a variant switch
    // that produced `{kind:"leap"}` alone would hand the server a 422).
    const seeded = defaultForVariant(union, "leap") as Record<string, unknown>;
    expect(seeded.kind).toBe("leap");
    expect(seeded.mode).toBe("toPoint");
    expect(seeded).toHaveProperty("apexHeight");
    expect(seeded).toHaveProperty("durationSec");
    // …and PRESENT is not the same as VALID. `toHaveProperty` alone was failure
    // ④ (斷言方向跟缺陷無關): it passed for two months while the seed was
    // `durationSec: 0`, which `.positive()` rejects — so every freshly switched
    // leap card 422'd on save and this test said nothing. Parse the seed against
    // the SHIPPING schema, which is the thing the save actually runs.
    expect(zEffectDef.safeParse(seeded)).toMatchObject({ success: true });
  });

  /**
   * TASK #210 (近戰擴散) follow-up — the same audit the `leap` case above
   * demands, applied to the kind that made this suite red.
   *
   * `damageArea` reaching the tag list only proves the walker SAW it. Two
   * things a designer actually needs, neither implied by the tag:
   *   • the three 擴散 knobs arrive as bounded number widgets, carrying the
   *     REAL caps out of sim/effects/spreadLimits.ts — those caps are
   *     mis-parse guards (w3x lengths are ~54.5× GGD units, so a pasted
   *     `Area: 450` becomes a field-covering circle), and a widget with no
   *     `max` lets exactly that paste through the form;
   *   • switching a card to `damageArea` produces a document the shipping
   *     schema ACCEPTS. It did not: the seed was `radius: 0` against
   *     `.positive()`, i.e. a card that looks complete and 422s on save.
   */
  it("the damageArea variant is a REAL editable card whose seed SAVES", () => {
    const ability = walkZod(zAbilityDoc, "", "Ability");
    const union = (fieldsOf(ability).get("effects") as UIArray).item as UIDiscriminatedUnion;
    const area = union.variants.find((v) => v.tag === "damageArea")!;
    const f = new Map(area.fields.map((x) => [x.path.split(".").pop()!, x]));

    expect(f.get("damageType")).toMatchObject({ kind: "enum", options: ["physical", "magic", "true"] });
    expect(f.get("amount")!.kind).toBe("object");
    // Bounds asserted against the shared constants, never against literals:
    // the claim is "the walker carried the schema's own cap onto the widget",
    // and a hard-coded 12 here would keep passing after the cap moved.
    expect(f.get("radius")).toMatchObject({
      kind: "number",
      optional: false,
      min: SPREAD_MIN_FALLOFF, // 0 — but EXCLUSIVE, see below
      exclusiveMin: true,
      max: SPREAD_MAX_RADIUS,
    });
    expect(f.get("falloff")).toMatchObject({
      kind: "number",
      optional: true,
      min: SPREAD_MIN_FALLOFF,
      max: SPREAD_MAX_FALLOFF,
    });
    expect(f.get("falloff")).not.toHaveProperty("exclusiveMin");
    expect(f.get("maxTargets")).toMatchObject({
      kind: "number",
      int: true,
      optional: true,
      min: 1,
      max: SPREAD_MAX_TARGETS,
    });
    expect(f.get("canCrit")).toMatchObject({ kind: "boolean", optional: true });
    expect(f.get("includeOrigin")).toMatchObject({ kind: "boolean", optional: true });

    // The card switch hands the server something it accepts. `damageArea` has
    // no ref fields, so a clean parse is reachable without a human picking
    // anything — which is why the assertion can be this strict here.
    const seeded = defaultForVariant(union, "damageArea") as Record<string, unknown>;
    expect(seeded.kind).toBe("damageArea");
    expect(zEffectDef.safeParse(seeded)).toMatchObject({ success: true });
    // and the specific value that used to be wrong, named out loud
    expect(seeded.radius).toBeGreaterThan(0);
  });

  /**
   * The general form of the two cases above, so the NEXT effect kind with a
   * `.positive()` knob cannot reintroduce the hole while both hand-written
   * cases stay green.
   *
   * Deliberately an invariant over the seeded VALUE, not over the node's
   * metadata (failure ⑦: "every node has a min" is a property, "the value the
   * form starts on is inside that min" is the behaviour).
   */
  it("every seeded number lands INSIDE its own declared bounds", () => {
    const ability = walkZod(zAbilityDoc, "", "Ability");
    const union = (fieldsOf(ability).get("effects") as UIArray).item as UIDiscriminatedUnion;
    let checked = 0;
    for (const v of union.variants) {
      const seeded = defaultForVariant(union, v.tag) as Record<string, unknown>;
      for (const field of v.fields) {
        if (field.kind !== "number" || field.optional) continue;
        const n = field as UINumber;
        const key = n.path.split(".").pop()!;
        const got = seeded[key];
        expect(typeof got, `${v.tag}.${key} was not seeded`).toBe("number");
        const value = got as number;
        if (n.min !== undefined) {
          if (n.exclusiveMin) expect(value, `${v.tag}.${key} > ${n.min}`).toBeGreaterThan(n.min);
          else expect(value, `${v.tag}.${key} >= ${n.min}`).toBeGreaterThanOrEqual(n.min);
        }
        if (n.max !== undefined) {
          if (n.exclusiveMax) expect(value, `${v.tag}.${key} < ${n.max}`).toBeLessThan(n.max);
          else expect(value, `${v.tag}.${key} <= ${n.max}`).toBeLessThanOrEqual(n.max);
        }
        if (n.int) expect(Number.isInteger(value), `${v.tag}.${key} is an int`).toBe(true);
        checked++;
      }
    }
    // The loop must actually have looked at something — a variant walk that
    // silently produced zero number fields would otherwise pass vacuously.
    expect(checked).toBeGreaterThanOrEqual(5);
  });

  it("provides sane defaults for new items and variant switches", () => {
    const ability = walkZod(zAbilityDoc, "", "Ability");
    const effects = fieldsOf(ability).get("effects") as UIArray;
    const union = effects.item as UIDiscriminatedUnion;

    const dmg = defaultForVariant(union, "damage") as Record<string, unknown>;
    expect(dmg.kind).toBe("damage");
    expect(dmg.amount).toEqual({});

    // ⚠️ `damageType` **刻意不被種進去**（owner 2026-08-05：「技能傷害預設都改成
    // AP 傷害…如果有特別指定 真實傷害 或 物理傷害(AD)，則照技能上附註的計算」）。
    // 種一個 "magic" 進每一張新卡的話，後台「傷害規則」那一格對新卡就**永遠沒用** ——
    // 它只管「沒寫的那些」，而每一張卡都寫了。所以留空才是對的。
    expect(dmg.damageType).toBeUndefined();

    // ⛔ 但「留空」的代價是作者不知道自己會拿到什麼,所以那一格**必須**有說明文字
    // 講清楚省略時的行為。少了這一行,上面那條斷言就是在保護一個沉默的預設
    //（v0.9.42 之前編輯器根本不畫 description,那 25 句寫好的話一個字都沒出現過）。
    const dmgVariant = union.variants.find((v) => v.tag === "damage")!;
    const typeField = dmgVariant.fields.find(
      (f) => f.path.split(".").pop() === "damageType",
    )!;
    expect(typeField.description ?? "").toContain("省略");

    const spawn = defaultForVariant(union, "spawnProjectile") as Record<string, unknown>;
    expect(spawn).toMatchObject({ kind: "spawnProjectile", onHit: [] });

    expect(defaultValueFor(effects)).toEqual([]);
  });
});
