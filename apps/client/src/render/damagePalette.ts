/**
 * damagePalette — THE one place the four damage colours live on the client.
 *
 * owner 2026-08-01, verbatim:
 *   「真實傷害目前在畫面上看不出來 => 顯示白色傷害數字(紅物理; 紫魔法; 白真實;
 *     綠治療)」
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT WAS ACTUALLY BROKEN
 *
 * `dmgType` is a THREE-value union (`physical | magic | true`) everywhere in the
 * sim, and three of the client's five feedback channels already honoured all
 * three:
 *
 *   ✔ impact spark   `vfx/vfxPresets.IMPACT_TINTS` — physical/magic/true, task #33
 *   ✔ blood burst    `vfx/bloodPresets.STYLIZED_TINTS` — physical/magic/true
 *   ✔ hit SFX        `audio/combatSfx` — `hit` / `hitMagic` / `hitTrue`
 *   ✘ floating number `ui/combatText`      — branched on `=== "magic"`
 *   ✘ victim flash    `render/combatFeedback` — branched on `=== "magic"`
 *
 * The two that were binary are the two LOUDEST ones, so 真實傷害 read as
 * 物理傷害 on screen: same orange-red number, same red body flash. The
 * 惡夢魔王碎片 [無視] promise was perceivable only as 「the enemy died faster」.
 * This module is the four-way mapping the other three channels already had.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A CONFIG DOC, NOT FOUR `const`s IN THE RENDERER
 *
 * The owner overruled this palette TWICE IN TWO DAYS (2026-07-31 「魔法傷害(AP)
 * 跳出來的數字應該是紫色系」, then the ruling above). `apps/client/**` is baked
 * into the container image at BUILD time; `content/` is the live bind-mount. So
 * a hex literal here costs a rebuild + a container restart per word, and a
 * config field costs a save — CLAUDE.md 第一守則's stated reason, with two
 * receipts. The seam already exists and is used by four other presentation
 * knobs: `ContentDb.load` calls `applyGoreDoc` / `applyStealthDoc` /
 * `setFamilyTuning` / `setOneShotMaxLifeSec` exactly like it calls
 * {@link applyDamageColorsDoc}. (`applyModelLodPolicy` reads like a fifth and is
 * NOT one — `render/modelLod.ts` drives that itself. Checked before writing this
 * sentence, because 第三守則.)
 *
 * ⚠️ Every one of those seams exists because of 失敗形態 ②「算出來了但從沒送到」:
 * a config doc with no `apply*` call is a file the operator edits and the game
 * never reads. `damageColorsWiring.test.ts` asserts the call, not the file.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO PALETTES, ONE AXIS
 *
 * `text` and `flash` carry DIFFERENT hexes for the same school because they are
 * different physics, and 「白」 is only reachable in one of them:
 *
 *   · the floating number is DOM text over a hard black ring — pure white is its
 *     single most legible fill (21:1 against the ring);
 *   · the victim flash is a Babylon overlay drawn with ALPHA_COMBINE
 *     (`out = base·(1−a) + flash·a`), so a WHITE overlay can only push channels
 *     UP. Measured against the real w3x tints in `content/config/unit-tints.json`
 *     it moves a pale model by ΔRGB 0.03–0.09 — invisible on exactly the models
 *     the complaint is about. `combatFeedback.test.ts` has kept that measurement
 *     since task #60 and it is still true.
 *
 * So the flash's 真實 entry is a CYAN-WHITE (`#33FFFF` = [0.2, 1, 1]) — the
 * palest, coolest colour that still clears the visibility floor on all seven
 * measured tints. Same axis (three schools → three answers), different values,
 * and both are operator-editable. This is the ONE place the difference is
 * decided; nothing downstream may re-derive a colour from `dmgType`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A THIRD GROUP THAT IS NOT A PALETTE: `outline`
 *
 * owner 2026-08-01, verbatim: 「加第二個通道，不動色相 => ok」.
 *
 * `text` and `flash` both answer 「哪一種傷害」. `outline` answers a DIFFERENT
 * question — 「這是誰的血」 — and it exists because owner's hue ruling spends the
 * fill on the school, which collapses 我打人 and 我被打 onto one hue. It is a
 * second CHANNEL, not a second axis: {@link damageOutlineMode} decides which
 * categories are 「我被打」 and {@link damageOutlineColor} gives the two colours.
 *
 * ⚠️ It does NOT recolour the hard black ring, and it CANNOT — see
 * `ui/combatText.combatTextShadow`, which measures why (the black ring clears
 * 土色 ground by 3.51:1 with the fill at 1.90:1 behind it, i.e. that ground is
 * carried by the ring alone and any coloured ring drops it under 3.0).
 */
import {
  DEFAULT_DAMAGE_COLORS,
  type CombatTextOutlineMode,
  type ConfigDamageColorsDoc,
  type DamageTextAxis,
} from "@ggd/shared/content";

/** The sim's damage school (`pkt.type`), as it arrives on the wire. */
export type DamageSchool = "physical" | "magic" | "true";

/** Keys of the TEXT palette: the three schools plus 治療. */
export type DamageTextKey = DamageSchool | "heal";

/** `#rrggbb` and nothing else — the same shape `zColorHex` enforces in the doc. */
const HEX6 = /^#[0-9A-Fa-f]{6}$/;

/**
 * Live palette. Starts as the shipped default so a client whose content mount
 * is broken still draws the colours the owner asked for — `null` means
 * 「文件沒讀到」, which is 「用出貨預設」 and never 「關掉配色」 (the same
 * three-state rule `voxelBodyFor` / `resolveFormVisual` document).
 */
let palette: ConfigDamageColorsDoc = DEFAULT_DAMAGE_COLORS;

/** One hex, or the shipped value for that same slot when it is malformed. */
function acceptHex(candidate: unknown, fallback: string): string {
  return typeof candidate === "string" && HEX6.test(candidate) ? candidate : fallback;
}

/**
 * Ingest `content/config/damage-colors.json` (or null when it is absent /
 * schema-mismatched — the shipped default, NOT an empty palette).
 *
 * FIELD-BY-FIELD DEFENSIVE, deliberately. The durable overlay's write path does
 * not Zod-validate today (#283 — the comment that claims it does is false), so a
 * typo in the console can reach this function as `"紅色"`. Rejecting the whole
 * doc for one bad cell would throw away three good colours; rejecting the cell
 * keeps the other seven and degrades that one to its shipped hue.
 */
export function applyDamageColorsDoc(doc: ConfigDamageColorsDoc | null | undefined): void {
  const d = doc ?? DEFAULT_DAMAGE_COLORS;
  const S = DEFAULT_DAMAGE_COLORS;
  palette = {
    id: S.id,
    schema: S.schema,
    textAxis: d.textAxis === "relation" || d.textAxis === "damageType" ? d.textAxis : S.textAxis,
    text: {
      physical: acceptHex(d.text?.physical, S.text.physical),
      magic: acceptHex(d.text?.magic, S.text.magic),
      true: acceptHex(d.text?.true, S.text.true),
      heal: acceptHex(d.text?.heal, S.text.heal),
    },
    flash: {
      physical: acceptHex(d.flash?.physical, S.flash.physical),
      magic: acceptHex(d.flash?.magic, S.flash.magic),
      true: acceptHex(d.flash?.true, S.flash.true),
    },
    outline: {
      mode:
        d.outline?.mode === "off" || d.outline?.mode === "taken" || d.outline?.mode === "incoming"
          ? d.outline.mode
          : S.outline.mode,
      outgoing: acceptHex(d.outline?.outgoing, S.outline.outgoing),
      incoming: acceptHex(d.outline?.incoming, S.outline.incoming),
      // Clamped, not rejected: a width is a scalar with two real ends, and the
      // shipped fallback for "operator typed 40" should be the legal extreme, not
      // silently 1.9. The bounds are the schema's — see zConfigDamageColorsDoc.
      widthMult:
        typeof d.outline?.widthMult === "number" && Number.isFinite(d.outline.widthMult)
          ? Math.min(3, Math.max(1.1, d.outline.widthMult))
          : S.outline.widthMult,
    },
  };
}

/**
 * Does a DAMAGE number's hue mean 「哪一種傷害」 (owner's ruling, shipped) or
 * 「誰打誰」 (the pre-ruling behaviour)? Heal is green on both — the axis only
 * governs the damage-carrying categories.
 */
export function damageTextAxis(): DamageTextAxis {
  return palette.textAxis;
}

/** Floating-number fill for one school (or 治療), as a CSS colour. */
export function damageTextColor(key: DamageTextKey): string {
  return palette.text[key];
}

/**
 * Which floating-text categories wear the 「我被打」 outline, or `off` for the
 * pre-feature behaviour (one outline for everybody).
 *
 * ⚠️ THIS IS THE SECOND CHANNEL, NOT A SECOND HUE. owner 2026-08-01, verbatim:
 * 「加第二個通道，不動色相 => ok」. The fill keeps meaning 傷害屬性 under
 * `textAxis: "damageType"`; the outline is what says whose health moved. The two
 * never compete because they are different pixels.
 */
export function damageOutlineMode(): CombatTextOutlineMode {
  return palette.outline.mode;
}

/** Outline colour for one side of the split, as a CSS colour. */
export function damageOutlineColor(role: "outgoing" | "incoming"): string {
  return palette.outline[role];
}

/** Outline radius ÷ the black ring's radius. */
export function damageOutlineWidthMult(): number {
  return palette.outline.widthMult;
}

/** Victim body-flash overlay colour for one school, as Babylon's 0..1 triple. */
export function damageFlashRgb(school: DamageSchool): [number, number, number] {
  return hexToRgb01(palette.flash[school]);
}

/**
 * Narrow an untyped wire field (`ev.data.dmgType`, or the sim's raw `type`) to
 * the union. Anything unrecognised is PHYSICAL — the same fallback
 * `VfxSystem.normalizeDmgType` has always used, so the number, the spark and the
 * flash cannot disagree about what an unknown school is.
 */
export function normalizeDamageSchool(v: unknown): DamageSchool {
  return v === "magic" ? "magic" : v === "true" ? "true" : "physical";
}

/** `#rrggbb` → Babylon's [r,g,b] in 0..1. Malformed input is impossible here. */
export function hexToRgb01(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}
