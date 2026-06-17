// "Novidades" modal — renders the user-facing changelog (src/changelog.ts).
// Opened from a footer link; closes on the × button, backdrop click, or Escape.

import { useEffect } from "react";
import { CHANGELOG } from "../changelog";
import { t } from "../i18n";

export function Changelog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="changelog-modal"
      role="dialog"
      aria-modal="true"
      aria-label={t.changelogTitle}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="changelog-box">
        <div className="changelog-head">
          <h2 className="changelog-title">{t.changelogTitle}</h2>
          <button type="button" className="changelog-close game-close" aria-label={t.closeModal} onClick={onClose} />
        </div>
        <div className="changelog-body">
          {CHANGELOG.map((entry) => (
            <section key={entry.version} className="changelog-entry">
              <h3 className="changelog-version">
                v{entry.version}
                <span className="changelog-date">{entry.date}</span>
              </h3>
              <ul className="changelog-list">
                {entry.changes.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
              {entry.credit && <p className="changelog-credit">{entry.credit}</p>}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
