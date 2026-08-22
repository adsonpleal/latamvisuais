// Class picker — a custom dropdown (native <select> can't render icons) with
// the classes separated into the same groups as the iRO simulator. Icons come
// from ragassets (/icons/job/<id>.png, extracted from the client's party UI).
//
// The list is long enough (every playable class, in eight groups) that scrolling
// to a known name is the slow way round, so the popup opens with a search box
// focused. Matching folds accents like the catalogue's search does, and while a
// query is active the group headings are dropped — with a handful of results
// left, the headings are more noise than structure.

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { GROUP_ORDER, jobIconUrl } from "../core/state";
import { fold } from "../core/text";
import { t } from "../i18n";
import { useAppState, useDb, useDispatch } from "../state/AppStateContext";

export function ClassSelect() {
  const db = useDb();
  const state = useAppState();
  const dispatch = useDispatch();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close on an outside click or Escape, only while the popup is open.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Center the current class in view each time the popup opens, and start a
  // fresh search — a stale query from last time would hide the whole list.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    // Optional call: jsdom has no scrollIntoView, and centring the selection is
    // a nicety the component works fine without.
    popupRef.current?.querySelector<HTMLElement>(".is-selected")?.scrollIntoView?.({
      block: "center",
    });
    searchRef.current?.focus();
  }, [open]);

  const current = db.classes.find((c) => c.id === state.classId);

  // Matches on the pt-BR name and on the job id, so "4054" finds a class as
  // readily as "rúnico" does.
  const matches = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return null;
    return db.classes.filter((c) => fold(c.name).includes(q) || String(c.id).includes(q));
  }, [db.classes, query]);

  const pick = (classId: number) => {
    setOpen(false);
    dispatch({ type: "setClass", classId });
  };

  const renderOption = (c: (typeof db.classes)[number]) => {
    const selected = c.id === state.classId;
    return (
      <button
        key={c.id}
        type="button"
        className={selected ? "class-option is-selected" : "class-option"}
        role="option"
        aria-selected={selected}
        onClick={() => pick(c.id)}
      >
        <img
          className="class-icon"
          src={jobIconUrl(c.id)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={(e) => e.currentTarget.classList.add("is-missing")}
        />
        <span className="class-option-name">{c.name}</span>
      </button>
    );
  };

  return (
    <div className="class-select" ref={rootRef}>
      <button
        type="button"
        className="class-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <img className="class-icon" src={jobIconUrl(state.classId)} alt="" decoding="async" />
        <span className="class-trigger-name">{current?.name ?? String(state.classId)}</span>
        <span className="class-caret">▾</span>
      </button>

      <div className="class-popup" hidden={!open}>
        <div className="class-search">
          <input
            ref={searchRef}
            type="search"
            className="class-search-input"
            placeholder={t.classSearch}
            aria-label={t.classSearch}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            // Enter picks the only remaining class — the fast path when the
            // query has already narrowed it to one.
            onKeyDown={(e) => {
              if (e.key !== "Enter" || matches?.length !== 1) return;
              e.preventDefault();
              pick(matches[0].id);
            }}
          />
        </div>
        <div className="class-list" role="listbox" ref={popupRef}>
          {matches
            ? matches.map(renderOption)
            : GROUP_ORDER.map((group) => {
                const members = db.classes.filter((c) => c.group === group);
                if (!members.length) return null;
                return (
                  <Fragment key={group}>
                    <div className="class-group-label">{t.groups[group] ?? group}</div>
                    {members.map(renderOption)}
                  </Fragment>
                );
              })}
          {matches?.length === 0 && <div className="class-empty">{t.classSearchEmpty}</div>}
        </div>
      </div>
    </div>
  );
}
