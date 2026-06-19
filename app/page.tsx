import CharacterViewerClient from "@/components/CharacterViewerClient";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

export default function Home() {
  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-5xl px-8 pb-16">

        {/* Hero — tagline beneath the header */}
        <section className="py-8 print:hidden">
          <p className="text-sm text-muted tracking-wide">
            Load your character &middot; Build a transmog set &middot; Get the farming checklist
          </p>
        </section>

        {/* App — character viewer, item browser, farming list */}
        <section>
          <CharacterViewerClient />
        </section>

      </main>

      <SiteFooter />
    </>
  );
}
