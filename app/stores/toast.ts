import { create } from "zustand";

export type ToastTone = "good" | "bad" | "info";

export interface Toast {
  id: number;
  text: string;
  tone: ToastTone;
}

interface ToastState {
  toasts: Toast[];
  push: (text: string, tone?: ToastTone) => void;
  dismiss: (id: number) => void;
}

const LIFETIME_MS = 5000;
const MAX = 4;
let nextId = 1;

/** Short notices (fills, payouts, errors) that clear themselves. */
export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (text, tone = "info") => {
    const id = nextId++;
    set({ toasts: [...get().toasts, { id, text, tone }].slice(-MAX) });
    setTimeout(() => get().dismiss(id), LIFETIME_MS);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));
