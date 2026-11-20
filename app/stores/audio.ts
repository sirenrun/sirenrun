import { create } from "zustand";

const KEY = "sirenrun.muted";

function stored(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

interface AudioState {
  muted: boolean;
  toggle: () => void;
  /** Loads the stored choice; called after mount so server and client render the same. */
  restore: () => void;
}

/** Sound on or off, remembered per browser. */
export const useAudio = create<AudioState>((set, get) => ({
  muted: false,
  restore: () => set({ muted: stored() }),
  toggle: () => {
    const muted = !get().muted;
    try {
      window.localStorage.setItem(KEY, muted ? "1" : "0");
    } catch {
      // Private mode or blocked storage: the choice lasts for this page only.
    }
    set({ muted });
  },
}));
