// Shared dropdown, extracted from the class picker. Small lists can omit the
// search box; classes retain their icons, grouped options and name/ID search.
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { fold } from "../core/text";

export type SelectOption = { value: number; label: string; icon?: string; group?: string };

export function Select({
  value,
  onChange,
  options,
  label,
  searchPlaceholder,
  emptyMessage,
}: {
  value: number;
  onChange: (value: number) => void;
  options: SelectOption[];
  label?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    const selected = listRef.current?.querySelector<HTMLButtonElement>(".is-selected");
    selected?.scrollIntoView?.({ block: "center" });
    (searchRef.current ?? selected)?.focus();
  }, [open]);

  const current = options.find((option) => option.value === value);
  const matches = useMemo(() => {
    const q = fold(query.trim());
    return q
      ? options.filter((option) => fold(option.label).includes(q) || String(option.value).includes(q))
      : options;
  }, [options, query]);

  const pick = (next: number) => {
    setOpen(false);
    onChange(next);
    triggerRef.current?.focus();
  };

  return (
    <div
      className="class-select"
      ref={rootRef}
      onKeyDown={(e) => {
        // Arrow keys belong to this picker, not the catalogue's shortcuts.
        if (e.key.startsWith("Arrow")) e.stopPropagation();
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
        if (e.target === searchRef.current && e.key !== "ArrowDown") return;
        e.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }
        const items = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("[role=option]") ?? []);
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1
          : e.key === "ArrowDown" ? Math.min(items.length - 1, index + 1) : Math.max(0, index - 1);
        items[next]?.focus();
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="class-trigger"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {current?.icon && <img className="class-icon" src={current.icon} alt="" decoding="async" />}
        <span className="class-trigger-name">{current?.label ?? String(value)}</span>
        <span className="class-caret">▾</span>
      </button>
      <div className="class-popup" hidden={!open}>
        {searchPlaceholder && (
          <div className="class-search">
            <input
              ref={searchRef}
              type="search"
              className="class-search-input"
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || !query.trim() || matches.length !== 1) return;
                e.preventDefault();
                pick(matches[0].value);
              }}
            />
          </div>
        )}
        <div className="class-list" role="listbox" aria-label={label} ref={listRef}>
          {matches.map((option, i) => (
            <Fragment key={option.value}>
              {!query.trim() && option.group && option.group !== matches[i - 1]?.group && (
                <div className="class-group-label">{option.group}</div>
              )}
              <button
                type="button"
                className={option.value === value ? "class-option is-selected" : "class-option"}
                role="option"
                aria-selected={option.value === value}
                onClick={() => pick(option.value)}
              >
                {option.icon && (
                  <img
                    className="class-icon"
                    src={option.icon}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    onError={(e) => e.currentTarget.classList.add("is-missing")}
                  />
                )}
                <span className="class-option-name">{option.label}</span>
              </button>
            </Fragment>
          ))}
          {matches.length === 0 && <div className="class-empty">{emptyMessage}</div>}
        </div>
      </div>
    </div>
  );
}
