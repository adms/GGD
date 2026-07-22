import type { FieldProps } from "../FormRenderer";
import { FieldErrors } from "../FormRenderer";
import type { UIEnum } from "../uiSchema";

export function EnumSelect({ node, value, dataPath, errors, onChange }: FieldProps & { node: UIEnum }) {
  return (
    <label className="field field-enum">
      <span className="field-label">
        {node.label}
        {node.optional ? <em> (optional)</em> : null}
      </span>
      <select
        value={value === undefined || value === null ? "" : String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "" && node.optional) {
            onChange(dataPath, undefined);
            return;
          }
          const match = node.options.find((o) => String(o) === raw);
          onChange(dataPath, match);
        }}
      >
        {node.optional ? <option value="">—</option> : null}
        {node.options.map((o) => (
          <option key={String(o)} value={String(o)}>
            {String(o)}
          </option>
        ))}
      </select>
      <FieldErrors dataPath={dataPath} errors={errors} />
    </label>
  );
}
