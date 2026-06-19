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
  className?: string;
  ownedAppearanceIds?: Set<number> | null;
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
  if (source.type === "other") return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className="text-[10px] text-muted truncate leading-tight"
        title={`${source.instanceName} · ${source.encounterName}`}
      >
        {source.instanceName}
      </span>
      <span
        className={`text-[10px] font-bold uppercase tracking-wide ${
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
  isCollected,
  onClick,
}: {
  item:        SearchResultItem;
  isSelected:  boolean;
  isApplying:  boolean;
  isCollected: boolean;
  onClick:     () => void;
}) {
  const qualityColor = QUALITY_COLORS[item.quality] ?? "text-lavender";

  return (
    <button
      onClick={onClick}
      disabled={isApplying}
      className={[
        "relative flex flex-col gap-2.5 rounded-lg border p-3 text-left w-full",
        "transition-all duration-200 disabled:cursor-wait",
        isSelected
          ? "border-accent bg-accent/10 shadow-glow"
          : "border-edge bg-surface/50 hover:border-accent/50 hover:bg-surface",
      ].join(" ")}
      title={isSelected ? "Click to revert this slot" : undefined}
    >
      <div className="flex items-center gap-2.5">
        {item.icon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.icon}
            alt=""
            className="h-10 w-10 rounded border border-edge flex-shrink-0 object-cover"
          />
        ) : (
          <div className="h-10 w-10 rounded border border-edge bg-void-alt flex-shrink-0" />
        )}
        <p
          className={`text-[11px] font-medium leading-snug line-clamp-2 ${qualityColor}`}
          title={item.name}
        >
          {item.name}
        </p>
      </div>
      <div className="flex items-center justify-between gap-1 min-h-[1.25rem]">
        <SourceBadge source={item.source} />
        {isCollected && (
          <span className="ml-auto flex-shrink-0 rounded-full bg-emerald-900/40 border border-emerald-700/50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-400">
            Collected
          </span>
        )}
      </div>
      {isApplying && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-void/80">
          <span className="text-xs text-muted animate-pulse">Applying…</span>
        </div>
      )}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ItemBrowser({ onApply, onHide, onRevert, outfit, className, ownedAppearanceIds }: ItemBrowserProps) {
  const [fetchParams, setFetchParams] = useState({
    slot: FIRST_VISIBLE_SLOT,
    type: SLOT_TO_INVENTORY_TYPES[FIRST_VISIBLE_SLOT][0],
    page: 1,
  });

  const [queryInput, setQueryInput] = useState("");
  const [fetchQuery, setFetchQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [items,     setItems]     = useState<SearchResultItem[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const [applyingId, setApplyingId] = useState<number | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  const _classWeaponOverride = className
    ? CLASS_WEAPON_SLOT_TYPES[className]?.[fetchParams.slot]
    : undefined;
  const _effectiveTypes = _classWeaponOverride ?? (SLOT_TO_INVENTORY_TYPES[fetchParams.slot] ?? []);

  function handleQueryChange(q: string) {
    setQueryInput(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFetchQuery(q);
      setFetchParams(p => ({ ...p, page: 1 }));
    }, 350);
  }

  useEffect(() => {
    if (_effectiveTypes.length > 0 && !_effectiveTypes.includes(fetchParams.type)) {
      setFetchParams(p => ({ ...p, type: _effectiveTypes[0], page: 1 }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_effectiveTypes.join(",")]);

  function handleSlotChange(newSlot: number) {
    const classOverride = className ? CLASS_WEAPON_SLOT_TYPES[className]?.[newSlot] : undefined;
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

  useEffect(() => {
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
        if (!cancelled) { setItems(data.items); setPageCount(data.pageCount); setLoading(false); }
      })
      .catch(err => {
        if (!cancelled) { setError(err instanceof Error ? err.message : "Search failed"); setLoading(false); }
      });

    return () => { cancelled = true; };
  }, [fetchParams, fetchQuery]);

  async function handleCardClick(item: SearchResultItem) {
    if (applyingId !== null) return;
    setApplyError(null);

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
      onApply(fetchParams.slot, data);
    } catch {
      setApplyError("Network error — could not apply item");
    } finally {
      setApplyingId(null);
    }
  }

  // ── Derived ──────────────────────────────────────────────────────────────
  const validTypes    = _effectiveTypes;
  const isMultiType   = validTypes.length > 1;
  const isHideable    = HIDEABLE_SLOTS.has(fetchParams.slot);
  const currentEntry  = outfit[fetchParams.slot];
  const slotLabel     = VISIBLE_SLOTS.find(s => s.viewerSlot === fetchParams.slot)?.label ?? "Slot";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-xl border border-edge bg-surface space-y-4 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">Item Browser</p>

      {/* Slot tabs */}
      <div className="flex gap-0.5 overflow-x-auto pb-1">
        {VISIBLE_SLOTS.map(s => {
          const isActive = fetchParams.slot === s.viewerSlot;
          return (
            <button
              key={s.viewerSlot}
              onClick={() => handleSlotChange(s.viewerSlot)}
              className={[
                "flex-shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150",
                isActive
                  ? "bg-accent/15 text-accent-bright ring-1 ring-accent/40"
                  : "text-muted hover:text-lavender hover:bg-void-alt",
              ].join(" ")}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Type filter pills — multi-type slots only */}
      {isMultiType && (
        <div className="flex flex-wrap gap-1.5">
          {validTypes.map(t => (
            <button
              key={t}
              onClick={() => handleTypeChange(t)}
              className={[
                "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                fetchParams.type === t
                  ? "border-accent/60 bg-accent/10 text-accent-bright"
                  : "border-edge text-muted hover:border-accent/40 hover:text-lavender",
              ].join(" ")}
            >
              {INVENTORY_TYPE_LABELS[t] ?? t}
            </button>
          ))}
        </div>
      )}

      {/* Slot status row: current override + controls */}
      {(currentEntry || isHideable) && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-edge bg-void px-3 py-2 min-h-9">
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
              className="h-[94px] animate-pulse rounded-lg border border-edge bg-void-alt"
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
              isCollected={!!(ownedAppearanceIds && item.appearanceId != null && ownedAppearanceIds.has(item.appearanceId))}
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
            className="rounded-lg border border-edge px-3 py-1.5 text-xs text-muted hover:border-accent/50 hover:text-accent-bright disabled:opacity-30 transition-colors"
          >
            ← Prev
          </button>
          <span className="text-xs text-muted tabular-nums">
            {fetchParams.page} / {pageCount}
          </span>
          <button
            onClick={() => handlePageChange(fetchParams.page + 1)}
            disabled={fetchParams.page >= pageCount || loading}
            className="rounded-lg border border-edge px-3 py-1.5 text-xs text-muted hover:border-accent/50 hover:text-accent-bright disabled:opacity-30 transition-colors"
          >
            Next →
          </button>
        </div>
      )}

      {applyError && (
        <p className="text-xs text-red-400">{applyError}</p>
      )}
    </div>
  );
}
