import { create } from "zustand";

export interface WinPop {
  id: number;
  /** Already formatted, e.g. "+$9.80". */
  amount: string;
  /** What paid, e.g. "RIDE 30s". */
  label: string;
}

interface WinPopState {
  pops: WinPop[];
  push: (amount: string, label: string) => void;
}

const LIFETIME_MS = 2600;
const MAX = 3;
let nextId = 1;

/** Big "+$X" bursts when one of the viewer's positions pays out. */
export const useWinPops = create<WinPopState>((set, get) => ({
  pops: [],
  push: (amount, label) => {
    const id = nextId++;
    set({ pops: [...get().pops, { id, amount, label }].slice(-MAX) });
    setTimeout(() => set({ pops: get().pops.filter((p) => p.id !== id) }), LIFETIME_MS);
  },
}));
