"use client";

import { useState, useEffect, useRef } from "react";
import type { RealmEntry } from "@/app/api/realms/route";

interface RealmComboboxProps {
  value:    string;  // slug (canonical form sent to API)
  onChange: (slug: string) => void;
  disabled?: boolean;
  region:   string;
}

const MAX_SUGGESTIONS = 8;

export default function RealmCombobox({ value, onChange, disabled, region }: RealmComboboxProps) {
  const [inputValue,   setInputValue]   = useState(value); // display text shown in input
  const [realms,       setRealms]       = useState<RealmEntry[]>([]);
  const [isOpen,       setIsOpen]       = useState(false);
  const [activeIndex,  setActiveIndex]  = useState(-1);

  const inputRef       = useRef<HTMLInputElement>(null);
  const initialSlug    = useRef(value); // used only on mount to display name for pre-filled slug
  const isInitialMount = useRef(true);

  // Fetch realm list for the current region; reset the input when region changes.
  useEffect(() => {
    const isMount = isInitialMount.current;
    isInitialMount.current = false;

    if (!isMount) {
      // Region changed — the current realm slug is no longer valid.
      setInputValue("");
      onChange("");
    }

    fetch(`/api/realms?region=${region}`)
      .then(r => (r.ok ? r.json() : null))
      .then((data: RealmEntry[] | null) => {
        if (!data) return;
        setRealms(data);
        // On initial mount only: show the display name for a pre-filled slug.
        if (isMount && initialSlug.current) {
          const match = data.find(r => r.slug === initialSlug.current);
          if (match) setInputValue(match.name);
        }
      })
      .catch(() => {});
  }, [region, onChange]);

  // Filtered suggestions — substring match on name, max 8 results.
  const filtered: RealmEntry[] = inputValue.trim()
    ? realms
        .filter(r => r.name.toLowerCase().includes(inputValue.trim().toLowerCase()))
        .slice(0, MAX_SUGGESTIONS)
    : [];

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setInputValue(e.target.value);
    setIsOpen(e.target.value.trim().length > 0);
    setActiveIndex(-1);
  }

  // onMouseDown (not onClick) so it fires before the input's onBlur.
  function handleSelect(realm: RealmEntry) {
    setInputValue(realm.name);
    onChange(realm.slug);
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function handleBlur() {
    // Short delay lets onMouseDown on dropdown options fire first.
    setTimeout(() => {
      setIsOpen(false);
      const q = inputValue.trim();
      if (!q) return;

      // Exact display-name match
      const byName = realms.find(r => r.name.toLowerCase() === q.toLowerCase());
      if (byName) { setInputValue(byName.name); onChange(byName.slug); return; }

      // Slug match — strip apostrophes and collapse spaces (common typos)
      const normalized = q.toLowerCase().replace(/'/g, "").replace(/\s+/g, "");
      const bySlug = realms.find(r => r.slug === normalized);
      if (bySlug) { setInputValue(bySlug.name); onChange(bySlug.slug); return; }

      // Unknown realm — pass through; the character API will return a 404 with a clear message.
      onChange(q.toLowerCase().replace(/\s+/g, "-"));
    }, 150);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(filtered[activeIndex]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div className="relative w-44">
      <input
        ref={inputRef}
        id="mv-realm"
        type="text"
        value={inputValue}
        onChange={handleChange}
        onFocus={() => inputValue.trim() && filtered.length > 0 && setIsOpen(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder="Realm"
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        aria-autocomplete="list"
        aria-expanded={isOpen}
        className="w-full rounded-lg border border-edge bg-void px-3 py-2 text-sm text-lavender placeholder:text-muted focus:border-accent focus:outline-none disabled:opacity-50 transition-colors"
      />

      {isOpen && filtered.length > 0 && (
        <ul
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-lg border border-accent/40 bg-surface shadow-glow"
        >
          {filtered.map((realm, idx) => (
            <li key={realm.slug} role="option" aria-selected={idx === activeIndex}>
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); handleSelect(realm); }}
                className={[
                  "w-full px-3 py-2 text-left text-sm transition-colors",
                  idx === activeIndex
                    ? "bg-accent/20 text-accent-bright"
                    : "text-lavender hover:bg-void-alt hover:text-accent-bright",
                ].join(" ")}
              >
                {realm.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
