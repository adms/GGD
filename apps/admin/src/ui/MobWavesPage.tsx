/**
 * 殭屍波系統 (roguelite mob waves) — the dedicated console page for
 * `config/arena-rules.json`'s `mobWaves` block.
 *
 * THREE THINGS, in the order the owner asked for them:
 *   1. 逐回合表 — one row per round: 每波數量 / 場上上限 / 由誰擔任, plus the
 *      derived 等級 and 每隻血量 for that round, so the escalation is readable
 *      as a curve and round 10's 0/0 reads as 「乾淨總決賽」 rather than as a
 *      typo (it carries its own badge);
 *   2. 能力數值 — every scalar the schema admits, each with a 中文 label, a
 *      one-line 「它會影響什麼」, its unit, and the value CURRENTLY IN FORCE
 *      printed beside the box;
 *   3. 由誰擔任 — a real champion picker (中文名 + id) both for the whole match
 *      and per round.
 *
 * WHERE A SAVE GOES. `PUT /api/v1/content-overlay/docs/config/arena-rules` —
 * the platform's durable data/ overlay (#189), admin JWT, audited. NOT the
 * loopback content-api: that one edits `content/` in the repo, which on the host
 * is a read-only bind mount that `git pull` overwrites. See PERSISTENCE_NOTE in
 * ../mobWaves for the full chain. This is also why the page is EAGERLY imported
 * (it must exist in the production bundle) and session-gated (its write is a
 * platform admin call).
 *
 * WHAT IS NOT WIRED, said out loud. The per-round 由誰擔任 column is a NEW
 * schema field; `mobRulesFromConfig` in `packages/shared/src/sim/` still reads
 * only `mob.championId` and has no per-round branch. The column stores and
 * displays, and the page says so in the header of that very column — a knob that
 * silently does nothing is exactly the failure this project keeps having.
 *
 * All parse/validate/derive logic is pure (../mobWaves, unit-tested); this file
 * is presentation + wiring.
 */
import { useEffect, useMemo, useState } from "react";
import { getOverlayDoc, getShippedDoc, putOverlayDoc } from "../api";
import { loadCollection } from "../content";
import {
  APPLY_NOTE,
  ARENA_RULES_COLLECTION,
  ARENA_RULES_ID,
  MOB_CHAMPION_FALLBACK,
  MOB_WAVES_GROUPS,
  MOB_WAVES_LABELS,
  PERSISTENCE_NOTE,
  SHIPPED_MOB_WAVES,
  SIM_GAP_NOTE,
  addScheduleRow,
  changedFields,
  championLabel,
  configFromForm,
  extractMobWaves,
  formFromConfig,
  formValid,
  isDirty,
  lastAuthoredRound,
  loadErrorText,
  patchArenaRules,
  readField,
  removeScheduleRow,
  resetField,
  roundRows,
  saveErrorText,
  scheduleChanged,
  setField,
  setScheduleCell,
  shippedForm,
  sortChampions,
  validateForm,
  type ChampionOption,
  type MobWavesConfig,
  type MobWavesFieldKey,
  type MobWavesForm,
  type RoundRow,
} from "../mobWaves";
import { Badge, Btn, ErrorBanner, Panel, TextInput } from "./widgets";
import { ACCENT, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "./theme";

export function MobWavesPage(): React.JSX.Element {
  // Seeded from the SHIPPED block, so the page paints a real table before the
  // fetch lands instead of an empty skeleton.
  const [saved, setSaved] = useState<MobWavesConfig>(SHIPPED_MOB_WAVES);
  const [form, setForm] = useState<MobWavesForm>(() => formFromConfig(SHIPPED_MOB_WAVES));
  /** the FULL arena-rules doc — every other block rides along untouched on save */
  const [doc, setDoc] = useState<Record<string, unknown> | null>(null);
  const [source, setSource] = useState<"overlay" | "shipped" | "none">("none");
  const [champions, setChampions] = useState<ChampionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [apiErr, setApiErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        // LIVE FIRST: the overlay is what the shard actually loads. Only when
        // this doc has no overlay entry does the repo version become the truth.
        const overlaid = await getOverlayDoc(ARENA_RULES_COLLECTION, ARENA_RULES_ID);
        let full = (overlaid ?? null) as Record<string, unknown> | null;
        let from: "overlay" | "shipped" | "none" = full ? "overlay" : "none";
        if (!full) {
          const shipped = await getShippedDoc(ARENA_RULES_COLLECTION, ARENA_RULES_ID);
          if (shipped.present && shipped.doc && typeof shipped.doc === "object") {
            full = shipped.doc as Record<string, unknown>;
            from = "shipped";
          }
        }
        setDoc(full);
        setSource(from);
        const block = extractMobWaves(full);
        if (block) {
          setSaved(block);
          setForm(formFromConfig(block));
        }
      } catch (err) {
        setApiErr(loadErrorText(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // The champion picker's options. Best-effort: an unreachable /content mount
  // leaves the dropdowns as a free-text id field rather than breaking the page.
  useEffect(() => {
    void (async () => {
      try {
        const rows = await loadCollection("champions");
        setChampions(sortChampions(rows.map((r) => ({ id: r.id, name: r.name }))));
      } catch {
        setChampions([]);
      }
    })();
  }, []);

  const errors = useMemo(() => validateForm(form), [form]);
  const valid = formValid(form);
  const draft = useMemo(() => configFromForm(form), [form]);
  const dirtyFields = useMemo(() => changedFields(form, saved), [form, saved]);
  const dirty = isDirty(form, saved);
  const lastRound = lastAuthoredRound(doc);
  const rows = useMemo(() => roundRows(draft, lastRound), [draft, lastRound]);

  const patch = (next: MobWavesForm): void => {
    setForm(next);
    setFlash(null);
  };

  const onSave = async (): Promise<void> => {
    setBusy(true);
    setApiErr(null);
    try {
      const base = doc ?? {};
      const next = patchArenaRules(base, configFromForm(form));
      const head = await putOverlayDoc(ARENA_RULES_COLLECTION, ARENA_RULES_ID, next);
      setDoc(next);
      setSource("overlay");
      setSaved(configFromForm(form));
      setFlash(`✓ 已寫入耐久覆蓋層（generation ${head.generation}）— ${APPLY_NOTE}`);
    } catch (err) {
      setFlash(null);
      setApiErr(saveErrorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1040 }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 800, color: TEXT_MAIN }}>殭屍波系統 · Mob waves</div>
        <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 4, lineHeight: 1.7 }}>
          肉鴿小怪波：從指定回合起，殭屍每隔幾秒從戰場邊緣走進來，追最近的英雄打。
          打死牠們給金錢、經驗，而且每累積幾隻就直接升一級 —— 這是中後期爬等級的主要來源。
          <br />
          這一頁編輯 <code style={{ color: ACCENT }}>config/arena-rules.json</code> 的{" "}
          <code style={{ color: ACCENT }}>mobWaves</code> 區塊，其他區塊（回合獎勵 / 花朵 / 復活圈 /
          守護塔…）原封不動帶過去。
        </div>
      </div>

      <ErrorBanner text={apiErr} onDismiss={() => setApiErr(null)} />

      <Note tone="ok" icon="💾" title="改了會不會被部署蓋掉？不會。">
        {PERSISTENCE_NOTE}
        <br />
        {APPLY_NOTE}
      </Note>

      <Note tone="warn" icon="⚠️" title="逐回合的「由誰擔任」目前只存不吃">
        {SIM_GAP_NOTE}
      </Note>

      <Panel
        title="逐回合排程 · 一列一個回合"
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {loading ? (
              <span style={{ fontSize: 11, color: TEXT_DIM }}>載入中…</span>
            ) : (
              <Badge color={source === "overlay" ? WARN : OK}>
                {source === "overlay" ? "目前是後台改過的版本" : source === "shipped" ? "目前是出貨版" : "讀不到文件"}
              </Badge>
            )}
          </div>
        }
      >
        <div style={{ fontSize: 11.5, color: TEXT_DIM, marginBottom: 8, lineHeight: 1.7 }}>
          沒有自己一列的回合，就吃下面「出怪節奏」裡的兩個基準上限（
          <b style={{ color: TEXT_MAIN }}>
            {draft.mobsPerWaveCap} 隻/波 · 場上 {draft.maxAlivePerZone}
          </b>
          ）。<b style={{ color: GOLD }}>某一回合設成 0 / 0 就是那一回合完全沒有殭屍</b>
          —— 出貨版第 10 回合就是刻意這樣設的「乾淨總決賽」。
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 720, fontSize: 12.5 }}>
            <thead>
              <tr style={{ color: ACCENT, fontSize: 11, textAlign: "left" }}>
                <Th>回合</Th>
                <Th>每波數量</Th>
                <Th>場上上限</Th>
                <Th>由誰擔任（尚未接上對戰端）</Th>
                <Th>殭屍等級</Th>
                <Th>每隻血量</Th>
                <Th>狀態</Th>
                <Th> </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <RoundTr
                  key={row.round}
                  row={row}
                  form={form}
                  champions={champions}
                  disabled={busy}
                  errors={errors.schedule[row.scheduleIndex]}
                  onCell={(cell, v) => patch(setScheduleCell(form, row.scheduleIndex, cell, v))}
                  onAdd={() => patch(addScheduleRow(form, row.round))}
                  onRemove={() => patch(removeScheduleRow(form, row.scheduleIndex))}
                />
              ))}
            </tbody>
          </table>
        </div>
        {errors.general.map((g) => (
          <div key={g} style={{ fontSize: 11.5, color: WARN, marginTop: 6 }}>
            {g}
          </div>
        ))}
      </Panel>

      {MOB_WAVES_GROUPS.map((group) => (
        <Panel key={group.title} title={group.title}>
          <div style={{ fontSize: 11.5, color: TEXT_DIM, marginBottom: 8 }}>{group.blurb}</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {group.keys.map((key) => (
              <FieldRow
                key={key}
                fieldKey={key}
                value={form.fields[key]}
                error={errors.fields[key]}
                live={readField(saved, key)}
                champions={champions}
                disabled={busy}
                onChange={(v) => patch(setField(form, key, v))}
                onReset={() => patch(resetField(form, key))}
              />
            ))}
          </div>
        </Panel>
      ))}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          padding: "10px 14px",
          borderRadius: 10,
          border: PANEL_BORDER,
          background: "#141a28",
          position: "sticky",
          bottom: 0,
        }}
      >
        <div style={{ flex: 1, minWidth: 200, fontSize: 12, color: TEXT_DIM }}>
          {dirty ? (
            <span style={{ color: WARN }}>
              ● {dirtyFields.length} 項數值未儲存
              {scheduleChanged(form, saved) ? " · 逐回合表已改動" : ""}
            </span>
          ) : (
            <span>沒有未儲存的變更</span>
          )}
        </div>
        <Btn small onClick={() => patch(shippedForm())} disabled={busy || loading} title="把整個區塊設回出貨版">
          全部重設為出貨版
        </Btn>
        {!valid && <div style={{ fontSize: 12, color: WARN }}>有欄位不合法，請修正後再儲存</div>}
        {flash && <div style={{ fontSize: 12, color: OK, maxWidth: 460 }}>{flash}</div>}
        <Btn kind="primary" onClick={() => void onSave()} disabled={busy || loading || !valid}>
          {busy ? "儲存中…" : "儲存 Save"}
        </Btn>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ bits ----

function Th(props: { children: React.ReactNode }): React.JSX.Element {
  return (
    <th style={{ padding: "6px 8px", fontWeight: 700, borderBottom: PANEL_BORDER, whiteSpace: "nowrap" }}>
      {props.children}
    </th>
  );
}

function Td(props: { children: React.ReactNode; dim?: boolean }): React.JSX.Element {
  return (
    <td
      style={{
        padding: "5px 8px",
        borderBottom: "1px solid #1b2233",
        color: props.dim ? TEXT_DIM : TEXT_MAIN,
        whiteSpace: "nowrap",
      }}
    >
      {props.children}
    </td>
  );
}

/** One round of the schedule read-out — editable only when it has its own row. */
function RoundTr(props: {
  row: RoundRow;
  form: MobWavesForm;
  champions: readonly ChampionOption[];
  disabled: boolean;
  errors?: { round?: string; mobsPerWaveCap?: string; maxAlivePerZone?: string };
  onCell: (cell: "round" | "mobsPerWaveCap" | "maxAlivePerZone" | "championId", v: string) => void;
  onAdd: () => void;
  onRemove: () => void;
}): React.JSX.Element {
  const { row } = props;
  const editable = row.overridden;
  const cell = props.form.schedule[row.scheduleIndex];

  return (
    <tr style={{ background: row.cleanFinale ? "#231d10" : undefined }}>
      <Td>
        <b style={{ color: row.active ? TEXT_MAIN : TEXT_DIM }}>第 {row.round} 回合</b>
      </Td>
      <Td dim={!row.active}>
        {editable && cell ? (
          <TextInput
            value={cell.mobsPerWaveCap}
            onChange={(v) => props.onCell("mobsPerWaveCap", v)}
            type="number"
            disabled={props.disabled}
            dataField={`schedule.${row.round}.mobsPerWaveCap`}
            style={{ width: 78, padding: "4px 6px", textAlign: "center" }}
          />
        ) : row.active ? (
          `${row.mobsPerWaveCap} 隻`
        ) : (
          "—"
        )}
        {props.errors?.mobsPerWaveCap && (
          <div style={{ fontSize: 10.5, color: WARN }}>{props.errors.mobsPerWaveCap}</div>
        )}
      </Td>
      <Td dim={!row.active}>
        {editable && cell ? (
          <TextInput
            value={cell.maxAlivePerZone}
            onChange={(v) => props.onCell("maxAlivePerZone", v)}
            type="number"
            disabled={props.disabled}
            dataField={`schedule.${row.round}.maxAlivePerZone`}
            style={{ width: 78, padding: "4px 6px", textAlign: "center" }}
          />
        ) : row.active ? (
          `${row.maxAlivePerZone} 隻`
        ) : (
          "—"
        )}
        {props.errors?.maxAlivePerZone && (
          <div style={{ fontSize: 10.5, color: WARN }}>{props.errors.maxAlivePerZone}</div>
        )}
      </Td>
      <Td dim={!row.active}>
        {editable && cell ? (
          <ChampionPicker
            value={cell.championId}
            options={props.champions}
            disabled={props.disabled}
            dataField={`schedule.${row.round}.championId`}
            emptyLabel="（沿用整場設定）"
            onChange={(v) => props.onCell("championId", v)}
          />
        ) : row.active ? (
          <span style={{ color: TEXT_DIM }}>{championLabel(row.championId, props.champions)}</span>
        ) : (
          "—"
        )}
      </Td>
      <Td dim={!row.active}>{row.active ? `Lv ${row.level}` : "—"}</Td>
      <Td dim={!row.active}>{row.active ? (row.hp === null ? "（讀英雄卡）" : `${row.hp}`) : "—"}</Td>
      <Td>
        {!row.active ? (
          <span style={{ color: TEXT_DIM, fontSize: 11 }}>還沒開始出殭屍</span>
        ) : row.cleanFinale ? (
          <Badge color={GOLD}>乾淨總決賽 · 一隻都沒有</Badge>
        ) : row.overridden ? (
          <Badge color={ACCENT}>這回合單獨設定</Badge>
        ) : (
          <span style={{ color: TEXT_DIM, fontSize: 11 }}>用基準值</span>
        )}
      </Td>
      <Td>
        {editable ? (
          <Btn small disabled={props.disabled} onClick={props.onRemove} title="刪掉這一列，改回吃基準值">
            改回基準
          </Btn>
        ) : (
          <Btn small disabled={props.disabled} onClick={props.onAdd} title="讓這一回合有自己的設定">
            單獨設定
          </Btn>
        )}
      </Td>
    </tr>
  );
}

/** One scalar knob: 中文 label + 影響 + 目前生效值 + input + unit + 重設. */
function FieldRow(props: {
  fieldKey: MobWavesFieldKey;
  value: string;
  error?: string;
  /** the value CURRENTLY IN FORCE (from the loaded doc), for the side-by-side */
  live: string;
  champions: readonly ChampionOption[];
  disabled: boolean;
  onChange: (v: string) => void;
  onReset: () => void;
}): React.JSX.Element {
  const spec = MOB_WAVES_LABELS[props.fieldKey];
  const unsaved = props.value.trim() !== props.live.trim();
  const shipped = readField(SHIPPED_MOB_WAVES, props.fieldKey);
  const liveText =
    props.live.trim() === ""
      ? (spec.emptyMeans ?? "（未設定）")
      : spec.kind === "champion"
        ? championLabel(props.live, props.champions)
        : `${props.live}${spec.unit}`;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) 200px auto",
        alignItems: "center",
        gap: 10,
        padding: "8px 0",
        borderBottom: "1px solid #1b2233",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: TEXT_MAIN }}>
          {spec.zh}
          <code style={{ fontSize: 10.5, color: TEXT_DIM, marginLeft: 8, fontWeight: 400 }}>
            {props.fieldKey}
          </code>
          {unsaved && <span style={{ color: WARN, marginLeft: 6, fontSize: 11 }}>●</span>}
        </div>
        <div style={{ fontSize: 11.5, color: TEXT_DIM, marginTop: 1 }}>{spec.note}</div>
        <div style={{ fontSize: 11, color: ACCENT, marginTop: 2 }}>
          目前生效：<b>{liveText}</b>
          <span style={{ color: TEXT_DIM, marginLeft: 8 }}>
            出貨版 {shipped === "" ? "未設定" : shipped}
          </span>
        </div>
        {props.error && <div style={{ fontSize: 11, color: WARN, marginTop: 2 }}>{props.error}</div>}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {spec.kind === "champion" ? (
          <ChampionPicker
            value={props.value}
            options={props.champions}
            disabled={props.disabled}
            dataField={props.fieldKey}
            emptyLabel={`（系統預設 ${MOB_CHAMPION_FALLBACK}）`}
            onChange={props.onChange}
          />
        ) : (
          <>
            <TextInput
              value={props.value}
              onChange={props.onChange}
              type={spec.kind === "int" || spec.kind === "num" ? "number" : "text"}
              disabled={props.disabled}
              dataField={props.fieldKey}
              placeholder={spec.optional ? "留空 = 預設" : ""}
              style={{
                padding: "6px 8px",
                textAlign: spec.kind === "model" ? "left" : "center",
                fontVariantNumeric: "tabular-nums",
                borderColor: props.error ? WARN : unsaved ? ACCENT : "#2c3448",
              }}
            />
            {spec.unit !== "" && (
              <span style={{ fontSize: 11, color: TEXT_DIM, whiteSpace: "nowrap" }}>{spec.unit}</span>
            )}
          </>
        )}
      </div>

      <Btn
        small
        disabled={props.disabled || props.value.trim() === shipped.trim()}
        onClick={props.onReset}
        title={`設回出貨版 ${shipped === "" ? "（未設定）" : shipped}`}
        style={{ minWidth: 54 }}
      >
        重設
      </Btn>
    </div>
  );
}

/**
 * The 由誰擔任 control. A real `<select>` of 中文名（id）, never a bare id box —
 * a dropdown of `godie-*` slugs is not something anyone can pick a character
 * from. Degrades to a free-text id field when the /content mount is unreachable,
 * so the knob still WORKS when the nicety does not.
 */
function ChampionPicker(props: {
  value: string;
  options: readonly ChampionOption[];
  disabled: boolean;
  dataField: string;
  emptyLabel: string;
  onChange: (v: string) => void;
}): React.JSX.Element {
  if (props.options.length === 0) {
    return (
      <TextInput
        value={props.value}
        onChange={props.onChange}
        disabled={props.disabled}
        dataField={props.dataField}
        placeholder="英雄文件 id"
        style={{ padding: "6px 8px" }}
      />
    );
  }
  // an id that is not in the roster must still be selectable, or opening the
  // page would silently rewrite it to the first champion in the list
  const unknown = props.value !== "" && !props.options.some((o) => o.id === props.value);
  return (
    <select
      value={props.value}
      disabled={props.disabled}
      data-field={props.dataField}
      onChange={(e) => props.onChange(e.target.value)}
      style={{
        padding: "6px 8px",
        borderRadius: 8,
        border: "1px solid #2c3448",
        background: "#10141f",
        color: TEXT_MAIN,
        fontSize: 12.5,
        width: "100%",
        maxWidth: 200,
      }}
    >
      <option value="">{props.emptyLabel}</option>
      {unknown && <option value={props.value}>{props.value}（找不到這份英雄文件）</option>}
      {props.options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name === o.id ? o.id : `${o.name}（${o.id}）`}
        </option>
      ))}
    </select>
  );
}

function Note(props: {
  tone: "ok" | "warn";
  icon: string;
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const color = props.tone === "ok" ? OK : GOLD;
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        padding: "10px 14px",
        borderRadius: 10,
        border: `1px solid ${color}`,
        background: props.tone === "ok" ? "#0f1f16" : "#231d10",
        color,
        fontSize: 12,
        lineHeight: 1.7,
      }}
    >
      <span style={{ fontSize: 15 }}>{props.icon}</span>
      <div>
        <b>{props.title}</b>
        <div style={{ color: TEXT_DIM, marginTop: 2 }}>{props.children}</div>
      </div>
    </div>
  );
}
