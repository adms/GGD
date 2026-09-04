#!/usr/bin/env tsx
/**
 * ⭐⭐ 【type 目錄】給 Codex 編輯器的**可挑清單 ＋ fail-closed 收據**（GH#916）。
 *
 * owner 2026-09-04（逐字）：
 * > 「如果同類特效 你可以用 **type1, type2 ....** 的方式擴充 讓設計者有更多選擇而不是只能靠自己微調」
 * > 「你應該有**非常多 type** 不只 1, 2 尤其常見共用例如**光束砲系列**，
 * >   並且應該建**文件、script 跟 codex編輯器契約**來實現」
 * > 「**整個矩陣是用來微調的**，你的任務是將我們**調好的常用幾種作為 type 積木**
 * >   讓編輯器選用後，可以再用矩陣微調節省時間」
 *
 * Codex 2026-09-04 的 handback 逐字要的東西：
 * > 「提供**機器可讀 capability／receipt**，讓 Editor 能 **fail-closed** 判斷。」
 *
 * ════════════════════════════════════════════════════════════════════════
 *  ⭐⭐ 這一份**跑真的東西**，⛔ 不是讀欄位
 * ════════════════════════════════════════════════════════════════════════
 * ⛔ 在此之前它只讀 `status` 與 `params` 的**筆數** —— 那是「名詞」。
 * ⭐ 而編輯器要的是「**關係**」：這個 type 挑下去，引擎接不接得住？
 *
 * ⇒ 三個欄位全部是**量出來的**：
 *
 * | 欄位 | 怎麼量 | ⛔ 不是 |
 * |---|---|---|
 * | `expands` | 拿模板**自己的 defaults** 真的跑一次 `expand()` | 讀 `status` |
 * | `params[*].fillsVia` | 這個鍵在不在 `modelFxPreset.ts` 出貨的三張表裡 | 抄一份鍵名清單 |
 * | `usedByAbilities` | grep 出貨的 `content/abilities/` | 手數 |
 *
 * ⚠️ ⭐ 2026-09-04 量到，而它是這一版存在的理由：
 * · **29 個 `enabled` 全部 expand OK · 17 個 `draft` 全部 throw** ⇒ `status` 今天是誠實的。
 *   ⛔ 但它誠實**不是結構保證的**。⚠️ ⭐ 而後果比「炸掉」更難查：
 *   `templateFailSoft.test.ts` 證明系統是 **fail-soft** —— 展開失敗**只降級那一支**，
 *   ⭐ 而那一支「技能還在，但**沒有模板效果**」。⇒ 一份 `status:"enabled"` 卻沒有
 *   `FAMILIES` 條目的模板，出貨後長成**一支靜靜地什麼都不做的技能**，
 *   而編輯器那邊看到的只是一個綠色的 badge（第一·五守則 ＋ fail-open 靜默）。
 * · **兩條佈線是不同的東西**，而它們共用一份 schema：
 *     `spawnModelFx.preset`（節點級，19 格由 `modelFxPreset` 填）
 *     `template.ref`（文件級，由 `expand()` 展開）
 *   ⇒ 挑錯邊 ＝ 失敗形態⑧「消費端存在，但它消費不到」。⭐ 契約要說清楚是哪一條。
 * · **3 份 draft 帶著 33 格已經做完的分析**（dragon-quake/serpent/shockwave）
 *   —— ⭐ 這正是 owner 說的「做完沒收斂成積木」，⛔ 而修法是**補 3 個 `FAMILIES` 條目**，
 *   ⛔ 不是把 `status` 翻成 enabled（那會出貨一張「說了但不會發生」的卡）。
 * · `tpl-data-no-trigger` 是**刻意**永遠不 enable 的普查終點（它自己的 description
 *   逐字說「永遠不會有參數，也永遠不會 enabled」）⇒ 它 ⛔ **不是**待填空殼，
 *   ⭐ 而判準是 `gapScore === 0`（今天唯一的一份），⛔ 不是一張手寫名單。
 *
 * ── ⛔ 為什麼是產生器而不是一份手寫清單 ────────────────────────────────
 * CLAUDE.md 第〇·四守則：一份手寫的表**沒有寫入端** ⇒ 它一定會過期，
 * ⭐ 而且**不會有東西紅**。⚠️ 前科就在同一天：`CODEX_TYPE_HANDOFF.md` 手寫了
 * 「32 份可挑 · 13 份空殼」，而量到的是 **29 / 14** —— 那份文件**當場就在說謊**。
 *
 * ⚠️ ⭐ **刻意沒有產生日期**（同 `caps:export` / `anchors:build`）：任何隨時鐘變動的
 * 欄位都會讓逐位元組比對永遠不相等，於是 `--check` 只能被放寬 ——
 * 而一條被放寬的閘等於沒有閘（GH#389 · #426）。
 *
 * 用法：
 *   pnpm typecat:build      # 產生（走 genrun，產物會重新上鎖）
 *   pnpm typecat:check      # 逐位元組比對，過期就回非零
 */
// ggd:writes docs/editor-contract/ggd-type-catalog.json
// ggd:writes docs/editor-contract/ggd-type-catalog.md
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expand } from "../../packages/shared/src/content/templates/expand";
import {
  PRESET_FIELDS,
  SOUND_FIELDS,
  TOUCH_FIELDS,
} from "../../packages/shared/src/content/modelFxPreset";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TPL_DIR = join(REPO, "content/ability-templates");
const VFX_DIR = join(REPO, "content/vfx");
const ABIL_DIR = join(REPO, "content/abilities");
const MODEL_DIR = join(REPO, "content/models");
const OUT_JSON = join(REPO, "docs/editor-contract/ggd-type-catalog.json");
const OUT_MD = join(REPO, "docs/editor-contract/ggd-type-catalog.md");
const CHECK = process.argv.includes("--check");

/** ⭐ 節點級 `spawnModelFx.preset` 填得動的鍵 —— **從出貨解析器 import**，⛔ 不抄。 */
const NODE_SLOTS = new Set<string>([...PRESET_FIELDS, ...SOUND_FIELDS, ...TOUCH_FIELDS]);

interface Slot {
  default?: unknown;
  type?: string;
  values?: unknown[];
}
interface Tpl {
  id: string;
  name?: string;
  description?: string;
  family?: string;
  status?: string;
  gapScore?: number;
  params?: Record<string, Slot>;
  requires?: string[];
  exemplar?: { skill?: string; jass?: string };
}

const jsonFiles = (dir: string): string[] =>
  existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "_index.json") : [];

const templates: Tpl[] = jsonFiles(TPL_DIR)
  .map((f) => JSON.parse(readFileSync(join(TPL_DIR, f), "utf8")) as Tpl)
  .sort((a, b) => (a.id < b.id ? -1 : 1));

const abilityBlob = jsonFiles(ABIL_DIR)
  .map((f) => readFileSync(join(ABIL_DIR, f), "utf8"))
  .join("\n");

const countOf = (re: RegExp): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const m of abilityBlob.matchAll(re)) out[m[1]!] = (out[m[1]!] ?? 0) + 1;
  return out;
};
/** ⭐ 兩條佈線分開數 —— 合起來數會讓「零採用」的判斷指向錯的那一半（GH#693 的病）。 */
const byPreset = countOf(/"preset"\s*:\s*"(tpl-[a-z0-9-]+)"/g);
const byRef = countOf(/"ref"\s*:\s*"(tpl-[a-z0-9-]+)"/g);

/**
 * ⭐⭐ **跑真的 `expand()`** —— 拿模板自己的 defaults 當參數。
 * ⛔ 不讀 `status`：那是一個**宣告**，而這裡要的是一個**事實**。
 */
function probeExpand(t: Tpl): { ok: boolean; error: string | null } {
  const params: Record<string, unknown> = {};
  for (const [k, s] of Object.entries(t.params ?? {})) if (s?.default !== undefined) params[k] = s.default;
  try {
    expand(t as never, params);
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e).slice(0, 200) };
  }
}

/** ⭐ 矩陣的實測覆蓋：`fx.prim.<元素>.<形狀>`（剝掉分片後綴）。 */
function matrix(): { elements: string[]; shapes: string[]; present: string[] } {
  const fams = new Set<string>();
  for (const f of jsonFiles(VFX_DIR)) {
    const id = f.slice(0, -5).replace(/[.\-](p\d\d?|r\d|s\d+)$/, "");
    const m = /^fx\.prim\.([a-z]+)\.(.+)$/.exec(id);
    if (m) fams.add(`${m[1]}.${m[2]}`);
  }
  const els = new Set<string>();
  const shs = new Set<string>();
  for (const k of fams) {
    const i = k.indexOf(".");
    els.add(k.slice(0, i));
    shs.add(k.slice(i + 1));
  }
  return { elements: [...els].sort(), shapes: [...shs].sort(), present: [...fams].sort() };
}

/**
 * ⭐⭐ 【模型自帶粒子的外觀收據】—— Codex 2026-09-04 handback 點名的唯一阻塞。
 *
 * ⛔ `model@1.fxEmitters` 生出來的 emitter **只拿得到一個世界座標**：
 * 注入簽章逐字是 `spawnTrail?(vfxId, x, y, z)`（`modelFxRig.ts:404`，唯一呼叫點 `:707-710`），
 * 而 `VfxSystem.play(rawDoc, x, z, nowMs, y, boost)`（`:1097`）本身也沒有那些欄位。
 * ⇒ ⭐ ⛔ 這不是「忘了傳」，是**通道寬度**。
 *
 * ⚠️ ⭐ 而外部編輯器**看不見這件事** —— 它會寫下 `tint`，schema 收，`content:build` 綠，
 * 而畫面上**同一顆模型的兩半顯示不同顏色**。⇒ 契約要把它變成一格可以 fail-closed 的資料。
 *
 * ⭐ 2026-09-04 量到（⛔ 不是估的）：**16 個節點**的 modelKey 帶 `fxEmitters`，
 * 其中 **14 個**真的設了會被丟掉的欄位；⭐ `godie-edem.e` 是全出貨**唯一**
 * 「有 emitter 的模型 ＋ 節點設了 `tint`」的節點 ⇒ 那個缺陷**今天就是活的**。
 */
const LOST_BY_EMITTERS = [
  "scale",
  "scaleAxis",
  "tint",
  "alpha",
  "clipTimeScale",
  "spinDegPerSec",
  "count",
  "spacing",
] as const;

function modelEmitters(): Map<string, number> {
  const out = new Map<string, number>();
  for (const f of jsonFiles(MODEL_DIR)) {
    const d = JSON.parse(readFileSync(join(MODEL_DIR, f), "utf8")) as {
      id?: string;
      fxEmitters?: string[];
    };
    if (d.id && (d.fxEmitters?.length ?? 0) > 0) out.set(d.id, d.fxEmitters!.length);
  }
  return out;
}

/** ⭐ 逐節點量：哪些出貨 `spawnModelFx` 節點會掉外觀。⛔ 不手數。 */
function emitterAffectedNodes(
  emitters: Map<string, number>,
): { ability: string; modelKey: string; emitterCount: number; fieldsLost: string[] }[] {
  const rows: { ability: string; modelKey: string; emitterCount: number; fieldsLost: string[] }[] = [];
  for (const f of jsonFiles(ABIL_DIR)) {
    const doc = JSON.parse(readFileSync(join(ABIL_DIR, f), "utf8")) as Record<string, unknown>;
    const id = String(doc["id"] ?? f.slice(0, -5));
    const walk = (x: unknown): void => {
      if (Array.isArray(x)) {
        for (const v of x) walk(v);
        return;
      }
      if (x === null || typeof x !== "object") return;
      const r = x as Record<string, unknown>;
      if (r["kind"] === "spawnModelFx" && typeof r["modelKey"] === "string") {
        const n = emitters.get(r["modelKey"]);
        if (n !== undefined) {
          const lost = LOST_BY_EMITTERS.filter((k) => r[k] !== undefined);
          rows.push({ ability: id, modelKey: r["modelKey"], emitterCount: n, fieldsLost: [...lost] });
        }
      }
      for (const v of Object.values(r)) walk(v);
    };
    walk(doc);
  }
  return rows.sort((a, b) => (a.ability + a.modelKey < b.ability + b.modelKey ? -1 : 1));
}

const emitters = modelEmitters();
const emitterNodes = emitterAffectedNodes(emitters);

const mx = matrix();

const rows = templates.map((t) => {
  const probe = probeExpand(t);
  const keys = Object.keys(t.params ?? {});
  const nodeSlots = keys.filter((k) => NODE_SLOTS.has(k));
  const presetUses = byPreset[t.id] ?? 0;
  const refUses = byRef[t.id] ?? 0;
  return {
    id: t.id,
    name: t.name ?? null,
    family: t.family ?? null,
    description: t.description ?? null,
    /** ⭐ 量出來的：這個 type 挑下去，引擎展不展得開。⛔ 不是 `status`。 */
    expands: probe.ok,
    expandError: probe.error,
    /** ⚠️ 保留原宣告，好讓「宣告 ↔ 事實」對得起來（今天兩者一致，⛔ 不是結構保證的）。 */
    declaredStatus: t.status ?? null,
    gapScore: t.gapScore ?? null,
    requires: t.requires ?? [],
    exemplar: t.exemplar ?? null,
    /**
     * ⭐ 佈線：這個 type 要寫在**哪裡**才會生效。
     * · `node`  —— `{"kind":"spawnModelFx","preset":"<id>"}`（19 格由 modelFxPreset 補）
     * · `doc`   —— `{"template":{"ref":"<id>","params":{…}}}`（由 expand() 展開）
     * · `both`  —— 兩條都走得通（beam-roll / locust 家族）
     */
    wiring: nodeSlots.length > 0 ? (keys.length > nodeSlots.length ? "both" : "node") : "doc",
    usedVia: { preset: presetUses, ref: refUses },
    params: Object.fromEntries(
      keys.map((k) => {
        const s = (t.params ?? {})[k]!;
        return [
          k,
          {
            type: s.type ?? null,
            default: s.default ?? null,
            ...(s.values ? { values: s.values } : {}),
            /** ⭐ 這一格是**誰**填的 —— 挑錯邊就是失敗形態⑧。 */
            fillsVia: NODE_SLOTS.has(k) ? "spawnModelFx.preset" : "template.ref → expand()",
          },
        ];
      }),
    ),
  };
});

const pickable = rows.filter((r) => r.expands && Object.keys(r.params).length > 0);
/** ⛔ 刻意永遠不 enable 的普查終點（今天唯一：`tpl-data-no-trigger`，它自己說了）。 */
const sentinels = rows.filter((r) => r.gapScore === 0);
/** ⭐ 有參數、有 exemplar，⛔ 而 `FAMILIES` 沒有它的展開路徑 —— **收斂 backlog**。 */
const analysedButUnwired = rows.filter(
  (r) => !r.expands && r.gapScore !== 0 && Object.keys(r.params).length > 0,
);
/** ⛔ 佔著名字、0 參數 —— 名字都取好了，缺的是把成果填進去。 */
const shells = rows.filter(
  (r) => !r.expands && r.gapScore !== 0 && Object.keys(r.params).length === 0,
);

const catalog = {
  schema: "ggd-type-catalog@1",
  note:
    "⭐ 給編輯器的**可挑 type 清單 ＋ fail-closed 收據**，從 content/ability-templates/ 推導。" +
    "⛔ 不要手改這份檔 —— 它是 `typecat:build` 的產物；改模板／改 expand.ts 再重生成。" +
    "⭐ 兩層：挑一個 type（只填空白格）→ 再用 params／矩陣微調（節點自己寫的值永遠贏）。",
  howToFailClosed: [
    "⭐ 只挑 `expands: true` 的。⛔ `declaredStatus` 是宣告，`expands` 是量出來的事實。",
    "⭐ 看 `wiring`：`node` 要寫成 `{\"kind\":\"spawnModelFx\",\"preset\":\"<id>\"}`；" +
      "`doc` 要寫成 `{\"template\":{\"ref\":\"<id>\",\"params\":{…}}}`；`both` 兩條都行。",
    "⭐ 逐格看 `params[*].fillsVia` —— 寫錯邊的那一格**不會有任何東西紅**，它只是不會發生。",
    "⛔ `analysedButUnwired` 裡的**不要挑** —— 展開會失敗，而系統是 fail-soft ⇒ " +
      "那一支技能**還在、但一個模板效果都沒有**，⛔ 畫面上與「這招就是沒效果」一模一樣。",
    "⚠️ ⭐ 挑一個 `modelKey` 之前查 `modelFxEmitters.modelsWithEmitters`：" +
      "那顆模型若自帶粒子，`modelFxEmitters.lostByEmitters` 的每一格**寫了也只作用在網格那一半** " +
      "⇒ ⛔ 同一顆模型會顯示兩種顏色／兩種大小，而沒有任何東西紅。",
  ],
  counts: {
    templates: rows.length,
    pickable: pickable.length,
    analysedButUnwired: analysedButUnwired.length,
    shells: shells.length,
    sentinels: sentinels.length,
    matrixPresent: mx.present.length,
    matrixTheoretical: mx.elements.length * mx.shapes.length,
  },
  /** ⭐ 今天可以挑的（`expand()` 真的跑得過）。 */
  types: pickable,
  /**
   * ⭐⭐ **分析做完了、參數也寫好了，而引擎沒有它的展開路徑** ——
   * owner 逐字說的「特效分析製作完**沒有收斂成果變成積木重複使用**」就是這一批。
   * ⛔ 修法是**補 `expand.ts` 的 `FAMILIES` 條目**，⛔ 不是把 `status` 翻成 enabled。
   */
  analysedButUnwired: analysedButUnwired.map((r) => ({
    id: r.id,
    family: r.family,
    paramCount: Object.keys(r.params).length,
    exemplar: r.exemplar,
    expandError: r.expandError,
  })),
  /** ⛔ 佔著名字而 0 參數的。 */
  shells: shells.map((r) => ({ id: r.id, family: r.family, gapScore: r.gapScore })),
  /** ⚠️ 刻意永遠不 enable —— ⛔ 不要試圖填它。 */
  sentinels: sentinels.map((r) => ({ id: r.id, family: r.family, why: r.description })),
  /**
   * ⭐⭐ 【模型自帶粒子的外觀收據】—— ⛔ 這一整區是「**寫了不會發生**」的清單。
   * ⚠️ 一個節點寫下 `tint`，而它的 modelKey 帶 `fxEmitters` ⇒ ⭐ **只有網格那一半會變色**，
   * 粒子那一半照原樣噴。⛔ 而 schema 收、`content:build` 綠、⛔ 沒有任何東西紅。
   */
  modelFxEmitters: {
    note:
      "⛔ `model@1.fxEmitters` 的 emitter 只拿得到一個世界座標（`modelFxRig.ts:404` 的 " +
      "`spawnTrail?(vfxId,x,y,z)`）⇒ 下列欄位**寫了也不會傳給粒子那一半**。" +
      "⚠️ ⭐ `spawnVfx` 那條路（`schema/effects/spawnVfx.ts`）**同樣**不吃 scale/tint/alpha/yaw —— " +
      "兩條是各自獨立的窄通道，⛔ 修一條治不了另一條。",
    /** ⛔ 這幾格寫在 `spawnModelFx` 節點上時，**不會**到達該模型自帶的粒子。 */
    lostByEmitters: [...LOST_BY_EMITTERS],
    /** ⭐ 今天哪幾顆模型自帶粒子（153 顆裡的少數）。 */
    modelsWithEmitters: [...emitters.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([modelKey, emitterCount]) => ({ modelKey, emitterCount })),
    /** ⭐ 量出來的受影響面 —— `fieldsLost` 非空的那幾列**今天就在掉東西**。 */
    affectedNodes: emitterNodes,
    counts: {
      modelsWithEmitters: emitters.size,
      nodesOnSuchModels: emitterNodes.length,
      nodesActuallyLosing: emitterNodes.filter((r) => r.fieldsLost.length > 0).length,
    },
  },
  /** ⭐ 微調層：矩陣今天真的有哪些格子。 */
  matrix: mx,
};

function md(): string {
  const L: string[] = [];
  L.push("# GGD type 目錄（給編輯器挑的積木）");
  L.push("");
  L.push("> ⛔ **這份是產生的** —— `pnpm typecat:build`。改它請改 `content/ability-templates/`。");
  L.push("> ⭐ 交付格式與止損協定見 `CODEX_TYPE_HANDOFF.md`；機器可讀版在 `ggd-type-catalog.json`。");
  L.push("");
  L.push(
    `**${catalog.counts.pickable} 個可挑 type** · ` +
      `⭐ ${catalog.counts.analysedButUnwired} 個「分析做完但引擎沒接線」 · ` +
      `⛔ ${catalog.counts.shells} 個空殼 · ${catalog.counts.sentinels} 個哨兵 · ` +
      `矩陣 ${catalog.counts.matrixPresent}/${catalog.counts.matrixTheoretical} 格`,
  );
  L.push("");
  L.push("## ⭐⭐ 怎麼 fail-closed");
  L.push("");
  for (const s of catalog.howToFailClosed) L.push(`- ${s}`);
  L.push("");
  L.push("## ⭐ 可挑的 type（`expand()` 真的跑得過）");
  L.push("");
  L.push("| id | 佈線 | 參數 | preset 用量 | ref 用量 | gap | exemplar |");
  L.push("|---|---|---:|---:|---:|---:|---|");
  for (const t of catalog.types) {
    L.push(
      `| \`${t.id}\` | \`${t.wiring}\` | ${Object.keys(t.params).length} | ${t.usedVia.preset} | ` +
        `${t.usedVia.ref} | ${t.gapScore ?? "?"} | ${t.exemplar?.skill ?? "⛔ 未填"} |`,
    );
  }
  L.push("");
  L.push("## ⭐⭐ 分析做完了，而引擎沒有展開路徑（**收斂 backlog**）");
  L.push("");
  L.push("⚠️ ⛔ **今天不要挑這些** —— 展開會失敗，而系統是 **fail-soft**：");
  L.push("那一支技能**還在、但一個模板效果都沒有** ⇒ ⛔ 與「這招就是沒效果」長得一模一樣。");
  L.push("⭐ 修法是替它們補 `packages/shared/src/content/templates/expand.ts` 的 `FAMILIES` 條目。");
  L.push("");
  L.push("| id | 已寫好的參數 | exemplar |");
  L.push("|---|---:|---|");
  for (const r of catalog.analysedButUnwired) {
    L.push(`| \`${r.id}\` | **${r.paramCount}** | ${r.exemplar?.skill ?? "⛔ 未填"} |`);
  }
  L.push("");
  L.push("## ⛔ 空殼（佔著名字、0 參數）");
  L.push("");
  L.push(catalog.shells.map((s) => `\`${s.id}\``).join(" · "));
  L.push("");
  L.push("## ⚠️ 哨兵（**刻意**永遠不 enable，⛔ 不要試圖填）");
  L.push("");
  for (const s of catalog.sentinels) L.push(`- \`${s.id}\` —— ${(s.why ?? "").slice(0, 120)}`);
  L.push("");
  L.push("## ⭐ 微調層：矩陣");
  L.push("");
  L.push(`元素（${mx.elements.length}）：${mx.elements.map((e) => `\`${e}\``).join(" ")}`);
  L.push("");
  L.push(`形狀（${mx.shapes.length}）：${mx.shapes.map((s) => `\`${s}\``).join(" ")}`);
  L.push("");
  L.push(
    `⚠️ **${mx.present.length} / ${mx.elements.length * mx.shapes.length} 個組合今天存在** —— ` +
      "⛔ 不是每一格都有。挑之前先確認 `content/vfx/fx.prim.<元素>.<形狀>.json` 真的在。",
  );
  L.push("");
  return L.join("\n");
}

const nextJson = `${JSON.stringify(catalog, null, 2)}\n`;
const nextMd = md();

if (CHECK) {
  const stale: string[] = [];
  if (!existsSync(OUT_JSON) || readFileSync(OUT_JSON, "utf8") !== nextJson) stale.push(OUT_JSON);
  if (!existsSync(OUT_MD) || readFileSync(OUT_MD, "utf8") !== nextMd) stale.push(OUT_MD);
  if (stale.length > 0) {
    console.error(`⛔ 過期了：\n${stale.map((s) => `   ${s}`).join("\n")}`);
    console.error("   ⭐ 跑：pnpm typecat:build && git add docs/editor-contract/");
    console.error("   ⚠️ ⛔ 不要手改那兩份 —— 它們從出貨模板與 expand() 推導（第〇·四守則）。");
    process.exit(1);
  }
  console.log(
    `✓ type 目錄是新的（${catalog.counts.pickable} 可挑 · ` +
      `${catalog.counts.analysedButUnwired} 待接線 · ${catalog.counts.shells} 空殼）`,
  );
} else {
  writeFileSync(OUT_JSON, nextJson, "utf8");
  writeFileSync(OUT_MD, nextMd, "utf8");
  console.log(
    `✓ ${catalog.counts.pickable} 個可挑 type · ⭐ ${catalog.counts.analysedButUnwired} 個待接線 · ` +
      `⛔ ${catalog.counts.shells} 個空殼 · ${catalog.counts.sentinels} 個哨兵 · ` +
      `矩陣 ${catalog.counts.matrixPresent}/${catalog.counts.matrixTheoretical}`,
  );
}
