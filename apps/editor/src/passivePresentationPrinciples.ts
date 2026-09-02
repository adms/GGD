import { activationModeForAbility } from "./vfx-forge/actionAnimationPrinciples";

export type PassivePresentationKind =
  | "on-hit"
  | "critical-hit"
  | "evasion"
  | "block"
  | "reflect"
  | "periodic"
  | "damage-reaction"
  | "other-trigger";

export type PassivePresentationSupport =
  | "authored"
  | "runtime-default"
  | "authorable-inline"
  | "main-trigger-gap";

export interface PassivePresentationRule {
  readonly kind: PassivePresentationKind;
  readonly label: string;
  readonly support: PassivePresentationSupport;
  readonly detail: string;
  readonly authoringSurface: "效果鏈" | "Grant 欄位" | "VFX Script" | "Main 接縫";
}

interface WalkEntry {
  readonly value: Record<string, unknown>;
  readonly path: string;
}

function objectsIn(root: unknown): WalkEntry[] {
  const out: WalkEntry[] = [];
  const seen = new Set<object>();
  const visit = (value: unknown, path: string): void => {
    if (typeof value !== "object" || value === null || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, `${path}[${index}]`));
      return;
    }
    const record = value as Record<string, unknown>;
    out.push({ value: record, path });
    Object.entries(record).forEach(([key, entry]) => visit(entry, `${path}.${key}`));
  };
  visit(root, "$");
  return out;
}

function ownsVisualEffect(entry: WalkEntry): boolean {
  const effects = entry.value.effects;
  if (!Array.isArray(effects)) return false;
  return objectsIn(effects).some(({ value }) =>
    value.kind === "spawnVfx" || value.kind === "spawnModelFx" || value.kind === "floatingText",
  );
}

function hasPropertyObject(entries: readonly WalkEntry[], key: string): boolean {
  return entries.some(({ value }) => typeof value[key] === "object" && value[key] !== null);
}

function ruleForHook(entry: WalkEntry): PassivePresentationRule {
  const on = String(entry.value.on ?? "");
  const authored = ownsVisualEffect(entry);
  if (on === "onBasicAttack") {
    return {
      kind: "on-hit",
      label: "普攻命中／on-hit",
      support: authored ? "authored" : "authorable-inline",
      detail: authored
        ? "沿用普攻本身的攻擊動作，hook.effects 已有命中特效。"
        : "沿用普攻本身的攻擊動作；建議在同一個 hook.effects 加一顆命中 VFX，避免被動只剩數值。",
      authoringSurface: "效果鏈",
    };
  }
  if (on === "onDamageDealt" && entry.value.damageCrit === "crit") {
    const sourceSpecific = entry.value.critSource === "thisSource";
    return {
      kind: "critical-hit",
      label: sourceSpecific ? "本來源暴擊 proc" : "任意來源暴擊 proc",
      support: authored ? "authored" : "authorable-inline",
      detail: authored
        ? `沿用正在播放的攻擊動作與 runtime 的 crit hitstop／重擊火花；此 hook 已有${sourceSpecific ? "來源專屬" : "泛用"}追加演出。`
        : `普攻動作、crit hitstop、重擊火花與暴擊數字由 runtime 自動帶入；可在同一個 onDamageDealt hook.effects 加特殊 VFX${sourceSpecific ? "，critSource:thisSource 已保證只認這一條暴擊來源" : "，需要來源專屬時請選 critSource:thisSource"}。`,
      authoringSurface: "效果鏈",
    };
  }
  if (on === "onEvade") {
    return {
      kind: "evasion",
      label: "迴避成功",
      support: authored ? "authored" : "runtime-default",
      detail: authored
        ? "迴避事件已有短演出；onEvade 目前是持有者層級事件，不能宣稱是哪一條 evasion grant 觸發。"
        : "runtime 會顯示 MISS／迴避回饋；若要某一條技能專屬的閃身或殘影，仍需 Main 補 evasion grant provenance。",
      authoringSurface: authored ? "效果鏈" : "Main 接縫",
    };
  }
  if (on === "onReflectSuccess") {
    return {
      kind: "reflect",
      label: "反彈成功",
      support: authored ? "authored" : "authorable-inline",
      detail: authored
        ? "反彈成功的權威 hook 已有演出。"
        : "可在 hook.effects 加防禦火花，或用 vfx-script reflectSuccess 補角色格擋動作與反擊演出。",
      authoringSurface: authored ? "效果鏈" : "VFX Script",
    };
  }
  if (on === "onInterval") {
    return {
      kind: "periodic",
      label: "週期被動",
      support: authored ? "authored" : "authorable-inline",
      detail: authored
        ? "週期節點已有 VFX／模型／浮字演出。"
        : "若週期效果需要被玩家看見，請在同一個 onInterval 效果鏈加一顆短生命 VFX；不補假施法動作。",
      authoringSurface: "效果鏈",
    };
  }
  if (on === "onDamageTaken") {
    return {
      kind: "damage-reaction",
      label: "受到傷害時",
      support: authored ? "authored" : "authorable-inline",
      detail: authored
        ? "受擊觸發鏈已有可見演出。"
        : "護盾破裂、低血暴走等可見狀態應在真正觸發的 hook.effects 補 VFX／動畫，不使用 castEffect。",
      authoringSurface: "效果鏈",
    };
  }
  return {
    kind: "other-trigger",
    label: on || "其他被動觸發",
    support: authored ? "authored" : "authorable-inline",
    detail: authored
      ? "觸發鏈已有可見演出。"
      : "只有玩家需要辨識這次觸發時才補短演出；演出必須與同一個權威 hook 綁定。",
    authoringSurface: "效果鏈",
  };
}

/**
 * Deterministic passive presentation plan. It does not mutate generated
 * ability JSON. It tells the no-code surfaces where the matching visual brick
 * belongs and refuses to invent castStart/castEffect for reactive mechanics.
 */
export function passivePresentationRules(ability: unknown): PassivePresentationRule[] {
  const record = typeof ability === "object" && ability !== null
    ? ability as Record<string, unknown>
    : undefined;
  // Q/W/E/R/EX can contain a passive enhancement next to an active payload.
  // Slot name alone therefore cannot decide whether the passive panel exists.
  if (activationModeForAbility(ability) !== "passive" &&
      (typeof record?.passive !== "object" || record.passive === null)) return [];
  const entries = objectsIn(ability);
  const rules: PassivePresentationRule[] = [];

  const hooks = entries.filter(({ value }) => typeof value.on === "string" && String(value.on).startsWith("on"));
  const seenHooks = new Set<string>();
  for (const entry of hooks) {
    const rule = ruleForHook(entry);
    const signature = `${rule.kind}:${rule.support}`;
    if (!seenHooks.has(signature)) {
      rules.push(rule);
      seenHooks.add(signature);
    }
  }

  if (hasPropertyObject(entries, "critStrike") && !rules.some((rule) => rule.kind === "critical-hit")) {
    rules.push({
      kind: "critical-hit",
      label: "暴擊 proc",
      support: "runtime-default",
      detail: "普攻動作、crit hitstop、重擊火花與暴擊數字已由 runtime 自動帶入；要來源專屬 VFX，可在 onDamageDealt hook 使用 damageCrit:crit＋critSource:thisSource，無需另造一次機率判定。",
      authoringSurface: "效果鏈",
    });
  }

  const evasion = entries.some(({ value }) =>
    value.kind === "evasion" || value.stat === "evasion",
  ) || hasPropertyObject(entries, "evasionScope");
  if (evasion && !rules.some((rule) => rule.kind === "evasion")) {
    rules.push({
      kind: "evasion",
      label: "迴避成功",
      support: "main-trigger-gap",
      detail: "runtime 已有 evade 事件與 MISS 提示，但事件尚未指出是哪一個 evasion grant 觸發；Editor 不能安全綁來源專屬閃身／殘影，需 Main 補 provenance 或 grant 演出欄位。",
      authoringSurface: "Main 接縫",
    });
  }

  const blocks = entries
    .map(({ value }) => value.block)
    .filter((value): value is Record<string, unknown> => typeof value === "object" && value !== null);
  if (blocks.length > 0) {
    const authored = blocks.some((block) => typeof block.vfxId === "string" && block.vfxId !== "");
    rules.push({
      kind: "block",
      label: "格擋成功",
      support: authored ? "authored" : "runtime-default",
      detail: authored
        ? "block grant 已設定 vfxId；命中時取代泛用格擋火花並掛在防禦者身上。"
        : "runtime 會播放泛用格擋火花；要角色專屬護盾波紋可在 block grant 設定 vfxId／scale／tint。",
      authoringSurface: "Grant 欄位",
    });
  }

  return rules;
}
