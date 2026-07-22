/** Free-key record (attachPoints, stat tables, tierSchedule). */
import { useState } from "react";
import type { FieldProps } from "../FormRenderer";
import { FieldErrors, renderNode } from "../FormRenderer";
import { defaultValueFor } from "../walk";
import type { UIRecord } from "../uiSchema";

export function RecordField({ node, value, dataPath, errors, onChange }: FieldProps & { node: UIRecord }) {
  const record = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const [newKey, setNewKey] = useState("");

  const setRecord = (next: Record<string, unknown>) => onChange(dataPath, next);

  return (
    <fieldset className="field field-record">
      <legend>
        {node.label}
        {node.optional ? <em> (optional)</em> : null}
      </legend>
      {Object.entries(record).map(([key, v]) => (
        <div className="record-entry" key={key}>
          <div className="record-entry-head">
            <code>{key}</code>
            <button
              type="button"
              title="remove"
              onClick={() => {
                const next = { ...record };
                delete next[key];
                setRecord(next);
              }}
            >
              ✕
            </button>
          </div>
          {renderNode({
            node: node.value,
            value: v,
            dataPath: dataPath ? `${dataPath}.${key}` : key,
            errors,
            onChange,
          })}
        </div>
      ))}
      <div className="record-add">
        <input
          type="text"
          placeholder="new key"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
        />
        <button
          type="button"
          disabled={!newKey || newKey in record}
          onClick={() => {
            setRecord({ ...record, [newKey]: defaultValueFor(node.value) });
            setNewKey("");
          }}
        >
          + add
        </button>
      </div>
      <FieldErrors dataPath={dataPath} errors={errors} />
    </fieldset>
  );
}
