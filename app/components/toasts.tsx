"use client";

import { useToasts } from "../stores/toast";

const TONE = {
  good: "border-neon-pink/40",
  bad: "border-amber/50",
  info: "border-white/15",
} as const;

/** Stack of short notices under the header, newest last. */
export function Toasts() {
  const { toasts, dismiss } = useToasts();
  return (
    <div
      className="pointer-events-none fixed right-4 top-20 z-50 flex w-72 flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className={`pointer-events-auto rounded-lg border bg-bg/90 px-3 py-2 text-left text-sm backdrop-blur ${TONE[t.tone]}`}
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}
