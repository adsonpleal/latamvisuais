// A remembered choice, shared by whoever asks for it.
//
// Two of these exist (the market server, the catalogue's grid/list view) and both
// want the same three things: survive a reload, be readable outside the component
// that sets it, and keep every reader in step. Doing that by hand twice meant two
// copies of the localStorage try/catch and a preference trapped in a component.
//
// `localStorage` is the source of truth; the subscriber set only propagates a
// change to readers already on screen. Storage being unavailable (private mode)
// is not an error — the choice just lasts the session.

import { useSyncExternalStore } from "react";

export type Pref<T extends string> = {
  get(): T;
  set(next: T): void;
  /** React binding: `const [value, setValue] = pref.use()`. */
  use(): [T, (next: T) => void];
};

export function persisted<T extends string>(
  key: string,
  values: readonly T[],
  fallback: T,
): Pref<T> {
  const listeners = new Set<() => void>();
  // Read lazily and then cache: `useSyncExternalStore` needs a stable snapshot.
  let current: T | null = null;

  const get = (): T => {
    if (current === null) {
      try {
        const saved = localStorage.getItem(key) as T | null;
        current = saved && values.includes(saved) ? saved : fallback;
      } catch {
        current = fallback;
      }
    }
    return current;
  };

  const set = (next: T): void => {
    const changed = next !== get();
    current = next;
    // Written even when unchanged: the cache is what `get` answers from, so a
    // storage that was cleared behind our back would otherwise never be caught
    // up. Only the notification is conditional — an unchanged value has no
    // reader to wake.
    try {
      localStorage.setItem(key, next);
    } catch {
      // Storage disabled — the choice still holds for this session.
    }
    if (!changed) return;
    for (const notify of listeners) notify();
  };

  const subscribe = (onChange: () => void): (() => void) => {
    listeners.add(onChange);
    return () => listeners.delete(onChange);
  };

  return { get, set, use: () => [useSyncExternalStore(subscribe, get), set] };
}
