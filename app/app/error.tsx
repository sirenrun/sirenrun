"use client";

import Link from "next/link";

/**
 * Shown when a page crashes while rendering, instead of a blank screen. Funds are onchain and
 * unaffected; a retry re-renders the page.
 */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-md flex-col items-center justify-center px-4 text-center">
      <h1 className="font-display text-4xl font-extrabold italic">Spun out</h1>
      <p className="mt-2 text-sm text-muted">
        Something broke on this page. Your balance and positions are onchain and safe.
      </p>
      <div className="mt-6 flex gap-3">
        <button type="button" onClick={reset} className="btn-primary">
          Try again
        </button>
        <Link
          href="/lobby"
          className="rounded-md border border-white/25 px-4 py-2 text-sm font-semibold hover:border-white/50 hover:bg-white/5"
        >
          Channels
        </Link>
      </div>
    </main>
  );
}
