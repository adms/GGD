/**
 * vfx-subtype@1 —— 特效**子模組**（GH#990 第一批：schema ＋ 閘 ＋ 盤點出來的積木）。
 *
 * ⭐ **來源**（owner 2026-09-05，逐字）：
 * > 「並且盡量特效模組化(甚至 sub-type) 像JASS一樣可以呼叫設定 來拼湊組合
 * >  並非每個技能都一個特定特效，[後台編輯器及codex編輯器] 是堆積木的角色
 * >  要充分了解有哪些積木, 而 main 遊戲主程式 是做出積木供使用的角色」
 *
 * 一份 subtype ＝ **一組參數化的 `vfx-script@1` 段落**。它像 JASS 的一支函式：
 * 有名字、有參數、有預設值，而**呼叫端只寫參數**。展開（`expandVfxSubtype`）是
 * 純函式且**決定性**的 —— 之後 `vfx-script@2` 的 `{"call":{...}}` 與客戶端播放器
 * 共用**這一支**展開器（⛔ 不寫兩份，票文 Known risks）。
 *
 * ── ⭐ 盤點（2026-09-05 量到的，⛔ 不是憑感覺）────────────────────────────────
 * `content/vfx-scripts/` **10 支**、**63 個 segment**、其中 **38 種不同的**段落。
 * 而重複的形狀**不是**票文猜的 `beam.solid`／`slash.arc` 那一族 —— 量出來是
 * **四對逐位元組完全相同的整份腳本**：
 *
 * | 塊 | 段數 | 呼叫端 |
 * |---|---:|---|
 * | `sub.bladestorm-8hit`    | 17 | `godie-e002.ex` · `godie-e00l.ex` |
 * | `sub.doom-mark-cast`     |  2 | `godie-h020.e` · `godie-hjai.e` |
 * | `sub.dive-dash-thunder`  |  4 | `godie-n01c.r` · `godie-nbbc.r` |
 * | `sub.forward-twin-blast` |  2 | `godie-o00x.r` · `godie-ogrh.r` |
 *
 * ⇒ 這四塊覆蓋 **50/63（79%）** 的段落。⛔ 而票文猜的那五顆一個都不存在 ——
 * ⭐ 這正是「盤點 → 按重複次數排序」與「憑感覺列一張表」的差別。
 *
 * ⚠️ **量到但這一批刻意不做**（⛔ 不是漏掉）：
 * `screenShake`（4 支腳本各一次）與 `anim{at:"target",pulse:"hurt"}`（3 支）
 * 也重複 ≥2，⛔ 但它們是**單段**、包起來之後參數數量與原本一模一樣
 * ⇒ 零壓縮、純轉手。要值得包，它得帶一條**量得出來的級距**
 * （像 `damage-tiers` 那樣），而今天只有 3–4 個散點，編一條級距就是憑空捏造
 * （CLAUDE.md：模板 `params[*].default` 的每一格都要引用得到出處）。
 *
 * ── ⛔⛔ 第〇·四守則：**一個值只有一個住處** ──────────────────────────────
 * 被 `bind` 的欄位**不可以**同時寫在 `segments` 的樣板裡 —— 那就是第二個住處，
 * 而它必然會漂。superRefine ③ 逐格擋下來（⛔ 不是註解，是會紅的檢查）。
 * ⇒ 樣板段落**故意是不完整的**；完整的段落只在 `expandVfxSubtype()` 之後存在。
 *
 * ── ⭐ 詞彙不另起一份 ─────────────────────────────────────────────────────
 * · 段落的詞彙 ＝ `zVfxScriptSegment`（`schema/vfxScript.ts`）——
 *   superRefine ④ 拿**展開後**的結果去 parse，所以上下界與跨欄規則一條都沒漏。
 * · 參數的詞彙 ＝ `zParamSlot`（`schema/template.ts`，鑄技工坊那一套）——
 *   同一個 `type` / `min` / `max` / `values` / `origin` 文法。
 *
 * ⚠️ `inert` **刻意沒有 pick 進來**：這一批沒有任何一格是 inert，而一個沒有人用的
 * optional 欄位就是 `fieldAdoption` 的 **S8**（機制上線、內容 0 筆）。
 * ⇒ 它要進來的那一天，跟**第一格真的 inert 的參數**一起進來。
 *
 * ⚠️ `origin` 與 `default` 在這裡是**必填**（⛔ 不是像模板那樣 optional＋豁免表）：
 * 這是一個**零遺產**的新集合 —— 豁免表存在是為了收拾歷史，⛔ 不是為了讓新東西留白。
 */
import { z } from "zod";
import { zId } from "./ref";
import { zParamSlot } from "./template";
import { zVfxScriptSegment, type VfxScriptSegment } from "./vfxScript";

/**
 * 出處文法 —— 至少含一個 token（其餘自由散文），與 `schema/template.ts` 的
 * `origin` 同一套詞彙。⭐ 這一批全部用 `census:`，而且它是**可解析、可反駁**的：
 *
 *   `census:vfx-scripts/<scriptId>#<段索引>.<欄位>`
 *
 * ⭐ `vfxSubtypesRatchet.test.ts` 真的去讀那一支腳本的那一段的那一格，
 * 並比對它**等不等於**這裡的 `default` —— ⛔ 不是「有沒有 census: 這五個字」。
 */
export const VFX_SUBTYPE_ORIGIN_TOKENS = [
  "census:",
  "j:",
  "owner:",
  "derived:",
  "taxonomy:",
] as const;

/** `census:vfx-scripts/<id>#<i>.<field>` 的解析式（守衛與這裡共用同一條）。 */
export const VFX_SUBTYPE_CENSUS_RE = /census:vfx-scripts\/([a-z0-9][a-z0-9._-]*)#(\d+)\.([A-Za-z][A-Za-z0-9]*)/;

/** 這一格參數填進哪一段的哪一個欄位。 */
export const zVfxSubtypeBinding = z
  .object({
    /** `segments` 的索引（0 起算）。 */
    segment: z.number().int().min(0).max(63),
    /** 那一段的**頂層**欄位名（`amplitude` / `strikeIndex` / `vfxId` …）。 */
    field: z.string().min(1).max(40),
  })
  .strict();
export type VfxSubtypeBinding = z.infer<typeof zVfxSubtypeBinding>;

/**
 * 一格參數。⭐ 從 `zParamSlot` **pick** 出來（⛔ 不另寫一份），
 * 再把 `default` / `origin` 收緊成必填，並長出 `bind`（它填到哪裡去）。
 */
export const zVfxSubtypeParam = zParamSlot
  .pick({ type: true, default: true, min: true, max: true, values: true, origin: true })
  .required({ default: true, origin: true })
  .extend({
    /** 這一格填進哪幾個（段, 欄位）。⭐ 一格可以餵很多段（例：收尾段號一次餵 11 段）。 */
    bind: z.array(zVfxSubtypeBinding).min(1).max(32),
  });
export type VfxSubtypeParam = z.infer<typeof zVfxSubtypeParam>;

export const zVfxSubtypeDoc = z
  .object({
    id: zId,
    schema: z.literal("vfx-subtype@1"),
    /** 編輯器積木清單上的名字（中文）。 */
    label: z.string().min(1).max(60),
    /** 給下一輪／編輯器的出處備註。 */
    notes: z.string().max(4000).optional(),
    /**
     * ⭐ **出處**：這一塊是從哪幾支 `vfx-script` 量出來的。
     * ⚠️ 這是**引用**，⛔ 不是相依 —— 所以刻意用 `zId` 而**不是** `zRef("vfx-scripts")`：
     * 一個模組不該相依它的呼叫端，而且硬參照會把 `vfx-scripts`
     * 從「葉子集合」變成有人指著它（`buildIndexesValidates.test.ts:167` 的前提）。
     * 守衛照樣會去讀那幾支（`vfxSubtypesRatchet.test.ts` 的等價斷言）。
     */
    derivedFrom: z.array(zId).min(1).max(16),
    /** 參數名 → 一格 slot。 */
    params: z.record(zVfxSubtypeParam),
    /**
     * 段落**樣板** —— ⚠️ 被 `bind` 的欄位**不在這裡**（第〇·四守則）。
     * 型別故意寬鬆：真正的驗證是拿**展開後**的結果去 `zVfxScriptSegment` parse，
     * 那才是玩家真的會播到的東西。
     */
    segments: z.array(z.record(z.unknown())).min(1).max(64),
  })
  .strict()
  .superRefine((doc, ctx) => {
    const claimed = new Map<string, string>(); // "seg#field" → param 名

    for (const [name, p] of Object.entries(doc.params)) {
      // ① 出處要含一個 token（可解析的那一種在守衛裡再逐格去讀）
      if (!VFX_SUBTYPE_ORIGIN_TOKENS.some((t) => p.origin.includes(t))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["params", name, "origin"],
          message:
            `出處引用不到任何東西 —— 要含 ${VFX_SUBTYPE_ORIGIN_TOKENS.join(" / ")} 其中一個。` +
            ` ⛔ 沒有出處的 default 會變成下一輪的「原作就是這樣」（CLAUDE.md 第一守則）`,
        });
      }
      // ② enum 一定要有 values，而且 default 要在裡面
      if (p.type === "enum") {
        if (!p.values || p.values.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["params", name, "values"],
            message: 'type:"enum" 一定要列 values —— 否則編輯器渲染不出那格下拉選單',
          });
        } else if (typeof p.default !== "string" || !p.values.includes(p.default)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["params", name, "default"],
            message: `default ${JSON.stringify(p.default)} 不在 values 裡`,
          });
        }
      }
      if (p.type === "number" && typeof p.default === "number") {
        if (p.min !== undefined && p.default < p.min) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["params", name, "default"],
            message: `default ${p.default} < min ${p.min}`,
          });
        }
        if (p.max !== undefined && p.default > p.max) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["params", name, "default"],
            message: `default ${p.default} > max ${p.max}`,
          });
        }
      }
      for (const b of p.bind) {
        const seg = doc.segments[b.segment];
        if (seg === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["params", name, "bind"],
            message: `bind 指到第 ${b.segment} 段，而這份只有 ${doc.segments.length} 段`,
          });
          continue;
        }
        // ③ ⛔⛔ 第〇·四守則：被 bind 的欄位不可以同時寫在樣板裡（第二個住處）
        if (Object.prototype.hasOwnProperty.call(seg, b.field)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["segments", b.segment, b.field],
            message:
              `這一格同時住在 params.${name}.default 與 segments[${b.segment}].${b.field} ——` +
              ` ⛔ 兩個住處必然會漂。把樣板裡那一格刪掉，值只留在 params`,
          });
        }
        const key = `${b.segment}#${b.field}`;
        const prev = claimed.get(key);
        if (prev !== undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["params", name, "bind"],
            message: `segments[${b.segment}].${b.field} 已經被 params.${prev} 佔了 —— 兩格參數搶同一個欄位，展開結果就取決於順序`,
          });
        } else claimed.set(key, name);
      }
    }

    // ④ 展開之後**每一段都要是合法的 vfx-script 段落** —— ⭐ 玩家真的會播到的是它
    const expanded = expandVfxSubtypeRaw(doc);
    expanded.forEach((seg, i) => {
      const r = zVfxScriptSegment.safeParse(seg);
      if (!r.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["segments", i],
          message:
            `用預設值展開之後這一段不是合法的 vfx-script 段落：` +
            r.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join(" · "),
        });
      }
    });
  });

export type VfxSubtypeDoc = z.infer<typeof zVfxSubtypeDoc>;

/**
 * ⭐ **展開器（純函式、決定性）** —— 樣板段落 ＋ 參數值 → 完整段落。
 *
 * ⛔ 沒有 `Math.random` / `Date.now` / 迭代順序相依：參數依**名字排序**套用，
 * 而 superRefine ③ 已經保證兩格參數不會搶同一個欄位 ⇒ 順序其實無關，
 * 排序只是把「無關」變成「量得到的無關」。
 *
 * @param overrides 呼叫端給的值；缺席的格子用 `params[*].default`。
 *                  ⚠️ 不認得的 key 會被**忽略**（呼叫端的 schema 才是擋它的地方）。
 */
export function expandVfxSubtypeRaw(
  doc: Pick<VfxSubtypeDoc, "params" | "segments">,
  overrides?: Readonly<Record<string, unknown>>,
): Record<string, unknown>[] {
  const out = doc.segments.map((s) => ({ ...s }));
  for (const name of Object.keys(doc.params).sort()) {
    const p = doc.params[name]!;
    const value =
      overrides && Object.prototype.hasOwnProperty.call(overrides, name)
        ? overrides[name]
        : p.default;
    for (const b of p.bind) {
      const seg = out[b.segment];
      if (seg !== undefined) seg[b.field] = value;
    }
  }
  return out;
}

/** 同上，但把結果 parse 成型別化的段落（⛔ 不合法就擲）。 */
export function expandVfxSubtype(
  doc: Pick<VfxSubtypeDoc, "params" | "segments">,
  overrides?: Readonly<Record<string, unknown>>,
): VfxScriptSegment[] {
  return expandVfxSubtypeRaw(doc, overrides).map((s) => zVfxScriptSegment.parse(s));
}
