"use client";

import { useState } from "react";
import { formatClock } from "../game/hud-model";
import { shareText, type RunSummary } from "../lib/results";

/**
 * Shares a finished run: the phone's share sheet where there is one, otherwise the text and
 * a link to the channel go to the clipboard.
 */
export function ShareRun({
  summary,
  channel,
  driving,
  className,
}: {
  summary: RunSummary;
  channel: number;
  driving: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const text = shareText(summary, channel, driving, formatClock);
    const url = `${window.location.origin}/c/${channel}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "SIRENRUN", text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      // The viewer closed the share sheet, or the clipboard is blocked: nothing to do.
    }
  };
  return (
    <button type="button" onClick={() => void share()} className={className}>
      {copied ? "Copied" : "Share"}
    </button>
  );
}
