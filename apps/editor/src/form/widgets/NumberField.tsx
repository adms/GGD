import type { FieldProps } from "../FormRenderer";
import { FieldErrors } from "../FormRenderer";
import type { UINumber } from "../uiSchema";

export function NumberField({ node, value, dataPath, errors, onChange }: FieldProps & { node: UINumber }) {
  return (
    <label className="field field-number">
      <span className="field-label">
        {node.label}
        {node.optional ? <em> (optional)</em> : null}
      </span>
      <input
        type="number"
        step={node.int ? 1 : "any"}
        min={node.min}
        max={node.max}
        value={typeof value === "number" ? value : ""}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") {
            onChange(dataPath, node.optional ? undefined : 0);
            return;
          }
          const n = node.int ? parseInt(raw, 10) : parseFloat(raw);
          if (!Number.isNaN(n)) onChange(dataPath, n);
        }}
      />
      <FieldErrors dataPath={dataPath} errors={errors} />
    </label>
  );
}
