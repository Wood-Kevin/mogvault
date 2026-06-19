import CharacterViewerClient from "@/components/CharacterViewerClient";

export default function Home() {
  return (
    <main className="min-h-screen bg-void">
      <div className="mx-auto max-w-5xl px-8 py-10 space-y-8">

        {/* Wordmark + value prop */}
        <header className="space-y-2 print:hidden">
          <h1
            className="text-5xl font-bold tracking-tight text-lavender"
            style={{
              textShadow:
                "0 0 28px rgb(139 92 246 / 0.6), 0 0 64px rgb(139 92 246 / 0.22)",
            }}
          >
            MogVault
          </h1>
          <p className="text-sm text-muted tracking-wide">
            Load your character &middot; Build a transmog set &middot; Get the farming checklist
          </p>
        </header>

        {/* App — character viewer, item browser, farming list */}
        <section>
          <CharacterViewerClient />
        </section>

      </div>
    </main>
  );
}
