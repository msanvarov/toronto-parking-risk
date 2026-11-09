import { useEffect, useId, useMemo, useRef, useState } from "react";
import { searchStreets, type IndexEntry } from "../lib/data";
import { prettyStreet } from "../lib/normalize";

interface Props {
  index: IndexEntry[] | null;
  value: string;
  onChange: (v: string) => void;
  onSubmit: (address: string) => void;
  onLocate: () => void;
  locating: boolean;
  recent: string[];
}

export function SearchBox({ index, value, onChange, onSubmit, onLocate, locating, recent }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const number = value.match(/^\s*(\d+[a-zA-Z]?)\s+/)?.[1];
  const suggestions = useMemo(() => {
    if (!index) return [];
    if (!value.trim()) return recent.map((r) => ({ label: r, tickets: null as number | null }));
    return searchStreets(index, value).map(([name, tickets]) => ({
      label: (number ? `${number} ` : "") + prettyStreet(name),
      tickets,
    }));
  }, [index, value, number, recent]);

  useEffect(() => setActive(-1), [value]);

  const choose = (label: string) => {
    onChange(label);
    setOpen(false);
    inputRef.current?.blur();
    onSubmit(label);
  };

  return (
    <form
      className="search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        choose(active >= 0 && suggestions[active] ? suggestions[active].label : value);
      }}
    >
      <div className="search-row">
        <label className="visually-hidden" htmlFor="q">
          Street or address
        </label>
        <input
          id="q"
          ref={inputRef}
          type="search"
          inputMode="search"
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="search"
          placeholder="Street or address"
          value={value}
          role="combobox"
          aria-expanded={open && suggestions.length > 0}
          aria-controls={listId}
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, suggestions.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, -1));
            } else if (e.key === "Escape") setOpen(false);
          }}
        />
        <button
          type="button"
          className="locate"
          onClick={onLocate}
          disabled={locating}
          aria-label="Use my location"
          title="Use my location"
        >
          {locating ? <span className="spinner" aria-hidden /> : <LocateIcon />}
        </button>
      </div>

      {open && suggestions.length > 0 && (
        <ul className="suggestions" id={listId} role="listbox">
          {!value.trim() && <li className="suggestions-title">Recent</li>}
          {suggestions.map((s, i) => (
            <li
              key={s.label}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? "active" : undefined}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(s.label)}
            >
              <span>{s.label}</span>
              {s.tickets !== null && <span className="muted small">{s.tickets.toLocaleString()} tickets</span>}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

function LocateIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
    </svg>
  );
}
