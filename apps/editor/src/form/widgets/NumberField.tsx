import type { FieldProps } from "../FormRenderer";
import { FieldErrors } from "../FormRenderer";
import type { UINumber } from "../uiSchema";

export function NumberField({ node, value, dataPath, errors, onChange }: FieldProps & { node: UINumber }) {
  const numberValue = typeof value === "number" ? value : undefined;
  const setRaw = (raw: string): void => {
    if (raw === "") {
      onChange(dataPath, node.optional ? undefined : 0);
      return;
    }
    const n = node.int ? parseInt(raw, 10) : parseFloat(raw);
    if (!Number.isNaN(n)) onChange(dataPath, n);
  };
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
        value={numberValue ?? ""}
        onChange={(e) => setRaw(e.target.value)}
      />
      {node.min !== undefined && node.max !== undefined ? (
        <input
          className="field-range"
          type="range"
          aria-label={`${node.label} slider`}
          step={node.int ? 1 : Math.max((node.max - node.min) / 200, 0.001)}
          min={node.min}
          max={node.max}
          value={numberValue ?? Math.min(node.max, Math.max(node.min, 0))}
          onChange={(e) => setRaw(e.target.value)}
        />
      ) : null}
      <FieldErrors dataPath={dataPath} errors={errors} />
    </label>
  );
}
