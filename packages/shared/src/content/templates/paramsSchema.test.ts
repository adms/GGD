/**
 * The form/expander AGREEMENT test.
 *
 * `paramsSchemaFor` is what the editor renders and validates against;
 * `expand()` is what the game runs. If they can disagree about a template's
 * params then 「表單看到的 == 遊戲跑的」 is false, and the failure is invisible —
 * the form happily accepts a value the expander rejects at registry time.
 *
 * So: for every ENABLED template shipped in content/ability-templates,
 *   (1) `defaultParamsFor` must satisfy `paramsSchemaFor`, and
 *   (2) those same defaults must expand cleanly into a valid AbilityDef half.
 * That is the whole contract, checked against the real files rather than a
 * fixture, so adding a template with a bad default fails here.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zTemplateDoc, type ParamSlot, type TemplateDoc } from "../schema/template";
import { defaultParamsFor, paramsSchemaFor } from "./paramsSchema";
import { expand, isExpandable, modelFxPathsFor } from "./expand";
import { resolveTemplateExpansion } from "./resolve";
import { zAbilityDoc } from "../schema/ability";
import { zSpawnModelFx } from "../schema/effects/spawnModelFx";

const TEMPLATES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../content/ability-templates",
);

function allTemplates(): TemplateDoc[] {
  return readdirSync(TEMPLATES_DIR)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => zTemplateDoc.parse(JSON.parse(readFileSync(join(TEMPLATES_DIR, f), "utf8"))));
}

/**
 * ⭐⭐ GH#987 —— 「這一格**要先填什麼**才讀得到它」。
 *
 * 量到的實例：`tpl-teleport.damage` 是 `optional` 且**沒有 default** ⇒ 預設參數展開
 * 出來一發傷害都沒有 ⇒ `damageType` 在預設下**永遠不會被讀到**。
 * ⛔ 而它**不是** inert —— 填了 `damage` 它就決定傷害類型。
 *
 * ⇒ 這張表寫的是那個**前提**，⛔ 不是一張跳過清單：探針把 companion 一起填進去，
 *   ⭐ 而**基準線也帶著同一份 companion** ⇒ 這一格仍然必須 MOVES，只是問對了問題。
 *   （⛔ 只把 companion 加在探針那一邊 = 基準線與探針差兩個欄位 ⇒ 全部都「會動」。）
 */
const PROBE_COMPANION: Record<string, Record<string, unknown>> = {
  "tpl-teleport.damageType": { damage: { perRank: [100], ratios: [] } },
  // ⭐ GH#1047 —— 沿線間距只有 ≥2 具才有意義：展開器在 count<2 時**不發** spacing
  //   （否則家族預設 count=1 的展開過不了 zAbilityDoc 的 refine）。前提是 count:2。
  "tpl-beam-roll.spacing": { count: 2 },
  // ⭐ GH#1067 —— 增益的長度只有在**真的發了** applyBuff 時才進得了展開結果：`modifiers`
  //   是 optional 且**刻意沒有預設**（出貨 9 支是純變身，清空 ⇒ 真的不發那個節點）。
  //   ⛔ 沒有這一列，這一格會被判成「表單收得下、展開器不讀」而其實它是活的。
  "tpl-transform.buffDurationSec": { modifiers: [{ stat: "ad", op: "flat", value: 50 }] },
};

/**
 * ⭐⭐ GH#987 —— 一格的**擾動候選**：與現值不同、而且滿足這一格自己 schema 的值。
 * 呼叫端會再 `safeParse` 一次，所以這裡寧可多給幾個候選（有一個會動就算活的）。
 *
 * | type | 怎麼擾動 | 為什麼夠 |
 * |---|---|---|
 * | `number` | 往 min/max 的另一邊挪一格 | 原本就有的做法 |
 * | `enum` | `values` 裡**別的**成員 | 換的是身分本身，expander 一讀就會分岔 |
 * | `scaling` | 加 `mult` / 換 `perRank` / 換 `damageTier` **三個**都試 | ⛔ 一種擾動不夠：有的分支只讀 `perRank`，有的整包抄進 effect |
 * | `docRef` | 另一個合法的 `zId` | `docRef()` 只驗格式，字串直接進展開結果 |
 * | `rgb` | 全黑 / 全白 | 形狀與 `model@1.fxTint` 相同，三個 0…1 |
 * | `statModifiers` | 換一條 modifier / 清空 | 陣列整包進 passive |
 * | `condition` | `chance` 葉（p=0.5 / 0.25） | ⭐ 最小的合法條件樹，⛔ 不必造一棵完整的 |
 *
 * ⚠️ ⭐ **有一個候選會動就算活的**（⛔ 不是「每一個都要動」）——
 * 一個只讀 `damage.perRank` 的分支對 `mult` 是瞎的，而那**不代表這一格是死的**。
 */
function probesFor(slot: ParamSlot, current: unknown): unknown[] {
  const differs = (v: unknown) => JSON.stringify(v) !== JSON.stringify(current);
  switch (slot.type) {
    case "number": {
      const cur = typeof current === "number" ? current : 0;
      const lo = slot.min ?? cur - 1;
      const hi = slot.max ?? cur + 1;
      return [cur === lo ? Math.min(hi, cur + 1) : Math.max(lo, cur - 1)].filter(differs);
    }
    case "enum":
      return (slot.values ?? []).filter(differs);
    case "scaling": {
      const b = (current !== null && typeof current === "object" ? current : {}) as Record<
        string,
        unknown
      >;
      return [
        { ...b, mult: b.mult === 3 ? 2 : 3 },
        { perRank: [7, 8, 9], ratios: [] },
        { damageTier: "極大", ratios: [] },
      ].filter(differs);
    }
    case "docRef":
      return ["probe.alt.one", "probe.alt.two"].filter(differs);
    case "rgb":
      return [
        [0, 0, 0],
        [1, 1, 1],
      ].filter(differs);
    case "statModifiers":
      return [[{ stat: "ad", op: "flat", value: 7 }], []].filter(differs);
    case "condition":
      return [
        { kind: "chance", p: 0.5 },
        { kind: "chance", p: 0.25 },
      ].filter(differs);
    case "applyStatus":
      // ⭐ GH#1066 —— 一整個節點（去掉 kind）；兩個候選各帶一格機制欄位，⛔ 不是只有 id。
      return [
        { statusId: "root", duration: 1, root: true },
        { statusId: "burnstun", duration: 1, stun: true },
      ].filter(differs);
    case "dot":
      // ⭐ GH#1068 —— 同上：整個 dot 節點。⚠️ 兩個候選的**傷害**不同，⛔ 不是只有時間不同
      //    （只動 durationSec 的探針對「展開器把 amountPerTick 掉了」是瞎的）。
      return [
        { damageType: "magic", amountPerTick: { flat: 5 }, intervalSec: 1, durationSec: 2 },
        { damageType: "physical", amountPerTick: { flat: 9 }, intervalSec: 0.5, durationSec: 3 },
      ].filter(differs);
    case "spawnVfx":
      // ⭐ GH#1068 —— 整個 spawnVfx 節點。第二個候選走 `at:"bone"`＋`attach`＋`boneOn`
      //    （成對成立的那三格），⛔ 不是兩個只差 vfxId 的探針。
      return [
        { vfxId: "probe.vfx.one", at: "self" },
        { vfxId: "probe.vfx.two", at: "bone", attach: "chest", boneOn: "victim" },
      ].filter(differs);
  }
}

describe("paramsSchemaFor / defaultParamsFor — the form↔expander agreement", () => {
  const templates = allTemplates();

  it("finds the shipped template docs", () => {
    expect(templates.length).toBeGreaterThanOrEqual(29);
  });

  it("every enabled template's own defaults satisfy its synthesised schema", () => {
    for (const t of templates.filter((x) => x.status === "enabled")) {
      const res = paramsSchemaFor(t).safeParse(defaultParamsFor(t));
      expect(res.success, `${t.id}: ${res.success ? "" : JSON.stringify(res.error.issues)}`).toBe(
        true,
      );
    }
  });

  it("every enabled template's defaults EXPAND (form default == a runnable skill)", () => {
    for (const t of templates.filter((x) => x.status === "enabled")) {
      expect(isExpandable(t.family), `${t.id} has no expand path`).toBe(true);
      const ex = expand(t, defaultParamsFor(t));
      expect(ex.castType, t.id).toBeTruthy();
      // ⚠️ ⭐ GH#1078 —— 這一段只看**中間節點**（展開結果非空）。「那個 effect 在 sim 裡
      //    跑起來有沒有做任何事」住在 `templateDefaultsCast.test.ts`：每一份 enabled 模板的
      //    預設展開真的施放一次，交給出貨的 `castabilityVerdict` 判（GH#1076 的 maxAlive=0
      //    就是從這裡的綠燈底下穿過去的）。⛔ 這裡不要再加「像不像會動」的猜測。
      // a template either produces effects, or is a passive whose behaviour
      // hangs off hooks, or installs a named MARK — never all empty, which
      // would be a silent no-op skill. (`marks` joined the list on 2026-08-08:
      // 具名標記 does its work in the damage pipeline and the stat pipeline,
      // never through `runEffects`, so a mark-only card legitimately ships an
      // empty `effects` — see the `mark-stacks` family in expand.ts.)
      const inert =
        ex.effects.length === 0 && ex.passive === undefined && (ex.marks?.length ?? 0) === 0;
      expect(inert, `${t.id} expands to a skill that does NOTHING`).toBe(false);
    }
  });

  it("number ranges survive into the schema, so the form clamps", () => {
    for (const t of templates) {
      for (const [name, slot] of Object.entries(t.params)) {
        if (slot.type !== "number" || slot.max === undefined) continue;
        const over = { ...defaultParamsFor(t), [name]: slot.max + 1 };
        expect(paramsSchemaFor(t).safeParse(over).success, `${t.id}.${name}`).toBe(false);
      }
    }
  });

  /**
   * THE ANTI-SILENCE INVARIANT.
   *
   * A param slot the expander never reads is the worst kind of bug this system
   * can have: the designer types a measured number into a form, the form accepts
   * it, and the game ignores it completely. Nothing else in the stack would ever
   * report that — the doc validates, the expansion validates, the skill casts.
   *
   * So every slot is PROBED: expand with the default, expand again with a
   * different value that still satisfies the slot's own schema, and compare. If
   * the expansion did not move, the slot is inert and MUST carry an `inert`
   * reason (which the editor renders as 「本版不生效」). Conversely a slot marked
   * inert that DOES move must lose the flag. When P2 adds `leap`/`knockback` and
   * P3 adds `sequentialSegments`, the flags stop being true and this test says so.
   *
   * ⭐⭐ GH#987 —— 在此之前第一行逐字是 `if (slot.type !== "number") continue;`
   * ⇒ 出貨的 **19 格 `inert` 宣告只有 12 格**（number 型）被驗過，
   * 剩下的 enum／scaling／docRef **沒有任何人驗過它們真的無效**。
   * ⚠️ ⭐ 風險方向是**反的**：一格宣告 inert 卻其實會動 ⇒ 編輯器把一個引擎真的在讀的
   * 旋鈕**灰掉**並寫「本版不生效」——⭐ 那是第一守則的反面（一格調不到的參數），
   * 而 ⛔ 沒有任何東西會紅。⇒ 現在**每一型**都有探針（見 {@link probesFor}）。
   */
  it("每一格參數,要嘛 MOVES 展開結果,要嘛宣告 inert（⭐ GH#987:⛔ 不再只有 number）", () => {
    let probed = 0;
    for (const t of templates.filter((x) => x.status === "enabled")) {
      const defaults = defaultParamsFor(t);
      for (const [name, slot] of Object.entries(t.params)) {
        const key = `${t.id}.${name}`;
        // ⭐ GH#1057 —— 單值 enum ＝ 模板把這一格**釘死**（`tpl-locust-line`／`tpl-locust-strike`
        //    的 `path` 只撐得起 static，見 `modelFxPathsFor()`）。它造不出擾動值，⛔ 但不能靜靜
        //    跳過：釘死的格 default 必須就是那唯一的值，而且不可以宣告 inert（展開器讀它）。
        if (slot.type === "enum" && slot.values?.length === 1) {
          expect(slot.default, `${key}: 釘死的 enum，default 必須是那唯一的值`).toBe(slot.values[0]);
          expect(slot.inert, `${key}: 釘死的 enum 不是 inert —— 展開器讀它`).toBeUndefined();
          continue;
        }
        const base = { ...defaults, ...(PROBE_COMPANION[key] ?? {}) };
        const baseline = JSON.stringify(expand(t, base));
        // ⭐ 探針值要**滿足這一格自己的 schema**,否則紅的是 Zod ⛔ 不是 expander。
        const probes = probesFor(slot, base[name]).filter(
          (v) => paramsSchemaFor(t).safeParse({ ...base, [name]: v }).success,
        );
        expect(
          probes.length,
          `${key}: 造不出任何一個合法的擾動值 ⇒ 這一格**從來沒有被驗過** —— ` +
            `⛔ 不可以靜靜跳過它;給 probesFor() 補上這一型的探針,或在 PROBE_COMPANION 補上它的前提`,
        ).toBeGreaterThan(0);
        probed++;
        const moved = probes.some((v) => {
          try {
            return JSON.stringify(expand(t, { ...base, [name]: v })) !== baseline;
          } catch {
            // ⭐ 擲得出來就代表 expander **讀了**這一格（它只驗自己拿到的那個值）
            return true;
          }
        });
        if (slot.inert === undefined) {
          expect(
            moved,
            `${key} is a live form field the expander IGNORES — either wire it up in expand.ts or give it an \`inert\` reason so the editor greys it out`,
          ).toBe(true);
        } else {
          expect(
            moved,
            `${key} is marked inert but the expander now honours it — drop the \`inert\` flag`,
          ).toBe(false);
        }
      }
    }
    // sentinel：迴圈整個沒跑到也會是「全綠」—— 那是這條守衛最危險的失敗方式。
    expect(probed, "探針掃描回空的 —— 偵測壞了,⛔ 不是真的沒有參數格").toBeGreaterThan(100);
  });

  it("enum slots only accept their declared values", () => {
    for (const t of templates) {
      for (const [name, slot] of Object.entries(t.params)) {
        if (slot.type !== "enum" || !slot.values?.length) continue;
        const bad = { ...defaultParamsFor(t), [name]: "definitely-not-a-member" };
        expect(paramsSchemaFor(t).safeParse(bad).success, `${t.id}.${name}`).toBe(false);
      }
    }
  });

  it("defaults are deep-copied, so two open forms cannot alias the doc", () => {
    const withObject = templates.find((t) =>
      Object.values(t.params).some((s) => s.type === "scaling"),
    );
    expect(withObject).toBeDefined();
    const a = defaultParamsFor(withObject!);
    const b = defaultParamsFor(withObject!);
    const key = Object.entries(withObject!.params).find(([, s]) => s.type === "scaling")![0];
    expect(a[key]).toEqual(b[key]);
    expect(a[key]).not.toBe(b[key]);
  });

  it("a DRAFT template is refused by the expander, never half-expanded", () => {
    for (const t of templates.filter((x) => x.status === "draft")) {
      expect(isExpandable(t.family), `${t.id} is draft but has an expand path`).toBe(false);
      expect(() => expand(t, {})).toThrow();
    }
  });
});

/**
 * ⭐⭐ GH#1047 —— 「defaults EXPAND」只看 castType／非空 payload，⛔ 看不到 schema 的
 * **跨欄位 refine**。量到的（2026-09-06）：35 張 enabled 卡預設參數 35/35 展得開，
 * 而送進 `zAbilityDoc` 只有 **33/35** 過 —— `tpl-beam-roll` 發了一格 count=1 讀不到的
 * `spacing`、`tpl-dragon-serpent` 發了 `clipTimeScale` 卻沒有 `clip`。
 * ⇒ 編輯器開一張新卡、存檔、載入 ⇒ `registries.ts::expandIfTemplated` 把它降級成
 *   「⚠️【模板展開失敗，此技能目前沒有效果】」，而 paramsSchema 這一整支是綠的。
 *
 * 這一段走的是**出貨的那條路**：骨架 doc ＋ `template` 綁定 → `resolveTemplateExpansion`
 * （registries 用的同一支）→ `zAbilityDoc.safeParse`。⛔ 不是自己 merge 一份。
 *
 * ── 分支（enum 的每一個值、optional 無 default 的格填一個探針）是**棘輪** ──────
 * 量到 281 個探針裡有一族結構性的缺口：modelFx 家族的參數集合是**按預設 path** 宣告的
 * （static 族沒有 speed/distance；forward 族沒有 count/spacing/lifeSec）⇒ 表單上換
 * `path` 這一格，展開就擲例外或被 refine 擋。⛔ 那不在 GH#1047 的範圍（它修的是預設），
 * 所以下面 `KNOWN_BRANCH_GAPS` 逐格點名，⭐ 只能變短：新的紅會指名它，修好一格要把它刪掉。
 *
 * ⭐ GH#1057（2026-09-06）—— modelFx 那 30 格清空了，兩件事合起來：
 *   ① 展開器逐格問 `MODEL_FX_PATH_FIELDS`（⭐ 與 Zod refine 同一張表）「這條路徑讀不讀它」
 *      ⇒ 12 個「count 發給 forward/toTarget」分支消失；
 *   ② 十份模板的 `path.values` 收窄成 `modelFxPathsFor(t)`（下面那條守衛逼的）
 *      ⇒ 18 個「模板根本沒有那條路徑要的格」分支不再開給表單。
 */
const KNOWN_BRANCH_GAPS: ReadonlySet<string> = new Set([
  // body=champion 要先填 championId（同 PROBE_COMPANION 那種前提）
  "tpl-summon-agent.body=champion",
]);

describe("每一張 enabled 卡的展開結果要過**完整**的 ability schema（GH#1047）", () => {
  const templates = allTemplates();
  const byId = new Map(templates.map((t) => [t.id, t]));
  const enabled = templates.filter((t) => t.status === "enabled");

  /** 一份 templated doc 留在磁碟上的那一半（同 stack.test.ts）；被動卡走 PASSIVE。 */
  function throughRegistryPath(t: TemplateDoc, params: Record<string, unknown>): string | null {
    let passive: boolean;
    let innateKind: string | undefined;
    try {
      const ex = expand(t, params);
      passive = ex.innateKind !== undefined || ex.passive !== undefined || (ex.marks?.length ?? 0) > 0;
      innateKind = ex.innateKind;
    } catch (e) {
      return `expand 擲例外：${(e as Error).message}`;
    }
    const doc: Record<string, unknown> = {
      schema: "ability@1", id: "godie-probe.q", name: "探針",
      slot: passive ? "PASSIVE" : "Q", castType: "self", maxRank: 1,
      cooldown: [8], manaCost: [50], range: 5, effects: [],
      ...(passive ? { innateKind: innateKind ?? "passive" } : {}),
      template: { ref: t.id, params },
    };
    const res = resolveTemplateExpansion(doc, byId);
    if (!res.ok) return `resolve：${res.failure.message}`;
    const parsed = zAbilityDoc.safeParse(res.merged);
    return parsed.success
      ? null
      : parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(" | ");
  }

  it("★ 預設參數 → 骨架＋綁定 → resolveTemplateExpansion → zAbilityDoc：35/35，⛔ 不是 33/35", () => {
    const bad = enabled
      .map((t) => [t.id, throughRegistryPath(t, defaultParamsFor(t))] as const)
      .filter(([, err]) => err !== null)
      .map(([id, err]) => `${id}: ${err}`);
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("enum 的每一個值／optional 無 default 的格：過 schema，或在 KNOWN_BRANCH_GAPS 上（棘輪只能變短）", () => {
    const unexpected: string[] = [];
    const seen = new Set<string>();
    let probed = 0;
    for (const t of enabled) {
      const d = defaultParamsFor(t);
      for (const [k, slot] of Object.entries(t.params)) {
        const variants: [string, unknown][] = [];
        if (slot.type === "enum") {
          for (const v of slot.values ?? []) if (v !== d[k]) variants.push([`${k}=${v}`, v]);
        } else if (slot.optional && !("default" in slot)) {
          const probe = probesFor(slot, undefined)[0];
          if (probe !== undefined) variants.push([`${k}=optional`, probe]);
        }
        for (const [label, v] of variants) {
          const params = { ...d, ...(PROBE_COMPANION[`${t.id}.${k}`] ?? {}), [k]: v };
          if (!paramsSchemaFor(t).safeParse(params).success) continue;
          probed++;
          const key = `${t.id}.${label}`;
          const err = throughRegistryPath(t, params);
          if (err === null) continue;
          seen.add(key);
          if (!KNOWN_BRANCH_GAPS.has(key)) unexpected.push(`${key}: ${err}`);
        }
      }
    }
    expect(probed, "分支探針掃描回空的 —— 偵測壞了").toBeGreaterThan(100);
    expect(unexpected, `新的分支缺口（⛔ 不要加進 KNOWN_BRANCH_GAPS，去修展開器／模板）:\n${unexpected.join("\n")}`).toEqual([]);
    const stale = [...KNOWN_BRANCH_GAPS].filter((k) => !seen.has(k));
    expect(stale, `這些分支已經過 schema 了 —— ⭐ 把它們從 KNOWN_BRANCH_GAPS 刪掉（棘輪只能變短）`).toEqual([]);
  });
});

/**
 * ⭐⭐ GH#1057 —— 「表單 enum ⊆ 出貨 Zod 的 enum」。modelFx 家族的模板裡，凡是與
 * `zSpawnModelFx` **同名**的 enum 格（path／anchor／touchSide／boneOn），`values` 一定是那格
 * Zod enum 的子集 —— 值住 Zod，模板只是投影，⛔ 不是第二份。`path` 再多一層：
 * ⊆ `modelFxPathsFor(t)`（這份模板的格**撐得起**的路徑）—— 否則表單開得出、載入拒收，
 * 而那正是上面 30 個棘輪缺口的形狀。
 * 家族成員是**量**出來的（預設展開的第一個 effect 是 spawnModelFx），⛔ 不是一張手寫清單。
 */
describe("modelFx 家族：表單 enum ⊆ 出貨 Zod（GH#1057）", () => {
  const zodEnumOptions = (name: string): readonly string[] | undefined => {
    let s: z.ZodTypeAny | undefined = (zSpawnModelFx.shape as Record<string, z.ZodTypeAny>)[name];
    while (s instanceof z.ZodOptional) s = s.unwrap();
    return s instanceof z.ZodEnum ? (s.options as readonly string[]) : undefined;
  };
  const fam = allTemplates().filter(
    (t) =>
      t.status === "enabled" &&
      (expand(t, defaultParamsFor(t)).effects[0] as { kind?: string } | undefined)?.kind ===
        "spawnModelFx",
  );

  it("每一格同名 enum 的 values ⊆ Zod options；path 還要 ⊆ modelFxPathsFor(t)", () => {
    expect(fam.length, "量到的家族回空的 —— 偵測壞了").toBeGreaterThanOrEqual(10);
    const bad: string[] = [];
    for (const t of fam) {
      for (const [k, slot] of Object.entries(t.params)) {
        if (slot.type !== "enum") continue;
        const opts = zodEnumOptions(k);
        if (opts === undefined) continue;
        const allowed: readonly string[] = k === "path" ? modelFxPathsFor(t) : opts;
        if (!slot.values?.length) bad.push(`${t.id}.${k}: 一個值都沒有`);
        for (const v of slot.values ?? []) {
          if (!opts.includes(v)) bad.push(`${t.id}.${k}=${v}: 出貨 Zod 沒有這個值`);
          else if (!allowed.includes(v))
            bad.push(`${t.id}.${k}=${v}: 模板撐不起這條路徑（撐得起的只有 ${allowed.join("/")}）`);
        }
      }
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });
});
