"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useArena } from "../stores/arena";

const Scene = dynamic(() => import("../game/Scene"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 animate-pulse bg-white/[0.02]" aria-hidden />,
});

const STATUS_TEXT = {
  idle: "Waiting for a driver",
  staging: "Staging",
  live: "Live",
  settled: "Run over",
} as const;

export function Channel({ arena }: { arena: number }) {
  const connect = useArena((s) => s.connect);
  const status = useArena((s) => s.status);
  const error = useArena((s) => s.error);

  useEffect(() => connect(arena), [arena, connect]);

  return (
    <main className="relative h-[calc(100dvh-4rem)] w-full overflow-hidden">
      <Scene className="absolute inset-0" />
      <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 text-sm">
        <span className="rounded bg-black/50 px-2 py-1 font-semibold tracking-wide">
          CH-{arena + 1}
        </span>
        <span className="rounded bg-black/50 px-2 py-1 text-muted" role="status">
          {error !== null
            ? "Connection problem"
            : status === null
              ? "Connecting…"
              : STATUS_TEXT[status]}
        </span>
      </div>
      {error !== null && (
        <div className="absolute inset-x-0 bottom-6 mx-auto w-fit rounded-md bg-black/70 px-4 py-2 text-sm text-amber">
          {error}{" "}
          <button type="button" onClick={() => connect(arena)} className="ml-2 underline">
            Retry
          </button>
        </div>
      )}
    </main>
  );
}
