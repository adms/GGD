/** Fallback editor for nodes the walker can't model (depth cap, odd unions). */
import { useState } from "react";
import type { FieldProps } from "../FormRenderer";
import { FieldErrors } from "../FormRenderer";
import type { UIUnknown } from "../uiSchema";

export function JsonField({ node, value, dataPath, errors, onChange }: FieldProps & { node: UIUnknown }) {
  const [text, setText] = useState(() => JSON.stringify(value ?? null, null, 2));
  const [parseError, setParseError] = useState<string | null>(null);

  return (
    <label className="field field-json">
      <span className="field-label">{node.label} (raw JSON)</span>
      <textarea
        rows={6}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            onChange(dataPath, JSON.parse(e.target.value));
            setParseError(null);
          } catch (err) {
            setParseError(String(err));
          }
        }}
      />
      {parseError ? <div className="field-errors">⚠ {parseError}</div> : null}
      <FieldErrors dataPath={dataPath} errors={errors} />
    </label>
  );
}
