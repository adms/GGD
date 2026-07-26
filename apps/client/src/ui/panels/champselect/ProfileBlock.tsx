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
import { useEffect, useState } from "react";
import { audioSystem } from "../../../audio";
import { Abilities, Champions } from "@ggd/shared/sim/content/registry";
import type { AbilityId, ChampionId } from "@ggd/shared/ids";
import {
  loadChampionQuotes,
  quoteEntryFor,
  type ChampionQuoteEntry,
  type ChampionQuotesManifest,
} from "../../../audio/nameVoice";
import { StorePreviewCanvas } from "../../platform/StorePreviewCanvas";
import { IconImg } from "../../components/IconImg";
import { iconSrc } from "../../icons";
import { GOLD, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "../../theme";
import { splitChampionName } from "../../codex/codexData";
import { attackTypeLabel, num, SLOT_COLOR, statLabel } from "../../codex/codexLabels";
import { skillRows, slotLabel, type SkillRow, type SkillRowSlot } from "../skillDetails";
import { innateCastNote, innateKindLabel, PASSIVE_ACCENT } from "../../passiveSlot";
import { displayFinal, displayFinalText, isScaled, statDisplayFactor, useDisplayEnv } from "../../displayFinal";
import { rescaleAbilityProse, WC3_PROSE_CAPTION } from "../../components/abilityText";
import { championSheetRows } from "../../championSheet";
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

/** Accent colour for a skill row's slot; the 天生技 gets its own violet. */
function slotAccent(slot: SkillRowSlot): string {
  return slot === "PASSIVE" ? PASSIVE_ACCENT : SLOT_COLOR[slot];
}

/** One skill row — icon or letter-tile fallback, name, meta line, description. */
function SkillRowView({ row }: { row: SkillRow }): React.JSX.Element {
  const accent = slotAccent(row.slot);
  const env = useDisplayEnv();
  const innate = row.slot === "PASSIVE";
  const meta: string[] = [];
  // 天生技 leads with WHY it has no rank: it is owned from level 1, not learned.
  if (innate) meta.push(innateCastNote(row.innateKind ?? "passive"));
  if (row.castLabel) meta.push(row.castLabel);
  // #125: show the post-multiplier FINAL cooldown (combat-env), not the base.
  if (row.cooldownSec !== undefined && row.cooldownSec > 0)
    meta.push(`冷卻 ${displayFinalText(row.cooldownSec, "cooldown", { env })} 秒`);
  if (row.manaCost !== undefined) meta.push(`魔力 ${num(row.manaCost)}`);
  // #136: cast range + AoE shown as the post-`abilityRange` final (base ×0.6),
  // tracked live off the same combat-env table as the cooldown.
  if (row.range !== undefined && row.range > 0)
    meta.push(`射程 ${displayFinalText(row.range, "abilityRange", { env })}`);
  if (row.radius !== undefined && row.radius > 0)
    meta.push(`範圍 ${displayFinalText(row.radius, "abilityRange", { env })}`);
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
          {/* the SIXTH slot carries its kind next to the badge: 被動 = never
              pressed, 主動 = a real D-slot ability that is simply already owned */}
          {innate && (
            <span
              style={{
                fontSize: 9,
                color: accent,
                border: `1px solid ${accent}66`,
                borderRadius: 3,
                padding: "0 3px",
              }}
            >
              {innateKindLabel(row.innateKind ?? "passive")}
            </span>
          )}
          <span style={{ fontSize: 13, fontWeight: 600, color: TEXT_MAIN }}>{row.name}</span>
        </div>
        {meta.length > 0 && <div style={{ fontSize: 10.5, color: TEXT_DIM, marginTop: 2 }}>{meta.join(" · ")}</div>}
        {row.description !== undefined && (
          <>
            {/* 說明數值最終化: cooldown literals rescaled to the live combat-env final */}
            <div style={{ fontSize: 11.5, color: "#c1cadd", lineHeight: 1.55, marginTop: 4, whiteSpace: "pre-wrap" }}>
              {rescaleAbilityProse(row.description, env)}
            </div>
            <div style={{ fontSize: 9.5, color: TEXT_DIM, marginTop: 2 }}>{WC3_PROSE_CAPTION}</div>
          </>
        )}
      </div>
    </div>
  );
}

/** Accent for the ADDED 戰鬥實際 column — the post-combat-env final stat. */
const BATTLE_FINAL_COLOR = "#6fd3a8";

function StatsTab({ championId }: { championId: ChampionId }): React.JSX.Element {
  const def = Champions.get(championId);
  const env = useDisplayEnv();
  // 三圍 (#248): rows come from the SIM's championStatBase/Growth, never from
  // def.baseStats directly — those hold the raw w3x numbers without the
  // attribute term. See ui/championSheet.ts.
  const rows = championSheetRows(def, env);
  const a = def.attributes;
  return (
    <div>
      {a !== undefined && (
        <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 6 }}>
          三圍 <span style={{ color: GOLD }}>力 {num(a.str)}</span> (+{num(a.strGrowth)}) ·{" "}
          <span style={{ color: GOLD }}>敏 {num(a.agi)}</span> (+{num(a.agiGrowth)}) ·{" "}
          <span style={{ color: GOLD }}>智 {num(a.int)}</span> (+{num(a.intGrowth)}) · 主屬{" "}
          {PRIMARY_ZH[a.primary]}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: "2px 16px", fontSize: 12 }}>
        <div style={{ color: TEXT_DIM, fontSize: 10 }}>屬性</div>
        <div style={{ color: TEXT_DIM, fontSize: 10, textAlign: "right" }}>基礎</div>
        {/* 說明數值最終化: base × combat-env multiplier (maxHealth ×4 → 600 = 2400) */}
        <div style={{ color: TEXT_DIM, fontSize: 10, textAlign: "right" }}>戰鬥實際</div>
        <div style={{ color: TEXT_DIM, fontSize: 10, textAlign: "right" }}>每級成長</div>
        {rows.map(({ key: k, base: b, growth: g }) => {
          const factor = statDisplayFactor(k);
          const showFinal = b !== undefined && isScaled(factor, env);
          return (
            <div key={k} style={{ display: "contents" }}>
              <div style={{ color: TEXT_DIM }}>{statLabel(k)}</div>
              <div style={{ textAlign: "right", color: TEXT_MAIN }}>{b === undefined ? "—" : num(b)}</div>
              <div style={{ textAlign: "right", color: showFinal ? BATTLE_FINAL_COLOR : TEXT_DIM }}>
                {showFinal ? num(displayFinal(b, factor, env)) : "—"}
              </div>
              <div style={{ textAlign: "right", color: g ? GOLD : TEXT_DIM }}>
                {g === undefined || g === 0 ? "—" : `+${num(g)}`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 主屬性 label — the attribute a hero's identity is built on (task #248). */
const PRIMARY_ZH: Record<"STR" | "AGI" | "INT", string> = {
  STR: "力量",
  AGI: "敏捷",
  INT: "智慧",
};

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

/**
 * Load the famous-quote pack (task #139) once, cached single-flight in the audio
 * layer. Warming it here also spares the first champ-select CONFIRM the fetch.
 * A missing pack (404) resolves to null → no quote shown, no error.
 */
function useChampionQuotes(): ChampionQuotesManifest | null {
  const [quotes, setQuotes] = useState<ChampionQuotesManifest | null>(null);
  useEffect(() => {
    let live = true;
    void loadChampionQuotes()
      .then((m) => {
        if (live) setQuotes(m);
      })
      .catch(() => {
        /* pack not generated — the profile simply shows no quote */
      });
    return () => {
      live = false;
    };
  }, []);
  return quotes;
}

/**
 * The champion's famous line (task #139): the Japanese quote spoken on CONFIRM,
 * styled as a pull-quote, with the Chinese gloss beneath. An `original` (coined /
 * 惡搞) line is flagged so it never masquerades as a canonical quote.
 */
function QuoteBlock({ entry }: { entry: ChampionQuoteEntry }): React.JSX.Element {
  return (
    <div
      style={{
        marginTop: 8,
        padding: "8px 10px",
        borderLeft: `2px solid ${GOLD}`,
        borderRadius: "0 6px 6px 0",
        background: "rgba(224, 168, 120, 0.06)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span aria-hidden style={{ color: GOLD, fontSize: 13, lineHeight: 1 }}>
          「
        </span>
        <span style={{ fontSize: 14, fontWeight: 600, color: TEXT_MAIN, lineHeight: 1.45 }}>
          {entry.jpQuote}
        </span>
      </div>
      {entry.zhGloss && (
        <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 3, paddingLeft: 14 }}>
          {entry.zhGloss}
        </div>
      )}
      {!entry.real && (
        <div style={{ fontSize: 9.5, color: "#e0a878", marginTop: 3, paddingLeft: 14, letterSpacing: 0.5 }}>
          原創台詞 <span style={{ color: TEXT_DIM }}>· 非官方名言</span>
        </div>
      )}
    </div>
  );
}

export function ChampionProfile({
  championId,
  compact = false,
  stageHeight = 300,
}: {
  championId: string | null;
  /** phone layout: flow at natural height (outer scroll owns the scrolling). */
  compact?: boolean;
  /** 3D stage height — shrunk on phones so the tabbed intro is not clipped. */
  stageHeight?: number;
}): React.JSX.Element {
  const [tab, setTab] = useState<Tab>("skills");
  const quotes = useChampionQuotes();
  const def = championId ? Champions.tryGet(championId as ChampionId) : undefined;

  if (!def) {
    return (
      <div
        style={{
          height: compact ? "auto" : "100%",
          minHeight: compact ? 200 : 320,
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
        {/* 「滑鼠點選才載入」 (champselect/previewGate): hovering a card only
            highlights it — CLICKING is what loads the 3D model and this panel.
            The copy has to say so, or the empty stage reads as broken. */}
        點選英雄查看詳情與 3D 模型
        <br />
        <span style={{ fontSize: 11 }}>click a champion to load its profile &amp; 3D model</span>
        <br />
        <span style={{ fontSize: 10.5, marginTop: 6, display: "inline-block", opacity: 0.75 }}>
          （選擇可隨時更改，直到你按下 🔒 鎖定）
        </span>
      </div>
    );
  }

  const { title, fullName } = splitChampionName(def.name);
  const standIn = isStandInModel(def.modelKey);
  const rows = skillRows(champSelectSkillSeat(def));
  const quote = quoteEntryFor(quotes, def.id);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        // compact (phone): flow at natural height so the OUTER container scrolls;
        // desktop: fill the fixed-height card and scroll the tab body internally.
        ...(compact ? {} : { height: "100%", minHeight: 0 }),
      }}
    >
      {/* ── 3D stage ─────────────────────────────────────────────────────── */}
      <div style={{ position: "relative", height: stageHeight, flexShrink: 0 }}>
        {/* NOT keyed: StorePreviewCanvas swaps the model in the SAME Babylon
            engine on a modelKey change, so a hover preview never re-creates the
            WebGL context (only the model reloads). */}
        {/* championId (#263): the w3x art colour is per-CHAMPION, and 18 of
            them share `champ.sela` — without the id this stage shows 黑化Saber
            /貞子/黑人牙膏 in the untinted stand-in palette and only the arena
            turns them dark, which is what the owner saw. */}
        <StorePreviewCanvas modelKey={def.modelKey} championId={def.id} />
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
        {quote && <QuoteBlock entry={quote} />}
      </div>

      {/* ── tabs ─────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 4, padding: "8px 0", flexShrink: 0 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              audioSystem.unlock(); // a tap is a user gesture — kick autoplay
              audioSystem.playSfx("uiTabSwitch"); // distinct segment-switch cue
              setTab(t.id);
            }}
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

      {/* ── tab body ─────────────────────────────────────────────────────── */}
      {/* compact (phone): flow at natural height, the outer panel scrolls;
          desktop: a bounded, internally-scrolling region under the fixed stage. */}
      <div style={compact ? { paddingRight: 4 } : { flex: 1, minHeight: 0, overflowY: "auto", paddingRight: 4 }}>
        {tab === "skills" &&
          (rows.length === 0 ? (
            <div style={{ fontSize: 12, color: TEXT_DIM }}>此英雄沒有技能資料</div>
          ) : (
            <>
              {/* 「每個人應該是六種，被動也是包含 slot」 — the slot count is stated,
                  so a hero missing its 天生技 is visible instead of silently 5. */}
              <div style={{ fontSize: 10, color: TEXT_DIM, padding: "2px 0 4px" }}>
                共 {rows.length} 個技能格
                {rows.some((r) => r.slot === "PASSIVE")
                  ? "（含天生技，等級 1 起自動擁有）"
                  : "（此英雄在原地圖沒有天生技）"}
              </div>
              {rows.map((r) => (
                <SkillRowView key={`${r.slot}-${r.rawName}`} row={r} />
              ))}
            </>
          ))}
        {tab === "stats" && <StatsTab championId={def.id} />}
        {tab === "play" && <PlayTab championId={def.id} />}
        {tab === "lore" && <LoreTab championId={def.id} />}
      </div>
    </div>
  );
}
