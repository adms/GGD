/**
 * ⭐ GH#1187【撞擊改向】的規則開關（`config.displacement-tiers@1` 的 `projectileRedirect` 區塊）。
 *
 * ⭐ **為什麼住在位移那一份 config**：改向是「施法者的**衝刺**撞到東西」這件事的規則 ——
 * 與 `markedBlink`／`wallBlock` 同一排（位移的規則，⛔ 不是級距）。新開一份 config 會多一個要記得同步的住處。
 *
 * ⭐ **它是分類時的爭議預設＋rollback**（鄂爾 R 後段怎麼改向，⛔ 不是 owner 原話）：
 *   · `contact`（預設）按下後段 ⇒ 施法者衝刺途中**身體碰到**同一次施放的那發投射物才改向（沒碰到 ⇒ 不擊飛）
 *   · `press`   按下後段 ⇒ 那發投射物**當場**改朝這一按的方向飛（不必撞到；較寬鬆的讀法）
 *   · `off`     ⇒ 改向一律不發生，投射物照首段飛完（後段只剩衝刺本身）
 */
export type ProjectileRedirectMode = "contact" | "press" | "off";

export interface ProjectileRedirectRules {
  readonly mode: ProjectileRedirectMode;
}

/** ⭐ 出貨值。⛔ 缺文件時回這一份（＝預設開著），⛔ 不是關掉。 */
export const DEFAULT_PROJECTILE_REDIRECT: ProjectileRedirectRules = { mode: "contact" };

const MODES: readonly ProjectileRedirectMode[] = ["contact", "press", "off"];

/** 從 `config.displacement-tiers@1` 讀。逐格 typeof（同 `markedBlinkFromDoc`：部分壞掉的 config 不拖垮整條規則）。 */
export function projectileRedirectFromDoc(doc: unknown): ProjectileRedirectRules {
  const d = doc as { schema?: string; projectileRedirect?: Record<string, unknown> } | undefined;
  if (!d || d.schema !== "config.displacement-tiers@1") return DEFAULT_PROJECTILE_REDIRECT;
  const mode = d.projectileRedirect?.["mode"];
  return MODES.includes(mode as ProjectileRedirectMode) ? { mode: mode as ProjectileRedirectMode } : DEFAULT_PROJECTILE_REDIRECT;
}
