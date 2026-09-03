# 語意色彩鏈（role markup, task #114）—— **2026-09-03 拆除**（GH#757）

⭐ 為什麼拆：整條鏈**蓋好了、接上 UI 了、schema 開好欄位了，而內容端是零**，兩個月沒有變。
逐條實查（2026-09-03）：`grep -rl descriptionRoles content/abilities content/champions` → **0**
（分母 421 份 ability · 71 份 champion）；importer 的產出函式 `to_role_markup` **零呼叫者**。

⛔ **為什麼不選「餵它」那條路**：`rescaleAbilityProse` 的兩條正則錨定在
「數字**緊貼**關鍵字」，而呼叫順序是 `parseRoleMarkup(rescaleAbilityProse(...))`
—— **先 rescale 再 parse，救不了**。插入 `[c=duration]…[/c]` 之後正則不再命中
⇒ ⭐ 冷卻會顯示 60 而不是 18（`combat-env.multipliers.cooldown = 0.3`，差 ≈3.3 倍）
⇒ ⛔ **卡面數字直接說謊**，而那是第一·五守則的紅線。

⭐ **rollback**：把下面每一段貼回原位（路徑逐一標在段落標題上），
然後把 `fieldAdoption.exemptions.json` 的兩列債加回去。
⚠️ 貼回去之前**先修上面那個正則衝突**，⛔ 否則卡面數字會爛掉。

---

## `apps/client/src/ui/components/abilityText.ts` —— `DescRole` / `ROLE_COLOR` / `classifyRole` / `parseRoleMarkup`

```ts
// (tools/w3x-import/w3xlib/wts.py) classifies each colour into a SEMANTIC ROLE
// and re-emits the text as `[c=role]…[/c]` markup; this module is the single
// source of truth for the role vocabulary, the hex→role classifier (kept
// byte-for-byte in sync with the Python side), and the one normalised colour
// each role renders as. Game tooltips, the codex and the editor preview all
// read role → colour from here, so the whole app speaks one palette.
// ---------------------------------------------------------------------------

/** The semantic roles a coloured span in a description can carry. */
export type DescRole = "damage" | "physical" | "duration" | "heal" | "mana" | "magic" | "generic";

/**
 * Role → the ONE normalised colour it renders as (dark-panel legible). This is
 * the whole point of the task: whatever inconsistent red the source used for a
 * damage number, it renders as exactly this red everywhere.
 */
export const ROLE_COLOR: Record<DescRole, string> = {
  damage: "#ff6b5e",
  physical: "#ffa24b",
  duration: "#f2c637",
  heal: "#5fd17a",
  mana: "#5aa2ff",
  magic: "#b98bff",
  generic: "#dfe6f2",
};

/**
 * Exact-hex overrides for source colours whose hue would mis-classify — the
 * pale "name"/highlight tints the map uses for non-numeric emphasis, which by
 * hue alone would read as physical/mana but are semantically neutral. Keyed by
 * lowercase RRGGBB (alpha dropped). Everything else falls to the hue rule.
 */
const ROLE_OVERRIDES: Record<string, DescRole> = {
  ffdead: "generic", // navajo-white — item/keyword names
  c3dbff: "generic", // pale blue highlight
  ffffff: "generic",
  c0c0c0: "generic",
};

/**
 * Classify a WC3 colour into a semantic role. Accepts `RRGGBB` or `AARRGGBB`
 * (alpha dropped), case-insensitive. TOTAL — never returns "unknown": a small
 * override table handles the neutral tints, then a deterministic HSV rule maps
 * every remaining colour by hue, with low-saturation/near-grey folding to
 * `generic`. Mirror of `classify_role` in w3xlib/wts.py.
 */
export function classifyRole(hex: string): DescRole {
  const h = hex.toLowerCase().replace(/[^0-9a-f]/g, "");
  const rgb = h.length === 8 ? h.slice(2) : h.slice(-6);
  if (rgb.length < 6) return "generic";
  const override = ROLE_OVERRIDES[rgb];
  if (override) return override;
  const r = parseInt(rgb.slice(0, 2), 16) / 255;
  const g = parseInt(rgb.slice(2, 4), 16) / 255;
  const b = parseInt(rgb.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const sat = max === 0 ? 0 : d / max;
  if (d < 0.06 || sat < 0.18) return "generic";
  let hue: number;
  if (max === r) hue = ((g - b) / d) % 6;
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  if (hue < 20 || hue >= 330) return "damage";
  if (hue < 45) return "physical";
  if (hue < 70) return "duration";
  if (hue < 165) return "heal";
  if (hue < 255) return "mana";
  return "magic";
}

/** One run of description text, optionally carrying a role colour. */
export interface DescSegment {
  readonly text: string;
  readonly role?: DescRole;
}

const ROLE_MARKUP_RE = /\[c=([a-z-]+)\]([\s\S]*?)\[\/c\]/g;

/** True when a string carries any `[c=role]…[/c]` role markup. */
export function hasRoleMarkup(s: string): boolean {
  ROLE_MARKUP_RE.lastIndex = 0;
  return ROLE_MARKUP_RE.test(s);
}

/**
 * Split a description into coloured/plain runs. `[c=role]text[/c]` becomes a
 * segment carrying that role (an unrecognised role tag degrades to a plain
 * run rather than throwing); text outside any tag is a role-less run. A string
 * with no markup returns a single plain segment, so this is a safe no-op on the
 * flat descriptions that predate the importer re-run. Mirror of the emitter in
 * w3xlib/wts.py (`to_role_markup`).
 */
export function parseRoleMarkup(s: string): DescSegment[] {
  const out: DescSegment[] = [];
  let last = 0;
  ROLE_MARKUP_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ROLE_MARKUP_RE.exec(s)) !== null) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    const role = m[1] as DescRole;
    out.push(role in ROLE_COLOR ? { text: m[2]!, role } : { text: m[2]! });
    last = ROLE_MARKUP_RE.lastIndex;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out.length > 0 ? out : [{ text: s }];
}

/** Compact Chinese label for an ability cast type (tooltip meta row). */
const CAST_TYPE_LABEL: Record<CastType, string> = {
  targeted: "鎖定",
  skillshot: "技能預測",
  ground: "地面指定",
  self: "自身",
  dash: "位移",
};

export function castTypeLabel(castType: CastType): string {
```

---

## `tools/w3x-import/w3xlib/wts.py` —— `to_role_markup`（零呼叫者）

```python
#
# The w3x tooltips colour numbers inline with |cAARRGGBB…|r codes, but the
# source is wildly inconsistent — the same "damage" number appears in a dozen
# near-identical reds. Rather than ship raw hex, classify each colour into a
# SEMANTIC ROLE and re-emit the text as `[c=role]…[/c]` markup; the client then
# renders role → one normalised colour everywhere. This is the AUTHORING half:
# it must stay byte-for-byte in sync with `classifyRole` / `parseRoleMarkup` in
# apps/client/src/ui/components/abilityText.ts (same override table, same hue
# cutoffs, same markup grammar).
# ---------------------------------------------------------------------------

# Exact-hex overrides for the neutral "name"/highlight tints whose hue would
# otherwise mis-read as physical/mana. Keyed by lowercase RRGGBB (alpha dropped).
_ROLE_OVERRIDES = {
    "ffdead": "generic",  # navajo-white — item/keyword names
    "c3dbff": "generic",  # pale blue highlight
    "ffffff": "generic",
    "c0c0c0": "generic",
}

_COLOR_SPAN_RE = re.compile(r"\|c([0-9a-fA-F]{8})", re.I)


def classify_role(hex_code: str) -> str:
    """Classify a WC3 colour (RRGGBB or AARRGGBB) into a semantic role.

    TOTAL — never returns "unknown": an override table handles the neutral
    tints, then a deterministic HSV rule maps every remaining colour by hue,
    with low-saturation / near-grey folding to ``generic``. Mirror of
    ``classifyRole`` in abilityText.ts.
    """
    h = re.sub(r"[^0-9a-f]", "", hex_code.lower())
    rgb = h[2:] if len(h) == 8 else h[-6:]
    if len(rgb) < 6:
        return "generic"
    if rgb in _ROLE_OVERRIDES:
        return _ROLE_OVERRIDES[rgb]
    r = int(rgb[0:2], 16) / 255
    g = int(rgb[2:4], 16) / 255
    b = int(rgb[4:6], 16) / 255
    mx, mn = max(r, g, b), min(r, g, b)
    d = mx - mn
    sat = 0.0 if mx == 0 else d / mx
    if d < 0.06 or sat < 0.18:
        return "generic"
    if mx == r:
        hue = ((g - b) / d) % 6
    elif mx == g:
        hue = (b - r) / d + 2
    else:
        hue = (r - g) / d + 4
    hue *= 60
    if hue < 0:
        hue += 360
    if hue < 20 or hue >= 330:
        return "damage"
    if hue < 45:
        return "physical"
    if hue < 70:
        return "duration"
    if hue < 165:
        return "heal"
    if hue < 255:
        return "mana"
    return "magic"


def to_role_markup(s: str) -> str:
    """Convert WC3 colour codes into `[c=role]…[/c]` semantic role markup.

    Each `|cAARRGGBB … |r` span becomes `[c=role]inner[/c]` (role from
    ``classify_role``, `|n` inside converted to newline). Pipe-newlines outside
    spans and any stray `|r` are handled like ``strip_codes``, so the result is
    the same text as ``strip_codes(s)`` with only role tags added. An unclosed
    span runs to the next colour code or end of string. Not a string → returned
    unchanged.
    """
    if not isinstance(s, str):
        return s
    out: list[str] = []
    i = 0
```
