// App root: loads the static DBs, owns the single build State via a reducer,
// keeps the share URL in sync, and lays out the three panels. This is the
// React equivalent of the old main.ts `start()` — same DOM structure and class
// names, so styles.css applies unchanged.

import { lazy, Suspense, useCallback, useEffect, useMemo, useReducer, useState } from "react";
import type { Db, Slot } from "./core/db";
import { APP_VERSION } from "./changelog";
import { clampState } from "./core/clamp";
import { createAppReducer } from "./core/reducer";
import { buildOf, initialState } from "./core/state";
import { buildSignature, loadSlots, saveSlots, SLOT_COUNT } from "./core/slots";
import { readUrlState, syncUrl } from "./core/url";
import { t } from "./i18n";
import { useLoadDb } from "./hooks/useLoadDb";
import { useTooltip } from "./hooks/useTooltip";
import { AppStateProvider } from "./state/AppStateContext";
import { AppearancePanel } from "./components/AppearancePanel";
import { Catalog } from "./components/Catalog";
import { Changelog } from "./components/Changelog";
import { ClassSelect } from "./components/ClassSelect";
import { InfoTip } from "./components/InfoTip";
import { Preview } from "./components/Preview";
import { SlotBar } from "./components/SlotBar";
import { Slots } from "./components/Slots";
import { ThemeSelect } from "./components/ThemeSelect";
import { Wishlist } from "./components/Wishlist";

// The map simulation pulls in three.js + the tra_fild assets, so it's split into
// its own chunk and only loaded when the player opens it.
const MapSim = lazy(() => import("./sim/Simulator"));

export default function App() {
  useTooltip();
  const db = useLoadDb();

  // Opening the play page directly: show the map loader straight away (matching
  // the sim's own loading overlay) instead of flashing the generic data loader,
  // so there's a single continuous "Carregando o mapa…" screen.
  if (db.status === "loading") {
    if (location.hash === "#play") return <div className="sim-overlay sim-status">{t.simLoading}</div>;
    return <div className="boot-message">{t.loading}</div>;
  }
  if (db.status === "error") return <div className="boot-message">{t.loadError}</div>;
  return <Simulator db={db.db} />;
}

function Simulator({ db }: { db: Db }) {
  const reducer = useMemo(() => createAppReducer(db), [db]);

  // Save slots: read every stored build + the active index once, then seed the
  // reducer from the active slot. A shared ?b= URL still wins for display — it
  // overrides the active slot's build (and is auto-saved straight back into it).
  const initialSlots = useMemo(() => loadSlots(db), [db]);
  const [builds, setBuilds] = useState(initialSlots.builds);
  const [active, setActive] = useState(initialSlots.active);

  const [state, dispatch] = useReducer(reducer, db, (db) => {
    const activeBuild = initialSlots.builds[initialSlots.active];
    return clampState(db, {
      ...initialState(db),
      ...(activeBuild ?? {}),
      ...(readUrlState(db) ?? {}),
    });
  });

  // Auto-save: write the current build back to the active slot whenever the
  // costume changes (keyed on the build signature, so a pure pose/rotation
  // change doesn't rewrite storage) or the active slot switches.
  const buildSig = buildSignature(buildOf(state));
  useEffect(() => {
    setBuilds((prev) => {
      const next = [...prev];
      next[active] = buildOf(state);
      saveSlots({ builds: next, active });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildSig, active]);

  // Switch slots: load the target build (defaults for an untouched slot),
  // keeping the current pose/rotation. The auto-save effect then re-anchors
  // persistence onto the new active slot.
  const selectSlot = useCallback(
    (index: number) => {
      if (index === active) return;
      const build = builds[index] ?? buildOf(initialState(db));
      setActive(index);
      dispatch({ type: "loadBuild", build });
    },
    [active, builds, db],
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

  const [changelogOpen, setChangelogOpen] = useState(false);

  // The map simulation is a full-screen overlay toggled by the "#play" hash, so
  // it survives a refresh and is shareable without disturbing the ?b= build URL
  // (syncUrl only touches the query string).
  const [playing, setPlaying] = useState(() => location.hash === "#play");
  useEffect(() => {
    const onHash = () => setPlaying(location.hash === "#play");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const openPlay = () => {
    history.replaceState(null, "", "#play");
    setPlaying(true);
  };
  const closePlay = () => {
    history.replaceState(null, "", location.pathname + location.search);
    setPlaying(false);
  };

  return (
    <AppStateProvider value={{ db, state, dispatch }}>
      <header className="topbar">
        <div className="topbar-heading">
          <h1>{t.appTitle}</h1>
          <span className="topbar-sub">{t.appSubtitle}</span>
        </div>
        <div className="topbar-actions">
          <a
            className="topbar-action"
            href="https://forms.gle/T5gvsTYTVBSVF5jH6"
            target="_blank"
            rel="noopener noreferrer"
            title={t.feedbackTitle}
          >
            {t.feedbackLink}
          </a>
          <a
            className="topbar-action"
            href="https://docs.google.com/spreadsheets/d/1IcN9IjWbZvfSZwiI2ginxx4J5g_AxhCNkh8f7pdaXZ4/edit?usp=sharing"
            target="_blank"
            rel="noopener noreferrer"
            title={t.trackingTitle}
          >
            {t.trackingLink}
          </a>
          <a
            className="topbar-action"
            href="https://discord.gg/S4uEwGqK"
            target="_blank"
            rel="noopener noreferrer"
            title={t.discordTitle}
          >
            {t.discordLink}
          </a>
          <ThemeSelect />
        </div>
      </header>

      <main className="layout">
        <section className="panel panel-appearance">
          <div className="panel-title-row">
            <h2 className="panel-title">{t.appearanceTitle}</h2>
            <InfoTip label={t.saveInfoLabel} text={t.saveInfoText} />
          </div>
          <SlotBar active={active} count={SLOT_COUNT} onSelect={selectSlot} />
          <div className="control-block">
            <div className="control-label">{t.classLabel}</div>
            <ClassSelect />
          </div>
          <AppearancePanel />
        </section>

        <section className="panel panel-preview">
          <Preview onPlay={openPlay} />
        </section>

        <section className="panel panel-catalog">
          <div className="panel-header">
            <h2 className="panel-title">{t.slotsTitle}</h2>
            <Wishlist />
          </div>
          <Slots onPick={pickSlot} />
          {/* A sub-section label (title case), not an uppercase panel header —
              "Visuais equipados" already heads this card. The "?" explains why
              effect/3D costumes aren't in the list. */}
          <div className="control-label catalog-label">
            {t.catalogTitle}
            <InfoTip label={t.catalogInfoLabel} text={t.catalogInfoText} />
          </div>
          <Catalog slotFilter={slotFilter} onSlotFilterChange={setSlotFilter} pickSignal={pickSignal} />
        </section>
      </main>

      <footer className="footer">
        <div className="footer-line">
          <button type="button" className="footer-link" onClick={() => setChangelogOpen(true)}>
            {t.footerChangelog}
          </button>
          {" · v" + APP_VERSION + " · "}
          <FooterLink href="https://latam-tools.com.br/">{t.footerTools}</FooterLink>
        </div>
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

      {changelogOpen && <Changelog onClose={() => setChangelogOpen(false)} />}

      {playing && (
        <Suspense fallback={<div className="sim-overlay sim-status">{t.simLoading}</div>}>
          <MapSim onClose={closePlay} />
        </Suspense>
      )}
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
