"use client";

import { useState, useEffect, useRef, useCallback, FormEvent } from "react";
import type { CharacterRouteResponse } from "@/app/api/character/[realm]/[name]/route";
import type { ItemDisplayResponse } from "@/app/api/item/[id]/display/route";
import type { CollectionsResponse } from "@/app/api/character/[realm]/[name]/collections/route";
import { SLOT_DEFS, toRenderSlot } from "@/lib/slots";
import ItemBrowser from "./ItemBrowser";
import FarmingList from "./FarmingList";
import RealmCombobox from "./RealmCombobox";

// ── Constants ─────────────────────────────────────────────────────────────────

const JQUERY_URL   = "https://code.jquery.com/jquery-3.7.1.min.js";
const VIEWER_URL   = "https://wow.zamimg.com/modelviewer/live/viewer/viewer.min.js";
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

export type OutfitEntry =
  | { kind: "item"; itemId: number; displayId: number; appearanceId: number | null; name: string; icon: string | null }
  | { kind: "hidden" };

export type Outfit = Record<number, OutfitEntry>;

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

// ── Sub-components ────────────────────────────────────────────────────────────

function Overlay({ children, dim = false }: { children: React.ReactNode; dim?: boolean }) {
  return (
    <div
      className={
        "absolute inset-0 flex items-center justify-center" +
        (dim ? " bg-void/70 backdrop-blur-sm" : "")
      }
    >
      {children}
    </div>
  );
}

function LoadingRing({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="h-6 w-6 rounded-full border-2 border-edge border-t-accent-bright animate-spin" />
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

// ── Feature cards (landing entrance) ─────────────────────────────────────────

function FeatureCard({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-edge bg-surface/60 p-4 backdrop-blur-sm">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-accent/25 bg-accent/10 text-accent-bright flex-shrink-0">
        {icon}
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-lavender">{title}</p>
        <p className="text-xs text-muted leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

// Inline SVG icons — 18×18, currentColor
const CharacterIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <circle cx="9" cy="5.5" r="2.5" />
    <path d="M2.5 16c0-3.31 2.91-6 6.5-6s6.5 2.69 6.5 6" />
  </svg>
);

const OutfitIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="6" height="6" rx="1" />
    <rect x="10" y="2" width="6" height="6" rx="1" />
    <rect x="2" y="10" width="6" height="6" rx="1" />
    <rect x="10" y="10" width="6" height="6" rx="1" />
  </svg>
);

const FarmIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 5l1.5 1.5L7.5 3" />
    <path d="M10 5h5M10 9.5h5M10 14h3" />
    <circle cx="4.5" cy="9.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="14" r="1" fill="currentColor" stroke="none" />
  </svg>
);

// ── Component ─────────────────────────────────────────────────────────────────

export default function CharacterViewer({ onModelReady }: CharacterViewerProps) {
  const [realmSlug, setRealmSlug] = useState("zuljin");
  const [charName,  setCharName]  = useState("demonkaz");
  const [phase,     setPhase]     = useState<Phase>("loading-deps");
  const [errorMsg,  setErrorMsg]  = useState<string | null>(null);
  const [meta,      setMeta]      = useState<CharacterRouteResponse["meta"] | null>(null);

  const [charKey,            setCharKey]            = useState<string | null>(null);
  const [outfit,             setOutfit]             = useState<Outfit>({});
  const [ownedAppearanceIds, setOwnedAppearanceIds] = useState<Set<number> | null>(null);

  const generateModelsRef = useRef<
    ((aspect: number, selector: string, character: object) => Promise<ViewerModel>) | null
  >(null);
  const modelRef     = useRef<ViewerModel | null>(null);
  const baseItemsRef = useRef<Record<number, number>>({});
  const stageRef     = useRef<HTMLDivElement>(null);

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
    setOwnedAppearanceIds(null);
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

      const stageW = stageRef.current?.clientWidth  ?? 800;
      const stageH = stageRef.current?.clientHeight ?? 620;
      const aspect = stageW / stageH;

      const viewerCharacter = {
        ...charData.character,
        items: charData.character.items.map(
          ([slot, displayId]) => [toRenderSlot(slot), displayId] as [number, number]
        ),
      };
      const model = await generateModelsRef.current(aspect, `#${CONTAINER_ID}`, viewerCharacter);
      modelRef.current = model;
      onModelReady?.(model);

      const newBaseItems: Record<number, number> = {};
      for (const [slot, displayId] of charData.character.items) {
        newBaseItems[slot] = displayId;
      }
      baseItemsRef.current = newBaseItems;

      const key   = `${realmSlug}/${nameSlug}`;
      const saved = loadSavedOutfit(key);
      for (const [slotStr, entry] of Object.entries(saved)) {
        const renderSlot = toRenderSlot(Number(slotStr));
        if (entry.kind === "item") {
          model.updateItemViewer(renderSlot, entry.displayId);
        } else if (entry.kind === "hidden") {
          model.updateItemViewer(renderSlot, 0);
        }
      }

      setCharKey(key);
      setOutfit(saved);
      setMeta(charData.meta);
      setPhase("loaded");

      fetch(
        `/api/character/${encodeURIComponent(realmSlug)}/${encodeURIComponent(nameSlug)}/collections`
      )
        .then(r => r.ok ? r.json() as Promise<CollectionsResponse> : null)
        .then(data => {
          if (data) setOwnedAppearanceIds(new Set(data.ownedAppearanceIds));
        })
        .catch(() => { /* non-fatal */ });
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
    modelRef.current.updateItemViewer(toRenderSlot(slot), data.displayId);
    const entry: OutfitEntry = {
      kind:         "item",
      itemId:       data.itemId,
      displayId:    data.displayId,
      appearanceId: data.appearanceId,
      name:         data.name,
      icon:         data.icon,
    };
    setOutfit(prev => {
      const next = { ...prev, [slot]: entry };
      persistOutfit(charKey, next);
      return next;
    });
  }, [charKey]);

  // ── Hide a slot ────────────────────────────────────────────────────────────
  const hideSlot = useCallback((slot: number) => {
    if (!modelRef.current || !charKey) return;
    modelRef.current.updateItemViewer(toRenderSlot(slot), 0);
    const entry: OutfitEntry = { kind: "hidden" };
    setOutfit(prev => {
      const next = { ...prev, [slot]: entry };
      persistOutfit(charKey, next);
      return next;
    });
  }, [charKey]);

  // ── Revert a slot ─────────────────────────────────────────────────────────
  const revertSlot = useCallback((slot: number) => {
    if (!modelRef.current || !charKey) return;
    const baseDisplayId = baseItemsRef.current[slot] ?? 0;
    modelRef.current.updateItemViewer(toRenderSlot(slot), baseDisplayId);
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
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 print:hidden">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="mv-realm" className="text-[10px] font-semibold uppercase tracking-widest text-muted">
            Realm
          </label>
          <RealmCombobox
            value={realmSlug}
            onChange={setRealmSlug}
            disabled={isBusy}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="mv-name" className="text-[10px] font-semibold uppercase tracking-widest text-muted">
            Character
          </label>
          <input
            id="mv-name"
            type="text"
            value={charName}
            onChange={e => setCharName(e.target.value)}
            placeholder="Character name"
            disabled={isBusy}
            className="w-44 rounded-lg border border-edge bg-void px-3 py-2 text-sm text-lavender placeholder:text-muted focus:border-accent focus:outline-none disabled:opacity-50 transition-colors"
          />
        </div>
        <button
          type="submit"
          disabled={isBusy}
          className="rounded-lg border border-accent px-6 py-2 text-sm font-semibold text-accent-bright hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-40 transition-all duration-300"
        >
          {phase === "loading-deps" ? "Initialising…" :
           phase === "fetching"     ? "Fetching…"     :
           phase === "rendering"    ? "Rendering…"    :
           "Load Character"}
        </button>
      </form>

      {/* Viewer stage */}
      <div
        ref={stageRef}
        className="relative overflow-hidden rounded-xl border border-edge print:hidden"
        style={{
          height: 620,
          // Two-layer stage lighting:
          //   1. Main ambient — centered on the character's body (≈40% down), even falloff
          //   2. Floor accent — small glow at the feet, echoes the platform div below
          // Avoids the top-dark/bottom-bright seam the old bottom-anchored gradient caused.
          background: [
            "radial-gradient(ellipse 62% 62% at 50% 42%, #1e0f35 0%, transparent 78%)",
            "radial-gradient(ellipse 32% 16% at 50% 95%, rgb(45 18 87 / 0.45) 0%, transparent 100%)",
            "#0d0010",
          ].join(", "),
        }}
      >
        <div id={CONTAINER_ID} className="h-full w-full" />

        {/* Subtle platform glow — visual anchor for the character */}
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 h-px w-80 opacity-0 transition-opacity duration-700"
          style={{
            opacity: phase === "loaded" ? 1 : 0,
            boxShadow: "0 0 70px 18px rgb(139 92 246 / 0.18)",
          }}
        />

        {/* Loading deps: quiet ring */}
        {phase === "loading-deps" && (
          <Overlay>
            <LoadingRing label="Initialising viewer…" />
          </Overlay>
        )}

        {/* Ready: entrance — feature cards */}
        {phase === "ready" && (
          <Overlay>
            <div className="flex w-full max-w-2xl flex-col items-center gap-8 px-8">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                Enter a realm and character name above to begin
              </p>
              <div className="grid w-full grid-cols-3 gap-4">
                <FeatureCard
                  icon={<CharacterIcon />}
                  title="Your real character"
                  desc="Your actual model — race, class, and customizations — loaded live from your profile."
                />
                <FeatureCard
                  icon={<OutfitIcon />}
                  title="Build your outfit"
                  desc="Browse by slot and preview any transmog piece on your character in real time."
                />
                <FeatureCard
                  icon={<FarmIcon />}
                  title="Farm the list"
                  desc="A focused checklist of exactly where each piece drops, grouped by instance."
                />
              </div>
            </div>
          </Overlay>
        )}

        {/* Fetching / rendering: dimmed overlay with spinner */}
        {(phase === "fetching" || phase === "rendering") && (
          <Overlay dim>
            <LoadingRing
              label={phase === "fetching" ? "Fetching character data…" : "Rendering 3D model…"}
            />
          </Overlay>
        )}

        {/* Error */}
        {phase === "error" && (
          <Overlay>
            <div className="flex flex-col items-center gap-4 px-8 text-center">
              <p className="text-sm font-medium text-accent-bright">
                {errorMsg ?? "Something went wrong."}
              </p>
              <button
                onClick={() => setPhase("ready")}
                className="rounded-lg border border-edge px-4 py-1.5 text-xs text-muted hover:border-accent/50 hover:text-lavender transition-colors"
              >
                Dismiss
              </button>
            </div>
          </Overlay>
        )}

        {/* Character meta — bottom-left pill */}
        {meta && phase === "loaded" && (
          <div className="absolute bottom-3 left-3 rounded-lg border border-edge/60 bg-void/80 px-3 py-1.5 text-xs text-muted backdrop-blur-sm">
            <span className="text-lavender font-medium">{meta.name}</span>
            <span className="mx-1.5 text-edge">·</span>
            {meta.realmName}
            <span className="mx-1.5 text-edge">·</span>
            {meta.raceName} {meta.specName} {meta.className}
          </div>
        )}
      </div>

      {/* Outfit chips */}
      {phase === "loaded" && Object.keys(outfit).length > 0 && (
        <div className="flex flex-wrap gap-1.5 print:hidden">
          {Object.entries(outfit).map(([slotStr, entry]) => {
            const slot    = Number(slotStr);
            const slotDef = SLOT_DEFS.find(s => s.viewerSlot === slot);
            const label   = slotDef?.label ?? `Slot ${slot}`;
            return (
              <div
                key={slot}
                className="flex items-center gap-1.5 rounded-full border border-edge bg-surface/60 px-2.5 py-1 text-xs"
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

      {/* Item browser */}
      {phase === "loaded" && (
        <div className="print:hidden">
          <ItemBrowser
            onApply={applyItem}
            onHide={hideSlot}
            onRevert={revertSlot}
            outfit={outfit}
            className={meta?.className ?? undefined}
            ownedAppearanceIds={ownedAppearanceIds}
          />
        </div>
      )}

      {/* Farming list */}
      {phase === "loaded" && charKey && (
        <div className="rounded-xl border border-edge bg-surface p-4 print:border-0 print:bg-transparent print:p-0">
          <FarmingList
            outfit={outfit}
            charKey={charKey}
            charName={meta?.name}
            ownedAppearanceIds={ownedAppearanceIds}
          />
        </div>
      )}
    </div>
  );
}
