import CharacterViewerClient from "@/components/CharacterViewerClient";

export default function Home() {
  return (
    <main className="min-h-screen bg-void px-8 py-10">
      <div className="mx-auto max-w-5xl space-y-10">

        {/* Header */}
        <div className="space-y-3">
          <h1 className="text-5xl font-bold tracking-wide text-lavender">MogVault</h1>
          <p className="text-base text-muted">
            Load your character. Build a transmog set. Get the farming list.
          </p>
        </div>

        {/* Character viewer + item browser */}
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-widest text-muted">Character</h2>
          <CharacterViewerClient />
        </section>

      </div>
    </main>
  );
}
