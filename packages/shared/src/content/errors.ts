/** Typed content-pipeline errors. */
import type { ZodError } from "zod";

export interface FieldIssue {
  /** dot path into the document, e.g. "effects.0.amount.flat" */
  path: string;
  message: string;
  code: string;
}

export class ContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** A document failed its Zod schema. */
export class SchemaValidationError extends ContentError {
  constructor(
    readonly collection: string,
    readonly id: string,
    readonly issues: FieldIssue[],
  ) {
    super(
      `${collection}/${id}: schema validation failed — ` +
        issues.map((i) => `${i.path || "(root)"}: ${i.message}`).join("; "),
    );
  }
}

/** A hard reference points at a document that doesn't exist. */
export class DanglingRefError extends ContentError {
  constructor(
    readonly fromCollection: string,
    readonly fromId: string,
    readonly field: string,
    readonly targetCollection: string,
    readonly targetId: string,
  ) {
    super(
      `${fromCollection}/${fromId} field "${field}" references missing ` +
        `${targetCollection}/${targetId}`,
    );
  }
}

/** manifest.json / _index.json is malformed or inconsistent. */
export class ManifestError extends ContentError {}

/** Aggregate failure from a full load pass. */
export class ContentLoadError extends ContentError {
  constructor(readonly errors: ContentError[]) {
    super(`content load failed with ${errors.length} error(s):\n` + errors.map((e) => "  - " + e.message).join("\n"));
  }
}

/** Flatten a ZodError into UI-mappable field issues. */
export function zodIssues(err: ZodError): FieldIssue[] {
  return err.issues.map((i) => ({
    path: i.path.join("."),
    message: i.message,
    code: i.code,
  }));
}
