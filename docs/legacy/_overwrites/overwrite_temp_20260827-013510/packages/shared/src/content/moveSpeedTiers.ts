/**
 * 移速**加成**五級距（`config.move-speed-tiers@1`，GH#789）。
 *
 * owner 2026-08-27（逐字）：
 * > 「移動速度加成一律的 %轉換為五級距，一樣列表可設定，五級距上下限增加移速為 0.1~4」
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 這一軸級距化的是 **modifier 節點**，⛔ 不是文件頂層欄位
 * ─────────────────────────────────────────────────────────────────────────────
 * 冷卻／耗魔住在 `ability@1` 頂層（`cooldownTier`），傷害住在 `Scaling` 上
 * （`damageTier`）——移速加成住在**任意深度**的 `{stat:"ms", op, value}` 上
 * （`effects[].modifiers` · `perRank[].modifiers` · `passive.ranks[].modifiers` ·
 * `auras` · `deathWard` · 道具/增益卡本體 `modifiers`）。所以它的形狀抄的是
 * `resolveDamageTier`（深走訪），⛔ 不是 `resolveManaCostTier`（讀頂層）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 單位：**百分比加成的小數**（0.5 = +50%），pctAdd 與 pctMult 共用一把梯子
 * ─────────────────────────────────────────────────────────────────────────────
 * 量到的母體（2026-08-27，31 列／79 個正值節點）：24 列是 %（小數 0.05~3.0），
 * 7 列是 u/s 的 **flat**（0.333~4）。owner 點名的是「%」⇒ 梯子只管
 * `pctAdd`／`pctMult`，flat 走**具名豁免**（{@link MoveSpeedTierExemption}）。
 * 上下限 0.1／4 是 owner 的**逐字**（+10% ~ +400%；乘區的 1.0 = ×2）。
 * 中間三格（0.2／0.5／1）是我挑的：量到最大的三個值叢（0.2×9 列、0.5×3 列、
 * 1.0×3 列）逐字落格 ⇒ 這三叢**零捨入**。每一格後台可調（0.1~4 夾住）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔【第〇·四】級別與算好的值**不同時存在**（#534 的 exclusive 模型，⛔ 不是 parity）
 * ─────────────────────────────────────────────────────────────────────────────
 * 帶 `msBonusTier` 的節點**沒有** `value`——值在載入時由 {@link resolveMsBonusTier}
 * 從表解析（`registries.ts` 的 `withTiers` 接縫）。⇒ 改表 = 全改完，
 * 零重新產生、零第二住處。守衛 `moveSpeedTiers.test.ts` 三個方向都關：
 *   ① 級別**和** `value` 一起寫 → 紅（第二住處）
 *   ② `ms` 的 % 節點沒級別、又不在豁免上 → 紅
 *   ③ 豁免規則再也匹配不到任何節點 → 紅（棘輪只准變短）
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ `enabled: false` ＝ 改用**程式內出貨預設表**解析，⛔ 不是「不解析」
 * ─────────────────────────────────────────────────────────────────────────────
 * 傷害的 `enabled:false` 可以整棵原樣返回——`Scaling` 沒有 `flat` 就是 0，
 * 安靜退化。modifier 不行：`statPipeline` 的每一條 op 都是 `m.value * stacks`
 * （`sim/stats/statPipeline.ts:207`），value 缺席 = **NaN**，而 NaN 會一路
 * 傳染進移速。⇒ 這一格的止血閥語意是「**無視 config／後台覆蓋層，回到
 * 程式裡凍結的出貨預設梯子**」——表被改壞的那天拉下來，數字回到出貨那一套。
 */
import { SKILL_TIER_NAMES, type SkillTierName } from "./skillTiers";

/** `content/config/move-speed-tiers.json` 的文件 id。 */
export const MOVE_SPEED_TIERS_DOC_ID = "move-speed-tiers";

/** modifier 節點上的級別欄位名。⛔ 全專案唯一一份，不要在別處再打一次字串。 */
export const MS_BONUS_TIER_FIELD = "msBonusTier";

/** 五個級別 —— 與另外六軸**同一份**（`skillTiers.ts`）。⛔ 不要另立一組。 */
export const MS_BONUS_TIER_NAMES = SKILL_TIER_NAMES;

/** 梯子管的兩種 op（owner 點名「%」）。`flat`（u/s）走豁免，⛔ 不在梯子上。 */
export const MS_BONUS_OPS = ["pctAdd", "pctMult"] as const;

/**
 * owner 的上下限（逐字「0.1~4」）。⭐ 它**同時**是五格的夾值範圍（後台把
 * 0.5 打成 5 會被 Zod 擋）與梯子兩端的出貨值。
 */
export const MS_BONUS_MIN = 0.1;
export const MS_BONUS_MAX = 4;

/** 一條「真不屬於級距」的豁免——**帶著能被反駁的理由**（第〇·四守則）。 */
export interface MoveSpeedTierExemption {
  /** 匹配整個 op（今天：`flat`——單位是 u/s，不是 %）。 */
  readonly op?: string;
  /** 匹配一份文件 id（今天：赤色彗星 ×3、致命魂之首輪 每層 ×1.05）。 */
  readonly id?: string;
  /** 為什麼它不該有級別。⛔ 「還沒收」不是理由。 */
  readonly reason: string;
}

export interface MoveSpeedTiers {
  /**
   * 止血閥。false = `msBonusTier` 改用 {@link DEFAULT_MOVE_SPEED_TIERS} 的
   * 程式內預設表解析（⛔ 不是不解析——見檔頭：exclusive 模型下文件裡沒有
   * 第二份值，不解析＝NaN）。
   */
  readonly enabled: boolean;
  /** 五格：級別 → 百分比加成的小數。每一格 0.1~4。 */
  readonly bonus: Readonly<Record<SkillTierName, number>>;
  /** 具名豁免（見 {@link MoveSpeedTierExemption}）。 */
  readonly exemptions: readonly MoveSpeedTierExemption[];
}

/**
 * 出貨值。三個住處：`content/config/move-speed-tiers.json` · 這裡 ·
 * `apps/admin`（表單從這裡 import，⛔ 不另抄一份）。
 *
 * ⭐ 極小 0.1／極大 4 = owner 逐字；小 0.2／中 0.5／大 1 = 我挑的
 * （2026-08-23 常設指令「自己判斷＋留開關」——開關就是這五格＋enabled）。
 */
export const DEFAULT_MOVE_SPEED_TIERS: MoveSpeedTiers = Object.freeze({
  enabled: true,
  bonus: Object.freeze({ 極小: 0.1, 小: 0.2, 中: 0.5, 大: 1, 極大: 4 }) as Readonly<
    Record<SkillTierName, number>
  >,
  exemptions: Object.freeze([
    {
      op: "flat",
      reason:
        "owner 的裁決逐字點名「%」；flat 的單位是 u/s（0.333~4），不在 % 軸上。" +
        "哪天 owner 把 flat 也收進來，刪掉這一條、開第二張 u/s 梯子。",
    },
    {
      id: "red-comet-mask",
      reason:
        "原作哏逐字：赤色彗星＝三倍速 ⇒ pctMult 2.0（×3）。" +
        "2.0 不落在任何格點（最近格 1.0＝×2 會毀掉哏），留字面值。",
    },
    {
      id: "collar-of-the-deadly-soul",
      reason:
        "每層 ×1.05 的疊層設計值（5 層合計約 ×1.28）。pctMult 疊層是線性的" +
        "（1+0.05×5），收到最近格 0.1 會把 5 層總量推到 ×1.5——那是道具重設計不是映射捨入。",
    },
  ]),
});

const clampBonus = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.min(Math.max(v, MS_BONUS_MIN), MS_BONUS_MAX)
    : fallback;

/** 把一份 `config.move-speed-tiers@1` 文件正規化成級距表。認不得 → 出貨值。 */
export function moveSpeedTiersFromDoc(doc: unknown): MoveSpeedTiers {
  const d = doc as
    | {
        schema?: string;
        enabled?: unknown;
        bonus?: Record<string, unknown>;
        exemptions?: unknown;
      }
    | undefined;
  if (!d || d.schema !== "config.move-speed-tiers@1") return DEFAULT_MOVE_SPEED_TIERS;
  const bonus = Object.freeze(
    Object.fromEntries(
      MS_BONUS_TIER_NAMES.map((n) => [
        n,
        clampBonus(d.bonus?.[n], DEFAULT_MOVE_SPEED_TIERS.bonus[n]),
      ]),
    ),
  ) as Readonly<Record<SkillTierName, number>>;
  const exemptions = Array.isArray(d.exemptions)
    ? Object.freeze(
        d.exemptions.filter(
          (e): e is MoveSpeedTierExemption =>
            typeof e === "object" &&
            e !== null &&
            typeof (e as { reason?: unknown }).reason === "string",
        ),
      )
    : DEFAULT_MOVE_SPEED_TIERS.exemptions;
  return {
    enabled: typeof d.enabled === "boolean" ? d.enabled : DEFAULT_MOVE_SPEED_TIERS.enabled,
    bonus,
    exemptions,
  };
}

type Rec = Record<string, unknown>;

/** 這個節點是不是梯子的母體（`ms` 的 % modifier）。⛔ 全專案唯一的判準。 */
export function isMsBonusNode(node: Rec): boolean {
  return (
    node["stat"] === "ms" && (MS_BONUS_OPS as readonly string[]).includes(node["op"] as string)
  );
}

/**
 * 把一棵文件樹上每一個帶 `msBonusTier` 的 `ms` modifier 翻成 `value`。
 *
 * ⭐ 全專案**唯一**知道級別怎麼變成加成值的地方（同 `resolveDamageTier`）——
 * 註冊表、清單產生器、後台試算、文件產生器都經過它。
 *
 * 規則：
 *   · 級別不在表上 → 原樣返回（`{{msb}}` 會裸印、閘會紅——fail-loud）。
 *   · `enabled: false` → 用**程式內出貨預設表**解析（見檔頭：⛔ 不是不解析）。
 *   · `msBonusTier` 留在節點上（同 `damageTier`）——下游（清單、報告）讀得到。
 */
export function resolveMsBonusTier<T extends object>(def: T, tiers: MoveSpeedTiers): T {
  const table = tiers.enabled ? tiers.bonus : DEFAULT_MOVE_SPEED_TIERS.bonus;
  return walk(def) as T;

  function walk(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(walk);
    if (node === null || typeof node !== "object") return node;
    const rec = node as Rec;
    const out: Rec = {};
    for (const [k, v] of Object.entries(rec)) out[k] = walk(v);
    const tier = rec[MS_BONUS_TIER_FIELD];
    if (typeof tier === "string" && isMsBonusNode(rec)) {
      const v = table[tier as SkillTierName];
      if (typeof v === "number") out["value"] = v;
    }
    return out;
  }
}

/** 守衛掃描用：一個 `ms` % modifier 節點的全部事實。 */
export interface MsBonusNode {
  /** `abilities/xxx.json` 這種相對路徑。 */
  readonly file: string;
  /** 樹上的路徑（`.effects[0].modifiers[0]`）。 */
  readonly path: string;
  /** 文件 id（豁免用 id 匹配）。 */
  readonly docId: string;
  readonly op: string;
  readonly tier?: string;
  readonly value?: number;
}

/**
 * 掃出一份文件裡全部的 `ms` % modifier 節點（守衛的母體）。
 * ⭐ **含 `template.params`**（07-01 的 ms 住在 tpl-buff-self 的 params.modifiers；
 * `expandStack::modifiers()` 逐字回傳參數陣列，級別跟著展開進 effects）。
 * ⚠️ 清單產生器（gen.mjs）讀的是**展開後的註冊表**所以跳過 template——
 * 兩邊的 skip 理由不同，⛔ 不要對齊。
 */
export function scanMsBonusNodes(file: string, doc: unknown): MsBonusNode[] {
  const docId = String((doc as Rec | null)?.["id"] ?? "");
  const out: MsBonusNode[] = [];
  const visit = (node: unknown, path: string): void => {
    if (Array.isArray(node)) {
      node.forEach((v, i) => visit(v, `${path}[${i}]`));
      return;
    }
    if (node === null || typeof node !== "object") return;
    const rec = node as Rec;
    if (isMsBonusNode(rec)) {
      const tier = rec[MS_BONUS_TIER_FIELD];
      const value = rec["value"];
      out.push({
        file,
        path,
        docId,
        op: String(rec["op"]),
        ...(typeof tier === "string" ? { tier } : {}),
        ...(typeof value === "number" ? { value } : {}),
      });
    }
    for (const [k, v] of Object.entries(rec)) {
      if (k === "template") continue;
      visit(v, `${path}.${k}`);
    }
  };
  visit(doc, "");
  return out;
}

/** `node` 有沒有豁免規則罩著；有就回那一條（守衛雙向都要用它）。 */
export function msExemptionFor(
  node: Pick<MsBonusNode, "docId" | "op">,
  tiers: MoveSpeedTiers,
): MoveSpeedTierExemption | undefined {
  return tiers.exemptions.find(
    (e) => (e.op === undefined || e.op === node.op) && (e.id === undefined || e.id === node.docId),
  );
}

/** 一句話（後台說明 · Codex 契約 · 報告**共用**，⛔ 不各自寫一段）。 */
export function describeMoveSpeedTiers(tiers: MoveSpeedTiers = DEFAULT_MOVE_SPEED_TIERS): string {
  const t = tiers.enabled ? tiers.bonus : DEFAULT_MOVE_SPEED_TIERS.bonus;
  return (
    `移速加成五級距（pctAdd/pctMult 共用，0.5 = +50%）：` +
    MS_BONUS_TIER_NAMES.map((n) => `${n} ${t[n]}`).join(" / ") +
    `。上下限 ${MS_BONUS_MIN}~${MS_BONUS_MAX}（owner 2026-08-27 逐字）。` +
    `flat（u/s）與具名豁免不在梯子上（${tiers.exemptions.length} 條，各帶理由）。`
  );
}
