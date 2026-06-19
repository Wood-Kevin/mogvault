// Server component — no interactivity needed.

export default function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-edge/40 bg-void py-10 print:hidden">
      <div className="mx-auto max-w-5xl px-8 space-y-4">

        {/* Brand row */}
        <div className="flex items-center justify-between">
          <span
            className="text-sm font-bold tracking-tight text-lavender"
            style={{ textShadow: "0 0 14px rgb(139 92 246 / 0.45)" }}
          >
            MogVault
          </span>
          <a
            href="https://github.com/Wood-Kevin/mogvault"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted transition-colors hover:text-accent-bright"
          >
            GitHub
          </a>
        </div>

        {/* Project tagline */}
        <p className="text-xs text-muted">
          Non-commercial fan project &mdash; free to use, no ads, no tracking.
        </p>

        {/* Blizzard Fan Content Policy disclaimer */}
        <p className="text-xs text-muted leading-relaxed max-w-3xl">
          MogVault is unofficial Fan Content permitted under the{" "}
          <a
            href="https://www.blizzard.com/en-us/legal/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 transition-colors hover:text-lavender"
          >
            Fan Content Policy
          </a>
          . Not approved/endorsed by Blizzard. Portions of the materials used are
          property of Blizzard Entertainment. &copy;&nbsp;Blizzard Entertainment, Inc.
          World of Warcraft and Blizzard Entertainment are trademarks or registered
          trademarks of Blizzard Entertainment, Inc. in the U.S. and/or other countries.
          Character and item data sourced from the Blizzard Battle.net Game Data API.
        </p>

      </div>
    </footer>
  );
}
