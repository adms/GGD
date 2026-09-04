import { useCallback, useState } from "react";

export interface UndoHistory<T> {
  readonly value: T;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  commit(next: T | ((current: T) => T)): void;
  reset(next: T): void;
  undo(): void;
  redo(): void;
}

interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

/**
 * Bounded immutable history shared by the no-code authoring surfaces.
 * `reset` is for switching documents; `commit` is for user edits.
 */
export function useUndoHistory<T>(
  initial: T,
  equals: (a: T, b: T) => boolean = Object.is,
  limit = 100,
): UndoHistory<T> {
  const [state, setState] = useState<HistoryState<T>>({ past: [], present: initial, future: [] });

  const commit = useCallback((next: T | ((current: T) => T)): void => {
    setState((current) => {
      const value = typeof next === "function"
        ? (next as (current: T) => T)(current.present)
        : next;
      if (equals(current.present, value)) return current;
      return {
        past: [...current.past, current.present].slice(-limit),
        present: value,
        future: [],
      };
    });
  }, [equals, limit]);

  const reset = useCallback((next: T): void => {
    setState({ past: [], present: next, future: [] });
  }, []);

  const undo = useCallback((): void => {
    setState((current) => {
      if (current.past.length === 0) return current;
      return {
        past: current.past.slice(0, -1),
        present: current.past[current.past.length - 1]!,
        future: [current.present, ...current.future].slice(0, limit),
      };
    });
  }, [limit]);

  const redo = useCallback((): void => {
    setState((current) => {
      if (current.future.length === 0) return current;
      return {
        past: [...current.past, current.present].slice(-limit),
        present: current.future[0]!,
        future: current.future.slice(1),
      };
    });
  }, [limit]);

  return {
    value: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    commit,
    reset,
    undo,
    redo,
  };
}

export function sameJson(a: unknown, b: unknown): boolean {
  return Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b);
}
