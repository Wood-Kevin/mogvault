"use client";

import dynamic from "next/dynamic";

function ViewerSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex gap-3">
        <div className="h-9 w-40 rounded-lg bg-surface animate-pulse" />
        <div className="h-9 w-44 rounded-lg bg-surface animate-pulse" />
        <div className="h-9 w-32 rounded-lg bg-surface animate-pulse" />
      </div>
      <div className="h-[620px] rounded-xl border border-edge bg-void-alt" />
    </div>
  );
}

// wow-model-viewer is browser-only (needs jQuery + ZamModelViewer globals).
// ssr: false must live in a "use client" file.
const CharacterViewer = dynamic(
  () => import("@/components/CharacterViewer"),
  { ssr: false, loading: () => <ViewerSkeleton /> }
);

export default function CharacterViewerClient() {
  return <CharacterViewer />;
}
