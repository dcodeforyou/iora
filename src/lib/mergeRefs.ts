import type { Ref, RefCallback } from "react";

/** Merges a local ref with a forwarded ref so a component can use both. */
export function mergeRefs<T>(...refs: Array<Ref<T> | undefined>): RefCallback<T> {
  return (value) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === "function") ref(value);
      else (ref as { current: T | null }).current = value;
    }
  };
}
