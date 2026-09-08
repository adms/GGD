import type { FieldProps } from "../FormRenderer";
import { FieldErrors } from "../FormRenderer";
import type { UINumber, UINumberOrArray } from "../uiSchema";
import { defaultValueFor } from "../walk";
import { useRawInputs } from "../RawInputContext";
import { NumberField } from "./NumberField";

export function NumberOrArrayField(props: FieldProps & { node: UINumberOrArray }) {
  const { node, value, dataPath, onChange, errors } = props;
  const inputs = useRawInputs();
  const mode = Array.isArray(value) ? "array" : value === undefined && node.optional ? "" : "number";
  const columns: unknown[] = Array.isArray(value) ? value : [];
  const setRaw = (path: string, value: unknown) => inputs?.set(path, typeof value === "number" ? String(value) : "", "number");
  const switchMode = (nextMode: string) => {
    const first = typeof value === "number" ? value : columns[0];
    const target: UINumber = nextMode === "array" ? node.item : node.number;
    const fits = typeof first === "number" && Number.isFinite(first) && (!target.int || Number.isInteger(first)) &&
      (target.min === undefined || (target.exclusiveMin ? first > target.min : first >= target.min)) &&
      (target.max === undefined || (target.exclusiveMax ? first < target.max : first <= target.max));
    const scalar = fits ? first : defaultValueFor(target);
    const next = nextMode === "array"
      ? Array.from({ length: Math.max(1, node.minItems) }, () => scalar)
      : nextMode === "number" ? scalar : undefined;
    // Numeric text is persisted separately from the JSON draft. Clear the old
    // representation so neither stale JSON nor removed columns can block Save.
    for (const path of Object.keys(inputs?.values ?? {})) {
      if (path === dataPath || path.startsWith(`${dataPath}.`)) setRaw(path, undefined);
    }
    if (Array.isArray(next)) next.forEach((n, i) => setRaw(`${dataPath}.${i}`, n));
    else setRaw(dataPath, next);
    onChange(dataPath, next);
  };
  return <fieldset className="field field-number-or-array">
    <legend>{node.label}{node.optional ? <em> (optional)</em> : null}</legend>
    <label className="field">
      <span className="field-label">取值方式</span>
      <select aria-label={`${node.label} 取值方式`} data-field={`${dataPath}.$mode`} value={mode}
        onChange={e => switchMode(e.target.value)}>
        {node.optional ? <option value="">—</option> : null}
        <option value="number">所有等級共用</option>
        <option value="array">逐階設定</option>
      </select>
    </label>
    {mode === "number" ? <NumberField {...props} node={{ ...node.number, label: "數值" }} /> : null}
    {mode === "array" ? <>
      <p>切回共用時採第一階數值。</p>
      {columns.map((n, i) => <NumberField key={i} {...props} value={n} dataPath={`${dataPath}.${i}`}
        node={{ ...node.item, label: `第 ${i + 1} 階` }} />)}
      <button type="button" disabled={node.maxItems !== undefined && columns.length >= node.maxItems}
        onClick={() => {
          const next = defaultValueFor(node.item);
          setRaw(`${dataPath}.${columns.length}`, next);
          onChange(dataPath, [...columns, next]);
        }}>新增一階</button>
      <button type="button" disabled={columns.length <= node.minItems}
        onClick={() => {
          setRaw(`${dataPath}.${columns.length - 1}`, undefined);
          onChange(dataPath, columns.slice(0, -1));
        }}>移除最後一階</button>
    </> : null}
    <FieldErrors dataPath={dataPath} errors={errors} />
  </fieldset>;
}
