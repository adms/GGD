/**
 * 傳說武器三選一 (`config/arena-rules.json` 的 `itemDraft`, GH#249) — the view.
 *
 * All rules live in `../itemDraft`, which is where the tests are. This file only
 * renders and wires the save.
 *
 * ⚠️ 存檔一定送**整份 arena-rules**。頁面因此拒絕在讀不到現行文件時儲存 ——
 * 替代方案是用一份猜出來的文件覆蓋線上，那會把回合排程、殭屍波、守護塔全部刪掉。
 */
import { useEffect, useMemo, useState } from "react";
import { Panel, Btn } from "./widgets";
import { ACCENT, DANGER, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "./theme";
import { getOverlayDoc, getShippedDoc, putOverlayDoc } from "../api";
import {
  ARENA_RULES_COLLECTION,
  ARENA_RULES_DOC_ID,
  ITEM_DRAFT_FIELD_ORDER,
  KNOWN_CRAFT_ROLES,
  ITEM_DRAFT_GROUP_ZH,
  ITEM_DRAFT_LABELS,
  KNOWN_LOOT_TABLES,
  MAX_DRAWS_MAX,
  MAX_DRAWS_MIN,
  SHIPPED_ITEM_DRAFT,
  SHORT_POOL_MODE_OPTIONS,
  changedFields,
  extractItemDraft,
  formFromConfig,
  isShortPoolMode,
  itemDraftFromForm,
  itemDraftSummary,
  patchItemDraft,
  readOfferCount,
  validateItemDraftForm,
  RETIRED_TABLES_LABEL,
  RETIRED_TABLES_MAX,
  SHIPPED_RETIRED_LOOT_TABLES,
  formatRetiredTables,
  parseRetiredTables,
  patchRetiredTables,
  readRetiredTables,
  retiredTablesSummary,
  validateRetiredTables,
  DRAFT_CONFLICT_LABEL,
  DRAFT_CONFLICT_OPTIONS,
  SHIPPED_DRAFT_CONFLICT,
  draftConflictSummary,
  isDraftConflict,
  patchDraftConflict,
  readDraftConflict,
  LEGENDARY_SHELF_LABEL,
  PRICE_MULTIPLIER_LABEL,
  PRICE_MULTIPLIER_MAX,
  PRICE_MULTIPLIER_MIN,
  RANDOM_ONLY_TABLES_LABEL,
  RANDOM_ONLY_TABLES_MAX,
  SELL_REFUND_PCT_LABEL,
  SELL_REFUND_PCT_MAX,
  SELL_REFUND_PCT_MIN,
  SHIPPED_LEGENDARY_SHELF,
  legendaryShelfSummary,
  patchLegendaryShelf,
  readLegendaryShelf,
  validateLegendaryShelf,
  type ItemDraftField,
  type ItemDraftForm,
} from "../itemDraft";
import type { DraftConflict, LegendaryShelfConfig } from "@ggd/shared/content/schema/config";
import {
  GRAIL_DRAFT_FIELD_ORDER,
  GRAIL_DRAFT_LABELS,
  LEGACY_POOL_OPTIONS,
  PREFERENCE_BONUS_MAX,
  PREFERENCE_BONUS_MIN,
  SHIPPED_GRAIL_DRAFT,
  changedGrailFields,
  extractGrailDraft,
  grailDraftSummary,
  patchGrailDraft,
} from "../grailDraft";
import type { GrailDraftRules } from "@ggd/shared/sim/economy/grailVocabulary";
// GH#355 —— 通用引擎的**第四種**非純量形狀（物件陣列）。規則在 ../configRows，
// 這一頁只排版；欄位結構全部由那支從出貨 Zod 推導，⛔ 這裡沒有第二份界。
import {
  addRow,
  moveRow,
  patchRows,
  removeRow,
  rowColumns,
  rowsFrom,
  setCell,
  validateRows,
  type ConfigRowsSpec,
  type RowDraft,
} from "../configRows";
import {
  AUGMENT_TIERS_SPEC,
  DISADVANTAGE_FIELD_ORDER,
  DISADVANTAGE_LABELS,
  SHIPPED_AUGMENT_TIERS,
  SHIPPED_DISADVANTAGE_WEIGHTS,
  SHIPPED_WEAPON_TIERS,
  WEAPON_TIERS_SPEC,
  disadvantageSummary,
  patchDisadvantageWeights,
  readDisadvantageWeights,
  validateDisadvantage,
} from "../tierRows";
import type { DisadvantageWeights } from "@ggd/shared/content/schema/config";

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function ItemDraftPage(): JSX.Element {
  const [baseDoc, setBaseDoc] = useState<Record<string, unknown> | null>(null);
  const [form, setForm] = useState<ItemDraftForm>(formFromConfig(SHIPPED_ITEM_DRAFT));
  /** 退場清單是 arena-rules 的頂層欄位，不是 `itemDraft` 區塊的一格 —— 見 itemDraft.ts。 */
  const [retiredText, setRetiredText] = useState(formatRetiredTables(SHIPPED_RETIRED_LOOT_TABLES));
  const [offerCount, setOfferCount] = useState(readOfferCount(null));
  /** #340 撞卡裁決 —— 同樣是 arena-rules 的頂層欄位。 */
  const [conflict, setConflict] = useState<DraftConflict>(SHIPPED_DRAFT_CONFLICT);
  /** ⚔️ 寶具直接販售（owner 2026-08-17）—— 也是頂層欄位。 */
  const [shelf, setShelf] = useState<LegendaryShelfConfig>({ ...SHIPPED_LEGENDARY_SHELF });
  /** 🏆 聖杯顯現 —— arena-rules 的 `grailDraft` 區塊（見 ../grailDraft.ts）。 */
  const [grail, setGrail] = useState<GrailDraftRules>({ ...SHIPPED_GRAIL_DRAFT });
  /** ⭐ GH#355 —— 兩張階級升級表與劣勢權重，全部是 arena-rules 的頂層欄位。 */
  const [weaponRows, setWeaponRows] = useState<RowDraft[]>(() =>
    rowsFrom({ weaponTiers: SHIPPED_WEAPON_TIERS }, WEAPON_TIERS_SPEC),
  );
  const [augmentRows, setAugmentRows] = useState<RowDraft[]>(() =>
    rowsFrom({ augmentTiers: SHIPPED_AUGMENT_TIERS }, AUGMENT_TIERS_SPEC),
  );
  const [disadv, setDisadv] = useState<DisadvantageWeights>({ ...SHIPPED_DISADVANTAGE_WEIGHTS });
  const [busy, setBusy] = useState(false);
  const [apiErr, setApiErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        // LIVE FIRST — the overlay is what the shard actually loads.
        let full = (await getOverlayDoc(ARENA_RULES_COLLECTION, ARENA_RULES_DOC_ID)) as
          | Record<string, unknown>
          | null;
        if (!full) {
          const shipped = await getShippedDoc(ARENA_RULES_COLLECTION, ARENA_RULES_DOC_ID);
          if (shipped.present && shipped.doc) full = shipped.doc as Record<string, unknown>;
        }
        if (!full) {
          setApiErr("讀不到現行的 arena-rules 文件 —— 這一頁在讀到之前不會儲存（避免覆蓋掉回合排程）");
          return;
        }
        setBaseDoc(full);
        setOfferCount(readOfferCount(full));
        setRetiredText(formatRetiredTables(readRetiredTables(full)));
        setConflict(readDraftConflict(full));
        setShelf(readLegendaryShelf(full));
        setGrail(extractGrailDraft(full));
        // ⚠️ 這份文件**沒有**這兩個鍵時要退回出貨值，⛔ 不是畫成空表 —— 引擎那一側
        // 走的是 `?? DEFAULT_*`，畫成空表會讓後台說一件遊戲裡沒有在做的事。
        const wt = rowsFrom(full, WEAPON_TIERS_SPEC);
        setWeaponRows(wt.length > 0 ? wt : rowsFrom({ weaponTiers: SHIPPED_WEAPON_TIERS }, WEAPON_TIERS_SPEC));
        const at = rowsFrom(full, AUGMENT_TIERS_SPEC);
        setAugmentRows(
          at.length > 0 ? at : rowsFrom({ augmentTiers: SHIPPED_AUGMENT_TIERS }, AUGMENT_TIERS_SPEC),
        );
        setDisadv(readDisadvantageWeights(full));
        const cfg = extractItemDraft(full);
        if (cfg) setForm(formFromConfig(cfg));
      } catch (err) {
        setApiErr(errText(err));
      }
    })();
  }, []);

  const errors = useMemo(() => validateItemDraftForm(form), [form]);
  const errorFor = (field: ItemDraftField): string | null =>
    errors.find((e) => e.field === field)?.error ?? null;
  const preview = errors.length === 0 ? itemDraftFromForm(form) : null;
  const changed = preview ? changedFields(preview) : [];
  const table = form.fallbackTable.trim();
  const unknownTable = table !== "" && !KNOWN_LOOT_TABLES.includes(table);
  const retiredErr = useMemo(
    () => validateRetiredTables(retiredText, form.fallbackTable),
    [retiredText, form.fallbackTable],
  );
  const retiredIds = parseRetiredTables(retiredText);
  const shelfErr = useMemo(() => validateLegendaryShelf(shelf), [shelf]);
  const weaponVerdict = useMemo(() => validateRows(weaponRows, WEAPON_TIERS_SPEC), [weaponRows]);
  const augmentVerdict = useMemo(() => validateRows(augmentRows, AUGMENT_TIERS_SPEC), [augmentRows]);
  const disadvErrs = useMemo(() => validateDisadvantage(disadv), [disadv]);
  const tiersOk =
    weaponVerdict.value !== null &&
    augmentVerdict.value !== null &&
    Object.keys(disadvErrs).length === 0;

  const save = async (): Promise<void> => {
    if (!preview || !baseDoc || retiredErr || shelfErr) return;
    if (weaponVerdict.value === null || augmentVerdict.value === null) return;
    if (Object.keys(disadvErrs).length > 0) return;
    setBusy(true);
    setApiErr(null);
    try {
      // 每個 patch 疊在**同一份基底文件**上，一次 PUT。分次寫的話，後一次會
      // 用前一次之前的基底覆蓋回去 —— 那正是覆蓋層存整份文件的那個陷阱。
      const withBlocks = patchLegendaryShelf(
        patchDraftConflict(
          patchGrailDraft(patchRetiredTables(patchItemDraft(baseDoc, preview), retiredIds), grail),
          conflict,
        ),
        shelf,
      );
      const next = patchDisadvantageWeights(
        patchRows(
          patchRows(withBlocks, WEAPON_TIERS_SPEC, weaponVerdict.value),
          AUGMENT_TIERS_SPEC,
          augmentVerdict.value,
        ),
        disadv,
      );
      const head = await putOverlayDoc(ARENA_RULES_COLLECTION, ARENA_RULES_DOC_ID, next);
      setBaseDoc(next);
      setFlash(`✓ 已寫入耐久覆蓋層（generation ${head.generation}）`);
    } catch (err) {
      setFlash(null);
      setApiErr(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const resetToShipped = (): void => {
    setForm(formFromConfig(SHIPPED_ITEM_DRAFT));
    setRetiredText(formatRetiredTables(SHIPPED_RETIRED_LOOT_TABLES));
    setConflict(SHIPPED_DRAFT_CONFLICT);
    setShelf({ ...SHIPPED_LEGENDARY_SHELF });
    setGrail({ ...SHIPPED_GRAIL_DRAFT });
    setWeaponRows(rowsFrom({ weaponTiers: SHIPPED_WEAPON_TIERS }, WEAPON_TIERS_SPEC));
    setAugmentRows(rowsFrom({ augmentTiers: SHIPPED_AUGMENT_TIERS }, AUGMENT_TIERS_SPEC));
    setDisadv({ ...SHIPPED_DISADVANTAGE_WEIGHTS });
    setFlash(null);
  };

  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "9px 10px",
    border: `1px solid ${PANEL_BORDER}`,
    borderRadius: 4,
    fontSize: 13,
    marginBottom: 8,
  };

  return (
    <Panel title="傳說武器三選一">
      <p style={{ color: TEXT_DIM, fontSize: 13, lineHeight: 1.7, margin: "0 0 6px" }}>
        每回合的<b style={{ color: GOLD }}>免費傳說武器卡</b>。卡片張數與能力三選一共用
        <code> offerCount </code>（見下方唯讀那一列），這一頁調的是
        <b style={{ color: TEXT_MAIN }}>候選武器不夠時怎麼辦</b>。
      </p>
      <p style={{ color: TEXT_DIM, fontSize: 13, lineHeight: 1.7, margin: "0 0 14px" }}>
        ⚠️ <b style={{ color: ACCENT }}>「三選一只跳出一張」那個缺陷不在這一頁</b>（GH#249）。
        那是抽卡<b style={{ color: TEXT_MAIN }}>順序</b>的問題 —— 舊版先抽三張、再把白名單沒開的
        刪掉，所以白名單比獎池小的時候卡片會隨機縮水。它已經修在程式裡（白名單改在抽之前過濾），
        <b style={{ color: OK }}>不是一個可以關掉的開關</b>。這一頁只管「候選真的不足」那種情況。
      </p>

      <div style={{ color: TEXT_MAIN, fontSize: 13, marginBottom: 12 }}>
        {preview ? itemDraftSummary(preview, offerCount) : "表單有欄位待修正"}
      </div>

      {flash && <div style={{ color: OK, fontSize: 13, marginBottom: 10 }}>{flash}</div>}
      {apiErr && <div style={{ color: DANGER, fontSize: 13, marginBottom: 10 }}>{apiErr}</div>}

      {/* 唯讀：真正的欄位在 arena-rules 頂層，且與能力三選一共用 */}
      <div style={{ ...rowStyle, opacity: 0.75 }}>
        <span style={{ color: TEXT_MAIN, minWidth: 150 }}>卡片張數</span>
        <code style={{ color: TEXT_DIM, fontSize: 11, minWidth: 150 }}>offerCount</code>
        <span style={{ color: TEXT_MAIN }}>{offerCount}</span>
        <span style={{ color: TEXT_DIM, fontSize: 11, flex: 1 }}>
          唯讀 —— 它是 arena-rules 的頂層欄位，而且<b>能力三選一與武器三選一共用同一格</b>。
          在這裡再畫一個輸入框，會讓人以為只改到了武器卡。
        </span>
      </div>

      {(["policy", "safety"] as const).map((group) => (
        <div key={group} style={{ marginTop: 14 }}>
          <div style={{ color: ACCENT, fontSize: 12, marginBottom: 6 }}>{ITEM_DRAFT_GROUP_ZH[group]}</div>

          {ITEM_DRAFT_FIELD_ORDER.filter((f) => ITEM_DRAFT_LABELS[f].group === group).map((field) => {
            const label = ITEM_DRAFT_LABELS[field];
            const err = errorFor(field);
            const dirty = changed.includes(field);
            return (
              <div key={field} style={rowStyle}>
                <span style={{ color: TEXT_MAIN, minWidth: 150 }}>
                  {label.zh}
                  {dirty && <span style={{ color: GOLD, fontSize: 11 }}> ●</span>}
                </span>
                <code style={{ color: TEXT_DIM, fontSize: 11, minWidth: 150 }}>{field}</code>
                <div style={{ flex: 1 }}>
                  {field === "shortPoolMode" && (
                    <select
                      aria-label={label.zh}
                      data-field="shortPoolMode"
                      value={form.shortPoolMode}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (isShortPoolMode(v)) setForm({ ...form, shortPoolMode: v });
                      }}
                      style={{
                        padding: "4px 6px",
                        background: "transparent",
                        color: TEXT_MAIN,
                        border: `1px solid ${PANEL_BORDER}`,
                        borderRadius: 3,
                      }}
                    >
                      {SHORT_POOL_MODE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.zh}
                        </option>
                      ))}
                    </select>
                  )}
                  {field === "fallbackTable" && (
                    <input
                      aria-label={label.zh}
                      data-field="fallbackTable"
                      value={form.fallbackTable}
                      placeholder="留空 = 沒有備援"
                      onChange={(e) => setForm({ ...form, fallbackTable: e.target.value })}
                      style={{
                        width: 220,
                        padding: "4px 6px",
                        background: "transparent",
                        color: err ? DANGER : TEXT_MAIN,
                        border: `1px solid ${err ? DANGER : PANEL_BORDER}`,
                        borderRadius: 3,
                      }}
                    />
                  )}
                  {field === "maxDraws" && (
                    <input
                      aria-label={label.zh}
                      data-field="maxDraws"
                      value={form.maxDrawsText}
                      inputMode="numeric"
                      onChange={(e) => setForm({ ...form, maxDrawsText: e.target.value })}
                      style={{
                        width: 110,
                        padding: "4px 6px",
                        background: "transparent",
                        color: err ? DANGER : TEXT_MAIN,
                        border: `1px solid ${err ? DANGER : PANEL_BORDER}`,
                        borderRadius: 3,
                        textAlign: "right",
                      }}
                    />
                  )}

                  {field === "excludedCraftRoles" && (
                    <input
                      aria-label={label.zh}
                      data-field="excludedCraftRoles"
                      value={form.excludedCraftRolesText}
                      placeholder="token, service"
                      onChange={(e) => setForm({ ...form, excludedCraftRolesText: e.target.value })}
                      style={{
                        width: "100%",
                        padding: "4px 6px",
                        background: "transparent",
                        color: err ? DANGER : TEXT_MAIN,
                        border: `1px solid ${err ? DANGER : PANEL_BORDER}`,
                        borderRadius: 3,
                      }}
                    />
                  )}

                  <div style={{ color: TEXT_DIM, fontSize: 11, marginTop: 4, lineHeight: 1.6 }}>
                    {label.note}
                  </div>
                  {field === "shortPoolMode" && (
                    <div style={{ color: TEXT_DIM, fontSize: 11, marginTop: 3, lineHeight: 1.6 }}>
                      {SHORT_POOL_MODE_OPTIONS.find((o) => o.value === form.shortPoolMode)?.note}
                    </div>
                  )}
                  {field === "fallbackTable" && (
                    <div style={{ color: TEXT_DIM, fontSize: 11, marginTop: 3 }}>
                      出貨樹裡的獎池：{KNOWN_LOOT_TABLES.join(" · ")}
                    </div>
                  )}
                  {field === "maxDraws" && (
                    <div style={{ color: TEXT_DIM, fontSize: 11, marginTop: 3 }}>
                      合法範圍 {MAX_DRAWS_MIN}–{MAX_DRAWS_MAX} · 出貨值 {SHIPPED_ITEM_DRAFT.maxDraws}
                    </div>
                  )}
                  {field === "excludedCraftRoles" && (
                    <div style={{ color: TEXT_DIM, fontSize: 11, marginTop: 3 }}>
                      出貨樹裡的角色：{KNOWN_CRAFT_ROLES.join(" · ")} · 出貨值{" "}
                      {SHIPPED_ITEM_DRAFT.excludedCraftRoles.join("、") || "（不排除任何角色）"}
                    </div>
                  )}
                  {err && <div style={{ color: DANGER, fontSize: 12, marginTop: 4 }}>{err}</div>}
                  {field === "fallbackTable" && !err && unknownTable && (
                    <div style={{ color: GOLD, fontSize: 12, marginTop: 4 }}>
                      ⚠️ 出貨樹裡沒有 <code>{table}</code> 這張獎池 —— 借不到任何東西時會退化成發短卡。
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {/* 退場的獎池 —— arena-rules 的頂層欄位，不是 itemDraft 區塊的一格 */}
      <div style={{ marginTop: 14 }}>
        <div style={{ color: ACCENT, fontSize: 12, marginBottom: 6 }}>
          {ITEM_DRAFT_GROUP_ZH.retire}
        </div>
        <div style={rowStyle}>
          <span style={{ color: TEXT_MAIN, minWidth: 150 }}>{RETIRED_TABLES_LABEL.zh}</span>
          <code style={{ color: TEXT_DIM, fontSize: 11, minWidth: 150 }}>retiredLootTables</code>
          <div style={{ flex: 1 }}>
            <input
              aria-label={RETIRED_TABLES_LABEL.zh}
              data-field="retiredLootTables"
              value={retiredText}
              placeholder="留空 = 沒有任何獎池退場"
              onChange={(e) => setRetiredText(e.target.value)}
              style={{
                width: 340,
                padding: "4px 6px",
                background: "transparent",
                color: retiredErr ? DANGER : TEXT_MAIN,
                border: `1px solid ${retiredErr ? DANGER : PANEL_BORDER}`,
                borderRadius: 3,
              }}
            />
            <div style={{ color: TEXT_DIM, fontSize: 11, marginTop: 4, lineHeight: 1.6 }}>
              {RETIRED_TABLES_LABEL.note}
            </div>
            <div style={{ color: TEXT_DIM, fontSize: 11, marginTop: 3 }}>
              逗號分隔 · 最多 {RETIRED_TABLES_MAX} 張 · 出貨值{" "}
              {SHIPPED_RETIRED_LOOT_TABLES.join("、")}（owner 2026-08-01 裁定「退場」）
            </div>
            {retiredErr && <div style={{ color: DANGER, fontSize: 12, marginTop: 4 }}>{retiredErr}</div>}
            {!retiredErr && (
              <div style={{ color: GOLD, fontSize: 12, marginTop: 4 }}>
                {retiredTablesSummary(retiredIds)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* #340 撞卡裁決 —— 同樣是 arena-rules 的頂層欄位，不是 itemDraft 區塊的一格 */}
      <div style={{ marginTop: 14 }}>
        <div style={{ color: ACCENT, fontSize: 12, marginBottom: 6 }}>
          {ITEM_DRAFT_GROUP_ZH.conflict}
        </div>
        <div style={rowStyle}>
          <span style={{ color: TEXT_MAIN, minWidth: 150 }}>{DRAFT_CONFLICT_LABEL.zh}</span>
          <code style={{ color: TEXT_DIM, fontSize: 11, minWidth: 150 }}>draftConflict</code>
          <div style={{ flex: 1 }}>
            <select
              aria-label={DRAFT_CONFLICT_LABEL.zh}
              data-field="draftConflict"
              value={conflict}
              onChange={(e) => {
                const v = e.target.value;
                if (isDraftConflict(v)) setConflict(v);
              }}
              style={{
                padding: "4px 6px",
                background: "transparent",
                color: TEXT_MAIN,
                border: `1px solid ${PANEL_BORDER}`,
                borderRadius: 3,
              }}
            >
              {DRAFT_CONFLICT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.zh}
                </option>
              ))}
            </select>
            <div style={{ color: TEXT_DIM, fontSize: 11, marginTop: 4, lineHeight: 1.6 }}>
              {DRAFT_CONFLICT_LABEL.note}
            </div>
            <div style={{ color: GOLD, fontSize: 12, marginTop: 4 }}>{draftConflictSummary(conflict)}</div>
          </div>
        </div>
      </div>

      {/* ⚔️ 寶具直接販售 —— arena-rules 的頂層 `legendaryShelf`（owner 2026-08-17） */}
      <div style={{ marginTop: 14 }}>
        <div style={{ color: ACCENT, fontSize: 12, marginBottom: 6 }}>
          {ITEM_DRAFT_GROUP_ZH.shelf}
        </div>
        <div style={rowStyle}>
          <span style={{ color: TEXT_MAIN, minWidth: 150 }}>{LEGENDARY_SHELF_LABEL.zh}</span>
          <code style={{ color: TEXT_DIM, fontSize: 11, minWidth: 150 }}>legendaryShelf.open</code>
          <div style={{ flex: 1 }}>
            <label style={{ color: TEXT_MAIN, fontSize: 13, cursor: "pointer" }}>
              <input
                type="checkbox"
                aria-label={LEGENDARY_SHELF_LABEL.zh}
                data-field="legendaryShelfOpen"
                checked={shelf.open}
                onChange={(e) => setShelf({ ...shelf, open: e.target.checked })}
                style={{ marginRight: 6 }}
              />
              {shelf.open ? "上架（出貨值）" : "不上架"}
            </label>
            <div style={{ color: TEXT_DIM, fontSize: 11, marginTop: 4, lineHeight: 1.6 }}>
              {LEGENDARY_SHELF_LABEL.note}
            </div>
          </div>
        </div>
        <div style={rowStyle}>
          <span style={{ color: TEXT_MAIN, minWidth: 150 }}>{PRICE_MULTIPLIER_LABEL.zh}</span>
          <code style={{ color: TEXT_DIM, fontSize: 11, minWidth: 150 }}>
            legendaryShelf.priceMultiplier
          </code>
          <div style={{ flex: 1 }}>
            <input
              type="number"
              step={0.5}
              min={PRICE_MULTIPLIER_MIN}
              max={PRICE_MULTIPLIER_MAX}
              aria-label={PRICE_MULTIPLIER_LABEL.zh}
              data-field="legendaryShelfPriceMultiplier"
              value={shelf.priceMultiplier}
              onChange={(e) => setShelf({ ...shelf, priceMultiplier: Number(e.target.value) })}
              style={{
                width: 90,
                background: "#0b0e17",
                color: shelfErr ? DANGER : TEXT_MAIN,
                border: `1px solid ${shelfErr ? DANGER : PANEL_BORDER}`,
                borderRadius: 3,
                padding: "4px 6px",
              }}
            />
            <div style={{ color: TEXT_DIM, fontSize: 11, marginTop: 4, lineHeight: 1.6 }}>
              {PRICE_MULTIPLIER_LABEL.note}
            </div>
            <div style={{ color: TEXT_DIM, fontSize: 11, marginTop: 3 }}>
              合法範圍 {PRICE_MULTIPLIER_MIN}–{PRICE_MULTIPLIER_MAX} · 出貨值{" "}
              {SHIPPED_LEGENDARY_SHELF.priceMultiplier}
            </div>
            {shelfErr && <div style={{ color: DANGER, fontSize: 12, marginTop: 4 }}>{shelfErr}</div>}
          </div>
        </div>
        {/* 💰 賣出退款率 —— owner 2026-08-17「賣價一定是取得價的 40%（後台可設定）」 */}
        <div style={rowStyle}>
          <span style={{ color: TEXT_MAIN, minWidth: 150 }}>{SELL_REFUND_PCT_LABEL.zh}</span>
          <code style={{ color: TEXT_DIM, fontSize: 11, minWidth: 150 }}>
            legendaryShelf.sellRefundPct
          </code>
          <div style={{ flex: 1 }}>
            <input
              type="number"
              step={0.05}
              min={SELL_REFUND_PCT_MIN}
              max={SELL_REFUND_PCT_MAX}
              aria-label={SELL_REFUND_PCT_LABEL.zh}
              data-field="legendaryShelfSellRefundPct"
              value={shelf.sellRefundPct ?? SHIPPED_LEGENDARY_SHELF.sellRefundPct ?? 0}
              onChange={(e) => setShelf({ ...shelf, sellRefundPct: Number(e.target.value) })}
              style={{
                width: 90,
                background: "#0b0e17",
                color: shelfErr ? DANGER : TEXT_MAIN,
                border: `1px solid ${shelfErr ? DANGER : PANEL_BORDER}`,
                borderRadius: 3,
                padding: "4px 6px",
              }}
            />
            <div style={{ color: TEXT_DIM, fontSize: 11, marginTop: 4, lineHeight: 1.6 }}>
              {SELL_REFUND_PCT_LABEL.note}
            </div>
            <div style={{ color: TEXT_DIM, fontSize: 11, marginTop: 3 }}>
              合法範圍 {SELL_REFUND_PCT_MIN}–{SELL_REFUND_PCT_MAX} · 出貨值{" "}
              {SHIPPED_LEGENDARY_SHELF.sellRefundPct}
            </div>
          </div>
        </div>
        {/* 🎲 隨機限定抽獎表 —— owner 2026-08-17「仍然可以有寶具是隨機才能取得的」 */}
        <div style={rowStyle}>
          <span style={{ color: TEXT_MAIN, minWidth: 150 }}>{RANDOM_ONLY_TABLES_LABEL.zh}</span>
          <code style={{ color: TEXT_DIM, fontSize: 11, minWidth: 150 }}>
            legendaryShelf.randomOnlyTables
          </code>
          <div style={{ flex: 1 }}>
            <textarea
              rows={2}
              aria-label={RANDOM_ONLY_TABLES_LABEL.zh}
              data-field="legendaryShelfRandomOnlyTables"
              value={formatRetiredTables(shelf.randomOnlyTables ?? [])}
              onChange={(e) =>
                setShelf({ ...shelf, randomOnlyTables: parseRetiredTables(e.target.value) })
              }
              placeholder="例：ex-rigai"
              style={{
                width: "100%",
                background: "#0b0e17",
                color: shelfErr ? DANGER : TEXT_MAIN,
                border: `1px solid ${shelfErr ? DANGER : PANEL_BORDER}`,
                borderRadius: 3,
                padding: "4px 6px",
                fontFamily: "monospace",
                fontSize: 12,
              }}
            />
            <div style={{ color: TEXT_DIM, fontSize: 11, marginTop: 4, lineHeight: 1.6 }}>
              {RANDOM_ONLY_TABLES_LABEL.note}
            </div>
            <div style={{ color: TEXT_DIM, fontSize: 11, marginTop: 3 }}>
              最多 {RANDOM_ONLY_TABLES_MAX} 張 · 出貨值：空（沒有任何道具被限定成隨機取得）
            </div>
          </div>
        </div>
        {/* ⭐ 唯讀的推導結果 —— 操作者不用心算，而且「乘在哪個價格上」是明說的 */}
        {!shelfErr && (
          <div style={{ color: GOLD, fontSize: 12, marginTop: 4 }}>{legendaryShelfSummary(shelf)}</div>
        )}
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ color: ACCENT, fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
          🏆 聖杯顯現（回合願望三選一）
        </div>
        <div style={{ color: TEXT_DIM, fontSize: 11, marginBottom: 8, lineHeight: 1.7 }}>
          這一組決定<b style={{ color: TEXT_MAIN }}>哪幾張願望會出現在玩家面前</b>，
          ⛔ 不改任何一張願望自己的效果 —— 那些整份住在{" "}
          <code>content/augments/grail-*.json</code>，每次 build / 重啟都重讀。
        </div>
        {GRAIL_DRAFT_FIELD_ORDER.map((field) => {
          const label = GRAIL_DRAFT_LABELS[field];
          const isChanged = changedGrailFields(grail).includes(field);
          return (
            <div key={field} style={rowStyle}>
              <div style={{ width: 150, flexShrink: 0 }}>
                <div style={{ color: TEXT_MAIN, fontSize: 13 }}>
                  {label.zh}
                  {isChanged && <span style={{ color: GOLD, fontSize: 11, marginLeft: 5 }}>已改</span>}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                {(field === "eligibilityEnabled" || field === "slotDiversityEnabled") && (
                  <label style={{ color: TEXT_MAIN, fontSize: 13, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={grail[field]}
                      onChange={(e) => setGrail({ ...grail, [field]: e.target.checked })}
                      style={{ marginRight: 6 }}
                    />
                    {grail[field] ? "開" : "關"}
                  </label>
                )}
                {field === "preferenceBonus" && (
                  <input
                    type="number"
                    step={0.1}
                    min={PREFERENCE_BONUS_MIN}
                    max={PREFERENCE_BONUS_MAX}
                    value={grail.preferenceBonus}
                    onChange={(e) =>
                      setGrail({ ...grail, preferenceBonus: Number(e.target.value) })
                    }
                    style={{
                      width: 90,
                      background: "#0b0e17",
                      color: TEXT_MAIN,
                      border: `1px solid ${PANEL_BORDER}`,
                      borderRadius: 3,
                      padding: "4px 6px",
                    }}
                  />
                )}
                {field === "legacyPool" && (
                  <select
                    value={grail.legacyPool}
                    onChange={(e) =>
                      setGrail({ ...grail, legacyPool: e.target.value as GrailDraftRules["legacyPool"] })
                    }
                    style={{
                      background: "#0b0e17",
                      color: TEXT_MAIN,
                      border: `1px solid ${PANEL_BORDER}`,
                      borderRadius: 3,
                      padding: "4px 6px",
                    }}
                  >
                    {LEGACY_POOL_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.zh}
                      </option>
                    ))}
                  </select>
                )}
                <div style={{ color: TEXT_DIM, fontSize: 11, marginTop: 4, lineHeight: 1.6 }}>
                  {label.note}
                </div>
              </div>
            </div>
          );
        })}
        <div style={{ color: GOLD, fontSize: 12, marginTop: 6 }}>{grailDraftSummary(grail)}</div>
      </div>

      {/* ⭐ GH#355 —— 兩張階級升級表 + 劣勢權重。三者是**同一個機制**（見 ../tierRows.ts） */}
      <RowsTable
        spec={WEAPON_TIERS_SPEC}
        rows={weaponRows}
        errors={weaponVerdict.rows}
        tableErr={weaponVerdict.table}
        onChange={setWeaponRows}
      />
      <RowsTable
        spec={AUGMENT_TIERS_SPEC}
        rows={augmentRows}
        errors={augmentVerdict.rows}
        tableErr={augmentVerdict.table}
        onChange={setAugmentRows}
      />

      <div style={{ marginTop: 14 }}>
        <div style={{ color: ACCENT, fontSize: 12, marginBottom: 6 }}>誰算劣勢方（劣勢值 D）</div>
        <p style={{ color: TEXT_DIM, fontSize: 12, lineHeight: 1.7, margin: "0 0 8px" }}>
          上面兩張表的每一列都乘這個 <b style={{ color: TEXT_MAIN }}>D</b>。owner 2026-08-17 逐字給的公式是
          三個訊號加權：<b style={{ color: GOLD }}>回合／生命 50 · 裝備 30 · 近況 20</b>。
        </p>
        {DISADVANTAGE_FIELD_ORDER.map((field) => (
          <div key={field} style={rowStyle}>
            <span style={{ color: TEXT_MAIN, minWidth: 150 }}>{DISADVANTAGE_LABELS[field].zh}</span>
            <code style={{ color: TEXT_DIM, fontSize: 11, minWidth: 150 }}>
              disadvantageWeights.{field}
            </code>
            <div style={{ flex: 1 }}>
              <input
                type="number"
                step={5}
                min={0}
                max={100}
                aria-label={DISADVANTAGE_LABELS[field].zh}
                data-field={field}
                value={disadv[field]}
                onChange={(e) => setDisadv({ ...disadv, [field]: Number(e.target.value) })}
                style={{
                  width: 90,
                  background: "#0b0e17",
                  color: TEXT_MAIN,
                  border: `1px solid ${PANEL_BORDER}`,
                  borderRadius: 3,
                  padding: "4px 6px",
                }}
              />
              <div style={{ color: TEXT_DIM, fontSize: 11, marginTop: 4, lineHeight: 1.6 }}>
                {DISADVANTAGE_LABELS[field].note}
              </div>
              {disadvErrs[field] && (
                <div style={{ color: DANGER, fontSize: 12, marginTop: 4 }}>{disadvErrs[field]}</div>
              )}
            </div>
          </div>
        ))}
        <div style={{ color: GOLD, fontSize: 12, marginTop: 6 }}>{disadvantageSummary(disadv)}</div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <Btn
          onClick={() => void save()}
          disabled={
            busy || !preview || !baseDoc || retiredErr !== null || shelfErr !== null || !tiersOk
          }
        >
          {busy ? "儲存中…" : "儲存"}
        </Btn>
        <Btn onClick={resetToShipped} disabled={busy}>
          還原出貨值
        </Btn>
      </div>
      <p style={{ color: TEXT_DIM, fontSize: 12, lineHeight: 1.7, marginTop: 12 }}>
        存檔寫進耐久覆蓋層（撐得過重新部署），<b style={{ color: GOLD }}>下一場開始生效</b> ——
        規則在 tick 0 之前定格進 <code>MatchController</code>，所以已經開打的那一場不會變。
      </p>
    </Panel>
  );
}

/**
 * 一張「物件陣列」表（GH#355）。
 *
 * ⛔ **這裡沒有任何一格欄位定義** —— 欄名、型別、界、enum 選項全部來自
 * `rowColumns(spec)`，而那支從**出貨 Zod** 走出來。schema 加一欄，這張表當場多一欄。
 */
function RowsTable(props: {
  spec: ConfigRowsSpec;
  rows: RowDraft[];
  errors: Record<string, string>[];
  tableErr: string | null;
  onChange: (rows: RowDraft[]) => void;
}): JSX.Element {
  const { spec, rows, errors, tableErr, onChange } = props;
  const cols = useMemo(() => rowColumns(spec), [spec]);
  const cell: React.CSSProperties = {
    background: "#0b0e17",
    color: TEXT_MAIN,
    border: `1px solid ${PANEL_BORDER}`,
    borderRadius: 3,
    padding: "3px 5px",
    fontSize: 12,
  };
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ color: ACCENT, fontSize: 12, marginBottom: 6 }}>{spec.title}</div>
      {spec.intro.map((line, i) => (
        <p key={i} style={{ color: TEXT_DIM, fontSize: 12, lineHeight: 1.7, margin: "0 0 6px" }}>
          {line}
        </p>
      ))}
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              {cols.map((c) => (
                <th
                  key={c.key}
                  title={c.note}
                  style={{
                    color: TEXT_DIM,
                    textAlign: "left",
                    padding: "4px 6px",
                    borderBottom: PANEL_BORDER,
                    whiteSpace: "nowrap",
                  }}
                >
                  {c.zh}
                  {c.optional && <span style={{ color: TEXT_DIM }}>（可留白）</span>}
                </th>
              ))}
              <th style={{ borderBottom: PANEL_BORDER }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {cols.map((c) => (
                  <td key={c.key} style={{ padding: "3px 6px", verticalAlign: "top" }}>
                    {c.kind === "enum" ? (
                      <select
                        aria-label={`${spec.title} 第 ${i + 1} 列 ${c.zh}`}
                        data-field={`${spec.path}.${i}.${c.key}`}
                        value={row[c.key] ?? ""}
                        onChange={(e) => onChange(setCell(rows, i, c.key, e.target.value))}
                        style={{ ...cell, width: c.width }}
                      >
                        {c.optional && <option value="">（不設）</option>}
                        {c.options.map((o) => (
                          <option key={o} value={o}>
                            {spec.columns[c.key]?.optionZh?.[o] ?? o}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={c.kind === "number" ? "number" : "text"}
                        step={c.int ? 1 : 0.1}
                        min={c.min}
                        max={c.max}
                        aria-label={`${spec.title} 第 ${i + 1} 列 ${c.zh}`}
                        data-field={`${spec.path}.${i}.${c.key}`}
                        value={row[c.key] ?? ""}
                        onChange={(e) => onChange(setCell(rows, i, c.key, e.target.value))}
                        style={{ ...cell, width: c.width }}
                      />
                    )}
                    {errors[i]?.[c.key] && (
                      <div style={{ color: DANGER, fontSize: 11, marginTop: 2, maxWidth: 160 }}>
                        {errors[i]?.[c.key]}
                      </div>
                    )}
                  </td>
                ))}
                <td style={{ padding: "3px 6px", whiteSpace: "nowrap", verticalAlign: "top" }}>
                  {spec.ordered && (
                    <>
                      <Btn onClick={() => onChange(moveRow(rows, i, -1))}>↑</Btn>{" "}
                      <Btn onClick={() => onChange(moveRow(rows, i, 1))}>↓</Btn>{" "}
                    </>
                  )}
                  <Btn onClick={() => onChange(removeRow(rows, i))}>刪除</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 6 }}>
        <Btn onClick={() => onChange(addRow(rows, spec))} disabled={rows.length >= spec.maxRows}>
          ＋ 新增一階
        </Btn>
        <span style={{ color: TEXT_DIM, fontSize: 11, marginLeft: 8 }}>
          {rows.length} / {spec.maxRows} 階
          {spec.ordered && " · 順序有意義：引擎由上到下逐階問，第一個中的就用它"}
        </span>
      </div>
      {tableErr && <div style={{ color: DANGER, fontSize: 12, marginTop: 4 }}>{tableErr}</div>}
    </div>
  );
}
