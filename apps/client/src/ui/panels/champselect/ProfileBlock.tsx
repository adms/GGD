/**
 * ChampionProfile — the champ-select profile block (task #76): a 3D stage on top
 * and a tabbed detail body below (技能 / 數值 / 玩法 / 故事), for the champion the
 * player is hovering (else their confirmed pick).
 *
 * EVERY NUMBER IS IMPORTED AND REUSES AN EXISTING RENDERER — no third parser is
 * written here (the standing 「動態即時非寫死」 rule):
 *   • abilities  → `skillRows` (ui/panels/skillDetails) over the SAME
 *                  Champions/Abilities registries the server casts with.
 *   • stats      → baseStats/growth formatted with the codex `statLabel` / `num`.
 *   • identity   → `splitChampionName` / `attackTypeLabel` from the codex.
 *   • 3D stage   → `StorePreviewCanvas` (read-only reuse of the store preview).
 * This module only OWNS the composition; the selectors and their formatting are
 * shared, so a number here can never disagree with the sim or the codex.
 */
import { useState } from "react";
import { Abilities, Champions } from "@ggd/shared/sim/content/registry";
import type { AbilityId, ChampionId } from "@ggd/shared/ids";
import { StorePreviewCanvas } from "../../platform/StorePreviewCanvas";
import { IconImg } from "../../components/IconImg";
import { iconSrc } from "../../icons";
import { GOLD, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "../../theme";
import { splitChampionName } from "../../codex/codexData";
import { attackTypeLabel, num, SLOT_COLOR, statLabel } from "../../codex/codexLabels";
import { skillRows, slotLabel, type SkillRow, type SkillRowSlot } from "../skillDetails";
import {
  champSelectSkillSeat,
  championDescription,
  parseDescriptionSections,
} from "./championProfile";
import { playstyleForChampion } from "./playstyle";
import { isStandInModel, STAND_IN_NOTE_EN, STAND_IN_NOTE_ZH } from "./standIn";

type Tab = "skills" | "stats" | "play" | "lore";

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: "skills", label: "技能" },
  { id: "stats", label: "數值" },
  { id: "play", label: "玩法" },
  { id: "lore", label: "故事" },
];

/** Accent colour for a skill row's slot; the passive has no slot colour. */
function slotAccent(slot: SkillRowSlot): string {
  return slot === "PASSIVE" ? "#8a93a8" : SLOT_COLOR[slot];
}

/** One skill row — icon or letter-tile fallback, name, meta line, description. */
function SkillRowView({ row }: { row: SkillRow }): React.JSX.Element {
  const accent = slotAccent(row.slot);
  const meta: string[] = [];
  if (row.castLabel) meta.push(row.castLabel);
  if (row.cooldownSec !== undefined && row.cooldownSec > 0) meta.push(`冷卻 ${num(row.cooldownSec)} 秒`);
  if (row.manaCost !== undefined) meta.push(`魔力 ${num(row.manaCost)}`);
  if (row.maxRank > 1) meta.push(`最大 ${row.maxRank} 級`);
  return (
    <div style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid #1b2233" }}>
      {/* w3x icon, or the letter tile (only 12/452 abilities carry an icon) */}
      {row.icon !== undefined ? (
        <IconImg src={iconSrc(row.icon)} size={34} alt={row.name} style={{ border: `1px solid ${accent}55` }} />
      ) : (
        <div
          style={{
            width: 34,
            height: 34,
            flexShrink: 0,
            borderRadius: 5,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#121826",
            border: `1px solid ${accent}77`,
            color: accent,
            fontWeight: 700,
            fontSize: row.slot === "PASSIVE" ? 11 : 14,
          }}
        >
          {slotLabel(row.slot)}
        </div>
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 10, color: accent, fontWeight: 700 }}>{slotLabel(row.slot)}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: TEXT_MAIN }}>{row.name}</span>
        </div>
        {meta.length > 0 && <div style={{ fontSize: 10.5, color: TEXT_DIM, marginTop: 2 }}>{meta.join(" · ")}</div>}
        {row.description !== undefined && (
          <div style={{ fontSize: 11.5, color: "#c1cadd", lineHeight: 1.55, marginTop: 4, whiteSpace: "pre-wrap" }}>
            {row.description}
          </div>
        )}
      </div>
    </div>
  );
}

function StatsTab({ championId }: { championId: ChampionId }): React.JSX.Element {
  const def = Champions.get(championId);
  const base = def.baseStats as Record<string, number | undefined>;
  const growth = def.growth as Record<string, number | undefined>;
  const keys = [...new Set([...Object.keys(base), ...Object.keys(growth)])];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "2px 16px", fontSize: 12 }}>
      <div style={{ color: TEXT_DIM, fontSize: 10 }}>屬性</div>
      <div style={{ color: TEXT_DIM, fontSize: 10, textAlign: "right" }}>基礎</div>
      <div style={{ color: TEXT_DIM, fontSize: 10, textAlign: "right" }}>每級成長</div>
      {keys.map((k) => {
        const b = base[k];
        const g = growth[k];
        return (
          <div key={k} style={{ display: "contents" }}>
            <div style={{ color: TEXT_DIM }}>{statLabel(k)}</div>
            <div style={{ textAlign: "right", color: TEXT_MAIN }}>{b === undefined ? "—" : num(b)}</div>
            <div style={{ textAlign: "right", color: g ? GOLD : TEXT_DIM }}>
              {g === undefined || g === 0 ? "—" : `+${num(g)}`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PlayTab({ championId }: { championId: ChampionId }): React.JSX.Element {
  const def = Champions.get(championId);
  const sections = parseDescriptionSections(championDescription(def));
  const ex = def.exAbility ? (Abilities.tryGet(def.exAbility as AbilityId) ?? null) : null;
  const playstyle = playstyleForChampion(def, ex);
  const mapRows: Array<[string, string]> = [];
  if (sections.difficulty) mapRows.push(["上手度", sections.difficulty]);
  if (sections.recommend) mapRows.push(["推薦玩家", sections.recommend]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ fontSize: 10, letterSpacing: 1, color: TEXT_DIM, marginBottom: 6 }}>地圖原文</div>
        {mapRows.length === 0 ? (
          <div style={{ fontSize: 12, color: TEXT_DIM }}>（地圖沒有寫上手度／推薦玩家）</div>
        ) : (
          mapRows.map(([label, value]) => (
            <div key={label} style={{ display: "flex", gap: 10, fontSize: 12.5, padding: "2px 0" }}>
              <span style={{ width: 64, flexShrink: 0, color: TEXT_DIM }}>{label}</span>
              <span style={{ color: TEXT_MAIN }}>{value}</span>
            </div>
          ))
        )}
      </div>
      <div>
        <div style={{ fontSize: 10, letterSpacing: 1, color: "#e0a878", marginBottom: 6 }}>
          系統推斷 <span style={{ color: TEXT_DIM }}>· 非地圖原文</span>
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: TEXT_MAIN }}>{playstyle.label}</div>
        <div style={{ fontSize: 10.5, color: TEXT_DIM, marginTop: 4 }}>
          由攻擊方式、攻擊距離與技能效果組成推算，僅供參考。
        </div>
      </div>
    </div>
  );
}

function LoreTab({ championId }: { championId: ChampionId }): React.JSX.Element {
  const def = Champions.get(championId);
  const sections = parseDescriptionSections(championDescription(def));
  const text = sections.story ?? (sections.hasSections ? undefined : championDescription(def));
  if (!text) return <div style={{ fontSize: 12, color: TEXT_DIM }}>（此角色沒有故事文字）</div>;
  return (
    <div style={{ fontSize: 12.5, lineHeight: 1.7, color: "#c8d0e0", whiteSpace: "pre-wrap" }}>{text}</div>
  );
}

export function ChampionProfile({ championId }: { championId: string | null }): React.JSX.Element {
  const [tab, setTab] = useState<Tab>("skills");
  const def = championId ? Champions.tryGet(championId as ChampionId) : undefined;

  if (!def) {
    return (
      <div
        style={{
          height: "100%",
          minHeight: 320,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px dashed #2c3448",
          borderRadius: 12,
          color: TEXT_DIM,
          fontSize: 13,
          textAlign: "center",
          padding: 24,
        }}
      >
        把游標移到英雄上查看詳情
        <br />
        <span style={{ fontSize: 11 }}>hover a champion to see its profile</span>
      </div>
    );
  }

  const { title, fullName } = splitChampionName(def.name);
  const standIn = isStandInModel(def.modelKey);
  const rows = skillRows(champSelectSkillSeat(def));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* ── 3D stage ─────────────────────────────────────────────────────── */}
      <div style={{ position: "relative", height: 300, flexShrink: 0 }}>
        {/* NOT keyed: StorePreviewCanvas swaps the model in the SAME Babylon
            engine on a modelKey change, so a hover preview never re-creates the
            WebGL context (only the model reloads). */}
        <StorePreviewCanvas modelKey={def.modelKey} />
        {standIn && (
          <div
            title={STAND_IN_NOTE_EN}
            style={{
              position: "absolute",
              left: 10,
              bottom: 10,
              padding: "4px 10px",
              borderRadius: 999,
              background: "rgba(58, 44, 28, 0.9)",
              border: "1px solid #e0a878",
              color: "#f0cfa8",
              fontSize: 10.5,
            }}
          >
            🎭 {STAND_IN_NOTE_ZH}
          </div>
        )}
      </div>

      {/* ── identity header (稱號 / 全名 / 近戰·遠程) — role deliberately omitted ── */}
      <div style={{ padding: "10px 2px 8px", borderBottom: PANEL_BORDER }}>
        {title && <div style={{ fontSize: 11, color: GOLD, letterSpacing: 1 }}>{title}</div>}
        <div style={{ fontSize: 19, fontWeight: 700, color: TEXT_MAIN, lineHeight: 1.2 }}>{fullName}</div>
        <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 3 }}>{attackTypeLabel(def.attackType)}</div>
      </div>

      {/* ── tabs ─────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 4, padding: "8px 0", flexShrink: 0 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1,
              padding: "6px 4px",
              borderRadius: 7,
              cursor: "pointer",
              fontSize: 12.5,
              fontWeight: tab === t.id ? 700 : 500,
              background: tab === t.id ? "#26314c" : "transparent",
              border: tab === t.id ? "1px solid #6f8fe0" : "1px solid #232c3e",
              color: tab === t.id ? TEXT_MAIN : TEXT_DIM,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── tab body (scrolls) ───────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingRight: 4 }}>
        {tab === "skills" &&
          (rows.length === 0 ? (
            <div style={{ fontSize: 12, color: TEXT_DIM }}>此英雄沒有技能資料</div>
          ) : (
            rows.map((r) => <SkillRowView key={`${r.slot}-${r.rawName}`} row={r} />)
          ))}
        {tab === "stats" && <StatsTab championId={def.id} />}
        {tab === "play" && <PlayTab championId={def.id} />}
        {tab === "lore" && <LoreTab championId={def.id} />}
      </div>
    </div>
  );
}
