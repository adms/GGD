/** Parser for per-feature TODO markdown files. */

export interface TodoItem {
  id: string;
  item: string;
  testId: string;
  category: string;
  status: string;
  file: string;
  line: number;
}

export interface ParseResult {
  items: TodoItem[];
  errors: string[];
}

export const CATEGORIES = [
  "unit",
  "integration",
  "e2e",
  "exception",
  "injection",
  "security",
  "vuln",
  "determinism",
  "regression",
] as const;

export const STATUSES = ["pending", "in-progress", "done", "deferred"] as const;

const splitRow = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

const isSeparator = (cells: string[]): boolean =>
  cells.every((c) => /^:?-{2,}:?$/.test(c));

/** Parse one TODO markdown file into structured items. */
export function parseTodoMarkdown(file: string, content: string): ParseResult {
  const lines = content.split(/\r?\n/);
  const items: TodoItem[] = [];
  const errors: string[] = [];

  let headerCols: string[] | null = null;
  let colIndex: Record<string, number> = {};

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    if (!raw.trim().startsWith("|")) {
      headerCols = null; // table ended
      continue;
    }
    const cells = splitRow(raw);

    if (!headerCols) {
      // Expect a header row containing "test id"
      const lower = cells.map((c) => c.toLowerCase());
      if (lower.includes("test id")) {
        headerCols = lower;
        colIndex = {
          id: lower.indexOf("id"),
          item: lower.indexOf("item"),
          testId: lower.indexOf("test id"),
          category: lower.indexOf("category"),
          status: lower.indexOf("status"),
        };
        for (const [k, idx] of Object.entries(colIndex)) {
          if (idx < 0) errors.push(`${file}:${i + 1} table is missing column "${k}"`);
        }
      }
      continue;
    }

    if (isSeparator(cells)) continue;

    const get = (k: string): string => cells[colIndex[k]!] ?? "";
    const item: TodoItem = {
      id: get("id"),
      item: get("item"),
      testId: get("testId"),
      category: get("category").toLowerCase(),
      status: get("status").toLowerCase(),
      file,
      line: i + 1,
    };
    items.push(item);
  }

  return { items, errors };
}
