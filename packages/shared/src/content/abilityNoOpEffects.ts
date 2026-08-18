/**
 * ⛔ **一支技能不可以「放得出來但什麼都不會發生」。**
 *
 * owner 2026-08-18（GH#371）：
 *
 * > 「請你檢查目前**所有英雄技能是否都能正常施放、開關並且產生效果**，
 * >  並且**都是用 JSON 設定的**」
 *
 * 這一支回答中間那一問，而且是用 `noOpModifierClaims.ts` 的**同一個形狀**：
 * 只問一件事 —— **這一段效果在出貨設定下，有沒有可能改變任何一個數字？**
 * 答案是「不可能」的才算一筆 {@link Finding}。⛔ 它不審美、不看文案、
 * 不管數值大小。
 *
 * ── 為什麼既有的守衛全部看不到這一族 ─────────────────────────────────────
 *
 * | 既有守衛 | 它看的是 | 它為什麼漏掉這一族 |
 * |---|---|---|
 * | `noOpModifierClaims` | **modifier**（`{stat, op, value}`） | 一發 `spawnProjectile{onHit:[]}` 裡一條 modifier 都沒有 |
 * | `castabilitySweep`（#128） | Q/W/E/R/EX **能不能放** | 它把 `vfxSpawn` 也算「有效果」，而純特效改不動任何數字；而且它**不掃天生技那一格** |
 * | Zod schema | 欄位在不在界內 | `onHit: []` 是一個完全合法的空陣列 |
 * | `content:build` | 索引與參照 | 參照全部存在，只是指向空的東西 |
 *
 * ⇒ 「schema 收得下、後台存得起來、卡片上印著那句話、全綠 —— 而遊戲裡什麼都不
 * 發生」正是 CLAUDE.md 第一·五守則的形狀，只是這一次載體是 **effect**，不是
 * modifier。
 *
 * ── 判準：⛔ 保守，寧可漏報不可誤報 ────────────────────────────────────────
 *
 * 每一條規則都必須是**可以證明**的「改不動任何數字」，而不是「看起來很可疑」。
 * 一條會誤報的規則會逼下一個人放寬斷言，而一條被放寬的閘等於沒有閘。
 * 所以：
 *   · 只要效果樹上**任何一處**還有可能動到一個數字，整支技能就不算 finding；
 *   · 分不出來的（`proxyCast` 轉呼叫、`mindControl` 換陣營⋯）一律**不判**；
 *   · 「投射物自己不帶傷害」這一條**從 `Projectiles` 的欄位推導**，⛔ 不抄
 *     `projectile@1` 今天長什麼樣 —— 哪天有人替投射物加了 `onHit`，這條規則
 *     自己就退場（見 {@link projectileCarriesPayload}）。
 *
 * ⚠️ 輸入必須是**登錄表裡那一份**（`Abilities.get(id)`），⛔ 不是磁碟上的 JSON：
 * 106 支技能的 `effects` 是空的、真正的內容在 `template.ref` 裡，由
 * `registerAll` 呼叫 `templates/expand.ts` 展開。掃原始 JSON 會得到 106 個
 * 假的「空技能」（實測），也就是失敗形態⑤：被測的不是出貨的那個。
 */
import type { AbilityDef, ProjectileDef } from "../sim/content/defs";
import type { EffectDef } from "../sim/effects/effect";
import type { RankScalar } from "../sim/perRank";
import { rankScalarMax } from "../sim/perRank";
import { hasSourceGrant } from "../sim/stats/sourceGrants";

/** 一處「說了但不會發生」。 */
export interface Finding {
  /** 規則代號（穩定，豁免名單用它比對） */
  readonly rule: FindingRule;
  /** 效果樹裡的位置，例如 `effects[1].onHit` */
  readonly path: string;
  /** 一句話說明「為什麼它改不動任何數字」 */
  readonly why: string;
}

export type FindingRule =
  | "empty-ability"
  | "empty-container"
  | "projectile-no-payload"
  | "empty-buff"
  | "zero-amount"
  | "vfx-only";

/**
 * 這一格逐階欄位**最大的那一階**是不是 0（或根本沒填）。
 *
 * ⚠️ 好幾個 kind 的「量」不是純量而是一個**物件**（`Scaling{base,ratio,stat}`、
 * `AttrGrant{...}`）。那一種一律回 **false**（＝不判），⛔ 不是「當成 0」——
 * 這條規則的整個價值在於零誤報，而一個看不懂的形狀不是「證明它是空的」。
 */
function isZero(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v !== "number" && !Array.isArray(v)) return false;
  const m = rankScalarMax(v as RankScalar);
  return m === undefined || m === 0;
}

/** 這個物件身上有沒有任何一格「非 amount 的替代量」被填了。 */
function anyPresent(o: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.some((k) => o[k] !== undefined && o[k] !== null);
}

/**
 * 這一份投射物**自己**帶不帶 payload。
 *
 * ⭐ 從**登錄表裡那一份的欄位**推導，⛔ 不抄 `projectile@1` 今天的形狀：
 * 出貨的投射物文件只有 `speed / maxRange / hitRadius / pierce / vfxKey /
 * meshShape / flight` 七格飛行與外觀參數，一格都不帶傷害 —— 所以
 * `spawnProjectile{onHit: []}` 射出去的是一顆**純特效**。
 * 哪天有人替投射物開了 `onHit` / `damage` 這一類欄位，這裡自己就會回 true，
 * ⛔ 不必回來改這條規則（也就不會有一條靠註解續命的假規則）。
 */
function projectileCarriesPayload(p: ProjectileDef | undefined): boolean {
  if (p === undefined) return true; // 查不到就不判（缺參照是 refs.ts 的事）
  const PAYLOAD_KEYS = ["onHit", "damage", "effects", "onImpact", "amount"];
  return PAYLOAD_KEYS.some((k) => (p as unknown as Record<string, unknown>)[k] !== undefined);
}

/** 這一段效果樹裡有沒有**任何一個**非 `spawnVfx` 的效果。 */
function hasNonVfx(effects: readonly EffectDef[]): boolean {
  for (const e of effects) {
    if (e.kind !== "spawnVfx") return true;
  }
  return false;
}

/**
 * `effects` **以外**的 payload 載體 —— 一支技能的內容不是只能住在 `effects` 裡。
 *
 * ⚠️ 這一格是這條規則最容易誤報的地方，而且已經誤報過一次（開發中實測）：
 * 52-00【十二道試煉】的 `effects` 是空的，內容整包住在 `marks[0]`
 * （`perStackLost` 的兩條 modifier ＋ `lethal.selfEffects` 的免死／無敵／回復
 * ／擊退／暈眩）。少了這一格，一支**完整實作**的技能會被判成空的 ——
 * 而那正好是「逼下一個人放寬斷言」的那種誤報。
 *
 * ⛔ 這張表要跟著 `AbilityDef` 走：加一個新的 payload 成員（不是 `effects`、
 * 也不是外觀／時序參數）就要補進來。⚠️ `vfxKey` / `sfxKey` / `icon` **不算** ——
 * 它們正是「有畫面但沒有數字」的那一半。
 */
const PAYLOAD_MEMBERS = ["passive", "marks", "toggle", "augment", "innateActivePassive"] as const;

function carriesPayloadOutsideEffects(def: AbilityDef): boolean {
  const o = def as unknown as Record<string, unknown>;
  return PAYLOAD_MEMBERS.some((k) => {
    const v = o[k];
    return v !== undefined && v !== null && (!Array.isArray(v) || v.length > 0);
  });
}

/** 一個效果身上所有「子效果」欄位的名字。 */
const CHILD_KEYS = [
  "effects",
  "finalEffects",
  "onHit",
  "onHitTargets",
  "onLand",
  "onEnd",
  "onArrive",
  "onDevour",
  "onDevourPer",
  "onCarrierDeath",
] as const;

/**
 * 一支技能身上所有的 finding。
 *
 * `lookupProjectile` 讓呼叫端把真的 `Projectiles` 登錄表接進來；缺席時
 * `projectile-no-payload` 這條規則整條不判（⛔ 不猜）。
 */
export function analyseAbility(
  def: AbilityDef,
  lookupProjectile?: (id: string) => ProjectileDef | undefined,
): Finding[] {
  const out: Finding[] = [];
  const effects = def.effects ?? [];
  const carried = carriesPayloadOutsideEffects(def);

  // ① 整支空的 —— 按下去連一個 effect 都沒有跑，而且別的載體上也沒有東西。
  if (effects.length === 0 && !carried) {
    out.push({
      rule: "empty-ability",
      path: "effects",
      why: `effects 是空的，而且 ${PAYLOAD_MEMBERS.join("／")} 這些替代載體一格都沒有 —— 這一格按下去不會執行任何東西`,
    });
    return out;
  }

  // ② 純特效技能 —— 整棵樹只有 spawnVfx，一個數字都動不到。
  if (effects.length > 0 && !carried && !hasNonVfx(effects)) {
    out.push({
      rule: "vfx-only",
      path: "effects",
      why: "整棵效果樹只有 spawnVfx，畫面上有東西但沒有任何數字會改變",
    });
  }

  walk(effects, "effects", out, lookupProjectile);
  return out;
}

function walk(
  effects: readonly EffectDef[],
  path: string,
  out: Finding[],
  lookupProjectile?: (id: string) => ProjectileDef | undefined,
): void {
  effects.forEach((e, i) => {
    const p = `${path}[${i}]`;
    inspect(e, p, out, lookupProjectile);
    const o = e as unknown as Record<string, unknown>;
    for (const k of CHILD_KEYS) {
      const child = o[k];
      if (Array.isArray(child)) walk(child as EffectDef[], `${p}.${k}`, out, lookupProjectile);
    }
    // weightedBranch 的子效果多一層 branches[]
    if (e.kind === "weightedBranch") {
      e.branches.forEach((b, bi) => walk(b.effects ?? [], `${p}.branches[${bi}].effects`, out, lookupProjectile));
    }
  });
}

function inspect(
  e: EffectDef,
  path: string,
  out: Finding[],
  lookupProjectile?: (id: string) => ProjectileDef | undefined,
): void {
  const o = e as unknown as Record<string, unknown>;
  const push = (rule: FindingRule, why: string): void => void out.push({ rule, path, why });

  switch (e.kind) {
    // ── 容器：payload 空的話，這一格就是一個什麼都不做的排程器 ──────────────
    case "delayed":
      if ((e.effects?.length ?? 0) === 0 && (e.finalEffects?.length ?? 0) === 0) {
        push("empty-container", "delayed 的 effects 與 finalEffects 都是空的 —— 排程到期時沒有東西要跑");
      }
      break;
    case "randomArea":
      if ((e.effects?.length ?? 0) === 0) {
        push("empty-container", "randomArea 的 effects 是空的 —— 每一次落點都不會發生任何事");
      }
      break;
    case "weightedBranch":
      if (e.branches.every((b) => (b.effects?.length ?? 0) === 0)) {
        push("empty-container", "weightedBranch 每一條分支的 effects 都是空的 —— 擲骰之後沒有東西要跑");
      }
      break;

    // ── 投射物：飛出去了，但命中之後沒有 payload ──────────────────────────
    case "spawnProjectile":
      if ((e.onHit?.length ?? 0) === 0 && lookupProjectile !== undefined) {
        if (!projectileCarriesPayload(lookupProjectile(e.projectileId))) {
          push(
            "projectile-no-payload",
            `spawnProjectile 的 onHit 是空的，而 projectile\`${e.projectileId}\` 自己也不帶任何 payload 欄位 —— 打中人不會發生任何事`,
          );
        }
      }
      break;

    // ── 空的加成來源 ────────────────────────────────────────────────────
    //
    // ⚠️ 「空」的判準**不可以**只看 `modifiers` / `hooks`：一份 `applyBuff` 也
    // 可以什麼屬性都不給而只授予**騎在來源上**的東西（格擋／暴擊／三圍／傷害型別
    // 轉換／飛行／穿透／型別連擊免疫／隱形真視）。那幾格的共同性質是引擎走
    // `StatsComp.sources` 而**不問 `kind`**，所以它們是**真的會發生的事**。
    // ⭐ 判斷交給 `hasSourceGrant()`（`sim/stats/sourceGrants.ts`）——
    // 它與 `abilityPassives.ts` 的「這一階是不是空的」用**同一份**答案，
    // 所以第九個授予出現時這裡不用再改一次（⛔ 不要在這裡逐格列舉）。
    case "applyBuff":
      if (
        (e.modifiers?.length ?? 0) === 0 &&
        (e.hooks?.length ?? 0) === 0 &&
        !hasSourceGrant(e)
      ) {
        push(
          "empty-buff",
          "applyBuff 既沒有 modifiers、沒有 hooks，也沒有任何騎在來源上的授予 —— 掛上去的是一份空的來源",
        );
      }
      break;

    // ── 量是 0 的 payload ──────────────────────────────────────────────
    case "damage":
    case "damageArea":
    case "damageLine":
      if (
        isZero(o.amount) &&
        !anyPresent(o, ["hpPct", "resourcePct", "incomingPct", "comboBonus", "bankedBonus", "refund"]) &&
        (o.onHitTargets === undefined || (o.onHitTargets as unknown[]).length === 0)
      ) {
        push("zero-amount", `${e.kind} 的 amount 每一階都是 0，也沒有任何替代量或 onHitTargets —— 不會扣到任何血`);
      }
      break;
    case "heal":
      if (isZero(e.amount)) push("zero-amount", "heal 的 amount 每一階都是 0");
      break;
    case "shield":
      if (isZero(e.amount)) push("zero-amount", "shield 的 amount 每一階都是 0");
      break;
    case "restore":
      if (isZero(o.healthPct) && isZero(o.manaPct)) {
        push("zero-amount", "restore 的 healthPct 與 manaPct 都是 0");
      }
      break;
    case "dot":
      if (isZero(o.amountPerTick) && !anyPresent(o, ["resourcePct"])) {
        push("zero-amount", "dot 的 amountPerTick 每一階都是 0，也沒有 resourcePct");
      }
      break;
    case "grantAttribute":
      if (isZero(o.amount)) push("zero-amount", "grantAttribute 的 amount 每一階都是 0");
      break;
    default:
      break;
  }
}
