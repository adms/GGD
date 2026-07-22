/**
 * CodexDetail — the detail pane for ONE entry, and the thing that makes this a
 * codex rather than three lists: every relation is a link.
 *
 *   champion → its Q/W/E/R + EX abilities, and its recommended items
 *   ability  → the champion that owns it (and that champion's other skills)
 *   item     → the items it is built from, and the items it builds into
 *
 * Every value shown is read off the fetched doc; the 原始文件 block at the
 * bottom prints the doc verbatim, which is both the debugging view and the
 * proof that the page is showing the file on disk.
 *
 * EDITING (task #96). Every field already went through ONE primitive, `<Row>`,
 * so that is where editing attaches: a Row that names its doc `path` renders an
 * input instead of text whenever an edit session is open. `<EditOnly>` adds the
 * rows that have no read-only representation (an absent optional field). All of
 * it is inert unless CodexPage managed to load the dev-only ./codexEdit module —
 * in a production build that module does not exist, so `useDetailEdit()` is
 * null, every Row renders its children, and this file behaves exactly as it did
 * before.
 */
import { Fragment, useState } from "react";
import { GOLD, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "../theme";
import { CodexIcon } from "./CodexIcon";
// The ONLY editor-related runtime import: a createContext(null) + useContext.
// The editor itself (CodexEditPanel → codexEdit → codexEditModel) arrives as a
// COMPONENT PROP from CodexPage's `import.meta.env.DEV`-guarded dynamic import,
// so a production build contains none of it.
import { useDetailEdit } from "./codexEditContext";
import type { FieldKind } from "./codexEditModel";
import type { CodexEditSessionProps } from "./CodexEditPanel";
import {
  attackTypeLabel,
  bucketLabel,
  castLabel,
  formatModifier,
  formatPerRank,
  num,
  roleLabel,
  SLOT_COLOR,
  statLabel,
} from "./codexLabels";
import type { RecipeGraph } from "./codexRecipes";
import { enabledState, type EnabledState } from "./codexSearch";
import type {
  CodexAbility,
  CodexChampion,
  CodexData,
  CodexEntry,
  CodexItem,
  CodexRef,
} from "@ggd/shared/codex/codexTypes";

const ENABLED_TEXT: Record<EnabledState, { label: string; color: string }> = {
  enabled: { label: "已啟用", color: "#47cc6a" },
  disabled: { label: "存在但未啟用", color: "#e0a878" },
  unknown: { label: "啟用狀態未知（後台未連線）", color: "#8d97ad" },
};

/**
 * One label + value line. Give it a doc `path` (and the field `kind`) and it
 * becomes the editor for that field while an edit session is open; with no
 * session — always, in a production build — it renders `children` unchanged.
 */
function Row({
  label,
  path,
  kind,
  children,
}: {
  label: string;
  path?: string;
  kind?: FieldKind;
  children?: React.ReactNode;
}): React.JSX.Element {
  const edit = useDetailEdit();
  const editable = edit !== null && path !== undefined && kind !== undefined;
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        padding: "3px 0",
        fontSize: 12,
        alignItems: editable ? "flex-start" : "baseline",
      }}
    >
      <div style={{ width: 92, flexShrink: 0, color: editable ? GOLD : TEXT_DIM }}>{label}</div>
      <div style={{ flex: 1, minWidth: 0, color: TEXT_MAIN, wordBreak: "break-word" }}>
        {editable ? edit.renderField(path, kind) : children}
      </div>
    </div>
  );
}

/**
 * A field that has NO read-only representation — an absent optional value, or
 * one the read-only view derives rather than shows. Appears only while editing.
 */
function EditOnly({ label, path, kind }: { label: string; path: string; kind: FieldKind }): React.JSX.Element | null {
  const edit = useDetailEdit();
  if (edit === null) return null;
  return <Row label={label} path={path} kind={kind} />;
}

/** Swap a whole rendered block (not a Row) for its editor while editing. */
function Editable({
  path,
  kind,
  children,
}: {
  path: string;
  kind: FieldKind;
  children: React.ReactNode;
}): React.JSX.Element {
  const edit = useDetailEdit();
  if (edit === null) return <>{children}</>;
  return <>{edit.renderField(path, kind)}</>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ marginTop: 14 }}>
      <div
        style={{
          fontSize: 11,
          letterSpacing: 1,
          color: TEXT_DIM,
          borderBottom: PANEL_BORDER,
          paddingBottom: 4,
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function Chip({ children, color }: { children: React.ReactNode; color?: string }): React.JSX.Element {
  const c = color ?? TEXT_DIM;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 7px",
        borderRadius: 999,
        border: `1px solid ${c}66`,
        color: c,
        fontSize: 11,
        marginRight: 5,
        marginBottom: 4,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

/** A cross-link to another codex entry (or a dead-ref note when it is missing). */
function Link({
  refTo,
  label,
  glyph,
  icon,
  accent,
  onNavigate,
}: {
  refTo: CodexRef | null;
  label: string;
  /** fallback-tile glyph source when it must differ from the label (EX rows) */
  glyph?: string;
  icon?: string | null;
  accent?: string;
  onNavigate: (ref: CodexRef) => void;
}): React.JSX.Element {
  if (!refTo) {
    return (
      <span style={{ color: "#e08878", fontSize: 12 }} title="參照的內容不存在">
        {label} ⚠
      </span>
    );
  }
  return (
    <button
      onClick={() => onNavigate(refTo)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        width: "100%",
        textAlign: "left",
        padding: "4px 6px",
        borderRadius: 6,
        border: "1px solid transparent",
        background: "transparent",
        color: TEXT_MAIN,
        cursor: "pointer",
        fontSize: 12,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "#1b2233";
        e.currentTarget.style.borderColor = "#2c3448";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.borderColor = "transparent";
      }}
    >
      {icon !== undefined && <CodexIcon icon={icon} label={glyph ?? label} size={22} accent={accent} />}
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      <span style={{ color: TEXT_DIM, fontSize: 10 }}>→</span>
    </button>
  );
}

function Description({ text }: { text: string | null }): React.JSX.Element {
  if (!text) {
    return <div style={{ fontSize: 12, color: "#e08878" }}>（此文件沒有說明文字）</div>;
  }
  return (
    <div style={{ fontSize: 12, lineHeight: 1.6, color: "#c8d0e0", whiteSpace: "pre-wrap" }}>{text}</div>
  );
}

function StatTable({
  base,
  growth,
}: {
  base: Readonly<Record<string, number>>;
  growth: Readonly<Record<string, number>>;
}): React.JSX.Element {
  const edit = useDetailEdit();
  const keys = [...new Set([...Object.keys(base), ...Object.keys(growth)])];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: edit ? "1fr 96px 96px" : "1fr auto auto",
        gap: "2px 10px",
        fontSize: 12,
        alignItems: "start",
      }}
    >
      <div style={{ color: TEXT_DIM, fontSize: 10 }}>屬性</div>
      <div style={{ color: TEXT_DIM, fontSize: 10, textAlign: edit ? "left" : "right" }}>基礎</div>
      <div style={{ color: TEXT_DIM, fontSize: 10, textAlign: edit ? "left" : "right" }}>每級成長</div>
      {keys.map((k) => {
        const b = base[k];
        const g = growth[k];
        return (
          <Fragment key={k}>
            <div style={{ color: TEXT_DIM }}>{statLabel(k)}</div>
            {edit ? (
              edit.renderField(`baseStats.${k}`, "number")
            ) : (
              <div style={{ textAlign: "right", color: TEXT_MAIN }}>{b === undefined ? "—" : num(b)}</div>
            )}
            {edit ? (
              edit.renderField(`growth.${k}`, "number")
            ) : (
              <div style={{ textAlign: "right", color: g ? GOLD : TEXT_DIM }}>
                {g === undefined || g === 0 ? "—" : `+${num(g)}`}
              </div>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

/**
 * The verbatim document — and, while editing, the ESCAPE HATCH for everything
 * no Row covers (an ability's `effects` block above all). Editing here replaces
 * the whole draft; the two-step save still validates it against the shared zod
 * schemas and still snapshots the old file before writing.
 */
function RawDoc({ doc }: { doc: Readonly<Record<string, unknown>> }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const edit = useDetailEdit();
  const shown = edit === null ? doc : edit.draft;
  const [text, setText] = useState<string | null>(null);
  const pre: React.CSSProperties = {
    marginTop: 8,
    maxHeight: 320,
    overflow: "auto",
    background: "#0b0e16",
    border: "1px solid #202838",
    borderRadius: 6,
    padding: 8,
    fontSize: 10.5,
    lineHeight: 1.45,
    color: "#9fb0cc",
    whiteSpace: "pre",
  };
  return (
    <Section
      title={
        edit === null
          ? "原始文件（就是 /content 下的那份 JSON）"
          : "原始文件（顯示的是編輯後的草稿，可直接改整份 JSON）"
      }
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          background: "transparent",
          border: "1px solid #2c3448",
          borderRadius: 6,
          color: TEXT_DIM,
          fontSize: 11,
          padding: "3px 9px",
          cursor: "pointer",
        }}
      >
        {open ? "收合" : "展開 JSON"}
      </button>
      {open && edit === null && <pre style={pre}>{JSON.stringify(shown, null, 2)}</pre>}
      {open && edit !== null && (
        <>
          <textarea
            value={text ?? JSON.stringify(shown, null, 2)}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            rows={16}
            style={{ ...pre, width: "100%", boxSizing: "border-box", color: TEXT_MAIN, whiteSpace: "pre" }}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
            <button
              onClick={() => {
                if (text !== null) edit.setWhole(text);
              }}
              style={{
                background: "transparent",
                border: `1px solid ${GOLD}66`,
                borderRadius: 6,
                color: GOLD,
                fontSize: 11,
                padding: "3px 9px",
                cursor: "pointer",
              }}
            >
              套用整份 JSON 到草稿
            </button>
            <button
              onClick={() => setText(null)}
              style={{
                background: "transparent",
                border: "1px solid #2c3448",
                borderRadius: 6,
                color: TEXT_DIM,
                fontSize: 11,
                padding: "3px 9px",
                cursor: "pointer",
              }}
            >
              重讀草稿
            </button>
            {edit.wholeError && (
              <span style={{ fontSize: 10.5, color: "#f08c8c" }}>JSON 無法解析：{edit.wholeError}</span>
            )}
          </div>
        </>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------

interface DetailProps {
  entry: CodexEntry;
  data: CodexData;
  recipes: RecipeGraph;
  onNavigate: (ref: CodexRef) => void;
  onClose: () => void;
  /**
   * The dev-only editing session COMPONENT, or null. It is null in EVERY
   * production build: CodexPage only obtains it from an
   * `import.meta.env.DEV`-guarded dynamic import of ./CodexEditPanel, a module
   * a production bundle never even emits. Passing it as a prop (rather than
   * importing it here) is what keeps this file free of the editor.
   */
  EditSession?: React.ComponentType<CodexEditSessionProps> | null;
  /** re-read /content after a successful write, so the page shows the new file */
  onReloadContent?: () => void;
}

/** The detail body's scroll container — shared by the plain and edited layouts. */
const BODY_STYLE: React.CSSProperties = { flex: 1, minHeight: 0, overflowY: "auto", paddingRight: 4 };

function ChampionBody({ champ, data, onNavigate }: { champ: CodexChampion; data: CodexData; onNavigate: (r: CodexRef) => void }): React.JSX.Element {
  const abilityById = new Map(data.abilities.map((a) => [a.id, a]));
  const itemById = new Map(data.items.map((i) => [i.id, i]));
  const kit = [...champ.abilityIds, ...(champ.exAbilityId ? [champ.exAbilityId] : [])];
  return (
    <>
      <Section title="基本">
        <Row label="編號">{champ.heroNumber ?? "—（技能名稱無法證明編號）"}</Row>
        <EditOnly label="名稱" path="name" kind="text" />
        <Row label="稱號">{champ.title ?? "—（此英雄名稱沒有「稱號 - 全名」分隔）"}</Row>
        <Row label="全名">{champ.fullName}</Row>
        <Row label="定位" path="role" kind="text">
          {roleLabel(champ.role)} · {attackTypeLabel(champ.attackType)}
        </Row>
        <EditOnly label="攻擊方式" path="attackType" kind="text" />
        <Row label="模型" path="modelKey" kind="text">
          {champ.modelKey ?? "—"}
        </Row>
        <Row label="圖示" path="icon" kind="text">
          {champ.icon ?? "—（無抽取圖示）"}
        </Row>
        <Row label="標籤" path="tags" kind="stringList">
          {champ.tags.map((t) => (
            <Chip key={t}>{t}</Chip>
          ))}
        </Row>
      </Section>
      <Section title="說明">
        <Editable path="description" kind="multiline">
          <Description text={champ.description} />
        </Editable>
      </Section>
      <Section title="數值">
        <StatTable base={champ.baseStats} growth={champ.growth} />
      </Section>
      <Section title={`技能（${kit.length}）`}>
        {kit.length === 0 && <div style={{ fontSize: 12, color: "#e08878" }}>此英雄沒有任何技能參照</div>}
        {kit.map((id) => {
          const ab = abilityById.get(id);
          return (
            <Link
              key={id}
              refTo={ab ? { kind: "ability", id } : null}
              label={ab ? `${ab.slot} · ${ab.name}` : id}
              glyph={ab?.cleanName ?? id}
              icon={ab?.icon ?? null}
              accent={ab ? SLOT_COLOR[ab.slot] : undefined}
              onNavigate={onNavigate}
            />
          );
        })}
      </Section>
      <EditOnly label="出裝順序" path="buildPriority" kind="stringList" />
      {champ.buildPriority.length > 0 && (
        <Section title="建議出裝">
          {champ.buildPriority.map((id) => {
            const it = itemById.get(id);
            return (
              <Link
                key={id}
                refTo={it ? { kind: "item", id } : null}
                label={it ? it.name : id}
                icon={it?.icon ?? null}
                onNavigate={onNavigate}
              />
            );
          })}
        </Section>
      )}
    </>
  );
}

function AbilityBody({ ability, data, onNavigate }: { ability: CodexAbility; data: CodexData; onNavigate: (r: CodexRef) => void }): React.JSX.Element {
  const owner = data.champions.find((c) => c.id === ability.championId) ?? null;
  const siblings = owner
    ? data.abilities.filter((a) => a.championId === owner.id && a.id !== ability.id)
    : [];
  return (
    <>
      <Section title="基本">
        <Row label="欄位" path="slot" kind="text">
          <Chip color={SLOT_COLOR[ability.slot]}>{ability.slot}</Chip>
        </Row>
        <Row label="編號">
          {ability.heroNumber ? `${ability.heroNumber}-${ability.skillIndex ?? "??"}` : "—（名稱沒有編號前綴）"}
        </Row>
        <EditOnly label="名稱" path="name" kind="text" />
        <Row label="技能名">{ability.cleanName}</Row>
        <Row label="施放" path="castType" kind="text">
          {castLabel(ability.castType)}
        </Row>
        <Row label="最大等級" path="maxRank" kind="integer">
          {ability.maxRank}
        </Row>
        <Row label="冷卻" path="cooldown" kind="numberList">
          {formatPerRank(ability.cooldown)} 秒
        </Row>
        <Row label="魔力" path="manaCost" kind="numberList">
          {formatPerRank(ability.manaCost)}
        </Row>
        <Row label="距離" path="range" kind="number">
          {num(ability.range)}
        </Row>
        {ability.radius !== null ? (
          <Row label="半徑 / 寬度" path="radius" kind="number">
            {num(ability.radius)}
          </Row>
        ) : (
          <EditOnly label="半徑 / 寬度" path="radius" kind="number" />
        )}
        {ability.castTimeSec !== null ? (
          <Row label="施法時間" path="castTimeSec" kind="number">
            {num(ability.castTimeSec)} 秒
          </Row>
        ) : (
          <EditOnly label="施法時間" path="castTimeSec" kind="number" />
        )}
        {ability.targetsEnemies !== null ? (
          <Row label="目標" path="targetsEnemies" kind="boolean">
            {ability.targetsEnemies ? "敵方" : "非敵方"}
          </Row>
        ) : (
          <EditOnly label="目標" path="targetsEnemies" kind="boolean" />
        )}
        <Row label="VFX" path="vfxKey" kind="text">
          {ability.vfxKey ?? "—"}
        </Row>
        <Row label="圖示" path="icon" kind="text">
          {ability.icon ?? "—（無抽取圖示）"}
        </Row>
      </Section>
      <Section title="說明">
        <Editable path="description" kind="multiline">
          <Description text={ability.description} />
        </Editable>
      </Section>
      <Section title="擁有者">
        <Link
          refTo={owner ? { kind: "champion", id: owner.id } : null}
          label={owner ? owner.name : (ability.championId ?? "?")}
          icon={owner?.icon ?? null}
          onNavigate={onNavigate}
        />
        {siblings.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 10, color: TEXT_DIM, marginBottom: 2 }}>同一英雄的其他技能</div>
            {siblings.map((s) => (
              <Link
                key={s.id}
                refTo={{ kind: "ability", id: s.id }}
                label={`${s.slot} · ${s.name}`}
                glyph={s.cleanName}
                icon={s.icon}
                accent={SLOT_COLOR[s.slot]}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        )}
      </Section>
      <Section title={`效果（${ability.effects.length}）`}>
        {ability.effects.length === 0 && <div style={{ fontSize: 12, color: TEXT_DIM }}>—</div>}
        {ability.effects.map((fx, i) => (
          <pre
            key={i}
            style={{
              background: "#0b0e16",
              border: "1px solid #202838",
              borderRadius: 6,
              padding: 7,
              fontSize: 10.5,
              lineHeight: 1.45,
              color: "#9fb0cc",
              overflow: "auto",
              marginBottom: 6,
              whiteSpace: "pre",
            }}
          >
            {JSON.stringify(fx, null, 2)}
          </pre>
        ))}
      </Section>
    </>
  );
}

function ItemBody({ item, data, recipes, onNavigate }: { item: CodexItem; data: CodexData; recipes: RecipeGraph; onNavigate: (r: CodexRef) => void }): React.JSX.Element {
  const itemById = new Map(data.items.map((i) => [i.id, i]));
  const recipe = recipes.recipeOf.get(item.id);
  const buildsInto = recipes.buildsInto.get(item.id) ?? [];
  const usedBy = data.champions.filter((c) => c.buildPriority.includes(item.id));
  return (
    <>
      <Section title="基本">
        <EditOnly label="名稱" path="name" kind="text" />
        <Row label="價格" path="cost" kind="integer">
          <span style={{ color: GOLD }}>{item.cost} g</span>
        </Row>
        <Row label="階級" path="tier" kind="integer">
          T{item.tier}
        </Row>
        <Row label="分類">
          <Chip>{bucketLabel(item.bucket)}</Chip>
          <span style={{ fontSize: 10, color: TEXT_DIM }}>
            {item.bucketSource === "doc" ? "（文件標註）" : "（由名稱/成本/加成推導 — 任務 #70 尚未寫入分類）"}
          </span>
        </Row>
        {item.unique ? (
          <Row label="唯一" path="unique" kind="boolean">
            是
          </Row>
        ) : (
          <EditOnly label="唯一" path="unique" kind="boolean" />
        )}
        <Row label="圖示" path="icon" kind="text">
          {item.icon ?? "—（無抽取圖示）"}
        </Row>
        <Row label="標籤" path="tags" kind="stringList">
          {item.tags.map((t) => (
            <Chip key={t}>{t}</Chip>
          ))}
        </Row>
      </Section>
      <Section title={`屬性加成（${item.modifiers.length}）`}>
        {item.modifiers.length === 0 ? (
          <div style={{ fontSize: 12, color: TEXT_DIM }}>
            沒有 modifiers{item.hasPassive ? "（但有 passive 觸發）" : "（效果可能寫在 JASS 觸發裡）"}
          </div>
        ) : (
          item.modifiers.map((m, i) => (
            <div key={i} style={{ fontSize: 12, color: TEXT_MAIN }}>
              {formatModifier(m)}
            </div>
          ))
        )}
      </Section>
      <Section title="說明">
        <Editable path="description" kind="multiline">
          <Description text={item.description} />
        </Editable>
      </Section>
      {recipe && (
        <Section title={`合成材料（${recipe.components.length}）`}>
          <div style={{ fontSize: 10, color: TEXT_DIM, marginBottom: 4 }}>
            {recipe.source === "doc" ? "來自文件的配方欄位" : "由說明文字的「合成配方」段落解析"}
          </div>
          {recipe.components.map((c, i) => {
            const it = c.id ? itemById.get(c.id) : null;
            return (
              <Link
                key={`${c.name}-${i}`}
                refTo={it ? { kind: "item", id: it.id } : null}
                label={it ? it.name : `${c.name}（找不到對應道具）`}
                icon={it?.icon ?? null}
                onNavigate={onNavigate}
              />
            );
          })}
        </Section>
      )}
      {buildsInto.length > 0 && (
        <Section title={`可合成為（${buildsInto.length}）`}>
          {buildsInto.map((id) => {
            const it = itemById.get(id);
            return (
              <Link
                key={id}
                refTo={it ? { kind: "item", id } : null}
                label={it?.name ?? id}
                icon={it?.icon ?? null}
                onNavigate={onNavigate}
              />
            );
          })}
        </Section>
      )}
      {usedBy.length > 0 && (
        <Section title={`推薦此道具的英雄（${usedBy.length}）`}>
          {usedBy.map((c) => (
            <Link
              key={c.id}
              refTo={{ kind: "champion", id: c.id }}
              label={c.name}
              icon={c.icon}
              onNavigate={onNavigate}
            />
          ))}
        </Section>
      )}
    </>
  );
}

export function CodexDetail({
  entry,
  data,
  recipes,
  onNavigate,
  onClose,
  EditSession = null,
  onReloadContent,
}: DetailProps): React.JSX.Element {
  const state = enabledState(data.whitelist, entry.kind, entry.id);
  const badge = ENABLED_TEXT[state];
  const heading = entry.name;
  // the icon-less fallback tile shows the first glyph of the DISPLAY name, not
  // of the raw name — an ability's raw name starts with its 編號 ("01-002 …"),
  // which would render a meaningless "0".
  const glyph =
    entry.kind === "ability" ? entry.cleanName : entry.kind === "champion" ? entry.fullName : entry.name;
  const accent = entry.kind === "ability" ? SLOT_COLOR[entry.slot] : undefined;

  const body = (
    <>
      {entry.kind === "champion" && <ChampionBody champ={entry} data={data} onNavigate={onNavigate} />}
      {entry.kind === "ability" && <AbilityBody ability={entry} data={data} onNavigate={onNavigate} />}
      {entry.kind === "item" && <ItemBody item={entry} data={data} recipes={recipes} onNavigate={onNavigate} />}
      <RawDoc doc={entry.doc} />
    </>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <CodexIcon icon={entry.icon} label={glyph} size={44} accent={accent} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: TEXT_MAIN, wordBreak: "break-word" }}>{heading}</div>
          <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 2 }}>{entry.id}</div>
          <div style={{ marginTop: 5 }}>
            <Chip color={badge.color}>{badge.label}</Chip>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="close detail"
          style={{
            background: "transparent",
            border: "1px solid #2c3448",
            borderRadius: 6,
            color: TEXT_DIM,
            cursor: "pointer",
            fontSize: 13,
            padding: "2px 8px",
          }}
        >
          ×
        </button>
      </div>
      {EditSession === null ? (
        <div style={BODY_STYLE}>{body}</div>
      ) : (
        <EditSession
          entry={entry}
          data={data}
          onSaved={onReloadContent ?? (() => undefined)}
          bodyStyle={BODY_STYLE}
        >
          {body}
        </EditSession>
      )}
    </div>
  );
}
