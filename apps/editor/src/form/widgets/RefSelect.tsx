/**
 * RefSelect — a dropdown populated from the TARGET collection's _index (via
 * react-query). Soft refs also accept free text (the target may not be
 * authored yet — the pipeline only warns).
 */
import { useQuery } from "@tanstack/react-query";
import { isCollectionName, type CollectionIndex } from "@ggd/shared/content";
import { api } from "../../api/client";
import type { FieldProps } from "../FormRenderer";
import { FieldErrors } from "../FormRenderer";
import type { UIText } from "../uiSchema";

export function RefSelect({ node, value, dataPath, errors, onChange }: FieldProps & { node: UIText }) {
  const target = node.ref!.target;
  const soft = node.ref!.soft;
  const enabled = isCollectionName(target);
  const { data } = useQuery<CollectionIndex>({
    queryKey: ["index", target],
    queryFn: () => api.index(target as Parameters<typeof api.index>[0]),
    enabled,
    staleTime: 10_000,
  });

  const ids = data?.entries.map((e) => e.id) ?? [];
  const current = typeof value === "string" ? value : "";
  const known = ids.includes(current);

  return (
    <label className="field field-ref">
      <span className="field-label">
        {node.label} <em className="ref-target">→ {target}{soft ? " (soft)" : ""}</em>
      </span>
      <select
        value={known ? current : current ? "__custom" : ""}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__custom") return;
          onChange(dataPath, v === "" ? (node.optional ? undefined : "") : v);
        }}
      >
        <option value="">—</option>
        {ids.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
        {!known && current ? <option value="__custom">{current} (unresolved)</option> : null}
      </select>
      {soft ? (
        <input
          type="text"
          placeholder="or type a new id…"
          value={current}
          onChange={(e) => onChange(dataPath, e.target.value === "" && node.optional ? undefined : e.target.value)}
        />
      ) : null}
      {!known && current && !soft ? <div className="field-errors">⚠ unknown {target} id</div> : null}
      <FieldErrors dataPath={dataPath} errors={errors} />
    </label>
  );
}
