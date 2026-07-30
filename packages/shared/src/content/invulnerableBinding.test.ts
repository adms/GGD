/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  無敵綁定守衛 —— 出貨的技能文件真的讓施法者免疫 (GH#289 lane P3 · 內容側)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── 為什麼 `sim/effects/invulnerable.test.ts` 還不夠 ────────────────────────
 *
 * 那一份有 39 條測試、42 條突變紀錄,原語本身守得很緊。但它的每一條都**自己
 * 手寫** `{ kind: "invulnerable", durationSec: 1, … }` 再丟進 `runEffects`。
 * 也就是說:把 `content/` 整棵樹裡的 `invulnerable` 全部刪光,那 39 條**照樣
 * 全綠** —— 因為它們測的不是出貨的那個 (CLAUDE.md 失敗形態 ⑤)。
 *
 * 2026-07-30 這正是實況:`fieldAdoption.test.ts` 量到
 * `variant:abilities.effects[]#invulnerable` = **0 / 805**。原語、schema、
 * 編輯器欄位、42 條突變全部在,而**沒有任何一支技能用它** —— 機制上線、內容
 * 0 筆 (recipe S8)。
 *
 * 所以這一份的斷言方向是相反的:**不**驗原語會不會擋,而是驗
 * 「**磁碟上那份 JSON**，經過**出貨的 Zod**、**出貨的 runEffects**、
 * **出貨的 world.step()**,血條到底掉不掉」。
 *
 * ── 讀檔而不是走 loader,是刻意的 ─────────────────────────────────────────
 *
 * 與 `abilityMirror.test.ts` / `icons.test.ts` 同一個理由:直接讀檔就不依賴
 * `pnpm content:build` 有沒有跑過,reindex 之前之後都必須綠。
 *
 * ── 名單是**算**出來的,不是抄的 ──────────────────────────────────────────
 *
 * `BOUND` 在測試執行時掃整棵 `content/abilities`,所以之後任何人新綁一支,
 * 這裡自動涵蓋它;而把某一支的 `invulnerable` 刪掉,`至少一支` 那條會紅。
 * 一份抄下來的清單只能守住抄的當下 (fieldAdoption.test.ts 檔頭同一個道理)。
 *
 * ── 突變紀錄 (2026-07-30) ─────────────────────────────────────────────────
 *
 *  N1 `sim/combat/damage.ts:682` 的 `if (refusesDamage(...)) { … continue; }`
 *     整段停用 → RED (「施法瞬間挨一發」與「免疫期間 HP 一點都不掉」)
 *  N2 `content/abilities/godie-ewrd.r.json` 的 invulnerable 效果刪掉
 *     → RED (「每一支綁上去的技能都真的免疫」逐支斷言 + 至少一支)
 *  N3 `invulnerable.ts:173` `e.blocksTrueDamage ?? mode === "all"` → `?? true`
 *     → RED (火圈那條:owner 的保底「統統會被真實傷害燒死」被吃掉)
 *  N4 `invulnerable.ts:163` `world.tick + …` → `…`(窗從回合 0 起算)
 *     → RED (免疫期間 HP 不掉)
 *  逐條輸出:/private/tmp/invuln-lane/mutations.log
 */
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync } from "node:fs";
import { SimWorld } from "../sim/SimWorld";
import { SKELETON_ARENA } from "../sim/world/ArenaDef";
import { runEffects } from "../sim/effects/effectRunner";
import { zEffectDefUnion } from "./schema/effect";
import type { EffectDef } from "../sim/effects/effect";
import type { EntityId } from "../ids";
import { asTeamId, asSeatId } from "../ids";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const ABILITY_DIR = join(CONTENT_DIR, "abilities");
const CHAMPION_DIR = join(CONTENT_DIR, "champions");

type Doc = { id?: string; name?: string; slot?: string; effects?: unknown[] };

function readJson(p: string): Doc {
  return JSON.parse(readFileSync(p, "utf8")) as Doc;
}

/** Every shipping ability doc carrying an `invulnerable` effect — computed. */
const BOUND: ReadonlyArray<{ file: string; doc: Doc; invuln: Record<string, unknown> }> =
  readdirSync(ABILITY_DIR)
    .filter((f) => f.endsWith(".json") && f !== "_index.json")
    .map((f) => ({ file: f, doc: readJson(join(ABILITY_DIR, f)) }))
    .flatMap(({ file, doc }) => {
      const hit = (doc.effects ?? []).find(
        (e) => (e as { kind?: string })?.kind === "invulnerable",
      );
      return hit ? [{ file, doc, invuln: hit as Record<string, unknown> }] : [];
    });

const START_HP = 5_000;
const C = SKELETON_ARENA.zones[0]!.center;

interface Rig {
  world: SimWorld;
  caster: EntityId;
  enemy: EntityId;
}

/** Two live bodies on opposing teams, both fully componented, in zone 0. */
function rig(): Rig {
  const world = new SimWorld(SKELETON_ARENA, 7);
  const place = (dx: number, team: number, seat: number): EntityId => {
    const id = world.spawn();
    world.transform.set(id, {
      pos: { x: C.x + dx, z: C.z },
      vel: { x: 0, z: 0 },
      facing: { x: 1, z: 0 },
      radius: 0.6,
      zone: 0,
    });
    world.health.set(id, {
      hp: START_HP,
      maxHp: START_HP,
      mana: 0,
      maxMana: 0,
      alive: true,
      shields: [],
    });
    world.team.set(id, { teamId: asTeamId(team), seatId: asSeatId(seat) });
    world.status.set(id, { effects: [] });
    world.nav.set(id, {
      order: null,
      moveTarget: null,
      override: null,
      attackTarget: null,
      attackTargetAuto: false,
    });
    return id;
  };
  const caster = place(0, 0, 0);
  const enemy = place(2, 1, 1);
  world.rebuildGrid();
  return { world, caster, enemy };
}

/**
 * Cast the doc's REAL effect list, caster→enemy, through the REAL runner.
 *
 * The list is parsed by the REAL shipping Zod union first, so a doc that the
 * game could not load can never make this suite green.
 */
function castShippedAbility(r: Rig, doc: Doc): void {
  const effects = (doc.effects ?? []).map((e) => zEffectDefUnion.parse(e) as EffectDef);
  runEffects(effects, {
    world: r.world,
    caster: r.caster,
    rank: 1,
    targets: [r.enemy],
    origin: `ability:${doc.id ?? "unknown"}`,
    rng: r.world.rng,
  });
}

/** Queue one packet at `who` and drain it through a REAL tick. */
function hit(r: Rig, who: EntityId, type: "physical" | "magic" | "true", amount = 400): void {
  r.world.damageQueue.push({
    source: who === r.caster ? r.enemy : r.caster,
    target: who,
    amount,
    type,
    crit: false,
    origin: "test:invuln-binding",
  });
  r.world.step(new Map());
}

const hpOf = (r: Rig, who: EntityId): number => r.world.health.get(who)!.hp;
const advance = (r: Rig, ticks: number): void => {
  for (let k = 0; k < ticks; k++) r.world.step(new Map());
};
/** 30 Hz. `+3` clears the absolute-tick deadline with margin. */
const ticksFor = (sec: number): number => Math.round(sec * 30) + 3;

/**
 * 出貨的 13 支,**逐支列名**。這一張表是一個 ratchet,不是裝飾。
 *
 * ⚠️ 為什麼 `BOUND.length > 0` 不夠 —— 這是量到的,不是推測的:
 * 把 13 支裡的 **12 支** 的 `invulnerable` 效果整個刪掉、只留一支,
 * 這個檔從 29 條測試縮成 5 條、`EXIT=0` **全綠**。原因是每一支的斷言都是
 * `it.each(BOUND)` 從磁碟掃出來**生成**的 —— 內容被刪掉,那幾條測試不是失敗,
 * 是**根本不存在**,而 vitest 不會抱怨測試變少。fieldAdoption 的 S8 普查也接不住:
 * 它只問「有沒有 ≥1 筆採用」,剩一支照樣綠。
 * 這就是 CLAUDE.md 失敗形態 ③(可以從樹上刪掉,但測試還是全綠)。
 *
 * 所以這裡改成**集合相等**:少一支紅、多一支也紅(多的那支要自己補進表裡,
 * 順手逼人補上它的 JASS 出處)。
 */
const EXPECTED_BOUND: readonly string[] = [
  "godie-e00k.e", // 19-03 瞬切百殺
  "godie-e00v.r", // 84-04 給我蜂蜜   — war3map.j:51062 UnitAddAbilityBJ('Avul', udg_Bear_caster)
  "godie-e00z.e", // 19-03 瞬切百殺 (變身態鏡像)
  "godie-ewrd.r", // 17-04 狂龍斬
  "godie-hapm.ex", // 52-002 射殺百頭 — war3map.j:52064 GetTriggerUnit() + :52065 udg_Buncle_Nine_Target
  "godie-hapm.w", // 52-02 蹂躪編年史 — war3map.j:51731 udg_Buncle_trample_Target(⚠️ JASS 掛在 TARGET)
  "godie-hpb1.w", // 07-02 者、皆、陣 — war3map.j:34418 UnitAddAbilityBJ('Avul', GetTriggerUnit())
  "godie-nbst.ex", // 24-002 來~快點吃吧
  "godie-u00j.q", // 74-01 獄門
  "godie-u00n.r", // 76-04 三檔.巨人迴旋彈 — war3map.j:36663 udg_Luffe_three_caster
  "godie-u00o.r", // 76-04 三檔.巨人迴旋彈 (鏡像)
  "godie-u010.q", // 38-01 邪王炎殺劍
  "godie-uvng.q", // 38-01 邪王炎殺劍 (鏡像)
];

describe("無敵綁定 — 出貨技能文件 → 真的 SimWorld (gh289-p3-invuln-content)", () => {
  it("出貨綁定名單**逐支**對齊 —— 刪掉任何一支都要紅(失敗形態 ③)", () => {
    const actual = BOUND.map((b) => b.doc.id ?? b.file).sort();
    const expected = [...EXPECTED_BOUND].sort();
    const missing = expected.filter((id) => !actual.includes(id));
    const extra = actual.filter((id) => !expected.includes(id));
    expect(
      { missing, extra },
      [
        "出貨帶 invulnerable 的技能名單變了。",
        `少了: ${missing.join(", ") || "(無)"}`,
        `多了: ${extra.join(", ") || "(無)"}`,
        "",
        "少了 = 有人把一支技能的無敵效果刪掉了。在 v0.9.x 之前這會**完全靜悄悄**:",
        "  每一支的斷言是 it.each(BOUND) 從磁碟生成的,刪內容 → 測試消失而不是失敗。",
        "  實測:13 支刪到剩 1 支,這個檔從 29 條縮成 5 條,EXIT=0 全綠。",
        "多了 = 新綁了一支,很好 —— 把它加進 EXPECTED_BOUND,並在旁邊註明它的",
        "  war3map.j 出處(SetUnitInvulnerable / 'Avul' 的行號)。不准憑名字或鄰近",
        "  grep 認定,那是 #78 失敗的方式。",
      ].join("\n"),
    ).toEqual({ missing: [], extra: [] });
  });

  it("至少一支出貨技能真的用了 invulnerable(否則 fieldAdoption 的 S8 又回來了)", () => {
    expect(
      BOUND.length,
      [
        "content/abilities/ 裡沒有任何一支技能帶 invulnerable 效果。",
        "這正是 fieldAdoption.test.ts 量到的 S8「機制上線、內容 0 筆」:",
        "原語、schema、編輯器欄位、42 條突變全在,遊戲裡從來不會發生。",
        "不要靠刪機制讓這條變綠。",
      ].join("\n"),
    ).toBeGreaterThan(0);
  });

  it.each(BOUND.map((b) => [b.file, b] as const))(
    "%s:施法後施法者挨一發實傷 → HP 一點都不掉;窗到期後同一發打得進來",
    (_file, b) => {
      const r = rig();
      castShippedAbility(r, b.doc);

      // ① 免疫期間:同一個封包,打在同一個人身上,血條不能動。
      hit(r, r.caster, "physical");
      expect(
        hpOf(r, r.caster),
        `${b.doc.name ?? _file} 的免疫窗開著,施法者卻掉血了`,
      ).toBe(START_HP);

      // ② 到期後:同一發必須打得進來。少了這一半,一個「永遠無敵」的壞實作
      //    也會過 —— 失敗形態 ④(斷言方向跟缺陷無關)。durationSec 讀的是
      //    **文件自己寫的值**,所以把某一支的時間改長,這裡就會紅。
      const sec = b.invuln["durationSec"] as number;
      advance(r, ticksFor(sec));
      expect(hpOf(r, r.caster), "免疫窗還沒到期就先掉血了").toBe(START_HP);
      hit(r, r.caster, "physical");
      expect(
        hpOf(r, r.caster),
        `${b.doc.name ?? _file} 的免疫窗到期了還在擋 —— 這是一個永久無敵`,
      ).toBeLessThan(START_HP);
    },
  );

  it.each(BOUND.map((b) => [b.file, b] as const))(
    "%s:免疫期間火圈的真實傷害**照樣**燒得到(owner 保底,不是 WC3 的 Avul)",
    (_file, b) => {
      const r = rig();
      castShippedAbility(r, b.doc);
      hit(r, r.caster, "true", 300);
      expect(
        hpOf(r, r.caster),
        [
          `${b.doc.name ?? _file} 在免疫期間免掉了真實傷害。`,
          "owner 的保底是「所有場上玩家、bot、各種殭屍都會百分比真實傷害燒死」,",
          "所以這些窗一律 blocksTrueDamage:false —— 否則縮圈的火圈變成可以站著不動。",
        ].join("\n"),
      ).toBeLessThan(START_HP);
    },
  );

  it("每一支綁上去的都要三個決策點寫得出來(絕不靠繼承預設值,否則編輯器卡片上看不到)", () => {
    const vague = BOUND.filter(
      (b) =>
        b.invuln["applyTo"] === undefined ||
        b.invuln["blocksDamage"] === undefined ||
        b.invuln["blocksTrueDamage"] === undefined ||
        b.invuln["blocksControl"] === undefined,
    ).map((b) => b.file);
    expect(
      vague,
      [
        "這些文件靠繼承預設值,而不是把決策寫出來:",
        "CLAUDE.md「尤其是決策點」—— 一個沒寫出來的欄位在後台卡片上是看不見的,",
        "owner 想改的時候會找不到它。",
      ].join("\n"),
    ).toEqual([]);
  });

  it("Q/W/E/R 的 champion 內嵌鏡像也要帶著它(編輯器 preview 整份讀內嵌那一份)", () => {
    const drift: string[] = [];
    for (const b of BOUND) {
      const slot = (b.doc.slot ?? "").toUpperCase();
      if (!["Q", "W", "E", "R"].includes(slot)) continue;
      const cid = (b.doc.id ?? "").split(".")[0];
      const champ = readJson(join(CHAMPION_DIR, `${cid}.json`)) as unknown as {
        abilities?: Record<string, Doc>;
      };
      const emb = champ.abilities?.[slot];
      const has = (emb?.effects ?? []).some(
        (e) => (e as { kind?: string })?.kind === "invulnerable",
      );
      if (!has) drift.push(`${cid}.${slot}`);
    }
    expect(
      drift,
      "standalone 有 invulnerable、champion 內嵌那份沒有 —— PreviewController 會整份讀內嵌的",
    ).toEqual([]);
  });
});
