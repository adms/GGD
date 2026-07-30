/**
 * BattlefieldIntelPanel — 商店裡的「全場戰況」對照表 (GH#220)。
 *
 * owner 2026-07-30：「在商店要能看到所有人**包括敵方**的等級 生命 攻速/AP/AD 裝備
 * 作為制定反打參考 增加策略性」
 *
 * 這個檔案**沒有任何數學**。每一格印的字都來自兩支既有的共用函式：
 *   · 數值 ← `battlefieldIntel.intelStatsOf`（＝商店自己那頁的 `computeStatBlock`）
 *   · 格式 ← `statDisplay.formatStatValue`（＝ `StatPanel` 用的同一支）
 * 兩支都共用之後，「我看敵方 S 的攻速」與「S 自己面板上的攻速」是同一個字串，
 * 而不是兩個各自四捨五入的近似值。欄位標題也讀 `statLabel`，所以連「攻擊速度」
 * 這四個字都不會有第二個版本。
 *
 * 裝備格沿用 #140 的 hover 詳情（`buildItemRow` → `Tooltip`），但**沒有賣出動作**
 * ——這是一張對照表，不是別人的背包。
 *
 * 為什麼敵方那幾列可能是一排「—」：見 `battlefieldIntel.ts` §2。第一回合沒有封存，
 * 面板就明說沒有，不會偷偷退回即時值。
 */
import { Items } from "@ggd/shared/sim/content/registry";
import { INVENTORY_SLOTS } from "@ggd/shared/sim/economy/shop";
import { Stat } from "@ggd/shared/sim/stats/statTypes";
import type { ItemId } from "@ggd/shared/ids";
import { championIconUrl } from "../icons";
import { GlyphTile } from "../components/GlyphTile";
import { Tooltip } from "../components/Tooltip";
import { PANEL_BORDER, TEXT_DIM, TEXT_MAIN, teamCss } from "../theme";
import { formatStatValue, statLabel } from "./statDisplay";
import { buildItemRow, itemDisplayName, type RowItem } from "./itemStats";
import type { BattlefieldIntelConfig, IntelRow } from "./battlefieldIntel";
import { intelFreshnessNote } from "./battlefieldIntel";

const ACCENT = "#f2a13c";
/** 沒有資料的那一格。**不是 0** —— 0 是一個會被拿去做決策的數字。 */
export const NO_DATA = "—";

/** 面板的欄位定義。順序＝ owner 列的順序：等級 生命 攻速 AP AD。 */
export interface IntelColumn {
  readonly key: "level" | "health" | "attackSpeed" | "abilityPower" | "attackDamage";
  readonly label: string;
  readonly width: number;
  /** 這一欄要不要印，讀後台設定。 */
  readonly on: (c: BattlefieldIntelConfig) => boolean;
  readonly text: (row: IntelRow) => string;
}

const COLUMNS: readonly IntelColumn[] = [
  {
    key: "level",
    label: "等級",
    width: 40,
    on: (c) => c.showLevel,
    text: (r) => (r.known && r.level > 0 ? String(r.level) : NO_DATA),
  },
  {
    key: "health",
    label: statLabel(Stat.MaxHealth),
    width: 62,
    on: (c) => c.showHealth,
    text: (r) => (r.stats ? formatStatValue(Stat.MaxHealth, r.stats.maxHealth) : NO_DATA),
  },
  {
    key: "attackSpeed",
    label: statLabel(Stat.AttackSpeed),
    width: 62,
    on: (c) => c.showAttackSpeed,
    text: (r) => (r.stats ? formatStatValue(Stat.AttackSpeed, r.stats.attackSpeed) : NO_DATA),
  },
  {
    key: "abilityPower",
    label: statLabel(Stat.AbilityPower),
    width: 62,
    on: (c) => c.showAbilityPower,
    text: (r) => (r.stats ? formatStatValue(Stat.AbilityPower, r.stats.abilityPower) : NO_DATA),
  },
  {
    key: "attackDamage",
    label: statLabel(Stat.AttackDamage),
    width: 62,
    on: (c) => c.showAttackDamage,
    text: (r) => (r.stats ? formatStatValue(Stat.AttackDamage, r.stats.attackDamage) : NO_DATA),
  },
];

/** 出現在面板上的欄位（後台關掉的不佔位）。 */
export function visibleIntelColumns(config: BattlefieldIntelConfig): readonly IntelColumn[] {
  return COLUMNS.filter((c) => c.on(config));
}

const ITEM_TILE = 24;
/** 名稱欄的最小寬度。有了它，橫向捲動時名字不會被壓成一個字。 */
const NAME_COL = 108;

/**
 * 一格裝備。
 *
 * ⚠️ **`GlyphTile` 自己不會印名字** —— 它只畫圖，而且整塊 `aria-hidden`，所以一個
 * 只有 GlyphTile 的格子在畫面上、在無障礙樹上、在測試裡都是「一個沒有名字的方
 * 塊」。#140 的 hover 詳情要滑上去才看得到，手把與讀屏使用者永遠看不到（這正是
 * #252 在三選一卡片上抓到的同一個洞）。
 *
 * 所以外面這一層 wrapper 才是「這一格是什麼」的真正載體：
 *   · `aria-label` / `role="img"` —— 無障礙名稱；
 *   · `title` —— 沒有滑鼠 hover 也拿得到的原生退路；
 *   · `data-intel-item` —— 測試讀的那一個（斷言讀的是**渲染出來的東西**）。
 */
function ItemSlot(props: { itemId: string }): React.JSX.Element {
  const { itemId } = props;
  if (!itemId) {
    return (
      <div
        data-intel-item=""
        style={{
          width: ITEM_TILE,
          height: ITEM_TILE,
          borderRadius: 5,
          border: "1px dashed rgba(120,140,190,0.25)",
          background: "rgba(255,255,255,0.02)",
        }}
      />
    );
  }
  const def = Items.tryGet(itemId as ItemId);
  // #202: registry miss degrades to a readable placeholder, never the raw id.
  const name = itemDisplayName(def?.name, itemId);
  const row = def ? buildItemRow(def as unknown as RowItem, null) : null;
  const body = [
    row?.effect ? `✦ ${row.effect}` : "",
    row?.claims && row.claims.length > 0 ? row.claims.join(" · ") : "",
    row?.lore ?? "",
  ]
    .filter(Boolean)
    .join("\n");
  return (
    <Tooltip title={name} body={body || undefined} style={{ display: "block" }}>
      <div data-intel-item={itemId} role="img" aria-label={name} title={name}>
        <GlyphTile seed={itemId} icon={def?.icon ?? null} label={name} size={ITEM_TILE} radius={5} />
      </div>
    </Tooltip>
  );
}

/**
 * 一列。`self` 加一條左側亮邊與 tint 底色，因為玩家要拿自己去比對面 —— 找不到
 * 自己那一列的對照表沒有用。
 */
function IntelRowView(props: {
  row: IntelRow;
  columns: readonly IntelColumn[];
  showItems: boolean;
}): React.JSX.Element {
  const { row, columns, showItems } = props;
  const tint = teamCss(row.teamId);
  return (
    <div
      data-intel-seat={row.seatId}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "3px 4px",
        borderLeft: `3px solid ${tint}`,
        borderRadius: 3,
        background: row.self ? "rgba(242,161,60,0.10)" : "transparent",
        opacity: row.known ? 1 : 0.65,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: NAME_COL }}>
        <GlyphTile
          seed={row.championId}
          src={championIconUrl(row.championId)}
          label={row.name}
          size={22}
          radius={4}
        />
        <span
          style={{
            color: tint,
            fontSize: 11,
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
          }}
        >
          {row.name}
        </span>
        {row.self && <span style={{ fontSize: 9, color: ACCENT, flexShrink: 0 }}>你</span>}
      </div>
      {columns.map((c) => (
        <span
          key={c.key}
          data-intel-cell={c.key}
          style={{
            width: c.width,
            flexShrink: 0,
            textAlign: "right",
            fontSize: 11,
            fontVariantNumeric: "tabular-nums",
            color: row.known ? TEXT_MAIN : TEXT_DIM,
          }}
        >
          {c.text(row)}
        </span>
      ))}
      {showItems && (
        <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
          {Array.from({ length: INVENTORY_SLOTS }, (_, i) => (
            <ItemSlot key={i} itemId={row.items[i] ?? ""} />
          ))}
        </div>
      )}
    </div>
  );
}

export interface BattlefieldIntelPanelProps {
  rows: readonly IntelRow[];
  config: BattlefieldIntelConfig;
  /** 封存的是第幾回合結束的樣子（`roundIntelLedger.sealedRoundNumber()`）。 */
  sealedRound: number;
}

/**
 * EXPORTED 給 `battlefieldIntel.test.ts`：敵方那幾列的數字是用**server-render 這個
 * 元件、再從 markup 讀字串**來斷言的，不是讀 store 也不是比函式回傳值（第⑦種與
 * 第⑤種故障）。
 */
export function BattlefieldIntelPanel(props: BattlefieldIntelPanelProps): React.JSX.Element | null {
  const { rows, config, sealedRound } = props;
  if (!config.enabled) return null;
  const columns = visibleIntelColumns(config);
  // 裝備那一欄的標題：只要**有任何一列**會畫出裝備格就要有標題。同隊永遠看得到
  // 自己人的裝備，所以「後台關掉敵方裝備」不能把標題也一起關掉 —— 那會讓同隊那
  // 六格變成沒有欄名的一排圖。
  const anyItems = config.showEnemyItems || rows.some((r) => r.ally);

  return (
    <div
      data-panel="battlefield-intel"
      style={{
        border: PANEL_BORDER,
        borderRadius: 8,
        padding: "6px 8px",
        background: "rgba(20,16,10,0.5)",
        display: "flex",
        flexDirection: "column",
        gap: 3,
        minHeight: 0,
        // 這是一張對照表：欄位寬度是固定的，窄螢幕上必須**自己橫向捲**，不能把
        // 數字擠成兩行 —— 對不齊的對照表比沒有對照表更難用。
        overflow: "auto",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: "bold", color: ACCENT }}>全場戰況</span>
        {/* 揭露：資料是哪一刻的。少了這一行，玩家會把封存當即時。 */}
        <span style={{ fontSize: 10, color: TEXT_DIM }}>{intelFreshnessNote(config, sealedRound)}</span>
        <span style={{ fontSize: 9, color: TEXT_DIM }}>數值為戰鬥實際值</span>
      </div>

      {/* 表身。`minWidth: max-content` 讓它撐到自然寬度，外層才捲得動。 */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 3,
          minWidth: "max-content",
        }}
      >
        {/* 欄位標題 —— 名稱欄留白，其餘與資料列同寬，所以欄位是對齊的。 */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px 0 7px" }}>
          <span style={{ flex: 1, minWidth: NAME_COL, fontSize: 9, color: TEXT_DIM }}>英雄</span>
          {columns.map((c) => (
            <span
              key={c.key}
              style={{ width: c.width, flexShrink: 0, textAlign: "right", fontSize: 9, color: TEXT_DIM }}
            >
              {c.label}
            </span>
          ))}
          {anyItems && (
            <span
              style={{
                width: INVENTORY_SLOTS * ITEM_TILE + (INVENTORY_SLOTS - 1) * 3,
                flexShrink: 0,
                fontSize: 9,
                color: TEXT_DIM,
              }}
            >
              裝備
            </span>
          )}
        </div>

        {rows.map((row) => (
          <IntelRowView
            key={row.seatId}
            row={row}
            columns={columns}
            // 同隊永遠看得到裝備；敵方的那 6 格由後台決定。
            showItems={row.ally || config.showEnemyItems}
          />
        ))}

        {rows.length === 0 && (
          <div style={{ fontSize: 10, color: TEXT_DIM, padding: "4px 6px" }}>尚無其他玩家資料</div>
        )}
      </div>
    </div>
  );
}
