"use client";

import { formatTokenAmount, parseTokenAmount } from "@sirenrun/sdk";
import { useState, type FormEvent } from "react";

/** A tUSDC amount field with a Max shortcut and a submit button. */
export function AmountForm(props: {
  label: string;
  max: bigint;
  busy: boolean;
  onSubmit: (amount: bigint) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const [invalid, setInvalid] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    let amount: bigint;
    try {
      amount = parseTokenAmount(text);
    } catch {
      setInvalid("enter an amount like 25 or 12.5");
      return;
    }
    if (amount <= 0n) return setInvalid("enter an amount above 0");
    if (amount > props.max) return setInvalid(`at most ${formatTokenAmount(props.max)} tUSDC`);
    setInvalid(null);
    if (await props.onSubmit(amount)) setText("");
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-1">
      <div className="flex gap-2">
        <label className="sr-only" htmlFor={`amount-${props.label}`}>
          {props.label} amount
        </label>
        <input
          id={`amount-${props.label}`}
          inputMode="decimal"
          placeholder="0.00"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full min-w-0 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm tabular-nums outline-none focus:border-neon-cyan/60"
        />
        <button
          type="button"
          onClick={() => setText(formatTokenAmount(props.max))}
          className="rounded-md px-2 text-xs text-muted hover:text-text"
        >
          Max
        </button>
        <button
          type="submit"
          disabled={props.busy || props.max === 0n}
          className="shrink-0 rounded-md bg-neon-pink px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
        >
          {props.label}
        </button>
      </div>
      {invalid !== null && <p className="text-xs text-amber">{invalid}</p>}
    </form>
  );
}
