"use client";

import { useState, useEffect, useCallback } from "react";
import type { FarmingListResponse, FarmingInstance, FarmingEncounter } from "@/app/api/farming-list/route";
import type { Outfit, OutfitEntry } from "./CharacterViewer";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FarmingListProps {
  outfit:    Outfit;
  charKey:   string;  // localStorage namespace for checkbox state
  charName?: string;  // display name for copy/print header
}

type ItemInfo = { name: string; icon: string | null };

// ── localStorage helpers ──────────────────────────────────────────────────────

function checkedKey(charKey: string) { return `mogvault-checked-${charKey}`; }

function loadChecked(charKey: string): Set<number> {
  try {
    const raw = localStorage.getItem(checkedKey(charKey));
    return raw ? new Set(JSON.parse(raw) as number[]) : new Set();
  } catch { return new Set(); }
}

function saveChecked(charKey: string, s: Set<number>) {
  try { localStorage.setItem(checkedKey(charKey), JSON.stringify([...s])); } catch {}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildCopyText(
  data: FarmingListResponse,
  farmMap: Map<number, ItemInfo>,
  checked: Set<number>,
  charName?: string,
): string {
  const lines: string[] = [];
  if (charName) lines.push(`# ${charName} — Farming List\n`);

  for (const inst of data.instances) {
    const badge = inst.type === "raid" ? "Raid" : "Dungeon";
    lines.push(`## ${inst.instanceName} (${badge}) — ${inst.totalPieces} piece${inst.totalPieces !== 1 ? "s" : ""}`);
    for (const enc of inst.encounters) {
      lines.push(`\n**${enc.encounterName}**`);
      for (const id of enc.itemIds) {
        const tick = checked.has(id) ? "x" : " ";
        lines.push(`- [${tick}] ${farmMap.get(id)?.name ?? `Item ${id}`}`);
      }
    }
    lines.push("");
  }

  if (data.otherItemIds.length > 0) {
    lines.push(`## Other Source — ${data.otherItemIds.length} piece${data.otherItemIds.length !== 1 ? "s" : ""}`);
    lines.push("_(vendor / crafted / world drop / quest)_\n");
    for (const id of data.otherItemIds) {
      const tick = checked.has(id) ? "x" : " ";
      lines.push(`- [${tick}] ${farmMap.get(id)?.name ?? `Item ${id}`}`);
    }
  }

  return lines.join("\n");
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: "raid" | "dungeon" }) {
  return (
    <span className={[
      "inline-block text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border",
      type === "raid"
        ? "bg-red-950/50 text-red-400 border-red-900/50 print:bg-transparent print:text-red-600 print:border-red-400"
        : "bg-blue-950/50 text-blue-400 border-blue-900/50 print:bg-transparent print:text-blue-600 print:border-blue-400",
    ].join(" ")}>
      {type}
    </span>
  );
}

function ItemRow({
  itemId, info, isChecked, onToggle, extraLocations,
}: {
  itemId:         number;
  info:           ItemInfo | undefined;
  isChecked:      boolean;
  onToggle:       (id: number) => void;
  extraLocations: number;
}) {
  return (
    <label className={[
      "flex items-center gap-2 cursor-pointer rounded px-1 py-0.5 -mx-1",
      "transition-colors hover:bg-void-alt print:hover:bg-transparent",
      isChecked ? "opacity-50" : "",
    ].join(" ")}>
      <input
        type="checkbox"
        checked={isChecked}
        onChange={() => onToggle(itemId)}
        className="accent-purple-500 flex-shrink-0 print:accent-black"
      />
      {info?.icon && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={info.icon}
          alt=""
          className={`h-5 w-5 rounded border border-edge flex-shrink-0 print:hidden ${isChecked ? "grayscale" : ""}`}
        />
      )}
      <span className={`text-xs ${isChecked ? "text-muted line-through" : "text-lavender print:text-black"}`}>
        {info?.name ?? `Item ${itemId}`}
      </span>
      {extraLocations > 0 && (
        <span className="ml-auto text-[10px] text-muted print:text-gray-500">
          +{extraLocations} location{extraLocations !== 1 ? "s" : ""}
        </span>
      )}
    </label>
  );
}

function InstanceBlock({
  instance, farmMap, checked, onToggle, instanceCountForItem,
}: {
  instance:              FarmingInstance;
  farmMap:               Map<number, ItemInfo>;
  checked:               Set<number>;
  onToggle:              (id: number) => void;
  instanceCountForItem:  Map<number, number>;
}) {
  const allItemIds = instance.encounters.flatMap(e => e.itemIds);
  const allObtained = allItemIds.length > 0 && allItemIds.every(id => checked.has(id));

  return (
    <div className={[
      "rounded-xl border bg-surface print:rounded-none print:border-0 print:border-b print:border-gray-300 print:bg-transparent",
      allObtained ? "border-edge/50 opacity-60" : "border-accent/25",
    ].join(" ")}>
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-edge print:border-gray-200">
        <TypeBadge type={instance.type} />
        <span className={`font-semibold text-sm print:text-black ${allObtained ? "text-muted line-through" : "text-lavender"}`}>
          {instance.instanceName}
        </span>
        <span className="ml-auto text-xs text-muted print:text-gray-500">
          {instance.totalPieces} piece{instance.totalPieces !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Encounters */}
      <div className="divide-y divide-edge/40 print:divide-gray-200">
        {instance.encounters.map(enc => (
          <EncounterBlock
            key={enc.encounterId}
            encounter={enc}
            farmMap={farmMap}
            checked={checked}
            onToggle={onToggle}
            instanceCountForItem={instanceCountForItem}
          />
        ))}
      </div>
    </div>
  );
}

function EncounterBlock({
  encounter, farmMap, checked, onToggle, instanceCountForItem,
}: {
  encounter:             FarmingEncounter;
  farmMap:               Map<number, ItemInfo>;
  checked:               Set<number>;
  onToggle:              (id: number) => void;
  instanceCountForItem:  Map<number, number>;
}) {
  return (
    <div className="px-4 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-1.5 print:text-gray-500">
        {encounter.encounterName}
      </p>
      <div className="space-y-0.5">
        {encounter.itemIds.map(id => (
          <ItemRow
            key={id}
            itemId={id}
            info={farmMap.get(id)}
            isChecked={checked.has(id)}
            onToggle={onToggle}
            extraLocations={(instanceCountForItem.get(id) ?? 1) - 1}
          />
        ))}
      </div>
    </div>
  );
}

function OtherSourceBlock({
  itemIds, farmMap, checked, onToggle,
}: {
  itemIds:  number[];
  farmMap:  Map<number, ItemInfo>;
  checked:  Set<number>;
  onToggle: (id: number) => void;
}) {
  const allObtained = itemIds.length > 0 && itemIds.every(id => checked.has(id));

  return (
    <div className={[
      "rounded-xl border bg-surface print:rounded-none print:border-0 print:border-b print:border-gray-300 print:bg-transparent",
      allObtained ? "border-edge/50 opacity-60" : "border-edge",
    ].join(" ")}>
      <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-edge print:border-gray-200">
        <span className="inline-block text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border border-edge bg-void-alt text-muted print:bg-transparent print:text-gray-500 print:border-gray-400">
          Other
        </span>
        <span className={`font-semibold text-sm print:text-black ${allObtained ? "text-muted line-through" : "text-lavender"}`}>
          Other Source
        </span>
        <span className="ml-auto text-xs text-muted print:text-gray-500">
          {itemIds.length} piece{itemIds.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="px-4 py-2.5">
        <p className="text-[10px] text-muted mb-2 print:text-gray-400">
          Vendor · crafted · world drop · quest — source not in journal data
        </p>
        <div className="space-y-0.5">
          {itemIds.map(id => (
            <ItemRow
              key={id}
              itemId={id}
              info={farmMap.get(id)}
              isChecked={checked.has(id)}
              onToggle={onToggle}
              extraLocations={0}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function FarmingList({ outfit, charKey, charName }: FarmingListProps) {
  const [data,     setData]     = useState<FarmingListResponse | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [checked,  setChecked]  = useState<Set<number>>(new Set());
  const [copyDone, setCopyDone] = useState(false);

  // Extract kind:"item" entries from outfit
  const farmableEntries: [number, ItemInfo][] = [];
  for (const entry of Object.values(outfit)) {
    if (entry.kind === "item") {
      const e = entry as Extract<OutfitEntry, { kind: "item" }>;
      farmableEntries.push([e.itemId, { name: e.name, icon: e.icon }]);
    }
  }
  const farmMap = new Map<number, ItemInfo>(farmableEntries);
  const farmableIds = [...farmMap.keys()].sort((a, b) => a - b);
  const farmableKey = farmableIds.join(",");

  // Load checkbox state
  useEffect(() => {
    setChecked(loadChecked(charKey));
  }, [charKey]);

  // Fetch farming list when outfit's farmable items change
  useEffect(() => {
    if (farmableIds.length === 0) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/farming-list?items=${farmableKey}`)
      .then(r => r.ok ? r.json() as Promise<FarmingListResponse> : Promise.reject(r.status))
      .then(d => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(() => { if (!cancelled) { setError("Could not load farming list"); setLoading(false); } });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farmableKey]);

  const toggleCheck = useCallback((itemId: number) => {
    setChecked(prev => {
      const next = new Set(prev);
      next.has(itemId) ? next.delete(itemId) : next.add(itemId);
      saveChecked(charKey, next);
      return next;
    });
  }, [charKey]);

  const handleCopy = useCallback(() => {
    if (!data) return;
    navigator.clipboard.writeText(buildCopyText(data, farmMap, checked, charName))
      .then(() => { setCopyDone(true); setTimeout(() => setCopyDone(false), 2000); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, farmableKey, checked, charName]);

  // ── Instance count map — how many instances each item appears in ──────────
  const instanceCountForItem = new Map<number, number>();
  if (data) {
    for (const id of farmableIds) {
      instanceCountForItem.set(
        id,
        data.instances.filter(inst => inst.encounters.some(e => e.itemIds.includes(id))).length
      );
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  // Empty state
  if (farmableIds.length === 0) {
    return (
      <div className="rounded-xl border border-edge bg-surface px-6 py-10 text-center space-y-2 print:hidden">
        <p className="text-sm font-semibold text-lavender">No pieces selected yet</p>
        <p className="text-xs text-muted leading-relaxed">
          Browse slots in the item browser above and click pieces you&rsquo;re chasing.<br />
          They&rsquo;ll appear here grouped by where to farm them.
        </p>
      </div>
    );
  }

  const obtained = checked.size > 0
    ? [...farmMap.keys()].filter(id => checked.has(id)).length
    : 0;

  return (
    <div className="space-y-4">

      {/* ── Screen: action bar ── */}
      <div className="flex items-center justify-between gap-3 print:hidden">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted">Farming List</p>
          {data && (
            <p className="text-[11px] text-muted mt-0.5">
              {farmableIds.length} piece{farmableIds.length !== 1 ? "s" : ""}
              {obtained > 0 && ` · ${obtained} obtained`}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            disabled={!data}
            className="rounded border border-edge px-3 py-1.5 text-xs text-muted hover:border-accent/60 hover:text-lavender disabled:opacity-40 transition-colors"
          >
            {copyDone ? "Copied ✓" : "Copy list"}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded border border-edge px-3 py-1.5 text-xs text-muted hover:border-accent/60 hover:text-lavender transition-colors"
          >
            Print
          </button>
        </div>
      </div>

      {/* ── Print: header (hidden on screen) ── */}
      <div className="hidden print:block mb-4">
        <h1 className="text-2xl font-bold text-black">
          {charName ? `${charName} — Farming List` : "MogVault Farming List"}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {farmableIds.length} pieces to farm
          {obtained > 0 ? ` · ${obtained} already obtained` : ""}
        </p>
      </div>

      {/* ── Loading skeleton ── */}
      {loading && (
        <div className="space-y-3 print:hidden">
          {[1, 2].map(i => (
            <div key={i} className="h-28 animate-pulse rounded-xl border border-edge bg-void-alt" />
          ))}
        </div>
      )}

      {/* ── Error ── */}
      {error && <p className="text-xs text-red-400 print:hidden">{error}</p>}

      {/* ── List ── */}
      {data && !loading && (
        <div className="space-y-3">
          {data.instances.map(inst => (
            <InstanceBlock
              key={inst.instanceId}
              instance={inst}
              farmMap={farmMap}
              checked={checked}
              onToggle={toggleCheck}
              instanceCountForItem={instanceCountForItem}
            />
          ))}
          {data.otherItemIds.length > 0 && (
            <OtherSourceBlock
              itemIds={data.otherItemIds}
              farmMap={farmMap}
              checked={checked}
              onToggle={toggleCheck}
            />
          )}
          {data.instances.length === 0 && data.otherItemIds.length === 0 && (
            <p className="py-6 text-center text-sm text-muted print:hidden">
              No source data found for these items.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
