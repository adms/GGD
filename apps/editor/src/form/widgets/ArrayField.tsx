import type { FieldProps } from "../FormRenderer";
import { FieldErrors, renderNode } from "../FormRenderer";
import { defaultValueFor } from "../walk";
import type { UIArray } from "../uiSchema";

export function ArrayField({ node, value, dataPath, errors, onChange }: FieldProps & { node: UIArray }) {
  const arr = Array.isArray(value) ? value : [];

  const setArr = (next: unknown[]) =>
    onChange(dataPath, node.optional && next.length === 0 ? undefined : next);

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    const next = [...arr];
    const a = next[i];
    next[i] = next[j];
    next[j] = a;
    setArr(next);
  };

  return (
    <fieldset className="field field-array">
      <legend>
        {node.label} <span className="count">({arr.length})</span>
      </legend>
      {arr.map((item, i) => (
        <div className="array-item" key={i}>
          <div className="array-item-tools">
            <button type="button" title="move up" disabled={i === 0} onClick={() => move(i, -1)}>
              ↑
            </button>
            <button
              type="button"
              title="move down"
              disabled={i === arr.length - 1}
              onClick={() => move(i, 1)}
            >
              ↓
            </button>
            <button
              type="button"
              title="remove"
              onClick={() => setArr(arr.filter((_, k) => k !== i))}
            >
              ✕
            </button>
          </div>
          {renderNode({
            node: node.item,
            value: item,
            dataPath: dataPath ? `${dataPath}.${i}` : String(i),
            errors,
            onChange,
          })}
        </div>
      ))}
      <button type="button" className="array-add" onClick={() => setArr([...arr, defaultValueFor(node.item)])}>
        + add {node.label.replace(/s$/, "").toLowerCase() || "item"}
      </button>
      <FieldErrors dataPath={dataPath} errors={errors} />
    </fieldset>
  );
}
