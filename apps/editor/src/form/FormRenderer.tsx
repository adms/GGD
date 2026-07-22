/**
 * FormRenderer — renders a UISchema IR node against a value. Threads concrete
 * DATA paths ("effects.0.amount.flat") so validation errors (inline Zod +
 * server 422) land on the right widget.
 */
import type { ReactElement } from "react";
import type { UINode } from "./uiSchema";
import type { ErrorMap } from "../store";
import { TextField } from "./widgets/TextField";
import { NumberField } from "./widgets/NumberField";
import { BoolToggle } from "./widgets/BoolToggle";
import { EnumSelect } from "./widgets/EnumSelect";
import { ArrayField } from "./widgets/ArrayField";
import { DiscriminatedUnionField } from "./widgets/DiscriminatedUnionField";
import { RefSelect } from "./widgets/RefSelect";
import { ObjectFields } from "./widgets/ObjectFields";
import { RecordField } from "./widgets/RecordField";
import { JsonField } from "./widgets/JsonField";

export interface FieldProps {
  node: UINode;
  value: unknown;
  /** concrete data path of this value inside the doc */
  dataPath: string;
  errors: ErrorMap;
  onChange(dataPath: string, value: unknown): void;
}

export function FieldErrors({ dataPath, errors }: { dataPath: string; errors: ErrorMap }) {
  const msgs = errors[dataPath];
  if (!msgs || msgs.length === 0) return null;
  return (
    <div className="field-errors" role="alert">
      {msgs.map((m, i) => (
        <div key={i}>⚠ {m}</div>
      ))}
    </div>
  );
}

export function renderNode(props: FieldProps): ReactElement {
  const { node } = props;
  switch (node.kind) {
    case "text":
      return node.ref ? <RefSelect {...props} node={node} /> : <TextField {...props} node={node} />;
    case "number":
      return <NumberField {...props} node={node} />;
    case "boolean":
      return <BoolToggle {...props} node={node} />;
    case "enum":
      return <EnumSelect {...props} node={node} />;
    case "literal":
      return (
        <label className="field field-literal">
          <span className="field-label">{node.label}</span>
          <code>{String(node.value)}</code>
        </label>
      );
    case "array":
      return <ArrayField {...props} node={node} />;
    case "tuple":
      return (
        <fieldset className="field field-tuple">
          <legend>{node.label}</legend>
          {node.items.map((item, i) =>
            renderNode({
              ...props,
              node: item,
              value: Array.isArray(props.value) ? props.value[i] : undefined,
              dataPath: props.dataPath ? `${props.dataPath}.${i}` : String(i),
            }),
          )}
        </fieldset>
      );
    case "object":
      return <ObjectFields {...props} node={node} />;
    case "record":
      return <RecordField {...props} node={node} />;
    case "discriminatedUnion":
      return <DiscriminatedUnionField {...props} node={node} />;
    case "unknown":
      return <JsonField {...props} node={node} />;
  }
}

export function FormRenderer(props: FieldProps) {
  return <div className="form-root">{renderNode(props)}</div>;
}
