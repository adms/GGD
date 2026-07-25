/**
 * 體素外觀對照表 — the 驗收 surface for task #231.
 *
 * All 114 champions' GENERATED looks side by side, computed at view time from
 * `/content/champions/*` and the SAME shared generator + painter the game runs.
 * Every tile shows the ACTUAL SHIPPED PIXELS (paint.ts output blitted into a
 * paper-doll elevation), never an approximation, so approving a tile here means
 * approving what the build produces.
 *
 * The coverage strip at the top is computed from the same functions the tests
 * assert on — the page cannot claim a number the build does not produce.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Panel, Btn, TextInput, Badge } from "./widgets";
import { ACCENT, DANGER, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "./theme";
import { useVoxelSkinSheet } from "../assets/useVoxelSkinSheet";
import {
  EMPTY_FILTER,
  applyFilter,
  exportOverrideStub,
  similarPairs,
  sortRows,
  type SheetFilter,
  type SheetSort,
  type SkinRow,
} from "../assets/voxelSkinSheet";
import { drawThumb } from "./voxelSkinThumb";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

/** One champion's paper doll, drawn from the real atlas bytes. */
function Thumb(props: { row: SkinRow; scale?: number }): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [ok, setOk] = useState(true);
  useEffect(() => {
    if (ref.current) setOk(drawThumb(ref.current, props.row.recipe, props.scale ?? 4));
  }, [props.row.recipe, props.scale]);
  if (!ok) {
    // honest degraded state: no 2D context → show the palette, not a blank box
    return <PaletteChips row={props.row} />;
  }
  return (
    <canvas
      ref={ref}
      style={{
        imageRendering: "pixelated",
        background: "#0b0e16",
        border: PANEL_BORDER,
        borderRadius: 4,
      }}
    />
  );
}

function PaletteChips(props: { row: SkinRow }): React.JSX.Element {
  const p = props.row.recipe.palette;
  const slots: [string, string][] = [
    ["膚", p.skin],
    ["髮", p.hair],
    ["主", p.outfitPrimary],
    ["副", p.outfitSecondary],
    ["金", p.metal],
    ["眼", p.eye],
    ["點", p.accent],
  ];
  return (
    <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
      {slots.map(([label, hex]) => (
        <span
          key={label}
          title={`${label} ${hex}`}
          style={{
            width: 14,
            height: 14,
            borderRadius: 3,
            background: hex,
            border: "1px solid rgba(255,255,255,0.14)",
          }}
        />
      ))}
    </div>
  );
}

function Chip(props: { children: React.ReactNode; color?: string }): React.JSX.Element {
  return (
    <span
      style={{
        fontSize: 10,
        padding: "1px 5px",
        borderRadius: 999,
        border: PANEL_BORDER,
        color: props.color ?? TEXT_DIM,
        whiteSpace: "nowrap",
      }}
    >
      {props.children}
    </span>
  );
}

function Tile(props: {
  row: SkinRow;
  marked: boolean;
  onToggleMark: () => void;
}): React.JSX.Element {
  const { row } = props;
  const r = row.recipe;
  return (
    <div
      style={{
        border: props.marked ? `1px solid ${WARN}` : PANEL_BORDER,
        borderRadius: 8,
        padding: 8,
        display: "flex",
        gap: 8,
        background: props.marked ? "rgba(224,161,58,0.07)" : "transparent",
        minWidth: 0,
      }}
    >
      <Thumb row={row} />
      <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ color: TEXT_MAIN, fontWeight: 700, fontSize: 13, lineHeight: 1.2 }}>
          {row.title || row.proper}
        </div>
        <div style={{ color: TEXT_DIM, fontSize: 11 }}>{row.proper}</div>
        <div style={{ color: TEXT_DIM, fontFamily: MONO, fontSize: 10 }}>{row.championId}</div>
        <PaletteChips row={row} />
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
          <Chip color={ACCENT}>{r.element}</Chip>
          {r.motifs.head !== "none" && <Chip>{r.motifs.head}</Chip>}
          {r.motifs.shoulder !== "none" && <Chip>{r.motifs.shoulder}</Chip>}
          {r.motifs.back !== "none" && <Chip>{r.motifs.back}</Chip>}
          <Chip>{r.outfit.top}</Chip>
          <Chip>{r.hair.style}</Chip>
        </div>
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap", alignItems: "center" }}>
          {row.sharedStandIn && (
            <Badge color={WARN}>替身 ×{row.modelKeyShareCount}</Badge>
          )}
          {r.preferVoxelBody && <Badge color={OK}>體素本體</Badge>}
          {row.overridden && <Badge color={GOLD}>L1 手改</Badge>}
          {row.tint && <Badge color={ACCENT}>#49 染色</Badge>}
        </div>
        <div style={{ marginTop: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          <Btn small kind={props.marked ? "danger" : "ghost"} onClick={props.onToggleMark}>
            {props.marked ? "取消待改" : "標記待改"}
          </Btn>
          <span style={{ color: TEXT_DIM, fontSize: 10, fontFamily: MONO }}>
            L{row.outfitLuminance.toFixed(2)} · {row.motifBoxes}box
          </span>
        </div>
      </div>
    </div>
  );
}

export function VoxelSkinSheetPage(): React.JSX.Element {
  const { loading, rows, stats, error, reload } = useVoxelSkinSheet();
  const [filter, setFilter] = useState<SheetFilter>(EMPTY_FILTER);
  const [sort, setSort] = useState<SheetSort>("id");
  const [grouped, setGrouped] = useState(false);
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [showExport, setShowExport] = useState(false);

  const elements = useMemo(
    () => [...new Set(rows.map((r) => r.recipe.element))].sort(),
    [rows],
  );
  const view = useMemo(() => sortRows(applyFilter(rows, filter), sort), [rows, filter, sort]);
  const similar = useMemo(() => similarPairs(rows).slice(0, 12), [rows]);

  const groups = useMemo(() => {
    if (!grouped) return null;
    const byKey = new Map<string, SkinRow[]>();
    for (const r of view) {
      const list = byKey.get(r.modelKey) ?? [];
      list.push(r);
      byKey.set(r.modelKey, list);
    }
    return [...byKey.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [view, grouped]);

  const toggleMark = (id: string): void =>
    setMarked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Panel
        title="🧱 體素外觀對照表"
        right={
          <Btn small kind="ghost" onClick={reload}>
            重新計算
          </Btn>
        }
      >
        <div style={{ color: TEXT_DIM, fontSize: 12, lineHeight: 1.7 }}>
          每個英雄的體素外觀 <b style={{ color: TEXT_MAIN }}>在你開啟本頁時即時生成</b>
          ，用的是遊戲裡同一支產生器與同一支貼圖繪製函式 — 縮圖畫的就是實際上機的像素，不是示意圖。
          外觀完全由英雄自己的身分（稱號／本名／標籤／技能特效元素／原始 w3x 剪影字）決定，
          同一個英雄在任何機器、任何版本都長一樣；沒有任何一張圖檔會被打包出貨。
        </div>
        {stats && (
          <div
            style={{
              marginTop: 10,
              display: "flex",
              gap: 14,
              flexWrap: "wrap",
              fontFamily: MONO,
              fontSize: 12,
            }}
          >
            <span style={{ color: TEXT_MAIN }}>{stats.champions} 英雄已生成</span>
            <span style={{ color: stats.collisions === 0 ? OK : DANGER }}>
              {stats.distinctLooks} 獨特外觀 · {stats.collisions} 碰撞
            </span>
            <span style={{ color: TEXT_DIM }}>鹽值升級 {stats.saltEscalations}</span>
            <span style={{ color: TEXT_DIM }}>
              配方 {(stats.recipeBytes / 1024).toFixed(1)} KB（
              {Math.round(stats.recipeBytes / Math.max(1, stats.champions))} B/英雄）
            </span>
            <span style={{ color: OK }}>出貨貼圖 {stats.shippedTextureBytes} B</span>
            <span style={{ color: TEXT_DIM }}>
              執行期圖集 {(stats.atlasBytesPerChampion / 1024).toFixed(0)} KB/英雄
            </span>
            <span style={{ color: WARN }}>替身英雄 {stats.standInChampions}</span>
            <span style={{ color: GOLD }}>L1 手改 {stats.overriddenChampions}</span>
          </div>
        )}
        {error && <div style={{ marginTop: 8, color: DANGER, fontSize: 12 }}>{error}</div>}
      </Panel>

      <Panel title="篩選 · 排序">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ minWidth: 200 }}>
            <TextInput
              value={filter.text}
              onChange={(v) => setFilter({ ...filter, text: v })}
              placeholder="搜尋 稱號 / 本名 / id / modelKey"
            />
          </div>
          <select
            value={filter.element}
            onChange={(e) => setFilter({ ...filter, element: e.target.value })}
            style={selectStyle}
          >
            <option value="">全部元素</option>
            {elements.map((el) => (
              <option key={el} value={el}>
                {el}
              </option>
            ))}
          </select>
          <select
            value={filter.attackType}
            onChange={(e) => setFilter({ ...filter, attackType: e.target.value })}
            style={selectStyle}
          >
            <option value="">近戰 + 遠程</option>
            <option value="melee">近戰</option>
            <option value="ranged">遠程</option>
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SheetSort)}
            style={selectStyle}
          >
            <option value="id">依 id</option>
            <option value="title">依稱號</option>
            <option value="element">依元素</option>
            <option value="hue">依色相（相近色相鄰，最好挑毛病）</option>
            <option value="modelKey">依 modelKey</option>
          </select>
          <Toggle
            on={filter.onlyStandIn}
            onClick={() => setFilter({ ...filter, onlyStandIn: !filter.onlyStandIn })}
          >
            只看共用替身
          </Toggle>
          <Toggle
            on={filter.onlyTinted}
            onClick={() => setFilter({ ...filter, onlyTinted: !filter.onlyTinted })}
          >
            只看 #49 染色
          </Toggle>
          <Toggle
            on={filter.onlyOverridden}
            onClick={() => setFilter({ ...filter, onlyOverridden: !filter.onlyOverridden })}
          >
            只看 L1 手改
          </Toggle>
          <Toggle on={grouped} onClick={() => setGrouped(!grouped)}>
            群組檢視（依 modelKey）
          </Toggle>
        </div>
        <div style={{ marginTop: 8, color: TEXT_DIM, fontSize: 11 }}>
          顯示 {view.length} / {rows.length}
          {marked.size > 0 && ` · 已標記待改 ${marked.size}`}
          {marked.size > 0 && (
            <>
              {" · "}
              <Btn small kind="primary" onClick={() => setShowExport(!showExport)}>
                匯出 overrides 區塊
              </Btn>
            </>
          )}
        </div>
        {showExport && marked.size > 0 && (
          <pre
            style={{
              marginTop: 8,
              maxHeight: 260,
              overflow: "auto",
              fontFamily: MONO,
              fontSize: 11,
              color: TEXT_MAIN,
              background: "#0b0e16",
              border: PANEL_BORDER,
              borderRadius: 6,
              padding: 8,
            }}
          >
            {exportOverrideStub(rows, marked, {})}
          </pre>
        )}
      </Panel>

      {similar.length > 0 && (
        <Panel title="相似度警示">
          <div style={{ color: TEXT_DIM, fontSize: 12, marginBottom: 6 }}>
            以下配對的四個主要顏色距離偏近 — 外觀簽章仍然不同（測試保證），但在戰鬥距離下可能不好分。
            這是給你挑毛病用的清單，不是錯誤。
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {similar.map((p) => (
              <div
                key={`${p.a.championId}|${p.b.championId}`}
                style={{ fontSize: 12, color: TEXT_MAIN, fontFamily: MONO }}
              >
                <span style={{ color: WARN }}>Δ{p.distance.toFixed(3)}</span> {p.a.fullName} (
                {p.a.championId}) ↔ {p.b.fullName} ({p.b.championId})
              </div>
            ))}
          </div>
        </Panel>
      )}

      {loading && <Panel>計算中…</Panel>}

      {!loading && !grouped && (
        <Panel title="全部英雄">
          <div style={gridStyle}>
            {view.map((row) => (
              <Tile
                key={row.championId}
                row={row}
                marked={marked.has(row.championId)}
                onToggleMark={() => toggleMark(row.championId)}
              />
            ))}
          </div>
        </Panel>
      )}

      {!loading &&
        grouped &&
        groups?.map(([key, list]) => (
          <Panel
            key={key}
            title={`${key} · ${list.length} 位英雄`}
            right={
              list.length > 1 ? (
                <Badge color={new Set(list.map((r) => r.signature)).size === list.length ? OK : DANGER}>
                  {new Set(list.map((r) => r.signature)).size} 種外觀
                </Badge>
              ) : undefined
            }
          >
            <div style={gridStyle}>
              {list.map((row) => (
                <Tile
                  key={row.championId}
                  row={row}
                  marked={marked.has(row.championId)}
                  onToggleMark={() => toggleMark(row.championId)}
                />
              ))}
            </div>
          </Panel>
        ))}
    </div>
  );
}

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
  gap: 10,
};

const selectStyle: React.CSSProperties = {
  background: "#0b0e16",
  color: TEXT_MAIN,
  border: PANEL_BORDER,
  borderRadius: 6,
  padding: "6px 8px",
  fontSize: 12,
};

function Toggle(props: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Btn small kind={props.on ? "primary" : "ghost"} onClick={props.onClick}>
      {props.children}
    </Btn>
  );
}
