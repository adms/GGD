/**
 * Generic collection preview. The focused asset collections already use their
 * real Babylon panels; Forge/VFX Forge own the full dual-actor ability stage.
 * The structured ability/stat half here remains deliberately renderless until
 * main exposes one reusable generic client render bridge (see
 * BabylonPreview.todo.md). The numbers are REAL: FinalStats come from a
 * sandbox SimWorld through the actual statPipeline; ability amounts resolve
 * through the actual resolveScaling with those stats.
 */
import { Suspense, lazy, useMemo, useState } from "react";
import {
  zChampionDoc,
  zItemDoc,
  zAugmentDoc,
  zAbilityDoc,
  type CollectionName,
} from "@ggd/shared/content";
import type { CoreAbilitySlot, ChampionDef, ItemDef, AugmentDef, AbilityDef } from "@ggd/shared/sim";
import { createSimPreviewController } from "./PreviewController";
import { has3DPreview } from "../preview3d/which";
import { useChampionDocs } from "./useChampionDocs";

// Babylon + loaders live in a lazy chunk; non-3D collections never pay for it
const Preview3D = lazy(() => import("../preview3d/Preview3D"));

const controller = createSimPreviewController();

const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2));

function StatTable({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <table className="preview-stats">
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td>{r.label}</td>
            <td>{r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ChampionPreview({ doc }: { doc: unknown }) {
  const [level, setLevel] = useState(1);
  const parsed = zChampionDoc.safeParse(doc);
  const result = useMemo(() => {
    if (!parsed.success) return null;
    try {
      return controller.previewChampion(parsed.data as unknown as ChampionDef, { level });
    } catch (e) {
      return { error: String(e) } as const;
    }
  }, [doc, level, parsed.success]);

  if (!parsed.success) return <p className="preview-note">Fix validation errors to preview.</p>;
  if (!result) return null;
  if ("error" in result) return <p className="preview-note">Preview error: {result.error}</p>;
  return (
    <div>
      <label>
        Level {level}
        <input type="range" min={1} max={18} value={level} onChange={(e) => setLevel(Number(e.target.value))} />
      </label>
      <p className="preview-note">
        FinalStats from a sandbox SimWorld via the real statPipeline (hp {fmt(result.hp)} / mana {fmt(result.mana)}):
      </p>
      <StatTable
        rows={Object.entries(result.finalStats).map(([stat, v]) => ({ label: stat, value: fmt(v as number) }))}
      />
    </div>
  );
}

function AbilityPreview({ doc }: { doc: unknown }) {
  const parsed = zAbilityDoc.safeParse(doc);
  const { champions, isLoading, error: championsError } = useChampionDocs();
  const [level, setLevel] = useState(1);

  const result = useMemo(() => {
    if (!parsed.success) return null;
    const ability = parsed.data as unknown as AbilityDef;
    // find the owning champion; substitute the EDITED ability into its slot
    const owner = champions.find((c) =>
      (["Q", "W", "E", "R"] as const).some((s) => c.abilities[s].id === ability.id),
    );
    // EX abilities are standalone (never embedded in a champion's Q/W/E/R), so
    // there is no owner to sandbox-preview against — show the doc without lines.
    if (!owner || ability.slot === "EX") return { ability, lines: null } as const;
    const champ: ChampionDef = {
      ...(owner as unknown as ChampionDef),
      abilities: { ...(owner as unknown as ChampionDef).abilities, [ability.slot]: ability },
    };
    try {
      return controller.previewAbility(champ, ability.slot as CoreAbilitySlot, { level });
    } catch (e) {
      return { error: String(e) } as const;
    }
  }, [doc, champions, level, parsed.success]);

  if (!parsed.success) return <p className="preview-note">Fix validation errors to preview.</p>;
  if (isLoading) return <p className="preview-note">Loading champion owner…</p>;
  if (championsError) return <p className="preview-note">Champion owner index failed: {championsError.message}</p>;
  if (!result) return null;
  if ("error" in result) return <p className="preview-note">Preview error: {result.error}</p>;
  if (!("lines" in result) || result.lines === null) {
    return <p className="preview-note">No champion owns this ability yet — save it into a champion slot to preview scaling.</p>;
  }
  const a = result.ability;
  return (
    <div>
      <label>
        Caster level {level}
        <input type="range" min={1} max={18} value={level} onChange={(e) => setLevel(Number(e.target.value))} />
      </label>
      <StatTable
        rows={[
          { label: "slot / cast", value: `${a.slot} · ${a.castType}` },
          { label: "cooldown", value: a.cooldown.map(fmt).join(" / ") },
          { label: "mana", value: a.manaCost.map(fmt).join(" / ") },
          { label: "range", value: fmt(a.range) + (a.radius ? ` (radius ${fmt(a.radius)})` : "") },
        ]}
      />
      <p className="preview-note">Effects (amounts per rank, resolved with real FinalStats):</p>
      <ul className="preview-effects">
        {result.lines.map((l, i) => (
          <li key={i} style={{ marginLeft: l.depth * 16 }}>
            <code>{l.kind}</code> {l.summary}
            {l.perRank ? <strong> {l.perRank.map(fmt).join(" / ")}</strong> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DeltaPreview({ doc, mode }: { doc: unknown; mode: "item" | "augment" }) {
  const { champions, isLoading, error: championsError } = useChampionDocs();
  const [champIdx, setChampIdx] = useState(0);
  const parsed = mode === "item" ? zItemDoc.safeParse(doc) : zAugmentDoc.safeParse(doc);

  const result = useMemo(() => {
    if (!parsed.success || champions.length === 0) return null;
    const on = champions[Math.min(champIdx, champions.length - 1)]! as unknown as ChampionDef;
    try {
      return mode === "item"
        ? controller.previewItem(parsed.data as unknown as ItemDef, on)
        : controller.previewAugment(parsed.data as unknown as AugmentDef, on);
    } catch (e) {
      return { error: String(e) } as const;
    }
  }, [doc, champions, champIdx, mode, parsed.success]);

  if (!parsed.success) return <p className="preview-note">Fix validation errors to preview.</p>;
  if (isLoading) return <p className="preview-note">Loading champions…</p>;
  if (championsError) return <p className="preview-note">Champion index failed: {championsError.message}</p>;
  if (!result) return <p className="preview-note">Loading champions…</p>;
  if ("error" in result) return <p className="preview-note">Preview error: {String(result.error)}</p>;
  return (
    <div>
      <label>
        On champion{" "}
        <select value={champIdx} onChange={(e) => setChampIdx(Number(e.target.value))}>
          {champions.map((c, i) => (
            <option key={c.id} value={i}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <p className="preview-note">Stat deltas (ModifierSource attached in a sandbox SimWorld):</p>
      {result.length === 0 ? (
        <p className="preview-note">No stat changes (hooks-only — effects fire on events).</p>
      ) : (
        <StatTable
          rows={result.map((d) => ({
            label: d.stat,
            value: `${fmt(d.before)} → ${fmt(d.after)} (${d.after >= d.before ? "+" : ""}${fmt(d.after - d.before)})`,
          }))}
        />
      )}
    </div>
  );
}

export function PreviewPanel({ collection, doc }: { collection: CollectionName; doc: unknown }) {
  const with3d = has3DPreview(collection);
  let body;
  switch (collection) {
    case "champions":
      body = <ChampionPreview doc={doc} />;
      break;
    case "abilities":
      body = <AbilityPreview doc={doc} />;
      break;
    case "items":
      body = <DeltaPreview doc={doc} mode="item" />;
      break;
    case "augments":
      body = <DeltaPreview doc={doc} mode="augment" />;
      break;
    // GH#324 —— 地圖的 3D 面板已經印出九項驗證指標，底下再貼一份 raw JSON
    // 只會把報告推到捲軸外面（而報告正是這一頁存在的理由）。
    // ⚠️ 註解**寫在 case 群組上面**，⛔ 不是夾在 `arenas` 與 `maps` 中間：eslint 的
    //   `no-fallthrough` 只在空 case 與下一個 case **同行或連續行**時放行 ⇒ 夾住就紅。
    //   ⭐ 行為一個位元組都沒動。
    case "models":
    case "vfx":
    case "arenas":
    case "maps":
      body = null; // the 3D panel IS the preview; the form already shows the data
      break;
    default:
      body = (
        <pre className="preview-json">{JSON.stringify(doc, null, 2)}</pre>
      );
  }
  return (
    <aside className="preview-panel">
      <h3>Preview</h3>
      {with3d ? (
        <Suspense fallback={<p className="preview-note">Loading 3D panel…</p>}>
          <Preview3D collection={collection} doc={doc} />
        </Suspense>
      ) : (
        <p className="preview-seam">3D panel pending for this collection — see preview/BabylonPreview.todo.md</p>
      )}
      {body}
    </aside>
  );
}
