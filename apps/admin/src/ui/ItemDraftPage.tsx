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
  type ItemDraftField,
  type ItemDraftForm,
} from "../itemDraft";

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function ItemDraftPage(): JSX.Element {
  const [baseDoc, setBaseDoc] = useState<Record<string, unknown> | null>(null);
  const [form, setForm] = useState<ItemDraftForm>(formFromConfig(SHIPPED_ITEM_DRAFT));
  /** 退場清單是 arena-rules 的頂層欄位，不是 `itemDraft` 區塊的一格 —— 見 itemDraft.ts。 */
  const [retiredText, setRetiredText] = useState(formatRetiredTables(SHIPPED_RETIRED_LOOT_TABLES));
  const [offerCount, setOfferCount] = useState(readOfferCount(null));
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

  const save = async (): Promise<void> => {
    if (!preview || !baseDoc || retiredErr) return;
    setBusy(true);
    setApiErr(null);
    try {
      // 兩個 patch 疊在**同一份基底文件**上，一次 PUT。分兩次寫的話，第二次會
      // 用第一次之前的基底覆蓋回去 —— 那正是覆蓋層存整份文件的那個陷阱。
      const next = patchRetiredTables(patchItemDraft(baseDoc, preview), retiredIds);
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

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <Btn onClick={() => void save()} disabled={busy || !preview || !baseDoc || retiredErr !== null}>
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
