"use client";

import { useState } from "react";

export interface DayValue {
  day: string;
  value: number;
  /** Formatted value for the tooltip and table, e.g. "12" or "$4.20". */
  label: string;
}

const W = 560;
const H = 140;
const PAD_BOTTOM = 18;
const GAP = 2;

/** "2026-11-23" -> "Nov 23" */
function shortDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * One series per day as thin bars anchored to the baseline, rounded at the data end only.
 * Hovering (or focusing) a day shows its value; a table carries the same data for screen
 * readers. Single series, so the title names it and there is no legend.
 */
export function DayBars({
  title,
  colour,
  data,
}: {
  title: string;
  colour: string;
  data: DayValue[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const slot = W / Math.max(1, data.length);
  const barW = Math.max(2, slot - GAP * 2);
  const plotH = H - PAD_BOTTOM;
  const active = hover === null ? null : data[hover];

  return (
    <figure className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold tracking-widest text-muted uppercase">{title}</span>
        <span className="text-sm tabular-nums text-text" aria-live="polite">
          {active !== null && active !== undefined
            ? `${shortDay(active.day)}: ${active.label}`
            : `${data.at(-1)?.label ?? "0"} today`}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 h-36 w-full"
        role="img"
        aria-label={`${title}, last ${data.length} days`}
        onMouseLeave={() => setHover(null)}
      >
        <line
          x1="0"
          x2={W}
          y1={plotH + 0.5}
          y2={plotH + 0.5}
          stroke="currentColor"
          className="text-white/15"
        />
        {data.map((d, i) => {
          const h = d.value === 0 ? 0 : Math.max(3, (d.value / max) * (plotH - 6));
          const x = i * slot + GAP;
          const y = plotH - h;
          const r = Math.min(4, barW / 2, h);
          return (
            <g key={d.day}>
              {/* Hit target: the whole column, bigger than the bar. */}
              <rect
                x={i * slot}
                y={0}
                width={slot}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                tabIndex={0}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                aria-label={`${shortDay(d.day)}: ${d.label}`}
              />
              {h > 0 && (
                <path
                  pointerEvents="none"
                  fill={colour}
                  opacity={hover === null || hover === i ? 1 : 0.45}
                  d={`M${x},${plotH} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${plotH} Z`}
                />
              )}
            </g>
          );
        })}
        {[0, Math.floor((data.length - 1) / 2), data.length - 1].map((i) => {
          const d = data[i];
          if (d === undefined) return null;
          return (
            <text
              key={`l${i}`}
              x={i * slot + slot / 2}
              y={H - 4}
              textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}
              className="fill-[var(--color-muted)] text-[11px]"
            >
              {shortDay(d.day)}
            </text>
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.day}>
              <td>{d.day}</td>
              <td>{d.label}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
