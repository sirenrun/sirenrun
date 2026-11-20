import { create } from "zustand";
import type { ClipRecorder } from "../game/clip";

interface ClipState {
  /** Recording now (a run is on screen). */
  recorder: ClipRecorder | null;
  /** The clip kept when the last run ended, ready to save after the channel goes idle. */
  last: { blob: Blob; name: string } | null;
  saving: boolean;
  setRecorder: (recorder: ClipRecorder | null) => void;
  keep: (blob: Blob, name: string) => void;
  /** Downloads the last 10 to 20 seconds as `name`, or the kept clip once the run is over. */
  save: (name: string) => Promise<void>;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const useClip = create<ClipState>((set, get) => ({
  recorder: null,
  last: null,
  saving: false,
  setRecorder: (recorder) => set({ recorder }),
  keep: (blob, name) => set({ last: { blob, name } }),
  save: async (name) => {
    const { recorder, last, saving } = get();
    if (saving) return;
    const pending = recorder?.take() ?? null;
    if (pending === null) {
      if (last !== null) download(last.blob, last.name);
      return;
    }
    set({ saving: true });
    try {
      const blob = await pending;
      set({ last: { blob, name } });
      download(blob, name);
    } finally {
      set({ saving: false });
    }
  },
}));
