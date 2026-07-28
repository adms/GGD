/**
 * 體素條碼 (特徵生成 batch one, docs/_體素特徵生成規格.md) — the pure, node-testable
 * logic behind the admin page that authors one champion's colour barcode.
 *
 * ── THIS FILE PRODUCES NO PIXELS, AND NEITHER DOES THE PAGE ──────────────────
 * The owner's constraint is 「後台自動產出，但貼圖在地端生成」, and §5.3 makes that a
 * contract: 條碼規格 JSON 是唯一契約。後台永遠不產生像素，地端永遠不決定顏色。
 * So everything here is JSON in / JSON out. `previewStack` returns NUMBERS AND
 * HEXES — a list of (colour, percent-of-figure) rows — because the barcode's
 * visual representation IS a stack of `<div style="height:N%;background:#hex">`.
 * That is the best property of the whole design: the console is
 * what-you-see-is-what-you-get with zero graphics code, zero Babylon, zero
 * canvas. Anything that ever rasterises here has crossed the line.
 *
 * ── WHERE A SAVE GOES, AND WHY IT IS NOT THE SEED FILE ───────────────────────
 * The shipped seed is `content/models/_voxel-barcodes.json` — a SIDECAR, so the
 * indexer skips it and consumers fetch it by path (the `_voxel-skins.json`
 * precedent). A sidecar cannot be the write target: the platform's durable
 * overlay keys are `^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$`, an id may not START
 * with an underscore, and `models/_voxel-barcodes` is therefore a 400 with no
 * alternative spelling. So the console writes `config/voxel-barcodes`
 * (config.voxel-barcodes@1, registered in the schema union so the merged tree
 * still loads), and the two layers resolve:
 *
 *     effective(champion) = overlay.barcodes[id] ?? seed.barcodes[id] ?? null
 *
 * `barcodes` in the overlay doc holds ONLY champions an operator edited, which
 * is what makes the per-champion badge a FACT — 「後台改過的版本」 vs
 * 「出貨預設值」 is read off which layer answered, not off a flag someone set.
 *
 * ── FORM STATE IS RAW STRINGS ───────────────────────────────────────────────
 * CombatEnvPage / MobWavesPage's shape, for the same reason: a half-typed "0."
 * or "#E81" has to be representable while the operator is still typing. Parsing
 * happens once, in `formToDoc`, and `validateForm` gates Save so that function's
 * fallbacks are a safety net rather than a path.
 */
import {
  BARCODE_MIN_BANDS,
  BARCODE_MUD_COLUMN_DELTA_E,
  BARCODE_SLOTS,
  BARCODE_SLOT_PART,
  BARCODE_TYPICAL_FRAC,
  type BarcodeBand,
  type BarcodeBands,
  type BarcodePart,
  type BarcodeSlot,
  type SleeveKind,
  type VoxelBarcode,
} from "@ggd/shared/content/voxelSkin/types";
import { deltaE76, isBarcodeHex } from "@ggd/shared/content/voxelSkin/barcode";

export type { BarcodeSlot, SleeveKind, VoxelBarcode };
export { BARCODE_SLOTS, BARCODE_SLOT_PART };

// ------------------------------------------------------------------ where ---

/** The durable overlay key this page writes. See the header for why not `models/_…`. */
export const BARCODE_COLLECTION = "config";
export const BARCODE_DOC_ID = "voxel-barcodes";
export const BARCODE_DOC_SCHEMA = "config.voxel-barcodes@1";

/**
 * The shipped SEED, fetched from the same-origin `/content` mount the curation
 * page uses. Not imported from `@ggd/shared`: it is content, it changes without
 * a rebuild, and the console must show what the tree actually says today.
 */
export const BARCODE_SEED_PATH = "models/_voxel-barcodes.json";

// ------------------------------------------------------------------ labels --

export interface SlotSpec {
  /** 中文名稱 — the row's first column */
  zh: string;
  /** WHAT THIS BAND IS ON THE CHARACTER. Never a restatement of the key. */
  note: string;
  /** which of the three boxes it paints */
  part: BarcodePart;
  /** true for a 細帶 — §2.2's 1–5% features that carry half the recognisability */
  fine: boolean;
  /** a worked example from the spec, so the operator can see what belongs here */
  example: string;
}

/**
 * The eleven slots with their human labels.
 *
 * `fine: true` marks the bands the spec warns about BY NAME: 魯夫拿掉紅帽帶，
 * 就只是「一頂褐色帽子」。The page prints that warning next to them, because the
 * one edit that quietly destroys a character is deleting a 2% stripe for looking
 * insignificant in a form.
 */
export const SLOT_LABELS: Record<BarcodeSlot, SlotSpec> = {
  hair: {
    zh: "頭髮 / 帽",
    note: "頭頂第一塊顏色。帽子也算這一格（草帽的褐色就是這裡）",
    part: "head",
    fine: false,
    example: "香吉士黃 · 索隆綠 · 多拉A夢藍",
  },
  hatBand: {
    zh: "帽帶 / 髮飾細條",
    note: "帽子上那一條橫的顏色。拿掉它魯夫就只是「一頂褐色帽子」",
    part: "head",
    fine: true,
    example: "魯夫的紅帽帶",
  },
  hatBrim: {
    zh: "帽緣 / 瀏海細條",
    note: "帽子最下緣或瀏海的深色邊",
    part: "head",
    fine: true,
    example: "魯夫的黑帽緣",
  },
  face: {
    zh: "臉 / 膚色",
    note: "臉的底色。手臂的裸露段也吃這個顏色（見下面的袖子規則）",
    part: "head",
    fine: false,
    example: "三個航海王角色都是同一個膚色",
  },
  collar: {
    zh: "頸 / 領",
    note: "脖子與領口的顏色",
    part: "torso",
    fine: false,
    example: "多拉A夢的紅項圈",
  },
  chestTrim: {
    zh: "胸飾細條",
    note: "胸前的小配件橫帶",
    part: "torso",
    fine: true,
    example: "多拉A夢的黃鈴鐺",
  },
  top: {
    zh: "上衣軀幹",
    note: "軀幹的主色，通常是整條條碼最大的一塊之一",
    part: "torso",
    fine: false,
    example: "紅背心 / 白襯衫 / 黑西裝上半",
  },
  waist: {
    zh: "腰 / 腹卷",
    note: "上衣下緣那一條。白襯衫下面沒有那條黑，索隆就只是普通綠頭髮白衣人",
    part: "torso",
    fine: true,
    example: "索隆的黑腹卷",
  },
  pants: {
    zh: "下身",
    note: "褲子。即使跟上衣同色也永遠是獨立的一格 —— 中間那條線是髖關節",
    part: "legs",
    fine: false,
    example: "藍短褲 / 深綠褲 / 黑西褲",
  },
  shin: {
    zh: "小腿（裸露）",
    note: "褲子沒包到、露出膚色的那一段。長褲角色請設成「無」",
    part: "legs",
    fine: false,
    example: "魯夫的膚色小腿（香吉士沒有）",
  },
  shoe: {
    zh: "鞋 / 腳",
    note: "最底下那一塊",
    part: "legs",
    fine: false,
    example: "涼鞋褐 / 黑皮鞋",
  },
};

/** Part headings for the three groups the eleven slots fall into. */
export const PART_LABELS: Record<BarcodePart, string> = {
  head: "頭 · head",
  torso: "軀幹 · torso",
  legs: "腿 · legs",
};

export const SLEEVE_LABELS: Record<SleeveKind, string> = {
  long: "長袖 —— 整支手臂都是上衣的顏色",
  short: "短袖 —— 上半手臂上衣色，下半膚色",
  none: "無袖 —— 整支手臂都是膚色",
};

export const SLEEVE_ORDER: readonly SleeveKind[] = ["long", "short", "none"] as const;

/** The three face decals. Painted on head.front only — they are NOT bands (§2.3②). */
export type FaceSlot = "eye" | "nose" | "mouth";
export const FACE_SLOTS: readonly FaceSlot[] = ["eye", "nose", "mouth"] as const;
export const FACE_LABELS: Record<FaceSlot, string> = {
  eye: "眼睛",
  nose: "鼻子",
  mouth: "嘴巴",
};

// ------------------------------------------------------------------- form ---

/** One slot's boxes. `present: false` is the 「無」 state — the slot is absent. */
export interface BandForm {
  present: boolean;
  /** '#rrggbb' as typed */
  hex: string;
  /** share of the WHOLE figure, as typed ("0.22") */
  frac: string;
}

export interface BarcodeForm {
  championId: string;
  bands: Record<BarcodeSlot, BandForm>;
  sleeve: SleeveKind;
  eye: string;
  /** false = this character has no nose decal (`faceColors.nose: null`) */
  noseP: boolean;
  nose: string;
  mouth: string;
  note: string;
}

/** Defaults for a champion with no barcode anywhere yet — a plain blocky figure. */
const BLANK_HEX: Record<BarcodeSlot, string> = {
  hair: "#3A2A1A",
  hatBand: "#E8112D",
  hatBrim: "#111111",
  face: "#F5CBA0",
  collar: "#8A6A3A",
  chestTrim: "#E8C15A",
  top: "#2C6FB5",
  waist: "#111111",
  pants: "#233044",
  shin: "#F5CBA0",
  shoe: "#1A1A1A",
};

/** Which slots a brand-new barcode starts with. The five a plain figure needs. */
const BLANK_PRESENT: readonly BarcodeSlot[] = ["hair", "face", "top", "pants", "shoe"];

/** Round for display: 0.2 → "0.2", 0.13333333 → "0.1333". */
export function formatFrac(n: number): string {
  if (!Number.isFinite(n)) return "";
  return String(Number(n.toFixed(4)));
}

/**
 * Doc → form. `null` means "this champion has no barcode on either layer", and
 * the result is a five-band starting point rather than eleven empty boxes: an
 * editor that opens blank invites the operator to save a figure with no legs.
 */
export function docToForm(barcode: VoxelBarcode | null, championId: string): BarcodeForm {
  const bands = {} as Record<BarcodeSlot, BandForm>;
  for (const slot of BARCODE_SLOTS) {
    const band = barcode?.bands?.[slot] ?? null;
    if (band) {
      bands[slot] = { present: true, hex: band.hex, frac: formatFrac(band.frac) };
    } else {
      const [lo, hi] = BARCODE_TYPICAL_FRAC[slot];
      bands[slot] = {
        present: barcode ? false : BLANK_PRESENT.includes(slot),
        hex: BLANK_HEX[slot],
        // a slot switched back on lands in the MIDDLE of its typical range, so
        // toggling 無 → 有 never produces an out-of-range warning by itself
        frac: formatFrac((lo + hi) / 2),
      };
    }
  }
  const form: BarcodeForm = {
    championId: barcode?.championId ?? championId,
    bands,
    sleeve: barcode?.sleeve ?? "long",
    eye: barcode?.faceColors?.eye ?? "#1A1A1A",
    noseP: (barcode?.faceColors?.nose ?? null) !== null,
    nose: barcode?.faceColors?.nose ?? "#E8112D",
    mouth: barcode?.faceColors?.mouth ?? "#B5705C",
    note: barcode?.note ?? "",
  };
  // A brand-new barcode is normalised on the way in, so the starting point is
  // SAVEABLE. Five mid-of-range priors sum to 0.775, and an editor that opens
  // on a state its own validator rejects teaches the operator to ignore the
  // error line. An AUTHORED barcode is never touched here — its numbers are the
  // owner's, and silently rescaling them is the one thing this file must not do.
  return barcode ? form : normalizeForm(form);
}

export function setBand(
  form: BarcodeForm,
  slot: BarcodeSlot,
  patch: Partial<BandForm>,
): BarcodeForm {
  return { ...form, bands: { ...form.bands, [slot]: { ...form.bands[slot], ...patch } } };
}

/** Parse a frac box. null for blank / non-finite. */
export function parseFrac(text: string): number | null {
  const t = text.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** The present slots, ALWAYS in `BARCODE_SLOTS` order (top of head → sole). */
export function presentSlots(form: BarcodeForm): BarcodeSlot[] {
  return BARCODE_SLOTS.filter((s) => form.bands[s].present);
}

/** Sum of the present bands' typed fracs. */
export function totalFracOf(form: BarcodeForm): number {
  let sum = 0;
  for (const slot of presentSlots(form)) sum += parseFrac(form.bands[slot].frac) ?? 0;
  return sum;
}

/**
 * Scale every present band so the total is exactly 1.0, preserving ratios.
 *
 * The 一鍵正規化 button, and the ONLY thing that touches the operator's numbers
 * without being asked to — hence a button rather than an autocorrect on blur.
 * Hand-authoring eleven fractions that sum to 1.0 is a chore, and a validator
 * that only says 「總和 0.97」 leaves the operator doing arithmetic.
 */
export function normalizeForm(form: BarcodeForm): BarcodeForm {
  const total = totalFracOf(form);
  if (!(total > 0) || !Number.isFinite(total)) return form;
  const slots = presentSlots(form);
  // Four decimals, because these land in boxes a human then edits — but the
  // rounding residue has to GO somewhere: eleven values each rounded down leave
  // the sum at 0.9998, and the doc that gets stored is then off-spec forever.
  // The residue goes on the LARGEST band, where a 1e-4 nudge is invisible; on
  // a 2% 帽帶 it would be a tenth of the feature.
  const scaled = slots.map((s) => Number((((parseFrac(form.bands[s].frac) ?? 0) / total)).toFixed(4)));
  let biggest = 0;
  for (let i = 1; i < scaled.length; i++) if (scaled[i]! > scaled[biggest]!) biggest = i;
  const residue = Number((1 - scaled.reduce((a, b) => a + b, 0)).toFixed(4));
  scaled[biggest] = Number((scaled[biggest]! + residue).toFixed(4));

  const bands = { ...form.bands };
  slots.forEach((slot, i) => {
    bands[slot] = { ...bands[slot], frac: formatFrac(scaled[i]!) };
  });
  return { ...form, bands };
}

// ------------------------------------------------------------- validation ---

export interface BarcodeFormErrors {
  /** per-slot messages, keyed `<slot>.hex` / `<slot>.frac` */
  bands: Partial<Record<string, string>>;
  face: Partial<Record<FaceSlot, string>>;
  /** whole-barcode problems (sum, missing part, mud column, too few bands) */
  general: string[];
  /** advisory — shown, never blocks Save */
  warnings: string[];
}

/** Tolerance on the frac sum. Mirrors BARCODE_FRAC_EPSILON in the shared module. */
export const FRAC_EPSILON = 1e-3;

/**
 * Everything wrong with the form, as messages the page can render next to the
 * offending box. `general` non-empty ⇒ Save is disabled; `warnings` never gates.
 *
 * The three structural rules the spec would not forgive us for dropping:
 *   · every part must own at least one band (an unpainted box is a hole)
 *   · at least BARCODE_MIN_BANDS bands (§4.2 grades fewer as SUSPECT)
 *   · the bands must actually DIFFER — max pairwise ΔE ≥ 25, or it is 泥巴柱
 */
export function validateForm(form: BarcodeForm): BarcodeFormErrors {
  const bands: Partial<Record<string, string>> = {};
  const face: Partial<Record<FaceSlot, string>> = {};
  const general: string[] = [];
  const warnings: string[] = [];

  const present = presentSlots(form);

  for (const slot of present) {
    const b = form.bands[slot];
    if (!isBarcodeHex(b.hex)) bands[`${slot}.hex`] = "顏色必須是 #rrggbb";
    const n = parseFrac(b.frac);
    if (n === null) bands[`${slot}.frac`] = "佔比必須是數字";
    else if (n <= 0) bands[`${slot}.frac`] = "佔比必須大於 0（不存在的槽請切成「無」）";
    else if (n > 1) bands[`${slot}.frac`] = "佔比不能超過 1";
    else {
      const [lo, hi] = BARCODE_TYPICAL_FRAC[slot];
      if (n < lo || n > hi) {
        // ADVISORY on purpose: §2.2's table is not simultaneously satisfiable
        // (a five-slot character's maxima total 0.96), so a correct barcode MUST
        // push at least one band out of range. Treating it as an error would
        // reject 香吉士.
        warnings.push(
          `${SLOT_LABELS[slot].zh}：佔比 ${formatFrac(n)} 在典型區間 [${lo}, ${hi}] 之外（只是提醒）`,
        );
      }
    }
  }

  if (!isBarcodeHex(form.eye)) face.eye = "顏色必須是 #rrggbb";
  if (form.noseP && !isBarcodeHex(form.nose)) face.nose = "顏色必須是 #rrggbb";
  if (!isBarcodeHex(form.mouth)) face.mouth = "顏色必須是 #rrggbb";

  if (form.championId.trim() === "") general.push("請先選一個英雄");

  for (const part of ["head", "torso", "legs"] as const) {
    if (!present.some((s) => BARCODE_SLOT_PART[s] === part)) {
      general.push(`${PART_LABELS[part]} 沒有任何色帶 —— 這個部位會沒有顏色`);
    }
  }

  if (present.length < BARCODE_MIN_BANDS) {
    general.push(`只有 ${present.length} 條帶（至少要 ${BARCODE_MIN_BANDS}）—— §4.2 判為 SUSPECT`);
  }

  const total = totalFracOf(form);
  if (present.length > 0 && Math.abs(total - 1) > FRAC_EPSILON) {
    general.push(`佔比總和 ${formatFrac(total)}，必須是 1.0 —— 按「正規化」可以一鍵修好`);
  }

  const maxDe = maxPairwiseDeltaEOf(form);
  if (maxDe < BARCODE_MUD_COLUMN_DELTA_E) {
    general.push(
      `帶間最大 ΔE ${maxDe.toFixed(1)} < ${BARCODE_MUD_COLUMN_DELTA_E} —— 一根泥巴柱，不是角色`,
    );
  }

  return { bands, face, general, warnings };
}

/** Largest pairwise ΔE among the present, well-formed bands (§4.2's 泥巴柱 guard). */
export function maxPairwiseDeltaEOf(form: BarcodeForm): number {
  const hexes = presentSlots(form)
    .map((s) => form.bands[s].hex)
    .filter((h) => isBarcodeHex(h));
  let max = 0;
  for (let i = 0; i < hexes.length; i++) {
    for (let j = i + 1; j < hexes.length; j++) {
      const d = deltaE76(hexes[i]!, hexes[j]!);
      if (d > max) max = d;
    }
  }
  return max;
}

export function formValid(form: BarcodeForm): boolean {
  const e = validateForm(form);
  return (
    e.general.length === 0 &&
    Object.keys(e.bands).length === 0 &&
    Object.keys(e.face).length === 0
  );
}

// ----------------------------------------------------------------- output ---

/**
 * Form → the stored barcode. `source: "manual"` unconditionally, because that
 * is what this page IS: an operator typed it. The field is mandatory in the
 * model for a reason worth restating — three months from now an ugly champion
 * raises exactly one question, "did the owner ask for this or did the extractor
 * produce garbage", and the two answers have OPPOSITE remedies.
 *
 * Absent slots are written as explicit `null`, never omitted: 「這角色沒有小腿」
 * is a statement, and a truncated record cannot be told from one.
 *
 * Every band object is FRESHLY built, per slot, even when two slots carry the
 * same hex. 香吉士's suit is `top` and `pants` at the same #0D0D0D and they must
 * never become the same object or the same band — that hairline is the hip
 * joint. 色帶是外觀，分節是結構。
 */
export function formToDoc(form: BarcodeForm): VoxelBarcode {
  const bands = {} as Record<BarcodeSlot, BarcodeBand | null>;
  for (const slot of BARCODE_SLOTS) {
    const b = form.bands[slot];
    bands[slot] = b.present ? { hex: b.hex.trim(), frac: parseFrac(b.frac) ?? 0 } : null;
  }
  const out: VoxelBarcode = {
    v: 1,
    championId: form.championId,
    bands: bands as BarcodeBands,
    sleeve: form.sleeve,
    faceColors: {
      eye: form.eye.trim(),
      nose: form.noseP ? form.nose.trim() : null,
      mouth: form.mouth.trim(),
    },
    source: "manual",
  };
  const note = form.note.trim();
  if (note !== "") out.note = note;
  return out;
}

/**
 * Splice ONE champion's barcode into the whole overlay doc, carrying every other
 * champion through untouched.
 *
 * The overlay stores WHOLE DOCUMENTS: a save that rebuilt `barcodes` from the
 * one champion on screen would delete every other authored barcode on the host.
 * Same shape, same hazard and same fix as `patchArenaRules` in ../mobWaves.
 */
export function patchBarcodeDoc(
  doc: Record<string, unknown> | null,
  barcode: VoxelBarcode,
): Record<string, unknown> {
  const base = doc ?? {};
  const existing = extractBarcodes(base);
  return {
    ...base,
    id: BARCODE_DOC_ID,
    schema: BARCODE_DOC_SCHEMA,
    slotOrder: [...BARCODE_SLOTS],
    barcodes: { ...existing, [barcode.championId]: barcode },
  };
}

/** Drop one champion's override so it falls back to the shipped seed. */
export function forgetBarcode(
  doc: Record<string, unknown> | null,
  championId: string,
): Record<string, unknown> {
  const rest = { ...extractBarcodes(doc ?? {}) };
  delete rest[championId];
  return {
    ...(doc ?? {}),
    id: BARCODE_DOC_ID,
    schema: BARCODE_DOC_SCHEMA,
    slotOrder: [...BARCODE_SLOTS],
    barcodes: rest,
  };
}

/**
 * Pull the `barcodes` map out of a loaded doc (either layer — the seed file and
 * the overlay doc share the field). Anything malformed yields an empty map
 * rather than throwing: a corrupt overlay must leave the page usable so the
 * operator can overwrite it.
 */
export function extractBarcodes(doc: unknown): Record<string, VoxelBarcode> {
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) return {};
  const raw = (doc as Record<string, unknown>)["barcodes"];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, VoxelBarcode> = {};
  for (const [id, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;
    if (typeof e["bands"] !== "object" || e["bands"] === null) continue;
    out[id] = entry as VoxelBarcode;
  }
  return out;
}

// ------------------------------------------------------------- resolution ---

/** Which layer answered for a champion. Drives the badge, and it is a FACT. */
export type BarcodeOrigin = "overlay" | "seed" | "none";

export interface Resolved {
  barcode: VoxelBarcode | null;
  origin: BarcodeOrigin;
}

/**
 * `overlay ?? seed`. The console never merges the two — a champion is either on
 * the operator's version or on the shipped one, and a half-merged barcode would
 * be a look nobody chose.
 */
export function resolveBarcode(
  championId: string,
  overlay: Record<string, VoxelBarcode>,
  seed: Record<string, VoxelBarcode>,
): Resolved {
  const edited = overlay[championId];
  if (edited) return { barcode: edited, origin: "overlay" };
  const shipped = seed[championId];
  if (shipped) return { barcode: shipped, origin: "seed" };
  return { barcode: null, origin: "none" };
}

export const ORIGIN_LABEL: Record<BarcodeOrigin, string> = {
  overlay: "後台改過的版本",
  seed: "出貨預設值",
  none: "還沒有條碼",
};

// ---------------------------------------------------------------- preview ---

/**
 * ONE ROW OF THE CSS PREVIEW: a colour and the percentage of the figure's HEIGHT
 * it owns, in anatomical order (top of the head first).
 *
 * This is the whole rendering pipeline for the admin side. `heightPct` is a
 * percentage of the container, so the stack is literally the barcode: the same
 * numbers that go in the JSON, laid out downward. `barcodeToParts` in
 * `@ggd/shared` re-normalises PER PART for the 3D path (three boxes of fixed
 * voxel height); the preview deliberately does NOT, because the whole-figure
 * ratios are exactly what the owner authored and what the reference images show.
 */
export interface PreviewRow {
  slot: BarcodeSlot;
  hex: string;
  /** percent of the figure's height, 0..100 */
  heightPct: number;
  part: BarcodePart;
}

/**
 * The preview stack. Normalised to 100% here (not in the form) so a barcode that
 * does not yet sum to 1.0 still previews at full height instead of leaving a
 * blank strip that reads as a rendering bug.
 *
 * Returns [] when nothing is present or the fracs are unusable — an empty stack
 * is honest; a grey filler band would make an unpaintable barcode look fine.
 */
export function previewStack(form: BarcodeForm): PreviewRow[] {
  const slots = presentSlots(form);
  const total = totalFracOf(form);
  if (slots.length === 0 || !(total > 0) || !Number.isFinite(total)) return [];
  return slots.map((slot) => ({
    slot,
    hex: form.bands[slot].hex,
    heightPct: ((parseFrac(form.bands[slot].frac) ?? 0) / total) * 100,
    part: BARCODE_SLOT_PART[slot],
  }));
}

/**
 * The two arm halves implied by `sleeve` (§2.4) — derived, never authored,
 * because the barcode is a MID-AXIS SECTION and the arms are not on it.
 * Returns null when the colour the rule needs is absent, rather than inventing
 * one.
 */
export function sleevePreview(form: BarcodeForm): { upper: string; lower: string } | null {
  const top = form.bands.top.present ? form.bands.top.hex : null;
  const skin = form.bands.face.present ? form.bands.face.hex : null;
  switch (form.sleeve) {
    case "long":
      return top ? { upper: top, lower: top } : null;
    case "short":
      return top && skin ? { upper: top, lower: skin } : null;
    case "none":
      return skin ? { upper: skin, lower: skin } : null;
  }
}

// -------------------------------------------------------------- messaging ---

export const PERSISTENCE_NOTE =
  "這一頁寫進 data/ 的耐久覆蓋層（config/voxel-barcodes），不是 repo 裡的 content/。git pull、重建 image、重啟容器都不會蓋掉它。";

export const PIXEL_NOTE =
  "這一頁一個像素都不產生。它只編 JSON —— 條碼規格是唯一契約，貼圖由地端的 voxel:build 產生。後台永遠不產生像素，地端永遠不決定顏色。";

export const FINE_BAND_NOTE =
  "細帶（帽帶 / 帽緣 / 胸飾 / 腹卷）只佔 1–5%，但辨識度有一半在它們身上。魯夫拿掉紅帽帶就只是「一頂褐色帽子」—— 不要因為數字小就切成「無」。";

export const HIP_JOINT_NOTE =
  "上衣與下身即使同色也永遠是兩格（香吉士的黑西裝就是兩塊）。中間那條線是髖關節，合併它人偶就不能走路。";

export const SIM_GAP_NOTE =
  "目前這一層只被儲存下來：把條碼畫成貼圖是批次三（paint.ts 分帶 + voxel:build）的事，遊戲端還沒有讀它。存了不會馬上改變場上的角色外觀。";

export function loadErrorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return `讀取條碼失敗：${msg}`;
}

export function saveErrorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return `儲存失敗：${msg}`;
}

/**
 * True when the form differs from the barcode it was seeded with.
 *
 * BOTH SIDES GO THROUGH THE SAME PIPELINE before comparison. A stored barcode's
 * JSON key order is whatever its author's editor wrote (`note` sits third in the
 * seed file, last in ours), and comparing raw `JSON.stringify` would call every
 * untouched champion dirty on open — a 未儲存 marker that is always on is a
 * marker nobody reads.
 *
 * `saved === null` is dirty by definition: the figure on screen is a default
 * that exists nowhere but the screen, so there IS unsaved work.
 */
export function isDirty(form: BarcodeForm, saved: VoxelBarcode | null): boolean {
  if (saved === null) return true;
  const canon = formToDoc(docToForm(saved, form.championId));
  return JSON.stringify(formToDoc(form)) !== JSON.stringify(canon);
}

// -------------------------------------------------------------- champions ---

/** A pickable champion for the dropdown. */
export interface ChampionOption {
  id: string;
  /** 中文名; falls back to the id when the doc could not be read */
  name: string;
}

/** Sort by 中文名, ids-without-names last, so the picker is browsable. */
export function sortChampions(options: readonly ChampionOption[]): ChampionOption[] {
  return [...options].sort((a, b) => {
    const an = a.name === a.id ? 1 : 0;
    const bn = b.name === b.id ? 1 : 0;
    if (an !== bn) return an - bn;
    return a.name.localeCompare(b.name, "zh-Hant");
  });
}

/** "魯夫（godie-u00n）" — never a bare slug. */
export function championLabel(id: string, options: readonly ChampionOption[]): string {
  const hit = options.find((o) => o.id === id);
  if (!hit || hit.name === id) return id;
  return `${hit.name}（${id}）`;
}

/**
 * The dropdown's contents: every champion on disk, PLUS any id that already has
 * a barcode on either layer.
 *
 * The union matters — 香吉士 is parked at `placeholder.sanji` because the roster
 * has no such champion, and a picker built only from `/content/champions` would
 * make his barcode uneditable while still shipping it.
 */
export function championChoices(
  roster: readonly ChampionOption[],
  overlay: Record<string, VoxelBarcode>,
  seed: Record<string, VoxelBarcode>,
): ChampionOption[] {
  const byId = new Map<string, ChampionOption>();
  for (const c of roster) byId.set(c.id, c);
  for (const id of [...Object.keys(seed), ...Object.keys(overlay)]) {
    if (!byId.has(id)) byId.set(id, { id, name: id });
  }
  return sortChampions([...byId.values()]);
}
