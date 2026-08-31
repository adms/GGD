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
  /** Schema paths protected by the generated editor contract. */
  readOnlyReasons?: ReadonlyMap<string, string>;
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

/**
 * 欄位說明 —— schema 上 `.describe()` 寫的那一句。
 *
 * ⛔ **這個管線在 2026-08-05 之前是斷的。** `walk.ts` 一路把 `description` 收進
 * 節點（`walk.ts:74` 的 `base`）、`UIBase.description` 也宣告了，而**十個 widget
 * 沒有一個畫它** —— 全 `apps/editor/src/form/widgets/` grep `node.description`
 * 零命中。今天 repo 裡已經有 **25 句**作者寫好的 `.describe()`
 * （`schema/item.ts` 24 句、`schema/common.ts` 1 句），而編輯器上一個字都看不到。
 *
 * 這是失敗形態 ③ 的教科書案例：**整條路可以從渲染樹刪掉而測試全綠**，
 * 因為它本來就沒有被畫出來。
 *
 * 補在 `renderNode` 而不是十個 widget 各補一次，理由有兩個：
 *   ① 一個地方 = 十個 widget 一起活過來，而且**下一個新 widget 免費得到它**；
 *   ② widget 各補一次的話，「有一個忘了」跟「那個欄位沒有說明」長得一模一樣。
 */
function FieldHint({ text }: { text: string }): ReactElement {
  return (
    <p className="field-hint" data-testid="field-hint">
      {text}
    </p>
  );
}

export function renderNode(props: FieldProps): ReactElement {
  const el = renderWidget(props);
  const d = props.node.description;
  // ⚠️ `ref:` 開頭的那一種不是給人看的說明，是 walker 拿來標「這是一個參照」的
  //（見 `walk.ts` 的 `refFromDescription`）。`walk.ts:74` 已經把它濾掉了，
  // 這裡不再濾第二次 —— 兩個地方各濾一次，改一邊就會有一邊過期。
  const described = d ? (
    <>
      {el}
      <FieldHint text={d} />
    </>
  ) : (
    el
  );
  const readOnlyReason = props.readOnlyReasons?.get(props.node.path);
  return readOnlyReason ? (
    <fieldset className="owner-only-field" disabled data-owner-only-path={props.node.path}>
      <legend>🔒 Owner 專屬設定 · 唯讀</legend>
      {described}
      <p>{readOnlyReason}</p>
    </fieldset>
  ) : described;
}

function renderWidget(props: FieldProps): ReactElement {
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
          {node.items.map((item, i) => (
            <div key={`${item.path}:${i}`}>
              {renderNode({
                ...props,
                node: item,
                value: Array.isArray(props.value) ? props.value[i] : undefined,
                dataPath: props.dataPath ? `${props.dataPath}.${i}` : String(i),
              })}
            </div>
          ))}
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
