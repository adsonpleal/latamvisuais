// React binding for the theme preference: returns the current pref and a setter
// that persists it. The effect (re)applies the resolved theme to <html> whenever
// the pref changes, and — while on "auto" — keeps it in sync with the OS scheme.

import { useEffect, useState } from "react";
import { applyTheme, readThemePref, storeThemePref, watchSystemTheme, type ThemePref } from "../theme";

export function useTheme(): [ThemePref, (pref: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>(readThemePref);

  useEffect(() => {
    applyTheme(pref);
    if (pref !== "auto") return;
    return watchSystemTheme(() => applyTheme("auto"));
  }, [pref]);

  const update = (next: ThemePref) => {
    storeThemePref(next);
    setPref(next);
  };

  return [pref, update];
}
