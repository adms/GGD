/**
 * controls — the presentational half of 鑄形工坊.
 *
 * Every control here writes a `VoxelLook` and nothing else: no Babylon, no
 * `api`, no document. That single rule is what makes the data flow reviewable —
 *
 *     control → setLook → useDebounced → buildFigure  → the 3D preview
 *                                     → toModelDoc    → the save
 *
 * — and it is why a slider cannot break #150 or reach the content-api.
 */
import { SLOT, type SlotName } from "@ggd/shared/voxel";
import {
  ARCHETYPE_KEYS,
  PROP_GROUPS,
  SHAPED_JOINTS,
  jointScaleOf,
  withJointScale,
  withPaletteSlot,
  withProp,
  type PropKey,
  type ShapedJoint,
  type VoxelLook,
} from "@ggd/shared/voxel";
import { ACCENT, GOLD, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "../theme";

/** Operator-facing names. The English joint/slot keys never reach the screen. */
export const JOINT_LABEL: Readonly<Record<ShapedJoint, string>> = {
  hips: "腰身",
  chest: "軀幹",
  head: "頭",
  handLeft: "左臂",
  handRight: "右臂",
  footLeft: "左腿",
  footRight: "右腿",
};

export const SLOT_LABEL: Readonly<Record<SlotName, string>> = {
  skin: "膚色",
  cloth1: "上衣",
  cloth2: "袖子",
  accent: "配件",
  trim: "鑲邊",
  boot: "靴子",
  eye: "眼／臉",
  prop: "道具",
};

export const PROP_LABEL: Readonly<Record<PropKey, string>> = {
  hat: "帽子／頭盔",
  pack: "背包／披風",
  belt: "腰帶",
  pauldron: "肩甲",
  weapon: "武器方塊",
};

export const ARCHETYPE_LABEL: Readonly<Record<string, string>> = {
  mage: "法師",
  knight: "騎士",
  barbarian: "蠻族",
  rogue: "盜賊",
  undead: "不死／殭屍",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 6,
};

const labelStyle: React.CSSProperties = {
  color: TEXT_DIM,
  fontSize: 12,
  width: 64,
  flexShrink: 0,
};

export function SectionTitle(props: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div
      style={{
        color: GOLD,
        fontSize: 13,
        fontWeight: 600,
        margin: "14px 0 8px",
        borderBottom: PANEL_BORDER,
        paddingBottom: 4,
      }}
    >
      {props.children}
    </div>
  );
}

/**
 * 體型 — the proportion sliders.
 *
 * They write JOINT SCALE, which is exactly the number the client writes at
 * spawn on a rigidly-skinned figure (see the look.ts header). Editing raw box
 * sizes instead would author a different mesh and fork the generator.
 */
export function ProportionControls(props: {
  look: VoxelLook;
  onChange: (next: VoxelLook) => void;
}): React.JSX.Element {
  const { look, onChange } = props;
  return (
    <div>
      {SHAPED_JOINTS.map((joint) => {
        const s = jointScaleOf(look, joint)[0];
        return (
          <div key={joint} style={rowStyle}>
            <span style={labelStyle}>{JOINT_LABEL[joint]}</span>
            <input
              type="range"
              min={0}
              max={2.5}
              step={0.01}
              value={s}
              onChange={(e) => {
                const v = Number(e.target.value);
                onChange(withJointScale(look, joint, [v, v, v]));
              }}
              style={{ flex: 1, accentColor: ACCENT }}
            />
            <span style={{ color: TEXT_MAIN, fontSize: 12, width: 40, textAlign: "right" }}>
              {s.toFixed(2)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** 配色 — one swatch per palette slot. */
export function PaletteControls(props: {
  look: VoxelLook;
  onChange: (next: VoxelLook) => void;
}): React.JSX.Element {
  const { look, onChange } = props;
  const slots = Object.keys(SLOT) as SlotName[];
  return (
    <div>
      {slots.map((slot) => (
        <div key={slot} style={rowStyle}>
          <span style={labelStyle}>{SLOT_LABEL[slot]}</span>
          <input
            type="color"
            value={look.palette[SLOT[slot]] ?? "#ffffff"}
            onChange={(e) => onChange(withPaletteSlot(look, slot, e.target.value))}
            style={{ width: 44, height: 24, background: "transparent", border: PANEL_BORDER }}
          />
          <span style={{ color: TEXT_DIM, fontSize: 12, fontFamily: "monospace" }}>
            {look.palette[SLOT[slot]]}
          </span>
        </div>
      ))}
      <label style={{ ...rowStyle, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={look.teamTint}
          onChange={(e) => onChange({ ...look, teamTint: e.target.checked })}
        />
        <span style={{ color: TEXT_MAIN, fontSize: 12 }}>
          隊色染色（寫進 teamTintMaterials，#49 會整體乘上隊伍顏色）
        </span>
      </label>
    </div>
  );
}

/** 部件 — the prop mask. Each toggle collapses or restores a carrier joint. */
export function PropControls(props: {
  look: VoxelLook;
  onChange: (next: VoxelLook) => void;
}): React.JSX.Element {
  const { look, onChange } = props;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {PROP_GROUPS.map((g) => {
        const prop = g as PropKey;
        const on = look.props.includes(prop);
        return (
          <button
            key={prop}
            type="button"
            onClick={() => onChange(withProp(look, prop, !on))}
            style={{
              padding: "5px 10px",
              fontSize: 12,
              borderRadius: 6,
              cursor: "pointer",
              border: on ? `1px solid ${ACCENT}` : PANEL_BORDER,
              background: on ? "#2c3f6b" : "transparent",
              color: on ? TEXT_MAIN : TEXT_DIM,
            }}
          >
            {PROP_LABEL[prop]}
          </button>
        );
      })}
    </div>
  );
}

/** 原型 — the five presets the bake ships today. */
export function ArchetypePicker(props: {
  value: string;
  onPick: (key: string) => void;
}): React.JSX.Element {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {ARCHETYPE_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => props.onPick(key)}
          style={{
            padding: "5px 10px",
            fontSize: 12,
            borderRadius: 6,
            cursor: "pointer",
            border: props.value === key ? `1px solid ${GOLD}` : PANEL_BORDER,
            background: props.value === key ? "#3a3320" : "transparent",
            color: props.value === key ? TEXT_MAIN : TEXT_DIM,
          }}
        >
          {ARCHETYPE_LABEL[key] ?? key}
        </button>
      ))}
    </div>
  );
}

/** 動作 — clip rate + collision radius, the two remaining scalars. */
export function ScalarControls(props: {
  look: VoxelLook;
  onChange: (next: VoxelLook) => void;
}): React.JSX.Element {
  const { look, onChange } = props;
  return (
    <div>
      <div style={rowStyle}>
        <span style={labelStyle}>動作速率</span>
        <input
          type="range"
          min={0.5}
          max={2.5}
          step={0.01}
          value={look.clipRate}
          onChange={(e) => onChange({ ...look, clipRate: Number(e.target.value) })}
          style={{ flex: 1, accentColor: ACCENT }}
        />
        <span style={{ color: TEXT_MAIN, fontSize: 12, width: 52, textAlign: "right" }}>
          {look.clipRate.toFixed(2)}×
        </span>
      </div>
      <div style={{ color: TEXT_DIM, fontSize: 11, marginBottom: 8 }}>
        &gt;1 代表更慢（不死系的拖行步）
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>碰撞半徑</span>
        <input
          type="range"
          min={0.2}
          max={1.6}
          step={0.01}
          value={look.collisionRadius}
          onChange={(e) => onChange({ ...look, collisionRadius: Number(e.target.value) })}
          style={{ flex: 1, accentColor: ACCENT }}
        />
        <span style={{ color: TEXT_MAIN, fontSize: 12, width: 52, textAlign: "right" }}>
          {look.collisionRadius.toFixed(2)}
        </span>
      </div>
      <div style={{ color: TEXT_DIM, fontSize: 11 }}>
        sim 用的平面半徑——由你決定，不會偷偷從身形推算
      </div>
    </div>
  );
}
