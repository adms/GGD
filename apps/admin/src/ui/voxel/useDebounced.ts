/**
 * Debounce a changing value, so dragging a slider does not rebuild the Babylon
 * scene on every pixel.
 *
 * COPIED, not imported, from `apps/editor/src/preview3d/useDebounced.ts`:
 * apps/admin has no workspace dependency on apps/editor and they are separate
 * vite apps. Eleven lines of duplication is the cheaper of the two mistakes —
 * see `apps/admin/src/dev/loopbackOnly.ts`, which the repo deliberately
 * re-implements a third time for the same reason.
 */
import { useEffect, useState } from "react";

export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}
