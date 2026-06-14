// Theme preference: "auto" follows the OS, "light"/"dark" force a scheme.
// The preference is what the user picks (and what we persist); the *resolved*
// theme ("light"|"dark") is what we actually paint and is written to
// <html data-theme="…"> so styles.css can react to it. Keeping the resolution
// in JS (rather than a CSS prefers-color-scheme query) means the dark rules in
// styles.css need a single selector, and the inline boot script in index.html
// applies the same data-theme before first paint to avoid a flash.

export type ThemePref = "auto" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

export function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "auto") return v;
  } catch {
    // localStorage can throw (private mode / disabled) — fall back to auto.
  }
  return "auto";
}

export function storeThemePref(pref: ThemePref): void {
  try {
    // "auto" is the default, so clear the key rather than storing it.
    if (pref === "auto") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // Ignore persistence failures — the in-memory choice still applies.
  }
}

export function systemTheme(): ResolvedTheme {
  return window.matchMedia?.(DARK_QUERY).matches ? "dark" : "light";
}

export function resolveTheme(pref: ThemePref): ResolvedTheme {
  return pref === "auto" ? systemTheme() : pref;
}

export function applyTheme(pref: ThemePref): void {
  document.documentElement.dataset.theme = resolveTheme(pref);
}

export function watchSystemTheme(onChange: () => void): () => void {
  const mq = window.matchMedia?.(DARK_QUERY);
  if (!mq) return () => {};
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
