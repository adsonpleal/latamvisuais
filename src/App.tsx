// App root: loads the static DBs, owns the single build State via a reducer,
// keeps the share URL in sync, and lays out the three panels. This is the
// React equivalent of the old main.ts `start()` — same DOM structure and class
// names, so styles.css applies unchanged.

import { useEffect, useMemo, useReducer, useState } from "react";
import type { Db, Slot } from "./core/db";
import { clampState } from "./core/clamp";
import { createAppReducer } from "./core/reducer";
import { initialState } from "./core/state";
import { readUrlState, syncUrl } from "./core/url";
import { t } from "./i18n";
import { useLoadDb } from "./hooks/useLoadDb";
import { useTooltip } from "./hooks/useTooltip";
import { AppStateProvider } from "./state/AppStateContext";
import { AppearancePanel } from "./components/AppearancePanel";
import { Catalog } from "./components/Catalog";
import { ClassSelect } from "./components/ClassSelect";
import { Preview } from "./components/Preview";
import { Slots } from "./components/Slots";
import { ThemeSelect } from "./components/ThemeSelect";
import { Wishlist } from "./components/Wishlist";

export default function App() {
  useTooltip();
  const db = useLoadDb();

  if (db.status === "loading") return <div className="boot-message">{t.loading}</div>;
  if (db.status === "error") return <div className="boot-message">{t.loadError}</div>;
  return <Simulator db={db.db} />;
}

function Simulator({ db }: { db: Db }) {
  const reducer = useMemo(() => createAppReducer(db), [db]);
  const [state, dispatch] = useReducer(reducer, db, (db) =>
    clampState(db, { ...initialState(db), ...(readUrlState(db) ?? {}) }),
  );

  // Reflect the current build in the address bar — runs once on mount (the old
  // "re-sync immediately") and after every change.
  useEffect(() => {
    syncUrl(state, db);
  }, [state, db]);

  // Catalog filter shared between the slots (clicking an empty slot filters the
  // catalogue to it) and the catalogue chips. `pickSignal` bumps only on a slot
  // click so the catalogue can scroll back to the top then, not on chip changes.
  const [slotFilter, setSlotFilter] = useState<Slot | null>(null);
  const [pickSignal, setPickSignal] = useState(0);
  const pickSlot = (slot: Slot) => {
    setSlotFilter(slot);
    setPickSignal((n) => n + 1);
  };

  return (
    <AppStateProvider value={{ db, state, dispatch }}>
      <header className="topbar">
        <div className="topbar-heading">
          <h1>{t.appTitle}</h1>
          <span className="topbar-sub">{t.appSubtitle}</span>
        </div>
        <ThemeSelect />
      </header>

      <main className="layout">
        <section className="panel panel-appearance">
          <h2 className="panel-title">{t.appearanceTitle}</h2>
          <div className="control-block">
            <div className="control-label">{t.classLabel}</div>
            <ClassSelect />
          </div>
          <AppearancePanel />
        </section>

        <section className="panel panel-preview">
          <Preview />
        </section>

        <section className="panel panel-catalog">
          <div className="panel-header">
            <h2 className="panel-title">{t.slotsTitle}</h2>
            <Wishlist />
          </div>
          <Slots onPick={pickSlot} />
          {/* A sub-section label (title case), not an uppercase panel header —
              "Visuais equipados" already heads this card. */}
          <div className="control-label">{t.catalogTitle}</div>
          <Catalog slotFilter={slotFilter} onSlotFilterChange={setSlotFilter} pickSignal={pickSignal} />
        </section>
      </main>

      <footer className="footer">
        <div className="footer-line">{t.footerCopyright}</div>
        <div className="footer-credits">
          {t.footerInspired + " "}
          <FooterLink href="https://costume.irowiki.org/">costume.irowiki.org</FooterLink>
          {" · " + t.footerAssets + " "}
          <FooterLink href="https://github.com/adsonpleal/ragassets">ragassets</FooterLink>
          {" · "}
          <FooterLink href="https://github.com/adsonpleal/latamvisuais">{t.footerSource}</FooterLink>
          {" · "}
          <FooterLink href="https://github.com/adsonpleal/latamvisuais/blob/main/LICENSE">MIT</FooterLink>
        </div>
      </footer>
    </AppStateProvider>
  );
}

function FooterLink({ href, children }: { href: string; children: string }) {
  return (
    <a className="footer-link" href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}
