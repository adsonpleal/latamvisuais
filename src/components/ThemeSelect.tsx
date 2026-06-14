// Theme dropdown (Auto / Claro / Escuro) for the top-right of the topbar.
// "Auto" follows the OS scheme; the other two force light/dark. The choice is
// persisted and applied to <html data-theme> by useTheme.

import { t } from "../i18n";
import { useTheme } from "../hooks/useTheme";
import type { ThemePref } from "../theme";

const OPTIONS: { value: ThemePref; label: string }[] = [
  { value: "auto", label: t.themeAuto },
  { value: "light", label: t.themeLight },
  { value: "dark", label: t.themeDark },
];

export function ThemeSelect() {
  const [pref, setPref] = useTheme();
  return (
    <select
      className="theme-select"
      aria-label={t.themeLabel}
      value={pref}
      onChange={(e) => setPref(e.target.value as ThemePref)}
    >
      {OPTIONS.map(({ value, label }) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}
