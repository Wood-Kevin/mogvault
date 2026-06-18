"use client";

import { useState, useEffect, useRef } from "react";
import type { SearchResponse, SearchResultItem } from "@/app/api/search/items/route";
import type { ItemDisplayResponse } from "@/app/api/item/[id]/display/route";
import {
  VISIBLE_SLOTS,
  SLOT_TO_INVENTORY_TYPES,
  INVENTORY_TYPE_LABELS,
  HIDEABLE_SLOTS,
  CLASS_WEAPON_SLOT_TYPES,
} from "@/lib/slots";
import type { OutfitEntry } from "./CharacterViewer";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ItemBrowserProps {
  onApply:   (slot: number, data: ItemDisplayResponse) => void;
  onHide:    (slot: number) => void;
  onRevert:  (slot: number) => void;
  outfit:    Record<number, OutfitEntry>;
  className?: string; // Blizzard class name e.g. "Demon Hunter"; undefined = no filter
}

// ── Constants ─────────────────────────────────────────────────────────────────

const QUALITY_COLORS: Record<string, string> = {
  POOR:      "text-zinc-500",
  COMMON:    "text-lavender",
  UNCOMMON:  "text-green-400",
  RARE:      "text-blue-400",
  EPIC:      "text-purple-400",
  LEGENDARY: "text-orange-400",
  HEIRLOOM:  "text-sky-300",
  ARTIFACT:  "text-teal-400",
};

const FIRST_VISIBLE_SLOT = VISIBLE_SLOTS[0].viewerSlot;

// ── Sub-components ────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: SearchResultItem["source"] }) {
  if (source.type === "other") {
    // No label — absence signals "not in journal index" without noise.
    return null;
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className="text-[10px] text-muted truncate leading-tight"
        title={`${source.instanceName} · ${source.encounterName}`}
      >
        {source.instanceName}
      </span>
      <span
        className={`text-[10px] font-semibold uppercase tracking-wide ${
          source.type === "raid" ? "text-red-400" : "text-blue-400"
        }`}
      >
        {source.type === "raid" ? "Raid" : "Dungeon"}
      </span>
    </div>
  );
}

function ItemCard({
  item,
  isSelected,
  isApplying,
  onClick,
}: {
  item:       SearchResultItem;
  isSelected: boolean;
  isApplying: boolean;
  onClick:    () => void;
}) {
  const qualityColor = QUALITY_COLORS[item.quality] ?? "text-lavender";

  return (
    <button
      onClick={onClick}
      disabled={isApplying}
      className={[
        "relative flex flex-col gap-2 rounded-lg border p-2.5 text-left w-full",
        "transition-all duration-200 disabled:cursor-wait",
        isSelected
          ? "border-accent bg-accent/10 shadow-glow"
          : "border-edge bg-void hover:border-accent/60 hover:bg-void-alt",
      ].join(" ")}
      title={isSelected ? "Click to revert this slot" : undefined}
    >
      <div className="flex items-center gap-2">
        {item.icon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.icon}
            alt=""
            className="h-9 w-9 rounded border border-edge flex-shrink-0 object-cover"
          />
        ) : (
          <div className="h-9 w-9 rounded border border-edge bg-void-alt flex-shrink-0" />
        )}
        <p
          className={`text-xs font-medium leading-snug line-clamp-2 ${qualityColor}`}
          title={item.name}
        >
          {item.name}
        </p>
      </div>
      <SourceBadge source={item.source} />
      {isApplying && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-void/80">
          <span className="text-xs text-muted animate-pulse">Applying…</span>
        </div>
      )}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ItemBrowser({ onApply, onHide, onRevert, outfit, className }: ItemBrowserProps) {
  // Fetch parameters — changed as single unit to avoid double-fetch
  const [fetchParams, setFetchParams] = useState({
    slot: FIRST_VISIBLE_SLOT,
    type: SLOT_TO_INVENTORY_TYPES[FIRST_VISIBLE_SLOT][0],
    page: 1,
  });

  // Separate query input (responsive) vs debounced query (used for fetching)
  const [queryInput, setQueryInput] = useState("");
  const [fetchQuery, setFetchQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Results
  const [items,     setItems]     = useState<SearchResultItem[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  // Applying a clicked card
  const [applyingId, setApplyingId] = useState<number | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  // Effective types for the current slot — computed early so effects can use it.
  // For weapon slots, CLASS_WEAPON_SLOT_TYPES overrides the base list per class.
  // Armor slots are filtered server-side; the type list is unchanged client-side.
  const _classWeaponOverride = className
    ? CLASS_WEAPON_SLOT_TYPES[className]?.[fetchParams.slot]
    : undefined;
  const _effectiveTypes = _classWeaponOverride ?? (SLOT_TO_INVENTORY_TYPES[fetchParams.slot] ?? []);

  // ── Debounce query ───────────────────────────────────────────────────────
  function handleQueryChange(q: string) {
    setQueryInput(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFetchQuery(q);
      setFetchParams(p => ({ ...p, page: 1 }));
    }, 350);
  }

  // When the effective type list changes (e.g., class loaded, slot changed),
  // auto-correct fetchParams.type if the current type is no longer in the list.
  useEffect(() => {
    if (_effectiveTypes.length > 0 && !_effectiveTypes.includes(fetchParams.type)) {
      setFetchParams(p => ({ ...p, type: _effectiveTypes[0], page: 1 }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_effectiveTypes.join(",")]);

  // ── Slot / type handlers ─────────────────────────────────────────────────
  function handleSlotChange(newSlot: number) {
    // Use class-filtered types if available; fall back to base types.
    const classOverride = className
      ? CLASS_WEAPON_SLOT_TYPES[className]?.[newSlot]
      : undefined;
    const types = classOverride ?? SLOT_TO_INVENTORY_TYPES[newSlot] ?? [];
    setFetchParams({ slot: newSlot, type: types[0] ?? "", page: 1 });
    setApplyError(null);
  }

  function handleTypeChange(newType: string) {
    setFetchParams(p => ({ ...p, type: newType, page: 1 }));
    setApplyError(null);
  }

  function handlePageChange(newPage: number) {
    setFetchParams(p => ({ ...p, page: newPage }));
  }

  // ── Fetch items ──────────────────────────────────────────────────────────
  useEffect(() => {
    // If class filter leaves no valid types for this slot, skip the fetch.
    if (validTypes.length === 0) {
      setItems([]);
      setPageCount(0);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      slot: String(fetchParams.slot),
      type: fetchParams.type,
      page: String(fetchParams.page),
    });
    if (fetchQuery) params.set("q", fetchQuery);
    if (className)  params.set("className", className);

    fetch(`/api/search/items?${params}`)
      .then(res => {
        if (!res.ok) throw new Error(`Search failed (${res.status})`);
        return res.json() as Promise<SearchResponse>;
      })
      .then(data => {
        if (!cancelled) {
          setItems(data.items);
          setPageCount(data.pageCount);
          setLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Search failed");
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [fetchParams, fetchQuery]);

  // ── Apply or toggle-off a card click ────────────────────────────────────
  async function handleCardClick(item: SearchResultItem) {
    if (applyingId !== null) return;
    setApplyError(null);

    // If this card is already the applied override, toggle it off.
    const current = outfit[fetchParams.slot];
    if (current?.kind === "item" && current.itemId === item.id) {
      onRevert(fetchParams.slot);
      return;
    }

    setApplyingId(item.id);
    try {
      const res  = await fetch(`/api/item/${item.id}/display`);
      const data = await res.json() as ItemDisplayResponse & { error?: string };
      if (!res.ok) {
        setApplyError(data.error ?? "Could not load item appearance");
        return;
      }
      // Use the browsed slot as the authoritative slot (not data.viewerSlot),
      // so items browsed in a given slot always land there.
      onApply(fetchParams.slot, data);
    } catch {
      setApplyError("Network error — could not apply item");
    } finally {
      setApplyingId(null);
    }
  }

  // ── Derived ──────────────────────────────────────────────────────────────
  const validTypes = _effectiveTypes; // alias for readability in JSX below

  const isMultiType  = validTypes.length > 1;
  const isHideable   = HIDEABLE_SLOTS.has(fetchParams.slot);
  const currentEntry = outfit[fetchParams.slot];
  const slotLabel    = VISIBLE_SLOTS.find(s => s.viewerSlot === fetchParams.slot)?.label ?? "Slot";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-xl border border-edge bg-surface space-y-4 p-4">
      <p className="text-xs uppercase tracking-widest text-muted">Item Browser</p>

      {/* Slot tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {VISIBLE_SLOTS.map(s => (
          <button
            key={s.viewerSlot}
            onClick={() => handleSlotChange(s.viewerSlot)}
            className={[
              "flex-shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 border",
              fetchParams.slot === s.viewerSlot
                ? "border-accent bg-accent/15 text-accent-bright"
                : "border-transparent text-muted hover:text-lavender hover:bg-void-alt",
            ].join(" ")}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Type filter — only for multi-type slots */}
      {isMultiType && (
        <div className="flex flex-wrap gap-1.5">
          {validTypes.map(t => (
            <button
              key={t}
              onClick={() => handleTypeChange(t)}
              className={[
                "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                fetchParams.type === t
                  ? "border-accent/70 bg-accent/10 text-accent-bright"
                  : "border-edge text-muted hover:border-accent/40 hover:text-lavender",
              ].join(" ")}
            >
              {INVENTORY_TYPE_LABELS[t] ?? t}
            </button>
          ))}
        </div>
      )}

      {/* Slot status row: current override + revert / hide controls */}
      {(currentEntry || isHideable) && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-edge bg-void px-3 py-2 min-h-9">
          {/* Left: current state */}
          <div className="flex items-center gap-2 min-w-0">
            {currentEntry?.kind === "item" && (
              <>
                {currentEntry.icon && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={currentEntry.icon} alt="" className="h-6 w-6 rounded flex-shrink-0" />
                )}
                <span className="text-xs text-lavender truncate">{currentEntry.name}</span>
              </>
            )}
            {currentEntry?.kind === "hidden" && (
              <span className="text-xs italic text-muted">Slot hidden</span>
            )}
          </div>

          {/* Right: action buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {currentEntry && (
              <button
                onClick={() => onRevert(fetchParams.slot)}
                className="text-xs text-muted hover:text-accent-bright transition-colors"
                title={currentEntry.kind === "hidden" ? "Unhide — restore original" : "Revert to original"}
              >
                × {currentEntry.kind === "hidden" ? "Unhide" : "Revert"}
              </button>
            )}
            {isHideable && currentEntry?.kind !== "hidden" && (
              <button
                onClick={() => onHide(fetchParams.slot)}
                className="rounded border border-edge px-2 py-0.5 text-[11px] text-muted hover:border-accent/50 hover:text-lavender transition-colors"
              >
                Hide {slotLabel}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Search input */}
      <input
        type="search"
        value={queryInput}
        onChange={e => handleQueryChange(e.target.value)}
        placeholder="Search by name…"
        className="w-full rounded-lg border border-edge bg-void px-3 py-2 text-sm text-lavender placeholder:text-muted focus:border-accent focus:outline-none transition-colors"
      />

      {/* Error from search */}
      {error && !loading && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      {/* Item grid */}
      {validTypes.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">
          {className ? `${className}s cannot equip items in this slot.` : "No items for this slot."}
        </p>
      ) : loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-[84px] animate-pulse rounded-lg border border-edge bg-void-alt"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">No items found.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {items.map(item => (
            <ItemCard
              key={item.id}
              item={item}
              isSelected={currentEntry?.kind === "item" && currentEntry.itemId === item.id}
              isApplying={applyingId === item.id}
              onClick={() => handleCardClick(item)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-3 pt-1">
          <button
            onClick={() => handlePageChange(fetchParams.page - 1)}
            disabled={fetchParams.page <= 1 || loading}
            className="rounded border border-edge px-3 py-1.5 text-xs text-muted hover:border-accent hover:text-accent-bright disabled:opacity-30 transition-colors"
          >
            ← Prev
          </button>
          <span className="text-xs text-muted tabular-nums">
            {fetchParams.page} / {pageCount}
          </span>
          <button
            onClick={() => handlePageChange(fetchParams.page + 1)}
            disabled={fetchParams.page >= pageCount || loading}
            className="rounded border border-edge px-3 py-1.5 text-xs text-muted hover:border-accent hover:text-accent-bright disabled:opacity-30 transition-colors"
          >
            Next →
          </button>
        </div>
      )}

      {/* Apply error */}
      {applyError && (
        <p className="text-xs text-red-400">{applyError}</p>
      )}
    </div>
  );
}
