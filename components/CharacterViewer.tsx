"use client";

import { useState, useEffect, useRef, useCallback, FormEvent } from "react";
import type { CharacterRouteResponse } from "@/app/api/character/[realm]/[name]/route";
import type { ItemDisplayResponse } from "@/app/api/item/[id]/display/route";
import { SLOT_DEFS } from "@/lib/slots";
import ItemBrowser from "./ItemBrowser";
import RealmCombobox from "./RealmCombobox";

// ── Constants ─────────────────────────────────────────────────────────────────

const JQUERY_URL   = "https://code.jquery.com/jquery-3.7.1.min.js";
const VIEWER_URL   = "https://wow.zamimg.com/modelviewer/live/viewer/viewer.min.js";
// CORS: wow.zamimg.com returns 403 for cross-origin fetch() from non-Wowhead origins.
// All model asset fetches route through our proxy (same-origin from the browser).
const CONTENT_PATH = "/api/modelviewer/live/";
const CONTAINER_ID = "mv-character-container";

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase =
  | "loading-deps"
  | "ready"
  | "fetching"
  | "rendering"
  | "loaded"
  | "error";

export interface ViewerModel {
  updateItemViewer: (slot: number, displayId: number, enchant?: number) => void;
}

export interface CharacterViewerProps {
  onModelReady?: (model: ViewerModel) => void;
}

// Discriminated union: three states per slot.
//   "item"   — user applied a transmog override
//   "hidden" — user chose to show the slot empty (bare model)
//   absent   — character's original equipped appearance (no override stored)
export type OutfitEntry =
  | { kind: "item";   itemId: number; displayId: number; name: string; icon: string | null }
  | { kind: "hidden" };

export type Outfit = Record<number, OutfitEntry>; // keyed by viewer slot

// ── localStorage helpers ──────────────────────────────────────────────────────

function outfitStorageKey(charKey: string) {
  return `mogvault-outfit-${charKey}`;
}
function loadSavedOutfit(charKey: string): Outfit {
  try {
    const raw = localStorage.getItem(outfitStorageKey(charKey));
    return raw ? (JSON.parse(raw) as Outfit) : {};
  } catch {
    return {};
  }
}
function persistOutfit(charKey: string, outfit: Outfit) {
  try {
    localStorage.setItem(outfitStorageKey(charKey), JSON.stringify(outfit));
  } catch {}
}

// ── Script loader ─────────────────────────────────────────────────────────────

function loadScript(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) { resolve(); return; }
    const el = document.createElement("script");
    el.id  = id;
    el.src = src;
    el.onload  = () => resolve();
    el.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(el);
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CharacterViewer({ onModelReady }: CharacterViewerProps) {
  const [realmSlug, setRealmSlug] = useState("zuljin"); // canonical slug from combobox
  const [charName,  setCharName]  = useState("demonkaz");
  const [phase,     setPhase]     = useState<Phase>("loading-deps");
  const [errorMsg,  setErrorMsg]  = useState<string | null>(null);
  const [meta,      setMeta]      = useState<CharacterRouteResponse["meta"] | null>(null);

  // Outfit state — keyed by viewer slot
  const [charKey, setCharKey] = useState<string | null>(null);
  const [outfit,  setOutfit]  = useState<Outfit>({});

  const generateModelsRef = useRef<
    ((aspect: number, selector: string, character: object) => Promise<ViewerModel>) | null
  >(null);
  const modelRef     = useRef<ViewerModel | null>(null);
  // Base items from the character API: viewer slot → displayId of the character's
  // original equipped appearance. Stored in a ref so revertSlot can read it
  // without triggering re-renders or stale-closure issues.
  const baseItemsRef = useRef<Record<number, number>>({});
  // Measured before generateModels so canvas dimensions match the visible area.
  const stageRef = useRef<HTMLDivElement>(null);

  // ── Bootstrap scripts ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        await loadScript(JQUERY_URL, "mogvault-jquery");
        await loadScript(VIEWER_URL, "mogvault-zamviewer");
        (window as Window & { CONTENT_PATH?: string }).CONTENT_PATH = CONTENT_PATH;
        const mod = await import("wow-model-viewer");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        generateModelsRef.current = (mod as any).generateModels;
        if (!cancelled) setPhase("ready");
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : "Failed to initialise viewer.");
          setPhase("error");
        }
      }
    }
    bootstrap();
    return () => { cancelled = true; };
  }, []);

  // ── Load character ─────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async (e?: FormEvent) => {
    e?.preventDefault();
    if (!generateModelsRef.current) return;
    if (phase === "loading-deps" || phase === "fetching" || phase === "rendering") return;

    const nameSlug = charName.trim().toLowerCase();
    if (!realmSlug || !nameSlug) return;

    setPhase("fetching");
    setErrorMsg(null);
    setMeta(null);
    setOutfit({});
    setCharKey(null);
    baseItemsRef.current = {};

    let charData: CharacterRouteResponse;
    try {
      const res = await fetch(
        `/api/character/${encodeURIComponent(realmSlug)}/${encodeURIComponent(nameSlug)}`
      );
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.message ?? "Character not found.");
        setPhase("error");
        return;
      }
      charData = json as CharacterRouteResponse;
    } catch {
      setErrorMsg("Network error — could not reach the character API.");
      setPhase("error");
      return;
    }

    setPhase("rendering");

    try {
      const container = document.getElementById(CONTAINER_ID);
      if (container) container.innerHTML = "";

      // Aspect = stage px width / px height so the canvas matches the visible area.
      const stageW = stageRef.current?.clientWidth  ?? 800;
      const stageH = stageRef.current?.clientHeight ?? 620;
      const aspect = stageW / stageH;

      const model = await generateModelsRef.current(aspect, `#${CONTAINER_ID}`, charData.character);
      modelRef.current = model;
      onModelReady?.(model);

      // Store the character's original items so revert can restore them.
      const newBaseItems: Record<number, number> = {};
      for (const [slot, displayId] of charData.character.items) {
        newBaseItems[slot] = displayId;
      }
      baseItemsRef.current = newBaseItems;

      // Re-apply any saved outfit overrides for this character.
      const key   = `${realmSlug}/${nameSlug}`;
      const saved = loadSavedOutfit(key);
      for (const [slotStr, entry] of Object.entries(saved)) {
        if (entry.kind === "item") {
          model.updateItemViewer(Number(slotStr), entry.displayId);
        } else if (entry.kind === "hidden") {
          model.updateItemViewer(Number(slotStr), 0);
        }
      }

      setCharKey(key);
      setOutfit(saved);
      setMeta(charData.meta);
      setPhase("loaded");
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Model generation failed — check browser console."
      );
      setPhase("error");
    }
  }, [phase, realmSlug, charName, onModelReady]);

  // ── Apply item override ────────────────────────────────────────────────────
  const applyItem = useCallback((slot: number, data: ItemDisplayResponse) => {
    if (!modelRef.current || !charKey) return;
    modelRef.current.updateItemViewer(slot, data.displayId);
    const entry: OutfitEntry = {
      kind:      "item",
      itemId:    data.itemId,
      displayId: data.displayId,
      name:      data.name,
      icon:      data.icon,
    };
    setOutfit(prev => {
      const next = { ...prev, [slot]: entry };
      persistOutfit(charKey, next);
      return next;
    });
  }, [charKey]);

  // ── Hide a slot (bare model) ───────────────────────────────────────────────
  // Passes displayId=0 to updateItemViewer, which clears the current item;
  // the viewer's attempt to load display 0 fails gracefully and leaves the slot empty.
  const hideSlot = useCallback((slot: number) => {
    if (!modelRef.current || !charKey) return;
    modelRef.current.updateItemViewer(slot, 0);
    const entry: OutfitEntry = { kind: "hidden" };
    setOutfit(prev => {
      const next = { ...prev, [slot]: entry };
      persistOutfit(charKey, next);
      return next;
    });
  }, [charKey]);

  // ── Revert a slot to base (or to empty if character had nothing there) ─────
  const revertSlot = useCallback((slot: number) => {
    if (!modelRef.current || !charKey) return;
    const baseDisplayId = baseItemsRef.current[slot] ?? 0;
    modelRef.current.updateItemViewer(slot, baseDisplayId);
    setOutfit(prev => {
      const next = { ...prev };
      delete next[slot];
      persistOutfit(charKey, next);
      return next;
    });
  }, [charKey]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const isBusy = phase === "loading-deps" || phase === "fetching" || phase === "rendering";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Character input form */}
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="mv-realm" className="text-xs uppercase tracking-widest text-muted">
            Realm
          </label>
          <RealmCombobox
            value={realmSlug}
            onChange={setRealmSlug}
            disabled={isBusy}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="mv-name" className="text-xs uppercase tracking-widest text-muted">
            Character
          </label>
          <input
            id="mv-name"
            type="text"
            value={charName}
            onChange={e => setCharName(e.target.value)}
            placeholder="demonkaz"
            disabled={isBusy}
            className="w-44 rounded-lg border border-edge bg-void px-3 py-2 text-sm text-lavender placeholder:text-muted focus:border-accent focus:outline-none disabled:opacity-50 transition-colors"
          />
        </div>
        <button
          type="submit"
          disabled={isBusy}
          className="rounded-lg border border-accent px-5 py-2 text-sm font-semibold text-accent-bright transition-shadow duration-300 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-40"
        >
          {phase === "loading-deps" ? "Initialising…" :
           phase === "fetching"     ? "Fetching…"     :
           phase === "rendering"    ? "Rendering…"    :
           "Load Character"}
        </button>
        {phase === "loading-deps" && (
          <span className="self-end pb-2 text-xs text-muted">Loading viewer scripts…</span>
        )}
      </form>

      {/* Viewer stage */}
      <div
        ref={stageRef}
        className="relative overflow-hidden rounded-xl border border-edge bg-void-alt"
        style={{ height: 620 }}
      >
        <div id={CONTAINER_ID} className="h-full w-full" />

        {(phase === "loading-deps" || phase === "ready") && (
          <Overlay>
            {phase === "loading-deps"
              ? <PulseText>Initialising viewer…</PulseText>
              : <p className="text-sm text-muted">Enter a character name and realm above.</p>}
          </Overlay>
        )}
        {phase === "fetching" && (
          <Overlay dim><PulseText>Fetching character data…</PulseText></Overlay>
        )}
        {phase === "rendering" && (
          <Overlay dim><PulseText>Rendering 3D model…</PulseText></Overlay>
        )}
        {phase === "error" && (
          <Overlay>
            <div className="flex flex-col items-center gap-4 px-8 text-center">
              <span className="text-sm font-medium text-accent-bright">
                {errorMsg ?? "Something went wrong."}
              </span>
              <button
                onClick={() => setPhase("ready")}
                className="rounded-lg border border-edge px-4 py-1.5 text-xs text-muted hover:border-accent hover:text-accent-bright transition-colors"
              >
                Dismiss
              </button>
            </div>
          </Overlay>
        )}

        {meta && phase === "loaded" && (
          <div className="absolute bottom-3 left-3 rounded-lg border border-edge bg-void/75 px-3 py-1.5 text-xs text-muted backdrop-blur-sm">
            {meta.name} &middot; {meta.realmName} &middot; {meta.raceName} {meta.specName} {meta.className}
          </div>
        )}
      </div>

      {/* Outfit chips — one per active override or hidden slot */}
      {phase === "loaded" && Object.keys(outfit).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(outfit).map(([slotStr, entry]) => {
            const slot     = Number(slotStr);
            const slotDef  = SLOT_DEFS.find(s => s.viewerSlot === slot);
            const label    = slotDef?.label ?? `Slot ${slot}`;
            return (
              <div
                key={slot}
                className="flex items-center gap-1.5 rounded-full border border-edge bg-void px-2.5 py-1 text-xs"
              >
                {entry.kind === "item" && entry.icon && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={entry.icon} alt="" className="h-4 w-4 rounded flex-shrink-0" />
                )}
                <span className="text-muted">{label}:</span>
                <span className={`max-w-[140px] truncate ${
                  entry.kind === "hidden" ? "italic text-muted" : "text-lavender"
                }`}>
                  {entry.kind === "hidden" ? "Hidden" : entry.name}
                </span>
                <button
                  onClick={() => revertSlot(slot)}
                  title={entry.kind === "hidden" ? "Unhide slot" : "Revert to original"}
                  className="ml-0.5 text-muted hover:text-accent-bright transition-colors leading-none"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Item browser — shown after character loads */}
      {phase === "loaded" && (
        <ItemBrowser
          onApply={applyItem}
          onHide={hideSlot}
          onRevert={revertSlot}
          outfit={outfit}
        />
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Overlay({ children, dim = false }: { children: React.ReactNode; dim?: boolean }) {
  return (
    <div
      className={
        "absolute inset-0 flex items-center justify-center" +
        (dim ? " bg-void-alt/80 backdrop-blur-sm" : "")
      }
    >
      {children}
    </div>
  );
}

function PulseText({ children }: { children: React.ReactNode }) {
  return <p className="animate-pulse text-sm text-muted">{children}</p>;
}
