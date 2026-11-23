import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-md flex-col items-center justify-center px-4 text-center">
      <p className="font-display text-sm font-semibold tracking-widest text-neon-pink uppercase">
        404
      </p>
      <h1 className="mt-1 font-display text-4xl font-extrabold italic">Wrong exit</h1>
      <p className="mt-2 text-sm text-muted">
        This page does not exist. Channels are CH-1 to CH-3.
      </p>
      <div className="mt-6 flex gap-3">
        <Link href="/lobby" className="btn-primary">
          See channels
        </Link>
        <Link
          href="/"
          className="rounded-md border border-white/25 px-4 py-2 text-sm font-semibold hover:border-white/50 hover:bg-white/5"
        >
          Home
        </Link>
      </div>
    </main>
  );
}
