// Class picker — a custom dropdown (native <select> can't render icons) with
// the classes separated into the same groups as the iRO simulator. Icons come
// from ragassets (/icons/job/<id>.png, extracted from the client's party UI).

import { Fragment, useEffect, useRef, useState } from "react";
import { GROUP_ORDER, jobIconUrl } from "../core/state";
import { t } from "../i18n";
import { useAppState, useDb, useDispatch } from "../state/AppStateContext";

export function ClassSelect() {
  const db = useDb();
  const state = useAppState();
  const dispatch = useDispatch();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

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

  // Center the current class in view each time the popup opens.
  useEffect(() => {
    if (open) {
      popupRef.current
        ?.querySelector<HTMLElement>(".is-selected")
        ?.scrollIntoView({ block: "center" });
    }
  }, [open]);

  const current = db.classes.find((c) => c.id === state.classId);

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

      <div className="class-popup" role="listbox" hidden={!open} ref={popupRef}>
        {GROUP_ORDER.map((group) => {
          const members = db.classes.filter((c) => c.group === group);
          if (!members.length) return null;
          return (
            <Fragment key={group}>
              <div className="class-group-label">{t.groups[group] ?? group}</div>
              {members.map((c) => {
                const selected = c.id === state.classId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={selected ? "class-option is-selected" : "class-option"}
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      setOpen(false);
                      dispatch({ type: "setClass", classId: c.id });
                    }}
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
              })}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
